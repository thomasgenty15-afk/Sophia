import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { SessionPreparation } from "./CookingSessions";
import DishCard from "./DishCard";
import PlanDayBlock from "./plan/PlanDayBlock";
import { BoxTable } from "./plan/BoxTable";
import type {
  GeneratedDish,
  MealPreparation,
  MemberPortionView,
} from "../api/mealGeneration";
import { readDishes, readPreparations } from "../api/mealGeneration";
import { boxLineForUse, boxLinesFor } from "../lib/preparationBoxes";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

// ===========================================================================
// LOT 4 (2026-08-17) — LES GRAMMES PAR PERSONNE, SUR LA VALEUR RENDUE
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
// ===========================================================================

const ZOE_ID = "mem-zoe";
const NINA_ID = "mem-nina";

function person(over: Partial<MemberPortionView> = {}): MemberPortionView {
  return {
    memberId: ZOE_ID,
    displayName: "Zoé",
    portionNote: null,
    shares: [],
    ...over,
  };
}

const ZOE = person();
const NINA = person({ memberId: NINA_ID, displayName: "Nina" });

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
    boxes: [],
    ...over,
  };
}

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Chicken bowl",
    slot: "lunch",
    day: "tue",
    method: "",
    why: "",
    ingredients: [],
    uses: [],
    same_day: null,
    member_id: null,
    ...over,
  } as GeneratedDish;
}

