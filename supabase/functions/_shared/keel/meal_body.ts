/**
 * FF-030 (volet élève) — LE CORPS, TEL QU'IL ENTRE DANS UNE CONSIGNE DE
 * COMPOSITION.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-030-le-contexte-de-composition.md`
 *
 * ── CE QUE CE MODULE N'EST PAS ─────────────────────────────────────────────
 * Ce n'est pas `student_body.ts`. Celui-là répond à « quelles convictions du
 * coach remonter, et combien de lignes en tirer » — il travaille sur des
 * TENDANCES et interdit explicitement de citer une mesure. Ici la question est
 * autre: « quelle taille fait l'assiette », et elle a besoin de la VALEUR.
 *
 * Les fondre aurait fait entrer un poids en clair dans le générateur de plan
 * hebdo, qui a passé un chantier entier à décider qu'il n'en voulait pas.
 *
 * ── LA GARDE VIT ICI, PAS CHEZ L'APPELANT (FF-030 R5) ──────────────────────
 * Sous `restriction_flag`, ni taille ni poids ni tour de taille ne partent dans
 * la consigne: le plancher TCA vaut pour ce que le MODÈLE lit, pas seulement
 * pour ce que l'écran affiche. Un modèle à qui on donne un poids et une
 * direction `fat_loss` compose en écart.
 *
 * Cette garde n'est PAS un `if` chez l'appelant. `restrictionFlag` est un champ
 * REQUIS de `MealBodyContext`: composer un contexte de corps sans avoir répondu
 * à la question ne compile pas. Ce dépôt a déjà payé « paramètre de garde
 * optionnel = garde désarmée » — une garde qu'un appelant applique est une
 * garde que le prochain appelant oublie.
 *
 * ── L'ÂGE EST UNE BANDE, PAS UN NOMBRE (FF-030 R8) ─────────────────────────
 * Arbitrage déjà écrit sur `ageBandOf` (`student_age.ts`) et repris tel quel:
 * le modèle n'a aucun usage légitime de « 34 » qu'il n'ait de « adulte », et
 * une bande ne peut pas ressortir dans une prose (« à 34 ans, vous… »), ce
 * qu'un nombre exact finit toujours par faire.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { AgeBand } from "./student_age.ts";
import type { DatedMeasure } from "./student_body.ts";
import type { MemberAgeState } from "./household.ts";

/** Les trois valeurs que la base accepte (`profiles_gender_check`). */
export const MEAL_BODY_GENDERS = ["male", "female", "other"] as const;
export type MealBodyGender = (typeof MEAL_BODY_GENDERS)[number];

/**
 * La bande d'âge, en anglais lisible.
 *
 * Le modèle lit de l'anglais, pas des slugs — même raison que `OCCASION_PROSE`
 * et `DAY_PROSE` dans `meal_generation.ts`. « 30_44 » dans une phrase se lit
 * comme un identifiant, et un identifiant invite à être recopié tel quel.
 */
export const MEAL_AGE_BAND_PROSE: Record<AgeBand, string> = {
  "18_29": "18 to 29",
  "30_44": "30 to 44",
  "45_59": "45 to 59",
  "60_plus": "60 or older",
};

/**
 * CE QU'ON SAIT DU CORPS DE CET ÉLÈVE, réduit à ce qu'une consigne de
 * composition a le droit de lire.
 *
 * Ce qui N'Y EST PAS, et n'y entrera pas: `target_weight_kg` et
 * `target_waist_cm`. Le nombre visé ne change pas ce qu'on met dans l'assiette,
 * et un modèle qui lit « vise 72, en pèse 98 » raisonne en écart, en déficit et
 * en délai — le terrain d'énergie que `CONTRACT.md` clôture. La DIRECTION
 * passe, elle, par le jeton `goal` et par `focus_axis`.
 */
export interface MealBodyContext {
  /** `profiles.height_cm`, ou `null`. En centimètres. */
  heightCm: number | null;
  /** DÉRIVÉE de `profiles.birth_date` à chaque lecture. Jamais un âge stocké. */
  ageBand: AgeBand | null;
  /** `profiles.gender`. Liste fermée; une valeur hors liste vaut `null`. */
  gender: MealBodyGender | null;
  /** La dernière pesée connue, AVEC sa date. `null` = jamais pesé. */
  latestWeight: DatedMeasure | null;
  /** Le dernier tour de taille connu, AVEC sa date. */
  latestWaist: DatedMeasure | null;
  /**
   * LE PLANCHER TCA, tel que `evaluateRestrictionForStudent` l'a rendu.
   *
   * REQUIS, jamais optionnel, et jamais `boolean | undefined`: voir l'en-tête.
   * Une lecture EN ÉCHEC vaut `true` (FF-030 R6) — fail-closed, parce que se
   * fermer rend exactement le produit d'hier (une portion dimensionnée sans le
   * corps) pendant que s'ouvrir met un poids sous les yeux du modèle pour un
   * élève qu'on n'a pas su évaluer.
   */
  restrictionFlag: boolean;
}

