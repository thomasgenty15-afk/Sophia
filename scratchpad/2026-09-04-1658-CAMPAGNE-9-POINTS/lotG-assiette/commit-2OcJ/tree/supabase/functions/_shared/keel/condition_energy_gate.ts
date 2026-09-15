/**
 * LE GARDE D'ÉNERGIE DES CONDITIONS DÉCLARÉES — lot L0bis, 2026-08-22.
 *
 * ── LE DÉFAUT MESURÉ, ET IL ÉTAIT OUVERT ──────────────────────────────────
 * `pregnancy` est dans la liste fermée du plancher de maladie depuis le
 * 2026-08-06 (`medical_condition_floor.ts`), et le plancher écrit bien sa
 * ligne. Mais cette ligne n'allait NULLE PART dans le moteur: `conditionRef`
 * est exclu de `safetyConstraintTokens` — c'est justifié, et il ne faut pas y
 * revenir, voir le bloc « ⛔ CE QUE CE MODULE N'EST PAS » plus bas — et il
 * n'était lu par AUCUN calcul d'énergie. Mesuré le 2026-08-22 à 03:19:55 CEST,
 * par les modules eux-mêmes, sur une femme de 31 ans, 165 cm, 68 kg, sédentaire
 * (entretien estimé 1 980 kcal/j) portant `pregnancy` ET `fat_loss`:
 *
 *     mouthTargetKcal   pace par défaut ⇒ cible 1 705 kcal  (déficit 275/j)
 *     mouthTargetKcal   pace 0,5 kg/sem ⇒ cible 1 480 kcal  (déficit 500/j)
 *     mouthTargetFactor pace 0,5 kg/sem ⇒ facteur 0,7475
 *     envelopeFor       fat_loss        ⇒ bande 1 485-1 683, densité 1,3
 *     la journée la PLUS BASSE que le moteur exécute pour elle: 1 200 kcal/j
 *
 * 1 200 kcal, c'est `ENERGY_FLOOR_KCAL.female` — un plancher qui n'a jamais
 * entendu parler de grossesse. Elle recevait une boîte pesée en déficit.
 *
 * ── LE BON CHIFFRE DE DÉFICIT EN GROSSESSE EST ZÉRO ───────────────────────
 * Pas « un plancher plus haut »: **un plafond n'est pas un interdit**. Un
 * plancher relevé à 1 800 kcal laisserait encore un déficit de 180 kcal à la
 * femme de l'exemple, et ressemblerait trait pour trait à une garde qui marche.
 * Ce module dit donc « aucun écart », pas « un écart plus petit ».
 *
 * ── ⛔ CE QUE CE MODULE N'EST PAS, ET C'EST LA CICATRICE LA PLUS CHÈRE ─────
 * Il ne touche **QUE LE CALCUL**. Il n'entre dans AUCUNE ceinture de sortie, et
 * `conditionRef` ne doit jamais entrer dans `safetyConstraintTokens`. Le
 * 2026-08-06, une ligne difforme (`allergen_ref='diabetes'`) a armé la ceinture
 * sur le nom d'une maladie, et un message d'urgence — « take fast-acting
 * glucose now and call emergency services » — a été REMPLACÉ par un refus poli,
 * en run réel. Armer un verrou de TEXTE sur une condition bâillonne exactement
 * la personne qu'il prétend protéger. Ici on ne verrouille aucun mot: on refuse
 * de creuser une assiette.
 *
 * ── ⚠️ CE QUE CE MODULE NE FERME PAS, ET IL FAUT LE SAVOIR ────────────────
 * Fer, folates et iode changent FORTEMENT en grossesse et en allaitement, et
 * la table sexe × âge du dépôt ne le sait pas: elle rend les mêmes cibles à une
 * femme enceinte qu'à une femme qui ne l'est pas. **C'est l'exception qui rend
 * cette table fausse dans le sens dangereux**, et elle n'est PAS fermée ici.
 * Ce lot retire un déficit; il n'ajoute aucun besoin. Écrit, pas refermé.
 *
 * PURE: no I/O, no clock, no randomness.
 */

