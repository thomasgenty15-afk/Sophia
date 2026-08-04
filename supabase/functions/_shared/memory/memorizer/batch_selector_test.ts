import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildMessageProcessingRows,
  classifyAntiNoise,
  selectMemorizerBatch,
} from "./batch_selector.ts";

Deno.test("batch selector skips noise and keeps only substantive user messages", async () => {
  const batch = await selectMemorizerBatch({
    messages: [
      { id: "a", user_id: "u", role: "user", content: "ok" },
      { id: "b", user_id: "u", role: "assistant", content: "hello" },
      {
        id: "c",
        user_id: "u",
        role: "user",
        content: "Hier soir j'ai encore rate ma routine.",
      },
      { id: "d", user_id: "u", role: "user", content: "Je me sens nul." },
    ],
    already_processed_primary_ids: ["d"],
  });
  assertEquals(batch.primary_messages.map((m) => m.id), ["c"]);
  assertEquals(batch.skipped_noise_messages.map((m) => m.id), ["a"]);
  assertEquals(batch.context_messages.map((m) => m.id), ["b"]);
  assertEquals(batch.batch_hash.length, 64);
});

Deno.test("batch selector builds message processing tracking rows", async () => {
  const batch = await selectMemorizerBatch({
    messages: [
      { id: "a", user_id: "u", role: "user", content: "ok" },
      { id: "b", user_id: "u", role: "assistant", content: "ctx" },
      {
        id: "c",
        user_id: "u",
        role: "user",
        content: "Hier soir j'ai encore rate ma routine.",
      },
    ],
  });
  const rows = buildMessageProcessingRows({
    user_id: "u",
    extraction_run_id: "run",
    batch,
  });
  assertEquals(
    rows.map((r) =>
      `${r.message_id}:${r.processing_role}:${r.processing_status}`
    ),
    [
      "c:primary:completed",
      "b:context_only:completed",
      "a:skipped_noise:skipped",
    ],
  );
  assertEquals(
    classifyAntiNoise({ id: "x", user_id: "u", role: "user", content: "merci" })
      .skip,
    true,
  );
});

Deno.test("batch selector keeps short daily review replies once canonical extraction is tagged", async () => {
  assertEquals(
    classifyAntiNoise({
      id: "plain",
      user_id: "u",
      role: "user",
      content: "non creve",
    }).skip,
    true,
  );

  assertEquals(
    classifyAntiNoise({
      id: "daily",
      user_id: "u",
      role: "user",
      content: "non creve",
      metadata: {
        structured_extraction_source: "daily_action_review_v1",
        daily_action_review_v1: {
          structured_extraction_id: "pending-1",
        },
      },
    }).skip,
    false,
  );
});

Deno.test("batch selector keeps all substantive user messages by default", async () => {
  const messages = Array.from({ length: 35 }, (_, index) => ({
    id: `m${index}`,
    user_id: "u",
    role: "user" as const,
    content:
      `Hier j'ai note un apprentissage important ${index}: je procrastine quand la prochaine action est floue.`,
  }));
  const batch = await selectMemorizerBatch({ messages });

  assertEquals(batch.primary_messages.length, 35);
  assertEquals(batch.context_messages.length, 0);
});

Deno.test("batch selector never pre-filters an explicit memorize request (rose-r2 T13)", async () => {
  // "retiens que <fait court>" doit atteindre le LLM d'extraction meme sous
  // 15 mots et sans autre signal: un fait explicitement confie ne se perd
  // jamais dans le filtre de cout.
  const batch = await selectMemorizerBatch({
    messages: [
      {
        id: "memorize-short",
        user_id: "u",
        role: "user",
        content: "Retiens que je flanche les dimanches apres-midi.",
      },
      {
        id: "memorize-paraphrase",
        user_id: "u",
        role: "user",
        content: "Garde ca en tete: je craque quand je suis seule.",
      },
      // Anti-faux-positif: bavardage court sans intention memoire -> filtre.
      {
        id: "chatter",
        user_id: "u",
        role: "user",
        content: "haha oui c'est clair, trop bien.",
      },
    ],
  });
  assertEquals(batch.primary_messages.map((message) => message.id), [
    "memorize-short",
    "memorize-paraphrase",
  ]);
  assertEquals(batch.skipped_noise_messages.map((message) => message.id), [
    "chatter",
  ]);
  // Le miroir negatif reste intact: une demande d'oubli courte passe aussi
  // (signal forget), elle n'est pas convertie en memorisation.
  const forgetBatch = await selectMemorizerBatch({
    messages: [{
      id: "forget-short",
      user_id: "u",
      role: "user",
      content: "Ne retiens pas ce que je viens de dire.",
    }],
  });
  assertEquals(forgetBatch.primary_messages.map((message) => message.id), [
    "forget-short",
  ]);
});

Deno.test("batch selector keeps short durable preference, goal and deadline statements", async () => {
  const batch = await selectMemorizerBatch({
    messages: [
      {
        id: "goal",
        user_id: "u",
        role: "user",
        content: "J'apprends le japonais pour passer le JLPT N5 en decembre.",
      },
      {
        id: "preference",
        user_id: "u",
        role: "user",
        content: "Je veux que les rappels budget soient factuels.",
      },
      {
        id: "deadline",
        user_id: "u",
        role: "user",
        content: "La facture d'assurance doit etre payee avant le 20.",
      },
      {
        id: "work_relation",
        user_id: "u",
        role: "user",
        content:
          "Le dossier Orion est un sujet professionnel, pas un projet personnel.",
      },
      {
        id: "family_relation",
        user_id: "u",
        role: "user",
        content:
          "Ma cousine Lina m'aide a choisir des restaurants compatibles avec mon allergie.",
      },
    ],
  });

  assertEquals(batch.primary_messages.map((message) => message.id), [
    "goal",
    "preference",
    "deadline",
    "work_relation",
    "family_relation",
  ]);
  assertEquals(batch.skipped_noise_messages.length, 0);
});
