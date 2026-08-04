import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { detectAttackKeywordTrigger } from "./attack_keyword.ts";
import {
  attackKeywordSupportFallback,
  type AttackKeywordSupportContextV1,
  extractAttackKeywordSupportCandidates,
  isAllowedAttackKeyword,
  renderAttackKeywordSupportReply,
  sanitizeRecentUserMessages,
} from "./attack-keyword-support.ts";

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    activation_keyword: "Bascule",
    activation_keyword_normalized: "bascule",
    risk_situation: "Tu t'assois pour rédiger et l'envie d'ouvrir tes messages devient automatique.",
    strength_anchor: "Ta concentration et ta soirée libérée.",
    first_response_intent: "L'aider à tenir tout de suite.",
    assistant_prompt: "Réponds vite, un seul geste immédiat.",
    ...overrides,
  };
}

function cardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    generated_at: "2026-07-15T10:00:00Z",
    last_updated_at: "2026-07-16T10:00:00Z",
    content: {
      techniques: [
        {
          technique_key: "texte_recadrage",
          generated_result: { generated_asset: "x", mode_emploi: "y" },
        },
        {
          technique_key: "pre_engagement",
          title: "Mot de bascule",
          generated_result: {
            generated_asset: "Quand j'écris ce mot, je choisis ma soirée.",
            mode_emploi: "Envoie ton mot dès que l'envie monte.",
            keyword_trigger: trigger(),
          },
        },
      ],
    },
    ...overrides,
  };
}

Deno.test("isAllowedAttackKeyword rejects reserved and multi-word values", () => {
  assertEquals(isAllowedAttackKeyword("Bascule !"), true);
  assertEquals(isAllowedAttackKeyword("stop"), false);
  assertEquals(isAllowedAttackKeyword("Oui"), false);
  assertEquals(isAllowedAttackKeyword("je bascule"), false);
  assertEquals(isAllowedAttackKeyword(""), false);
});

Deno.test("extract builds a candidate only from a complete pre_engagement trigger", () => {
  const candidates = extractAttackKeywordSupportCandidates([cardRow() as any]);
  assertEquals(candidates.length, 1);
  assertEquals(candidates[0].data.attack_card_id, "card-1");
  assertEquals(candidates[0].data.technique_key, "pre_engagement");
  assertEquals(candidates[0].payload.activation_keyword_normalized, "bascule");

  const incomplete = cardRow({
    id: "card-2",
    content: {
      techniques: [{
        technique_key: "pre_engagement",
        generated_result: {
          generated_asset: "x",
          mode_emploi: "y",
          keyword_trigger: trigger({ risk_situation: "" }),
        },
      }],
    },
  });
  assertEquals(extractAttackKeywordSupportCandidates([incomplete as any]), []);

  const reserved = cardRow({
    id: "card-3",
    content: {
      techniques: [{
        technique_key: "pre_engagement",
        generated_result: {
          generated_asset: "x",
          mode_emploi: "y",
          keyword_trigger: trigger({
            activation_keyword: "Stop",
            activation_keyword_normalized: "stop",
          }),
        },
      }],
    },
  });
  assertEquals(extractAttackKeywordSupportCandidates([reserved as any]), []);
});

Deno.test("duplicate keyword resolves to the most recently updated card", () => {
  const older = cardRow({ id: "old", last_updated_at: "2026-07-10T10:00:00Z" });
  const newer = cardRow({ id: "new", last_updated_at: "2026-07-16T10:00:00Z" });
  const match = detectAttackKeywordTrigger(
    "bascule !",
    extractAttackKeywordSupportCandidates([older, newer] as any),
  );
  assertEquals(match?.data.attack_card_id, "new");
});

Deno.test("stale normalized field cannot hijack another word", () => {
  const hijack = cardRow({
    content: {
      techniques: [{
        technique_key: "pre_engagement",
        generated_result: {
          generated_asset: "x",
          mode_emploi: "y",
          keyword_trigger: trigger({ activation_keyword_normalized: "focus" }),
        },
      }],
    },
  });
  const candidates = extractAttackKeywordSupportCandidates([hijack as any]);
  assertEquals(candidates[0].payload.activation_keyword_normalized, "bascule");
  assertEquals(detectAttackKeywordTrigger("focus", candidates), null);
});

function supportContext(): AttackKeywordSupportContextV1 {
  return extractAttackKeywordSupportCandidates([cardRow() as any])[0].data;
}

Deno.test("render uses the specialized runner output", async () => {
  const out = await renderAttackKeywordSupportReply({
    context: supportContext(),
    userId: "user-1",
    runner: () =>
      Promise.resolve(
        JSON.stringify({
          support_text:
            "Je suis là. Pose le téléphone hors de portée et ouvre ton rapport.",
        }),
      ),
  });
  assertEquals(out.used_fallback, false);
  assertStringIncludes(out.support_text, "Pose le téléphone");
});

Deno.test("render falls back deterministically on runner failure", async () => {
  const rejected = await renderAttackKeywordSupportReply({
    context: supportContext(),
    userId: "user-1",
    runner: () => Promise.reject(new Error("boom")),
  });
  assertEquals(rejected.used_fallback, true);
  assertStringIncludes(rejected.support_text, "concentration");

  const garbage = await renderAttackKeywordSupportReply({
    context: supportContext(),
    userId: "user-1",
    runner: () => Promise.resolve("pas du json"),
  });
  assertEquals(garbage.used_fallback, true);
});

Deno.test("fallback stays grounded in the stored anchor", () => {
  const text = attackKeywordSupportFallback(supportContext());
  assertStringIncludes(text, "Ta concentration");
});

Deno.test("sanitize keeps last real user messages, drops keyword echoes", () => {
  const out = sanitizeRecentUserMessages(
    [
      "premier message qui date",
      "Bascule !",
      "bon il est ouvert",
      "  la pile me decourage  ",
      "bascule",
    ],
    "bascule",
  );
  assertEquals(out, [
    "premier message qui date",
    "bon il est ouvert",
    "la pile me decourage",
  ]);
  assertEquals(sanitizeRecentUserMessages(null, "bascule"), []);
  const long = sanitizeRecentUserMessages(["x".repeat(500)], "bascule");
  assertEquals(long[0].length <= 240, true);
});

Deno.test("render passes session messages to the AI, none when cold", async () => {
  let seenPayload: Record<string, unknown> = {};
  const runner = (_system: string, userPrompt: string) => {
    seenPayload = JSON.parse(userPrompt);
    return Promise.resolve(JSON.stringify({ support_text: "ok" }));
  };
  await renderAttackKeywordSupportReply({
    context: supportContext(),
    userId: "user-1",
    recentUserMessages: ["Bascule", "il est ouvert, je suis dessus"],
    runner,
  });
  assertEquals(seenPayload.derniers_messages_user, [
    "il est ouvert, je suis dessus",
  ]);

  await renderAttackKeywordSupportReply({
    context: supportContext(),
    userId: "user-1",
    runner,
  });
  assertEquals("derniers_messages_user" in seenPayload, false);
});
