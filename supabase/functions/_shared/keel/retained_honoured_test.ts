/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PLAN A-T-IL TENU ? — le constat, sur la ligne écrite du 2026-09-21.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LA MESURE QUE CE FICHIER PORTE ────────────────────────────────────────
 * Le foyer écrit « Je veux pas de choses genre tofu, poissons au petit
 * déjeuné ». Deux jours plus tard, le petit-déjeuner partagé du jeudi est
 * « Tofu, pain complet et pêche ».
 *
 * Ce fichier montre que le souvenir TEL QU'IL EST RANGÉ AUJOURD'HUI ressort
 * **« honoré »** sur ce plan-là. Ce n'est pas un compteur absent: c'est un
 * compteur qui aurait dit VERT. Le motif est mécanique et se lit dans
 * `food_exclusion_belt.ts`: un texte sans marqueur de phrase (« tofu,
 * poissons au petit déjeuné » n'a ni pronom, ni négation, ni verbe de goût)
 * est une PHRASE NUE, et une phrase nue ne mord que si TOUS ses mots sont dans
 * le plat. Un petit-déjeuner au tofu n'en porte qu'un.
 *
 * Découpé et scopé — la cible du lot —, le même souvenir ressort **« violé »**,
 * en nommant le plat fautif.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type ExclusionPreparation,
} from "./food_exclusion_belt.ts";
import {
  type HonouredDish,
  type HonouredItem,
  retainedHonoured,
} from "./retained_honoured.ts";
import { CORPUS_MEMBER_IDS } from "./draft_note_corpus.ts";

const CHRISTELE = CORPUS_MEMBER_IDS.christele;
const LEA = CORPUS_MEMBER_IDS.lea;

// ===========================================================================
// LA LIGNE ÉCRITE — réduite, et anonymisée
// ===========================================================================

/**
 * ⛔ RIEN N'EST LU HORS DU DÉPÔT. Les données sont INLINE, donc versionnées
 * avec le constat qu'elles épinglent: un test qui lirait un artefact de
 * `scratchpad/` devient rouge le jour où quelqu'un range son disque, et
 * personne ne sait plus ce qu'il mesurait.
 */
const PREPARATIONS: ReadonlyMap<string, ExclusionPreparation> = new Map([
  ["prep_poulet", {
    id: "prep_poulet",
    title: "Poulet rôti",
    method: "four",
    ingredients: [{ term: "poulet" }, { term: "huile d'olive" }],
  }],
  ["prep_tofu_marine", {
    id: "prep_tofu_marine",
    title: "Tofu mariné",
    method: "poele",
    // ⚠️ LE TOFU N'EST QUE LÀ. C'est le cas nominal de la cuisine par lots:
    // le plat cite la casserole, la casserole porte l'aliment.
    ingredients: [{ term: "tofu" }, { term: "sauce soja" }],
  }],
]);

const PLAN: readonly HonouredDish[] = [
  {
    day: "thu",
    slot: "breakfast",
    title: "Tofu, pain complet et pêche",
    method: "sans cuisson",
    ingredients: [{ term: "pain complet", ref: null }, { term: "pêche", ref: null }],
    uses: [{ preparationId: "prep_tofu_marine" }],
    memberIds: [],
  },
  {
    day: "thu",
    slot: "lunch",
    title: "Poulet rôti et riz",
    method: "four",
    ingredients: [{ term: "riz", ref: null }],
    uses: [{ preparationId: "prep_poulet" }],
    memberIds: [],
  },
  {
    day: "fri",
    slot: "dinner",
    title: "Gratin de courgettes",
    method: "four",
    ingredients: [{ term: "courgette", ref: null }, { term: "crème", ref: null }],
    uses: [],
    // Un plat qui ne sert qu'une bouche: la boîte d'échange.
    memberIds: [LEA],
  },
];

const item = (patch: Partial<HonouredItem> & { text: string }): HonouredItem => ({
  kind: "food.exclude",
  subject: "household",
  occasion: null,
  // Le défaut du squelette est la règle FORTE, comme dans le socle: une ligne
  // sans force est une interdiction, jamais une tendance.
  force: "never",
  // Par défaut, AUCUNE clé: c'est l'état de 4 souvenirs sur 9 en base, et le
  // chemin par les mots doit rester testé sur lui.
  ref: null,
  ...patch,
});

