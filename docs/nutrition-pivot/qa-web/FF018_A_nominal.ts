/**
 * FF-018 · PHASE A — le cas nominal, joué TROIS fois (le chemin est stochastique).
 *
 * easy : assiette poulet-riz-brocolis → groupes identifiés, fait écrit, bande de
 * portion, zéro kcal / macro / %.
 */
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

const image = await loadImage("assiette-poulet-riz-brocolis.png");
say(`# FF-018 · PHASE A — cas nominal ×3 (${image.name}, ${Math.round(image.bytes / 1024)} Ko)\n`);

for (let run = 1; run <= 3; run += 1) {
  const { student } = await ff018Student();
  const t0 = Date.now();
  const res = await upload(student, image, { note: undefined });
  const ms = Date.now() - t0;
  const rows = await events(student.userId);
  const chat = await chatRows(student.userId);
  const ack = chat.filter((m) => m.role === "assistant").map((m) => m.content).join(" ¶ ");
  const analysisStatus = String(res.json?.analysis?.status ?? "analyzed");

  say(`\n▌ run ${run}  (HTTP ${res.status}, ${ms} ms, user ${student.userId})`);
  say(`  lignes protocol_events : ${rows.length}`);
  for (const r of rows) say(`   · ${r.id} → ${eventDigest(r)}`);
  say(`  analysis.status : ${analysisStatus}`);
  say(`  accusé          : ${ack}`);

  const e = rows[0] ?? {};
  const rec = (e.recognized ?? null) as Record<string, unknown> | null;
  const checks: Array<[string, boolean, string]> = [
    ["une seule ligne", rows.length === 1, `${rows.length}`],
    ["source=photo", e.source === "photo", String(e.source)],
    ["fait compté (disqualified_reason null)", e.disqualified_reason == null, String(e.disqualified_reason)],
    ["evidence_weight = 1.0", Number(e.evidence_weight) === 1, String(e.evidence_weight)],
    ["quantity null", e.quantity == null, String(e.quantity)],
    ["unit null", e.unit == null, String(e.unit)],
    ["substance_ref null", e.substance_ref == null, String(e.substance_ref)],
    ["media_path non vide", String(e.media_path ?? "") !== "", String(e.media_path)],
    ["analyzed_at posé", e.analyzed_at != null, String(e.analyzed_at)],
    [
      "portion_band ∈ {small,moderate,large,unclear}",
      ["small", "moderate", "large", "unclear"].includes(String(e.portion_band)),
      String(e.portion_band),
    ],
    [
      "aliments identifiés",
      Array.isArray(rec?.detected_foods) && (rec!.detected_foods as unknown[]).length > 0,
      JSON.stringify(
        Array.isArray(rec?.detected_foods)
          ? (rec!.detected_foods as Array<Record<string, unknown>>).map((f) => f.label)
          : [],
      ),
    ],
    [
      "food_groups_present non vide",
      Array.isArray(rec?.food_groups_present) && (rec!.food_groups_present as unknown[]).length > 0,
      JSON.stringify(rec?.food_groups_present ?? []),
    ],
    ["subject_kind = eaten_meal", rec?.subject_kind === "eaten_meal", String(rec?.subject_kind)],
  ];

  // Le lexique interdit, sur l'ACCUSÉ et sur TOUT le jsonb `recognized`.
  const recJson = JSON.stringify(rec ?? {});
  const numAck = matchAll(ack, ENERGY_NUMERIC);
  const numRec = matchAll(recJson, ENERGY_NUMERIC).filter((m) => !/^\d+\s*%$/.test(m.trim()));
  const spellAck = matchAll(ack, ENERGY_SPELLED);
  const spellRec = matchAll(recJson, ENERGY_SPELLED);
  checks.push(["accusé sans chiffre d'énergie/macro/%", numAck.length === 0, JSON.stringify(numAck)]);
  checks.push(["recognized sans chiffre d'énergie/macro", numRec.length === 0, JSON.stringify(numRec)]);
  checks.push(["accusé sans énergie en toutes lettres", spellAck.length === 0, JSON.stringify(spellAck)]);
  checks.push(["recognized sans énergie en toutes lettres", spellRec.length === 0, JSON.stringify(spellRec)]);

  for (const [label, ok, detail] of checks) {
    say(`  ${ok ? "✅" : "🔴"} ${label} — ${detail}`);
  }
}

say(`\n${await ff018Cleanup()}`);
await Deno.writeTextFile(new URL("./FF018-A-nominal.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit FF018-A-nominal.txt");
