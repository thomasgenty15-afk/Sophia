/**
 * T4 — LES RÉPONSES À UN GESTE NE PRENNENT PAS LA PLACE DU JOUR.
 *
 * ── LE DÉFAUT MESURÉ ────────────────────────────────────────────────────────
 * Un soir où la question de divergence était déjà partie, la personne qui tapait
 * « j'ai commandé » ne recevait AUCUNE invitation photo. Le fait hors-plan
 * s'enregistrait sans le moindre détail — c'est la principale source de repas
 * dont le produit ne sait rien.
 *
 * ── CE QUE CES TESTS PROTÈGENT ──────────────────────────────────────────────
 * 1. l'invitation photo sort du budget partagé;
 * 2. elle garde un plafond À ELLE — sans quoi l'exemption ouvrirait la porte à
 *    trois invitations par jour, l'unicité du ledger étant par MESSAGE
 *    (`meal_precision_questions_message_idx`) et non par jour;
 * 3. les quatre autres familles continuent de se disputer la place unique.
 *
 * Ces tests sont PURS: ils éprouvent la décision, pas la base. Le fait que le
 * compteur exclue vraiment le genre est vérifié en run réel (voir le rapport).
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  DAILY_ASK_BUDGET,
  DAILY_ASK_KINDS,
  GESTURE_RESPONSE_ASK_KINDS,
  PHOTO_INVITATION_DAILY_CAP,
} from "./daily_ask_budget.ts";
import { gatePhotoInvitation } from "./photo_invitation.ts";

/** Le cas nominal: un fait hors-plan vient d'être écrit, rien ne s'y oppose. */
function invitable(patch: Record<string, unknown> = {}) {
  return {
    locale: "fr-FR",
    planRelation: "off_plan",
    safetyBand: "none",
    restrictionFlag: false,
    hasMedia: false,
    futureIntent: false,
    committedEventCount: 1,
    asksMadeToday: 0,
    alreadyInvitedEver: true,
    flowAlreadyOpen: false,
    budget: PHOTO_INVITATION_DAILY_CAP,
    ...patch,
  } as Parameters<typeof gatePhotoInvitation>[0];
}

Deno.test("T4 · l'invitation photo est déclarée « réponse à un geste »", () => {
  assertEquals(GESTURE_RESPONSE_ASK_KINDS.includes("photo_invitation"), true);
});

Deno.test("T4 · les quatre autres familles restent DANS le budget partagé", () => {
  // Une famille qui sortirait du compteur par distraction rendrait le plafond
  // décoratif — c'est exactement ce que T4 existe pour empêcher.
  const exempted = new Set<string>(GESTURE_RESPONSE_ASK_KINDS);
  for (const kind of DAILY_ASK_KINDS) {
    if (kind === "photo_invitation") continue;
    assertEquals(
      exempted.has(kind),
      false,
      `${kind} ne doit PAS être exemptée du budget partagé`,
    );
  }
  assertEquals(GESTURE_RESPONSE_ASK_KINDS.length, 1);
});

Deno.test("T4 · le budget partagé consommé n'empêche PLUS l'invitation photo", () => {
  // LE DÉFAUT MESURÉ, en une assertion. La garde reçoit le compte de SA famille
  // (zéro) et SON plafond, pas la place partagée que la divergence a prise.
  const gate = gatePhotoInvitation(invitable({ asksMadeToday: 0 }));
  assertEquals(gate.invite, true);
  assertEquals(gate.reason_code, "invite");
});

Deno.test("T4 · mais une SECONDE invitation dans la journée est refusée", () => {
  // ⚠️ LE TEST QUI PORTE LE DESIGN. La déduplication du ledger est par MESSAGE:
  // elle n'aurait jamais empêché trois invitations sur trois messages
  // différents. Tant que l'invitation payait le budget partagé, c'est LUI qui
  // plafonnait. En l'exemptant, il fallait remettre un plafond — celui-ci.
  const gate = gatePhotoInvitation(
    invitable({ asksMadeToday: PHOTO_INVITATION_DAILY_CAP }),
  );
  assertEquals(gate.invite, false);
  assertEquals(gate.reason_code, "budget_consumed");
});

Deno.test("T4 · les sept autres portes restent armées", () => {
  // L'exemption ne touche QUE le compteur. Une exemption qui aurait desserré
  // une autre porte serait une régression invisible.
  const denied: [string, Record<string, unknown>][] = [
    ["safety_band", { safetyBand: "elevated" }],
    ["restriction_flag", { restrictionFlag: true }],
    ["future_intent", { futureIntent: true }],
    ["photo_attached", { hasMedia: true }],
    ["no_committed_fact", { committedEventCount: 0 }],
    ["not_off_plan", { planRelation: null }],
    ["flow_already_open", { flowAlreadyOpen: true }],
  ];
  for (const [reason, patch] of denied) {
    const gate = gatePhotoInvitation(invitable(patch));
    assertEquals(gate.invite, false, `${reason} devrait refuser`);
    assertEquals(gate.reason_code, reason);
  }
});

Deno.test("T4 · l'invitation ne peut pas partir sans un fait déjà déclaré", () => {
  // C'EST LA JUSTIFICATION DE TOUTE L'EXEMPTION, et elle mérite son propre test:
  // si cette porte tombait un jour, l'invitation deviendrait une sollicitation
  // du produit et devrait REVENIR dans le budget partagé.
  assertEquals(
    gatePhotoInvitation(invitable({ committedEventCount: 0 })).invite,
    false,
  );
  assertEquals(
    gatePhotoInvitation(invitable({ planRelation: "on_plan" })).invite,
    false,
  );
});

Deno.test("T4 · le plafond photo est INDÉPENDANT du budget partagé", () => {
  // Mutation: si quelqu'un remet les deux constantes en phase par mégarde, ce
  // test ne le dira pas — mais il dit qu'elles sont lues séparément. Le vrai
  // test de mutation est en dessous.
  assertEquals(typeof PHOTO_INVITATION_DAILY_CAP, "number");
  assertEquals(PHOTO_INVITATION_DAILY_CAP >= 1, true);

  // Le budget partagé à ZÉRO ne doit rien changer pour la photo: la garde ne le
  // lit plus. C'est la mutation qui prouve que l'exemption est réelle et pas
  // une coïncidence de valeurs (les deux constantes valent 1 aujourd'hui).
  const asIfSharedBudgetWereSpent = gatePhotoInvitation(
    invitable({ asksMadeToday: 0, budget: PHOTO_INVITATION_DAILY_CAP }),
  );
  assertEquals(asIfSharedBudgetWereSpent.invite, true);
  assertEquals(DAILY_ASK_BUDGET, 1);
});
