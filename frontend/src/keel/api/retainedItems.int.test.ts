// LE GARDE-FRONTIÈRE ENTRE LES DEUX RUNTIMES, sur la mémoire structurée —
// PLUS la garde du piège qui fait disparaître une ligne en silence.
//
// `retainedItems.ts` recopie ce qui vit dans
// `supabase/functions/_shared/keel/retained_item.ts`. Le front est en Vite/TS,
// le back en Deno: aucun import n'est possible, donc la copie est assumée. Ce
// fichier est ce qui l'empêche de dériver — il LIT le module Deno sur le disque
// et compare, y compris la MATRICE DES DROITS, cellule par cellule.
//
// ── ET IL PORTE LA GARDE QUI COMPTE LE PLUS SUR CET ÉCRAN ──────────────────
// `canProduce` mord AUSSI À LA LECTURE. Une ligne que la personne déplace vers
// une famille interdite à son producteur d'origine s'écrirait sans erreur et ne
// remonterait plus jamais: une perte de données, silencieuse, sur l'écran dont
// la promesse est « rien d'opaque ». Le test « le piège du contrat §2.2 » plus
// bas prouve les DEUX moitiés — que la réécriture naïve perd la ligne, et que
// `rewriteRetainedItem` la garde.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LE PORT D'ÉCRITURE, INTERCEPTÉ — et c'est ce qui rend le défaut MESURABLE.
 *
 * La perte silencieuse du lot 1I ne se voit ni à la lecture ni à l'écran: elle
 * se voit dans la CHARGE UTILE envoyée à la RPC, qui remplace la clé entière.
 * Sans ce stub, la seule preuve possible serait un run réel — c'est-à-dire une
 * preuve qu'on ne rejoue pas.
 *
 * ⚠️ `vi.hoisted` ET PAS UN `const` NU: `vi.mock` est remonté au-dessus des
 * imports, donc sa fabrique s'exécute AVANT l'initialisation d'un `const` de
 * module — et le test échouerait sur un TDZ au lieu de mesurer quoi que ce soit.
 */
const port = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  reply: { data: { ok: true, written: true } as unknown, error: null as unknown },
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      port.calls.push({ name, args });
      return Promise.resolve(port.reply);
    },
    // Aucun test de ce fichier n'ouvre une table: le dire plutôt que rendre un
    // objet vide, qui donnerait une lecture silencieusement vide.
    from: () => {
      throw new Error("ce fichier n'ouvre aucune table");
    },
  },
}));

import {
  canHold,
  RECENTLY_KEPT_SHOWN,
  recentlyKept,
  RETAINED_QUOTE_MAX_CHARS,
  couldProduce,
  RETIRED_RETAINED_SOURCES,
  canProduce,
  defaultScopeFor,
  groupBySubject,
  HOUSEHOLD_SUBJECT,
  itemsInBlock,
  preferenceSideOf,
  blockOf,
  KNOWN_BLOCKS,
  type KnownBlock,
  LOGISTICS_FIELDS,
  isNextPlanItemAlive,
  isoMondayOf,
  KNOWN_WRITE_REFUSALS,
  KnownWriteError,
  knownStoreFrom,
  isNextPlanItemServed,
  isoInstantOf,
  liveNextPlanEntries,
  memberSubject,
  NEXT_PLAN_ITEMS_KEY,
  NEXT_PLAN_WINDOW_DAYS,
  nextPlanLifeOf,
  opaqueStoreRefusal,
  parseKnownWriteRefusal,
  partitionForDurableStore,
  persistKnownStore,
  reglueOpaqueRows,
  partitionForNextPlanStore,
  PORTION_DIRECTIONS,
  readNextPlanEntries,
  PORTION_ADJUST_EXCLUSIONS,
  subjectsForPortionAdjust,
  PORTION_MAGNITUDES,
  parseRetainedItem,
  readRetainedItems,
  RECIPE_DIFFICULTIES,
  RETAINED_DAY_TOKENS,
  RETAINED_ITEMS_KEY,
  RETAINED_KINDS,
  RETAINED_SCOPES,
  RETAINED_SOURCES,
  type RetainedItem,
  type RetainedKind,
  type RetainedSource,
  retainedItemFromLegacyNote,
  retainedItemToJson,
  retainedItemsFrom,
  rewriteRetainedItem,
  withNextPlanEntries,
  RHYTHM_OCCASIONS,
  VARIETY_LEVELS,
  withRetainedItems,
} from "./retainedItems";
import { WRITABLE_FIELDS } from "./fieldChanges";
import {
  FOOD_PREFERENCES_KEY,
  FOOD_PREFERENCES_ORIGIN_KEY,
} from "./foodPreferences";

const SHARED = resolve(__dirname, "../../../../supabase/functions/_shared/keel");
const BACKEND = readFileSync(resolve(SHARED, "retained_item.ts"), "utf8");
const TOKENS = readFileSync(resolve(SHARED, "tokens.ts"), "utf8");

/**
 * Blanchit les commentaires avant toute extraction.
 *
 * Sans ça, l'en-tête de `canProduce` — qui DESSINE la matrice en art ASCII avec
 * des `⛔` et des noms de familles — serait lu comme du code, et la garde
 * comparerait un tableau de commentaire à une implémentation.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const BACKEND_CODE = stripComments(BACKEND);

/**
 * Les chaînes littérales d'un `const NAME = [ ... ]` du module Deno.
 *
 * ⚠️ ON PART DU `=`, PAS DU NOM — même piège que `foodPreferences.int.test.ts`:
 * une annotation `: readonly string[]` porte elle-même des crochets, et partir
 * du nom rendait une liste VIDE. Un garde qui compare deux listes vides est
 * vert quoi qu'il arrive.
 */
function backendArray(name: string, source = BACKEND_CODE): string[] {
  const at = source.search(new RegExp(`(?:export )?const ${name}\\b`));
  if (at < 0) throw new Error(`${name} introuvable côté serveur`);
  const eq = source.indexOf("=", at);
  const open = source.indexOf("[", eq);
  const close = source.indexOf("]", open);
  if (eq < 0 || open < 0 || close < 0) {
    throw new Error(`${name}: littéral illisible`);
  }
  const items = [...source.slice(open, close).matchAll(/"([^"]+)"/g)]
    .map((m) => m[1]);
  if (items.length === 0) throw new Error(`${name}: aucune chaîne extraite`);
  return items;
}

/**
 * Les familles que le module Deno REFUSE à ce producteur, lues dans le corps
 * de `canProduce`.
 *
 * La forme attendue est soit `return true;` (aucun refus), soit une suite de
 * `kind !== "x"`. Toute autre forme jette: un garde qui ne sait plus lire la
 * matrice doit rougir, pas rendre un ensemble vide — un ensemble vide dirait
 * « ce producteur a tous les droits », c'est-à-dire la réponse la plus
 * permissive possible, en silence.
 */
function backendForbidden(source: string): Set<string> {
  const fnAt = BACKEND_CODE.indexOf("export function canProduce");
  if (fnAt < 0) throw new Error("canProduce introuvable côté serveur");
  const body = BACKEND_CODE.slice(fnAt, BACKEND_CODE.indexOf("\n}", fnAt));
  const caseAt = body.indexOf(`case "${source}":`);
  if (caseAt < 0) throw new Error(`canProduce: case "${source}" introuvable`);
  const rest = body.slice(caseAt);
  const returnAt = rest.indexOf("return");
  if (returnAt < 0) throw new Error(`canProduce: pas de return pour ${source}`);
  const clause = rest.slice(returnAt, rest.indexOf(";", returnAt));
  if (/return\s+true\s*$/.test(clause)) return new Set();
  // ⛔ `return false` = LIGNE VIDE — un producteur RETIRÉ (lot M1). C'est
  // l'ensemble le plus RESTRICTIF, l'exact opposé du repli dangereux que la
  // note ci-dessus interdit: se tromper ici ferait rougir, jamais taire.
  if (/return\s+false\s*$/.test(clause)) return new Set(RETAINED_KINDS);
  const kinds = [...clause.matchAll(/kind !== "([^"]+)"/g)].map((m) => m[1]);
  if (kinds.length === 0) {
    throw new Error(`canProduce: clause illisible pour ${source} — "${clause}"`);
  }
  return new Set(kinds);
}

/**
 * Les familles que le module Deno refuse à un producteur RETIRÉ, lues dans le
 * corps de `couldProduce`.
 *
 * Même forme et même exigence que `backendForbidden`: toute forme inattendue
 * JETTE. Un ensemble vide dirait « ce producteur retiré peut tout porter »,
 * c'est-à-dire la réponse la plus permissive possible, en silence.
 */
function backendFrozen(source: string): Set<string> {
  const fnAt = BACKEND_CODE.indexOf("export function couldProduce");
  if (fnAt < 0) throw new Error("couldProduce introuvable côté serveur");
  const body = BACKEND_CODE.slice(fnAt, BACKEND_CODE.indexOf("\n}", fnAt));
  const caseAt = body.indexOf(`case "${source}":`);
  if (caseAt < 0) throw new Error(`couldProduce: case "${source}" introuvable`);
  const rest = body.slice(caseAt);
  const returnAt = rest.indexOf("return");
  if (returnAt < 0) throw new Error(`couldProduce: pas de return pour ${source}`);
  const clause = rest.slice(returnAt, rest.indexOf(";", returnAt));
  const kinds = [...clause.matchAll(/kind !== "([^"]+)"/g)].map((m) => m[1]);
  if (kinds.length === 0) {
    throw new Error(`couldProduce: clause illisible pour ${source} — "${clause}"`);
  }
  return new Set(kinds);
}

const DAY = "2026-08-18"; // un mardi
const MEMBER = "9d1c0e40-0000-4000-8000-000000000001";
const MEMORY = "3f2b1a90-0000-4000-8000-0000000000aa";

function memory(kind: RetainedKind, over: Record<string, unknown> = {}) {
  return {
    kind,
    scope: "durable",
    subject: HOUSEHOLD_SUBJECT,
    text: "les rochers coco",
    value: null,
    source: "conversation",
    at: DAY,
    item: MEMORY,
    confidence: 0.82,
    ...over,
  };
}

/** Un item réel, construit par la seule porte d'entrée légitime. */
function itemOf(raw: Record<string, unknown>): RetainedItem {
  const parsed = parseRetainedItem(raw);
  if (!parsed) throw new Error(`fixture illisible: ${JSON.stringify(raw)}`);
  return parsed;
}

// ===========================================================================

