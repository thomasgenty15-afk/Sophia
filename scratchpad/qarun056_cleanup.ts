/**
 * Nettoyage de fin de run `ff056-boutons-run1` — autorisation explicite du cadre
 * QA (`14-qa-test-guidelines.md`). Vise les trois personas jetables du run,
 * NOMMÉES ici plutôt que lues dans un fichier: le fichier de personas a été
 * écrasé entre l'essai d'outillage et le run propre, et une liste implicite
 * aurait laissé la première derrière elle.
 */
import { admin, cleanup } from "../docs/nutrition-pivot/qa-web/harness.ts";

const db = admin();
const USERS = [
  // ── run 1 ──────────────────────────────────────────────────────────────────
  "814bb5a0-734f-4863-884f-53e6f4fe5ef5", // essai d'outillage, écarté du run
  "a5fef211-fbc6-49e0-86e6-d2fa32b5d8bf", // trajectoire 1.1, voie boutons
  "068d7435-0cb5-4875-b4cf-50d1f2754f3f", // trajectoires 1.2 et 1.3, voie texte
  // ── run 2, vérification du correctif ───────────────────────────────────────
  "4a86e152-bf24-451b-aed2-483a44b65966", // 2.1 créneau unspecified, FR
  "4518359b-65e6-483c-b8b4-30554aa9dd5c", // 2.2 activity_drop, FR
  "a0af0b63-09b7-4df1-8d1b-735aae2999bb", // 2.3 créneau night, EN
  "8c762565-8a6c-4d8b-8658-38e9c4e68d3f", // 2.4 texte libre, LE TOUR ROUGE
  "6561d95b-0751-405e-ac19-89bcbeb2e8ca", // 2.5 texte, échantillon 1
  "367fc5b0-6786-4e0c-9c08-649fd83426cc", // 2.5 texte, échantillon 2
  "335185ca-d292-4695-b539-8040bae88d12", // 2.5 texte, échantillon 3
];
const TABLES = [
  "student_weight_divergence_episodes",
  "student_daily_recommendations",
  "student_body_measures",
  "student_generated_meals",
  "student_goals",
  "meal_precision_questions",
];

for (const u of USERS) {
  for (const t of TABLES) {
    const r = await db.from(t).delete().eq("user_id", u);
    if (r.error) console.warn(`${t} (${u}): ${r.error.message}`);
  }
  await cleanup(u);
  await db.auth.admin.deleteUser(u).catch(() => {});
  console.log(`nettoyée: ${u}`);
}

// Preuve d'absence, pas promesse d'absence.
for (const u of USERS) {
  const { count, error } = await db
    .from("student_weight_divergence_episodes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", u);
  if (error) console.warn(`vérif ${u}: ERREUR ${error.message}`);
  else console.log(`reste pour ${u}: ${count} épisode(s)`);
}
