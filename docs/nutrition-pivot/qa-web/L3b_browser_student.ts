/** Un élève KEEL prêt pour le navigateur: coach + doctrine + plan adopté. */
import { admin, makeCoach, makeStudent } from "./harness.ts";

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
await admin().from("coach_doctrines").insert({
  coach_id: coach.coachId,
  version: 1,
  beliefs: [{ claim: "Every meal is built on a protein anchor.", rationale: null }],
  forbidden: [{
    token: "count_calories",
    surface_forms: ["count calories", "counting calories"],
    reason: "numbers turn food into a score",
    instead: "We build the plate: a protein anchor, vegetables for volume.",
  }],
  vocabulary: [{ term: "the plate rule", meaning: "half vegetables, a quarter protein, a quarter starch" }],
  arbitrations: [],
  voice: { tone: "Direct, warm." },
  foods: { recommended: [{ term: "eggs", reason: null }], discouraged: [] },
  content_locale: "en",
  published_at: new Date().toISOString(),
  published_by: coach.userId,
} as never);

const student = await makeStudent({ coach, timezone: "Europe/Paris", country: "GB", fullName: "Sam" });
const session = {
  access_token: student.accessToken,
  refresh_token: student.refreshToken,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3400,
  user: { id: student.userId, aud: "authenticated", role: "authenticated", email: student.email },
};
console.log("COACH_ID=" + coach.coachId);
console.log("COACH_USER=" + coach.userId);
console.log("STUDENT_ID=" + student.userId);
console.log("LOCALSTORAGE=" + JSON.stringify(JSON.stringify(session)));