describe("le socle ne peut pas dériver entre les deux runtimes", () => {
  it("les huit familles sont EXACTEMENT celles du module Deno", () => {
    expect([...RETAINED_KINDS]).toEqual(backendArray("RETAINED_KINDS"));
  });

  it("aucune famille de sécurité n'a été ajoutée d'un côté ni de l'autre", () => {
    // ⛔ L'ABSENCE EST LA GARANTIE. Une allergie, une intolérance, un régime ou
    // une condition médicale ont leur table — synchrone, sans ranking, avec
    // consentement. Les faire naître d'un retour classé déplacerait une
    // garantie médicale dans un magasin probabiliste.
    const forbidden = ["allerg", "intoleran", "medical", "safety", "diet", "regime"];
    const offenders = RETAINED_KINDS.filter((kind) =>
      forbidden.some((token) => kind.includes(token))
    );
    expect(offenders).toEqual([]);
  });

  it("les deux portées, les quatre sources, les deux directions, les deux crans", () => {
    expect([...RETAINED_SCOPES]).toEqual(backendArray("RETAINED_SCOPES"));
    expect([...RETAINED_SOURCES]).toEqual(backendArray("RETAINED_SOURCES"));
    expect([...PORTION_DIRECTIONS]).toEqual(backendArray("PORTION_DIRECTIONS"));
    expect([...PORTION_MAGNITUDES]).toEqual(backendArray("PORTION_MAGNITUDES"));
  });

  it("les six moments, les cinq champs de logistique, les deux vocabulaires", () => {
    expect([...RHYTHM_OCCASIONS]).toEqual(backendArray("RHYTHM_OCCASIONS"));
    expect([...LOGISTICS_FIELDS]).toEqual(backendArray("LOGISTICS_FIELDS"));
    expect([...RECIPE_DIFFICULTIES]).toEqual(backendArray("RECIPE_DIFFICULTIES"));
    expect([...VARIETY_LEVELS]).toEqual(backendArray("VARIETY_LEVELS"));
  });

  it("les sept jetons de jour sont ceux de `tokens.ts`", () => {
    // Recopiés et non importés (voir l'en-tête du module): la recopie n'est pas
    // de la paresse tant que son égalité est PROUVÉE.
    expect([...RETAINED_DAY_TOKENS]).toEqual(
      backendArray("DAY_TOKENS", stripComments(TOKENS)),
    );
  });

  it("LOT M5 — la liste des champs écrivables est la même des deux côtés", () => {
    // ⚠️ TROIS COPIES, ET C'EST ASSUMÉ: le socle Deno, ce port navigateur, et
    // la migration SQL. Un port SQL qui irait lire sa liste d'autorisation
    // ailleurs ne serait plus une garde; un navigateur qui importerait du Deno
    // ne compile pas. Le prix des trois copies est CE test et son jumeau côté
    // Deno (`field_change_test.ts`) — sans eux, ouvrir un champ d'un seul côté
    // produit soit une écriture refusée sans motif lisible, soit une porte
    // ouverte que personne ne voit.
    const shared = readFileSync(resolve(SHARED, "field_change.ts"), "utf8");
    const code = stripComments(shared);
    const at = code.indexOf("export const WRITABLE_FIELDS");
    expect(at, "WRITABLE_FIELDS introuvable côté serveur").toBeGreaterThan(-1);
    // ⚠️ LA LISTE DENO EST DÉRIVÉE (`...LOGISTICS_FIELDS`), donc on ne peut pas
    // la lire comme un littéral: on la reconstruit depuis SA source, qui est
    // elle-même un littéral du même fichier socle.
    const logistics = backendArray("LOGISTICS_FIELDS");
    expect([...WRITABLE_FIELDS]).toEqual([...logistics, "eating_rhythm"]);
    expect(code.slice(at, code.indexOf("]", at))).toContain("LOGISTICS_FIELDS");
  });

  it("LOT M2 — la citation a la MÊME règle des deux côtés", () => {
    // ⚠️ SANS CE TEST, LES DEUX PORTS DIVERGENT EN SILENCE. Le serveur écrit,
    // le navigateur relit: une règle de citation qui bouge d'un seul côté fait
    // disparaître de la carte une ligne que la base porte, ou l'inverse. Aucun
    // des deux ne rougirait — chacun serait cohérent avec lui-même.
    const backend = BACKEND_CODE;
    // Le plafond, épinglé au littéral du module Deno.
    const capMatch = backend.match(
      /RETAINED_QUOTE_MAX_CHARS[^=]*=\s*(\d+)/,
    );
    expect(capMatch, "RETAINED_QUOTE_MAX_CHARS introuvable côté serveur")
      .not.toBeNull();
    expect(RETAINED_QUOTE_MAX_CHARS).toBe(Number(capMatch![1]));

    // ⛔ L'INTERDIT SUR `written`, LU DANS LE CORPS DE `parseQuote`. C'est la
    // moitié qui ferme le contournement: `canProduce("written", …)` autorise
    // TOUT, donc un producteur serveur qui se déclarerait `written` passerait
    // la matrice entière par un seul mot — et sa citation le trahit.
    const at = backend.indexOf("function parseQuote");
    expect(at, "parseQuote introuvable côté serveur").toBeGreaterThan(-1);
    const body = backend.slice(at, backend.indexOf("\n}", at));
    expect(body).toContain('source === "written"');
    expect(body).toContain("REFUSED");
  });

  it("LOT M1 — la matrice GELÉE est la même des deux côtés", () => {
    // ⚠️ SANS CE TEST, LE RETRAIT DÉRIVE PAR LA LECTURE. `canHold` décide si
    // une ligne déjà en base remonte. Si le front et le serveur n'ont pas le
    // MÊME gel, la carte affiche une ligne que le générateur ne voit pas —
    // ou l'inverse. Aucun des deux ne rougirait: chacun serait cohérent avec
    // lui-même.
    expect([...RETIRED_RETAINED_SOURCES]).toEqual(
      backendArray("RETIRED_RETAINED_SOURCES"),
    );

    // La matrice gelée, cellule par cellule, lue dans le module Deno.
    const frozen = backendFrozen("conversation");
    for (const kind of RETAINED_KINDS) {
      expect(couldProduce("conversation", kind)).toBe(!frozen.has(kind));
    }

    // ⚠️ ET LE GEL N'EST NI VIDE NI TOTAL. Vide, il rendrait « tout accepté »
    // et rouvrirait `portion.adjust` par un seul mot; total, il effacerait de
    // l'écran toutes les lignes du memorizer déjà en base.
    const held = RETAINED_KINDS.filter((k) => canHold("conversation", k));
    expect(held.length).toBe(7);
    expect(canHold("conversation", "portion.adjust")).toBe(false);

    // Et le gel est STRICTEMENT plus permissif que l'écriture: c'est toute la
    // définition d'un producteur retiré.
    for (const kind of RETAINED_KINDS) {
      if (canProduce("conversation", kind)) {
        expect(canHold("conversation", kind)).toBe(true);
      }
    }
    expect(RETAINED_KINDS.some((k) => canHold("conversation", k) && !canProduce("conversation", k)))
      .toBe(true);
  });

  it("la matrice des droits est la même, cellule par cellule", () => {
    // 4 sources × 8 familles = 32 cellules, comparées au module Deno et pas à
    // une table réécrite ici: une matrice recopiée à la main dans un test est
    // une matrice qui dérive avec celle qu'elle surveille.
    const drift: string[] = [];
    for (const source of RETAINED_SOURCES) {
      const forbidden = backendForbidden(source);
      for (const kind of RETAINED_KINDS) {
        const server = !forbidden.has(kind);
        const front = canProduce(source, kind);
        if (server !== front) {
          drift.push(`${source} × ${kind}: serveur=${server} front=${front}`);
        }
      }
    }
    expect(drift).toEqual([]);
    // La ceinture de la ceinture: si l'extraction rendait « tout permis »
    // partout, la boucle serait verte en ne mesurant rien.
    expect(backendForbidden("conversation").has("portion.adjust")).toBe(true);
    expect(backendForbidden("written").size).toBe(0);
  });
});

describe("`defaultScopeFor` rend un REFUS, et le refus ne se replie pas", () => {
  it("`null` sur chaque cellule interdite, et jamais une portée par défaut", () => {
    const pairs: Array<[RetainedSource, RetainedKind]> = [
      ["conversation", "portion.adjust"],
      ["draft_note", "portion.adjust"],
      ["draft_note", "rhythm.set"],
      ["questionnaire", "craving"],
    ];
    for (const [source, kind] of pairs) {
      expect(defaultScopeFor(source, kind), `${source} × ${kind}`).toBeNull();
    }
  });

  it("les deux invariants sont FORCÉS, quel que soit le producteur", () => {
    for (const source of RETAINED_SOURCES) {
      if (canProduce(source, "craving")) {
        expect(defaultScopeFor(source, "craving")).toBe("next_plan");
      }
      if (canProduce(source, "portion.adjust")) {
        expect(defaultScopeFor(source, "portion.adjust")).toBe("durable");
      }
    }
  });
});

// ===========================================================================
// ⚠️ LE PIÈGE DU CONTRAT §2.2 — LA GARDE LA PLUS CHÈRE DE CE LOT
// ===========================================================================

