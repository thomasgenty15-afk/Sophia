import React from "react";

import { t } from "../i18n/t";
import { CheckboxField } from "./ui/CheckboxField";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « TOUT CUISINER EN UNE SEULE SESSION » — LE CHAMP, 2026-09-01.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE LA CASE DEMANDE, ET CE QU'ELLE NE DEMANDE PAS ──────────────────
 * Elle ne choisit PAS un jour: elle dit « n'en garde qu'un ». Le jour reste le
 * premier de ceux qui sont cochés juste au-dessus et que la fenêtre contient
 * (`singleSessionCookDay`, côté moteur). Une case qui choisirait le jour à la
 * place de la personne serait un troisième champ de calendrier, en conflit
 * silencieux avec les deux qui existent déjà.
 *
 * ── ⛔ ELLE EST CONDITIONNÉE PAR LE CONGÉLATEUR, ET CE N'EST PAS DU CONFORT ─
 * Sans congélateur, un lot ne nourrit que le jour de sa cuisson et les deux
 * suivants (`MAX_FRIDGE_DAYS`). Une seule session sur sept jours, ce sont
 * QUATRE journées qu'aucun lot n'atteint — mesuré le 2026-09-01: huit repas sur
 * vingt-et-un jetés par le parseur, quatre jours réduits à leur petit-déjeuner.
 * L'option n'est donc pas « moins pratique » sans congélateur, elle est FAUSSE.
 *
 * ⚠️ DÉSACTIVÉE ET VISIBLE, JAMAIS CACHÉE. Ce dépôt a mesuré ce que coûte un
 * champ rendu incollectable: la question disparaît, et personne ne sait qu'il
 * lui manque une réponse ailleurs. Une PARENTHÈSE à côté du libellé dit donc CE
 * QU'IL MANQUE et OÙ le cocher — un refus près du geste, comme partout ici —,
 * et elle s'efface dès que le congélateur est déclaré.
 *
 * ── UN SEUL COMPOSANT POUR LES DEUX ÉCRANS ────────────────────────────────
 * `MealBuilder` (`/app/plan`) et l'entonnoir posent la MÊME question. Deux
 * champs écrits séparément divergeraient au premier libellé retouché, et c'est
 * celui qu'on regarde le moins qui garderait l'ancien mot. Patron de
 * `CookingShapeField`, y compris pour le namespace: les clés sont `plan.*`, et
 * l'entonnoir monte déjà ce vocabulaire-là.
 *
 * ── ⟳ 2026-09-04 — SA PLACE: SOUS « COMMENT VOULEZ-VOUS CUISINER ? » ───────
 * Elle vivait avec les DATES, au motif que « quand la cuisine a lieu » est une
 * question de calendrier. Elle y était pourtant lue comme une question de plein
 * droit, à trois champs de la seule qu'elle précise: le sélecteur de style
 * annonce déjà « le nombre de fois où le plan vous demande de cuisiner », et
 * cette case en est le cas extrême. Elle est donc posée JUSTE SOUS le
 * sélecteur, en plus petit (`CheckboxField` est passé en `text-xs` pour ça).
 *
 * ⛔ SUR LES DEUX ÉCRANS, ET DANS LE MÊME ORDRE. « Deux écrans qui demandent la
 * même chose dans deux ordres se relisent comme deux formulaires » — l'étape 3
 * fait foi, `/app/plan` la suit. Le garde-fou est
 * `oneCookingSessionField.int.test.ts`, qui lit les deux sources.
 *
 * ⛔ ET CE N'EST PAS UN RÉGLAGE DE PROFIL. La réponse ne s'enregistre nulle
 * part: elle part avec la demande (`one_cooking_session`), et la semaine
 * d'après repose la question. « Cette fois, je cuisine une seule fois » est un
 * arbitrage de semaine — l'écrire dans `practical_constraints` le rejouerait en
 * silence sur celle où on reçoit du monde.
 */

export interface OneCookingSessionFieldProps {
  /** La case est-elle cochée ? REQUIS. `false` = le moteur décide, comme avant. */
  value: boolean;
  onChange: (next: boolean) => void;
  /** L'identifiant de la case. REQUIS: deux champs sur une page les partagent sinon. */
  id: string;
  disabled: boolean;
  /**
   * CE FOYER A-T-IL DÉCLARÉ UN CONGÉLATEUR ?
   *
   * ⚠️ REQUIS, jamais `?`. Un défaut à `true` proposerait l'option à tout le
   * monde — y compris aux comptes à qui la question de l'équipement n'a jamais
   * été posée —, et le serveur la refuserait ensuite sous une phrase que
   * personne n'aurait vue venir. Un défaut à `false` la retirerait à des foyers
   * équipés. Il n'existe pas de valeur par défaut honnête: l'appelant LIT.
   *
   * Il vient de `hasFreezerDeclared(readKitchenEquipment(pc))` — la même
   * fonction que le moteur, en miroir (`api/freezerMirror.int.test.ts`).
   */
  hasFreezer: boolean;
}

export default function OneCookingSessionField(props: OneCookingSessionFieldProps) {
  const { hasFreezer, value, onChange } = props;
  // ══════════════════════════════════════════════════════════════════════
  // LA CASE SE DÉCOCHE TOUTE SEULE QUAND LE CONGÉLATEUR DISPARAÎT.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉCOR EST ATTEIGNABLE EN DEUX GESTES, ET IL EST DANS L'ENTONNOIR:
  // cocher l'option à l'étape « demande », revenir à l'étape « table »,
  // décocher le congélateur. Sans ceci, l'écran garderait une case COCHÉE et
  // grisée, et l'enverrait quand même — le serveur la refuserait, et la
  // personne lirait une explication qui ne correspond à rien de ce qu'elle
  // voit.
  //
  // ⚠️ L'INVARIANT VIT ICI, UNE SEULE FOIS. Le tenir au site d'envoi
  // (`value && hasFreezer`) en ferait deux expressions dans deux écrans, et
  // c'est celle qu'on regarde le moins qui garderait l'ancienne.
  React.useEffect(() => {
    if (!hasFreezer && value) onChange(false);
  }, [hasFreezer, value, onChange]);

  return (
    <CheckboxField
      id={props.id}
      checked={value && hasFreezer}
      disabled={props.disabled || !hasFreezer}
      onChange={onChange}
      label={t("plan.cooking.one_session_label")}
      /* ⛔ DEUX PHRASES, ET JAMAIS LES DEUX EN MÊME TEMPS, ET PAS AU MÊME
         ENDROIT. Avec congélateur, la ligne du dessous dit ce que la case FAIT
         (le surplus part au congélateur); sans, une PARENTHÈSE à côté du
         libellé dit ce qui MANQUE et où le cocher — et rien d'autre ne
         s'affiche. Servir l'aide générale à quelqu'un dont la case est grise
         décrirait un geste qu'il ne peut pas faire.

         ⚠️ LA PARENTHÈSE EST LE REFUS, PAS UNE DÉCORATION. Elle disparaît au
         moment où le congélateur est déclaré: une condition qui reste affichée
         une fois remplie apprend à ne plus la lire. */
      note={hasFreezer ? null : t("plan.cooking.one_session_needs_freezer")}
      hint={hasFreezer ? t("plan.cooking.one_session_hint") : null}
    />
  );
}
