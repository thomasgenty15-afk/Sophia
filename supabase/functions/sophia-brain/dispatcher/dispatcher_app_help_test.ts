// FF-066 · L'AIDE SUR L'APP — le prompt qui la promet, la case qui la reçoit, le
// parseur qui la trie, le mapper qui la recopie, et le fait qu'elle ne route
// rien. Même découpage que `dispatcher_plan_feedback_test.ts`.

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildDispatcherPrompt,
  buildDispatcherSystemPrompt,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";
import { runDispatcher } from "./dispatcher.v2.ts";
import { dispatcherSignalsFromTurnFrame } from "../router/turn_context_runtime.ts";
import { APP_HELP_TOPIC_IDS } from "../../_shared/keel/app_help/cards.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

const KEEL_STUDENT_PROMPT = buildDispatcherSystemPrompt({ keelStudent: true });

const memoryPlan = {
  response_intent: "answer_app_question",
  reasoning_complexity: "low",
  context_need: "minimal",
  memory_mode: "none",
  model_tier_hint: "lite",
  context_budget_tier: "tiny",
  targets: [],
  retrieval_policy: "semantic_first",
  plan_confidence: 0.8,
};

function dispatcherInputWith(
  rawFrame: Record<string, unknown>,
  opts?: { riskBand?: "none" | "high"; keelStudent?: boolean },
) {
  return {
    user_message: "comment je prends mon plat en photo ?",
    recent_messages: [],
    user_id: "student-app-help",
    channel: "web" as const,
    plan_snapshot: null,
    keel_plan_context: "=== KEEL PLAN ===",
    keel_student: opts?.keelStudent ?? true,
    safety_context_output: {
      risk_band: (opts?.riskBand ?? "none") as "none" | "high",
      reason_codes: [],
      evidence: [],
    },
    llm_runner: () => Promise.resolve(rawFrame),
  };
}

function appHelpFrame(signal: unknown) {
  return {
    direct_effects: [],
    skill_signals: { app_help: signal },
    memory_plan: memoryPlan,
  };
}

// ── ① LE PROMPT ──────────────────────────────────────────────────────────────

Deno.test("① la règle 6-sexies part à l'élève, bilingue, et nomme ses frontières", () => {
  assert(KEEL_STUDENT_PROMPT.includes("6-sexies. skill_signals.app_help"));
  assert(KEEL_STUDENT_PROMPT.includes("- skill_signals.app_help (KEEL uniquement — voir regle 6-sexies)"));
  assert(KEEL_STUDENT_PROMPT.includes("Exemples FR:"));
  assert(KEEL_STUDENT_PROMPT.includes("Exemples EN:"));
  // Les trois voisins qu'elle ne doit pas avaler, nommés.
  for (const neighbour of ["plan_question", "rule_question", "plan_feedback", "profile_statement"]) {
    const rule = KEEL_STUDENT_PROMPT.slice(KEEL_STUDENT_PROMPT.indexOf("6-sexies."));
    assert(rule.includes(neighbour), `6-sexies ne nomme pas sa frontière avec ${neighbour}`);
  }
  // ⚠️ « LE SIGNAL S'AJOUTE » — sans cette phrase, le modèle peut le traiter
  // comme un owner et taire les autres signaux du même tour.
  assert(KEEL_STUDENT_PROMPT.includes("Ce signal ne remplace jamais l'owner du tour: il s'emet EN PLUS."));
});

Deno.test("① chaque identifiant de fiche est dans la liste du prompt, et rien d'autre", () => {
  const rule = KEEL_STUDENT_PROMPT.slice(KEEL_STUDENT_PROMPT.indexOf("6-sexies."));
  for (const id of APP_HELP_TOPIC_IDS) {
    assert(rule.includes(`   - ${id}:`), `identifiant absent du prompt: ${id}`);
  }
});

Deno.test("① le signal est autorisé par la phrase qui borne les signaux", () => {
  assert(
    KEEL_STUDENT_PROMPT.includes(
      "Ne produis jamais de skill signal hors plan_question, plan_feedback, profile_statement, rule_question et app_help.",
    ),
  );
});

