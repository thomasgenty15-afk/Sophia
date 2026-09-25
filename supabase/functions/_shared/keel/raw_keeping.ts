/**
 * CE QUI NE PEUT PAS ATTENDRE ENTRE LA COURSE ET LA CASSEROLE. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'IL FERME, RAPPORTÉ SUR UN PLAN RÉEL LE 2026-09-01
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     « Dans le plan, ça me disait de cuisiner le poulet acheté le lundi,
 *       le samedi. »
 *
 * ── CE QUI EXISTAIT DÉJÀ, ET POURQUOI ÇA N'A PAS SUFFI ────────────────────
 * `RAW_WINDOW_DAYS` (`fridge_window.ts`) porte la fenêtre crue PAR GROUPE
 * depuis le 2026-08-22, et `grocery_waves.ts` s'en sert pour DATER l'achat de
 * chaque article. Le calcul est juste, et il n'a jamais menti.
 *
 * Mais il tourne **APRÈS**, à la lecture, et **le modèle ne l'a jamais su**. Il
 * compose ses sessions à l'aveugle: rien dans le prompt ne dit qu'une volaille
 * fraîche ne tient pas six jours. Le moteur en déduit ensuite qu'il faudra une
 * seconde course — ce qui est vrai —, mais la personne, elle, lit une liste
 * sans date et fait UNE course le premier jour.
 *
 * C'est la cicatrice « la promesse et la clé de schéma doivent se toucher »
 * prise par l'autre bout: la règle est appliquée en aval d'une composition qui
 * l'ignore, et personne ne la lui a dite.
 *
 * ── CE QUE CE MODULE AJOUTE, ET CE QU'IL N'AJOUTE PAS ─────────────────────
 * Il ne redéfinit AUCUNE durée: `RAW_WINDOW_DAYS` reste la seule table, et elle
 * est le miroir de `food_groups.raw_window_days`. Il traduit cette table en
 * deux choses que le reste du moteur n'avait pas:
 *
 *   ① `rawReachLines()` — des JOURS NOMMÉS pour la consigne. « Une règle
 *      générale ne se compare pas, un jour NOMMÉ si »: c'est la leçon
 *      d'`addedCookDays`, resservie une quatrième fois. Le modèle ne reçoit pas
 *      « la volaille tient deux jours », il reçoit « après jeudi, une volaille
 *      ne peut plus venir de la première course ».
 *   ② `rawKeepingBreaches()` — le CONSTAT, après coup, préparation par
 *      préparation. Il ne refuse rien (ce n'est pas la fenêtre du cuit, qui
 *      rend malade: ici la sortie honnête est une seconde course, et elle
 *      existe déjà). Il COMPTE, et il donne à `plan_rationale` de quoi le dire.
 *
 * ⛔ IL NE DÉCIDE AUCUNE DATE D'ACHAT. C'est `grocery_waves.ts`, et lui seul.
 * Un second calcul de la date ici serait la divergence que ce dépôt paie en
 * boucle — et celle qu'on regarde le moins garderait l'ancienne.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { PLATE_WINDOW_DAYS, RAW_WINDOW_DAYS, rawWindowDaysFor } from "./fridge_window.ts";
import { plannedShopRanks } from "./shopping_purchases.ts";

/**
 * LES FAMILLES QUE LA CONSIGNE NOMME, ET RIEN QUE CELLES-LÀ.
 *
 * ⚠️ QUATRE, PAS TRENTE. Le prompt n'a pas à réciter `RAW_WINDOW_DAYS`: la
 * moitié de la table vaut 21 jours (« ça ne contraint rien ») et une liste de
 * trente lignes se lit comme un tableau, c'est-à-dire pas du tout. On nomme les
 * familles qui MORDENT dans une fenêtre de sept jours, groupées par la durée
 * qu'elles partagent — le regroupement est ce qui rend la ligne lisible.
 *
 * ⛔ LES DURÉES NE SONT PAS ÉCRITES ICI, ELLES SONT LUES. Chaque entrée pointe
 * un groupe RÉEL, et sa fenêtre vient de `RAW_WINDOW_DAYS`. Écrire « 2 » à côté
 * de « poultry » créerait une seconde définition du nombre, et c'est exactement
 * ce que l'en-tête interdit. Un test compare les deux.
 */
