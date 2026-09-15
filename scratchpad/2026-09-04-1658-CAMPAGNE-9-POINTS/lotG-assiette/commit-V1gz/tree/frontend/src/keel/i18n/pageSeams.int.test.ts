// KEEL — LA MOITIÉ STATIQUE DU DÉTECTEUR DE COUTURE.
//
// ── CE QU'IL AJOUTE À CE QUI EXISTE DÉJÀ ───────────────────────────────────
// `t()` lève en DEV quand une page DÉCLARÉE rend une clé hors de son périmètre.
// C'est le seul détecteur qui voie TOUT — y compris un jeton venu de la base —,
// et c'est aussi le plus tardif: il faut avoir ouvert la page, dans le bon état,
// dans la bonne langue. Une branche d'erreur qu'on n'atteint pas ne dit rien.
//
// Ce fichier prend l'autre bout. Il part du composant de chaque route déclarée,
// suit ses imports relatifs, et relève CHAQUE littéral qui est une clé du seed.
// Il ne voit pas ce que la base fabrique; il voit tout le reste, et sans qu'on
// ait à ouvrir quoi que ce soit.
//
// ── CE QU'IL A TROUVÉ LE JOUR OÙ IL A ÉTÉ ÉCRIT ────────────────────────────
// Trois routes déclarées traduites qui rendaient `<ServerUnreachable />` —
// `/` (HomePage), `/pro` (ProPage) et `/start` (StartPage) — sans que
// `server_unreachable.*` soit ni traduit ni déclaré. Un visiteur français
// connecté dont le backend ne répondait pas basculait sur trois phrases
// anglaises; en DEV, `t()` levait et faisait tomber l'écran. Aucun test ne le
// voyait, et aucune relecture non plus: le composant est monté par une seule
// ligne, dans une branche qu'on n'ouvre jamais à la main.
//
// ── POURQUOI LA TABLE ROUTE → COMPOSANT EST LUE, ET PAS ÉCRITE ─────────────
// Une table tenue à la main ici vieillirait exactement comme celle qu'elle
// surveille. `App.tsx` est la seule autorité sur « quel composant sert quel
// chemin »; on la lit, et une route déclarée qui n'existe plus fait rougir.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { en } from "./en";
import { PAGE_NAMESPACES } from "./catalog";

const I18N_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(I18N_DIR, "..", "..");
const APP = path.join(SRC, "App.tsx");

const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/**
 * Le CHROME, présent sur toute page et jamais déclaré ligne par ligne.
 *
 * `public` et `brand` sont l'en-tête et le pied de page publics. Les inscrire
 * route par route aurait transformé la table en liste de courses sans rien
 * garder de plus: ils sont traduits, et ils le sont pour toutes les pages à la
 * fois.
 *
 * ⚠️ `app`, `shell` et `chat` — la coquille de l'app connectée — N'Y SONT PAS,
 * et ne doivent pas y entrer. Une page qui monte `KeelAppShell` doit les
 * NOMMER: c'est ce qui a fait découvrir que `/app/setup` rendait
 * `app.guard.checking` depuis sa garde de route.
 *
 * Le lot 4 a déclaré les premières pages qui montent réellement le shell
 * (`/app/health`, `/app/meals`, …), et elles écrivent les trois. Les mettre ici
 * pour s'épargner la répétition ferait perdre exactement ce que cette règle a
 * attrapé: la garde de route n'est pas le shell, et c'est elle qui parle en
 * premier.
 */
const CHROME = new Set(["public", "brand"]);

