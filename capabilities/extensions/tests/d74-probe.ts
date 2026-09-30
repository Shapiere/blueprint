/**
 * D74 live probe — read-only verification of the supplementary discovery path
 * against the running 9router. Exercises the real functions from the extension
 * module (token derivation, Pi-declared prefixes, internal-catalog mapping,
 * merge) and prints exactly what Harness Pi would publish.
 *
 * Run: npx tsx --tsconfig /tmp/tsconfig-perm2.json capabilities/extensions/tests/d74-probe.ts
 */
import {
  ROUTER_BASE_URL,
  mapRouterCatalog,
  routerCliToken,
  fetchDeclaredPiProviderPrefixes,
  fetchSupplementaryCatalog,
  mergeCatalog,
} from "../runtime-orchestrator.ts";

async function main(): Promise<void> {
  const token = routerCliToken();
  console.log("routerCliToken:", token ? `${token.slice(0, 4)}… (${token.length} chars)` : "null");

  const prefixes = await fetchDeclaredPiProviderPrefixes();
  console.log("router-declared Pi prefixes:", [...prefixes].sort());

  const res = await fetch(`${ROUTER_BASE_URL}/models`, { headers: { Authorization: "Bearer sk_9router" } });
  const advertised = mapRouterCatalog(await res.json());
  const advertisedIds = new Set(advertised.map((m) => m.id));
  console.log("advertised /v1/models:", advertised.length);

  const supplement = await fetchSupplementaryCatalog(advertisedIds);
  console.log("supplement:", supplement.length);
  for (const m of supplement) {
    console.log(
      `   ${m.id}  ctx=${m.contextWindow} max=${m.maxTokens} reasoning=${m.reasoning} input=${m.input.join("+")}`,
    );
  }

  const merged = mergeCatalog(advertised, supplement);
  console.log(
    "merged catalog:",
    merged.length,
    "(advertised",
    advertised.length,
    "+ new",
    merged.length - advertised.length,
    ")",
  );

  const ids = new Set(merged.map((m) => m.id));
  const target = "oc/muse-spark-1.3-contributor-free";
  const prev = "oc/muse-spark-1.2-contributor-free";
  console.log(`\nTARGET  ${target}: ${ids.has(target) ? "DISCOVERED" : "MISSING"}`);
  console.log(`PREV    ${prev}: ${ids.has(prev) ? "DISCOVERED" : "MISSING"}`);
  console.log(
    "oc/* discovered:",
    merged.filter((m) => m.id.startsWith("oc/")).map((m) => m.id),
  );
  console.log("duplicate ids in merged catalog:", merged.length - ids.size);
  console.log("supplement entries shadowing advertised:", supplement.filter((m) => advertisedIds.has(m.id)).length);
}

void main();
