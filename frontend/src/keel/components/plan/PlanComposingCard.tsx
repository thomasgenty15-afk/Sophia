import React from "react";
import { Loader2 } from "lucide-react";
import { DRAFT_STAGES, type DraftProgress, type DraftStage } from "../../api/planDraft";
import { t } from "../../i18n/t";
import { formatElapsed } from "../../lib/draftProgressLabel";
import { Card } from "../ui/Card";

/**
 * CE QUE LA RANGÉE ACCORDE À CHAQUE PASTILLE, À DÉFAUT DE LE MESURER.
 *
 * Quatre stades × 40 s = 2 min 40, soit le milieu de ce qui a été mesuré
 * (1 min 52 à 3 min 34). La dernière reste allumée au-delà: on n'invente pas
 * une cinquième étape, et on ne reboucle pas sur la première.
 */
const COMPOSING_STEP_MS = 40_000;

/**
 * ⟳ 2026-09-21 — L'ÉCRAN D'ATTENTE D'UNE COMPOSITION, À LA PLACE DU PLAN.
 *
 * ── CE QU'IL REMPLACE, ET POURQUOI ────────────────────────────────────────
 * Une carte en pointillés qui répétait la phrase du bouton (« Le modèle
 * compose les repas… · 0:55 écoulées »), deux fois à l'écran, sans dire
 * combien de temps ça prend ni où on en est. Mesuré sur six runs réels du
 * 2026-09-21 : 173 à 208 s par plan, et deux runs sur huit expirés. Une
 * attente de trois minutes sans repère se lit comme une panne.
 *
 * ── CE QU'IL DIT, ET RIEN D'INVENTÉ ───────────────────────────────────────
 *   · le stade RÉEL, lu dans la ligne (`stage`) — les quatre stades du worker,
 *     dans l'ordre où il les écrit ; on n'en fabrique pas un ;
 *   · le temps écoulé depuis l'ouverture de la ligne, pas depuis le clic ;
 *   · l'ordre de grandeur (« 2 à 3 minutes en moyenne ») — une phrase de copie,
 *     mesurée, pas une barre de progression qui promettrait une fin ;
 *   · pour un remplacement, que le plan en place le reste jusqu'à l'adoption.
 *
 * Le squelette en dessous est décoratif (`aria-hidden`) : il dit « un plan va
 * apparaître ici », et il ne compte aucun jour ni aucun repas.
 */
