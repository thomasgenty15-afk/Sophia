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
 * Un plan PUBLIÉ. Sans lui, la fonction refuse en 409: « pas de plan, rien à
 * quoi rattacher la photo, et aucun fuseau pour résoudre le jour ». C'est une
 * règle produit, pas un obstacle de test — d'où un cas dédié plus bas.
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

async function upload(
  student: Student,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
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
  name: "réel: PHOTO SANS PLAN ACTIF — l'élève reçoit une réponse, pas un silence",
  ignore: SKIP,
  fn: async () => {
    // Pattern adversarial exigé par le chantier. Le 409 reste le contrat de
    // l'API — l'écran du jour le lit très bien. Mais un élève qui envoie une
    // photo DANS LA BULLE ne lit pas un code HTTP: sans un mot, il voit sa
    // photo partir et rien revenir, ce qui est indiscernable d'une panne.
    const student = await makeStudent(); // volontairement SANS plan publié
    try {
      const clientId = crypto.randomUUID();
      const res = await upload(student, {
        mime_type: "image/png",
        base64: PNG_1PX,
        client_upload_id: clientId,
        chat_client_message_id: clientId,
      });
      assertEquals(res.status, 409, "le contrat d'API ne change pas");

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
      assertEquals(row!.metadata.purpose, "keel_meal_photo_no_plan");
      // Et le message ne lui reproche rien: ne pas avoir de plan publié est le
      // fait de son coach, pas le sien.
      const text = row!.content.toLowerCase();
      assert(text.includes("plan"), "il explique POURQUOI");
      assert(
        !/you (?:should|must|need to|failed|forgot)/.test(text),
        `aucun reproche attendu, reçu: ${row!.content}`,
      );
    } finally {
      await cleanup(student.id);
    }
  },
});
