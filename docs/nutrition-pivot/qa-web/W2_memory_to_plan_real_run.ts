// RUN RÉEL du pont mémoire → génération de plan, contre la base LOCALE.
//
// Ce que ce script prouve, et qu'aucun test unitaire ne peut voir:
//   1. la requête PostgREST de l'ÉCRAN (`.overlaps`, opérateur `ov`) ramène
//      bien les contraintes de vie — `.contains` sur une liste de cinq clés
//      aurait exigé qu'un souvenir les porte TOUTES, c'est-à-dire aucun, et
//      aurait VIDÉ la carte au lieu de l'élargir;
//   2. `proposeFoodPreferences` les propose sur les vrais souvenirs;
//   3. une fois gardée, la ligne traverse `practical_constraints` et ressort
//      DANS LE TEXTE du prompt que `generate-meal-v1` envoie au modèle.
//
// N'ÉCRIT RIEN EN BASE: la décision « keep » est appliquée en mémoire par la
// fonction pure. Le run est donc rejouable sans nettoyage.

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  applyFoodPreferenceDecision,
  constraintsForPrompt,
  foodPreferencesForPrompt,
  type MemoryItemForPromotion,
  PROMOTABLE_DOMAIN_KEYS,
  proposeFoodPreferences,
} from "../../../supabase/functions/_shared/keel/food_preference_promotion.ts";
import { buildMealPrompt } from "../../../supabase/functions/_shared/keel/meal_generation.ts";

const USER = Deno.args[0] ?? "cc181fd0-d78e-9f6e-1548-8e00b87976e4";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const COLUMNS =
  "id, kind, status, content_text, normalized_summary, domain_keys, confidence, " +
  "sensitivity_level, superseded_by_item_id, created_at";

console.log("=== 1. LA REQUÊTE DE L'ÉCRAN, TELLE QUELLE (opérateur ov) ===");
const { data, error } = await admin
  .from("memory_items")
  .select(COLUMNS)
  .eq("user_id", USER)
  .eq("sensitivity_level", "normal")
  .in("status", ["active", "candidate"])
  .overlaps("domain_keys", PROMOTABLE_DOMAIN_KEYS)
  .order("created_at", { ascending: false })
  .limit(50);
if (error) throw new Error(`overlaps a échoué: ${error.message}`);
const rows = (data ?? []) as MemoryItemForPromotion[];
console.log(`souvenirs ramenés: ${rows.length}`);
for (const row of rows) {
  const text = String(row.normalized_summary ?? row.content_text ?? "").slice(0, 70);
  console.log(`  · [${(row.domain_keys ?? []).join(",")}] ${text}`);
}

// LA COMPARAISON QUI COMPTE: ce que l'ancienne requête aurait ramené.
const { data: oldData } = await admin
  .from("memory_items")
  .select("id")
  .eq("user_id", USER)
  .eq("sensitivity_level", "normal")
  .in("status", ["active", "candidate"])
  .contains("domain_keys", ["sante.alimentation"])
  .limit(50);
console.log(`avant l'élargissement: ${((oldData ?? []) as unknown[]).length} souvenir(s)`);

// ── LE MÊME APPEL, MAIS SOUS LE JWT DE L'ÉLÈVE ────────────────────────────
// `service_role` CONTOURNE la RLS: le pas 1 prouve que l'opérateur `ov`
// fonctionne, pas que l'écran de l'élève y a droit. La policy est
// `auth.uid() = user_id`, donc un appel service_role ne l'exécute même pas —
// c'est la cicatrice `auth-uid-null-under-service-role`, dans l'autre sens.
// Ce pas-ci emprunte le chemin exact du navigateur: clé anon + session élève.
const STUDENT_PASSWORD = Deno.env.get("QA_STUDENT_PASSWORD") ?? "1234567";
const STUDENT_EMAIL = Deno.env.get("QA_STUDENT_EMAIL") ?? "";
if (Deno.env.get("SUPABASE_ANON_KEY") && STUDENT_EMAIL) {
  console.log("\n=== 1bis. LE MÊME APPEL SOUS RLS, AVEC LE JWT DE L'ÉLÈVE ===");
  const asStudent = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: auth, error: authError } = await asStudent.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
  });
  if (authError) {
    console.log("  connexion refusée:", authError.message);
  } else {
    const res = await asStudent
      .from("memory_items")
      .select("id, domain_keys")
      .eq("user_id", auth.user!.id)
      .eq("sensitivity_level", "normal")
      .in("status", ["active", "candidate"])
      .overlaps("domain_keys", PROMOTABLE_DOMAIN_KEYS)
      .limit(50);
    if (res.error) throw new Error(`ov sous RLS a échoué: ${res.error.message}`);
    console.log(`  souvenirs visibles à l'élève: ${(res.data ?? []).length}`);
    const leak = await asStudent
      .from("memory_items").select("id").neq("user_id", auth.user!.id).limit(1);
    console.log(
      `  fuite cross-élève: ${((leak.data ?? []) as unknown[]).length === 0 ? "aucune" : "❌ FUITE"}`,
    );
  }
}

