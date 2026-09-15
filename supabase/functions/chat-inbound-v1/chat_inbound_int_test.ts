// `chat-inbound-v1` — LE CHEMIN ENTRANT, CONTRE LA VRAIE FONCTION.
//
// POURQUOI CES TESTS PASSENT PAR HTTP ET PAS PAR IMPORT
// -----------------------------------------------------
// Importer le handler et l'appeler en mémoire testerait tout SAUF ce qui casse
// : la passerelle, le JWT, la RLS, le CHECK d'une colonne, un `handleCorsOptions`
// appelé sans garde. Ce dernier est un cas réel de ce dépôt — toutes les
// requêtes recevaient un « ok » de 2 octets, `deno check` était vert, les tests
// étaient verts, et la fonction ne tournait jamais. Il n'a été trouvé qu'en
// curlant.
//
// Les tours qui traversent le moteur (`processMessage`) appellent un vrai
// modèle : ils sont derrière `CHAT_INBOUND_E2E=1` pour que la suite ordinaire
// reste gratuite et rapide. Les gardes, elles, sont testées SANS modèle — et ce
// sont elles qui portent les 7 patterns adversariaux.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

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
    `[skip] chat_inbound_int_test.ts: stack requise — manque: ${MISSING.join(", ")}`,
  );
}
/** Les tours qui appellent un vrai modèle. Coûteux: explicitement opt-in. */
const E2E = (Deno.env.get("CHAT_INBOUND_E2E") ?? "").trim() === "1";

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

