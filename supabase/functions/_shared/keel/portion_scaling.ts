/**
 * LA MISE À L'ÉCHELLE DES PORTIONS — le dernier recours, et le seul qui marche.
 *
 * ── LE DÉFAUT, MESURÉ SUR SIX GÉNÉRATIONS RÉELLES (2026-08-11) ─────────────
 *
 *     Femme 55 kg · fat_loss ......... 1027 kcal/j servis pour 1460 visés  (70 %)
 *     Homme 92 kg · fat_loss ......... 1637 kcal/j servis pour 2390 visés  (69 %)
 *     Homme 92 kg · muscle_gain ...... 2001 kcal/j servis pour 3068 visés  (65 %)
 *
 * Le rapport 92 kg / 55 kg servi est de ×1,59 pour un attendu de ×1,64: **les
 * portions suivent le corps correctement.** Ce qui manque est un FACTEUR
 * CONSTANT d'environ 1,45, identique sur tous les gabarits. Les proportions
 * sont justes, le niveau est bas.
 *
 * ── CE QUE LA MESURE A DONNÉ APRÈS COUP (2026-08-12, 18 générations) ───────
 * Le module marche, et sa frontière est nette. Sur trois campagnes de six
 * scénarios, plans COMPLETS (3/3 ou 5/5 jours remplis, 3,0 repas par jour):
 *
 *     départ ≥ 67 % de la cible ....... arrivée 96-100 %, plancher fermé
 *     départ ≤ 72 % et `reste` au ×2 ... arrivée 80-83 %
 *     départ à 46 % du plancher ....... 79/110, hors d'atteinte d'un facteur borné
 *
 * Ce n'est donc pas le déficit d'énergie qui décide, c'est LA PART DE
 * L'ASSIETTE QUE LE FACTEUR PEUT ATTEINDRE — ce qui a motivé l'élargissement
 * aux dénombrables décrit plus bas.
 *
 * ── LES QUATRE TENTATIVES PAR LA CONSIGNE, ET LEUR RENDEMENT ───────────────
 *
 *     boucle de correction (`raise_energy`) ................... ×1,21
 *     ancre de portion ajoutée en fin de consigne ............. ×0,96
 *     ancre À LA PLACE de la ligne générique du système ....... ×0,92
 *     ancre + retrait du contre-exemple « 500 g = 3 dîners » .. aucun effet
 *
 * Il en faudrait ×1,45. **Aucune intervention au niveau du prompt ne déplace
 * les portions.** Le module `portion_anchor.ts` existe, il est juste, il
 * s'échelonne — et le modèle ne le suit pas. C'est ce qui a décidé de ce
 * module-ci: le modèle compose, le déterministe corrige. La même posture que
 * toutes les autres gardes du produit.
 *
 * ── CE QUI EST MIS À L'ÉCHELLE, ET CE QUI NE L'EST JAMAIS ──────────────────
 * Les GRAMMES et MILLILITRES, et — depuis le 2026-08-12 — les DÉNOMBRABLES et
 * les CUILLÈRES, par arrondi.
 *
 * La version d'origine refusait les dénombrables, et l'argument était bon:
 * « 0,7 avocat » et « 1,4 tortilla » ne s'achètent ni ne se servent. Il visait
 * les FRACTIONS. « 2 œufs » → « 3 œufs » se sert très bien, et le refus coûtait
 * cher: les migrations `unit_grams` du même jour ont donné un poids à ces
 * aliments, qui sont passés d'INVISIBLES (0 kcal) à LUS MAIS IMMOBILES. Mesuré
 * en run réel: `reste ×2,00` ne déplaçait l'énergie que de 3 points, ~60 % du
 * plat étant hors de portée du facteur.
 *
 * Deux garde-fous remplacent le refus global, et ils sont plus précis que lui:
 * le nombre réécrit doit être celui de la prose (ce qui neutralise « 1/2
 * avocado », qui commence par « 1 »), et la frontière du singulier/pluriel ne
 * se traverse pas — fléchir demanderait un moteur de grammaire.
 *
 * Le sel, le poivre et les herbes ne portent pas de quantité structurée: ils
 * ne sont pas touchés sans qu'on ait à les nommer.
 *
 * ── LA PROSE SUIT LE CHIFFRE, TOUJOURS ────────────────────────────────────
 * `quantity` (ce que l'élève LIT) est réécrite depuis `amount` mis à
 * l'échelle. Les laisser diverger donnerait une liste de courses qui ne
 * correspond plus à l'assiette — le défaut le plus difficile à voir et le plus
 * cher à réparer une fois en production.
 *
 * ── SOUS LE PLANCHER TCA, RIEN NE SE MET À L'ÉCHELLE ──────────────────────
 * `per_portion` n'a pas de bande d'énergie: `scaleFactorFor` rend `null`, et
 * c'est structurel plutôt que conditionnel. Une portion recalculée depuis une
 * cible énergétique serait un chiffre dérivé du corps d'un élève sous
 * plancher.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { Envelope } from "./meal_envelope.ts";
import { MIN_RESOLUTION_FOR_VERDICT } from "./meal_verdict.ts";

/**
 * LES BORNES DU FACTEUR.
 *
 * Le plafond n'est pas une prudence de façade: à ×2, une portion de 200 g
 * devient 400 g, ce qui est déjà le maximum crédible d'une assiette. Au-delà,
 * le plan n'est pas « trop petit », il est structurellement faux — il manque
 * un repas, ou un composant entier — et l'étirer produirait une assiette
 * absurde au lieu de signaler le vrai problème.
 *
 * Le plancher autorise de réduire, mais peu: un plan trop copieux est un
 * défaut moins grave qu'un plan absurde, et le réduire fort ferait basculer
 * dans le registre de la restriction.
 */
