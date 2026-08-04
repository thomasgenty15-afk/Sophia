/// <reference path="../../../tsserver-shims.d.ts" />

/**
 * PIVOT NUTRITION — CEINTURE DE SORTIE: les deux verrous déterministes, sur le
 * chemin de rendu de TOUS les messages visibles.
 *
 * ── LE DÉFAUT MESURÉ, ET IL EST STRUCTUREL ────────────────────────────────
 * `docs/keel/CONTRACT.md` énonce une garantie GLOBALE:
 *
 *   "A deterministic post-generation validator rejects any output containing a
 *    `severity='medical'` token."
 *
 * Vérifié dans le code le 2026-08-03: `findMedicalConstraintViolations` n'a
 * qu'UN SEUL appelant en production — `skills/plan_question/renderer.ts:115`.
 * La réponse normale, l'accusé de photo de repas, les messages proactifs et
 * tous les autres skills ne passent par AUCUN validateur. La garantie est
 * écrite comme globale et implémentée sur un chemin étroit.
 *
 * C'est le pattern adversarial §7.3-(3) dans sa forme la plus coûteuse: le
 * consommateur (le contrat, la revue de sécurité, la promesse commerciale)
 * lit une garantie que le producteur n'écrit que sur 1 chemin sur N. Personne
 * ne ment; la garantie est simplement fausse.
 *
 * Ce module la rend vraie, en la posant là où TOUT texte visible passe déjà:
 * `finalVisibleText` (router/run.ts).
 *
 * ── DEUX VERROUS, DEUX RÉACTIONS DIFFÉRENTES ──────────────────────────────
 * Ils ne protègent pas la même chose, donc ils ne réagissent pas pareil.
 *
 *   MÉDICAL (allergène `severity='medical'` suggéré à l'élève)
 *     → le message entier est REMPLACÉ. Pas de découpe de phrase: un texte
 *       amputé de sa suggestion dangereuse reste un texte qui parlait de
 *       cacahuètes à un élève anaphylactique, et le contexte résiduel
 *       ("...c'est une bonne source de protéines") peut porter la suggestion
 *       à lui seul. Le seul rendu sûr est un rendu qui ne prétend rien.
 *
 *   INTERDIT COACH (l'agent recommande ce que le coach proscrit)
 *     → le message entier est également remplacé, mais par un texte DIFFÉRENT
 *       qui renvoie au coach. Raison produit: une contradiction publique avec
 *       le coach détruit la seule chose qu'on lui vend. Mieux vaut un message
 *       qui défère que trois phrases qui le désavouent.
 *
 * ── POURQUOI REMPLACER ET NE PAS RÉGÉNÉRER ICI ────────────────────────────
 * `finalVisibleText` est synchrone et sans I/O — c'est ce qui rend toutes les
 * ceintures de rendu testables. La régénération (avec
 * `doctrineRetryInstruction`, qui NOMME la règle violée) appartient au
 * composeur, en amont. Cette ceinture est le filet: elle garantit qu'un défaut
 * de régénération ne devient jamais un message envoyé.
 *
 * ── DOCTRINE P9 — CONDITIONS DE DÉSARMEMENT (obligatoires, testées) ────────
 *   1. `disarmed_not_keel_student` — hors élève KEEL, il n'y a ni contrainte
 *      chargée ni coach: les deux verrous n'ont rien à comparer.
 *   2. `disarmed_no_constraints` — aucune contrainte médicale ET aucune
 *      doctrine: la ceinture ne peut pas mordre, par construction.
 *   3. `disarmed_negated_mention` — « évite les cacahuètes », « Marc ne fait
 *      pas de 6 petits repas »: le mécanisme de négation partagé
 *      (`forbidden_matcher.ts`) laisse passer. Sans ça, le plan d'un élève
 *      cœliaque, littéralement fait d'items « sans gluten », serait rejeté à
 *      chaque tour — et une ceinture qui rejette tous les tours légitimes est
 *      une ceinture qu'on débranche dans la semaine.
 *   4. `disarmed_empty_text` — rien à valider.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import {
  findMedicalConstraintViolations,
  type StudentSafetyConstraint,
} from "../../../_shared/keel/safety_constraints.ts";
import {
  type CoachDoctrine,
  findDoctrineViolations,
} from "../../../_shared/keel/doctrine.ts";

export const OUTPUT_LOCK_REASONS = [
  "clean",
  "disarmed_not_keel_student",
  "disarmed_no_constraints",
  "disarmed_empty_text",
  "blocked_medical_constraint",
  "blocked_coach_interdit",
] as const;
export type OutputLockReason = (typeof OUTPUT_LOCK_REASONS)[number];

export interface OutputLockInput {
  text: string;
  isKeelStudent: boolean;
  /** Chargées à chaque tour, hors chemin mémoire. */
  safetyConstraints?: readonly StudentSafetyConstraint[] | null;
  /**
   * La doctrine PUBLIÉE du coach de cet élève, si elle a pu être chargée.
   *
   * `foods` fait partie du Pick parce que les aliments DÉCONSEILLÉS sont
   * vérifiés par le même verrou que les interdits: suggérer à un élève un
   * aliment que son coach ne met pas dans une assiette est la même
   * contradiction publique, avec les mêmes conséquences commerciales.
   */
  doctrine?: Pick<CoachDoctrine, "forbidden" | "foods"> | null;
  /**
   * Les identifiants que CE TOUR retire (`declare_safety_constraint` avec
   * `intent: 'retract'`). Voir la condition de désarmement n°5 dans le corps:
   * sans elle, un élève ne peut JAMAIS corriger une contrainte, parce que la
   * réponse qui accuse la rétractation renomme forcément l'allergène et
   * redéclenche le remplacement — à chaque tentative.
   */
  retractedConstraintRefs?: readonly string[] | null;
}