describe("une ligne ré-éditée vers une famille interdite change de main", () => {
  const proposed = itemOf(memory("food.exclude"));

  it("la réécriture NAÏVE la fait disparaître à la relecture — la moitié qui fait mal", () => {
    // Ce que ferait n'importe quel écran qui garde la source d'origine: la
    // ligne s'écrit sans erreur, le Save répond « enregistré »…
    const naive = {
      ...retainedItemToJson(proposed),
      kind: "portion.adjust",
      scope: "durable",
      value: { direction: "down", magnitude: "clear" },
    };
    // …et elle ne remonte PLUS JAMAIS, parce que `canProduce` mord aussi à la
    // lecture. Personne ne voit d'erreur; la personne voit sa correction
    // s'évaporer entre deux ouvertures de l'écran.
    expect(parseRetainedItem(naive)).toBeNull();
  });

  it("`rewriteRetainedItem` la ré-enregistre `written` + `item: \"\"`, et elle survit", () => {
    const rewritten = rewriteRetainedItem(
      proposed,
      {
        text: "les parts sont trop grosses",
        kind: "portion.adjust",
        subject: HOUSEHOLD_SUBJECT,
        value: { direction: "down", magnitude: "clear" },
      },
      "2026-08-20",
    );
    expect(rewritten).not.toBeNull();
    expect(rewritten!.source).toBe("written");
    // ⚠️ `item: ""` N'EST PAS COSMÉTIQUE: c'est ce vide qui met la ligne hors de
    // portée de la réconciliation, donc qui empêche le memorizer de reprendre
    // ce que la personne vient de corriger.
    expect(rewritten!.item).toBe("");
    // Une confiance sur un fait DÉCLARÉ est une erreur de catégorie, et le
    // parseur la refuse: la garder ferait perdre la ligne par l'autre bout.
    expect(rewritten!.confidence).toBeNull();
    // Le jour suit la main: la ligne est écrite AUJOURD'HUI par la personne.
    expect(rewritten!.at).toBe("2026-08-20");
    expect(rewritten!.scope).toBe("durable");

    // LA PREUVE QUI COMPTE: l'aller-retour par le magasin. Écrite puis relue,
    // elle est toujours là — c'est exactement ce que la version naïve perd.
    const reread = parseRetainedItem(retainedItemToJson(rewritten!));
    expect(reread).toEqual(rewritten);
  });

  it("le questionnaire qui bascule vers une envie change de main aussi", () => {
    // La seconde cellule interdite, et elle n'est pas dans la même colonne:
    // `questionnaire` peut tout sauf `craving`. Une garde écrite sur le seul
    // cas `conversation × portion.adjust` serait une garde vérifiée dans une
    // seule langue.
    const fromForm = itemOf(
      memory("food.prefer", { source: "questionnaire", item: "", confidence: null }),
    );
    const rewritten = rewriteRetainedItem(
      fromForm,
      {
        text: "des fajitas la semaine prochaine",
        kind: "craving",
        subject: HOUSEHOLD_SUBJECT,
        value: null,
      },
      "2026-08-20",
    );
    expect(rewritten).not.toBeNull();
    expect(rewritten!.source).toBe("written");
    expect(rewritten!.item).toBe("");
    expect(rewritten!.scope).toBe("next_plan");
    expect(parseRetainedItem(retainedItemToJson(rewritten!))).toEqual(rewritten);
  });

  it("quand la famille reste permise, la ligne GARDE sa source et son jour", () => {
    // LE CAS QUI PASSE. Une garde sans cas passant est une garde cassée qui
    // ressemble à une garde qui marche: si la réécriture re-signait TOUT en
    // `written`, l'écran cesserait de pouvoir dire « tu l'as coché au bilan »
    // — et les deux tests du dessus resteraient verts.
    //
    // ⚠️ LE CAS PASSANT EST PORTÉ PAR `questionnaire` DEPUIS LE LOT M1, ET PAS
    // PAR `conversation`. La ligne ③ de la matrice est VIDE: le memorizer n'a
    // plus AUCUNE famille permise, donc plus aucun cas passant à offrir. Le
    // laisser ici aurait fait rougir ce test pour une raison qui n'est pas la
    // sienne, et surtout aurait laissé la garde sans preuve qu'elle sait dire
    // oui.
    const fromForm = itemOf(
      memory("food.prefer", { source: "questionnaire", item: "", confidence: null }),
    );
    const rewritten = rewriteRetainedItem(
      fromForm,
      {
        text: "les rochers coco, vraiment plus",
        kind: "method.avoid",
        subject: HOUSEHOLD_SUBJECT,
        value: null,
      },
      "2026-08-20",
    );
    expect(rewritten).not.toBeNull();
    expect(rewritten!.source).toBe("questionnaire");
    expect(rewritten!.item).toBe("");
    expect(rewritten!.at).toBe(DAY);
    expect(rewritten!.text).toBe("les rochers coco, vraiment plus");
  });

  it("LOT M1 — TOUTE édition d'une ligne du memorizer la fait changer de main", () => {
    // ⛔ CE N'EST PLUS UN CAS LIMITE, C'EST LE CAS NORMAL. Avant M1, seule la
    // cellule `conversation × portion.adjust` re-signait la ligne. La ligne ③
    // étant vide, `method.avoid` — une famille que le memorizer avait le droit
    // d'écrire la veille — la re-signe désormais elle aussi.
    //
    // C'est la bonne lecture du geste: la personne vient de classer la ligne
    // elle-même, avec la liste des familles sous les yeux. Et `item: ""` la met
    // hors de portée de la réconciliation, donc plus rien ne peut la lui
    // reprendre.
    const rewritten = rewriteRetainedItem(
      proposed,
      {
        text: "les rochers coco, vraiment plus",
        kind: "method.avoid",
        subject: HOUSEHOLD_SUBJECT,
        value: null,
      },
      "2026-08-20",
    );
    expect(rewritten).not.toBeNull();
    expect(rewritten!.source).toBe("written");
    expect(rewritten!.item).toBe("");
    expect(rewritten!.confidence).toBeNull();
    // Le jour suit la main: c'est aujourd'hui que la personne l'a écrite.
    expect(rewritten!.at).toBe("2026-08-20");
    // LA PREUVE QUI COMPTE: elle survit à l'aller-retour par le magasin.
    expect(parseRetainedItem(retainedItemToJson(rewritten!))).toEqual(rewritten);
  });

  it("LOT M1 — une ligne du memorizer NON éditée reste LUE, et retirable", () => {
    // ⛔ LA MOITIÉ QUI EMPÊCHE LE RETRAIT D'ÊTRE UNE SUPPRESSION. `canProduce`
    // est faux partout pour `conversation`; si le parseur s'en servait, les
    // lignes déjà en base tomberaient à zéro au chargement suivant et la
    // personne verrait s'évaporer, sans un mot, ce qu'elle pouvait retirer la
    // veille. `canHold` applique la matrice GELÉE: rien de neuf n'entre, rien
    // de réel ne disparaît.
    expect(canProduce("conversation", "food.exclude")).toBe(false);
    expect(canHold("conversation", "food.exclude")).toBe(true);
    expect(parseRetainedItem(memory("food.exclude"))).not.toBeNull();

    // ⚠️ ET LE GEL N'EST PAS « TOUT ACCEPTER ». Une ligne
    // `conversation × portion.adjust` n'a JAMAIS pu être écrite: elle ne peut
    // venir que d'une charge forgée. Elle reste refusée — sans quoi un seul mot
    // rouvrirait la seule famille qui déplace des grammes.
    expect(canHold("conversation", "portion.adjust")).toBe(false);
    expect(
      parseRetainedItem(
        memory("portion.adjust", {
          value: { direction: "down", magnitude: "clear" },
        }),
      ),
    ).toBeNull();
  });

  it("un texte vide, ou un jour illisible, est un REFUS et pas un repli", () => {
    expect(
      rewriteRetainedItem(
        proposed,
        { text: "   ", kind: "food.exclude", subject: HOUSEHOLD_SUBJECT, value: null },
        "2026-08-20",
      ),
    ).toBeNull();
    expect(
      rewriteRetainedItem(
        proposed,
        { text: "ok", kind: "food.exclude", subject: HOUSEHOLD_SUBJECT, value: null },
        "20/08/2026",
      ),
    ).toBeNull();
  });
});

// ===========================================================================

describe("⛔ aucun gramme ne traverse cet écran", () => {
  it("un `value` qui porte un nombre fait tomber l'item ENTIER", () => {
    for (const key of ["grams", "kcal", "calories", "delta", "percent"]) {
      const row = memory("portion.adjust", {
        source: "questionnaire",
        item: "",
        confidence: null,
        value: { direction: "down", magnitude: "clear", [key]: 80 },
      });
      // Pas de nettoyage: garder la ligne en effaçant la clé effacerait la
      // seule preuve qu'un producteur fabrique de la précision.
      expect(parseRetainedItem(row), key).toBeNull();
    }
  });

  it("les deux crans sont des ADVERBES, et il n'y en a que deux", () => {
    expect([...PORTION_MAGNITUDES]).toEqual(["slight", "clear"]);
    expect(
      parseRetainedItem(
        memory("portion.adjust", {
          source: "questionnaire",
          item: "",
          confidence: null,
          value: { direction: "down", magnitude: "very_clear" },
        }),
      ),
    ).toBeNull();
  });
});

// ===========================================================================

describe("§7 — les anciennes notes se lisent, elles ne se devinent pas", () => {
  const pc = {
    food_preferences: ["N'aime pas le brocoli.", "Travaille de nuit 3× / semaine."],
    [RETAINED_ITEMS_KEY]: [memory("food.exclude")],
    eating_rhythm: ["breakfast"],
  };

  it("elles remontent TELLES QUELLES, sans `kind` inventé", () => {
    const read = retainedItemsFrom(pc);
    expect(read.legacyNotes).toEqual([
      "N'aime pas le brocoli.",
      "Travaille de nuit 3× / semaine.",
    ]);
    // ⛔ Aucune inférence rétroactive: la phrase plate n'est pas devenue un item.
    expect(read.items).toHaveLength(1);
    expect(read.items[0].text).toBe("les rochers coco");
  });

  it("une note ne devient une ligne rangée que si la personne choisit sa famille", () => {
    const promoted = retainedItemFromLegacyNote({
      text: "N'aime pas le brocoli.",
      kind: "food.exclude",
      subject: HOUSEHOLD_SUBJECT,
      value: null,
      today: DAY,
    });
    expect(promoted).not.toBeNull();
    // Elle naît de la main de la personne: `written`, `item: ""` — donc hors de
    // portée de la réconciliation, donc elle lui appartient.
    expect(promoted!.source).toBe("written");
    expect(promoted!.item).toBe("");
    expect(promoted!.confidence).toBeNull();
    expect(promoted!.at).toBe(DAY);
  });

  it("les lignes que la lecture a perdues sont COMPTÉES par MOTIF, pas effacées", () => {
    // Le prix assumé de « un item difforme tombe seul » est le silence sur
    // l'item perdu. L'écran doit pouvoir le dire, sinon la morsure de
    // `canProduce` à la lecture ressemble à une suppression — et les trois
    // motifs appellent trois réactions différentes.
    const read = readRetainedItems({
      [RETAINED_ITEMS_KEY]: [
        memory("food.exclude"),
        // Interdite au memorizer: `canProduce` mord à la lecture.
        memory("portion.adjust", { value: { direction: "down", magnitude: "clear" } }),
        // Lisible, mais le `next_plan` vit sur le canal d'envies (lot 1B).
        memory("craving", {
          source: "written",
          item: "",
          confidence: null,
          scope: "next_plan",
        }),
        { kind: "nope" },
      ],
    });
    expect(read.items).toHaveLength(1);
    expect(read.refused).toEqual({
      total: 3,
      forbiddenProducer: 1,
      malformed: 1,
      notDurable: 1,
    });
  });

  it("un magasin qui n'est pas une liste compte pour UNE ligne refusée, pas zéro", () => {
    // À zéro, un jsonb corrompu serait indiscernable d'un jsonb vide — et « il
    // n'y a rien » est précisément la lecture qu'on ne veut pas faire d'un
    // magasin qu'on n'a pas su ouvrir.
    expect(readRetainedItems({ [RETAINED_ITEMS_KEY]: { nope: 1 } }).refused.total)
      .toBe(1);
    expect(readRetainedItems({}).refused.total).toBe(0);
  });

  it("`withRetainedItems` ne mute rien, ne perd aucune clé voisine, et filtre le `next_plan`", () => {
    const before = JSON.stringify(pc);
    const craving = itemOf(
      memory("craving", {
        source: "written",
        item: "",
        confidence: null,
        scope: "next_plan",
      }),
    );
    const next = withRetainedItems(pc, [craving]);
    expect(JSON.stringify(pc)).toBe(before);
    expect(next.eating_rhythm).toEqual(["breakfast"]);
    expect(next.food_preferences).toEqual(pc.food_preferences);
    // ⚠️ LE FILTRE EST TOUJOURS ARMÉ, pas sur demande: le magasin durable
    // n'accueille pas une envie, et `partitionForDurableStore` ne fait que
    // rendre le refus DICIBLE.
    expect(next[RETAINED_ITEMS_KEY]).toEqual([]);
    expect(partitionForDurableStore([craving]).notDurable).toEqual([craving]);
  });
});

// ===========================================================================

