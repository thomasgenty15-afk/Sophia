import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { BULGUR, FIG_700, INK_SOFT, LINE, PAPER, mulberry32, roundedRect } from "./mealKit";

// LES LÉGUMES CRUS DE L'ÉTAPE « TES COURSES » — EN DÉTAIL.
//
// Vus de près et d'en haut (la caméra de l'étape 1 est à 60°), ils doivent se
// reconnaître sans légende: la carotte à sa silhouette effilée, ses anneaux et
// ses fanes en plumet; le poivron à ses quatre lobes et à sa queue plantée dans
// un creux; le citron à ses deux pointes et à sa peau piquetée; la barquette
// de poulet à son rebord, son film brillant et son étiquette; le sachet de
// boulgour à sa silhouette de sachet debout, son papier kraft et sa fenêtre
// sur les grains. Tout est procédural: aucun fichier de modèle à télécharger.

const tmp = new Color();

/** Écrit une couleur par sommet, calculée depuis sa position. */
function paintVertices(geometry: BufferGeometry, paint: (x: number, y: number, z: number, out: Color) => void) {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const c = new Color();
  for (let i = 0; i < position.count; i++) {
    paint(position.getX(i), position.getY(i), position.getZ(i), c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
}

// ── LA CAROTTE ───────────────────────────────────────────────────────────────

const CARROT_LENGTH = 1.1;

/**
 * Une carotte COUCHÉE: son axe le long de +x, la pointe vers -x, le collet et
 * les fanes vers +x. Posée, son axe est à ~0,12 du sol.
 */
export function makeCarrot(seed: number): Group {
  const rng = mulberry32(seed);
  const L = CARROT_LENGTH;
  // Le profil: une pointe fine, un corps qui s'épaissit, un collet arrondi.
  const profile: Vector2[] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    profile.push(new Vector2(0.004 + 0.116 * Math.pow(t, 0.6), t * L));
  }
  profile.push(new Vector2(0.11, L + 0.022), new Vector2(0.085, L + 0.042), new Vector2(0.045, L + 0.052), new Vector2(0, L + 0.054));
  const geometry = new LatheGeometry(profile, 24);
  const position = geometry.getAttribute("position");
  const phase = rng() * 6;
  const bend = 0.04 + rng() * 0.04;
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    const y = position.getY(i);
    let z = position.getZ(i);
    const t = Math.min(1, y / L);
    // Les anneaux: des sillons en travers, irréguliers, plus marqués au milieu.
    const ring = 1 + 0.05 * Math.sin(y * 44 + Math.sin(y * 7 + phase) * 1.8) * Math.min(1, t * 4) * (1 - t * 0.4)
      + 0.018 * Math.sin(Math.atan2(z, x) * 3 + y * 17);
    x *= ring;
    z *= ring;
    // Une carotte n'est jamais droite.
    x += bend * Math.sin(t * Math.PI);
    position.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  paintVertices(geometry, (_x, y, _z, c) => {
    const t = y / L;
    const groove = 0.5 + 0.5 * Math.sin(y * 44 + Math.sin(y * 7 + phase) * 1.8);
    c.set("#EC7D22").lerp(tmp.set("#C4561A"), 0.4 * groove * Math.min(1, t * 4));
    if (t > 0.93) c.lerp(tmp.set("#7E6A25"), Math.min(1, (t - 0.93) / 0.07) * 0.7);
    if (t < 0.18) c.lerp(tmp.set("#D46418"), ((0.18 - t) / 0.18) * 0.5);
  });
  const body = new Mesh(geometry, new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45 }));
  body.castShadow = true;

  // Les fanes: cinq tiges en éventail qui retombent vers la table, chacune
  // garnie de folioles par paires. Dans le repère de la carotte DEBOUT (+y),
  // l'éventail s'ouvre en z (à plat une fois couchée) et retombe en +x.
  const upright = new Group();
  upright.add(body);
  const stemMaterial = new MeshPhysicalMaterial({ color: "#4C7A2A", roughness: 0.6 });
  const greens = ["#4F7F2A", "#5F9133", "#6FA23C", "#44702A"];
  const leafletGeometry = new SphereGeometry(1, 8, 6).scale(0.007, 0.05, 0.022);
  const leaflets = new InstancedMesh(leafletGeometry, new MeshPhysicalMaterial({ color: "#FFFFFF", roughness: 0.55 }), 5 * 9 * 2);
  const m = new Matrix4();
  const q = new Quaternion();
  const axisX = new Vector3(1, 0, 0);
  const at = new Vector3();
  const tangent = new Vector3();
  const c = new Color();
  let n = 0;
  for (let s = 0; s < 5; s++) {
    const spread = (s - 2) * 0.28 + (rng() - 0.5) * 0.12;
    const length = 0.42 + rng() * 0.26;
    const base = new Vector3(0, L + 0.04, 0);
    const curve = new CatmullRomCurve3([
      base,
      new Vector3(0.02, L + 0.04 + length * 0.35, Math.sin(spread) * length * 0.3),
      new Vector3(0.06, L + 0.04 + length * 0.7, Math.sin(spread) * length * 0.62),
      new Vector3(0.1, L + 0.04 + length, Math.sin(spread) * length * 0.9),
    ]);
    const stem = new Mesh(new TubeGeometry(curve, 14, 0.009, 5, false), stemMaterial);
    stem.castShadow = true;
    upright.add(stem);
    for (let k = 0; k < 9; k++) {
      const u = 0.22 + (k / 8) * 0.76;
      curve.getPoint(u, at);
      curve.getTangent(u, tangent);
      for (const side of [-1, 1]) {
        if (n >= leaflets.count) break;
        // Une foliole: à plat dans le plan de la table, écartée de la tige.
        const angle = Math.atan2(tangent.z, tangent.y) + side * (0.7 + rng() * 0.3);
        // Tourner +y autour de x d'un angle a le mène en (cos a, sin a) dans le
        // plan y-z: le même sens que l'écart appliqué à la position.
        q.setFromAxisAngle(axisX, angle);
        const grow = 0.6 + u * 0.7;
        m.compose(
          new Vector3(at.x + 0.004, at.y + Math.cos(angle) * 0.03 * grow, at.z + Math.sin(angle) * 0.03 * grow),
          q,
          new Vector3(1, grow, grow),
        );
        leaflets.setMatrixAt(n, m);
        leaflets.setColorAt(n, c.set(greens[Math.floor(rng() * greens.length)]));
        n++;
      }
    }
  }
  leaflets.count = n;
  leaflets.castShadow = true;
  upright.add(leaflets);

  // Couchée: l'axe +y devient +x, et le +x du repère debout (où retombent les
  // fanes) devient -y — vers la table.
  upright.rotation.z = -Math.PI / 2;
  // Centrée sur son ancre: la carotte fait ~1,15 de la pointe au collet.
  upright.position.x = -0.58;
  const carrot = new Group();
  carrot.add(upright);
  return carrot;
}

