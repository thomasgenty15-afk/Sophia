// Sonde d'INTÉGRATION (pas un run conversationnel): le compteur exclut-il
// vraiment le genre, contre la VRAIE base ? C'est la moitié du changement qui
// ne peut pas se prouver en pur.
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import {
  countDailyAsks,
  countDailyAsksOfKind,
  PHOTO_INVITATION_DAILY_CAP,
} from "../supabase/functions/_shared/keel/daily_ask_budget.ts";

const db = admin();
const u = Deno.args[0];
const today = new Date().toISOString().slice(0, 10);

// Une invitation photo s'ajoute au ledger, à côté de la question de divergence.
const ins = await db.from("meal_precision_questions").insert({
  user_id: u,
  local_date: today,
  source: "chat",
  axis: null,
  question: "si tu as une photo, envoie-la",
  asked_for_message_id: `probe-${today}`,
  ask_kind: "photo_invitation",
} as never);
if (ins.error) throw new Error(`insert: ${ins.error.message}`);

const { data: rows, error } = await db
  .from("meal_precision_questions")
  .select("ask_kind").eq("user_id", u).eq("local_date", today);
if (error) throw new Error(`relecture: ${error.message}`);
console.log("LEDGER   :", (rows ?? []).map((r) => r.ask_kind).join(" + "));

const shared = await countDailyAsks(db, { userId: u, localDate: today });
const photo = await countDailyAsksOfKind(db, {
  userId: u, localDate: today, kind: "photo_invitation",
  capOnFailure: PHOTO_INVITATION_DAILY_CAP,
});
console.log("PARTAGE  :", JSON.stringify(shared), "<- doit valoir 1 (la divergence seule)");
console.log("PHOTO    :", JSON.stringify(photo), "<- doit valoir 1 (son plafond propre)");
console.log(shared.count === 1 && photo.count === 1 ? "✅ EXCLUSION REELLE" : "❌ ECHEC");
