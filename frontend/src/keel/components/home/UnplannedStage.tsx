import React from "react";
import { Check } from "lucide-react";

import { t, type MessageKey } from "../../i18n/t";
import { placeChip } from "./placeChip";
import type { UnplannedFrame, UnplannedScene } from "./unplannedScene";

// LA PHOTO D'UN REPAS IMPRÉVU — LA SCÈNE 3D DE `#imprevu`, CÔTÉ REACT.
//
// Décorative au sens strict: tout ce qu'elle montre est déjà écrit dans la
// section (l'exemple de la pizza, « Sophia l'estime et le comptabilise »), d'où
// `aria-hidden` sur l'ensemble. Chargée par `import()`; si WebGL manque, elle
// disparaît et la colonne garde l'encart de la mesure, comme avant.

const CHIPS = [
  { key: "home.life.scene.pizza", counted: false },
  { key: "home.life.scene.salad", counted: false },
  { key: "home.life.scene.counted", counted: true },
] as const satisfies ReadonlyArray<{ key: MessageKey; counted: boolean }>;

type Status = "loading" | "ready" | "failed";

export default function UnplannedStage() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const chipRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const sceneRef = React.useRef<UnplannedScene | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");

  React.useEffect(() => {
    let cancelled = false;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const onFrame = ({ anchors, chips }: UnplannedFrame) => {
      const stageWidth = canvasRef.current?.clientWidth ?? 0;
      anchors.forEach((point, i) => {
        const chip = chipRefs.current[i];
        if (!chip) return;
        // La dernière se pose sous son ancre (le bas du téléphone), les autres au-dessus.
        const below = CHIPS[i].counted ? chip.offsetHeight : 0;
        placeChip(chip, point.x, point.y + below, stageWidth, chips[i]);
      });
    };
    import("./unplannedScene")
      .then(({ createUnplannedScene }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        sceneRef.current = createUnplannedScene({
          canvas,
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

  if (status === "failed") return null;
  const ready = status === "ready";

  return <div aria-hidden="true" className="@container relative aspect-[5/4] w-full overflow-x-clip">
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 size-full transition-opacity duration-700 ease-out motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}
    />
    <div className="pointer-events-none absolute inset-0">
      {CHIPS.map((chip, i) => <div
        key={chip.key}
        ref={(el) => { chipRefs.current[i] = el; }}
        className={`absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full border px-[clamp(8px,2.2cqw,12px)] py-[clamp(3px,1.1cqw,6px)] text-[clamp(10px,2.3cqw,13px)] font-medium shadow-[0_8px_22px_rgba(42,28,35,0.14)] backdrop-blur ${chip.counted ? "border-fig-700 bg-paper text-fig-700" : "border-line bg-paper/95 text-ink"}`}
        style={{ opacity: 0 }}
      >
        {chip.counted && <Check size={14} aria-hidden="true" />}
        {t(chip.key)}
      </div>)}
    </div>
  </div>;
}
