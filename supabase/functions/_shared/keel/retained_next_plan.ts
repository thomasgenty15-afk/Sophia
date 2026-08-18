/**
 * LE MAGASIN PROVISOIRE — les `RetainedItem` de `scope: "next_plan"`, et leur
 * EXPIRATION. Lot 1B du chantier « mémoire structurée ».
 *
 * Autorité produit: `docs/keel/NOMENCLATURE-MEMOIRE.md` §2 axe 2, §6 section 6,
 * §7 premier point (tranché ici, et RÉÉCRIT dans le document le 2026-08-18).
 * Socle: `retained_item.ts` — ce fichier ne le modifie pas et n'en réécrit rien.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA DÉCISION QUE CE FICHIER PORTE — « JUSQU'À LA FIN DE LA FENÊTRE DU PLAN »
 * ═══════════════════════════════════════════════════════════════════════════
 * La nomenclature laissait le choix ouvert entre deux durées. C'est tranché:
 *
 *   Un `next_plan` vit **jusqu'à la fin de la semaine à laquelle il est
 *   ancré** — le lundi ISO de son `anchor`. Il est vivant tant que
 *   `jour <= ancre + 6`, et il n'est plus là à partir de `ancre + 7`.
 *
 * ── LES TROIS RAISONS, DANS CET ORDRE ──────────────────────────────────────
 * ① L'ANCRE EST UNE DONNÉE, PAS UN ÉTAT. « Cette ligne vise la semaine du 24 »
 *   est un fait que personne n'a à venir corriger plus tard. C'est ce qui rend
 *   l'expiration calculable sans écrivain — et c'est la seule forme d'ancrage
 *   qui survit à un producteur qui tombe.
 * ② LA DATE D'EXPIRATION EST CONNUE À L'ÉCRITURE, donc AFFICHABLE. Le §6 de la
 *   nomenclature l'exige mot pour mot: « Pour la semaine prochaine — tout le
 *   `next_plan`, AVEC SA DATE D'EXPIRATION AFFICHÉE ». Une règle dont la date
 *   ne se connaît pas d'avance rend ce §6 inapplicable.
 * ③ RÉGÉNÉRER DEUX FOIS LA MÊME SEMAINE GARDE L'ENVIE. Le couple
 *   brouillon/relance est le geste le plus courant de ce produit. « J'ai
 *   demandé des fajitas cette semaine » est ce que la personne a voulu dire;
 *   « pour exactement un appui de bouton » ne l'est pas.
 *
 * ── L'OPTION ÉCARTÉE: « EXACTEMENT UNE GÉNÉRATION » ────────────────────────
 * Elle demande de SAVOIR qu'une génération a eu lieu. Ça coûte l'une de ces
 * deux choses, et les deux sont refusées:
 *
 *   · un drapeau `consumed` (ou `status`, ou `expired`) sur l'item — c'est le
 *     SECOND ÉTAT interdit, et son écrivain est un générateur dont ce dépôt a
 *     MESURÉ qu'il peut échouer APRÈS l'appel modèle (voir l'en-tête de
 *     `food_preference_promotion_io.ts`: un run rendu `400` avait déjà touché
 *     la ligne). L'item finirait consommé deux fois, ou jamais.
 *     *« Un second état à invalider est un état dont l'écrivain finit par
 *     disparaître »* (`accident.ts`);
 *   · une comparaison avec la dernière ligne de `student_generated_meals`.
 *     Celle-là n'est PAS un second état — elle est dérivée, c'est honnête — et
 *     elle reste refusée pour une raison produit: l'envie disparaît ENTRE DEUX
 *     CLICS DU MÊME BOUTON. La seconde génération de la même minute compose
 *     sans elle, sans un mot. *« Une envie qui disparaît sans prévenir se lit
 *     comme une perte de données. »*
 *
 * Et dans les deux cas, la date d'expiration est inconnue d'avance: le §6
 * tombe avec.
 *
 * ── CE QUE « CALCULÉ À LA LECTURE » VEUT DIRE ICI, LITTÉRALEMENT ───────────
 * Aucune colonne `expired`, aucun `status`, aucun job de nettoyage, aucune
 * suppression de ligne. `isNextPlanItemAlive` est une FONCTION, appelée à
 * chaque lecture.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OÙ ÇA VIT — `practical_constraints.retained_next_plan`, PAS LE CANAL D'ENVIES
 * ═══════════════════════════════════════════════════════════════════════════
 * PREMIÈRE VERSION DE CE LOT: le canal d'envies (`household_envy_submissions`),
 * comme la nomenclature le disait. DÉPLACÉ le 2026-08-18 sur arbitrage humain,
 * pour un défaut MESURÉ pendant l'écriture:
 *
 *   `SetupPage.tsx` l'écrit en toutes lettres — « LE SOLO NE CRÉE PAS DE
 *   FOYER » (le foyer n'est créé qu'à partir de deux bouches) — et
 *   `household_envy_submissions.household_id` est `not null`. Une personne
 *   seule ne pouvait donc porter AUCUN `next_plan`. Or l'entrée du produit est
 *   à 1 (PIVOT-FOYER §5), et le lot 2B produit du `next_plan` PAR DÉFAUT: un
 *   solo aurait vu ses retours sur brouillon soit refusés, soit basculés en
 *   `durable` — c'est-à-dire « une humeur de mardi transformée en règle de
 *   vie », exactement ce que le §5 de la nomenclature interdit.
 *
 * `practical_constraints` marche IDENTIQUEMENT pour un solo et pour un foyer,
 * n'a demandé AUCUNE migration, et met le magasin provisoire à côté du magasin
 * durable — deux clés distinctes de la même colonne, une par `scope`.
 *
 * ⚠️ ET LE CANAL D'ENVIES REDEVIENT CE QU'IL A TOUJOURS ÉTÉ: la phrase libre du
 * maître, pour tout le foyer, bornée à 500 caractères. Ce fichier ne le lit
 * pas, ne l'écrit pas, ne le connaît pas. En particulier, ⛔ la récolte
 * d'envies PAR MEMBRE (`mergeEnvies`, retirée le 2026-08-10) n'est pas
 * ressuscitée: aucune fonction d'ici ne compte les membres, n'en nomme un qui
 * se serait tu, ni ne demande à quiconque de parler. C'est le champ `subject`
 * de chaque item qui dit à qui il s'applique.
 *
 * ── ⚠️ DEUX MAGASINS DANS LA MÊME COLONNE: LA COURSE EST RÉELLE ───────────
 * `retained_items` (durable, lot 1A) et `retained_next_plan` (ici) vivent tous
 * deux dans `student_goals.practical_constraints`. Ce dépôt a une cicatrice
 * chiffrée sur exactement ça — deux écritures sur `practical_constraints`, la
 * seconde partie d'un `current` périmé, « le bouton ne fait rien ». `1A` écrit
 * donc par une RPC ciblée (`keel_write_food_preferences`, `jsonb_set` sur des
 * clés NOMMÉES) et pas par un `update` de la colonne entière.
 *
 * ⚠️ LA PHASE 2 DOIT FAIRE PAREIL POUR `retained_next_plan` — le port existe
 * déjà: `keel_write_retained_items` (lot 1D) écrit les deux clés en UN énoncé,
 * avec concurrence optimiste. `withNextPlanEntries`
 * ci-dessous est PUR: il rend un objet neuf, il ne persiste rien, et il ne
 * protège de rien. Un appelant qui écrirait la colonne entière effacerait le
 * magasin durable écrit une seconde plus tôt par l'autre bout du produit.
 *
 * ── ÉCHOUER NE COÛTE JAMAIS UN DÎNER ──────────────────────────────────────
 * Toute lecture en panne rend une liste VIDE, journalisée. Posture de
 * `household_voices_io.ts` mot pour mot, et l'inverse de celle des allergies
 * (`safety_constraints.ts`, qui THROW): on parle ici d'envies. Une personne
 * dont le magasin est illisible compose quand même — elle compose comme avant
 * ce lot.
 */

