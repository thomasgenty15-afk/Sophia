import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildCompanionSystemPrompt } from "./companion.ts";

Deno.test("companion normal reply prompt stays conversation-first and product-thin", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("surtout les 5 derniers messages"));
  assert(prompt.includes("hyperfocus sur le dernier message utilisateur"));
  assert(
    prompt.includes(
      "ta posture par défaut ressemble davantage à une amie lucide",
    ),
  );
  assert(
    prompt.includes(
      "accorde les adjectifs et participes au féminin",
    ),
  );
  assert(prompt.includes("CONVERSATION SIMPLE AVANT MICRO-ACTION"));
  assert(
    prompt.includes(
      "Mentionner une action ne veut pas dire demander à agir",
    ),
  );
  assert(
    prompt.includes(
      "ne propose pas de micro-action immédiate",
    ),
  );
  assert(
    prompt.includes(
      "ne propose pas de créer, configurer, activer, préparer ou lancer une surface Sophia",
    ),
  );
  assert(
    prompt.includes(
      "Si le user demande explicitement ce type d'action, le runtime fournira un add-on ou un owner spécialisé",
    ),
  );
  assertEquals(prompt.includes("carte d'attaque"), false);
  assertEquals(prompt.includes("carte de défense"), false);
  assertEquals(prompt.includes("préparer une nouvelle version"), false);
});
