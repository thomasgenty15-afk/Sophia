import React from "react";

import { foodGroupLabel, slotLabel } from "../../api/labels";
import type { FoodGroupRow, MealIdea, SlotRow } from "../../api/mealPlanModel";
import { OPEN_SLOT_KEYS } from "../../api/mealPlanModel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, SectionLabel } from "../../components/ui/Card";
import { Field, inputClass } from "../../components/ui/Field";
import { c } from "./copy";

// KEEL — the coach's dish library.
//
// THE COACH IS THE AUTHOR. There is no "generate a dish" button on this panel
// and there is no code path to one: `meal_ideas.author_kind` accepts 'coach'
// and 'keel_library', and nothing else. A model may one day help CHOOSE among
// dishes a human wrote; it will not write the sentence a student reads.
//
// A dish is written ONCE and reused — across days, across weeks, across
// students. That is the whole economics of the feature: the composition below
// costs seconds only because this panel is a library and not a form the coach
// refills every Monday.

export interface MealIdeaLibraryProps {
  ideas: MealIdea[];
  slots: SlotRow[];
  foodGroups: FoodGroupRow[];
  selectedIdeaId: string | null;
  busy: boolean;
  onSelect: (ideaId: string | null) => void;
  onCreate: (draft: {
    title: string;
    description: string | null;
    slot_key: string | null;
    food_group_refs: string[];
  }) => Promise<void>;
  onArchive: (ideaId: string) => Promise<void>;
}

export function MealIdeaLibrary(props: MealIdeaLibraryProps) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [slotKey, setSlotKey] = React.useState("");
  const [groups, setGroups] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  // Serving a dish at "any meal" is not a moment, it is the absence of one, so
  // those two anchors are not offered here. They remain valid on a COMMITMENT.
  const servableSlots = props.slots.filter((s) => !OPEN_SLOT_KEYS.has(s.key));

  const reset = () => {
    setTitle("");
    setDescription("");
    setSlotKey("");
    setGroups([]);
  };

  const toggleGroup = (slug: string) => {
    setGroups((prev) =>
      prev.includes(slug) ? prev.filter((g) => g !== slug) : [...prev, slug],
    );
  };

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await props.onCreate({
        title: title.trim(),
        description: description.trim() || null,
        slot_key: slotKey || null,
        food_group_refs: groups,
      });
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel className="mb-1">{c("meals.library.title")}</SectionLabel>
          <p className="text-sm text-gray-500">{c("meals.library.subtitle")}</p>
        </div>
        {!open && (
          <Button variant="primary" onClick={() => setOpen(true)}>
            {c("meals.library.new")}
          </Button>
        )}
      </div>

      {props.ideas.length === 0 && !open && (
        <p className="text-sm text-gray-500">{c("meals.library.empty")}</p>
      )}

      {props.ideas.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {props.ideas.map((idea) => {
            const selected = props.selectedIdeaId === idea.id;
            return (
              <li key={idea.id}>
                <div
                  className={[
                    "flex max-w-xs flex-col gap-1 rounded-xl border px-3 py-2 text-left",
                    selected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    className="text-left text-sm font-medium"
                    disabled={props.busy}
                    onClick={() => props.onSelect(selected ? null : idea.id)}
                    title={selected
                      ? c("meals.library.clear_selection")
                      : c("meals.library.select")}
                  >
                    {idea.title}
                  </button>
                  <span
                    className={[
                      "text-xs",
                      selected ? "text-gray-300" : "text-gray-500",
                    ].join(" ")}
                  >
                    {idea.slot_key
                      ? slotLabel(idea.slot_key)
                      : c("meals.library.slot_any")}
                    {" · "}
                    {idea.food_group_refs.length > 0
                      ? idea.food_group_refs.map(foodGroupLabel).join(", ")
                      : c("meals.library.no_groups")}
                  </span>
                  <div className="flex items-center gap-2">
                    {selected && (
                      <Badge tone="info">{c("meals.library.selected")}</Badge>
                    )}
                    <button
                      type="button"
                      className={[
                        "text-xs underline underline-offset-2",
                        selected ? "text-gray-300" : "text-gray-500",
                      ].join(" ")}
                      disabled={props.busy}
                      onClick={() => {
                        if (window.confirm(c("meals.library.archive_confirm"))) {
                          void props.onArchive(idea.id);
                        }
                      }}
                    >
                      {c("meals.library.archive")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="mt-4 space-y-3 rounded-xl border border-gray-200 p-4">
          <Field label={c("meals.library.name_label")} htmlFor="meal-title">
            <input
              id="meal-title"
              className={inputClass}
              value={title}
              placeholder={c("meals.library.name_placeholder")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field
            label={c("meals.library.description_label")}
            htmlFor="meal-description"
          >
            <textarea
              id="meal-description"
              rows={2}
              className={inputClass}
              value={description}
              placeholder={c("meals.library.description_placeholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label={c("meals.library.slot_label")} htmlFor="meal-slot">
            <select
              id="meal-slot"
              className={inputClass}
              value={slotKey}
              onChange={(e) => setSlotKey(e.target.value)}
            >
              <option value="">{c("meals.library.slot_any")}</option>
              {servableSlots.map((slot) => (
                <option key={slot.key} value={slot.key}>
                  {slotLabel(slot.key)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={c("meals.library.groups_label")}
            hint={c("meals.library.groups_hint")}
          >
            <div className="flex flex-wrap gap-1.5">
              {props.foodGroups.map((group) => {
                const on = groups.includes(group.slug);
                return (
                  <button
                    key={group.slug}
                    type="button"
                    onClick={() => toggleGroup(group.slug)}
                    className={[
                      "rounded-full border px-2.5 py-0.5 text-xs",
                      on
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {foodGroupLabel(group.slug)}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={!title.trim() || saving}
              onClick={() => void submit()}
            >
              {saving ? c("meals.library.saving") : c("meals.library.save")}
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              {c("meals.library.cancel")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default MealIdeaLibrary;
