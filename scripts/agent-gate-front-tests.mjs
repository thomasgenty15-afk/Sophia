#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LE JUGE DES ROUGES FRONT — appelé par `scripts/agent-gate.sh`
//
// ⚠️ MESURÉ LE 2026-08-22. `agent-gate.sh` lançait `deno test`, `tsc -b`,
// `deno check` et `eslint` — et PAS vitest (`grep -c vitest` → 0). Les 112
// fichiers / 1 788 tests front se lançaient à la main, jamais dans le gate.
//
// ⛔ POURQUOI UNE LISTE, ET PAS UN SIMPLE « rc != 0 ⇒ échec ».
// Le jour où le gate a appris à voir le front, la suite portait DÉJÀ 4 rouges,
// et AUCUN n'appartenait au lot qui armait le gate: le dépôt est travaillé par
// plusieurs sessions en parallèle, et refuser tous les commits sur le rouge
// d'un voisin, c'est fabriquer un gate qu'on contourne. Un gate contourné ne
// garde plus rien. La liste dit NOMINATIVEMENT quels rouges sont tolérés, avec
// leur date et leur propriétaire — et TOUT LE RESTE mord.
//
// Format de `scripts/.vitest-red-baseline`: une ligne par test toléré,
//     <chemin relatif à frontend/> :: <fullName du test>
// Les lignes vides et celles qui commencent par `#` sont des commentaires.
//
// CE QUI FAIT ÉCHOUER:
//   · un test rouge absent de la liste;
//   · un fichier qui ne se CHARGE pas (erreur de collecte) — toujours, liste ou
//     pas: il n'en existait aucun le 2026-08-22, et un fichier qui ne charge pas
//     emporte tous ses tests en silence;
//   · un rapport vitest illisible ou vide.
//
// CE QUI NE FAIT QUE PRÉVENIR (arbitrage écrit, §⑨ n° 76 du plan):
//   · une ligne de la liste devenue VERTE. Faire échouer serait plus propre
//     contre « une contrainte documentée survit à sa cause », mais ça bloquerait
//     la session qui vient de RÉPARER, pour un lot qui n'est pas le sien. Ce
//     n'est pas du silence: l'avertissement sort à CHAQUE passage du gate.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const [reportPath, baselinePath] = process.argv.slice(2);
if (!reportPath || !baselinePath) {
  console.error("usage: agent-gate-front-tests.mjs <vitest.json> <baseline>");
  process.exit(2);
}

const SEP = " :: ";
const frontendRoot = resolve(process.cwd(), "frontend");

function parseBaseline(path) {
  const tolerated = new Set();
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`agent-gate: liste des rouges front introuvable: ${path}`);
    process.exit(2);
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.includes(SEP)) {
      console.error(
        `agent-gate: ligne illisible dans ${path} (séparateur "${SEP}" attendu):\n  ${trimmed}`,
      );
      process.exit(2);
    }
    tolerated.add(trimmed);
  }
  return tolerated;
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  console.error(
    `agent-gate: rapport vitest illisible (${reportPath}): ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
  process.exit(2);
}

const tolerated = parseBaseline(baselinePath);

const unlisted = []; // rouges NON tolérés
const seen = new Set(); // clés de la liste réellement rencontrées
const uncollectable = []; // fichiers qui ne se chargent pas

for (const file of report.testResults ?? []) {
  const path = relative(frontendRoot, file.name);
  const failures = (file.assertionResults ?? []).filter(
    (a) => a.status === "failed",
  );
  if (file.status === "failed" && failures.length === 0) {
    // Aucun test nommé n'a échoué et le fichier est rouge quand même: il n'a
    // pas pu être COLLECTÉ. Ses tests n'ont pas été exécutés du tout, et un
    // compte de tests vert au-dessus ne le dirait pas.
    uncollectable.push(path);
    continue;
  }
  for (const a of failures) {
    const key = `${path}${SEP}${a.fullName}`;
    if (tolerated.has(key)) seen.add(key);
    else unlisted.push(key);
  }
}

const stale = [...tolerated].filter((k) => !seen.has(k));

console.log(
  `agent-gate: vitest — ${report.numTotalTests ?? "?"} tests, ` +
    `${report.numFailedTests ?? "?"} rouges, ` +
    `${seen.size} tolérés par ${baselinePath}, ${unlisted.length} hors liste`,
);

for (const k of stale) {
  console.log(
    `agent-gate: ⚠️ ligne PÉRIMÉE dans ${baselinePath} — ce test ne rougit plus, retire-la:\n    ${k}`,
  );
}

if (uncollectable.length > 0) {
  console.error(
    "agent-gate: fail: des fichiers de test front ne se CHARGENT pas (aucun de leurs tests n'a tourné):",
  );
  for (const p of uncollectable) console.error(`    ${p}`);
  console.error(
    "       Ce cas n'est jamais toléré par la liste: un fichier qui ne charge pas\n" +
      "       emporte tous ses tests en silence, et le compte reste vert.",
  );
  process.exit(1);
}

if (unlisted.length > 0) {
  console.error("agent-gate: fail: des tests front sont rouges HORS de la liste:");
  for (const k of unlisted) console.error(`    ${k}`);
  console.error(
    `       Répare-les. Si le rouge appartient à une autre session en vol,\n` +
      `       ajoute la ligne à ${baselinePath} EN NOMMANT son propriétaire et sa date —\n` +
      `       jamais AGENT_GATE_SKIP_TESTS, qui n'existe que pour une machine sans deno.`,
  );
  process.exit(1);
}

process.exit(0);