Deno.test("① le prompt LEGACY n'apprend rien de l'aide", () => {
  assert(!DISPATCHER_V2_SYSTEM_PROMPT.includes("app_help"));
});

Deno.test("① la liste reste dans la partie FIXE du prompt: identique d'un élève à l'autre", () => {
  // R8 — la liste ne dépend que de l'audience. Deux assemblages pour deux
  // élèves quelconques sont le même texte, donc le même préfixe mis en cache.
  assertEquals(
    buildDispatcherSystemPrompt({ keelStudent: true }),
    buildDispatcherSystemPrompt({ keelStudent: true }),
  );
});

Deno.test("① la CASE existe dans `expected_shape`, pour l'élève seulement", () => {
  const payload = (keelStudent: boolean) =>
    JSON.parse(buildDispatcherPrompt({
      user_message: "ou est ma liste de courses ?",
      recent_messages: [],
      keel_plan_context: null,
      keel_student: keelStudent,
    }));
  assert(payload(true).expected_shape.skill_signals.app_help);
  assertEquals(payload(false).expected_shape.skill_signals.app_help, undefined);
});

// ── ② LE PARSEUR ─────────────────────────────────────────────────────────────

Deno.test("② le parseur garde les identifiants connus, 3 au plus", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith(appHelpFrame({
      detected: true,
      topics: ["meal_photo_how", "meal_photo_counted", "invented", "price_trial", "shopping_list"],
    })) as never,
  );
  assertEquals(frame.skill_signals.app_help?.topics, [
    "meal_photo_how",
    "meal_photo_counted",
    "price_trial",
  ]);
  assertEquals(frame.skill_signals.app_help?.dropped_topics, ["invented"]);
});

Deno.test("② détecté sans identifiant connu ⇒ unknown_feature", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith(appHelpFrame({ detected: true, topics: ["scan_barcode"] })) as never,
  );
  assertEquals(frame.skill_signals.app_help?.topics, ["unknown_feature"]);
});

Deno.test("② un signal non détecté ou malformé n'entre pas", async () => {
  for (const raw of [{ detected: false, topics: ["shopping_list"] }, "shopping_list", [], null]) {
    const frame: TurnFrame = await runDispatcher(dispatcherInputWith(appHelpFrame(raw)) as never);
    assertEquals(frame.skill_signals.app_help, undefined, JSON.stringify(raw));
  }
});

Deno.test("② même tolérance `entry` que les autres signaux", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [],
      skill_signals: { entry: { app_help: { detected: true, topics: ["shopping_list"] } } },
      memory_plan: memoryPlan,
    }) as never,
  );
  assertEquals(frame.skill_signals.app_help?.topics, ["shopping_list"]);
});

Deno.test("② un tour de CRISE n'emporte aucune fiche d'aide", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith(
      appHelpFrame({ detected: true, topics: ["account_delete"] }),
      { riskBand: "high" },
    ) as never,
  );
  assertEquals(frame.skill_signals.app_help, undefined);
});

// ── ③ LE MAPPER ──────────────────────────────────────────────────────────────

Deno.test("③ le mapper recopie le signal du frame vers le tour", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith(appHelpFrame({ detected: true, topics: ["shopping_list"] })) as never,
  );
  const signals = dispatcherSignalsFromTurnFrame({ turnFrame: frame } as never);
  assertEquals(signals.app_help.detected, true);
  assertEquals(signals.app_help.topics, ["shopping_list"]);
});

// ── ④ IL NE ROUTE RIEN ───────────────────────────────────────────────────────

Deno.test("④ le signal est PASSIF: `routers.ts` ne le lit pas", async () => {
  const routers = await Deno.readTextFile(new URL("../routers/routers.ts", import.meta.url));
  assert(
    !routers.includes("app_help"),
    "`routers.ts` LIT `app_help`: le signal est devenu une lane, et il volerait le tour.",
  );
});
