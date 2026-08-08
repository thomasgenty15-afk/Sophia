/**
 * KEEL W4.3 — renderer for `log_protocol_event`.
 *
 * ONE rule, and it is structural rather than stylistic: this module cannot
 * produce an acknowledgement without a committed effect. `renderLoggedReply`
 * takes the committed effect — not the request, not the intent, not a boolean
 * — and returns `null` when there is nothing committed. A caller that wants to
 * say "noted" has to hold a row id to do it.
 *
 * That is the fix for the phantom-commit family this repo keeps paying for
 * (`fanout-reminder-phantom-commit`: N reminders requested, 1 committed, N
 * acknowledged). Here the acknowledgement is a function of the ledger, so the
 * cardinality of what is said equals the cardinality of what exists.
 *
 * La copie SUIT LA LANGUE DE LA RÉPONSE. Elle était anglaise en dur, avec un
 * commentaire qui l'assumait — vrai tant que le produit n'avait qu'une langue,
 * faux le jour où l'axe existe. Les chaînes sont du contenu, pas des jetons
 * (R1 porte sur les données, pas sur la prose).
 */

import {
  labelFor,
  type LocalePack,
  localePackFor,
} from "../../../../_shared/keel/labels.ts";
import { isFrenchLocale } from "../../../../_shared/keel/locale.ts";
import type {
  LogProtocolEventCommittedEffect,
  LogProtocolEventDirectEffectResult,
} from "./contract.ts";

/**
 * The display name of what a committed row carries, or null when the row
 * carries no nameable identity (a fact bound to a plan line, or a note).
 *
 * A missing label is a bug in `labels.en.ts`, not a reason to withhold the
 * acknowledgement of a row that EXISTS: swallowing the reply here would make
 * the invariant belt downgrade a real commit to `failed`, which is the phantom
 * lie inverted. The slug is ASCII English, so it is shown as-is and the gap is
 * visible instead of silent.
 */
function itemNameOf(
  effect: LogProtocolEventCommittedEffect,
  pack: LocalePack,
): string | null {
  const token = effect.food_group_ref ?? effect.substance_ref;
  if (!token) return null;
  const vocab = effect.food_group_ref ? "food_groups" : "substances";
  try {
    return labelFor(vocab, token, pack);
  } catch {
    return token;
  }
}

/**
 * `"A"`, `"A and B"`, `"A, B and C"` — the cardinality is legible in the list.
 *
 * 🔴 L1 — LA CONJONCTION AUSSI EST DE LA COPIE. Elle était `" and "` en dur, au
 * milieu d'une liste dont les éléments, eux, étaient déjà traduits par
 * `labelFor`. Mesuré au réveil de l'épingle: « Recorded for 2026-07-27
 * (breakfast): Glycinate de magnésium. » — une phrase anglaise avec un mot
 * français dedans. Un accusé mi-anglais mi-français est plus déroutant qu'un
 * accusé entièrement dans la mauvaise langue.
 */
function nameList(
  effects: readonly LogProtocolEventCommittedEffect[],
  pack: LocalePack,
  french: boolean,
): string {
  const names = effects.map((e) => itemNameOf(e, pack)).filter((n): n is string => n !== null);
  if (names.length === 0) return "";
  if (names.length === 1) return `: ${names[0]}`;
  const conjunction = french ? " et " : " and ";
  return `: ${names.slice(0, -1).join(", ")}${conjunction}${names[names.length - 1]}`;
}

/**
 * D2 — the acknowledgement is a function of the LEDGER, and of nothing else.
 *
 * It takes the committed effects, so what it names is exactly what the database
 * holds: N rows produce N names, and a row that failed to write cannot be
 * mentioned because it is not in the list. This is the same rule the photo path
 * carries (`renderMealPhotoAck`), applied to the surface where the measured lie
 * was the opposite one — the reply asserted vegetables had been counted while
 * the single row said `poultry`.
 */
