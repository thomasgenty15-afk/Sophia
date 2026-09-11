/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA MESURE D'UNE CASSEROLE — UNE UNITÉ DE CUISSON À LA FOIS — 2026-09-11
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier: `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/CHANTIER.md`, lot B.
 * Preuves:  `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md`, § 4.
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, ET IL EST CHIFFRÉ ──────────────────────
 * `weighedReadyGrams` décidait de l'eau sur LA LISTE QU'ON LUI DONNAIT: un seul
 * drapeau `absorbs` pour tout ce qui passait. `standardPortionOf` aplatissait le
 * frais du plat et les ingrédients de TOUTES les casseroles dans une seule
 * liste, puis appelait cette fonction UNE fois. Le couscous (`grain_absorbs`)
 * faisait donc disparaître l'eau de la casserole de lentilles, qui n'absorbe
 * rien du tout.
 *
 * GAIN `a18f522e`, samedi déjeuner, après deuxième réparation:
 *
 *     frais du plat, mesuré seul                        20,0 g
 *     `prep_lentil_ratatouille`, mesurée seule         548,5 g
 *     `prep_couscous`, mesurée seule                   332,5 g
 *     ───────────────────────────────────────────────────────
 *     somme des composants                             901,0 g
 *     même contenu mesuré en UNE liste aplatie         811,0 g
 *
 * Les 90 g sont l'eau des lentilles (180 ml, deux tirages). Le moteur
 * dimensionnait sur 811 g, annonçait 657 g, et `applySizing` — qui mesure chaque
 * casserole SÉPARÉMENT — écrivait 727 g. **Le même moteur donnait deux masses au
 * même assemblage.** Ce n'est pas une densité ratée par le modèle: c'est
 * l'instrument.
 *
 * ⚠️ CETTE ASSIETTE MESURE MAINTENANT **896,8 g**, ET PAS 901. Les 4,2 g de
 * différence sont le second défaut trouvé en fermant le premier: la part d'une
 * casserole portait la TOTALITÉ de ses condiments au lieu de leur fraction (voir
 * `shareOf`). 901 était la somme de l'arithmétique biaisée; 896,8 est ce que
 * `applySizing` écrit vraiment. Les deux côtés disent désormais le même nombre.
 *
 * ── LA RÈGLE, ET ELLE EST ATTACHÉE À SA CASSEROLE ─────────────────────────
 *   `absorbed`     un grain `grain_absorbs` porte déjà l'eau dans son rendement
 *                  (×2,6): la ligne d'eau ne se compte pas une seconde fois;
 *   `kept`         soupe, bouillon, sauce — l'eau reste dans le plat et pèse;
 *   `discarded`    l'eau est jetée (égouttage): elle ne pèse pas;
 *   `undetermined` deux signaux se contredisent ⇒ **explicitement non mesurable**.
 *
 * ⛔ AUCUN MATCHER MAISON SUR LA PROSE DE LA MÉTHODE. Ce dépôt a mesuré 12 faux
 * positifs sur 12 avec un matcher artisanal (« lait » vit dans « laitue »), et
 * la mémoire `never-hand-roll-a-matcher-here` en fait une règle. `discarded` ne
 * s'obtient donc QUE d'une déclaration structurée portée par la casserole
 * (`waterTreatment`). Aujourd'hui **personne ne l'écrit**: le champ n'existe pas
 * encore dans le parseur, donc l'état est atteignable, testé, et jamais deviné.
 * Trois états honnêtes valent mieux que quatre dont un ment.
 *
 * ⛔ ET `legume_absorbs` N'EST PAS TRAITÉ COMME `grain_absorbs`. Des lentilles
 * sèches mijotées dans une eau qui reste au fond de la casserole ne sont pas du
 * riz pilaf. L'enquête le dit en toutes lettres: « remplacer simplement
 * `grain_absorbs` par "tout aliment absorbant" ne suffirait pas ». Le
 * comportement d'avant est conservé, mais **par casserole**.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  type CompositionIndex,
  type CompositionInput,
  isFriedMethod,
  type NutrientsOrUnknown,
  nutrientsOf,
  type ResolutionResult,
  resolveIngredients,
  yieldFactorOf,
} from "./food_composition.ts";
import {
  dishEnergy,
  dishEnergyAtTolerance,
  type EnergyIngredient,
  UNRESOLVED_ENERGY_TOLERANCE,
} from "./plan_energy.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① L'EAU D'UNE CASSEROLE
// ═══════════════════════════════════════════════════════════════════════════