function admin() {
  return createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Student = { id: string; accessToken: string };

async function makeStudent(): Promise<Student> {
  const anon = createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const { data, error } = await anon.auth.signUp({
    email: `dw-inbound-${nonce}@test.dev`,
    password: "1234567",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`signUp failed: ${error?.message ?? "no session"}`);
  }
  const db = admin();
  const { error: upErr } = await db.from("profiles").update({
    keel_role: "student",
    timezone: "Europe/Paris",
    country: "GB",
    chat_last_inbound_at: null,
    proactive_muted_at: null,
    deletion_requested_at: null,
  } as never).eq("id", data.user.id);
  if (upErr) throw upErr;
  return { id: data.user.id, accessToken: data.session.access_token };
}

async function cleanup(userId: string) {
  const db = admin();
  await db.from("inbound_dedup").delete().eq("user_id", userId);
  await db.from("outbound_messages").delete().eq("user_id", userId);
  await db.from("chat_messages").delete().eq("user_id", userId);
  await db.from("student_daily_checkins").delete().eq("user_id", userId);
  await db.auth.admin.deleteUser(userId).catch(() => {});
}

async function post(
  token: string | null,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${URL_BASE}/functions/v1/chat-inbound-v1`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: await res.json().catch(() => null) as Record<string, unknown> | null,
  };
}

function uid() {
  return crypto.randomUUID();
}

// ── AUTHENTIFICATION ────────────────────────────────────────────────────────

Deno.test({
  name: "http: sans jeton ⇒ 401, et rien n'est écrit",
  ignore: SKIP,
  fn: async () => {
    const res = await post(null, { client_message_id: uid(), kind: "text", text: "hi" });
    assertEquals(res.status, 401);
  },
});

Deno.test({
  name: "http: GET et OPTIONS — la méthode est gardée, le préflight répond",
  ignore: SKIP,
  fn: async () => {
    const get = await fetch(`${URL_BASE}/functions/v1/chat-inbound-v1`, {
      method: "GET",
      headers: { apikey: ANON },
    });
    // 401 (passerelle) ou 405 (fonction) : les deux refusent. Ce qui compte est
    // qu'un GET ne joue JAMAIS un tour.
    assert(get.status === 401 || get.status === 405, `GET a rendu ${get.status}`);
    await get.body?.cancel();
  },
});

// ── LE CONTRAT (pattern (g): pas de défaut silencieux) ──────────────────────

Deno.test({
  name: "http: un corps invalide est refusé avec SON motif, pas un 200 vide",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    try {
      const cases: Array<[unknown, number, string]> = [
        [{}, 400, "missing_client_message_id"],
        [{ client_message_id: uid() }, 400, "missing_kind"],
        [{ client_message_id: uid(), kind: "voice", text: "x" }, 400, "unknown_kind"],
        [{ client_message_id: uid(), kind: "text" }, 400, "text_empty"],
        [{ client_message_id: uid(), kind: "text", text: "x", button_payload: "B" }, 400, "text_with_button_payload"],
        [{ client_message_id: uid(), kind: "button" }, 400, "button_missing_payload"],
        [
          {
            client_message_id: uid(),
            kind: "media",
            media_ref: { path: "a.pdf", content_type: "application/pdf", size_bytes: 10 },
          },
          415,
          "media_ref_unsupported_content_type",
        ],
        [
          {
            client_message_id: uid(),
            kind: "media",
            media_ref: { path: "a.jpg", content_type: "image/jpeg", size_bytes: 99_000_000 },
          },
          413,
          "media_ref_too_large",
        ],
      ];
      for (const [body, status, reason] of cases) {
        const res = await post(student.accessToken, body);
        assertEquals(res.status, status, `${reason}: statut`);
        assertEquals(res.json?.error, reason);
      }

      // AUCUN de ces refus n'a laissé de trace de conversation.
      const db = admin();
      const { count } = await db
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id);
      assertEquals(count, 0, "un corps refusé n'écrit rien");
    } finally {
      await cleanup(student.id);
    }
  },
});

// ── PRÉMISSE FAUSSE (a) : le compte n'existe plus ───────────────────────────

Deno.test({
  name: "http: élève en cours de suppression ⇒ 410, pas de tour fantôme",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    try {
      const db = admin();
      await db.from("profiles").update({
        deletion_requested_at: new Date().toISOString(),
      } as never).eq("id", student.id);

      const res = await post(student.accessToken, {
        client_message_id: uid(),
        kind: "text",
        text: "hello?",
      });
      assertEquals(res.status, 410);

      const { count } = await db
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id);
      assertEquals(count, 0);
    } finally {
      await cleanup(student.id);
    }
  },
});

Deno.test({
  name: "http: profil purgé mais JWT encore valide ⇒ 410",
  ignore: SKIP,
  fn: async () => {
    // Edge case n°5. Le JWT survit à la ligne `profiles` (il est valide jusqu'à
    // son expiration): l'existence se VÉRIFIE, elle ne se déduit pas de
    // l'authentification.
    const student = await makeStudent();
    try {
      await admin().from("profiles").delete().eq("id", student.id);
      const res = await post(student.accessToken, {
        client_message_id: uid(),
        kind: "text",
        text: "still there?",
      });
      assertEquals(res.status, 410);
    } finally {
      await cleanup(student.id);
    }
  },
});

// ── REJEU / IDEMPOTENCE (c) ─────────────────────────────────────────────────

Deno.test({
  name: "http: BOUTON déterministe — un seul tour, écriture réelle, accusé livré",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    try {
      const clientId = uid();
      // ⟳ LA CHARGE A CHANGÉ DE FAMILLE, PAS LE TEST DE SENS. Elle était
      // `KEEL_PULSE_HARD`, et le pouls du soir est DÉSARMÉ depuis le
      // 2026-09-07 (`DETERMINISTIC_BUTTON_PREFIXES`, ligne annotée): il n'a
      // plus de lecteur, donc plus d'écriture à observer. Ce test-ci est le
      // seul à prouver qu'un tap traverse HTTP et touche la base; le laisser
      // sur une famille morte le rendait rouge en disant « le produit est
      // cassé », ce qui est faux, et le réparer en retirant l'assertion
      // d'écriture aurait perdu la seule couverture de bout en bout.
      //
      // `KEEL_SLOTMEAL_mute` est choisi parce qu'il écrit une colonne du
      // produit (`profiles.slot_meal_ask_enabled`) SANS aucune fixture: les
      // autres familles armées exigent un plan, un repas ou une série de
      // poids, et un test de transport ne doit pas dépendre d'un générateur.
      const today = new Date().toISOString().slice(0, 10);
      const body = {
        client_message_id: clientId,
        kind: "button",
        button_payload: `KEEL_SLOTMEAL_mute|${today}|dinner`,
        text: "Ne plus me demander à chaque repas",
      };

      const first = await post(student.accessToken, body);
      assertEquals(first.status, 200);
      assertEquals(first.json?.handled_by, "keel_slot_meal_mute");

      // LE REJEU: même corps, même id ⇒ pas de second tour.
      const replay = await post(student.accessToken, body);
      assertEquals(replay.status, 200);
      assertEquals(replay.json?.duplicate, true);

      const db = admin();
      // Un seul entrant journalisé.
      const { count: inbound } = await db
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id)
        .eq("role", "user");
      assertEquals(inbound, 1, "le rejeu n'a pas rejoué le tour");

      // Le tap a RÉELLEMENT écrit dans la table du produit.
      const { data: profile } = await db
        .from("profiles")
        .select("slot_meal_ask_enabled")
        .eq("id", student.id)
        .maybeSingle();
      assertEquals(
        (profile as { slot_meal_ask_enabled?: boolean | null } | null)
          ?.slot_meal_ask_enabled,
        false,
        "l'extinction est en base, pas seulement dans l'accusé",
      );

      // Et l'élève a reçu son accusé — l'écriture se DIT, c'est le pilier.
      const { data: replies } = await db
        .from("chat_messages")
        .select("content,metadata")
        .eq("user_id", student.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: true });
      const rows = (replies ?? []) as Array<
        { content: string; metadata: Record<string, unknown> }
      >;
      assertEquals(rows.length, 1, "un accusé, et un seul");
      assert(rows[0].content.trim().length > 0, "l'accusé porte du texte");
    } finally {
      await cleanup(student.id);
    }
  },
});

Deno.test({
  name: "http: BOUTON d'une famille DÉSARMÉE — accusé honnête, zéro écriture",
  ignore: SKIP,
  fn: async () => {
    // L'AUTRE MOITIÉ DU DÉSARMEMENT, ET ELLE N'ÉTAIT TESTÉE QUE PURE.
    // `disarmed_families_wiring_test.ts` prouve qu'aucun lecteur n'est câblé
    // sur `KEEL_PULSE_`; il ne prouve pas ce que la personne REÇOIT. Or les
    // bulles déjà envoyées portent encore ces boutons, et un tap dessus ne
    // doit ni écrire, ni descendre au dispatcher — une charge qu'on n'a pas
    // su lire n'est pas une phrase d'élève (garde terminale du module).
    const student = await makeStudent();
    try {
      const res = await post(student.accessToken, {
        client_message_id: uid(),
        kind: "button",
        button_payload: "KEEL_PULSE_HARD",
        text: "Rough",
      });
      assertEquals(res.status, 200);
      assertEquals(res.json?.handled_by, "keel_unusable_button_payload");

      const db = admin();
      const { count: checkins } = await db
        .from("student_daily_checkins")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", student.id);
      assertEquals(checkins, 0, "un tap désarmé n'écrit rien");

      const { data: replies } = await db
        .from("chat_messages")
        .select("content")
        .eq("user_id", student.id)
        .eq("role", "assistant");
      const rows = (replies ?? []) as Array<{ content: string }>;
      assertEquals(rows.length, 1, "la personne est prévenue, une fois");
      // Le texte exact importe: il dit « rien n'a été enregistré ». Un accusé
      // qui laisserait croire à une écriture serait un `phantom_commit`.
      assert(
        /rien n'a été enregistré|nothing has been saved/.test(rows[0].content),
        `l'accusé doit dire que rien n'est écrit — reçu: ${rows[0].content}`,
      );
    } finally {
      await cleanup(student.id);
    }
  },
});

Deno.test({
  name: "http: CONCURRENCE — deux POST identiques simultanés ⇒ un seul tour",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    try {
      // Pattern (b) + (c) ensemble: un client qui retente pendant que le
      // premier appel est encore en vol. Un « SELECT puis INSERT » laisserait
      // passer les deux.
      const body = {
        client_message_id: uid(),
        kind: "button",
        button_payload: "KEEL_PULSE_GOOD",
        text: "All good",
      };
      const [a, b] = await Promise.all([
        post(student.accessToken, body),
        post(student.accessToken, body),
      ]);
      assertEquals(a.status, 200);
      assertEquals(b.status, 200);
      const duplicates = [a, b].filter((r) => r.json?.duplicate === true).length;
      assertEquals(duplicates, 1, "exactement un des deux est un doublon");

      const { count } = await admin()
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id)
        .eq("role", "user");
      assertEquals(count, 1);
    } finally {
      await cleanup(student.id);
    }
  },
});

Deno.test({
  name: "http: le même client_message_id chez DEUX élèves ne bloque personne",
  ignore: SKIP,
  fn: async () => {
    // LE défaut que la table neuve existe pour éviter: avec un UNIQUE global
    // hérité de `wamid_in`, le second élève aurait reçu un 23505 et son message
    // aurait été silencieusement jeté.
    const a = await makeStudent();
    const b = await makeStudent();
    try {
      const shared = "collision-1";
      const body = {
        client_message_id: shared,
        kind: "button",
        button_payload: "KEEL_PULSE_GOOD",
        text: "All good",
      };
      const first = await post(a.accessToken, body);
      const second = await post(b.accessToken, body);
      assertEquals(first.status, 200);
      assertEquals(second.status, 200);
      assertEquals(first.json?.duplicate, undefined);
      assertEquals(second.json?.duplicate, undefined);

      const db = admin();
      for (const student of [a, b]) {
        const { count } = await db
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", student.id)
          .eq("role", "user");
        assertEquals(count, 1, `l'élève ${student.id} a bien été entendu`);
      }
    } finally {
      await cleanup(a.id);
      await cleanup(b.id);
    }
  },
});