const read = (items: readonly HonouredItem[]) =>
  retainedHonoured({ items, dishes: PLAN, preparationById: PREPARATIONS });

// ===========================================================================
// LA MESURE DU 2026-09-21
// ===========================================================================

Deno.test("⛔ MESURÉ — le souvenir TEL QU'IL EST RANGÉ AUJOURD'HUI ressort « honoré »", () => {
  // La ligne réelle, à l'octet près: UN item, le moment enfermé dans le texte.
  const stored = item({ text: "tofu, poissons au petit déjeuné" });
  const out = read([stored]);
  assertEquals(out.rows.length, 1);
  assertEquals(
    out.rows[0].verdict,
    "honoured",
    "si ce verdict a changé, le lot a bougé — relire la mesure avant de " +
      "toucher au test",
  );
  // ⚠️ ET LE COMPTEUR AURAIT DIT VERT: 1 vérifié, 1 honoré, 0 violé. C'est
  // exactement le faux vert que ce lot existe pour retirer.
  assertEquals(out.counters, {
    items: 1,
    checked: 1,
    honoured: 1,
    violated: 0,
    unverifiable: 0,
    unverifiable_by_reason: {
      no_plan_surface: 0,
      no_searchable_word: 0,
      mouth_absent: 0,
      slot_absent: 0,
      no_baseline: 0,
    },
    by_ref: 0,
    by_words: 1,
  });
});

Deno.test("CIBLE — découpé et scopé, le même souvenir ressort « violé », et nomme le plat", () => {
  const out = read([
    item({ text: "tofu", occasion: "breakfast" }),
    item({ text: "poisson", occasion: "breakfast" }),
  ]);
  const tofu = out.rows.find((r) => r.text === "tofu")!;
  assertEquals(tofu.verdict, "violated");
  assertEquals(tofu.dish, "thu/breakfast · Tofu, pain complet et pêche");
  assertEquals(tofu.matched, "tofu");
  // ⚠️ LE POISSON, LUI, A BIEN ÉTÉ HONORÉ. Les deux moitiés comptent: un
  // constat qui dirait « violé » partout ne prouverait rien de plus qu'un
  // constat qui dirait « honoré » partout.
  const poisson = out.rows.find((r) => r.text === "poisson")!;
  assertEquals(poisson.verdict, "honoured");
  assertEquals(out.counters.checked, 2);
  assertEquals(out.counters.violated, 1);
  assertEquals(out.counters.honoured, 1);
});

Deno.test("la casserole compte — le tofu n'est QUE dans la préparation", () => {
  // Cicatrice `preparations-must-be-folded-into-dishes`: 51 % de la protéine
  // vivait hors du verdict. Ici le plat ne déclare que « pain complet » et
  // « pêche »; sans le pliage, le constat dirait « honoré ».
  const out = retainedHonoured({
    items: [item({ text: "tofu", occasion: "breakfast" })],
    dishes: PLAN,
    preparationById: new Map(),
  });
  assertEquals(
    out.rows[0].verdict,
    "honoured",
    "sans casseroles, le tofu est invisible — c'est le comportement attendu " +
      "d'une lecture amputée, et c'est pour ça que la carte est REQUISE",
  );
  assertEquals(read([item({ text: "tofu", occasion: "breakfast" })]).rows[0].verdict, "violated");
});

// ===========================================================================
// LE MOMENT, LA BOUCHE, ET CE QU'ON NE SAIT PAS JUGER
// ===========================================================================

Deno.test("le moment filtre — une règle du matin ne juge pas un dîner", () => {
  // Le gratin du vendredi soir porte de la courgette. Une règle scopée au
  // petit-déjeuner ne doit pas le voir: sinon le moment ne servirait à rien.
  const out = read([item({ text: "courgette", occasion: "breakfast" })]);
  assertEquals(out.rows[0].verdict, "honoured");
  const sansMoment = read([item({ text: "courgette" })]);
  assertEquals(sansMoment.rows[0].verdict, "violated");
});

