// LA PHOTO DANS LA CONVERSATION — la couture `meal-photo-upload-v1` → bulle.
//
// CE QUE CES TESTS PROTÈGENT
// -------------------------
// La photo garde UN SEUL chemin d'upload. C'est l'arbitrage W1 : il n'existe
// aucune policy sur `storage.objects`, donc le navigateur ne peut pas toucher
// le bucket, et chaque accès fichier est une edge function en service_role qui
// a déjà vérifié la propriété. Un second chemin « pour la bulle »
// contournerait la vérification par octets magiques ET le calcul de la date
// locale côté serveur — les deux gardes que cette fonction existe pour tenir.
//
// Les tests ci-dessous vérifient donc que la bulle passe par LÀ, et que la
// couture n'a pas affaibli ce qui existait.

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
    `[skip] chat_seam_int_test.ts: stack requise — manque: ${MISSING.join(", ")}`,
  );
}

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

function admin() {
  return createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Un PNG 1×1 valide, en base64.
 *
 * VALIDE, et c'est le point: la fonction vérifie le type par OCTETS MAGIQUES et
 * non par l'en-tête déclaré. Un base64 bidon serait refusé pour la bonne
 * raison, et le test ne prouverait rien de la couture.
 */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Le même contenu, annoncé comme une image mais qui n'en est pas une. */
const NOT_AN_IMAGE = btoa("%PDF-1.4 this is definitely not a png");

type Student = { id: string; token: string };

async function makeStudent(): Promise<Student> {
  const anon = createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const { data, error } = await anon.auth.signUp({
    email: `dw-photo-${nonce}@test.dev`,
    password: "1234567",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`signUp: ${error?.message ?? "no session"}`);
  }
  const { error: pErr } = await admin().from("profiles").update({
    keel_role: "student",
    timezone: "Europe/Paris",
    country: "GB",
  } as never).eq("id", data.user.id);
  if (pErr) throw pErr;
  return { id: data.user.id, token: data.session.access_token };
}

/**
 * Un plan PUBLIÉ — c'est-à-dire le mode 1:1, celui que le modèle KEEL n'utilise
 * pas mais que le dépôt garde exprès (docs/keel/MODEL.md).
 *
 * La photo n'en a PLUS besoin: le fuseau se replie sur `profiles.timezone` et
 * rien n'est comparé à une ligne prescrite. Les cas qui l'appellent encore sont
 * ceux qui exercent ce mode-là; le cas SANS plan est un test à part entière,
 * plus bas, et c'est lui qui décrit le modèle réel.
 */
async function publishPlan(userId: string): Promise<string> {
  // `coach_id` est NOT NULL: un plan sans coach n'existe pas dans ce modèle.
  // On en fabrique un jetable plutôt que de réutiliser un coach réel de la base
  // locale — un test qui s'accroche à des données qu'il n'a pas créées finit
  // par échouer pour une raison qui n'a rien à voir avec lui.
  const anon = createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  const { data, error: coachErr } = await anon.auth.signUp({
    email: `dw-photo-coach-${nonce}@test.dev`,
    password: "1234567",
  });
  if (coachErr || !data.user) {
    throw new Error(`coach signUp: ${coachErr?.message ?? "no user"}`);
  }
  const coachId = data.user.id;
  const { error } = await admin().from("plan_versions").insert({
    coach_id: coachId,
    student_id: userId,
    status: "published",
    title: "Test plan",
    timezone: "Europe/Paris",
    content_locale: "en-GB",
  } as never);
  if (error) throw new Error(`plan_versions: ${error.message}`);
  return coachId;
}

async function cleanup(userId: string) {
  const db = admin();
  for (
    const table of [
      "inbound_dedup",
      "outbound_messages",
      "chat_messages",
      "protocol_events",
      // Le flow de correction y vit: un état laissé derrière capterait le
      // premier tour d'un futur élève réutilisant l'id (jamais en pratique,
      // mais un test qui ne nettoie pas tout ment sur son isolation).
      "user_chat_states",
    ]
  ) {
    await db.from(table).delete().eq("user_id", userId);
  }
  await db.from("plan_versions").delete().eq("student_id", userId);
  await db.auth.admin.deleteUser(userId).catch(() => {});
}

async function cleanupCoach(coachId: string | null) {
  if (!coachId) return;
  await admin().auth.admin.deleteUser(coachId).catch(() => {});
}

/**
 * ── LE RETRY SUR 502, ET POURQUOI IL NE CACHE RIEN ───────────────────────────
 * Chaque upload traverse un VRAI modèle de vision (6 à 9 s). Quand cette suite
 * tourne en parallèle des autres, Kong rend parfois un `502` sans corps — la
 * panne de passerelle documentée dans les mémoires du projet (« Kong 502 = faux
 * tours perdus »), pas une panne du produit. Mesuré : 6/6 deux fois de suite en
 * isolation, 1 échec quand les trois suites tournent ensemble.
 *
 * On retente donc UNE fois, **avec le même `client_upload_id`** — et c'est
 * précisément ce qu'un client réel fait. Le retry n'affaiblit pas le test, il
 * l'élargit : il exerce l'idempotence sur le chemin où elle compte vraiment.
 *
 * Ce qui n'est PAS toléré : un second 502, ou n'importe quel autre code. Un
 * `retry_on_502` est renvoyé pour que l'appelant puisse l'asserter s'il veut.
 */
async function upload(
  student: Student,
  body: Record<string, unknown>,
): Promise<
  { status: number; json: Record<string, unknown> | null; retried: boolean }
> {
  const once = async () => {
    const res = await fetch(`${URL_BASE}/functions/v1/meal-photo-upload-v1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${student.token}`,
      },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      json: await res.json().catch(() => null) as Record<string, unknown> | null,
    };
  };

  const first = await once();
  if (first.status !== 502) return { ...first, retried: false };
  console.log("[info] Kong 502 — on retente le MEME client_upload_id (idempotence)");
  const second = await once();
  return { ...second, retried: true };
}

