#!/usr/bin/env node
// token-lint.mjs — KEEL token linter (CONTRACT.md R1/R7 + NON-INPUTS).
// Zero external dependencies. Scans ONLY the KEEL surfaces; the French legacy
// codebase is deliberately out of scope.
//
// Assertions:
//   1. R1  — no non-ASCII character inside string literals of keel token/enum
//            files (tokens.ts, relations.ts, CHECK clauses of keel migrations).
//            Comments and i18n/locale files are exempt.
//   2.      anti-explosion — no MEASURE value may equal a SUBSTANCE_REFS slug
//            (identity lives in substance_ref, never in the measure enum).
//   3. R7  — a keel migration table with a `measure` column must carry the
//            CHECK tying measure IN ('dose','micronutrient') to substance_ref.
//   4.      NON-INPUT #1 — no *evaluat* file imports relations.ts or mentions
//            commitment_relations (relations are render/safety only).
//   5. R1  — no French weekday literal in keel code surfaces outside i18n/fr.
//   6. R1  — no INTERNAL IDENTIFIER inside a value of a locale seed: no
//            snake_case slug, no `<name>-v<n>` function name. Keys are tokens
//            and stay snake_case; values are the only text a coach ever reads.
//
// Exit 1 with a file:line list on any violation; "token-lint OK (N files scanned)"
// otherwise. A missing tokens.ts (built in parallel) is a warning, not a crash.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const violations = []; // {file, line, rule, message}
const warnings = [];

function violation(file, line, rule, message) {
  violations.push({ file: path.relative(ROOT, file), line, rule, message });
}

// ---------------------------------------------------------------------------
// Surface collection
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const SURFACE_DIRS = [
  path.join(ROOT, "supabase", "functions", "_shared", "keel"),
  path.join(ROOT, "frontend", "src", "keel"),
  path.join(ROOT, "docs", "keel"),
];

const migrationsDir = path.join(ROOT, "supabase", "migrations");
const keelMigrations = fs.existsSync(migrationsDir)
  ? fs
      .readdirSync(migrationsDir)
      .filter((f) => /keel/i.test(f) && f.endsWith(".sql"))
      .map((f) => path.join(migrationsDir, f))
  : [];

const files = [...SURFACE_DIRS.flatMap((d) => walk(d)), ...keelMigrations];

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

// i18n exemptions (R1: content files, not token files)
function isI18nExempt(file) {
  const r = rel(file);
  return (
    /^frontend\/src\/keel\/i18n\/[^/]+\.ts$/.test(r) ||
    /^supabase\/functions\/_shared\/keel\/locale[^/]*\.ts$/.test(r) ||
    // Les PACKS DE LIBELLÉS côté serveur (`labels.en.ts`, `labels.fr.ts`, et
    // l'accesseur `labels.ts`). L'exemption ne couvrait que le seed du front,
    // et la règle R1-days mordait sur `labels.fr.ts` — dont la raison d'être
    // est précisément de porter « lundi » en face du jeton `mon`. R1 interdit
    // un jour français comme DONNÉE; un pack de libellés est l'endroit exact
    // où la traduction est légitime, et le seul.
    /^supabase\/functions\/_shared\/keel\/labels(\.[a-z]{2})?\.ts$/.test(r) ||
    // Le lexique des DÉTECTEURS DE FUITE: il porte l'union EN+FR des noms de
    // nutriments et du vocabulaire métrique. Ce sont des motifs de détection,
    // jamais des jetons écrits en base.
    /^supabase\/functions\/_shared\/keel\/nutrition_lexicon\.ts$/.test(r)
  );
}

// ---------------------------------------------------------------------------
// Lightweight TS/JS scanner: string literals + code-with-comments-stripped,
// both with line numbers. Good enough for token files; no external parser.
// ---------------------------------------------------------------------------

