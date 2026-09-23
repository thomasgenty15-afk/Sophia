import {
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RingGeometry,
  CircleGeometry,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  Euler,
  WebGLRenderTarget,
} from "three";

import {
  PHONE,
  contactShadow,
  createStudio,
  easeOutBack,
  extrudeUp,
  lumpy,
  makePhone,
  mulberry32,
  smoothstep,
} from "./mealKit";

// LE REPAS IMPRÉVU, EN 3D — UNE PHOTO PRISE À TABLE.
//
// ── CE QU'ELLE MONTRE ──────────────────────────────────────────────────────
// L'exemple de la section, mot pour mot (`home.life.demo.example`): une pizza
// quatre fromages au resto, deux parts, et une salade. Un téléphone arrive au-
// dessus de l'assiette; son écran montre CE QUE SON OBJECTIF VOIT — un second
// rendu de la même scène, pris de sa position —, le cadre se resserre, le
// déclencheur part, et les étiquettes nomment ce qui a été reconnu.
//
// ⛔ AUCUN CHIFFRE. Les étiquettes (HTML, côté composant) disent ce qui est
// sur l'assiette et que c'est compté; une estimation d'énergie inventée pour la
// scène serait une promesse sans mesure — la mesure, elle, est écrite à côté
// (« Bon à savoir », 85 repas réels).
//
// ── LA SÉQUENCE ────────────────────────────────────────────────────────────
// Jouée UNE fois, quand la scène est aux deux cinquièmes visible; le temps
// n'avance que pendant qu'elle est à l'écran. Préférence « moins
// d'animations »: l'état final, tout de suite.

export interface UnplannedFrame {
  /** [la pizza, la salade, le bas du téléphone] — en px CSS depuis le coin haut-gauche. */
  anchors: ReadonlyArray<{ x: number; y: number }>;
  /** L'apparition de chaque étiquette, de 0 à 1. */
  chips: readonly [number, number, number];
}

export interface UnplannedSceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  onFrame: (frame: UnplannedFrame) => void;
  onReady: () => void;
}

export interface UnplannedScene {
  dispose(): void;
}

const PLATE_R = 1.5;
const SLICE_R = 1.22;
const SLICE_ANGLE = 0.8;
// Le saladier derrière à gauche: le téléphone arrive par la droite et ne doit
// rien cacher de la table.
const TARGET = new Vector3(-0.35, 0.15, -0.35);
const BOWL = new Vector3(-1.85, 0, -1.25);

const T_PHONE_IN = [0.1, 1.2] as const;
const T_FRAME = [0.95, 1.55] as const;
const T_SHUTTER = 1.75;
/** Après le déclic, une ligne balaie l'écran: la photo est lue. */
const T_SCAN = [1.95, 2.55] as const;
const T_CHIPS = [2.5, 2.85, 3.35] as const;
const T_END = 3.9;

function ceramic(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color: "#F7F3EE", roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, side: DoubleSide });
}

function buildPlate(): Mesh {
  const profile = [
    [0, 0], [1.1, 0], [1.24, 0.03], [1.47, 0.13], [PLATE_R, 0.15], [1.47, 0.165], [1.23, 0.065], [1.1, 0.045], [0, 0.045],
  ].map(([x, y]) => new Vector2(x, y));
  const plate = new Mesh(new LatheGeometry(profile, 64), ceramic());
  plate.receiveShadow = true;
  return plate;
}

