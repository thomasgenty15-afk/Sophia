/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { compileDoctrineBlock, parseCoachDoctrine } from "../_shared/keel/doctrine.ts";
import {
  buildInterviewCompilePrompt,
  buildReplayPrompt,
  diffDoctrines,
  DOCTRINE_COMPILE_SYSTEM_PROMPT,
  type DoctrineVersionRow,
  INTERVIEW_QUESTIONS,
  nextVersionNumber,
  planRollback,
} from "../_shared/keel/doctrine_versions.ts";

/**
 * PIVOT NUTRITION §3.7 — le Doctrine Copilot.
 *
 * « Le coach n'est ni prompt-engineer ni développeur. L'écran Doctrine n'est
 * donc PAS un textarea brut. » Cette fonction porte les briques 1, 2 et 6:
 *
 *   questions   — les questions de l'interview (l'écran et le prompt lisent LA
 *                 MÊME liste; deux listes divergeraient au premier ajout)
 *   compile     — brique 1: l'interview -> doctrine structurée (LLM transcripteur)
 *   save        — écrit un BROUILLON (jamais publié directement)
 *   publish     — brique 6: publie, et invalide le cache PAR CONSÉQUENCE
 *   rollback    — brique 6: COPIE une version passée dans une neuve
 *   replay      — brique 2: rejoue un échange passé sous la doctrine courante
 *   list        — l'historique, avec la version publiée marquée
 *
 * AUCUNE action n'écrit dans les données d'un élève. Le coach reste
 * structurellement propriétaire de SA doctrine et de rien d'autre.
 */

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** JWT -> `coaches` actif. Aucun `coach_id` n'est accepté du client. */
async function requireCoach(
  req: Request,
  admin: SupabaseClient,
): Promise<{ coachId: string; userId: string; displayName: string | null } | Response> {
  const requestId = getRequestId(req);
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
  }
  const { data: coach, error: coachErr } = await admin
    .from("coaches")
    .select("id, status, display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (coachErr) throw coachErr;
  if (!coach) {
    return jsonResponse(req, { error: "not_a_coach", request_id: requestId }, { status: 403 });
  }
  const row = coach as { id: string; status: string; display_name: string | null };
  if (row.status !== "active") {
    return jsonResponse(req, { error: "coach_suspended", request_id: requestId }, { status: 403 });
  }
  return { coachId: row.id, userId: user.id, displayName: row.display_name };
}

