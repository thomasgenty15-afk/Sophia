import React from "react";

import {
  type CookingStyle,
  type GroceryRuns,
  GROCERY_RUNS_ANY,
  type GroceryRunsAnswer,
  type GroceryRunsLimit,
  offerableGroceryRuns,
  readGroceryRuns,
} from "../api/cookingPlan";
// ⛔ LA CONSERVATION VIENT DU MOTEUR, elle n'est pas écrite ici. `cooking_plan`
// la REÇOIT plutôt que de l'importer (son en-tête dit pourquoi), et ce module
// est le point du front qui la ré-exporte déjà — un `3` posé ici en ferait une
// seconde définition, et c'est celle qu'on regarde le moins qui garde
// l'ancienne.
import { MAX_FRIDGE_DAYS } from "../api/groceryWaves";
import { t, type MessageKey } from "../i18n/t";
import { Field, inputClass } from "./ui/Field";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « COMBIEN DE COURSES ? » — P2, le second champ. 2026-09-03.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QU'IL DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ────────────────────────────
 * Il dit combien de fois par plan la personne accepte d'aller au magasin. Le
 * moteur en tire le nombre de SESSIONS de cuisine —
 * `min(courses, 3, plafond du style, jours mangés)` — et donc le nombre de
 * vagues de courses. Il ne dit rien de ce qu'on achète.
 *
 * ── ⟳ 2026-09-04 — IL NE PROPOSE PLUS CE QUE LE PLAN NE FERA PAS ──────────
 * Il posait les TROIS cadences à tout le monde. On demandait donc « trois
 * courses ? » pour un plan court, et « trois courses ? » à quelqu'un qui venait
 * de cocher « je cuisine tout en une seule fois » — puis le moteur rabotait en
 * silence, et la personne lisait le refus dans l'explication du plan. La liste
 * est maintenant celle de `offerableGroceryRuns`, et **quand il ne reste qu'une
 * réponse possible, il n'y a plus de question**: le champ DIT ce qui va se
 * passer, à la place du contrôle.
 *
 * ⚠️ ET LE PLAFOND DE FENÊTRE EST LA CONSERVATION, PAS LE NOMBRE DE JOURS.
 * Première version, corrigée le soir même sur une capture: un plan du 4 au 5
 * septembre proposait DEUX courses pour DEUX jours, alors qu'un seul lot les
 * couvre. Ce n'est pas « combien de courses tiennent dans la fenêtre », c'est
 * « combien il en faut » — et un plat cuisiné tient `MAX_FRIDGE_DAYS` jours.
 *
 * ⛔ LA RÈGLE N'EST PAS ICI, ELLE EST DANS LE MODULE SERVEUR. Elle lit les
 * mêmes constantes que `deriveCookingPlan` (`MAX_COOKING_SESSIONS`,
 * `sessionCap`); recopiée ici, elle aurait porté `2` et `3` en dur et divergé
 * au premier plafond retouché — le jumeau que ce dépôt a déjà supprimé une
 * fois (`groceryWaves.ts`, 2026-08-10).
 *
 * ⛔ ET « PAS PROPOSÉ » N'EST JAMAIS « DISPARU SANS RIEN DIRE ». Chaque
 * resserrement porte sa phrase (`plan.cooking.runs_capped_*`,
 * `runs_only_one_*`), qui NOMME la cause — la fenêtre, le style, ou la case
 * du dessus. Une option qui s'évapore sans motif se lit comme une panne, et
 * envoie chercher le réglage manquant dans le mauvais écran.
 *
 * ── ⚠️ CE QUE LE CHAMP N'ÉCRIT JAMAIS ─────────────────────────────────────
 * Il ne RABOTE PAS une réponse déjà donnée. `grocery_runs` est DURABLE — c'est
 * la tolérance de la personne, pas une propriété de la semaine —, et une
 * fenêtre de deux jours qui écraserait « trois courses » par « deux » lui
 * retirerait en silence, et pour toujours, une réponse qu'elle avait donnée.
 * Une valeur hors de l'offre reste donc VISIBLE et sélectionnée, désactivée:
 * même arbitrage que « une valeur hors liste garde sa place ».
 *
 * La SEULE écriture automatique est l'AMORCE: quand il n'y a qu'une réponse
 * possible et que rien n'est encore enregistré, on écrit celle-là. Sans elle,
 * l'entonnoir bloquerait sur « dis-nous combien de courses tu acceptes » avec
 * aucun contrôle à l'écran pour le lever — la garde désarmée que
 * `missesForStep` existe pour empêcher.
 *
 * ── POURQUOI PAS UN CURSEUR ───────────────────────────────────────────────
 * Trois valeurs, trois gestes différents dans une vie — un curseur donnerait
 * l'illusion d'un continuum et coûterait une visée fine pour rien.
 */
