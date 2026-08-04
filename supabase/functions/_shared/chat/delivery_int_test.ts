// LA LIVRAISON IN-APP CONTRE LA VRAIE BASE.
//
// POURQUOI CE FICHIER EXISTE, EN PLUS DE `delivery_policy_test.ts`
// ---------------------------------------------------------------
// La politique est pure et ses 16 tests sont verts. Ça ne prouve RIEN du
// câblage : c'est exactement le défaut n°1 de ce dépôt (« des sondes vertes sur
// un chemin que la production ne prend pas »), et c'est ainsi que
// `decideDailyPulse` a porté une garde `safety_active` testée et inerte.
//
// Ce que seul le réel prouve ici :
//   * le CHECK `delivery_channel` accepte bien `in_app` (un CHECK trop étroit a
//     déjà tué la question d'axe en silence, cf. migration 20260804090000) ;
//   * `to_e164 = null` passe (la colonne était NOT NULL avant ce chantier) ;
//   * le compteur de plafond relit VRAIMENT ce que la livraison a écrit —
//     la boucle écriture→lecture est la seule chose qui rend un cap réel ;
//   * un refus laisse une ligne `skipped` MOTIVÉE, donc « rien à envoyer » et
//     « tout bloqué » cessent d'être indiscernables.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

import { deliverChatMessage } from "./delivery.ts";
import { DAILY_UNSOLICITED_CAP } from "./delivery_policy.ts";

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;
const MISSING = REQUIRED_ENV.filter((n) =>
  (Deno.env.get(n) ?? "").trim().length === 0
);
const SKIP = MISSING.length > 0;
if (SKIP) {
  console.log(
    `[skip] delivery_int_test.ts: stack Supabase requise — manque: ${MISSING.join(", ")}`,
  );
}

