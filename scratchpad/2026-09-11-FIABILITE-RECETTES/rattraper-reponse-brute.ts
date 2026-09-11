/**
 * Recopie dans une sortie de campagne la RÉPONSE BRUTE du modèle, lue dans
 * `llm_raw_response_events` par identifiant de requête.
 *
 * ⚠️ POURQUOI CE RATTRAPAGE EXISTE : les tirs n° 1 et n° 2 sont partis avant que
 * `campagne-lot-F.ts` ne recopie cette réponse. Sans elle, le contrôle ⑨ n'a
 * rien à comparer et sort à zéro — ce qui se lirait « aucune prose périmée »
 * alors que ça veut dire « on n'a pas regardé ». Les tirs suivants la portent
 * d'origine.
 *
 * ⛔ LECTURE SEULE EN BASE. La seule écriture est le fichier de sortie du tir.
 *
 *   deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
 *     scratchpad/2026-09-11-FIABILITE-RECETTES/rattraper-reponse-brute.ts <sortie.json>
 */
import { loadDotEnv } from "./transport-lot-F.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const dotenv = loadDotEnv(`${ROOT}supabase/.env`);
for (const [k, v] of Object.entries(dotenv)) {
  if (!Deno.env.get(k)) Deno.env.set(k, v);
}
const API = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

const chemin = Deno.args[0];
if (!chemin) {
  console.error("usage : rattraper-reponse-brute.ts <sortie.json>");
  Deno.exit(2);
}
const sortie = JSON.parse(await Deno.readTextFile(chemin)) as Record<string, unknown>;
const requestId = String(
  (sortie.reponse as Record<string, unknown>)?.request_id ?? "",
);
if (!requestId) {
  console.error("⛔ cette sortie ne porte aucun identifiant de requête.");
  Deno.exit(1);
}
const r = await fetch(
  `${API}/rest/v1/llm_raw_response_events?request_id=eq.${requestId}` +
    `&source=eq.generate-household-meal-v1&status=eq.success` +
    `&select=output_text,created_at&order=created_at.asc`,
  { headers: { apikey: SVC, authorization: `Bearer ${SVC}` } },
);
const lignes = await r.json() as Record<string, unknown>[];
if (!Array.isArray(lignes) || lignes.length === 0) {
  console.error(`⛔ aucune réponse brute pour ${requestId}`);
  Deno.exit(1);
}
// ⛔ LE PREMIER SUCCÈS, ET PAS LE DERNIER. Une réparation écrit une SECONDE
// ligne ; la prose persistée descend de la composition, donc c'est elle qu'on
// compare. Le nombre de succès est imprimé pour que ce choix soit visible.
sortie.reponse_brute = String(lignes[0].output_text ?? "");
await Deno.writeTextFile(chemin, JSON.stringify(sortie, null, 2));
console.log(
  `✅ ${chemin} : ${String(sortie.reponse_brute).length} caractères recopiés ` +
    `(${lignes.length} succès sur cette requête, le PREMIER est gardé)`,
);
