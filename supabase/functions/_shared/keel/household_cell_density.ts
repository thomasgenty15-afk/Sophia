// ═══════════════════════════════════════════════════════════════════════════
// LA BIFURCATION — LA DENSITÉ D'UNE CASE, SON PLANCHER, SA CONSÉQUENCE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_portions.ts` (découpage des gros
// fichiers, lot 2b). Aucune logique changée. `household_portions.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// `densityFragment` (la ligne par moment) reste dans `household_portions.ts`.
//
// Ce module n'importe que des types. `SlotDensity` vient de `portion_sizing.ts`
// en import de TYPE seulement (même boucle que `household_portion_types.ts`).

import type { SlotDensity } from "./portion_sizing.ts";
import type { PortionMember } from "./household_portion_types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LOT C · C3 (2026-09-11) — LE COULOIR D'UNE CASE, ET SES CONSOMMATEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UNE CASSEROLE PARTAGÉE DOIT TENIR POUR TOUS CEUX QUI Y PUISENT.
 *
 * ⛔ LE DÉFAUT QUE CECI FERME, ET IL EST ÉCRIT DANS LE PROMPT LUI-MÊME.
 * `methodBlock` étape 3 demande au modèle de « lire les cartes, prendre le plus
 * grand chiffre » — c'est-à-dire de faire une INTERSECTION à la main, sur
 * quatre cartes et trois moments. Mesuré au tir DENSITE (2026-09-08): les
 * quatre cartes demandaient 105, 122, 139 et **167** au déjeuner, et le modèle
 * a écrit **136** — la moyenne. Une personne s'est retrouvée avec 724 g dans
 * l'assiette. Un calcul déterministe qu'on délègue au modèle est un calcul
 * qu'on paie deux fois: en jetons, et en erreurs.
 *
 * ⛔ LES BOUCHES QUI ONT LEUR PROPRE PLAT NE COMPTENT PAS DANS L'INTERSECTION.
 * C'est tout l'intérêt d'un plat dédié: la casserole commune n'a plus à les
 * servir. Les garder resserrerait la bande commune au nom de quelqu'un qui ne
 * mange pas dedans — exactement le conflit que le plat dédié existe pour
 * dénouer.
 *
 * ⛔ ET L'INTERSECTION VIDE EST CONSERVÉE, jamais rabotée. « Si aucune densité
 * commune n'existe, le dire » est la demande du chantier, et c'est la même
 * règle que `empty_intersection` applique déjà entre deux JOURS d'un même
 * moment: une consigne intenable présentée comme tenable apprend au modèle que
 * ces nombres-là sont décoratifs (mesuré: 389 demandés, 126,7 rendus).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export interface CellDensity {
  minPer100G: number;
  maxPer100G: number;
  /**
   * La visée: le `preferred` de la personne du MILIEU (`middlePreferredOf`),
   * ramené dans la bande. ⟳ 2026-09-23 — c'était le plus BAS `preferred`.
   */
  aimPer100G: number;
  /** Vrai quand le plancher commun dépasse le plafond commun. */
  empty: boolean;
  /** Qui impose le plancher, et qui impose le plafond. Nommés dans le conflit. */
  floorFrom: string;
  ceilingFrom: string;
  /** Combien de mangeurs de la case portent un couloir NOMMÉ. */
  eatersWithCorridor: number;
}

