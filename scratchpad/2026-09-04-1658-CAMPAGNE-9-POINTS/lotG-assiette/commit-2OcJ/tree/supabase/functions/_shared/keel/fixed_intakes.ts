// FF-051 · LES APPORTS FIXES — ce qui est DÉJÀ MANGÉ.
//
// Fiche: docs/fonctionnalites/composition-des-repas/FF-051-les-apports-fixes.md
//
// ── CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS ────────────────────────────
// C'est le premier input du produit qui alimente le CALCUL et non la
// SÉLECTION. Tout le reste — allergies, régimes, préférences, absences — dit
// au moteur de choisir AUTREMENT. Un apport fixe lui dit qu'une partie de la
// journée est DÉJÀ COMPOSÉE, par quelqu'un d'autre que lui, et qu'il faut la
// compter.
//
// Ce n'est PAS le garde-manger (`pantry` dit ce qu'on a en stock), PAS une
// préférence (ça ne classe rien), PAS un interdit (ça ne verrouille rien).
// Ça OCCUPE.
//
// ── MODULE PUR ─────────────────────────────────────────────────────────────
// Aucun accès base, aucun `Deno.env`. Il reçoit du jsonb et rend des types.
// C'est ce qui rend les six branches testables sans fixture.

import { COMPOSITION_UNITS } from "./food_composition.ts";
import type {
  CompositionIndex,
  CompositionInput,
  CompositionUnit,
} from "./food_composition.ts";
import type { EatingOccasion, MealSlot } from "./meal_generation.ts";
// L4 — LE GROUPE VIENT DE LA DÉCLARATION, ET SON VOCABULAIRE EST CELUI DE
// TOUT LE RESTE. Ce module reste PUR: `declared_food_group.ts` ne fait aucune
// I/O et n'importe que `tokens.ts` et `food_group_write.ts`, tous deux purs.
import {
  declaredIntakeGroupOf,
  ungroupedFoodGroup,
} from "./declared_food_group.ts";
import type { FoodGroupRef } from "./tokens.ts";

/**
 * LES MOMENTS ET LES JOURS, RECOPIÉS PLUTÔT QU'IMPORTÉS.
 *
 * `meal_generation.ts` importe ce module (le paramètre requis de
 * `buildMealPrompt`), et un import de VALEUR en retour ferait un cycle qui
 * casse au CHARGEMENT — « Cannot access
 * before initialization », le défaut exact que `protein_anchor.ts` a déjà payé,
 * et que ce module a payé une seconde fois le 2026-08-11 (onze fichiers de
 * tests rouges au chargement, aucun sur une assertion). Les types, eux,
 * passent par `import type` et sont effacés à l'exécution.
 *
 * `satisfies readonly EatingOccasion[]` fait que le compilateur refuse un
 * moment inventé, et deux tests vérifient l'égalité avec les listes d'origine:
 * la duplication est une décision, pas une dérive qu'on découvrirait un mardi.
 */
export const FIXED_INTAKE_OCCASIONS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const satisfies readonly EatingOccasion[];

/**
 * Les jetons de jour, dans l'ordre de la semaine. Même duplication délibérée,
 * même test d'égalité.
 */
export const FIXED_INTAKE_DAY_TOKENS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

/**
 * LE PLAFOND. C'est un PROMPT, pas une base de données.
 *
 * Huit lignes tiennent dans une section lisible; quarante noient la consigne
 * de sécurité qui la précède. L'excédent est écarté et COMPTÉ (R4) — un
 * plafond silencieux ferait disparaître des déclarations sans trace.
 */
export const MAX_FIXED_INTAKES = 8;

/**
 * UN APPORT FIXE — union à deux branches, jamais un objet plat.
 *
 * ── POURQUOI L'UNION ────────────────────────────────────────────────────
 * `replacesMeal: true` sans `slot` est un état que PERSONNE ne saurait
 * exécuter: remplacer quel moment ? Un objet plat le rend représentable et
 * laisse au lecteur le soin de s'en méfier; l'union le rend impossible à
 * écrire. C'est le patron d'`Envelope` (FF-039), pour la même raison.
 */
