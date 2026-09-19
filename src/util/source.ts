import { readFileSync } from "node:fs";
import { resolveContainedPath } from "./paths.js";

/** Read source text, decoding Windows tooling's common UTF-16LE output. UTF-16BE
 * is rare and unsupported by Node's built-in decoders, so callers silently skip it. */
export function readSourceFile(path: string): string | null {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  return bytes.toString("utf8");
}

/** Read a repo-relative source path only when canonical containment holds. */
export function readRepoSourceFile(root: string, repoRelative: string): string | null {
  return readSourceFile(resolveContainedPath(root, repoRelative, "source path"));
}
