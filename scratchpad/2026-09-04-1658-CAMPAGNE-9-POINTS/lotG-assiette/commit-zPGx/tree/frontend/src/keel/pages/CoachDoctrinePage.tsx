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
  COMPOSITION_FORKS,
  NO_STEERING,
  type DoctrineDraft,
  type DoctrineSource,
  entriesForScope,
  goalLabel,
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
import { formatDate } from "../i18n/format";
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
        // « Sophia » est un nom propre: il ne traverse pas le seed. « your
        // name », lui, est une PHRASE de repli, donc il y entre.
        ? t("coach.doctrine.delegated_notice", { name: signsAs ?? "Sophia" })
        : t("coach.doctrine.reclaimed_notice", {
          name: signsAs ?? t("coach.doctrine.your_name"),
        }),
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
      setNotice(t("coach.doctrine.saved_notice"));
    });

  const onPublish = (version: number) =>
    run(`publish-${version}`, async () => {
      await callDoctrine({ action: "publish", version });
      await refresh();
      setNotice(t("coach.doctrine.published_notice", { version }));
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
        t("coach.doctrine.rollback_notice", { from: version, to: out.created.version }),
      );
    });

  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="coach" title={t("coach.doctrine.title")}>
        <p className="text-sm text-ink-soft">{t("coach.doctrine.loading")}</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "error") {
    return (
      <KeelAppShell variant="coach" title={t("coach.doctrine.title")}>
        <Card tone="warning">
          <p className="text-sm text-ink">{t("coach.doctrine.load_failed")}</p>
          <p className="mt-1 text-xs text-ink-soft">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell variant="coach" title={t("coach.doctrine.title")}>
      <div className="space-y-6">
        <Card>
          <SectionLabel>{t("coach.doctrine.what.title")}</SectionLabel>
          <p className="mt-2 text-sm leading-6 text-ink">
            {t("coach.doctrine.what.body")}
          </p>
          {published ? (
            <p className="mt-3 text-sm text-ink">
              <Badge tone="positive">{t("coach.doctrine.live_badge")}</Badge>{" "}
              <span className="ml-1">
                {t("coach.doctrine.live_version", {
                  version: published.version,
                  date: formatDate(published.published_at as string),
                })}
              </span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-ink">
              <Badge tone="caution">{t("coach.doctrine.none_badge")}</Badge>{" "}
              <span className="ml-1">{t("coach.doctrine.none_body")}</span>
            </p>
          )}
        </Card>

        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-ink">{t("coach.doctrine.action_failed")}</p>
            <p className="mt-1 text-xs text-ink-soft">{failure}</p>
          </Card>
        ) : null}
        {notice ? (
          <Card>
            <p className="text-sm text-ink">{notice}</p>
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
            <SectionLabel>{t("coach.doctrine.your_method")}</SectionLabel>
            <p className="mt-2 text-sm leading-6 text-ink">
              {doctrineSource === "house"
                ? t("coach.doctrine.empty.house")
                : t("coach.doctrine.empty.own")}
            </p>
            <div className="mt-4">
              <Button onClick={() => setStartOpen(true)} disabled={busy !== null}>
                {doctrineSource === "house"
                  ? t("coach.doctrine.empty.cta_house")
                  : t("coach.doctrine.empty.cta_own")}
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
                  {draftOrigin === "loaded"
                    ? t("coach.doctrine.your_method")
                    : t("coach.doctrine.what_i_understood")}
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
                  <Button size="sm" className="shrink-0" onClick={() => setStartOpen(true)}>
                    {t("coach.doctrine.create_new")}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                {draftOrigin === "loaded"
                  ? (published
                    ? t("coach.doctrine.loaded_published")
                    : t("coach.doctrine.loaded_draft"))
                  : t("coach.doctrine.compiled_note")}
              </p>
              {/*
                LA DÉLÉGATION SE DIT AU-DESSUS DE LA MÉTHODE QU'ELLE MET EN
                SOMMEIL. Elle n'efface rien — c'est ce qui la rend réversible —
                donc l'écran affiche une doctrine que PERSONNE NE LIT, et le
                taire ferait croire au coach que ses élèves reçoivent ceci.
              */}
              {doctrineSource === "house" ? (
                <p className="mt-2 rounded-card bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  <strong>{t("coach.doctrine.dormant_title")}</strong>{" "}
                  {t("coach.doctrine.dormant_body")}
                </p>
              ) : null}
              {/*
                L'EMPHASE PORTE SUR UNE PHRASE ENTIÈRE, PLUS SUR UN MOT AU
                MILIEU. « goes to <strong>every</strong> student » découpait la
                phrase en trois morceaux dont l'ordre est celui de l'anglais:
                une langue qui place son quantifieur ailleurs ne peut pas les
                recoller. La phrase mise en gras dit la même chose et se traduit
                d'un bloc.
              */}
              <p className="mt-2 text-xs leading-5 text-ink-soft">
                <strong>{t("coach.doctrine.global_scope_lead")}</strong>{" "}
                {t("coach.doctrine.global_scope_body")}
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
                  {/* Les deux nombres ne se séparent pas de leur phrase: « N of
                      M » d'un côté et « lines above are still… » de l'autre
                      imposeraient l'ordre anglais au reste du monde. */}
                  <strong>
                    {t("coach.doctrine.starter.count", {
                      total: footprint.total,
                      entries: footprint.entries,
                    })}
                  </strong>{" "}
                  {t("coach.doctrine.starter.body")}{" "}
                  {footprint.forbidden > 0
                    ? t("coach.doctrine.starter.forbidden_first")
                    : t("coach.doctrine.starter.rewrite_three")}
                </p>
              ) : null}

              <div className="mt-5 flex items-center gap-3">
                <Button onClick={onSave} disabled={busy !== null || !dirty}>
                  {busy === "save"
                    ? t("coach.doctrine.saving")
                    : t("coach.doctrine.save_draft")}
                </Button>
                <span className="text-xs text-ink-soft">
                  {dirty
                    ? t("coach.doctrine.unsaved")
                    : t("coach.doctrine.all_saved")}
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

            {/*
              FF-041 — LE DÉBAT DE COMPOSITION, après les pratiques et avant
              les dynamiques. C'est une question de MÉTHODE globale: elle
              gouverne toutes les cohortes du coach, comme sa voix, et pas une
              par objectif.
            */}
            <CompositionForksCard draft={draft} onChange={setDraft} section={section} />

            <SpecificEditor draft={draft} onChange={setDraft} section={section} />
          </>
        ) : null}

        <Card>
          <SectionLabel>{t("coach.doctrine.versions.title")}</SectionLabel>
          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              {t("coach.doctrine.versions.empty")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {versions.slice().reverse().map((v) => (
                <li key={v.version} className="flex items-center gap-3 py-3">
                  <span className="w-14 text-sm font-medium text-ink">
                    v{v.version}
                  </span>
                  <span className="flex-1 text-xs text-ink-soft">
                    {v.published_at
                      ? <Badge tone="positive">{t("coach.doctrine.live_badge")}</Badge>
                      : <Badge tone="neutral">{t("coach.doctrine.draft_badge")}</Badge>}
                    {v.created_from_version ? (
                      <span className="ml-2">
                        {t("coach.doctrine.versions.copied_from", {
                          version: v.created_from_version,
                        })}
                      </span>
                    ) : null}
                    {v.change_note ? (
                      <span className="ml-2 text-ink-soft">{v.change_note}</span>
                    ) : null}
                  </span>
                  {!v.published_at ? (
                    <Button
                      size="sm"
                      onClick={() => onPublish(v.version)}
                      disabled={busy !== null}
                    >
                      {t("coach.doctrine.versions.publish")}
                    </Button>
                  ) : null}
                  {published && v.version !== published.version ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onRollback(v.version)}
                      disabled={busy !== null}
                    >
                      {t("coach.doctrine.versions.rollback")}
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
    <li className="rounded-card border border-line bg-paper-2 p-3">
      <div className="space-y-2">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-2 text-xs text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        {t("coach.doctrine.row_remove")}
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
      <span className="mb-2 block text-label font-semibold uppercase text-ink-soft">{label}</span>
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

/**
 * ⛔ CE BOUTON ÉTAIT UN BOUTON MAISON, ET IL EST DEVENU CELUI DU KIT.
 * Il portait son propre rayon (`rounded-card`, une sixième valeur), sa propre
 * bordure (`gray-300`, sous les 3:1 que WCAG 1.4.11 demande à un contrôle) et son
 * propre survol. Le pointillé qui le distinguait est perdu à dessein: dans le
 * vocabulaire du kit, le pointillé dit « un emplacement vide en attente »
 * (`Card tone="dashed"`) et non « une action » — un bouton n'est pas un vide.
 * Le « + » reste, et c'est lui qui dit qu'on ajoute.
 */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="sm" className="mt-2" onClick={onClick}>
      + {label}
    </Button>
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
    <div className={editing ? "-mx-3 rounded-card border border-line-strong bg-paper p-3" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 text-label font-semibold uppercase text-ink-soft">{title}</p>
        {editing ? null : (
          <Button size="sm" className="shrink-0" onClick={onEdit}>
            {/* Le crayon accompagne le mot, il ne le remplace pas. */}
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 fill-current">
              <path d="M11.5 1.5a2.1 2.1 0 0 1 3 3l-.8.8-3-3 .8-.8ZM9.9 3.1l3 3L6 13H3v-3l6.9-6.9Z" />
            </svg>
            {t("coach.doctrine.section_edit")}
          </Button>
        )}
      </div>
      {editing && hint
        ? <p className="mt-1 max-w-[62ch] text-xs leading-5 text-ink-soft">{hint}</p>
        : null}
      <div className="mt-2">{editing ? children : summary}</div>
      {editing ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onDone}>{t("coach.doctrine.section_done")}</Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            {t("coach.doctrine.section_cancel")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Le rendu de lecture d'une section: des lignes, ou la phrase du vide. */
function SummaryList({ items, empty }: { items: React.ReactNode[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm leading-6 text-ink">
      {items.map((item, i) => (
        <li key={i} className="max-w-[62ch] border-l-2 border-line pl-3">{item}</li>
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

  return (
    <div className="space-y-5">
      <EditorSection
        title={t("coach.doctrine.beliefs.title")}
        hint={goal === null
          ? t("coach.doctrine.beliefs.hint_global")
          : t("coach.doctrine.beliefs.hint_goal", { goal: goalLabel(goal) })}
        editing={section.isEditing(`${keyPrefix}:beliefs`)}
        onEdit={() => section.edit(`${keyPrefix}:beliefs`)}
        onDone={section.done}
        onCancel={section.cancel}
        summary={
          /*
            ⚠️ LA PHRASE DU VIDE ÉTAIT CASSÉE, ET PAS SEULEMENT INTRADUISIBLE.
            Elle valait `…that you'd tell ${GOAL_LABELS[goal].toLowerCase()}?`
            — soit « what do you believe that you'd tell losing fat? »: on
            parlait à un OBJECTIF, pas à un élève. Deux phrases nommées, dont
            celle de l'objectif porte son trou.
          */
          <SummaryList
            empty={goal === null
              ? t("coach.doctrine.beliefs.empty_global")
              : t("coach.doctrine.beliefs.empty_goal", { goal: goalLabel(goal) })}
            items={beliefs.map(({ entry }) => (
              <>
                {String(entry.claim ?? "")}
                {String(entry.rationale ?? "").trim()
                  ? <span className="text-ink-soft">{` — ${entry.rationale}`}</span>
                  : null}
              </>
            ))}
          />
        }
      >
        {beliefs.length === 0
          ? <p className="text-sm text-ink-soft">{t("coach.doctrine.nothing_here_yet")}</p>
          : (
          <ul className="space-y-2">
            {beliefs.map(({ index, entry }) => (
              <Row
                key={`belief-${index}`}
                onRemove={() => onChange({ ...draft, beliefs: removeEntry(draft.beliefs, index) })}
              >
                <TextRow
                  label={t("coach.doctrine.beliefs.title")}
                  value={String(entry.claim ?? "")}
                  rows={2}
                  onChange={(claim) =>
                    onChange({ ...draft, beliefs: patchEntry(draft.beliefs, index, { claim }) })}
                />
                <TextRow
                  label={t("coach.doctrine.beliefs.rationale_label")}
                  value={String(entry.rationale ?? "")}
                  onChange={(rationale) =>
                    onChange({ ...draft, beliefs: patchEntry(draft.beliefs, index, { rationale }) })}
                />
              </Row>
            ))}
          </ul>
        )}
        <AddButton
          label={t("coach.doctrine.beliefs.add")}
          onClick={() =>
            onChange({
              ...draft,
              beliefs: addEntry(draft.beliefs, { claim: "", rationale: "", goal_scope: scope }),
            })}
        />
      </EditorSection>

      <EditorSection
        title={t("coach.doctrine.answers.title")}
        hint={goal === null
          ? t("coach.doctrine.answers.hint_global")
          : t("coach.doctrine.answers.hint_goal", { goal: goalLabel(goal) })}
        editing={section.isEditing(`${keyPrefix}:arbitrations`)}
        onEdit={() => section.edit(`${keyPrefix}:arbitrations`)}
        onDone={section.done}
        onCancel={section.cancel}
        summary={
          <SummaryList
            empty={t("coach.doctrine.answers.empty")}
            items={arbitrations.map(({ entry }) => (
              <>
                <span className="text-ink-soft">{String(entry.situation ?? "")}</span>
                <br />
                {`“${String(entry.coach_answer ?? "")}”`}
              </>
            ))}
          />
        }
      >
        {arbitrations.length === 0
          ? <p className="text-sm text-ink-soft">{t("coach.doctrine.nothing_here_yet")}</p>
          : (
          <ul className="space-y-2">
            {arbitrations.map(({ index, entry }) => (
              <Row
                key={`arb-${index}`}
                onRemove={() =>
                  onChange({ ...draft, arbitrations: removeEntry(draft.arbitrations, index) })}
              >
                <TextRow
                  label={t("coach.doctrine.answers.situation_label")}
                  value={String(entry.situation ?? "")}
                  onChange={(situation) =>
                    onChange({
                      ...draft,
                      arbitrations: patchEntry(draft.arbitrations, index, { situation }),
                    })}
                />
                <TextRow
                  label={t("coach.doctrine.answers.answer_label")}
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
          label={t("coach.doctrine.answers.add")}
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
    voice.address ? t("coach.doctrine.voice.summary_address", { address: String(voice.address) }) : null,
    voice.length === "short"
      ? t("coach.doctrine.voice.summary_short")
      : voice.length === "medium"
      ? t("coach.doctrine.voice.summary_medium")
      : null,
    voice.emojis === "none"
      ? t("coach.doctrine.voice.summary_no_emojis")
      : voice.emojis === "light"
      ? t("coach.doctrine.voice.summary_one_emoji")
      : null,
    voice.language
      ? t("coach.doctrine.voice.summary_language", { language: String(voice.language) })
      : null,
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
        title={t("coach.doctrine.forbidden.title")}
        hint={t("coach.doctrine.forbidden.hint")}
        {...open("forbidden")}
        summary={
          <SummaryList
            empty={t("coach.doctrine.forbidden.empty")}
            items={(draft.forbidden ?? []).map((f) => (
              <>
                {String(f.token ?? "")}
                {/* L'espace de séparation reste DANS le JSX: une valeur du seed
                    ne porte pas d'espace de bord (parity.int.test.ts). */}
                {String(f.instead ?? "").trim()
                  ? (
                    <span className="text-ink-soft">
                      {" "}
                      {t("coach.doctrine.forbidden.summary_instead", {
                        instead: String(f.instead),
                      })}
                    </span>
                  )
                  : (
                    <span className="text-amber-800">
                      {" "}
                      {t("coach.doctrine.forbidden.summary_no_instead")}
                    </span>
                  )}
              </>
            ))}
          />
        }
      >
        {(draft.forbidden ?? []).length === 0
          ? <p className="text-sm text-ink-soft">{t("coach.doctrine.nothing_here_yet")}</p>
          : (
            <ul className="space-y-2">
              {(draft.forbidden ?? []).map((f, index) => (
                <Row
                  key={`forb-${index}`}
                  onRemove={() =>
                    onChange({ ...draft, forbidden: removeEntry(draft.forbidden, index) })}
                >
                  <TextRow
                    label={t("coach.doctrine.forbidden.token_label")}
                    value={String(f.token ?? "")}
                    placeholder={t("coach.doctrine.forbidden.token_placeholder")}
                    onChange={(token) =>
                      onChange({
                        ...draft,
                        forbidden: patchEntry(draft.forbidden, index, { token }),
                      })}
                  />
                  <TextRow
                    label={t("coach.doctrine.forbidden.forms_label")}
                    value={joinForms(f.surface_forms)}
                    placeholder={t("coach.doctrine.forbidden.forms_placeholder")}
                    onChange={(raw) =>
                      onChange({
                        ...draft,
                        forbidden: patchEntry(draft.forbidden, index, {
                          surface_forms: splitForms(raw),
                        }),
                      })}
                  />
                  <TextRow
                    label={t("coach.doctrine.forbidden.reason_label")}
                    value={String(f.reason ?? "")}
                    onChange={(reason) =>
                      onChange({
                        ...draft,
                        forbidden: patchEntry(draft.forbidden, index, { reason }),
                      })}
                  />
                  <TextRow
                    label={t("coach.doctrine.forbidden.instead_label")}
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
                        {t("coach.doctrine.forbidden.no_instead_warning")}
                      </p>
                    )
                    : null}
                </Row>
              ))}
            </ul>
          )}
        <AddButton
          label={t("coach.doctrine.forbidden.add")}
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
        title={t("coach.doctrine.vocabulary.title")}
        hint={t("coach.doctrine.vocabulary.hint")}
        {...open("vocabulary")}
        summary={
          <SummaryList
            empty={t("coach.doctrine.vocabulary.empty")}
            items={(draft.vocabulary ?? []).map((v) => (
              <>
                “{String(v.term ?? "")}”
                {String(v.meaning ?? "").trim()
                  ? <span className="text-ink-soft">{` — ${v.meaning}`}</span>
                  : null}
              </>
            ))}
          />
        }
      >
        {(draft.vocabulary ?? []).length === 0
          ? <p className="text-sm text-ink-soft">{t("coach.doctrine.nothing_here_yet")}</p>
          : (
            <ul className="space-y-2">
              {(draft.vocabulary ?? []).map((v, index) => (
                <Row
                  key={`vocab-${index}`}
                  onRemove={() =>
                    onChange({ ...draft, vocabulary: removeEntry(draft.vocabulary, index) })}
                >
                  <TextRow
                    label={t("coach.doctrine.vocabulary.term_label")}
                    value={String(v.term ?? "")}
                    onChange={(term) =>
                      onChange({
                        ...draft,
                        vocabulary: patchEntry(draft.vocabulary, index, { term }),
                      })}
                  />
                  <TextRow
                    label={t("coach.doctrine.vocabulary.meaning_label")}
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
          label={t("coach.doctrine.vocabulary.add")}
          onClick={() =>
            onChange({
              ...draft,
              vocabulary: addEntry(draft.vocabulary, { term: "", meaning: "" }),
            })}
        />
      </EditorSection>

      <EditorSection
        title={t("coach.doctrine.foods.title")}
        hint={t("coach.doctrine.foods.hint")}
        {...open("foods")}
        summary={
          <SummaryList
            empty={t("coach.doctrine.foods.empty")}
            items={(foods.discouraged ?? []).map((f) => (
              <>
                {String(f.term ?? "")}
                {(f.surface_forms ?? []).length > 0
                  ? (
                    <span className="text-ink-soft">
                      {" "}
                      {t("coach.doctrine.foods.summary_also", {
                        forms: joinForms(f.surface_forms),
                      })}
                    </span>
                  )
                  : (
                    <span className="text-amber-800">
                      {" "}
                      {t("coach.doctrine.foods.summary_no_forms")}
                    </span>
                  )}
              </>
            ))}
          />
        }
      >
        {(foods.discouraged ?? []).length === 0
          ? <p className="text-sm text-ink-soft">{t("coach.doctrine.nothing_here_yet")}</p>
          : (
            <ul className="space-y-2">
              {(foods.discouraged ?? []).map((f, index) => (
                <Row
                  key={`food-d-${index}`}
                  onRemove={() => setFoods({ discouraged: removeEntry(foods.discouraged, index) })}
                >
                  <TextRow
                    label={t("coach.doctrine.foods.term_label")}
                    value={String(f.term ?? "")}
                    onChange={(term) =>
                      setFoods({ discouraged: patchEntry(foods.discouraged, index, { term }) })}
                  />
                  <TextRow
                    label={t("coach.doctrine.foods.forms_label")}
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
          label={t("coach.doctrine.foods.add")}
          onClick={() =>
            setFoods({ discouraged: addEntry(foods.discouraged, { term: "", surface_forms: [] }) })}
        />
      </EditorSection>

      <EditorSection
        title={t("coach.doctrine.qa.title")}
        {...open("qa")}
        summary={
          <SummaryList
            empty={t("coach.doctrine.qa.empty")}
            items={(draft.qa ?? []).map((q) => (
              <>
                <span className="text-ink-soft">{String(q.question ?? "")}</span>
                <br />
                {String(q.answer ?? "")}
              </>
            ))}
          />
        }
      >
        {(draft.qa ?? []).length === 0
          ? <p className="text-sm text-ink-soft">{t("coach.doctrine.nothing_here_yet")}</p>
          : (
          <ul className="space-y-2">
            {(draft.qa ?? []).map((q, index) => (
              <Row
                key={`qa-${index}`}
                onRemove={() => onChange({ ...draft, qa: removeEntry(draft.qa, index) })}
              >
                <TextRow
                  label={t("coach.doctrine.qa.question_label")}
                  value={String(q.question ?? "")}
                  onChange={(question) =>
                    onChange({ ...draft, qa: patchEntry(draft.qa, index, { question }) })}
                />
                <TextRow
                  label={t("coach.doctrine.qa.answer_label")}
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
          label={t("coach.doctrine.qa.add")}
          onClick={() => onChange({ ...draft, qa: addEntry(draft.qa, { question: "", answer: "" }) })}
        />
      </EditorSection>

      <EditorSection
        title={t("coach.doctrine.voice.title")}
        {...open("voice")}
        summary={voiceLine
          ? <p className="text-sm leading-6 text-ink">{voiceLine}</p>
          : <p className="text-sm text-ink-soft">{t("coach.doctrine.voice.empty")}</p>}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <TextRow
            label={t("coach.doctrine.voice.address_label")}
            value={String(voice.address ?? "")}
            onChange={(address) => setVoice({ address })}
          />
          {/* ⚠️ L'EXEMPLE `fr-FR` ENTRE DANS LE SEED AVEC SA PHRASE. Écrit ici,
              c'était un tag de locale en dur hors de `keel/i18n/` — la règle
              LOCALE_LITERAL de `scripts/ci/i18n-lint.mjs`. */}
          <TextRow
            label={t("coach.doctrine.voice.language_label")}
            value={String(voice.language ?? "")}
            onChange={(language) => setVoice({ language })}
          />
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">
              {t("coach.doctrine.voice.length_label")}
            </span>
            <select
              className={inputClass}
              value={String(voice.length ?? "")}
              onChange={(e) => setVoice({ length: e.target.value || null })}
            >
              <option value="">—</option>
              <option value="short">{t("coach.doctrine.voice.length_short")}</option>
              <option value="medium">{t("coach.doctrine.voice.length_medium")}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">
              {t("coach.doctrine.voice.emojis_label")}
            </span>
            <select
              className={inputClass}
              value={String(voice.emojis ?? "")}
              onChange={(e) => setVoice({ emojis: e.target.value || null })}
            >
              <option value="">—</option>
              <option value="none">{t("coach.doctrine.voice.emojis_none")}</option>
              <option value="light">{t("coach.doctrine.voice.emojis_light")}</option>
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
      <SectionLabel>{t("coach.doctrine.specific.title")}</SectionLabel>
      {/* Même arbitrage que la carte globale: l'emphase porte la phrase, pas le
          mot « only » au milieu d'elle. */}
      <p className="mt-2 text-xs leading-5 text-ink-soft">
        <strong>{t("coach.doctrine.specific.lead")}</strong>{" "}
        {t("coach.doctrine.specific.body")}
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
                  ? "border-fig-700 bg-fig-700 text-paper"
                  : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50"
              }`}
            >
              {goalLabel(g)}
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
/**
 * FF-041 — LE DÉBAT DE COMPOSITION.
 *
 * ── CE QUE LE COACH VOIT, ET LA LIGNE QUE CETTE CARTE TIENT ──────────────
 * Des POSITIONS, dans son langage, et ce que chacune PRODUIT en langage
 * plan/aliment. Jamais un axe du moteur, jamais un cadran, jamais un chiffre
 * destiné à un élève (§3.0 du design). Les jetons exécutables sont dérivés à
 * l'enregistrement par `coach-doctrine-v1`; ils ne traversent pas cette
 * frontière.
 *
 * ── POURQUOI L'EFFET EST ÉCRIT SOUS CHAQUE POSITION ──────────────────────
 * La règle zéro-chiffre est un plancher FACE À L'ÉLÈVE, pas une raison
 * d'aveugler l'auteur d'une méthode. Un coach qui choisit sans savoir ce que
 * ça change dans les assiettes de sa cohorte ne choisit pas.
 */
function CompositionForksCard({
  draft,
  onChange,
  section,
}: {
  draft: DoctrineDraft;
  onChange: (next: DoctrineDraft) => void;
  section: SectionApi;
}) {
  const positions = draft.composition_positions ?? {};
  const answered = COMPOSITION_FORKS.filter(
    (f) => positions[f.key] && positions[f.key] !== NO_STEERING,
  );

  const choose = (forkKey: string, positionKey: string) =>
    onChange({
      ...draft,
      composition_positions: { ...positions, [forkKey]: positionKey },
    });

  return (
    <Card>
      <EditorSection
        title={t("coach.doctrine.composition.title")}
        hint={t("coach.doctrine.composition.hint")}
        editing={section.isEditing("composition")}
        onEdit={() => section.edit("composition")}
        onDone={section.done}
        onCancel={section.done}
        summary={answered.length === 0
          ? (
            <p className="text-sm text-ink-soft">
              {t("coach.doctrine.composition.empty")}
            </p>
          )
          : (
            <SummaryList
              empty=""
              items={answered.map((fork) => {
                const chosen = fork.positions.find((p) => p.key === positions[fork.key]);
                return (
                  <>
                    <span className="text-ink-soft">{fork.subject}</span>
                    <br />
                    {chosen?.label ?? ""}
                  </>
                );
              })}
            />
          )}
      >
        <div className="space-y-5">
          {COMPOSITION_FORKS.map((fork) => (
            <fieldset key={fork.key} className="space-y-2">
              <legend className="text-sm font-medium text-ink">{fork.subject}</legend>
              {fork.positions.map((position) => {
                const checked = (positions[fork.key] ?? NO_STEERING) === position.key;
                return (
                  <label
                    key={position.key}
                    // LE CHOIX RETENU SE VOIT À SON TRAIT ET À SON LAVIS, et le
                    // lavis est celui du kit (`fig-50`): c'est une SÉLECTION,
                    // donc de la navigation dans un formulaire, le seul endroit
                    // où la marque a le droit d'entrer (charte §2).
                    // `ink` sur `fig-50` = 15,39:1.
                    className={`block cursor-pointer rounded-card border p-2.5 transition-colors ${
                      checked
                        ? "border-fig-700 bg-fig-50"
                        : "border-line-strong hover:bg-paper-2"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name={`fork-${fork.key}`}
                        className="mt-1 shrink-0"
                        checked={checked}
                        onChange={() => choose(fork.key, position.key)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm leading-6 text-ink">
                          {position.label}
                        </span>
                        {/* CE QUE ÇA PRODUIT — en plan et en aliment. */}
                        <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                          {position.effect}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      </EditorSection>
    </Card>
  );
}

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
      <p className="mt-2 text-sm leading-6 text-ink">{t("coach.practices.intro")}</p>
      {hasMethod ? null : (
        <p className="mt-2 rounded-card bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          {t("coach.practices.no_method")}
        </p>
      )}

      {practices.length === 0
        ? <p className="mt-4 text-sm text-ink-soft">{t("coach.practices.empty")}</p>
        : (
          <>
            <p className="mt-4 text-xs text-ink-soft">
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
    <li className="rounded-card border border-line bg-paper-2 p-3">
      {/* Les mots du coach, VERBATIM. Jamais réécrits, donc jamais rendus
          autrement qu'à l'identique. */}
      <p className="text-sm font-medium leading-6 text-ink">{String(practice.label ?? "")}</p>

      {blocked
        ? (
          <div className="mt-2 rounded-card bg-amber-50 px-3 py-2">
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

      {/*
        ⚠️ LE DEUX-POINTS EST DANS LA VALEUR DE LA CLÉ, PLUS DANS LE JSX.
        `{t(…)}:` colle le signe au mot, ce qui est la règle anglaise et une
        faute en français (« Qui la reçoit : » prend une espace avant). On ne
        peut pas non plus la porter comme espace de bord dans le seed
        (`parity.int.test.ts` l'interdit): la ponctuation appartient donc à la
        phrase traduite. Deux clés EXISTANTES changent de valeur anglaise —
        `coach.practices.reach_label` et `coach.practices.brief_label`.
      */}
      <p className="mt-2 text-xs text-ink-soft">
        <span className="font-medium">{t("coach.practices.reach_label")}</span>{" "}
        {practiceReach(practice)}
      </p>
      {practice.brief
        ? (
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            <span className="font-medium">{t("coach.practices.brief_label")}</span>{" "}
            {practice.brief}
          </p>
        )
        : null}

      {/* LES CORRECTIONS. Quatre, et pas une de plus: ce sont les quatre
          décisions du classifieur qui changent ce que la cohorte reçoit. Le
          `kind`, le `target` et l'`unit` ne sont pas éditables ici — ils
          décrivent la phrase du coach, et la façon de les corriger est de
          réécrire la phrase, ce que « Read it again » fait.

          ⚠️ ELLES DISPARAISSENT SUR UNE PRATIQUE BLOQUÉE, et ce n'est pas de
          l'esthétique. Aucune des quatre ne peut lever une collision — la
          ceinture se rejoue sur le LABEL, à chaque lecture. Les laisser à
          l'écran inviterait le coach à décocher des cases jusqu'à ce que « ça
          reparte », et rien ne repartirait: le seul geste utile est de
          réécrire la phrase ou de la retirer. */}
      {blocked ? null : (
      <div className="mt-3 space-y-1.5">
        <label className="flex items-start gap-2 text-xs text-ink">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={practice.askable === true}
            onChange={(e) => onPatch({ askable: e.target.checked })}
          />
          <span>
            {t("coach.practices.askable_label")}
            <span className="block text-ink-soft">{t("coach.practices.askable_hint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-ink">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={practice.minor_safe === true}
            onChange={(e) => onPatch({ minor_safe: e.target.checked })}
          />
          <span>
            {t("coach.practices.minor_safe_label")}
            <span className="block text-ink-soft">{t("coach.practices.minor_safe_hint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-ink">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={practice.cadence === "constant"}
            onChange={(e) => onPatch({ cadence: e.target.checked ? "constant" : "rotating" })}
          />
          <span>
            {t("coach.practices.constant_label")}
            <span className="block text-ink-soft">{t("coach.practices.constant_hint")}</span>
          </span>
        </label>
      </div>
      )}

      {blocked ? null : (
      <div className="mt-2">
        <p className="text-xs font-medium text-ink-soft">{t("coach.practices.scope_label")}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {/* « Everyone » est une VALEUR, pas l'absence de choix: la portée vide
              est le cas de l'écrasante majorité des pratiques. */}
          <button
            type="button"
            onClick={() => onPatch({ goal_scope: [] })}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              scope.length === 0
                ? "border-fig-700 bg-fig-700 text-paper"
                : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50"
            }`}
          >
            {t("coach.goal.everyone")}
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
                  ? "border-fig-700 bg-fig-700 text-paper"
                  : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50"
              }`}
            >
              {goalLabel(g)}
            </button>
          ))}
        </div>
      </div>
      )}

      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={onReclassify}
          disabled={busy}
          className="text-xs text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink disabled:opacity-50"
        >
          {t("coach.practices.reclassify")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          {t("coach.practices.remove")}
        </button>
      </div>
    </li>
  );
}
