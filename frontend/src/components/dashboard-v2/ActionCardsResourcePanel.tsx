import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Compass, Map as MapIcon, Pencil, Sword, X } from "lucide-react";

import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";
import { supabase } from "../../lib/supabase";
import { exportDefenseCardAsPdf } from "../../lib/exportDefenseCard";
import {
  resolveAttackPreview,
} from "../../lib/actionCardsPreview";
import { DefenseTriggerResourceCard, type DefenseTriggerResourceCardData } from "./DefenseCard";
import type { AttackCardContent, PlanContentV3, UserAttackCardRow } from "../../types/v2";

type ActionCardsResourcePanelProps = {
  planContentV3: PlanContentV3 | null;
  planItems: DashboardV2PlanItemRuntime[];
};

type PlanActionCardsByLevelProps = {
  kind: "attack" | "defense";
  planContentV3: PlanContentV3 | null;
  planItems: DashboardV2PlanItemRuntime[];
  embedded?: boolean;
  onCardsChanged?: () => Promise<void> | void;
  focusDefenseTriggerKey?: string | null;
  focusDefenseToken?: number | null;
};

type AccordionSectionProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  containerClassName?: string;
  children: ReactNode;
  forceOpenToken?: number | null;
};

function AccordionSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  containerClassName = "rounded-2xl border border-stone-200 bg-white",
  children,
  forceOpenToken,
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!forceOpenToken) return;
    const timeoutId = window.setTimeout(() => setIsOpen(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, [forceOpenToken]);

  return (
    <div className={containerClassName}>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100">
                {icon}
              </span>
            ) : null}
            <div>
              <p className="text-sm font-semibold text-stone-950">{title}</p>
              {subtitle ? (
                <p className="mt-1 text-sm leading-6 text-stone-600">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-stone-500" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-stone-500" />
        )}
      </button>

      {isOpen ? <div className="border-t border-stone-200 px-4 py-4">{children}</div> : null}
    </div>
  );
}

function resolvePhaseTitle(
  planContentV3: PlanContentV3 | null,
  phaseId: string | null,
): string {
  if (!phaseId) return "Hors phase";
  return planContentV3?.phases.find((phase) => phase.phase_id === phaseId)?.title ?? "Hors phase";
}

function resolvePhaseOrder(
  planContentV3: PlanContentV3 | null,
  phaseId: string | null,
): number {
  if (!phaseId) return 999;
  return planContentV3?.phases.find((phase) => phase.phase_id === phaseId)?.phase_order ?? 999;
}

