/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT F ③ — L'ÉCRAN, SUR DES PLANS QUE LE MOTEUR VIENT D'ÉCRIRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUI DISTINGUE CE FICHIER DE `ingredientQuantity.int.test.ts` (lot C) :
 * ses payloads ne sont pas ÉCRITS À LA MAIN. Ce sont trois lignes
 * `student_generated_meals` que le VRAI handler a écrites le 2026-09-11 au
 * soir, sous l'adaptateur fournisseur contrôlé du lot F — une personne (PERTE),
 * une personne (GAIN) et un foyer de DEUX bouches. Le lot C prouvait que le
 * rendu est juste sur un payload de décor ; celui-ci prouve qu'il l'est sur ce
 * que le moteur produit réellement, après sérialisation en base et relecture.
 *
 * Fixture : `__fixtures__/lot-f-plans.json`. Les trois plans y sont recopiés au
 * caractère depuis `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/`.
 *
 * ⛔ `.ts` ET `createElement`, JAMAIS DE JSX — `vitest.config.ts` ne collecte
 * que `src/**` + `*.int.test.ts` ; un `.tsx` ne serait jamais ramassé et le
 * test passerait pour vert en n'existant pas.
 *
 * ⛔ LE « RECHARGEMENT » EST UN VRAI ALLER-RETOUR `jsonb` : le payload est
 * sérialisé puis repassé par `readDishes` / `readPreparations` / `readShopping`
 * — les lecteurs que le produit emploie pour monter une ligne — avant tout
 * rendu. Un lecteur qui laisse tomber un champ le fait EN SILENCE.
 *
 * ⛔ ET CE FICHIER NE DIT RIEN DU GOÛT. Il compare des nombres à des nombres.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SessionPreparation } from "../components/CookingSessions";
import {
  readDishes,
  readPreparations,
  readShopping,
} from "../api/mealGeneration";
import { ingredientQuantityState, ingredientQuantityText } from "./ingredientQuantity";
import fixtures from "./__fixtures__/lot-f-plans.json";

type Plan = {
  id: string;
  starts_on: string;
  ends_on: string;
  servings: number;
  content_locale: string;
  dishes: unknown[];
  preparations: unknown[];
  shopping_list: unknown[];
  cooking_sessions: unknown[];
  member_portions: unknown[];
};
const PLANS = (fixtures as { plans: Record<string, Plan> }).plans;

/** L'aller-retour que fait la base : `jsonb` écrit, `jsonb` relu. */
function reload<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

function atPath(path: string): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: path, search: "", href: `http://localhost${path}` },
    configurable: true,
    writable: true,
  });
}

function prepCard(prep: unknown, path = "/app/plan"): string {
  atPath(path);
  return renderToStaticMarkup(
    createElement(SessionPreparation, {
      prep: prep as never,
      feeds: [],
      open: true,
      onToggle: () => {},
    }),
  );
}

