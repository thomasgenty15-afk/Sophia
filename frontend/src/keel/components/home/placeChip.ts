/**
 * Pose une étiquette HTML au-dessus d'un point projeté d'une scène 3D, centrée
 * sur lui — mais JAMAIS hors de la largeur de la scène.
 *
 * ⚠️ MESURÉ LE 2026-09-23 À 375 PX: ancrée sur le téléphone de `#imprevu`,
 * « Comptabilisé dans ton suivi » sortait de l'écran à droite. Une étiquette
 * qui déborde coupe son texte, et peut donner à toute la page un défilement
 * horizontal.
 */
export function placeChip(chip: HTMLElement, x: number, y: number, stageWidth: number, appear = 1): void {
  const half = chip.offsetWidth / 2;
  const margin = 4;
  const cx = half * 2 + margin * 2 >= stageWidth
    ? stageWidth / 2
    : Math.min(Math.max(x, half + margin), stageWidth - half - margin);
  // L'APPARITION: l'étiquette monte de quelques pixels et « clique » en place
  // (un léger dépassement d'échelle), au lieu d'un simple fondu. Même geste
  // pour toutes les étiquettes de la page.
  const v = Math.min(1, Math.max(0, appear));
  const lift = (1 - v) * 10;
  const back = 1 + 2.4 * (v - 1) ** 3 + 1.4 * (v - 1) ** 2;
  const scale = 0.9 + 0.1 * back;
  chip.style.transform = `translate3d(${cx.toFixed(1)}px, ${(y + lift).toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
  chip.style.opacity = Math.min(1, v * 1.6).toFixed(3);
}