// ── LE POIVRON ───────────────────────────────────────────────────────────────

/** Un poivron debout, son centre à l'origine: le bas à ~ -0,34, la queue en haut. */
export function makePepper(color: string, seed: number): Group {
  const rng = mulberry32(seed);
  const R = 0.34;
  const geometry = new SphereGeometry(R, 56, 40);
  const position = geometry.getAttribute("position");
  const phase = rng() * Math.PI;
  const lobeOf = (x: number, z: number) => Math.cos(4 * Math.atan2(z, x) + phase);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const v = y / R;
    const lobe = lobeOf(x, z);
    // Quatre lobes, plus marqués vers le bas; un corps un peu plus « carré »
    // qu'une sphère au milieu.
    const radial = (1 + lobe * (0.065 + 0.06 * Math.max(0, -v))) * (1 + 0.08 * (1 - v * v));
    let ny = y * 1.06;
    // Le creux où la queue est plantée.
    if (v > 0.72) ny -= Math.pow((v - 0.72) / 0.28, 1.6) * 0.13;
    // Les bosses du dessous.
    if (v < -0.66) ny += lobe * 0.04 * ((-v - 0.66) / 0.34);
    position.setXYZ(i, x * radial, ny, z * radial);
  }
  geometry.computeVertexNormals();
  const base = new Color(color);
  paintVertices(geometry, (x, y, z, c) => {
    const v = y / (R * 1.06);
    const groove = (lobeOf(x, z) + 1) / 2;
    c.copy(base).multiplyScalar(0.78 + 0.22 * groove);
    if (v > 0.6) c.multiplyScalar(1 - Math.min(1, (v - 0.6) / 0.4) * 0.25);
  });
  const body = new Mesh(geometry, new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 }));
  body.castShadow = true;
  const pepper = new Group();
  pepper.add(body);

  // La queue: courbe, épaisse, coupée net; et la collerette verte à sa base.
  const top = R * 1.06 - 0.13;
  const stemCurve = new CatmullRomCurve3([
    new Vector3(0, top - 0.02, 0),
    new Vector3(0, top + 0.06, 0),
    new Vector3(0.025, top + 0.13, 0.015),
    new Vector3(0.07, top + 0.17, 0.045),
  ]);
  const stemMaterial = new MeshPhysicalMaterial({ color: "#4D6F2B", roughness: 0.5, clearcoat: 0.3 });
  const stem = new Mesh(new TubeGeometry(stemCurve, 12, 0.03, 10, false), stemMaterial);
  stem.castShadow = true;
  pepper.add(stem);
  const cut = new Mesh(new CircleGeometry(0.03, 12), new MeshPhysicalMaterial({ color: "#A9B976", roughness: 0.7 }));
  const end = stemCurve.getPoint(1);
  const endTangent = stemCurve.getTangent(1);
  cut.position.copy(end);
  cut.lookAt(end.clone().add(endTangent));
  pepper.add(cut);
  const star = new Shape();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.095 : 0.045;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const calyx = new Mesh(
    new ExtrudeGeometry(star, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 }).rotateX(-Math.PI / 2),
    new MeshPhysicalMaterial({ color: "#3F6A24", roughness: 0.55 }),
  );
  calyx.position.y = top - 0.005;
  calyx.rotation.y = rng() * Math.PI;
  pepper.add(calyx);
  return pepper;
}

// ── LE CITRON ────────────────────────────────────────────────────────────────

function poresTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(11);
  for (let i = 0; i < 2600; i++) {
    const shade = Math.floor(90 + rng() * 60);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 0.8 + rng() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

/** Un citron couché, son grand axe le long de x, ses deux pointes aux bouts. */
export function makeLemon(): Mesh {
  const R = 0.2;
  const geometry = new SphereGeometry(R, 44, 30);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    let y = position.getY(i);
    let z = position.getZ(i);
    const ax = Math.abs(x) / R;
    x *= 1.26;
    if (ax > 0.72) {
      const tip = Math.pow((ax - 0.72) / 0.28, 2);
      x += Math.sign(x) * tip * 0.07;
      y *= 1 - tip * 0.3;
      z *= 1 - tip * 0.3;
    }
    position.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  paintVertices(geometry, (x, _y, _z, c) => {
    const ax = Math.abs(x) / (R * 1.26);
    c.set("#F3C530");
    if (ax > 0.7) c.lerp(tmp.set("#C7C24A"), Math.min(1, (ax - 0.7) / 0.3) * 0.7);
  });
  const lemon = new Mesh(
    geometry,
    new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, bumpMap: poresTexture(), bumpScale: 1.2 }),
  );
  lemon.castShadow = true;
  return lemon;
}