export interface MealBodyBlocks {
  /** Les lignes de `-- WHO THEY ARE --`. Vide = rien de connu. */
  whoTheyAre: string[];
  /** Les lignes de `-- WHERE THEY ARE NOW --`. Vide = rien, ou plancher levé. */
  whereTheyAreNow: string[];
}

/** Une mesure et sa date, en une ligne. */
function measureLine(
  label: string,
  measure: DatedMeasure,
  unit: string,
): string {
  return `- ${label}: ${measure.value} ${unit}, measured week of ${measure.weekStart}`;
}

/**
 * Le corps, en deux blocs de prose — et la garde du plancher, appliquée une
 * fois, ici.
 *
 * ── POURQUOI DEUX BLOCS RENDUS PAR UN SEUL APPEL ───────────────────────────
 * Ils atterrissent à deux endroits différents de la consigne (ce qu'on EST, et
 * où l'on en EST, séparés par ce qu'on VISE). Deux fonctions les auraient
 * rendus séparément — et la garde du plancher aurait dû être écrite deux fois,
 * ou vivre chez l'appelant. Un seul appel, une seule garde.
 *
 * ── UNE ABSENCE NE PRODUIT AUCUNE LIGNE ────────────────────────────────────
 * Pas de « height: not stated ». Une ligne qui annonce une absence occupe le
 * même rang qu'une contrainte, et elle invite le modèle à la commenter — après
 * quoi l'élève lit « je ne connais pas ta taille » dans la justification d'un
 * plat. Même posture que `rhythmLines`, qui ne complète jamais une taille de
 * repas non déclarée.
 */
export function mealBodyBlocks(body: MealBodyContext | null): MealBodyBlocks {
  const empty: MealBodyBlocks = { whoTheyAre: [], whereTheyAreNow: [] };
  if (!body) return empty;

  // ── LE PLANCHER TCA ─────────────────────────────────────────────────────
  // Il retire la TAILLE et les MESURES, et laisse l'âge et le sexe. La
  // frontière n'est pas « ce qui est sensible », elle est « ce qui se vise »:
  // on peut restreindre pour changer un poids, un tour de taille, et — la
  // clinique le documente — pour arrêter de grandir. On ne peut pas
  // restreindre pour changer son âge ou son sexe, donc les lire ne nourrit
  // aucune boucle.
  const bodyMetricsAllowed = !body.restrictionFlag;

  const who: string[] = [];
  if (bodyMetricsAllowed && body.heightCm !== null) {
    who.push(`- height: ${body.heightCm} cm`);
  }
  if (body.ageBand !== null) {
    who.push(`- age band: ${MEAL_AGE_BAND_PROSE[body.ageBand]}`);
  }
  if (body.gender !== null) {
    who.push(`- gender, as they picked it: ${body.gender}`);
  }
  if (who.length > 0) {
    // CE QU'ON ATTEND DE CES CHIFFRES, ET CE QU'ON N'EN ATTEND PAS.
    //
    // Taille + poids + âge + sexe est la signature d'entrée d'une formule de
    // métabolisme de base, et un modèle sait la calculer sans qu'on le lui
    // demande. Dire seulement « voici le corps » aurait donc livré un compteur
    // de calories par la porte de derrière, dans un produit qui en refuse un.
    who.push(
      "These are here for ONE thing: the SIZE of a portion. A palm of protein " +
        "is not the same palm on a small person and a tall one.",
      "Never derive anything else from them — no daily energy need, no calorie " +
        "figure, no BMI, no category, no target. And never write them back to " +
        "the student: you are sizing a plate, not assessing a person.",
    );
  }

  const now: string[] = [];
  if (bodyMetricsAllowed) {
    if (body.latestWeight) now.push(measureLine("weight", body.latestWeight, "kg"));
    if (body.latestWaist) now.push(measureLine("waist", body.latestWaist, "cm"));
  }
  if (now.length > 0) {
    // LA DATE EST PORTÉE PAR LA LIGNE, et la consigne dit pourquoi. « 78 kg »
    // ne dit rien; « 78 kg, semaine du 30 juin » dit quelque chose. C'est la
    // règle déjà posée sur `DatedMeasure`, rendue lisible au modèle.
    now.push(
      "Size portions from this, and use it for nothing else. Do not comment on " +
        "it, do not quote it back, do not compare it to anything, and do not " +
        "work out a rate of change from it. A measurement carries its date " +
        "because an old one is not today's.",
    );
  }

  return { whoTheyAre: who, whereTheyAreNow: now };
}

