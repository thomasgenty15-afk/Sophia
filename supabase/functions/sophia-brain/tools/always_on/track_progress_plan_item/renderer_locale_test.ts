/**
 * QA agent 6 — LA LANGUE DES TEXTES VISIBLES DE LA LANE `track_progress`.
 *
 * ── LE DÉFAUT QUE CE TEST FIGE ────────────────────────────────────────────
 * Run réel du 2026-08-03, élève KEEL `locale='en-GB'`, message
 * « I had a burger and chips at lunch today, not on my plan. ». Le dispatcher
 * arme un `track_progress_plan_item`, l'exécuteur bloque en `target_missing`
 * (l'élève n'a aucun `plan_commitments` — c'est le modèle 1:N), et le repli de
 * clarification partait en français:
 *
 *     « Je prefere confirmer avant de l'ecrire. »
 *
 * C'est une ligne rouge produit: le produit KEEL est en-GB.
 *
 * ── CE QUE CE FICHIER PROUVE, DANS LES DEUX SENS ──────────────────────────
 *   1. en-GB ⇒ aucun texte visible de cette lane ne contient de français.
 *   2. PRÉMISSE FAUSSE (doctrine P9): fr-FR ⇒ les chaînes sont EXACTEMENT
 *      celles d'avant le correctif, octet pour octet. Le legacy B2C
 *      francophone ne bouge pas — la bascule ne mord que là où le problème
 *      existe. Un correctif qui anglicise tout le monde serait une régression
 *      pour le produit qui paie aujourd'hui.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  renderTrackProgressClarification,
  renderTrackProgressContradictionClarification,
  renderTrackProgressLoggedReply,
} from "./renderer.ts";

const CLARIFY_REASONS = [
  "status_missing",
  "target_ambiguous",
  "intent_implied_weak",
  "ambiguity_present",
  "some_unknown_reason_code",
];

/**
 * Marqueurs français à haute spécificité. Volontairement des chaînes qui
 * n'existent pas en anglais courant, pour que le test échoue sur une fuite
 * réelle et pas sur un mot ambigu.
 */
const FRENCH_MARKERS = [
  "Je prefere",
  "Tu veux",
  "Tu parles",
  "C'est noté",
  "est marqué",
  "n'est pas assez clair",
  "Aujourd'hui,",
  "deja note",
  "je ne peux pas changer ca",
];

function assertNoFrench(text: string, label: string): void {
  for (const marker of FRENCH_MARKERS) {
    assert(
      !text.includes(marker),
      `${label}: fuite française « ${marker} » dans « ${text} »`,
    );
  }
}

const committed = {
  logged_progress_id: "11111111-1111-4111-8111-111111111111",
  target_item_id: "22222222-2222-4222-8222-222222222222",
  target_title: "Evening walk",
  progress_status: "completed",
  value: null,
  retarget_invalidated: false,
  retarget_from_title: null,
  // deno-lint-ignore no-explicit-any
} as any;

Deno.test("en-GB: aucune clarification de la lane ne rend du français", () => {
  for (const reason of CLARIFY_REASONS) {
    assertNoFrench(
      renderTrackProgressClarification(reason, "en-GB"),
      `clarify(${reason})`,
    );
  }
});

Deno.test("en-GB: le repli exact du run réel est en anglais", () => {
  assertEquals(
    renderTrackProgressClarification("ambiguity_present", "en-GB"),
    "I'd rather check with you before I write it down.",
  );
  // `target_missing` est le reason_code observé en réel: il tombe dans la
  // branche par défaut, qui est précisément celle qui fuyait.
  assertEquals(
    renderTrackProgressClarification("target_missing", "en-GB"),
    "I'd rather check with you before I write it down.",
  );
});

Deno.test("en-GB: l'accusé de commit et la contradiction sont en anglais", () => {
  const logged = renderTrackProgressLoggedReply(committed, "en-GB");
  assert(logged !== null);
  assertNoFrench(logged, "logged");

  const retargeted = renderTrackProgressLoggedReply({
    ...committed,
    retarget_invalidated: true,
    retarget_from_title: "Morning walk",
  }, "en-GB");
  assert(retargeted !== null);
  assertNoFrench(retargeted, "logged+retarget");

  assertNoFrench(
    renderTrackProgressContradictionClarification({
      target_title: "Evening walk",
      existing_outcome: "completed",
      requested_status: "missed",
      locale: "en-GB",
    }),
    "contradiction",
  );
});