export type FixedIntake =
  & {
    /**
     * L'IDENTIFIANT, et le SEUL chemin du calcul. Résolu contre
     * `food_composition_refs` (terme canonique ou alias).
     */
    foodRef: string;
    /**
     * LES MOTS DE L'ÉLÈVE — « mon shaker », « le truc du matin ».
     *
     * ⚠️ R1: NE SERT JAMAIS À MATCHER. Il existe pour dire à l'élève, dans ses
     * mots, de quoi le produit parle. Le 2026-08-06, des lignes difformes ont
     * armé la ceinture de sortie sur le mot « diabetes » et un message
     * d'urgence a été remplacé par un refus poli, en run réel. De la prose dans
     * un comparateur, c'est ce défaut-là.
     */
    label: string;
    amount: number;
    unit: CompositionUnit;
    /** Les jours où il a lieu. **Vide = tous les jours** (cf. `AwayDay.slots`). */
    days: readonly string[];
  }
  & (
    /**
     * ── D'OÙ VIENT LA COMPOSITION ─────────────────────────────────────────
     *
     * `referential` est le cas d'origine: `foodRef` se résout contre
     * `food_composition_refs`, et c'est le référentiel qui sait ce que
     * l'aliment contient.
     *
     * `declared` existe parce que le référentiel ne PEUT pas savoir. Mesuré le
     * 2026-08-13 sur la base locale: 911 références et 2508 alias, **zéro
     * whey, zéro protéine en poudre** — le seul « shake » du référentiel est
     * un milkshake de fast-food. Et même en en ajoutant un, ce serait une
     * moyenne: une poudre du commerce va de 70 à 90 g de protéines pour 100 g,
     * et une dosette de 25 à 35 g. Le nombre imprimé sur LE pot de la personne
     * est strictement meilleur que tout ce qu'on irait chercher.
     *
     * Ce n'est donc pas une seconde source de vérité pour un même objet: c'est
     * une branche pour les objets qui portent une ÉTIQUETTE.
     */
    /**
     * ⚠️ LE MARQUEUR `referential` EST OPTIONNEL, `declared` NE L'EST PAS.
     *
     * L'asymétrie est voulue et elle ne ment pas: `referential` est l'état
     * d'ORIGINE, celui de toutes les lignes écrites avant cette branche. Son
     * absence veut dire exactement ce qu'il dit, et le parseur en fait déjà son
     * défaut. Le rendre obligatoire ferait mentir un jsonb existant sans rien
     * garantir de plus.
     *
     * `declared`, lui, doit être ÉCRIT: ses trois nombres n'ont aucun défaut
     * honnête, et une déclaration à moitié lisible se jette.
     */
    | { nutrition?: "referential" }
    | {
      nutrition: "declared";
      /** Ce que pèse UNE portion, en grammes. Lu sur le pot. L'ancrage. */
      servingGrams: number;
      /** Protéines par portion, en grammes. */
      proteinGPerServing: number;
      /**
       * Énergie par portion, en kcal. **REQUISE, et le plan la disait
       * optionnelle.**
       *
       * `CompositionRef.energyKcal` n'est pas nullable, donc une portion sans
       * énergie devrait entrer à 0 — un zéro traverse toutes les additions
       * sans rien signaler, et la journée paraîtrait plus légère qu'elle
       * n'est. Le générateur ajouterait alors de quoi combler un creux qui
       * n'existe pas, ce qui est la mauvaise direction pour quelqu'un en perte
       * de poids.
       *
       * Déduire l'énergie de la protéine (×4) ne répare rien: ça ignore les
       * glucides et les lipides, donc ça sous-estime — dans le même sens.
       *
       * C'est UN chiffre de plus, sur la même ligne de la même étiquette.
       */
      energyKcalPerServing: number;
      /**
       * ── L4 · LE GROUPE, QUAND LA DÉCLARATION LE NOMME ────────────────────
       *
       * ⚠️ OPTIONNEL, ET C'EST LA SEULE FORME HONNÊTE. Les 8 apports en base le
       * 2026-08-22 n'en portent aucun: le rendre obligatoire ferait tomber
       * huit déclarations valides — dont six shakers dont la protéine est la
       * raison d'être de cette branche — pour un champ qu'aucun écran n'écrit
       * encore.
       *
       * ⛔ ET SON ABSENCE N'EST PAS `lean_protein`. C'était le cas jusqu'à ce
       * lot, et le Barleycup malt drink en base (18,4 % de protéines dans son
       * énergie) prouve que le défaut mentait déjà. `absent` veut dire « la
       * déclaration ne dit pas », et `augmentedIndexFor` le rend au neutre
       * hors vocabulaire, jamais à une affirmation.
       *
       * Un slug hors de `FOOD_GROUP_REFS` est lu comme absent — voir
       * `declaredIntakeGroupOf`, qui ne lève jamais et compte le refus.
       */
      foodGroup?: FoodGroupRef;
    }
  )
  & (
    | {
      /** Hors moment nommé: un yaourt à 16 h qui n'est pas « le goûter ». */
      placement: "loose";
    }
    | {
      placement: "at_slot";
      slot: EatingOccasion;
      /**
       * A5 — **`false` par défaut**, y compris avec un moment nommé.
       *
       * « Un café au lait au petit-déjeuner » nomme un moment et ne remplace
       * rien. Défaut inverse, quelqu'un qui décrit honnêtement ce qu'il mange
       * déjà se retrouverait puni d'un repas en moins.
       */
      replacesMeal: boolean;
    }
  );