// ── LES OUTILS DES DEUX EMBALLAGES ───────────────────────────────────────────

/** Une toile dessinée une fois, rendue en texture. */
function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, color: boolean): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new CanvasTexture(canvas);
  if (color) texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Le contour d'un rectangle arrondi, échantillonné avec le MÊME nombre de
 * points quelle que soit sa taille: deux contours successifs se relient point
 * à point, et la barquette se construit anneau par anneau.
 */
function roundedRing(w: number, d: number, r: number, y: number): Vector3[] {
  const PER_CORNER = 8;
  const PER_LONG = 12;
  const PER_SHORT = 8;
  const cx = w / 2 - r;
  const cz = d / 2 - r;
  const out: Vector3[] = [];
  const corners: Array<[number, number, number]> = [[cx, cz, 0], [-cx, cz, Math.PI / 2], [-cx, -cz, Math.PI], [cx, -cz, Math.PI * 1.5]];
  corners.forEach(([ox, oz, a0], i) => {
    for (let k = 0; k < PER_CORNER; k++) {
      const a = a0 + (k / PER_CORNER) * (Math.PI / 2);
      out.push(new Vector3(ox + Math.cos(a) * r, y, oz + Math.sin(a) * r));
    }
    // Le côté qui suit le coin: d'un bout de l'arc au début du coin suivant.
    const a1 = a0 + Math.PI / 2;
    const from = new Vector3(ox + Math.cos(a1) * r, y, oz + Math.sin(a1) * r);
    const [nx, nz, na] = corners[(i + 1) % 4];
    const to = new Vector3(nx + Math.cos(na) * r, y, nz + Math.sin(na) * r);
    const count = i % 2 === 0 ? PER_LONG : PER_SHORT;
    for (let k = 0; k < count; k++) out.push(from.clone().lerp(to, k / count));
  });
  return out;
}

