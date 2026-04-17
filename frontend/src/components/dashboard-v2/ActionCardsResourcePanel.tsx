import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Compass, Map as MapIcon, Shield, Sword } from "lucide-react";

import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";
import { supabase } from "../../lib/supabase";
import { exportDefenseCardAsPdf } from "../../lib/exportDefenseCard";
import {
  resolveAttackPreview,
  resolveDefensePreview,
} from "../../lib/actionCardsPreview";
import { DefenseTriggerResourceCard, type DefenseTriggerResourceCardData } from "./DefenseCard";
import type { PlanContentV3 } from "../../types/v2";

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
    setIsOpen(true);
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
  const [openDefenseTriggerIds, setOpenDefenseTriggerIds] = useState<Record<string, boolean>>({});
  const [updatingDefenseKey, setUpdatingDefenseKey] = useState<string | null>(null);
  const [removingDefenseKey, setRemovingDefenseKey] = useState<string | null>(null);

  const toggleDefenseTrigger = (key: string) => {
    setOpenDefenseTriggerIds((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  useEffect(() => {
    if (kind !== "defense" || !focusDefenseTriggerKey || !focusDefenseToken) return;
    setOpenDefenseTriggerIds((current) => ({
      ...current,
      [focusDefenseTriggerKey]: true,
    }));
  }, [kind, focusDefenseTriggerKey, focusDefenseToken]);

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
                const attackPreview = resolveAttackPreview(item.linked_attack_card);

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
