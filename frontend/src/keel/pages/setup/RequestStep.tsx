// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// L'étape 4: la demande de ce plan-là.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import type { AwayMark } from "../../lib/presenceMarks";
import React from "react";
import { Card, SectionLabel } from "../../components/ui/Card";
import type { FunnelMissId, FunnelMouth, FunnelPlanAnswers } from "../../api/onboarding";
import type { PracticalConstraints } from "../../api/practicalConstraints";
import {
  assessBudget,
  type BudgetDayRates,
  budgetMouthsFor,
  budgetScaleFor,
} from "../../api/planBudget";
import type { EatingOccasionSlot } from "../../api/mealGeneration";
import {
  type CookingSessionCount,
  readSessionTimeBound,
} from "../../api/cookingPlan";
import PlanRequestFields, { type PresenceRow } from "../../components/PlanRequestFields";
import { t } from "../../i18n/t";
import { MissingCard } from "./MissCards.tsx";

/**
 * ÉTAPE 4 — LA DEMANDE DE CE PLAN-LÀ.
 *
 * ── LA COUPURE DU 2026-08-13, ET CE QU'ELLE SÉPARE ────────────────────────
 * Cette carte portait AUSSI les moments où on mange. Deux natures de question
 * dans le même cadre: « à quels moments cette maison mange » ne change pas
 * d'une semaine sur l'autre, « quels jours je peux cuisiner CETTE semaine,
 * combien de temps j'ai, combien je veux dépenser » change à chaque fois.
 *
 * Les mélanger avait un coût mesuré: on lisait un bouton gris et une liste de
 * ce qui manque, sans faire le lien avec des rangées vides plus haut dans la
 * même carte. Et surtout, ça rangeait des entrées de PLAN dans les réglages
 * d'une PERSONNE — d'où « À propos de toi » qui décidait des jours de cuisine
 * de toutes les semaines à venir.
 *
 * Ce qui est ici est donc, et seulement, ce qu'on redemande à chaque
 * composition. La plateforme pose les mêmes trois questions au même moment
 * (`MealBuilder`, la carte de composition du foyer).
 */
