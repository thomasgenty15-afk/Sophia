/**
 * Generate a pre-made plan bank for evals (stored in repo, not DB).
 *
 * - Generates plans using real Gemini calls.
 * - Writes files into: supabase/functions/run-evals/plan_bank/<THEME_KEY>/*.json
 *
 * Usage (from repo root):
 *   deno run -A supabase/scripts/generate_eval_plan_bank.ts --per-theme 3
 *
 * Requirements:
 * - Local Supabase running (so we can call the edge function `generate-plan`)
 * - Env vars:
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_ANON_KEY
 *   - SOPHIA_MASTER_ADMIN_EMAIL / SOPHIA_MASTER_ADMIN_PASSWORD (or defaults used in scripts)
 *   - GEMINI_API_KEY (for the "answers generation" Gemini call)
 *
 * Notes:
 * - This script does two Gemini calls per plan:
 *   1) Create realistic questionnaire answers for the chosen axis + two sub-problems (real Gemini).
 *   2) Call `generate-plan` (edge function) with `force_real_generation=true` (real Gemini).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateWithGemini } from "../functions/_shared/gemini.ts";
import { sha256Hex, pickOne, pickManyUnique } from "../functions/run-evals/lib/utils.ts";
import { fromFileUrl, join } from "https://deno.land/std@0.168.0/path/mod.ts";

import { THEME_ENERGY } from "../../frontend/src/data/onboarding/theme_energy.ts";
import { THEME_SLEEP } from "../../frontend/src/data/onboarding/theme_sleep.ts";
import { THEME_DISCIPLINE } from "../../frontend/src/data/onboarding/theme_discipline.ts";
import { THEME_PROFESSIONAL } from "../../frontend/src/data/onboarding/theme_professional.ts";
import { THEME_RELATIONS } from "../../frontend/src/data/onboarding/theme_relations.ts";
import { THEME_SENSE } from "../../frontend/src/data/onboarding/theme_sense.ts";
import { THEME_TRANSVERSE } from "../../frontend/src/data/onboarding/theme_transverse.ts";
import { THEME_CONFIDENCE } from "../../frontend/src/data/onboarding/theme_confidence.ts";

type ThemeDef = typeof THEME_ENERGY;

function stripQuotes(v: string): string {
  const s = String(v ?? "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

function loadEnvFileIntoDenoEnv(filePath: string): boolean {
  try {
    const raw = Deno.readTextFileSync(filePath);
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      const val = stripQuotes(t.slice(eq + 1).trim());
      if (!key) continue;
      // Only set if not already present in the environment.
      if (!(Deno.env.get(key) ?? "").trim()) {
        try {
          Deno.env.set(key, val);
        } catch {
          // ignore
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]) {
  const out = {
    perTheme: 2,
    model: "gemini-2.5-flash",
    pacing: "balanced" as "fast" | "balanced" | "slow",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--per-theme") out.perTheme = Math.max(1, Math.min(20, Number(argv[++i] ?? "2") || 2));
    else if (a === "--model") out.model = String(argv[++i] ?? out.model);
    else if (a === "--pacing") {
      const v = String(argv[++i] ?? "balanced").trim();
      out.pacing = (v === "fast" || v === "slow" ? v : "balanced") as any;
    }
  }
  return out;
}

function mustEnv(name: string, fallback?: string) {
  const v = (Deno.env.get(name) ?? "").trim();
  if (v) return v;
  if (fallback != null) return fallback;
  throw new Error(`Missing env ${name}`);
}

function decodeJwtAlg(jwt: string) {
  const t = String(jwt ?? "").trim();
  const p0 = t.split(".")[0] ?? "";
  if (!p0) return "missing";
  try {
    const header = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p0.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    return String(header?.alg ?? "unknown");
  } catch {
    return "parse_failed";
  }
}

async function signJwtHs256({ secret, payload }: { secret: string; payload: any }) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj: any) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const toSign = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign)));
  const sigB64 = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${toSign}.${sigB64}`;
}

async function getLocalSupabaseStatus(): Promise<any> {
  const repoRoot = fromFileUrl(new URL("../../", import.meta.url));
  const supabaseCli = (Deno.env.get("SOPHIA_SUPABASE_CLI") ?? "npx --yes supabase@latest").trim();
  const cmdParts = supabaseCli.split(" ").filter(Boolean);
  const cmd = cmdParts[0];
  const baseArgs = cmdParts.slice(1);
  const p = new Deno.Command(cmd, {
    args: [...baseArgs, "status", "--output", "json"],
    cwd: repoRoot,
    stdout: "piped",
    stderr: "piped",
  });
  const res = await p.output();
  if (!res.success) {
    const err = new TextDecoder().decode(res.stderr);
    throw new Error(`supabase status failed: ${err.slice(0, 400)}`);
  }
  const txt = new TextDecoder().decode(res.stdout);
  return JSON.parse(txt);
}

async function getSupabaseAuthEnv(): Promise<{ url: string; anonKey: string }> {
  const envUrl = (Deno.env.get("VITE_SUPABASE_URL") ?? "").trim();
  const envAnon = (Deno.env.get("VITE_SUPABASE_ANON_KEY") ?? "").trim();
  if (envUrl && envAnon) return { url: envUrl, anonKey: envAnon };

  const st = await getLocalSupabaseStatus();
  const url = String(st?.API_URL ?? st?.SUPABASE_URL ?? "").trim();
  let anonKey = String(st?.ANON_KEY ?? "").trim();
  const jwtSecret = String(st?.JWT_SECRET ?? "").trim();

  // Normalize to HS256 keys when local CLI returns ES256 (common local flake).
  const anonAlg = decodeJwtAlg(anonKey);
  if (anonAlg !== "HS256" && jwtSecret) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24 * 365 * 10;
    const iss = "supabase-demo";
    anonKey = await signJwtHs256({ secret: jwtSecret, payload: { iss, role: "anon", exp } });
  }

  if (!url) throw new Error("Missing Supabase API_URL (local). Is supabase running?");
  if (!anonKey) throw new Error("Missing Supabase ANON_KEY (local). Is supabase running?");
  return { url, anonKey };
}

function ensureDir(p: string) {
  try {
    Deno.mkdirSync(p, { recursive: true });
  } catch {
    // ignore
  }
}

function writeJsonPretty(path: string, obj: unknown) {
  const tmp = `${path}.tmp_${Date.now()}`;
  Deno.writeTextFileSync(tmp, JSON.stringify(obj, null, 2));
  Deno.renameSync(tmp, path);
}

function sampleUserProfile() {
  return {
    birth_date: pickOne(["1992-03-11", "1988-09-22", "1996-01-05"]),
    gender: pickOne(["male", "female", "other"]),
  };
}

function themeKeyForThemeId(id: string): string {
  const map: Record<string, string> = {
    ENG: "ENERGY",
    SLP: "SLEEP",
    DSC: "DISCIPLINE",
    PRO: "PROFESSIONAL",
    REL: "RELATIONS",
    SNS: "SENSE",
    TRN: "TRANSVERSE",
    CNF: "CONFIDENCE",
  };
  return map[String(id ?? "").trim()] ?? String(id ?? "").trim().toUpperCase();
}

function pickAxisAndProblems(theme: ThemeDef) {
  const axes = Array.isArray((theme as any).axes) ? (theme as any).axes : [];
  if (axes.length === 0) throw new Error(`Theme ${theme.id} has no axes`);
  const axis = pickOne(axes);
  const problems = Array.isArray(axis?.problems) ? axis.problems : [];
  if (problems.length < 2) throw new Error(`Axis ${axis?.id ?? "?"} has <2 problems`);
  const selected = pickManyUnique(problems, 2);
  return { axis, selectedProblems: selected };
}

async function generateAnswersWithGemini(params: {
  theme: ThemeDef;
  axis: any;
  selectedProblems: any[];
  model: string;
  pacing: "fast" | "balanced" | "slow";
}) {
  const { theme, axis, selectedProblems, model, pacing } = params;
  const problemsPayload = selectedProblems.map((p: any) => ({
    id: p.id,
    label: p.label,
    // pick min 2 detail questions
    detailQuestions: (Array.isArray(p.detailQuestions) ? p.detailQuestions : []).slice(0, 2).map((q: any) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      options: Array.isArray(q.options) ? q.options.map((o: any) => o.label) : [],
    })),
  }));

  const system = [
    "Tu es un générateur de réponses réalistes à un questionnaire de coaching.",
    "Retourne STRICTEMENT du JSON (pas de markdown).",
    "Règles:",
    "- Le JSON doit contenir: inputs, answers, currentAxis.",
    "- inputs: why, blockers, context, pacing.",
    "- currentAxis: id, title, theme, problems (liste de labels).",
    "- answers: un objet détaillé qui reflète les choix aux questions (texte libre OK) + meta.",
    "- Les réponses doivent être cohérentes avec les 2 sous-problèmes choisis.",
    "- Le style est humain, concret, pas trop long.",
  ].join("\n");

  const user = [
    `THEME: ${theme.title} (id=${theme.id})`,
    `AXE: ${axis.title} (id=${axis.id})`,
    `SOUS-PROBLÈMES (2):`,
    JSON.stringify(problemsPayload, null, 2),
    "",
    `PACING imposé: ${pacing}`,
    "",
    "Génère maintenant le JSON demandé.",
  ].join("\n");

  const out = await generateWithGemini(system, user, 0.6, true, [], "auto", {
    forceRealAi: true,
    model,
    source: "eval-plan-bank:questionnaire_answers",
    requestId: `eval-plan-bank:${theme.id}:${axis.id}:${Date.now()}`,
  });
  const txt = typeof out === "string" ? out : JSON.stringify(out);
  return JSON.parse(txt);
}

async function callGeneratePlanEdge(params: {
  url: string;
  anonKey: string;
  accessToken: string;
  body: any;
}) {
  const { url, anonKey, accessToken, body } = params;
  const resp = await fetch(`${url}/functions/v1/generate-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "apikey": anonKey,
      "x-request-id": `eval-plan-bank:generate-plan:${Date.now()}`,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json?.error) {
    throw new Error(String(json?.error ?? `generate-plan failed (${resp.status})`));
  }
  return json;
}

async function ensureMasterAdminSession(params: { url: string; anonKey: string }) {
  const email = mustEnv("SOPHIA_MASTER_ADMIN_EMAIL", "thomasgenty15@gmail.com");
  const password = mustEnv("SOPHIA_MASTER_ADMIN_PASSWORD", "123456");
  const authed = createClient(params.url, params.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signIn, error } = await authed.auth.signInWithPassword({ email, password });
  if (error || !signIn.session?.access_token) {
    throw new Error(`Cannot sign in as master admin (${email}). Set SOPHIA_MASTER_ADMIN_EMAIL/PASSWORD.`);
  }
  return { accessToken: signIn.session.access_token, email };
}

async function main() {
  const args = parseArgs(Deno.args);

  // Auto-load local Supabase env (where GEMINI_API_KEY often lives).
  // This keeps the generator runnable without exporting secrets into the shell.
  const repoRoot = fromFileUrl(new URL("../../", import.meta.url));
  const supabaseEnv = join(repoRoot, "supabase", ".env");
  const supabaseEnvLocal = join(repoRoot, "supabase", ".env.local");
  loadEnvFileIntoDenoEnv(supabaseEnv);
  loadEnvFileIntoDenoEnv(supabaseEnvLocal);

  const { url, anonKey } = await getSupabaseAuthEnv();
  const { accessToken } = await ensureMasterAdminSession({ url, anonKey });

  const themes: ThemeDef[] = [
    THEME_ENERGY,
    THEME_SLEEP,
    THEME_DISCIPLINE,
    THEME_PROFESSIONAL,
    THEME_RELATIONS,
    THEME_SENSE,
    THEME_TRANSVERSE,
    THEME_CONFIDENCE,
  ];

  const bankRoot = fromFileUrl(new URL("../functions/run-evals/plan_bank/", import.meta.url));
  ensureDir(bankRoot);

  for (const theme of themes) {
    const themeKey = themeKeyForThemeId((theme as any).id);
    const themeDir = join(bankRoot, themeKey);
    ensureDir(themeDir);

    for (let i = 0; i < args.perTheme; i++) {
      const { axis, selectedProblems } = pickAxisAndProblems(theme);
      const answersPkg = await generateAnswersWithGemini({
        theme,
        axis,
        selectedProblems,
        model: args.model,
        pacing: args.pacing,
      });

      const inputs = answersPkg?.inputs ?? {};
      const answers = answersPkg?.answers ?? {};
      const currentAxis = answersPkg?.currentAxis ?? {
        id: axis.id,
        title: axis.title,
        theme: theme.title,
        problems: selectedProblems.map((p: any) => p.label),
      };
      const userProfile = sampleUserProfile();

      const planJson = await callGeneratePlanEdge({
        url,
        anonKey,
        accessToken,
        body: {
          force_real_generation: true,
          mode: "standard",
          inputs,
          currentAxis,
          answers,
          userProfile,
        },
      });

      const fingerprint = (await sha256Hex(JSON.stringify(planJson))).slice(0, 16);
      const selectedProblemIds = selectedProblems.map((p: any) => String(p.id));
      const selectedProblemLabels = selectedProblems.map((p: any) => String(p.label));

      const payload = {
        meta: {
          id: `plan_${themeKey}_${axis.id}_${fingerprint}`,
          theme_key: themeKey,
          theme_id: String((theme as any).id ?? ""),
          theme_title: String((theme as any).title ?? ""),
          axis_id: String(axis.id ?? ""),
          axis_title: String(axis.title ?? ""),
          selected_problem_ids: selectedProblemIds,
          selected_problem_labels: selectedProblemLabels,
          fingerprint,
          model: args.model,
          created_at: new Date().toISOString(),
        },
        fake: {
          inputs,
          currentAxis,
          answers,
          userProfile,
        },
        plan_json: planJson,
      };

      const fileName = `${payload.meta.id}.json`.replace(/[^a-zA-Z0-9._-]/g, "_");
      const outPath = join(themeDir, fileName);
      writeJsonPretty(outPath, payload);
      console.log(`[ok] wrote ${outPath}`);
    }
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    Deno.exit(1);
  });
}


