import { CheckCircle2, type LucideIcon } from "lucide-react";

import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";
import type {
  DashboardV2DimensionGroup,
  DashboardV2UnlockState,
} from "../../hooks/useDashboardV2Logic";
import type { PlanDimension } from "../../types/v2";
import { HabitMaintenanceStrip } from "./HabitMaintenanceStrip";
import { PlanItemCard } from "./PlanItemCard";

type DimensionSectionProps = {
  dimension: PlanDimension;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  groups: DashboardV2DimensionGroup;
  unlockStateByItemId: Map<string, DashboardV2UnlockState>;
  busyItemId: string | null;
  onComplete: (item: DashboardV2PlanItemRuntime) => void;
  onActivate: (item: DashboardV2PlanItemRuntime) => void;
  onPrepareCards: (item: DashboardV2PlanItemRuntime) => void;
  onOpenDefenseResourceEditor: (item: DashboardV2PlanItemRuntime) => void;
  onBlocker: (item: DashboardV2PlanItemRuntime) => void;
  onDeactivate: (item: DashboardV2PlanItemRuntime) => void;
  onRemove: (item: DashboardV2PlanItemRuntime) => void;
  onAdapt: (item: DashboardV2PlanItemRuntime) => void;
};

function emptyCopyForDimension(dimension: PlanDimension) {
  if (dimension === "clarifications") {
    return "Aucune clarification spécifique n'est nécessaire pour le moment.";
  }
  if (dimension === "missions") {
    return "Tes missions du moment sont terminées. La suite se prépare.";
  }
  return "Aucune habitude active pour l'instant.";
}

export function DimensionSection({
  dimension,
  title,
  subtitle,
  icon: Icon,
  groups,
  unlockStateByItemId,
  busyItemId,
  onComplete,
  onActivate,
  onPrepareCards,
  onOpenDefenseResourceEditor,
  onBlocker,
  onDeactivate,
  onRemove,
  onAdapt,
}: DimensionSectionProps) {
  const visibleActive = dimension === "habits"
    ? [...groups.active, ...groups.stalled]
    : groups.active;
  const hasContent = groups.all.length > 0;

  return (
    <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-600">
            <Icon className="h-3.5 w-3.5" />
            {title}
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-600">{subtitle}</p>
        </div>
        {hasContent ? (
          <div className="rounded-full bg-stone-950 px-3 py-1 text-sm font-semibold text-white">
            {groups.all.length}
          </div>
        ) : null}
      </div>

      {!hasContent ? (
        <div className="mt-5 rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm leading-6 text-stone-600">
          {emptyCopyForDimension(dimension)}
        </div>
      ) : null}

      {visibleActive.length > 0 ? (
        <div className="mt-5 grid gap-4">
          {visibleActive.map((item) => (
            <div key={item.id}>
              <PlanItemCard
                item={item}
                unlockState={unlockStateByItemId.get(item.id) ?? null}
                isBusy={busyItemId === item.id}
                onComplete={onComplete}
                onActivate={onActivate}
                onPrepareCards={onPrepareCards}
                onOpenDefenseResourceEditor={onOpenDefenseResourceEditor}
                onBlocker={onBlocker}
                onDeactivate={onDeactivate}
                onRemove={onRemove}
                onAdapt={onAdapt}
              />
            </div>
          ))}
        </div>
      ) : null}

      {groups.pending.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Bientôt
          </p>
          <div className="mt-3 grid gap-4">
            {groups.pending.map((item) => (
              <div key={item.id}>
                <PlanItemCard
                  item={item}
                  unlockState={unlockStateByItemId.get(item.id) ?? null}
                  isBusy={busyItemId === item.id}
                  onComplete={onComplete}
                  onActivate={onActivate}
                  onPrepareCards={onPrepareCards}
                  onOpenDefenseResourceEditor={onOpenDefenseResourceEditor}
                  onBlocker={onBlocker}
                  onDeactivate={onDeactivate}
                  onRemove={onRemove}
                  onAdapt={onAdapt}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {dimension === "habits" ? (
        <div className="mt-5">
          <HabitMaintenanceStrip items={groups.maintenance} />
        </div>
      ) : null}

      {groups.completed.length > 0 ? (
        <div className="mt-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Terminé ({groups.completed.length})
          </div>
          <div className="mt-3 grid gap-2">
            {groups.completed.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-[20px] border border-stone-100 bg-stone-50/60 px-4 py-3"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm text-stone-500 line-through decoration-stone-300">
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
