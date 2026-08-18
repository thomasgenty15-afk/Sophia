/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { buildAndWriteCoachSynthesis } from "../_shared/keel/coach_synthesis_io.ts";
import { resolveArtifactLocale } from "../_shared/keel/locale.ts";

/**
 * PIVOT NUTRITION §1.4 — la synthèse du lundi, générée pour chaque coach actif.
 *
 * « Chaque lundi : synthèse poussée — qui est actif, qui décroche, les 3 élèves
 * à rattraper. Un coach qui n'ouvre jamais le dashboard mais lit sa synthèse
 * est un client retenu. » Cette fonction produit exactement cet artefact.
 *
 * CE QU'ELLE NE FAIT PAS, et c'est délibéré:
 *   - elle ne CALCULE rien (tout vient de `coach_synthesis.ts`, testé);
 *   - elle n'appelle AUCUN modèle. Les chiffres d'un coach ne passent jamais
 *     par un LLM: le dépôt a déjà payé un récap qui confabulait ses propres
 *     nombres, et un coach qui attrape UN chiffre inventé cesse de croire
 *     tous les autres;
 *   - elle ne LIVRE pas. Générer et livrer sont deux étapes, et `delivered_at`
 *     reste nul ici (execution truth). La livraison WhatsApp/email est un lot
 *     séparé, qui appellera `markSynthesisDelivered` APRÈS un envoi réussi.
 *
 * IDEMPOTENCE: l'écriture est un upsert sur
 * `(coach_id, kind, period_start, period_end)`. Rejouer le job le même lundi
 * met à jour la même ligne — jamais une seconde synthèse de la même semaine.
 *
 * REJOUABLE SUR UNE SEMAINE PASSÉE: `as_of_local_date` est un paramètre, pas
 * `new Date()`. C'est ce qui rend la fonction testable sous horloge simulée
 * (le harnais QA de ce dépôt avance une horloge; une fonction qui lit l'heure
 * en interne ne peut pas être rejouée).
 */

const COACH_PAGE_SIZE = 200;
const DEFAULT_BUDGET_MS = 50_000;

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

type CoachRow = {
  id: string;
  display_name: string | null;
  /** `coaches.user_id` — la seule jointure vers la langue du coach. */
  user_id: string | null;
};

/**
 * LA LANGUE DU COACH — `coaches.user_id` → `profiles.locale`.
 *
 * ── POURQUOI CETTE LECTURE N'EXISTAIT PAS ─────────────────────────────────
 * `buildAndWriteCoachSynthesis` acceptait un `contentLocale` OPTIONNEL, ce job
 * ne le passait pas, et `renderSynthesisText` était appelé avec `locale: "en"`
 * EN DUR. Trois pièces qui, ensemble, rendaient le corps de `/coach/weekly`
 * anglais pour tout le monde — pendant que la colonne `content_locale` de la
 * ligne écrite juste à côté affirmait la même chose, ce qui rendait le défaut
 * invisible à toute vérification par la base.
 *
 * `coaches` n'a PAS de colonne de langue (voir 20260727120000_keel_tenancy).
 * La seule source est le profil du compte auquel `user_id` renvoie. Une
 * lecture groupée pour toute la page, plutôt qu'une par coach: le job balaie
 * 200 coachs par tour.
 */
async function loadCoachLocales(
  admin: SupabaseClient,
  coaches: CoachRow[],
): Promise<Map<string, string | null>> {
  const userIds = coaches
    .map((c) => String(c.user_id ?? "").trim())
    .filter((id) => id.length > 0);
  const byCoachId = new Map<string, string | null>();
  if (userIds.length === 0) return byCoachId;
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("id, locale")
      .in("id", userIds);
    if (error) throw error;
    const byUserId = new Map<string, string | null>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      byUserId.set(
        String(row.id ?? ""),
        String(row.locale ?? "").trim() || null,
      );
    }
    for (const coach of coaches) {
      byCoachId.set(
        coach.id,
        byUserId.get(String(coach.user_id ?? "").trim()) ?? null,
      );
    }
  } catch (error) {
    // Une lecture de langue qui échoue ne fait pas tomber la flotte: la chaîne
    // retombe sur son repli final (`en-US`), ce qui est le comportement d'avant
    // ce lot. Elle est JOURNALISÉE pour ne pas devenir un silence permanent.
    console.warn(JSON.stringify({
      tag: "keel.coach_synthesis.locale_unreadable",
      coaches: coaches.length,
      detail: String(error instanceof Error ? error.message : error),
    }));
  }
  return byCoachId;
}

