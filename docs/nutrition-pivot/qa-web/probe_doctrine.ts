/** Sonde: que charge RÉELLEMENT le loader de doctrine pour un élève donné ? */
import { admin } from "./harness.ts";
import { doctrineBlockFor, loadPublishedDoctrine } from "../../../supabase/functions/_shared/keel/doctrine_loader.ts";
const studentId = Deno.args[0];
const loaded = await loadPublishedDoctrine(admin(), studentId);
console.log("reason:", loaded.reason, "| coachId:", loaded.coachId, "| issues:", JSON.stringify(loaded.issues));
console.log("compiled.isEmpty:", loaded.compiled?.isEmpty);
console.log("---- BLOC INJECTÉ ----");
console.log(doctrineBlockFor(loaded).slice(0, 1500));
