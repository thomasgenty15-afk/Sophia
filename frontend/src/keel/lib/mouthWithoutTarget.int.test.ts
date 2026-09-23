/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 1 — L'ÉCRAN D'UNE BOUCHE QUI N'A PAS DE CIBLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le défaut fermé le 2026-09-13 : une bouche sans date de naissance
 * (`age_state = unknown`) n'avait AUCUN contenant à son nom, et son absence
 * faisait refuser le plan des quatre bouches. Elle reçoit désormais la PART DE
 * RECETTE — la recette telle que le modèle l'a écrite, sans cible personnelle.
 *
 * Ce fichier pose les deux questions d'écran, et pas une de plus :
 *
 *   ① LA BONNE PERSONNE VOIT-ELLE SA PART ? Son contenant existe sur chacune
 *      de ses cases, il porte SON prénom et lui seul, et il porte des grammes
 *      d'aliment.
 *   ② EST-CE QU'UN CHIFFRE INTERDIT FUIT ? Aucune calorie, aucune cible,
 *      aucun objectif ne doit traverser — ni par les items, ni par la note de
 *      portion, ni par l'explication du plan.
 *
 * ⛔ LE PAYLOAD N'EST PAS ÉCRIT À LA MAIN. C'est la ligne
 * `student_generated_meals` que le vrai handler a écrite au banc du lot F
 * (compte `lotf.perte.l1age`, plan `a9b2ffa3`, zéro appel fournisseur facturé),
 * recopiée telle quelle dans `__fixtures__/lot1-mouth-without-target.json`.
 *
 * ⛔ `.ts` ET PAS `.tsx` : `vitest.config.ts` ne collecte que `src/**` +
 * `*.int.test.ts`. Un `.tsx` ne serait jamais ramassé, et ce fichier passerait
 * pour vert en n'existant pas.
 */
import { describe, expect, it } from "vitest";

import {
  readDishes,
  readMemberPortions,
  readPreparations,
} from "../api/mealGeneration";
import { boxLinesForDish } from "./mealBoxes";
import fixture from "./__fixtures__/lot1-mouth-without-target.json";

const SANS_CIBLE = (fixture as { memberWithoutTarget: string }).memberWithoutTarget;
const PLAN = (fixture as {
  plan: {
    dishes: unknown[];
    preparations: unknown[];
    member_portions: unknown[];
  };
}).plan;

/** L'aller-retour que fait la base : `jsonb` écrit, `jsonb` relu. */
function reload<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

const dishes = readDishes(reload(PLAN.dishes));
const preparations = readPreparations(reload(PLAN.preparations));
const portions = readMemberPortions(reload(PLAN.member_portions));
const lignes = dishes.flatMap((d) => boxLinesForDish(d, portions));

