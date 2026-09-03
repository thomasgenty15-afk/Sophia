// LE JETON « VOIR » — la seule chose du chat qui n'atteint pas le serveur.
//
// Un bouton de bulle part au serveur; celui-ci est intercepté par `ChatPage` et
// ouvre un écran. Ce fichier tient les quatre points où ce dessin peut céder en
// silence, et TROIS d'entre eux sont des lectures de source: il n'existe pas de
// test de rendu pour cet écran, et un `ChatPage` qui aurait perdu son `if`
// enverrait `KEEL_VIEW_ABOUT_YOU|preferences` au modèle, qui répondrait à une
// chaîne de protocole.
//
//   ① le lecteur est ancré et à vocabulaire fermé (comportement)
//   ② le front et le back disent la même chose de `armsQuestion` (miroir)
//   ③ `ChatPage` intercepte AVANT d'envoyer (source)
//   ④ la carte pose l'ancre que l'adresse vise (source)
//
// ⛔ ② N'EST PAS UN LUXE. Les deux moitiés jugent la même bulle: le serveur
// pour accepter un tap, le front pour afficher un bouton. Un écart se paierait
// en un bouton visible dont le tap répondrait « plus d'actualité ».

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  armsQuestion,
  isNavigationOnly,
  memoryViewHref,
  readMemoryViewToken,
} from "./memoryView";
import { KNOWN_BLOCKS } from "./retainedItems";

const readSource = (path: string): string =>
  readFileSync(resolve(__dirname, path), "utf8");

const CHAT_PAGE = readSource("../pages/ChatPage.tsx");
const KNOWN_PAGE = readSource("../pages/StudentKnownPage.tsx");
const CARD = readSource("../components/KnownAboutYouCard.tsx");
const DENO_TAP = readSource(
  "../../../../supabase/functions/_shared/chat/disarmed_tap.ts",
);
const DENO_CLARIF = readSource(
  "../../../../supabase/functions/_shared/keel/memory_clarification.ts",
);
const DENO_BUTTONS = readSource(
  "../../../../supabase/functions/_shared/chat/deterministic_buttons.ts",
);

describe("① le lecteur du jeton", () => {
  it("rend le bloc d'un jeton bien formé", () => {
    expect(readMemoryViewToken("KEEL_VIEW_ABOUT_YOU|preferences")).toBe(
      "preferences",
    );
    expect(readMemoryViewToken("KEEL_VIEW_ABOUT_YOU|next_plan")).toBe(
      "next_plan",
    );
  });

  it("connaît TOUS les blocs de la carte, pas un sous-ensemble", () => {
    // Un bloc manquant ici serait une bulle dont le bouton ne mène nulle part.
    for (const block of KNOWN_BLOCKS) {
      expect(readMemoryViewToken(`KEEL_VIEW_ABOUT_YOU|${block}`)).toBe(block);
    }
  });

  it("est ANCRÉ: un jeton qui commence pareil n'est pas avalé", () => {
    // Sans l'ancrage, `KEEL_VIEW_ABOUT_YOUR_MOTHER` entrerait ici et sortirait
    // par `slice`, avec un reste que personne n'a écrit.
    expect(readMemoryViewToken("KEEL_VIEW_ABOUT_YOURSELF|preferences")).toBe(
      null,
    );
    expect(readMemoryViewToken("XKEEL_VIEW_ABOUT_YOU|preferences")).toBe(null);
  });

  it("refuse un bloc hors vocabulaire — le bloc finit dans une URL", () => {
    expect(readMemoryViewToken("KEEL_VIEW_ABOUT_YOU|../../admin")).toBe(null);
    expect(readMemoryViewToken("KEEL_VIEW_ABOUT_YOU|")).toBe(null);
    expect(readMemoryViewToken("KEEL_VIEW_ABOUT_YOU|Preferences")).toBe(null);
  });

  it("refuse le vide, le nul et les jetons d'une autre famille", () => {
    expect(readMemoryViewToken(null)).toBe(null);
    expect(readMemoryViewToken(undefined)).toBe(null);
    expect(readMemoryViewToken("")).toBe(null);
    expect(readMemoryViewToken("KEEL_MEMCLAR_PICK|abc|0")).toBe(null);
  });

  it("l'adresse porte le bloc et le jour, et rien d'autre", () => {
    expect(memoryViewHref("preferences", "2026-09-04")).toBe(
      "/app/about-you?focus=preferences&at=2026-09-04",
    );
    // Un jour vide ne fabrique pas un paramètre vide.
    expect(memoryViewHref("notes", "")).toBe("/app/about-you?focus=notes");
  });
});

