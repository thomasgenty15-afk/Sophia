// @ts-nocheck
// J+7 hard purge of accounts flagged deletion_pending (internal cron, daily).
//
// Idempotent and crash-resumable by construction: the profile row (and thus the
// selection criterion) only disappears at the very last step (auth user delete),
// so a run that dies mid-user simply redoes that user on the next tick. Every
// intermediate write is an upsert or an unconditional DELETE.
//
// Per-user order:
//   1. upsert the anonymised proof into deletion_records (hashes only)
//   2. delete storage objects under <user_id>/ in every bucket (gdpr-exports,
//      plan-documents, meal-photos) — paginated, storage.list() caps at 100
//   3. explicit deletes for tables whose FK is ON DELETE SET NULL but whose rows
//      still carry personal data (message contents, phone numbers, error payloads),
//      plus the FK-less rate-limit counters keyed by user id
//   3bis. anonymise the ONE reference that must survive: the coach's weekly
//      synthesis. It belongs to the coach, so it does not cascade — but it
//      carried the student's uuid AND their rendered full name (AGENT 13).
//      Runs BEFORE step 4, because the name is read from `profiles`.
//   4. auth.admin.deleteUser → cascades profiles + the ~80 ON DELETE CASCADE tables;
//      llm_usage_events is anonymised (user_id → NULL) by its SET NULL FK, keeping
//      cost accounting without personal data.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  ACCOUNT_STATUS_DELETION_PENDING,
  hashEmail,
  hashPhone,
  hashUserId,
} from "../_shared/account_lifecycle.ts";

const BATCH_SIZE = 25;
const EXPORT_BUCKET = "gdpr-exports";
// Every bucket whose objects are keyed `<user_id>/…` (KEEL convention, see
// 20260727130000_keel_storage.sql). Missing a bucket here means personal files
// survive a "hard" purge.
// `meal-documents` porte les PDF de repas et de courses. Ils contiennent le
// contexte de vie que l'élève a écrit (« mariage mardi ») et ses contraintes
// alimentaires: sans cette entrée, un compte « effacé » laisse ces feuilles
// intactes dans le bucket. Ajouté avec la table, pas après — c'est la classe de
// trou que ce dépôt a déjà eue sur les tables neuves du pivot.
const PURGE_BUCKETS = [EXPORT_BUCKET, "plan-documents", "meal-photos", "meal-documents"];
// storage.list() returns at most 100 objects by default and gives NO truncation
// signal — a single call purges the first 100 photos and silently leaves the
// rest. Hence the explicit paginated walk below.
const STORAGE_LIST_PAGE = 100;
const STORAGE_REMOVE_BATCH = 100;
const STORAGE_MAX_PAGES = 2000;
const STORAGE_MAX_DEPTH = 4;

function requireEnv(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Enumerates every object under `prefix`, walking nested prefixes, WITHOUT
// deleting during the walk: offset pagination shifts under concurrent deletes,
// which is how a paginated purge skips objects. Collect first, remove after.
async function listPrefixObjects(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
  depth: number,
): Promise<string[]> {
  // R7: a depth overrun is NOT a reason to return an empty list — that would
  // report a completed purge while leaving personal files in the bucket. The
  // walk fails loudly and the user is retried on the next cron pass.
  if (depth > STORAGE_MAX_DEPTH) {
    throw new Error(`storage_walk_too_deep:${bucket}/${prefix}`);
  }
  const paths: string[] = [];
  const nested: string[] = [];
  for (let page = 0; page < STORAGE_MAX_PAGES; page++) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: STORAGE_LIST_PAGE,
      offset: page * STORAGE_LIST_PAGE,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      // A bucket that does not exist on this stack is not a purge blocker; a
      // bucket that starts answering and then fails mid-walk is (R7: never
      // report a purge that did not happen).
      if (page === 0 && depth === 0) {
        console.warn(`[purge-deleted-accounts] storage list failed for ${bucket}/${prefix}`, error);
        return [];
      }
      throw error;
    }
    const entries = data ?? [];
    for (const entry of entries) {
      const name = String(entry?.name ?? "");
      if (!name) continue;
      const path = `${prefix}/${name}`;
      // A nested prefix ("folder") has a null id; a real object has one.
      if (entry?.id == null) nested.push(path);
      else paths.push(path);
    }
    if (entries.length < STORAGE_LIST_PAGE) break;
    if (page === STORAGE_MAX_PAGES - 1) {
      throw new Error(`storage_walk_exhausted:${bucket}/${prefix}`);
    }
  }
  for (const sub of nested) {
    paths.push(...await listPrefixObjects(admin, bucket, sub, depth + 1));
  }
  return paths;
}

