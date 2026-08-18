/**
 * LA COURTE SECTION D'ACTIVITÉ — un repère, jamais un programme.
 *
 * ── LA LIGNE, ET C'EST LE CRITÈRE D'ACCEPTATION PRINCIPAL ──────────────────
 *
 *   ✅ PLANCHER DE SANTÉ PUBLIQUE          ❌ PROGRAMMATION
 *   « 30 minutes de marche la plupart      « 3×5 squats à 80 % »
 *     des jours »                          « pousse jusqu'à l'échec »
 *   « deux séances de renforcement         « fais ton cardio à jeun »
 *     par semaine »
 *
 * La colonne de gauche est le consensus publié par les autorités (OMS:
 * 150-300 min d'activité aérobie modérée par semaine, PLUS deux séances de
 * renforcement). Ce n'est pas une méthode, c'est un repère public — Sophia
 * peut le relayer comme elle peut dire « vois un médecin » sans exercer la
 * médecine. La colonne de droite appartient à un coach qui n'a rien demandé.
 *
 * ⚠️ Cette ligne tient MÊME QUAND UN COACH A PARLÉ. Les accents de
 * `activity_stance.ts` sont une liste fermée sans aucun champ de volume, de
 * série ou de charge: le chemin coach ne peut pas produire la colonne de
 * droite, structurellement. Un test lexical le prouve sur toutes les sorties.
 *
 * ── LES QUATRE PORTES, DANS L'ORDRE DE GRAVITÉ ─────────────────────────────
 * Aucune n'est levée par une doctrine. La hiérarchie du produit est
 * **plancher TCA > coach > Sophia**, et elle se teste dans ce sens.
 *
 *   1. `restrictionFlag`   — L'exercice compulsif est un comportement
 *      compensatoire documenté des troubles du comportement alimentaire.
 *      Recommander « plus de pas » à quelqu'un sous plancher n'est pas une
 *      maladresse, c'est un dommage. FAIL-CLOSED: lecture en échec vaut `true`.
 *   2. `hasDeclaredCondition` — la posture existante pour les maladies est
 *      écrite dans `safetyConstraintsPromptBlock`: « Do not prescribe for
 *      these… The clinician who has their results decides that. » Une
 *      recommandation d'activité à quelqu'un qui a déclaré une pathologie
 *      relève du clinicien. Même frontière, même silence.
 *   3. `isMinor` — un mineur n'a pas d'objectif (`weekPlanAgeGate`), donc rien
 *      qui dérive d'un objectif.
 *   4. `mode: "off"` — le coach a demandé le silence.
 *
 * ── ET LA GARDE TRANSVERSE ─────────────────────────────────────────────────
 * **On ne demande JAMAIS si ça a été fait.** Une recommandation qu'on vérifie
 * devient une note. Ce module ne rend aucun identifiant de suivi, aucune case,
 * aucun compteur — et rien dans le produit ne doit interroger cette section.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { StudentGoal } from "./week_plan_generation.ts";
import {
  type ActivityEmphasis,
  type ActivityStance,
} from "./activity_stance.ts";

/** Ce que l'élève a déclaré de son activité actuelle. Facultatif. */
export const ACTIVITY_LEVELS = [
  "sedentary",
  "lightly_active",
  "active",
  "very_active",
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export function parseActivityLevel(value: unknown): ActivityLevel | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (ACTIVITY_LEVELS as readonly string[]).includes(slug)
    ? slug as ActivityLevel
    : null;
}

export interface ActivitySection {
  /** Les lignes à afficher, dans la langue demandée. Jamais vide. */
  lines: string[];
  /**
   * `true` seulement quand la section vient de la posture DÉCLARÉE du coach.
   *
   * ── POURQUOI CE DRAPEAU EXISTE (fork F.1bis, option A) ──────────────────
   * Sous un coach MUET, le repère public s'affiche quand même — mais il ne
   * doit pas se présenter comme SA méthode. Faire parler un coach à sa place
   * est exactement ce que le modèle interdit. L'attribution est ce qui résout
   * le problème: on rend un repère utile, sans jamais l'attribuer à qui n'a
   * rien dit.
   */
  attributedToCoach: boolean;
}

export interface ActivityInput {
  goal: StudentGoal | null;
  /** La posture de la doctrine gouvernante. `SILENT_STANCE` si coach muet. */
  stance: ActivityStance;
  level: ActivityLevel | null;
  /** REQUIS, fail-closed. Voir les quatre portes en tête de fichier. */
  restrictionFlag: boolean;
  /** REQUIS. Une maladie déclarée fait taire la section. */
  hasDeclaredCondition: boolean;
  /** REQUIS. Un mineur ne reçoit rien qui dérive d'un objectif. */
  isMinor: boolean;
  locale: "en" | "fr";
}

// ---------------------------------------------------------------------------
// Le contenu — chaque accent, dans les deux langues, sans un seul chiffre de
// volume prescrit
// ---------------------------------------------------------------------------
//
// `profiles.locale` vaut fr-FR par défaut: une table anglaise seule est une
// table que la majorité des élèves ne lit pas.

