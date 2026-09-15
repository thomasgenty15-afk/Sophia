import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const connectionPath = path.join(root, "tests/real-personas/alex/connection.json");
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));

function statusJson() {
  const raw = execFileSync("/usr/local/bin/supabase", ["status", "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(start, end + 1));
}

async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { response, body };
}

const status = statusJson();
const apiUrl = status.API_URL || "http://127.0.0.1:54321";
const anonKey = status.ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (!connection.user_id || !connection.email) {
  throw new Error("Alex connection is missing user_id or email");
}
if (!anonKey || !serviceRoleKey) {
  throw new Error("Missing local Supabase keys");
}

const password = process.env.QA_ALEX_PASSWORD || crypto.randomBytes(24).toString("base64url");
const patch = await jsonFetch(`${apiUrl}/auth/v1/admin/users/${connection.user_id}`, {
  method: "PUT",
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    password,
    app_metadata: {
      is_test_persona: true,
    },
    user_metadata: {
      is_test_persona: true,
    },
  }),
});
if (!patch.response.ok) {
  throw new Error(`auth_admin_update_failed_${patch.response.status}`);
}

const token = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    email: connection.email,
    password,
  }),
});
if (!token.response.ok || !token.body?.refresh_token) {
  throw new Error(`token_exchange_failed_${token.response.status}`);
}

fs.writeFileSync(connectionPath, `${JSON.stringify({
  user_id: connection.user_id,
  email: connection.email,
  ...(process.env.QA_ALEX_PASSWORD
    ? { password }
    : { refresh_token: token.body.refresh_token }),
}, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  user_id: connection.user_id,
  connection: "tests/real-personas/alex/connection.json",
  connection_auth_written: process.env.QA_ALEX_PASSWORD ? "password" : "refresh_token",
}, null, 2));
