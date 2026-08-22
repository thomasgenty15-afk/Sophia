// ══════════════════════════════════════════════════════════════════════════
// M-audit — `user_profile_facts` · l'instrument
// ══════════════════════════════════════════════════════════════════════════
//
// Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `M-audit`.
// Lancé par `scripts/keel_maudit_user_profile_facts_20260822.sh`.
//
// ── CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS ────────────────────────────────
// Il LIT. Il ne supprime rien, il n'écrit rien, il n'appelle aucun modèle.
// C'est un AUDIT: il rend un chiffre, une ventilation, et une question.
//
// ── §⑨ n° 92 — AUCUN TYPE DE L'ARBRE DE TRAVAIL ───────────────────────────
// Ce fichier n'importe QU'UNE SEULE chose du dépôt: la fonction de rendu de
// PRODUCTION `formatUserProfileFactsForPrompt`. C'est une VALEUR, pas un
// type, et son fichier est identique à `HEAD` (vérifié au lot). Mesurer le
// coût du bloc avec une COPIE du formateur mesurerait la copie.
//
// ── DEUX ÉTAGES, ET L'ÉTAGE DB PEUT MANQUER ───────────────────────────────
// L'étage STATIQUE (appelants, chaîne de lecture, RGPD, coût du bloc) ne
// dépend que de fichiers: il tourne toujours.
// L'étage DB dépend des dumps NDJSON du pilote. ⛔ S'ils manquent, le script
// le DIT et sort en `rc=1`. Il ne fabrique JAMAIS un zéro — « 0 ligne » et
// « je n'ai pas pu lire » sont deux mesures différentes, et ce dépôt a déjà
// payé la confusion.

import { formatUserProfileFactsForPrompt } from "../supabase/functions/sophia-brain/profile_facts.ts";

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/** Recopiée de `_shared/keel/draft_note_classify_wiring_test.ts` — un
 * instrument qui dépend d'un test se casse pour des raisons étrangères.
 * ⛔ Sans elle, un `grep` compte les COMMENTAIRES comme des appelants vivants
 * (cicatrice `caller-audit-must-strip-comments`). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

function stripSqlComments(src: string): string {
  return src.replace(/^\s*--.*$/gm, "");
}

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}
function lpad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

function pct(num: number, den: number): string {
  if (den <= 0) return "—";
  return `${((100 * num) / den).toFixed(1)} %`;
}

/** Estimation de tokens du dépôt: ~4 caractères par token. La valeur exacte
 * n'a pas d'importance ici — ce qui compte est que le MÊME diviseur serve à
 * comparer deux blocs. */
function estTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

async function readIfExists(p: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(p);
  } catch {
    return null;
  }
}

async function readNdjson(p: string): Promise<Record<string, unknown>[] | null> {
  const raw = await readIfExists(p);
  if (raw === null) return null;
  const rows: Record<string, unknown>[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      return null;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

const DUMP_DIR = Deno.args[0] ?? "";
const ROOT = Deno.args[1] ?? new URL("..", import.meta.url).pathname;

const P = (rel: string) => `${ROOT.replace(/\/+$/, "")}/${rel}`;

const failures: string[] = [];
const notes: string[] = [];

function guard(ok: boolean, label: string, detail: string) {
  const mark = ok ? "✅" : "⛔";
  console.log(`  ${mark} ${pad(label, 46)} ${detail}`);
  if (!ok) failures.push(`${label} — ${detail}`);
}

// ---------------------------------------------------------------------------
// ÉTAGE STATIQUE ① — qui NOMME la table, sur la source EXÉCUTÉE
// ---------------------------------------------------------------------------

const SOURCE_DIRS = [
  "supabase/functions",
  "frontend/src",
  "scripts",
  "supabase/migrations",
];

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(dir)];
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) await walk(p, out);
    else if (/\.(ts|tsx|mjs|js|sql)$/.test(e.name)) out.push(p);
  }
  return out;
}

const allFiles: string[] = [];
for (const d of SOURCE_DIRS) await walk(P(d), allFiles);

const isTestFile = (p: string) =>
  /_test\.ts$|\.test\.tsx?$|\.int\.test\./.test(p);

/** ⛔ L'INSTRUMENT S'EXCLUT LUI-MÊME, ET CE N'EST PAS UN DÉTAIL.
 * Au premier run il s'est compté comme appelant vivant des CINQ exports de
 * `profile_facts.ts` — dont les trois qui sont morts — et `G3` a annoncé
 * « ressuscités ». Un audit d'appelants qui se compte lui-même mesure sa
 * propre existence: c'est la cicatrice `caller-audit-must-strip-comments`
 * par un autre chemin. */
const SELF = new URL(import.meta.url).pathname;
const isSelf = (p: string) => p === SELF || p.endsWith("/keel_maudit_user_profile_facts_20260822.ts");

type Mention = { rel: string; test: boolean; n: number };
const mentions: Mention[] = [];
const sourceCache = new Map<string, string>();

for (const f of allFiles) {
  const raw = await Deno.readTextFile(f);
  const s = f.endsWith(".sql") ? stripSqlComments(raw) : stripComments(raw);
  sourceCache.set(f, s);
  if (isSelf(f)) continue;
  const n = (s.match(/user_profile_facts/g) ?? []).length;
  if (n === 0) continue;
  mentions.push({
    rel: f.slice(ROOT.replace(/\/+$/, "").length + 1),
    test: isTestFile(f),
    n,
  });
}
mentions.sort((a, b) => a.rel.localeCompare(b.rel));

console.log("── ① QUI NOMME LA TABLE, COMMENTAIRES RETIRÉS ───────────────────────────\n");
for (const m of mentions) {
  console.log(`   ${m.test ? "TEST" : "PROD"}  ${lpad(m.n, 3)}  ${m.rel}`);
}
const prodMentions = mentions.filter((m) => !m.test);
console.log(
  `\n   → ${prodMentions.length} fichiers de PRODUCTION, ${
    mentions.length - prodMentions.length
  } de TEST\n`,
);

