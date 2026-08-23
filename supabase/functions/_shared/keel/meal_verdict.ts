/**
 * FF-039 — LE VERDICT : ce que le moteur PENSE d'une assiette, et qu'il ne dit
 * à personne.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-039-enveloppes-et-verdicts-en-observation.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §2.4.
 *
 * ── EN OBSERVATION : ÉCRIT, JAMAIS ACTIONNÉ ──────────────────────────────
 * Aucun retour vers la génération. Pas de relance, pas de jeton de correction,
 * pas une ligne de consigne changée. La sortie de `parseGeneratedMeal` est
 * IDENTIQUE avec et sans ce calcul, et un test le prouve par égalité profonde.
 * C'est ce qui rend cette étape livrable avant d'avoir mesuré quoi que ce soit.
 *
 * ── ABSTENTION AVANT ERREUR ──────────────────────────────────────────────
 * Un verdict rendu sur 95 % des ingrédients mais sans l'huile est PLUS
 * dangereux qu'une abstention, parce qu'il a l'air d'un résultat. Beaucoup de
 * `not_computable` au début est le bon résultat d'un référentiel jeune — pas
 * un échec du produit.
 *
 * ── LE CHIFFRE NE SORT PAS ───────────────────────────────────────────────
 * La protéine se VÉRIFIE en grammes calculés — c'est ce qui distingue « eggs »
 * à 6 g d'une vraie ancre, le trou que la simple présence de FF-037 laisse
 * ouvert. Mais le verdict rend `met` / `under` / `not_computable`: jamais un
 * nombre, même en interne lisible. La frontière aliment/personne passe là.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  ENERGY_DIRECTION_MARGIN,
  type Envelope,
} from "./meal_envelope.ts";
import {
  type CompositionIndex,
  type CompositionInput,
  normalizeTerm,
  type NutrientsOrUnknown,
  nutrientsOf,
  resolveIngredients,
} from "./food_composition.ts";
import type { FoodGroupRef } from "./tokens.ts";
import { weighableQuantityOf } from "./quantity_from_prose.ts";

// ---------------------------------------------------------------------------
// LE VERDICT
// ---------------------------------------------------------------------------

export interface CompositionVerdict {
  resolution: {
    /**
     * Les termes que le référentiel CONNAÎT — pesés ou non.
     *
     * ⚠️ Ce n'est pas la taille du tableau `resolved` de `resolveIngredients`:
     * celui-ci ne contient que les termes PESÉS. Le sel, le poivre et « 2
     * poivrons » sans poids d'unité sont connus et absents de ce tableau. Les
     * confondre fait s'abstenir sur des condiments — mesuré à 27 points d'écart
     * sur une assiette réelle.
     */
    resolved: number;
    total: number;
    unresolvedEnergyDense: boolean;
    /** Un aliment dense connu mais non pesé — son énergie manque en silence. */
    unweighedEnergyDense: boolean;
  };
  energy: "within" | "above" | "below" | "not_computable";
  protein: "met" | "under" | "not_computable";
  density: "within" | "above" | "not_computable";
  /** À l'échelle de la FENÊTRE du plan. Voir la §11 n°1 de la fiche. */
  sentinels: {
    /**
     * Les trous RÉPARABLES: des groupes qu'une recette placée comblerait.
     * C'est le seul champ que la boucle de correction lit.
     */
    missing: FoodGroupRef[];
    /**
     * FF-042 R6 — LES TROUS STRUCTURELS, dans un canal À PART.
     *
     * ── POURQUOI DEUX CHAMPS ET PAS UN ────────────────────────────────────
     * « Cette semaine ne porte pas de poisson gras » et « cet élève est végan,
     * la B12 n'existe pas dans le règne végétal en quantité utile » n'ont rien
     * à voir. Le premier se répare par un plat; le second, par aucun.
     *
     * ⚠️ LES CONFONDRE FAIT BOUCLER LE PRODUIT. La correction placerait une
     * recette censée apporter la B12, la génération suivante ne la trouverait
     * pas davantage, et le retry se déclencherait à CHAQUE plan — un élève
     * végan verrait son plan repris sans fin pour un trou qu'aucune assiette
     * ne peut combler. D'où la séparation ici, en amont de la boucle, plutôt
     * qu'un filtre chez elle.
     *
     * Ce sont des NOMS DE DRAPEAU (`b12_source`), pas des groupes: il n'y a
     * précisément aucun groupe qui les porterait.
     */
    uncoverable: string[];
  };
}

