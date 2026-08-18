/**
 * KEEL W4.4 — the visible reply of `plan_question`. DETERMINISTIC, no model.
 *
 * WHY NO LLM HERE
 * The value proposition of Tier 0 is "yes, in two seconds, with zero
 * escalation". A generation call spends the two seconds and reintroduces the
 * exact failure this lane removes: a model free-styling a permission the coach
 * never granted. Every sentence below is a function of a verdict that was
 * computed deterministically, so the answer cannot be more permissive than the
 * prescription.
 *
 * WHAT IS NEVER SAID
 * 1. A `severity='medical'` token. The deny path names no food at all — it
 *    says no and hands the turn to the coach. `findMedicalConstraintViolations`
 *    re-checks the rendered text before it leaves, so a future edit that starts
 *    naming the allergen is caught by the same validator W3.3 installed.
 * 2. A promise that anything changed. Tier 1 says the coach was asked; it never
 *    says the plan was updated, because nothing was written here.
 * 3. A number. No score, no percentage, no streak.
 */

import {
  findMedicalConstraintViolations,
  type StudentSafetyConstraint,
} from "../../../_shared/keel/safety_constraints.ts";
import {
  labelFor,
  type LocalePack,
  localePackFor,
} from "../../../_shared/keel/labels.ts";
import { localePackKey } from "../../../_shared/keel/locale.ts";
import type { PlanQuestionChangeRequest, Tier0Verdict } from "./contract.ts";

/** Human label for a food group slug; falls back to the slug (never throws). */
function foodLabel(slug: string, pack: LocalePack): string {
  try {
    return labelFor("food_groups", slug, pack).toLowerCase();
  } catch {
    return slug.replaceAll("_", " ");
  }
}

/**
 * ── LES PHRASES SONT DES DONNÉES DE LOCALE, PAS DES LITTÉRAUX ──────────────
 *
 * Ce fichier passait déjà un `LocalePack` à `foodLabel`, et écrivait ses
 * PHRASES en anglais dur. Un élève `fr-FR` recevait donc une phrase anglaise
 * avec deux étiquettes françaises encastrées dedans:
 *
 *   « volaille is outside what your coach set for the protéines maigres line,
 *     so I am not going to green-light it myself. »
 *
 * MESURÉ LE 2026-08-13, run `doctrine5`: 16 tours sur 42, tous chez des élèves
 * `profiles.locale = 'fr-FR'` dont le coach a `voice.language = 'fr-FR'` — et
 * la ligne `contract_change_requests` écrite au même instant portait bien
 * `content_locale = 'fr-FR'`. La locale n'était pas inconnue de ce module: elle
 * était connue, passée, et utilisée pour un seul mot sur trente.
 *
 * Le tableau vit ICI plutôt que dans `labels.*.ts` parce que ces fichiers sont
 * des tables JETON → LIBELLÉ, et qu'y verser des phrases entières mélangerait
 * deux natures. La RÉSOLUTION, elle, reste unique: `localePackKey`, la même
 * fonction que `localePackFor` — donc les phrases et les étiquettes d'un même
 * tour ne peuvent pas tomber dans deux langues différentes, et une langue non
 * livrée jette au lieu de servir l'anglais en silence.
 */
type PlanQuestionCopy = {
  identical: (food: string) => string;
  allowlist: (swap: string) => string;
  classEquivalent: (swap: string) => string;
  swapJoiner: (requested: string, prescribed: string) => string;
  escalationNamed: (requested: string, prescribed: string) => string;
  escalationUnnamed: string;
  escalationTail: string;
  deny: string;
  allowedScrubbed: string;
};

const COPY: Record<"en" | "fr", PlanQuestionCopy> = {
  en: {
    identical: (food) =>
      `Yes — ${food} is exactly what the line asks for. Log it as usual.`,
    allowlist: (swap) =>
      `Yes — ${swap} works here. Your coach listed it as an accepted ` +
      "substitute on this line, so nothing needs changing.",
    classEquivalent: (swap) =>
      `Yes — ${swap} works here. Both sit in the same food group your ` +
      "coach allowed you to swap within, so it counts the same. Nothing to " +
      "change, log it as usual.",
    swapJoiner: (requested, prescribed) => `${requested} instead of ${prescribed}`,
    escalationNamed: (requested, prescribed) =>
      `${requested} is outside what your coach set for the ${prescribed} line, ` +
      "so I am not going to green-light it myself.",
    escalationUnnamed:
      "That one sits outside what your coach set on this line, so I am not " +
      "going to green-light it myself.",
    escalationTail: " Your question is with them now, word for word. " +
      "Nothing in your plan has changed, so keep following the line as " +
      "written; if they open it up, you will see it in your plan.",
    deny:
      "No — I cannot clear that one for you, and I have not changed anything. " +
      "It is flagged to your coach right now so they can look at it straight " +
      "away. If you have any physical reaction, treat it as urgent and get " +
      "medical help rather than waiting for a reply here.",
    allowedScrubbed:
      "That works with the line as your coach wrote it — log it as usual.",
  },
  fr: {
    identical: (food) =>
      `Oui — ${food}, c'est exactement ce que la ligne demande. Note-le comme d'habitude.`,
    allowlist: (swap) =>
      `Oui — ${swap}, ça marche ici. Ton coach l'a listé comme remplacement ` +
      "accepté sur cette ligne, il n'y a rien à changer.",
    classEquivalent: (swap) =>
      `Oui — ${swap}, ça marche ici. Les deux sont dans le même groupe ` +
      "d'aliments à l'intérieur duquel ton coach t'autorise à permuter, donc " +
      "ça compte pareil. Rien à changer, note-le comme d'habitude.",
    swapJoiner: (requested, prescribed) => `${requested} à la place de ${prescribed}`,
    escalationNamed: (requested, prescribed) =>
      `${requested}, c'est en dehors de ce que ton coach a posé sur la ligne ` +
      `${prescribed} : je ne vais pas te le valider de moi-même.`,
    escalationUnnamed:
      "Ça sort de ce que ton coach a posé sur cette ligne : je ne vais pas te " +
      "le valider de moi-même.",
    escalationTail: " Ta question part chez lui, mot pour mot. Rien n'a bougé " +
      "dans ton plan, donc continue à suivre la ligne telle qu'elle est " +
      "écrite ; s'il l'ouvre, tu le verras dans ton plan.",
    deny:
      "Non — je ne peux pas te valider ça, et je n'ai rien changé. C'est " +
      "signalé à ton coach tout de suite pour qu'il regarde sans attendre. Si " +
      "tu as la moindre réaction physique, traite ça comme urgent et va " +
      "chercher un avis médical plutôt que d'attendre une réponse ici.",
    allowedScrubbed:
      "Ça tient avec la ligne telle que ton coach l'a écrite — note-le comme d'habitude.",
  },
};