export interface OutputLockResult {
  /** Le texte à envoyer. Identique à l'entrée quand rien n'a mordu. */
  text: string;
  reason: OutputLockReason;
  /** Les tokens qui ont mordu — pour le log d'incident, jamais pour l'élève. */
  tokens: string[];
}

/**
 * Le rendu de repli quand un allergène médical est nommé comme suggestion.
 *
 * Il ne s'excuse pas et n'explique pas ce qui a été retiré: dire « je ne peux
 * pas te parler de cacahuètes » NOMME l'allergène et rend l'incident visible à
 * l'élève, ce qui est à la fois anxiogène et inutile.
 *
 * ── POURQUOI IL NE RENVOIE PLUS AU COACH ────────────────────────────────
 * Il disait « let me check with your coach ». Deux défauts, et le second est
 * un défaut de sécurité:
 *   1. Le produit est une MASTERCLASSE. Il n'existe aucun canal un-à-un vers le
 *      coach: la phrase désignait une porte qui n'existe pas.
 *   2. Un coach n'est pas la bonne adresse pour une question médicale. Router
 *      une allergie ou une classe de médicament vers un coach sportif est une
 *      mauvaise orientation, quand bien même le canal existerait.
 */
export const MEDICAL_BLOCK_FALLBACK_EN =
  "I would rather not answer that one from memory - it touches something medical, and that is not mine to guess at. That is one to put to a doctor.";

/**
 * Le repli de doctrine quand le coach n'a pas dit ce qu'il fait À LA PLACE.
 *
 * ── POURQUOI IL NE DIT PLUS « DEMANDE À TON COACH » ─────────────────────
 * Parce que c'est exactement l'inverse de ce que le coach achète. Il nous paie
 * pour être présent en son absence — répondre À SA PLACE, dans sa méthode. Une
 * déférence systématique lui renvoie ses élèves dans un canal qui n'existe pas
 * et ne règle rien.
 *
 * Ce texte-ci est donc le DERNIER recours: il pose le cadre sans inventer de
 * porte de sortie. Le vrai repli est `instead`, écrit par le coach.
 */
export const DOCTRINE_BLOCK_FALLBACK_EN =
  "That one sits outside how your coach works, so I would rather not point you down that road.";

/**
 * Choisit le texte de remplacement quand un interdit a mordu.
 *
 * ── LE PIÈGE QUE CETTE FONCTION FERME ───────────────────────────────────
 * Le texte de substitution est écrit par le COACH et il n'a jamais été soumis
 * aux verrous — il est injecté APRÈS eux. Un `instead` du type « trois vrais
 * repas, avec du beurre de cacahuète au petit-déjeuner » servi à un élève
 * allergique à l'arachide contournerait le verrou médical par la sortie de
 * secours du verrou de doctrine.
 *
 * Le remplacement est donc RE-VÉRIFIÉ contre les contraintes dures de cet
 * élève. S'il mord, on retombe sur le texte générique — jamais sur le texte du
 * coach.
 *
 * Exportée pour être testée seule: c'est un chemin qu'un test d'ensemble ne
 * visite qu'avec le bon élève, la bonne doctrine et la bonne allergie à la fois.
 */
export function resolveDoctrineReplacement(
  violationTokens: readonly string[],
  forbidden: readonly CoachDoctrine["forbidden"][number][],
  constraints: readonly StudentSafetyConstraint[],
): { text: string; usedCoachWords: boolean } {
  for (const token of violationTokens) {
    const entry = forbidden.find((f) => f.token === token);
    const instead = String(entry?.instead ?? "").trim();
    if (!instead) continue;
    if (findMedicalConstraintViolations(instead, constraints).length > 0) {
      console.error("keel.output_lock.instead_unsafe", {
        token,
        detail: "Coach's replacement names a hard constraint; fell back to generic.",
      });
      continue;
    }
    return { text: instead, usedCoachWords: true };
  }
  return { text: DOCTRINE_BLOCK_FALLBACK_EN, usedCoachWords: false };
}