export const RAW_FAMILIES: readonly {
  /** Le groupe qui porte la durée. Les autres de la ligne la partagent. */
  readonly ref: keyof typeof RAW_WINDOW_DAYS;
  /** Ce que la personne appelle ça. En anglais: c'est la langue du prompt. */
  readonly said: string;
}[] = [
  { ref: "white_fish", said: "fish and shellfish" },
  { ref: "poultry", said: "chicken, turkey, and any minced meat" },
  { ref: "red_meat", said: "beef, pork and lamb in the piece" },
  { ref: "leafy_greens", said: "salad leaves, fresh herbs and berries" },
];

/**
 * LE DERNIER JOUR DE LA FENÊTRE QU'UN ACHAT DU PREMIER JOUR PEUT SERVIR.
 *
 * `null` quand la famille atteint toute la fenêtre — il n'y a alors rien à
 * dire, et le dire quand même apprendrait au modèle une contrainte qui ne mord
 * pas.
 *
 * @param window les jetons de la fenêtre, DANS L'ORDRE DU PLAN. L'ordre est le
 *   sens: un plan qui part un jeudi a `thu` au rang 0.
 * @param days la fenêtre crue de la famille, en jours d'écart maximal. `2` veut
 *   dire « acheté lundi, cuisiné lundi, mardi ou mercredi » — la même lecture
 *   que `RAW_WINDOW_DAYS`, dont l'en-tête l'écrit une fois pour toutes.
 */
export function lastDayReachedFromFirstShop(
  window: readonly string[],
  days: number,
): string | null {
  if (!Array.isArray(window) || window.length === 0) return null;
  if (!Number.isFinite(days) || days < 0) return null;
  // Rang 0 = le jour de la course. `days` est un ÉCART, donc le dernier rang
  // atteint est `days` lui-même.
  if (days >= window.length - 1) return null;
  return window[days];
}

/**
 * CE QUE LE MODÈLE DOIT SAVOIR AVANT DE POSER SES SESSIONS.
 *
 * Rend `[]` quand la fenêtre est trop courte pour qu'une seule famille morde —
 * un plan de deux jours n'a aucune contrainte de fraîcheur à l'achat, et lui
 * servir le bloc serait trois lignes de bruit.
 *
 * ⚠️ LA PHRASE PORTE LA SORTIE, PAS L'INTERDICTION. Cuisiner du poulet le
 * samedi est parfaitement légitime — ça demande une course le jeudi, et le
 * moteur sait déjà la produire (`grocery_waves.ts`). Ce qu'on refuse, c'est le
 * silence: un plan qui fait acheter lundi ce qui se cuisine samedi sans le
 * dire.
 */
/**
 * ⟳ 2026-09-24 — LE MODÈLE N'ÉCRIT PLUS LE CALENDRIER D'ACHAT D'UN ALIMENT CRU.
 *
 * ⛔ DEUX PLANS RÉELS, LE MÊME DÉFAUT DANS LES DEUX SENS. Le 2026-09-08 (poul),
 * le déroulé disait « achète la dinde la veille » pendant que le moteur la
 * congelait à l'achat. Le 2026-09-24 (`ab2ab587`), il disait « sors le poulet
 * cru du congélateur samedi soir » pendant que le moteur l'achetait frais
 * vendredi. La consigne ne peut pas savoir quelle session aura sa course : c'est
 * la datation finale qui le décide (`buyDatesByIndex`, la scission, la règle des
 * deux jours), APRÈS la réponse du modèle.
 *
 * L'app le dit elle-même, depuis la liste finale : le bloc « à sortir du
 * congélateur la veille » de chaque session (`frozenLinesForPreparations`),
 * l'explication (`plan_rationale.ts`) et le rappel de la veille
 * (`thaw_reminder.ts`). ⚠️ `sessionsFedFromFreezer` compte encore les déroulés
 * qui NOMMENT le congélateur : un déroulé muet y est désormais le cas attendu.
 */
