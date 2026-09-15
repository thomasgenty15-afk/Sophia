import { assertEquals } from "jsr:@std/assert@1";

import {
  decidePhotoAttachment,
  type InvitedFactCandidate,
  PHOTO_INVITATION_ATTACH_WINDOW_MINUTES,
} from "./photo_invitation_attach.ts";

const PHOTO_AT = new Date("2026-08-08T20:10:00.000Z");

function candidate(
  patch: Partial<InvitedFactCandidate> = {},
): InvitedFactCandidate {
  return {
    eventId: "evt-off-plan",
    invitedAt: "2026-08-08T20:00:00.000Z",
    localDate: "2026-08-08",
    planRelation: "off_plan",
    mediaPath: null,
    source: "chat",
    disqualifiedReason: null,
    ...patch,
  };
}

const NOMINAL = {
  candidate: candidate(),
  photoLocalDate: "2026-08-08",
  photoAt: PHOTO_AT,
  photoIsAMeal: true,
  photoRowIsFresh: true,
  windowMinutes: PHOTO_INVITATION_ATTACH_WINDOW_MINUTES,
};

Deno.test("le cas nominal rattache la photo au fait hors plan invité", () => {
  const decision = decidePhotoAttachment(NOMINAL);
  assertEquals(decision.attach, true);
  assertEquals(decision.reason, "attach");
  if (decision.attach) assertEquals(decision.eventId, "evt-off-plan");
});

Deno.test("sans invitation, la photo reste son propre fait", () => {
  const decision = decidePhotoAttachment({ ...NOMINAL, candidate: null });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "no_invitation");
});

Deno.test("§7 — une photo qui n'est PAS un repas ne se rattache jamais", () => {
  // Le cas du MENU de restaurant. Sans ce refus, sa disqualification tomberait
  // sur la ligne du repas hors plan et la ferait disparaître de la vue du
  // coach: la personne aurait dit la vérité et perdu son repas.
  const decision = decidePhotoAttachment({ ...NOMINAL, photoIsAMeal: false });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "photo_is_not_a_meal");
});

Deno.test("un doublon ou un rejeu ne déplace jamais une ligne antérieure", () => {
  const decision = decidePhotoAttachment({ ...NOMINAL, photoRowIsFresh: false });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "photo_not_fresh");
});

Deno.test("§9 — au-delà de la fenêtre, le rattachement différé reste ouvert", () => {
  const late = new Date(
    Date.parse(NOMINAL.candidate.invitedAt) +
      (PHOTO_INVITATION_ATTACH_WINDOW_MINUTES + 1) * 60000,
  );
  const decision = decidePhotoAttachment({ ...NOMINAL, photoAt: late });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "window_elapsed");
});

Deno.test("la borne exacte de la fenêtre rattache encore", () => {
  const edge = new Date(
    Date.parse(NOMINAL.candidate.invitedAt) +
      PHOTO_INVITATION_ATTACH_WINDOW_MINUTES * 60000,
  );
  assertEquals(decidePhotoAttachment({ ...NOMINAL, photoAt: edge }).attach, true);
});

Deno.test("une invitation dans le FUTUR (horloge décalée) n'ouvre rien", () => {
  const decision = decidePhotoAttachment({
    ...NOMINAL,
    photoAt: new Date("2026-08-08T19:50:00.000Z"),
  });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "window_elapsed");
});

Deno.test("une date invitée illisible ferme au lieu de rattacher au hasard", () => {
  const decision = decidePhotoAttachment({
    ...NOMINAL,
    candidate: candidate({ invitedAt: "pas une date" }),
  });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "window_elapsed");
});

Deno.test("un autre jour local ne se rattache pas, même dans la fenêtre", () => {
  const decision = decidePhotoAttachment({
    ...NOMINAL,
    photoLocalDate: "2026-08-09",
  });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "other_local_day");
});

Deno.test("le fait invité doit être hors plan, et sa relation exacte", () => {
  for (const relation of [null, "", "as_planned"]) {
    const decision = decidePhotoAttachment({
      ...NOMINAL,
      candidate: candidate({ planRelation: relation }),
    });
    assertEquals(decision.attach, false, String(relation));
    assertEquals(decision.reason, "not_off_plan", String(relation));
  }
});

Deno.test("un fait déjà décoché entre-temps ne reçoit pas la photo", () => {
  const decision = decidePhotoAttachment({
    ...NOMINAL,
    candidate: candidate({ disqualifiedReason: "food_not_eaten" }),
  });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "invited_fact_disqualified");
});

Deno.test("une seconde photo ne remplace pas la première", () => {
  const decision = decidePhotoAttachment({
    ...NOMINAL,
    candidate: candidate({ mediaPath: "u/2026-08-08/abc.png" }),
  });
  assertEquals(decision.attach, false);
  assertEquals(decision.reason, "already_has_media");
});

Deno.test("l'ordre des refus: pas de repas gagne sur tout le reste", () => {
  const decision = decidePhotoAttachment({
    ...NOMINAL,
    photoIsAMeal: false,
    photoRowIsFresh: false,
    photoLocalDate: "2026-08-09",
    candidate: candidate({ planRelation: null, mediaPath: "x" }),
  });
  assertEquals(decision.reason, "photo_is_not_a_meal");
});
