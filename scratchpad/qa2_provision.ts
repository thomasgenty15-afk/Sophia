/**
 * Provisionne UNE persona jetable conforme au cadre QA
 * (`docs/agent-playbook/New/test-material/14-qa-test-guidelines.md`) :
 * marqueur `is_test_persona`, mot de passe local `1234567`, connexion
 * temporaire dédiée au run (pas de persona nommée : évite l'incident
 * « contenus hors-persona » du 12/07).
 *
 * Usage: deno run -A qa2_provision.ts <trajectoire> [locale] [country] [tz]
 */
import {
  admin,
  makeCoach,
  makeStudent,
  publishPlanFor,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const label = Deno.args[0] ?? "traj";
const locale = Deno.args[1] ?? "fr-FR";
const country = Deno.args[2] ?? "FR";
const tz = Deno.args[3] ?? "Europe/Paris";

const coach = await makeCoach({ displayName: `QA2 ${label}`, country });
const student = await makeStudent({ coach, locale, country, timezone: tz });
await publishPlanFor(coach, student.userId, { timezone: tz, contentLocale: locale });

// Le marqueur exigé par `test-send-message` (403 sans lui).
const { error } = await admin().auth.admin.updateUserById(student.userId, {
  user_metadata: { is_test_persona: true },
});
if (error) throw new Error(`marqueur is_test_persona: ${error.message}`);

// Re-login pour que le JWT porte le marqueur fraîchement posé.
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const res = await fetch(
  `${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ email: student.email, password: "1234567" }),
  },
);
const tok = await res.json();
if (!tok.access_token) throw new Error(`login: ${JSON.stringify(tok)}`);

// Vérification séparée exigée par le cadre : le token est-il accepté par Auth ?
const check = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
  headers: { apikey: anon, Authorization: `Bearer ${tok.access_token}` },
});

console.log(JSON.stringify({
  trajectoire: label,
  user_id: student.userId,
  email: student.email,
  locale,
  country,
  timezone: tz,
  auth_user_check: check.status,
  access_token: tok.access_token,
}));
