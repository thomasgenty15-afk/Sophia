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

/** Les icônes des sections: une casserole, une boîte, une liste d'étapes. */
export type FoldIcon = "pot" | "box" | "steps";

function FoldIconGlyph({ icon }: { icon: FoldIcon }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon === "pot" && (
        <>
          <path d="M3 7h10v3.5A2.5 2.5 0 0 1 10.5 13h-5A2.5 2.5 0 0 1 3 10.5V7Z" />
          <path d="M1.5 7h13" />
          <path d="M6.5 2.5c-.5.6-.5 1.4 0 2M9.5 2.5c-.5.6-.5 1.4 0 2" />
        </>
      )}
      {icon === "box" && (
        <>
          <path d="M2.5 6h11v6.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V6Z" />
          <path d="M1.75 3.5h12.5V6H1.75z" />
          <path d="M6.5 8.75h3" />
        </>
      )}
      {icon === "steps" && (
        <>
          <path d="M6 4h7.5M6 8h7.5M6 12h7.5" />
          <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" strokeWidth="2.2" />
        </>
      )}
    </svg>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-25 — UNE SECTION = UNE TUILE QU'ON OUVRE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « C'est pas hyper clair cette vue-là »: deux lignes de texte séparées par
 * des filets, un « ▾ » de 10 px au bord droit — rien ne disait qu'on pouvait
 * cliquer, ni ce qu'il y avait dedans. Chaque section est maintenant une tuile
 * bordée: une icône dans un carré `fig-100`, le titre et, dessous, ce que la
 * section contient; à droite la pastille ronde à chevron — la même que la
 * ligne d'un plat sur l'aperçu (`DishCard`, `compact`), donc un geste que la
 * personne connaît déjà. Toute la tuile réagit au survol.
 *
 * ⚠️ LE TITRE EST LE BOUTON (clavier, `aria-expanded`); la pastille est un
 * second déclencheur pour la souris, hors tabulation. Un contrôle au bout de
 * la ligne (`action`: le « Déroulé global ») vit ENTRE les deux: un bouton
 * dans un bouton n'est pas du HTML valide.
 * ⚠️ L'ANNEAU DE FOCUS EST PORTÉ PAR LA TUILE (`data-row-toggle`, règle hors
 * `@layer` dans `tokens.css`): le bouton seul n'en dessinait qu'un morceau.
 */
export default function FoldSection({
  title,
  meta,
  tone,
  icon,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  /** Sous le titre, en discret: ce que la section contient, un compte. `null` = rien. */
  meta: string | null;
  tone: "plain" | "tinted";
  icon: FoldIcon;
  /** ⟳ 2026-09-25 — ouverte au montage (la « Préparation » d'une session). */
  defaultOpen?: boolean;
  /** ⟳ 2026-09-25 — un contrôle au bout de la ligne, avant la pastille. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = React.useId();
  const toggle = () => setOpen((v) => !v);
  return (
    <div
      className={`group/fold mt-3 rounded-card border has-[[data-row-toggle]:focus-visible]:outline-2 has-[[data-row-toggle]:focus-visible]:outline-offset-2 has-[[data-row-toggle]:focus-visible]:outline-fig-600 ${
        tone === "tinted" ? "border-fig-300 bg-fig-50" : "border-line bg-paper"
      }`}
    >
      <div
        className={`flex items-center gap-3 rounded-card px-3 py-2.5 transition-colors ${
          tone === "tinted" ? "hover:bg-fig-100" : "hover:bg-paper-2"
        }`}
      >
        <button
          type="button"
          data-row-toggle
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-part bg-fig-100 text-fig-700"
          >
            <FoldIconGlyph icon={icon} />
          </span>
          <span className="min-w-0 break-words">
            <span className="block text-sm font-semibold text-ink">{title}</span>
            {meta && (
              <span className="block text-xs tabular-nums text-ink-soft">{meta}</span>
            )}
          </span>
        </button>
        {action}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={toggle}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
            open
              ? "border-fig-700 bg-fig-50 text-fig-700"
              : "border-line-strong text-ink-soft group-hover/fold:border-ink group-hover/fold:text-ink"
          }`}
        >
          <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </button>
      </div>
      {/* ⚠️ LE CONTENU EST TOUJOURS RENDU, MASQUÉ PAR `hidden` — le patron du
          pli de `DishCard`. Replié, rien ne se voit ni ne se lit (`hidden` le
          retire aussi de l'arbre d'accessibilité), mais le document garde ses
          chiffres: les épreuves qui lisent le rendu d'une carte continuent de
          voir ce qu'elle porte. */}
      <div
        id={panelId}
        className={`border-t px-3 pb-3 pt-3 ${tone === "tinted" ? "border-fig-300" : "border-line"}`}
        hidden={!open}
      >
        {children}
      </div>
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
      icon="box"
    >
      <BoxTable lines={lines} context="session" boxEnergy={boxEnergy} headless />
    </FoldSection>
  );
}
