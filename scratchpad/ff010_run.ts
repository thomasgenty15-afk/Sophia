/**
 * FF-010 — LE HARNAIS DE RUN RÉEL.
 *
 * Un scénario = un élève + un message, rejoué N fois (le dispatcher est
 * stochastique: 1 échec sur 3 est un RED, pas un flake). Chaque passe rend le
 * texte VISIBLE relu dans `chat_messages` — jamais la réponse HTTP —, les
 * `context_elements` de `turn_summary_logs`, et `full_chars` lu dans les logs
 * du runtime edge (le texte du prompt n'est stocké nulle part: c'est la seule
 * preuve de budget).
 *
 * usage: deno run -A scratchpad/ff010_run.ts <scenarios.json> <sortie.json>
 */
import { admin, callAs, nonce } from "../docs/nutrition-pivot/qa-web/harness.ts";

export type Scenario = {
  id: string;
  level: "easy" | "medium" | "hard" | "extra-hard" | "adversarial";
  student: string;
  message: string;
  runs?: number;
  /** Purge l'historique de chat de l'élève AVANT la passe. */
  fresh?: boolean;
  prelude?: string[];
};

export type Pass = {
  run: number;
  http: number;
  reply: string | null;
  fullChars: number | null;
  contextTokens: number | null;
  contextElements: string[] | null;
  requestId: string | null;
};

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff010_fixture.json", import.meta.url)),
);
const db = admin();

async function edgeLogsSince(sinceIso: string): Promise<string> {
  const cmd = new Deno.Command("docker", {
    args: ["logs", "--since", sinceIso, "supabase_edge_runtime_Sophia_2"],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  return new TextDecoder().decode(out.stdout) +
    new TextDecoder().decode(out.stderr);
}

async function purgeChat(userId: string) {
  await db.from("chat_messages").delete().eq("user_id", userId);
  await db.from("user_chat_states").delete().eq("user_id", userId);
}

export async function runScenario(s: Scenario): Promise<Pass[]> {
  const student = fixture.students[s.student];
  if (!student) throw new Error(`élève inconnu: ${s.student}`);
  const passes: Pass[] = [];
  for (let run = 1; run <= (s.runs ?? 3); run++) {
    if (s.fresh) await purgeChat(student.userId);
    for (const p of s.prelude ?? []) {
      await callAs(student, "chat-inbound-v1", {
        client_message_id: `ff010-${nonce()}`,
        kind: "text",
        text: p,
      });
      await new Promise((r) => setTimeout(r, 700));
    }
    const beforeIso = new Date(Date.now() - 2000).toISOString();
    const beforeDb = new Date().toISOString();

    let http = 0;
    const cmid = `ff010-${s.id}-${run}-${nonce()}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await callAs(student, "chat-inbound-v1", {
        client_message_id: cmid,
        kind: "text",
        text: s.message,
      });
      http = res.status;
      // Kong rend des 502 sans corps sous charge: on retente avec le MÊME id.
      if (res.status !== 502) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await new Promise((r) => setTimeout(r, 1500));

    const { data: msgs } = await db.from("chat_messages")
      .select("content,metadata,created_at,role")
      .eq("user_id", student.userId)
      .eq("role", "assistant")
      .gt("created_at", beforeDb)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = ((msgs ?? []) as Array<Record<string, unknown>>)[0] ?? null;
    const meta = (row?.metadata ?? null) as Record<string, unknown> | null;

    const { data: tsl } = await db.from("turn_summary_logs")
      .select("context_tokens,context_elements,created_at")
      .eq("user_id", student.userId)
      .gt("created_at", beforeDb)
      .order("created_at", { ascending: false })
      .limit(1);
    const tslRow = ((tsl ?? []) as Array<Record<string, unknown>>)[0] ?? null;

    const logs = await edgeLogsSince(beforeIso);
    // ⚠️ LE TAG, ET PAS SEULEMENT LA CLÉ. `watcher.ts` et `synthesizer.ts`
    // émettent AUSSI `full_chars`; un `.pop()` sur la clé nue mélange trois
    // prompts et rend une mesure de budget qui n'est le budget de personne.
    const fullChars = [
      ...logs.matchAll(
        /"tag":"companion_prompt_cache_ready"[^\n]*?"full_chars":(\d+)/g,
      ),
    ].map((m) => Number(m[1])).pop() ?? null;

    passes.push({
      run,
      http,
      reply: (row?.content as string) ?? null,
      fullChars,
      contextTokens: (tslRow?.context_tokens as number) ?? null,
      contextElements: (tslRow?.context_elements as string[]) ?? null,
      requestId: (meta?.request_id as string) ?? null,
    });
    await new Promise((r) => setTimeout(r, 800));
  }
  return passes;
}

if (import.meta.main) {
  const scenarios: Scenario[] = JSON.parse(
    await Deno.readTextFile(Deno.args[0]),
  );
  const out: Record<string, Pass[]> = {};
  for (const s of scenarios) {
    console.log(`\n=== ${s.id} [${s.level}] ${s.student} — « ${s.message} »`);
    const passes = await runScenario(s);
    out[s.id] = passes;
    for (const p of passes) {
      console.log(`  run ${p.run}: http=${p.http} full_chars=${p.fullChars}`);
      console.log(`    « ${String(p.reply ?? "").replace(/\n/g, " ")} »`);
    }
    await Deno.writeTextFile(Deno.args[1], JSON.stringify(out, null, 2));
  }
}
