/**
 * LE ROUTAGE DE COMPOSITION — LES SIX CAS, ET POURQUOI CHACUN EXISTE.
 *
 * Ce test ne vérifie pas « la fonction marche »: il épingle les six états que
 * le produit peut réellement produire, chacun avec la raison qui rend sa
 * direction obligatoire. Un test qui ne dirait que « deux bouches ⇒ foyer »
 * resterait vert le jour où `isOwner` disparaît du routage — et c'est
 * exactement le cas qui coûte un refus que rien ne peut fermer.
 */

import { describe, expect, it } from "vitest";

import { chooseGenerator } from "./planRouting";

describe("quel générateur compose", () => {
  it("un compte sans foyer compose pour lui-même", () => {
    expect(
      chooseGenerator({ inHousehold: false, isOwner: false, otherMouths: 0 }),
    ).toBe("personal");
  });

  it("un foyer laissé à UNE seule bouche compose comme un solo", () => {
    // Le foyer existe, je le tiens, et il n'y a personne d'autre à table: il
    // n'y a aucun arbitrage à faire, donc rien à demander au générateur du
    // foyer. C'est un état courant — on crée son foyer avant d'y ajouter
    // quelqu'un.
    expect(
      chooseGenerator({ inHousehold: true, isOwner: true, otherMouths: 0 }),
    ).toBe("personal");
  });

  it("le maître d'un foyer d'au moins deux bouches compose pour le foyer", () => {
    // LE CAS QUI PASSE. Une garde a besoin d'un cas qui passe, sinon elle
    // bloque tout en ressemblant à une garde qui marche.
    expect(
      chooseGenerator({ inHousehold: true, isOwner: true, otherMouths: 1 }),
    ).toBe("household");
  });

  it("un secondaire compose pour LUI, même dans un foyer de quatre", () => {
    // ⚠️ LE CAS QUI PRODUIRAIT `not_owner`. `generate-household-meal-v1` rend
    // 403 à un secondaire, exprès: son plan à lui est PERSONNEL. Router sur le
    // seul nombre de bouches enverrait toute personne ayant réclamé son profil
    // dans un refus que rien ne peut fermer.
    expect(
      chooseGenerator({ inHousehold: true, isOwner: false, otherMouths: 3 }),
    ).toBe("personal");
  });

  it("un secondaire seul avec le maître compose aussi pour lui", () => {
    expect(
      chooseGenerator({ inHousehold: true, isOwner: false, otherMouths: 0 }),
    ).toBe("personal");
  });

  it("un `isOwner` sans foyer prend la direction sûre", () => {
    // État INCOHÉRENT (on ne tient pas un foyer dont on n'est pas membre). La
    // direction sûre est le générateur individuel: c'est le seul qui ne peut
    // pas rendre `no_household`.
    expect(
      chooseGenerator({ inHousehold: false, isOwner: true, otherMouths: 5 }),
    ).toBe("personal");
  });

  it("le compte de bouches EXCLUT le maître", () => {
    // La cicatrice nommée dans l'en-tête du module: la liste des bouches d'un
    // foyer ne contient pas la ligne du maître. Un foyer de DEUX personnes se
    // dit `otherMouths: 1`, et il doit partir sur le générateur du foyer.
    // Écrit comme un cas à part parce que c'est une convention de NOM, la
    // seule chose qu'une re-implémentation puisse se retrouver à ignorer.
    expect(
      chooseGenerator({ inHousehold: true, isOwner: true, otherMouths: 1 }),
    ).toBe("household");
  });
});
