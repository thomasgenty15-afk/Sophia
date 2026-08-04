/**
 * L4 — LA PHOTO DE REPAS, avec de VRAIES images.
 *
 * Les neuf fixtures de `qa-web/images/` traversent `meal-photo-upload-v1`, qui
 * appelle `analyze-meal-photo-v1` — donc un vrai modèle de vision. On relit
 * `protocol_events` et le texte de l'accusé.
 *
 * Ce que ce fichier éprouve, dans l'ordre du prompt de mission :
 *   1. le FILTRE DE SUJET, sur huit sujets différents ;
 *   2. la STABILITÉ du verdict : la même image, deux fois ;
 *   3. l'ACCUSÉ : jamais une calorie, jamais un macro, jamais un pourcentage ;
 *   4. la DÉDUP exacte : la même photo, le même jour ;
 *   5. la QUESTION DE CLARIFICATION : une seule, et jamais quantitative.
 */
import { admin, callAs, makeCoach, makeStudent, publishPlanFor, rows, scalar, type Coach } from "./harness.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

/** Lexique interdit dans un accusé (contrat, non-input #4). */
const FORBIDDEN_IN_ACK = [
  "calorie", "calories", "kcal", "kj", "macro", "macros", "protein g", "carbs g",
  "%", "percent", "pour cent", "gram", "grams", "gramme", "grammes",
];
/** Lexique de quantité, interdit dans une QUESTION. */
const QUANTITY_LEXICON = [
  "how much", "how many", "how large", "how big", "portion", "portions",
  "gram", "grams", "ounce", "serving", "quantity", "amount", "combien",
  "grosse", "gros", "copieux", "beaucoup", "generous", "plenty", "a lot",
  "half a", "a whole", "bien mange",
];
function hits(text: string, lexicon: readonly string[]): string[] {
  const flat = String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return lexicon.filter((t) =>
    t === "%" ? flat.includes("%") : new RegExp(`(^|[^a-z])${t.replace(/ /g, "\\s+")}([^a-z]|$)`).test(flat)
  );
}

