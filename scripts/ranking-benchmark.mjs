/**
 * Deterministic retrieval benchmark over a built repository.
 *
 * Usage:
 *   node scripts/ranking-benchmark.mjs <repo> <cases.json> [--json]
 *
 * cases.json:
 * [{"query":"auth token","expected":["src/auth.ts"],"topK":5}]
 *
 * Each case passes when every expected path occurs in the first topK hit pointers.
 * The runner intentionally calls the compiled CLI API so benchmark results describe
 * the exact artifact that would ship, not a tsx-only development path.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [repoArg, casesArg] = process.argv.slice(2).filter((arg) => arg !== "--json");
const json = process.argv.includes("--json");
if (!repoArg || !casesArg) {
  console.error("usage: node scripts/ranking-benchmark.mjs <repo> <cases.json> [--json]");
  process.exit(2);
}

const repo = resolve(repoArg);
const casesPath = isAbsolute(casesArg) ? casesArg : resolve(casesArg);
if (!existsSync(casesPath)) {
  console.error(`benchmark cases not found: ${casesPath}`);
  process.exit(2);
}

const cases = JSON.parse(readFileSync(casesPath, "utf8"));
if (!Array.isArray(cases)) throw new Error("benchmark cases must be a JSON array");

const { ask } = await import(pathToFileURL(resolve("dist/ask/ask.js")).href);
const results = [];
for (const entry of cases) {
  if (!entry || typeof entry.query !== "string" || !Array.isArray(entry.expected)) {
    throw new Error("each benchmark case needs query:string and expected:string[]");
  }
  const topK = Number.isInteger(entry.topK) && entry.topK > 0 ? entry.topK : 5;
  const result = ask(repo, entry.query, { limit: topK });
  const pointers = result.hits.slice(0, topK).map((hit) => hit.pointer);
  const missing = entry.expected.filter((expected) =>
    !pointers.some((pointer) => pointer === expected || pointer.startsWith(`${expected}:`)),
  );
  results.push({ query: entry.query, topK, expected: entry.expected, pointers, missing, pass: missing.length === 0 });
}

const passed = results.filter((result) => result.pass).length;
const report = {
  repo,
  cases: results.length,
  passed,
  failed: results.length - passed,
  passRate: results.length ? passed / results.length : 0,
  results,
};

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`ranking-benchmark — ${passed}/${results.length} passed`);
  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"} top-${result.topK} ${JSON.stringify(result.query)}`);
    if (!result.pass) console.log(`  missing: ${result.missing.join(", ")}`);
    console.log(`  hits: ${result.pointers.join(", ")}`);
  }
}
if (passed !== results.length) process.exit(1);