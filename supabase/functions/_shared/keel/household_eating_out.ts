// ═══════════════════════════════════════════════════════════════════════════
// LA BIFURCATION — ② LE CONSEIL CHIFFRÉ DU MIDI
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_portions.ts` (découpage des gros
// fichiers, lot 2b). Aucune logique changée. `household_portions.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
//
// ⚠️ LE CYCLE DÉCRIT SOUS `KNOWN_PRESENCE_STATES` TIENT TOUJOURS: ce module est
// importé par `household_portions.ts`, donc importer une VALEUR de
// `household_presence.ts` ferait le même cycle d'exécution, un maillon plus
// loin. Les seuls imports d'ici sont des types.

import type { MemberAgeState } from "./household.ts";
// LA TAILLE D'UN MOMENT VIENT DU MOTEUR, ELLE N'EST PAS REDÉCLARÉE ICI. Une
// seconde union `"small" | "medium" | "large"` écrite dans ce fichier
// divergerait de `MEAL_SIZES` au premier ajustement, et c'est ce fichier-là qui
// écrit la ligne du prompt — donc c'est lui qui aurait tort en silence.
import type { EatingOccasion, EatingOccasionSlot } from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// ② LE CONSEIL CHIFFRÉ DU MIDI — une consigne, JAMAIS un solde
// ---------------------------------------------------------------------------

/**
 * ⛔ CE QUE CE BLOC N'ÉCRIRA JAMAIS, ET LA PHRASE EXACTE QUI EST INTERDITE.
 *
 *     « Il te reste 680 kcal. »
 *
 * C'est LA phrase d'un tracker, et elle n'existe sur aucun chemin de ce produit
 * (`energy_target.ts`, en toutes lettres). Un conseil du midi est une CONSIGNE:
 * il ne soustrait rien de ce qui a été mangé, il ne connaît pas ce qui a été
 * mangé, et il ne peut pas le connaître — aucune de ses entrées ne porte un
 * consommé. Pas de reste, pas de verdict, pas de couleur, pas de barre.
 *
 * ⚠️ ET C'EST POURQUOI IL SE CALCULE SUR LA JOURNÉE DÉCLARÉE, PAS SUR LE PLAN.
 * « Vise 700 au déjeuner » est vrai que la personne ait pris son petit-déjeuner
 * ou non. Le dériver de ce que le plan a composé le rendrait dépendant du reste
 * de la journée, c'est-à-dire un solde déguisé.
 */
export const EATING_OUT_ADVICE_REASONS = Object.freeze(
  [
    "advised",
    /** ① ② ③ — la chaîne de sécurité du LECTEUR, motifs repris tels quels. */
    "restriction_floor",
    "minor",
    "doctrine_no_counting",
    /** ④ l'interrupteur d'affichage, ⑤ celui de la cible. */
    "student_off",
    "target_off",
    /** La bouche n'est pas le lecteur — FF-059 §11 n°4, `canEmitMouthEnergy`. */
    "other_mouth",
    /** C9.a — l'âge de CETTE bouche. */
    "mouth_minor",
    "mouth_age_unknown",
    /** C9.b — le vocabulaire de présence n'est pas dans la liste fermée. */
    "unknown_state",
    /** Cette case n'est pas un « dehors »: il n'y a rien à conseiller. */
    "not_eating_out",
    /** Pas de journée déclarée, ou pas de corps: rien à répartir. */
    "no_rhythm",
    "no_body",
  ] as const,
);
export type EatingOutAdviceReason = (typeof EATING_OUT_ADVICE_REASONS)[number];

/**
 * LE VOCABULAIRE DE PRÉSENCE, RECOPIÉ — ET LE POURQUOI DE LA RECOPIE.
 *
 * ⛔ CE N'EST PAS UN OUBLI D'IMPORT. `PRESENCE_STATES` vit dans
 * `household_presence.ts`, qui importe `meal_generation.ts`, qui importe CE
 * fichier: en importer une VALEUR ferait un cycle d'exécution
 * (`household_portions` → `household_presence` → `meal_generation` →
 * `household_portions`). Les seuls imports que ce fichier prend de cette
 * branche-là sont des TYPES, effacés à la compilation.
 *
 * ⚠️ ET C'EST DONC UNE SECONDE COPIE D'UNE ÉNUMÉRATION FERMÉE, le mode d'échec
 * que `tokens.ts` documente en tête. Ce qui l'empêche de dériver est un test
 * d'égalité stricte avec `PRESENCE_STATES` — un test peut importer les deux
 * modules sans créer de cycle de production. Sans ce test, un quatrième état
 * ajouté là-bas serait lu « inconnu » ici, donc muet, et le lot ressemblerait à
 * un lot qui marche.
 */
