/**
 * FF-056 · LOT BOUTONS — LA MESURE DE DÉTERMINISME.
 *
 * Protocole: N personas IDENTIQUES (même fixture, même série, même épisode),
 * une SEULE phrase identique — ou un seul tap identique. On lit la catégorie
 * RETENUE EN BASE, jamais la réponse HTTP.
 *
 * C'est le protocole historique du dépôt (`[0,3,3,0]` = quatre groupes de trois
 * runs sur une phrase identique). Le modèle ne tourne que dans le runtime edge
 * (les clés y vivent, pas dans un `.env`): tout passe donc par HTTP.
 *
 * Usage:
 *   deno run -A qa056b_measure.ts text <fichier_personas.json> "<phrase>"
 *   deno run -A qa056b_measure.ts tap  <fichier_personas.json> <suffixe...>
 *
 * Pour `tap`, le suffixe est ce qui suit `<episodeId>|` — le script recompose
 * la charge avec l'identifiant d'épisode DE CHAQUE persona.
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";

const [mode, file, ...rest] = Deno.args;
const arg = rest.join(" ");
const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const db = admin();

type Persona = {
  user_id: string;
  access_token: string;
  locale: string;
  episode: Array<{ id: string }>;
};
const personas: Persona[] = JSON.parse(
  await Deno.readTextFile(new URL(`./${file}`, import.meta.url)),
);

async function sendText(p: Persona, text: string) {
  const res = await fetch(`${URL_BASE}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "x-user-authorization": `Bearer ${p.access_token}`,
    },
    body: JSON.stringify({
      user_id: p.user_id,
      content: text,
      channel: "web",
      scope: "app",
      force_full_ai: true,
      disable_debounce: true,
    }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, reply: String(json?.response?.content ?? "") };
}

async function sendTap(p: Persona, suffix: string) {
  const episodeId = p.episode?.[0]?.id;
  if (!episodeId) throw new Error(`persona ${p.user_id}: aucun épisode`);
  const [verb, token] = suffix.split(" ");
  const payload = `${verb}|${episodeId}|${token}`;
  const res = await fetch(`${URL_BASE}/functions/v1/chat-inbound-v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${p.access_token}`,
    },
    body: JSON.stringify({
      client_message_id: `qa056b-${crypto.randomUUID()}`,
      kind: "button",
      button_payload: payload,
    }),
  });
  const json = await res.json().catch(() => null);
  const msgs = await db.from("chat_messages")
    .select("content").eq("user_id", p.user_id).eq("role", "assistant")
    // La bulle d ouverture est datee du SOIR SIMULE (19h30 local), donc dans le
    // futur par rapport a l horloge du run: sans ce filtre on relirait la
    // question au lieu de la reponse au tap.
    .lte("created_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1);
  if (msgs.error) throw new Error(`chat_messages: ${msgs.error.message}`);
  return {
    status: res.status,
    reply: String((msgs.data ?? [])[0]?.content ?? ""),
    handled: json?.handled_as ?? null,
  };
}

const rows: Array<Record<string, unknown>> = [];
for (const p of personas) {
  const t0 = Date.now();
  const sent = mode === "text" ? await sendText(p, arg) : await sendTap(p, arg);
  const eps = await db.from("student_weight_divergence_episodes")
    .select("id,state,category,turn_count").eq("user_id", p.user_id);
  if (eps.error) throw new Error(`episodes: ${eps.error.message}`);
  const row = (eps.data ?? [])[0] as Record<string, unknown> | undefined;
  rows.push({
    user: p.user_id.slice(0, 8),
    http: sent.status,
    ms: Date.now() - t0,
    category: row?.category ?? null,
    state: row?.state ?? null,
    turns: row?.turn_count ?? null,
    reply: sent.reply.replace(/\n/g, " / ").slice(0, 160),
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
}

const cats = rows.map((r) => String(r.category));
const distinct = [...new Set(cats)];
console.log("\n=== DÉTERMINISME ===");
console.log(`mode=${mode} n=${rows.length}`);
console.log(`catégories observées: ${JSON.stringify(cats)}`);
console.log(
  `DISTINCTES: ${distinct.length} → ${
    distinct.length === 1 ? "CONSTANT" : "NON DÉTERMINISTE"
  }`,
);
