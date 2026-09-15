import React from "react";
import { Button } from "./ui/Button";
import { Field, inputClass } from "./ui/Field";
import Modal from "./ui/Modal";
import {
  callDoctrine,
  type DoctrineDraft,
  type DoctrineSource,
  NO_RULE,
  STARTER_FORKS,
  type StarterChoices,
  VOICE_QUESTIONS,
} from "../api/coachDoctrine";
import {
  compileDocument,
  MAX_DOCUMENT_MB,
  MAX_DOCUMENT_PAGES,
  rejectDocument,
} from "../api/coachDocument";
import { t } from "../i18n/t";
import { plural } from "../i18n/plural";

/**
 * LES QUATRE FAÇONS DE COMMENCER — sorties du corps de la page.
 *
 * ── LE DÉFAUT QUE ÇA FERME ───────────────────────────────────────────────
 * Trois cartes d'amorçage occupaient la page, sous la doctrine. Ce sont des
 * actions de DÉPART, et un coach qui a publié revient ici pour relire et
 * corriger UNE phrase: il traversait à chaque fois trois invitations à tout
 * recommencer. La page ne montrait plus ce qu'il avait écrit, elle montrait
 * trois façons de le réécrire.
 *
 * ── L'ORDRE, QUI N'EST PAS UNE PRÉFÉRENCE ────────────────────────────────
 * (a) les débats, (b) le document, (c) l'entretien: dix taps contre onze
 * textareas, et c'est la vitesse qui est le vrai problème. (d) la délégation
 * est EN DERNIER parce que c'est le repli, pas le raccourci recommandé — le
 * produit se vend sur « c'est MON agent », et le chemin qui y renonce ne doit
 * pas être le premier qu'on lit.
 *
 * ── UN SEUL CHEMIN OUVERT À LA FOIS ──────────────────────────────────────
 * Les quatre dépliés feraient une modale de trois écrans de haut, c'est-à-dire
 * le mur qu'on vient de retirer de la page. Fermé, chaque chemin tient en deux
 * lignes: pour qui il est, et ce qu'il fait au travail déjà présent.
 */

type PathKey = "forks" | "document" | "interview" | "delegate";

export interface DoctrineStartResult {
  draft: DoctrineDraft;
  issues: string[];
  notice: string;
}

interface InterviewQuestion {
  section: string;
  question: string;
}

