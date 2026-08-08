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

/**
 * QA agent 4 — les effets KEEL qui ÉCRIVENT UN FAIT restent bloqués en crise.
 * `declare_safety_constraint` en sort: voir le test d'exemption plus bas.
 */
const KEEL_FACT_EFFECT_TYPES = KEEL_DIRECT_EFFECT_TYPES.filter(
  (t) => t !== "declare_safety_constraint",
);

Deno.test("safetyBandBlocksEffect — les effets KEEL de FAIT sont bloqués en bande >= medium", () => {
  for (const effectType of KEEL_FACT_EFFECT_TYPES) {
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

Deno.test("safetyBandBlocksEffect — les DEUX exemptions, et pas une de plus", () => {
  // Arbitrage V5 « safety + rappel explicit only » pour la première.
  assertEquals(safetyBandBlocksEffect("create_one_shot_reminder", "high"), false);

  // QA agent 4 — DEUXIÈME exemption, décision produit écrite (le commentaire de
  // `SAFETY_BLOCK_EXEMPT_EFFECT_TYPES` porte le raisonnement complet).
  // Enregistrer une allergie est un ACTE DE PROTECTION: la bloquer laisserait
  // la ceinture de sortie sans rien à comparer précisément au moment où
  // l'élève est le plus vulnérable. L'asymétrie tranche — sur-enregistrer
  // sur-bloque (récupérable, et rétractable), sous-enregistrer sert
  // l'allergène.
  assertEquals(
    safetyBandBlocksEffect("declare_safety_constraint", "critical"),
    false,
  );

  // Et la liste s'arrête là: tout le reste est bloqué par défaut-deny. Si une
  // troisième exemption apparaît, CE test tombe et la décision devient visible
  // — c'est sa seule raison d'être.
  for (
    const other of [
      "track_progress_plan_item",
      "log_protocol_event",
      "declare_deviation",
    ]
  ) {
    assertEquals(safetyBandBlocksEffect(other, "high"), true, other);
  }
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
    for (const effectType of KEEL_FACT_EFFECT_TYPES) {
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
  for (const effectType of KEEL_FACT_EFFECT_TYPES) {
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

  // QA agent 4 — et l'exempté traverse l'orchestrateur DANS LES DEUX BANDES.
  // C'est le bout-en-bout de la décision produit: en crise, l'allergie
  // s'enregistre quand même.
  for (const band of ["low", "high"] as const) {
    const outcome = await runEffectGateOrchestrator({
      turn_frame: turnFrame(band, "declare_safety_constraint"),
      direct_effects_to_run: ["declare_safety_constraint"],
    });
    assertEquals(outcome.allowed, ["declare_safety_constraint"], band);
    assertEquals(outcome.additional_blocked_paths, [], band);
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

Deno.test("QA agent 4 — le vocabulaire du ROUTEUR == celui du gate (parité des 5 points)", async () => {
  // CE TEST N'EXISTAIT PAS, et son absence a coûté deux tours de QA en aveugle.
  //
  // `declare_safety_constraint` avait été ajouté au contrat, au sanitizer, au
  // gate et à sa lane d'exécution — mais pas à
  // `ROUTER_RUNNABLE_DIRECT_EFFECT_TYPES`. Résultat: le dispatcher émettait
  // l'effet, `runnableDirectEffects` le filtrait, `direct_effects_to_run`
  // sortait VIDE, et le tour se terminait normalement. Aucune erreur, aucun
  // log, aucun `blocked` — le commentaire de ce Set avertissait déjà, mot pour
  // mot: « un effet ajouté au contrat sans être ajouté ici n'est pas bloqué,
  // il est INVISIBLE ».
  //
  // Le test au-dessus fige contrat == gate. Celui-ci ferme le maillon suivant,
  // qui était le seul des cinq à n'avoir aucune assertion.
  const source = await Deno.readTextFile(
    new URL("./routers.ts", import.meta.url),
  );
  const start = source.indexOf("export const ROUTER_RUNNABLE_DIRECT_EFFECT_TYPES");
  const block = source.slice(start, source.indexOf("]);", start));
  const fromRouter = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
  assertEquals(
    fromRouter,
    [...KNOWN_DIRECT_EFFECT_TYPES].sort(),
    "tout effet connu du gate doit être exécutable par le routeur, sinon il est muet",
  );
});

// ── L2 (2026-08-08) — L'ÉCRITURE SILENCIEUSE SOUS PLANCHER ──────────────────
//
// « Écrire le fait, taire la réponse » (arbitrage humain). Le drapeau ouvre UN
// effet et un seul, et son ABSENCE garde la garde fermée — c'est la polarité
// qui rend le défaut sûr, à l'inverse de la cicatrice
// `optional-gate-params-are-disarmed-gates`.

Deno.test("L2 — sans le drapeau, la bande safety bloque log_protocol_event (défaut fermé)", () => {
  for (const band of ["medium", "high", "critical"] as const) {
    assertEquals(safetyBandBlocksEffect("log_protocol_event", band), true, band);
    // Et l'oubli du paramètre donne exactement le même verdict.
    assertEquals(
      safetyBandBlocksEffect("log_protocol_event", band, false),
      true,
      band,
    );
  }
});

Deno.test("L2 — avec le drapeau, log_protocol_event traverse la bande safety", () => {
  for (const band of ["medium", "high", "critical"] as const) {
    assertEquals(
      safetyBandBlocksEffect("log_protocol_event", band, true),
      false,
      band,
    );
  }
});

Deno.test("L2 — le drapeau n'ouvre AUCUN autre effet", () => {
  // La coche de progrès est de la pression d'adhérence, l'écart planifié est
  // une négociation de plan: ni l'un ni l'autre n'est un fait déclaré.
  for (const effect of ["track_progress_plan_item", "declare_deviation"]) {
    assertEquals(
      safetyBandBlocksEffect(effect, "high", true),
      true,
      effect,
    );
  }
});

Deno.test("L2 — hors bande bloquante, le drapeau ne change rien (témoin)", () => {
  for (const band of ["none", "low"] as const) {
    assertEquals(safetyBandBlocksEffect("log_protocol_event", band, false), false);
    assertEquals(safetyBandBlocksEffect("log_protocol_event", band, true), false);
  }
});
