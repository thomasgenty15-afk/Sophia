/**
 * FF-023 — EXTRA-HARD : les combinaisons.
 *
 *   X3  20 tours denses  → le budget de prompt tient, la doctrine survit
 *                          (mesuré tour par tour dans les logs edge).
 *   X4  VRAIE photo      → `meal-photo-upload-v1` (vrai modèle de vision),
 *                          puis « et du coup ? » : le fil n'est pas perdu.
 *   X5  course temp_memory → un message texte PENDANT l'upload photo:
 *                          qui gagne, et qu'est-ce qui disparaît.
 *   X6  planchers + fil  → l'historique n'introduit AUCUNE double écriture.
 *
 * Usage :
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run -A scratchpad/ff023_extra.ts <X3|X4|X5|X6|all>
 */
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

import {
  admin,
  callAs,
  cleanup,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  type Student,
  transcript,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const ONLY = (Deno.args[0] ?? "all").trim();

const out: string[] = [];
const say = (s: string) => {
  console.log(s);
  out.push(s);
};

const DOCTRINE = {
  beliefs: [
    { claim: "Every meal is built on a protein anchor.", rationale: null },
    { claim: "Vegetables are the volume of the plate, not the garnish.", rationale: null },
  ],
  forbidden: [
    {
      token: "count_calories",
      surface_forms: ["count calories", "counting calories", "compter les calories"],
      reason: "numbers turn food into a score",
      instead: "We build the plate: a protein anchor, vegetables for volume.",
    },
  ],
  vocabulary: [{ term: "anchor meal", meaning: "the protein base of a plate" }],
  arbitrations: [],
  voice: { tone: "Direct, warm, never preachy." },
  foods: { recommended: [], discouraged: [] },
};

async function newStudent(): Promise<{ coach: Coach; student: Student }> {
  const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
  const { error } = await admin().from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    ...DOCTRINE,
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw error;
  const student = await makeStudent({
    coach,
    timezone: "Europe/London",
    country: "GB",
    locale: "en-US",
    fullName: "Sam",
  });
  await publishPlanFor(coach, student.userId);
  return { coach, student };
}

/** Les tailles de prompt du companion, tour par tour, lues dans les logs edge. */
async function promptSizes(): Promise<
  Array<{ request_id: string; stable: number; semi: number; volatile: number; full: number }>
> {
  // ⚠️ `--tail N` EST UNE FENÊTRE GLISSANTE, PAS UN CURSEUR. Prendre la
  // longueur avant/après et faire `slice(before)` rendait SYSTÉMATIQUEMENT
  // vide dès que le run produisait assez de logs pour faire sortir les
  // anciennes lignes de la fenêtre — mesuré: 0 taille de prompt sur un run de
  // 20 tours qui en avait produit 20. On identifie donc par `request_id`.
  const cmd = new Deno.Command("docker", {
    args: ["logs", "--tail", "60000", "supabase_edge_runtime_Sophia_2"],
    stdout: "piped",
    stderr: "piped",
  });
  const res = await cmd.output();
  const text = new TextDecoder().decode(res.stdout) +
    new TextDecoder().decode(res.stderr);
  const found: Array<
    { request_id: string; stable: number; semi: number; volatile: number; full: number }
  > = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf('{"tag":"companion_prompt_cache_ready"');
    if (at < 0) continue;
    const end = line.indexOf("}", at);
    try {
      const parsed = JSON.parse(line.slice(at, end + 1));
      found.push({
        request_id: String(parsed.request_id ?? ""),
        stable: Number(parsed.stable_chars ?? 0),
        semi: Number(parsed.semi_stable_chars ?? 0),
        volatile: Number(parsed.volatile_chars ?? 0),
        full: Number(parsed.full_chars ?? 0),
      });
    } catch { /* ligne tronquée par docker: ignorée */ }
  }
  return found;
}

/** Les diagnostics d'historique émis par `chat-inbound-v1`, tour par tour. */
async function historyDiagnostics(): Promise<string[]> {
  const cmd = new Deno.Command("docker", {
    args: ["logs", "--tail", "4000", "supabase_edge_runtime_Sophia_2"],
    stdout: "piped",
    stderr: "piped",
  });
  const res = await cmd.output();
  const text = new TextDecoder().decode(res.stdout) +
    new TextDecoder().decode(res.stderr);
  return text.split("\n")
    .filter((l) => l.includes("chat_inbound_history_"))
    .map((l) => l.slice(l.indexOf('{"tag"')).trim());
}

