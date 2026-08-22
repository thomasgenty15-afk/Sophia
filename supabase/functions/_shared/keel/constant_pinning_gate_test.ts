// LA RÈGLE DE DÉPÔT — changer une constante numérique doit faire rougir un test.
//
// ⛔ LE DÉFAUT QUE CE FICHIER FERME. Un test qui écrit
// `assertEquals(calcul(x), x * MA_CONSTANTE)` **importe** la constante et
// recalcule l'attendu avec elle. Changer la constante change les DEUX côtés de
// l'égalité: le test reste VERT, et le dépôt vient de perdre un chiffre sans
// que personne le voie. Mesuré: `mouth_anchor_test.ts`, 35 tests, 0 échec en
// 31 ms, et `COMPOSED_DISH_MEAL_SHARE` passé de 0,42 à 1,0 n'en fait rougir
// aucun.
//
// ⛔ CE FICHIER N'EST PAS UN COMPTEUR, C'EST UNE LISTE FERMÉE. Un compteur qui
// monte et redescend est indiscernable d'un compteur juste (cicatrice `L19b`:
// « un compteur qui monte sans son dénominateur est indiscernable d'une
// régression »). Ici, la dette est ÉNUMÉRÉE. Une constante numérique exportée,
// importée par un test, et non épinglée, qui n'est PAS dans la liste ⇒ ROUGE.
//
// ── CE QUE LE ROUGE DEMANDE, ET IL Y A DEUX RÉPONSES LÉGITIMES ──────────────
//   ① ÉPINGLER: une ligne dans `constant_pins_test.ts`
//        Deno.test("épinglage — X vaut 42", () => assertEquals(X, 42));
//   ② ASSUMER: ajouter le nom à `DETTE_NON_EPINGLEE` ci-dessous.
// ⚠️ ② est permis et il est VISIBLE — c'est tout ce qu'on lui demande. Ce qui
// n'est plus possible est d'ajouter une constante sans que personne l'apprenne.
//
// ── LE RÉTRÉCISSEMENT NE ROUGIT PAS, ET C'EST UN ARBITRAGE ÉCRIT ────────────
// ⚠️ Un nom de la liste qui n'est plus trouvé (constante épinglée, renommée,
// supprimée, ou test retiré) NE fait PAS rougir. Mesuré le 2026-08-22: l'arbre
// de travail porte 68 scalaires non épinglés contre 58 à HEAD — 13 noms
// n'existent QUE dans l'arbre, parce que le dépôt est partagé et durablement
// sale. Une liste qui rougirait aussi en rétrécissant serait rouge en
// permanence pour toutes les sessions, et « une garde cassée bloque tout et
// ressemble à une garde qui marche ». Registre §⑨.
//
// ── ⛔ ET DONC: L'ANTI-GARDE-MORTE ─────────────────────────────────────────
// Une liste fermée dont le scanner casse rend un ensemble VIDE — donc verte
// pour toujours, et indiscernable d'un dépôt sans dette. Le dernier test de ce
// fichier asserte donc PAR NOM que des sentinelles sont vues TROUVÉES **et**
// ÉPINGLÉES. Si le scan meurt, si le répertoire bouge, si la détection
// d'import ou d'épinglage se casse, c'est cette assertion qui tombe.
//
// PURE: la mécanique est une fonction d'un corpus `nom de fichier -> source`.
// Elle est éprouvée sur des corpus SYNTHÉTIQUES — son cas qui PASSE et son cas
// qui MORD — avant d'être lâchée sur le vrai répertoire.

import { assert, assertEquals } from "jsr:@std/assert@1";

// ═══════════════════════════════════════════════════════════════════════════
// LA MÉCANIQUE
// ═══════════════════════════════════════════════════════════════════════════

export type Corpus = ReadonlyMap<string, string>;

