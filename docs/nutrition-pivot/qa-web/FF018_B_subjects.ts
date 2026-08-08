/**
 * FF-018 · PHASE B — medium : les dix images, le filtre de sujet, et la dédup.
 *
 * Chaque image traverse la VRAIE chaîne (`meal-photo-upload-v1` →
 * `analyze-meal-photo-v1` → modèle de vision) sur un élève neuf. La photo
 * réputée instable (trop sombre) est rejouée TROIS fois.
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

type Expect = "compte" | "refuse";
const SUBJECTS: Array<{ file: string; label: string; expect: Expect; runs?: number }> = [
  { file: "assiette-poulet-riz-brocolis.png", label: "assiette (nominal)", expect: "compte" },
  { file: "assiette-saumon-sauce-luisante.png", label: "assiette qui cache (sauce)", expect: "compte" },
  { file: "assiette-pomme-entiere.png", label: "assiette qui ne cache rien", expect: "compte" },
  { file: "menu-restaurant.jpg", label: "menu de restaurant", expect: "refuse" },
  { file: "capture-app-livraison.jpg", label: "capture d'app de livraison", expect: "refuse" },
  { file: "rayon-supermarche.png", label: "rayon de supermarché", expect: "refuse" },
  { file: "selfie.png", label: "selfie", expect: "refuse" },
  { file: "paysage.png", label: "paysage", expect: "refuse" },
  { file: "etiquette-nutritionnelle.jpg", label: "étiquette nutritionnelle", expect: "refuse" },
  { file: "photo-trop-sombre.jpg", label: "photo illisible (trop sombre)", expect: "refuse", runs: 3 },
];

const allAcks: string[] = [];

say("# FF-018 · PHASE B — filtre de sujet sur dix images\n");

for (const subject of SUBJECTS) {
  const image = await loadImage(subject.file);
  say(`\n▌ ${subject.label}  (${subject.file}, ${Math.round(image.bytes / 1024)} Ko) — attendu: ${subject.expect}`);
  const verdicts: string[] = [];
  for (let pass = 1; pass <= (subject.runs ?? 1); pass += 1) {
    const { student } = await ff018Student();
    const res = await upload(student, image);
    const rows = await events(student.userId);
    const chat = await chatRows(student.userId);
    const ack = chat.filter((m) => m.role === "assistant").map((m) => m.content).join(" ¶ ");
    if (ack) allAcks.push(ack);
    const e = rows[0] ?? {};
    const rec = (e.recognized ?? null) as Record<string, unknown> | null;
    const counted = rows.length === 1 && e.disqualified_reason == null;
    const foods = Array.isArray(rec?.detected_foods)
      ? (rec!.detected_foods as Array<Record<string, unknown>>).length
      : 0;
    verdicts.push(`${rec?.subject_kind ?? "-"}/${e.disqualified_reason ?? "<compté>"}/${e.portion_band ?? "-"}`);
    say(`  passe ${pass} (HTTP ${res.status}) : ${rows.length} ligne(s) — ${rows.map(eventDigest).join(" ;; ")}`);
    say(`    accusé : ${ack}`);
    const ok = (subject.expect === "compte") === counted;
    say(`    ${ok ? "✅" : "🔴"} attendu ${subject.expect} → ${counted ? "compté" : "refusé"}`);
    if (subject.expect === "refuse") {
      say(
        `    ${foods === 0 ? "✅" : "🔴"} aucun aliment retenu sur la ligne (detected_foods=${foods})`,
      );
    }
  }
  if ((subject.runs ?? 1) > 1) {
    const stable = new Set(verdicts).size === 1;
    say(`  ${stable ? "✅" : "🟠"} stabilité sur ${verdicts.length} passes : ${JSON.stringify(verdicts)}`);
  }
}

// ── DÉDUP EXACTE ────────────────────────────────────────────────────────────
say(`\n\n▌ DÉDUP — même client_upload_id, puis même image sous une AUTRE clé`);
{
  const { student } = await ff018Student();
  const a = await loadImage("assiette-poulet-riz-brocolis.png");
  const b = await loadImage("assiette-pomme-entiere.png");
  const id = `ff018-dedup-${Date.now()}`;
  const r1 = await upload(student, a, { uploadId: id, chatId: `${id}-c1` });
  const n1 = (await events(student.userId)).length;
  const r2 = await upload(student, a, { uploadId: id, chatId: `${id}-c2` });
  const n2 = (await events(student.userId)).length;
  const r3 = await upload(student, a, { uploadId: `${id}-autre`, chatId: `${id}-c3` });
  const n3 = (await events(student.userId)).length;
  const r4 = await upload(student, b, { uploadId: `${id}-b`, chatId: `${id}-c4` });
  const n4 = (await events(student.userId)).length;
  say(`  1re photo               → HTTP ${r1.status}, events=${n1}`);
  say(
    `  MÊME clé, MÊME image    → HTTP ${r2.status}, idempotent=${r2.json?.idempotent} duplicate=${r2.json?.duplicate}, events=${n2}  ${
      n2 === n1 ? "✅ une seule ligne" : "🔴 DOUBLON"
    }`,
  );
  say(
    `  AUTRE clé, MÊME image   → HTTP ${r3.status}, idempotent=${r3.json?.idempotent} duplicate=${r3.json?.duplicate}, events=${n3}  ${
      n3 === n2 ? "✅ une seule ligne" : "🔴 DOUBLON"
    }`,
  );
  say(
    `  AUTRE image             → HTTP ${r4.status}, events=${n4}  ${
      n4 === n3 + 1 ? "✅ deux photos = deux faits" : "🔴 anti-faux-positif cassé"
    }`,
  );
  const chat = await chatRows(student.userId);
  say(`  bulle (${chat.length} messages) :`);
  for (const m of chat) say(`   · ${m.role}: ${String(m.content).slice(0, 150)}`);
}

// ── L'ACCUSÉ, TOUS RUNS CONFONDUS ───────────────────────────────────────────
say(`\n\n▌ LIGNE ROUGE — aucun accusé ne porte d'énergie (chiffres ET lettres, FR+EN)`);
for (const ack of [...new Set(allAcks)]) {
  const bad = [...matchAll(ack, ENERGY_NUMERIC), ...matchAll(ack, ENERGY_SPELLED)];
  say(`  ${bad.length === 0 ? "✅" : "🔴"} ${ack.slice(0, 180)}${bad.length ? ` → ${JSON.stringify(bad)}` : ""}`);
}

say(`\n${await ff018Cleanup()}`);
await Deno.writeTextFile(new URL("./FF018-B-subjects.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit FF018-B-subjects.txt");
