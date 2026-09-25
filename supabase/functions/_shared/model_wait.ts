/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE TEMPS PASSÉ À ATTENDRE LE MODÈLE, PAR REQUÊTE — 2026-09-25
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Une fonction edge a 2 s de CALCUL par requête (limite de Supabase, la même
 * sur toutes les formules) ; l'attente d'un appel réseau n'y compte pas. Une
 * composition dure 4 à 5 minutes, dont presque tout est de l'attente du
 * modèle : pour savoir combien elle CALCULE, il faut retirer cette attente du
 * temps écoulé. Mesuré le 2026-09-25 : ~1,0 à 1,2 s de travail sur une
 * composition ordinaire, 3,2 s sur celle que le serveur a tuée.
 *
 * `generateWithGemini` (le seul point d'entrée des appels au modèle) ouvre et
 * ferme une attente sous l'identifiant de la requête. Des appels qui se
 * chevauchent (le classement de la note en parallèle de la composition) ne
 * comptent qu'une fois : on compte le temps où AU MOINS un appel est en vol.
 *
 * ⚠️ Ce qui reste (« travail ») comprend les lectures et écritures en base :
 * c'est un majorant du calcul, pas le calcul exact. C'est la bonne direction
 * pour une alarme.
 */

interface Wait {
  depth: number;
  since: number;
  totalMs: number;
}

const waits = new Map<string, Wait>();

function now(): number {
  return performance.now();
}

/** Un appel au modèle commence pour cette requête. */
export function beginModelWait(requestId: string | null | undefined): void {
  const id = String(requestId ?? "").trim();
  if (!id) return;
  const w = waits.get(id) ?? { depth: 0, since: 0, totalMs: 0 };
  if (w.depth === 0) w.since = now();
  w.depth++;
  waits.set(id, w);
}

/** Un appel au modèle finit (réponse, erreur ou délai). */
export function endModelWait(requestId: string | null | undefined): void {
  const id = String(requestId ?? "").trim();
  if (!id) return;
  const w = waits.get(id);
  if (!w || w.depth === 0) return;
  w.depth--;
  if (w.depth === 0) w.totalMs += now() - w.since;
}

/** L'attente cumulée de cette requête, appel en cours compris. */
export function modelWaitMs(requestId: string | null | undefined): number {
  const id = String(requestId ?? "").trim();
  const w = id ? waits.get(id) : undefined;
  if (!w) return 0;
  return w.totalMs + (w.depth > 0 ? now() - w.since : 0);
}

/** Oublie la requête — à la fin de la composition. */
export function forgetModelWait(requestId: string | null | undefined): void {
  const id = String(requestId ?? "").trim();
  if (id) waits.delete(id);
}

// ═══════════════════════════════════════════════════════════════════════════
// LE TRAVAIL PAR ÉTAPE — le temps écoulé moins l'attente du modèle, découpé aux
// marqueurs d'étape du brouillon (`composing`, `checking`, `repairing`,
// `writing`). L'étape « prep » va du début de la requête au premier marqueur ;
// « end » va du dernier marqueur à la fin.
// ═══════════════════════════════════════════════════════════════════════════

interface WorkClock {
  t0: number;
  marks: { stage: string; at: number; wait: number }[];
}

const clocks = new Map<string, WorkClock>();

/** Démarre l'horloge de travail de cette requête (au début du handler). */
export function startWorkClock(requestId: string | null | undefined, t0: number): void {
  const id = String(requestId ?? "").trim();
  if (id) clocks.set(id, { t0, marks: [] });
}

/** Note le début d'une étape. */
export function markWorkPhase(requestId: string | null | undefined, stage: string): void {
  const id = String(requestId ?? "").trim();
  const c = id ? clocks.get(id) : undefined;
  if (!c) return;
  c.marks.push({ stage, at: now(), wait: modelWaitMs(id) });
}

export interface WorkTimeReport {
  readonly total_ms: number;
  readonly model_wait_ms: number;
  /** Écoulé moins attente du modèle — base de données comprise. */
  readonly work_ms: number;
  readonly phases: readonly { readonly stage: string; readonly work_ms: number }[];
}

/** Le bilan de la requête, puis l'oubli de ses deux compteurs. */
export function takeWorkTimeReport(requestId: string | null | undefined): WorkTimeReport | null {
  const id = String(requestId ?? "").trim();
  const c = id ? clocks.get(id) : undefined;
  if (!c) return null;
  const end = { stage: "end", at: now(), wait: modelWaitMs(id) };
  const points = [{ stage: "prep", at: c.t0, wait: 0 }, ...c.marks, end];
  const phases: { stage: string; work_ms: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    phases.push({
      stage: a.stage,
      work_ms: Math.max(0, Math.round((b.at - a.at) - (b.wait - a.wait))),
    });
  }
  const total = end.at - c.t0;
  clocks.delete(id);
  forgetModelWait(id);
  return {
    total_ms: Math.round(total),
    model_wait_ms: Math.round(end.wait),
    work_ms: Math.max(0, Math.round(total - end.wait)),
    phases,
  };
}

/**
 * ⟳ 2026-09-25 — LE TRAVAIL DÉJÀ DÉPENSÉ, SANS CLORE LE BILAN.
 *
 * `takeWorkTimeReport` n'est lu qu'en FIN de requête : un worker tué par la
 * limite CPU ne laissait donc aucun chiffre (plan C du banc des trois foyers,
 * deux morts, zéro ligne `work_time`). Cette lecture sert aux marques
 * journalisées pendant la composition (`keel.household_meal.work_mark`) : le
 * dernier chiffre écrit est celui qu'on retrouve après une mort.
 */
export function peekWorkMs(requestId: string | null | undefined): number | null {
  const id = String(requestId ?? "").trim();
  const c = id ? clocks.get(id) : undefined;
  if (!c) return null;
  return Math.max(0, Math.round((now() - c.t0) - modelWaitMs(id)));
}
