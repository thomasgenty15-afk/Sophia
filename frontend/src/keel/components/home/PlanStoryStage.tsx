import React from "react";

import { t } from "../../i18n/t";
import { boxPartsFor, DEMO_DISHES, mealLabel, memberName, type DemoBoxPart, type DemoGoal } from "./planDemoData";
import { placeChip } from "./placeChip";
import type { PlanStoryFrame, PlanStoryScene, StoryGrams } from "./planStoryScene";

// LA SCÈNE DU RÉCIT — « DES COURSES AUX REPAS », CÔTÉ REACT.
//
// Elle lit la position des quatre étapes de la liste (`stepRefs`) et en tire
// une progression CONTINUE entre 0 et 3: l'étape `i` est atteinte quand son
// point d'ancrage franchit la ligne de lecture (le milieu de l'écran sur
// ordinateur, juste sous la scène collée en haut sur téléphone). La scène 3D
// ne connaît que ce nombre.
//
// ⚠️ CHARGÉE PAR `import()`, COMME LA BOÎTE DU HÉROS. Si WebGL manque, la
// scène disparaît et la liste reste: elle porte seule tout le contenu, la 3D
// n'en montre aucun qui ne soit déjà écrit à côté.

const [DINNER, LUNCH] = DEMO_DISHES;

const PART_LABEL = {
  main: "home.demo.box.main",
  separable_side: "home.demo.box.side",
} as const;

function gramsFor(goal: DemoGoal): StoryGrams {
  const [main, side] = boxPartsFor(DINNER, goal);
  return [main.grams, side.grams];
}

type Status = "loading" | "ready" | "failed";

export interface PlanStoryStageProps {
  goal: DemoGoal;
  stepRefs: React.RefObject<Array<HTMLElement | null>>;
  onActive: (index: number) => void;
  onStatus: (ready: boolean) => void;
}

export default function PlanStoryStage({ goal, stepRefs, onActive, onStatus }: PlanStoryStageProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const chipRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const sceneRef = React.useRef<PlanStoryScene | null>(null);
  const goalRef = React.useRef(goal);
  const progressRef = React.useRef(0);
  const [status, setStatus] = React.useState<Status>("loading");
  const parts: DemoBoxPart[] = boxPartsFor(DINNER, goal);

  // ── La progression, lue sur la page.
  React.useEffect(() => {
    let frame = 0;
    let lastActive = -1;
    const compute = () => {
      frame = 0;
      const steps = (stepRefs.current ?? []).filter((el): el is HTMLElement => el !== null);
      if (steps.length < 2) return;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const stage = stageRef.current?.getBoundingClientRect();
      const line = wide || !stage
        ? window.innerHeight * 0.5
        : stage.bottom + (window.innerHeight - stage.bottom) * 0.3;
      // L'ancre d'une étape: son milieu quand elle est centrée (ordinateur),
      // son titre quand elle se lit sous la scène (téléphone).
      const anchors = steps.map((el) => {
        const r = el.getBoundingClientRect();
        return wide ? r.top + r.height / 2 : r.top + 56;
      });
      let p = 0;
      if (line >= anchors[anchors.length - 1]) p = anchors.length - 1;
      else {
        for (let i = 0; i < anchors.length - 1; i++) {
          if (line >= anchors[i] && line < anchors[i + 1]) {
            p = i + (line - anchors[i]) / (anchors[i + 1] - anchors[i]);
            break;
          }
        }
      }
      progressRef.current = p;
      sceneRef.current?.setProgress(p);
      const active = Math.round(p);
      if (active !== lastActive) {
        lastActive = active;
        onActive(active);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(compute); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    compute();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [stepRefs, onActive]);

  // ── La scène.
  React.useEffect(() => {
    let cancelled = false;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const onFrame = ({ anchors, chips }: PlanStoryFrame) => {
      const stageWidth = canvasRef.current?.clientWidth ?? 0;
      anchors.forEach((point, i) => {
        const chip = chipRefs.current[i];
        if (!chip) return;
        placeChip(chip, point.x, point.y, stageWidth, chips);
      });
    };
    import("./planStoryScene")
      .then(({ createPlanStoryScene }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const you = memberName("you");
        const scene = createPlanStoryScene({
          canvas,
          grams: gramsFor(goalRef.current),
          stickers: [
            { name: you, meal: mealLabel(DINNER.day, DINNER.slot) },
            { name: you, meal: mealLabel(LUNCH.day, LUNCH.slot) },
          ],
          reducedMotion,
          onFrame,
          onReady: () => {
            if (cancelled) return;
            setStatus("ready");
            onStatus(true);
          },
        });
        scene.setProgress(progressRef.current);
        sceneRef.current = scene;
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("failed");
        onStatus(false);
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [onStatus]);

  React.useEffect(() => {
    goalRef.current = goal;
    sceneRef.current?.setGrams(gramsFor(goal));
  }, [goal]);

  if (status === "failed") return null;
  const ready = status === "ready";

  // ⚠️ COLLÉE EN HAUT SUR TÉLÉPHONE, SOUS L’EN-TÊTE (`top-[5.9rem]`, ses 95 px
  // hauteur mesurée à 375 px): la liste défile dessous, d'où le fond plein de
  // la section. Sur ordinateur, elle tient la colonne de gauche, centrée dans
  // la hauteur de l'écran (≈ 30 rem de haut à 1440 px), jamais sous l'en-tête.
  return <div
    ref={stageRef}
    className="sticky top-[5.9rem] z-10 -mx-5 bg-paper-2 px-5 pb-2 sm:-mx-8 sm:px-8 lg:top-[max(7rem,calc(50svh-15rem))] lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0"
  >
    <div className="@container relative aspect-[4/3] w-full lg:aspect-[5/4]">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 size-full transition-opacity duration-700 ease-out motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {parts.map((part, i) => <div
          key={part.prepId}
          ref={(el) => { chipRefs.current[i] = el; }}
          className="absolute left-0 top-0 whitespace-nowrap rounded-[clamp(8px,2.1cqw,12px)] border border-line bg-paper/95 px-[clamp(6px,1.8cqw,10px)] py-[clamp(3px,1.1cqw,6px)] text-center shadow-[0_8px_22px_rgba(42,28,35,0.12)] backdrop-blur will-change-transform"
          style={{ opacity: 0 }}
        >
          <span className="block text-[clamp(9px,2cqw,11px)] leading-tight text-ink-soft">{t(PART_LABEL[part.role])}</span>
          <span className="block text-[clamp(12px,2.7cqw,15px)] font-semibold leading-tight tabular-nums text-ink">{part.grams} g</span>
        </div>)}
      </div>
    </div>
  </div>;
}
