import {
  CanvasTexture,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";

import {
  FIG_700,
  PAPER,
  PHONE,
  contactShadow,
  createStudio,
  easeOutBack,
  makePhone,
  roundedRect,
  smoothstep,
} from "./mealKit";

// « SOPHIA TE FAIT SIGNE » — LE TÉLÉPHONE QUI REÇOIT, EN 3D.
//
// ── CE QU'IL MONTRE ────────────────────────────────────────────────────────
// Les trois messages de la section (`ConversationExample`) arrivent l'un après
// l'autre: le téléphone vibre, une notification descend sur son écran, et le
// message s'en échappe jusqu'à sa place dans la liste. La scène ne fournit que
// le MOUVEMENT: les messages eux-mêmes restent du HTML, rendus et lisibles
// sans elle (c'est ce que `homeUnplannedDemo.int.test.ts` garde).
//
// ⛔ AUCUNE HEURE À L'ÉCRAN. Les envois partent dans des fenêtres réelles
// (18-20 h la veille d'une session, 17-19 h pour la pesée — `thaw_reminder.ts`,
// `weigh_in.ts`); une horloge décorative aurait affiché une heure fausse.
//
// ── LA SÉQUENCE ────────────────────────────────────────────────────────────
// Jouée une fois, quand le téléphone est aux deux cinquièmes visible.
// Préférence « moins d'animations »: les trois messages sont là d'emblée.

export interface ReachFrame {
  /** Le point de l'écran d'où part chaque message, en px CSS depuis le coin haut-gauche du canvas. */
  origins: ReadonlyArray<{ x: number; y: number }>;
  /** L'envol de chaque message, de 0 (sur le téléphone) à 1 (à sa place). */
  arrivals: readonly [number, number, number];
}

export interface ReachSceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  onFrame: (frame: ReachFrame) => void;
  onReady: () => void;
}

export interface ReachScene {
  dispose(): void;
}

const ARRIVE_AT = [0.55, 2.25, 3.95] as const;
const BANNER_IN = 0.3;
const FLIGHT = [0.35, 1.25] as const;
const T_END = ARRIVE_AT[2] + FLIGHT[1] + 0.2;

