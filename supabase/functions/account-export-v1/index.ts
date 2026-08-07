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
  formatFrenchDate,
  sendLifecycleMessage,
  verifyPasswordFresh,
} from "../_shared/account_lifecycle.ts";

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
const SCOPE = {
  cycles:
    "id,status,raw_intake_text,duration_months,requested_pace,created_at,completed_at,archived_at",
  transformations:
    "id,cycle_id,priority_order,status,title,user_summary,success_definition,main_constraint,questionnaire_answers,completion_summary,created_at,activated_at,completed_at",
  plans: "id,cycle_id,transformation_id,status,version,title,content,created_at,activated_at,completed_at,archived_at",
  planItems:
    "id,plan_id,dimension,kind,status,title,description,tracking_type,cadence_label,scheduled_days,time_of_day,target_reps,current_reps,created_at,activated_at,completed_at",
  planEntries:
    "id,plan_item_id,entry_kind,outcome,value_numeric,value_text,difficulty_level,blocker_hint,effective_at,created_at",
  memories: "id,kind,content_text,normalized_summary,observed_at,event_start_at,event_end_at,created_at",
  conversations: "role,content,scope,created_at",

  // --- KEEL (docs/keel/SCHEMA.md) --------------------------------------------
  // Same contract as above: the coach's prescription and the student's own
  // facts leave the database verbatim; internal scores never do.
  //
  // `published_by` is stripped: another person's id has no portability value
  // and the student cannot act on it. `user_id`/`student_id` are redundant with
  // the export itself and omitted everywhere.
  //
  // `coach_id` IS exported, but only on the tenancy rows below (coachClients,
  // coachAccessEvents, coachInvitations) where it is the whole point: it is the
  // key that makes two access log lines attributable to the same coach, and the
  // student is entitled to see who held a grant on their file. It stays out of
  // the protocol tables, where it would just be noise.
  //
  // DECISION — coach-authored rows are exported via `coach_id = user.id`, but
  // ONLY the ones that carry no third-party payload: plan_templates (the
  // clonable skeleton, the coach's own work) and plan_documents (their uploaded
  // source). plan_versions / plan_commitments are NOT exported on the coach
  // side: those rows are the protocol OF a named student, so they belong to
  // that student's export, not their coach's. A coach who wants them reads them
  // in the app.
  planTemplates:
    "id,title,description,content_locale,default_swap_policy,default_autonomy,default_flex_allowance,default_adherence_target_pct,commitments,version,status,created_at,updated_at",
  // ocr_result and layout_probe are excluded: machine parse artifacts (typed
  // blocks, bboxes, confidence) — the "generation snapshot" class already
  // excluded above. The source file itself ships in fichiers/documents-plan/.
  planDocuments:
    "id,template_id,storage_path,mime_type,original_filename,page_count,ingestion_path,status,parse_error,created_at",
  planVersions:
    "id,source_document_id,version,status,title,content_locale,timezone,anchor_week_start,duration_weeks,week_starts_on,phase_plan,adherence_target_pct,flex_allowance_per_week,published_at,supersedes_version_id,notes_for_student,created_at",
  commitments:
    "id,plan_version_id,polarity,activity_class,anchor_kind,slot_key,clock_local,tolerance_minutes,window_start_local,window_end_local,measure,unit,target_op,target_min,target_max,tolerance_pct,substance_ref,food_group_ref,evidence_kind,evidence_required,auto_source,counts_toward_adherence,evaluation_grain,slot_kind,scheduled_days,required_days_per_week,expected_occasions_per_day,priority,autonomy,flex_eligible,provenance,requires_clinician_signoff,title,student_instruction,content,content_locale,source_span,phase_id,auto_generated,status,created_at",
  // recognition_confidence and evidence_weight are internal scores (see header).
  // media_path is kept: it is the join key to fichiers/photos-repas/.
  protocolEvents:
    "id,occurred_at,local_date,slot_key,source,media_path,recognized,quantity,unit,substance_ref,food_group_ref,student_note,content_locale,created_at",
  // `confidence` is an internal score.
  evaluations:
    "id,commitment_id,plan_version_id,local_date,slot_key,grain,expected,observed_value,observed,status,timing_status,evidence,resolved_at,resolved_by,created_at",
  plannedDeviations:
    "id,plan_version_id,local_date,slot_key,kind,declared_at,declared_via,note,content_locale,consumed_flex,coach_visible,created_at",
  upcomingContexts: "id,local_date,slot_key,kind,source,note,content_locale,created_at",
  // LES QUESTIONS DE PRÉCISION POSÉES À L'ÉLÈVE.
  //
  // Table neuve (`20260804170000`), et elle porte de la donnée personnelle: le
  // texte exact de ce que le produit lui a demandé, et quand. Elle manquait à
  // l'export — c'est la deuxième fois que le lifecycle RGPD oublie une table
  // du pivot, et la première fois avait déjà été payée. `asked_for_message_id`
  // est un identifiant interne de corrélation, pas une donnée de l'élève: il
  // reste dehors.
  mealPrecisionQuestions:
    "id,local_date,asked_at,source,axis,protocol_event_id,question",
  // risk_band is named in the header as a non-exportable classification;
  // coach_draft_reply is the coach's unsent draft, not the student's data.
  weeklyReviews:
    "id,plan_version_id,week_start_date,plan_version_changed_midweek,logging_coverage,core_adherence_pct,overall_adherence_pct,evaluable_days,flex_used,flex_allowance,self_rated_adherence,biofeedback,outcomes,outcome_direction,lapse_context,student_narrative,content_locale,created_at",
  // sophia_evidence is the internal evidence snapshot (ids + scores); the
  // human-readable summary the coach actually reads is exported.
  changeRequests:
    "id,plan_version_id,commitment_id,raised_by,reason_code,student_words,sophia_summary,suggested_option,urgency,status,coach_decision,content_locale,created_at,resolved_at",
  // Health data declared by or about the user: exported in full.
  safetyConstraints:
    "id,kind,allergen_ref,substance_ref,medication_class,severity,declared_by,notes,content_locale,created_at,updated_at",
  // La note 1:1 du coach sur un élève (2026-08-05). Elle est exportée DES DEUX
  // CÔTÉS, et le côté élève est le seul qui soit obligatoire: c'est une donnée
  // personnelle le concernant, écrite par un tiers, donc couverte par son droit
  // d'accès. L'écran coach le lui dit avant qu'il n'écrive.
  coachNotes: "id,coach_id,student_user_id,note,created_at,updated_at",
  // W1.4 R5 — commitment_relations. The evaluator must never read this table
  // (CONTRACT.md NON-INPUTS #1), but that is a rule about GRADING, not about
  // portability: the rows are part of the protocol written for this student
  // ("take it with fat", "keep 2 h from the iron") and the app shows them.
  // The table has no user_id — it hangs off plan_commitments — so it is fetched
  // by commitment id, not by owner.
  commitmentRelations:
    "id,commitment_a,commitment_b,relation_kind,param_minutes,cofactor_ref,created_at",

  // --- PIVOT NUTRITION (20260803031000, 20260803160000) ----------------------
  // AGENT 13 — ces cinq tables portent ce que l'élève DÉCIDE et ce qu'il
  // DÉCLARE. Elles étaient absentes de l'export: un compte exporté rendait un
  // `tables_indisponibles: []` (donc « rien ne manque ») en ayant laissé son
  // objectif, son plan de la semaine, ses taps du soir, ses repas habituels et
  // ses préférences dans la base. Mesuré sur un élève « plein », 2026-08-03.
  //
  // `generated_from` EST exporté: c'est la réponse à « pourquoi Sophia m'a
  // proposé ça », et le §3.7 brique 3 en fait une exigence d'observabilité.
  // Les deux cibles sont des données que l'ÉLÈVE a déclarées sur son corps: si
  // quoi que ce soit doit sortir dans son export, c'est bien ça. L'allowlist
  // est par colonne, donc une colonne neuve est absente par défaut — ce dépôt a
  // déjà oublié neuf tables du pivot dans ce même fichier.
  studentGoals:
    "id,goal,situation,aspiration,focus_axis,practical_constraints,target_weight_kg," +
    "target_waist_cm,content_locale,created_at,updated_at",
  studentWeekPlans:
    "id,week_start,generated_from,items,status,adopted_at,content_locale,created_at,updated_at",
  studentDailyCheckins: "id,local_date,overall,axis,source,created_at",
  // Le repas généré porte le CONTEXTE DE VIE que l'élève a écrit (« mariage
  // mardi ») et le contenu de ses placards. C'est de la donnée personnelle au
  // sens plein, et elle sort avec le reste.
  studentGeneratedMeals:
    "id,scope,mode,meal_slot,servings,context,pantry,dishes,shopping_list,generated_from,content_locale,created_at,updated_at",
  // `storage_path` sort aussi: c'est ce qui relie la ligne au PDF joint dans
  // `fichiers/`, et sans lui le manifeste et les octets ne se recollent pas.
  studentMealDocuments:
    "id,meal_id,kind,storage_path,filename,delivery_status,delivery_error,sent_at,created_at,updated_at",
  // `portion_bias` est une calibration ORDINALE (bandes), pas un score interne:
  // elle est lisible par l'élève et sort avec le reste.
  recurringMeals:
    "id,label,canonical_items,slot_key,occurrences,last_seen_at,portion_bias,status,confirmed_at,content_locale,created_at,updated_at",
  // `source_message_id` reste dedans ici (contrairement à protocol_events): sur
  // student_facts c'est un id de message de l'élève LUI-MÊME, donc la trace de
  // « d'où vient ce que le système croit de moi » — précisément ce qu'un
  // export doit permettre de contester.
  studentFacts:
    "id,kind,value,note,content_locale,status,invalidated_at,superseded_by_fact_id,source_message_id,declared_by,created_at,updated_at",

  // --- CARTES: RETIRÉES DE L'EXPORT (retrait résidus grand public) -----------
  // `student_cards`, `card_armings`, `card_wins` sont DROPPÉES par
  // 20260808070000 — cartes démontées au pivot (route et cron débranchés le
  // 2026-08-03), retrait confirmé par l'humain le 2026-08-08 (0 utilisateur
  // grand public). Même traitement que recurring_meals/student_facts plus bas:
  // la section reste dans le bundle, vide, sans interroger la base.

  // --- ÉCHAFAUDAGE REPAS: RETIRÉ DE L'EXPORT (20260804210000) ---------------
  // `meal_ideas` était exporté scopé sur `meal_ideas.student_id`, et
  // `meal_plan_entries` sur `student_id` — les deux ont disparu avec la
  // composition 1:1. La bibliothèque de recettes est désormais GLOBALE: elle
  // appartient au coach, elle est identique pour toute sa cohorte, et elle ne
  // contient aucune donnée personnelle de CET élève.
  //
  // Un export RGPD porte les données de la personne, pas le matériel qu'elle a
  // consulté. Les y remettre gonflerait l'archive du contenu d'un tiers — et le
  // scoper serait impossible: il n'existe plus aucune colonne qui relie une
  // recette à un élève.

  // --- CÔTÉ COACH (20260803031000) -------------------------------------------
  // La doctrine est la propriété intellectuelle du coach, et elle est à lui.
  // `compiled_prompt` / `compiled_prompt_hash` sont exclus: bloc de prompt
  // assemblé et sa clé de cache — la classe « no system prompts » de l'en-tête.
  // `published_by` exclu (id d'un tiers).
  coachDoctrines:
    "id,version,beliefs,forbidden,vocabulary,arbitrations,voice,content_locale,published_at,created_from_version,change_note,created_at,updated_at",
  cohorts:
    "id,label,content_locale,plan_template_id,starts_on,duration_weeks,status,created_at,updated_at",
  // DÉCISION — `narrative` et `flagged_students` NE SONT PAS exportés.
  // Ce sont des listes d'AUTRES personnes (nom rendu, uuid, risk_band,
  // adhérence). Les faire sortir dans l'archive d'un coach transformerait son
  // export en dump des scores internes de ses élèves — exactement la raison
  // pour laquelle `plan_versions` / `plan_commitments` sont déjà hors du côté
  // coach. Ce qui sort est l'AGRÉGAT de sa propre pratique.
  coachSyntheses:
    "id,cohort_id,kind,period_start,period_end,metrics,content_locale,generated_at,delivered_at,delivery_channel,created_at",
  // 20260806100000 — les aliments lus dans les DOCUMENTS du coach, en attente
  // de son tri. Tout sort, y compris `quote`: la citation vient de son propre
  // PDF, elle est à lui, et c'est précisément la colonne qui lui permet de
  // vérifier ce que la lecture automatique a retenu de son matériel. Aucune
  // colonne ne désigne un tiers.
  coachFoodProposals:
    "id,term,quote,content_locale,stance,food_group_ref,food_item_ref,source_label,status,created_at,resolved_at",
  // 20260806140000 — le corpus des documents du coach. Tout sort: c'est SON
  // ebook, son texte, ses citations. `storage_path` sort aussi, et il n'est
  // pas décoratif — le fichier lui-même part dans `fichiers/documents-plan`
  // (bucket `plan-documents`), et sans le chemin il ne saurait pas quel PDF de
  // l'archive correspond à quelle ligne.
  coachDocuments:
    "id,filename,byte_size,page_count,content_locale,content_sha256,storage_path,text_status,text_chars,chunk_count,created_at",
  // Le texte intégral de ses propres documents. Volumineux, et c'est la
  // raison de l'exporter: c'est exactement ce qu'on a gardé de lui.
  coachDocumentChunks: "id,document_id,ordinal,page_number,text,char_count",
  coachDocumentCitations:
    "id,document_id,chunk_id,entry_kind,entry_key,quote,page_number,created_at",

  // TENANCY (20260727120000).
  coachClients:
    "id,coach_id,student_user_id,invited_email,status,consent_granted_at,seat_state,started_at,ended_at,created_at",
  // Server-written audit log, readable by the student (SCHEMA.md TENANCY): the
  // point of exporting it is that the student sees who opened their file.
  coachAccessEvents: "id,coach_id,student_user_id,surface,occurred_at",
  // W1.4 R5 — coach_invitations used to be excluded WHOLESALE because of
  // `invite_token_hash`. Excluding a table to exclude one column also hid who
  // invited the student, when, and whether the offer is still standing. The
  // allowlist keeps the facts and drops the hash: a hash of a live credential
  // has no place in an archive the user is told to keep on their own disk.
  // `invite_token_hash` must NEVER be added to this list.
  coachInvitations:
    "id,coach_id,email,status,expires_at,created_at,accepted_at",
};

