import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  FlaskConical,
  Loader2,
  Pencil,
  Shield,
  Sparkles,
  Swords,
} from "lucide-react";

import { formatBaseDeVieDate, getBaseDeViePayload } from "../../lib/baseDeVie";
import { supabase } from "../../lib/supabase";
import {
  getTransformationClosureHelpfulnessAreaLabel,
  getTransformationClosureImprovementReasonLabel,
} from "../../lib/transformationClosure";
import { useBaseDeVie, type BaseDeVieArsenalItem } from "../../hooks/useBaseDeVie";
import type {
  BaseDeVieLineEntry,
  BaseDeVieDeclics,
  TransformationClosureFeedback,
  UserTransformationBaseDeViePayload,
  UserTransformationRow,
} from "../../types/v2";
import { RemindersSection } from "./RemindersSection";
import { TransformationClosureModal } from "./TransformationClosureModal";

type BaseDeVieSectionProps = {
  cycleId: string | null;
  userId: string | null;
  transformations: UserTransformationRow[];
  isLocked: boolean;
  onUnlockRequest?: () => void;
};

function buildFallbackDeclics(transformation: UserTransformationRow): BaseDeVieDeclics {
  return {
    why:
      transformation.success_definition ??
      transformation.user_summary ??
      `Cette transformation visait ${transformation.title ?? "un vrai changement"}.`,
    insight:
      transformation.completion_summary ??
      transformation.user_summary ??
      transformation.internal_summary,
    identity_shift:
      transformation.title ??
      "Je ne me raconte plus la même histoire sur ce sujet.",
  };
}

function buildPayloadForSave(args: {
  existingPayload: UserTransformationBaseDeViePayload | null;
  lineGreenEntry: BaseDeVieLineEntry;
  lineRedEntry: BaseDeVieLineEntry;
  feedback: TransformationClosureFeedback;
}): UserTransformationBaseDeViePayload {
  const now = new Date().toISOString();
  return {
    line_red_entries: [args.lineRedEntry.action],
    line_green_entry: args.lineGreenEntry,
    line_red_entry: args.lineRedEntry,
    declics_draft: args.existingPayload?.declics_draft ?? null,
    declics_user: args.existingPayload?.declics_user ?? args.existingPayload?.declics_draft ?? null,
    closure_feedback: args.feedback,
    validated_at: args.existingPayload?.validated_at ?? now,
    last_edited_at: now,
  };
}

function getLineGreenEntry(payload: UserTransformationBaseDeViePayload | null): BaseDeVieLineEntry | null {
  return payload?.line_green_entry ?? null;
}

function getLineRedEntry(payload: UserTransformationBaseDeViePayload | null): BaseDeVieLineEntry | null {
  if (payload?.line_red_entry) return payload.line_red_entry;
  const fallbackAction = payload?.line_red_entries[0]?.trim() ?? "";
  return fallbackAction
    ? {
        action: fallbackAction,
        why: "",
      }
    : null;
}

function arsenalIcon(kind: BaseDeVieArsenalItem["kind"]) {
  switch (kind) {
    case "defense_card":
      return Shield;
    case "attack_card":
      return Swords;
    case "support_card":
      return BookOpen;
    case "potion":
      return FlaskConical;
    case "inspiration":
      return Compass;
  }
}

function arsenalLabel(kind: BaseDeVieArsenalItem["kind"]) {
  switch (kind) {
    case "defense_card":
      return "Carte de défense";
    case "attack_card":
      return "Carte d'attaque";
    case "support_card":
      return "Carte d'appui";
    case "potion":
      return "Potion";
    case "inspiration":
      return "Repère";
  }
}