/**
 * LES CONDITIONS QUI ANNULENT TOUT ÉCART D'ÉNERGIE. Liste FERMÉE.
 *
 * ⚠️ ELLE N'EST PAS « LES CONDITIONS GRAVES ». Un diabétique, un hypertendu, un
 * insuffisant rénal peuvent parfaitement viser une perte de poids, et la leur
 * retirer serait décider à leur place — le mode d'erreur que ce dépôt paie en
 * boucle sur les gardes trop larges. Le critère d'entrée est étroit et il se
 * dit en une phrase: **un état où le corps nourrit quelqu'un d'autre**, et où
 * un déficit délibéré n'a donc aucun chiffre acceptable.
 *
 * ⚠️ LES DEUX SONT DES JETONS DE `medical_condition_floor.ts`, et ils y sont
 * SÉPARÉS depuis ce lot. Avant, « I'm breastfeeding » écrivait `pregnancy`:
 * le compteur de ce module n'aurait alors eu que trois populations atteignables
 * sur quatre, et sa colonne `breastfeeding` aurait été **structurellement à
 * zéro** — c'est-à-dire un compteur désarmé qui ressemble à un compteur qui
 * marche. Le dépôt a mesuré deux fois ce mode d'échec pendant cette campagne.
 */
export const DEFICIT_CANCELLING_CONDITION_REFS = Object.freeze(
  [
    "pregnancy",
    "breastfeeding",
  ] as const,
);
export type DeficitCancellingConditionRef =
  (typeof DEFICIT_CANCELLING_CONDITION_REFS)[number];

/**
 * LES QUATRE POPULATIONS DU COMPTEUR `condition_gate`.
 *
 * ⚠️ QUATRE, ET PAS DEUX. « la garde a mordu / la garde n'a pas mordu » rendrait
 * le même zéro pour « personne n'a déclaré de condition » et pour « quatre
 * personnes ont déclaré un diabète et la garde les a laissées passer » —
 * c'est-à-dire qu'un branchement mort et un branchement sain donneraient
 * exactement le même journal.
 *
 *   · `pregnancy`     — la garde mord, et l'éviction listeria s'applique aussi.
 *   · `breastfeeding` — la garde mord; l'éviction, NON (voir plus bas).
 *   · `other`         — une condition est déclarée et la garde la laisse passer.
 *     ⛔ C'EST LA COLONNE QUI PROUVE QUE LA GARDE NE MORD PAS TROP LARGE.
 *   · `none`          — aucune condition déclarée. Le cas majoritaire, et il
 *     doit le rester: si `none` cessait d'être majoritaire, ce serait la
 *     lecture des conditions qui serait cassée, pas la population.
 */
export const CONDITION_GATE_POPULATIONS = Object.freeze(
  [
    "pregnancy",
    "breastfeeding",
    "other",
    "none",
  ] as const,
);
export type ConditionGatePopulation = (typeof CONDITION_GATE_POPULATIONS)[number];

/** Le compteur des quatre populations, TOUTES à zéro. Jamais un objet vide. */
export type ConditionGateCounter = Record<ConditionGatePopulation, number>;

/**
 * ⚠️ LES QUATRE CLÉS SONT POSÉES À ZÉRO, ET C'EST LA MOITIÉ DU COMPTEUR. Un
 * `Record` rempli à la volée ne porte que les populations RENCONTRÉES: « zéro
 * grossesse » et « la garde n'a pas tourné » y seraient la même absence de clé.
 */
export function newConditionGateCounter(): ConditionGateCounter {
  const out = {} as ConditionGateCounter;
  for (const population of CONDITION_GATE_POPULATIONS) out[population] = 0;
  return out;
}

/**
 * LA POPULATION D'UNE BOUCHE, DEPUIS LES `condition_ref` QU'ELLE PORTE.
 *
 * ⚠️ LA GROSSESSE GAGNE SUR L'ALLAITEMENT quand les deux sont déclarés. Les
 * deux annulent l'écart de la même façon, donc l'ordre ne change rien au
 * grammage; il change l'ÉVICTION, qui est propre à la grossesse. Se tromper de
 * côté ici retirerait une garde alimentaire, jamais l'inverse.
 *
 * ⚠️ ENTRÉE TOLÉRANTE, VERDICT STRICT. Les `null`, les vides et les espaces
 * sont ignorés (une ligne `student_safety_constraints` porte quatre refs dont
 * trois sont `null` par construction); tout ref non vide qui n'est pas de la
 * liste fermée compte comme `other`, jamais comme `none`. Un ref inconnu ne
 * doit pas disparaître du compteur: c'est ce silence-là qui rend un lot
 * désarmé indiscernable d'un lot qui marche.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function conditionGatePopulationOf(
  conditionRefs: readonly (string | null | undefined)[],
): ConditionGatePopulation {
  let sawOther = false;
  let sawBreastfeeding = false;
  for (const raw of conditionRefs ?? []) {
    const ref = String(raw ?? "").trim().toLowerCase();
    if (ref === "") continue;
    if (ref === "pregnancy") return "pregnancy";
    if (ref === "breastfeeding") sawBreastfeeding = true;
    else sawOther = true;
  }
  if (sawBreastfeeding) return "breastfeeding";
  return sawOther ? "other" : "none";
}

/**
 * CETTE POPULATION ANNULE-T-ELLE L'ÉCART D'ÉNERGIE ?
 *
 * `switch` exhaustif: une population ajoutée sans réponse ne compile pas. C'est
 * la R6 du contrat — « pas de valeur d'énumération sans une branche
 * d'évaluateur nommée ».
 */