export const MIN_SCALE = 0.75;
export const MAX_SCALE = 2.0;

/**
 * LA ZONE MORTE — on ne touche pas à un plan déjà bon.
 *
 * Sans elle, chaque génération serait réécrite pour ±3 %, et les quantités
 * rondes que le modèle choisit (100 g, 150 g) deviendraient des 103 g et des
 * 146 g. Une mise à l'échelle qui se déclenche toujours abîme la lisibilité
 * sans rien gagner.
 */
export const SCALE_DEAD_ZONE = 0.12;

/** Le poids maximal d'UN ingrédient après mise à l'échelle. */
export const MAX_SINGLE_INGREDIENT_G = 500;

export interface ScalableIngredient {
  term: string;
  quantity: string | null;
  amount: number | null;
  unit: string | null;
  state: string | null;
  gramsRaw: number | null;
}

/**
 * De combien faut-il multiplier ? `null` = ne rien faire.
 *
 * `computedKcal` est l'énergie de TOUTE la fenêtre, telle que le référentiel
 * la calcule — préparations comprises. `daysCovered` la ramène au jour.
 *
 * ⚠️ Rendre `null` est le cas nominal dans trois situations, et aucune n'est
 * un échec: pas d'enveloppe (plancher TCA, corps inconnu), énergie non
 * calculable (référentiel trop pauvre sur ce plan), ou plan déjà dans la zone
 * morte. Mettre à l'échelle sur une énergie douteuse ferait exactement le
 * dégât que l'abstention du verdict existe pour éviter.
 */