Deno.test({
  name: "réel: une photo envoyée dans la bulle y écrit LE message et SON accusé",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    const coachId = await publishPlan(student.id);
    try {
      const clientId = crypto.randomUUID();
      const res = await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: clientId,
        chat_client_message_id: clientId,
        student_note: "lunch",
      });
      assertEquals(res.status, 200, JSON.stringify(res.json));

      const { data } = await admin()
        .from("chat_messages")
        .select("role,content,scope,metadata")
        .eq("user_id", student.id)
        .order("created_at", { ascending: true });
      const rows = (data ?? []) as Array<
        { role: string; content: string; scope: string; metadata: Record<string, unknown> }
      >;
      assertEquals(rows.length, 2, "la photo et son accusé, jamais l'un sans l'autre");

      assertEquals(rows[0].role, "user");
      assertEquals(rows[0].scope, "app");
      assertEquals(rows[0].content, "lunch", "la légende de l'élève gagne");
      assertEquals(rows[0].metadata.kind, "media");
      const ref = rows[0].metadata.media_ref as Record<string, unknown>;
      assert(ref, "le message porte la référence du fichier");
      // Le type SNIFFÉ, jamais le déclaré.
      assertEquals(ref.content_type, "image/png");
      assert(String(ref.path).length > 0);

      assertEquals(rows[1].role, "assistant");
      assert(rows[1].content.trim().length > 0, "l'accusé n'est jamais vide");
      assertEquals(rows[1].metadata.purpose, "keel_meal_photo_ack");
      // C'est une RÉPONSE: elle ne traverse ni ne consomme le plafond proactif.
      assertEquals(rows[1].metadata.is_proactive, false);
    } finally {
      await cleanup(student.id);
      await cleanupCoach(typeof coachId === "string" ? coachId : null);
    }
  },
});

Deno.test({
  name: "réel: une photo SANS légende écrit quand même une trace lisible",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    const coachId = await publishPlan(student.id);
    try {
      const clientId = crypto.randomUUID();
      await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: clientId,
        chat_client_message_id: clientId,
      });
      const { data } = await admin()
        .from("chat_messages")
        .select("role,content")
        .eq("user_id", student.id)
        .eq("role", "user")
        .maybeSingle();
      // Une chaîne vide dans le journal serait un message invisible dans la
      // bulle: l'élève verrait une bulle blanche sans savoir ce qu'il a envoyé.
      assertEquals((data as { content?: string } | null)?.content, "[photo]");
    } finally {
      await cleanup(student.id);
      await cleanupCoach(typeof coachId === "string" ? coachId : null);
    }
  },
});

