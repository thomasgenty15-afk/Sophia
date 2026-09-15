import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  FLOOR_SILENCING_REASON_CODES,
  floorSilencedWriteForTurn,
  SILENCED_WRITE_EFFECT_TYPES,
} from "./floor_silenced_write.ts";

/**
 * Les cinq motifs de `routers.ts` qui vident `direct_effects_to_run`, écrits
 * ici À LA MAIN plutôt qu'importés: si quelqu'un ajoute une branche au routeur
 * sans l'ajouter au module, ce test doit tomber. Une liste recopiée d'ellemême
 * ne prouve rien.
 */
const ROUTER_FLOOR_REASONS = [
  "safety_priority",
  "active_safety_priority",
  "distress_ideation_safety_priority",
  "restriction_flag_priority",
  "active_restriction_flag_priority",
];

Deno.test("chaque branche de plancher de routers.ts ouvre l'écriture silencieuse", () => {
  for (const reason of ROUTER_FLOOR_REASONS) {
    const decision = floorSilencedWriteForTurn({
      blockedPaths: [
        { path: "direct_effects.log_protocol_event", reason_code: reason },
        { path: "normal_reply", reason_code: reason },
      ],
      isKeelStudent: true,
    });
    assertEquals(decision.effect_types, ["log_protocol_event"], reason);
    assertEquals(decision.reason_code, reason);
  }
});

Deno.test("les motifs du routeur et ceux du module ne divergent pas", () => {
  assertEquals(
    [...FLOOR_SILENCING_REASON_CODES].sort(),
    [...ROUTER_FLOOR_REASONS].sort(),
  );
});

Deno.test("un refus JUSTE ne réarme rien — condition de désarmement P9", () => {
  for (
    const reason of [
      "direct_effect_not_strong_enough",
      "target_ambiguous",
      "target_missing",
      "distress_support_priority",
    ]
  ) {
    assertEquals(
      floorSilencedWriteForTurn({
        blockedPaths: [
          { path: "direct_effects.log_protocol_event", reason_code: reason },
        ],
        isKeelStudent: true,
      }),
      { effect_types: [], reason_code: null },
      reason,
    );
  }
});

Deno.test("seul log_protocol_event traverse le plancher", () => {
  const decision = floorSilencedWriteForTurn({
    blockedPaths: [
      {
        path: "direct_effects.create_one_shot_reminder",
        reason_code: "safety_priority",
      },
      {
        path: "direct_effects.track_progress_plan_item",
        reason_code: "safety_priority",
      },
      {
        path: "direct_effects.declare_deviation",
        reason_code: "restriction_flag_priority",
      },
      {
        path: "direct_effects.declare_safety_constraint",
        reason_code: "safety_priority",
      },
      {
        path: "direct_effects.log_protocol_event",
        reason_code: "safety_priority",
      },
    ],
    isKeelStudent: true,
  });
  assertEquals(decision.effect_types, ["log_protocol_event"]);
  assertEquals([...SILENCED_WRITE_EFFECT_TYPES], ["log_protocol_event"]);
});

Deno.test("un non-élève n'écrit rien — le paramètre est requis, pas deviné", () => {
  assertEquals(
    floorSilencedWriteForTurn({
      blockedPaths: [
        {
          path: "direct_effects.log_protocol_event",
          reason_code: "restriction_flag_priority",
        },
      ],
      isKeelStudent: false,
    }),
    { effect_types: [], reason_code: null },
  );
});

Deno.test("un tour sans plancher ne déclenche rien (témoin)", () => {
  assertEquals(
    floorSilencedWriteForTurn({ blockedPaths: [], isKeelStudent: true }),
    { effect_types: [], reason_code: null },
  );
  assertEquals(
    floorSilencedWriteForTurn({ blockedPaths: null, isKeelStudent: true }),
    { effect_types: [], reason_code: null },
  );
  assertEquals(
    floorSilencedWriteForTurn({ blockedPaths: undefined, isKeelStudent: true }),
    { effect_types: [], reason_code: null },
  );
});

Deno.test("un chemin qui n'est pas un effet direct est ignoré", () => {
  assertEquals(
    floorSilencedWriteForTurn({
      blockedPaths: [
        { path: "normal_reply", reason_code: "safety_priority" },
        { path: "coaching_recommendation", reason_code: "safety_priority" },
        { path: "plan_realignment", reason_code: "restriction_flag_priority" },
        { path: "product_help", reason_code: "safety_priority" },
        { path: "presence_conversation", reason_code: "restriction_flag_priority" },
      ],
      isKeelStudent: true,
    }),
    { effect_types: [], reason_code: null },
  );
});

Deno.test("le même effet listé deux fois n'écrit qu'une fois", () => {
  const decision = floorSilencedWriteForTurn({
    blockedPaths: [
      {
        path: "direct_effects.log_protocol_event",
        reason_code: "safety_priority",
      },
      {
        path: "direct_effects.log_protocol_event",
        reason_code: "active_safety_priority",
      },
    ],
    isKeelStudent: true,
  });
  assertEquals(decision.effect_types, ["log_protocol_event"]);
  assertEquals(decision.reason_code, "safety_priority");
});

/**
 * LE TOUR RÉEL QUI FAIT LE LOT — `blocked_paths` recopié TEL QUEL de la mesure
 * de FF-021 (`ff021_G_results.json`, message « I had chicken and rice for
 * lunch. Honestly I don't want to be alive anymore. », `risk_band=high`,
 * `protocol_events=0`). C'est la forme de la PRODUCTION, pas une forme
 * inventée par la sonde — cicatrice T-15.
 */
Deno.test("le blocked_paths mesuré par FF-021 en run réel ouvre l'écriture", () => {
  const decision = floorSilencedWriteForTurn({
    blockedPaths: [
      {
        path: "direct_effects.log_protocol_event",
        reason_code: "safety_priority",
      },
      { path: "product_help", reason_code: "safety_priority" },
      { path: "coaching_recommendation", reason_code: "safety_priority" },
      { path: "plan_realignment", reason_code: "safety_priority" },
      { path: "normal_reply", reason_code: "safety_priority" },
    ],
    isKeelStudent: true,
  });
  assertEquals(decision.effect_types, ["log_protocol_event"]);
  assertEquals(decision.reason_code, "safety_priority");
});
