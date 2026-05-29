import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractReminderInstruction } from "./instruction_parser.ts";
import { parseReminderFromMessageDeterministic } from "./time_parser.ts";

Deno.test("instruction_extraction_strips_meta_command", () => {
  assertEquals(
    extractReminderInstruction("rappelle-moi à 16h05 de fermer le doc"),
    "fermer le doc",
  );
});

Deno.test("time_parser_dst_paris", () => {
  const parsed = parseReminderFromMessageDeterministic({
    message: "rappelle-moi demain à 16h05 de fermer le doc",
    timezone: "Europe/Paris",
    nowIso: "2026-03-28T12:00:00.000Z",
  });
  assertEquals(parsed?.scheduledFor, "2026-03-29T14:05:00.000Z");
  assertEquals(parsed?.reminderInstruction, "fermer le doc");
});
