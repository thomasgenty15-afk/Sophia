import {
  Color,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  MathUtils,
  PerspectiveCamera,
  SphereGeometry,
  Vector3,
  type Material,
  type Object3D,
} from "three";

import { makeBulgurPouch, makeCarrot, makeChickenTray, makeLemon, makePepper } from "./rawProduce";

import {
  BULGUR,
  CARROT,
  CHICKEN,
  chickenGeometry,
  contactShadow,
  easeOutBack,
  easeOutCubic,
  createStudio,
  foodMaterials,
  glassMaterial,
  herbKinds,
  lidMaterial,
  lumpy,
  makeGlassBox,
  makeGrainBed,
  makeLid,
  makePile,
  makePot,
  makeRoastingDish,
  mulberry32,
  roastTrayKinds,
  smoothstep,
  type Fill,
  type Lid,
  type StickerText,
} from "./mealKit";

// LE RÉCIT DU PLANNING, EN 3D — « DES COURSES AUX REPAS », AU DÉFILEMENT.
//
// ── CE QU'IL RACONTE ───────────────────────────────────────────────────────
// Les quatre étapes de la section, dans l'ordre vécu, sur UN seul plateau:
//   0 · Tes courses  — les ingrédients crus, posés à plat.
//   1 · Ta cuisine   — ils partent dans DEUX récipients: le plat à rôtir
//                      (poulet et légumes, ensemble) et la casserole (le
//                      boulgour, à part).
//   2 · Tes boîtes   — le plat et la casserole se vident dans deux boîtes:
//                      la casserole principale d'un côté, le boulgour à côté.
//   3 · Tes repas    — les couvercles se ferment, chacun avec son étiquette.
//
// ⚠️ L'ÉTAT EST UNE FONCTION DU DÉFILEMENT, PAS DU TEMPS. `setProgress(p)`
// reçoit une position continue entre 0 et 3; tout ce qui est dessiné en
// dépend, et remonter la page rejoue le récit à l'envers. Il n'y a ni
// minuterie ni animation qui « part toute seule »: seul l'objectif (les
// grammes) est amorti par un ressort, parce qu'il change d'un coup.
//
// ⚠️ TOUT EST À L'ÉCHELLE DE LA BOÎTE DU HÉROS (1 ≈ 10 cm): les morceaux de
// poulet ont la même taille ici et là-haut, et la caméra recule au lieu de
// rapetisser les objets.

/** [casserole principale, féculent à côté] — les grammes d'UNE boîte. */
export type StoryGrams = readonly [number, number];

export interface PlanStoryFrame {
  /** Le point au-dessus des deux compartiments de la première boîte, en px CSS. */
  anchors: ReadonlyArray<{ x: number; y: number }>;
  /** Visibilité des étiquettes de grammes (0 à 1): elles ne vivent qu'à l'étape des boîtes. */
  chips: number;
}

export interface PlanStorySceneOptions {
  canvas: HTMLCanvasElement;
  grams: StoryGrams;
  stickers: readonly [StickerText, StickerText];
  reducedMotion: boolean;
  onFrame: (frame: PlanStoryFrame) => void;
  onReady: () => void;
}

export interface PlanStoryScene {
  setProgress(p: number): void;
  setGrams(grams: StoryGrams): void;
  dispose(): void;
}

// ── LA BOÎTE (mêmes cotes que le héros) ──────────────────────────────────────
const W = 3.0;
const D = 1.36;
const H = 0.92;
const T = 0.045;
const R = 0.16;
const TD = 0.04;
const B = 0.05;
const WI = W - 2 * T;
const DI = D - 2 * T;
const MAIN_W = (WI - TD) * 0.63;
const SIDE_W = WI - TD - MAIN_W;
const MAIN_X = -WI / 2 + MAIN_W / 2;
const DIVIDER_X = -WI / 2 + MAIN_W + TD / 2;
const SIDE_X = WI / 2 - SIDE_W / 2;
const FMAX = H - B - 0.15;
const CAPACITY = [520, 290] as const;

// ── LE PLAT À RÔTIR ET LA CASSEROLE ──────────────────────────────────────────
const DISH = { x: -1.45, z: -1.1, w: 3.0, d: 2.05, h: 0.58, wall: 0.11, radius: 0.38, floor: 0.1 };
const DISH_FULL = 0.36;
const POT = { x: 1.85, z: -1.15, r: 0.95, h: 0.92, wall: 0.07, floor: 0.08 };
const POT_FULL = 0.55;

