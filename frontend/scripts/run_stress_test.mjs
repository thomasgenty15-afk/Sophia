#!/usr/bin/env node
/**
 * Stress Test Runner
 * 
 * Runs multi-machine stress tests at different difficulty levels.
 * Each difficulty level has 3 scenarios that are randomly selected.
 * 
 * Usage:
 *   npm run stress:test -- --difficulty easy|medium|hard|maxhard [--turns 20] [--model gemini-3-flash-preview]
 * 
 * Examples:
 *   npm run stress:test -- --difficulty easy
 *   npm run stress:test -- --difficulty maxhard --turns 25
 */

import { spawn } from "child_process";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCENARIOS_DIR = path.join(__dirname, "../eval/scenarios/tools");

const DIFFICULTY_SCENARIOS = {
  easy: [
    "stress_test_easy_toolflow_topic",
    "stress_test_easy_bilan_firefighter",
    "stress_test_easy_confirm_deferred",
  ],
  medium: [
    "stress_test_medium_toolflow_firefighter_resume",
    "stress_test_medium_bilan_deferred_confirm",
    "stress_test_medium_topic_toolflow_deferred",
  ],
  hard: [
    "stress_test_hard_bilan_ff_toolflow_resume",
    "stress_test_hard_topic_confirm_deferred_toolflow",
    "stress_test_hard_ff_bilan_topic_deferred",
  ],
  maxhard: [
    "stress_test_maxhard_full_chaos_1",
    "stress_test_maxhard_full_chaos_2",
    "stress_test_maxhard_full_chaos_3",
  ],
  ultimate: [
    "stress_test_ultimate_full_flow",
  ],
};

const DIFFICULTY_LABELS = {
  easy: "EASY (2 machines)",
  medium: "MEDIUM (3 machines)",
  hard: "HARD (4 machines)",
  maxhard: "MAX HARD (5+ machines)",
  ultimate: "ULTIMATE (full flow - no turn limit)",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    difficulty: "easy",
    turns: 20,
    model: "gemini-3-flash-preview",
    all: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--difficulty" && args[i + 1]) {
      opts.difficulty = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === "--turns" && args[i + 1]) {
      opts.turns = parseInt(args[i + 1], 10) || 20;
      i++;
    } else if (args[i] === "--model" && args[i + 1]) {
      opts.model = args[i + 1];
      i++;
    } else if (args[i] === "--all") {
      opts.all = true;
    }
  }

  return opts;
}

function pickRandomScenario(difficulty) {
  const scenarios = DIFFICULTY_SCENARIOS[difficulty];
  if (!scenarios || scenarios.length === 0) {
    console.error(`Unknown difficulty: ${difficulty}`);
    console.error(`Available: ${Object.keys(DIFFICULTY_SCENARIOS).join(", ")}`);
    process.exit(1);
  }
  const idx = Math.floor(Math.random() * scenarios.length);
  return scenarios[idx];
}

async function runEval(scenario, turns, model) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      SOPHIA_SUPABASE_CLI: "supabase",
      SOPHIA_RUN_EVALS_HTTP_TIMEOUT_MS: "300000",
      SOPHIA_DISPATCHER_V2: "1",
      SOPHIA_SUPERVISOR_PENDING_NUDGES_V1: "1",
      SOPHIA_SUPERVISOR_RESUME_NUDGES_V1: "1",
    };

    const cmd = "npm";
    const args = [
      "run",
      "eval:tools",
      "--",
      "--scenario",
      scenario,
      "--turns",
      String(turns),
      "--model",
      model,
    ];

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running: ${cmd} ${args.join(" ")}`);
    console.log(`${"=".repeat(60)}\n`);

    const child = spawn(cmd, args, {
      cwd: path.join(__dirname, ".."),
      env,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ scenario, success: true });
      } else {
        resolve({ scenario, success: false, exitCode: code });
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  const opts = parseArgs();
  
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           SOPHIA STRESS TEST - MULTI-MACHINE               ║
╠════════════════════════════════════════════════════════════╣
║  Difficulty: ${DIFFICULTY_LABELS[opts.difficulty] ?? opts.difficulty.padEnd(40)}║
║  Turns: ${String(opts.turns).padEnd(47)}║
║  Model: ${opts.model.padEnd(47)}║
╚════════════════════════════════════════════════════════════╝
`);

  if (opts.all) {
    // Run all scenarios for the given difficulty
    const scenarios = DIFFICULTY_SCENARIOS[opts.difficulty];
    if (!scenarios) {
      console.error(`Unknown difficulty: ${opts.difficulty}`);
      process.exit(1);
    }
    
    console.log(`Running ALL ${scenarios.length} scenarios for ${opts.difficulty}...\n`);
    
    const results = [];
    for (const scenario of scenarios) {
      const result = await runEval(scenario, opts.turns, opts.model);
      results.push(result);
    }
    
    console.log(`\n${"=".repeat(60)}`);
    console.log("SUMMARY");
    console.log(`${"=".repeat(60)}`);
    for (const r of results) {
      const status = r.success ? "✅ PASS" : "❌ FAIL";
      console.log(`${status} - ${r.scenario}`);
    }
    const passed = results.filter((r) => r.success).length;
    console.log(`\nTotal: ${passed}/${results.length} passed`);
    
    process.exit(passed === results.length ? 0 : 1);
  } else {
    // Run a random scenario
    const scenario = pickRandomScenario(opts.difficulty);
    console.log(`Selected random scenario: ${scenario}\n`);
    
    const result = await runEval(scenario, opts.turns, opts.model);
    
    if (result.success) {
      console.log(`\n✅ Stress test PASSED: ${scenario}`);
      process.exit(0);
    } else {
      console.log(`\n❌ Stress test FAILED: ${scenario}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

