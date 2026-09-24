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
 * C'est ce qui autorise à refaire. ⟳ 2026-09-20: la phrase qui le DISAIT
 * (`plan.draft.not_saved`) a été retirée de l'écran sur demande — la
 * propriété, elle, n'a pas bougé d'un octet.
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

import type { GeneratedDish, GeneratedMealResult } from "../../api/mealGeneration";
import {
  canRemix,
  DISH_REPLACE_MAX,
  type DishRejection,
  dishTitleKey,
  DRAFT_NOTE_MAX_CHARS,
  draftTurnsLeft,
  type DraftEdit,
  type DraftProgress,
  hasNote,
  type NoteAnswer,
  type NoteCell,
  noteIsExclusionOnly,
  NOTE_QUESTIONS_MAX,
  type NoteQuestion,
  noteLength,
  noteOverflows,
  type NoteOutcome,
} from "../../api/planDraft";
import { useMealEnergy } from "../../lib/useMealEnergy";
import { t } from "../../i18n/t";
import { planFailureKey } from "../../copy/planRefusals";
import { Button } from "../ui/Button";
import { Card, SectionLabel } from "../ui/Card";
import { inputClass } from "../ui/Field";
import Modal from "../ui/Modal";
import { type DishReplaceControl } from "../DishCard";
import ComposingLabel from "./ComposingLabel";
import NoteQuestionsLayer from "./NoteQuestionsLayer";
import PlanResult from "./PlanResult";
import ReplaceReasonLayer from "./ReplaceReasonLayer";

export interface PlanDraftDialogProps {
  open: boolean;
  onClose: () => void;
  /** Le brouillon rendu par le serveur. `null` = rien à montrer. */
  draft: GeneratedMealResult | null;
  /* ⛔ `rationale` A ÉTÉ RETIRÉE DE CETTE INTERFACE — 2026-09-09, avec la
     carte qu'elle nourrissait (voir la pierre tombale dans le corps). Elle vit
     toujours sur `DraftEnvelope`: c'est la SURFACE qui est partie, pas le
     champ que le serveur rend. */
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
  /**
   * ⟳ 2026-09-08 (lot 4) — LA REPRISE EN TROIS GESTES, ET C'EST LE DIALOGUE
   * QUI LES ENCHAÎNE. Lire la phrase (`onReadNote`: elle est APPLIQUÉE —
   * goût, appétit, réglage — et dite); si le serveur ne sait pas la bouche
   * d'une part, il rend une QUESTION, posée ici avec un bouton par bouche
   * (`onAnswerNote`); puis composer SANS la phrase (`onCompose`), le magasin
   * portant déjà son effet.
   *
   * ⛔ LES TROIS SONT REQUIS, jamais `?`. Un site de montage qui en oublierait
   * un aurait un bouton mort sans un mot du compilateur.
   *
   * ⚠️ POURQUOI PAS DANS LA PAGE: c'est ce champ-ci qui porte la phrase et
   * qui compte les tours; une question posée entre deux gestes appartient à
   * l'écran qui les fait, pas à celui qui les monte. Une page qui composerait
   * d'elle-même après la lecture composerait avant la réponse — pour la
   * mauvaise assiette.
   */
  onReadNote: (note: string) => Promise<NoteOutcome>;
  onAnswerNote: (answer: NoteAnswer) => Promise<NoteOutcome>;
  onCompose: () => Promise<void>;
  /**
   * ⟳ 2026-09-09 (chirurgie locale, pièce 4) — LE QUATRIÈME GESTE. Quand la
   * phrase désigne une case et qu'un brouillon est rangé (`draftId`), on ne
   * recompose pas : on refait cette case seulement. REQUIS, jamais `?`.
   */
  onEditCells: (draftId: string, cells: ReadonlyArray<NoteCell>) => Promise<void>;
  /**
   * ⟳ 2026-09-24 — LE CINQUIÈME GESTE. La note n'a rangé QUE des exclusions
   * (« je n'aime pas le tofu ») et un brouillon est rangé : le serveur refait
   * seulement les plats qui contiennent l'aliment, le reste ne bouge pas
   * (`editExclusions`). REQUIS, jamais `?`.
   */
  onEditExclusions: (draftId: string) => Promise<void>;
  /**
   * ⟳ 2026-09-24 — « REMPLACER », EN DEUX GESTES, ENCHAÎNÉS ICI.
   *
   * `onReadRejections` envoie les raisons des plats barrés à la lecture de
   * note (mode « plats refusés »): le serveur range la liste des plats refusés
   * et classe chaque raison — il peut rendre des QUESTIONS, posées en couche.
   * Puis `onReplaceDishes` refait ces plats-là, et seulement eux.
   *
   * ⛔ LES DEUX SONT REQUIS, jamais `?`: un site de montage qui en oublierait un
   * aurait un « Ajuster le plan » mort sans un mot du compilateur.
   */
  onReadRejections: (
    draftId: string,
    rejections: ReadonlyArray<DishRejection>,
  ) => Promise<NoteOutcome>;
  onReplaceDishes: (
    draftId: string,
    rejections: ReadonlyArray<DishRejection>,
  ) => Promise<void>;
  /** Ce que la dernière reprise locale a pris et laissé (`envelope.edit`). REQUIS. */
  edit: DraftEdit | null;
  /** Écrit le plan pour de bon. */
  onAdopt: () => Promise<void>;
  /**
   * ⟳ 2026-09-21 — LE LIBELLÉ DU GESTE QUI ÉCRIT, quand il REMPLACE un plan
   * (« Remplacer mon plan par celui-ci ») plutôt qu'il n'en prépare un.
   * Absent = « Adopter ce plan ».
   */
  adoptLabel?: string;
  /** Une composition est en cours. */
  busy: boolean;
  /**
   * ⟳ 2026-09-21 — OÙ EN EST LA COMPOSITION, quand c'est « Ajuster le plan »
   * qui travaille. `null` = la page ne la suit pas encore; le bouton retombe
   * alors sur les phrases minutées de `ComposingLabel`, qui restent vraies
   * sans être mesurées.
   *
   * ⛔ LA PAGE LA COLLECTE, CE DIALOGUE NE FAIT QUE LA RENDRE. Il n'a pas
   * l'identifiant de la ligne et ne relit rien: le suivi vit là où le
   * `composeDraft` est lancé.
   */
  progress?: DraftProgress | null;
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

/**
 * « fri/dinner » → « vendredi soir ». Les libellés viennent du catalogue
 * (`day.long.*`, `slot.*`), jamais d'une table écrite ici ; un jeton inconnu
 * se rend tel quel plutôt qu'en mot inventé.
 */
function cellLabel(key: string, t: (k: string) => string): string {
  const [day, slot] = key.split("/");
  const dayLabel = day ? t(`day.long.${day}`) : "";
  const slotLabel = slot ? t(`slot.${slot}`).toLowerCase() : "";
  // Une clé absente du catalogue ressort telle quelle (« day.long.xyz ») : on
  // la jette et on rend le jeton brut plutôt qu'un chemin de catalogue.
  return [dayLabel, slotLabel].filter((x) => x && !x.startsWith("day.") && !x.startsWith("slot.")).join(" ") || key;
}

/**
 * LE MOTIF NOMMÉ, TRADUIT — LE MÊME GESTE QUE DANS `MealBuilder`.
 *
 * ⛔ MESURÉ LE 2026-09-14, SUR L'ÉCRAN RÉEL. Les trois `setFailure` de ce
 * fichier posaient `e.message` tel quel, et une adoption dont le délai client
 * a expiré affichait au pied du dialogue, en anglais et avec le nom de code
 * interne: « [keel/planDraft] Failed to send a request to the Edge Function ».
 * La source est bouchée (`refusalOf` dans `planDraft.ts`), mais un jeton sans
 * traduction resterait un code brut sur un écran — donc il se traduit ICI.
 *
 * ⚠️ UN JETON INCONNU RESSORT TEL QUEL, comme partout ailleurs: taire ce
 * qu'on ne sait pas nommer donnerait un bouton mort.
 */
function failureText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const key = planFailureKey(raw.split(":")[0]);
  return key ? t(key) : raw;
}