const NO_PURCHASE_TIMING =
  // ⚠️ « defrosted » ET PAS « thawed » : le second contient « wed », et une
  // consigne qui ne nomme pas un jour ne doit pas en écrire un par accident
  // (`week_bounds_test.ts`, « un jour de cuisine hors fenêtre »).
  "Do NOT write in a run_through or a method when a raw food is bought, frozen " +
  "or defrosted: the app works it out from the final shopping list and tells " +
  "the person itself.";

export function rawReachLines(
  window: readonly string[],
  cadence: RawReachCadence | null,
): string[] {
  if (cadence !== null && typeof cadence?.usesFreezer !== "boolean") {
    throw new Error(
      "[keel/raw_keeping] rawReachLines: `cadence` est `null` (cadence jamais " +
        "déclarée) ou un objet dont `usesFreezer` est booléen — un `?` en ferait " +
        "une garde désarmée",
    );
  }
  if (cadence !== null && cadence.usesFreezer === false) {
    return plannedShopLines(window, cadence);
  }
  const rows: string[] = [];
  for (const family of RAW_FAMILIES) {
    const last = lastDayReachedFromFirstShop(window, RAW_WINDOW_DAYS[family.ref]);
    if (last === null) continue;
    rows.push(`- ${family.said}: fresh until ${last}, no later.`);
  }
  if (rows.length === 0) return [];
  const firstShop = window[0];
  // ⟳ 2026-09-09 (option A du point 3) — LES FEUILLES NE SE CONGÈLENT PAS.
  // Avec UNE course, une herbe fraîche posée dans une session au-delà de sa
  // ligne ne peut ni attendre au frais ni passer au congélateur: le moteur lui
  // ouvre alors une vague à elle seule (mesuré: une course le jeudi pour un
  // bouquet de persil). La sortie est en amont, dans la composition.
  const leafyLast = lastDayReachedFromFirstShop(window, RAW_WINDOW_DAYS.leafy_greens);
  const leafyLine = cadence?.usesFreezer === true && cadence.runs === 1 && leafyLast !== null
    ? [
      `Salad leaves and fresh herbs do NOT freeze, and there is no trip to buy ` +
      `them later: never put them into a session after ${leafyLast}. Past that ` +
      `day, use dried or frozen herbs, or serve the leaves on a day up to ` +
      `${leafyLast}.`,
    ]
    : [];
  return [
    "what a FIRST-DAY shop can still be cooked from -- fresh food does not " +
    "wait for the session that needs it:",
    ...rows,
    ...leafyLine,
    // ── LA SORTIE DÉPEND DE LA CADENCE, ET C'EST TOUT LE LOT DU 2026-09-09 ──
    // Deux sorties honnêtes existent quand une chair tombe au-delà de sa
    // ligne: une course plus proche de la session, ou un passage par le
    // congélateur le jour de la seule course. Le moteur choisit la seconde dès
    // que la cadence l'exige (`usesFreezer`); la consigne doit dire la MÊME,
    // sinon le déroulé promet un magasin que la liste n'ouvre pas.
    cadence?.usesFreezer === true
      ? (cadence.runs === 1
        ? `They shop ONCE, on ${firstShop}, and there is no later trip. `
        : `They go to the shop ${cadence.runs} times for ${cadence.sessions} ` +
          `cooking sessions, so some sessions have no trip of their own. `) +
        "This does NOT forbid cooking fresh fish or chicken on a day past its " +
        "line above -- but that food is bought at the shop that exists and goes " +
        "STRAIGHT INTO THE FREEZER on the day it is bought. " + NO_PURCHASE_TIMING
      : "This does NOT forbid cooking them later. It means the shopping for that " +
        "session happens closer to it: if you put fresh fish or chicken on a day " +
        "past its line above, the app schedules a later shop for it. " +
        NO_PURCHASE_TIMING + " Never plan a session that quietly assumes " +
        "week-old fresh meat.",
  ];
}