console.log("\n=== 2. CE QUE LA CARTE PROPOSE ===");
const proposals = proposeFoodPreferences({ items: rows });
for (const p of proposals) console.log(`  · ${p.seenAt ?? "?"} — ${p.text}`);
if (proposals.length === 0) {
  console.log("  (aucune — le run ne prouve rien plus loin)");
  Deno.exit(1);
}

console.log("\n=== 3. L'ÉLÈVE GARDE LA CONTRAINTE DE VIE ===");
const { data: goalRow } = await admin
  .from("student_goals")
  .select("goal, situation, practical_constraints")
  .eq("user_id", USER)
  .maybeSingle();
const before = ((goalRow ?? {}) as Record<string, unknown>).practical_constraints ??
  {};
let constraints = before as Record<string, unknown>;
for (const p of proposals) {
  constraints = applyFoodPreferenceDecision(constraints, {
    kind: "keep",
    text: p.text,
    memoryItemId: p.memoryItemId,
    seenAt: p.seenAt,
  });
}
console.log("food_preferences:", JSON.stringify(constraints.food_preferences));

console.log("\n=== 4. CE QUE LE MODÈLE VOIT ===");
console.log("vue datée:", JSON.stringify(foodPreferencesForPrompt(constraints), null, 2));
const forPrompt = constraintsForPrompt(constraints);
console.log(
  "clés servies au modèle:",
  Object.keys(forPrompt).join(", ") || "(aucune)",
);
for (const banned of ["food_preferences_origin", "food_preferences_dismissed"]) {
  if (banned in forPrompt) throw new Error(`FUITE: ${banned} servi au modèle`);
}
console.log("origin/dismissed retenus côté serveur: OK");

console.log("\n=== 5. LE PROMPT RÉEL DE generate-meal-v1 ===");
const { systemPrompt, userMessage } = buildMealPrompt({
  doctrineBlock: "== THE COACH'S METHOD ==",
  coachNoteBlock: "",
  protocolBlock: "",
  beliefKeys: [],
  goal: String((goalRow as Record<string, unknown> | null)?.goal ?? "health"),
  situation: (goalRow as Record<string, unknown> | null)?.situation
    ? String((goalRow as Record<string, unknown>).situation)
    : null,
  context: null,
  mode: "to_shop",
  scope: "day",
  slot: null,
  servings: 1,
  pantry: [],
  foodPreferences: foodPreferencesForPrompt(constraints),
});

// LES DEUX MOITIÉS DU PROMPT. `buildMealPrompt` range les préférences dans le
// message UTILISATEUR (le portrait de l'élève), pas dans le prompt système (les
// règles de composition) — vérifier le seul `systemPrompt` rendait un ❌ sur une
// chaîne parfaitement présente, et c'est la sonde qui avait tort.
const wholePrompt = `${systemPrompt}\n${userMessage}`;
for (const p of proposals) {
  const present = wholePrompt.includes(p.text);
  const half = systemPrompt.includes(p.text) ? "system" : "user";
  console.log(
    `  ${present ? "✅" : "❌"} « ${p.text.slice(0, 60)} » — moitié: ${present ? half : "aucune"}`,
  );
  if (!present) throw new Error("la contrainte gardée n'atteint PAS le prompt");
}

const at = wholePrompt.indexOf(proposals[0].text);
console.log("\n--- extrait du prompt ---");
console.log(wholePrompt.slice(Math.max(0, at - 340), at + 240));
