import {
  DAY_TOKENS,
  type GeneratedDish,
  type PantryItem,
} from "../api/mealGeneration";

// LES DEUX FONCTIONS PURES DU CONSTRUCTEUR DE REPAS.
//
// Elles vivaient dans `MealBuilder.tsx`, et le lint avait raison de refuser:
// un fichier qui exporte autre chose qu'un composant casse le fast refresh.
// Elles sont pures, testables sans React, et ce sont les deux endroits où une
// erreur se voit tout de suite à l'écran — leur place est ici.

/**
 * Une ligne de garde-manger par ligne de texte, « terme, quantité ».
 *
 * Le découpage est déterministe et volontairement bête: la première virgule
 * sépare le terme de la quantité. Un parseur plus malin devinerait, et deviner
 * ce que l'élève a chez lui produit une liste de courses fausse.
 */
export function parsePantry(raw: string): PantryItem[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const comma = line.indexOf(",");
      if (comma === -1) return { term: line, quantity: null };
      return {
        term: line.slice(0, comma).trim(),
        quantity: line.slice(comma + 1).trim() || null,
      };
    })
    .filter((item) => item.term !== "");
}

/**
 * Les plats regroupés par JOUR, dans l'ordre de la semaine.
 *
 * ── UN PLAT EN LOT NOURRIT PLUSIEURS JOURS, ET DOIT DONC Y APPARAÎTRE ─────
 * Défaut mesuré: un chili cuisiné dimanche et couvrant lundi et mardi ne
 * s'affichait que sous son jour de cuisson. Lundi et mardi paraissaient VIDES,
 * et l'élève lisait des trous là où le plan était en fait complet — le
 * reproche exact qu'on nous a fait sur la première version.
 *
 * Un plat en lot est donc placé sur CHAQUE jour qu'il couvre. Ce n'est pas une
 * duplication de données: c'est la même session de cuisine, montrée aux
 * moments où on en mange. Le bandeau de lot le dit sur chaque occurrence, donc
 * personne ne peut le lire comme « refaire ce plat trois fois ».
 *
 * Les plats sans jour (portée « un jour ») tombent dans un groupe sans titre:
 * leur inventer « Lundi » serait une prescription d'horaire que le moteur n'a
 * pas faite.
 */
export function groupByDay(
  dishes: readonly GeneratedDish[],
  /**
   * L'ORDRE DU PLAN, et plus lundi→dimanche en dur.
   *
   * Le défaut, tel qu'il se voyait: une composition faite un MERCREDI remplit
   * `wed…sun` puis `mon, tue` — qui sont la semaine SUIVANTE. Parcourus dans
   * l'ordre du calendrier, ces deux-là arrivaient EN TÊTE du plan, et l'élève
   * ouvrait son écran sur ce qui ressemblait à deux jours déjà ratés.
   *
   * L'ordre vient donc de la composition (`stretchDayOrder`), pas du calendrier.
   * Par défaut on garde l'ordre calendaire, pour que les tests et tout appelant
   * qui n'a pas d'ancre gardent un comportement défini.
   */
  order: readonly string[] = DAY_TOKENS,
): Array<{ day: string | null; dishes: GeneratedDish[] }> {
  const groups = new Map<string, GeneratedDish[]>();
  const undated: GeneratedDish[] = [];

  // L'IDENTITÉ D'UN PLAT, pour ne pas l'afficher deux fois le même jour.
  //
  // Mesuré: sur une semaine en lots, le modèle émet le MÊME plat une fois par
  // jour couvert — trois entrées « Chicken quinoa veg bowl », chacune portant
  // `covers_days: [mon, tue, wed]`. Sans cette clé, l'expansion ci-dessous les
  // multiplierait entre elles: neuf cartes pour une seule session de cuisine.
  const identity = (dish: GeneratedDish) =>
    `${dish.title.trim().toLowerCase()}|${dish.slot ?? ""}`;

  const place = (token: string, dish: GeneratedDish) => {
    const list = groups.get(token) ?? [];
    if (!list.some((d) => identity(d) === identity(dish))) list.push(dish);
    groups.set(token, list);
  };

  for (const dish of dishes) {
    // UN PLAT EST PLACÉ SUR SON JOUR, ET C'EST TOUT.
    //
    // L'expansion sur plusieurs jours venait du lot: le MÊME plat s'affichait
    // sur chaque jour couvert. Les préparations l'ont rendue inutile — c'est la
    // PRÉPARATION qui nourrit plusieurs jours, et chaque jour a désormais son
    // propre plat, qui la cite. Une cuisson de poulet, quatre repas différents.
    if (!dish.day) {
      undated.push(dish);
      continue;
    }
    place(dish.day, dish);
  }

  const out: Array<{ day: string | null; dishes: GeneratedDish[] }> = [];
  if (undated.length > 0) out.push({ day: null, dishes: undated });
  for (const token of order) {
    const list = groups.get(token);
    if (list && list.length > 0) out.push({ day: token, dishes: list });
  }
  return out;
}
