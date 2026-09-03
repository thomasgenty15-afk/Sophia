/**
 * FF-040 — LA BOUCLE DE CORRECTION : les nombres dedans, les mots dehors.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-040-la-boucle-de-correction.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §2.5.
 *
 * ── CE QUE CE MODULE TRADUIT ─────────────────────────────────────────────
 * Un verdict (FF-039), qui est un mot dans une liste fermée, devient un JETON,
 * qui est une phrase anglaise dans une liste fermée. Aucun nombre ne franchit
 * cette frontière — ni l'énergie, ni la macro, ni l'écart, ni le pourcentage.
 * Le calcul reste à l'intérieur du produit; le prompt ne reçoit que des mots.
 *
 * ── ET SURTOUT: PAS N'IMPORTE QUELS MOTS ─────────────────────────────────
 * `findNumericTarget` mord sur les chiffres. Il ne mord PAS sur « déficit ». Or
 * un accent qui parle la langue du régime est exactement ce que le modèle
 * échoe dans les `why` que l'élève lit — c'est le défaut fatal que la revue TCA
 * a relevé sur un des designs candidats, dont la formule était « a modest,
 * livable deficit ». La direction d'énergie s'exprime donc en GÉNÉROSITÉ et en
 * MODÉRATION de portions, jamais dans la langue du régime, et
 * `DIET_REGISTER_LEXICON` (`nutrition_lexicon.ts`) est passé sur cette table
 * par un test.
 *
 * ── LE MAPPING EST EXHAUSTIF À LA COMPILATION ────────────────────────────
 * Patron `dishCapFor` (`meal_generation.ts`): un `switch` sans `default`. Un
 * verdict nouveau sans jeton ne compile pas, là où un `if/else` lui donnerait
 * silencieusement le comportement du voisin.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { CompositionVerdict } from "./meal_verdict.ts";
import type { Envelope } from "./meal_envelope.ts";
import type { FoodGroupRef } from "./tokens.ts";
import { normalizeTerm } from "./food_composition.ts";

// ---------------------------------------------------------------------------
// LES JETONS — liste FERMÉE
// ---------------------------------------------------------------------------

export const CORRECTION_TOKENS = [
  "raise_protein_component",
  "lower_added_fat",
  "lower_density",
  "raise_energy",
  "lower_energy",
  "place_missing_sentinel",
] as const;
export type CorrectionToken = (typeof CORRECTION_TOKENS)[number];

/**
 * LA PHRASE DE CHAQUE JETON, telle qu'elle part au modèle.
 *
 * ── CE QU'AUCUNE DE CES PHRASES NE CONTIENT ──────────────────────────────
 * Un chiffre. Un nom de macronutriment quantifié. Un mot du registre du
 * régime. Les trois sont vérifiés par un test qui tourne sur CETTE TABLE — pas
 * sur une liste tenue à la main à côté, qui laisserait passer le prochain jeton
 * ajouté.
 *
 * ── POURQUOI « GÉNÉREUX » ET « MODÉRÉ » PLUTÔT QUE « PLUS » ET « MOINS » ─
 * « Eat more » et « eat less » sont la langue du régime sans en avoir les mots:
 * ils désignent une quantité à viser. « Des portions généreuses » et « les
 * légumes portent le volume » désignent une FAÇON DE COMPOSER, ce qui est la
 * seule chose que le générateur sache faire et la seule qu'on ait le droit de
 * lui demander.
 */
export const CORRECTION_PHRASES: Record<CorrectionToken, string> = {
  raise_protein_component: "give each main meal a full protein food as its anchor",
  lower_added_fat: "cook with less added fat; move richness to whole foods",
  lower_density: "add a voluminous vegetable component to each main meal",
  raise_energy: "make portions more generous, especially starch and added fats",
  lower_energy: "keep portions moderate; vegetables carry the volume",
  // Le seul jeton paramétré, et son paramètre est un LIBELLÉ DE GROUPE — un
  // aliment, jamais un nutriment. « include an oily fish once this week », pas
  // « il te manque des oméga-3 ».
  place_missing_sentinel: "include <group> once this week",
};