export type ConstantRow = {
  readonly name: string;
  readonly kind: "scalar" | "record";
  readonly module: string;
  readonly tests: readonly string[];
  /** le fichier de test qui l'épingle, ou `null` */
  readonly pinnedIn: string | null;
};

/**
 * RETIRE COMMENTAIRES ET CONTENU DES CHAÎNES.
 *
 * ⛔ SANS ÇA LE SCAN EST FAUX DANS LES DEUX SENS, et ce fichier-ci en est la
 * preuve vivante: il PORTE des corpus synthétiques écrits dans des gabarits,
 * qui contiennent littéralement `export const ...` et `assertEquals(...)`.
 * Un grep naïf les compterait comme des porteurs vivants (cicatrice
 * `caller-audit-must-strip-comments`).
 */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += quote;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) break;
        if (src[i] === "\n") out += "\n"; // on garde les lignes alignées
        i++;
      }
      out += quote;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const SCALAR_RE =
  /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;]+?)?=\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*(?:as\s+const\s*)?;/g;

/**
 * Un `Record` n'est retenu QUE si TOUTES ses valeurs sont des littéraux
 * numériques — `MEAL_COMPONENT_KCAL`, `SLOT_DAY_WEIGHT`. Un objet de chaînes
 * ou de fonctions n'est pas une constante numérique, et l'y mettre noierait la
 * liste sous du bruit.
 */
const RECORD_RE =
  /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;]+?)?=\s*(?:Object\.freeze\(\s*)?\{([^{}]*)\}/g;

const RECORD_ENTRY_RE =
  /^(?:[A-Za-z_$][\w$]*|"[^"]*"|'[^']*'|\[[^\]]*\])\s*:\s*-?\d+(?:\.\d+)?$/;

const IMPORT_RE =
  /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']*["']/g;

const ASSERT = "assert(?:Equals|StrictEquals|AlmostEquals|ObjectMatch)";

/** Un nom est ÉPINGLÉ quand il est comparé à un LITTÉRAL, dans un sens ou dans
 * l'autre — jamais à une expression qui le contient. */
export function isPinnedIn(name: string, cleanTestSource: string): boolean {
  const patterns = [
    // assertEquals(NAME, 42) / assertEquals(NAME, 0.5)
    `${ASSERT}\\s*\\(\\s*${name}\\s*,\\s*-?\\d`,
    // assertEquals(42, NAME)
    `${ASSERT}\\s*\\(\\s*-?[\\d.]+\\s*,\\s*${name}\\s*[,)]`,
    // assertEquals(NAME, { … })  /  assertEquals(NAME, [ … ])  — l'objet ENTIER
    `${ASSERT}\\s*\\(\\s*${name}\\s*,\\s*[\\{\\[]`,
    // assert(NAME === 42)
    `assert\\s*\\(\\s*${name}\\s*===\\s*-?\\d`,
    `assert\\s*\\(\\s*-?[\\d.]+\\s*===\\s*${name}\\b`,
  ];
  return patterns.some((p) => new RegExp(p).test(cleanTestSource));
}

/**
 * LE SCAN. Rend une ligne par constante numérique exportée d'un module de
 * `_shared/keel` ET importée par au moins un `*_test.ts` du même répertoire.
 *
 * ⚠️ « importée par un test » est la portée VOULUE: une constante que rien ne
 * teste n'a pas d'épinglage à perdre. La règle vise le test complice, pas la
 * couverture.
 */
