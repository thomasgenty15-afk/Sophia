/**
 * COMBIEN DE FOIS UNE PHRASE QUI RESSEMBLAIT À DE LA SÉCURITÉ A FINI AILLEURS —
 * lot M7 du chantier « mémoire ».
 *
 * Autorité produit: `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §3.5 M7.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ CE MODULE COMPTE. IL NE GARDE RIEN, ET C'EST SA PROPRIÉTÉ LA PLUS
 *    IMPORTANTE.
 * ═══════════════════════════════════════════════════════════════════════════
 * Il ne bloque pas, ne réoriente pas, n'écrit pas, ne change aucune sortie.
 * Un appelant qui s'en servirait pour DÉCIDER créerait une **seconde autorité
 * de sécurité** — plus faible que la vraie, puisqu'elle ne lit que du texte et
 * ne vérifie rien en sortie. Or ce produit en a exactement une:
 * `student_safety_constraints`, chargée à chaque tour, sans ranking, et
 * **vérifiée sur la SORTIE** par une ceinture déterministe. Une seconde
 * autorité, plus faible, est pire que pas de seconde autorité: elle ferait
 * croire à une protection qui n'existe pas.
 *
 * ⚠️ **Une préférence est une consigne de prompt sans contrôle en sortie.**
 * C'est toute la différence, et c'est pourquoi ce compteur existe: si une
 * allergie finit rangée en préférence, elle perd sa ceinture — et personne ne
 * le sait. Le rôle de ce module est de rendre ce nombre VISIBLE, pas de le
 * corriger. Corriger est un lot de produit, avec une décision derrière.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ AUCUN MATCHER MAISON — ON RÉUTILISE LE MOTEUR, PAS SA COPIE
 * ═══════════════════════════════════════════════════════════════════════════
 * `findForbiddenMatches` (`forbidden_matcher.ts`) est LE matcher de ce dépôt:
 * une implémentation, deux verrous (la ceinture de sécurité et la doctrine du
 * coach). Le catalogue et les formes de surface viennent de
 * `allergen_catalog.ts` / `allergen_surface_forms.ts`, les mêmes tables que la
 * ceinture. En écrire une troisième copie ici garantirait la divergence: la
 * liste des négations est la partie qu'on édite, et une édition qui atterrit
 * dans une copie et pas dans l'autre est invisible jusqu'au jour où un
 * allergène passe.
 *
 * Et la cicatrice chiffrée: « laitue » ≠ « lait », 12 faux positifs sur 12
 * mesurés dans ce dépôt quand quelqu'un a écrit son propre matcher.
 *
 * ⚠️ ── `allowNegatedMentions: false`, ET C'EST L'INVERSE DE LA CEINTURE ────
 * La ceinture blanchit les mentions niées, et elle a raison: le plan d'un élève
 * allergique est LITTÉRALEMENT fait d'évictions, et « avoid peanut butter » est
 * une sortie légitime qu'un verrou absolu rejetterait à chaque tour.
 *
 * Ici la question est retournée. On ne demande pas « cette sortie est-elle
 * dangereuse ? » mais « **cette phrase parle-t-elle d'une substance que le
 * moteur de sécurité connaît ?** ». Or la formulation la plus typique d'une
 * déclaration EST une négation — « je ne mange pas d'arachides », « je ne
 * supporte pas le lactose ». Compter en mode ceinture rendrait donc ce module
 * aveugle précisément aux phrases qu'il existe pour voir: un compteur qui ne
 * peut pas voir ce qu'il compte.
 *
 * Le module d'origine nomme ce mode et le prévoit: *« Pass `false` for the
 * absolute reading (audit mode) »*. On est l'audit.
 *
 * ⚠️ ── CE QUE `shaped` VEUT DIRE, ET CE QU'IL NE VEUT PAS DIRE ────────────
 * `shaped: true` dit **« cette phrase nomme une substance du catalogue »**. Il
 * ne dit PAS « cette personne est allergique ». « J'adore les cacahuètes » est
 * `shaped`, et ce n'est pas une allergie.
 *
 * C'est assumé, et c'est le bon sens de l'erreur pour un COMPTEUR: le nombre
 * qu'on veut suivre est un TAUX qui doit tendre vers zéro, et un dénominateur
 * un peu large rend le taux prudent. L'appelant qui transformerait `shaped` en
 * « allergie détectée » mentirait — et il n'en a pas le droit, puisque ce
 * module ne rend aucune décision.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import { ALLERGEN_CATALOG } from "./allergen_catalog.ts";
import {
  ALLERGEN_SURFACE_FORMS,
  surfaceFormsFor,
} from "./allergen_surface_forms.ts";
import {
  type ForbiddenTerm,
  findForbiddenMatches,
} from "./forbidden_matcher.ts";

/**
 * LE TAG, UNE SEULE FOIS. Les deux points de comptage l'importent — deux
 * littéraux jumeaux que rien ne relie sont la panne §7.4 de ce dépôt: on
 * renomme d'un côté, les tests restent verts, et le tableau de bord compte la
 * moitié des lignes sans que personne ne le voie.
 */
