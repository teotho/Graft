import { readFileSync } from 'node:fs';
import type { GraphV1 } from '../graph/types.js';
import type { Stats } from './state.js';
import { resolveContextDir } from '../util/state.js';
import { readGraph, wiringPath } from '../graph/write.js';

export function readWiring(projectDir: string): GraphV1 | null {
  const path = wiringPath(resolveContextDir(projectDir));
  const strict = readGraph(path);
  if (strict) return strict;
  // Backward-compatible status-only fallback: old hook snapshots and tests may
  // carry only the fields computeStats needs, not a complete retrieval graph.
  // Keep that permissiveness isolated here; ask/grep/traverse use readGraph's
  // strict schema and never see this value.
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.meta || raw.meta.version !== 1 ||
        !Array.isArray(raw.nodes) || !Array.isArray(raw.edges) ||
        !Number.isInteger(raw.meta.nodeCount) || !Number.isInteger(raw.meta.edgeCount) ||
        raw.meta.nodeCount !== raw.nodes.length || raw.meta.edgeCount !== raw.edges.length ||
        !Array.isArray(raw.meta.languages) || !raw.meta.languages.every((v: unknown) => typeof v === 'string') ||
        !raw.nodes.every((n: unknown) => Boolean(n && typeof n === 'object' &&
          typeof (n as { id?: unknown }).id === 'string' &&
          typeof (n as { summary_state?: unknown }).summary_state === 'string'))) return null;
    return raw as GraphV1;
  } catch { return null; }
}

export function computeStats(
  w: GraphV1,
): Pick<Stats, 'nodeCount' | 'edgeCount' | 'languages' | 'totalCount' | 'readyCount'> {
  const nodes = w.nodes ?? [];
  const edges = w.edges ?? [];
  const readyCount = nodes.filter((n) => n.summary_state === 'ready').length;
  return {
    nodeCount: w.meta?.nodeCount ?? nodes.length,
    edgeCount: w.meta?.edgeCount ?? edges.length,
    languages: w.meta?.languages ?? [],
    totalCount: nodes.length,
    readyCount,
  };
}