Deno.test("un moment qu'aucun plat n'occupe se DIT, il ne se devine pas", () => {
  const out = read([item({ text: "tofu", occasion: "snack_am" })]);
  assertEquals(out.rows[0].verdict, "unverifiable");
  assertEquals(out.rows[0].reason, "slot_absent");
  assertEquals(out.counters.checked, 0);
  assertEquals(out.counters.unverifiable, 1);
});

Deno.test("la bouche filtre — on ne juge une ligne que sur ce que cette bouche a mangé", () => {
  // Le gratin ne sert que Léa. La ligne de Christèle ne se juge pas dessus:
  // la ceinture a le droit de retirer une bouche d'un contenant, et le constat
  // doit lire le MÊME résultat qu'elle.
  const pourChristele = read([
    item({ text: "courgette", subject: `member:${CHRISTELE}` }),
  ]);
  assertEquals(pourChristele.rows[0].verdict, "honoured");
  const pourLea = read([item({ text: "courgette", subject: `member:${LEA}` })]);
  assertEquals(pourLea.rows[0].verdict, "violated");
});

Deno.test("une famille sans surface de plat sort `unverifiable`, et le motif le dit", () => {
  // ⛔ UNE PART, UN RYTHME, UNE LOGISTIQUE NE SE LISENT PAS DANS LES ALIMENTS
  // D'UN PLAT. Les juger là rendrait un verdict tiré au sort.
  const out = read([
    item({ kind: "portion.adjust", text: "un peu trop pour elle" }),
    item({ kind: "rhythm.set", text: "pas de dîner" }),
    item({ kind: "logistics.set", text: "45 minutes" }),
  ]);
  for (const row of out.rows) {
    assertEquals(row.verdict, "unverifiable");
    assertEquals(row.reason, "no_plan_surface");
  }
  assertEquals(out.counters.unverifiable_by_reason.no_plan_surface, 3);
  assertEquals(out.counters.checked, 0);
});

Deno.test("une phrase sans mot cherchable se compte, elle ne se rend pas verte", () => {
  // « Je veux moins de trucs compliqués » n'a aucun aliment à chercher. Mieux
  // vaut ne rien chercher que de chercher « truc » — et mieux vaut le COMPTER
  // que de rendre « honoré ».
  const out = read([item({ text: "de" })]);
  assertEquals(out.rows[0].verdict, "unverifiable");
  assertEquals(out.rows[0].reason, "no_searchable_word");
});

// ===========================================================================
// LE SENS DE CHAQUE FAMILLE
// ===========================================================================

Deno.test("ce qu'on VOULAIT revoir est honoré quand c'est là, violé quand ça manque", () => {
  // ⚠️ LES DEUX SENS EXISTENT, et c'est ce qui rend le compteur lisible: un
  // `food.prefer` jamais servi est une demande ignorée, pas une absence de
  // contrôle.
  const servi = read([item({ kind: "food.prefer", text: "poulet" })]);
  assertEquals(servi.rows[0].verdict, "honoured");
  assertEquals(servi.rows[0].matched, "poulet");

  const absent = read([item({ kind: "craving", text: "fajitas" })]);
  assertEquals(absent.rows[0].verdict, "violated");
  assertEquals(absent.rows[0].dish, null);
});

// ===========================================================================
// LE COMPTEUR
// ===========================================================================

Deno.test("le compteur a un DÉNOMINATEUR, et ses deux égalités tiennent", () => {
  // `violated: 0` seul rend le même zéro pour « rien n'a été violé » et pour
  // « rien n'a été vérifié ». C'est le zéro que ce dépôt paie en boucle.
  const out = read([
    item({ text: "tofu", occasion: "breakfast" }),
    item({ text: "poisson", occasion: "breakfast" }),
    item({ kind: "portion.adjust", text: "un peu trop" }),
    item({ text: "tofu", occasion: "snack_am" }),
    item({ kind: "food.prefer", text: "poulet" }),
  ]);
  const c = out.counters;
  assertEquals(c.items, 5);
  assertEquals(c.checked, c.honoured + c.violated);
  assertEquals(c.items, c.checked + c.unverifiable);
  assertEquals(
    c.unverifiable,
    Object.values(c.unverifiable_by_reason).reduce((a, b) => a + b, 0),
  );
  // Les nombres EN DUR: un compteur qui se recalcule depuis la fonction sous
  // test reste vert quand la fonction change d'avis.
  assertEquals(c.checked, 3);
  assertEquals(c.honoured, 2);
  assertEquals(c.violated, 1);
  assertEquals(c.unverifiable, 2);
});