/**
 * LE SEUIL D'ABSTENTION SUR LA RÉSOLUTION.
 *
 * 80 % des ingrédients résolus, en NOMBRE et pas en masse: la masse suppose
 * qu'on connaisse les grammes, ce qui est précisément ce dont on doute quand
 * la résolution est basse.
 */
export const MIN_RESOLUTION_FOR_VERDICT = 0.8;

/**
 * LES PRÉPARATIONS AQUEUSES — lexique FERMÉ, EN + FR.
 *
 * L'eau de cuisson n'est pas un ingrédient grammé: une soupe pèse trois fois
 * ce que pèsent ses ingrédients, et le kcal/g qu'on en tirerait pointerait
 * toujours dans le même sens (trop bas). L'abstention de densité y est donc
 * ajoutée à celle de la résolution — elle ne la remplace pas.
 */
const WATERY_METHODS: readonly string[] = [
  // EN
  "soup",
  "broth",
  "stew",
  "stewed",
  "simmer",
  "simmered",
  "poach",
  "poached",
  "casserole",
  "braise",
  "braised",
  "chowder",
  // FR — l'appariement se fait MOT À MOT, donc chaque forme fléchie qu'une
  // recette écrit vraiment doit être là. Mesuré: « faire mijoter » ne matchait
  // pas « mijote », et le test de ce module est tombé dessus au premier
  // passage. L'anglais s'en tire avec deux formes, le français en demande
  // quatre — c'est la même cicatrice que le pluriel accordé de
  // `protein_anchor.ts`.
  "soupe",
  "soupes",
  "potage",
  "bouillon",
  "mijote",
  "mijotee",
  "mijoter",
  "mijotent",
  "ragout",
  "pot au feu",
  "poche",
  "pochee",
  "pocher",
  "braiser",
  "bouillir",
  "bouilli",
  "bouillie",
  "veloute",
  "blanquette",
];

const WATERY_SET = new Set(WATERY_METHODS);

/** Cette préparation est-elle aqueuse ? */
export function isWateryPreparation(text: string): boolean {
  const words = normalizeTerm(text).split(" ");
  return words.some((w) => WATERY_SET.has(w));
}

/** Les sept drapeaux du référentiel, dans l'ordre. */
export const SENTINEL_FLAGS = [
  "omega3Marine",
  "ironSource",
  "calciumSource",
  "iodineSource",
  "zincSource",
  "b12Source",
  "folateSource",
] as const;
export type SentinelFlag = (typeof SENTINEL_FLAGS)[number];

/**
 * LA CORRESPONDANCE ENTRE LE NOM DE COLONNE ET LE CHAMP DU CODE.
 *
 * `dietary_regime.ts` rend `["b12_source"]` — le nom de la COLONNE, qui est
 * aussi celui que la fiche et la base emploient. Le code, lui, lit
 * `ref.b12Source`. Un `Record` FERMÉ plutôt qu'une transformation
 * snake→camel: une transformation marcherait sur les sept d'aujourd'hui et
 * silencieusement sur un huitième mal nommé, alors qu'une clé absente de cette
 * table ne compile pas.
 */
export const SENTINEL_FLAG_BY_COLUMN = {
  omega3_marine: "omega3Marine",
  iron_source: "ironSource",
  calcium_source: "calciumSource",
  iodine_source: "iodineSource",
  zinc_source: "zincSource",
  b12_source: "b12Source",
  folate_source: "folateSource",
} as const satisfies Record<string, SentinelFlag>;