/** Ce qu'on a décidé de l'eau d'UNE casserole, et pourquoi. */
export type WaterTreatment = "absorbed" | "kept" | "discarded" | "undetermined";

export const WATER_TREATMENTS: readonly WaterTreatment[] = Object.freeze(
  ["absorbed", "kept", "discarded", "undetermined"] as const,
);

/**
 * CE QU'UNE CASSEROLE **DÉCLARE** DE SON EAU — et rien d'autre ne la déclare.
 *
 * ⚠️ `undefined` EST UNE VALEUR PLEINE: « personne ne l'a dit ». Elle n'est pas
 * un défaut désarmé au sens de la cicatrice `optional-gate-params-are-disarmed-
 * gates` — ce champ n'est pas une garde que l'appelant doit armer, c'est une
 * DÉCLARATION venue du plan. Son absence est le cas nominal d'aujourd'hui, et
 * la règle dérivée (`absorbed` / `kept`) prend alors la main.
 *
 * ⛔ `absorbed` N'EST PAS DÉCLARABLE. C'est un fait du référentiel — un grain de
 * classe `grain_absorbs` est dans la casserole, ou il n'y est pas. Le laisser
 * déclarer permettrait à un plan d'effacer une eau qu'aucun aliment n'absorbe.
 */
export type DeclaredWaterTreatment = "kept" | "discarded";

/** Le groupe du référentiel qui porte l'eau de cuisson. */
const WATER_GROUP = "water";

// ═══════════════════════════════════════════════════════════════════════════
// ② CE QU'UNE MESURE PEUT NE PAS SAVOIR — nommé, jamais un `null` nu
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES MOTIFS DE SILENCE D'UNE MESURE DE CASSEROLE.
 *
 * ⚠️ LES TROIS DERNIERS SONT CEUX DE `plan_energy.ts` (`ENERGY_GAPS`), REPRIS
 * MOT POUR MOT. Le journal de la lane compte ces jetons depuis des mois
 * (`unmeasurable_by`); en inventer des synonymes ici ferait deux populations
 * pour le même défaut, et c'est la moins regardée qui garderait l'ancien nom.
 */
/**
 * LE TROU D'UNE CASSEROLE CITÉE MAIS ABSENTE DU PLAN.
 *
 * ⚠️ NOMMÉ ET ÉPINGLÉ, parce que c'est le seul trou qu'une RÉPARATION peut
 * créer: la fusion renomme les casseroles réécrites, et un plat non repris cite
 * encore l'ancien identifiant. Le lire dans `unmeasurable_by` est ce qui
 * distingue « le référentiel ne connaît pas cet aliment » de « la fusion a cassé
 * le plan ». `portion_sizing.ts` le réexporte sous son nom historique
 * `MISSING_PREPARATION_GAP`.
 */
export const POT_MISSING_PREPARATION_GAP = "missing_preparation";

