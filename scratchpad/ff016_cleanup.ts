/**
 * FF-016 — NETTOYAGE. Efface les élèves `ff016 *`, leurs coachs (ceux dont ils
 * sont les seuls clients) et tout ce qui pend dessus.
 *
 * `keep` (argument optionnel, liste d'UUID séparés par des virgules) préserve
 * une fixture en cours d'utilisation.
 */
import { admin, cleanup } from "../docs/nutrition-pivot/qa-web/harness.ts";

const keep = new Set((Deno.args[0] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const db = admin();

const { data } = await db.from("profiles").select("id, full_name").like(
  "full_name",
  "ff016 %",
);
const rows = (data ?? []) as Array<{ id: string; full_name: string }>;

const coachIds = new Set<string>();
for (const row of rows) {
  if (keep.has(row.id)) {
    console.log(`garde  ${row.full_name} ${row.id}`);
    continue;
  }
  const { data: links } = await db.from("coach_clients").select("coach_id").eq(
    "student_user_id",
    row.id,
  );
  for (const l of (links ?? []) as Array<{ coach_id: string }>) coachIds.add(l.coach_id);
  await db.from("contract_change_requests").delete().eq("user_id", row.id);
  await db.from("commitment_evaluations").delete().eq("user_id", row.id);
  await db.from("student_generated_meals").delete().eq("user_id", row.id);
  const { data: hm } = await db.from("household_members").select("household_id")
    .eq("user_id", row.id);
  for (const h of (hm ?? []) as Array<{ household_id: string }>) {
    await db.from("household_food_restrictions").delete().eq(
      "household_id",
      h.household_id,
    );
    await db.from("student_generated_meals").delete().eq(
      "household_id",
      h.household_id,
    );
    await db.from("household_members").delete().eq("household_id", h.household_id);
    await db.from("households").delete().eq("id", h.household_id);
  }
  await db.from("student_goals").delete().eq("user_id", row.id);
  await db.from("plan_commitments").delete().eq("user_id", row.id);
  await db.from("plan_versions").delete().eq("student_id", row.id);
  await db.from("turn_summary_logs").delete().eq("user_id", row.id);
  await db.from("conversation_turn_traces").delete().eq("user_id", row.id);
  await db.from("user_chat_states").delete().eq("user_id", row.id);
  await cleanup(row.id);
  console.log(`efface ${row.full_name} ${row.id}`);
}

for (const coachId of coachIds) {
  const { data: rest } = await db.from("coach_clients").select("student_user_id").eq(
    "coach_id",
    coachId,
  );
  if (((rest ?? []) as unknown[]).length > 0) {
    console.log(`coach ${coachId} garde des élèves — non effacé`);
    continue;
  }
  const { data: coachRow } = await db.from("coaches").select("user_id").eq("id", coachId)
    .maybeSingle();
  await db.from("coach_food_rules").delete().eq("coach_id", coachId);
  await db.from("coach_timing_rules").delete().eq("coach_id", coachId);
  await db.from("coach_terms").delete().eq("coach_id", coachId);
  await db.from("coach_protocols").delete().eq("coach_id", coachId);
  await db.from("coach_doctrines").delete().eq("coach_id", coachId);
  await db.from("coaches").delete().eq("id", coachId);
  const ownerId = (coachRow as { user_id?: string } | null)?.user_id;
  if (ownerId) await db.auth.admin.deleteUser(ownerId).catch(() => {});
  console.log(`efface coach ${coachId}`);
}
