/**
 * LES FAITS D'UNE BOUCHE, RÉSOLUS UNE FOIS, AVEC LA PROVENANCE DE CHAQUE
 * VALEUR.
 *
 * ⛔ CE MODULE EXISTE POUR RETIRER UNE CONCURRENCE, PAS POUR AJOUTER UNE
 * SOURCE. Le générateur du foyer portait DEUX lectures de corps qui ne se
 * parlaient pas:
 *
 *   · `bodies` (`loadHouseholdMemberBodies`) — les pesées DATÉES du compte,
 *     plus le plancher TCA. Sert le BRIEF, c'est-à-dire ce que le modèle lit.
 *   · `lineBodies` (`keel_household_bodies_for`) — le corps que le maître a
 *     SAISI sur la fiche de chaque bouche. Sert le MOTEUR: les grammages.
 *
 * Conséquence mesurée: une personne qui se pesait toutes les semaines voyait
 * son plan dimensionné sur le chiffre que quelqu'un avait tapé une fois à
 * l'inscription. « Une nouvelle pesée modifie la cible et les grammages » est
 * la fin du lot 3; sans ce module, elle ne modifiait que le brief.
 *
 * ── LA RÈGLE, EN UNE PHRASE ────────────────────────────────────────────────
 * Pour une bouche QUI A UN COMPTE, le fait personnel gagne. La fiche ne sert
 * que pour un champ RÉELLEMENT ABSENT — et le repli est tracé.
 *
 * ⛔ UNE LECTURE EN ÉCHEC N'EST PAS UNE ABSENCE, et c'est la moitié du lot.
 * Se replier sur la fiche quand la lecture personnelle est tombée servirait
 * un chiffre périmé sous les traits d'un chiffre à jour, sans que personne ne
 * l'apprenne. On rend donc `read_failed`, la valeur reste vide, et l'appelant
 * le voit.
 *
 * ⚠️ RIEN D'ICI NE VA DANS UN PROMPT. Ce sont des faits de calcul; le brief a
 * sa propre porte (`meal_body.ts`), qui n'énonce jamais un poids d'enfant.
 */

import type { ActivityAxes, MouthBody } from "./meal_envelope.ts";
// ⚠️ `ActivityLevel` et `AppetiteLevel` viennent de `tokens.ts`, PAS de
// `meal_envelope.ts` qui ne fait que les ré-importer. Passer par le
// ré-importeur ferait un chemin de plus vers le même vocabulaire fermé.
import type { ActivityLevel, AppetiteLevel } from "./tokens.ts";

/** D'où vient la valeur retenue, pour CE champ-là. */
export type MouthFactSource =
  /** Le lecteur personnel du compte lié: profil et série de pesées datées. */
  | "personal"
  /** La fiche que le maître a saisie sur `household_members`. */
  | "member_sheet"
  /** Les deux ont répondu « rien ». Aucune valeur n'existe. */
  | "absent"
  /** La lecture personnelle est TOMBÉE. Ce n'est pas une absence. */
  | "read_failed";

/** Les champs dont la provenance est suivie. */
export const MOUTH_FACT_FIELDS = [
  "heightCm",
  "weightKg",
  "gender",
  "ageYears",
  "activityLevel",
  "activityAxes",
  "appetite",
] as const;

export type MouthFactField = typeof MOUTH_FACT_FIELDS[number];

/**
 * CE QUE LE LECTEUR PERSONNEL SAIT, mis à plat.
 *
 * ⚠️ `MealBodyContext` ne suffisait PAS: il rend une BANDE d'âge (mineur /
 * adulte) et jette l'âge en années, et il ne porte pas les deux axes
 * d'activité. Le moteur a besoin des deux — d'où cette forme-ci, remplie par
 * le même chargeur, sans lecture supplémentaire.
 */
export interface PersonalMouthFacts {
  /**
   * ⛔ `"failed"` COUPE TOUT REPLI sur la fiche. Une lecture tombée laisse la
   * bouche sans fait plutôt qu'avec un fait périmé.
   */
  read: "ok" | "failed";
  heightCm: number | null;
  /** La DERNIÈRE pesée datée, sa valeur. `null` = jamais pesé. */
  weightKg: number | null;
  /** La semaine de cette pesée. Une mesure sans sa date ne dit rien. */
  weightAsOf: string | null;
  gender: MouthBody["gender"];
  /**
   * DÉRIVÉ de la date personnelle canonique (`usableAge`), jamais d'une bande.
   * `null` = date absente, illisible ou aberrante — et on n'en invente pas.
   */
  ageYears: number | null;
  activityLevel: ActivityLevel | null;
  activityAxes: ActivityAxes;
}