export const SAFETY_FALLBACK_TAG = "keel/safety_fallback";

/**
 * LES TERMES — DÉRIVÉS DE LA TABLE DES FORMES, ET PAS DU CATALOGUE.
 *
 * ⛔ ET C'EST UNE CORRECTION MESURÉE, PAS UN CHOIX DE STYLE. La première
 * version de ce module partait d'`ALLERGEN_CATALOG` (17 slugs, l'ordre du
 * formulaire). Or `ALLERGEN_SURFACE_FORMS` porte **dix clés de plus** —
 * `lactose`, `milk`, `casein`, `eggs`, `fruits_de_mer`, `crustacean`, `soya`,
 * `shrimp`, `celeriac`, `sulfite` — des ALIAS sous lesquels une contrainte est
 * réellement écrite en base: le plancher d'intake rend `allergen_ref:
 * 'lactose'` sur « je suis intolérant au lactose », et la ceinture de sortie
 * couvre correctement ce slug.
 *
 * Mesuré avant correction: « je ne supporte pas le lactose » ⇒ **non vu**.
 * C'est-à-dire que le compteur était aveugle à la formulation française la plus
 * courante d'une intolérance au lait, et **sous-comptait** — la mauvaise
 * direction pour un audit, et la seule qui se lise comme « tout va bien ».
 *
 * Le catalogue reste importé, et une garde ci-dessous vérifie qu'il est bien
 * un SOUS-ENSEMBLE des clés: le jour où un slug de formulaire n'aurait pas de
 * formes de surface, ce module doit le dire au lieu de le sauter.
 *
 * ⚠️ Construits une fois au chargement: la table est fermée et immuable, et la
 * reconstruire à chaque appel ferait payer 27 slugs × leurs formes sur un
 * chemin qui tourne à chaque tour.
 */
export const SAFETY_TERM_SLUGS: readonly string[] = Object.freeze(
  Object.keys(ALLERGEN_SURFACE_FORMS).sort(),
);

/**
 * Les slugs du formulaire qu'aucune forme de surface ne couvre.
 *
 * ⚠️ EXPORTÉ POUR ÊTRE TESTÉ, ET IL DOIT RESTER VIDE. Non vide, il dit qu'un
 * allergène proposé à l'écran n'est reconnu que sous son seul mot — et ce
 * compteur le manquerait. Un tableau vide qu'on vérifie vaut mieux qu'une
 * hypothèse écrite en commentaire.
 */
export const SAFETY_TERMS_MISSING_FROM_FORMS: readonly string[] = Object.freeze(
  ALLERGEN_CATALOG
    .map((entry) => entry.slug)
    .filter((slug) => !SAFETY_TERM_SLUGS.includes(slug)),
);

const SAFETY_TERMS: readonly ForbiddenTerm[] = SAFETY_TERM_SLUGS.map(
  (slug) => ({
    ruleId: slug,
    token: slug,
    surfaceForms: surfaceFormsFor(slug),
  }),
);

/** Ce que le module sait dire d'un texte. Rien de plus. */
export interface SafetyShape {
  /** Le texte nomme au moins une substance du catalogue. */
  readonly shaped: boolean;
  /** Lesquelles, triées, sans doublon — pour que la ligne de journal soit lisible. */
  readonly slugs: readonly string[];
  /**
   * La lecture elle-même a échoué. `shaped` est alors `false` PAR IGNORANCE,
   * pas par mesure.
   *
   * ⚠️ CE CHAMP EXISTE POUR QUE LE ZÉRO NE MENTE PAS. Sans lui, un compteur qui
   * n'arrive plus à lire rendrait `shaped: false` sur tout, c'est-à-dire « aucun
   * repli, tout va bien » — la lecture la plus rassurante et la plus fausse.
   * Cicatrice du dépôt: un `catch` muet a laissé un chargeur de profil mort
   * pendant des semaines en ayant l'air de marcher.
   */
  readonly unreadable: boolean;
}

