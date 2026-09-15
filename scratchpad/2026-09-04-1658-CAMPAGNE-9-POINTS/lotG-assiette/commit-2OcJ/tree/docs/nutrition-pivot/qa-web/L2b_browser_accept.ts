/** Prépare le geste NAVIGATEUR: un visiteur connecté + une invitation fraîche. */
import { ANON, URL_BASE, makeCoach, nonce, signUpAccount, sql } from "./harness.ts";

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
const email = `qa-join-ui-${nonce()}@test.dev`;
const res = await fetch(`${URL_BASE}/functions/v1/coach-invite-student-v1`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${coach.accessToken}`,
    "x-internal-secret": (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim(),
  },
  body: JSON.stringify({ email, coach_user_id: coach.userId }),
});
const json = await res.json();
const token = new URL(json.join_url).searchParams.get("token")!;

const visitor = await signUpAccount("qa-join-ui-visitor");
const session = {
  access_token: visitor.accessToken,
  refresh_token: visitor.refreshToken,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3400,
  user: { id: visitor.userId, aud: "authenticated", role: "authenticated", email: visitor.email },
};
console.log("VISITOR_ID=" + visitor.userId);
console.log("TOKEN=" + token);
console.log("PROFIL_AVANT=" + (await sql(
  `select coalesce(keel_role,'<null>')||' | '||coalesce(country,'<null>')||' | '||coalesce(timezone,'<null>')||' | '||coalesce(locale,'<null>') as v from profiles where id='${visitor.userId}'`,
)).split("\n")[1]);
console.log("LOCALSTORAGE=" + JSON.stringify(JSON.stringify(session)));
