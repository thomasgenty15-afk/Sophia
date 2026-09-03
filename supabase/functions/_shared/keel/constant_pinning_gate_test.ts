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

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ X2″ (2026-08-23) — CE QUE LA v1 DE CETTE MÉCANIQUE NE VOYAIT PAS
//
// La v1 ne reconnaissait que `export const NOM = <littéral>;` et un `Record`
// PLAT de littéraux. Rejeu de son propre scanner sur son propre répertoire
// (2026-08-22 18:47, reproduit le 2026-08-23 19:00 — 140 constantes vues):
// `MAX_SURPLUS_FRACTION` était ABSENTE, parce qu'elle est DÉRIVÉE —
// `Math.round((ENERGY_BANDS.muscle_gain.high - 1) * 1000) / 1000`. ⇒ passer la
// bande `muscle_gain` de 1,10 à 1,20 ne faisait rougir AUCUN épinglage. La
// « preuve la moins chère » du dépôt était donc inopérante précisément sur les
// constantes qui gouvernent une BANDE DE VERDICT.
//
// Mesuré le 2026-08-23: le scanner ratait 12 constantes DE SON PROPRE
// PÉRIMÈTRE, pour six causes mécaniques, toutes syntaxiques:
//   ① le séparateur numérique — `6_000_000`               → 4 (`MAX_DOCUMENT_BYTES`…)
//   ② l'expression dérivée — `Math.round(…)`, `2 / 3`     → 2 (`MAX_SURPLUS_FRACTION`)
//   ③ l'alias — `export const A = B;`                     → 1
//   ④ la longueur d'un tableau — `X.length`               → 1
//   ⑤ la ré-exportation — `export { A };`                 → 2
//   ⑥ `Object` et `.freeze({` coupés par un saut de ligne → 2
//
// ⛔ LA PORTÉE N'EST PAS ÉLARGIE. Les DEUX bornes du §⑨ n° 73 tiennent mot
// pour mot: la constante est EXPORTÉE **et** IMPORTÉE par un
// `_shared/keel/*_test.ts`. Seule la TROISIÈME borne change:
//      ~~« elle est ÉCRITE comme un littéral »~~  ⇒  « elle VAUT un nombre ».
//
// ⚠️ ET CE QUI RESTE DEHORS EST NOMMÉ, AVEC SON NOMBRE. Une constante NON
// exportée est hors de portée par construction: on ne peut ni l'importer ni
// l'épingler, donc la seule réponse possible au rouge serait « ajouter le nom
// à la dette » — une liste que personne ne peut refermer. Mesuré le
// 2026-08-23: `_shared/keel` porte **329** déclarations `const` non exportées
// candidates. `ENERGY_BANDS` (`meal_envelope.ts:466`) en fait partie: c'est
// une table de VERDICT et elle est privée. Elle est fermée à part, PAR SON
// NOM, dans `constant_pins_test.ts` (épinglage lu sur le disque) — un
// correctif nommé, jamais une règle qui ferait entrer 329 noms d'un coup.

/** ⛔ `_` est un séparateur NUMÉRIQUE valide en TS: `6_000_000`. La v1 ne
 * l'acceptait pas, et quatre constantes lui échappaient pour cette seule
 * raison. */
const NUM_LITERAL_RE = /^[+-]?(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?$/;

/** Les membres de `Math` qui rendent un nombre DÉTERMINISTE. ⛔ `random` n'y
 * est pas: une valeur tirée n'est pas une constante. */
const MATH_NUMERIC = new Set([
  "abs", "cbrt", "ceil", "exp", "floor", "fround", "hypot", "log", "log2",
  "log10", "max", "min", "pow", "round", "sign", "sqrt", "trunc",
  "PI", "E", "LN2", "LN10", "SQRT2",
]);

const IMPORT_RE =
  /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']*["']/g;

/** `export { A, B as C };` — avec ou sans `from`. */
const REEXPORT_RE = /export\s*\{([^}]*)\}\s*(?:from\s*["'][^"']*["']\s*)?;/g;