export function cancelsEnergyDeficit(population: ConditionGatePopulation): boolean {
  switch (population) {
    case "pregnancy":
    case "breastfeeding":
      return true;
    case "other":
    case "none":
      return false;
  }
}

/**
 * LE MOTIF À RENDRE QUAND LA GARDE MORD, ou `null` quand elle ne mord pas.
 *
 * ⚠️ DEUX MOTIFS, PAS UN. `noSizing("pregnancy")` sur une femme qui allaite
 * écrirait un fait faux dans un journal que personne ne relira avant six mois.
 * Les deux jetons sont ajoutés à `BOX_SIZING_REASONS` et à `ANCHOR_REASONS`
 * pour cette raison-là, et pour aucune autre.
 */
export function conditionGateReason(
  population: ConditionGatePopulation,
): DeficitCancellingConditionRef | null {
  switch (population) {
    case "pregnancy":
      return "pregnancy";
    case "breastfeeding":
      return "breastfeeding";
    case "other":
    case "none":
      return null;
  }
}

/**
 * L'OBJECTIF, UNE FOIS LA GARDE PASSÉE — pour les appelants qui prennent un
 * `GoalToken` et pas une direction (`envelopeFor`).
 *
 * ⚠️ IL COERCE VERS `maintenance`, IL NE REND PAS `null`. Une enveloppe absente
 * retirerait à la bouche toute borne d'énergie et tout plancher protéique;
 * `maintenance` retire l'écart et RIEN D'AUTRE — c'est exactement « le déficit
 * tombe à zéro ». Elle remonte au passage le plafond de densité de 1,3
 * (`DENSITY_CEILING_FAT_LOSS`) à 1,8, ce qui est le geste juste: on ne demande
 * pas à une femme enceinte de manger moins dense.
 *
 * ⚠️ `muscle_gain` N'EST PAS COERCÉ. Ce module retire des déficits; un surplus
 * n'est pas un déficit, et le rabattre serait retirer de l'énergie à quelqu'un
 * qui en demande. La garde ne mord que vers le bas — c'est écrit ici pour que
 * personne ne « symétrise » ça par réflexe.
 *
 * Le type est laissé structurel (`G extends string`) pour ne pas importer
 * `tokens.ts` dans un module que la lane du chat pourra un jour vouloir lire:
 * les appelants passent leur `GoalToken`, et le retour reste le leur.
 */
export function goalUnderConditionGate<G extends string>(
  goal: G,
  population: ConditionGatePopulation,
): { goal: G | "maintenance"; cancelled: boolean } {
  if (!cancelsEnergyDeficit(population)) return { goal, cancelled: false };
  if (goal !== "fat_loss") return { goal, cancelled: false };
  return { goal: "maintenance", cancelled: true };
}

// ---------------------------------------------------------------------------
// L'ÉVICTION DE LA GROSSESSE — trois familles, et pour UNE bouche seulement
// ---------------------------------------------------------------------------

/**
 * LES TROIS FAMILLES RETIRÉES DE SON ASSIETTE, en jetons R1 (ASCII anglais).
 *
 * Listeria et toxoplasmose: ce sont les trois familles que toute autorité de
 * santé nomme en premier, et ce sont celles que la fiche de ce lot nomme —
 * poisson fumé à froid, charcuteries crues, fromages à pâte molle non cuits.
 *
 * ⚠️ TROIS, ET ON N'EN AJOUTE PAS EN PASSANT. Le foie (vitamine A), les œufs
 * crus, les coquillages crus et la caféine sont des candidats défendables; les
 * ajouter ici sans mesure serait trancher une question de conception dans un
 * fichier de code, ce que le §⑦ du plan interdit explicitement. Le jour où on
 * les ajoute, c'est une fiche.
 */
