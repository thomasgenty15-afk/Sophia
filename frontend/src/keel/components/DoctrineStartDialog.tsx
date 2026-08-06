import React from "react";
import { Button } from "./ui/Button";
import { Field, inputClass } from "./ui/Field";
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
  return <p className="mt-1 text-xs leading-5 text-gray-500">{children}</p>;
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
          notice:
            "Read it back. These are your positions — but the words are ours until " +
            "you rewrite them, and that is what the counter above the save button is " +
            "telling you.",
        });
      } catch (err) {
        // Ces deux codes ne veulent rien dire pour un coach. Ils ne disent PAS
        // la même chose, mais dans les deux cas la seule action utile est de
        // relancer. Les autres traversent tels quels.
        const code = err instanceof Error ? err.message : String(err);
        if (code === "generated_text_trips_own_lock") {
          throw new Error(
            "What came back contradicted one of your own red lines, so we threw it " +
              "away rather than write it down. Press the button again — it will come " +
              "out differently.",
          );
        }
        if (code === "compile_unparseable") {
          throw new Error("That one came back garbled and we dropped it. Press the button again.");
        }
        throw err;
      }
    });

  const onCompileDocument = (mode: "add" | "replace") =>
    run("document", async () => {
      if (!docFile) throw new Error("Choose a PDF first.");
      const out = await compileDocument(docFile, {
        mergeInto: mode === "add" ? draft : null,
        contentLocale,
      });
      const foods = out.proposals_saved > 0
        ? ` ${out.proposals_saved} food${out.proposals_saved > 1 ? "s" : ""} from it ${
          out.proposals_saved > 1 ? "are" : "is"
        } waiting on your Recommended food screen.`
        : "";
      setDocFile(null);
      onResult({
        draft: out.draft,
        issues: out.issues ?? [],
        notice: `Read ${out.page_count} page${out.page_count > 1 ? "s" : ""}. Check it back ` +
          `before saving — the AI transcribes, it does not decide.${foods}`,
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
      if (payload.length === 0) throw new Error("answer_at_least_one_question");
      const out = await callDoctrine<{ draft: DoctrineDraft; issues: string[] }>({
        action: "compile",
        answers: payload,
        content_locale: contentLocale,
      });
      onResult({
        draft: out.draft,
        issues: out.issues ?? [],
        notice: "Read it back before saving - the AI transcribes, it does not decide.",
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
      <li className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => setOpenPath(isOpen ? null : id)}
          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
          aria-expanded={isOpen}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">{title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-gray-500">{who}</span>
          </span>
          <span className="mt-1 shrink-0 text-xs text-gray-400">{isOpen ? "−" : "+"}</span>
        </button>
        {isOpen ? <div className="border-t border-gray-100 px-4 py-4">{children}</div> : null}
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-6 sm:py-10">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Where your method comes from</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Four ways in. Nothing here is saved, and nothing reaches a student
              until you publish.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {failure ? (
            <div className="mb-4 rounded-md bg-amber-50 px-3 py-2">
              <p className="text-sm text-gray-900">That did not go through.</p>
              <p className="mt-1 break-words text-xs text-gray-600">{failure}</p>
            </div>
          ) : null}

          {/*
            LA DÉLÉGATION EN COURS SE DIT EN HAUT, PAS AU FOND DU QUATRIÈME
            CHEMIN. Un coach qui délègue et qui ouvre cette modale pour écrire sa
            méthode doit savoir, avant de taper quoi que ce soit, que ses élèves
            lisent Sophia en ce moment.
          */}
          {doctrineSource === "house" ? (
            <div className="mb-4 rounded-md border border-gray-900/10 bg-gray-50 px-3 py-2">
              <p className="text-sm text-gray-900">
                Your students are being followed by Sophia's method right now, and
                your agent signs “Sophia”.
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-600">
                Writing your own below takes it back: publish it and your agent
                signs your name again.
              </p>
            </div>
          ) : null}

          <ul className="space-y-3">
            <Path
              id="forks"
              title="Answer a short questionnaire"
              who={
                <>
                  Ten things coaches disagree about, plus a few lines in your own
                  words. Fastest way in.
                </>
              }
            >
              <p className="text-xs leading-5 text-gray-500">
                Tap the side that is yours, and skip the ones you have no rule
                about. Skipping is an answer: your agent then says nothing on
                that subject rather than guessing.
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
                  <strong>This writes a new method and replaces what you have.</strong>{" "}
                  To add to what is already there, close this and use the pencils
                  on your method instead.
                </EffectOnExisting>
              ) : null}
              <div className="mt-4 space-y-4">
                {STARTER_FORKS.map((fork) => (
                  <div key={fork.key}>
                    <p className="text-sm font-medium text-gray-900">{fork.subject}</p>
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
                                ? "border-gray-900 bg-gray-900 text-white"
                                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
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
              <p className="mt-8 text-xs font-medium uppercase tracking-wide text-gray-500">
                How you talk
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
                  {busy === "forks" ? "Writing your method…" : "Write my method"}
                </Button>
                <span className="text-xs text-gray-500">
                  {forksPicked === 0
                    ? "Tap where you stand on at least one question."
                    : !hasVoice
                    ? "We need a couple of lines in your own words — that is the whole point."
                    : `${forksPicked} question${forksPicked > 1 ? "s" : ""} answered. ` +
                      "The rest stay blank, and that is fine."}
                </span>
              </div>
            </Path>

            <Path
              id="document"
              title="Start from something you already wrote"
              who="Your ebook, your method handbook, the FAQ you send new clients."
            >
              <p className="text-xs leading-5 text-gray-500">
                It is read once, and what comes out lands in your method for you
                to check — nothing is saved and nothing reaches a student until
                you publish.
              </p>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                Upload <strong>your own</strong>{" "}
                material. A textbook someone else wrote would put another
                author's positions in your agent's mouth, under your name.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  {docFile ? docFile.name : "Choose a PDF"}
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
                    className="text-xs text-gray-500 underline decoration-dotted underline-offset-2"
                    onClick={() => setDocFile(null)}
                  >
                    Clear
                  </button>
                ) : null}
                <span className="text-xs text-gray-500">
                  PDF, up to {MAX_DOCUMENT_MB} MB and {MAX_DOCUMENT_PAGES} pages.
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
                          {busy === "document" ? "Reading it…" : "Add to what I have"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => onCompileDocument("replace")}
                          disabled={busy !== null}
                        >
                          Start over from this document
                        </Button>
                      </div>
                      <EffectOnExisting>
                        Adding keeps every sentence you already have and only
                        fills the gaps — upload your documents one after another.
                        Starting over replaces all of it.
                      </EffectOnExisting>
                    </>
                  ) : (
                    <Button onClick={() => onCompileDocument("replace")} disabled={busy !== null}>
                      {busy === "document" ? "Reading it…" : "Read my document"}
                    </Button>
                  )}
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    A long document takes up to two minutes. Leave this tab open.
                  </p>
                </div>
              ) : null}
            </Path>

            <Path
              id="interview"
              title="Answer the full interview"
              who="Eleven questions in your own words. The longest way, and the one that sounds most like you."
            >
              <p className="text-xs leading-5 text-gray-500">
                Three of them ask for your sentence, word for word — that is what
                makes the agent sound like you rather than like a nutrition
                textbook.
              </p>
              {draft ? (
                <EffectOnExisting>
                  <strong>This one replaces everything you have.</strong>{" "}
                  Use it to rethink your method, not to fix a sentence — to fix a
                  sentence, close this and edit it directly.
                </EffectOnExisting>
              ) : null}
              <div className="mt-4 space-y-4">
                {questions.map((q, i) => (
                  <Field
                    key={`${q.section}-${i}`}
                    label={q.question}
                    htmlFor={`q-${i}`}
                    hint={q.section === "hard_cases" ? "Word for word." : undefined}
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
                  {busy === "interview" ? "Reading you…" : "Turn this into my method"}
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
              title="Let Sophia handle it"
              who="For a gym owner, or anyone who wants the service without a position to defend. No questions, one click."
            >
              <p className="text-sm leading-6 text-gray-900">
                Your students are followed by Sophia's method, and it says so:
                your agent signs <strong>“Sophia”</strong>, not your name.
              </p>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                This is not your method with the work done for you — it is a
                stand-in, and your students see it as one. In exchange you have
                nothing to write and nothing to keep up to date.
              </p>
              <EffectOnExisting>
                It replaces the whole source while it is on. Anything you have
                written stays exactly where it is — it just stops being read —
                and comes back the moment you switch off.
              </EffectOnExisting>

              <div className="mt-4">
                {doctrineSource === "house" ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => onSetSource("own")}
                      disabled={busy !== null}
                    >
                      {busy === "delegate" ? "Switching…" : "Take it back — sign my own name"}
                    </Button>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      Your students go back to your own published method. If you
                      have not published one, your agent answers from general
                      knowledge and never in your name.
                    </p>
                  </>
                ) : (
                  <>
                    <Button onClick={() => onSetSource("house")} disabled={busy !== null}>
                      {busy === "delegate" ? "Switching…" : "Hand it to Sophia"}
                    </Button>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                      Takes effect on your students' next message. You can take
                      it back at any time.
                    </p>
                  </>
                )}
              </div>
            </Path>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default DoctrineStartDialog;
