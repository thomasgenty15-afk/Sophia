/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE MOTEUR DES À-CÔTÉS — qui reçoit quoi, quel aliment, combien de grammes.
 * ⟳ 2026-09-23 — flux A du chantier « assiettes normales ».
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `~/.claude/plans/lexical-gliding-lamport.md` (§ « Les à-côtés par
 * objectif », flux A). Vocabulaire, formes et constantes:
 * `side_courses_types.ts`. Budget d'un moment: `side_course_budget.ts`.
 * Consigne: `side_courses_prompt.ts` (flux C).
 *
 * ── LE PARTAGE DU TRAVAIL (décision du 2026-09-23) ────────────────────────
 * Le moteur décide le TYPE et les CALORIES; le modèle nomme l'ALIMENT, une
 * fois, sans grammes; le moteur calcule les GRAMMES. Ce fichier porte les deux
 * moitiés du moteur:
 *
 *   AVANT LE MODÈLE
 *     ① `planSideCourses` — la rotation par objectif, les réglages de la
 *       personne, les moments légers. Rend l'entrée de `sideBudgetFor` par
 *       jour et par moment (le contrat, flux B, la consomme telle quelle).
 *     ② `impossibleKindsFor` — un type d'à-côté qu'aucun aliment de secours
 *       ne peut servir (exclusion, régime, allergie) n'est jamais demandé.
 *
 *   APRÈS LE MODÈLE
 *     ③ `extractSideCourses` — la clé de premier niveau `side_courses`.
 *     ④ `buildSideCourseLedger` — chaque entrée validée ou refusée, avec son
 *       motif; ce qui manque est complété par la liste de secours, en
 *       rotation; ce qui ne peut rien recevoir est compté `dropped`.
 *     ⑤ `sideGramsFor` / `snapDeltaKcal` — les grammes, et l'écart entre
 *       prévu et servi, que l'intégrateur rend au plat. ⟳ 2026-09-23 (v40) —
 *       en prise et en maintien, le manque passe d'abord par le pain et le
 *       fromage déjà servis (`SIDE_COURSE_REGROW_ORDER`).
 *     ⑥ Les adaptateurs: rattacher au plat hôte, tirer une casserole de
 *       soupe, écrire les courses, sommer par personne et par jour.
 *
 * ── ⛔ UN À-CÔTÉ N'EST JAMAIS UN ITEM DE BOÎTE ────────────────────────────
 * Il vit dans `dishes[i].side_courses[]` (`attachSideCourses`), pour que
 * « l'assiette = le plat » reste vrai chez tous les lecteurs de masse. Rien ici
 * n'écrit dans `boxes[].items`.
 *
 * ── ⛔ AUCUN MATCHER MAISON ───────────────────────────────────────────────
 * Un aliment se résout par `resolveCompositionLine` (l'identifiant d'abord);
 * une exclusion se juge par `dishBitesExclusion`; un régime par
 * `scanDietaryRegime` (le moteur sous `biteFor` de `meal_generation.ts`); une
 * allergie par `findMedicalConstraintViolations` et `allergenGroupViolations`.
 * « laitue » ≠ « lait »: 12 faux positifs sur 12 mesurés avec un matcher
 * artisanal.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */
