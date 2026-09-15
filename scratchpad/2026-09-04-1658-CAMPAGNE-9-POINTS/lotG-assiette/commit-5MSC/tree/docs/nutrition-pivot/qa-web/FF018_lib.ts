/**
 * FF-018 — outillage commun des runs réels sur la photo de repas.
 *
 * Rien ici ne décide : on fabrique un élève KEEL complet, on envoie des octets
 * à `meal-photo-upload-v1`, et on RELIT `protocol_events`. La vérité est la
 * ligne en base, jamais la réponse HTTP.
 */
import {
  admin,
  callAs,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  type Student,
} from "./harness.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

export const FIXTURE_TAG = "ff018";

const createdStudents: string[] = [];
const createdCoaches: string[] = [];

export function trackedStudents(): string[] {
  return [...createdStudents];
}
export function trackedCoaches(): string[] {
  return [...createdCoaches];
}

/** Un coach jetable + un élève KEEL complet, avec ou sans plan publié. */
export async function ff018Student(opts: {
  withPublishedPlan?: boolean;
  timezone?: string;
  locale?: string;
  country?: string;
} = {}): Promise<{ coach: Coach; student: Student }> {
  const coach = await makeCoach({ displayName: "FF018 Coach", country: "GB" });
  createdCoaches.push(coach.userId);
  const student = await makeStudent({
    coach,
    timezone: opts.timezone ?? "Europe/London",
    country: opts.country ?? "GB",
    locale: opts.locale ?? "en-US",
    fullName: `${FIXTURE_TAG} Student`,
  });
  createdStudents.push(student.userId);
  if (opts.withPublishedPlan !== false) {
    await publishPlanFor(coach, student.userId, { timezone: opts.timezone ?? "Europe/London" });
  }
  return { coach, student };
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export interface QaImage {
  name: string;
  base64: string;
  mime: string;
  bytes: number;
}

export async function loadImage(name: string): Promise<QaImage> {
  const path = new URL(`./images/${name}`, import.meta.url);
  const bytes = await Deno.readFile(path);
  const ext = name.split(".").pop()!.toLowerCase();
  return {
    name,
    base64: encodeBase64(bytes),
    mime: MIME[ext] ?? "image/png",
    bytes: bytes.length,
  };
}

export async function upload(
  student: Student,
  image: { base64: string; mime: string },
  opts: {
    uploadId?: string;
    note?: string;
    chatId?: string | null;
    slotKey?: string;
    commitmentId?: string;
  } = {},
): Promise<{ status: number; json: any }> {
  return await callAs(student, "meal-photo-upload-v1", {
    mime_type: image.mime,
    base64: image.base64,
    ...(opts.uploadId ? { client_upload_id: opts.uploadId } : {}),
    ...(opts.note ? { student_note: opts.note } : {}),
    ...(opts.slotKey ? { slot_key: opts.slotKey } : {}),
    ...(opts.commitmentId ? { commitment_id: opts.commitmentId } : {}),
    ...(opts.chatId === null
      ? {}
      : { chat_client_message_id: opts.chatId ?? `${FIXTURE_TAG}-chat-${crypto.randomUUID()}` }),
  });
}

/** Toutes les lignes de faits d'un élève, brutes, dans l'ordre de création. */
export async function events(userId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await admin()
    .from("protocol_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`protocol_events read: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

export async function chatRows(userId: string): Promise<
  Array<{ role: string; content: string; metadata: any; created_at: string }>
> {
  const { data } = await admin()
    .from("chat_messages")
    .select("role,content,metadata,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []) as never;
}

/** Le résumé lisible d'une ligne de fait — ce qu'on cite au rapport. */
export function eventDigest(e: Record<string, unknown>): string {
  const rec = (e.recognized ?? null) as Record<string, unknown> | null;
  const foods = Array.isArray(rec?.detected_foods)
    ? (rec!.detected_foods as Array<Record<string, unknown>>).map((f) => String(f.label))
    : [];
  return [
    `src=${e.source}`,
    `disq=${e.disqualified_reason ?? "null"}`,
    `subject=${rec?.subject_kind ?? "-"}`,
    `fgr=${e.food_group_ref ?? "null"}`,
    `band=${e.portion_band ?? "null"}`,
    `qty=${e.quantity ?? "null"}/${e.unit ?? "null"}`,
    `subst=${e.substance_ref ?? "null"}`,
    `weight=${e.evidence_weight ?? "null"}`,
    `analyzed=${e.analyzed_at ? "yes" : "no"}`,
    `plan_rel=${e.plan_relation ?? "null"}`,
    `foods=[${foods.join(", ")}]`,
    `dropped=${JSON.stringify(rec?.dropped_measurement_fields ?? [])}`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Les lexiques interdits — contrat non-input #4, dans les DEUX langues (T9)
// ---------------------------------------------------------------------------

/** Chiffre COLLÉ à un mot d'énergie/macro, ou un pourcentage. */
export const ENERGY_NUMERIC = [
  /\b\d[\d.,]*\s*(kcal|cal|cals|calorie|calories|kj|kilojoules?)\b/gi,
  /\b\d[\d.,]*\s*(g|gr|grammes?|grams?|mg)\s*(of\s+|de\s+|d')?(protein|protéines?|proteines?|prot|carb|carbs|carbohydrates?|glucides?|fat|fats|lipides?|fibres?|fiber|sugar|sucres?|sodium|sel)\b/gi,
  /\b(protein|protéines?|glucides?|lipides?|carbs?|fat|fibre|fiber|sugar|sucre|sodium)\s*[:=]\s*\d/gi,
  /\d\s*%/g,
];

/** Un nombre d'énergie ÉCRIT EN TOUTES LETTRES — l'angle adversarial. */
export const ENERGY_SPELLED = [
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|hundreds|thousand)[\w\s-]{0,30}?(kcal|calories|calorie)\b/gi,
  /\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|vingt|trente|quarante|cinquante|soixante|cent|cents|mille)[\w\s-]{0,30}?(calories|calorie|kcal)\b/gi,
  /\b(kcal|calories|calorie)[\w\s-]{0,20}?\b(one|two|three|hundred|thousand|cent|cents|mille)\b/gi,
];

export function matchAll(text: string, patterns: readonly RegExp[]): string[] {
  const out: string[] = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    const found = String(text ?? "").match(re);
    if (found) out.push(...found);
  }
  return out;
}

/** Nettoyage — par identifiant exact, jamais par motif d'e-mail. */
export async function ff018Cleanup(): Promise<string> {
  const db = admin();
  const notes: string[] = [];
  for (const userId of createdStudents) {
    for (
      const table of [
        "meal_precision_questions",
        "inbound_dedup",
        "outbound_messages",
        "chat_messages",
        "user_chat_states",
        "turn_summary_logs",
        "conversation_turn_traces",
        "protocol_events",
        "student_generated_meals",
        "student_week_plans",
        "plan_commitments",
        "plan_versions",
        "coach_clients",
      ]
    ) {
      const col = table === "coach_clients"
        ? "student_user_id"
        : table === "plan_versions"
        ? "student_id"
        : "user_id";
      const { error } = await db.from(table).delete().eq(col, userId);
      if (error) notes.push(`${table}: ${error.message}`);
    }
    await db.auth.admin.deleteUser(userId).catch(() => {});
  }
  for (const coachUserId of createdCoaches) {
    await db.auth.admin.deleteUser(coachUserId).catch(() => {});
  }
  return notes.length ? `nettoyage partiel: ${notes.join(" | ")}` : "nettoyage OK";
}
