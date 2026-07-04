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

Deno.test("daily bilan template renders approved outside-window prompt", () => {
  const rendered = renderWhatsAppTemplate({
    name: "sophia_bilan_v2",
    fallbackParams: ["Thomas"],
  });

  assertEquals(rendered.known, true);
  assertEquals(rendered.content, "Hey Thomas 😊\nPrêt pour ton petit bilan ?");
  assertEquals(rendered.buttons, ["Carrément!", "On le fait demain!"]);
  assertEquals(rendered.params, ["Thomas"]);
});

Deno.test("scheduled checkin template has zero placeholders (Meta-approved)", () => {
  // Meta rejects sophia_checkin_v2 when a body param is injected (error 132000):
  // the approved template expects zero placeholders. A name param must be ignored.
  const rendered = renderWhatsAppTemplate({
    name: "sophia_checkin_v2",
    fallbackParams: ["Thomas"],
  });

  assertEquals(rendered.known, true);
  assertEquals(
    rendered.content,
    "Hello 🙂\nJ’aimerais prendre rapidement de tes nouvelles. C’est ok pour toi ?",
  );
  assertEquals(rendered.buttons, ["Oui !", "Une prochaine fois !"]);
});

Deno.test("morning nudge template renders zero-placeholder morning prompt", () => {
  const rendered = renderWhatsAppTemplate({
    name: "morning_nudge_v1",
    fallbackParams: ["Thomas"],
  });

  assertEquals(rendered.known, true);
  assertEquals(rendered.content, "Hello ! Prêt pour ton boost du matin ? 💥");
  assertEquals(rendered.buttons, ["Go !"]);
});
