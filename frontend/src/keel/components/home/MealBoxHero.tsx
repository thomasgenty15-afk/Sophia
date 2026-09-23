import React from "react";

import { t, type MessageKey } from "../../i18n/t";
import { boxPartsFor, DEMO_DISHES, mealLabel, memberName, type DemoBoxPart, type DemoGoal } from "./planDemoData";
import type { BoxGrams, MealBoxFrame, MealBoxScene } from "./mealBoxScene";
import { placeChip } from "./placeChip";

// LE VISUEL DU HÉROS — LA BOÎTE DU REPAS, EN 3D (2026-09-23).
//
// ── CE QU'IL DIT ───────────────────────────────────────────────────────────
// Le titre promet « perdre du poids OU prendre du muscle ». La boîte montre ce
// que ça change: le même plat, pas la même part. Le visiteur choisit un
// objectif; la casserole principale (poulet et légumes, toujours dans les
// mêmes proportions) et le boulgour à côté montent ou descendent jusqu'aux
// grammes de `DEMO_DISHES[0]` — les mêmes que toute la section suivante, qui
// suit le même choix (l'état vit dans `HomePage`).
//
// ── CE QUI NE DÉPEND PAS DE LA 3D ──────────────────────────────────────────
// Le sélecteur et la liste des grammes (lue par les lecteurs d'écran) sont du
// HTML rendu tout de suite. La scène est chargée ensuite par `import()`; si
// WebGL manque ou échoue, `fallback` (la photo du plat, le héros d'avant) prend
// sa place et le reste ne bouge pas.
//
// ⟳ 2026-09-23 (le soir): « Dans l'assiette, ça donne… » et « Une portion ·
// Quantités après cuisson » ont quitté le dessous du sélecteur (demande du
// propriétaire). La seconde vit toujours dans « Exemple de repas ».

const DISH = DEMO_DISHES[0];

const GOALS = [
  { goal: "fat_loss", label: "home.goal.fat_loss" },
  { goal: "muscle_gain", label: "home.goal.muscle_gain" },
] as const satisfies ReadonlyArray<{ goal: DemoGoal; label: MessageKey }>;

/** Le libellé court d'une ligne de boîte, par son rôle. */
const PART_LABEL = {
  main: "home.demo.box.main",
  separable_side: "home.demo.box.side",
} as const satisfies Record<DemoBoxPart["role"], MessageKey>;

function gramsFor(goal: DemoGoal): BoxGrams {
  const [main, side] = boxPartsFor(DISH, goal);
  return [main.grams, side.grams];
}

/**
 * La répartition d'un total animé: la casserole principale a UNE composition,
 * donc chaque aliment garde sa part du total pendant que le total bouge. Le
 * dernier prend le reste, pour que la somme affichée tombe juste.
 */
function splitOf(part: DemoBoxPart, total: number): string {
  let used = 0;
  return part.items.map((item, i) => {
    const grams = i === part.items.length - 1 ? total - used : Math.round((total * item.grams) / part.grams);
    used += grams;
    return `${item.term} ${grams} g`;
  }).join(" · ");
}

type Status = "loading" | "ready" | "failed";

export interface MealBoxHeroProps {
  goal: DemoGoal;
  onGoalChange: (goal: DemoGoal) => void;
  fallback: React.ReactNode;
}