function ArsenalDetailModal({
  item,
  onClose,
}: {
  item: BaseDeVieArsenalItem | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const Icon = arsenalIcon(item.kind);

  return createPortal(
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-[1] w-full max-w-2xl rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_32px_100px_-52px_rgba(15,23,42,0.5)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <Icon className="h-3.5 w-3.5" />
              {arsenalLabel(item.kind)}
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-stone-950">{item.title}</h3>
            {item.subtitle ? (
              <p className="mt-2 text-sm text-stone-500">{item.subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-600 transition hover:text-stone-950"
          >
            Fermer
          </button>
        </div>
        <div className="mt-6 whitespace-pre-line rounded-[24px] border border-stone-200 bg-stone-50 px-5 py-4 text-sm leading-6 text-stone-700">
          {item.detail}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function BaseDeVieSection({
  cycleId,
  userId,
  transformations,
  isLocked,
  onUnlockRequest,
}: BaseDeVieSectionProps) {
  const { loading, records, refresh } = useBaseDeVie(cycleId, transformations);
  const [expandedTransformationId, setExpandedTransformationId] = useState<string | null>(null);
  const [editingTransformation, setEditingTransformation] = useState<UserTransformationRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedArsenalItem, setSelectedArsenalItem] = useState<BaseDeVieArsenalItem | null>(null);

  useEffect(() => {
    if (!expandedTransformationId && records.length > 0) {
      setExpandedTransformationId(records[0].transformation.id);
    }
  }, [expandedTransformationId, records]);

  const lineGreenRecords = useMemo(
    () =>
      records.filter((record) => Boolean(getLineGreenEntry(record.payload))),
    [records],
  );

  const lineRedRecords = useMemo(
    () =>
      records.filter((record) => Boolean(getLineRedEntry(record.payload))),
    [records],
  );

  const handleEditSubmit = async (payload: {
    lineGreenEntry: BaseDeVieLineEntry;
    lineRedEntry: BaseDeVieLineEntry;
    feedback: TransformationClosureFeedback;
  }) => {
    if (!editingTransformation || !userId) return;

    setSavingEdit(true);
    try {
      const existingPayload = getBaseDeViePayload(editingTransformation.base_de_vie_payload);
      const nextPayload = buildPayloadForSave({
        existingPayload,
        lineGreenEntry: payload.lineGreenEntry,
        lineRedEntry: payload.lineRedEntry,
        feedback: payload.feedback,
      });

      const updateTimestamp = new Date().toISOString();
      const transformationUpdate = supabase
        .from("user_transformations")
        .update({
          base_de_vie_payload: nextPayload as unknown as Record<string, unknown>,
          updated_at: updateTimestamp,
        })
        .eq("id", editingTransformation.id);
      const feedbackUpdate = supabase
        .from("user_transformation_closure_feedback")
        .upsert({
          user_id: userId,
          cycle_id: editingTransformation.cycle_id,
          transformation_id: editingTransformation.id,
          helpfulness_rating: payload.feedback.helpfulness_rating,
          improvement_reasons: payload.feedback.improvement_reasons,
          improvement_detail: payload.feedback.improvement_detail,
          most_helpful_area: payload.feedback.most_helpful_area,
          updated_at: updateTimestamp,
        } as never, {
          onConflict: "transformation_id",
        });

      const [{ error: transformationError }, { error: feedbackError }] = await Promise.all([
        transformationUpdate,
        feedbackUpdate,
      ]);

      if (transformationError) throw transformationError;
      if (feedbackError) throw feedbackError;

      setEditingTransformation(null);
      await refresh();
    } catch (error) {
      console.error("[BaseDeVieSection] save failed", error);
      alert("Impossible d'enregistrer la mise à jour pour le moment.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[32px] border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_38%),linear-gradient(180deg,#f4f7f0_0%,#ffffff_82%)] px-6 py-7 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.34)]">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Base de vie
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-stone-950">
            Ton espace permanent de continuité
          </h2>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            Ici, tu retrouves ce que tes transformations ont vraiment laissé en toi:
            tes lignes vertes, tes lignes rouges, tes déclics validés, ton arsenal construit dans le temps
            et le moteur d’initiatives qui reste actif au quotidien.
          </p>
        </div>
      </section>

      <section className="rounded-[30px] border border-emerald-200 bg-white px-6 py-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              La Ligne Verte
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-stone-950">
              Ce que tu veux refaire parce que ça te fait du bien
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de la Base de vie...
          </div>
        ) : lineGreenRecords.length > 0 ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {lineGreenRecords.map((record) => {
              const lineGreenEntry = getLineGreenEntry(record.payload);
              if (!lineGreenEntry) return null;

              return (
                <article
                  key={record.transformation.id}
                  className="rounded-[24px] border border-emerald-100 bg-emerald-50/60 px-5 py-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                        {formatBaseDeVieDate(record.transformation.completed_at)}
                      </p>
                      <h4 className="mt-2 text-lg font-semibold text-stone-950">
                        {record.transformation.title || `Transformation ${record.transformation.priority_order}`}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingTransformation(record.transformation)}
                      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Modifier
                    </button>
                  </div>
                  <div className="mt-4 space-y-3 rounded-[22px] border border-emerald-100 bg-white px-4 py-4 text-sm leading-6 text-stone-700">
                    <div>
                      <p className="font-semibold text-stone-950">Quoi</p>
                      <p>{lineGreenEntry.action}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-stone-950">Pourquoi</p>
                      <p>{lineGreenEntry.why}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-6 text-sm leading-6 text-stone-600">
            Ta ligne verte apparaîtra ici quand tu clôtureras une transformation.
          </div>
        )}
      </section>

      <section className="rounded-[30px] border border-stone-200 bg-white px-6 py-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700">
              La Ligne Rouge
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-stone-950">
              Ce que tu ne négocies plus
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de la Base de vie...
          </div>
        ) : lineRedRecords.length > 0 ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {lineRedRecords.map((record) => {
              const lineRedEntry = getLineRedEntry(record.payload);
              if (!lineRedEntry) return null;

              return (
                <article
                  key={record.transformation.id}
                  className="rounded-[24px] border border-rose-100 bg-rose-50/60 px-5 py-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                        {formatBaseDeVieDate(record.transformation.completed_at)}
                      </p>
                      <h4 className="mt-2 text-lg font-semibold text-stone-950">
                        {record.transformation.title || `Transformation ${record.transformation.priority_order}`}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingTransformation(record.transformation)}
                      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-emerald-200 hover:text-emerald-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Modifier
                    </button>
                  </div>
                  <div className="mt-4 space-y-3 rounded-[22px] border border-rose-100 bg-white px-4 py-4 text-sm leading-6 text-stone-700">
                    <div>
                      <p className="font-semibold text-stone-950">Quoi</p>
                      <p>{lineRedEntry.action}</p>
                    </div>
                    {lineRedEntry.why ? (
                      <div>
                        <p className="font-semibold text-stone-950">Pourquoi</p>
                        <p>{lineRedEntry.why}</p>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-6 text-sm leading-6 text-stone-600">
            La Base de vie se remplira au moment où tu clôtures une transformation.
          </div>
        )}
      </section>

      <section className="rounded-[30px] border border-stone-200 bg-white px-6 py-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Historique des transformations
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-stone-950">
              Le chemin parcouru, transformation par transformation
            </h3>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement de l’historique...
            </div>
          ) : records.length > 0 ? (
            records.map((record) => {
              const isExpanded = expandedTransformationId === record.transformation.id;
              const payload = record.payload;
              const declics = payload?.declics_user ?? payload?.declics_draft ?? buildFallbackDeclics(record.transformation);
              const lineGreenEntry = getLineGreenEntry(payload);
              const lineRedEntry = getLineRedEntry(payload);
              const closureFeedback = payload?.closure_feedback ?? null;

              return (
                <article
                  key={record.transformation.id}
                  className="overflow-hidden rounded-[26px] border border-stone-200 bg-stone-50"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTransformationId((current) =>
                        current === record.transformation.id ? null : record.transformation.id
                      )}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                        {formatBaseDeVieDate(record.transformation.completed_at)}
                      </p>
                      <h4 className="mt-2 text-xl font-semibold text-stone-950">
                        {record.transformation.title || `Transformation ${record.transformation.priority_order}`}
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {lineGreenEntry?.action ?? declics.insight}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-stone-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-stone-500" />
                    )}
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-stone-200 bg-white px-5 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="text-sm font-medium text-stone-600">
                          Ce que cette transformation laisse dans ta Base de vie, et ce qu'elle nous apprend côté produit.
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditingTransformation(record.transformation)}
                          className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-emerald-200 hover:text-emerald-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Modifier
                        </button>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-3">
                        <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                            Ligne Verte
                          </p>
                          {lineGreenEntry ? (
                            <div className="mt-4 space-y-4 text-sm leading-6 text-stone-700">
                              <div>
                                <p className="font-semibold text-stone-950">Quoi</p>
                                <p>{lineGreenEntry.action}</p>
                              </div>
                              <div>
                                <p className="font-semibold text-stone-950">Pourquoi</p>
                                <p>{lineGreenEntry.why}</p>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-4 text-sm leading-6 text-stone-500">
                              Pas encore définie pour cette transformation.
                            </p>
                          )}
                        </div>

                        <div className="rounded-[24px] border border-rose-100 bg-rose-50/70 p-5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-700">
                            Ligne Rouge
                          </p>
                          {lineRedEntry ? (
                            <div className="mt-4 space-y-4 text-sm leading-6 text-stone-700">
                              <div>
                                <p className="font-semibold text-stone-950">Quoi</p>
                                <p>{lineRedEntry.action}</p>
                              </div>
                              {lineRedEntry.why ? (
                                <div>
                                  <p className="font-semibold text-stone-950">Pourquoi</p>
                                  <p>{lineRedEntry.why}</p>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-4 text-sm leading-6 text-stone-500">
                              Pas encore définie pour cette transformation.
                            </p>
                          )}
                        </div>

                        <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                            Synthèse
                          </p>
                          <p className="mt-4 text-sm leading-6 text-stone-700">
                            {record.transformation.user_summary}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-3">
                        <div className="rounded-[24px] border border-amber-100 bg-amber-50/70 p-5 lg:col-span-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                            Déclics
                          </p>
                          <div className="mt-4 space-y-4 text-sm leading-6 text-stone-700">
                            <div>
                              <p className="font-semibold text-stone-950">Pourquoi</p>
                              <p>{declics.why}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-stone-950">Ce que j'ai compris</p>
                              <p>{declics.insight}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-stone-950">Identité</p>
                              <p>{declics.identity_shift}</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                            Retour de fin
                          </p>
                          {closureFeedback ? (
                            <div className="mt-4 space-y-4 text-sm leading-6 text-stone-700">
                              <div>
                                <p className="font-semibold text-stone-950">Note</p>
                                <p>{closureFeedback.helpfulness_rating}/10</p>
                              </div>
                              <div>
                                <p className="font-semibold text-stone-950">Le plus utile</p>
                                <p>{getTransformationClosureHelpfulnessAreaLabel(closureFeedback.most_helpful_area)}</p>
                              </div>
                              {closureFeedback.improvement_reasons.length > 0 ? (
                                <div>
                                  <p className="font-semibold text-stone-950">À améliorer</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {closureFeedback.improvement_reasons.map((reason) => (
                                      <span
                                        key={reason}
                                        className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700"
                                      >
                                        {getTransformationClosureImprovementReasonLabel(reason)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {closureFeedback.improvement_detail ? (
                                <div>
                                  <p className="font-semibold text-stone-950">Détail</p>
                                  <p>{closureFeedback.improvement_detail}</p>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-4 text-sm leading-6 text-stone-500">
                              Pas encore de retour structuré enregistré pour cette transformation.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-emerald-700" />
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                            Arsenal
                          </p>
                        </div>

                        {record.arsenal.length > 0 ? (
                          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                            {record.arsenal.map((item) => {
                              const Icon = arsenalIcon(item.kind);
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setSelectedArsenalItem(item)}
                                  className="rounded-[22px] border border-stone-200 bg-stone-50 px-4 py-4 text-left transition hover:border-emerald-200 hover:bg-white"
                                >
                                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                    <Icon className="h-3.5 w-3.5" />
                                    {arsenalLabel(item.kind)}
                                  </div>
                                  <h5 className="mt-3 text-base font-semibold text-stone-950">
                                    {item.title}
                                  </h5>
                                  {item.subtitle ? (
                                    <p className="mt-1 text-xs text-stone-500">{item.subtitle}</p>
                                  ) : null}
                                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-stone-600">
                                    {item.preview}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-[22px] border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm text-stone-500">
                            Aucun arsenal n'a encore été relié à cette transformation.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-6 text-sm leading-6 text-stone-600">
              Aucune transformation clôturée pour le moment.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[30px] border border-stone-200 bg-white px-6 py-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Le moteur
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-stone-950">
              Initiatives et rappels
            </h3>
          </div>
        </div>

        <RemindersSection
          userId={userId}
          cycleId={cycleId}
          scopeKind="out_of_plan"
          isLocked={isLocked}
          onUnlockRequest={onUnlockRequest}
        />
      </section>

      <ArsenalDetailModal
        item={selectedArsenalItem}
        onClose={() => setSelectedArsenalItem(null)}
      />

      <TransformationClosureModal
        isOpen={editingTransformation != null}
        mode="edit"
        transformationTitle={
          editingTransformation?.title ??
          (editingTransformation ? `Transformation ${editingTransformation.priority_order}` : "")
        }
        initialLineGreenEntry={
          getBaseDeViePayload(editingTransformation?.base_de_vie_payload)?.line_green_entry ?? null
        }
        initialLineRedEntry={getLineRedEntry(
          getBaseDeViePayload(editingTransformation?.base_de_vie_payload) ?? null,
        )}
        initialFeedback={
          getBaseDeViePayload(editingTransformation?.base_de_vie_payload)?.closure_feedback ?? null
        }
        busy={savingEdit}
        onClose={() => !savingEdit && setEditingTransformation(null)}
        onSubmit={handleEditSubmit}
      />
    </div>
  );
}
