/**
 * LES INDICES — une position qui converge, au lieu d'un ajustement sans état.
 * Lot M3 du chantier « mémoire ».
 *
 * Autorité produit: `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §2.6 et §3.5 M3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE ÇA FERME
 * ═══════════════════════════════════════════════════════════════════════════
 * Aujourd'hui `winningPortionAdjust` prend **le dernier** ajustement et jette
 * les autres. C'est SANS ÉTAT: la personne dit « un peu trop » (−5 %), le plan
 * suivant est composé à −5 %, elle redit « un peu trop » du plan CORRIGÉ, et on
 * lui redonne −5 % — le même −5 %. Elle n'avance pas. Trois bilans plus tard
 * elle est exactement où elle a commencé, et le cran fort n'a jamais été
 * atteint parce qu'elle n'a jamais eu de raison de le cocher.
 *
 * ⇒ Le mécanisme ne CONVERGE pas: il suit la dernière réponse.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ CE MODULE NE CONTREDIT PAS « LE CUMUL EST REFUSÉ » — IL Y RÉPOND
 * ═══════════════════════════════════════════════════════════════════════════
 * `meal_envelope.ts` porte un refus explicite, et il faut le lire avant celui-ci:
 *
 *   > « Un magasin qui ne fait que grossir plus un facteur qui se compose,
 *   >   c'est une dérive vers le bas sans borne: trois "trop gros" donneraient
 *   >   ×0,729 au lieu de ×0,90 […] et le plafond qu'il faudrait inventer pour
 *   >   borner la somme serait exactement la borne fabriquée que cette
 *   >   cicatrice interdit. »
 *
 * Ce refus est JUSTE, et il porte sur des FACTEURS QUI SE COMPOSENT. Un indice
 * n'en est pas un: on accumule des **CRANS** sur une échelle bornée, et le
 * facteur est calculé **une seule fois** depuis la position finale. ×0,729
 * n'est pas atteignable — pas parce qu'on l'a plafonné, mais parce que rien
 * ne se multiplie.
 *
 * ⛔ ET LA BORNE N'EST PAS FABRIQUÉE, C'EST LA CONDITION DE CETTE RÉPONSE.
 * `INDEX_MAX` × `PORTION_ADJUST_STEP.slight` = 2 × 0,05 = **0,10**, c'est-à-dire
 * EXACTEMENT `PORTION_ADJUST_STEP.clear` — le pire cas que ce module servait
 * déjà, et la largeur d'une bande entière d'`ENERGY_BANDS`. L'indice ne peut
 * donc rien atteindre que le mécanisme d'avant n'atteignait pas: il rend
 * seulement le chemin **progressif et réversible** au lieu d'un saut suivi
 * d'un oubli.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ « CE QU'IL FALLAIT » NE BOUGE PAS L'INDICE, ET C'EST CORRECT
 * ═══════════════════════════════════════════════════════════════════════════
 * La question porte sur le plan qu'elle vient d'avoir — **déjà composé avec
 * l'indice**. « Ce qu'il fallait » dit donc « la visée actuelle est bonne »,
 * pas « reviens au milieu ». Le ramener vers zéro effacerait la correction
 * qu'elle vient de valider.
 *
 * La convergence vient d'ailleurs, et elle est exacte: deux réponses opposées
 * s'annulent (−1 puis +1 = 0), et la borne empêche la fuite.
 *
 * ⛔ ── ET UNE QUESTION NON POSÉE NE BOUGE RIEN NON PLUS ────────────────────
 * `portions` est RETIRÉE sous plancher TCA (`RESTRICTED_OUT`). Chez ces
 * personnes, la réponse est ABSENTE — et l'absence donne le même `null` que
 * « ce qu'il fallait » dans `effectOf`. Confondre les deux ferait bouger un
 * indice sur la population la plus vulnérable, à partir d'une question qu'on a
 * délibérément décidé de ne pas lui poser.
 *
 * Ce module ne voit jamais cette ambiguïté: il ne lit QUE des `portion.adjust`
 * déjà écrits, et sous plancher il n'en existe aucun. La garde est en amont, à
 * l'endroit où l'ambiguïté existe, et elle y est écrite.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import {
  HOUSEHOLD_SUBJECT,
  type PortionAdjustItem,
  type PortionAdjustMember,
  subjectsForPortionAdjust,
} from "./retained_item.ts";

/**
 * LES BORNES, EN CRANS. `0` est le milieu — l'état de départ de tout le monde.
 *
 * ⛔ ELLES SONT NON NÉGOCIABLES, et c'est le design qui le dit: *« Quelqu'un qui
 * dit toujours "trop long" enverrait l'indice au plancher et les plans
 * deviendraient triviaux. Un bas, un haut. »*
 *
 * ⚠️ ET LEUR VALEUR EST DÉRIVÉE, PAS CHOISIE. Voir l'en-tête: 2 crans de
 * `slight` (0,05) font exactement un `clear` (0,10). Changer `INDEX_MAX` sans
 * changer le pas déplacerait le pire cas au-delà de ce que ce module a jamais
 * servi — et ce serait alors une borne fabriquée, celle que la cicatrice du
 * facteur composé interdit.
 */