function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function textOf(node: React.ReactElement): string {
  return decode(renderToStaticMarkup(node)).replace(/<[^>]*>/g, "");
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
 *
 * Rend `[file, jsx]` par montage, `jsx` étant les attributs jusqu'au `/>`.
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

describe("LOT 4 · readPreparations lit les boîtes", () => {
  it("⛔ les boîtes traversent le lecteur (le défaut de famille de ce chantier)", () => {
    // Trois fois cette semaine, un champ écrit par le serveur a été PERDU par
    // son lecteur front, sous un câblage vert: `shoppingList`, `member_id`,
    // `member_portions`. C'est le test qui ferme la même porte pour `boxes`.
    const [p] = readPreparations([{
      id: "prep_chicken",
      title: "Roast chicken",
      servings_made: 4,
      boxes: [
        { id: "box_zoe", member_ids: [ZOE_ID], grams: 120 },
        { id: "box_nina", member_ids: [NINA_ID, ZOE_ID], grams: 200 },
      ],
    }]);
    expect(p.boxes).toEqual([
      { id: "box_zoe", member_ids: [ZOE_ID], grams: 120 },
      { id: "box_nina", member_ids: [NINA_ID, ZOE_ID], grams: 200 },
    ]);
  });

  it("une préparation SANS la clé rend `[]` — les plans d'avant le lot", () => {
    const [p] = readPreparations([{ id: "p", title: "T", servings_made: 2 }]);
    expect(p.boxes).toEqual([]);
  });

  it("⛔ des grammes nuls ou illisibles font tomber la boîte, jamais la préparation", () => {
    // « 0 g » se lit « ne mange rien », ce qui est une affirmation. Précédent
    // `readMinutes`: pas de zéro par défaut.
    const [p] = readPreparations([{
      id: "p",
      title: "T",
      servings_made: 2,
      boxes: [
        { id: "b1", member_ids: [ZOE_ID], grams: 0 },
        { id: "b2", member_ids: [ZOE_ID], grams: "beaucoup" },
        { id: "", member_ids: [ZOE_ID], grams: 100 },
        { id: "b4", member_ids: [], grams: 100 },
        { id: "b5", member_ids: [ZOE_ID], grams: 150 },
      ],
    }]);
    expect(p.boxes).toEqual([{ id: "b5", member_ids: [ZOE_ID], grams: 150 }]);
  });
});

describe("LOT 4 · readDishes lit la boîte que cite une reprise", () => {
  it("le `box_id` traverse, et la chaîne vide vaut `null`", () => {
    const [d] = readDishes([{
      title: "T",
      uses: [
        { preparation_id: "p1", servings: 1, box_id: "box_zoe" },
        { preparation_id: "p2", servings: 1, box_id: "  " },
        { preparation_id: "p3", servings: 1 },
      ],
    }]);
    expect(d.uses.map((u) => u.box_id)).toEqual(["box_zoe", null, null]);
  });
});

// ---------------------------------------------------------------------------
// 2 — LA JOINTURE, PAR ID ET JAMAIS PAR TITRE
// ---------------------------------------------------------------------------

describe("LOT 4 · boxLinesFor résout les prénoms", () => {
  const boxed = prep({
    boxes: [
      { id: "box_shared", member_ids: [NINA_ID, ZOE_ID], grams: 300 },
      { id: "box_zoe", member_ids: [ZOE_ID], grams: 120 },
    ],
  });

  it("⚠️ L'ORDRE DES PRÉNOMS SUIT LE ROSTER, jamais celui du modèle", () => {
    // Deux boîtes de la même casserole liraient sinon « Zoé, Nina » et
    // « Nina, Zoé » selon l'humeur du modèle: la table cesserait d'être
    // lisible d'un coup d'œil.
    expect(boxLinesFor(boxed, [ZOE, NINA])).toEqual([
      { id: "box_shared", names: ["Zoé", "Nina"], grams: 300 },
      { id: "box_zoe", names: ["Zoé"], grams: 120 },
    ]);
  });

  it("une bouche que le plan ne nomme plus disparaît des prénoms, jamais en uuid", () => {
    expect(boxLinesFor(boxed, [ZOE])).toEqual([
      { id: "box_shared", names: ["Zoé"], grams: 300 },
      { id: "box_zoe", names: ["Zoé"], grams: 120 },
    ]);
    // Sans aucune part, les grammes restent: l'instruction de pesée est vraie.
    expect(boxLinesFor(boxed, [])).toEqual([
      { id: "box_shared", names: [], grams: 300 },
      { id: "box_zoe", names: [], grams: 120 },
    ]);
  });
});

describe("LOT 4 · boxLineForUse joint par identifiant", () => {
  const preps = [prep({ boxes: [{ id: "box_zoe", member_ids: [ZOE_ID], grams: 120 }] })];

  it("LE CAS QUI PASSE: la reprise qui cite une boîte la trouve", () => {
    const use = { preparation_id: "prep_chicken", servings: 1, box_id: "box_zoe" };
    expect(boxLineForUse(use, preps, [ZOE])).toEqual({
      id: "box_zoe",
      names: ["Zoé"],
      grams: 120,
    });
  });

  it("sans `box_id`, ou sur un identifiant orphelin, la carte se tait", () => {
    expect(
      boxLineForUse({ preparation_id: "prep_chicken", servings: 1, box_id: null }, preps, [ZOE]),
    ).toBeNull();
    expect(
      boxLineForUse(
        { preparation_id: "prep_chicken", servings: 1, box_id: "box_nowhere" },
        preps,
        [ZOE],
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3 — CE QUE LE LECTEUR VOIT
// ---------------------------------------------------------------------------

describe("LOT 4 · la table de pesée, rendue", () => {
  it("⛔ « Box Zoé — 120 g » est RENDU, pas seulement câblé", () => {
    const html = textOf(createElement(BoxTable, {
      lines: [
        { id: "box_zoe", names: ["Zoé"], grams: 120 },
        { id: "box_nina", names: ["Nina"], grams: 200 },
      ],
    }));
    expect(occurrences(html, "Box Zoé — 120 g"), html).toBe(1);
    expect(occurrences(html, "Box Nina — 200 g"), html).toBe(1);
    expect(html).toContain(en["meals.boxes.title"]);
  });

  it("⚠️ SANS BOÎTE, RIEN — pas d'en-tête au-dessus du vide", () => {
    expect(renderToStaticMarkup(createElement(BoxTable, { lines: [] }))).toBe("");
  });

  it("sans prénom joignable, le poids reste et l'identifiant ne sort JAMAIS", () => {
    const html = decode(renderToStaticMarkup(createElement(BoxTable, {
      lines: [{ id: "box_zoe", names: [], grams: 120 }],
    })));
    expect(html.replace(/<[^>]*>/g, "")).toContain("One box — 120 g");
    // L'identifiant est dans le DOM comme attribut auditable, jamais en texte.
    expect(html).toContain('data-box-id="box_zoe"');
    expect(html.replace(/<[^>]*>/g, "")).not.toContain("box_zoe");
  });

  it("⛔ AUCUN POURQUOI n'entre dans la table: le type n'a pas de champ pour ça", () => {
    const src = code("src/keel/lib/preparationBoxes.ts") +
      code("src/keel/components/plan/BoxTable.tsx");
    for (const forbidden of ["goal", "kcal", "calorie", "weightKg", "heightCm"]) {
      expect(src, `« ${forbidden} » est entré dans la mise en boîtes`)
        .not.toMatch(new RegExp(forbidden, "i"));
    }
  });

  it("⛔ AUCUN MATCHER DE TITRE dans la jointure des boîtes", () => {
    const src = code("src/keel/lib/preparationBoxes.ts");
    for (const forbidden of [
      ".title.includes",
      "title.toLowerCase",
      "title.match",
      "title.indexOf",
    ]) {
      expect(src, `un matcher de titre est revenu (${forbidden})`).not.toContain(forbidden);
    }
    // …et la jointure réelle est bien celle par identifiant.
    expect(src).toContain("b.id === use.box_id");
    expect(src).toContain("member_ids");
  });
});

describe("LOT 4 · la préparation dans sa session de cuisine", () => {
  // ⚠️ `SessionPreparation` ET PAS `CookingSessions`: la fenêtre rend par
  // `createPortal` vers `document.body`, et ce dépôt teste en environnement
  // `node`. C'est le sous-composant qui porte la valeur, donc c'est lui qu'on
  // monte — plutôt qu'un test de source, qui a déjà menti deux fois ici.
  function sessionText(over: Partial<MealPreparation> = {}): string {
    return textOf(createElement(SessionPreparation, {
      prep: prep(over),
      feeds: [],
      portions: [ZOE, NINA],
      open: false,
      onToggle: () => {},
    }));
  }

  it("⛔ la table de pesée s'affiche sous la préparation, RECETTE FERMÉE", () => {
    const html = sessionText({
      boxes: [
        { id: "box_zoe", member_ids: [ZOE_ID], grams: 120 },
        { id: "box_nina", member_ids: [NINA_ID], grams: 200 },
      ],
    });
    expect(occurrences(html, "Box Zoé — 120 g"), html).toBe(1);
    expect(occurrences(html, "Box Nina — 200 g"), html).toBe(1);
  });

  it("⛔ « — 1 servings » N'EXISTE PLUS (le pluriel mort, mesuré)", () => {
    // C'était le cas NOMINAL aux barreaux ② et ③ de la fusion: une préparation
    // d'UNE portion, c'est-à-dire précisément le plat dédié que ce chantier
    // vient de rendre visible.
    const html = sessionText({ servings_made: 1 });
    expect(html, html).toContain("— 1 serving");
    expect(html, html).not.toContain("— 1 servings");
  });

  it("⚠️ ET LE PLURIEL RESTE JUSTE AU-DESSUS DE UN (le cas qui passe)", () => {
    expect(sessionText({ servings_made: 4 })).toContain("— 4 servings");
  });
});

describe("LOT 4 · la carte d'un plat cite sa boîte", () => {
  it("⛔ « Box Zoé — 120 g » remplace la balance du jour J", () => {
    const html = textOf(createElement(DishCard, {
      dish: dish({ uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_zoe" }] }),
      sources: [{
        title: "Roast chicken",
        cookOn: "mon",
        box: { names: ["Zoé"], grams: 120 },
      }],
    }));
    expect(occurrences(html, "Box Zoé — 120 g"), html).toBe(1);
  });

  it("⚠️ SANS BOÎTE, la provenance seule — les plans d'avant le lot", () => {
    const html = textOf(createElement(DishCard, {
      dish: dish({ uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: null }] }),
      sources: [{ title: "Roast chicken", cookOn: "mon", box: null }],
    }));
    expect(html).toContain("Roast chicken");
    expect(html, html).not.toContain(" g");
  });
});

describe("LOT 4 · la part d'une bouche, dans la vue jour", () => {
  const preparations = [prep({
    boxes: [
      { id: "box_zoe", member_ids: [ZOE_ID], grams: 120 },
      { id: "box_nina", member_ids: [NINA_ID], grams: 220 },
    ],
  })];
  const bowls = dish({
    uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: "box_zoe" }],
  });

  function dayText(portions: readonly MemberPortionView[]): string {
    return textOf(createElement(PlanDayBlock, {
      group: { day: "tue", dishes: [bowls] },
      date: "2026-08-18",
      today: "2026-08-18",
      preparations,
      cookingSessions: [],
      wave: null,
      shoppingList: [],
      moments: [],
      portions,
    }));
  }

  it("⛔ la part de Zoé porte SES grammes, et jamais ceux de Nina", () => {
    // ⚠️ LA JOINTURE EST DOUBLE ET ELLE EST PAR ID: le plat cite `box_zoe`, la
    // boîte liste Zoé. Une erreur ici servirait 220 g à la place de 120.
    const text = dayText([
      person({ shares: [{ preparationId: "prep_chicken", note: "ta part de poulet" }] }),
      person({
        memberId: NINA_ID,
        displayName: "Nina",
        shares: [{ preparationId: "prep_chicken", note: "ta part de poulet" }],
      }),
    ]);
    // DEUX FOIS « 120 g », ET C'EST JUSTE: la carte du plat cite la boîte
    // (« Box Zoé — 120 g ») et la ligne de part la répète sous son prénom. Les
    // deux surfaces répondent à deux questions — « quelle boîte je sors » et
    // « ce que Zoé prend ici » — et c'est le MÊME nombre, ce que ce test
    // vérifie. ZÉRO fois « 220 g »: la boîte de Nina n'est pas citée par ce
    // plat, et rien ne doit la faire apparaître.
    expect(occurrences(text, "120 g"), text).toBe(2);
    expect(occurrences(text, "220 g"), text).toBe(0);
  });

  it("⚠️ SANS BOÎTE CITÉE, la part reste la phrase seule (le cas qui passe)", () => {
    const text = textOf(createElement(PlanDayBlock, {
      group: {
        day: "tue",
        dishes: [dish({ uses: [{ preparation_id: "prep_chicken", servings: 1, box_id: null }] })],
      },
      date: "2026-08-18",
      today: "2026-08-18",
      preparations,
      cookingSessions: [],
      wave: null,
      shoppingList: [],
      moments: [],
      portions: [
        person({ shares: [{ preparationId: "prep_chicken", note: "ta part de poulet" }] }),
        person({
          memberId: NINA_ID,
          displayName: "Nina",
          shares: [{ preparationId: "prep_chicken", note: "ta part de poulet" }],
        }),
      ],
    }));
    expect(text).toContain("ta part de poulet");
    expect(text, text).not.toContain(" g");
  });

  it("⛔ la table de pesée du jour est rendue avec la session de CE jour", () => {
    const text = textOf(createElement(PlanDayBlock, {
      group: { day: "mon", dishes: [] },
      date: "2026-08-17",
      today: "2026-08-18",
      preparations,
      cookingSessions: [{
        day: "mon",
        preparation_ids: ["prep_chicken"],
        run_through: "Roast, then box.",
        total_minutes: 60,
      }],
      wave: null,
      shoppingList: [],
      moments: [],
      portions: [ZOE, NINA],
    }));
    expect(occurrences(text, "Box Zoé — 120 g"), text).toBe(1);
    expect(occurrences(text, "Box Nina — 220 g"), text).toBe(1);
  });
});

describe("LOT 4 · les deux langues", () => {
  it("chaque clé neuve existe dans les DEUX packs", () => {
    for (
      const key of [
        "meals.boxes.title",
        "meals.boxes.line",
        "meals.boxes.line_unnamed",
        "meals.boxes.grams",
        "meals.sessions.makes_one",
      ] as const
    ) {
      expect(en[key], `${key} manque à l'anglais`).toBeTruthy();
      expect(fr[key], `${key} manque au français`).toBeTruthy();
    }
  });

  it("⚠️ LES LIBELLÉS SONT RÉDIGÉS, PAS RECOPIÉS — sauf le symbole d'unité", () => {
    // « g » est le symbole international du gramme: il s'écrit pareil des deux
    // côtés, et `meals.boxes.grams` porte son exception dans `parity`. Les
    // deux libellés voisins, eux, diffèrent bien.
    expect(fr["meals.boxes.title"]).not.toBe(en["meals.boxes.title"]);
    expect(fr["meals.boxes.line"]).not.toBe(en["meals.boxes.line"]);
    expect(fr["meals.boxes.grams"]).toBe(en["meals.boxes.grams"]);
  });
});

// ---------------------------------------------------------------------------
// 8 — LE CÂBLAGE DES PRÉNOMS (défaut trouvé par la vérification du LOT 4)
// ---------------------------------------------------------------------------

describe("LOT 4 · une boîte sans nom n'est pas une instruction", () => {
  // ⛔ CE QUI EST MESURÉ ICI, ET CE QUE ÇA A COÛTÉ. `portions` est née
  // `portions?: … = []` sur `CookingSessions`. Le montage de `/app/today`
  // (`KitchenToday.tsx`) ne la passait pas, et le compilateur n'avait rien à
  // dire: la table de pesée de cet écran rendait « Une boîte — 120 g » autant
  // de fois qu'il y a de bouches — trois grammages, aucun nom, et personne ne
  // sait quelle boîte sortir. « Paramètre de garde optionnel = garde désarmée. »
  //
  // Deux gardes, pas une: la prop est désormais REQUISE (le compilateur tient
  // les montages) et ce test tient la VALEUR — un test de source seul a déjà
  // menti deux fois dans ce chantier.

  it("⛔ SANS PARTS, la table perd les noms — le fait que le défaut produisait", () => {
    const html = textOf(createElement(SessionPreparation, {
      prep: prep({
        boxes: [
          { id: "box_zoe", member_ids: [ZOE_ID], grams: 120 },
          { id: "box_nina", member_ids: [NINA_ID], grams: 200 },
        ],
      }),
      feeds: [],
      portions: [],
      open: false,
      onToggle: () => {},
    }));
    // La ligne survit — l'instruction de pesée reste vraie — mais elle ne dit
    // plus À QUI. C'est exactement ce que `/app/today` affichait.
    expect(occurrences(html, "One box — 120 g"), html).toBe(1);
    expect(occurrences(html, "One box — 200 g"), html).toBe(1);
    expect(html, html).not.toContain("Zoé");
    expect(html, html).not.toContain("Nina");
  });

  it("⛔ CHAQUE MONTAGE DE `CookingSessions` PASSE SES PARTS", () => {
    // Le test qui aurait attrapé le défaut, et qui attrapera le TROISIÈME
    // montage du jour où quelqu'un l'écrit. Il lit les SITES D'APPEL, pas la
    // définition: c'est là que l'oubli se produit.
    //
    // ⚠️ LES SITES SONT DÉCOUVERTS, JAMAIS ÉNUMÉRÉS. Une liste de chemins écrite
    // à la main resterait verte le jour où quelqu'un ajoute un quatrième écran —
    // c'est-à-dire exactement le jour où ce test devrait mordre.
    const found = mountSitesOf("<CookingSessions");
    expect(found.length, "aucun montage de CookingSessions trouvé").toBeGreaterThan(0);
    for (const [file, jsx] of found) {
      expect(jsx, `${file}: un montage de CookingSessions sans \`portions\``)
        .toContain("portions=");
    }
  });
});