export const KNOWN_PRESENCE_STATES = Object.freeze(
  ["at_table", "eating_out", "away"] as const,
);

/**
 * LE POIDS D'UN MOMENT DANS LA JOURNÉE DE CETTE PERSONNE.
 *
 * ── CE N'EST PAS UNE TABLE DE RÉPARTITION UNIVERSELLE ─────────────────────
 * Les poids ne sont lus que RELATIVEMENT aux moments que CETTE bouche a
 * déclarés: quelqu'un qui ne prend que déjeuner et dîner répartit sa journée en
 * deux, pas en six. Une table de pourcentages absolus (« le déjeuner vaut 35 %
 * d'une journée ») serait fausse pour tout le monde sauf pour la journée type
 * qu'elle décrit.
 *
 * ⚠️ LA TAILLE DÉCLARÉE GAGNE SUR LE DÉFAUT DU MOMENT, et c'est le seul
 * arbitrage de cette table: `EatingOccasionSlot.size` est ce que la personne a
 * dit de SON repas (« gros dîner »), le défaut n'est que ce qu'un moment pèse
 * quand personne n'a rien dit. Trois repas principaux à `medium`, trois
 * collations à `small`: c'est la lecture la plus plate possible, et elle est
 * délibérément grossière — le nombre sort arrondi aux 50 kcal, exactement comme
 * `maintenanceRange`, parce qu'un « 683 » se lirait comme une mesure.
 */
export const MEAL_SIZE_WEIGHT: Readonly<
  Record<"small" | "medium" | "large", number>
> = Object.freeze({ small: 1, medium: 2, large: 3 });

const DEFAULT_SLOT_WEIGHT: Readonly<Record<EatingOccasion, number>> = Object
  .freeze({
    breakfast: MEAL_SIZE_WEIGHT.medium,
    snack_am: MEAL_SIZE_WEIGHT.small,
    lunch: MEAL_SIZE_WEIGHT.medium,
    snack_pm: MEAL_SIZE_WEIGHT.small,
    dinner: MEAL_SIZE_WEIGHT.medium,
    before_bed: MEAL_SIZE_WEIGHT.small,
  });

function slotWeight(occasion: EatingOccasionSlot): number {
  return occasion.size
    ? MEAL_SIZE_WEIGHT[occasion.size]
    : DEFAULT_SLOT_WEIGHT[occasion.slot];
}

export interface EatingOutAdvice {
  /**
   * kcal, arrondis aux 50. `null` dès que le motif n'est pas `advised` — jamais
   * un `0`, qui se lirait « ne mange rien », le sens exactement inverse.
   */
  kcal: number | null;
  reason: EatingOutAdviceReason;
}

