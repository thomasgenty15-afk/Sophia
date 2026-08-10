/**
 * FF-039 — L'ENVELOPPE : dans quelle bande cette assiette devrait tomber.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-039-enveloppes-et-verdicts-en-observation.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §2.2 et §2.3.
 *
 * ── CE QUI SORT D'ICI NE VA NULLE PART ────────────────────────────────────
 * Aucune valeur de ce module n'entre dans un prompt, ne s'affiche, ne se dit,
 * ne se journalise en clair. C'est un instrument INTERNE. « Ton objectif 1800
 * kcal » est interdit partout et toujours; ce qu'on calcule ici sert à juger
 * une ASSIETTE, jamais à s'adresser à une personne.
 *
 * ── LE TYPE EST LA GARDE, PAS UN `if` ─────────────────────────────────────
 * Sous plancher TCA — et pour un corps inconnu, par la MÊME branche — le mode
 * est `per_portion`, et ce mode ne porte structurellement NI énergie NI
 * plafond de densité. Il n'y a pas « un champ qu'on prend soin de ne pas
 * lire »: il n'y a pas de champ. Un état illégal ne se représente pas, donc ne
 * se teste pas, donc ne s'oublie pas.
 *
 * ── L'INDISCERNABILITÉ EST L'INVARIANT ────────────────────────────────────
 * Un élève sous flag et un élève dont on ne sait rien produisent la MÊME
 * enveloppe, au caractère près. Deux branches qui se ressemblent divergent; et
 * une branche distincte rendrait le statut de restriction observable en aval,
 * ce que le produit refuse.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { MealBodyContext } from "./meal_body.ts";
import type { AgeBand } from "./student_age.ts";
import type { GoalToken } from "./tokens.ts";
import {
  applyPiloting,
  type SteeringEntry,
} from "./composition_steering.ts";

// ---------------------------------------------------------------------------
// LE TYPE
// ---------------------------------------------------------------------------

export interface EnergyBand {
  low: number;
  high: number;
}

/**
 * Les deux formes, et elles ne se mélangent pas.
 *
 * `per_portion` n'a AUCUN champ par-kg et AUCUN `densityCeiling`. « Rien ne
 * compte à rebours » vaut aussi pour la version sans compteur: sous flag,
 * toute pression de minimisation dérivée de l'objectif est ABSENTE, pas
 * neutralisée.
 *
 * Ce qui survit en `per_portion`: l'ancre protéique (présence), les fréquences
 * sentinelles, la structure, les préférences — tout ce qui vit côté aliment
 * sans viser.
 */
export type Envelope =
  | {
    mode: "per_kg";
    /** `null` quand la maintenance n'est pas estimable (poids inconnu). */
    energy: EnergyBand | null;
    /** Le plancher quotidien, en grammes. */
    proteinFloorG: number;
    /**
     * Non-`null` pour `60_plus`, `muscle_gain` et `recomposition`, et pour
     * RIEN d'autre. Voir `PROTEIN_PER_MEAL_CASES`.
     */
    proteinPerMealG: number | null;
    densityCeiling: number | null;
  }
  | {
    mode: "per_portion";
    /**
     * La seule chose que ce mode affirme: chaque repas principal porte une
     * part protéique. Une PRÉSENCE, jamais une quantité — et surtout jamais
     * une quantité dérivée du corps.
     */
    proteinPortionPerMeal: true;
  };

// ---------------------------------------------------------------------------
// LES CONSTANTES — chaque valeur avec sa référence, aucune éparpillée
// ---------------------------------------------------------------------------