Deno.test("PRÉMISSE FAUSSE — fr-FR rend exactement les chaînes d'avant", () => {
  assertEquals(
    renderTrackProgressClarification("status_missing", "fr-FR"),
    "Le statut du progres n'est pas assez clair.",
  );
  assertEquals(
    renderTrackProgressClarification("target_ambiguous", "fr-FR"),
    "Tu parles de quel element exactement ?",
  );
  assertEquals(
    renderTrackProgressClarification("intent_implied_weak", "fr-FR"),
    "Tu veux que je le note vraiment ?",
  );
  assertEquals(
    renderTrackProgressClarification("target_missing", "fr-FR"),
    "Je prefere confirmer avant de l'ecrire.",
  );
  assertEquals(
    renderTrackProgressLoggedReply(committed, "fr-FR"),
    "C'est noté : Evening walk est marqué comme fait.",
  );
  assertEquals(
    renderTrackProgressLoggedReply({
      ...committed,
      progress_status: "partial",
    }, "fr-FR"),
    "C'est noté : Evening walk est marqué comme partiel.",
  );
  assertEquals(
    renderTrackProgressLoggedReply({
      ...committed,
      progress_status: "missed",
      retarget_invalidated: true,
      retarget_from_title: "Marche du matin",
    }, "fr-FR"),
    "C'est noté : Evening walk est marqué comme raté — et je l'ai retiré de « Marche du matin ».",
  );
  assertEquals(
    renderTrackProgressContradictionClarification({
      target_title: "Marche du soir",
      existing_outcome: "completed",
      requested_status: "missed",
      locale: "fr-FR",
    }),
    "Aujourd'hui, Marche du soir est deja note comme fait — je ne peux pas changer ca depuis le chat. Si c'est une erreur, tu peux le corriger directement sur cette action dans Dashboard > Plan.",
  );
});

/**
 * UN SEUL PROPRIÉTAIRE DU DÉFAUT, ET C'EST L'APPELANT.
 *
 * Le renderer ne connaît qu'une question: « cette locale est-elle française ? ».
 * Tout ce qui ne l'est pas — y compris une chaîne vide — rend l'anglais. Le
 * défaut produit (`?? 'fr-FR'`, parce que le legacy B2C est francophone) vit
 * chez les appelants, une fois, au bord: `router.ts`, `..._tool.ts`,
 * `direct_effect_gate.ts`. Deux défauts à deux étages divergeraient un jour,
 * et personne ne saurait lequel a rendu le message.
 *
 * La chaîne vide n'est de toute façon pas atteignable en production:
 * `_shared/user_time_context.ts::safeLocale` renvoie déjà 'fr-FR' pour une
 * locale vide, donc `direct_effect_time_context.user_locale` est toujours
 * peuplée. Ce test fige la règle, il ne décrit pas un chemin réel.
 */
Deno.test("le renderer ne connaît qu'une question: français ou non", () => {
  assertEquals(
    renderTrackProgressClarification("target_missing", "fr"),
    "Je prefere confirmer avant de l'ecrire.",
  );
  assertEquals(
    renderTrackProgressClarification("target_missing", "FR-ca"),
    "Je prefere confirmer avant de l'ecrire.",
  );
  assertEquals(
    renderTrackProgressClarification("target_missing", ""),
    "I'd rather check with you before I write it down.",
  );
  assertEquals(
    renderTrackProgressClarification("target_missing", "de-DE"),
    "I'd rather check with you before I write it down.",
  );
});

Deno.test("un commit sans id ne rend rien, quelle que soit la langue", () => {
  assertEquals(renderTrackProgressLoggedReply(null, "en-GB"), null);
  assertEquals(renderTrackProgressLoggedReply(undefined, "fr-FR"), null);
  assertEquals(
    renderTrackProgressLoggedReply({ ...committed, logged_progress_id: null }, "en-GB"),
    null,
  );
});