function scanTs(source) {
  const literals = []; // {value, line}
  let stripped = ""; // comments blanked out, strings kept
  let line = 1;
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "\n") {
      line++;
      stripped += c;
      i++;
    } else if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") { stripped += " "; i++; }
    } else if (c === "/" && next === "*") {
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") { line++; stripped += "\n"; } else stripped += " ";
        i++;
      }
      stripped += "  ";
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      // UNE APOSTROPHE N'EST PAS TOUJOURS UNE QUOTE.
      //
      // Ce scanner traitait tout `'` comme l'ouverture d'une chaîne. Dans une
      // base francophone c'est faux une ligne sur deux: le `'` de « c'est »,
      // en texte JSX ou dans un commentaire, ouvrait un littéral FANTÔME qui
      // courait jusqu'à l'apostrophe suivante — parfois 90 lignes plus bas.
      // Les chaînes étant CONSERVÉES dans `stripped`, tout ce que ce faux
      // littéral avalait (délimiteurs de commentaires compris) revenait dans
      // le texte scanné: `StudentWeekPlanPage.tsx` remontait ainsi deux
      // « dimanche » situés dans des COMMENTAIRES, que la règle R1-days est
      // censée ignorer. Faux positif d'un côté, et surtout faux NÉGATIF de
      // l'autre — le vrai code avalé n'était plus analysé du tout.
      //
      // La règle qui tranche est une règle du langage, pas une heuristique:
      // `'...'` et `"..."` ne peuvent PAS contenir un saut de ligne brut.
      // Seul le template literal le peut. Une quote non refermée avant la fin
      // de ligne n'était donc pas une quote: c'est du texte, on l'émet tel
      // quel et on avance d'un seul caractère.
      const quote = c;
      const startLine = line;
      let value = "";
      let j = i + 1;
      let closed = false;
      let spannedLines = 0;
      while (j < n) {
        const ch = source[j];
        if (ch === "\\") {
          value += ch + (source[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (ch === quote) {
          closed = true;
          break;
        }
        if (ch === "\n") {
          if (quote !== "`") break; // pas une chaîne: on abandonne
          spannedLines++;
        }
        value += ch;
        j++;
      }
      if (!closed) {
        stripped += c;
        i++;
        continue;
      }
      stripped += source.slice(i, j + 1);
      line += spannedLines;
      i = j + 1;
      literals.push({ value, line: startLine });
    } else {
      stripped += c;
      i++;
    }
  }
  return { literals, stripped };
}