/** Ce que le parseur rend: ce qu'il a lu, et ce qu'il a jeté. */
export interface FixedIntakeParse {
  intakes: FixedIntake[];
  /**
   * Les entrées écartées. R4: le compteur est ce qui distingue « il n'a rien
   * déclaré » de « on n'a pas su lire ce qu'il a déclaré ». Sans lui, un champ
   * mal écrit par un futur écran ressemblerait à un champ vide, pour toujours.
   */
  discarded: number;
}

const UNIT_SET = new Set<string>(COMPOSITION_UNITS);
const OCCASION_SET = new Set<string>(FIXED_INTAKE_OCCASIONS);

/**
 * LE PRÉFIXE DES SLUGS SYNTHÉTIQUES.
 *
 * `food_composition_refs.slug` vient de CIQUAL: aucune entrée ne commence par
 * ça. C'est ce qui garantit qu'un apport déclaré ne MASQUE jamais un aliment
 * du référentiel — un alias qui masquerait une entrée est le défaut que
 * `buildCompositionIndex` refuse déjà de son côté.
 */
const DECLARED_SLUG_PREFIX = "declared_";

/**
 * Le slug d'un apport déclaré, dérivé de son libellé.
 *
 * ⚠️ `normalizeTerm` (côté `food_composition.ts`) remplace `:` par une espace,
 * et `resolveIngredient` recolle ensuite les espaces en `_`. Un préfixe à deux
 * points se transformerait donc en cours de route. On reste en `[a-z0-9_]`,
 * qui traverse la normalisation sans bouger.
 *
 * Deux apports déclarés au MÊME libellé partagent un slug, donc une ligne de
 * composition. C'est ce que quelqu'un veut dire en écrivant deux fois « mon
 * shaker »: la même chose, à deux moments.
 */
/**
 * Un nombre, ou `NaN` — SANS le zéro de complaisance de `Number()`.
 *
 * `Number(null)`, `Number("")`, `Number([])` et `Number(undefined ?? "")`
 * rendent tous `0` ou `NaN` selon des règles que personne ne relit. Ici
 * l'absence doit être un ÉCHEC, pas un zéro: c'est la différence entre « cette
 * portion n'apporte pas d'énergie » et « on ne sait pas ce qu'elle apporte ».
 */
function numberOrNaN(raw: unknown): number {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === "string" && raw.trim() === "") return NaN;
  if (typeof raw === "boolean") return NaN;
  return Number(raw);
}