/**
 * LA PART D'UN GROUPE QUI DOIT PORTER UN DRAPEAU POUR QU'IL EN SOIT PORTEUR.
 *
 * ── POURQUOI CE SEUIL EXISTE, MESURÉ SUR LE VRAI RÉFÉRENTIEL ─────────────
 * La première version disait « un groupe est sentinelle si AU MOINS UN de ses
 * aliments porte un drapeau ». Sur les 208 entrées réelles, ça rendait 26
 * groupes sur 30 — `fried_food` à 100 %, `sauce_dressing` à 63 %, parce que le
 * seuil réglementaire « source de » (15 % de la VNR) est atteint par presque
 * tout. Un signal qui dit « il te manque 26 groupes cette semaine » n'est pas
 * un trou, c'est du bruit, et il aurait armé la correction de l'étape suivante
 * sur ce bruit.
 *
 * Deux tiers: le groupe doit être un porteur CARACTÉRISTIQUE du nutriment, pas
 * en contenir accidentellement. Constante opérationnelle, calibrée sur le
 * référentiel de ce jour et avouée comme telle — elle se relit quand le
 * référentiel double de taille.
 */
export const SENTINEL_CARRIER_SHARE = 2 / 3;

/**
 * LES GROUPES PORTEURS DE CHAQUE NUTRIMENT, DÉRIVÉS DU RÉFÉRENTIEL.
 *
 * Dérivés, jamais écrits à la main: une liste parallèle divergerait du seed le
 * jour où un aliment change de groupe, et personne ne le verrait. La
 * granularité reste la PRÉSENCE — jamais le milligramme, variance
 * sol/saison/cuisson de ±30-50 %.
 */
export function sentinelCarriersOf(
  index: CompositionIndex,
): Map<SentinelFlag, Set<FoodGroupRef>> {
  const perGroup = new Map<FoodGroupRef, { total: number; flags: Map<SentinelFlag, number> }>();
  for (const ref of index.bySlug.values()) {
    const entry = perGroup.get(ref.foodGroupRef) ??
      { total: 0, flags: new Map<SentinelFlag, number>() };
    entry.total++;
    for (const flag of SENTINEL_FLAGS) {
      if (ref[flag]) entry.flags.set(flag, (entry.flags.get(flag) ?? 0) + 1);
    }
    perGroup.set(ref.foodGroupRef, entry);
  }
  const out = new Map<SentinelFlag, Set<FoodGroupRef>>();
  for (const flag of SENTINEL_FLAGS) out.set(flag, new Set());
  for (const [group, entry] of perGroup) {
    for (const flag of SENTINEL_FLAGS) {
      const n = entry.flags.get(flag) ?? 0;
      if (entry.total > 0 && n / entry.total >= SENTINEL_CARRIER_SHARE) {
        out.get(flag)!.add(group);
      }
    }
  }
  return out;
}

/**
 * Tous les groupes porteurs, toutes sentinelles confondues.
 *
 * Gardé pour les tests et pour le rejeu: c'est l'ensemble sur lequel la
 * couverture se juge, et le voir en entier est la seule façon de remarquer
 * qu'il a enflé.
 */
export function sentinelGroupsOf(index: CompositionIndex): Set<FoodGroupRef> {
  const all = new Set<FoodGroupRef>();
  for (const groups of sentinelCarriersOf(index).values()) {
    for (const g of groups) all.add(g);
  }
  return all;
}

// ---------------------------------------------------------------------------
// LE CALCUL
// ---------------------------------------------------------------------------

/** Un plat, réduit à ce dont le verdict a besoin. */
export interface VerdictDish {
  slot: string | null;
  method: string;
  ingredients: readonly CompositionInput[];
}

/**
 * LE PLIAGE DES PRÉPARATIONS DANS LES PLATS.
 *
 * ⚠️ ── SANS LUI, LE VERDICT LIT LA MOITIÉ DU PLAN ──────────────────────────
 * En batch cooking, les ingrédients ne sont PAS dans le plat: le plat dit
 * « une portion du poulet rôti de mercredi », et le kilo de cuisses vit dans
 * la préparation. Un appelant qui passe ses seuls `dish.ingredients` rend au
 * verdict une assiette amputée de tout ce qui a été cuisiné d'avance —
 * c'est-à-dire, très exactement, de la protéine.
 *
 * MESURÉ le 2026-08-12 sur 80 générations réelles:
 *
 *     énergie hors des plats : 41 %  (médiane par plan 39 %, max 93 %)
 *     protéine hors des plats: 51 %
 *
 * Le verdict rendait `below` / `under` sur des plans à 99 % de leur cible, et
 * la boucle de correction dépensait son unique relance à ajouter de la
 * protéine à un plan qui touchait déjà son plancher. C'est la cause qu'on a
 * longtemps lue comme « les plans servent une fraction de leur enveloppe ».
 *
 * ── LE PRORATA N'EST PAS UN RAFFINEMENT ───────────────────────────────────
 * Une préparation fait `servingsMade` portions; un plat n'en consomme que
 * `servings`. Compter le lot entier à chaque plat qui y touche ferait l'erreur
 * inverse, et plus grosse: quatre dîners tirés d'un lot de quatre porteraient
 * quatre kilos de poulet, et le verdict dirait « above » sur un plan juste.
 *
 * ── FONCTION PURE, ICI ET PAS DANS L'APPELANT ─────────────────────────────
 * Elle vivait en fermeture dans `generate-meal-v1`, donc hors de portée des
 * tests — et c'est là qu'elle a pu perdre la moitié du plan sans qu'une seule
 * assertion ne bouge.
 */