/**
 * ⟳ 2026-09-25 — LES COURSES CHOISIES, DITES AU MODÈLE AVANT QU'IL COMPOSE.
 *
 * ⛔ LE DÉFAUT, SUR LE BROUILLON `54aec009`: deux courses choisies, quatre
 * faites. La consigne ne donnait pas le nombre au modèle, et lui disait au
 * contraire « the app schedules a later shop for it »: il a mis du poulet frais
 * dans les trois sessions et du merlu le mardi, et le moteur a ouvert une
 * course pour chacun. Décision du propriétaire: « si le user dit 3, c'est 3 ».
 *
 * La consigne dit maintenant les jours de courses (`plannedShopRanks`, la
 * même règle que le moteur), la course qui nourrit chaque session (la
 * dernière course à son jour ou avant), et, pour chaque session, jusqu'à quel
 * repas une viande, une volaille, un poisson ou une salade de cette course
 * reste bon: la fenêtre crue (`RAW_WINDOW_DAYS`, achat → cuisson) et la limite
 * achat → assiette (`PLATE_WINDOW_DAYS`). Au-delà, rien de frais: œufs,
 * légumineuses, tofu, poisson en conserve ou fromage.
 *
 * Seulement quand le plan ne s'appuie pas sur le congélateur: sinon la
 * consigne du congélateur (`rawReachLines`) garde la main.
 */