export function declaredSlugFor(label: string): string {
  const body = String(label ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${DECLARED_SLUG_PREFIX}${body || "intake"}`;
}

/**
 * Les apports lus depuis `practical_constraints.fixed_intakes`.
 *
 * DÉFENSIF DANS UNE SEULE DIRECTION, comme `parseAwayDays` et
 * `parseEatingRhythm`: ce qui n'est pas reconnu tombe SEUL, jamais avec les
 * autres. Une entrée illisible ne doit pas faire disparaître les entrées
 * lisibles — sinon un plan recompose un petit-déjeuner que l'élève ne prendra
 * pas, à cause d'une faute de frappe sur une autre ligne.
 */
export function parseFixedIntakes(raw: unknown): FixedIntakeParse {
  if (!Array.isArray(raw)) return { intakes: [], discarded: 0 };
  const intakes: FixedIntake[] = [];
  let discarded = 0;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      discarded++;
      continue;
    }
    const e = entry as Record<string, unknown>;

    const foodRef = String(e.food_ref ?? "").trim().toLowerCase();
    if (!foodRef) {
      discarded++;
      continue;
    }

    const amount = Number(e.amount);
    // `> 0` et pas `>= 0`: un apport de zéro n'est pas un apport, et il
    // occuperait quand même un créneau — un repas supprimé pour rien.
    if (!Number.isFinite(amount) || amount <= 0) {
      discarded++;
      continue;
    }

    const unit = String(e.unit ?? "").trim().toLowerCase();
    if (!UNIT_SET.has(unit)) {
      discarded++;
      continue;
    }

    // ── LE MOMENT: ABSENT ET ILLISIBLE NE SONT PAS LA MÊME CHOSE ─────────
    // Sans clé `slot`, l'élève dit « hors moment nommé » — c'est `loose`, une
    // déclaration valide. Avec un `slot` qu'on ne sait pas lire, il a nommé un
    // moment et on ne sait pas lequel: le traiter comme `loose` transformerait
    // une faute de frappe en apport qui ne remplace plus rien, et le
    // petit-déjeuner reviendrait sans que personne ne le demande.
    const slotRaw = e.slot === null || e.slot === undefined
      ? ""
      : String(e.slot).trim().toLowerCase();
    if (slotRaw && !OCCASION_SET.has(slotRaw)) {
      discarded++;
      continue;
    }

    // Les jours: les jetons illisibles tombent, l'entrée reste. Une liste
    // ENTIÈREMENT illisible est en revanche jetée — « lundi et mardi » mal
    // orthographiés ne veut pas dire « tous les jours », et c'est ce que
    // rendrait un tableau vide.
    const askedDays = Array.isArray(e.days) && e.days.length > 0;
    const days = askedDays
      ? FIXED_INTAKE_DAY_TOKENS.filter((d) =>
        (e.days as unknown[]).some((x) => String(x ?? "").trim().toLowerCase() === d)
      )
      : [];
    if (askedDays && days.length === 0) {
      discarded++;
      continue;
    }

    // Le plafond mord APRÈS la validation: une entrée valide au-delà du
    // plafond et une entrée malformée sont toutes deux « écartées et
    // comptées », et il n'y a pas de raison de les distinguer ici.
    if (intakes.length >= MAX_FIXED_INTAKES) {
      discarded++;
      continue;
    }

    // ── LA COMPOSITION DÉCLARÉE, ET SES TROIS NOMBRES ────────────────────
    // Tout-ou-rien: une déclaration à moitié lisible n'est pas une
    // déclaration. La rabattre en `referential` ferait chercher « mon
    // shaker » dans le référentiel, ne rien trouver, et perdre la protéine
    // en silence — c'est-à-dire le défaut que cette branche existe pour
    // fermer, atteint par la porte de la tolérance.
    const declaresNutrition =
      String(e.nutrition ?? "").trim().toLowerCase() === "declared";
    let nutritionBranch:
      | { nutrition: "referential" }
      | {
        nutrition: "declared";
        servingGrams: number;
        proteinGPerServing: number;
        energyKcalPerServing: number;
        foodGroup?: FoodGroupRef;
      } = { nutrition: "referential" };
    if (declaresNutrition) {
      // ⚠️ `Number(null)` VAUT 0, ET `Number("")` AUSSI. Lire ces trois champs
      // au `Number()` nu ferait entrer une énergie ABSENTE comme 0 kcal —
      // c'est-à-dire le zéro muet contre lequel le commentaire du type
      // s'écrit, atteint par la conversion plutôt que par la déclaration. Le
      // test « une déclaration INCOMPLÈTE est jetée » l'a trouvé.
      const servingGrams = numberOrNaN(e.serving_grams);
      const proteinG = numberOrNaN(e.protein_g_per_serving);
      const energyKcal = numberOrNaN(e.energy_kcal_per_serving);
      // `servingGrams > 0` est l'ANCRAGE: sans lui, aucun des deux autres
      // nombres ne se ramène à 100 g, et la ligne ne peut rien peser.
      // Protéine et énergie acceptent `0` — une portion peut légitimement
      // n'apporter ni l'une ni l'autre — mais jamais `NaN` ni le négatif.
      if (
        !Number.isFinite(servingGrams) || servingGrams <= 0 ||
        !Number.isFinite(proteinG) || proteinG < 0 ||
        !Number.isFinite(energyKcal) || energyKcal < 0
      ) {
        discarded++;
        continue;
      }
      // ── L4 · LE GROUPE NE FAIT PAS PARTIE DU TOUT-OU-RIEN ────────────────
      // Les trois NOMBRES sont solidaires: une déclaration à moitié chiffrée
      // ne pèse rien, donc elle se jette. Le groupe, lui, est une étiquette de
      // plus sur une déclaration déjà complète: la jeter ferait tomber une
      // déclaration entière — six shakers en base — pour un mot mal
      // orthographié, et remettrait leur protéine hors du calcul. Un slug
      // inventé retombe donc sur l'absence, comptée par
      // `declaredIntakeGroupCounts` sous `refused`.
      const foodGroup = declaredIntakeGroupOf(e);
      nutritionBranch = {
        nutrition: "declared",
        servingGrams,
        proteinGPerServing: proteinG,
        energyKcalPerServing: energyKcal,
        ...(foodGroup === null ? {} : { foodGroup }),
      };
    }

    const base = {
      ...nutritionBranch,
      foodRef: nutritionBranch.nutrition === "declared"
        // LE SLUG EST DÉRIVÉ, PAS SAISI. Il ne doit rencontrer aucune entrée
        // du référentiel: le préfixe le garantit, et l'assainissement à
        // `[a-z0-9_]` empêche qu'un libellé porte un marqueur d'ambiguïté
        // (« beurre OU huile ») qui disqualifierait la résolution.
        ? declaredSlugFor(String(e.label ?? "").trim() || foodRef)
        : foodRef,
      // Le label retombe sur le `food_ref` quand il manque: la consigne doit
      // pouvoir nommer l'apport, et un identifiant est un plus mauvais nom
      // qu'un nom mais un bien meilleur nom que rien.
      label: String(e.label ?? "").trim() || foodRef,
      amount,
      unit: unit as CompositionUnit,
      days,
    };

    if (!slotRaw) {
      intakes.push({ ...base, placement: "loose" });
      continue;
    }
    intakes.push({
      ...base,
      placement: "at_slot",
      slot: slotRaw as EatingOccasion,
      // A5: seul `true` explicite remplace. Tout le reste s'ajoute.
      replacesMeal: e.replaces_meal === true,
    });
  }

  return { intakes, discarded };
}

/** Cet apport a-t-il lieu ce jour-là ? `days` vide = tous les jours. */
export function intakeHappensOn(intake: FixedIntake, day: string | null): boolean {
  if (intake.days.length === 0) return true;
  if (!day) return false;
  return intake.days.includes(day);
}

/**
 * BRANCHE 1 — CE CRÉNEAU EST-IL ENTIÈREMENT PRIS, CE JOUR-LÀ ?
 *
 * Seuls les apports REMPLAÇANTS occupent (A5). Un café au lait au
 * petit-déjeuner nomme un moment et ne le prend pas.
 *
 * ── LE JOUR NON NOMMÉ, ET LA DIRECTION DE L'ERREUR ────────────────────────
 * Un plat sans `day` tombe si le créneau est remplacé TOUS les jours — on sait
 * alors qu'il est de trop, quel que soit le jour. S'il n'est remplacé que
 * certains jours, le plat passe: on ne peut pas prouver qu'il est le mauvais,
 * et supprimer un repas qu'on n'a pas su situer coûte plus cher que d'en
 * laisser un de trop, que l'élève verra.
 */
export function slotIsTaken(
  intakes: readonly FixedIntake[],
  day: string | null,
  slot: MealSlot | null,
): boolean {
  if (!slot) return false;
  return intakes.some((i) =>
    i.placement === "at_slot" && i.replacesMeal && i.slot === slot &&
    intakeHappensOn(i, day)
  );
}

/**
 * BRANCHES 2 ET 3 — CE QUE LES APPORTS PÈSENT SUR LA FENÊTRE.
 *
 * Une entrée par occurrence: un shaker cinq jours de semaine sur une fenêtre
 * de sept jours pèse cinq shakers, pas un. Le verdict divise ensuite par le
 * nombre de jours, exactement comme il le fait pour les plats.
 *
 * ⚠️ CES ENTRÉES NE SONT DANS AUCUN PLAT, et c'est délibéré: un shaker n'a pas
 * de méthode de cuisson, n'est pas frit, et sa densité n'a aucun sens. Le
 * mettre dans un plat fausserait la moyenne des densités; le laisser dehors le
 * fait compter dans l'énergie et la protéine, qui sont des grandeurs de
 * JOURNÉE.
 */
export function fixedIntakeInputsFor(
  intakes: readonly FixedIntake[],
  daysToFill: readonly string[],
): CompositionInput[] {
  const out: CompositionInput[] = [];
  // ── FENÊTRE INCONNUE: CHAQUE APPORT COMPTE UNE FOIS, JAMAIS ZÉRO ────────
  // Sans jours, on ne peut pas dire QUELS apports ont lieu — mais on peut
  // encore moins dire qu'AUCUN n'a lieu. Zéro est un nombre: il traverse
  // toutes les additions sans rien signaler, et c'est la faute que R2 nomme.
  // Une occurrence par apport est le minimum non nul, et il est avoué ici.
  const unknownWindow = daysToFill.length === 0;
  const window = unknownWindow ? [null] : daysToFill;
  for (const day of window) {
    for (const intake of intakes) {
      if (!unknownWindow && !intakeHappensOn(intake, day)) continue;
      out.push({
        term: intake.foodRef,
        amount: intake.amount,
        unit: intake.unit,
        // Un apport fixe est consommé TEL QUEL: un shaker ne cuit pas, un
        // yaourt non plus. `raw` est l'état déclaré, et le rendement de la
        // classe neutre vaut 1.0 — aucune transformation n'est imputée.
        state: "raw",
      });
    }
  }
  return out;
}

/**
 * L'INDEX DE COMPOSITION, AUGMENTÉ DES APPORTS DÉCLARÉS.
 *
 * ── POURQUOI ICI, ET PAS DANS `food_composition.ts` ──────────────────────
 * `CompositionIndex` est deux maps en lecture seule. Un appelant peut donc en
 * construire un troisième depuis l'extérieur, et TOUTE la chaîne existante
 * (`resolveIngredient` → `gramsRawOf` → `nutrientsOf` → `verdictFor`) marche
 * ensuite sans qu'un octet n'y change. C'est ce qui rend cette branche additive
 * au sens strict: elle n'ouvre aucun cas particulier dans le calcul.
 *
 * ── L'ANCRAGE EST RÉEL, ET C'EST LA MOITIÉ QUI COMPTE ────────────────────
 * `unitGrams` reçoit le poids de la portion, lu sur le pot. Les valeurs sont
 * ramenées à 100 g par une règle de trois. Une occurrence
 * (`amount: 1, unit: "unit"`) pèse donc EXACTEMENT une dosette, en vrais
 * grammes de poudre — aucune masse fictive n'entre dans une somme.
 *
 * `yieldClass: "neutral"` (facteur 1,0) et `state: "raw"` chez l'appelant: une
 * poudre ne cuit pas, et aucune transformation ne lui est imputée.
 * `atwaterDiscount: 1.0`, `energyDense: false` — une étiquette donne l'énergie
 * réellement disponible, il n'y a rien à escompter ni à soupçonner.
 *
 * Les micronutriments sentinelles restent FAUX: une étiquette de shaker ne dit
 * rien du fer ni de la B12, et les cocher ferait croire une carence couverte.
 */
export function augmentedIndexFor(
  base: CompositionIndex,
  intakes: readonly FixedIntake[],
): CompositionIndex {
  const declared = intakes.filter(
    (i): i is Extract<FixedIntake, { nutrition: "declared" }> =>
      i.nutrition === "declared",
  );
  if (declared.length === 0) return base;

  const bySlug = new Map(base.bySlug);
  for (const intake of declared) {
    const per100 = 100 / intake.servingGrams;
    bySlug.set(intake.foodRef, {
      slug: intake.foodRef,
      // ── ⟳ L4 · LE GROUPE VIENT DE LA DÉCLARATION, OU DE NULLE PART ─────
      //
      // Ce champ valait `"lean_protein"` EN DUR, et le commentaire d'alors
      // nommait sa propre date de péremption: *« le jour où des apports
      // déclarés NON protéiques apparaissent, ce champ doit venir de la
      // déclaration, pas d'ici »*. Ce jour-là était PASSÉ quand on l'a
      // mesuré: sur les 7 apports déclarés en base le 2026-08-22, un
      // Barleycup malt drink porte 18,4 % de protéines dans son énergie,
      // contre 80 % pour une poudre.
      //
      // ⛔ ET DEPUIS `L17`, UN GROUPE FAUX BORNE UNE ÉNERGIE. Mesuré: UNE
      // seule déclaration faisait passer la borne d'un terme inconnu
      // `lean_protein` de 201 à 538 kcal à 150 g (×2,7), et faisait tomber
      // `lean_protein` de la liste des porteurs de zinc (2/3 → 2/4, sous
      // `SENTINEL_CARRIER_SHARE`).
      //
      // ⚠️ LE REPLI N'EST PAS UN GROUPE, ET LES LECTEURS LE SAVENT DÉJÀ:
      // `groupBandsFrom` saute une valeur hors `FOOD_GROUP_REFS`, et
      // `sentinelCarriersOf` la range dans un seau que personne n'interroge.
      // Le neutre que la liste fermée n'a pas, ses lecteurs l'avaient.
      //
      // ⛔ ET LA LIGNE RESTE DANS L'INDEX. Son énergie et sa protéine sont
      // intactes: seule l'affirmation de groupe part. La retirer remettrait
      // les 24 g de protéine du shaker hors du verdict, c'est-à-dire le trou
      // que cette branche existe pour fermer.
      foodGroupRef: intake.foodGroup ?? ungroupedFoodGroup(),
      label: intake.label,
      // ⚠️ `manual` ET PAS UNE SIXIÈME VALEUR. Un apport déclaré vient d'une
      // ÉTIQUETTE que l'élève a lue — c'est la source la plus humaine du
      // produit. Lui donner `model` gonflerait le compteur ② du LOT 18 avec
      // une valeur qu'aucun modèle n'a écrite.
      source: "manual",
      energyKcal: intake.energyKcalPerServing * per100,
      proteinG: intake.proteinGPerServing * per100,
      // `null`, PAS `0`: l'étiquette n'a pas été lue là-dessus, et `null` est
      // ce que ce module utilise pour dire « la source ne donne pas la
      // valeur ». Un zéro dirait qu'il n'y en a pas.
      carbsG: null,
      fatG: null,
      fiberG: null,
      omega3Marine: false,
      ironSource: false,
      calciumSource: false,
      iodineSource: false,
      zincSource: false,
      b12Source: false,
      folateSource: false,
      yieldClass: "neutral",
      atwaterDiscount: 1.0,
      energyDense: false,
      unitGrams: intake.servingGrams,
      // JAMAIS un condiment. Un apport déclaré est le contraire exact: on le
      // déclare parce qu'il porte de la protéine que le référentiel ne sait pas
      // peser. Lui poser une masse conventionnelle ferait passer un shaker pour
      // une pincée de sel — et ferait taire l'abstention qui le signale.
      condimentGrams: null,
    });
  }
  // `byAlias` NE BOUGE PAS. Un alias vers un slug déclaré donnerait au libellé
  // de quelqu'un le pouvoir de capturer un terme de recette — « mon shaker »
  // passe encore, « lait » capturerait tous les laits du plan.
  return { bySlug, byAlias: base.byAlias };
}

// ---------------------------------------------------------------------------
// LA CONSIGNE — R5, en négatif explicite
// ---------------------------------------------------------------------------

const DAY_PROSE: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const OCCASION_PROSE: Record<EatingOccasion, string> = {
  breakfast: "breakfast",
  snack_am: "morning snack",
  lunch: "lunch",
  snack_pm: "afternoon snack",
  dinner: "dinner",
  before_bed: "before bed",
};

function daysProse(days: readonly string[]): string {
  if (days.length === 0) return "every day";
  return days.map((d) => DAY_PROSE[d] ?? d).join(", ");
}

/**
 * LE BLOC DE CONSIGNE, ou `[]` quand il n'y a rien à dire.
 *
 * ── POURQUOI DU NÉGATIF EXPLICITE ────────────────────────────────────────
 * Un modèle de composition COMPLÈTE ce qu'on lui donne — c'est son métier. Une
 * liste positive de ce qui est déjà mangé se lit comme une inspiration, pas
 * comme une interdiction. C'est le même raisonnement que la section
 * « WHEN THEY ARE NOT HERE », et il a été payé une fois là-bas.
 *
 * ── AUCUN CHIFFRE SUR LA PERSONNE ────────────────────────────────────────
 * La ligne porte « 30 g » — un chiffre sur un ALIMENT, exactement de la même
 * famille que « 400 g de cuisses de poulet » dans une recette, et ce que
 * CONTRACT.md autorise. Ce que l'apport apporte à SON plancher ne sort jamais
 * du moteur, et un test le vérifie sur le filtre numérique du dépôt.
 */
export function fixedIntakePromptLines(
  intakes: readonly FixedIntake[],
): string[] {
  if (intakes.length === 0) return [];
  const lines: string[] = [
    "",
    "-- WHAT THEY ALREADY HAVE --",
    "they already eat these, outside anything you compose. count them as " +
    "eaten and do not put them in the shopping list:",
  ];
  for (const i of intakes) {
    const when = i.placement === "at_slot"
      ? ` at ${OCCASION_PROSE[i.slot]}`
      : "";
    lines.push(`- ${i.label} (${i.amount} ${i.unit})${when}, ${daysProse(i.days)}`);
  }
  const replaced = intakes.filter(
    (i): i is Extract<FixedIntake, { placement: "at_slot" }> =>
      i.placement === "at_slot" && i.replacesMeal,
  );
  if (replaced.length > 0) {
    lines.push(
      "those moments are TAKEN -- compose nothing there, buy nothing for " +
      "them, and count no portion:",
    );
    for (const i of replaced) {
      lines.push(`- no ${OCCASION_PROSE[i.slot]} on ${daysProse(i.days)}`);
    }
  }
  const kept = intakes.filter(
    (i) => i.placement === "loose" || !i.replacesMeal,
  );
  if (kept.length > 0) {
    lines.push(
      "the others sit ALONGSIDE what you compose -- keep the meal, but do " +
      "not repeat what they already have.",
    );
  }
  return lines;
}