/**
 * LE LIBELLÉ D'UN GROUPE, en anglais lisible et EN ALIMENT.
 *
 * ⚠️ C'est ici que se joue la frontière du jeton `place_missing_sentinel`: le
 * modèle reçoit « an oily fish », jamais « omega-3 ». Un nom de nutriment dans
 * une consigne ressort dans un `why` visible, et l'élève lit une carence.
 */
const SENTINEL_GROUP_LABELS: Partial<Record<FoodGroupRef, string>> = {
  fatty_fish: "an oily fish",
  white_fish: "a white fish",
  shellfish: "shellfish",
  legumes: "a pulse — lentils, beans or chickpeas",
  leafy_greens: "a leafy green",
  cruciferous_veg: "a brassica — broccoli, cabbage or cauliflower",
  dairy_yogurt: "a plain yogurt or a fresh cheese",
  dairy_cheese: "a cheese",
  eggs: "eggs",
  nuts_seeds: "nuts or seeds",
  whole_grain: "a wholegrain",
  red_meat: "a red meat",
  poultry: "poultry",
  lean_protein: "a lean protein",
  berries: "berries",
  other_fruit: "a fruit",
  citrus: "a citrus fruit",
  starchy_veg: "a starchy vegetable",
  non_starchy_veg: "a vegetable",
};

/**
 * LES GROUPES QUE LE PRODUIT NE PRESCRIT PAS.
 *
 * ── POURQUOI CETTE LISTE EXISTE, ET CE QU'ELLE COÛTE ─────────────────────
 * FF-039 dérive les porteurs de sentinelle du référentiel, sans liste écrite à
 * la main — c'est la bonne mécanique, et elle a un effet de bord mesuré:
 * `fried_food` est porteur de fer et de zinc (ses deux entrées le sont), donc
 * `place_missing_sentinel` pourrait recommander de la friture pour combler un
 * trou en fer. Idem pour l'alcool, les sucreries et les boissons sucrées si
 * le référentiel grossit.
 *
 * La garde vit ICI plutôt que dans la dérivation, et c'est délibéré: un groupe
 * peut être un porteur RÉEL (c'est un fait de composition) sans être une
 * PRESCRIPTION (c'est une décision produit). Confondre les deux ferait mentir
 * le référentiel pour arranger une consigne.
 *
 * ⚠️ Elle est écrite à la main, et c'est le point faible assumé (FF-040 §11
 * n°1): elle divergera le jour où un groupe est renommé. Le typage
 * `readonly FoodGroupRef[]` fait au moins échouer la compilation sur un slug
 * inventé.
 */
export const NOT_PRESCRIBED_GROUPS: readonly FoodGroupRef[] = [
  "fried_food",
  "sugar_sweets",
  "sweetened_beverage",
  "alcohol",
  "sauce_dressing",
  "other_added_fat",
  "refined_grain",
];

/** La phrase complète d'un jeton, groupe résolu. `null` si non prescriptible. */
export function correctionPhrase(
  token: CorrectionToken,
  group: FoodGroupRef | null = null,
): string | null {
  if (token !== "place_missing_sentinel") return CORRECTION_PHRASES[token];
  if (group === null) return null;
  if (NOT_PRESCRIBED_GROUPS.includes(group)) return null;
  const label = SENTINEL_GROUP_LABELS[group];
  if (!label) return null;
  return CORRECTION_PHRASES.place_missing_sentinel.replace("<group>", label);
}

// ---------------------------------------------------------------------------
// LA PRÉSÉANCE ADHÉRENCE — ce que l'élève a déclaré gagne sur une optimisation
// ---------------------------------------------------------------------------

/**
 * CE QUE L'ÉLÈVE A DÉCLARÉ, réduit à ce que la correction doit respecter.
 *
 * `foodPreferences` est la prose promue depuis la conversation
 * (`food_preference_promotion.ts`), telle qu'elle part déjà au prompt. On ne
 * la réinterprète pas: on cherche seulement si un jeton la CONTREDIRAIT.
 */
export interface StudentDeclarations {
  /** Ce que l'élève a dit de sa bouffe, dans ses mots. */
  foodPreferences: readonly string[];
}