export function renderLogProtocolEventLoggedReply(
  effects: readonly LogProtocolEventCommittedEffect[] | null | undefined,
  /**
   * R3 — REQUIS. L'accusé NOMME des groupes alimentaires et des substances;
   * sans locale il les nommait toujours en anglais, et le paramètre de
   * `labelFor` prévu pour l'éviter n'était passé par personne.
   */
  locale: string,
): string | null {
  const committed = (effects ?? []).filter((e) => Boolean(e?.protocol_event_id));
  if (committed.length === 0) return null;
  const pack = localePackFor(locale);
  // `isFrenchLocale` et pas `localePackKey`: ce dernier a déjà été appelé juste
  // au-dessus (`localePackFor`), donc une langue non livrée a déjà jeté là où
  // c'est son rôle. Ici on choisit une PHRASE, et une phrase n'a pas à jeter.
  const french = isFrenchLocale(locale);

  const head = committed[0];
  // ⚠️ `slot_key` est rendu BRUT (« breakfast »), dans les deux langues: c'est
  // un jeton machine dans un texte visible. Ce n'est pas un défaut de langue et
  // ce n'est pas le lot L1 — c'est consigné dans RAPPORT-L1-LOCALE, parce que
  // le corriger change AUSSI la sortie anglaise et demande sa propre mesure.
  const slot = head.slot_key ? ` (${head.slot_key})` : "";
  const where = french
    ? `pour le ${head.local_date}${slot}`
    : `for ${head.local_date}${slot}`;
  const fresh = committed.filter((e) => !e.already_logged);
  const existing = committed.filter((e) => e.already_logged);

  // Idempotence must be legible: the student should not wonder whether the
  // retry created a second entry.
  if (fresh.length === 0) {
    return french
      ? `Déjà enregistré ${where}${nameList(existing, pack, french)} — rien d'ajouté.`
      : `Already recorded ${where}${nameList(existing, pack, french)} — nothing added.`;
  }
  const recorded = french
    ? `Enregistré ${where}${nameList(fresh, pack, french)}.`
    : `Recorded ${where}${nameList(fresh, pack, french)}.`;
  if (existing.length === 0) return recorded;
  return french
    ? `${recorded} Déjà enregistré${
      nameList(existing, pack, french)
    } — rien d'ajouté.`
    : `${recorded} Already recorded${
      nameList(existing, pack, french)
    } — nothing added.`;
}

export function renderLogProtocolEventRefusal(
  reasonCode: string,
  tokenIssue?: string | null,
): string {
  if (reasonCode === "safety_high") {
    // Nothing durable is written during a crisis turn; the safety lane owns
    // the reply. This string exists for the ledger and for tests.
    return "Not recording anything right now.";
  }
  if (reasonCode === "unknown_token") {
    // R7: the exact issue is surfaced, never swallowed.
    return `I could not record that — ${
      tokenIssue ?? "an unrecognised value"
    }. Tell me again in plain words and I will log it.`;
  }
  if (reasonCode === "unknown_commitment") {
    // The turn pointed at a plan line that is not on this student's day (or
    // that the runtime could not verify). Never acknowledge a credit that no
    // line received: ask which one, and log nothing.
    return "I could not record that against a plan line — which one do you mean?";
  }
  if (reasonCode === "missing_content_locale") {
    return "I could not record that yet — I do not know which language to store it in.";
  }
  if (reasonCode === "missing_time_context") {
    return "I could not record that yet — I am missing your local date.";
  }
  if (reasonCode === "empty_payload") {
    return "What exactly should I record?";
  }
  if (
    reasonCode === "intent_implied_weak" || reasonCode === "ambiguity_present"
  ) {
    return "Do you want me to log that?";
  }
  if (reasonCode === "target_ambiguous" || reasonCode === "missing_time") {
    return "Which one do you mean?";
  }
  if (
    reasonCode === "duplicate_source_message" || reasonCode === "duplicate_db"
  ) {
    return "I already recorded that one.";
  }
  return "I did not record that.";
}

/**
 * Belt, with its disarm condition (doctrine P9: every belt states when it does
 * NOT apply). It asserts two invariants on the FINAL result:
 *
 *  1. a `logged` status with no committed effect is a phantom commit —
 *     downgraded to `failed`, acknowledgement stripped;
 *  2. D2's belt: the ledger may not carry two committed effects pointing at ONE
 *     row. The intake already dedupes by identity, so reaching this means a
 *     write path returned the same row twice; the duplicates are dropped and the
 *     reply is RE-RENDERED from the surviving list, so the cardinality of what
 *     is said equals the cardinality of what exists. This is the exact failure
 *     of `fanout-reminder-phantom-commit` (N requested, 1 committed, N
 *     acknowledged), caught on the way out.
 *
 * Disarm condition: any status other than `logged` passes through untouched —
 * the belt only ever removes an acknowledgement, it never adds one, and it
 * never turns a failure into a success.
 */
export function enforceLogProtocolEventReplyInvariant(
  result: LogProtocolEventDirectEffectResult,
  /** R3 — la ceinture RE-REND l'accusé; elle doit le rendre dans la bonne langue. */
  locale: string,
): LogProtocolEventDirectEffectResult {
  if (result.status !== "logged") return result;

  const seen = new Set<string>();
  const committed = result.committed_effects.filter((effect) => {
    const id = effect.protocol_event_id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (committed.length === 0) {
    return {
      ...result,
      status: "failed",
      reply: null,
      executed_tools: [],
      blocked_effects: [
        ...result.blocked_effects,
        { type: "log_protocol_event", reason_code: "phantom_commit_blocked" },
      ],
      debug: { ...result.debug, reason_code: "phantom_commit_blocked" },
    };
  }

  if (committed.length === result.committed_effects.length) return result;

  const dropped = result.committed_effects.length - committed.length;
  return {
    ...result,
    reply: renderLogProtocolEventLoggedReply(committed, locale),
    committed_effects: committed,
    blocked_effects: [
      ...result.blocked_effects,
      ...Array.from({ length: dropped }, () => ({
        type: "log_protocol_event",
        reason_code: "duplicate_commit_dropped",
      })),
    ],
  };
}