async function tempMemory(userId: string): Promise<string> {
  const got = await rows(
    `select left(temp_memory::text, 400) from user_chat_states
       where user_id='${userId}' and scope='app'`,
  ).catch((e) => [`<${e.message}>`]);
  return got[0] ?? "<aucune ligne>";
}

// ═══════════════════════════════════════════════════════════════════════════
// X3 — VINGT TOURS DENSES
// ═══════════════════════════════════════════════════════════════════════════
async function runX3() {
  const { coach, student } = await newStudent();
  say(`\n${"=".repeat(78)}\n▌ X3 — 20 tours denses — élève ${student.userId}\n${"=".repeat(78)}`);

  const filler =
    "Some context you might want: I have been thinking about how the week " +
    "is laid out, what I can cook in advance, and how to not end up ordering " +
    "food at nine in the evening again. ";
  const messages = [
    // Le FAIT à retrouver au tour 20 — donné une seule fois, au tour 1.
    "One thing you should know: my daughter is called Iris and she is allergic to kiwi.",
    ...Array.from(
      { length: 18 },
      (_, i) => `${filler}Point ${i + 1}: ${filler}`,
    ),
    "What is my daughter's name, and what is she allergic to?",
  ];

  const seenBefore = new Set((await promptSizes()).map((s) => s.request_id));
  for (const [i, message] of messages.entries()) {
    const r = await turn(student, message);
    say(`T${String(i + 1).padStart(2, "0")} → ${r.reply?.slice(0, 130).replace(/\n/g, " ") ?? "‼️ RIEN"}`);
  }
  const sizes = (await promptSizes()).filter((s) => !seenBefore.has(s.request_id));
  say("\nTAILLES DE PROMPT (stable | semi | volatile | full) — budget = 32 000 :");
  for (const [i, s] of sizes.entries()) {
    say(
      `  tour ${String(i + 1).padStart(2, "0")} : ${s.stable} | ${s.semi} | ` +
        `${s.volatile} | ${s.full}${s.full > 32_000 ? "  ⚠️ DÉPASSEMENT" : ""}`,
    );
  }
  const maxFull = Math.max(0, ...sizes.map((s) => s.full));
  const first = sizes[0];
  const last = sizes[sizes.length - 1];
  say(`\nMAX full_chars = ${maxFull} (plafond dur 32 000 = 8 000 tokens + bloc langue)`);
  if (first && last) {
    say(
      `AVANT/APRÈS dans le MÊME élève — tour 1 (0 message d'historique) vs ` +
        `tour ${sizes.length} (20 messages) : semi ${first.semi} → ${last.semi}, ` +
        `volatile ${first.volatile} → ${last.volatile}, full ${first.full} → ${last.full}`,
    );
  }
  // Le plafond DUR est 32 000; le bloc RESPONSE_LANGUAGE s'ajoute APRÈS le
  // budget (c'est écrit dans `companion.ts` et c'est voulu), d'où la marge.
  say(`VERDICT budget : ${maxFull <= 33_000 ? "GREEN" : "RED"}`);
  const saturated = sizes.filter((s) => s.full >= 32_000).length;
  say(`TOURS SATURÉS (troncature effective) : ${saturated}/${sizes.length}`);

  // LA DOCTRINE À LA TRONCATURE — preuve COMPORTEMENTALE, pas structurelle:
  // au tour le plus saturé, l'interdit du coach doit encore tenir.
  const doctrineProbe = await turn(student, "should I start counting my calories?");
  say(`\nSONDE DOCTRINE (au tour le plus saturé) : ${doctrineProbe.reply}`);
  const flat = String(doctrineProbe.reply ?? "").toLowerCase();
  const endorses = /\b(yes|go ahead|good idea|start counting)\b/.test(flat) &&
    !/\b(don't|do not|doesn't|instead|not how)\b/.test(flat);
  say(`VERDICT doctrine sous troncature : ${endorses ? "RED" : "GREEN"}`);

  const diags = (await historyDiagnostics()).filter((d) => d.includes(student.userId));
  say("\nDIAGNOSTICS D'HISTORIQUE (cet élève) :");
  for (const d of diags) say(`  ${d}`);

  // D'OÙ VIENT CE QUE L'AGENT AFFIRME AU TOUR 20 — la question qui décide si
  // une phrase est groundée ou confabulée.
  const constraints = await rows(
    `select kind, coalesce(allergen_ref, substance_ref, condition_ref, '?'), severity, status
       from student_safety_constraints where user_id='${student.userId}'`,
  ).catch((e) => [`<${e.message}>`]);
  say(`\nCONTRAINTES DE SÉCURITÉ EN BASE : ${constraints.join(" | ") || "<aucune>"}`);

  await cleanup(student.userId);
  await cleanup(coach.userId).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// X4 — VRAIE PHOTO AU MILIEU DU FIL
// ═══════════════════════════════════════════════════════════════════════════
async function runX4() {
  const { coach, student } = await newStudent();
  say(`\n${"=".repeat(78)}\n▌ X4 — VRAIE photo au milieu — élève ${student.userId}\n${"=".repeat(78)}`);

  const t1 = await turn(
    student,
    "I've been stressed about a work presentation on Friday, it's the first one I run alone.",
  );
  say(`T1 SOPHIA : ${t1.reply}`);

  const bytes = await Deno.readFile(
    new URL("../docs/nutrition-pivot/qa-web/images/assiette-poulet-riz-brocolis.png", import.meta.url),
  );
  const up = await callAs(student, "meal-photo-upload-v1", {
    mime_type: "image/png",
    base64: encodeBase64(bytes),
    client_upload_id: `ff023-${Date.now()}`,
    chat_client_message_id: `ff023-photo-${Date.now()}`,
  });
  say(`PHOTO     : HTTP ${up.status} — ${JSON.stringify(up.json).slice(0, 220)}`);

  const t3 = await turn(student, "and so, about the presentation — any thoughts?");
  say(`T3 SOPHIA : ${t3.reply}`);

  const thread = await transcript(student.userId);
  say("\nFIL EN BASE :");
  for (const row of thread) {
    say(`  ${row.role.padEnd(9)} | ${String(row.content).slice(0, 90).replace(/\n/g, " ")}`);
  }
  const normalized = String(t3.reply ?? "").toLowerCase();
  const anchored = ["presentation", "friday", "stress", "alone"].filter((t) =>
    normalized.includes(t)
  );
  say(`\nVERDICT X4 : ${anchored.length > 0 ? "GREEN" : "AMBER"} (ancrage: [${anchored.join(", ")}])`);

  await cleanup(student.userId);
  await cleanup(coach.userId).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// X5 — LA COURSE `temp_memory`
// ═══════════════════════════════════════════════════════════════════════════
async function runX5() {
  const { coach, student } = await newStudent();
  say(`\n${"=".repeat(78)}\n▌ X5 — course temp_memory — élève ${student.userId}\n${"=".repeat(78)}`);

  // Un tour texte d'abord, pour qu'il y ait un état à écraser.
  await turn(student, "I had grilled chicken and broccoli for lunch today.");
  say(`AVANT (après tour texte) : ${await tempMemory(student.userId)}`);

  const bytes = await Deno.readFile(
    new URL("../docs/nutrition-pivot/qa-web/images/assiette-poulet-riz-brocolis.png", import.meta.url),
  );
  // LA FENÊTRE DE COURSE EST COURTE ET ON NE SAIT PAS OÙ ELLE TOMBE.
  // `openMealPrecisionFlowState` lit `temp_memory` à la FIN du pipeline photo
  // (après l'analyse vision) et le réécrit ENTIER; le tour texte fait pareil.
  // On décale donc le texte de plusieurs offsets pour balayer la fenêtre, au
  // lieu de tirer une fois et d'en conclure quoi que ce soit.
  //
  // ⚠️ UNE IMAGE DIFFÉRENTE PAR TENTATIVE, ET C'EST LA CORRECTION D'UN PREMIER
  // RUN INVALIDE. Rejouer la MÊME photo fait passer les tentatives 2..N par le
  // chemin de DÉDUP (« I already have that photo »), qui n'ouvre aucun flow et
  // n'écrit donc jamais la moitié qu'on cherche à faire écraser. Trois des
  // quatre offsets ne testaient rien.
  const RACE_IMAGES = [
    "assiette-poulet-riz-brocolis.png",
    "assiette-saumon-sauce-luisante.png",
    "assiette-pomme-entiere.png",
    "assiette-poulet-riz-brocolis.png",
  ];
  const OFFSETS_MS = [0, 4000, 9000, 13000];
  for (const [attempt, offsetMs] of OFFSETS_MS.entries()) {
    const raceBytes = await Deno.readFile(
      new URL(
        `../docs/nutrition-pivot/qa-web/images/${RACE_IMAGES[attempt]}`,
        import.meta.url,
      ),
    );
    const uploadId = `ff023-race-${offsetMs}-${Date.now()}`;
    const photoPromise = callAs(student, "meal-photo-upload-v1", {
      mime_type: "image/png",
      base64: encodeBase64(raceBytes),
      client_upload_id: uploadId,
      chat_client_message_id: `ff023-race-photo-${offsetMs}-${Date.now()}`,
    });
    const textPromise = (async () => {
      await new Promise((r) => setTimeout(r, offsetMs));
      return await turn(
        student,
        `race probe at ${offsetMs} ms: I really can't stand cooked mushrooms`,
      );
    })();
    const [photo, text] = await Promise.allSettled([photoPromise, textPromise]);
    const state = await tempMemory(student.userId);
    const hasPhotoFlow = state.includes("__keel_meal_photo_flow_state") ||
      state.includes("meal_precision");
    const rhythmTurns = /"recent_turns":\s*\[([^\]]*)\]/.exec(state)?.[1] ?? "?";
    say(
      `\n— offset ${String(offsetMs).padStart(5)} ms — ` +
        `img=${RACE_IMAGES[attempt].slice(9, 22)} photo:${photo.status === "fulfilled" ? `HTTP ${photo.value.status}` : "KO"} ` +
        `texte:${text.status === "fulfilled" ? `HTTP ${text.value.status}` : "KO"} ` +
        `| flow photo présent: ${hasPhotoFlow} | recent_turns: [${rhythmTurns}]`,
    );
    say(`  état: ${state.slice(0, 300)}`);
  }

  const thread = await transcript(student.userId);
  say("\nFIL EN BASE (l'historique, LUI, ne se perd pas — il est en table) :");
  for (const row of thread) {
    say(`  ${row.created_at} | ${row.role.padEnd(9)} | ${String(row.content).slice(0, 80).replace(/\n/g, " ")}`);
  }

  // Le tour SUIVANT voit-il les deux moitiés ?
  const after = await turn(student, "so what did I just send you and what did I just tell you?");
  say(`\nTOUR SUIVANT : ${after.reply}`);

  await cleanup(student.userId);
  await cleanup(coach.userId).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// X6 — LES PLANCHERS DANS LE FIL : AUCUNE DOUBLE ÉCRITURE
// ═══════════════════════════════════════════════════════════════════════════
async function runX6() {
  const { coach, student } = await newStudent();
  say(`\n${"=".repeat(78)}\n▌ X6 — planchers dans le fil — élève ${student.userId}\n${"=".repeat(78)}`);

  const messages = [
    "I had grilled chicken and broccoli for lunch.",
    "I weighed myself this morning, 78 kg.",
    "I really can't stand cooked mushrooms, by the way.",
    "so, going back to my lunch — was that alright?",
    // Le tour de contrôle: le MÊME message que le tour 1 ne doit pas se
    // réécrire parce qu'il est maintenant dans l'historique.
    "anyway, what should I aim for tonight?",
  ];
  for (const [i, message] of messages.entries()) {
    const r = await turn(student, message);
    say(`T${i + 1} → ${r.reply?.slice(0, 120).replace(/\n/g, " ") ?? "‼️ RIEN"}`);
  }

  const counts = await rows(
    `select
       (select count(*) from protocol_events where user_id='${student.userId}') as protocol_events,
       (select count(*) from weekly_reviews where user_id='${student.userId}') as weekly_reviews,
       (select count(*) from student_safety_constraints where user_id='${student.userId}') as safety_constraints,
       (select count(*) from planned_deviations where user_id='${student.userId}') as deviations`,
  ).catch((e) => [`<${e.message}>`]);
  say(`\nCOMPTEURS : ${counts.join(" | ")}`);

  const events = await rows(
    `select created_at, coalesce(food_group_ref,'-'), coalesce(disqualified_reason,'<compté>')
       from protocol_events where user_id='${student.userId}' order by created_at`,
  ).catch((e) => [`<${e.message}>`]);
  say("LIGNES protocol_events :");
  for (const e of events) say(`  ${e}`);

  const measures = await rows(
    `select week_start_date, biofeedback, outcomes from weekly_reviews
       where user_id='${student.userId}' order by week_start_date`,
  ).catch((e) => [`<${e.message}>`]);
  say("LIGNES weekly_reviews (le poids y atterrit) :");
  for (const m of measures) say(`  ${m}`);

  await cleanup(student.userId);
  await cleanup(coach.userId).catch(() => {});
}

if (ONLY === "all" || ONLY === "X3") await runX3();
if (ONLY === "all" || ONLY === "X4") await runX4();
if (ONLY === "all" || ONLY === "X5") await runX5();
if (ONLY === "all" || ONLY === "X6") await runX6();

await Deno.writeTextFile(
  new URL(`./ff023-extra-${ONLY}.txt`, import.meta.url),
  out.join("\n") + "\n",
);
console.log(`\n→ écrit scratchpad/ff023-extra-${ONLY}.txt`);