/**
 * LE PLAFOND DE DÉFICIT — ARBITRAGE A1, non débrayable.
 *
 * 500 kcal/j. Aucun paramètre ne le lève, et le jeton qui le lèverait N'EXISTE
 * PAS dans le schéma de pilotage (l'asymétrie avec `surplus_style`, qui a son
 * `"aggressive"`, EST la forme que prend la décision).
 *
 * Deux fondements indépendants du muscle:
 *   1. au-delà, l'énergie du plan passe sous le seuil où la couverture micro
 *      devient mathématiquement improbable (Nutrients 2018; Maillot/Darmon);
 *   2. un moteur qui EXÉCUTE de la restriction rapide est exactement le
 *      produit que le plancher TCA existe pour ne pas être.
 *
 * Ce que ça coûte, et qui est accepté: un coach « sèche agressive » ne peut
 * pas exprimer sa méthode. Il garde sa conviction citable dans le chat; le
 * moteur ne l'exécute pas.
 */
export const MAX_DAILY_DEFICIT_KCAL = 500;

/**
 * Mifflin-St Jeor, puis × 1,5 pour une activité INCONNUE.
 *
 * ── CE FACTEUR EST UNE HYPOTHÈSE, PAS UNE MESURE ─────────────────────────
 * Le produit ne demande pas son activité à l'élève. 1,5 est le milieu
 * « modérément actif », et l'estimation qui en sort est à ±20 % — empilée sur
 * ±10-15 % de table et de cuisson. C'est PLUS LARGE que la bande de
 * `muscle_gain` (5 points), et c'est exactement pourquoi le verdict énergie ne
 * dit qu'une DIRECTION au premier jour (voir `ENERGY_DIRECTION_MARGIN`).
 */
export const ACTIVITY_FACTOR = 1.5;

/**
 * LE GONFLEMENT DE LA BANDE POUR LE RÉGIME « DIRECTION ».
 *
 * Le verdict ne dit `above` / `below` qu'au-delà du bord × 1,10. En dessous de
 * cet écart, l'incertitude de la maintenance estimée est plus grande que
 * l'écart lui-même: trancher y serait décider sur du bruit avec l'autorité
 * d'un calcul.
 *
 * Le régime « bande » fin n'existe pas encore: il demande un ré-ancrage sur
 * l'observé (étape 8 du chantier), et le pré-câbler ici en ferait un champ
 * mort.
 */
export const ENERGY_DIRECTION_MARGIN = 1.10;

/**
 * LES BANDES PAR DYNAMIQUE, en fraction de la maintenance estimée M.
 *
 * `switch` exhaustif plus bas: une dynamique ajoutée sans bande ne compile
 * pas. Chaque valeur porte sa référence — la table est celle du design §2.2,
 * recopiée sans arrondi de confort.
 */
const ENERGY_BANDS: Record<GoalToken, { low: number; high: number }> = {
  // Murphy 2022 (déficit modéré); Garthe 2011: lent > rapide pour la masse
  // maigre. Le plafond de 500 kcal/j s'applique EN PLUS, et gagne.
  fat_loss: { low: 0.75, high: 0.85 },
  // Helms 2023: au-delà de +10 %, on gagne des plis cutanés, pas du muscle.
  muscle_gain: { low: 1.05, high: 1.10 },
  // Barakat 2020.
  recomposition: { low: 0.95, high: 1.05 },
  // Impey 2018: la seule dynamique qui accepterait un `carb_timing` — inerte
  // sans jours d'entraînement déclarés, et hors périmètre de cette étape.
  performance: { low: 1.00, high: 1.10 },
  health: { low: 0.95, high: 1.05 },
  maintenance: { low: 0.95, high: 1.05 },
};

/**
 * LE PLANCHER PROTÉIQUE, en g/kg de poids corporel et par jour.
 *
 * Morton 2018 (intervalle de confiance), borne haute rationale Helms 2014 pour
 * `fat_loss`; Barakat 2020 pour `recomposition`.
 */
const PROTEIN_FLOOR_G_PER_KG: Record<GoalToken, number> = {
  fat_loss: 2.0,
  muscle_gain: 1.6,
  recomposition: 2.0,
  performance: 1.6,
  health: 1.6,
  maintenance: 1.6,
};