/** Un fait de bouche résolu: la valeur, et d'où elle vient. */
export interface ResolvedMouth {
  memberId: string;
  /** `null` = bouche sans compte. La fiche est alors la seule autorité. */
  userId: string | null;
  /** La forme que le moteur consomme déjà. Rien de neuf en aval. */
  body: MouthBody;
  /** Pour chaque champ, d'où vient ce qui est dans `body`. */
  from: Record<MouthFactField, MouthFactSource>;
  /**
   * Les désaccords entre les deux sources, nommés. Vide dans le cas courant.
   * ⚠️ UN CONFLIT N'EST PAS UNE ERREUR: il est normal qu'une fiche saisie il y
   * a six mois ne dise pas ce que dit la pesée de mardi. Ce qui serait une
   * erreur, c'est de ne pas le savoir.
   */
  conflicts: string[];
}

const ABSENT_AXES: ActivityAxes = { day: null, sport: null, asked: false };

/**
 * `true` si l'âge fait de cette personne une mineure.
 * ⚠️ 18 EST LE SEUIL DU DÉPÔT (voir `student_age.ts`). Il n'est pas répété
 * ailleurs dans ce fichier.
 */
function isMinor(age: number | null): boolean {
  return age !== null && age < 18;
}

/**
 * LA RÉSOLUTION D'UN CHAMP SIMPLE: personnel d'abord, fiche pour l'absence.
 *
 * `personalRead === "failed"` rend `read_failed` SANS regarder la fiche —
 * c'est la garde de tête de ce fichier.
 */
function pick<T>(
  personalRead: "ok" | "failed",
  personalValue: T | null,
  sheetValue: T | null,
): { value: T | null; from: MouthFactSource } {
  if (personalRead === "failed") return { value: null, from: "read_failed" };
  if (personalValue !== null) return { value: personalValue, from: "personal" };
  if (sheetValue !== null) return { value: sheetValue, from: "member_sheet" };
  return { value: null, from: "absent" };
}

/**
 * RÉSOUT UNE BOUCHE. PURE: aucune lecture, aucune horloge.
 *
 * @param personal `null` pour une bouche SANS COMPTE — il n'y a alors rien à
 *   lire côté personnel, et ce n'est pas un échec.
 * @param sheet la fiche saisie par le maître, ou `null` si la ligne n'en porte
 *   pas (les trois colonnes de corps sont `not null` en base: c'est tout ou
 *   rien, comme le lecteur du générateur le fait déjà).
 */