function plannedShopLines(window: readonly string[], cadence: RawReachCadence): string[] {
  if (window.length === 0) return [];
  const lastRank = window.length - 1;
  const sessionRanks = cadence.cookDays
    .map((token) => window.indexOf(token))
    .filter((rank) => rank >= 0);
  const shopRanks = plannedShopRanks({ sessionRanks, runs: cadence.runs });
  const shopDays = shopRanks.map((rank) => window[rank]);
  const sessionLines: string[] = [];
  for (const session of [...new Set(sessionRanks)].sort((a, b) => a - b)) {
    const shop = [...shopRanks].filter((rank) => rank <= session).pop() ?? 0;
    const limits: string[] = [];
    for (const family of RAW_FAMILIES) {
      const raw = RAW_WINDOW_DAYS[family.ref];
      if (session - shop > raw) {
        limits.push(`no fresh ${family.said}`);
        continue;
      }
      const plate = PLATE_WINDOW_DAYS[family.ref] ?? raw;
      const lastMeal = shop + plate;
      if (lastMeal >= lastRank) continue;
      limits.push(`${family.said} only for meals up to ${window[lastMeal]}`);
    }
    sessionLines.push(
      `- the ${window[session]} session is fed by the ${window[shop]} shop: ` +
        (limits.length === 0 ? "its fresh food keeps for every meal of the plan." : `${limits.join("; ")}.`),
    );
  }
  const shopList = shopDays.length === 1
    ? shopDays[0]
    : `${shopDays.slice(0, -1).join(", ")} and ${shopDays[shopDays.length - 1]}`;
  return [
    `their food shops: exactly ${shopDays.length} -- the number they chose -- on ${shopList}, and ` +
    "on no other day. A shop on a cooking day is done that morning, before the session. " +
    "Each session cooks from the last shop on or before its day.",
    "what each session can cook FRESH -- raw fish, meat and salad leaves do not wait:",
    ...sessionLines,
    "Past those days there is NO shop to buy them fresh: build those meals on eggs, " +
    "pulses, tofu, tinned fish or cheese instead. " + NO_PURCHASE_TIMING,
  ];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CADENCE DE COURSES, TELLE QUE LA CONSIGNE DOIT LA DIRE — 2026-09-09.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL (poul, brouillon du 2026-09-08) ──
 * Profil « une course », congélateur déclaré, six jours. Le moteur a daté la
 * dinde hachée du mercredi et l'a marquée « à congeler à l'achat » — c'est le
 * repli du lot C, et il est juste. Le déroulé de la session de dimanche, écrit
 * par le modèle, disait « Acheter la dinde fraîche le jour même ou la veille ».
 * Le modèle obéissait à la phrase d'`rawReachLines` d'alors, qui supposait une
 * course supplémentaire — et personne ne lui avait dit qu'il n'y en aurait
 * pas. Deux consignes contraires pour la même dinde, dans le même plan.
 *
 * ── CE QUE PORTE CET OBJET, ET CE QU'IL NE DÉCIDE PAS ─────────────────────
 * Il est la LECTURE de `CookingPlan` (`cooking_plan.ts`): `runs`, `sessions`,
 * `usesFreezer`. Il ne recalcule rien — `usesFreezer` y est déjà « ce plan
 * s'appuie sur le congélateur », c'est-à-dire exactement la condition sous
 * laquelle `grocery_waves.ts` replie les vagues et congèle à l'achat. Un seul
 * calcul, trois lecteurs (les vagues, la consigne, l'explication).
 *
 * `null` = la cadence n'a jamais été déclarée (`capacity.plan === null`): la
 * consigne est alors celle d'avant ce lot, au caractère près.
 */
export interface RawReachCadence {
  readonly runs: number;
  readonly sessions: number;
  readonly usesFreezer: boolean;
  /**
   * ⟳ 2026-09-25 — LES JOURS DE CUISINE PRÉVUS (`CookingPlan.cookDays`),
   * jetons de la fenêtre. REQUIS: c'est d'eux que viennent les jours de
   * courses dits au modèle (`plannedShopRanks`), les mêmes que le moteur
   * pose ensuite.
   */
  readonly cookDays: readonly string[];
}

/**
 * LES SESSIONS NOURRIES PAR UN ARTICLE CONGELÉ À L'ACHAT, ET CELLES QUI LE DISENT.
 *
 * ⛔ C'EST UN COMPTEUR, PAS UNE GARDE. Il ne refuse rien: il dit, plan par
 * plan, si la consigne du congélateur a mordu. Sans lui, un déroulé qui promet
 * « acheter frais le jour même » sous une ligne congelée ressemble trait pour
 * trait à un déroulé qui dit « sors-la du congélateur la veille » — les deux
 * rendent un plan qui parse.
 *
 * ⚠️ IL LIT DE LA PROSE, ET C'EST ASSUMÉ COMME UNE OBSERVATION. Le test de
 * présence cherche le mot « congélateur » dans les deux langues du produit
 * (`fr`, `en`); il ne prétend pas juger la phrase. Le jour où la clé de schéma
 * existe (« la promesse et la clé de schéma doivent se toucher »), ce compteur
 * la lira à sa place.
 */
const FREEZER_NAMED = /cong[ée]l|freez|frozen|surgel|thaw/i;

export function sessionsFedFromFreezer(input: {
  sessions: readonly { readonly day: string; readonly preparationIds: readonly string[]; readonly runThrough: string }[];
  /** Les préparations nourries par au moins une ligne congelée à l'achat. */
  frozenPreparationIds: ReadonlySet<string>;
}): { fed: number; named: number; silentDays: string[] } {
  let fed = 0;
  let named = 0;
  const silentDays: string[] = [];
  for (const session of input.sessions ?? []) {
    if (!session.preparationIds.some((id) => input.frozenPreparationIds.has(id))) continue;
    fed += 1;
    if (FREEZER_NAMED.test(String(session.runThrough ?? ""))) named += 1;
    else silentDays.push(session.day);
  }
  return { fed, named, silentDays };
}

/**
 * UNE PRÉPARATION QUI NE PEUT PAS VIVRE DE LA PREMIÈRE COURSE.
 *
 * ⚠️ CE N'EST PAS UNE FAUTE. C'est un fait: cette session-là réclame une course
 * plus tardive. Le nom du type le dit — `breach` décrit l'écart avec l'hypothèse
 * « une seule course au départ », pas une infraction du modèle.
 */
export interface RawKeepingBreach {
  /** L'id de la préparation, tel que le plan le porte. */
  readonly preparationId: string;
  /** Le jour où elle est cuisinée. */
  readonly cookOn: string;
  /** Le groupe le plus fragile qu'elle utilise. */
  readonly group: string;
  /** Sa fenêtre crue, en jours d'écart. */
  readonly windowDays: number;
  /** Le rang de la cuisson dans la fenêtre du plan. */
  readonly cookAt: number;
}

/**
 * QUELLES PRÉPARATIONS RÉCLAMENT UNE COURSE APRÈS LE PREMIER JOUR.
 *
 * ⛔ IL LIT LES GROUPES, PAS LES MOTS. Un ingrédient dont le groupe n'a pas été
 * résolu est IGNORÉ — pas rangé du côté sûr, pas du côté fragile. Le compter
 * comme fragile ferait annoncer des courses qu'aucune donnée ne réclame; le
 * compter comme sûr le rendrait invisible. L'appelant reçoit donc, à côté, le
 * nombre d'ingrédients sans groupe, et c'est LUI qui décide quoi en dire —
 * même posture que `rawWindowCounts`.
 *
 * @param window les jetons de la fenêtre, dans l'ordre du plan.
 */
export function rawKeepingBreaches(input: {
  window: readonly string[];
  preparations: readonly {
    readonly id: string;
    readonly cookOn: string | null;
    /**
     * Ses ingrédients, tels que la LISTE DE COURSES les porte: le groupe
     * (`null` = non résolu) et le rayon réduit à « périssable ou pas ».
     *
     * ⟳ 2026-09-09 — LE RAYON ENTRE ICI, ET C'EST LE MIROIR DE `grocery_waves`.
     * Le moteur des dates ne regarde la fenêtre crue QUE sur les rayons
     * périssables (`PERISHABLE_AISLES`); ce compteur, lui, la regardait sur
     * TOUT. Mesuré: « romarin, 1 petit pot » en épicerie, groupe feuilles
     * fraîches par son alias, comptait une brèche et faisait dire « ce qui se
     * cuisine dimanche s'achète au plus près » de pommes de terre au romarin.
     * Deux lecteurs d'une même règle sur deux populations différentes, c'est
     * l'explication qui a tort.
     */
    readonly ingredients: readonly { readonly group: string | null; readonly perishable: boolean }[];
  }[];
}): {
  breaches: RawKeepingBreach[];
  unknownGroups: number;
  /** Ingrédients écartés parce que leur rayon ne périt pas — COMPTÉS, pas tus. */
  nonPerishable: number;
  checked: number;
} {
  const window = input?.window ?? [];
  const breaches: RawKeepingBreach[] = [];
  let unknownGroups = 0;
  let nonPerishable = 0;
  let checked = 0;
  for (const prep of input?.preparations ?? []) {
    const cookAt = prep.cookOn ? window.indexOf(prep.cookOn) : -1;
    // Une cuisson qu'on ne sait pas situer ne se compare à rien. Elle n'est
    // NI une infraction NI une conformité: elle sort du compte, comme les
    // occasions qui ne puisent dans aucune casserole sortent de la fenêtre du
    // cuit.
    if (cookAt < 0) continue;
    let worst: { group: string; days: number } | null = null;
    for (const ing of prep.ingredients ?? []) {
      if (ing.perishable !== true) {
        nonPerishable += 1;
        continue;
      }
      const days = rawWindowDaysFor(ing.group);
      if (days === null) {
        unknownGroups += 1;
        continue;
      }
      if (worst === null || days < worst.days) worst = { group: String(ing.group), days };
    }
    if (worst === null) continue;
    checked += 1;
    if (cookAt > worst.days) {
      breaches.push({
        preparationId: prep.id,
        cookOn: prep.cookOn as string,
        group: worst.group,
        windowDays: worst.days,
        cookAt,
      });
    }
  }
  return { breaches, unknownGroups, nonPerishable, checked };
}

/**
 * LES JOURS DE CUISSON QUI RÉCLAMENT LEUR PROPRE COURSE, dédoublonnés et dans
 * l'ordre de la fenêtre. C'est la forme que `plan_rationale` sait dire.
 */
export function daysNeedingTheirOwnShop(
  window: readonly string[],
  breaches: readonly RawKeepingBreach[],
): string[] {
  const days = new Set(breaches.map((b) => b.cookOn));
  return (window ?? []).filter((d) => days.has(d));
}