/**
 * LE PLANCHER SPÉCIFIQUE DES 60 ANS ET PLUS.
 *
 * Moore 2015, PROT-AGE: ≥1,2 g/kg/j, et une ancre d'environ 0,4 g/kg sur au
 * moins deux à trois prises. Il ÉLÈVE le plancher de la dynamique quand
 * celui-ci est plus bas; il ne l'abaisse jamais.
 */
const SENIOR_PROTEIN_FLOOR_G_PER_KG = 1.2;
const SENIOR_PROTEIN_PER_MEAL_G_PER_KG = 0.4;

/**
 * LES TROIS CAS — ET SEULEMENT TROIS — OÙ LA DISTRIBUTION PAR REPAS EXISTE.
 *
 * `60_plus` (Moore 2015, PROT-AGE), `muscle_gain` et `recomposition`
 * (placement, pas contenu). Partout ailleurs, Schoenfeld 2013 classe la
 * distribution comme du bruit hors seniors: un paramètre y serait décoratif,
 * et un paramètre décoratif finit par être piloté.
 *
 * La part par repas des deux dynamiques d'entraînement: le plancher quotidien
 * réparti sur trois prises. Ce n'est pas une cible affichable — c'est ce que
 * le vérificateur compare au CALCUL du plat.
 */
const TRAINING_PROTEIN_MEALS = 3;

/**
 * LES PLAFONDS DE DENSITÉ, en kcal par gramme d'aliment.
 *
 * ⚠️ CONSTANTES OPÉRATIONNELLES, ET C'EST AVOUÉ. La méta-analyse des 38 RCT
 * prouve la DIRECTION (une densité plus basse fait manger moins à satiété
 * égale), pas le seuil. Ces deux nombres sont calibrés en observation pendant
 * la phase où les verdicts ne sont pas actionnés; les présenter comme issus de
 * la littérature serait défendre un chiffre indéfendable.
 */
export const DENSITY_CEILING_FAT_LOSS = 1.3;
export const DENSITY_CEILING_DEFAULT = 1.8;

// ---------------------------------------------------------------------------
// LA MAINTENANCE ESTIMÉE
// ---------------------------------------------------------------------------

/**
 * Mifflin-St Jeor × facteur d'activité. `null` dès qu'une entrée manque.
 *
 * INTERNE. Ce nombre ne sort jamais du module: il sert à borner une bande, pas
 * à être dit. Le sexe entre dans la formule parce que la formule le demande —
 * pas parce qu'on catégorise qui que ce soit.
 *
 * `other` n'a pas de constante propre dans Mifflin-St Jeor. On prend la
 * moyenne des deux plutôt que d'en choisir une: choisir serait assigner, et la
 * moyenne est la seule réponse qui ne le fait pas. L'écart entre les deux
 * constantes (166 kcal) est du même ordre que l'incertitude du facteur
 * d'activité, donc le choix ne change pas la nature du verdict.
 */
export function estimatedMaintenanceKcal(args: {
  weightKg: number | null;
  heightCm: number | null;
  ageBand: AgeBand | null;
  gender: "male" | "female" | "other" | null;
}): number | null {
  const { weightKg, heightCm, ageBand, gender } = args;
  if (!weightKg || !heightCm || !ageBand) return null;
  // L'ÂGE EST UNE BANDE, PAS UN NOMBRE (FF-030 R8). On prend le MILIEU de la
  // bande: la formule demande des années, et une bande de quinze ans pèse ~150
  // kcal sur le résultat — largement à l'intérieur de l'incertitude du facteur
  // d'activité. Redemander l'âge exact au seul profit de cette formule serait
  // rouvrir une décision déjà prise ailleurs.
  const midAge: Record<AgeBand, number> = {
    "18_29": 24,
    "30_44": 37,
    "45_59": 52,
    "60_plus": 67,
  };
  const base = 10 * weightKg + 6.25 * heightCm - 5 * midAge[ageBand];
  const offsetMale = 5;
  const offsetFemale = -161;
  const offset = gender === "male"
    ? offsetMale
    : gender === "female"
    ? offsetFemale
    : (offsetMale + offsetFemale) / 2;
  const bmr = base + offset;
  if (!Number.isFinite(bmr) || bmr <= 0) return null;
  return Math.round(bmr * ACTIVITY_FACTOR);
}

