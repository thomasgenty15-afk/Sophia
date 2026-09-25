import React from "react";

import {
  type CookingSessionCount,
  GROCERY_RUNS,
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
import { nearestOffered, useOfferedAnswer } from "../lib/cookingAnswers";
import { Field, inputClass } from "./ui/Field";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « COMBIEN DE COURSES ? » — P2, le second champ. 2026-09-03.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QU'IL DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ────────────────────────────
 * Il dit combien de fois par plan la personne accepte d'aller au magasin, et
 * donc le nombre de vagues de courses. Il ne dit rien de ce qu'on achète.
 *
 * ⟳ 2026-09-25 — IL EST BORNÉ PAR LE NOMBRE DE SESSIONS choisi juste
 * au-dessus (`runs <= sessions`): on ne va pas au magasin plus souvent qu'on ne
 * cuisine. Ce plafond remplace celui du style, retiré avec lui.
 *
 * ── ⟳ 2026-09-04 — IL NE PROPOSE PLUS CE QUE LE PLAN NE FERA PAS ──────────
 * Il posait les TROIS cadences à tout le monde. On demandait donc « trois
 * courses ? » pour un plan court, et « trois courses ? » à quelqu'un qui venait
 * de cocher « je cuisine tout en une seule fois » — puis le moteur rabotait en
 * silence, et la personne lisait le refus dans l'explication du plan. La liste
 * est maintenant celle de `offerableGroceryRuns`.
 *
 * ⟳ 2026-09-25 — QUAND IL NE RESTE QU'UNE RÉPONSE, ELLE EST SÉLECTIONNÉE
 * (décision du propriétaire). La liste reste à l'écran, la seule réponse
 * possible y est choisie, les autres sont grisées, et une phrase courte dit
 * pourquoi. Avant, une phrase remplaçait la liste: on ne voyait plus ce qui
 * était retenu.
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
 * plafond porte sa phrase (`plan.cooking.runs_capped_*`, `runs_only_one_*`),
 * qui NOMME la cause — la fenêtre ou les sessions. ⟳ 2026-09-25 — le
 * congélateur n'a plus de phrase ICI: « Combien de fois tu veux cuisiner »,
 * juste au-dessus, le dit déjà.
 *
 * ── ⟳ 2026-09-25 · UNE RÉPONSE DEVENUE IMPOSSIBLE GLISSE AU PLUS PROCHE ────
 * Décision du propriétaire, qui renverse « une valeur hors offre reste
 * visible, sélectionnée et grisée »: on pouvait garder coché ce qu'on ne
 * pouvait plus choisir. Quand les dates, les sessions ou le congélateur
 * changent, la réponse passe au nombre proposé le plus proche
 * (`nearestOffered`), et c'est lui qui part avec la demande — sinon le moteur
 * rabote, et l'explication du plan dit « tu en as demandé 3 » à quelqu'un qui
 * a vu « 2 ». `grocery_runs` est durable: le nouveau nombre sera enregistré au
 * lancement. Rien n'est écrit tant que la personne n'a pas répondu, sauf quand
 * une seule réponse est possible. « Peu importe » ne bouge jamais: il vaut
 * déjà le haut de l'offre.
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

/** CE QU'ON DIT SOUS LA LISTE QUAND SON HAUT EST RABOTÉ. */
const CAPPED_KEYS: Record<GroceryRunsLimit, MessageKey> = {
  one_session: "plan.cooking.runs_only_one_session",
  days: "plan.cooking.runs_capped_days",
  sessions: "plan.cooking.runs_capped_sessions",
};

/**
 * ⟳ 2026-09-25 — CE QU'ON DIT SOUS UNE RÉPONSE IMPOSÉE. La même phrase que le
 * plafond, sauf une fenêtre qu'UN seul lot couvre: « deux courses suffisent »
 * y serait faux.
 */
function forcedKey(forced: GroceryRuns, limit: GroceryRunsLimit | null): MessageKey | null {
  if (limit === null) return null;
  if (limit === "days" && forced === 1) return "plan.cooking.runs_only_one_batch";
  return CAPPED_KEYS[limit];
}

export interface GroceryRunsFieldProps {
  /**
   * LE NOMBRE CHOISI. `null` = **pas encore répondu**, et surtout pas « une ».
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel.
   */
  value: GroceryRunsAnswer | null;
  onChange: (next: GroceryRunsAnswer | null) => void;
  id: string;
  disabled: boolean;
  /**
   * ⟳ 2026-09-25 — LE NOMBRE DE SESSIONS CHOISI JUSTE AU-DESSUS, ou `null` =
   * pas encore répondu ⇒ aucun plafond. Une seule session ⇒ une seule vague
   * de courses.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais `?`: un paramètre de garde optionnel est
   * une garde désarmée — l'écran proposerait trois courses sous « une fois ».
   */
  sessions: CookingSessionCount | null;
  /**
   * COMBIEN DE JOURS LA FENÊTRE DEMANDE. REQUIS.
   *
   * ⚠️ LA FENÊTRE DEMANDÉE, PAS LES JOURS RÉELLEMENT MANGÉS. Les absences la
   * réduisent encore côté serveur (`resolveWindowPresence`), et c'est la bonne
   * direction: on ne retire jamais une option que le moteur aurait honorée.
   * L'inverse — offrir large et raboter après — est le défaut d'origine.
   */
  daysToEat: number;
  /**
   * ⟳ 2026-09-21 — LE CONGÉLATEUR DU FOYER (`hasFreezerDeclared`), ou `null`
   * quand la question n'a pas été posée. Sans lui, « une course » ne couvre
   * pas un plan plus long que la conservation: l'offre de courses suit.
   */
  freezer: boolean | null;
}

export default function GroceryRunsField(props: GroceryRunsFieldProps) {
  const { value, onChange } = props;
  const offer = offerableGroceryRuns({
    sessions: props.sessions,
    daysToEat: props.daysToEat,
    maxFridgeDays: MAX_FRIDGE_DAYS,
    freezer: props.freezer,
  });
  const { forced, limit } = offer;
  // Les deux nombres que la phrase de conservation interpole. Ils voyagent
  // ensemble parce qu'ils n'ont de sens qu'ensemble: « {n} jours, un plat en
  // tient {d} » est la SOUSTRACTION que la personne fait de tête.
  // ⟳ 2026-09-25 — `k`, le nombre de sessions, pour la phrase du plafond des
  // sessions (`runs_capped_sessions`).
  const days = {
    n: Math.max(1, Math.floor(props.daysToEat)),
    d: MAX_FRIDGE_DAYS,
    k: props.sessions ?? 0,
  };

  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-25 — LA RÉPONSE AFFICHÉE EST TOUJOURS UNE RÉPONSE POSSIBLE.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Une seule réponse possible ⇒ elle. Un nombre devenu impossible ⇒ le plus
  // proche proposé. Rien encore ⇒ rien. « Peu importe » ⇒ lui-même (affiché
  // comme la réponse imposée quand il n'en reste qu'une).
  //
  // ⚠️ SANS L'ÉCRITURE, L'ENTONNOIR SE BLOQUE: `canGenerateMisses` exige
  // `grocery_runs`, et une réponse imposée n'a pas d'autre contrôle pour la
  // donner.
  // ⟳ 2026-09-25 (soir) — LA CORRECTION PART DE LA RÉPONSE CHOISIE, pas de
  // la dernière correction (`useOfferedAnswer`): 3 courses, puis « Deux
  // fois » en cuisine ⇒ 2; puis « Trois fois » ⇒ 3 de nouveau.
  const { shown: target, pick } = useOfferedAnswer<GroceryRunsAnswer>({
    value,
    onChange,
    correct: (intent) =>
      intent === GROCERY_RUNS_ANY
        ? intent
        : intent === null
        ? forced
        : nearestOffered(offer.values, intent),
  });
  // Ce que la liste montre: la réponse imposée, sinon la réponse corrigée.
  const shown = forced ?? target;
  const forcedHint = forced === null ? null : forcedKey(forced, limit);
  const hint = forcedHint !== null
    ? t(forcedHint, days)
    : limit === null
    ? undefined
    : t(CAPPED_KEYS[limit], days);

  // ══════════════════════════════════════════════════════════════════════
  // « PEU IMPORTE » — SEULEMENT QUAND IL Y A VRAIMENT UN CHOIX.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ UNE SEULE VALEUR OFFERTE ⇒ PAS D'OPTION. « Peu importe » voudrait dire
  // « choisis pour moi » devant une liste où il n'y a rien à choisir: deux
  // façons de dire le même nombre, dont une qui a l'air d'ouvrir une porte.
  // Une réponse « peu importe » déjà donnée reste en état, et la liste montre
  // la réponse imposée à sa place.
  const offersAny = offer.values.length > 1;

  return (
    <Field
      label={t("plan.cooking.runs_label")}
      /* ⟳ 2026-09-16 — PLUS D'AIDE GÉNÉRALE: seul un MOTIF s'affiche, quand
         l'offre est plafonnée ou qu'une seule réponse reste. */
      hint={hint}
      htmlFor={props.id}
    >
      <select
        id={props.id}
        className={inputClass}
        value={shown === null ? "" : String(shown)}
        disabled={props.disabled}
        /* ⛔ LE JETON PASSE AVANT LE `Number()`. « any » nombrifié donne `NaN`,
           que `readGroceryRuns` rend en `null` — c'est-à-dire « pas encore
           répondu ». Choisir « peu importe » aurait donc reposé la question,
           et rebloqué l'entonnoir, sans qu'aucun test de type ne bronche. */
        onChange={(e) =>
          pick(
            e.target.value === GROCERY_RUNS_ANY
              ? GROCERY_RUNS_ANY
              : readGroceryRuns({ grocery_runs: Number(e.target.value) }),
          )}
      >
        {/* Pas de « pas encore répondu » sous une réponse imposée: elle est
            déjà donnée. */}
        {forced === null ? <option value="">{t("plan.cooking.runs_unset")}</option> : null}
        {/* LUES DU MODULE, jamais trois `<option>` écrites à la main: une
            quatrième cadence ajoutée apparaîtrait ici sans libellé plutôt que
            de manquer en silence. ⟳ 2026-09-25 — les cadences hors de l'offre
            restent VISIBLES, grisées, comme dans « Combien de fois tu veux
            cuisiner »: on voit ce qui n'est pas possible, et la phrase dessous
            dit pourquoi. */}
        {GROCERY_RUNS.map((runs) => (
          <option key={runs} value={runs} disabled={!offer.values.includes(runs)}>
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
      </select>
    </Field>
  );
}
