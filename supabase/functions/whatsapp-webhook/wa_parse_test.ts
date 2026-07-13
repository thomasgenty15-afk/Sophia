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