Deno.test({
  name: "réel: REJEU du même envoi — un seul message, un seul accusé",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    const coachId = await publishPlan(student.id);
    try {
      const clientId = crypto.randomUUID();
      const body = {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: clientId,
        chat_client_message_id: clientId,
      };
      const first = await upload(student, body);
      const replay = await upload(student, body);
      assertEquals(first.status, 200);
      assertEquals(replay.status, 200);
      // Le fait était déjà là...
      assertEquals(replay.json?.idempotent, true);
      // ...et la conversation ne le redit pas.
      const { count } = await admin()
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id);
      assertEquals(count, 2, "un rejeu n'ajoute ni photo ni accusé");
    } finally {
      await cleanup(student.id);
      await cleanupCoach(typeof coachId === "string" ? coachId : null);
    }
  },
});

Deno.test({
  name: "réel: UN NON-IMAGE est refusé — et n'entre pas dans la conversation",
  ignore: SKIP,
  fn: async () => {
    // Pattern adversarial exigé par le chantier. La garde par octets magiques
    // existait déjà; ce qui est neuf est qu'un refus ne doit RIEN laisser dans
    // la bulle — sinon l'élève voit une photo envoyée qui n'existe nulle part.
    const student = await makeStudent();
    try {
      const clientId = crypto.randomUUID();
      const res = await upload(student, {
        mime_type: "image/png",
        base64: NOT_AN_IMAGE,
        client_upload_id: clientId,
        chat_client_message_id: clientId,
      });
      assert(res.status >= 400, `attendu un refus, reçu ${res.status}`);

      const { count } = await admin()
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id);
      assertEquals(count, 0, "un refus n'écrit rien dans la bulle");

      const { count: dedup } = await admin()
        .from("inbound_dedup")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id);
      assertEquals(dedup, 0, "et ne consomme pas l'identifiant d'idempotence");
    } finally {
      await cleanup(student.id);
    }
  },
});

Deno.test({
  name: "réel: SANS la couture, l'écran du jour n'écrit rien dans la bulle",
  ignore: SKIP,
  fn: async () => {
    // Le champ est OPTIONNEL, et son absence doit rester le comportement de
    // `/app/today`: une photo prise sur l'écran du plan est un fait, pas une
    // conversation. Sans ce test, ajouter la couture aurait pu rendre toute
    // photo bavarde.
    const student = await makeStudent();
    const coachId = await publishPlan(student.id);
    try {
      const res = await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: crypto.randomUUID(),
      });
      assertEquals(res.status, 200, JSON.stringify(res.json));
      assertEquals(res.json?.chat_message_id, null);

      const { count } = await admin()
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", student.id);
      assertEquals(count, 0);
    } finally {
      await cleanup(student.id);
      await cleanupCoach(typeof coachId === "string" ? coachId : null);
    }
  },
});

Deno.test({
  name: "réel: PHOTO SANS PLAN PUBLIÉ — elle est ENREGISTRÉE, pas refusée",
  ignore: SKIP,
  fn: async () => {
    // LA RÉGRESSION QUE CE TEST TIENT, et elle a été livrée: la fonction
    // exigeait un `plan_versions` publié et répondait sinon 409 + « your coach
    // hasn't published your plan ». Or dans le modèle KEEL le coach ne publie
    // JAMAIS de plan par élève (docs/keel/MODEL.md): la condition attendue
    // n'arrive pas, et le geste le plus coûteux du produit était refusé à tout
    // le monde en désignant un geste que personne ne fera.
    //
    // L'ancienne version de ce test assertait le 409 et le message de refus.
    // Elle prouvait que le refus était bien rendu; elle ne pouvait pas voir que
    // le refus lui-même était le défaut.
    const student = await makeStudent(); // volontairement SANS plan publié
    try {
      const clientId = crypto.randomUUID();
      const res = await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: clientId,
        chat_client_message_id: clientId,
      });
      assertEquals(res.status, 200, JSON.stringify(res.json));

      // Le FAIT existe, daté dans le fuseau du PROFIL (le plan n'en fournit
      // plus): sans ce repli, la photo n'aurait aucun jour où se ranger.
      const { data: eventRow } = await admin()
        .from("protocol_events")
        .select("id,local_date,source")
        .eq("user_id", student.id)
        .maybeSingle();
      const event = eventRow as
        | { id: string; local_date: string; source: string }
        | null;
      assert(event, "la photo écrit bien un fait");
      assertEquals(event!.source, "photo");
      assert(/^\d{4}-\d{2}-\d{2}$/.test(event!.local_date));

      // Et l'élève reçoit un ACCUSÉ, pas un refus.
      const { data } = await admin()
        .from("chat_messages")
        .select("role,content,metadata")
        .eq("user_id", student.id)
        .eq("role", "assistant")
        .maybeSingle();
      const row = data as
        | { content: string; metadata: Record<string, unknown> }
        | null;
      assert(row, "l'élève reçoit un message");
      assertEquals(row!.metadata.purpose, "keel_meal_photo_ack");
      const text = row!.content.toLowerCase();
      assert(
        !text.includes("hasn't published") && !text.includes("has not published"),
        `plus aucune attente d'un plan du coach, reçu: ${row!.content}`,
      );
      assert(
        !/you (?:should|must|need to|failed|forgot)/.test(text),
        `aucun reproche attendu, reçu: ${row!.content}`,
      );
    } finally {
      await cleanup(student.id);
    }
  },
});

