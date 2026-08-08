/**
 * FF-018 · PHASE D — extra-hard : les croisements.
 *
 *  D1 deux uploads SIMULTANÉS, même clé          → une seule ligne (T-17)
 *  D2 deux uploads SIMULTANÉS, clés différentes  → une seule ligne (index sha)
 *  D3 deux uploads SIMULTANÉS, images différentes → deux lignes (pas de faux positif)
 *  D4 photo + note portant des quantités DÉCLARÉES → aucune quantité sur la ligne
 *  D5 photo PENDANT une conversation, puis message texte immédiat
 *  D6 photo répondant à une invitation (FF-025)  → le fait est ENRICHI, pas doublé
 *  D7 même chose avec une photo de MENU          → le repas déclaré SURVIT
 */
import { admin, turn } from "./harness.ts";
import {
  chatRows,
  ENERGY_NUMERIC,
  ENERGY_SPELLED,
  eventDigest,
  events,
  ff018Cleanup,
  ff018Student,
  loadImage,
  matchAll,
  upload,
} from "./FF018_lib.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

const plate = await loadImage("assiette-poulet-riz-brocolis.png");
const apple = await loadImage("assiette-pomme-entiere.png");
const menu = await loadImage("menu-restaurant.jpg");

async function tempMemory(userId: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin()
    .from("user_chat_states")
    .select("temp_memory, updated_at")
    .eq("user_id", userId)
    .eq("scope", "app")
    .maybeSingle();
  return (data as { temp_memory?: Record<string, unknown> } | null)?.temp_memory ?? null;
}
function keysOf(tm: Record<string, unknown> | null): string[] {
  return tm ? Object.keys(tm).sort() : [];
}

say("# FF-018 · PHASE D — croisements\n");

// ── D1/D2/D3 : les courses ──────────────────────────────────────────────────
for (
  const [label, spec] of [
    ["D1 — même clé, même image", { sameKey: true, sameImage: true, expect: 1 }],
    ["D2 — clés différentes, même image", { sameKey: false, sameImage: true, expect: 1 }],
    ["D3 — clés différentes, images différentes", { sameKey: false, sameImage: false, expect: 2 }],
  ] as const
) {
  const { student } = await ff018Student();
  const key = `ff018-race-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const [ra, rb] = await Promise.all([
    upload(student, plate, { uploadId: key, chatId: `${key}-a` }),
    upload(student, spec.sameImage ? plate : apple, {
      uploadId: spec.sameKey ? key : `${key}-b`,
      chatId: `${key}-b`,
    }),
  ]);
  const rows = await events(student.userId);
  const photoRows = rows.filter((r) => r.source === "photo");
  const chat = await chatRows(student.userId);
  say(`\n▌ ${label}`);
  say(`  HTTP ${ra.status}/${rb.status} — idempotent=${ra.json?.idempotent}/${rb.json?.idempotent} duplicate=${ra.json?.duplicate}/${rb.json?.duplicate}`);
  say(`  lignes protocol_events : ${rows.length} (dont photo: ${photoRows.length})`);
  for (const r of rows) say(`   · ${r.id} → ${eventDigest(r)}`);
  say(`  bulle : ${chat.filter((m) => m.role === "assistant").length} accusé(s)`);
  say(`  ${photoRows.length === spec.expect ? "✅" : "🔴"} attendu ${spec.expect} ligne(s) photo`);
}

// ── D4 : la note porte des quantités déclarées ──────────────────────────────
{
  const { student } = await ff018Student();
  const note = "I ate 180 g of chicken, 200 g of rice and about 150 g of broccoli.";
  const res = await upload(student, plate, { note });
  const rows = await events(student.userId);
  const e = rows[0] ?? {};
  const chat = await chatRows(student.userId);
  const ack = chat.filter((m) => m.role === "assistant").map((m) => m.content).join(" ¶ ");
  const bad = [...matchAll(ack, ENERGY_NUMERIC), ...matchAll(ack, ENERGY_SPELLED)];
  say(`\n▌ D4 — photo + note portant des quantités DÉCLARÉES`);
  say(`  note envoyée : « ${note} »`);
  say(`  HTTP ${res.status} — ${rows.length} ligne(s) : ${rows.map(eventDigest).join(" ;; ")}`);
  say(`  student_note en base : « ${e.student_note} »`);
  say(`  accusé : ${ack}`);
  say(`  ${e.quantity == null && e.unit == null ? "✅" : "🔴"} quantity/unit restent NULL malgré la déclaration`);
  say(`  ${String(e.student_note ?? "") === note ? "✅" : "🔴"} la déclaration est conservée TELLE QUELLE (et nulle part ailleurs)`);
  say(`  ${bad.length === 0 ? "✅" : "🔴"} l'accusé ne reprend aucun chiffre nutritionnel — ${JSON.stringify(bad)}`);
  const userBubble = chat.find((m) => m.role === "user");
  say(`  bulle élève : « ${userBubble?.content} »`);
}

