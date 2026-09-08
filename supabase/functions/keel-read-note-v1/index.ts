/**
 * `keel-read-note-v1` — LIRE LA NOTE D'UN BROUILLON, AVANT DE COMPOSER.
 * 2026-09-08 · lot 3 du chantier « retours et bilan ».
 *
 * Autorité produit: `docs/keel/RETOURS-ET-BILAN-CE-QUE-CA-CHANGE.md` §5.1 et §8
 * — « le composeur ne reçoit JAMAIS la phrase ; il reçoit des paramètres ».
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI UN SECOND APPEL, ET PAS UNE BRANCHE DU GÉNÉRATEUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'ici la phrase et le plan voyageaient dans la MÊME requête: le
 * générateur donnait la phrase brute au modèle qui compose (mesuré: 23 833
 * caractères de prompt, la phrase dedans), composait, puis SEULEMENT APRÈS la
 * classait et l'écrivait — pour le plan suivant. C'est exactement ce qui a
 * produit le run `50be73f3`: « ma mère ne mange pas autant » n'avait aucun
 * paramètre où atterrir, et le modèle a sorti les grammes des boîtes.
 *
 * Deux appels, parce que c'est une HORLOGE, pas un goût: un plan à quatre
 * bouches met 180 à 280 s, et la passerelle coupe à 150 s (mesuré aux tirs
 * N3/N3b/N3c: deux à trois essais par tir). Lire la phrase ici prend ~4 s.
 * Le front appelle CECI, puis compose SANS `draft_note`: le composeur relit le
 * magasin, qui porte déjà l'effet — c'est la recomposition immédiate.
 *
 * ⛔ UNE FONCTION À PART, ET PAS `operation: "read_note"` DANS LE GÉNÉRATEUR:
 * ce handler fait 13 000 lignes et une autre session l'édite en continu — le
 * watcher de `functions serve` recrée le runtime à chaque édition, et un tir
 * en vol meurt avec. Ce fichier-ci ne partage rien avec lui.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT, ET RIEN D'AUTRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. la garde d'entrée du brouillon (`readDraftNote`: plancher TCA,
 *      interdits de doctrine, longueur) — la MÊME que le générateur;
 *   2. le classifieur + les trois écritures, par `classifyAndPersistDraftNote`
 *      — goûts (magasin), part (appétit, RPC `_for`), réglages (champ, porte
 *      du bilan). Aucune logique ici: ce module ne sait pas ce qu'est un
 *      appétit;
 *   3. la réponse: ce qui a été écrit, DIT à la personne (les mêmes lignes que
 *      le chat reçoit), et les compteurs — pour que « rien n'a été fait » ne
 *      ressemble jamais à « ça a marché ».
 *
 * ⚠️ `planFoods: []`, ET C'EST EXACT: il n'y a pas encore de plan. Le modèle
 * n'a donc pas le droit de demander « laquelle ? » (`about: what`) — le prompt
 * le lui dit. C'est la limite connue de « lire avant de composer ».
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-08 (lot 4) — LA QUESTION, ET SA RÉPONSE, PAR LA MÊME FONCTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « Ma mère ne mange pas autant » sans prénom reconnaissable rend, au lieu
 * d'une écriture, une QUESTION (`questions[]`): le morceau de phrase, le sens
 * déjà lu, et les bouches candidates avec leur prénom. Le front l'affiche
 * sous le champ, avec un bouton par bouche. Le tap revient ICI avec
 * `{ answer: { kind: "portion", member_id, direction } }` — SANS `draft_note`,
 * et sans appel modèle: la phrase a déjà été lue, il ne manquait que la bouche.
 *
 * ⛔ SANS TABLE NI PLAFOND. La question de chat (`memory_clarifications`) est
 * désarmée depuis le 2026-09-07 et porte deux pièges (2 questions/jour, une
 * seule ouverte par personne). Celle-ci ne persiste rien: elle vit le temps
 * de l'aperçu, et une question sans réponse n'écrit jamais rien — c'est le
 * contrat du tiroir 7.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { parseRetainedDay } from "../_shared/keel/retained_item.ts";
import {
  answerDraftNotePortion,
  classifyAndPersistDraftNote,
} from "../_shared/keel/draft_note_classify_io.ts";
import { draftNoteClassifyTrace } from "../_shared/keel/draft_note_classify.ts";
import { draftNoteMembersOf } from "../_shared/keel/draft_note_members_io.ts";
import { readDraftNote } from "../_shared/keel/plan_draft_note.ts";
import { loadPublishedDoctrine } from "../_shared/keel/doctrine_loader.ts";
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
import type { ForbiddenTerm } from "../_shared/keel/forbidden_matcher.ts";

const FN_NAME = "keel-read-note-v1";
const TAG = "keel/read_note";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Le jour du serveur, en UTC — le REPLI, et il est journalisé. */
function serverDay(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;

    // ── LA RÉPONSE À UNE QUESTION — avant tout, et sans relire de note ────
    // ⚠️ PAS DE GARDE DE PLANCHER ICI, ET C'EST VOULU: la question n'existe
    // que parce qu'une LECTURE a passé la garde quelques secondes plus tôt;
    // la réponse ne porte aucun texte libre, seulement une bouche et un sens
    // déjà lus. Le plancher, lui, mord à l'assiette (`energyFloorFor`).
    const answer = body.answer && typeof body.answer === "object"
      ? body.answer as Record<string, unknown>
      : null;
    if (answer !== null) {
      const kind = String(answer.kind ?? "").trim();
      const direction = String(answer.direction ?? "").trim().toLowerCase();
      const memberId = String(answer.member_id ?? "").trim().toLowerCase();
      if (kind !== "portion" || (direction !== "down" && direction !== "up") || !memberId) {
        return jsonResponse(req, { error: "bad_answer", request_id: requestId }, { status: 400 });
      }
      const members = await draftNoteMembersOf(admin, userId, TAG);
      let locale = "";
      try {
        const prof = await admin.from("profiles").select("locale").eq("id", userId).maybeSingle();
        locale = String((prof.data as Record<string, unknown> | null)?.locale ?? "");
      } catch {
        // Sans locale, l'accusé sort en anglais — visible, jamais silencieux.
      }
      const out = await answerDraftNotePortion({
        admin,
        userId,
        members,
        contentLocale: locale,
        move: { memberId, direction },
        requestId,
      });
      return jsonResponse(req, {
        ok: out.ok,
        reason: out.reason,
        dropped_clauses: 0,
        announced: out.announced.map((a) => ({ text: a.text, who: a.who ?? null, kind: a.kind })),
        questions: [],
        request_id: requestId,
      });
    }

    // ── LE JOUR, ET LA SEMAINE VISÉE ─────────────────────────────────────
    // `today` vient du navigateur (le jour LOCAL de la personne), validé; le
    // repli est le jour du serveur, journalisé. `starts_on` est le départ de la
    // fenêtre demandée: l'encart (`next_plan`) s'ancre sur SA semaine.
    const claimed = parseRetainedDay(body.today);
    const today = claimed ?? serverDay();
    const startsOn = parseRetainedDay(body.starts_on) ?? today;

    // ── LA GARDE D'ENTRÉE — LA MÊME QUE LE GÉNÉRATEUR ────────────────────
    // ⚠️ `restrictionFlag` PAR DÉFAUT À `true`: un plancher illisible est un
    // plancher LEVÉ, et la note n'entre pas. C'est la direction sûre.
    let restrictionFlag = true;
    try {
      const floor = await evaluateRestrictionForStudent(admin as never, {
        userId,
        asOfLocalDate: today,
      });
      restrictionFlag = floor.restriction_flag === true;
    } catch (error) {
      console.warn(JSON.stringify({
        tag: TAG,
        event: "floor_unreadable",
        user_id: userId,
        error: error instanceof Error ? error.message : String(error),
        effect: "plancher LEVÉ, la note n'est pas classée",
      }));
    }
    const doctrine = await loadPublishedDoctrine(admin, userId);
    const doctrineForbidden: ForbiddenTerm[] = (doctrine.doctrine?.forbidden ?? [])
      .map((f) => ({
        ruleId: String(f.token ?? "").trim(),
        token: String(f.token ?? "").trim(),
        surfaceForms: f.surfaceForms,
      }))
      .filter((t) => t.token.length > 0);

    const note = readDraftNote({ raw: body.draft_note, doctrineForbidden, restrictionFlag });
    console.log(JSON.stringify({
      tag: TAG,
      event: "read",
      user_id: userId,
      request_id: requestId,
      usable: note.usable !== null,
      refusal: note.refusal,
      dropped: note.dropped.length,
      today_claimed: claimed !== null,
    }));
    if (note.usable === null) {
      // ⚠️ 200, PAS 4xx: ce n'est pas une erreur de requête, c'est un verdict
      // que la personne peut réparer en reformulant — il se lit sous le champ.
      return jsonResponse(req, {
        ok: false,
        reason: note.refusal ?? "note_unusable",
        dropped_clauses: note.dropped.length,
        announced: [],
        questions: [],
        request_id: requestId,
      });
    }

    // ── LE RÔLE ET LA LANGUE ─────────────────────────────────────────────
    const members = await draftNoteMembersOf(admin, userId, TAG);
    let contentLocale = "";
    try {
      const prof = await admin.from("profiles").select("locale").eq("id", userId).maybeSingle();
      contentLocale = String((prof.data as Record<string, unknown> | null)?.locale ?? "");
    } catch {
      // Sans locale, l'accusé sort en anglais — visible, jamais silencieux.
    }

    // ── LE CLASSIFIEUR ET LES TROIS ÉCRITURES — UN SEUL APPEL ────────────
    const out = await classifyAndPersistDraftNote({
      admin,
      userId,
      note,
      today,
      targetWeek: startsOn,
      members,
      contentLocale,
      planFoods: [],
      source: "draft_note",
      requestId,
    });
    const trace = draftNoteClassifyTrace(out.classification);

    console.log(JSON.stringify({
      tag: TAG,
      event: out.reason,
      user_id: userId,
      request_id: requestId,
      ok: out.ok,
      announced: out.announced.length,
      questions: out.questions.length,
      notice_delivered: out.notice.delivered,
      ...trace,
    }));

    return jsonResponse(req, {
      ok: out.ok,
      reason: out.reason,
      dropped_clauses: note.dropped.length,
      announced: out.announced.map((a) => ({ text: a.text, who: a.who ?? null, kind: a.kind })),
      // ⟳ lot 4 — ce qu'on n'a PAS pu écrire faute d'une bouche, à demander.
      questions: out.questions,
      // ⛔ LES COMPTEURS QUI DISENT « RIEN N'A ÉTÉ FAIT, ET VOICI POURQUOI ».
      // Sans eux, un tiroir vide et un tiroir inerte se ressemblent.
      counters: {
        proposed: trace.proposed,
        kept: trace.kept,
        refused: trace.refused,
        skipped: trace.skipped,
        skipped_setting: trace.skipped_setting,
        skipped_degree: trace.skipped_degree,
        portions_refused_unknown_member: trace.portions_refused_unknown_member,
        clarify_proposed: trace.clarify_proposed,
        clarify_refused_unknown_kind: trace.clarify_refused_unknown_kind,
        // ⟳ 2026-09-08 — deux issues qui ne sont ni « rien » ni un échec.
        safety_written: out.safety.written.length,
        at_edge: out.atEdge,
      },
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({ functionName: FN_NAME, error, requestId });
    return jsonResponse(req, { error: "internal_error", request_id: requestId }, { status: 500 });
  }
});
