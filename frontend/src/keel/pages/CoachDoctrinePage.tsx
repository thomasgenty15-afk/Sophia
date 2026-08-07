import React from "react";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { inputClass } from "../components/ui/Field";
import {
  DoctrineStartDialog,
  type DoctrineStartResult,
} from "../components/DoctrineStartDialog";
import {
  addEntry,
  callDoctrine,
  cancelSection,
  closeSection,
  type DoctrineDraft,
  type DoctrineSource,
  entriesForScope,
  GOAL_LABELS,
  GOAL_TOKENS,
  type GoalToken,
  isDraftEmpty,
  joinForms,
  openSection,
  patchEntry,
  pruneDraft,
  removeEntry,
  SECTION_CLOSED,
  type SectionState,
  splitForms,
  starterFootprint,
} from "../api/coachDoctrine";
import {
  blockedSentence,
  canAddPractice,
  classifyPractice,
  practiceReach,
  type PracticeRow,
  rotationLengthDays,
} from "../api/dailyPractices";
import { t } from "../i18n/t";

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

/**
 * LA FORME DU BROUILLON VIT DANS `api/coachDoctrine.ts`, PAS ICI.
 *
 * Elle était déclarée deux fois — une copie dans ce fichier, une dans le module
 * d'API — et les deux se sont mises à diverger dès qu'une section a gagné un
 * champ: `source` existait côté API et pas ici. Une forme dupliquée dont une
 * moitié ignore un champ est exactement le mécanisme par lequel un champ se
 * fait effacer au premier « enregistrer » (voir l'en-tête de
 * `doctrine_editor_shape.ts`, qui documente la même cicatrice côté serveur).
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

/** Qui ouvre et ferme les sections. Une seule est éditable à la fois. */
interface SectionApi {
  isEditing: (key: string) => boolean;
  edit: (key: string) => void;
  done: () => void;
  cancel: () => void;
}

