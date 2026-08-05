import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import {
  cacheFootprint,
  draftToDoctrine,
  GOAL_LABELS,
  GOAL_TOKENS,
  type GoalToken,
  PREVIEW_VARIANTS,
  previewVariants,
  scopeSentence,
  toggleGoalScope,
  variantLabel,
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
      setNotice("Read it back before saving - the AI transcribes, it does not decide.");
    });

  const onSave = () =>
    run("save", async () => {
      if (!draft) return;
      await callDoctrine({ action: "save", doctrine: draft });
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

        <Card>
          <SectionLabel>The interview</SectionLabel>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            Answer in your own words. The last three ask for your sentence, word
            for word — that is what makes the agent sound like you rather than
            like a nutrition textbook.
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
          <div className="mt-4">
            <Button onClick={onCompile} disabled={busy !== null}>
              {busy === "compile" ? "Reading you…" : "Turn this into my method"}
            </Button>
          </div>
        </Card>

        {draft ? (
          <Card>
            <SectionLabel>
              {draftOrigin === "loaded" ? "Your method" : "What I understood"}
            </SectionLabel>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              {draftOrigin === "loaded"
                ? (published
                  ? "This is what your agent is using right now. Run the interview above to change it — saving creates a new version, and your students keep reading this one until you publish the new one."
                  : "This is your latest saved version. It is not published, so your agent is not using it yet.")
                : "Nothing here is saved yet. If a line is not yours, it should not be here — edit your answers and run it again."}
            </p>

            {issues.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
                {issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            ) : null}

            <DraftPreview draft={draft} onScopeChange={setDraft} />

            <div className="mt-4 flex gap-2">
              <Button onClick={onSave} disabled={busy !== null}>
                {busy === "save" ? "Saving…" : "Save as draft"}
              </Button>
            </div>
          </Card>
        ) : null}

        {draft ? <VariantPreviewCard draft={draft} /> : null}

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

/**
 * LE MARQUEUR DE PORTÉE — divulgation progressive, et rien d'autre.
 *
 * ── POURQUOI PAS UN ONGLET PAR OBJECTIF ─────────────────────────────────
 * Cinq onglets, ou cinq colonnes, multiplieraient par cinq une saisie dont
 * l'essentiel est COMMUN — et le lot voisin vise « une méthode écrite en moins
 * de trois minutes ». Une croyance est globale par défaut; ce marqueur ne
 * s'ouvre que si le coach a quelque chose à restreindre.
 *
 * « Everyone » est affiché comme une VALEUR, pas comme un champ vide: c'est le
 * cas de l'écrasante majorité des entrées, et un coach ne doit pas avoir
 * l'impression d'avoir laissé son travail inachevé. Même arbitrage que le
 * « neutre » des pastilles du mapping alimentaire.
 */
function ScopeMarker({
  scope,
  onChange,
}: {
  scope: string[] | undefined;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const active = (scope ?? []).length > 0;
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-xs underline decoration-dotted underline-offset-2 ${
          active ? "text-gray-900" : "text-gray-400"
        }`}
      >
        {active ? `Only for: ${scopeSentence(scope)}` : "Everyone"}
      </button>
      {open ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              active
                ? "border-gray-200 bg-white text-gray-500"
                : "border-gray-900 bg-gray-900 text-white"
            }`}
          >
            Everyone
          </button>
          {GOAL_TOKENS.map((goal) => {
            const on = (scope ?? []).includes(goal);
            return (
              <button
                key={goal}
                type="button"
                onClick={() => onChange(toggleGoalScope(scope, goal))}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  on
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                {GOAL_LABELS[goal]}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * L'APERÇU PAR OBJECTIF — le seul moyen de vérifier ce qu'un marqueur a produit.
 *
 * Le bloc affiché n'est pas une reconstitution: c'est `compileDoctrineBlock`,
 * le module que le tour exécute (voir `api/coachDoctrine.ts`). Ce que le coach
 * lit ici est, mot pour mot, ce que l'élève de cet objectif recevra.
 *
 * Les objectifs qui reçoivent le MÊME bloc sont nommés, et c'est la moitié
 * utile: un coach qui vient de restreindre une croyance à la perte de gras et
 * qui lit « identical to: Health, Maintenance » sur la variante par défaut
 * apprend que sa restriction a fait exactement ce qu'il croyait — ou qu'elle
 * n'a rien fait du tout.
 */
function VariantPreviewCard({ draft }: { draft: DoctrineDraft }) {
  const [goal, setGoal] = React.useState<GoalToken | null>(null);
  const { doctrine, issues } = React.useMemo(
    () => draftToDoctrine(draft, null, "en"),
    [draft],
  );
  const variants = React.useMemo(() => previewVariants(doctrine), [doctrine]);
  const footprint = React.useMemo(() => cacheFootprint(doctrine), [doctrine]);
  const shown = variants.find((v) => v.goal === goal) ?? variants[0];

  return (
    <Card>
      <SectionLabel>What a student actually receives</SectionLabel>
      <p className="mt-2 text-xs leading-5 text-gray-500">
        Your voice, your words, your red lines and your foods go to every
        student — they are you, and they cannot be narrowed. Only what you
        believe and how you answer can be aimed at one kind of student.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PREVIEW_VARIANTS.map((g) => (
          <button
            key={g ?? "default"}
            type="button"
            onClick={() => setGoal(g)}
            className={`rounded-full border px-3 py-1 text-xs ${
              g === goal
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {variantLabel(g)}
          </button>
        ))}
      </div>

      {shown ? (
        <>
          <p className="mt-3 text-xs text-gray-500">
            {shown.sharesCacheWith.length > 0
              ? `Identical to: ${
                shown.sharesCacheWith.map((g) => variantLabel(g)).join(", ")
              }`
              : "This block goes to no other goal."}
          </p>
          {shown.compiled.emptyForGoal ? (
            <p className="mt-2 text-xs text-amber-800">
              Everything you wrote is aimed at other goals, so a student here
              gets nothing of your method. Your agent will say so rather than
              improvise one in your name.
            </p>
          ) : null}
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-5 text-gray-800">
            {shown.compiled.text || "Nothing yet."}
          </pre>
        </>
      ) : null}

      <p className="mt-3 text-xs text-gray-400">
        {footprint.variants} variants · {footprint.entries}{" "}
        distinct block{footprint.entries === 1 ? "" : "s"}
      </p>

      {issues.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
          {issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}
    </Card>
  );
}

/** Une section dont chaque entrée porte son marqueur de portée. */
function ScopedSection({
  label,
  empty,
  items,
}: {
  label: string;
  empty: string;
  items: Array<{
    key: string;
    text: string;
    scope: string[] | undefined;
    onChange: (scope: string[]) => void;
  }>;
}) {
  const visible = items.filter((i) => i.text.trim() && i.text.trim() !== "→");
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      {visible.length === 0 ? (
        <p className="mt-1 text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-2.5">
          {visible.map((item) => (
            <li key={item.key} className="border-l-2 border-gray-100 pl-3">
              <p className="text-sm text-gray-800">{item.text}</p>
              <ScopeMarker scope={item.scope} onChange={item.onChange} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Read-back of the compiled draft, in the coach's terms. */
function DraftPreview({
  draft,
  onScopeChange,
}: {
  draft: DoctrineDraft;
  onScopeChange: (next: DoctrineDraft) => void;
}) {
  // Les deux listes qui prennent une portée sont rendues à part, parce
  // qu'elles sont les seules à porter un contrôle. Les autres restent du texte.
  const setBeliefScope = (index: number, scope: string[]) =>
    onScopeChange({
      ...draft,
      beliefs: (draft.beliefs ?? []).map((b, i) => i === index ? { ...b, goal_scope: scope } : b),
    });
  const setArbitrationScope = (index: number, scope: string[]) =>
    onScopeChange({
      ...draft,
      arbitrations: (draft.arbitrations ?? []).map((a, i) =>
        i === index ? { ...a, goal_scope: scope } : a
      ),
    });

  const rows: Array<[string, string[]]> = [
    [
      "What your agent must never say",
      (draft.forbidden ?? []).map((f) => {
        const head = [String(f.token ?? ""), (f.surface_forms ?? []).join(" / ")]
          .filter(Boolean)
          .join(" — ");
        // Shown, and shown as MISSING when it is: an interdit with no
        // replacement is the one case where a student gets a flat refusal
        // instead of your answer, and you should be able to see that at a
        // glance rather than discover it from a student.
        const instead = String(f.instead ?? "").trim();
        return instead
          ? `${head}  ·  instead: “${instead}”`
          : `${head}  ·  no replacement set — students get a flat refusal here`;
      }),
    ],
    [
      "Your words",
      (draft.vocabulary ?? []).map((v) =>
        [String(v.term ?? ""), String(v.meaning ?? "")].filter(Boolean).join(": ")
      ),
    ],
    [
      "Foods you reach for",
      (draft.foods?.recommended ?? []).map((f) =>
        [String(f.term ?? ""), String(f.reason ?? "")].filter(Boolean).join(" — ")
      ),
    ],
    [
      "Foods you keep off the plate",
      (draft.foods?.discouraged ?? []).map((f) => {
        const head = [String(f.term ?? ""), (f.surface_forms ?? []).join(" / ")]
          .filter(Boolean)
          .join(" — ");
        // Les formulations sont montrées, et leur ABSENCE est dite. Un aliment
        // sans surface_forms est un aliment que le filtre ne reconnaîtra
        // presque jamais dans une phrase réelle: mieux vaut le voir ici que le
        // découvrir quand l'agent l'aura suggéré à un élève.
        return (f.surface_forms ?? []).length > 0
          ? head
          : `${head}  ·  no phrasings recorded — this one will be hard to catch`;
      }),
    ],
    [
      "What you have already answered",
      (draft.qa ?? []).map((q) =>
        `${String(q.question ?? "")} → ${String(q.answer ?? "")}`
      ),
    ],
  ];
  const beliefs = draft.beliefs ?? [];
  const arbitrations = draft.arbitrations ?? [];

  return (
    <div className="mt-4 space-y-4">
      {/*
        LES DEUX SECTIONS QUI PORTENT UNE PORTÉE, en tête et ensemble.
        Elles sont les seules à en prendre une, et les mettre côte à côte
        apprend cette règle sans avoir à l'écrire une deuxième fois.
      */}
      <ScopedSection
        label="What you believe"
        empty="Nothing — you did not say anything I could use here."
        items={beliefs.map((b, i) => ({
          key: `belief-${i}`,
          text: String(b.claim ?? ""),
          scope: b.goal_scope,
          onChange: (scope: string[]) => setBeliefScope(i, scope),
        }))}
      />
      <ScopedSection
        label="How you answer"
        empty="Nothing — you did not say anything I could use here."
        items={arbitrations.map((a, i) => ({
          key: `arb-${i}`,
          text: `${String(a.situation ?? "")} → ${String(a.coach_answer ?? "")}`,
          scope: a.goal_scope,
          onChange: (scope: string[]) => setArbitrationScope(i, scope),
        }))}
      />

      {rows.map(([label, items]) => (
        <div key={label}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {label}
          </p>
          {items.filter(Boolean).length === 0 ? (
            <p className="mt-1 text-sm text-gray-400">
              Nothing — you did not say anything I could use here.
            </p>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-800">
              {items.filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
