// KEEL W3.3 — le gate d'effets durables et le vocabulaire que W4 va ouvrir.
//
// Ce fichier fige DEUX choses:
//   1. la règle safety, telle qu'elle vaut aujourd'hui et telle qu'elle vaudra
//      pour les effets KEEL: bande >= medium => bloqué, sauf exemption
//      explicitement listée (défaut-deny);
//   2. le contrat d'ouverture de W4, sous forme d'un test IGNORÉ qui devient
//      exécutable le jour où `DirectEffectType` accueille les deux nouveaux
//      effets. Tant que W4 n'a pas livré, il est ignoré — jamais vert par
//      accident.
import { assertEquals } from "jsr:@std/assert@1";
import {
  isKnownDirectEffectType,
  KEEL_DIRECT_EFFECT_TYPES,
  KNOWN_DIRECT_EFFECT_TYPES,
  runDirectEffectGate,
  safetyBandBlocksEffect,
} from "./direct_effect_gate.ts";
import { runEffectGateOrchestrator } from "./effect_gate_orchestrator.ts";
import type {
  DirectEffectType,
  RiskBand,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";

const RISK_BANDS: RiskBand[] = ["none", "low", "medium", "high", "critical"];

function turnFrame(
  riskBand: RiskBand,
  effectType: string,
): TurnFrame {
  return {
    user_id: "u1",
    source_message_id: "m1",
    safety: { risk_band: riskBand },
    direct_effects: [
      {
        effect_type: effectType as DirectEffectType,
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      },
    ],
  } as unknown as TurnFrame;
}

async function gate(riskBand: RiskBand, effectType: string) {
  return await runDirectEffectGate({
    effect_type: effectType as DirectEffectType,
    turn_frame: turnFrame(riskBand, effectType),
    recent_writes_idempotency: { source_message_ids: [] },
    db_idempotency_check: () => Promise.resolve(false),
  });
}

// ---------------------------------------------------------------------------
// La règle, aujourd'hui
// ---------------------------------------------------------------------------

Deno.test("safetyBandBlocksEffect — bloque à partir de medium, par défaut", () => {
  for (const band of RISK_BANDS) {
    const expectedBlocked = band === "medium" || band === "high" ||
      band === "critical";
    // track_progress_plan_item: pas d'exemption.
    assertEquals(
      safetyBandBlocksEffect("track_progress_plan_item", band),
      expectedBlocked,
      band,
    );
    // Un effet inconnu du gate est bloqué comme les autres (défaut-deny):
    // c'est ce qui protégera log_protocol_event le jour de son ajout, même si
    // personne ne pense à toucher ce gate.
    assertEquals(
      safetyBandBlocksEffect("some_effect_invented_in_2027", band),
      expectedBlocked,
      band,
    );
  }
});

Deno.test("safetyBandBlocksEffect — les effets KEEL de W4 sont bloqués en bande >= medium", () => {
  for (const effectType of KEEL_DIRECT_EFFECT_TYPES) {
    assertEquals(safetyBandBlocksEffect(effectType, "low"), false, effectType);
    assertEquals(safetyBandBlocksEffect(effectType, "medium"), true, effectType);
    assertEquals(safetyBandBlocksEffect(effectType, "high"), true, effectType);
    assertEquals(
      safetyBandBlocksEffect(effectType, "critical"),
      true,
      effectType,
    );
  }
});

Deno.test("safetyBandBlocksEffect — create_one_shot_reminder reste la SEULE exemption", () => {
  // Arbitrage V5 « safety + rappel explicit only ». Si cette exemption
  // s'élargit un jour, ce test tombe et la décision devient visible.
  assertEquals(safetyBandBlocksEffect("create_one_shot_reminder", "high"), false);
});

Deno.test("runDirectEffectGate — le comportement observable ne change pas (W3.3 refactor)", async () => {
  assertEquals(
    (await gate("high", "track_progress_plan_item")).decision,
    "blocked",
  );
  assertEquals(
    (await gate("medium", "track_progress_plan_item")).decision,
    "blocked",
  );
  assertEquals((await gate("low", "track_progress_plan_item")).decision, "allow");
  assertEquals(
    (await gate("critical", "create_one_shot_reminder")).decision,
    "allow",
  );
});

// ---------------------------------------------------------------------------
// Le contrat d'ouverture de W4
// ---------------------------------------------------------------------------

/** Échoue tant que `DirectEffectType` n'accueille pas les effets KEEL. */
async function assertDirectEffectTypeUnionContainsKeelEffects() {
  const source = await Deno.readTextFile(
    new URL("../contracts/turn_frame.v1.ts", import.meta.url),
  );
  const union = source.slice(
    source.indexOf("export type DirectEffectType"),
    source.indexOf(";", source.indexOf("export type DirectEffectType")),
  );
  for (const effectType of KEEL_DIRECT_EFFECT_TYPES) {
    assertEquals(
      union.includes(`"${effectType}"`),
      true,
      `DirectEffectType doit inclure ${effectType} (W4.3)`,
    );
  }
}

// W4.3 — ACTIVÉ (l'`ignore: true` de W3.3 est levé). Ce test est passé au vert
// SANS aucune modification de la règle safety du gate: la seule édition de
// W4.3 dans ce fichier-ci est la suppression du flag. C'est la preuve
// recherchée — la règle était en place AVANT l'effet, pas ajoutée après coup.
Deno.test({
  name: "W4 — log_protocol_event et declare_deviation traversent le gate et sont bloqués en crise",
  fn: async () => {
    // Barrière d'abord: sans cette assertion, le corps passerait dès
    // aujourd'hui (le helper caste en DirectEffectType) et le test serait un
    // faux vert le jour où on lèverait l'ignore par erreur.
    await assertDirectEffectTypeUnionContainsKeelEffects();
    for (const effectType of KEEL_DIRECT_EFFECT_TYPES) {
      const blockedOutcome = await gate("high", effectType);
      assertEquals(blockedOutcome.decision, "blocked", effectType);
      assertEquals(
        blockedOutcome.decision === "blocked" && blockedOutcome.reason_code,
        "safety_high",
        effectType,
      );
      const allowedOutcome = await gate("low", effectType);
      assertEquals(allowedOutcome.decision, "allow", effectType);
    }
  },
});

// Le vocabulaire du contrat et celui du gate ne peuvent plus diverger: ce test
// échoue si l'un des deux bouge sans l'autre.
Deno.test({
  name: "W4 — DirectEffectType contient les effets KEEL",
  fn: assertDirectEffectTypeUnionContainsKeelEffects,
});

// ---------------------------------------------------------------------------
// W4.3 — source unique du vocabulaire (le piège qui a coûté un rejet muet)
// ---------------------------------------------------------------------------

Deno.test("W4.3 — l'orchestrateur reconnaît les effets KEEL (plus de liste dupliquée)", async () => {
  for (const effectType of KEEL_DIRECT_EFFECT_TYPES) {
    assertEquals(isKnownDirectEffectType(effectType), true, effectType);
  }
  assertEquals(isKnownDirectEffectType("some_effect_invented_in_2027"), false);

  // Bout-en-bout par l'orchestrateur: avant W4.3, un effet KEEL en ressortait
  // en `unknown_effect_type` — bloqué, certes, mais pour la mauvaise raison
  // (jamais gaté par la safety, jamais exécuté, et invisible au ledger).
  for (const effectType of KEEL_DIRECT_EFFECT_TYPES) {
    const allowed = await runEffectGateOrchestrator({
      turn_frame: turnFrame("low", effectType),
      direct_effects_to_run: [effectType],
    });
    assertEquals(allowed.allowed, [effectType]);
    assertEquals(allowed.additional_blocked_paths, []);

    const inCrisis = await runEffectGateOrchestrator({
      turn_frame: turnFrame("high", effectType),
      direct_effects_to_run: [effectType],
    });
    assertEquals(inCrisis.allowed, []);
    assertEquals(inCrisis.additional_blocked_paths, [
      { path: effectType, reason_code: "safety_high" },
    ]);
  }
});

Deno.test("W4.3 — le vocabulaire connu du gate == l'union DirectEffectType", async () => {
  const source = await Deno.readTextFile(
    new URL("../contracts/turn_frame.v1.ts", import.meta.url),
  );
  const start = source.indexOf("export type DirectEffectType");
  const union = source.slice(start, source.indexOf(";", start));
  const fromContract = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
    .sort();
  assertEquals([...KNOWN_DIRECT_EFFECT_TYPES].sort(), fromContract);
});
