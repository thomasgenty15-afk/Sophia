// BANC D'ESSAI · l'agrégation. Lit `resultats.jsonl` en entier et rend le
// tableau du rapport.
//
//   deno run --allow-read scratchpad/banc-modeles/agrege.ts [--md]
//
// ── CE QUE CE FICHIER NE FAIT PAS ──────────────────────────────────────────
// Il ne note pas la « qualité culinaire ». Le plan la désigne comme le seul axe
// non mesurable ici, et comme celui sur lequel un humain croira le plus voir une
// différence. Rien de ce tableau n'est un jugement de goût.

import type { BenchRow } from "./run.ts";

const rows: BenchRow[] = [];
for (const line of Deno.readTextFileSync("scratchpad/banc-modeles/resultats.jsonl").split("\n")) {
  const t = line.trim();
  if (!t) continue;
  try {
    rows.push(JSON.parse(t));
  } catch { /* ligne tronquée d'un run interrompu: ignorée */ }
}

const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)} %`);
const num = (x: number, d = 1) => x.toFixed(d);

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
  return s[i];
}

const models = [...new Set(rows.map((r) => r.model))];

interface Agg {
  model: string;
  n: number;
  callFail: number;
  parseFail: number;
  violRuns: number;
  echoRuns: number;
  violTotal: number;
  issuesMean: number;
  retryRate: number;
  covMedian: number;
  dishesMean: number;
  lockBlocked: number;
  outOfBand: number;
  p50: number;
  p95: number;
  costMean: number | null;
  frViol: number;
  frRuns: number;
  enViol: number;
  enRuns: number;
  kinds: Map<string, number>;
}

const aggs: Agg[] = models.map((model) => {
  const mine = rows.filter((r) => r.model === model);
  const ok = mine.filter((r) => r.ok);
  const parsed = ok.filter((r) => r.jsonParsed);
  const covs = parsed.map((r) => r.resolutionCoverage).filter((x): x is number => x !== null);
  const lat = mine.map((r) => r.latencyMs);
  const costs = mine.map((r) => r.costUsd).filter((x): x is number => x !== null);
  const kinds = new Map<string, number>();
  for (const r of parsed) for (const k of r.issueKinds) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  const fr = parsed.filter((r) => r.locale === "fr-FR");
  const en = parsed.filter((r) => r.locale === "en-GB");
  return {
    model,
    n: mine.length,
    callFail: mine.length - ok.length,
    parseFail: ok.length - parsed.length,
    violRuns: parsed.filter((r) => r.negativeViolations.length > 0).length,
    echoRuns: parsed.filter((r) => r.negativeEchoes.length > 0).length,
    violTotal: parsed.reduce((s, r) => s + r.negativeViolations.length, 0),
    issuesMean: parsed.length ? parsed.reduce((s, r) => s + r.issues, 0) / parsed.length : NaN,
    retryRate: parsed.length ? parsed.filter((r) => r.wouldRetry).length / parsed.length : NaN,
    covMedian: quantile(covs, 0.5),
    dishesMean: parsed.length ? parsed.reduce((s, r) => s + r.dishes, 0) / parsed.length : NaN,
    lockBlocked: parsed.filter((r) => r.outputLockReason).length,
    outOfBand: parsed.filter((r) =>
      r.verdictEnergy === "above" || r.verdictEnergy === "below" ||
      r.verdictProtein === "under" || r.verdictDensity === "above"
    ).length,
    p50: quantile(lat, 0.5) / 1000,
    p95: quantile(lat, 0.95) / 1000,
    costMean: costs.length ? costs.reduce((s, c) => s + c, 0) / costs.length : null,
    frViol: fr.filter((r) => r.negativeViolations.length > 0).length,
    frRuns: fr.length,
    enViol: en.filter((r) => r.negativeViolations.length > 0).length,
    enRuns: en.length,
    kinds,
  };
});

// Le classement: l'adhérence NÉGATIVE d'abord (le plan la désigne comme le test
// le plus discriminant), puis la fiabilité d'appel, puis les issues.
aggs.sort((a, b) =>
  (a.violRuns / Math.max(1, a.n)) - (b.violRuns / Math.max(1, b.n)) ||
  (a.callFail + a.parseFail) - (b.callFail + b.parseFail) ||
  a.issuesMean - b.issuesMean
);

const md = Deno.args.includes("--md");
const out: string[] = [];
out.push(`Générations lues : **${rows.length}**\n`);
out.push(
  "| Modèle | n | échecs appel | échecs parse | **runs avec violation négative** | violations | échos (obéissance) | issues/run | retry | couverture méd. | plats/run | hors bande | p50 | p95 | $/gén. |",
);
out.push("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
for (const a of aggs) {
  out.push(
    `| \`${a.model}\` | ${a.n} | ${a.callFail} | ${a.parseFail} | **${a.violRuns}** (${
      pct(a.violRuns, a.n - a.callFail - a.parseFail)
    }) | ${a.violTotal} | ${a.echoRuns} | ${num(a.issuesMean)} | ${Number.isNaN(a.retryRate) ? "—" : num(a.retryRate * 100, 0) + " %"} | ${
      Number.isNaN(a.covMedian) ? "—" : num(a.covMedian * 100, 1) + " %"
    } | ${num(a.dishesMean)} | ${a.outOfBand} | ${num(a.p50, 0)} s | ${num(a.p95, 0)} s | ${
      a.costMean === null ? "—" : "$" + a.costMean.toFixed(3)
    } |`,
  );
}

