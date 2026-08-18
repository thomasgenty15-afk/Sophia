#!/usr/bin/env node
// ===========================================================================
// export_llm_prompt_dump.mjs — relire le prompt EXACT envoyé au modèle.
//
// Lit `public.llm_raw_response_events` (remplie seulement quand
// SOPHIA_LLM_RAW_TRACE_ENABLED=1) et écrit sur disque les trois fichiers dont
// dépend toute enquête sur la génération :
//
//   <dossier>/prompt-system.txt   le 1er paramètre de generateWithGemini()
//   <dossier>/prompt-user.txt     le 2e paramètre
//   <dossier>/output.json         la sortie du modèle + la trace de l'appel
//
// ── USAGE ─────────────────────────────────────────────────────────────────
//   # 1. voir les derniers runs qui portent un prompt
//   node scripts/export_llm_prompt_dump.mjs --list
//   node scripts/export_llm_prompt_dump.mjs --list --source generate-household-meal-v1
//
//   # 2. vider un run précis
//   node scripts/export_llm_prompt_dump.mjs --request-id <id> --out /tmp/dump
//
//   # 3. vider le dernier run d'un élève (le plus courant)
//   node scripts/export_llm_prompt_dump.mjs --user-id <uuid> --out /tmp/dump
//
//   # 4. vider le dernier run d'une lane, tous utilisateurs confondus
//   node scripts/export_llm_prompt_dump.mjs --source generate-meal-v1
//
// `--out` est optionnel : sans lui le dossier est créé sous
// `scratchpad/qa-generation/prompt-dumps/<horodatage>-<lane>-<id>/`.
//
// Connexion : `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` si présents dans
// l'environnement, sinon `supabase status --output json` (pile locale).
// ⚠️ N'exporte PAS ces variables dans un shell qui lancera ensuite la suite de
// tests : elles empoisonnent `deno test` (cicatrice connue du dépôt).
// ===========================================================================

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HELP = `
export_llm_prompt_dump.mjs — écrit prompt-system.txt / prompt-user.txt / output.json

  --request-id <id>   identifiant de requête (colonne request_id)
  --user-id <uuid>    dernier run de cet utilisateur
  --source <lane>     filtre / choisit la lane (generate-meal-v1,
                      generate-week-plan-v1, generate-household-meal-v1, ...)
  --out <dossier>     dossier de sortie (créé si absent)
  --list              n'écrit rien : liste les derniers runs tracés
  --limit <n>         taille de la liste (défaut 20)
  --help

Exemples:
  node scripts/export_llm_prompt_dump.mjs --list
  node scripts/export_llm_prompt_dump.mjs --request-id abc-123 --out /tmp/dump
  node scripts/export_llm_prompt_dump.mjs --user-id 0000-... --source generate-meal-v1
`;