export default function PlanDraftDialog(props: PlanDraftDialogProps) {
  const {
    open,
    onClose,
    draft,
    explanation,
    droppedClauses,
    onReadNote,
    onAnswerNote,
    onCompose,
    onEditCells,
    onEditExclusions,
    onReadRejections,
    onReplaceDishes,
    edit,
    onAdopt,
    adoptLabel,
    busy,
    progress = null,
    draftId,
  } = props;

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
   * ⟳ 2026-09-20 — LA ZONE D'ÉCRITURE NE S'OUVRE QUE SUR DEMANDE.
   *
   * Elle était toujours dépliée, sous un titre (« Ce qui ne va pas ») et
   * deux lignes d'explication — donc un formulaire posé sous le plan pour
   * tout le monde, y compris pour qui vient juste adopter. « Ajuster le
   * plan » l'ouvre; le geste de la barre devient alors « Valider ».
   *
   * ⛔ ELLE NE SE REFERME PAS TOUTE SEULE APRÈS UN ENVOI, et c'est délibéré:
   * ce qui suit l'envoi (« J'ai noté : … », une question, un refus) se rend
   * DANS ce bloc. Le replier emporterait la réponse avec la question.
   */
  const [noteOpen, setNoteOpen] = React.useState(false);
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
  /**
   * ⟳ 2026-09-21 — CE QUI TRAVAILLE, ET PAS SEULEMENT « QUELQUE CHOSE ».
   *
   * ── LE DÉFAUT, VU À L'ÉCRAN ────────────────────────────────────────────
   * Un seul booléen servait les TROIS gestes (la reprise, la réponse à une
   * question, l'adoption). Cliquer « Ajuster le plan » allumait donc le bouton
   * d'ADOPTION, qui affichait « Enregistrement… » pendant deux minutes —
   * c'est-à-dire un mot FAUX: un ajustement recompose, il n'enregistre rien.
   * Et le bouton qui travaillait vraiment ne disait rien.
   *
   * ⛔ `"adjusting"` COUVRE AUSSI LA RÉPONSE À UNE QUESTION, et c'est exact:
   * elle se termine par `renderNow`, donc par une composition. C'est le même
   * geste, en deux temps.
   */
  const [working, setWorking] = React.useState<
    "adjusting" | "adopting" | null
  >(null);
  /**
   * ⟳ 2026-09-08 (lot 4) — CE QUE LA PHRASE A FAIT, ET CE QU'ELLE DEMANDE.
   * Vit ICI, avec le champ: c'est l'issue de la DERNIÈRE phrase, et elle
   * s'efface avec la fenêtre. `questions` non vide = on attend un tap avant
   * de composer. `declined` compte les questions passées sans réponse, pour
   * le dire (« je n'ai rien changé pour cette phrase-là ») plutôt que se taire.
   */
  const [noteOutcome, setNoteOutcome] = React.useState<NoteOutcome | null>(null);
  const [declined, setDeclined] = React.useState(0);
  /**
   * ⟳ 2026-09-24 — LES PLATS BARRÉS (« Remplacer »), PAR CLÉ DE TITRE.
   *
   * Barrer un plat barre TOUTES ses occurrences: la clé est le titre affiché
   * (`dishTitleKey`: espaces repliés, minuscules, accents gardés — la même
   * règle que le serveur). Vide = le chemin d'avant, inchangé.
   *
   * ⚠️ L'UN OU L'AUTRE (décision du 2026-09-24): dès qu'un plat est barré,
   * « Adopter » et la zone de commentaire disparaissent, et « Ajuster le
   * plan » ne remplace QUE les plats barrés.
   */
  const [rejected, setRejected] = React.useState<ReadonlyMap<string, { title: string; reason: string }>>(
    () => new Map(),
  );
  /** Le plat dont on écrit la raison (la couche est ouverte), ou `null`. */
  const [reasonFor, setReasonFor] = React.useState<{ key: string; title: string } | null>(null);
  const [reasonDraft, setReasonDraft] = React.useState("");
  /**
   * ⟳ 2026-09-24 — LES QUESTIONS DE PRÉCISION, POSÉES EN COUCHE, et ce qui
   * part une fois qu'elles sont répondues: la composition de la note
   * (`"note"`), ou le remplacement des plats barrés. `seq` remonte la couche
   * à neuf pour chaque série — ses cases cochées ne passent pas d'une série à
   * l'autre.
   */
  const [asking, setAsking] = React.useState<
    {
      questions: ReadonlyArray<NoteQuestion>;
      overflow: number;
      outcome: NoteOutcome;
      then: "note" | { draftId: string; rejections: ReadonlyArray<DishRejection> };
      seq: number;
    } | null
  >(null);
  const askSeq = React.useRef(0);
  /**
   * ⟳ 2026-09-24 — CE QUE LE DERNIER « AJUSTER » A FAIT: une note, ou des
   * plats remplacés — les phrases de repli d'une note (« rien trouvé à
   * changer ») seraient fausses sous un remplacement.
   */
  const [channel, setChannel] = React.useState<"note" | "replace">("note");
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
    setNoteOutcome(null);
    setDeclined(0);
    setRejected(new Map());
    setReasonFor(null);
    setAsking(null);
    setChannel("note");
  }, [open]);

  // ⟳ 2026-09-24 — UN AUTRE BROUILLON, D'AUTRES PLATS: les plats barrés
  // tombent quand le brouillon change (remplacement réussi, recomposition).
  // Un remplacement REFUSÉ ne change pas de brouillon: les plats restent
  // barrés, et on peut relancer.
  React.useEffect(() => {
    setRejected(new Map());
    setReasonFor(null);
  }, [draftId]);

  /**
   * COMPOSER, ET COMPTER LE TOUR APRÈS. Un tour est une COMPOSITION, pas une
   * lecture: lire la phrase (4 s, sans plan) ou répondre à une question ne
   * coûte rien de ce que le plafond protège. Le tour se compte après l'appel,
   * jamais avant: un refus n'a rien composé, donc rien consommé.
   */
  /**
   * ⟳ 2026-09-24 — UN SEUL COMPTEUR DE TOURS pour tous les chemins qui
   * composent (recomposition, reprise de case, reprise par exclusion,
   * remplacement de plats): un tour est une composition, d'où qu'elle parte.
   */
  const countTurn = () => setTurnsUsed((n) => n + 1);

  const composeNow = async () => {
    await onCompose();
    countTurn();
  };

  /**
   * ⟳ 2026-09-09 — REFAIRE SEULEMENT LA CASE, OU TOUT. Une case désignée ET un
   * brouillon rangé ⇒ reprise locale (un tour, comme une composition). Sinon
   * ⇒ composition. Mesuré : recomposer ne garde RIEN ; c'est pour ça que la
   * case passe par un autre chemin.
   */
  const renderNow = async (outcome: NoteOutcome) => {
    if (outcome.cells.length > 0 && draftId !== null) {
      await onEditCells(draftId, outcome.cells);
      countTurn();
      return;
    }
    // ⟳ 2026-09-24 — UNE NOTE QUI N'EST QU'UNE EXCLUSION MODIFIE LE
    // BROUILLON AU LIEU DE LE RECOMPOSER. Recomposer ne gardait rien du plan
    // regardé, pour retirer un aliment.
    if (draftId !== null && noteIsExclusionOnly(outcome)) {
      await onEditExclusions(draftId);
      countTurn();
      return;
    }
    await composeNow();
  };

  /**
   * ⟳ 2026-09-24 — LES QUESTIONS DE PRÉCISION PARTENT EN COUCHE, trois au
   * plus (le serveur plafonne aussi). Rien n'est composé tant qu'elle est
   * ouverte: composer avant la réponse ferait un plan pour la mauvaise
   * assiette.
   */
  const openQuestions = (
    outcome: NoteOutcome,
    then: "note" | { draftId: string; rejections: ReadonlyArray<DishRejection> },
  ) => {
    askSeq.current += 1;
    setAsking({
      questions: outcome.questions.slice(0, NOTE_QUESTIONS_MAX),
      overflow: Math.max(0, outcome.questions.length - NOTE_QUESTIONS_MAX),
      outcome,
      then,
      seq: askSeq.current,
    });
  };

  /**
   * LES RÉPONSES, PUIS LA SUITE DU CANAL.
   *
   * Chaque personne cochée part par la branche `answer` de la lecture de note
   * (sans appel modèle). « Personne de la liste », ou rien de coché, n'écrit
   * rien — et se dit (`question_skipped`).
   *
   * ⚠️ LA NOTE NE RECOMPOSE QUE SI QUELQUE CHOSE A BOUGÉ: une phrase dont
   * l'unique demande a été passée n'a rien changé, et recomposer un plan
   * identique coûterait un tour pour rien. Le REMPLACEMENT, lui, part
   * toujours: les plats barrés restent à remplacer, quelle que soit la
   * réponse.
   */
  const continueAfterQuestions = async (choices: ReadonlyArray<string | null>) => {
    if (asking === null) return;
    const { questions, overflow, outcome, then } = asking;
    setAsking(null);
    setWorking("adjusting");
    setFailure(null);
    try {
      let merged: NoteOutcome = { ...outcome, questions: [] };
      let skipped = overflow;
      for (const [i, question] of questions.entries()) {
        const memberId = choices[i] ?? null;
        if (memberId === null) {
          skipped++;
          continue;
        }
        // ⟳ 2026-09-23 — deux genres de question, un seul geste: la bouche.
        const res = await onAnswerNote(
          question.kind === "portion"
            ? { kind: "portion", memberId, direction: question.direction }
            : { kind: "who", memberId, entry: question.entry },
        );
        merged = { ...merged, announced: [...merged.announced, ...res.announced] };
      }
      setNoteOutcome(merged);
      setDeclined(skipped);
      if (then !== "note") {
        await replaceNow(then.draftId, then.rejections, merged);
        return;
      }
      if (merged.announced.length === 0 && merged.cells.length === 0) return;
      await renderNow(merged);
    } catch (e) {
      setFailure({ at: "body", message: failureText(e) });
    } finally {
      setWorking(null);
    }
  };

  /**
   * ⟳ 2026-09-24 — LES OCCURRENCES DES PLATS BARRÉS, sur le brouillon affiché.
   * Un complément (il complète une assiette commune) n'est jamais barré: le
   * serveur ne sait pas le refaire seul.
   */
  const rejectionsNow = (): DishRejection[] => {
    const out: DishRejection[] = [];
    for (const dish of draft?.dishes ?? []) {
      if (dish.complements_shared === true || !dish.day || !dish.slot) continue;
      const hit = rejected.get(dishTitleKey(dish.title));
      if (!hit) continue;
      out.push({ day: dish.day, slot: dish.slot, memberId: dish.member_id, title: dish.title, reason: hit.reason });
    }
    return out;
  };

  /**
   * REMPLACER — OU TOUT REFAIRE QUAND LA SANTÉ A BOUGÉ.
   *
   * ⛔ UNE ALLERGIE OU UN RÉGIME RANGÉ PAR UNE RAISON VAUT POUR TOUT LE PLAN.
   * Le remplacement ne refait que des plats; une contrainte de santé neuve
   * doit être tenue partout, et c'est la composition entière qui la tient
   * (les plats barrés sont déjà dans la liste des plats refusés: elle ne les
   * reproposera pas).
   */
  const replaceNow = async (
    id: string,
    rejections: ReadonlyArray<DishRejection>,
    outcome: NoteOutcome,
  ) => {
    if (outcome.announced.some((a) => a.kind === "safety")) {
      await composeNow();
      return;
    }
    await onReplaceDishes(id, rejections);
    countTurn();
  };

  /** « Ajuster le plan » quand des plats sont barrés. */
  const runReplace = async () => {
    if (draftId === null) return;
    const rejections = rejectionsNow();
    if (rejections.length === 0) return;
    setChannel("replace");
    setWorking("adjusting");
    setFailure(null);
    try {
      // ① LIRE — la liste des plats refusés est rangée, chaque raison classée.
      const outcome = await onReadRejections(draftId, rejections);
      setNoteOutcome(outcome);
      setDeclined(0);
      // ② UNE QUESTION ? La couche s'ouvre; le remplacement partira au clic.
      if (outcome.questions.length > 0) {
        openQuestions(outcome, { draftId, rejections });
        return;
      }
      // ③ REMPLACER — ces plats-là, et ceux qu'une exclusion neuve viderait.
      await replaceNow(draftId, rejections, outcome);
    } catch (e) {
      setFailure({ at: "body", message: failureText(e) });
    } finally {
      setWorking(null);
    }
  };

  /** « Valider » dans la couche de raison: le plat est barré, partout. */
  const confirmReason = () => {
    if (reasonFor === null || !hasNote(reasonDraft) || noteOverflows(reasonDraft)) return;
    const { key, title } = reasonFor;
    const reason = reasonDraft.trim().replace(/\s+/g, " ");
    setRejected((prev) => new Map(prev).set(key, { title, reason }));
    setReasonFor(null);
    setReasonDraft("");
    // L'UN OU L'AUTRE: un plat barré referme la zone de commentaire (la phrase
    // tapée reste en mémoire, et revient si plus rien n'est barré).
    setNoteOpen(false);
  };

  /**
   * ADOPTER — LE MÊME CHEMIN, D'OÙ QU'ON CLIQUE.
   *
   * ⛔ EXTRAIT EXPRÈS, PAS DUPLIQUÉ. Les deux boutons appellent CE
   * gestionnaire; deux `onClick` écrits séparément auraient divergé au premier
   * correctif, et c'est celui qu'on regarde le moins qui aurait gardé l'ancien
   * comportement. `onAdopt` reste l'unique écrivain.
   */
  const runAdopt = async (at: "header" | "body") => {
    setWorking("adopting");
    setFailure(null);
    try {
      await onAdopt();
    } catch (e) {
      setFailure({ at, message: failureText(e) });
    } finally {
      setWorking(null);
    }
  };

  /** N'IMPORTE QUOI TRAVAILLE — c'est ce qui DÉSARME, et rien d'autre. */
  const busyNow = busy || working !== null;
  /**
   * ⛔ « Enregistrement… » NE SE DIT QUE POUR UNE ÉCRITURE. `busy` (la prop)
   * couvre une composition de la PAGE, et l'ajustement a désormais son propre
   * jeton: ni l'un ni l'autre n'enregistre quoi que ce soit.
   */
  const adopting = working === "adopting";
  /** La recomposition en cours — celle qui dure deux minutes. */
  const adjusting = working === "adjusting";
  const left = draftTurnsLeft(turnsUsed);
  const canAskAgain = canRemix(turnsUsed);
  const charsLeft = DRAFT_NOTE_MAX_CHARS - noteLength(note);

  // ── ⟳ 2026-09-24 · « REMPLACER » ────────────────────────────────────────
  // Les occurrences par titre (un plat en lot revient jusqu'à neuf fois,
  // mesuré): c'est ce qui compte contre le plafond d'un remplacement.
  const occurrences = new Map<string, number>();
  for (const dish of draft?.dishes ?? []) {
    if (dish.complements_shared === true || !dish.day || !dish.slot) continue;
    const key = dishTitleKey(dish.title);
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }
  const struckCount = [...rejected.keys()].reduce((n, key) => n + (occurrences.get(key) ?? 0), 0);
  /** L'UN OU L'AUTRE: au moins un plat barré change le pied et le fronton. */
  const strikeMode = rejected.size > 0;
  /** Un plat de plus dépasserait le plafond: le bouton se grise, et on le dit. */
  const capBlocks = [...occurrences].some(([key, n]) =>
    !rejected.has(key) && struckCount + n > DISH_REPLACE_MAX
  );
  const dishReplace = (dish: GeneratedDish): DishReplaceControl | null => {
    if (dish.complements_shared === true || !dish.day || !dish.slot) return null;
    const key = dishTitleKey(dish.title);
    const hit = rejected.get(key) ?? null;
    return {
      struck: hit === null ? null : { reason: hit.reason },
      canReplace: !busyNow && canAskAgain && draftId !== null &&
        struckCount + (occurrences.get(key) ?? 0) <= DISH_REPLACE_MAX,
      onReplace: () => {
        setReasonDraft("");
        setReasonFor({ key, title: dish.title });
      },
      onKeep: () =>
        setRejected((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        }),
    };
  };
  /**
   * Les plats refaits EN PLUS des barrés, un titre une fois: le serveur les
   * rend par occurrence, et un plat en lot se répète dans la semaine.
   */
  const extendedTitles = [
    ...new Map((edit?.extended ?? []).map((d) => [dishTitleKey(d.title), d.title])).values(),
  ];

  /**
   * ── LES DEUX GESTES, DANS LE PIED DE LA FENÊTRE ─────────────────────────
   *
   * ⛔ ILS Y SONT PARCE QUE `sticky` NE SUFFISAIT PAS, ET C'EST MESURÉ. Posée
   * en `sticky bottom-0` au bas du corps le 2026-09-20, la barre ne collait à
   * rien: un élément collant ne sort jamais de son parent, et ce parent-là
   * commence APRÈS toute la semaine de plats. Il fallait donc défiler jusqu'en
   * bas pour la voir — exactement ce que le lot voulait éviter. Signalé
   * capture à l'appui: « je les vois pas les boutons en bas ».
   *
   * Le pied de `Modal` est le frère du conteneur qui défile: il ne bouge pas,
   * quelle que soit la position dans la liste.
   *
   * ── LE GESTE DE GAUCHE EN A DEUX, ET C'EST LA DEMANDE ───────────────────
   * Fermé, il OUVRE la zone d'écriture (« Ajuster le plan »). Ouvert, il
   * ENVOIE (« Valider »), et il passe en primaire dès qu'il y a quelque chose
   * à envoyer — « bien visible dès que la personne a commencé à taper ».
   *
   * ⚠️ DEUX BOUTONS, JAMAIS TROIS. À 320 px, trois débordent, et un bouton
   * hors écran est un bouton absent.
   */
  /**
   * Y A-T-IL QUELQUE CHOSE À DIRE SOUS LE PLAN ? — ⟳ 2026-09-21.
   *
   * Tous les enfants de ce bloc sont conditionnels. Sans cette sentinelle, il
   * rendrait son trait de séparation et ses 24 px de marge au-dessus de RIEN,
   * dans le cas nominal — une gouttière sous un plan se lit comme un bloc qui
   * n'a pas fini de charger.
   *
   * ⚠️ ELLE SUR-APPROXIME, ET C'EST LA BONNE DIRECTION: `noteOutcome !== null`
   * suffit, parce qu'une issue sans rien à annoncer rend quand même une des
   * deux phrases de repli (« je n'ai rien trouvé à changer », « je ne sais pas
   * encore le régler d'ici »). Se tromper dans l'autre sens masquerait une
   * réponse.
   */
  const bodyNotice = droppedClauses > 0 || noteOutcome !== null ||
    edit !== null || failure?.at === "body";

  const footerActions = (
    /* ══════════════════════════════════════════════════════════════════════
       ⟳ 2026-09-21 — LE CHAMP EST DANS LE PIED, ET SON GESTE EST À CÔTÉ
       ══════════════════════════════════════════════════════════════════════

       Deux demandes du même message, et elles tiennent ensemble:
         · « la partie commentaire qui s'ouvre quand on clique sur ajuster,
           c'est dans l'élément fixé » — elle était tout en bas du corps, donc
           derrière une semaine de plats;
         · « pas en bas à côté de valider le plan, ça prête à confusion » — le
           geste d'envoi partageait sa ligne avec « Remplacer mon plan par
           celui-ci ». Deux boutons voisins dont l'un écrit et l'autre non.

       Le champ prend donc sa ligne, avec SON bouton au bout; l'adoption garde
       la sienne, en dessous et à droite.

       ⛔ LE BOUTON D'ENVOI DIT « AJUSTER LE PLAN », LA MÊME CLÉ QUE CELUI QUI
       OUVRE (`plan.draft.remix`). Ce n'est pas un doublon: les deux ne sont
       JAMAIS à l'écran en même temps, et c'est le même geste en deux temps.
       « Valider » (`note_send`) a été retiré — à côté de « Remplacer mon plan
       par celui-ci », deux mots de validation pour deux effets différents. */
    /* ⟳ 2026-09-24 — DES PLATS BARRÉS: UN SEUL GESTE. Ni adoption, ni zone
       de commentaire (l'un ou l'autre): « Ajuster le plan » remplace les plats
       barrés, et rien d'autre. Le compte des reprises reste dit. */
    strikeMode
      ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-label text-ink-soft">
              {left === 0
                ? t("plan.draft.turns_none")
                : left === 1
                ? t("plan.draft.turns_one")
                : t("plan.draft.turns_left", { count: left })}
            </span>
            <span className="text-label text-ink-soft">
              {struckCount === 1
                ? t("plan.draft.struck_one")
                : t("plan.draft.struck_many", { count: struckCount })}
            </span>
          </div>
          {capBlocks && (
            <p className="text-label text-ink-soft">
              {t("plan.draft.struck_cap", { max: DISH_REPLACE_MAX })}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={busyNow || !canAskAgain || draftId === null}
              onClick={() => void runReplace()}
            >
              {adjusting
                ? <ComposingLabel progress={progress} />
                : t("plan.draft.remix")}
            </Button>
          </div>
        </div>
      )
      : noteOpen
      ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            {/* ⛔ `min-w-0` AVEC `flex-1`, ET CE N'EST PAS DÉCORATIF: un enfant
                de flex refuse par défaut d'être plus étroit que son contenu
                (`min-width: auto`), donc le champ pousserait son bouton hors
                du pied à 320 px. Cicatrice `flex-child-min-width-auto`. */}
            <textarea
              id="plan-draft-note"
              className={`${inputClass} min-h-16 min-w-0 flex-1`}
              rows={2}
              value={note}
              placeholder={t("plan.draft.note_placeholder")}
              // ⛔ PAS DE `maxLength`. Le navigateur couperait la phrase EN
              // SILENCE au 280e signe, et la personne enverrait une demande
              // tronquée sans jamais savoir laquelle. On compte, on prévient,
              // le serveur tranche.
              disabled={busyNow || !canAskAgain}
              onChange={(e) => setNote(e.target.value)}
            />
            {/* ⛔ LA CONDITION DE `disabled` TIENT SUR UNE LIGNE, et ce n'est
                pas de la mise en forme: `planDraftQuestion.int.test.ts` lit la
                source pour prouver qu'une question ouverte ferme la reprise.
                Coupée en deux, la garde est intacte et le test la déclare
                absente. */}
            <Button
              variant={hasNote(note) ? "primary" : "secondary"}
              disabled={busyNow || !canAskAgain || !hasNote(note)}
          onClick={async () => {
            setChannel("note");
            setWorking("adjusting");
            setFailure(null);
            try {
              // ① LIRE — la phrase est appliquée et dite. Un refus d'entrée
              // (`note_unusable`, sans appel modèle) lève ici, avant tout.
              const outcome = await onReadNote(note);
              setNoteOutcome(outcome);
              setDeclined(0);
              // ② UNE QUESTION ? On s'arrête là: le tap composera. Aucun
              // tour consommé — rien n'a été composé.
              //
              // ⛔ LE CHAMP SE VIDE ICI AUSSI: la phrase a été LUE, donc
              // appliquée. La garder ferait repartir la reprise d'après avec
              // deux demandes collées, dont une que la personne croyait
              // derrière elle.
              if (outcome.questions.length > 0) {
                openQuestions(outcome, "note");
                setNote("");
                return;
              }
              // ③ REFAIRE — la case seule si la phrase en désigne une et
              // qu'un brouillon est rangé, sinon tout. Le tour se compte après.
              await renderNow(outcome);
              // ══════════════════════════════════════════════════════════
              // ⟳ 2026-09-21 — LE CHAMP SE VIDE **APRÈS** LA COMPOSITION
              // ══════════════════════════════════════════════════════════
              //
              // Il se vidait juste après la lecture, donc AVANT les deux
              // minutes de recomposition: le placeholder revenait pendant
              // l'attente, et la personne ne voyait plus ce qu'elle venait de
              // demander. Signalé sur capture: « il faut pas que ce soit le
              // placeholder qui soit affiché après avoir cliqué sur ajuster le
              // plan, mais plutôt ce qui a été réellement écrit ».
              //
              // ⛔ ET SURTOUT PAS DANS LE `finally`. Un refus (`note_unusable`,
              // ou une composition qui échoue) doit LAISSER la phrase: c'est
              // le seul refus que la personne peut réparer elle-même, en
              // reformulant, et vider le champ la ferait retaper. Le `catch`
              // ci-dessous ne vide donc rien, et c'est voulu.
              setNote("");
            } catch (e) {
              // `at: "body"` — la phrase refusée est DANS ce champ-ci, et le
              // motif se lit sous lui. Jamais au fronton, qui ne porte pas
              // ce geste.
              setFailure({ at: "body", message: failureText(e) });
            } finally {
              setWorking(null);
            }
          }}
            >
              {/* ⛔ C'EST CE BOUTON-CI QUI TOURNE, ET IL LE DIT. Il envoyait sa
                  phrase puis restait muet deux minutes pendant que le bouton
                  d'adoption affichait « Enregistrement… » — le mauvais bouton,
                  et le mauvais mot. */}
              {adjusting
                ? <ComposingLabel progress={progress} />
                : t("plan.draft.remix")}
            </Button>
          </div>

          {/* LES DEUX COMPTES, SUR UNE LIGNE ET EN PETIT — le pied ne défile
              pas, donc il ne grandit pas.

              ⚠️ LE PLAFOND EST DIT MAINTENANT, PAS AU MOMENT DE BUTER DEDANS.
              Trois formes et pas une avec un `{count}`: « Encore 1 reprises »
              est une phrase qu'on ne relit jamais, et zéro n'est pas un
              compte, c'est un état.

              ⚠️ LE COMPTEUR DE SIGNES passe au rouge APRÈS le plafond, pas
              avant: une couleur d'alarme sur une phrase encore valable
              apprendrait à ignorer la couleur. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-label text-ink-soft">
              {left === 0
                ? t("plan.draft.turns_none")
                : left === 1
                ? t("plan.draft.turns_one")
                : t("plan.draft.turns_left", { count: left })}
            </span>
            <span
              className={`text-label ${
                noteOverflows(note) ? "text-red-700" : "text-ink-soft"
              }`}
            >
              {noteOverflows(note)
                ? t("plan.draft.note_too_long")
                : t("plan.draft.chars_left", { count: charsLeft })}
            </span>
          </div>

          <div className="flex justify-end">
            {/* ⛔ `adoptLabel ?? …` ET PAS LA CLÉ NUE: ce bouton dit
                « Remplacer mon plan par celui-ci » quand l'aperçu remplace un
                plan existant. Écrite en dur, la clé faisait dire deux choses
                au fronton et au pied de la MÊME fenêtre. */}
            <Button
              variant="primary"
              disabled={busyNow || !draft}
              onClick={() => void runAdopt("body")}
            >
              {adopting ? t("plan.draft.adopting") : (adoptLabel ?? t("plan.draft.adopt"))}
            </Button>
          </div>
        </div>
      )
      : (
        /* FERMÉ: les deux gestes aux deux bords, l'avance à droite — le même
           sens que l'entonnoir (`SetupPage`, `setup.next` en `justify-end`). */
        <div className="flex flex-col gap-2">
          {/* ⟳ 2026-09-24 — PLUS DE REPRISE, ET ON LE DIT: « Ajuster » et tous
              les « Remplacer » sont éteints; sans cette ligne, rien ne dit
              pourquoi (vu sur le banc de l'aperçu). */}
          {!canAskAgain && (
            <p className="text-label text-ink-soft">{t("plan.draft.turns_none")}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={busyNow || !canAskAgain}
              onClick={() => setNoteOpen(true)}
            >
              {t("plan.draft.remix")}
            </Button>
            <Button
              variant="primary"
              disabled={busyNow || !draft}
              onClick={() => void runAdopt("body")}
            >
              {adopting ? t("plan.draft.adopting") : (adoptLabel ?? t("plan.draft.adopt"))}
            </Button>
          </div>
        </div>
      )
  );

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
      headerAction={strikeMode
        // ⟳ 2026-09-24 — DES PLATS BARRÉS: PAS D'ADOPTION, ni ici ni en pied.
        // On n'écrit pas un plan dont on vient de refuser des plats.
        ? undefined
        : (
          <Button
            variant="primary"
            size="sm"
            disabled={busyNow || !draft}
            onClick={() => void runAdopt("header")}
          >
            {adopting ? t("plan.draft.adopting") : (adoptLabel ?? t("plan.draft.adopt"))}
          </Button>
        )}
      /* ⟳ 2026-09-24 — LES DEUX « POP-UPS » SONT DES COUCHES DE CETTE FENÊTRE,
         pas des seconds portails (jamais essayés ici): la raison d'un plat à
         remplacer, puis les questions de précision. */
      layer={reasonFor !== null
        ? (
          <ReplaceReasonLayer
            dishTitle={reasonFor.title}
            value={reasonDraft}
            onChange={setReasonDraft}
            onCancel={() => setReasonFor(null)}
            onConfirm={confirmReason}
          />
        )
        : asking !== null
        ? (
          <NoteQuestionsLayer
            key={asking.seq}
            questions={asking.questions}
            busy={busyNow}
            onContinue={(choices) => void continueAfterQuestions(choices)}
          />
        )
        : null}
      // Échap referme la couche de raison (le plat n'est pas barré); les
      // questions, elles, se ferment par « Continuer ».
      onLayerDismiss={reasonFor !== null ? () => setReasonFor(null) : undefined}
      // `lg`: on y monte une SEMAINE — grille, préparations, jours. À `max-w-lg`
      // la grille du plan se lit à travers une meurtrière.
      size="lg"
      footer={footerActions}
    >
      {/* ⟳ 2026-09-20 — DEUX PHRASES DE TÊTE RETIRÉES, SUR DEMANDE.
          « Rien n'est encore enregistré. » (`plan.draft.not_saved`) et
          « Adopter revalide cet aperçu… » (`plan.draft.adopt_recomposes`,
          qui était aussi sous le bouton du bas) ouvraient cette fenêtre sur
          deux lignes de contrat avant le plan lui-même. Les deux clés n'ont
          plus aucun lecteur et sont sorties des deux fichiers de langue.

          ⚠️ CE QU'ELLES DISAIENT RESTE VRAI: cette fenêtre n'écrit rien tant
          qu'on n'a pas cliqué « Adopter », et l'adoption rejoue le
          `write_payload` rangé après empreinte et garde finale, sans
          recomposer. Ce qui change est qu'on ne l'écrit plus à l'écran. */}

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

      {/* ══════════════════════════════════════════════════════════════════
          ⛔ « POURQUOI CES JOURS-LÀ » A ÉTÉ RETIRÉ — 2026-09-09
          ══════════════════════════════════════════════════════════════════

          Décision produit. C'était la carte des phrases DÉTERMINISTES de
          l'app (`plan_rationale`, assemblées côté serveur): pourquoi tel jour
          de cuisine, pourquoi deux courses, pourquoi tel moment ouvert.

          ⚠️ CE QUI RESTE, ET QUI N'EST PAS LA MÊME CHOSE: le bloc
          `plan.explanation.*` juste au-dessus — la prose du MODÈLE, ce qu'il a
          dû arbitrer. Les deux cartes se ressemblaient à l'écran et ne
          disaient pas du tout la même chose; c'est celle de l'app qui part.

          ⛔ LE SERVEUR CONTINUE DE LES PRODUIRE. `DraftEnvelope.rationale` est
          toujours lu par `readDraftEnvelope` — l'enveloppe reste le miroir
          fidèle de ce que la fonction rend, et lui retirer un champ qu'elle
          envoie ferait mentir le contrat. Ce qui a disparu est la SURFACE.
          Rebrancher une carte revient à relire cette prop. */}

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
      {/* ⟳ 2026-09-19 — LE BLOC D'ÉCARTS (`PlanValidationNotice`) N'EST PLUS
          MONTÉ ICI NON PLUS. Décision produit : ni l'aperçu ni le plan écrit
          n'affichent « ce qu'il ne tient pas ». `draft.validation` reste
          rendu par le serveur et lu par l'enveloppe ; seule la surface part. */}
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
              // ⛔ AUCUNE GARDE À RECOPIER ICI, ET LA RAISON A CHANGÉ LE
              // 2026-09-10. Elle disait: « la lane individuelle ne rend aucune
              // part, et un secondaire y est toujours routé ». Il n'y a plus
              // de lane individuelle — ce qui tient maintenant, et qui est plus
              // simple, c'est qu'un secondaire N'OUVRE JAMAIS cette fenêtre:
              // son bouton d'aperçu n'est pas rendu (lot 7), et le serveur lui
              // rendrait 403 `not_owner` de toute façon.
              portions={draft.memberPortions}
              startsOn={draft.startsOn}
              durationDays={draft.durationDays}
              today={draft.startsOn}
              // ⟳ 2026-09-24 — PLUS DE « TOUTE LA SEMAINE »: l'aperçu ouvre sur
              // son premier jour (`today = startsOn`), la semaine se juge dans
              // le tableau en tête. Une LIGNE PAR PLAT, dépliable, et
              // « Remplacer » sur chacune.
              dishLayout="compact"
              dishReplace={dishReplace}
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
              // ⟳ 2026-09-24 — le tableau de la semaine: même règle que
              // `forBox`, dont il n'est que la somme.
              memberDayEnergy={(member, day) => energy.forMemberDay(member, day)}
            />
          )
          // `draft === null` = rien à montrer. Pas de squelette, pas de
          // « chargement »: l'appelant n'ouvre cette fenêtre qu'avec un
          // brouillon, et un vide décoré ferait attendre ce qui ne vient pas.
          : <p className="text-sm text-ink-soft">{t("plan.draft.working")}</p>}
      </div>

      {/* ── AJUSTER LE PLAN ────────────────────────────────────────────────
          SOUS le plan: on ne commente pas ce qu'on n'a pas lu.

          ⛔ LE TITRE (« Ce qui ne va pas ») ET SON EXPLICATION (« Une phrase
          suffit… ») SONT PARTIS LE 2026-09-20, sur demande, avec leurs deux
          clés. Ce qu'ils annonçaient est maintenant porté par le geste
          lui-même: on ne lit « Ajuster le plan » que si on veut ajuster. */}
      {/* ══════════════════════════════════════════════════════════════════
          ⟳ 2026-09-21 — LE CHAMP EST MONTÉ DANS LE PIED. CE BLOC NE PORTE
          PLUS QUE CE QUE LA PHRASE A PRODUIT.
          ══════════════════════════════════════════════════════════════════

          Le champ, son compteur de signes et le compte des reprises vivaient
          ici, tout en bas du corps: il fallait défiler toute la semaine pour
          écrire, et le geste d'envoi se retrouvait collé à « Remplacer mon
          plan par celui-ci ». Demandé: « la partie commentaire qui s'ouvre
          quand on clique sur ajuster, c'est dans l'élément fixé ».

          ⛔ ET CE BLOC-CI NE SE REND PLUS SOUS `noteOpen`. Ce qu'il porte est
          la RÉPONSE (« J'ai noté : … », une question du serveur, un refus):
          la lier à l'ouverture du champ ferait disparaître la réponse en même
          temps que la question, au premier repli. */}
      {bodyNotice && (
      <div className="mt-6 border-t border-line pt-4">
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

        {/* ── CE QUE LA PHRASE A FAIT (2026-09-08) ─────────────────────────
            ⛔ LA RÈGLE DU DOCUMENT DES RETOURS: on ne se tait jamais. Trois
            issues, trois phrases. Les lignes annoncées sont CELLES du chat —
            pas une seconde rédaction. « Rien à changer » se dit; « je n'ai
            pas compris de qui » se dit, et rien n'a été deviné. */}
        {noteOutcome !== null && noteOutcome.announced.length > 0
          ? (
            <div className="mt-2 text-sm leading-6 text-ink">
              <p>{t("plan.draft.note_applied")}</p>
              <ul className="list-disc pl-5">
                {noteOutcome.announced.map((a, i) => (
                  <li key={i}>{a.who ? `${a.who} : ${a.text}` : a.text}</li>
                ))}
              </ul>
            </div>
          )
          : null}
        {/* ⟳ 2026-09-23 — ⑩ CE QUE LA NOTE A DIT DE LA SANTÉ ET QUI N'A PAS PU
            ENTRER DANS LA FICHE. Dit ICI, à côté du geste: un refus loin du
            geste se lit comme un bouton mort, et un refus tu comme une
            allergie enregistrée. */}
        {noteOutcome !== null && noteOutcome.safetyNotWritten.length > 0
          ? (
            <p role="alert" className="mt-2 text-sm leading-6 text-red-700 break-words">
              {t("plan.draft.safety_not_written", {
                lines: noteOutcome.safetyNotWritten
                  .map((l) => (l.who ? `${l.who} : ${l.text}` : l.text))
                  .join(" · "),
              })}
            </p>
          )
          : null}

        {/* ── CE QU'UNE REPRISE LOCALE A FAIT (2026-09-09) ─────────────────
            « J'ai refait le vendredi soir ; le reste est identique. » — depuis
            `envelope.edit`, jamais depuis ce qu'on a demandé : ce sont les
            cases PRISES qui se disent. Une case demandée et non prise a levé
            un refus, rendu en rouge sous le champ. */}
        {edit !== null && edit.operation === "edit_cells" && edit.taken.length > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t("plan.draft.cells_applied", {
                // ⚠️ `t` est typé sur les clés CONNUES du catalogue ; ici la clé
                // est composée d'un jeton serveur (`fri`, `dinner`). Le cast dit
                // exactement ça, et `cellLabel` jette ce que le catalogue ne
                // connaît pas.
                cells: edit.taken.map((k) => cellLabel(k, t as unknown as (k: string) => string)).join(", "),
                count: edit.untouched,
              })}
            </p>
          )
          : null}

        {/* ⟳ 2026-09-24 — CE QUE « REMPLACER » A FAIT, depuis `envelope.edit`:
            ce sont les plats PRIS qui se disent, et ceux refaits en plus parce
            qu'une exclusion neuve les aurait vidés. Un plat demandé et non
            pris se dit aussi — il reste dans l'aperçu tel quel. */}
        {edit !== null && edit.operation === "replace_dishes" && edit.taken.length > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {edit.taken.length === 1
                ? t("plan.draft.dishes_replaced_one", { kept: edit.untouched })
                : t("plan.draft.dishes_replaced_many", { count: edit.taken.length, kept: edit.untouched })}
            </p>
          )
          : null}
        {edit !== null && edit.operation === "replace_dishes" && extendedTitles.length > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t(extendedTitles.length === 1 ? "plan.draft.dishes_extended_one" : "plan.draft.dishes_extended_many", {
                dishes: extendedTitles.map((title) => `« ${title} »`).join(", "),
              })}
            </p>
          )
          : null}
        {edit !== null && edit.operation === "replace_dishes" && edit.notRendered.length > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t("plan.draft.dishes_not_replaced", { count: edit.notRendered.length })}
            </p>
          )
          : null}
        {noteOutcome !== null && noteOutcome.rejectedFiled > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              {noteOutcome.rejectedFiled === 1
                ? t("plan.draft.rejected_filed_one")
                : t("plan.draft.rejected_filed_many", { count: noteOutcome.rejectedFiled })}
            </p>
          )
          : null}
        {/* ⟳ 2026-09-24 — LA QUESTION DU SERVEUR N'EST PLUS ICI: elle s'ouvre en
            couche (`NoteQuestionsLayer`), trois au plus, cochées, et rien ne
            compose tant qu'elle est ouverte. Ce bloc ne garde que ce qui en
            résulte. */}
        {asking === null && declined > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t("plan.draft.question_skipped")}
            </p>
          )
          : null}
        {asking === null && channel === "note" && declined === 0 && noteOutcome !== null &&
            noteOutcome.announced.length === 0 && noteOutcome.whoUnknown > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t("plan.draft.note_who_unknown")}
            </p>
          )
          : null}
        {/* ⟳ 2026-09-08 — COMPRIS, MAIS AU BOUT DE L'ÉCHELLE. Mesuré: « trop
            compliqué » sur un style déjà minimal rendait « rien trouvé à
            changer » — faux, et décourageant. Se dit même quand autre chose
            a été noté à côté. */}
        {asking === null && noteOutcome !== null && noteOutcome.atEdge > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t("plan.draft.note_at_edge")}
            </p>
          )
          : null}
        {/* LU, ET PAS RANGÉ EXPRÈS (les jours de cuisine, un objectif, un
            merci): « rien à changer » laisserait croire qu'on n'a pas lu. */}
        {asking === null && channel === "note" && declined === 0 && noteOutcome !== null &&
            noteOutcome.announced.length === 0 && noteOutcome.whoUnknown === 0 &&
            noteOutcome.atEdge === 0 && noteOutcome.skipped > 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t("plan.draft.note_skipped")}
            </p>
          )
          : null}
        {asking === null && channel === "note" && declined === 0 && noteOutcome !== null &&
            noteOutcome.announced.length === 0 && noteOutcome.whoUnknown === 0 &&
            noteOutcome.atEdge === 0 && noteOutcome.skipped === 0
          ? (
            <p className="mt-2 text-sm leading-6 text-ink">
              {t("plan.draft.note_nothing")}
            </p>
          )
          : null}

        {/* ⛔ LE ROUGE RESTE: famille « échec » du produit, et un motif nommé
            est un FAIT. `note_unusable` est le seul refus que la personne peut
            réparer elle-même — en reformulant — donc il se lit ici, sous le
            champ qu'il concerne, jamais ailleurs.

            ⛔ ET IL EST **HORS** DU BLOC QUI SE REPLIE — 2026-09-20. `at:
            "body"` est posé par DEUX gestes: la note, et « Adopter ce plan »
            du bas (`runAdopt("body")`). Laissé sous `noteOpen`, un refus
            d'adoption serait invisible tant que la zone d'écriture est
            fermée — c'est-à-dire dans le cas nominal, et sur le seul bouton
            qui écrit vraiment. Un bouton dont le refus ne se voit pas est un
            bouton mort: la cicatrice est écrite trois fois dans `SetupPage`. */}
        {failure?.at === "body"
          ? (
            <p className="mt-2 text-sm leading-6 text-red-700 break-words">
              {failure.message}
            </p>
          )
          : null}

      </div>
      )}
    </Modal>
  );
}