const ASSERT = "assert(?:Equals|StrictEquals|AlmostEquals|ObjectMatch)";

/** Un nom est ÉPINGLÉ quand il est comparé à un LITTÉRAL, dans un sens ou dans
 * l'autre — jamais à une expression qui le contient. */
export function isPinnedIn(name: string, cleanTestSource: string): boolean {
  const patterns = [
    // assertEquals(NAME, 42) / assertEquals(NAME, 0.5) / assertEquals(NAME, 6_000_000)
    `${ASSERT}\\s*\\(\\s*${name}\\s*,\\s*-?\\d`,
    // assertEquals(42, NAME)
    `${ASSERT}\\s*\\(\\s*-?[\\d._]+\\s*,\\s*${name}\\s*[,)]`,
    // assertEquals(NAME, { … })  /  assertEquals(NAME, [ … ])  — l'objet ENTIER
    `${ASSERT}\\s*\\(\\s*${name}\\s*,\\s*[\\{\\[]`,
    // assert(NAME === 42)
    `assert\\s*\\(\\s*${name}\\s*===\\s*-?\\d`,
    `assert\\s*\\(\\s*-?[\\d._]+\\s*===\\s*${name}\\b`,
  ];
  return patterns.some((p) => new RegExp(p).test(cleanTestSource));
}

// ── LA GRAMMAIRE: on DÉCOUPE, on ne devine pas ─────────────────────────────
// Une expression rationnelle ne peut pas suivre une annotation de type
// générique ni un objet imbriqué. Le découpage se fait à la profondeur des
// parenthèses, et c'est ce qui a manqué à la v1.

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE = new Set([")", "]", "}"]);

/** Coupe `text` sur `sep`, à la profondeur ZÉRO seulement. */
export function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (OPEN[c]) depth++;
    else if (CLOSE.has(c)) depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

function indexOfTopLevel(text: string, ch: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (OPEN[c]) depth++;
    else if (CLOSE.has(c)) depth--;
    else if (c === ch && depth === 0) return i;
  }
  return -1;
}

export type Declaration = {
  readonly name: string;
  readonly exported: boolean;
  readonly init: string;
};

const DECL_HEAD_RE = /^(export\s+)?const\s+([A-Za-z_$][\w$]*)/gm;

/**
 * Toutes les déclarations `const` de PREMIER NIVEAU (colonne 0) d'un source
 * déjà nettoyé. L'initialiseur est lu jusqu'au `;` de profondeur zéro, donc un
 * objet sur quinze lignes est rendu ENTIER — ce que la v1 ne pouvait pas faire.
 *
 * ⚠️ Les non exportées sont rendues aussi: elles ne sont JAMAIS dans la portée
 * de la règle, mais il faut les connaître pour résoudre `MAX_SURPLUS_FRACTION`,
 * qui se calcule sur l'une d'elles.
 */
export function declarationsOf(clean: string): Declaration[] {
  const out: Declaration[] = [];
  DECL_HEAD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DECL_HEAD_RE.exec(clean))) {
    let i = m.index + m[0].length;
    // l'annotation de type, s'il y en a une: on avance jusqu'au `=` de
    // profondeur zéro, `<>` compris (`Readonly<Record<A, number>>`).
    let depth = 0;
    while (i < clean.length) {
      const c = clean[i];
      if (c === "<" || OPEN[c]) depth++;
      else if (c === ">" || CLOSE.has(c)) depth--;
      else if (c === "=" && depth === 0 && clean[i + 1] !== "=" && clean[i + 1] !== ">") break;
      else if (c === ";" && depth === 0) break;
      else if (c === "\n" && depth === 0 && /^\s*(export\s+)?const\s/.test(clean.slice(i + 1, i + 40))) break;
      i++;
    }
    if (clean[i] !== "=") continue; // `const X;` ou déstructuration: pas notre affaire
    i++;
    const start = i;
    depth = 0;
    while (i < clean.length) {
      const c = clean[i];
      if (OPEN[c]) depth++;
      else if (CLOSE.has(c)) depth--;
      else if (c === ";" && depth === 0) break;
      i++;
    }
    out.push({ name: m[2], exported: Boolean(m[1]), init: clean.slice(start, i).trim() });
  }
  return out;
}