const NOT_SHAPED: SafetyShape = {
  shaped: false,
  slugs: [],
  unreadable: false,
};

const UNREADABLE: SafetyShape = { shaped: false, slugs: [], unreadable: true };

/**
 * CE TEXTE NOMME-T-IL QUELQUE CHOSE QUE LE MOTEUR DE SÉCURITÉ CONNAÎT ?
 *
 * PURE. Aucun effet, aucune décision — voir l'en-tête.
 *
 * ⛔ ── IL NE LÈVE JAMAIS, ET C'EST SA PROMESSE CENTRALE ────────────────────
 * Ce module ne doit **rien** changer au tour qu'il observe. Or une exception
 * remontant d'ici tuerait précisément ce tour: un compteur qui casse la
 * conversation qu'il mesure est le pire des retours sur investissement, et
 * l'ironie serait complète sur un chemin qui parle d'allergies.
 *
 * ⚠️ ET L'ÉCHEC N'EST PAS AVALÉ: il ressort en `unreadable`, que les deux
 * points de comptage écrivent dans leur ligne. Un `catch` qui rend « rien vu »
 * sans le dire fabriquerait un zéro rassurant.
 */
export function safetyShapeOf(text: unknown): SafetyShape {
  try {
    const raw = String(text ?? "").trim();
    if (!raw) return NOT_SHAPED;
    const matches = findForbiddenMatches(raw, SAFETY_TERMS, {
      // ⛔ MODE AUDIT — voir l'en-tête. Ne pas « aligner sur la ceinture »: ça
      // rendrait le compteur aveugle aux déclarations niées, qui sont la forme
      // la plus courante d'une déclaration.
      allowNegatedMentions: false,
    });
    if (matches.length === 0) return NOT_SHAPED;
    const slugs = [...new Set(matches.map((m) => m.ruleId))].sort();
    return { shaped: true, slugs, unreadable: false };
  } catch {
    return UNREADABLE;
  }
}

/**
 * UNE OBSERVATION — ce qu'on écrit au journal, sans rien décider.
 *
 * ── LES TROIS NOMBRES, ET POURQUOI LES TROIS ──────────────────────────────
 *   `seen`      le DÉNOMINATEUR. Sans lui, « 0 repli » ne se distingue pas de
 *               « 0 tour observé » — c'est la panne sous laquelle le lot 4A est
 *               resté invisible des semaines, et elle se reproduit à chaque
 *               compteur qui ne compte que ses succès;
 *   `shaped`    le texte nomme une substance connue;
 *   `fell_back` `shaped` ET rien n'a demandé d'effet de sécurité sur ce tour.
 *
 * ⚠️ `fellBack` EST UNE CONJONCTION, PAS UN SYNONYME DE `shaped`. Un tour où
 * la personne déclare une allergie ET où l'outil part est le cas NOMINAL: le
 * compter comme un repli noierait le vrai signal sous le bruit du succès.
 */
export interface SafetyFallbackObservation extends SafetyShape {
  /** Un effet `declare_safety_constraint` a été demandé sur ce tour. */
  readonly safetyRequested: boolean;
  /** `shaped` et aucun effet demandé: la phrase est partie ailleurs. */
  readonly fellBack: boolean;
}

/**
 * @param safetyRequested REQUIS, jamais optionnel — cicatrice « paramètre de
 *   garde optionnel = garde désarmée ». Un défaut `false` ferait compter en
 *   repli tous les tours où l'outil part VRAIMENT, c'est-à-dire transformerait
 *   le compteur du succès en compteur de l'échec, en silence.
 */
export function observeSafetyFallback(args: {
  text: unknown;
  safetyRequested: boolean;
}): SafetyFallbackObservation {
  const shape = safetyShapeOf(args.text);
  const safetyRequested = args.safetyRequested === true;
  return {
    ...shape,
    safetyRequested,
    fellBack: shape.shaped && !safetyRequested,
  };
}