function lockScreen(): CanvasTexture {
  const w = 512;
  const h = 1110;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#3A1830");
  g.addColorStop(1, "#1A0B15");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, w * 0.9);
  glow.addColorStop(0, "rgba(201,163,184,0.35)");
  glow.addColorStop(1, "rgba(201,163,184,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // Le monogramme de Sophia, en bas: la marque, sans un mot.
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.8, 58, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(251,248,250,0.14)";
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = '400 72px "Young Serif", Georgia, serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("S", w / 2, h * 0.8 + 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Une notification sans texte: la pastille S et deux lignes. Le texte, c'est la carte HTML. */
function bannerTexture(): CanvasTexture {
  const w = 640;
  const h = 170;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 38);
  ctx.fillStyle = "rgba(251,248,250,0.96)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(70, h / 2, 34, 0, Math.PI * 2);
  ctx.fillStyle = FIG_700;
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = '600 36px "Public Sans", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("S", 70, h / 2 + 2);
  ctx.fillStyle = "#CBBDC5";
  ctx.beginPath();
  ctx.roundRect(126, 52, 300, 20, 10);
  ctx.fill();
  ctx.fillStyle = "#E2D8DE";
  ctx.beginPath();
  ctx.roundRect(126, 94, 420, 18, 9);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createReachScene(options: ReachSceneOptions): ReachScene {
  const { canvas, reducedMotion } = options;
  const studio = createStudio(canvas, 2);
  const { renderer, scene } = studio;
  const camera = new PerspectiveCamera(24, 1, 0.1, 40);

  const stand = new Group();
  scene.add(stand);
  const shadow = contactShadow(1.6, 0.7);
  shadow.position.y = -1.05;
  stand.add(shadow);

  const screenMaterial = new MeshBasicMaterial({ map: lockScreen() });
  const phone = makePhone(screenMaterial);
  stand.add(phone.group);

  const bannerW = PHONE.screenW - 0.1;
  const bannerH = bannerW * (170 / 640);
  const bannerShape = roundedRect(new Shape(), bannerW, bannerH, 0.04);
  const bannerGeometry = new ShapeGeometry(bannerShape, 8);
  {
    const pos = bannerGeometry.getAttribute("position");
    const uv = bannerGeometry.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / bannerW + 0.5, pos.getY(i) / bannerH + 0.5);
    uv.needsUpdate = true;
  }
  const bannerMap = bannerTexture();
  const banners = ARRIVE_AT.map((_, i) => {
    const material = new MeshBasicMaterial({ map: bannerMap, transparent: true, opacity: 0 });
    const banner = new Mesh(bannerGeometry, material);
    banner.position.set(0, 0.52 - i * (bannerH + 0.04), PHONE.d / 2 + 0.004 + i * 0.001);
    phone.group.add(banner);
    return { banner, material, restY: banner.position.y };
  });

  let time = reducedMotion ? T_END : 0;
  let started = reducedMotion;
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

  function layout() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Le téléphone tient en hauteur quel que soit le cadre; sur un cadre très
    // étroit, c'est sa largeur qui décide.
    const byHeight = 1.06 / Math.tan(MathUtils.degToRad(12));
    const byWidth = 0.78 / (Math.tan(MathUtils.degToRad(12)) * camera.aspect);
    const distance = Math.max(byHeight, byWidth);
    camera.position.set(0, 0.35, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    dirty = true;
  }

  function applyState() {
    // La vibration: une oscillation brève et amortie à chaque arrivée.
    let buzz = 0;
    for (const at of ARRIVE_AT) {
      const t = time - at;
      if (t > 0 && t < 0.5) buzz += Math.sin(t * 70) * Math.exp(-t * 9) * 0.05;
    }
    const idle = reducedMotion ? 0 : Math.sin(time * 1.2) * 0.03;
    phone.group.position.set(0, idle, 0);
    phone.group.rotation.set(-0.1, 0.32 + pointerSmoothed * 0.12, buzz);
    // L'écran est ÉTEINT jusqu'à la première vibration, puis s'allume; chaque
    // arrivée le fait briller un instant, comme un vrai téléphone qui reçoit.
    const wake = reducedMotion ? 1 : smoothstep(ARRIVE_AT[0] - 0.05, ARRIVE_AT[0] + 0.3, time);
    let pulse = 0;
    for (const at of ARRIVE_AT) {
      const t = time - at;
      if (t > 0) pulse += Math.exp(-t * 5) * 0.18;
    }
    screenMaterial.color.setScalar(0.05 + 0.95 * wake + (reducedMotion ? 0 : pulse));
    banners.forEach(({ banner, material, restY }, i) => {
      const raw = reducedMotion ? 1 : Math.min(1, Math.max(0, (time - ARRIVE_AT[i]) / BANNER_IN));
      material.opacity = Math.min(1, raw * 1.5);
      banner.position.y = restY + (1 - smoothstep(0, 1, raw)) * 0.18;
      banner.scale.setScalar(raw <= 0 ? 0.0001 : 0.9 + 0.1 * easeOutBack(raw, 2));
    });
  }

  const origin = new Vector3();
  const origins = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  const arrivals: [number, number, number] = [0, 0, 0];
  function report() {
    banners.forEach(({ banner }, i) => {
      banner.getWorldPosition(origin).project(camera);
      origins[i].x = ((origin.x + 1) / 2) * width;
      origins[i].y = ((1 - origin.y) / 2) * height;
      arrivals[i] = reducedMotion ? 1 : smoothstep(ARRIVE_AT[i] + FLIGHT[0], ARRIVE_AT[i] + FLIGHT[1], time);
    });
    options.onFrame({ origins, arrivals });
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
      studio.dispose();
    },
  };
}
