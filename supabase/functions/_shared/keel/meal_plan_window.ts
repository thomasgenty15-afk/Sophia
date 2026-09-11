import { type DayToken } from "./tokens.ts";

// LA FENÊTRE D'UN PLAN DE REPAS — et qui est courant, et qui est suivant.
//
// ===========================================================================
// CE QUE CE MODULE REMPLACE
// ===========================================================================
// La fenêtre d'un plan était une DÉDUCTION, faite trois fois, différemment:
// `daysUntilSunday(today)` au moment de générer, `created_at` au moment de
// rendre l'écran, `created_at.slice(0,10)` au moment de rapprocher une photo.
// Tant qu'un plan commençait toujours aujourd'hui, les trois tombaient juste.
//
// Depuis `20260807090000_meal_plan_window`, la ligne porte `starts_on` et
// `duration_days`. La déduction disparaît: il n'y a plus qu'à lire.
//
// ===========================================================================
// « LE SUIVANT DEVIENT LE COURANT » N'EST PAS UN ÉVÉNEMENT
// ===========================================================================
// Ce sont les MÊMES lignes avec `today` avancé d'un jour. Aucun cron, aucun
// statut à écrire, donc rien qui puisse cesser d'être écrit — et chaque panne
// silencieuse documentée dans ce dépôt est exactement ça: un statut stocké dont
// le pivot avait supprimé l'écrivain (voir l'en-tête de `following_io.ts`).
//
// C'est aussi l'idiome que `plan_versions` applique déjà: `status` dit qui fait
// autorité, les dates disent si aujourd'hui est dedans, et la ligne n'est jamais
// re-statuée quand sa fenêtre expire (`provisioning.ts::planWeekNumber`).
//
// ===========================================================================
// PUR: L'HORLOGE EST PASSÉE, JAMAIS LUE
// ===========================================================================
// Aucune fonction d'ici n'appelle `new Date()`. Le `today` vient de l'appelant,
// qui l'a résolu dans le fuseau de l'ÉLÈVE. Lire l'horloge ici classerait un
// plan au mauvais jour pour quiconque n'est pas sur le fuseau du serveur — la
// famille de bugs nocturnes que `local_date.ts` documente en tête.
//
// Ce fichier a un MIROIR: `frontend/src/keel/api/mealWindow.ts`. Les deux
// portent la même table de cas (`MEAL_WINDOW_FIXTURES`), et c'est cette table
// qui empêche les deux de diverger.

