/**
 * W4.7 — le vocabulaire d'effets durables KEEL, côté dispatcher.
 *
 * Le sanitizer était la DERNIÈRE porte fermée de la chaîne: le gate connaissait
 * `log_protocol_event` depuis W3.3, le contrat le déclarait depuis W4.3, les
 * exécuteurs write-through existaient — et un effet émis par le modèle était
 * jeté ici, sans trace. Ce fichier épingle les deux moitiés: le passage, et les
 * bornes qui l'accompagnent.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { runDispatcher } from "./dispatcher.v2.ts";
import { DISPATCHER_V2_SYSTEM_PROMPT } from "./dispatcher.prompts.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

function dispatcherInputWith(rawFrame: Record<string, unknown>) {
  return {
    user_message: "j'ai pris mon magnesium",
    recent_messages: [],
    user_id: "student-1",
    channel: "web" as const,
    plan_snapshot: null,
    keel_plan_context: "=== KEEL PLAN ===",
    safety_context_output: {
      risk_band: "none" as const,
      reason_codes: [],
      evidence: [],
    },
    llm_runner: () => Promise.resolve(rawFrame),
  };
}

const memoryPlan = {
  response_intent: "acknowledge_report",
  reasoning_complexity: "low",
  context_need: "minimal",
  memory_mode: "none",
  model_tier_hint: "lite",
  context_budget_tier: "tiny",
  targets: [],
  retrieval_policy: "semantic_first",
  plan_confidence: 0.8,
};

function logEffect(payload: Record<string, unknown>) {
  return {
    effect_type: "log_protocol_event",
    explicitness: "explicit",
    target_status: "identified",
    confidence_band: "high",
    payload_hint: payload,
  };
}

Deno.test("the sanitizer lets the two KEEL durable effects through", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [
        logEffect({ substance_ref: "magnesium_glycinate" }),
        {
          effect_type: "declare_deviation",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { local_date: "2026-07-30", kind: "travel" },
        },
      ],
      memory_plan: memoryPlan,
    }) as never,
  );
  assertEquals(
    frame.direct_effects.map((effect) => effect.effect_type),
    ["log_protocol_event", "declare_deviation"],
  );
});

Deno.test("a weak or unidentified KEEL effect is dropped, exactly like the legacy two", async () => {
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [
        {
          effect_type: "log_protocol_event",
          explicitness: "implied",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        },
        {
          effect_type: "declare_deviation",
          explicitness: "explicit",
          target_status: "ambiguous",
          confidence_band: "high",
          payload_hint: {},
        },
        {
          effect_type: "log_protocol_event",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "medium",
          payload_hint: {},
        },
      ],
      memory_plan: memoryPlan,
    }) as never,
  );
  assertEquals(frame.direct_effects, []);
});

Deno.test("log_protocol_event is capped at ONE per turn — the schema says so, not a style preference", async () => {
  // `protocol_events` porte un index unique partiel (user_id,
  // source_message_id): une 2e ligne pour le même message est impossible. Sans
  // la borne, N effets seraient « demandés » et 1 seul écrit — la cardinalité
  // exacte de `fanout-reminder-phantom-commit`, où l'accusé annonçait N.
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [
        logEffect({ substance_ref: "magnesium_glycinate" }),
        logEffect({ substance_ref: "vitamin_d3" }),
        logEffect({ food_group_ref: "berries" }),
      ],
      memory_plan: memoryPlan,
    }) as never,
  );
  assertEquals(frame.direct_effects.length, 1);
  assertEquals(
    (frame.direct_effects[0].payload_hint as Record<string, unknown>)
      .substance_ref,
    "magnesium_glycinate",
  );
});

Deno.test("declare_deviation is capped at ONE per turn (its executor reads a single effect)", async () => {
  const deviation = (localDate: string) => ({
    effect_type: "declare_deviation",
    explicitness: "explicit",
    target_status: "identified",
    confidence_band: "high",
    payload_hint: { local_date: localDate, kind: "travel" },
  });
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [deviation("2026-07-30"), deviation("2026-07-31")],
      memory_plan: memoryPlan,
    }) as never,
  );
  assertEquals(frame.direct_effects.length, 1);
});

Deno.test("a VERIFICATION turn writes no fact — and there is no correction carve-out for append-only tables", async () => {
  // Côté track, une correction explicite survit à l'invariant status_check
  // (P3-C). Ici non, et c'est délibéré: `protocol_events` et
  // `planned_deviations` sont append-only, il n'existe aucune sémantique de
  // correction à préserver — une ligne fausse ne se retire pas depuis le chat.
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [
        logEffect({ substance_ref: "magnesium_glycinate", correction: true }),
        {
          effect_type: "declare_deviation",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { local_date: "2026-07-30", correction: true },
        },
      ],
      memory_plan: {
        ...memoryPlan,
        response_intent: "answer_status_check_on_protocol_event",
      },
    }) as never,
  );
  assertEquals(frame.direct_effects, []);
});

Deno.test("the prompt carries the three hard rules, and they are interpolated from the token source", () => {
  // Un prompt qui décrit une lane sans dire ce qui est INTERDIT produit
  // exactement les rouges que ce dépôt a déjà payés côté track.
  for (
    const marker of [
      "log_protocol_event",
      "declare_deviation",
      // (1) jamais sur une intention future
      "JAMAIS SUR UNE INTENTION FUTURE",
      // (2) jamais de quantité non dite
      "JAMAIS DE QUANTITE NON DITE",
      // (3) le flex se déclare à l'avance
      "LE FLEX SE DECLARE A L'AVANCE",
      // et la cardinalité, énoncée avec son mode d'échec mesuré: UN effet, mais
      // autant d'items que le message nomme d'aliments (D2)
      "UN SEUL EFFET log_protocol_event par tour",
      "components",
    ]
  ) {
    assert(
      DISPATCHER_V2_SYSTEM_PROMPT.includes(marker),
      `the dispatcher prompt lost: ${marker}`,
    );
  }
  // Listes fermées interpolées depuis `tokens.ts` / le contrat de l'effet —
  // une copie manuelle diverge (correctif vague 0: le modèle avait inventé
  // `epa_dha` quand le vocabulaire ne vivait que dans la migration).
  for (
    const slug of [
      "magnesium_glycinate",
      "vitamin_d3",
      "before_bed",
      "restaurant",
      "mcg",
    ]
  ) {
    assert(
      DISPATCHER_V2_SYSTEM_PROMPT.includes(slug),
      `the dispatcher prompt lost the interpolated token: ${slug}`,
    );
  }
});

Deno.test("track_progress_plan_item is explicitly excluded for a KEEL student", () => {
  // Les deux projections ne coexistent jamais: `buildDispatcherPrompt` vide
  // `active_action_candidates_for_direct_effects` sur la branche KEEL, donc un
  // track émis là n'aurait aucun id à copier. La règle le dit au modèle plutôt
  // que de le laisser produire un effet qui mourra plus bas.
  assert(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "ne l'emets jamais pour un eleve KEEL",
    ),
    "the prompt no longer excludes track_progress_plan_item for KEEL students",
  );
});

// ---------------------------------------------------------------------------
// Le liage explicite (MEGA_REVIEW G2)
//
// Sans `commitment_id`, six `activity_class` sur neuf sont structurellement
// inloggables par conversation: `SUBSTANCE_REFS` est un registre de molecules,
// `FOOD_GROUP_REFS` un vocabulaire alimentaire ferme, et aucun des deux ne peut
// porter lumiere, zone 2, coucher, pas ou respiration. La contrepartie est un
// champ que le modele pourrait INVENTER: le prompt doit donc enseigner le champ
// ET ses trois conditions cumulatives, sinon on echange un trou contre un faux.
// ---------------------------------------------------------------------------

Deno.test("the prompt teaches the two crediting fields — food group AND explicit binding", () => {
  for (
    const marker of [
      "food_group_ref",
      "commitment_id",
      "UN commitment_id NE SE DEVINE JAMAIS",
      // (a) l'id doit venir du bloc, litteralement
      "LITTERALEMENT dans keel_plan_context",
      // (b) une seule ligne, sinon null
      "mets null",
      // le refus runtime est nomme au modele: il sait que l'invention echoue
      "unknown_commitment",
      // la garde d'inversion de note (G1): jamais de liage sur une ligne avoid
      "polarity='avoid'",
    ]
  ) {
    assert(
      DISPATCHER_V2_SYSTEM_PROMPT.includes(marker),
      `the dispatcher prompt lost: ${marker}`,
    );
  }
  // Le vocabulaire alimentaire reste interpole depuis `tokens.ts`, comme les
  // substances: c'est ce qui rend la regle « jamais de slug approxime » tenable.
  for (const slug of ["poultry", "whole_grain", "leafy_greens"]) {
    assert(
      DISPATCHER_V2_SYSTEM_PROMPT.includes(slug),
      `the dispatcher prompt lost the interpolated food group: ${slug}`,
    );
  }
});

Deno.test("a commitment_id emitted by the model survives the sanitizer INTACT", async () => {
  // Le payload_hint traverse en opaque: si le sanitizer le rabotait, le liage
  // serait perdu entre le modele et l'intake, et le fait redeviendrait
  // orphelin sans qu'aucune couche ne le dise. (L'id lui-meme est verifie
  // contre le plan publie a l'intake, pas ici.)
  const id = "aaaaaaaa-0000-0000-0000-000000000003";
  const frame: TurnFrame = await runDispatcher(
    dispatcherInputWith({
      direct_effects: [
        logEffect({ commitment_id: id, student_note: "did my 30-minute walk" }),
      ],
      memory_plan: memoryPlan,
    }) as never,
  );
  assertEquals(frame.direct_effects.length, 1);
  assertEquals(
    (frame.direct_effects[0].payload_hint as Record<string, unknown>)
      .commitment_id,
    id,
  );
});
