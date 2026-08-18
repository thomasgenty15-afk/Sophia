/**
 * FF-021 · PHASE F — T-7 APPLIQUÉ AU PLANCHER DE RESTRICTION.
 *
 * Le plancher avale-t-il l'EFFET, ou seulement la SOLLICITATION ? Et que
 * devient la suspension quand l'épisode clinique se FERME (le latch) ?
 *
 * Hypothèses écrites AVANT d'être jouées:
 *  H4 — épisode OUVERT: `direct_effects_to_run: []` (routers.ts:405) ⇒ ni
 *       écriture ni demande. Le plancher avale les DEUX.
 *  H5 — épisode FERMÉ: le routeur ne voit plus le drapeau
 *       (`conversationalRestrictionGuardForRouters` rend `null`) ⇒ les effets
 *       ET les lanes de demande REVIENNENT, alors que la suspension est censée
 *       ne se lever que par une revue coach.
 *  H6 — les planchers qui écrivent EUX-MÊMES (FF-008 poids, FF-027 faim) ne
 *       passent pas par `direct_effects` et écrivent donc même sous plancher
 *       levé, épisode ouvert.
 */
import {
  evalFloor,
  iso,
  line,
  makeCoach,
  makeStudent,
  mondayOfIso,
  publishPlanFor,
  purge,
  sql,
  writeWeeklyRow,
} from "./ff021_lib.ts";
import { turn } from "../docs/nutrition-pivot/qa-web/harness.ts";

const results: Array<Record<string, unknown>> = [];
const created: string[] = [];

function record(id: string, verdict: "GREEN" | "RED" | "INFO", detail: string, proof: unknown = null) {
  results.push({ id, verdict, detail, proof });
  line(id, verdict, detail);
}

const today = iso(0);
const w0 = mondayOfIso(today);
const wm1 = mondayOfIso(iso(7));
const wm2 = mondayOfIso(iso(14));

const coaches: Awaited<ReturnType<typeof makeCoach>>[] = [];
let seats = 0;
async function nextCoach() {
  if (seats % 3 === 0) {
    const c = await makeCoach({ displayName: `FF021F Coach ${coaches.length + 1}` });
    coaches.push(c);
    created.push(c.userId);
  }
  seats++;
  return coaches[coaches.length - 1];
}

async function ownerOf(userId: string): Promise<string> {
  const out = await sql(
    `select response_owner from conversation_turn_traces where user_id = '${userId}' order by ts desc limit 1`,
  );
  return (out.split("\n")[1] ?? "").trim() || "(aucune trace)";
}

async function count(q: string): Promise<string> {
  const out = await sql(q);
  return (out.split("\n")[1] ?? "0").trim();
}

async function raisedStudent(locale = "en-US") {
  const coach = await nextCoach();
  const s = await makeStudent({ coach, locale, timezone: "Europe/Paris" });
  created.push(s.userId);
  await publishPlanFor(coach, s.userId);
  await writeWeeklyRow({ userId: s.userId, weekStart: wm2, weightKg: 80 });
  await writeWeeklyRow({ userId: s.userId, weekStart: wm1, weightKg: 78 });
  await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 76 });
  const pre = await evalFloor({ userId: s.userId, asOfLocalDate: today });
  if (!pre.restriction_flag) throw new Error("fixture: plancher NON leve");
  return s;
}