/** Une surface tendue d'anneau en anneau (les anneaux ont tous le même nombre de points). */
function loft(rings: Vector3[][]): BufferGeometry {
  const n = rings[0].length;
  const positions = new Float32Array(rings.length * n * 3);
  rings.forEach((ring, i) => ring.forEach((p, k) => p.toArray(positions, (i * n + k) * 3)));
  const index: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k;
      const b = i * n + ((k + 1) % n);
      index.push(a, b, b + n, a, b + n, a + n);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// ── LA BARQUETTE DE HAUTS DE CUISSE ──────────────────────────────────────────
// Ce qui la fait reconnaître d'en haut: un rebord plat tout autour, le coussin
// absorbant blanc qu'on devine sous la viande, la peau crue — pâle, bosselée,
// humide — avec la chair rose et le gras là où elle ne couvre pas, le bout
// d'os d'un haut de cuisse, et le film tendu par-dessus, qui brille.

const TRAY = { w: 1.94, d: 1.34, lip: 0.18, floor: 0.03 };

function skinBumpTexture(): CanvasTexture {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);
    const rng = mulberry32(53);
    // Les follicules de la peau crue: de petits creux serrés, quelques bosses.
    for (let i = 0; i < 2200; i++) {
      const v = rng() < 0.75 ? 60 + rng() * 40 : 150 + rng() * 60;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.arc(rng() * 256, rng() * 256, 0.7 + rng() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Les plis lâches de la peau.
    ctx.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(${rng() < 0.5 ? "40,40,40" : "200,200,200"},0.35)`;
      ctx.lineWidth = 2 + rng() * 3;
      ctx.beginPath();
      const x = rng() * 256;
      const y = rng() * 256;
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 20 + rng() * 30, y + (rng() - 0.5) * 40, x + 40 + rng() * 30, y + (rng() - 0.5) * 40, x + 70 + rng() * 40, y + (rng() - 0.5) * 30);
      ctx.stroke();
    }
  }, false);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

// ⚠️ PLUS SOMBRES QU'À L'ŒIL: sous la lumière du studio, une peau crue peinte
// à sa vraie couleur ressort blanche, et les trois morceaux se fondent.
const RAW_SKIN = "#E2A28E";
const RAW_SKIN_PALE = "#ECBBA5";
const RAW_SKIN_PINK = "#D6867A";
const RAW_CREASE = "#C06A62";
const RAW_MEAT = "#C85C57";
const RAW_MEAT_DARK = "#A94444";
const RAW_FAT = "#EED6B0";
const RAW_SKIN_YELLOW = "#E6B793";

/**
 * Un haut de cuisse cru, peau dessus, posé à plat: ~0,72 × 0,24 × 0,54, sa
 * base à y = 0. Le bout d'os sort du côté étroit, vers +x.
 */
function makeRawThigh(seed: number, skinBump: CanvasTexture): Group {
  const rng = mulberry32(seed);
  const A = 0.34;
  const Bz = 0.25;
  const HT = 0.2;
  const ph = [rng() * 6, rng() * 6, rng() * 6, rng() * 6, rng() * 6];
  const geometry = new SphereGeometry(1, 48, 30);
  const position = geometry.getAttribute("position");
  const lat = new Float32Array(position.count);
  const fold = new Float32Array(position.count);
  // Deux ou trois masses sous la peau: c'est leur relief qui dit « cuisse ».
  const lobes = Array.from({ length: 3 }, () => ({ x: (rng() - 0.5) * 1.1, z: (rng() - 0.5) * 0.9, r: 0.35 + rng() * 0.2 }));
  const footprint = (theta: number) =>
    (1 + 0.09 * Math.cos(2 * theta + ph[0]) + 0.06 * Math.cos(3 * theta + ph[1]) + 0.035 * Math.cos(5 * theta + ph[2]))
    // Plus étroit du côté de l'os (+x), plus large et rond de l'autre.
    * (1 - 0.16 * Math.max(0, Math.cos(theta)) ** 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    lat[i] = y;
    const R = footprint(Math.atan2(z, x));
    let nx = x * R * A;
    let nz = z * R * Bz;
    let ny: number;
    if (y >= 0) {
      // Le dôme, un peu tassé, avec les plis de la peau qui retombe.
      ny = Math.pow(y, 0.85) * HT * (0.85 + 0.08 * Math.sin(x * 3 + ph[3]));
      for (const lobe of lobes) {
        const d2 = ((x - lobe.x) ** 2 + (z - lobe.z) ** 2) / (lobe.r * lobe.r);
        ny += 0.045 * Math.exp(-d2) * y;
      }
      // Les plis de la peau lâche: des sillons étroits, pas des vagues.
      const crease = Math.sin(nx * 19 + Math.sin(nz * 13 + ph[4]) * 1.6 + ph[0]);
      fold[i] = Math.max(0, crease - 0.55) / 0.45 * y;
      ny -= 0.02 * fold[i];
      // La peau déborde un peu sur les flancs.
      const drape = 1 + 0.05 * (1 - y) * y * 4;
      nx *= drape;
      nz *= drape;
    } else {
      ny = y * 0.03;
    }
    position.setXYZ(i, nx, ny + 0.03, nz);
  }
  geometry.computeVertexNormals();
  const skin = new Color(RAW_SKIN);
  const pale = new Color(RAW_SKIN_PALE);
  const pink = new Color(RAW_SKIN_PINK);
  const meat = new Color(RAW_MEAT);
  const meatDark = new Color(RAW_MEAT_DARK);
  const fat = new Color(RAW_FAT);
  const creaseColor = new Color(RAW_CREASE);
  const yellow = new Color(RAW_SKIN_YELLOW);
  const colors = new BufferAttribute(new Float32Array(position.count * 3), 3);
  geometry.setAttribute("color", colors);
  const flesh = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = lat[i];
    const mottle = 0.5 + 0.5 * Math.sin(x * 23 + ph[1]) * Math.sin(z * 19 + ph[2]);
    tmp.copy(skin).lerp(pale, mottle * 0.6).lerp(pink, Math.max(0, Math.sin(x * 9 + z * 7 + ph[3])) * 0.45);
    // Le gras sous la peau la jaunit par plaques.
    tmp.lerp(yellow, Math.max(0, Math.sin(x * 7 - z * 11 + ph[2]) * Math.sin(z * 5 + ph[4]) - 0.2) * 0.8);
    tmp.lerp(creaseColor, fold[i] * 0.7);
    // Sous la peau, sur les flancs: la chair rose, et le gras qui borde la peau.
    const edge = 0.44 + 0.16 * Math.sin(Math.atan2(z, x) * 4 + ph[4]) + 0.07 * Math.sin(Math.atan2(z, x) * 9 + ph[0]);
    if (y < edge) {
      const under = Math.min(1, (edge - y) / 0.18);
      const fatBand = Math.max(0, 1 - Math.abs(y - (edge - 0.05)) / 0.08) * (0.55 + 0.45 * Math.sin(Math.atan2(z, x) * 6 + ph[1]));
      flesh.copy(meat).lerp(meatDark, 0.5 + 0.5 * Math.sin(x * 31 + z * 17));
      tmp.lerp(flesh, under);
      tmp.lerp(fat, fatBand * 0.85);
    }
    colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  const body = new Mesh(
    geometry,
    new MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.48,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      bumpMap: skinBump,
      bumpScale: 1.1,
    }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  const thigh = new Group();
  thigh.add(body);

  // Le bout d'os: deux condyles ivoire qui sortent à peine de la chair.
  const bone = new MeshPhysicalMaterial({ color: "#E8D9C6", roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const tip = A * footprint(0) * 0.99;
  [[0, 0.032, 0.04], [0.008, -0.03, 0.034]].forEach(([dx, dz, r]) => {
    const knob = new Mesh(new SphereGeometry(r, 16, 12).scale(1.2, 0.8, 1), bone);
    knob.position.set(tip + dx, 0.055, dz);
    knob.castShadow = true;
    thigh.add(knob);
  });
  const joint = new Mesh(new SphereGeometry(0.05, 14, 10).scale(1.3, 0.7, 1.5), new MeshPhysicalMaterial({ color: "#C9716A", roughness: 0.4, clearcoat: 0.5 }));
  joint.position.set(tip - 0.035, 0.05, 0);
  thigh.add(joint);
  return thigh;
}

function foamBumpTexture(): CanvasTexture {
  const texture = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 128, 128);
    const rng = mulberry32(71);
    // Les billes du polystyrène: des alvéoles serrées.
    for (let i = 0; i < 700; i++) {
      const v = 100 + rng() * 70;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.arc(rng() * 128, rng() * 128, 1.5 + rng() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, false);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function padBumpTexture(): CanvasTexture {
  const texture = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = "#909090";
    ctx.fillRect(0, 0, 128, 128);
    // Le matelassage en losanges du coussin absorbant.
    ctx.strokeStyle = "#505050";
    ctx.lineWidth = 3;
    for (let k = -128; k < 256; k += 32) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + 128, 128);
      ctx.moveTo(k + 128, 0);
      ctx.lineTo(k, 128);
      ctx.stroke();
    }
  }, false);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

/** Les reflets du film: noir partout (rien n'est ajouté), clair sur les traînées. */
function filmShineTexture(): CanvasTexture {
  return canvasTexture(512, 360, (ctx) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 512, 360);
    const rng = mulberry32(29);
    // Deux larges traînées douces, en biais, là où le film se bombe.
    for (const [x0, width, strength] of [[120, 80, 0.2], [310, 46, 0.14]] as const) {
      ctx.save();
      ctx.translate(x0, 180);
      ctx.rotate(-0.55);
      const g = ctx.createLinearGradient(-width, 0, width, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${strength})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-width, -300, width * 2, 600);
      ctx.restore();
    }
    // Les rides fines du film tiré.
    ctx.lineCap = "round";
    for (let i = 0; i < 16; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + rng() * 0.12})`;
      ctx.lineWidth = 0.6 + rng() * 1;
      const x = rng() * 512;
      const y = rng() * 360;
      const a = -0.55 + (rng() - 0.5) * 0.5;
      const l = 20 + rng() * 60;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rng() - 0.5) * 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }, true);
}

