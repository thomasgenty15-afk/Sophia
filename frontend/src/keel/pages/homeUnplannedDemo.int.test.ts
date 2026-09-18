import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import ConversationExample from "../components/home/ConversationExample";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

describe("dans cette section, c’est SOPHIA qui écrit la première", () => {
  // ⛔ LE SENS DE LA SECTION TIENT À ÇA. Elle a montré, jusqu'au 2026-09-18, une
  // question POSÉE à Sophia et sa réponse: l'écran disait alors l'inverse de son
  // titre. Les trois bulles gardées ici sont les trois canaux qui partent
  // vraiment (`keel-proactive-v1`: thaw_reminder, weigh_in, slot_meal). Une
  // quatrième bulle inventée serait une promesse sans expéditeur — c'est la
  // règle du modèle: aucune copie ne fait attendre un message qui n'existe pas.
  const BUBBLES = [
    "home.reach.bubble.thaw",
    "home.reach.bubble.weigh",
    "home.reach.bubble.slot",
  ] as const;

  for (const [path, messages] of [["/", fr], ["/en", en]] as const) {
    it(`montre les trois messages proactifs, et aucun message de l’utilisateur sur ${path}`, () => {
      Object.defineProperty(globalThis, "location", {
        value: { pathname: path, search: "", href: `http://localhost${path}` },
        configurable: true,
      });
      const html = renderToStaticMarkup(createElement(ConversationExample));
      for (const key of BUBBLES) expect(html, key).toContain(messages[key]);
      // le moment de chaque message est dit — une bulle sans son moment ne
      // prouve pas qu'elle arrive au bon moment, qui est ce que la page vend.
      for (const key of ["home.reach.thaw.title", "home.reach.weigh.title", "home.reach.slot.title"] as const) {
        expect(html, key).toContain(messages[key]);
      }
    });
  }
});

describe("l’échange de la landing est une illustration, pas un chat", () => {
  for (const [path, messages] of [["/", fr], ["/en", en]] as const) {
    it(`identifie l’exemple et n’offre aucun faux contrôle sur ${path}`, () => {
      Object.defineProperty(globalThis, "location", {
        value: { pathname: path, search: "", href: `http://localhost${path}` },
        configurable: true,
      });
      const html = renderToStaticMarkup(createElement(ConversationExample));
      expect(html).toContain(`<figcaption`);
      expect(html).toContain(messages["home.reach.example_note"]);
      expect(html).not.toMatch(/<(button|input|textarea|form)\b/);
      expect(html).not.toMatch(/\bhome\.[a-z_.]+\b/);
    });
  }
});
