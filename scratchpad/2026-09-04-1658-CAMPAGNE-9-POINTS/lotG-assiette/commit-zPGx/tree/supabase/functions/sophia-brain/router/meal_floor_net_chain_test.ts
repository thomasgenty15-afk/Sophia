/**
 * FF-009 — LE FILET DU PLANCHER, LA CHAÎNE COMPLÈTE.
 *
 * `meal_floor_net_test.ts` prouve la CONDITION (quand le filet s'arme, et
 * surtout quand il se désarme). Celui-ci prouve l'AUTRE moitié: que le rejeu
 * écrit réellement la ligne, et qu'il l'écrit avec le payload déterministe.
 *
 * Il rejoue la séquence EXACTE mesurée en run réel le 2026-08-08 sur
 * « j'ai commandé une pizza margherita » :
 *   1. le dispatcher demande le log avec `food_group_ref: "pizza_margherita"`
 *   2. l'intake refuse le payload ENTIER (`unknown_token`) → zéro ligne
 *   3. le routeur rejoue le payload du plancher → une ligne `off_plan`
 *
 * ⚠️ Le faux d'écriture RENVOIE `plan_relation`. Un faux qui l'oublierait
 * ferait passer ce test pour la mauvaise raison: l'exécuteur compare la ligne
 * RELUE à la demande, et un `off_plan` demandé qui ne revient pas est un
 * `readback_mismatch` — la garde même que FF-009 a posée.
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type {
  ProtocolEventRow,
  ProtocolEventWrite,
  ProtocolEventWriteInput,
} from "../tools/always_on/log_protocol_event/contract.ts";
import { runLogProtocolEventDirectEffect } from "../tools/always_on/log_protocol_event/router.ts";
import type { MealDeclarationHit } from "../../_shared/keel/meal_declaration_floor.ts";
import { mealDeclarationFloorEffect, mealFloorNetArms } from "./run.ts";

const USER = "22222222-2222-2222-2222-222222222222";

function frameWith(payload: Record<string, unknown>): TurnFrame {
  return {
    user_id: USER,
    source_message_id: "msg-ff009",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "log_protocol_event",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: payload,
    }],
    direct_effect_time_context: {
      now_utc: "2026-08-08T18:40:00.000Z",
      user_timezone: "Europe/Paris",
      user_locale: "fr-FR",
      user_local_datetime: "2026-08-08T20:40:00",
      user_local_human: "vendredi 8 août, 20:40",
    },
    skill_signals: {},
  } as unknown as TurnFrame;
}

function fakeDb() {
  const rows: ProtocolEventRow[] = [];
  const calls: ProtocolEventWriteInput[] = [];
  const write: ProtocolEventWrite = (input) => {
    calls.push(input);
    const existing = rows.find((row) =>
      row.source_message_id === input.source_message_id
    );
    if (existing) {
      return Promise.resolve({ outcome: "already_logged" as const, row: existing });
    }
    const row = {
      id: `pe-${rows.length + 1}`,
      user_id: input.user_id,
      local_date: input.local_date,
      occurred_at: input.occurred_at,
      slot_key: input.slot_key,
      source: input.source,
      source_message_id: input.source_message_id,
      bound_commitment_id: input.commitment_id,
      food_group_ref: input.food_group_ref,
      substance_ref: input.substance_ref,
      // LA LIGNE QUI FAIT QUE CE TEST PROUVE QUELQUE CHOSE.
      plan_relation: input.plan_relation,
    } as unknown as ProtocolEventRow;
    rows.push(row);
    return Promise.resolve({ outcome: "inserted" as const, row });
  };
  return { rows, calls, write };
}

const FLOOR_HIT: MealDeclarationHit = {
  components: [],
  studentNote: "j'ai commandé une pizza margherita",
  gate: "off_plan_marker",
  planRelation: "off_plan",
  offPlanMatched: "j ai commande",
};

Deno.test("le slug halluciné du modèle perd le fait ENTIER — c'est le défaut mesuré", async () => {
  const db = fakeDb();
  const refused = await runLogProtocolEventDirectEffect({
    turn_frame: frameWith({
      student_note: "j'ai commandé une pizza margherita",
      plan_relation: "off_plan",
      food_group_ref: "pizza_margherita",
    }),
    content_locale: "fr-FR",
    default_source: "chat",
    write_protocol_event: db.write,
  });

  assertEquals(refused.status, "needs_clarify");
  assertEquals(refused.committed_effects.length, 0);
  assertEquals(db.rows.length, 0, "aucune ligne: la soirée hors plan disparaît");
  assertEquals(
    (refused.blocked_effects[0] as { reason_code: string }).reason_code,
    "unknown_token",
  );

  // ...et c'est très exactement la condition qui arme le filet.
  assertEquals(
    mealFloorNetArms({
      floorHit: FLOOR_HIT,
      committedEffects: refused.committed_effects,
      blockedEffects: refused.blocked_effects,
      suppressedByPrecision: false,
    }),
    true,
  );
});

Deno.test("le rejeu du plancher écrit la ligne, `off_plan`, et n'invente AUCUN aliment", async () => {
  const db = fakeDb();
  const refused = await runLogProtocolEventDirectEffect({
    turn_frame: frameWith({
      student_note: "j'ai commandé une pizza margherita",
      plan_relation: "off_plan",
      food_group_ref: "pizza_margherita",
    }),
    content_locale: "fr-FR",
    default_source: "chat",
    write_protocol_event: db.write,
  });
  assertEquals(refused.committed_effects.length, 0);

  // Le routeur rejoue AVEC LE MÊME faux d'écriture: on prouve la chaîne, pas
  // deux moitiés indépendantes.
  const net = await runLogProtocolEventDirectEffect({
    turn_frame: frameWith(
      mealDeclarationFloorEffect(FLOOR_HIT).payload_hint as Record<
        string,
        unknown
      >,
    ),
    content_locale: "fr-FR",
    default_source: "chat",
    write_protocol_event: db.write,
  });

  assertEquals(net.status, "logged");
  assertEquals(net.committed_effects.length, 1);
  assertEquals(db.rows.length, 1);
  assertEquals(db.calls.at(-1)?.plan_relation, "off_plan");
  // R3 — le slug halluciné n'est pas recyclé, et rien n'est deviné à sa place.
  assertEquals(db.calls.at(-1)?.food_group_ref, null);
  assertEquals(net.committed_effects[0].plan_relation, "off_plan");
  assertEquals(net.committed_effects[0].food_group_ref, null);
});

Deno.test("le rejeu ne double PAS un fait déjà écrit — l'idempotence tient", async () => {
  const db = fakeDb();
  // Un premier passage qui RÉUSSIT: le filet ne doit alors jamais s'armer.
  const first = await runLogProtocolEventDirectEffect({
    turn_frame: frameWith({
      student_note: "j'ai commandé du poulet",
      plan_relation: "off_plan",
      food_group_ref: "poultry",
    }),
    content_locale: "fr-FR",
    default_source: "chat",
    write_protocol_event: db.write,
  });
  assertEquals(first.committed_effects.length, 1);
  assertEquals(
    mealFloorNetArms({
      floorHit: FLOOR_HIT,
      committedEffects: first.committed_effects,
      blockedEffects: first.blocked_effects,
      suppressedByPrecision: false,
    }),
    false,
    "une ligne écrite désarme le filet",
  );
  assertEquals(db.rows.length, 1);
});
