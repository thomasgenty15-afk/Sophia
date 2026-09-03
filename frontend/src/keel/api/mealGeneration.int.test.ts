import { describe, expect, it } from "vitest";
import {
  cookedPlans,
  dishDaySplit,
  type GeneratedDish,
  type GeneratedMealResult,
  readDishes,
} from "./mealGeneration";

// ===========================================================================
// LES PLATS DU JOUR — la seule chose qui décide ce que `/app/today` affiche
//
// LE DÉFAUT QUE CE FICHIER GARDE. `/app/today` ne lisait que `plan_versions`,
// que personne n'écrit dans le modèle qu'on livre, et affichait donc « tu n'as
// pas encore de plan » à un élève qui venait de composer sa semaine entière.
// Le lecteur existe maintenant, et tout ce qui le sépare d'un mensonge tient
// dans cette fonction: mettre le mauvais plat dans « aujourd'hui » est
// exactement le genre d'erreur qu'un écran ne signale jamais.
//
// Les deux propriétés testées sont donc celles d'une partition — RIEN
// D'INVENTÉ (aucun plat d'un autre jour ne remonte dans la liste du jour) et
// RIEN DE PERDU (un plat sans jour reste visible au lieu d'être jeté).
// ===========================================================================

function dish(title: string, day: string | null): GeneratedDish {
  return {
    title,
    slot: null,
    day,
    ingredients: [],
    method: "",
    why: "",
    uses: [],
    // LOT 2 — `null` = le geste du jour n'a pas été déclaré. Le partage par
    // jour n'en lit rien; le remplir ici ferait croire qu'il en dépend.
    same_day: null,
  };
}

describe("dishDaySplit", () => {
  it("garde le jour demandé et écarte les autres", () => {
    const split = dishDaySplit(
      [dish("mardi", "tue"), dish("mercredi", "wed"), dish("mardi bis", "tue")],
      "tue",
    );
    expect(split.today.map((d) => d.title)).toEqual(["mardi", "mardi bis"]);
    expect(split.anyDay).toEqual([]);
  });

  // Un plat sans jour n'est pas une anomalie: la portée « un jour » n'en nomme
  // aucun. Le glisser dans la liste du jour dirait « c'est pour aujourd'hui »
  // à quelqu'un à qui personne ne l'a dit.
  it("met à part les plats sans jour au lieu de les dater", () => {
    const split = dishDaySplit([dish("libre", null), dish("mardi", "tue")], "tue");
    expect(split.today.map((d) => d.title)).toEqual(["mardi"]);
    expect(split.anyDay.map((d) => d.title)).toEqual(["libre"]);
  });

  // ... et sans les perdre non plus: c'est un plat qu'on a composé pour lui.
  it("ne perd rien quand aucun plat ne vise le jour", () => {
    const split = dishDaySplit([dish("libre", null), dish("lundi", "mon")], "tue");
    expect(split.today).toEqual([]);
    expect(split.anyDay.map((d) => d.title)).toEqual(["libre"]);
  });

  it("rend deux listes vides sur une composition vide", () => {
    expect(dishDaySplit([], "tue")).toEqual({ today: [], anyDay: [] });
  });
});

// ===========================================================================
// LE LECTEUR DE PLATS — ce qui sépare une ligne EN BASE d'un écran blanc
//
// LE DÉFAUT QUE CE BLOC GARDE. `loadLatestGeneratedMeal` castait le JSONB de
// `student_generated_meals.dishes` en `GeneratedDish[]`. Le cast compile, donc
// `dish.uses` était réputé exister — mais les compositions écrites avant que
// `uses` n'arrive n'ont pas la clé, et l'écran les ouvre encore. `dish.uses.map`
// jetait alors tout `MealBuilder` dans son ErrorBoundary: l'élève perdait sa
// semaine entière pour un champ absent, sur le chemin le plus ordinaire qui
// soit — recharger la page.
//
// La propriété tenue ici est donc: UN PLAT VENU DE LA BASE EST TOUJOURS
// RENDABLE. Pas « le lecteur est tolérant » — les champs que l'écran parcourt
// sont des tableaux, quoi que la ligne contienne.
// ===========================================================================

