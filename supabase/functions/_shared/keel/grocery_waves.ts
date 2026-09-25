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

import {
  effectiveRawWindowDays,
  plateWindowDaysFor,
  RAW_WINDOW_NEVER_BINDS_FROM,
  type RawWindowCounts,
  rawWindowDaysFor,
} from "./fridge_window.ts";
import { keepingOf } from "./food_keeping.ts";
import { MAX_FRIDGE_DAYS, type ShoppingAisle } from "./meal_generation.ts";
import { addDays, windowDates } from "./meal_plan_window.ts";
import { plannedShopRanks, shopRankFor } from "./shopping_purchases.ts";

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
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — L'IDENTIFIANT DU RÉFÉRENTIEL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ POURQUOI IL EST LÀ, ET C'EST UN DÉFAUT MESURÉ. `tuna_fresh` et
   * `tuna_tinned` portent le MÊME `food_group`, `white_fish` : le groupe seul
   * ne peut pas distinguer une boîte de conserve d'un filet. Sans cet
   * identifiant, la seule chose qu'on SAIT de la conservation d'un aliment
   * (`SHELF_STABLE_SLUGS`) est illisible ici, et la datation retombe sur la
   * fenêtre du poisson frais pour une boîte qui se garde des années.
   *
   * ⛔ REQUIS ET NULLABLE, JAMAIS `T?` — et la raison est écrite juste
   * au-dessus, sur `food_group` : ce type est satisfait STRUCTURELLEMENT, et
   * un `?` a déjà laissé DEUX appelants oublier la clé en silence, dans les
   * deux sens du produit. `null` dit « cette ligne n'a pas d'identité » et se
   * relit ; l'absence ne se relit pas.
   */
  ref: string | null;
}

