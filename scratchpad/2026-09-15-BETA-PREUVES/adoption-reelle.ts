/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — L'ADOPTION, EN VRAI, SANS UN SEUL APPEL MODÈLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le brouillon a été composé une fois, et payé une fois. Tout ce qui suit passe
 * par la VRAIE fonction edge, à travers Kong, et ne coûte rien: l'adoption relit
 * le `write_payload` gelé et l'écrit dans une transaction. Aucun prompt n'est
 * construit.
 *
 * ① ADOPTER            → 200, un `meal_id`, une ligne écrite
 * ② SECOND TAP         → 200 `already_written`, LE MÊME `meal_id`, toujours
 *                        UNE seule ligne (défaut R2 de l'audit du 2026-09-14)
 * ③ RÉPONSE PERDUE     → retrouvée par le `draft_id`, l'identité stable
 *
 *   deno run -A adoption-reelle.ts <draft_id> <email>
 */
const API = (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321").trim();
const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
const DRAFT = Deno.args[0] ?? "";
const EMAIL = Deno.args[1] ?? "";
if (!ANON || !SVC || !DRAFT || !EMAIL) {
  console.error("⛔ usage: adoption-reelle.ts <draft_id> <email> (+ env SUPABASE_*)");
  Deno.exit(2);
}

const jeton = await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: "1234567" }),
})).json();
const TOK = String(jeton.access_token ?? "");
if (!TOK) {
  console.error("⛔ connexion refusée", jeton);
  Deno.exit(2);
}

async function lire(path: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    headers: { apikey: SVC, authorization: `Bearer ${SVC}` },
  });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j as Record<string, unknown>[] : [];
}

/** Le corps EXACT que `planDraft.ts::writeFromDraft` envoie. */
async function adopter(): Promise<{ status: number; body: Record<string, unknown>; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${API}/functions/v1/generate-household-meal-v1`, {
    method: "POST",
    headers: {
      apikey: ANON,
      authorization: `Bearer ${TOK}`,
      "content-type": "application/json",
      "x-request-id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      operation: "compose",
      intent: "prepare_next",
      replaces: null,
      window: { kind: "days", count: 3 },
      context: null,
      cooking_shape: null,
      one_cooking_session: false,
      preferences: null,
      draft_id: DRAFT,
      adopting_draft: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, ms: Date.now() - t0 };
}

const plansAvant = await lire(`student_generated_meals?select=id&order=created_at.desc`);
const appelsAvant =
  (await lire(`llm_raw_response_events?select=id&order=created_at.desc&limit=200`)).length;
console.log(`plans en base avant : ${plansAvant.length} · lignes de registre : ${appelsAvant}`);

// ── ① ─────────────────────────────────────────────────────────────────────
const un = await adopter();
const mealUn = String(
  ((un.body.meal ?? {}) as Record<string, unknown>).id ?? "",
);
console.log(
  `\n① ADOPTER        HTTP ${un.status} en ${un.ms} ms · meal ${mealUn || "(aucun)"}` +
    ` · already_written=${un.body.already_written}` +
    ` · gate=${JSON.stringify((un.body.diagnostics ?? {}) as Record<string, unknown>)}`,
);
if (un.status !== 200 || !mealUn) {
  console.error("⛔ l'adoption a échoué:", JSON.stringify(un.body).slice(0, 600));
  Deno.exit(1);
}

// ── ② ─────────────────────────────────────────────────────────────────────
const deux = await adopter();
const mealDeux = String(
  ((deux.body.meal ?? {}) as Record<string, unknown>).id ?? "",
);
console.log(
  `② SECOND TAP     HTTP ${deux.status} en ${deux.ms} ms · meal ${mealDeux || "(aucun)"}` +
    ` · already_written=${deux.body.already_written}`,
);

// ── ③ ─────────────────────────────────────────────────────────────────────
// Ce que fait `writeFromDraft` quand le transport tombe: il cherche par le
// `draft_id`, jamais par un `request_id` tiré à neuf.
const parBrouillon = await lire(
  `student_meal_drafts?id=eq.${DRAFT}&select=id,status,adopted_meal_id`,
);
const retrouve = String(parBrouillon[0]?.adopted_meal_id ?? "");
console.log(
  `③ RÉPONSE PERDUE brouillon ${parBrouillon[0]?.status} → meal ${retrouve || "(aucun)"}`,
);

// ── LE VERDICT ────────────────────────────────────────────────────────────
const plansApres = await lire(`student_generated_meals?select=id&order=created_at.desc`);
const appelsApres =
  (await lire(`llm_raw_response_events?select=id&order=created_at.desc&limit=200`)).length;
// ⚠️ ON NE COMPTE QUE LES VERROUS DE CETTE DEMANDE. La base porte encore le
// bail mort du 546 du 2026-09-14, gardé comme pièce: le compter ici ferait
// échouer une preuve qui ne parle pas de lui.
const verrous = (await lire(`household_generation_lock?select=request_id,started_at`))
  .filter((v) => Date.parse(String(v.started_at)) > Date.now() - 600_000);

const checks: [string, boolean, string][] = [
  ["le premier tap écrit un plan", un.status === 200 && mealUn !== "", mealUn],
  ["le second tap RÉUSSIT (plus de 409)", deux.status === 200, `HTTP ${deux.status}`],
  ["il rend LE MÊME plan", mealDeux === mealUn, `${mealDeux} vs ${mealUn}`],
  [
    "il dit qu'il n'a rien écrit",
    deux.body.already_written === true,
    String(deux.body.already_written),
  ],
  [
    // ⚠️ L'INVARIANT N'EST PAS « +1 ». Rejoué sur un brouillon DÉJÀ adopté, le
    // premier appel de ce script est lui-même un second tap: il ne doit alors
    // rien écrire. Ce qui se vérifie des deux côtés est « une adoption qui dit
    // n'avoir rien écrit n'écrit rien ».
    "le nombre de plans suit ce que la réponse déclare",
    plansApres.length - plansAvant.length === (un.body.already_written === true ? 0 : 1),
    `${plansAvant.length} → ${plansApres.length} (already_written=${un.body.already_written})`,
  ],
  [
    "un seul plan porte ce brouillon",
    (await lire(
      `student_meal_drafts?adopted_meal_id=eq.${mealUn}&select=id`,
    )).length === 1,
    mealUn,
  ],
  [
    "AUCUN appel modèle n'a été payé",
    appelsApres === appelsAvant,
    `${appelsAvant} → ${appelsApres}`,
  ],
  ["la reprise par `draft_id` retrouve le plan", retrouve === mealUn, retrouve],
  ["aucun verrou laissé", verrous.length === 0, `${verrous.length} verrou(x)`],
];
console.log("\n── VERDICT ───────────────────────────────────────────────");
let rouge = 0;
for (const [quoi, ok, detail] of checks) {
  if (!ok) rouge++;
  console.log(`   ${ok ? "✅" : "⛔"} ${quoi.padEnd(42)} ${detail}`);
}
console.log(`\n${rouge === 0 ? "✅ adoption réelle: R2 fermé" : `⛔ ${rouge} défaut(s)`}`);
Deno.exit(rouge === 0 ? 0 : 1);
