/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { generateWithVision } from "../_shared/vision.ts";
import {
  compileAllDoctrineVariants,
  compileDoctrineBlock,
  doctrineCacheFootprint,
  parseCoachDoctrine,
} from "../_shared/keel/doctrine.ts";
import {
  buildDocumentUserMessage,
  DOCUMENT_COMPILE_SYSTEM_PROMPT,
  type FoodProposal,
  foldTerm,
  MAX_DOCUMENT_BASE64_CHARS,
  MAX_DOCUMENT_PAGES,
  mergeDoctrineDrafts,
  parseDocumentExtraction,
} from "../_shared/keel/doctrine_document.ts";
import { persistDocumentCorpus } from "../_shared/keel/document_corpus_io.ts";
import { FOOD_GROUP_REFS, GOAL_TOKENS, type GoalToken } from "../_shared/keel/tokens.ts";
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
 *   compile_document
 *               — brique 1 bis: le PDF du coach -> la MÊME doctrine structurée,
 *                 plus des propositions d'aliments pour `/coach/protocol`.
 *                 Rien n'est publié, rien n'atteint un élève, et les aliments
 *                 attendent un clic du coach dans `coach_food_proposals`.
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
  // LA PORTÉE FAIT L'ALLER-RETOUR, ET SON OUBLI SERAIT SILENCIEUX.
  //
  // Cet écran RELIT la doctrine publiée pour la modifier, et le premier
  // « enregistrer » réécrit ce qu'il a relu. Une portée que `toEditorShape`
  // laisserait tomber serait donc effacée de toutes les entrées du coach au
  // premier retour sur son écran — sans message, et sans qu'il puisse le
  // deviner: à l'écran, une croyance globale et une croyance ciblée se
  // ressemblent, c'est le marqueur qui les distingue.
  const scope = (e: Record<string, unknown>): string[] => {
    const raw = e.goal_scope ?? e.goalScope;
    return Array.isArray(raw) ? raw.map((x) => String(x ?? "")).filter(Boolean) : [];
  };
  const foods = (row.foods ?? {}) as Record<string, unknown>;
  return {
    beliefs: arr(row.beliefs).map((b) => ({
      claim: String(b.claim ?? ""),
      rationale: b.rationale == null ? null : String(b.rationale),
      goal_scope: scope(b),
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
      goal_scope: scope(a),
    })),
    foods: {
      // Pas de `recommended`: « avec quoi je construis » vit sur
      // `/coach/protocol`, dans le vocabulaire fermé. Une ligne ancienne qui en
      // porte encore une n'est pas rendue à l'éditeur — donc le prochain
      // enregistrement la laisse tomber, ce qui est exactement le nettoyage
      // qu'on veut, et il est visible dans le diff de version.
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

/**
 * L'objectif demandé pour un APERÇU ou un mode test. Absent = variante
 * `default`. Un jeton inconnu est REFUSÉ plutôt que ramené sur la default:
 * montrer au coach un aperçu qui n'est pas celui qu'il a demandé est la
 * définition d'un aperçu qui ment.
 */
function readGoalParam(value: unknown): GoalToken | null | Response {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "default") return null;
  if ((GOAL_TOKENS as readonly string[]).includes(raw)) return raw as GoalToken;
  return new Response(null, { status: 400 });
}

/**
 * LA VALIDATION D'ÉCRITURE — au bord, et fail loud.
 *
 * Le parseur de lecture est TOLÉRANT (il garde un jeton inconnu pour que
 * l'entrée n'atteigne personne). L'écriture, elle, refuse: l'éditeur ne peut
 * produire que les cinq jetons, donc un jeton inconnu ici vient d'un appel API
 * malformé, et l'accepter écrirait dans la base une croyance muette dont
 * personne ne saurait qu'elle l'est. Le CHECK de la base dirait non de toute
 * façon — mais avec une erreur Postgres brute au lieu d'un code lisible.
 */
function invalidGoalScopes(payload: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const field of ["beliefs", "arbitrations"] as const) {
    const entries = Array.isArray(payload[field]) ? payload[field] as unknown[] : [];
    for (const [i, raw] of entries.entries()) {
      const e = (raw ?? {}) as Record<string, unknown>;
      const scope = e.goal_scope ?? e.goalScope;
      if (scope === undefined || scope === null) continue;
      if (!Array.isArray(scope)) {
        bad.push(`${field}[${i}]: goal_scope must be a list of goals`);
        continue;
      }
      for (const g of scope) {
        const token = String(g ?? "").trim();
        if (!(GOAL_TOKENS as readonly string[]).includes(token)) {
          bad.push(`${field}[${i}]: unknown goal ${JSON.stringify(token)}`);
        }
      }
    }
  }
  return bad;
}