export function foldPreparationsIntoDishes(args: {
  dishes: readonly {
    slot: string | null;
    method: string;
    ingredients: readonly CompositionInput[];
    uses: readonly { preparationId: string; servings: number }[];
  }[];
  preparations: readonly {
    id: string;
    servingsMade: number;
    ingredients: readonly CompositionInput[];
  }[];
}): VerdictDish[] {
  const byId = new Map(args.preparations.map((p) => [p.id, p]));
  return args.dishes.map((d) => {
    const ingredients: CompositionInput[] = d.ingredients.map((i) => ({ ...i }));
    for (const use of d.uses) {
      const prep = byId.get(use.preparationId);
      if (!prep) continue;
      const made = Math.max(1, Number(prep.servingsMade) || 1);
      const share = (Number(use.servings) || 1) / made;
      for (const i of prep.ingredients) {
        // ══════════════════════════════════════════════════════════════════
        // ⟳ LOT `L-1-b` · LA PROSE EST CONSOMMÉE ICI, PAS EN AVAL — 2026-08-22
        // ══════════════════════════════════════════════════════════════════
        //
        // ⛔ LE PIÈGE EST LE PRORATA, ET IL EST GROS. Une ligne de préparation
        // sans `amount` mais dont la prose dit « 150 g » serait relue PLUS TARD
        // par `resolveIngredients` — c'est-à-dire APRÈS le pliage, donc SANS le
        // facteur. Un lot de poulet fait pour 4 dîners compterait 150 g dans
        // CHACUN des 4 plats: ×4, et toujours dans le sens qui gonfle. C'est la
        // cicatrice « un facteur ne porte que sur la part mobile », à l'endroit
        // où elle mord.
        //
        // On lit donc la prose ICI, on lui applique le même `share` qu'à une
        // quantité structurée, et on RETIRE la prose de la copie pliée pour
        // qu'aucun lecteur aval ne la relise. La provenance, elle, survit
        // (`quantitySource`) — sans quoi une ligne rattrapée deviendrait
        // indiscernable d'une ligne que le modèle avait structurée.
        const lue = weighableQuantityOf({
          amount: i.amount,
          unit: i.unit,
          quantity: i.quantity,
        });
        ingredients.push({
          ...i,
          // `null` RESTE `null`. Une quantité absente ne devient pas 0 au
          // passage du prorata: c'est la règle R2 du moteur, et un 0 traverse
          // toutes les additions sans rien signaler.
          amount: lue.amount === null ? null : lue.amount * share,
          unit: lue.unit,
          quantity: null,
          quantitySource: lue.source,
        });
      }
    }
    return { slot: d.slot, method: d.method, ingredients };
  });
}

/**
 * Le verdict d'une génération entière.
 *
 * ── POURQUOI LE VERDICT PORTE SUR LA GÉNÉRATION, PAS SUR UN PLAT ─────────
 * L'énergie et la protéine sont des grandeurs de JOURNÉE; la densité est une
 * grandeur de plat, moyennée ici; les sentinelles sont une grandeur de
 * semaine. Les trois vivent dans le même objet parce qu'elles décrivent la
 * même génération — et parce qu'un verdict par plat multiplierait les
 * abstentions sans rien apprendre de plus.
 */