async function buildExportPayload(
  admin: ReturnType<typeof createClient>,
  user: { id: string; email: string | null; created_at?: string },
) {
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("full_name,email,phone_number,birth_date,gender,timezone,locale,proactive_muted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) throw profErr;

  const [cycles, transformations, plans, planItems, planEntries, memories, conversations] =
    await Promise.all([
      fetchAllRows(admin, "user_cycles", SCOPE.cycles, "user_id", user.id),
      // user_transformations hangs off user_cycles (no user_id of its own).
      (async () => {
        const { data: cycleIds, error } = await admin
          .from("user_cycles")
          .select("id")
          .eq("user_id", user.id);
        if (error) throw error;
        const ids = (cycleIds ?? []).map((c) => c.id);
        if (ids.length === 0) return [];
        const { data, error: trErr } = await admin
          .from("user_transformations")
          .select(SCOPE.transformations)
          .in("cycle_id", ids)
          .order("created_at", { ascending: true });
        if (trErr) throw trErr;
        return data ?? [];
      })(),
      fetchAllRows(admin, "user_plans_v2", SCOPE.plans, "user_id", user.id),
      fetchAllRows(admin, "user_plan_items", SCOPE.planItems, "user_id", user.id),
      fetchAllRows(admin, "user_plan_item_entries", SCOPE.planEntries, "user_id", user.id),
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
    studentGeneratedMeals,
    studentMealDocuments,
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
        bilans_hebdomadaires: weeklyReviews,
        demandes_ajustement: changeRequests,
      },
      "securite.json": { contraintes: safetyConstraints },
      // AGENT 13 — le pivot 1:N: le coach recommande, l'ÉLÈVE décide. Ce
      // fichier porte ce qu'il a décidé, pas ce qu'on lui a prescrit; c'est
      // pour ça qu'il est séparé de protocole.json.
      "mon_plan.json": {
        objectif: studentGoals,
        semaines: studentWeekPlans,
        points_du_soir: studentDailyCheckins,
      },
      // Séparé de `mon_plan.json`: un plan de semaine est un ENGAGEMENT que
      // l'élève adopte, un repas généré est un SERVICE rendu à la demande. Les
      // mêler ferait lire vingt repas comme vingt semaines de plan.
      "mes_repas_generes.json": {
        repas: studentGeneratedMeals,
        documents: studentMealDocuments,
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

function readmeText(exportedAtIso: string): string {
  return [
    "EXPORT DE TES DONNÉES SOPHIA",
    "============================",
    "",
    `Export généré le : ${formatFrenchDate(exportedAtIso)}`,
    "",
    "Contenu de l'archive :",
    "  - profil.json          : tes informations de compte (nom, email, téléphone…).",
    "  - transformations.json : tes cycles et transformations tels que visibles dans l'app.",
    "  - plans.json           : tes plans et les actions qui les composent.",
    "  - suivi.json           : tes entrées de suivi (check-ins, progrès, blocages).",
    "  - souvenirs.json       : les souvenirs que Sophia a retenus de vos échanges.",
    "  - conversations.json   : l'historique de tes conversations avec Sophia.",
    "  - protocole.json       : le protocole écrit par ton coach (versions, engagements,",
    "                           relations entre engagements) et, si tu es coach, tes",
    "                           modèles, documents importés, doctrine, cohortes et",
    "                           l'agrégat de tes synthèses hebdomadaires.",
    "  - mon_plan.json        : ton objectif, les semaines que tu t'es fixées et tes",
    "                           points du soir.",
    "  - ma_memoire_alimentaire.json : tes repas récurrents, tes préférences et ton",
    "                           contexte, et les idées de repas reçues.",
    "  - mes_cartes.json      : tes cartes, quand elles ont été armées et ce que tu en",
    "                           as fait.",
    "  - protocole_suivi.json : ce que tu as déclaré (repas, prises, photos) et les",
    "                           évaluations qui en découlent, jour par jour.",
    "  - protocole_bilans.json: tes bilans hebdomadaires et tes demandes d'ajustement.",
    "  - securite.json        : tes contraintes de sécurité (allergies, intolérances,",
    "                           traitements) telles que déclarées.",
    "  - coaching.json        : tes liens avec un coach, les invitations reçues ou",
    "                           envoyées, les accès à ton dossier, et les notes",
    "                           que ton coach a écrites à ton sujet (ainsi que",
    "                           celles que tu as écrites, si tu es coach).",
    "  - fichiers.json        : la liste de tes fichiers, avec pour chacun s'il est",
    "                           inclus dans l'archive et, sinon, pourquoi. Si son",
    "                           champ « tables_indisponibles » n'est pas vide, une",
    "                           partie des données ci-dessus manque : écris-nous.",
    "  - fichiers/            : tes documents de plan et tes photos de repas.",
    "",
    "⚠ AVERTISSEMENT",
    "Ce fichier contient des données personnelles sensibles (dont l'historique de",
    "tes conversations). Conserve-le en lieu sûr, ne le partage pas et supprime-le",
    "des espaces partagés ou synchronisés si tu n'en as plus besoin.",
    "",
    "Format : JSON (UTF-8), lisible avec n'importe quel éditeur de texte.",
    "Pour toute question : sophia@sophia-coach.ai",
    "",
  ].join("\n");
}

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

    // (2) Out-of-band notification, fired before delivery so a hijacked session
    // can't quietly siphon the archive.
    const notifyBody =
      "Un export de tes données Sophia vient d'être demandé depuis ton compte. " +
      "Si ce n'est pas toi, change ton mot de passe immédiatement.";
    const [waNotified, emailResult] = await Promise.all([
      sendLifecycleMessage({
        user_id: user.id,
        purpose: "gdpr_export_requested",
        body: notifyBody,
        metadata_extra: { gdpr_export: true },
      }),
      user.email
        ? sendResendEmail({
          to: user.email,
          subject: "Sophia — un export de tes données vient d'être demandé",
          html:
            `<p>Bonjour,</p><p>${notifyBody}</p><p>— L'équipe Sophia</p>`,
        })
        : Promise.resolve({ ok: false, error: "no_email" }),
    ]);

    // Build the archive.
    const payload = await buildExportPayload(admin, user);
    const zipEntries: Record<string, Uint8Array> = {
      "README.txt": strToU8(readmeText(payload.exportedAt)),
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
