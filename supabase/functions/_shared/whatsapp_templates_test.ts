import { assertEquals } from "jsr:@std/assert@1";

import { renderWhatsAppTemplate } from "./whatsapp_templates.ts";

Deno.test("global reach template renders generic outside-window prompt", () => {
  const rendered = renderWhatsAppTemplate({
    name: "global_reach_template",
  });

  assertEquals(rendered.known, true);
  assertEquals(
    rendered.content,
    "J'ai une info pour toi, je peux te la donner ? 😊",
  );
  assertEquals(rendered.buttons, ["Oui!", "Plus tard!"]);
  assertEquals(rendered.params, []);
});
