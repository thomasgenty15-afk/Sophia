/**
 * QA WEB L1-c — LES TROIS LANES B2C SONT FERMÉES À UN ÉLÈVE KEEL.
 *
 * LE ROUGE QUI A PRÉCÉDÉ CE FICHIER, en run réel (pas en simulation):
 * un élève dont le coach interdit explicitement le comptage de calories
 * demande « Should I start counting my calories? ». Le dispatcher classe
 * `coaching_recommendation.detected=true`, la lane possède le tour, et la
 * réponse rendue est « What's the situation you want to get unstuck from,
 * exactly — and what's blocking you right now? ». Pas un mot du coach.
 *
 * La cause n'est pas le modèle: la doctrine n'est injectée QUE dans le
 * contexte du composeur (`withKeelDoctrineBlock`, un seul appelant), alors que
 * `applyKeelOutputLocks` verrouille SIX chemins de sortie. Ces trois lanes
 * étaient donc verrouillées sur une doctrine qu'elles n'avaient jamais lue.
 *
 * Ce que ces tests gardent, dans les deux sens: la lane est fermée pour un
 * élève KEEL, et elle reste OUVERTE pour tout le monde d'autre — sans quoi le
 * correctif serait une suppression de fonctionnalité déguisée en garde.
 */

import { assertEquals } from "jsr:@std/assert@1";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "./routers.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-1",
    source_message_id: "msg-1",
    user_id: "student-1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
    ...patch,
  } as TurnFrame;
}

const HIGH = { detected: true, confidence_band: "high" as const };

const LANES = [
  { key: "coaching_recommendation", signal: { coaching_recommendation: HIGH } },
  { key: "product_help", signal: { product_help: HIGH } },
  { key: "plan_realignment", signal: { plan_realignment: HIGH } },
] as const;

for (const lane of LANES) {
  Deno.test(`KEEL: la lane ${lane.key} n'est PAS ouverte à un élève de coach`, () => {
    const decision = runConversationRouters({
      turn_frame: frame({ skill_signals: lane.signal as never }),
      active_skill_state: null,
      safety_context_risk_band: "none",
      keel_student: true,
    });
    assertEquals(
      decision.response_owner,
      "normal_reply",
      `un élève KEEL doit retomber sur le composeur — qui porte la doctrine — ` +
        `et pas sur ${lane.key} (reçu: ${decision.response_owner})`,
    );
  });

  Deno.test(`hors KEEL: la lane ${lane.key} reste ouverte (anti-suppression)`, () => {
    const decision = runConversationRouters({
      turn_frame: frame({ skill_signals: lane.signal as never }),
      active_skill_state: null,
      safety_context_risk_band: "none",
      keel_student: false,
    });
    assertEquals(decision.response_owner, lane.key);
  });

  Deno.test(`gate ABSENT: la lane ${lane.key} reste ouverte (défaut B2C)`, () => {
    // `keel_student` non passé du tout: c'est l'état de toute la base B2C
    // existante, et une garde qui mordrait sur un paramètre absent ferait
    // taire des utilisateurs qui n'ont rien à voir avec KEEL.
    const decision = runConversationRouters({
      turn_frame: frame({ skill_signals: lane.signal as never }),
      active_skill_state: null,
      safety_context_risk_band: "none",
    });
    assertEquals(decision.response_owner, lane.key);
  });
}

Deno.test("KEEL: un flow B2C DÉJÀ ouvert peut se refermer (continuation intacte)", () => {
  // La fermeture porte sur l'ENTRÉE. Couper une continuation laisserait un
  // élève migré coincé au milieu d'un flow, avec un état en base que plus
  // rien ne consomme.
  const decision = runConversationRouters({
    turn_frame: frame(),
    active_skill_state: {
      skill_id: "coaching_recommendation",
      status: "active",
      working_state: {},
    } as never,
    safety_context_risk_band: "none",
    keel_student: true,
  });
  assertEquals(decision.response_owner, "coaching_recommendation");
  assertEquals(decision.reason_code, "active_coaching_recommendation");
});

Deno.test("KEEL: plan_question garde la priorité sur les lanes fermées", () => {
  // Contre-factuel d'ordre: la fermeture ne doit pas avoir déplacé la lane
  // KEEL sous une autre branche.
  const decision = runConversationRouters({
    turn_frame: frame({
      skill_signals: {
        coaching_recommendation: HIGH,
        plan_question: {
          detected: true,
          confidence_band: "high",
          context: {
            kind: "food_swap",
            requested_food_group: "other_fruit",
            prescribed_food_group: "berries",
            reason: "swap request",
          },
        },
      } as never,
    }),
    active_skill_state: null,
    safety_context_risk_band: "none",
    keel_student: true,
  });
  assertEquals(decision.response_owner, "plan_question");
});