describe("LOT 1 — la bouche sans cible, à l'écran", () => {
  it("le plan relu porte les quatre bouches et douze plats", () => {
    expect(dishes).toHaveLength(12);
    expect(preparations).toHaveLength(2);
    expect(portions.map((p) => p.displayName).sort()).toEqual([
      "Iris",
      "Lea",
      "Nils",
      "Paul",
    ]);
  });

  it("① elle a un contenant sur CHACUNE de ses six cases, et il la nomme", () => {
    const siennes = dishes.flatMap((d) =>
      boxLinesForDish(d, portions)
        .filter((_, i) => d.boxes[i].member_ids.includes(SANS_CIBLE))
        .map((l) => ({ ligne: l, case: `${d.day}/${d.slot}` }))
    );
    expect(siennes.map((x) => x.case).sort()).toEqual([
      "mon/breakfast",
      "mon/dinner",
      "mon/lunch",
      "tue/breakfast",
      "tue/dinner",
      "tue/lunch",
    ]);
    for (const { ligne } of siennes) {
      // ⛔ SON PRÉNOM, ET PERSONNE D'AUTRE. Un contenant à un nom veut dire
      // « c'est ta portion » (v4) ; y mettre deux noms changerait le sens des
      // grammes affichés.
      expect(ligne.eaters).toEqual(["Iris"]);
      expect(ligne.eaterCount).toBe(1);
      expect(ligne.shared).toBe(false);
      expect(ligne.lid.startsWith("Iris — ")).toBe(true);
      // ⛔ ET IL Y A VRAIMENT À MANGER DEDANS. « Un nom ajouté à un contenant
      // vide » est précisément ce que ce lot ne doit pas produire.
      expect(ligne.items.length).toBeGreaterThan(0);
      expect(ligne.total).toBeGreaterThan(0);
      for (const it of ligne.items) {
        expect(it.term.length).toBeGreaterThan(0);
        expect(it.grams).toBeGreaterThan(0);
      }
    }
  });

  it("① bis sa part sort des MÊMES aliments que celle de ses voisins", () => {
    // ⛔ AUCUN TERME NEUF. Sa part vient de la recette que la table cuisine,
    // pas d'un aliment fabriqué pour elle.
    for (const d of dishes) {
      const sienne = d.boxes.find((b) => b.member_ids.includes(SANS_CIBLE));
      if (!sienne) continue;
      const autres = new Set(
        d.boxes
          .filter((b) => !b.member_ids.includes(SANS_CIBLE))
          .flatMap((b) => b.items.map((i) => i.term)),
      );
      for (const it of sienne.items) expect(autres.has(it.term)).toBe(true);
    }
  });

  it("② aucune note de portion, donc aucune phrase chiffrée à lire", () => {
    for (const p of portions) {
      expect(p.portionNote).toBeNull();
      expect(p.shares).toEqual([]);
    }
  });

  it("② aucun chiffre d'énergie ne traverse jusqu'à l'écran", () => {
    // ⛔ ON CHERCHE LE MOT, PAS UNE ABSENCE DE CHAMP. Un `kcal` glissé dans un
    // libellé d'item, un titre de plat ou une note passerait tous les contrôles
    // de type et s'afficherait quand même.
    const texte = JSON.stringify({ dishes, preparations, portions }).toLowerCase();
    for (const mot of ["kcal", "calorie", "calories", "target_kcal", "day_kcal"]) {
      expect(texte.includes(mot)).toBe(false);
    }
    // Et le modèle de ligne que l'écran monte ne porte structurellement que des
    // grammes d'aliment : le vérifier sur les clés rendues, pas sur le type.
    for (const l of lignes) {
      expect(Object.keys(l).sort()).toEqual([
        "dish",
        "eaterCount",
        "eaters",
        "eatersLabel",
        // ⟳ 2026-09-23 — `fromOtherSessions` : les parts d'une AUTRE session,
        // un nom et un jour. Aucun chiffre.
        "fromOtherSessions",
        "frozen",
        "id",
        "items",
        "lid",
        "meal",
        // ⟳ 2026-09-16 — `partial` : un contenant de session qui ne tient que la
        // part de marmite. Un booléen, jamais un chiffre d'énergie.
        "partial",
        // ⟳ 2026-09-23 — `restOnTheDay` : un booléen, jamais un chiffre d'énergie.
        "restOnTheDay",
        "shared",
        // ⟳ 2026-09-23 — `sides` : les à-côtés servis avec ce contenant
        // (entrée, fromage, dessert, pain). Des grammes ou des unités
        // d'aliment, jamais un chiffre d'énergie — et la ligne suivante le
        // vérifie sur ce qui est rendu.
        "sides",
        "total",
      ]);
      const aCote = JSON.stringify(l.sides).toLowerCase();
      for (const mot of ["kcal", "calorie"]) {
        expect(aCote.includes(mot)).toBe(false);
      }
    }
  });

  it("② ses voisins gardent exactement leurs propres contenants", () => {
    // La table compte 24 contenants : six cases × quatre bouches, chacun à un
    // seul nom. Une part rendue à l'une ne doit pas en retirer aux autres.
    expect(lignes).toHaveLength(24);
    const parBouche = new Map<string, number>();
    for (const d of dishes) {
      for (const b of d.boxes) {
        for (const id of b.member_ids) {
          parBouche.set(id, (parBouche.get(id) ?? 0) + 1);
        }
      }
    }
    expect([...parBouche.values()]).toEqual([6, 6, 6, 6]);
    expect(parBouche.get(SANS_CIBLE)).toBe(6);
  });
});