export function scanConstants(corpus: Corpus): ConstantRow[] {
  const srcFiles: string[] = [];
  const testFiles: string[] = [];
  for (const name of corpus.keys()) {
    if (!name.endsWith(".ts")) continue;
    (name.endsWith("_test.ts") ? testFiles : srcFiles).push(name);
  }

  const scalars = new Map<string, string>(); // nom -> module
  const records = new Map<string, string>();
  for (const file of srcFiles) {
    const clean = stripCommentsAndStrings(corpus.get(file)!);
    let m: RegExpExecArray | null;
    SCALAR_RE.lastIndex = 0;
    while ((m = SCALAR_RE.exec(clean))) {
      if (!scalars.has(m[1])) scalars.set(m[1], file);
    }
    RECORD_RE.lastIndex = 0;
    while ((m = RECORD_RE.exec(clean))) {
      const body = m[2].trim();
      if (!body) continue;
      const entries = body.split(",").map((e) => e.trim()).filter(Boolean);
      if (!entries.length) continue;
      if (!entries.every((e) => RECORD_ENTRY_RE.test(e))) continue;
      if (!scalars.has(m[1]) && !records.has(m[1])) records.set(m[1], file);
    }
  }

  const importedBy = new Map<string, Set<string>>();
  const cleanTests = new Map<string, string>();
  for (const file of testFiles) {
    const clean = stripCommentsAndStrings(corpus.get(file)!);
    cleanTests.set(file, clean);
    let m: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(clean))) {
      for (const raw of m[1].split(",")) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const name = trimmed.split(/\s+as\s+/)[0].replace(/^type\s+/, "").trim();
        if (!name) continue;
        let set = importedBy.get(name);
        if (!set) importedBy.set(name, set = new Set());
        set.add(file);
      }
    }
  }

  const rows: ConstantRow[] = [];
  const all: Array<[string, string, "scalar" | "record"]> = [
    ...[...scalars].map(([n, f]) => [n, f, "scalar"] as [string, string, "scalar"]),
    ...[...records].map(([n, f]) => [n, f, "record"] as [string, string, "record"]),
  ];
  for (const [name, module, kind] of all) {
    const tests = importedBy.get(name);
    if (!tests || tests.size === 0) continue;
    const sorted = [...tests].sort();
    const pinnedIn = sorted.find((t) => isPinnedIn(name, cleanTests.get(t)!)) ??
      null;
    rows.push({ name, kind, module, tests: sorted, pinnedIn });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function unpinnedNames(corpus: Corpus): string[] {
  return scanConstants(corpus).filter((r) => !r.pinnedIn).map((r) => r.name);
}

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ LA GARDE A SON CAS QUI PASSE — sur des corpus SYNTHÉTIQUES.
// Une garde qui n'a que des cas qui échouent est indiscernable d'une garde en
// panne (cicatrice `guards-need-a-passing-case`).
// ═══════════════════════════════════════════════════════════════════════════

const MODULE_SRC = [
  "export const SEUIL_DE_TEST = 42;",
  "export const PART_DE_TEST = 0.42;",
  "export const TABLE_DE_TEST = Object.freeze({ a: 1, b: 2 });",
  "export const MOTS_DE_TEST = Object.freeze({ a: 'x', b: 'y' });",
  "export const JAMAIS_TESTEE = 7;",
].join("\n");

function corpusOf(testSrc: string): Corpus {
  return new Map([["module.ts", MODULE_SRC], ["module_test.ts", testSrc]]);
}

Deno.test("✅ LE CAS QUI PASSE — tout est épinglé, la garde rend un ensemble VIDE", () => {
  const corpus = corpusOf([
    'import { SEUIL_DE_TEST, PART_DE_TEST, TABLE_DE_TEST } from "./module.ts";',
    "Deno.test('a', () => { assertEquals(SEUIL_DE_TEST, 42); });",
    "Deno.test('b', () => { assertEquals(PART_DE_TEST, 0.42); });",
    "Deno.test('c', () => { assertEquals(TABLE_DE_TEST, { a: 1, b: 2 }); });",
  ].join("\n"));
  assertEquals(unpinnedNames(corpus), []);
  // …et elle a bien VU les trois: un ensemble vide parce qu'on n'a rien lu
  // serait le même ensemble vide.
  assertEquals(scanConstants(corpus).length, 3);
});

Deno.test("⛔ LE CAS QUI MORD — une constante importée et NON épinglée sort", () => {
  const corpus = corpusOf([
    'import { SEUIL_DE_TEST, PART_DE_TEST } from "./module.ts";',
    "Deno.test('a', () => { assertEquals(SEUIL_DE_TEST, 42); });",
    // ⛔ le test COMPLICE: il importe la constante et recalcule avec elle.
    "Deno.test('b', () => { assertEquals(part(10), 10 * PART_DE_TEST); });",
  ].join("\n"));
  assertEquals(unpinnedNames(corpus), ["PART_DE_TEST"]);
});

Deno.test("une constante qu'AUCUN test n'importe n'est pas de la dette", () => {
  const corpus = corpusOf('import { SEUIL_DE_TEST } from "./module.ts";');
  const seen = scanConstants(corpus).map((r) => r.name);
  assertEquals(seen, ["SEUIL_DE_TEST"]);
  assert(!seen.includes("JAMAIS_TESTEE"));
});

Deno.test("un `Record` NON numérique n'entre pas dans la portée", () => {
  const corpus = corpusOf(
    'import { TABLE_DE_TEST, MOTS_DE_TEST } from "./module.ts";',
  );
  assertEquals(unpinnedNames(corpus), ["TABLE_DE_TEST"]);
});

Deno.test("⛔ un `export const` DANS UN COMMENTAIRE n'est pas un porteur vivant", () => {
  const corpus: Corpus = new Map([
    ["module.ts", "// export const FANTOME = 3;\n/* export const AUTRE = 4; */"],
    ["module_test.ts", 'import { FANTOME, AUTRE } from "./module.ts";'],
  ]);
  assertEquals(scanConstants(corpus), []);
});

Deno.test("⛔ un `export const` DANS UNE CHAÎNE non plus", () => {
  const corpus: Corpus = new Map([
    ["module.ts", "const gabarit = `export const FANTOME = 3;`;"],
    ["module_test.ts", 'import { FANTOME } from "./module.ts";'],
  ]);
  assertEquals(scanConstants(corpus), []);
});

Deno.test("⛔ un épinglage écrit DANS UN COMMENTAIRE n'épingle rien", () => {
  const corpus = corpusOf([
    'import { SEUIL_DE_TEST } from "./module.ts";',
    "// assertEquals(SEUIL_DE_TEST, 42);",
  ].join("\n"));
  assertEquals(unpinnedNames(corpus), ["SEUIL_DE_TEST"]);
});

Deno.test("l'épinglage se lit dans LES DEUX SENS et sous `assert(x === n)`", () => {
  for (
    const ligne of [
      "assertEquals(SEUIL_DE_TEST, 42);",
      "assertEquals(42, SEUIL_DE_TEST);",
      "assertStrictEquals(SEUIL_DE_TEST, 42);",
      "assert(SEUIL_DE_TEST === 42);",
    ]
  ) {
    const corpus = corpusOf(
      'import { SEUIL_DE_TEST } from "./module.ts";\n' + ligne,
    );
    assertEquals(unpinnedNames(corpus), [], ligne);
  }
});

Deno.test("⛔ comparer une constante à une EXPRESSION qui la contient n'épingle pas", () => {
  const corpus = corpusOf([
    'import { SEUIL_DE_TEST } from "./module.ts";',
    "assertEquals(SEUIL_DE_TEST, SEUIL_DE_TEST);",
    "assertEquals(double(SEUIL_DE_TEST), 2 * SEUIL_DE_TEST);",
  ].join("\n"));
  assertEquals(unpinnedNames(corpus), ["SEUIL_DE_TEST"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA LISTE FERMÉE — la dette du 2026-08-22, énumérée
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ CETTE LISTE NE GRANDIT PAS.
 *
 * Chacun de ces noms est une constante numérique exportée de `_shared/keel`,
 * importée par un test du même répertoire, et que ce test NE PEUT PAS faire
 * rougir. Ce n'est pas une liste d'exceptions tolérées pour toujours: c'est la
 * dette du jour où la règle a été posée, écrite pour qu'elle ne grossisse plus.
 *
 * Mesurée le 2026-08-22 sur l'UNION de HEAD (`ad1bf107`) et de l'arbre de
 * travail — les deux, parce que le dépôt est partagé: 62 noms.
 */
const DETTE_NON_EPINGLEE: ReadonlySet<string> = new Set([
  "ACTIVITY_SESSION_MAX_MINUTES",
  "BODY_MEASURE_BOUNDS",
  "BODY_SHARE_FACTOR_MAX",
  "BODY_SHARE_FACTOR_MIN",
  "BUDGET_MAX",
  "CHILD_ACTIVITY_FACTOR",
  "CHUNK_MAX_CHARS",
  "CITATION_QUOTE_MAX_CHARS",
  "COACH_BROADCAST_MAX_CHARS",
  "COACH_NOTE_MAX_CHARS",
  "CONTACT_SILENT_AFTER_HOURS",
  "CONTACT_SLIPPING_AFTER_HOURS",
  "COVERAGE_FLOOR_KCAL_PER_DAY",
  "DAY_ACTIVITY_BASE",
  "DISH_NAME_MAX_CHARS",
  "DRAFT_NOTE_MAX_CHARS",
  "FRY_OIL_UPTAKE_RATIO",
  "KCAL_PER_KG_BODY_MASS",
  "LOGGING_COVERAGE_MIN_DAYS",
  "MAINTENANCE_KCAL_PER_KG_HIGH",
  "MAINTENANCE_KCAL_PER_KG_LOW",
  "MAX_ACTIVITY_EMPHASES",
  "MAX_DAILY_PRACTICES",
  "MAX_DISMISSED",
  "MAX_DOCUMENT_PAGES",
  "MAX_ENVY_CHARS",
  "MAX_FIXED_INTAKES",
  "MAX_NAMED_AWAY_MOUTHS",
  "MAX_PLAUSIBLE_KCAL_PER_100G",
  "MAX_SCALE",
  "MAX_SINGLE_INGREDIENT_G",
  "MAX_TRADITIONS",
  "MAX_WEEKLY_BODY_FRACTION",
  "MEAL_PRECISION_TIMEOUT_MINUTES",
  "MEAL_SIZE_WEIGHT",
  "MERGE_MATERIAL_CAP",
  "MINOR_MAX_DAILY_DELTA_FRACTION",
  "MIN_NUTRITION_LINES",
  "MIN_SCALE",
  "PHOTO_INVITATION_ATTACH_WINDOW_MINUTES",
  "PHOTO_INVITATION_DAILY_CAP",
  "PORTION_ADJUST_STEP",
  "PROTOCOL_CHAT_BLOCK_LIMITS",
  "PULSE_IGNORED_STREAK",
  "RAW_WINDOW_DAYS",
  "RECALIBRATION_CAP",
  "RECALIBRATION_STEP",
  "RECALIBRATION_WEEKS",
  "REENGAGE_MAX_CHARS",
  "RESTRICTION_THRESHOLDS",
  "SCALE_DEAD_ZONE",
  "SHOPPING_CUTOFF_HOUR",
  "SPORT_PAL_PER_WEEKLY_SESSION",
  "SPORT_SESSIONS_PER_WEEK",
  // ⚠️ les deux suivantes appartiennent au lot `X1′` (la constante déclarée
  // plusieurs fois). Elles sont ici pour être VUES, pas pour être gelées: le
  // jour où `X1′` les unifie, elles disparaissent du scan et la garde ne
  // rougit pas pour autant.
  "TARGET_WEIGHT_KG_MAX",
  "TARGET_WEIGHT_KG_MIN",
  "TO_CATCH_UP_CAP",
  "UNQUANTIFIED_TERMS_NAMED",
  "WAIST_NOISE_CM",
  "WEEKLY_LABEL_MAX_CHARS",
  "WEIGHT_NOISE_KG",
  "YIELD_FACTORS",
]);

/**
 * ⛔ LES SENTINELLES DE L'ANTI-GARDE-MORTE.
 *
 * Elles doivent être vues TROUVÉES **et** ÉPINGLÉES sur le vrai répertoire.
 * Si le scan cesse de lire les fichiers, de reconnaître un `export const`, de
 * suivre un import ou de reconnaître un `assertEquals`, l'ensemble des non
 * épinglées devient VIDE — donc inclus dans la liste, donc VERT. C'est ce test
 * qui l'empêche, et il ne peut pas être satisfait par un scan mort.
 */
const SENTINELLES: readonly string[] = [
  "KEEL_MINOR_AGE", // scalaire entier, module propre
  "COMPOSED_DISH_MEAL_SHARE", // scalaire décimal, le cœur de la cicatrice
  "MEAL_COMPONENT_KCAL", // `Record` numérique épinglé en entier
  "BOX_FACTOR_MAX", // module `M`, épinglé depuis un fichier NEUF
];

const KEEL_DIR = new URL("./", import.meta.url);

async function readKeelCorpus(): Promise<Corpus> {
  const corpus = new Map<string, string>();
  for await (const entry of Deno.readDir(KEEL_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    corpus.set(
      entry.name,
      await Deno.readTextFile(new URL(entry.name, KEEL_DIR)),
    );
  }
  return corpus;
}

Deno.test("⛔ RÈGLE DE DÉPÔT — la liste des constantes non épinglées NE GRANDIT PAS", async () => {
  const rows = scanConstants(await readKeelCorpus());
  const nouvelles = rows
    .filter((r) => !r.pinnedIn && !DETTE_NON_EPINGLEE.has(r.name))
    .map((r) => `  ${r.name}  (${r.module})  vu par: ${r.tests.join(", ")}`);

  assertEquals(
    nouvelles,
    [],
    "\n⛔ CONSTANTE(S) NUMÉRIQUE(S) IMPORTÉE(S) PAR UN TEST QUI NE PEUT PAS " +
      "LES FAIRE ROUGIR:\n" + nouvelles.join("\n") +
      "\n\nDeux réponses, les deux légitimes:\n" +
      "  ① ÉPINGLER — une ligne dans `constant_pins_test.ts`:\n" +
      "       Deno.test(\"épinglage — X vaut 42\", () => assertEquals(X, 42));\n" +
      "  ② ASSUMER — ajouter le nom à `DETTE_NON_EPINGLEE` dans ce fichier.\n" +
      "⚠️ ② est permis. Ce qui ne l'est plus, c'est de le faire sans que " +
      "personne l'apprenne.\n",
  );
});

Deno.test("⛔ LA GARDE N'EST PAS MORTE — les sentinelles sont vues TROUVÉES et ÉPINGLÉES", async () => {
  const rows = scanConstants(await readKeelCorpus());
  const parNom = new Map(rows.map((r) => [r.name, r]));
  for (const nom of SENTINELLES) {
    const row = parNom.get(nom);
    assert(
      row !== undefined,
      `${nom} n'est plus VUE par le scan — le scan est mort, pas la dette. ` +
        `Un ensemble vide serait vert pour toujours.`,
    );
    assert(
      row.pinnedIn !== null,
      `${nom} est vue mais plus ÉPINGLÉE — la détection d'épinglage est ` +
        `cassée, ou l'épinglage a été retiré de \`constant_pins_test.ts\`.`,
    );
  }
});

Deno.test("la dette énumérée est cohérente: aucun doublon, aucun nom vide", () => {
  const noms = [...DETTE_NON_EPINGLEE];
  assertEquals(noms.length, new Set(noms).size);
  assert(noms.every((n) => /^[A-Z][A-Z0-9_]*$/.test(n)), "nom mal formé");
});
