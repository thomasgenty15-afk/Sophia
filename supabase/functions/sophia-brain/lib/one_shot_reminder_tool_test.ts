import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isLikelyOneShotReminderRequest,
  parseOneShotReminderRequest,
} from "./one_shot_reminder_tool.ts";

Deno.test("parseOneShotReminderRequest parses quarter-hour reminder", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Tu peux m'envoyer un rappel dans un quart d'heure pour me dire de faire mes pompes stp ?",
    timezone: "Europe/Paris",
    nowIso: "2026-03-18T14:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "faire mes pompes");
  assertEquals(parsed.eventContext, "one_shot_reminder:faire_mes_pompes");
  assertEquals(parsed.scheduledFor, "2026-03-18T14:15:00.000Z");
});

Deno.test("parseOneShotReminderRequest parses tomorrow local hour", () => {
  const parsed = parseOneShotReminderRequest({
    message: "Rappelle-moi demain à 8h pour appeler Paul",
    timezone: "Europe/Paris",
    nowIso: "2026-03-18T14:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "appeler Paul");
  assertEquals(parsed.eventContext, "one_shot_reminder:appeler_paul");
  assertEquals(parsed.scheduledFor, "2026-03-19T07:00:00.000Z");
});

Deno.test("parseOneShotReminderRequest ignores recurring reminder requests", () => {
  const parsed = parseOneShotReminderRequest({
    message: "Rappelle-moi tous les lundis à 8h d'appeler Paul",
    timezone: "Europe/Paris",
    nowIso: "2026-03-18T14:00:00.000Z",
  });

  assertEquals(parsed, null);
});

Deno.test("parseOneShotReminderRequest parses bundle phrasing with me faire un rappel", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Okok si tu veux ! Est ce que tu peux me faire un rappel dans 10 minutes de manière à ce que je fasse mes pompes ? :)",
    timezone: "Europe/Paris",
    nowIso: "2026-03-19T11:28:40.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "faire mes pompes");
  assertEquals(parsed.eventContext, "one_shot_reminder:faire_mes_pompes");
  assertEquals(parsed.scheduledFor, "2026-03-19T11:38:40.000Z");
});

Deno.test("isLikelyOneShotReminderRequest stays false for recurring requests", () => {
  assertEquals(
    isLikelyOneShotReminderRequest(
      "Est-ce que tu peux me faire un rappel tous les lundis à 8h pour appeler Paul ?",
    ),
    false,
  );
});

Deno.test("isLikelyOneShotReminderRequest matches natural me faire un rappel phrasing", () => {
  assertEquals(
    isLikelyOneShotReminderRequest(
      "Okok si tu veux ! Est ce que tu peux me faire un rappel dans 10 minutes de manière à ce que je fasse mes pompes ? :)",
    ),
    true,
  );
});