/**
 * LA VISÉE DE LA PERSONNE DU MILIEU D'UNE CASE.
 *
 * ⛔ LA MÊME RÈGLE QUE `tableReferenceFactor` (`starch_side.ts`): la médiane;
 * à nombre pair, la plus BASSE des deux du milieu. Deux règles de « milieu »
 * dans le même moteur feraient viser à la consigne une autre personne que celle
 * dont le partage du féculent garde la part. ⚠️ À UN SEUL MANGEUR, sa visée
 * (là où `tableReferenceFactor` rend `null`: ici la case existe quand même).
 *
 * ⚠️ PAS LE MINIMUM, PAS LE MAXIMUM. Le minimum faisait écrire la recette pour
 * la plus grande assiette de la table; le maximum pour la plus petite.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function middlePreferredOf(preferred: readonly number[]): number {
  const ok = preferred.filter((p) => Number.isFinite(p)).sort((a, b) => a - b);
  if (ok.length === 0) return Infinity;
  return ok[Math.floor((ok.length - 1) / 2)];
}

export function cellDensityOf(
  eaters: readonly { name: string; slots: readonly SlotDensity[] }[],
  slot: string,
  /**
   * ⟳ 2026-09-11 · LOT B — LE JOUR DE CETTE CASE. ⛔ REQUIS, jamais `?`.
   *
   * Depuis le lot B, un moment peut porter DEUX couloirs — un par grappe de
   * jours compatibles. Chercher « le » couloir du dîner sans dire QUEL dîner
   * rendrait celui de l'autre jour, c'est-à-dire ferait exactement ce que le
   * lot répare: le vendredi imposant sa bande au dimanche. Un `?` aurait laissé
   * « le premier trouvé » être la réponse silencieuse de tous les appelants.
   *
   * ⚠️ UNE LIGNE SANS JOURS (`days: []`) VAUT POUR TOUS LES JOURS: c'est le
   * décor de test, et le comportement d'avant ce lot.
   */
  day: string,
): CellDensity | null {
  let floor = -Infinity;
  let ceiling = Infinity;
  // ⟳ 2026-09-23 — LES VISÉES DE TOUS LES MANGEURS, pour en prendre celle du
  // MILIEU (voir `middlePreferredOf`), et plus la plus basse.
  const preferred: number[] = [];
  let floorFrom = "";
  let ceilingFrom = "";
  let counted = 0;
  for (const e of eaters) {
    // ⚠️ `?? []` PARCE QUE CETTE LIGNE PEUT VENIR D'UN PAYLOAD RELU ou d'un
    // décor antérieur au lot B: sans jours, elle vaut pour tous les jours —
    // le comportement d'avant, et jamais une exception silencieuse.
    const corridor = e.slots.find((d) => {
      const jours = d.days ?? [];
      return d.slot === slot && (jours.length === 0 || jours.includes(day));
    });
    if (!corridor) continue;
    counted++;
    if (corridor.minPer100G > floor) {
      floor = corridor.minPer100G;
      floorFrom = e.name;
    }
    if (corridor.maxPer100G < ceiling) {
      ceiling = corridor.maxPer100G;
      ceilingFrom = e.name;
    }
    preferred.push(corridor.preferredPer100G);
  }
  if (counted === 0) return null;
  const empty = floor > ceiling;
  const aim = middlePreferredOf(preferred);
  return {
    minPer100G: floor,
    maxPer100G: ceiling,
    // ⟳ 2026-09-21 — la visée était le plus BAS `preferred` (elle était le
    // plus haut avant: sur le plan `3e121b21`, la table visait 154 kcal/100 g,
    // la visée de l'homme en prise, et l'homme en perte recevait 877 kcal dans
    // 570 g au lieu de 626).
    // ⟳ 2026-09-23 — LA VISÉE EST CELLE DE LA PERSONNE DU MILIEU, RAMENÉE
    // DANS LA BANDE (décision du propriétaire n° 4, audit
    // `docs/keel/AUDIT-DOSAGES-2026-09-23.md`). La visée la plus basse
    // demandait « l'assiette la plus grande que la borne autorise » à toute la
    // table: la recette commune se lisait comme celle du plus gros mangeur, et
    // Thomas arrivait à 700 g par construction. La visée du milieu est celle de
    // THE TEMPLATE (`standardRecipeBlock`); l'énergie en plus passe par les
    // à-côtés, pas par l'assiette. Le plancher commun (`Math.max(floor, …)`)
    // garde la propriété d'avant: personne ne reçoit une assiette au-dessus de
    // sa borne de masse, puisque chaque plancher est `cible / assiette maximale`.
    aimPer100G: empty ? floor : Math.min(ceiling, Math.max(floor, aim)),
    empty,
    floorFrom,
    ceilingFrom,
    eatersWithCorridor: counted,
  };
}

/**
 * LA PHRASE D'UNE CASE — sans unité, parce que l'en-tête du calendrier la porte.
 *
 * ⚠️ L'UNITÉ EST DITE UNE FOIS, EN TÊTE DU CALENDRIER, ET PAS SUR CHAQUE
 * LIGNE. C'est la propriété que `densityFragment` tient déjà sur ses moments
 * (`one(d, i === 0)`): « at least 182 kcal per 100 g at lunch, 159 at dinner »
 * se lit d'un trait, la répéter fait une ligne qu'on saute. Ici il peut y avoir
 * vingt et une cases: la répétition coûterait vingt fois.
 *
 * ⛔ ET LE CONFLIT NOMME LES DEUX PERSONNES. Le modèle ne peut rien faire d'une
 * bande vide s'il ignore qui la vide: dire « ça ne tient pas » sans dire pour
 * qui, c'est lui demander d'échouer poliment.
 */
export function cellDensitySentence(cell: CellDensity): string {
  if (cell.empty) {
    return ` No single density suits them all: ${cell.floorFrom} needs at least ` +
      `${cell.minPer100G}, ${cell.ceilingFrom} at most ${cell.maxPer100G}. ` +
      `Aim ${cell.aimPer100G} and cook the other one apart if you can.`;
  }
  const band = cell.maxPer100G > cell.minPer100G
    ? `${cell.minPer100G}-${cell.maxPer100G}`
    : `${cell.minPer100G}`;
  return ` Shared dish ${band}, aim ${cell.aimPer100G}.`;
}