function parseArgs(argv) {
  const out = {
    requestId: null,
    userId: null,
    source: null,
    outDir: null,
    list: false,
    limit: 20,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--request-id") out.requestId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--source") out.source = String(argv[++i] ?? "").trim() || null;
    else if (a === "--out") out.outDir = String(argv[++i] ?? "").trim() || null;
    else if (a === "--list") out.list = true;
    else if (a === "--limit") out.limit = Number(argv[++i] ?? 20) || 20;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) throw new Error(`Option inconnue: ${a}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

function getSupabaseConnection(repoRoot) {
  const envUrl = String(process.env.SUPABASE_URL ?? "").trim();
  const envService = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "",
  ).trim();
  if (envUrl && envService) {
    return { url: envUrl.replace(/\/+$/, ""), serviceKey: envService, source: "env" };
  }

  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase").trim();
  const raw = execSync(`${supabaseCli} status --output json`, {
    encoding: "utf8",
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const st = JSON.parse(raw);
  const url = String(st?.API_URL ?? "").trim();
  const serviceKey = String(st?.SERVICE_ROLE_KEY ?? st?.SECRET_KEY ?? "").trim();
  if (!url || !serviceKey) {
    throw new Error(
      "Aucune connexion: pose SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, ou démarre la pile locale.",
    );
  }
  return { url: url.replace(/\/+$/, ""), serviceKey, source: "local" };
}

async function restGet(conn, tablePath) {
  const url = `${conn.url}/rest/v1/${tablePath}`;
  const res = await fetch(url, {
    headers: {
      apikey: conn.serviceKey,
      Authorization: `Bearer ${conn.serviceKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${tablePath} → ${res.status}: ${text.slice(0, 800)}`);
  }
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

const PROMPT_COLS =
  "id,created_at,request_id,user_id,source,provider,model,attempt,chain_index,status,http_status,outcome," +
  "json_mode,tool_choice,has_tools,system_prompt_chars,system_prompt_truncated," +
  "user_message_chars,user_message_truncated,metadata";

function filters({ userId, source }) {
  const parts = [];
  if (userId) parts.push(`user_id=eq.${encodeURIComponent(userId)}`);
  if (source) parts.push(`source=eq.${encodeURIComponent(source)}`);
  return parts;
}

async function listRuns(conn, args) {
  const q = [
    "llm_raw_response_events?system_prompt=not.is.null",
    ...filters(args),
    `select=${PROMPT_COLS}`,
    "order=created_at.desc",
    `limit=${Math.max(1, Math.min(200, args.limit))}`,
  ].join("&");
  return restGet(conn, q);
}

async function resolveRequestId(conn, args) {
  if (args.requestId) return { requestId: args.requestId, how: "--request-id" };
  const rows = await listRuns(conn, { ...args, limit: 1 });
  if (!rows.length) {
    throw new Error(
      "Aucune ligne avec un prompt archivé pour ce filtre.\n" +
        "  • SOPHIA_LLM_RAW_TRACE_ENABLED=1 est-il posé dans le conteneur edge ?\n" +
        "  • le run a-t-il vraiment appelé le modèle (MEGA_TEST_MODE renvoie un stub sans appel) ?\n" +
        "  • `--list` sans filtre montre ce qui existe.",
    );
  }
  const how = args.userId
    ? `dernier run de --user-id ${args.userId}${args.source ? ` (--source ${args.source})` : ""}`
    : args.source
    ? `dernier run de --source ${args.source}`
    : "dernier run tracé, tous filtres confondus";
  return { requestId: rows[0].request_id, how, seed: rows[0] };
}

async function loadEvents(conn, requestId) {
  const q = [
    `llm_raw_response_events?request_id=eq.${encodeURIComponent(requestId)}`,
    "select=*",
    "order=created_at.asc",
  ].join("&");
  return restGet(conn, q);
}

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

function compactTs(iso) {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "unknown";
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function slug(value, fallback) {
  const s = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || fallback;
}

/** Le "résultat" d'un appel: la dernière ligne terminale, succès de préférence. */
function pickResultRow(events) {
  const terminal = events.filter((e) => e.status === "success");
  if (terminal.length) return terminal[terminal.length - 1];
  const errored = events.filter((e) => e.outcome === "error" || e.error_message);
  if (errored.length) return errored[errored.length - 1];
  return events[events.length - 1] ?? null;
}

function maybeParseJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const cleaned = text.replace(/^```json\s*|```$/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function main_summaryLine(row) {
  const meta = row.metadata ?? {};
  return [
    String(row.created_at ?? "").slice(0, 19).replace("T", " "),
    (row.source ?? "-").padEnd(36),
    (row.model ?? "-").padEnd(18),
    `sys=${String(row.system_prompt_chars ?? "-").padStart(7)}${row.system_prompt_truncated ? "!" : " "}`,
    `usr=${String(row.user_message_chars ?? "-").padStart(7)}${row.user_message_truncated ? "!" : " "}`,
    `meta(sys=${meta.system_prompt_chars ?? "-"},usr=${meta.prompt_chars ?? "-"})`,
    row.request_id ?? "-",
  ].join("  ");
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const conn = getSupabaseConnection(repoRoot);

  if (args.list) {
    const rows = await listRuns(conn, args);
    if (!rows.length) {
      console.log("Aucun run tracé (avec prompt) pour ce filtre.");
      return;
    }
    console.log(`${rows.length} run(s) — « ! » signale un texte coupé au plafond\n`);
    for (const row of rows) console.log(main_summaryLine(row));
    console.log(
      `\nVider le premier:\n  node scripts/export_llm_prompt_dump.mjs --request-id ${rows[0].request_id} --out /tmp/dump`,
    );
    return;
  }

  const { requestId, how } = await resolveRequestId(conn, args);
  const events = await loadEvents(conn, requestId);
  if (!events.length) throw new Error(`Aucun événement pour request_id=${requestId}`);

  // ⚠️ UN `request_id` PEUT PORTER PLUSIEURS APPELS MODÈLE. La lane solo, par
  // exemple, rejoue sous `generate-meal-v1.composition_retry` avec un message
  // utilisateur DIFFÉRENT (le premier plan y est recollé). Par défaut on vide
  // le premier appel — celui qui a réellement composé —, `--source` choisit.
  const promptRows = events.filter((e) => e.system_prompt != null || e.user_message != null);
  const promptRow = (args.source && promptRows.find((e) => e.source === args.source)) ||
    promptRows[0];
  if (!promptRow) {
    throw new Error(
      `request_id=${requestId} existe (${events.length} événements) mais AUCUN ne porte de prompt.\n` +
        "Le run est probablement antérieur à la capture, ou la trace était éteinte au moment du run.",
    );
  }
  const resultRow = pickResultRow(events);

  const outDir = args.outDir
    ? path.resolve(args.outDir)
    : path.join(
      repoRoot,
      "scratchpad/qa-generation/prompt-dumps",
      `${compactTs(promptRow.created_at)}-${slug(promptRow.source, "lane")}-${slug(slug(requestId, "run").slice(0, 12))}`,
    );
  fs.mkdirSync(outDir, { recursive: true });

  const systemPath = path.join(outDir, "prompt-system.txt");
  const userPath = path.join(outDir, "prompt-user.txt");
  const outputPath = path.join(outDir, "output.json");

  fs.writeFileSync(systemPath, String(promptRow.system_prompt ?? ""), "utf8");
  fs.writeFileSync(userPath, String(promptRow.user_message ?? ""), "utf8");

  const meta = promptRow.metadata ?? {};
  const payload = {
    request_id: requestId,
    resolved_by: how,
    user_id: promptRow.user_id ?? null,
    source: promptRow.source ?? null,
    exported_at: new Date().toISOString(),
    prompt: {
      captured_on_event: {
        id: promptRow.id,
        status: promptRow.status,
        created_at: promptRow.created_at,
        provider: promptRow.provider,
        model: promptRow.model,
        attempt: promptRow.attempt,
        chain_index: promptRow.chain_index,
      },
      system_prompt_chars: promptRow.system_prompt_chars,
      system_prompt_truncated: promptRow.system_prompt_truncated === true,
      system_prompt_written_chars: String(promptRow.system_prompt ?? "").length,
      user_message_chars: promptRow.user_message_chars,
      user_message_truncated: promptRow.user_message_truncated === true,
      user_message_written_chars: String(promptRow.user_message ?? "").length,
      // Compteurs calculés indépendamment dans gemini.ts (rawTraceMetadata).
      // Ils doivent coller aux `*_chars` ci-dessus : sinon la capture ment.
      independent_counters: {
        system_prompt_chars: meta.system_prompt_chars ?? null,
        prompt_chars: meta.prompt_chars ?? null,
      },
      // Ce qui n'est PAS capturé, dit explicitement pour qu'on ne le cherche pas.
      not_captured: ["tools", "temperature", "response_schema"],
      json_mode: promptRow.json_mode === true,
      tool_choice: promptRow.tool_choice ?? null,
      has_tools: promptRow.has_tools === true,
    },
    result: resultRow
      ? {
        id: resultRow.id,
        created_at: resultRow.created_at,
        status: resultRow.status,
        outcome: resultRow.outcome,
        provider: resultRow.provider,
        model: resultRow.model,
        http_status: resultRow.http_status,
        attempt: resultRow.attempt,
        chain_index: resultRow.chain_index,
        error_message: resultRow.error_message ?? null,
        output_tool_name: resultRow.output_tool_name ?? null,
        output_tool_args: resultRow.output_tool_args ?? null,
        output_text: resultRow.output_text ?? null,
        output_text_json: maybeParseJson(resultRow.output_text),
        raw_response_truncated: resultRow.raw_response_truncated === true,
        raw_response: resultRow.raw_response ?? null,
      }
      : null,
    events: events.map((e) => ({
      created_at: e.created_at,
      status: e.status,
      outcome: e.outcome,
      provider: e.provider,
      model: e.model,
      attempt: e.attempt,
      chain_index: e.chain_index,
      http_status: e.http_status,
      error_message: e.error_message ?? null,
      carries_prompt: e.system_prompt != null || e.user_message != null,
    })),
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const mismatch = [];
  if (
    meta.system_prompt_chars != null &&
    Number(meta.system_prompt_chars) !== Number(promptRow.system_prompt_chars)
  ) {
    mismatch.push(
      `system_prompt: colonne=${promptRow.system_prompt_chars} vs compteur indépendant=${meta.system_prompt_chars}`,
    );
  }
  if (
    meta.prompt_chars != null &&
    Number(meta.prompt_chars) !== Number(promptRow.user_message_chars)
  ) {
    mismatch.push(
      `user_message: colonne=${promptRow.user_message_chars} vs compteur indépendant=${meta.prompt_chars}`,
    );
  }

  console.log(`request_id : ${requestId}   (${how})`);
  console.log(`lane       : ${promptRow.source ?? "-"}   modèle: ${resultRow?.model ?? promptRow.model}`);
  console.log(
    `système    : ${promptRow.system_prompt_chars} car.${promptRow.system_prompt_truncated ? " ⚠️ COUPÉ au plafond" : ""} → ${systemPath}`,
  );
  console.log(
    `utilisateur: ${promptRow.user_message_chars} car.${promptRow.user_message_truncated ? " ⚠️ COUPÉ au plafond" : ""} → ${userPath}`,
  );
  console.log(`sortie     : ${resultRow?.status ?? "-"}/${resultRow?.outcome ?? "-"} → ${outputPath}`);
  if (promptRows.length > 1) {
    const others = promptRows.filter((e) => e.id !== promptRow.id).map((e) => e.source);
    console.log(
      `\nCette requête porte ${promptRows.length} appels modèle. Vidé: « ${promptRow.source} ».` +
        `\nLes autres, avec --source : ${[...new Set(others)].join(", ")}`,
    );
  }
  if (mismatch.length) {
    console.log(`\n⚠️ ÉCART avec le compteur indépendant — la capture ment:\n  - ${mismatch.join("\n  - ")}`);
    process.exitCode = 2;
  } else {
    console.log("\nLongueurs confirmées par le compteur indépendant de gemini.ts.");
  }
}

main().catch((err) => {
  console.error(`export_llm_prompt_dump: ${err?.message ?? err}`);
  process.exit(1);
});