// ── D5 : photo PENDANT une conversation, puis message texte immédiat ────────
{
  const { student } = await ff018Student();
  say(`\n▌ D5 — photo pendant une conversation active, puis texte immédiat`);
  const t1 = await turn(student, "Hey, quick one before dinner: is rice ok tonight?");
  say(`  tour 1 (texte)  : « ${String(t1.reply ?? "").slice(0, 160)} »`);
  const before = await tempMemory(student.userId);
  say(`  temp_memory AVANT photo : ${JSON.stringify(keysOf(before))}`);

  const res = await upload(student, plate, { chatId: `ff018-d5-${Date.now()}` });
  const after = await tempMemory(student.userId);
  say(`  HTTP ${res.status} — event ${res.json?.event?.id}`);
  say(`  temp_memory APRÈS photo : ${JSON.stringify(keysOf(after))}`);
  const lostKeys = keysOf(before).filter((k) => !keysOf(after).includes(k));
  say(`  ${lostKeys.length === 0 ? "✅" : "🔴"} aucune clé perdue par l'écriture photo — perdues=${JSON.stringify(lostKeys)}`);
  say(
    `  flow de précision ouvert : ${
      after && "__keel_meal_photo_flow_state" in after ? "oui" : "NON"
    }`,
  );

  const t2 = await turn(student, "actually that was turkey, not chicken");
  const rows = await events(student.userId);
  say(`  tour 2 (correction) : « ${String(t2.reply ?? "").slice(0, 220)} »`);
  say(`  lignes après correction : ${rows.length}`);
  for (const r of rows) say(`   · ${r.id} → ${eventDigest(r)}`);
  const photoRows = rows.filter((r) => r.source === "photo");
  say(`  ${rows.length === photoRows.length ? "✅" : "🔴"} la correction n'a pas écrit un SECOND repas (${rows.length} lignes, ${photoRows.length} photo)`);
  const afterCorrection = await tempMemory(student.userId);
  say(`  temp_memory APRÈS correction : ${JSON.stringify(keysOf(afterCorrection))}`);

  // LA COURSE VRAIE : photo et texte lancés EN MÊME TEMPS.
  const { student: racer } = await ff018Student();
  await turn(racer, "hi");
  const tmBefore = await tempMemory(racer.userId);
  const [photoRes, textRes] = await Promise.all([
    upload(racer, plate, { chatId: `ff018-d5b-${Date.now()}` }),
    turn(racer, "so what should I aim for tomorrow?"),
  ]);
  const tmAfter = await tempMemory(racer.userId);
  const racerRows = await events(racer.userId);
  say(`\n  ▹ course réelle photo ‖ texte`);
  say(`    photo HTTP ${photoRes.status}, texte HTTP ${textRes.status}`);
  say(`    temp_memory avant : ${JSON.stringify(keysOf(tmBefore))}`);
  say(`    temp_memory après : ${JSON.stringify(keysOf(tmAfter))}`);
  say(`    lignes : ${racerRows.length} — ${racerRows.map(eventDigest).join(" ;; ")}`);
  const flowSurvived = Boolean(tmAfter && "__keel_meal_photo_flow_state" in tmAfter);
  say(`    flow photo présent après la course : ${flowSurvived ? "oui" : "NON — écrasé par l'écrivain texte"}`);
}

