import { assertEquals } from "jsr:@std/assert@1";

import { extractMessages } from "./wa_parse.ts";

Deno.test("extractMessages captures the reply context wamid on a button tap", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: "33600000000",
                  id: "wamid.INBOUND",
                  type: "button",
                  button: { payload: "AVEC_PLAISIR", text: "Avec plaisir !" },
                  context: { id: "wamid.TEMPLATE_ABC" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const [msg] = extractMessages(payload);
  assertEquals(msg.wa_message_id, "wamid.INBOUND");
  assertEquals(msg.interactive_title, "Avec plaisir !");
  // The wamid of the template it replied to is what lets us route to the
  // exact pending instead of the most-recent one.
  assertEquals(msg.reply_to_wa_message_id, "wamid.TEMPLATE_ABC");
});

Deno.test("extractMessages leaves reply context undefined for a plain text message", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: "33600000000",
                  id: "wamid.PLAIN",
                  type: "text",
                  text: { body: "coucou" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const [msg] = extractMessages(payload);
  assertEquals(msg.text, "coucou");
  assertEquals(msg.reply_to_wa_message_id, undefined);
});

// ---------------------------------------------------------------------------
// KEEL W5.1 — the media descriptor must survive the parse.
// Before W5.1 this parser set text="" for media types and pushed nothing else,
// so no media id existed anywhere downstream and a meal photo was structurally
// unfetchable. These tests pin the fix AND pin what did not change.
// ---------------------------------------------------------------------------

function mediaPayload(m: Record<string, unknown>) {
  return { entry: [{ changes: [{ value: { messages: [m] } }] }] };
}

Deno.test("extractMessages keeps the image media descriptor (id, mime, sha, caption)", () => {
  const [msg] = extractMessages(mediaPayload({
    from: "33600000000",
    id: "wamid.PHOTO",
    type: "image",
    image: {
      id: "1234567890",
      mime_type: "image/jpeg",
      sha256: "deadbeef",
      caption: "mon déjeuner",
    },
  }));

  assertEquals(msg.type, "image");
  assertEquals(msg.media?.media_type, "image");
  assertEquals(msg.media?.id, "1234567890");
  assertEquals(msg.media?.mime_type, "image/jpeg");
  assertEquals(msg.media?.sha256, "deadbeef");
  assertEquals(msg.media?.caption, "mon déjeuner");
  // Unchanged on purpose: the caption travels on `media.caption`, so no branch
  // that reads `text` (dedup, chat_messages.content, intent matching) shifts.
  assertEquals(msg.text, "");
});

Deno.test("extractMessages keeps descriptors for the other media types too", () => {
  for (const [type, envelope] of [
    ["audio", { id: "a1", mime_type: "audio/ogg" }],
    ["video", { id: "v1", mime_type: "video/mp4" }],
    ["document", { id: "d1", mime_type: "application/pdf", filename: "plan.pdf" }],
    ["sticker", { id: "s1", mime_type: "image/webp" }],
  ] as const) {
    const [msg] = extractMessages(mediaPayload({
      from: "33600000000",
      id: `wamid.${type}`,
      type,
      [type]: envelope,
    }));
    assertEquals(msg.media?.media_type, type);
    assertEquals(msg.media?.id, (envelope as any).id);
    assertEquals(msg.text, "");
  }
});

Deno.test("extractMessages leaves media undefined when the id is missing or empty", () => {
  // An unusable handle must not masquerade as a fetchable photo: the message
  // still comes through (the fallback answers), with no media object.
  for (const image of [{ mime_type: "image/jpeg" }, { id: "   " }, undefined]) {
    const [msg] = extractMessages(mediaPayload({
      from: "33600000000",
      id: "wamid.BROKEN",
      type: "image",
      image,
    }));
    assertEquals(msg.type, "image");
    assertEquals(msg.media, undefined);
  }
});

Deno.test("extractMessages leaves media undefined for non-media types", () => {
  const [text] = extractMessages(mediaPayload({
    from: "33600000000",
    id: "wamid.TXT",
    type: "text",
    text: { body: "coucou" },
  }));
  assertEquals(text.media, undefined);
  assertEquals(text.text, "coucou");
});
