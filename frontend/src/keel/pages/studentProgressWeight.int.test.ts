import { describe, expect, it } from "vitest";

import { displayWeights, type ReviewRow } from "./StudentProgressPage";

/**
 * Le lien écrivain → lecteur du poids.
 *
 * Le point du dimanche (WhatsApp Flow, C4) écrit dans
 * `weekly_reviews.biofeedback.weight_kg`. Cet écran lisait
 * `outcomes.weight_7d_avg`, que personne n'alimente dans le modèle
 * masterclasse: la carte « Your weight » restait vide pour toujours, et disait
 * à l'élève « You enter it in the Sunday check-in » juste après qu'il l'y ait
 * saisi. Un test de composant ne l'aurait pas vu — il faut nommer le CHAMP.
 */
describe("progress — d'où vient le poids affiché", () => {
  const row = (over: Partial<ReviewRow>): ReviewRow => ({
    week_start_date: "2026-08-03",
    outcomes: null,
    biofeedback: null,
    ...over,
  });

  it("lit le poids écrit par le point du dimanche", () => {
    expect(
      displayWeights([row({ biofeedback: { energy: 4, weight_kg: 78.4, source: "whatsapp_flow" } })]),
    ).toEqual([78.4]);
  });

  it("PRÉMISSE FAUSSE — le chemin 1:1 garde son outcomes.weight_7d_avg", () => {
    // Le repli ne doit pas être supprimé au passage: les deux modèles vivent
    // dans la même table, et l'élève 1:1 n'a pas de Flow.
    expect(displayWeights([row({ outcomes: { weight_7d_avg: 80.2 } })])).toEqual([80.2]);
  });

  it("le point du dimanche prime sur le repli quand les deux sont là", () => {
    expect(
      displayWeights([row({ biofeedback: { weight_kg: 78.4 }, outcomes: { weight_7d_avg: 80.2 } })]),
    ).toEqual([78.4]);
  });

  it("une semaine sans pesée n'invente rien et ne casse pas la série", () => {
    // La vivabilité n'est pas l'otage d'une balance: une semaine remplie sans
    // poids reste une semaine valide, et elle ne doit pas produire un NaN qui
    // s'afficherait comme un chiffre.
    const weights = displayWeights([
      row({ biofeedback: { weight_kg: 78.4 } }),
      row({ week_start_date: "2026-08-10", biofeedback: { energy: 3 } }),
      row({ week_start_date: "2026-08-17", biofeedback: { weight_kg: 77.9 } }),
    ]);
    expect(weights).toEqual([78.4, 77.9]);
    expect(weights.some((n) => Number.isNaN(n))).toBe(false);
  });

  it("aucune période sans donnée ne produit de poids", () => {
    expect(displayWeights([])).toEqual([]);
    expect(displayWeights([row({})])).toEqual([]);
  });
});
