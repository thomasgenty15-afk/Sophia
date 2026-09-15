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
  it("la fixture porte bien les plans, et ils portent des plats", () => {
    // ⟳ 2026-09-12 · FERMETURE DES TROIS LOTS — LA FIXTURE A ÉTÉ REGÉNÉRÉE
    // depuis les TROIS demandes réelles de la fermeture (appels modèle
    // payants), et elle garde EN PLUS le plan `archive` du 2026-09-11 : écrit
    // avant que la liste de courses porte ses champs structurés, il prouve
    // qu'un plan ancien reste lisible.
    //
    // ⚠️ SIX PLATS PARTOUT, ET C'EST LA FENÊTRE QUI LE DIT: les trois demandes
    // portaient deux jours × trois moments (le premier jour tombe sur le délai
    // d'achat). Le nombre n'est pas un réglage — c'est la grille annoncée avant
    // l'appel, et l'instrument l'a vérifiée (6, 12 et 6 parts attendues).
    // ⟳ 2026-09-13 · FERMETURE DES RÉPARATIONS DE FOYER — `quatuor` REJOINT LA
    // FIXTURE. C'est le tir `l3d04` : QUATRE bouches, et un déroulé de session
    // qui portait un allergène et que la boucle a RÉPARÉ. Il ferme le point ⑦
    // du plan (« lecture API/UI des sorties N=2/N=4 : bonnes personnes,
    // quantités finales entières, texte corrigé »).
    expect(Object.keys(PLANS).sort()).toEqual([
      "archive",
      "duo",
      "gain",
      "perte",
      "quatuor",
    ]);
    expect(PLANS.perte.dishes.length).toBe(6);
    expect(PLANS.gain.dishes.length).toBe(6);
    expect(PLANS.duo.dishes.length).toBe(6);
    expect(PLANS.archive.dishes.length).toBe(6);
    // ⚠️ SEPT PLATS, ET PAS SIX : la fenêtre de ce tir porte fri/dinner plus
    // deux journées pleines, et la boucle a rempli la case manquante.
    expect(PLANS.quatuor.dishes.length).toBe(7);
    // Le foyer de deux sert DEUX parts ; celui de quatre en sert QUATRE ; les
    // deux solos une seule.
    expect(PLANS.duo.servings).toBe(2);
    expect(PLANS.quatuor.servings).toBe(4);
    expect(PLANS.perte.servings).toBe(1);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ① bis ⟳ 2026-09-13 — LE FOYER DE QUATRE : LES BONNES PERSONNES, ET LE
  //        TEXTE RÉPARÉ
  // ═════════════════════════════════════════════════════════════════════════
  it("quatuor — quatre bouches nommées, et aucune part orpheline", () => {
    const parts = PLANS.quatuor.member_portions as { member_id?: string }[];
    expect(parts.length).toBe(4);
    const bouches = new Set(parts.map((p) => String(p.member_id ?? "")));
    expect(bouches.size).toBe(4);
    expect([...bouches].every((id) => id !== "")).toBe(true);

    // ⛔ ET CHAQUE CONTENANT NOMME QUELQU'UN DE LA TABLE. Un couvercle sans nom
    // sur une table de quatre est un contenant que personne ne sait à qui
    // ouvrir — la cicatrice `box-belongs-to-the-meal`.
    const dishes = readDishes(reload(PLANS.quatuor.dishes));
    const contenants = dishes.flatMap((d) => d.boxes ?? []);
    expect(contenants.length).toBeGreaterThan(0);
    for (const b of contenants) {
      // ⚠️ `member_ids`, LA CLÉ DU PAYLOAD — `readDishes` la transporte telle
      // quelle (`mealGeneration.ts`), il ne la renomme pas.
      const noms = (b as { member_ids?: string[] }).member_ids ?? [];
      expect(noms.length).toBeGreaterThan(0);
      for (const id of noms) expect(bouches.has(id)).toBe(true);
    }
  });

  it("quatuor — le DÉROULÉ réparé est celui qui est relu, et il ne nomme plus l'aliment", () => {
    // ⛔ LE DÉFAUT FERMÉ AU LOT 1, VU DEPUIS L'ÉCRAN. L'allergène n'était que
    // dans `cooking_sessions[].run_through` ; il passait le verrou, et la
    // correction devait se retrouver jusque dans la ligne écrite.
    const sessions = reload(PLANS.quatuor.cooking_sessions) as {
      run_through?: string;
    }[];
    expect(sessions.length).toBeGreaterThan(0);
    const textes = sessions.map((s) => String(s.run_through ?? ""));
    for (const t of textes) {
      expect(t.trim().length).toBeGreaterThan(0);
      expect(t.toLowerCase()).not.toContain("peanut");
      expect(t.toLowerCase()).not.toContain("cacahu");
    }
    // ⛔ ET LE TEXTE RÉPARÉ EST BIEN CELUI-LÀ, pas un vestige : la boucle a
    // réécrit la session en défaut, et c'est sa phrase qui est en base.
    expect(textes.some((t) => t.includes("répartis en boîtes étiquetées"))).toBe(
      true,
    );
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ② APRÈS RECHARGEMENT, CHAQUE LIGNE D'INGRÉDIENT GARDE SA DONNÉE STRUCTURÉE
  // ═════════════════════════════════════════════════════════════════════════
  //
  // C'est le champ que `readIngredients` laissait tomber avant le lot C :
  // `amount`, `unit`, `state`, `grams_raw`, `ref`. Sans eux l'écran retombe sur
  // l'ancien `quantity` — le défaut mesuré à 64 lignes sur 96 le 2026-09-11.
  for (const cle of ["perte", "gain", "duo", "quatuor"] as const) {
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
      // ⟳ 2026-09-12 · FERMETURE DES TROIS LOTS — « herbes séchées » rejoint la
      // liste, et pour la MÊME raison que le sel: le modèle l'écrit sans
      // quantité, le lot A la pèse par convention et le lot C la laisse en
      // texte plutôt que d'inventer « 0,5 g ». Le moteur le NOMME de son côté
      // (`unquantified_terms: herbes séchées`).
      const CONDIMENTS = ["sel", "poivre noir", "herbes séchées"];
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
  // ⛔ CE TEST ÉPINGLAIT UNE ABSENCE, ET ELLE EST FERMÉE — ⟳ 2026-09-12 · C3.
  //
  // Il disait : « `shopping_list[]` ne porte ni `amount`, ni `unit`, ni `ref` —
  // demande C-E1 du lot E, non servie ». Conséquence mesurée : l'écran ne
  // pouvait rien dériver de ces lignes et le contrôle de suffisance rendait
  // « incomplet » sur 3 lignes de PERTE et **20 de GAIN**.
  //
  // ⛔ CE QU'IL GARDE MAINTENANT, ET C'EST LA MOITIÉ QUI COMPTE : le lecteur
  // porte les champs, **et un plan écrit AVANT C3 reste lisible**. Les trois
  // plans de cette fixture ont été écrits le 2026-09-11, donc sans ces champs :
  // ils doivent ressortir à `null` — la valeur « inconnue » — et surtout PAS à
  // zéro, qui dirait « n'en achète pas » (cicatrice `readIngredients`, 6 lignes
  // sur 43 le même soir).
  it("les lignes de courses portent l'identité et la quantité structurée — `null` sur un plan d'archive", () => {
    // ⟳ 2026-09-12 · LOT 3 — CE CAS LIT MAINTENANT LE PLAN `archive`. Les plans
    // de la campagne du 2026-09-12 portent, eux, les champs REMPLIS : la
    // liste est produite depuis les recettes. Les deux directions sont
    // épinglées, ici et dans le cas juste en dessous.
    const lignes = readShopping(reload(PLANS.archive.shopping_list));
    expect(lignes.length).toBeGreaterThan(10);
    for (const l of lignes) {
      expect(Object.keys(l)).toContain("amount");
      expect(Object.keys(l)).toContain("unit");
      expect(Object.keys(l)).toContain("ref");
      expect(Object.keys(l)).toContain("state");
      expect(Object.keys(l)).toContain("purchasable");
      // ⛔ LE CAS QUI MORD : une archive sans donnée structurée rend `null`,
      // jamais `0`. `Number(undefined)` vaut `NaN`, `Number(null)` vaut `0` —
      // les deux passeraient inaperçus dans une somme.
      expect(l.amount).toBeNull();
      expect(l.unit).toBeNull();
      expect(l.ref).toBeNull();
      // ⛔ ET ELLE RESTE ACHETABLE : l'absence du champ ne sort personne de la
      // liste de courses.
      expect(l.purchasable).toBe(true);
      // Ce qu'elles portent depuis toujours : une prose, un rayon, une date.
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
    // ⟳ 2026-09-12 · FERMETURE DES TROIS LOTS — 6 cases × 2 bouches = 12 parts,
    // sur le plan écrit par la demande réelle n° 2. C'est exactement le
    // dénominateur que la grille de mesure annonce AVANT l'appel
    // (`cases_annoncees: 6`, `bouches_annoncees: 2` ⇒ 12 parts attendues) et
    // que l'instrument a mesuré conforme (12/12) : l'écran voit le même nombre
    // de parts que la mesure.
    expect(cases).toBe(6);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · LOT 3 — L'AUTRE DIRECTION : LA LISTE PRODUITE SE RELIT
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE CAS AU-DESSUS PROUVE QU'UN PLAN ANCIEN RESTE LISIBLE. Celui-ci prouve
  // que les plans d'AUJOURD'HUI portent réellement ce que le lot 1 produit :
  // depuis que le modèle n'écrit plus `shopping_list`, chaque ligne est
  // calculée depuis les recettes, et si l'écran ne la relisait pas, la personne
  // arriverait au magasin avec une liste sans quantité.
  it("les plans du 2026-09-12 portent une liste PRODUITE, et l'écran la relit", () => {
    for (const cle of ["perte", "gain", "duo", "quatuor"] as const) {
      const lignes = readShopping(reload(PLANS[cle].shopping_list));
      expect(lignes.length).toBeGreaterThan(10);
      // ⛔ AUCUNE LIGNE SANS DATE D'ACHAT. Une liste sans jour se lit « achète
      // tout maintenant » — c'est le défaut que la datation des vagues ferme,
      // et une ligne produite après la datation le rouvrait (mesuré le
      // 2026-09-12 sur « blancs d'œuf »).
      for (const l of lignes) {
        expect(typeof l.buy_on === "string" && l.buy_on.length === 10).toBe(true);
        expect(l.purchasable).toBe(true);
      }
      // ⛔ ET LA QUANTITÉ STRUCTURÉE EST LÀ SUR LA PLUPART DES LIGNES. Pas sur
      // TOUTES : un besoin non pesable garde son texte et sort sans nombre,
      // `null` voulant dire « inconnu » et jamais zéro. On épingle donc une
      // MAJORITÉ, qui est ce que « la liste est calculée » veut dire.
      const chiffrees = lignes.filter((l) => typeof l.amount === "number" && l.amount > 0);
      expect(chiffrees.length).toBeGreaterThan(lignes.length / 2);
      for (const l of chiffrees) {
        expect(typeof l.unit === "string" && l.unit.length > 0).toBe(true);
      }
    }
  });
});
