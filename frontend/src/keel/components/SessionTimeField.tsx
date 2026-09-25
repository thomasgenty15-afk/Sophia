import React from "react";

import {
  type CookingSessionCount,
  offerableSessionTimes,
  readSessionTimeBound,
  SESSION_TIME_BOUNDS,
  type SessionTimeBound,
} from "../api/cookingPlan";
import { t, type MessageKey } from "../i18n/t";
import { nearestOffered, useOfferedAnswer } from "../lib/cookingAnswers";
import { Field, inputClass } from "./ui/Field";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « TEMPS PAR SESSION DE CUISINE » — des durées, bornées par le plan. 2026-09-25.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI DES PLAGES, ET POURQUOI BORNÉES ──────────────────────────────
 * La question « combien de minutes » avait été retirée le 2026-09-03: personne
 * ne sait répondre « 45 » avant d'avoir vu le plan. Cinq plages fermées se
 * répondent sans calcul. Et une plage n'est proposée que si elle suffit: pour
 * le modèle, ce temps est un MAXIMUM — trop court, il cuisine moins et les
 * derniers jours manquent de nourriture (`plan_feasibility.ts`). Tout cuisiner
 * pour sept jours en trente minutes n'est pas un choix, c'est un plan vide.
 *
 * ── LE MINIMUM ────────────────────────────────────────────────────────────
 * `offerableSessionTimes`, la même règle que le moteur: la plus grosse session
 * couvre ⌈jours ÷ sessions⌉ jours, fois les déjeuners et dîners de la maison,
 * fois `MINUTES_PER_COOKED_MEAL`. Le chiffre en minutes n'est JAMAIS affiché:
 * la personne ne voit que des plages, et la phrase nomme la plus courte qui
 * suffit.
 *
 * ── CE QUI S'ENREGISTRE ───────────────────────────────────────────────────
 * La durée, dans `cooking_time_min` — la clé que le moteur lit déjà. C'est une
 * réponse DURABLE. ⟳ 2026-09-25 — une durée que le plan courant rend trop
 * courte glisse à la plus proche proposée (décision du propriétaire), au lieu
 * de rester sélectionnée et grisée.
 *
 * ⟳ 2026-09-25 (soir) — CINQ DURÉES « ENVIRON » (30 min, 1 h, 1 h 30, 2 h,
 * 2 h 30) remplacent les plages; « 30 min » seulement quand chaque session
 * couvre deux jours au plus (`SHORTEST_SESSION_MAX_DAYS`).
 */
const BAND_KEYS: Record<SessionTimeBound, MessageKey> = {
  30: "plan.cooking.time_band_30",
  60: "plan.cooking.time_band_60",
  90: "plan.cooking.time_band_90",
  120: "plan.cooking.time_band_120",
  150: "plan.cooking.time_band_150",
};

export interface SessionTimeFieldProps {
  /** La borne haute choisie, ou `null` = pas encore répondu. */
  value: SessionTimeBound | null;
  onChange: (next: SessionTimeBound | null) => void;
  id: string;
  disabled: boolean;
  daysToEat: number;
  /**
   * LE NOMBRE DE SESSIONS CHOISI JUSTE À CÔTÉ, ou `null`. Sans lui, aucune
   * plage n'est grisée: on ne refuse pas un temps contre une réponse absente.
   */
  sessions: CookingSessionCount | null;
  /** Les déjeuners et dîners par jour (`cookedMealsPerDay`). REQUIS. */
  mealsPerDay: number;
  /** Le clic a été refusé sur ce champ. */
  showMissing: boolean;
}

export default function SessionTimeField(props: SessionTimeFieldProps) {
  const { value, onChange } = props;
  const offer = props.sessions === null ? null : offerableSessionTimes({
    daysToEat: props.daysToEat,
    sessions: props.sessions,
    mealsPerDay: props.mealsPerDay,
  });
  const allowed = (bound: SessionTimeBound) => offer === null || offer.values.includes(bound);
  const forced = offer !== null && offer.values.length === 1 ? offer.values[0] : null;

  // ⟳ 2026-09-25 — LA RÉPONSE AFFICHÉE EST TOUJOURS UNE RÉPONSE POSSIBLE
  // (décision du propriétaire). Une durée devenue trop courte (moins de
  // sessions, plus de jours) glisse à la plus proche proposée; une seule durée
  // possible (sept jours en une session) est sélectionnée d'office. Sans
  // nombre de sessions, rien n'est jugé: on ne corrige pas contre une réponse
  // absente. La durée est durable: la nouvelle sera enregistrée au lancement.
  // ⟳ 2026-09-25 (soir) — la correction part de la durée CHOISIE
  // (`useOfferedAnswer`), et revient à elle dès qu'elle redevient possible.
  const { shown: target, pick } = useOfferedAnswer<SessionTimeBound>({
    value,
    onChange,
    correct: (intent) =>
      offer === null ? intent : intent === null ? forced : nearestOffered(offer.values, intent),
  });

  const narrowed = offer !== null && offer.values.length < SESSION_TIME_BOUNDS.length;
  const minimumLine = offer === null ? null : t(
    offer.daysPerSession > 1 ? "plan.cooking.time_minimum" : "plan.cooking.time_minimum_one_day",
    { d: offer.daysPerSession, band: t(BAND_KEYS[offer.shortest]) },
  );
  const error = props.showMissing && target === null ? t("plan.cooking.time_required") : undefined;

  return (
    <Field
      label={t("plan.cooking.time_label")}
      hint={narrowed ? minimumLine ?? undefined : undefined}
      error={error}
      htmlFor={props.id}
    >
      <select
        id={props.id}
        className={inputClass}
        value={target === null ? "" : String(target)}
        disabled={props.disabled}
        onChange={(e) => pick(readSessionTimeBound({ cooking_time_min: e.target.value }))}
      >
        {/* Pas de « pas encore répondu » sous une durée imposée. */}
        {forced === null ? <option value="">{t("plan.cooking.time_unset")}</option> : null}
        {SESSION_TIME_BOUNDS.map((bound) => (
          <option key={bound} value={bound} disabled={!allowed(bound)}>
            {t(BAND_KEYS[bound])}
          </option>
        ))}
      </select>
    </Field>
  );
}
