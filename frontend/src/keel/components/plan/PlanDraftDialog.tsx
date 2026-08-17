/**
 * LA FENÊTRE DE BROUILLON — VOIR CE QUE ÇA DONNERAIT, AVANT QUE ÇA EXISTE.
 *
 * Contrat: `scratchpad/PLAN-ECRAN-DEMANDE-CONTRAT.md` §4.4.
 * Moitié serveur: `scratchpad/RAPPORT-LOT-C-BACKEND-20260813.md`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * RIEN N'EST ÉCRIT TANT QUE CETTE FENÊTRE EST OUVERTE.
 *
 * `intent: "draft"` saute la SEULE écriture (`write_student_meal_plan`) et
 * garde toutes les gardes amont: gel, objectif requis, méthode publiée,
 * fenêtre, chevauchement, plancher TCA, doctrine, règles de maison. Mesuré:
 * `select count(*) from student_generated_meals` INCHANGÉ après trois tours.
 * C'est ce que `plan.draft.not_saved` dit, et c'est ce qui autorise à refaire.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⛔ CE COMPOSANT NE REND PAS UN PLAN, IL EN MONTE UN ────────────────────
 * `PlanResult` est le rendu unique d'un plan, extrait exprès pour être monté
 * DEUX fois — sur `/app/plan` et ici. Un second rendu divergerait au premier
 * correctif, et c'est celui qu'on regarde le moins qui garderait l'ancien
 * comportement. On lui passe le brouillon tel quel.
 *
 * ── ⛔ AUCUNE GARDE N'EST RECOPIÉE ICI ─────────────────────────────────────
 * La phrase écrite dans le champ est jugée par `_shared/keel/plan_draft_note.ts`
 * et par lui SEUL. Cet écran ne sait pas ce qu'est une cible chiffrée, un
 * interdit de doctrine ou une consigne au modèle — et il ne doit pas
 * l'apprendre. Le compteur de signes COMPTE, il ne refuse pas: le serveur
 * mesure après repli des blancs, donc il est plus permissif, et bloquer ici
 * refuserait des phrases qu'il accepte.
 *
 * ── LE PLAFOND SE DIT AVANT D'ÊTRE HEURTÉ ─────────────────────────────────
 * Trois compositions, aperçu initial compris. Le compte restant est affiché à
 * CHAQUE tour, pas seulement au dernier: un bouton qui se désactive sans
 * prévenir se lit comme une panne, et quelqu'un qui aurait su qu'il lui restait
 * une seule reprise aurait écrit une autre phrase.
 *
 * ── ⛔ AUCUN PARAMÈTRE DE GARDE OPTIONNEL ─────────────────────────────────
 * L'absence s'écrit `T | null`, jamais `x?: T` — sept paramètres optionnels ont
 * déjà été des gardes désarmées dans ce dépôt.
 */

import React from "react";

import type { GeneratedMealResult } from "../../api/mealGeneration";
import {
  canRemix,
  DRAFT_NOTE_MAX_CHARS,
  draftTurnsLeft,
  hasNote,
  noteLength,
  noteOverflows,
} from "../../api/planDraft";
import { t } from "../../i18n/t";
import { Button } from "../ui/Button";
import { Card, SectionLabel } from "../ui/Card";
import { inputClass } from "../ui/Field";
import Modal from "../ui/Modal";
import PlanResult from "./PlanResult";

export interface PlanDraftDialogProps {
  open: boolean;
  onClose: () => void;
  /** Le brouillon rendu par le serveur. `null` = rien à montrer. */
  draft: GeneratedMealResult | null;
  /** Les phrases de Lot A. `[]` = rien à expliquer, et ce n'est pas un manque. */
  rationale: readonly string[];
  /**
   * ⚠️ PROP AJOUTÉE AU CONTRAT §4.4, ET REQUISE. LE FAIT, JAMAIS LE MOTIF.
   *
   * La garde d'entrée refuse LA CLAUSE, pas le texte: « des pizzas tous les
   * midis. Mets 30 g de protéines au déjeuner. Du poisson le vendredi » compose
   * un plan qui porte la pizza ET le poisson et laisse tomber la clause chiffrée
   * SEULE (mesuré en réel). Sans ce compte, cette clause retirée n'est visible
   * NULLE PART et la personne croit avoir été entendue sur les trois.
   *
   * C'est un NOMBRE, jamais une liste de motifs: nommer `restriction_floor`
   * dirait à quelqu'un qu'il est sous plancher TCA, ce qu'aucun écran n'a le
   * droit de faire. Le motif se compte côté serveur, il ne se dit pas.
   *
   * 🔴 AUJOURD'HUI IL VAUT TOUJOURS `0`, ET CE N'EST PAS UN OUBLI D'ICI: le
   * serveur journalise `dropped` et ne le REND pas. Voir l'en-tête de
   * `DraftEnvelope.droppedClauses` (`api/planDraft.ts`) pour la ligne exacte
   * qui manque, et pourquoi elle est hors de la colonne de ce lot.
   *
   * REQUISE et non optionnelle: `0` est une AFFIRMATION (« rien n'est tombé »),
   * que le site de montage doit faire exprès.
   */
  droppedClauses: number;
  /** Refait un brouillon avec la phrase. REQUIS, jamais optionnel. */
  onRemix: (note: string) => Promise<void>;
  /** Écrit le plan pour de bon. */
  onAdopt: () => Promise<void>;
  /** Une composition est en cours. */
  busy: boolean;
}

