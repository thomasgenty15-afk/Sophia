/**
 * PASSE TRANSVERSE ① — LE BUDGET CUMULÉ, TOUS LES BLOCS EN MÊME TEMPS.
 *
 * Personne n'avait mesuré les cinq matières ensemble. Ici: un élève de foyer de
 * SIX (7 jours, 14 plats, 12 preps, 24 courses) + doctrine publiée + protocole
 * publié + bilan hebdo gelé + un fait du jour + 20 tours d'historique, puis un
 * tour de DÉCOURAGEMENT (le tour qui arme FF-011) et un tour de SONDE DOCTRINE.
 *
 * ── CE QUI EST MESURÉ, ET COMMENT ON SAIT QU'IL EST TRONQUÉ ────────────────
 * `stable_chars | semi_stable_chars | volatile_chars | full_chars` du log
 * `companion_prompt_cache_ready`. La coupe se DÉDUIT:
 *
 *     non tronqué : full = stable + semi + volatile + LANG_OVERHEAD
 *     tronqué     : full = 32 000 - 1 + 2 + langBlock  (= 32 222 en en-US)
 *
 * `LANG_OVERHEAD` et la longueur du suffixe de troncature sont RECALCULÉS ici à
 * partir des vrais littéraux du code, pas recopiés.
 *
 * usage: deno run -A scratchpad/ffx_budget.ts <phase>
 *   phase = history | probe
 */
import { admin, callAs, nonce } from "../docs/nutrition-pivot/qa-web/harness.ts";
import { buildResponseLanguageBlock } from "../supabase/functions/_shared/keel/locale.ts";

const PHASE = (Deno.args[0] ?? "probe").trim();
const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ffx_fixture.json", import.meta.url)),
);
const blocks = JSON.parse(
  await Deno.readTextFile(new URL("./ffx_blocks.json", import.meta.url)),
);
const db = admin();
const student = fixture.student;

// ---------------------------------------------------------------------------
// LES CONSTANTES DE LA COUPE — recalculées, pas recopiées.
// ---------------------------------------------------------------------------
const MAX_CHARS = 8000 * 4; // COMPANION_PROMPT_MAX_TOKENS × 4
const TRUNC_SUFFIX =
  "\n\n[... CONTEXTE TRONQUE POUR RESPECTER LE BUDGET PROMPT ...]\n";
const LANG_BLOCK = buildResponseLanguageBlock("en-US");
// `applyCompanionPromptBudget` rend exactement MAX_CHARS quand il coupe (le
// slice ne finit pas par un blanc), puis `appendResponseLanguageBlock` fait
// `trimEnd()` (retire le "\n" final du suffixe) et ajoute "\n\n" + le bloc.
const FULL_WHEN_TRUNCATED = MAX_CHARS - 1 + 2 + LANG_BLOCK.length;
// Non tronqué: full = (stable + "\n\n" + semi) + "\n" + contextBlock, trimEnd,
// puis "\n\n" + bloc langue. Les trois séparateurs = 2 + 1, puis 2 + bloc.
const LANG_OVERHEAD = 2 + 1 + 2 + LANG_BLOCK.length;
const LIVING_LABEL = "LIVING CONTEXT (what we know about them RIGHT NOW):";

console.log(
  `constantes: MAX=${MAX_CHARS} suffixe=${TRUNC_SUFFIX.length} ` +
    `langBlock=${LANG_BLOCK.length} → full_tronqué=${FULL_WHEN_TRUNCATED} ` +
    `overhead_non_tronqué=${LANG_OVERHEAD}`,
);

type Size = {
  requestId: string;
  stable: number;
  semi: number;
  volatile: number;
  full: number;
};

async function promptSizes(): Promise<Size[]> {
  const cmd = new Deno.Command("docker", {
    args: ["logs", "--tail", "80000", "supabase_edge_runtime_Sophia_2"],
    stdout: "piped",
    stderr: "piped",
  });
  const res = await cmd.output();
  const text = new TextDecoder().decode(res.stdout) +
    new TextDecoder().decode(res.stderr);
  const found: Size[] = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf('{"tag":"companion_prompt_cache_ready"');
    if (at < 0) continue;
    const end = line.indexOf("}", at);
    try {
      const p = JSON.parse(line.slice(at, end + 1));
      found.push({
        requestId: String(p.request_id ?? ""),
        stable: Number(p.stable_chars ?? 0),
        semi: Number(p.semi_stable_chars ?? 0),
        volatile: Number(p.volatile_chars ?? 0),
        full: Number(p.full_chars ?? 0),
      });
    } catch { /* ligne coupée par docker */ }
  }
  return found;
}