function stripSqlComments(source) {
  // Blank out -- line comments and /* */ blocks, preserving newlines.
  return source
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function lineOfIndex(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}

function firstNonAscii(value) {
  for (const ch of value) if (ch.codePointAt(0) > 0x7f) return ch;
  return null;
}

// ---------------------------------------------------------------------------
// Alias-map exemption. tokens.ts documents "historical aliases tolerated ON
// INPUT ('monday', 'lundi' -> 'mon'), NEVER persisted": alias KEYS may carry
// legacy/foreign spellings ('µg', 'lundi') because the parser normalizes them
// to canonical ASCII tokens or throws (R7). Canonical arrays stay fully checked.
// ---------------------------------------------------------------------------

function aliasSpans(stripped) {
  // Line ranges of declarations whose identifier contains ALIAS.
  const spans = [];
  const declRe = /\b[A-Za-z_$]*ALIAS[A-Za-z_$]*\b[^=;]*=\s*\{/g;
  let m;
  while ((m = declRe.exec(stripped)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let j = open;
    for (; j < stripped.length; j++) {
      if (stripped[j] === "{") depth++;
      else if (stripped[j] === "}" && --depth === 0) break;
    }
    spans.push({ start: lineOfIndex(stripped, open), end: lineOfIndex(stripped, j) });
  }
  return spans;
}

const inSpans = (spans, line) => spans.some((s) => line >= s.start && line <= s.end);

// ---------------------------------------------------------------------------
// Assertion 1 — R1: ASCII-only string literals in token/enum files
// ---------------------------------------------------------------------------

const tokenTsFiles = files.filter(
  (f) => ["tokens.ts", "relations.ts"].includes(path.basename(f)) && !isI18nExempt(f),
);

for (const file of tokenTsFiles) {
  const { literals, stripped } = scanTs(fs.readFileSync(file, "utf8"));
  const exempt = aliasSpans(stripped);
  for (const lit of literals) {
    if (inSpans(exempt, lit.line)) continue; // input-normalization alias, not a token
    const bad = firstNonAscii(lit.value);
    if (bad) {
      violation(file, lit.line, "R1", `non-ASCII character ${JSON.stringify(bad)} in string literal (tokens are ASCII snake_case English)`);
    }
  }
}

// Migrations: CHECK clauses must hold ASCII-only string literals.
for (const file of keelMigrations) {
  const sql = stripSqlComments(fs.readFileSync(file, "utf8"));
  const checkRe = /\bCHECK\s*\(/gi;
  let m;
  while ((m = checkRe.exec(sql)) !== null) {
    // Walk the balanced parens of this CHECK (...) clause.
    let depth = 0;
    let j = sql.indexOf("(", m.index);
    const start = j;
    for (; j < sql.length; j++) {
      if (sql[j] === "(") depth++;
      else if (sql[j] === ")" && --depth === 0) break;
    }
    const clause = sql.slice(start, j + 1);
    const litRe = /'((?:[^']|'')*)'/g;
    let lm;
    while ((lm = litRe.exec(clause)) !== null) {
      const bad = firstNonAscii(lm[1]);
      if (bad) {
        violation(file, lineOfIndex(sql, start + lm.index), "R1", `non-ASCII character ${JSON.stringify(bad)} in CHECK string literal`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Assertion 2 — anti-explosion: MEASURE values must not be substance slugs
// ---------------------------------------------------------------------------

function extractDeclarationLiterals(stripped, literals, source, namePattern) {
  // Find `... <NAME-matching-pattern> ... = [ ... ]` (or { ... }) and return
  // the string literals whose source position falls inside the bracket span.
  const declRe = new RegExp(`\\b(${namePattern})\\b[^=;]*=\\s*[\\[{]`, "g");
  const m = declRe.exec(stripped);
  if (!m) return null;
  const open = stripped.indexOf(stripped[m.index + m[0].length - 1], m.index + m[0].length - 1);
  const openChar = stripped[open];
  const closeChar = openChar === "[" ? "]" : "}";
  let depth = 0;
  let j = open;
  for (; j < stripped.length; j++) {
    if (stripped[j] === openChar) depth++;
    else if (stripped[j] === closeChar && --depth === 0) break;
  }
  const startLine = lineOfIndex(source, open);
  const endLine = lineOfIndex(source, j);
  return literals.filter((l) => l.line >= startLine && l.line <= endLine);
}

const tokensTs = tokenTsFiles.find((f) => path.basename(f) === "tokens.ts");
if (!tokensTs) {
  warnings.push("tokens.ts not found under keel surfaces (built in parallel?) — R1 literal scan and anti-explosion check skipped for it");
} else {
  const source = fs.readFileSync(tokensTs, "utf8");
  const { literals, stripped } = scanTs(source);
  const measures = extractDeclarationLiterals(stripped, literals, source, "[A-Za-z_]*MEASURE[A-Za-z_]*");
  const substances = extractDeclarationLiterals(stripped, literals, source, "[A-Za-z_]*SUBSTANCE[A-Za-z_]*");
  if (!measures) warnings.push(`${rel(tokensTs)}: no MEASURE declaration found — anti-explosion check skipped`);
  if (!substances) warnings.push(`${rel(tokensTs)}: no SUBSTANCE_REFS declaration found — anti-explosion check skipped`);
  if (measures && substances) {
    const slugSet = new Set(substances.map((l) => l.value));
    for (const m of measures) {
      if (slugSet.has(m.value)) {
        violation(tokensTs, m.line, "anti-explosion", `MEASURE value '${m.value}' matches a SUBSTANCE_REFS slug — identity lives in substance_ref, not in the measure enum`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Assertion 3 — R7: measure column requires the substance_ref CHECK
// ---------------------------------------------------------------------------

for (const file of keelMigrations) {
  const sql = stripSqlComments(fs.readFileSync(file, "utf8"));
  const createRe = /\bCREATE\s+TABLE\b[^;]*;/gi;
  let m;
  while ((m = createRe.exec(sql)) !== null) {
    const stmt = m[0];
    const tableName = (stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/i) || [])[1] || "?";
    // Column definition `measure ...` at the start of a line inside the statement.
    const colMatch = stmt.match(/^\s*"?measure"?\s+\w/im);
    if (!colMatch) continue;
    // R7 corollary: measure IN ('dose','micronutrient') => substance_ref NOT NULL.
    const hasGuard = /\bCHECK\s*\([^;]*\bmeasure\b[\s\S]*?\bsubstance_ref\b[\s\S]*?NOT\s+NULL/i.test(stmt)
      || /\bCHECK\s*\([^;]*\bsubstance_ref\b[\s\S]*?NOT\s+NULL[\s\S]*?\bmeasure\b/i.test(stmt);
    if (!hasGuard) {
      violation(file, lineOfIndex(sql, m.index + colMatch.index), "R7", `table ${tableName} has a measure column without the CHECK tying measure IN ('dose','micronutrient') to substance_ref NOT NULL`);
    }
  }
}

// ---------------------------------------------------------------------------
// Assertion 4 — NON-INPUT: evaluator files never touch relations
// ---------------------------------------------------------------------------

const evaluatorFiles = files.filter((f) => /evaluat/i.test(path.basename(f)));
for (const file of evaluatorFiles) {
  const source = fs.readFileSync(file, "utf8");
  const importRe = /(?:import[^;]*?from\s*|import\s*\(\s*|require\s*\(\s*|export[^;]*?from\s*)['"]([^'"]*relations(?:\.ts)?)['"]/g;
  let m;
  while ((m = importRe.exec(source)) !== null) {
    violation(file, lineOfIndex(source, m.index), "non-input", `evaluator imports '${m[1]}' — commitment_relations are render/safety guidance only, never an evaluator input`);
  }
  const mentionRe = /\bcommitment_relations\b/g;
  while ((m = mentionRe.exec(source)) !== null) {
    violation(file, lineOfIndex(source, m.index), "non-input", "evaluator mentions commitment_relations — sealed out of the evaluator (CONTRACT non-input #1)");
  }
}

// ---------------------------------------------------------------------------
// Assertion 5 — no French weekday literal in keel code surfaces (outside i18n/fr)
// ---------------------------------------------------------------------------

const FRENCH_DAYS = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi;
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".json"]);
const TS_LIKE = new Set([".ts", ".tsx", ".js", ".mjs"]);
for (const file of files) {
  if (!CODE_EXT.has(path.extname(file))) continue; // docs prose is content, not tokens (R1)
  const r = rel(file);
  if (/\/i18n\/fr[^/]*\.(ts|json)$/.test(r) || isI18nExempt(file)) continue;
  // Test files may use French day literals as parser fixtures (asserting
  // normalization or the R7 throw on "dimanche") — that is the guard, not the bug.
  if (/(_test|\.test)\.(ts|tsx|js|mjs)$/.test(r)) continue;
  const raw = fs.readFileSync(file, "utf8");
  let scanned = raw; // comment-stripped, newline-preserving
  let exempt = [];
  if (TS_LIKE.has(path.extname(file))) {
    const { stripped } = scanTs(raw);
    scanned = stripped;
    exempt = aliasSpans(stripped); // input alias maps (lundi -> 'mon') are the fix, not the bug
  } else if (path.extname(file) === ".sql") {
    scanned = stripSqlComments(raw);
  }
  let m;
  FRENCH_DAYS.lastIndex = 0;
  while ((m = FRENCH_DAYS.exec(scanned)) !== null) {
    const line = lineOfIndex(scanned, m.index);
    if (inSpans(exempt, line)) continue;
    violation(file, line, "R1-days", `French weekday literal '${m[1]}' — day tokens are 'mon'..'sun' (see planSchedule.ts:289 bug class)`);
  }
}

// ---------------------------------------------------------------------------
// Assertion 6 — R1 read from the other end: a locale seed VALUE is prose.
//
// The rule everywhere else in this file protects the tokens from the prose. This
// one protects the prose from the tokens, and it exists because of a real
// failure: the first dietitian to open the import screen read
//
//     Each section carries its own timestamped approval [...] it is what
//     plan-publish-v1 writes to coach_access_events.
//     Mark clinician_ordered
//
// — an edge-function name, a table name and a column VALUE, on the screen that
// is the product's front door. None of it was actionable; all of it said "this
// software was written for someone else".
//
// KEYS are exempt by construction: `when.moment.on_waking` is a token and must
// stay snake_case. Only the right-hand side is checked, and only in the locale
// seeds — the one place all coach- and student-facing text is supposed to live.
// Comments are stripped first: a comment NAMING the column a string is about is
// exactly the documentation we want to keep.
// ---------------------------------------------------------------------------

const INTERNAL_IN_PROSE = [
  {
    re: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/,
    why: "snake_case identifier (a column, table or enum value) in text a coach reads",
  },
  {
    re: /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v\d+\b/,
    why: "edge-function name in text a coach reads",
  },
];

// The locale seeds, and ONLY those — listés par leur nom, pas déduits du
// dossier.
//
// Le filtre excluait `t.ts` par basename et prenait tout le reste de
// `i18n/` pour un seed. Ça marchait tant que le dossier ne contenait QUE le
// seed et sa machinerie; le jour où il gagne `catalog.ts`, `runtime.ts` et
// `fr.ts`, la règle R1-prose scanne les clés de `localStorage` et les
// noms de namespace comme si un coach les lisait. Un lint qui remonte des
// faux positifs sur des fichiers d'infrastructure est un lint qu'on apprend
// à ignorer, ce qui coûte plus cher que ce qu'il garde.
//
// Une liste explicite vieillit dans le bon sens: ajouter une langue oblige à
// ajouter son fichier ici, et c'est une ligne visible en diff.
// ⚠️ `fr.public.ts` A ÉTÉ RENOMMÉ `fr.ts` (lot 2): le pack ne couvre plus la
// seule vitrine. Le nom vivait ici ET dans `i18n/`, et l'oublier de ce côté
// aurait fait scanner le pack français comme du code ordinaire.
const LOCALE_SEED_BASENAMES = new Set(["en.ts", "fr.ts"]);
const localeSeeds = files.filter((f) =>
  /^frontend\/src\/keel\/i18n\/[^/]+\.ts$/.test(rel(f)) &&
  LOCALE_SEED_BASENAMES.has(path.basename(f))
);

// LES CLÉS DONT LA VALEUR *EST* UN JETON, ET PAS DE LA PROSE.
//
// La règle R1-prose interdit un identifiant de stockage dans du texte qu'un
// coach LIT. Il existe un cas — un seul aujourd'hui — où la valeur n'est pas du
// texte à lire mais un EXEMPLE DE FORMAT: le champ « la chose elle-même » d'un
// interdit de doctrine attend un jeton ASCII snake_case, parce que le verrou
// déterministe branche dessus (`_shared/keel/doctrine.ts`: « `token` is ASCII
// snake_case (R1) because code branches on it »). Le placeholder montre donc la
// FORME attendue, et cette forme est la même dans toutes les langues — c'est R1
// qui l'impose, pas un oubli de traduction.
//
// Une liste de CLÉS EXACTES, et surtout pas un motif: la valeur peut changer,
// la clé non, et une entrée de trop se voit en diff. Le jour où ce champ cesse
// d'attendre un jeton, la ligne part avec lui.
const TOKEN_SHAPED_KEYS = new Set([
  "coach.doctrine.forbidden.token_placeholder",
]);

for (const file of localeSeeds) {
  const raw = fs.readFileSync(file, "utf8");
  const { stripped } = scanTs(raw); // comments blanked, strings and offsets kept
  const literalRe = /"((?:[^"\\\n]|\\.)*)"/g;
  let m;
  let lastKey = null;
  while ((m = literalRe.exec(stripped)) !== null) {
    // A literal immediately followed by ':' is a message KEY, not prose.
    if (/^\s*:/.test(stripped.slice(m.index + m[0].length))) {
      lastKey = m[1];
      continue;
    }
    if (lastKey !== null && TOKEN_SHAPED_KEYS.has(lastKey)) continue;
    for (const rule of INTERNAL_IN_PROSE) {
      const hit = rule.re.exec(m[1]);
      if (hit) {
        violation(
          file,
          lineOfIndex(stripped, m.index),
          "R1-prose",
          `'${hit[0]}' in a locale value — ${rule.why}: ${JSON.stringify(m[1].slice(0, 90))}`,
        );
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(`warning: ${w}`);

if (violations.length > 0) {
  for (const v of violations) {
    console.error(`${v.file}:${v.line} [${v.rule}] ${v.message}`);
  }
  console.error(`token-lint FAILED (${violations.length} violation${violations.length > 1 ? "s" : ""}, ${files.length} files scanned)`);
  process.exit(1);
}

console.log(`token-lint OK (${files.length} files scanned)`);