async function loadVersions(
  admin: SupabaseClient,
  coachId: string,
): Promise<DoctrineVersionRow[]> {
  const { data, error } = await admin
    .from("coach_doctrines")
    .select("version, published_at, created_from_version, change_note, created_at")
    .eq("coach_id", coachId)
    .order("version", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DoctrineVersionRow[];
}

async function loadDoctrineRow(
  admin: SupabaseClient,
  coachId: string,
  version: number,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("coach_doctrines")
    .select("*")
    .eq("coach_id", coachId)
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Record<string, unknown> | null;
}

/**
 * LA DOCTRINE COURANTE, DANS LA FORME QUE L'ÉDITEUR SAIT AFFICHER.
 *
 * LE DÉFAUT QUE ÇA FERME (signalé par un coach, 2026-08-05)
 * ---------------------------------------------------------
 * `list` ne rend que des MÉTADONNÉES (numéro de version, date, note). Aucune
 * action ne rendait le CONTENU. Conséquence: une doctrine déjà écrite était
 * invisible sur son propre écran, et la seule façon d'en produire une était de
 * refaire l'interview de zéro. Un coach qui revient pour corriger UNE phrase
 * devait tout redire.
 *
 * ── POURQUOI ON NORMALISE EN snake_case ICI ──────────────────────────────
 * Deux écritures coexistent légitimement en base: `save` écrit verbatim ce que
 * l'éditeur envoie (`surface_forms`, `coach_answer`), et un seed ou un import
 * peut avoir écrit la forme camelCase que `parseCoachDoctrine` accepte aussi
 * (`f.surface_forms ?? f.surfaceForms`). Le parseur de l'agent tolère les deux;
 * l'ÉDITEUR, lui, ne lit qu'une seule forme.
 *
 * Renvoyer la forme camelCase telle quelle afficherait donc des champs VIDES
 * sur des données présentes — et le premier « enregistrer » les écraserait pour
 * de bon. On convertit, pour que ce que le coach voit soit ce qui est stocké.
 */
function toEditorShape(row: Record<string, unknown>): Record<string, unknown> {
  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  const forms = (e: Record<string, unknown>): string[] => {
    const raw = e.surface_forms ?? e.surfaceForms;
    return Array.isArray(raw) ? raw.map((x) => String(x ?? "")).filter(Boolean) : [];
  };
  const foods = (row.foods ?? {}) as Record<string, unknown>;
  return {
    beliefs: arr(row.beliefs).map((b) => ({
      claim: String(b.claim ?? ""),
      rationale: b.rationale == null ? null : String(b.rationale),
    })),
    forbidden: arr(row.forbidden).map((f) => ({
      token: String(f.token ?? ""),
      surface_forms: forms(f),
      reason: f.reason == null ? null : String(f.reason),
      instead: f.instead == null ? null : String(f.instead),
    })),
    vocabulary: arr(row.vocabulary).map((v) => ({
      term: String(v.term ?? ""),
      meaning: v.meaning == null ? null : String(v.meaning),
    })),
    arbitrations: arr(row.arbitrations).map((a) => ({
      situation: String(a.situation ?? ""),
      coach_answer: String(a.coach_answer ?? a.coachAnswer ?? ""),
    })),
    foods: {
      recommended: arr(foods.recommended).map((f) => ({
        term: String(f.term ?? ""),
        surface_forms: forms(f),
        reason: f.reason == null ? null : String(f.reason),
      })),
      discouraged: arr(foods.discouraged).map((f) => ({
        term: String(f.term ?? ""),
        surface_forms: forms(f),
        reason: f.reason == null ? null : String(f.reason),
      })),
    },
    qa: arr(row.qa).map((q) => ({
      question: String(q.question ?? ""),
      answer: String(q.answer ?? ""),
    })),
    voice: (row.voice ?? {}) as Record<string, unknown>,
  };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  // `handleCorsOptions` ALWAYS returns a Response — it is the preflight
  // handler, not a preflight detector. Calling it unguarded answers every
  // request with a bare "ok" and the function never runs. (Found by curling it:
  // 200, text/plain, 2 bytes, with correct CORS headers — the most convincing
  // possible impression of a working endpoint.)
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();
    const auth = await requireCoach(req, admin);
    if (auth instanceof Response) return auth;
    const { coachId, userId, displayName } = auth;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body.action ?? "").trim();

    // ---- questions ------------------------------------------------------
    if (action === "questions") {
      return jsonResponse(req, { ok: true, questions: INTERVIEW_QUESTIONS, request_id: requestId });
    }

    // ---- list -----------------------------------------------------------
    if (action === "list") {
      const versions = await loadVersions(admin, coachId);
      return jsonResponse(req, { ok: true, versions, request_id: requestId });
    }

    // ---- current — la doctrine à ROUVRIR, pas à réécrire ------------------
    //
    // La PUBLIÉE d'abord, sinon la dernière enregistrée. C'est ce que le coach
    // considère comme « sa » doctrine: un brouillon plus récent qu'il n'a pas
    // publié reste le travail en cours, et c'est bien lui qu'il veut retrouver.
    // Une absence n'est pas une erreur — un coach neuf n'a rien: `doctrine`
    // vaut null et l'écran ouvre l'interview.
    if (action === "current") {
      const versions = await loadVersions(admin, coachId);
      if (versions.length === 0) {
        return jsonResponse(req, {
          ok: true,
          doctrine: null,
          version: null,
          published_at: null,
          request_id: requestId,
        });
      }
      const published = versions.filter((v) => v.published_at !== null);
      const pick = published.length > 0
        ? published[published.length - 1]
        : versions[versions.length - 1];
      const row = await loadDoctrineRow(admin, coachId, pick.version);
      return jsonResponse(req, {
        ok: true,
        doctrine: row ? toEditorShape(row) : null,
        version: pick.version,
        published_at: pick.published_at,
        content_locale: row?.content_locale ?? null,
        request_id: requestId,
      });
    }

    // ---- compile (brique 1) ---------------------------------------------
    if (action === "compile") {
      const answers = Array.isArray(body.answers) ? body.answers : [];
      if (answers.length === 0) {
        return jsonResponse(req, {
          error: "answers_required",
          request_id: requestId,
        }, { status: 400 });
      }
      const userMessage = buildInterviewCompilePrompt(answers as never);
      const result = await generateWithGemini(
        DOCTRINE_COMPILE_SYSTEM_PROMPT,
        userMessage,
        0.2,
        true,
        [],
        "auto",
        { requestId, userId },
      );
      // `generateWithGemini` rend `string | {tool, args}` — JAMAIS `{text}`.
      // Le cast `as {text?: string}` compilait et rendait "" à chaque appel:
      // `deno check` vert, tests verts, et `compile` cassé à 100% en runtime.
      // Motif repris de plan-import-v1, qui le fait correctement.
      if (typeof result !== "string") {
        return jsonResponse(req, {
          error: "compile_returned_tool_call",
          request_id: requestId,
        }, { status: 502 });
      }
      let parsed: Record<string, unknown>;
      try {
        const raw = result.trim()
          .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        parsed = JSON.parse(raw);
      } catch (err) {
        // Fail loud: a compile that silently returns an empty doctrine would
        // publish a coach who said nothing.
        return jsonResponse(req, {
          error: "compile_unparseable",
          detail: err instanceof Error ? err.message : String(err),
          request_id: requestId,
        }, { status: 502 });
      }
      const { doctrine, issues } = parseCoachDoctrine({
        ...parsed,
        coach_id: coachId,
        version: 0,
        content_locale: String(body.content_locale ?? "en"),
      });
      const compiled = compileDoctrineBlock({ ...doctrine, coachDisplayName: displayName });
      return jsonResponse(req, {
        ok: true,
        // NOT saved: the coach validates before anything is written. "L'IA
        // transcrit, n'écrit jamais" — the same rule as the plan import.
        draft: parsed,
        issues,
        preview_block: compiled.text,
        request_id: requestId,
      });
    }

    // ---- save (draft) ----------------------------------------------------
    if (action === "save") {
      const versions = await loadVersions(admin, coachId);
      const version = nextVersionNumber(versions);
      const payload = (body.doctrine ?? {}) as Record<string, unknown>;
      const { data, error } = await admin
        .from("coach_doctrines")
        .insert({
          coach_id: coachId,
          version,
          beliefs: payload.beliefs ?? [],
          forbidden: payload.forbidden ?? [],
          vocabulary: payload.vocabulary ?? [],
          arbitrations: payload.arbitrations ?? [],
          // Sans ces deux lignes, `compile` produisait les sections et `save`
          // les jetait en silence: le coach voyait ses aliments à l'écran de
          // validation, publiait, et l'agent n'en savait rien.
          foods: payload.foods ?? { recommended: [], discouraged: [] },
          qa: payload.qa ?? [],
          voice: payload.voice ?? {},
          content_locale: String(body.content_locale ?? "en"),
          change_note: String(body.change_note ?? "") || null,
          created_from_version: Number(body.created_from_version) || null,
        })
        .select("id, version")
        .single();
      if (error) throw error;
      return jsonResponse(req, { ok: true, saved: data, request_id: requestId });
    }

    // ---- publish (brique 6) ---------------------------------------------
    if (action === "publish") {
      const version = Number(body.version);
      if (!Number.isFinite(version)) {
        return jsonResponse(req, { error: "version_required", request_id: requestId }, { status: 400 });
      }
      const row = await loadDoctrineRow(admin, coachId, version);
      if (!row) {
        return jsonResponse(req, { error: "unknown_version", request_id: requestId }, { status: 404 });
      }
      // Un seul `published_at` par coach est garanti par un index unique
      // partiel. On dépublie donc AVANT, sinon l'insert/So update viole
      // l'index — et cet ordre est la seule raison pour laquelle il n'y a pas
      // de fenêtre à deux doctrines publiées.
      const unpub = await admin
        .from("coach_doctrines")
        .update({ published_at: null })
        .eq("coach_id", coachId)
        .not("published_at", "is", null);
      if (unpub.error) throw unpub.error;

      const nowIso = new Date().toISOString();
      const { data, error } = await admin
        .from("coach_doctrines")
        .update({ published_at: nowIso, published_by: userId })
        .eq("coach_id", coachId)
        .eq("version", version)
        .select("version, published_at")
        .single();
      if (error) throw error;

      const { doctrine } = parseCoachDoctrine(row);
      const compiled = compileDoctrineBlock({ ...doctrine, coachDisplayName: displayName });
      // Le hash EST l'invalidation: la clé de cache change parce que le
      // contenu a changé. Rien à purger, donc rien à oublier de purger.
      await admin
        .from("coach_doctrines")
        .update({ compiled_prompt: compiled.text, compiled_prompt_hash: compiled.hash })
        .eq("coach_id", coachId)
        .eq("version", version);

      return jsonResponse(req, {
        ok: true,
        published: data,
        cache_key: compiled.hash,
        request_id: requestId,
      });
    }

    // ---- rollback (brique 6) --------------------------------------------
    if (action === "rollback") {
      const toVersion = Number(body.to_version);
      const versions = await loadVersions(admin, coachId);
      const plan = planRollback({ rows: versions, toVersion });
      if (!plan.ok) {
        return jsonResponse(req, {
          error: plan.reason,
          request_id: requestId,
        }, { status: plan.reason === "unknown_version" ? 404 : 409 });
      }
      const source = await loadDoctrineRow(admin, coachId, plan.sourceVersion!);
      if (!source) {
        return jsonResponse(req, { error: "unknown_version", request_id: requestId }, { status: 404 });
      }
      const { data, error } = await admin
        .from("coach_doctrines")
        .insert({
          coach_id: coachId,
          version: plan.newVersion,
          beliefs: source.beliefs ?? [],
          forbidden: source.forbidden ?? [],
          vocabulary: source.vocabulary ?? [],
          arbitrations: source.arbitrations ?? [],
          voice: source.voice ?? {},
          content_locale: String(source.content_locale ?? "en"),
          created_from_version: plan.sourceVersion,
          change_note: plan.changeNote,
        })
        .select("id, version")
        .single();
      if (error) throw error;
      return jsonResponse(req, {
        ok: true,
        // La copie est créée mais PAS publiée: le retour en arrière reste un
        // geste en deux temps, comme toute publication.
        created: data,
        note: plan.changeNote,
        request_id: requestId,
      });
    }

    // ---- diff -----------------------------------------------------------
    if (action === "diff") {
      const a = Number(body.from_version);
      const b = Number(body.to_version);
      const rowA = Number.isFinite(a) ? await loadDoctrineRow(admin, coachId, a) : null;
      const rowB = await loadDoctrineRow(admin, coachId, b);
      if (!rowB) {
        return jsonResponse(req, { error: "unknown_version", request_id: requestId }, { status: 404 });
      }
      const before = rowA ? parseCoachDoctrine(rowA).doctrine : null;
      const after = parseCoachDoctrine(rowB).doctrine;
      return jsonResponse(req, {
        ok: true,
        diff: diffDoctrines(before, after),
        request_id: requestId,
      });
    }

    // ---- replay (brique 2) ----------------------------------------------
    if (action === "replay") {
      const studentMessage = String(body.student_message ?? "").trim();
      const previousReply = String(body.previous_reply ?? "").trim();
      if (!studentMessage || !previousReply) {
        return jsonResponse(req, {
          error: "exchange_required",
          request_id: requestId,
        }, { status: 400 });
      }
      const versionRaw = Number(body.version);
      const versions = await loadVersions(admin, coachId);
      const target = Number.isFinite(versionRaw)
        ? versionRaw
        : versions.find((v) => v.published_at)?.version;
      if (!target) {
        return jsonResponse(req, { error: "no_doctrine", request_id: requestId }, { status: 404 });
      }
      const row = await loadDoctrineRow(admin, coachId, target);
      if (!row) {
        return jsonResponse(req, { error: "unknown_version", request_id: requestId }, { status: 404 });
      }
      const { doctrine } = parseCoachDoctrine(row);
      const compiled = compileDoctrineBlock({ ...doctrine, coachDisplayName: displayName });
      const prompt = buildReplayPrompt({
        doctrineBlock: compiled.text,
        studentMessage,
        previousReply,
      });
      const result = await generateWithGemini(
        prompt.systemPrompt,
        prompt.userMessage,
        0.4,
        false,
        [],
        "auto",
        { requestId, userId },
      );
      if (typeof result !== "string") {
        return jsonResponse(req, {
          error: "replay_returned_tool_call",
          request_id: requestId,
        }, { status: 502 });
      }
      return jsonResponse(req, {
        ok: true,
        version: target,
        before: previousReply,
        after: result.trim(),
        request_id: requestId,
      });
    }

    return jsonResponse(req, {
      error: "unknown_action",
      known: ["questions", "list", "current", "compile", "save", "publish", "rollback", "diff", "replay"],
      request_id: requestId,
    }, { status: 400 });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "coach-doctrine-v1",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
