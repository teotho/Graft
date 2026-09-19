import { readFileSync } from "node:fs";
import { contentHash } from "../util/id.js";
import { RANKING_POLICY_ID } from "../ask/policy.js";
import type { GraphV1, NodeV1 } from "./types.js";

export interface BuildProvenanceV1 {
  version: 1;
  sourceDigest: string;
  extractorDigest: string;
  rankingPolicy: string;
}

export function buildProvenance(sourceDigest: string, extractorDigest: string): BuildProvenanceV1 {
  return {
    version: 1,
    sourceDigest,
    extractorDigest,
    rankingPolicy: RANKING_POLICY_ID,
  };
}

export function digestProvenance(value: BuildProvenanceV1): string {
  return contentHash(JSON.stringify(value));
}

export function digestFile(path: string): string {
  return contentHash(readFileSync(path, "utf8"));
}

/** Stable digest of the graph build, excluding searchable body text and itself. */
export function digestGraphBuild(graph: GraphV1): string {
  const nodes = [...graph.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node): NodeV1 => {
      const { body_text: _bodyText, ...rest } = node;
      return rest as NodeV1;
    });
  const edges = [...graph.edges].sort((a, b) =>
    a.source.localeCompare(b.source) || a.relation.localeCompare(b.relation) || a.target.localeCompare(b.target),
  );
  const { buildDigest: _buildDigest, ...meta } = graph.meta;
  return contentHash(JSON.stringify({ meta, nodes, edges }));
}

export function isBuildProvenance(value: unknown): value is BuildProvenanceV1 {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<BuildProvenanceV1>;
  return p.version === 1 &&
    typeof p.sourceDigest === "string" && /^[a-f0-9]{64}$/.test(p.sourceDigest) &&
    typeof p.extractorDigest === "string" && p.extractorDigest.length > 0 &&
    typeof p.rankingPolicy === "string" && p.rankingPolicy.length > 0;
}