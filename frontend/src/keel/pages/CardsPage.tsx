import React from "react";

import { useAuth } from "../../context/AuthContext";
import {
  type CardArmingRow,
  type CardTemplateRow,
  type CardVariable,
  createStudentCard,
  loadArmedCards,
  loadCardTemplates,
  loadStudentCards,
  logCardWin,
  type StudentCardRow,
  updateStudentCard,
} from "../api/cards";
import { localDateIn } from "../api/dates";
import { loadPublishedPlanVersion } from "../api/keelClient";
import KeelAppShell from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";

// KEEL W8 — /app/cards.
//
// A card is an IMPLEMENTATION INTENTION: situation, signal, response, plan B.
// It works when it is CONCRETE and when it arrives BEFORE the moment. This
// screen is built around those two facts, in that order:
//
//   1. ARMED FIRST. The top section is what is armed for the days ahead, not a
//      library. A card the student has to go and look for has already failed —
//      the whole point of `card_armings` is that the card comes to them.
//   2. THE SENTENCE IS THE PRODUCT. Everything else on a card row is chrome.
//
// THE TEXT ON THIS SCREEN IS ALWAYS THE STORED `rendered` VALUE.
// There is no renderer in the browser. `student_cards.rendered` is written by a
// database trigger from `body_template` x `variable_values`, so after saving we
// display the row we read back — never the strings we assembled locally. This
// is the same write-through rule `keelClient.ts` applies to facts, and here it
// also closes the defense-card-ui-qa failure mode by construction: nothing
// between the student's keystrokes and the stored sentence can rewrite it,
// because nothing between them composes it.
//
// I18N HAND-OFF (W9 owns `frontend/src/keel/i18n/en.ts`; this file must not
// write it). `COPY` below is the literal hand-off: its keys are the exact
// message keys to add, its values are the exact English strings. W9 pastes the
// object into `en.ts` and swaps `c(` for `t(` — the key names do not change.

const COPY = {
  "cards.title": "Your cards",
  "cards.subtitle":
    "Decisions you made while calm, so the moment does not have to decide.",
  "cards.armed.title": "Armed for what is coming",
  "cards.armed.empty":
    "Nothing armed right now. When you tell your coach or the chat about a restaurant, a trip or an evening out, the matching card arms itself before it.",
  "cards.armed.event_at": "for {when}",
  "cards.armed.held": "It held",
  "cards.armed.slipped": "It did not",
  "cards.mine.title": "Your cards",
  "cards.mine.empty": "No cards yet. Write your first one below.",
  "cards.mine.keyword": "Switch word: {keyword}",
  "cards.mine.approved": "Approved by your coach",
  "cards.mine.edit": "Edit",
  "cards.mine.cancel": "Cancel",
  "cards.mine.save": "Save",
  "cards.mine.archive": "Archive",
  "cards.new.title": "Write a card",
  "cards.new.pick": "Pick a situation",
  "cards.new.kind.defense": "Situations",
  "cards.new.kind.attack": "Techniques",
  "cards.new.keyword_label": "Switch word (optional)",
  "cards.new.keyword_hint":
    "One lowercase word you can send on its own when the pressure rises.",
  "cards.new.create": "Create the card",
  "cards.new.back": "Back to the list",
  "cards.new.purpose": "What it is for",
  "cards.new.produces": "What you end up with",
  "cards.new.usage": "How to use it",
  "cards.loading": "Loading...",
  "cards.error": "Something went wrong: {message}",
  "cards.no_plan":
    "Cards arrive with your plan. Once your coach publishes it, this page fills up.",
} as const;

type CopyKey = keyof typeof COPY;