export default function PlanDraftDialog(props: PlanDraftDialogProps) {
  const { open, onClose, draft, rationale, droppedClauses, onRemix, onAdopt, busy } =
    props;

  const [note, setNote] = React.useState("");
  /**
   * COMBIEN DE COMPOSITIONS ONT DÉJÀ ÉTÉ RENDUES, aperçu initial compris.
   *
   * ⚠️ IL VIT ICI, PAS DANS UNE PROP. Le champ de commentaire est à cet écran,
   * donc les tours qu'il déclenche se comptent à cet écran — un compteur passé
   * par le site de montage serait une seconde source pour le même nombre, et
   * c'est toujours celle qu'on ne regarde pas qui gagne.
   *
   * ⚠️ ET IL DÉMARRE À 1, PAS À 0: quand cette fenêtre s'ouvre, un aperçu a
   * DÉJÀ été composé — c'est celui qu'elle affiche. Démarrer à zéro offrirait
   * un quatrième tour.
   */
  const [turnsUsed, setTurnsUsed] = React.useState(1);
  const [working, setWorking] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  /**
   * ⚠️ `Modal` REND `null` QUAND IL EST FERMÉ, IL NE DÉMONTE PAS SES ENFANTS —
   * donc cet état-ci SURVIT à une fermeture, ce qui est le comportement voulu
   * pour la liste de courses. Ici il ne l'est PAS: un brouillon refermé puis
   * rouvert est un AUTRE brouillon, et rouvrir avec « il te reste 0 reprise »
   * plus la phrase de la fois d'avant serait faux deux fois.
   *
   * On remet donc à zéro à chaque OUVERTURE, et pas à la fermeture: c'est
   * l'ouverture qui commence une session de brouillon.
   */
  React.useEffect(() => {
    if (!open) return;
    setNote("");
    setTurnsUsed(1);
    setFailure(null);
  }, [open]);

  const busyNow = busy || working;
  const left = draftTurnsLeft(turnsUsed);
  const canAskAgain = canRemix(turnsUsed);
  const charsLeft = DRAFT_NOTE_MAX_CHARS - noteLength(note);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("plan.draft.title")}
      closeLabel={t("plan.draft.discard")}
      // `lg`: on y monte une SEMAINE — grille, préparations, jours. À `max-w-lg`
      // la grille du plan se lit à travers une meurtrière.
      size="lg"
    >
      {/* ── CE QUI EST VRAI AVANT TOUT LE RESTE ────────────────────────────
          En tête, pas en pied: c'est ce qui rend le reste de cette fenêtre
          sans conséquence, et donc ce qui autorise à essayer. Le lire après
          avoir hésité sur « adopter » serait le lire trop tard. */}
      <p className="text-sm text-ink-soft">{t("plan.draft.not_saved")}</p>

      {/* ── POURQUOI CES JOURS-LÀ ──────────────────────────────────────────
          ⛔ LES PHRASES SONT ASSEMBLÉES CÔTÉ SERVEUR et arrivent FINIES, dans
          la langue du contenu. Cet écran les affiche telles quelles: il ne
          décide ni de leur nombre, ni de leur ordre, ni de leur existence. Un
          miroir de leurs gabarits ici serait une garde en double.

          Vide = il n'y avait rien à expliquer, et ce n'est pas un manque: on
          n'affiche alors AUCUN titre, plutôt qu'une section vide qui ferait
          chercher ce qui manque. */}
      {rationale.length > 0
        ? (
          <Card className="mt-3">
            <SectionLabel>{t("plan.rationale.title")}</SectionLabel>
            <ul className="mt-1 flex flex-col gap-1 pl-4 text-sm leading-6 text-ink-soft">
              {rationale.map((line, i) => (
                // La clé porte l'INDEX: deux phrases peuvent être identiques
                // (deux jours de cuisine nommés pareil), et deux `<li>` de même
                // clé perdent l'un des deux au rendu.
                <li key={`${i}:${line}`} className="break-words">{line}</li>
              ))}
            </ul>
          </Card>
        )
        : null}

      {/* ── LE PLAN, PAR LE RENDU UNIQUE ───────────────────────────────────
          `PlanResult` et pas un rendu d'ici. `today` vient de `startsOn`: un
          brouillon commence au premier jour de SA fenêtre, et lui passer la
          date du navigateur ferait marquer « aujourd'hui » sur une colonne qui
          n'est pas dans le plan — ou sur aucune.

          `tick` et `energy` restent absents: on ne coche pas un plat qui
          n'existe pas, et on ne compte pas l'énergie d'un plan qu'on n'a pas
          adopté. */}
      <div className="mt-4">
        {draft
          ? (
            <PlanResult
              dishes={draft.dishes}
              preparations={draft.preparations}
              cookingSessions={draft.cookingSessions}
              // LOT 1 — le même corps de plan que le validé, courses du jour
              // comprises: l'aperçu doit montrer ce qu'adopter donnerait.
              shoppingList={draft.shoppingList}
              // LOT 3 — les parts et les prénoms du BROUILLON, tels que le
              // serveur les rend (`member_portions` est dans la réponse de
              // `intent: "draft"` alors qu'aucune n'est écrite). C8: l'aperçu
              // doit montrer ce qu'adopter donnerait, séparation par personne
              // comprise.
              //
              // ⛔ AUCUNE GARDE À RECOPIER ICI, ET ELLE N'EST PAS OUBLIÉE: la
              // lane individuelle ne rend AUCUNE part, et un secondaire est
              // toujours routé sur elle (`chooseGenerator` rend `personal` dès
              // `!isOwner`). Un non-maître n'a donc structurellement rien à
              // voir dans ce tableau — il est vide pour lui.
              portions={draft.memberPortions}
              startsOn={draft.startsOn}
              durationDays={draft.durationDays}
              today={draft.startsOn}
              // LOT 1 — L'APERÇU S'OUVRE EN SEMAINE ENTIÈRE: on juge un
              // brouillon en entier avant de l'adopter. Le rail reste là —
              // lire le mardi du brouillon est à un clic. Le plan ADOPTÉ,
              // lui, ouvre sur le jour (le défaut de `PlanResult`).
              defaultView="week"
              fixedIntakes={draft.fixedIntakes}
              dayProperties={draft.dayProperties}
              // LE VIDE DE CETTE FENÊTRE N'EST PAS CELUI DE L'ÉCRAN. « Dis-moi
              // par où commencer ci-dessus » n'a pas de sens ici: il n'y a pas
              // de formulaire au-dessus. On dit ce qui s'est passé.
              emptyLabel={t("plan.refusal.draft_not_composed")}
            />
          )
          // `draft === null` = rien à montrer. Pas de squelette, pas de
          // « chargement »: l'appelant n'ouvre cette fenêtre qu'avec un
          // brouillon, et un vide décoré ferait attendre ce qui ne vient pas.
          : <p className="text-sm text-ink-soft">{t("plan.draft.working")}</p>}
      </div>

      {/* ── CE QUI NE VA PAS ───────────────────────────────────────────────
          SOUS le plan: on ne commente pas ce qu'on n'a pas lu. */}
      <div className="mt-6 border-t border-line pt-4">
        <label
          htmlFor="plan-draft-note"
          className="block text-sm font-semibold text-ink"
        >
          {t("plan.draft.note_label")}
        </label>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          {t("plan.draft.note_hint")}
        </p>

        {/* ⚠️ LE PLAFOND EST DIT MAINTENANT, PAS AU MOMENT DE BUTER DEDANS.
            Trois formes et pas une avec un `{count}`: « Encore 1 reprises »
            est une phrase qu'on ne relit jamais, et zéro n'est pas un compte,
            c'est un état. */}
        <p className="mt-1 text-label text-ink-soft">
          {left === 0
            ? t("plan.draft.turns_none")
            : left === 1
            ? t("plan.draft.turns_one")
            : t("plan.draft.turns_left", { count: left })}
        </p>

        <textarea
          id="plan-draft-note"
          className={`${inputClass} mt-2 min-h-24`}
          value={note}
          placeholder={t("plan.draft.note_placeholder")}
          // ⛔ PAS DE `maxLength`. Le navigateur couperait la phrase EN SILENCE
          // au 280e signe, et la personne enverrait une demande tronquée sans
          // jamais savoir laquelle. On compte, on prévient, le serveur tranche.
          disabled={busyNow || !canAskAgain}
          onChange={(e) => setNote(e.target.value)}
        />

        {/* LE COMPTEUR. Il descend, et il passe au rouge APRÈS le plafond —
            pas avant: une couleur d'alarme sur une phrase encore valable
            apprendrait à ignorer la couleur. */}
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <span
            className={`text-label ${
              noteOverflows(note) ? "text-red-700" : "text-ink-soft"
            }`}
          >
            {t("plan.draft.chars_left", { count: charsLeft })}
          </span>
          {noteOverflows(note)
            ? (
              <span className="text-label text-red-700">
                {t("plan.draft.note_too_long")}
              </span>
            )
            : null}
        </div>

        {/* ── UNE CLAUSE A ÉTÉ ÉCARTÉE, ET IL FAUT QUE ÇA SE VOIE ──────────
            LE FAIT, JAMAIS LE MOTIF. « Une partie n'a pas été reprise » suffit
            à ne pas laisser croire qu'on a été entendu sur tout; nommer la
            raison dirait à quelqu'un qu'il est sous plancher TCA.
            🔴 Cette phrase ne s'affiche jamais aujourd'hui: le serveur ne rend
            pas encore ce compte (voir la prop `droppedClauses`). */}
        {droppedClauses > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t("plan.draft.note_partial")}
            </p>
          )
          : null}

        {/* ⛔ LE ROUGE RESTE: famille « échec » du produit, et un motif nommé
            est un FAIT. `note_unusable` est le seul refus que la personne peut
            réparer elle-même — en reformulant — donc il se lit ici, sous le
            champ qu'il concerne, jamais ailleurs. */}
        {failure
          ? <p className="mt-2 text-sm leading-6 text-red-700 break-words">{failure}</p>
          : null}

        {/* ── LES DEUX GESTES ─────────────────────────────────────────────
            `flex-wrap`: à 320 px deux boutons côte à côte débordent, et un
            bouton hors écran est un bouton absent. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={busyNow || !canAskAgain || !hasNote(note)}
            onClick={async () => {
              setWorking(true);
              setFailure(null);
              try {
                await onRemix(note);
                // LE TOUR SE COMPTE APRÈS L'APPEL, jamais avant: un refus
                // d'entrée (`note_unusable`, rendu en moins d'un dixième de
                // seconde et sans appel modèle) ne doit pas coûter une reprise.
                // Rien n'a été composé, donc rien n'a été consommé.
                setTurnsUsed((n) => n + 1);
                // La phrase a servi: le champ se vide pour la suivante. La
                // garder ferait repartir la reprise d'après avec deux demandes
                // collées, dont une que la personne croyait derrière elle.
                setNote("");
              } catch (e) {
                setFailure(e instanceof Error ? e.message : String(e));
              } finally {
                setWorking(false);
              }
            }}
          >
            {t("plan.draft.remix")}
          </Button>

          <Button
            variant="primary"
            disabled={busyNow || !draft}
            onClick={async () => {
              setWorking(true);
              setFailure(null);
              try {
                await onAdopt();
              } catch (e) {
                setFailure(e instanceof Error ? e.message : String(e));
              } finally {
                setWorking(false);
              }
            }}
          >
            {busyNow ? t("plan.draft.adopting") : t("plan.draft.adopt")}
          </Button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            🔴 CE QUE « ADOPTER » FAIT VRAIMENT, DIT AVANT LE CLIC.

            Il n'existe AUCUN chemin qui écrive l'aperçu tel quel: le seul
            écrivain est la RPC `write_student_meal_plan`, dont l'`EXECUTE` est
            RÉVOQUÉ à `anon` et `authenticated` (migrations 20260807090000,
            20260811080000, 20260811140000), et aucune fonction edge n'accepte
            un plan déjà composé. Adopter RECOMPOSE donc, à partir de la même
            demande et de la même phrase.

            Le taire ferait montrer un plan et en écrire un autre — le défaut
            que cette fenêtre existe précisément pour empêcher. La phrase est
            donc SOUS le bouton et avant le clic, comme le plafond de tours.
            ══════════════════════════════════════════════════════════════════ */}
        <p className="mt-2 text-label leading-5 text-ink-soft">
          {t("plan.draft.adopt_recomposes")}
        </p>
      </div>
    </Modal>
  );
}