/** Une préparation, réduite à ce dont ce module a besoin. */
export interface WavePreparation {
  id: string;
  /** Jeton `mon`..`sun`, ou `null` quand aucune session ne l'a fixée. */
  cookOn: string | null;
  /** Les termes d'ingrédients, tels qu'ils apparaissent dans la liste. */
  ingredientTerms: readonly string[];
  /**
   * ⟳ 2026-09-25 — LES JOURS OÙ UN REPAS PUISE DANS CETTE PRÉPARATION (jetons),
   * pour la limite achat → assiette (`PLATE_WINDOW_DAYS`). `null` ou absent =
   * inconnu: la limite ne s'applique pas, la date reste celle de la fenêtre
   * crue seule — le comportement d'avant, octet pour octet.
   *
   * ⚠️ FACULTATIF, CONTRE LA RÈGLE DU DÉPÔT, ET C'EST ÉCRIT ICI. Cette forme est
   * construite à neuf endroits et dans une centaine de tests; seul le
   * GÉNÉRATEUR a les plats sous la main, et c'est lui qui ÉCRIT les dates
   * d'achat (`buy_on`). Les autres surfaces lisent ces dates écrites au lieu de
   * les recalculer. `waveNeedsFromPlan` le remplit toujours, et un test tient
   * que le générateur passe par elle; le compteur `plate_window` dit, sur
   * chaque plan, combien de lignes ont été jugées.
   */
  eatenOn?: readonly string[] | null;
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

// ── CE QUI NE SE CONGÈLE PAS, ÉCRIT À LA MAIN ⟳ LOT C ──────────────────────
//
// ⛔ TROUVÉ SUR UN TIR RÉEL, PAS EN RELECTURE. Le premier plan replié a rendu
// « salade verte — à congeler ». C'est une instruction FAUSSE, et une
// instruction fausse est pire qu'une absente: elle apprend à ignorer les
// autres, y compris celle qui portait sur le poisson juste au-dessus.
//
// ⚠️ LISTE FERMÉE ET COURTE, par groupe d'aliment. On ne dit pas « ces groupes
// sont fragiles »: on dit « ces trois-là ne supportent pas la congélation »,
// cas par cas. La quasi-totalité des aliments se congèle très bien, y compris
// la viande, le poisson, le pain et la plupart des légumes.
//
// ⛔ ET LE REFUS A UNE CONSÉQUENCE, IL N'EST PAS COSMÉTIQUE: un article qui ne
// peut ni tenir au frais ni être congelé ne peut PAS être absorbé par le repli.
// Il garde sa vague, la cadence demandée cède devant la physique, et ça se
// COMPTE (`freezeRefused`). Le supprimer en silence ferait acheter une salade
// six jours avant de la manger.
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-19 — LES BESOINS D'UN PLAN, TELS QUE LA GARDE LES LIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ EN RUN RÉEL (foyer `fagenty`, 42 cases) ──────────────
 * `planGroceryWaves` datait les lignes de courses depuis les seules
 * CASSEROLES (`earliestCook`, bâti sur `preparations[].cookOn`). Un plat SANS
 * casserole — un bol de fruits assemblé le soir même — n'avait donc aucune
 * date de besoin : ses ingrédients tombaient dans la première vague, le lundi.
 * La garde finale, elle, compte ces plats-là (`earliestRankByTerm` :
 * « `dish.uses` vide ⇒ les ingrédients du plat sont dus le jour du plat »).
 * Résultat : « mûres » achetées le 21, tenues 3 jours, attendues le 25 —
 * `perishable_bought_too_early`, 422, plan entier refusé — pour une date que
 * NOUS avions posée. Le lot 2 l'avait déjà écrit : « la date a été calculée
 * par nous » justifie de la CORRIGER, pas de servir le résultat.
 *
 * ── CE QUE FAIT CETTE FONCTION ─────────────────────────────────────────────
 * Elle rend la liste des besoins que la datation doit connaître : les
 * casseroles (comme avant), PLUS un pseudo-besoin par plat sans casserole,
 * daté du jour du plat. La règle est copiée de la garde, mot pour mot : un
 * plat qui cite une casserole ne date rien de lui-même (ses ingrédients sont
 * ceux de la casserole, achetés pour sa cuisson).
 *
 * ⚠️ LES PSEUDO-IDS SONT PRÉFIXÉS `dish:`. `describeWrittenWaves` en dérive
 * `frozenPreparationIds`, que `sessionsFedFromFreezer` croise avec les
 * casseroles des sessions : un id de plat n'y correspond à rien, donc un bol
 * congelé à l'achat n'invente aucune session « nourrie du congélateur ».
 */
export interface WaveDishRow {
  day?: string | null;
  uses?: readonly unknown[] | null;
  ingredients?: readonly { term?: string | null }[] | null;
}

export function waveNeedsFromPlan(args: {
  preparations: readonly WavePreparationRow[];
  dishes: readonly WaveDishRow[];
}): WavePreparation[] {
  // ⟳ 2026-09-25 — LES JOURS DE REPAS DE CHAQUE CASSEROLE, lus sur les plats
  // qui la citent (`uses`). Une casserole citée par aucun plat garde `[]`:
  // on sait qu'aucun repas n'en mange, ce qui n'est pas « inconnu ».
  const eaten = new Map<string, Set<string>>();
  for (const dish of args.dishes) {
    const day = String(dish.day ?? "").trim();
    if (day === "") continue;
    for (const use of dish.uses ?? []) {
      const id = preparationIdOfUse(use);
      if (id === null) continue;
      const days = eaten.get(id) ?? new Set<string>();
      days.add(day);
      eaten.set(id, days);
    }
  }
  const out: WavePreparation[] = wavePreparationsFromRows(args.preparations).map((prep) => ({
    ...prep,
    eatenOn: [...(eaten.get(prep.id) ?? [])],
  }));
  args.dishes.forEach((dish, i) => {
    if ((dish.uses ?? []).length > 0) return;
    const day = String(dish.day ?? "").trim();
    if (day === "") return;
    const terms = (dish.ingredients ?? [])
      .map((ing) => String(ing?.term ?? ""))
      .filter((term) => term.length > 0);
    if (terms.length === 0) return;
    // Un plat sans casserole se mange le jour où il est assemblé.
    out.push({ id: `dish:${i}`, cookOn: day, ingredientTerms: terms, eatenOn: [day] });
  });
  return out;
}

/** L'identifiant de casserole d'un `uses[]` de plat: objet `{preparation_id}` ou chaîne. */
function preparationIdOfUse(use: unknown): string | null {
  if (typeof use === "string") return use.trim() === "" ? null : use.trim();
  if (use && typeof use === "object") {
    const raw = (use as Record<string, unknown>).preparation_id ??
      (use as Record<string, unknown>).preparationId;
    const id = String(raw ?? "").trim();
    return id === "" ? null : id;
  }
  return null;
}

/** L'écart en jours entre deux dates `YYYY-MM-DD` (b − a). */
function daysApart(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** La clé de rapprochement terme de liste ↔ ingrédient, la même partout ici. */
export function waveTermKey(term: unknown): string {
  return normalize(term);
}

/**
 * ⟳ 2026-09-25 — PAR TERME, LA CHAÎNE CUISSON → DERNIER REPAS.
 *
 * Pour chaque terme d'ingrédient: le plus grand écart, en jours, entre la
 * cuisson d'une préparation qui l'utilise et le dernier repas qui en mange, et
 * la date de ce dernier repas. C'est ce que la limite achat → assiette lit
 * (`effectiveRawWindowDays`).
 *
 * Un terme dont AUCUNE préparation ne connaît ses repas (`eatenOn` absent)
 * n'est pas dans la carte: il retombe sur la fenêtre crue seule.
 *
 * PURE.
 */
export function mealChainsByTerm(args: {
  startsOn: string;
  durationDays: number;
  preparations: readonly WavePreparation[];
}): Map<string, { eatSpan: number; lastEat: string }> {
  const out = new Map<string, { eatSpan: number; lastEat: string }>();
  if (!CALENDAR_DATE.test(String(args.startsOn ?? ""))) return out;
  const dates = windowDates(args.startsOn, args.durationDays);
  for (const prep of args.preparations) {
    if (!Array.isArray(prep.eatenOn)) continue;
    const cook = prep.cookOn ? dates[prep.cookOn] : undefined;
    if (!cook) continue;
    const eats = prep.eatenOn
      .map((token) => dates[token])
      .filter((d): d is string => typeof d === "string");
    const lastEat = eats.length === 0 ? cook : [...eats].sort()[eats.length - 1];
    const span = Math.max(0, daysApart(cook, lastEat));
    for (const raw of prep.ingredientTerms) {
      const term = normalize(raw);
      if (!term) continue;
      const known = out.get(term);
      if (!known || span > known.eatSpan || (span === known.eatSpan && lastEat > known.lastEat)) {
        out.set(term, {
          eatSpan: known ? Math.max(known.eatSpan, span) : span,
          lastEat: known && known.lastEat > lastEat ? known.lastEat : lastEat,
        });
      } else if (lastEat > known.lastEat) {
        out.set(term, { eatSpan: known.eatSpan, lastEat });
      }
    }
  }
  return out;
}

const NOT_FREEZABLE: ReadonlySet<string> = new Set<string>([
  // La salade rendue à la décongélation est une flaque: c'est le cas mesuré.
  "leafy_greens",
  // Un yaourt tranche et rend son petit-lait.
  "dairy_yogurt",
  // Un œuf en coquille éclate.
  "eggs",
]);

export interface GroceryWave<T extends WaveItem = WaveItem> {
  /** Date d'achat, `YYYY-MM-DD`, dans le calendrier local du plan. */
  buyOn: string;
  items: T[];
  /**
   * ⟳ LOT C (2026-09-04) — CE QUI PART AU CONGÉLATEUR DÈS LE RETOUR DU MAGASIN.
   *
   * Un SOUS-ENSEMBLE de `items`, par référence d'objet (jamais par terme: deux
   * lignes peuvent porter le même mot, et ce module mappe déjà ses index par
   * identité). Non vide seulement quand un congélateur est DÉCLARÉ et que le
   * plan a replié ses vagues: l'article est alors acheté plus tôt que sa
   * fenêtre crue ne le permet, donc il ne tiendra pas au frais jusqu'à sa
   * cuisson.
   *
   * ⛔ CE N'EST PAS `aisle: "frozen"`. Celui-là est un RAYON — on achète du
   * surgelé. Celui-ci est un GESTE: on achète du frais et on le congèle en
   * rentrant. Les confondre ferait disparaître la seule instruction que la
   * personne doit exécuter le jour des courses.
   */
  freezeOnPurchase: T[];
  /**
   * ⟳ LOT C — CE QUI A FAIT SURVIVRE CETTE VAGUE À UN REPLI.
   *
   * Non vide seulement sur une vague que la cadence demandée aurait dû
   * absorber, et qui reste parce qu'elle porte un aliment qui ne se congèle pas
   * (`NOT_FREEZABLE`). C'est le COMPTEUR de ce refus: sans lui, « le repli n'a
   * pas eu lieu » et « le repli a tout absorbé » rendraient le même nombre de
   * vagues, et la personne verrait une course de plus sans savoir pourquoi.
   */
  keptForFreshness: T[];
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
  /**
   * ⟳ LOT C — COMBIEN DE FOIS LE PLAN VA AU MAGASIN. REQUIS.
   *
   * ⛔ PAS DE `?`, ET C'EST LA RÈGLE DE CE DÉPÔT: « un paramètre de garde
   * optionnel est une garde désarmée ». Un appelant qui l'oublierait
   * obtiendrait le repli le plus permissif — autant de vagues que la
   * conservation en demande — c'est-à-dire exactement le défaut que ce lot
   * ferme, en silence.
   *
   * ⚠️ `null` EST UNE VALEUR, PAS UNE ABSENCE: « la cadence n'a pas été
   * déclarée » (ni style ni nombre de courses, donc `capacity.plan === null`).
   * On ne replie alors RIEN — la conservation garde la main, exactement comme
   * avant ce lot. C'est la même discipline que `freezer: null` chez
   * `deriveCookingPlan`: l'ignorance ne se déguise pas en réponse.
   */
  runs: number | null;
  /**
   * ⟳ LOT C — UN CONGÉLATEUR EST-IL DÉCLARÉ. REQUIS, même raison.
   *
   * ⛔ SANS LUI ON NE REPLIE PAS. Replier sans congélateur ferait acheter
   * mercredi du poisson qu'on cuisine samedi: le plan tiendrait sur le papier
   * et pourrirait dans le frigo. La cadence demandée cède alors devant la
   * conservation, et c'est le bon ordre.
   */
  freezer: boolean;
}): GroceryWave<T>[] {
  const { startsOn, durationDays, shoppingList, preparations } = args;
  if (shoppingList.length === 0) return [];
  if (!CALENDAR_DATE.test(String(startsOn ?? ""))) return [];
  if (
    args.runs !== null &&
    (typeof args.runs !== "number" || !Number.isFinite(args.runs) || args.runs < 1)
  ) {
    throw new Error(
      `[keel/grocery_waves] \`runs\` est REQUIS: un entier >= 1, ou null quand la ` +
        `cadence n'a pas été déclarée. Reçu: ${JSON.stringify(args.runs)}`,
    );
  }
  if (typeof args.freezer !== "boolean") {
    throw new Error("[keel/grocery_waves] `freezer` est REQUIS et booléen");
  }


  const dates = windowDates(startsOn, durationDays);
  // ⟳ 2026-09-25 — la chaîne cuisson → dernier repas, par terme.
  const chains = mealChainsByTerm({ startsOn, durationDays, preparations });

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
  /** Par article périssable à cuisson connue: sa fenêtre d'achat. */
  const fresh = new Map<T, { lo: string; hi: string; cook: string; window: number }>();

  for (const item of shoppingList) {
    const cookDate = earliestCook.get(normalize(item.term)) ?? null;
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-12 · FERMETURE LOT 2 — LA CONSERVATION, PAS LE RAYON
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE RAYON DÉCIDAIT DE LA DATE. `PERISHABLE_AISLES` est une liste de
    // trois allées de magasin : c'est un rangement d'affichage, et il servait
    // de seconde autorité de conservation. La garde finale, elle, lisait le
    // GROUPE — deux lectures d'un même fait, qui ont divergé (le thon en
    // conserve, tir 3 du 2026-09-12).
    //
    // `keepingOf` est désormais la SEULE lecture, et les deux sites l'appellent.
    // Une fenêtre `null` veut dire « rien à faire attendre » : conserve, geste
    // du congélateur, ou aliment non identifié — et `kind` sépare les trois.
    const keeping = keepingOf({ ref: item.ref, group: item.food_group });
    // ⛔ LE REPLI HISTORIQUE EST GARDÉ, ET IL EST NOMMÉ. Une ligne dont on ne
    // SAIT PAS la conservation (pas de groupe: les plans d'avant `L0-a`) garde
    // le comportement d'avant — `MAX_FRIDGE_DAYS` quand son rayon dit du frais.
    // Le retirer avancerait toutes ces courses au premier jour, c'est-à-dire
    // ferait acheter du poulet le lundi pour le samedi, sous prétexte qu'on ne
    // sait pas ce que c'est. « Inconnu » ne vaut pas « stable ».
    //
    // ⚠️ ET C'EST LE SEUL ENDROIT OÙ LE RAYON PARLE ENCORE: il ne décide plus
    // de la fenêtre, il choisit le repli quand il n'y a pas de fenêtre du tout.
    const rawWindow = keeping.rawWindowDays !== null
      ? keeping.rawWindowDays
      : keeping.kind === "unknown" && PERISHABLE_AISLES.has(String(item.aisle))
      ? MAX_FRIDGE_DAYS
      : null;
    // ⟳ 2026-09-25 — LA LIMITE ACHAT → ASSIETTE RÉDUIT LA FENÊTRE CRUE. Un porc
    // cuisiné dimanche et mangé mardi (chaîne de 2 jours, limite de 3) ne peut
    // plus être acheté que la veille de sa cuisson. Sans jours de repas connus,
    // la fenêtre crue est rendue telle quelle.
    const window = effectiveRawWindowDays({
      raw: rawWindow,
      group: keeping.kind === "refrigerated" ? item.food_group : null,
      eatSpan: chains.get(normalize(item.term))?.eatSpan ?? null,
    });
    const perishable = window !== null;

    let buyOn = startsOn;
    let serves: string | null = null;
    if (perishable && cookDate) {
      // ⟳ 2026-09-21 — LA FENÊTRE D'ACHAT DE L'ARTICLE, pour le repli: de sa
      // date la plus tôt (bornée au début du plan) à son jour de cuisson.
      const lo = addDays(cookDate, -window);
      fresh.set(item, { lo: lo > startsOn ? lo : startsOn, hi: cookDate, cook: cookDate, window });
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
  let sortedDates = [...byDate.keys()].sort();

  // ── ⟳ LOT C · LE REPLI SUR LA CADENCE DEMANDÉE ──────────────────────────
  //
  // La conservation a proposé autant de vagues qu'il en faut pour tout acheter
  // frais. La personne, elle, a dit combien de fois elle va au magasin. Quand
  // la seconde est plus petite, c'est elle qui gagne — MAIS SEULEMENT SI un
  // congélateur peut absorber la différence.
  //
  // ⟳ 2026-09-21 — ON CHOISIT LES DATES QUI CONGÈLENT LE MOINS, ON NE GARDE
  // PLUS « LES PREMIÈRES ». Mesuré sur le plan `64abd449` (5 jours, deux
  // courses, congélateur): la conservation datait lundi (la grosse course),
  // mardi (les sardines de mercredi, fenêtre d'un jour) et mercredi (le
  // jambon de vendredi, fenêtre de deux jours). L'ancien repli gardait lundi
  // et mardi, reversait mercredi sur mardi et congelait le jambon — alors que
  // lundi et mercredi tenaient TOUT au frais: un article s'achète n'importe
  // quand entre sa date la plus tôt et son jour de cuisson, et le repli ne
  // savait qu'AVANCER un achat, jamais RETARDER une course.
  //
  // La règle: la première date reste (c'est la grosse course, celle des
  // cuissons du début). Les `runs − 1` autres sont choisies parmi les jours de
  // la fenêtre pour couvrir au frais le plus d'articles possible; à égalité,
  // celles qui laissent le moins d'incongelables sur une vague à part; puis
  // les plus tôt. Ce qu'aucune date gardée ne couvre au frais est acheté à la
  // dernière date gardée AVANT sa fenêtre et congelé — la propriété
  // « déplacé ⇒ hors de portée » tient donc par construction, comme avant.
  // Un article couvert par deux dates gardées rejoint la plus TARDIVE: la plus
  // fraîche. À `runs = 1`, rien ne change: tout se reverse sur la première.
  const freezeOnPurchase = new Set<T>();
  // Ce que le repli n'a PAS pu absorber, par date d'origine: ces vagues-là
  // survivent, et le plan porte alors plus de vagues que de courses demandées.
  const keptFresh = new Map<string, T[]>();
  if (args.freezer && args.runs !== null && sortedDates.length > args.runs) {
    const first = sortedDates[0]!;
    // Les articles des vagues suivantes: tous périssables avec une cuisson
    // connue (sans ça ils seraient tombés sur la première date).
    const movable = sortedDates.slice(1).flatMap((date) =>
      byDate.get(date)!.items
        .map((item) => ({ item, from: date, span: fresh.get(item) ?? null }))
        .filter((m): m is {
          item: T;
          from: string;
          span: { lo: string; hi: string; cook: string; window: number };
        } =>
          m.span !== null
        )
    );
    const extra = Math.max(0, args.runs - 1);
    const candidates = Object.values(dates).filter((d) => d > first).sort();
    const size = Math.min(extra, candidates.length);
    const combos: string[][] = [];
    const walk = (start: number, acc: string[]) => {
      if (acc.length === size) {
        combos.push([...acc]);
        return;
      }
      for (let i = start; i < candidates.length; i++) {
        acc.push(candidates[i]!);
        walk(i + 1, acc);
        acc.pop();
      }
    };
    walk(0, []);
    const coveredBy = (kept: readonly string[], span: { lo: string; hi: string }) =>
      kept.filter((d) => d >= span.lo && d <= span.hi);
    let best: { kept: string[]; covered: number; stranded: number } | null = null;
    for (const combo of combos) {
      const kept = [first, ...combo];
      let covered = 0;
      let stranded = 0;
      for (const m of movable) {
        if (coveredBy(kept, m.span).length > 0) covered += 1;
        else if (NOT_FREEZABLE.has(String(m.item.food_group ?? ""))) stranded += 1;
      }
      if (
        best === null || covered > best.covered ||
        (covered === best.covered && stranded < best.stranded)
      ) {
        best = { kept, covered, stranded };
      }
    }
    const kept = (best?.kept ?? [first]).sort();
    const bucketAt = (date: string) => {
      const found = byDate.get(date);
      if (found) return found;
      const made = { items: [] as T[], serves: null as string | null, all: new Set<string>() };
      byDate.set(date, made);
      return made;
    };
    for (const m of movable) {
      const origin = byDate.get(m.from)!;
      origin.items = origin.items.filter((it) => it !== m.item);
      const within = coveredBy(kept, m.span);
      let target: string;
      if (within.length > 0) {
        // Couvert au frais: la date gardée la plus tardive de sa fenêtre.
        target = within[within.length - 1]!;
      } else if (NOT_FREEZABLE.has(String(m.item.food_group ?? ""))) {
        // ⛔ CE QUI NE SE CONGÈLE PAS N'EST PAS ABSORBÉ. Il reste sur SA vague:
        // la personne devra y retourner, et c'est la vérité — mieux vaut une
        // course de plus qu'une salade congelée.
        origin.items.push(m.item);
        keptFresh.set(m.from, [...(keptFresh.get(m.from) ?? []), m.item]);
        continue;
      } else {
        // Hors de portée de toute date gardée: acheté à la dernière date gardée
        // AVANT sa fenêtre, et congelé. `first < lo` par construction (l'article
        // vient d'une vague postérieure à la première), donc elle existe.
        const before = kept.filter((d) => d < m.span.lo);
        target = before[before.length - 1] ?? first;
        freezeOnPurchase.add(m.item);
      }
      const bucket = bucketAt(target);
      bucket.items.push(m.item);
      bucket.all.add(m.span.cook);
      if (!bucket.serves || m.span.cook < bucket.serves) bucket.serves = m.span.cook;
    }
    for (const date of sortedDates.slice(1)) {
      const bucket = byDate.get(date);
      if (bucket && bucket.items.length === 0) byDate.delete(date);
    }
    sortedDates = [...byDate.keys()].sort();
  } else if (args.runs !== null && sortedDates.length > 0) {
    // ── ⟳ 2026-09-25 · LES COURSES CHOISIES SONT LES COURSES FAITES ─────────
    //
    // ⛔ NI PLUS, NI MOINS. Deux défauts sur deux plans réels, le même jour:
    // `a0481b9c` (deux courses choisies, une faite: le nombre ne servait qu'à
    // en RETIRER) et `54aec009` (deux choisies, quatre faites: la
    // conservation en ajoutait une par volaille ou poisson trop loin).
    // Décision du propriétaire: « si le user dit 3, c'est 3 ».
    //
    // Les jours viennent de `plannedShopDatesForPlan`, la même règle que la
    // consigne donne au modèle AVANT qu'il compose (`raw_keeping.ts`). Chaque
    // article frais se range sur le jour de courses le plus tardif où il tient
    // jusqu'à son dernier repas (`shopRankFor`); aucun ⇒ le dernier jour de
    // courses avant sa cuisson — acheté trop tôt, et la garde achat →
    // assiette le compte sur le plan écrit. Ce qui se garde (fenêtre de
    // `RAW_WINDOW_NEVER_BINDS_FROM` jours ou plus) et ce qui n'a pas de
    // cuisson connue va à la première course.
    const kept = plannedShopDatesForPlan({
      startsOn,
      durationDays,
      preparations,
      runs: args.runs,
    });
    const keptRanks = kept.map((d) => daysApart(startsOn, d));
    const sessionRanks = sessionRanksForPlan({ startsOn, durationDays, preparations });
    const rebuilt = new Map<string, { items: T[]; serves: string | null; all: Set<string> }>();
    const put = (date: string, item: T, cook: string | null) => {
      const bucket = rebuilt.get(date) ??
        { items: [] as T[], serves: null as string | null, all: new Set<string>() };
      bucket.items.push(item);
      if (cook !== null) {
        bucket.all.add(cook);
        if (!bucket.serves || cook < bucket.serves) bucket.serves = cook;
      }
      rebuilt.set(date, bucket);
    };
    for (const date of sortedDates) {
      for (const item of byDate.get(date)!.items) {
        const span = fresh.get(item) ?? null;
        if (span === null || span.window >= RAW_WINDOW_NEVER_BINDS_FROM) {
          put(kept[0]!, item, span === null ? null : span.cook);
          continue;
        }
        const target = shopRankFor({
          lo: daysApart(startsOn, span.lo),
          hi: daysApart(startsOn, span.cook),
          shopRanks: keptRanks,
          sameDay: sessionRanks.includes(daysApart(startsOn, span.cook)),
        });
        put(addDays(startsOn, target.rank), item, span.cook);
      }
    }
    byDate.clear();
    for (const [date, bucket] of rebuilt) byDate.set(date, bucket);
    sortedDates = [...byDate.keys()].sort();
  }
  const firstBuyOn = sortedDates[0] ?? null;

  return sortedDates
    .map((buyOn) => [buyOn, byDate.get(buyOn)!] as const)
    .map(([buyOn, bucket]) => ({
      buyOn,
      items: bucket.items,
      freezeOnPurchase: bucket.items.filter((it) => freezeOnPurchase.has(it)),
      keptForFreshness: keptFresh.get(buyOn) ?? [],
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
  /**
   * ⟳ LOT C — LES MÊMES INDEX, restreints à ce qui part au congélateur dès
   * l'achat. Un SOUS-ENSEMBLE de `indices`, jamais une seconde liste: l'écran
   * rend une ligne par index et marque celles qui sont ici.
   */
  freezeIndices: number[];
}

export function waveAssignments<T extends WaveItem>(args: {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly T[];
  preparations: readonly WavePreparation[];
  runs: number | null;
  freezer: boolean;
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

  return waves.map((wave) => {
    // ⚠️ L'APPARIEMENT SE FAIT UNE SEULE FOIS, et `freezeIndices` en est tiré —
    // rejouer `shift()` sur `freezeOnPurchase` consommerait une seconde fois le
    // même vivier et rendrait des index faux dès qu'une ligne se répète.
    const frozen = new Set<T>(wave.freezeOnPurchase);
    const indices: number[] = [];
    const freezeIndices: number[] = [];
    for (const item of wave.items) {
      const pool = indexOf.get(item);
      // `shift()` consomme: deux références identiques dans la même liste
      // reçoivent deux index différents, dans l'ordre.
      const at = pool && pool.length > 0 ? pool.shift()! : -1;
      if (at < 0) continue;
      indices.push(at);
      if (frozen.has(item)) freezeIndices.push(at);
    }
    return {
      buyOn: wave.buyOn,
      servesCookOn: wave.servesCookOn,
      indices,
      freezeIndices,
    };
  });
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
  runs: number | null;
  freezer: boolean;
}): { buyOn: (string | null)[]; freezeOnPurchase: boolean[]; keptForFreshness: boolean[] } {
  const buyOn: (string | null)[] = args.shoppingList.map(() => null);
  const freezeOnPurchase: boolean[] = args.shoppingList.map(() => false);
  // ⟳ 2026-09-09 — CE QUI A FAIT SURVIVRE UNE VAGUE AU REPLI, par ligne. Un
  // article incongelable acheté après la première course ouvre un déplacement
  // à lui seul (mesuré: un bouquet de persil, le jeudi). L'appelant le COMPTE;
  // sans ce tableau, « aucune vague survivante » et « on n'a pas regardé »
  // rendent le même silence. Identité d'objet, comme `freezeOnPurchase`.
  const kept = new Set<T>(planGroceryWaves(args).flatMap((w) => w.keptForFreshness));
  const keptForFreshness: boolean[] = args.shoppingList.map((item) => kept.has(item));
  for (const wave of waveAssignments(args)) {
    for (const index of wave.indices) {
      if (index >= 0 && index < buyOn.length) buyOn[index] = wave.buyOn;
    }
    // ⟳ LOT C — LA MARQUE VOYAGE AVEC LA DATE, dans le même passage. Deux
    // parcours séparés auraient pu diverger le jour où l'un des deux filtre.
    for (const index of wave.freezeIndices) {
      if (index >= 0 && index < freezeOnPurchase.length) freezeOnPurchase[index] = true;
    }
  }
  return { buyOn, freezeOnPurchase, keptForFreshness };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE LES VAGUES ÉCRITES DISENT D'UN PLAN — 2026-09-09.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL (poul, brouillon du 2026-09-08) ──
 * L'explication du plan disait « ce qui se cuisine dimanche s'achète au plus
 * près de ce jour-là : de la viande fraîche prise à la première course ne
 * tiendrait pas ». La dinde de dimanche était prise à la première course, et
 * congelée en rentrant. La phrase venait de `rawKeepingBreaches`, qui compare
 * un jour de cuisson à une fenêtre crue — et ne sait pas ce que CE module a
 * fait ensuite de l'article (le repli congélateur du lot C). Deux morceaux de
 * code qui ne se lisent pas, et c'est l'explication qui avait tort.
 *
 * ── CE QUE CETTE FONCTION LIT, ET POURQUOI C'EST ELLE ─────────────────────
 * Elle lit les LIGNES ÉCRITES (`buy_on`, `freeze_on_purchase`) — la décision,
 * pas la règle — et les rattache aux jours de cuisson par le même
 * appariement terme → préparation que `planGroceryWaves`. Elle ne recalcule
 * aucune date: une seconde date ici serait le jumeau que l'en-tête interdit.
 *
 *   · `frozenAtPurchase` — par jour de cuisson, ce qui a été acheté plus tôt
 *     et congelé en rentrant. C'est la phrase « sors-la du congélateur la
 *     veille au soir », et le compteur des sessions nourries au congélateur.
 *   · `laterShopDays` — les jours de cuisson qu'une course APRÈS la première
 *     sert vraiment. C'est la phrase « s'achète au plus près », et elle ne
 *     sort plus pour un article que le congélateur a absorbé.
 *
 * ⚠️ UN TERME PEUT NOURRIR DEUX CUISSONS (les cuisses de poulet du mercredi
 * ET du vendredi): on rattache la ligne à TOUTES, jamais à la première seule —
 * c'est la leçon de `servesCookDates`.
 *
 * PURE: no I/O, no clock.
 */
export interface WrittenWaveFacts {
  /** Par jour de cuisson, dans l'ordre de la fenêtre. */
  frozenAtPurchase: { cookOn: string; buyOn: string; terms: string[] }[];
  /** Jetons de jour, dans l'ordre de la fenêtre. */
  laterShopDays: string[];
  /** Les préparations qui puisent dans au moins une ligne congelée à l'achat. */
  frozenPreparationIds: string[];
}

export function describeWrittenWaves(args: {
  /** Les jetons de la fenêtre, rang 0 en tête — l'ordre est le sens. */
  window: readonly string[];
  shoppingList: readonly {
    term: string;
    buy_on?: string | null;
    freeze_on_purchase?: boolean;
  }[];
  preparations: readonly WavePreparation[];
}): WrittenWaveFacts {
  const window = args.window ?? [];
  const rank = new Map(window.map((d, i) => [d, i] as const));
  // Terme normalisé → les préparations qui le consomment, situées dans la fenêtre.
  const usedBy = new Map<string, { id: string; cookOn: string }[]>();
  for (const prep of args.preparations ?? []) {
    if (!prep.cookOn || !rank.has(prep.cookOn)) continue;
    for (const raw of prep.ingredientTerms) {
      const term = normalize(raw);
      if (!term) continue;
      const list = usedBy.get(term) ?? [];
      list.push({ id: prep.id, cookOn: prep.cookOn });
      usedBy.set(term, list);
    }
  }
  const dated = (args.shoppingList ?? [])
    .map((l) => l.buy_on)
    .filter((d): d is string => typeof d === "string" && d !== "");
  const firstBuyOn = dated.length > 0 ? [...dated].sort()[0] : null;

  const frozen = new Map<string, { buyOn: string; terms: string[] }>();
  const later = new Set<string>();
  const frozenPreps = new Set<string>();
  for (const line of args.shoppingList ?? []) {
    const uses = usedBy.get(normalize(line.term)) ?? [];
    if (uses.length === 0) continue;
    const buyOn = typeof line.buy_on === "string" && line.buy_on !== "" ? line.buy_on : null;
    if (line.freeze_on_purchase === true) {
      for (const use of uses) {
        frozenPreps.add(use.id);
        const bucket = frozen.get(use.cookOn) ?? { buyOn: buyOn ?? firstBuyOn ?? "", terms: [] };
        if (!bucket.terms.includes(line.term)) bucket.terms.push(line.term);
        frozen.set(use.cookOn, bucket);
      }
      continue;
    }
    if (buyOn !== null && firstBuyOn !== null && buyOn > firstBuyOn) {
      for (const use of uses) later.add(use.cookOn);
    }
  }
  const byWindow = (a: string, b: string) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
  return {
    frozenAtPurchase: [...frozen.entries()]
      .sort(([a], [b]) => byWindow(a, b))
      .map(([cookOn, v]) => ({ cookOn, buyOn: v.buyOn, terms: v.terms })),
    laterShopDays: [...later].sort(byWindow),
    frozenPreparationIds: [...frozenPreps],
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'UNE SESSION SORT DU CONGÉLATEUR LA VEILLE — 2026-09-09.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les lignes de courses marquées « à congeler à l'achat » que les préparations
 * données consomment. C'est la phrase de la carte de session (« la veille au
 * soir, sors du congélateur : dinde hachée 450 g ») et le corps du rappel du
 * chat, la veille d'une session. Une seule lecture, trois surfaces (écran,
 * PDF, chat): la même liste partout, ou le rappel dirait autre chose que la
 * carte.
 *
 * ⛔ LIT LA MARQUE ÉCRITE, JAMAIS LA FENÊTRE. `freeze_on_purchase` est la
 * décision du repli (lot C); la recalculer ici depuis les groupes serait le
 * jumeau que l'en-tête de ce fichier interdit.
 *
 * ⚠️ DÉDOUBLONNÉ PAR LIGNE, pas par terme: deux lignes « poulet » à des
 * quantités différentes sont deux choses à sortir. L'ordre est celui de la
 * liste de courses.
 *
 * PURE: no I/O, no clock.
 */
export function frozenLinesForPreparations<
  T extends { term: string; quantity?: string | null; freeze_on_purchase?: boolean },
>(args: {
  shoppingList: readonly T[];
  preparations: readonly WavePreparation[];
  preparationIds: readonly string[];
}): T[] {
  const wanted = new Set(args.preparationIds ?? []);
  const terms = new Set<string>();
  for (const prep of args.preparations ?? []) {
    if (!wanted.has(prep.id)) continue;
    for (const raw of prep.ingredientTerms) {
      const term = normalize(raw);
      if (term) terms.add(term);
    }
  }
  if (terms.size === 0) return [];
  return (args.shoppingList ?? []).filter((line) =>
    line.freeze_on_purchase === true && terms.has(normalize(line.term))
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-25 — LA GARDE ACHAT → ASSIETTE, LUE SUR LES DATES ÉCRITES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI ELLE EXISTE ──────────────────────────────────────────────────
 * Sur le brouillon `a0481b9c`, chaque garde vérifiait son morceau — achat →
 * cuisson (`raw_keeping_needs_later_shop: 0/6`), cuisson → repas (la fenêtre
 * cuite) — et aucune ne mesurait la chaîne entière: un porc acheté vendredi
 * et mangé mardi passait toutes les gardes. Celle-ci relit la DÉCISION (la
 * date d'achat posée sur la ligne) contre le dernier repas qui en mange.
 *
 * ⛔ ELLE NE DATE RIEN. La date vient de `planGroceryWaves` et des passes
 * d'après (scission, espacement), qui lisent toutes `effectiveRawWindowDays`.
 * Ce compteur dit si l'une d'elles a laissé passer une chaîne trop longue —
 * par exemple une seule ligne pour deux cuissons qu'on n'a pas su scinder.
 *
 * ⚠️ TROIS POPULATIONS, JAMAIS DEUX: `within`, `breaches`, et `unjudged` (pas
 * de limite pour ce groupe, pas de date, congelé à l'achat, ou repas
 * inconnus). Sans le troisième, « rien ne dépasse » et « on n'a rien regardé »
 * rendraient le même zéro.
 *
 * PURE: no I/O, no clock.
 */
export interface PlateWindowReport {
  within: number;
  breaches: { term: string; buyOn: string; lastEat: string; days: number; limit: number }[];
  unjudged: number;
}

/**
 * ⟳ 2026-09-25 — LES JOURS DE COURSES QUE LA PERSONNE A CHOISIS, en dates.
 *
 * `plannedShopRanks` (`shopping_purchases.ts`) sur les jours de cuisine du
 * plan: les préparations qui ne sont pas des plats du jour (`dish:`). La
 * consigne dit ces mêmes jours au modèle, depuis les jours de cuisine prévus
 * (`raw_keeping.ts`).
 */
export function plannedShopDatesForPlan(args: {
  startsOn: string;
  durationDays: number;
  preparations: readonly WavePreparation[];
  runs: number;
}): string[] {
  return plannedShopRanks({ sessionRanks: sessionRanksForPlan(args), runs: args.runs })
    .map((rank) => addDays(args.startsOn, rank));
}

/** ⟳ 2026-09-25 — les rangs des jours de cuisine: les préparations hors plats du jour (`dish:`). */
export function sessionRanksForPlan(args: {
  startsOn: string;
  durationDays: number;
  preparations: readonly WavePreparation[];
}): number[] {
  const dates = windowDates(args.startsOn, args.durationDays);
  return [
    ...new Set(
      args.preparations
        .filter((prep) => !prep.id.startsWith("dish:"))
        .map((prep) => (prep.cookOn ? dates[prep.cookOn] : undefined))
        .filter((d): d is string => typeof d === "string"),
    ),
  ].map((d) => daysApart(args.startsOn, d)).sort((a, b) => a - b);
}

export function plateWindowReport(args: {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly {
    term: string;
    food_group: string | null;
    ref: string | null;
    buy_on?: string | null;
    freeze_on_purchase?: boolean;
  }[];
  preparations: readonly WavePreparation[];
}): PlateWindowReport {
  const report: PlateWindowReport = { within: 0, breaches: [], unjudged: 0 };
  // ⟳ 2026-09-25 — PAR ACHAT, PLUS PAR NOM D'ALIMENT. Sur `54aec009`, le
  // poulet acheté vendredi (mangé vendredi et samedi) était jugé sur le
  // dernier repas de TOUT poulet du plan (jeudi): « 6 jours » là où il y en
  // avait un. Un achat du jour B sert les préparations de ce terme cuisinées
  // à partir de B et avant l'achat suivant du même terme.
  const dates = CALENDAR_DATE.test(String(args.startsOn ?? ""))
    ? windowDates(args.startsOn, args.durationDays)
    : {};
  const prepChains: { term: string; cook: string; lastEat: string }[] = [];
  for (const prep of args.preparations) {
    if (!Array.isArray(prep.eatenOn)) continue;
    const cook = prep.cookOn ? (dates as Record<string, string>)[prep.cookOn] : undefined;
    if (!cook) continue;
    const eats = prep.eatenOn
      .map((token) => (dates as Record<string, string>)[token])
      .filter((d): d is string => typeof d === "string");
    const lastEat = eats.length === 0 ? cook : [...eats].sort()[eats.length - 1];
    for (const raw of prep.ingredientTerms) {
      const term = normalize(raw);
      if (term) prepChains.push({ term, cook, lastEat });
    }
  }
  const buysByTerm = new Map<string, string[]>();
  for (const line of args.shoppingList) {
    const term = normalize(line.term);
    const buy = typeof line.buy_on === "string" && CALENDAR_DATE.test(line.buy_on) ? line.buy_on : null;
    if (!term || buy === null) continue;
    const known = buysByTerm.get(term) ?? [];
    if (!known.includes(buy)) known.push(buy);
    buysByTerm.set(term, known.sort());
  }
  const chainOf = (term: string, buyOn: string): { lastEat: string } | null => {
    const next = (buysByTerm.get(term) ?? []).find((d) => d > buyOn) ?? null;
    const served = prepChains.filter((c) =>
      c.term === term && c.cook >= buyOn && (next === null || c.cook < next)
    );
    if (served.length === 0) return null;
    return { lastEat: served.map((c) => c.lastEat).sort()[served.length - 1] };
  };
  for (const line of args.shoppingList) {
    const keeping = keepingOf({
      ref: line.ref,
      group: line.food_group,
      frozen: line.freeze_on_purchase === true,
    });
    const limit = keeping.kind === "refrigerated" ? plateWindowDaysFor(line.food_group) : null;
    const buyOn = typeof line.buy_on === "string" && CALENDAR_DATE.test(line.buy_on)
      ? line.buy_on
      : null;
    const chain = buyOn === null ? null : chainOf(normalize(line.term), buyOn);
    if (limit === null || chain === null || buyOn === null) {
      report.unjudged += 1;
      continue;
    }
    const days = daysApart(buyOn, chain.lastEat);
    if (days > limit) {
      report.breaches.push({ term: line.term, buyOn, lastEat: chain.lastEat, days, limit });
    } else {
      report.within += 1;
    }
  }
  return report;
}