/**
 * LES MOTS PAR LESQUELS UN ÉLÈVE DÉSIGNE UN GROUPE — EN + FR.
 *
 * ── POURQUOI CE N'EST PAS LE LIBELLÉ D'AFFICHAGE ──────────────────────────
 * `SENTINEL_GROUP_LABELS` est écrit pour le MODÈLE, en anglais, et il est
 * soigné (« a pulse — lentils, beans or chickpeas »). Un élève, lui, écrit
 * « je ne mange pas de légumineuses ». Chercher les mots du libellé anglais
 * dans une déclaration française ne trouve rien — mesuré: le test de ce module
 * est tombé dessus au premier passage, et la conséquence aurait été une
 * préséance d'adhérence qui ne mord QUE pour les élèves anglophones.
 *
 * C'est exactement la cicatrice « garde testée dans une seule langue » de ce
 * dépôt, appliquée d'avance.
 */
const SENTINEL_GROUP_MATCH_WORDS: Partial<Record<FoodGroupRef, readonly string[]>> = {
  fatty_fish: ["fish", "salmon", "mackerel", "sardine", "poisson", "saumon", "maquereau"],
  white_fish: ["fish", "cod", "poisson", "cabillaud"],
  shellfish: ["shellfish", "prawn", "shrimp", "mussel", "crustace", "fruits de mer", "crevette", "moule"],
  legumes: ["pulse", "pulses", "lentil", "bean", "chickpea", "legumineuse", "lentille", "haricot", "pois chiche"],
  leafy_greens: ["greens", "spinach", "salad", "epinard", "salade", "verdure"],
  cruciferous_veg: ["brassica", "broccoli", "cabbage", "cauliflower", "chou", "brocoli"],
  dairy_yogurt: ["dairy", "yogurt", "yoghurt", "laitier", "laitage", "yaourt", "lactose"],
  dairy_cheese: ["dairy", "cheese", "laitier", "fromage", "lactose"],
  eggs: ["egg", "oeuf", "œuf"],
  nuts_seeds: ["nut", "nuts", "seed", "noix", "graine", "oleagineux"],
  whole_grain: ["grain", "wholegrain", "gluten", "cereale", "complet"],
  red_meat: ["meat", "beef", "lamb", "pork", "viande", "boeuf", "agneau", "porc"],
  poultry: ["poultry", "chicken", "meat", "volaille", "poulet", "viande"],
  lean_protein: ["meat", "ham", "viande", "jambon"],
  berries: ["berries", "berry", "fruits rouges", "baie"],
  other_fruit: ["fruit", "fruits"],
  citrus: ["citrus", "orange", "lemon", "agrume", "citron"],
  starchy_veg: ["potato", "starch", "pomme de terre", "feculent"],
  non_starchy_veg: ["vegetable", "veg", "legume", "legumes"],
};

/**
 * LES MOTS QUI DISENT « JE N'EN MANGE PAS », EN+FR.
 *
 * Volontairement étroit. Ce lexique ne décide pas de ce que l'élève aime: il
 * repère une DÉCLARATION D'EXCLUSION, qui est la seule chose qui doive faire
 * taire un jeton. Une préférence tiède (« je préfère le poulet ») n'a pas à
 * bloquer une correction.
 */
const EXCLUSION_MARKERS: readonly string[] = [
  // EN
  "no",
  "not",
  "never",
  "avoid",
  "avoids",
  "avoiding",
  "cannot",
  "hate",
  "hates",
  "dislike",
  "dislikes",
  "allergic",
  "intolerant",
  "free",
  "without",
  "vegetarian",
  "vegan",
  "pescatarian",
  // FR
  "pas",
  "jamais",
  "aucun",
  "aucune",
  "evite",
  "eviter",
  "deteste",
  "allergique",
  "intolerant",
  "intolerante",
  "sans",
  "vegetarien",
  "vegetarienne",
  "vegetalien",
  "vegan",
];