// ───────────────────────────────────────────────────────────────────────────
// LA DÉDUPLICATION EXACTE
//
// Le défaut: `client_upload_id` est régénéré à CHAQUE sélection de fichier, et
// le seul index unique ne portait que sur lui. L'élève qui renvoie sa photo —
// parce qu'il n'a pas vu la réponse arriver — doublait son repas dans les
// données du coach. Ce qui suit prouve que ce n'est plus possible, ET que la
// dédup ne mord pas sur deux repas réellement différents.
// ───────────────────────────────────────────────────────────────────────────

/** CRC32, polynôme PNG. Nécessaire pour fabriquer un chunk valide. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Le MÊME PNG augmenté d'un chunk `tEXt`: une image toujours parfaitement
 * décodable, d'octets différents.
 *
 * Pourquoi pas une image bidon — le test traverse aussi le reniflage par
 * octets magiques et le modèle de vision. Une image invalide le ferait passer
 * pour une raison qui n'est pas celle qu'on veut prouver.
 */
function pngWithComment(base64Png: string, comment: string): string {
  const raw = Uint8Array.from(atob(base64Png), (c) => c.charCodeAt(0));
  // IEND fait toujours 12 octets et termine le fichier.
  const head = raw.subarray(0, raw.length - 12);
  const iend = raw.subarray(raw.length - 12);

  const payload = new TextEncoder().encode(`Comment ${comment}`);
  const typed = new Uint8Array(4 + payload.length);
  typed.set(new TextEncoder().encode("tEXt"), 0);
  typed.set(payload, 4);

  const chunk = new Uint8Array(8 + payload.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set(typed, 4);
  view.setUint32(8 + payload.length, crc32(typed));

  const out = new Uint8Array(head.length + chunk.length + iend.length);
  out.set(head, 0);
  out.set(chunk, head.length);
  out.set(iend, head.length + chunk.length);
  return btoa(String.fromCharCode(...out));
}

Deno.test({
  name: "réel: la MEME photo renvoyée ne crée pas un second repas",
  ignore: SKIP,
  fn: async () => {
    const student = await makeStudent();
    const coachId = await publishPlan(student.id);
    try {
      const first = await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: crypto.randomUUID(),
        chat_client_message_id: crypto.randomUUID(),
      });
      assertEquals(first.status, 200, JSON.stringify(first.json));
      assertEquals(first.json?.duplicate ?? false, false);

      // Un client_upload_id DIFFÉRENT: exactement ce que fait la bulle quand
      // l'élève re-sélectionne le même fichier. L'ancienne idempotence ne
      // voyait rien passer.
      const second = await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: crypto.randomUUID(),
        chat_client_message_id: crypto.randomUUID(),
      });
      assertEquals(second.status, 200, JSON.stringify(second.json));
      assertEquals(second.json?.duplicate, true, "le doublon doit être annoncé");
      assertEquals(
        second.json?.analysis,
        null,
        "un doublon ne repasse pas par le modèle de vision",
      );

      // LE point: la base, pas la réponse HTTP.
      const { data } = await admin()
        .from("protocol_events")
        .select("id, media_sha256")
        .eq("user_id", student.id);
      const rows = (data ?? []) as Array<{ id: string; media_sha256: string }>;
      assertEquals(rows.length, 1, "un repas mangé une fois = un seul fait");
      assertEquals(
        (second.json?.event as { id?: string })?.id,
        rows[0].id,
        "le doublon renvoie le fait DÉJÀ en base",
      );
      assert(/^[0-9a-f]{64}$/.test(rows[0].media_sha256), rows[0].media_sha256);

      // Et l'élève n'est pas laissé dans le silence: c'est ce silence qui le
      // ferait recommencer une troisième fois.
      const { data: msgs } = await admin()
        .from("chat_messages")
        .select("role,content")
        .eq("user_id", student.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: true });
      const replies = (msgs ?? []) as Array<{ content: string }>;
      assert(
        replies.some((m) => m.content.toLowerCase().includes("already have")),
        replies.map((m) => m.content).join(" | "),
      );
    } finally {
      await cleanup(student.id);
      await cleanupCoach(coachId);
    }
  },
});

