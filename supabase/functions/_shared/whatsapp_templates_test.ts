import { assertEquals } from "jsr:@std/assert@1";

import {
  elidedPotionSegment,
  MORNING_LIGHT_TEMPLATE_VARIANTS,
  pickMorningLightVariant,
  potionReminderComponents,
  renderWhatsAppTemplate,
} from "./whatsapp_templates.ts";

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

Deno.test("potion reminder template injects the elided segment as {{1}}", () => {
  const rendered = renderWhatsAppTemplate({
    name: "sophia_potion_reminder_v1",
    components: [
      { type: "body", parameters: [{ type: "text", text: "d'apaisement" }] },
    ],
  });

  assertEquals(rendered.known, true);
  assertEquals(
    rendered.content,
    "Hello 🙂 Prêt(e) pour ton message d'apaisement du jour ?",
  );
  assertEquals(rendered.buttons, ["Oui !"]);
});

Deno.test("elidedPotionSegment covers the 6 potion types and handles unknowns", () => {
  assertEquals(elidedPotionSegment("rappel"), "de rappel");
  assertEquals(elidedPotionSegment("courage"), "de courage");
  assertEquals(elidedPotionSegment("guerison"), "de guérison");
  assertEquals(elidedPotionSegment("clarte"), "de clarté");
  assertEquals(elidedPotionSegment("amour"), "d'amour");
  assertEquals(elidedPotionSegment("apaisement"), "d'apaisement");
  // Case-insensitive + trimmed.
  assertEquals(elidedPotionSegment("  APAISEMENT "), "d'apaisement");
  // Unknown → null so callers fall back to the generic reminder.
  assertEquals(elidedPotionSegment("inconnu"), null);
  assertEquals(elidedPotionSegment(null), null);
});

Deno.test("potionReminderComponents builds a body param or null", () => {
  assertEquals(potionReminderComponents("amour"), [
    { type: "body", parameters: [{ type: "text", text: "d'amour" }] },
  ]);
  assertEquals(potionReminderComponents("inconnu"), null);
});

Deno.test("pickMorningLightVariant is deterministic and in range", () => {
  const a = pickMorningLightVariant("2026-07-10");
  const b = pickMorningLightVariant("2026-07-10");
  assertEquals(a, b);
  // Always one of the known variants.
  assertEquals(MORNING_LIGHT_TEMPLATE_VARIANTS.includes(a as never), true);
  // Two different dates can differ; at minimum the whole catalog is reachable.
  const seen = new Set<string>();
  for (let day = 1; day <= 28; day++) {
    const ymd = `2026-07-${String(day).padStart(2, "0")}`;
    seen.add(pickMorningLightVariant(ymd));
  }
  assertEquals(seen.size, MORNING_LIGHT_TEMPLATE_VARIANTS.length);
});