Deno.test("aucun souvenir ne se perd: une ligne par souvenir, toujours", () => {
  const items = [
    item({ text: "tofu", occasion: "breakfast" }),
    item({ kind: "rhythm.set", text: "pas de dîner" }),
    item({ text: "de" }),
  ];
  const out = read(items);
  assertEquals(out.rows.length, items.length);
  assert(
    out.rows.every((r) => r.text.trim() !== ""),
    "une ligne sans texte ne se raconte pas",
  );
});

Deno.test("un plan VIDE n'honore rien — il ne vérifie rien", () => {
  // Le zéro ambigu, dans l'autre sens: sans plat, tout souvenir qui demande
  // une ABSENCE serait trivialement « honoré ». Le motif doit le dire.
  const out = retainedHonoured({
    items: [item({ text: "tofu", occasion: "breakfast" })],
    dishes: [],
    preparationById: PREPARATIONS,
  });
  assertEquals(out.rows[0].verdict, "unverifiable");
  assertEquals(out.rows[0].reason, "slot_absent");
});

// ===========================================================================
// LE CÂBLAGE — le constat atteint la LIGNE ÉCRITE, pas seulement un journal
// ===========================================================================
//
// ⛔ UNE MENTION N'EST PAS UN CÂBLAGE. Ce dépôt l'a mesuré: une assertion qui
// exigeait seulement que le bloc « parle de » la variable restait VERTE sur un
// bloc dont les deux injections avaient été retirées. On épingle donc les
// points d'ENTRÉE et de SORTIE, et une mutation de chacun doit rougir.

