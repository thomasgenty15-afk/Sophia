import React from "react";

import { t } from "../../i18n/t";
import { boxPartsFor, DEMO_DISHES, memberName, type DemoGoal } from "./planDemoData";
import type { HouseholdMember, HouseholdScene } from "./householdScene";

// LE FOYER EN 3D — TROIS BOÎTES, UNE PAR PERSONNE, SOUS « TU CUISINES POUR
// D'AUTRES PERSONNES ? ».
//
// Décorative: les prénoms et les besoins sont déjà écrits dans la carte du
// foyer à côté, d'où `aria-hidden`. Chargée par `import()`; sans WebGL, elle
// s'efface et la section redevient celle d'avant.

function gramsFor(goal: DemoGoal): readonly [number, number] {
  const [main, side] = boxPartsFor(DEMO_DISHES[0], goal);
  return [main.grams, side.grams];
}

type Status = "loading" | "ready" | "failed";

export default function HouseholdStage() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const sceneRef = React.useRef<HouseholdScene | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");

  React.useEffect(() => {
    let cancelled = false;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Toi et Alex reprennent les grammes des deux objectifs de la démonstration;
    // Lou, végétarienne, sans objectif de poids: une part illustrative, jamais
    // affichée en chiffres.
    const members: HouseholdMember[] = [
      { sticker: { name: memberName("you"), meal: t("home.demo.member.you_note") }, grams: gramsFor("fat_loss"), vegetarian: false },
      { sticker: { name: memberName("alex"), meal: t("home.demo.member.alex_note") }, grams: gramsFor("muscle_gain"), vegetarian: false },
      { sticker: { name: memberName("lou"), meal: t("home.demo.member.lou_note") }, grams: [420, 170], vegetarian: true },
    ];
    import("./householdScene")
      .then(({ createHouseholdScene }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        sceneRef.current = createHouseholdScene({
          canvas,
          members,
          reducedMotion,
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

  return <div aria-hidden="true" className="relative aspect-[16/9] w-full">
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 size-full transition-opacity duration-700 ease-out motion-reduce:transition-none ${status === "ready" ? "opacity-100" : "opacity-0"}`}
    />
  </div>;
}
