// LOT 0 — LA SONDE : COMBIEN DE TEMPS UN WORKER VIT-IL ICI, VRAIMENT ?
//
// Le 2026-09-15, la première composition tentée sur le projet hébergé est morte
// sans rien écrire. La cause est au-dessus du modèle : Supabase coupe toute
// fonction qui n'a pas RÉPONDU en 150 s, et ne garde l'isolat en vie après la
// réponse que pour les promesses confiées à `EdgeRuntime.waitUntil()`, jusqu'au
// mur de la machine — 400 s en plan payant, 150 s en gratuit, d'après la doc.
//
// « D'après la doc » ne suffit pas (R5 : « la durée de vie réelle doit être
// vérifiée, pas déduite »). Cette fonction :
//   1. insère une ligne `keel_runtime_probes` AVANT de répondre — une ligne sans
//      `finished_at` est la preuve d'un worker mort, pas d'un appel jamais fait ;
//   2. répond 202 tout de suite, en disant si le runtime a accepté la promesse ;
//   3. bat toutes les dix secondes en arrière-plan pendant `n` secondes, puis
//      écrit `finished_at`. `max(last_beat_at) - started_at` est le plafond réel.
//
// Interne seulement (`x-internal-secret`). Aucune donnée personnelle.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { keepWorking } from "../_shared/keel/edge_runtime.ts";

const FN_NAME = "keel-runtime-probe-v1";
const BEAT_MS = 10_000;
const N_MIN = 10;
const N_MAX = 3_600;

function log(event: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "keel.runtime_probe", event, ...extra }));
}

Deno.serve(async (req) => {
  const refused = ensureInternalRequest(req);
  if (refused) return refused;
  const requestId = getRequestId(req);

  const body = await req.json().catch(() => ({})) as { n?: unknown };
  const asked = Math.floor(Number(body?.n ?? 120));
  const n = Number.isFinite(asked) ? Math.min(N_MAX, Math.max(N_MIN, asked)) : 120;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  let hostname: string | null = null;
  try {
    hostname = Deno.hostname();
  } catch {
    hostname = null;
  }
  const region = Deno.env.get("SB_REGION") ?? null;
  const executionId = Deno.env.get("SB_EXECUTION_ID") ?? null;

  const { data, error } = await admin
    .from("keel_runtime_probes")
    .insert({ n_seconds: n, hostname, region, execution_id: executionId })
    .select("id")
    .single();
  if (error || !data) {
    return jsonResponse(req, {
      error: "probe_not_written",
      detail: error?.message ?? null,
      request_id: requestId,
    }, { status: 503 });
  }
  const id = String((data as { id: unknown }).id);
  const startedAt = Date.now();

  const work = (async () => {
    const beats = Math.floor((n * 1000) / BEAT_MS);
    for (let beat = 1; beat <= beats; beat++) {
      await new Promise((resolve) => setTimeout(resolve, BEAT_MS));
      const { error: beatError } = await admin
        .from("keel_runtime_probes")
        .update({ last_beat_at: new Date().toISOString() })
        .eq("id", id);
      if (beatError) log("beat_failed", { id, beat, message: beatError.message });
    }
    const now = new Date().toISOString();
    await admin
      .from("keel_runtime_probes")
      .update({ finished_at: now, last_beat_at: now })
      .eq("id", id);
    log("finished", { id, n, elapsed_ms: Date.now() - startedAt });
  })();

  const registered = keepWorking(work);
  await admin.from("keel_runtime_probes").update({ wait_until: registered }).eq("id", id);
  log("accepted", { id, n, wait_until: registered, hostname, region, fn: FN_NAME });

  return jsonResponse(req, {
    ok: true,
    id,
    n,
    wait_until: registered,
    request_id: requestId,
  }, { status: 202 });
});
