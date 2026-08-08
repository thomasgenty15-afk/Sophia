/**
 * FF-016 — LE HARNAIS DE MESURE.
 *
 * Un scénario = un élève + un message, rejoué N fois (le dispatcher est
 * stochastique: 1 échec sur 3 est un RED, pas un flake). Chaque passe rend:
 *   - le texte VISIBLE relu dans `chat_messages` (jamais la réponse HTTP);
 *   - la lane qui a servi (escalade `contract_change_requests` = plan_question);
 *   - `full_chars` du prompt compagnon et la taille du bloc mapping, lus dans
 *     les logs du runtime edge — le texte du prompt n'est stocké nulle part,
 *     donc c'est la seule preuve d'injection et de budget.
 *
 * usage: deno run -A ff016_run.ts <fichier_scenarios.json> <sortie.json>
 */
import { admin, callAs, nonce } from "../docs/nutrition-pivot/qa-web/harness.ts";

export type Scenario = {
  id: string;
  level: "easy" | "medium" | "hard" | "extra-hard" | "adversarial";
  student: "a" | "b" | "c" | "d";
  message: string;
  runs?: number;
  /** Purge l'historique de chat de l'élève AVANT la passe. */
  fresh?: boolean;
  /** Messages joués avant, dans la même passe (pour les cas séquentiels). */
  prelude?: string[];
};

export type Pass = {
  run: number;
  http: number;
  reply: string | null;
  escalated: boolean;
  escalationReason: string | null;
  fullChars: number | null;
  protocolBlockChars: number | null;
  contextTokens: number | null;
  contextElements: string[] | null;
  requestId: string | null;
};

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff016_fixture.json", import.meta.url)),
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
  const passes: Pass[] = [];
  for (let run = 1; run <= (s.runs ?? 3); run++) {
    if (s.fresh) await purgeChat(student.userId);
    for (const p of s.prelude ?? []) {
      await callAs(student, "chat-inbound-v1", {
        client_message_id: `ff016-${nonce()}`,
        kind: "text",
        text: p,
      });
      await new Promise((r) => setTimeout(r, 600));
    }
    const beforeIso = new Date(Date.now() - 2000).toISOString();
    const beforeDb = new Date().toISOString();
    const escalationsBefore = await db.from("contract_change_requests")
      .select("id").eq("user_id", student.userId);
    const nBefore = ((escalationsBefore.data ?? []) as unknown[]).length;

    let http = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const cmid = `ff016-${s.id}-${run}-${nonce()}`;
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

    const { data: esc } = await db.from("contract_change_requests")
      .select("id,reason_code,created_at").eq("user_id", student.userId)
      .gt("created_at", beforeDb);
    const escRows = (esc ?? []) as Array<Record<string, unknown>>;

    const { data: tsl } = await db.from("turn_summary_logs")
      .select("context_tokens,context_elements,created_at")
      .eq("user_id", student.userId)
      .gt("created_at", beforeDb)
      .order("created_at", { ascending: false })
      .limit(1);
    const tslRow = ((tsl ?? []) as Array<Record<string, unknown>>)[0] ?? null;

    const logs = await edgeLogsSince(beforeIso);
    const fullChars = [...logs.matchAll(/"full_chars":(\d+)/g)]
      .map((m) => Number(m[1])).pop() ?? null;
    // Le log est un objet multi-ligne coloré par Deno: on cherche le
    // `block_chars` qui SUIT le tag, ANSI compris.
    const protoChars = [
      ...logs.matchAll(
        /keel\.protocol\.chat_block[\s\S]{0,300}?block_chars:\s*?\[?[\d;]*m?(\d+)/g,
      ),
    ].map((m) => Number(m[1])).pop() ?? null;

    passes.push({
      run,
      http,
      reply: (row?.content as string) ?? null,
      escalated: escRows.length > 0 && nBefore >= 0,
      escalationReason: (escRows[0]?.reason_code as string) ?? null,
      fullChars,
      protocolBlockChars: protoChars,
      contextTokens: (tslRow?.context_tokens as number) ?? null,
      contextElements: (tslRow?.context_elements as string[]) ?? null,
      requestId: (meta?.request_id as string) ?? null,
    });
    // Deux tours du même élève ne se marchent pas dessus.
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
    console.log(`\n=== ${s.id} [${s.level}] élève ${s.student} — « ${s.message} »`);
    const passes = await runScenario(s);
    out[s.id] = passes;
    for (const p of passes) {
      console.log(
        `  run ${p.run}: http=${p.http} escalade=${p.escalationReason ?? "-"} ` +
          `full_chars=${p.fullChars} bloc=${p.protocolBlockChars} ctx_tokens=${p.contextTokens}`,
      );
      console.log(`    « ${String(p.reply ?? "").replace(/\n/g, " ")} »`);
    }
    await Deno.writeTextFile(Deno.args[1], JSON.stringify(out, null, 2));
  }
}
