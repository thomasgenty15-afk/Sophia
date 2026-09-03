import React from "react";
import {
  dietServingConflicts,
  strictestRegimeAt,
} from "../../../../supabase/functions/_shared/keel/household_diet.ts";
import { mergeLadder } from "../../../../supabase/functions/_shared/keel/household_merge.ts";
import {
  readServingDemands,
  SERVING_DIRECTION,
  type MemberGoal,
} from "../../../../supabase/functions/_shared/keel/household_portions.ts";
import type { DietaryRegime } from "../../../../supabase/functions/_shared/keel/dietary_regime.ts";
import { Kicker } from "./ui/Marketing";
import { t, type MessageKey } from "../i18n/t";

type FoodRule = "everything" | "vegetarian" | "no_fish";

const GOALS: readonly MemberGoal[] = ["fat_loss", "muscle_gain", "maintenance"];
const FOOD_RULES: readonly FoodRule[] = ["everything", "vegetarian", "no_fish"];

const GOAL_LABELS: Record<MemberGoal, MessageKey> = {
  fat_loss: "home.demo.goal.fat_loss",
  muscle_gain: "home.demo.goal.muscle_gain",
  maintenance: "home.demo.goal.maintenance",
};

const DIRECTION_LABELS: Record<MemberGoal, MessageKey> = {
  fat_loss: "home.demo.direction.fat_loss",
  muscle_gain: "home.demo.direction.muscle_gain",
  maintenance: "home.demo.direction.maintenance",
};

const FOOD_LABELS: Record<FoodRule, MessageKey> = {
  everything: "home.demo.food.everything",
  vegetarian: "home.demo.food.vegetarian",
  no_fish: "home.demo.food.no_fish",
};

function dietaryRegime(rule: FoodRule): DietaryRegime | null {
  return rule === "vegetarian" ? "vegetarian" : null;
}

