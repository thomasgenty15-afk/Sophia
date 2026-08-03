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
  /** La doctrine PUBLIÉE du coach de cet élève, si elle a pu être chargée. */
  doctrine?: Pick<CoachDoctrine, "forbidden"> | null;
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
 * l'élève, ce qui est à la fois anxiogène et inutile. Il défère, simplement.
 */
export const MEDICAL_BLOCK_FALLBACK_EN =
  "I would rather not answer that one from memory - let me check with your coach before I say anything.";

/**
 * Le rendu de repli quand l'agent allait contredire le coach.
 *
 * Il renvoie explicitement au coach: c'est la règle d'autorité §1.5 rendue
 * visible au moment exact où elle a failli être enfreinte.
 */
export const DOCTRINE_BLOCK_FALLBACK_EN =
  "That is your coach's call, not mine - I do not want to send you in a direction they would not. Ask them and I will follow it.";

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

  const constraints = input.safetyConstraints ?? [];
  const forbidden = input.doctrine?.forbidden ?? [];
  if (constraints.length === 0 && forbidden.length === 0) {
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

  if (forbidden.length > 0) {
    const doctrineViolations = findDoctrineViolations(text, { forbidden });
    if (doctrineViolations.length > 0) {
      console.error("keel.output_lock.doctrine", {
        violation_count: doctrineViolations.length,
        tokens: [...new Set(doctrineViolations.map((v) => v.token))].join(","),
        detail: "Visible text replaced before delivery.",
      });
      return {
        text: DOCTRINE_BLOCK_FALLBACK_EN,
        reason: "blocked_coach_interdit",
        tokens: [...new Set(doctrineViolations.map((v) => v.token))],
      };
    }
  }

  return { text, reason: "clean", tokens: [] };
}
