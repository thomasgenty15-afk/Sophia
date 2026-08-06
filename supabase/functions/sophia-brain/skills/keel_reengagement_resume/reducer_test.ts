import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  KEEL_REENGAGEMENT_RESUME_INVARIANTS,
  KEEL_REENGAGEMENT_RESUME_MAX_TURNS,
  type KeelReengagementResumeState,
} from "./contract.ts";
import { reduceKeelReengagementResume } from "./reducer.ts";
import {
  KEEL_RESUME_ALL_TEMPLATES,
  KEEL_RESUME_FORBIDDEN_LEXICON,
  renderKeelReengagementResume,
} from "./renderer.ts";

function armed(
  over: Partial<KeelReengagementResumeState> = {},
): KeelReengagementResumeState {
  return {
    version: 1,
    stage: "welcome_back",
    turns_in_flow: 0,
    awaiting_first_reply: true,
    episode_id: "ep-1",
    days_inactive_at_open: 9,
    armed_at: "2026-08-06T10:00:00.000Z",
    ...over,
  };
}

const OK = { userMessage: "ok je reprends", safetyBand: "none" };

Deno.test("le premier tour cadre, et desarme le carve-out de fraicheur", () => {
  const decision = reduceKeelReengagementResume({
    persistedState: armed(),
    ...OK,
  });
  assertEquals(decision.kind, "frame");
  if (decision.kind !== "frame") return;
  assertEquals(decision.next.turns_in_flow, 1);
  // Le carve-out n'existe QUE pour laisser l'eleve repondre des jours apres.
  // Une fois le tour possede, l'etat redevient soumis au staleness ordinaire.
  assertEquals(decision.next.awaiting_first_reply, false);
});

Deno.test("borne a deux tours: le second rend deja la main", () => {
  const second = reduceKeelReengagementResume({
    persistedState: armed({ turns_in_flow: 1, awaiting_first_reply: false }),
    ...OK,
  });
  assertEquals(second.kind, "frame");
  if (second.kind !== "frame") return;
  assertEquals(second.next.stage, "handed_back");
  assertEquals(second.next.turns_in_flow, KEEL_REENGAGEMENT_RESUME_MAX_TURNS);

  const third = reduceKeelReengagementResume({
    persistedState: armed({ turns_in_flow: 2, awaiting_first_reply: false }),
    ...OK,
  });
  assertEquals(third.kind, "hand_back");
  if (third.kind === "hand_back") assertEquals(third.reason, "max_turns");
});

Deno.test("safety prend tout, sur les trois bandes", () => {
  for (const band of ["medium", "high", "critical"]) {
    const decision = reduceKeelReengagementResume({
      persistedState: armed(),
      userMessage: "je vais pas bien du tout",
      safetyBand: band,
    });
    assertEquals(decision.kind, "hand_back", `band ${band}`);
    if (decision.kind === "hand_back") assertEquals(decision.reason, "safety");
  }
});

Deno.test("FAUSSE PREMISSE: une bande basse ne bloque rien", () => {
  // Sans ce cas, « safety rend la main » passerait sur un reducer qui rend
  // TOUJOURS la main. C'est la difference entre une garde et une panne.
  for (const band of ["none", "low"]) {
    const decision = reduceKeelReengagementResume({
      persistedState: armed(),
      ...OK,
      safetyBand: band,
    });
    assertEquals(decision.kind, "frame", `band ${band}`);
  }
});

Deno.test("un etat illisible rend la main, il ne devine pas", () => {
  for (const bad of [null, undefined, {}, { version: 2 }, { version: 1, stage: "x" }]) {
    const decision = reduceKeelReengagementResume({ persistedState: bad, ...OK });
    assertEquals(decision.kind, "hand_back");
    if (decision.kind === "hand_back") {
      assertEquals(decision.reason, "unreadable_state");
    }
  }
});

Deno.test("un message vide n'a rien a cadrer", () => {
  const decision = reduceKeelReengagementResume({
    persistedState: armed(),
    userMessage: "   ",
    safetyBand: "none",
  });
  assertEquals(decision.kind, "hand_back");
  if (decision.kind === "hand_back") assertEquals(decision.reason, "empty_message");
});

Deno.test("AUCUN gabarit ne nomme l'absence, dans les deux langues", () => {
  // La symetrie de `assertNoGuiltTripping`, qui garde deja le message SORTANT.
  // Interdire le reproche a l'aller et le tolerer au retour n'aurait aucun sens.
  for (const template of KEEL_RESUME_ALL_TEMPLATES) {
    const haystack = template.toLowerCase();
    for (const word of KEEL_RESUME_FORBIDDEN_LEXICON) {
      assert(
        !haystack.includes(word),
        `le gabarit « ${template} » contient « ${word} »`,
      );
    }
  }
  assert(KEEL_RESUME_ALL_TEMPLATES.length >= 4, "fr + en, deux stages");
});

Deno.test("le renderer suit la locale resolue par le runtime", () => {
  const fr = renderKeelReengagementResume({
    stage: "welcome_back",
    responseLocale: "fr-FR",
  });
  const en = renderKeelReengagementResume({
    stage: "welcome_back",
    responseLocale: "en-GB",
  });
  assert(fr !== en);
  // Repli anglais sur une locale inconnue: jamais de chaine vide.
  assert(
    renderKeelReengagementResume({ stage: "handed_back", responseLocale: "" })
      .length > 0,
  );
});

Deno.test("les invariants sont nommes, et le test les epingle", () => {
  assertEquals(KEEL_REENGAGEMENT_RESUME_INVARIANTS.length, 5);
});
