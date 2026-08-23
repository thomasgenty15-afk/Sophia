import React from "react";

import {
  type FeedbackQuestion,
  OPTION_LABELS,
  PORTION_SUBJECT_LABEL,
  portionSubjectIsAsked,
  QUESTION_LABELS,
  QUESTION_OPTIONS,
} from "../../api/planFeedback";
import { t } from "../../i18n/t";
import { Button } from "../ui/Button";
import { Card, SectionLabel } from "../ui/Card";
import { inputClass } from "../ui/Field";
import Modal from "../ui/Modal";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE RETOUR DE FIN DE PLAN — LOT D, L'ÉCRAN QUI MANQUAIT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le module (`_shared/keel/plan_feedback.ts`) est complet depuis le
 * 2026-08-11: questions, options fermées, libellés dans les deux langues,
 * plancher TCA, effet de chaque réponse. La table aussi, chaque colonne avec
 * son lecteur nommé. Il n'y avait ni surface ni écrivain.
 *
 * ── LES QUATRE RÈGLES QUI GOUVERNENT CE FICHIER ──────────────────────────
 *
 * 1. ⛔ ON ÉVALUE LE PLAN, JAMAIS LA PERSONNE. Aucune question sur ce qui a été
 *    mangé, aucune sur ce qui a été fait. « Comment ça s'est passé » est à un
 *    pas de « as-tu tenu », dans un produit qui a supprimé les scores exprès.
 *
 * 2. ⛔ AUCUNE QUESTION N'EST ÉCRITE ICI. La liste vient de `questionsFor`, les
 *    libellés de `QUESTION_LABELS`, les options de `QUESTION_OPTIONS` — tous du
 *    module serveur. Une seconde table de questions à l'écran divergerait au
 *    premier ajout, et le plancher TCA serait la première chose à diverger.
 *
 * 3. ⛔ FERMER EST UNE RÉPONSE. Le bouton de fermeture ÉCRIT `dismissed_at`.
 *    Sans ça, le questionnaire revient à chaque ouverture de l'app — un « non
 *    merci » transformé en harcèlement.
 *
 * 4. ⛔ LES DEUX POLARITÉS SONT UN SEUL BLOC. `never_again` et `make_again`
 *    portent sur LA MÊME LISTE — les plats de ce plan. Deux listes empilées
 *    feraient relire vingt titres deux fois, et le plafond du module
 *    (« jamais plus de quatre gestes ») ne tiendrait plus.
 *
 * ── L'ORDRE DE LECTURE ────────────────────────────────────────────────────
 * Ce qui porte sur LE PLAN d'abord (l'a-t-on cuisiné, les portions, les plats),
 * l'envie de la SUITE en dernier: on ne demande pas ce qu'on veut la prochaine
 * fois avant d'avoir refermé celle-ci.
 */

/** Ce qu'une bouche a marqué sur un plat. Un plat n'a jamais les deux. */
export type DishMark = "never_again" | "make_again" | null;

/**
 * UNE BOUCHE, réduite à ce que la relance « pour qui ? » demande.
 *
 * ⛔ `memberId` EST LA CLÉ, LE PRÉNOM EST L'AFFICHAGE. C'est l'axe 3 de la
 * nomenclature, et la cicatrice est chiffrée dans ce dépôt: « laitue » ≠
 * « lait », 12 faux positifs sur 12. Un prénom envoyé au serveur serait une
 * clé qui casse au premier renommage — et qui désigne la mauvaise bouche
 * quand deux personnes s'appellent pareil.
 */
export interface PlanFeedbackMouth {
  memberId: string;
  displayName: string;
}