function buildSlice(rng: () => number): Group {
  const slice = new Group();
  const sector = (radius: number, from: number) => {
    const shape = new Shape();
    shape.moveTo(from, 0);
    shape.absarc(0, 0, radius, -SLICE_ANGLE / 2, SLICE_ANGLE / 2, false);
    shape.lineTo(from, 0);
    return shape;
  };
  const dough = new Mesh(extrudeUp(sector(SLICE_R, 0), 0.035, 0.015), new MeshPhysicalMaterial({ color: "#E3BC7E", roughness: 0.7 }));
  dough.castShadow = true;
  dough.receiveShadow = true;
  slice.add(dough);
  // Le fromage fondu: une nappe un peu bosselée, plus courte que la pâte.
  const cheeseTop = new Mesh(
    lumpy(extrudeUp(sector(SLICE_R - 0.13, 0.05), 0.01, 0.012), 0.015, 18),
    new MeshPhysicalMaterial({ color: "#F0D68C", roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.3 }),
  );
  cheeseTop.position.y = 0.055;
  cheeseTop.receiveShadow = true;
  slice.add(cheeseTop);
  // La croûte: un boudin doré le long de l'arc.
  const arc: Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = -SLICE_ANGLE / 2 + (SLICE_ANGLE * i) / 12;
    arc.push(new Vector3((SLICE_R - 0.05) * Math.cos(a), 0.085, -(SLICE_R - 0.05) * Math.sin(a)));
  }
  const crust = new Mesh(
    lumpy(new TubeGeometry(new CatmullRomCurve3(arc), 28, 0.08, 10, false), 0.06, 16),
    new MeshPhysicalMaterial({ color: "#C98B44", roughness: 0.62 }),
  );
  crust.castShadow = true;
  slice.add(crust);
  // Les quatre fromages, en taches: mozzarella, comté, gorgonzola (et ses
  // veines), et quelques zones dorées au four.
  const palette = ["#F7EEDB", "#F7EEDB", "#EFCF6E", "#EFCF6E", "#E4DCC0", "#9DB0A6", "#C3843F", "#B8742F"];
  const blobs = new InstancedMesh(new SphereGeometry(1, 12, 8), new MeshPhysicalMaterial({ color: "#FFFFFF", roughness: 0.35, clearcoat: 0.5 }), 44);
  const m = new Matrix4();
  const q = new Quaternion();
  const c = new Color();
  for (let i = 0; i < blobs.count; i++) {
    const rho = 0.22 + rng() * (SLICE_R - 0.5);
    const phi = (rng() - 0.5) * SLICE_ANGLE * 0.8 * Math.min(1, rho / 0.5);
    q.setFromEuler(new Euler(0, rng() * Math.PI, 0));
    m.compose(
      new Vector3(rho * Math.cos(phi), 0.08, -rho * Math.sin(phi)),
      q,
      new Vector3(0.08 + rng() * 0.1, 0.016, 0.06 + rng() * 0.08),
    );
    blobs.setMatrixAt(i, m);
    blobs.setColorAt(i, c.set(palette[Math.floor(rng() * palette.length)]));
  }
  blobs.castShadow = true;
  slice.add(blobs);
  return slice;
}