const LABEL_KEYS: Record<GroceryRuns, MessageKey> = {
  1: "plan.cooking.runs_one",
  2: "plan.cooking.runs_two",
  3: "plan.cooking.runs_three",
};

/**
 * CE QU'ON DIT QUAND IL N'Y A PLUS QU'UNE RÉPONSE — à la place du contrôle.
 *
 * ⚠️ `"style"` N'Y EST PAS FORCÉMENT ATTEIGNABLE, ET C'EST UN FAIT DE CODE,
 * pas un oubli: le plafond le plus bas d'un style est `2` (`minimal`), donc le
 * style seul ne peut jamais forcer. L'entrée existe quand même — une constante
 * retouchée ne doit pas rendre une phrase vide.
 */
const FORCED_KEYS: Record<GroceryRunsLimit, MessageKey> = {
  one_session: "plan.cooking.runs_only_one_session",
  days: "plan.cooking.runs_only_one_batch",
  style: "plan.cooking.runs_capped_style",
};

/** CE QU'ON DIT QUAND LA LISTE EST COURTE — à la place de l'aide générale. */
const CAPPED_KEYS: Record<GroceryRunsLimit, MessageKey> = {
  one_session: "plan.cooking.runs_only_one_session",
  days: "plan.cooking.runs_capped_days",
  style: "plan.cooking.runs_capped_style",
};

export interface GroceryRunsFieldProps {
  /**
   * LE NOMBRE CHOISI. `null` = **pas encore répondu**, et surtout pas « une ».
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — même arbitrage que le style.
   */
  value: GroceryRunsAnswer | null;
  onChange: (next: GroceryRunsAnswer | null) => void;
  id: string;
  disabled: boolean;
  /**
   * LE STYLE DÉCLARÉ, ou `null` = jamais demandé. Il PLAFONNE les sessions,
   * donc les courses.
   *
   * ⚠️ REQUIS ET NULLABLE. `null` ne vaut PAS « le moins possible »
   * (cicatrice `20260818110000:48-51`): le traiter comme tel retirerait la
   * troisième cadence à tout compte qui n'a pas encore répondu.
   */
  style: CookingStyle | null;
  /**
   * LA CASE « TOUT CUISINER EN UNE SEULE FOIS », telle qu'elle est cochée
   * JUSTE AU-DESSUS. Une seule cuisson ⇒ une seule vague de courses.
   *
   * ⚠️ REQUIS, jamais `?`. Un défaut à `false` ferait proposer trois courses
   * sous une case cochée, et c'est très exactement le défaut que ce lot ferme:
   * un paramètre de garde optionnel est une garde désarmée.
   */
  oneCookingSession: boolean;
  /**
   * COMBIEN DE JOURS LA FENÊTRE DEMANDE. REQUIS.
   *
   * ⚠️ LA FENÊTRE DEMANDÉE, PAS LES JOURS RÉELLEMENT MANGÉS. Les absences la
   * réduisent encore côté serveur (`resolveWindowPresence`), et c'est la bonne
   * direction: on ne retire jamais une option que le moteur aurait honorée.
   * L'inverse — offrir large et raboter après — est le défaut d'origine.
   */
  daysToEat: number;
}