out.push("\n### Anglais contre français — un modèle peut être bon dans une langue\n");
out.push("| Modèle | runs EN | violations EN | runs FR | violations FR |");
out.push("|---|--:|--:|--:|--:|");
for (const a of aggs) {
  out.push(
    `| \`${a.model}\` | ${a.enRuns} | ${a.enViol} (${pct(a.enViol, a.enRuns)}) | ${a.frRuns} | ${
      a.frViol
    } (${pct(a.frViol, a.frRuns)}) |`,
  );
}

out.push("\n### Les fautes, par motif (nombre de runs qui le portent)\n");
const allKinds = [...new Set(aggs.flatMap((a) => [...a.kinds.keys()]))].sort();
out.push(`| Modèle | ${allKinds.join(" | ")} |`);
out.push(`|---|${allKinds.map(() => "--:").join("|")}|`);
for (const a of aggs) {
  out.push(`| \`${a.model}\` | ${allKinds.map((k) => a.kinds.get(k) ?? 0).join(" | ")} |`);
}

out.push("\n### Par fixture — l'adhérence négative, là où elle se joue\n");
const fixtures = [...new Set(rows.map((r) => r.fixture))].sort();
out.push(`| Fixture | ${aggs.map((a) => "`" + a.model + "`").join(" | ")} |`);
out.push(`|---|${aggs.map(() => "--:").join("|")}|`);
for (const f of fixtures) {
  const cells = aggs.map((a) => {
    const mine = rows.filter((r) => r.model === a.model && r.fixture === f && r.jsonParsed);
    const bad = mine.filter((r) => r.negativeViolations.length > 0).length;
    return mine.length === 0 ? "—" : `${bad}/${mine.length}`;
  });
  out.push(`| ${f} | ${cells.join(" | ")} |`);
}

// Ce qui a RÉELLEMENT franchi la barrière, mot par mot: c'est la seule colonne
// qu'on peut lire sans croire personne.
out.push("\n### Les mots interdits qui sont sortis\n");
const words = new Map<string, Map<string, number>>();
const snippets = new Map<string, string>();
for (const r of rows) {
  for (const h of r.negativeViolations) {
    const m = words.get(h.word) ?? new Map<string, number>();
    m.set(r.model, (m.get(r.model) ?? 0) + 1);
    words.set(h.word, m);
    if (!snippets.has(h.word)) snippets.set(h.word, h.snippet);
  }
}
if (words.size === 0) out.push("_Aucune violation sur toute la campagne._");
else {
  out.push("| Mot | Fixture(s) | Modèles | Extrait — la preuve, pas la promesse |");
  out.push("|---|---|---|---|");
  for (const [w, m] of [...words].sort((a, b) => a[0].localeCompare(b[0]))) {
    const fx = [
      ...new Set(
        rows.filter((r) => r.negativeViolations.some((h) => h.word === w)).map((r) => r.fixture),
      ),
    ];
    out.push(
      `| \`${w}\` | ${fx.join(", ")} | ${
        [...m].map(([k, v]) => `${k}×${v}`).join(", ")
      } | ${(snippets.get(w) ?? "").replace(/\|/g, "\\|").slice(0, 90)} |`,
    );
  }
}

// Les échecs d'appel, étiquetés: un 400 récurrent est un identifiant mort.
const failures = rows.filter((r) => !r.ok);
if (failures.length > 0) {
  out.push("\n### Les échecs d'appel\n");
  const byErr = new Map<string, number>();
  for (const r of failures) {
    const key = `${r.model} · ${String(r.error).split(":")[0]}`;
    byErr.set(key, (byErr.get(key) ?? 0) + 1);
  }
  for (const [k, v] of [...byErr].sort((a, b) => b[1] - a[1])) out.push(`- ${k} — ${v}×`);
}

console.log(out.join("\n"));
if (!md) console.log("\n(passe --md pour coller tel quel dans le rapport)");
