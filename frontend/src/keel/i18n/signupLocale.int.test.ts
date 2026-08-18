// KEEL — `signupProfileLocale`, et la frontière qu'elle traversait.
//
// ⚠️ CE FICHIER A PERDU SON TEST PRINCIPAL, ET C'EST UN PROGRÈS.
//
// Il gardait une propriété subtile: `signupProfileLocale()` devait lire
// `chosenUiLocale()` — le DRAPEAU — et surtout pas `uiLocale()` — la langue que
// la PAGE a pu rendre. Les deux diffèrent sur toute page que la frontière force
// en anglais, et lire la mauvaise créait un compte anglais pour quelqu'un qui
// avait cliqué FR, sans erreur nulle part. Le test a rendu ce service: joué par
// mutation, il rougissait sur exactement la bonne ligne.
//
// La propriété a disparu parce que la QUESTION a changé de forme. Les portes
// portent maintenant un champ « Langue » — il a pris la place du sélecteur de
// pays, dont l'aide se justifiait par un numéro d'urgence que le produit ne
// route pas — et `signupProfileLocale` reçoit ce choix en ARGUMENT REQUIS. Il
// n'y a donc plus de lecture d'état à se tromper: le compilateur énumère les
// quatre portes, et aucune ne peut lire autre chose que sa propre réponse.
//
// Ce que ce fichier garde: la conversion elle-même, et l'invariant de frontière
// qu'il portait au passage. La chaîne complète — du champ à l'affichage et à la
// langue du chat — vit dans `signupLanguageChain.int.test.ts`.

import { describe, expect, it } from "vitest";
import { isTranslatedNamespace, PAGE_NAMESPACES } from "./catalog";
import { signupProfileLocale, uiLocaleForPath } from "./runtime";

describe("signupProfileLocale", () => {
  it("rend le défaut déclaré de chaque langue livrée", () => {
    expect(signupProfileLocale("en")).toBe("en-US");
    expect(signupProfileLocale("fr")).toBe("fr-FR");
  });

  it("n'invente pas de région: la valeur est un BCP-47 complet", () => {
    // R2 demande du BCP-47 en base. Un tag nu (`"fr"`) passerait `isFrenchLocale`
    // côté serveur mais mentirait sur la ligne — c'est exactement ce que les
    // générateurs écrivaient avant d'être câblés (`?? "en"`).
    for (const locale of ["en", "fr"] as const) {
      expect(signupProfileLocale(locale)).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });
});

describe("la frontière déclarée reste honnête", () => {
  it("aucune page DÉCLARÉE n'est incomplète", () => {
    // ⚠️ CETTE ASSERTION A CHANGÉ DE SENS DEUX FOIS, ET C'EST ELLE QUI L'A DIT.
    // Elle exigeait d'abord qu'il reste une page déclarée-et-pourtant-anglaise
    // (le repli « un namespace en attente »), puis, la liste d'attente s'étant
    // vidée, elle affirme l'inverse: une page déclarée l'est ENTIÈREMENT.
    //
    // Les deux moitiés sont nécessaires. Sans la seconde, la première serait
    // vraie pour une mauvaise raison — une table vide la satisferait aussi.
    const declaredButEnglish = Object.keys(PAGE_NAMESPACES)
      .filter((path) => uiLocaleForPath(path) === "en");
    const incomplete = Object.entries(PAGE_NAMESPACES)
      .filter(([, namespaces]) => !namespaces.every(isTranslatedNamespace))
      .map(([path]) => path);

    expect(incomplete).toEqual([]);
    // `uiLocaleForPath` lit la locale COURANTE, qui vaut l'anglais par défaut
    // dans un test: on n'exige donc pas la liste vide, on exige qu'elle
    // corresponde exactement à ce que l'incomplétude explique — c'est-à-dire
    // rien.
    expect(declaredButEnglish.filter((p) => incomplete.includes(p))).toEqual([]);
  });
});
