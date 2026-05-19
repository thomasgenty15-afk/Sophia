import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SAFETY_PREGATE_FIXTURES } from "./safety_pregate.fixtures.ts";
import { runSafetyPregate } from "./safety_pregate.ts";

Deno.test("safety_pregate matches fixture risk bands", () => {
  for (const fixture of SAFETY_PREGATE_FIXTURES) {
    const actual = runSafetyPregate(fixture.input);
    assertEquals(
      actual.risk_band,
      fixture.expected_risk_band,
      fixture.id,
    );
    assertEquals(
      actual.allow_side_effects,
      actual.risk_band === "none" || actual.risk_band === "low",
      fixture.id,
    );
    assertEquals(actual.layer_contributions.dispatcher_llm, false, fixture.id);
  }
});

Deno.test("safety_pregate has no false negatives on clear critical cases", () => {
  const clearCritical = SAFETY_PREGATE_FIXTURES.filter((fixture) =>
    fixture.critical_clear
  );
  assertEquals(clearCritical.length, 8);
  for (const fixture of clearCritical) {
    const actual = runSafetyPregate(fixture.input);
    assertEquals(actual.risk_band, "critical", fixture.id);
    assertEquals(actual.detected, true, fixture.id);
  }
});

Deno.test("safety_pregate neutral false-positive rate stays within MVP bound", () => {
  const neutral = SAFETY_PREGATE_FIXTURES.filter((fixture) => fixture.neutral);
  const falsePositiveCount = neutral
    .map((fixture) => runSafetyPregate(fixture.input))
    .filter((actual) =>
      actual.risk_band !== "none" && actual.risk_band !== "low"
    )
    .length;
  assertEquals(neutral.length >= 8, true);
  assertEquals(falsePositiveCount / neutral.length < 0.30, true);
});

Deno.test("safety_pregate detects passive disappear ideation and carries short caution", () => {
  const passive = runSafetyPregate({
    user_message:
      "ces derniers jours j'ai eu des pensees du genre disparaitre ferait une pause",
    recent_messages: [],
    user_id: "u1",
    channel: "web",
  });
  assertEquals(passive.risk_band, "high");
  assertEquals(passive.allow_side_effects, false);

  const nonImminentPassive = runSafetyPregate({
    user_message:
      "je ne suis pas en danger ce soir, je n'ai rien prepare, mais j'ai pense que disparaitre ferait une pause",
    recent_messages: [],
    user_id: "u1",
    channel: "web",
  });
  assertEquals(nonImminentPassive.risk_band, "medium");
  assertEquals(nonImminentPassive.allow_side_effects, false);
  assertEquals(
    nonImminentPassive.reason_codes.includes(
      "passive_ideation_negated_medium_caution",
    ),
    true,
  );

  const absenceWording = runSafetyPregate({
    user_message:
      "j'ai eu une pensee du genre si je n'etais plus la, au moins ca s'arreterait",
    recent_messages: [],
    user_id: "u1",
    channel: "web",
  });
  assertEquals(absenceWording.risk_band, "high");
  assertEquals(absenceWording.allow_side_effects, false);

  const followup = runSafetyPregate({
    user_message:
      "rappelle-moi demain a 9h d'ecrire a une amie, mais si ce n'est pas le bon moment parce que je suis encore secoue, dis-le moi",
    recent_messages: [
      {
        role: "user",
        content:
          "ces derniers jours j'ai eu des pensees du genre disparaitre ferait une pause",
      },
      {
        role: "assistant",
        content: "On fait simple et concret en mode securite + soutien.",
      },
    ],
    user_id: "u1",
    channel: "web",
  });
  assertEquals(followup.risk_band, "medium");
  assertEquals(followup.allow_side_effects, false);
});

Deno.test("safety_pregate keeps recent safety context medium despite non-imminence", () => {
  const actual = runSafetyPregate({
    user_message:
      "je suis seul mais pas en danger la maintenant. Je n'ai rien prepare.",
    recent_messages: [
      {
        role: "user",
        content:
          "j'ai eu des pensees du genre disparaitre ferait une pause. Je ne veux pas me faire du mal.",
      },
    ],
    user_id: "u1",
    channel: "web",
  });
  assertEquals(actual.risk_band, "medium");
  assertEquals(actual.allow_side_effects, false);
  assertEquals(
    actual.reason_codes.includes("recent_safety_negated_medium_caution"),
    true,
  );
});

Deno.test("safety_pregate carries assistant safety context into a later tool request", () => {
  const actual = runSafetyPregate({
    user_message:
      "programme-moi un rappel demain a 9h pour ecrire a une amie, mais seulement si c'est ok niveau securite",
    recent_messages: [
      {
        role: "assistant",
        content:
          "J'ai eu une pensée, je n'ai pas besoin d'agir. Là, maintenant, je suis en sécurité.",
      },
    ],
    user_id: "u1",
    channel: "web",
  });
  assertEquals(actual.risk_band, "medium");
  assertEquals(actual.allow_side_effects, false);
  assertEquals(
    actual.reason_codes.includes("recent_safety_context_caution"),
    true,
  );
});

Deno.test("safety_pregate keeps negated passive ideation medium and blocks side effects", () => {
  const actual = runSafetyPregate({
    user_message:
      "ces derniers jours j'ai eu des pensees du genre disparaitre ferait une pause. Je ne veux pas me faire du mal, mais ca m'a fait peur.",
    recent_messages: [],
    user_id: "u1",
    channel: "web",
  });
  assertEquals(actual.risk_band, "medium");
  assertEquals(actual.allow_side_effects, false);
  assertEquals(
    actual.reason_codes.includes("passive_ideation_negated_medium_caution"),
    true,
  );
});

Deno.test("safety_pregate lowers explicit non-imminence instead of critical escalation", () => {
  const actual = runSafetyPregate({
    user_message:
      "je ne suis pas en danger ce soir, je n'ai rien prepare et je ne veux pas me faire du mal",
    recent_messages: [],
    user_id: "u1",
    channel: "web",
  });
  assertEquals(actual.risk_band === "none" || actual.risk_band === "low", true);
});