const LANE = new URL("../../generate-household-meal-v1/index.ts", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

Deno.test("câblage — le constat tourne sur le plan livré et entre dans `generated_from`", async () => {
  const code = stripComments(await Deno.readTextFile(LANE));
  const missing: string[] = [];

  // ① L'ENTRÉE: les souvenirs lus sont ceux de la ceinture — `beltItems`, qui
  // porte AUSSI la note fraîche. `routedRetained.composition` seul raterait la
  // phrase qui vient d'être écrite, c'est-à-dire le cas mesuré.
  if (!/items: beltItems\.map\(/.test(code)) missing.push("entree_belt_items");

  // ② LE MOMENT EST RECOPIÉ. Sans lui, chaque souvenir vaudrait toute la
  // journée et le constat rendrait « violé » sur des plats que personne n'a
  // refusés.
  if (!/occasion: \(it as \{ occasion\?: RhythmOccasion \| null \}\)\.occasion \?\? null/.test(code)) {
    missing.push("moment_recopie");
  }

  // ③ LES PLATS LUS SONT CEUX DU PLAN FINAL, casseroles comprises.
  if (!/dishes: meal\.dishes\.map\(/.test(code)) missing.push("plats_du_plan");
  if (!/uses: \(dish\.uses \?\? \[\]\)\.map\(/.test(code)) missing.push("casseroles_pliees");

  // ④ LA SORTIE: sur la LIGNE ÉCRITE. Un journal s'efface, le plan reste — et
  // c'est la seule surface où « pourquoi il y a du tofu ? » se répond.
  if (!/retained_honoured: retainedHonouredTrace,/.test(code)) {
    missing.push("sortie_generated_from");
  }

  // ⑤ ET LE DÉNOMINATEUR SORT AVEC. `...out.counters` porte `checked`; sans
  // lui, `violated: 0` rendrait le même zéro pour « rien n'a été violé » et
  // « rien n'a été vérifié ».
  if (!/tag: "keel\.household_meal\.retained_honoured"/.test(code)) {
    missing.push("journal_nomme");
  }
  if (!/\.\.\.out\.counters,/.test(code)) missing.push("denominateur_journalise");

  // ⑥ ⟳ 2026-09-22 — ET IL SE LIT SUR UN BROUILLON.
  //
  // ⛔ MESURÉ EN BASE: la clé était sur **0 des 635 plans**. Pas parce que le
  // compteur ne tournait pas, mais parce que `generated_from` n'est persisté
  // que sur une ligne ADOPTÉE — et que tout le travail de ce chantier se fait
  // en `intent: "draft"`. Un compteur qu'on ne peut lire que sur ce qu'on
  // mesure le moins est un compteur qui n'existe pas.
  const draftBody = code.slice(code.indexOf("const draftBody = {"));
  if (!/retained_honoured: retainedHonouredTrace,/.test(draftBody)) {
    missing.push("lisible_en_brouillon");
  }
  // ⚠️ LE MÊME OBJET DES DEUX CÔTÉS, jamais un second calcul: deux mesures
  // écrites séparément divergent, et c'est celle qu'on regarde le moins qui
  // dit que tout va bien.
  if ((code.match(/retained_honoured: retainedHonouredTrace,/g) ?? []).length !== 2) {
    missing.push("deux_surfaces_un_seul_calcul");
  }

  assertEquals(missing, [], `câblage rompu: ${missing.join(", ")}`);
});

Deno.test("câblage — ET L'ÉPINGLE ROUGIT QUAND ON RETIRE LA SORTIE", async () => {
  // Sans cette moitié, l'épingle ci-dessus serait un `indexOf` sur une chaîne
  // qu'on n'a jamais essayé de faire disparaître.
  //
  // ⟳ 2026-09-22 — LA SORTIE EXISTE MAINTENANT À DEUX ENDROITS (la ligne
  // écrite et le brouillon), et la mutation doit les retirer TOUTES LES DEUX.
  // Avec un `replace` simple — qui ne remplace que la première — la seconde
  // survivait et la mutation ne prouvait plus rien: c'est très exactement
  // « une mention n'est pas un câblage », vu depuis le test.
  const raw = stripComments(await Deno.readTextFile(LANE));
  assertEquals(
    (raw.match(/retained_honoured: retainedHonouredTrace,/g) ?? []).length,
    2,
    "le constat ne sort plus sur les deux surfaces",
  );
  const mutated = raw.replaceAll("retained_honoured: retainedHonouredTrace,", "");
  assert(
    !/retained_honoured: retainedHonouredTrace,/.test(mutated),
    "la mutation n'a rien retiré: l'épingle ne mesure pas ce qu'elle dit",
  );
  // ⚠️ ET LES DEUX SURFACES SONT DISTINCTES: `generated_from` (la ligne
  // écrite) et `draftBody` (le brouillon). Les compter sans vérifier où elles
  // sont laisserait passer deux clés au même endroit.
  assert(
    raw.indexOf("const draftBody = {") > 0 &&
      raw.indexOf("retained_honoured: retainedHonouredTrace,", raw.indexOf("const draftBody = {")) > 0,
    "le brouillon ne porte pas le constat",
  );
});

// ===========================================================================
// ⟳ 2026-09-22 — « MOINS » NE SE JUGE PAS SUR UN PLAN
// ===========================================================================

Deno.test("⛔ « moins » sort `unverifiable / no_baseline`, jamais un verdict", () => {
  // ── POURQUOI CE N'EST PAS UNE LACUNE DE CE MODULE ────────────────────────
  // « Moins de petit suisse » est une comparaison avec ce qui était servi
  // AVANT ; un plan seul n'a pas cet « avant ». Le rendre `honoured` parce que
  // l'aliment est absent serait faux — le plan n'en servait peut-être jamais.
  // Le rendre `violated` parce qu'il est présent le serait tout autant : une
  // fois au lieu de quatre, c'est tenu. On COMPTE, on ne tranche pas.
  const absent = read([item({ text: "coriandre", force: "less" })]);
  assertEquals(absent.rows[0].verdict, "unverifiable");
  assertEquals(absent.rows[0].reason, "no_baseline");

  // ⚠️ ET MÊME QUAND L'ALIMENT EST LÀ. C'est la moitié qui compte : un
  // « moins » servi une fois n'est pas une violation.
  const present = read([item({ text: "tofu", occasion: "breakfast", force: "less" })]);
  assertEquals(present.rows[0].verdict, "unverifiable");
  assertEquals(present.rows[0].reason, "no_baseline");
  assertEquals(present.counters.checked, 0);
  assertEquals(present.counters.unverifiable_by_reason.no_baseline, 1);
});

Deno.test("⛔ ET « jamais » SE JUGE TOUJOURS — les deux moitiés", () => {
  // Sans ce cas, la garde du dessus serait indiscernable d'un constat qui a
  // cessé de juger quoi que ce soit.
  const out = read([item({ text: "tofu", occasion: "breakfast", force: "never" })]);
  assertEquals(out.rows[0].verdict, "violated");
  assertEquals(out.counters.checked, 1);
});

Deno.test("la ligne rendue PORTE sa force — « moins » et « jamais » se racontent", () => {
  const out = read([
    item({ text: "tofu", occasion: "breakfast", force: "never" }),
    item({ text: "coriandre", force: "less" }),
  ]);
  assertEquals(out.rows.map((r) => `${r.text}:${r.force}`), ["tofu:never", "coriandre:less"]);
});

// ===========================================================================
// ⟳ 2026-09-22 · LOT A — LE VERDICT EXACT, quand les deux côtés ont une clé
// ===========================================================================
//
// ── CE QUE ÇA CHANGE ─────────────────────────────────────────────────────
// Sans identifiant, ce module compare un TEXTE LIBRE à des termes libres avec
// le matcher de la ceinture — qui déplie les catégories, tolère un `s`, et
// cherche des mots dans de la prose. C'est ce qu'on peut faire de mieux sur du
// texte, et ça reste du texte.
//
// Avec, le verdict est une ÉGALITÉ D'IDENTIFIANT. Les plats en portent déjà un
// (`DishIngredient.ref`), posé par le même référentiel.

/** Un plan dont les plats ÉCRIVENT leurs identifiants. */
const PLAN_REF: readonly HonouredDish[] = [
  {
    day: "thu",
    slot: "breakfast",
    title: "Flocons d'avoine et fruits",
    method: "sans cuisson",
    ingredients: [
      { term: "flocons d'avoine", ref: "oats" },
      { term: "pêche", ref: "peach" },
    ],
    uses: [],
    memberIds: [],
  },
];

const readRef = (items: readonly HonouredItem[]) =>
  retainedHonoured({ items, dishes: PLAN_REF, preparationById: new Map() });

Deno.test("⟳ LOT A — DEUX CLÉS ⇒ ÉGALITÉ D'IDENTIFIANT, et le chemin est DIT", () => {
  const out = readRef([item({ text: "flocons d'avoines", ref: "oats" })]);
  assertEquals(out.rows[0].verdict, "violated");
  assertEquals(out.rows[0].via, "ref");
  assertEquals(out.rows[0].matched, "oats");
  assertEquals(out.counters.by_ref, 1);
  assertEquals(out.counters.by_words, 0);
});

Deno.test("⟳ LOT A — LE TEXTE N'EST PLUS CE QUI DÉCIDE", () => {
  // ── LA PREUVE QUE LA CLÉ SERT ────────────────────────────────────────────
  // Le souvenir dit « flocons d'avoines » (pluriel fautif), le plat dit
  // « flocons d'avoine ». Deux textes différents, un seul identifiant. Le
  // matcher par les mots pourrait s'en sortir ici ; il ne s'en sortirait pas
  // avec « muesli » contre « granola », qui est le MÊME aliment.
  const out = readRef([item({ text: "n'importe quoi d'autre", ref: "oats" })]);
  assertEquals(out.rows[0].verdict, "violated");
  assertEquals(out.rows[0].via, "ref");
});

Deno.test("⛔ LOT A — ET L'ÉGALITÉ TRANCHE DANS LES DEUX SENS", () => {
  // Une garde qui rendrait « violé » sur tout ressemblerait à une garde qui
  // marche. Un slug absent du plan doit sortir « honoré », par le même chemin.
  const out = readRef([item({ text: "coriandre", ref: "coriander" })]);
  assertEquals(out.rows[0].verdict, "honoured");
  assertEquals(out.rows[0].via, "ref");
  assertEquals(out.rows[0].dish, null);
});

Deno.test("⛔ LOT A — LE CHEMIN EXACT NE RETOMBE PAS SUR LES MOTS", () => {
  // Un souvenir résolu, jugé sur un plan qui écrit ses identifiants, a une
  // réponse EXACTE : « ce slug n'est pas servi ». Y ajouter une seconde
  // chance par les mots rendrait le verdict dépendant de l'ordre des deux
  // chemins — et le plus permissif gagnerait toujours.
  //
  // Ici le TEXTE (« pêche ») est dans le plat, mais le SLUG (`plum`) n'y est
  // pas. Le verdict doit suivre le slug.
  const out = readRef([item({ text: "pêche", ref: "plum" })]);
  assertEquals(out.rows[0].verdict, "honoured");
  assertEquals(out.rows[0].via, "ref");
});

Deno.test("⛔ LOT A — UN PLAN SANS IDENTIFIANT REPASSE PAR LES MOTS", () => {
  // ⛔ SANS CETTE GARDE, UN FAUX VERT DE MASSE. Un plan dont le modèle n'a
  // écrit aucun `ref` rendrait « honoré » à toutes les exclusions résolues —
  // exactement le faux vert que ce module existe pour retirer.
  const out = read([item({ text: "tofu", occasion: "breakfast", ref: "tofu" })]);
  assertEquals(out.rows[0].via, "words");
  assertEquals(out.rows[0].verdict, "violated");
  assertEquals(out.counters.by_ref, 0);
  assertEquals(out.counters.by_words, 1);
});

Deno.test("⛔ LOT A — UN SOUVENIR SANS CLÉ REPASSE PAR LES MOTS", () => {
  // 4 souvenirs sur 9 ne résolvent pas en base. Le chemin par les mots reste
  // le leur : le retirer ferait passer ces cas de « jugé approximativement » à
  // « pas jugé », un recul déguisé en rigueur.
  const out = readRef([item({ text: "flocons d'avoine", ref: null })]);
  assertEquals(out.rows[0].via, "words");
  assertEquals(out.counters.by_words, 1);
});

Deno.test("PROPRIÉTÉ — `checked === by_ref + by_words`", () => {
  const out = readRef([
    item({ text: "flocons d'avoines", ref: "oats" }),
    item({ text: "coriandre", ref: "coriander" }),
    item({ text: "pêche", ref: null }),
    item({ kind: "portion.adjust", text: "un peu trop" }),
  ]);
  const c = out.counters;
  assertEquals(c.checked, c.by_ref + c.by_words);
  // Les nombres EN DUR: un compteur qui se recalcule depuis la fonction sous
  // test reste vert quand la fonction change d'avis.
  assertEquals(c.by_ref, 2);
  assertEquals(c.by_words, 1);
  assertEquals(c.unverifiable, 1);
});

Deno.test("⟳ LOT A — LA CASSEROLE PORTE AUSSI SON IDENTIFIANT", () => {
  // Cicatrice `preparations-must-be-folded-into-dishes` : en cuisine par lots,
  // la protéine n'est PAS dans le plat. Le chemin exact doit plier comme
  // l'autre, sinon il serait plus rigoureux ET plus aveugle.
  const preps = new Map([["prep_oats", {
    id: "prep_oats",
    title: "Porridge",
    method: "casserole",
    ingredients: [{ term: "flocons d'avoine", ref: "oats" }],
  }]]);
  const out = retainedHonoured({
    items: [item({ text: "avoine", ref: "oats" })],
    dishes: [{
      day: "thu",
      slot: "breakfast",
      title: "Porridge du jeudi",
      method: "",
      ingredients: [{ term: "lait", ref: null }],
      uses: [{ preparationId: "prep_oats" }],
      memberIds: [],
    }],
    preparationById: preps as never,
  });
  assertEquals(out.rows[0].via, "ref");
  assertEquals(out.rows[0].verdict, "violated");
});
