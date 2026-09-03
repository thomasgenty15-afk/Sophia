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
 * LE DERNIER JOUR QUE LES JETONS SAVENT NOMMER DEPUIS AUJOURD'HUI — le dimanche
 * de la semaine en cours.
 *
 * ⚠️ CE N'EST PAS UNE PRÉFÉRENCE D'ÉCRAN, C'EST L'ARITHMÉTIQUE DES SEPT JETONS.
 * Un plan ne porte pas de dates dans le message envoyé au modèle: il porte
 * `mon`…`sun`, et le message dit à côté « today is: wed ». Au-delà du dimanche,
 * le jeton d'une date est DÉJÀ pris par une date plus proche — `today + 7`
 * porte le jeton d'aujourd'hui — et la consigne devient illisible.
 */
export function lastNameableStart(today: string): string {
  const at = WEEK_TOKENS.indexOf(dayTokenOf(today));
  return addDays(today, WEEK_TOKENS.length - 1 - at);
}

/**
 * CETTE FENÊTRE COMMENCE-T-ELLE APRÈS CE QUE LES JETONS SAVENT NOMMER ?
 *
 * ── LE DÉFAUT, MESURÉ EN HTTP RÉEL LE 2026-08-12 ───────────────────────────
 *
 * `starts_on = 2026-08-26` (un mardi) demandé un mercredi. Le message envoyé au
 * modèle portait, à trois lignes d'écart:
 *
 *     today is: wed
 *     days to fill, in this order: tue, wed
 *     … Do not start earlier than today
 *
 * Le modèle a REFUSÉ en toutes lettres — `422 empty_meal`, `lock:
 * disarmed_empty_text`, **après 6,2 s facturées**. Ce n'est pas une
 * désobéissance: les deux phrases se contredisent, et il n'y avait pas de
 * réponse juste.
 *
 * ── POURQUOI LE DIMANCHE, ET PAS « SEPT JOURS » ────────────────────────────
 *
 * Les deux moitiés du défaut se referment sur la même borne, et c'est ce qui la
 * rend simple:
 *
 *   · un départ APRÈS le dimanche fait forcément revenir un jeton en arrière
 *     (`mon` après `wed`) ou le RÉUTILISE (`today + 7`);
 *   · un départ AVANT ou LE dimanche donne des jetons strictement croissants
 *     depuis celui d'aujourd'hui, donc une liste que « do not start earlier
 *     than today » n'a aucune raison de contredire.
 *
 * `today + 6` aurait laissé passer le cas le plus banal du produit — « je
 * prépare lundi prochain », demandé un mardi — qui est exactement la forme
 * mesurée.
 *
 * ── CE QUE ÇA NE FERME PAS, ET C'EST ÉCRIT ─────────────────────────────────
 *
 * La QUEUE d'une fenêtre peut toujours dépasser le dimanche: un plan de sept
 * jours démarré un vendredi va jusqu'à jeudi, et ses jetons restent distincts.
 * On ne l'a jamais mesuré comme contradictoire — la liste commence bien
 * aujourd'hui — et le refuser retirerait une fenêtre que l'écran propose depuis
 * toujours (`{kind:"days", count:7}`).
 *
 * ⚠️ PURE, ET SANS HORLOGE: `today` est le jour LOCAL de l'élève, résolu par
 * l'appelant. Même invariant que tout ce fichier.
 */
export function windowStartsBeyondDayTokens(
  startsOn: string,
  today: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return false;
  }
  return startsOn > lastNameableStart(today);
}

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
  | "clock_unreadable"
  | CookDayBeforeRefusal;

/**
 * CE QUE LA RÉPONSE PORTE (`timing`), CE QUE LA LIGNE GARDE
 * (`generated_from.timing`), CE QUE L'ÉCRAN REND — une seule forme.
 *
 *   · `day_before`   + `lead_day` = la date de la veille (rang 0 de la fenêtre);
 *   · `same_morning` + `lead_day: null` — « courses et cuisson dès le matin ».
 *
 * ⚠️ `snake_case`: c'est un objet de RÉPONSE et de colonne, pas un type interne.
 */
export interface PlanTiming {
  kind: "day_before" | "same_morning";
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
): PlanTiming {
  if (cookAhead.cookOnlyDay !== null) {
    return { kind: "day_before", reason: lead.reason, lead_day: cookAhead.startsOn };
  }
  return {
    kind: "same_morning",
    reason: cookAhead.refused ?? lead.reason,
    lead_day: null,
  };
}