export function PlanComposingCard({
  progress,
  replacing,
}: {
  progress: DraftProgress | null;
  /** Vrai quand un plan est affiché et reste en place pendant la composition. */
  replacing: boolean;
}) {
  const stage: DraftStage | null = progress?.stage ?? null;
  const real = stage === null ? -1 : DRAFT_STAGES.indexOf(stage);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-22 — LA RANGÉE AVANCE À LA MONTRE, ET C'EST UNE DÉCISION.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── CE QUI A ÉTÉ MESURÉ, ET QUI A POSÉ LA QUESTION ────────────────────
   * Sur les cinq dernières compositions réussies, le passage au stade
   * `writing` arrive entre 1 min 52 et 3 min 34 — et la ligne se termine
   * DEUX À QUATRE CENTIÈMES DE SECONDE plus tard. Autrement dit: `composing`
   * prend tout le temps, et `checking` / `repairing` / `writing` s'allument
   * ensemble, à la dernière seconde. La rangée restait donc figée sur
   * « Composer » pendant trois minutes, ce qui se lit comme une panne.
   *
   * ── LA DÉCISION, PRISE EN CONNAISSANCE DE CAUSE ───────────────────────
   * « Tu gardes les pastilles, tu les fais avancer toutes les 40 secondes,
   * c'est tout, osef si c'est la vérité. » Cette rangée n'est donc plus un
   * relevé: c'est une ESTIMATION, et le commentaire d'en-tête de ce fichier
   * (« le stade RÉEL, on n'en fabrique pas un ») ne vaut plus pour elle.
   *
   * ⛔ LE STADE RÉEL GAGNE TOUJOURS, ET C'EST CE QUI REND ÇA TENABLE. On
   * prend le MAXIMUM des deux: une composition rapide fait sauter la rangée
   * en avant, et jamais en arrière. Prendre la montre seule aurait montré
   * « Composer » sur un worker déjà en train de ranger.
   *
   * ⛔ ET ELLE S'ARRÊTE AU DERNIER STADE. Elle ne boucle pas, et elle ne
   * franchit rien: « Ranger » reste actif jusqu'à ce que la carte disparaisse
   * — c'est la fin réelle qui la démonte, pas la minuterie.
   */
  const [ticked, setTicked] = React.useState(0);
  React.useEffect(() => {
    if (ticked >= DRAFT_STAGES.length - 1) return;
    const id = globalThis.setTimeout(
      () => setTicked((n) => n + 1),
      COMPOSING_STEP_MS,
    );
    return () => globalThis.clearTimeout(id);
  }, [ticked]);
  /**
   * ⟳ 2026-09-23 — UNE ATTENTE REPRISE NE REPART PAS DE « COMPOSER ». La carte
   * se remonte quand on revient sur la page : sa montre repartait de zéro sous
   * un temps écoulé de 2:00. Elle rattrape le temps passé depuis l'ouverture de
   * la ligne (`elapsedMs`), puis reprend son pas.
   */
  const elapsedSteps = Math.min(
    DRAFT_STAGES.length - 1,
    Math.floor((progress?.elapsedMs ?? 0) / COMPOSING_STEP_MS),
  );
  React.useEffect(() => {
    if (elapsedSteps > ticked) setTicked(elapsedSteps);
  }, [elapsedSteps, ticked]);

  const current = Math.max(real, ticked);
  /**
   * ⚠️ LA PHRASE SUIT LA PASTILLE, PAS LE STADE. Les laisser diverger
   * afficherait « Vérifier » allumé au-dessus de « Le modèle compose les
   * repas… » — deux affirmations contradictoires à trois lignes d'écart, et
   * c'est celle qu'on croit qui décide de la confiance.
   */
  const shown = DRAFT_STAGES[current] ?? null;
  const live = shown === null
    ? t("plan.composing.waiting")
    : t(`plan.progress.${shown}` as "plan.progress.composing");
  const relaunched = (progress?.attempt ?? 1) >= 2;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-ink-soft" />
          <h3 className="text-base font-semibold text-ink">{t("plan.composing.title")}</h3>
        </div>
        {progress
          ? (
            <span className="text-sm tabular-nums text-ink-soft">
              {t("plan.progress.elapsed", { time: formatElapsed(progress.elapsedMs) })}
            </span>
          )
          : null}
      </div>
      {/* ⚠️ `aria-live`: le bouton qui a lancé le geste est désactivé, donc son
          libellé n'est plus annoncé. Sans région vivante, un lecteur d'écran
          n'apprendrait jamais que ça avance. */}
      <p className="mt-2 text-sm leading-6 text-ink" aria-live="polite">
        {relaunched ? `${t("plan.progress.relaunched")} ` : ""}
        {live}
      </p>
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label={t("plan.composing.steps")}>
        {DRAFT_STAGES.map((s, i) => {
          const done = current > i;
          const active = current === i;
          return (
            <li
              key={s}
              className={`flex items-center gap-1.5 text-xs ${
                active ? "font-medium text-ink" : "text-ink-soft"
              }`}
              aria-current={active ? "step" : undefined}
            >
              <span
                aria-hidden
                className={`inline-block h-2 w-2 rounded-full ${
                  active ? "bg-ink" : done ? "bg-ink/40" : "bg-line-strong"
                }`}
              />
              {t(`plan.composing.step_${s}` as "plan.composing.step_composing")}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs leading-5 text-ink-soft">
        {t("plan.composing.eta")}
        {replacing ? ` ${t("plan.composing.keeps_current")}` : ""}
      </p>
      <div className="mt-4 space-y-3 animate-pulse" aria-hidden>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <div className="h-3 w-14 shrink-0 rounded bg-line" />
            <div className="h-8 flex-1 rounded-card bg-line" />
            <div className="hidden h-8 flex-1 rounded-card bg-line sm:block" />
            <div className="hidden h-8 flex-1 rounded-card bg-line md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}
