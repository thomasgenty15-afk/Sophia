// BANC D'ESSAI · sonde de disponibilité — quels identifiants la passerelle sert
// réellement. À lancer AVANT toute campagne: `generation_model.ts` documente
// qu'un identifiant invalide n'a pas de repli, il ARRÊTE.
//
//   deno run --allow-net --allow-env --env-file=supabase/.env \
//     scratchpad/banc-modeles/list-models.ts
import { loadEnvFile } from "./env.ts";
const env = loadEnvFile("supabase/.env");
// Même construction que `_shared/gemini.ts`: la base N'INCLUT PAS `/v1`.
const openaiBase = (env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
const openaiKey = env.OPENAI_API_KEY ?? "";
const geminiKey = env.GEMINI_API_KEY ?? "";
console.log(`clés lues: openai=${openaiKey.length} car., gemini=${geminiKey.length} car.`);

console.log(`base OpenAI: ${openaiBase}`);

try {
  const r = await fetch(`${openaiBase}/v1/models`, {
    headers: { Authorization: `Bearer ${openaiKey}` },
  });
  const body = await r.json();
  const ids: string[] = (body?.data ?? []).map((m: { id: string }) => m.id).sort();
  console.log(`\n== OpenAI (${r.status}) — ${ids.length} modèles ==`);
  for (const id of ids) console.log("  " + id);
} catch (e) {
  console.log("OpenAI: échec —", String(e).slice(0, 200));
}

try {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=200`,
  );
  const body = await r.json();
  const ids: string[] = (body?.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      (m.supportedGenerationMethods ?? []).includes("generateContent")
    )
    .map((m: { name: string }) => m.name.replace(/^models\//, ""))
    .sort();
  console.log(`\n== Gemini (${r.status}) — ${ids.length} modèles ==`);
  for (const id of ids) console.log("  " + id);
} catch (e) {
  console.log("Gemini: échec —", String(e).slice(0, 200));
}
