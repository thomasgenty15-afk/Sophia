import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planRealignmentVisiblePrompt } from "./visible_agent.ts";

Deno.test("plan_realignment visible prompt uses Ajuster mon plan product path", () => {
  const prompt = planRealignmentVisiblePrompt(
    "plan_realignment_platform_guidance",
  );

  assertStringIncludes(prompt, "Dashboard > Plan > Ajuster mon plan");
  assertStringIncludes(prompt, "le user remplit le cadre Ajuster mon plan");
  assertStringIncludes(
    prompt,
    "l'IA prendra automatiquement en compte ce qu'il ecrit",
  );
});

Deno.test("plan_realignment visible prompt forbids direct plan edits", () => {
  const prompt = planRealignmentVisiblePrompt("plan_realignment_support");

  assertStringIncludes(
    prompt,
    "Tu ne dis jamais que le user peut supprimer, decaler, diminuer, alleger ou reprioriser directement",
  );
  assert(
    !prompt.includes(
      "ouvrir le Plan, revoir la semaine ou les actions, alleger, deplacer ou reprioriser depuis l'interface",
    ),
  );
});

Deno.test("plan_realignment visible prompt can suggest input data for the frame", () => {
  const prompt = planRealignmentVisiblePrompt("plan_realignment_followup");

  assertStringIncludes(prompt, "ce qui n'a pas tenu");
  assertStringIncludes(prompt, "contraintes de temps ou d'energie");
  assertStringIncludes(prompt, "ce qu'il aimerait avoir a la place");
  assertStringIncludes(prompt, "actions devenues irrealisables");
});

Deno.test("plan_realignment visible prompt opens reflection instead of writing for user", () => {
  const prompt = planRealignmentVisiblePrompt("plan_realignment_followup");

  assertStringIncludes(prompt, "ouvrir les horizons du user");
  assertStringIncludes(prompt, "sans faire la reponse a sa place");
  assertStringIncludes(
    prompt,
    "Ne donne pas par defaut une petite phrase a copier",
  );
  assertStringIncludes(prompt, "une trame de depart personnalisable");
});

Deno.test("plan_realignment visible prompt avoids confusing Sophia-as-recipient wording", () => {
  const prompt = planRealignmentVisiblePrompt("plan_realignment_followup");

  assertStringIncludes(prompt, "Ne formule pas la guidance");
  assertStringIncludes(prompt, "raconter a Sophia");
  assertStringIncludes(prompt, "dire a Sophia");
  assertStringIncludes(prompt, "ecrire dans Ajuster mon plan");
  assertStringIncludes(prompt, "donner du contexte dans le cadre");
});