// ---------------------------------------------------------------------------
// ÉTAGE STATIQUE ② — les symboles exportés et leurs importateurs
// ---------------------------------------------------------------------------

const FACTS_MODULE = P("supabase/functions/sophia-brain/profile_facts.ts");
const factsSrc = sourceCache.get(FACTS_MODULE) ??
  stripComments(await Deno.readTextFile(FACTS_MODULE));

const exportedSymbols = [
  ...factsSrc.matchAll(
    /export\s+(?:async\s+)?(?:function|type|const)\s+([A-Za-z0-9_]+)/g,
  ),
].map((m) => m[1]);

/** ⛔ LA LISTE DES MORTS EST NOMINATIVE ET DATÉE — mesurée le 2026-08-22.
 * Elle mord DANS LES DEUX SENS: un export NEUF sans importateur qui n'est pas
 * ici fait rougir (on ne collectionne pas les morts en silence), et un mort
 * qui RESSUSCITE fait rougir aussi (le plan doit l'apprendre). */
const KNOWN_DEAD_EXPORTS = new Set([
  "upsertUserProfileFactWithEvent",
  "UserProfileFactRow",
  "ProfileFactValue",
]);

type SymUse = { sym: string; prod: string[]; test: string[] };
const symUses: SymUse[] = [];
for (const sym of exportedSymbols) {
  const prod: string[] = [];
  const test: string[] = [];
  const re = new RegExp(`\\b${sym}\\b`);
  for (const f of allFiles) {
    if (f === FACTS_MODULE || isSelf(f)) continue;
    const s = sourceCache.get(f) ??
      (f.endsWith(".sql")
        ? stripSqlComments(await Deno.readTextFile(f))
        : stripComments(await Deno.readTextFile(f)));
    sourceCache.set(f, s);
    if (re.test(s)) {
      (isTestFile(f) ? test : prod).push(
        f.slice(ROOT.replace(/\/+$/, "").length + 1),
      );
    }
  }
  symUses.push({ sym, prod, test });
}

console.log("── ② LES EXPORTS DE `profile_facts.ts` ET LEURS IMPORTATEURS ────────────\n");
for (const u of symUses) {
  const state = u.prod.length > 0
    ? "VIVANT"
    : u.test.length > 0
    ? "TEST SEUL"
    : "MORT";
  console.log(
    `   ${pad(u.sym, 34)} ${pad(state, 10)} prod=${u.prod.length} test=${u.test.length}  ${
      [...u.prod, ...u.test.map((t) => `[T]${t}`)].join(" · ") || "aucun"
    }`,
  );
}
console.log("");

// ---------------------------------------------------------------------------
// ÉTAGE STATIQUE ③ — la chaîne qui fait atteindre le PROMPT
// ---------------------------------------------------------------------------

const loaderSrc = sourceCache.get(
  P("supabase/functions/sophia-brain/context/loader.ts"),
) ?? "";
const typesSrc = sourceCache.get(
  P("supabase/functions/sophia-brain/context/types.ts"),
) ?? "";
const runSrc = sourceCache.get(
  P("supabase/functions/sophia-brain/router/run.ts"),
) ?? "";