const EMPHASIS_LINES: Record<ActivityEmphasis, { en: string; fr: string }> = {
  daily_movement: {
    en: "Walking most days does more than one big weekend session.",
    fr: "Marcher la plupart des jours fait plus qu'une grosse séance le week-end.",
  },
  strength: {
    en: "Two sessions a week that work the whole body are the public floor.",
    fr: "Deux séances par semaine qui sollicitent tout le corps, c'est le repère public.",
  },
  cardio: {
    en: "Anything that gets you a bit out of breath counts, walking included.",
    fr: "Tout ce qui essouffle un peu compte, la marche comprise.",
  },
  recovery: {
    en: "Rest days and sleep are part of it, not a pause from it.",
    fr: "Les jours de repos et le sommeil en font partie, ce n'est pas une pause.",
  },
  mobility: {
    en: "A few minutes of moving your joints through their range, most days.",
    fr: "Quelques minutes à mobiliser les articulations, la plupart des jours.",
  },
};

/**
 * L'accent MAISON par dynamique — la version 1, sans coach.
 *
 * Chaque dynamique a sa branche NOMMÉE: une dynamique dont on n'écrit pas
 * l'accent n'entre pas dans la table, elle serait décorative.
 *
 * `maintenance` reçoit délibérément le plus léger: son objectif est l'écart
 * minimal, et lui recommander d'ajouter quelque chose contredirait sa
 * définition.
 */
const HOUSE_EMPHASES: Record<StudentGoal, readonly ActivityEmphasis[]> = {
  // Le volume quotidien avant l'intensité, et le renforcement pour ce qu'il
  // préserve — pas pour ce qu'il brûle.
  fat_loss: ["daily_movement", "strength"],
  // ── LA TROISIÈME POSITION APRÈS LE REPLI DU 2026-08-18 ─────────────────
  // `maintenance` valait `["daily_movement"]` — le plus léger des six, parce
  // que « son objectif est l'écart minimal ». Elle absorbe désormais `health`
  // (`["daily_movement", "strength"]`), `recomposition` et `performance`, et
  // garder le plus léger reviendrait à RETIRER le renforcement à tout le monde
  // sauf aux deux dynamiques extrêmes.
  //
  // ⚠️ ELLE VAUT MAINTENANT `DEFAULT_EMPHASES`, MOT POUR MOT, ET CE N'EST PAS
  // UN OUBLI. Les deux disent la même chose et ne veulent pas dire la même:
  // l'une est ce qu'on recommande à qui vise l'équilibre, l'autre est ce qu'on
  // recommande à qui n'a rien déclaré. Elles sont nommées séparément pour que
  // faire bouger l'une ne déplace pas l'autre en silence — même arbitrage que
  // `NEUTRAL_DIRECTION` face à `SERVING_DIRECTION.maintenance`.
  maintenance: ["daily_movement", "strength"],
  muscle_gain: ["strength", "recovery"],
};

/** Sans dynamique connue: le repère public nu. */
const DEFAULT_EMPHASES: readonly ActivityEmphasis[] = ["daily_movement", "strength"];

/**
 * La ligne d'ouverture, modulée par le niveau déclaré.
 *
 * ⚠️ Le niveau ne sert QU'À ÇA. Il n'entre dans aucun calcul de dépense
 * énergétique, et rien de ce qu'il produit n'est un chiffre sur la personne.
 *
 * Absent ⇒ ligne générique, jamais une supposition: deviner « sédentaire »
 * chez quelqu'un qui n'a rien dit produirait un conseil condescendant et faux.
 */
function openingLine(level: ActivityLevel | null, locale: "en" | "fr"): string {
  switch (level) {
    case "sedentary":
      return locale === "fr"
        ? "Le plus utile ici est d'ajouter du mouvement là où il n'y en a pas encore."
        : "The most useful move here is adding movement where there is none yet.";
    case "lightly_active":
      return locale === "fr"
        ? "Il y a déjà une base : la régularité vaut mieux que l'intensité."
        : "There is a base already: regularity beats intensity.";
    case "active":
      return locale === "fr"
        ? "L'activité est là ; c'est ce qui la rend tenable qui compte."
        : "The activity is there; what keeps it sustainable is what matters.";
    case "very_active":
      return locale === "fr"
        ? "Le volume est là. La récupération est ce qui le rend utile."
        : "The volume is there. Recovery is what makes it count.";
    case null:
      return locale === "fr"
        ? "Quelques repères, à prendre ou à laisser selon ta semaine."
        : "A few markers, to take or leave depending on your week.";
  }
}

/**
 * La section d'activité — ou rien.
 *
 * ── `null` N'EST PAS UNE SECTION VIDE ──────────────────────────────────────
 * Sous une des quatre portes, la fonction rend `null` et l'appelant N'ÉMET PAS
 * la clé. Une section vide occupe le rang d'une section et invite à la
 * commenter — après quoi l'élève lit « je ne peux rien te dire sur l'activité »,
 * ce qui est exactement l'information qu'on refusait de donner.
 */
export function activitySectionFor(input: ActivityInput): ActivitySection | null {
  // ── LES QUATRE PORTES ───────────────────────────────────────────────────
  // Dans l'ordre de gravité, et AUCUNE n'est levée par la posture du coach.
  if (input.restrictionFlag) return null;
  if (input.hasDeclaredCondition) return null;
  if (input.isMinor) return null;
  if (input.stance.mode === "off") return null;

  const fromCoach = input.stance.mode === "coach" &&
    input.stance.emphases.length > 0;

  // Le coach REMPLACE le plancher, il ne fusionne pas avec lui — même règle
  // que la doctrine de composition.
  const emphases = fromCoach
    ? input.stance.emphases
    : input.goal
    ? HOUSE_EMPHASES[input.goal]
    : DEFAULT_EMPHASES;

  const lines = [
    openingLine(input.level, input.locale),
    ...emphases.map((e) => EMPHASIS_LINES[e][input.locale]),
  ];

  return { lines, attributedToCoach: fromCoach };
}
