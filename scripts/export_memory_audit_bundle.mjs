import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import process from "node:process";

function parseArgs(argv) {
  const out = {
    userId: null,
    scope: "web",
    scopeAll: false,
    from: null,
    to: null,
    hours: null,
    outFile: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--scope") out.scope = String(argv[++i] ?? "").trim() || "web";
    else if (a === "--scope-all") out.scopeAll = true;
    else if (a === "--from") out.from = String(argv[++i] ?? "").trim() || null;
    else if (a === "--to") out.to = String(argv[++i] ?? "").trim() || null;
    else if (a === "--hours") {
      const hours = Number(argv[++i] ?? "");
      out.hours = Number.isFinite(hours) && hours > 0 ? hours : null;
    } else if (a === "--out") out.outFile = String(argv[++i] ?? "").trim() || null;
    else if (a === "--help" || a === "-h") out.help = true;
  }

  return out;
}

function isIsoLike(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime());
}

function toIsoOrNull(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

function getLocalSupabaseStatus(repoRoot) {
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase").trim();
  const raw = execSync(`${supabaseCli} status --output json`, {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return JSON.parse(raw);
}

function isLocalUrl(u) {
  const s = String(u ?? "").toLowerCase();
  return s.includes("127.0.0.1") || s.includes("localhost") || s.includes("0.0.0.0");
}

function getSupabaseConnection(repoRoot) {
  const envUrl = String(process.env.SUPABASE_URL ?? "").trim();
  const envService = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "",
  ).trim();

  if (envUrl) {
    return {
      url: envUrl,
      serviceKey: envService || null,
      source: "env",
      localStatus: null,
    };
  }

  const st = getLocalSupabaseStatus(repoRoot);
  const url = String(st?.API_URL ?? "").trim();
  const serviceKey = String(st?.SECRET_KEY ?? "").trim() || null;
  if (!url) {
    throw new Error(
      "Missing SUPABASE_URL env and no local `supabase status --output json` available.",
    );
  }
  return {
    url,
    serviceKey,
    source: "local",
    localStatus: st,
  };
}

function getInternalSecret(connection) {
  const explicit = String(process.env.INTERNAL_FUNCTION_SECRET ?? "").trim();
  if (explicit) return explicit;

  const fallback = String(process.env.SECRET_KEY ?? "").trim();
  if (fallback) return fallback;

  if (connection.localStatus) {
    const local = String(connection.localStatus?.SECRET_KEY ?? "").trim();
    if (local) return local;
  }

  if (isLocalUrl(connection.url) && connection.serviceKey) {
    return connection.serviceKey;
  }

  throw new Error(
    "Missing INTERNAL_FUNCTION_SECRET. Set it in env for remote/staging usage.",
  );
}

function buildFunctionsBaseUrl(rawUrl) {
  const base = String(rawUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Missing SUPABASE_URL");
  if (base.endsWith("/functions/v1")) return base;
  if (base.includes("/functions/v1/")) return base.replace(/\/functions\/v1\/.*/, "/functions/v1");
  return `${base}/functions/v1`;
}

async function postInternalJson(url, internalSecret, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": internalSecret,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${text.slice(0, 1200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}`);
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function compactTsForFilename(iso) {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "invalid";
  return [
    dt.getUTCFullYear(),
    pad2(dt.getUTCMonth() + 1),
    pad2(dt.getUTCDate()),
    "T",
    pad2(dt.getUTCHours()),
    pad2(dt.getUTCMinutes()),
    pad2(dt.getUTCSeconds()),
    "Z",
  ].join("");
}

function transcriptWrite(filePath, messages) {
  const fd = fs.openSync(filePath, "w");
  try {
    for (const row of messages ?? []) {
      const ts = String(row?.created_at ?? "");
      const scope = String(row?.scope ?? "");
      const role = String(row?.role ?? "");
      const requestId = String(row?.metadata?.request_id ?? row?.metadata?.router_decision_v1?.request_id ?? "")
        .trim();
      const content = String(row?.content ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      const header = `[${ts}]${scope ? ` [${scope}]` : ""} ${role}${
        requestId ? ` (request_id=${requestId})` : ""
      }:`;
      fs.writeSync(fd, `${header}\n${content}\n\n`, null, "utf8");
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      [
        "Usage:",
        "  npm run memory:audit:export -- --user-id <uuid> --from <ISO> --to <ISO> [--scope web]",
        "  npm run memory:audit:export -- --user-id <uuid> --hours 24 [--scope web]",
        "",
        "Options:",
        "  --user-id <uuid>     Required",
        "  --from <ISO>         Start datetime, e.g. 2026-03-19T01:00:00+01:00",
        "  --to <ISO>           End datetime, e.g. 2026-03-20T01:00:00+01:00",
        "  --hours <n>          Alternative to --from/--to",
        "  --scope <name>       Default: web",
        "  --scope-all          Do not filter by scope",
        "  --out <path>         Output JSON path",
        "",
        "Env:",
        "  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY optional",
        "  INTERNAL_FUNCTION_SECRET required for remote/staging; local falls back to supabase status SECRET_KEY",
      ].join("\n"),
    );
    return;
  }

  if (!args.userId) {
    console.error('Missing --user-id "<uuid>"');
    process.exit(1);
  }
  if (args.from && !isIsoLike(args.from)) {
    console.error(`Invalid --from value: ${args.from}`);
    process.exit(1);
  }
  if (args.to && !isIsoLike(args.to)) {
    console.error(`Invalid --to value: ${args.to}`);
    process.exit(1);
  }
  if (!args.from && !args.hours) {
    console.error('Provide either --from "<ISO>" --to "<ISO>" or --hours <n>');
    process.exit(1);
  }

  const connection = getSupabaseConnection(repoRoot);
  const internalSecret = getInternalSecret(connection);
  const functionsBase = buildFunctionsBaseUrl(connection.url);
  const from = toIsoOrNull(args.from);
  const to = toIsoOrNull(args.to) ?? new Date().toISOString();
  const body = {
    user_id: args.userId,
    ...(args.scopeAll ? {} : { scope: args.scope }),
    ...(from ? { from } : {}),
    ...(from ? { to } : {}),
    ...(!from && args.hours ? { hours: args.hours } : {}),
  };

  const [traceRes, scorecardRes] = await Promise.all([
    postInternalJson(`${functionsBase}/get-memory-trace`, internalSecret, body),
    postInternalJson(`${functionsBase}/get-memory-scorecard`, internalSecret, body),
  ]);

  const effectiveFrom = String(traceRes?.trace?.window?.from ?? from ?? "").trim();
  const effectiveTo = String(traceRes?.trace?.window?.to ?? to ?? "").trim();
  const effectiveScope = args.scopeAll
    ? null
    : String(traceRes?.trace?.window?.scope ?? args.scope ?? "").trim() || null;

  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const defaultOutFile = path.join(
    outDir,
    `memory_audit_${String(args.userId).slice(0, 8)}_${
      effectiveScope ? effectiveScope : "all"
    }_${compactTsForFilename(effectiveFrom)}_${compactTsForFilename(effectiveTo)}.json`,
  );
  const outFile = args.outFile
    ? path.resolve(repoRoot, args.outFile)
    : defaultOutFile;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const transcriptPath = outFile.replace(/\.json$/i, ".transcript.txt");
  const bundle = {
    ok: true,
    exported_at: new Date().toISOString(),
    source: {
      supabase_url: connection.url,
      connection_source: connection.source,
      functions_base_url: functionsBase,
    },
    request: {
      user_id: args.userId,
      scope: effectiveScope,
      from: effectiveFrom,
      to: effectiveTo,
      used_hours: from ? null : args.hours,
    },
    trace: traceRes?.trace ?? null,
    scorecard: scorecardRes?.scorecard ?? null,
    annotations: scorecardRes?.annotations ?? [],
  };

  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), "utf8");
  transcriptWrite(transcriptPath, bundle.trace?.messages ?? []);

  console.log(JSON.stringify({
    ok: true,
    out: outFile,
    transcript: transcriptPath,
    window: {
      from: effectiveFrom,
      to: effectiveTo,
      scope: effectiveScope,
    },
    counts: {
      messages: bundle.trace?.summary?.messages_total ?? null,
      turns: bundle.trace?.summary?.turns_total ?? null,
      memorizer_runs: bundle.trace?.summary?.memorizer_runs_total ?? null,
      observability_events: bundle.trace?.summary?.observability_events_total ?? null,
      annotations: Array.isArray(bundle.annotations) ? bundle.annotations.length : null,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
