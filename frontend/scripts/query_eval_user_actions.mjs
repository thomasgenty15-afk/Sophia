import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";

function getLocalSupabaseStatus() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const raw = execSync("npx --yes supabase@latest status --output json", { encoding: "utf8", cwd: repoRoot });
  return JSON.parse(raw);
}

function signJwtHs256({ secret, payload }) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const toSign = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac("sha256", secret).update(toSign).digest("base64url");
  return `${toSign}.${sig}`;
}

function parseArgs(argv) {
  const out = { userId: null, title: null, limit: 20 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--title") out.title = String(argv[++i] ?? "").trim() || null;
    else if (a === "--limit") out.limit = Math.max(1, Math.min(200, Number(argv[++i] ?? "20") || 20));
  }
  if (!out.userId && !out.title) throw new Error("Missing --user-id or --title");
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const st = getLocalSupabaseStatus();
  const url = st.API_URL;
  const jwtSecret = String(st.JWT_SECRET ?? "").trim();
  if (!url || !jwtSecret) throw new Error("Missing API_URL or JWT_SECRET in supabase status");

  // Mint HS256 service role token (local)
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;
  const iss = "supabase-demo";
  const serviceKey = signJwtHs256({ secret: jwtSecret, payload: { iss, role: "service_role", exp } });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let q = admin
    .from("user_actions")
    .select("id,user_id,title,description,status,tracking_type,time_of_day,target_reps,current_reps,created_at,plan_id,submission_id")
    .order("created_at", { ascending: false })
    .limit(args.limit);
  if (args.userId) q = q.eq("user_id", args.userId);
  if (args.title) q = q.ilike("title", `%${args.title}%`);
  const { data, error } = await q;
  if (error) throw error;
  console.log(JSON.stringify({ ok: true, filter: { user_id: args.userId, title: args.title }, rows: data ?? [] }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


