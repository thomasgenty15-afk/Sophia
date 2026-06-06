import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { applyUnexecutedEffectClaimGuard } from "./final_response_guards.ts";
import {
  createEffectLedger,
  recordCommittedEffect,
  rewriteUncommittedEffectClaims,
} from "./effect_ledger.ts";
import {
  containsDurableSuccessClaim,
  renderNonCommittedReply,
} from "../tools/operations/_shared/committed_effect_renderer_guard.ts";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/g, ""))
    .join("\n");
}

Deno.test("final guards trace plan modified without rewriting visible reply", () => {
  const ledger = createEffectLedger("turn-plan");
  const reply = "Plan ajusté pour la semaine.";
  const rewritten = rewriteUncommittedEffectClaims({
    reply,
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reply, reply);
});

Deno.test("final guards trace coach preference saved without rewriting visible reply", () => {
  const ledger = createEffectLedger("turn-preference");
  const reply = "C'est fait, préférence enregistrée.";
  const rewritten = rewriteUncommittedEffectClaims({
    reply,
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reply, reply);
});

Deno.test("final guards trace potion activated without rewriting visible reply", () => {
  const ledger = createEffectLedger("turn-potion");
  const reply = "Potion activée.";
  const rewritten = rewriteUncommittedEffectClaims({
    reply,
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reply, reply);
});

Deno.test("final guards keep committed potion activation claim", () => {
  const ledger = createEffectLedger("turn-potion-committed");
  recordCommittedEffect(ledger, {
    effect_id: "potion-commit",
    effect_type: "state_potion.activate",
    operation_type: "select_state_potion",
    committed_id: "session_1",
    source: "executor",
    db_ref: { table: "potion_sessions", id: "session_1" },
  });
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Potion activée.",
    ledger,
  });
  assertEquals(rewritten.changed, false);
});

Deno.test("legacy final guard rewrites intended but unexecuted reminder success", () => {
  const guarded = applyUnexecutedEffectClaimGuard({
    responseContent: "C'est programmé ✅",
    intendedTools: ["create_one_shot_reminder"],
    executedTools: [],
  });
  assertEquals(
    guarded,
    "Je préfère être clair : je n'ai pas encore programmé ce rappel. Dis-moi le moment exact (et le texte) et je le programme tout de suite.",
  );
});

Deno.test("run_ts_does_not_add_inline_business_success_blocks", async () => {
  const runText = await Deno.readTextFile(new URL("./run.ts", import.meta.url));
  const knownLegacy = [{
    name: "short technical fallback content strings",
    reason:
      "run.ts still has orchestration fallbacks, but migrated durable success copy belongs in renderers/final guards.",
    removal_criteria:
      "Final response pipeline owns all durable success/failure user-facing text.",
  }];
  assertEquals(
    knownLegacy.every((item) => item.reason && item.removal_criteria),
    true,
  );

  const suspicious = [...runText.matchAll(/content\s*:\s*["'`](.*?)["'`]/gs)]
    .map((match) => match[1])
    .filter((content) =>
      /\b(carte créée|rappel programmé|préférence enregistrée|potion activée|plan ajusté)\b/i
        .test(content)
    );
  assertEquals(suspicious, []);
});

Deno.test("turn_intent_arbitrator_has_no_authored_visible_replies", async () => {
  const source = stripComments(
    await Deno.readTextFile(
      new URL("./turn_intent_arbitrator.ts", import.meta.url),
    ),
  );
  assertEquals(/\b(reply|content|ack)\s*:\s*[`"']/.test(source), false);
  assertEquals(/\bconfirmation_message\s*:/.test(source), false);
  assertEquals(/\bexecution_message\s*:/.test(source), false);
});

Deno.test("migrated_tool_recommendation_copy_is_owned_outside_run_ts", async () => {
  const runText = await Deno.readTextFile(new URL("./run.ts", import.meta.url));
  const rendererText = await Deno.readTextFile(
    new URL(
      "../tools/operations/_shared/recommendation_renderer.ts",
      import.meta.url,
    ),
  );
  assertEquals(runText.includes("Tu veux qu'on l'utilise pour alléger"), false);
  assertEquals(
    rendererText.includes("Tu veux qu'on l'utilise pour alléger"),
    true,
  );
});

Deno.test("renderer_success_guard_blocks_success_words_without_commit", () => {
  assertEquals(containsDurableSuccessClaim("C'est fait."), true);
  assertEquals(
    renderNonCommittedReply("C'est fait.", "Rien n'est appliqué."),
    "Rien n'est appliqué.",
  );
  assertEquals(
    renderNonCommittedReply("Je prépare un brouillon.", "fallback"),
    "Je prépare un brouillon.",
  );
});