// ---------------------------------------------------------------------------
// L'ENVELOPPE
// ---------------------------------------------------------------------------

/**
 * L'enveloppe DÉGRADÉE — une seule, partagée.
 *
 * Elle sert au plancher TCA ET au corps inconnu, et c'est l'invariant: les
 * deux populations produisent un objet identique, donc rien en aval ne peut
 * les distinguer. Une constante gelée plutôt qu'un littéral recréé à chaque
 * appel: deux littéraux se mettent à diverger le jour où quelqu'un « ajuste »
 * l'un des deux.
 */
const DEGRADED_ENVELOPE: Envelope = Object.freeze({
  mode: "per_portion",
  proteinPortionPerMeal: true,
});

/**
 * L'enveloppe de cet élève.
 *
 * ── TOUS LES PARAMÈTRES SONT REQUIS, ET FAIL-CLOSED ──────────────────────
 * `restrictionFlag` en particulier: ce dépôt a payé « paramètre de garde
 * optionnel = garde désarmée ». Il est déjà un champ REQUIS de
 * `MealBodyContext`, et il est repris ici séparément pour que la lane foyer —
 * qui n'a PAS de corps (`body: null`) — puisse quand même le passer.
 *
 * ── `steering` EST REQUIS (FF-041) ───────────────────────────────────────
 * Ajouté à l'étape 6, et REQUIS plutôt qu'optionnel: la casse de compilation
 * est le mécanisme qui recense les appelants. `null` = aucune doctrine ne
 * pilote, ce qui est le cas de toute la base aujourd'hui et doit rendre
 * exactement le produit d'avant.
 *
 * Il est appliqué EN DERNIER, par `applyPiloting`, et à l'INTÉRIEUR de tout ce
 * qui précède: les ceintures produit (plafond de déficit A1, planchers) sont
 * déjà posées quand le pilotage arrive, donc il ne peut pas les outrepasser.
 * C'est la hiérarchie de préséance du design §3.6, rendue vraie par l'ordre
 * des lignes plutôt que par une vérification.
 */
