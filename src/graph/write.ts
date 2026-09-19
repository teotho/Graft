/**
 * Serialize a {@link GraphV1} to `<contextDir>/.graph/wiring.json`.
 *
 * The wiring graph lives in a hidden `.graph/` subdir because it is machine-only:
 * the agent never greps or reads it — it reaches the wiring data through the
 * per-file markdown cards (grep) and the `ask` tool (edge traversal). Output is
 * sorted (nodes by id, edges by source/relation/target) and carries no
 * timestamps, so rebuilding an unchanged repo produces a byte-identical file and
 * git diffs stay minimal.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EdgeV1, GraphV1, NodeV1 } from "./types.js";
import { assertRepoRelativePath } from "../util/paths.js";
import { isBuildProvenance } from "./provenance.js";
import { RELATIONS } from "./ontology.js";

/** Hidden subdir under the context dir that holds machine-only graph artifacts. */
export const GRAPH_DIR = ".graph";
export const GRAPH_FILE = "wiring.json";

/** Absolute path to the wiring graph for a context dir: `<dir>/.graph/wiring.json`. */
export function wiringPath(outDir: string): string {
  return join(outDir, GRAPH_DIR, GRAPH_FILE);
}

/**
 * Read an existing wiring graph for use as the Tier-2 cache. Returns null when the
 * file is absent or unparseable (a fresh build, or a corrupt file we'll replace).
 */
export function readGraph(path: string): GraphV1 | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const raw = parsed?.meta ? parsed : parsed?.version === 1
      ? {
          meta: {
            version: 1,
            nodeCount: Array.isArray(parsed.nodes) ? parsed.nodes.length : -1,
            edgeCount: Array.isArray(parsed.edges) ? parsed.edges.length : -1,
            languages: [],
          },
          nodes: parsed.nodes,
          edges: parsed.edges,
        }
      : parsed;
    return isGraphV1(raw) ? raw : null;
  } catch {
    return null;
  }
}

function isGraphV1(value: unknown): value is GraphV1 {
  if (!value || typeof value !== "object") return false;
  const graph = value as Partial<GraphV1>;
  const meta = graph.meta as GraphV1["meta"] | undefined;
  if (!meta || meta.version !== 1 || !Number.isInteger(meta.nodeCount) || !Number.isInteger(meta.edgeCount) ||
      !Array.isArray(meta.languages) || !meta.languages.every((v) => typeof v === "string") ||
      !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) ||
      meta.nodeCount !== graph.nodes.length || meta.edgeCount !== graph.edges.length) return false;
  if (meta.provenance !== undefined && !isBuildProvenance(meta.provenance)) return false;
  if (meta.buildDigest !== undefined && !/^[a-f0-9]{64}$/.test(meta.buildDigest)) return false;
  if (meta.scopes !== undefined && (!Array.isArray(meta.scopes) || !meta.scopes.every((scope) => {
    try {
      if (!scope || typeof scope.prefix !== "string" || typeof scope.label !== "string" || !Array.isArray(scope.markers)) return false;
      if (scope.prefix) assertRepoRelativePath(scope.prefix, "graph scope prefix");
      return scope.markers.every((marker) => typeof marker === "string");
    } catch { return false; }
  }))) return false;

  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string" || typeof node.name !== "string" || typeof node.path !== "string" ||
        typeof node.kind !== "string" || typeof node.span !== "string" || typeof node.exported !== "boolean" ||
        typeof node.origin !== "string" || typeof node.body_hash !== "string" ||
        typeof node.summary_state !== "string" || ids.has(node.id)) return false;
    try { assertRepoRelativePath(node.path, "graph node path"); } catch { return false; }
    ids.add(node.id);
  }
  for (const edge of graph.edges) {
    if (!edge || typeof edge.source !== "string" || typeof edge.target !== "string" ||
        typeof edge.relation !== "string" || !RELATIONS.has(edge.relation as EdgeV1["relation"]) ||
        typeof edge.confidence !== "string" || !ids.has(edge.source)) return false;
  }
  return true;
}

export function writeGraph(graph: GraphV1, outDir: string): string {
  const compatible = graph.meta ? graph : {
    meta: {
      version: 1 as const,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      languages: [],
    },
    nodes: graph.nodes,
    edges: graph.edges,
  };
  const sorted: GraphV1 = {
    ...compatible,
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)).map(stripBodyText),
    edges: [...graph.edges].sort(edgeOrder),
  };
  const path = wiringPath(outDir);
  mkdirSync(dirname(path), { recursive: true });
  // Atomic write (temp + rename): the crux pass now checkpoints wiring.json
  // periodically (#128), and a --deep run is exactly what gets killed mid-flush
  // (SIGTERM/CI timeout/laptop sleep). A partial writeFileSync would leave a
  // truncated, unparseable graph; rename swaps it in atomically on the same fs.
  //
  // pid in the temp name, and removed when the write fails — the same discipline
  // `writeJsonAtomic` (util/state.ts) documents: a fixed name lets a concurrent
  // build (a manual `graft build` racing the refresh child) write the same scratch
  // file and hand the loser a corrupt graph, and a failed rename would otherwise
  // leave a full-size orphan behind that nothing ever cleans up.
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(sorted, null, 2) + "\n");
    renameSync(tmp, path);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* nothing more we can do */
    }
    throw e;
  }
  return path;
}

/**
 * Drop `body_text` from the SERIALIZED copy of a node — it is ~65% of
 * wiring.json's bytes on a large graph, and every byte of it is already
 * duplicated in the `ask` sidecar (`.cache/ask-index.json`), tokenized, which
 * is the only place anything reads it from. Callers must pass this the
 * in-memory graph BEFORE this stripped copy is produced (see `build.ts`:
 * `writeAskIndex` runs on the original `graph` object, never on a re-read of
 * this slimmed file) — this function never mutates the input node.
 */
function stripBodyText(node: NodeV1): NodeV1 {
  if (node.body_text === undefined) return node;
  const { body_text: _body_text, ...rest } = node;
  return rest as NodeV1;
}

function edgeOrder(a: EdgeV1, b: EdgeV1): number {
  return (
    a.source.localeCompare(b.source) ||
    a.relation.localeCompare(b.relation) ||
    a.target.localeCompare(b.target)
  );
}
