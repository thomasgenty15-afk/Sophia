/**
 * ⟳ 2026-09-15 · LOT B — LA PHRASE D'UN STADE DE COMPOSITION, POUR TROIS ÉCRANS.
 *
 * Le serveur écrit `stage` dans la ligne `student_meal_drafts` à chaque
 * frontière ; le navigateur la relit toutes les 2 s (`waitForDraft`) et reçoit
 * `{stage, elapsedMs}`. Trois écrans attendent une composition (l'entonnoir,
 * la page du plan, le composeur) : une seule phrase, un seul format de durée.
 *
 * `null` quand il n'y a rien de vrai à dire — pas de stade encore écrit — et
 * l'écran garde alors SA phrase d'attente. On ne fabrique jamais un stade.
 */
import type { DraftProgress } from "../api/planDraft";
import { t } from "../i18n/t";

/** `m:ss` — assez pour six minutes, lisible d'un coup d'œil. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function draftProgressLabel(progress: DraftProgress | null): string | null {
  if (!progress) return null;
  // ⟳ LOT C — la relance se dit même avant que la fille ait écrit un stade :
  // « relancée » est la seule chose vraie que l'écran ait alors à dire.
  const relaunched = progress.attempt >= 2 ? t("plan.progress.relaunched") : null;
  if (!progress.stage) return relaunched;
  const stage = t(`plan.progress.${progress.stage}` as "plan.progress.composing");
  const elapsed = t("plan.progress.elapsed", { time: formatElapsed(progress.elapsedMs) });
  return relaunched ? `${relaunched} ${stage} · ${elapsed}` : `${stage} · ${elapsed}`;
}
