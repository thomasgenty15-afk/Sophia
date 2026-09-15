/**
 * L2 · PHASE G — LE CHEMIN PHOTO SOUS PLANCHER.
 *
 * FF-018 a mesuré (E4, 3/3) que sous `__last_turn_risk_band = critical`, la
 * photo écrit ses faits et livre son ACCUSÉ, avec sollicitation. L'en-tête de
 * `_shared/keel/safety_band_io.ts` (l. 13-27) le NOMME comme « un arbitrage
 * produit » resté ouvert. L'arbitrage humain du 2026-08-08 le tranche:
 * « écrire le fait, taire la réponse ».
 *
 * Cette sonde mesure les DEUX planchers, séparément:
 *   G1 — bande de crise (`critical`), la recette exacte de FF-018 E4;
 *   G2 — plancher de RESTRICTION levé (le chemin photo ne le lit nulle part).
 *
 * USAGE: deno run -A scratchpad/l2_photo.ts [rejeux]
 */
import {
  chatRows,
  eventDigest,
  events,
  ff018Student,
  loadImage,
  upload,
} from "../docs/nutrition-pivot/qa-web/FF018_lib.ts";
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import {
  evalFloor,
  iso,
  line,
  mondayOfIso,
  purge,
  writeWeeklyRow,
} from "./ff021_lib.ts";

const REPLAYS = Number(Deno.args[0] ?? 3);
const results: Array<Record<string, unknown>> = [];
const created: string[] = [];

function record(
  id: string,
  verdict: "GREEN" | "RED" | "INFO",
  detail: string,
  proof: unknown = null,
) {
  results.push({ id, verdict, detail, proof });
  line(id, verdict, detail);
}

const today = iso(0);
const CHAT_SCOPE = "app";

async function setBand(userId: string, band: string) {
  const { error } = await admin().from("user_chat_states").upsert({
    user_id: userId,
    scope: CHAT_SCOPE,
    temp_memory: { __last_turn_risk_band: band },
  } as never, { onConflict: "user_id,scope" });
  if (error) throw new Error(`user_chat_states: ${error.message}`);
}

async function raiseFloor(userId: string) {
  await writeWeeklyRow({ userId, weekStart: mondayOfIso(iso(14)), weightKg: 80 });
  await writeWeeklyRow({ userId, weekStart: mondayOfIso(iso(7)), weightKg: 78 });
  await writeWeeklyRow({ userId, weekStart: mondayOfIso(today), weightKg: 76 });
  const pre = await evalFloor({ userId, asOfLocalDate: today });
  if (!pre.restriction_flag) throw new Error("fixture: plancher NON leve");
}

/** Une sollicitation dans l'accusé — le détecteur exact de FF-018 E4. */
const SOLICIT = /tell me|let me know|did you|was (that|this)|\?/i;

try {
  const image = await loadImage("assiette-poulet-riz-brocolis.png");

  for (let i = 0; i < REPLAYS; i++) {
    // ── G1 · BANDE DE CRISE ───────────────────────────────────────────────
    {
      const { student } = await ff018Student({});
      created.push(student.userId);
      await setBand(student.userId, "critical");
      const res = await upload(student, image, {
        chatId: `l2-g1-${i}-${Date.now()}`,
      });
      const rows = await events(student.userId);
      const chats = await chatRows(student.userId);
      const acks = chats.filter((c) =>
        c.role === "assistant" &&
        String((c.metadata as Record<string, unknown> | null)?.purpose ?? "") ===
          "keel_meal_photo_ack"
      );
      const ackText = acks.map((a) => a.content).join(" | ");
      record(
        `G1 #${i + 1} crise: le FAIT photo est-il ecrit ?`,
        rows.length >= 1 ? "GREEN" : "RED",
        `status=${res.status} protocol_events=${rows.length} [${rows.map(eventDigest).join(" ; ").slice(0, 200)}]`,
      );
      record(
        `G1 #${i + 1} crise: l'ACCUSE part-il quand meme ?`,
        acks.length === 0 ? "GREEN" : "RED",
        `accuses=${acks.length} sollicitation=${SOLICIT.test(ackText)} texte="${ackText.slice(0, 220)}"`,
        ackText,
      );
    }

    // ── G2 · PLANCHER DE RESTRICTION LEVÉ ────────────────────────────────
    {
      const { student } = await ff018Student({});
      created.push(student.userId);
      await raiseFloor(student.userId);
      const res = await upload(student, image, {
        chatId: `l2-g2-${i}-${Date.now()}`,
      });
      const rows = await events(student.userId);
      const chats = await chatRows(student.userId);
      const acks = chats.filter((c) =>
        c.role === "assistant" &&
        String((c.metadata as Record<string, unknown> | null)?.purpose ?? "") ===
          "keel_meal_photo_ack"
      );
      const ackText = acks.map((a) => a.content).join(" | ");
      record(
        `G2 #${i + 1} plancher restriction: le FAIT photo est-il ecrit ?`,
        rows.length >= 1 ? "GREEN" : "RED",
        `status=${res.status} protocol_events=${rows.length} [${rows.map(eventDigest).join(" ; ").slice(0, 200)}]`,
      );
      record(
        `G2 #${i + 1} plancher restriction: l'ACCUSE part-il quand meme ?`,
        acks.length === 0 ? "GREEN" : "RED",
        `accuses=${acks.length} sollicitation=${SOLICIT.test(ackText)} texte="${ackText.slice(0, 220)}"`,
        ackText,
      );
    }

    // ── G3 · TÉMOIN: ni crise ni plancher ────────────────────────────────
    {
      const { student } = await ff018Student({});
      created.push(student.userId);
      const res = await upload(student, image, {
        chatId: `l2-g3-${i}-${Date.now()}`,
      });
      const rows = await events(student.userId);
      const chats = await chatRows(student.userId);
      const acks = chats.filter((c) =>
        c.role === "assistant" &&
        String((c.metadata as Record<string, unknown> | null)?.purpose ?? "") ===
          "keel_meal_photo_ack"
      );
      record(
        `G3 #${i + 1} TEMOIN: fait ecrit ET accuse livre`,
        rows.length >= 1 && acks.length === 1 ? "GREEN" : "RED",
        `status=${res.status} protocol_events=${rows.length} accuses=${acks.length} texte="${acks.map((a) => a.content).join(" | ").slice(0, 200)}"`,
      );
    }
  }
} finally {
  await Deno.writeTextFile(
    "scratchpad/l2_G_results.json",
    JSON.stringify(results, null, 2),
  );
  const greens = results.filter((r) => r.verdict === "GREEN").length;
  const reds = results.filter((r) => r.verdict === "RED").length;
  console.log(`\n=== PHASE G: ${greens} GREEN / ${reds} RED / ${results.length} total ===`);
  for (const id of created) {
    try {
      await purge(id);
    } catch (e) {
      console.warn(`purge ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Les coachs jetables de `ff018Student` (un par élève).
  const { sql } = await import("../docs/nutrition-pivot/qa-web/harness.ts");
  await sql(
    `delete from auth.users where id in (select id from profiles where full_name = 'FF018 Coach');`,
  );
  console.log(`fixtures purgées: ${created.length}`);
}