try {
  // ── F1 · épisode OUVERT: déclaration de repas ────────────────────────────
  {
    const s = await raisedStudent();
    const r = await turn(s, "I had grilled chicken and rice for lunch today");
    const owner = await ownerOf(s.userId);
    const events = await count(
      `select count(*) from protocol_events where user_id = '${s.userId}'`,
    );
    const asks = await count(
      `select count(*) from meal_precision_questions where user_id = '${s.userId}'`,
    );
    record(
      "F1 episode OUVERT: repas declare (H4)",
      owner === "disordered_eating_guard" && events === "0" && asks === "0"
        ? "GREEN"
        : "RED",
      `owner=${owner} protocol_events=${events} demandes=${asks} reply="${
        (r.reply ?? "").slice(0, 120)
      }"`,
      r.reply,
    );
    record(
      "F1-bis le fait perdu laisse-t-il une TRACE ? (T-7)",
      "INFO",
      `blocked_paths de la trace: ${
        (await sql(
          `select jsonb_path_query_array(route_decision, '$.blocked_paths[*].path')::text from conversation_turn_traces where user_id = '${s.userId}' order by ts desc limit 1`,
        )).split("\n").slice(1).join(" ").slice(0, 300)
      }`,
    );
  }

  // ── F2 · épisode FERMÉ (latch): la même déclaration ──────────────────────
  {
    const s = await raisedStudent();
    // On ferme par le CHEMIN RÉEL: le plafond de 6 tours du reducer.
    for (let i = 0; i < 6; i++) {
      await turn(s, `ok${i === 0 ? "" : ", " + "i see".repeat(1)}`);
    }
    const afterCap = await ownerOf(s.userId);
    const stillRaised = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    record(
      "F2-0 latch: le routeur ne voit plus le drapeau, le plancher est leve",
      `${afterCap}|${stillRaised.restriction_flag}`.includes("true")
        ? "INFO"
        : "INFO",
      `owner_du_6e_tour=${afterCap} plancher=${stillRaised.restriction_flag} state=${
        (await sql(
          `select temp_memory -> '__keel_disordered_eating_guard_state' ->> 'closed' from user_chat_states where user_id = '${s.userId}'`,
        )).split("\n")[1]
      }`,
    );

    const r = await turn(s, "I had grilled chicken and rice for lunch today");
    const owner = await ownerOf(s.userId);
    const events = await count(
      `select count(*) from protocol_events where user_id = '${s.userId}'`,
    );
    const asks = await sql(
      `select ask_kind, question from meal_precision_questions where user_id = '${s.userId}'`,
    );
    const askRows = asks.split("\n").slice(1).filter(Boolean);
    record(
      "F2 episode FERME: la declaration ECRIT-elle ? (H5)",
      events === "0" ? "GREEN" : "RED",
      `owner=${owner} protocol_events=${events} (0 = la suspension survit au latch)`,
      r.reply,
    );
    record(
      "F2-bis episode FERME: une DEMANDE part-elle ? (H5)",
      askRows.length === 0 ? "GREEN" : "RED",
      `demandes=${askRows.length} [${askRows.join(" | ").slice(0, 200)}] reply="${
        (r.reply ?? "").slice(0, 160)
      }"`,
      r.reply,
    );
  }

  // ── F3 · le poids annoncé DANS LE CHAT sous plancher levé (FF-008, H6) ───
  {
    const s = await raisedStudent();
    const r = await turn(s, "I weighed myself this morning, I'm at 74 kg now");
    const owner = await ownerOf(s.userId);
    const stored = await sql(
      `select week_start_date, biofeedback ->> 'weight_kg' from weekly_reviews where user_id = '${s.userId}' order by week_start_date desc limit 2`,
    );
    record(
      "F3 poids annonce sous plancher leve: ECRIT ? (H6)",
      "INFO",
      `owner=${owner} lignes=${stored.split("\n").slice(1).join(" ; ")}`,
      r.reply,
    );
    // La réponse doit être MUETTE sur le chiffre (weight_readout supprimé).
    const leak = (r.reply ?? "").match(/\b\d{2,3}([.,]\d)?\s*(kg|kilos?|lb|pounds)\b/i);
    record(
      "F3-bis la reponse re-affiche-t-elle le poids ? (weight_readout)",
      leak ? "RED" : "GREEN",
      `fuite=${leak ? leak[0] : "aucune"} reply="${(r.reply ?? "").slice(0, 150)}"`,
      r.reply,
    );
  }

  // ── F4 · la faim déclarée sous plancher levé (FF-027, H6) ───────────────
  {
    const s = await raisedStudent();
    const r = await turn(s, "I've been really hungry all week, I'm starving between meals");
    const owner = await ownerOf(s.userId);
    const hunger = await count(
      `select count(*) from student_hunger_reports where user_id = '${s.userId}'`,
    );
    record(
      "F4 faim declaree sous plancher leve: ECRIT ? (H6, FF-027 R5)",
      hunger === "1" ? "GREEN" : "INFO",
      `owner=${owner} student_hunger_reports=${hunger} (FF-027 R5: le signal s'enregistre, RIEN ne s'affiche)`,
      r.reply,
    );
    const talksHunger = /\b(hungry|hunger|faim|satiety|satiet|rassasi)\b/i.test(r.reply ?? "");
    record(
      "F4-bis la reponse parle-t-elle de la faim ? (FF-027 §3 l'interdit)",
      talksHunger ? "INFO" : "GREEN",
      `mentionne=${talksHunger} reply="${(r.reply ?? "").slice(0, 150)}"`,
      r.reply,
    );
  }
} finally {
  await Deno.writeTextFile(
    "scratchpad/ff021_F_results.json",
    JSON.stringify({ created, results }, null, 2),
  );
  console.log(
    `\n--- GREEN=${results.filter((r) => r.verdict === "GREEN").length} RED=${
      results.filter((r) => r.verdict === "RED").length
    } INFO=${results.filter((r) => r.verdict === "INFO").length}`,
  );
  if (Deno.env.get("FF021_KEEP") !== "1") {
    for (const id of created) {
      try {
        await purge(id);
      } catch (e) {
        console.warn(`purge ${id}: ${e}`);
      }
    }
    console.log("--- fixtures purgées");
  }
}