describe("§6 — les CINQ BLOCS, dans l'ordre, et le `next_plan` gagne", () => {
  // ⟳ LOT D (2026-09-03) — SIX SECTIONS PAR FAMILLE SONT DEVENUES CINQ BLOCS
  // PAR DESTINATION. Ce n'est pas un rangement: les trois destinations de la
  // nomenclature (§2.2) n'avaient AUCUNE frontière visible à l'écran, et un
  // INDICE interne (« pour nous ») se lisait comme un SAVOIR. Le groupement est
  // désormais la personne, et les blocs sont les destinations.
  it("l'ordre des blocs est celui de la nomenclature", () => {
    expect([...KNOWN_BLOCKS]).toEqual([
      "preferences",
      "notes",
      "settings",
      "next_plan",
      "legacy",
    ]);
  });

  it("chaque famille tombe dans le bloc que le §6 lui donne", () => {
    const expected: Array<[RetainedKind, KnownBlock]> = [
      // ⚠️ UNE PRÉPARATION EST UNE PRÉFÉRENCE: `method.*` et `food.*` partagent
      // un bloc. Deux sections séparées demandaient à la personne de savoir ce
      // que le produit appelle « une méthode ».
      ["food.exclude", "preferences"],
      ["method.avoid", "preferences"],
      ["food.prefer", "preferences"],
      ["method.prefer", "preferences"],
      // ⛔ `rhythm.set` ET `logistics.set` NE DISPARAISSENT PAS AVEC LEURS
      // SECTIONS. Des lignes de ces deux familles existent en base, et une
      // ligne qui quitte l'écran sans un mot est une perte de données pour qui
      // la relit. Ce sont des RÉGLAGES: c'est leur bloc.
      ["portion.adjust", "settings"],
      ["rhythm.set", "settings"],
      ["logistics.set", "settings"],
      ["craving", "next_plan"],
    ];
    const valueFor = (kind: RetainedKind): unknown => {
      if (kind === "portion.adjust") return { direction: "up", magnitude: "slight" };
      if (kind === "rhythm.set") return { occasion: "breakfast", present: false };
      if (kind === "logistics.set") return { field: "variety", value: "varied" };
      return null;
    };
    for (const [kind, block] of expected) {
      const item = itemOf(
        memory(kind, {
          source: "written",
          item: "",
          confidence: null,
          scope: kind === "craving" ? "next_plan" : "durable",
          value: valueFor(kind),
        }),
      );
      expect(blockOf(item), kind).toBe(block);
    }
  });

  it("les deux listes du bloc ① séparent la polarité, et elles seules", () => {
    // ⛔ SANS CE TEST, `preferenceSideOf` pourrait rendre « no_more » pour tout
    // le monde et le bloc serait vert: les quatre familles y sont, mais la
    // moitié « à revoir » serait vide sur un magasin qui la remplit.
    const sideOf = (kind: RetainedKind) =>
      preferenceSideOf(
        itemOf(memory(kind, { source: "written", item: "", confidence: null })),
      );
    expect(sideOf("food.exclude")).toBe("no_more");
    expect(sideOf("method.avoid")).toBe("no_more");
    expect(sideOf("food.prefer")).toBe("again");
    expect(sideOf("method.prefer")).toBe("again");
    // Ce qui n'est pas une préférence n'a pas de côté — et rend `null`, pas
    // « no_more » par défaut: un repli rangerait un réglage dans les goûts.
    expect(
      preferenceSideOf(
        itemOf(
          memory("portion.adjust", {
            source: "written",
            item: "",
            confidence: null,
            value: { direction: "up", magnitude: "slight" },
          }),
        ),
      ),
    ).toBeNull();
  });

  it("une exclusion posée pour le prochain plan se lit sous l'encart", () => {
    // Le §6 dit « TOUT le `next_plan` », pas « les envies ». La ranger avec les
    // durables la ferait passer pour une propriété permanente — la frontière
    // que le dépôt a déjà tranchée une fois (`situation` / `context`).
    const weekly = itemOf(
      memory("food.exclude", {
        source: "draft_note",
        item: "",
        confidence: null,
        scope: "next_plan",
      }),
    );
    expect(blockOf(weekly)).toBe("next_plan");
    expect(itemsInBlock([weekly], "preferences")).toEqual([]);
    expect(itemsInBlock([weekly], "next_plan")).toEqual([weekly]);
  });

  it("`notes` et `legacy` ne portent AUCUN `RetainedItem`", () => {
    // ⛔ LA MOITIÉ QUI EMPÊCHE UN BLOC FANTÔME. Les deux existent à l'écran
    // mais lisent d'autres magasins (le mémo, les phrases plates). Si
    // `itemsInBlock` leur rendait des items, la carte afficherait la même ligne
    // DEUX fois — exactement le doublon visible que le lot D ferme.
    const item = itemOf(
      memory("food.exclude", { source: "written", item: "", confidence: null }),
    );
    expect(itemsInBlock([item], "notes")).toEqual([]);
    expect(itemsInBlock([item], "legacy")).toEqual([]);
  });

  it("les portions et le rythme se groupent par BOUCHE, `household` en tête", () => {
    const subject = memberSubject(MEMBER);
    expect(subject).toBe(`member:${MEMBER}`);
    const mine = itemOf(
      memory("portion.adjust", {
        source: "questionnaire",
        item: "",
        confidence: null,
        subject,
        value: { direction: "down", magnitude: "slight" },
      }),
    );
    const shared = itemOf(
      memory("portion.adjust", {
        source: "questionnaire",
        item: "",
        confidence: null,
        value: { direction: "up", magnitude: "clear" },
      }),
    );
    const groups = groupBySubject([mine, shared]);
    // ⛔ La clé est un `member_id`, jamais un prénom.
    expect(groups.map((g) => g.subject)).toEqual([
      HOUSEHOLD_SUBJECT,
      `member:${MEMBER}`,
    ]);
    expect(groups[0].items).toEqual([shared]);
  });

  it("`member:marc` est un refus, pas un repli sur tout le monde", () => {
    // Replier ici appliquerait à toute la table une mesure destinée à une
    // bouche — et à la baisse, ça retire de la nourriture à quelqu'un.
    expect(memberSubject("marc")).toBeNull();
    expect(
      parseRetainedItem(memory("food.exclude", { subject: "member:marc" })),
    ).toBeNull();
  });
});

// ===========================================================================

describe("§6 — le magasin PROVISOIRE, et sa date d'expiration", () => {
  const anchor = "2026-08-24"; // un LUNDI
  const craving = itemOf(
    memory("craving", {
      source: "written",
      item: "",
      confidence: null,
      scope: "next_plan",
      text: "des fajitas",
    }),
  );

  it("il vit dans `practical_constraints`, sous une clé DISTINCTE du durable", () => {
    // ⚠️ ARBITRAGE HUMAIN DU 2026-08-18: le canal d'envies exige un
    // `household_id` non nul, et une personne SEULE n'a pas de foyer. Un compte
    // solo n'aurait donc jamais porté une seule ligne `next_plan`, alors que
    // l'entrée du produit est à UNE bouche.
    expect(NEXT_PLAN_ITEMS_KEY).not.toBe(RETAINED_ITEMS_KEY);
    const pc = withNextPlanEntries({}, [{ item: craving, anchor }]);
    expect(pc[NEXT_PLAN_ITEMS_KEY]).toEqual([
      { item: retainedItemToJson(craving), anchor },
    ]);
    // Et les deux magasins ne se mélangent pas: le durable n'accueille pas
    // l'envie, le provisoire n'accueille pas le durable.
    expect(withRetainedItems({}, [craving])[RETAINED_ITEMS_KEY]).toEqual([]);
    const durable = itemOf(memory("food.exclude"));
    expect(
      partitionForNextPlanStore([{ item: durable, anchor }]).provisional,
    ).toEqual([]);
  });

  it("l'ancre est la SEMAINE VISÉE, pas le jour de la frappe", () => {
    // Quelqu'un qui écrit le DIMANCHE pour la semaine suivante a
    // `at = dimanche` et `anchor = lundi`. Dater l'expiration sur `at` ferait
    // mourir son envie le lendemain matin — une perte de données qui aurait
    // l'air d'une règle.
    const sunday = "2026-08-23";
    expect(isoMondayOf(sunday)).toBe("2026-08-17"); // la semaine EN COURS
    const life = nextPlanLifeOf(anchor);
    expect(life).toEqual({
      anchor: "2026-08-24",
      lastDay: "2026-08-30",
      expiredFrom: "2026-08-31",
    });
    // Deux lignes de la même semaine expirent ENSEMBLE, quel que soit leur jour
    // de frappe: l'écran ne peut pas mentir sur la moitié d'une section.
    const other = itemOf(
      memory("craving", {
        source: "written",
        item: "",
        confidence: null,
        scope: "next_plan",
        at: "2026-08-27",
        text: "du poisson",
      }),
    );
    expect(nextPlanLifeOf(anchor)!.lastDay).toBe(
      nextPlanLifeOf(anchor)!.lastDay,
    );
    expect(liveNextPlanEntries(
      [{ item: craving, anchor }, { item: other, anchor }],
      "2026-08-30",
    )).toHaveLength(2);
  });

  it("DIMANCHE VIVANT, LUNDI SUIVANT PARTI — les deux bornes, en dur", () => {
    // ⚠️ LA RÈGLE APPARTIENT AU LOT 1B (`retained_next_plan.ts`). Le front la
    // REDÉRIVE — les deux runtimes ne s'importent pas — donc les deux bornes
    // sont épinglées ici avec des dates ÉCRITES, pas calculées: une règle
    // redérivée sans ses bornes est une règle qu'on CROIT partager.
    expect(isNextPlanItemAlive(craving, anchor, "2026-08-24")).toBe(true); // lundi
    expect(isNextPlanItemAlive(craving, anchor, "2026-08-30")).toBe(true); // DIMANCHE
    expect(isNextPlanItemAlive(craving, anchor, "2026-08-31")).toBe(false); // LUNDI +1
    // Et la fenêtre elle-même est celle du module 1B, lue sur le disque.
    const backend1b = readFileSync(resolve(SHARED, "retained_next_plan.ts"), "utf8");
    const window = backend1b.match(/const WINDOW_DAYS = (\d+)/)?.[1];
    expect(window, "WINDOW_DAYS introuvable chez 1B").toBeTruthy();
    expect(NEXT_PLAN_WINDOW_DAYS).toBe(Number(window));
    // La formule est écrite en toutes lettres dans l'en-tête de 1B: si elle
    // bouge là-bas, cette ligne rougit ici.
    expect(stripComments(backend1b) + backend1b).toContain("ancre + 6");
  });

  it("AUCUNE BORNE BASSE: une ligne ancrée à la semaine PROCHAINE est vivante", () => {
    // La règle s'appelle « expiration », pas « activation ». La cacher jusqu'au
    // lundi ferait disparaître de l'écran ce que la personne vient d'y déposer.
    expect(isNextPlanItemAlive(craving, "2026-08-31", "2026-08-24")).toBe(true);
  });

  it("un `durable` rangé là ne devient PAS une envie datée", () => {
    // Miroir du refus n°1 de 1B: lui rendre `true` lui imprimerait une date
    // d'expiration qu'il n'a pas, et 1C le routerait comme une envie.
    const durable = itemOf(memory("food.exclude"));
    expect(isNextPlanItemAlive(durable, anchor, "2026-08-24")).toBe(false);
    const read = readNextPlanEntries({
      [NEXT_PLAN_ITEMS_KEY]: [
        { item: retainedItemToJson(craving), anchor },
        { item: retainedItemToJson(durable), anchor },
        { item: retainedItemToJson(craving), anchor: "pas-un-jour" },
        { nope: true },
      ],
    });
    expect(read.entries).toEqual([{ item: craving, anchor }]);
    expect(read.refused).toEqual({
      total: 3,
      forbiddenProducer: 0,
      malformed: 2,
      notDurable: 1,
    });
  });

  it("une ancre ou un jour illisible est un REFUS, jamais un repli", () => {
    // Un `anchor` illisible replié sur « aujourd'hui » ferait vivre une envie
    // six semaines de plus.
    expect(isoMondayOf("2026-8-1")).toBeNull();
    expect(isoMondayOf("2026-02-30")).toBeNull();
    expect(nextPlanLifeOf("")).toBeNull();
    expect(isNextPlanItemAlive(craving, "", "2026-08-24")).toBe(false);
    expect(isNextPlanItemAlive(craving, anchor, "hier")).toBe(false);
  });

  it("les bascules de mois et d'année, sans décalage de fuseau", () => {
    // ⚠️ `new Date("2026-08-24")` vaut MINUIT UTC, et le rendre dans le fuseau
    // de l'appareil décale d'un jour tout l'ouest du méridien. Une envie qui
    // expire « hier » est une envie qu'on croit perdue. `addDays` parse à MIDI
    // UTC pour cette raison exacte.
    expect(nextPlanLifeOf("2026-02-23")!.lastDay).toBe("2026-03-01");
    expect(nextPlanLifeOf("2028-02-21")!.lastDay).toBe("2028-02-27");
    expect(nextPlanLifeOf("2026-12-28")!.lastDay).toBe("2027-01-03");
  });
});

// ===========================================================================

