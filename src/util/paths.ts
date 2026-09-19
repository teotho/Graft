/**
 * Repo-relative paths, always posix.
 *
 * Every path graft stores — node ids, `node.path`, extract-cache keys, the
 * freshness fingerprint, the card manifest — is repo-relative and separated by
 * `/` on every platform. That is not cosmetic: the query layer parses these
 * strings with `/` as the separator, and does it by hand rather than through
 * `node:path`. `pathUnderPrefix` (`--in` scoping) tests
 * `startsWith(`${prefix}/`)`, `map`'s `dirKey` splits on `/` to cluster by
 * directory, `resolveSymbol` matches a filename query with
 * `endsWith("/" + query)`. Hand any of them a `src\gate.ts` and none of them
 * error — they match nothing, silently. On Windows that made every `--in`
 * report "nothing indexed under …" and made `map` emit one single-file
 * "directory" per file.
 *
 * So normalize once, here, where a path is *created*, instead of defensively at
 * each consumer — a consumer that forgets is a silent wrong answer, and there
 * are more consumers than producers.
 *
 * {@link toPosixPath} splits on the platform `sep`, never a literal `\`: a
 * posix filename may legitimately contain a backslash, and splitting on `"\\"`
 * would corrupt it. That also makes this module provably the identity function
 * on posix, which is what guarantees an existing Mac/Linux graph is byte-identical
 * across this change.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";
import { realpathSync } from "node:fs";

/** Platform separators → `/`. Identity on posix. */
export function toPosixPath(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

/**
 * `relative(from, to)`, normalized to posix — the canonical form of every path
 * graft stores. Use this rather than bare `relative` for anything that lands in
 * the graph, a cache key, or a manifest. Bare `relative` is still right for
 * text shown in the terminal, where a native separator is what the platform's
 * users expect.
 */
export function relPosix(from: string, to: string): string {
  return toPosixPath(relative(from, to));
}

/**
 * Trailing `/` off a repo-relative path, in linear time.
 *
 * The obvious `replace(/\/+$/, "")` is a polynomial-ReDoS shape — `\/+$` can begin
 * matching at any point inside a run of slashes, so a path ending in many slashes
 * and then anything else costs O(n²). CodeQL flags it (`js/polynomial-redos`), and
 * rightly: these inputs are a `--dir` or `--in` value rather than anything
 * attacker-controlled, but the ambiguity buys nothing and a loop is both faster
 * and plainer.
 */
export function stripTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end--;
  return path.slice(0, end);
}

/**
 * Normalize a user-supplied path prefix (`--in`) so it can be compared against
 * a stored `node.path`: posix separators, no leading `./`, no trailing
 * separator. Windows users type — and their shell's tab-completion produces —
 * `--in server\src\gpu`, so both separators have to reduce to the same prefix.
 */
export function normalizePathPrefix(p: string): string {
  let out = toPosixPath(p);
  while (out.startsWith("./")) out = out.slice(2);
  // Trailing separators only; a bare "/" normalizes to "" (match everything),
  // which is exactly how `pathUnderPrefix` reads an empty prefix.
  out = stripTrailingSlashes(out);
  if (out === "" || out === ".") return "";
  assertRepoRelativePath(out, "path prefix");
  return out;
}

/**
 * Validate a path stored in, or supplied relative to, a repository.
 *
 * Graft's on-disk formats use posix, repo-relative paths. Accepting an
 * absolute path or a `..` segment turns every later `resolve(root, path)` into
 * a filesystem escape, including paths read from untrusted/corrupt artifacts.
 */
export function assertRepoRelativePath(path: string, label = "path"): string {
  if (typeof path !== "string" || path.includes("\0")) {
    throw new Error(`${label} must be a valid repo-relative path`);
  }
  const normalized = toPosixPath(path);
  if (isAbsolute(path) || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`${label} must be repo-relative: ${JSON.stringify(path)}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    throw new Error(`${label} must not contain traversal or empty segments: ${JSON.stringify(path)}`);
  }
  return normalized;
}

/** An immediate child name, never a path. Used by workspace.json readers. */
export function assertImmediateChildName(name: string, label = "workspace child"): string {
  const normalized = assertRepoRelativePath(name, label);
  if (normalized === "." || normalized.includes("/")) {
    throw new Error(`${label} must be an immediate child name: ${JSON.stringify(name)}`);
  }
  return normalized;
}

/** True when `candidate` is at or below `root`, using canonical paths. */
export function isCanonicallyContained(root: string, candidate: string): boolean {
  let canonicalRoot: string;
  let canonicalCandidate: string;
  try {
    canonicalRoot = realpathSync(resolve(root));
    canonicalCandidate = realpathSync(resolve(candidate));
  } catch {
    return false;
  }
  const rel = relative(canonicalRoot, canonicalCandidate);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/** Resolve a validated repo-relative path and reject canonical symlink escapes. */
export function resolveContainedPath(root: string, repoRelative: string, label = "path"): string {
  const normalized = assertRepoRelativePath(repoRelative, label);
  const abs = resolve(root, ...normalized.split("/"));
  if (!isCanonicallyContained(root, abs)) {
    throw new Error(`${label} escapes the repository: ${JSON.stringify(repoRelative)}`);
  }
  return abs;
}
