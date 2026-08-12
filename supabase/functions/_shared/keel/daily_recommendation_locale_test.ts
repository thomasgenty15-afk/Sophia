/**
 * FF-028 — L'ACCUSÉ PARLE LA LANGUE DE L'ÉLÈVE.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE AU LIEU D'ÊTRE DANS `daily_recommendation_test.ts`:
 * ce dernier était ouvert par une autre session au moment du correctif. Ces
 * assertions lui appartiennent naturellement et pourront y être repliées quand il
 * sera libre — en même temps que le renommage de `appliedAck` en `appliedAckEn`,
 * qui est le vrai correctif structurel (il ferait casser le typecheck chez tout
 * lecteur qui prend l'anglais sans le vouloir).
 *
 * ── LE DÉFAUT MESURÉ ────────────────────────────────────────────────────────
 * Run réel `ff056-t6-run3`, 2026-08-12. Une élève `fr-FR` nomme son créneau en
 * français, lit une proposition en français, tape « Oui, on l'ajoute » — et
 * reçoit:
 *
 *   « Done — breakfast is part of your rhythm now, and the next week you put
 *     together will have one. »
 *
 * Le handler de FF-028 avait `isFrenchLocale` importé, s'en servait deux
 * fonctions plus bas, et ne s'en servait pas pour l'accusé. Instance de la
 * cicatrice `reply-language-ignores-voice-language`.
 */
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  RECOMMENDATION_ACTIONS,
  recommendationAck,
} from "./daily_recommendation.ts";

Deno.test("FF-028 · chaque action porte SES DEUX langues, non vides", () => {
  // Un champ de langue vide est une langue oubliée. Le type les rend requis;
  // ce test vérifie qu'ils ne sont pas requis-mais-vides.
  for (const action of RECOMMENDATION_ACTIONS) {
    for (
      const [label, value] of [
        ["appliedAck", action.appliedAck],
        ["declinedAck", action.declinedAck],
        ["appliedAckFr", action.appliedAckFr],
        ["declinedAckFr", action.declinedAckFr],
      ] as const
    ) {
      assertNotEquals(value.trim(), "", `${action.id}.${label} est vide`);
    }
  }
});

Deno.test("FF-028 · le français n'est PAS une copie de l'anglais", () => {
  // La façon la plus discrète de « traduire » est de recopier. Elle passerait le
  // test précédent et laisserait le défaut intact.
  for (const action of RECOMMENDATION_ACTIONS) {
    assertNotEquals(
      action.appliedAckFr,
      action.appliedAck,
      `${action.id}: l'accusé FR est identique à l'anglais`,
    );
    assertNotEquals(
      action.declinedAckFr,
      action.declinedAck,
      `${action.id}: le refus FR est identique à l'anglais`,
    );
  }
});

Deno.test("FF-028 · `recommendationAck` choisit la langue ET le genre d'accusé", () => {
  for (const action of RECOMMENDATION_ACTIONS) {
    assertEquals(
      recommendationAck(action, "fr", "applied"),
      action.appliedAckFr,
      `${action.id} fr/applied`,
    );
    assertEquals(
      recommendationAck(action, "en", "applied"),
      action.appliedAck,
      `${action.id} en/applied`,
    );
    assertEquals(
      recommendationAck(action, "fr", "declined"),
      action.declinedAckFr,
      `${action.id} fr/declined`,
    );
    assertEquals(
      recommendationAck(action, "en", "declined"),
      action.declinedAck,
      `${action.id} en/declined`,
    );
  }
});

Deno.test("FF-028 · aucun accusé ne porte de chiffre, dans aucune langue", () => {
  // R11 du domaine voisin et la règle de ce module: aucun nombre, aucune unité,
  // aucun décompte. Une traduction est exactement l'endroit où un « 1 » se
  // glisse (« 1 petit-déjeuner »).
  for (const action of RECOMMENDATION_ACTIONS) {
    for (const language of ["fr", "en"] as const) {
      for (const kind of ["applied", "declined"] as const) {
        const text = recommendationAck(action, language, kind);
        assertEquals(
          /\d/.test(text),
          false,
          `${action.id} ${language}/${kind} porte un chiffre: ${text}`,
        );
      }
    }
  }
});
