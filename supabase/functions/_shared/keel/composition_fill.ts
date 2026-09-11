/**
 * LOT 18 — L'INGRÉDIENT INCONNU NE CONDAMNE PLUS LA JOURNÉE.
 *
 * Prompt: `scratchpad/2026-08-21-0040-PROMPT-AUTOREMPLISSAGE-REFERENTIEL.md`
 * Migration: `supabase/migrations/20260821030000_le_sas_des_aliments_inconnus.sql`
 * Appel et écriture du sas: `composition_fill_io.ts` (impur, à côté).
 *
 * ── CE QUE CE MODULE FAIT, EN UNE PHRASE ──────────────────────────────────
 * Il transforme une liste de TEXTES que le référentiel n'a pas su lire en
 * lignes de composition utilisables, chacune portant D'OÙ ELLE VIENT.
 *
 * ── UN ALIMENT, UN SLUG, PLUSIEURS NOMS (2026-09-10) ──────────────────────
 * Mesuré sur les 291 lignes du sas: **chaque forme de surface devenait son
 * propre aliment**. `puree d'amandes` (1 vue), `puree d'amande` (6) et
 * `almond butter` (1) = trois lignes, un aliment, et aucune n'atteint jamais le
 * seuil de trois. `yaourt au soja nature` valait 54 kcal/100 g en français et
 * `unsweetened soya yoghurt` 63 en anglais — le même aliment, deux valeurs.
 *
 * L'appel de secours rend donc, en plus de la composition, le nom CANONIQUE de
 * l'aliment et ses deux libellés. Le slug se fait sur le canonique; la forme
 * rencontrée et les libellés deviennent des CLÉS DE PLUS vers la même ligne.
 *
 * ── ⛔ LA RÈGLE NON NÉGOCIABLE, ET ELLE EST STRUCTURELLE ICI ───────────────
 * « IL CRÉE UN ALIMENT NEUF. JAMAIS UN ALIAS VERS UN ALIMENT EXISTANT. »
 *
 * Elle n'a pas bougé, et les formes de surface ne l'entament pas: une clé de
 * `bySlug` désigne l'aliment que CE lot vient de faire naître, jamais une ligne
 * que des humains ont écrite. Les deux gardes qui le tiennent:
 *   · une forme qui résout DÉJÀ vers quelque chose n'est jamais reprise;
 *   · un canonique qui désigne un aliment curé sort en `canonical_is_curated_food`,
 *     c'est-à-dire en file humaine — même quand le modèle a raison.
 *
 * `withFilledRefs` ne touche PAS `byAlias`. Pas une fois, pas dans une branche.
 * Il ajoute des entrées dans `bySlug` sous la clé `terme.replace(/ /g, "_")`,
 * que `resolveIngredient` retrouve par ÉGALITÉ DE SLUG. Deux lignes `yuzu` en
 * double sont inoffensives — elles portent toutes deux des valeurs à peu près
 * justes. Un alias `laitue -> lait` remplace un aliment par un autre, pour tout
 * le monde, définitivement, et **ne ressemble pas à un bug: il ressemble à une
 * donnée**. Le dépôt a mesuré ce mode d'échec à 12 faux positifs sur 12
 * (`never-hand-roll-a-matcher-here`).
 *
 * Et il y a une seconde ceinture, comportementale plutôt que déclarative: une
 * ligne n'est retenue que si `resolveIngredient` la retrouve VRAIMENT sur
 * l'index augmenté, et qu'elle ne masque RIEN sur l'index de base. Un terme
 * ambigu (« butter or olive oil ») échoue ce test et n'est pas rempli — le
 * résolveur refuse l'alternative avant même de chercher, donc l'entrée aurait
 * été morte, et une entrée morte ressemble à une couverture.
 *
 * ── ⛔ CE MODULE N'ESTIME PAS UN GROUPE ───────────────────────────────────
 * `red_meat` va de 81 à 744 kcal/100 g. Prendre la moyenne d'un groupe comme
 * valeur est interdit; BORNER est permis, et c'est la différence entre une
 * valeur qui se présente comme une mesure et une convention qui porte son
 * résidu (`residualKcal`). Toute ligne `group_bounds` déclare le sien.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  type CompositionIndex,
  type CompositionInput,
  type CompositionRef,
  type CompositionSource,
  normalizeTerm,
  type Nutrients,
  nutrientsOf,
  resolveCompositionLine,
  resolveIngredient,
  resolveIngredients,
  type ResolvedIngredient,
  YIELD_CLASSES,
  type YieldClass,
} from "./food_composition.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// ① LA BANDE MESURÉE D'UN GROUPE — calculée, jamais écrite à la main
// ---------------------------------------------------------------------------

/**
 * LES DEUX BORNES, EN CENTILES.
 *
 * ⚠️ p05/p95 ET PAS min/max, et c'est mesuré: `red_meat` porte 288 lignes dont
 * une à 744 kcal/100 g (une poudre). Une bande [min, max] n'exclut plus rien —
 * elle a l'air d'une garde et n'en est pas une. Les mêmes deux nombres sont
 * écrits dans la vue SQL `food_composition_group_bands`, et un test
 * d'intégration compare les deux formules groupe par groupe.
 */
export const BAND_LOW_PCT = 0.05;
export const BAND_HIGH_PCT = 0.95;

/**
 * COMBIEN DE LIGNES IL FAUT POUR QU'UNE BANDE VEUILLE DIRE QUELQUE CHOSE.
 *
 * En dessous, il n'y a pas de bande — il y a une ou deux valeurs, et une bande
 * dont les deux bornes se touchent affirmerait une CERTITUDE que le groupe n'a
 * pas. `olive_oil` (1 ligne) et `water` (1 ligne) tombent ici, et c'est le bon
 * résultat: pas de bande ⇒ pas de repli par bornes ⇒ abstention comptée.
 */
export const GROUP_BAND_MIN_REFS = 3;

/**
 * LE PLAFOND ABSOLU D'UNE DENSITÉ ALIMENTAIRE, indépendant de tout groupe.
 *
 * 900 kcal/100 g est une matière grasse PURE; rien de comestible ne va
 * au-dessus, et le référentiel plafonne à 901. Ce nombre existe pour le cas où
 * le groupe n'a pas de bande: il reste alors une garde, au lieu d'aucune.
 */
export const MAX_PLAUSIBLE_KCAL_PER_100G = 902;

/**
 * LE SEUIL DE DENSITÉ D'UNE LIGNE REMPLIE.
 *
 * ⚠️ IL NE SE DÉRIVE PAS DU RÉFÉRENTIEL, ET C'EST MESURÉ: `energy_dense` y est
 * CURÉ, pas calculé — le maximum des lignes `false` est 433 kcal/100 g et le
 * minimum des `true` est 85,7. Il n'existe aucun seuil qui reproduise la
 * colonne.
 *
 * On SUR-DÉTECTE donc volontairement, et la direction de l'erreur est choisie:
 * un faux positif coûte une ABSTENTION de plus (`unweighedEnergyDense` mord sur
 * un terme dense non pesé); un faux négatif fait disparaître une huile en
 * silence, ce qui est le premier poste de perte d'énergie du produit. C'est la
 * même direction que `DENSE_CLASS_WORDS`, choisie pour la même raison. Le
 * MÊME nombre est écrit dans `promote_pending_food_compositions()`.
 */
export const FILLED_DENSE_KCAL = 250;