function ChoiceGroup<T extends string>({
  legend,
  name,
  choices,
  selected,
  labelFor,
  onChange,
}: {
  legend: string;
  name: string;
  choices: readonly T[];
  selected: T;
  labelFor: (choice: T) => string;
  onChange: (choice: T) => void;
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="eq p-0 text-label font-semibold uppercase text-ink-soft">{legend}</legend>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {choices.map((choice) => (
          <label key={choice} className="cursor-pointer">
            <input
              className="peer sr-only"
              type="radio"
              name={name}
              value={choice}
              checked={selected === choice}
              onChange={() => onChange(choice)}
            />
            <span className="inline-block rounded border border-line-strong px-2.5 py-2 text-[13px] leading-none text-ink transition-colors hover:border-fig-600 peer-checked:border-fig-700 peer-checked:bg-fig-700 peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-fig-600">
              {labelFor(choice)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PersonControls({
  id,
  label,
  goal,
  food,
  onGoal,
  onFood,
}: {
  id: string;
  label: string;
  goal: MemberGoal;
  food: FoodRule;
  onGoal: (goal: MemberGoal) => void;
  onFood: (food: FoodRule) => void;
}) {
  return (
    <div className="min-w-0 rounded border border-line bg-paper p-4">
      <p className="font-display text-[1.25rem] text-ink">{label}</p>
      <div className="mt-4 grid gap-6">
        <ChoiceGroup
          legend={t("home.demo.goal_legend")}
          name={`${id}-goal`}
          choices={GOALS}
          selected={goal}
          labelFor={(choice) => t(GOAL_LABELS[choice])}
          onChange={onGoal}
        />
        <ChoiceGroup
          legend={t("home.demo.food_legend")}
          name={`${id}-food`}
          choices={FOOD_RULES}
          selected={food}
          labelFor={(choice) => t(FOOD_LABELS[choice])}
          onChange={onFood}
        />
      </div>
    </div>
  );
}

/**
 * La démo appelle les mêmes règles pures que le moteur du foyer. Les contrôles
 * n'inventent donc pas la frontière « un plat / deux plats » : ils la rendent
 * visible avec un sous-ensemble lisible des choix réels.
 */
export function HomeCohabitationDemo() {
  const [leftGoal, setLeftGoal] = React.useState<MemberGoal>("muscle_gain");
  const [rightGoal, setRightGoal] = React.useState<MemberGoal>("fat_loss");
  const [leftFood, setLeftFood] = React.useState<FoodRule>("everything");
  const [rightFood, setRightFood] = React.useState<FoodRule>("vegetarian");

  const ladder = mergeLadder({
    table: [readServingDemands(SERVING_DIRECTION[leftGoal])],
    incoming: readServingDemands(SERVING_DIRECTION[rightGoal]),
    householdCookingDays: ["sun"],
    personalCookingDays: ["sun"],
  });
  const leftDiet = dietaryRegime(leftFood);
  const rightDiet = dietaryRegime(rightFood);
  const strictest = strictestRegimeAt([leftDiet, rightDiet]);
  const dietSplits = strictest !== null && [leftGoal, rightGoal].some((goal) =>
    dietServingConflicts(strictest, readServingDemands(SERVING_DIRECTION[goal])).length > 0
  );
  const twoDishes = ladder.shape !== "one_dish" || dietSplits;
  const avoidsFish = leftFood === "no_fish" || rightFood === "no_fish";

  return (
    <section aria-label={t("home.demo.aria_label")} className="rounded-fiche border border-line bg-paper-2 p-4 sm:p-6">
      <Kicker>{t("home.demo.kicker")}</Kicker>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <PersonControls
          id="home-left"
          label={t("home.demo.person_a")}
          goal={leftGoal}
          food={leftFood}
          onGoal={setLeftGoal}
          onFood={setLeftFood}
        />
        <PersonControls
          id="home-right"
          label={t("home.demo.person_b")}
          goal={rightGoal}
          food={rightFood}
          onGoal={setRightGoal}
          onFood={setRightFood}
        />
      </div>

      <div className="relative mx-auto h-8 w-[calc(50%+2px)] border-x border-b border-line-strong" aria-hidden="true">
        <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-line-strong bg-paper-2" />
      </div>

      <div className="rounded border border-line-strong bg-paper p-4 sm:p-5" role="status" aria-live="polite">
        <p className="text-label font-semibold uppercase text-ink-soft">{t("home.demo.output_label")}</p>
        <h3 className="mt-2 font-display text-sub text-ink">
          {twoDishes ? t("home.demo.output.two_dishes") : t("home.demo.output.one_dish")}
        </h3>
        <p className="mt-2 max-w-[70ch] text-[15px] leading-6 text-ink-soft">
          {dietSplits
            ? t("home.demo.reason.diet_split")
            : ladder.shape !== "one_dish"
            ? t("home.demo.reason.goal_split")
            : strictest === "vegetarian"
            ? t("home.demo.reason.vegetarian")
            : avoidsFish
            ? t("home.demo.reason.no_fish")
            : t("home.demo.reason.shared")}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-[0.72fr_1fr_1fr] sm:items-stretch">
          <div className="flex items-center justify-center rounded border border-fig-600 bg-fig-50 px-3 py-4 text-center text-[13px] font-medium text-fig-800">
            {t("home.demo.cooking_session")}
          </div>
          <div className="rounded border border-line p-3">
            <p className="text-label font-semibold uppercase text-ink-soft">{t("home.demo.person_a")}</p>
            <p className="mt-2 text-[13px] leading-5 text-ink">{t(DIRECTION_LABELS[leftGoal])}</p>
          </div>
          <div className="rounded border border-line p-3">
            <p className="text-label font-semibold uppercase text-ink-soft">{t("home.demo.person_b")}</p>
            <p className="mt-2 text-[13px] leading-5 text-ink">{t(DIRECTION_LABELS[rightGoal])}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