export function envelopeFor(
  goal: GoalToken,
  body: MealBodyContext | null,
  ageBand: AgeBand | null,
  restrictionFlag: boolean,
  steering: SteeringEntry | null,
): Envelope {
  // ── LA BRANCHE UNIQUE ───────────────────────────────────────────────────
  // Sous flag OU corps absent OU poids inconnu. Trois causes, une seule
  // sortie: c'est ce qui rend le statut de restriction illisible en aval.
  const weightKg = body?.latestWeight?.value ?? null;
  // Le pilotage n'a AUCUNE prise ici, et c'est le point: sous flag ou sans
  // corps, l'enveloppe dégradée est la même pour tout le monde, coach pilote
  // ou pas. Un steering qui changerait quoi que ce soit à cette branche
  // rendrait le statut de restriction observable.
  if (restrictionFlag || !body || !weightKg) return DEGRADED_ENVELOPE;

  const maintenance = estimatedMaintenanceKcal({
    weightKg,
    heightCm: body.heightCm,
    ageBand,
    gender: body.gender,
  });

  const band = ENERGY_BANDS[goal];
  let energy: EnergyBand | null = null;
  if (maintenance !== null) {
    const low = Math.round(maintenance * band.low);
    const high = Math.round(maintenance * band.high);
    // ── LE PLAFOND DE DÉFICIT MORD ICI, ET IL GAGNE (A1) ─────────────────
    // Sur un grand gabarit, « M − 25 % » vaut bien plus que 500 kcal: c'est
    // exactement le cas que ce plafond existe pour couvrir, et c'est celui
    // qu'un pourcentage seul laisserait passer.
    //
    // IL REMONTE LES DEUX BORDS, PAS SEULEMENT LE BAS. Mesuré par le test de
    // ce module au premier passage: sur un gabarit de 140 kg, « M − 15 % » est
    // DÉJÀ un déficit de 556 kcal — le haut de la bande violait le plafond
    // pendant que le bas le respectait, et l'enveloppe prescrivait donc un
    // déficit supérieur au plafond sur toute sa largeur.
    //
    // Le résultat peut être une bande de largeur NULLE: « le seul niveau
    // acceptable est exactement 500 kcal sous la maintenance ». C'est la
    // lecture juste, et le régime « direction » lui rend sa largeur par la
    // marge de ±10 % (§2.3) — largeur qui vient de l'INCERTITUDE de la mesure,
    // pas d'une tolérance qu'on s'accorderait.
    const capped = Math.round(maintenance - MAX_DAILY_DEFICIT_KCAL);
    const cappedLow = Math.max(low, capped);
    energy = { low: cappedLow, high: Math.max(high, cappedLow) };
  }

  const floorPerKg = Math.max(
    PROTEIN_FLOOR_G_PER_KG[goal],
    ageBand === "60_plus" ? SENIOR_PROTEIN_FLOOR_G_PER_KG : 0,
  );
  const proteinFloorG = Math.round(weightKg * floorPerKg);

  // LES TROIS CAS, ET SEULEMENT EUX.
  let proteinPerMealG: number | null = null;
  if (ageBand === "60_plus") {
    proteinPerMealG = Math.round(weightKg * SENIOR_PROTEIN_PER_MEAL_G_PER_KG);
  } else if (goal === "muscle_gain" || goal === "recomposition") {
    proteinPerMealG = Math.round(proteinFloorG / TRAINING_PROTEIN_MEALS);
  }

  const base: Envelope = {
    mode: "per_kg",
    energy,
    proteinFloorG,
    proteinPerMealG,
    densityCeiling: goal === "fat_loss"
      ? DENSITY_CEILING_FAT_LOSS
      : DENSITY_CEILING_DEFAULT,
  };
  // EN DERNIER — après les ceintures produit, jamais avant.
  return applyPiloting(steering, base, restrictionFlag);
}

/**
 * TOUT CE QUI EST DÉRIVABLE D'UNE ENVELOPPE, EN UNE CHAÎNE.
 *
 * Exportée pour UNE raison: l'invariant d'indiscernabilité se prouve par
 * ÉGALITÉ DE CHAÎNES, jamais par inspection. Un test qui vérifierait
 * « il n'y a pas de bande d'énergie » laisserait passer un champ ajouté six
 * mois plus tard, un `undefined` de plus, ou un mode écrit différemment — et
 * c'est précisément par là qu'un statut de restriction devient observable.
 */
export function envelopeFingerprint(envelope: Envelope): string {
  // Sérialisation déterministe MAISON. `JSON.stringify(x, keys)` filtre les
  // clés à TOUS les niveaux: la bande d'énergie imbriquée y serait réduite à
  // `{}`, et deux enveloppes `per_kg` de bandes différentes rendraient la même
  // empreinte. Une empreinte qui confond deux états est pire qu'aucune
  // empreinte — c'est un test vert qui ne teste rien.
  const walk = (v: unknown): string => {
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
    if (Array.isArray(v)) return `[${v.map(walk).join(",")}]`;
    const o = v as Record<string, unknown>;
    return `{${
      Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${walk(o[k])}`).join(",")
    }}`;
  };
  return walk(envelope);
}
