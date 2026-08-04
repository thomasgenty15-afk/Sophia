import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import { getClarificationExerciseDetails } from "../../lib/clarificationExercises";
import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";
import type { UserFrameworkEntryRow } from "../../types/v2";

type ClarificationExerciseModalProps = {
  item: DashboardV2PlanItemRuntime;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function ClarificationExerciseModal({
  item,
  isOpen,
  onClose,
  onSaved,
}: ClarificationExerciseModalProps) {
  const details = useMemo(
    () => getClarificationExerciseDetails(item.payload),
    [item.payload],
  );
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [tempInputs, setTempInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [recentEntries, setRecentEntries] = useState<UserFrameworkEntryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setContent({});
      setTempInputs({});
      setError(null);
      return;
    }
    if (!details) return;

    let active = true;
    setLoadingHistory(true);
    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("user_framework_entries")
          .select("*")
          .eq("action_id", item.id)
          .order("created_at", { ascending: false })
          .limit(3);

        if (!active) return;
        if (queryError) {
          console.error("[ClarificationExerciseModal] load history failed", queryError);
          setRecentEntries([]);
        } else {
          setRecentEntries((data as UserFrameworkEntryRow[] | null) ?? []);
        }
      } finally {
        if (active) setLoadingHistory(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [details, isOpen, item.id]);

  if (!isOpen || !details) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        user_id: item.user_id,
        plan_id: null,
        action_id: item.id,
        framework_title: item.title,
        framework_type: `clarification_${details.type}`,
        content,
        schema_snapshot: item.payload.clarification_details ?? null,
        submission_id: null,
        target_reps: item.target_reps ?? 1,
      };

      const { error: insertError } = await supabase
        .from("user_framework_entries")
        .insert(payload);

      if (insertError) throw insertError;

      await onSaved();
      onClose();
    } catch (saveError) {
      console.error("[ClarificationExerciseModal] save failed", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer cette clarification.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-sky-100 bg-sky-50 px-5 py-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              <FileText className="h-3.5 w-3.5" />
              {details.type === "recurring" ? "Clarification recurrente" : "Clarification ponctuelle"}
            </div>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{details.intro}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-400 transition-colors hover:bg-white hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {recentEntries.length > 0 || loadingHistory ? (
            <div className="mb-6 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Historique recent
              </p>
              {loadingHistory ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement...
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {recentEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl bg-white px-3 py-3 text-sm text-stone-600">
                      <p className="font-medium text-stone-800">
                        {new Intl.DateTimeFormat("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(entry.created_at))}
                      </p>
                      <p className="mt-1 line-clamp-2">
                        {summarizeEntry(entry.content)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-5">
            {details.sections.map((section) => {
              const inputType = section.input_type;
              return (
                <div key={section.id} className="rounded-2xl border border-stone-200 p-4">
                  <label className="block text-sm font-semibold text-stone-900">
                    {section.label}
                  </label>
                  {section.helper_text ? (
                    <p className="mt-1 text-xs text-stone-500">{section.helper_text}</p>
                  ) : null}

                  {inputType === "textarea" ? (
                    <textarea
                      value={String(content[section.id] ?? "")}
                      onChange={(event) => setContent((current) => ({
                        ...current,
                        [section.id]: event.target.value,
                      }))}
                      placeholder={section.placeholder ?? ""}
                      className="mt-3 min-h-[140px] w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                    />
                  ) : inputType === "scale" ? (
                    <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={Number(content[section.id] ?? 5)}
                        onChange={(event) => setContent((current) => ({
                          ...current,
                          [section.id]: Number(event.target.value),
                        }))}
                        className="w-full accent-sky-600"
                      />
                      <div className="mt-2 text-center text-lg font-semibold text-sky-700">
                        {Number(content[section.id] ?? 5)}/10
                      </div>
                    </div>
                  ) : inputType === "list" ? (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-2">
                        {Array.isArray(content[section.id])
                          ? (content[section.id] as string[]).map((value, index) => (
                            <div
                              key={`${section.id}-${index}`}
                              className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3"
                            >
                              <span className="flex-1 text-sm text-stone-700">{value}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...(content[section.id] as string[])];
                                  next.splice(index, 1);
                                  setContent((current) => ({ ...current, [section.id]: next }));
                                }}
                                className="text-stone-400 transition-colors hover:text-rose-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))
                          : null}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={tempInputs[section.id] ?? ""}
                          onChange={(event) => setTempInputs((current) => ({
                            ...current,
                            [section.id]: event.target.value,
                          }))}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            pushListValue(section.id);
                          }}
                          placeholder={section.placeholder ?? "Ajouter un element"}
                          className="flex-1 rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => pushListValue(section.id)}
                          className="rounded-2xl bg-sky-600 px-4 py-3 text-white"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : inputType === "categorized_list" ? (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-2">
                        {Array.isArray(content[section.id])
                          ? (content[section.id] as Array<{ text: string; category?: string }>).map((value, index) => (
                            <div
                              key={`${section.id}-${index}`}
                              className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium text-stone-800">{value.text}</p>
                                {value.category ? (
                                  <span className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-1 text-[11px] font-medium text-sky-700">
                                    {value.category}
                                  </span>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...(content[section.id] as Array<{ text: string; category?: string }>)];
                                  next.splice(index, 1);
                                  setContent((current) => ({ ...current, [section.id]: next }));
                                }}
                                className="text-stone-400 transition-colors hover:text-rose-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))
                          : null}
                      </div>
                      <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-3 py-3">
                        <div className="grid gap-2 md:grid-cols-[1.7fr_1fr_auto]">
                          <input
                            type="text"
                            value={tempInputs[`${section.id}_text`] ?? ""}
                            onChange={(event) => setTempInputs((current) => ({
                              ...current,
                              [`${section.id}_text`]: event.target.value,
                            }))}
                            placeholder={section.placeholder?.split("|")[0] ?? "Texte"}
                            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none"
                          />
                          <input
                            type="text"
                            value={tempInputs[`${section.id}_cat`] ?? ""}
                            onChange={(event) => setTempInputs((current) => ({
                              ...current,
                              [`${section.id}_cat`]: event.target.value,
                            }))}
                            placeholder={section.placeholder?.split("|")[1] ?? "Categorie"}
                            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => pushCategorizedValue(section.id)}
                            className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-3 py-2 text-white"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={String(content[section.id] ?? "")}
                      onChange={(event) => setContent((current) => ({
                        ...current,
                        [section.id]: event.target.value,
                      }))}
                      placeholder={section.placeholder ?? ""}
                      className="mt-3 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-4 py-3 text-sm font-semibold text-stone-500 transition-colors hover:bg-stone-200"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {details.save_label ?? (details.type === "recurring" ? "Enregistrer cette passe" : "Enregistrer la fiche")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  function pushListValue(sectionId: string) {
    const value = (tempInputs[sectionId] ?? "").trim();
    if (!value) return;
    setContent((current) => ({
      ...current,
      [sectionId]: [...(((current[sectionId] as string[]) ?? [])), value],
    }));
    setTempInputs((current) => ({ ...current, [sectionId]: "" }));
  }

  function pushCategorizedValue(sectionId: string) {
    const text = (tempInputs[`${sectionId}_text`] ?? "").trim();
    const category = (tempInputs[`${sectionId}_cat`] ?? "").trim();
    if (!text) return;
    setContent((current) => ({
      ...current,
      [sectionId]: [
        ...(((current[sectionId] as Array<{ text: string; category?: string }>) ?? [])),
        { text, category: category || undefined },
      ],
    }));
    setTempInputs((current) => ({
      ...current,
      [`${sectionId}_text`]: "",
      [`${sectionId}_cat`]: "",
    }));
  }
}

function summarizeEntry(content: Record<string, unknown>) {
  const firstValue = Object.values(content).find((value) =>
    typeof value === "string" && value.trim().length > 0
  );
  if (typeof firstValue === "string") return firstValue;
  const listValue = Object.values(content).find(Array.isArray);
  if (Array.isArray(listValue) && listValue.length > 0) {
    const first = listValue[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "text" in first) {
      return String((first as { text?: unknown }).text ?? "");
    }
  }
  return "Fiche remplie";
}
