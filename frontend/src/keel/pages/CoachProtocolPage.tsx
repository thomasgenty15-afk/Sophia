import React from "react";

import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { inputClass } from "../components/ui/Field";
import { t } from "../i18n/t";
import type { MessageKey } from "../i18n/t";

import {
  AXES_BY_GOAL,
  type CoachTerm,
  type CoachTimingRule,
  type CompiledCommitment,
  compileProtocol,
  type FoodGroupRow,
  type GoalToken,
  groupByClass,
  matchesSearch,
  nextStance,
  previewSentence,
  publishImpact,
  type Stance,
  type StanceOrNeutral,
  type StoredTimingRule,
  suggestAttachment,
  toProtocolInput,
} from "../api/coachProtocol";

/**
 * `/coach/protocol` — LE COACH EXPRIME SA MÉTHODE, EN MOINS DE TROIS MINUTES.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CET ÉCRAN REMPLACE, ET POURQUOI
 * ---------------------------------------------------------------------------
 * Avant, pour que Sophia sache quoi vérifier dans une assiette, un coach devait
 * remplir des engagements structurés: polarité, groupe, `target_op`,
 * `target_min`, `evaluation_grain`, `autonomy`, créneau. Quinze lignes de ce
 * genre pour dire « je pousse les légumes, pas d'huiles de graines, des
 * protéines à chaque repas ». Un formulaire d'expert pour des phrases simples —
 * et il vivait sur DEUX écrans qui faisaient le même travail.
 *
 * Ici il coche. Les engagements sont DÉRIVÉS
 * (`_shared/keel/protocol_compiler.ts`), et il ne les écrit ni ne les connaît.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI DES PASTILLES TRI-ÉTAT, ET PAS UNE LISTE DE 30 LIGNES
 * ---------------------------------------------------------------------------
 * Le vocabulaire est FERMÉ et PETIT: 30 groupes, 9 classes. Trente, ce n'est
 * pas cinq cents — on peut donc tout montrer, et le montrer a une vertu: ça
 * fait exprimer au coach des opinions qu'il n'aurait pas pensé à formuler
 * devant un champ de recherche vide.
 *
 *   - UN TAP PAR DÉCISION. Trente décisions à un tap se font en deux minutes;
 *     trente menus déroulants, jamais.
 *   - GROUPÉ PAR CLASSE, parce que c'est comme ça qu'un coach pense (« les
 *     matières grasses », « les féculents »), et parce que ça permet de ne
 *     déplier que ce qui l'intéresse.
 *   - AU POUCE. Un coach édite depuis son téléphone entre deux clients; un
 *     tableau large ne survit pas à 375 px, une grille de pastilles si.
 *
 * Les alternatives écartées et leur motif sont dans le STATUS — écrites, parce
 * que non motivées elles reviendront.
 *
 * ---------------------------------------------------------------------------
 * L'APERÇU VIT À CÔTÉ DE L'ÉDITION, ET IL N'EST PAS DÉCORATIF
 * ---------------------------------------------------------------------------
 * Puisque les engagements deviennent dérivés, le coach doit voir en permanence
 * les lignes qui sortent de ses coches. Sans ça il coche à l'aveugle dans une
 * boîte noire qui écrit sa méthode à sa place, et il ne fera pas confiance au
 * résultat.
 *
 * Ces phrases ne sont pas une reformulation: elles sortent de `compileProtocol`,
 * le module que `plan-publish-v1` exécutera. Voir `api/coachProtocol.ts`.
 *
 * ---------------------------------------------------------------------------
 * BROUILLON ≠ PUBLICATION
 * ---------------------------------------------------------------------------
 * Le mapping se sauvegarde en continu, mais il ne s'applique pas en continu: un
 * coach au milieu d'une modification ne doit pas pousser une demi-méthode à 200
 * élèves. Et au moment de publier, il lit le diff en langage humain — publier à
 * l'aveugle sur une cohorte est le geste le plus risqué de cet écran.
 */

const CLASS_LABEL: Readonly<Record<string, MessageKey>> = {
  protein: "coach.protocol.class.protein",
  vegetable: "coach.protocol.class.vegetable",
  fruit: "coach.protocol.class.fruit",
  grain: "coach.protocol.class.grain",
  legume: "coach.protocol.class.legume",
  dairy: "coach.protocol.class.dairy",
  fat: "coach.protocol.class.fat",
  beverage: "coach.protocol.class.beverage",
  discretionary: "coach.protocol.class.discretionary",
};