describe("LOT F ③ — trois plans écrits par le moteur, relus par l'écran", () => {
  // ═════════════════════════════════════════════════════════════════════════
  // ① LES TROIS PLANS SE RELISENT — ET LE DÉNOMINATEUR EST ANNONCÉ
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA PRÉMISSE EST ÉPINGLÉE. Une boucle sur un objet vide passerait toutes
  // les assertions du fichier sans en exécuter une seule ; c'est la cicatrice
  // « une garde a besoin d'un cas qui passe », prise à l'envers.
  it("la fixture porte bien les trois plans, et ils portent des plats", () => {
    expect(Object.keys(PLANS).sort()).toEqual(["duo", "gain", "perte"]);
    expect(PLANS.perte.dishes.length).toBe(6);
    expect(PLANS.gain.dishes.length).toBe(6);
    expect(PLANS.duo.dishes.length).toBe(6);
    // Le foyer de deux sert DEUX parts ; les deux solos une seule.
    expect(PLANS.duo.servings).toBe(2);
    expect(PLANS.perte.servings).toBe(1);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ② APRÈS RECHARGEMENT, CHAQUE LIGNE D'INGRÉDIENT GARDE SA DONNÉE STRUCTURÉE
  // ═════════════════════════════════════════════════════════════════════════
  //
  // C'est le champ que `readIngredients` laissait tomber avant le lot C :
  // `amount`, `unit`, `state`, `grams_raw`, `ref`. Sans eux l'écran retombe sur
  // l'ancien `quantity` — le défaut mesuré à 64 lignes sur 96 le 2026-09-11.
  for (const cle of ["perte", "gain", "duo"] as const) {
    it(`${cle} — les lecteurs transportent amount/unit/ref sur toutes les lignes`, () => {
      const plan = PLANS[cle];
      const preps = readPreparations(reload(plan.preparations));
      const dishes = readDishes(reload(plan.dishes));
      const lignes = [
        ...preps.flatMap((p) => p.ingredients ?? []),
        ...dishes.flatMap((d) => d.ingredients ?? []),
      ];
      expect(lignes.length).toBeGreaterThan(20);
      const sansDonnee = lignes.filter((i) =>
        typeof (i as { amount?: unknown }).amount !== "number" ||
        typeof (i as { unit?: unknown }).unit !== "string"
      );
      // ⛔ LES SEULES LIGNES SANS DONNÉE STRUCTURÉE SONT LES CONDIMENTS, ET
      // C'EST VOULU. « une pincée de sel » n'a pas de quantité : le lot A la
      // pèse par CONVENTION et ne la compte pas comme référence vérifiée ; le
      // lot C la laisse en `historic_text` plutôt que d'écrire « 0,5 g de sel »,
      // un nombre que personne n'a mesuré. Le test NOMME la liste au lieu de
      // tolérer n'importe quel manque : une ligne pesée qui s'y ajouterait
      // ferait rougir.
      const CONDIMENTS = ["sel", "poivre noir"];
      const inattendus = [...new Set(sansDonnee.map((i) => i.term))].filter(
        (t) => !CONDIMENTS.includes(t),
      );
      expect(inattendus).toEqual([]);
      // ⛔ ET LEUR `amount` EST `null`, PAS ZÉRO. C'est le défaut que le lot F
      // a trouvé dans `readIngredients` : `Number(null)` vaut 0 et passe
      // `Number.isFinite`, donc une pincée ressortait à « zéro gramme » —
      // « n'en mets pas », une affirmation — au lieu d'« inconnu ». Un lecteur
      // qui somme ces nombres, ou qui teste `typeof === "number"` pour décider
      // qu'une ligne est pesée, était trompé en silence.
      for (const i of sansDonnee) {
        expect((i as { amount?: unknown }).amount).toBeNull();
      }
      // ⛔ ET L'ÉTAT DE LECTURE LE DIT : toute ligne PESÉE est « structured ».
      // Un « historic_text » sur une ligne pesée d'un plan écrit CE SOIR
      // voudrait dire que la finalisation a été contournée.
      const pesees = lignes.filter((i) =>
        typeof (i as { amount?: unknown }).amount === "number"
      );
      expect(pesees.length).toBeGreaterThan(20);
      const etats = new Set(pesees.map((i) => ingredientQuantityState(i)));
      expect([...etats].sort()).toEqual(["structured"]);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ③ LE TEXTE RENDU PORTE LE NOMBRE DU CALCUL — SUR LE HTML, PAS SUR LE CODE
  // ═════════════════════════════════════════════════════════════════════════
  it("la carte de cuisine rend le nombre structuré, au centième", () => {
    const preps = readPreparations(reload(PLANS.perte.preparations));
    expect(preps.length).toBeGreaterThan(0);
    let verifiees = 0;
    for (const prep of preps) {
      // ⚠️ LE HTML ÉCHAPPE L'APOSTROPHE (`&#x27;`). Comparer la chaîne brute
      // rendrait rouge un rendu PARFAITEMENT juste — on compare donc le HTML
      // dé-échappé, et ce n'est pas une tolérance : l'apostrophe typographique
      // est la seule différence, et elle vient de React, pas du formateur.
      const html = prepCard(prep).replaceAll("&#x27;", "'").replaceAll(
        "&quot;",
        '"',
      );
      for (const ing of prep.ingredients ?? []) {
        const attendu = ingredientQuantityText(ing);
        expect(html).toContain(attendu);
        const n = (ing as { amount?: number }).amount;
        if (typeof n !== "number") continue; // condiment : pas de nombre à lire
        // Le nombre du calcul, arrondi comme le formateur l'arrondit.
        expect(attendu).toContain(String(Math.round(n * 100) / 100));
        verifiees++;
      }
    }
    // La prémisse : sans ce compte, une liste vide rendrait le test vert.
    expect(verifiees).toBeGreaterThan(5);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ④ LE CRU ET LE PRÊT NE SE CONFONDENT PAS
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Une casserole affiche les grammes du LOT à cuisiner (`grams_raw`, état
  // `raw`) ; un contenant affiche les grammes PRÊTS prélevés (`grams`). Le plan
  // l'exige : « séparer clairement les grammes crus à cuisiner des grammes
  // prêts à servir ».
  it("casserole = grammes du lot ; contenant = grammes prélevés", () => {
    const preps = readPreparations(reload(PLANS.perte.preparations));
    const dishes = readDishes(reload(PLANS.perte.dishes));
    const items = dishes.flatMap((d) =>
      (d.boxes ?? []).flatMap((b) => b.items ?? [])
    );
    expect(items.length).toBeGreaterThan(10);
    // Tout item de contenant porte un gramme NU — jamais une prose.
    for (const it of items) {
      expect(typeof (it as { grams?: unknown }).grams).toBe("number");
    }
    // Et les lignes de casserole portent bien un état de cuisson nommé.
    const etats = new Set(
      preps.flatMap((p) => p.ingredients ?? []).map((i) =>
        String((i as { state?: unknown }).state ?? "")
      ),
    );
    expect(etats.has("raw")).toBe(true);
    // ⛔ LE CAS QUI MORD : une casserole qui afficherait la part d'une seule
    // bouche au lieu du lot. Sur `duo`, les deux contenants d'un même plat
    // n'ont PAS le même grammage (appétits différents), donc aucune somme de
    // contenants ne peut se confondre avec le lot.
    const duo = readDishes(reload(PLANS.duo.dishes));
    const plat = duo.find((d) => (d.boxes ?? []).length === 2);
    expect(plat).toBeTruthy();
    const [a, b] = (plat!.boxes ?? []).map((bx) =>
      (bx.items ?? []).reduce(
        (n, i) => n + Number((i as { grams?: number }).grams ?? 0),
        0,
      )
    );
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(Math.round(a)).not.toBe(Math.round(b));
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ⑤ LES COURSES SE RELISENT — ET LEUR TROU EST NOMMÉ, PAS MASQUÉ
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE TEST ÉPINGLE UNE ABSENCE. `shopping_list[]` ne porte TOUJOURS ni
  // `amount`, ni `unit`, ni `ref` : c'est la demande C-E1 du lot E, non servie.
  // Tant qu'elle l'est, l'écran ne peut rien dériver de ces lignes et le
  // contrôle de suffisance rend « incomplet » — 3 lignes sur PERTE, 20 sur
  // GAIN, mesurées par le tir du lot F. L'écrire ici empêche de croire que le
  // transport d'identité du lot C couvre aussi les courses.
  it("les lignes de courses n'ont ni quantité structurée ni identité", () => {
    const lignes = readShopping(reload(PLANS.perte.shopping_list));
    expect(lignes.length).toBeGreaterThan(10);
    for (const l of lignes) {
      expect(Object.keys(l)).not.toContain("amount");
      expect(Object.keys(l)).not.toContain("ref");
      // Ce qu'elles portent : une prose, un rayon, une date d'achat.
      expect(typeof l.quantity).toBe("string");
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ⑥ LE FOYER DE DEUX — UNE CASSEROLE, DEUX PARTS ATTRIBUÉES
  // ═════════════════════════════════════════════════════════════════════════
  it("duo — chaque case porte une part par bouche, et elles diffèrent", () => {
    const dishes = readDishes(reload(PLANS.duo.dishes));
    expect(dishes.length).toBe(6);
    let cases = 0;
    for (const d of dishes) {
      const boxes = d.boxes ?? [];
      expect(boxes.length).toBe(2);
      cases++;
    }
    // 6 cases × 2 bouches = 12 parts. C'est le dénominateur du lot E
    // (`portion_cells: 12`, `measured_cells: 12`) vu depuis l'écran.
    expect(cases).toBe(6);
  });
});