/** Ce qu'on sait d'un groupe, une fois le référentiel mesuré. */
export interface GroupBand {
  group: FoodGroupRef;
  /** Combien de lignes HUMAINES ont servi à la calculer. */
  refs: number;
  energyLow: number;
  energyHigh: number;
  proteinLow: number | null;
  proteinHigh: number | null;
  carbsLow: number | null;
  carbsHigh: number | null;
  fatLow: number | null;
  fatHigh: number | null;
  /**
   * LA CLASSE DE RENDEMENT DOMINANTE DU GROUPE.
   *
   * ⚠️ ET ELLE PEUT COÛTER UNE ABSTENTION, exprès. `poultry` est
   * majoritairement `meat_shrinks`: un terme rempli avec cette classe et écrit
   * sans `state` reste NON PESÉ (`gramsRawOf` rend `null` quand l'état compte).
   * Choisir `neutral` partout ferait peser 100 g de poulet cuit comme 100 g de
   * poulet cru — 30 % d'écart, toujours dans le sens qui gonfle. On préfère
   * l'abstention, comme partout ailleurs dans ce module.
   */
  yieldClass: YieldClass;
}

/**
 * `percentile_cont` de PostgreSQL, à l'octet près.
 *
 * Position `f × (n − 1)` dans le tableau TRIÉ, interpolation linéaire entre les
 * deux voisins. Écrit ici parce que la vue SQL ne peut pas entrer dans un
 * module pur — et comparé à elle par un test d'intégration, parce que deux
 * écritures d'une même formule divergent au premier ajustement.
 */
export function percentileCont(sortedAsc: readonly number[], f: number): number {
  const n = sortedAsc.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sortedAsc[0];
  const pos = f * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

function bandOf(values: readonly number[]): [number, number] | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return [
    percentileCont(sorted, BAND_LOW_PCT),
    percentileCont(sorted, BAND_HIGH_PCT),
  ];
}

/**
 * LES BANDES DE TOUS LES GROUPES, depuis l'index déjà chargé.
 *
 * ⛔ LES LIGNES `sas` SONT EXCLUES, et c'est la même exclusion que la vue SQL.
 * Sans elle, chaque promotion élargirait la bande, qui autoriserait la
 * promotion suivante: une boucle qui s'ouvre toute seule et dont personne ne
 * voit le premier cran. La bande reste celle du référentiel HUMAIN.
 *
 * ⚠️ ET LES LIGNES `model` / `group_bounds` AUSSI, mécaniquement: elles ne sont
 * jamais dans l'index de base. Cette fonction doit donc être appelée sur
 * l'index de BASE, avant tout `withFilledRefs` — sans quoi la bande du plan
 * suivant contiendrait les inventions du précédent.
 */