export const POT_MEASURE_GAPS = Object.freeze(
  [
    /** Deux signaux se contredisent sur l'eau: la masse est INCONNUE. */
    "water_undetermined",
    /** Aucune ligne de cette casserole ne se pèse. */
    "nothing_weighed",
    POT_MISSING_PREPARATION_GAP,
    "unknown_ingredient",
    "missing_quantity",
    "no_ingredients",
    /**
     * ⟳ LOT A (2026-09-11) — LE QUATRIÈME JETON DE `ENERGY_GAPS`, repris mot
     * pour mot comme les trois autres. Une ligne dont l'identifiant est refusé
     * n'a AUCUN aliment: la casserole s'éteint, et `unmeasurable_by` doit
     * pouvoir distinguer « le référentiel ne connaît pas ce mot » de « le
     * modèle a écrit un identifiant inventé » — deux corrections opposées.
     */
    "ref_refused",
  ] as const,
);
export type PotMeasureGap = (typeof POT_MEASURE_GAPS)[number];

export interface PotMeasure {
  /** Les grammes PRÊTS de cette casserole entière. `null` = non mesurable. */
  readyG: number | null;
  kcal: number | null;
  proteinG: number | null;
  water: WaterTreatment;
  /** Pourquoi `null`, quand c'est `null`. Jamais vide si `readyG === null`. */
  gaps: readonly string[];
}

