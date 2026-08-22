// @ts-nocheck
// RGPD data export ("droit à la portabilité") — structured JSON inside a ZIP,
// delivered through a short-lived signed URL from the private gdpr-exports bucket.
//
// Non-negotiable security posture:
//   1. fresh re-authentication: the password is verified server-side right now;
//   2. immediate out-of-band notification (WhatsApp + email);
//   3. 1 export / 24 h (atomic enforce_rate_limit RPC), plus a tighter limiter
//      on password attempts so this endpoint is not a credential oracle;
//   4. signed URL with a short TTL — never an email attachment.
//
// Scope: what the user sees in the app — profile, transformations & plans,
// conversations, tracking entries, memories. Column allowlists below are the
// contract: NO system prompts, NO internal scores/classifications
// (risk_band, momentum, confidence, sensitivity levels…), NO raw LLM logs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { strToU8, zipSync } from "npm:fflate@0.8.2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import {
  sendLifecycleMessage,
  verifyPasswordFresh,
} from "../_shared/account_lifecycle.ts";
import { resolveArtifactLocale } from "../_shared/keel/locale.ts";
import {
  renderExportReadme,
  renderExportRequestedNotice,
} from "./export_copy.ts";
import { SCOPE } from "./export_scope.ts";

const EXPORT_BUCKET = "gdpr-exports";
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const PAGE = 1000;

// KEEL private buckets (20260727130000_keel_storage.sql). Path convention is
// `<owner_user_id>/<rest>`, so the export prefix is simply the user id.
const KEEL_FILE_BUCKETS = [
  { bucket: "plan-documents", folder: "fichiers/documents-plan" },
  { bucket: "meal-photos", folder: "fichiers/photos-repas" },
  // Les PDF de repas/courses. Même convention de chemin (`<user_id>/...`), donc
  // le même préfixe suffit. Oubliés, l'élève recevrait un export qui référence
  // des documents dont il n'a pas les octets.
  { bucket: "meal-documents", folder: "fichiers/documents-repas" },
] as const;
// storage.list() defaults to 100 objects and NEVER says it truncated — the
// paginated walk below is the only correct way to enumerate a prefix.
const STORAGE_LIST_PAGE = 100;
const MAX_STORAGE_DEPTH = 4;
// The archive is built in memory (zipSync), so the budget is bounded by the
// edge runtime, not by politeness: raw bytes + zip output both sit in the
// isolate at once. Past the budget the objects are LISTED in fichiers.json with
// their exclusion reason — a truncated archive that says so beats an OOM that
// delivers nothing.
const MAX_STORAGE_OBJECTS = 500;
const MAX_STORAGE_BYTES = 40 * 1024 * 1024;