describe("readDishes", () => {
  // Le plat exact qui cassait: une ligne d'avant les préparations.
  it("donne un `uses` vide au plat d'une composition antérieure au champ", () => {
    const [dish] = readDishes([
      { title: "Poulet rôti", day: "tue", slot: "dinner", method: "", why: "" },
    ]);
    expect(dish.uses).toEqual([]);
    expect(dish.ingredients).toEqual([]);
  });

  // Ce que l'écran fait vraiment, ligne 470 de MealBuilder: parcourir les deux.
  it("rend parcourables les champs que l'écran parcourt", () => {
    for (const raw of [{}, { uses: null }, { ingredients: "pas un tableau" }]) {
      const [dish] = readDishes([raw]);
      expect(() => dish.uses.map((u) => u.preparation_id)).not.toThrow();
      expect(() => dish.ingredients.map((i) => i.term)).not.toThrow();
    }
  });

  // Une référence sans préparation ne pointe sur rien: la garder ferait dire
  // « servi depuis » à une carte qui n'a aucune source à nommer.
  it("garde les `uses` réels et jette ceux qui ne nomment aucune préparation", () => {
    const [dish] = readDishes([{
      title: "Bowl",
      uses: [
        { preparation_id: "prep_poulet", servings: 2, kept: "freezer" },
        { servings: 1 },
        { preparation_id: "prep_riz" },
      ],
    }]);
    expect(dish.uses).toEqual([
      // ⚠️ `box_id` A QUITTÉ LA REPRISE LE 2026-08-19. Le repas porte sa boîte
      // (`dishes[].box`), plus rien ne la cite: une reprise dit d'où vient le
      // lot, et c'est tout ce qu'elle a jamais eu à dire.
      //
      // ⟳ 2026-09-01 — `kept` L'A REJOINTE, ET CE TEST EST LA GARDE QUI L'A
      // EXIGÉ. Ce n'est pas une décoration: c'est la CAUSE de l'ouverture de
      // la fenêtre du cuit, et l'écran s'en sert pour dire « sors-la la
      // veille ». Une part servie au-delà de trois jours sans ce mot est un
      // plat qu'on découvre gelé à 19 h.
      { preparation_id: "prep_poulet", servings: 2, kept: "freezer" },
      // Sans portion nommée, une part: le plat en prélève, la question est
      // combien, et zéro serait un prélèvement qui n'a pas lieu.
      //
      // ⚠️ ET SANS `kept`, LE FRIGO: le non-dit est le STRICT, des deux côtés
      // de la frontière. Un plan écrit avant le champ ne se met pas à annoncer
      // des décongélations que personne n'a écrites.
      { preparation_id: "prep_riz", servings: 1, kept: "fridge" },
    ]);
  });

  it("rend une liste vide sur ce qui n'est pas un tableau", () => {
    expect(readDishes(null)).toEqual([]);
    expect(readDishes({ dishes: [] })).toEqual([]);
  });

  // =========================================================================
  // LOT 2 — LE GESTE DU JOUR J, RELU D'UNE LIGNE
  //
  // Même propriété que `uses` ci-dessus, sur un champ arrivé le 2026-08-17:
  // l'écran ouvre encore des plans écrits avant lui. Et une seconde, propre à
  // ce champ: le libellé du bandeau est composé par CLÉ
  // (`meals.same_day.<jeton>`), donc un jeton inconnu qui passerait ferait
  // demander une clé i18n inexistante — ce qui LÈVE en DEV.
  // =========================================================================

  it("un plan écrit AVANT le champ n'a pas de geste du jour, et ça se lit `null`", () => {
    const [dish] = readDishes([
      { title: "Poulet rôti", day: "tue", slot: "dinner", method: "", why: "" },
    ]);
    expect(dish.same_day).toBeNull();
  });

  it("les quatre jetons passent, et rien d'autre", () => {
    // Écrits en toutes lettres, pas dérivés de `SAME_DAY_KINDS`: une boucle sur
    // la constante resterait verte si on lui ajoutait « microwave ».
    const read = readDishes([
      { title: "A", same_day: { kind: "none", minutes: 0 } },
      { title: "B", same_day: { kind: "reheat_only", minutes: 8 } },
      { title: "C", same_day: { kind: "assemble", minutes: 10 } },
      { title: "D", same_day: { kind: "cook_fresh", minutes: 15 } },
      // Le jeton d'une version ultérieure du moteur, ou d'un modèle inventif.
      { title: "E", same_day: { kind: "microwave", minutes: 3 } },
      // Un jeton TRADUIT: exactement ce qui arriverait si `same_day.kind`
      // quittait un jour `MEAL_TOKEN_FIELDS`.
      { title: "F", same_day: { kind: "réchauffage", minutes: 8 } },
    ]);
    expect(read.map((d) => d.same_day?.kind ?? null)).toEqual([
      "none",
      "reheat_only",
      "assemble",
      "cook_fresh",
      null,
      null,
    ]);
  });

  it("une durée illisible se lit `null`, jamais zéro", () => {
    // « 0 min » se lirait « c'est instantané », ce qui est une affirmation que
    // personne n'a faite. Le geste, lui, survit: c'est la moitié qui compte.
    const read = readDishes([
      { title: "A", same_day: { kind: "assemble" } },
      { title: "B", same_day: { kind: "assemble", minutes: "vite" } },
      { title: "C", same_day: { kind: "assemble", minutes: -5 } },
      // …et le cas qui doit PASSER, sans quoi cette garde bloquerait tout en
      // ayant l'air de marcher.
      { title: "D", same_day: { kind: "assemble", minutes: 12 } },
    ]);
    expect(read.map((d) => (d.same_day === null ? "absent" : d.same_day.minutes)))
      .toEqual([
      null,
      null,
      null,
      12,
    ]);
    expect(read[0].same_day?.kind).toBe("assemble");
  });

  it("un `same_day` qui n'est pas un objet ne casse rien", () => {
    for (const raw of [{ same_day: "reheat_only" }, { same_day: 3 }, { same_day: [] }]) {
      const [dish] = readDishes([raw]);
      expect(dish.same_day).toBeNull();
    }
  });
});

