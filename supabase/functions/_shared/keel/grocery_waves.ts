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
 * ── CE FICHIER EST LA SEULE DÉFINITION DE LA RÈGLE ───────────────────────
 * Il a existé jusqu'au 2026-08-10 un JUMEAU côté écran
 * (`frontend/src/keel/api/groceryWaves.ts`) qui recopiait l'algorithme ET la
 * borne `MAX_FRIDGE_DAYS = 3`. Deux définitions d'une même règle physique sont
 * une divergence en attente: le jour où le frigo passe à quatre jours, l'une
 * des deux ment, et c'est l'écran le moins regardé qui garde l'ancienne.
 *
 * Le jumeau est mort. `frontend/src/keel/api/groceryWaves.ts` IMPORTE ce
 * fichier et ne fait plus qu'adapter la forme des lignes (snake_case de la base
 * → camelCase d'ici). Le module ne dépend d'aucun global Deno ni d'aucun
 * spécificateur `jsr:`/`npm:` — c'est ce qui rend l'import possible depuis Vite,
 * et c'est une propriété à préserver.
 *
 * ── POURQUOI ICI, ET PAS CÔTÉ ÉCRAN ──────────────────────────────────────
 * Les surfaces à venir — PDF du frigo, liste de courses partageable sans
 * compte, widget « ce soir » — sont HORS NAVIGATEUR et ne peuvent pas exécuter
 * un calcul React. Garder la règle au client, c'est garantir de la réécrire à
 * la première de ces surfaces.
 *
 * ── LES VAGUES SE CALCULENT À LA LECTURE, ELLES NE SE STOCKENT PAS ───────
 * `cook_on` et la liste de courses sont déjà dans la ligne du plan. Stocker les
 * vagues créerait un TROISIÈME état à invalider chaque fois qu'une préparation
 * change de jour — et ce dépôt paie en boucle le statut stocké dont l'écrivain
 * a disparu.
 *
 * ── LA BORNE N'EST PAS INVENTÉE ICI ──────────────────────────────────────
 * `MAX_FRIDGE_DAYS` vient de `meal_generation.ts`, où elle gouverne déjà
 * combien de jours un plat cuisiné peut être mangé. C'est la même question
 * physique posée à l'autre bout de la chaîne. Elle est RÉEXPORTÉE ici pour que
 * les consommateurs des vagues n'aient qu'un seul endroit où la lire.
 *
 * ── ⟳ 2026-08-22, LOT `L0-a`: CE N'ÉTAIT PAS LA MÊME QUESTION ────────────
 * Ce sont DEUX fenêtres, et elles se CHAÎNENT:
 *
 *     achat ──[ FENÊTRE CRUE ]──► cuisson ──[ FENÊTRE CUITE ]──► dernière part
 *
 * `MAX_FRIDGE_DAYS` est la SECONDE. Ce fichier posait la PREMIÈRE, et il
 * l'écrivait avec le nombre de la seconde: trois jours pour TOUT. Mesuré sur
 * le cas 04 — le poulet attendait trois jours cru, alors qu'une volaille
 * fraîche en tient un à deux. La première fenêtre vit maintenant par GROUPE
 * (`food_groups.raw_window_days`, miroir `RAW_WINDOW_DAYS` dans
 * `fridge_window.ts`), et `MAX_FRIDGE_DAYS` n'est plus ici que le REPLI de
 * l'article dont on ne connaît pas le groupe — repli qui se COMPTE
 * (`rawWindowCounts`), sans quoi une liste sans aucun groupe rendrait
 * exactement la même chose qu'une liste parfaitement routée.
 *
 * ── LA PROPRIÉTÉ QUI COMPTE LE PLUS: RIEN NE DISPARAÎT ───────────────────
 * Un article dont on ne sait pas rattacher le terme à une préparation part en
 * PREMIÈRE vague. Jamais écarté. Une liste de courses qui perd un ingrédient
 * en silence est pire qu'une liste plate: on s'en aperçoit devant la casserole.
 */

import { type RawWindowCounts, rawWindowDaysFor } from "./fridge_window.ts";
import { MAX_FRIDGE_DAYS, type ShoppingAisle } from "./meal_generation.ts";
import { addDays, windowDates } from "./meal_plan_window.ts";

export { MAX_FRIDGE_DAYS };
export { type RawWindowCounts, rawWindowDaysFor } from "./fridge_window.ts";

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
 *
 * La liste est ÉCRITE en `ShoppingAisle` (une faute de frappe ne compile pas)
 * mais EXPOSÉE en `ReadonlySet<string>`: l'appelant écran tient ses rayons en
 * `string`, et lui imposer l'union l'obligerait à un cast — c'est-à-dire à
 * désarmer le typage au lieu de le renforcer.
 */
const PERISHABLE: readonly ShoppingAisle[] = ["produce", "protein", "dairy"];
export const PERISHABLE_AISLES: ReadonlySet<string> = new Set<string>(PERISHABLE);

