import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import DishCard from "./DishCard";
import PlanDayBlock from "./plan/PlanDayBlock";
import { BoxTable } from "./plan/BoxTable";
import type {
  GeneratedDish,
  MealPreparation,
  MemberPortionView,
} from "../api/mealGeneration";
import { readDishes, readPreparations } from "../api/mealGeneration";
import { boxLidLabel, boxLinesForDish, boxLinesForSession } from "../lib/mealBoxes";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

// ===========================================================================
// UN CONTENANT PAR GROUPE (v4, 2026-08-20) — SUR LA VALEUR RENDUE
//
// ⚠️ CE FICHIER MONTE LES COMPOSANTS ET LIT LEUR HTML. Deux vérificateurs de
// ce chantier ont trouvé des tests de SOURCE verts sur du code mort — un
// `shoppingList={draft.shoppingList}` resté vert sur un `[]` en dur, une garde
// qui recopiait du JSX et tombait sur un ajout de prop. La seule question qui
// compte est « QU'EST-CE QUE LE LECTEUR VOIT, ET COMBIEN DE FOIS ».
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ, et le fichier
// entier serait un silence vert. Deux lots l'ont appris ici.
//
// ── LE MODÈLE QUE CE FICHIER TIENT ────────────────────────────────────────
// Un repas produit N contenants, un par GROUPE de mangeurs: chaque bouche à
// objectif SEULE, puis tout le reste présent ENSEMBLE. Le foyer de référence
// est celui de la fixture QA — Casimir, Odalric, Wilfrid, et Peregrine qui a
// un objectif — donc DEUX bacs par repas.
//
// ── LES TROIS CEINTURES QUI VALENT LE LOT ─────────────────────────────────
//   ① LE COUVERCLE EST IDENTIQUE des deux côtés (Boxing et carte du repas). On
//      tient un bac dans la main et on cherche la même suite de mots à l'écran.
//   ② AUCUN GRAMME SUR LA CARTE D'UN REPAS. Le contenant EST la portion.
//   ③ LE COUVERCLE NE DÉPEND PAS DES PRÉPARATIONS — `/app/today`, l'écran où
//      l'on OUVRE la boîte, ne les reçoit pas.
// ===========================================================================

const PEREGRINE_ID = "mem-peregrine";
const CASIMIR_ID = "mem-casimir";
const ODALRIC_ID = "mem-odalric";
const WILFRID_ID = "mem-wilfrid";

function person(over: Partial<MemberPortionView> = {}): MemberPortionView {
  return {
    memberId: CASIMIR_ID,
    displayName: "Casimir",
    portionNote: null,
    // ⚠️ `null` = il n'a rien déclaré, donc il suit la maison — le cas nominal.
    // Un test qui veut prouver qu'une bouche est ABSENTE d'un moment le dit
    // explicitement (`eatingSlots: ["lunch"]`).
    eatingSlots: null,
    shares: [],
    ...over,
  };
}

const CASIMIR = person();
const ODALRIC = person({ memberId: ODALRIC_ID, displayName: "Odalric" });
const WILFRID = person({ memberId: WILFRID_ID, displayName: "Wilfrid" });
const PEREGRINE = person({ memberId: PEREGRINE_ID, displayName: "Peregrine" });
/** L'ORDRE DU ROSTER — celui que les couvercles doivent suivre partout. */
const ROSTER = [CASIMIR, ODALRIC, WILFRID, PEREGRINE];

function prep(over: Partial<MealPreparation> = {}): MealPreparation {
  return {
    id: "prep_chicken",
    title: "Roast chicken",
    servings_made: 4,
    ingredients: [],
    method: "Roast it.",
    active_minutes: 10,
    total_minutes: 50,
    cook_on: "mon",
    ...over,
  };
}

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Chicken bowl",
    slot: "dinner",
    day: "thu",
    method: "",
    why: "",
    ingredients: [],
    uses: [],
    boxes: [],
    same_day: null,
    member_id: null,
    ...over,
  } as GeneratedDish;
}

/** LE CAS DE RÉFÉRENCE: un repas, deux groupes, deux contenants. */
function twoBoxDish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return dish({
    uses: [{ preparation_id: "prep_chicken", servings: 4, kept: "fridge" as const }],
    boxes: [
      {
        id: "box_thu_dinner_peregrine",
        member_ids: [PEREGRINE_ID],
        items: [
          { preparation_id: "prep_chicken", term: "roast chicken", grams: 140 },
          { preparation_id: "prep_rice", term: "rice", grams: 100 },
        ],
        legacy_total_grams: null,
      },
      {
        id: "box_thu_dinner_rest",
        member_ids: [CASIMIR_ID, ODALRIC_ID, WILFRID_ID],
        items: [
          { preparation_id: "prep_chicken", term: "roast chicken", grams: 400 },
          { preparation_id: "prep_rice", term: "rice", grams: 330 },
        ],
        legacy_total_grams: null,
      },
    ],
    ...over,
  });
}

function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function markup(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return decode(renderToStaticMarkup(node));
}