async function loadNextCoaches(args: {
  admin: SupabaseClient;
  afterId: string;
}): Promise<CoachRow[]> {
  let query = args.admin
    .from("coaches")
    .select("id, display_name, user_id")
    .eq("status", "active")
    .order("id", { ascending: true })
    .limit(COACH_PAGE_SIZE);
  if (args.afterId) query = query.gt("id", args.afterId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CoachRow[];
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const nowIso = cleanText(body.now);
    const nowCandidate = nowIso ? new Date(nowIso) : new Date();
    const now = Number.isFinite(nowCandidate.getTime()) ? nowCandidate : new Date();
    // La date d'ancrage de la fenêtre. Fournie => rejouable sur une semaine
    // passée; absente => la date du jour.
    const asOfLocalDate = cleanText(body.as_of_local_date) ||
      now.toISOString().slice(0, 10);

    const budgetMsRaw = Number(body.budget_ms);
    const budgetMs = Number.isFinite(budgetMsRaw) && budgetMsRaw > 0
      ? Math.min(budgetMsRaw, 120_000)
      : DEFAULT_BUDGET_MS;

    const onlyCoachId = cleanText(body.coach_id);

    const admin = adminClient();
    const startedAt = Date.now();

    let cursor = cleanText(body.after_coach_id);
    let coachesScanned = 0;
    let synthesesWritten = 0;
    let coachesWithoutStudents = 0;
    let exhausted = false;
    const failures: string[] = [];

    while (true) {
      const coaches = onlyCoachId
        ? (await loadNextCoaches({ admin, afterId: "" }))
          .filter((c) => c.id === onlyCoachId)
        : await loadNextCoaches({ admin, afterId: cursor });
      if (coaches.length === 0) {
        exhausted = true;
        break;
      }

      // R2 — une synthèse est un ARTEFACT: aucun fil à ancrer, donc
      // `resolveArtifactLocale`. `tenantDefault` est `null` faute de source
      // (`coaches.default_student_locale` n'existe pas), et de toute façon ce
      // n'est pas la langue du coach qu'elle porterait, mais celle de ses
      // élèves — deux choses différentes, et la synthèse est pour LUI.
      const localesByCoachId = await loadCoachLocales(admin, coaches);

      for (const coach of coaches) {
        cursor = coach.id;
        coachesScanned++;
        try {
          const result = await buildAndWriteCoachSynthesis(admin, {
            coachId: coach.id,
            coachName: coach.display_name,
            asOfLocalDate,
            now,
            contentLocale: resolveArtifactLocale({
              studentProfile: localesByCoachId.get(coach.id) ?? null,
              tenantDefault: null,
            }),
          });
          if (result.studentCount === 0) {
            // Un coach sans élève n'a pas de semaine à raconter. On ne crée
            // PAS une synthèse vide: elle serait indiscernable d'une semaine
            // où tout le monde s'est tu.
            coachesWithoutStudents++;
          } else if (result.write.written) {
            synthesesWritten++;
          } else {
            failures.push(`${coach.id}: ${result.write.reason_code}`);
          }
        } catch (error) {
          // Un coach qui échoue ne fait pas tomber la flotte.
          failures.push(
            `${coach.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (Date.now() - startedAt > budgetMs) break;
      }

      if (onlyCoachId) {
        exhausted = true;
        break;
      }
      if (Date.now() - startedAt > budgetMs) break;
    }

    return jsonResponse(req, {
      ok: true,
      as_of_local_date: asOfLocalDate,
      coaches_scanned: coachesScanned,
      syntheses_written: synthesesWritten,
      coaches_without_students: coachesWithoutStudents,
      exhausted,
      next_after_coach_id: exhausted ? null : cursor || null,
      failures: failures.slice(0, 50),
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "coach-synthesis-v1",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500, includeCors: false });
  }
});