describe("⛔ l'écriture est CIBLÉE, et ses clés sont épinglées au SQL", () => {
  const SOURCE = readFileSync(resolve(__dirname, "retainedItems.ts"), "utf8");
  const MIGRATION = readFileSync(
    resolve(
      __dirname,
      "../../../../supabase/migrations/20260818240000_a_write_port_for_what_sophia_knows.sql",
    ),
    "utf8",
  );

  it("la clé du magasin durable est celle du lot 1A, au caractère près", () => {
    const backend = readFileSync(
      resolve(SHARED, "food_preference_promotion.ts"),
      "utf8",
    );
    const key = backend.match(
      /export const RETAINED_ITEMS_KEY = "([^"]+)"/,
    )?.[1];
    expect(key, "RETAINED_ITEMS_KEY introuvable côté serveur").toBeTruthy();
    // Écrire dans une autre clé donnerait un écran qui a l'air de marcher et un
    // générateur qui ne lit rien.
    expect(RETAINED_ITEMS_KEY).toBe(key);
  });

  it("⚠️ LA BRETELLE: le littéral SQL est composé DEPUIS les constantes du front", () => {
    // LE DÉFAUT QUE CE TEST FERME, trouvé par le vérificateur du lot 1A sur une
    // autre version du même geste: la migration code les clés EN DUR, le code
    // les déclare en CONSTANTES, et RIEN ne relie les deux. Renommer une
    // constante TypeScript laisse toute la suite verte pendant que la RPC écrit
    // dans une clé que plus personne ne lit.
    //
    // Les chaînes attendues sont donc COMPOSÉES depuis les constantes: le test
    // ne peut pas rester vert sur un renommage.
    expect(MIGRATION).toContain(
      `jsonb_build_object('${RETAINED_ITEMS_KEY}', p_items)`,
    );
    expect(MIGRATION).toContain(
      `jsonb_build_object('${NEXT_PLAN_ITEMS_KEY}', p_next)`,
    );
    expect(MIGRATION).toContain(`'${FOOD_PREFERENCES_KEY}', p_notes`);
    expect(MIGRATION).toContain(`'${FOOD_PREFERENCES_ORIGIN_KEY}', p_origins`);
    // ET DANS LE PRÉDICAT AUSSI. Une écriture ciblée dont la garde de
    // concurrence lirait une AUTRE clé serait une garde qui ne mord jamais.
    expect(MIGRATION).toContain(
      `sg.practical_constraints -> '${RETAINED_ITEMS_KEY}'`,
    );
    expect(MIGRATION).toContain(
      `sg.practical_constraints -> '${NEXT_PLAN_ITEMS_KEY}'`,
    );
    expect(MIGRATION).toContain(
      `sg.practical_constraints -> '${FOOD_PREFERENCES_KEY}'`,
    );
  });

  it("les TROIS prédicats acceptent la CLÉ ABSENTE, et pas seulement deux", () => {
    // ⚠️ « Une garde a besoin d'un cas qui PASSE. » `p_expected_notes` était le
    // seul des trois comparé SANS `coalesce`, et exigé `array`: sur une ligne
    // qui n'a jamais eu de `food_preferences`, la clé est absente (jsonb NULL),
    // le front envoie NULL, et le prédicat ne tirait sur RIEN — un refus sur le
    // cas nominal, c'est-à-dire un bouton mort. Les trois se lisent pareil.
    expect([...MIGRATION.matchAll(/coalesce\(p_expected/g)]).toHaveLength(3);
    expect(MIGRATION).toContain("coalesce(p_expected_notes, 'null'::jsonb)");
  });

  it("la RPC n'écrit AUCUNE clé de plus que ces quatre", () => {
    // La moitié inverse de la bretelle: une cinquième clé glissée dans le `set`
    // serait une écriture que personne n'a décidée, et le test du dessus ne la
    // verrait pas.
    const set = MIGRATION.slice(
      MIGRATION.indexOf("set practical_constraints ="),
      MIGRATION.indexOf("where sg.user_id = v_user"),
    );
    expect(set.length, "le bloc `set` n'a pas été retrouvé").toBeGreaterThan(50);
    const keys = [...set.matchAll(/'([a-z_]+)',\s*p_/g)].map((m) => m[1]);
    expect([...new Set(keys)].sort()).toEqual(
      [
        FOOD_PREFERENCES_KEY,
        FOOD_PREFERENCES_ORIGIN_KEY,
        NEXT_PLAN_ITEMS_KEY,
        RETAINED_ITEMS_KEY,
      ].sort(),
    );
  });

  it("cet écran n'écrit JAMAIS `practical_constraints` en entier", () => {
    // Le défaut que le lot C3 a fermé, et dont le rythme de repas a été la
    // victime mesurée. Un refactor qui reviendrait à `mergePracticalConstraints`
    // ou à un `.update({ practical_constraints })` passerait tous les autres
    // tests du dépôt — celui-ci rougit.
    const code = stripComments(SOURCE);
    expect(code).not.toContain("mergePracticalConstraints");
    // ⚠️ AUCUN `update` DU TOUT dans ce module: une écriture ciblée passe par
    // la RPC, et un `update` qui reviendrait ici ne pourrait porter que la
    // colonne entière — PostgREST n'a pas de `jsonb_set`.
    expect(code).not.toMatch(/\.update\(/);
    // La ceinture de la ceinture: le module écrit BIEN quelque part, sinon les
    // deux lignes du dessus seraient vertes sur un module qui ne fait rien.
    expect(code).toMatch(/supabase\.rpc\(/);
  });

  it("le nom de la RPC appelée est celui que la migration crée", () => {
    // Un renommage d'un seul côté rend `PGRST202` — c'est-à-dire un « ça n'a
    // rien fait » que rien d'autre n'attrape.
    const called = stripComments(SOURCE).match(
      /supabase\.rpc\(\s*"([^"]+)"/,
    )?.[1];
    expect(called).toBe("keel_write_retained_items");
    expect(MIGRATION).toContain(
      "create or replace function public.keel_write_retained_items(",
    );
    // ⚠️ `revoke from public` NE RETIRE PAS `anon` — cicatrice mesurée.
    expect(MIGRATION).toContain("from public, anon, authenticated, service_role");
    expect(MIGRATION).toContain("to authenticated");
  });
});
// ===========================================================================

describe("l'exception du sujet non précisé — et LE CONSTAT LE DIT", () => {
  const MINOR = "9d1c0e40-0000-4000-8000-00000000000a";
  const ADULT = "9d1c0e40-0000-4000-8000-00000000000b";
  const NODATE = "9d1c0e40-0000-4000-8000-00000000000c";
  const roster = [
    { memberId: MINOR, ageState: "minor" as const },
    { memberId: ADULT, ageState: "adult" as const },
    { memberId: NODATE, ageState: "unknown" as const },
  ];
  const adjust = (direction: "down" | "up", subject = HOUSEHOLD_SUBJECT) =>
    itemOf(
      memory("portion.adjust", {
        source: "questionnaire",
        item: "",
        confidence: null,
        subject,
        value: { direction, magnitude: "clear" },
      }),
    ) as Extract<RetainedItem, { kind: "portion.adjust" }>;

  it("à la BAISSE, le mineur ET l'âge inconnu sortent, avec leur motif", () => {
    // ⚠️ `unknown` EST EXCLU COMME UN MINEUR: l'âge est facultatif à la saisie,
    // donc une fiche d'enfant sans date vaut `unknown`. Une garde qui
    // n'exclurait que `minor` ne mordrait pas dans le cas le plus courant —
    // cicatrice « ceinture armée sur coffre vide ».
    const audience = subjectsForPortionAdjust(adjust("down"), roster);
    expect(audience.included).toEqual([ADULT]);
    expect(audience.excluded).toEqual([
      { memberId: MINOR, reason: "minor" },
      { memberId: NODATE, reason: "age_unknown" },
    ]);
  });

  it("à la HAUSSE, personne n'est retiré — LE CAS QUI PASSE", () => {
    // Une garde sans cas passant est une garde cassée qui ressemble à une garde
    // qui marche. La règle protège d'un RETRAIT de nourriture, pas d'une part
    // plus grande servie à un enfant qui grandit.
    const audience = subjectsForPortionAdjust(adjust("up"), roster);
    expect(audience.included).toEqual([MINOR, ADULT, NODATE]);
    expect(audience.excluded).toEqual([]);
  });

  it("un sujet EXPLICITE n'est jamais filtré, même mineur", () => {
    // La personne a nommé la bouche avec la liste du foyer sous les yeux: une
    // réponse à une question fermée, pas une inférence.
    const named = subjectsForPortionAdjust(
      adjust("down", memberSubject(MINOR)!),
      roster,
    );
    expect(named.included).toEqual([MINOR]);
    expect(named.excluded).toEqual([]);
  });

  it("une bouche partie du foyer n'est pas repliée sur tout le monde", () => {
    const gone = "9d1c0e40-0000-4000-8000-0000000000ff";
    const audience = subjectsForPortionAdjust(
      adjust("down", memberSubject(gone)!),
      roster,
    );
    expect(audience.included).toEqual([]);
    expect(audience.excluded).toEqual([
      { memberId: gone, reason: "not_in_household" },
    ]);
  });

  it("la règle et ses motifs sont ceux du socle, pas une seconde version", () => {
    expect([...PORTION_ADJUST_EXCLUSIONS]).toEqual(
      backendArray("PORTION_ADJUST_EXCLUSIONS"),
    );
    // Le type d'âge est RECOPIÉ de `api/household.ts` — prouvé égal plutôt
    // qu'importé, pour ne pas traîner le graphe du foyer dans ce module.
    const front = readFileSync(resolve(__dirname, "household.ts"), "utf8");
    expect(front).toContain(
      'export type MemberAgeState = "minor" | "adult" | "unknown"',
    );
  });
});

// ===========================================================================
// ⛔ LA PERTE SILENCIEUSE — LE DÉFAUT LE PLUS GRAVE DU CHANTIER
// ===========================================================================