/**
 * LE MÊME CORPS, POUR UNE BOUCHE PARMI D'AUTRES (lot 3B du chantier foyer).
 *
 * Autorité produit: `docs/keel/CHANTIER-FOYER-PROFILS.md` §« Lot 3B ».
 *
 * ── POURQUOI ICI, COLLÉ À `mealBodyBlocks`, ET PAS DANS LE MODULE FOYER ────
 * Ce sont DEUX RENDUS DU MÊME JEU DE FAITS. Les séparer dans deux fichiers
 * ferait diverger la liste des champs qu'une consigne de composition a le droit
 * de lire — et la divergence serait muette: elle ne casserait rien, elle
 * mettrait juste une donnée de plus (ou de moins) sous les yeux du modèle. Côte
 * à côte, un champ ajouté à `MealBodyContext` se voit non traité ici.
 *
 * ── ⚠️ PLUS STRICT QUE `mealBodyBlocks`, DÉLIBÉRÉMENT ─────────────────────
 * Sous `restrictionFlag`, `mealBodyBlocks` laisse passer la BANDE D'ÂGE et le
 * SEXE (« on ne restreint pas pour changer son âge »). Ici, le plancher levé —
 * ou ILLISIBLE, les deux valent `true` — ne laisse RIEN passer.
 *
 * Ce n'est pas un oubli, c'est l'arbitrage écrit du lot 3B: « un membre dont le
 * plancher est illisible ne reçoit AUCUN fait corporel ». Deux raisons propres
 * au foyer, qui n'existent pas sur le chemin individuel:
 *
 *   1. Ces faits arrivent NOMMÉMENT, à côté du prénom d'une personne, dans un
 *      bloc dont la sortie attendue est lue à voix haute à table. « Léa: femme,
 *      45 à 59 » n'a pas le même statut que la même phrase dans un prompt qui
 *      ne parle que d'une seule personne, celle qui le lira.
 *   2. Le rendement est nul: seuls, une bande d'âge et un sexe ne dimensionnent
 *      pas une assiette — c'est la TAILLE qui le fait, et elle est justement ce
 *      que le plancher retire. On paie donc le risque sans acheter la précision.
 *
 * Le coût assumé: un membre sous plancher est indiscernable d'un membre dont on
 * ne sait rien. C'est voulu — voir `buildPortionBrief`, où c'est précisément ce
 * qui empêche le plancher d'être observable dans le brief.
 *
 * ── ⚠️ `ageState` EST REQUIS, ET C'EST LA SECONDE GARDE ───────────────────
 * Un MINEUR, et une bouche d'âge INCONNU, ne reçoivent aucun fait corporel.
 *
 * Ce n'est pas une redite de `goalApplies`, c'est la porte de derrière qu'il
 * laissait ouverte. `goalApplies` refuse la DIRECTION dérivée d'un objectif;
 * une taille et une pesée posées à côté du prénom d'un enfant rendent cette
 * direction DÉRIVABLE — un modèle qui lit « 128 cm, 41 kg » compose l'assiette
 * qu'il aurait composée pour `fat_loss` sans qu'on la lui ait demandée. Le
 * chantier le dit en une ligne: on ne contourne pas `goalApplies` en passant
 * par le corps.
 *
 * Et le registre du produit le veut aussi: « expliquer à un enfant que sa part
 * est plus petite pour son poids est à une phrase d'un dégât réel » (§8.4).
 * L'âge INCONNU suit le mineur, pour la raison habituelle — « je ne sais pas »
 * et « majeur » doivent produire des résultats opposés, et un enfant dont
 * personne n'a saisi la date ne doit pas être traité comme un adulte.
 *
 * Le paramètre est POSITIONNEL et REQUIS, pas optionnel: ce dépôt a payé
 * « paramètre de garde optionnel = garde désarmée » (`safetyBand`, muet
 * pendant des semaines). Le compilateur liste les appelants.
 *
 * Coût assumé: un adolescent qui a réclamé son profil ne gagne aucune précision
 * de taille de part. C'est le produit d'aujourd'hui, et c'est le repli que tout
 * ce lot prend partout ailleurs.
 */
export function householdBodyFacts(
  body: MealBodyContext | null,
  ageState: MemberAgeState,
): string[] {
  if (!body) return [];
  if (ageState !== "adult") return [];
  if (body.restrictionFlag) return [];

  const facts: string[] = [];
  if (body.heightCm !== null) facts.push(`height ${body.heightCm} cm`);
  if (body.ageBand !== null) {
    facts.push(`age band ${MEAL_AGE_BAND_PROSE[body.ageBand]}`);
  }
  if (body.gender !== null) facts.push(`gender ${body.gender}`);
  // LA DATE VOYAGE AVEC LA MESURE, ici aussi. Même règle que `measureLine`:
  // « 78 kg » ne dit rien, « 78 kg, semaine du 30 juin » dit quelque chose — et
  // la retirer pour raccourcir la ligne ferait servir en août une pesée de
  // février comme si c'était celle d'aujourd'hui.
  if (body.latestWeight) {
    facts.push(
      `weight ${body.latestWeight.value} kg, measured week of ${body.latestWeight.weekStart}`,
    );
  }
  if (body.latestWaist) {
    facts.push(
      `waist ${body.latestWaist.value} cm, measured week of ${body.latestWaist.weekStart}`,
    );
  }
  return facts;
}
