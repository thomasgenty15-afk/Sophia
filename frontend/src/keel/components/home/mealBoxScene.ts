import { Group, MathUtils, Vector3, PerspectiveCamera } from "three";

import {
  contactShadow,
  createStudio,
  foodMaterials,
  glassMaterial,
  herbKinds,
  lidMaterial,
  makeGlassBox,
  makeGrainBed,
  makeLid,
  makePile,
  mulberry32,
  roastTrayKinds,
  smoothstep,
  type Fill,
  type StickerText,
} from "./mealKit";

// LA BOÎTE DU HÉROS, EN 3D — LE RENDU, SANS REACT.
//
// ── CE QU'ELLE MONTRE ──────────────────────────────────────────────────────
// Le contenant du repas de démonstration (`DEMO_DISHES[0]`), rangé comme le
// produit le range depuis le chantier « féculent à côté » (lot C): UN grand
// compartiment pour la casserole principale — poulet et légumes rôtis
// ensemble, donc mélangés — et un petit pour le boulgour, cuit à part. La
// HAUTEUR de chaque compartiment suit ses grammes (`planDemoData`), et rien
// d'autre: la scène ne connaît aucun chiffre qu'on ne lui a pas donné.
//
// ⚠️ LES HAUTEURS SONT COMPARABLES D'UN OBJECTIF À L'AUTRE, PAS D'UN
// COMPARTIMENT À L'AUTRE. Chaque compartiment a sa capacité (à peu près au
// prorata de sa surface); les grammes exacts sont écrits en HTML à côté.

/** Les grammes de la boîte: [casserole principale, féculent à côté]. */
export type BoxGrams = readonly [number, number];

export interface MealBoxFrame {
  /** Le point au-dessus de chaque compartiment, en px CSS depuis le coin haut-gauche du canvas. */
  anchors: ReadonlyArray<{ x: number; y: number }>;
  /** Les grammes affichables, suivis pendant l'animation (bornés entre l'ancien et le nouveau). */
  grams: BoxGrams;
  /** 1 = couvercle ouvert, 0 = boîte fermée (au tout début de l'intro). */
  openness: number;
  /** L'apparition de chaque étiquette (0 à 1), au moment où sa portion commence à monter. */
  appear: readonly [number, number];
}

export interface MealBoxSceneOptions {
  canvas: HTMLCanvasElement;
  grams: BoxGrams;
  sticker: StickerText;
  reducedMotion: boolean;
  onFrame: (frame: MealBoxFrame) => void;
  onReady: () => void;
}

export interface MealBoxScene {
  setGrams(grams: BoxGrams): void;
  dispose(): void;
}

// ── LA GÉOMÉTRIE DU CONTENANT (unités de scène, ~ 1 = 10 cm) ─────────────────
const W = 3.0;
const D = 1.36;
const H = 0.92;
const T = 0.045;
const R = 0.16;
const TD = 0.04;
const B = 0.05;
const WI = W - 2 * T;
const DI = D - 2 * T;
/** Le grand compartiment prend ~63 % de la largeur: c'est le gros de l'assiette. */
const MAIN_W = (WI - TD) * 0.63;
const SIDE_W = WI - TD - MAIN_W;
const MAIN_X = -WI / 2 + MAIN_W / 2;
const DIVIDER_X = -WI / 2 + MAIN_W + TD / 2;
const SIDE_X = WI / 2 - SIDE_W / 2;
const FMAX = H - B - 0.15;
/** Les grammes qui rempliraient chaque compartiment jusqu'à `FMAX`. */
const CAPACITY = [520, 290] as const;
const LID_T = 0.1;

interface Portion {
  fill: Fill;
  h: number;
  v: number;
  target: number;
  shownFrom: number;
  shownTo: number;
}