type Link = { label: string; ok: boolean; where: string };
const chain: Link[] = [
  {
    label: "loader.ts importe getUserProfileFacts",
    ok: /getUserProfileFacts/.test(loaderSrc) &&
      /from\s+"\.\.\/profile_facts\.ts"/.test(loaderSrc),
    where: "context/loader.ts",
  },
  {
    label: "l'appel est gardé par `profile.facts`",
    ok: /if\s*\(\s*profile\.facts\s*\)/.test(loaderSrc),
    where: "context/loader.ts",
  },
  {
    label: "`facts: true` n'existe que pour `companion`",
    ok: (typesSrc.match(/facts:\s*true/g) ?? []).length === 1,
    where: "context/types.ts",
  },
  {
    label: "buildContextString concatène `loaded.facts`",
    ok: /loaded\.facts/.test(loaderSrc) && /ctx\s*\+=\s*loaded\.facts/.test(loaderSrc),
    where: "context/loader.ts",
  },
  {
    // ⛔ LE `mode` EST CHERCHÉ DANS L'ARGUMENT DE L'APPEL, PAS DANS LE FICHIER.
    // La v1 de cette garde testait les deux motifs n'importe où dans `run.ts`.
    // La mutation M2 (`mode: "companion"` → `"dispatcher"` sur l'appel réel) l'a
    // laissée VERTE: le fichier porte QUATRE `mode: "companion"`, dont trois
    // n'ont rien à voir avec le chargeur de contexte. Une garde satisfaite par
    // un voisin est une garde désarmée.
    label: "run.ts charge le contexte en mode `companion`",
    ok: (() => {
      const i = runSrc.indexOf("loadContextForMode(");
      if (i < 0) return false;
      const args = runSrc.slice(i, i + 1200);
      const end = args.indexOf("});");
      return /mode:\s*"companion"/.test(args.slice(0, end < 0 ? 1200 : end));
    })(),
    where: "router/run.ts",
  },
  {
    label: "run.ts passe le contexte à l'agent visible",
    ok: /buildContextString\(/.test(runSrc) && /context:\s*withKeelDoctrineBlock\(/.test(runSrc),
    where: "router/run.ts",
  },
];

console.log("── ③ LA CHAÎNE QUI PORTE LES LIGNES JUSQU'AU PROMPT ─────────────────────\n");
for (const l of chain) {
  console.log(`   ${l.ok ? "✅" : "⛔"} ${pad(l.label, 50)} ${l.where}`);
}
console.log("");

// Les trois lecteurs, avec leur PRÉDICAT littéral et leur PLAFOND.
type Reader = {
  name: string;
  where: string;
  predicate: string;
  cap: string;
  reachesPrompt: boolean;
};
const READERS: Reader[] = [
  {
    name: "R1 getUserProfileFacts",
    where: "profile_facts.ts:38 ← loader.ts:743",
    predicate: "user_id = ? · scope in ('global', <scope du tour>) · status = 'active'",
    cap: "AUCUN — ni `.limit()`, ni `.slice()`, ni troncature de tokens",
    reachesPrompt: true,
  },
  {
    name: "R2 loadPreferencesSurfaceSummary",
    where: "loader.ts:1348",
    predicate: "user_id = ? · scope = 'global' · key in (5 clés coach.*)",
    cap: "`.slice(0, 5)` sur les lignes rendues",
    reachesPrompt: true,
  },
  {
    name: "R3 loadDurableEffectsSummary",
    where: "loader.ts:2622",
    predicate:
      "user_id = ? · scope = 'global' · status = 'active' · key like 'coach.%'",
    cap: "`.limit(12)`",
    reachesPrompt: true,
  },
];

console.log("   LES LECTEURS, LEUR PRÉDICAT, LEUR PLAFOND :\n");
for (const r of READERS) {
  console.log(`   ${r.name}  (${r.where})`);
  console.log(`      prédicat : ${r.predicate}`);
  console.log(`      plafond  : ${r.cap}`);
}
console.log("");

// Le plafond de R1, vérifié SUR LA SOURCE et pas sur la mémoire.
const r1Body = factsSrc.slice(
  factsSrc.indexOf("export async function getUserProfileFacts"),
  factsSrc.indexOf("export function formatUserProfileFactsForPrompt"),
);
const r1HasCap = /\.limit\(|\.range\(|slice\(/.test(r1Body);
const formatterBody = factsSrc.slice(
  factsSrc.indexOf("export function formatUserProfileFactsForPrompt"),
  factsSrc.indexOf("export async function upsertUserProfileFactWithEvent"),
);
const formatterHasCap = /\.slice\(|truncate|MAX_/i.test(formatterBody);

// ---------------------------------------------------------------------------
// ÉTAGE STATIQUE ④ — l'ÉCRIVAIN, qui n'est pas dans le TypeScript
// ---------------------------------------------------------------------------

const schemaSrc = sourceCache.get(
  P("supabase/migrations/20260522143735_squashed_schema.sql"),
) ?? "";

const seedFnMatch = schemaSrc.match(
  /CREATE OR REPLACE FUNCTION "public"\."seed_default_coach_preferences"[\s\S]*?\$\$;/,
);
const seedFn = seedFnMatch?.[0] ?? "";
const seedTuples = [
  ...seedFn.matchAll(
    /\(p_user_id,\s*'([^']+)',\s*'([^']+)',\s*jsonb_build_object\('value',\s*'([^']*)',\s*'label',\s*'([^']*)'\)[\s\S]*?'(\w+)',\s*([0-9.]+),\s*'(\w+)'/g,
  ),
].map((m) => ({
  scope: m[1],
  key: m[2],
  value: { value: m[3], label: m[4] },
  status: m[5],
  confidence: Number(m[6]),
  source_type: m[7],
}));

const triggerPresent =
  /CREATE OR REPLACE TRIGGER "on_profile_created_seed_default_coach_preferences_trigger" AFTER INSERT ON "public"\."profiles"/
    .test(schemaSrc);
const triggerCallsSeed =
  /perform public\.seed_default_coach_preferences\(new\.id\)/.test(schemaSrc);
const seedInserts = /insert into public\.user_profile_facts/.test(seedFn);

console.log("── ④ L'ÉCRIVAIN — IL N'EST PAS DANS LE TYPESCRIPT ───────────────────────\n");
console.log(
  `   trigger \`on_profile_created_seed_default_coach_preferences_trigger\` : ${
    triggerPresent ? "PRÉSENT" : "ABSENT"
  }  (AFTER INSERT ON public.profiles)`,
);
console.log(
  `   il appelle \`seed_default_coach_preferences\`                        : ${
    triggerCallsSeed ? "OUI" : "NON"
  }`,
);
console.log(
  `   la fonction INSÈRE dans user_profile_facts                          : ${
    seedInserts ? "OUI" : "NON"
  }`,
);
console.log(`   nombre de lignes semées par compte                                  : ${seedTuples.length}`);
console.log(
  `   leur \`source_type\`                                                  : ${
    [...new Set(seedTuples.map((t) => t.source_type))].join(", ") || "—"
  }`,
);
console.log("");

// ---------------------------------------------------------------------------
// ÉTAGE STATIQUE ⑤ — LE COÛT DU BLOC, RENDU PAR LE VRAI MODULE
// ---------------------------------------------------------------------------

const seededRows = seedTuples.map((t) => ({
  user_id: "00000000-0000-0000-0000-000000000000",
  scope: t.scope,
  key: t.key,
  value: t.value,
  status: t.status,
  confidence: t.confidence,
  source_type: t.source_type,
  last_source_message_id: null,
  reason: null,
  created_at: "",
  updated_at: "",
  last_confirmed_at: null,
}));

// deno-lint-ignore no-explicit-any
const seededBlock = formatUserProfileFactsForPrompt(seededRows as any, "global");

/** La consigne qui SUIT le bloc, recopiée telle qu'elle est concaténée dans
 * `loader.ts`. Elle part avec le bloc et jamais sans: elle appartient donc au
 * coût. Extraite du fichier, pas recopiée à la main. */
const consigneMatch = loaderSrc.match(
  /=== CONSIGNE PERSONNALISATION FACTS ===[\s\S]*?\\n\\n`;/,
);
const consigneLen = consigneMatch
  ? consigneMatch[0].replace(/\\n/g, "\n").replace(/`;$/, "").length
  : 0;

console.log("── ⑤ CE QUE ÇA COÛTE DANS LE PROMPT, RENDU PAR LE MODULE DE PRODUCTION ──\n");
console.log(seededBlock.split("\n").map((l) => `   │ ${l}`).join("\n"));
console.log(
  `\n   bloc « USER MODEL (FACTS) »  : ${lpad(seededBlock.length, 6)} car. ≈ ${
    lpad(estTokens(seededBlock), 5)
  } tokens`,
);
console.log(
  `   consigne qui part avec lui   : ${lpad(consigneLen, 6)} car. ≈ ${
    lpad(estTokens("x".repeat(consigneLen)), 5)
  } tokens`,
);
console.log(
  `   TOTAL par tour companion     : ${
    lpad(seededBlock.length + consigneLen, 6)
  } car. ≈ ${lpad(estTokens("x".repeat(seededBlock.length + consigneLen)), 5)} tokens`,
);
console.log(
  `\n   ⚠️ plafond de R1 dans le code           : ${r1HasCap ? "OUI" : "AUCUN"}`,
);
console.log(
  `   ⚠️ plafond dans le formateur du bloc    : ${formatterHasCap ? "OUI" : "AUCUN"}`,
);
console.log("");

// ---------------------------------------------------------------------------
// ÉTAGE STATIQUE ⑤bis — ⛔ CE QUI SORT DU LOADER N'EST PAS CE QUI ENTRE DANS
// LE PROMPT. `agents/companion.ts` RECOMPOSE le bloc avant l'appel modèle.
//
// La v1 de cet instrument s'arrêtait au loader et concluait « aucun plafond,
// 9 lignes, 506 tokens ». C'est FAUX: `compactUserModelFactsBlock` garde les
// lignes `src=explicit_user` PLUS une liste FERMÉE de défauts jugés utiles,
// et coupe à N lignes. La mesure honnête est celle du bloc qui SORT.
// ---------------------------------------------------------------------------

const companionSrc = sourceCache.get(
  P("supabase/functions/sophia-brain/agents/companion.ts"),
) ?? "";

const compactorBody = companionSrc.slice(
  companionSrc.indexOf("function compactUserModelFactsBlock"),
  companionSrc.indexOf("function stripEmptyContextModuleBlocks"),
);
const usefulDefaultKeys = [
  ...compactorBody.matchAll(/line\.startsWith\("(coach\.[a-z_]+)"\)/g),
].map((m) => m[1]);
const compactorCap = Number(
  compactorBody.match(/\.slice\(\s*\n?\s*0,\s*\n?\s*(\d+),?\s*\n?\s*\)/)?.[1] ??
    NaN,
);
const compactorOnPath = /compactCompanionContextForPrompt\(/.test(companionSrc) &&
  /buildCompanionContextBlock\(/.test(companionSrc);

// Les clés que la CONSIGNE nomme au modèle — elle, le compacteur n'y touche
// pas: il coupe au `\n===` suivant, et la consigne EST la section suivante.
const consigneText = consigneMatch?.[0] ?? "";
const consigneNamedKeys = [
  ...new Set([...consigneText.matchAll(/coach\.[a-z_]+/g)].map((m) => m[0])),
];

/** ⛔ LE PRÉDICAT D'ENTRÉE DU COMPACTEUR, EXTRAIT DE SA PROPRE SOURCE.
 * `coachLines = lines.filter((line) => line.startsWith("coach."))` — et si
 * `coachLines` est VIDE, la fonction rend le bloc INCHANGÉ. Ce préfixe est
 * donc la porte: s'il ne matche rien, TOUT le reste (la liste fermée, le
 * `.slice`) est inatteignable. */
const compactorGatePrefix =
  compactorBody.match(/coachLines\s*=\s*lines\.filter\(\(line\)\s*=>\s*line\.startsWith\("([^"]+)"\)\)/)
    ?.[1] ?? null;

// ⛔ ON APPLIQUE LE PRÉDICAT AUX LIGNES QUE LE VRAI FORMATEUR PRODUIT.
// Pas à une copie, pas à une idée de ce qu'elles contiennent.
const renderedLines = seededBlock.split("\n").map((l) => l.trim()).filter(
  Boolean,
);
const gateMatches = compactorGatePrefix
  ? renderedLines.filter((l) => l.startsWith(compactorGatePrefix)).length
  : -1;
const compactorIsNoop = gateMatches === 0;

const survivingRows = compactorIsNoop
  ? seededRows
  : seededRows.filter((r) => usefulDefaultKeys.includes(r.key)).slice(
    0,
    Number.isFinite(compactorCap) ? compactorCap : 6,
  );
// deno-lint-ignore no-explicit-any
const survivingBlock = formatUserProfileFactsForPrompt(survivingRows as any, "global");
const consigneNamedButAbsent = consigneNamedKeys.filter((k) =>
  !usefulDefaultKeys.includes(k)
);

console.log("── ⑤bis LE COMPACTEUR DU PROMPT — `agents/companion.ts` ─────────────────\n");
console.log(
  `   \`compactUserModelFactsBlock\` est sur le chemin du prompt : ${
    compactorOnPath ? "OUI" : "NON"
  }`,
);
console.log(
  `   sa porte d'entrée                                        : line.startsWith("${
    compactorGatePrefix ?? "⛔ non trouvée"
  }")`,
);
console.log(
  `   lignes RENDUES par le formateur de production            : ${renderedLines.length}`,
);
console.log(
  `   lignes que cette porte laisse passer                     : ${gateMatches}`,
);
console.log(
  `   sa liste FERMÉE de défauts utiles                        : ${
    usefulDefaultKeys.join(", ") || "—"
  }`,
);
console.log(
  `   son plafond                                              : ${
    Number.isFinite(compactorCap) ? `${compactorCap} lignes` : "⛔ non trouvé"
  }`,
);

if (compactorIsNoop) {
  console.log(
    `\n   ⛔ LE COMPACTEUR EST UN NO-OP MESURÉ. Le formateur écrit \`- <clé> = …\` ;`,
  );
  console.log(
    `      la porte teste \`startsWith("${compactorGatePrefix}")\` sur des lignes qui commencent`,
  );
  console.log(
    `      par « - ». ${gateMatches} ligne sur ${renderedLines.length} passe ⇒ la fonction rend le bloc INCHANGÉ,`,
  );
  console.log(
    `      et ni la liste fermée ni le plafond de ${compactorCap} n'ont JAMAIS servi.`,
  );
  console.log(
    `      ⚠️ Le même fichier lit \`coach.question_tendency\` avec \`includes(…)\`, et LUI marche.`,
  );
}

console.log(
  `\n   ⇒ pour un compte SEMÉ PAR DÉFAUT, sur ${seedTuples.length} lignes en base,`,
);
console.log(
  `     ${survivingRows.length} atteignent le modèle (${
    pct(survivingRows.length, seedTuples.length)
  }) ≈ ${estTokens(survivingBlock)} tokens,`,
);
console.log(
  `     et la CONSIGNE part INTACTE (${consigneLen} car. ≈ ${
    Math.ceil(consigneLen / 4)
  } tokens) — le compacteur coupe au \`\\n===\` suivant.`,
);
console.log(
  `\n   la consigne NOMME ${consigneNamedKeys.length} clés au modèle ; la liste fermée du compacteur en retient ${usefulDefaultKeys.length}`,
);
console.log(
  `   (${consigneNamedButAbsent.length} hors liste : ${consigneNamedButAbsent.join(", ")}).`,
);
console.log(
  `   INSTRUCTION ${Math.ceil(consigneLen / 4)} tokens · DONNÉE ${
    estTokens(survivingBlock)
  } tokens — rapport ${(consigneLen / Math.max(survivingBlock.length, 1)).toFixed(1)}×.`,
);
console.log(
  `   TOTAL réellement envoyé par tour companion : ${
    estTokens(survivingBlock) + Math.ceil(consigneLen / 4)
  } tokens.`,
);
console.log("");

// ---------------------------------------------------------------------------
// ÉTAGE STATIQUE ⑥ — RGPD : export ET suppression
// ---------------------------------------------------------------------------

const exportScopeSrc = sourceCache.get(
  P("supabase/functions/account-export-v1/export_scope.ts"),
) ?? "";
const exportIndexSrc = sourceCache.get(
  P("supabase/functions/account-export-v1/index.ts"),
) ?? "";
const gdprTestSrc = sourceCache.get(P("supabase/functions/keel_gdpr_lifecycle_test.ts")) ??
  "";
const purgeSrc = sourceCache.get(
  P("supabase/functions/purge-deleted-accounts/index.ts"),
) ?? "";
const purgeMigration = sourceCache.get(
  P("supabase/migrations/20260708150000_account_deletion_and_gdpr_export.sql"),
) ?? "";

const inExportScope = /user_profile_facts/.test(exportScopeSrc) ||
  /user_profile_facts/.test(exportIndexSrc);
const namedAsExcluded = /"user_profile_facts"/.test(gdprTestSrc);
const aQualifierBlock = gdprTestSrc.slice(
  gdprTestSrc.indexOf("A_QUALIFIER"),
  gdprTestSrc.indexOf("A_QUALIFIER") + 4000,
);
const namedInAQualifier = /"user_profile_facts"/.test(aQualifierBlock);

const fkCascade =
  /ADD CONSTRAINT "user_profile_facts_user_id_fkey" FOREIGN KEY \("user_id"\) REFERENCES "auth"\."users"\("id"\) ON DELETE CASCADE/
    .test(schemaSrc);
const purgeDeletesAuthUser =
  /delete from auth\.users where id = p_user_id/.test(purgeMigration);
const purgeCallsRpc = /rpc\("purge_auth_user"/.test(purgeSrc);

console.log("── ⑥ RGPD — EXPORT ET SUPPRESSION, LES DEUX SÉPARÉMENT ──────────────────\n");
console.log(
  `   EXPORT      dans \`account-export-v1\` (SCOPE + index)      : ${
    inExportScope ? "PRÉSENT" : "⛔ ABSENT"
  }`,
);
console.log(
  `               NOMMÉ comme non réclamé par le filet RGPD      : ${
    namedInAQualifier ? "OUI (A_QUALIFIER)" : "NON"
  }`,
);
console.log(
  `   SUPPRESSION FK vers auth.users ON DELETE CASCADE           : ${
    fkCascade ? "OUI" : "⛔ NON"
  }`,
);
console.log(
  `               \`purge_auth_user\` supprime bien auth.users      : ${
    purgeDeletesAuthUser ? "OUI" : "⛔ NON"
  }`,
);
console.log(
  `               le cron de purge appelle la RPC                : ${
    purgeCallsRpc ? "OUI" : "⛔ NON"
  }`,
);
console.log(
  `\n   ⇒ la table est SUPPRIMÉE avec le compte (par CASCADE, jamais nommée),`,
);
console.log(`     et elle n'est PAS EXPORTÉE. Les deux moitiés du RGPD divergent.\n`);

// ---------------------------------------------------------------------------
// ÉTAGE DB — les dumps du pilote
// ---------------------------------------------------------------------------

const agg = await readNdjson(`${DUMP_DIR}/facts_agg.ndjson`);
const perUser = await readNdjson(`${DUMP_DIR}/facts_users.ndjson`);
const users = await readNdjson(`${DUMP_DIR}/users.ndjson`);
const values = await readNdjson(`${DUMP_DIR}/facts_values.ndjson`);
const activity = await readNdjson(`${DUMP_DIR}/activity.ndjson`);

const dbAvailable = agg !== null && perUser !== null && users !== null &&
  agg.length > 0;

console.log("── ⑦ LA POPULATION EN BASE ──────────────────────────────────────────────\n");

let totalRows = -1;
let bearers = -1;
let authUsers = -1;
let testAccounts = -1;
let testBearers = -1;
let rowsOnTestAccounts = -1;
let nonTestBearers = -1;
let rowsOnNonTestAccounts = -1;
let maxRowsPerAccount = -1;
let readableByR1 = -1;
let nonDefaultRows = -1;
let bearersWithActivity = -1;

/** Les quatre motifs de compte de test, MESURÉS le 2026-08-21 et republiés
 * ici pour être rejouables. ⚠️ Aucune colonne ne distingue un compte de test
 * d'un compte réel: c'est l'e-mail, et rien d'autre. */
const TEST_PATTERNS = [/@keeltest\.dev$/i, /@test\.dev$/i, /^qa-/i, /^laneb-/i];
const isTestEmail = (email: string) =>
  TEST_PATTERNS.some((re) => re.test(String(email ?? "")));

if (!dbAvailable) {
  console.log(
    "   ⛔ EN ATTENTE — BASE INJOIGNABLE. Les dumps NDJSON sont vides ou illisibles.",
  );
  console.log(
    "      Ce n'est PAS « 0 ligne ». Aucun zéro n'est fabriqué, aucun chiffre publié,",
  );
  console.log(
    "      et RIEN n'est recopié depuis la fiche du plan : un chiffre non reproduit",
  );
  console.log(
    "      n'est ni atteint ni manqué — il est EN ATTENTE.",
  );
  console.log(
    `      Répertoire attendu : ${DUMP_DIR || "(non fourni)"}`,
  );
  console.log(`
      ── LES QUATRE MESURES EN ATTENTE, ET LEUR REQUÊTE LITTÉRALE ───────────
      (à coller dans \`docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres\`
       dès que le démon Docker répond ; ou relancer simplement le pilote)

      ① le VOLUME et les PORTEURS
         select count(*) as lignes, count(distinct user_id) as porteurs
         from public.user_profile_facts;

      ② la part de comptes de TEST
         select
           count(*) filter (where u.email ~* '(@keeltest\\.dev|@test\\.dev)$'
                               or u.email ~* '^(qa-|laneb-)')            as test,
           count(*)                                                      as total
         from auth.users u;

      ③ la VENTILATION par scope · clé · statut · source
         select scope, key, status, source_type, count(*) as n,
                count(distinct user_id) as u
         from public.user_profile_facts group by 1,2,3,4 order by 5 desc;

      ④ la part SANS LECTEUR — les porteurs qui n'ont jamais parlé
         select count(*) from (
           select f.user_id from public.user_profile_facts f
           group by 1
           having not exists (select 1 from public.chat_messages m
                              where m.user_id = f.user_id)
         ) s;

      ⚠️ ⑤ L'HYPOTHÈSE ARITHMÉTIQUE À FALSIFIER, et ce n'est PAS une mesure :
         le trigger écrit ${seedTuples.length} lignes par profil et c'est le SEUL écrivain vivant
         ⇒ si aucune ligne n'échappe à la graine, le total vaut EXACTEMENT
         ${seedTuples.length} × (nombre de profils). La requête qui tranche :
         select count(*) from public.user_profile_facts
         where source_type <> 'system_default'
            or key not in (${seedTuples.map((t) => `'${t.key}'`).join(", ")});
         Un résultat > 0 réfute l'hypothèse et NOMME la population héritée.
`);
} else {
  totalRows = agg!.reduce((s, r) => s + Number(r.n ?? 0), 0);
  bearers = perUser!.length;
  authUsers = users!.length;

  const emailById = new Map<string, string>();
  for (const u of users!) emailById.set(String(u.id), String(u.email ?? ""));

  testAccounts = users!.filter((u) => isTestEmail(String(u.email ?? ""))).length;

  testBearers = 0;
  nonTestBearers = 0;
  rowsOnTestAccounts = 0;
  rowsOnNonTestAccounts = 0;
  maxRowsPerAccount = 0;
  for (const r of perUser!) {
    const n = Number(r.n ?? 0);
    maxRowsPerAccount = Math.max(maxRowsPerAccount, n);
    const email = emailById.get(String(r.user_id)) ?? "";
    if (isTestEmail(email)) {
      testBearers++;
      rowsOnTestAccounts += n;
    } else {
      nonTestBearers++;
      rowsOnNonTestAccounts += n;
    }
  }

  console.log(`   lignes                                       ${lpad(totalRows, 8)}`);
  console.log(`   comptes DISTINCTS porteurs                   ${lpad(bearers, 8)}`);
  console.log(`   auth.users au total                          ${lpad(authUsers, 8)}`);
  console.log(
    `   dont comptes de TEST                         ${lpad(testAccounts, 8)}   ${
      pct(testAccounts, authUsers)
    }`,
  );
  console.log(
    `   porteurs qui sont des comptes de TEST        ${lpad(testBearers, 8)}   ${
      pct(testBearers, bearers)
    }`,
  );
  console.log(
    `   lignes portées par un compte de TEST         ${lpad(rowsOnTestAccounts, 8)}   ${
      pct(rowsOnTestAccounts, totalRows)
    }`,
  );
  console.log(
    `   porteurs NON-TEST                            ${lpad(nonTestBearers, 8)}`,
  );
  console.log(
    `   lignes portées par un compte NON-TEST        ${
      lpad(rowsOnNonTestAccounts, 8)
    }   ${pct(rowsOnNonTestAccounts, totalRows)}`,
  );
  console.log(
    `   lignes du plus gros porteur                  ${lpad(maxRowsPerAccount, 8)}`,
  );
  console.log("");

  console.log("── ⑧ LA VENTILATION ─────────────────────────────────────────────────────\n");
  const byDim = new Map<string, number>();
  for (const r of agg!) {
    const k = `${r.scope} · ${r.status} · ${r.source_type}`;
    byDim.set(k, (byDim.get(k) ?? 0) + Number(r.n ?? 0));
  }
  console.log("   par scope · status · source_type :");
  for (const [k, v] of [...byDim.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${pad(k, 46)} ${lpad(v, 7)}   ${pct(v, totalRows)}`);
  }

  const byKey = new Map<string, number>();
  for (const r of agg!) {
    byKey.set(String(r.key), (byKey.get(String(r.key)) ?? 0) + Number(r.n ?? 0));
  }
  console.log(`\n   par clé (${byKey.size} clés distinctes) :`);
  for (const [k, v] of [...byKey.entries()].sort((a, b) => b[1] - a[1])) {
    const seeded = seedTuples.some((t) => t.key === k);
    console.log(
      `      ${pad(k, 40)} ${lpad(v, 7)}   ${pct(v, totalRows)}   ${
        seeded ? "semée par le trigger" : "⚠️ HORS graine"
      }`,
    );
  }

  // Lisibles par R1: scope 'global' (ou le scope du tour) et status active.
  readableByR1 = agg!
    .filter((r) => String(r.status) === "active")
    .reduce((s, r) => s + Number(r.n ?? 0), 0);
  nonDefaultRows = agg!
    .filter((r) => String(r.source_type) !== "system_default")
    .reduce((s, r) => s + Number(r.n ?? 0), 0);

  console.log(
    `\n   lignes que R1 peut rendre (status='active')  ${lpad(readableByR1, 8)}   ${
      pct(readableByR1, totalRows)
    }`,
  );
  console.log(
    `   lignes qui ne viennent PAS de la graine       ${lpad(nonDefaultRows, 8)}   ${
      pct(nonDefaultRows, totalRows)
    }`,
  );

  if (values !== null && values.length > 0) {
    const seedVal = new Map(
      seedTuples.map((t) => [t.key, JSON.stringify(t.value)]),
    );
    let same = 0;
    let diff = 0;
    const divergent: string[] = [];
    for (const v of values) {
      const key = String(v.key);
      const raw = String(v.value ?? "");
      const n = Number(v.n ?? 0);
      const expected = seedVal.get(key);
      if (expected === undefined) {
        diff += n;
        divergent.push(`${key} (hors graine) ×${n}`);
        continue;
      }
      // Comparaison sur les deux champs de la graine, pas sur l'ordre du JSON.
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch { /* valeur non JSON */ }
      const exp = JSON.parse(expected) as Record<string, unknown>;
      if (
        parsed && parsed.value === exp.value && parsed.label === exp.label
      ) same += n;
      else {
        diff += n;
        divergent.push(`${key} = ${raw.slice(0, 60)} ×${n}`);
      }
    }
    console.log(
      `\n   lignes dont la VALEUR est encore celle de la graine  ${lpad(same, 7)}   ${
        pct(same, same + diff)
      }`,
    );
    console.log(
      `   lignes dont la valeur a bougé                        ${lpad(diff, 7)}   ${
        pct(diff, same + diff)
      }`,
    );
    for (const d of divergent.slice(0, 20)) console.log(`      · ${d}`);
  }

  if (activity !== null) {
    const active = new Set(activity.map((a) => String(a.user_id)));
    bearersWithActivity =
      perUser!.filter((r) => active.has(String(r.user_id))).length;
    const rowsWithActivity = perUser!
      .filter((r) => active.has(String(r.user_id)))
      .reduce((s, r) => s + Number(r.n ?? 0), 0);
    console.log(
      `\n   porteurs ayant AU MOINS UN tour de chat             ${
        lpad(bearersWithActivity, 7)
      }   ${pct(bearersWithActivity, bearers)}`,
    );
    console.log(
      `   lignes appartenant à un porteur qui a parlé          ${
        lpad(rowsWithActivity, 7)
      }   ${pct(rowsWithActivity, totalRows)}`,
    );
    console.log(
      `   ⇒ les autres ne sont JAMAIS lues: aucun tour ne les charge.`,
    );
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// LES GARDES
// ---------------------------------------------------------------------------

console.log("── ⑨ LES GARDES ─────────────────────────────────────────────────────────\n");

guard(
  triggerPresent && triggerCallsSeed && seedInserts && seedTuples.length > 0,
  "G1 · un écrivain ATTEIGNABLE existe",
  triggerPresent && triggerCallsSeed && seedInserts
    ? `trigger → seed_default_coach_preferences → ${seedTuples.length} lignes/compte`
    : "aucun écrivain atteignable identifié",
);

const chainOk = chain.every((l) => l.ok);
guard(
  chainOk,
  "G2 · un lecteur ATTEINT le prompt",
  chainOk
    ? "les 6 maillons sont présents sur la source exécutée"
    : `maillons rompus : ${chain.filter((l) => !l.ok).map((l) => l.label).join(" · ")}`,
);

const unnamedDead = symUses.filter((u) =>
  u.prod.length === 0 && u.test.length === 0 && !KNOWN_DEAD_EXPORTS.has(u.sym)
);
const resurrected = [...KNOWN_DEAD_EXPORTS].filter((s) =>
  symUses.some((u) => u.sym === s && (u.prod.length > 0 || u.test.length > 0))
);
guard(
  unnamedDead.length === 0 && resurrected.length === 0,
  "G3 · aucun export mort NON NOMMÉ, aucun ressuscité",
  unnamedDead.length === 0 && resurrected.length === 0
    ? `${KNOWN_DEAD_EXPORTS.size} morts nommés, toujours morts`
    : `non nommés : ${unnamedDead.map((u) => u.sym).join(", ") || "—"} · ressuscités : ${
      resurrected.join(", ") || "—"
    }`,
);

guard(
  inExportScope || namedInAQualifier,
  "G4 · RGPD export : exporté OU nommé exclu",
  inExportScope
    ? "exporté par account-export-v1"
    : namedInAQualifier
    ? "NON exporté, mais NOMMÉ dans A_QUALIFIER"
    : "ni exporté ni nommé — trou muet",
);

guard(
  fkCascade && purgeDeletesAuthUser && purgeCallsRpc,
  "G5 · RGPD suppression : la cascade tient",
  fkCascade && purgeDeletesAuthUser && purgeCallsRpc
    ? "FK ON DELETE CASCADE + purge_auth_user + appel du cron"
    : "la cascade ne tient pas",
);

// G6 — LE PLAFOND, ET IL N'EST NULLE PART.
// ⛔ Ni `getUserProfileFacts` ni le formateur ne bornent. Le seul plafond du
// chemin est dans `agents/companion.ts` — et il est INATTEIGNABLE: sa porte
// d'entrée teste `startsWith("coach.")` sur des lignes qui commencent par
// « - ». La garde EXIGE que le plafond soit atteignable, pas qu'il existe:
// un plafond écrit derrière une porte fermée est un plafond qui n'existe pas,
// et il ressemble trait pour trait à un plafond qui marche.
guard(
  compactorOnPath && Number.isFinite(compactorCap) && compactorCap > 0 &&
    !compactorIsNoop,
  "G6 · le plafond du prompt est ATTEIGNABLE",
  !compactorOnPath
    ? "aucun compacteur sur le chemin du prompt"
    : !Number.isFinite(compactorCap)
    ? "compacteur présent, plafond introuvable dans sa source"
    : compactorIsNoop
    ? `⛔ NO-OP : la porte \`startsWith("${compactorGatePrefix}")\` laisse passer ${gateMatches} ligne sur ${renderedLines.length} ` +
      `⇒ le plafond de ${compactorCap} n'a jamais servi ; en amont R1 ${
        r1HasCap ? "borne" : "ne borne RIEN"
      } et le formateur ${formatterHasCap ? "borne" : "ne borne RIEN"}`
    : `plafond ${compactorCap} lignes, porte passante (${gateMatches}/${renderedLines.length})`,
);

guard(
  dbAvailable,
  "G7 · la mesure DB existe",
  dbAvailable
    ? `${totalRows} lignes lues, ${bearers} porteurs, ${authUsers} comptes`
    : "dumps NDJSON absents ou vides — aucun chiffre publié",
);

// ---------------------------------------------------------------------------
// LA QUESTION, CHIFFRÉE
// ---------------------------------------------------------------------------

console.log("\n── ⑩ LA QUESTION, CHIFFRÉE — ⛔ ELLE N'EST PAS TRANCHÉE ICI ─────────────\n");
const blockTokens = estTokens(seededBlock) +
  estTokens("x".repeat(consigneLen));
if (dbAvailable) {
  console.log(
    `   Sur ${totalRows} lignes, ${nonDefaultRows} ne viennent pas de la graine (${
      pct(nonDefaultRows, totalRows)
    }).`,
  );
  console.log(
    `   Le seul écrivain de code (\`upsertUserProfileFactWithEvent\`) a 0 importateur.`,
  );
  console.log(
    `   Le bloc « USER MODEL (FACTS) » part à CHAQUE tour companion : ≈ ${blockTokens} tokens,`,
  );
  console.log(
    `   et il présente ${seedTuples.length} valeurs SEMÉES comme des « facts » sur l'utilisateur.`,
  );
  console.log(
    `\n   ⇒ QUESTION : garde-t-on un bloc de ${blockTokens} tokens par tour qui affirme au`,
  );
  console.log(
    `      modèle ${seedTuples.length} préférences que ${pct(totalRows - nonDefaultRows, totalRows)} des lignes`,
  );
  console.log(
    `      n'ont jamais reçues d'un humain ? La réponse appartient au propriétaire.`,
  );
} else {
  console.log(
    `   ⚠️ La moitié DB de la question est EN ATTENTE. Ce qui est déjà CHIFFRÉ sans la base :`,
  );
  console.log(
    `\n   ① Le seul écrivain vivant est un TRIGGER, et il écrit ${seedTuples.length} lignes littérales`,
  );
  console.log(
    `      par profil, toutes en \`source_type='system_default'\`. Le seul port d'écriture`,
  );
  console.log(
    `      qui permettrait un CHOIX humain — \`upsertUserProfileFactWithEvent\` — a`,
  );
  console.log(`      0 importateur, production ET test.`);
  console.log(
    `\n   ② Le bloc part à CHAQUE tour companion : ${
      estTokens(survivingBlock)
    } tokens de données + ${Math.ceil(consigneLen / 4)} tokens`,
  );
  console.log(
    `      de consigne = ${blockTokens} tokens, et le seul plafond du chemin est un NO-OP mesuré.`,
  );
  console.log(
    `\n   ③ Sur les ${seedTuples.length} clés, UNE SEULE a un effet déterministe : \`coach.question_tendency\``,
  );
  console.log(
    `      (\`parseQuestionTendencyFromContext\` → \`buildQuestionRhythmGuide\`), et elle est`,
  );
  console.log(
    `      relue DANS LE TEXTE DU PROMPT, pas dans la ligne de base. Les ${
      seedTuples.length - 1
    } autres n'ont`,
  );
  console.log(`      aucun lecteur qui BRANCHE : elles sont de la prose.`);
  console.log(
    `\n   ⇒ QUESTION RENDUE DÉCIDABLE, NON TRANCHÉE : ${blockTokens} tokens par tour, dont ${
      Math.ceil(consigneLen / 4)
    }`,
  );
  console.log(
    `      d'instruction pour ${seedTuples.length - 1} clés qui ne branchent rien — les garde-t-on ?`,
  );
  console.log(
    `      ⛔ Le dénominateur qui manque (part réelle du prompt d'un tour) est EN ATTENTE :`,
  );
  console.log(
    `      select percentile_cont(0.5) within group (order by prompt_tokens)`,
  );
  console.log(
    `      from llm_usage_events where operation_family <> 'plan_generation';`,
  );
  console.log(
    `\n   ⛔ AUCUNE SUPPRESSION N'EST FAITE NI PROPOSÉE ICI. La table porte des données`,
  );
  console.log(
    `      personnelles, elle n'est PAS exportée, et le choix appartient au propriétaire.`,
  );
}

console.log("\n═══════════════════════════════════════════════════════════════════════════");
if (failures.length === 0) {
  console.log("TOUTES LES GARDES PASSENT");
} else {
  console.log(`⛔ ${failures.length} GARDE(S) MORDENT :`);
  for (const f of failures) console.log(`   · ${f}`);
}
for (const n of notes) console.log(n);
console.log("═══════════════════════════════════════════════════════════════════════════");

Deno.exit(failures.length === 0 ? 0 : 1);