/** Local twin of `t()` while the keys live here. Same interpolation contract. */
function c(key: CopyKey, params?: Record<string, string>): string {
  const template: string = COPY[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    params[name] ?? whole,
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no_plan" }
  | { kind: "ready" };

interface PageData {
  timezone: string;
  planVersionId: string;
  templates: CardTemplateRow[];
  cards: StudentCardRow[];
  armings: CardArmingRow[];
}

const EMPTY: PageData = {
  timezone: "Europe/Paris",
  planVersionId: "",
  templates: [],
  cards: [],
  armings: [],
};

export default function CardsPage() {
  const { user } = useAuth();
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [data, setData] = React.useState<PageData>(EMPTY);
  const [composing, setComposing] = React.useState(false);
  const [editingCardId, setEditingCardId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      const planVersion = await loadPublishedPlanVersion(user.id);
      if (!planVersion) {
        setState({ kind: "no_plan" });
        return;
      }
      const [templates, cards, armings] = await Promise.all([
        loadCardTemplates(),
        loadStudentCards(user.id),
        loadArmedCards(user.id),
      ]);
      setData({
        timezone: planVersion.timezone,
        planVersionId: planVersion.id,
        templates,
        cards,
        armings,
      });
      setState({ kind: "ready" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [user?.id]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const cardsById = React.useMemo(
    () => new Map(data.cards.map((card) => [card.id, card])),
    [data.cards],
  );
  const templatesById = React.useMemo(
    () => new Map(data.templates.map((template) => [template.id, template])),
    [data.templates],
  );

  const today = React.useMemo(
    () => localDateIn(data.timezone),
    [data.timezone],
  );

  async function handleWin(
    arming: CardArmingRow,
    outcome: "held" | "slipped",
  ) {
    setBusy(true);
    try {
      await logCardWin({
        studentCardId: arming.student_card_id,
        armingId: arming.id,
        localDate: arming.local_date,
        slotKey: arming.slot_key,
        outcome,
        source: "app",
      });
      await reload();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <KeelAppShell title={c("cards.title")} subtitle={c("cards.subtitle")}>
        <p className="text-sm text-gray-500">{c("cards.loading")}</p>
      </KeelAppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <KeelAppShell title={c("cards.title")} subtitle={c("cards.subtitle")}>
        <Card tone="warning">
          <p className="text-sm text-amber-900">
            {c("cards.error", { message: state.message })}
          </p>
        </Card>
      </KeelAppShell>
    );
  }
  if (state.kind === "no_plan") {
    return (
      <KeelAppShell title={c("cards.title")} subtitle={c("cards.subtitle")}>
        <Card tone="dashed">
          <p className="text-sm text-gray-600">{c("cards.no_plan")}</p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell
      title={c("cards.title")}
      subtitle={c("cards.subtitle")}
      actions={
        composing ? (
          <Button onClick={() => setComposing(false)}>
            {c("cards.new.back")}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setComposing(true)}>
            {c("cards.new.title")}
          </Button>
        )
      }
    >
      {composing ? (
        <ComposeCard
          templates={data.templates}
          planVersionId={data.planVersionId}
          onCreated={async () => {
            setComposing(false);
            await reload();
          }}
        />
      ) : (
        <div className="space-y-8">
          {/* 1. ARMED FIRST — see the header. */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {c("cards.armed.title")}
            </h2>
            {data.armings.length === 0 ? (
              <Card tone="dashed">
                <p className="text-sm text-gray-600">{c("cards.armed.empty")}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {data.armings.map((arming) => {
                  const card = cardsById.get(arming.student_card_id);
                  if (!card) return null;
                  return (
                    <Card key={arming.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">
                          {c("cards.armed.event_at", {
                            when: `${arming.local_date}${
                              arming.slot_key ? ` / ${arming.slot_key}` : ""
                            }`,
                          })}
                        </Badge>
                      </div>
                      <CardBody rendered={card.rendered} />
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy}
                          onClick={() => void handleWin(arming, "held")}
                        >
                          {c("cards.armed.held")}
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleWin(arming, "slipped")}
                        >
                          {c("cards.armed.slipped")}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* 2. THE LIBRARY. */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {c("cards.mine.title")}
            </h2>
            {data.cards.length === 0 ? (
              <Card tone="dashed">
                <p className="text-sm text-gray-600">{c("cards.mine.empty")}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {data.cards.map((card) => (
                  <Card key={card.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {templatesById.get(card.template_id)?.title ?? ""}
                      </span>
                      {card.coach_approved && (
                        <Badge tone="positive">{c("cards.mine.approved")}</Badge>
                      )}
                      {card.keyword && (
                        <Badge tone="neutral">
                          {c("cards.mine.keyword", { keyword: card.keyword })}
                        </Badge>
                      )}
                    </div>

                    {editingCardId === card.id ? (
                      <EditCard
                        card={card}
                        template={templatesById.get(card.template_id)}
                        onCancel={() => setEditingCardId(null)}
                        onSaved={async () => {
                          setEditingCardId(null);
                          await reload();
                        }}
                      />
                    ) : (
                      <>
                        <CardBody rendered={card.rendered} />
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => setEditingCardId(card.id)}
                          >
                            {c("cards.mine.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await updateStudentCard({
                                  cardId: card.id,
                                  status: "archived",
                                });
                                await reload();
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {c("cards.mine.archive")}
                          </Button>
                        </div>
                      </>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <p className="mt-6 text-xs text-gray-400">{today}</p>
    </KeelAppShell>
  );
}

/**
 * The stored sentence, verbatim. `whitespace-pre-line` because the body
 * templates carry real newlines between situation, signal, response and plan B
 * — the four lines ARE the structure, and collapsing them would turn an
 * implementation intention back into a paragraph of advice.
 */
function CardBody({ rendered }: { rendered: string }) {
  return (
    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-800">
      {rendered}
    </p>
  );
}

// ---------------------------------------------------------------------------
// The variable form — the whole personalization surface
// ---------------------------------------------------------------------------

function VariableInputs({
  variables,
  values,
  onChange,
}: {
  variables: CardVariable[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      {variables.map((variable) => (
        <Field key={variable.key} label={variable.label} htmlFor={variable.key}>
          {variable.type === "choice" ? (
            <select
              id={variable.key}
              className={inputClass}
              value={values[variable.key] ?? ""}
              onChange={(event) => onChange(variable.key, event.target.value)}
            >
              <option value="" disabled>
                --
              </option>
              {(variable.options ?? []).map((option) => (
                // The VALUE is the stored token (R1); the LABEL is the prose
                // the renderer substitutes. Never the other way round.
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={variable.key}
              className={inputClass}
              type={
                variable.type === "time"
                  ? "time"
                  : variable.type === "number"
                  ? "number"
                  : "text"
              }
              value={values[variable.key] ?? ""}
              onChange={(event) => onChange(variable.key, event.target.value)}
            />
          )}
        </Field>
      ))}
    </div>
  );
}

function ComposeCard({
  templates,
  planVersionId,
  onCreated,
}: {
  templates: CardTemplateRow[];
  planVersionId: string;
  onCreated: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [keyword, setKeyword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const selected = templates.find((template) => template.id === selectedId);
  const byKind = (kind: "defense" | "attack") =>
    templates.filter((template) => template.card_kind === kind);

  async function handleCreate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await createStudentCard({
        templateId: selected.id,
        variableValues: values,
        keyword: keyword.trim() || null,
        planVersionId,
      });
      await onCreated();
    } catch (err) {
      // The server names the offending variable; showing that message is more
      // useful than a generic failure, and it is safe — it contains no data the
      // student did not type.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">
        {c("cards.new.pick")}
      </h2>

      {(["defense", "attack"] as const).map((kind) => (
        <div key={kind} className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {kind === "defense"
              ? c("cards.new.kind.defense")
              : c("cards.new.kind.attack")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {byKind(kind).map((template) => (
              <Button
                key={template.id}
                size="sm"
                variant={template.id === selectedId ? "primary" : "secondary"}
                onClick={() => {
                  setSelectedId(template.id);
                  setValues({});
                  setError(null);
                }}
              >
                {template.title}
              </Button>
            ))}
          </div>
        </div>
      ))}

      {selected && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline font-medium text-gray-700">
                {c("cards.new.purpose")}:{" "}
              </dt>
              <dd className="inline text-gray-600">{selected.purpose}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-gray-700">
                {c("cards.new.produces")}:{" "}
              </dt>
              <dd className="inline text-gray-600">{selected.produces}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-gray-700">
                {c("cards.new.usage")}:{" "}
              </dt>
              <dd className="inline text-gray-600">{selected.usage}</dd>
            </div>
          </dl>

          <VariableInputs
            variables={selected.variables}
            values={values}
            onChange={(key, value) =>
              setValues((current) => ({ ...current, [key]: value }))
            }
          />

          <Field
            className="mt-3"
            label={c("cards.new.keyword_label")}
            hint={c("cards.new.keyword_hint")}
            htmlFor="card-keyword"
          >
            <input
              id="card-keyword"
              className={inputClass}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </Field>

          {error && <p className="mt-3 text-xs text-red-700">{error}</p>}

          <div className="mt-4">
            <Button variant="primary" disabled={busy} onClick={() => void handleCreate()}>
              {c("cards.new.create")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function EditCard({
  card,
  template,
  onCancel,
  onSaved,
}: {
  card: StudentCardRow;
  template: CardTemplateRow | undefined;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const [key, value] of Object.entries(card.variable_values ?? {})) {
      initial[key] = String(value);
    }
    return initial;
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!template) return null;

  return (
    <div>
      <VariableInputs
        variables={template.variables}
        values={values}
        onChange={(key, value) =>
          setValues((current) => ({ ...current, [key]: value }))
        }
      />
      {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await updateStudentCard({
                cardId: card.id,
                variableValues: values,
              });
              await onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {c("cards.mine.save")}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {c("cards.mine.cancel")}
        </Button>
      </div>
    </div>
  );
}