/** L'étiquette du rayon, sans un mot: un bandeau figue, des lignes, un code-barres. */
function trayLabelTexture(anisotropy: number): CanvasTexture {
  const texture = canvasTexture(320, 200, (ctx) => {
    ctx.clearRect(0, 0, 320, 200);
    ctx.beginPath();
    ctx.roundRect(4, 4, 312, 192, 16);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = FIG_700;
    ctx.fillRect(0, 0, 320, 50);
    ctx.restore();
    ctx.fillStyle = "#F3E6EC";
    ctx.fillRect(22, 20, 120, 11);
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(22, 72, 170, 10);
    ctx.fillRect(22, 94, 130, 10);
    ctx.fillStyle = LINE;
    ctx.fillRect(22, 116, 150, 8);
    // Le code-barres.
    const rng = mulberry32(5);
    let x = 200;
    ctx.fillStyle = "#3A2A34";
    while (x < 296) {
      const w = 1.5 + Math.floor(rng() * 3) * 1.5;
      ctx.fillRect(x, 70, w, 58);
      x += w + 1.5 + Math.floor(rng() * 2) * 1.5;
    }
    // Le cadre du prix, figue.
    ctx.beginPath();
    ctx.roundRect(22, 142, 150, 38, 8);
    ctx.fillStyle = FIG_700;
    ctx.fill();
    ctx.fillStyle = "#F3E6EC";
    ctx.fillRect(38, 157, 60, 9);
  }, true);
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * La barquette de hauts de cuisse crus, filmée, posée à plat: ~1,94 × 1,34, le
 * rebord à 0,18, le dessus du film à ~0,3. Sa base est à y = 0.
 */
export function makeChickenTray(seed: number, anisotropy = 1): Group {
  const tray = new Group();

  // La coque: anneau par anneau, du pied au rebord, puis la paroi intérieure
  // jusqu'au fond.
  const foam = new MeshPhysicalMaterial({ color: "#F4F0EA", roughness: 0.78, side: DoubleSide, bumpMap: foamBumpTexture(), bumpScale: 0.4 });
  const shell = new Mesh(loft([
    roundedRing(1.74, 1.14, 0.2, 0),
    roundedRing(1.84, 1.24, 0.22, 0.14),
    roundedRing(1.9, 1.3, 0.24, 0.162),
    roundedRing(TRAY.w, TRAY.d, 0.26, 0.17),
    roundedRing(TRAY.w - 0.01, TRAY.d - 0.01, 0.255, TRAY.lip),
    roundedRing(1.84, 1.24, 0.22, TRAY.lip + 0.004),
    roundedRing(1.79, 1.19, 0.2, 0.16),
    roundedRing(1.66, 1.06, 0.16, TRAY.floor + 0.012),
    roundedRing(1.62, 1.02, 0.15, TRAY.floor),
  ]), foam);
  shell.castShadow = true;
  shell.receiveShadow = true;
  tray.add(shell);
  const floor = new Mesh(new ShapeGeometry(roundedRect(new Shape(), 1.62, 1.02, 0.15), 8).rotateX(-Math.PI / 2).translate(0, TRAY.floor, 0), foam);
  floor.receiveShadow = true;
  tray.add(floor);

  // Le coussin absorbant, qu'on devine autour de la viande.
  const pad = new Mesh(
    new RoundedBoxGeometry(1.36, 0.022, 0.84, 2, 0.008),
    new MeshPhysicalMaterial({ color: "#FAF8F5", roughness: 0.9, bumpMap: padBumpTexture(), bumpScale: 0.8 }),
  );
  pad.position.y = TRAY.floor + 0.011;
  pad.receiveShadow = true;
  tray.add(pad);

  // Trois hauts de cuisse côte à côte, en travers, l'os tantôt devant,
  // tantôt derrière: rangés comme en rayon.
  const skinBump = skinBumpTexture();
  const thighs: Group[] = [];
  const PLACES = [
    { x: -0.53, z: 0.03, y: 0, yaw: Math.PI / 2 + 0.22, tilt: 0.05 },
    { x: 0.0, z: -0.04, y: 0.01, yaw: -Math.PI / 2 + 0.12, tilt: -0.04 },
    { x: 0.53, z: 0.05, y: 0, yaw: Math.PI / 2 - 0.18, tilt: 0.04 },
  ];
  PLACES.forEach((at, i) => {
    const thigh = makeRawThigh(seed + i * 17, skinBump);
    thigh.position.set(at.x, TRAY.floor + 0.02 + at.y, at.z);
    thigh.rotation.set(at.tilt, at.yaw, at.tilt * 0.5);
    tray.add(thigh);
    thighs.push(thigh);
  });

  // Le film: une membrane tendue du rebord par-dessus la viande. On range la
  // hauteur de la viande sur une grille, puis on relâche la membrane: chaque
  // point prend la moyenne de ses voisins sans jamais passer sous la viande.
  const NX = 52;
  const NZ = 36;
  // Le film s'arrête SUR le rebord, pas à son arête: posé jusqu'au bord, il
  // en dessinait le contour d'un trait sombre.
  const fw = TRAY.w - 0.07;
  const fd = TRAY.d - 0.07;
  const rim = TRAY.lip + 0.006;
  const obstacle = new Float32Array((NX + 1) * (NZ + 1)).fill(rim);
  const v = new Vector3();
  tray.updateMatrixWorld(true);
  for (const thigh of thighs) {
    thigh.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const gx = Math.round(((v.x + fw / 2) / fw) * NX);
        const gz = Math.round(((v.z + fd / 2) / fd) * NZ);
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = gx + dx;
            const z = gz + dz;
            if (x < 1 || x >= NX || z < 1 || z >= NZ) continue;
            const k = z * (NX + 1) + x;
            obstacle[k] = Math.max(obstacle[k], v.y + 0.012);
          }
        }
      }
    });
  }
  const height = Float32Array.from(obstacle);
  for (let pass = 0; pass < 260; pass++) {
    for (let z = 1; z < NZ; z++) {
      for (let x = 1; x < NX; x++) {
        const k = z * (NX + 1) + x;
        const mean = (height[k - 1] + height[k + 1] + height[k - NX - 1] + height[k + NX + 1]) / 4;
        height[k] = Math.max(obstacle[k], mean);
      }
    }
  }
  const filmHeight = (x: number, z: number) => {
    const gx = Math.min(NX - 1e-3, Math.max(0, ((x + fw / 2) / fw) * NX));
    const gz = Math.min(NZ - 1e-3, Math.max(0, ((z + fd / 2) / fd) * NZ));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const tx = gx - x0;
    const tz = gz - z0;
    const at = (xx: number, zz: number) => height[zz * (NX + 1) + xx];
    return (at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx) * (1 - tz) + (at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx) * tz;
  };
  const film = new PlaneGeometry(fw, fd, NX, NZ).rotateX(-Math.PI / 2);
  const filmPos = film.getAttribute("position");
  const cr = 0.23;
  const cx = fw / 2 - cr;
  const cz = fd / 2 - cr;
  for (let i = 0; i < filmPos.count; i++) {
    let x = filmPos.getX(i);
    let z = filmPos.getZ(i);
    const y = filmHeight(x, z);
    // Les coins de la grille sont ramenés sur les coins arrondis du rebord.
    if (Math.abs(x) > cx && Math.abs(z) > cz) {
      const ox = x - Math.sign(x) * cx;
      const oz = z - Math.sign(z) * cz;
      const r = Math.hypot(ox, oz);
      if (r > cr) {
        x = Math.sign(x) * cx + (ox / r) * cr;
        z = Math.sign(z) * cz + (oz / r) * cr;
      }
    }
    // De fines rides près du bord, là où le film a été tiré.
    const nearEdge = Math.max(Math.abs(x) / (fw / 2), Math.abs(z) / (fd / 2));
    // Toujours VERS LE HAUT: sous le rebord, le film se mêlait à la mousse.
    const crinkle = nearEdge > 0.85 ? 0.003 * (1 + Math.sin(x * 60 + z * 23)) * (nearEdge - 0.85) / 0.15 : 0;
    filmPos.setXYZ(i, x, y + crinkle, z);
  }
  film.computeVertexNormals();
  // Deux passes sur la même surface: un voile à peine laiteux, puis les SEULS
  // reflets, ajoutés. Un film transparent classique atténue ses reflets autant
  // que sa couleur — et c'est le reflet qui dit « film ». Les reflets sont
  // PEINTS (des traînées en biais, des rides fines): la vraie lumière du
  // studio n'en allumait presque aucun, vue de si haut.
  const haze = new Mesh(film, new MeshPhysicalMaterial({ color: "#FFFFFF", roughness: 0.3, transparent: true, opacity: 0.05, depthWrite: false, side: DoubleSide }));
  haze.renderOrder = 2;
  const shine = new Mesh(film, new MeshBasicMaterial({ map: filmShineTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
  shine.renderOrder = 3;
  tray.add(haze, shine);

  // L'étiquette, collée sur le film: elle en épouse le relief.
  const LW = 0.48;
  const LD = 0.3;
  const LX = 0.52;
  const LZ = 0.36;
  const label = new PlaneGeometry(LW, LD, 10, 6).rotateX(-Math.PI / 2);
  const labelPos = label.getAttribute("position");
  const yaw = -0.12;
  for (let i = 0; i < labelPos.count; i++) {
    const lx = labelPos.getX(i);
    const lz = labelPos.getZ(i);
    const x = LX + lx * Math.cos(yaw) + lz * Math.sin(yaw);
    const z = LZ - lx * Math.sin(yaw) + lz * Math.cos(yaw);
    labelPos.setXYZ(i, x, filmHeight(x, z) + 0.006, z);
  }
  label.computeVertexNormals();
  const sticker = new Mesh(label, new MeshStandardMaterial({ map: trayLabelTexture(anisotropy), transparent: true, roughness: 0.6 }));
  sticker.renderOrder = 4;
  tray.add(sticker);
  return tray;
}

// ── LE SACHET DE BOULGOUR ────────────────────────────────────────────────────
// Un sachet qui tient debout: large et plein en bas, où les grains se tassent,
// il s'aplatit vers le haut jusqu'à la soudure crantée. Papier kraft froissé,
// une zip sous la soudure, l'étiquette figue et une fenêtre sur les grains.

const POUCH = { w: 0.86, h: 1.1, d: 0.5, seam: 0.13 };

/**
 * La demi-épaisseur du sachet en (x, hauteur relative t): nulle sur les
 * soudures latérales et en haut. ⚠️ LE HAUT SE REFERME EN PENTE FRANCHE (un
 * cosinus simple): un profil qui s'aplatissait en arrivant à la soudure
 * montrait à la caméra, placée haut, le dos du sachet — dans l'ombre, une
 * bande grise sous la soudure.
 */
function pouchHalfDepth(x: number, t: number): number {
  const side = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / (POUCH.w / 2), 2.6)));
  const rise = t < 0.28 ? 1 : Math.max(0, Math.cos(((Math.min(1, t) - 0.28) / 0.72) * (Math.PI / 2)));
  const foot = 0.9 + 0.1 * Math.min(1, t / 0.06);
  return (POUCH.d / 2) * side * rise * foot;
}