function decodeBase64(value: string): Uint8Array {
  const cleaned = value.trim().replace(/^data:[^;]+;base64,/, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * LES PROPOSITIONS D'ALIMENTS, PARQUÉES EN ATTENTE D'UN CLIC.
 *
 * ── CE QUE CETTE FONCTION N'A PAS LE DROIT DE FAIRE ──────────────────────
 * Écrire dans `coach_food_items`. C'est la table de la MÉTHODE: ce qui s'y
 * trouve est compilé en postures de groupe, publié, puis lu par le générateur
 * de repas et par l'évaluateur. Une ligne posée là par un modèle qui a mal lu
 * une page devient une règle que Sophia applique au nom du coach, sans qu'il
 * ait rien validé.
 *
 * ── LES DEUX FILTRES, ET POURQUOI ILS NE SONT PAS LE MÊME ────────────────
 *   déjà EN ATTENTE  → le coach ne l'a pas encore tranché. Le reproposer
 *                      allongerait sa liste sans rien lui apprendre.
 *   déjà DANS SA MÉTHODE → il l'a déjà coché à la main. Le reproposer lui
 *                      demanderait de valider une décision qu'il a prise.
 * Sans le second, un coach qui redépose son ebook après avoir rempli son écran
 * se retrouve à retrancher trente aliments qu'il possède déjà.
 *
 * Un terme DÉJÀ REFUSÉ, lui, revient: `dismissed` ne verrouille rien. Le coach
 * a écarté une lecture d'un document, pas l'aliment — et le document suivant
 * peut en dire autre chose.
 */
async function saveFoodProposals(
  admin: SupabaseClient,
  coachId: string,
  proposals: readonly FoodProposal[],
  contentLocale: string,
  sourceLabel: string | null,
): Promise<{ saved: number; alreadyPending: number; issues: string[] }> {
  if (proposals.length === 0) return { saved: 0, alreadyPending: 0, issues: [] };

  const [pending, owned, catalog] = await Promise.all([
    admin.from("coach_food_proposals").select("term").eq("coach_id", coachId).eq(
      "status",
      "pending",
    ),
    admin.from("coach_food_items").select("label, food_item_ref").eq("coach_id", coachId),
    admin.from("food_items").select("slug, label"),
  ]);
  if (pending.error) throw pending.error;
  if (owned.error) throw owned.error;
  if (catalog.error) throw catalog.error;

  const known = new Set<string>();
  for (const row of (pending.data ?? []) as { term: string }[]) known.add(foldTerm(row.term));
  const ownedKeys = new Set<string>();
  for (const row of (owned.data ?? []) as { label: string }[]) {
    ownedKeys.add(foldTerm(row.label));
  }

  // Le rattachement au CATALOGUE quand le terme du document en rejoint un.
  // Facultatif par construction: `food_item_ref` est nullable exactement pour
  // qu'un terme maison reste un terme maison (`coach_food_items` fait pareil).
  const bySlug = new Map<string, string>();
  for (const row of (catalog.data ?? []) as { slug: string; label: string }[]) {
    bySlug.set(foldTerm(row.label), row.slug);
    bySlug.set(foldTerm(row.slug), row.slug);
  }

  const issues: string[] = [];
  let alreadyPending = 0;
  const rows: Record<string, unknown>[] = [];
  for (const p of proposals) {
    const key = foldTerm(p.term);
    if (known.has(key)) {
      alreadyPending++;
      continue;
    }
    if (ownedKeys.has(key)) {
      issues.push(`${p.term}: already on your Recommended food screen, not proposed again`);
      continue;
    }
    known.add(key);
    rows.push({
      coach_id: coachId,
      term: p.term,
      quote: p.quote,
      content_locale: contentLocale,
      stance: p.stance,
      food_group_ref: p.foodGroupRef,
      food_item_ref: bySlug.get(key) ?? null,
      source_label: sourceLabel,
    });
  }
  if (rows.length === 0) return { saved: 0, alreadyPending, issues };

  // LIGNE PAR LIGNE, ET C'EST DÉLIBÉRÉ. Un insert groupé qui bute sur UNE
  // collision (deux onglets, deux dépôts simultanés) échoue en entier: le coach
  // perdrait vingt-neuf lectures valides à cause d'une trentième. L'index
  // partiel reste la vérité; on tolère juste son verdict, une ligne à la fois.
  const results = await Promise.all(
    rows.map((row) => admin.from("coach_food_proposals").insert(row).select("id").maybeSingle()),
  );
  let saved = 0;
  for (const [i, res] of results.entries()) {
    if (!res.error) {
      saved++;
      continue;
    }
    if (res.error.code === "23505") {
      alreadyPending++;
      continue;
    }
    issues.push(`${String(rows[i].term)}: could not be saved (${res.error.message})`);
  }
  return { saved, alreadyPending, issues };
}

/**
 * RECOMPILE ET REMPLACE TOUTES LES VARIANTES D'UNE DOCTRINE.
 *
 * « Une variante périmée qui survit est indétectable. » Elle ne peut pas
 * survivre: on ne calcule pas ce qui a changé, on remplace le jeu entier, et
 * le remplacement est une seule transaction côté base
 * (`keel_replace_doctrine_compilations`).
 *
 * ÉCHOUER ICI NE DOIT PAS ANNULER LA PUBLICATION. Le tour ne lit pas cette
 * table — `doctrine_loader.ts` recompile depuis les colonnes jsonb — donc une
 * écriture d'artefact ratée dégrade la mesure et l'aperçu, jamais ce que
 * l'élève reçoit. Refuser de publier pour ça punirait le coach d'un incident
 * qui ne le concerne pas.
 */
async function rewriteCompilations(
  admin: SupabaseClient,
  doctrineId: string,
  doctrine: Parameters<typeof compileAllDoctrineVariants>[0],
): Promise<{ variants: number; distinctHashes: number } | null> {
  const variants = compileAllDoctrineVariants(doctrine);
  const rows = variants.map((v) => ({
    goal: v.key,
    compiled_prompt: v.compiled.text,
    compiled_prompt_hash: v.compiled.hash,
  }));
  const { error } = await admin.rpc("keel_replace_doctrine_compilations", {
    p_doctrine_id: doctrineId,
    p_rows: rows,
  });
  if (error) {
    console.error("keel.doctrine.compilations_write_failed", {
      doctrine_id: doctrineId,
      detail: error.message,
    });
    return null;
  }
  const footprint = doctrineCacheFootprint(doctrine);
  console.info("keel.doctrine.compiled_variants", {
    doctrine_id: doctrineId,
    variants: footprint.variants,
    distinct_cache_entries: footprint.distinctHashes,
    reuse_ratio: footprint.reuseRatio,
  });
  return { variants: footprint.variants, distinctHashes: footprint.distinctHashes };
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
      // L'aperçu de compilation est celui de la variante DEMANDÉE, `default`
      // par défaut. Un coach qui vient de décrire un cas dur propre à la perte
      // de gras veut voir le bloc que recevra un élève en perte de gras.
      const previewGoal = readGoalParam(body.preview_goal);
      if (previewGoal instanceof Response) {
        return jsonResponse(req, { error: "unknown_goal", request_id: requestId }, { status: 400 });
      }
      const compiled = compileDoctrineBlock(
        { ...doctrine, coachDisplayName: displayName },
        previewGoal,
      );
      return jsonResponse(req, {
        ok: true,
        // NOT saved: the coach validates before anything is written. "L'IA
        // transcrit, n'écrit jamais" — the same rule as the plan import.
        draft: parsed,
        issues,
        preview_block: compiled.text,
        preview_goal: compiled.goal ?? "default",
        request_id: requestId,
      });
    }

    // ---- compile_document (brique 1 bis) ---------------------------------
    //
    // LE MÊME CHEMIN QUE `compile`, AVEC UNE AUTRE SOURCE. Rien n'est
    // enregistré: le coach relit, corrige, enregistre, publie. Les trois portes
    // de l'interview restent en place, et c'est ce qui rend acceptable qu'un
    // modèle ait lu deux cents pages à sa place.
    if (action === "compile_document") {
      const media = (body.media ?? {}) as Record<string, unknown>;
      const mimeType = String(media.mime_type ?? "").trim().toLowerCase();
      const base64 = String(media.base64 ?? "").trim();
      const fileName = String(body.file_name ?? "").trim() || null;
      const contentLocale = String(body.content_locale ?? "en").trim() || "en";

      // R7 — les refus sont BRUYANTS et NOMMÉS. Un « ça a raté » générique
      // enverrait le coach chercher une panne là où il y a une consigne.
      // L'ORDRE COMPTE. Le contrôle du type EN PREMIER rendait
      // `document_required` inatteignable: un corps vide n'a pas de type non
      // plus, donc « tu n'as envoyé aucun document » sortait comme « ça doit
      // être un PDF » — un diagnostic faux sur le seul cas qui vient d'un bug
      // d'appelant plutôt que d'un geste du coach.
      if (!base64) {
        return jsonResponse(req, { error: "document_required", request_id: requestId }, {
          status: 400,
        });
      }
      if (mimeType !== "application/pdf") {
        return jsonResponse(req, {
          error: "document_must_be_pdf",
          request_id: requestId,
        }, { status: 400 });
      }
      if (base64.length > MAX_DOCUMENT_BASE64_CHARS) {
        return jsonResponse(req, {
          error: "document_too_large",
          request_id: requestId,
        }, { status: 413 });
      }

      // LE NOMBRE DE PAGES SE COMPTE, IL NE SE DEVINE PAS.
      // Le plafond existe pour l'horloge de la fonction (voir
      // MAX_DOCUMENT_PAGES): sans ce comptage, un document de quatre cents
      // pages ne serait pas refusé, il expirerait à 120 s — et le coach lirait
      // « ça n'a pas marché » là où la vraie réponse est « découpe-le ».
      // Décodé UNE fois: les octets servent au comptage de pages, puis à
      // l'extraction du texte et au dépôt du fichier. Un second
      // `decodeBase64` sur six mégaoctets est un doublon de mémoire gratuit.
      let documentBytes: Uint8Array;
      try {
        documentBytes = decodeBase64(base64);
      } catch (err) {
        return jsonResponse(req, {
          error: "document_unreadable",
          detail: err instanceof Error ? err.message : String(err),
          request_id: requestId,
        }, { status: 400 });
      }

      let pageCount: number;
      try {
        const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
        const doc = await PDFDocument.load(documentBytes, {
          ignoreEncryption: true,
          updateMetadata: false,
        });
        pageCount = doc.getPageCount();
      } catch (err) {
        return jsonResponse(req, {
          error: "document_unreadable",
          detail: err instanceof Error ? err.message : String(err),
          request_id: requestId,
        }, { status: 400 });
      }
      if (pageCount > MAX_DOCUMENT_PAGES) {
        return jsonResponse(req, {
          error: "document_too_long",
          page_count: pageCount,
          max_pages: MAX_DOCUMENT_PAGES,
          request_id: requestId,
        }, { status: 413 });
      }

      const generated = await generateWithVision({
        systemPrompt: DOCUMENT_COMPILE_SYSTEM_PROMPT,
        userMessage: buildDocumentUserMessage(FOOD_GROUP_REFS, fileName),
        media: [{ mimeType, base64 }],
        jsonMode: true,
        // Plus bas que l'interview (0.2): sur un document long, la seule chose
        // qu'on veut du modèle est qu'il recopie ce qu'il lit.
        temperature: 0.1,
        timeoutMs: 120_000,
        meta: { source: "coach-doctrine-v1:compile_document", userId, requestId },
      });

      let parsed: Record<string, unknown>;
      try {
        const raw = String(generated.text ?? "").trim()
          .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        parsed = JSON.parse(raw);
      } catch (err) {
        // Même choix que `compile`: échec bruyant. Une doctrine vide rendue en
        // silence publierait un coach qui n'a rien dit.
        return jsonResponse(req, {
          error: "compile_unparseable",
          detail: err instanceof Error ? err.message : String(err),
          request_id: requestId,
        }, { status: 502 });
      }

      const extraction = parseDocumentExtraction(parsed, FOOD_GROUP_REFS);

      // Le parseur de doctrine dit ce qu'il a jeté; ses `issues` et celles de
      // l'extraction se lisent dans la même liste, à l'écran.
      const { doctrine, issues: doctrineIssues } = parseCoachDoctrine({
        ...extraction.draft,
        coach_id: coachId,
        version: 0,
        content_locale: contentLocale,
      });
      void doctrine;

      // LA FUSION. `merge_into` est le brouillon que le coach a sous les yeux;
      // absent, le document devient le brouillon. Voir `mergeDoctrineDrafts`:
      // ce qui est déjà à l'écran gagne, l'arrivant remplit les trous.
      const mergeInto = body.merge_into && typeof body.merge_into === "object"
        ? body.merge_into as Record<string, unknown>
        : null;
      const draft = mergeDoctrineDrafts(mergeInto, extraction.draft);

      const saved = await saveFoodProposals(
        admin,
        coachId,
        extraction.proposals,
        contentLocale,
        fileName,
      );

      // ── LE CORPUS ─────────────────────────────────────────────────────
      // Le document, son texte découpé, et les citations ancrées. Écrit
      // APRÈS le brouillon parce que ce n'est pas ce que le coach attend:
      // c'est ce qui rend son document relisible plus tard, sans le lui
      // redemander (voir `document_corpus.ts`).
      //
      // NE PEUT PAS FAIRE ÉCHOUER LE TOUR, par construction:
      // `persistDocumentCorpus` ne lance jamais et rend une raison nommée.
      // Le coach vient d'attendre deux minutes qu'un modèle lise cent pages;
      // lui rendre une erreur alors que son brouillon est prêt le ferait
      // redéposer le fichier pour obtenir le même échec.
      const corpus = await persistDocumentCorpus(admin, {
        coachId,
        // `coaches.user_id`, PAS `coaches.id`: c'est l'id auth qui préfixe le
        // chemin de stockage, et les deux routines RGPD s'y accrochent.
        coachUserId: userId,
        fileName,
        bytes: documentBytes,
        pageCount,
        contentLocale,
        citations: extraction.citations,
      });
      // Journalisé, jamais rendu au coach: « 3 citations introuvables dans ton
      // document » est une information sur NOTRE extraction, pas une action
      // qu'il peut prendre. C'est nous que ça regarde.
      console.info("keel.doctrine.corpus", {
        coach_id: coachId,
        request_id: requestId,
        document_id: corpus.documentId,
        reason: corpus.reason,
        text_status: corpus.textStatus,
        page_count: pageCount,
        chunks: corpus.chunksWritten,
        citations: corpus.citationsWritten,
        citations_unlocated: corpus.citationsUnlocated,
        stored_source: Boolean(corpus.storagePath),
        warnings: corpus.warnings,
      });

      return jsonResponse(req, {
        ok: true,
        // NON ENREGISTRÉ, comme `compile`. « L'IA transcrit, n'écrit jamais. »
        draft,
        issues: [...doctrineIssues, ...extraction.issues, ...saved.issues],
        page_count: pageCount,
        proposals_saved: saved.saved,
        proposals_already_pending: saved.alreadyPending,
        // Le corpus est un fait sur CE dépôt, pas une décision à prendre:
        // l'écran peut dire « document gardé, 214 passages » sans rien
        // demander au coach.
        document_id: corpus.documentId,
        document_text_status: corpus.textStatus,
        document_chunks: corpus.chunksWritten,
        request_id: requestId,
      });
    }

    // ---- save (draft) ----------------------------------------------------
    if (action === "save") {
      const versions = await loadVersions(admin, coachId);
      const version = nextVersionNumber(versions);
      const payload = (body.doctrine ?? {}) as Record<string, unknown>;
      const badScopes = invalidGoalScopes(payload);
      if (badScopes.length > 0) {
        return jsonResponse(req, {
          error: "unknown_goal_scope",
          detail: badScopes.join("; "),
          request_id: requestId,
        }, { status: 400 });
      }
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
          foods: payload.foods ?? { discouraged: [] },
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
      // Les variantes de la version qu'on dépublie s'en vont avec elle.
      // `coach_doctrine_compilations` doit vouloir dire « ce qui est servi en
      // ce moment »: y laisser les compilés d'une version retirée ferait
      // mesurer la fragmentation sur des blocs que plus personne ne reçoit, et
      // afficherait un aperçu périmé au coach.
      const previouslyPublished = await admin
        .from("coach_doctrines")
        .select("id")
        .eq("coach_id", coachId)
        .not("published_at", "is", null);
      if (previouslyPublished.error) throw previouslyPublished.error;
      for (const prev of (previouslyPublished.data ?? []) as { id: string }[]) {
        const cleared = await admin
          .from("coach_doctrine_compilations")
          .delete()
          .eq("doctrine_id", prev.id);
        if (cleared.error) {
          console.warn("keel.doctrine.stale_variants_not_cleared", {
            doctrine_id: prev.id,
            detail: cleared.error.message,
          });
        }
      }

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

      const { doctrine: parsedDoctrine } = parseCoachDoctrine(row);
      const named = { ...parsedDoctrine, coachDisplayName: displayName };
      // Le hash EST l'invalidation: la clé de cache change parce que le
      // contenu a changé. Rien à purger, donc rien à oublier de purger.
      //
      // Les colonnes `compiled_prompt*` de `coach_doctrines` portent la
      // variante `default`, qui est ce qu'elles ont toujours porté pour une
      // doctrine sans portée. Les SIX variantes vivent dans
      // `coach_doctrine_compilations`.
      const defaultVariant = compileDoctrineBlock(named, null);
      await admin
        .from("coach_doctrines")
        .update({
          compiled_prompt: defaultVariant.text,
          compiled_prompt_hash: defaultVariant.hash,
        })
        .eq("coach_id", coachId)
        .eq("version", version);

      // TOUTES les variantes, en une transaction. Publier sans recompiler
      // laisserait un jeu qui décrit la version précédente.
      const footprint = await rewriteCompilations(admin, String(row.id ?? ""), named);

      return jsonResponse(req, {
        ok: true,
        published: data,
        cache_key: defaultVariant.hash,
        // La mesure de §3.2.3, rendue à l'appelant plutôt que devinée: combien
        // de variantes compilées, et combien d'entrées de cache distinctes
        // elles occupent réellement.
        variants: footprint?.variants ?? null,
        distinct_cache_entries: footprint?.distinctHashes ?? null,
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
          // `foods` et `qa` MANQUAIENT ICI, et c'est une perte de données
          // trouvée en passant sur ce lot (hors périmètre, corrigée parce que
          // la laisser aurait coûté deux sections au premier coach qui revient
          // en arrière). Un rollback COPIE une version: il doit la copier en
          // entier, sinon « retour en un clic » retire au coach ses aliments
          // et ses questions/réponses sans rien lui dire. Même raison que le
          // `save` qui les avait oubliés avant lui.
          foods: source.foods ?? { discouraged: [] },
          qa: source.qa ?? [],
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
      // LE MODE TEST CHOISIT SA VARIANTE (§3.3).
      //
      // Le coach qui rejoue un échange n'a pas d'objectif — c'est lui, pas un
      // élève. Lui servir la `default` en silence l'empêcherait de vérifier
      // précisément ce qu'il veut vérifier avant d'exposer un élève: « qu'est-ce
      // que MON agent répond à ça, à quelqu'un en perte de gras ? ». Sans
      // `goal`, la `default` reste le comportement.
      const replayGoal = readGoalParam(body.goal);
      if (replayGoal instanceof Response) {
        return jsonResponse(req, { error: "unknown_goal", request_id: requestId }, { status: 400 });
      }
      const { doctrine } = parseCoachDoctrine(row);
      const compiled = compileDoctrineBlock(
        { ...doctrine, coachDisplayName: displayName },
        replayGoal,
      );
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
        goal: compiled.goal ?? "default",
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
