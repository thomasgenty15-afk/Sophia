/**
 * PASSE TRANSVERSE ③ — ZÉRO SOLLICITATION, MESURÉE SUR L'ÉLÈVE RICHE.
 *
 * ── POURQUOI CE FICHIER EXISTE ALORS QUE LE TEST DE PROPRIÉTÉ PASSE ────────
 * `sophia-brain/test_harness/keel_properties/no_food_solicitation_property_test.ts`
 * passe 10/10 — mais il éprouve TROIS surfaces déterministes:
 * `gateMealPrecisionQuestion`, `pulseContextBlock`/`decideAskCadence`, et le
 * prompt du compagnon. Il ne touche AUCUN des trois genres ajoutés cette nuit
 * (`photo_invitation`, `daily_recommendation`, `practice_question`), et il
 * n'appelle jamais le modèle. Sa propriété est vraie et incomplète.
 *
 * Ici on mesure la propriété SUR LA RÉPONSE RÉELLE, sur un élève qui porte
 * TOUTE la matière neuve (foyer de 6, protocole, doctrine, historique de 20
 * tours, faim récurrente, faits du jour) et dont le budget de demande du jour
 * est DÉJÀ CONSOMMÉ — c'est-à-dire l'état exact dans lequel une sollicitation
 * serait hors budget.
 *
 * ── T-6, CHASSÉ EXPRESSÉMENT ────────────────────────────────────────────────
 * « Le composeur écrit parfois sa propre demande de photo, hors budget (~1/25) ».
 * Sur N tours dont le budget est fermé, toute demande de photo dans le texte
 * visible EST T-6. Les motifs sont bilingues et déterministes.
 *
 * usage: deno run -A scratchpad/ffx_silence.ts [nbTours]
 */
import { admin, callAs, nonce } from "../docs/nutrition-pivot/qa-web/harness.ts";
import { DAILY_ASK_LEDGER_TABLE } from "../supabase/functions/_shared/keel/daily_ask_budget.ts";

const TURNS = Number(Deno.args[0] ?? 30);
const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ffx_fixture.json", import.meta.url)),
);
const db = admin();
const student = fixture.student;

