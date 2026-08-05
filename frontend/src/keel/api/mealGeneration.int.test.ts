import { describe, expect, it } from "vitest";
import { dishDaySplit, type GeneratedDish } from "./mealGeneration";

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
  return { title, slot: null, day, ingredients: [], method: "", why: "" };
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