Deno.test({
  name: "réel: l'accusé OUVRE le flow de correction, sur la bonne ligne",
  ignore: SKIP,
  fn: async () => {
    // La moitié « ouverture » du câblage anti-doublon. Sans cet état, le tour
    // suivant (« non c'était du poulet ») repart dans le routeur global et
    // `log_protocol_event` écrit une SECONDE ligne. L'autre moitié — la lecture
    // par le cerveau — est couverte par `keel_meal_photo_lane_test.ts`.
    const student = await makeStudent();
    const coachId = await publishPlan(student.id);
    try {
      const clientId = crypto.randomUUID();
      const res = await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: clientId,
        chat_client_message_id: clientId,
      });
      assertEquals(res.status, 200, JSON.stringify(res.json));
      const eventId = (res.json?.event as { id?: string })?.id ?? "";
      assert(eventId, "un fait a bien été écrit");

      const { data } = await admin()
        .from("user_chat_states")
        .select("temp_memory")
        .eq("user_id", student.id)
        .eq("scope", "app")
        .maybeSingle();
      const temp = (data as { temp_memory?: Record<string, unknown> } | null)
        ?.temp_memory ?? {};
      const stored = temp["__keel_meal_photo_flow_state"] as
        | Record<string, unknown>
        | undefined;

      const disqualified =
        (res.json?.event as { disqualified_reason?: unknown })
          ?.disqualified_reason ?? null;
      if (disqualified !== null) {
        // Le PNG 1×1 n'est pas un repas: si le filtre de sujet l'a disqualifié,
        // AUCUN flow ne doit s'ouvrir — il n'y a rien à corriger sur une photo
        // qui ne compte pas. C'est une assertion, pas une échappatoire.
        assertEquals(stored, undefined, "pas de flow sur un fait disqualifié");
        return;
      }

      assert(stored, "le flow est ouvert après l'accusé");
      const flow = stored!.flow as Record<string, unknown>;
      assertEquals(flow.eventId, eventId, "il pointe LA ligne qu'il amendera");
      assertEquals(flow.turns, 0);
      assert(
        flow.state === "awaiting_clarification" ||
          flow.state === "awaiting_correction",
        String(flow.state),
      );
      assert(typeof stored!.updated_at === "string");
    } finally {
      await cleanup(student.id);
      await cleanupCoach(coachId);
    }
  },
});

Deno.test({
  name: "réel: deux photos DIFFÉRENTES restent deux repas (anti-faux-positif)",
  ignore: SKIP,
  fn: async () => {
    // La garde qui manque le plus souvent à une déduplication: la preuve
    // qu'elle ne mord pas trop large. Sans elle, une dédup trop agressive
    // effacerait des repas réels sans que rien ne l'annonce.
    const student = await makeStudent();
    const coachId = await publishPlan(student.id);
    try {
      const other = pngWithComment(PNG_1PX, "second meal of the day");
      assert(other !== PNG_1PX, "le fixture doit vraiment différer");

      const a = await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: crypto.randomUUID(),
      });
      const b = await upload(student, {
        mime_type: "image/png",
        base64: other,
        client_upload_id: crypto.randomUUID(),
      });
      assertEquals(a.status, 200, JSON.stringify(a.json));
      assertEquals(b.status, 200, JSON.stringify(b.json));
      assertEquals(b.json?.duplicate ?? false, false, "images différentes");

      const { data } = await admin()
        .from("protocol_events")
        .select("id, media_sha256")
        .eq("user_id", student.id);
      const rows = (data ?? []) as Array<{ media_sha256: string }>;
      assertEquals(rows.length, 2, "deux repas différents = deux faits");
      assertEquals(
        new Set(rows.map((r) => r.media_sha256)).size,
        2,
        "deux empreintes distinctes",
      );
    } finally {
      await cleanup(student.id);
      await cleanupCoach(coachId);
    }
  },
});
