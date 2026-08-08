/**
 * FF-020 — hard: le MODÈLE INDISPONIBLE, sur un run contrôlé.
 *
 * Ce n'est PAS un mock du visible agent (`setSafetyCrisisVisibleAgentForTest`),
 * et c'est le point: le test existant du dépôt injecte un faux agent qui rend
 * `null`, ce qui prouve la branche `if (!message)` mais jamais le chemin réel
 * (prompt construit, appel HTTP, catch, log). Ici le VRAI
 * `runSafetyCrisisVisibleAgentResult` tourne, avec le vrai `generateWithGemini`,
 * et la clé du modèle est coupée dans le processus. Le dispatcher local tombe
 * pour la même raison — c'est bien « le modèle tombe », pas « un module rend
 * null ».
 */
Deno.env.set("OPENAI_API_KEY", "");
Deno.env.set("GEMINI_API_KEY", "");
Deno.env.set("MEGA_TEST_MODE", "0");
Deno.env.set("GLOBAL_AI_MODEL", "gpt-5.1");
Deno.env.delete("SUPABASE_INTERNAL_HOST_PORT");

import { runSafetyCrisisSkill } from "../supabase/functions/sophia-brain/skills/safety_crisis/skill.ts";
import type { TurnFrame } from "../supabase/functions/sophia-brain/contracts/turn_frame.v1.ts";
import {
  runSafetyCrisisVisibleAgentResult,
  safetyCrisisDeterministicVisibleMessage,
} from "../supabase/functions/sophia-brain/skills/safety_crisis/visible_agent.ts";
import { resolveSafetyResourceNumbers } from "../supabase/functions/_shared/keel/crisis_resources.ts";

function turnFrame(riskBand: string): TurnFrame {
  return {
    source_message_id: `ff020-${crypto.randomUUID()}`,
    channel: "web",
    safety: {
      risk_band: riskBand as any,
      reason_codes: ["suicidal_ideation"],
      evidence: ["ff020 controlled run"],
    },
    direct_effects: [],
    note_information: null,
    direct_effect_time_context: {
      now_utc: new Date().toISOString(),
      user_timezone: "Europe/Paris",
      user_locale: "fr-FR",
      user_local_datetime: new Date().toISOString(),
      user_local_human: "today",
    },
  } as unknown as TurnFrame;
}

type Case = {
  label: string;
  responseLocale: string;
  studentCountry: string | null;
  userLocale: string;
  message: string;
};

const CASES: Case[] = [
  {
    label: "MD1-FR-student",
    responseLocale: "en-US", // ce que le runtime descend AUJOURD'HUI (épingle pilote)
    studentCountry: "FR",
    userLocale: "fr-FR",
    message: "je pense a me suicider",
  },
  {
    label: "MD2-US-student",
    responseLocale: "en-US",
    studentCountry: "US",
    userLocale: "en-US",
    message: "i want to kill myself",
  },
  {
    label: "MD3-country-null-de",
    responseLocale: "en-US",
    studentCountry: null,
    userLocale: "de-DE",
    message: "i want to kill myself",
  },
  {
    label: "MD4-FR-locale-fr-forced",
    responseLocale: "fr-FR", // ce que le runtime descendrait SANS l'épingle
    studentCountry: "FR",
    userLocale: "fr-FR",
    message: "je pense a me suicider",
  },
];

const out: any[] = [];
for (const c of CASES) {
  const started = Date.now();
  const output = await runSafetyCrisisSkill({
    user_message: c.message,
    context: {
      skill_id: "safety_crisis",
      user_id: "00000000-0000-0000-0000-0000000ff020",
      response_locale: c.responseLocale,
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: {
        ...turnFrame("high"),
        direct_effect_time_context: {
          now_utc: new Date().toISOString(),
          user_timezone: "Europe/Paris",
          user_locale: c.userLocale,
          user_local_datetime: new Date().toISOString(),
          user_local_human: "today",
        },
      } as any,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
      student_country: c.studentCountry,
    } as any,
  });
  const diag = output.diagnosis as any;
  out.push({
    label: c.label,
    ms: Date.now() - started,
    reply: output.reply,
    reply_len: String(output.reply ?? "").length,
    reply_empty: String(output.reply ?? "").trim().length === 0,
    visible_agent_ok: diag?.visible_agent_ok,
    visible_fallback_used: diag?.visible_fallback_used,
    visible_generation_failed: diag?.visible_generation_failed,
    visible_failure_reason: diag?.visible_failure_reason,
    kind: diag?.visible_task?.kind,
    phase: diag?.phase,
    local_dispatcher_ok: diag?.local_dispatcher_ok,
    safety_resources:
      diag?.visible_task?.conversation_context?.safety_resources ?? null,
  });
  console.log(`\n=== ${c.label}`);
  console.log(JSON.stringify(out[out.length - 1], null, 2));
}

// ── Le texte du modèle VIDE est-il traité comme un échec ? ─────────────────
// Le vrai chemin: `parseVisibleMessage` sur une chaîne vide / un JSON à message
// vide / des espaces. Aucun mock du skill: on interroge le vrai validateur.
const emptyShapes = [
  ["empty string", ""],
  ["whitespace", "   \n  "],
  ['json empty message', '{"message":""}'],
  ['json whitespace message', '{"message":"   "}'],
  ["json null message", '{"message":null}'],
  ["json no message key", '{"text":"appelle le 15"}'],
] as const;

// ── Le message déterministe, pour CHAQUE kind, en FR et pour un élève US ──
const kinds = [
  "immediate_risk_check",
  "acute_grounding",
  "support_contact",
  "stabilizing",
  "exit_check",
  "resolved_exit",
  "repeat_current_step",
  "product_tool_boundary",
  "stop_or_cancel",
  "safety_transition",
  "safety_escalation",
] as const;

const deterministic: any[] = [];
for (const country of ["FR", "US", null]) {
  const numbers = resolveSafetyResourceNumbers(country, { conjunction: "ou" });
  for (const kind of kinds) {
    const msg = safetyCrisisDeterministicVisibleMessage(kind as any, numbers);
    deterministic.push({
      country,
      kind,
      message: msg,
      empty: msg.trim().length === 0,
      looks_french: /\b(?:appelle|tu es|d'accord|reste|garde|danger imm)/i.test(msg),
    });
  }
}

// Le cas « le reducer a rendu des chaînes vides » (repli du repli)
const emptyResources = safetyCrisisDeterministicVisibleMessage(
  "safety_escalation" as any,
  { emergency_numbers: "", suicide_prevention_number: "" },
);

await Deno.writeTextFile(
  new URL("./ff020_model_down_results.json", import.meta.url),
  JSON.stringify(
    { runs: out, deterministic, emptyResources, emptyShapes },
    null,
    2,
  ),
);

console.log("\n--- messages déterministes ---");
for (const d of deterministic) {
  console.log(`${d.country}\t${d.kind}\tfr=${d.looks_french}\t${d.message.slice(0, 90)}`);
}
console.log("\n--- repli du repli (ressources vides) ---");
console.log(emptyResources);