import {
  parseRetainedDay,
  parseRetainedItem,
  type RetainedItem,
  retainedItemToJson,
} from "./retained_item.ts";

// ===========================================================================
// LE MAGASIN
// ===========================================================================

/**
 * LA CLÉ DE `practical_constraints` qui porte le magasin PROVISOIRE.
 *
 * ⛔ DISTINCTE DE `RETAINED_ITEMS_KEY` (`"retained_items"`, lot 1A), qui est le
 * magasin DURABLE. Les deux `scope` ne partagent pas de clé: le durable est
 * remplacé en bloc par `withRetainedItems`, et une seule clé ferait qu'écrire
 * l'un effacerait l'autre — en silence, puisque les deux écritures réussissent.
 *
 * Même convention que `FOOD_PREFERENCES_KEY` / `RETAINED_ITEMS_KEY`: une clé de
 * `practical_constraints`, en `snake_case`, nommée par une constante exportée
 * pour que personne ne la retape.
 *
 * ⚠️ ÉPINGLÉE À SON LITTÉRAL PAR LE TEST, DES TROIS CÔTÉS. Bretelle mesurée sur
 * le lot 1A: une clé déclarée deux fois — la constante et le littéral stocké —
 * sans rien qui les relie laisse les tests verts pendant que l'écriture part
 * dans une clé que plus personne ne lit. **Elle a failli être payée ici pour de
 * bon**: la première version de ce fichier nommait la clé `next_plan_items`
 * pendant que l'ÉCRIVAIN RÉEL — `keel_write_retained_items` (lot 1D) et son
 * miroir `frontend/src/keel/api/retainedItems.ts` — écrivait déjà
 * `retained_next_plan`. Les deux côtés auraient été verts, et aucun `next_plan`
 * ne serait jamais arrivé aux générateurs.
 *
 * Le test épingle donc: (1) la constante contre son littéral, (2) un jsonb écrit
 * avec le littéral EN DUR et relu par la constante, (3) **la migration SQL du
 * port d'écriture, lue sur le disque**, qui doit contenir cette clé.
 */
