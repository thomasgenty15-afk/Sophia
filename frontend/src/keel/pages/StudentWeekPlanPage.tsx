import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";

/**
 * PIVOT N3 — `/app/plan` : le plan de la semaine, celui de l'ÉLÈVE.
 *
 * ---------------------------------------------------------------------------
 * LE MODÈLE, parce que tout l'écran en découle
 * ---------------------------------------------------------------------------
 *     LE COACH RECOMMANDE · L'ÉLÈVE DÉCIDE · PERSONNE NE NOTE
 *
 * Cet écran n'affiche donc jamais de score, de pourcentage de réalisation, de
 * série ou de badge. Il montre ce que l'élève s'est fixé, et d'où vient chaque
 * ligne. Rien ici ne mesure sa performance — c'est ce qui permet à Sophia de
 * « suivre de très loin » sans créer de résistance.
 *
 * ---------------------------------------------------------------------------
 * GÉNÉRER N'EST PAS ADOPTER, et c'est la nuance qui fait que le plan est le SIEN
 * ---------------------------------------------------------------------------
 * La génération produit un BROUILLON. L'élève lit, et adopte s'il s'y
 * reconnaît. Un plan appliqué automatiquement serait le plan de la machine
 * porté par l'élève — exactement le contraire de ce qu'on construit.
 *
 * ---------------------------------------------------------------------------
 * CHAQUE LIGNE DIT D'OÙ ELLE VIENT
 * ---------------------------------------------------------------------------
 * Une ligne nutrition affiche « recommandé par ton coach » ; une action affiche
 * « suggéré par Sophia ». Ce n'est pas décoratif : c'est la règle d'autorité
 * §1.5 rendue LISIBLE. Un élève doit pouvoir distinguer en un coup d'œil ce qui
 * vient de son coach de ce que l'assistant a ajouté, sinon les deux se
 * confondent et le coach perd son autorité sans que personne ne l'ait décidé.
 */

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-week-plan-v1`;

interface PlanItem {
  kind: "nutrition" | "action";
  label: string;
  rationale: string;
  source_commitment_key: string | null;
  action_kind: string | null;
  days: string[];
}

interface WeekPlanRow {
  id: string;
  week_start: string;
  items: PlanItem[];
  status: "draft" | "adopted" | "archived";
  adopted_at: string | null;
}

interface GoalRow {
  goal: string;
  situation: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

const DAY_LABELS: Record<string, string> = {
  mon: "lun", tue: "mar", wed: "mer", thu: "jeu",
  fri: "ven", sat: "sam", sun: "dim",
};

const GOALS: Array<{ value: string; label: string }> = [
  { value: "fat_loss", label: "Perdre du gras" },
  { value: "recomposition", label: "Recomposition" },
  { value: "performance", label: "Performance" },
  { value: "health", label: "Santé" },
  { value: "maintenance", label: "Maintenir" },
];

/** Le lundi de la semaine courante, en date locale. */
function currentMonday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

export default function StudentWeekPlanPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [plan, setPlan] = React.useState<WeekPlanRow | null>(null);
  const [goal, setGoal] = React.useState<GoalRow | null>(null);
  const [goalDraft, setGoalDraft] = React.useState({ goal: "health", situation: "" });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  const weekStart = currentMonday();

  const refresh = React.useCallback(async () => {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) throw new Error("not_signed_in");

    const [planRes, goalRes] = await Promise.all([
      supabase
        .from("student_week_plans")
        .select("id, week_start, items, status, adopted_at")
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase.from("student_goals").select("goal, situation").maybeSingle(),
    ]);
    // Fail loud: "tu n'as pas encore de plan" et "on n'a pas pu le lire" sont
    // deux phrases différentes, et montrer la première pour la seconde invite
    // l'élève à tout regénérer par-dessus.
    if (planRes.error) throw new Error(planRes.error.message);
    if (goalRes.error) throw new Error(goalRes.error.message);

    setPlan((planRes.data ?? null) as WeekPlanRow | null);
    const g = (goalRes.data ?? null) as GoalRow | null;
    setGoal(g);
    if (g) setGoalDraft({ goal: g.goal, situation: g.situation ?? "" });
  }, [weekStart]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const saveGoal = () =>
    run("goal", async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("not_signed_in");
      const { error } = await supabase.from("student_goals").upsert({
        user_id: uid,
        goal: goalDraft.goal,
        situation: goalDraft.situation.trim() || null,
        content_locale: "fr-FR",
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await refresh();
    });

  const generate = () =>
    run("generate", async () => {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          authorization: `Bearer ${sess.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ local_date: weekStart }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        // Le code d'erreur du serveur voyage jusqu'ici: `goal_required` et
        // `coach_has_no_program` veulent dire des choses très différentes.
        throw new Error(String(json?.error ?? `HTTP ${res.status}`));
      }
      await refresh();
    });

  const adopt = () =>
    run("adopt", async () => {
      if (!plan) return;
      const { error } = await supabase
        .from("student_week_plans")
        .update({ status: "adopted", adopted_at: new Date().toISOString() })
        .eq("id", plan.id);
      if (error) throw new Error(error.message);
      await refresh();
    });

  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="student" title="Ma semaine">
        <p className="text-sm text-gray-500">Chargement…</p>
      </KeelAppShell>
    );
  }
  if (state.kind === "error") {
    return (
      <KeelAppShell variant="student" title="Ma semaine">
        <Card tone="warning">
          <p className="text-sm text-gray-900">On n'a pas pu lire ta semaine.</p>
          <p className="mt-1 text-xs text-gray-600">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell variant="student" title="Ma semaine">
      <div className="space-y-6">
        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-gray-900">Ça n'est pas passé.</p>
            <p className="mt-1 text-xs text-gray-600">{failure}</p>
          </Card>
        ) : null}

        <Card>
          <SectionLabel>Ton objectif</SectionLabel>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            C'est ce qui sert à choisir, dans les recommandations de ton coach,
            celles qui comptent pour toi cette semaine. Ton coach reste l'auteur
            du contenu — l'objectif ne change que ce qu'on met en avant.
          </p>
          <div className="mt-4 space-y-4">
            <Field label="Ce que tu vises" htmlFor="goal">
              <select
                id="goal"
                className={inputClass}
                value={goalDraft.goal}
                onChange={(e) => setGoalDraft((p) => ({ ...p, goal: e.target.value }))}
              >
                {GOALS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </Field>
            <Field
              label="Ta situation"
              htmlFor="situation"
              hint="Ce qui rend une semaine possible ou impossible : cantine, horaires, sport, week-ends."
            >
              <textarea
                id="situation"
                rows={3}
                className={inputClass}
                value={goalDraft.situation}
                onChange={(e) => setGoalDraft((p) => ({ ...p, situation: e.target.value }))}
              />
            </Field>
            <Button onClick={saveGoal} disabled={busy !== null} variant="secondary">
              {busy === "goal" ? "…" : "Enregistrer"}
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel>Semaine du {weekStart}</SectionLabel>
              {plan ? (
                <p className="mt-2 text-sm text-gray-700">
                  {plan.status === "adopted"
                    ? <Badge tone="positive">Adopté</Badge>
                    : <Badge tone="neutral">Brouillon</Badge>}
                </p>
              ) : null}
            </div>
            <Button onClick={generate} disabled={busy !== null || !goal}>
              {busy === "generate"
                ? "…"
                : plan
                ? "Regénérer"
                : "Générer ma semaine"}
            </Button>
          </div>

          {!goal ? (
            <p className="mt-4 text-sm text-gray-600">
              Renseigne ton objectif au-dessus, puis génère ta semaine.
            </p>
          ) : !plan ? (
            <p className="mt-4 text-sm text-gray-600">
              Pas encore de plan cette semaine.
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-4">
                {plan.items.map((item, i) => (
                  <li key={i} className="border-l-2 border-gray-200 pl-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{item.label}</span>
                      {/* La règle d'autorité, rendue LISIBLE. */}
                      {item.kind === "nutrition"
                        ? <Badge tone="info">Recommandé par ton coach</Badge>
                        : <Badge tone="neutral">Suggéré par Sophia</Badge>}
                    </div>
                    {item.rationale ? (
                      <p className="mt-1 text-xs leading-5 text-gray-600">{item.rationale}</p>
                    ) : null}
                    {item.days.length > 0 ? (
                      <p className="mt-1 text-xs text-gray-500">
                        {item.days.map((d) => DAY_LABELS[d] ?? d).join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>

              {plan.status !== "adopted" ? (
                <div className="mt-6">
                  <Button onClick={adopt} disabled={busy !== null}>
                    {busy === "adopt" ? "…" : "C'est ma semaine"}
                  </Button>
                  <p className="mt-2 text-xs text-gray-500">
                    Rien n'est suivi tant que tu ne l'as pas adopté. Et même
                    après, personne ne te note : c'est ta semaine, pas un examen.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </KeelAppShell>
  );
}
