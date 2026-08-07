import React from "react";

import { supabase } from "../../lib/supabase";
import { dishDayLabel } from "../api/mealLabels";
import { mergePracticalConstraints } from "../api/practicalConstraints";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field, inputClass } from "./ui/Field";

// CE QUE L'ÉLÈVE PEUT VRAIMENT FAIRE — les quatre contraintes que le moteur
// devine aujourd'hui à sa place.
//
// POURQUOI CETTE CARTE
// --------------------
// Le générateur compose des sessions de cuisine, des préparations et une liste
// de courses sans rien savoir de quatre choses qui décident de tout:
//
//   quels jours on peut cuisiner  — il propose dimanche à quelqu'un qui
//                                    travaille le dimanche;
//   combien de temps par session  — il écrit une session de 50 minutes à
//                                    quelqu'un qui en a vingt;
//   quel niveau de recette        — il propose un curry en huit étapes à
//                                    quelqu'un qui sait faire cuire des pâtes;
//   quel budget                   — il met du saumon et des pignons dans une
//                                    semaine qu'il faut boucler à petit prix.
//
// Un plan parfait et inapplicable est la première cause d'abandon; c'est écrit
// noir sur blanc dans le commentaire de `student_goals.situation`, et ces
// quatre-là sont exactement ce qui le rend inapplicable.
//
// ── LE PATRON, ET IL EST EMPRUNTÉ ──────────────────────────────────────────
// `EatingRhythmCard` possède UNE clé de `practical_constraints` et fait
// `{ ...practicalConstraints, eating_rhythm }` pour ne pas écraser le reste.
// Cette carte possède les siennes et applique la même discipline: deux cartes
// écrivent la même colonne jsonb, et celle qui étale mal efface le travail de
// l'autre sans un bruit.
//
// `cooking_time_min` et `budget_band` existaient dans la colonne depuis le
// premier jour du pivot — lues par le générateur, remplies par personne. Cette
// carte est ce qui les réveille; `cook_days`, `recipe_difficulty` et `variety`
// sont neuves.

const COPY = {
  title: "How you cook",
  subtitle:
    "What you can actually do in a week. Without this, the plan is built for somebody else.",
  // « Change » et pas « Change this »: le lien est dans l'en-tête de la carte,
  // donc son objet est déjà nommé juste à côté. Aligné sur les deux cartes
  // voisines, mot pour mot.
  summary_open: "Change",
  summary_edit: "Tell me",
  summary_close: "Close",
  days_label: "Days you can cook",
  days_hint: "Pick the days you can spend real time in the kitchen.",
  time_label: "Time per cooking session",
  time_15: "15 minutes — get in and out",
  time_30: "30 minutes",
  time_60: "An hour, I do not mind",
  difficulty_label: "Recipes",
  difficulty_simple: "Simple — few steps, few pans",
  difficulty_normal: "Normal",
  difficulty_keen: "I like cooking, bring it on",
  variety_label: "Variety",
  variety_repeat: "Happy to repeat the same meals",
  variety_some: "Some repetition is fine",
  variety_varied: "Keep it varied",
  budget_label: "Budget",
  budget_tight: "Tight",
  budget_normal: "Normal",
  budget_comfortable: "Comfortable",
  save: "Save",
  saving: "Saving…",
  saved: "Saved.",
  no_goal: "Set your goal above first — this is saved alongside it.",
  none_picked: "Not set yet",
} as const;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = (typeof DAYS)[number];

export interface CookingCapacityCardProps {
  /** `false` tant qu'aucune ligne `student_goals` n'existe: rien à mettre à jour. */
  hasGoal: boolean;
  /** Dans la fenêtre de réglages: sans cadre, sans titre, sans repli. */
  embedded?: boolean;
  /** Les autres clés de `practical_constraints`, à ne pas écraser. */
  practicalConstraints: Record<string, unknown>;
  onSaved: () => void | Promise<void>;
}

function readDays(raw: unknown): Day[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => String(d))
    .filter((d): d is Day => (DAYS as readonly string[]).includes(d));
}

function readString(raw: unknown, allowed: readonly string[], fallback: string): string {
  const value = String(raw ?? "").trim();
  return allowed.includes(value) ? value : fallback;
}

