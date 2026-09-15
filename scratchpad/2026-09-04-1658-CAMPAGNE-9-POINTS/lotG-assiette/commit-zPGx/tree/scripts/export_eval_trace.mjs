import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function parseArgs(argv) {
  const out = { evalRunId: null, outFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--eval-run-id") out.evalRunId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--out") out.outFile = String(argv[++i] ?? "").trim() || null;
  }
  return out;
}

function getLocalSupabaseStatus(repoRoot) {
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase").trim();
  const raw = execSync(`${supabaseCli} status --output json`, { encoding: "utf8", cwd: repoRoot });
  return JSON.parse(raw);
}

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  if (!args.evalRunId) {
    console.error('Missing --eval-run-id "<uuid>"');
    process.exit(1);
  }

  const st = getLocalSupabaseStatus(repoRoot);
  const url = String(st?.API_URL ?? "").trim();
  const serviceKey = String(st?.SECRET_KEY ?? "").trim(); // service role key for local REST
  if (!url || !serviceKey) {
    console.error("Missing API_URL/SECRET_KEY from `supabase status --output json`");
    process.exit(1);
  }

  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = args.outFile ? path.resolve(repoRoot, args.outFile) : path.join(outDir, `eval_trace_${args.evalRunId}.json`);

  const endpoint =
    `${url}/rest/v1/conversation_eval_events?eval_run_id=eq.${encodeURIComponent(args.evalRunId)}&order=created_at.asc`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Failed (${res.status}) ${text.slice(0, 600)}`);
    process.exit(1);
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("Non-JSON response");
    process.exit(1);
  }

  fs.writeFileSync(outFile, JSON.stringify(json, null, 2), "utf8");
  console.log(JSON.stringify({ ok: true, eval_run_id: args.evalRunId, events_count: Array.isArray(json) ? json.length : null, out: outFile }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


