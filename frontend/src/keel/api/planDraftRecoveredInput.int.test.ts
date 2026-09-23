import { describe, expect, it } from "vitest";
import { readComposeInput, windowFromToday } from "./planDraft";

/**
 * ⟳ 2026-09-22 — L'APERÇU REPRIS RECOMPOSE SA DEMANDE, ET PART D'AUJOURD'HUI.
 *
 * Mesuré à 00:00:19 : « Ajuster le plan » sur un aperçu repris après
 * rechargement partait avec `draftInput()` de la page — la fenêtre suivante
 * sur un brouillon qui remplaçait le plan courant (composé, faux), ou un
 * « aujourd'hui » calculé la veille et refusé `bad_window` par le serveur
 * (« start in the past »). La ligne porte la demande ; c'est elle qu'on relit.
 */
const BODY = {
  operation: "compose",
  window: { kind: "exact", starts_on: "2026-09-21", duration_days: 5 },
  intent: "draft",
  replaces: "64abd449-e852-4d08-acc1-02446edba356",
  context: null,
  cooking_shape: null,
  one_cooking_session: true,
  preferences: null,
  origin: "plan",
};

describe("readComposeInput — la demande relue dans `request_body`", () => {
  it("relit la fenêtre exacte, le mode, la session unique, l'origine", () => {
    expect(readComposeInput(BODY)).toEqual({
      window: { kind: "exact", startsOn: "2026-09-21", durationDays: 5 },
      cookingShape: null,
      oneCookingSession: true,
      context: null,
      preferences: null,
      origin: "plan",
    });
  });
  it("un mode de cuisson connu passe, un inconnu vaut `null` ; une origine absente vaut `plan`", () => {
    expect(readComposeInput({ ...BODY, cooking_shape: "one_session", origin: undefined })).toMatchObject({
      cookingShape: "one_session",
      origin: "plan",
    });
    expect(readComposeInput({ ...BODY, cooking_shape: "wok" })?.cookingShape).toBe(null);
    expect(readComposeInput({ ...BODY, origin: "setup" })?.origin).toBe("setup");
  });
  it("les deux autres formes de fenêtre passent telles quelles", () => {
    expect(readComposeInput({ ...BODY, window: { kind: "days", count: 3 } })?.window).toEqual({ kind: "days", count: 3 });
    expect(readComposeInput({ ...BODY, window: { kind: "until_sunday" } })?.window).toEqual({ kind: "until_sunday" });
  });
  it("⛔ sans fenêtre lisible, `null` — la page repart de sa propre entrée, jamais d'une demande inventée", () => {
    expect(readComposeInput(null)).toBe(null);
    expect(readComposeInput({})).toBe(null);
    expect(readComposeInput({ ...BODY, window: { kind: "exact", starts_on: "hier", duration_days: 5 } })).toBe(null);
    expect(readComposeInput({ ...BODY, window: { kind: "exact", starts_on: "2026-09-21", duration_days: 0 } })).toBe(null);
    expect(readComposeInput({ ...BODY, window: { kind: "days", count: 0 } })).toBe(null);
  });
});

describe("windowFromToday — une recomposition part d'aujourd'hui", () => {
  const input = readComposeInput(BODY)!;
  it("une fenêtre qui a commencé hier avance d'un jour et perd ce jour", () => {
    expect(windowFromToday(input, "2026-09-22").window).toEqual({ kind: "exact", startsOn: "2026-09-22", durationDays: 4 });
    expect(windowFromToday(input, "2026-09-24").window).toEqual({ kind: "exact", startsOn: "2026-09-24", durationDays: 2 });
  });
  it("une fenêtre d'aujourd'hui ou de demain ne bouge pas, ni les deux autres formes", () => {
    expect(windowFromToday(input, "2026-09-21")).toBe(input);
    expect(windowFromToday(input, "2026-09-20")).toBe(input);
    const days = readComposeInput({ ...BODY, window: { kind: "days", count: 3 } })!;
    expect(windowFromToday(days, "2026-09-30")).toBe(days);
  });
  it("⛔ une fenêtre entièrement passée n'est pas touchée : le refus du serveur est le bon", () => {
    expect(windowFromToday(input, "2026-09-26")).toBe(input);
    expect(windowFromToday(input, "2026-10-01")).toBe(input);
  });
  it("le reste de la demande traverse intact", () => {
    const out = windowFromToday(input, "2026-09-22");
    expect({ ...out, window: null }).toEqual({ ...input, window: null });
  });
});