// Deletes everything under `<prefix>/` in one bucket. Idempotent: a re-run on an
// already-empty prefix removes nothing and succeeds.
async function purgeBucketPrefix(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<number> {
  const paths = await listPrefixObjects(admin, bucket, prefix, 0);
  for (const batch of chunk(paths, STORAGE_REMOVE_BATCH)) {
    const { error: rmErr } = await admin.storage.from(bucket).remove(batch);
    if (rmErr) throw rmErr;
  }
  return paths.length;
}

async function deleteUserStorage(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  for (const bucket of PURGE_BUCKETS) {
    await purgeBucketPrefix(admin, bucket, userId);
  }
}

/**
 * DE-WHATSAPP — ce qu'il reste à purger côté messagerie.
 *
 * ── CE QUI A DISPARU DE CETTE FONCTION, ET POURQUOI ──────────────────────────
 * `whatsapp_outbound_status_events` (accusés de réception Meta, sans FK, reliés
 * par `provider_message_id` et portant le numéro dans `recipient_id`) et
 * `whatsapp_link_requests` (liaison d'un numéro à un compte) sont DROPPÉES par
 * la migration `20260804130000`: plus aucune donnée personnelle à y effacer.
 * La pagination sur 50 pages de `provider_message_id` qui existait pour les
 * atteindre disparaît avec elles.
 *
 * ── CE QUI RESTE, ET POURQUOI ÇA RESTE ───────────────────────────────────────
 * `whatsapp_cost_events` est GELÉE, pas supprimée: elle porte le coût réel payé
 * à Meta et c'est la donnée qui justifie l'abandon du canal. **Un gel n'est pas
 * une exemption au droit à l'effacement** — les lignes d'un compte supprimé
 * partent toujours.
 *
 * `outbound_messages` porte l'historique de livraison, WhatsApp et in-app
 * confondus. Elle est purgée par `user_id`, comme avant.
 */
async function purgeMessagingTraces(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { error: costErr } = await admin
    .from("whatsapp_cost_events")
    .delete()
    .eq("user_id", userId);
  if (costErr) throw costErr;

  const { error: outErr } = await admin
    .from("outbound_messages")
    .delete()
    .eq("user_id", userId);
  if (outErr) throw outErr;

  // Idempotence des entrants in-app: elle porte `user_id` et un identifiant
  // fourni par le client. Elle CASCADE sur `auth.users`, mais la purge est
  // explicite ici pour la même raison que les autres — ne rien laisser dépendre
  // d'un ON DELETE qu'on n'a pas relu.
  const { error: dedupErr } = await admin
    .from("inbound_dedup")
    .delete()
    .eq("user_id", userId);
  if (dedupErr) throw dedupErr;
}

async function purgeOneUser(
  admin: ReturnType<typeof createClient>,
  profile: {
    id: string;
    email: string | null;
    phone_number: string | null;
    // Le NOM: il ne sert qu'a l'anonymisation de coach_syntheses, et il doit
    // etre lu AVANT que profiles ne parte en cascade.
    full_name: string | null;
  },
): Promise<void> {
  const userId = profile.id;

  // Canonical email lives in auth; profiles.email can lag behind.
  let authEmail: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    authEmail = data?.user?.email ?? null;
  } catch {
    // The auth user may already be gone from a previous partial run.
  }

  // 1) Proof of deletion first: if we crash later, the retry upserts the same
  //    row (user_id_hash is unique) without duplicating it.
  const record = {
    user_id_hash: await hashUserId(userId),
    email_hash: await hashEmail(authEmail ?? profile.email),
    phone_hash: await hashPhone(profile.phone_number),
  };
  const { error: recErr } = await admin
    .from("deletion_records")
    .upsert(record, { onConflict: "user_id_hash", ignoreDuplicates: true });
  if (recErr) throw recErr;

  // 2) Stored files: RGPD exports, plan documents, meal photos.
  await deleteUserStorage(admin, userId);

  // 3) Personal data in SET-NULL / FK-less tables.
  await purgeMessagingTraces(admin, userId);

  // LE LOG DE SÉANCE (20260818180000). Ce que quelqu'un a fait de son corps,
  // quel jour et combien de temps: donnée personnelle au sens plein.
  //
  // ⚠️ EXPLICITE, ALORS QUE LA FK EST DÉJÀ `ON DELETE CASCADE`. Même règle que
  // `inbound_dedup` juste au-dessus: ne rien laisser dépendre d'un ON DELETE
  // qu'on n'a pas relu. Et surtout — « le cycle de vie RGPD ne réclame pas les
  // tables neuves » est une cicatrice chiffrée de ce dépôt (neuf tables du
  // pivot hors export ET hors purge pendant des mois). Une table réclamée ici
  // le jour de sa migration ne peut pas devenir la dixième.
  //
  // L'erreur REMONTE: une purge qui rendrait « réussi » en laissant ces lignes
  // serait exactement le mensonge que ce fichier existe pour éviter. Un échec
  // bruyant se rejoue au tick suivant.
  const { error: activityErr } = await admin
    .from("student_activity_sessions")
    .delete()
    .eq("user_id", userId);
  if (activityErr) throw activityErr;

  const { error: selErr } = await admin
    .from("system_error_logs")
    .delete()
    .eq("user_id", userId);
  if (selErr) throw selErr;

  // Compteurs de limitation de débit: clés `<surface>:<user_id>:<fenêtre>`.
  // Aucune FK, donc aucune cascade. Ils expirent en < 24 h et un cron les
  // ramasse, mais « plus une ligne » doit être vrai à la seconde où la purge
  // rend la main, pas dans une journée.
  const { error: rateErr } = await admin
    .from("rate_limit_counters")
    .delete()
    .like("bucket_key", `%${userId}%`);
  if (rateErr) throw rateErr;

  // 3bis) LA RÉFÉRENCE QUI DOIT SURVIVRE, ANONYMISÉE.
  //
  // `coach_syntheses` appartient au COACH: elle ne casse pas avec l'élève, et
  // c'est voulu — un rapport hebdomadaire qui se réécrit tout seul n'est plus
  // un rapport. Mais elle portait l'élève en clair sur deux colonnes:
  // `flagged_students[].student_user_id` (son uuid) et `narrative` (son NOM,
  // rendu par nameOf() dans la section « To catch up »).
  //
  // AVANT le delete auth, parce que le nom vient de `profiles`, qui part en
  // cascade juste après. La ligne « à rattraper » reste (le rapport garderait
  // sinon 2 élèves là où le coach en a lu 3); c'est QUI c'était qui disparaît.
  const { error: anonErr } = await admin.rpc("keel_anonymise_purged_student", {
    p_user_id: userId,
    p_full_name: profile.full_name ?? null,
  });
  // On ne l'avale pas: la fonction relit et lève si une trace subsiste. Laisser
  // passer ici rendrait une purge « réussie » avec le nom encore en base.
  if (anonErr) throw anonErr;

  // 3ter) LE FOYER — LA BOUCHE NE PART PAS AVEC LE COMPTE (chantier 2, D3).
  //
  // La ligne de `household_members` n'est pas le dossier de la personne: c'est
  // ce que le compte maître a saisi pour cuisiner, et elle porte la portion,
  // les allergies et les contraintes qui composent le repas de tout le foyer.
  // Elle est donc DÉTACHÉE (`user_id` → NULL) et survit — sauf si la personne
  // a coché « retirer aussi ma place dans ce foyer » à T0, auquel cas elle
  // part ici, avec le compte, sans délai propre.
  //
  // EXPLICITE, alors que la FK ferait déjà `set null` toute seule: même règle
  // que `inbound_dedup` plus haut — ne rien laisser dépendre d'un ON DELETE
  // qu'on n'a pas relu. Et AVANT le delete auth, pour que le résultat soit
  // lisible ('removed' / 'detached') plutôt que déduit d'une cascade muette.
  //
  // ⚠️ ON NE L'AVALE PAS, ET ÇA IMPOSE UN ORDRE DE DÉPLOIEMENT: la migration
  // `20260811040000` AVANT ce deploy. Le voisin `endCoachClientLinks` avale
  // une table absente; ici ce serait un piège, parce que sur une pile sans la
  // migration la FK vaut encore ON DELETE CASCADE — avaler l'erreur rendrait
  // donc une purge « réussie » qui a DÉTRUIT la bouche en silence, c'est-à-dire
  // exactement le défaut que ce lot ferme. Un échec bruyant se rejoue au tick
  // suivant; une bouche effacée ne revient pas.
  const { error: householdErr } = await admin.rpc("keel_household_purge_user", {
    p_user: userId,
  });
  if (householdErr) throw householdErr;

  // 4) Final step: delete the auth user (SQL RPC — see purge_auth_user in the
  //    migration). This cascades profiles and every ON DELETE CASCADE table,
  //    and anonymises llm_usage_events via SET NULL. Deleting an already-gone
  //    user is a no-op, which keeps re-runs safe.
  const { error: delErr } = await admin.rpc("purge_auth_user", { p_user_id: userId });
  if (delErr) throw delErr;
  // Orphaned profile without an auth user (should not happen, but a partial
  // historical state must not wedge the purge forever).
  const { error: orphanErr } = await admin.from("profiles").delete().eq("id", userId);
  if (orphanErr) throw orphanErr;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  const guard = ensureInternalRequest(req);
  if (guard) return guard;

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ══════════════════════════════════════════════════════════════════════
    // L'HORLOGE EST UNE ENTRÉE — SOUS UN NOM QUI DIT CE QUE C'EST.
    //
    // Ce job est le SEUL cron du pivot dont l'horloge n'était pas injectable
    // (`keel-daily-pulse-v1`, `keel-weekly-flow-v1`, `keel-reengage-v1`,
    // `coach-synthesis-v1`, `provision-day-v1` acceptent tous `now`). Or son
    // délai est de SEPT JOURS: sans horloge injectable, la purge RGPD ne peut
    // se prouver qu'en attendant une semaine — c'est-à-dire jamais.
    // Mesuré (QA WEB L9): compte supprimé avec `purge_at = J+7`, cron tiré
    // avec `{"now": J+8}` → `purged: 0`, parce que le champ était ignoré.
    //
    // LE CHAMP S'APPELLE `simulated_now` ET PAS `now`, DÉLIBÉRÉMENT. Ce job
    // efface des données personnelles de façon IRRÉVERSIBLE. Sur les autres
    // crons, une horloge trop avancée envoie un message en trop; ici, elle
    // purgerait un compte AVANT la fin de son délai de rétractation. Un nom
    // explicite, plus un log d'avertissement à chaque usage, rendent
    // impossible de l'employer sans le savoir — et rendent l'emploi visible
    // dans les journaux de production s'il arrivait.
    // ══════════════════════════════════════════════════════════════════════
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const simulatedRaw = String(
      (body as Record<string, unknown>)?.simulated_now ?? "",
    ).trim();
    const simulated = simulatedRaw ? new Date(simulatedRaw) : null;
    const nowIso = simulated && Number.isFinite(simulated.getTime())
      ? simulated.toISOString()
      : new Date().toISOString();
    if (simulated && Number.isFinite(simulated.getTime())) {
      console.warn("[purge-deleted-accounts] SIMULATED CLOCK IN USE", {
        request_id: requestId,
        simulated_now: nowIso,
        real_now: new Date().toISOString(),
        detail:
          "la fenêtre de sélection est calculée sur une horloge fournie par " +
          "l'appelant. Attendu en QA; en production, c'est un incident.",
      });
    }
    let purged = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    // Loop until the batch drains; a failing user is skipped (it stays selected,
    // so we must not loop forever on it — hence the seen-set).
    const seen = new Set<string>();
    for (let round = 0; round < 40; round++) {
      const { data: due, error } = await admin
        .from("profiles")
        .select("id,email,phone_number,full_name")
        .eq("account_status", ACCOUNT_STATUS_DELETION_PENDING)
        .lte("purge_at", nowIso)
        .order("purge_at", { ascending: true })
        .limit(BATCH_SIZE);
      if (error) throw error;

      const fresh = (due ?? []).filter((p) => !seen.has(p.id));
      if (fresh.length === 0) break;

      for (const profile of fresh) {
        seen.add(profile.id);
        try {
          await purgeOneUser(admin, profile);
          purged++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[purge-deleted-accounts] purge failed for ${profile.id}`, err);
          errors.push({ user_id: profile.id, error: msg });
          await logEdgeFunctionError({
            functionName: "purge-deleted-accounts",
            error: err,
            severity: "error",
            title: "purge_failed_for_user",
            requestId,
            userId: profile.id,
            source: "edge",
          });
        }
      }
    }

    return jsonResponse(
      req,
      { ok: true, purged, errors, request_id: requestId },
      { includeCors: false },
    );
  } catch (err) {
    console.error("[purge-deleted-accounts] error", err);
    await logEdgeFunctionError({
      functionName: "purge-deleted-accounts",
      error: err,
      severity: "error",
      title: "purge_run_failed",
      requestId,
      source: "edge",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    return jsonResponse(req, { error: msg, request_id: requestId }, {
      status: 500,
      includeCors: false,
    });
  }
});