export const NEXT_PLAN_ITEMS_KEY = "retained_next_plan";

/** Le strict minimum de client Supabase dont ce module a besoin. */
type MinimalClient = {
  from: (table: string) => any;
};

/**
 * LA FORME DE STOCKAGE, figée par le chef d'orchestre le 2026-08-18:
 * `[{ item: RetainedItem, anchor: "YYYY-MM-DD" }]`.
 *
 * ── POURQUOI L'ANCRE EST STOCKÉE À CÔTÉ DE L'ITEM, ET PAS DÉDUITE DE `at` ──
 * `RetainedItem.at` est LE JOUR OÙ LA PERSONNE L'A DIT. `anchor` est LA SEMAINE
 * QU'ELLE VISE. Les deux diffèrent dès qu'on écrit le dimanche pour la semaine
 * suivante — et c'est le cas le plus courant de ce canal. Déduire l'ancre de
 * `at` ferait mourir cette envie-là le lendemain matin: sept jours de vie
 * annoncés, un seul rendu, sans un mot. Le socle ne peut pas porter `anchor`
 * (il est pur et sans notion de semaine); il vit donc ici, dans l'enveloppe de
 * stockage.
 */
export type NextPlanEntry = {
  readonly item: RetainedItem;
  /** Le lundi ISO de la semaine visée. */
  readonly anchor: string;
};

// ===========================================================================
// L'ARITHMÉTIQUE DE LA SEMAINE — recopiée, et PROUVÉE ÉGALE par le test
// ===========================================================================