// ── LANGUE (d) : FR et EN, jamais une seule ─────────────────────────────────

Deno.test({
  name: "http: un formulaire hebdo au jeton illisible ne descend PAS chez le classifieur",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    try {
      const res = await post(student.accessToken, {
        client_message_id: uid(),
        kind: "form",
        form_response: { energy: 4, sleep: 3 },
        form_token: "n'importe quoi",
      });
      assertEquals(res.status, 200);
      assertEquals(res.json?.handled_by, "weekly_flow_unusable_token");

      // L'élève reçoit un aveu honnête, PAS une conversation sur du JSON.
      const { data } = await admin()
        .from("chat_messages")
        .select("content")
        .eq("user_id", student.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const content = String((data as { content?: string } | null)?.content ?? "");
      assert(
        content.toLowerCase().includes("couldn't save"),
        `aveu attendu, reçu: ${content}`,
      );
    } finally {
      await cleanup(student.id);
    }
  },
});

// ── LE TOUR COMPLET (coûteux, opt-in) ───────────────────────────────────────

Deno.test({
  name: "e2e: un message texte traverse le moteur et revient dans la bulle",
  ignore: SKIP || !E2E,
  fn: async () => {
    const student = await makeStudent();
    try {
      const res = await post(student.accessToken, {
        client_message_id: uid(),
        kind: "text",
        text: "Hi Sophia, quick question about breakfast.",
      });
      assertEquals(res.status, 200, JSON.stringify(res.json));
      assertEquals(res.json?.ok, true);
      assertEquals(res.json?.delivered, true);
      assertEquals(res.json?.delivery_reason, "reply");

      const db = admin();
      const { data } = await db
        .from("chat_messages")
        .select("role,content,scope,metadata")
        .eq("user_id", student.id)
        .order("created_at", { ascending: true });
      const rows = (data ?? []) as Array<
        { role: string; content: string; scope: string; metadata: Record<string, unknown> }
      >;
      assertEquals(rows.length, 2, "un entrant + une réponse, jamais un doublon");
      assertEquals(rows[0].role, "user");
      assertEquals(rows[0].scope, "app");
      assertEquals(rows[0].metadata.channel, "in_app");
      assertEquals(rows[1].role, "assistant");
      assert(rows[1].content.trim().length > 0, "la réponse n'est pas vide");
      assertEquals(rows[1].metadata.channel, "in_app");
      assertEquals(rows[1].metadata.is_proactive, false);

      // La présence est rafraîchie AVANT tout routage.
      const { data: profile } = await db
        .from("profiles")
        .select("chat_last_inbound_at")
        .eq("id", student.id)
        .maybeSingle();
      assert(
        (profile as { chat_last_inbound_at?: string | null } | null)?.chat_last_inbound_at,
        "chat_last_inbound_at est renseigné",
      );
    } finally {
      await cleanup(student.id);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// LE REPAS TAPÉ EN TEXTE LIBRE — ON REND LA MAIN, ET ON N'ÉCRIT RIEN
// ────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ LE CRÉNEAU EST NOMMÉ DANS LA PHRASE, EXPRÈS. Sans « ce midi », le créneau
 * viendrait de l'heure qu'il est au moment du test — et l'épreuve dirait des
 * choses différentes à 13 h et à 20 h, quand elle ne dirait pas « aucun
 * créneau » à 3 h du matin. Ce qu'on vérifie ici est le TRANSPORT et le zéro
 * écriture; la table des heures est éprouvée à part, en pur.
 */
Deno.test({
  name: "http: REPAS TAPÉ — deux boutons, et AUCUNE ligne écrite",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    const db = admin();
    try {
      const res = await post(student.accessToken, {
        client_message_id: uid(),
        kind: "text",
        // 🔴 « pizza » N'EST DANS AUCUNE ENTRÉE DU LEXIQUE FERMÉ. C'est
        // délibéré: si cette phrase-là rend la main, c'est bien la PORTE du
        // plancher qui arme la lane, et pas son lexique.
        text: "j'ai mangé une pizza ce midi",
      });
      assertEquals(res.status, 200);
      assertEquals(res.json?.handled_by, "keel_meal_text_redirect");

      // ── LE CŒUR DE LA DÉCISION: ZÉRO FAIT ─────────────────────────────
      //
      // Le tour s'arrête AVANT le moteur, donc le plancher ne tourne pas. Si
      // cette assertion tombe, la personne aura deux lignes pour un repas dès
      // qu'elle touchera un des deux boutons — celle-ci, muette, et celle du
      // bouton, complète.
      const { count: facts } = await db
        .from("protocol_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id);
      assertEquals(facts, 0, "rendre la main n'écrit AUCUN fait");

      // ── LA BULLE, ET SES DEUX BOUTONS ─────────────────────────────────
      const { data: replies } = await db
        .from("chat_messages")
        .select("content,metadata")
        .eq("user_id", student.id)
        .eq("role", "assistant");
      const rows = (replies ?? []) as Array<
        { content: string; metadata: Record<string, unknown> }
      >;
      assertEquals(rows.length, 1, "une bulle, et une seule");
      assertEquals(rows[0].metadata?.purpose, "keel_meal_text_redirect");
      assert(
        rows[0].content.includes("déjeuner"),
        `la bulle doit NOMMER le repas dont elle parle — reçu: ${
          rows[0].content
        }`,
      );

      // ⚠️ `chat_messages.metadata.buttons` porte les OBJETS `{payload,label}`,
      // là où le ledger `outbound_messages` n'en garde que les charges. C'est
      // la forme que relit `slotsAskedToday`, et s'en écarter ici ferait passer
      // une épreuve sur une structure que la production n'écrit pas.
      const buttons = (rows[0].metadata?.buttons ?? []) as Array<
        { payload?: unknown }
      >;
      assertEquals(
        buttons.map((b) => String(b?.payload)).sort(),
        [
          // Le créneau NOMMÉ dans la phrase voyage dans les deux jetons: rien
          // en aval n'aura à le deviner une seconde fois.
          "KEEL_SLOTMEAL_describe|" + parisToday() + "|lunch",
          "KEEL_SLOTMEAL_photo|" + parisToday() + "|lunch",
        ].sort(),
      );
    } finally {
      await db.from("protocol_events").delete().eq("user_id", student.id);
      await cleanup(student.id);
    }
  },
});

/** Le jour local de l'élève de test, qui est à Europe/Paris (`makeStudent`). */
function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.test({
  name: "http: UNE QUESTION descend au moteur — elle n'est pas redirigée",
  ignore: SKIP,
  fn: async () => {
    // ⛔ CE QUE CETTE ÉPREUVE PROTÈGE EST UNE CONVERSATION. La lane REMPLACE la
    // réponse: si elle mordait sur les questions, « j'ai mangé une pizza,
    // c'est grave ? » recevrait deux boutons et aucune réponse.
    //
    // ⚠️ ON N'ASSERTE PAS CE QUE LE MOTEUR RÉPOND — il coûte un appel modèle
    // et il a son épreuve `e2e` dédiée. On asserte seulement que ce n'est PAS
    // nous qui avons pris le tour.
    const student = await makeStudent();
    const db = admin();
    try {
      const res = await post(student.accessToken, {
        client_message_id: uid(),
        kind: "text",
        text: "j'ai mangé une pizza ce midi, c'est grave ?",
      });
      assert(
        res.json?.handled_by !== "keel_meal_text_redirect",
        "une question doit descendre au moteur",
      );
    } finally {
      await db.from("protocol_events").delete().eq("user_id", student.id);
      await cleanup(student.id);
    }
  },
});
