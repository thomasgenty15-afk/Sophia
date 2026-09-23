import { CylinderGeometry, Group, MathUtils, PerspectiveCamera, SphereGeometry, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import {
  contactShadow,
  createStudio,
  easeOutBack,
  foodMaterials,
  glassMaterial,
  herbKinds,
  lidMaterial,
  lumpy,
  makeGlassBox,
  makeLid,
  makePile,
  mulberry32,
  smoothstep,
  type Fill,
  type Lid,
  type PileKind,
  type StickerText,
} from "./mealKit";

// « TU CUISINES POUR D'AUTRES PERSONNES ? » — TROIS BOÎTES, UNE PAR PERSONNE.
//
// ── CE QU'ELLE MONTRE ──────────────────────────────────────────────────────
// Le foyer de la section (`DEMO_MEMBERS`): Toi, Alex, Lou. Une session, trois
// boîtes qui arrivent l'une après l'autre, se remplissent et se ferment sur
// leur étiquette — le prénom et ce dont la personne a besoin. Les portions
// DIFFÈRENT: c'est « Sophia tient compte des goûts et des besoins de chacun ».
// Les légumes et les pommes de terre sont les mêmes casseroles pour tous
// (« regroupées quand c'est possible »); Lou, végétarienne, a du tofu à la
// place du saumon. Le repas n'est PAS celui du reste de la page (poulet et
// boulgour): ici, saumon, brocoli, haricots verts et pommes de terre rôties.
//
// ⚠️ AUCUN CHIFFRE N'EST AFFICHÉ. Les hauteurs de Toi et d'Alex viennent des
// grammes de la démonstration (perte de poids, prise de muscle); celle de Lou
// est une illustration. La scène ne porte aucune étiquette de grammes.
//
// ── LA SÉQUENCE ────────────────────────────────────────────────────────────
// Jouée une fois, aux deux cinquièmes visible; « moins d'animations »: l'état
// final d'emblée. Ensuite, un léger balancement.

export interface HouseholdMember {
  sticker: StickerText;
  /** [casserole principale, féculent] en grammes. */
  grams: readonly [number, number];
  vegetarian: boolean;
}

export interface HouseholdSceneOptions {
  canvas: HTMLCanvasElement;
  members: readonly HouseholdMember[];
  reducedMotion: boolean;
  onReady: () => void;
}

export interface HouseholdScene {
  dispose(): void;
}

// Les cotes de la boîte du héros.
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

/** Un arc peu profond: la boîte du milieu en retrait, les deux autres devant. */
const SLOTS = [
  { at: new Vector3(-3.35, 0, 0.55), yaw: 0.22 },
  { at: new Vector3(0, 0, -0.15), yaw: 0 },
  { at: new Vector3(3.35, 0, 0.55), yaw: -0.22 },
] as const;

const STAGGER = 0.45;
const T_ARRIVE = 0.55;
const T_FILL = [0.35, 1.05] as const;
const T_LID = [1.0, 1.55] as const;

// ── UN AUTRE REPAS QUE LE RESTE DE LA PAGE (2026-09-23) ─────────────────────
// Le héros et le récit montrent poulet et boulgour; ici, le foyer mange du
// saumon, du brocoli et des haricots verts, avec des pommes de terre rôties à
// côté. UN menu pour la table; Lou, végétarienne, a des dés de tofu doré à la
// place du saumon — le reste est le même.
const SALMON = ["#F08A6A", "#F49B7B", "#E77A5A", "#F6AE8E", "#E36F50"];
const TOFU = ["#EFE3C2", "#E6D2A4", "#D9B876", "#F2E8CF"];
const BROCCOLI = ["#3E7A2E", "#4A8A35", "#35692A", "#5A9A3E"];
const BEANS = ["#5E9A3A", "#6FAA45", "#4F8A30"];
const POTATO = ["#E3B65E", "#D9A441", "#EBC77A", "#C98E2E", "#E0AE52"];

function greenKinds(): PileKind[] {
  return [
    // Une tête de brocoli: une boule bosselée, vert profond.
    { geometry: lumpy(new SphereGeometry(0.075, 14, 10), 0.24, 28).scale(1, 0.85, 1), palette: BROCCOLI, weight: 0.3 },
    // Un haricot vert: un bâtonnet couché.
    { geometry: new CylinderGeometry(0.02, 0.018, 0.3, 8).rotateZ(Math.PI / 2), palette: BEANS, weight: 0.25, flat: true },
  ];
}

function mainKinds(food: ReturnType<typeof foodMaterials>, vegetarian: boolean): PileKind[] {
  const protein: PileKind = vegetarian
    ? { geometry: new RoundedBoxGeometry(0.16, 0.14, 0.16, 2, 0.025), palette: TOFU, weight: 0.45, material: food.roast }
    : { geometry: lumpy(new RoundedBoxGeometry(0.24, 0.12, 0.17, 2, 0.04), 0.12, 18), palette: SALMON, weight: 0.45, material: food.roast };
  return [protein, ...greenKinds()];
}

function potatoKinds(food: ReturnType<typeof foodMaterials>): PileKind[] {
  return [{ geometry: lumpy(new RoundedBoxGeometry(0.15, 0.13, 0.14, 2, 0.04), 0.1, 16), palette: POTATO, weight: 1, material: food.roast }];
}

interface Rig {
  group: Group;
  main: Fill;
  herbs: Fill;
  side: Fill;
  sideHerbs: Fill;
  lid: Lid;
  heights: readonly [number, number];
}

export function createHouseholdScene(options: HouseholdSceneOptions): HouseholdScene {
  const { canvas, reducedMotion } = options;
  const studio = createStudio(canvas, 6);
  const { renderer, scene } = studio;
  const camera = new PerspectiveCamera(24, 1, 0.1, 80);
  const food = foodMaterials();
  const glass = glassMaterial();
  const lidMat = lidMaterial();
  const rng = mulberry32(20260926);
  const world = new Group();
  scene.add(world);

  const rigs: Rig[] = options.members.slice(0, SLOTS.length).map((member) => {
    const group = new Group();
    group.add(contactShadow(W * 1.3, D * 1.9));
    group.add(makeGlassBox({ w: W, d: D, h: H, wall: T, radius: R, floor: B, dividers: [DIVIDER_X], dividerThickness: TD }, glass));
    const mainArea = { x: MAIN_X, z: 0, w: MAIN_W, d: DI };
    const main = makePile(group, rng, mainArea, B, FMAX, 0.18, mainKinds(food, member.vegetarian), food.food);
    const herbs = makePile(group, rng, mainArea, B, FMAX, 0.11, herbKinds(), food.food, 0.12);
    // Les pommes de terre rôties à côté, avec un peu de persil dessus.
    const sideArea = { x: SIDE_X, z: 0, w: SIDE_W, d: DI };
    const side = makePile(group, rng, sideArea, B, FMAX, 0.16, potatoKinds(food), food.food);
    const sideHerbs = makePile(group, rng, sideArea, B, FMAX, 0.11, herbKinds(), food.food, 0.1);
    const lid = makeLid(
      // Une étiquette plus grande que sur la boîte du héros: vues de loin, les
      // trois boîtes doivent dire pour qui elles sont.
      { w: W + 0.06, d: D + 0.06, radius: R + 0.03, thickness: 0.1, stickerWidth: 2.1, stickerAt: [-0.2, 0.08] },
      lidMat,
      member.sticker,
      renderer.capabilities.getMaxAnisotropy(),
    );
    group.add(lid.group);
    lid.whenFontsReady(() => { if (!disposed) dirty = true; });
    world.add(group);
    return {
      group,
      main,
      herbs,
      side,
      sideHerbs,
      lid,
      heights: [(member.grams[0] / CAPACITY[0]) * FMAX, (member.grams[1] / CAPACITY[1]) * FMAX] as const,
    };
  });

  let time = reducedMotion ? 10 : 0;
  let started = reducedMotion;
  let dirty = true;
  let disposed = false;
  let visible = false;
  let raf = 0;
  let last = performance.now();
  let readySent = false;
  let pointerX = 0;
  let pointerSmoothed = 0;

  function layout() {
    const rect = canvas.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    dirty = true;
  }

  function placeCamera() {
    // Trois boîtes côte à côte: la largeur décide du recul.
    const target = new Vector3(0, 0.4, 0.3);
    const elevation = MathUtils.degToRad(34);
    const azimuth = pointerSmoothed * 0.08;
    // La rangée fait ~9,8 de large (trois boîtes de 3,0 et leurs écarts): on
    // cadre sa demi-largeur, plus un filet de marge.
    const byWidth = 5.6 / (Math.tan(MathUtils.degToRad(12)) * camera.aspect);
    const distance = Math.max(9.5, byWidth);
    camera.position.set(
      target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function applyState() {
    const breathe = reducedMotion ? 0 : smoothstep(2.4, 3.4, time);
    rigs.forEach((rig, i) => {
      const local = time - i * STAGGER;
      const slot = SLOTS[i];
      const arrive = reducedMotion ? 1 : MathUtils.clamp(local / T_ARRIVE, 0, 1);
      rig.group.visible = arrive > 0.001;
      rig.group.scale.setScalar(Math.max(0.0001, arrive < 1 ? easeOutBack(arrive, 1.2) : 1));
      rig.group.position.copy(slot.at);
      rig.group.position.z += (1 - smoothstep(0, 1, arrive)) * 1.2;
      rig.group.position.y = Math.sin(time * 1.1 + i * 1.7) * 0.03 * breathe;
      rig.group.rotation.set(0, slot.yaw + Math.sin(time * 0.4 + i) * 0.03 * breathe, 0);
      // Le remplissage: vide sous le fond, puis jusqu'à la part de chacun.
      const fill = reducedMotion ? 1 : smoothstep(T_FILL[0], T_FILL[1], local);
      const mainH = MathUtils.lerp(-0.25, rig.heights[0], fill);
      rig.main.update(mainH);
      rig.herbs.update(mainH + 0.05);
      // Les pommes de terre sont des morceaux, comme le reste: vide = sous le fond.
      const sideH = MathUtils.lerp(-0.25, rig.heights[1], fill);
      rig.side.update(sideH);
      rig.sideHerbs.update(sideH + 0.05);
      // Le couvercle descend et se pose; son étiquette dit pour qui.
      const close = reducedMotion ? 1 : MathUtils.clamp((local - T_LID[0]) / (T_LID[1] - T_LID[0]), 0, 1);
      const land = 1 - (1 - close) ** 3;
      rig.lid.group.visible = close > 0.001;
      rig.lid.group.position.set(0, MathUtils.lerp(H + 2.2, H - 0.005, land), MathUtils.lerp(-0.3, 0, land));
      rig.lid.group.rotation.set(MathUtils.lerp(-0.45, 0, land), MathUtils.lerp(0.2, 0, land), 0);
    });
  }

  function onPointer(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    pointerX = (event.clientX / window.innerWidth) * 2 - 1;
  }

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(canvas);
  const intersection = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    visible = entry.isIntersecting;
    if (entry.intersectionRatio >= 0.4) started = true;
    if (visible && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }, { threshold: [0, 0.4] });
  intersection.observe(canvas);
  if (!reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });
  layout();

  function frame(now: number) {
    if (disposed) return;
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.5, Math.max(0, (now - last) / 1000));
    last = now;
    if (started && !reducedMotion) {
      time += dt;
      dirty = true;
    }
    const goal = reducedMotion ? 0 : pointerX;
    if (Math.abs(goal - pointerSmoothed) > 1e-4) {
      pointerSmoothed += (goal - pointerSmoothed) * Math.min(1, dt * 3);
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    applyState();
    placeCamera();
    renderer.render(scene, camera);
    if (!readySent) {
      readySent = true;
      options.onReady();
    }
  }

  return {
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
