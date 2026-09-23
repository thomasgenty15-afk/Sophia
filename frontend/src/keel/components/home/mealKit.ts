import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Path,
  PCFShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  RepeatWrapping,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Euler,
  Vector3,
  WebGLRenderer,
  CylinderGeometry,
  TorusGeometry,
  ShapeGeometry,
  LatheGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// LE KIT DES SCÈNES 3D DE `/` — CE QUE LA BOÎTE DU HÉROS ET LE RÉCIT DU
// PLANNING PARTAGENT: le studio (lumières, sol), le verre, le couvercle et son
// étiquette, et les deux façons de remplir un contenant (des morceaux, des
// grains). Aucun mot ici: les libellés arrivent traduits des composants.
//
// ⚠️ CHARGÉ SEULEMENT PAR `import()`. Il tire `three` avec lui; un import
// statique depuis un composant de la page le ferait entrer dans le paquet
// principal, que tout visiteur télécharge avant de voir le titre.

// ── LES COULEURS ─────────────────────────────────────────────────────────────
// Celles de la charte (`tokens.css`) sur les objets de la marque; celles des
// aliments sur les aliments.
export const FIG_700 = "#632C4C";
export const FIG_800 = "#4A2039";
export const INK = "#23191F";
export const INK_SOFT = "#6A5A64";
export const PAPER = "#FBF8FA";
export const LINE = "#E4DAE0";

// Poulet rôti AU PAPRIKA. ⟳ 2026-09-23 — CE NE SONT PLUS DES COULEURS MAIS DES
// NUANCES: la couleur du morceau (peau dorée, chair claire) est peinte dans sa
// géométrie (`chickenGeometry`); la palette ne fait que varier un morceau à
// l'autre, un peu plus pâle, un peu plus rôti.
export const CHICKEN = ["#FFFFFF", "#F7EDE4", "#FFF5EC", "#EBDDD0", "#FFEBDD", "#F2E2D6"];
export const CARROT = ["#D96A1E", "#E67F2E", "#C95E17", "#E0762A"];
export const PEPPER = ["#B92E22", "#C8402A", "#A8281C", "#DDA02C"];
export const BULGUR = ["#C99E5A", "#DDBD80", "#B38647", "#E6CB94", "#A97C40"];
export const HERB = ["#5B7F2E", "#6E9438", "#4C6B25"];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Décélère franchement: un geste qui se pose. */
export function easeOutCubic(t: number): number {
  const x = MathUtils.clamp(t, 0, 1);
  return 1 - (1 - x) ** 3;
}

/** Dépasse un peu sa cible et revient: un geste qui « clique » en place. */
export function easeOutBack(t: number, overshoot = 1.4): number {
  const x = MathUtils.clamp(t, 0, 1);
  return 1 + (overshoot + 1) * (x - 1) ** 3 + overshoot * (x - 1) ** 2;
}

export function roundedRect<T extends Shape | Path>(target: T, w: number, d: number, r: number): T {
  const x = -w / 2;
  const y = -d / 2;
  target.moveTo(x + r, y);
  target.lineTo(x + w - r, y);
  target.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  target.lineTo(x + w, y + d - r);
  target.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
  target.lineTo(x + r, y + d);
  target.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(x, y + r);
  target.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return target;
}

/** Une forme plane extrudée vers le HAUT (+y), base à y = 0. */
export function extrudeUp(shape: Shape, depth: number, bevel: number): ExtrudeGeometry {
  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 14,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return geo;
}

/**
 * Rend une pièce irrégulière: chaque sommet est poussé depuis le centre par un
 * bruit lisse. Le décalage dépend de la POSITION, pas de la normale — deux
 * sommets confondus sur une arête bougent ensemble et la pièce ne s'ouvre pas.
 */
export function lumpy<G extends BufferGeometry>(geometry: G, amount: number, frequency: number): G {
  const position = geometry.getAttribute("position");
  const p = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const n = Math.sin(p.x * frequency + 1.7) * Math.sin(p.y * frequency * 1.31 + 0.4) * Math.sin(p.z * frequency * 0.83 + 2.3);
    p.multiplyScalar(1 + amount * n);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  position.needsUpdate = true;
  return geometry;
}

// ── LE STUDIO ────────────────────────────────────────────────────────────────