function textOf(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return markup(node).replace(/<[^>]*>/g, " ");
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** La source d'un fichier, commentaires retirés — patron du dépôt. */
function code(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * TOUS LES SITES DE MONTAGE D'UN COMPOSANT, DÉCOUVERTS SUR LE DISQUE.
 *
 * ⚠️ DÉCOUVERTS, PAS ÉNUMÉRÉS. Une liste de chemins écrite à la main reste verte
 * le jour où quelqu'un ajoute un écran — c'est-à-dire le jour exact où le test
 * devrait mordre. Elle serait aussi fausse dans l'autre sens: ce dossier porte
 * des fichiers qui ne sont pas encore suivis par git (mesuré le 2026-08-17), et
 * un chemin en dur ferait rouger une copie fraîche du dépôt.
 */
function mountSitesOf(tag: string): [string, string][] {
  const roots = ["src/keel/components", "src/keel/pages"];
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith(".tsx")) {
        const src = code(rel);
        for (const mount of src.split(tag).slice(1)) {
          const end = mount.indexOf("/>");
          out.push([rel, end === -1 ? mount : mount.slice(0, end)]);
        }
      }
    }
  };
  for (const root of roots) walk(root);
  return out;
}

// ---------------------------------------------------------------------------
// 1 — LE LECTEUR: CE QUE LE SERVEUR ÉCRIT ARRIVE JUSQU'ICI
// ---------------------------------------------------------------------------