// ===========================================================================
// L8/D9 — LA SURFACE DE CUISINE N'AFFICHE QUE LE PLAN QU'ON CUISINE
//
// > « Le maître ACCÈDE à tous les plans, mais sa surface de cuisine n'affiche
// > QUE le plan qu'il cuisine. Un plan validé non fusionné n'y apparaît pas: le
// > but est de simplifier sa cuisine, pas de lui faire suivre N plans. »
//
// LE DÉFAUT QUE CE BLOC GARDE, et il n'est pas théorique: la contrainte
// d'exclusion de `student_generated_meals` est scopée `(user_id, plan_kind)`,
// EXPRÈS (« sans ça le maître ne peut pas tenir les deux »). Deux plans du même
// compte peuvent donc couvrir les MÊMES JOURS, et `selectMealPlans` — qui ne
// connaît que des fenêtres — trancherait entre eux sur leur seule date de
// début. Le maître verrait tantôt sa semaine de foyer, tantôt un plan personnel
// oublié, sans rien à l'écran pour distinguer les deux.
// ===========================================================================

function plan(
  id: string,
  planKind: "personal" | "household",
  startsOn: string,
): GeneratedMealResult {
  return {
    mealId: id,
    dishes: [],
    preparations: [],
    cookingSessions: [],
    shoppingList: [],
    fixedIntakes: [],
    dayProperties: [],
    context: null,
    preferences: null,
    createdAt: null,
    startsOn,
    durationDays: 7,
    planKind,
    validatedAt: null,
  };
}

describe("cookedPlans", () => {
  it("écarte le plan personnel du maître quand un plan de foyer est vivant", () => {
    // ⚠️ LE DÉCOR SÉPARE: le plan personnel commence PLUS TARD, donc « le
    // dernier écrit gagne » et « je ne garde que le foyer » ne rendent pas la
    // même chose. Avec deux dates identiques, retirer le filtre serait
    // indiscernable.
    const kept = cookedPlans([
      plan("p-perso", "personal", "2026-08-19"),
      plan("p-foyer", "household", "2026-08-12"),
    ]);
    expect(kept.map((p) => p.mealId)).toEqual(["p-foyer"]);
  });

  it("rend les plans personnels quand aucun plan de foyer ne vit", () => {
    // LE CAS QUI PASSE, et c'est le chemin MAJORITAIRE: le compte individuel
    // (« l'entrée du produit est à 1 ») et le secondaire qui a pris la main.
    // Sans lui, un filtre trop large viderait l'écran de tout le monde.
    const kept = cookedPlans([
      plan("p-courant", "personal", "2026-08-12"),
      plan("p-suivant", "personal", "2026-08-19"),
    ]);
    expect(kept.map((p) => p.mealId)).toEqual(["p-courant", "p-suivant"]);
  });

  it("garde les DEUX plans du foyer, le courant et le suivant", () => {
    // Deux plans du foyer sont vivants en même temps PAR CONTRAT (ce que
    // `prepare_next` produit). Filtrer la nature ne doit pas se transformer en
    // « un seul plan »: c'est `selectMealPlans` qui range, pas ce filtre.
    const kept = cookedPlans([
      plan("p-foyer-1", "household", "2026-08-12"),
      plan("p-perso", "personal", "2026-08-12"),
      plan("p-foyer-2", "household", "2026-08-19"),
    ]);
    expect(kept.map((p) => p.mealId)).toEqual(["p-foyer-1", "p-foyer-2"]);
  });

  it("ne rend rien quand il n'y a rien", () => {
    expect(cookedPlans([])).toEqual([]);
  });
});
