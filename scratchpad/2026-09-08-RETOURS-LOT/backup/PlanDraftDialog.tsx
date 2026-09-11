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
import { useMealEnergy } from "../../lib/useMealEnergy";
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
   * CE QUE LE PLAN A DÛ PESER — écrit par le MODÈLE, gardé côté serveur.
   *
   * ⚠️ REQUISE ET NULLABLE-PAR-LE-VIDE, jamais optionnelle: un `?` rendrait le
   * bloc invisible chez tout appelant qui l'oublie, et un bloc absent est
   * indiscernable d'un modèle qui n'écrit rien. `[]` se dit, et se dit en
   * silence à l'écran (aucun titre au-dessus du vide).
   */
  explanation: readonly string[];
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
  /**
   * ⟳ 2026-09-08 — L'IDENTIFIANT DE L'APERÇU RANGÉ (`DraftEnvelope.draftId`).
   *
   * ⛔ REQUIS, jamais `?`. Les deux sites de montage doivent le passer
   * explicitement — un champ facultatif aurait laissé l'un des deux sans
   * chiffres pendant que l'autre en a, et personne ne l'aurait vu.
   *
   * `null` = le serveur n'a rien rangé (panne de magasin, réponse d'avant ce
   * lot). L'aperçu s'affiche alors sans ses chiffres.
   */
  draftId: string | null;
}