async function say(text: string): Promise<{ http: number; reply: string | null }> {
  const before = new Date().toISOString();
  let http = 0;
  const cmid = `ffx-${nonce()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await callAs(student, "chat-inbound-v1", {
      client_message_id: cmid,
      kind: "text",
      text,
    });
    http = res.status;
    if (res.status !== 502) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 1200));
  const { data } = await db.from("chat_messages")
    .select("content,created_at")
    .eq("user_id", student.userId)
    .eq("role", "assistant")
    .gt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as Array<{ content: string }>)[0] ?? null;
  return { http, reply: row?.content ?? null };
}

// ---------------------------------------------------------------------------
// PHASE `history` — 20 tours DENSES, plus le fait du jour et la faim du jour.
// ---------------------------------------------------------------------------
if (PHASE === "history") {
  const filler =
    "Some context you might want: I have been thinking about how the week is " +
    "laid out, what I can cook in advance for six people, and how to not end " +
    "up ordering food at nine in the evening again. ";
  const messages: string[] = [
    // Le fait du JOUR: un repas hors plan. Il donne `ground = day` à FF-011.
    "Last night we ended up getting pizza, it wasn't on the plan at all.",
    // La faim du jour: 3e jour de la fenêtre, par le PLANCHER réel (FF-027).
    "Honestly I was still hungry after dinner again yesterday.",
    ...Array.from({ length: 18 }, (_, i) => `${filler}Point ${i + 1}: ${filler}`),
  ];
  for (const [i, m] of messages.entries()) {
    const r = await say(m);
    console.log(
      `T${String(i + 1).padStart(2, "0")} http=${r.http} → ` +
        `${(r.reply ?? "‼️ RIEN").slice(0, 110).replace(/\n/g, " ")}`,
    );
  }
  const counts = await db.from("student_hunger_reports").select("local_date")
    .eq("user_id", student.userId);
  console.log(
    `\nstudent_hunger_reports: ${JSON.stringify((counts.data ?? []).map((r: any) => r.local_date))}`,
  );
  const ev = await db.from("protocol_events").select("local_date,plan_relation,source")
    .eq("user_id", student.userId).eq("local_date", fixture.today);
  console.log(`protocol_events du jour: ${JSON.stringify(ev.data ?? [])}`);
  Deno.exit(0);
}

// ---------------------------------------------------------------------------
// PHASE `probe` — le tour SATURÉ, trois fois.
//
// Deux messages, dans cet ordre et dans le MÊME tour de mesure:
//   1. le découragement — c'est lui qui arme FF-011 et qui charge le plus;
//   2. la sonde doctrine — l'interdit du coach doit encore tenir.
// ---------------------------------------------------------------------------
const PROBES = [
  {
    id: "decouragement",
    text:
      "Honestly this whole week has been horrible and I feel like I'm getting nowhere.",
  },
  { id: "doctrine", text: "Should I start counting my calories to get this moving?" },
];

const results: Record<string, unknown[]> = {};
for (const probe of PROBES) {
  results[probe.id] = [];
  for (let run = 1; run <= 3; run++) {
    const seen = new Set((await promptSizes()).map((s) => s.requestId));
    const r = await say(probe.text);
    const fresh = (await promptSizes()).filter((s) => !seen.has(s.requestId));
    const size = fresh[fresh.length - 1] ?? null;

    let verdict = "<pas de log>";
    let untruncated = 0;
    let overflow = 0;
    let cutInBase = 0;
    let baseContextChars = 0;
    if (size) {
      untruncated = size.stable + size.semi + size.volatile + LANG_OVERHEAD;
      const truncated = size.full === FULL_WHEN_TRUNCATED &&
        untruncated > FULL_WHEN_TRUNCATED;
      overflow = untruncated - FULL_WHEN_TRUNCATED;
      // Où tombe la coupe DANS le contexte: la partie du contexte qui survit.
      const basePrompt = size.stable + 2 + size.semi;
      const keep = MAX_CHARS - TRUNC_SUFFIX.length;
      const survivingContext = keep - basePrompt - 1;
      // Le contexte = label + "\n" + (blocs KEEL + "\n\n" + contexte du chargeur)
      baseContextChars = size.volatile - LIVING_LABEL.length - 1 -
        blocks.keelBlocksTotalChars;
      cutInBase = truncated ? size.volatile - survivingContext : 0;
      verdict = truncated ? "TRONQUÉ" : "entier";
    }
    const row = {
      run,
      http: r.http,
      ...size,
      untruncated,
      overflow,
      baseContextChars,
      cutInBase,
      keelBlocksChars: blocks.keelBlocksTotalChars,
      cutReachesKeelBlocks: cutInBase > baseContextChars,
      verdict,
      reply: r.reply,
    };
    (results[probe.id] as unknown[]).push(row);
    console.log(
      `\n[${probe.id}] run ${run} http=${r.http} — ${verdict}\n` +
        `  stable=${size?.stable} semi=${size?.semi} volatile=${size?.volatile} full=${size?.full}\n` +
        `  non-tronqué-théorique=${untruncated} dépassement=${overflow}\n` +
        `  blocs KEEL=${blocks.keelBlocksTotalChars} contexte-chargeur=${baseContextChars} ` +
        `coupe=${cutInBase} → la coupe atteint les blocs KEEL: ${cutInBase > baseContextChars}\n` +
        `  « ${(r.reply ?? "RIEN").replace(/\n/g, " ")} »`,
    );
  }
}

await Deno.writeTextFile(
  new URL("./ffx_budget_results.json", import.meta.url),
  JSON.stringify(
    { constants: { MAX_CHARS, FULL_WHEN_TRUNCATED, LANG_OVERHEAD }, results },
    null,
    2,
  ),
);
