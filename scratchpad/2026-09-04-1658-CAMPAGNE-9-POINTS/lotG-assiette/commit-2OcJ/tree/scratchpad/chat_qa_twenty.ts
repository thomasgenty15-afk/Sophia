/** TEST 10 — vingt tours ORDINAIRES, et on compte les demandes alimentaires. */
const URL_BASE = "http://127.0.0.1:54321";
const ANON = Deno.env.get("QA_ANON_KEY")!;
const persona = JSON.parse(await Deno.readTextFile(Deno.args[0]));

const TURNS = [
  "salut", "ça va ?", "je suis crevé", "tu fais quoi comme boulot exactement ?",
  "c'est quoi une bonne source de protéines ?", "merci", "et le quinoa c'est bien ?",
  "je pars en vacances la semaine prochaine", "il fait beau aujourd'hui",
  "tu connais des recettes rapides ?", "ok", "je vais courir ce soir",
  "combien de temps pour cuire du riz complet ?", "d'accord",
  "mon frigo est vide", "je déteste faire les courses", "tu peux m'expliquer les fibres ?",
  "je dors mal en ce moment", "bonne soirée", "à demain",
];

const FOOD_ASK = [
  /\btu as mang[ée]\b/i, /\bqu[' ]?as[- ]tu mang[ée]\b/i, /\bce que tu as mang[ée]\b/i,
  /\bt[' ]?as mang[ée] quoi\b/i, /\braconte[- ]moi ta journ[ée]e\b/i,
  /\bwhat (did|have) you (eat|eaten|had)\b/i, /\bwhat did you have\b/i,
  /\bhow (was|did) your (eating|day of eating)\b/i, /\btell me what you ate\b/i,
  /\bton [ée]nergie\b.*\?/i, /\bhow(?:'s| is) your energy\b/i,
  /\bcomment tu dors\b/i, /\bhow are you sleeping\b/i,
  /\bton app[ée]tit\b.*\?/i, /\bhow(?:'s| is) your appetite\b/i,
];

let asks = 0;
const offenders: string[] = [];
for (const [i, text] of TURNS.entries()) {
  const res = await fetch(`${URL_BASE}/functions/v1/chat-inbound-v1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON,
      authorization: `Bearer ${persona.accessToken}`,
    },
    body: JSON.stringify({
      kind: "text",
      text,
      client_message_id: `qa20-${Date.now()}-${i}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`turn ${i + 1}/20  ${res.status}  ${text}`);
  if (res.status !== 200) offenders.push(`turn ${i + 1}: HTTP ${res.status} ${JSON.stringify(body)}`);
}
console.log(JSON.stringify({ asks, offenders }));
