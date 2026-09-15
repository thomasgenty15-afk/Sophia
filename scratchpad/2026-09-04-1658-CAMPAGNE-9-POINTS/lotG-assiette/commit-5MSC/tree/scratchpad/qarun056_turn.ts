/**
 * UN tour, piloté à la main — cadre QA `14-qa-test-guidelines.md`.
 *
 * Ce n'est PAS un script de run : il ne contient aucun message utilisateur.
 * Chaque tour est décidé par l'agent QA après lecture du tour précédent, et
 * passé en argument. C'est un instrument de mesure, pas un scénario.
 *
 *   deno run -A qarun056_turn.ts <persona_idx> text   "<message>"
 *   deno run -A qarun056_turn.ts <persona_idx> button "<payload>" "<libellé>"
 *
 * ⚠️ Le libellé est OBLIGATOIRE sur un tap: le contrat d'entrée fait
 * `text: text || buttonPayload` — sans libellé, le JETON BRUT devient le
 * contenu de la bulle de l'élève. Une sonde qui l'omet fabrique un faux
 * défaut d'affichage qui n'existe pas dans le produit.
 *
 * Le jeton n'est JAMAIS affiché (règle du cadre).
 */
const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const idx = Number(Deno.args[0] ?? "0");
const kind = Deno.args[1] as "text" | "button";
const value = Deno.args[2] ?? "";
const label = Deno.args[3] ?? "";
if (!kind || !value) throw new Error("usage: <idx> text|button <valeur> [libellé]");
if (kind === "button" && !label) {
  throw new Error(
    "libellé manquant: le front envoie TOUJOURS {payload,label} (ChatPage.tsx:401). " +
      "Sans lui, le jeton brut devient la bulle de l'élève — artefact de sonde, pas défaut produit.",
  );
}

const personas = JSON.parse(
  await Deno.readTextFile(new URL("./qa056b_personas_qarun.json", import.meta.url)),
);
const p = personas[idx];
const USER = p.user_id as string;
const TOKEN = p.access_token as string;

const cmid = `qarun-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const body: Record<string, unknown> = { client_message_id: cmid, kind };
if (kind === "text") body.text = value;
else {
  body.button_payload = value;
  body.text = label; // exactement ce que fait `send({kind:"button",payload,label}, label)`
}

const t0 = Date.now();
const res = await fetch(`${URL_BASE}/functions/v1/chat-inbound-v1`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${TOKEN}`,
  },
  body: JSON.stringify(body),
});
const ms = Date.now() - t0;
const txt = await res.text();
let json: unknown = null;
try { json = JSON.parse(txt); } catch { /* corps non JSON: on l'affiche brut */ }

console.log(`\n=== HTTP ${res.status} · ${ms} ms · cmid=${cmid} ===`);
if (!json) console.log(txt.slice(0, 600));
else console.log(JSON.stringify(json, null, 2).slice(0, 1400));

// ── LA VÉRITÉ EST EN BASE ────────────────────────────────────────────────────
// Toute sonde distingue « erreur » de « vide » : un `?? []` sur une erreur a
// déjà fait conclure « 0 ligne » sur des cas qui en écrivaient trois.
async function sel(path: string, label: string) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  if (!r.ok) {
    console.log(`\n--- ${label}: ERREUR HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return;
  }
  const rows = await r.json();
  if (!Array.isArray(rows)) {
    console.log(`\n--- ${label}: REPONSE NON-TABLEAU ${JSON.stringify(rows).slice(0, 200)}`);
    return;
  }
  console.log(`\n--- ${label} (${rows.length}) ---`);
  console.log(JSON.stringify(rows, null, 2).slice(0, 1600));
}

await sel(
  `student_weight_divergence_episodes?user_id=eq.${USER}&select=id,state,category,turn_count,observation_ends_on,last_turn_at`,
  "ÉPISODE",
);
await sel(
  `chat_messages?user_id=eq.${USER}&select=role,content,metadata,created_at&order=created_at.desc&limit=3`,
  "3 DERNIERS MESSAGES",
);
await sel(
  `student_daily_recommendations?user_id=eq.${USER}&select=local_date,action_id,state,proposed_text,responded_at,applied_at,expiry_reason`,
  "PROPOSITION DURABLE (FF-028)",
);