export const PREGNANCY_AVOIDED_FOOD_REFS = Object.freeze(
  [
    "cold_smoked_fish",
    "raw_cured_charcuterie",
    "unpasteurised_soft_cheese",
  ] as const,
);

/**
 * CETTE POPULATION REÇOIT-ELLE L'ÉVICTION ALIMENTAIRE ?
 *
 * ⛔ ELLE N'EST **PAS** LA MÊME QUESTION QUE `cancelsEnergyDeficit`, ET C'EST
 * LA SEULE DIFFÉRENCE DE COMPORTEMENT ENTRE LES DEUX CONDITIONS. La listeria
 * traverse le placenta; elle ne passe pas dans le lait de la même façon. Servir
 * à une femme qui allaite une liste d'interdits qui ne la concerne pas est le
 * genre de fausse prudence qui fait débrancher une garde — et c'est pour ça que
 * les deux populations sont comptées séparément.
 *
 * ⚠️ LA RÈGLE VIT ICI, PAS CHEZ L'APPELANT. Elle était écrite en toutes lettres
 * dans un `if` du générateur, où aucun banc de module ne pouvait la faire
 * rougir: une mutation qui l'élargissait à l'allaitement passait **verte**.
 * Mesuré le 2026-08-22 pendant la campagne de mutation de ce lot.
 *
 * `switch` exhaustif — R6 du contrat.
 */
export function evictsPregnancyFoods(population: ConditionGatePopulation): boolean {
  switch (population) {
    case "pregnancy":
      return true;
    case "breastfeeding":
    case "other":
    case "none":
      return false;
  }
}

/**
 * LE BLOC DE PROMPT, ou `null` quand personne à cette table ne le demande.
 *
 * ── ⛔ POUR ELLE SEULE, ET C'EST TOUT LE SUJET ────────────────────────────
 * Une allergie gouverne LA CASSEROLE: personne ne mange le plat. Ici non. Une
 * grossesse déclarée ne retire pas le saumon fumé du repas de la maison, elle
 * le retire d'UNE assiette. Écrire ce bloc comme une allergie ferait payer à
 * cinq personnes une règle qui en concerne une, et le dépôt a déjà mesuré ce
 * qu'une règle de foyer mal portée coûte (« un végane fait manger végane six
 * personnes », question n° 13 du plan, toujours ouverte).
 *
 * ── ⚠️ ET ELLE N'EST PAS VÉRIFIABLE, DONC ON LE DIT ──────────────────────
 * Rien dans le JSON du plan ne prouve qu'un fromage a été pasteurisé. Ce bloc
 * est une CONSIGNE, comme la règle de contamination croisée du lot `C1`, et il
 * faut l'écrire en sachant qu'elle n'est pas garantie plutôt que laisser croire
 * qu'elle l'est.
 *
 * ⚠️ `breastfeeding` NE REÇOIT PAS CE BLOC. La listeria traverse le placenta;
 * elle ne passe pas dans le lait de la même façon, et servir à une femme qui
 * allaite une liste d'interdits qui ne la concerne pas est le genre de fausse
 * prudence qui fait débrancher une garde. C'est aussi la seule différence de
 * comportement entre les deux populations, et c'est pour ça qu'elles sont
 * comptées séparément.
 *
 * @param mouthNames les prénoms des bouches en population `pregnancy`, tels que
 *        le roster les porte. Vide ⇒ `null`, jamais un bloc sans destinataire.
 */
export function pregnancyFoodBlockFor(
  mouthNames: readonly string[],
): string | null {
  const named = [...new Set(mouthNames.map((n) => String(n ?? "").trim()))]
    .filter((n) => n !== "");
  if (named.length === 0) return null;
  return [
    `=== LEAVE THESE OFF ${named.join(" and ")}'s PLATE, AND ONLY THEIRS ===`,
    "They have told us they are pregnant. Three families carry a listeria or",
    "toxoplasma risk that matters in pregnancy and nowhere else at this table:",
    "- cold-smoked or gravlax-style fish that is never cooked",
    "- raw cured charcuterie (prosciutto, chorizo, salami, raw-cured ham)",
    "- soft cheese that is not cooked through (brie, camembert, blue, feta and",
    "  any unpasteurised cheese)",
    "Do NOT remove these dishes from the household. Cook the same meal, and give",
    "them a cooked or pasteurised stand-in of the same kind in their portion.",
    "Say nothing about their pregnancy beyond this: no target numbers, no",
    "supplement, no weight advice. Their clinician decides that.",
  ].join("\n");
}