describe("⛔ une ligne qu'on ne sait pas LIRE n'est pas une ligne qu'on efface", () => {
  /**
   * DEUX LIGNES STOCKÉES, UNE SEULE LISIBLE.
   *
   * La seconde est le motif §2.2 en personne: `conversation × portion.adjust`
   * est la cellule interdite au memorizer, donc `canProduce` mord À LA LECTURE
   * et la ligne ne remonte pas. Elle est pourtant BIEN EN BASE.
   *
   * ⚠️ La note plate porte des ESPACES DE BORD, et ce n'est pas décoratif: c'est
   * la moitié qui prouve que `p_expected_notes` part BRUT (défaut 2).
   */
  const STORED = {
    [RETAINED_ITEMS_KEY]: [
      memory("food.exclude"),
      memory("portion.adjust", {
        value: { direction: "down", magnitude: "clear" },
      }),
    ],
    food_preferences: ["  Travaille de nuit 3× / semaine.  "],
    eating_rhythm: ["breakfast"],
  };

  beforeEach(() => {
    port.calls.length = 0;
    port.reply = { data: { ok: true, written: true }, error: null };
  });

  const lastArgs = (): Record<string, unknown> => {
    const call = port.calls[port.calls.length - 1];
    if (!call) throw new Error("aucun appel au port d'écriture");
    return call.args;
  };

  it("LA SONDE: 2 lignes stockées, 1 lue — et 2 ÉCRITES", async () => {
    // ── LE DÉFAUT, MESURÉ AVANT CORRECTIF ────────────────────────────────────
    // `p_items` était composé depuis `store.items`, c'est-à-dire depuis les
    // lignes PARSÉES. La RPC remplaçant la clé entière, la ligne refusée à la
    // lecture était EFFACÉE par n'importe quel geste — ici un simple retrait
    // d'ancienne note, qui ne parle même pas des items. Mesuré: STOCKÉ 2 →
    // ÉCRIT 1, pendant que l'écran affichait « Nothing was deleted ».
    const store = knownStoreFrom(STORED, true);
    expect((STORED[RETAINED_ITEMS_KEY] as unknown[]).length).toBe(2);
    expect(store.items).toHaveLength(1);
    expect(store.refused.forbiddenProducer).toBe(1);

    // LE GESTE: retirer l'ancienne note. Il ne touche AUCUN item.
    await persistKnownStore({
      store,
      items: store.items,
      nextPlan: store.nextPlan,
      notes: { legacyNotes: [], legacyOrigin: {} },
    });

    const written = lastArgs().p_items as unknown[];
    expect(written).toHaveLength(2);
    // Et la seconde est la ligne BRUTE, au caractère près — pas une
    // reconstruction, pas une version nettoyée.
    expect(written[0]).toEqual(retainedItemToJson(store.items[0]));
    expect(written[1]).toEqual(
      (STORED[RETAINED_ITEMS_KEY] as unknown[])[1],
    );
  });

  it("elle revient À SA PLACE, pas en queue", async () => {
    // Une envie coincée entre deux exclusions ne doit pas remonter d'un rang à
    // chaque enregistrement: l'ordre stocké est ce que la personne relira.
    const middle = {
      [RETAINED_ITEMS_KEY]: [
        memory("food.exclude", { text: "les rochers coco" }),
        { kind: "nope" },
        memory("food.prefer", { text: "le poisson blanc" }),
      ],
    };
    const store = knownStoreFrom(middle, true);
    expect(store.items).toHaveLength(2);
    expect(store.opaqueItems).toEqual([{ raw: { kind: "nope" }, after: 1 }]);

    await persistKnownStore({
      store,
      items: store.items,
      nextPlan: store.nextPlan,
      notes: null,
    });
    const written = lastArgs().p_items as Array<Record<string, unknown>>;
    expect(written.map((row) => row.kind)).toEqual([
      "food.exclude",
      "nope",
      "food.prefer",
    ]);
  });

  it("un retrait de ligne ne fait pas tomber la ligne opaque avec elle", async () => {
    const store = knownStoreFrom(STORED, true);
    // La personne supprime la SEULE ligne qu'elle voit.
    await persistKnownStore({
      store,
      items: [],
      nextPlan: store.nextPlan,
      notes: null,
    });
    const written = lastArgs().p_items as unknown[];
    // Il reste EXACTEMENT la ligne qu'elle n'a jamais vue. Le rang, borné, la
    // remet en queue d'une liste devenue plus courte — perdre un rang décale une
    // ligne, perdre la ligne est le défaut qu'on ferme.
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual((STORED[RETAINED_ITEMS_KEY] as unknown[])[1]);
  });

  it("le magasin PROVISOIRE tient la même règle, et sur ses trois refus", async () => {
    const craving = itemOf(
      memory("craving", {
        source: "written",
        item: "",
        confidence: null,
        scope: "next_plan",
        text: "des fajitas",
      }),
    );
    const durable = itemOf(memory("food.exclude"));
    const pc = {
      [NEXT_PLAN_ITEMS_KEY]: [
        { item: retainedItemToJson(craving), anchor: "2026-08-24" },
        // ① lisible, mauvais magasin ② ancre illisible ③ difforme
        { item: retainedItemToJson(durable), anchor: "2026-08-24" },
        { item: retainedItemToJson(craving), anchor: "pas-un-jour" },
        { nope: true },
      ],
    };
    const store = knownStoreFrom(pc, true);
    expect(store.nextPlan).toHaveLength(1);
    expect(store.nextPlanRefused.total).toBe(3);
    expect(store.opaqueNextPlan).toHaveLength(3);

    await persistKnownStore({
      store,
      items: store.items,
      nextPlan: store.nextPlan,
      notes: null,
    });
    const written = lastArgs().p_next as unknown[];
    expect(written).toHaveLength(4);
    expect(written.slice(1)).toEqual((pc[NEXT_PLAN_ITEMS_KEY] as unknown[]).slice(1));
  });

  it("`reglueOpaqueRows` borne les rangs au lieu de perdre la ligne", () => {
    // Rang au-delà de la liste, rang négatif, rang non fini: aucun ne fait
    // disparaître la ligne, et c'est la seule propriété qui compte ici.
    const glued = reglueOpaqueRows(["a", "b"], [
      { raw: "loin", after: 99 },
      { raw: "avant", after: -3 },
      { raw: "flou", after: Number.NaN },
    ]);
    expect(glued).toHaveLength(5);
    expect(glued).toContain("loin");
    expect(glued).toContain("avant");
    expect(glued).toContain("flou");
    expect(glued[0]).toBe("avant");
  });

  it("⛔ un magasin qui n'est PAS UNE LISTE refuse l'écriture au lieu de l'écraser", async () => {
    // Il n'existe aucune place où recoller un objet nu dans une LISTE: écrire
    // par-dessus détruirait ce qu'on ne sait pas lire. C'est le seul cas de ce
    // module où « rien ne peut s'enregistrer » est la bonne réponse — et il se
    // dit AVANT le geste, pas seulement après.
    const store = knownStoreFrom({ [RETAINED_ITEMS_KEY]: { nope: 1 } }, true);
    expect(opaqueStoreRefusal(store)).toBe(RETAINED_ITEMS_KEY);
    expect(
      await refusalOf(() =>
        persistKnownStore({
          store,
          items: [],
          nextPlan: [],
          notes: null,
        })
      ),
    ).toBe("opaque_store");
    // ⛔ ET RIEN N'EST PARTI: le refus est AVANT l'appel, pas après.
    expect(port.calls).toHaveLength(0);

    // LE CAS QUI PASSE — sans quoi la garde serait « tout est refusé ».
    const sane = knownStoreFrom({ [RETAINED_ITEMS_KEY]: [] }, true);
    expect(opaqueStoreRefusal(sane)).toBeNull();
    expect(opaqueStoreRefusal(knownStoreFrom({}, true))).toBeNull();
  });

  // ── DÉFAUT 2 · LES TROIS `expected` SONT BRUTS, TOUS LES TROIS ────────────

  it("`p_expected_notes` est le jsonb BRUT, espaces de bord compris", async () => {
    // LE DÉFAUT: `p_expected` et `p_expected_next` partaient bruts, et
    // `p_expected_notes` partait RECONSTRUIT par `keptFrom` (qui `trim()` et
    // jette les vides). Une entrée stockée porteuse d'une espace ne matchait
    // donc plus jamais le prédicat: tout reclassement rendait `stale_snapshot`
    // à l'infini — un bouton mort qui accuse un fantôme.
    const store = knownStoreFrom(STORED, true);
    expect(store.legacyNotes).toEqual(["Travaille de nuit 3× / semaine."]);
    await persistKnownStore({
      store,
      items: store.items,
      nextPlan: store.nextPlan,
      notes: { legacyNotes: [], legacyOrigin: {} },
    });
    const args = lastArgs();
    expect(args.p_expected_notes).toEqual(["  Travaille de nuit 3× / semaine.  "]);
    // ⚠️ ET SURTOUT PAS LA LISTE RECONSTRUITE — c'est exactement la valeur que
    // le prédicat SQL ne trouverait jamais.
    expect(args.p_expected_notes).not.toEqual(store.legacyNotes);
    // Ses deux voisins n'ont pas changé de nature au passage.
    expect(args.p_expected).toBe(STORED[RETAINED_ITEMS_KEY]);
    expect(args.p_expected_next).toBeNull();
  });

  it("sans geste sur les notes, les trois paramètres de notes restent NULS", async () => {
    // LE CAS QUI PASSE de la garde `bad_notes`: le couple est entier ou absent,
    // jamais à moitié. Un `p_expected_notes` posé sans `p_notes` ferait refuser
    // la RPC — et une garde qui refuse le cas nominal ressemble à une panne.
    const store = knownStoreFrom(STORED, true);
    await persistKnownStore({
      store,
      items: store.items,
      nextPlan: store.nextPlan,
      notes: null,
    });
    const args = lastArgs();
    expect(args.p_expected_notes).toBeNull();
    expect(args.p_notes).toBeNull();
    expect(args.p_origins).toBeNull();
  });

  it("une ancre non-lundi est CANONISÉE, et c'est un fait, pas une perte", () => {
    // ⚠️ CE N'EST PAS LA MÊME CHOSE QU'UNE LIGNE EFFACÉE, et il faut pouvoir le
    // dire: l'ancre ne veut pas dire « le 26 », elle veut dire « LA SEMAINE
    // VISÉE » (§7). Le lundi ISO du 26 EST cette semaine. Les deux moitiés qui
    // rendent la réécriture inoffensive sont épinglées ici: l'idempotence, et
    // l'expiration IDENTIQUE avant et après.
    expect(isoMondayOf("2026-08-26")).toBe("2026-08-24");
    expect(isoMondayOf(isoMondayOf("2026-08-26"))).toBe("2026-08-24");
    expect(nextPlanLifeOf("2026-08-26")).toEqual(nextPlanLifeOf("2026-08-24"));
    expect(nextPlanLifeOf("2026-08-26")!.lastDay).toBe("2026-08-30");
  });
});

// ===========================================================================
// ⚠️ UN REFUS NOMME CE QU'IL SAIT — ET N'INVENTE PAS DE TIERS
// ===========================================================================

/** Le refus levé, ou le motif pour lequel il n'y en a pas eu. */
async function refusalOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    return e instanceof KnownWriteError
      ? e.refusal
      : `PAS UN KnownWriteError: ${String(e)}`;
  }
  return "AUCUN REFUS";
}

