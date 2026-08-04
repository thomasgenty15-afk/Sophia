import { ChevronDown, HeartPulse } from "lucide-react";
import { useState } from "react";

import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";

type HabitMaintenanceStripProps = {
  items: DashboardV2PlanItemRuntime[];
};

export function HabitMaintenanceStrip({ items }: HabitMaintenanceStripProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="rounded-[26px] border border-emerald-200 bg-emerald-50/80 p-3">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white p-2 text-emerald-700 shadow-sm">
            <HeartPulse className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-950">
              Habitudes ancrées
            </p>
            <p className="text-xs text-emerald-800/80">
              {items.length} habitude{items.length > 1 ? "s" : ""} en maintien
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-emerald-800 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div className="mt-3 grid gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-[20px] border border-emerald-200 bg-white/85 px-4 py-3"
            >
              <p className="text-sm font-medium text-stone-900">{item.title}</p>
              {item.description ? (
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {item.description}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