/**
 * Ce jeton contredit-il une déclaration de l'élève ?
 *
 * ── LA RÈGLE DU DESIGN, RENDUE EXÉCUTABLE ────────────────────────────────
 * « Un interdit gagne sur une envie ; une optimisation ne gagne jamais sur une
 * déclaration. » Seul `place_missing_sentinel` peut contredire quelque chose de
 * NOMMÉ: les autres jetons parlent de façons de composer (« moins de matière
 * grasse ajoutée », « des légumes qui portent le volume ») et ne prescrivent
 * aucun aliment.
 *
 * ── ON CHERCHE LE MOT DU GROUPE DANS UNE PHRASE D'EXCLUSION ──────────────
 * Grossier, et c'est voulu: la direction de l'erreur est choisie. Un faux
 * positif fait taire une correction (coût: une amélioration ratée); un faux
 * négatif propose du poisson à quelqu'un qui a écrit qu'il n'en mange pas
 * (coût: le produit n'a pas écouté). On paie le premier.
 */
export function contradictsDeclaration(
  token: CorrectionToken,
  group: FoodGroupRef | null,
  declarations: StudentDeclarations,
): boolean {
  if (token !== "place_missing_sentinel" || group === null) return false;
  const needles = (SENTINEL_GROUP_MATCH_WORDS[group] ?? []).map(normalizeTerm);
  if (needles.length === 0) return false;

  for (const raw of declarations.foodPreferences ?? []) {
    const text = normalizeTerm(String(raw ?? ""));
    if (!text) continue;
    const words = text.split(" ");
    const hasExclusion = words.some((w) => EXCLUSION_MARKERS.includes(w));
    if (!hasExclusion) continue;
    // Préfixe et pas égalité: « légumineuses » doit matcher « legumineuse »,
    // « poissons » « poisson ». Le préfixe est celui de l'AIGUILLE, pas du mot
    // de l'élève — l'inverse ferait matcher « le » sur « lentille ».
    const hit = needles.some((n) =>
      n.includes(" ") ? text.includes(n) : words.some((w) => w.startsWith(n))
    );
    if (hit) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// LE MAPPING — exhaustif à la compilation
// ---------------------------------------------------------------------------

export interface CorrectionPlan {
  /** Les jetons à servir, dans l'ordre de priorité. Vide = aucune relance. */
  tokens: CorrectionToken[];
  /** Les phrases correspondantes, groupe résolu. */
  phrases: string[];
  /** Ce qui a été écarté, et pourquoi. Compté, jamais silencieux. */
  suppressed: string[];
}

/**
 * `energy` → jeton. `switch` SANS `default`: un état nouveau ne compile pas.
 *
 * `within` et `not_computable` rendent `null`, et ce sont deux `null`
 * différents qui ont la même conséquence — on ne corrige ni ce qui va, ni ce
 * qu'on n'a pas su mesurer. Le second est la règle la plus importante de tout
 * le chantier: corriger sur `not_computable`, c'est corriger sur du bruit, et
 * c'est exactement ce que la gate des 80 % existe pour empêcher.
 */
function energyToken(v: CompositionVerdict["energy"]): CorrectionToken | null {
  switch (v) {
    case "above":
      return "lower_energy";
    case "below":
      return "raise_energy";
    case "within":
      return null;
    case "not_computable":
      return null;
  }
}

function proteinToken(v: CompositionVerdict["protein"]): CorrectionToken | null {
  switch (v) {
    case "under":
      return "raise_protein_component";
    case "met":
      return null;
    case "not_computable":
      return null;
  }
}

function densityToken(v: CompositionVerdict["density"]): CorrectionToken | null {
  switch (v) {
    case "above":
      return "lower_density";
    case "within":
      return null;
    case "not_computable":
      return null;
  }
}

/**
 * Le plan de correction d'une génération.
 *
 * ── L'ORDRE EST LA HIÉRARCHIE DU DESIGN ──────────────────────────────────
 * La protéine d'abord (rang 2, la preuve la plus forte), puis l'énergie
 * (rang 3), puis la densité (rang 4), puis les sentinelles (rang 5). Un plan
 * qui corrigerait la densité avant la protéine optimiserait la grandeur la
 * moins fondée en premier.
 *
 * ── LE PLANCHER DE COUVERTURE INVERSE L'ORDRE ────────────────────────────
 * Sous le plancher (`coverageFloorHit`), les sentinelles passent DEVANT: leur
 * direction est protectrice, et à cette énergie-là la couverture micro devient
 * mathématiquement improbable. C'est le seul cas où l'ordre bouge.
 */
export function correctionPlanFor(args: {
  verdict: CompositionVerdict;
  envelope: Envelope;
  declarations: StudentDeclarations;
  /** Vrai quand l'énergie du PLAN passe sous le plancher de couverture. */
  coverageFloorHit: boolean;
  /** Les axes que la doctrine gouvernante a éteints (FF-041). */
  offAxes?: readonly string[];
}): CorrectionPlan {
  const { verdict, declarations } = args;
  const off = new Set(args.offAxes ?? []);
  const tokens: CorrectionToken[] = [];
  const phrases: string[] = [];
  const suppressed: string[] = [];

  const push = (token: CorrectionToken | null, group: FoodGroupRef | null, axis: string) => {
    if (token === null) return;
    // ── `off` RETIRE L'ARBITRE, JAMAIS L'INSTRUMENT ────────────────────
    // Le verdict a été CALCULÉ (il est écrit en base); il ne SERT pas de
    // correction. Mesure ≠ pilotage.
    if (off.has(axis)) {
      suppressed.push(`${token}: axis '${axis}' is off for this doctrine`);
      return;
    }
    if (contradictsDeclaration(token, group, declarations)) {
      suppressed.push(`${token}: contradicts a declaration by the student`);
      return;
    }
    const phrase = correctionPhrase(token, group);
    if (phrase === null) {
      // `place_missing_sentinel` sur un groupe que le produit ne prescrit pas
      // (friture, sucreries) ou dont il n'a pas de libellé.
      suppressed.push(`${token}: group '${group}' is not prescribable`);
      return;
    }
    if (tokens.includes(token)) return;
    tokens.push(token);
    phrases.push(phrase);
  };

  const sentinels = () => {
    for (const group of verdict.sentinels.missing) {
      // UN SEUL groupe servi, et le premier prescriptible. Servir six groupes
      // ferait une consigne que le modèle applique à moitié, et personne ne
      // saurait laquelle.
      if (tokens.includes("place_missing_sentinel")) break;
      push("place_missing_sentinel", group, "micro_coverage");
    }
  };

  if (args.coverageFloorHit) sentinels();
  push(proteinToken(verdict.protein), null, "protein");
  push(energyToken(verdict.energy), null, "energy");
  push(densityToken(verdict.density), null, "satiety_density");
  if (!args.coverageFloorHit) sentinels();

  return { tokens, phrases, suppressed };
}

/**
 * L'INSTRUCTION DE RELANCE.
 *
 * Patron `doctrineRetryInstruction` (`doctrine.ts`): une relance qui ne nomme
 * pas ce qui manque rejoue le même dé. Ici on ne nomme PAS le verdict (ce
 * serait dire « tu es au-dessus »), on nomme ce qu'il faut FAIRE.
 *
 * La sortie de cette relance repasse par `parseGeneratedMeal` EN ENTIER —
 * verrous de sécurité, doctrine, filtres numériques, plafonds, ancre.
 */
export function correctionRetryInstruction(plan: CorrectionPlan): string | null {
  if (plan.phrases.length === 0) return null;
  return [
    "Compose this again, keeping everything else — the same days, the same " +
    "rhythm, the same method. Change only this:",
    ...plan.phrases.map((p) => `- ${p}`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// LE CRITÈRE D'ADOPTION D'UNE RELANCE — une DISTANCE, plus un compte
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE LE COMPTE BINAIRE JETAIT, ET C'ÉTAIT PAYÉ À CHAQUE PLAN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * L'adoption d'une relance se décidait sur `offBandCount` — 0 ou 1 par axe,
 * comparé par un `<` STRICT. Or `CompositionVerdict` ne porte que des MOTS
 * (`"below"`, `"under"`): une seconde passe qui monte de 68 % à 84 % de la
 * bande reste `below`, le compte ne bouge pas, et la relance est jetée.
 *
 * Mesuré le 2026-08-23 sur sept plans solo: la boucle levait
 * `raise_energy` + `raise_protein_component` **7 fois sur 7**, payait 7 appels
 * de modèle (≈ 38 s et 5 600 jetons de sortie chacun), et n'en adoptait **1**.
 * Le rendement documenté d'une relance est ×1,21 sur l'énergie — c'est-à-dire
 * précisément le genre de progrès qu'un compte binaire ne peut pas voir.
 *
 * ── CE QUE CETTE FONCTION AJOUTE, ET CE QU'ELLE NE CHANGE PAS ─────────────
 * Elle rend une DISTANCE, plus petite = mieux, et elle garde exactement les
 * mêmes axes et les mêmes silences que le compte:
 *
 *   · `not_computable` VAUT ZÉRO, comme avant. Une relance qui rendrait un plan
 *     moins lisible passerait sinon pour une amélioration, et le produit
 *     préférerait l'ignorance à l'imperfection.
 *   · La densité et les sentinelles n'ont pas d'amplitude accessible ici: elles
 *     comptent 1 chacune, comme avant. Leur inventer une magnitude serait une
 *     précision qu'aucune mesure ne soutient.
 *
 * Seuls l'énergie et la protéine gagnent une amplitude, parce que ce sont les
 * deux seules pour lesquelles l'appelant tient déjà les nombres.
 *
 * ⚠️ L'ÉCHELLE EST RELATIVE, JAMAIS EN KCAL. Un écart se mesure en fraction de
 * la cible, sinon un grand corps pèserait plus lourd dans l'arbitrage qu'un
 * petit — et « de combien ce plan rate SA propre cible » est la seule question
 * qui a un sens ici. Une grandeur hors bande coûte donc au moins 1, comme dans
 * le compte, plus sa fraction d'écart: deux axes ratés restent pires qu'un seul.
 *
 * PURE: aucun I/O, aucune horloge.
 */
export function offBandDistance(args: {
  verdict: CompositionVerdict;
  envelope: Envelope;
  /** L'énergie du plan sur TOUTE la fenêtre, `null` si non mesurée. */
  computedKcal: number | null;
  /** La protéine du plan sur toute la fenêtre, `null` si non mesurée. */
  computedProteinG: number | null;
  daysCovered: number;
}): number {
  const { verdict, envelope } = args;
  // ⛔ PAS DE `Math.floor` — la distance se compare au verdict qui l'accompagne.
  // Depuis le 2026-09-04, `daysCovered` est un nombre de journées NOURRIES
  // (`windowCoverageOf`), donc fractionnaire. Arrondir ici ferait mesurer
  // l'écart d'une relance sur un kcal/jour que le verdict n'a jamais calculé —
  // et l'adoption de la relance se décide sur CET écart.
  const days = Math.max(1, args.daysCovered);
  let d = 0;

  if (verdict.energy === "below" || verdict.energy === "above") {
    d += 1;
    if (
      envelope.mode === "per_kg" && envelope.energy !== null &&
      args.computedKcal !== null && Number.isFinite(args.computedKcal)
    ) {
      const perDay = args.computedKcal / days;
      const bound = verdict.energy === "below"
        ? envelope.energy.low
        : envelope.energy.high;
      if (bound > 0) d += Math.abs(perDay - bound) / bound;
    }
  }

  if (verdict.protein === "under") {
    d += 1;
    if (
      envelope.mode === "per_kg" && envelope.proteinFloorG > 0 &&
      args.computedProteinG !== null && Number.isFinite(args.computedProteinG)
    ) {
      const perDay = args.computedProteinG / days;
      const floor = envelope.proteinFloorG;
      // ⚠️ `max(0, …)`: `under` et « au-dessus du plancher » ne peuvent pas
      // coexister, mais un appelant qui passerait deux mesures désaccordées ne
      // doit pas pouvoir RÉDUIRE la distance d'un axe raté.
      d += Math.max(0, (floor - perDay) / floor);
    }
  }

  if (verdict.density === "above") d += 1;
  d += verdict.sentinels.missing.length;
  return d;
}