describe("② le miroir de `armsQuestion`", () => {
  it("une bulle qui ne porte que « Voir » n'arme pas de question", () => {
    expect(armsQuestion([{ payload: "KEEL_VIEW_ABOUT_YOU|preferences" }]))
      .toBe(false);
    expect(isNavigationOnly([{ payload: "KEEL_VIEW_ABOUT_YOU|preferences" }]))
      .toBe(true);
  });

  it("LE CAS QUI PASSE: une vraie question arme", () => {
    // Sans cette assertion, `armsQuestion` pourrait rendre `false` partout et
    // les quatre tests d'à côté resteraient verts.
    expect(armsQuestion([{ payload: "KEEL_MEMCLAR_PICK|abc|0" }])).toBe(true);
    expect(isNavigationOnly([{ payload: "KEEL_MEMCLAR_PICK|abc|0" }]))
      .toBe(false);
  });

  it("une question qui porte AUSSI « Voir » arme quand même", () => {
    expect(
      armsQuestion([
        { payload: "KEEL_MEMCLAR_PICK|abc|0" },
        { payload: "KEEL_VIEW_ABOUT_YOU|preferences" },
      ]),
    ).toBe(true);
  });

  it("aucun bouton, ou un payload vide, n'arme rien", () => {
    expect(armsQuestion([])).toBe(false);
    expect(armsQuestion(null)).toBe(false);
    expect(armsQuestion(undefined)).toBe(false);
    expect(armsQuestion([{ payload: "   " }])).toBe(false);
    expect(isNavigationOnly([])).toBe(false);
  });

  it("le back applique la MÊME règle, et enregistre le préfixe", () => {
    // Miroir de source: les deux runtimes ne peuvent pas s'importer.
    expect(DENO_TAP).toMatch(/export function armsQuestion/);
    expect(DENO_TAP).toMatch(/NAVIGATION_BUTTON_PREFIX/);
    // ⛔ Enregistré SANS lecteur, exprès: une charge `KEEL_VIEW_*` forgée doit
    // tomber dans la garde des charges inutilisables, pas au dispatcher.
    expect(DENO_BUTTONS).toMatch(/NAVIGATION_BUTTON_PREFIX/);
    // Le littéral du préfixe est le même des deux côtés.
    expect(DENO_CLARIF).toMatch(/"KEEL_VIEW_ABOUT_YOU\|"/);
  });
});

describe("③ `ChatPage` intercepte avant d'envoyer", () => {
  it("lit le jeton dans `onButton`, et sort", () => {
    expect(CHAT_PAGE).toMatch(/readMemoryViewToken\(payload\)/);
    expect(CHAT_PAGE).toMatch(/navigate\(memoryViewHref\(/);
  });

  it("l'interception est le PREMIER test de `onButton`", () => {
    // L'ordre est la propriété: un jeton lu après un `startsWith` plus large
    // serait déjà parti au serveur.
    const start = CHAT_PAGE.indexOf("const onButton");
    expect(start).toBeGreaterThan(-1);
    const body = CHAT_PAGE.slice(start, start + 4000);
    const view = body.indexOf("readMemoryViewToken");
    const other = body.indexOf("isWeeklyCheckInToken");
    expect(view).toBeGreaterThan(-1);
    expect(other).toBeGreaterThan(-1);
    expect(view).toBeLessThan(other);
  });

  it("la dernière bulle armée passe par `armsQuestion`", () => {
    // « a des boutons » ferait de la bulle « J'ai noté … · Voir » la dernière
    // armée: elle désarmerait la question qu'elle suit.
    expect(CHAT_PAGE).toMatch(
      /lastAssistantId[\s\S]{0,200}armsQuestion\(m\.buttons\)/,
    );
    expect(CHAT_PAGE).toMatch(/isNavigationOnly\(message\.buttons\)/);
  });
});

describe("④ l'écran vise une ancre qui existe", () => {
  it("la page lit `focus` et `at` dans l'adresse", () => {
    expect(KNOWN_PAGE).toMatch(/useSearchParams/);
    expect(KNOWN_PAGE).toMatch(/params\.get\("focus"\)/);
    expect(KNOWN_PAGE).toMatch(/params\.get\("at"\)/);
    // ⛔ VALIDÉS: ils viennent de la barre d'adresse autant que d'un bouton.
    expect(KNOWN_PAGE).toMatch(/KNOWN_BLOCKS[\s\S]{0,80}includes\(rawFocus\)/);
  });

  it("la carte pose une ancre par bloc — les CINQ", () => {
    for (const block of KNOWN_BLOCKS) {
      expect(CARD).toContain(`id="known-${block}"`);
    }
  });

  it("la carte défile vers l'ancre, et surligne sans filtrer", () => {
    expect(CARD).toMatch(/getElementById\(`known-\$\{props\.focus\}`\)/);
    expect(CARD).toMatch(/scrollIntoView\(\)/);
    // ⚠️ CICATRICE: `behavior:"smooth"` a été mesuré no-op dans ce dépôt.
    expect(CARD).not.toMatch(/scrollIntoView\(\{[^}]*smooth/);
    // Le surlignage s'éteint: le jour est une clé grossière.
    expect(CARD).toMatch(/setFocusLive\(false\), 3000\)/);
  });
});