export function groupBandsFrom(
  index: CompositionIndex,
): Map<FoodGroupRef, GroupBand> {
  const byGroup = new Map<FoodGroupRef, CompositionRef[]>();
  for (const ref of index.bySlug.values()) {
    if (ref.source !== "ciqual" && ref.source !== "manual") continue;
    if (!(FOOD_GROUP_REFS as readonly string[]).includes(ref.foodGroupRef)) continue;
    const list = byGroup.get(ref.foodGroupRef) ?? [];
    list.push(ref);
    byGroup.set(ref.foodGroupRef, list);
  }
  const out = new Map<FoodGroupRef, GroupBand>();
  for (const [group, refs] of byGroup) {
    if (refs.length < GROUP_BAND_MIN_REFS) continue;
    const energy = bandOf(refs.map((r) => r.energyKcal));
    if (energy === null) continue;
    const macro = (pick: (r: CompositionRef) => number | null) =>
      bandOf(refs.map(pick).filter((v): v is number => v !== null));
    const protein = macro((r) => r.proteinG);
    const carbs = macro((r) => r.carbsG);
    const fat = macro((r) => r.fatG);
    // La classe dominante, à égalité tranchée par l'ordre de `YIELD_CLASSES` —
    // déterministe, parce qu'un module pur ne tire pas au sort.
    const tally = new Map<YieldClass, number>();
    for (const r of refs) tally.set(r.yieldClass, (tally.get(r.yieldClass) ?? 0) + 1);
    let dominant: YieldClass = "neutral";
    let best = -1;
    for (const cls of YIELD_CLASSES) {
      const n = tally.get(cls) ?? 0;
      if (n > best) {
        best = n;
        dominant = cls;
      }
    }
    out.set(group, {
      group,
      refs: refs.length,
      energyLow: energy[0],
      energyHigh: energy[1],
      proteinLow: protein?.[0] ?? null,
      proteinHigh: protein?.[1] ?? null,
      carbsLow: carbs?.[0] ?? null,
      carbsHigh: carbs?.[1] ?? null,
      fatLow: fat?.[0] ?? null,
      fatHigh: fat?.[1] ?? null,
      yieldClass: dominant,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ② LA WORKLIST — un seul appel par plan, jamais un par ingrédient
// ---------------------------------------------------------------------------

/**
 * LE PLAFOND DE TERMES ENVOYÉS EN UN APPEL.
 *
 * Mesuré sur les 180 plans en base: la MÉDIANE est de 1 terme inconnu unique
 * par plan, le maximum de 12. 24 laisse le double du pire cas observé et borne
 * quand même une entrée qui aurait explosé — un plan à 300 inconnus n'est pas
 * un plan à remplir, c'est un référentiel qui n'a pas chargé.
 *
 * ⚠️ CE QUI EST COUPÉ EST COMPTÉ (`FillResult.refused`, motif `over_cap`).
 * Une troncature silencieuse se lirait « tout a été couvert ».
 */
export const FILL_REQUEST_CAP = 24;

/** Un terme inconnu, tel qu'il part à l'appel de secours. */
export interface FillRequest {
  /** NORMALISÉ (`normalizeTerm`) — la clé du sas, et celle de l'index. */
  term: string;
  /**
   * LE GROUPE DÉCLARÉ PAR LE MODÈLE SUR LA LIGNE D'INGRÉDIENT, quand il l'a
   * écrit (`DishIngredient.group`). `null` est le cas NOMINAL aujourd'hui: la
   * consigne qui demande ce champ ne voyage qu'avec la ligne de régime, donc la
   * population sans régime ne le porte jamais. Mesuré le 2026-08-21 sur la base
   * vivante: **0 ligne sur 6 661**.
   *
   * ⚠️ CE QUE ÇA COÛTE, ÉCRIT ICI: le repli par bornes n'a alors AUCUN groupe à
   * opposer quand l'appel de secours échoue, et il s'abstient. Le compteur
   * `refused.no_group` est là pour que ce silence se voie.
   */
  declaredGroup: FoodGroupRef | null;
  /** Combien de fois ce terme apparaît dans le plan. Pour l'ordre de priorité. */
  occurrences: number;
}

/**
 * LES TERMES QUE CE PLAN NE SAIT PAS LIRE, dédoublonnés.
 *
 * ⚠️ DÉDOUBLONNÉS, ET C'EST CE QUI REND `sightings` HONNÊTE. Le sas compte des
 * PLANS distincts; un terme envoyé trois fois par le même plan le ferait
 * promouvoir sur le tirage d'UN modèle, un seul jour — très exactement ce que
 * la règle des trois existe pour ne pas faire.
 */
export function fillRequestsFor(
  index: CompositionIndex,
  inputs: readonly (CompositionInput & { group?: FoodGroupRef | null })[],
): { requests: FillRequest[]; overCap: string[] } {
  const byTerm = new Map<string, FillRequest>();
  for (const input of inputs) {
    const raw = String(input?.term ?? "").trim();
    if (!raw) continue;
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT A (2026-09-11) — ON NE PAIE PAS UN APPEL POUR UN ALIMENT QU'ON A
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE GASPILLAGE, MESURÉ. Cette ligne testait `resolveIngredient(index,
    // raw)` — le LIBELLÉ seul. Sur le plan GAIN du 2026-09-11, la ligne
    // « pita complète · ref pita_wholemeal » (265 kcal/100 g, `manual`,
    // `verifie`, `unit_grams = 60`) n'a pas d'alias français: le sas a donc
    // inventé une entrée `whole wheat pita bread` à **258 kcal** avec
    // `fill_source: model` — donc `a_verifier`, donc NON composable, donc
    // inutilisable. On a payé un appel modèle pour ré-estimer une valeur qu'on
    // avait déjà, et le résultat était moins bon que l'original.
    //
    // ⛔ ET UN IDENTIFIANT REFUSÉ N'EST PAS UNE WORKLIST NON PLUS. Remplir le
    // libellé d'une ligne dont l'identifiant est inventé ne rendrait pas la
    // ligne valide — `resolveCompositionLine` refuse d'abord sur l'identifiant,
    // et c'est le contrat: « aucun repli silencieux vers le terme ». Seul
    // `term_unknown` est une demande légitime.
    const line = resolveCompositionLine(index, input);
    if (line.refusal !== "term_unknown") continue;
    const term = normalizeTerm(raw);
    if (!term || term.length > 80) continue;
    const existing = byTerm.get(term);
    if (existing) {
      existing.occurrences += 1;
      // ⚠️ LE PREMIER GROUPE DÉCLARÉ GAGNE, et un `null` ne l'écrase jamais.
      // Deux lignes du même plan peuvent déclarer deux groupes différents pour
      // le même texte; laisser la dernière gagner ferait dépendre la bande de
      // l'ordre des plats, ce qu'aucun lecteur ne pourrait relire.
      if (existing.declaredGroup === null && input.group != null) {
        existing.declaredGroup = input.group;
      }
      continue;
    }
    byTerm.set(term, {
      term,
      declaredGroup: input.group ?? null,
      occurrences: 1,
    });
  }
  // Les plus fréquents d'abord: si le plafond mord, il mord sur la queue.
  const all = [...byTerm.values()].sort((a, b) =>
    b.occurrences - a.occurrences || a.term.localeCompare(b.term)
  );
  return {
    requests: all.slice(0, FILL_REQUEST_CAP),
    overCap: all.slice(FILL_REQUEST_CAP).map((r) => r.term),
  };
}

// ---------------------------------------------------------------------------
// ③ LA CONSIGNE DE L'APPEL DE SECOURS
// ---------------------------------------------------------------------------

/**
 * ⛔ ON NE DEMANDE JAMAIS UN TOTAL. Le modèle rend une composition POUR 100 g,
 * ligne par ligne; le moteur additionne. Un total faux a l'air juste et
 * personne ne le recontrôle — c'est l'interdit explicite du prompt du lot, et
 * c'est aussi la garantie n°2 de `meal_generation.ts` (« l'arithmétique du
 * modèle n'est jamais une preuve »).
 *
 * ⚠️ LA PROMESSE ET LA CLÉ DE SCHÉMA SE TOUCHENT, et c'est une cicatrice
 * mesurée deux fois par ce dépôt: un champ dont la promesse vit dans le message
 * utilisateur et dont la clé vit dans le prompt système sort à 0 %. Le nom
 * exact des clés, le nombre attendu et l'échappatoire sont donc écrits ICI,
 * ensemble, et le mot « json » y figure pour le mode JSON du fournisseur.
 */
export const COMPOSITION_FILL_SYSTEM_PROMPT = [
  "You are a food composition table. You are given food names that a nutrition",
  "reference could not match. For each one, return its composition PER 100 g",
  "of the RAW, EDIBLE food.",
  "",
  "Return valid json, and nothing else, with exactly this shape:",
  '{"items":[{"term":"<the input term, copied verbatim>",',
  '           "canonical":"<the plain English name of that same food>",',
  '           "label_fr":"<the plain French name of that same food>",',
  '           "label_en":"<the plain English name of that same food>",',
  '           "food_group_ref":"<one slug from the allowed list>",',
  '           "kcal_100g":<number>,"protein_g":<number>,"carbs_g":<number>,',
  '           "fat_g":<number>,"fiber_g":<number>,',
  '           "yield_class":"neutral|grain_absorbs|legume_absorbs|meat_shrinks|fish_shrinks|veg_shrinks"}]}',
  "",
  "Return one item per input term, in the same order. Never merge two terms.",
  "Never return a total, a sum, or a per-portion figure: per 100 g only.",
  "",
  '"canonical" IS THE NAME OF THE FOOD, NOT OF THE INPUT. Two inputs naming the',
  'same food must get the SAME "canonical": "puree d\'amande", "puree d\'amandes"',
  'and "almond butter" are one food, so all three return "almond butter". Drop',
  "the plural, the brand, the packaging and the cooking method; keep whatever",
  "changes the food itself (smoked, wholemeal, skimmed, unsweetened).",
  "",
  'If a term does not name a single food (an alternative such as "butter or oil",',
  "a brand, a whole dish, an instruction), DROP it from the list rather than",
  "guessing. A missing line costs one abstention; an invented line poisons every",
  "plate computed from it.",
].join("\n");

/** Le message utilisateur: les termes, et le vocabulaire fermé des groupes. */
export function compositionFillUserMessage(
  requests: readonly FillRequest[],
): string {
  const lines = requests.map((r) =>
    r.declaredGroup
      ? `- ${r.term}  (declared group: ${r.declaredGroup})`
      : `- ${r.term}`
  );
  return [
    `${requests.length} food names to describe:`,
    ...lines,
    "",
    "Allowed food_group_ref slugs, and no others:",
    FOOD_GROUP_REFS.join(", "),
  ].join("\n");
}

/** Une ligne de réponse, après lecture et validation de forme. */
export interface FillAnswer {
  term: string;
  /**
   * LE NOM DE L'ALIMENT, ET PAS CELUI DE LA FORME RENCONTRÉE.
   *
   * ⚠️ C'EST LA SEULE CHOSE QUI FASSE S'ADDITIONNER LES VUES. Mesuré le
   * 2026-09-10 sur les 291 lignes du sas: `puree d'amande` (6 vues),
   * `puree d'amandes` (1) et `almond butter` (1) sont TROIS lignes pour UN
   * aliment, et aucune n'atteint jamais le seuil de trois. Le compteur ne
   * s'additionne que si les trois formes se rangent sous une même clé.
   *
   * `null` quand le modèle ne l'a pas écrit: on retombe alors sur la forme
   * rencontrée, c'est-à-dire exactement le comportement d'avant ce lot.
   */
  canonicalTerm: string | null;
  /** Le nom français de cet aliment. `null` s'il ne l'a pas écrit. */
  labelFr: string | null;
  /** Le nom anglais de cet aliment. `null` s'il ne l'a pas écrit. */
  labelEn: string | null;
  foodGroupRef: FoodGroupRef | null;
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  yieldClass: YieldClass | null;
}

function readNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * LA RÉPONSE DU MODÈLE, LUE. Jamais `throw`: une sortie illisible rend `[]`, et
 * le repli par bornes prend la main — c'est la règle 2 du lot, « cet appel ne
 * peut JAMAIS faire tomber le plan », tenue jusque dans le parseur.
 *
 * ⚠️ SEULS LES TERMES DEMANDÉS SONT RETENUS. Un modèle qui invente une ligne
 * pour un aliment qu'on ne lui a pas soumis écrirait un aliment neuf dans le
 * sas sans qu'aucun plan ne l'ait jamais contenu.
 */
export function parseCompositionFillAnswers(
  raw: string,
  requests: readonly FillRequest[],
): FillAnswer[] {
  const asked = new Set(requests.map((r) => r.term));
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch {
    return [];
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: FillAnswer[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const row = item as Record<string, unknown>;
    const term = normalizeTerm(String(row?.term ?? ""));
    if (!asked.has(term) || seen.has(term)) continue;
    const energy = readNumber(row?.kcal_100g);
    if (energy === null) continue;
    const group = String(row?.food_group_ref ?? "");
    const yieldClass = String(row?.yield_class ?? "");
    seen.add(term);
    // ⚠️ NORMALISÉS COMME LE RESTE, et bornés à 80 comme la colonne. Un nom
    // canonique qui ne passe pas `normalizeTerm` ne serait pas la clé sous
    // laquelle le résolveur ira le chercher — l'entrée serait morte, et une
    // entrée morte ressemble à une couverture.
    const readTerm = (v: unknown): string | null => {
      const t = normalizeTerm(String(v ?? ""));
      return t && t.length <= 80 ? t : null;
    };
    out.push({
      term,
      canonicalTerm: readTerm(row?.canonical),
      labelFr: readTerm(row?.label_fr),
      labelEn: readTerm(row?.label_en),
      foodGroupRef: (FOOD_GROUP_REFS as readonly string[]).includes(group)
        ? group as FoodGroupRef
        : null,
      energyKcal: energy,
      proteinG: readNumber(row?.protein_g),
      carbsG: readNumber(row?.carbs_g),
      fatG: readNumber(row?.fat_g),
      fiberG: readNumber(row?.fiber_g),
      yieldClass: (YIELD_CLASSES as readonly string[]).includes(yieldClass)
        ? yieldClass as YieldClass
        : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ④ LE REMPLISSAGE — et le repli qui ne peut pas échouer
// ---------------------------------------------------------------------------

/** Pourquoi un terme n'a pas pu être rempli. Nommé, jamais un silence. */
export const FILL_REFUSALS = Object.freeze(
  [
    /** Au-delà du plafond de l'appel. Compté, jamais tronqué en silence. */
    "over_cap",
    /** Ni le modèle ni la ligne d'ingrédient ne donnent de groupe: pas de bande. */
    "no_group",
    /** Le groupe existe mais porte moins de trois lignes: pas de bande. */
    "no_band",
    /** Le terme se résout DÉJÀ: le remplir masquerait un aliment réel. */
    "already_resolved",
    /**
     * Le résolveur ne retrouverait pas l'entrée qu'on vient d'écrire. C'est le
     * cas des ALTERNATIVES (« butter or olive oil »): `resolveIngredient` refuse
     * l'ambiguïté avant de chercher, donc l'entrée serait morte. Une entrée
     * morte ressemble à une couverture.
     */
    "unreachable",
    /** Valeur au-delà de toute densité alimentaire, groupe ou pas. */
    "implausible",
    /**
     * LE NOM CANONIQUE RENDU PAR LE MODÈLE DÉSIGNE UN ALIMENT DÉJÀ CURÉ.
     *
     * ⛔ C'EST LE CAS `laitue -> lait`, ET IL EST REFUSÉ MÊME QUAND IL A RAISON.
     * Le modèle affirme alors une IDENTITÉ entre un terme inconnu et une ligne
     * que des humains ont écrite: « purée d'amande, c'est `almond_butter` ».
     * L'accepter écrirait une clé vers un aliment réel sur la foi d'un tirage —
     * et un rapprochement faux ne ressemble pas à un bug, il ressemble à une
     * donnée (12 faux positifs sur 12, `never-hand-roll-a-matcher-here`).
     *
     * ⚠️ CE N'EST PAS UNE PERTE, C'EST UNE FILE. Les sept lignes que la
     * promotion refuse aujourd'hui en `alias_exists` sont exactement celles-là,
     * et elles ont été tranchées à la main (`20260824093000`, `20260909140000`).
     * Ce refus les nomme au lieu de les deviner.
     */
    "canonical_is_curated_food",
  ] as const,
);
export type FillRefusal = (typeof FILL_REFUSALS)[number];

/**
 * D'OÙ VIENT UN NOM DE SURFACE.
 *
 * ⚠️ CE CHAMP EXISTE POUR LA REVUE HUMAINE, ET IL SE LIT. `encountered` = un
 * plan a VRAIMENT écrit ce nom · `label_fr`/`label_en` = le modèle l'a proposé
 * en décrivant l'aliment, sans que personne l'ait jamais écrit. Les deux ne se
 * relisent pas avec la même confiance, et la colonne
 * `food_composition_pending_aliases.form_source` porte le même mot.
 */
export const SURFACE_FORM_SOURCES = ["encountered", "label_fr", "label_en"] as const;
export type SurfaceFormSource = (typeof SURFACE_FORM_SOURCES)[number];

export interface SurfaceForm {
  /** Le nom, normalisé par `normalizeTerm`. */
  form: string;
  source: SurfaceFormSource;
}

export interface FilledComposition {
  /** LA FORME RENCONTRÉE dans ce plan-ci. C'est elle qui doit se résoudre. */
  term: string;
  /**
   * LE TERME CANONIQUE — la clé de l'aliment, et la racine du slug.
   *
   * Égal à `term` quand personne ne s'est prononcé (repli par bornes, relecture
   * d'une ligne du sas écrite avant ce lot): un aliment est alors son propre
   * canonique, ce qui est le comportement d'avant.
   */
  canonicalTerm: string;
  /**
   * LES AUTRES NOMS DE CE MÊME ALIMENT, normalisés — la forme rencontrée et les
   * deux libellés, quand ils diffèrent du canonique.
   *
   * ⛔ CE NE SONT PAS DES ALIAS AU SENS DU RÉFÉRENTIEL. `withFilledRefs` les
   * pose dans `bySlug`, jamais dans `byAlias` — la règle 3 du lot reste
   * structurelle. Ce qui part en base part dans une table à part
   * (`food_composition_pending_aliases`), et n'entre dans
   * `food_composition_aliases` qu'à la PROMOTION, c'est-à-dire hors chemin
   * chaud et après trois observations.
   *
   * ⚠️ N'Y ENTRE QUE CE QUI NE RÉSOUT VERS RIEN. Une forme qui désigne déjà un
   * aliment garde son aliment: on n'écrase jamais, on s'abstient.
   */
  forms: SurfaceForm[];
  ref: CompositionRef;
  source: Extract<CompositionSource, "model" | "group_bounds">;
  /**
   * L'INCERTITUDE DE CETTE LIGNE, en kcal/100 g.
   *
   * `0` sur une ligne du modèle acceptée. La DEMI-LARGEUR de la bande sur une
   * ligne `group_bounds` — c'est-à-dire le nombre que « on prend le milieu »
   * coûte, écrit à côté du milieu. Sans lui, un milieu de bande et une mesure
   * se ressemblent parfaitement, ce qui est exactement l'interdit « prendre la
   * moyenne d'un groupe comme valeur ».
   */
  residualKcal: number;
  /** La valeur brute du modèle quand elle a été REFUSÉE. Elle part au sas. */
  rejectedModelKcal: number | null;
  /**
   * POURQUOI CETTE LIGNE PART EN REVUE HUMAINE. `null` sur le chemin nominal.
   *
   * ⚠️ ELLE EST QUAND MÊME REMPLIE, ET C'EST L'ARBITRAGE. Le seul cas
   * aujourd'hui est `canonical_is_curated_food`: le modèle a rendu une
   * composition PLAUSIBLE (elle a passé la bande de son groupe) et, en plus, a
   * affirmé une IDENTITÉ avec un aliment que des humains ont écrit. On garde ce
   * qu'il a mesuré, on jette ce qu'il a rapproché — et la ligne entre au sas en
   * `needs_review`, donc hors de toute promotion automatique.
   */
  reviewReason: FillRefusal | null;
}

export interface FillResult {
  filled: FilledComposition[];
  refused: { term: string; reason: FillRefusal }[];
  /** Un histogramme, jamais une liste nominative. */
  counts: Record<string, number>;
}

function refFor(args: {
  /** LE CANONIQUE: c'est lui qui fait le slug, jamais la forme rencontrée. */
  canonicalTerm: string;
  /** Le libellé lisible. Défaut: le canonique. */
  label?: string | null;
  group: FoodGroupRef;
  yieldClass: YieldClass;
  source: Extract<CompositionSource, "model" | "group_bounds">;
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}): CompositionRef {
  return {
    slug: args.canonicalTerm.replace(/ /g, "_"),
    foodGroupRef: args.group,
    label: (args.label ?? args.canonicalTerm).slice(0, 80),
    source: args.source,
    energyKcal: args.energyKcal,
    proteinG: args.proteinG,
    carbsG: args.carbsG,
    fatG: args.fatG,
    fiberG: args.fiberG,
    // ⛔ AUCUN RENDEMENT PAR ALIMENT. Une fiche remplie par le sas n'a jamais
    // été PESÉE crue puis cuite: le rendement se retrouve donc sur la classe,
    // comme avant ce lot. Y écrire un nombre serait inventer une mesure de
    // masse à côté d'une composition déjà remplie par un modèle.
    yieldFactor: null,
    // ⛔ AUCUN DRAPEAU DE MICRONUTRIMENT. « source de fer » est un seuil
    // réglementaire appliqué à une teneur MESURÉE; un modèle qui coche la case
    // ferait couvrir un trou de fer par un aliment que personne n'a dosé, et le
    // moteur de couverture le croirait.
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: args.yieldClass,
    // 1,0 = le NEUTRE de la décote. Une décote inventée retirerait de l'énergie
    // à un aliment sur la foi de rien.
    atwaterDiscount: 1.0,
    energyDense: args.energyKcal >= FILLED_DENSE_KCAL,
    // ⛔ NI POIDS D'UNITÉ NI MASSE DE CONDIMENT — les deux font PESER quelque
    // chose que personne n'a mesuré. `unitGrams` convertirait « 2 unités » en
    // grammes; `condimentGrams` ferait entrer dans les sommes un terme sans
    // quantité. Une ligne remplie a le droit de porter une composition; elle
    // n'a pas le droit de porter une portion.
    unitGrams: null,
    condimentGrams: null,
  };
}

/**
 * LES NOMS SOUS LESQUELS CE MÊME ALIMENT DOIT SE LAISSER TROUVER.
 *
 * La forme rencontrée, plus les deux libellés du modèle. Dédoublonnés, privés
 * du canonique (qui est déjà la clé) — et privés de tout ce qui DÉSIGNE DÉJÀ
 * quelque chose.
 *
 * ⛔ LA DERNIÈRE CONDITION EST LA GARDE, ET ELLE INTERROGE LE VRAI RÉSOLVEUR.
 * `resolveIngredient(base, form) !== null` veut dire « ce nom a déjà un
 * aliment »: le reprendre en masquerait un que des humains ont écrit. On ne le
 * corrige pas, on ne le compare pas, on ne le rapproche pas — on le laisse.
 * Aucune distance, aucun préfixe, aucune ressemblance: `never-hand-roll-a-matcher-here`.
 */
function surfaceFormsFor(
  base: CompositionIndex,
  encountered: string,
  canonicalTerm: string,
  answer: FillAnswer | null,
): SurfaceForm[] {
  const out: SurfaceForm[] = [];
  const candidates: [string, SurfaceFormSource][] = [
    [encountered, "encountered"],
    [answer?.labelFr ?? "", "label_fr"],
    [answer?.labelEn ?? "", "label_en"],
  ];
  for (const [raw, source] of candidates) {
    const form = normalizeTerm(String(raw ?? ""));
    if (!form || form.length > 80) continue;
    if (form === canonicalTerm || out.some((f) => f.form === form)) continue;
    if (resolveIngredient(base, form) !== null) continue;
    out.push({ form, source });
  }
  return out;
}

function withinBand(v: number | null, lo: number | null, hi: number | null): boolean {
  if (v === null || lo === null || hi === null) return true;
  return v >= lo && v <= hi;
}

/**
 * LES LIGNES DE COMPOSITION D'UN PLAN, à partir des réponses et des bandes.
 *
 * ── L'ÉCHELLE D'ACCEPTATION, DANS CET ORDRE ───────────────────────────────
 *   1. le modèle a répondu, la valeur est plausible et tient dans la bande
 *      (ou le groupe n'a pas de bande)          -> `model`, résidu 0
 *   2. le modèle a répondu HORS BANDE            -> milieu de bande,
 *      `group_bounds`, résidu = demi-largeur, valeur brute gardée pour le sas
 *   3. le modèle n'a pas répondu du tout         -> milieu de bande du groupe
 *      DÉCLARÉ sur la ligne d'ingrédient, `group_bounds`
 *   4. rien de tout ça                           -> REFUS nommé, abstention
 *
 * ⚠️ 4 N'EST PAS UN ÉCHEC DU LOT, c'est sa limite honnête: sans groupe, il n'y
 * a aucune bande à opposer, et remplir avec « la moyenne du référentiel »
 * serait la valeur inventée que ce module existe pour ne pas écrire.
 */
export function fillCompositions(args: {
  index: CompositionIndex;
  requests: readonly FillRequest[];
  answers: readonly FillAnswer[];
  bands: ReadonlyMap<FoodGroupRef, GroupBand>;
  overCap?: readonly string[];
}): FillResult {
  const byTerm = new Map(args.answers.map((a) => [a.term, a]));
  const filled: FilledComposition[] = [];
  const refused: { term: string; reason: FillRefusal }[] = [];
  /** Les termes REMPLIS mais mis en revue humaine. Comptés, jamais silencieux. */
  const review: string[] = [];
  for (const term of args.overCap ?? []) refused.push({ term, reason: "over_cap" });

  for (const req of args.requests) {
    const answer = byTerm.get(req.term) ?? null;
    const group = answer?.foodGroupRef ?? req.declaredGroup ?? null;
    if (group === null) {
      refused.push({ term: req.term, reason: "no_group" });
      continue;
    }
    const band = args.bands.get(group) ?? null;

    if (answer !== null && answer.energyKcal > MAX_PLAUSIBLE_KCAL_PER_100G) {
      // Au-delà de la matière grasse pure. Aucune bande n'a besoin d'exister
      // pour refuser ça, et le milieu d'une bande ne « répare » pas une réponse
      // qui prouve que le modèle a répondu à une autre question.
      if (band === null) {
        refused.push({ term: req.term, reason: "implausible" });
        continue;
      }
    }

    const inBand = answer !== null && band !== null &&
      answer.energyKcal >= band.energyLow && answer.energyKcal <= band.energyHigh &&
      withinBand(answer.proteinG, band.proteinLow, band.proteinHigh) &&
      withinBand(answer.carbsG, band.carbsLow, band.carbsHigh) &&
      withinBand(answer.fatG, band.fatLow, band.fatHigh);

    // ① le modèle, accepté
    if (
      answer !== null && answer.energyKcal <= MAX_PLAUSIBLE_KCAL_PER_100G &&
      (band === null || inBand)
    ) {
      // ⛔ LE CANONIQUE NE DÉSIGNE JAMAIS UN ALIMENT QUE LE RÉFÉRENTIEL PORTE
      // DÉJÀ. C'est le cas `laitue -> lait`, et il est écarté même quand le
      // modèle a raison — on ne saurait pas faire la différence.
      //
      // ⚠️ LA LIGNE N'EST PAS PERDUE POUR AUTANT: elle est remplie sous SON
      // PROPRE nom, sans aucune forme, et part au sas en `needs_review`. Le
      // plan en cours est pesé, aucun aliment réel n'est touché, rien ne peut
      // être promu automatiquement, et un humain voit la file. C'est très
      // exactement ce qui s'est passé pour les sept lignes tranchées à la main
      // en 20260824093000 et 20260909140000.
      const claimed = answer.canonicalTerm ?? req.term;
      const stolen = claimed !== req.term &&
        resolveIngredient(args.index, claimed) !== null;
      const canonicalTerm = stolen ? req.term : claimed;
      if (stolen) review.push(req.term);
      filled.push({
        term: req.term,
        canonicalTerm,
        forms: stolen
          ? []
          : surfaceFormsFor(args.index, req.term, canonicalTerm, answer),
        reviewReason: stolen ? "canonical_is_curated_food" : null,
        ref: refFor({
          canonicalTerm,
          label: stolen ? req.term : (answer.labelEn ?? canonicalTerm),
          group,
          yieldClass: answer.yieldClass ?? band?.yieldClass ?? "neutral",
          source: "model",
          energyKcal: answer.energyKcal,
          proteinG: answer.proteinG,
          carbsG: answer.carbsG,
          fatG: answer.fatG,
          fiberG: answer.fiberG,
        }),
        source: "model",
        residualKcal: 0,
        rejectedModelKcal: null,
      });
      continue;
    }

    // ②③ le repli par bornes — le seul chemin qui ne peut pas échouer, et il
    // demande une bande. Pas de bande ⇒ abstention comptée, jamais un nombre.
    if (band === null) {
      refused.push({ term: req.term, reason: "no_band" });
      continue;
    }
    const mid = (band.energyLow + band.energyHigh) / 2;
    filled.push({
      term: req.term,
      // ⛔ UN MILIEU DE BANDE N'AFFIRME AUCUN NOM. Le modèle ne s'est pas
      // prononcé sur cet aliment (ou sa valeur a été refusée): son canonique
      // est donc la forme rencontrée, et la ligne ne fabrique AUCUNE forme.
      // Écrire des alias depuis une convention les ferait voyager sans le
      // résidu qui dit ce qu'elle coûte — l'interdit central de ce module.
      canonicalTerm: req.term,
      forms: [],
      reviewReason: null,
      ref: refFor({
        canonicalTerm: req.term,
        group,
        yieldClass: band.yieldClass,
        source: "group_bounds",
        energyKcal: Math.round(mid * 10) / 10,
        // ⛔ AUCUNE MACRO. Le milieu d'une bande d'ÉNERGIE est déjà une
        // convention; en dériver quatre autres ferait quatre conventions dont
        // aucune ne se recoupe (protéines + glucides + lipides d'un milieu de
        // bande ne rendent pas ce milieu). `null` est ce que ce référentiel
        // utilise pour dire « la source ne donne pas la valeur », et il se
        // propage jusqu'au verdict.
        proteinG: null,
        carbsG: null,
        fatG: null,
        fiberG: null,
      }),
      source: "group_bounds",
      residualKcal: Math.round(((band.energyHigh - band.energyLow) / 2) * 10) / 10,
      rejectedModelKcal: answer?.energyKcal ?? null,
    });
  }

  const counts: Record<string, number> = {
    requested: args.requests.length,
    answered: args.answers.length,
    model: filled.filter((f) => f.source === "model").length,
    group_bounds: filled.filter((f) => f.source === "group_bounds").length,
  };
  for (const reason of FILL_REFUSALS) counts[reason] = 0;
  for (const r of refused) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
  // ⚠️ COMPTÉ COMME UN REFUS, PARCE QUE C'EN EST UN: ce qui a été refusé, c'est
  // le RAPPROCHEMENT, pas la composition. Le nombre à regarder est celui-là —
  // s'il monte, c'est qu'il y a une file d'alias à écrire à la main.
  counts.canonical_is_curated_food = (counts.canonical_is_curated_food ?? 0) + review.length;
  return { filled, refused, counts };
}

// ---------------------------------------------------------------------------
// ⑤ L'INDEX AUGMENTÉ — un aliment neuf, jamais un alias
// ---------------------------------------------------------------------------

/**
 * L'INDEX, PLUS LES ALIMENTS QUE CE PLAN A FAIT NAÎTRE.
 *
 * ⛔ `byAlias` N'EST PAS TOUCHÉ. C'est la règle 3 du lot, et elle est ici
 * structurelle: la seule écriture est un `bySlug.set`. Précédent exact dans ce
 * dépôt: `augmentedIndexFor` (`fixed_intakes.ts`), qui écrit noir sur blanc
 * pourquoi un alias donnerait au libellé de quelqu'un le pouvoir de capturer un
 * terme de recette.
 *
 * ── LES DEUX CEINTURES, ET LA SECONDE EST COMPORTEMENTALE ─────────────────
 *   · le terme ne doit RIEN résoudre sur l'index de base — sinon on masque un
 *     aliment réel;
 *   · `resolveIngredient` doit RETROUVER la ligne sur l'index augmenté — sinon
 *     l'entrée est morte, et une entrée morte ressemble à une couverture.
 *
 * La seconde attrape les alternatives (« butter or olive oil ») sans qu'aucun
 * matcher ne soit réécrit ici: on interroge le VRAI résolveur, on ne devine pas
 * ce qu'il ferait.
 */
export function withFilledRefs(
  base: CompositionIndex,
  filled: readonly FilledComposition[],
): { index: CompositionIndex; kept: FilledComposition[]; refused: { term: string; reason: FillRefusal }[] } {
  const refused: { term: string; reason: FillRefusal }[] = [];
  const kept: FilledComposition[] = [];
  if (filled.length === 0) return { index: base, kept, refused };

  const bySlug = new Map(base.bySlug);
  // Les clés que CET appel a posées, par ligne — pour pouvoir toutes les
  // retirer si la ceinture comportementale rejette la ligne plus bas. Une
  // ligne à demi retirée laisserait une clé qui pointe vers un aliment que
  // plus rien ne cite.
  const keysOf = new Map<FilledComposition, string[]>();

  for (const f of filled) {
    // ── LA CEINTURE D'ENTRÉE, SUR LES DEUX NOMS ──────────────────────────
    // La forme rencontrée ET le canonique. Le second est nouveau: sans lui, un
    // canonique qui désigne un aliment réel entrerait par la porte de derrière
    // — `fillCompositions` le refuse déjà, et cette ligne est la ceinture qui
    // tient si un appelant construit sa liste autrement (la relecture du sas).
    if (
      resolveIngredient(base, f.term) !== null ||
      resolveIngredient(base, f.canonicalTerm) !== null ||
      base.bySlug.has(f.ref.slug)
    ) {
      refused.push({ term: f.term, reason: "already_resolved" });
      continue;
    }
    const keys: string[] = [];
    // ⚠️ LE PREMIER ARRIVÉ POSE LA VALEUR. Deux formes du même aliment dans un
    // même plan (« puree d'amande » et « puree d'amandes ») rendent le MÊME
    // canonique: la seconde ne réécrit pas la ligne — elle ajoute sa clé, et
    // les deux termes pèsent avec la même valeur, ce qui est le point du lot.
    const ref = bySlug.get(f.ref.slug) ?? f.ref;
    if (!bySlug.has(f.ref.slug)) {
      bySlug.set(f.ref.slug, ref);
      keys.push(f.ref.slug);
    }
    // ── LES FORMES DE SURFACE: D'AUTRES CLÉS, LE MÊME OBJET ──────────────
    //
    // ⛔ `byAlias` N'EST TOUJOURS PAS TOUCHÉ, et c'est ce qui garde la règle 3
    // STRUCTURELLE plutôt que surveillée. Une clé de `bySlug` est une ÉGALITÉ
    // de slug — `resolveIngredient` la retrouve par `form.replace(/ /g, "_")`,
    // sans passer par la table des alias curés, et `resolveAlternative` ne la
    // consulte pas (son en-tête dit pourquoi). Un alias, lui, se propagerait à
    // travers les réductions et les alternatives.
    //
    // ⚠️ LA FORME RENCONTRÉE EST POSÉE MÊME QUAND `forms` EST VIDE, et c'est ce
    // qui rend la RELECTURE du sas utilisable: une ligne relue porte le
    // canonique de la file (`almond butter`) et le nom que CE plan écrit
    // (`puree d'amande`). Sans cette clé-là, la ligne serait installée sous un
    // nom que le plan ne cite pas — la ceinture comportementale la déclarerait
    // `unreachable`, et le sas rendrait une valeur que personne n'atteint.
    const put = (form: string): boolean => {
      const slug = form.replace(/ /g, "_");
      if (slug === f.ref.slug) return true;
      // ⛔ RIEN NE SE FAIT ÉCRASER. Ni une ligne du référentiel, ni une clé
      // qu'une autre ligne de ce même appel a déjà posée.
      if (base.bySlug.has(slug) || resolveIngredient(base, form) !== null) return false;
      const held = bySlug.get(slug);
      if (held !== undefined && held !== ref) return false;
      if (held === undefined) {
        bySlug.set(slug, ref);
        keys.push(slug);
      }
      return true;
    };
    put(f.term);
    const installed = f.forms.filter((sf) => put(sf.form));
    const line = installed.length === f.forms.length ? f : { ...f, forms: installed };
    keysOf.set(line, keys);
    kept.push(line);
  }
  // `byAlias` INTOUCHÉ — voir l'en-tête.
  const index: CompositionIndex = { bySlug, byAlias: base.byAlias };

  // La ceinture comportementale: on RETIRE ce que le résolveur ne retrouve pas.
  const dead = kept.filter((f) => resolveIngredient(index, f.term)?.slug !== f.ref.slug);
  if (dead.length === 0) return { index, kept, refused };
  for (const f of dead) {
    for (const key of keysOf.get(f) ?? []) bySlug.delete(key);
    refused.push({ term: f.term, reason: "unreachable" });
  }
  const alive = kept.filter((f) => !dead.includes(f));
  return {
    index: { bySlug, byAlias: base.byAlias },
    kept: alive,
    refused,
  };
}

// ---------------------------------------------------------------------------
// ⑥ LES QUATRE COMPTEURS
// ---------------------------------------------------------------------------

/**
 * LES QUATRE SEAUX D'ÉNERGIE D'UN PLAN.
 *
 * ⚠️ `group_bounds` EST UN SEAU À PART, et c'est le chiffre qui dit si le lot a
 * échoué: il ne monte que quand l'appel de secours ne répond plus ou répond
 * n'importe quoi. Fondu dans `model`, il ferait passer un point de rupture pour
 * un fonctionnement.
 */
export const ENERGY_SOURCE_BUCKETS = ["table", "promoted", "model", "group_bounds"] as const;
export type EnergySourceBucket = (typeof ENERGY_SOURCE_BUCKETS)[number];

export function bucketOf(source: CompositionSource): EnergySourceBucket {
  if (source === "sas") return "promoted";
  if (source === "model") return "model";
  if (source === "group_bounds") return "group_bounds";
  return "table";
}

export interface EnergySourceShares {
  /** L'énergie TOTALE sur laquelle les parts sont calculées, en kcal. */
  kcal: number;
  /** Quatre fractions de 0 à 1. Leur somme vaut 1 dès que `kcal > 0`. */
  table: number;
  promoted: number;
  model: number;
  group_bounds: number;
}

/**
 * D'OÙ VIENT L'ÉNERGIE DE CE PLAN, en quatre parts.
 *
 * ⚠️ L'HUILE DE FRITURE N'Y EST PAS, exprès. `nutrientsOf` peut imputer 12 % du
 * poids cuit à une friture; cette énergie-là n'appartient à AUCUNE source —
 * c'est une convention du moteur. L'ajouter à un seau la ferait compter quatre
 * fois (une par sous-somme) et gonflerait le total au-dessus de celui que
 * l'écran affiche.
 *
 * ⚠️ ET LA SOMME EST FAITE PAR `nutrientsOf`, jamais réécrite ici. Une seconde
 * écriture de `kcal × grammes / 100 × décote` divergerait de celle qui rend le
 * chiffre affiché, et c'est celle qu'on relit le moins qui garderait
 * l'ancienne.
 */
export function energySourceShares(
  resolved: readonly ResolvedIngredient[],
): EnergySourceShares {
  const sum = (subset: readonly ResolvedIngredient[]) => {
    if (subset.length === 0) return 0;
    const n = nutrientsOf(subset, { friedMethod: false });
    return n === "unknown" ? 0 : (n as Nutrients).energyKcal;
  };
  const per: Record<EnergySourceBucket, number> = {
    table: 0,
    promoted: 0,
    model: 0,
    group_bounds: 0,
  };
  for (const bucket of ENERGY_SOURCE_BUCKETS) {
    per[bucket] = sum(resolved.filter((r) => bucketOf(r.ref.source) === bucket));
  }
  const total = per.table + per.promoted + per.model + per.group_bounds;
  const share = (v: number) => total <= 0 ? 0 : Math.round((v / total) * 1000) / 1000;
  return {
    kcal: Math.round(total),
    table: share(per.table),
    promoted: share(per.promoted),
    model: share(per.model),
    group_bounds: share(per.group_bounds),
  };
}

/**
 * LE COMPTEUR ④ — combien de termes DISTINCTS ce plan n'a pas su lire.
 *
 * ⛔ MESURÉ SUR L'INDEX DE **BASE**, avant tout remplissage. Le mesurer après
 * rendrait zéro à chaque plan, c'est-à-dire un lot qui se déclare réussi par
 * construction. C'est le seul chiffre qui dise si la table se remplit: il doit
 * BAISSER semaine après semaine.
 */
export function unknownTermCount(
  baseIndex: CompositionIndex,
  inputs: readonly CompositionInput[],
): number {
  return new Set(resolveIngredients(baseIndex, inputs).unresolvedTerms).size;
}

// ---------------------------------------------------------------------------
// ⑦ LA PROMOTION — la règle, écrite une fois de plus qu'en SQL et pour cause
// ---------------------------------------------------------------------------

/** Vu dans au moins trois PLANS distincts. Le SQL porte le même nombre. */
export const PROMOTION_MIN_SIGHTINGS = 3;

export const PROMOTION_OUTCOMES = ["promote", "wait", "review", "skip"] as const;
export type PromotionOutcome = (typeof PROMOTION_OUTCOMES)[number];

/**
 * CETTE LIGNE DU SAS PEUT-ELLE ENTRER DANS LE RÉFÉRENTIEL ?
 *
 * ⚠️ CETTE FONCTION N'EST APPELÉE PAR AUCUN CHEMIN CHAUD. La promotion réelle
 * est faite par `promote_pending_food_compositions()`, en SQL, hors génération —
 * « écrire directement dans `food_composition_refs` depuis le chemin chaud »
 * est l'interdit explicite du lot. Celle-ci est la SPÉCIFICATION exécutable de
 * la même règle: elle est testée cas par cas là où le SQL ne l'est qu'en
 * intégration, et un test compare les deux verdicts sur les lignes réelles du
 * sas.
 */
export function promotionVerdict(args: {
  sightings: number;
  fillSource: "model" | "group_bounds";
  group: FoodGroupRef | null;
  energyKcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  band: GroupBand | null;
  slugTaken: boolean;
  aliasExists: boolean;
}): { outcome: PromotionOutcome; reason: string | null } {
  // ⛔ UN MILIEU DE BANDE NE DEVIENT JAMAIS UNE MESURE. Le promouvoir figerait
  // une convention dans le référentiel sous les traits d'une valeur, et la
  // bande du groupe s'élargirait ensuite autour d'elle.
  if (args.fillSource !== "model") {
    return { outcome: "skip", reason: "group_bounds_never_promoted" };
  }
  if (args.sightings < PROMOTION_MIN_SIGHTINGS) {
    return { outcome: "wait", reason: null };
  }
  // Les deux refus qui protègent un aliment RÉEL d'être remplacé.
  if (args.slugTaken) return { outcome: "review", reason: "slug_taken" };
  if (args.aliasExists) return { outcome: "review", reason: "alias_exists" };
  if (args.group === null || args.band === null || args.band.refs < GROUP_BAND_MIN_REFS) {
    return { outcome: "review", reason: "no_band" };
  }
  const b = args.band;
  if (args.energyKcal < b.energyLow || args.energyKcal > b.energyHigh) {
    return { outcome: "review", reason: "energy_out_of_band" };
  }
  if (!withinBand(args.proteinG, b.proteinLow, b.proteinHigh)) {
    return { outcome: "review", reason: "protein_out_of_band" };
  }
  if (!withinBand(args.carbsG, b.carbsLow, b.carbsHigh)) {
    return { outcome: "review", reason: "carbs_out_of_band" };
  }
  if (!withinBand(args.fatG, b.fatLow, b.fatHigh)) {
    return { outcome: "review", reason: "fat_out_of_band" };
  }
  return { outcome: "promote", reason: null };
}

// ---------------------------------------------------------------------------
// ⑧ LA RELECTURE — le même plan doit rendre le même nombre
// ---------------------------------------------------------------------------

/**
 * UNE LIGNE DU SAS, RELUE COMME LA LIGNE REMPLIE QU'ELLE ÉTAIT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE DÉFAUT QUE CETTE FONCTION RÉPARE, MESURÉ LE 2026-09-09
 * ══════════════════════════════════════════════════════════════════════════
 * Un plan était COMPOSÉ sur l'index augmenté et RELU sur l'index nu. Mesuré
 * sur le plan `4d78e95c` (compte réel, 2026-09-08): `emmental râpé` rempli à
 * 353 kcal/100 g à la génération — `composition_energy_sources.model = 0,013` —
 * et `unknown_ingredient` à chaque affichage, parce que `loadCompositionIndex`
 * ne lit que `food_composition_refs` et `food_composition_aliases`. Le travail
 * de réparation était refait à chaque plan et jeté à chaque lecture: **79 plans
 * sur 116** portaient au moins un terme inconnu sur les 14 jours précédents.
 *
 * ⚠️ CE N'EST PAS UNE PROMOTION, ET LA DIFFÉRENCE EST TOUT LE SUJET.
 * `composition_fill_io.ts` écrit noir sur blanc « AUCUNE VALEUR N'EST REPRISE
 * DU SAS » — parce que reprendre la valeur d'une ligne vue une fois pour un
 * plan qui ne l'a jamais rencontrée, c'est promouvoir sans les trois
 * observations. Cette relecture-ci est bornée par les TERMES DU PLAN QU'ON
 * RELIT: la valeur ne va nulle part où elle n'a pas déjà servi. Elle ne se
 * répand pas, elle cesse d'être oubliée.
 *
 * ⛔ `model` SEULEMENT, JAMAIS `group_bounds`. Un milieu de bande est une
 * convention posée pour LE plan qui l'a posée, et `residualKcal` est le nombre
 * qui dit ce qu'elle coûte. La relire ailleurs ferait voyager une convention
 * sans son résidu, c'est-à-dire une convention déguisée en mesure — l'interdit
 * central de ce module.
 *
 * ⛔ AUCUN ALIAS, ET AUCUNE COMPARAISON AUTRE QUE `=`. La ligne repart par
 * `withFilledRefs`, qui ne fait qu'un `bySlug.set` et rejoue ses deux
 * ceintures. Rien n'est comparé par préfixe ni par distance:
 * `never-hand-roll-a-matcher-here`, 12 faux positifs sur 12.
 *
 * Rend `null` sur toute ligne qu'on ne comprend pas — une ligne jetée coûte une
 * abstention, exactement celle d'aujourd'hui.
 *
 * PURE: aucune I/O.
 */
export function filledFromPendingRow(
  row: unknown,
  /**
   * LA FORME QUI A MATCHÉ CETTE LIGNE, quand ce n'est pas son terme même.
   *
   * ⚠️ ELLE VIENT DU PLAN QU'ON RELIT, jamais d'une comparaison: la vue
   * `food_composition_pending_by_form` la rend, et la jointure y est une
   * ÉGALITÉ. Omise, la ligne est sa propre forme — c'est-à-dire exactement le
   * comportement d'avant les formes de surface.
   */
  form?: string,
): FilledComposition | null {
  const r = row as Record<string, unknown> | null;
  if (!r) return null;
  const canonicalTerm = normalizeTerm(String(r.term ?? ""));
  if (!canonicalTerm || canonicalTerm.length > 80) return null;
  const asked = normalizeTerm(String(form ?? ""));
  const term = asked && asked.length <= 80 ? asked : canonicalTerm;
  // ⛔ `model` seulement. Voir l'en-tête.
  if (String(r.fill_source ?? "") !== "model") return null;
  const group = String(r.food_group_ref ?? "");
  if (!(FOOD_GROUP_REFS as readonly string[]).includes(group)) return null;
  const yieldClass = String(r.yield_class ?? "");
  if (!(YIELD_CLASSES as readonly string[]).includes(yieldClass)) return null;
  const energyKcal = Number(r.energy_kcal);
  if (!Number.isFinite(energyKcal) || energyKcal < 0) return null;
  // La MÊME garde absolue qu'à l'aller. Une ligne du sas écrite avant qu'elle
  // existe ne doit pas entrer par la porte de derrière.
  if (energyKcal > MAX_PLAUSIBLE_KCAL_PER_100G) return null;
  const macro = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const label = String(r.label ?? "").trim();
  return {
    term,
    canonicalTerm,
    // ⛔ AUCUNE FORME NEUVE. Le lien forme -> terme existe DÉJÀ en base — c'est
    // lui qui a rendu cette ligne. Le réécrire ne créerait rien et ferait
    // remonter un compteur d'écriture sur une lecture.
    forms: [],
    // Une relecture ne met rien en revue: la ligne relue a déjà son statut.
    reviewReason: null,
    // ⛔ `refFor` ET PAS UNE SECONDE ÉCRITURE. Les drapeaux de micronutriment à
    // `false`, la décote à 1,0, `unitGrams`/`condimentGrams` à `null`: une
    // seconde copie de ces choix divergerait, et c'est celle qu'on relit le
    // moins qui garderait l'ancienne.
    ref: refFor({
      canonicalTerm,
      label: label || canonicalTerm,
      group: group as FoodGroupRef,
      yieldClass: yieldClass as YieldClass,
      source: "model",
      energyKcal,
      proteinG: macro(r.protein_g),
      carbsG: macro(r.carbs_g),
      fatG: macro(r.fat_g),
      fiberG: macro(r.fiber_g),
    }),
    source: "model",
    // ⛔ ZÉRO, et ce n'est pas un défaut de renseignement: une ligne `model`
    // acceptée porte un résidu de 0 à l'aller aussi (§ l'échelle d'acceptation,
    // cas 1). Le seul résidu non nul appartient à `group_bounds`, qui ne passe
    // jamais par ici.
    residualKcal: 0,
    rejectedModelKcal: null,
  };
}
