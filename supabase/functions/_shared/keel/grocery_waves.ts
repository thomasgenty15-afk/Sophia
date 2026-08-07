/**
 * LES VAGUES DE COURSES — quoi acheter, et QUAND. PUR.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §3, « la cadence de courses est
 * une SORTIE du plan ».
 *
 * ── CE QUE PERSONNE D'AUTRE NE FAIT ──────────────────────────────────────
 * Toutes les apps de la catégorie produisent UNE liste. Or si l'unité planifiée
 * est la session de cuisine, le calendrier d'achat n'est plus « une fois par
 * semaine, le samedi »: il se DÉDUIT. On connaît la date de la cuisson qui
 * consomme chaque ingrédient, et on connaît la durée de conservation. Donc la
 * viande du jeudi ne s'achète pas le lundi, et un plan de sept jours implique
 * deux vagues.
 *
 * La raison est la FRAÎCHEUR, pas la vente. Que ça produise deux paniers routés
 * au lieu d'un est une conséquence, jamais un objectif — l'inverse serait
 * exactement le conflit d'intérêt que §7.3 reproche au modèle dominant.
 *
 * ── LA BORNE N'EST PAS INVENTÉE ICI ──────────────────────────────────────
 * `MAX_FRIDGE_DAYS` vient de `meal_generation.ts`, où elle gouverne déjà
 * combien de jours un plat cuisiné peut être mangé. C'est la même question
 * physique posée à l'autre bout de la chaîne, et deux constantes recopiées
 * divergeraient au premier ajustement — après quoi le produit dirait « garde-le
 * 3 jours » en cuisine et « achète-le 4 jours avant » aux courses.
 *
 * ── LA PROPRIÉTÉ QUI COMPTE LE PLUS: RIEN NE DISPARAÎT ───────────────────
 * Un article dont on ne sait pas rattacher le terme à une préparation part en
 * PREMIÈRE vague. Jamais écarté. Une liste de courses qui perd un ingrédient
 * en silence est pire qu'une liste plate: on s'en aperçoit devant la casserole.
 */

import { MAX_FRIDGE_DAYS, type ShoppingAisle, type ShoppingItem } from "./meal_generation.ts";
import { addDays, windowDates } from "./meal_plan_window.ts";

/**
 * LES RAYONS QUI NE SE GARDENT PAS.
 *
 * `frozen` n'y est PAS, et c'est le seul choix discutable de la liste: du
 * surgelé se garde jusqu'à la cuisson, donc il part en première vague comme
 * l'épicerie.
 *
 * `produce` y est en entier, alors que l'oignon et la pomme de terre se
 * gardent très bien. On ne sait pas distinguer sans une base de conservation
 * par aliment, qui n'existe pas — et se tromper dans ce sens coûte un achat
 * une semaine trop tard (agaçant), tandis que l'inverse coûte des légumes
 * jetés (coûteux, et le produit promet le contraire).
 */
export const PERISHABLE_AISLES: ReadonlySet<ShoppingAisle> = new Set<ShoppingAisle>([
  "produce",
  "protein",
  "dairy",
]);

/** Une préparation, réduite à ce dont ce module a besoin. */
export interface WavePreparation {
  id: string;
  /** Jeton `mon`..`sun`, ou `null` quand aucune session ne l'a fixée. */
  cookOn: string | null;
  /** Les termes d'ingrédients, tels qu'ils apparaissent dans la liste. */
  ingredientTerms: readonly string[];
}

export interface GroceryWave {
  /** Date d'achat, `YYYY-MM-DD`, dans le calendrier local du plan. */
  buyOn: string;
  items: ShoppingItem[];
  /**
   * La cuisson la plus proche que cette vague sert. `null` en première vague
   * quand elle ne porte que de l'épicerie. Sert la phrase de l'écran
   * (« pour la cuisson de jeudi ») — sans elle, une seconde vague ressemble à
   * une corvée arbitraire.
   */
  servesCookOn: string | null;
}

/** Normalisation minimale pour rapprocher un terme de liste d'un ingrédient. */
function normalize(term: string): string {
  return String(term ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Répartir la liste de courses en vagues d'achat.
 *
 * @param startsOn premier jour couvert, `YYYY-MM-DD` local.
 * @param durationDays 1 à 7.
 *
 * ── POURQUOI UNE SEULE VAGUE EN DESSOUS DU SEUIL ─────────────────────────
 * Si le plan tient dans `MAX_FRIDGE_DAYS`, tout se garde jusqu'à sa cuisson et
 * une seconde vague n'apporterait qu'un déplacement en plus. La cadence doit
 * servir la fraîcheur; quand la fraîcheur ne l'exige pas, elle disparaît.
 */
export function planGroceryWaves(args: {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly ShoppingItem[];
  preparations: readonly WavePreparation[];
}): GroceryWave[] {
  const { startsOn, durationDays, shoppingList, preparations } = args;
  if (shoppingList.length === 0) return [];

  const dates = windowDates(startsOn, durationDays);

  // Terme normalisé → date de cuisson la PLUS PRÉCOCE qui le consomme.
  // La plus précoce, parce qu'un ingrédient utilisé mardi ET vendredi doit
  // être là mardi: acheter pour la seconde cuisson ferait rater la première.
  const earliestCook = new Map<string, string>();
  for (const prep of preparations) {
    const date = prep.cookOn ? dates[prep.cookOn] : undefined;
    if (!date) continue;
    for (const raw of prep.ingredientTerms) {
      const term = normalize(raw);
      if (!term) continue;
      const known = earliestCook.get(term);
      if (!known || date < known) earliestCook.set(term, date);
    }
  }

  const byDate = new Map<string, { items: ShoppingItem[]; serves: string | null }>();

  for (const item of shoppingList) {
    const cookDate = earliestCook.get(normalize(item.term)) ?? null;
    const perishable = PERISHABLE_AISLES.has(item.aisle);

    let buyOn = startsOn;
    let serves: string | null = null;
    if (perishable && cookDate) {
      // Au plus tôt `cuisson - MAX_FRIDGE_DAYS`, et jamais avant le début du
      // plan: on n'envoie personne faire des courses la semaine d'avant.
      const earliest = addDays(cookDate, -MAX_FRIDGE_DAYS);
      buyOn = earliest > startsOn ? earliest : startsOn;
      if (buyOn > startsOn) serves = cookDate;
    }

    const bucket = byDate.get(buyOn) ?? { items: [], serves: null };
    bucket.items.push(item);
    // La vague annonce la cuisson la plus PROCHE qu'elle sert.
    if (serves && (!bucket.serves || serves < bucket.serves)) bucket.serves = serves;
    byDate.set(buyOn, bucket);
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([buyOn, bucket]) => ({
      buyOn,
      items: bucket.items,
      servesCookOn: bucket.serves,
    }));
}

/**
 * Le total, pour la propriété « rien ne disparaît ». Exporté parce que
 * l'appelant doit pouvoir l'affirmer aussi, pas seulement le test.
 */
export function waveItemCount(waves: readonly GroceryWave[]): number {
  return waves.reduce((n, w) => n + w.items.length, 0);
}