import {
  type CompositionIndex,
  type CompositionRef,
  type CompositionUnit,
  resolveCompositionLine,
} from "./food_composition.ts";
import { isComposable } from "./food_reference_manifest.ts";
import { dishBitesExclusion } from "./food_exclusion_belt.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";
import { type DietaryRegime, excludedGroupsFor, scanDietaryRegime } from "./dietary_regime.ts";
import {
  findMedicalConstraintViolations,
  isBeltBlockingSeverity,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";
import { ALLERGEN_IMPLIED_BY_GROUP, allergenGroupViolations } from "./allergen_food_groups.ts";
import {
  type DishIngredient,
  gramsRawForIngredient,
  MAX_FRIDGE_DAYS,
  type MealPreparation,
  preparationReadyGrams,
  preparationReadyKcal,
} from "./meal_generation.ts";
import {
  growIngredientsToReadyMass,
  MAX_SINGLE_INGREDIENT_G,
  scaleIngredients,
} from "./portion_scaling.ts";
import { scaleDirectionOf } from "./weight_pace.ts";
import type { FoodGroupRef, GoalToken } from "./tokens.ts";
import {
  type DishSideCoursePayload,
  SIDE_COURSE_BASE_KCAL,
  SIDE_COURSE_DENSE_DESSERT_ABOVE_KCAL_PER_100G,
  SIDE_COURSE_DENSE_DESSERT_GROUPS,
  SIDE_COURSE_DENSE_DESSERT_MIN_G,
  SIDE_COURSE_DESSERT_COUNTED_FROM_G,
  SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G,
  SIDE_COURSE_FALLBACK_SLUGS,
  SIDE_COURSE_FALLBACK_TERMS,
  SIDE_COURSE_GRAMS_BOUNDS,
  SIDE_COURSE_KIND_GROUPS,
  SIDE_COURSE_KIND_MAX_KCAL,
  SIDE_COURSE_KINDS,
  SIDE_COURSE_MAX_MEAL_SHARE,
  SIDE_COURSE_MAX_UNITS,
  SIDE_COURSE_MIN_ADDED_KCAL,
  SIDE_COURSE_REFUSALS,
  SIDE_COURSE_SLOTS,
  type SideCourseAsk,
  type SideCourseGoal,
  type SideCourseKind,
  type SideCourseLedger,
  type SideCourseModelCounters,
  type SideCoursePrefs,
  type SideCourseRefusal,
  type SideCourseServed,
  type SideCourseSlot,
  type SideCourseSlotInput,
  type SideTermJudge,
} from "./side_courses_types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ⓪ LES CLÉS, L'OBJECTIF, LA LANGUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA CLÉ D'UN MOMENT D'UNE PERSONNE: `${memberId}|${dayToken}|${slot}`.
 *
 * ⛔ UNE SEULE FABRIQUE. C'est la clé de `SideCourseLedger.byKey`; la
 * reconstruire à la main chez un lecteur est la façon dont deux lecteurs
 * finissent par ne plus parler de la même case.
 */
export function sideCourseKey(memberId: string, dayToken: string, slot: string): string {
  return `${memberId}|${dayToken}|${slot}`;
}

/** La clé d'une personne pour une journée: `${memberId}|${dayToken}`. */
export function sideCourseDayKey(memberId: string, dayToken: string): string {
  return `${memberId}|${dayToken}`;
}

/**
 * L'OBJECTIF TEL QUE LES À-CÔTÉS LE LISENT, depuis le jeton de la personne.
 *
 * Un mineur est `minor` quel que soit son objectif; sinon le SENS de la
 * balance décide, par `scaleDirectionOf` — la même réduction que le reste de
 * la lane, jamais un second `if`. Aucun objectif = `maintenance`.
 */
export function sideCourseGoalFor(args: {
  goal: GoalToken | null;
  isMinor: boolean;
}): SideCourseGoal {
  if (args.isMinor) return "minor";
  if (args.goal === null) return "maintenance";
  const direction = scaleDirectionOf(args.goal);
  if (direction === "down") return "fat_loss";
  if (direction === "up") return "muscle_gain";
  return "maintenance";
}

/** La langue d'un mot d'écran de secours (`SIDE_COURSE_FALLBACK_TERMS`). */
export type SideCourseLanguage = keyof (typeof SIDE_COURSE_FALLBACK_TERMS)[string];

const isSlot = (s: string): s is SideCourseSlot =>
  (SIDE_COURSE_SLOTS as readonly string[]).includes(s);
const isKind = (k: string): k is SideCourseKind =>
  (SIDE_COURSE_KINDS as readonly string[]).includes(k);

// ═══════════════════════════════════════════════════════════════════════════
// ① LA ROTATION — planSideCourses
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'ORDRE DE L'OBJECTIF — celui qui re-remplit une liste vidée par les
 * réglages, et celui qui départage les types forcés sur un moment léger.
 *
 * ⚠️ LE MINEUR N'A PAS DE FROMAGE dans son ordre: il n'en reçoit jamais par
 * défaut, donc jamais par re-remplissage non plus. Un réglage `true` l'ouvre
 * (il est alors AJOUTÉ, pas re-rempli).
 */
export const SIDE_COURSE_GOAL_ORDER: Readonly<Record<SideCourseGoal, readonly SideCourseKind[]>> =
  Object.freeze({
    fat_loss: Object.freeze(["starter", "dessert", "cheese", "bread"] as const),
    maintenance: Object.freeze(["cheese", "dessert", "starter", "bread"] as const),
    muscle_gain: Object.freeze(["cheese", "dessert", "bread", "starter"] as const),
    minor: Object.freeze(["dessert", "starter", "bread"] as const),
  });

/**
 * CE QUE LA PRISE DE MUSCLE LAISSE GROSSIR, DANS L'ORDRE: le pain d'abord
 * (ajouté s'il n'est pas prévu), puis le dessert, puis le fromage.
 */
const MUSCLE_GAIN_GROW_KINDS: readonly SideCourseKind[] = ["bread", "dessert", "cheese"];

/**
 * ⟳ 2026-09-23 — QUI REÇOIT LE MANQUE D'UN REPAS, APRÈS LE MODÈLE, DANS L'ORDRE.
 *
 * Le manque d'un repas = kcal prévues − kcal servies (un gros fruit ramené à
 * une unité, un aliment peu dense, un à-côté perdu). Avant: tout repartait au
 * plat (`snapDeltaKcal`). Mesuré sur cinq générations v39: le plat de Thomas
 * (prise) était déjà à sa borne de 550 g, le rabotage retirait ce qu'il
 * recevait, et Thomas finissait certains jours à 96–97 % de sa cible.
 *
 * Prise: le pain, puis le fromage. Maintien: le fromage, puis le pain. Perte et
 * mineur: RIEN — le manque retourne au plat, comme avant.
 *
 * ⛔ SEULS LES À-CÔTÉS DÉJÀ SERVIS À CE REPAS GROSSISSENT. Le registre n'en
 * ajoute jamais un: ce serait contourner un refus (exclusion, allergie) ou un
 * réglage `false` de la personne.
 * ⟳ 2026-09-24 — UNE EXCEPTION, BORNÉE: le manque venu de la borne d'assiette
 * (`extraDeficitByKey`) peut AJOUTER un pain, en maintien et en prise, quand
 * l'appelant le permet (`breadAllowed`: réglage, impossible, moment léger) et
 * que le pain passe les mêmes portes que les autres (juge, allergies).
 * ⛔ LE DESSERT N'Y EST PAS: c'est lui qui a laissé le manque.
 */
export const SIDE_COURSE_REGROW_ORDER: Readonly<Record<SideCourseGoal, readonly SideCourseKind[]>> =
  Object.freeze({
    fat_loss: Object.freeze([] as SideCourseKind[]),
    maintenance: Object.freeze(["cheese", "bread"] as const),
    muscle_gain: Object.freeze(["bread", "cheese"] as const),
    minor: Object.freeze([] as SideCourseKind[]),
  });

/**
 * LA ROTATION DU JOUR `d` (indice dans la fenêtre), avant tout réglage.
 *
 * · Perte — midi: entrée + dessert. Soir: le fromage quand `d % 3 === 2`,
 *   QUELLE QUE SOIT LA PARITÉ; sinon `d` pair une entrée, `d` impair un
 *   dessert.
 *   ⟳ 2026-09-23 (vague 2, arbitrage n° 6) — le fromage remplace l'à-côté du
 *   SOIR, pas seulement le dessert. La lecture d'avant (« il remplace le
 *   dessert », donc les seuls soirs impairs `d = 5`, `11`…) ne servait AUCUN
 *   fromage dans une fenêtre de cinq jours: le type était écrit et mort.
 *   Désormais: 5 jours ⇒ 1 fromage (`d = 2`); 7 jours ⇒ 2 (`d = 2`, `5`). La
 *   grille d'acceptation dit « au plus 2 fois sur 5 jours »: 1 la tient.
 * · Maintien — midi: `d` pair du fromage, `d` impair un dessert, plus une
 *   entrée quand `d % 3 === 0` (AJOUTÉE après, donc un moment léger garde le
 *   fromage ou le dessert). Soir: l'inverse du midi, sans entrée.
 * · Prise — fromage + dessert, midi et soir.
 * · Mineur — un dessert, midi et soir.
 */
function rotationFor(goal: SideCourseGoal, slot: SideCourseSlot, d: number): SideCourseKind[] {
  const even = d % 2 === 0;
  switch (goal) {
    case "fat_loss":
      if (slot === "lunch") return ["starter", "dessert"];
      if (d % 3 === 2) return ["cheese"];
      return even ? ["starter"] : ["dessert"];
    case "maintenance":
      if (slot === "lunch") {
        const main: SideCourseKind = even ? "cheese" : "dessert";
        return d % 3 === 0 ? [main, "starter"] : [main];
      }
      return [even ? "dessert" : "cheese"];
    case "muscle_gain":
      return ["cheese", "dessert"];
    case "minor":
      return ["dessert"];
  }
}

/** Un indice de jour utilisable: entier ≥ 0. NaN ou négatif ⇒ 0, jamais une rotation inventée. */
function dayIndexOf(d: number): number {
  return Number.isFinite(d) && d > 0 ? Math.floor(d) : 0;
}

/**
 * LES À-CÔTÉS D'UNE PERSONNE, PAR JOUR ET PAR MOMENT — l'entrée de
 * `sideBudgetFor` et de `ContractDay.sides` (flux B).
 *
 * L'ordre des gestes, pour un (jour, moment) déjeuner ou dîner:
 *   ① les quatre réglages à `false` ⇒ `refused: true`, `courses: []`;
 *   ② la rotation de l'objectif, moins les types à `false` et les types
 *     impossibles (`impossibleKinds`, calculé par `impossibleKindsFor`);
 *   ③ un type à `true` est FORCÉ: ajouté en fin de liste s'il n'y est pas;
 *   ④ une liste vidée par ② est re-remplie depuis l'ordre de l'objectif, parmi
 *     les types permis, autant qu'elle en portait;
 *   ⑤ toujours vide ⇒ `refused: true` — rien n'est servable, et le contrat doit
 *     faire déborder ce plat comme celui d'une personne qui refuse;
 *   ⑥ un moment léger garde UN à-côté: le premier type forcé s'il y en a un,
 *     sinon le premier de la liste.
 *
 * ⛔ UN TYPE IMPOSSIBLE GAGNE SUR UN RÉGLAGE `true`. « Je veux du fromage » ne
 * rouvre pas le fromage d'une personne allergique au lait.
 *
 * ⚠️ `growKinds`: prise = pain, dessert, fromage; perte = les types servis
 * seulement (JAMAIS de pain ajouté en croissance); maintien et mineur = les
 * types servis puis le pain. Toujours filtrés par les réglages et
 * l'impossible.
 *
 * ⚠️ CHAQUE JOUR DE `days` A SON ENTRÉE, même vide: une `Map` vide dit « les
 * à-côtés s'appliquent, ce jour n'en porte aucun » — ce que `null` ne dit pas
 * au contrat (`ContractDay.sides`). Les moments autres que déjeuner et dîner
 * ne reçoivent jamais rien.
 */
export function planSideCourses(args: {
  goal: SideCourseGoal;
  prefsBySlot: Readonly<Partial<Record<SideCourseSlot, SideCoursePrefs>>>;
  lightSlots: ReadonlySet<string>;
  impossibleKinds: ReadonlyMap<SideCourseSlot, ReadonlySet<SideCourseKind>>;
  days: readonly { dayToken: string; dayIndex: number; slots: readonly string[] }[];
}): Map<string, Map<SideCourseSlot, SideCourseSlotInput>> {
  const goal = args.goal;
  const capShare = SIDE_COURSE_MAX_MEAL_SHARE[goal === "minor" ? "minor" : "adult"];
  const baseOf = SIDE_COURSE_BASE_KCAL[goal];
  // L'ordre complet de l'objectif: le mineur y reçoit le fromage EN DERNIER,
  // pour qu'un réglage `true` ait une place où être départagé.
  const fullOrder: SideCourseKind[] = [
    ...SIDE_COURSE_GOAL_ORDER[goal],
    ...SIDE_COURSE_KINDS.filter((k) => !SIDE_COURSE_GOAL_ORDER[goal].includes(k)),
  ];
  const out = new Map<string, Map<SideCourseSlot, SideCourseSlotInput>>();
  for (const day of args.days) {
    const perSlot = new Map<SideCourseSlot, SideCourseSlotInput>();
    out.set(day.dayToken, perSlot);
    const d = dayIndexOf(day.dayIndex);
    for (const rawSlot of day.slots) {
      const slot = String(rawSlot ?? "").trim().toLowerCase();
      if (!isSlot(slot) || perSlot.has(slot)) continue;
      const prefs: SideCoursePrefs = args.prefsBySlot[slot] ?? {};
      const impossible = args.impossibleKinds.get(slot) ?? new Set<SideCourseKind>();
      const light = args.lightSlots.has(slot);
      const refusedInput: SideCourseSlotInput = {
        courses: [],
        growKinds: [],
        refused: true,
        capShare,
        light,
      };
      // ① Les quatre à `false`: la personne refuse tout.
      if (SIDE_COURSE_KINDS.every((k) => prefs[k] === false)) {
        perSlot.set(slot, refusedInput);
        continue;
      }
      const allowed = (k: SideCourseKind) => prefs[k] !== false && !impossible.has(k);
      // ② La rotation, filtrée.
      const rotation = rotationFor(goal, slot, d);
      const list = rotation.filter(allowed);
      // ③ Les types forcés, dans l'ordre de l'objectif.
      const forced = fullOrder.filter((k) => prefs[k] === true && allowed(k));
      for (const k of forced) if (!list.includes(k)) list.push(k);
      // ④ Le re-remplissage d'une liste vidée.
      if (list.length === 0) {
        list.push(...SIDE_COURSE_GOAL_ORDER[goal].filter(allowed).slice(0, rotation.length));
      }
      // ⑤ Rien de servable.
      if (list.length === 0) {
        perSlot.set(slot, refusedInput);
        continue;
      }
      // ⑥ Le moment léger garde un seul à-côté.
      const kept = light ? [list.find((k) => forced.includes(k)) ?? list[0]] : list;
      const growRaw: readonly SideCourseKind[] = goal === "muscle_gain"
        ? MUSCLE_GAIN_GROW_KINDS
        : goal === "fat_loss"
        ? kept
        : [...kept, "bread"];
      const growKinds = [...new Set(growRaw)].filter(allowed);
      perSlot.set(slot, {
        courses: kept.map((kind) => ({ kind, baseKcal: baseOf[kind] })),
        growKinds,
        refused: false,
        capShare,
        light,
      });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ② L'IMPOSSIBLE — impossibleKindsFor
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE NOM DU TYPE, AJOUTÉ À LA SURFACE D'UN ALIMENT DE SECOURS JUGÉE PAR LES
 * EXCLUSIONS ET LES ALLERGIES.
 *
 * ⛔ SANS LUI, « pas de fromage le soir » NE MORDAIT RIEN: la liste de secours
 * disait « cheddar », « parmesan », « feta » (aujourd'hui « comté »,
 * « camembert », « emmental »…), et aucun ne contient « fromage » —
 * `categoryFormsOf` ne déplie pas ce mot. Le moteur aurait demandé un fromage
 * au dîner que la personne a refusé, et la décision n° 7 du plan (« le moteur
 * retire alors l'à-côté fromage du dîner ») serait restée écrite et morte.
 *
 * ⚠️ CE N'EST PAS UNE DEVINETTE: chaque aliment de secours EST de ce type (le
 * test du socle vérifie son groupe). On nomme la catégorie d'un aliment dont on
 * sait qu'il y appartient — le sens sûr, catégorie → espèce. Seul le moteur
 * de la ceinture compare les mots (`findForbiddenMatches`, frontières de mot).
 */
export const SIDE_COURSE_KIND_WORDS: Readonly<Record<SideCourseKind, readonly string[]>> = Object
  .freeze({
    starter: Object.freeze(["entrée", "starter"] as const),
    cheese: Object.freeze(["fromage", "cheese"] as const),
    dessert: Object.freeze(["dessert"] as const),
    bread: Object.freeze(["pain", "bread"] as const),
  });

/** Les slugs d'allergène que les contraintes BLOQUANTES déclarent. */
function blockedAllergenRefs(allergens: readonly StudentSafetyConstraint[]): Set<string> {
  const out = new Set<string>();
  for (const c of allergens ?? []) {
    if (!c || !isBeltBlockingSeverity(c.severity)) continue;
    for (const ref of [c.allergenRef, c.substanceRef]) {
      const slug = String(ref ?? "").trim().toLowerCase();
      if (slug) out.add(slug);
    }
  }
  return out;
}

/**
 * UN ALIMENT SOUS LES TROIS CEINTURES: exclusion (au moment donné), régime,
 * allergie. `null` = rien n'a mordu.
 *
 * ⚠️ `terms` porte plusieurs graphies du MÊME aliment (mot d'écran fr/en,
 * libellé du référentiel, nom du type): ce sont des ingrédients déclarés, lus
 * surface `"ingredients"` — jamais de la prose.
 */
function foodBite(args: {
  terms: readonly string[];
  group: FoodGroupRef | null;
  exclusionTerms: readonly ForbiddenTerm[];
  regime: DietaryRegime | null;
  allergens: readonly StudentSafetyConstraint[];
  slot: string | null;
}): "excluded" | "regime" | null {
  const terms = [...new Set(args.terms.map((t) => String(t ?? "").trim()).filter((t) => t))];
  if (terms.length === 0) return null;
  if (args.exclusionTerms.length > 0) {
    const bite = dishBitesExclusion({
      dish: { title: "", method: "", ingredients: terms.map((term) => ({ term })) },
      uses: [],
      preparationById: new Map(),
      terms: args.exclusionTerms,
      surface: "ingredients",
      slot: args.slot,
    });
    if (bite.matched !== null) return "excluded";
  }
  if (args.regime !== null) {
    const scan = scanDietaryRegime(args.regime, {
      items: terms.map((term) => ({ term, group: args.group })),
    });
    if (scan.breaches.length > 0) return "regime";
  }
  if (args.allergens.length > 0) {
    // ⚠️ UNE ALLERGIE EST COMPTÉE `excluded`: le vocabulaire fermé des refus
    // (`SIDE_COURSE_REFUSALS`, socle) n'a pas de motif « allergie », et le
    // geste est le même — l'aliment ne sert pas à cette personne.
    if (findMedicalConstraintViolations(terms.join(" • "), args.allergens).length > 0) {
      return "excluded";
    }
    if (
      args.group !== null &&
      allergenGroupViolations(
          [{ title: terms[0], ingredients: [{ term: terms[0], group: args.group }] }],
          args.allergens,
        ).length > 0
    ) {
      return "excluded";
    }
  }
  return null;
}

/** Une référence servable: au référentiel, composable, avec une énergie. */
function servableRef(index: CompositionIndex | null, slug: string): CompositionRef | null {
  const ref = index?.bySlug.get(slug) ?? null;
  if (ref === null || !isComposable(ref) || !(ref.energyKcal > 0)) return null;
  return ref;
}

/**
 * LES TYPES D'À-CÔTÉ QU'ON NE PEUT PAS SERVIR À CETTE PERSONNE, À CE MOMENT.
 *
 * Un type est impossible dans deux cas, et un seul suffit:
 *   ① TOUS ses aliments de secours (`SIDE_COURSE_FALLBACK_SLUGS[kind][goal]`)
 *     sont mordus — par une exclusion qui vaut à ce moment
 *     (`dishBitesExclusion`), par le régime (`scanDietaryRegime`, groupe du
 *     référentiel compris) ou par une allergie bloquante — ou absents du
 *     référentiel. Si le modèle échoue, le moteur n'aurait rien à servir.
 *   ② TOUS ses groupes admis (`SIDE_COURSE_KIND_GROUPS[kind][goal]`) sont
 *     exclus par le régime (`excludedGroupsFor`) ou impliquent une allergie
 *     bloquante (`ALLERGEN_IMPLIED_BY_GROUP`).
 *
 * ⟳ 2026-09-23 (vague 2) — le fromage d'un mineur a désormais sa liste de
 * secours (servie seulement quand le réglage le force): ① le couvre donc
 * aussi, et « pas de fromage le soir » le rend impossible au dîner — ce que ②
 * seul ne faisait pas. Une liste vide ne rend toujours rien impossible par ①.
 *
 * ⚠️ RÉFÉRENTIEL ABSENT (`index === null`) ⇒ TOUT est impossible. Un à-côté
 * ne se pèse que par le référentiel; en demander un au modèle serait lui
 * demander un aliment qu'on jettera.
 *
 * ⚠️ `allergens` est ce que l'appelant juge pertinent pour cette personne —
 * l'union du foyer, comme pour les casseroles, est le choix sûr.
 */
export function impossibleKindsFor(args: {
  goal: SideCourseGoal;
  slot: SideCourseSlot;
  exclusionTerms: readonly ForbiddenTerm[];
  regime: DietaryRegime | null;
  allergens: readonly StudentSafetyConstraint[];
  index: CompositionIndex | null;
}): Set<SideCourseKind> {
  const out = new Set<SideCourseKind>();
  if (args.index === null) {
    for (const k of SIDE_COURSE_KINDS) out.add(k);
    return out;
  }
  const regimeGroups: readonly FoodGroupRef[] = args.regime === null
    ? []
    : excludedGroupsFor(args.regime);
  const blocked = blockedAllergenRefs(args.allergens);
  const groupBlocked = (g: FoodGroupRef) =>
    regimeGroups.includes(g) ||
    (ALLERGEN_IMPLIED_BY_GROUP[g] ?? []).some((a) => blocked.has(a));
  for (const kind of SIDE_COURSE_KINDS) {
    // ② Par les groupes.
    const groups = SIDE_COURSE_KIND_GROUPS[kind][args.goal];
    if (groups.length > 0 && groups.every(groupBlocked)) {
      out.add(kind);
      continue;
    }
    // ① Par les aliments de secours.
    const slugs = SIDE_COURSE_FALLBACK_SLUGS[kind][args.goal];
    if (slugs.length === 0) continue;
    const allBitten = slugs.every((slug) => {
      const ref = servableRef(args.index, slug);
      if (ref === null) return true;
      const words = SIDE_COURSE_FALLBACK_TERMS[slug];
      return foodBite({
        terms: [words?.fr ?? "", words?.en ?? "", ref.label, ...SIDE_COURSE_KIND_WORDS[kind]],
        group: ref.foodGroupRef,
        exclusionTerms: args.exclusionTerms,
        regime: args.regime,
        allergens: args.allergens,
        slot: args.slot,
      }) !== null;
    });
    if (allBitten) out.add(kind);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA CLÉ DU MODÈLE — extractSideCourses
// ═══════════════════════════════════════════════════════════════════════════

/** Une entrée `side_courses` telle que le modèle l'a écrite, champs ramenés à du texte. */
export interface RawSideCourse {
  day: string;
  slot: string;
  member_id: string;
  kind: string;
  term: string;
  ref: string | null;
  preparation_id: string | null;
}

/**
 * CE QUE LA LECTURE A TROUVÉ — tous les états, pour que « le modèle n'a rien
 * rendu » et « on n'a pas su lire » ne se relisent pas pareil.
 */
export const SIDE_COURSE_EXTRACT_STATUSES = ["ok", "absent", "unreadable", "not_an_array"] as const;
export type SideCourseExtractStatus = (typeof SIDE_COURSE_EXTRACT_STATUSES)[number];

export interface SideCourseExtract {
  entries: RawSideCourse[];
  status: SideCourseExtractStatus;
  /** Les éléments du tableau qui n'étaient pas des objets — jetés, et comptés. */
  malformed: number;
}

const textOf = (
  v: unknown,
): string => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
const idOrNull = (v: unknown): string | null => {
  const t = textOf(v);
  return t === "" || t.toLowerCase() === "null" ? null : t;
};

/**
 * LA CLÉ DE PREMIER NIVEAU `side_courses`, LUE SUR LE TEXTE BRUT DU MODÈLE.
 *
 * ⛔ MÊME DÉCOUPAGE QUE `extractExplanation` (`plan_explanation.ts`): du
 * premier `{` au dernier `}`. Un second découpage aurait une seconde tolérance
 * aux blocs de code, donc un jour deux verdicts sur la même réponse.
 *
 * ⚠️ NE LÈVE JAMAIS: une semaine composée ne se perd pas pour un champ
 * annexe. Ce qui manque est complété par la liste de secours, et `status` dit
 * pourquoi il manquait.
 */
export function extractSideCourses(rawJsonText: string): SideCourseExtract {
  const text = String(rawJsonText ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { entries: [], status: "unreadable", malformed: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { entries: [], status: "unreadable", malformed: 0 };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { entries: [], status: "unreadable", malformed: 0 };
  }
  const value = (parsed as Record<string, unknown>).side_courses;
  if (value === undefined || value === null) return { entries: [], status: "absent", malformed: 0 };
  if (!Array.isArray(value)) return { entries: [], status: "not_an_array", malformed: 0 };
  const entries: RawSideCourse[] = [];
  let malformed = 0;
  for (const el of value) {
    if (el === null || typeof el !== "object" || Array.isArray(el)) {
      malformed++;
      continue;
    }
    const o = el as Record<string, unknown>;
    entries.push({
      day: textOf(o.day),
      slot: textOf(o.slot),
      member_id: textOf(o.member_id),
      kind: textOf(o.kind),
      term: textOf(o.term),
      ref: idOrNull(o.ref),
      preparation_id: idOrNull(o.preparation_id),
    });
  }
  return { entries, status: "ok", malformed };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES GRAMMES — sideGramsFor
// ═══════════════════════════════════════════════════════════════════════════

/** Les grammes d'un à-côté, et ce que l'arrondi et les bornes ont fait. */
export interface SideCourseGrams {
  grams: number;
  /** « 1 pomme »: le nombre d'unités, ou `null` quand l'à-côté se pèse. */
  unitCount: number | null;
  /** L'énergie des grammes rendus (pour 100 g crus × grammes). */
  kcal: number;
  /** `null` quand le référentiel ne donne pas la protéine. */
  proteinG: number | null;
  /** L'arrondi (à l'unité ou aux 5 g) a déplacé les grammes exacts. */
  snapped: boolean;
  /** Une borne (grammes du type, 1 à 2 unités) a limité les grammes. */
  clamped: boolean;
  /**
   * ⟳ 2026-09-23 — LA LIMITE D'UN GROS FRUIT PAR DESSERT a retiré au moins
   * une unité (« 2 pommes » devenues 1). Compté par le registre
   * (`fruit_capped`); l'énergie non servie repart au plat.
   */
  unitCapped: boolean;
}

/**
 * LES GRAMMES QUI PORTENT `kcal` POUR UN ALIMENT DE CE TYPE.
 *
 * ① AVEC UN POIDS À L'UNITÉ, l'à-côté se COMPTE (« 1 pomme », « 2 kiwis »):
 *   l'arrondi est à l'unité, entre 1 et `SIDE_COURSE_MAX_UNITS`, ET les unités
 *   rendues doivent tenir dans les bornes du type. ⚠️ Une unité qui dépasse la
 *   borne haute ne se compte jamais: la baguette pèse 250 g à l'unité (borne du
 *   pain: 100 g), le concombre 300 g (borne de l'entrée: 250 g). Elle se pèse.
 *   Une unité sous la borne basse monte au nombre d'unités qui l'atteint
 *   (carotte, 70 g ⇒ 2 carottes).
 *   ⟳ 2026-09-23 — TROIS RÈGLES DU DESSERT, par le poids de l'unité:
 *   · `SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G` (100 g) et plus: UNE unité
 *     (pomme, poire, orange, banane), et `unitCapped` le dit;
 *   · de `SIDE_COURSE_DESSERT_COUNTED_FROM_G` (50 g) à 99 g: au plus
 *     `SIDE_COURSE_MAX_UNITS` (deux clémentines, deux kiwis);
 *   · sous 50 g (datte, pruneau: 8 g): il se PÈSE, comme en ②.
 * ② SINON, l'à-côté se PÈSE: arrondi aux 5 g, borné par
 *   `SIDE_COURSE_GRAMS_BOUNDS[kind]`.
 *   ⟳ 2026-09-23 — UN DESSERT DENSE (plus de
 *   `SIDE_COURSE_DENSE_DESSERT_ABOVE_KCAL_PER_100G` kcal pour 100 g, dans
 *   `SIDE_COURSE_DENSE_DESSERT_GROUPS`) a pour borne basse
 *   `SIDE_COURSE_DENSE_DESSERT_MIN_G` (15 g): 30 g d'amandes, 65 g de dattes.
 *
 * ⛔ L'ÉCART N'EST PAS PERDU. `kcal` est l'énergie des grammes RENDUS; l'écart
 * avec la demande revient au plat (`snapDeltaKcal`, appliqué par
 * l'intégrateur). Une tomate bornée à 250 g porte 48 kcal, pas 60.
 *
 * ⚠️ Une entrée inutilisable (`kcal` ou densité non positive) rend une portion
 * NULLE: zéro gramme, zéro kcal. Le registre ne la sert jamais — il refuse
 * l'aliment avant (`unresolved`).
 */
export function sideGramsFor(args: {
  kcal: number;
  kind: SideCourseKind;
  kcalPer100g: number;
  proteinPer100g: number | null;
  unitGrams: number | null;
  /**
   * ⟳ 2026-09-23 — LE GROUPE DU RÉFÉRENTIEL: il dit si un dessert peut être
   * dense (`SIDE_COURSE_DENSE_DESSERT_GROUPS`). `null` pour une préparation.
   */
  group: FoodGroupRef | null;
}): SideCourseGrams {
  const { kind, kcalPer100g } = args;
  if (!(args.kcal > 0) || !(kcalPer100g > 0) || !Number.isFinite(kcalPer100g)) {
    return {
      grams: 0,
      unitCount: null,
      kcal: 0,
      proteinG: args.proteinPer100g === null ? null : 0,
      snapped: false,
      clamped: false,
      unitCapped: false,
    };
  }
  const dessert = kind === "dessert";
  const dense = dessert && kcalPer100g > SIDE_COURSE_DENSE_DESSERT_ABOVE_KCAL_PER_100G &&
    args.group !== null &&
    (SIDE_COURSE_DENSE_DESSERT_GROUPS as readonly FoodGroupRef[]).includes(args.group);
  const bounds = dense
    ? { min: SIDE_COURSE_DENSE_DESSERT_MIN_G, max: SIDE_COURSE_GRAMS_BOUNDS.dessert.max }
    : SIDE_COURSE_GRAMS_BOUNDS[kind];
  const exact = (args.kcal / kcalPer100g) * 100;
  // ⟳ 2026-09-23 — L'ARRONDI NE FRANCHIT JAMAIS LE PLAFOND DU TYPE. Mesuré sur
  // la campagne (E2): 180 kcal de pain complet à 40 g la tranche arrondissaient
  // à 2 tranches = 210 kcal > 200, et le registre refusait l'aliment
  // `wrong_kind` alors que c'est l'ARRONDI qui débordait, pas le type. Au-dessus
  // de ce nombre de grammes, on redescend (une unité de moins, 5 g de moins);
  // le prévu non servi retourne au plat par `snapDeltaKcal`.
  const kcalCapGrams = (SIDE_COURSE_KIND_MAX_KCAL[kind] / kcalPer100g) * 100;
  const finish = (
    grams: number,
    unitCount: number | null,
    snapped: boolean,
    clamped: boolean,
    unitCapped: boolean,
  ) => ({
    grams,
    unitCount,
    kcal: (grams * kcalPer100g) / 100,
    proteinG: args.proteinPer100g === null ? null : (grams * args.proteinPer100g) / 100,
    snapped,
    clamped,
    unitCapped,
  });
  const unit = args.unitGrams;
  // ⟳ 2026-09-23 — un dessert dont l'unité pèse moins de 50 g se pèse (②).
  // ⟳ 2026-09-23 (v40) — LE PAIN SE PÈSE TOUJOURS, il ne se compte jamais. Mesuré:
  // « pain complet » se résout en tranches de 40 g (104,8 kcal); une 2ᵉ tranche
  // franchit le plafond du pain (200), donc le pain de la prise ne pouvait pas
  // reprendre le manque du dessert, et « 1 × pain complet » se lisait « un pain ».
  // Pesé, il grossit jusqu'à son plafond et s'affiche « pain complet ~75 g ».
  const counted = unit !== null && Number.isFinite(unit) && unit > 0 &&
    kind !== "bread" &&
    !(dessert && unit < SIDE_COURSE_DESSERT_COUNTED_FROM_G);
  if (counted) {
    const minUnits = Math.max(1, Math.ceil(bounds.min / unit));
    const maxUnits = Math.min(
      SIDE_COURSE_MAX_UNITS,
      Math.floor(bounds.max / unit),
      Math.floor(kcalCapGrams / unit),
    );
    // ⟳ 2026-09-23 — un gros fruit au plus par dessert.
    const oneUnit = dessert && unit >= SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G;
    const cappedMax = oneUnit ? Math.min(1, maxUnits) : maxUnits;
    if (minUnits <= cappedMax) {
      const rounded = Math.round(exact / unit);
      const uncapped = Math.min(maxUnits, Math.max(minUnits, rounded));
      const units = Math.min(cappedMax, uncapped);
      return finish(
        units * unit,
        units,
        rounded * unit !== exact,
        units !== rounded,
        units < uncapped,
      );
    }
  }
  const rounded = Math.round(exact / 5) * 5;
  // Le plafond du type ne descend jamais sous la borne basse: un aliment trop
  // dense pour elle (un cheesecake en dessert) reste refusé plus loin, et
  // c'est juste.
  const upper = Math.max(bounds.min, Math.min(bounds.max, Math.floor(kcalCapGrams / 5) * 5));
  const grams = Math.min(upper, Math.max(bounds.min, rounded));
  return finish(grams, null, rounded !== exact, grams !== rounded, false);
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE REGISTRE — buildSideCourseLedger
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA PART MINIMALE DE LÉGUMES D'UNE ENTRÉE PRÉPARÉE (soupe, crudités râpées),
 * en masse crue, eau exclue. Strictement au-dessus.
 *
 * ⚠️ « À majorité de légumes » (plan, flux A): une soupe poireaux–pommes de
 * terre à parts égales n'est PAS une entrée — elle rendrait au repas le
 * féculent que le plan retire du plat. L'eau est hors du compte: une soupe en
 * est faite à moitié, et elle ne dit rien de ce qui la compose.
 */
export const SIDE_COURSE_PREP_MIN_VEG_SHARE = 0.5;

/**
 * LE REGISTRE TEL QUE LE MOTEUR LE REND: le registre du socle, plus ce qui
 * était PRÉVU par moment.
 *
 * ⛔ `plannedKcalByKey` EXISTE POUR LES À-CÔTÉS PERDUS. Un à-côté `dropped`
 * n'a pas d'entrée servie; sans le prévu, `snapDeltaKcal` ne pourrait pas
 * rendre son énergie au plat, et le moment perdrait ses calories en silence.
 */
export interface SideCourseEngineLedger extends SideCourseLedger {
  /** Clé `sideCourseKey` → Σ des kcal demandées pour ce moment. */
  plannedKcalByKey: ReadonlyMap<string, number>;
  /**
   * ⟳ 2026-09-23 — LA TABLE ET LA SEMAINE, COMPTÉES SANS RIEN RÉPARER. Recopié
   * sous `generated_from.household.side_courses.variety`.
   */
  variety: SideCourseVarietyCounters;
}

/**
 * ⟳ 2026-09-23 — CE QUE LE MODÈLE A FAIT DE LA RÈGLE DES FAMILLES.
 *
 * Mesuré sur la campagne du 2026-09-23: Thomas avait « emmental 35 g + 2
 * pommes » à 10 repas sur 10, Christèle l'emmental 9 fois sur 10. La consigne
 * (`sideCoursesBlock`) demande désormais UN aliment par type pour toute la
 * table, et deux jours de suite au plus. Ces compteurs disent si le modèle
 * suit — et, s'il ne suit pas, où le moteur devra intervenir. Ils ne changent
 * AUCUN à-côté.
 *
 * ⛔ TOUS PRÉSENTS, MÊME À ZÉRO. Aucun `member_id`, aucune clé par personne.
 *
 * L'ALIMENT D'UNE ENTRÉE (`sideFoodIdentity`): son slug; sinon sa casserole;
 * sinon le slug que le résolveur donne à son terme; sinon le terme lui-même.
 * Jamais de comparaison de texte maison (« laitue » ≠ « lait »).
 */
export interface SideCourseTableCounters {
  /** Les (jour, moment, type) où au moins deux personnes ont ce type d'à-côté. */
  family_meals: number;
  /** …parmi eux, ceux où tous ont le même aliment. */
  family_shared: number;
  /**
   * …parmi les NON partagés, ceux dont l'écart est permis: un aliment servi à
   * ce repas que CHAQUE personne qui ne l'a pas ne pouvait pas manger (le juge
   * du moment — exclusions et régime — ou une allergie le refuserait).
   */
  family_split_allowed: number;
  /**
   * Chaque jour où un même aliment revient pour une même personne et un même
   * type au-delà du deuxième jour de suite (ordre de la fenêtre, `dayIndex`):
   * trois jours de pommes = 1, quatre jours = 2.
   * ⟳ 2026-09-23 (v40) — LE PAIN N'Y EST PAS: le même pain toute la semaine
   * est normal, et la consigne le dit (« bread may stay the same all week »).
   */
  streak_over_2: number;
  /** Le nombre d'aliments différents par type, sur toute la fenêtre. */
  distinct_by_kind: Record<SideCourseKind, number>;
}

/**
 * Les compteurs de la table, plus ceux de la limite d'un gros fruit par
 * dessert, et (⟳ 2026-09-23, v40) ceux du nom qui décide et du manque
 * regrossi.
 *
 * ⛔ TOUS PRÉSENTS, MÊME À ZÉRO. Des sommes, jamais une clé par personne.
 */
export interface SideCourseVarietyCounters extends SideCourseTableCounters {
  /** Les desserts ramenés à UNE grosse unité (`SideCourseGrams.unitCapped`). */
  fruit_capped: number;
  /**
   * Σ (prévu − servi) de ces desserts, en kcal, AVANT la croissance des autres
   * à-côtés: ce qu'ils laissent au repas. ⟳ 2026-09-23 (v40) — une part peut
   * aller au pain ou au fromage (`deficit_regrown_kcal`), le reste au plat.
   * ⛔ SANS les personnes de `kcalWithheldMemberIds` (plancher TCA): sur un
   * foyer d'une personne, une somme est le chiffre de cette personne.
   */
  fruit_capped_kcal: number;
  /** Les desserts plafonnés dont les kcal ne sont PAS sommées (plancher TCA). */
  fruit_capped_kcal_withheld: number;
  /**
   * ⟳ 2026-09-23 (v40) — LES ENTRÉES DU MODÈLE DONT LE TERME A PRIS LA MAIN
   * SUR L'IDENTIFIANT (`refNamedByTerm`): « banane » écrit avec `ref: "fruit"`
   * est servie `banana`. Comptée à la lecture, qu'elle soit ensuite retenue
   * ou refusée par une autre porte.
   */
  ref_replaced_by_term: number;
  /**
   * ⟳ 2026-09-23 (v40) — Σ des kcal ajoutées au pain et au fromage déjà servis
   * pour combler le manque d'un repas (`SIDE_COURSE_REGROW_ORDER`). ⚠️ Un
   * arrondi peut porter un peu plus que le manque: le plat rend alors
   * l'excédent, comme pour tout arrondi (`snapDeltaKcal` négatif).
   * ⛔ Sans les personnes sous plancher TCA.
   */
  deficit_regrown_kcal: number;
  /**
   * ⟳ 2026-09-23 (v40) — Σ du manque qui reste au plat après croissance, sur
   * les repas où il en restait (perte, mineur, ou pain et fromage à leur
   * plafond). C'est la part positive de `snapDeltaKcal` de ces repas.
   * ⛔ Sans les personnes sous plancher TCA.
   */
  deficit_to_dish_kcal: number;
  /** ⟳ 2026-09-23 (v40) — les à-côtés regrossis (un pain et un fromage du même repas = 2). */
  regrown_entries: number;
  /** ⟳ 2026-09-23 (v40) — les repas avec un manque dont les kcal ne sont PAS sommées (plancher TCA). */
  deficit_kcal_withheld: number;
  /**
   * ⟳ 2026-09-24 — LE MANQUE VENU DE LA BORNE D'ASSIETTE (`extraDeficitByKey`):
   * ce que le rabotage a retiré au plat, rendu aux à-côtés.
   *
   *   `boundary_meals`         les repas qui avaient un tel manque (tous,
   *                            plancher TCA compris: c'est un nombre de repas);
   *   `boundary_deficit_kcal`  Σ de ce manque — le dénominateur des deux
   *                            suivants: `regrown + lost = deficit`, à
   *                            l'arrondi des grammes près;
   *   `boundary_regrown_kcal`  Σ de ce que le pain et le fromage déjà servis,
   *                            et le pain ajouté, en ont repris;
   *   `boundary_bread_added`   les pains AJOUTÉS à un repas qui n'en avait pas;
   *   `boundary_lost_kcal`     Σ de ce qui n'a trouvé aucune place (perte,
   *                            mineur, pain refusé, plafonds atteints, repas
   *                            sans à-côté): cette énergie n'est plus servie;
   *   `boundary_kcal_withheld` les repas d'une personne sous plancher TCA dont
   *                            ces kcal ne sont PAS sommées.
   *
   * ⛔ Des sommes, jamais une clé par personne.
   */
  boundary_meals: number;
  boundary_deficit_kcal: number;
  boundary_regrown_kcal: number;
  boundary_bread_added: number;
  boundary_lost_kcal: number;
  boundary_kcal_withheld: number;
}

/** L'aliment d'une entrée servie, pour comparer deux entrées entre elles. */
function sideFoodIdentity(e: SideCourseServed, index: CompositionIndex | null): string {
  const ref = String(e.ref ?? "").trim();
  if (ref !== "") return `ref:${ref}`;
  const prep = String(e.preparationId ?? "").trim();
  if (prep !== "") return `prep:${prep}`;
  const slug = resolveCompositionLine(index, { term: e.term, ref: null }).ref?.slug ?? null;
  return slug !== null ? `ref:${slug}` : `term:${String(e.term ?? "").trim()}`;
}

/**
 * ⟳ 2026-09-23 — LES COMPTEURS DE LA TABLE ET DE LA SEMAINE, SUR UN REGISTRE.
 *
 * « Ne pouvait pas manger » passe par les mêmes portes que le registre: le juge
 * du moment (`judgeBySlot`: exclusions, règles de maison, régime), puis les
 * allergies (`foodBite`). Une entrée préparée est jugée sur son nom ET sur
 * chaque ingrédient de sa casserole, comme au registre.
 *
 * ⚠️ UNE ENTRÉE DONT LE JOUR N'A PAS D'INDICE (`dayIndexByToken`) n'entre pas
 * dans les séries. Au registre, chaque entrée vient d'une demande, qui en a un.
 */
export function sideCourseTableCounters(args: {
  entries: readonly SideCourseServed[];
  /** `dayToken` → indice du jour dans la fenêtre (celui des demandes). */
  dayIndexByToken: ReadonlyMap<string, number>;
  index: CompositionIndex | null;
  preparations: readonly SideCoursePreparation[];
  judgeBySlot: Readonly<Record<SideCourseSlot, SideTermJudge>>;
  allergens: readonly StudentSafetyConstraint[];
}): SideCourseTableCounters {
  const prepById = new Map(args.preparations.map((p) => [p.id, p] as const));
  const identity = (e: SideCourseServed) => sideFoodIdentity(e, args.index);
  const cannotEat = (memberId: string, slot: SideCourseSlot, food: SideCourseServed): boolean => {
    const prep = food.preparationId === null ? undefined : prepById.get(food.preparationId);
    const judged = [
      { term: food.term, ref: food.ref },
      ...(prep?.ingredients ?? []).map((ing) => ({ term: ing.term, ref: ing.ref })),
    ];
    for (const j of judged) {
      if (!args.judgeBySlot[slot]({ memberId, term: j.term, ref: j.ref }).ok) return true;
    }
    const ref = food.ref === null ? null : args.index?.bySlug.get(food.ref) ?? null;
    const surfaces = prep === undefined
      ? [{ terms: [food.term, ref?.label ?? ""], group: ref?.foodGroupRef ?? null }]
      : prep.ingredients.map((ing) => ({
        terms: [ing.term, prep.title, food.term],
        group: resolveCompositionLine(args.index, ing).ref?.foodGroupRef ?? ing.group ?? null,
      }));
    return surfaces.some((s) =>
      foodBite({
        terms: s.terms,
        group: s.group,
        exclusionTerms: [],
        regime: null,
        allergens: args.allergens,
        slot,
      }) !== null
    );
  };

  const out: SideCourseTableCounters = {
    family_meals: 0,
    family_shared: 0,
    family_split_allowed: 0,
    streak_over_2: 0,
    distinct_by_kind: Object.fromEntries(SIDE_COURSE_KINDS.map((k) => [k, 0])) as Record<
      SideCourseKind,
      number
    >,
  };

  // ── La table: un repas × un type ──────────────────────────────────────
  const tables = new Map<string, SideCourseServed[]>();
  for (const e of args.entries) {
    const key = `${e.dayToken}|${e.slot}|${e.kind}`;
    const list = tables.get(key) ?? [];
    list.push(e);
    tables.set(key, list);
  }
  for (const list of tables.values()) {
    if (new Set(list.map((e) => e.memberId)).size < 2) continue;
    out.family_meals += 1;
    const ids = list.map(identity);
    const foods = [...new Set(ids)];
    if (foods.length === 1) {
      out.family_shared += 1;
      continue;
    }
    const allowed = foods.some((food) => {
      const served = list[ids.indexOf(food)];
      return list.every((e, i) => ids[i] === food || cannotEat(e.memberId, e.slot, served));
    });
    if (allowed) out.family_split_allowed += 1;
  }

  // ── La semaine: les séries et les aliments distincts ─────────────────
  const daysOf = new Map<string, Set<number>>();
  const distinct = new Map<SideCourseKind, Set<string>>();
  for (const e of args.entries) {
    const food = identity(e);
    const kinds = distinct.get(e.kind) ?? new Set<string>();
    kinds.add(food);
    distinct.set(e.kind, kinds);
    const d = args.dayIndexByToken.get(e.dayToken);
    if (d === undefined) continue;
    // ⟳ 2026-09-23 (v40) — le pain peut rester le même toute la semaine: il
    // n'entre pas dans les séries (il reste compté dans `distinct_by_kind`).
    if (e.kind === "bread") continue;
    const key = `${e.memberId}|${e.kind}|${food}`;
    const days = daysOf.get(key) ?? new Set<number>();
    days.add(d);
    daysOf.set(key, days);
  }
  for (const days of daysOf.values()) {
    let run = 0;
    let prev = Number.NaN;
    for (const d of [...days].sort((a, b) => a - b)) {
      run = d === prev + 1 ? run + 1 : 1;
      if (run > 2) out.streak_over_2 += 1;
      prev = d;
    }
  }
  for (const k of SIDE_COURSE_KINDS) out.distinct_by_kind[k] = distinct.get(k)?.size ?? 0;
  return out;
}

/** Ce que le registre lit d'un plat: les casseroles qu'il tire (pour « tirée par aucun plat »). */
export interface SideCourseDrawingDish {
  uses: readonly { preparationId: string }[];
  boxes: readonly { items: readonly { preparationId: string | null }[] }[];
}

/** Une casserole que le registre peut juger: son id, son titre, ses ingrédients. */
export type SideCoursePreparation = Pick<MealPreparation, "id" | "title" | "ingredients">;

/** Un compteur de refus où les neuf motifs sont présents, même à zéro. */
function emptyRefusals(): Record<SideCourseRefusal, number> {
  const out = {} as Record<SideCourseRefusal, number>;
  for (const r of SIDE_COURSE_REFUSALS) out[r] = 0;
  return out;
}

/** L'énergie et la protéine d'une casserole, pour 100 g PRÊTS. `null` = non pesable. */
function preparationDensity(
  prep: SideCoursePreparation,
  index: CompositionIndex | null,
): { kcalPer100g: number; proteinPer100g: number | null } | null {
  const ready = preparationReadyGrams(prep.ingredients, index);
  const kcal = preparationReadyKcal(prep.ingredients, index);
  if (ready === null || kcal === null || !(ready > 0) || !(kcal > 0)) return null;
  let protein = 0;
  let known = true;
  for (const ing of prep.ingredients) {
    const ref = resolveCompositionLine(index, ing).ref;
    if (ref === null || ing.gramsRaw === null) return null;
    if (ref.proteinG === null) known = false;
    else protein += (ing.gramsRaw * ref.proteinG) / 100;
  }
  return {
    kcalPer100g: (kcal / ready) * 100,
    proteinPer100g: known ? (protein / ready) * 100 : null,
  };
}

/** La part de légumes (groupes de l'entrée) d'une casserole, eau exclue. `null` = illisible. */
function vegetableShare(
  prep: SideCoursePreparation,
  index: CompositionIndex | null,
  groups: readonly FoodGroupRef[],
): number | null {
  let veg = 0;
  let total = 0;
  for (const ing of prep.ingredients) {
    const ref = resolveCompositionLine(index, ing).ref;
    if (ref === null || ing.gramsRaw === null) return null;
    if (ref.foodGroupRef === "water") continue;
    total += ing.gramsRaw;
    if (groups.includes(ref.foodGroupRef)) veg += ing.gramsRaw;
  }
  return total > 0 ? veg / total : null;
}

/**
 * ⟳ 2026-09-23 (v40) — LE NOM DÉCIDE QUAND IL DÉSIGNE UN ALIMENT PRÉCIS.
 *
 * Mesuré sur cinq générations v39: le modèle écrit `term: "banane"` avec
 * `ref: "fruit"` — un slug générique (« Fruit (average) »), sans poids à
 * l'unité. Le moteur pesait 300 g de « fruit » (la borne haute), et l'écran
 * affichait « banane 300 g ». L'écran lit le TERME: l'énergie doit être celle
 * du terme.
 *
 * Le terme est résolu SEUL (`resolveCompositionLine`, sans identifiant). Il
 * gagne si et seulement si son slug est servable (au référentiel, composable,
 * avec une énergie), admis pour ce type et cet objectif
 * (`SIDE_COURSE_KIND_GROUPS`), et différent de l'identifiant écrit. Sinon
 * (terme qui ne se résout pas, groupe non admis, même slug, aucun
 * identifiant écrit) → `null`, et l'identifiant du modèle garde la main, comme
 * avant.
 *
 * ⚠️ LE SLUG DU TERME PASSE ENSUITE TOUTES LES PORTES (`weighRef`): juge du
 * moment, allergies, budget laitier, plafond du type. Un terme exclu est
 * refusé — c'est lui que l'écran aurait montré.
 * ⛔ AUCUN MATCHER MAISON: seul le résolveur compare les mots.
 */
function refNamedByTerm(args: {
  index: CompositionIndex | null;
  term: string;
  writtenRef: string | null;
  kind: SideCourseKind;
  goal: SideCourseGoal;
}): CompositionRef | null {
  const written = String(args.writtenRef ?? "").trim();
  if (args.term === "" || written === "") return null;
  const byTerm = resolveCompositionLine(args.index, { term: args.term, ref: null }).ref;
  if (byTerm === null || byTerm.slug === written) return null;
  if (servableRef(args.index, byTerm.slug) === null) return null;
  if (!SIDE_COURSE_KIND_GROUPS[args.kind][args.goal].includes(byTerm.foodGroupRef)) return null;
  return byTerm;
}

/** Un à-côté pesé et prêt à servir, ou le motif de son refus. */
type Candidate =
  | {
    ok: true;
    served: SideCourseServed;
    group: FoodGroupRef | null;
    slug: string | null;
    /** ⟳ 2026-09-23 — la limite d'un gros fruit par dessert a retiré une unité. */
    unitCapped: boolean;
  }
  | { ok: false; reason: SideCourseRefusal };

/**
 * LE REGISTRE DES À-CÔTÉS D'UNE GÉNÉRATION.
 *
 * ── LES ENTRÉES DU MODÈLE, DANS L'ORDRE OÙ IL LES A ÉCRITES ───────────────
 * Chacune passe les portes dans cet ordre, et la première qui refuse donne le
 * motif (un seul motif par entrée):
 *   `unknown_member` — `member_id` hors de `memberIds`;
 *   `not_asked`      — jour, moment ou type que le moteur n'a pas demandés à
 *                      cette personne (un moment ou un type hors vocabulaire
 *                      en est un cas);
 *   `duplicate`      — ce type de ce moment est DÉJÀ servi par une entrée
 *                      valide: la première valide gagne;
 *   `bad_preparation`— `preparation_id` donné, mais la casserole n'existe pas,
 *                      n'est pas une entrée, est tirée par un plat, n'est dans
 *                      aucune session, est cuite après le repas ou plus de
 *                      `MAX_FRIDGE_DAYS` jours avant, n'est pas pesable, ou
 *                      n'est pas à majorité de légumes;
 *   `unresolved`     — le terme / l'identifiant ne se résout pas
 *                      (`resolveCompositionLine`), ou la référence n'est pas
 *                      composable, ou n'a pas d'énergie;
 *   `wrong_kind`     — le groupe n'est pas admis pour ce type et cet objectif
 *                      (`SIDE_COURSE_KIND_GROUPS`), OU la plus petite portion
 *                      servable dépasse le plafond du type. ⚠️ Le second cas
 *                      est celui du `cheesecake`, rangé `dairy_yogurt` à
 *                      330 kcal/100 g: 80 g (borne basse du dessert) font
 *                      264 kcal > 250. Le groupe seul ne suffisait pas;
 *   `excluded`/`regime` — le juge du moment (`judgeBySlot`, flux G), ou
 *                      une allergie bloquante (`allergens`, comptée `excluded`);
 *   `dairy_budget`   — un second dessert laitier (`dairy_yogurt`) le même
 *                      jour pour la même personne.
 *
 * ── PUIS LE SECOURS, DANS L'ORDRE DES DEMANDES ────────────────────────────
 * Chaque type demandé et non servi reçoit un aliment de
 * `SIDE_COURSE_FALLBACK_SLUGS[kind][goal]`, à partir du rang
 * `(dayIndex + memberIndex) mod n`. Trois passes: d'abord un aliment ni servi
 * à cette personne ce jour-là ni la veille, puis ni ce jour-là, puis n'importe
 * lequel. Les portes sont les mêmes (juge, allergie, budget laitier, plafond
 * du type). Rien ne passe ⇒ `dropped`, et son énergie revient au plat
 * (`snapDeltaKcal`).
 *
 * ⚠️ LE MOT D'UN SECOURS VIENT DE `SIDE_COURSE_FALLBACK_TERMS[slug][language]`
 * — jamais du libellé du référentiel, qui est anglais. C'est le slug qui pèse.
 *
 * ── ⟳ 2026-09-23 (v40) · LE NOM D'ABORD, LE MANQUE ENSUITE ────────────────
 * · Avant les portes, le TERME d'une entrée du modèle prend la main sur son
 *   identifiant quand il désigne un aliment précis et admis
 *   (`refNamedByTerm`; compté `variety.ref_replaced_by_term`).
 * · Après le secours, le manque de chaque repas (prévu − servi) fait grossir
 *   le pain et le fromage déjà servis, selon l'objectif
 *   (`SIDE_COURSE_REGROW_ORDER`); le reste va au plat (`snapDeltaKcal`).
 *   Compté `variety.deficit_regrown_kcal`, `deficit_to_dish_kcal`,
 *   `regrown_entries`.
 * · ⟳ 2026-09-24 — Puis ce que la borne d'assiette a retiré au plat
 *   (`extraDeficitByKey`): même croissance, sous la part maximale des
 *   à-côtés dans le repas (`mealKcalByKey`); sans pain servi, un pain est
 *   AJOUTÉ (maintien et prise seulement, `breadAllowed`); le reste est perdu.
 *   Compté `variety.boundary_*`. ⚠️ Un pain ajouté n'était pas demandé: il
 *   n'entre dans aucun compteur du modèle (`asked`, `filled_by_engine`).
 *
 * ⛔ INVARIANT DES COMPTEURS: `valid + filled_by_engine + dropped = asked`, et
 * `refused = Σ refused_by`. Une allocation à 0 kcal ou moins n'est pas une
 * demande (l'intégrateur la filtre avant la consigne).
 *
 * ⟳ 2026-09-23 — `variety`: la table et la semaine (`sideCourseTableCounters`)
 * sur les entrées servies, et les desserts ramenés à une grosse unité, comptés
 * à l'acceptation. Rien n'y répare: un aliment répété reste servi.
 */
export function buildSideCourseLedger(args: {
  raw: readonly RawSideCourse[];
  asks: readonly SideCourseAsk[];
  /** Les personnes du foyer, dans l'ordre stable du foyer: le rang fait tourner le secours. */
  memberIds: readonly string[];
  index: CompositionIndex | null;
  preparations: readonly SideCoursePreparation[];
  /** Les plats du plan: une casserole qu'un plat tire n'est pas une entrée. */
  dishes: readonly SideCourseDrawingDish[];
  /** Id de casserole → indice (dans la fenêtre) du jour de sa PREMIÈRE session de cuisine. */
  sessionDayIndexByPrep: ReadonlyMap<string, number>;
  /**
   * ⛔ UN JUGE PAR MOMENT, JAMAIS UN SEUL. `SideTermJudge` (socle) ne reçoit
   * pas de moment; le flux G fabrique donc un juge par moment
   * (`judgeSideTerm({ …, slot })`, `engine_box_belt.ts`). Un juge unique
   * aurait appliqué « pas de fromage le soir » au fromage du midi — ou pas du
   * tout au dîner.
   */
  judgeBySlot: Readonly<Record<SideCourseSlot, SideTermJudge>>;
  /** Les contraintes de sécurité (allergies) — l'union du foyer, comme pour les casseroles. */
  allergens: readonly StudentSafetyConstraint[];
  language: SideCourseLanguage;
  /**
   * ⟳ 2026-09-23 — LES PERSONNES SOUS PLANCHER TCA: leurs kcal n'entrent dans
   * aucune somme de `variety` (`fruit_capped_kcal`); elles sont comptées à
   * part (`fruit_capped_kcal_withheld`).
   */
  kcalWithheldMemberIds: ReadonlySet<string>;
  /**
   * ⟳ 2026-09-24 — CE QUE LA BORNE D'ASSIETTE A RETIRÉ AU PLAT, par repas
   * (kcal), clé `sideCourseKey`: le rabotage (`fitPortionsToBounds`,
   * `shavedByMeal`) et, pour une personne seule, la coupe du dimensionnement
   * (`clampToBounds`). Le bloc ③ bis le rend au pain et au fromage.
   *
   * ⛔ REQUIS, jamais `?`: c'est la casse de compilation qui recense les
   * appelants. `new Map()` quand rien n'a été raboté — c'est le cas de chaque
   * premier passage d'un tour de réparation.
   */
  extraDeficitByKey: ReadonlyMap<string, number>;
  /**
   * ⟳ 2026-09-24 — LE PAIN PEUT-IL ÊTRE AJOUTÉ À CETTE PERSONNE, À CE
   * MOMENT ? L'appelant y met son réglage (`bread: false` ⇒ non), ce
   * qu'aucun pain de secours ne peut servir (`impossibleKindsFor`) et le
   * moment léger (un seul à-côté). ⛔ REQUIS: sans lui, un pain ajouté
   * contournerait un refus.
   */
  breadAllowed: (memberId: string, slot: SideCourseSlot) => boolean;
  /**
   * ⟳ 2026-09-24 — L'ÉNERGIE DU REPAS ENTIER (plat + à-côtés du contrat), clé
   * `sideCourseKey`. Elle borne les à-côtés quand ils grossissent AU-DELÀ du
   * prévu: jamais plus que `SIDE_COURSE_MAX_MEAL_SHARE` du repas (sinon ce
   * n'est plus un à-côté, c'est un second plat). Une clé absente ⇒ aucune
   * place au-delà du prévu.
   */
  mealKcalByKey: ReadonlyMap<string, number>;
}): SideCourseEngineLedger {
  const memberIndex = new Map<string, number>();
  args.memberIds.forEach((id, i) => {
    if (!memberIndex.has(id)) memberIndex.set(id, i);
  });

  // ── Les demandes, par moment ───────────────────────────────────────────
  type AskRow = {
    ask: SideCourseAsk;
    order: SideCourseKind[];
    planned: Map<SideCourseKind, number>;
  };
  const askByKey = new Map<string, AskRow>();
  for (const ask of args.asks) {
    if (!isSlot(ask.slot)) continue;
    const key = sideCourseKey(ask.memberId, ask.dayToken, ask.slot);
    let row = askByKey.get(key);
    if (row === undefined) {
      row = { ask, order: [], planned: new Map() };
      askByKey.set(key, row);
    }
    for (const c of ask.courses) {
      if (!isKind(c.kind) || !(c.kcal > 0)) continue;
      if (!row.planned.has(c.kind)) row.order.push(c.kind);
      row.planned.set(c.kind, (row.planned.get(c.kind) ?? 0) + c.kcal);
    }
  }
  const plannedKcalByKey = new Map<string, number>();
  let asked = 0;
  for (const [key, row] of askByKey) {
    asked += row.planned.size;
    plannedKcalByKey.set(key, [...row.planned.values()].reduce((s, k) => s + k, 0));
  }

  const counters: SideCourseModelCounters = {
    asked,
    declared: args.raw.length,
    valid: 0,
    refused: 0,
    refused_by: emptyRefusals(),
    filled_by_engine: 0,
    dropped: 0,
  };

  const prepById = new Map(args.preparations.map((p) => [p.id, p] as const));
  const drawnByDish = new Set<string>();
  for (const dish of args.dishes) {
    for (const u of dish.uses ?? []) if (u?.preparationId) drawnByDish.add(u.preparationId);
    for (const box of dish.boxes ?? []) {
      for (const it of box.items ?? []) if (it?.preparationId) drawnByDish.add(it.preparationId);
    }
  }

  const filled = new Map<string, SideCourseServed>();
  const dairyDays = new Set<string>();
  /** ⟳ 2026-09-23 — les desserts ramenés à une grosse unité, comptés à l'acceptation. */
  const fruit = { capped: 0, kcal: 0, withheld: 0 };
  /** ⟳ 2026-09-23 (v40) — le nom qui décide, et le manque regrossi. Des sommes. */
  const correction = {
    refReplaced: 0,
    regrownKcal: 0,
    toDishKcal: 0,
    regrownEntries: 0,
    withheld: 0,
  };
  /** `${memberId}|${dayIndex}` → les slugs servis ce jour-là. */
  const usedByDay = new Map<string, Set<string>>();
  const usedKey = (memberId: string, d: number) => `${memberId}|${d}`;

  // ── Les portes communes au modèle et au secours ───────────────────────
  const weighRef = (
    row: AskRow,
    kind: SideCourseKind,
    ref: CompositionRef,
    term: string,
    source: SideCourseServed["source"],
    /**
     * ⟳ 2026-09-24 — LES KCAL À PESER. Le prévu du type (`row.planned`) pour
     * une demande; ce que le pain AJOUTÉ doit porter au bloc ③ bis, qui n'a
     * rien de prévu. ⛔ Requis: le deviner ici pèserait un pain ajouté à zéro.
     */
    planned: number,
  ): Candidate => {
    const { ask } = row;
    const groups = SIDE_COURSE_KIND_GROUPS[kind][ask.goal];
    if (!groups.includes(ref.foodGroupRef)) return { ok: false, reason: "wrong_kind" };
    const g = sideGramsFor({
      kcal: planned,
      kind,
      kcalPer100g: ref.energyKcal,
      proteinPer100g: ref.proteinG,
      unitGrams: ref.unitGrams,
      group: ref.foodGroupRef,
    });
    if (g.kcal > SIDE_COURSE_KIND_MAX_KCAL[kind]) return { ok: false, reason: "wrong_kind" };
    const verdict = args.judgeBySlot[ask.slot]({ memberId: ask.memberId, term, ref: ref.slug });
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    if (
      foodBite({
        terms: [term, ref.label],
        group: ref.foodGroupRef,
        exclusionTerms: [],
        regime: null,
        allergens: args.allergens,
        slot: ask.slot,
      }) !== null
    ) {
      return { ok: false, reason: "excluded" };
    }
    if (
      kind === "dessert" && ref.foodGroupRef === "dairy_yogurt" &&
      dairyDays.has(sideCourseDayKey(ask.memberId, ask.dayToken))
    ) {
      return { ok: false, reason: "dairy_budget" };
    }
    return {
      ok: true,
      group: ref.foodGroupRef,
      slug: ref.slug,
      unitCapped: g.unitCapped,
      served: {
        memberId: ask.memberId,
        dayToken: ask.dayToken,
        slot: ask.slot,
        kind,
        term,
        ref: ref.slug,
        preparationId: null,
        grams: g.grams,
        unitCount: g.unitCount,
        plannedKcal: planned,
        kcal: g.kcal,
        proteinG: g.proteinG,
        source,
      },
    };
  };

  const weighPreparation = (
    row: AskRow,
    kind: SideCourseKind,
    prepId: string,
    term: string,
  ): Candidate => {
    const { ask } = row;
    const prep = prepById.get(prepId);
    // Une entrée préparée est une ENTRÉE: une casserole de dessert, de pain ou
    // de fromage n'a pas sa place ici.
    if (prep === undefined || kind !== "starter" || drawnByDish.has(prepId)) {
      return { ok: false, reason: "bad_preparation" };
    }
    const cookedAt = args.sessionDayIndexByPrep.get(prepId);
    const eatenAt = dayIndexOf(ask.dayIndex);
    if (
      cookedAt === undefined || !Number.isFinite(cookedAt) || cookedAt > eatenAt ||
      eatenAt - cookedAt > MAX_FRIDGE_DAYS
    ) {
      return { ok: false, reason: "bad_preparation" };
    }
    const density = preparationDensity(prep, args.index);
    const share = vegetableShare(prep, args.index, SIDE_COURSE_KIND_GROUPS.starter[ask.goal]);
    if (density === null || share === null || !(share > SIDE_COURSE_PREP_MIN_VEG_SHARE)) {
      return { ok: false, reason: "bad_preparation" };
    }
    const planned = row.planned.get(kind) ?? 0;
    const g = sideGramsFor({
      kcal: planned,
      kind,
      kcalPer100g: density.kcalPer100g,
      proteinPer100g: density.proteinPer100g,
      unitGrams: null,
      group: null,
    });
    if (g.kcal > SIDE_COURSE_KIND_MAX_KCAL[kind]) return { ok: false, reason: "wrong_kind" };
    // Le juge lit le nom de l'entrée ET chaque ingrédient de sa casserole: la
    // protéine d'une soupe vit dans la casserole, pas dans son nom.
    const judged = [
      { term, ref: null as string | null },
      ...prep.ingredients.map((ing) => ({ term: ing.term, ref: ing.ref })),
    ];
    for (const j of judged) {
      const verdict = args.judgeBySlot[ask.slot]({
        memberId: ask.memberId,
        term: j.term,
        ref: j.ref,
      });
      if (!verdict.ok) return { ok: false, reason: verdict.reason };
    }
    for (const ing of prep.ingredients) {
      const ref = resolveCompositionLine(args.index, ing).ref;
      if (
        foodBite({
          terms: [ing.term, prep.title, term],
          group: ref?.foodGroupRef ?? ing.group ?? null,
          exclusionTerms: [],
          regime: null,
          allergens: args.allergens,
          slot: ask.slot,
        }) !== null
      ) {
        return { ok: false, reason: "excluded" };
      }
    }
    return {
      ok: true,
      group: null,
      slug: null,
      unitCapped: false,
      served: {
        memberId: ask.memberId,
        dayToken: ask.dayToken,
        slot: ask.slot,
        kind,
        term,
        ref: null,
        preparationId: prepId,
        grams: g.grams,
        unitCount: null,
        plannedKcal: planned,
        kcal: g.kcal,
        proteinG: g.proteinG,
        source: "model",
      },
    };
  };

  const accept = (row: AskRow, kind: SideCourseKind, c: Extract<Candidate, { ok: true }>) => {
    const { ask } = row;
    filled.set(`${sideCourseKey(ask.memberId, ask.dayToken, ask.slot)}|${kind}`, c.served);
    if (kind === "dessert" && c.group === "dairy_yogurt") {
      dairyDays.add(sideCourseDayKey(ask.memberId, ask.dayToken));
    }
    if (c.unitCapped) {
      fruit.capped += 1;
      if (args.kcalWithheldMemberIds.has(ask.memberId)) fruit.withheld += 1;
      else fruit.kcal += c.served.plannedKcal - c.served.kcal;
    }
    const identity = c.slug ?? `prep:${c.served.preparationId}`;
    const k = usedKey(ask.memberId, dayIndexOf(ask.dayIndex));
    const set = usedByDay.get(k) ?? new Set<string>();
    set.add(identity);
    usedByDay.set(k, set);
  };

  const refuse = (reason: SideCourseRefusal) => {
    counters.refused_by[reason] += 1;
    counters.refused += 1;
  };

  // ── ① Les entrées du modèle ────────────────────────────────────────────
  for (const entry of args.raw) {
    const memberId = String(entry.member_id ?? "").trim();
    if (!memberIndex.has(memberId)) {
      refuse("unknown_member");
      continue;
    }
    const day = String(entry.day ?? "").trim().toLowerCase();
    const slot = String(entry.slot ?? "").trim().toLowerCase();
    const kind = String(entry.kind ?? "").trim().toLowerCase();
    const row = askByKey.get(sideCourseKey(memberId, day, slot));
    if (row === undefined || !isKind(kind) || !row.planned.has(kind)) {
      refuse("not_asked");
      continue;
    }
    if (filled.has(`${sideCourseKey(memberId, day, slot)}|${kind}`)) {
      refuse("duplicate");
      continue;
    }
    const term = String(entry.term ?? "").trim();
    let candidate: Candidate;
    if (entry.preparation_id) {
      candidate = term === ""
        ? { ok: false, reason: "bad_preparation" }
        : weighPreparation(row, kind, entry.preparation_id, term);
    } else {
      // ⟳ 2026-09-23 (v40) — le terme d'abord, quand il nomme un aliment précis.
      const named = refNamedByTerm({
        index: args.index,
        term,
        writtenRef: entry.ref,
        kind,
        goal: row.ask.goal,
      });
      if (named !== null) correction.refReplaced += 1;
      const ref = named ?? (term === "" && !entry.ref
        ? null
        : resolveCompositionLine(args.index, { term, ref: entry.ref }).ref);
      candidate = ref === null || !isComposable(ref) || !(ref.energyKcal > 0)
        ? { ok: false, reason: "unresolved" }
        : weighRef(row, kind, ref, term === "" ? ref.label : term, "model", row.planned.get(kind) ?? 0);
    }
    if (!candidate.ok) {
      refuse(candidate.reason);
      continue;
    }
    accept(row, kind, candidate);
    counters.valid += 1;
  }

  // ── ② Le secours, dans l'ordre des demandes ────────────────────────────
  const rows = [...askByKey.values()].sort((a, b) =>
    (dayIndexOf(a.ask.dayIndex) - dayIndexOf(b.ask.dayIndex)) ||
    (SIDE_COURSE_SLOTS.indexOf(a.ask.slot) - SIDE_COURSE_SLOTS.indexOf(b.ask.slot)) ||
    ((memberIndex.get(a.ask.memberId) ?? Number.MAX_SAFE_INTEGER) -
      (memberIndex.get(b.ask.memberId) ?? Number.MAX_SAFE_INTEGER))
  );
  for (const row of rows) {
    const { ask } = row;
    const key = sideCourseKey(ask.memberId, ask.dayToken, ask.slot);
    const d = dayIndexOf(ask.dayIndex);
    for (const kind of row.order) {
      if (filled.has(`${key}|${kind}`)) continue;
      const slugs = SIDE_COURSE_FALLBACK_SLUGS[kind][ask.goal];
      const n = slugs.length;
      const start = n === 0 ? 0 : (d + (memberIndex.get(ask.memberId) ?? 0)) % n;
      const today = usedByDay.get(usedKey(ask.memberId, d)) ?? new Set<string>();
      const yesterday = usedByDay.get(usedKey(ask.memberId, d - 1)) ?? new Set<string>();
      const passes: ((slug: string) => boolean)[] = [
        (s) => !today.has(s) && !yesterday.has(s),
        (s) => !today.has(s),
        () => true,
      ];
      let chosen: Extract<Candidate, { ok: true }> | null = null;
      for (const pass of passes) {
        for (let i = 0; i < n && chosen === null; i++) {
          const slug = slugs[(start + i) % n];
          if (!pass(slug)) continue;
          const ref = servableRef(args.index, slug);
          if (ref === null) continue;
          const word = SIDE_COURSE_FALLBACK_TERMS[slug]?.[args.language] ?? ref.label;
          const c = weighRef(row, kind, ref, word, "engine_fallback", row.planned.get(kind) ?? 0);
          if (c.ok) chosen = c;
        }
        if (chosen !== null) break;
      }
      if (chosen === null) {
        counters.dropped += 1;
        continue;
      }
      accept(row, kind, chosen);
      counters.filled_by_engine += 1;
    }
  }

  // ── ③ ⟳ 2026-09-23 (v40) · Le manque d'un repas, rendu au pain et au fromage ──
  // Après que CHAQUE à-côté du repas est servi (modèle et secours), et avant
  // tout `snapDeltaKcal`: ce que les à-côtés ne portent pas grossit les autres
  // à-côtés déjà servis, dans l'ordre de l'objectif (`SIDE_COURSE_REGROW_ORDER`),
  // chacun jusqu'au plafond de son type. Les grammes sont refaits par
  // `sideGramsFor` — unités, bornes, plafond et arrondi compris. Ce qui reste
  // va au plat: `snapDeltaKcal` relit le servi APRÈS croissance, donc rien
  // n'est compté deux fois.
  /**
   * Fait grossir l'à-côté DÉJÀ SERVI `slotKey` d'au plus `want` kcal, dans le
   * plafond de son type. Rend les kcal ajoutées (0 si rien n'a bougé).
   * ⟳ 2026-09-24 — sorti de la boucle pour servir aussi au bloc ③ bis, sans
   * seconde écriture de la même croissance.
   */
  const regrowServed = (slotKey: string, kind: SideCourseKind, want: number): number => {
    const e = filled.get(slotKey);
    // ⛔ Seul ce qui est déjà servi grossit ici (le pain ajouté est au ③ bis).
    if (e === undefined || e.ref === null) return 0;
    const ref = servableRef(args.index, e.ref);
    if (ref === null) return 0;
    const cap = SIDE_COURSE_KIND_MAX_KCAL[kind];
    const target = Math.min(cap, e.kcal + want);
    if (!(target > e.kcal)) return 0;
    const g = sideGramsFor({
      kcal: target,
      kind,
      kcalPer100g: ref.energyKcal,
      proteinPer100g: ref.proteinG,
      unitGrams: ref.unitGrams,
      group: ref.foodGroupRef,
    });
    // L'arrondi peut ne rien ajouter (une tranche de plus franchirait le
    // plafond): l'à-côté reste tel quel, et le manque passe au suivant.
    if (!(g.kcal > e.kcal) || g.kcal > cap) return 0;
    filled.set(slotKey, {
      ...e,
      grams: g.grams,
      unitCount: g.unitCount,
      kcal: g.kcal,
      proteinG: g.proteinG,
    });
    return g.kcal - e.kcal;
  };
  /**
   * ⟳ 2026-09-24 — LE PAIN AJOUTÉ À UN REPAS QUI N'EN A PAS: celui qu'une autre
   * personne a déjà à ce repas (la table mange le même pain), sinon la liste de
   * secours de l'objectif, dans son ordre. Chaque candidat passe les portes de
   * `weighRef` (groupe, plafond, juge du moment, allergies). `null` = aucun.
   * ⚠️ `plannedKcal: 0`: ce pain n'était pas prévu, et `snapDeltaKcal` lit le
   * prévu du repas sans lui.
   */
  const addedBreadFor = (row: AskRow, kcal: number): SideCourseServed | null => {
    const { ask } = row;
    const candidates: { slug: string; term: string }[] = [];
    for (const e of filled.values()) {
      if (e.kind !== "bread" || e.ref === null || e.memberId === ask.memberId) continue;
      if (e.dayToken !== ask.dayToken || e.slot !== ask.slot) continue;
      candidates.push({ slug: e.ref, term: e.term });
    }
    for (const slug of SIDE_COURSE_FALLBACK_SLUGS.bread[ask.goal]) {
      candidates.push({ slug, term: SIDE_COURSE_FALLBACK_TERMS[slug]?.[args.language] ?? "" });
    }
    for (const c of candidates) {
      const ref = servableRef(args.index, c.slug);
      if (ref === null) continue;
      const got = weighRef(
        row,
        "bread",
        ref,
        c.term === "" ? ref.label : c.term,
        "engine_fallback",
        kcal,
      );
      if (got.ok) return { ...got.served, plannedKcal: 0 };
    }
    return null;
  };
  /** ⟳ 2026-09-24 — le manque d'un repas venu de la borne d'assiette, lisible ou 0. */
  const boundaryDeficitOf = (key: string): number => {
    const v = args.extraDeficitByKey.get(key);
    return v !== undefined && Number.isFinite(v) && v > 0 ? v : 0;
  };
  /** ⟳ 2026-09-24 — les compteurs du bloc ③ bis. Des sommes. */
  const boundary = {
    meals: 0,
    deficitKcal: 0,
    regrownKcal: 0,
    breadAdded: 0,
    lostKcal: 0,
    withheld: 0,
  };
  /** Les repas du relevé qui ont une demande d'à-côté (traités au ③ bis). */
  const boundaryHandled = new Set<string>();
  for (const row of rows) {
    const { ask } = row;
    const key = sideCourseKey(ask.memberId, ask.dayToken, ask.slot);
    const withheld = args.kcalWithheldMemberIds.has(ask.memberId);
    const servedNow = () =>
      row.order.reduce((s, k) => s + (filled.get(`${key}|${k}`)?.kcal ?? 0), 0);
    let left = (plannedKcalByKey.get(key) ?? 0) - servedNow();
    if (left > 0) {
      for (const kind of SIDE_COURSE_REGROW_ORDER[ask.goal]) {
        if (!(left > 0)) break;
        const grown = regrowServed(`${key}|${kind}`, kind, left);
        if (!(grown > 0)) continue;
        left -= grown;
        correction.regrownEntries += 1;
        if (!withheld) correction.regrownKcal += grown;
      }
      if (withheld) correction.withheld += 1;
      else correction.toDishKcal += Math.max(0, left);
    }

    // ── ③ bis ⟳ 2026-09-24 · Le manque venu de la borne d'assiette ─────────
    // Le plat a été raboté à son plafond (ou coupé au dimensionnement chez une
    // personne seule): cette énergie n'est plus dans l'assiette. Elle va au
    // pain puis au fromage DÉJÀ servis (`SIDE_COURSE_REGROW_ORDER`), dans leurs
    // plafonds et sous la part maximale des à-côtés dans le repas; s'il n'y a
    // pas de pain, un pain est AJOUTÉ (pas en perte de poids, pas pour un
    // mineur, jamais contre un refus: `breadAllowed`). Ce qui reste est PERDU,
    // et compté.
    //
    // ⚠️ APRÈS le manque des à-côtés eux-mêmes (ci-dessus): celui-là était déjà
    // dans le plat au dimensionnement; ce qui arrive ici, c'est ce que le plat
    // a perdu depuis.
    const extra = boundaryDeficitOf(key);
    if (!(extra > 0)) continue;
    boundaryHandled.add(key);
    boundary.meals += 1;
    // La place des à-côtés: jamais moins que le prévu (le rendre n'est jamais
    // un second plat), jamais plus que la part maximale du repas au-delà.
    const shareCap = Math.max(
      plannedKcalByKey.get(key) ?? 0,
      SIDE_COURSE_MAX_MEAL_SHARE[ask.goal === "minor" ? "minor" : "adult"] *
        Math.max(0, args.mealKcalByKey.get(key) ?? 0),
    );
    let owed = extra;
    let moved = 0;
    for (const kind of SIDE_COURSE_REGROW_ORDER[ask.goal]) {
      const want = Math.min(owed, shareCap - servedNow());
      if (!(want > 0)) break;
      const grown = regrowServed(`${key}|${kind}`, kind, want);
      owed -= grown;
      moved += grown;
    }
    const breadKcal = Math.min(owed, shareCap - servedNow(), SIDE_COURSE_KIND_MAX_KCAL.bread);
    if (
      !filled.has(`${key}|bread`) &&
      ask.goal !== "fat_loss" && ask.goal !== "minor" &&
      // Sous 50 kcal, un pain posé sur la table est un bout de croûte (la
      // règle de `sideBudgetFor`, `SIDE_COURSE_MIN_ADDED_KCAL`).
      breadKcal >= SIDE_COURSE_MIN_ADDED_KCAL &&
      args.breadAllowed(ask.memberId, ask.slot)
    ) {
      const bread = addedBreadFor(row, breadKcal);
      if (bread !== null) {
        filled.set(`${key}|bread`, bread);
        if (!row.order.includes("bread")) row.order.push("bread");
        owed -= bread.kcal;
        moved += bread.kcal;
        boundary.breadAdded += 1;
      }
    }
    if (withheld) boundary.withheld += 1;
    else {
      boundary.deficitKcal += extra;
      boundary.regrownKcal += moved;
      boundary.lostKcal += Math.max(0, owed);
    }
  }
  // ⟳ 2026-09-24 — UN MANQUE SANS DEMANDE D'À-CÔTÉ (petit-déjeuner, collation,
  // repas où la personne refuse tout) n'a rien pour le reprendre: il est perdu,
  // et compté. La personne se lit sur la clé (`sideCourseKey` commence par
  // son identifiant), jamais sur un texte.
  for (const [key] of args.extraDeficitByKey) {
    const extra = boundaryDeficitOf(key);
    if (!(extra > 0) || boundaryHandled.has(key)) continue;
    boundary.meals += 1;
    const memberId = args.memberIds.find((id) => key.startsWith(`${id}|`)) ?? null;
    if (memberId !== null && args.kcalWithheldMemberIds.has(memberId)) boundary.withheld += 1;
    else {
      boundary.deficitKcal += extra;
      boundary.lostKcal += extra;
    }
  }

  // ── Le registre, dans l'ordre des demandes puis des types ──────────────
  const entries: SideCourseServed[] = [];
  const byKey = new Map<string, SideCourseServed[]>();
  for (const row of rows) {
    const key = sideCourseKey(row.ask.memberId, row.ask.dayToken, row.ask.slot);
    for (const kind of row.order) {
      const served = filled.get(`${key}|${kind}`);
      if (served === undefined) continue;
      entries.push(served);
      const list = byKey.get(key) ?? [];
      list.push(served);
      byKey.set(key, list);
    }
  }
  // ── ⟳ 2026-09-23 · La table et la semaine, sans rien réparer ─────────
  const dayIndexByToken = new Map<string, number>();
  for (const row of rows) {
    if (!dayIndexByToken.has(row.ask.dayToken)) {
      dayIndexByToken.set(row.ask.dayToken, dayIndexOf(row.ask.dayIndex));
    }
  }
  const variety: SideCourseVarietyCounters = {
    ...sideCourseTableCounters({
      entries,
      dayIndexByToken,
      index: args.index,
      preparations: args.preparations,
      judgeBySlot: args.judgeBySlot,
      allergens: args.allergens,
    }),
    fruit_capped: fruit.capped,
    fruit_capped_kcal: fruit.kcal,
    fruit_capped_kcal_withheld: fruit.withheld,
    ref_replaced_by_term: correction.refReplaced,
    deficit_regrown_kcal: correction.regrownKcal,
    deficit_to_dish_kcal: correction.toDishKcal,
    regrown_entries: correction.regrownEntries,
    deficit_kcal_withheld: correction.withheld,
    boundary_meals: boundary.meals,
    boundary_deficit_kcal: boundary.deficitKcal,
    boundary_regrown_kcal: boundary.regrownKcal,
    boundary_bread_added: boundary.breadAdded,
    boundary_lost_kcal: boundary.lostKcal,
    boundary_kcal_withheld: boundary.withheld,
  };
  return { entries, byKey, counters, plannedKcalByKey, variety };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'ÉCART RENDU AU PLAT — snapDeltaKcal
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PRÉVU − SERVI, POUR UN MOMENT D'UNE PERSONNE (kcal).
 *
 * Positif: les grammes arrondis ou bornés portent MOINS que prévu, ou un
 * à-côté est perdu (`dropped`) — le plat reçoit l'écart. Négatif: ils portent
 * plus, le plat le rend. L'intégrateur l'ajoute à la cible du plat
 * (`composeKcal + snapDeltaKcal`), pour que Σ plat + Σ à-côtés = le moment.
 *
 * ⟳ 2026-09-23 (v40) — le servi est lu APRÈS la croissance du pain et du
 * fromage (`SIDE_COURSE_REGROW_ORDER`): ce qu'ils ont repris n'arrive pas au
 * plat, et rien n'est compté deux fois.
 *
 * Un moment sans demande rend 0.
 */
export function snapDeltaKcal(
  ledger: SideCourseEngineLedger,
  memberId: string,
  dayToken: string,
  slot: string,
): number {
  const key = sideCourseKey(memberId, dayToken, slot);
  const planned = ledger.plannedKcalByKey.get(key) ?? 0;
  const served = (ledger.byKey.get(key) ?? []).reduce((s, e) => s + e.kcal, 0);
  return planned - served;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LES ADAPTATEURS
// ═══════════════════════════════════════════════════════════════════════════

/** Ce qu'`attachSideCourses` a fait — tous présents, même à zéro. */
export interface SideCourseAttachCounters {
  /** Les à-côtés servis du registre. */
  entries: number;
  /** Rattachés à un plat hôte (Σ des quatre voies ci-dessous). */
  attached: number;
  /** …par la boîte de la personne seule. */
  own_box: number;
  /** …par un bac commun qui la porte. */
  shared_box: number;
  /** …par un plat qui lui est attribué (`member_id`), sans boîte qui la nomme. */
  member_dish: number;
  /** …par un plat de la table sans aucune boîte (servi à tout le monde). */
  table_dish: number;
  /** Aucun plat de ce jour à ce moment ne la sert: l'à-côté n'est PAS écrit. */
  no_host: number;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Les `member_ids` d'une boîte du payload, ou `[]`. */
function boxMembers(box: unknown): string[] {
  if (box === null || typeof box !== "object") return [];
  const ids = (box as Record<string, unknown>).member_ids;
  return Array.isArray(ids) ? ids.map((x) => String(x ?? "").trim()) : [];
}

/**
 * RATTACHE CHAQUE À-CÔTÉ SERVI AU PLAT QUI SERT LA PERSONNE CE JOUR À CE
 * MOMENT, sous `dishes[i].side_courses[]` (`DishSideCoursePayload`).
 *
 * LE PLAT HÔTE, par ordre de préférence (le premier plat trouvé dans chaque
 * voie gagne):
 *   ① une boîte qui porte la personne SEULE;
 *   ② un bac commun qui la porte;
 *   ③ un plat qui lui est attribué (`member_id`);
 *   ④ un plat de la table sans aucune boîte (servi implicitement à tous).
 * Aucun ⇒ `no_host`, et l'à-côté n'est pas écrit.
 *
 * ⛔ IDEMPOTENT: la clé `side_courses` est RÉÉCRITE sur chaque hôte et
 * RETIRÉE des autres plats. Appeler deux fois, ou après une réparation qui a
 * déplacé les plats, rend le même payload qu'un seul appel sur l'état final —
 * jamais deux fois le même yaourt.
 *
 * ⚠️ UN PLAN SANS À-CÔTÉS N'A PAS LA CLÉ, et se lit comme avant (socle,
 * `DishSideCoursePayload`). Rend des copies; l'entrée n'est pas touchée.
 */
export function attachSideCourses(
  dishes: readonly Record<string, unknown>[],
  ledger: SideCourseLedger,
): { dishes: Record<string, unknown>[]; counters: SideCourseAttachCounters } {
  const out = dishes.map((d) => {
    const copy = { ...d };
    delete copy.side_courses;
    return copy;
  });
  const counters: SideCourseAttachCounters = {
    entries: ledger.entries.length,
    attached: 0,
    own_box: 0,
    shared_box: 0,
    member_dish: 0,
    table_dish: 0,
    no_host: 0,
  };
  const hosted = new Map<number, DishSideCoursePayload[]>();
  for (const e of ledger.entries) {
    const day = norm(e.dayToken);
    const slot = norm(e.slot);
    const here = out
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => norm(d.day) === day && norm(d.slot) === slot);
    const boxesOf = (d: Record<string, unknown>) => (Array.isArray(d.boxes) ? d.boxes : []);
    type Way = "own_box" | "shared_box" | "member_dish" | "table_dish";
    const ways: [Way, (d: Record<string, unknown>) => boolean][] = [
      ["own_box", (d) =>
        boxesOf(d).some((b) => {
          const m = boxMembers(b);
          return m.length === 1 && m[0] === e.memberId;
        })],
      ["shared_box", (d) => boxesOf(d).some((b) => boxMembers(b).includes(e.memberId))],
      ["member_dish", (d) => String(d.member_id ?? "").trim() === e.memberId],
      [
        "table_dish",
        (d) => (d.member_id === null || d.member_id === undefined) && boxesOf(d).length === 0,
      ],
    ];
    let host: { i: number; way: Way } | null = null;
    for (const [way, test] of ways) {
      const hit = here.find(({ d }) => test(d));
      if (hit) {
        host = { i: hit.i, way };
        break;
      }
    }
    if (host === null) {
      counters.no_host += 1;
      continue;
    }
    counters.attached += 1;
    counters[host.way] += 1;
    const list = hosted.get(host.i) ?? [];
    list.push({
      member_id: e.memberId,
      kind: e.kind,
      term: e.term,
      ref: e.ref,
      grams: e.grams,
      unit_count: e.unitCount,
      preparation_id: e.preparationId,
      source: e.source,
    });
    hosted.set(host.i, list);
  }
  for (const [i, list] of hosted) out[i].side_courses = list;
  return { dishes: out, counters };
}

/**
 * LES GRAMMES PRÊTS QUE LES À-CÔTÉS TIRENT DE CHAQUE CASSEROLE (soupe,
 * crudités préparées). Id de casserole → Σ des grammes servis.
 */
export function sideDrawsByPreparation(ledger: SideCourseLedger): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of ledger.entries) {
    if (e.preparationId === null) continue;
    out.set(e.preparationId, (out.get(e.preparationId) ?? 0) + e.grams);
  }
  return out;
}

/** Ce que `scaleSidePots` a fait — tous présents, même à zéro. */
export interface SidePotCounters {
  /** Les casseroles tirées par des à-côtés. */
  pots: number;
  /** Celles dont les ingrédients ont bougé. */
  scaled: number;
  /** Celles qu'on n'a pas su peser (laissées telles quelles). */
  unmeasured: number;
  /** Σ de ce qui manque encore aux casseroles après mise à l'échelle (g prêts). */
  shortfall_g: number;
}

/** Les ingrédients avec leurs grammes crus relus par le résolveur de production. */
function regrammed<T extends DishIngredient>(
  items: readonly T[],
  index: CompositionIndex | null,
): T[] {
  return items.map((ing) => ({ ...ing, gramsRaw: gramsRawForIngredient(index, ing) }));
}

/**
 * MET À L'ÉCHELLE LA CASSEROLE D'UNE ENTRÉE PRÉPARÉE SUR CE QUE LES À-CÔTÉS
 * EN TIRENT.
 *
 * ⛔ UNE CASSEROLE D'À-CÔTÉ N'EST TIRÉE PAR AUCUN PLAT (le registre l'a
 * vérifié), donc sa masse prête doit être EXACTEMENT la somme des parts: trop
 * de soupe est un achat jeté, pas assez est une part qui manque. Elle rétrécit
 * (`scaleIngredients`) ou grandit (`growIngredientsToReadyMass`, qui ferme la
 * boucle sur la mesure réelle); un rétrécissement qui, arrondi, passerait sous
 * les parts est regrandi.
 *
 * ⚠️ LE PLAFOND PAR INGRÉDIENT EST CELUI D'UNE CASSEROLE: `500 g × portions`,
 * comme la lane foyer (`MAX_SINGLE_INGREDIENT_G`). Les grammes crus sont relus
 * par `gramsRawForIngredient` — jamais recalculés ici. `servingsMade` n'est
 * pas touché.
 *
 * Rend des COPIES: l'intégrateur réaffecte `meal.preparations`.
 */
export function scaleSidePots(args: {
  preparations: readonly MealPreparation[];
  ledger: SideCourseLedger;
  index: CompositionIndex | null;
}): { preparations: MealPreparation[]; counters: SidePotCounters } {
  const draws = sideDrawsByPreparation(args.ledger);
  const counters: SidePotCounters = { pots: 0, scaled: 0, unmeasured: 0, shortfall_g: 0 };
  const measure = (items: readonly DishIngredient[]) =>
    preparationReadyGrams(regrammed(items, args.index), args.index);
  const preparations = args.preparations.map((prep) => {
    const drawn = draws.get(prep.id);
    if (drawn === undefined) return prep;
    counters.pots += 1;
    const ready = preparationReadyGrams(prep.ingredients, args.index);
    if (ready === null || !(ready > 0)) {
      counters.unmeasured += 1;
      return prep;
    }
    if (Math.abs(ready - drawn) < 1) return prep;
    // ⚠️ Un `servingsMade` illisible (NaN) vaut 1: un plafond NaN ne plafonne rien.
    const portions = Number.isFinite(prep.servingsMade) ? Math.max(1, prep.servingsMade) : 1;
    const maxSingle = MAX_SINGLE_INGREDIENT_G * portions;
    let items: DishIngredient[] = prep.ingredients;
    if (ready > drawn) {
      items = regrammed(
        scaleIngredients(prep.ingredients, drawn / ready, undefined, maxSingle).items,
        args.index,
      );
    }
    const after = measure(items);
    if (after === null || after < drawn) {
      items = regrammed(growIngredientsToReadyMass(items, drawn, measure).items, args.index);
    }
    const final = measure(items);
    counters.shortfall_g += final === null ? drawn : Math.max(0, drawn - final);
    counters.scaled += 1;
    return { ...prep, ingredients: items };
  });
  return { preparations, counters };
}

/** Une ligne de courses d'à-côté, dans la forme que `shoppingNeedsOf` lit. */
export interface SideShoppingIngredient {
  term: string;
  ref: string | null;
  amount: number;
  unit: Extract<CompositionUnit, "unit" | "g">;
  quantity: string;
  state: "raw";
}

/**
 * LES À-CÔTÉS EN PSEUDO-PLATS POUR LA LISTE DE COURSES: un par jour,
 * `{ day, ingredients }`, à passer dans `shoppingNeedsOf({ dishes: [...] })`.
 *
 * ⚠️ EN UNITÉS QUAND L'À-CÔTÉ SE COMPTE (« 3 pommes »), en grammes sinon:
 * `shoppingNeedsOf` garde l'unité commune d'une identité et retombe sur les
 * grammes crus dès qu'un plat écrit la même en grammes.
 *
 * ⛔ UNE ENTRÉE PRÉPARÉE N'Y EST PAS: ses ingrédients sont ceux de sa
 * casserole (`preparations`), déjà lus par `shoppingNeedsOf` — l'écrire ici
 * achèterait la soupe deux fois.
 */
export function sideShoppingLines(
  ledger: SideCourseLedger,
): { day: string; ingredients: SideShoppingIngredient[] }[] {
  const byDay = new Map<string, SideShoppingIngredient[]>();
  for (const e of ledger.entries) {
    if (e.preparationId !== null) continue;
    const line: SideShoppingIngredient = e.unitCount !== null
      ? {
        term: e.term,
        ref: e.ref,
        amount: e.unitCount,
        unit: "unit",
        quantity: `${e.unitCount}`,
        state: "raw",
      }
      : {
        term: e.term,
        ref: e.ref,
        amount: e.grams,
        unit: "g",
        quantity: `${e.grams} g`,
        state: "raw",
      };
    const list = byDay.get(e.dayToken) ?? [];
    list.push(line);
    byDay.set(e.dayToken, list);
  }
  return [...byDay].map(([day, ingredients]) => ({ day, ingredients }));
}

/**
 * L'ÉNERGIE ET LA PROTÉINE DES À-CÔTÉS SERVIS, PAR PERSONNE ET PAR JOUR.
 * Clé `sideCourseDayKey(memberId, dayToken)`.
 *
 * ⚠️ UNE PROTÉINE INCONNUE COMPTE ZÉRO, ET C'EST COMPTÉ (`proteinUnknown`).
 * Zéro est le côté prudent pour un plancher de protéines: il ne fait jamais
 * passer un jour qui n'est pas tenu.
 */
export function sideNutritionByMouthDay(
  ledger: SideCourseLedger,
): Map<string, { kcal: number; proteinG: number; proteinUnknown: number }> {
  const out = new Map<string, { kcal: number; proteinG: number; proteinUnknown: number }>();
  for (const e of ledger.entries) {
    const key = sideCourseDayKey(e.memberId, e.dayToken);
    const row = out.get(key) ?? { kcal: 0, proteinG: 0, proteinUnknown: 0 };
    row.kcal += e.kcal;
    if (e.proteinG === null) row.proteinUnknown += 1;
    else row.proteinG += e.proteinG;
    out.set(key, row);
  }
  return out;
}
