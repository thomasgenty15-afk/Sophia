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
import type { CompositionInput, CompositionUnit } from "./food_composition.ts";
import type { EatingOccasion, MealSlot } from "./meal_generation.ts";

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

    const base = {
      foodRef,
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