// ── D6/D7 : la photo répond à une invitation (FF-025 R4) ────────────────────
for (
  const [label, image, expectAttach] of [
    ["D6 — photo d'assiette après invitation", plate, true],
    ["D7 — photo de MENU après invitation", menu, false],
  ] as const
) {
  const { student } = await ff018Student();
  say(`\n▌ ${label}`);
  // On SEMENCE le hors-plan + l'invitation : le déclencheur est FF-025, ce
  // qu'on éprouve ici est le RATTACHEMENT.
  const db = admin();
  const localDate = new Date().toISOString().slice(0, 10);
  const { data: declared, error: declErr } = await db.from("protocol_events").insert({
    user_id: student.userId,
    occurred_at: new Date().toISOString(),
    local_date: localDate,
    slot_key: "dinner",
    source: "text",
    plan_relation: "off_plan",
    student_note: "I ordered a pizza tonight",
    content_locale: "en-US",
    evidence_weight: 0.8,
    source_message_id: `ff018-declared-${crypto.randomUUID()}`,
  } as never).select("id").single();
  if (declErr) {
    say(`  🔴 semis impossible : ${declErr.message}`);
    continue;
  }
  const declaredId = String((declared as { id: string }).id);
  const { error: askErr } = await db.from("meal_precision_questions").insert({
    user_id: student.userId,
    local_date: localDate,
    source: "chat",
    ask_kind: "photo_invitation",
    protocol_event_id: declaredId,
    question: "If you have a photo of it, send it over.",
    asked_for_message_id: `ff018-invite-${crypto.randomUUID()}`,
    asked_at: new Date().toISOString(),
  } as never);
  if (askErr) {
    say(`  🔴 semis d'invitation impossible : ${askErr.message}`);
    continue;
  }
  const before = await events(student.userId);
  say(`  avant photo : ${before.length} ligne(s) — ${before.map(eventDigest).join(" ;; ")}`);

  const res = await upload(student, image, { chatId: `ff018-attach-${Date.now()}` });
  const after = await events(student.userId);
  say(`  HTTP ${res.status}, attached_to_declared_meal=${res.json?.attached_to_declared_meal}`);
  say(`  après photo : ${after.length} ligne(s)`);
  for (const r of after) say(`   · ${r.id}${r.id === declaredId ? " (déclaré)" : ""} → ${eventDigest(r)}`);
  const declaredRow = after.find((r) => r.id === declaredId);
  if (expectAttach) {
    say(`  ${after.length === 1 ? "✅" : "🔴"} un seul repas (${after.length})`);
    say(`  ${declaredRow && String(declaredRow.media_path ?? "") !== "" ? "✅" : "🔴"} la ligne déclarée porte la photo`);
    say(`  ${declaredRow && declaredRow.plan_relation === "off_plan" ? "✅" : "🔴"} la ligne déclarée reste off_plan`);
  } else {
    say(`  ${after.length === 2 ? "✅" : "🔴"} la photo de menu reste son PROPRE fait (${after.length} lignes)`);
    say(
      `  ${declaredRow && declaredRow.disqualified_reason == null ? "✅" : "🔴"} le repas déclaré N'A PAS été disqualifié (disq=${
        declaredRow?.disqualified_reason
      })`,
    );
    say(`  ${declaredRow && String(declaredRow.media_path ?? "") === "" ? "✅" : "🔴"} le repas déclaré n'a PAS reçu la photo de menu`);
  }
}

say(`\n${await ff018Cleanup()}`);
await Deno.writeTextFile(new URL("./FF018-D-crossings.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit FF018-D-crossings.txt");