function url() {
  return (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
}

function admin() {
  return createClient(
    url(),
    (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Un élève jetable.
 *
 * PAR `signUp`, ET PAS PAR L'API ADMIN D'AUTH — mesuré ici le 2026-08-04 :
 * `auth.admin.createUser` rend « invalid JWT: signing method HS256 is invalid »
 * de façon INTERMITTENTE sur la stack locale (2 succès sur 8 appels au même
 * run). C'est la mémoire QA « admin API auth locale capricieuse », vérifiée à
 * nouveau.
 *
 * ET SURTOUT: CETTE FONCTION LÈVE AU LIEU DE RENDRE `null`.
 * La version précédente sautait le corps du test quand la création échouait —
 * et les 8 tests s'affichaient VERTS en n'ayant rien exécuté. Un vert vide est
 * pire qu'un rouge : c'est le défaut que ce dépôt collectionne, reproduit dans
 * le fichier censé le débusquer.
 */
async function makeStudent(
  db: ReturnType<typeof admin>,
  patch: Record<string, unknown> = {},
): Promise<string> {
  const anon = createClient(
    url(),
    (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const { data, error } = await anon.auth.signUp({
    email: `dw-delivery-${nonce}@test.dev`,
    password: "1234567",
  });
  if (error || !data.user) {
    throw new Error(`création d'élève impossible: ${error?.message ?? "no user"}`);
  }
  const userId = data.user.id;
  const { error: profileError } = await db.from("profiles").update({
    timezone: "Europe/Paris",
    chat_last_inbound_at: null,
    proactive_muted_at: null,
    deletion_requested_at: null,
    ...patch,
  } as never).eq("id", userId);
  if (profileError) throw profileError;
  // Le profil DOIT exister: `deliverChatMessage` rend `unknown_user` sans lui,
  // et tous les tests deviendraient des vérifications de ce seul cas.
  const { data: check } = await db
    .from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!check) throw new Error(`profil absent pour ${userId} après signUp`);
  return userId;
}

async function cleanup(db: ReturnType<typeof admin>, userId: string) {
  await db.from("outbound_messages").delete().eq("user_id", userId);
  await db.from("chat_messages").delete().eq("user_id", userId);
  await db.auth.admin.deleteUser(userId).catch(() => {});
}

Deno.test({
  name: "réel: un message livré atterrit dans chat_messages ET dans le ledger",
  ignore: SKIP,
  fn: async () => {
    const db = admin();
    const userId = await makeStudent(db);
    try {
      const res = await deliverChatMessage(db, {
        userId,
        content: "Good morning — how did breakfast go?",
        purpose: "keel_daily_pulse",
        requestId: "int-1",
        buttons: [
          { payload: "keel_pulse_level:good", label: "All good" },
          { payload: "keel_pulse_level:hard", label: "Rough" },
        ],
      });
      assertEquals(res.delivered, true);
      assertEquals(res.reason, "guaranteed");
      assert(res.chatMessageId, "un id de message est rendu");
      assert(res.outboundId, "une ligne de ledger est écrite");

      const { data: msg } = await db
        .from("chat_messages")
        .select("scope,role,content,metadata")
        .eq("id", res.chatMessageId!)
        .maybeSingle();
      assertEquals((msg as any)?.scope, "app");
      assertEquals((msg as any)?.role, "assistant");
      assertEquals((msg as any)?.metadata?.channel, "in_app");
      assertEquals((msg as any)?.metadata?.is_proactive, true);
      // Les boutons voyagent AVEC le message: c'est ce qui les rend rejouables
      // au reload, là où un template Meta les perdait.
      assertEquals((msg as any)?.metadata?.buttons?.length, 2);
      assertEquals((msg as any)?.metadata?.buttons?.[0]?.payload, "keel_pulse_level:good");

      const { data: out } = await db
        .from("outbound_messages")
        .select("delivery_channel,to_e164,message_type,status,metadata")
        .eq("id", res.outboundId!)
        .maybeSingle();
      // Les trois assertions que seule la vraie base peut rendre.
      assertEquals((out as any)?.delivery_channel, "in_app");
      assertEquals((out as any)?.to_e164, null);
      assertEquals((out as any)?.message_type, "interactive_buttons");
      assertEquals((out as any)?.status, "sent");
      assertEquals((out as any)?.metadata?.counts_as_unsolicited, true);
    } finally {
      await cleanup(db, userId);
    }
  },
});

Deno.test({
  name: "réel: le plafond mord parce que le compteur RELIT ce qui a été écrit",
  ignore: SKIP,
  fn: async () => {
    const db = admin();
    const userId = await makeStudent(db);
    try {
      // Aucun bilan attendu ⇒ budget plein.
      for (let i = 0; i < DAILY_UNSOLICITED_CAP; i += 1) {
        const res = await deliverChatMessage(db, {
          userId,
          content: `nudge ${i}`,
          purpose: "keel_nudge",
        });
        assertEquals(res.delivered, true, `nudge ${i} doit passer`);
        assertEquals(res.reason, "unsolicited_within_cap");
      }
      const blocked = await deliverChatMessage(db, {
        userId,
        content: "un nudge de trop",
        purpose: "keel_nudge",
      });
      assertEquals(blocked.delivered, false);
      assertEquals(blocked.reason, "unsolicited_daily_cap");

      // LE REFUS EST CONSIGNÉ, MOTIVÉ. Sans cette ligne, « rien à envoyer » et
      // « tout bloqué » sont le même silence dans la base.
      assert(blocked.outboundId, "un refus écrit quand même au ledger");
      const { data: skipped } = await db
        .from("outbound_messages")
        .select("status,last_error_code,metadata")
        .eq("id", blocked.outboundId!)
        .maybeSingle();
      assertEquals((skipped as any)?.status, "skipped");
      assertEquals((skipped as any)?.last_error_code, "unsolicited_daily_cap");
      assertEquals((skipped as any)?.metadata?.counts_as_unsolicited, false);

      // Et le refus n'a créé AUCUN message visible.
      const { count } = await db
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      assertEquals(count, DAILY_UNSOLICITED_CAP);
    } finally {
      await cleanup(db, userId);
    }
  },
});

Deno.test({
  name: "réel: un bilan garanti passe MÊME quand le plafond est saturé",
  ignore: SKIP,
  fn: async () => {
    const db = admin();
    const userId = await makeStudent(db);
    try {
      for (let i = 0; i < DAILY_UNSOLICITED_CAP; i += 1) {
        await deliverChatMessage(db, { userId, content: `n${i}`, purpose: "keel_nudge" });
      }
      const pulse = await deliverChatMessage(db, {
        userId,
        content: "How did today go?",
        purpose: "keel_daily_pulse",
      });
      assertEquals(pulse.delivered, true);
      assertEquals(pulse.reason, "guaranteed");
    } finally {
      await cleanup(db, userId);
    }
  },
});

Deno.test({
  name: "réel: muté ⇒ le proactif s'arrête, la réponse passe toujours",
  ignore: SKIP,
  fn: async () => {
    const db = admin();
    const userId = await makeStudent(db, {
      proactive_muted_at: new Date().toISOString(),
    });
    try {
      const nudge = await deliverChatMessage(db, {
        userId,
        content: "How did today go?",
        purpose: "keel_daily_pulse",
      });
      assertEquals(nudge.delivered, false);
      assertEquals(nudge.reason, "muted");

      const reply = await deliverChatMessage(db, {
        userId,
        content: "Here is what I think.",
        isReply: true,
      });
      assertEquals(reply.delivered, true);
      assertEquals(reply.reason, "reply");
      assert(reply.chatMessageId);
    } finally {
      await cleanup(db, userId);
    }
  },
});

Deno.test({
  name: "réel: une réponse ne consomme PAS de créneau proactif",
  ignore: SKIP,
  fn: async () => {
    const db = admin();
    const userId = await makeStudent(db);
    try {
      for (let i = 0; i < 5; i += 1) {
        const r = await deliverChatMessage(db, {
          userId,
          content: `réponse ${i}`,
          isReply: true,
        });
        assertEquals(r.delivered, true);
      }
      // Le budget non sollicité est intact après 5 réponses.
      const nudge = await deliverChatMessage(db, {
        userId,
        content: "un nudge",
        purpose: "keel_nudge",
      });
      assertEquals(nudge.delivered, true);
      assertEquals(nudge.reason, "unsolicited_within_cap");
    } finally {
      await cleanup(db, userId);
    }
  },
});

Deno.test({
  name: "réel: prémisse fausse — un élève inexistant ne produit ni message ni ledger",
  ignore: SKIP,
  fn: async () => {
    const db = admin();
    const ghost = "00000000-0000-4000-8000-000000000000";
    const res = await deliverChatMessage(db, {
      userId: ghost,
      content: "hello?",
      purpose: "keel_nudge",
    });
    assertEquals(res.delivered, false);
    assertEquals(res.reason, "unknown_user");
    assertEquals(res.outboundId, null);
    const { count } = await db
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ghost);
    assertEquals(count, 0);
  },
});

Deno.test({
  name: "réel: CONCURRENCE — le plafond tient sous fan-out simultané",
  ignore: SKIP,
  fn: async () => {
    const db = admin();
    const userId = await makeStudent(db);
    try {
      // Pattern (b) du gantelet, et LE test qui a trouvé un vrai défaut.
      //
      // Avant `claim_in_app_outbound`, ce cas rendait 6/6 livrés pour un
      // plafond de 2 : les six lectures voyaient « 0 envoyé » avant que la
      // première écriture n'atterrisse. Le plafond n'était pas approximatif,
      // il était inexistant dès qu'il y avait de la concurrence — c'est-à-dire
      // dans le mode normal d'un fan-out de cron.
      //
      // Il n'y a pas de tolérance ici. Un anti-spam qui laisse passer « un de
      // plus » à chaque tick ne borne rien.
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          deliverChatMessage(db, {
            userId,
            content: `concurrent ${i}`,
            purpose: "keel_nudge",
          })),
      );
      const delivered = results.filter((r) => r.delivered).length;
      assertEquals(
        delivered,
        DAILY_UNSOLICITED_CAP,
        `${delivered} livrés sur 6 simultanés, plafond ${DAILY_UNSOLICITED_CAP}`,
      );

      // Les refusés le sont pour un motif HONNÊTE. `delivery_claim_failed` est
      // toléré ici et PAS confondu avec le plafond : sous six appels RPC
      // simultanés, Kong rend parfois un 502 (« invalid response from upstream
      // server »), et consigner ça comme « plafond atteint » serait un mensonge
      // dans le ledger. Ce qui n'est PAS toléré, c'est une livraison de trop.
      const rejected = results.filter((r) => !r.delivered);
      assertEquals(rejected.length, 6 - DAILY_UNSOLICITED_CAP);
      for (const r of rejected) {
        assert(
          r.reason === "unsolicited_daily_cap" ||
            r.reason === "delivery_claim_failed",
          `motif de refus inattendu: ${r.reason}`,
        );
      }

      // Et surtout: la bulle de l'élève ne contient que les messages livrés.
      // C'est ce que la réservation-avant-écriture garantit.
      const { count } = await db
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      assertEquals(count, DAILY_UNSOLICITED_CAP);

      // Le ledger ne compte pas non plus plus de créneaux qu'il n'en a donné.
      const { count: sentRows } = await db
        .from("outbound_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "sent");
      assertEquals(sentRows, DAILY_UNSOLICITED_CAP);
    } finally {
      await cleanup(db, userId);
    }
  },
});

Deno.test({
  name: "réel: état composé périmé ⇒ refus motivé, aucun créneau consommé",
  ignore: SKIP,
  fn: async () => {
    const db = admin();
    const userId = await makeStudent(db);
    try {
      const stale = await deliverChatMessage(db, {
        userId,
        content: "Rappel pour un plan archivé",
        purpose: "keel_slot_reminder",
        composedStateStillValid: false,
      });
      assertEquals(stale.delivered, false);
      assertEquals(stale.reason, "composed_state_stale");

      // Le budget est INTACT: un message qui ne devait pas partir ne doit pas
      // avoir coûté un créneau à celui qui devait.
      for (let i = 0; i < DAILY_UNSOLICITED_CAP; i += 1) {
        const r = await deliverChatMessage(db, {
          userId,
          content: `n${i}`,
          purpose: "keel_nudge",
        });
        assertEquals(r.delivered, true, `le créneau ${i} est resté libre`);
      }
    } finally {
      await cleanup(db, userId);
    }
  },
});
