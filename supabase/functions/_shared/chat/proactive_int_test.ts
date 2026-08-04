// LA COUCHE PROACTIVE SANS TEMPLATES — contre la vraie base et les vrais crons.
//
// LE DoD DE P2, LITTÉRALEMENT
// ---------------------------
// « un checkin proactif provisionné arrive dans la bulle SANS action de
// l'élève, la réponse libre est classée contre la question, le 3e tour désarme,
// un nouveau message armé supplante l'ancien, mute respecté, cap respecté. »
//
// Chacun de ces points est un test ci-dessous, et aucun ne passe par un stub de
// livraison : le cron réel est appelé par HTTP, avec son en-tête interne, et on
// lit ce qui est arrivé dans `chat_messages`.
//
// POURQUOI L'HORLOGE EST INJECTÉE
// -------------------------------
// `keel-daily-pulse-v1` n'envoie qu'entre 20 h et 22 h LOCALES. Un test qui
// dépend de l'heure réelle est vert deux heures par jour — c'est-à-dire faux
// vingt-deux heures sur vingt-quatre. Le job accepte `now`, et on le lui donne.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ARMED_QUESTION_MAX_TURNS,
  classifyArmedQuestionReply,
  resolveArmedQuestion,
} from "./armed_question.ts";
import { deliverChatMessage } from "./delivery.ts";
import { DAILY_UNSOLICITED_CAP } from "./delivery_policy.ts";

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const MISSING = REQUIRED_ENV.filter((n) =>
  (Deno.env.get(n) ?? "").trim().length === 0
);
const SKIP = MISSING.length > 0;
if (SKIP) {
  console.log(
    `[skip] proactive_int_test.ts: stack requise — manque: ${MISSING.join(", ")}`,
  );
}

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim() ||
    (Deno.env.get("SECRET_KEY") ?? "").trim();
}

function admin() {
  return createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function makeStudentWithPlan(
  patch: Record<string, unknown> = {},
): Promise<string> {
  const anon = createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const { data, error } = await anon.auth.signUp({
    email: `dw-proactive-${nonce}@test.dev`,
    password: "1234567",
  });
  if (error || !data.user) throw new Error(`signUp: ${error?.message}`);
  const userId = data.user.id;
  const db = admin();
  const { error: pErr } = await db.from("profiles").update({
    keel_role: "student",
    // Europe/Paris à 20 h locales = 18 h UTC en août. L'horloge injectée plus
    // bas vise cette fenêtre.
    timezone: "Europe/Paris",
    country: "GB",
    chat_last_inbound_at: null,
    proactive_muted_at: null,
    deletion_requested_at: null,
    whatsapp_opted_in: true,
    whatsapp_opted_out_at: null,
    ...patch,
  } as never).eq("id", userId);
  if (pErr) throw pErr;

  // Un plan de semaine ADOPTÉ: la garde `no_active_plan` du job l'exige, et
  // un brouillon ne compte pas (« rien à suivre, rien à demander »).
  const { error: planErr } = await db.from("student_week_plans").insert({
    user_id: userId,
    week_start: "2026-08-03",
    status: "adopted",
    // Le CHECK `student_week_plans_check` exige `adopted_at` quand le statut
    // est `adopted`. Trouvé en essayant, pas en lisant.
    adopted_at: "2026-08-03T00:00:00.000Z",
    items: [],
    content_locale: "en-GB",
  } as never);
  if (planErr) {
    throw new Error(`plan de semaine impossible: ${planErr.message}`);
  }
  return userId;
}

async function cleanup(userId: string) {
  const db = admin();
  for (
    const table of [
      "inbound_dedup",
      "outbound_messages",
      "chat_messages",
      "student_daily_checkins",
      "student_week_plans",
    ]
  ) {
    await db.from(table).delete().eq("user_id", userId);
  }
  await db.auth.admin.deleteUser(userId).catch(() => {});
}

async function runPulse(nowIso: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${URL_BASE}/functions/v1/keel-daily-pulse-v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "x-internal-secret": internalSecret(),
    },
    body: JSON.stringify({ now: nowIso, limit: 500 }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`keel-daily-pulse-v1 ${res.status}: ${JSON.stringify(json)}`);
  return json as Record<string, unknown>;
}

