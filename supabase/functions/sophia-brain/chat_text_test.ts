import { extractHiddenFilRougeNote } from "./chat_text.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("extractHiddenFilRougeNote strips whatsapp hidden note", () => {
  const parsed = extractHiddenFilRougeNote(
    "Réponse visible 😊\n<!--fil_rouge_whatsapp: On parle du rythme et du sommeil. Prochain pas: choisir une heure de coucher simple.-->",
  );
  assertEquals(parsed.visibleText, "Réponse visible 😊");
  assertEquals(
    parsed.note,
    "On parle du rythme et du sommeil. Prochain pas: choisir une heure de coucher simple.",
  );
  assertEquals(parsed.marker, "fil_rouge_whatsapp");
});

Deno.test("extractHiddenFilRougeNote leaves normal text unchanged", () => {
  const parsed = extractHiddenFilRougeNote("Réponse visible seulement");
  assertEquals(parsed.visibleText, "Réponse visible seulement");
  assertEquals(parsed.note, null);
  assertEquals(parsed.marker, null);
});
