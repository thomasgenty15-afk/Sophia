import { describe, expect, it } from "vitest";

import {
  BROADCAST_MAX_CHARS,
  broadcastGate,
  type BroadcastState,
  formatNextWindow,
} from "./coachBroadcast";

const state = (over: Partial<BroadcastState> = {}): BroadcastState => ({
  recipients: 12,
  canSendNow: true,
  nextWindowOpensAt: null,
  last: null,
  ...over,
});

describe("broadcastGate", () => {
  it("une cohorte, une fenêtre ouverte, un texte: le bouton s'ouvre", () => {
    expect(broadcastGate(state(), "Look at your breakfasts.")).toBeNull();
  });

  // L'ORDRE DES REFUS EST LE CONTRAT. Un coach sans élève ne doit pas d'abord
  // apprendre que son texte est vide: il apprend ce qu'il ne peut pas corriger
  // en réécrivant.
  it("sans élève, le motif est l'absence de cohorte — même sur un brouillon vide", () => {
    expect(broadcastGate(state({ recipients: 0 }), "")).toBe("no_recipients");
  });

  it("la cadence prime sur le contenu", () => {
    expect(broadcastGate(state({ canSendNow: false }), "")).toBe("already_sent_this_week");
  });

  it("un brouillon de blancs compte comme vide", () => {
    expect(broadcastGate(state(), "   \n  ")).toBe("empty_body");
  });

  it("le plafond mord sur le texte détouré, pas sur la saisie brute", () => {
    const justFits = " ".repeat(20) + "x".repeat(BROADCAST_MAX_CHARS) + " ".repeat(20);
    expect(broadcastGate(state(), justFits)).toBeNull();
    expect(broadcastGate(state(), "x".repeat(BROADCAST_MAX_CHARS + 1))).toBe("body_too_long");
  });

  // L'état non chargé n'est pas « tout va bien ». Rendre le bouton ouvert sur
  // un état inconnu ferait cliquer sur un envoi que la base refusera.
  it("un état absent ferme le bouton", () => {
    expect(broadcastGate(null, "Anything")).toBe("no_recipients");
  });
});

describe("formatNextWindow", () => {
  it("rend une date lisible", () => {
    expect(formatNextWindow("2026-08-10T00:00:00Z")).toBe("10 August 2026");
  });

  it("rien à annoncer quand il n'y a rien", () => {
    expect(formatNextWindow(null)).toBeNull();
    expect(formatNextWindow("pas une date")).toBeNull();
  });
});