function buildSalad(rng: () => number): Group {
  const bowl = new Group();
  const profile = [
    [0, 0], [0.3, 0], [0.34, 0.03], [0.58, 0.28], [0.62, 0.34], [0.59, 0.345], [0.53, 0.28], [0.3, 0.07], [0, 0.07],
  ].map(([x, y]) => new Vector2(x, y));
  const shell = new Mesh(new LatheGeometry(profile, 48), ceramic());
  shell.castShadow = true;
  bowl.add(shell);
  // Des feuilles: un plan courbé, en creux, dupliqué.
  const leafGeometry = new PlaneGeometry(0.34, 0.22, 6, 3);
  const pos = leafGeometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, 0.35 * x * x + 0.9 * y * y - 0.03);
  }
  leafGeometry.computeVertexNormals();
  const greens = ["#6E9A3A", "#86B048", "#4E7A2A", "#A5C45E"];
  const leaves = new InstancedMesh(leafGeometry, new MeshPhysicalMaterial({ color: "#FFFFFF", roughness: 0.5, side: DoubleSide, clearcoat: 0.3 }), 46);
  const m = new Matrix4();
  const q = new Quaternion();
  const c = new Color();
  for (let i = 0; i < leaves.count; i++) {
    const r = Math.sqrt(rng()) * 0.42;
    const a = rng() * Math.PI * 2;
    const y = 0.16 + (1 - r / 0.42) * 0.22 + rng() * 0.05;
    q.setFromEuler(new Euler(-Math.PI / 2 + (rng() - 0.5) * 1.2, rng() * Math.PI * 2, (rng() - 0.5) * 0.8));
    m.compose(new Vector3(r * Math.cos(a), y, r * Math.sin(a)), q, new Vector3(1, 1, 1).multiplyScalar(0.8 + rng() * 0.5));
    leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, c.set(greens[Math.floor(rng() * greens.length)]));
  }
  leaves.castShadow = true;
  bowl.add(leaves);
  const tomatoMaterial = new MeshPhysicalMaterial({ color: "#C8352A", roughness: 0.2, clearcoat: 1 });
  for (let i = 0; i < 5; i++) {
    const tomato = new Mesh(new SphereGeometry(0.075, 18, 12), tomatoMaterial);
    const a = (i / 5) * Math.PI * 2 + rng() * 0.5;
    tomato.position.set(Math.cos(a) * 0.22, 0.38 + rng() * 0.04, Math.sin(a) * 0.22);
    tomato.castShadow = true;
    bowl.add(tomato);
  }
  return bowl;
}

