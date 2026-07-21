import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Shield, Sparkles, Sword, X } from "lucide-react";

import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";
import type {
  AttackTechniqueGeneratedResult,
  AttackTechniqueKey,
} from "../../hooks/useLabCards";
import { supabase } from "../../lib/supabase";
import {
  AttackTechniqueFlowModal,
} from "./LabCardsPanel";
import {
  ATTACK_TECHNIQUE_ACTION_QUESTION_INDEX,
  ATTACK_TECHNIQUE_PREVIEWS,
} from "./attackTechniquePreviews";
import type {
  DefenseDraftPreview,
  DefenseDraftQuestionnaire,
} from "../../hooks/useDefenseCard";

type PlanItemResourceActionsProps = {
  item: DashboardV2PlanItemRuntime;
  onCardsChanged: () => Promise<void> | void;
};

type DefenseStep = "need" | "questions" | "review";

export function PlanItemResourceActions({
  item,
  onCardsChanged,
}: PlanItemResourceActionsProps) {
  const [defenseOpen, setDefenseOpen] = useState(false);
  const [attackOpen, setAttackOpen] = useState(false);
  const [generatingAttackTechniqueKey, setGeneratingAttackTechniqueKey] =
    useState<AttackTechniqueKey | null>(null);
  // Carte liee a une action du plan: la question "quelle action ?" n'a aucun
  // sens ici (le backend recoit deja l'action via action_context) — elle est
  // retiree du parcours au lieu d'etre prefixee artificiellement.
  const attackTechniques = useMemo(
    () =>
      ATTACK_TECHNIQUE_PREVIEWS.map((technique) => {
        const anchorIndex =
          ATTACK_TECHNIQUE_ACTION_QUESTION_INDEX[technique.technique_key] ??
            null;
        return {
          ...technique,
          questions: (technique.questions ?? []).filter(
            (_, index) => index !== anchorIndex,
          ),
        };
      }),
    [],
  );

  const handleGenerateAttackTechnique = async (
    techniqueKey: AttackTechniqueKey,
    answers: string[],
    options?: { questions?: string[] },
  ): Promise<AttackTechniqueGeneratedResult | null> => {
    setGeneratingAttackTechniqueKey(techniqueKey);
    try {
      const { data: baseCard, error: baseError } = await supabase.functions.invoke(
        "generate-attack-card-v1",
        {
          body: {
            scope_kind: "transformation",
            transformation_id: item.transformation_id,
            plan_item_id: item.id,
            attack_card_id: item.attack_card_id ?? undefined,
            force_regenerate: false,
          },
        },
      );
      if (baseError) throw baseError;

      const attackCardId = typeof baseCard?.card_id === "string" ? baseCard.card_id : "";
      if (!attackCardId) throw new Error("Attack card id missing");

      const { data: generated, error: generationError } = await supabase.functions.invoke(
        "generate-attack-technique-v1",
        {
          body: {
            attack_card_id: attackCardId,
            technique_key: techniqueKey,
            answers,
            ...(options?.questions?.length
              ? { questions: options.questions }
              : {}),
          },
        },
      );
      if (generationError) throw generationError;

      const now = new Date().toISOString();
      const { error: linkError } = await supabase
        .from("user_plan_items")
        .update({
          attack_card_id: attackCardId,
          cards_status: item.defense_card_id ? "ready" : "not_started",
          cards_generated_at: now,
          updated_at: now,
        })
        .eq("id", item.id);
      if (linkError) throw linkError;

      await onCardsChanged();

      const content = generated?.content;
      const result = content?.techniques?.find?.((technique: { technique_key?: string }) =>
        technique.technique_key === techniqueKey
      )?.generated_result;

      return result ?? null;
    } catch (error) {
      console.error("[PlanItemResourceActions] generate attack failed:", error);
      return null;
    } finally {
      setGeneratingAttackTechniqueKey(null);
    }
  };

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {!item.linked_defense_card ? (
          <button
            type="button"
            onClick={() => setDefenseOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
          >
            <Shield className="h-3.5 w-3.5" />
            Carte de defense
          </button>
        ) : null}
        {!item.linked_attack_card ? (
          <button
            type="button"
            onClick={() => setAttackOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
          >
            <Sword className="h-3.5 w-3.5" />
            Carte d'attaque
          </button>
        ) : null}
      </div>

      <PlanDefenseCardModal
        item={item}
        isOpen={defenseOpen}
        onClose={() => setDefenseOpen(false)}
        onCardsChanged={onCardsChanged}
      />

      <AttackTechniqueFlowModal
        isOpen={attackOpen}
        techniques={attackTechniques}
        generatingTechniqueKey={generatingAttackTechniqueKey}
        contextLabel={`Pour l'action « ${item.title} »`}
        onClose={() => setAttackOpen(false)}
        onSubmit={handleGenerateAttackTechnique}
      />
    </>
  );
}

function PlanDefenseCardModal({
  item,
  isOpen,
  onClose,
  onCardsChanged,
}: {
  item: DashboardV2PlanItemRuntime;
  isOpen: boolean;
  onClose: () => void;
  onCardsChanged: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<DefenseStep>("need");
  const [need, setNeed] = useState("");
  const [questionnaire, setQuestionnaire] = useState<DefenseDraftQuestionnaire | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<DefenseDraftPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep("need");
      setNeed("");
      setQuestionnaire(null);
      setAnswers({});
      setPreview(null);
      setBusy(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const prepareQuestionnaire = async () => {
    if (!need.trim()) {
      setError("Indique ce qui pourrait faire derailler cette action.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "draft-defense-card-v1",
        {
          body: {
            stage: "questionnaire",
            scope_kind: "transformation",
            transformation_id: item.transformation_id,
            plan_item_id: item.id,
            free_text: need.trim(),
          },
        },
      );
      if (invokeError) throw invokeError;

      const rawQuestions: unknown[] = Array.isArray(data?.questions) ? data.questions : [];
      const questions = rawQuestions
        .map((question: unknown): DefenseDraftQuestionnaire["questions"][number] | null => {
          if (!question || typeof question !== "object") return null;
          const candidate = question as Record<string, unknown>;
          const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
          const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
          if (!id || !label) return null;
          return {
            id,
            label,
            helperText: typeof candidate.helper_text === "string" ? candidate.helper_text : null,
            placeholder: typeof candidate.placeholder === "string" ? candidate.placeholder : null,
            required: candidate.required !== false,
          };
        })
        .filter((question): question is DefenseDraftQuestionnaire["questions"][number] =>
          question !== null
        )
        .slice(0, 3);
      const cardExplanation = typeof data?.card_explanation === "string"
        ? data.card_explanation.trim()
        : "";
      if (!cardExplanation || questions.length === 0) {
        throw new Error("Invalid defense questionnaire payload");
      }

      setQuestionnaire({ cardExplanation, questions });
      setAnswers(Object.fromEntries(questions.map((question) => [question.id, ""])));
      setStep("questions");
    } catch (err) {
      console.error("[PlanDefenseCardModal] prepare failed:", err);
      setError("Impossible de preparer les questions pour le moment.");
    } finally {
      setBusy(false);
    }
  };

  const generatePreview = async () => {
    if (!questionnaire) return;
    const missing = questionnaire.questions.some((question) =>
      question.required && !String(answers[question.id] ?? "").trim()
    );
    if (missing) {
      setError("Reponds aux questions pour generer la carte.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "draft-defense-card-v1",
        {
          body: {
            stage: "draft",
            scope_kind: "transformation",
            transformation_id: item.transformation_id,
            plan_item_id: item.id,
            free_text: need.trim(),
            answers,
          },
        },
      );
      if (invokeError) throw invokeError;

      const nextPreview = {
        label: String(data?.label ?? "").trim(),
        situation: String(data?.situation ?? "").trim(),
        signal: String(data?.signal ?? "").trim(),
        defenseResponse: String(data?.defense_response ?? "").trim(),
        planB: String(data?.plan_b ?? "").trim(),
      };
      if (
        !nextPreview.label ||
        !nextPreview.situation ||
        !nextPreview.signal ||
        !nextPreview.defenseResponse ||
        !nextPreview.planB
      ) {
        throw new Error("Invalid defense draft payload");
      }

      setPreview(nextPreview);
      setStep("review");
    } catch (err) {
      console.error("[PlanDefenseCardModal] draft failed:", err);
      setError("Impossible de generer le brouillon pour le moment.");
    } finally {
      setBusy(false);
    }
  };

  const saveDefenseCard = async () => {
    if (!preview) return;

    setBusy(true);
    setError(null);
    try {
      const { error: invokeError } = await supabase.functions.invoke(
        "update-defense-card-v3",
        {
          body: {
            action: "create_card_with_impulse",
            cycle_id: item.cycle_id,
            scope_kind: "transformation",
            transformation_id: item.transformation_id,
            plan_item_id: item.id,
            label: preview.label,
            generic_defense: preview.planB,
            triggers: [
              {
                situation: preview.situation,
                signal: preview.signal,
                defense_response: preview.defenseResponse,
                plan_b: preview.planB,
              },
            ],
          },
        },
      );
      if (invokeError) throw invokeError;

      await onCardsChanged();
      onClose();
    } catch (err) {
      console.error("[PlanDefenseCardModal] save failed:", err);
      setError("Impossible d'enregistrer cette carte pour le moment.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-emerald-100 bg-emerald-50 px-5 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Carte de defense
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              {step === "need"
                ? "Proteger cette action"
                : step === "questions"
                ? "Precisons le moment fragile"
                : "Valider la carte"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {item.title}
            </p>
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
          {step === "need" ? (
            <div className="space-y-4">
              <label className="block">
                <p className="text-sm font-semibold text-stone-900">
                  Qu'est-ce qui risque de faire derailler cette action ?
                </p>
                <textarea
                  value={need}
                  onChange={(event) => setNeed(event.target.value)}
                  rows={4}
                  className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                  placeholder="Ex: Je rentre fatigue, je repousse, puis je me dis que je ferai demain."
                />
              </label>
            </div>
          ) : null}

          {step === "questions" && questionnaire ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-sm leading-6 text-emerald-950">
                  {questionnaire.cardExplanation}
                </p>
              </div>
              {questionnaire.questions.map((question) => (
                <label key={question.id} className="block">
                  <p className="text-sm font-semibold text-stone-900">
                    {question.label}
                  </p>
                  {question.helperText ? (
                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      {question.helperText}
                    </p>
                  ) : null}
                  <textarea
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                    placeholder={question.placeholder ?? undefined}
                  />
                </label>
              ))}
            </div>
          ) : null}

          {step === "review" && preview ? (
            <div className="space-y-3">
              <PreviewField label="Nom" value={preview.label} />
              <PreviewField label="Le moment" value={preview.situation} />
              <PreviewField label="Le piege" value={preview.signal} />
              <PreviewField label="Mon geste" value={preview.defenseResponse} />
              <PreviewField label="Plan B" value={preview.planB} />
            </div>
          ) : null}

          {error ? <p className="mt-4 text-xs text-rose-600">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-between gap-3 border-t border-stone-200 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              if (step === "need") onClose();
              if (step === "questions") setStep("need");
              if (step === "review") setStep("questions");
              setError(null);
            }}
            disabled={busy}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 disabled:opacity-60"
          >
            {step === "need" ? "Annuler" : "Retour"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (step === "need") void prepareQuestionnaire();
              if (step === "questions") void generatePreview();
              if (step === "review") void saveDefenseCard();
            }}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {step === "need"
              ? "Continuer"
              : step === "questions"
              ? "Generer le brouillon"
              : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-stone-800">{value}</p>
    </div>
  );
}