describe("`stale_snapshot` n'accuse plus une concurrence imaginaire", () => {
  const store = knownStoreFrom({ [RETAINED_ITEMS_KEY]: [] }, true);
  const save = () =>
    persistKnownStore({ store, items: [], nextPlan: [], notes: null });

  beforeEach(() => {
    port.calls.length = 0;
    port.reply = { data: { ok: true, written: true }, error: null };
  });

  it("un réseau coupé dit L'INCONNU, pas « quelqu'un a modifié pendant que tu éditais »", async () => {
    // LE DÉFAUT: toute erreur PostgREST autre que `PGRST202` était étiquetée
    // `stale_snapshot`, dont la copie AFFIRME l'existence d'un tiers. Le refus
    // était au bon endroit; c'est le NOM qui mentait, et il envoyait la personne
    // recharger une page qui n'avait pas bougé.
    port.reply = { data: null, error: { message: "Failed to fetch" } };
    expect(await refusalOf(save)).toBe("write_failed");
  });

  it("un 500 et un refus RLS disent la même chose: on ne sait pas", async () => {
    port.reply = { data: null, error: { code: "42501", message: "denied" } };
    expect(await refusalOf(save)).toBe("write_failed");
    port.reply = { data: null, error: { code: "XX000", message: "boom" } };
    expect(await refusalOf(save)).toBe("write_failed");
  });

  it("`PGRST202` reste le refus NOMMÉ de la migration qui dort", async () => {
    port.reply = {
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    };
    expect(await refusalOf(save)).toBe("no_write_port");
  });

  it("SEULE LA RPC peut dire `stale_snapshot` — LE CAS QUI PASSE", async () => {
    // C'est la seule instance à l'avoir MESURÉ: son prédicat a comparé la valeur
    // live à la valeur lue. Sans ce cas, la garde du dessus serait « plus
    // personne ne dit jamais stale_snapshot », c'est-à-dire une copie morte.
    port.reply = { data: { ok: false, reason: "stale_snapshot" }, error: null };
    expect(await refusalOf(save)).toBe("stale_snapshot");
    port.reply = { data: { ok: false, reason: "no_goal_row" }, error: null };
    expect(await refusalOf(save)).toBe("no_goal_row");
  });

  it("un motif que le front ne connaît pas est un INCONNU de plus, pas un repli", async () => {
    // ⚠️ Cicatrice « `as` sur un type étranger désarme le typecheck »: le motif
    // passait en `as KnownWriteRefusal` jusqu'à la table des clés i18n, qui
    // rendait `undefined` — et l'écran affichait le message générique en croyant
    // afficher le bon.
    port.reply = { data: { ok: false, reason: "quelque_chose" }, error: null };
    expect(await refusalOf(save)).toBe("write_failed");
    expect(parseKnownWriteRefusal("quelque_chose")).toBeNull();
    expect(parseKnownWriteRefusal("stale_snapshot")).toBe("stale_snapshot");
    expect(parseKnownWriteRefusal(undefined)).toBeNull();
  });

  it("chaque refus de la liste fermée a sa phrase, dans les DEUX packs", () => {
    // La table des clés du composant est un `Record<KnownWriteRefusal, …>`: un
    // refus ajouté sans sa phrase ne compile plus. Ce qui ne compile pas tout
    // seul, c'est l'existence des clés dans les deux packs.
    const card = readFileSync(
      resolve(__dirname, "../components/KnownAboutYouCard.tsx"),
      "utf8",
    );
    const en = readFileSync(resolve(__dirname, "../i18n/en.ts"), "utf8");
    const fr = readFileSync(resolve(__dirname, "../i18n/fr.ts"), "utf8");
    const missing: string[] = [];
    for (const refusal of KNOWN_WRITE_REFUSALS) {
      const line = stripComments(card).match(
        new RegExp(`${refusal}:\\s*"([^"]+)"`),
      )?.[1];
      if (!line) {
        missing.push(`${refusal}: aucune clé dans la carte`);
        continue;
      }
      if (!en.includes(`"${line}":`)) missing.push(`${line}: absente de en.ts`);
      if (!fr.includes(`"${line}":`)) missing.push(`${line}: absente de fr.ts`);
    }
    expect(missing).toEqual([]);
    // La ceinture: la liste n'est pas vide, et elle porte bien le nom neuf.
    expect(KNOWN_WRITE_REFUSALS).toContain("write_failed");
    expect(KNOWN_WRITE_REFUSALS).toContain("opaque_store");
  });
});

// ===========================================================================
// ⚠️ LES DEUX GARDES QU'UNE MUTATION COUPAIT SANS QU'UN TEST NE TOMBE
// ===========================================================================

describe("`item: \"\"` protège l'entrée — DANS LES DEUX SENS", () => {
  it("un `written` porteur d'un uuid de souvenir est un REFUS", () => {
    // ── LA MOITIÉ QUI MANQUAIT (mutation M13) ────────────────────────────────
    // `parseOriginItem` refuse un `written` qui porte un id, et RIEN ne le
    // testait: `if (source === "written") return raw;` laissait 43 tests verts.
    // Or « `item` vide protège l'entrée » est la propriété que ce module invoque
    // pour dire que le memorizer ne peut pas reprendre une ligne corrigée. Elle
    // était testée à l'ÉCRITURE (`rewriteRetainedItem`) et pas à la LECTURE —
    // donc une ligne écrite par un producteur moins scrupuleux serait rentrée
    // avec son id, et la protection n'aurait plus tenu au rechargement.
    expect(
      parseRetainedItem(
        memory("food.exclude", {
          source: "written",
          confidence: null,
          item: MEMORY,
        }),
      ),
    ).toBeNull();
  });

  it("LE CAS QUI PASSE: le même `written` avec `item: \"\"` remonte", () => {
    const kept = parseRetainedItem(
      memory("food.exclude", { source: "written", confidence: null, item: "" }),
    );
    expect(kept).not.toBeNull();
    expect(kept!.item).toBe("");
    expect(kept!.source).toBe("written");
  });

  it("les huit cellules (source × id) du parseur d'origine, en dur", () => {
    // ⚠️ SYMÉTRIQUE: un `conversation` SANS id est refusé aussi. Une proposition
    // du memorizer qu'on ne saurait plus rattacher à son souvenir est une
    // inférence qu'on ne peut plus ni citer ni démentir.
    const reads = (source: RetainedSource, item: string): boolean =>
      parseRetainedItem(
        memory("food.exclude", {
          source,
          item,
          confidence: source === "conversation" ? 0.82 : null,
        }),
      ) !== null;
    expect(reads("written", "")).toBe(true);
    expect(reads("written", MEMORY)).toBe(false);
    expect(reads("conversation", MEMORY)).toBe(true);
    expect(reads("conversation", "")).toBe(false);
    expect(reads("questionnaire", "")).toBe(true);
    expect(reads("questionnaire", MEMORY)).toBe(true);
    expect(reads("draft_note", "")).toBe(true);
    expect(reads("draft_note", MEMORY)).toBe(true);
  });
});

// ===========================================================================
// LOT M2 · LA CITATION, ET LE FIL QUI LA MONTRE
// ===========================================================================

describe("LOT M2 — la citation est ce qui rend « Enlever » décidable", () => {
  it("une citation d'un producteur SERVEUR est lue, tronquée au plafond", () => {
    const item = parseRetainedItem(
      memory("food.exclude", { quote: "plus jamais de topinambour" }),
    );
    expect(item?.quote).toBe("plus jamais de topinambour");

    // ⚠️ TRONQUÉE, PAS RÉSUMÉE. Couper garde des mots exacts; résumer
    // fabriquerait une phrase que la personne n'a jamais écrite.
    const long = "x".repeat(RETAINED_QUOTE_MAX_CHARS + 50);
    expect(parseRetainedItem(memory("food.exclude", { quote: long }))?.quote)
      .toHaveLength(RETAINED_QUOTE_MAX_CHARS);
  });

  it("`null` est légitime — et c'est ce qui sauve les lignes d'avant M2", () => {
    // ⛔ SI LE PARSEUR EXIGEAIT UNE CITATION, LE LOT EFFACERAIT SON PASSÉ:
    // toutes les lignes déjà en base tomberaient au premier chargement, en
    // silence. C'est la même faute qu'un retrait de producteur mal fait.
    expect(parseRetainedItem(memory("food.exclude", { quote: null }))?.quote)
      .toBeNull();
    const noKey = memory("food.exclude");
    delete (noKey as Record<string, unknown>).quote;
    expect(parseRetainedItem(noKey)).not.toBeNull();
    expect(parseRetainedItem(noKey)?.quote).toBeNull();
    // Une chaîne blanche ne cite personne.
    expect(parseRetainedItem(memory("food.exclude", { quote: "   " }))?.quote)
      .toBeNull();
  });

  it("⛔ une citation sur une ligne `written` est un REFUS", () => {
    // Son `text` EST sa phrase: la carte afficherait « tu l'as écrit, parce
    // que tu as écrit … ». Et surtout, une citation sur `written` signale un
    // producteur serveur DÉGUISÉ — le contournement que la matrice entière
    // existe pour fermer, puisque `canProduce("written", …)` autorise tout.
    expect(
      parseRetainedItem(
        memory("food.exclude", {
          source: "written",
          item: "",
          confidence: null,
          quote: "posée par un producteur qui se cache",
        }),
      ),
    ).toBeNull();
    // Le cas qui passe: `written` SANS citation.
    expect(
      parseRetainedItem(
        memory("food.exclude", { source: "written", item: "", confidence: null }),
      ),
    ).not.toBeNull();
  });

  it("une forme illisible est un refus, jamais un repli sur `null`", () => {
    // Replier ferait passer un producteur cassé pour un producteur d'avant M2.
    for (const bad of [42, {}, [], true]) {
      expect(parseRetainedItem(memory("food.exclude", { quote: bad })))
        .toBeNull();
    }
  });

  it("l'aller-retour jsonb garde la citation", () => {
    const item = itemOf(memory("food.exclude", { quote: "pas de fenouil" }));
    expect(parseRetainedItem(retainedItemToJson(item))).toEqual(item);
    // La clé est écrite MÊME à `null`: « pas de citation » et « version qui ne
    // connaissait pas le champ » ne se déboguent pas pareil.
    const bare = itemOf(memory("food.exclude", { quote: null }));
    expect(Object.keys(retainedItemToJson(bare))).toContain("quote");
  });

  it("la citation SUIT LA MAIN: gardée tant que la source tient, perdue sinon", () => {
    // ⚠️ TANT QUE LA SOURCE TIENT: corriger une faute de frappe ne doit pas
    // rendre la ligne indéfaisable.
    const fromForm = itemOf(
      memory("food.prefer", {
        source: "questionnaire",
        item: "",
        confidence: null,
        quote: "“Anything in it you would want again?” → “Dhal”",
      }),
    );
    const kept = rewriteRetainedItem(
      fromForm,
      { text: "Dhal de lentilles", kind: "food.prefer", subject: HOUSEHOLD_SUBJECT, value: null },
      "2026-09-01",
    );
    expect(kept?.source).toBe("questionnaire");
    expect(kept?.quote).toBe("“Anything in it you would want again?” → “Dhal”");

    // ⛔ ET ELLE TOMBE AVEC LA SOURCE. Devenue `written`, la ligne est SIENNE:
    // `parseQuote` refuse une citation sur `written`, donc la garder ferait
    // rendre `null` — perdre la ligne par l'autre bout.
    const taken = rewriteRetainedItem(
      itemOf(memory("food.exclude", { quote: "je l'ai dit mardi" })),
      { text: "les parts", kind: "portion.adjust", subject: HOUSEHOLD_SUBJECT, value: { direction: "down", magnitude: "clear" } },
      "2026-09-01",
    );
    expect(taken?.source).toBe("written");
    expect(taken?.quote).toBeNull();
  });
});

describe("LOT M2 — le fil « ce qui vient de changer » est une VUE", () => {
  const at = (day: string, over: Record<string, unknown> = {}) =>
    itemOf(memory("food.exclude", { at: day, quote: `dit le ${day}`, ...over }));

  it("les plus récentes d'abord, et le plafond est d'AFFICHAGE", () => {
    const items = [
      at("2026-08-10"),
      at("2026-08-12"),
      at("2026-08-14"),
      at("2026-08-16"),
      at("2026-08-18"),
      at("2026-08-20"),
    ];
    const feed = recentlyKept(items);
    expect(feed).toHaveLength(RECENTLY_KEPT_SHOWN);
    expect(feed.map((i) => i.at)).toEqual([
      "2026-08-20",
      "2026-08-18",
      "2026-08-16",
      "2026-08-14",
      "2026-08-12",
    ]);
    // ⚠️ RIEN N'EST JETÉ: la plus ancienne reste dans le magasin, donc dans sa
    // section un écran plus bas. Le fil répond à « qu'est-ce qui vient de
    // changer ? », pas à « qu'est-ce que tu sais de moi ? ».
    expect(items).toHaveLength(6);
  });

  it("⛔ `written` n'entre PAS dans le fil", () => {
    // Notifier quelqu'un de ce qu'il vient de taper lui-même est du bruit: il
    // était là, il l'a fait, il n'a rien à défaire. Un fil qui mélange les deux
    // perd sa seule promesse — « voici ce que le produit a décidé sans toi ».
    const mine = itemOf(
      memory("food.exclude", {
        at: "2026-08-25",
        source: "written",
        item: "",
        confidence: null,
      }),
    );
    const feed = recentlyKept([mine, at("2026-08-12")]);
    expect(feed).toHaveLength(1);
    // La fixture `memory()` porte `source: "conversation"` — un producteur
    // RETIRÉ (lot M1) dont les lignes restent LUES. Le fil les montre donc,
    // et c'est juste: la personne ne les a pas écrites, elle a tout intérêt à
    // les voir pour pouvoir les retirer.
    expect(feed[0].source).toBe("conversation");
    expect(feed[0].source).not.toBe("written");
  });

  it("plusieurs lignes d'un même bilan gardent l'ordre où elles ont été écrites", () => {
    // ⚠️ LA DATE SEULE NE SUFFIT PAS: un bilan produit plusieurs lignes le
    // MÊME jour, et sans départage leur ordre dépendrait de l'implémentation
    // du tri du navigateur.
    const sameDay = [
      at("2026-08-18", { text: "première" }),
      at("2026-08-18", { text: "deuxième" }),
      at("2026-08-18", { text: "troisième" }),
    ];
    expect(recentlyKept(sameDay).map((i) => i.text)).toEqual([
      "troisième",
      "deuxième",
      "première",
    ]);
  });

  it("un magasin vide rend un fil vide, sans jeter", () => {
    expect(recentlyKept([])).toEqual([]);
    expect(recentlyKept([at("2026-08-18")], 0)).toEqual([]);
  });
});