export function resolveMouth(args: {
  memberId: string;
  userId: string | null;
  personal: PersonalMouthFacts | null;
  sheet: MouthBody | null;
}): ResolvedMouth {
  const { memberId, userId, sheet } = args;
  const conflicts: string[] = [];

  // ── UNE BOUCHE SANS COMPTE: LA FICHE EST L'AUTORITÉ, ET LA SEULE ────────
  // Ce n'est pas un repli — c'est le cas nominal d'un enfant, d'un conjoint
  // sans compte, d'un invité. Le marquer `member_sheet` le dit sans le
  // dénigrer.
  if (args.personal === null) {
    const from = Object.fromEntries(
      MOUTH_FACT_FIELDS.map((
        f,
      ) => [f, sheet === null ? "absent" : "member_sheet"]),
    ) as Record<MouthFactField, MouthFactSource>;
    // ⚠️ UN CHAMP VIDE DANS LA FICHE RESTE `absent`, même quand la fiche
    // existe: « la fiche a répondu » et « la fiche existe » sont deux faits.
    if (sheet !== null) {
      if (sheet.ageYears === null) from.ageYears = "absent";
      if (sheet.activityLevel === null) from.activityLevel = "absent";
      if (sheet.appetite === null) from.appetite = "absent";
      if (
        sheet.activityAxes.day === null && sheet.activityAxes.sport === null
      ) {
        from.activityAxes = "absent";
      }
    }
    return {
      memberId,
      userId,
      body: sheet ?? {
        heightCm: null,
        weightKg: null,
        gender: null,
        ageYears: null,
        activityLevel: null,
        activityAxes: ABSENT_AXES,
        appetite: null,
      },
      from,
      conflicts,
    };
  }

  const p = args.personal;
  const height = pick(p.read, p.heightCm, sheet?.heightCm ?? null);
  const weight = pick(p.read, p.weightKg, sheet?.weightKg ?? null);
  const gender = pick(p.read, p.gender, sheet?.gender ?? null);
  const activity = pick(p.read, p.activityLevel, sheet?.activityLevel ?? null);

  // ── LES AXES: RÉPONDUS OU RIEN ────────────────────────────────────────
  // ⚠️ ON NE MÉLANGE PAS UN AXE PERSONNEL AVEC L'AUTRE VENU DE LA FICHE. Le
  // couple `(journée, sport)` est lu ensemble par `activityFactorOf`; en
  // recomposer un depuis deux personnes différentes produirait un facteur que
  // personne n'a décrit.
  const personalAxesAnswered = p.activityAxes.day !== null ||
    p.activityAxes.sport !== null;
  const sheetAxesAnswered = (sheet?.activityAxes.day ?? null) !== null ||
    (sheet?.activityAxes.sport ?? null) !== null;
  const axes: { value: ActivityAxes; from: MouthFactSource } =
    p.read === "failed"
      ? { value: ABSENT_AXES, from: "read_failed" }
      : personalAxesAnswered
      ? { value: p.activityAxes, from: "personal" }
      : sheetAxesAnswered
      ? { value: sheet!.activityAxes, from: "member_sheet" }
      : {
        value: p.activityAxes.asked ? p.activityAxes : ABSENT_AXES,
        from: "absent",
      };

  // ── L'ÂGE: LA DATE PERSONNELLE FAIT AUTORITÉ, ET LA PROTECTION GAGNE ───
  // ⛔ UNE CONTRADICTION NE DOIT JAMAIS FAIRE PASSER UN MINEUR POUR MAJEUR.
  // Le maître a pu saisir « 15 ans » sur la fiche d'un compte dont la date de
  // naissance dit 19 — ou l'inverse. Tant que les deux ne sont pas d'accord,
  // on applique le plus protecteur (le plus jeune) et on NOMME le conflit.
  // ⚠️ ON N'INVENTE AUCUNE DATE: si la date personnelle est absente ou
  // illisible, `ageYears` reste `null` côté personnel et la fiche reprend son
  // rôle de source pour l'absence, comme les autres champs.
  const sheetAge = sheet?.ageYears ?? null;
  let age = pick(p.read, p.ageYears, sheetAge);
  if (
    p.read === "ok" && p.ageYears !== null && sheetAge !== null &&
    p.ageYears !== sheetAge
  ) {
    conflicts.push("age_disagreement");
    if (isMinor(sheetAge) !== isMinor(p.ageYears)) {
      // ⛔ LE CAS QUI COMPTE: l'une des deux sources dit « mineur ». On prend
      // le plus jeune, quelle que soit celle qui le dit.
      conflicts.push("age_minor_conflict");
      age = { value: Math.min(p.ageYears, sheetAge), from: "member_sheet" };
      if (age.value === p.ageYears) age.from = "personal";
    }
  }

  // ⚠️ L'APPÉTIT RESTE SUR LA FICHE, ET C'EST ÉCRIT DANS LE CHANTIER. Ce
  // n'est pas une mesure du corps: c'est une déclaration de confort, saisie au
  // même endroit pour toutes les bouches — avec ou sans compte.
  const appetite: { value: AppetiteLevel | null; from: MouthFactSource } =
    (sheet?.appetite ?? null) !== null
      ? { value: sheet!.appetite, from: "member_sheet" }
      : { value: null, from: "absent" };

  // Un désaccord de poids n'est pas un conflit à arbitrer — la pesée datée
  // gagne, par construction — mais il se TRACE: c'est exactement le défaut que
  // ce module ferme, et le compter dit s'il existe encore.
  if (
    p.read === "ok" && p.weightKg !== null &&
    (sheet?.weightKg ?? null) !== null &&
    p.weightKg !== sheet!.weightKg
  ) {
    conflicts.push("weight_sheet_stale");
  }

  return {
    memberId,
    userId,
    body: {
      heightCm: height.value,
      weightKg: weight.value,
      gender: gender.value,
      ageYears: age.value,
      activityLevel: activity.value,
      activityAxes: axes.value,
      appetite: appetite.value,
    },
    from: {
      heightCm: height.from,
      weightKg: weight.from,
      gender: gender.from,
      ageYears: age.from,
      activityLevel: activity.from,
      activityAxes: axes.from,
      appetite: appetite.from,
    },
    conflicts,
  };
}

/**
 * LE DÉCOMPTE QUI PART SUR LA LIGNE ÉCRITE.
 *
 * ⛔ SANS LUI, UN LOT DÉBRANCHÉ RESSEMBLE TRAIT POUR TRAIT À UN LOT QUI
 * MARCHE. « Le poids vient maintenant de la pesée » est une affirmation; ce
 * compteur est ce qui la rend vérifiable en SQL, plan par plan.
 */
export function mouthFactTally(
  resolved: readonly ResolvedMouth[],
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const m of resolved) {
    for (const field of MOUTH_FACT_FIELDS) {
      const key = `${field}.${m.from[field]}`;
      tally[key] = (tally[key] ?? 0) + 1;
    }
    for (const c of m.conflicts) {
      tally[`conflict.${c}`] = (tally[`conflict.${c}`] ?? 0) + 1;
    }
  }
  return tally;
}