/**
 * LE CONSEIL CHIFFRÉ D'UNE CASE « DEHORS », OU LE MOTIF NOMMÉ DE SON ABSENCE.
 *
 * ── LA CLAUSE C9, ARMÉE ICI ET AVANT LA PREMIÈRE MULTIPLICATION ───────────
 * C9 (L4-B §7) dit: *la porte est traversée par ce qui PRODUIT le nombre, pas
 * seulement par ce qui l'affiche; l'état de présence « dehors » en est une
 * entrée.* Deux trous mesurés le motivent, et aucun des deux n'est réparable
 * ici:
 *
 *   · `keel_household_set_member_away` **ne consulte aucun âge** — reconfirmé
 *     sur `prosrc`. « Dehors » est donc posable sur un mineur;
 *   · le vocabulaire de présence est fermé côté maître et **ouvert côté
 *     personne** — un `.update()` PostgREST direct passe sans contrainte.
 *
 * D'où les deux gardes ci-dessous, dans cet ordre:
 *
 *   **C9.b** — `presenceState` est typé `string`, PAS `PresenceState`, et c'est
 *   délibéré. Un jeton hors liste fermée vaut « on ne sait pas » ⇒ AUCUN
 *   chiffre, et **jamais un repli sur `at_table`**. Même règle que
 *   `parseGoalToken`, qui lève plutôt que de deviner. Si le type était
 *   `PresenceState`, le compilateur donnerait une garantie que PostgREST ne
 *   donne pas, et la garde naîtrait désarmée.
 *
 *   **C9.a** — le verdict d'âge de CETTE bouche, avant tout chiffre. Un mineur
 *   ou un âge inconnu ⇒ pas de chiffre, motif nommé. La part, elle, reste
 *   dimensionnée sur les enveloppes de maintenance, comme aujourd'hui.
 *
 * ── ET LE LECTEUR, PARCE QU'UN CHIFFRE QUI SORT EST UN CHIFFRE AFFICHÉ ────
 * Contrairement au dimensionnement (①), ce conseil-ci se LIT. Il traverse donc
 * les cinq portes, interrupteurs compris, et il ne sort que pour la bouche QUI
 * LE DEMANDE (`other_mouth`). Une bouche sans compte n'a aucun interrupteur:
 * lui adresser un chiffre serait un tracker qu'elle ne peut pas éteindre. C'est
 * exactement le manque que le levier d'invitation du §2.2 ⓒ existe pour nommer
 * — « invite-la, elle pourra les déclarer elle-même ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function eatingOutAdvice(args: {
  /**
   * L'ÉTAT DE PRÉSENCE DE CETTE CASE, BRUT. REQUIS, et typé `string` — C9.b.
   */
  presenceState: string;
  /**
   * LA CHAÎNE DU LECTEUR, telle que `canShowTarget` l'a rendue. REQUISE: c'est
   * la seule porte d'entrée des interrupteurs ④ et ⑤.
   */
  reader: { show: boolean; reason: string };
  /** Cette bouche EST-ELLE le lecteur ? REQUIS. */
  mouthIsReader: boolean;
  /** ② L'âge de CETTE bouche — C9.a. REQUIS. */
  mouthAgeState: MemberAgeState;
  /** La journée déclarée de cette bouche. `[]` ⇒ rien à répartir. */
  slots: readonly EatingOccasionSlot[];
  /** La case dont on parle. */
  occasion: EatingOccasionSlot;
  /**
   * ⟳ 2026-09-09 — LA JOURNÉE DE CETTE PERSONNE, EN kcal, **TELLE QUE LE
   * PRODUIT LA LUI DIT DÉJÀ**. `null` ⇒ pas de corps ⇒ pas de conseil.
   *
   * ══════════════════════════════════════════════════════════════════════
   * ⛔ CE QUI VIVAIT ICI, ET LE DÉFAUT MESURÉ QUI L'A FAIT TOMBER
   * ══════════════════════════════════════════════════════════════════════
   *
   * L'entrée était `executed: ExecutedPace` + `direction`, et la journée se
   * calculait ici: `executed.maintenanceKcal ± dailyDeltaKcal`.
   *
   * ⚠️ `ExecutedPace.maintenanceKcal` PORTE SON PROPRE INTERDIT, en toutes
   * lettres à sa déclaration (`weight_pace.ts`): « ELLE NE REND AUCUN NOMBRE
   * DESTINÉ À ÊTRE LU. `dailyDeltaKcal` et `maintenanceKcal` sont des
   * grandeurs de CALCUL […]. Les afficher serait la cible chiffrée que
   * `energy_target.ts` refuse de servir. » Ce conseil, lui, se LIT.
   *
   * Et ce ne sont pas deux façons de dire le même nombre. MESURÉ EN RUN RÉEL
   * LE 2026-09-09 (homme 82 kg, 180 cm, 36 ans, `trains_some`, `fat_loss`,
   * 0,5 kg/sem — plan personnel du mercredi, `qa-midi-dehors@keeltest.dev`):
   *
   *     fourchette AFFICHÉE sous le plan     1 950 – 2 200 kcal/j
   *       (`maintenanceRange` 2 450–2 700, poids × kcal/kg, moins 500)
   *     journée du CONSEIL                   3 177 − 500 = 2 677 kcal/j
   *       (`estimatedMaintenanceFor`, métabolisme de base × facteur d'activité)
   *     ⇒ conseil rendu                      « au déjeuner, vise autour de 900 »
   *
   * 900 × 3 = 2 700, soit **500 kcal au-dessus du haut de la fourchette
   * imprimée trois centimètres plus haut**. Les deux nombres se contredisent
   * sur le même écran, et le second promet une journée que le premier refuse.
   * `energy_target_test.ts` REFUSE explicitement la formule qui a produit
   * 3 177 — « une cible fausse avec l'aplomb d'un tableau ».
   *
   * ══════════════════════════════════════════════════════════════════════
   * D'OÙ VIENT CE NOMBRE MAINTENANT, ET POURQUOI L'APPELANT LE CALCULE
   * ══════════════════════════════════════════════════════════════════════
   *
   * De `directedRange` — c'est-à-dire de la fourchette que l'écran imprime,
   * déficit, plancher d'énergie et annulation de condition compris. Le conseil
   * est une PART de la journée que le produit annonce; il ne peut pas descendre
   * d'une autre estimation que celle-là.
   *
   * ⛔ ET IL SE PASSE, IL NE SE RECALCULE PAS ICI. Refaire la fourchette dans ce
   * module en ferait un second point de décision sur « quelle journée » — la
   * forme de défaut que ce lot vient précisément de fermer.
   */
  dayKcal: number | null;
}): EatingOutAdvice {
  const refuse = (reason: EatingOutAdviceReason): EatingOutAdvice => ({
    kcal: null,
    reason,
  });
  // ── C9.b — LE VOCABULAIRE, AVANT TOUT ───────────────────────────────────
  if (
    !(KNOWN_PRESENCE_STATES as readonly string[]).includes(args.presenceState)
  ) {
    return refuse("unknown_state");
  }
  if (args.presenceState !== "eating_out") return refuse("not_eating_out");

  // ── LA CHAÎNE DU LECTEUR, ET SON MOTIF SURVIT TEL QUEL ──────────────────
  if (!args.reader.show) {
    return refuse(
      (EATING_OUT_ADVICE_REASONS as readonly string[]).includes(
          args.reader.reason,
        )
        ? args.reader.reason as EatingOutAdviceReason
        // Un motif que ce vocabulaire ne porte pas est un refus qu'on ne sait
        // pas dire: on refuse quand même, et on le range dans le motif le plus
        // fermé. Jamais un `advised` par défaut.
        : "unknown_state",
    );
  }
  if (!args.mouthIsReader) return refuse("other_mouth");

  // ── C9.a — L'ÂGE DE CETTE BOUCHE ────────────────────────────────────────
  if (args.mouthAgeState === "minor") return refuse("mouth_minor");
  if (args.mouthAgeState === "unknown") return refuse("mouth_age_unknown");

  if (args.dayKcal === null || !(args.dayKcal > 0)) return refuse("no_body");
  const weights = args.slots.map(slotWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (args.slots.length === 0 || total <= 0) return refuse("no_rhythm");
  const here = args.slots.findIndex((s) => s.slot === args.occasion.slot);
  if (here < 0) return refuse("no_rhythm");

  const share = (args.dayKcal * weights[here]) / total;
  // ARRONDI AUX 50, MÊME ARBITRAGE QUE `maintenanceRange`: « 700 » se lit comme
  // un ordre de grandeur, « 683 » comme une mesure — et une mesure invite à
  // viser le chiffre exact, ce qui est précisément le geste d'un tracker.
  const kcal = Math.round(share / 50) * 50;
  // Un conseil à zéro n'est pas un conseil. On préfère se taire.
  if (!(kcal > 0)) return refuse("no_body");
  return { kcal, reason: "advised" };
}

/**
 * LA PHRASE, DANS LES DEUX LANGUES.
 *
 * Elle vit ICI et pas dans un pack i18n du front, pour la même raison que
 * `PACE_WARNING_LABELS` (`weight_pace.ts`) et `QUESTION_LABELS`
 * (`plan_feedback.ts`): le nombre et le mot qui l'encadre sont une seule
 * décision, et les séparer laisse l'un bouger sans l'autre.
 *
 * ⚠️ « AUTOUR DE » EST LOAD-BEARING, DANS LES DEUX LANGUES. « Vise 700 » est une
 * cible qu'on rate; « vise autour de 700 » est un ordre de grandeur. C'est la
 * même décision que la fourchette de `energy_target.ts` — « personne ne rate un
 * intervalle ».
 *
 * ⚠️ LE LABEL PORTE SA PRÉPOSITION, ET C'EST UNE LEÇON DE CE DÉPÔT. Une phrase
 * assemblée en `Au ${label}` rend « Au ta collation du matin »: la préposition
 * française se contracte avec le genre du mot, et un gabarit qui l'ignore
 * fabrique une faute dans une langue sur deux — invisible à qui teste en
 * anglais (cicatrice « garde testée dans une seule langue »).
 */
export const EATING_OUT_SLOT_LABELS: Readonly<
  Record<EatingOccasion, { en: string; fr: string }>
> = Object.freeze({
  breakfast: { en: "At breakfast", fr: "Au petit-déjeuner" },
  snack_am: { en: "At your morning snack", fr: "À ta collation du matin" },
  lunch: { en: "At lunch", fr: "Au déjeuner" },
  snack_pm: {
    en: "At your afternoon snack",
    fr: "À ta collation de l'après-midi",
  },
  dinner: { en: "At dinner", fr: "Au dîner" },
  before_bed: { en: "At your evening snack", fr: "À ta collation du soir" },
});

export function eatingOutAdviceSentence(
  locale: "en" | "fr",
  occasion: EatingOccasion,
  kcal: number,
): string {
  const label = EATING_OUT_SLOT_LABELS[occasion][locale];
  return locale === "fr"
    ? `${label}, vise autour de ${kcal}.`
    : `${label}, aim for around ${kcal}.`;
}