export function verdictFor(args: {
  dishes: readonly VerdictDish[];
  envelope: Envelope;
  index: CompositionIndex;
  /** Le nombre de jours que cette génération couvre. Au moins 1. */
  daysCovered: number;
  // (voir SENTINEL_MIN_DAYS: sous cette durée, les sentinelles s'abstiennent)
  /** L'imputation d'huile de friture, quand la méthode la déclenche. */
  friedMethod?: (method: string) => boolean;
  /**
   * FF-042 R6 — LES NUTRIMENTS QU'AUCUN ALIMENT NE PEUT APPORTER À CET ÉLÈVE.
   *
   * Des noms de COLONNE (`b12_source`), tels que
   * `uncoverableSentinelsFor(regime)` les rend. `[]` = rien d'incouvrable, ce
   * qui est le cas de tout le monde sauf les végans.
   *
   * REQUIS, jamais optionnel. Un appelant qui l'oublie remet la B12 dans les
   * trous réparables, et le produit se remet à boucler sur un élève végan sans
   * que rien n'échoue — le mode de défaillance exact que cette séparation
   * existe pour écarter. La casse de compilation est le mécanisme qui recense
   * les appelants.
   */
  uncoverableSentinels: readonly string[];
  /**
   * FF-051 — CE QUE L'ÉLÈVE MANGE DÉJÀ, sur toute la fenêtre.
   *
   * Une entrée par OCCURRENCE (`fixedIntakeInputsFor`), pas une par apport: un
   * shaker cinq matins de semaine pèse cinq shakers. `[]` = rien de déclaré.
   *
   * REQUIS, jamais optionnel. Un appelant qui l'oublie fait empiler au plan la
   * protéine et l'énergie d'un moment déjà mangé, et le verdict dira « within »
   * sur une journée qui déborde. Rien n'échouerait — c'est ce que la casse de
   * compilation existe pour empêcher.
   *
   * ⚠️ CES ENTRÉES NE SONT DANS AUCUN PLAT: un shaker n'a pas de méthode de
   * cuisson et sa densité n'a aucun sens. Elles comptent dans l'énergie et la
   * protéine — grandeurs de JOURNÉE — et restent hors de la densité, grandeur
   * de PLAT.
   */
  fixedIntakeInputs: readonly CompositionInput[];
}): CompositionVerdict {
  const { dishes, envelope, index, daysCovered } = args;
  const days = Math.max(1, daysCovered);

  // ── FF-042 R6 · LES TROUS STRUCTURELS, TRADUITS UNE FOIS ────────────────
  // Un nom de colonne inconnu est ÉCARTÉ, pas deviné: `SENTINEL_FLAG_BY_COLUMN`
  // est fermée, et une entrée hors table est soit une faute de frappe, soit un
  // drapeau qui n'existe pas encore. Dans les deux cas, l'ignorer est plus sûr
  // que de retirer un trou réparable au hasard.
  const uncoverableFlags = [
    ...new Set(
      args.uncoverableSentinels
        .map((c) => SENTINEL_FLAG_BY_COLUMN[c as keyof typeof SENTINEL_FLAG_BY_COLUMN])
        .filter(Boolean),
    ),
  ];
  const uncoverableSet = new Set<SentinelFlag>(uncoverableFlags);
  // Le canal EXPORTÉ garde les noms de COLONNE: c'est le vocabulaire de la
  // fiche, de la base et de la synthèse coach. Traduire deux fois serait deux
  // occasions de diverger.
  const uncoverable = [...new Set(args.uncoverableSentinels)].sort();

  // FF-051: les apports fixes sont de la VRAIE nourriture. Ils entrent donc
  // dans la worklist de résolution comme n'importe quel ingrédient — c'est ce
  // qui les fera apparaître dans la curation d'alias, et ce qui fait qu'un
  // apport dense non résolu déclenche l'abstention comme il le doit.
  const allInputs: CompositionInput[] = [
    ...dishes.flatMap((d) => [...d.ingredients]),
    ...args.fixedIntakeInputs,
  ];
  const resolution = resolveIngredients(index, allInputs);

  const notComputable: CompositionVerdict = {
    resolution: {
      resolved: resolution.total - resolution.unresolvedTerms.length,
      total: resolution.total,
      unresolvedEnergyDense: resolution.unresolvedEnergyDense,
      unweighedEnergyDense: resolution.unweighedEnergyDense,
    },
    energy: "not_computable",
    protein: "not_computable",
    density: "not_computable",
    // Le canal structurel survit à l'abstention: « cet élève est végan » ne
    // dépend pas de ce qu'on a su lire dans son assiette cette semaine.
    //
    // ⚠️ `uncoverable`, PAS `uncoverableFlags`: le canal exporté parle en noms
    // de COLONNE dans les deux chemins. Le test est tombé sur cette
    // incohérence — un consommateur qui lirait `b12Source` ici et `b12_source`
    // là aurait deux vocabulaires pour une donnée.
    sentinels: { missing: [], uncoverable },
  };

  // ── L'ABSTENTION, AVANT TOUT LE RESTE ───────────────────────────────────
  // Sous 80 % de résolution, OU un seul aliment de classe dense dont l'énergie
  // manque. Les deux dernières gardes mordent même à 95 %: une matière grasse
  // absente de la somme déplace l'énergie d'un plat de plusieurs dizaines de
  // pour cent.
  //
  // ── POURQUOI `coverage` ET NON `resolved.length / total` ────────────────
  // `coverage` compte les termes CONNUS, pesés ou non. Le ratio des seuls
  // pesés rendait 69 % là où celui-ci rend 96 %, sur une assiette dont l'écart
  // était fait de sel, de poivre et de légumes comptés à l'unité — et cette
  // porte-là s'abstenait sur des condiments, en éteignant du même coup le
  // verdict, la boucle de correction et la mise à l'échelle.
  //
  // Ce n'est pas un assouplissement: le danger réel des non-pesés n'est pas
  // leur nombre, c'est leur DENSITÉ, et il a désormais sa propre garde
  // ci-dessous. Une pincée de sel ne déplace rien; un filet d'huile, si.
  if (
    resolution.total === 0 ||
    resolution.coverage < MIN_RESOLUTION_FOR_VERDICT ||
    resolution.unresolvedEnergyDense ||
    resolution.unweighedEnergyDense
  ) {
    return notComputable;
  }

  // ── LES SENTINELLES SE JUGENT PAR NUTRIMENT, PAS PAR GROUPE ────────────
  // Un nutriment est COUVERT dès qu'un aliment résolu le porte, quel que soit
  // son groupe: du saumon couvre l'oméga-3 marin, et il est alors indifférent
  // que les fruits de mer n'aient pas paru. `missing` ne liste donc que les
  // groupes qui RÉPARERAIENT un trou réel — c'est exactement ce dont la boucle
  // de correction aura besoin (« include <group label> once this week »).
  //
  // Elles survivent à l'abstention des autres grandeurs, mais pas à celle de
  // la résolution: un trou constaté sur un plat qu'on n'a pas su lire n'est
  // pas un trou.
  const carriers = sentinelCarriersOf(index);
  const covered = new Set<SentinelFlag>();
  for (const { ref } of resolution.resolved) {
    for (const flag of SENTINEL_FLAGS) if (ref[flag]) covered.add(flag);
  }
  const missingSet = new Set<FoodGroupRef>();
  for (const flag of SENTINEL_FLAGS) {
    if (covered.has(flag)) continue;
    // ── LE TROU STRUCTUREL NE DEVIENT JAMAIS UN TROU RÉPARABLE ───────────
    // Il est retiré ICI, avant que `missing` n'existe — donc avant que la
    // boucle de correction ne puisse le voir. Filtrer chez elle marcherait
    // aussi longtemps qu'il n'y a qu'un seul lecteur de `missing`, et
    // cesserait de marcher au deuxième.
    if (uncoverableSet.has(flag)) continue;
    for (const g of carriers.get(flag) ?? []) missingSet.add(g);
  }
  // ── UNE CADENCE HEBDOMADAIRE NE SE JUGE PAS SUR TROIS JOURS ─────────────
  //
  // MESURÉ EN RUN RÉEL (2026-08-11): sur un plan d'UN SEUL JOUR, le verdict
  // rendait `missing: [dairy_cheese, dairy_yogurt, eggs, fatty_fish,
  // shellfish, white_fish]` — six groupes. Ce n'est pas un trou, c'est une
  // journée. Personne ne mange du poisson gras, des fruits de mer, du poisson
  // blanc, des œufs et deux laitages le même jour, et il n'y a aucune raison
  // qu'il le fasse: la cadence des sentinelles est HEBDOMADAIRE.
  //
  // Le coût n'était pas cosmétique: chaque faux trou consomme un
  // `place_missing_sentinel` dans la boucle de correction — c'est-à-dire un
  // des rares jetons d'une relance UNIQUE, dépensé pour réparer un problème
  // qui n'existe pas, à la place d'un vrai écart d'énergie ou de protéine.
  //
  // On s'abstient donc sous la semaine, plutôt que de rendre un chiffre faux.
  // C'est la même posture que l'abstention de densité sur les préparations
  // aqueuses: ce n'est pas le plan qui est mauvais, c'est LA GRANDEUR qui n'a
  // pas de sens sur cette fenêtre.
  //
  // `uncoverable` SURVIT à cette abstention, et c'est structurel: « cet élève
  // est végan, la B12 n'existe pas dans le règne végétal » est vrai un lundi
  // comme sur sept jours. Une carence structurelle n'est pas une affaire de
  // cadence.
  const missing = days >= SENTINEL_MIN_DAYS ? [...missingSet].sort() : [];

  // ── LES NUTRIMENTS, PAR PLAT, POUR QUE LA FRITURE S'IMPUTE AU BON PLAT ──
  let energyTotal = 0;
  let proteinTotal: number | null = 0;
  let cookedWeightTotal = 0;
  let energyKnown = true;
  const densities: number[] = [];
  let wateryDishes = 0;

  for (const dish of dishes) {
    const r = resolveIngredients(index, dish.ingredients);
    if (r.resolved.length === 0) continue;
    const fried = args.friedMethod ? args.friedMethod(dish.method) : false;
    const n: NutrientsOrUnknown = nutrientsOf(r.resolved, { friedMethod: fried });
    if (n === "unknown") {
      energyKnown = false;
      continue;
    }
    energyTotal += n.energyKcal;
    proteinTotal = n.proteinG === null || proteinTotal === null
      ? null
      : proteinTotal + n.proteinG;
    const cooked = r.resolved.reduce((s, ing) => s + ing.gramsRaw, 0);
    cookedWeightTotal += cooked;
    // ── LA DENSITÉ S'ABSTIENT SUR LES PRÉPARATIONS AQUEUSES ──────────────
    // Le plat est compté dans l'énergie et exclu de la densité: ce n'est pas
    // le plat qui est faux, c'est la GRANDEUR qui n'a pas de sens dessus.
    if (isWateryPreparation(dish.method)) wateryDishes++;
    else if (cooked > 0) densities.push(n.energyKcal / cooked);
  }

  // ── FF-051 · CE QUE LES APPORTS FIXES PÈSENT ────────────────────────────
  // Ajoutés aux TOTAUX, hors de la boucle par plat: ils ne sont dans aucun
  // plat, donc ils ne touchent ni `densities` ni `cookedWeightTotal`.
  //
  // ── R2: UN APPORT NON RÉSOLU PROPAGE DE L'INCONNU, JAMAIS DU ZÉRO ──────
  // C'est la règle du moteur, et c'est ici qu'elle est le plus tentante à
  // enfreindre: un `food_ref` inconnu rendrait naturellement « 0 g », et 0 est
  // un nombre — il traverse toutes les additions sans rien signaler. Le
  // plancher serait alors jugé ATTEINT sur un plan qui empile de la protéine
  // par-dessus un shaker de 30 g qu'on n'a pas su lire.
  if (args.fixedIntakeInputs.length > 0) {
    const rf = resolveIngredients(index, args.fixedIntakeInputs);
    const readable = rf.unresolvedTerms.length === 0 &&
      rf.unweighedTerms.length === 0;
    // Pas de `friedMethod`: un apport fixe est consommé tel quel.
    const n: NutrientsOrUnknown = readable
      ? nutrientsOf(rf.resolved, { friedMethod: false })
      : "unknown";
    if (n === "unknown") {
      energyKnown = false;
      proteinTotal = null;
    } else {
      energyTotal += n.energyKcal;
      proteinTotal = n.proteinG === null || proteinTotal === null
        ? null
        : proteinTotal + n.proteinG;
    }
  }

  // ── L'ÉNERGIE, EN DIRECTION SEULEMENT ───────────────────────────────────
  let energy: CompositionVerdict["energy"] = "not_computable";
  if (energyKnown && envelope.mode === "per_kg" && envelope.energy) {
    const perDay = energyTotal / days;
    const low = envelope.energy.low / ENERGY_DIRECTION_MARGIN;
    const high = envelope.energy.high * ENERGY_DIRECTION_MARGIN;
    energy = perDay < low ? "below" : perDay > high ? "above" : "within";
  }
  // En `per_portion`, le verdict énergie N'EXISTE PAS — il n'est pas calculé
  // puis tu, il n'est jamais produit. Non-existence plutôt que suppression: un
  // champ calculé finit dans un log, un agrégat ou un export.

  // ── LA PROTÉINE, EN GRAMMES CALCULÉS, RENDUE EN MOT ─────────────────────
  let protein: CompositionVerdict["protein"] = "not_computable";
  if (proteinTotal !== null) {
    if (envelope.mode === "per_kg") {
      protein = proteinTotal / days >= envelope.proteinFloorG ? "met" : "under";
    } else {
      // En `per_portion`, le seuil est une constante CÔTÉ PLAT, calculée
      // depuis la recette et jamais dérivée du corps. Un repas principal porte
      // une part protéique; on vérifie que la génération en porte au moins une
      // par repas principal composé.
      const mainMeals = dishes.filter((d) =>
        d.slot === "breakfast" || d.slot === "lunch" || d.slot === "dinner"
      ).length;
      protein = mainMeals === 0 || proteinTotal >= mainMeals * PER_PORTION_PROTEIN_G
        ? "met"
        : "under";
    }
  }

  // ── LA DENSITÉ ──────────────────────────────────────────────────────────
  let density: CompositionVerdict["density"] = "not_computable";
  if (
    envelope.mode === "per_kg" && envelope.densityCeiling !== null &&
    densities.length > 0 && cookedWeightTotal > 0
  ) {
    const mean = densities.reduce((s, d) => s + d, 0) / densities.length;
    density = mean > envelope.densityCeiling ? "above" : "within";
  }
  // `wateryDishes` n'est pas exporté: il ne sert qu'à expliquer pourquoi
  // `densities` peut être vide. Le compter dans le verdict ferait entrer un
  // détail de calcul dans une donnée destinée à être agrégée.
  void wateryDishes;

  return {
    resolution: notComputable.resolution,
    energy,
    protein,
    density,
    sentinels: { missing, uncoverable },
  };
}

