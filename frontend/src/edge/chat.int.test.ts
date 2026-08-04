// LE CANAL IN-APP, VU DEPUIS LE FRONTEND — successeur de `whatsapp.int.test.ts`.
//
// ── LA COUVERTURE MIGRE AVEC LE CONCEPT ──────────────────────────────────────
// Le fichier remplacé portait 9 cas sur `whatsapp-webhook` et `whatsapp-send`.
// Chacun gardait une règle; voici où chaque règle a atterri, et pourquoi :
//
//   1. handshake GET + signature X-Hub → MORT. Il n'y a plus de webhook tiers.
//      Ce qui le remplace est l'authentification de l'ÉLÈVE: un POST sans JWT
//      ne joue pas de tour. → testé ici (`401`).
//   2. STOP ⇒ opt-out                  → devient le mute produit, qui coupe le
//      proactif et JAMAIS la réponse. → `delivery_policy_test.ts` +
//      `proactive_int_test.ts` (côté Deno, avec la base réelle).
//   3. wrong-number / LINK:<token>     → MORTS. Ils existaient parce qu'un
//      numéro pouvait écrire sans compte; l'élève est maintenant le porteur
//      d'un JWT, il n'y a plus rien à relier.
//   4. idempotence sur `wa_message_id` → devient `(user_id, client_message_id)`.
//      → testé ici, ET côté Deno sous concurrence.
//   5. `require_opted_in` ⇒ 409        → devient le mute. Voir 2.
//   6. throttle proactif ⇒ 429         → devient le plafond quotidien, rendu
//      ATOMIQUE. → `delivery_int_test.ts` (6 envois simultanés, plafond tenu).
//
// Ce qui reste ICI est ce que seul le frontend peut garder: le contrat HTTP que
// `keel/api/chat.ts` appelle réellement. Une dérive entre l'app et la fonction
// ne se voit ni dans les tests Deno ni au typecheck.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAuthedTestUser,
  createServiceRoleClient,
  HAS_SUPABASE_TEST_ENV,
} from "../test/supabaseTestUtils";

const BASE_URL = process.env.VITE_SUPABASE_URL;

function mustGetBaseUrl() {
  if (!BASE_URL) throw new Error("Missing VITE_SUPABASE_URL for chat integration tests");
  return BASE_URL;
}

async function postInbound(
  accessToken: string | null,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.VITE_SUPABASE_ANON_KEY) {
    headers.apikey = process.env.VITE_SUPABASE_ANON_KEY;
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${mustGetBaseUrl()}/functions/v1/chat-inbound-v1`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

describe.skipIf(!HAS_SUPABASE_TEST_ENV)("chat-inbound-v1 (contrat HTTP vu du frontend)", () => {
  let userId: string;
  let client: SupabaseClient;
  let admin: SupabaseClient;
  let accessToken: string;

  beforeEach(async () => {
    const res = await createAuthedTestUser();
    userId = res.userId;
    client = res.client;
    admin = createServiceRoleClient();
    const { data } = await client.auth.getSession();
    accessToken = data.session?.access_token ?? "";
    await admin.from("profiles").update({ keel_role: "student" }).eq("id", userId);
  });

  afterEach(async () => {
    try {
      await admin.from("inbound_dedup").delete().eq("user_id", userId);
      await admin.from("outbound_messages").delete().eq("user_id", userId);
      await admin.from("chat_messages").delete().eq("user_id", userId);
      await admin.from("pending_actions").delete().eq("user_id", userId);
      await client.auth.signOut();
    } catch {
      // ignore
    }
  });

  it("sans JWT, aucun tour n'est joué", async () => {
    // Le descendant direct de « signature invalide ⇒ 403 ». La frontière a
    // changé de nature (l'appelant EST l'élève), la règle non.
    const res = await postInbound(null, {
      client_message_id: crypto.randomUUID(),
      kind: "text",
      text: "hello",
    });
    expect(res.status).toBe(401);

    const { count } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(count).toBe(0);
  });

  it("un corps invalide est refusé AVEC son motif, jamais un 200 vide", async () => {
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ kind: "text", text: "x" }, 400, "missing_client_message_id"],
      [{ client_message_id: crypto.randomUUID() }, 400, "missing_kind"],
      [{ client_message_id: crypto.randomUUID(), kind: "text" }, 400, "text_empty"],
    ];
    for (const [body, status, reason] of cases) {
      const res = await postInbound(accessToken, body);
      expect(res.status, reason).toBe(status);
      expect(res.json?.error).toBe(reason);
    }
  });

  it("idempotence: le même client_message_id rejoué ne joue qu'un tour", async () => {
    // Le descendant de « idempotent on wa_message_id ». On passe par un bouton
    // déterministe: il ne touche aucun modèle, donc le test reste rapide et ne
    // dépend d'aucune clé d'API.
    const body = {
      client_message_id: crypto.randomUUID(),
      kind: "button",
      button_payload: "KEEL_PULSE_GOOD",
      text: "All good",
    };
    const first = await postInbound(accessToken, body);
    const replay = await postInbound(accessToken, body);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    // 200 et pas 409: côté client, un rejeu réussi et un rejeu ignoré doivent
    // être indiscernables, sinon le client réessaie encore.
    expect(replay.json?.duplicate).toBe(true);

    const { count } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user");
    expect(count).toBe(1);
  });

  it("le scope écrit est celui que la bulle lit", async () => {
    // Le contrat que seul ce test garde: `keel/api/chat.ts` filtre sur
    // `scope = 'app'`. Si le serveur écrivait ailleurs, l'élève verrait une
    // bulle vide alors que la base est pleine — et aucun test Deno ne le
    // remarquerait, puisqu'ils interrogent la base directement.
    await postInbound(accessToken, {
      client_message_id: crypto.randomUUID(),
      kind: "button",
      button_payload: "KEEL_PULSE_GOOD",
      text: "All good",
    });
    const { data } = await admin
      .from("chat_messages")
      .select("scope,metadata")
      .eq("user_id", userId)
      .eq("role", "user")
      .maybeSingle();
    expect((data as { scope?: string } | null)?.scope).toBe("app");
    expect(
      (data as { metadata?: Record<string, unknown> } | null)?.metadata?.channel,
    ).toBe("in_app");
  });
});