export default function CookingCapacityCard(props: CookingCapacityCardProps) {
  const pc = props.practicalConstraints ?? {};
  const [open, setOpen] = React.useState(false);
  const [days, setDays] = React.useState<Set<Day>>(
    () => new Set(readDays(pc.cook_days)),
  );
  const [time, setTime] = React.useState(
    () => String(Number(pc.cooking_time_min) || 30),
  );
  const [difficulty, setDifficulty] = React.useState(
    () => readString(pc.recipe_difficulty, ["simple", "normal", "keen"], "normal"),
  );
  const [variety, setVariety] = React.useState(
    () => readString(pc.variety, ["repeat", "some", "varied"], "some"),
  );
  const [budget, setBudget] = React.useState(
    () => readString(pc.budget_band, ["tight", "normal", "comfortable"], "normal"),
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);

  const declared = readDays(pc.cook_days);

  function toggleDay(day: Day) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("not signed in");

      // La fusion, et la garantie qu'une ligne a bougé, appartiennent au
      // module: un update qui ne matche rien répond 204 sans erreur, et cette
      // carte affichait alors « Saved » sur une saisie partie nulle part.
      await mergePracticalConstraints({
        userId: uid,
        current: props.practicalConstraints,
        patch: {
          // L'ORDRE DE LA SEMAINE, pas celui des clics.
          cook_days: DAYS.filter((d) => days.has(d)),
          cooking_time_min: Number(time) || 30,
          recipe_difficulty: difficulty,
          variety,
          budget_band: budget,
        },
        source: "CookingCapacityCard",
      });
      setFlash(COPY.saved);
      await props.onSaved();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // LE FORMULAIRE, une seule fois — voir la même hissée dans `EatingRhythmCard`.
  const editor = (
          <div className="space-y-4">
            <Field label={COPY.days_label} hint={COPY.days_hint}>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      days.has(day)
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {dishDayLabel(day) ?? day}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={COPY.time_label} htmlFor="cap-time">
                <select
                  id="cap-time"
                  className={inputClass}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                >
                  <option value="15">{COPY.time_15}</option>
                  <option value="30">{COPY.time_30}</option>
                  <option value="60">{COPY.time_60}</option>
                </select>
              </Field>

              <Field label={COPY.difficulty_label} htmlFor="cap-difficulty">
                <select
                  id="cap-difficulty"
                  className={inputClass}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="simple">{COPY.difficulty_simple}</option>
                  <option value="normal">{COPY.difficulty_normal}</option>
                  <option value="keen">{COPY.difficulty_keen}</option>
                </select>
              </Field>

              <Field label={COPY.variety_label} htmlFor="cap-variety">
                <select
                  id="cap-variety"
                  className={inputClass}
                  value={variety}
                  onChange={(e) => setVariety(e.target.value)}
                >
                  <option value="repeat">{COPY.variety_repeat}</option>
                  <option value="some">{COPY.variety_some}</option>
                  <option value="varied">{COPY.variety_varied}</option>
                </select>
              </Field>

              <Field label={COPY.budget_label} htmlFor="cap-budget">
                <select
                  id="cap-budget"
                  className={inputClass}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                >
                  <option value="tight">{COPY.budget_tight}</option>
                  <option value="normal">{COPY.budget_normal}</option>
                  <option value="comfortable">{COPY.budget_comfortable}</option>
                </select>
              </Field>
            </div>

            {!props.hasGoal && (
              <p className="text-sm text-gray-600">{COPY.no_goal}</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button variant="primary" onClick={() => void save()} disabled={busy || !props.hasGoal}>
              {busy ? COPY.saving : COPY.save}
            </Button>
          </div>
  );

  // Dans la fenêtre: `SetupSection` porte le cadre, la couleur et le titre.
  if (props.embedded) {
    return (
      <>
        {editor}
        {flash && <p className="mt-3 text-sm text-emerald-700">{flash}</p>}
      </>
    );
  }

  return (
    // MÊME EN-TÊTE QUE LES CARTES VOISINES, et c'est le sujet.
    //
    // Cette carte portait son titre HORS de l'encadré et son ouverture dans un
    // BOUTON posé sous le résumé, là où « Your goal » et « How your day runs »
    // ont un lien « Change » discret en haut à droite. Trois cartes qui font la
    // même chose de trois façons obligent à relire chacune pour comprendre
    // qu'elles se plient toutes — et le bouton pleine hauteur ajoutait une
    // ligne de plus à un empilement déjà long avant les repas.
    <Card>
      <div className="flex items-start justify-between gap-3">
        <SectionLabel className="mb-0">{COPY.title}</SectionLabel>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
        >
          {open ? COPY.summary_close : (declared.length > 0 ? COPY.summary_open : COPY.summary_edit)}
        </button>
      </div>

      <>
        {!open && (
          <div className="mt-2">
            <p className="text-sm text-gray-800">
              {declared.length > 0
                ? declared.map((d) => dishDayLabel(d) ?? d).join(" · ")
                : COPY.none_picked}
            </p>
            {flash && <p className="mt-1 text-sm text-emerald-700">{flash}</p>}
          </div>
        )}

        {open && <div className="mt-4">{editor}</div>}
      </>
    </Card>
  );
}
