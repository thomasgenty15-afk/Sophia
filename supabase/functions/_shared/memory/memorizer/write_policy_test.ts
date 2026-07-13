import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  decideInitialWriteStatus,
  isReminderObjectItem,
} from "./write_policy.ts";
import type { DryRunCandidate } from "./types.ts";

function candidate(contentText: string, summary = ""): DryRunCandidate {
  return {
    item: {
      kind: "event",
      content_text: contentText,
      normalized_summary: summary || contentText,
      domain_keys: [],
      confidence: 0.85,
      importance_score: 0.7,
      sensitivity_level: "normal",
      sensitivity_categories: [],
      requires_user_initiated: false,
      source_message_ids: ["msg-1"],
      evidence_quote: contentText,
      canonical_key: "key-1",
      event_start_at: "2026-07-13T06:00:00.000Z",
    } as DryRunCandidate["item"],
    dedupe: { decision: "accept" } as DryRunCandidate["dedupe"],
    topic_link: { confidence: 0.9 } as DryRunCandidate["topic_link"],
    status: "accepted_dry_run",
  };
}

Deno.test("write policy: objets rappel rejetés à la persistance (P2-5b, eva R1-B05 / paul R1-B06)", () => {
  // Vocabulaire rappel + horaire (paul B06 item 1 et 2).
  assertEquals(
    decideInitialWriteStatus(candidate(
      "Le 13 juillet 2026 à 8h, un rappel était demandé pour préparer le sac de sport",
    )).reason,
    "reminder_object_state",
  );
  assertEquals(
    decideInitialWriteStatus(candidate(
      "L'utilisateur veut, de façon durable, un rappel tous les matins à 8h",
    )).reason,
    "reminder_object_state",
  );
  // Instruction de rappel reformulée en intention, heure jamais commise
  // (eva B05) — détectée par recouvrement avec l'instruction réelle.
  assertEquals(
    decideInitialWriteStatus(
      candidate(
        "Prévoit de poser son téléphone dans l'entrée le 13/07 à 19h15",
      ),
      {
        reminder_instructions: ["poser son téléphone dans l'entrée"],
      },
    ).reason,
    "reminder_object_state",
  );
});

Deno.test("write policy: les faits de vie datés passent (P2-5b anti-FP)", () => {
  // Fait de vie sans mécanique rappel (le fait légitime du même run eva).
  assertEquals(
    decideInitialWriteStatus(candidate(
      "Commence un nouveau travail le 13 juillet, horaires 9h à 18h",
    )).status !== "reject",
    true,
  );
  // Rendez-vous avec horaire mais aucun recouvrement d'instruction rappel.
  assertEquals(
    decideInitialWriteStatus(
      candidate("A rendez-vous chez le médecin jeudi à 15h30"),
      { reminder_instructions: ["poser son téléphone dans l'entrée"] },
    ).status !== "reject",
    true,
  );
  // Sans horaire, même avec le mot « rappeler » (usage humain).
  assertEquals(
    isReminderObjectItem({
      content_text: "Sa mère lui a rappelé l'anniversaire de son frère",
    }),
    false,
  );
});