/**
 * LE PLANCHER PROTÉIQUE PAR REPAS PRINCIPAL, EN MODE `per_portion`.
 *
 * ⚠️ CONSTANTE CÔTÉ PLAT, jamais dérivée du corps — c'est ce qui la rend
 * compatible avec le plancher TCA. 20 g est l'ordre de grandeur d'une part
 * protéique réelle (une portion de 100 g de volaille, deux œufs et un yaourt,
 * 150 g de légumineuses cuites), et c'est ce qui distingue une ANCRE d'une
 * garniture — le trou que la simple présence de FF-037 laisse ouvert.
 *
 * Opérationnelle, comme les plafonds de densité: elle se calibre pendant la
 * phase d'observation, elle ne se réclame d'aucune littérature.
 */
/**
 * LA FENÊTRE MINIMALE POUR JUGER UNE SENTINELLE.
 *
 * La cadence des sentinelles est HEBDOMADAIRE: « du poisson gras une fois
 * cette semaine ». Sur une fenêtre plus courte, l'absence d'un groupe n'est
 * pas un trou — c'est une journée ordinaire. Mesuré: un plan d'un jour
 * rendait SIX groupes manquants, et chacun consommait un jeton de la relance
 * unique pour réparer un problème inexistant.
 *
 * Sept, et pas cinq: c'est la période de la cadence elle-même. Tout seuil
 * inférieur serait une opinion sur « à partir de quand ça devrait être là »,
 * et personne ne l'a écrite.
 */
export const SENTINEL_MIN_DAYS = 7;

export const PER_PORTION_PROTEIN_G = 20;