/**
 * LE MINIMUM QU'UN ARTICLE DOIT PORTER pour être routé.
 *
 * Volontairement structurel, et pas `ShoppingItem`: le serveur tient son rayon
 * en union fermée, l'écran le tient en `string` (il vient d'un JSON). Les deux
 * satisfont ceci, donc les deux passent sans couche de conversion.
 */
export interface WaveItem {
  term: string;
  aisle: string;
  /**
   * ⟳ LOT `L0-a` — LE GROUPE D'ALIMENT DE CET ARTICLE, quand on a su le
   * résoudre. C'est lui qui porte la FENÊTRE CRUE, donc la date d'achat.
   *
   * ⚠️ FACULTATIF, ET C'EST UNE EXCEPTION ASSUMÉE à la règle « un paramètre de
   * garde optionnel est une garde désarmée ». Ce n'est pas un paramètre de
   * garde: c'est une DONNÉE portée par la ligne du plan. Les 181 plans déjà
   * écrits ne l'ont pas, et rien ne peut la leur donner rétroactivement. Le
   * repli est donc explicite (`MAX_FRIDGE_DAYS`, le comportement d'avant) et
   * il est COMPTÉ par `rawWindowCounts` — l'abstention se compte, elle ne se
   * déguise pas en résolution.
   *
   * Nommé comme la clé JSON persistée (`food_group`), pour la même raison que
   * `term` et `aisle`: l'écran passe la ligne de base telle quelle.
   */
  food_group?: string | null;
}

/** Une préparation, réduite à ce dont ce module a besoin. */
export interface WavePreparation {
  id: string;
  /** Jeton `mon`..`sun`, ou `null` quand aucune session ne l'a fixée. */
  cookOn: string | null;
  /** Les termes d'ingrédients, tels qu'ils apparaissent dans la liste. */
  ingredientTerms: readonly string[];
}

/**
 * LA FORME PERSISTÉE d'une préparation — celle de `student_generated_meals`,
 * donc celle que reçoit l'écran ET celle que lira le PDF.
 *
 * Elle vit ICI et pas côté écran: l'adaptation snake_case → camelCase est la
 * seule chose que le jumeau front faisait légitimement, et la laisser là-bas
 * garantirait qu'on la réécrive à la première surface hors navigateur.
 */
export interface WavePreparationRow {
  id?: string | null;
  cook_on?: string | null;
  ingredients?: readonly { term?: string | null }[] | null;
}

/** La ligne du plan devient l'entrée du calcul. Aucune règle ici, une forme. */
export function wavePreparationsFromRows(
  rows: readonly WavePreparationRow[],
): WavePreparation[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    cookOn: row.cook_on ?? null,
    ingredientTerms: (row.ingredients ?? [])
      .map((ing) => String(ing?.term ?? ""))
      .filter((term) => term.length > 0),
  }));
}

export interface GroceryWave<T extends WaveItem = WaveItem> {
  /** Date d'achat, `YYYY-MM-DD`, dans le calendrier local du plan. */
  buyOn: string;
  items: T[];
  /**
   * La cuisson la plus proche que cette vague sert. `null` en première vague
   * quand elle ne porte que de l'épicerie. Sert la phrase de l'écran
   * (« pour la cuisson de jeudi ») — sans elle, une seconde vague ressemble à
   * une corvée arbitraire.
   */
  servesCookOn: string | null;
}

