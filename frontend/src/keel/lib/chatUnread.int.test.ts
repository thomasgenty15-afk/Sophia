// CE QUI AVERTIT QU'UN MESSAGE EST ARRIVÉ — les règles, sans navigateur.
//
// En sortant de WhatsApp, on a gardé le message et perdu l'avertissement: la
// livraison est une écriture + Realtime, et Realtime ne peint que l'onglet
// ouvert. Les trois boucles proactives partaient donc vers un écran que
// personne ne regardait.
//
// Les deux règles ci-dessous sont sorties du gestionnaire d'événement pour la
// même raison que la fusion de liste avant elles: leurs conditions dépendent de
// `document.hidden`, d'une permission navigateur et d'un état React, c'est-à-
// dire de trois choses qu'un test n'a pas. Enfouies, elles n'auraient été
// éprouvées qu'à la main — et « à la main » veut dire « une fois, le jour où on
// les a écrites ».

import { describe, expect, it } from "vitest";

import {
  nextUnreadCount,
  notificationBody,
  shouldRaiseDesktopNotification,
} from "./chatUnread";

describe("nextUnreadCount", () => {
  it("un message de Sophia, onglet ailleurs, incrémente", () => {
    expect(
      nextUnreadCount({
        current: 2,
        message: { role: "assistant" },
        conversationVisible: false,
      }),
    ).toBe(3);
  });

  it("un message de Sophia LU SOUS LES YEUX n'incrémente pas", () => {
    // Le cas qui produirait un badge qu'on ne peut pas faire retomber: le
    // message est arrivé pendant que la bulle était à l'écran, donc il est lu.
    // Sans cette branche, l'élève verrait « 1 non lu » sur une conversation
    // qu'il est en train de lire, et seul un changement d'écran l'effacerait.
    expect(
      nextUnreadCount({
        current: 0,
        message: { role: "assistant" },
        conversationVisible: true,
      }),
    ).toBe(0);
  });

  it("ses propres messages ne comptent jamais", () => {
    // Realtime rend TOUS les INSERT de la table, y compris l'écho de ce que
    // l'élève vient d'écrire. Compter ça ferait monter le badge à chaque envoi.
    expect(
      nextUnreadCount({
        current: 1,
        message: { role: "user" },
        conversationVisible: false,
      }),
    ).toBe(1);
  });
});

describe("shouldRaiseDesktopNotification", () => {
  const base = {
    proactive: true,
    documentHidden: true,
    optedIn: true,
    permission: "granted" as const,
  };

  it("les quatre conditions réunies notifient", () => {
    expect(shouldRaiseDesktopNotification(base)).toBe(true);
  });

  it("une RÉPONSE ne notifie jamais", () => {
    // C'est la condition qui porte le sens produit: notifier quelqu'un de la
    // réponse qu'il vient de demander est le bruit qui apprend à ignorer les
    // notifications — et donc ce qui ferait rater la seule qui compte, la
    // relance après un silence.
    expect(shouldRaiseDesktopNotification({ ...base, proactive: false }))
      .toBe(false);
  });

  it("onglet au premier plan: le badge suffit", () => {
    expect(shouldRaiseDesktopNotification({ ...base, documentHidden: false }))
      .toBe(false);
  });

  it("sans opt-in explicite, rien ne part", () => {
    expect(shouldRaiseDesktopNotification({ ...base, optedIn: false }))
      .toBe(false);
  });

  it("permission accordée requise — `default` ne suffit pas", () => {
    // `default` veut dire « on n'a pas demandé ». Traiter ça comme un oui
    // ferait lever une notification qui échoue silencieusement, et l'opt-in
    // paraîtrait cassé sans qu'aucune erreur n'existe nulle part.
    expect(shouldRaiseDesktopNotification({ ...base, permission: "default" }))
      .toBe(false);
    expect(shouldRaiseDesktopNotification({ ...base, permission: "denied" }))
      .toBe(false);
  });
});

describe("notificationBody", () => {
  it("passe un message court tel quel", () => {
    expect(notificationBody("How was today?")).toBe("How was today?");
  });

  it("aplatit les retours à la ligne", () => {
    expect(notificationBody("Two minutes\n\non the week?")).toBe(
      "Two minutes on the week?",
    );
  });

  it("coupe un message long sans dépasser la limite", () => {
    const out = notificationBody("a".repeat(400), 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("…")).toBe(true);
  });
});
