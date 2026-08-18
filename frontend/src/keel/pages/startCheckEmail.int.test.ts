// KEEL — L'ÉCRAN « VÉRIFIE TES MAILS », QU'AUCUN POSTE DE DEV NE MONTRE.
//
// ── CE QUI N'ÉTAIT VÉRIFIÉ PAR RIEN ────────────────────────────────────────
// `supabase/config.toml` porte `enable_confirmations = false` en local: `signUp`
// y ouvre toujours une session, donc la phase `check_email` de `/start` ne se
// joue JAMAIS ici. Ni un parcours navigateur, ni un E2E, ni une relecture ne
// pouvaient l'attraper — seule la lecture du code disait ce qu'elle affiche, et
// une lecture n'est pas une vérification.
//
// La DÉCISION qui y mène est testée à côté (`api/freeSignup.int.test.ts`, table
// de vérité de `signUpOutcome`). Ce fichier-ci tient l'autre moitié: ce que
// l'écran AFFICHE une fois qu'on y est.
//
// ── ET DANS LES DEUX LANGUES ───────────────────────────────────────────────
// Cicatrice du dépôt: une garde testée dans une seule langue ne dit rien de
// l'autre. `/start` est traduite depuis le 2026-08-12, donc cet écran a deux
// versions, et les deux doivent tenir — celle qu'on lit le moins est justement
// celle où une clé oubliée passerait inaperçue.
//
// `createElement` + `renderToStaticMarkup`: ce dépôt n'a ni jsdom ni
// testing-library, et le glob partagé est `src/**/*.int.test.ts`. Même patron
// que `components/weeklyCheckInDialog.int.test.ts`.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CheckEmailScreen } from "./StartPage";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

/** `uiLocale()` lit le chemin courant: la langue d'une page dépend de la page. */
function renderAt(pathname: string): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname, search: "", href: `http://localhost${pathname}` },
    configurable: true,
    writable: true,
  });
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [pathname] },
      createElement(CheckEmailScreen, null),
    ),
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

/** L'échappement de React, pour retrouver une apostrophe dans le markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

describe("/start — l'écran de confirmation d'e-mail", () => {
  it("affiche le titre et le corps de `start.check_email.*` en anglais", () => {
    setChosenUiLocaleForTest("en");
    const markup = renderAt("/start");
    expect(markup).toContain(escapeHtml(en["start.check_email.title"]));
    expect(markup).toContain(escapeHtml(en["start.check_email.body"]));
  });

  it("affiche les mêmes deux clés en français", () => {
    setChosenUiLocaleForTest("fr");
    const markup = renderAt("/start");
    expect(markup).toContain(escapeHtml(fr["start.check_email.title"]));
    expect(markup).toContain(escapeHtml(fr["start.check_email.body"]));
  });

  it("dit que le compte est DÉJÀ rattaché, pas qu'il le sera", () => {
    // Ce n'est pas du confort de formulation. `handle_new_user()` rattache dans
    // la TRANSACTION du signup, pas à l'ouverture de la boîte mail: un texte qui
    // promettrait « on terminera quand tu reviendras » laisserait croire qu'un
    // mail non ouvert coûte le rattachement, ce qui est faux dans les deux sens
    // — il est déjà fait, et le mail ne sert qu'à ouvrir la session.
    //
    // Épinglé sur le SEED plutôt que sur une phrase écrite ici: c'est le texte
    // réellement affiché qu'on garde, pas une copie qui divergerait de lui.
    expect(en["start.check_email.body"]).toMatch(/already attached/i);
    expect(fr["start.check_email.body"]).toMatch(/déjà rattaché/i);
  });

  it("ne rend aucun bouton: il n'y a rien à faire ici, et c'est voulu", () => {
    // La suite se passe dans la boîte mail. Un bouton sur cet écran ne pourrait
    // que renvoyer vers un endroit où la session n'existe pas encore.
    setChosenUiLocaleForTest("en");
    const markup = renderAt("/start");
    const body = markup.slice(markup.indexOf("<main"));
    expect(body).not.toContain("<button");
  });
});
