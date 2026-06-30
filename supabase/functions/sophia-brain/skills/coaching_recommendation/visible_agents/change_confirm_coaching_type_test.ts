import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CHANGE_CONFIRM_COACHING_TYPE_ROLE_LINES } from "./change_confirm_coaching_type.ts";

Deno.test("change_confirm_coaching_type prompt avoids internal taxonomy clarification", () => {
  const prompt = CHANGE_CONFIRM_COACHING_TYPE_ROLE_LINES.join("\n");

  assertEquals(
    prompt.includes("par rapport a quoi le user veut se debloquer"),
    true,
  );
  assertEquals(
    prompt.includes(
      'ne reponds pas "action de ton plan, action hors plan ou etat emotionnel ?"',
    ),
    true,
  );
  assertEquals(
    prompt.includes(
      "je veux juste me debloquer maintenant sans toucher au plan, c'est lequel ?",
    ),
    true,
  );
  assertEquals(
    prompt.includes("ne liste pas les trois cadres internes"),
    true,
  );
});
