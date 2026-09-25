import React from "react";

import {
  type CookingSessionCount,
  offerableCookingSessions,
  readCookingSessions,
} from "../api/cookingPlan";
import { MAX_FRIDGE_DAYS } from "../api/groceryWaves";
import { t, type MessageKey } from "../i18n/t";
import { nearestOffered, useOfferedAnswer } from "../lib/cookingAnswers";
import { Field, inputClass } from "./ui/Field";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « COMBIEN DE FOIS TU VEUX CUISINER ? » — 2026-09-25.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QU'IL REMPLACE ─────────────────────────────────────────────────────
 * Deux champs: le sélecteur « Comment tu cuisines » (le moins possible / un
 * juste milieu / j'aime cuisiner), qui DÉDUISAIT en silence le nombre de
 * sessions (`sessionsForStyle`, retirée), et la case « Tout cuisiner en une
 * seule fois », qui en était le cas extrême. Le nombre n'était montré qu'une
 * fois le plan composé. Décision du propriétaire, le 2026-09-25: on DEMANDE le
 * nombre, et « une fois » devient une option comme les autres.
 *
 * ── CE QU'IL PROPOSE ──────────────────────────────────────────────────────
 * `offerableCookingSessions` (`_shared/keel/cooking_plan.ts`), la même règle
 * que le moteur: de 1 au nombre de jours, quatre au plus; sans congélateur,
 * au moins une session par `MAX_FRIDGE_DAYS` jours. La règle n'est PAS
 * recopiée ici.
 *
 * ⚠️ LES OPTIONS TROP BASSES RESTENT VISIBLES, GRISÉES, avec la phrase qui dit
 * quoi cocher et où. ⟳ 2026-09-25 — une réponse devenue impossible glisse au
 * nombre proposé le plus proche (voir le corps). Sans congélateur, « Une fois » sur sept jours n'est pas
 * « moins pratique », elle est fausse (huit repas sur vingt et un jetés,
 * mesuré le 2026-09-01) — mais la cacher ferait chercher l'option ailleurs.
 *
 * ⛔ CE N'EST PAS UN RÉGLAGE DE PROFIL. Le nombre dépend de la longueur du
 * plan: « quatre fois » n'a pas de sens sur deux jours. La réponse part avec la
 * demande (`cooking_sessions`), comme la case qu'elle remplace, et la
 * composition suivante repose la question.
 */
const LABEL_KEYS: Record<CookingSessionCount, MessageKey> = {
  1: "plan.cooking.sessions_1",
  2: "plan.cooking.sessions_2",
  3: "plan.cooking.sessions_3",
  4: "plan.cooking.sessions_4",
};

export interface CookingSessionsFieldProps {
  /** Le nombre choisi. `null` = pas encore répondu. REQUIS ET NULLABLE. */
  value: CookingSessionCount | null;
  onChange: (next: CookingSessionCount | null) => void;
  id: string;
  disabled: boolean;
  /** Combien de jours la fenêtre demande. REQUIS. */
  daysToEat: number;
  /**
   * LE CONGÉLATEUR DU FOYER (`hasFreezerDeclared`). REQUIS: un défaut à `true`
   * proposerait « une fois » sur sept jours à qui n'en a pas.
   */
  freezer: boolean;
  /**
   * LE CLIC A ÉTÉ REFUSÉ SUR CE CHAMP. La ligne rouge ne s'affiche que tant que
   * la réponse manque ou n'est pas proposable: elle meurt avec sa cause.
   */
  showMissing: boolean;
}

export default function CookingSessionsField(props: CookingSessionsFieldProps) {
  const { value, onChange } = props;
  const offer = offerableCookingSessions({
    daysToEat: props.daysToEat,
    freezer: props.freezer,
    maxFridgeDays: MAX_FRIDGE_DAYS,
  });
  const { forced } = offer;
  const days = Math.max(1, Math.floor(props.daysToEat));

  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-25 — LA RÉPONSE AFFICHÉE EST TOUJOURS UNE RÉPONSE POSSIBLE.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Décision du propriétaire, qui renverse « une réponse que les dates rendent
  // impossible reste visible, sélectionnée et grisée »: on pouvait garder
  // coché ce qu'on ne pouvait plus choisir. Une seule réponse possible ⇒
  // elle; un nombre devenu impossible (dates raccourcies, congélateur décoché)
  // ⇒ le plus proche proposé; rien encore ⇒ rien. La réponse part avec la
  // demande et n'est pas enregistrée: rien de durable n'est écrasé.
  // ⟳ 2026-09-25 (soir) — la correction part de la réponse CHOISIE
  // (`useOfferedAnswer`), et revient à elle dès qu'elle redevient possible.
  const { shown: target, pick } = useOfferedAnswer<CookingSessionCount>({
    value,
    onChange,
    correct: (intent) => intent === null ? forced : nearestOffered(offer.values, intent),
  });

  const motive = offer.limit === "freezer"
    ? t("plan.cooking.sessions_needs_freezer", {
      d: MAX_FRIDGE_DAYS,
      n: days,
      min: offer.minimum,
    })
    : null;
  const hint = forced !== null
    // Une seule réponse possible: elle est sélectionnée, sa raison dessous.
    ? t("plan.cooking.sessions_only_one")
    : motive ??
      // « Une fois » au-delà de ce que le frigo tient: on dit l'autre moitié
      // du marché, sinon l'option ressemble à un raccourci gratuit.
      (target === 1 && days > MAX_FRIDGE_DAYS ? t("plan.cooking.one_session_hint") : undefined);
  const error = props.showMissing && target === null ? t("plan.cooking.sessions_required") : undefined;

  return (
    <Field label={t("plan.cooking.sessions_label")} hint={hint} error={error} htmlFor={props.id}>
      <select
        id={props.id}
        className={inputClass}
        // `""` ET PAS `null`: un `<select>` à `null` devient non contrôlé.
        value={target === null ? "" : String(target)}
        disabled={props.disabled}
        onChange={(e) => pick(readCookingSessions(e.target.value))}
      >
        {/* Pas de « pas encore répondu » sous une réponse imposée. */}
        {forced === null ? <option value="">{t("plan.cooking.sessions_unset")}</option> : null}
        {offer.shown.map((count) => (
          <option key={count} value={count} disabled={!offer.values.includes(count)}>
            {t(LABEL_KEYS[count])}
          </option>
        ))}
      </select>
    </Field>
  );
}