const SEED_KEYS = new Set(Object.keys(en));

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Blanchit les commentaires. Sans ça, un exemple de clé cité dans une note
 * d'en-tête compterait comme un rendu — et `t.ts` en cite un (`coach.dashboard.
 * title`), ce qui aurait accusé toutes les pages du dépôt d'un seul coup.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

/**
 * `<Route path="/x" element={<Guard><Page /></Guard>} />` -> TOUS les fichiers
 * que ce chemin monte.
 *
 * ⚠️ « TOUS », ET C'EST CE QUI A TROUVÉ LE DÉFAUT LE PLUS CHER. La première
 * version prenait le premier composant après `element={` — donc le GARDE, et
 * jamais la page. La seconde a failli prendre le dernier, donc la page et
 * jamais le garde: `/app/setup` est monté dans `<KeelHouseholdRoute>`, qui rend
 * `t("app.guard.checking")` PENDANT qu'il résout l'accès. C'est la toute
 * première chose qu'un francophone voit du tunnel d'entrée, et `app.*` n'était
 * ni traduit ni déclaré — donc un throw en DEV au premier rendu.
 *
 * Un garde de route fait partie de l'écran qu'il garde. Les deux sont scannés.
 */
function routeComponentFiles(): Map<string, string[]> {
  const app = fs.readFileSync(APP, "utf8");
  const imports = new Map<string, string>();
  for (const m of app.matchAll(/^import\s+(\w+)\s+from\s+["']([^"']+)["']/gm)) {
    const file = resolveImport(APP, m[2]);
    if (file) imports.set(m[1], file);
  }
  // Les imports nommés (`import { KeelHouseholdRoute } from "..."`), qui sont
  // la forme de tous les gardes de route de ce fichier.
  for (const m of app.matchAll(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm)) {
    const file = resolveImport(APP, m[2]);
    if (!file) continue;
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Z]/.test(name)) imports.set(name, file);
    }
  }
  // `React.lazy(() => import("..."))` — même forme, autre chemin d'écriture.
  for (const m of app.matchAll(/const\s+(\w+)\s*=[^;]*?import\(\s*["']([^"']+)["']\s*\)/g)) {
    const file = resolveImport(APP, m[2]);
    if (file) imports.set(m[1], file);
  }
  const byRoute = new Map<string, string[]>();
  for (
    const m of app.matchAll(
      /path=\{?["']([^"'}]+)["']\}?\s*(?:\n\s*)?element=\{([\s\S]*?)\}\s*\n?\s*\/>/g,
    )
  ) {
    const route = m[1];
    if (byRoute.has(route)) continue;
    const files = [...m[2].matchAll(/<(\w+)/g)]
      .map((c) => imports.get(c[1]))
      .filter((f): f is string => f !== undefined);
    if (files.length > 0) byRoute.set(route, [...new Set(files)]);
  }
  return byRoute;
}

/** Toutes les clés du seed atteignables depuis ces composants, par namespace. */
function reachableNamespaces(entries: string[]): Map<string, string[]> {
  const seen = new Set<string>();
  const stack = [...entries];
  const found = new Map<string, string[]>();
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    // Le seed lui-même et le catalogue sont des TABLES de clés, pas des rendus.
    if (/i18n[/\\](en|fr|catalog)\.ts$/.test(file)) continue;
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const source = stripComments(raw);
    for (const m of source.matchAll(/["'`]([a-z_0-9][a-z_0-9.]*)["'`]/g)) {
      if (!SEED_KEYS.has(m[1])) continue;
      const namespace = m[1].split(".")[0];
      const list = found.get(namespace) ?? [];
      if (list.length < 4) list.push(`${m[1]} (${path.relative(SRC, file)})`);
      found.set(namespace, list);
    }
    for (const m of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const next = resolveImport(file, m[1]);
      if (next) stack.push(next);
    }
    for (const m of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
      const next = resolveImport(file, m[1]);
      if (next) stack.push(next);
    }
  }
  return found;
}

describe("aucune page déclarée n'atteint un namespace qu'elle n'a pas déclaré", () => {
  const routes = routeComponentFiles();

  it("chaque chemin déclaré correspond à une <Route> d'App.tsx", () => {
    // La ceinture de la ceinture. Sans elle, une route renommée dans `App.tsx`
    // laisserait sa ligne ici sans composant à scanner, et le test d'à côté
    // verdirait en ne regardant rien.
    const orphans = Object.keys(PAGE_NAMESPACES).filter((p) => !routes.has(p));
    expect(orphans).toEqual([]);
  });

  it("aucun namespace atteint hors de la déclaration de la page", () => {
    const seams: string[] = [];
    for (const [route, namespaces] of Object.entries(PAGE_NAMESPACES)) {
      const entries = routes.get(route);
      if (!entries) continue; // couvert par le test ci-dessus
      const declared = new Set([...namespaces, ...CHROME]);
      for (const [namespace, samples] of reachableNamespaces(entries)) {
        if (declared.has(namespace)) continue;
        seams.push(`${route} atteint ${namespace}.* — ex. ${samples[0]}`);
      }
    }
    // Un namespace atteint mais non déclaré est une couture EN PUISSANCE: s'il
    // n'est pas traduit, la page rend un mot anglais au milieu du français (et
    // `t()` lève en DEV); s'il l'est, c'est l'inverse — un mot français sur une
    // page que la locale a servie en anglais. Les deux sont des mélanges.
    expect(seams).toEqual([]);
  });
});