export const INDEX_MIN = -2;
export const INDEX_MAX = 2;

/**
 * COMBIEN DE CRANS VAUT UNE RÉPONSE.
 *
 * Les deux adverbes du socle, et rien d'autre: `slight` = « un peu trop »,
 * `clear` = « vraiment trop ». La table est celle de `PortionMagnitude`, donc
 * un troisième cran ajouté au socle ne compile plus ici tant qu'il n'a pas sa
 * valeur — même garde que `PORTION_ADJUST_STEP`.
 */
export const NOTCHES_PER_ANSWER: Readonly<Record<"slight" | "clear", number>> =
  Object.freeze({ slight: 1, clear: 2 });

export interface PortionIndex {
  /** La position, dans `[INDEX_MIN, INDEX_MAX]`. `0` = au milieu. */
  readonly position: number;
  /** Combien de réponses l'ont construite. `0` ⇒ personne n'a jamais répondu. */
  readonly answers: number;
  /**
   * La position AVANT bornage. Utile au seul journal.
   *
   * ⚠️ ELLE EXISTE POUR QUE LA BORNE SE VOIE. `position === INDEX_MIN` ne dit
   * pas si la personne est arrivée pile au plancher ou si elle pousse dessus
   * depuis six bilans — et c'est la seconde qui signale un réglage déclaré
   * franchement faux, que l'indice ne peut pas corriger tout seul.
   */
  readonly raw: number;
}

const NEUTRAL: PortionIndex = { position: 0, answers: 0, raw: 0 };

function clamp(value: number): number {
  return Math.max(INDEX_MIN, Math.min(INDEX_MAX, value));
}

/**
 * LA POSITION DE CETTE BOUCHE, ACCUMULÉE DEPUIS SES RÉPONSES.
 *
 * ── POURQUOI ON N'A NI TABLE NI COLONNE ──────────────────────────────────
 * Les `portion.adjust` SONT l'historique: ils sont déjà écrits, déjà datés,
 * déjà visibles sur la carte avec leur citation, et déjà retirables un par un.
 * En dériver la position ne demande donc **aucun magasin de plus** — et un
 * magasin de plus serait un état à expirer, donc un écrivain de plus à perdre.
 *
 * ⚠️ CONSÉQUENCE DIRECTE, ET ELLE EST BONNE: retirer une ligne de la carte
 * déplace l'indice. La personne peut donc défaire une réponse, pas seulement
 * en ajouter une — ce que le mécanisme d'avant ne permettait pas (retirer le
 * dernier ajustement rendait la main à l'avant-dernier, sans qu'on sache
 * lequel).
 *
 * ── L'ORDRE N'IMPORTE PAS, ET C'EST VOULU ────────────────────────────────
 * Une somme est commutative. Deux réponses opposées s'annulent quel que soit
 * l'ordre où on les lit, ce qui rend la position indépendante de la façon dont
 * le magasin est trié — la seule propriété qui la rende reproductible.
 */