async function coachWithDoctrine(): Promise<Coach> {
  const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
  await admin().from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [{ claim: "Every meal is built on a protein anchor.", rationale: null }],
    forbidden: [],
    vocabulary: [],
    arbitrations: [],
    voice: { tone: "Direct, warm." },
    foods: { recommended: [], discouraged: [] },
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  return coach;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

async function loadImage(name: string): Promise<{ base64: string; mime: string; bytes: number }> {
  const path = new URL(`./images/${name}`, import.meta.url);
  const bytes = await Deno.readFile(path);
  const ext = name.split(".").pop()!.toLowerCase();
  return { base64: encodeBase64(bytes), mime: MIME[ext] ?? "image/png", bytes: bytes.length };
}

type Subject = { file: string; label: string; expect: "compte" | "refuse" };

const SUBJECTS: Subject[] = [
  { file: "assiette-poulet-riz-brocolis.png", label: "assiette (nominal)", expect: "compte" },
  { file: "assiette-saumon-sauce-luisante.png", label: "assiette qui cache (sauce)", expect: "compte" },
  { file: "assiette-pomme-entiere.png", label: "assiette qui ne cache rien", expect: "compte" },
  { file: "menu-restaurant.jpg", label: "menu de restaurant", expect: "refuse" },
  { file: "capture-app-livraison.jpg", label: "capture d'app de livraison", expect: "refuse" },
  { file: "rayon-supermarche.png", label: "rayon de supermarché", expect: "refuse" },
  { file: "selfie.png", label: "selfie", expect: "refuse" },
  { file: "paysage.png", label: "paysage", expect: "refuse" },
  { file: "etiquette-nutritionnelle.jpg", label: "étiquette nutritionnelle", expect: "refuse" },
  { file: "photo-trop-sombre.jpg", label: "photo trop sombre", expect: "refuse" },
];

async function uploadFor(
  student: { accessToken: string; userId: string; email: string; refreshToken: string },
  image: { base64: string; mime: string },
  opts: { uploadId?: string; note?: string; chatClientMessageId?: string } = {},
) {
  return await callAs(student, "meal-photo-upload-v1", {
    mime_type: image.mime,
    base64: image.base64,
    ...(opts.uploadId ? { client_upload_id: opts.uploadId } : {}),
    ...(opts.note ? { student_note: opts.note } : {}),
    ...(opts.chatClientMessageId ? { chat_client_message_id: opts.chatClientMessageId } : {}),
  });
}

async function stateOf(userId: string) {
  return await rows(
    `select coalesce(subject_kind, recognized->>'subject_kind', '?') || ' | ' ||
            coalesce(disqualified_reason,'<compté>') || ' | ' ||
            coalesce(food_group_ref,'-') || ' | ' ||
            coalesce(portion_band,'-') || ' | ' ||
            (analyzed_at is not null)::text
       from protocol_events where user_id='${userId}' order by created_at`,
  ).catch(async () =>
    await rows(
      `select coalesce(recognized->>'subject_kind','?') || ' | ' ||
              coalesce(disqualified_reason,'<compté>') || ' | ' ||
              coalesce(food_group_ref,'-') || ' | ' ||
              coalesce(portion_band,'-') || ' | ' ||
              (analyzed_at is not null)::text
         from protocol_events where user_id='${userId}' order by created_at`,
    )
  );
}

const allAcks: string[] = [];
const allQuestions: string[] = [];

// ── 1 & 2. FILTRE DE SUJET, ET STABILITÉ SUR REJEU ──────────────────────────
say(`${"█".repeat(76)}\n1 & 2 — FILTRE DE SUJET (chaque image jouée DEUX fois)\n${"█".repeat(76)}`);
for (const subject of SUBJECTS) {
  const image = await loadImage(subject.file);
  const verdicts: string[] = [];
  const acks: string[] = [];
  for (let pass = 1; pass <= 2; pass += 1) {
    const coach = await coachWithDoctrine();
    const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB" });
    await publishPlanFor(coach, student.userId, { timezone: "Europe/London" });
    const res = await uploadFor(student, image);
    const state = await stateOf(student.userId);
    verdicts.push(state.join(" ;; ") || "<aucune ligne>");
    const ack = String(res.json?.reply ?? res.json?.acknowledgement ?? res.json?.message ?? "").trim() ||
      (await rows(`select left(content, 300) from chat_messages where user_id='${student.userId}' and role='assistant' order by created_at`)).join(" | ");
    acks.push(ack);
    if (ack) allAcks.push(ack);
  }
  const stable = verdicts[0] === verdicts[1];
  say(`\n▌ ${subject.label}  (${subject.file}, ${Math.round(image.base64.length * 0.75 / 1024)} Ko)`);
  say(`  passe 1 : ${verdicts[0]}`);
  say(`  passe 2 : ${verdicts[1]}`);
  say(`  ${stable ? "✅ verdict STABLE sur rejeu" : "🔴 verdict INSTABLE entre deux runs"}`);
  say(`  accusé  : ${acks[0].slice(0, 220)}`);
  const counted = !verdicts[0].includes("<aucune ligne>") && verdicts[0].includes("<compté>");
  say(`  attendu ${subject.expect} → ${counted ? "compté" : "refusé/absent"} ${((subject.expect === "compte") === counted) ? "✅" : "🔴"}`);
}

// ── 3. L'ACCUSÉ NE PORTE JAMAIS DE CHIFFRE NUTRITIONNEL ─────────────────────
say(`\n${"█".repeat(76)}\n3 — L'ACCUSÉ: ni calorie, ni macro, ni pourcentage\n${"█".repeat(76)}`);
for (const ack of [...new Set(allAcks)]) {
  const bad = hits(ack, FORBIDDEN_IN_ACK);
  say(`  ${bad.length === 0 ? "✅" : "🔴"} ${ack.replace(/\n+/g, " ").slice(0, 180)}${bad.length ? ` → ${JSON.stringify(bad)}` : ""}`);
}

// ── 4. DÉDUP EXACTE ─────────────────────────────────────────────────────────
say(`\n${"█".repeat(76)}\n4 — DÉDUP: la MÊME photo deux fois, puis une AUTRE\n${"█".repeat(76)}`);
{
  const coach = await coachWithDoctrine();
  const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB" });
  await publishPlanFor(coach, student.userId, { timezone: "Europe/London" });
  const a = await loadImage("assiette-poulet-riz-brocolis.png");
  const b = await loadImage("assiette-saumon-sauce-luisante.png");
  const id = `qa-dedup-${Date.now()}`;
  const r1 = await uploadFor(student, a, { uploadId: id });
  const n1 = await scalar(`select count(*) from protocol_events where user_id='${student.userId}'`);
  const r2 = await uploadFor(student, a, { uploadId: id });
  const n2 = await scalar(`select count(*) from protocol_events where user_id='${student.userId}'`);
  const r3 = await uploadFor(student, b, { uploadId: `${id}-autre` });
  const n3 = await scalar(`select count(*) from protocol_events where user_id='${student.userId}'`);
  say(`  1re photo  → HTTP ${r1.status}, events=${n1}`);
  say(`  MÊME photo → HTTP ${r2.status}, events=${n2}  ${n2 === n1 ? "✅ un seul fait" : "🔴 DOUBLON"}`);
  say(`  AUTRE      → HTTP ${r3.status}, events=${n3}  ${n3 === n2 + 1 ? "✅ deux photos = deux faits" : "🔴 anti-faux-positif cassé"}`);
  say(`  réponse au rejeu : ${JSON.stringify(r2.json).slice(0, 240)}`);
}

// ── 5. ADVERSARIAL ──────────────────────────────────────────────────────────
say(`\n${"█".repeat(76)}\n5 — ADVERSARIAL\n${"█".repeat(76)}`);
{
  const coach = await coachWithDoctrine();
  const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB" });
  await publishPlanFor(coach, student.userId, { timezone: "Europe/London" });

  const notImage = await callAs(student, "meal-photo-upload-v1", {
    mime_type: "image/jpeg",
    base64: btoa("this is definitely not an image, just text pretending"),
  });
  say(`  non-image déguisée en image/jpeg → HTTP ${notImage.status} ${JSON.stringify(notImage.json).slice(0, 160)}`);

  const big = "A".repeat(12_000_001);
  const tooBig = await callAs(student, "meal-photo-upload-v1", { mime_type: "image/jpeg", base64: big });
  say(`  charge > plafond du contrat        → HTTP ${tooBig.status} ${JSON.stringify(tooBig.json).slice(0, 160)}`);

  // Sans plan publié.
  const coach2 = await coachWithDoctrine();
  const orphan = await makeStudent({ coach: coach2, timezone: "Europe/London", country: "GB", withAdoptedPlan: false });
  const a = await loadImage("assiette-poulet-riz-brocolis.png");
  const noPlan = await uploadFor(orphan, a);
  say(`  élève SANS plan publié             → HTTP ${noPlan.status} ${JSON.stringify(noPlan.json).slice(0, 200)}`);

  // Deux uploads SIMULTANÉS de la même image, même clé.
  const coach3 = await coachWithDoctrine();
  const racer = await makeStudent({ coach: coach3, timezone: "Europe/London", country: "GB" });
  await publishPlanFor(coach3, racer.userId, { timezone: "Europe/London" });
  const raceId = `qa-race-${Date.now()}`;
  const [ra, rb] = await Promise.all([
    uploadFor(racer, a, { uploadId: raceId }),
    uploadFor(racer, a, { uploadId: raceId }),
  ]);
  const raceCount = await scalar(`select count(*) from protocol_events where user_id='${racer.userId}'`);
  say(`  deux uploads SIMULTANÉS            → ${ra.status}/${rb.status}, events=${raceCount} ${raceCount <= 1 ? "✅" : "🔴"}`);
}

// ── 6. LA QUESTION DE CLARIFICATION ─────────────────────────────────────────
say(`\n${"█".repeat(76)}\n6 — QUESTION DE CLARIFICATION (jamais quantitative)\n${"█".repeat(76)}`);
{
  for (const [label, file, expectQuestion] of [
    ["assiette qui CACHE (sauce luisante)", "assiette-saumon-sauce-luisante.png", true],
    ["assiette qui ne cache RIEN (pomme)", "assiette-pomme-entiere.png", false],
  ] as const) {
    const coach = await coachWithDoctrine();
    const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB" });
    await publishPlanFor(coach, student.userId, { timezone: "Europe/London" });
    const image = await loadImage(file);
    await uploadFor(student, image, { chatClientMessageId: `qa-photo-${Date.now()}` });
    const qs = await rows(`select question from meal_precision_questions where user_id='${student.userId}'`);
    allQuestions.push(...qs);
    const msgs = await rows(`select left(content, 260) from chat_messages where user_id='${student.userId}' and role='assistant' order by created_at`);
    say(`\n▌ ${label}`);
    say(`  questions : ${JSON.stringify(qs)}`);
    say(`  messages  : ${JSON.stringify(msgs)}`);
    say(`  attendu question=${expectQuestion} → ${qs.length > 0} ${((qs.length > 0) === expectQuestion) ? "✅" : "🔴"}`);
  }
  say(`\nLIGNE ROUGE — quantité dans une question de photo :`);
  for (const q of [...new Set(allQuestions)]) {
    const bad = hits(q, QUANTITY_LEXICON);
    say(`  ${bad.length === 0 ? "✅" : "🔴"} « ${q} »${bad.length ? ` → ${JSON.stringify(bad)}` : ""}`);
  }
  if (allQuestions.length === 0) say(`  (aucune question rendue sur ce run)`);
}

await Deno.writeTextFile(new URL("./L4-meal-photo.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit");
