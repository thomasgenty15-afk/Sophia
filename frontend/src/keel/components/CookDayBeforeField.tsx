import React from "react";

import { t } from "../i18n/t";
import { CheckboxField } from "./ui/CheckboxField";
import { MAX_WINDOW_DAYS } from "../api/mealWindow";
import { cookDayBeforeAvailable } from "../../../../supabase/functions/_shared/keel/meal_plan_window.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « JE CUISINE LA VEILLE » — LA CASE, 2026-09-01.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QU'ELLE DEMANDE ────────────────────────────────────────────────────
 * Que le plan commence UN JOUR PLUS TÔT, et que ce jour-là soit une journée de
 * cuisine où rien ne se mange. Un plan « lundi→vendredi, je cuisine dimanche »
 * EST un plan « dimanche→vendredi » dont le dimanche ne porte aucun repas —
 * c'est la sortie du §3.3 de la synthèse du chantier, et elle ne demande
 * aucune migration.
 *
 * ⛔ ELLE VIT AVEC LES DATES, ET NULLE PART AILLEURS. C'est une question de
 * CALENDRIER: elle change le premier jour du plan. Posée sous le budget ou
 * sous l'envie, elle serait un réglage sans rapport avec le champ qu'elle
 * déplace.
 *
 * ── LES DEUX GRISAGES, ET ILS VIENNENT DU MOTEUR ──────────────────────────
 * `cookDayBeforeAvailable` est le MIROIR EXACT de ce que `withCookDayBefore`
 * accordera côté serveur — la même fonction, appelée, pas deux conditions
 * recopiées. Une case cochable qui serait refusée ensuite promettrait un geste
 * que le moteur ne fera pas.
 *
 *   · le plan commence AUJOURD'HUI ⇒ la veille est hier, et on ne compose pas
 *     un jour révolu;
 *   · la fenêtre fait déjà sept jours ⇒ le jour ajouté déborderait le plafond
 *     de la base. On n'ampute jamais la fin pour faire de la place: ce serait
 *     répondre « tu mangeras un jour de moins » à « je cuisine la veille ».
 *
 * ⚠️ DÉSACTIVÉE ET VISIBLE, jamais cachée, et la ligne dit LAQUELLE des deux
 * conditions manque — un refus qui ne nomme pas sa cause se lit comme un bouton
 * mort, cicatrice mesurée trois fois sur ces écrans.
 *
 * ⛔ ET CE N'EST PAS UN RÉGLAGE DE PROFIL: la réponse part avec la demande
 * (`cook_the_day_before`) et la semaine d'après repose la question.
 */

export interface CookDayBeforeFieldProps {
  value: boolean;
  onChange: (next: boolean) => void;
  id: string;
  disabled: boolean;
  /** Le premier jour DEMANDÉ, en `yyyy-mm-dd`. REQUIS: c'est lui qui recule. */
  startsOn: string;
  /** La durée demandée. REQUISE: c'est elle qui décide s'il reste de la place. */
  durationDays: number;
  /** Le jour local de la personne. REQUIS, jamais une horloge lue ici. */
  today: string;
}

export default function CookDayBeforeField(props: CookDayBeforeFieldProps) {
  const { startsOn, durationDays, today, value, onChange } = props;
  const available = React.useMemo(
    () => cookDayBeforeAvailable({ startsOn, durationDays }, today),
    [startsOn, durationDays, today],
  );
  // ⚠️ LA CASE SE DÉCOCHE QUAND LA FENÊTRE CESSE DE LE PERMETTRE, et le décor
  // est atteignable en UN geste: cocher la veille, puis pousser la date de fin
  // à sept jours. Sans ceci, l'écran garderait une case cochée et grisée, et
  // l'enverrait quand même — le serveur la refuserait, et la personne lirait
  // une explication qui ne correspond à rien de ce qu'elle voit.
  React.useEffect(() => {
    if (!available && value) onChange(false);
  }, [available, value, onChange]);

  // ⛔ LE MOTIF EST NOMMÉ, pas « indisponible ». Les deux conditions se
  // réparent par des gestes OPPOSÉS — reculer la date de début, ou raccourcir
  // la fenêtre — et une phrase commune ne dirait ni l'un ni l'autre.
  const hint = available
    ? "plan.cooking.day_before_hint"
    // ⚠️ `MAX_WINDOW_DAYS`, JAMAIS `7` EN DUR: le nombre décide aussi du
    // `max` du champ de date de fin, et deux copies divergeraient au premier
    // ajustement — celle qu'on regarde le moins garderait l'ancienne.
    : durationDays + 1 > MAX_WINDOW_DAYS
    ? "plan.cooking.day_before_no_room"
    : "plan.cooking.day_before_starts_today";

  return (
    <CheckboxField
      id={props.id}
      checked={value && available}
      disabled={props.disabled || !available}
      onChange={onChange}
      label={t("plan.cooking.day_before_label")}
      hint={t(hint)}
    />
  );
}