/**
 * Applique les deux verrous. L'ordre est le contrat: le MÉDICAL d'abord, parce
 * qu'un texte qui viole les deux doit produire le repli médical (le plus
 * protecteur), jamais celui de la doctrine.
 */
export function applyKeelOutputLocks(input: OutputLockInput): OutputLockResult {
  const text = String(input.text ?? "");

  if (!text.trim()) {
    return { text, reason: "disarmed_empty_text", tokens: [] };
  }
  if (!input.isKeelStudent) {
    return { text, reason: "disarmed_not_keel_student", tokens: [] };
  }

  // CONDITION DE DÉSARMEMENT n°5 (doctrine P9) — LE TOUR DE RÉTRACTATION.
  //
  // Mesurée en QA: l'élève écrit « Actually I'm NOT allergic to peanuts, that
  // was my sister — please remove that », l'agent répond, sa réponse nomme
  // l'allergène (elle ne peut pas faire autrement: accuser une rétractation
  // sans nommer ce qu'on retire est inintelligible), la ceinture voit un token
  // médical et REMPLACE tout le message par « pose la question à un médecin ».
  //
  // C'est un CUL-DE-SAC, et il se referme sur lui-même: chaque nouvelle
  // tentative de correction renomme l'allergène et redéclenche le remplacement.
  // L'élève ne peut jamais corriger, et ne comprend jamais pourquoi. Même
  // famille que `safety-crisis-flow-no-exit-on-denial`: un dispositif qu'on ne
  // peut pas quitter est un piège, pas une protection.
  //
  // PORTÉE VOLONTAIREMENT ÉTROITE: on ne désarme que les contraintes que CE
  // TOUR retire, nommément. Les autres contraintes de l'élève restent gardées
  // dans le même message — retirer une allergie à l'arachide n'ouvre pas la
  // porte au sésame. Et le désarmement vient d'un EFFET DU TOUR, pas d'une
  // heuristique sur le texte: c'est la demande de l'élève, pas une phrase que
  // le modèle aurait pu produire tout seul.
  const retracted = new Set(
    (input.retractedConstraintRefs ?? [])
      .map((r) => String(r ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  const constraints = (input.safetyConstraints ?? []).filter((c) => {
    if (retracted.size === 0) return true;
    const refs = [c.allergenRef, c.substanceRef, c.medicationClass]
      .filter((r): r is string => Boolean(r))
      .map((r) => r.trim().toLowerCase());
    return !refs.some((r) => retracted.has(r));
  });
  const forbidden = input.doctrine?.forbidden ?? [];
  // Les aliments déconseillés comptent dans la condition de désarmement. Les
  // oublier ici rendrait la ceinture muette pour un coach qui n'aurait rempli
  // QUE cette section — c'est-à-dire précisément le coach dont la méthode
  // tient dans « voilà ce que je ne mets pas dans une assiette ».
  const discouragedFoods = input.doctrine?.foods?.discouraged ?? [];
  if (
    constraints.length === 0 && forbidden.length === 0 &&
    discouragedFoods.length === 0
  ) {
    return { text, reason: "disarmed_no_constraints", tokens: [] };
  }

  const medical = findMedicalConstraintViolations(text, constraints);
  if (medical.length > 0) {
    console.error("keel.output_lock.medical", {
      violation_count: medical.length,
      tokens: [...new Set(medical.map((v) => v.token))].join(","),
      detail: "Visible text replaced before delivery.",
    });
    return {
      text: MEDICAL_BLOCK_FALLBACK_EN,
      reason: "blocked_medical_constraint",
      tokens: [...new Set(medical.map((v) => v.token))],
    };
  }

  if (forbidden.length > 0 || discouragedFoods.length > 0) {
    const doctrineViolations = findDoctrineViolations(text, {
      forbidden,
      // Reconstruit plutôt que passé tel quel: `recommended` n'a rien à faire
      // dans un verrou. Un aliment CONSEILLÉ nommé dans une réponse est le
      // comportement voulu, et le passer à un moteur de correspondance qui
      // ignore la distinction bloquerait exactement les bonnes réponses.
      foods: { recommended: [], discouraged: discouragedFoods },
    });
    if (doctrineViolations.length > 0) {
      const tokens = [...new Set(doctrineViolations.map((v) => v.token))];
      // On répond À LA PLACE du coach avec SES mots quand il les a donnés.
      const replacement = resolveDoctrineReplacement(tokens, forbidden, constraints);
      console.error("keel.output_lock.doctrine", {
        violation_count: doctrineViolations.length,
        tokens: tokens.join(","),
        used_coach_words: replacement.usedCoachWords,
        detail: "Visible text replaced before delivery.",
      });
      return {
        text: replacement.text,
        reason: "blocked_coach_interdit",
        tokens,
      };
    }
  }

  return { text, reason: "clean", tokens: [] };
}