export function createUnplannedScene(options: UnplannedSceneOptions): UnplannedScene {
  const { canvas, reducedMotion } = options;
  const studio = createStudio(canvas, 3.5);
  const { renderer, scene } = studio;
  const camera = new PerspectiveCamera(26, 1, 0.1, 60);
  const rng = mulberry32(20260925);

  // ── La table: l'assiette, deux parts, la salade.
  const table = new Group();
  table.add(contactShadow(PLATE_R * 2.6, PLATE_R * 2.3));
  table.add(buildPlate());
  const sliceA = buildSlice(rng);
  // Deux parts en éventail, pointes vers le centre, écartées de plus que leur
  // propre angle: on doit en compter deux, pas voir une seule forme.
  // (`rotation.y = π + a` envoie la part vers l'avant-gauche, `π − a` vers
  // l'arrière-gauche: la part dont la pointe est devant part vers l'avant.)
  sliceA.position.set(0.6, 0.045, 0.28);
  sliceA.rotation.y = Math.PI + 0.55;
  const sliceB = buildSlice(rng);
  sliceB.position.set(0.55, 0.05, -0.28);
  sliceB.rotation.y = Math.PI - 0.6;
  table.add(sliceA, sliceB);
  const salad = buildSalad(rng);
  salad.position.copy(BOWL);
  const bowlShadow = contactShadow(1.6, 1.6);
  bowlShadow.position.set(BOWL.x, 0.003, BOWL.z);
  table.add(salad, bowlShadow);
  scene.add(table);

  // ── Le téléphone, et ce que voit son objectif.
  const target = new WebGLRenderTarget(360, 780, { samples: 4 });
  const phoneCamera = new PerspectiveCamera(46, PHONE.screenW / PHONE.screenH, 0.1, 40);
  const phone = makePhone(new MeshBasicMaterial({ map: target.texture }));
  scene.add(phone.group);
  const overlay = new Group();
  overlay.position.z = PHONE.d / 2 + 0.004;
  phone.group.add(overlay);
  // Le cadre de visée: quatre équerres blanches.
  const bracketMaterial = new MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.95 });
  const brackets = new Group();
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const h = new Mesh(new PlaneGeometry(0.1, 0.012), bracketMaterial);
    h.position.set(sx * 0.23, sy * 0.38, 0);
    const v = new Mesh(new PlaneGeometry(0.012, 0.1), bracketMaterial);
    v.position.set(sx * 0.274, sy * 0.336, 0);
    brackets.add(h, v);
  }
  overlay.add(brackets);
  const shutter = new Mesh(new RingGeometry(0.068, 0.085, 32), bracketMaterial);
  shutter.position.set(0, -0.64, 0);
  const shutterCore = new Mesh(new CircleGeometry(0.058, 32), new MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.9 }));
  shutterCore.position.set(0, -0.64, 0.001);
  overlay.add(shutter, shutterCore);
  const flashMaterial = new MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0 });
  const flash = new Mesh(new PlaneGeometry(PHONE.screenW, PHONE.screenH), flashMaterial);
  flash.position.z = 0.002;
  overlay.add(flash);
  // La ligne d'analyse: une bande claire qui descend l'écran après le déclic.
  const scanMaterial = new MeshBasicMaterial({ color: "#F3E6EE", transparent: true, opacity: 0 });
  const scan = new Mesh(new PlaneGeometry(PHONE.screenW * 0.92, 0.014), scanMaterial);
  scan.position.z = 0.003;
  const scanGlowMaterial = new MeshBasicMaterial({ color: "#C9A3B8", transparent: true, opacity: 0 });
  const scanGlow = new Mesh(new PlaneGeometry(PHONE.screenW * 0.92, 0.12), scanGlowMaterial);
  scanGlow.position.z = 0.0025;
  overlay.add(scanGlow, scan);
  // Le flash éclaire VRAIMENT la table, un instant: une lumière ponctuelle
  // posée sur l'objectif, qui s'éteint en quelques centièmes.
  const flashLight = new PointLight("#FFFFFF", 0, 9, 1.6);
  scene.add(flashLight);

  // ── L'état.
  let time = reducedMotion ? T_END + 1 : 0;
  let started = reducedMotion;
  let frozen = false;
  let dirty = true;
  let disposed = false;
  let visible = false;
  let raf = 0;
  let last = performance.now();
  let width = 1;
  let height = 1;
  let readySent = false;
  let pointerX = 0;
  let pointerSmoothed = 0;

  const eye = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const phoneRest = new Vector3();
  const phoneFrom = new Vector3();
  const aim = new Vector3();

  function layout() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    dirty = true;
  }

  function placeCamera() {
    // Par-dessus l'épaule, un peu à droite: on voit l'écran de face et
    // l'assiette à côté de lui.
    const azimuth = 0.42 + pointerSmoothed * 0.05;
    const elevation = MathUtils.degToRad(36);
    const distance = 9.4 / Math.min(1, camera.aspect / 1.2);
    eye.set(
      TARGET.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      TARGET.y + distance * Math.sin(elevation),
      TARGET.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.position.copy(eye);
    camera.lookAt(TARGET.x + 0.6, TARGET.y + 0.4, TARGET.z + 0.35);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    // Le téléphone se tient sur la ligne de vue, à mi-chemin, décalé à droite.
    const toEye = eye.clone().sub(TARGET).normalize();
    phoneRest.copy(TARGET).addScaledVector(toEye, 2.9).addScaledVector(right, 1.55).addScaledVector(up, 0.15);
    phoneFrom.copy(phoneRest).addScaledVector(right, 2.4).addScaledVector(up, 1.6);
  }

  function applyState() {
    // L'arrivée dépasse d'un rien sa place et s'y pose (le geste de viser).
    const raw = reducedMotion ? 1 : MathUtils.clamp((time - T_PHONE_IN[0]) / (T_PHONE_IN[1] - T_PHONE_IN[0]), 0, 1);
    const arrive = reducedMotion ? 1 : easeOutBack(raw, 0.9);
    const float = reducedMotion ? 0 : Math.sin(time * 1.4) * 0.035 * smoothstep(T_END - 0.5, T_END + 0.5, time);
    const click = reducedMotion ? 0 : Math.exp(-((time - T_SHUTTER) ** 2) / 0.004) * -0.05;
    phone.group.position.lerpVectors(phoneFrom, phoneRest, arrive).addScaledVector(up, float + click);
    // Le dos vers l'assiette: l'objectif vise ce que l'écran montre.
    aim.copy(phone.group.position).multiplyScalar(2).sub(TARGET);
    phone.group.lookAt(aim);
    phone.group.rotateZ((1 - Math.min(1, arrive)) * 0.5);
    phone.group.visible = raw > 0.001;

    // La mise au point: le cadre se resserre et « accroche » (léger rebond).
    const framing = reducedMotion ? 1 : MathUtils.clamp((time - T_FRAME[0]) / (T_FRAME[1] - T_FRAME[0]), 0, 1);
    brackets.scale.setScalar(MathUtils.lerp(1.3, 1, easeOutBack(framing, 2)));
    bracketMaterial.opacity = 0.95 * Math.max(0.2, framing);
    const f = time - T_SHUTTER;
    const burst = reducedMotion || f < 0 ? 0 : Math.exp(-f * 9);
    flashMaterial.opacity = 0.9 * burst;
    flashLight.intensity = 38 * burst;
    flashLight.position.copy(phone.group.position);
    // Le déclencheur s'enfonce sous le doigt, puis revient.
    const press = reducedMotion ? 0 : Math.exp(-((time - T_SHUTTER + 0.04) ** 2) / 0.004);
    shutterCore.scale.setScalar(1 - 0.35 * press);
    // Le balayage, de haut en bas, avec un halo qui le suit.
    const sweep = reducedMotion ? 1 : MathUtils.clamp((time - T_SCAN[0]) / (T_SCAN[1] - T_SCAN[0]), 0, 1);
    const scanY = MathUtils.lerp(PHONE.screenH / 2 - 0.1, -PHONE.screenH / 2 + 0.22, sweep);
    const scanOn = sweep > 0 && sweep < 1 ? Math.sin(Math.PI * sweep) : 0;
    scan.position.y = scanY;
    scanGlow.position.y = scanY + 0.05;
    scanMaterial.opacity = 0.95 * scanOn;
    scanGlowMaterial.opacity = 0.35 * scanOn;
  }

  function renderPhoneView() {
    if (frozen) return;
    phoneCamera.position.copy(phone.group.position);
    // Même orientation que le téléphone: une caméra regarde vers son -z, et le
    // -z du téléphone est son dos, tourné vers l'assiette.
    phoneCamera.quaternion.copy(phone.group.quaternion);
    phoneCamera.updateMatrixWorld();
    phone.group.visible = false;
    renderer.setRenderTarget(target);
    renderer.render(scene, phoneCamera);
    renderer.setRenderTarget(null);
    phone.group.visible = true;
    // Après le déclic, l'écran garde la photo — prise AVEC le flash, qui est
    // encore allumé à cette image-là: c'est une photo au flash.
    if (time > T_SHUTTER + 0.02) frozen = true;
  }

  const anchor = new Vector3();
  const anchors = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  const chips: [number, number, number] = [0, 0, 0];
  function report() {
    const points = [
      new Vector3(-0.05, 0.3, 0),
      new Vector3(BOWL.x, 0.62, BOWL.z),
      // Le bas du téléphone: l'étiquette « comptabilisé » se pose SOUS lui, là
      // où elle ne recouvre ni l'écran ni l'étiquette de la pizza.
      phone.group.localToWorld(anchor.set(0, -PHONE.h / 2 - 0.04, PHONE.d / 2)).clone(),
    ];
    points.forEach((point, i) => {
      point.project(camera);
      anchors[i].x = ((point.x + 1) / 2) * width;
      anchors[i].y = ((1 - point.y) / 2) * height;
      chips[i] = reducedMotion ? 1 : smoothstep(T_CHIPS[i], T_CHIPS[i] + 0.35, time);
    });
    options.onFrame({ anchors, chips });
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
    placeCamera();
    applyState();
    renderPhoneView();
    renderer.render(scene, camera);
    report();
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
      target.dispose();
      studio.dispose();
    },
  };
}