/** Retire ce qui n'change pas la valeur: `as const`, `satisfies T`, et
 * l'enveloppe `Object.freeze( … )` — ⛔ y compris quand `Object` et `.freeze`
 * sont séparés par un saut de ligne, ce qui suffisait à cacher
 * `ACTIVITY_FACTORS`. */
export function unwrapInit(init: string): string {
  let t = init.trim();
  for (let n = 0; n < 4; n++) {
    const avant = t;
    t = t.replace(/\s+as\s+const$/, "").replace(/\s+satisfies\s+[^=]+$/, "").trim();
    const f = /^Object\s*\.\s*freeze\s*\(([\s\S]*)\)$/.exec(t);
    if (f && indexOfTopLevel(f[1], ")") === -1) t = f[1].trim();
    if (t === avant) break;
  }
  return t;
}

function keyOf(raw: string): string | null {
  const k = raw.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(k)) return k;
  if (/^["'].*["']$/.test(k)) return k.slice(1, -1); // les chaînes sont vidées
  if (/^\[.*\]$/.test(k)) return k.slice(1, -1).trim(); // clé calculée
  return null;
}

/**
 * Les CHEMINS numériques d'un littéral objet ou tableau, ou `null` si une
 * seule feuille n'est pas un nombre. ⛔ RÉCURSIF: la v1 exigeait un `Record`
 * PLAT, et une table à deux étages — la forme même d'`ENERGY_BANDS` — lui
 * passait à travers.
 */
export function numericLeafPaths(text: string): string[] | null {
  const t = unwrapInit(text);
  const isObj = t.startsWith("{") && t.endsWith("}");
  const isArr = t.startsWith("[") && t.endsWith("]");
  if (!isObj && !isArr) return null;
  const body = t.slice(1, -1).trim();
  if (!body) return null;
  const paths: string[] = [];
  let index = 0;
  for (const rawEntry of splitTopLevel(body, ",")) {
    const entry = rawEntry.trim();
    if (!entry) continue; // virgule finale
    let key: string | null;
    let value: string;
    if (isArr) {
      key = String(index++);
      value = entry;
    } else {
      const i = indexOfTopLevel(entry, ":");
      if (i < 0) return null; // raccourci `{ a }`, `...spread`, méthode
      key = keyOf(entry.slice(0, i));
      value = entry.slice(i + 1).trim();
    }
    if (key === null) return null;
    if (NUM_LITERAL_RE.test(value)) {
      paths.push(key);
      continue;
    }
    const sub = numericLeafPaths(value);
    if (!sub) return null;
    for (const p of sub) paths.push(`${key}.${p}`);
  }
  return paths.length ? paths : null;
}

/**
 * L'initialiseur VAUT-IL un nombre ? `resolve` dit si un chemin déjà connu
 * (`MA_CONSTANTE`, `TABLE.a.b`) est numérique; `declared` dit si un nom est une
 * déclaration de premier niveau du corpus (pour `X.length`).
 *
 * ⛔ CONSERVATEUR PAR CONSTRUCTION: tout ce qui n'est pas reconnu est REFUSÉ.
 * Un faux positif ferait rougir le dépôt sur une constante qui n'en est pas
 * une, et « la première chose qu'on fait d'une garde toujours rouge est de la
 * désarmer ».
 */
export function isNumericExpression(
  init: string,
  resolve: (path: string) => boolean,
  declared: (name: string) => boolean,
): boolean {
  const t = unwrapInit(init);
  if (!t) return false;
  if (/[{}\[\]`]/.test(t)) return false; // objet, tableau, gabarit
  if (/=>|\?|:|\bnew\b|\btypeof\b|\bawait\b/.test(t)) return false;
  const tokens = t.replace(/[+\-*/%()\s,]+/g, " ").trim().split(" ").filter(Boolean);
  if (!tokens.length) return false;
  for (const tok of tokens) {
    if (NUM_LITERAL_RE.test(tok)) continue;
    const math = /^Math\.([A-Za-z_$][\w$]*)$/.exec(tok);
    if (math && MATH_NUMERIC.has(math[1])) continue;
    if (/\.length$/.test(tok)) {
      const root = tok.split(".")[0];
      if (declared(root)) continue;
      return false;
    }
    if (resolve(tok)) continue;
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// LE SCAN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rend une ligne par constante numérique EXPORTÉE d'un module de
 * `_shared/keel` ET IMPORTÉE par au moins un `*_test.ts` du même répertoire.
 *
 * ⚠️ « importée par un test » est la portée VOULUE: une constante que rien ne
 * teste n'a pas d'épinglage à perdre. La règle vise le test complice, pas la
 * couverture.
 */
export function scanConstants(corpus: Corpus): ConstantRow[] {
  const srcFiles: string[] = [];
  const testFiles: string[] = [];
  for (const name of [...corpus.keys()].sort()) {
    if (!name.endsWith(".ts")) continue;
    (name.endsWith("_test.ts") ? testFiles : srcFiles).push(name);
  }

  // ── ① toutes les déclarations, exportées ou non ──────────────────────────
  type Entry = {
    name: string;
    file: string;
    exported: boolean;
    init: string;
    kind: "scalar" | "record" | null;
  };
  const entries: Entry[] = [];
  const parNom = new Map<string, Entry>();
  const aliases: Array<{ local: string; source: string; file: string }> = [];
  const reexported = new Map<string, string>(); // nom exporté -> fichier

  for (const file of srcFiles) {
    const clean = stripCommentsAndStrings(corpus.get(file)!);
    for (const d of declarationsOf(clean)) {
      if (parNom.has(d.name)) continue; // première déclaration du corpus
      const e: Entry = { name: d.name, file, exported: d.exported, init: d.init, kind: null };
      entries.push(e);
      parNom.set(d.name, e);
    }
    // `import { A as B }` rend B numérique si A l'est.
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(clean))) {
      for (const raw of m[1].split(",")) {
        const parts = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
        if (parts.length === 2 && parts[0] && parts[1]) {
          aliases.push({ local: parts[1].trim(), source: parts[0].trim(), file });
        }
      }
    }
    REEXPORT_RE.lastIndex = 0;
    while ((m = REEXPORT_RE.exec(clean))) {
      for (const raw of m[1].split(",")) {
        const parts = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
        const nom = (parts[1] ?? parts[0] ?? "").trim();
        const src = (parts[0] ?? "").trim();
        if (!nom) continue;
        if (!reexported.has(nom)) reexported.set(nom, file);
        if (src && src !== nom) aliases.push({ local: nom, source: src, file });
      }
    }
  }

  // ── ② POINT FIXE. Un alias ne se résout qu'une fois sa source résolue. ───
  const numericPaths = new Set<string>();
  const declared = (n: string) => parNom.has(n);
  const resolve = (p: string) => numericPaths.has(p);
  for (let tour = 0; tour < 6; tour++) {
    let bouge = false;
    for (const e of entries) {
      if (e.kind) continue;
      const leaves = numericLeafPaths(e.init);
      if (leaves) {
        e.kind = "record";
        numericPaths.add(e.name + ".");
        for (const p of leaves) numericPaths.add(`${e.name}.${p}`);
        bouge = true;
        continue;
      }
      if (isNumericExpression(e.init, resolve, declared)) {
        e.kind = "scalar";
        numericPaths.add(e.name);
        bouge = true;
      }
    }
    // les alias héritent de leur source
    for (const a of aliases) {
      if (numericPaths.has(a.local)) continue;
      if (numericPaths.has(a.source)) {
        numericPaths.add(a.local);
        if (!parNom.has(a.local)) {
          const e: Entry = {
            name: a.local,
            file: parNom.get(a.source)?.file ?? a.file,
            exported: false,
            init: a.source,
            kind: "scalar",
          };
          entries.push(e);
          parNom.set(a.local, e);
        }
        bouge = true;
      }
    }
    if (!bouge) break;
  }

  // ── ③ LA RÉ-EXPORTATION EXPORTE ─────────────────────────────────────────
  // `energy_target.ts` importe `WEIGHT_KG_MAX as TARGET_WEIGHT_KG_MAX` puis
  // écrit `export { TARGET_WEIGHT_KG_MAX };`. Aucun `export const` n'est écrit,
  // et la v1 ne voyait donc RIEN — alors que c'est le nom public du module.
  for (const [nom] of reexported) {
    const e = parNom.get(nom);
    if (e) e.exported = true;
  }

  // ── ④ qui est importé par un test du répertoire ─────────────────────────
  const importedBy = new Map<string, Set<string>>();
  const cleanTests = new Map<string, string>();
  for (const file of testFiles) {
    const clean = stripCommentsAndStrings(corpus.get(file)!);
    cleanTests.set(file, clean);
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
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

  // ── ⑤ les DEUX bornes de portée, inchangées ─────────────────────────────
  const rows: ConstantRow[] = [];
  for (const e of parNom.values()) {
    if (!e.kind) continue;
    if (!e.exported) continue;
    const tests = importedBy.get(e.name);
    if (!tests || tests.size === 0) continue;
    const sorted = [...tests].sort();
    const pinnedIn = sorted.find((t) => isPinnedIn(e.name, cleanTests.get(t)!)) ?? null;
    rows.push({ name: e.name, kind: e.kind, module: e.file, tests: sorted, pinnedIn });
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
// ⟳ LOT `X2″` — LES SIX CÉCITÉS, CHACUNE AVEC SON CORPUS SYNTHÉTIQUE
//
// ⛔ Un corpus par CAUSE, et chaque test porte les deux verdicts: la constante
// est VUE (sinon la règle ne la garde pas), et elle est NON ÉPINGLÉE quand son
// test est complice (sinon la règle ne sert à rien). Une seule des deux moitiés
// laisserait passer une régression: un scanner qui voit tout et n'épingle rien
// est vert, un scanner qui n'épingle rien parce qu'il ne voit rien aussi.
// ═══════════════════════════════════════════════════════════════════════════

function corpusDe(moduleSrc: string, testSrc: string): Corpus {
  return new Map([["module.ts", moduleSrc], ["module_test.ts", testSrc]]);
}

Deno.test("① le SÉPARATEUR NUMÉRIQUE — `6_000_000` est un nombre", () => {
  const corpus = corpusDe(
    "export const OCTETS_MAX = 6_000_000;\nexport const AUTRE = 8_000_000;",
    [
      'import { OCTETS_MAX, AUTRE } from "./module.ts";',
      "assertEquals(OCTETS_MAX, 6_000_000);",
      // ⛔ complice: une RELATION entre les deux, elles bougent ensemble.
      "assert(AUTRE >= Math.ceil(OCTETS_MAX / 3) * 4);",
    ].join("\n"),
  );
  assertEquals(scanConstants(corpus).map((r) => r.name), ["AUTRE", "OCTETS_MAX"]);
  assertEquals(unpinnedNames(corpus), ["AUTRE"]);
});

Deno.test("② l'EXPRESSION DÉRIVÉE — le cas exact de `MAX_SURPLUS_FRACTION`", () => {
  const corpus = corpusDe(
    [
      // ⚠️ la table source n'est PAS exportée: c'est la forme réelle.
      "const BANDES = { muscle_gain: { low: 1.05, high: 1.10 } };",
      "export const FRACTION_MAX =",
      "  Math.round((BANDES.muscle_gain.high - 1) * 1000) / 1000;",
      "export const DEUX_TIERS = 2 / 3;",
    ].join("\n"),
    [
      'import { FRACTION_MAX, DEUX_TIERS } from "./module.ts";',
      "assertEquals(FRACTION_MAX, 0.10);",
      // ⛔ complice: recalculé avec la constante elle-même.
      "assertEquals(part(3), 3 * DEUX_TIERS);",
    ].join("\n"),
  );
  const vues = scanConstants(corpus);
  assertEquals(vues.map((r) => r.name), ["DEUX_TIERS", "FRACTION_MAX"]);
  // ⛔ LA TABLE PRIVÉE N'ENTRE PAS: elle n'est pas exportée, donc ni
  // importable ni épinglable. C'est l'arbitrage écrit du lot.
  assert(!vues.some((r) => r.name === "BANDES"));
  assertEquals(unpinnedNames(corpus), ["DEUX_TIERS"]);
});

Deno.test("③ l'ALIAS — `export const A = B;` vaut ce que vaut B", () => {
  const corpus = corpusDe(
    "export const SOURCE = 280;\nexport const COPIE = SOURCE;",
    [
      'import { COPIE, SOURCE } from "./module.ts";',
      "assertEquals(SOURCE, 280);",
      // ⛔ complice: la copie comparée à sa source, jamais à un littéral.
      "assertEquals(COPIE, SOURCE);",
    ].join("\n"),
  );
  assertEquals(scanConstants(corpus).map((r) => r.name), ["COPIE", "SOURCE"]);
  assertEquals(unpinnedNames(corpus), ["COPIE"]);
});

Deno.test("④ la LONGUEUR — `= X.length` est un nombre", () => {
  const corpus = corpusDe(
    "const MOMENTS = ['a', 'b', 'c'];\nexport const CRENEAUX_MAX = MOMENTS.length;",
    [
      'import { CRENEAUX_MAX } from "./module.ts";',
      // ⛔ complice: retirer un moment des DEUX listes laisse ceci vert.
      "assertEquals(CRENEAUX_MAX, AUTRE_LISTE.length);",
    ].join("\n"),
  );
  assertEquals(unpinnedNames(corpus), ["CRENEAUX_MAX"]);
});

Deno.test("⑤ la RÉ-EXPORTATION — `export { A };` EXPORTE, sans `export const`", () => {
  const corpus: Corpus = new Map([
    ["socle.ts", "export const POIDS_MAX = 400;"],
    [
      "public.ts",
      'import { POIDS_MAX as CIBLE_MAX } from "./socle.ts";\nexport { CIBLE_MAX };',
    ],
    ["public_test.ts", 'import { CIBLE_MAX } from "./public.ts";'],
  ]);
  const vues = scanConstants(corpus);
  assertEquals(vues.map((r) => r.name), ["CIBLE_MAX"]);
  assertEquals(vues[0].module, "socle.ts");
  assertEquals(unpinnedNames(corpus), ["CIBLE_MAX"]);
});

Deno.test("⑥ `Object` et `.freeze({` séparés par un saut de ligne", () => {
  const corpus = corpusDe(
    [
      "export const FACTEURS: Readonly<Record<Niveau, number>> = Object",
      "  .freeze({",
      "    sedentary: 1.45,",
      "    trains_hard: 2.00,",
      "  });",
    ].join("\n"),
    [
      'import { FACTEURS } from "./module.ts";',
      // ⛔ complice: une table comparée à une autre table.
      "assertEquals(BASE.seated, FACTEURS.sedentary);",
    ].join("\n"),
  );
  const vues = scanConstants(corpus);
  assertEquals(vues.map((r) => [r.name, r.kind]), [["FACTEURS", "record"]]);
  assertEquals(unpinnedNames(corpus), ["FACTEURS"]);
});

Deno.test("⛔ un `Record` IMBRIQUÉ tout-numérique entre; un seul mot le fait sortir", () => {
  const numerique = corpusDe(
    "export const TABLE = { a: { low: 0.75, high: 0.85 }, b: { low: 1.0, high: 1.1 } };",
    'import { TABLE } from "./module.ts";',
  );
  assertEquals(scanConstants(numerique).map((r) => r.kind), ["record"]);
  const mixte = corpusDe(
    "export const TABLE = { a: { low: 0.75, note: 'haut' } };",
    'import { TABLE } from "./module.ts";',
  );
  assertEquals(scanConstants(mixte), []);
});

Deno.test("⛔ CE QUI RESTE DEHORS, ET C'EST VOULU — rien qui ne VAILLE un nombre", () => {
  const corpus = corpusDe(
    [
      "export const TIRAGE = Math.random() * 10;", // pas déterministe
      "export const CALCUL = (x: number) => x * 2;", // une fonction
      "export const CHOIX = flag ? 1 : 2;", // un ternaire
      "export const TEXTE = 'trois';", // une chaîne
      "export const INCONNU = ailleurs.valeur;", // racine non déclarée
      "export const DATE_LIMITE = new Date(0);", // un objet
    ].join("\n"),
    'import { TIRAGE, CALCUL, CHOIX, TEXTE, INCONNU, DATE_LIMITE } from "./module.ts";',
  );
  assertEquals(scanConstants(corpus), []);
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
  // ⟳ **`TARGET_WEIGHT_KG_MAX` et `TARGET_WEIGHT_KG_MIN` SONT SORTIES DE CETTE
  // LISTE le 2026-08-23** (lot `X2″`), et pas comme `X2′` l'avait prévu. Il
  // écrivait ici « le jour où `X1′` les unifie, elles disparaissent du scan ».
  // ⛔ Ce n'est PAS ce qui s'est passé: `X1′` a unifié la déclaration dans
  // `weight_bounds.ts`, mais `energy_target.ts` les RÉ-EXPORTE sous l'alias
  // `TARGET_`, qui est leur nom public — et le scanner élargi les revoit sous
  // ce nom-là. Elles sortent donc par la porte ①, épinglées dans
  // `constant_pins_test.ts`, pas par disparition.
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
  // ⟳ 2026-09-01 — DEUX SENTINELLES REMPLACÉES, PAS RETIRÉES. Les précédentes
  // (`COMPOSED_DISH_MEAL_SHARE`, `MEAL_COMPONENT_KCAL`) ont été supprimées avec
  // `composedDishShare`; les enlever d'ici sans remplaçant aurait rendu ce
  // méta-test aveugle à DEUX causes de cécité, en silence — exactement ce qu'il
  // existe pour empêcher. On garde donc une constante de chaque FORME.
  "UNANSWERED_EXTRAS_SHARE", // scalaire décimal, le cœur de la cicatrice
  "SLOT_DAY_WEIGHT", // `Record` numérique épinglé en entier
  "BOX_FACTOR_MAX", // module `M`, épinglé depuis un fichier NEUF
  // ⟳ LOT `X2″` (2026-08-23) — UNE SENTINELLE PAR CAUSE DE CÉCITÉ REFERMÉE.
  // Chacune de ces six-là était INVISIBLE au scanner de `X2′`, pour une raison
  // mécanique différente. Si la reconnaissance correspondante se recasse, c'est
  // cette ligne-ci qui rougit, PAR SON NOM — et non un silence vert.
  "MAX_SURPLUS_FRACTION", // ② dérivée: `Math.round((ENERGY_BANDS…) …)`
  "MAX_DOCUMENT_BYTES", // ① séparateur numérique: `6_000_000`
  "HABIT_TEXT_MAX_CHARS", // ③ alias: `= DRAFT_NOTE_MAX_CHARS`
  "HABIT_SLOTS_MAX", // ④ longueur: `= HABIT_OCCASIONS.length`
  "TARGET_WEIGHT_KG_MAX", // ⑤ ré-exportation: `export { … };`
  "ACTIVITY_FACTORS", // ⑥ `Object` et `.freeze({` coupés par un saut de ligne
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