export interface Studio {
  renderer: WebGLRenderer;
  scene: Scene;
  /** Libère tout ce que la scène tient: géométries, matériaux, textures, contexte. */
  dispose(): void;
}

export function createStudio(canvas: HTMLCanvasElement, shadowSpan: number): Studio {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.5;

  // Lumière principale chaude, en haut à gauche. Ses ombres ne servent QU'AUX
  // objets entre eux (les morceaux s'ombrent dans la boîte); le sol n'en reçoit
  // aucune — une ombre portée de carte d'ombre y faisait un rectangle gris dur.
  // Le sol n'a que des ombres de contact peintes, toujours douces.
  const key = new DirectionalLight("#FFEBD8", 2.25);
  key.position.set(-3, 6.5, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -shadowSpan;
  key.shadow.camera.right = shadowSpan;
  key.shadow.camera.top = shadowSpan;
  key.shadow.camera.bottom = -shadowSpan;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 18;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 2.5;
  scene.add(key);
  scene.add(new HemisphereLight("#FFFFFF", "#EAD9E2", 0.4));
  // Un contre-jour rosé, derrière à droite: il détache le bord des objets.
  const rim = new DirectionalLight("#FFE3EF", 1.3);
  rim.position.set(3.5, 3, -4.5);
  scene.add(rim);

  return {
    renderer,
    scene,
    dispose() {
      disposeTree(scene);
      envMap.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

export function disposeTree(root: Object3D) {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as Material | Material[] | undefined;
    for (const mat of Array.isArray(material) ? material : material ? [material] : []) {
      const { map, bumpMap } = mat as MeshStandardMaterial;
      if (map) textures.add(map);
      if (bumpMap) textures.add(bumpMap);
      mat.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

/** Une ombre de contact: un halo doux, teinte `fig-950` (36, 16, 30). */
export function contactShadow(w: number, d: number, strength = 1): Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, `rgba(36,16,30,${0.42 * strength})`);
  g.addColorStop(0.5, `rgba(36,16,30,${0.16 * strength})`);
  g.addColorStop(1, "rgba(36,16,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const mesh = new Mesh(
    new PlaneGeometry(w, d),
    new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;
  return mesh;
}

// ── LES MATÉRIAUX ────────────────────────────────────────────────────────────

/**
 * ⚠️ DU VERRE TRANSPARENT, PAS DE LA TRANSMISSION. Le verre « physique »
 * (`transmission`) rendait le fond du canvas — vide — en blanc laiteux, et la
 * paroi avant cachait précisément ce qu'elle doit montrer: la hauteur des
 * portions. Il coûte aussi une seconde passe de rendu par image.
 */
export function glassMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: "#FFFFFF",
    metalness: 0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: DoubleSide,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.7,
  });
}

export function lidMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color: FIG_700, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.28 });
}

export interface FoodMaterials {
  /** Légumes, grains, herbes: mat. */
  food: MeshStandardMaterial;
  /** Un peu brillant: le jus d'un plat rôti (saumon, pommes de terre, tofu). */
  roast: MeshStandardMaterial;
  /** Le poulet: ses couleurs sont dans la géométrie (`chickenGeometry`), la peau luit un peu. */
  chicken: MeshPhysicalMaterial;
}

export function foodMaterials(): FoodMaterials {
  return {
    food: new MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.58, metalness: 0 }),
    roast: new MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.42, metalness: 0 }),
    chicken: new MeshPhysicalMaterial({
      color: "#FFFFFF",
      vertexColors: true,
      roughness: 0.44,
      metalness: 0,
      clearcoat: 0.22,
      clearcoatRoughness: 0.45,
      bumpMap: skinBumpTexture(),
      bumpScale: 1.1,
    }),
  };
}