export default function MealBoxHero({ goal, onGoalChange, fallback }: MealBoxHeroProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const chipRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const gramRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
  const splitRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
  const sceneRef = React.useRef<MealBoxScene | null>(null);
  const goalRef = React.useRef(goal);
  const [status, setStatus] = React.useState<Status>("loading");
  const parts = boxPartsFor(DISH, goal);

  React.useEffect(() => {
    let cancelled = false;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const onFrame = ({ anchors, grams, appear }: MealBoxFrame) => {
      // Les étiquettes n'apparaissent qu'une fois le couvercle presque ouvert
      // (avant, elles annonceraient « 0 g » sur une boîte fermée), chacune quand
      // sa portion commence à monter (`appear`, calculé par la scène).
      const current = boxPartsFor(DISH, goalRef.current);
      const stageWidth = canvasRef.current?.clientWidth ?? 0;
      anchors.forEach((point, i) => {
        const chip = chipRefs.current[i];
        if (chip) {
          placeChip(chip, point.x, point.y, stageWidth, appear[i]);
        }
        const value = gramRefs.current[i];
        const text = String(grams[i]);
        if (value && value.textContent !== text) value.textContent = text;
        const split = splitRefs.current[i];
        if (split && current[i]) {
          const line = splitOf(current[i], grams[i]);
          if (split.textContent !== line) split.textContent = line;
        }
      });
    };
    import("./mealBoxScene")
      .then(({ createMealBoxScene }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        sceneRef.current = createMealBoxScene({
          canvas,
          grams: gramsFor(goalRef.current),
          sticker: { name: memberName("you"), meal: mealLabel(DISH.day, DISH.slot) },
          reducedMotion,
          onFrame,
          onReady: () => { if (!cancelled) setStatus("ready"); },
        });
      })
      .catch(() => { if (!cancelled) setStatus("failed"); });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Déclaré APRÈS l'effet de montage: au premier rendu, la scène lit `goalRef`
  // tel qu'initialisé; ensuite, un objectif choisi pendant le chargement du
  // module est repris par la scène à sa création.
  React.useEffect(() => {
    goalRef.current = goal;
    sceneRef.current?.setGrams(gramsFor(goal));
  }, [goal]);

  const ready = status === "ready";

  return <div className="relative mx-auto w-full max-w-[560px]">
    {status === "failed" ? fallback : <div className="@container relative aspect-[5/4] w-full">
      <div aria-hidden="true" className="absolute inset-[14%] rounded-full bg-fig-100/80 blur-3xl" />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 size-full transition-opacity duration-700 ease-out motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}
      />
      {/* Les étiquettes suivent le haut de chaque compartiment, image par
          image: leur position et leurs nombres sont écrits directement dans le
          DOM par `onFrame`, sans re-rendu React. Elles doublent la liste lue
          plus bas, d'où `aria-hidden`. */}
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}>
        {parts.map((part, i) => <div
          key={part.prepId}
          ref={(el) => { chipRefs.current[i] = el; }}
          className="absolute left-0 top-0 whitespace-nowrap rounded-[clamp(8px,2.1cqw,12px)] border border-line bg-paper/95 px-[clamp(6px,1.8cqw,10px)] py-[clamp(3px,1.1cqw,6px)] text-center shadow-[0_8px_22px_rgba(42,28,35,0.12)] backdrop-blur will-change-transform"
          style={{ opacity: 0 }}
        >
          {/* La taille suit la largeur de la scène (`cqw`): au téléphone, une
              étiquette de 15 px couvrait la portion qu'elle nomme. */}
          <span className="block text-[clamp(9px,2cqw,11px)] leading-tight text-ink-soft">{t(PART_LABEL[part.role])}</span>
          <span className="block text-[clamp(12px,2.7cqw,15px)] font-semibold leading-tight tabular-nums text-ink">
            {/* ⚠️ SANS ENFANT REACT: le nombre est écrit par `onFrame` pendant
                que la portion monte. Un `{grams}` ici serait réécrit par React
                au changement d'objectif et sauterait à la valeur finale le
                temps d'une image. */}
            <span ref={(el) => { gramRefs.current[i] = el; }} /> g
          </span>
          {part.items.length > 1 && <span
            ref={(el) => { splitRefs.current[i] = el; }}
            className="mt-0.5 block text-[clamp(8px,1.8cqw,10px)] leading-tight tabular-nums text-ink-soft"
          />}
        </div>)}
      </div>
    </div>}

    <ul className="sr-only">
      {parts.map((part) => <li key={part.prepId}>
        {t(PART_LABEL[part.role])} {part.grams} g{part.items.length > 1 ? ` (${splitOf(part, part.grams)})` : ""}
      </li>)}
    </ul>

    <div className="mt-2 flex justify-center">
      <div role="group" aria-label={t("home.goal.aria")} className="inline-flex rounded-full border border-line-strong bg-paper p-1">
        {GOALS.map((option) => {
          const active = option.goal === goal;
          return <button
            key={option.goal}
            type="button"
            aria-pressed={active}
            onClick={() => onGoalChange(option.goal)}
            className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors ${active ? "bg-fig-700 text-paper" : "text-ink-soft hover:bg-fig-50 hover:text-ink"}`}
          >
            {t(option.label)}
          </button>;
        })}
      </div>
    </div>
  </div>;
}