function normalizeAttackKeyword(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceKeywordInText(value: string | null | undefined, previousKeyword: string, nextKeyword: string): string {
  const text = String(value ?? "");
  if (!previousKeyword.trim()) return text;
  return text.replace(new RegExp(escapeRegExp(previousKeyword), "gi"), nextKeyword);
}

function getAttackKeywordTrigger(card: UserAttackCardRow | null | undefined) {
  return card?.content.techniques.find((technique) =>
    technique.technique_key === "pre_engagement" && technique.generated_result?.keyword_trigger
  )?.generated_result?.keyword_trigger ?? null;
}

function updateAttackCardKeywordContent(
  content: AttackCardContent,
  nextKeyword: string,
): AttackCardContent {
  return {
    ...content,
    techniques: content.techniques.map((technique) => {
      if (technique.technique_key !== "pre_engagement") {
        return technique;
      }

      const generatedResult = technique.generated_result;
      const keywordTrigger = generatedResult?.keyword_trigger;
      if (!generatedResult || !keywordTrigger) return technique;

      const previousKeyword = keywordTrigger.activation_keyword;
      return {
        ...technique,
        generated_result: {
          ...generatedResult,
          generated_asset: replaceKeywordInText(generatedResult.generated_asset, previousKeyword, nextKeyword),
          mode_emploi: replaceKeywordInText(generatedResult.mode_emploi, previousKeyword, nextKeyword),
          keyword_trigger: {
            activation_keyword: nextKeyword,
            activation_keyword_normalized: normalizeAttackKeyword(nextKeyword),
            risk_situation: keywordTrigger.risk_situation,
            strength_anchor: keywordTrigger.strength_anchor,
            first_response_intent: keywordTrigger.first_response_intent,
            assistant_prompt: keywordTrigger.assistant_prompt,
          },
        },
      };
    }),
  };
}

export function ActionCardsResourcePanel({
  planContentV3,
  planItems,
}: ActionCardsResourcePanelProps) {
  const hasResourceItems = planItems.some((item) =>
    item.cards_required && (item.linked_defense_card || item.linked_attack_card)
  );

  if (!hasResourceItems) {
    return (
      <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-8 text-center shadow-sm">
        <Compass className="mx-auto h-10 w-10 text-stone-300" />
        <p className="mt-4 text-sm text-stone-500">
          Les cartes d'action apparaitront ici quand tu choisiras d'en creer pour une mission ou une habitude du plan.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <PlanActionCardsByLevel
        kind="defense"
        planContentV3={planContentV3}
        planItems={planItems}
      />
      <PlanActionCardsByLevel
        kind="attack"
        planContentV3={planContentV3}
        planItems={planItems}
      />
    </section>
  );
}

export function PlanActionCardsByLevel({
  kind,
  planContentV3,
  planItems,
  embedded = false,
  onCardsChanged,
  focusDefenseTriggerKey,
  focusDefenseToken,
}: PlanActionCardsByLevelProps) {
  const resourceItems = planItems.filter((item) =>
    item.cards_required &&
    (kind === "defense" ? item.linked_defense_card : item.linked_attack_card)
  );
  const [openDefenseTriggerIds, setOpenDefenseTriggerIds] = useState<Record<string, boolean>>({});
  const [updatingDefenseKey, setUpdatingDefenseKey] = useState<string | null>(null);
  const [removingDefenseKey, setRemovingDefenseKey] = useState<string | null>(null);
  const [editingAttackKeywordCardId, setEditingAttackKeywordCardId] = useState<string | null>(null);
  const [attackKeywordDraft, setAttackKeywordDraft] = useState("");
  const [confirmingAttackKeywordCardId, setConfirmingAttackKeywordCardId] = useState<string | null>(null);
  const [updatingAttackKeywordCardId, setUpdatingAttackKeywordCardId] = useState<string | null>(null);
  const [attackKeywordError, setAttackKeywordError] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "defense" || !focusDefenseTriggerKey || !focusDefenseToken) return;
    const timeoutId = window.setTimeout(() => {
      setOpenDefenseTriggerIds((current) => ({
        ...current,
        [focusDefenseTriggerKey]: true,
      }));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [kind, focusDefenseTriggerKey, focusDefenseToken]);

  if (resourceItems.length === 0) {
    return null;
  }

  const grouped = resourceItems
    .slice()
    .sort((a, b) => {
      const phaseOrderDelta = resolvePhaseOrder(planContentV3, a.phase_id) - resolvePhaseOrder(planContentV3, b.phase_id);
      if (phaseOrderDelta !== 0) return phaseOrderDelta;
      const activationOrderA = a.activation_order ?? 999;
      const activationOrderB = b.activation_order ?? 999;
      if (activationOrderA !== activationOrderB) return activationOrderA - activationOrderB;
      return a.title.localeCompare(b.title);
    })
    .reduce((acc, item) => {
      const phaseId = item.phase_id ?? "unphased";
      const bucket = acc.get(phaseId) ?? [];
      bucket.push(item);
      acc.set(phaseId, bucket);
      return acc;
    }, new Map<string, DashboardV2PlanItemRuntime[]>());

  const title = kind === "defense" ? "Cartes de defense du plan" : "Cartes d'attaque du plan";
  const description = kind === "defense"
    ? "Elles se rangent ici, par niveau, quand tu choisis de les preparer pour une action du plan."
    : "Elles se rangent ici, par niveau, quand tu choisis de les preparer pour une action du plan.";
  const icon = <MapIcon className="h-4 w-4 text-sky-700" />;
  const wrapperClassName = embedded
    ? "rounded-2xl border border-stone-200 bg-white/80"
    : "rounded-[30px] border border-stone-200 bg-white shadow-sm";

  const toggleDefenseTrigger = (key: string) => {
    setOpenDefenseTriggerIds((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const flattenPlanDefenseCards = (item: DashboardV2PlanItemRuntime) => {
    const card = item.linked_defense_card;
    if (!card) return [];

    const totalTriggers = card.content.impulses.reduce(
      (count, impulse) => count + impulse.triggers.length,
      0,
    );

    return card.content.impulses.flatMap((impulse) =>
      impulse.triggers.map((trigger, index) => ({
        key: `${card.id}:${trigger.trigger_id}`,
        defenseCardId: card.id,
        planItemId: item.id,
        attackCardId: item.attack_card_id ?? null,
        totalTriggers,
        card: {
          impulseId: impulse.impulse_id,
          impulseLabel: impulse.label,
          contextLabel: item.title,
          planB: String(trigger.plan_b ?? impulse.generic_defense ?? "").trim(),
          trigger,
          index,
        } satisfies DefenseTriggerResourceCardData,
        content: card.content,
      })),
    );
  };

  const handleUpdatePlanDefenseCard = async (
    defenseCardId: string,
    input: {
      impulseId: string;
      triggerId: string;
      situation: string;
      signal: string;
      defenseResponse: string;
      planB: string;
    },
  ) => {
    const opKey = `${defenseCardId}:${input.triggerId}`;
    setUpdatingDefenseKey(opKey);
    try {
      const { error } = await supabase.functions.invoke("update-defense-card-v3", {
        body: {
          action: "update_card",
          defense_card_id: defenseCardId,
          impulse_id: input.impulseId,
          trigger_id: input.triggerId,
          situation: input.situation,
          signal: input.signal,
          defense_response: input.defenseResponse,
          generic_defense: input.planB,
          plan_b: input.planB,
        },
      });
      if (error) throw error;
      await onCardsChanged?.();
      return true;
    } catch (error) {
      console.error("[PlanActionCardsByLevel] update plan defense card failed:", error);
      return false;
    } finally {
      setUpdatingDefenseKey(null);
    }
  };

  const handleRemovePlanDefenseCard = async (args: {
    defenseCardId: string;
    planItemId: string;
    attackCardId: string | null;
    totalTriggers: number;
    impulseId: string;
    triggerId: string;
  }) => {
    const opKey = `${args.defenseCardId}:${args.triggerId}`;
    setRemovingDefenseKey(opKey);
    try {
      const { error } = await supabase.functions.invoke("update-defense-card-v3", {
        body: {
          action: "remove_trigger",
          defense_card_id: args.defenseCardId,
          impulse_id: args.impulseId,
          trigger_id: args.triggerId,
        },
      });
      if (error) throw error;

      if (args.totalTriggers <= 1) {
        const nextCardsStatus = args.attackCardId ? "ready" : "not_started";
        const { error: unlinkError } = await supabase
          .from("user_plan_items")
          .update({
            defense_card_id: null,
            cards_status: nextCardsStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", args.planItemId);
        if (unlinkError) throw unlinkError;
      }

      await onCardsChanged?.();
      return true;
    } catch (error) {
      console.error("[PlanActionCardsByLevel] remove plan defense card failed:", error);
      return false;
    } finally {
      setRemovingDefenseKey(null);
    }
  };

  const beginAttackKeywordEdit = (card: UserAttackCardRow) => {
    const trigger = getAttackKeywordTrigger(card);
    if (!trigger) return;
    setEditingAttackKeywordCardId(card.id);
    setAttackKeywordDraft(trigger.activation_keyword);
    setConfirmingAttackKeywordCardId(null);
    setAttackKeywordError(null);
  };

  const cancelAttackKeywordEdit = () => {
    setEditingAttackKeywordCardId(null);
    setAttackKeywordDraft("");
    setConfirmingAttackKeywordCardId(null);
    setAttackKeywordError(null);
  };

  const handlePrepareAttackKeywordUpdate = (card: UserAttackCardRow) => {
    const nextKeyword = attackKeywordDraft.trim();
    const currentKeyword = getAttackKeywordTrigger(card)?.activation_keyword ?? "";
    setAttackKeywordError(null);
    if (!nextKeyword) {
      setAttackKeywordError("Choisis un mot de bascule avant de confirmer.");
      return;
    }
    if (nextKeyword.length > 28) {
      setAttackKeywordError("Choisis un mot court, plus facile a envoyer dans le moment fragile.");
      return;
    }
    if (normalizeAttackKeyword(nextKeyword) === normalizeAttackKeyword(currentKeyword)) {
      cancelAttackKeywordEdit();
      return;
    }
    setConfirmingAttackKeywordCardId(card.id);
  };

  const handleConfirmAttackKeywordUpdate = async (card: UserAttackCardRow) => {
    const currentTrigger = getAttackKeywordTrigger(card);
    const nextKeyword = attackKeywordDraft.trim();
    const normalizedNextKeyword = normalizeAttackKeyword(nextKeyword);
    if (!currentTrigger || !normalizedNextKeyword) return false;

    setUpdatingAttackKeywordCardId(card.id);
    setAttackKeywordError(null);
    try {
      const { data: activeCards, error: activeCardsError } = await supabase
        .from("user_attack_cards")
        .select("id, content")
        .eq("status", "active")
        .neq("id", card.id);
      if (activeCardsError) throw activeCardsError;

      const keywordAlreadyUsed = ((activeCards ?? []) as Array<{ id: string; content: AttackCardContent }>).some((row) =>
        row.content?.techniques?.some((technique) =>
          technique.generated_result?.keyword_trigger?.activation_keyword_normalized === normalizedNextKeyword
        )
      );
      if (keywordAlreadyUsed) {
        setAttackKeywordError("Ce mot est deja utilise par une autre carte active. Choisis-en un autre.");
        setConfirmingAttackKeywordCardId(null);
        return false;
      }

      const nextContent = updateAttackCardKeywordContent(card.content, nextKeyword);
      const { error } = await supabase
        .from("user_attack_cards")
        .update({
          content: nextContent,
          last_updated_at: new Date().toISOString(),
        })
        .eq("id", card.id);
      if (error) throw error;

      await onCardsChanged?.();
      cancelAttackKeywordEdit();
      return true;
    } catch (error) {
      console.error("[PlanActionCardsByLevel] update attack keyword failed:", error);
      setAttackKeywordError("Le mot n'a pas pu etre remplace. Reessaie dans un instant.");
      return false;
    } finally {
      setUpdatingAttackKeywordCardId(null);
    }
  };

  const content = (
    <div className="space-y-4">
      {[...grouped.entries()].map(([phaseId, items]) => (
        <AccordionSection
          key={phaseId}
          title={resolvePhaseTitle(planContentV3, items[0]?.phase_id ?? null)}
          subtitle={phaseId === "unphased"
            ? "Niveau hors phase"
            : `Niveau ${resolvePhaseOrder(planContentV3, items[0]?.phase_id ?? null)}`}
          containerClassName="rounded-3xl border border-stone-200 bg-stone-50"
          defaultOpen={kind === "defense" && items.some((item) =>
            flattenPlanDefenseCards(item).some((entry) => entry.key === focusDefenseTriggerKey)
          )}
          forceOpenToken={kind === "defense" && items.some((item) =>
            flattenPlanDefenseCards(item).some((entry) => entry.key === focusDefenseTriggerKey)
          )
            ? focusDefenseToken ?? null
            : null}
        >
          {kind === "defense" ? (
            <div className="space-y-3">
              {items.flatMap((item) => flattenPlanDefenseCards(item)).map((entry) => (
                <DefenseTriggerResourceCard
                  key={entry.key}
                  card={entry.card}
                  isOpen={Boolean(openDefenseTriggerIds[entry.key])}
                  onToggle={() => toggleDefenseTrigger(entry.key)}
                  onExport={() => {
                    void exportDefenseCardAsPdf(entry.content, 0);
                  }}
                  onRemoveCard={(input) =>
                    handleRemovePlanDefenseCard({
                      defenseCardId: entry.defenseCardId,
                      planItemId: entry.planItemId,
                      attackCardId: entry.attackCardId,
                      totalTriggers: entry.totalTriggers,
                      impulseId: input.impulseId,
                      triggerId: input.triggerId,
                    })}
                  onUpdateCard={(input) =>
                    handleUpdatePlanDefenseCard(entry.defenseCardId, input)}
                  removing={removingDefenseKey === entry.key}
                  updating={updatingDefenseKey === entry.key}
                  focusSignal={entry.key === focusDefenseTriggerKey ? focusDefenseToken ?? null : null}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const attackCard = item.linked_attack_card;
                const attackPreview = resolveAttackPreview(attackCard);
                const keywordTrigger = getAttackKeywordTrigger(attackCard);
                const isEditingKeyword = Boolean(attackCard && editingAttackKeywordCardId === attackCard.id);
                const isConfirmingKeyword = Boolean(attackCard && confirmingAttackKeywordCardId === attackCard.id);
                const isUpdatingKeyword = Boolean(attackCard && updatingAttackKeywordCardId === attackCard.id);

                return (
                  <AccordionSection
                    key={item.id}
                    title={item.title}
                    subtitle={item.dimension === "habits" ? "Habitude" : "Mission"}
                    containerClassName="rounded-2xl border border-stone-200 bg-white"
                  >
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        <Sword className="h-3.5 w-3.5" />
                        Attaque
                      </div>
                      {attackPreview ? (
                        <div className="mt-2 space-y-1.5 text-sm leading-6 text-stone-800">
                          <p><span className="font-semibold">Titre:</span> {attackPreview.title}</p>
                          <p><span className="font-semibold">Technique:</span> {attackPreview.techniqueTitle}</p>
                          <p>{attackPreview.generatedAsset ?? attackPreview.summary}</p>
                          <p><span className="font-semibold">Mode d'emploi:</span> {attackPreview.modeEmploi}</p>
                          {attackCard && keywordTrigger ? (
                            <div className="mt-4 rounded-xl border border-amber-200 bg-white px-3 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                                    Mot de bascule
                                  </p>
                                  <p className="mt-1 text-sm text-stone-800">{keywordTrigger.activation_keyword}</p>
                                </div>
                                {!isEditingKeyword ? (
                                  <button
                                    type="button"
                                    onClick={() => beginAttackKeywordEdit(attackCard)}
                                    className="inline-flex items-center gap-2 rounded-full border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Modifier le mot
                                  </button>
                                ) : null}
                              </div>

                              {isEditingKeyword ? (
                                <div className="mt-3 space-y-3 border-t border-amber-100 pt-3">
                                  <p className="text-xs leading-5 text-stone-600">
                                    Seul le mot de bascule est modifiable ici. Pour changer le contexte, le protocole ou la technique, cree une nouvelle carte d'attaque.
                                  </p>
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                      value={attackKeywordDraft}
                                      onChange={(event) => {
                                        setAttackKeywordDraft(event.target.value);
                                        setConfirmingAttackKeywordCardId(null);
                                        setAttackKeywordError(null);
                                      }}
                                      className="min-h-10 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-500"
                                      placeholder="Nouveau mot court"
                                      disabled={isUpdatingKeyword}
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handlePrepareAttackKeywordUpdate(attackCard)}
                                        disabled={isUpdatingKeyword}
                                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-stone-950 px-3 text-sm font-semibold text-white disabled:opacity-60"
                                      >
                                        <Check className="h-4 w-4" />
                                        Valider
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelAttackKeywordEdit}
                                        disabled={isUpdatingKeyword}
                                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 text-sm font-semibold text-stone-700 disabled:opacity-60"
                                      >
                                        <X className="h-4 w-4" />
                                        Annuler
                                      </button>
                                    </div>
                                  </div>

                                  {isConfirmingKeyword ? (
                                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                                      <p className="text-sm leading-6 text-stone-700">
                                        Confirmer le remplacement de "{keywordTrigger.activation_keyword}" par "{attackKeywordDraft.trim()}" dans le systeme ?
                                      </p>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void handleConfirmAttackKeywordUpdate(attackCard);
                                          }}
                                          disabled={isUpdatingKeyword}
                                          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-700 px-3 text-sm font-semibold text-white disabled:opacity-60"
                                        >
                                          <Check className="h-4 w-4" />
                                          Confirmer
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmingAttackKeywordCardId(null)}
                                          disabled={isUpdatingKeyword}
                                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 px-3 text-sm font-semibold text-stone-700 disabled:opacity-60"
                                        >
                                          <X className="h-4 w-4" />
                                          Retour
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}

                                  {attackKeywordError ? (
                                    <p className="text-xs font-medium text-red-700">{attackKeywordError}</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-stone-500">Carte non disponible.</p>
                      )}
                    </div>
                  </AccordionSection>
                );
              })}
            </div>
          )}
        </AccordionSection>
      ))}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <section className={wrapperClassName}>
      <AccordionSection
        title={title}
        subtitle={description}
        icon={icon}
        containerClassName="rounded-[30px] border-0 bg-transparent"
      >
        {content}
      </AccordionSection>
    </section>
  );
}
