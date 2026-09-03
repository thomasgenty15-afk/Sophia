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
   * ══════════════════════════════════════════════════════════════════════════
   * ⛔ REQUIS, `string | null`, JAMAIS `T?` — L'EXCEPTION EST RETIRÉE (2026-08-23)
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Ce champ a été FACULTATIF, et l'argument était bon sur le papier: « ce
   * n'est pas un paramètre de garde, c'est une DONNÉE; les plans déjà écrits ne
   * l'ont pas; le repli est explicite et il est COMPTÉ par `rawWindowCounts` ».
   *
   * ── CE QUE ÇA A COÛTÉ, MESURÉ SUR 10 PLANS RÉELS LE 2026-08-23 ────────────
   * `WaveItem` est satisfait STRUCTURELLEMENT. Avec un `?`, tout appelant qui
   * oublie la clé compile — et **deux l'oubliaient**, dans les deux sens du
   * produit:
   *
   *   · `frontend/src/keel/api/mealGeneration.ts :: readShopping` ne recopiait
   *     que `term`, `quantity`, `aisle`. Tous les articles retombaient donc sur
   *     `MAX_FRIDGE_DAYS`, il n'y avait plus qu'UNE vague, et
   *     `wavesAreMeaningful` la MASQUAIT. Sur 10 plans sur 10, aucune date
   *     d'achat n'atteignait l'écran: la liste de courses ne portait aucun jour.
   *   · `_shared/keel/evening_strip_io.ts` construisait `{term, aisle}` depuis
   *     la ligne en base — la même perte, sur la bande du soir.
   *
   * Et `rawWindowCounts`, le compteur censé rendre l'abstention visible, n'a
   * jamais été regardé: il compte ce qu'on lui donne, et on ne lui donnait rien.
   * Un compteur d'abstention ne remplace pas un type qui oblige à décider.
   *
   * ⚠️ `null` RESTE UNE VALEUR PLEINE, et c'est ce qui préserve l'argument
   * d'origine: elle dit « cette ligne n'a pas de groupe » (les plans d'avant
   * `L0-a`, qu'aucune migration ne peut réparer), le repli `MAX_FRIDGE_DAYS`
   * s'applique exactement comme avant, et `rawWindowCounts` la compte toujours.
   * Ce qui change est qu'un appelant ne peut plus se TAIRE: il doit écrire
   * `null` s'il ne sait pas, et ce mot-là se relit.
   *
   * Nommé comme la clé JSON persistée (`food_group`), pour la même raison que
   * `term` et `aisle`: l'écran passe la ligne de base telle quelle.
   */
  food_group: string | null;
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
   *
   * ⚠️ **CE CHAMP EST UNE PHRASE, PAS UNE DÉCISION.** Il n'en porte qu'UNE, et
   * il vaut `null` sur toute vague du premier jour. Fonder un décalage ou une
   * invalidation dessus laisse des cuissons sans ingrédients — voir
   * `servesCookDates` juste en dessous, et FF-061 §5.
   */
  servesCookOn: string | null;
  /**
   * ⛔ TOUTES LES CUISSONS QUE CETTE VAGUE SERT — c'est CELUI-CI qui décide.
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME, ET IL ÉTAIT DOUBLE ────────────────────
   * Une vague est un PAQUET D'ARTICLES QUI TOMBENT LE MÊME JOUR D'ACHAT. Le
   * `buyOn` se calcule PAR ARTICLE (`cuisson la plus précoce qui le consomme`
   * moins `la fenêtre de fraîcheur de son groupe`), donc rien n'empêche deux
   * articles d'une même vague de servir DEUX cuissons différentes.
   *
   * `servesCookOn` n'en nommait qu'une, et deux conséquences en découlaient:
   *
   *   1. **une vague qui sert mardi ET vendredi n'annonçait que mardi.** Un
   *      décalage fondé dessus laissait vendredi sans ingrédients, sans qu'une
   *      seule erreur ne se lève;
   *   2. **la première vague ne servait JAMAIS rien.** `serves` n'était posé
   *      que si `buyOn > startsOn` — donc toute vague datée du premier jour du
   *      plan portait `null`, et `shiftProposalAfterShoppingLater` rendait
   *      `null` dans ce cas. Rater la grosse course de début de plan — le cas
   *      le plus fréquent de tous — ne proposait **rien du tout**.
   *
   * Ce tableau n'a pas la condition `buyOn > startsOn`: une vague du premier
   * jour sert bel et bien des cuissons, et c'est précisément ce qu'on veut
   * savoir quand elle est ratée.
   *
   * Trié, dédoublonné, et VIDE quand la vague ne porte que de l'épicerie non
   * périssable — un tableau vide dit « rien ne dépend de cette vague », ce qui
   * est une réponse.
   */
  servesCookDates: string[];
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

  const byDate = new Map<
    string,
    { items: T[]; serves: string | null; all: Set<string> }
  >();

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
      // ⛔ LA BORNE `startsOn` RESTE, ET ELLE EST JUSTE AVEC LA VEILLE: depuis
      // le 2026-09-03 (A1), la veille EST `startsOn` — rang 0 de la fenêtre —
      // donc « jamais avant le début du plan » veut dire « jamais avant la
      // veille », ce qui est exactement la course de la veille.
      buyOn = earliest > startsOn ? earliest : startsOn;
      // ⟳ A1 (2026-09-03) — `serves` NE DÉPEND PLUS DE `startsOn`. Il se
      // pose sur toute vague qui n'est pas la PREMIÈRE (voir `firstBuyOn`
      // sous la boucle): « pour la cuisson de jeudi » est la phrase d'une
      // vague SUPPLÉMENTAIRE, et la première vague — celle du rang 0 — n'en a
      // pas besoin. Comparer à `startsOn` laissait la phrase sur une première
      // vague qui tombe APRÈS le début (tout périssable, cuisson tardive) et
      // l'invariant C3 (« `servesCookOn` non nul sur les vagues SUIVANTES »)
      // n'était tenu que par coïncidence — analyse du 03/09 §1.2 pt 3.
      serves = cookDate;
    }

    const bucket = byDate.get(buyOn) ??
      { items: [] as T[], serves: null, all: new Set<string>() };
    bucket.items.push(item);
    // La vague ANNONCE la cuisson la plus PROCHE qu'elle sert (la phrase).
    if (serves && (!bucket.serves || serves < bucket.serves)) bucket.serves = serves;
    // ⛔ ET ELLE RETIENT TOUTES CELLES QU'ELLE SERT (la décision).
    //
    // `cookDate` et pas `serves`: `serves` est EFFACÉ sur la première vague
    // par construction (`buyOn > firstBuyOn`, juste en dessous), et c'est
    // exactement le cas qu'on cherche à ne plus perdre. Un article périssable
    // dont la cuisson est connue compte, quelle que soit la date d'achat.
    if (perishable && cookDate) bucket.all.add(cookDate);
    byDate.set(buyOn, bucket);
  }

  // ── LA PREMIÈRE VAGUE NE PORTE PAS DE PHRASE, LES SUIVANTES TOUJOURS ─────
  // `servesCookOn` est la phrase d'une vague SUPPLÉMENTAIRE. La première vague
  // — au rang 0 depuis A1, ou plus tard quand tout est périssable — est la
  // grosse course; les suivantes doivent dire pour quelle cuisson elles
  // existent, sinon elles se lisent comme une corvée arbitraire. La règle est
  // « `buyOn > firstBuyOn` », pas « `buyOn > startsOn` »: c'est la même chose
  // au cas nominal, et ce n'est PAS la même chose quand la première vague
  // tombe après le début du plan.
  const sortedDates = [...byDate.keys()].sort();
  const firstBuyOn = sortedDates[0] ?? null;

  return sortedDates
    .map((buyOn) => [buyOn, byDate.get(buyOn)!] as const)
    .map(([buyOn, bucket]) => ({
      buyOn,
      items: bucket.items,
      servesCookOn: firstBuyOn !== null && buyOn > firstBuyOn ? bucket.serves : null,
      // Trié: l'ordre d'itération d'un `Set` suit l'insertion, c'est-à-dire
      // l'ordre de la liste de courses. Un appelant qui prend « la première »
      // prendrait alors un article, pas une date.
      servesCookDates: [...bucket.all].sort(),
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
 *
 * ⚠️ ELLE NE LIT QUE LA LONGUEUR, ET SON TYPE LE DIT MAINTENANT.
 *
 * Elle exigeait un `GroceryWave` complet, ce qui obligeait chaque appelant à
 * FABRIQUER une vague entière pour poser une question de comptage — et le jour
 * où le type a gagné un champ (`servesCookDates`), trois appelants ont cassé
 * pour un champ qu'aucun d'eux ne lit. Un paramètre plus large que le besoin
 * fait porter à ses appelants le coût des évolutions du type.
 */
export function wavesAreMeaningful(waves: { readonly length: number }): boolean {
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA DATE D'ACHAT DE CHAQUE LIGNE, DANS L'ORDRE DE LA LISTE — 2026-09-01.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI CETTE TROISIÈME FORME ────────────────────────────────────────
 * `planGroceryWaves` rend des paquets, `waveAssignments` rend des index par
 * paquet. Les deux servent un ÉCRAN qui regroupe. Ce qu'il manquait est la
 * forme que veut un ÉCRIVAIN: une date par ligne, alignée sur la liste
 * d'origine, pour la poser sur `shopping_list[].buy_on` et qu'elle voyage avec
 * la ligne — écran, PDF du frigo, liste partageable, bande du soir.
 *
 * ⛔ AUCUNE RÈGLE NEUVE ICI. Elle APPELLE `waveAssignments`, qui est la seule
 * définition. Recalculer la date à partir de `rawWindowDaysFor` serait le
 * jumeau que l'en-tête de ce fichier a tué une fois, ressuscité une ligne plus
 * bas.
 *
 * ── LE DÉFAUT QUE ÇA FERME, RAPPORTÉ SUR UN PLAN RÉEL LE 2026-09-01 ───────
 *     « ça me disait de cuisiner le poulet acheté le lundi, le samedi »
 * Le calcul était juste et il ne sortait nulle part: il ne tournait que dans un
 * panneau replié, et seulement quand il produisait DEUX vagues
 * (`wavesAreMeaningful`). Une liste sans date se lit « achète tout maintenant ».
 *
 * ⚠️ `null` QUAND ON N'A PAS SU DATER — fenêtre illisible, liste vide, ou
 * article hors de toute vague. C'est une valeur pleine: l'appelant écrit `null`
 * et l'écran retombe sur la liste plate d'avant, plutôt que d'afficher une date
 * inventée.
 */
export function buyDatesByIndex<T extends WaveItem>(args: {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly T[];
  preparations: readonly WavePreparation[];
}): (string | null)[] {
  const out: (string | null)[] = args.shoppingList.map(() => null);
  for (const wave of waveAssignments(args)) {
    for (const index of wave.indices) {
      if (index >= 0 && index < out.length) out[index] = wave.buyOn;
    }
  }
  return out;
}