/** Les plis du papier: un relief doux, qui s'éteint sur les soudures. */
function pouchCrumple(x: number, y: number, back: boolean): number {
  const s = back ? 2.1 : 0;
  return 0.011 * Math.sin(x * 9 + y * 4 + s) * Math.sin(y * 7.5 - x * 3 + s)
    + 0.006 * Math.sin(x * 21 + y * 13 + s) * Math.sin(y * 17 - x * 5)
    + 0.004 * Math.sin(y * 31 + x * 2 + s);
}

function drawKraft(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, bump: boolean) {
  const rng = mulberry32(seed);
  if (bump) {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#CFAB7C");
    g.addColorStop(1, "#BF9868");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  // Les fibres du papier.
  for (let i = 0; i < (w * h) / 90; i++) {
    const light = rng() < 0.5;
    ctx.strokeStyle = bump
      ? (light ? "rgba(170,170,170,0.5)" : "rgba(80,80,80,0.5)")
      : (light ? "rgba(226,196,152,0.45)" : "rgba(150,110,66,0.4)");
    ctx.lineWidth = 0.6 + rng() * 0.8;
    const x = rng() * w;
    const y = rng() * h;
    const a = rng() * Math.PI;
    const l = 3 + rng() * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  if (!bump) {
    for (let i = 0; i < (w * h) / 700; i++) {
      ctx.fillStyle = `rgba(92,62,32,${0.25 + rng() * 0.35})`;
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, 0.5 + rng() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Les cassures du papier froissé: une arête claire, son ombre à côté.
  for (let i = 0; i < 16; i++) {
    let x = rng() * w;
    let y = rng() * h;
    const a = (rng() - 0.5) * 1.6 + (rng() < 0.5 ? 0 : Math.PI / 2);
    const segments = 3 + Math.floor(rng() * 3);
    const path: Array<[number, number]> = [[x, y]];
    for (let k = 0; k < segments; k++) {
      x += Math.cos(a + (rng() - 0.5) * 0.6) * (20 + rng() * 40);
      y += Math.sin(a + (rng() - 0.5) * 0.6) * (20 + rng() * 40);
      path.push([x, y]);
    }
    for (const [offset, style] of [[0, bump ? "rgba(215,215,215,0.7)" : "rgba(232,205,165,0.35)"], [2, bump ? "rgba(45,45,45,0.7)" : "rgba(120,86,50,0.3)"]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = bump ? 2 : 1.4;
      ctx.beginPath();
      path.forEach(([px, py], k) => (k === 0 ? ctx.moveTo(px + offset, py + offset) : ctx.lineTo(px + offset, py + offset)));
      ctx.stroke();
    }
  }
}

/** Un épi de blé, en traits: la seule image du sachet. */
function drawWheat(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx, bottom);
  ctx.quadraticCurveTo(cx + 6, (top + bottom) / 2, cx, top + 18);
  ctx.stroke();
  const span = bottom - top;
  for (let k = 0; k < 5; k++) {
    const y = top + 28 + k * span * 0.11;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * 13, y);
      ctx.rotate(side * 0.55);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + side * 18, y - 14);
      ctx.lineTo(cx + side * 34, y - 42);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.ellipse(cx, top + 12, 8, 17, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Où sont l'étiquette et la fenêtre, en fraction de la face avant (0 = haut).
const POUCH_LABEL = { x0: 0.13, x1: 0.87, y0: 0.26, y1: 0.54 };
const POUCH_WINDOW = { x0: 0.24, x1: 0.76, y0: 0.61, y1: 0.87 };

function pouchFrontTextures(anisotropy: number): { map: CanvasTexture; bump: CanvasTexture } {
  const W = 512;
  const H = 680;
  const rect = (r: typeof POUCH_LABEL) => [r.x0 * W, r.y0 * H, (r.x1 - r.x0) * W, (r.y1 - r.y0) * H] as const;
  const map = canvasTexture(W, H, (ctx) => {
    drawKraft(ctx, W, H, 91, false);
    // La zip, juste sous la soudure.
    ctx.fillStyle = "rgba(110,78,44,0.28)";
    ctx.fillRect(0, H * 0.075, W, 2);
    ctx.fillStyle = "rgba(236,212,172,0.4)";
    ctx.fillRect(0, H * 0.075 + 2, W, 2);
    // L'étiquette figue et son épi.
    const [lx, ly, lw, lh] = rect(POUCH_LABEL);
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, 22);
    ctx.fillStyle = FIG_700;
    ctx.fill();
    ctx.strokeStyle = "rgba(243,230,208,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(lx + 10, ly + 10, lw - 20, lh - 20, 14);
    ctx.stroke();
    drawWheat(ctx, W / 2, ly + 22, ly + lh - 22, "#F3E6D0");
    // Le bord imprimé de la fenêtre.
    const [wx, wy, ww, wh] = rect(POUCH_WINDOW);
    ctx.beginPath();
    ctx.roundRect(wx - 6, wy - 6, ww + 12, wh + 12, 30);
    ctx.fillStyle = "#8C6A43";
    ctx.fill();
  }, true);
  map.anisotropy = anisotropy;
  const bump = canvasTexture(W / 2, H / 2, (ctx) => {
    drawKraft(ctx, W / 2, H / 2, 92, true);
    // L'étiquette est lisse, et la zip fait un bourrelet.
    const [lx, ly, lw, lh] = rect(POUCH_LABEL).map((n) => n / 2);
    ctx.fillStyle = "#8A8A8A";
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, 11);
    ctx.fill();
    // ⚠️ UN BOURRELET DOUX: une marche franche dans la carte de relief faisait
    // une bande noire en travers du sachet.
    const zip = ctx.createLinearGradient(0, (H / 2) * 0.075 - 3, 0, (H / 2) * 0.075 + 4);
    zip.addColorStop(0, "#808080");
    zip.addColorStop(0.5, "#9C9C9C");
    zip.addColorStop(1, "#808080");
    ctx.fillStyle = zip;
    ctx.fillRect(0, (H / 2) * 0.075 - 3, W / 2, 7);
  }, false);
  return { map, bump };
}

function kraftTextures(seed: number): { map: CanvasTexture; bump: CanvasTexture } {
  return {
    map: canvasTexture(256, 340, (ctx) => drawKraft(ctx, 256, 340, seed, false), true),
    bump: canvasTexture(128, 170, (ctx) => drawKraft(ctx, 128, 170, seed + 1, true), false),
  };
}

/** Les grains vus par la fenêtre; hors de ses coins arrondis, la toile reste vide. */
function grainsTexture(): CanvasTexture {
  return canvasTexture(256, 160, (ctx) => {
    ctx.beginPath();
    ctx.roundRect(1, 1, 254, 158, 26);
    ctx.clip();
    ctx.fillStyle = "#A9803F";
    ctx.fillRect(0, 0, 256, 160);
    const rng = mulberry32(17);
    // Tassés contre la paroi: des grains concassés, anguleux, de trois tons.
    for (let i = 0; i < 2600; i++) {
      const x = rng() * 256;
      const y = rng() * 160;
      const a = rng() * Math.PI;
      const rx = 2.2 + rng() * 2.4;
      const ry = 1.5 + rng() * 1.6;
      ctx.fillStyle = BULGUR[Math.floor(rng() * BULGUR.length)];
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
      ctx.fill();
      if (rng() < 0.35) {
        ctx.fillStyle = "rgba(255,240,210,0.5)";
        ctx.beginPath();
        ctx.ellipse(x - 0.6, y - 0.6, rx * 0.4, ry * 0.4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, true);
}

/**
 * Le sachet de boulgour debout, sa base à y = 0, sa face avant vers +z:
 * ~0,86 de large, ~1,23 de haut avec sa soudure.
 */
export function makeBulgurPouch(anisotropy = 1): Group {
  const { w, h, d, seam } = POUCH;
  const geometry = new BoxGeometry(w, h, d, 28, 36, 10).translate(0, h / 2, 0);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const t = y / h;
    const half = pouchHalfDepth(x, t);
    const share = z / (d / 2);
    // Les plis s'éteignent là où le sachet n'a plus d'épaisseur.
    const fade = Math.min(1, half / 0.06);
    const nz = share * half + Math.sign(share) * Math.abs(share) * pouchCrumple(x, y, share < 0) * fade;
    // Un sachet plein s'arrondit aussi un peu en largeur, au milieu.
    const nx = x * (1 + 0.025 * Math.sin(Math.PI * Math.min(1, t * 1.3)));
    position.setXYZ(i, nx, y, nz);
  }
  geometry.computeVertexNormals();
  const front = pouchFrontTextures(anisotropy);
  const plain = kraftTextures(93);
  const printed = new MeshPhysicalMaterial({ map: front.map, bumpMap: front.bump, bumpScale: 1.2, roughness: 0.86 });
  const kraft = new MeshPhysicalMaterial({ map: plain.map, bumpMap: plain.bump, bumpScale: 1.2, roughness: 0.88 });
  // L'ordre des faces d'une boîte: +x, -x, +y, -y, +z (l'avant), -z.
  const body = new Mesh(geometry, [kraft, kraft, kraft, kraft, printed, kraft]);
  body.castShadow = true;
  body.receiveShadow = true;
  const pouch = new Group();
  pouch.add(body);

  // La soudure du haut, crantée sur sa moitié basse. ⚠️ DES CRANS DOUX: des
  // rayures fines et contrastées, trop serrées pour être vues une à une,
  // faisaient une bande noire en travers du sachet.
  const crimp = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 8) {
      const g = ctx.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, "#808080");
      g.addColorStop(0.5, "#9A9A9A");
      g.addColorStop(1, "#808080");
      ctx.fillStyle = g;
      ctx.fillRect(x, 28, 8, 36);
    }
  }, false);
  const seamBody = new Mesh(
    new RoundedBoxGeometry(w * 0.99, seam, 0.026, 2, 0.008),
    new MeshPhysicalMaterial({ map: plain.map, bumpMap: crimp, bumpScale: 0.6, roughness: 0.85 }),
  );
  seamBody.position.y = h + seam / 2 - 0.012;
  seamBody.castShadow = true;
  pouch.add(seamBody);

  // La fenêtre: les grains derrière un plastique qui brille.
  const win = new PlaneGeometry(w * (POUCH_WINDOW.x1 - POUCH_WINDOW.x0), h * (POUCH_WINDOW.y1 - POUCH_WINDOW.y0), 14, 10);
  const winPos = win.getAttribute("position");
  const winCenterX = w * ((POUCH_WINDOW.x0 + POUCH_WINDOW.x1) / 2 - 0.5);
  const winCenterY = h * (1 - (POUCH_WINDOW.y0 + POUCH_WINDOW.y1) / 2);
  for (let i = 0; i < winPos.count; i++) {
    const x = winPos.getX(i) + winCenterX;
    const y = winPos.getY(i) + winCenterY;
    const half = pouchHalfDepth(x, y / h);
    const z = half + pouchCrumple(x, y, false) * Math.min(1, half / 0.06) + 0.004;
    winPos.setXYZ(i, x * (1 + 0.025 * Math.sin(Math.PI * Math.min(1, (y / h) * 1.3))), y, z);
  }
  win.computeVertexNormals();
  const pane = new Mesh(win, new MeshPhysicalMaterial({
    map: grainsTexture(),
    transparent: true,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  }));
  pouch.add(pane);
  return pouch;
}
