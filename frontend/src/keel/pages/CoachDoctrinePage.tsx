import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import {
  addEntry,
  entriesForScope,
  GOAL_LABELS,
  GOAL_TOKENS,
  type GoalToken,
  joinForms,
  patchEntry,
  pruneDraft,
  removeEntry,
  splitForms,
} from "../api/coachDoctrine";

/**
 * PIVOT NUTRITION §3.7 — `/coach/doctrine`: the Doctrine Copilot.
 *
 * THE SCREEN THAT DID NOT EXIST. The pivot inventory (ANNEXE A) found ~70% of
 * the coach UI already built and exactly two screens missing; this is the one
 * that carries the product's core claim — "c'est MON agent".
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A TEXTAREA
 * ---------------------------------------------------------------------------
 * "Le coach n'est ni prompt-engineer ni développeur." A raw prompt box asks him
 * to be both, and the result is either empty or unusable. So the screen is an
 * INTERVIEW: it asks seven questions in his own domain, and the AI compiles the
 * answers into configuration. He speaks, the machine configures.
 *
 * The questions come from the server (`action: "questions"`), never from a copy
 * in this file. Two lists would diverge on the first edit, and the prompt that
 * compiles the answers is written against the server's list.
 *
 * ---------------------------------------------------------------------------
 * "L'IA TRANSCRIT, ELLE N'ÉCRIT JAMAIS" — the rule this screen inherits
 * ---------------------------------------------------------------------------
 * `compile` returns a DRAFT and writes nothing. The coach reads it back, edits
 * it, and only then saves. It is the same authority rule the plan import screen
 * already implements (`PlanImportPage`), applied to the doctrine: the AI never
 * commits something the coach has not seen.
 *
 * And saving is still not publishing. Draft -> save -> publish are three
 * gestures because the middle one is where the coach discovers the AI
 * misheard him.
 *
 * ---------------------------------------------------------------------------
 * FAIL LOUD, SHOW NOTHING
 * ---------------------------------------------------------------------------
 * A failed read renders the error, never an empty state. "You have no doctrine
 * yet" and "we could not read your doctrine" are different sentences, and
 * showing the first for the second invites a coach to rewrite everything he
 * already wrote.
 */

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-doctrine-v1`;

interface InterviewQuestion {
  section: string;
  question: string;
}

interface VersionRow {
  version: number;
  published_at: string | null;
  created_from_version: number | null;
  change_note: string | null;
  created_at: string;
}

interface DoctrineDraft {
  beliefs?: Array<{
    claim?: string;
    rationale?: string | null;
    /**
     * QUI reçoit cette conviction. Absent ou vide = tout le monde.
     *
     * Facultatif, et il doit le rester: l'écrasante majorité de ce qu'un coach
     * écrit vaut pour tous ses élèves, et un champ obligatoire ici
     * multiplierait par cinq une saisie dont l'essentiel est commun.
     */
    goal_scope?: string[];
  }>;
  forbidden?: Array<{
    token?: string;
    surface_forms?: string[];
    reason?: string | null;
    /**
     * What you do INSTEAD, in your own words.
     *
     * This is not decoration. When your agent is about to say something you
     * forbid, this text is what the student receives in its place. Students in
     * a masterclass have no one-to-one channel back to you — "ask your coach"
     * points at a door that does not exist — so an interdit without an
     * `instead` gets a flat refusal, and an interdit with one gets YOUR answer.
     */
    instead?: string | null;
  }>;
  vocabulary?: Array<{ term?: string; meaning?: string | null }>;
  arbitrations?: Array<{ situation?: string; coach_answer?: string; goal_scope?: string[] }>;
  foods?: {
    recommended?: Array<{ term?: string; reason?: string | null }>;
    discouraged?: Array<{ term?: string; surface_forms?: string[]; reason?: string | null }>;
  };
  qa?: Array<{ question?: string; answer?: string }>;
  voice?: Record<string, unknown>;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

async function callDoctrine<T>(payload: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    // The server's reason code travels to the screen. A generic "something went
    // wrong" would hide `coach_suspended` and `compile_unparseable`, which mean
    // very different things to the person reading.
    throw new Error(String(json?.error ?? `HTTP ${res.status}`));
  }
  return json as T;
}

export default function CoachDoctrinePage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [questions, setQuestions] = React.useState<InterviewQuestion[]>([]);
  const [versions, setVersions] = React.useState<VersionRow[]>([]);
  const [answers, setAnswers] = React.useState<Record<number, string>>({});
  const [draft, setDraft] = React.useState<DoctrineDraft | null>(null);
  /**
   * D'OÙ VIENT CE QUI EST À L'ÉCRAN — et ce n'est pas cosmétique.
   *
   * La carte disait « Nothing here is saved yet » quoi qu'il arrive, parce
   * qu'elle n'existait que pour un brouillon fraîchement compilé. Affichée
   * au-dessus d'une doctrine PUBLIÉE, rechargée depuis la base, cette phrase est
   * fausse — et fausse dans le sens dangereux: elle dit à un coach que ce que
   * ses élèves reçoivent déjà n'est pas enregistré.
   */
  const [draftOrigin, setDraftOrigin] = React.useState<"compiled" | "loaded" | null>(null);
  const [issues, setIssues] = React.useState<string[]>([]);
  /**
   * L'interview est dépliée tant qu'il n'y a rien d'écrit, et repliée après.
   * L'état est ici et pas dans la carte pour que `onCompile` puisse la laisser
   * ouverte: le coach vient de la lancer, il veut relire ses réponses à côté de
   * ce que l'IA en a fait.
   */
  const [interviewOpen, setInterviewOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  /**
   * ── LA DOCTRINE EXISTANTE EST ROUVERTE, PAS REDEMANDÉE ──────────────────
   *
   * LE DÉFAUT, SIGNALÉ PAR UN COACH (2026-08-05): « je ne peux pas accéder à ce
   * qui est déjà écrit », et « le coach ne va pas tout réécrire à chaque fois ».
   * Il avait raison sur les deux, et c'était la même cause: cet écran ne
   * chargeait que les QUESTIONS et la liste des VERSIONS (numéro, date, note).
   * Le contenu, lui, n'était lisible par aucune action. Une doctrine déjà
   * publiée était donc invisible sur son propre écran, et la seule façon d'en
   * produire une était de refaire l'interview de zéro — pour corriger une
   * phrase.
   *
   * `current` rend la doctrine publiée (à défaut, le dernier brouillon) dans la
   * forme de l'éditeur. On la met dans `draft`, donc l'écran s'ouvre PRÉ-REMPLI
   * et modifiable, et l'interview redevient ce qu'elle aurait dû rester: le
   * chemin du premier jour, pas le seul chemin.
   *
   * `draft` n'est écrasé que s'il est vide: un rafraîchissement déclenché par
   * un enregistrement ne doit pas jeter les modifications en cours.
   */
  const refresh = React.useCallback(async () => {
    const [q, v, c] = await Promise.all([
      callDoctrine<{ questions: InterviewQuestion[] }>({ action: "questions" }),
      callDoctrine<{ versions: VersionRow[] }>({ action: "list" }),
      callDoctrine<{ doctrine: DoctrineDraft | null }>({ action: "current" }),
    ]);
    setQuestions(q.questions ?? []);
    setVersions(v.versions ?? []);
    if (c.doctrine) {
      setDraft((existing) => existing ?? c.doctrine);
      setDraftOrigin((existing) => existing ?? "loaded");
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const published = versions.find((v) => v.published_at) ?? null;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setFailure(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const onCompile = () =>
    run("compile", async () => {
      const payload = questions
        .map((q, i) => ({
          section: q.section,
          question: q.question,
          answer: (answers[i] ?? "").trim(),
        }))
        .filter((a) => a.answer !== "");
      if (payload.length === 0) {
        throw new Error("answer_at_least_one_question");
      }
      const out = await callDoctrine<{ draft: DoctrineDraft; issues: string[] }>({
        action: "compile",
        answers: payload,
      });
      setDraft(out.draft ?? null);
      setDraftOrigin(out.draft ? "compiled" : null);
      setIssues(out.issues ?? []);
      // L'interview reste OUVERTE après une compilation. Elle se replie parce
      // qu'un coach qui revient corriger une phrase n'en a pas besoin — pas
      // parce qu'un `draft` existe. Se refermer sur les réponses qu'il vient
      // d'écrire, au moment précis où il doit vérifier que l'IA l'a bien lu,
      // serait le contraire de ce que le repli cherche à faire.
      setInterviewOpen(true);
      setNotice("Read it back before saving - the AI transcribes, it does not decide.");
    });

  const onSave = () =>
    run("save", async () => {
      if (!draft) return;
      // Les lignes ouvertes et non remplies ne partent pas en base: elles y
      // seraient lâchées à la relecture avec un avertissement, et recopiées à
      // chaque nouvelle version.
      const clean = pruneDraft(draft);
      await callDoctrine({ action: "save", doctrine: clean });
      setDraft(clean);
      await refresh();
      setNotice("Saved as a draft. It is not live until you publish it.");
    });

  const onPublish = (version: number) =>
    run(`publish-${version}`, async () => {
      await callDoctrine({ action: "publish", version });
      await refresh();
      setNotice(`v${version} is live. Your students' next message uses it.`);
    });

  const onRollback = (version: number) =>
    run(`rollback-${version}`, async () => {
      const out = await callDoctrine<{ created: { version: number } }>({
        action: "rollback",
        to_version: version,
      });
      await refresh();
      // Named precisely: a rollback COPIES into a new version. Saying "reverted
      // to v1" would describe a history the product deliberately does not keep.
      setNotice(
        `Copied v${version} into v${out.created.version}. Publish it to make it live.`,
      );
    });

  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="coach" title="Doctrine">
        <p className="text-sm text-gray-500">Loading…</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "error") {
    return (
      <KeelAppShell variant="coach" title="Doctrine">
        <Card tone="warning">
          <p className="text-sm text-gray-900">We could not read your doctrine.</p>
          <p className="mt-1 text-xs text-gray-600">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell variant="coach" title="Doctrine">
      <div className="space-y-6">
        <Card>
          <SectionLabel>What this is</SectionLabel>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Your agent answers your students in your method and your voice. It
            learns that here — by interviewing you, not by asking you to write a
            prompt. Nothing you write reaches a student until you publish it.
          </p>
          {published ? (
            <p className="mt-3 text-sm text-gray-900">
              <Badge tone="positive">Live</Badge>{" "}
              <span className="ml-1">
                v{published.version} — published{" "}
                {new Date(published.published_at as string).toLocaleDateString()}
              </span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-gray-700">
              <Badge tone="caution">Nothing published</Badge>{" "}
              <span className="ml-1">
                Until you publish, your agent stays deliberately cautious: it
                sticks to what your protocol already says and defers the rest to
                you.
              </span>
            </p>
          )}
        </Card>

        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-gray-900">That did not go through.</p>
            <p className="mt-1 text-xs text-gray-600">{failure}</p>
          </Card>
        ) : null}
        {notice ? (
          <Card>
            <p className="text-sm text-gray-900">{notice}</p>
          </Card>
        ) : null}

        {/*
          LA DOCTRINE S'ÉDITE ICI, DANS SES PROPRES CASES.
          Le contenu écrit est la SOURCE, pas un compte rendu affiché sous
          l'interview: corriger une phrase ne doit pas obliger à tout redire.
        */}
        {draft ? (
          <>
            <Card>
              <SectionLabel>
                {draftOrigin === "loaded" ? "Your method" : "What I understood"}
              </SectionLabel>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {draftOrigin === "loaded"
                  ? (published
                    ? "This is what your agent is using right now, and you can edit it here. Saving creates a new version; your students keep reading this one until you publish the new one."
                    : "This is your latest saved version. It is not published, so your agent is not using it yet.")
                  : "Nothing here is saved yet. If a line is not yours, it should not be here — change it, or delete it."}
              </p>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                Everything in this card goes to <strong>every</strong>{" "}
                student. Your voice, your words and your red lines are you — they
                are never narrowed to one kind of student.
              </p>

              {issues.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
                  {issues.map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              ) : null}

              <GlobalEditor draft={draft} onChange={setDraft} />

              <div className="mt-5 flex gap-2">
                <Button onClick={onSave} disabled={busy !== null}>
                  {busy === "save" ? "Saving…" : "Save as draft"}
                </Button>
              </div>
            </Card>

            <SpecificEditor draft={draft} onChange={setDraft} />
          </>
        ) : null}

        {/*
          L'INTERVIEW EST LE CHEMIN DU PREMIER JOUR, ET SEULEMENT ÇA.

          Tant qu'il n'y a rien d'écrit, elle est l'écran: il n'y a pas d'autre
          porte. Dès qu'il y a une doctrine, elle se replie derrière un lien en
          bas de page — un coach qui revient corriger une phrase ne doit pas
          faire défiler onze questions dépliées pour arriver à ses cases, et
          onze textareas vides au-dessus de son travail donnent l'impression
          qu'il reste quelque chose à remplir.

          Et elle reste DESTRUCTRICE: la relancer remplace ce qui est écrit.
          C'est pour ça qu'elle est une option qu'on ouvre, pas un formulaire
          qu'on croise.
        */}
        <Card>
          <SectionLabel>
            {draft ? "Start over from an interview" : "The interview"}
          </SectionLabel>
          {draft && !interviewOpen ? (
            <>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                Rethinking your method from scratch? Answer the interview again
                and the AI rewrites everything above. To fix a sentence, edit it
                directly instead.
              </p>
              <button
                type="button"
                onClick={() => setInterviewOpen(true)}
                className="mt-3 text-xs text-gray-700 underline decoration-dotted underline-offset-2 hover:text-gray-900"
              >
                Open the interview
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {draft
                  ? "Answering these again REPLACES what is in the card above. Use it when you want to rethink your method, not to fix a sentence."
                  : "Answer in your own words. Three of them ask for your sentence, word for word — that is what makes the agent sound like you rather than like a nutrition textbook."}
              </p>
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
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={onCompile} disabled={busy !== null}>
                  {busy === "compile" ? "Reading you…" : "Turn this into my method"}
                </Button>
                {draft ? (
                  <Button
                    variant="secondary"
                    onClick={() => setInterviewOpen(false)}
                    disabled={busy !== null}
                  >
                    Close
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </Card>

        <Card>
          <SectionLabel>Versions</SectionLabel>
          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              No version yet. The interview above creates the first one.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {versions.slice().reverse().map((v) => (
                <li key={v.version} className="flex items-center gap-3 py-3">
                  <span className="w-14 text-sm font-medium text-gray-900">
                    v{v.version}
                  </span>
                  <span className="flex-1 text-xs text-gray-600">
                    {v.published_at ? <Badge tone="positive">Live</Badge> : (
                      <Badge tone="neutral">Draft</Badge>
                    )}
                    {v.created_from_version ? (
                      <span className="ml-2">
                        copied from v{v.created_from_version}
                      </span>
                    ) : null}
                    {v.change_note ? (
                      <span className="ml-2 text-gray-500">{v.change_note}</span>
                    ) : null}
                  </span>
                  {!v.published_at ? (
                    <Button
                      size="sm"
                      onClick={() => onPublish(v.version)}
                      disabled={busy !== null}
                    >
                      Publish
                    </Button>
                  ) : null}
                  {published && v.version !== published.version ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onRollback(v.version)}
                      disabled={busy !== null}
                    >
                      Go back to this
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </KeelAppShell>
  );
}


// ── L'APERÇU PAR OBJECTIF A ÉTÉ RETIRÉ, ET C'EST DÉLIBÉRÉ ────────────────
//
// Il montrait le bloc compilé, variante par variante, sous le titre « what a
// student actually receives ». Deux raisons de le retirer:
//
//   · le bloc est reçu par l'AGENT, pas par l'élève. Un coach qui lit un
//     prompt système présenté comme « ce que reçoit ton élève » en conclut
//     que ses élèves lisent ça — et c'est faux;
//   · d'une variante à l'autre, ce qui bouge tient en deux ou trois lignes
//     au milieu d'un bloc identique. Le coach fait un diff à l'œil pour
//     retrouver ce qu'il vient d'écrire.
//
// Les fonctions qui le produisaient (`previewVariants`, `cacheFootprint`)
// restent dans `api/coachDoctrine.ts` avec leurs tests: elles prouvent que
// le front exécute LE compilateur du serveur et pas une copie. Le jour où
// l'aperçu revient, il devra dire « ton agent », montrer ce qui DIFFÈRE, et
// pas un mur de prompt.

// ---------------------------------------------------------------------------
// LES BRIQUES D'ÉDITION
// ---------------------------------------------------------------------------

/** Une ligne de formulaire: son contenu, et le bouton qui la retire. */
function Row({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <li className="rounded-md border border-gray-100 bg-gray-50/60 p-3">
      <div className="space-y-2">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-2 text-xs text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-700"
      >
        Remove
      </button>
    </li>
  );
}

function TextRow({
  label,
  value,
  placeholder,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {rows && rows > 1 ? (
        <textarea
          className={inputClass}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-900"
    >
      + {label}
    </button>
  );
}

function EditorSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-gray-400">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * LES CROYANCES ET LES CAS DURS, ÉDITABLES — la brique commune aux deux parties.
 *
 * Elle est partagée par la partie GLOBALE et par chaque DYNAMIQUE, parce que
 * c'est littéralement la même donnée: une conviction est une conviction, et la
 * seule différence entre les deux parties est la portée que l'écran y attache.
 * Deux implémentations divergeraient au premier champ ajouté.
 */
function BeliefsAndAnswers({
  draft,
  onChange,
  goal,
}: {
  draft: DoctrineDraft;
  onChange: (next: DoctrineDraft) => void;
  goal: GoalToken | null;
}) {
  const scope = goal === null ? undefined : [goal];
  const beliefs = entriesForScope(draft.beliefs, goal);
  const arbitrations = entriesForScope(draft.arbitrations, goal);

  return (
    <div className="space-y-5">
      <EditorSection
        title="What you believe"
        hint={goal === null
          ? "One conviction per line. The 'why' is what lets your agent explain instead of assert."
          : `Only students on ${GOAL_LABELS[goal]} will ever read these.`}
      >
        {beliefs.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {beliefs.map(({ index, entry }) => (
              <Row
                key={`belief-${index}`}
                onRemove={() => onChange({ ...draft, beliefs: removeEntry(draft.beliefs, index) })}
              >
                <TextRow
                  label="What you believe"
                  value={String(entry.claim ?? "")}
                  rows={2}
                  onChange={(claim) =>
                    onChange({ ...draft, beliefs: patchEntry(draft.beliefs, index, { claim }) })}
                />
                <TextRow
                  label="Why (optional)"
                  value={String(entry.rationale ?? "")}
                  onChange={(rationale) =>
                    onChange({
                      ...draft,
                      beliefs: patchEntry(draft.beliefs, index, { rationale }),
                    })}
                />
              </Row>
            ))}
          </ul>
        )}
        <AddButton
          label="Add a conviction"
          onClick={() =>
            onChange({
              ...draft,
              beliefs: addEntry(draft.beliefs, { claim: "", rationale: "", goal_scope: scope }),
            })}
        />
      </EditorSection>

      <EditorSection
        title="How you answer"
        hint={goal === null
          ? "The situation, and your sentence — word for word. It is what makes the agent sound like you."
          : `The hard cases that only come up with ${GOAL_LABELS[goal]} students.`}
      >
        {arbitrations.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {arbitrations.map(({ index, entry }) => (
              <Row
                key={`arb-${index}`}
                onRemove={() =>
                  onChange({ ...draft, arbitrations: removeEntry(draft.arbitrations, index) })}
              >
                <TextRow
                  label="When a student…"
                  value={String(entry.situation ?? "")}
                  onChange={(situation) =>
                    onChange({
                      ...draft,
                      arbitrations: patchEntry(draft.arbitrations, index, { situation }),
                    })}
                />
                <TextRow
                  label="You answer, word for word"
                  value={String(entry.coach_answer ?? "")}
                  rows={2}
                  onChange={(coach_answer) =>
                    onChange({
                      ...draft,
                      arbitrations: patchEntry(draft.arbitrations, index, { coach_answer }),
                    })}
                />
              </Row>
            ))}
          </ul>
        )}
        <AddButton
          label="Add a hard case"
          onClick={() =>
            onChange({
              ...draft,
              arbitrations: addEntry(draft.arbitrations, {
                situation: "",
                coach_answer: "",
                goal_scope: scope,
              }),
            })}
        />
      </EditorSection>
    </div>
  );
}

/**
 * LA PARTIE GLOBALE — tout ce qui va à tous les élèves.
 *
 * Elle porte les croyances et les cas durs SANS portée, plus les quatre
 * sections qui n'en prennent jamais: la voix, le vocabulaire, les interdits et
 * les aliments. Ces quatre-là ne sont pas « pas encore ciblables »: un interdit
 * borné à un objectif serait une préférence, pas un interdit.
 */
function GlobalEditor({
  draft,
  onChange,
}: {
  draft: DoctrineDraft;
  onChange: (next: DoctrineDraft) => void;
}) {
  const voice = (draft.voice ?? {}) as Record<string, unknown>;
  const setVoice = (patch: Record<string, unknown>) =>
    onChange({ ...draft, voice: { ...voice, ...patch } });
  const foods = draft.foods ?? {};
  const setFoods = (patch: Partial<NonNullable<DoctrineDraft["foods"]>>) =>
    onChange({ ...draft, foods: { ...foods, ...patch } });

  return (
    <div className="mt-4 space-y-6">
      <BeliefsAndAnswers draft={draft} onChange={onChange} goal={null} />

      <EditorSection
        title="What your agent must never say"
        hint="A token your code can branch on, the phrasings a model would actually write, and — the important one — what you say INSTEAD. Without an 'instead', a student gets a flat refusal rather than your answer."
      >
        {(draft.forbidden ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {(draft.forbidden ?? []).map((f, index) => (
              <Row
                key={`forb-${index}`}
                onRemove={() =>
                  onChange({ ...draft, forbidden: removeEntry(draft.forbidden, index) })}
              >
                <TextRow
                  label="The thing itself"
                  value={String(f.token ?? "")}
                  placeholder="six_small_meals"
                  onChange={(token) =>
                    onChange({ ...draft, forbidden: patchEntry(draft.forbidden, index, { token }) })}
                />
                <TextRow
                  label="How people actually write it (comma-separated)"
                  value={joinForms(f.surface_forms)}
                  placeholder="6 petits repas, six small meals, grazing all day"
                  onChange={(raw) =>
                    onChange({
                      ...draft,
                      forbidden: patchEntry(draft.forbidden, index, {
                        surface_forms: splitForms(raw),
                      }),
                    })}
                />
                <TextRow
                  label="Why you refuse it (optional)"
                  value={String(f.reason ?? "")}
                  onChange={(reason) =>
                    onChange({
                      ...draft,
                      forbidden: patchEntry(draft.forbidden, index, { reason }),
                    })}
                />
                <TextRow
                  label="What you say INSTEAD — this exact text reaches your students"
                  value={String(f.instead ?? "")}
                  rows={2}
                  onChange={(instead) =>
                    onChange({
                      ...draft,
                      forbidden: patchEntry(draft.forbidden, index, { instead }),
                    })}
                />
                {!String(f.instead ?? "").trim() ? (
                  <p className="text-xs text-amber-800">
                    No replacement set — students get a flat refusal here.
                  </p>
                ) : null}
              </Row>
            ))}
          </ul>
        )}
        <AddButton
          label="Add a red line"
          onClick={() =>
            onChange({
              ...draft,
              forbidden: addEntry(draft.forbidden, {
                token: "",
                surface_forms: [],
                reason: "",
                instead: "",
              }),
            })}
        />
      </EditorSection>

      <EditorSection title="Your words" hint="The terms that are yours, and what they mean exactly.">
        {(draft.vocabulary ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {(draft.vocabulary ?? []).map((v, index) => (
              <Row
                key={`vocab-${index}`}
                onRemove={() =>
                  onChange({ ...draft, vocabulary: removeEntry(draft.vocabulary, index) })}
              >
                <TextRow
                  label="The word"
                  value={String(v.term ?? "")}
                  onChange={(term) =>
                    onChange({
                      ...draft,
                      vocabulary: patchEntry(draft.vocabulary, index, { term }),
                    })}
                />
                <TextRow
                  label="What it means"
                  value={String(v.meaning ?? "")}
                  onChange={(meaning) =>
                    onChange({
                      ...draft,
                      vocabulary: patchEntry(draft.vocabulary, index, { meaning }),
                    })}
                />
              </Row>
            ))}
          </ul>
        )}
        <AddButton
          label="Add a word"
          onClick={() =>
            onChange({ ...draft, vocabulary: addEntry(draft.vocabulary, { term: "", meaning: "" }) })}
        />
      </EditorSection>

      <EditorSection title="Foods you reach for">
        {(foods.recommended ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {(foods.recommended ?? []).map((f, index) => (
              <Row
                key={`food-r-${index}`}
                onRemove={() => setFoods({ recommended: removeEntry(foods.recommended, index) })}
              >
                <TextRow
                  label="Food"
                  value={String(f.term ?? "")}
                  onChange={(term) =>
                    setFoods({ recommended: patchEntry(foods.recommended, index, { term }) })}
                />
                <TextRow
                  label="Why (optional)"
                  value={String(f.reason ?? "")}
                  onChange={(reason) =>
                    setFoods({ recommended: patchEntry(foods.recommended, index, { reason }) })}
                />
              </Row>
            ))}
          </ul>
        )}
        <AddButton
          label="Add a food"
          onClick={() => setFoods({ recommended: addEntry(foods.recommended, { term: "", reason: "" }) })}
        />
      </EditorSection>

      <EditorSection
        title="Foods you keep off the plate"
        hint="Give the phrasings too — 'seed oil' almost never appears as those two words in a real sentence, and a bare term is a filter that catches nothing."
      >
        {(foods.discouraged ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {(foods.discouraged ?? []).map((f, index) => (
              <Row
                key={`food-d-${index}`}
                onRemove={() => setFoods({ discouraged: removeEntry(foods.discouraged, index) })}
              >
                <TextRow
                  label="Food"
                  value={String(f.term ?? "")}
                  onChange={(term) =>
                    setFoods({ discouraged: patchEntry(foods.discouraged, index, { term }) })}
                />
                <TextRow
                  label="How people write it (comma-separated)"
                  value={joinForms(f.surface_forms)}
                  onChange={(raw) =>
                    setFoods({
                      discouraged: patchEntry(foods.discouraged, index, {
                        surface_forms: splitForms(raw),
                      }),
                    })}
                />
              </Row>
            ))}
          </ul>
        )}
        <AddButton
          label="Add a food"
          onClick={() =>
            setFoods({
              discouraged: addEntry(foods.discouraged, { term: "", surface_forms: [] }),
            })}
        />
      </EditorSection>

      <EditorSection title="What you have already answered">
        {(draft.qa ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {(draft.qa ?? []).map((q, index) => (
              <Row key={`qa-${index}`} onRemove={() => onChange({ ...draft, qa: removeEntry(draft.qa, index) })}>
                <TextRow
                  label="They ask"
                  value={String(q.question ?? "")}
                  onChange={(question) =>
                    onChange({ ...draft, qa: patchEntry(draft.qa, index, { question }) })}
                />
                <TextRow
                  label="You answer"
                  value={String(q.answer ?? "")}
                  rows={2}
                  onChange={(answer) =>
                    onChange({ ...draft, qa: patchEntry(draft.qa, index, { answer }) })}
                />
              </Row>
            ))}
          </ul>
        )}
        <AddButton
          label="Add a question"
          onClick={() => onChange({ ...draft, qa: addEntry(draft.qa, { question: "", answer: "" }) })}
        />
      </EditorSection>

      <EditorSection title="Your voice">
        <div className="grid gap-2 sm:grid-cols-2">
          <TextRow
            label="How you address them (tu / vous)"
            value={String(voice.address ?? "")}
            onChange={(address) => setVoice({ address })}
          />
          <TextRow
            label="Language you write in (e.g. fr-FR)"
            value={String(voice.language ?? "")}
            onChange={(language) => setVoice({ language })}
          />
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Length</span>
            <select
              className={inputClass}
              value={String(voice.length ?? "")}
              onChange={(e) => setVoice({ length: e.target.value || null })}
            >
              <option value="">—</option>
              <option value="short">Short — two or three sentences</option>
              <option value="medium">A short paragraph</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Emojis</span>
            <select
              className={inputClass}
              value={String(voice.emojis ?? "")}
              onChange={(e) => setVoice({ emojis: e.target.value || null })}
            >
              <option value="">—</option>
              <option value="none">None</option>
              <option value="light">At most one</option>
            </select>
          </label>
        </div>
      </EditorSection>
    </div>
  );
}

/**
 * LA PARTIE SPÉCIFIQUE — ce qui ne s'adresse qu'à une sorte d'élève.
 *
 * ── POURQUOI UN SÉLECTEUR ET PAS CINQ COLONNES ──────────────────────────
 * Cinq colonnes montreraient en permanence quatre saisies vides à un coach dont
 * l'essentiel du travail est commun. Un sélecteur montre UNE dynamique à la
 * fois, et le compteur à côté de chaque bouton dit où il a déjà écrit quelque
 * chose — c'est tout ce dont il a besoin pour savoir ce qu'il lui reste à faire.
 *
 * Ce qu'il tape ici est stocké tel quel, avec la portée de la dynamique
 * choisie. Aucun modèle entre lui et sa base: la partie globale passe par
 * l'interview parce qu'il y raconte sa méthode; ici il complète, et il n'y a
 * rien à transcrire.
 */
function SpecificEditor({
  draft,
  onChange,
}: {
  draft: DoctrineDraft;
  onChange: (next: DoctrineDraft) => void;
}) {
  const [goal, setGoal] = React.useState<GoalToken>(GOAL_TOKENS[0]);
  const countFor = (g: GoalToken) =>
    entriesForScope(draft.beliefs, g).length + entriesForScope(draft.arbitrations, g).length;

  return (
    <Card>
      <SectionLabel>Specific to one kind of student</SectionLabel>
      <p className="mt-2 text-xs leading-5 text-gray-500">
        What you write here reaches <strong>only</strong>{" "}
        students on that goal. Everything else you wrote above still reaches
        them too — this adds, it never replaces.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {GOAL_TOKENS.map((g) => {
          const n = countFor(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGoal(g)}
              className={`rounded-full border px-3 py-1 text-xs ${
                g === goal
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              {GOAL_LABELS[g]}
              {n > 0 ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <BeliefsAndAnswers draft={draft} onChange={onChange} goal={goal} />
      </div>
    </Card>
  );
}
