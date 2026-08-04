/**
 * L1-bis — LA DOCTRINE ARRIVE-T-ELLE DANS LE PROMPT D'UN TOUR D'ÉLÈVE ?
 *
 * Le prompt de mission est explicite: « il écrit sa doctrine et elle ARRIVE
 * DANS LE PROMPT (pas seulement en base — vérifie qu'un tour d'élève la
 * porte) ». Une ligne dans `coach_doctrines` ne prouve rien; ce qui prouve,
 * c'est le texte que l'élève reçoit et la trace du prompt réellement envoyé.
 *
 * Le coach de ce scénario INTERDIT le jeûne intermittent. L'élève le demande.
 */
import { admin, makeCoach, makeStudent, sql, turn } from "./harness.ts";

const coach = await makeCoach({ displayName: "Dr QA Marlow", country: "GB" });

const DOCTRINE = {
  beliefs: [
    "Protein at every meal is the backbone of the method.",
    "Vegetables are the volume of the plate, never the garnish.",
  ],
  forbidden: [
    "Never recommend counting calories or weighing food.",
    "Never suggest intermittent fasting or skipping breakfast.",
  ],
  vocabulary: ["anchor meal", "the plate rule"],
  arbitrations: [
    {
      question: "Can I do intermittent fasting?",
      answer:
        "Not on this method. We anchor the day with breakfast; fasting fights the structure we are building.",
    },
  ],
  voice: { tone: "Direct, warm, never preachy." },
  foods: { recommended: ["eggs", "lentils", "olive oil"], discouraged: ["sugary drinks"] },
};

const db = admin();
const { data: saved, error } = await db.from("coach_doctrines").insert({
  coach_id: coach.coachId,
  version: 1,
  ...DOCTRINE,
  content_locale: "en",
  published_at: new Date().toISOString(),
  published_by: coach.userId,
} as never).select("id,version").maybeSingle();
if (error) throw error;
console.log(`doctrine publiée: ${JSON.stringify(saved)} coach=${coach.coachId}`);

const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB" });
console.log(`élève: ${student.userId}`);

const t = await turn(student, "Can I do intermittent fasting? I want to skip breakfast.");
console.log(`\nHTTP ${t.status}`);
console.log(`RÉPONSE VISIBLE:\n${t.reply}\n`);

// Ce que le modèle a réellement produit, avant toute ceinture de rendu:
// c'est là que se voit un texte honnête détruit par un verrou (AGENT-16 P0-4).
const raw = await sql(
  `select source, outcome, left(replace(coalesce(output_text,''), E'\\n', ' '), 220) as output
     from llm_raw_response_events where user_id='${student.userId}'
     order by created_at desc limit 6`,
).catch((e) => `<${e.message}>`);
console.log(`llm_raw_response_events:\n${raw}`);

// Effets durables du tour: une question doctrinale ne doit RIEN écrire.
console.log(`\nprotocol_events: ${await sql(
  `select count(*) from protocol_events where user_id='${student.userId}'`,
)}`);

console.log("\n=== CONTEXTE ===");
console.log(JSON.stringify({ coachId: coach.coachId, coachUser: coach.userId, studentId: student.userId }));