export interface PlanFeedbackDialogProps {
  open: boolean;
  /**
   * FERMER, C'EST REFUSER — et l'appelant l'ÉCRIT.
   *
   * ⚠️ REQUIS, et il ne prend rien: le composant ne décide pas de ce que
   * « refuser » veut dire en base. Voir la règle 3.
   */
  onDismiss: () => Promise<void>;
  /**
   * LES QUESTIONS À POSER, décidées par `questionsFor` chez l'appelant.
   *
   * ⚠️ REQUIS, et jamais calculées ici: la règle du plancher TCA (quelles
   * questions RETIRER, et l'indiscernabilité de la sortie) vit dans le module
   * serveur, et une seconde lecture ici la ferait diverger — après quoi une
   * question de portion se poserait à quelqu'un qu'on a marqué.
   */
  questions: readonly FeedbackQuestion[];
  /** Les titres des plats de CE plan, dédoublonnés, dans l'ordre du plan. */
  dishTitles: readonly string[];
  /**
   * L'ENVIE DE LA SUITE EST-ELLE DEMANDÉE ?
   *
   * ⚠️ REQUIS, jamais optionnel. `false` est une AFFIRMATION — « cette personne
   * n'a pas de lecteur pour une envie » — et un `?` l'aurait rendue muette
   * partout sans qu'aucun appelant ne remonte au compilateur. Décidé par
   * `newEnvyIsAsked`: seul le maître d'un foyer écrit la ligne d'envies, donc
   * seul lui voit la question. Une question sans lecteur ne se pose pas.
   */
  askEnvy: boolean;
  /**
   * LES BOUCHES DE LA TABLE — la liste FERMÉE de « pour qui ? ».
   *
   * ⚠️ REQUISE, jamais optionnelle: `[]` est une AFFIRMATION — « une seule
   * bouche, il n'y a personne à nommer » — et un `?` l'aurait rendue muette
   * partout sans qu'aucun appelant ne remonte au compilateur (cicatrice
   * « paramètre de garde optionnel = garde désarmée »).
   *
   * ⚠️ UN SOLO N'A PAS DE FOYER (`SetupPage.tsx`: « le solo ne crée pas de
   * foyer »), donc pas une seule ligne `household_members`, donc aucun
   * `member_id` à nommer: il reçoit `[]`, la question ne se pose pas, et le
   * sujet vaut « tout le monde à table » — qui, chez lui, est lui.
   */
  mouths: readonly PlanFeedbackMouth[];
  /** Envoie. `envy` est `null` quand la question n'était pas posée ou vide. */
  onSubmit: (answers: {
    cooked: string | null;
    portions: string | null;
    /** `household`, `member:<uuid>`, ou `null` quand la question n'est pas posée. */
    portionsSubject: string | null;
    neverAgain: string[];
    makeAgain: string[];
    axisQuestion: string | null;
    axisAnswer: string | null;
    envy: string | null;
  }) => Promise<void>;
}

/** Les deux questions de plats: elles ne se rendent pas comme les autres. */
const DISH_QUESTIONS: readonly FeedbackQuestion[] = ["never_again", "make_again"];