export default function GroceryRunsField(props: GroceryRunsFieldProps) {
  const { value, onChange } = props;
  const offer = offerableGroceryRuns({
    style: props.style,
    oneCookingSession: props.oneCookingSession,
    daysToEat: props.daysToEat,
    maxFridgeDays: MAX_FRIDGE_DAYS,
  });
  const { forced, limit } = offer;
  // Les deux nombres que la phrase de conservation interpole. Ils voyagent
  // ensemble parce qu'ils n'ont de sens qu'ensemble: « {n} jours, un plat en
  // tient {d} » est la SOUSTRACTION que la personne fait de tête.
  const days = { n: Math.max(1, Math.floor(props.daysToEat)), d: MAX_FRIDGE_DAYS };

  // ══════════════════════════════════════════════════════════════════════
  // L'AMORCE — et elle n'écrase JAMAIS une réponse.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ `value === null` EST LA MOITIÉ QUI COMPTE. Sans elle, une fenêtre d'un
  // jour effacerait durablement « trois courses » — `grocery_runs` est la
  // TOLÉRANCE de la personne, pas une propriété de la semaine, et la semaine
  // suivante repartirait d'une réponse que personne n'a donnée.
  //
  // ⚠️ ET SANS L'AMORCE, L'ENTONNOIR SE BLOQUE: `canGenerateMisses` exige
  // `grocery_runs`, et le contrôle qui le lèverait n'est pas rendu.
  React.useEffect(() => {
    if (forced !== null && value === null) onChange(forced);
  }, [forced, value, onChange]);

  // ── PLUS QU'UNE RÉPONSE POSSIBLE ⇒ PLUS DE QUESTION ─────────────────────
  // On DIT ce qui va se passer. Un `<select>` à une seule option est un
  // contrôle qui n'en est pas un: il demande un geste dont le résultat est déjà
  // écrit.
  if (forced !== null) {
    return (
      <Field label={t("plan.cooking.runs_label")}>
        <p className="text-sm leading-6 text-ink">
          {t(limit === null ? "plan.cooking.runs_one" : FORCED_KEYS[limit], days)}
        </p>
      </Field>
    );
  }

  // ── UNE VALEUR HORS OFFRE GARDE SA PLACE ────────────────────────────────
  // Elle reste sélectionnée et VISIBLE, désactivée. La retirer ferait un
  // `<select>` sans valeur au-dessus d'une réponse pourtant enregistrée — et
  // le prochain enregistrement la réécrirait telle quelle sans que personne
  // ait vu ce qui se joue.
  // ⚠️ « peu importe » N'EST JAMAIS PÉRIMÉ. Il ne nomme aucun nombre, donc
  // aucun resserrement de l'offre ne peut le rendre impossible — le tester
  // contre `offer.values` le grillerait au premier plan court.
  const stale = value !== null && value !== GROCERY_RUNS_ANY &&
      !offer.values.includes(value)
    ? value
    : null;

  // ══════════════════════════════════════════════════════════════════════
  // « PEU IMPORTE » — SEULEMENT QUAND IL Y A VRAIMENT UN CHOIX.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ UNE SEULE VALEUR OFFERTE ⇒ PAS D'OPTION. « Peu importe » voudrait dire
  // « choisis pour moi » devant une liste où il n'y a rien à choisir: deux
  // façons de dire le même nombre, dont une qui a l'air d'ouvrir une porte.
  // (Le cas est en pratique déjà pris par la branche `forced` au-dessus, qui
  // remplace le contrôle par une phrase; la condition reste écrite ici pour
  // que le rendu ne dépende pas d'une garde posée ailleurs.)
  const offersAny = offer.values.length > 1;

  return (
    <Field
      label={t("plan.cooking.runs_label")}
      /* ⚠️ LE MOTIF REMPLACE L'AIDE GÉNÉRALE, il ne s'ajoute pas. Deux
         paragraphes sous un seul `<select>` se lisent comme un avertissement;
         et la nuance du congélateur que porte l'aide générale est déjà dite
         par la case juste au-dessus, qui la conditionne. */
      hint={t(limit === null ? "plan.cooking.runs_hint" : CAPPED_KEYS[limit], days)}
      htmlFor={props.id}
    >
      <select
        id={props.id}
        className={inputClass}
        value={value === null ? "" : String(value)}
        disabled={props.disabled}
        /* ⛔ LE JETON PASSE AVANT LE `Number()`. « any » nombrifié donne `NaN`,
           que `readGroceryRuns` rend en `null` — c'est-à-dire « pas encore
           répondu ». Choisir « peu importe » aurait donc reposé la question,
           et rebloqué l'entonnoir, sans qu'aucun test de type ne bronche. */
        onChange={(e) =>
          onChange(
            e.target.value === GROCERY_RUNS_ANY
              ? GROCERY_RUNS_ANY
              : readGroceryRuns({ grocery_runs: Number(e.target.value) }),
          )}
      >
        <option value="">{t("plan.cooking.runs_unset")}</option>
        {/* LUES DE L'OFFRE, jamais trois `<option>` écrites à la main: une
            quatrième cadence ajoutée au module apparaîtrait ici sans libellé
            plutôt que de manquer en silence. */}
        {offer.values.map((runs) => (
          <option key={runs} value={runs}>
            {t(LABEL_KEYS[runs])}
          </option>
        ))}
        {/* ⚠️ APRÈS LES NOMBRES, ET C'EST LE SENS DE LA LISTE: on lit d'abord
            ce qu'on peut choisir, « peu importe » est la sortie de celui qui
            ne veut pas choisir — pas la première réponse qu'on lui propose. */}
        {offersAny
          ? (
            <option value={GROCERY_RUNS_ANY}>
              {t("plan.cooking.runs_any")}
            </option>
          )
          : null}
        {stale === null ? null : (
          <option key={stale} value={stale} disabled>
            {t(LABEL_KEYS[stale])}
          </option>
        )}
      </select>
    </Field>
  );
}
