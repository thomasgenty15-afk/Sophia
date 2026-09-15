/**
 * FF-018 · PHASE C — hard : les modes de défaillance de §7.
 *
 *  C1 non-image déguisée en jpeg          → refus par octets magiques
 *  C2 en-tête PNG valide + octets pourris → l'upload SURVIT, l'analyse échoue
 *  C3 élève SANS plan publié              → la photo compte quand même
 *  C4 charge au-dessus du plafond         → refus
 *  C5 mime déclaré ≠ mime réel            → refus (désaccord = signal)
 */
import { callAs } from "./harness.ts";
import {
  chatRows,
  eventDigest,
  events,
  ff018Cleanup,
  ff018Student,
  loadImage,
  upload,
} from "./FF018_lib.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

say("# FF-018 · PHASE C — modes de défaillance\n");

// ── C1 : non-image déguisée ─────────────────────────────────────────────────
{
  const { student } = await ff018Student();
  const res = await callAs(student, "meal-photo-upload-v1", {
    mime_type: "image/jpeg",
    base64: btoa("MZ this is a windows executable pretending to be a plate"),
  });
  const rows = await events(student.userId);
  say(`\n▌ C1 — non-image déclarée image/jpeg`);
  say(`  HTTP ${res.status} : ${JSON.stringify(res.json).slice(0, 180)}`);
  say(`  ${res.status === 400 && rows.length === 0 ? "✅" : "🔴"} refusée, ${rows.length} ligne écrite`);
}

// ── C5 : mime déclaré ≠ mime réel ───────────────────────────────────────────
{
  const { student } = await ff018Student();
  const png = await loadImage("assiette-pomme-entiere.png");
  const res = await callAs(student, "meal-photo-upload-v1", {
    mime_type: "image/jpeg", // menteur : les octets sont du PNG
    base64: png.base64,
  });
  const rows = await events(student.userId);
  say(`\n▌ C5 — PNG déclaré image/jpeg`);
  say(`  HTTP ${res.status} : ${JSON.stringify(res.json).slice(0, 180)}`);
  say(`  ${res.status === 400 && rows.length === 0 ? "✅" : "🔴"} refusée, ${rows.length} ligne écrite`);
}

// ── C2 : l'analyse échoue, la photo reste ───────────────────────────────────
{
  const { student } = await ff018Student();
  // Signature PNG authentique, puis du bruit : `sniffImageMime` passe, le
  // modèle de vision ne peut rien en faire.
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const junk = new Uint8Array(header.length + 4096);
  junk.set(header, 0);
  for (let i = header.length; i < junk.length; i += 1) junk[i] = (i * 37) % 251;
  const res = await callAs(student, "meal-photo-upload-v1", {
    mime_type: "image/png",
    base64: encodeBase64(junk),
    chat_client_message_id: `ff018-broken-${Date.now()}`,
  });
  const rows = await events(student.userId);
  const chat = await chatRows(student.userId);
  const ack = chat.filter((m) => m.role === "assistant").map((m) => m.content).join(" ¶ ");
  const e = rows[0] ?? {};
  say(`\n▌ C2 — en-tête PNG valide + octets illisibles`);
  say(`  HTTP ${res.status}, analysis=${JSON.stringify(res.json?.analysis).slice(0, 260)}`);
  say(`  lignes : ${rows.length} — ${rows.map(eventDigest).join(" ;; ")}`);
  say(`  accusé : ${ack}`);
  const analysisFailed = String(res.json?.analysis?.status ?? "") === "failed";
  say(`  ${res.status === 200 && rows.length === 1 ? "✅" : "🔴"} la photo est enregistrée malgré tout`);
  say(`  ${analysisFailed ? "✅" : "🟠"} analysis.status = ${res.json?.analysis?.status}`);
  say(
    `  ${e.recognized == null && e.analyzed_at == null ? "✅" : "🔴"} aucun fait inventé (recognized=${
      JSON.stringify(e.recognized)
    }, analyzed_at=${e.analyzed_at})`,
  );
  say(`  ${e.food_group_ref == null && e.portion_band == null ? "✅" : "🔴"} ni groupe ni bande inventés`);
  say(`  ${ack.length > 0 ? "✅" : "🔴"} l'échec est VISIBLE dans la bulle`);
}

// ── C3 : élève sans plan publié ─────────────────────────────────────────────
{
  const { student } = await ff018Student({ withPublishedPlan: false });
  const image = await loadImage("assiette-poulet-riz-brocolis.png");
  const res = await upload(student, image);
  const rows = await events(student.userId);
  const chat = await chatRows(student.userId);
  const ack = chat.filter((m) => m.role === "assistant").map((m) => m.content).join(" ¶ ");
  const e = rows[0] ?? {};
  say(`\n▌ C3 — élève SANS plan publié (le cas NORMAL du modèle KEEL)`);
  say(`  HTTP ${res.status}, lignes : ${rows.length} — ${rows.map(eventDigest).join(" ;; ")}`);
  say(`  accusé : ${ack}`);
  say(`  ${res.status === 200 && rows.length === 1 ? "✅" : "🔴"} la photo compte quand même`);
  say(`  ${e.disqualified_reason == null ? "✅" : "🔴"} fait non disqualifié`);
  const talksAboutPlan = /your plan|line on your plan|counted toward/i.test(ack);
  say(`  ${talksAboutPlan ? "🔴" : "✅"} l'accusé ne parle pas d'un plan qui n'existe pas`);
}

// ── C4 : charge au-dessus du plafond ────────────────────────────────────────
{
  const { student } = await ff018Student();
  const res = await callAs(student, "meal-photo-upload-v1", {
    mime_type: "image/jpeg",
    base64: "A".repeat(12_000_001),
  });
  const rows = await events(student.userId);
  say(`\n▌ C4 — charge au-dessus du plafond du schéma`);
  say(`  HTTP ${res.status} : ${JSON.stringify(res.json).slice(0, 200)}`);
  say(`  ${res.status === 400 && rows.length === 0 ? "✅" : "🔴"} refusée, ${rows.length} ligne écrite`);
}

say(`\n${await ff018Cleanup()}`);
await Deno.writeTextFile(new URL("./FF018-C-failures.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit FF018-C-failures.txt");