describe("readDishes lit les contenants du repas", () => {
  it("⛔ les contenants traversent le lecteur (le défaut de famille de ce chantier)", () => {
    // Trois fois cette semaine, un champ écrit par le serveur a été PERDU par
    // son lecteur front, sous un câblage vert: `shoppingList`, `member_id`,
    // `member_portions`. C'est le test qui ferme la même porte pour `boxes`.
    const [d] = readDishes([{
      title: "Bowl",
      uses: [{ preparation_id: "prep_chicken", servings: 4, kept: "fridge" as const }],
      boxes: [
        {
          id: "box_thu_dinner_peregrine",
          member_ids: [PEREGRINE_ID],
          items: [{ preparation_id: "prep_chicken", term: "roast chicken", grams: 140 }],
        },
        {
          id: "box_thu_dinner_rest",
          member_ids: [CASIMIR_ID, ODALRIC_ID, WILFRID_ID],
          items: [{ preparation_id: "prep_chicken", term: "roast chicken", grams: 400 }],
        },
      ],
    }]);
    expect(d.boxes).toEqual([
      {
        id: "box_thu_dinner_peregrine",
        member_ids: [PEREGRINE_ID],
        items: [{ preparation_id: "prep_chicken", term: "roast chicken", grams: 140 }],
        legacy_total_grams: null,
      },
      {
        id: "box_thu_dinner_rest",
        member_ids: [CASIMIR_ID, ODALRIC_ID, WILFRID_ID],
        items: [{ preparation_id: "prep_chicken", term: "roast chicken", grams: 400 }],
        legacy_total_grams: null,
      },
    ]);
  });

  it("⚠️ CEINTURE ④ — un plan v2 se replie en UN contenant commun, sans perdre ses grammes", () => {
    // Tout plan écrit avant le 2026-08-20 porte `box` au singulier avec une
    // part PAR PERSONNE. Il n'y a AUCUNE ventilation par composant à en tirer:
    // la seule chose vraie est la somme — qui est bien, elle, une quantité de
    // bac. Elle sort en `legacy_total_grams`, jamais en `items` fabriqués: un
    // `item` inventé porterait un `term` que personne n'a écrit.
    const [d] = readDishes([{
      title: "Bowl",
      box: {
        id: "box_thu_dinner",
        shares: [
          { member_id: CASIMIR_ID, grams: 300 },
          { member_id: ODALRIC_ID, grams: 200 },
        ],
      },
    }]);
    expect(d.boxes).toEqual([{
      id: "box_thu_dinner",
      member_ids: [CASIMIR_ID, ODALRIC_ID],
      items: [],
      legacy_total_grams: 500,
    }]);
  });

  it("⚠️ CEINTURE ④bis — un `boxes[]` DÉJÀ PLIÉ par le moteur garde son total", () => {
    // ⛔ LE MOTEUR PLIE LUI-MÊME, ET C'EST LE CAS RÉEL TANT QUE LE PROMPT N'EST
    // PAS PASSÉ EN v4. Le parseur lit les deux formes: quand le modèle écrit
    // encore `box` au singulier, ce qui ARRIVE ICI est déjà un `boxes[]` avec
    // `items: []` et le total en `legacy_total_grams`. Sans cette lecture, ce
    // contenant serait jeté pour « rien dedans », le moteur aurait raison et
    // l'écran serait muet — et rien ne dirait lequel des deux a bougé.
    const [d] = readDishes([{
      title: "Bowl",
      boxes: [{
        id: "box_thu_dinner",
        member_ids: [CASIMIR_ID, ODALRIC_ID],
        items: [],
        legacy_total_grams: 500,
      }],
    }]);
    expect(d.boxes).toEqual([{
      id: "box_thu_dinner",
      member_ids: [CASIMIR_ID, ODALRIC_ID],
      items: [],
      legacy_total_grams: 500,
    }]);
  });

  it("⛔ UN CONTENANT v4 NE PORTE JAMAIS DE TOTAL À CÔTÉ DE SES ITEMS", () => {
    // Deux nombres qui doivent s'accorder finissent par diverger. Dès qu'un
    // `item` existe, le total se DÉRIVE — et un `legacy_total_grams` qui
    // traînerait dans la charge est ignoré, jamais rendu à côté.
    const [d] = readDishes([{
      title: "Bowl",
      boxes: [{
        id: "box_thu_dinner",
        member_ids: [CASIMIR_ID],
        items: [{ preparation_id: "prep_chicken", term: "roast chicken", grams: 140 }],
        legacy_total_grams: 9999,
      }],
    }]);
    expect(d.boxes[0].legacy_total_grams).toBeNull();
  });

  it("un plat SANS aucune des deux clés rend `[]` — les plans d'avant le chantier", () => {
    const [d] = readDishes([{ title: "T" }]);
    expect(d.boxes).toEqual([]);
  });

  it("⛔ UN PLAN D'AVANT LE LOT NE VOIT PAS SES ANCIENNES BOÎTES REMONTER", () => {
    // Elles vivaient sous `preparations[].boxes`, en grammes DE CASSEROLE. Les
    // afficher sous un repas serait un gramme juste au mauvais endroit — le
    // seul repli vraiment dangereux. Le lecteur des préparations ne les monte
    // plus du tout, et le plat n'a aucun contenant.
    const [p] = readPreparations([{
      id: "prep_chicken",
      title: "Roast chicken",
      servings_made: 4,
      boxes: [{ id: "box_zoe", member_ids: [CASIMIR_ID], grams: 120 }],
    }]);
    expect(p).not.toHaveProperty("boxes");
    const [d] = readDishes([{
      title: "Bowl",
      uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_zoe" }],
    }]);
    expect(d.boxes).toEqual([]);
  });

  it("⛔ des grammes nuls ou illisibles font tomber l'ITEM, jamais le plat", () => {
    // « 0 g » se lit « n'en mets pas », ce qui est une affirmation. Précédent
    // `readMinutes`: pas de zéro par défaut.
    const [d] = readDishes([{
      title: "T",
      boxes: [{
        id: "box_thu_dinner",
        member_ids: [CASIMIR_ID],
        items: [
          { term: "rice", grams: 0 },
          { term: "chicken", grams: "beaucoup" },
          { term: "", grams: 100 },
          { preparation_id: "prep_rice", term: "rice", grams: 150 },
        ],
      }],
    }]);
    expect(d.boxes).toEqual([{
      id: "box_thu_dinner",
      member_ids: [CASIMIR_ID],
      items: [{ preparation_id: "prep_rice", term: "rice", grams: 150 }],
      legacy_total_grams: null,
    }]);
    expect(d.title).toBe("T");
  });

  it("un contenant sans bouche, sans item ou sans id ne sort pas", () => {
    // Un bac pour personne n'est pas une instruction, et « sers-toi » se dit
    // par l'ABSENCE de contenant — jamais par un contenant vide, qui se lirait
    // comme une pesée qu'on a oublié de remplir.
    const nobody = readDishes([{
      title: "T",
      boxes: [{ id: "b", member_ids: [], items: [{ term: "rice", grams: 10 }] }],
    }])[0].boxes;
    expect(nobody).toEqual([]);
    const nothingIn = readDishes([{
      title: "T",
      boxes: [{ id: "b", member_ids: [CASIMIR_ID], items: [] }],
    }])[0].boxes;
    expect(nothingIn).toEqual([]);
    const noId = readDishes([{
      title: "T",
      boxes: [{ member_ids: [CASIMIR_ID], items: [{ term: "rice", grams: 10 }] }],
    }])[0].boxes;
    expect(noId).toEqual([]);
  });

  it("`preparation_id` absent vaut `null` — ajouté frais le jour même", () => {
    // Le pain qu'on tranche au moment de manger n'est sorti d'aucune casserole,
    // et cette absence est une information: il échappe au contrôle de fournée.
    const [d] = readDishes([{
      title: "T",
      boxes: [{
        id: "b",
        member_ids: [CASIMIR_ID],
        items: [{ term: "sourdough", grams: 60 }],
      }],
    }]);
    expect(d.boxes[0].items[0].preparation_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 — LE MODÈLE DE LECTURE: LES GROUPES, LE COUVERCLE, L'ORDRE DU ROSTER
// ---------------------------------------------------------------------------

describe("boxLinesForDish rend UN contenant par groupe", () => {
  it("⚠️ CEINTURE ① — deux groupes, deux contenants, et le nombre de noms décide", () => {
    const lines = boxLinesForDish(twoBoxDish(), ROSTER);
    expect(lines).toHaveLength(2);
    expect(lines[0].eaters).toEqual(["Peregrine"]);
    expect(lines[0].shared, "un seul nom: la boîte EST sa portion").toBe(false);
    expect(lines[1].eaters).toEqual(["Casimir", "Odalric", "Wilfrid"]);
    expect(lines[1].shared, "plusieurs noms: c'est la quantité du bac").toBe(true);
  });

  it("le total est DÉRIVÉ des items, jamais déclaré", () => {
    const [own, common] = boxLinesForDish(twoBoxDish(), ROSTER);
    expect(own.total).toBe(240);
    expect(common.total).toBe(730);
  });

  it("⚠️ L'ORDRE DES PRÉNOMS SUIT LE ROSTER, PAS LE MODÈLE", () => {
    // Deux contenants du même jour listeraient sinon « Wilfrid + Casimir » puis
    // « Casimir + Wilfrid » selon l'humeur du modèle, et le Boxing cesserait
    // d'être lisible d'un coup d'œil.
    const shuffled = twoBoxDish({
      boxes: [{
        id: "box_thu_dinner_rest",
        member_ids: [WILFRID_ID, CASIMIR_ID, ODALRIC_ID],
        items: [{ preparation_id: null, term: "rice", grams: 300 }],
        legacy_total_grams: null,
      }],
    });
    expect(boxLinesForDish(shuffled, ROSTER)[0].eaters)
      .toEqual(["Casimir", "Odalric", "Wilfrid"]);
  });

  it("⚠️ CEINTURE ⑥ — une bouche ABSENTE de ce repas n'est pas sur le couvercle", () => {
    // Si Wilfrid dîne dehors jeudi, le bac commun porte deux noms et pas trois.
    // Le couvercle dit qui mange, donc il dit aussi qui n'est pas là.
    const away = twoBoxDish({
      boxes: [{
        id: "box_thu_dinner_rest",
        member_ids: [CASIMIR_ID, ODALRIC_ID],
        items: [{ preparation_id: null, term: "rice", grams: 220 }],
        legacy_total_grams: null,
      }],
    });
    const [line] = boxLinesForDish(away, ROSTER);
    expect(line.eaters).toEqual(["Casimir", "Odalric"]);
    expect(line.lid, line.lid).not.toContain("Wilfrid");
    expect(line.eaterCount).toBe(2);
  });

  it("⚠️ CEINTURE ⑧ — au-delà de quatre prénoms, le couvercle porte un compte", () => {
    // Six noms ne se lisent ni sur un bac ni sur un téléphone à 320 px.
    const crowd = ["a", "b", "c", "d", "e"].map((k, i) =>
      person({ memberId: `mem-${k}`, displayName: `Nom${i}` })
    );
    const big = twoBoxDish({
      boxes: [{
        id: "box_big",
        member_ids: crowd.map((p) => p.memberId),
        items: [{ preparation_id: null, term: "rice", grams: 900 }],
        legacy_total_grams: null,
      }],
    });
    const [line] = boxLinesForDish(big, crowd);
    expect(line.eatersLabel).toBe(en["meals.boxes.rest_of_table"].replace("{n}", "5"));
    expect(line.eatersLabel, "un prénom a fui dans le libellé").not.toContain("Nom0");
  });

  it("QUATRE prénoms passent encore en entier — la borne est INCLUSIVE", () => {
    // ⚠️ Le test qui compte est celui de la borne, pas celui du cas moyen: un
    // `>=` écrit à la place d'un `>` ferait tomber le foyer de quatre, qui est
    // le foyer de référence du produit, sans qu'aucun autre test ne bouge.
    const four = ["a", "b", "c", "d"].map((k, i) =>
      person({ memberId: `mem-${k}`, displayName: `Nom${i}` })
    );
    const big = twoBoxDish({
      boxes: [{
        id: "box_four",
        member_ids: four.map((p) => p.memberId),
        items: [{ preparation_id: null, term: "rice", grams: 700 }],
        legacy_total_grams: null,
      }],
    });
    expect(boxLinesForDish(big, four)[0].eatersLabel).toBe("Nom0 + Nom1 + Nom2 + Nom3");
  });

  it("un plan relu SANS ses parts garde ses grammes et perd ses prénoms", () => {
    // Un secondaire, une lecture partielle: aucun prénom à joindre. Le
    // contenant reste vrai, et le couvercle se rend sans nom — un uuid n'a rien
    // à faire à table, mais un poids si.
    const [line] = boxLinesForDish(twoBoxDish(), []);
    expect(line.eaters).toEqual([]);
    expect(line.eatersLabel).toBe("");
    expect(line.total).toBe(240);
    expect(line.lid).toBe("Thursday Dinner — Chicken bowl");
  });

  it("⚠️ CEINTURE ⑤ — un plat cuisiné de zéro n'a AUCUN contenant", () => {
    expect(boxLinesForDish(dish(), ROSTER)).toEqual([]);
  });
});

describe("boxLidLabel — le constructeur unique", () => {
  it("assemble les trois moitiés avec le même séparateur", () => {
    expect(boxLidLabel("Casimir + Odalric", "Thursday Dinner", "Chicken bowl"))
      .toBe("Casimir + Odalric — Thursday Dinner — Chicken bowl");
  });

  it("une moitié manquante rend les autres seules, sans tiret orphelin", () => {
    // « jeudi soir — Riz sauté » sur un plan relu sans ses parts reste un
    // couvercle utile; « — jeudi soir — Riz sauté » se lit comme une panne.
    expect(boxLidLabel("", "Thursday Dinner", "Chicken bowl"))
      .toBe("Thursday Dinner — Chicken bowl");
    expect(boxLidLabel("Casimir", "", "Chicken bowl")).toBe("Casimir — Chicken bowl");
    expect(boxLidLabel("Casimir", "Thursday Dinner", "")).toBe("Casimir — Thursday Dinner");
  });
});

describe("boxLinesForSession liste les CONTENANTS d'une session", () => {
  it("⚠️ CEINTURE ① — 2 repas × 2 groupes ⇒ QUATRE contenants", () => {
    // LE CAS DE RÉFÉRENCE du 2026-08-20: « un repas cuisiné pour 2 sessions,
    // alors il y aura 4 tupperwares ». Le compte est DÉRIVÉ, jamais déclaré.
    const thursday = twoBoxDish({ day: "thu" });
    const friday = twoBoxDish({
      day: "fri",
      boxes: twoBoxDish().boxes.map((b) => ({ ...b, id: `${b.id}_fri` })),
    });
    const lines = boxLinesForSession(["prep_chicken"], [thursday, friday], ROSTER);
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l.id)).toEqual([
      "box_thu_dinner_peregrine",
      "box_thu_dinner_rest",
      "box_thu_dinner_peregrine_fri",
      "box_thu_dinner_rest_fri",
    ]);
  });

  it("la jointure est `uses[].preparation_id`, jamais un titre", () => {
    const thursday = twoBoxDish({ day: "thu" });
    expect(boxLinesForSession(["prep_soup"], [thursday], ROSTER)).toEqual([]);
    expect(boxLinesForSession(["prep_chicken"], [thursday], ROSTER)).toHaveLength(2);
  });

  it("un repas sans contenant n'ajoute aucune ligne", () => {
    const bare = dish({ uses: [{ preparation_id: "prep_chicken", servings: 1, kept: "fridge" as const }] });
    expect(boxLinesForSession(["prep_chicken"], [bare], ROSTER)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3 — CE QUE LE LECTEUR VOIT: LE BOXING, ET LA CARTE D'UN REPAS
// ---------------------------------------------------------------------------

describe("le Boxing rend ce qu'il faut mettre dans chaque bac", () => {
  const lines = boxLinesForSession(["prep_chicken"], [twoBoxDish()], ROSTER);

  it("compte les contenants en tête — on sort ses bacs avant de commencer", () => {
    const text = textOf(createElement(BoxTable, { lines, context: "session" }));
    expect(text).toContain(en["meals.boxes.count_many"].replace("{n}", "2"));
  });

  it("un seul contenant prend la clé du singulier, jamais un suffixe en code", () => {
    const one = textOf(
      createElement(BoxTable, { lines: [lines[0]], context: "session" }),
    );
    expect(one).toContain(en["meals.boxes.count_one"]);
    expect(one).not.toContain(en["meals.boxes.count_many"].replace("{n}", "1"));
  });

  it("dit de QUEL gramme il parle — une seule fois, en tête du bloc", () => {
    // Trois centimètres plus haut, les casseroles affichent du CRU pour la
    // fournée entière. Deux séries de nombres voisines sans cette ligne, c'est
    // le prochain « on comprend pas à quoi ça correspond ».
    const text = textOf(createElement(BoxTable, { lines, context: "session" }));
    expect(occurrences(text, en["meals.boxes.ready_not_raw"])).toBe(1);
  });

  it("montre chaque item avec ses grammes", () => {
    const text = textOf(createElement(BoxTable, { lines, context: "session" }));
    for (const [term, grams] of [
      ["roast chicken", 140],
      ["rice", 100],
      ["roast chicken", 400],
      ["rice", 330],
    ] as const) {
      expect(text, text).toContain(term);
      expect(text, text).toContain(en["meals.boxes.grams"].replace("{n}", String(grams)));
    }
  });

  it("⛔ `· pour n` SEULEMENT sur le bac partagé — la boîte à un nom n'en a pas", () => {
    // C'est la SEULE marque qui distingue les deux lectures du gramme, et elle
    // doit rester bornée: sur un seul nom, « pour 1 » n'apprendrait rien et
    // ferait croire à une part au milieu d'un partage.
    const text = textOf(createElement(BoxTable, { lines, context: "session" }));
    expect(occurrences(text, en["meals.boxes.for_n"].replace("{n}", "3"))).toBe(1);
    expect(text, text).not.toContain(en["meals.boxes.for_n"].replace("{n}", "1"));
  });

  it("un plan v2 relu montre son total, faute d'items — jamais un « ? »", () => {
    const [legacy] = boxLinesForDish(
      dish({
        uses: [{ preparation_id: "prep_chicken", servings: 1, kept: "fridge" as const }],
        boxes: [{
          id: "box_legacy",
          member_ids: [CASIMIR_ID, ODALRIC_ID],
          items: [],
          legacy_total_grams: 500,
        }],
      }),
      ROSTER,
    );
    const text = textOf(createElement(BoxTable, { lines: [legacy], context: "session" }));
    expect(text).toContain(en["meals.boxes.grams"].replace("{n}", "500"));
    expect(text, text).not.toContain("?");
  });

  it("muet quand il n'y a rien à mettre en boîte — pas d'en-tête sur du vide", () => {
    expect(markup(createElement(BoxTable, { lines: [], context: "session" }))).toBe("");
  });

  it("chaque ligne porte son `data-box-id` — auditable sans relire le code", () => {
    const html = markup(createElement(BoxTable, { lines, context: "session" }));
    expect(html).toContain('data-box-id="box_thu_dinner_peregrine"');
    expect(html).toContain('data-box-id="box_thu_dinner_rest"');
  });
});

describe("la carte d'un repas NOMME ses contenants, et ne pèse rien", () => {
  const boxes = boxLinesForDish(twoBoxDish(), ROSTER);

  it("⚠️ CEINTURE ② — AUCUN GRAMME dans le bloc des contenants d'une carte", () => {
    // Le contenant EST la portion: on l'ouvre et on mange. Réafficher un
    // chiffre au moment du repas ferait ressortir la balance à table, ce que le
    // protocole des boîtes existe pour supprimer (arbitrage 2026-08-20).
    const text = textOf(createElement(BoxTable, { lines: boxes, context: "dish" }));
    expect(text, text).not.toMatch(/\d+\s*g\b/);
    for (const grams of [140, 100, 400, 330, 240, 730]) {
      expect(text, text).not.toContain(String(grams));
    }
  });

  it("⚠️ CEINTURE ② (bis) — et pas davantage sur la CARTE ENTIÈRE", () => {
    // Le test ci-dessus juge le composant; celui-ci juge ce que la personne
    // voit. La fixture n'a AUCUN ingrédient du jour, donc tout chiffre suivi
    // d'un « g » qui apparaîtrait ici viendrait forcément des contenants.
    const html = textOf(createElement(DishCard, { dish: twoBoxDish(), boxes }));
    expect(html, html).not.toMatch(/\d+\s*g\b/);
  });

  it("⛔ 2026-08-21 — L'ANNOTATION EST DANS LA CARTE, PAS SOUS ELLE", () => {
    // ══════════════════════════════════════════════════════════════════════
    // LE DÉFAUT, VU À L'ÉCRAN: « c'est entre les deux, on comprend pas ».
    // ══════════════════════════════════════════════════════════════════════
    // Les marqueurs et les parts se rendaient dans `DayPersonSplit`, SOUS la
    // carte, rattachés par la seule proximité — 4 px contre 12 px jusqu'à la
    // suivante. Contre une BORDURE, aucun écart ne rattache quoi que ce soit:
    // ce qui est dehors se lit comme n'appartenant à personne.
    //
    // ⛔ CE TEST EST LA PREUVE DE PROPRIÉTÉ, et c'est tout ce qu'il prouve: la
    // CARTE les rend elle-même. Les remettre dehors la rend muette, et ce test
    // rougit — ce qu'aucune assertion de présence dans `PlanDayBlock` ne peut
    // faire, puisqu'elles passent des deux côtés de la frontière.
    const html = markup(createElement(DishCard, {
      dish: dish({ uses: [{ preparation_id: "prep_chicken", servings: 1, kept: "fridge" as const }] }),
      eaters: [
        { memberId: CASIMIR_ID, name: "Casimir" },
        { memberId: ODALRIC_ID, name: "Odalric" },
      ],
      shares: [{ memberId: CASIMIR_ID, name: "Casimir", note: "sans la sauce" }],
    }));
    expect(html).toContain(`data-eater-member-id="${CASIMIR_ID}"`);
    expect(html).toContain(`data-share-member-id="${CASIMIR_ID}"`);
    const text = textOf(createElement(DishCard, {
      dish: dish({ uses: [{ preparation_id: "prep_chicken", servings: 1, kept: "fridge" as const }] }),
      eaters: [],
      shares: [{ memberId: CASIMIR_ID, name: "Casimir", note: "sans la sauce" }],
    }));
    expect(text).toContain(en["meals.dish.who_eats"]);
    // ⚠️ DEUX FRAGMENTS, PAS UN GABARIT — c'est ce que le composant rend (le
    // prénom porte son style, la note non), et `textOf` insère un blanc entre
    // deux nœuds. Les chercher séparément dit la même chose sans coder la
    // façon dont React a coupé.
    expect(text).toContain("Casimir");
    expect(text).toContain("— sans la sauce");
  });

  it("⛔ JAMAIS LES DEUX — un plat en boîtes n'a pas de seconde réponse", () => {
    // ⛔ LA GARDE QUI FERME LA CONTRADICTION MESURÉE LE 2026-08-20. Sous un
    // couvercle à UN seul nom (`iku — vendredi déjeuner — …`), la phrase de
    // table écrivait « prendre la boîte PARTAGÉE avec iku ». Le nombre de noms
    // sur le couvercle est le seul marqueur de v4, et rien d'autre n'a le droit
    // de répondre à la même question — ni pour la contredire, ni pour la
    // répéter.
    const html = markup(createElement(DishCard, {
      dish: twoBoxDish(),
      boxes,
      eaters: [{ memberId: CASIMIR_ID, name: "Casimir" }],
      shares: [{ memberId: CASIMIR_ID, name: "Casimir", note: "la boîte partagée" }],
    }));
    expect(html).not.toContain("data-eater-member-id");
    expect(html).not.toContain("data-share-member-id");
    expect(html, html).not.toContain("la boîte partagée");
    // ⚠️ ET LE COUVERCLE, LUI, EST TOUJOURS LÀ: la garde retire la SECONDE
    // réponse, pas la première. Sans cette ligne, un bloc qui avalerait tout
    // lirait pareil.
    expect(html).toContain("data-box-id");
  });

  it("⚠️ le prénom d'une part SAUTE quand la voie l'a déjà nommée — TIRET COMPRIS", () => {
    // `name: null` est calculé par `DayPersonSplit`, seul à savoir ce que
    // l'en-tête a écrit. La carte l'applique et ne le devine pas — mais la
    // jointure reste auditable dans le DOM.
    //
    // ⛔ LE TIRET EST LA MOITIÉ DU TEST, ET IL A ÉTÉ AJOUTÉ APRÈS UNE MUTATION
    // QUI SURVIVAIT. La première rédaction ne cherchait que l'absence du
    // prénom: forcer la condition à `true` rendait alors un `<span>` VIDE
    // suivi de « — », donc une ligne qui commence par un tiret orphelin — et
    // aucune assertion ne bougeait. On lit donc le contenu de la ligne
    // ELLE-MÊME, et le cas qui passe est juste à côté.
    const lineOf = (html: string) => {
      const from = html.indexOf(`data-share-member-id="${CASIMIR_ID}"`);
      return html.slice(from, html.indexOf("</li>", from));
    };
    const anonymous = lineOf(markup(createElement(DishCard, {
      dish: dish({ uses: [{ preparation_id: "prep_chicken", servings: 1, kept: "fridge" as const }] }),
      shares: [{ memberId: CASIMIR_ID, name: null, note: "sans la sauce" }],
    })));
    expect(anonymous).toContain("sans la sauce");
    expect(anonymous, anonymous).not.toContain("Casimir");
    expect(anonymous, anonymous).not.toContain("—");

    // ⚠️ LE CAS QUI PASSE: quand la voie n'a nommé personne, le prénom et son
    // tiret sont là. Sans cette moitié, une carte qui n'écrirait JAMAIS le
    // prénom lirait pareil.
    const named = lineOf(markup(createElement(DishCard, {
      dish: dish({ uses: [{ preparation_id: "prep_chicken", servings: 1, kept: "fridge" as const }] }),
      shares: [{ memberId: CASIMIR_ID, name: "Casimir", note: "sans la sauce" }],
    })));
    expect(named).toContain("Casimir");
    expect(named).toContain("—");
  });

  it("⚠️ CEINTURE ① — LE COUVERCLE EST LE MÊME CARACTÈRE POUR CARACTÈRE", () => {
    // ⛔ LA CEINTURE QUI VAUT LE LOT. On tient un bac dans la main et on cherche
    // la même suite de mots à l'écran: deux constructions divergentes feraient
    // échouer cette comparaison-là, sur l'objet dont le seul travail est de
    // trancher. Le libellé est donc construit UNE fois (`boxLidLabel`) et rendu
    // tel quel des deux côtés.
    const inBoxing = textOf(createElement(BoxTable, { lines: boxes, context: "session" }));
    const onCard = textOf(createElement(DishCard, { dish: twoBoxDish(), boxes }));
    for (const line of boxes) {
      expect(line.lid, "le couvercle est vide").not.toBe("");
      expect(inBoxing, inBoxing).toContain(line.lid);
      expect(onCard, onCard).toContain(line.lid);
    }
  });

  it("⚠️ CEINTURE ③ — le couvercle ne dépend PAS des préparations", () => {
    // `/app/today` — l'écran où l'on OUVRE la boîte — ne passe pas `sources`.
    // Un libellé qui en dépendrait serait complet sur `/app/plan` et amputé là
    // où on le lit vraiment. On monte donc les deux et on exige le même mot.
    const withPreps = textOf(createElement(DishCard, {
      dish: twoBoxDish(),
      boxes,
      sources: [{ title: "Roast chicken", cookOn: "mon" }],
    }));
    const without = textOf(createElement(DishCard, { dish: twoBoxDish(), boxes }));
    for (const line of boxes) {
      expect(withPreps, withPreps).toContain(line.lid);
      expect(without, without).toContain(line.lid);
    }
  });

  it("le couvercle apparaît UNE fois par contenant, jamais une par reprise", () => {
    const twoLots = twoBoxDish({
      uses: [
        { preparation_id: "prep_chicken", servings: 4, kept: "fridge" as const },
        { preparation_id: "prep_rice", servings: 4, kept: "fridge" as const },
      ],
    });
    const text = textOf(createElement(DishCard, {
      dish: twoLots,
      boxes: boxLinesForDish(twoLots, ROSTER),
    }));
    for (const line of boxes) expect(occurrences(text, line.lid)).toBe(1);
  });

  it("un plat sans contenant ne rend aucun bloc — le cas majoritaire", () => {
    const html = markup(createElement(DishCard, { dish: dish(), boxes: [] }));
    expect(html).not.toContain(en["meals.boxes.title_dish"]);
    expect(html).not.toContain(fr["meals.boxes.title_dish"]);
  });

  it("⛔ TOUT MONTAGE DE `DishCard` PASSE `boxes`", () => {
    // La prop a un défaut (`[]`) parce qu'un plan individuel n'a rien à mettre
    // en boîte — mais un défaut silencieux est aussi ce qui ferait disparaître
    // les contenants d'un écran neuf sans un seul rouge. Le test compte les
    // sites sur le DISQUE, il n'en énumère aucun.
    const sites = mountSitesOf("<DishCard");
    expect(sites.length, "plus aucun montage trouvé — le scanner est cassé")
      .toBeGreaterThan(0);
    for (const [file, jsx] of sites) {
      expect(jsx, `${file} monte DishCard sans \`boxes\``).toContain("boxes=");
    }
  });
});

// ---------------------------------------------------------------------------
// 4 — LE BLOC DU JOUR: ACHETER, CUISINER, MANGER
// ---------------------------------------------------------------------------

describe("le jour suit l'ordre des gestes", () => {
  const thursday = twoBoxDish({ day: "thu" });
  const dayBlock = createElement(PlanDayBlock, {
    group: { day: "thu", dishes: [thursday] },
    date: "2026-08-20",
    today: "2026-08-20",
    preparations: [prep(), prep({ id: "prep_rice", title: "Rice" })],
    allDishes: [thursday],
    cookingSessions: [{
      day: "thu",
      preparation_ids: ["prep_chicken"],
      run_through: "Chicken first, then the rice.",
      total_minutes: 60,
    }],
    wave: { buyOn: "thu", servesCookOn: "thu", indices: [0, 1] },
    shoppingList: [
      { term: "chicken thighs", quantity: "1 kg", aisle: "meat", food_group: "poultry" },
      { term: "rice", quantity: "500 g", aisle: "grocery", food_group: "whole_grain" },
    ],
    moments: [],
    portions: ROSTER,
  });

  it("⚠️ CEINTURE ⑨ — LES COURSES SONT AU-DESSUS DE LA SESSION DE CUISINE", () => {
    // « La liste de course doit toujours être en haut de la journée »
    // (2026-08-20). On achète, puis on cuisine, puis on mange — et deux des
    // trois blocs manquent la plupart des jours, ce qui est exactement pourquoi
    // l'ordre porte l'information et pourquoi aucun numéro d'étape ne le fait.
    const text = textOf(dayBlock);
    const groceries = text.indexOf(en["meals.result.day_groceries_many"].split(" — ")[0]);
    const session = text.indexOf(en["meals.result.day_session"]);
    expect(groceries, "le bloc de courses ne se rend pas").toBeGreaterThan(-1);
    expect(session, "le bloc de session ne se rend pas").toBeGreaterThan(-1);
    expect(groceries, `courses=${groceries} session=${session}`).toBeLessThan(session);
  });

  it("le Boxing est DANS la carte de session, et il porte ses deux contenants", () => {
    const text = textOf(dayBlock);
    expect(text).toContain(en["meals.boxes.title"]);
    expect(text).toContain(en["meals.boxes.count_many"].replace("{n}", "2"));
  });

  it("⛔ le Boxing vient APRÈS la matière et la méthode de la casserole", () => {
    // On lit ce qu'il y a dans la casserole, comment on la cuit, PUIS dans quoi
    // on la répartit. L'inverse ferait peser avant d'avoir cuit.
    const text = textOf(dayBlock);
    expect(text.indexOf("Roast it.")).toBeLessThan(text.indexOf(en["meals.boxes.title"]));
  });
});

// ---------------------------------------------------------------------------
// 5 — CE QU'ON AJOUTE LE JOUR MÊME
// ---------------------------------------------------------------------------

describe("les ingrédients du jour disent qu'ils s'ajoutent au lot", () => {
  const withExtras = twoBoxDish({
    ingredients: [
      { term: "feta", quantity: "60 g", aisle: "dairy", in_pantry: false },
    ] as GeneratedDish["ingredients"],
  });

  it("le titre paraît quand le plat PUISE dans un lot", () => {
    const text = textOf(createElement(DishCard, {
      dish: withExtras,
      boxes: boxLinesForDish(withExtras, ROSTER),
    }));
    expect(text).toContain(en["meals.result.extra_ingredients"]);
    expect(text).toContain("feta");
  });

  it("⛔ ET IL SE TAIT SUR UN PLAT CUISINÉ DE ZÉRO", () => {
    // Sans lot, ces ingrédients SONT la recette entière: écrire « en plus du
    // lot » au-dessus affirmerait un lot qui n'existe pas. Même discipline que
    // `same_day: null` — on se tait plutôt que d'écrire un fait que personne
    // n'a écrit.
    const scratch = dish({
      uses: [],
      ingredients: withExtras.ingredients,
    });
    const text = textOf(createElement(DishCard, { dish: scratch, boxes: [] }));
    expect(text).toContain("feta");
    expect(text, text).not.toContain(en["meals.result.extra_ingredients"]);
    expect(text, text).not.toContain(fr["meals.result.extra_ingredients"]);
  });
});
