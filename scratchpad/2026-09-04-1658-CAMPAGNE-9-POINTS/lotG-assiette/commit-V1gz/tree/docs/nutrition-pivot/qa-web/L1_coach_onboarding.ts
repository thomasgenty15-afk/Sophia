/**
 * L1 — ONBOARDING COACH, de zéro à un élève invité.
 *
 * Chaque étape tape la VRAIE fonction. Aucun verdict n'est rendu sur une
 * réponse HTTP seule: on relit la base après chaque geste.
 */
import { admin, callAs, makeCoach, signUpAccount, sql } from "./harness.ts";

const out: string[] = [];
function say(s: string) {
  console.log(s);
  out.push(s);
}

// ── 1. LE COACH SE CRÉE ──────────────────────────────────────────────────────
const coach = await makeCoach({ displayName: "Dr QA Marlow", country: "GB" });
say(`[1] coach créé: ${coach.email} coach_id=${coach.coachId}`);

const prof = await admin().from("profiles").select("keel_role,locale,country")
  .eq("id", coach.userId).maybeSingle();
say(`[1] profils: ${JSON.stringify(prof.data)}`);

// Idempotence: un second appel ne crée pas un second coach.
const again = await callAs(coach, "coach-signup-v1", {
  display_name: "Dr QA Marlow",
  country: "GB",
});
say(`[1b] rappel idempotent → ${again.status} même id=${again.json?.coach?.id === coach.coachId}`);
say(`[1b] lignes coaches pour ce user: ${await sql(
  `select count(*) from coaches where user_id='${coach.userId}'`,
)}`);

// Contre-factuel: un pays mal formé DOIT être refusé, pas silencieusement nul.
const badCountry = await signUpAccount("qa-coach-bad");
const bad = await callAs(badCountry, "coach-signup-v1", {
  display_name: "Bad",
  country: "United Kingdom",
});
say(`[1c] contre-factuel pays invalide → ${bad.status} ${JSON.stringify(bad.json?.error ?? bad.json)}`);
say(`[1c] country en base après refus: ${await sql(
  `select coalesce(country,'<null>') from profiles where id='${badCountry.userId}'`,
)}`);

// Contre-factuel: un ÉLÈVE ne doit pas pouvoir se promouvoir coach.
const studentAcct = await signUpAccount("qa-promote");
await admin().from("profiles").update({ keel_role: "student" } as never).eq(
  "id",
  studentAcct.userId,
);
const promote = await callAs(studentAcct, "coach-signup-v1", {
  display_name: "Sneaky",
  country: "FR",
});
say(`[1d] contre-factuel élève→coach → ${promote.status} ${JSON.stringify(promote.json?.error ?? promote.json)}`);

// ── 2. LA DOCTRINE ───────────────────────────────────────────────────────────
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
  foods: {
    recommended: ["eggs", "lentils", "olive oil"],
    discouraged: ["sugary drinks"],
  },
};

const doctrineRes = await callAs(coach, "coach-doctrine-v1", {
  action: "save",
  doctrine: DOCTRINE,
  content_locale: "en",
});
say(`[2] coach-doctrine-v1 save → ${doctrineRes.status} ${JSON.stringify(doctrineRes.json).slice(0, 400)}`);
const savedVersion = doctrineRes.json?.saved?.version ?? 1;
say(`[2] en base: ${await sql(
  `select version, jsonb_array_length(beliefs) as beliefs, jsonb_array_length(forbidden) as forbidden, coalesce(published_at::text,'<null>') as published, compiled_prompt is not null as has_prompt from coach_doctrines where coach_id='${coach.coachId}' order by version`,
)}`);

// PUBLIER: sans ça, la doctrine n'est qu'un brouillon.
const pub = await callAs(coach, "coach-doctrine-v1", {
  action: "publish",
  version: savedVersion,
});
say(`[2b] publish v${savedVersion} → ${pub.status} ${JSON.stringify(pub.json).slice(0, 300)}`);
say(`[2b] publiée en base: ${await sql(
  `select version, published_at is not null as published from coach_doctrines where coach_id='${coach.coachId}' order by version`,
)}`);

// Contre-factuel: publier une version qui n'existe pas.
const badPub = await callAs(coach, "coach-doctrine-v1", { action: "publish", version: 99 });
say(`[2c] contre-factuel publish v99 → ${badPub.status} ${JSON.stringify(badPub.json).slice(0, 200)}`);

// ── 3. LE PROTOCOLE ──────────────────────────────────────────────────────────
const tpl = await callAs(coach, "plan-template-v1", { action: "list" });
say(`[3] plan-template-v1 list → ${tpl.status} ${JSON.stringify(tpl.json).slice(0, 800)}`);

// ── 4. L'INVITATION ──────────────────────────────────────────────────────────
const inviteEmail = `qa-invitee-${Date.now()}@test.dev`;
const inv = await callAs(coach, "coach-invite-student-v1", { email: inviteEmail });
say(`[4] coach-invite-student-v1 → ${inv.status} ${JSON.stringify(inv.json).slice(0, 500)}`);
say(`[4] coach_invitations: ${await sql(
  `select status, email, expires_at is not null as has_expiry from coach_invitations where coach_id='${coach.coachId}'`,
)}`);

// Deux invitations au même email.
const inv2 = await callAs(coach, "coach-invite-student-v1", { email: inviteEmail });
say(`[4b] double invitation → ${inv2.status} ${JSON.stringify(inv2.json).slice(0, 300)}`);
say(`[4b] lignes: ${await sql(
  `select count(*) from coach_invitations where coach_id='${coach.coachId}' and lower(email)=lower('${inviteEmail}')`,
)}`);

console.log("\n=== CONTEXTE ===");
console.log(JSON.stringify({ coachId: coach.coachId, coachUser: coach.userId, coachEmail: coach.email, inviteEmail }));

await Deno.writeTextFile(
  new URL("./L1-run.txt", import.meta.url),
  out.join("\n") + "\n",
);