/** 20 h 30 heure de Paris, en août ⇒ 18 h 30 UTC. */
const PULSE_WINDOW_UTC = "2026-08-04T18:30:00.000Z";

Deno.test({
  name: "P2 DoD: un checkin proactif ARRIVE dans la bulle sans action de l'élève",
  ignore: SKIP,
  fn: async () => {
    const userId = await makeStudentWithPlan();
    try {
      const before = await admin()
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      assertEquals(before.count, 0, "la bulle part vide");

      await runPulse(PULSE_WINDOW_UTC);

      const { data } = await admin()
        .from("chat_messages")
        .select("role,content,scope,metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      const rows = (data ?? []) as Array<
        { role: string; content: string; scope: string; metadata: Record<string, unknown> }
      >;
      assertEquals(rows.length, 1, "exactement un message proactif");
      assertEquals(rows[0].role, "assistant");
      assertEquals(rows[0].scope, "app");
      assertEquals(rows[0].content, "How was today?");
      assertEquals(rows[0].metadata.channel, "in_app");
      assertEquals(rows[0].metadata.is_proactive, true);
      assertEquals(rows[0].metadata.purpose, "keel_daily_pulse");
      // ARMÉ: la question porte ses trois boutons, et c'est ce qui remplace le
      // template Meta et ses payloads voyageant par index.
      const buttons = rows[0].metadata.buttons as Array<{ payload: string }>;
      assertEquals(buttons.length, 3);
      assertEquals(buttons.map((b) => b.payload), [
        "KEEL_PULSE_GOOD",
        "KEEL_PULSE_MIXED",
        "KEEL_PULSE_HARD",
      ]);

      // Le ledger sait qu'il a livré, et pourquoi.
      const { data: out } = await admin()
        .from("outbound_messages")
        .select("delivery_channel,status,message_type,metadata")
        .eq("user_id", userId)
        .maybeSingle();
      assertEquals((out as any)?.delivery_channel, "in_app");
      assertEquals((out as any)?.status, "sent");
      assertEquals((out as any)?.message_type, "interactive_buttons");
      assertEquals((out as any)?.metadata?.delivery_reason, "guaranteed");
    } finally {
      await cleanup(userId);
    }
  },
});

Deno.test({
  name: "P2 DoD: un élève MUTÉ ne reçoit pas le checkin — et le refus est consigné",
  ignore: SKIP,
  fn: async () => {
    const userId = await makeStudentWithPlan({
      proactive_muted_at: new Date().toISOString(),
    });
    try {
      const report = await runPulse(PULSE_WINDOW_UTC);

      const { count } = await admin()
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      assertEquals(count, 0, "rien n'est arrivé dans la bulle");

      // ── LE MUTE MORD DEUX FOIS, ET C'EST VOULU ─────────────────────────────
      // Le DÉCIDEUR du job l'attrape en premier (`opted_out`), donc aucune
      // livraison n'est même tentée — d'où l'absence de ligne `skipped` au
      // ledger. La garde de LIVRAISON existe quand même et mord aussi: elle est
      // prouvée séparément par `delivery_int_test.ts` (« muté ⇒ le proactif
      // s'arrête, la réponse passe toujours »).
      //
      // Ce que ce test garde, c'est que « rien envoyé » soit DIT: un dimanche
      // silencieux et un dimanche entièrement bloqué doivent être distinguables
      // dans le compte-rendu du job.
      const skips = (report.skipped_by_reason ?? {}) as Record<string, number>;
      assert(
        (skips.opted_out ?? 0) >= 1,
        `le job doit NOMMER le refus, reçu: ${JSON.stringify(skips)}`,
      );

      const { count: ledger } = await admin()
        .from("outbound_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      assertEquals(ledger, 0, "aucune livraison n'a même été tentée");
    } finally {
      await cleanup(userId);
    }
  },
});

Deno.test({
  name: "P2 DoD: la réponse LIBRE est classée contre la question posée",
  ignore: SKIP,
  fn: async () => {
    const userId = await makeStudentWithPlan();
    try {
      await runPulse(PULSE_WINDOW_UTC);

      const nowIso = "2026-08-04T18:35:00.000Z";
      const armed = await resolveArmedQuestion(admin(), { userId, nowIso });
      assert(armed, "la question est armée");
      assertEquals(armed!.content, "How was today?");
      assertEquals(armed!.purpose, "keel_daily_pulse");

      // Classée SANS appeler un vrai modèle: le runner est injecté. Ce qui est
      // testé ici est le câblage question→boutons→payload, pas le modèle.
      const classified = await classifyArmedQuestionReply({
        question: armed!,
        inboundText: "honestly pretty rough, I barely slept",
        llmRunner: () =>
          Promise.resolve(JSON.stringify({ choice: "Rough", confidence: 0.95 })),
      });
      assertEquals(classified.choice, "KEEL_PULSE_HARD");

      // Et le libellé exact ne coûte pas d'appel du tout.
      const exact = await classifyArmedQuestionReply({
        question: armed!,
        inboundText: "All good",
        llmRunner: () => Promise.reject(new Error("ne doit pas être appelé")),
      });
      assertEquals(exact.choice, "KEEL_PULSE_GOOD");
    } finally {
      await cleanup(userId);
    }
  },
});

Deno.test({
  name: "P2 DoD: le 3e tour entrant DÉSARME la question",
  ignore: SKIP,
  fn: async () => {
    const userId = await makeStudentWithPlan();
    try {
      await runPulse(PULSE_WINDOW_UTC);
      const db = admin();

      // Deux tours: la question tient encore. Le public écrit en rafale, et la
      // règle « fermée dès que Sophia reparle » tuait la question au premier mot.
      for (let i = 0; i < ARMED_QUESTION_MAX_TURNS - 1; i += 1) {
        await db.from("chat_messages").insert({
          user_id: userId,
          scope: "app",
          role: "user",
          content: `burst ${i}`,
          created_at: new Date(
            Date.parse(PULSE_WINDOW_UTC) + (i + 1) * 60_000,
          ).toISOString(),
          metadata: { channel: "in_app" },
        } as never);
      }
      const still = await resolveArmedQuestion(db, {
        userId,
        nowIso: "2026-08-04T18:40:00.000Z",
      });
      assert(still, `armée après ${ARMED_QUESTION_MAX_TURNS - 1} tours`);

      // Le tour de trop.
      await db.from("chat_messages").insert({
        user_id: userId,
        scope: "app",
        role: "user",
        content: "one too many",
        created_at: "2026-08-04T18:41:00.000Z",
        metadata: { channel: "in_app" },
      } as never);
      const dead = await resolveArmedQuestion(db, {
        userId,
        nowIso: "2026-08-04T18:42:00.000Z",
      });
      assertEquals(dead, null, `désarmée au tour ${ARMED_QUESTION_MAX_TURNS}`);
    } finally {
      await cleanup(userId);
    }
  },
});

Deno.test({
  name: "P2 DoD: un nouveau message armé SUPPLANTE l'ancien",
  ignore: SKIP,
  fn: async () => {
    const userId = await makeStudentWithPlan();
    try {
      const db = admin();
      await deliverChatMessage(db, {
        userId,
        content: "Old question?",
        purpose: "keel_daily_pulse",
        buttons: [{ payload: "OLD_A", label: "Old A" }],
        now: new Date("2026-08-04T18:00:00.000Z"),
      });
      await deliverChatMessage(db, {
        userId,
        content: "New question?",
        purpose: "keel_daily_pulse",
        buttons: [{ payload: "NEW_A", label: "New A" }],
        now: new Date("2026-08-04T18:10:00.000Z"),
      });

      const armed = await resolveArmedQuestion(db, {
        userId,
        nowIso: "2026-08-04T18:15:00.000Z",
      });
      assert(armed);
      assertEquals(armed!.content, "New question?", "la plus récente gagne");
      assertEquals(armed!.buttons[0].payload, "NEW_A");
    } finally {
      await cleanup(userId);
    }
  },
});

Deno.test({
  name: "P2 DoD: répondre EXPLICITEMENT à une vieille question la réactive, elle seule",
  ignore: SKIP,
  fn: async () => {
    // Nuance de l'edge case n°3: la règle « la plus récente gagne » vaut pour
    // une réponse LIBRE, où l'on doit deviner ce à quoi l'élève répond. Quand
    // il tape un bouton rendu SOUS un message précis, il n'y a rien à deviner.
    const userId = await makeStudentWithPlan();
    try {
      const db = admin();
      const old = await deliverChatMessage(db, {
        userId,
        content: "Old question?",
        purpose: "keel_daily_pulse",
        buttons: [{ payload: "OLD_A", label: "Old A" }],
        now: new Date("2026-08-04T18:00:00.000Z"),
      });
      await deliverChatMessage(db, {
        userId,
        content: "New question?",
        purpose: "keel_daily_pulse",
        buttons: [{ payload: "NEW_A", label: "New A" }],
        now: new Date("2026-08-04T18:10:00.000Z"),
      });

      const armed = await resolveArmedQuestion(db, {
        userId,
        nowIso: "2026-08-04T18:15:00.000Z",
        replyToMessageId: old.chatMessageId,
      });
      assert(armed);
      assertEquals(armed!.content, "Old question?");
    } finally {
      await cleanup(userId);
    }
  },
});

Deno.test({
  name: "P2 DoD: le cron ne redemande pas — deux ticks, un seul message",
  ignore: SKIP,
  fn: async () => {
    const userId = await makeStudentWithPlan();
    try {
      await runPulse(PULSE_WINDOW_UTC);
      // « une QUESTION par jour. Le silence de l'élève n'autorise pas à
      // redemander à 20h40 puis à 21h40. »
      await runPulse("2026-08-04T19:30:00.000Z");

      const { count } = await admin()
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "assistant");
      assertEquals(count, 1);
    } finally {
      await cleanup(userId);
    }
  },
});

Deno.test({
  name: "P2 DoD: hors fenêtre locale, rien ne part (fuseau respecté)",
  ignore: SKIP,
  fn: async () => {
    // Edge case n°9: un élève à Los Angeles reçoit son checkin à SON soir.
    // 18h30 UTC = 20h30 Paris (envoi) mais 11h30 LA (silence).
    const paris = await makeStudentWithPlan({ timezone: "Europe/Paris" });
    const la = await makeStudentWithPlan({ timezone: "America/Los_Angeles" });
    try {
      await runPulse(PULSE_WINDOW_UTC);
      const db = admin();
      const parisCount = await db.from("chat_messages")
        .select("id", { count: "exact", head: true }).eq("user_id", paris);
      const laCount = await db.from("chat_messages")
        .select("id", { count: "exact", head: true }).eq("user_id", la);
      assertEquals(parisCount.count, 1, "20h30 à Paris: le tap part");
      assertEquals(laCount.count, 0, "11h30 à Los Angeles: silence");

      // Et à 20h30 heure de LA (03h30 UTC le lendemain), c'est l'inverse.
      await runPulse("2026-08-05T03:30:00.000Z");
      const laLater = await db.from("chat_messages")
        .select("id", { count: "exact", head: true }).eq("user_id", la);
      assertEquals(laLater.count, 1, "20h30 à Los Angeles: le tap part");
    } finally {
      await cleanup(paris);
      await cleanup(la);
    }
  },
});

Deno.test({
  name: "P2: le plafond quotidien reste opposable aux relances ordinaires",
  ignore: SKIP,
  fn: async () => {
    const userId = await makeStudentWithPlan();
    try {
      const db = admin();
      for (let i = 0; i < DAILY_UNSOLICITED_CAP; i += 1) {
        const r = await deliverChatMessage(db, {
          userId,
          content: `nudge ${i}`,
          purpose: "keel_nudge",
        });
        assertEquals(r.delivered, true);
      }
      const blocked = await deliverChatMessage(db, {
        userId,
        content: "un de trop",
        purpose: "keel_nudge",
      });
      assertEquals(blocked.delivered, false);
      assertEquals(blocked.reason, "unsolicited_daily_cap");

      // Mais le tap du soir, lui, passe: il RÉSERVE son créneau au lieu d'être
      // refusé par lui.
      const pulse = await deliverChatMessage(db, {
        userId,
        content: "How was today?",
        purpose: "keel_daily_pulse",
      });
      assertEquals(pulse.delivered, true);
    } finally {
      await cleanup(userId);
    }
  },
});
