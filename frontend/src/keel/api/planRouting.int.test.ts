/**
 * LE DROIT DE COMPOSER — LES QUATRE ÉTATS, ET POURQUOI CHACUN EXISTE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 · LOT 7 — CE FICHIER A CHANGÉ DE CONTRAT, PAS DE PROPRIÉTÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Il épinglait six cas de `chooseGenerator` (« quel moteur »). Le moteur est
 * unique depuis ce lot: les cas qui distinguaient un foyer d'une bouche d'un
 * foyer de deux n'ont plus d'objet, et les GARDER aurait été pire que les
 * retirer — un test vert sur une règle morte se lit comme une règle vivante.
 *
 * ⛔ LA PROPRIÉTÉ DE SÉCURITÉ, ELLE, EST LA MÊME ET ELLE EST TESTÉE ICI:
 * **un membre secondaire ne se voit jamais proposer le geste.** C'est le seul
 * cas qui produisait `not_owner`, hier comme aujourd'hui; ce qui a changé est
 * ce qu'on en fait — hier on l'envoyait sur l'autre moteur, aujourd'hui on ne
 * lui montre pas le bouton, et l'écran dit pourquoi à l'endroit du clic.
 *
 * ⚠️ ET LE COMPTE DE BOUCHES N'EST PLUS UN PARAMÈTRE. Le cas « le compte de
 * bouches EXCLUT le maître » a disparu avec lui: il n'y a plus de nombre à se
 * tromper. Un test qui le vérifierait encore aurait besoin d'un argument que
 * la signature refuse — et c'est le compilateur qui le dit, pas ce fichier.
 */

import { describe, expect, it } from "vitest";

import { composeRight, mayCompose } from "./planRouting";

describe("qui a le droit de composer", () => {
  it("le maître d'un foyer compose — quel que soit le nombre de bouches", () => {
    // LE CAS QUI PASSE. Une garde a besoin d'un cas qui passe, sinon elle
    // bloque tout en ressemblant à une garde qui marche.
    expect(composeRight({ inHousehold: true, isOwner: true })).toBe("allowed");
  });

  it("un compte SANS foyer compose aussi — c'est un foyer d'une personne", () => {
    // ⛔ LE CAS QUI RENVERSE L'ANCIENNE RÈGLE. Hier il partait sur le moteur
    // individuel; aujourd'hui il n'y en a plus qu'un, et c'est le SERVEUR qui
    // lui crée son foyer à l'entrée du générateur (lot 1). Refuser ici aurait
    // fermé l'écran à tous les comptes pas encore rattachés — la majorité, le
    // jour de la bascule.
    expect(composeRight({ inHousehold: false, isOwner: false })).toBe("allowed");
  });

  it("⛔ un membre secondaire ne se voit PAS proposer le geste", () => {
    // LA PROPRIÉTÉ DE SÉCURITÉ DU LOT. `generate-household-meal-v1` lui rend
    // 403 `not_owner` sur TOUTES ses entrées — composer, recomposer, éditer un
    // brouillon, adopter, remplacer. Lui montrer le bouton serait un bouton
    // mort: un geste offert dont la seule issue est un refus.
    expect(composeRight({ inHousehold: true, isOwner: false })).toBe("not_owner");
    expect(mayCompose({ inHousehold: true, isOwner: false })).toBe(false);
  });

  it("une place NON LUE autorise, et le serveur garde le dernier mot", () => {
    // ⚠️ `null` N'EST PAS « pas maître ». `loadMyHouseholdPlace` rend
    // `{inHousehold:false, isOwner:false}` quand sa lecture ÉCHOUE: seul
    // `inHousehold: true` prouve quelque chose. Fermer sur du non-lu ferait
    // disparaître l'écran pendant une lecture lente, pour tout le monde.
    expect(composeRight(null)).toBe("allowed");
    expect(mayCompose(null)).toBe(true);
  });

  it("`isOwner` seul ne décide de rien sans foyer", () => {
    // État INCOHÉRENT (on ne tient pas un foyer dont on n'est pas membre). Il
    // tombe du même côté que « pas de foyer », et c'est voulu: la seule chose
    // que ce module refuse est une place LUE qui dit « secondaire ».
    expect(composeRight({ inHousehold: false, isOwner: true })).toBe("allowed");
  });
});
