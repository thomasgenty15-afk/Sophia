// LA QUESTION OUVERTE, ET LES QUESTIONS QU'ON LAISSE PARTIR — sans navigateur.
//
// Les deux règles décident de ce que le fil montre. Enfouies dans le rendu de
// `ChatPage`, elles n'auraient été éprouvées qu'à la main.

import { describe, expect, it } from "vitest";

import {
  openQuestionId,
  type ThreadMessage,
  unansweredSupersededIds,
} from "./chatQuestions";

const ask = (id: string, proactive = true): ThreadMessage => ({
  id,
  role: "assistant",
  proactive,
  buttons: [{ payload: `KEEL_SLOTMEAL_skip|2026-09-25|lunch` }],
});
const view = (id: string): ThreadMessage => ({
  id,
  role: "assistant",
  proactive: false,
  buttons: [{ payload: "KEEL_VIEW_ABOUT_YOU|preferences" }],
});
const said = (id: string): ThreadMessage => ({ id, role: "user", buttons: [] });
const told = (id: string): ThreadMessage => ({
  id,
  role: "assistant",
  proactive: false,
  buttons: [],
});

describe("① la question ouverte", () => {
  it("la dernière question sans réponse est ouverte", () => {
    expect(openQuestionId([said("u1"), told("a1"), ask("q1")])).toBe("q1");
  });

  it("un message de la personne après la question la ferme", () => {
    expect(openQuestionId([ask("q1"), said("u1")])).toBeNull();
  });

  it("un accusé ou un « Voir » après la question ne la ferme pas", () => {
    expect(openQuestionId([ask("q1"), told("a1"), view("v1")])).toBe("q1");
  });

  it("sans question, rien n'est ouvert", () => {
    expect(openQuestionId([said("u1"), told("a1"), view("v1")])).toBeNull();
    expect(openQuestionId([])).toBeNull();
  });
});

describe("② les questions proactives sans réponse s'effacent", () => {
  it("trente questions ignorées: seule la dernière reste", () => {
    const thread = Array.from({ length: 30 }, (_, i) => ask(`q${i}`));
    const hidden = unansweredSupersededIds(thread);
    expect(hidden.size).toBe(29);
    expect(hidden.has("q29")).toBe(false);
  });

  it("une question répondue reste dans le fil", () => {
    const hidden = unansweredSupersededIds([ask("q1"), said("u1"), ask("q2")]);
    expect([...hidden]).toEqual([]);
  });

  it("la réponse ne protège QUE la question qui la précède", () => {
    const hidden = unansweredSupersededIds([
      ask("q1"),
      said("u1"),
      ask("q2"),
      ask("q3"),
    ]);
    expect([...hidden]).toEqual(["q2"]);
  });

  it("un accusé sans question ne remplace rien: la dernière question reste", () => {
    expect([...unansweredSupersededIds([ask("q1"), told("a1")])]).toEqual([]);
  });

  it("« Voir » ne remplace pas une question, et ne s'efface jamais", () => {
    expect([...unansweredSupersededIds([ask("q1"), view("v1")])]).toEqual([]);
    expect([...unansweredSupersededIds([view("v1"), ask("q1")])]).toEqual([]);
  });

  it("⛔ une question qui RÉPOND à la personne n'est jamais effacée", () => {
    // Elle suit un message de la personne; l'effacer laisserait ce message
    // sans sa réponse.
    const hidden = unansweredSupersededIds([
      said("u1"),
      ask("r1", false),
      ask("q2"),
    ]);
    expect([...hidden]).toEqual([]);
  });
});