export function portionIndexFor(args: {
  mouth: PortionAdjustMember;
  items: readonly PortionAdjustItem[];
}): PortionIndex {
  const roster = [args.mouth];
  let raw = 0;
  let answers = 0;
  for (const item of args.items ?? []) {
    // ⛔ LE SOCLE DÉCIDE QUI EST CONCERNÉ, pas une comparaison d'identifiants à
    // la main: il rend l'id du sujet sur un chemin et celui du membre sur
    // l'autre, et les rapprocher ici rouvrirait une normalisation.
    if (subjectsForPortionAdjust(item, roster).included.length === 0) continue;
    const notches = NOTCHES_PER_ANSWER[item.value.magnitude];
    raw += item.value.direction === "down" ? -notches : notches;
    answers += 1;
  }
  if (answers === 0) return NEUTRAL;
  return { position: clamp(raw), answers, raw };
}

/**
 * LE FACTEUR, CALCULÉ **UNE SEULE FOIS** DEPUIS LA POSITION.
 *
 * ⛔ C'EST ICI QUE SE JOUE LA DIFFÉRENCE AVEC LE CUMUL REFUSÉ. Rien ne se
 * multiplie: la position est un entier, et le facteur en sort par une seule
 * opération. `1 + (-2 × 0,05)` = 0,90 — le pire cas que ce module servait déjà.
 *
 * @param step le pas d'UN cran. Passé en paramètre parce qu'il appartient à
 *   `meal_envelope.ts` (`PORTION_ADJUST_STEP.slight`): le recopier ici ferait
 *   un second nombre, dans un second fichier, qui divergerait — exactement ce
 *   que le contrat de phase 0 interdit pour `MIN_CONFIDENCE`.
 */
/**
 * L'ENVELOPPE BOUGE-T-ELLE ? — **le seul arbitre**, et il a trois appelants.
 *
 * ⛔ IL EXISTE PARCE QUE LE COPIER EST EXACTEMENT CE QUI A MENTI. Avant lui, la
 * condition vivait en clair dans `applyPortionAdjust`, et les deux compteurs de
 * génération appelaient `winningPortionAdjust` — l'arbitre d'AVANT le lot M3 —
 * en affirmant dans leur commentaire être « calculé par le MÊME arbitre que
 * celui qu'`envelopeFor` applique ». Ils ne l'étaient plus.
 *
 * ⚠️ ET LE DÉSACCORD EST ATTEIGNABLE, sur le scénario même du lot: quelqu'un
 * répond « un peu trop » puis « un peu trop peu ». `winningPortionAdjust` rend
 * le DERNIER (non nul ⇒ « appliqué »), la position rend 0 ⇒ l'enveloppe ne
 * bouge pas. Le compteur disait « servi » sur une bouche qu'on n'a pas servie.
 *
 * ⛔ NE RECOPIE PAS CETTE CONDITION. Un compteur qui recompte à la main ce
 * qu'un module décide finit toujours par mesurer l'état d'hier.
 */
export function portionIndexMoves(
  index: PortionIndex | null,
): index is PortionIndex {
  if (!index) return false;
  return index.answers > 0 && index.position !== 0;
}

export function portionFactorFor(index: PortionIndex, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 1;
  return 1 + index.position * step;
}

/**
 * ⛔ LA PHRASE APPARTIENT À L'ÉCRAN, PAS À CE MODULE — et c'est un test qui l'a
 * dit, pas une relecture.
 *
 * `portionIndexLabelKey` a vécu ici une demi-heure, et rendait une clé i18n du
 * front (`known.index.portions.*`). `pageSeams.int.test.ts` a rougi
 * immédiatement: trois pages « atteignaient `known.*` » à travers ce fichier,
 * parce que le scanner suit le graphe et que ce module est du **Deno** — un
 * runtime qui ne rend rien et ne devrait connaître aucun libellé.
 *
 * ⚠️ CE N'ÉTAIT PAS UN FAUX POSITIF DU SCANNER. Un module de calcul qui porte
 * les clés de l'écran fait deux choses: il oblige le front à importer du Deno
 * (impossible), ou il crée une seconde source de libellés qui divergera de la
 * première. La phrase vit donc dans `frontend/src/keel/api/retainedItems.ts`,
 * à côté du reste de ce que la carte affiche.
 *
 * Ce module rend une POSITION et un FACTEUR. Rien qui se lise.
 */

/** Le sujet d'un item, pour le journal. ⛔ Jamais un prénom. */
export function portionIndexSubjectOf(item: PortionAdjustItem): string {
  return item.subject === HOUSEHOLD_SUBJECT ? HOUSEHOLD_SUBJECT : item.subject;
}