// ── OÙ SONT LES CHOSES, ÉTAPE PAR ÉTAPE ──────────────────────────────────────
// Côte à côte pour le remplissage; décalées en profondeur une fois fermées —
// celle de ce soir devant, celle de demain derrière.
const BOX_A = { from: new Vector3(-1.62, 0, 1.45), to: new Vector3(-0.95, 0, 2.1), yaw: 0.18 };
const BOX_B = { from: new Vector3(1.62, 0, 1.45), to: new Vector3(1.25, 0, 0.7), yaw: -0.1 };

interface CameraKey {
  target: Vector3;
  elevation: number;
  distance: number;
  azimuth: number;
}

// Du dessus pour les courses (une photo à plat), puis de trois quarts de plus
// en plus bas: la cuisine, les boîtes, et les boîtes fermées de près.
// ⚠️ LA DERNIÈRE ÉTAPE EST VUE D'ASSEZ HAUT (40°): les étiquettes sont sur le
// dessus des couvercles, et à 19° elles se lisaient de biais, illisibles.
const CAMERA: readonly CameraKey[] = [
  // Étape 1 vue de plus près: le détail des légumes (anneaux de la carotte,
  // lobes du poivron, pores du citron) doit se lire.
  { target: new Vector3(0.12, 0, 1.12), elevation: 58, distance: 10.9, azimuth: 0 },
  { target: new Vector3(0.15, 0.3, -1.05), elevation: 34, distance: 12.0, azimuth: -0.08 },
  { target: new Vector3(0, 0.35, 0.7), elevation: 30, distance: 12.8, azimuth: 0 },
  { target: new Vector3(0.25, 0.4, 1.45), elevation: 40, distance: 10.9, azimuth: 0.06 },
];

/**
 * Un niveau de remplissage entre vide et plein. ⚠️ « Vide » est SOUS le fond
 * (-0,25): à 0, la première couche de morceaux serait encore à moitié poussée.
 */
function level(full: number, t: number): number {
  return MathUtils.lerp(-0.25, full, t);
}