// ── LE POULET RÔTI ───────────────────────────────────────────────────────────
// ⟳ 2026-09-23 — UN MORCEAU DE HAUT DE CUISSE, PAS UN CUBE. Le poulet était un
// pavé arrondi orangé: à côté des rondelles de carotte, les deux se
// confondaient. Un morceau de poulet rôti se reconnaît à DEUX surfaces: la
// PEAU, dorée, brunie par le four, piquée de paprika; et la CHAIR, claire, là
// où le couteau a coupé. La forme: ronde, bosselée, tranchée d'un ou deux
// côtés, un peu tassée dessous.
const CHICKEN_SKIN_LIGHT = "#D9722B";
const CHICKEN_SKIN = "#B84818";
const CHICKEN_SKIN_DARK = "#7E2A0E";
const CHICKEN_CHAR = "#5A2610";
const CHICKEN_PAPRIKA = "#A3301A";
const CHICKEN_MEAT = "#D6A677";
const CHICKEN_MEAT_DARK = "#BF8A58";

function skinBumpTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(31);
  // Des cloques de peau rôtie: de petites bosses claires, quelques creux.
  for (let i = 0; i < 520; i++) {
    const v = rng() < 0.7 ? 150 + rng() * 80 : 40 + rng() * 50;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 0.8 + rng() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/**
 * Un morceau de poulet rôti, ~2,6 × 1,4 × 1,9 cm à l'échelle des boîtes. Ses
 * couleurs sont PEINTES dans la géométrie (attribut `color`): la palette d'un
 * tas ne fait que les nuancer, d'un morceau à l'autre.
 */
export function chickenGeometry(seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const geometry = new SphereGeometry(1, 18, 13);
  const position = geometry.getAttribute("position");
  const sx = 0.128 * (0.9 + rng() * 0.25);
  const sy = 0.068 * (0.9 + rng() * 0.3);
  const sz = 0.094 * (0.9 + rng() * 0.25);
  const ph = [rng() * 6, rng() * 6, rng() * 6, rng() * 6];
  // Une ou deux coupes franches, plutôt sur les flancs.
  const cuts: Array<{ n: Vector3; d: number }> = [];
  const cutCount = rng() < 0.55 ? 2 : 1;
  for (let c = 0; c < cutCount; c++) {
    const a = rng() * Math.PI * 2;
    const n = new Vector3(Math.cos(a), (rng() - 0.3) * 0.7, Math.sin(a)).normalize();
    cuts.push({ n, d: 0.065 + rng() * 0.03 });
  }
  const cut = new Uint8Array(position.count);
  const p = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const lump = 1
      + 0.17 * Math.sin(p.x * 2.1 + ph[0]) * Math.sin(p.y * 2.6 + ph[1]) * Math.sin(p.z * 1.9 + ph[2])
      + 0.05 * Math.sin(p.x * 7.3 + ph[3]) * Math.sin(p.z * 6.1 + ph[0]);
    p.multiplyScalar(lump);
    p.set(p.x * sx, p.y * sy, p.z * sz);
    // Tassé dessous: il a cuit posé dans le plat.
    const floor = -sy * 0.55;
    if (p.y < floor) p.y = floor + (p.y - floor) * 0.3;
    for (const { n, d } of cuts) {
      const over = p.dot(n) - d;
      if (over > 0) {
        p.addScaledVector(n, -over);
        cut[i] = 1;
      }
    }
    position.setXYZ(i, p.x, p.y, p.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const normal = geometry.getAttribute("normal");
  const colors = new Float32Array(position.count * 3);
  const c = new Color();
  const skinLight = new Color(CHICKEN_SKIN_LIGHT);
  const skin = new Color(CHICKEN_SKIN);
  const skinDark = new Color(CHICKEN_SKIN_DARK);
  const char = new Color(CHICKEN_CHAR);
  const paprika = new Color(CHICKEN_PAPRIKA);
  const meat = new Color(CHICKEN_MEAT);
  const meatDark = new Color(CHICKEN_MEAT_DARK);
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    if (cut[i]) {
      // La chair: claire, avec le fil de la viande.
      const fiber = 0.5 + 0.5 * Math.sin((p.x * 0.8 + p.z) * 120 + ph[1]);
      c.copy(meat).lerp(meatDark, 0.35 * fiber + 0.15 * rng());
    } else {
      // La peau: plus rôtie sur le dessus, plus dorée sur les flancs.
      const up = MathUtils.clamp(normal.getY(i) * 0.5 + 0.5, 0, 1);
      c.copy(skinLight).lerp(skin, MathUtils.smoothstep(up, 0.15, 0.6)).lerp(skinDark, MathUtils.smoothstep(up, 0.6, 1) * 0.7);
      const blotch = Math.sin(p.x * 60 + ph[2]) * Math.sin(p.z * 55 + ph[3]) * Math.sin(p.y * 70 + ph[0]);
      if (blotch > 0.55) c.lerp(char, (blotch - 0.55) * 1.6);
      if (rng() < 0.1) c.lerp(paprika, 0.55);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

// ── LE CONTENANT EN VERRE ────────────────────────────────────────────────────

export interface GlassBoxSpec {
  w: number;
  d: number;
  h: number;
  wall: number;
  radius: number;
  floor: number;
  /** Les cloisons, par leur x (centre), dans le repère de la boîte. */
  dividers: readonly number[];
  dividerThickness: number;
}

export function makeGlassBox(spec: GlassBoxSpec, glass: Material): Group {
  const group = new Group();
  const wi = spec.w - 2 * spec.wall;
  const di = spec.d - 2 * spec.wall;
  const wallShape = roundedRect(new Shape(), spec.w, spec.d, spec.radius);
  wallShape.holes.push(roundedRect(new Path(), wi, di, spec.radius - spec.wall));
  group.add(new Mesh(extrudeUp(wallShape, spec.h - 0.03, 0.014), glass));
  group.add(new Mesh(extrudeUp(roundedRect(new Shape(), spec.w - 0.01, spec.d - 0.01, spec.radius), spec.floor - 0.02, 0.01), glass));
  const dividerH = spec.h - spec.floor - 0.08;
  for (const x of spec.dividers) {
    const divider = new Mesh(
      new BoxGeometry(spec.dividerThickness, dividerH, di - 0.004).translate(0, dividerH / 2 + spec.floor, 0),
      glass,
    );
    divider.position.x = x;
    group.add(divider);
  }
  return group;
}

// ── LE COUVERCLE ET SON ÉTIQUETTE ────────────────────────────────────────────
// Le couvercle du produit porte « pour qui — quel repas » (`boxLidLabel`).

export interface StickerText {
  name: string;
  meal: string;
}

function drawSticker(canvas: HTMLCanvasElement, sticker: StickerText) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 44);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = LINE;
  ctx.stroke();
  // Le petit angle figue: l'« équerre » des étiquettes de la charte.
  ctx.fillStyle = FIG_700;
  ctx.fillRect(64, 70, 44, 7);
  ctx.fillRect(64, 70, 7, 44);
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  ctx.font = '400 150px "Young Serif", Georgia, serif';
  ctx.fillText(sticker.name, 96, 238, w - 160);
  ctx.fillStyle = INK_SOFT;
  ctx.font = '600 50px "Public Sans", system-ui, sans-serif';
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "5px";
  ctx.fillText(sticker.meal.toLocaleUpperCase(), 100, 334, w - 170);
}

export interface LidSpec {
  w: number;
  d: number;
  radius: number;
  thickness: number;
  /** Largeur de l'étiquette, en unités de scène; sa hauteur suit le format 1024×420. */
  stickerWidth: number;
  /** Position de l'étiquette sur le dessus du couvercle (x, z). */
  stickerAt: readonly [number, number];
}

export interface Lid {
  group: Group;
  /** Redessine l'étiquette une fois les polices arrivées, puis appelle `onChange`. */
  whenFontsReady(onChange: () => void): void;
}

export function makeLid(spec: LidSpec, material: Material, sticker: StickerText, anisotropy: number): Lid {
  const group = new Group();
  const body = new Mesh(extrudeUp(roundedRect(new Shape(), spec.w, spec.d, spec.radius), spec.thickness - 0.05, 0.025), material);
  body.castShadow = true;
  group.add(body);
  // Les quatre clips: la marque d'une boîte de meal-prep, vue de loin.
  const clipW = Math.min(0.46, spec.w * 0.16);
  const clipGeo = new RoundedBoxGeometry(clipW, 0.2 * (spec.d / 1.42), 0.05, 2, 0.02);
  for (const [x, z, rot] of [
    [0, spec.d / 2 + 0.02, 0],
    [0, -(spec.d / 2 + 0.02), 0],
    [spec.w / 2 + 0.02, 0, Math.PI / 2],
    [-(spec.w / 2 + 0.02), 0, Math.PI / 2],
  ] as const) {
    const clip = new Mesh(clipGeo, material);
    clip.position.set(x, -0.03, z);
    clip.rotation.y = rot;
    clip.castShadow = true;
    group.add(clip);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 420;
  drawSticker(canvas, sticker);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const plane = new Mesh(
    new PlaneGeometry(spec.stickerWidth, spec.stickerWidth * (420 / 1024)),
    new MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.78, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(spec.stickerAt[0], spec.thickness + 0.002, spec.stickerAt[1]);
  group.add(plane);
  return {
    group,
    whenFontsReady(onChange) {
      if (typeof document === "undefined" || !document.fonts) return;
      Promise.all([
        document.fonts.load('400 150px "Young Serif"'),
        document.fonts.load('600 50px "Public Sans"'),
      ]).then(() => {
        drawSticker(canvas, sticker);
        texture.needsUpdate = true;
        onChange();
      }).catch(() => undefined);
    },
  };
}

// ── REMPLIR UN CONTENANT ─────────────────────────────────────────────────────

/** Une empreinte au sol: un rectangle, ou un disque quand `round`. */
export interface Area {
  x: number;
  z: number;
  w: number;
  d: number;
  round?: boolean;
}

/** Un remplissage dont on règle la hauteur (0 = vide), au-dessus de `base`. */
export interface Fill {
  update(h: number): void;
  /** Ce qui dépasse de la surface nominale: les morceaux du dessus. */
  topOffset: number;
}

export interface PileKind {
  geometry: BufferGeometry;
  palette: readonly string[];
  weight: number;
  /** Les rondelles et lamelles tombent plutôt à plat, comme dans une boîte. */
  flat?: boolean;
  material?: Material;
}

// Un tas de morceaux posés couche par couche, du fond jusqu'au bord. La hauteur
// décide lesquels sont montrés: un morceau dont le centre est sous la surface
// est entier, celui qui est juste au-dessus est en train de pousser. C'est ce
// qui fait « monter » la portion au lieu de l'étirer.
export function makePile(
  parent: Group,
  rng: () => number,
  area: Area,
  base: number,
  maxH: number,
  s: number,
  kinds: readonly PileKind[],
  material: Material,
  density = 1,
): Fill {
  const areaW = area.w - s * 0.55;
  const areaD = area.d - s * 0.55;
  const step = s * 0.74;
  const nx = Math.max(1, Math.floor(areaW / step));
  const nz = Math.max(1, Math.floor(areaD / step));
  type Spec = { kind: number; x: number; y: number; z: number; euler: Euler; k: Vector3 };
  const specs: Spec[] = [];
  let layer = 0;
  for (let y = s * 0.28; y <= maxH + s * 0.7; y += s * 0.46, layer++) {
    const shift = layer % 2 === 0 ? 0 : 0.5;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        if (density < 1 && rng() > density) continue;
        const jx = (rng() - 0.5) * step * 0.7;
        const jz = (rng() - 0.5) * step * 0.7;
        let x = -areaW / 2 + ((ix + 0.5 + shift) % nx) * (areaW / nx) + jx;
        let z = -areaD / 2 + (iz + 0.5) * (areaD / nz) + jz;
        if (area.round) {
          // Hors du disque: on écarte le morceau plutôt que de le ramener au
          // bord, sinon le pourtour se couvre d'une couronne trop dense.
          if ((x / (areaW / 2)) ** 2 + (z / (areaD / 2)) ** 2 > 1) continue;
        }
        x = MathUtils.clamp(x, -areaW / 2, areaW / 2);
        z = MathUtils.clamp(z, -areaD / 2, areaD / 2);
        const pick = rng();
        let kind = 0;
        let acc = 0;
        for (let k = 0; k < kinds.length; k++) {
          acc += kinds[k].weight;
          if (pick <= acc) { kind = k; break; }
        }
        const b = 0.82 + rng() * 0.36;
        specs.push({
          kind,
          x: area.x + x,
          y: y + (rng() - 0.5) * s * 0.3,
          z: area.z + z,
          euler: new Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2),
          k: new Vector3(b * (0.9 + rng() * 0.2), b * (0.9 + rng() * 0.2), b * (0.9 + rng() * 0.2)),
        });
      }
    }
  }
  const meshes = kinds.map((kind, i) => {
    const count = specs.filter((sp) => sp.kind === i).length;
    const mesh = new InstancedMesh(kind.geometry, kind.material ?? material, Math.max(1, count));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  });
  const cursor = kinds.map(() => 0);
  const color = new Color();
  const pieces = specs.map((sp) => {
    const mesh = meshes[sp.kind];
    const index = cursor[sp.kind]++;
    const kind = kinds[sp.kind];
    color.set(kind.palette[Math.floor(rng() * kind.palette.length)]);
    color.offsetHSL(0, 0, (rng() - 0.5) * 0.05);
    mesh.setColorAt(index, color);
    const euler = kind.flat
      ? new Euler((rng() - 0.5) * 0.9, rng() * Math.PI * 2, (rng() - 0.5) * 0.9)
      : sp.euler;
    return {
      mesh,
      index,
      pos: new Vector3(sp.x, base + sp.y, sp.z),
      quat: new Quaternion().setFromEuler(euler),
      scale: sp.k,
      y: sp.y,
    };
  });
  for (const mesh of meshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const m = new Matrix4();
  const k = new Vector3();
  // ⟳ 2026-09-23 — RETOUR AU RENDU DE LA PREMIÈRE VERSION (demande du
  // propriétaire). Trois variantes ont été essayées puis retirées le même soir:
  // une « chute » des morceaux (une rangée restait figée en l'air au-dessus du
  // poulet et des poivrons), une chute limitée au mouvement, puis un seuil par
  // COUCHE ENTIÈRE (un dessus plat et régulier qui se lisait comme un bug).
  // Ce qui reste est le rendu validé: chaque morceau grandit SUR PLACE, et ceux
  // juste au-dessus de la surface, à moitié poussés, font un dessus naturel.
  const band = s * 0.9;
  // Un morceau enfoui sous deux couches et loin des parois ne se voit jamais:
  // il est éteint (échelle nulle) pour ne pas coûter au rendu. Ceux du bord
  // restent, on les voit à travers le verre.
  const buried = s * 1.6;
  const edgeW = areaW / 2 - step;
  const edgeD = areaD / 2 - step;
  const edge = pieces.map((p) => Math.abs(p.pos.x - area.x) > edgeW || Math.abs(p.pos.z - area.z) > edgeD);
  let lastH = Number.NaN;
  const fill: Fill = {
    topOffset: s * 0.45,
    update(h: number) {
      if (Math.abs(h - lastH) < 1e-4) return;
      lastH = h;
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        const grow = !edge[i] && h - p.y > buried ? 0 : smoothstep(p.y - band, p.y, h);
        k.copy(p.scale).multiplyScalar(grow);
        m.compose(p.pos, p.quat, k);
        p.mesh.setMatrixAt(p.index, m);
      }
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    },
  };
  fill.update(-s);
  return fill;
}

/** Le poulet rôti et ses légumes, mélangés: la casserole principale. */
export function roastTrayKinds(materials: FoodMaterials): PileKind[] {
  return [
    // Deux formes de morceaux, pour qu'un tas ne répète pas le même.
    { geometry: chickenGeometry(7), palette: CHICKEN, weight: 0.21, material: materials.chicken },
    { geometry: chickenGeometry(19), palette: CHICKEN, weight: 0.21, material: materials.chicken },
    { geometry: lumpy(new CylinderGeometry(0.074, 0.07, 0.048, 16, 1), 0.12, 30), palette: CARROT, weight: 0.34, flat: true },
    // Une lamelle de poivron: un arc APLATI. Un tore rond se lisait comme un ver.
    { geometry: new TorusGeometry(0.09, 0.032, 5, 14, 1.9).scale(1, 1, 0.32), palette: PEPPER, weight: 0.24, flat: true },
  ];
}

export function herbKinds(): PileKind[] {
  return [{ geometry: new BoxGeometry(0.05, 0.006, 0.03), palette: HERB, weight: 1, flat: true }];
}

function speckleTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#A87D45";
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(7);
  for (let i = 0; i < 3400; i++) {
    ctx.fillStyle = BULGUR[Math.floor(rng() * BULGUR.length)];
    ctx.beginPath();
    ctx.ellipse(rng() * size, rng() * size, 2 + rng() * 2.4, 1.2 + rng() * 1.4, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = HERB[Math.floor(rng() * HERB.length)];
    ctx.fillRect(rng() * size, rng() * size, 2 + rng() * 3, 1.5 + rng() * 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1.4, 1.4);
  return texture;
}

// LE BOULGOUR: UN CORPS, ET DES GRAINS À SA SURFACE. Remplir un contenant de
// grains un par un en demanderait des dizaines de milliers; le corps donne le
// volume vu à travers le verre, les grains et les herbes ne vivent qu'en
// surface et montent avec elle.
export function makeGrainBed(parent: Group, rng: () => number, area: Area, base: number, material: Material, grainCount: number): Fill {
  const bodyGeometry = area.round
    ? new CylinderGeometry(1, 1, 1, 40).scale(area.w / 2 - 0.006, 1, area.d / 2 - 0.006).translate(0, 0.5, 0)
    : new BoxGeometry(area.w - 0.012, 1, area.d - 0.012).translate(0, 0.5, 0);
  const body = new Mesh(bodyGeometry, new MeshStandardMaterial({ map: speckleTexture(), roughness: 0.92 }));
  body.position.set(area.x, base, area.z);
  body.receiveShadow = true;
  parent.add(body);

  const surface = new Group();
  surface.position.set(area.x, base, area.z);
  parent.add(surface);

  const grains = new InstancedMesh(new SphereGeometry(0.02, 6, 4), material, grainCount);
  grains.castShadow = true;
  grains.receiveShadow = true;
  const herbs = new InstancedMesh(new BoxGeometry(0.036, 0.005, 0.024), material, Math.max(8, Math.round(grainCount / 24)));
  herbs.castShadow = true;
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  const c = new Color();
  const inside = (margin: number): [number, number] => {
    for (;;) {
      const x = (rng() - 0.5) * (area.w - margin);
      const z = (rng() - 0.5) * (area.d - margin);
      if (!area.round || (x / ((area.w - margin) / 2)) ** 2 + (z / ((area.d - margin) / 2)) ** 2 <= 1) return [x, z];
    }
  };
  // Un léger dôme: le centre est un peu plus haut que les bords.
  const dome = (x: number, z: number) => 0.045 * Math.max(0, 1 - (x / (area.w / 2)) ** 2) * Math.max(0, 1 - (z / (area.d / 2)) ** 2);
  for (let i = 0; i < grains.count; i++) {
    const [x, z] = inside(0.04);
    p.set(x, dome(x, z) + (rng() - 0.3) * 0.02, z);
    q.setFromEuler(e.set(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
    const k = 0.8 + rng() * 0.5;
    s.set(k, 0.62 * k, 1.55 * k);
    grains.setMatrixAt(i, m.compose(p, q, s));
    grains.setColorAt(i, c.set(BULGUR[Math.floor(rng() * BULGUR.length)]));
  }
  for (let i = 0; i < herbs.count; i++) {
    const [x, z] = inside(0.1);
    p.set(x, dome(x, z) + 0.018 + rng() * 0.01, z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5));
    const k = 0.7 + rng() * 0.8;
    s.set(k, 1, k);
    herbs.setMatrixAt(i, m.compose(p, q, s));
    herbs.setColorAt(i, c.set(HERB[Math.floor(rng() * HERB.length)]));
  }
  surface.add(grains, herbs);

  const fill: Fill = {
    topOffset: 0.06,
    update(h: number) {
      const shown = Math.max(0.0001, h);
      body.scale.y = shown;
      surface.position.y = base + shown;
      surface.visible = h > 0.01;
      body.visible = h > 0.002;
    },
  };
  fill.update(0);
  return fill;
}

// ── LE TÉLÉPHONE ─────────────────────────────────────────────────────────────
// Environ 8 × 16 cm à l'échelle des boîtes. L'écran est une surface à coins
// arrondis dont les UV couvrent 0..1, pour recevoir une texture (un rendu, un
// fond d'écran).

export const PHONE = { w: 0.8, h: 1.64, d: 0.09, screenW: 0.72, screenH: 1.56 } as const;

export interface Phone {
  group: Group;
  screen: Mesh;
}

export function makePhone(screenMaterial: Material): Phone {
  const group = new Group();
  const shell = new MeshPhysicalMaterial({ color: "#24101E", roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const body = new Mesh(new RoundedBoxGeometry(PHONE.w, PHONE.h, PHONE.d, 4, 0.11), shell);
  body.castShadow = true;
  group.add(body);
  const shape = roundedRect(new Shape(), PHONE.screenW, PHONE.screenH, 0.08);
  const geometry = new ShapeGeometry(shape, 12);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / PHONE.screenW + 0.5, position.getY(i) / PHONE.screenH + 0.5);
  }
  uv.needsUpdate = true;
  const screen = new Mesh(geometry, screenMaterial);
  screen.position.z = PHONE.d / 2 + 0.001;
  group.add(screen);
  // Le bloc photo, au dos: ce qui dit « téléphone » vu de derrière.
  const bump = new Mesh(new RoundedBoxGeometry(0.3, 0.3, 0.03, 2, 0.06), shell);
  bump.position.set(-0.18, 0.56, -PHONE.d / 2 - 0.012);
  group.add(bump);
  const lensMaterial = new MeshPhysicalMaterial({ color: "#0B0609", roughness: 0.1, clearcoat: 1 });
  for (const [x, y] of [[-0.24, 0.62], [-0.12, 0.5]] as const) {
    const lens = new Mesh(new CylinderGeometry(0.045, 0.045, 0.02, 20), lensMaterial);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, y, -PHONE.d / 2 - 0.03);
    group.add(lens);
  }
  return { group, screen };
}

// ── LA BATTERIE: LE PLAT À RÔTIR ET LA COCOTTE (le récit du planning) ────────

export interface DishSpec {
  w: number;
  d: number;
  h: number;
  wall: number;
  radius: number;
  floor: number;
}

/** Un plat à rôtir en céramique crème, avec ses deux anses. */
export function makeRoastingDish(spec: DishSpec): Group {
  const dish = new Group();
  const ceramic = new MeshPhysicalMaterial({ color: "#F3EDE6", roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const ring = roundedRect(new Shape(), spec.w, spec.d, spec.radius);
  ring.holes.push(roundedRect(new Path(), spec.w - 2 * spec.wall, spec.d - 2 * spec.wall, spec.radius - spec.wall));
  const walls = new Mesh(extrudeUp(ring, spec.h - 0.04, 0.03), ceramic);
  walls.castShadow = true;
  dish.add(walls);
  dish.add(new Mesh(extrudeUp(roundedRect(new Shape(), spec.w - 0.02, spec.d - 0.02, spec.radius), spec.floor - 0.03, 0.02), ceramic));
  for (const side of [-1, 1]) {
    const handle = new Mesh(new RoundedBoxGeometry(0.3, 0.1, Math.min(0.9, spec.d * 0.4), 2, 0.04), ceramic);
    handle.position.set(side * (spec.w / 2 + 0.1), spec.h - 0.12, 0);
    dish.add(handle);
  }
  return dish;
}

export interface PotSpec {
  r: number;
  h: number;
  wall: number;
  floor: number;
}

/**
 * Une cocotte émaillée figue, avec ses deux oreilles. Le profil est tourné:
 * paroi extérieure, bord, paroi intérieure, fond.
 */
export function makePot(spec: PotSpec): Group {
  const pot = new Group();
  const { r, h, wall, floor } = spec;
  const profile = [
    [0, 0], [r - 0.08, 0], [r, 0.08], [r, h - 0.03], [r - 0.012, h], [r - wall + 0.012, h],
    [r - wall, h - 0.03], [r - wall, floor + 0.06], [r - wall - 0.06, floor], [0, floor],
  ].map(([x, y]) => new Vector2(x, y));
  const enamel = new MeshPhysicalMaterial({ color: FIG_800, roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2, side: DoubleSide });
  const shell = new Mesh(new LatheGeometry(profile, 56), enamel);
  shell.castShadow = true;
  pot.add(shell);
  for (const side of [-1, 1]) {
    const ear = new Mesh(new RoundedBoxGeometry(0.22, 0.1, 0.42, 2, 0.04), enamel);
    ear.position.set(side * (r + 0.08), h - 0.16, 0);
    pot.add(ear);
  }
  return pot;
}
