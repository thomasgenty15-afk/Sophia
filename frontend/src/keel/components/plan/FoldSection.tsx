import React from "react";

import type { BoxEnergyView } from "../../api/mealEnergy";
import { mealCopy } from "../../api/mealLabels";
import type { BoxLine } from "../../lib/mealBoxes";
import { BoxTable } from "./BoxTable";

// ⟳ 2026-09-23 — UNE SECTION QUI SE DÉPLIE, REPLIÉE PAR DÉFAUT.
//
// Demandé par le propriétaire sur les sessions de cuisine: « toutes les
// sections doivent être dépliables, ça doit pas être directement déplié, sinon
// c'est interminable ». Un jour de cuisine rendait trois recettes complètes, le
// déroulé et quinze contenants d'affilée.
//
// Une seule écriture pour les deux surfaces qui montrent une session: le bloc
// du jour de `/app/plan` (`PlanDayBlock`) et la fenêtre « Tes sessions de
// cuisine » (`CookingSessions`).
//
// `tone="tinted"` sert le « Déroulé global »: une zone teintée, pour qu'on voie
// au premier regard que ce n'est pas une préparation de plus.

export default function FoldSection({
  title,
  meta,
  tone,
  children,
}: {
  title: string;
  /** À droite du titre, en discret: une durée, un compte. `null` = rien. */
  meta: string | null;
  tone: "plain" | "tinted";
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  return (
    <div
      className={tone === "tinted"
        ? "mt-3 rounded-card border border-fig-300 bg-fig-50 px-3 py-2"
        : "mt-3 border-t border-line pt-3"}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-6 w-full items-baseline justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-fig-600"
      >
        <span className="min-w-0 break-words">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {meta && (
            <span className="ml-2 text-xs font-normal tabular-nums text-ink-soft">
              {meta}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {/* ⚠️ LE CONTENU EST TOUJOURS RENDU, MASQUÉ PAR `hidden` — le patron du
          pli de `DishCard`. Replié, rien ne se voit ni ne se lit (`hidden` le
          retire aussi de l'arbre d'accessibilité), mais le document garde ses
          chiffres: les épreuves qui lisent le rendu d'une carte continuent de
          voir ce qu'elle porte. */}
      <div id={panelId} className="mt-2" hidden={!open}>{children}</div>
    </div>
  );
}

/**
 * LE BOXING D'UNE SESSION, REPLIÉ. Le titre porte le compte (et ce qui part au
 * congélateur): on sait combien de bacs sortir sans ouvrir la liste.
 */
export function BoxingFold({
  lines,
  boxEnergy,
}: {
  lines: readonly BoxLine[];
  boxEnergy?: (boxId: string) => BoxEnergyView | null;
}) {
  if (lines.length === 0) return null;
  const frozen = lines.filter((l) => l.frozen).length;
  const count = lines.length === 1
    ? mealCopy("meals.boxes.count_one")
    : mealCopy("meals.boxes.count_many", { n: lines.length });
  return (
    <FoldSection
      title={mealCopy("meals.boxes.title")}
      meta={frozen > 0
        ? `${count} ${mealCopy("meals.boxes.freeze_count", { n: frozen })}`
        : count}
      tone="plain"
    >
      <BoxTable lines={lines} context="session" boxEnergy={boxEnergy} headless />
    </FoldSection>
  );
}
