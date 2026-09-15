/**
 * LOT 1.3 — LE BLOC « ÉTAT APRÈS », PROUVÉ SUR LES DEUX DEMANDES MORTES.
 *
 * Le harnais de campagne archive désormais, après CHAQUE tir et quoi qu'il
 * arrive, ce que la base dit de la demande: verrou restant et son âge,
 * brouillon, statut rendu par la RPC, et le décompte des appels modèle lus
 * dans `llm_raw_response_events`.
 *
 * Ce script exécute exactement ce bloc sur les demandes déjà en base — celles
 * du 546 (tir 8-s5) et du 502 (pilote b10 tir 2) — donc sans aucun appel
 * fournisseur. Il vérifie aussi, statiquement, que le harnais pose bien son
 * propre `x-request-id` au lieu de le lire dans une réponse qui, sur ces deux
 * tirs-là, n'en portait aucun.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… deno run -A etat-apres.ts
 */
const API = (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!SVC) {
  console.error("⛔ SUPABASE_SERVICE_ROLE_KEY manquant");
  Deno.exit(2);
}

async function lire(path: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    headers: { apikey: SVC, authorization: `Bearer ${SVC}` },
  });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j as Record<string, unknown>[] : [];
}

/** Le bloc du harnais, à l'identique. */
async function etatApres(requestId: string) {
  const verrous = await lire(
    `household_generation_lock?request_id=eq.${requestId}` +
      `&select=household_id,request_id,intent,actor_user_id,started_at`,
  );
  const brouillons = await lire(
    `student_meal_drafts?request_id=eq.${requestId}` +
      `&select=id,status,error_code,adopted_meal_id,created_at,expires_at`,
  );
  const registre = await lire(
    `llm_raw_response_events?request_id=eq.${requestId}&select=source,status,created_at`,
  );
  const appels: Record<string, number> = {};
  for (const l of registre) {
    const cle = `${String(l.source)}:${String(l.status)}`;
    appels[cle] = (appels[cle] ?? 0) + 1;
  }
  return {
    request_id: requestId,
    verrou_restant: verrous[0] ?? null,
    verrou_age_s: verrous[0]
      ? Math.round((Date.now() - Date.parse(String(verrous[0].started_at))) / 1000)
      : null,
    brouillon: brouillons[0] ?? null,
    appels_registre: appels,
    appels_registre_total: registre.length,
  };
}

// ── ① LE HARNAIS POSE SON IDENTIFIANT ─────────────────────────────────────
const HARNAIS = await Deno.readTextFile(
  new URL("../2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts", import.meta.url),
);
const cablage = [
  ['il tire son identifiant', 'const demandeId = crypto.randomUUID();'],
  ["il l'envoie dans l'en-tête", '"x-request-id": demandeId,'],
  ["il ne l'attend plus de la réponse", "const requestId = demandeId;"],
  ["il archive l'état lu", "etat_apres: etatApres,"],
  ["il lit le verrou", "household_generation_lock?request_id=eq."],
  ["il compte les appels du registre", "llm_raw_response_events?request_id=eq."],
];
let rouge = 0;
console.log("── CÂBLAGE DU HARNAIS ────────────────────────────────────");
for (const [quoi, aiguille] of cablage) {
  const ok = HARNAIS.includes(aiguille);
  if (!ok) rouge++;
  console.log(`   ${ok ? "✅" : "⛔"} ${quoi}`);
}

// ── ② LE BLOC, SUR LES DEMANDES RÉELLEMENT MORTES ─────────────────────────
console.log("\n── ÉTAT APRÈS, SUR LES VERROUS EN BASE ───────────────────");
const morts = await lire(
  "household_generation_lock?select=request_id,actor_user_id,started_at&order=started_at",
);
if (morts.length === 0) console.log("   (aucun verrou en base — rien à lire)");
for (const v of morts) {
  const e = await etatApres(String(v.request_id));
  console.log(
    `   ${e.request_id} · verrou ${e.verrou_restant ? `OUI (${e.verrou_age_s} s)` : "non"}` +
      ` · brouillon ${String(e.brouillon?.status ?? "aucun")}` +
      ` · appels ${e.appels_registre_total} ${JSON.stringify(e.appels_registre)}`,
  );
  if (!e.verrou_restant) {
    console.log("   ⛔ le verrou devait être lu ici");
    rouge++;
  }
}

console.log(
  `\n${rouge === 0 ? "✅ lot 1.3 : le tir mort est auditable" : `⛔ ${rouge} défaut(s)`}`,
);
Deno.exit(rouge === 0 ? 0 : 1);