function requireEnv(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function fetchAllRows(
  admin: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  userColumn: string,
  userId: string,
  extra?: (q: any) => any,
  orderColumn = "created_at",
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < 200; page++) {
    let q = admin
      .from(table)
      .select(columns)
      .eq(userColumn, userId)
      .order(orderColumn, { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// --- KEEL tables --------------------------------------------------------------
// The KEEL migrations (P0, tenancy, storage) may not be applied on the stack an
// export runs against — a function deploy and a `db push` are two separate human
// gates. A missing KEEL table must not deny every user their legacy export, so
// the failure is caught. It is NOT silent: the table name lands in
// `unavailable`, which is written into fichiers.json and flagged in the README.
async function fetchKeelRows(
  admin: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  userColumn: string,
  userId: string | null,
  unavailable: string[],
  orderColumn = "created_at",
): Promise<Record<string, unknown>[]> {
  // Null id = the user has no such role (no coaches row): nothing to export,
  // and nothing missing either.
  if (!userId) return [];
  try {
    return await fetchAllRows(admin, table, columns, userColumn, userId, undefined, orderColumn);
  } catch (err) {
    console.warn(`[account-export-v1] KEEL table unavailable: ${table}`, err);
    if (!unavailable.includes(table)) unavailable.push(table);
    return [];
  }
}

// W1.4 R5 — `commitment_relations` has no owner column: it hangs off
// `plan_commitments`. It is therefore fetched by the ids of the student's own
// commitments, in chunks so the `in.(...)` filter never blows the URL length on
// a long protocol history.
const RELATION_ID_CHUNK = 100;

async function fetchRowsByIdChunks(
  admin: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  column: string,
  ids: string[],
  unavailable: string[],
  orderColumn = "created_at",
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const rows: Record<string, unknown>[] = [];
  try {
    for (let i = 0; i < ids.length; i += RELATION_ID_CHUNK) {
      const chunk = ids.slice(i, i + RELATION_ID_CHUNK);
      const { data, error } = await admin
        .from(table)
        .select(columns)
        .in(column, chunk)
        .order(orderColumn, { ascending: true });
      if (error) throw error;
      rows.push(...(data ?? []));
    }
  } catch (err) {
    console.warn(`[account-export-v1] KEEL table unavailable: ${table}`, err);
    if (!unavailable.includes(table)) unavailable.push(table);
    return [];
  }
  return rows;
}

// `coach_id` on the KEEL tables is `coaches.id`, NOT the auth user id (see the
// RLS policies in 20260727120000_keel_tenancy.sql). Exporting with user.id there
// would silently return zero rows for every coach.
async function resolveCoachId(
  admin: ReturnType<typeof createClient>,
  userId: string,
  unavailable: string[],
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("coaches")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data?.id ? String(data.id) : null;
  } catch (err) {
    console.warn("[account-export-v1] coaches lookup unavailable", err);
    if (!unavailable.includes("coaches")) unavailable.push("coaches");
    return null;
  }
}

// --- KEEL storage -------------------------------------------------------------
type StorageObject = { path: string; size: number };

async function listBucketObjects(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<StorageObject[]> {
  // R7: returning [] here would drop objects from BOTH the archive and the
  // manifest that claims to list every file — a silent hole in an RGPD export.
  // The throw is caught per bucket in collectStorageFiles and surfaces as
  // `statut: "indisponible"` in fichiers.json.
  if (depth > MAX_STORAGE_DEPTH) {
    throw new Error(`storage_walk_too_deep:${bucket}/${prefix}`);
  }
  const found: StorageObject[] = [];
  for (let page = 0; page < 200; page++) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: STORAGE_LIST_PAGE,
      offset: page * STORAGE_LIST_PAGE,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const name = String(entry?.name ?? "");
      if (!name || name === ".emptyFolderPlaceholder") continue;
      const path = `${prefix}/${name}`;
      // A prefix ("folder") comes back with a null id; a real object has one.
      if (entry?.id == null) {
        found.push(...await listBucketObjects(admin, bucket, path, depth + 1));
      } else {
        found.push({ path, size: Number((entry as any)?.metadata?.size ?? 0) });
      }
    }
    if (entries.length < STORAGE_LIST_PAGE) break;
  }
  return found;
}

// Bundles the user's objects from the KEEL buckets and returns a manifest that
// states, per object, whether it made it into the archive and why not. An
// export that quietly drops files is worse than one that says it dropped them.
async function collectStorageFiles(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ binaries: Record<string, Uint8Array>; manifest: Record<string, unknown>[] }> {
  const binaries: Record<string, Uint8Array> = {};
  const manifest: Record<string, unknown>[] = [];
  let remainingBytes = MAX_STORAGE_BYTES;
  let included = 0;

  for (const { bucket, folder } of KEEL_FILE_BUCKETS) {
    let objects: StorageObject[];
    try {
      objects = await listBucketObjects(admin, bucket, userId);
    } catch (err) {
      // Bucket missing on this stack is not an export blocker, but it is stated.
      console.warn(`[account-export-v1] storage list failed for bucket ${bucket}`, err);
      manifest.push({ bucket, statut: "indisponible" });
      continue;
    }
    for (const object of objects) {
      const relative = object.path.slice(userId.length + 1);
      const entry: Record<string, unknown> = {
        bucket,
        chemin: object.path,
        taille_octets: object.size,
        inclus: false,
      };
      if (included >= MAX_STORAGE_OBJECTS) {
        entry.motif_exclusion = "limite_nombre_fichiers";
      } else if (object.size > remainingBytes) {
        entry.motif_exclusion = "limite_taille_archive";
      } else {
        try {
          const { data, error } = await admin.storage.from(bucket).download(object.path);
          if (error || !data) throw error ?? new Error("download_failed");
          const bytes = new Uint8Array(await data.arrayBuffer());
          binaries[`${folder}/${relative}`] = bytes;
          remainingBytes -= bytes.byteLength;
          included++;
          entry.taille_octets = bytes.byteLength;
          entry.fichier_archive = `${folder}/${relative}`;
          entry.inclus = true;
        } catch (err) {
          console.warn(`[account-export-v1] storage download failed: ${bucket}/${object.path}`, err);
          entry.motif_exclusion = "telechargement_echoue";
        }
      }
      manifest.push(entry);
    }
  }
  return { binaries, manifest };
}
// Column allowlists — the RGPD scope contract. Everything not listed here
// (internal summaries, generation snapshots, sensitivity/confidence scores,
// embeddings, raw metadata) never leaves the database.
//
// ⚠️ ELLE A QUITTÉ CE FICHIER LE 2026-08-22 (lot `S5`), et le motif est le
// défaut qu'elle portait: `index.ts` est en `@ts-nocheck` et monte un serveur
// au premier import, donc aucun test ne pouvait LIRE l'allowlist autrement
// qu'en la parsant comme du texte. Mesuré ce jour-là: 145 colonnes hors
// allowlist sur 35 des 38 tables lues, sans qu'une seule ligne du dépôt puisse
// le dire. Le filet qui énumère vit dans `keel_gdpr_lifecycle_test.ts`.

async function buildExportPayload(
  admin: ReturnType<typeof createClient>,
  user: { id: string; email: string | null; created_at?: string },
) {
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    // ⟳ 2026-08-22 (`S5`) — SIX COLONNES DE PLUS. Le filet qui énumère a
    // mesuré que `profiles` portait la taille, le niveau d'activité, la
    // journée type, la fréquence de sport et le PAYS hors de l'export, alors
    // que ce sont des faits déclarés par la personne — et que `country` est ce
    // qui route sa hotline de crise. `display_unit_system` sort aussi: sans
    // lui, les chiffres de l'archive n'ont pas d'unité.
    .select(
      "full_name,email,phone_number,birth_date,gender,timezone,locale," +
        "country,height_cm,activity_level,day_activity,sport_frequency," +
        "display_unit_system,proactive_muted_at",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) throw profErr;

  const [cycles, transformations, plans, planItems, planEntries, memories, conversations] =
    await Promise.all([
      // RETRAIT RÉSIDUS (2026-08-08): la cascade plan/transformation B2C est
      // DROPPÉE (0 utilisateur grand public, décision humaine). Même motif que
      // recurring_meals plus bas: les clés de bundle restent (un lecteur
      // d'export antérieur ne tombe pas sur un trou), vides, sans sonde.
      Promise.resolve([] as Record<string, unknown>[]),
      Promise.resolve([] as Record<string, unknown>[]),
      Promise.resolve([] as Record<string, unknown>[]),
      Promise.resolve([] as Record<string, unknown>[]),
      Promise.resolve([] as Record<string, unknown>[]),
      fetchAllRows(
        admin,
        "memory_items",
        SCOPE.memories,
        "user_id",
        user.id,
        // Memories as the user would see them: active knowledge only, not
        // superseded/hidden internals.
        (q) => q.in("status", ["candidate", "active"]),
      ),
      fetchAllRows(
        admin,
        "chat_messages",
        SCOPE.conversations,
        "user_id",
        user.id,
        (q) => q.in("role", ["user", "assistant"]),
      ),
    ]);

  // KEEL layers (docs/keel/SCHEMA.md). The student side keys on user_id /
  // student_id; the coach side keys on coaches.id and is empty for a student.
  const keelUnavailable: string[] = [];
  const coachId = await resolveCoachId(admin, user.id, keelUnavailable);
  const [
    planTemplates,
    planDocuments,
    planVersions,
    commitments,
    protocolEvents,
    evaluations,
    plannedDeviations,
    upcomingContexts,
    mealPrecisionQuestions,
    bodyMeasures,
    weeklyReviews,
    changeRequests,
    safetyConstraints,
    coachNotesAboutMe,
    coachNotesIWrote,
    coachClientsAsStudent,
    coachClientsAsCoach,
    coachInvitationsAsStudent,
    coachInvitationsAsCoach,
    coachAccessEvents,
    studentGoals,
    studentWeekPlans,
    studentDailyCheckins,
    studentActivitySessions,
    studentHungerReports,
    studentGeneratedMeals,
    studentMealDocuments,
    mealCompositionVerdicts,
    recurringMeals,
    studentFacts,
    studentCards,
    cardArmings,
    cardWins,
    coachDoctrines,
    cohorts,
    coachSyntheses,
    coachFoodProposals,
    coachDocuments,
    coachDocumentChunks,
    coachDocumentCitations,
    householdMembership,
    storage,
  ] = await Promise.all([
    fetchKeelRows(admin, "plan_templates", SCOPE.planTemplates, "coach_id", coachId, keelUnavailable),
    fetchKeelRows(admin, "plan_documents", SCOPE.planDocuments, "coach_id", coachId, keelUnavailable),
    fetchKeelRows(admin, "plan_versions", SCOPE.planVersions, "student_id", user.id, keelUnavailable),
    fetchKeelRows(admin, "plan_commitments", SCOPE.commitments, "user_id", user.id, keelUnavailable),
    fetchKeelRows(admin, "protocol_events", SCOPE.protocolEvents, "user_id", user.id, keelUnavailable),
    fetchKeelRows(
      admin,
      "commitment_evaluations",
      SCOPE.evaluations,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "planned_deviations",
      SCOPE.plannedDeviations,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "upcoming_contexts",
      SCOPE.upcomingContexts,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "meal_precision_questions",
      SCOPE.mealPrecisionQuestions,
      "user_id",
      user.id,
      keelUnavailable,
      // Cette table n'a PAS de `created_at`: sa date est `asked_at`. Le défaut
      // par défaut de `fetchKeelRows` aurait fait échouer la lecture en
      // silence, et la table serait ressortie en `tables_indisponibles` —
      // c'est-à-dire absente de l'export tout en ayant l'air prise en compte.
      "asked_at",
    ),
    fetchKeelRows(
      admin,
      "student_body_measures",
      SCOPE.bodyMeasures,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(admin, "weekly_reviews", SCOPE.weeklyReviews, "user_id", user.id, keelUnavailable),
    fetchKeelRows(
      admin,
      "contract_change_requests",
      SCOPE.changeRequests,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "student_safety_constraints",
      SCOPE.safetyConstraints,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    // Les deux côtés de la note 1:1. Côté ÉLÈVE d'abord, parce que c'est celui
    // qui est dû: ce que son coach a écrit sur lui.
    fetchKeelRows(
      admin,
      "student_coach_notes",
      SCOPE.coachNotes,
      "student_user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "student_coach_notes",
      SCOPE.coachNotes,
      "coach_id",
      coachId,
      keelUnavailable,
    ),
    // Both sides of the link: the user as a student, and as a coach.
    fetchKeelRows(
      admin,
      "coach_clients",
      SCOPE.coachClients,
      "student_user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(admin, "coach_clients", SCOPE.coachClients, "coach_id", coachId, keelUnavailable),
    // W1.4 R5 — invitations, both sides. As a student: the offers addressed to
    // their own address, standing or spent. As a coach: the ones they sent.
    fetchKeelRows(
      admin,
      "coach_invitations",
      SCOPE.coachInvitations,
      "email",
      String(user.email ?? "").trim().toLowerCase() || null,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "coach_invitations",
      SCOPE.coachInvitations,
      "coach_id",
      coachId,
      keelUnavailable,
    ),
    // Only the accesses that concern THIS user as a student. coach_access_events
    // has no created_at — it is ordered by occurred_at.
    fetchKeelRows(
      admin,
      "coach_access_events",
      SCOPE.coachAccessEvents,
      "student_user_id",
      user.id,
      keelUnavailable,
      "occurred_at",
    ),
    // --- PIVOT: ce que l'élève décide et déclare (AGENT 13) ------------------
    fetchKeelRows(admin, "student_goals", SCOPE.studentGoals, "user_id", user.id, keelUnavailable),
    fetchKeelRows(
      admin,
      "student_week_plans",
      SCOPE.studentWeekPlans,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "student_daily_checkins",
      SCOPE.studentDailyCheckins,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "student_activity_sessions",
      SCOPE.studentActivitySessions,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "student_hunger_reports",
      SCOPE.studentHungerReports,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "student_generated_meals",
      SCOPE.studentGeneratedMeals,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "student_meal_documents",
      SCOPE.studentMealDocuments,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    // FF-039 — réclamée par le lifecycle DÈS SA MIGRATION, et pas après. Le
    // dépôt a la cicatrice inverse: neuf tables neuves absentes de l'export
    // pendant des mois, sans que rien ne le dise.
    fetchKeelRows(
      admin,
      "meal_composition_verdicts",
      SCOPE.mealCompositionVerdicts,
      "user_id",
      user.id,
      keelUnavailable,
    ),
    // `recurring_meals` et `student_facts` ont été DROPPÉES par le pivot
    // nutrition (le memorizer fait cette couche souple). Les sonder à chaque
    // export les rangeait dans `tables_indisponibles`, c'est-à-dire un bruit
    // permanent dans le bundle de CHAQUE élève, pour deux tables qui ne
    // reviendront pas. On rend un tableau vide sans interroger la base: la
    // section reste dans le bundle (un lecteur d'export antérieur ne se
    // retrouve pas devant une clé disparue), mais elle ne ment plus sur une
    // indisponibilité.
    Promise.resolve([] as Record<string, unknown>[]),
    Promise.resolve([] as Record<string, unknown>[]),
    // `student_cards`, `card_armings`, `card_wins`: droppées (20260808070000),
    // même règle que les deux lignes au-dessus — vide, sans sonde, sans bruit.
    Promise.resolve([] as Record<string, unknown>[]),
    Promise.resolve([] as Record<string, unknown>[]),
    Promise.resolve([] as Record<string, unknown>[]),
    // --- PIVOT: le matériel du coach (vide pour un élève) --------------------
    fetchKeelRows(
      admin,
      "coach_doctrines",
      SCOPE.coachDoctrines,
      "coach_id",
      coachId,
      keelUnavailable,
    ),
    fetchKeelRows(admin, "cohorts", SCOPE.cohorts, "coach_id", coachId, keelUnavailable),
    fetchKeelRows(
      admin,
      "coach_syntheses",
      SCOPE.coachSyntheses,
      "coach_id",
      coachId,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "coach_food_proposals",
      SCOPE.coachFoodProposals,
      "coach_id",
      coachId,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "coach_documents",
      SCOPE.coachDocuments,
      "coach_id",
      coachId,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "coach_document_chunks",
      SCOPE.coachDocumentChunks,
      "coach_id",
      coachId,
      keelUnavailable,
    ),
    fetchKeelRows(
      admin,
      "coach_document_citations",
      SCOPE.coachDocumentCitations,
      "coach_id",
      coachId,
      keelUnavailable,
    ),
    // C3 ③ — SA PLACE DANS UN FOYER. `joined_at` et pas `created_at`: cette
    // table n'a pas de `created_at`, et un tri sur une colonne inexistante
    // ferait tomber la lecture dans le filet `tables_indisponibles` — donc un
    // export silencieusement vide sur la seule table qui survit à la purge.
    fetchKeelRows(
      admin,
      "household_members",
      SCOPE.householdMembers,
      "user_id",
      user.id,
      keelUnavailable,
      "joined_at",
    ),
    collectStorageFiles(admin, user.id),
  ]);
  // A coach who is also their own student would match both queries; dedupe on id.
  const dedupeById = (rows: Record<string, unknown>[]) => {
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      byId.set(String((row as any)?.id ?? crypto.randomUUID()), row);
    }
    return [...byId.values()];
  };
  const coachClients = dedupeById([
    ...coachClientsAsStudent,
    ...coachClientsAsCoach,
  ]);
  const coachInvitations = dedupeById([
    ...coachInvitationsAsStudent,
    ...coachInvitationsAsCoach,
  ]);

  // W1.4 R5 — relations attached to THIS student's commitments. Sequential on
  // purpose: the ids only exist once `commitments` has come back.
  const commitmentRelations = await fetchRowsByIdChunks(
    admin,
    "commitment_relations",
    SCOPE.commitmentRelations,
    "commitment_a",
    commitments.map((row) => String((row as any)?.id ?? "")).filter(Boolean),
    keelUnavailable,
  );

  // SON CORPS DANS LE FOYER. Séquentiel pour la MÊME raison que les relations
  // ci-dessus, et par le MÊME chemin: la table n'a pas de `user_id`, elle pend
  // à `household_members.member_id`, et cet identifiant n'existe qu'une fois
  // `householdMembership` revenu.
  //
  // ⚠️ LA LISTE D'IDS EST CELLE DE SA PROPRE LIGNE, ET D'ELLE SEULE. Elle sort
  // d'une requête déjà filtrée sur `user_id = <lui>`, donc elle porte au plus un
  // `member_id` (`household_members_one_per_user`). Passer les `member_id` du
  // roster à la place exporterait le poids de ses enfants dans SON archive —
  // c'est le seul geste qui rendrait ce lot pire que le trou qu'il ferme.
  const householdMemberBody = await fetchRowsByIdChunks(
    admin,
    "household_member_bodies",
    SCOPE.householdMemberBody,
    "member_id",
    householdMembership.map((row) => String((row as any)?.member_id ?? ""))
      .filter(Boolean),
    keelUnavailable,
    // Cette table n'a pas de `created_at`; trier dessus la ferait tomber dans le
    // filet `tables_indisponibles`, c'est-à-dire rendre un export SILENCIEUSEMENT
    // VIDE sur des données corporelles. Même piège que `joined_at` juste au-
    // dessus, et il vient d'être payé une fois.
    "recorded_at",
  );

  // G1 — SES HABITUDES ALIMENTAIRES. Même chemin et même raison que le corps
  // ci-dessus: la table n'a pas de `user_id`, elle pend à
  // `household_members.member_id`, et cet identifiant n'existe qu'une fois
  // `householdMembership` revenu.
  //
  // ⚠️ LA MÊME LISTE D'IDS, DONC LA MÊME GARANTIE: elle sort d'une requête déjà
  // filtrée sur `user_id = <lui>` et porte au plus UN `member_id`
  // (`household_members_one_per_user`). Passer les `member_id` du roster
  // exporterait ce que mangent ses enfants dans SON archive.
  //
  // `updated_at` et pas `created_at`: cette table n'a pas de `created_at`, et
  // trier sur une colonne inexistante la ferait tomber dans le filet
  // `tables_indisponibles` — c'est-à-dire rendre un export SILENCIEUSEMENT
  // VIDE. Le piège vient d'être payé deux fois au-dessus (`joined_at`,
  // `recorded_at`).
  const householdMemberHabits = await fetchRowsByIdChunks(
    admin,
    "household_member_habits",
    SCOPE.householdMemberHabits,
    "member_id",
    householdMembership.map((row) => String((row as any)?.member_id ?? ""))
      .filter(Boolean),
    keelUnavailable,
    "updated_at",
  );

  // S5 (2026-08-22) — SES ALLERGIES, ET LES RÈGLES DE MAISON QUI LA VISENT.
  //
  // ⛔ CE SONT DES DONNÉES DE SANTÉ ET ELLES N'ÉTAIENT RÉCLAMÉES NULLE PART.
  // Mesuré ce jour-là, avant ce lot:
  // `grep -c 'household_member_allergies\|household_food_restrictions'` sur ce
  // fichier → **0**. Ni l'export, ni la purge, ni le test du cycle de vie ne
  // les connaissaient — et le test ne pouvait pas le dire, parce qu'il était
  // lui-même une liste écrite à la main.
  //
  // ⚠️ MÊME CHEMIN ET MÊME GARANTIE QUE LE CORPS ET LES HABITUDES: la liste
  // d'ids sort de `householdMembership`, déjà filtrée sur `user_id = <lui>`,
  // donc elle porte au plus UN `member_id`. C'est la décision n° 24 du plan
  // (2026-08-21), « A et B selon la bouche »: une bouche AVEC un compte
  // exporte les siennes; une bouche SANS compte n'a aucun moyen d'exporter, et
  // c'est le maître qui les porte. Passer les `member_id` du roster mettrait
  // les allergies de ses enfants dans SON archive.
  //
  // `created_at` est la bonne colonne de tri ici — les deux tables l'ont, à la
  // différence du corps (`recorded_at`) et des habitudes (`updated_at`).
  const householdMemberAllergies = await fetchRowsByIdChunks(
    admin,
    "household_member_allergies",
    SCOPE.householdMemberAllergies,
    "member_id",
    householdMembership.map((row) => String((row as any)?.member_id ?? ""))
      .filter(Boolean),
    keelUnavailable,
  );

  const householdFoodRestrictions = await fetchRowsByIdChunks(
    admin,
    "household_food_restrictions",
    SCOPE.householdFoodRestrictions,
    "member_id",
    householdMembership.map((row) => String((row as any)?.member_id ?? ""))
      .filter(Boolean),
    keelUnavailable,
  );

  const exportedAt = new Date().toISOString();
  return {
    exportedAt,
    binaries: storage.binaries,
    files: {
      "profil.json": {
        exporte_le: exportedAt,
        email_du_compte: user.email ?? profile?.email ?? null,
        compte_cree_le: user.created_at ?? null,
        nom_complet: profile?.full_name ?? null,
        telephone: profile?.phone_number ?? null,
        date_de_naissance: profile?.birth_date ?? null,
        genre: profile?.gender ?? null,
        fuseau_horaire: profile?.timezone ?? null,
        langue: profile?.locale ?? null,
        // S5 — LE PAYS. Ce n'est pas décoratif: c'est lui, et lui seul, qui
        // décide quelle hotline de crise est servie (`profiles.country`, la
        // locale ne décide plus). Une personne a le droit de voir sur quel
        // pays le produit la range.
        pays: profile?.country ?? null,
        systeme_dunites: profile?.display_unit_system ?? null,
        // SON CORPS TEL QU'IL EST DÉCLARÉ SUR LE PROFIL — à distinguer du
        // corps saisi POUR LES PARTS d'un foyer, qui vit dans mon_foyer.json.
        taille_cm: profile?.height_cm ?? null,
        niveau_dactivite: profile?.activity_level ?? null,
        journee_type: profile?.day_activity ?? null,
        frequence_de_sport: profile?.sport_frequency ?? null,
        // L'export dit l'état RÉEL du réglage de relances, pas un opt-in
        // Meta gelé qui aurait annoncé « inactif » à tout le monde.
        proactive_messages_active: !profile?.proactive_muted_at,
      },
      "transformations.json": { cycles, transformations },
      "plans.json": { plans, actions: planItems },
      "suivi.json": { entrees: planEntries },
      "souvenirs.json": { souvenirs: memories },
      "conversations.json": { messages: conversations },
      "protocole.json": {
        versions_de_plan: planVersions,
        engagements: commitments,
        // Render/safety guidance attached to the engagements (co-ingestion,
        // spacing, cofactors). Never read by the evaluator — exported because
        // it is part of the protocol the student was given.
        relations_entre_engagements: commitmentRelations,
        modeles_coach: planTemplates,
        documents_coach: planDocuments,
        // AGENT 13 — côté COACH uniquement (vide pour un élève): sa doctrine
        // versionnée, ses promos, et l'agrégat de ses synthèses. Le nom et
        // l'uuid de ses élèves n'y figurent pas (voir SCOPE.coachSyntheses).
        doctrine_coach: coachDoctrines,
        cohortes_coach: cohorts,
        syntheses_coach: coachSyntheses,
        propositions_aliments_coach: coachFoodProposals,
        // 20260806140000 — ses documents, leur texte, et les citations qui
        // relient une entrée de doctrine à la phrase dont elle sort.
        documents_source_coach: coachDocuments,
        passages_documents_coach: coachDocumentChunks,
        citations_documents_coach: coachDocumentCitations,
      },
      "protocole_suivi.json": {
        evenements: protocolEvents,
        evaluations,
        deviations_planifiees: plannedDeviations,
        contextes_a_venir: upcomingContexts,
        questions_de_precision: mealPrecisionQuestions,
      },
      "protocole_bilans.json": {
        // FF-031 — les pesées, à la journée. Elles sont ici et pas dans
        // `protocole_suivi.json` parce que c'est le fichier qui porte déjà le
        // corps: le bilan hebdomadaire en garde le miroir le temps de la double
        // écriture, et les deux doivent se relire côte à côte.
        mesures_corporelles: bodyMeasures,
        bilans_hebdomadaires: weeklyReviews,
        demandes_ajustement: changeRequests,
      },
      "securite.json": { contraintes: safetyConstraints },
      // AGENT 13 — le pivot 1:N: le coach recommande, l'ÉLÈVE décide. Ce
      // fichier porte ce qu'il a décidé, pas ce qu'on lui a prescrit; c'est
      // pour ça qu'il est séparé de protocole.json.
      // ── C3 ③ · SA PLACE DANS UN FOYER, ET CE QUI LUI SURVIT ─────────────
      //
      // Fichier à part, et pas une clé de `mon_plan.json`: c'est le SEUL
      // endroit du produit où une donnée personnelle survit à la suppression
      // du compte, et cette phrase-là ne doit pas se lire au milieu d'autre
      // chose. Voir `SCOPE.householdMembers` pour l'arbitrage.
      "mon_foyer.json": {
        ma_place: householdMembership,
        // LE CORPS, DANS LE MÊME FICHIER QUE LA PLACE — pas dans `profil.json`.
        // Ce n'est pas le corps que la personne suit pour elle-même (celui-là
        // vit dans `profiles` et dans ses pesées datées, et il sort ailleurs):
        // c'est ce que la personne qui gère le foyer a saisi POUR SERVIR SON
        // ASSIETTE. Deux origines, deux endroits — les mêler ferait lire une
        // saisie d'autrui comme une déclaration de soi.
        mon_corps_pour_les_parts: householdMemberBody,
        // G1 — CE QUE JE MANGE QUAND CE N'EST PAS LE PLAT DE LA MAISON. Dans
        // le même fichier que la place et le corps, et pour la même raison:
        // ces trois-là décrivent une bouche À TABLE, pas une personne seule.
        mes_habitudes_a_table: householdMemberHabits,
        // S5 — SES ALLERGIES. Donnée de SANTÉ, dans le fichier du foyer parce
        // que c'est là qu'elle vit: cette table est le seul endroit où une
        // bouche SANS compte peut porter une allergie, et une allergie d'un
        // seul membre gouverne toute la casserole.
        mes_allergies: householdMemberAllergies,
        // Les règles de maison qui la visent. Elles ne sont PAS médicales — la
        // table n'a délibérément aucune colonne de raison — mais ce sont des
        // faits déclarés SUR elle, par quelqu'un d'autre, et le §8.5 règle 3
        // du chantier foyer dit qu'elle a le droit de les voir.
        les_regles_de_maison_qui_me_visent: householdFoodRestrictions,
        // ⚠️ CETTE PHRASE EST LA MOITIÉ QUI COMPTE. Sans elle, l'export dirait
        // ce qu'on détient et se tairait sur ce qu'on garde — or c'est
        // précisément ce qu'on garde qui n'avait jamais été décidé, ni dit.
        ce_qui_survit_a_la_suppression: {
          regle:
            "Ta place dans le foyer n'est pas supprimée avec ton compte: elle est " +
            "DÉTACHÉE. La bouche reste (le foyer continue de cuisiner pour le " +
            "bon nombre de personnes), mais elle n'est plus reliée à toi.",
          champs_conserves: [
            "first_name",
            "birth_date",
            "goal",
            "away_days",
            // S5 — ELLES SURVIVENT, ET C'EST DÉLIBÉRÉ. Les effacer pendant que
            // la bouche reste à table retirerait la ceinture d'allergie du
            // foyer en silence: la casserole suivante pourrait contenir
            // l'allergène. Un geste de vie privée ne peut pas produire une
            // régression de SÉCURITÉ. La ligne perd en revanche son auteur
            // (`created_by` passe à NULL avec le compte).
            "household_member_allergies",
            "household_food_restrictions",
          ],
          pourquoi:
            "Le prénom répond à « pour qui je cuisine ». La date de naissance " +
            "sert à calculer une part adaptée — l'effacer changerait les " +
            "portions des autres personnes du foyer. Tes allergies et les " +
            "règles de maison qui te visent restent tant que ta bouche reste " +
            "à table: les effacer ferait cuisiner le foyer sans savoir ce qui " +
            "peut te rendre malade.",
          comment_les_effacer:
            "Coche « retirer aussi ma place dans ce foyer » au moment de " +
            "supprimer ton compte: la ligne est alors supprimée, pas détachée, " +
            "et tes allergies et les règles qui te visent partent avec elle. " +
            "La personne qui gère le foyer peut aussi retirer la bouche à tout " +
            "moment.",
          // ── ET CE QUI NE SURVIT PAS, DIT AUSSI CLAIREMENT ────────────────
          // Un export qui n'énumère que ce qu'on garde laisse croire qu'on
          // garde tout. La taille et le poids sont le seul endroit du foyer où
          // la réponse est « non », et c'est la ligne qu'une personne inquiète
          // vient chercher.
          ce_qui_est_efface:
            "Ta taille, ton poids et ton sexe tels qu'ils ont été saisis pour " +
            "calculer ta part sont SUPPRIMÉS avec ton compte, même quand ta " +
            "bouche reste dans le foyer. Sans eux, tu reçois une part standard " +
            "de ce que la maison cuisine — jamais une part réduite.",
        },
      },
      "mon_plan.json": {
        objectif: studentGoals,
        semaines: studentWeekPlans,
        points_du_soir: studentDailyCheckins,
        // LE LOG DE SÉANCE. Rangé ici parce que c'est un GESTE DE L'ÉLÈVE, au
        // même titre que le tap du soir: ce qu'il a déclaré de sa semaine.
        //
        // ⚠️ IL N'Y A AUCUN CHIFFRE D'ÉNERGIE DANS CES LIGNES, ET C'EST UNE
        // DÉCISION, PAS UN OUBLI DE L'EXPORT. La table ne porte pas de colonne
        // de calories: la dépense d'une séance déclarée est fausse de ±30-50 %
        // pour un déficit visé de 400-500 kcal/j, donc la stocker (et a
        // fortiori la rendre) ajouterait de l'incertitude en la faisant passer
        // pour une mesure. Voir 20260818180000.
        seances_dactivite: studentActivitySessions,
        // FF-027. Rangée AVEC les points du soir parce que c'est le MÊME
        // signal par une autre porte: l'axe `hunger` du tap et la faim dite en
        // passant. Les séparer dans l'archive ferait croire à deux choses.
        faim_declaree: studentHungerReports,
      },
      // Séparé de `mon_plan.json`: un plan de semaine est un ENGAGEMENT que
      // l'élève adopte, un repas généré est un SERVICE rendu à la demande. Les
      // mêler ferait lire vingt repas comme vingt semaines de plan.
      "mes_repas_generes.json": {
        repas: studentGeneratedMeals,
        documents: studentMealDocuments,
        // Ce que le moteur a MESURÉ sur ces repas, en mots. Aucun chiffre
        // d'énergie ni de macro n'y figure — le verdict est en mots par
        // construction (FF-039 R9).
        mesures_de_composition: mealCompositionVerdicts,
      },
      "ma_memoire_alimentaire.json": {
        repas_recurrents: recurringMeals,
        preferences_et_contexte: studentFacts,
      },
      "mes_cartes.json": {
        cartes: studentCards,
        armements: cardArmings,
        victoires: cardWins,
      },
      "coaching.json": {
        liens_coach: coachClients,
        acces_coach: coachAccessEvents,
        // W1.4 R5: the invitations themselves, WITHOUT invite_token_hash
        // (SCOPE.coachInvitations is the allowlist that keeps it out).
        invitations_coach: coachInvitations,
        // LES DEUX SENS, ET DEUX CLÉS SÉPARÉES: fondre « ce que mon coach a
        // écrit sur moi » et « ce que j'ai écrit sur mes élèves » dans une
        // seule liste rendrait l'export illisible exactement là où il compte,
        // et ce sont deux droits différents. Même découpage que `liens_coach`,
        // qui dédoublonne parce qu'un coach peut être son propre élève — ici
        // les deux listes ne se recouvrent jamais, la paire étant unique.
        notes_de_mon_coach_sur_moi: coachNotesAboutMe,
        mes_notes_sur_mes_eleves: coachNotesIWrote,
      },
      // Integrity manifest: what shipped, and what did not ship and why.
      "fichiers.json": {
        fichiers: storage.manifest,
        tables_indisponibles: keelUnavailable,
      },
    },
  };
}

// Le README et les deux notices vivent dans `export_copy.ts`: ce fichier est
// en `@ts-nocheck`, donc le compilateur n'y relit rien. Une copie testable
// hors de lui est la seule façon d'avoir un relecteur.

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  let currentUserId: string | null = null;

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    currentUserId = user.id;

    // (3a) Password attempts limiter — before touching GoTrue.
    const authRate = await enforceRateLimit(req, requestId, {
      key: `gdpr-export-auth:${user.id}`,
      windows: [
        { limit: 5, windowSeconds: 3600 },
        { limit: 10, windowSeconds: 86_400 },
      ],
    });
    if (authRate) return authRate;

    // (1) Fresh re-authentication.
    const body = await req.json().catch(() => ({}));
    const passwordOk = await verifyPasswordFresh({
      createClient,
      email: user.email ?? "",
      password: String(body?.password ?? ""),
    });
    if (!passwordOk) {
      return jsonResponse(req, { error: "invalid_password", request_id: requestId }, { status: 403 });
    }

    // (3b) The actual export quota: 1 / 24 h, only counted after a valid password.
    const exportRate = await enforceRateLimit(req, requestId, {
      key: `gdpr-export:${user.id}`,
      windows: [{ limit: 1, windowSeconds: 86_400 }],
    });
    if (exportRate) return exportRate;

    const admin = createClient(supabaseUrl, supabaseServiceRole);

    // ── LA LANGUE DU COMPTE, LUE UNE FOIS ────────────────────────────────
    //
    // R2: une archive et son alerte sont des ARTEFACTS — pas de fil à ancrer,
    // donc `resolveArtifactLocale`. Lue en service_role parce que le client
    // utilisateur ne sert ici qu'à prouver l'identité.
    const { data: localeRow } = await admin
      .from("profiles")
      .select("locale")
      .eq("id", user.id)
      .maybeSingle();
    const contentLocale = resolveArtifactLocale({
      studentProfile: String(localeRow?.locale ?? "").trim() || null,
      tenantDefault: null,
    });

    // (2) Out-of-band notification, fired before delivery so a hijacked session
    // can't quietly siphon the archive. Elle était FRANÇAISE en dur — un
    // avertissement de sécurité que son destinataire ne lit pas ne protège
    // personne.
    const notice = renderExportRequestedNotice(contentLocale);
    const [waNotified, emailResult] = await Promise.all([
      sendLifecycleMessage({
        user_id: user.id,
        purpose: "gdpr_export_requested",
        body: notice.body,
        metadata_extra: { gdpr_export: true },
      }),
      user.email
        ? sendResendEmail({
          to: user.email,
          subject: notice.subject,
          html: notice.html,
        })
        : Promise.resolve({ ok: false, error: "no_email" }),
    ]);

    // Build the archive.
    const payload = await buildExportPayload(admin, user);
    const zipEntries: Record<string, Uint8Array> = {
      "README.txt": strToU8(renderExportReadme(payload.exportedAt, contentLocale)),
    };
    for (const [name, content] of Object.entries(payload.files)) {
      zipEntries[name] = strToU8(JSON.stringify(content, null, 2));
    }
    // Storage objects (KEEL buckets) — fichiers.json above is their manifest.
    for (const [name, bytes] of Object.entries(payload.binaries)) {
      zipEntries[name] = bytes;
    }
    const zipBytes = zipSync(zipEntries, { level: 6 });

    // One export at a time per user: previous archives are replaced.
    try {
      const { data: existing } = await admin.storage.from(EXPORT_BUCKET).list(user.id);
      const stale = (existing ?? []).map((o) => `${user.id}/${o.name}`);
      if (stale.length > 0) await admin.storage.from(EXPORT_BUCKET).remove(stale);
    } catch (err) {
      console.warn("[account-export-v1] stale export cleanup failed (non-blocking)", err);
    }

    const objectPath = `${user.id}/export-sophia-${payload.exportedAt.slice(0, 10)}-${requestId.slice(0, 8)}.zip`;
    const { error: uploadErr } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(objectPath, zipBytes, { contentType: "application/zip", upsert: true });
    if (uploadErr) throw uploadErr;

    // (4) Short-lived signed URL.
    const { data: signed, error: signErr } = await admin.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS, {
        download: "export-donnees-sophia.zip",
      });
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error("signed_url_failed");

    return jsonResponse(req, {
      ok: true,
      url: signed.signedUrl,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS,
      notified_whatsapp: waNotified,
      notified_email: Boolean((emailResult as any)?.ok),
      request_id: requestId,
    });
  } catch (err) {
    console.error("[account-export-v1] error", err);
    await logEdgeFunctionError({
      functionName: "account-export-v1",
      error: err,
      severity: "error",
      title: "gdpr_export_failed",
      requestId,
      userId: currentUserId,
      source: "edge",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    return serverError(req, requestId);
  }
});