export default function PlanFeedbackDialog(props: PlanFeedbackDialogProps) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [marks, setMarks] = React.useState<Record<string, DishMark>>({});
  /** `household` | `member:<uuid>`. Jamais un prénom. */
  const [portionsSubject, setPortionsSubject] = React.useState<string | null>(null);
  const [envy, setEnvy] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  /**
   * ⚠️ `Modal` REND `null` FERMÉ, IL NE DÉMONTE PAS SES ENFANTS: sans cette
   * remise à zéro, un questionnaire rouvert porterait les réponses d'un AUTRE
   * plan. Remise à l'OUVERTURE, pas à la fermeture — c'est l'ouverture qui
   * commence une session.
   */
  React.useEffect(() => {
    if (!props.open) return;
    setAnswers({});
    setMarks({});
    setPortionsSubject(null);
    setEnvy("");
    setFailure(null);
  }, [props.open]);

  /** Les questions à choix, dans l'ordre du module. Les plats sont à part. */
  const choiceQuestions = props.questions.filter((q) =>
    !DISH_QUESTIONS.includes(q)
  );
  /** L'axe: la seule question qui n'est pas commune. Voir `AXIS_QUESTION`. */
  const axis = props.questions.find((q) =>
    q !== "cooked" && q !== "portions" && !DISH_QUESTIONS.includes(q)
  ) ?? null;
  const asksDishes = props.questions.some((q) => DISH_QUESTIONS.includes(q));

  /**
   * ⛔ LA RÈGLE VIENT DU MODULE, PAS D'ICI (règle 2). « Pas neutre » se lit
   * dans `effectOf`, et « plus d'une bouche » est la condition du solo. Un
   * second calcul à l'écran serait la première chose à diverger — après quoi
   * on demanderait « pour qui ? » à quelqu'un qui est seul à table.
   */
  const asksPortionSubject = portionSubjectIsAsked({
    portions: answers.portions || null,
    mouths: props.mouths.length,
  });

  function mark(title: string, next: DishMark) {
    setMarks((prev) => ({
      ...prev,
      // RECLIQUER RETIRE LA MARQUE. Sans ça, une marque posée par erreur est
      // définitive, et un refus par erreur fait éviter un plat à vie.
      [title]: prev[title] === next ? null : next,
    }));
  }

  return (
    <Modal
      open={props.open}
      onClose={() => void props.onDismiss()}
      title={t("plan.feedback.title")}
      closeLabel={t("plan.feedback.dismiss")}
    >
      {/* ── CE QUI EST VRAI AVANT TOUT LE RESTE ──────────────────────────
          Ce questionnaire porte sur LE PLAN. Le dire en tête, pas en pied:
          « comment ça s'est passé » se lit « as-tu tenu » si on ne dit pas de
          quoi on parle, et ce produit a supprimé les scores exprès. */}
      <p className="text-sm leading-6 text-ink-soft">
        {t("plan.feedback.intro")}
      </p>

      {choiceQuestions.map((q) => (
        <Card key={q} className="mt-3">
          <SectionLabel>{QUESTION_LABELS[q].en}</SectionLabel>
          {/* ⚠️ LES LIBELLÉS VIENNENT DU MODULE, PAS DU CATALOGUE i18n. Ils y
              sont écrits dans les DEUX langues (`profiles.locale` vaut `fr-FR`
              par défaut sur ce produit), et les recopier en clés d'écran ferait
              deux tables de la même question — celle qu'on regarde le moins
              garderait l'ancien mot. La langue servie est celle de la page,
              anglaise pour toute l'app connectée (`catalog.ts`).

              ⚠️ ET LE **NOMBRE** D'OPTIONS VIENT DU MODULE AUSSI. `portions`
              en porte CINQ depuis le 2026-08-19 (l'échelle a gagné un second
              cran par sens, `way_too_much` / `way_not_enough`), et cet écran
              n'a pas eu une ligne à changer: il boucle sur
              `QUESTION_OPTIONS[q]`. Écrire trois boutons à la main ici aurait
              fait deux listes, et c'est celle-ci — la seule que la personne
              voit — qui serait restée à trois. `flex-wrap` était déjà là: à
              320 px, cinq boutons passent à la ligne au lieu de sortir de
              l'écran, et un bouton hors écran est un bouton absent. */}
          <div className="mt-2 flex flex-wrap gap-2">
            {QUESTION_OPTIONS[q].map((opt) => (
              <Button
                key={opt}
                size="sm"
                variant={answers[q] === opt ? "primary" : "secondary"}
                disabled={busy}
                onClick={() =>
                  setAnswers((prev) => ({
                    ...prev,
                    // RECLIQUER RETIRE LA RÉPONSE: aucune question n'est
                    // obligatoire, et une réponse posée par erreur doit pouvoir
                    // être reprise.
                    [q]: prev[q] === opt ? "" : opt,
                  }))}
              >
                {OPTION_LABELS[opt]?.en ?? opt}
              </Button>
            ))}
          </div>

          {/* ── « POUR QUI ? », DANS LA MÊME CARTE QUE LA MESURE ──────────
              ⛔ CE N'EST PAS UNE CINQUIÈME QUESTION: c'est la seconde moitié
              de `portions`, et elle n'apparaît QUE si la réponse n'est pas
              neutre. Une carte à part ferait une question de plus dans un
              écran dont le plafond est « jamais plus de quatre gestes ».

              ⚠️ ET C'EST ELLE QUI REND `portion.adjust` ATTRIBUABLE. Sans
              sujet, « les portions étaient trop grosses » ne désigne personne
              dans un foyer de quatre — c'est la raison écrite pour laquelle le
              questionnaire en est le SEUL producteur. */}
          {q === "portions" && asksPortionSubject
            ? (
              <div className="mt-3 border-t border-line pt-3">
                <SectionLabel>{PORTION_SUBJECT_LABEL.en}</SectionLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  {/* LE DÉFAUT DE L'AXE 3 EN PREMIER: « tout le monde à
                      table ». C'est une réponse, pas une absence de réponse. */}
                  <Button
                    size="sm"
                    variant={portionsSubject === "household"
                      ? "primary"
                      : "secondary"}
                    disabled={busy}
                    onClick={() =>
                      setPortionsSubject((prev) =>
                        prev === "household" ? null : "household"
                      )}
                  >
                    {OPTION_LABELS.everyone.en}
                  </Button>
                  {props.mouths.map((mouth) => {
                    // ⛔ LA CLÉ EST L'IDENTIFIANT, LE PRÉNOM EST L'AFFICHAGE.
                    const subject = `member:${mouth.memberId}`;
                    return (
                      <Button
                        key={mouth.memberId}
                        size="sm"
                        variant={portionsSubject === subject
                          ? "primary"
                          : "secondary"}
                        disabled={busy}
                        onClick={() =>
                          setPortionsSubject((prev) =>
                            prev === subject ? null : subject
                          )}
                      >
                        {mouth.displayName}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )
            : null}
        </Card>
      ))}

      {/* ── LES DEUX POLARITÉS, UN SEUL BLOC (règle 4) ────────────────────
          Une ligne par plat, deux marques possibles, et jamais les deux sur le
          même plat. Deux listes empilées feraient relire vingt titres deux
          fois — et « au-delà de quatre gestes c'est un formulaire ». */}
      {asksDishes && props.dishTitles.length > 0
        ? (
          <Card className="mt-3">
            <SectionLabel>{t("plan.feedback.dishes_title")}</SectionLabel>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              {t("plan.feedback.dishes_hint")}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {props.dishTitles.map((title) => (
                <li
                  key={title}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  {/* `min-w-0` ET `break-words`: `flex-1` ne rétrécit pas un
                      enfant (`min-width: auto`), et un titre long emporte la
                      page à 320 px. Mesuré ailleurs dans ce dépôt. */}
                  <span className="min-w-0 flex-1 break-words text-sm text-ink">
                    {title}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant={marks[title] === "make_again"
                        ? "primary"
                        : "secondary"}
                      disabled={busy}
                      onClick={() => mark(title, "make_again")}
                    >
                      {t("plan.feedback.again")}
                    </Button>
                    <Button
                      size="sm"
                      variant={marks[title] === "never_again"
                        ? "primary"
                        : "secondary"}
                      disabled={busy}
                      onClick={() => mark(title, "never_again")}
                    >
                      {t("plan.feedback.not_again")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )
        : null}

      {/* ── L'ENVIE DE LA SUITE, EN DERNIER ──────────────────────────────
          ⛔ ELLE N'OUVRE AUCUN SECOND CANAL: elle part dans la ligne d'envies
          du foyer (`keel_household_submit_envy`), celle que le générateur lit
          déjà à chaque composition. Et elle n'est posée qu'à qui peut l'y
          écrire — le maître. Une question sans lecteur ne se pose pas. */}
      {props.askEnvy
        ? (
          <Card className="mt-3">
            <SectionLabel>{t("plan.feedback.envy_title")}</SectionLabel>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              {t("plan.feedback.envy_hint")}
            </p>
            <textarea
              id="plan-feedback-envy"
              className={`${inputClass} mt-2 min-h-20`}
              value={envy}
              placeholder={t("plan.feedback.envy_placeholder")}
              disabled={busy}
              onChange={(e) => setEnvy(e.target.value)}
            />
          </Card>
        )
        : null}

      {failure
        ? (
          <p className="mt-3 text-sm leading-6 text-red-700 break-words">
            {failure}
          </p>
        )
        : null}

      {/* `flex-wrap`: à 320 px deux boutons côte à côte débordent, et un bouton
          hors écran est un bouton absent. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailure(null);
            try {
              await props.onSubmit({
                cooked: answers.cooked || null,
                portions: answers.portions || null,
                // ⚠️ `null` DÈS QUE LA QUESTION N'EST PLUS POSÉE, et pas
                // seulement quand elle n'a pas été répondue: quelqu'un qui
                // coche « trop », nomme une bouche, puis revient sur « ce
                // qu'il fallait » enverrait sinon un sujet sans mesure — que
                // la base REFUSE (`subject_without_measure`), et il perdrait
                // tout son retour pour un bouton qu'il a repris.
                portionsSubject: asksPortionSubject ? portionsSubject : null,
                neverAgain: Object.keys(marks).filter((k) =>
                  marks[k] === "never_again"
                ),
                makeAgain: Object.keys(marks).filter((k) =>
                  marks[k] === "make_again"
                ),
                // LES DEUX, JAMAIS LA SEULE RÉPONSE: « no » veut dire « pas eu
                // faim » pour l'un et « pas fini » pour l'autre, et le lecteur
                // ne peut pas désambiguïser sans la question.
                axisQuestion: axis && answers[axis] ? axis : null,
                axisAnswer: axis ? answers[axis] || null : null,
                envy: props.askEnvy && envy.trim() ? envy.trim() : null,
              });
            } catch (e) {
              setFailure(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("plan.feedback.sending") : t("plan.feedback.send")}
        </Button>
      </div>
    </Modal>
  );
}