export function scaleFactorFor(args: {
  computedKcal: number | null;
  envelope: Envelope;
  daysCovered: number;
  /**
   * L'énergie portée par les ingrédients RÉELLEMENT échelonnables (g et ml).
   *
   * ── POURQUOI CE PARAMÈTRE EXISTE, ET IL A ÉTÉ MESURÉ ────────────────────
   * Les unités dénombrables ne bougent pas (« 1 tortilla », « 1/2 avocat »).
   * Appliquer le facteur brut aux seuls pesables laisse donc l'écart
   * partiellement ouvert. Mesuré sur six générations réelles: un facteur de
   * ×1,81 ne rendait que ×1,39 effectif, et le plan restait à 77 % de sa
   * cible au lieu d'y arriver.
   *
   * Le facteur juste est celui qui, appliqué à la SEULE part échelonnable,
   * amène le TOTAL à la cible:
   *
   *     f = (cible − part non échelonnable) / part échelonnable
   *
   * `undefined` retombe sur l'ancien calcul (facteur brut sur le total), ce
   * qui reste correct quand tout est pesable — mais l'appelant a toujours
   * l'information, et la passer est ce qui ferme l'écart.
   */
  scalableKcal?: number | null;
  /**
   * LA PART D'INGRÉDIENTS RÉSOLUS. **Requise, et c'est une garde.**
   *
   * ── LE DÉFAUT MESURÉ (run réel, 2026-08-12) ─────────────────────────────
   * Un plan résolu à 52 % a produit un facteur de ×2 et s'est fait doubler.
   * Or à 52 %, l'énergie calculée est un SOUS-COMPTE: la moitié des aliments
   * n'est pas lue. Le plan était peut-être déjà à sa cible, et on venait d'en
   * faire une assiette de deux fois trop.
   *
   * Mettre à l'échelle un plan qu'on ne sait pas lire est exactement le mode
   * de défaillance que l'abstention du verdict existe pour écarter — et c'est
   * pire ici, parce que le verdict ne fait que se taire quand la mise à
   * l'échelle, elle, AGIT.
   *
   * On réutilise le seuil du verdict (`MIN_RESOLUTION_FOR_VERDICT`): les deux
   * répondent à la même question — « sait-on lire cette assiette ? » — et deux
   * seuils différents finiraient par diverger.
   *
   * ⚠️ ── C'EST `ResolutionResult.coverage`, PAS `resolved.length / total` ───
   * Le nom du champ invite à compter le tableau `resolved`, et ce tableau ne
   * contient que les termes PESÉS. Le sel, le poivre et « 2 poivrons » sans
   * poids d'unité en sont absents tout en étant parfaitement connus. Mesuré le
   * 2026-08-12: 69 % au lieu de 96 % sur la même assiette — la mise à l'échelle
   * s'abstenait sur des condiments, et on a cherché la cause dans le
   * référentiel pendant deux diagnostics.
   *
   * Passe `resolveIngredients(...).coverage`, ou
   * `verdict.resolution.resolved / verdict.resolution.total` — les deux disent
   * la même chose. Le danger des non-pesés est gardé ailleurs, par
   * `unweighedEnergyDense`.
   */
  resolvedShare: number;
}): number | null {
  const { computedKcal, envelope } = args;
  if (envelope.mode !== "per_kg") return null;
  if (envelope.energy === null) return null;
  if (computedKcal === null || !Number.isFinite(computedKcal)) return null;
  if (!Number.isFinite(args.resolvedShare)) return null;
  if (args.resolvedShare < MIN_RESOLUTION_FOR_VERDICT) return null;

  const days = Math.max(1, Math.floor(args.daysCovered));
  const perDay = computedKcal / days;
  if (perDay <= 0) return null;

  const target = (envelope.energy.low + envelope.energy.high) / 2;

  // LA ZONE MORTE SE JUGE SUR LE TOTAL, pas sur la part échelonnable: c'est le
  // total qui dit si le plan est bon, et on ne réécrit pas un plan bon.
  if (Math.abs(target / perDay - 1) <= SCALE_DEAD_ZONE) return null;

  let raw = target / perDay;

  const scalable = args.scalableKcal;
  if (scalable !== null && scalable !== undefined && Number.isFinite(scalable)) {
    const scalablePerDay = scalable / days;
    const fixedPerDay = perDay - scalablePerDay;
    // Si le non-échelonnable dépasse déjà la cible, l'étirer n'aiderait pas —
    // on ne peut que réduire ce qui reste, et le plancher borne la casse.
    if (scalablePerDay > 0) {
      raw = (target - fixedPerDay) / scalablePerDay;
    }
  }

  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

/**
 * La quantité en prose, réécrite depuis le chiffre.
 *
 * Arrondi au multiple de 5 au-dessus de 20 g, à l'unité en dessous: « 137 g »
 * n'est pas une portion, « 135 g » non plus vraiment, mais « 8 g » d'huile est
 * une vraie précision qu'arrondir à 10 fausserait de 25 %.
 */
function roundAmount(value: number): number {
  if (value >= 20) return Math.round(value / 5) * 5;
  return Math.max(1, Math.round(value));
}

/**
 * LES DÉNOMBRABLES ET LES CUILLÈRES — ce que l'arrondi rend servable.
 *
 * ── POURQUOI ÇA A CHANGÉ (2026-08-12) ─────────────────────────────────────
 * L'en-tête refusait ces unités, et l'argument était juste: « 0,7 avocat » et
 * « 1,4 tortilla » ne s'achètent ni ne se servent. Mais il visait les
 * FRACTIONS, pas les dénombrables — « 2 œufs » → « 3 œufs » s'achète et se
 * sert très bien.
 *
 * Ce qui a rendu l'élargissement nécessaire: les migrations `unit_grams` du
 * même jour ont donné un poids aux aliments comptés à la pièce. Ils étaient
 * INVISIBLES au calcul (0 kcal), ils sont devenus LUS MAIS IMMOBILES — et le
 * levier s'est retrouvé plus étroit que l'assiette. Mesuré en run réel:
 * `reste ×2,00` ne déplaçait l'énergie que de 3 points, parce que ~60 % du
 * plat n'était pas échelonnable.
 *
 * `unit` s'arrondit à l'ENTIER, les cuillères au DEMI: une demi-cuillère est
 * une vraie mesure de cuisine, un demi-œuf non.
 */
const SPOON_UNITS = new Set(["tbsp", "tsp"]);

/**
 * CETTE UNITÉ EST-ELLE DÉPLAÇABLE PAR LE FACTEUR ?
 *
 * ⚠️ EXPORTÉE PARCE QUE L'APPELANT DOIT LA PARTAGER, pas la redéfinir.
 * `scaleFactorsFor` a besoin de savoir quelle part de l'énergie et de la
 * protéine le facteur peut réellement bouger — c'est ce qui distingue la part
 * MOBILE de la part FIXE dans son calcul. Si l'appelant garde sa propre liste
 * d'unités, les deux divergent au premier élargissement, et le facteur se
 * remet à porter sur une assiette qui n'est pas celle qu'on met à l'échelle.
 * C'est très exactement le défaut du 2026-08-12 (le facteur protéique calculé
 * sur le total), et il coûterait le même prix une seconde fois.
 *
 * Une SUR-estimation reste possible et elle est sans danger: un dénombrable
 * dont la prose n'est pas réécrivable ne bougera pas, donc le facteur
 * sous-corrige légèrement. Sous-corriger est le bon sens de l'erreur.
 */
export function isScalableUnit(unit: string | null | undefined): boolean {
  const u = String(unit ?? "").toLowerCase();
  return u === "g" || u === "ml" || u === "unit" || SPOON_UNITS.has(u);
}

function roundCountable(value: number, unit: string): number {
  if (SPOON_UNITS.has(unit)) return Math.max(0.5, Math.round(value * 2) / 2);
  return Math.max(1, Math.round(value));
}

/**
 * LA PROSE D'UN DÉNOMBRABLE — réécrite, ou l'ingrédient n'est pas touché.
 *
 * Pour les grammes, `${next} ${unit}` suffit: « 150 g » n'a pas de nom
 * d'aliment dedans. Pour un dénombrable, la prose EST la phrase — « 2 eggs »,
 * « 1 tin of chickpeas » — et la réécrire en « 3 unit » donnerait une liste de
 * courses illisible. On remplace donc le nombre EN TÊTE, et rien d'autre.
 *
 * ⚠️ DEUX REFUS, chacun pour un défaut qui a un nom:
 *
 *   1. LE NOMBRE DE TÊTE DOIT ÊTRE LE `amount`. « 1/2 avocado » commence par
 *      « 1 »: le réécrire donnerait « 2/2 avocado ». C'est exactement
 *      l'exemple que l'en-tête donnait pour refuser ces unités, et c'est cette
 *      règle-ci qui le neutralise — pas un cas particulier sur l'avocat.
 *
 *   2. LE SINGULIER ET LE PLURIEL NE S'ÉCHANGENT PAS. « 1 egg » → « 2 egg »
 *      et « 2 eggs » → « 1 eggs » sont tous deux faux, dans les deux langues.
 *      Fléchir demanderait un moteur de grammaire, et le dépôt a déjà payé
 *      « jamais de matcher maison ». On refuse donc de traverser la frontière
 *      du 1 — au prix des cas « 1 blanc de poulet » → « 2 », assumé.
 */
function rewriteCountableQuantity(
  quantity: string | null,
  amount: number,
  next: number,
): string | null {
  if (!quantity) return null;
  // Le pluriel changerait: on ne sait pas fléchir, donc on ne touche pas.
  if ((amount < 2) !== (next < 2)) return null;
  const m = /^(\s*)(\d+(?:[.,]\d+)?)/.exec(quantity);
  if (!m) return null;
  const lead = Number(m[2].replace(",", "."));
  if (!Number.isFinite(lead) || Math.abs(lead - amount) > 0.001) return null;
  const shown = Number.isInteger(next) ? String(next) : next.toFixed(1);
  return `${m[1]}${shown}${quantity.slice(m[0].length)}`;
}

export interface ScaleResult<T> {
  items: T[];
  /** Combien d'ingrédients ont réellement bougé. 0 = la mise à l'échelle n'a rien pu faire. */
  changed: number;
  /** Ceux qui ont été plafonnés à `MAX_SINGLE_INGREDIENT_G`. */
  capped: string[];
}

/**
 * DEUX FACTEURS, PARCE QU'UN SEUL NE PEUT PAS TENIR DEUX PROMESSES.
 *
 * ── LE DÉFAUT MESURÉ, APRÈS LE PREMIER CORRECTIF (2026-08-11) ──────────────
 * Un facteur unique a ramené l'énergie à 86-96 % de la cible sur les six
 * scénarios. Mais la protéine restait courte là où le plancher est haut:
 *
 *     Femme 55 kg · fat_loss ......... 72 g pour un plancher de 110
 *     Homme 92 kg · fat_loss ......... 137 g pour un plancher de 184
 *
 * C'est arithmétique et pas anecdotique: `fat_loss` demande 2,0 à 2,7 g/kg de
 * protéine dans une enveloppe d'énergie RÉDUITE. Étirer tout le plat du même
 * facteur monte l'énergie autant que la protéine — donc on touche la cible
 * énergétique bien avant le plancher protéique, et on s'arrête là.
 *
 * La seule façon d'atteindre les deux est de faire **grossir la protéine plus
 * vite que le reste**. C'est aussi ce qu'un diététicien ferait à la main:
 * agrandir le blanc de poulet, pas la portion de riz.
 */
export interface ScaleFactors {
  /** Pour les aliments protéiques (`PROTEIN_SOURCES`). */
  protein: number;
  /** Pour tout le reste de ce qui est pesable. */
  other: number;
}

/**
 * Les deux facteurs, calculés pour viser l'énergie ET le plancher protéique.
 *
 * ── L'ORDRE COMPTE, ET IL EST DÉLIBÉRÉ ─────────────────────────────────────
 * On sert d'abord la protéine (le plancher est un plancher: il ne se négocie
 * pas), puis on comble l'énergie qui reste avec le reste du plat. L'inverse
 * remplirait l'énergie de féculent et laisserait le plancher ouvert — ce que
 * le facteur unique faisait déjà.
 *
 * `other` peut légitimement descendre sous 1: quand la protéine grossit
 * beaucoup, le reste doit reculer pour que l'énergie totale reste dans la
 * bande. C'est le comportement voulu, et c'est ce qui distingue une assiette
 * recomposée d'une assiette simplement plus grosse.
 */
export function scaleFactorsFor(args: {
  computedKcal: number | null;
  computedProteinG: number | null;
  /** L'énergie portée par les aliments protéiques PESABLES. */
  proteinFoodKcal: number;
  /** L'énergie portée par le reste de ce qui est pesable. */
  otherScalableKcal: number;
  /** La protéine portée par les aliments protéiques PESABLES. */
  proteinFoodProteinG: number;
  envelope: Envelope;
  daysCovered: number;
  /** Voir `scaleFactorFor`: la même garde, relayée. */
  resolvedShare: number;
}): ScaleFactors | null {
  if (args.envelope.mode !== "per_kg" || args.envelope.energy === null) return null;
  if (args.computedKcal === null || !Number.isFinite(args.computedKcal)) return null;

  // La garde de lisibilité vaut pour les DEUX facteurs: recomposer une
  // assiette qu'on ne sait pas lire est aussi faux que l'agrandir.
  if (
    !Number.isFinite(args.resolvedShare) ||
    args.resolvedShare < MIN_RESOLUTION_FOR_VERDICT
  ) {
    return null;
  }

  const base = scaleFactorFor({
    computedKcal: args.computedKcal,
    scalableKcal: args.proteinFoodKcal + args.otherScalableKcal,
    envelope: args.envelope,
    daysCovered: args.daysCovered,
    resolvedShare: args.resolvedShare,
  });

  const days = Math.max(1, Math.floor(args.daysCovered));
  const floor = args.envelope.proteinFloorG;
  const proteinPerDay = (args.computedProteinG ?? 0) / days;

  // ── LE PLANCHER PROTÉIQUE N'EST PAS GOUVERNÉ PAR LA ZONE MORTE D'ÉNERGIE ─
  //
  // La première version démarrait par `if (base === null) return null`, donc
  // un plan dont l'énergie était bonne mais la protéine à moitié du plancher
  // repartait intact. C'est faux, et ça contredit la hiérarchie du produit: la
  // protéine est la grandeur de rang 2, celle qu'aucune doctrine ne peut
  // éteindre. Une assiette à la bonne énergie et à la moitié du plancher doit
  // être RECOMPOSÉE — plus de protéine, moins de féculent, même énergie.
  //
  // On ne renonce donc que lorsque les DEUX sont en ordre.
  const proteinShort = proteinPerDay > 0 && proteinPerDay < floor * (1 - SCALE_DEAD_ZONE);
  if (base === null && !proteinShort) return null;

  // Sans protéine mesurée ou sans aliment protéique pesable, il n'y a rien à
  // différencier: le facteur unique reste le bon.
  if (proteinPerDay <= 0 || args.proteinFoodProteinG <= 0) {
    return base === null ? null : { protein: base, other: base };
  }

  // 1. LE PLANCHER D'ABORD. De combien la protéine doit-elle grossir ?
  //
  // ⚠️ ── LE FACTEUR NE PORTE QUE SUR LA PROTÉINE MOBILE ───────────────────
  // `scaleIngredients` ne déplace que les unités de `isScalableUnit`, et
  // l'appelant DOIT utiliser ce même prédicat pour séparer la part mobile de
  // la part fixe. Ce qui n'a pas de quantité structurée — une pincée, un
  // « handful », un « to taste » — ne grossit pas, exactement comme l'énergie
  // non échelonnable deux blocs plus bas.
  //
  // `floor / proteinPerDay` fait donc porter à la seule part mobile un besoin
  // calculé sur le TOTAL, et sous-évalue le facteur d'autant que la part fixe
  // est grande. MESURÉ en run réel (2026-08-12, recomposition 78 kg sur 5 j):
  // plancher 156 g, plan à 118 g, facteur rendu ×1,32 — et la protéine n'est
  // montée qu'à 133 g. Le plancher restait ouvert de 23 g sur une mise à
  // l'échelle qui se croyait terminée, ce qui est pire que de n'avoir rien
  // fait: le plan a grossi ET manque toujours sa grandeur de rang 2.
  //
  // La bonne formule est celle que l'énergie applique déjà: retirer la part
  // fixe de la cible, puis diviser par ce qui bouge.
  const proteinFoodPerDay = args.proteinFoodProteinG / days;
  const fixedProteinPerDay = proteinPerDay - proteinFoodPerDay;
  const proteinNeed = proteinFoodPerDay > 0
    ? (floor - fixedProteinPerDay) / proteinFoodPerDay
    : floor / proteinPerDay;
  const proteinFactor = Math.min(MAX_SCALE, Math.max(MIN_SCALE, proteinNeed));

  // 2. L'ÉNERGIE ENSUITE, avec ce qui reste.
  const target = (args.envelope.energy.low + args.envelope.energy.high) / 2;
  const perDay = (args.computedKcal ?? 0) / days;
  const proteinKcalPerDay = args.proteinFoodKcal / days;
  const otherKcalPerDay = args.otherScalableKcal / days;
  const fixedKcalPerDay = perDay - proteinKcalPerDay - otherKcalPerDay;

  let otherFactor = base ?? 1;
  if (otherKcalPerDay > 0) {
    const remaining = target - fixedKcalPerDay - proteinKcalPerDay * proteinFactor;
    otherFactor = remaining / otherKcalPerDay;
  }
  otherFactor = Math.min(MAX_SCALE, Math.max(MIN_SCALE, otherFactor));

  return { protein: proteinFactor, other: otherFactor };
}

/**
 * Met à l'échelle une liste d'ingrédients. Rend des COPIES.
 *
 * Deux régimes, et ils ne se ressemblent pas:
 *
 *   * `g` / `ml` — arrondi de portion (multiple de 5 au-dessus de 20 g),
 *     plafond par ingrédient, prose réécrite en entier;
 *   * `unit` / `tbsp` / `tsp` — arrondi à l'entier (au demi pour les
 *     cuillères), et la prose n'est réécrite que sur son nombre de tête. Un
 *     dénombrable dont on ne sait pas réécrire la prose fidèlement n'est PAS
 *     touché: voir `rewriteCountableQuantity`.
 *
 * Tout le reste — une quantité sans unité, une pincée, un « handful » — sort
 * inchangé sans qu'on ait à le nommer.
 *
 * `gramsRaw` est remis à `null` plutôt que recalculé ici: c'est le résolveur
 * qui sait le faire (état cru/cuit, rendements), et le recalculer à la main
 * serait un second moteur de conversion à côté de celui qui existe.
 */
export function scaleIngredients<T extends ScalableIngredient>(
  ingredients: readonly T[],
  factor: number | ScaleFactors,
  /**
   * Cet ingrédient est-il un aliment PROTÉIQUE ?
   *
   * Injecté plutôt que déduit ici: la réponse vient du référentiel
   * (`food_group_ref` ∈ `PROTEIN_SOURCES`), et ce module reste pur et testable
   * sans base. Absent = tout est traité comme « autre », ce qui redonne
   * exactement le comportement du facteur unique.
   */
  isProteinFood?: (term: string) => boolean,
): ScaleResult<T> {
  const items: T[] = [];
  const capped: string[] = [];
  let changed = 0;

  for (const ing of ingredients) {
    const unit = String(ing.unit ?? "").toLowerCase();
    const amount = ing.amount;
    const weighed = unit === "g" || unit === "ml";
    const countable = unit === "unit" || SPOON_UNITS.has(unit);
    if ((!weighed && !countable) || amount === null || !Number.isFinite(amount)) {
      items.push({ ...ing });
      continue;
    }
    const f = typeof factor === "number"
      ? factor
      : (isProteinFood?.(ing.term) ? factor.protein : factor.other);

    // ── LES DÉNOMBRABLES PASSENT PAR LEUR PROPRE PORTE ─────────────────────
    // Ils ne bougent que si l'on sait réécrire leur prose fidèlement. Le refus
    // est la valeur par défaut: un « 2/2 avocado » dans une liste de courses
    // est pire que l'ingrédient laissé tel quel.
    if (countable) {
      const nextCount = roundCountable(amount * f, unit);
      if (nextCount === amount) {
        items.push({ ...ing });
        continue;
      }
      const prose = rewriteCountableQuantity(ing.quantity, amount, nextCount);
      if (prose === null) {
        items.push({ ...ing });
        continue;
      }
      changed++;
      items.push({
        ...ing,
        amount: nextCount,
        quantity: prose,
        gramsRaw: null,
      });
      continue;
    }

    let next = roundAmount(amount * f);
    // ── UN PLAFOND NE RÉDUIT JAMAIS ────────────────────────────────────────
    //
    // ⚠️ LE DÉFAUT MESURÉ (2026-08-12, scénario recomposition 78 kg): une
    // PRÉPARATION porte 1 kg de cuisses de poulet pour quatre portions. Le
    // facteur ×1,32 donnait 1320 g, le plafond ramenait à 500 g — soit une
    // mise à l'échelle qui, en cherchant à agrandir, RETIRAIT 500 g de poulet
    // et 117 g de protéine au plan. Le plancher protéique restait ouvert à
    // 144/156 alors que le facteur n'était même pas borné.
    //
    // Les 500 g bornent une PORTION D'ASSIETTE absurde; ils n'ont aucun sens
    // sur un lot cuisiné pour quatre, où le kilo est le cas nominal. Faute de
    // savoir ici combien de bouches un ingrédient sert, la règle sûre est
    // celle-ci: le plafond peut refuser de grandir, jamais rapetisser.
    //
    // Le compteur `capped` ne se déclenche donc que quand le plafond MORD
    // vraiment. Un lot déjà au-dessus de la borne sort inchangé plutôt que
    // tronqué, et ce n'est pas la même information.
    if (unit === "g" && next > MAX_SINGLE_INGREDIENT_G) {
      next = Math.max(amount, MAX_SINGLE_INGREDIENT_G);
      if (next !== amount) capped.push(ing.term);
    }
    if (next === amount) {
      items.push({ ...ing });
      continue;
    }
    changed++;
    items.push({
      ...ing,
      amount: next,
      // LA PROSE SUIT LE CHIFFRE. Une liste de courses qui ne correspond plus
      // à l'assiette est le défaut le plus dur à voir en production.
      quantity: `${next} ${unit}`,
      // Le résolveur le recalculera: lui seul connaît les rendements cru/cuit.
      gramsRaw: null,
    });
  }

  return { items, changed, capped };
}

// ---------------------------------------------------------------------------
// LA LISTE DE COURSES — elle suit l'assiette, ou elle la rend infaisable
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ SANS ELLE, L'ANCRAGE REND LE PLAN INEXÉCUTABLE. C'est la moitié qu'on
 *    oublie, et c'est celle qui se voit devant le frigo.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `scaleIngredients` change ce qu'on CUISINE. `shopping_list` dit ce qu'on
 * ACHÈTE, et il est écrit par le modèle en prose libre — `ShoppingItem` ne
 * porte ni `amount` ni `unit`, et rien dans le dépôt ne dérive la liste des
 * ingrédients. Un plan ancré à ×1,4 demanderait donc 630 g de poulet à la
 * casserole avec 450 g sur la liste.
 *
 * ⚠️ LA LANE FOYER N'A JAMAIS EU CE PROBLÈME, et il ne faut pas en conclure
 * qu'il n'existe pas: `sizeBoxesFromTarget` redimensionne les CONTENANTS —
 * comment la casserole se partage — et ne touche jamais ce qu'on achète.
 *
 * ── LA RÈGLE: LE NOMBRE DE TÊTE, ET RIEN D'AUTRE ─────────────────────────
 * On réécrit le premier nombre de la prose, comme `rewriteCountableQuantity`
 * le fait déjà pour un ingrédient dénombrable — donc « 300 g carrots » garde
 * ses carottes, et « 1 tin of chickpeas » garde sa boîte. Écrire
 * `${next} ${unit}` comme le fait la branche pesée des ingrédients perdrait le
 * nom de l'aliment, et une liste de courses sans nom n'est pas une liste.
 *
 * ── CE QUI NE BOUGE PAS, ET POURQUOI CE N'EST PAS UN OUBLI ───────────────
 * La garde du singulier/pluriel de `rewriteCountableQuantity` fait tout le
 * travail sans qu'aucun lexique n'ait à exister ici — et c'est ce qui évite un
 * matcher maison, la cicatrice la plus chère de ce dépôt. Mesuré sur les 273
 * lignes des dix générations du 2026-08-23: les contenants du commerce
 * (« 1 pack », « 1 small jar », « 1 small loaf ») commencent TOUS par 1, donc
 * les faire grandir traverserait la frontière du 1 et le module refuse déjà.
 * Un pot de cumin reste un pot, sans qu'on ait eu à écrire le mot « pot ».
 *
 * ⛔ ET CE QUI EST REFUSÉ SE COMPTE. `unrewritable` porte les termes qu'on n'a
 * pas su suivre: sans lui, une liste laissée entière ressemblerait à une liste
 * à jour.
 */
export interface ScalableShoppingLine {
  term: string;
  quantity: string | null;
}

export interface ShoppingScaleResult<T> {
  items: T[];
  /** Les lignes dont le nombre a réellement bougé. */
  changed: number;
  /** Les termes qu'on n'a pas su réécrire — ils gardent leur quantité. */
  unrewritable: string[];
}

/** Le premier nombre de la prose, et l'unité de masse qui le suit s'il y en a une. */
function leadingQuantityOf(
  quantity: string | null,
): { amount: number; weighed: boolean } | null {
  if (!quantity) return null;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)/.exec(quantity);
  if (!m) return null;
  const amount = Number(m[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = m[2].toLowerCase();
  // ⚠️ `kg` ET `l` NE SONT PAS TRAITÉS COMME DES MASSES ICI, et c'est le même
  // refus que `quantity_from_prose.ts`: le vocabulaire de mesure du dépôt est
  // `g` et `ml`. Une ligne en kilos retombe donc sur la porte dénombrable, qui
  // arrondit à l'entier — « 1.2 kg » ne se réécrit pas, et c'est compté.
  return { amount, weighed: unit === "g" || unit === "ml" };
}

export function scaleShoppingList<T extends ScalableShoppingLine>(
  items: readonly T[],
  factor: number | ScaleFactors,
  /** Le même prédicat que `scaleIngredients`, pour le même partage des facteurs. */
  isProteinFood?: (term: string) => boolean,
): ShoppingScaleResult<T> {
  const out: T[] = [];
  const unrewritable: string[] = [];
  let changed = 0;

  for (const line of items) {
    const lead = leadingQuantityOf(line.quantity);
    if (lead === null) {
      // Pas de nombre en tête: « to taste », « a bunch ». Rien à suivre, et ce
      // n'est pas un refus — il n'y avait pas de quantité.
      out.push({ ...line });
      continue;
    }
    const f = typeof factor === "number"
      ? factor
      : (isProteinFood?.(line.term) ? factor.protein : factor.other);
    const next = lead.weighed
      ? roundAmount(lead.amount * f)
      : roundCountable(lead.amount * f, "unit");
    if (next === lead.amount) {
      out.push({ ...line });
      continue;
    }
    const prose = rewriteCountableQuantity(line.quantity, lead.amount, next);
    if (prose === null) {
      unrewritable.push(line.term);
      out.push({ ...line });
      continue;
    }
    changed++;
    out.push({ ...line, quantity: prose });
  }

  return { items: out, changed, unrewritable };
}