/** Les sept jetons, dans l'ordre du calendrier. */
export const WEEK_TOKENS: readonly DayToken[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

/**
 * Le plafond structurel des JOURS MANGÉS d'une fenêtre. Voir la migration
 * `20260807090000` pour le pourquoi, et `20260903170000` pour ce qui a changé:
 * depuis le 2026-09-03 la base accepte `duration_days` jusqu'à 8, à condition
 * que `duration_days - lead_days` reste entre 1 et 7 — la veille (rang 0, jour
 * de cuisine sans repas) est DANS la fenêtre et HORS des jours mangés.
 *
 * ⚠️ `windowDates` / `windowDayOrder` bornent toujours à 7: un plan porte des
 * JETONS de jour (`mon`…`sun`), et un huitième jour porterait le jeton du
 * premier. C'est ce qui fait que `withCookDayBefore` refuse encore `no_room` sur
 * sept jours mangés — voir son en-tête.
 */
export const MAX_WINDOW_DAYS = 7;

/**
 * LE NOMBRE DE JOURS DE VEILLE QU'UNE FENÊTRE PEUT PORTER — 0 ou 1.
 *
 * Épinglé (`constant_pins_test.ts`), recopié dans la migration
 * `20260903170000` (`check (lead_days in (0,1))`). Deux veilles n'ont aucun
 * sens: on cuisine LA veille, pas l'avant-veille.
 */
export const MAX_LEAD_DAYS = 1;

/**
 * Ce qu'une ligne de plan doit porter pour être SITUÉE DANS LE TEMPS.
 *
 * Pas d'`id`: la sélection n'en lit jamais un. Le générique porte l'identité de
 * l'appelant (`mealId` côté écran, `id` dans les fixtures), et l'exiger ici
 * obligerait chaque appelant à renommer son champ pour satisfaire un type qui
 * ne s'en sert pas.
 */
export interface MealPlanWindowRow {
  startsOn: string;
  durationDays: number;
  /** Non nul = la ligne a été REMPLACÉE. Ne dit rien sur « courante ». */
  retiredAt?: string | null;
  /** Départage deux lignes qui se disputeraient le même rang. */
  createdAt?: string | null;
}

/**
 * Où en est cette fenêtre par rapport à un jour donné.
 *
 * Les trois jetons sont le miroir de `PlanWindowState` dans
 * `provision-day-v1/provisioning.ts`: un plan qui n'a pas commencé et un plan
 * dont la fenêtre est écoulée ne sont pas des erreurs — c'est un calendrier, et
 * cette date est en dehors.
 */
export type MealWindowState = "in_window" | "not_started" | "elapsed";

export function planEndsOn(startsOn: string, durationDays: number): string {
  return addDays(startsOn, Math.max(1, durationDays) - 1);
}

export function planWindowState(
  row: MealPlanWindowRow,
  today: string,
): MealWindowState {
  if (today < row.startsOn) return "not_started";
  if (today > planEndsOn(row.startsOn, row.durationDays)) return "elapsed";
  return "in_window";
}

export interface MealPlanSelection<T extends MealPlanWindowRow> {
  /** Celui dont la fenêtre contient `today`. */
  current: T | null;
  /** Le prochain à démarrer. */
  next: T | null;
  /** Ceux dont la fenêtre est passée, du plus récent au plus ancien. */
  elapsed: T[];
  /**
   * Ce qui ne devrait pas exister: deux plans vivants se chevauchant, ou deux
   * plans futurs. La contrainte d'exclusion l'interdit depuis le 2026-08-07,
   * donc c'est forcément de la donnée antérieure.
   *
   * RENDU, JAMAIS JETÉ. Un plan qu'on écarte en silence est un plan dont
   * personne ne saura jamais qu'il a existé — et ce dépôt paie en boucle la
   * disparition silencieuse.
   */
  ambiguous: T[];
}

/**
 * Qui est courant, qui est suivant, pour ce jour-là.
 *
 * Les lignes RETIRÉES sont écartées d'emblée: elles ont été explicitement
 * remplacées, et les faire concourir ferait revivre un plan que l'élève a
 * décidé d'abandonner.
 */
export function selectMealPlans<T extends MealPlanWindowRow>(
  rows: readonly T[],
  today: string,
): MealPlanSelection<T> {
  const live = rows.filter((r) => !r.retiredAt);

  const running: T[] = [];
  const future: T[] = [];
  const elapsed: T[] = [];
  for (const row of live) {
    const state = planWindowState(row, today);
    if (state === "in_window") running.push(row);
    else if (state === "not_started") future.push(row);
    else elapsed.push(row);
  }

  // Le plus RÉCEMMENT démarré gagne chez les courants: si deux fenêtres se
  // chevauchent malgré tout (donnée ancienne), la plus fraîche est celle que
  // l'élève a demandée en dernier.
  running.sort((a, b) =>
    b.startsOn.localeCompare(a.startsOn) ||
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  );
  // Le plus PROCHE gagne chez les futurs: c'est celui qui prendra la main.
  future.sort((a, b) =>
    a.startsOn.localeCompare(b.startsOn) ||
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  );
  elapsed.sort((a, b) => b.startsOn.localeCompare(a.startsOn));

  return {
    current: running[0] ?? null,
    next: future[0] ?? null,
    elapsed,
    ambiguous: [...running.slice(1), ...future.slice(1)],
  };
}

/**
 * Le jeton de chaque jour de la fenêtre → sa date.
 *
 * REND MOINS DE SEPT ENTRÉES QUAND LA FENÊTRE EST PLUS COURTE, et c'est le
 * comportement porteur de tout le chantier: un jeton hors fenêtre n'a pas de
 * date, donc le plat n'est ni rendu, ni cochable, ni rapprochable. C'est la
 * fenêtre qui cache les jours qu'un plan tronqué ne possède plus — et c'est
 * pour ça qu'elle doit être une primitive de lecture et pas un filtre recopié
 * dans chaque appelant.
 */
export function windowDates(
  startsOn: string,
  durationDays: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  const days = Math.min(MAX_WINDOW_DAYS, Math.max(1, durationDays));
  for (let i = 0; i < days; i++) {
    const date = addDays(startsOn, i);
    out[dayTokenOf(date)] = date;
  }
  return out;
}

/** Les jetons dans l'ordre du PLAN, pas du calendrier. */
export function windowDayOrder(
  startsOn: string,
  durationDays: number,
): DayToken[] {
  const days = Math.min(MAX_WINDOW_DAYS, Math.max(1, durationDays));
  return Array.from({ length: days }, (_, i) => dayTokenOf(addDays(startsOn, i)));
}

/**
 * Ce que la fenêtre possède, et ce qu'elle ne possède plus.
 *
 * `outsideWindow` existe pour que les plats d'un plan tronqué soient MONTRÉS
 * sous un libellé plutôt que de s'évaporer. La ligne les garde (y toucher
 * renumérote les clés de coche, qui sont positionnelles); l'écran doit pouvoir
 * dire « ces jours sont passés dans ton prochain plan ».
 */
export function windowSplit<T extends { day?: string | null }>(
  items: readonly T[],
  dates: Record<string, string>,
): { inWindow: T[]; outsideWindow: T[] } {
  const inWindow: T[] = [];
  const outsideWindow: T[] = [];
  for (const item of items) {
    // Un plat sans jour n'appartient à aucune date: il vaut pour la fenêtre
    // entière, et l'écarter le ferait disparaître d'un plan qui le contient.
    if (!item.day) inWindow.push(item);
    else if (dates[item.day]) inWindow.push(item);
    else outsideWindow.push(item);
  }
  return { inWindow, outsideWindow };
}

/** Ce que le client DEMANDE. La résolution, elle, vit côté serveur. */
export type MealWindowRequest =
  | { kind: "until_sunday" }
  | { kind: "days"; count: number }
  | { kind: "exact"; startsOn: string; durationDays: number };

/**
 * L'intention devient une fenêtre.
 *
 * ── « UNTIL SUNDAY » UN DIMANCHE FAIT UN JOUR ─────────────────────────────
 * Et pas huit. `daysUntilSunday` documente déjà qu'il ne déborde pas
 * volontairement sur la semaine suivante — un « plan de la semaine » qui
 * voudrait dire deux choses selon le jour du clic serait pire. Le sélecteur
 * doit le DIRE, sinon il a l'air cassé.
 *
 * ── UN DÉPART DANS LE PASSÉ EST REFUSÉ ────────────────────────────────────
 * `isReportable` autoriserait sinon des coches rétroactives sur des jours qu'un
 * plan précédent possédait. La contrainte d'exclusion refuserait de toute façon
 * l'écriture: la seule question est de savoir si l'élève reçoit un motif nommé
 * ou un 23P01 brut.
 */
export function resolveRequestedWindow(
  request: MealWindowRequest,
  today: string,
): { startsOn: string; durationDays: number } {
  if (request.kind === "until_sunday") {
    const at = WEEK_TOKENS.indexOf(dayTokenOf(today));
    return { startsOn: today, durationDays: WEEK_TOKENS.length - at };
  }
  if (request.kind === "days") {
    const count = Math.round(request.count);
    if (!Number.isFinite(count) || count < 1 || count > MAX_WINDOW_DAYS) {
      throw new Error(`[keel/meal_window] bad day count ${request.count}`);
    }
    return { startsOn: today, durationDays: count };
  }
  const days = Math.round(request.durationDays);
  if (!Number.isFinite(days) || days < 1 || days > MAX_WINDOW_DAYS) {
    throw new Error(`[keel/meal_window] bad duration ${request.durationDays}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.startsOn)) {
    throw new Error(`[keel/meal_window] bad start ${request.startsOn}`);
  }
  if (request.startsOn < today) {
    throw new Error(`[keel/meal_window] start in the past: ${request.startsOn}`);
  }
  return { startsOn: request.startsOn, durationDays: days };
}

// ---------------------------------------------------------------------------
// CE QUE `write_student_meal_plan` FAIT D'UN PLAN VIVANT QUI CHEVAUCHE
//
// ⚠️ UNE RÈGLE SQL RECOPIÉE EN TYPESCRIPT, ET LE FIL EST TENDU. Un test relit
// la boucle DANS la migration 20260811140000 et tombe le jour où l'original
// bouge (`household_merge_test.ts`, « LA RÈGLE COPIÉE EST BIEN CELLE DE LA
// MIGRATION »).
//
// ELLE VIT ICI, ET PLUS DANS `household_merge.ts`, DEPUIS C2. Ce n'est pas une
// notion de FUSION: c'est ce que la base fait de deux fenêtres du même compte
// et de la même nature, donc ça appartient au module des fenêtres. Les trois
// portes qui écrivent un plan la lisent maintenant — la fusion (qui l'avait), la
// composition individuelle et la composition de foyer (qui ne l'avaient pas, et
// payaient un appel modèle pour finir sur le même 409).
// ---------------------------------------------------------------------------

/** Ce que la boucle de chevauchement de la RPC décide, pour UNE ligne vivante. */
export type PlanOverlapVerdict =
  /** Les deux fenêtres ne se touchent pas: la RPC ne voit même pas la ligne. */
  | "no_overlap"
  /** ① il commence LE MÊME JOUR ou APRÈS ⇒ `plan_overlaps_existing`. */
  | "starts_at_or_after"
  /** ② il commence AVANT **et finit APRÈS** ⇒ `plan_overlaps_existing`. */
  | "encloses"
  /** ③ il commence avant et finit dedans ⇒ TRONQUÉ, légitimement (D15). */
  | "truncated";

/**
 * LA RÈGLE, POUR UNE SEULE LIGNE. Pure, et c'est la boucle de la migration
 * 20260811140000 lue dans son ordre.
 *
 * Le `&&` de `daterange` de la RPC est la première ligne: une ligne qui ne
 * chevauche pas n'entre jamais dans la boucle, donc elle ne peut rien refuser.
 */
export function planOverlapVerdict(
  existing: { startsOn: string; durationDays: number },
  window: { startsOn: string; durationDays: number },
): PlanOverlapVerdict {
  const endOf = (s: { startsOn: string; durationDays: number }) =>
    addDays(s.startsOn, Math.max(1, s.durationDays));
  if (endOf(existing) <= window.startsOn) return "no_overlap";
  if (endOf(window) <= existing.startsOn) return "no_overlap";
  if (existing.startsOn >= window.startsOn) return "starts_at_or_after";
  if (endOf(existing) > endOf(window)) return "encloses";
  return "truncated";
}

/**
 * Une ligne vivante, telle qu'on la relit pour décider AVANT le modèle.
 *
 * ⛔ DEPUIS LE 2026-09-03, C'EST UN SPAN DE JOURS MANGÉS. La règle de
 * chevauchement (`planOverlapVerdict`) et l'exclusion de la base
 * (`20260903170000`) portent sur `[starts_on + lead_days, starts_on +
 * duration_days)`: la veille du plan N+1 a le DROIT d'être le dernier jour
 * mangé du plan N (on fait les courses dimanche soir pour lundi pendant qu'on
 * dîne encore la semaine d'avant). Un appelant qui lit une ligne de la base
 * passe par `eatenSpan` — jamais `starts_on`/`duration_days` nus.
 */
export interface LivePlanSpan {
  id: string;
  startsOn: string;
  durationDays: number;
  /**
   * LA COLONNE `lead_days` DE LA LIGNE — 0 ou 1, et **jamais optionnelle**.
   *
   * ⛔ C'EST LE TYPE QUI TIENT LE `select`. Un appelant qui oublierait
   * `lead_days` dans sa projection ne compile plus; s'il compilait, il
   * compterait la veille comme un jour mangé et refuserait ici le plan N+1 que
   * la base accepte — un 409 fabriqué par nous, sur un geste légitime.
   */
  leadDays: number;
}

/**
 * LES JOURS MANGÉS D'UNE LIGNE — `starts_on + lead_days`, `duration_days -
 * lead_days`. C'est la SEULE conversion, et les deux lanes l'appellent.
 *
 * ⚠️ `leadDays` est REQUIS, jamais `?`: une ligne relue sans sa colonne
 * `lead_days` compterait sa veille comme un jour mangé, et refuserait le plan
 * N+1 que la base accepte — le défaut que ce lot ferme, réintroduit par un
 * `select` oublié. `null`/`undefined` JETTE.
 */
export function eatenSpan(row: {
  startsOn: string;
  durationDays: number;
  leadDays: number;
}): { startsOn: string; durationDays: number } {
  const lead = row.leadDays;
  if (typeof lead !== "number" || !Number.isInteger(lead) || lead < 0 || lead > MAX_LEAD_DAYS) {
    throw new Error(
      `[keel/meal_window] eatenSpan: leadDays est REQUIS (0..${MAX_LEAD_DAYS}) — ` +
        `reçu ${JSON.stringify(lead)}; un select qui oublie \`lead_days\` compte la veille comme un jour mangé`,
    );
  }
  return {
    startsOn: lead === 0 ? row.startsOn : addDays(row.startsOn, lead),
    durationDays: row.durationDays - lead,
  };
}

/**
 * LA PREMIÈRE LIGNE VIVANTE QUI FERA REFUSER LA BASE — ou `null`.
 *
 * ⚠️ C'EST LE JUMEAU DU P0 DE LA FUSION, SUR LA PORTE `compose` (C2, ③). La
 * fusion produisait une fenêtre strictement INTÉRIEURE au plan du foyer et se
 * payait `409 plan_overlaps_existing` **après** 16,1 s de modèle et 7 335
 * jetons. `resolveMergeWindow` a été réparé; la porte `compose` porte la même
 * famille de défaut et personne ne l'avait touchée — sa fenêtre est
 * PARAMÉTRÉE PAR LE CLIENT (`{kind:"exact"}`, `{kind:"days"}`), donc elle est
 * atteignable.
 *
 * ⚠️ CE N'EST PAS L'AUTORITÉ, C'EST UN REFUS PRÉCOCE. La base tranche, comme
 * toujours; ceci évite de la payer au prix d'une génération. Un appelant qui
 * lirait moins de lignes que la RPC (elle ne filtre QUE sur `user_id`,
 * `plan_kind` et `retired_at`) laisserait juste un cas rare payer le modèle —
 * jamais un plan faux.
 *
 * @param replacesId la ligne que la RPC RETIRE avant sa boucle (`p_replaces`,
 *   sous `intent = 'replace_current'`), ou `null`. REQUIS, jamais optionnel:
 *   l'omettre ferait refuser la composition la plus banale du produit —
 *   « remplace le plan courant » commence toujours le même jour que lui.
 *
 * ⟳ **2026-09-03 (A1) — LES DEUX CÔTÉS SONT DES JOURS MANGÉS.** Chaque ligne
 * vivante est pliée par `eatenSpan` avant d'être comparée, exactement comme le
 * `daterange(starts_on + lead_days, starts_on + duration_days)` de l'exclusion
 * et de la boucle de `write_student_meal_plan` (migration `20260903170000`).
 * `args.window` est déjà un span de jours mangés: les deux lanes appellent
 * cette fonction **avant** `withCookDayBefore`, donc sur la fenêtre saisie.
 */
export function firstBlockingPlan(args: {
  live: readonly LivePlanSpan[];
  window: { startsOn: string; durationDays: number };
  replacesId: string | null;
}): { plan: LivePlanSpan; verdict: "starts_at_or_after" | "encloses" } | null {
  for (const plan of args.live) {
    if (args.replacesId !== null && plan.id === args.replacesId) continue;
    const verdict = planOverlapVerdict(eatenSpan(plan), args.window);
    if (verdict === "starts_at_or_after" || verdict === "encloses") {
      return { plan, verdict };
    }
  }
  return null;
}

/**
 * ⛔ ICI VIVAIENT `lastNameableStart` ET `windowStartsBeyondDayTokens` — RETIRÉES
 * LE 2026-09-06, ET LA MESURE QUI LES A FAIT NAÎTRE SURVIT ICI.
 *
 * ── CE QU'ELLES FAISAIENT ─────────────────────────────────────────────────
 * `lastNameableStart(today)` rendait le DIMANCHE de la semaine en cours, et
 * `windowStartsBeyondDayTokens(startsOn, today)` refusait tout départ au-delà.
 * Les deux fonctions edge rendaient `400 window_beyond_this_week` avant le
 * modèle, et les deux sélecteurs de date de l'écran portaient le même dimanche
 * en `max`.
 *
 * ── LA MESURE, ET ELLE RESTE VRAIE ────────────────────────────────────────
 * HTTP réel, 2026-08-12: `starts_on = 2026-08-26` (un mardi) demandé un
 * mercredi. Le message portait, à trois lignes d'écart:
 *
 *     today is: wed
 *     days to fill, in this order: tue, wed
 *     … Do not start earlier than today
 *
 * Le modèle a refusé EN TOUTES LETTRES — `422 empty_meal`, `lock:
 * disarmed_empty_text` — **après 6,2 s facturées**. Ce n'était pas une
 * désobéissance: les deux phrases se contredisaient, et aucune réponse n'était
 * juste. À sept jours d'écart, c'est pire encore: le premier jeton de la
 * fenêtre est celui d'AUJOURD'HUI, et rien ne les distingue.
 *
 * ── POURQUOI ELLES PARTENT QUAND MÊME ─────────────────────────────────────
 * Le lot du 2026-08-12 avait nommé lui-même l'option qu'il écartait: « Dater
 * les jetons dans le prompt aurait marché aussi […] pour servir une forme de
 * fenêtre que l'écran n'a jamais proposée ». L'écran la propose depuis le
 * 2026-09-06 — décision produit, demandée à l'écran: « n'importe qui peut
 * sélectionner la date de début librement ». La prémisse du refus est tombée,
 * donc c'est l'option écartée qui est livrée: `buildMealPrompt` reçoit
 * `windowStartsOn` et ANCRE la liste des jours sur cette date, plus sur
 * « aujourd'hui ». La contradiction n'est plus interdite, elle est impossible.
 *
 * ⛔ NE PAS LES REMETTRE « PAR SÉCURITÉ ». Une fenêtre qui démarre la semaine
 * prochaine est désormais un geste normal du produit; une garde qui la refuse
 * casserait l'écran, et son message parlerait d'une borne que plus rien
 * n'applique. Ce qui reste refusé est le PASSÉ, et il l'est ailleurs
 * (`resolveRequestedWindow`, `bad_window`).
 */

// ---------------------------------------------------------------------------
// Arithmétique de dates — la même que partout ailleurs dans ce dépôt
// ---------------------------------------------------------------------------

/**
 * PARSÉ À MIDI UTC, JAMAIS À MINUIT. C'est l'invariant que `dates.ts` et
 * `local_date.ts` énoncent tous les deux: à minuit, un fuseau hôte décale le
 * jour de la semaine d'un cran, et c'est exactement la classe de bug qui
 * faisait rendre `[]` à `planSchedule.ts` sur des jetons valides.
 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`[keel/meal_window] "${date}" is not a calendar date`);
  }
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const UTC_DAY_TOKENS: readonly DayToken[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export function dayTokenOf(date: string): DayToken {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`[keel/meal_window] "${date}" is not a calendar date`);
  }
  return UTC_DAY_TOKENS[d.getUTCDay()];
}

// ---------------------------------------------------------------------------
// « JE CUISINE LA VEILLE » — la fenêtre reculée d'un jour
// ---------------------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE « CUISINER LA VEILLE » VEUT DIRE, ET POURQUOI ÇA NE DEMANDE RIEN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un plan « lundi→vendredi, je cuisine dimanche » **EST** un plan
 * « dimanche→vendredi » dont le dimanche ne porte aucun repas. C'est la sortie
 * décrite au §3.3 de la synthèse du 2026-09-01: la fenêtre recule d'un jour, ce
 * jour-là est un jour de CUISINE et rien ne s'y mange.
 *
 * ⟳ **2026-09-03 (chantier-0903/CUISINE, A1, P1) — `asked` N'EST PLUS UNE
 * CASE.** La veille est DÉRIVÉE par `leadDayFor` (`plan_hours.ts`): date de
 * départ, jour local, heure locale, coupure à 18 h. Les deux lanes passent
 * `asked = lead.leadDay !== null`, et `cook_the_day_before` n'est plus lu du
 * corps HTTP. La case `CookDayBeforeField` a été retirée des deux surfaces.
 *
 * ⛔ POURQUOI LE SERVEUR DÉCIDE, ET PAS L'ÉCRAN. L'écran pourrait envoyer
 * `starts_on - 1` lui-même. Il ne le fait pas: la fenêtre serait alors
 * DIFFÉRENTE de celle que la personne a saisie, et le refus `bad_window` (début
 * dans le passé) tomberait sur une date qu'elle n'a jamais choisie, sous un
 * motif qui parle de SA saisie. Et depuis A1 l'écran ne connaît pas l'heure:
 * `local_date.ts` refuse tout repli UTC, et un `new Date().getHours()` côté
 * navigateur est interdit — le serveur tranche, l'explication le dit, et la
 * réponse porte `timing` pour que l'écran le rende.
 *
 * ── LES DEUX REFUS, ET ILS SONT NOMMÉS ────────────────────────────────────
 *   · `in_the_past` — le plan commence AUJOURD'HUI: la veille est hier. Depuis
 *     A1 ce refus n'est plus ATTEIGNABLE en production (`leadDayFor` rend
 *     `null` sur un plan qui commence aujourd'hui), mais la garde reste: elle
 *     protège un appelant qui dériverait autrement.
 *   · `no_room` — sept jours MANGÉS. ⚠️ CE N'EST PLUS LA BASE QUI REFUSE: la
 *     migration `20260903170000` accepte `duration_days = 8` avec
 *     `lead_days = 1` (décision D1.3). Ce qui refuse encore, c'est L'ALPHABET
 *     DES JETONS: un plan nomme ses jours `mon`…`sun`, et une fenêtre de huit
 *     jours donnerait au jour de cuisine le jeton exact du dernier jour mangé
 *     — `windowDates` (un `Record` par jeton) ne saurait plus dater ni la
 *     session du rang 0, ni les plats du dernier jour, et le parseur jetterait
 *     les plats du dernier jour comme s'ils étaient posés sur la veille.
 *     Autoriser 8 ici sans dater les sessions produirait un plan FAUX en
 *     silence. Le refus est donc gardé, nommé, et rendu comme `same_morning`
 *     (« courses et cuisson dès le matin ») avec son motif dans
 *     `plan_rationale`. Ce que ça coûte, écrit pour que personne ne le
 *     redécouvre: un plan de sept jours mangés n'a pas de veille automatique
 *     tant que les sessions sont adressées par jeton et non par date. C'est
 *     consigné ROUGE dans le journal de A1.
 *
 * ⚠️ ON N'AMPUTE JAMAIS LA FIN POUR FAIRE DE LA PLACE. Reculer le début en
 * gardant la durée retirerait un jour de repas que la personne a demandé —
 * c'est-à-dire répondre à « cuisine la veille » par « tu mangeras un jour de
 * moins ».
 *
 * PURE: no I/O, no clock. `today` est PASSÉ, jamais lu ici.
 */
export type CookDayBeforeRefusal = "in_the_past" | "no_room";

export interface CookDayBeforeWindow {
  startsOn: string;
  durationDays: number;
  /**
   * LE JOUR OÙ ON CUISINE ET OÙ RIEN NE SE MANGE. `null` = pas de veille.
   *
   * ⚠️ C'EST UN JETON DE JOUR (`sun`…), pas une date: c'est sous cette forme
   * que la consigne, `emptySlotsIn` et `day_properties` le lisent.
   */
  cookOnlyDay: DayToken | null;
  /** `null` quand rien n'a été demandé OU quand la veille a été accordée. */
  refused: CookDayBeforeRefusal | null;
}

export function withCookDayBefore(
  window: { startsOn: string; durationDays: number },
  input: { asked: boolean; today: string },
): CookDayBeforeWindow {
  if (typeof input?.asked !== "boolean") {
    throw new Error(
      "[keel/meal_window] withCookDayBefore: `asked` est REQUIS et booléen — " +
        "un appelant qui ne pose pas la question passe `false`",
    );
  }
  const untouched = {
    startsOn: window.startsOn,
    durationDays: window.durationDays,
    cookOnlyDay: null,
    refused: null,
  } as const;
  if (!input.asked) return untouched;
  if (window.durationDays + 1 > MAX_WINDOW_DAYS) {
    return { ...untouched, refused: "no_room" };
  }
  const before = addDays(window.startsOn, -1);
  // ⚠️ `<` ET PAS `<=`: la veille a le droit d'être AUJOURD'HUI (le plan
  // commence demain). C'est le cas le plus courant du geste — on compose la
  // veille au soir pour le lendemain — et l'interdire viderait l'option de
  // l'essentiel de son usage.
  if (before < input.today) return { ...untouched, refused: "in_the_past" };
  return {
    startsOn: before,
    durationDays: window.durationDays + 1,
    cookOnlyDay: dayTokenOf(before),
    refused: null,
  };
}

/**
 * L'ÉCRAN PEUT-IL PROPOSER LA VEILLE ? — le miroir, pour griser la case.
 *
 * ⚠️ IL REND LE MÊME VERDICT QUE `withCookDayBefore`, ET C'EST LE POINT: une
 * case cochable qui serait refusée ensuite promettrait un geste que le moteur
 * ne fera pas. Il appelle la fonction du dessus plutôt que de recopier ses deux
 * conditions — c'est la règle que ce dépôt réapprend en boucle.
 */
export function cookDayBeforeAvailable(
  window: { startsOn: string; durationDays: number },
  today: string,
): boolean {
  return withCookDayBefore(window, { asked: true, today }).refused === null;
}

// ---------------------------------------------------------------------------
// LA JOURNÉE DÉJÀ DÉPENSÉE — on garde la FIN, on retire le DÉBUT
// ---------------------------------------------------------------------------

/**
 * POURQUOI CE REFUS EST NOMMÉ PLUTÔT QUE BOOLÉEN.
 *
 * Quatre raisons distinctes empêchent de retirer le premier jour, et trois
 * d'entre elles doivent pouvoir être DITES à la personne ou lues en SQL trois
 * jours plus tard. Un `false` les confondrait toutes avec « la journée n'est
 * pas finie », qui est le cas ordinaire.
 *
 *   · `not_today` ...... la fenêtre ne commence pas aujourd'hui: rien à retirer.
 *   · `cook_day` ....... aujourd'hui est le jour de CUISINE SEULE. Voir le bloc
 *                        ⛔ ci-dessous — c'est le piège de ce lot.
 *   · `slots_remain` ... il reste au moins un moment déclaré à venir. Le cas
 *                        ordinaire, et celui qui doit rester silencieux.
 *   · `single_day` ..... la journée est bien dépensée, mais la fenêtre n'a
 *                        qu'un jour: la retirer la viderait.
 */
export type SpentFirstDayRefusal =
  | "not_today"
  | "cook_day"
  | "slots_remain"
  | "single_day";

export interface WindowWithoutSpentDay {
  startsOn: string;
  durationDays: number;
  /** Le jour RETIRÉ, pour que l'écran puisse le nommer. `null` si rien n'a bougé. */
  dropped: DayToken | null;
  refused: SpentFirstDayRefusal | null;
  /**
   * ⟳ 2026-09-04 · POURQUOI CE JOUR EST TOMBÉ, quand il tombe.
   *
   * ⛔ DEUX CAUSES, DEUX PHRASES, ET ELLES NE SE RÉPARENT PAS PAREIL.
   * `slots_passed` = « la journée est déjà entamée », un fait d'horloge qu'on
   * subit. `shopping_lead` = « il ne restait pas le temps d'acheter avant le
   * prochain repas », et `shopping_cutoff` = « les magasins sont fermés » —
   * deux faits de LOGISTIQUE, et la personne qui a déjà ses courses dans le
   * coffre a raison contre eux. Les fondre rendrait la phrase fausse une fois
   * sur deux, et une phrase fausse est pire qu'un silence.
   *
   * `null` quand rien n'est tombé.
   */
  cause: "slots_passed" | "shopping_lead" | "shopping_cutoff" | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS JOURS DEMANDÉS À 20 H FONT UN PLAN DE DEUX JOURS, ET ON LE DIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, ET CE QU'IL N'EST PAS ──────────────────────────────────────
 * Une fenêtre qui commence aujourd'hui ne compose PAS les moments déjà passés
 * (`slotsPassedToday`). C'est juste: on ne planifie pas un déjeuner à 22 h pour
 * le jour même. Mais la fenêtre, elle, continuait de COMPTER ce jour-là. Une
 * personne qui demandait lundi-mardi-mercredi un lundi à 20 h recevait donc
 * deux journées de repas dans un plan qui s'annonçait de trois, et rien ne le
 * lui disait.
 *
 * ⛔ CE N'EST PAS UN DÉFAUT DE COMPOSITION. Les plats servis ne changent pas
 * d'un gramme: c'était déjà mardi et mercredi qui étaient composés. Ce qui
 * change ici est la COMPTABILITÉ de la fenêtre et la FRANCHISE de l'écran.
 *
 * ── LA RÈGLE, DÉCIDÉE ─────────────────────────────────────────────────────
 * On garde la FIN et on retire le début dépensé. Lundi 20 h + trois jours
 * demandés ⇒ un plan de DEUX jours, mardi et mercredi.
 *
 * ⛔ ON NE VA PAS CHERCHER UN JOUR AU BOUT. La formule « trois demandés =
 * trois nourris » a été explicitement écartée: elle ferait déborder le plan sur
 * un jeudi que personne n'a demandé, et elle heurterait `MAX_WINDOW_DAYS` sur
 * une fenêtre de sept. Le plan assume d'être plus court.
 *
 * ══ ⛔ LE PIÈGE, ET C'EST TOUT L'INTÉRÊT DE LA GARDE `cook_day` ════════════
 *
 * `withCookDayBefore` décale `startsOn` EN ARRIÈRE. Donc quelqu'un qui a
 * demandé la veille de cuisine se retrouve avec `startsOn === today` ET
 * `cookOnlyDay === today` — la condition « la fenêtre commence aujourd'hui »
 * devient vraie, et tous les moments d'aujourd'hui sont « passés » puisque
 * AUJOURD'HUI ON NE MANGE PAS, ON CUISINE.
 *
 * Rétrécir là mangerait très exactement la veille que la personne vient de
 * demander. La garde n'est donc pas une précaution: sans elle, ce lot casse la
 * fonctionnalité livrée la veille.
 *
 * ── CE QUE LA FONCTION NE FAIT PAS ────────────────────────────────────────
 * Elle ne lit ni horloge, ni base, ni rythme. `passedSlots` lui est DONNÉ, et
 * il vient de l'unique lecteur d'heure de la lane (`slotsPassedToday`). Un
 * second calcul de « quels moments sont passés » divergerait du premier, et
 * c'est la forme de défaut que ce dépôt paie en boucle.
 */
export function withoutSpentFirstDay(
  window: { startsOn: string; durationDays: number },
  input: {
    today: string;
    /**
     * ⚠️ `string | null` ET PAS `DayToken | null`, DÉLIBÉRÉMENT. Cette fonction
     * ne fait qu'UNE chose de ce champ: tester s'il est nul. Exiger le type
     * étroit obligerait l'appelant à rétrécir une valeur qu'il porte déjà en
     * `string | null` — et la façon dont on rétrécit sans réfléchir, dans ce
     * dépôt, s'écrit `as never`, ce qui éteint la vérification pour de bon.
     * Une signature ne demande pas une précision qu'elle n'utilise pas.
     */
    cookOnlyDay: string | null;
    declaredSlots: readonly string[];
    passedSlots: readonly string[];
    /**
     * ⟳ 2026-09-04 · LES MOMENTS QU'ON NE PEUT PLUS ACHETER À TEMPS.
     *
     * ⚠️ REQUIS, jamais optionnel. Un défaut à `[]` chez un appelant qui
     * l'oublie rendrait le comportement d'avant le lot **sans qu'aucun test ne
     * rougisse** — c'est la cicatrice « paramètre de garde optionnel = garde
     * désarmée », et elle a déjà coûté `safetyBand` à ce dépôt. `[]` se dit, et
     * ça veut dire « rien n'est retenu ».
     */
    heldSlots: readonly string[];
    /**
     * LA COUPURE DES COURSES EST-ELLE PASSÉE ? REQUIS.
     *
     * ⛔ UN BOOLÉEN, PAS UNE HEURE. La coupure vit dans
     * `plan_hours.ts::SHOPPING_CUTOFF_HOUR` et l'appelant la lit par
     * `cookingAskedToday`. Recopier `hourNow >= 18` ici en ferait une seconde
     * définition, et c'est celle qu'on regarde le moins qui garderait l'ancienne
     * valeur.
     */
    shoppingCutoffReached: boolean;
  },
): WindowWithoutSpentDay {
  const untouched = {
    startsOn: window.startsOn,
    durationDays: window.durationDays,
    dropped: null,
    cause: null,
  } as const;
  if (!Array.isArray(input.heldSlots)) {
    throw new Error(
      "[keel/meal_plan_window] `heldSlots` est REQUIS — `[]` dit « rien de " +
        "retenu », `undefined` ne dit rien",
    );
  }
  if (typeof input.shoppingCutoffReached !== "boolean") {
    throw new Error(
      "[keel/meal_plan_window] `shoppingCutoffReached` est REQUIS et booléen — " +
        "un `?` en ferait une garde désarmée",
    );
  }
  if (window.startsOn !== input.today) {
    return { ...untouched, refused: "not_today" };
  }
  // ⛔ LA GARDE DU PIÈGE, ET ELLE PASSE AVANT LES MOMENTS. Un jour de cuisine
  // seule n'a aucun moment à manger: le tester après ferait tomber ce cas dans
  // `slots_remain` par accident, c'est-à-dire pour la mauvaise raison.
  if (input.cookOnlyDay !== null) {
    return { ...untouched, refused: "cook_day" };
  }
  // ⚠️ FAIL-CLOSED SUR UN RYTHME ILLISIBLE. Aucun moment déclaré ⇒ on ne sait
  // pas dire que la journée est finie, donc on ne retire rien. Le comportement
  // d'avant ce lot, exactement.
  const declared = new Set(input.declaredSlots);
  if (declared.size === 0) return { ...untouched, refused: "slots_remain" };
  // ⟳ 2026-09-04 · LA JOURNÉE EST FINIE SI CHAQUE MOMENT EST **PASSÉ OU
  // INACHETABLE**. Avant ce lot, seul « passé » comptait: à 19 h le dîner
  // restait au plan alors que les magasins ferment à 18 h, et le produit servait
  // un repas qu'il savait impossible à acheter.
  const passed = new Set(input.passedSlots);
  const held = new Set(input.heldSlots);
  for (const slot of declared) {
    if (!passed.has(slot) && !held.has(slot)) {
      return { ...untouched, refused: "slots_remain" };
    }
  }
  // ⛔ LA CAUSE SE LIT SUR CE QUI RESTE, PAS SUR CE QUI A MORDU EN PREMIER.
  // Si tous les moments déclarés sont derrière nous, c'est l'HORLOGE — même si
  // la coupure des courses est aussi passée. Un lecteur à qui on dit « il
  // fallait le temps de faire les courses » pour une journée finie à 22 h
  // chercherait un magasin ouvert.
  const cause: WindowWithoutSpentDay["cause"] =
    declared.size > 0 && [...declared].every((slot) => passed.has(slot))
      ? "slots_passed"
      : input.shoppingCutoffReached
      ? "shopping_cutoff"
      : "shopping_lead";
  // ⛔ UNE FENÊTRE D'UN JOUR NE SE RÉTRÉCIT PAS: elle deviendrait vide. Générer
  // zéro jour est pire que générer un plan court — on sert la fenêtre demandée
  // et le motif dit pourquoi elle est déjà entamée.
  if (window.durationDays <= 1) {
    return { ...untouched, refused: "single_day" };
  }
  return {
    startsOn: addDays(window.startsOn, 1),
    durationDays: window.durationDays - 1,
    dropped: dayTokenOf(window.startsOn),
    refused: null,
    cause,
  };
}

// ---------------------------------------------------------------------------
// LE TIMING QUI SORT — ce que la réponse, `generated_from` et l'écran lisent
// ---------------------------------------------------------------------------

/**
 * POURQUOI CE TIMING. Les cinq motifs de `leadDayFor`, plus les deux refus de
 * `withCookDayBefore` — parce qu'une veille dérivée peut encore être refusée
 * par la fenêtre (`no_room`, sept jours mangés).
 */
export type PlanTimingReason =
  | "day_before"
  | "before_cutoff_today"
  | "after_cutoff"
  | "starts_today"
  // La journée est déjà entamée et le plan commence demain — voir
  // `withoutSpentFirstDay`. C'est le SEUL motif de ce fichier qui parle d'un
  // jour RETIRÉ plutôt que d'un jour ajouté.
  | "today_already_spent"
  | "clock_unreadable"
  | CookDayBeforeRefusal;

/**
 * CE QUE LA RÉPONSE PORTE (`timing`), CE QUE LA LIGNE GARDE
 * (`generated_from.timing`), CE QUE L'ÉCRAN REND — une seule forme.
 *
 *   · `day_before`   + `lead_day` = la date de la veille (rang 0 de la fenêtre);
 *   · `same_morning` + `lead_day: null` — « courses et cuisson dès le matin ».
 *   · `starts_tomorrow` + `lead_day: null` — la journée d'aujourd'hui était
 *     déjà dépensée, elle a été RETIRÉE de la fenêtre. ⚠️ Ce cas n'ajoute pas
 *     un jour au bout: le plan est plus COURT que ce qui a été demandé, et
 *     c'est très exactement ce que l'écran doit dire.
 *
 * ⚠️ `snake_case`: c'est un objet de RÉPONSE et de colonne, pas un type interne.
 */
export interface PlanTiming {
  kind: "day_before" | "same_morning" | "starts_tomorrow";
  reason: PlanTimingReason;
  lead_day: string | null;
}

/**
 * LE TIMING, ASSEMBLÉ DEPUIS LES DEUX VERDICTS — et à UN seul endroit.
 *
 * `leadDayFor` dit si la veille est possible par le CALENDRIER et l'HEURE;
 * `withCookDayBefore` dit si la FENÊTRE la prend. Les deux lanes appellent
 * celle-ci après les deux autres; recopier la combinaison dans chacune ferait
 * deux définitions de « dès le matin ».
 *
 * ⛔ SI LA FENÊTRE A REFUSÉ, LE MOTIF EST CELUI DU REFUS, pas celui de
 * `leadDayFor`: « le plan commence dans deux jours » ne dirait pas pourquoi il
 * n'a pas de veille quand c'est `no_room` qui a tranché.
 */
export function planTimingOf(
  lead: { leadDay: string | null; reason: PlanTimingReason },
  cookAhead: {
    cookOnlyDay: DayToken | null;
    startsOn: string;
    refused: CookDayBeforeRefusal | null;
  },
  /**
   * ⛔ REQUIS, ET PAS OPTIONNEL. Un paramètre de garde optionnel est une garde
   * désarmée: l'appelant qui l'oublie obtient silencieusement l'ancien texte
   * (« dès le matin ») sur un plan qui commence DEMAIN. Ce dépôt a déjà payé
   * cette forme-là — `safetyBand` jamais passé — et la règle qui en est sortie
   * est qu'une garde se rend obligatoire par le compilateur.
   */
  spent: { dropped: DayToken | null },
): PlanTiming {
  if (cookAhead.cookOnlyDay !== null) {
    return { kind: "day_before", reason: lead.reason, lead_day: cookAhead.startsOn };
  }
  // ⚠️ APRÈS LA VEILLE, ET LES DEUX NE SE CROISENT JAMAIS. `withoutSpentFirstDay`
  // refuse `cook_day` quand une veille existe: si `dropped` est renseigné, c'est
  // qu'il n'y avait pas de veille. L'ordre est donc une ceinture, pas un choix.
  if (spent.dropped !== null) {
    return { kind: "starts_tomorrow", reason: "today_already_spent", lead_day: null };
  }
  return {
    kind: "same_morning",
    reason: cookAhead.refused ?? lead.reason,
    lead_day: null,
  };
}