export default function PlanDraftDialog(props: PlanDraftDialogProps) {
  const {
    open,
    onClose,
    draft,
    rationale,
    explanation,
    droppedClauses,
    onRemix,
    onAdopt,
    busy,
    draftId,
  } =
    props;

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-08 — LE CHIFFRE SUR L'APERÇU
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE COMPOSANT NE DÉCIDE PAS DU DROIT DE VOIR, et il ne l'a jamais fait.
  // `useMealEnergy` appelle `meal-energy-v1`, qui traverse les quatre portes
  // (plancher TCA, âge, doctrine du coach, interrupteur) AVANT de lire un seul
  // plat. Quand une porte est fermée, il n'y a rien à cacher ici: l'appelant
  // n'a aucune donnée à passer.
  //
  // ⚠️ `planId: null` PARCE QU'UN APERÇU N'EN A PAS. Le brouillon est rangé
  // sous son propre identifiant (`student_meal_drafts`), et c'est LUI qu'on
  // demande.
  const energy = useMealEnergy({
    planId: null,
    draftId,
    dishes: draft?.dishes ?? [],
  });

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
  /**
   * LE REFUS, ET L'ENDROIT OÙ IL DOIT SE LIRE.
   *
   * ⚠️ CE N'EST PLUS UNE SIMPLE CHAÎNE, ET C'EST LA CONSÉQUENCE DU SECOND
   * BOUTON. « Adopter » existe maintenant DEUX fois — au fronton et au pied —
   * et un message d'échec rendu au pied après un clic au fronton se lit comme
   * un bouton mort: on clique, la fenêtre ne bouge pas, la phrase qui explique
   * est une semaine de défilement plus bas. Ce dépôt a déjà payé ce défaut
   * trois fois sur `SetupPage`.
   *
   * `at` dit donc DEPUIS OÙ, et le message se rend là. Une seule chaîne à la
   * fois: on n'affiche jamais le même refus aux deux endroits.
   */
  const [failure, setFailure] = React.useState<
    { at: "header" | "body"; message: string } | null
  >(null);

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

  /**
   * ADOPTER — LE MÊME CHEMIN, D'OÙ QU'ON CLIQUE.
   *
   * ⛔ EXTRAIT EXPRÈS, PAS DUPLIQUÉ. Les deux boutons appellent CE
   * gestionnaire; deux `onClick` écrits séparément auraient divergé au premier
   * correctif, et c'est celui qu'on regarde le moins qui aurait gardé l'ancien
   * comportement. `onAdopt` reste l'unique écrivain.
   */
  const runAdopt = async (at: "header" | "body") => {
    setWorking(true);
    setFailure(null);
    try {
      await onAdopt();
    } catch (e) {
      setFailure({ at, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setWorking(false);
    }
  };

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
      /* ══════════════════════════════════════════════════════════════════
         ⛔ ON NE SORT D'ICI QUE PAR « LAISSER TOMBER » — 2026-09-07.
         ══════════════════════════════════════════════════════════════════

         Ni le voile, ni Échap. Signalé à l'écran sur l'entonnoir: « quand tu
         cliques ou que tu fais un mouvement d'écran, ça supprime l'aperçu ».

         ⚠️ CE QUI REND CE DÉFAUT CHER, ET C'EST PROPRE À CETTE FENÊTRE-CI.
         Refermer ne range rien: aucun écran ne rouvre un brouillon
         (`setDraftOpen(true)` n'a qu'un appelant, le chemin de composition).
         Y revenir COÛTE UN TOUR DE MODÈLE, et l'effet d'ouverture juste
         au-dessus remet `turnsUsed` à 1 — donc le geste involontaire ne perd
         pas un affichage, il perd la génération ET les reprises qui restaient.

         ⛔ C'EST BIEN UN RENONCEMENT, ET LE MOT LE DIT DÉJÀ. `closeLabel` est
         « Laisser tomber », pas « Fermer »: la sortie de cette fenêtre est une
         décision, et une décision ne se prend pas en relâchant la souris à
         côté. Le motif complet, avec ce que ça coûte côté clavier, est sur
         `closeOnlyByButton` dans `ui/Modal.tsx`. */
      closeOnlyByButton
      /* ── ADOPTER SANS AVOIR À DESCENDRE ───────────────────────────────
         Demandé le 2026-09-01, et c'est un défaut mesurable: cette fenêtre
         monte une SEMAINE — grille, préparations, courses. La décision
         n'existait qu'en pied, donc l'accepter demandait de faire défiler
         tout ce qu'on venait déjà de juger. Le fronton, lui, ne défile pas.

         ⛔ PAS UN SECOND CHEMIN: `runAdopt` est le même gestionnaire que le
         bouton du pied, et `onAdopt` reste l'unique écrivain. Le libellé est
         la MÊME clé — deux mots différents pour un seul geste feraient croire
         à deux gestes.

         ⚠️ CE QUE « ADOPTER » FAIT est dit en haut du corps (juste dessous)
         comme il l'est en pied: un raccourci ne doit pas faire l'économie de
         l'avertissement. */
      headerAction={
        <Button
          variant="primary"
          size="sm"
          disabled={busyNow || !draft}
          onClick={() => void runAdopt("header")}
        >
          {busyNow ? t("plan.draft.adopting") : t("plan.draft.adopt")}
        </Button>
      }
      // `lg`: on y monte une SEMAINE — grille, préparations, jours. À `max-w-lg`
      // la grille du plan se lit à travers une meurtrière.
      size="lg"
    >
      {/* ── CE QUI EST VRAI AVANT TOUT LE RESTE ────────────────────────────
          En tête, pas en pied: c'est ce qui rend le reste de cette fenêtre
          sans conséquence, et donc ce qui autorise à essayer. Le lire après
          avoir hésité sur « adopter » serait le lire trop tard. */}
      <p className="text-sm text-ink-soft">{t("plan.draft.not_saved")}</p>

      {/* ⚠️ LA MÊME PHRASE QU'EN PIED, ET LA RÉPÉTITION EST VOULUE.
          `adopt_recomposes` est posée sous CHAQUE bouton « adopter », parce
          qu'elle doit être à l'écran avant le clic — et les deux ne sont jamais
          en vue en même temps: celle-ci est au-dessus du plan, l'autre en
          dessous. La retirer d'ici rendrait le raccourci du fronton silencieux
          sur ce qu'il fait vraiment. */}
      <p className="mt-1 text-label leading-5 text-ink-soft">
        {t("plan.draft.adopt_recomposes")}
      </p>

      {/* LE REFUS DU BOUTON DU HAUT, SOUS LE BOUTON DU HAUT. Le fronton ne
          défile pas, donc cette ligne est visible d'où qu'on ait cliqué en
          haut. `role="alert"`: elle apparaît APRÈS le clic, et sans région
          annoncée un lecteur d'écran n'apprendrait jamais que ça a échoué. */}
      {failure?.at === "header"
        ? (
          <p role="alert" className="mt-2 text-sm leading-6 text-red-700 break-words">
            {failure.message}
          </p>
        )
        : null}

      {/* ══════════════════════════════════════════════════════════════════
          LES CHOIX DE SOPHIA — et pourquoi ce bloc est AU-DESSUS de l'autre.
          ══════════════════════════════════════════════════════════════════
          Ces lignes-ci sont écrites par le MODÈLE, sur les arbitrages qu'il a
          dû prendre en composant: une envie qui tire contre une direction, un
          plat demandé qui porte un aliment qu'une bouche évite. Celles du bloc
          suivant sont des GABARITS déterministes sur le calendrier et les
          courses.

          ⛔ AU-DESSUS, ET C'EST UNE DÉCISION. La prose du modèle EST
          l'explication que la personne cherche; les phrases fixes sont son
          plancher — vraies quoi qu'il arrive, y compris quand la garde a tout
          jeté. Mettre le plancher en premier ferait lire l'explication comme
          une note de bas de page.

          ⛔ ET ELLES NE SE CONTREDISENT PAS PAR CONSTRUCTION, pas par leur
          ordre: le serveur donne au modèle, AVANT la génération, les faits déjà
          tranchés (fenêtre, sessions, jours hors de portée) et lui dit que
          l'app les redit en phrases fixes sous son texte. Une annotation ne se
          rattache pas à un texte par la proximité — cicatrice payée deux fois
          ici.

          Vide = il n'y avait rien à arbitrer, OU la garde a refusé le bloc. Les
          deux se rendent pareil: aucun titre au-dessus du vide. Le serveur, lui,
          les compte séparément. */}
      {explanation.length > 0
        ? (
          <Card className="mt-3">
            <SectionLabel>{t("plan.explanation.title")}</SectionLabel>
            <ul className="mt-1 flex flex-col gap-1 pl-4 text-sm leading-6 text-ink-soft">
              {explanation.map((line, i) => (
                <li key={`${i}:${line}`} className="break-words">{line}</li>
              ))}
            </ul>
          </Card>
        )
        : null}

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

          `tick` reste absent: on ne coche pas un plat qui n'existe pas.

          ⟳ 2026-09-08 — `energy`, LUI, EST LÀ. Ce commentaire disait « on ne
          compte pas l'énergie d'un plan qu'on n'a pas adopté », et c'était une
          contrainte TECHNIQUE déguisée en règle: le chiffre se calcule à la
          lecture, depuis une ligne en base, et un aperçu n'en avait aucune. Le
          brouillon est désormais RANGÉ (`student_meal_drafts`) et porte un
          identifiant — il se chiffre comme un plan, sous exactement les mêmes
          quatre portes. C'est même le moment où le chiffre sert le plus:
          l'aperçu est ce qu'on relit AVANT d'adopter. */}
      <div className="mt-4">
        {draft
          ? (
            <PlanResult
              // ⟳ A1 (2026-09-03) — LE TIMING, DIT PAR LE SERVEUR. Il vit
              // sur la ligne (`generated_from.timing`) et à la racine de la
              // réponse; l'écran le RÉPÈTE et ne le recalcule jamais — le
              // navigateur ne connaît pas l'heure.
              timing={draft.timing}
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
              // ⛔ LES TROIS MÊMES EXPRESSIONS QUE `MealBuilder`, ET PAS DES
              // VOISINES. `boxEnergy` n'est PAS gardé par `showing`: le chiffre
              // d'une boîte à un nom sort aussi quand le LECTEUR est fermé par
              // défaut (maintenance, rien choisi) — le serveur a déjà tranché
              // qui y a droit, et `forBox` ne fait que lire ce qui a voyagé.
              // Recopier ce raisonnement de travers ici rendrait un chiffre à
              // quelqu'un sur l'aperçu et pas sur le plan, ou l'inverse.
              energy={energy.showing ? ((dish) => energy.forDish(dish)) : undefined}
              boxEnergy={energy.hasBoxEnergy ? ((id) => energy.forBox(id)) : undefined}
              dayEnergy={energy.showing ? ((day) => energy.forDay(day)) : undefined}
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
        {failure?.at === "body"
          ? (
            <p className="mt-2 text-sm leading-6 text-red-700 break-words">
              {failure.message}
            </p>
          )
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
                // `at: "body"` — la phrase refusée est DANS ce champ-ci, et le
                // motif se lit sous lui. Jamais au fronton, qui ne porte pas
                // ce geste.
                setFailure({
                  at: "body",
                  message: e instanceof Error ? e.message : String(e),
                });
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
            onClick={() => void runAdopt("body")}
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