/**
 * Le lundi ISO de la semaine qui contient ce jour, ou `null`.
 *
 * ── POURQUOI RECOPIÉE ET PAS IMPORTÉE ─────────────────────────────────────
 * Les deux implémentations existantes vivent dans des modules d'I/O lourds:
 * `weekly_flow_io.ts` (`weekStartOf`) traîne `body_measure_io.ts`, et
 * `week_review_io.ts` (`weekStartOfLocalDate`) traîne le chargeur de doctrine
 * ET `gemini.ts`. Ce fichier-ci sera importé par les trois générateurs (lot
 * 1C); lui faire tirer un client de modèle serait le patron exact que
 * `retained_item.ts` a refusé pour `EATING_OCCASIONS`.
 *
 * La recopie n'est pas un pari: `retained_next_plan_test.ts` importe
 * `weekStartOf` (un test n'est dans aucun cycle d'imports) et échoue à la
 * première divergence, sur une année entière de jours.
 *
 * ⚠️ REND `null` sur un jour malformé, jamais un repli. Une ancre illisible
 * repliée sur « aujourd'hui » ferait vivre une envie de six semaines.
 */
export function isoMondayOf(day: unknown): string | null {
  const clean = parseRetainedDay(day);
  if (!clean) return null;
  const d = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // `getUTCDay()` vaut 0 le dimanche: `(dow + 6) % 7` met le lundi à 0.
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** `day + n` jours, en `YYYY-MM-DD`. `null` sur un jour malformé. */
function addDays(day: string, n: number): string | null {
  const clean = parseRetainedDay(day);
  if (!clean) return null;
  const d = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * LA LONGUEUR DE LA FENÊTRE, en jours. Privée, et elle le reste.
 *
 * ⚠️ NON EXPORTÉE EXPRÈS. Cicatrice de ce dépôt: « un test paramétré par sa
 * propre constante reste vert quand on change la constante ». Le test écrit les
 * dates EN DUR; un lecteur qui aurait besoin de la borne demande une DATE
 * (`nextPlanLifeOf`), jamais le nombre.
 */
const WINDOW_DAYS = 7;

// ===========================================================================
// LA RÈGLE — pure, et elle rend des DATES avant de rendre un booléen
// ===========================================================================

/**
 * LA VIE D'UN `next_plan`, en trois dates adjacentes par construction.
 *
 * Trois et pas une, pour tuer l'ambiguïté de borne: personne ne doit avoir à
 * deviner si « expire le 24 » veut dire « encore là le 24 » ou « plus là le
 * 24 ». C'est exactement l'erreur d'un jour dont « une envie qui disparaît sans
 * prévenir » est faite.
 */
export type NextPlanLife = {
  /** Le lundi ISO de la semaine visée. */
  readonly anchor: string;
  /** LE DERNIER JOUR VIVANT — c'est CE jour-là que l'écran affiche (§6). */
  readonly lastDay: string;
  /** Le premier jour SANS l'item. `lastDay + 1`. */
  readonly expiredFrom: string;
};

/**
 * Les trois dates de vie d'un item déposé sous cette ancre.
 *
 * @param writtenAt **L'ANCRE DE LA SEMAINE VISÉE** — le champ `anchor` de
 *   l'entrée stockée, et PAS le jour de la frappe.
 *
 *   La distinction est la seule chose qui rend cette règle juste: quelqu'un qui
 *   écrit le DIMANCHE pour la semaine SUIVANTE choisit son ancre, et son envie
 *   vit la semaine entière. Ancrer sur le jour de la frappe la ferait mourir le
 *   lendemain matin — une perte de données qui aurait l'air d'une règle.
 *
 *   La normalisation au lundi ISO ci-dessous est une RÉPARATION, pas la
 *   conception: `withNextPlanEntries` n'écrit que des lundis, donc le calcul est
 *   l'identité sur toute donnée venue de lui. Elle existe pour un producteur
 *   d'une autre version — mieux vaut le recaler que lui rendre une fenêtre
 *   décalée de trois jours.
 *
 * @returns `null` quand `writtenAt` n'est pas un jour propre. `null` est un
 *   REFUS: un item dont on ne sait pas dire quand il meurt ne s'affiche pas et
 *   ne se sert pas.
 */
export function nextPlanLifeOf(writtenAt: unknown): NextPlanLife | null {
  const anchor = isoMondayOf(writtenAt);
  if (!anchor) return null;
  const lastDay = addDays(anchor, WINDOW_DAYS - 1);
  const expiredFrom = addDays(anchor, WINDOW_DAYS);
  if (!lastDay || !expiredFrom) return null;
  return { anchor, lastDay, expiredFrom };
}

/**
 * CET ITEM EST-IL ENCORE VIVANT ? Module PUR, jumeau exact de la lecture.
 *
 * ⚠️ SIGNATURE FIGÉE par le contrat de phase 0 (§6).
 *
 * ── LES TROIS REFUS, ET AUCUN N'EST UN REPLI ──────────────────────────────
 * 1. `scope !== "next_plan"` ⇒ `false`. Ce n'est pas « il n'expire jamais »:
 *    un `durable` posé dans le magasin provisoire est un producteur cassé.
 *    Rendre `true` le pousserait dans la section « Pour la semaine prochaine »,
 *    où l'écran lui imprimerait une date d'expiration qu'il n'a pas, et où 1C
 *    le routerait comme une envie. Même doctrine que `parseRetainedItem`: une
 *    ligne que son producteur n'avait pas le droit d'écrire ne remonte pas.
 *    ⚠️ Le socle garantit déjà `craving ⇒ next_plan` À LA COMPILATION; cette
 *    branche mord sur les CINQ autres familles, dont `food.*` et `method.*`
 *    qui peuvent légitimement être `next_plan` (retour sur brouillon) ou
 *    `durable` (questionnaire). C'est là qu'elle sert.
 * 2. `writtenAt` illisible ⇒ `false`. Voir `nextPlanLifeOf`.
 * 3. `today` illisible ⇒ `false`. L'appelant est cassé; servir une envie sur
 *    une date qu'on n'a pas su lire serait servir n'importe quoi.
 *
 * ── ⚠️ AUCUNE BORNE BASSE, ET C'EST DÉLIBÉRÉ ──────────────────────────────
 * Un item ancré à la semaine PROCHAINE est vivant AUJOURD'HUI. La règle
 * s'appelle « expiration », pas « activation »: un item écrit d'avance est un
 * item futur, pas un item périmé. Et le §6 nomme la section « **Pour la semaine
 * prochaine** » — la cacher jusqu'au lundi ferait disparaître de l'écran ce que
 * la personne vient d'y déposer, ce qui est le défaut que ce lot existe pour
 * fermer.
 *
 * @param writtenAt l'ANCRE (`NextPlanEntry.anchor`), pas le jour de la frappe.
 * @param today le jour LOCAL de la personne, passé par l'appelant. Ce module ne
 *   lit aucune horloge.
 */
export function isNextPlanItemAlive(
  item: RetainedItem,
  writtenAt: string,
  today: string,
): boolean {
  if (!item || item.scope !== "next_plan") return false;
  const life = nextPlanLifeOf(writtenAt);
  if (!life) return false;
  const day = parseRetainedDay(today);
  if (!day) return false;
  // Comparaison de chaînes: `YYYY-MM-DD` est ordonné lexicographiquement, et
  // c'est déjà la façon dont `accident.ts` compare ses dates de plan.
  return day <= life.lastDay;
}

// ===========================================================================
// LE MAGASIN, EN PUR — lire et écrire la clé, sans base
// ===========================================================================

/** Ce qu'une lecture du magasin a écarté, et pourquoi. Jamais silencieux. */
export interface NextPlanRefusals {
  readonly total: number;
  /** L'enveloppe n'était pas `{item, anchor}`, ou l'item était illisible. */
  readonly malformed: number;
  /** Pas d'ancre lisible: on ne sait pas dire quand cet item meurt. */
  readonly noAnchor: number;
  /** Un item `durable` rangé dans le magasin provisoire. */
  readonly notNextPlan: number;
}

export interface NextPlanReadout {
  readonly entries: NextPlanEntry[];
  readonly refused: NextPlanRefusals;
}

/**
 * LA SEULE lecture du magasin provisoire. PURE.
 *
 * ⚠️ LE COMPTEUR N'EST PAS DÉCORATIF. `parseRetainedItem` applique
 * `canProduce(source, kind)` À LA LECTURE: une ligne que son producteur n'avait
 * pas le droit d'écrire ne remonte pas, même déjà en base. Sans compteur, un
 * magasin dont la moitié des lignes est refusée ressemble EXACTEMENT à un
 * magasin à moitié vide — cicatrice nommée du dépôt, « champ déclaré par le
 * modèle = compteur obligatoire ».
 *
 * ⚠️ AUCUN REPLI SUR `item.at` QUAND L'ANCRE MANQUE. C'est le refus le plus
 * important de cette fonction: `at` est le jour où c'est dit, l'ancre est la
 * semaine visée, et les confondre ferait mourir dès le lundi ce qui a été écrit
 * le dimanche pour la semaine d'après.
 */
export function readNextPlanEntries(
  constraints: Record<string, unknown> | null | undefined,
): NextPlanReadout {
  const raw = (constraints ?? {})[NEXT_PLAN_ITEMS_KEY];

  // ⚠️ UN MAGASIN QUI N'EST PAS UNE LISTE COMPTE POUR UNE LIGNE REFUSÉE, pas
  // pour zéro. À zéro, un jsonb corrompu serait indiscernable d'un jsonb vide.
  if (!Array.isArray(raw)) {
    const broken = raw === undefined || raw === null ? 0 : 1;
    return {
      entries: [],
      refused: {
        total: broken,
        malformed: broken,
        noAnchor: 0,
        notNextPlan: 0,
      },
    };
  }

  const entries: NextPlanEntry[] = [];
  let malformed = 0;
  let noAnchor = 0;
  let notNextPlan = 0;

  for (const row of raw) {
    const env = row && typeof row === "object" && !Array.isArray(row)
      ? row as Record<string, unknown>
      : null;
    if (!env) {
      malformed += 1;
      continue;
    }
    const item = parseRetainedItem(env.item);
    if (!item) {
      malformed += 1;
      continue;
    }
    if (item.scope !== "next_plan") {
      notNextPlan += 1;
      continue;
    }
    const anchor = isoMondayOf(env.anchor);
    if (!anchor) {
      noAnchor += 1;
      continue;
    }
    entries.push({ item, anchor });
  }

  return {
    entries,
    refused: {
      total: malformed + noAnchor + notNextPlan,
      malformed,
      noAnchor,
      notNextPlan,
    },
  };
}

/**
 * CE QUI A LE DROIT D'ENTRER DANS LE MAGASIN PROVISOIRE, et ce qui n'y entre
 * pas. Miroir exact de `partitionForDurableStore` (lot 1A).
 *
 * Exporté pour que le refus de `withNextPlanEntries` soit DICIBLE par son
 * appelant: sans lui, quelqu'un qui range un `portion.adjust` ici ne pourrait
 * rien dire à la personne, et la mesure disparaîtrait en silence.
 *
 * ⚠️ CE N'EST PAS UN PARAMÈTRE DE GARDE. `withNextPlanEntries` filtre TOUJOURS,
 * qu'on appelle cette fonction ou non (« paramètre de garde optionnel = garde
 * désarmée »).
 *
 * ⚠️ L'ANCRE DOIT DÉJÀ ÊTRE UN LUNDI — elle n'est PAS recalée ici. Strict à
 * l'écriture, tolérant à la lecture: un producteur qui écrit un mercredi est un
 * producteur cassé, et le recaler en silence effacerait la seule trace du
 * défaut. `readNextPlanEntries`, lui, recale ce qu'il trouve — il ne choisit pas
 * ce qui est en base. Mêmes noms et même règle que le miroir front du lot 1D
 * (`frontend/src/keel/api/retainedItems.ts`), pour qu'un relecteur n'ait pas à
 * traduire d'un côté à l'autre.
 */
export function partitionForNextPlanStore(
  entries: readonly NextPlanEntry[],
): { provisional: NextPlanEntry[]; misfiled: NextPlanEntry[] } {
  const provisional: NextPlanEntry[] = [];
  const misfiled: NextPlanEntry[] = [];
  for (const entry of entries ?? []) {
    const ok = entry?.item?.scope === "next_plan" &&
      isoMondayOf(entry?.anchor) === entry?.anchor;
    (ok ? provisional : misfiled).push(entry);
  }
  return { provisional, misfiled };
}

/**
 * Rend un `practical_constraints` NEUF portant ces entrées. **Ne mute pas
 * l'entrée**, et ne touche à aucune autre clé — surtout pas `retained_items`,
 * qui est le magasin durable du lot 1A.
 *
 * ── C'EST UN REMPLACEMENT DE CLÉ, PAS UNE FUSION ──────────────────────────
 * La liste passée devient la liste stockée, comme `food_preferences` et comme
 * `retained_items`. Le reste de la colonne est recopié tel quel.
 *
 * ⚠️ PUR, ET IL NE PERSISTE RIEN. Voir l'en-tête du fichier: écrire le résultat
 * par un `update` de la colonne entière effacerait le magasin durable écrit une
 * seconde plus tôt par l'autre bout du produit. La phase 2 doit passer par une
 * écriture CIBLÉE, sur le patron de `keel_write_food_preferences`.
 *
 * ⚠️ UNE ANCRE QUI N'EST PAS UN LUNDI EST REFUSÉE, PAS RECALÉE — voir
 * `partitionForNextPlanStore`. Même règle et mêmes noms que le miroir front du
 * lot 1D (`withNextPlanEntries`).
 */
export function withNextPlanEntries(
  constraints: Record<string, unknown> | null | undefined,
  entries: readonly NextPlanEntry[],
): Record<string, unknown> {
  const base = { ...(constraints ?? {}) } as Record<string, unknown>;
  base[NEXT_PLAN_ITEMS_KEY] = partitionForNextPlanStore(entries).provisional
    .map((entry) => ({
      item: retainedItemToJson(entry.item),
      anchor: entry.anchor,
    }));
  return base;
}

// ===========================================================================
// LA LECTURE — la seule I/O de ce fichier
// ===========================================================================

/**
 * Un item vivant, AVEC ses dates de vie.
 *
 * ⚠️ EXISTE POUR LE LOT 1D, et c'est un AJOUT à l'interface figée, pas une
 * modification: `nextPlanItemsFor` garde exactement la signature du contrat et
 * n'est plus qu'une projection de celle-ci.
 *
 * Motif: un `RetainedItem` ne porte PAS son ancre — `at` est le jour où la
 * personne l'a dit, pas la semaine qu'elle vise, et les deux diffèrent dès
 * qu'on écrit le dimanche pour la semaine suivante. Un écran qui ne recevrait
 * que `RetainedItem[]` ne pourrait donc pas afficher la date d'expiration que
 * le §6 exige, et il la recalculerait de travers depuis `at`.
 */
export type DatedNextPlanItem = {
  readonly item: RetainedItem;
  readonly life: NextPlanLife;
};

/**
 * LES `next_plan` ENCORE VIVANTS DE CETTE PERSONNE, avec leurs dates.
 *
 * ── LE CHEMIN, ET CE QU'IL GARDE ──────────────────────────────────────────
 * 1. la ligne `student_goals` de la personne, par un `.eq("user_id")`
 *    EXPLICITE. Ce module reçoit un client `service_role`, qui traverse RLS:
 *    aucune policy ne protège quoi que ce soit ici. Cicatrice nommée du dépôt —
 *    « RLS ne remplace pas un `.eq(user_id)` », mesurée sur la ligne d'un élève
 *    rendue au coach;
 * 2. `readNextPlanEntries` — un item difforme tombe SEUL, ses voisins restent,
 *    et ce qui tombe est COMPTÉ;
 * 3. l'expiration, calculée. Aucune écriture, aucune suppression.
 *
 * ── ⚠️ `userId` EST LA SEULE CLÉ, ET LE SOLO EST SERVI COMME TOUT LE MONDE ─
 * Plus aucune résolution de foyer, plus aucun `household_id`, plus d'événement
 * `solo_no_channel`: ce chemin ne peut plus rendre `[]` pour la seule raison
 * qu'une personne vit seule. C'est tout l'objet du déménagement du magasin
 * (voir l'en-tête). Une ligne `student_goals` absente rend `[]` — c'est l'état
 * normal de quelqu'un qui n'a pas encore posé d'objectif, pas une panne.
 *
 * @param today le jour LOCAL de la personne, `YYYY-MM-DD`. Requis: ce module ne
 *   lit aucune horloge, et un `today` déduit en UTC ferait mourir une envie un
 *   jour trop tôt à Paris.
 */
export async function nextPlanItemsWithLifeFor(args: {
  admin: MinimalClient;
  userId: string;
  today: string;
}): Promise<DatedNextPlanItem[]> {
  const today = parseRetainedDay(args.today);
  const userId = String(args.userId ?? "").trim();
  if (!today || !userId) {
    warn("bad_args", { userId: userId ? "set" : "empty", today: args.today });
    return [];
  }

  let constraints: Record<string, unknown> | null = null;
  try {
    const res = await args.admin
      .from("student_goals")
      .select("practical_constraints")
      .eq("user_id", userId)
      .maybeSingle();
    if (res.error) throw new Error(String(res.error.message ?? res.error));
    const row = (res.data ?? null) as Record<string, unknown> | null;
    const pc = row?.practical_constraints;
    constraints = pc && typeof pc === "object" && !Array.isArray(pc)
      ? pc as Record<string, unknown>
      : null;
  } catch (error) {
    warn("goals_unreadable", { error: messageOf(error) });
    return [];
  }

  const { entries, refused } = readNextPlanEntries(constraints);

  const out: DatedNextPlanItem[] = [];
  for (const entry of entries) {
    const life = nextPlanLifeOf(entry.anchor);
    if (!life) continue;
    if (isNextPlanItemAlive(entry.item, entry.anchor, today)) {
      out.push({ item: entry.item, life });
    }
  }

  // AUCUN ITEM NE SE PERD EN SILENCE. Les nombres se lisent ensemble:
  // `refused.total > 0` = un producteur écrit du difforme; `entries > alive` =
  // de l'expiré, ce qui est le cas NOMINAL et pas un incident.
  if (entries.length > 0 || refused.total > 0) {
    console.log(JSON.stringify({
      tag: "keel/retained_next_plan",
      event: "read",
      stored: entries.length + refused.total,
      readable: entries.length,
      alive: out.length,
      refused_malformed: refused.malformed,
      refused_no_anchor: refused.noAnchor,
      refused_not_next_plan: refused.notNextPlan,
    }));
  }
  return out;
}

/**
 * LES `next_plan` ENCORE VIVANTS. **La signature figée par le contrat §6.**
 *
 * L'expiration est CALCULÉE ICI, à la lecture — voir l'en-tête du fichier pour
 * la règle et pour l'option écartée.
 */
export async function nextPlanItemsFor(args: {
  admin: MinimalClient;
  userId: string;
  today: string;
}): Promise<RetainedItem[]> {
  const dated = await nextPlanItemsWithLifeFor(args);
  return dated.map((d) => d.item);
}

// ---------------------------------------------------------------------------

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warn(event: string, extra: Record<string, unknown>): void {
  console.warn(JSON.stringify({
    tag: "keel/retained_next_plan",
    event,
    ...extra,
  }));
}