const STANCE_STYLE: Readonly<Record<Stance | "neutral", string>> = {
  neutral: "border-gray-300 bg-white text-gray-600",
  encouraged: "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium",
  discouraged: "border-amber-500 bg-amber-50 text-amber-800 font-medium",
  excluded: "border-rose-500 bg-rose-50 text-rose-800 font-medium",
};

const STANCE_LABEL: Readonly<Record<Stance | "neutral", MessageKey>> = {
  neutral: "coach.protocol.stance.neutral",
  encouraged: "coach.protocol.stance.encouraged",
  discouraged: "coach.protocol.stance.discouraged",
  excluded: "coach.protocol.stance.excluded",
};

type Phase = "loading" | "ready" | "error";

export function CoachProtocolPage() {
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [errorText, setErrorText] = React.useState<string | null>(null);

  const [coachId, setCoachId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<FoodGroupRow[]>([]);
  const [activeStudents, setActiveStudents] = React.useState(0);
  const [goal, setGoal] = React.useState<GoalToken>("fat_loss");

  const [stances, setStances] = React.useState<Record<string, Stance>>({});
  const [timingRules, setTimingRules] = React.useState<StoredTimingRule[]>([]);
  const [terms, setTerms] = React.useState<CoachTerm[]>([]);
  const [published, setPublished] = React.useState<CompiledCommitment[]>([]);
  const [publishedAt, setPublishedAt] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [openClasses, setOpenClasses] = React.useState<Set<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);

  const label = React.useCallback(
    (slug: string) => {
      const row = rows.find((r) => r.slug === slug);
      if (!row) return slug;
      return t(row.label_i18n_key as MessageKey);
    },
    [rows],
  );

  // ---- chargement -------------------------------------------------------
  // FAIL LOUD, SHOW NOTHING. Une lecture ratée rend l'erreur, jamais un état
  // vide: « vous n'avez pas encore de méthode » et « nous n'avons pas pu lire
  // votre méthode » sont deux phrases différentes, et montrer la première pour
  // la seconde invite un coach à tout réécrire.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) throw new Error("no session");

        const coach = await supabase
          .from("coaches")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (coach.error) throw new Error(coach.error.message);

        const groups = await supabase
          .from("food_groups")
          .select("slug, class, label_i18n_key");
        if (groups.error) throw new Error(groups.error.message);

        if (cancelled) return;
        setCoachId(coach.data?.id ?? null);
        setRows((groups.data ?? []) as FoodGroupRow[]);

        if (coach.data?.id) {
          const clients = await supabase
            .from("coach_clients")
            .select("status")
            .eq("coach_id", coach.data.id);
          if (clients.error) throw new Error(clients.error.message);
          if (!cancelled) {
            setActiveStudents(
              (clients.data ?? []).filter((c) => c.status === "active").length,
            );
          }
          await loadProtocol(coach.data.id, cancelled);
        }
        if (!cancelled) setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorText(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProtocol(cid: string, cancelled: boolean) {
    const protocols = await supabase
      .from("coach_protocols")
      .select("id, version, status, published_at")
      .eq("coach_id", cid);
    if (protocols.error) throw new Error(protocols.error.message);

    const draft = (protocols.data ?? []).find((p) => p.status === "draft");
    const live = (protocols.data ?? []).find((p) => p.status === "published");

    const ids = [draft?.id, live?.id].filter(Boolean) as string[];
    if (ids.length === 0) return;

    const [food, timing, coachTerms] = await Promise.all([
      supabase
        .from("coach_food_rules")
        .select("protocol_id, food_group_ref, stance, goal_scope, rationale")
        .in("protocol_id", ids),
      supabase
        .from("coach_timing_rules")
        .select("*")
        .in("protocol_id", ids),
      supabase.from("coach_terms").select("term, food_group_ref").eq("coach_id", cid),
    ]);
    if (food.error) throw new Error(food.error.message);
    if (timing.error) throw new Error(timing.error.message);
    if (coachTerms.error) throw new Error(coachTerms.error.message);
    if (cancelled) return;

    const loadedTerms = (coachTerms.data ?? []) as CoachTerm[];
    setTerms(loadedTerms);

    const draftFood = (food.data ?? []).filter((r) => r.protocol_id === draft?.id);
    setStances(
      Object.fromEntries(draftFood.map((r) => [r.food_group_ref, r.stance as Stance])),
    );
    setTimingRules(
      (timing.data ?? [])
        .filter((r) => r.protocol_id === draft?.id)
        .map((r) => ({ id: r.id as string, rule: rowToTimingRule(r) })),
    );

    if (live) {
      setPublishedAt(live.published_at as string | null);
      setPublished([
        ...compileProtocol(
          {
            coachId: cid,
            contentLocale: "en-GB",
            foodRules: (food.data ?? [])
              .filter((r) => r.protocol_id === live.id)
              .map((r) => ({
                food_group_ref: r.food_group_ref,
                stance: r.stance as Stance,
                goal_scope: (r.goal_scope ?? []) as GoalToken[],
                rationale: r.rationale as string | null,
              })),
            timingRules: (timing.data ?? [])
              .filter((r) => r.protocol_id === live.id)
              .map(rowToTimingRule),
            terms: loadedTerms,
          },
          null,
        ),
      ]);
    }
  }

  // ---- la compilation, en direct ----------------------------------------
  const compiled = React.useMemo(
    () =>
      compileProtocol(
        toProtocolInput({ stances, timingRules, terms }, coachId ?? "", "en-GB"),
        null,
      ),
    [stances, timingRules, terms, coachId],
  );

  const impact = React.useMemo(
    () => publishImpact(published, compiled, activeStudents),
    [published, compiled, activeStudents],
  );

  const classes = React.useMemo(() => groupByClass(rows), [rows]);

  const visible = React.useCallback(
    (row: FoodGroupRow) => matchesSearch(row, label(row.slug), terms, query),
    [label, terms, query],
  );

  const searching = query.trim().length > 0;
  const anyMatch = rows.some(visible);

  function cycle(slug: string) {
    setStances((prev) => {
      const next: StanceOrNeutral = nextStance(prev[slug]);
      const copy = { ...prev };
      // Neutre = ABSENCE de ligne. C'est une valeur, pas un « non rempli »:
      // l'écrasante majorité des groupes n'appelle aucune opinion.
      if (next === undefined) delete copy[slug];
      else copy[slug] = next;
      return copy;
    });
  }

  function openAxis(axisClasses: readonly string[]) {
    setOpenClasses((prev) => new Set([...prev, ...axisClasses]));
  }

  const shell = {
    variant: "coach",
    // `wide` parce que l'aperçu vit À CÔTÉ de l'édition (§2.4): en `narrow` la
    // seconde colonne n'a pas la place d'exister et l'aperçu retomberait sur un
    // autre écran — exactement ce que le brief interdit.
    width: "wide",
    title: t("coach.protocol.title"),
    subtitle: t("coach.protocol.subtitle"),
  } as const;

  if (phase === "loading") {
    return (
      <KeelAppShell {...shell}>
        <p className="p-4 text-gray-500">…</p>
      </KeelAppShell>
    );
  }

  if (phase === "error") {
    return (
      <KeelAppShell {...shell}>
        <Card tone="warning">
          <p className="font-medium">{t("coach.protocol.load_error")}</p>
          {errorText && <p className="mt-1 text-sm text-gray-600">{errorText}</p>}
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell {...shell}>
      {/*
        LA DISPOSITION. Une seule colonne sous 1024 px — au pouce, l'aperçu
        passe SOUS l'édition et reste atteignable en scrollant. Deux colonnes
        au-delà, l'aperçu collant à droite. Dans les deux cas il vit À CÔTÉ de
        l'édition, jamais sur un autre écran.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {/* ── LES AXES: des QUESTIONS, jamais des réponses ──────────────── */}
          {compiled.length === 0 && (
            <Card className="mb-4">
              <SectionLabel>{t("coach.protocol.axes.title")}</SectionLabel>
              <div className="mb-3 flex flex-wrap gap-2">
                {(AXES_BY_GOAL[goal] ?? []).map((axis) => (
                  <Button
                    key={axis.labelKey}
                    size="sm"
                    onClick={() => openAxis(axis.classes)}
                  >
                    {t(axis.labelKey)}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-gray-600">{t("coach.protocol.axes.footer")}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {(Object.keys(AXES_BY_GOAL) as GoalToken[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoal(g)}
                    className={`rounded-full border px-2 py-1 text-xs ${
                      g === goal
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-600"
                    }`}
                  >
                    {t(`coach.protocol.goal.${g}` as MessageKey)}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* ── LA RECHERCHE: complément, jamais remplacement ─────────────── */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("coach.protocol.search_placeholder")}
            className={`${inputClass} mb-4`}
            aria-label={t("coach.protocol.search_placeholder")}
          />

          {searching && !anyMatch && (
            <p className="mb-4 text-sm text-gray-600">
              {t("coach.protocol.search_empty", { query })}
            </p>
          )}

          <p className="mb-3 text-xs text-gray-500">{t("coach.protocol.stance.hint")}</p>

          {/* ── LES NEUF CARTES DE CLASSE ─────────────────────────────────── */}
          <div className="space-y-3">
            {classes.map(({ className, groups }) => {
              const shown = groups.filter(visible);
              if (shown.length === 0) return null;
              // Une recherche ouvre d'office les cartes qui matchent: laisser
              // le coach chercher puis cliquer pour déplier serait deux gestes
              // là où il en a demandé un.
              const open = searching || openClasses.has(className);
              const marked = groups.filter((g) => stances[g.slug]).length;
              return (
                <Card key={className} padded={false}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-4 text-left"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenClasses((prev) => {
                        const copy = new Set(prev);
                        if (copy.has(className)) copy.delete(className);
                        else copy.add(className);
                        return copy;
                      })}
                  >
                    <span className="font-medium">
                      {CLASS_LABEL[className] ? t(CLASS_LABEL[className]) : className}
                    </span>
                    <span className="flex items-center gap-2">
                      {marked > 0 && <Badge tone="info">{marked}</Badge>}
                      <span aria-hidden className="text-gray-400">
                        {open ? "−" : "+"}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <div className="flex flex-wrap gap-2 px-4 pb-4">
                      {shown.map((row) => {
                        const stance = stances[row.slug];
                        const key = stance ?? "neutral";
                        return (
                          <button
                            key={row.slug}
                            type="button"
                            onClick={() => cycle(row.slug)}
                            // Au pouce: 44 px de haut minimum, la cible tactile
                            // en deçà de laquelle on rate une pastille sur deux.
                            className={`min-h-[44px] rounded-full border px-3 py-2 text-sm ${
                              STANCE_STYLE[key]
                            }`}
                            aria-pressed={stance !== undefined}
                            aria-label={`${label(row.slug)} — ${t(STANCE_LABEL[key])}`}
                          >
                            {label(row.slug)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <TimingRulesEditor
            rows={rows}
            rules={timingRules}
            label={label}
            onChange={setTimingRules}
          />

          <CoachTermsEditor
            rows={rows}
            terms={terms}
            coachId={coachId}
            label={label}
            onChange={setTerms}
          />
        </div>

        {/* ── L'APERÇU ─────────────────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <SectionLabel>{t("coach.protocol.preview.title")}</SectionLabel>
            {compiled.length === 0
              ? <p className="text-sm text-gray-500">{t("coach.protocol.preview.empty")}</p>
              : (
                <ul className="space-y-2 text-sm">
                  {compiled.map((line) => {
                    const s = previewSentence(line.preview, label);
                    return (
                      <li key={line.template_commitment_key} className="text-gray-800">
                        {t(s.key, s.params)}
                      </li>
                    );
                  })}
                </ul>
              )}

            <div className="mt-4 border-t pt-4">
              {publishedAt
                ? (
                  <p className="mb-2 text-xs text-gray-500">
                    {t("coach.protocol.published_at", {
                      date: new Date(publishedAt).toLocaleDateString(),
                    })}
                  </p>
                )
                : (
                  <p className="mb-2 text-xs text-gray-500">
                    {t("coach.protocol.never_published")}
                  </p>
                )}

              {impact.noop
                ? <p className="text-sm text-gray-500">{t("coach.protocol.publish.noop")}</p>
                : confirming
                ? (
                  <div className="space-y-2">
                    {/* LA PHRASE QUI REND LE GESTE RÉVERSIBLE DANS SA TÊTE
                        AVANT DE L'ÊTRE DANS LA BASE. */}
                    <p className="text-sm text-gray-800">
                      {t("coach.protocol.publish.impact", {
                        added: impact.added,
                        removed: impact.removed,
                        changed: impact.changed,
                        students: impact.students,
                      })}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm">
                        {t("coach.protocol.publish.confirm")}
                      </Button>
                      <Button size="sm" onClick={() => setConfirming(false)}>
                        {t("coach.protocol.publish.cancel")}
                      </Button>
                    </div>
                  </div>
                )
                : (
                  <Button variant="primary" onClick={() => setConfirming(true)}>
                    {t("coach.protocol.publish")}
                  </Button>
                )}
            </div>
          </Card>
        </aside>
      </div>
    </KeelAppShell>
  );
}

// ---------------------------------------------------------------------------
// LES RÈGLES TEMPORELLES — quatre gabarits fermés, à trous
// ---------------------------------------------------------------------------
// Pas de texte libre: le texte libre ne se compile pas de façon déterministe.
// Pas d'éditeur de règles générique non plus — elles se comptent sur les doigts
// d'une main.

const TEMPLATES: readonly {
  readonly key: CoachTimingRule["template"];
  readonly labelKey: MessageKey;
}[] = [
  {
    key: "portions_per_period",
    labelKey: "coach.protocol.timing.tpl.portions_per_period",
  },
  { key: "group_every_meal", labelKey: "coach.protocol.timing.tpl.group_every_meal" },
  { key: "no_group_after", labelKey: "coach.protocol.timing.tpl.no_group_after" },
  { key: "group_at_slot", labelKey: "coach.protocol.timing.tpl.group_at_slot" },
];

function TimingRulesEditor({
  rows,
  rules,
  label,
  onChange,
}: {
  rows: readonly FoodGroupRow[];
  rules: readonly StoredTimingRule[];
  label: (slug: string) => string;
  onChange: (next: StoredTimingRule[]) => void;
}) {
  const [adding, setAdding] = React.useState(false);

  function add(template: CoachTimingRule["template"]) {
    // Le slug vient de `food_groups`, donc du vocabulaire fermé lui-même — la
    // FK est la vérité, cette assertion ne fait que le dire au typeur.
    const group = (rows[0]?.slug ?? "leafy_greens") as CoachTimingRule["food_group_ref"];
    const base = { food_group_ref: group, goal_scope: [], rationale: null } as const;
    const rule: CoachTimingRule = template === "portions_per_period"
      ? { ...base, template, direction: "at_least", portions: 1, period: "day" }
      : template === "group_every_meal"
      ? { ...base, template }
      : template === "no_group_after"
      ? { ...base, template, cutoff_local: "21:00" }
      : { ...base, template, slot_key: "breakfast" };
    onChange([...rules, { id: `new-${rules.length}-${template}`, rule }]);
    setAdding(false);
  }

  return (
    <Card className="mt-4">
      <SectionLabel>{t("coach.protocol.timing.title")}</SectionLabel>
      {rules.length === 0 && (
        <p className="mb-3 text-sm text-gray-500">{t("coach.protocol.timing.empty")}</p>
      )}
      <ul className="mb-3 space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{describeRule(r.rule, label)}</span>
            <button
              type="button"
              className="text-xs text-gray-500 underline"
              onClick={() => onChange(rules.filter((x) => x.id !== r.id))}
            >
              {t("coach.protocol.timing.remove")}
            </button>
          </li>
        ))}
      </ul>
      {adding
        ? (
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((tpl) => (
              <Button key={tpl.key} size="sm" onClick={() => add(tpl.key)}>
                {t(tpl.labelKey)}
              </Button>
            ))}
          </div>
        )
        : (
          <Button size="sm" onClick={() => setAdding(true)}>
            {t("coach.protocol.timing.add")}
          </Button>
        )}
    </Card>
  );
}

function describeRule(rule: CoachTimingRule, label: (slug: string) => string): string {
  const g = label(rule.food_group_ref);
  switch (rule.template) {
    case "portions_per_period":
      return `${g} — ${rule.direction === "at_least" ? "≥" : "≤"} ${rule.portions}/${rule.period}`;
    case "group_every_meal":
      return `${g} — every meal`;
    case "no_group_after":
      return `${g} — not after ${rule.cutoff_local}`;
    case "group_at_slot":
      return `${g} — at ${rule.slot_key}`;
  }
}

// ---------------------------------------------------------------------------
// LES TERMES DU COACH — le rattachement n'est JAMAIS silencieux
// ---------------------------------------------------------------------------

function CoachTermsEditor({
  rows,
  terms,
  coachId,
  label,
  onChange,
}: {
  rows: readonly FoodGroupRow[];
  terms: readonly CoachTerm[];
  coachId: string | null;
  label: (slug: string) => string;
  onChange: (next: CoachTerm[]) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const [requested, setRequested] = React.useState<string[]>([]);

  const suggestion = React.useMemo(
    () => suggestAttachment(draft, rows, label),
    [draft, rows, label],
  );

  async function requestExtension(term: string) {
    if (!coachId) return;
    // Le vocabulaire partagé grandit GLOBALEMENT et de façon curée, jamais par
    // coach. On enregistre la demande; l'ajout effectif d'un slug reste une
    // migration.
    await supabase.from("vocabulary_extension_requests").insert({
      coach_id: coachId,
      term,
      content_locale: "en-GB",
      status: "open",
    });
    setRequested((prev) => [...prev, term]);
    setDraft("");
  }

  return (
    <Card className="mt-4">
      <SectionLabel>{t("coach.protocol.terms.title")}</SectionLabel>
      <p className="mb-3 text-sm text-gray-600">{t("coach.protocol.terms.help")}</p>

      <ul className="mb-3 space-y-1 text-sm">
        {terms.map((term) => (
          <li key={term.term} className="flex items-center gap-2">
            <span className="font-medium">{term.term}</span>
            {/* LA TRANSPARENCE: un rattachement muet est un mensonge sur ce que
                Sophia vérifiera vraiment. */}
            <span className="text-gray-500">
              {t("coach.protocol.terms.treated_as", {
                group: label(term.food_group_ref),
              })}
            </span>
            <button
              type="button"
              className="text-xs text-gray-500 underline"
              onClick={() => onChange(terms.filter((x) => x.term !== term.term))}
            >
              {t("coach.protocol.terms.change")}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("coach.protocol.terms.placeholder")}
          className={inputClass}
          aria-label={t("coach.protocol.terms.title")}
        />
        {suggestion
          ? (
            <Button
              size="sm"
              onClick={() => {
                onChange([
                  ...terms,
                  { term: draft.trim(), food_group_ref: suggestion as CoachTerm["food_group_ref"] },
                ]);
                setDraft("");
              }}
            >
              {t("coach.protocol.terms.add")} — {t("coach.protocol.terms.treated_as", {
                group: label(suggestion),
              })}
            </Button>
          )
          : draft.trim().length > 0
          ? (
            <div className="text-sm">
              <p className="text-gray-600">
                {t("coach.protocol.terms.unmatched", { term: draft.trim() })}
              </p>
              <Button size="sm" onClick={() => requestExtension(draft.trim())}>
                {t("coach.protocol.terms.request_extension")}
              </Button>
            </div>
          )
          : null}
      </div>

      {requested.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">{t("coach.protocol.terms.requested")}</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function rowToTimingRule(r: Record<string, unknown>): CoachTimingRule {
  const base = {
    food_group_ref: r.food_group_ref as CoachTimingRule["food_group_ref"],
    goal_scope: (r.goal_scope ?? []) as GoalToken[],
    rationale: (r.rationale ?? null) as string | null,
  };
  const template = r.template as CoachTimingRule["template"];
  switch (template) {
    case "portions_per_period":
      return {
        ...base,
        template,
        direction: r.direction as "at_least" | "at_most",
        portions: Number(r.portions),
        period: r.period as "day" | "week",
      };
    case "group_every_meal":
      return { ...base, template };
    case "no_group_after":
      return { ...base, template, cutoff_local: String(r.cutoff_local) };
    case "group_at_slot":
      return {
        ...base,
        template,
        slot_key: r.slot_key as Extract<CoachTimingRule, { template: "group_at_slot" }>["slot_key"],
      };
  }
}

export default CoachProtocolPage;