export default function CoachDoctrinePage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [questions, setQuestions] = React.useState<InterviewQuestion[]>([]);
  const [versions, setVersions] = React.useState<VersionRow[]>([]);
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
   * LA SECTION OUVERTE — une seule à la fois.
   *
   * Une par une, parce que c'est le geste réel: un coach revient corriger SA
   * phrase sur les féculents, pas relire ses sept sections. Et parce que deux
   * sections ouvertes rendent « Cancel » ambigu — on annulerait quoi.
   *
   * L'instantané est pris à l'OUVERTURE et rendu au `Cancel`. Sans lui,
   * « annuler » ne pourrait qu'être un bouton qui ferme la section en gardant
   * les dégâts — c'est-à-dire un bouton qui ment sur son nom.
   */
  const [sectionState, setSectionState] = React.useState<SectionState>(SECTION_CLOSED);
  /**
   * CE QUI EST À L'ÉCRAN ET PAS ENCORE EN BASE.
   *
   * Le bouton « Done » d'une section ferme l'éditeur — il n'enregistre rien. Le
   * mot suggère pourtant le contraire, et c'est MON changement qui a créé
   * l'ambiguïté: avant, tout était un formulaire, et « Save as draft » était le
   * seul geste possible. Un coach qui ferme sa section, quitte l'écran et perd
   * sa phrase n'a rien fait de faux — c'est l'écran qui lui a menti.
   *
   * On compare donc à la dernière version ENREGISTRÉE, et le bouton le dit.
   */
  const [savedSnapshot, setSavedSnapshot] = React.useState<string | null>(null);
  const dirty = draft !== null && JSON.stringify(draft) !== savedSnapshot;
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  /**
   * R2/R3 — la langue de ce qui est ÉCRIT, distincte de celle de l'écran.
   * Elle voyage avec le dépôt: un coach qui écrit son ebook en français ne doit
   * pas voir sa doctrine étiquetée `en` parce que son navigateur l'est.
   */
  const [contentLocale, setContentLocale] = React.useState("en");
  /**
   * LES QUATRE FAÇONS DE COMMENCER — derrière une porte, pas dans la page.
   *
   * Ce sont des actions de DÉPART. Étalées sous la doctrine, elles faisaient
   * traverser trois invitations à tout recommencer à un coach qui venait
   * corriger une phrase: la page ne montrait plus ce qu'il avait écrit, elle
   * montrait trois façons de le réécrire.
   */
  const [startOpen, setStartOpen] = React.useState(false);
  /**
   * QUELLE DOCTRINE SES ÉLÈVES REÇOIVENT — la sienne, ou celle de la maison.
   *
   * Distinct du brouillon, et il doit l'être: un coach qui délègue garde sa
   * doctrine écrite (elle dort, pour que la bascule soit réversible). L'écran
   * doit donc pouvoir afficher une méthode ET dire que personne ne la lit.
   */
  const [doctrineSource, setDoctrineSource] = React.useState<DoctrineSource>("own");

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
      callDoctrine<{
        doctrine: DoctrineDraft | null;
        content_locale: string | null;
        doctrine_source: DoctrineSource | null;
      }>({
        action: "current",
      }),
    ]);
    setQuestions(q.questions ?? []);
    setVersions(v.versions ?? []);
    if (c.content_locale) setContentLocale(c.content_locale);
    // TOUJOURS ÉCRASÉ, contrairement au brouillon: c'est un fait du serveur, pas
    // un travail en cours. Le garder « seulement s'il est absent » ferait mentir
    // l'écran juste après une bascule.
    setDoctrineSource(c.doctrine_source === "house" ? "house" : "own");
    if (c.doctrine) {
      setDraft((existing) => existing ?? c.doctrine);
      // Ce qui vient de la base EST enregistré: sans cette ligne, l'écran
      // s'ouvrirait en annonçant des modifications que personne n'a faites.
      setSavedSnapshot((existing) => existing ?? JSON.stringify(c.doctrine));
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

  const footprint = React.useMemo(() => starterFootprint(draft), [draft]);
  /**
   * RIEN D'ÉCRIT — et c'est le SEUL endroit où l'amorçage mérite la page.
   *
   * Un coach qui arrive sans rien ne doit pas deviner qu'un bouton cache quatre
   * chemins. L'appel à l'action prend donc la place de la doctrine absente, au
   * lieu de se replier derrière une porte comme il le fait ensuite.
   */
  const nothingWritten = isDraftEmpty(draft);

  // Les quatre gestes sont des fonctions PURES testées dans
  // `coachDoctrine.int.test.ts`: c'est `cancel` qui porte le risque réel — un
  // « annuler » qui garderait les dégâts serait un bouton qui ment sur son nom.
  const section: SectionApi = {
    isEditing: (key) => sectionState.open === key,
    edit: (key) => setSectionState(openSection(key, draft ?? {})),
    done: () => setSectionState(closeSection()),
    cancel: () => {
      const out = cancelSection(sectionState, draft ?? {});
      setDraft(out.draft);
      setSectionState(out.section);
    },
  };

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

  /**
   * CE QUE LA MODALE REND — un brouillon, jamais une écriture.
   *
   * Les trois chemins de rédaction (débats, document, entretien) finissent tous
   * ici, et c'est voulu: ils diffèrent par ce qu'ils demandent au coach, pas par
   * ce qu'ils produisent. La porte de relecture est donc UNE, et aucun chemin ne
   * peut être ajouté demain en oubliant de passer par elle.
   *
   * La modale se ferme: ce que le coach doit lire maintenant est ce qui vient
   * d'atterrir dans sa méthode, pas le formulaire qui l'a produit.
   */
  const onStartResult = (result: DoctrineStartResult) => {
    setDraft(result.draft ?? null);
    setDraftOrigin(result.draft ? "compiled" : null);
    setIssues(result.issues);
    setNotice(result.notice);
    setFailure(null);
    setStartOpen(false);
  };

  /**
   * LA BASCULE DE DÉLÉGATION — la seule des quatre qui prend effet TOUT DE SUITE.
   *
   * Les trois autres rendent un brouillon que le coach relit et publie. Celle-ci
   * n'a rien à rédiger: la doctrine de la maison est déjà publiée, et la bascule
   * s'applique au prochain message de ses élèves. On le DIT — un changement
   * silencieux sur ce qui atteint des élèves serait la pire des économies.
   */
  const onDelegationChanged = (source: DoctrineSource, signsAs: string | null) => {
    setDoctrineSource(source);
    setFailure(null);
    setStartOpen(false);
    setNotice(
      source === "house"
        ? `Done. Your students are now followed by Sophia's method, and your agent signs “${
          signsAs ?? "Sophia"
        }” from their next message on. Nothing you wrote was deleted.`
        : `Done. Your agent signs “${
          signsAs ?? "your name"
        }” again and serves your own published method.`,
    );
  };

  const onSave = () =>
    run("save", async () => {
      if (!draft) return;
      // Les lignes ouvertes et non remplies ne partent pas en base: elles y
      // seraient lâchées à la relecture avec un avertissement, et recopiées à
      // chaque nouvelle version.
      const clean = pruneDraft(draft);
      await callDoctrine({ action: "save", doctrine: clean });
      setDraft(clean);
      setSavedSnapshot(JSON.stringify(clean));
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
            learns that here — from where you stand on your field's real
            arguments, from something you have already written, or from an
            interview. Never by asking you to write a prompt. Nothing reaches a
            student until you publish it.
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
          RIEN D'ÉCRIT — L'AMORÇAGE PREND LA PLACE DE LA DOCTRINE ABSENTE.
          C'est le seul état où ces chemins méritent la page: un coach qui
          arrive sans rien ne doit pas deviner qu'un bouton les cache. Dès qu'il
          y a une méthode, ils repassent derrière la porte du haut.
        */}
        {nothingWritten ? (
          <Card>
            <SectionLabel>Your method</SectionLabel>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              {doctrineSource === "house"
                ? "You have not written one — your students are followed by Sophia's method, and your agent signs “Sophia”. Write your own whenever you want it to speak in your name."
                : "There is nothing here yet, so your agent has no method of yours to carry. There are four ways to get one, and the quickest takes about two minutes."}
            </p>
            <div className="mt-4">
              <Button onClick={() => setStartOpen(true)} disabled={busy !== null}>
                {doctrineSource === "house" ? "Write my own method" : "Create my method"}
              </Button>
            </div>
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
              <div className="flex items-start justify-between gap-3">
                <SectionLabel>
                  {draftOrigin === "loaded" ? "Your method" : "What I understood"}
                </SectionLabel>
                {/*
                  LE BOUTON DISCRET, ET SON LIBELLÉ EST UNE QUESTION DE PRÉCISION,
                  PAS DE TON.

                  Il disait « Add to this ». C'est faux, et faux au seul endroit
                  où ça compte: AJOUTER à sa méthode, c'est ce qu'on fait juste
                  en dessous, avec les crayons, ligne par ligne. Ce que cette
                  porte ouvre, c'est d'en écrire une NOUVELLE — les débats,
                  l'entretien et la délégation remplacent la source entière, et
                  seul le document sait aussi additionner (il le dit sur son
                  propre bouton). Un coach qui lit « ajouter » et voit sa méthode
                  remplacée n'a pas rencontré un défaut de copie: il a perdu son
                  travail sur une promesse.

                  « Create » plutôt que « Start over »: le second se lit comme un
                  bouton qui efface, au-dessus du travail d'un coach, alors que
                  rien n'est détruit tant qu'il n'a pas relu et enregistré.
                */}
                {nothingWritten ? null : (
                  <button
                    type="button"
                    onClick={() => setStartOpen(true)}
                    className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-900"
                  >
                    Create a new one
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {draftOrigin === "loaded"
                  ? (published
                    ? "This is what your agent is using right now, and you can edit it here. Saving creates a new version; your students keep reading this one until you publish the new one."
                    : "This is your latest saved version. It is not published, so your agent is not using it yet.")
                  : "Nothing here is saved yet. If a line is not yours, it should not be here — change it, or delete it."}
              </p>
              {/*
                LA DÉLÉGATION SE DIT AU-DESSUS DE LA MÉTHODE QU'ELLE MET EN
                SOMMEIL. Elle n'efface rien — c'est ce qui la rend réversible —
                donc l'écran affiche une doctrine que PERSONNE NE LIT, et le
                taire ferait croire au coach que ses élèves reçoivent ceci.
              */}
              {doctrineSource === "house" ? (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  <strong>Nobody is reading this right now.</strong>{" "}
                  Your students are followed by Sophia's method and your agent
                  signs “Sophia”. Everything below is kept exactly as you left it
                  — take it back from the button above whenever you want.
                </p>
              ) : null}
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

              <GlobalEditor draft={draft} onChange={setDraft} section={section} />

              {/*
                « Done » ferme une section, il n'enregistre pas. Le seul geste
                qui écrit est ici, et il DIT quand il reste quelque chose à
                écrire — sinon un coach ferme sa section, quitte l'écran, et
                perd sa phrase sans avoir rien fait de faux.
              */}
              {/*
                LE COMPTEUR. Il ne bloque rien — un coach a le droit de publier
                un préréglage intact, c'est son produit et sa décision. Mais il
                ne doit pas pouvoir le faire SANS LE SAVOIR: ce qu'il vend à ses
                élèves est un agent qui parle comme lui, et deux coachs qui
                n'ont rien retouché ont le même agent.

                Il est ici et pas sur le bouton publier parce que c'est ici que
                le coach relit. Au moment de publier il est déjà décidé.
              */}
              {footprint.total > 0 ? (
                <p className="mt-5 text-xs leading-5 text-amber-800">
                  <strong>
                    {footprint.total} of {footprint.entries}
                  </strong>{" "}
                  lines above are still word-for-word ours. They work — but
                  another coach who picked the same answers has the same
                  sentences.{" "}
                  {footprint.forbidden > 0
                    ? "Start with the “instead” lines: that is the exact text your students read."
                    : "Rewriting even three of them in your own words is what makes the agent sound like you."}
                </p>
              ) : null}

              <div className="mt-5 flex items-center gap-3">
                <Button onClick={onSave} disabled={busy !== null || !dirty}>
                  {busy === "save" ? "Saving…" : "Save as draft"}
                </Button>
                <span className="text-xs text-gray-500">
                  {dirty
                    ? "You have changes that are not saved yet."
                    : "Everything here is saved."}
                </span>
              </div>
            </Card>

            {/*
              LES GESTES QUOTIDIENS, ENTRE LA MÉTHODE ET LES DYNAMIQUES.
              Après la carte globale parce qu'ils en dépendent — une pratique
              voyage dans la voix du coach — et avant les dynamiques parce
              qu'ils prennent une portée comme elles.
            */}
            <DailyPracticesCard
              draft={draft}
              onChange={setDraft}
              contentLocale={contentLocale}
              hasMethod={!nothingWritten}
            />

            <SpecificEditor draft={draft} onChange={setDraft} section={section} />
          </>
        ) : null}

        <Card>
          <SectionLabel>Versions</SectionLabel>
          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              No version yet. Anything you save above creates the first one.
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

      {/*
        LES QUATRE CHEMINS, DERRIÈRE UNE PORTE.

        Ils vivent dans un composant et pas dans cette page pour une raison de
        fond: ce sont des actions de DÉPART, et la page est un endroit où on
        RELIT. Les mélanger a produit exactement l'écran que ce lot corrige.
      */}
      <DoctrineStartDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        questions={questions}
        contentLocale={contentLocale}
        draft={draft}
        doctrineSource={doctrineSource}
        onResult={onStartResult}
        onDelegationChanged={onDelegationChanged}
      />
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

/**
 * UNE SECTION QUI SE LIT D'ABORD, ET QUI S'OUVRE À LA DEMANDE.
 *
 * ── LE DÉFAUT QUE ÇA FERME ──────────────────────────────────────────────
 * L'écran affichait TOUT en champs de saisie, en permanence: une trentaine de
 * cases blanches empilées. Deux conséquences, et la seconde est la pire:
 *
 *   · on ne peut pas LIRE sa propre méthode. Un formulaire n'est pas un
 *     document; le coach n'a nulle part où voir ce que son agent porte;
 *   · un champ ouvert est une invitation à écrire. Trente champs ouverts
 *     donnent l'impression permanente d'un travail inachevé, exactement
 *     l'effet que « neutre est une valeur » évite ailleurs dans le produit.
 *
 * Donc: lecture par défaut, et UNE section à la fois en écriture.
 *
 * ── POURQUOI UN BOUTON NOMMÉ ET PAS UN CRAYON ───────────────────────────
 * Une icône seule ne se voit pas — c'est le reproche exact qui a produit ce
 * changement. Le contrôle porte donc le MOT « Edit » à côté du crayon, dans une
 * bordure: la cible est large, le libellé dit ce qui va se passer, et l'icône
 * n'est là que pour la reconnaissance.
 */
function EditorSection({
  title,
  hint,
  summary,
  editing,
  onEdit,
  onDone,
  onCancel,
  children,
}: {
  title: string;
  hint?: string;
  /** Ce que le coach LIT quand la section est fermée. */
  summary: React.ReactNode;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={editing ? "rounded-lg border border-gray-900/15 bg-white p-3 -mx-3" : ""}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
        {editing ? null : (
          <button
            type="button"
            onClick={onEdit}
            className="flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:border-gray-400 hover:text-gray-900"
          >
            {/* Le crayon accompagne le mot, il ne le remplace pas. */}
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 fill-current">
              <path d="M11.5 1.5a2.1 2.1 0 0 1 3 3l-.8.8-3-3 .8-.8ZM9.9 3.1l3 3L6 13H3v-3l6.9-6.9Z" />
            </svg>
            Edit
          </button>
        )}
      </div>
      {editing && hint ? <p className="mt-1 text-xs leading-5 text-gray-400">{hint}</p> : null}
      <div className="mt-2">{editing ? children : summary}</div>
      {editing ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onDone}>Done</Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      ) : null}
    </div>
  );
}

/** Le rendu de lecture d'une section: des lignes, ou la phrase du vide. */
function SummaryList({ items, empty }: { items: React.ReactNode[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-gray-400">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm leading-6 text-gray-800">
      {items.map((item, i) => (
        <li key={i} className="border-l-2 border-gray-100 pl-3">{item}</li>
      ))}
    </ul>
  );
}
/**
 * LES CROYANCES ET LES CAS DURS — la brique commune aux deux parties.
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
  section,
  keyPrefix,
}: {
  draft: DoctrineDraft;
  onChange: (next: DoctrineDraft) => void;
  goal: GoalToken | null;
  section: SectionApi;
  /** Préfixe de clé de section: les deux parties éditent les mêmes listes. */
  keyPrefix: string;
}) {
  const scope = goal === null ? undefined : [goal];
  const beliefs = entriesForScope(draft.beliefs, goal);
  const arbitrations = entriesForScope(draft.arbitrations, goal);
  const forWhom = goal === null ? "every student" : GOAL_LABELS[goal].toLowerCase();

  return (
    <div className="space-y-5">
      <EditorSection
        title="What you believe"
        hint={goal === null
          ? "One conviction per line. The 'why' is what lets your agent explain instead of assert."
          : `Only students on ${GOAL_LABELS[goal]} will ever read these.`}
        editing={section.isEditing(`${keyPrefix}:beliefs`)}
        onEdit={() => section.edit(`${keyPrefix}:beliefs`)}
        onDone={section.done}
        onCancel={section.cancel}
        summary={
          <SummaryList
            empty={`Nothing yet — what do you believe that you'd tell ${forWhom}?`}
            items={beliefs.map(({ entry }) => (
              <>
                {String(entry.claim ?? "")}
                {String(entry.rationale ?? "").trim()
                  ? <span className="text-gray-500">{` — ${entry.rationale}`}</span>
                  : null}
              </>
            ))}
          />
        }
      >
        {beliefs.length === 0 ? <p className="text-sm text-gray-400">Nothing here yet.</p> : (
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
                    onChange({ ...draft, beliefs: patchEntry(draft.beliefs, index, { rationale }) })}
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
        editing={section.isEditing(`${keyPrefix}:arbitrations`)}
        onEdit={() => section.edit(`${keyPrefix}:arbitrations`)}
        onDone={section.done}
        onCancel={section.cancel}
        summary={
          <SummaryList
            empty="Nothing yet — add a hard case and the answer you give, word for word."
            items={arbitrations.map(({ entry }) => (
              <>
                <span className="text-gray-500">{String(entry.situation ?? "")}</span>
                <br />
                {`“${String(entry.coach_answer ?? "")}”`}
              </>
            ))}
          />
        }
      >
        {arbitrations.length === 0 ? <p className="text-sm text-gray-400">Nothing here yet.</p> : (
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
 * les aliments écartés. Ces quatre-là ne sont pas « pas encore ciblables »: un
 * interdit borné à un objectif serait une préférence, pas un interdit.
 */
function GlobalEditor({
  draft,
  onChange,
  section,
}: {
  draft: DoctrineDraft;
  onChange: (next: DoctrineDraft) => void;
  section: SectionApi;
}) {
  const voice = (draft.voice ?? {}) as Record<string, unknown>;
  const setVoice = (patch: Record<string, unknown>) =>
    onChange({ ...draft, voice: { ...voice, ...patch } });
  const foods = draft.foods ?? {};
  const setFoods = (patch: Partial<NonNullable<DoctrineDraft["foods"]>>) =>
    onChange({ ...draft, foods: { ...foods, ...patch } });
  const open = (key: string) => ({
    editing: section.isEditing(key),
    onEdit: () => section.edit(key),
    onDone: section.done,
    onCancel: section.cancel,
  });

  const voiceLine = [
    voice.address ? `you say “${voice.address}”` : null,
    voice.length === "short" ? "short replies" : voice.length === "medium" ? "a short paragraph" : null,
    voice.emojis === "none" ? "no emojis" : voice.emojis === "light" ? "at most one emoji" : null,
    voice.language ? `written in ${voice.language}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="mt-4 space-y-6">
      <BeliefsAndAnswers
        draft={draft}
        onChange={onChange}
        goal={null}
        section={section}
        keyPrefix="global"
      />

      <EditorSection
        title="What your agent must never say"
        hint="A token your code can branch on, the phrasings a model would actually write, and — the important one — what you say INSTEAD. Without an 'instead', a student gets a flat refusal rather than your answer."
        {...open("forbidden")}
        summary={
          <SummaryList
            empty="Nothing yet — what would you be embarrassed to see your agent say?"
            items={(draft.forbidden ?? []).map((f) => (
              <>
                {String(f.token ?? "")}
                {String(f.instead ?? "").trim()
                  ? <span className="text-gray-500">{` — instead: “${f.instead}”`}</span>
                  : <span className="text-amber-800">{" — no replacement set"}</span>}
              </>
            ))}
          />
        }
      >
        {(draft.forbidden ?? []).length === 0
          ? <p className="text-sm text-gray-400">Nothing here yet.</p>
          : (
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
                      onChange({
                        ...draft,
                        forbidden: patchEntry(draft.forbidden, index, { token }),
                      })}
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
                  {!String(f.instead ?? "").trim()
                    ? (
                      <p className="text-xs text-amber-800">
                        No replacement set — students get a flat refusal here.
                      </p>
                    )
                    : null}
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

      <EditorSection
        title="Your words"
        hint="The terms that are yours, and what they mean exactly."
        {...open("vocabulary")}
        summary={
          <SummaryList
            empty="Nothing yet — which words are yours?"
            items={(draft.vocabulary ?? []).map((v) => (
              <>
                “{String(v.term ?? "")}”
                {String(v.meaning ?? "").trim()
                  ? <span className="text-gray-500">{` — ${v.meaning}`}</span>
                  : null}
              </>
            ))}
          />
        }
      >
        {(draft.vocabulary ?? []).length === 0
          ? <p className="text-sm text-gray-400">Nothing here yet.</p>
          : (
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
            onChange({
              ...draft,
              vocabulary: addEntry(draft.vocabulary, { term: "", meaning: "" }),
            })}
        />
      </EditorSection>

      <EditorSection
        title="Foods you keep off the plate"
        hint="Give the phrasings too — 'seed oil' almost never appears as those two words in a real sentence, and a bare term is a filter that catches nothing. What you BUILD with is set on your Recommended food screen, not here."
        {...open("foods")}
        summary={
          <SummaryList
            empty="Nothing yet — anything you never want on a plate?"
            items={(foods.discouraged ?? []).map((f) => (
              <>
                {String(f.term ?? "")}
                {(f.surface_forms ?? []).length > 0
                  ? <span className="text-gray-500">{` — also: ${joinForms(f.surface_forms)}`}</span>
                  : <span className="text-amber-800">{" — no phrasings, hard to catch"}</span>}
              </>
            ))}
          />
        }
      >
        {(foods.discouraged ?? []).length === 0
          ? <p className="text-sm text-gray-400">Nothing here yet.</p>
          : (
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
            setFoods({ discouraged: addEntry(foods.discouraged, { term: "", surface_forms: [] }) })}
        />
      </EditorSection>

      <EditorSection
        title="What you have already answered"
        {...open("qa")}
        summary={
          <SummaryList
            empty="Nothing yet — what do your students ask over and over?"
            items={(draft.qa ?? []).map((q) => (
              <>
                <span className="text-gray-500">{String(q.question ?? "")}</span>
                <br />
                {String(q.answer ?? "")}
              </>
            ))}
          />
        }
      >
        {(draft.qa ?? []).length === 0 ? <p className="text-sm text-gray-400">Nothing here yet.</p> : (
          <ul className="space-y-2">
            {(draft.qa ?? []).map((q, index) => (
              <Row
                key={`qa-${index}`}
                onRemove={() => onChange({ ...draft, qa: removeEntry(draft.qa, index) })}
              >
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

      <EditorSection
        title="Your voice"
        {...open("voice")}
        summary={voiceLine
          ? <p className="text-sm leading-6 text-gray-800">{voiceLine}</p>
          : <p className="text-sm text-gray-400">Nothing set — your agent picks its own register.</p>}
      >
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
 * Un sélecteur et pas N colonnes: N colonnes montreraient en permanence N-1
 * saisies vides à un coach dont l'essentiel du travail est commun. Le compteur
 * à côté de chaque bouton dit où il a déjà écrit quelque chose — c'est tout ce
 * dont il a besoin pour savoir ce qu'il lui reste à faire.
 */
function SpecificEditor({
  draft,
  onChange,
  section,
}: {
  draft: DoctrineDraft;
  onChange: (next: DoctrineDraft) => void;
  section: SectionApi;
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
        <BeliefsAndAnswers
          draft={draft}
          onChange={onChange}
          goal={goal}
          section={section}
          keyPrefix={goal}
        />
      </div>
    </Card>
  );
}

/**
 * FF-001 — LES GESTES QUOTIDIENS.
 *
 * ── POURQUOI UNE CARTE À PART, ET PAS UNE SECTION DE PLUS ────────────────
 * Les autres sections sont de la COMPOSITION: elles gouvernent un plat, et une
 * ligne de plan les cite. Une pratique gouverne une JOURNÉE — aucun plat ne la
 * porte, aucune ligne de plan ne peut la tracer, et son unique canal de sortie
 * est le message du soir. La ranger avec les convictions ferait croire au coach
 * qu'elle sert à composer ses semaines, ce qu'elle ne fait pas.
 *
 * Et elle ne peut pas non plus vivre dans la carte globale: cette carte
 * promet, en toutes lettres, que tout ce qu'elle contient va à CHAQUE élève.
 * Une pratique prend une portée.
 *
 * ── LE VERDICT EST VISIBLE ET CORRIGEABLE ────────────────────────────────
 * Le coach tape une phrase, un appel la classe, et il LIT ce qui a été compris.
 * C'est la moitié de la valeur du stockage — l'autre étant qu'on ne paie qu'un
 * appel par pratique et par coach, à vie. Une classification invisible serait
 * incorrigible, et un coach qui ne peut pas corriger une machine qui parle en
 * son nom arrête de lui confier quoi que ce soit.
 */
function DailyPracticesCard({
  draft,
  onChange,
  contentLocale,
  hasMethod,
}: {
  draft: DoctrineDraft;
  onChange: (next: DoctrineDraft) => void;
  contentLocale: string;
  /** Une pratique voyage DANS la voix du coach: sans méthode publiée, elle ne part pas. */
  hasMethod: boolean;
}) {
  const practices = draft.daily_practices ?? [];
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const patch = (index: number, next: Partial<PracticeRow>) =>
    onChange({
      ...draft,
      daily_practices: practices.map((p, i) => (i === index ? { ...p, ...next } : p)),
    });

  async function classify(text: string, replaceIndex: number | null) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setFailure(null);
    try {
      const out = await classifyPractice({
        label: trimmed,
        contentLocale,
        // Le contexte sert la CADENCE: « socle » n'a de sens que par rapport
        // aux autres pratiques du coach.
        existingLabels: practices
          .map((p) => String(p.label ?? ""))
          .filter((l, i) => l && i !== replaceIndex),
      });
      onChange({
        ...draft,
        daily_practices: replaceIndex === null
          ? [...practices, out.practice]
          : practices.map((p, i) => (i === replaceIndex ? out.practice : p)),
      });
      if (replaceIndex === null) setLabel("");
    } catch (err) {
      // Un échec de TRANSPORT, pas de classification: le serveur, lui, rend
      // toujours une pratique. Les deux phrases sont différentes et le coach a
      // besoin de savoir laquelle il lit.
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const cycle = rotationLengthDays(practices);

  return (
    <Card>
      <SectionLabel>{t("coach.practices.title")}</SectionLabel>
      <p className="mt-2 text-sm leading-6 text-gray-700">{t("coach.practices.intro")}</p>
      {hasMethod ? null : (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          {t("coach.practices.no_method")}
        </p>
      )}

      {practices.length === 0
        ? <p className="mt-4 text-sm text-gray-400">{t("coach.practices.empty")}</p>
        : (
          <>
            <p className="mt-4 text-xs text-gray-500">
              {cycle <= 1
                ? t("coach.practices.rotation_one")
                : t("coach.practices.rotation_many", { count: cycle })}
            </p>
            <ul className="mt-3 space-y-3">
              {practices.map((p, index) => (
                <PracticeRowEditor
                  key={`${index}-${String(p.label ?? "")}`}
                  practice={p}
                  busy={busy}
                  onPatch={(next) => patch(index, next)}
                  onReclassify={() => classify(String(p.label ?? ""), index)}
                  onRemove={() =>
                    onChange({
                      ...draft,
                      daily_practices: practices.filter((_, i) => i !== index),
                    })}
                />
              ))}
            </ul>
          </>
        )}

      {canAddPractice(practices)
        ? (
          <div className="mt-4 flex flex-wrap items-start gap-2">
            {/* `min-w-0` sur l'enfant flex: `flex-1` seul ne rétrécit pas un
                input — sa `min-width` vaut `auto`, et la carte déborde à 320px. */}
            <input
              className={`${inputClass} min-w-0 flex-1`}
              value={label}
              placeholder={t("coach.practices.add_placeholder")}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void classify(label, null);
                }
              }}
            />
            <Button onClick={() => void classify(label, null)} disabled={busy || !label.trim()}>
              {busy ? t("coach.practices.adding") : t("coach.practices.add_button")}
            </Button>
          </div>
        )
        : <p className="mt-4 text-xs leading-5 text-amber-800">{t("coach.practices.full")}</p>}

      {failure ? <p className="mt-2 text-xs text-red-700">{failure}</p> : null}
    </Card>
  );
}

/** Une pratique: ce qui a été compris, et les quatre choses qui se corrigent. */
function PracticeRowEditor({
  practice,
  busy,
  onPatch,
  onReclassify,
  onRemove,
}: {
  practice: PracticeRow;
  busy: boolean;
  onPatch: (next: Partial<PracticeRow>) => void;
  onReclassify: () => void;
  onRemove: () => void;
}) {
  const blocked = blockedSentence(practice.collides_with ?? null);
  const scope = (practice.goal_scope ?? []).filter(Boolean);

  return (
    <li className="rounded-md border border-gray-100 bg-gray-50/60 p-3">
      {/* Les mots du coach, VERBATIM. Jamais réécrits, donc jamais rendus
          autrement qu'à l'identique. */}
      <p className="text-sm font-medium leading-6 text-gray-900">{String(practice.label ?? "")}</p>

      {blocked
        ? (
          <div className="mt-2 rounded-md bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium text-amber-900">
              {t("coach.practices.blocked_title")}
            </p>
            {/* R9 — le motif NOMME la ceinture. Un blocage muet se vit comme de
                l'arbitraire, et un coach qui vit un refus comme arbitraire
                arrête d'écrire. */}
            <p className="mt-1 text-xs leading-5 text-amber-900">{blocked}</p>
          </div>
        )
        : null}

      {practice.status === "needs_review"
        ? (
          <p className="mt-2 text-xs leading-5 text-amber-800">
            {t("coach.practices.needs_review")}
          </p>
        )
        : null}

      <p className="mt-2 text-xs text-gray-500">
        <span className="font-medium">{t("coach.practices.reach_label")}:</span>{" "}
        {practiceReach(practice)}
      </p>
      {practice.brief
        ? (
          <p className="mt-1 text-xs leading-5 text-gray-500">
            <span className="font-medium">{t("coach.practices.brief_label")}:</span>{" "}
            {practice.brief}
          </p>
        )
        : null}

      {/* LES CORRECTIONS. Quatre, et pas une de plus: ce sont les quatre
          décisions du classifieur qui changent ce que la cohorte reçoit. Le
          `kind`, le `target` et l'`unit` ne sont pas éditables ici — ils
          décrivent la phrase du coach, et la façon de les corriger est de
          réécrire la phrase, ce que « Read it again » fait. */}
      <div className="mt-3 space-y-1.5">
        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={practice.askable === true}
            onChange={(e) => onPatch({ askable: e.target.checked })}
          />
          <span>
            {t("coach.practices.askable_label")}
            <span className="block text-gray-400">{t("coach.practices.askable_hint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={practice.minor_safe === true}
            onChange={(e) => onPatch({ minor_safe: e.target.checked })}
          />
          <span>
            {t("coach.practices.minor_safe_label")}
            <span className="block text-gray-400">{t("coach.practices.minor_safe_hint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={practice.cadence === "constant"}
            onChange={(e) => onPatch({ cadence: e.target.checked ? "constant" : "rotating" })}
          />
          <span>
            {t("coach.practices.constant_label")}
            <span className="block text-gray-400">{t("coach.practices.constant_hint")}</span>
          </span>
        </label>
      </div>

      <div className="mt-2">
        <p className="text-xs font-medium text-gray-500">{t("coach.practices.scope_label")}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {/* « Everyone » est une VALEUR, pas l'absence de choix: la portée vide
              est le cas de l'écrasante majorité des pratiques. */}
          <button
            type="button"
            onClick={() => onPatch({ goal_scope: [] })}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              scope.length === 0
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {t("coach.practices.scope_everyone")}
          </button>
          {GOAL_TOKENS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() =>
                onPatch({
                  goal_scope: scope.includes(g) ? scope.filter((s) => s !== g) : [...scope, g],
                })}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                scope.includes(g)
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              {GOAL_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={onReclassify}
          disabled={busy}
          className="text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-gray-900 disabled:opacity-50"
        >
          {t("coach.practices.reclassify")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-700"
        >
          {t("coach.practices.remove")}
        </button>
      </div>
    </li>
  );
}