export function createMealBoxScene(options: MealBoxSceneOptions): MealBoxScene {
  const { canvas, reducedMotion } = options;
  const studio = createStudio(canvas, 2.2);
  const { renderer, scene } = studio;
  const camera = new PerspectiveCamera(24, 1, 0.1, 60);
  const lookAt = new Vector3(0, 0.5, -0.18);

  const model = new Group();
  scene.add(model);
  const blob = contactShadow(W * 1.3, D * 1.9);
  const lidBlob = contactShadow(W * 1.15, 0.5);
  lidBlob.position.z = -(D / 2 + 0.2);
  const lidBlobMaterial = lidBlob.material as { opacity: number };
  model.add(blob, lidBlob);

  model.add(makeGlassBox({ w: W, d: D, h: H, wall: T, radius: R, floor: B, dividers: [DIVIDER_X], dividerThickness: TD }, glassMaterial()));

  // ── Les deux compartiments, dans l'ordre des lignes de la boîte.
  const materials = foodMaterials();
  const rng = mulberry32(20260923);
  const mainArea = { x: MAIN_X, z: 0, w: MAIN_W, d: DI };
  const main = makePile(model, rng, mainArea, B, FMAX, 0.18, roastTrayKinds(materials), materials.food);
  // Quelques brins d'herbe, clairsemés: ils montent avec la portion et ne se
  // voient qu'en surface.
  const herbs = makePile(model, rng, mainArea, B, FMAX, 0.11, herbKinds(), materials.food, 0.12);
  const side = makeGrainBed(model, rng, { x: SIDE_X, z: 0, w: SIDE_W, d: DI }, B, materials.food, 1100);
  const portions: Portion[] = [main, side].map((fill) => ({ fill, h: -0.2, v: 0, target: 0, shownFrom: 0, shownTo: 0 }));

  // ── Le couvercle et son étiquette.
  const lid = makeLid(
    { w: W + 0.06, d: D + 0.06, radius: R + 0.03, thickness: LID_T, stickerWidth: 1.46, stickerAt: [-0.5, -0.3] },
    lidMaterial(),
    options.sticker,
    renderer.capabilities.getMaxAnisotropy(),
  );
  model.add(lid.group);
  lid.whenFontsReady(() => { if (!disposed) dirty = true; });

  // ── L'état animé.
  // L'intro: la boîte arrive FERMÉE, le couvercle s'ouvre, puis les portions
  // montent jusqu'à leurs grammes — les étiquettes comptent avec elles.
  options.grams.forEach((grams, i) => {
    const portion = portions[i];
    portion.target = (grams / CAPACITY[i]) * FMAX;
    portion.shownTo = grams;
    if (reducedMotion) {
      portion.h = portion.target;
      portion.shownFrom = grams;
    }
  });

  let openness = reducedMotion ? 1 : 0;
  let opennessV = 0;
  let lidSettled = reducedMotion;
  let yaw = -0.36;
  let pitch = 0;
  let pointerX = 0;
  let pointerY = 0;
  let scrollTurn = 0;
  let introT = reducedMotion ? 10 : 0;
  let dirty = true;
  let disposed = false;
  let visible = true;
  let raf = 0;
  let last = performance.now();
  let width = 1;
  let height = 1;
  let readySent = false;
  const LID_OPENS_AT = 0.25;
  const introDelays = [0.8, 1.0];
  const introArmed = [reducedMotion, reducedMotion];

  // Ouvert, le couvercle est posé DEBOUT derrière la boîte, légèrement penché
  // en arrière: il fait fond au verre (qui sans lui ne se voit pas sur la page)
  // et son étiquette reste lisible au-dessus des portions. Fermé, il est à plat
  // sur le bord. Entre les deux, il décrit un arc au lieu de traverser la paroi.
  //
  // ⛔ IL NE SE REFERME PAS AU DÉFILEMENT. Ça a été essayé le 2026-09-23: un
  // défilement de 100 px suffisait à rabattre le couvercle sur les portions au
  // moment même où l'on venait de changer d'objectif pour les regarder.
  const lidClosed = { y: H - 0.005, z: 0, rx: 0 };
  const lidOpen = { y: 0.74, z: -(D / 2 + 0.2), rx: Math.PI / 2 - 0.2 };

  function layout() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Le cadre est dessiné pour du 5:4. Plus étroit (téléphone), la caméra
    // recule: la boîte et le couvercle restent entiers dans le champ.
    const distance = 7.0 / Math.min(1, camera.aspect / 1.25);
    const elevation = MathUtils.degToRad(22);
    camera.position.set(0, lookAt.y + distance * Math.sin(elevation), distance * Math.cos(elevation));
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
    dirty = true;
  }

  /** Le défilement fait tourner la boîte d'un quart de radian au plus: un effet de profondeur, rien de caché. */
  function readScroll() {
    const rect = canvas.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    scrollTurn = MathUtils.clamp((window.innerHeight / 2 - center) / window.innerHeight, -0.5, 0.5);
  }

  function onPointer(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    pointerY = (event.clientY / window.innerHeight) * 2 - 1;
  }

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(canvas);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  intersection.observe(canvas);
  window.addEventListener("scroll", readScroll, { passive: true });
  if (!reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });
  layout();
  readScroll();

  const anchor = new Vector3();
  const anchors = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  const shownGrams: [number, number] = [0, 0];
  const appear: [number, number] = [0, 0];
  const anchorX = [MAIN_X, SIDE_X];

  function step(dt: number) {
    introT += dt;
    let moving = false;

    // Les portions: un ressort légèrement amorti par compartiment.
    portions.forEach((portion, i) => {
      if (!introArmed[i]) {
        if (introT < introDelays[i]) return;
        introArmed[i] = true;
      }
      if (reducedMotion) {
        if (portion.h !== portion.target) { portion.h = portion.target; moving = true; }
        return;
      }
      const a = 70 * (portion.target - portion.h) - 13 * portion.v;
      portion.v += a * dt;
      portion.h += portion.v * dt;
      if (Math.abs(portion.v) > 1e-4 || Math.abs(portion.target - portion.h) > 1e-4) moving = true;
      else { portion.h = portion.target; portion.v = 0; }
    });

    // Le couvercle: un ressort un peu SOUS-amorti — il dépasse d'un rien sa
    // position ouverte et revient s'y poser, comme un couvercle qu'on lâche.
    if (!lidSettled && introT >= LID_OPENS_AT) {
      const a = 30 * (1 - openness) - 7.2 * opennessV;
      opennessV += a * dt;
      openness = Math.min(1.08, openness + opennessV * dt);
      if (Math.abs(1 - openness) < 5e-4 && Math.abs(opennessV) < 5e-3) {
        openness = 1;
        opennessV = 0;
        lidSettled = true;
      }
      moving = true;
    }
    const o = openness;
    // L'arc est borné à [0, 1]: pendant le petit dépassement, le couvercle
    // bascule un peu plus en arrière, il ne s'enfonce pas dans le sol.
    const arc = Math.sin(Math.PI * Math.min(1, o)) * 0.42;
    lid.group.position.set(0, MathUtils.lerp(lidClosed.y, lidOpen.y, o) + arc, MathUtils.lerp(lidClosed.z, lidOpen.z, o));
    lid.group.rotation.set(MathUtils.lerp(lidClosed.rx, lidOpen.rx, o), 0, 0);
    lidBlobMaterial.opacity = smoothstep(0.6, 1, o);

    // L'orientation: la souris l'incline, le défilement la tourne un peu, et,
    // l'intro finie, la boîte « respire » — une oscillation lente et à peine
    // visible, pour qu'elle ne soit jamais tout à fait figée.
    const breathe = reducedMotion ? 0 : smoothstep(2.2, 4, introT);
    const targetYaw = -0.36 + pointerX * 0.2 + scrollTurn * 0.3 + Math.sin(introT * 0.35) * 0.04 * breathe;
    const targetPitch = pointerY * 0.05 + Math.sin(introT * 0.27) * 0.012 * breathe;
    yaw += (targetYaw - yaw) * Math.min(1, dt * 3.2);
    pitch += (targetPitch - pitch) * Math.min(1, dt * 3.2);
    if (reducedMotion) { yaw = targetYaw; pitch = targetPitch; }
    model.rotation.set(pitch, yaw, 0);
    if (breathe > 0 || Math.abs(targetYaw - yaw) > 1e-4 || Math.abs(targetPitch - pitch) > 1e-4) moving = true;

    // Une image n'est redessinée que si quelque chose a bougé.
    if (moving) dirty = true;
  }

  function report() {
    model.updateMatrixWorld();
    portions.forEach((portion, i) => {
      anchor.set(anchorX[i], B + Math.max(0, portion.h) + portion.fill.topOffset + 0.08, DI * 0.14);
      anchor.applyMatrix4(model.matrixWorld).project(camera);
      anchors[i].x = ((anchor.x + 1) / 2) * width;
      anchors[i].y = ((1 - anchor.y) / 2) * height;
      const grams = (Math.max(0, portion.h) / FMAX) * CAPACITY[i];
      const lo = Math.min(portion.shownFrom, portion.shownTo);
      const hi = Math.max(portion.shownFrom, portion.shownTo);
      shownGrams[i] = Math.abs(portion.target - portion.h) < 1e-3
        ? portion.shownTo
        : Math.round(MathUtils.clamp(grams, lo, hi));
      appear[i] = reducedMotion
        ? 1
        : smoothstep(0.8, 1, Math.min(1, openness)) * smoothstep(introDelays[i] + 0.05, introDelays[i] + 0.45, introT);
    });
    options.onFrame({ anchors, grams: shownGrams, openness, appear });
  }

  function frame(now: number) {
    if (disposed) return;
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    // Le temps écoulé est intégré par petits pas: un téléphone qui saute des
    // images ne ralentit pas l'animation, et les ressorts restent stables.
    let remaining = Math.min(0.5, Math.max(0, (now - last) / 1000));
    last = now;
    while (remaining > 1e-6) {
      const dt = Math.min(1 / 60, remaining);
      step(dt);
      remaining -= dt;
    }
    for (const portion of portions) portion.fill.update(portion.h);
    herbs.update(portions[0].h + 0.05);
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    report();
    if (!readySent) {
      readySent = true;
      options.onReady();
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    setGrams(grams: BoxGrams) {
      portions.forEach((portion, i) => {
        portion.shownFrom = portion.shownTo;
        portion.shownTo = grams[i];
        portion.target = (grams[i] / CAPACITY[i]) * FMAX;
      });
      dirty = true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("pointermove", onPointer);
      studio.dispose();
    },
  };
}
