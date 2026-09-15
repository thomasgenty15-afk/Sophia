/**
 * Crée un élève KEEL jetable sur la stack LOCALE et rend sa session.
 *
 * ── POURQUOI CE SCRIPT EXISTE ────────────────────────────────────────────────
 * Pour jouer le parcours de la bulle au navigateur, il faut une session. Deux
 * façons de l'obtenir :
 *   - taper un mot de passe dans le formulaire (ce que fait un humain) ;
 *   - poser le jeton d'un compte jetable qu'on vient de créer par l'API.
 * Ce script fait la seconde. Il ne touche AUCUN compte réel et ne fonctionne
 * que sur `127.0.0.1`.
 *
 * ── POURQUOI `signUp` ET PAS `auth.admin.createUser` ─────────────────────────
 * L'API admin d'auth rend « invalid JWT: signing method HS256 is invalid » de
 * façon intermittente sur la stack locale (mesuré : 2 succès sur 8 appels au
 * même run). `signUp` marche partout.
 *
 * USAGE:
 *   deno run --allow-all scripts/dev_make_chat_student.ts
 *
 * Puis, dans la console du navigateur sur http://localhost:<port> :
 *   localStorage.setItem('sb-127-auth-token', '<le JSON rendu>')
 * et recharge `/app/chat`.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321")
  .replace(/\/+$/, "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_BASE)) {
  console.error(`Refus: ce script ne vise que la stack locale (reçu ${URL_BASE}).`);
  Deno.exit(1);
}

const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!ANON || !SERVICE) {
  console.error(
    "Manque SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Récupère-les avec `npx supabase status` (les clés `sb_publishable_…` / " +
      "`sb_secret_…`, pas les JWT de supabase/.env).",
  );
  Deno.exit(1);
}

const anon = createClient(URL_BASE, ANON, { auth: { persistSession: false } });
const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
const email = `dev-chat-${nonce}@test.dev`;
const { data, error } = await anon.auth.signUp({ email, password: "1234567" });
if (error || !data.user || !data.session) {
  console.error(`signUp a échoué: ${error?.message ?? "pas de session"}`);
  Deno.exit(1);
}
const userId = data.user.id;

const { error: profileError } = await admin.from("profiles").update({
  keel_role: "student",
  full_name: "Dev Student",
  timezone: "Europe/Paris",
  country: "GB",
} as never).eq("id", userId);
if (profileError) {
  console.error(`profil: ${profileError.message}`);
  Deno.exit(1);
}

// Un plan de semaine ADOPTÉ: sans lui, le tap du soir écarte l'élève en
// `no_active_plan` et la démo du proactif ne montre rien.
const { error: planError } = await admin.from("student_week_plans").insert({
  user_id: userId,
  week_start: new Date().toISOString().slice(0, 10),
  status: "adopted",
  adopted_at: new Date().toISOString(),
  items: [],
  content_locale: "en-GB",
} as never);
if (planError) console.warn(`[warn] plan de semaine: ${planError.message}`);

const session = {
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
  token_type: "bearer",
  expires_in: data.session.expires_in ?? 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3400,
  user: {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
  },
};

console.log(`\nÉlève créé: ${email}\nuser_id: ${userId}\n`);
console.log("Colle ceci dans la console du navigateur, puis va sur /app/chat :\n");
console.log(
  `localStorage.setItem('sb-127-auth-token', ${JSON.stringify(JSON.stringify(session))});`,
);