/**
 * LE PLANCHER DE DENSITÉ DU BLOC — la base, relevée par ce qu'on ne peut pas
 * nommer.
 *
 * ⛔ IL NE LIT QUE `floorOnly`, ET C'EST LA DÉCISION DU LOT. Une bouche sous
 * plancher TCA ne peut recevoir aucun nombre en face de son nom; son exigence
 * doit pourtant atteindre le modèle, sans quoi le plan la sous-nourrit en
 * silence pour la protéger d'un chiffre. Elle passe donc par le plancher
 * COMMUN, où elle se confond avec celle de tout le monde.
 *
 * ⛔ ET IL NE LIT PAS `named`. Faire monter le plancher commun avec la densité
 * NOMMÉE d'une personne imposerait au petit-déjeuner de tout le foyer la
 * densité du déjeuner de la plus exigeante — mesuré sur le corps du 2026-09-07:
 * 182 au lieu de 114, sur un moment qui n'en avait aucun besoin. La ligne est
 * l'instrument précis; le plancher est l'instrument grossier, réservé à qui ne
 * peut pas être nommé.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function densityFloorsOf(
  members: readonly PortionMember[],
  base: { normal: number; light: number },
): { normal: number; light: number } {
  let normal = base.normal;
  let light = base.light;
  for (const m of members) {
    for (const d of m.requiredDensity?.floorOnly ?? []) {
      if (d.light) light = Math.max(light, d.kcalPer100G);
      else normal = Math.max(normal, d.kcalPer100G);
    }
  }
  return { normal, light };
}

/**
 * ⛔ EXPORTÉ LE 2026-09-08 POUR LE BRIEF DU FOYER, sans toucher un mot.
 *
 * Le foyer portait les CHIFFRES de densité sur les cartes et aucune de ces cinq
 * lignes. Un nombre en kcal/100 g au bout d'une carte, sans elles, se lit comme
 * une information sur la PERSONNE — c'est-à-dire comme le corps que v33 lui a
 * retiré — et rien n'interdit de « l'atteindre » en imaginant une assiette plus
 * petite, ce qui est précisément le geste que le moteur reprendra ensuite.
 *
 * C'est le principe que ce fichier énonce trois fois: **une contrainte qu'on
 * énonce sans dire ce qu'elle INTERDIT est une contrainte décorative.**
 */
export const DENSITY_CONSEQUENCE = [
  "A density on someone's line is a fact about the DISH served at that moment,",
  "as served, not a fact about them: write that recipe at least that dense.",
  // ⟳ 2026-09-23 — « more of the starch, the protein or the fat » RETIRÉ
  // (audit `docs/keel/AUDIT-DOSAGES-2026-09-23.md`): c'était la quatrième
  // phrase qui envoyait le modèle au féculent. Le geste est celui du remède
  // « trop bas » de `standardRecipeBlock`, mot pour mot, et il nomme les deux
  // échappatoires qu'on refuse. « the template » est en minuscules: cette
  // phrase part aussi là où la recette de référence n'est pas servie.
  "Reach it by what the dish is MADE OF — less cooking water, legumes in the",
  "main pot or 10 g more cheese; never more starch than the template, never",
  "fewer vegetables.",
  "Do not reach it by serving a smaller plate: the plate stays a plate.",
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · ÉTAPE C4 — LA PRÉSÉANCE, PARCE QUE DEUX NOMBRES SE
  // CONTREDISAIENT DANS LE MÊME PROMPT
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT DE CONTRAT, MESURÉ. Le bloc de recette promet « a normal dish
  // carries at least 100 kcal per 100 g » ; le contrat d'un petit-déjeuner de
  // 613,5 kcal à grand appétit accepte **91** (tir n° 3 du 2026-09-11). Tant
  // que la borne basse d'un tel moment restait tue, le modèle ne lisait que
  // 100 — et le moteur jugeait sur 91. Depuis cette étape la bande vraie est
  // imprimée ; sans cette phrase, elle CONTREDIRAIT le plancher commun deux
  // paragraphes plus loin, et un modèle qui doit arbitrer entre deux nombres
  // en choisit un au hasard.
  //
  // ⛔ ET LA PRÉSÉANCE VA DANS LE SEUL SENS SÛR: la bande nommée gagne sur le
  // plancher général, jamais l'inverse. C'est la bande que le moteur mesure.
  "When a line gives a RANGE for a moment, that range wins over the general",
  "floor stated further down — including when its low end is under that floor.",
  "The range is what the app measures the dish against.",
] as const;
