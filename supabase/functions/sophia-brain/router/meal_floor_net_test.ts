/**
 * FF-009 — LE FILET DU PLANCHER DE REPAS.
 *
 * ── LE DÉFAUT QU'IL FERME, MESURÉ EN RUN RÉEL (2026-08-08) ──────────────────
 * « j'ai commandé une pizza margherita », 1 tour sur 10, stack locale, vrai
 * modèle :
 *   frame   → `log_protocol_event` avec `food_group_ref: "pizza_margherita"`,
 *             un slug que le modèle vient d'inventer
 *   intake  → `unknown_token`, et le payload ENTIER est refusé (R7 : un jeton
 *             inconnu n'est jamais rabattu sur un voisin — c'est la bonne
 *             posture, et ce n'est pas elle qu'on change)
 *   base    → ZÉRO ligne
 *   réponse → « A margherita pizza is mostly fine as a meal… »
 *
 * Le plancher déterministe s'était effacé, parce que le dispatcher avait DÉJÀ
 * demandé l'effet. Sa garantie — « un repas déclaré n'est jamais perdu » —
 * s'évanouissait donc précisément quand le modèle parlait le premier ET se
 * trompait. Un accusé fantôme sur la donnée centrale du produit.
 *
 * ── CE QUE LE FILET NE DOIT SURTOUT PAS FAIRE ───────────────────────────────
 * S'armer sur un refus JUSTE. `protocol_events` est APPEND-ONLY : une ligne
 * écrite sur « je vais commander ce soir » ne se retire pas depuis le chat, et
 * un doublon sur un fait déjà écrit fausse les trois comptes de FF-009. La
 * moitié de ces tests porte donc sur le DÉSARMEMENT (P9).
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { MealDeclarationHit } from "../../_shared/keel/meal_declaration_floor.ts";
import { mealDeclarationFloorEffect, mealFloorNetArms } from "./run.ts";

const HIT: MealDeclarationHit = {
  components: [],
  studentNote: "j'ai commandé une pizza margherita",
  gate: "off_plan_marker",
  planRelation: "off_plan",
  offPlanMatched: "j ai commande",
};

const HIT_WITH_FOOD: MealDeclarationHit = {
  components: [
    { food_group_ref: "poultry", matched: "poulet" },
    { food_group_ref: "refined_grain", matched: "riz" },
  ],
  studentNote: "j'ai commandé du poulet et du riz",
  gate: "off_plan_marker",
  planRelation: "off_plan",
  offPlanMatched: "j ai commande",
};

const blocked = (reason: string) => [{
  type: "log_protocol_event",
  reason_code: reason,
}];

Deno.test("le filet s'arme sur les QUATRE refus de forme, et sur eux seuls", () => {
  for (
    const reason of [
      "unknown_token",
      "unknown_commitment",
      "too_many_components",
      "empty_payload",
    ]
  ) {
    assertEquals(
      mealFloorNetArms({
        floorHit: HIT,
        committedEffects: [],
        blockedEffects: blocked(reason),
        suppressedByPrecision: false,
      }),
      true,
      `${reason} doit armer le filet`,
    );
  }
});

Deno.test("DÉSARMEMENT — `future_intent` est un refus JUSTE, jamais rejoué", () => {
  // « je vais commander ce soir ». Rejouer écrirait un fait sur une intention,
  // dans une table append-only, et l'évaluateur le compterait ce soir.
  assertEquals(
    mealFloorNetArms({
      floorHit: HIT,
      committedEffects: [],
      blockedEffects: blocked("future_intent"),
      suppressedByPrecision: false,
    }),
    false,
  );
});

Deno.test("DÉSARMEMENT — `components_already_logged` est un refus JUSTE", () => {
  // La lane de précision a déjà écrit ces composants: rejouer les doublerait,
  // et les trois comptes de FF-009 compteraient un repas de trop.
  assertEquals(
    mealFloorNetArms({
      floorHit: HIT,
      committedEffects: [],
      blockedEffects: blocked("components_already_logged"),
      suppressedByPrecision: false,
    }),
    false,
  );
});

Deno.test("DÉSARMEMENT — un refus d'idempotence n'arme pas non plus", () => {
  for (const reason of ["duplicate_db", "duplicate_recent", "write_failed"]) {
    assertEquals(
      mealFloorNetArms({
        floorHit: HIT,
        committedEffects: [],
        blockedEffects: blocked(reason),
        suppressedByPrecision: false,
      }),
      false,
      `${reason} ne doit PAS armer le filet`,
    );
  }
});

Deno.test("DÉSARMEMENT — une ligne écrite suffit: le filet ne sert qu'à l'absence TOTALE", () => {
  assertEquals(
    mealFloorNetArms({
      floorHit: HIT_WITH_FOOD,
      // un composant est passé, l'autre a été refusé: le fait EXISTE.
      committedEffects: [{ type: "log_protocol_event", protocol_event_id: "x" }],
      blockedEffects: blocked("unknown_token"),
      suppressedByPrecision: false,
    }),
    false,
  );
});

Deno.test("DÉSARMEMENT — le plancher n'a rien reconnu: rien à rejouer", () => {
  assertEquals(
    mealFloorNetArms({
      floorHit: null,
      committedEffects: [],
      blockedEffects: blocked("unknown_token"),
      suppressedByPrecision: false,
    }),
    false,
  );
});

Deno.test("DÉSARMEMENT — la lane de précision a retiré l'effet EXPRÈS", () => {
  // `suppressLogProtocolEvent` est une CORRECTION en cours: le tour amende un
  // fait existant. Le filet le rendrait au doublon qu'elle vient d'éviter.
  assertEquals(
    mealFloorNetArms({
      floorHit: HIT,
      committedEffects: [],
      blockedEffects: blocked("unknown_token"),
      suppressedByPrecision: true,
    }),
    false,
  );
});

Deno.test("un refus qui vise un AUTRE effet n'arme pas le filet du repas", () => {
  assertEquals(
    mealFloorNetArms({
      floorHit: HIT,
      committedEffects: [],
      blockedEffects: [{
        type: "declare_safety_constraint",
        reason_code: "unknown_token",
      }],
      suppressedByPrecision: false,
    }),
    false,
  );
});

Deno.test("le payload rejoué est DÉTERMINISTE: la relation au plan, et rien d'inventé", () => {
  const effect = mealDeclarationFloorEffect(HIT);
  assertEquals(effect.effect_type, "log_protocol_event");
  const payload = effect.payload_hint as Record<string, unknown>;
  assertEquals(payload.plan_relation, "off_plan");
  // R3: un hors-plan sans détail n'invente AUCUN `food_group_ref` — et surtout
  // pas celui que le modèle venait de halluciner.
  assertEquals(payload.components, []);
  assertEquals(payload.student_note, "j'ai commandé une pizza margherita");
});

Deno.test("le payload rejoué porte la CARDINALITÉ du lexique, pas « l'entrée la plus porteuse »", () => {
  const payload = mealDeclarationFloorEffect(HIT_WITH_FOOD)
    .payload_hint as Record<string, unknown>;
  assertEquals(payload.components, [
    { food_group_ref: "poultry" },
    { food_group_ref: "refined_grain" },
  ]);
  assertEquals(payload.plan_relation, "off_plan");
});

Deno.test("sans marqueur, `plan_relation` est ABSENTE — `null` ne devient jamais `as_planned`", () => {
  const payload = mealDeclarationFloorEffect({
    components: [{ food_group_ref: "poultry", matched: "poulet" }],
    studentNote: "j'ai mangé du poulet à midi",
    gate: "past_tense_verb",
    planRelation: null,
    offPlanMatched: null,
  }).payload_hint as Record<string, unknown>;
  assertEquals("plan_relation" in payload, false);
});