/** Normalisation minimale pour rapprocher un terme de liste d'un ingrédient. */
function normalize(term: unknown): string {
  return String(term ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
 *
 * ── SANS FENÊTRE, AUCUNE VAGUE ───────────────────────────────────────────
 * Une ligne écrite avant `20260807090000_meal_plan_window` n'a pas de
 * `starts_on`. Inventer une date d'achat enverrait quelqu'un au magasin un jour
 * qui n'est écrit nulle part. Rendre `[]` ne perd rien: l'appelant qui n'a pas
 * de vagues rend la liste PLATE, celle d'avant ce module.
 */
export function planGroceryWaves<T extends WaveItem>(args: {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly T[];
  preparations: readonly WavePreparation[];
}): GroceryWave<T>[] {
  const { startsOn, durationDays, shoppingList, preparations } = args;
  if (shoppingList.length === 0) return [];
  if (!CALENDAR_DATE.test(String(startsOn ?? ""))) return [];

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

  const byDate = new Map<string, { items: T[]; serves: string | null }>();

  for (const item of shoppingList) {
    const cookDate = earliestCook.get(normalize(item.term)) ?? null;
    const perishable = PERISHABLE_AISLES.has(String(item.aisle));

    let buyOn = startsOn;
    let serves: string | null = null;
    if (perishable && cookDate) {
      // ⟳ LOT `L0-a` — LA FENÊTRE EST CELLE DU GROUPE, plus celle de tout le
      // monde. Au plus tôt `cuisson - fenêtre crue`, et jamais avant le début
      // du plan: on n'envoie personne faire des courses la semaine d'avant.
      //
      // ⛔ LE REPLI EST `MAX_FRIDGE_DAYS`, ET C'EST LE COMPORTEMENT D'AVANT,
      // pas une valeur sûre. Prendre la fenêtre la plus COURTE pour un article
      // non résolu enverrait faire les courses le jour de la cuisson pour un
      // terme sur dix — une dégradation visible, contre un gain de fraîcheur
      // qui n'a pas été mesuré. La fenêtre CUITE, elle, est fail-closed: c'est
      // celle qui rend malade. Celle-ci ne décide qu'une date de magasin, et
      // son abstention se COMPTE (`rawWindowCounts`).
      const window = rawWindowDaysFor(item.food_group) ?? MAX_FRIDGE_DAYS;
      const earliest = addDays(cookDate, -window);
      buyOn = earliest > startsOn ? earliest : startsOn;
      if (buyOn > startsOn) serves = cookDate;
    }

    const bucket = byDate.get(buyOn) ?? { items: [] as T[], serves: null };
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
 * ⟳ LOT `L0-a` — CE QUE LA FENÊTRE CRUE A RÉELLEMENT GOUVERNÉ.
 *
 * ⛔ SANS `unknown_group`, UNE LISTE DONT AUCUN ARTICLE N'A DE GROUPE REND
 * EXACTEMENT LA MÊME CHOSE QU'UNE LISTE PARFAITEMENT ROUTÉE. C'est la même
 * discipline que les trois populations de la fenêtre cuite: l'abstention se
 * compte, elle ne se déguise pas en résolution.
 */
export function rawWindowCounts(items: readonly WaveItem[]): RawWindowCounts {
  let routed = 0;
  let unknown = 0;
  for (const item of items) {
    if (rawWindowDaysFor(item.food_group) === null) unknown++;
    else routed++;
  }
  return { routed, unknown_group: unknown };
}

/**
 * Le total, pour la propriété « rien ne disparaît ». Exporté parce que
 * l'appelant doit pouvoir l'affirmer aussi, pas seulement le test.
 */
export function waveItemCount(waves: readonly GroceryWave<WaveItem>[]): number {
  return waves.reduce((n, w) => n + w.items.length, 0);
}

/**
 * Faut-il MONTRER les vagues ?
 *
 * Une seule vague = la liste plate d'avant, et un en-tête « à acheter
 * maintenant » posé sur la totalité n'ajoute rien qu'un mot à lire. Les vagues
 * ne se montrent que quand elles disent quelque chose.
 *
 * C'est une règle de PRODUIT, pas de rendu — un PDF a exactement la même
 * question à se poser — donc elle vit ici avec le calcul.
 */
export function wavesAreMeaningful(waves: readonly GroceryWave<WaveItem>[]): boolean {
  return waves.length > 1;
}

/**
 * LES VAGUES, EXPRIMÉES EN INDEX DE LA LISTE D'ORIGINE.
 *
 * ── POURQUOI CETTE FORME EN PLUS DE L'AUTRE ──────────────────────────────
 * `ShoppingListPanel` identifie une rature par son INDEX dans la liste
 * d'origine (voir `groupByAisle`), et pas par son terme — deux articles
 * peuvent porter le même mot. Rendre des sous-listes d'articles obligerait à
 * réindexer, donc à faire sauter une rature quand la vague change de taille.
 */
export interface WaveAssignment {
  buyOn: string;
  servesCookOn: string | null;
  /** Index dans la liste passée à `planGroceryWaves`. */
  indices: number[];
}

export function waveAssignments<T extends WaveItem>(args: {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly T[];
  preparations: readonly WavePreparation[];
}): WaveAssignment[] {
  const waves = planGroceryWaves(args);
  if (waves.length === 0) return [];

  // On rejoue l'appartenance par IDENTITÉ D'OBJET, pas par terme: les articles
  // rendus par `planGroceryWaves` sont les mêmes références que ceux de
  // `shoppingList`, donc l'égalité est exacte même quand deux lignes portent
  // le même mot.
  const indexOf = new Map<T, number[]>();
  args.shoppingList.forEach((item, index) => {
    const list = indexOf.get(item) ?? [];
    list.push(index);
    indexOf.set(item, list);
  });

  return waves.map((wave) => ({
    buyOn: wave.buyOn,
    servesCookOn: wave.servesCookOn,
    indices: wave.items.map((item) => {
      const pool = indexOf.get(item);
      // `shift()` consomme: deux références identiques dans la même liste
      // reçoivent deux index différents, dans l'ordre.
      return pool && pool.length > 0 ? pool.shift()! : -1;
    }).filter((i) => i >= 0),
  }));
}