/** Une casserole, réduite à ce que la mesure lit. */
export interface PreparationToMeasure {
  id: string;
  method?: string | null;
  ingredients: readonly unknown[];
  /** ⚠️ Facultatif PARCE QUE PERSONNE NE L'ÉCRIT ENCORE. Voir `DeclaredWaterTreatment`. */
  waterTreatment?: DeclaredWaterTreatment | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES PRIMITIVES — une seule résolution, une seule règle d'eau
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ LES LIGNES SANS OBJET SONT JETÉES, PAS DEVINÉES. `resolveIngredients`
 * ignore déjà un terme vide; ce filtre-ci retire ce qui n'est même pas un objet
 * (un `null` dans un tableau d'archive) avant que le typage ne le promette.
 */
function inputsOf(ingredients: readonly unknown[]): readonly EnergyIngredient[] {
  const out: EnergyIngredient[] = [];
  for (const raw of ingredients ?? []) {
    if (raw !== null && typeof raw === "object") out.push(raw as EnergyIngredient);
  }
  return out;
}

/**
 * LE TRAITEMENT DE L'EAU DE **CETTE** CASSEROLE.
 *
 * ⛔ LA DÉCLARATION NE GAGNE PAS CONTRE LE RÉFÉRENTIEL: elle le CONTREDIT, et
 * une contradiction ne se tranche pas au hasard. Un plan qui dit « eau jetée »
 * sur une casserole où un grain absorbe décrit deux cuissons différentes — on ne
 * sait pas laquelle a eu lieu, donc on ne sait pas ce que la casserole pèse.
 * Le même raisonnement vaut pour « eau conservée » sur un grain absorbant (une
 * soupe au vermicelle): le ×2,6 porte déjà de l'eau, le bouillon en ajoute, et
 * rien n'écrit combien de chaque.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function waterTreatmentOf(
  index: CompositionIndex,
  prep: { ingredients: readonly unknown[]; waterTreatment?: DeclaredWaterTreatment | null },
): WaterTreatment {
  return waterFrom(
    resolveIngredients(index, inputsOf(prep.ingredients)),
    prep.waterTreatment ?? null,
  );
}

function waterFrom(
  r: ResolutionResult,
  declared: DeclaredWaterTreatment | null,
): WaterTreatment {
  // ⟳ 2026-09-05, CONSERVÉ TEL QUEL MAIS PAR CASSEROLE. Mesuré sur les plans
  // réels de ce jour-là: 4 casseroles de grain sur 13 listent « eau » (1,7 à
  // 3,7 L). `grain_absorbs` (×2,6) porte déjà cette eau dans les grammes prêts;
  // la ligne d'eau l'ajoutait une seconde fois — un riz à 0,77 kcal/g au lieu
  // de ~1,3, donc plus de grammes déplacés pour la même énergie.
  const absorbs = r.resolved.some(({ ref }) => ref.yieldClass === "grain_absorbs");
  if (declared === null) return absorbs ? "absorbed" : "kept";
  return absorbs ? "undetermined" : declared;
}

/**
 * LES GRAMMES PRÊTS D'UNE LISTE, SOUS UN TRAITEMENT D'EAU DONNÉ.
 *
 * ⛔ LA MÊME RÉSOLUTION QUE LE NUMÉRATEUR, PAS LE CHAMP `gramsRaw`. Mesuré sur
 * le premier plan réel densifié (2026-09-05, `161a04de`): la lane foyer ne
 * remplit JAMAIS `gramsRaw` — tous nuls dans l'archive, « 2 720 g » compris —
 * pendant que `dishEnergy` recalcule ses grammes depuis `amount`/`unit`/`state`.
 * Le dénominateur ne comptait alors que les condiments conventionnels: une
 * casserole entière rapportée à trois grammes de sel, des densités de plusieurs
 * centaines de kcal par gramme, et 25 g déplacés qui « fermaient » 393 kcal.
 *
 * `null` quand AUCUNE ligne ne se pèse — jamais zéro, qui se lirait « cette
 * casserole ne contient rien ».
 */
function readyGramsFrom(r: ResolutionResult, water: WaterTreatment): number | null {
  if (water === "undetermined") return null;
  const dropWater = water === "absorbed" || water === "discarded";
  let total = 0;
  let any = false;
  for (const { ref, gramsRaw } of r.resolved) {
    if (!(gramsRaw > 0)) continue;
    if (dropWater && ref.foodGroupRef === WATER_GROUP) continue;
    total += gramsRaw * yieldFactorOf(ref);
    any = true;
  }
  return any ? total : null;
}

/**
 * LA PROTÉINE D'UNE LISTE, ET SON ABSTENTION.
 *
 * ⛔ UN TERME INCONNU ÉTEINT LA PROTÉINE, MÊME QUAND IL LAISSE PASSER
 * L'ÉNERGIE. `dishEnergy` admet un terme non résolu tant que sa BORNE DE GROUPE
 * pèse moins de 5 % du plat (`boundedKcal`). Une borne de groupe donne une
 * DENSITÉ ÉNERGÉTIQUE, jamais des grammes de protéine: la compter à zéro
 * rendrait une somme amputée qui a l'air d'un résultat — le mode de défaillance
 * exact que `nutrientsOf` existe pour ne pas produire.
 */
function proteinFrom(r: ResolutionResult, method: string): number | null {
  if (r.unresolvedTerms.length > 0 || r.resolved.length === 0) return null;
  const n: NutrientsOrUnknown = nutrientsOf(r.resolved, {
    friedMethod: isFriedMethod(method),
  });
  return n === "unknown" ? null : n.proteinG;
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA MESURE D'UNE CASSEROLE — l'interface figée du lot B
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CE QUE PRODUIT UNE CASSEROLE ENTIÈRE: sa masse prête, son énergie, sa
 * protéine, et ce qu'on a décidé de son eau.
 *
 * ⚠️ `kcal` PEUT SORTIR PENDANT QUE `readyG` EST `null`, et l'inverse est vrai
 * aussi. Les deux ne s'éteignent pas aux mêmes conditions: l'eau ne porte aucune
 * calorie, donc une eau indéterminée retire une MASSE sans toucher à l'énergie.
 * Les fondre en un seul « mesurable » ferait perdre l'un pour l'autre.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function measurePreparation(
  index: CompositionIndex,
  prep: PreparationToMeasure,
): PotMeasure {
  const ingredients = inputsOf(prep.ingredients);
  const method = String(prep.method ?? "");
  const r = resolveIngredients(index, ingredients);
  const water = waterFrom(r, prep.waterTreatment ?? null);
  const gaps: string[] = [];

  const e = dishEnergy(index, { method, ingredients });
  const kcal = e.complete ? e.kcal : null;
  if (!e.complete) {
    for (const g of e.gaps) gaps.push(String(g));
  }

  let readyG: number | null = null;
  if (water === "undetermined") {
    gaps.push("water_undetermined");
  } else {
    readyG = readyGramsFrom(r, water);
    if (readyG === null) gaps.push("nothing_weighed");
  }

  return {
    readyG,
    kcal,
    proteinG: kcal === null ? null : proteinFrom(r, method),
    water,
    gaps,
  };
}

/**
 * COMBIEN DE CASSEROLES DANS CHAQUE ÉTAT — le compteur que l'appelant journalise.
 *
 * ⛔ IL EXISTE PARCE QU'UN `undetermined` QUI APPARAÎT EN NOMBRE EST UNE
 * RÉGRESSION DE COUVERTURE, pas un progrès d'honnêteté. Sans compteur, « la
 * règle d'eau ne s'abstient jamais » et « elle s'abstient partout » rendent le
 * même journal.
 */
export function countWaterTreatments(
  measures: readonly PotMeasure[],
): Record<WaterTreatment, number> {
  const out = Object.fromEntries(
    WATER_TREATMENTS.map((w) => [w, 0]),
  ) as Record<WaterTreatment, number>;
  for (const m of measures) out[m.water]++;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE FRAIS D'UN PLAT — lu à tolérance PLEINE, jugé sur l'assiette
// ═══════════════════════════════════════════════════════════════════════════

export interface FreshMeasure {
  readyG: number | null;
  kcal: number | null;
  proteinG: number | null;
  /** La part de `kcal` qui vient d'une BORNE DE GROUPE, pas d'une table. */
  boundedKcal: number;
  /** Faux quand le frais est illisible pour une raison qui n'est pas la borne. */
  complete: boolean;
  gaps: readonly string[];
}

/**
 * LE FRAIS DU PLAT, SES INGRÉDIENTS PROPRES, JAMAIS CEUX DES CASSEROLES.
 *
 * ⟳ 2026-09-06, REPRIS DE `boxKcalByItems` — LA TOLÉRANCE SE JUGE SUR
 * L'ASSIETTE, PAS SUR LE FRAIS SEUL. `dishEnergy` refuse un plat dont les termes
 * non résolus pèsent plus de 5 % de son énergie. Jugée sur le frais seul (une
 * vinaigrette, « poulet » sans pièce, 60 g de galette), la borne mordait sur des
 * assiettes dont la casserole faisait 90 % de l'énergie: **188 à 342 g par jour
 * rendus illisibles** sur les tirs du 06/09. On lit donc le frais à tolérance
 * pleine, et la règle des 5 % s'applique à `casseroles + frais` — même seuil,
 * même bande, dénominateur juste.
 *
 * ⚠️ TOLÉRANCE PLEINE NE VEUT PAS DIRE « TOUT PASSE ». Un terme inconnu qu'on ne
 * sait pas BORNER, et un terme résolu mais NON PESÉ, éteignent le frais comme
 * avant: une masse inconnue n'a pas de borne.
 */
export function measureFresh(
  index: CompositionIndex,
  dish: { method?: string | null; ingredients?: readonly unknown[] },
): FreshMeasure {
  const ingredients = inputsOf(dish.ingredients ?? []);
  const method = String(dish.method ?? "");
  if (ingredients.length === 0) {
    // ⛔ UN PLAT SANS FRAIS EST UN RÉSULTAT, PAS UNE LACUNE. Il ne porte rien,
    // et rien ne pèse rien: `0`, complet. Rendre `null` ferait éteindre toute
    // assiette dont l'intégralité vient des casseroles — le cas le plus courant
    // de la cuisine en lot.
    return { readyG: 0, kcal: 0, proteinG: 0, boundedKcal: 0, complete: true, gaps: [] };
  }
  const r = resolveIngredients(index, ingredients);
  const water = waterFrom(r, null);
  const e = dishEnergyAtTolerance(index, { method, ingredients }, 1);
  const gaps: string[] = [];
  if (!e.complete) for (const g of e.gaps) gaps.push(String(g));
  let readyG: number | null = null;
  if (water === "undetermined") gaps.push("water_undetermined");
  else {
    readyG = readyGramsFrom(r, water);
    if (readyG === null) gaps.push("nothing_weighed");
  }
  return {
    readyG,
    kcal: e.complete ? e.kcal : null,
    proteinG: e.complete ? proteinFrom(r, method) : null,
    boundedKcal: e.boundedKcal,
    complete: e.complete,
    gaps,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'ASSIETTE — UNE SOMME DE COMPOSANTS MESURÉS SÉPARÉMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Ce qu'une casserole apporte à UNE assiette, et sous quel traitement d'eau. */
export interface PlatePot {
  id: string;
  /** Le nombre de PLATS qui tirent sur cette casserole. Jamais `servings_made`. */
  draws: number;
  water: WaterTreatment;
  /** Les grammes prêts de la PART, c'est-à-dire de la casserole ÷ tirages. */
  readyG: number | null;
  kcal: number | null;
  proteinG: number | null;
}

export interface PlateMeasure {
  readyG: number | null;
  kcal: number | null;
  proteinG: number | null;
  pots: readonly PlatePot[];
  /** Les identifiants de casserole cités par le plat et absents du plan. */
  missingPots: readonly string[];
  gaps: readonly string[];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA PART D'UNE CASSEROLE = LA CASSEROLE ENTIÈRE ÷ SES TIRAGES — 2026-09-11
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ET C'EST UN CHANGEMENT: LE BIAIS DE LA PINCÉE EST **CORRIGÉ**, pas gardé.
 *
 * `standardPortionOf` divisait `amount` ligne par ligne et laissait passer
 * ENTIÈRE toute ligne sans `amount` — une pincée de sel, un brin de persil,
 * pesés par convention (`condimentMassFor`). Chaque part portait donc la
 * totalité des condiments de la casserole. Sur le couscous de GAIN `a18f522e`:
 * 986,5 g de casserole, 3 tirages, part biaisée **332,5 g** contre **328,83 g**
 * — et les trois parts réclamaient 997,5 g d'une casserole qui en produit 986,5.
 *
 * ⛔ POURQUOI LA CORRECTION, ET PAS LA CONSERVATION. `applySizing` écrit dans la
 * boîte `masse prête de la casserole ÷ tirages`, condiments compris: c'est ce
 * que la personne reçoit. Garder le biais ici laissait donc vivre, en petit, le
 * défaut EXACT que ce lot ferme — le moteur annonçant une part que
 * l'applicateur n'écrit pas. Les deux côtés lisent maintenant la même division,
 * et la casserole n'est plus sur-tirée.
 *
 * ⚠️ CE QUE ÇA DÉPLACE, CHIFFRÉ: la part de ce déjeuner passe de 901 g à
 * 896,8 g (−0,5 %). L'écart vaut `(tirages − 1) × condiments de la casserole`,
 * donc il est nul sur une casserole sans condiment et sur un seul tirage.
 */
function shareOf(value: number | null, draws: number): number | null {
  return value === null ? null : value / draws;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'ASSIETTE STANDARD = LE FRAIS + CHAQUE CASSEROLE, MESURÉS SÉPARÉMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ PLUS AUCUN APLATISSEMENT AVANT LA DÉCISION SUR L'EAU. C'est la correction
 * du lot B: chaque unité de cuisson décide de son eau sur SES ingrédients, et
 * l'assiette est la somme de ces décisions. Le cas 811/901 g ne peut plus
 * exister — un test le tient (`preparation_mass_test.ts`).
 *
 * ⛔ UNE CASSEROLE CITÉE MAIS ABSENTE N'EST PAS SAUTÉE. Mesuré au tir `IDENTITE`
 * du 2026-09-08 (foyer `quatre`): après une réparation acceptée,
 * `mergeRetryCells` renomme les casseroles réécrites (`prep_rice__r`) et des
 * plats citaient un identifiant absent de `meal.preparations`. Mesurer le plat
 * sur ce qu'il RESTE rendrait une énergie plausible pour une assiette dont on
 * ignore le contenu principal.
 *
 * ⚠️ LA RÈGLE DES 5 % EST CELLE DE L'ASSIETTE. La borne de groupe du FRAIS est
 * pesée contre `casseroles + frais`, pas contre le frais seul — même arithmétique
 * que `boxKcalByItems`, pour que les deux lecteurs rendent le même nombre.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function measurePlate(args: {
  index: CompositionIndex;
  dish: { method?: string | null; ingredients?: readonly unknown[] };
  uses: readonly { preparationId?: string | null }[];
  preparations: readonly {
    id: string;
    method?: string | null;
    ingredients?: readonly unknown[];
    waterTreatment?: DeclaredWaterTreatment | null;
  }[];
  drawsByPrep: ReadonlyMap<string, number>;
}): PlateMeasure {
  const byId = new Map(args.preparations.map((p) => [String(p.id), p]));
  const missingPots: string[] = [];
  const pots: PlatePot[] = [];
  const gaps: string[] = [];

  const fresh = measureFresh(args.index, args.dish);
  for (const g of fresh.gaps) gaps.push(g);

  for (const use of args.uses) {
    const id = String(use?.preparationId ?? "");
    if (!id) continue;
    const prep = byId.get(id);
    if (!prep) {
      missingPots.push(id);
      continue;
    }
    const draws = Math.max(1, args.drawsByPrep.get(id) ?? 1);
    // ⛔ LA CASSEROLE EST MESURÉE **ENTIÈRE**, PUIS DIVISÉE. C'est l'ordre qui
    // compte: décider de l'eau sur la casserole entière donne la même réponse
    // qu'un tirage (le rendement ne dépend pas de la taille), et la division
    // porte alors sur TOUT ce qu'elle contient, condiments compris — la même
    // division que `applySizing` (`readyG ÷ draws`).
    const m = measurePreparation(args.index, {
      id,
      method: prep.method ?? null,
      ingredients: prep.ingredients ?? [],
      waterTreatment: prep.waterTreatment ?? null,
    });
    for (const g of m.gaps) gaps.push(g);
    pots.push({
      id,
      draws,
      water: m.water,
      readyG: shareOf(m.readyG, draws),
      kcal: shareOf(m.kcal, draws),
      proteinG: shareOf(m.proteinG, draws),
    });
  }

  // ── ① LA MASSE: la somme des composants, et ses deux façons d'être nulle ──
  // ⚠️ « RIEN NE SE PÈSE ICI » N'EST PAS « ON NE SAIT PAS ». Une casserole dont
  // aucune ligne ne se pèse apportait déjà zéro à la liste aplatie d'avant; une
  // eau INDÉTERMINÉE, elle, retire la masse de toute l'assiette — c'est une
  // ignorance, et elle se propage.
  let cooked: number | null = 0;
  let anyWeighed = false;
  const unknownMass = pots.some((p) => p.water === "undetermined") ||
    fresh.gaps.includes("water_undetermined");
  if (unknownMass) cooked = null;
  else {
    if (fresh.readyG !== null && fresh.readyG > 0) {
      cooked += fresh.readyG;
      anyWeighed = true;
    }
    for (const p of pots) {
      if (p.readyG === null) continue;
      cooked += p.readyG;
      if (p.readyG > 0) anyWeighed = true;
    }
    if (!anyWeighed) cooked = null;
  }

  // ── ② L'ÉNERGIE: nulle dès qu'un composant se tait, ou qu'une casserole manque ──
  let kcal: number | null = fresh.kcal;
  if (missingPots.length > 0) kcal = null;
  for (const p of pots) {
    if (kcal === null) break;
    if (p.kcal === null) kcal = null;
    else kcal += p.kcal;
  }
  // ── ③ LA BORNE DE GROUPE DU FRAIS, PESÉE CONTRE L'ASSIETTE ENTIÈRE ──────
  if (kcal !== null && fresh.boundedKcal > 0) {
    if (fresh.boundedKcal > UNRESOLVED_ENERGY_TOLERANCE * kcal) {
      kcal = null;
      gaps.push("unknown_ingredient");
    }
  }

  // ── ④ LA PROTÉINE: le frais plus le PRORATA RÉELLEMENT SERVI de chaque pot ──
  // ⛔ C'EST LA CICATRICE `preparations-must-be-folded-into-dishes`. Sans le
  // pliage, 51 % de la protéine sort du verdict: 111/32/26 g par jour mesurés
  // sans lui, 167/133/126 g avec. Aucun second barème n'est inventé ici — les
  // planchers restent ceux de `meal_envelope.ts` (`PROTEIN_FLOOR_G_PER_KG`,
  // `proteinFloorG`); ce module ne fait que MESURER ce qui est servi.
  let protein: number | null = kcal === null ? null : fresh.proteinG;
  for (const p of pots) {
    if (protein === null) break;
    if (p.proteinG === null) protein = null;
    else protein += p.proteinG;
  }

  for (const _ of missingPots) gaps.push(POT_MISSING_PREPARATION_GAP);
  return {
    readyG: cooked,
    kcal,
    proteinG: protein === null ? null : Math.round(protein * 10) / 10,
    pots,
    missingPots,
    gaps,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LE LECTEUR D'UNE LISTE NUE — le chemin qu'emprunte `weighedReadyGrams`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES GRAMMES PRÊTS D'UNE LISTE D'INGRÉDIENTS, SOUS SA PROPRE RÈGLE D'EAU.
 *
 * ⛔ IL N'Y A QU'UNE SEULE IMPLÉMENTATION DE LA RÈGLE D'EAU DANS CE MOTEUR, ET
 * C'EST CELLE DE CE FICHIER. `weighedReadyGrams` (`box_densify.ts`) délègue ici;
 * elle garde son nom et sa signature parce que huit appelants la citent, mais
 * elle ne décide plus de rien.
 *
 * ⚠️ UNE LISTE NUE EST TRAITÉE COMME **UNE** UNITÉ DE CUISSON. C'est exactement
 * ce qui rend l'aplatissement impossible à refaire par accident: qui donne deux
 * casseroles à cette fonction obtient la règle d'UNE casserole, et c'est
 * précisément le défaut qu'on ferme. Les appelants qui ont plusieurs unités
 * passent par `measurePlate`.
 */
export function readyGramsOfUnit(
  index: CompositionIndex,
  ingredients: readonly CompositionInput[],
): number | null {
  const r = resolveIngredients(index, inputsOf(ingredients));
  return readyGramsFrom(r, waterFrom(r, null));
}

/**
 * LA PROTÉINE D'UNE LISTE D'INGRÉDIENTS, avec l'abstention de ce module.
 *
 * ⚠️ ELLE NE JUGE PAS LA COMPLÉTUDE DE L'ÉNERGIE: l'appelant l'a déjà jugée
 * quand il en a une (`boxNutrition` sur le chemin legacy). Ce qu'elle garantit
 * est plus étroit et plus utile — un terme INCONNU éteint la protéine, parce
 * qu'une borne de groupe n'en donne jamais.
 */
export function proteinOfUnit(
  index: CompositionIndex,
  method: string | null | undefined,
  ingredients: readonly CompositionInput[],
): number | null {
  const r = resolveIngredients(index, inputsOf(ingredients));
  return proteinFrom(r, String(method ?? ""));
}