describe("⛔ AUCUN REPLI DE PORTÉE — l'aveu, et ce qui l'épingle", () => {
  const CODE = stripComments(
    readFileSync(resolve(__dirname, "retainedItems.ts"), "utf8"),
  );

  it("le refus de portée et la cellule interdite sont le MÊME ensemble (32 cellules)", () => {
    // C'EST LA PRÉMISSE DE L'AVEU. Les deux `if (scope === null) return null;`
    // du module sont des branches MORTES — mortes PARCE QUE cette équivalence
    // tient. Le jour où elle tombe, la branche redevient vivante, et ce test
    // rougit AVANT elle, ce qui est le seul ordre utile.
    const drift: string[] = [];
    for (const source of RETAINED_SOURCES) {
      for (const kind of RETAINED_KINDS) {
        const refusesScope = defaultScopeFor(source, kind) === null;
        const forbidden = !canProduce(source, kind);
        if (refusesScope !== forbidden) drift.push(`${source} × ${kind}`);
      }
    }
    expect(drift).toEqual([]);
    // La ceinture de la ceinture: l'ensemble n'est ni vide ni total. À vide,
    // l'équivalence serait vraie en ne mesurant rien.
    const refused = RETAINED_SOURCES.flatMap((source) =>
      RETAINED_KINDS.filter((kind) => defaultScopeFor(source, kind) === null)
    );
    // 14 = 3 (`draft_note`: portion, rythme, logistique)
    //    + 3 (`questionnaire`: envie, rythme, logistique)
    //    + 8 (`conversation`, LIGNE VIDE depuis le lot M1).
    // ⟳ LOT M5 — trois cellules de plus: `rhythm.set` et `logistics.set` ne se
    // retiennent plus, ils changent le CHAMP que la personne voit.
    // Le nombre est écrit en toutes lettres parce qu'un `toBeGreaterThan(0)`
    // resterait vert le jour où une ligne entière se refermerait par accident.
    expect(refused).toHaveLength(14);
  });

  it("aucun `defaultScopeFor(…) ?? …` ne peut se glisser dans ce module", () => {
    // ── LA MUTATION M9, TUÉE PAR UN LITTÉRAL ────────────────────────────────
    // `const scope = defaultScopeFor(source, edit.kind) ?? "durable"` laissait
    // 43 tests verts, alors que c'est le piège n°1 du contrat de phase 0,
    // documenté TROIS fois dans le fichier et tenu par AUCUN test au point
    // d'appel. La branche est morte aujourd'hui (voir l'aveu écrit à côté), mais
    // le repli, lui, réarmerait l'interdit en silence le jour où elle revit.
    expect(CODE).not.toMatch(/defaultScopeFor\([^)]*\)\s*\?\?/);
    // LE CAS QUI PASSE: le module APPELLE bien `defaultScopeFor` et LIT son
    // refus à CHAQUE appel. Sans ces deux comptes, la négation ci-dessus serait
    // verte sur un module qui aurait retiré la garde entière.
    //
    // ⟳ LOT C — TROIS APPELS, ET LE TROISIÈME NE REND PAS `null`. Les deux
    // premiers sont des parseurs: une cellule interdite y fait rendre `null`,
    // c'est-à-dire « cette ligne n'existe pas ». Le troisième est un ÉCRIVAIN
    // (`addWrittenFoodExclusions`, le champ « Aliments refusés » d'une fiche):
    // rendre `null` y voudrait dire « je n'écris rien », ce qui est le silence
    // que ce dépôt paie en boucle. Il LÈVE. Les deux formes sont comptées, et
    // la somme épinglée: c'est le refus lu qui compte, pas sa forme.
    const calls = [...CODE.matchAll(/=\s*defaultScopeFor\(/g)];
    expect(calls).toHaveLength(3);
    const returnsNull = [...CODE.matchAll(/if \(scope === null\) return null;/g)];
    const throws = [...CODE.matchAll(/if \(scope === null\) \{\n\s*throw new Error\(/g)];
    expect(returnsNull).toHaveLength(2);
    expect(throws).toHaveLength(1);
    expect(returnsNull.length + throws.length).toBe(calls.length);
  });

  it("le port d'écriture ne prononce PAS `stale_snapshot`", () => {
    // La moitié littérale du défaut 3: la fonction qui parle à PostgREST n'a
    // aucun droit de nommer une concurrence qu'elle n'a pas mesurée.
    const body = CODE.slice(
      CODE.indexOf("async function callWritePort"),
      CODE.indexOf("export interface KnownWriteRequest"),
    );
    expect(body.length, "le corps de `callWritePort` n'a pas été retrouvé")
      .toBeGreaterThan(200);
    expect(body).not.toContain('"stale_snapshot"');
    expect(body).toContain('"PGRST202"');
    expect(body).toContain('"no_write_port"');
    expect(body).toContain('"write_failed"');
  });

  it("la charge utile RECOLLE les lignes opaques, et le SQL le sait", () => {
    // La bretelle du défaut 1: `writePortArgsFor` doit passer par
    // `reglueOpaqueRows` sur LES DEUX magasins. Un refactor qui reviendrait à
    // `durable.map(retainedItemToJson)` nu rouvrirait la perte silencieuse et
    // passerait tous les tests de forme — celui-ci rougit.
    const payload = CODE.slice(
      CODE.indexOf("export function writePortArgsFor"),
      CODE.indexOf("export async function persistKnownStore"),
    );
    expect([...payload.matchAll(/reglueOpaqueRows\(/g)]).toHaveLength(2);
    expect(payload).toContain("args.store.rawNotes");
    expect(payload).not.toContain("args.store.legacyNotes");
  });
});

// ===========================================================================

describe("⛔ la ligne médicale reste posée DANS la requête", () => {
  it("`loadFoodPreferenceProposals` filtre encore `sensitivity_level`", () => {
    // Cet écran réutilise le chargeur de propositions de `FoodPreferencesCard`.
    // Le filtre `sensitive`/`safety` est posé DANS la requête, pas à
    // l'affichage: rien de médical ne doit même traverser le réseau vers un
    // écran de préférences. Un refactor qui déplacerait ce filtre côté rendu
    // passerait tous les autres tests du dépôt — celui-ci rougit.
    const source = readFileSync(resolve(__dirname, "foodPreferences.ts"), "utf8");
    const query = source.slice(source.indexOf("loadFoodPreferenceProposals"));
    expect(query).toContain('.eq("sensitivity_level", "normal")');
  });
});

// ⟳ 2026-09-05 — « PROCHAIN PLAN » : LA MÊME RÈGLE DES DEUX CÔTÉS.
// Serveur: une envie meurt dès qu'un plan est validé après son écriture
// (`validated_at > written_at`). Écran: elle vivait jusqu'à ancre + 6 jours
// sans regarder `validated_at` — et chaque enregistrement PERDAIT
// `written_at` (12 entrées sur 19 en base sans lui).
describe("prochain plan — servie, et written_at qui survit à l'écran", () => {
  const craving = {
    kind: "food.prefer", item: "", text: "du poisson", subject: "household", source: "written",
    at: "2026-09-02", confidence: null, quote: null, scope: "next_plan", value: null,
  } as unknown as Parameters<typeof withNextPlanEntries>[1][number]["item"];
  const anchor = "2026-08-31";
  const writtenAt = "2026-09-02T10:00:00.000Z";

  it("written_at est LU dans l'enveloppe et RENDU tel quel par l'écrivain de l'écran", () => {
    const read = readNextPlanEntries({
      retained_next_plan: [{ item: { ...craving }, anchor, written_at: writtenAt }],
    });
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0].writtenAt).toBe(writtenAt);
    const back = withNextPlanEntries({}, read.entries);
    const rows = back.retained_next_plan as Array<Record<string, unknown>>;
    expect(rows[0].written_at).toBe(writtenAt);
    // Une entrée sans written_at n'en invente pas un.
    const bare = withNextPlanEntries({}, [{ item: craving, anchor }]);
    expect((bare.retained_next_plan as Array<Record<string, unknown>>)[0]).not.toHaveProperty("written_at");
  });

  it("SERVIE : un plan validé APRÈS l'écriture la sert ; avant, non ; sans plan validé, jamais", () => {
    const entry = { item: craving, anchor, writtenAt };
    expect(isNextPlanItemServed(entry, "2026-09-02T18:00:00.000Z")).toBe(true);
    expect(isNextPlanItemServed(entry, "2026-09-02T09:00:00.000Z")).toBe(false);
    expect(isNextPlanItemServed(entry, null)).toBe(false);
    expect(isNextPlanItemServed(entry, "pas une date")).toBe(false);
  });

  it("sans written_at, la règle du jour: servie par un plan validé un jour POSTÉRIEUR à item.at", () => {
    const entry = { item: craving, anchor };
    expect(isNextPlanItemServed(entry, "2026-09-03T06:00:00.000Z")).toBe(true);
    expect(isNextPlanItemServed(entry, "2026-09-02T23:00:00.000Z")).toBe(false);
  });

  it("le filtre vivant lit les DEUX règles: calendrier ET servie", () => {
    const entry = { item: craving, anchor, writtenAt };
    expect(liveNextPlanEntries([entry], "2026-09-04")).toHaveLength(1);
    expect(liveNextPlanEntries([entry], "2026-09-04", "2026-09-03T12:00:00.000Z")).toHaveLength(0);
    expect(liveNextPlanEntries([entry], "2026-09-04", "2026-09-01T12:00:00.000Z")).toHaveLength(1);
  });

  it("isoInstantOf normalise et refuse le reste", () => {
    expect(isoInstantOf(" 2026-09-02T10:00:00Z ")).toBe("2026-09-02T10:00:00.000Z");
    expect(isoInstantOf("n'importe quoi")).toBeNull();
    expect(isoInstantOf(42)).toBeNull();
  });

  it("CÂBLAGE — le store lit le dernier validated_at, la carte filtre avec", () => {
    const api = readFileSync(resolve(__dirname, "./retainedItems.ts"), "utf8");
    expect(api).toMatch(/from\("student_generated_meals"\)[\s\S]{0,200}select\("validated_at"\)/);
    expect(api).toMatch(/lastValidatedAt: isoInstantOf\(lastValidatedAt\)/);
    const card = readFileSync(resolve(__dirname, "../components/KnownAboutYouCard.tsx"), "utf8");
    expect(card).toMatch(/liveNextPlanEntries\(store\.nextPlan, today, store\.lastValidatedAt\)/);
  });
});