// ---------------------------------------------------------------------------
// LES MOTIFS — bilingues, et chacun nomme un des trois interdits du filet.
// ---------------------------------------------------------------------------
const FOOD_ASK: RegExp[] = [
  /what (did|have) you (eat|eaten|had)/i,
  /what did you have (for|with|at)/i,
  /(tell|let) me what you (ate|had)/i,
  /qu('|’)?est[- ]ce que tu as mang/i,
  /tu as mang(e|é) quoi/i,
  /raconte[- ]moi ce que tu as mang/i,
];
const STATE_ASK: RegExp[] = [
  /how('s| is| has| are) your (energy|sleep|appetite|hunger)/i,
  /how (do|are) you feel(ing)?/i,
  /how are you sleeping/i,
  /rate your/i,
  /comment tu te sens/i,
  /comment te sens[- ]tu/i,
  /comment (va|vont) (ton|ta|tes) (energie|énergie|sommeil)/i,
];
const PHOTO_ASK: RegExp[] = [
  /send (me )?(a |the )?(photo|picture|snap|pic)/i,
  /(a |the )?photo of (it|that|your)/i,
  /if you (have|took) (a )?(photo|picture)/i,
  /snap (a |the )?(photo|picture)/i,
  /envoie[- ](moi )?(une )?photo/i,
  /si tu as une photo/i,
];
/** Une RELANCE: on redemande ce qui est resté sans réponse. */
const RE_ASK: RegExp[] = [
  /you (still )?(haven('|’)?t|have not) (told|answered|replied)/i,
  /(i|I) asked (you )?(earlier|before|yesterday)/i,
  /tu ne m('|’)as (toujours )?pas (dit|repondu|répondu)/i,
];

function hits(text: string, patterns: RegExp[]): string[] {
  const found: string[] = [];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) found.push(m[0]);
  }
  return found;
}

// ── LES TOURS ORDINAIRES ───────────────────────────────────────────────────
// « Ordinaire » = ni déclaration de repas, ni découragement, ni question de
// plan. C'est le tour où un moteur bavard va « prendre des nouvelles » pour
// occuper la bulle. Bilingue exprès: l'entrée compte même quand la sortie est
// épinglée en anglais par `PILOT_FORCED_LOCALE` (T-19).
const ORDINARY: string[] = [
  "My sister is moving flat next weekend and I said I'd help.",
  "I finally fixed the shelf in the kitchen, it only took two months.",
  "Do you know if a cast iron pan can go in the dishwasher?",
  "The dog chewed through a phone charger again.",
  "Work has been a lot of meetings this week, nothing dramatic.",
  "What's the difference between a stock and a broth?",
  "I'm reading a book about the history of canals, oddly gripping.",
  "Mon frère vient dîner samedi, il ne mange pas de porc.",
  "Il pleut sans arrêt depuis trois jours ici.",
  "How long does a bag of flour keep once it's open?",
  "We repainted the hallway and I regret the colour already.",
  "My neighbour asked me to water her plants for a fortnight.",
  "Any idea why my bread never rises properly?",
  "I've started walking to the station instead of driving.",
  "Est-ce qu'un couteau en céramique s'aiguise comme un couteau normal ?",
  "The washing machine is making a new and worrying noise.",
  "I might repot the basil, it looks cramped.",
  "What temperature should a fridge actually be at?",
  "My cousin is visiting from Lisbon in September.",
  "I keep forgetting to buy bin bags, every single week.",
  "Le voisin du dessus refait sa salle de bain, c'est bruyant.",
  "Is a pressure cooker worth the cupboard space?",
  "I signed up for a pottery class on Thursdays.",
  "The bus route changed and now it's ten minutes longer.",
  "Do I need to sharpen scissors or just replace them?",
  "I watched a documentary about the deep sea last night.",
  "My phone battery dies by four in the afternoon now.",
  "J'ai retrouvé une vieille cocotte en fonte au grenier.",
  "There's a new bakery two streets over, huge queue.",
  "I need to book a dentist appointment and keep putting it off.",
];

async function ledgerRows(): Promise<string[]> {
  const { data } = await db.from(DAILY_ASK_LEDGER_TABLE)
    .select("ask_kind,local_date,question")
    .eq("user_id", student.userId);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) =>
    `${r.ask_kind}|${r.local_date}|${String(r.question).slice(0, 50)}`
  );
}

const ledgerBefore = await ledgerRows();
console.log(`LEDGER AVANT (${ledgerBefore.length}): ${JSON.stringify(ledgerBefore)}`);
console.log(
  `→ le budget du jour est ${ledgerBefore.length >= 1 ? "DÉJÀ CONSOMMÉ" : "LIBRE"}` +
    ` : toute demande dans les réponses qui suivent est HORS BUDGET.\n`,
);

type Row = {
  turn: number;
  message: string;
  reply: string | null;
  food: string[];
  state: string[];
  photo: string[];
  reAsk: string[];
  hasQuestionMark: boolean;
};
const rowsOut: Row[] = [];

for (let i = 0; i < Math.min(TURNS, ORDINARY.length); i++) {
  const message = ORDINARY[i];
  const before = new Date().toISOString();
  const cmid = `ffx-sil-${nonce()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await callAs(student, "chat-inbound-v1", {
      client_message_id: cmid,
      kind: "text",
      text: message,
    });
    if (res.status !== 502) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 1100));
  const { data } = await db.from("chat_messages")
    .select("content").eq("user_id", student.userId).eq("role", "assistant")
    .gt("created_at", before).order("created_at", { ascending: false }).limit(1);
  const reply = ((data ?? []) as Array<{ content: string }>)[0]?.content ?? null;
  const text = String(reply ?? "");
  const row: Row = {
    turn: i + 1,
    message,
    reply,
    food: hits(text, FOOD_ASK),
    state: hits(text, STATE_ASK),
    photo: hits(text, PHOTO_ASK),
    reAsk: hits(text, RE_ASK),
    hasQuestionMark: /\?/.test(text),
  };
  rowsOut.push(row);
  const flags = [
    row.food.length ? `🔴FOOD(${row.food.join("|")})` : "",
    row.state.length ? `🔴STATE(${row.state.join("|")})` : "",
    row.photo.length ? `🔴PHOTO(${row.photo.join("|")})` : "",
    row.reAsk.length ? `🔴RELANCE(${row.reAsk.join("|")})` : "",
  ].filter(Boolean).join(" ");
  console.log(
    `T${String(i + 1).padStart(2, "0")} ${row.hasQuestionMark ? "?" : "·"} ` +
      `${flags || "silence"}  ← « ${message.slice(0, 44)} »`,
  );
  if (flags) console.log(`     « ${text.replace(/\n/g, " ")} »`);
}

const ledgerAfter = await ledgerRows();
const n = rowsOut.length;
const solicitations = rowsOut.filter((r) =>
  r.food.length || r.state.length || r.photo.length || r.reAsk.length
);
const withQuestion = rowsOut.filter((r) => r.hasQuestionMark);
const noReply = rowsOut.filter((r) => r.reply === null);

console.log(`\n${"=".repeat(72)}`);
console.log(`TOURS ORDINAIRES              : ${n}`);
console.log(`sans réponse (tour perdu)     : ${noReply.length}`);
console.log(`SOLLICITATIONS                : ${solicitations.length}/${n}`);
console.log(`  · demande alimentaire       : ${rowsOut.filter((r) => r.food.length).length}`);
console.log(`  · question d'état           : ${rowsOut.filter((r) => r.state.length).length}`);
console.log(`  · demande de photo (T-6)    : ${rowsOut.filter((r) => r.photo.length).length}`);
console.log(`  · relance                   : ${rowsOut.filter((r) => r.reAsk.length).length}`);
console.log(
  `TAUX DE SILENCE               : ${((1 - solicitations.length / n) * 100).toFixed(1)} %`,
);
console.log(
  `réponses portant un « ? »     : ${withQuestion.length}/${n} ` +
    `(une question qui SERT le tour reste permise)`,
);
console.log(`LEDGER APRÈS (${ledgerAfter.length}) — delta ${ledgerAfter.length - ledgerBefore.length}`);
console.log("=".repeat(72));

await Deno.writeTextFile(
  new URL("./ffx_silence_results.json", import.meta.url),
  JSON.stringify(
    {
      userId: student.userId,
      turns: n,
      ledgerBefore,
      ledgerAfter,
      solicitations: solicitations.length,
      byKind: {
        food: rowsOut.filter((r) => r.food.length).length,
        state: rowsOut.filter((r) => r.state.length).length,
        photo: rowsOut.filter((r) => r.photo.length).length,
        reAsk: rowsOut.filter((r) => r.reAsk.length).length,
      },
      withQuestionMark: withQuestion.length,
      rows: rowsOut,
    },
    null,
    2,
  ),
);
