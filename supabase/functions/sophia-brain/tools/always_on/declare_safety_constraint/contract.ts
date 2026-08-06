/**
 * QA agent 4 — `declare_safety_constraint`: L'ÉCRIVAIN QUI MANQUAIT.
 *
 * `student_safety_constraints` avait six lecteurs armés en production et zéro
 * écrivain: le seul INSERT du dépôt vivait dans `simulated_week_test.ts`. Un
 * élève qui déclarait une anaphylaxie recevait « Noted, I'll keep it in mind »
 * et la base restait vide. Ce dossier est cet écrivain.
 *
 * Même chaîne doctrinale et même découpage que ses deux voisins
 * (`log_protocol_event`, `declare_deviation`):
 *   contract.ts — ce qui peut être demandé, committé, porté au ledger
 *   intake.ts   — payload_hint -> effet demandé, fail-loud sur token inconnu
 *   db.ts       — l'écriture physique: insert + RELECTURE
 *   router.ts   — intake -> gate -> exécution -> ledger -> rendu
 *   renderer.ts — n'accuse JAMAIS ce que le ledger ne porte pas
 *
 * ── CE QUE CET EFFET EST ──────────────────────────────────────────────────
 * Une ligne dans `student_safety_constraints`: une contrainte DURE — allergie,
 * intolérance, contre-indication médicale, éviction religieuse — que l'élève
 * déclare en conversation. Rechargée à chaque tour, hors du chemin mémoire,
 * et vérifiée en sortie par la ceinture déterministe.
 *
 * ── CE QU'IL N'EST PAS, ET C'EST LA DÉCISION CENTRALE ─────────────────────
 * Ce n'est PAS le magasin des préférences. « je déteste le brocoli », « je
 * mange à la cantine », « je m'entraîne le mardi » ne passent pas par ici.
 *
 * Vérifié le 2026-08-03 plutôt que supposé: le MEMORIZER (`memory_items`,
 * cron `trigger-memorizer-daily`, actif) tourne déjà pour les élèves KEEL et
 * fait ce travail correctement — sur les 18 messages de la QA il a extrait
 * l'aversion, le contexte cantine, le rythme d'entraînement, ET résolu la
 * rétractation (« la sœur de l'utilisateur est allergique »). Lui ajouter un
 * second magasin souple (`student_facts`) fabriquerait exactement le motif que
 * la migration du pivot interdit en tête de fichier: deux sources de vérité
 * qui peuvent diverger.
 *
 * La ligne de partage est donc celle que `safety_constraints.ts` a toujours
 * énoncée, et elle est asymétrique parce que le risque l'est:
 *
 *   SOUPLE  -> le memorizer. Probabiliste, nocturne, classé candidate puis
 *              promu. Correct pour « préfère les réponses courtes le soir ».
 *   DUR     -> ICI. Synchrone, sans cache, sans ranking, relu à chaque tour.
 *              « une allergie rappelée 80 % du temps est une allergie qui tue
 *              au 5e tour. »
 *
 * Le défaut mesuré rendait cette phrase fausse dans le pire sens: la seule
 * trace qu'une allergie laissait dans le système était un `memory_item`
 * `status='candidate'`, `sensitivity={family,health}` — précisément le magasin
 * que l'architecture lui interdit.
 */

import type {
  SafetyConstraintKind,
  SafetyConstraintSeverity,
} from "../../../../_shared/keel/safety_constraints.ts";

/**
 * Les deux intentions, et elles sont dissymétriques à dessein.
 *
 * `declare` crée; `retract` invalide une ligne existante. Il n'y a pas
 * d'`update`: corriger une contrainte médicale, c'est en retirer une et en
 * poser une autre, avec les deux datées. Un UPDATE en place effacerait la
 * question « depuis quand ? », qui est la seule que pose un clinicien.
 */
export const SAFETY_CONSTRAINT_INTENTS = ["declare", "retract"] as const;
export type SafetyConstraintIntent = (typeof SAFETY_CONSTRAINT_INTENTS)[number];

/** L'effet DEMANDÉ — issu du frame, pas encore écrit. */
export type RequestedSafetyConstraintEffect = {
  type: "declare_safety_constraint";
  intent: SafetyConstraintIntent;
  user_id: string;
  kind: SafetyConstraintKind;
  /** Au moins un des QUATRE est non-null (CHECK `..._ref_check`). */
  allergen_ref: string | null;
  substance_ref: string | null;
  medication_class: string | null;
  /** Jeton de MALADIE declaree. Distinct de `substance_ref`. */
  condition_ref: string | null;
  severity: SafetyConstraintSeverity;
  /** Prose de l'élève, citable. Jamais utilisée pour matcher (R1). */
  notes: string | null;
  content_locale: string;
  source_message_id: string;
};

/**
 * La ligne telle que RELUE. Tout ce que le ledger et le renderer citent vient
 * d'ici — jamais de la demande. C'est la différence entre « je l'ai écrit » et
 * « la base l'a ».
 */
export type SafetyConstraintRow = {
  id: string;
  user_id: string;
  kind: string;
  allergen_ref: string | null;
  substance_ref: string | null;
  medication_class: string | null;
  condition_ref: string | null;
  severity: string;
  status: string;
  declared_by: string;
  content_locale: string;
};

export type CommittedSafetyConstraintEffect = {
  type: "declare_safety_constraint";
  intent: SafetyConstraintIntent;
  constraint_id: string;
  /** L'identifiant RELU. C'est lui que le renderer a le droit de nommer. */
  constraint_ref: string;
  kind: string;
  severity: string;
  status: string;
  already_recorded: boolean;
};

export type BlockedSafetyConstraintEffect = {
  type: "declare_safety_constraint";
  reason_code:
    | "not_keel_student"
    | "missing_identifier"
    | "unknown_kind"
    | "unknown_severity"
    | "missing_content_locale"
    | "nothing_to_retract"
    | "write_failed";
};

export type SafetyConstraintWriteResult =
  | { outcome: "inserted"; row: SafetyConstraintRow }
  | { outcome: "already_recorded"; row: SafetyConstraintRow }
  | { outcome: "retracted"; row: SafetyConstraintRow }
  | { outcome: "nothing_to_retract" };

export type SafetyConstraintWrite = (
  input: RequestedSafetyConstraintEffect,
) => Promise<SafetyConstraintWriteResult>;