function backOut(t: number): number {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/** Un ingrédient cru: sa place sur le plan de travail, et le récipient où il part. */
interface Ingredient {
  object: Object3D;
  home: Vector3;
  homeYaw: number;
  into: "dish" | "pot";
  order: number;
}

function buildIngredients(rng: () => number, anisotropy: number): Ingredient[] {
  const out: Ingredient[] = [];
  let order = 0;

  // La barquette de hauts de cuisse, filmée, et plus bas le sachet de
  // boulgour: leur détail est dans `rawProduce.ts`, comme celui des légumes.
  out.push({ object: makeChickenTray(501, anisotropy), home: new Vector3(-1.72, 0, 1.2), homeYaw: 0.12, into: "dish", order: order++ });

  // Les carottes, avec leurs fanes, et les deux poivrons: le détail est dans
  // `rawProduce.ts` (profil, anneaux, lobes, queue, collerette).
  for (let i = 0; i < 3; i++) {
    const carrot = makeCarrot(301 + i);
    carrot.position.y = 0.12;
    out.push({ object: carrot, home: new Vector3(-0.3 + i * 0.12, 0.12, 1.0 + i * 0.28), homeYaw: 0.35 + (rng() - 0.5) * 0.2, into: "dish", order: order++ });
  }
  ([["#C0281D", new Vector3(1.85, 0.36, 0.78)], ["#F0B21C", new Vector3(2.32, 0.36, 1.58)]] as const).forEach(([color, at], i) => {
    out.push({ object: makePepper(color, 401 + i), home: at, homeYaw: rng() * Math.PI, into: "dish", order: order++ });
  });

  // Le sachet de boulgour, debout, et le citron: ils partent dans la casserole.
  out.push({ object: makeBulgurPouch(anisotropy), home: new Vector3(0.75, 0, 0.4), homeYaw: -0.2, into: "pot", order: order++ });

  const lemon = makeLemon();
  out.push({ object: lemon, home: new Vector3(1.3, 0.2, 1.6), homeYaw: 0.6, into: "pot", order: order++ });

  return out;
}

interface BoxRig {
  group: Group;
  main: Fill;
  herbs: Fill;
  side: Fill;
  lid: Lid;
}

function buildBox(rng: () => number, food: ReturnType<typeof foodMaterials>, glass: Material, lidMat: Material, sticker: StickerText, anisotropy: number): BoxRig {
  const group = new Group();
  group.add(contactShadow(W * 1.3, D * 1.9));
  group.add(makeGlassBox({ w: W, d: D, h: H, wall: T, radius: R, floor: B, dividers: [DIVIDER_X], dividerThickness: TD }, glass));
  const mainArea = { x: MAIN_X, z: 0, w: MAIN_W, d: DI };
  const main = makePile(group, rng, mainArea, B, FMAX, 0.18, roastTrayKinds(food), food.food);
  const herbs = makePile(group, rng, mainArea, B, FMAX, 0.11, herbKinds(), food.food, 0.12);
  const side = makeGrainBed(group, rng, { x: SIDE_X, z: 0, w: SIDE_W, d: DI }, B, food.food, 900);
  const lid = makeLid(
    { w: W + 0.06, d: D + 0.06, radius: R + 0.03, thickness: 0.1, stickerWidth: 1.46, stickerAt: [-0.5, 0.05] },
    lidMat,
    sticker,
    anisotropy,
  );
  group.add(lid.group);
  return { group, main, herbs, side, lid };
}

export function createPlanStoryScene(options: PlanStorySceneOptions): PlanStoryScene {
  const { canvas, reducedMotion } = options;
  const studio = createStudio(canvas, 5.5);
  const { renderer, scene } = studio;
  const camera = new PerspectiveCamera(24, 1, 0.1, 80);
  const rng = mulberry32(20260924);
  const food = foodMaterials();
  const glass = glassMaterial();
  const lidMat = lidMaterial();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  // ── Les ingrédients crus.
  const ingredients = buildIngredients(rng, anisotropy);
  const groundShadows = new Group();
  for (const ing of ingredients) {
    scene.add(ing.object);
    const shadow = contactShadow(ing.into === "pot" ? 1.3 : 1.6, 1.0, 0.7);
    shadow.position.set(ing.home.x, 0.002, ing.home.z);
    groundShadows.add(shadow);
  }
  scene.add(groundShadows);

  // ── Le plat à rôtir et la casserole, remplis.
  const dish = makeRoastingDish(DISH);
  dish.position.set(DISH.x, 0, DISH.z);
  const dishArea = { x: 0, z: 0, w: DISH.w - 2 * DISH.wall - 0.04, d: DISH.d - 2 * DISH.wall - 0.04 };
  const dishFill = makePile(dish, rng, dishArea, DISH.floor, DISH_FULL, 0.18, roastTrayKinds(food), food.food);
  const dishHerbs = makePile(dish, rng, dishArea, DISH.floor, DISH_FULL, 0.11, herbKinds(), food.food, 0.12);
  const dishShadow = contactShadow(DISH.w * 1.25, DISH.d * 1.5);
  dish.add(dishShadow);
  const pot = makePot(POT);
  pot.position.set(POT.x, 0, POT.z);
  const potFill = makeGrainBed(pot, rng, { x: 0, z: 0, w: (POT.r - POT.wall) * 2 - 0.04, d: (POT.r - POT.wall) * 2 - 0.04, round: true }, POT.floor, food.food, 1400);
  pot.add(contactShadow(POT.r * 2.6, POT.r * 2.3));
  scene.add(dish, pot);

  // ── Les deux boîtes.
  const boxes = [
    buildBox(rng, food, glass, lidMat, options.stickers[0], anisotropy),
    buildBox(rng, food, glass, lidMat, options.stickers[1], anisotropy),
  ];
  for (const box of boxes) {
    scene.add(box.group);
    box.lid.whenFontsReady(() => { if (!disposed) dirty = true; });
  }

  // ── Les portions en vol, du plat et de la casserole vers les boîtes.
  // C'est le lien que l'œil suit à l'étape des boîtes: ce qui quitte le plat
  // est ce qui arrive dans la boîte. Une vingtaine de morceaux, chacun sur son
  // arc, lâchés l'un après l'autre pendant que les niveaux s'échangent.
  interface Flyer { mesh: InstancedMesh; index: number; from: Vector3; to: Vector3; start: number; spin: Euler; size: number }
  const flyers: Flyer[] = [];
  const flyChicken = new InstancedMesh(chickenGeometry(7), food.chicken, 8);
  const flyCarrot = new InstancedMesh(lumpy(new CylinderGeometry(0.074, 0.07, 0.048, 16, 1), 0.12, 30), food.food, 6);
  const flyBulgur = new InstancedMesh(lumpy(new SphereGeometry(0.12, 12, 9), 0.18, 20).scale(1.2, 0.55, 1), food.food, 8);
  const flyColor = new Color();
  const kinds = [
    { mesh: flyChicken, palette: CHICKEN },
    { mesh: flyCarrot, palette: CARROT },
    { mesh: flyBulgur, palette: BULGUR },
  ];
  const cursor = [0, 0, 0];
  [BOX_A, BOX_B].forEach((rig, b) => {
    const plan: Array<{ kind: number; side: boolean }> = [
      { kind: 0, side: false }, { kind: 1, side: false }, { kind: 0, side: false },
      { kind: 2, side: true }, { kind: 0, side: false }, { kind: 1, side: false },
      { kind: 2, side: true }, { kind: 0, side: false }, { kind: 1, side: false },
      { kind: 2, side: true }, { kind: 2, side: true },
    ];
    plan.forEach(({ kind, side }, j) => {
      const k = kinds[kind];
      const index = cursor[kind]++;
      if (index >= k.mesh.count) return;
      k.mesh.setColorAt(index, flyColor.set(k.palette[Math.floor(rng() * k.palette.length)]));
      const from = side
        ? new Vector3(POT.x + (rng() - 0.5) * 0.8, 0.55, POT.z + (rng() - 0.5) * 0.8)
        : new Vector3(DISH.x + (rng() - 0.5) * 2.2, 0.4, DISH.z + (rng() - 0.5) * 1.3);
      const to = side
        ? new Vector3(rig.from.x + SIDE_X + (rng() - 0.5) * 0.5, 0.5, rig.from.z + (rng() - 0.5) * 0.5)
        : new Vector3(rig.from.x + MAIN_X + (rng() - 0.5) * 1.1, 0.55, rig.from.z + (rng() - 0.5) * 0.6);
      flyers.push({
        mesh: k.mesh,
        index,
        from,
        to,
        start: 1.36 + ((j * 2 + b) / (plan.length * 2)) * 0.42 + rng() * 0.02,
        spin: new Euler((rng() - 0.5) * 6, (rng() - 0.5) * 6, (rng() - 0.5) * 6),
        size: 0.9 + rng() * 0.25,
      });
    });
  });
  for (const { mesh } of kinds) {
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }
  const flyMatrix = new Matrix4();
  const flyAt = new Vector3();
  const flyQuat = new Quaternion();
  const flyEuler = new Euler();
  const flyScale = new Vector3();
  const FLIGHT = 0.2;
  function updateFlyers() {
    for (const f of flyers) {
      const t = (p - f.start) / FLIGHT;
      if (t <= 0 || t >= 1) {
        flyMatrix.makeScale(0, 0, 0);
      } else {
        const e = smoothstep(0, 1, t);
        flyAt.lerpVectors(f.from, f.to, e);
        flyAt.y += Math.sin(Math.PI * t) * 1.4;
        flyQuat.setFromEuler(flyEuler.set(f.spin.x * t, f.spin.y * t, f.spin.z * t));
        // Il se pose en se fondant dans la portion qui monte.
        flyScale.setScalar(f.size * (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15));
        flyMatrix.compose(flyAt, flyQuat, flyScale);
      }
      f.mesh.setMatrixAt(f.index, flyMatrix);
    }
    for (const { mesh } of kinds) mesh.instanceMatrix.needsUpdate = true;
  }

  // ── L'état.
  let p = 0;
  let pTarget = 0;
  const goalH = options.grams.map((g, i) => (g / CAPACITY[i]) * FMAX);
  const goalTarget = [...goalH];
  const goalV = [0, 0];
  let pointerX = 0;
  let pointerSmoothed = 0;
  let dirty = true;
  let disposed = false;
  let visible = false;
  let raf = 0;
  let last = performance.now();
  let width = 1;
  let height = 1;
  let readySent = false;

  function layout() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    dirty = true;
  }

  const eye = new Vector3();
  const target = new Vector3();
  function placeCamera() {
    const i = Math.min(CAMERA.length - 2, Math.floor(p));
    const t = smoothstep(0, 1, p - i);
    const a = CAMERA[i];
    const b = CAMERA[i + 1];
    target.lerpVectors(a.target, b.target, t);
    const elevation = MathUtils.degToRad(MathUtils.lerp(a.elevation, b.elevation, t));
    // La scène est large: sur un cadre étroit (téléphone), la caméra recule.
    const distance = MathUtils.lerp(a.distance, b.distance, t) / Math.min(1, camera.aspect / 1.15);
    const azimuth = MathUtils.lerp(a.azimuth, b.azimuth, t) + pointerSmoothed * 0.08;
    eye.set(
      target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.position.copy(eye);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  const home = new Vector3();
  const dest = new Vector3();
  function applyState() {
    // 0 → 1 · le plat et la casserole apparaissent, puis les ingrédients y
    // PLONGENT: un arc, et ils rapetissent en passant le bord, pas en l'air.
    const appear = smoothstep(0.15, 0.5, p);
    const cookScale = appear <= 0 ? 0.0001 : Math.max(0.0001, backOut(appear));
    const exit = smoothstep(2.05, 2.6, p);
    const leave = 1 - exit;
    dish.scale.setScalar(cookScale * Math.max(0.0001, leave));
    pot.scale.setScalar(cookScale * Math.max(0.0001, leave));
    dish.position.z = DISH.z - exit * 2.2;
    pot.position.z = POT.z - exit * 2.2;
    dish.visible = pot.visible = cookScale * leave > 0.002;

    for (const ing of ingredients) {
      const t = smoothstep(0.14 + ing.order * 0.05, 0.64 + ing.order * 0.05, p);
      const target3 = ing.into === "dish" ? dish.position : pot.position;
      home.copy(ing.home);
      dest.set(target3.x, ing.into === "dish" ? 0.3 : 0.45, target3.z);
      ing.object.position.lerpVectors(home, dest, t);
      ing.object.position.y += Math.sin(Math.PI * t) * 2.0;
      ing.object.rotation.set(t * 1.1, ing.homeYaw + t * 1.6, t * 0.6);
      ing.object.scale.setScalar(Math.max(0.0001, t < 0.6 ? 1 : 1 - ((t - 0.6) / 0.4) * 0.75));
      ing.object.visible = t < 0.97;
    }
    groundShadows.visible = p < 0.6;
    groundShadows.children.forEach((shadow, i) => {
      const t = smoothstep(0.1 + i * 0.05, 0.35 + i * 0.05, p);
      shadow.scale.setScalar(Math.max(0.0001, 1 - t));
    });

    // 1 → 2 · la cuisson remplit le plat et la casserole; puis ils se vident
    // dans les boîtes. Rien ne se perd: ce qui descend d'un côté monte de l'autre.
    const cooked = smoothstep(0.55, 1.0, p);
    const boxed = smoothstep(1.35, 1.95, p);
    const inPots = cooked * (1 - boxed);
    dishFill.update(level(DISH_FULL, inPots));
    dishHerbs.update(level(DISH_FULL + 0.04, inPots));
    potFill.update(level(POT_FULL, inPots));

    updateFlyers();

    // Les boîtes GLISSENT depuis l'avant jusqu'à leur place, l'une après
    // l'autre, et s'y posent avec un léger dépassement.
    const settle = smoothstep(2.45, 3.0, p);
    boxes.forEach((box, i) => {
      const rig = i === 0 ? BOX_A : BOX_B;
      const show = MathUtils.clamp((p - (1.02 + i * 0.08)) / 0.38, 0, 1);
      box.group.visible = show > 0.001;
      box.group.scale.setScalar(Math.max(0.0001, show < 1 ? easeOutBack(show, 1.1) : 1));
      box.group.position.lerpVectors(rig.from, rig.to, settle);
      box.group.position.z += (1 - easeOutCubic(show)) * 1.6;
      box.group.position.y = 0;
      box.group.rotation.y = rig.yaw * settle + (1 - easeOutCubic(show)) * (i === 0 ? 0.35 : -0.35);
      const mainH = level(goalH[0], boxed);
      const sideH = level(goalH[1], boxed);
      box.main.update(mainH);
      box.herbs.update(mainH + 0.05);
      box.side.update(sideH);
      // 2 → 3 · le couvercle descend et se POSE: il décélère franchement sur
      // les derniers centimètres, au lieu d'arriver et de repartir au même pas.
      const close = MathUtils.clamp((p - (2.15 + i * 0.12)) / 0.6, 0, 1);
      const land = easeOutCubic(close);
      box.lid.group.visible = close > 0.001;
      box.lid.group.position.set(0, MathUtils.lerp(H + 2.4, H - 0.005, land), MathUtils.lerp(-0.4, 0, land));
      box.lid.group.rotation.set(MathUtils.lerp(-0.5, 0, land), MathUtils.lerp(0.25, 0, land), 0);
    });
  }

  function onPointer(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    pointerX = (event.clientX / window.innerWidth) * 2 - 1;
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
  if (!reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });
  layout();

  const anchor = new Vector3();
  const anchors = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  const anchorX = [MAIN_X, SIDE_X];

  function report() {
    const box = boxes[0].group;
    box.updateMatrixWorld();
    const tops = [goalH[0] * smoothstep(1.35, 1.95, p) + 0.14, goalH[1] * smoothstep(1.35, 1.95, p) + 0.06];
    for (let i = 0; i < 2; i++) {
      anchor.set(anchorX[i], B + tops[i] + 0.1, DI * 0.12).applyMatrix4(box.matrixWorld).project(camera);
      anchors[i].x = ((anchor.x + 1) / 2) * width;
      anchors[i].y = ((1 - anchor.y) / 2) * height;
    }
    const chips = smoothstep(1.75, 1.95, p) * (1 - smoothstep(2.1, 2.3, p));
    options.onFrame({ anchors, chips });
  }

  function step(dt: number): boolean {
    let moving = false;
    // Le défilement arrive par à-coups (molette, pavé): on le suit de près,
    // sans le rejouer image par image.
    if (reducedMotion) {
      const snapped = Math.round(pTarget);
      if (p !== snapped) { p = snapped; moving = true; }
    } else if (Math.abs(pTarget - p) > 1e-4) {
      p += (pTarget - p) * Math.min(1, dt * 9);
      moving = true;
    } else if (p !== pTarget) {
      p = pTarget;
      moving = true;
    }
    for (let i = 0; i < 2; i++) {
      if (reducedMotion) {
        if (goalH[i] !== goalTarget[i]) { goalH[i] = goalTarget[i]; moving = true; }
        continue;
      }
      const a = 70 * (goalTarget[i] - goalH[i]) - 13 * goalV[i];
      goalV[i] += a * dt;
      goalH[i] += goalV[i] * dt;
      if (Math.abs(goalV[i]) > 1e-4 || Math.abs(goalTarget[i] - goalH[i]) > 1e-4) moving = true;
      else { goalH[i] = goalTarget[i]; goalV[i] = 0; }
    }
    const pointerGoal = reducedMotion ? 0 : pointerX;
    if (Math.abs(pointerGoal - pointerSmoothed) > 1e-4) {
      pointerSmoothed += (pointerGoal - pointerSmoothed) * Math.min(1, dt * 3);
      moving = true;
    }
    return moving;
  }

  function frame(now: number) {
    if (disposed) return;
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    let remaining = Math.min(0.5, Math.max(0, (now - last) / 1000));
    last = now;
    while (remaining > 1e-6) {
      const dt = Math.min(1 / 60, remaining);
      if (step(dt)) dirty = true;
      remaining -= dt;
    }
    if (!dirty) return;
    dirty = false;
    applyState();
    placeCamera();
    renderer.render(scene, camera);
    report();
    if (!readySent) {
      readySent = true;
      options.onReady();
    }
  }

  return {
    setProgress(next: number) {
      pTarget = MathUtils.clamp(next, 0, CAMERA.length - 1);
      if (!readySent) p = pTarget;
      dirty = true;
    },
    setGrams(grams: StoryGrams) {
      grams.forEach((g, i) => { goalTarget[i] = (g / CAPACITY[i]) * FMAX; });
      dirty = true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointer);
      studio.dispose();
    },
  };
}
