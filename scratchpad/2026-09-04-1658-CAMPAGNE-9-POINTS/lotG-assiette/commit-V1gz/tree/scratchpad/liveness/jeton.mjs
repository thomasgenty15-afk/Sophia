// AUDIT DE LIVENESS · fabrique un JWT élève HS256 pour le runtime local.
//
// ── POURQUOI ÇA EXISTE ─────────────────────────────────────────────────────
// GoTrue local signe désormais en **ES256** (`GOTRUE_JWT_KEYS`, un `kid` dans
// l'en-tête). Le runtime edge, lui, vérifie en HS256 avec le secret de démo:
// tout jeton obtenu par `auth/v1/token?grant_type=password` est donc rejeté
// avec `{"msg":"Invalid JWT"}` AVANT d'atteindre la fonction.
//
// Conséquence à signaler: les scripts QA du dépôt qui passent par
// `grant_type=password` (scripts/qa_*.mjs, run_memory_v2_*.mjs) sont cassés en
// local pour la même raison. Ce n'est pas un défaut de ce qui a été livré.
//
// Le secret est la valeur PUBLIQUE et documentée du Supabase local
// (`super-secret-jwt-token-with-at-least-32-characters-long`). Rien de sensible
// ici; en distant, ce fichier ne sert à rien.
import { createHmac } from "node:crypto";

const SECRET = process.env.LOCAL_JWT_SECRET ??
  "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o) =>
  Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
    .toString("base64url");

const sub = process.argv[2];
if (!sub) {
  console.error("usage: node jeton.mjs <user_uuid> [email]");
  process.exit(1);
}
const now = Math.floor(Date.parse("2026-08-11T10:00:00Z") / 1000);
const payload = {
  aud: "authenticated",
  role: "authenticated",
  sub,
  email: process.argv[3] ?? "",
  iss: "http://127.0.0.1:54321/auth/v1",
  iat: now,
  exp: now + 6 * 3600,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  session_id: "00000000-0000-4000-8000-000000000001",
};
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64(payload);
const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
console.log(`${head}.${body}.${sig}`);
