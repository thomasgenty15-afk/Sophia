/**
 * FF-016 — UN TOUR, joué pour de vrai, avec sa preuve relue en base.
 *
 * usage: deno run -A ff016_turn.ts <a|b|c|d> "<message>"
 */
import { admin, callAs, nonce } from "../docs/nutrition-pivot/qa-web/harness.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff016_fixture.json", import.meta.url)),
);
const key = Deno.args[0] as "a" | "b" | "c" | "d";
const text = Deno.args[1];
const student = fixture.students[key];
const db = admin();

const before = new Date().toISOString();
const cmid = `ff016-${nonce()}`;
const res = await callAs(student, "chat-inbound-v1", {
  client_message_id: cmid,
  kind: "text",
  text,
});
await new Promise((r) => setTimeout(r, 1200));
const { data } = await db.from("chat_messages")
  .select("role,content,metadata,created_at")
  .eq("user_id", student.userId)
  .gt("created_at", before)
  .order("created_at", { ascending: true });

console.log("HTTP", res.status);
for (const row of (data ?? []) as Array<Record<string, unknown>>) {
  console.log(`\n[${row.role}] ${row.content}`);
  const meta = row.metadata as Record<string, unknown> | null;
  if (row.role === "assistant" && meta) {
    console.log(
      "  meta:",
      JSON.stringify({
        response_owner: meta.response_owner,
        request_id: meta.request_id,
        reason_code: meta.reason_code,
      }),
    );
  }
}