/** Ce que chaque chemin fait au travail déjà écrit. Dit AVANT le clic. */
function EffectOnExisting({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-5 text-ink-soft">{children}</p>;
}

export function DoctrineStartDialog({
  open,
  onClose,
  questions,
  contentLocale,
  draft,
  doctrineSource,
  onResult,
  onDelegationChanged,
}: {
  open: boolean;
  onClose: () => void;
  questions: InterviewQuestion[];
  contentLocale: string;
  /** Le brouillon à l'écran: ce que « ajouter » va enrichir, et « repartir » écraser. */
  draft: DoctrineDraft | null;
  doctrineSource: DoctrineSource;
  onResult: (result: DoctrineStartResult) => void;
  onDelegationChanged: (source: DoctrineSource, signsAs: string | null) => void;
}) {
  const [openPath, setOpenPath] = React.useState<PathKey | null>(null);
  const [busy, setBusy] = React.useState<PathKey | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  // (a) les débats
  const [forkChoices, setForkChoices] = React.useState<StarterChoices>({});
  const [voiceAnswers, setVoiceAnswers] = React.useState<Record<number, string>>({});
  // (b) le document
  const [docFile, setDocFile] = React.useState<File | null>(null);
  // (c) l'entretien
  const [answers, setAnswers] = React.useState<Record<number, string>>({});

  React.useEffect(() => {
    if (!open) return;
    // À CHAQUE OUVERTURE, ET PAS AU MONTAGE. Une modale qui rouvre sur les
    // réponses d'il y a dix minutes ferait repartir un appel que le coach croit
    // neuf. Le brouillon, lui, vit dans la page et n'est pas touché ici.
    setOpenPath(null);
    setFailure(null);
    setDocFile(null);
  }, [open]);

  if (!open) return null;

  const run = async (key: PathKey, fn: () => Promise<void>) => {
    setBusy(key);
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const forksPicked = Object.values(forkChoices).filter((v) => v && v !== NO_RULE).length;
  const hasVoice = (voiceAnswers[0] ?? "").trim().length > 0;

  const onCompileFromForks = () =>
    run("forks", async () => {
      try {
        const out = await callDoctrine<{ draft: DoctrineDraft; issues: string[] }>({
          action: "compile_from_forks",
          choices: Object.fromEntries(
            Object.entries(forkChoices).filter(([, v]) => v && v !== NO_RULE),
          ),
          voice_answers: VOICE_QUESTIONS.map((_, i) => (voiceAnswers[i] ?? "").trim()),
          content_locale: contentLocale,
        });
        onResult({
          draft: out.draft,
          issues: out.issues ?? [],
          notice: t("coach.doctrine.start.forks.notice"),
        });
      } catch (err) {
        // Ces deux codes ne veulent rien dire pour un coach. Ils ne disent PAS
        // la même chose, mais dans les deux cas la seule action utile est de
        // relancer. Les autres traversent tels quels.
        const code = err instanceof Error ? err.message : String(err);
        if (code === "generated_text_trips_own_lock") {
          throw new Error(t("coach.doctrine.start.forks.tripped_lock"));
        }
        if (code === "compile_unparseable") {
          throw new Error(t("coach.doctrine.start.forks.garbled"));
        }
        throw err;
      }
    });

  const onCompileDocument = (mode: "add" | "replace") =>
    run("document", async () => {
      if (!docFile) throw new Error(t("coach.doctrine.start.document.need_file"));
      const out = await compileDocument(docFile, {
        mergeInto: mode === "add" ? draft : null,
        contentLocale,
      });
      // ⚠️ LE PLURIEL PASSE PAR `plural`, PAS PAR UN `> 1 ? "s" : ""`. La règle
      // du « s » est ANGLAISE: le français met le singulier jusqu'à 2 (« 0
      // page », « 1 page »), et fabriquer la forme au lieu de la lire est
      // exactement ce que `i18n/plural.ts` existe pour interdire.
      const foods = out.proposals_saved > 0
        ? plural(
          out.proposals_saved,
          t("coach.doctrine.start.document.foods_one", { count: out.proposals_saved }),
          t("coach.doctrine.start.document.foods_many", { count: out.proposals_saved }),
        )
        : "";
      setDocFile(null);
      onResult({
        draft: out.draft,
        issues: out.issues ?? [],
        notice: [
          plural(
            out.page_count,
            t("coach.doctrine.start.document.notice_one", { count: out.page_count }),
            t("coach.doctrine.start.document.notice_many", { count: out.page_count }),
          ),
          foods,
        ].filter(Boolean).join(" "),
      });
    });

  const onCompileInterview = () =>
    run("interview", async () => {
      const payload = questions
        .map((q, i) => ({
          section: q.section,
          question: q.question,
          answer: (answers[i] ?? "").trim(),
        }))
        .filter((a) => a.answer !== "");
      // ⚠️ C'ÉTAIT UN CODE, ET LE COACH LE LISAIT TEL QUEL.
      // `run()` met `err.message` dans la carte d'échec, mot pour mot: un
      // coach qui cliquait sans avoir répondu lisait
      // « answer_at_least_one_question ». Les codes qui traversent ainsi
      // viennent du SERVEUR (`coach_suspended`, `voice_sample_required`) et
      // sont traduits ailleurs; celui-ci est fabriqué ici, deux lignes avant
      // son affichage, et n'avait aucune raison d'être un jeton.
      if (payload.length === 0) {
        throw new Error(t("coach.doctrine.start.interview.need_one"));
      }
      const out = await callDoctrine<{ draft: DoctrineDraft; issues: string[] }>({
        action: "compile",
        answers: payload,
        content_locale: contentLocale,
      });
      onResult({
        draft: out.draft,
        issues: out.issues ?? [],
        notice: t("coach.doctrine.start.interview.notice"),
      });
    });

  const onSetSource = (source: DoctrineSource) =>
    run("delegate", async () => {
      const out = await callDoctrine<{ doctrine_source: DoctrineSource; signs_as: string | null }>({
        action: "set_doctrine_source",
        source,
      });
      onDelegationChanged(out.doctrine_source, out.signs_as ?? null);
    });

  const Path = ({
    id,
    title,
    who,
    children,
  }: {
    id: PathKey;
    title: string;
    who: React.ReactNode;
    children: React.ReactNode;
  }) => {
    const isOpen = openPath === id;
    return (
      <li className="rounded-card border border-line-strong">
        <button
          type="button"
          onClick={() => setOpenPath(isOpen ? null : id)}
          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-fig-50"
          aria-expanded={isOpen}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{title}</span>
            <span className="mt-0.5 block max-w-[62ch] text-xs leading-5 text-ink-soft">{who}</span>
          </span>
          <span className="mt-1 shrink-0 text-xs text-ink-soft" aria-hidden="true">
            {isOpen ? "−" : "+"}
          </span>
        </button>
        {isOpen ? <div className="border-t border-line px-4 py-4">{children}</div> : null}
      </li>
    );
  };

  // ⛔ LA COQUE DE CETTE FENÊTRE ÉTAIT ÉCRITE À LA MAIN, ET C'EST `ui/Modal`
  // MAINTENANT. Ce n'est pas un geste de couleur: la version locale posait un
  // voile, une carte et un bouton « Fermer », et rien d'autre. Il lui manquait
  // les quatre obligations que le kit tient en un seul endroit —
  //   · `role="dialog"` + `aria-modal`: sans eux un lecteur d'écran continue
  //     d'annoncer l'écran RECOUVERT;
  //   · Échap: la seule sortie était un bouton qu'il fallait viser;
  //   · le verrou de défilement: le premier geste au-dessus du fond emportait la
  //     page derrière, et on ressortait en ayant perdu sa place;
  //   · le focus entrant: la tabulation continuait dans la page cachée.
  // Le voile passe de `black/40` à l'encre de la marque, la coque à
  // `rounded-fiche` sur `paper`, et le fronton porte le titre.
  //
  // ⚠️ `Modal` ne prend pas de sous-titre, et la chaîne existe dans les deux
  // packs: elle est rendue en tête du corps, au même endroit qu'avant à deux
  // pixels près. Aucune chaîne ajoutée, aucune retirée.
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t("coach.doctrine.start.title")}
      closeLabel={t("coach.doctrine.start.close")}
    >
      <div>
        <p className="max-w-[62ch] text-xs leading-5 text-ink-soft">
          {t("coach.doctrine.start.subtitle")}
        </p>

        <div className="mt-4">
          {failure ? (
            <div className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm text-amber-900">{t("coach.doctrine.action_failed")}</p>
              <p className="mt-1 break-words text-xs text-amber-900">{failure}</p>
            </div>
          ) : null}

          {/*
            LA DÉLÉGATION EN COURS SE DIT EN HAUT, PAS AU FOND DU QUATRIÈME
            CHEMIN. Un coach qui délègue et qui ouvre cette modale pour écrire sa
            méthode doit savoir, avant de taper quoi que ce soit, que ses élèves
            lisent Sophia en ce moment.
          */}
          {doctrineSource === "house" ? (
            <div className="mb-4 rounded-card border border-line bg-paper-2 px-3 py-2">
              <p className="text-sm text-ink">
                {t("coach.doctrine.start.house_now")}
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-soft">
                {t("coach.doctrine.start.house_takeback")}
              </p>
            </div>
          ) : null}

          <ul className="space-y-3">
            <Path
              id="forks"
              title={t("coach.doctrine.start.forks.title")}
              who={t("coach.doctrine.start.forks.who")}
            >
              <p className="text-xs leading-5 text-ink-soft">
                {t("coach.doctrine.start.forks.body")}
              </p>
              {/*
                CE CHEMIN ÉCRIT UNE MÉTHODE ENTIÈRE, IL N'AJOUTE PAS.
                Il a semé ligne par ligne dans une version antérieure du
                produit, et l'écran disait alors « it adds, it never wipes ».
                Il génère maintenant une doctrine complète en un appel. Laisser
                l'ancienne promesse aurait fait disparaître le travail d'un
                coach au moment précis où il croyait l'enrichir.
              */}
              {draft ? (
                <EffectOnExisting>
                  <strong>{t("coach.doctrine.start.forks.replaces_lead")}</strong>{" "}
                  {t("coach.doctrine.start.forks.replaces_body")}
                </EffectOnExisting>
              ) : null}
              <div className="mt-4 space-y-4">
                {STARTER_FORKS.map((fork) => (
                  <div key={fork.key}>
                    <p className="text-sm font-medium text-ink">{fork.subject}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {fork.positions.map((position) => {
                        // `no_rule` n'est pas une position: c'est l'absence de
                        // règle, donc rien à cocher. La montrer comme un choix
                        // pousserait à cocher pour « finir » le débat.
                        if (position.key === NO_RULE) return null;
                        const picked = forkChoices[fork.key] === position.key;
                        return (
                          <button
                            key={position.key}
                            type="button"
                            onClick={() =>
                              setForkChoices((prev) => ({
                                ...prev,
                                [fork.key]: prev[fork.key] === position.key ? "" : position.key,
                              }))}
                            className={`rounded-full border px-3 py-1.5 text-left text-xs ${
                              picked
                                ? "border-fig-700 bg-fig-700 text-paper"
                                : "border-line-strong bg-paper text-ink hover:bg-fig-50"
                            }`}
                          >
                            {position.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/*
                LA VOIX — CE QUI FAIT QUE DEUX COACHS NE SORTENT PAS PAREIL.
                Les camps disent QUOI. Sans ces lignes-ci, la machine écrit du
                manuel de nutrition, et le manuel est le même pour tout le monde.
              */}
              <p className="mt-8 text-xs font-medium uppercase tracking-wide text-ink-soft">
                {t("coach.doctrine.start.forks.voice_title")}
              </p>
              <div className="mt-3 space-y-4">
                {VOICE_QUESTIONS.map((q, i) => (
                  <Field key={q.key} label={q.question} htmlFor={`voice-${i}`} hint={q.hint}>
                    <textarea
                      id={`voice-${i}`}
                      className={inputClass}
                      rows={q.key === "sample" ? 4 : 2}
                      value={voiceAnswers[i] ?? ""}
                      onChange={(e) =>
                        setVoiceAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  onClick={onCompileFromForks}
                  disabled={busy !== null || forksPicked === 0 || !hasVoice}
                >
                  {busy === "forks"
                    ? t("coach.doctrine.start.forks.writing")
                    : t("coach.doctrine.start.forks.cta")}
                </Button>
                <span className="text-xs text-ink-soft">
                  {forksPicked === 0
                    ? t("coach.doctrine.start.forks.need_one")
                    : !hasVoice
                    ? t("coach.doctrine.start.forks.need_voice")
                    : plural(
                      forksPicked,
                      t("coach.doctrine.start.forks.answered_one", { count: forksPicked }),
                      t("coach.doctrine.start.forks.answered_many", { count: forksPicked }),
                    )}
                </span>
              </div>
            </Path>

            <Path
              id="document"
              title={t("coach.doctrine.start.document.title")}
              who={t("coach.doctrine.start.document.who")}
            >
              <p className="text-xs leading-5 text-ink-soft">
                {t("coach.doctrine.start.document.body")}
              </p>
              {/* L'emphase porte la phrase entière — « Upload <strong>your
                  own</strong> material » découpait un groupe nominal dont
                  l'ordre est celui de l'anglais. */}
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                <strong>{t("coach.doctrine.start.document.own_lead")}</strong>{" "}
                {t("coach.doctrine.start.document.own_body")}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {/* Un `<label>` déguisé en bouton: le champ de fichier caché vit
                    dedans, donc il ne peut pas devenir un `<Button>` sans casser
                    cette liaison. Il en prend le vocabulaire — contour de
                    contrôle, rayon plein, survol du kit. */}
                <label className="inline-flex min-w-0 cursor-pointer items-center rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-fig-50">
                  {docFile ? docFile.name : t("coach.doctrine.start.document.choose")}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={busy !== null}
                    onChange={(e) => {
                      const chosen = e.target.files?.[0] ?? null;
                      // Le refus arrive AVANT l'encodage et avant le réseau: un
                      // fichier de trente mégaoctets ne doit pas voyager pour se
                      // faire dire non à l'arrivée.
                      const rejection = chosen ? rejectDocument(chosen) : null;
                      setFailure(rejection);
                      setDocFile(rejection ? null : chosen);
                      e.target.value = "";
                    }}
                  />
                </label>
                {docFile ? (
                  <button
                    type="button"
                    className="text-xs text-ink-soft underline decoration-dotted underline-offset-2"
                    onClick={() => setDocFile(null)}
                  >
                    {t("coach.doctrine.start.document.clear")}
                  </button>
                ) : null}
                <span className="text-xs text-ink-soft">
                  {t("coach.doctrine.start.document.limits", {
                    mb: MAX_DOCUMENT_MB,
                    pages: MAX_DOCUMENT_PAGES,
                  })}
                </span>
              </div>

              {docFile ? (
                <div className="mt-4">
                  {/*
                    LE CHOIX EST EXPLICITE, et il ne l'est que quand il existe.
                    Sans méthode à l'écran il n'y a rien à écraser: un seul
                    bouton, et pas une question dont les deux réponses font la
                    même chose.
                  */}
                  {draft ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => onCompileDocument("add")} disabled={busy !== null}>
                          {busy === "document"
                            ? t("coach.doctrine.start.document.reading")
                            : t("coach.doctrine.start.document.add_cta")}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => onCompileDocument("replace")}
                          disabled={busy !== null}
                        >
                          {t("coach.doctrine.start.document.replace_cta")}
                        </Button>
                      </div>
                      <EffectOnExisting>
                        {t("coach.doctrine.start.document.effect")}
                      </EffectOnExisting>
                    </>
                  ) : (
                    <Button onClick={() => onCompileDocument("replace")} disabled={busy !== null}>
                      {busy === "document"
                        ? t("coach.doctrine.start.document.reading")
                        : t("coach.doctrine.start.document.read_cta")}
                    </Button>
                  )}
                  <p className="mt-2 text-xs leading-5 text-ink-soft">
                    {t("coach.doctrine.start.document.slow")}
                  </p>
                </div>
              ) : null}
            </Path>

            <Path
              id="interview"
              title={t("coach.doctrine.start.interview.title")}
              who={t("coach.doctrine.start.interview.who")}
            >
              <p className="text-xs leading-5 text-ink-soft">
                {t("coach.doctrine.start.interview.body")}
              </p>
              {draft ? (
                <EffectOnExisting>
                  <strong>{t("coach.doctrine.start.interview.replaces_lead")}</strong>{" "}
                  {t("coach.doctrine.start.interview.replaces_body")}
                </EffectOnExisting>
              ) : null}
              <div className="mt-4 space-y-4">
                {questions.map((q, i) => (
                  <Field
                    key={`${q.section}-${i}`}
                    label={q.question}
                    htmlFor={`q-${i}`}
                    hint={q.section === "hard_cases"
                      ? t("coach.doctrine.start.interview.word_for_word")
                      : undefined}
                  >
                    <textarea
                      id={`q-${i}`}
                      className={inputClass}
                      rows={3}
                      value={answers[i] ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-4">
                <Button onClick={onCompileInterview} disabled={busy !== null}>
                  {busy === "interview"
                    ? t("coach.doctrine.start.interview.reading")
                    : t("coach.doctrine.start.interview.cta")}
                </Button>
              </div>
            </Path>

            {/*
              (d) LA DÉLÉGATION — et toute la valeur tient dans ce que la copie
              dit.

              ⚠️ CE QU'ELLE NE DOIT JAMAIS DIRE: « ta méthode, prête à l'emploi ».
              Ce serait un mensonge, et c'est LE mensonge qui casse la promesse
              sur laquelle repose le produit entier. Le coach doit comprendre
              AVANT de cliquer que l'agent ne parlera pas en son nom.

              Ce que ça supprime, en échange: le clonage. Dix coachs qui
              adoptent le même bloc SOUS LEUR NOM, ce sont dix agents aux mêmes
              phrases, et le premier qui reconnaît son `instead` chez un
              concurrent arrête de payer. Ici il n'y a rien à reconnaître —
              c'est la même voix, exprès, et annoncée comme telle.
            */}
            <Path
              id="delegate"
              title={t("coach.doctrine.start.delegate.title")}
              who={t("coach.doctrine.start.delegate.who")}
            >
              {/* Le gras portait « “Sophia” » AU MILIEU de la phrase. Les
                  guillemets courbes portent déjà la mise en avant du nom, et la
                  phrase se traduit d'un bloc. */}
              <p className="text-sm leading-6 text-ink">
                {t("coach.doctrine.start.delegate.body")}
              </p>
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                {t("coach.doctrine.start.delegate.tradeoff")}
              </p>
              <EffectOnExisting>
                {t("coach.doctrine.start.delegate.effect")}
              </EffectOnExisting>

              <div className="mt-4">
                {doctrineSource === "house" ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => onSetSource("own")}
                      disabled={busy !== null}
                    >
                      {busy === "delegate"
                        ? t("coach.doctrine.start.delegate.switching")
                        : t("coach.doctrine.start.delegate.take_back")}
                    </Button>
                    <p className="mt-2 text-xs leading-5 text-ink-soft">
                      {t("coach.doctrine.start.delegate.take_back_note")}
                    </p>
                  </>
                ) : (
                  <>
                    <Button onClick={() => onSetSource("house")} disabled={busy !== null}>
                      {busy === "delegate"
                        ? t("coach.doctrine.start.delegate.switching")
                        : t("coach.doctrine.start.delegate.hand_over")}
                    </Button>
                    <p className="mt-2 text-xs leading-5 text-ink-soft">
                      {t("coach.doctrine.start.delegate.hand_over_note")}
                    </p>
                  </>
                )}
              </div>
            </Path>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

export default DoctrineStartDialog;
