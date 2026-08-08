/**
 * L1 — purge des fixtures du lot. Scopée aux comptes `l1_*` et à LEURS coachs.
 * Ne touche à rien d'autre: un autre agent travaille sur la même base.
 */
import { admin, cleanup } from "../docs/nutrition-pivot/qa-web/harness.ts";

const db = admin();
const { data: students } = await db.from("profiles").select("id,full_name")
  .like("full_name", "l1\\_%");
const studentIds = (students ?? []).map((r: any) => r.id as string);
console.log(`élèves l1_: ${studentIds.length}`);

const { data: links } = await db.from("coach_clients").select("coach_id")
  .in("student_user_id", studentIds);
const coachIds = [...new Set((links ?? []).map((r: any) => r.coach_id as string))];
const { data: coaches } = await db.from("coaches").select("id,user_id")
  .in("id", coachIds);
const coachUserIds = (coaches ?? []).map((r: any) => r.user_id as string);
console.log(`coachs porteurs: ${coachUserIds.length}`);

for (const id of [...studentIds, ...coachUserIds]) {
  try {
    await cleanup(id);
  } catch (e) {
    console.log(`!! ${id}: ${e instanceof Error ? e.message : e}`);
  }
}

const { data: left } = await db.from("profiles").select("id")
  .like("full_name", "l1\\_%");
console.log(`restant après purge: ${(left ?? []).length}`);