function copyFor(locale: string): PlanQuestionCopy {
  return COPY[localePackKey(locale)];
}

export type PlanQuestionRender = {
  reply: string;
  /** Named so the diagnosis can be read without re-deriving it from prose. */
  render_reason_code: string;
  /** True when the medical-token validator had to blank a candidate line. */
  medical_validator_tripped: boolean;
};

function tier0AllowedText(
  verdict: Extract<Tier0Verdict, { decision: "allowed" }>,
  pack: LocalePack,
  copy: PlanQuestionCopy,
) {
  if (verdict.reason_code === "identical_group") {
    return copy.identical(foodLabel(verdict.requested_food_group, pack));
  }
  const swap = copy.swapJoiner(
    foodLabel(verdict.requested_food_group, pack),
    foodLabel(verdict.prescribed_food_group, pack),
  );
  if (verdict.reason_code === "explicit_allowlist") {
    return copy.allowlist(swap);
  }
  return copy.classEquivalent(swap);
}

function escalationText(
  verdict: Extract<Tier0Verdict, { decision: "escalate" }>,
  pack: LocalePack,
  copy: PlanQuestionCopy,
): string {
  const opener = verdict.requested_food_group && verdict.prescribed_food_group
    ? copy.escalationNamed(
      foodLabel(verdict.requested_food_group, pack),
      foodLabel(verdict.prescribed_food_group, pack),
    )
    : copy.escalationUnnamed;
  // ── « THEY WILL COME BACK ON IT » ÉTAIT FAUX, ET C'ÉTAIT LA RÈGLE LA PLUS
  //    VIOLÉE DU PRODUIT ──────────────────────────────────────────────────────
  //
  // La première moitié de cette phrase est vraie: la question part bien en
  // `contract_change_requests`, une file que le coach voit. La seconde ne
  // l'était pas. Il n'existe AUCUN canal 1:1 coach → élève
  // (`docs/keel/MODEL.md`): le coach écrit une doctrine et un programme pour
  // toute sa cohorte, jamais un message à quelqu'un. Personne ne « revient »
  // vers cet élève — il attendait une réponse que rien ne pouvait lui livrer.
  //
  // Ce que le coach PEUT faire est réel mais d'une autre nature: rouvrir la
  // ligne, élargir la `swap_policy`. Ça se manifeste dans le PLAN, pas dans une
  // bulle de conversation. La phrase le dit maintenant, et rend la main à
  // l'élève au lieu de le faire patienter — c'est la règle produit qui interdit
  // toute copie mettant l'élève en attente.
  return `${opener}${copy.escalationTail}`;
}

/**
 * Render the turn. `constraints` is passed so the post-generation validator
 * runs on this text exactly as it runs on generated text elsewhere — a
 * deterministic renderer is not an exemption from the medical gate, it is just
 * a renderer that should never trip it.
 */
export function renderPlanQuestion(input: {
  verdict: Tier0Verdict;
  change_request: PlanQuestionChangeRequest | null;
  safety_constraints: readonly StudentSafetyConstraint[];
  /**
   * R3 — REQUIS. Ce renderer nomme des groupes alimentaires; sans locale il
   * les nommait toujours en anglais, et le paramètre de `labelFor` qui existait
   * pour l'éviter n'était passé par personne.
   */
  locale: string;
}): PlanQuestionRender {
  const pack = localePackFor(input.locale);
  const copy = copyFor(input.locale);
  let reply: string;
  let reason: string;
  switch (input.verdict.decision) {
    case "allowed":
      reply = tier0AllowedText(input.verdict, pack, copy);
      reason = `tier0_allowed_${input.verdict.reason_code}`;
      break;
    case "denied":
      reply = copy.deny;
      reason = "hard_deny_allergen_violation";
      break;
    default:
      reply = escalationText(input.verdict, pack, copy);
      reason = `escalated_${input.verdict.reason_code}`;
      break;
  }

  // The gate. A deterministic renderer that names a medical token is a bug in
  // this file, not in the model — so it is caught here and degraded to the
  // token-free sentence rather than shipped.
  const violations = findMedicalConstraintViolations(
    reply,
    input.safety_constraints,
  );
  if (violations.length === 0) {
    return { reply, render_reason_code: reason, medical_validator_tripped: false };
  }
  console.error("plan_question.medical_token_in_deterministic_render", {
    render_reason_code: reason,
    tokens: [...new Set(violations.map((violation) => violation.token))].join(","),
  });
  return {
    reply: input.verdict.decision === "allowed"
      ? copy.allowedScrubbed
      : copy.deny,
    render_reason_code: `${reason}_medical_token_scrubbed`,
    medical_validator_tripped: true,
  };
}