export function RequestStep({
  draft,
  onChange,
  missing,
  windowStart,
  windowEnd,
  onWindowStart,
  onWindowEnd,
  mouths,
  planWindow,
  budgetMarket,
  budgetRates,
  selfMemberId,
  selfName,
  rhythm,
  selfAway,
  onSelfAwaySave,
  onMouthAwaySave,
  practicalConstraints,
  hasGoal,
  onEquipmentSaved,
  cookingSessions,
  onCookingSessions,
  showCookingMisses,
  envy,
  onEnvy,
  askEnvy,
}: {
  draft: FunnelPlanAnswers;
  onChange: React.Dispatch<React.SetStateAction<FunnelPlanAnswers | null>>;
  missing: readonly FunnelMissId[];
  windowStart: string;
  windowEnd: string;
  onWindowStart: (value: string) => void;
  onWindowEnd: (value: string) => void;
  mouths: readonly FunnelMouth[];
  planWindow: {
    startsOn: string;
    durationDays: number;
    tokens: readonly string[];
    dates: readonly string[];
  };
  /** `null` hors de France et des États-Unis: pas de grille, donc pas de plancher. */
  budgetMarket: "fr" | "us" | null;
  /** ⟳ 2026-09-25 — le coût par jour de chaque bouche (`loadBudgetDayRates`). */
  budgetRates: ReadonlyMap<string, BudgetDayRates>;
  /** Le titulaire, DANS le roster — la ligne à laquelle `selfAway` appartient. */
  selfMemberId: string | null;
  /** Le nom de la ligne du titulaire quand le roster ne le porte pas encore. */
  selfName: string;
  rhythm: readonly EatingOccasionSlot[];
  /**
   * ── CE QUE LE TITULAIRE DIT DE SA SEMAINE ─────────────────────────────────
   *
   * ⛔ CE N'EST PAS `mouths[0].away`, ET LES DEUX NE SE REMPLACENT PAS. Ce qui
   * arrive ici est `practical_constraints.away_days` — la source que la
   * personne déclare pour ELLE-MÊME, celle que `/app/plan` écrit aussi. La
   * liste des bouches, elle, porte la colonne du FOYER. D14 tient les deux
   * séparées; les confondre ferait recopier la déclaration de quelqu'un dans la
   * colonne du maître, où elle survivrait à sa rétractation.
   *
   * ⚠️ REQUIS, jamais `?` — « paramètre de garde optionnel = garde désarmée ».
   */
  selfAway: readonly AwayMark[];
  /** Écrit la déclaration du titulaire. Rejette en cas d'échec. */
  onSelfAwaySave: (next: AwayMark[]) => Promise<void>;
  /** Écrit la marque du maître pour une autre bouche. Rejette en cas d'échec. */
  onMouthAwaySave: (mouth: FunnelMouth, next: AwayMark[]) => Promise<void>;
  /** La photo de la colonne; `null` = pas encore lue (porte de la carte d'équipement). */
  practicalConstraints: PracticalConstraints | null;
  hasGoal: boolean;
  onEquipmentSaved: () => void | Promise<void>;
  /**
   * ⟳ 2026-09-25 — « COMBIEN DE FOIS TU VEUX CUISINER » — requis, et pas dans
   * `draft`: il ne s'écrit nulle part, il part avec la demande. Il remplace
   * « tout cuisiner en une seule fois ».
   */
  cookingSessions: CookingSessionCount | null;
  onCookingSessions: (next: CookingSessionCount | null) => void;
  /** Le bouton de fin a été refusé sur les réponses de cuisine. */
  showCookingMisses: boolean;
  /** L'ENVIE DE LA MAISON POUR CETTE SEMAINE-CI. Requise, jamais optionnelle. */
  envy: string;
  onEnvy: (value: string) => void;
  askEnvy: boolean;
}) {
  /**
   * ⛔ LE PLANCHER DU BUDGET — LA MÊME LECTURE QUE `/app/plan`, AU MODULE PRÈS.
   *
   * Il se recalcule avec ses entrées, qui sont toutes à l'écran au-dessus du
   * champ: la fenêtre, les bouches et leurs absences.
   *
   * ⚠️ CE QUI EST RENDU ICI NE RETIENT RIEN. Le refus qui BLOQUE est posé au
   * bout du parcours, juste avant `composeDraft`, sur des faits RELUS.
   */
  const budgetMouths = React.useMemo(() =>
    budgetMouthsFor({
      dayTokens: planWindow.tokens,
      houseSlots: rhythm,
      mouths: mouths.map((m) => ({
        memberId: m.memberId,
        diet: m.diet,
        eatingSlots: m.eatingSlots,
        away: m.away,
      })),
      selfMemberId,
      selfAway,
      rates: budgetRates,
    }), [planWindow.tokens, rhythm, mouths, selfMemberId, selfAway, budgetRates]);
  const budgetVerdict = React.useMemo(() =>
    assessBudget({
      amount: draft.budgetAmount,
      market: budgetMarket,
      mouths: budgetMouths,
    }), [draft.budgetAmount, budgetMarket, budgetMouths]);
  // ⟳ 2026-09-25 — LE CURSEUR, SUR LES MÊMES BOUCHES QUE LE PLANCHER.
  const budgetScale = React.useMemo(
    () => budgetScaleFor({ market: budgetMarket, mouths: budgetMouths }),
    [budgetMarket, budgetMouths],
  );

  /**
   * « QUI MANGE À LA MAISON » — une ligne par personne, titulaire en tête.
   *
   * ⚠️ `memberId !== null` D'ABORD pour reconnaître le titulaire: une bouche
   * pas encore inscrite porte un `null`, et `null === null` ferait d'elle le
   * titulaire — deux grilles écrivant la même colonne.
   *
   * ⚠️ LE TITULAIRE A TOUJOURS SA LIGNE, même quand le roster ne le porte pas
   * (compte solo sans ligne membre, ou foyer pas encore lu): c'est sa colonne à
   * lui (`practical_constraints.away_days`), qui existe sans foyer.
   *
   * ⚠️ PAS DE LIGNE SANS MOMENTS DÉCLARÉS: la grille serait vide.
   */
  const presence = React.useMemo<PresenceRow[]>(() => {
    if (rhythm.length === 0) return [];
    const selfRow = (name: string): PresenceRow => ({
      key: "self",
      name,
      slots: rhythm,
      away: selfAway,
      save: onSelfAwaySave,
    });
    const rows = mouths.map((m): PresenceRow => {
      const name = m.firstName.trim() || t("household.mouth.who_fallback");
      if (m.memberId !== null && m.memberId === selfMemberId) return selfRow(name);
      return {
        key: m.memberId ?? name,
        name,
        slots: m.eatingSlots ?? rhythm,
        away: m.away,
        save: (next) => onMouthAwaySave(m, next),
      };
    });
    const hasSelf = mouths.some((m) =>
      m.memberId !== null && m.memberId === selfMemberId
    );
    return hasSelf ? rows : [selfRow(selfName), ...rows];
  }, [rhythm, selfAway, onSelfAwaySave, mouths, selfMemberId, onMouthAwaySave, selfName]);

  return (
    <>
      <Card>
        <SectionLabel>{t("setup.request.title")}</SectionLabel>
        {/* ══════════════════════════════════════════════════════════════════
            ⟳ 2026-09-23 — LES CHAMPS SONT CEUX DE `/app/plan`, AU COMPOSANT
            PRÈS (`PlanRequestFields`).
            ══════════════════════════════════════════════════════════════════

            Demandé: « dans l'onboarding et dans le plan de la semaine, ce sont
            censé être les mêmes interfaces ». Les deux écrans portaient chacun
            leur copie; celle-ci avait des pastilles par personne là où
            `/app/plan` a une ligne par personne avec son état — la version
            retenue. « Avec quoi tu cuisines », qui vivait en carte à part
            au-dessus de cette étape, est maintenant replié DANS ce formulaire,
            comme sur `/app/plan`. Les jours tradition restent dans la fiche du
            foyer. */}
        <div className="mt-4 space-y-4">
          <PlanRequestFields
            idPrefix="setup"
            disabled={false}
            windowStart={windowStart}
            windowEnd={windowEnd}
            onWindowStart={onWindowStart}
            onWindowEnd={onWindowEnd}
            days={planWindow}
            practicalConstraints={practicalConstraints}
            hasGoal={hasGoal}
            onEquipmentSaved={onEquipmentSaved}
            presence={presence}
            cookingSessions={cookingSessions}
            onCookingSessions={onCookingSessions}
            // ⟳ 2026-09-25 — LA PLAGE DE TEMPS EST UNE RÉPONSE DURABLE: elle vit
            // dans `draft` (`cookingTimeMin`), écrite par `savePlanAnswers`. Une
            // durée d'avant les plages y est lue dans la sienne.
            sessionTime={readSessionTimeBound({ cooking_time_min: draft.cookingTimeMin })}
            onSessionTime={(next) =>
              onChange((prev) => prev === null ? prev : { ...prev, cookingTimeMin: next })}
            showCookingMisses={showCookingMisses}
            groceryRuns={draft.groceryRuns}
            onGroceryRuns={(next) =>
              onChange((prev) => prev === null ? prev : { ...prev, groceryRuns: next })}
            budget={draft.budgetAmount === null ? "" : String(draft.budgetAmount)}
            onBudget={(raw) => {
              const trimmed = raw.trim();
              const amount = trimmed === "" ? null : Number(trimmed);
              onChange((prev) =>
                prev === null ? prev : {
                  ...prev,
                  // `Number("")` vaut 0 et EST fini — le piège qui avait déjà
                  // affiché une taille pré-remplie à 0 sur un compte neuf.
                  budgetAmount: amount === null || !Number.isFinite(amount)
                    ? null
                    : amount,
                }
              );
            }}
            budgetVerdict={budgetVerdict}
            budgetScale={budgetScale}
            // ⚠️ SEULEMENT QUAND LA DEMANDE PART SUR UN FOYER: la ligne d'envie
            // est clé sur un foyer. Vrai pour toute personne qui atteint cet
            // écran dès que l'étape 1 a créé son foyer.
            showEnvy={askEnvy}
            envy={envy}
            onEnvy={onEnvy}
          />
        </div>
      </Card>

      {/* ⛔ 2026-09-25 — « Ça le compose. L'écran suivant est le plan
          lui-même. » est retirée, sur demande. */}
      {missing.length > 0 && <MissingCard missing={missing} title="setup.missing.title" />}
    </>
  );
}
