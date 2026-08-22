/**
 * ══════════════════════════════════════════════════════════════════════════
 * X3′ — LE RECENSEMENT DES RECOPIES DE CLÉS « À LA MAIN »
 *        ⛔ IL CHIFFRE. IL NE TRANCHE PAS, IL NE RÉPARE RIEN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `X3′`.
 *
 *     bash scripts/keel_x3_recopies_20260822.sh
 *
 * ── CE QU'IL COMPTE, ET POURQUOI CES TROIS NOMBRES ────────────────────────
 *
 * Le 2026-08-22, trois lots qui ne se parlaient pas ont trouvé le MÊME défaut:
 * une fonction qui recopie les clés d'un objet UNE PAR UNE, entre la réponse
 * d'un modèle et une écriture, en oubliant une clé que le modèle avait écrite.
 * `ingredientPayload` jetait `group` (242 déclarés, 0 en base). `readIngredient`
 * le jette encore, et a dû se faire ajouter `quantity` à la main. Dans les trois
 * cas AUCUN TEST NE ROUGISSAIT: une recopie qui perd une clé est une recopie
 * qui MARCHE, pour les clés qu'elle garde.
 *
 * Trois instances en un jour, et aucun dénominateur. Ce fichier est le
 * dénominateur.
 *
 * ① combien de recopies énumérées existent, sur le source EXÉCUTÉ;
 * ② combien sont plus courtes que le type qu'elles prétendent produire — et
 *    sur QUEL bout, parce que le compilateur ne parle que d'un seul des deux;
 * ③ lesquelles sont sur le chemin modèle → écriture, la seule sous-population
 *    qui coûte quelque chose.
 *
 * ── ⛔ CE FICHIER NE MODIFIE RIEN, N'OUVRE AUCUNE BASE, N'APPELLE AUCUN MODÈLE
 * Il lit des fichiers `.ts` et les PARSE. C'est tout.
 *
 * ── ⛔ POURQUOI UN AST ET PAS UN `grep` ───────────────────────────────────
 * Cicatrice `caller-audit-must-strip-comments`: un `grep` naïf compte les
 * commentaires comme des porteurs vivants. Ce dépôt écrit des commentaires
 * plus longs que son code, et `ingredientPayload` porte 30 lignes de
 * commentaire AUTOUR de la recopie qu'on compte. Le parseur de TypeScript
 * ignore les commentaires par construction: aucune règle à écrire, aucun faux
 * vivant possible.
 *
 * ── ⛔ CE QU'UNE RECOPIE ÉNUMÉRÉE EST, MOT POUR MOT ───────────────────────
 * Un littéral d'objet dont AU MOINS TROIS propriétés lisent la MÊME racine
 * (`{ a: src.a, b: src.b, c: String(src.c ?? "") }`), et qui n'étale PAS cette
 * racine (`{...src}`). Trois et pas deux: à deux clés on ne distingue pas une
 * transcription d'un calcul qui se trouve lire deux champs.
 *
 * ⚠️ CE SEUIL EST UN CHOIX, ET IL EST IMPRIMÉ. `--min=N` le bouge, et la
 * sortie porte toujours la valeur employée — un seuil qu'on ne peut pas relire
 * est une justification.
 *
 * ── ⛔ LES DEUX BOUTS DE ②, ET POURQUOI ILS NE SE VALENT PAS ─────────────
 * Cicatrice `optional-gate-params-are-disarmed-gates`: le compilateur est le
 * seul recenseur d'appelants qui ne mente pas — encore faut-il lui laisser un
 * membre REQUIS à réclamer.
 *
 *   ②a  la CIBLE est un type nommé et la recopie a moins de clés que lui.
 *       Le compilateur PEUT parler… et il ne parle que si le membre manquant
 *       est REQUIS. Un membre facultatif oublié est vert. C'est pour ça que
 *       ce compteur imprime aussi combien des membres manquants sont `?`.
 *   ②b  la SOURCE est un type nommé et la recopie lit moins de champs que lui.
 *       ⛔ Le compilateur ne dit RIEN, jamais. C'est la forme de `ingredientPayload`.
 *   ②c  la cible n'est contrainte par RIEN — `Record<string, unknown>`,
 *       `unknown`, `any`, ou aucune annotation du tout. Le compilateur est
 *       désarmé par construction. C'est aussi la forme de `ingredientPayload`,
 *       qui rend `Record<string, unknown>`.
 *
 * ── ⛔ L'INDEX DE TYPES EST SYNTAXIQUE, ET SA LIMITE EST IMPRIMÉE ─────────
 * On n'ouvre pas un `ts.Program`: les imports de ce dépôt sont en style Deno
 * (`./x.ts`, `https://…`) et un programme mal résolu rendrait `any` partout —
 * c'est-à-dire un recenseur qui ment, exactement ce qu'on refuse. À la place,
 * un index syntaxique de toutes les `interface X {}` / `type X = {}` du
 * périmètre, avec `extends` résolu à la transitive. Ce qui échappe à l'index
 * — types d'une lib externe, unions, `Pick<>`, `Omit<>` — est compté comme
 * NON RÉSOLU et imprimé, jamais deviné.
 *
 * ── ⛔ LA TABLE DE VERDICTS EST UNE GARDE, PAS UN COMMENTAIRE ─────────────
 * ③ demande de savoir si une recopie perd un champ que le MODÈLE déclare.
 * Aucun outil ne le sait: il faut lire le prompt à côté. Les verdicts sont
 * donc ÉCRITS ici, un par candidat du chemin modèle → écriture, et le script
 * SORT EN `rc=1` si un candidat apparaît sans verdict. Un recensement qui ne
 * rougit pas quand la population grandit n'est pas un recensement, c'est une
 * photo.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────
// LE PARSEUR. Celui du dépôt, jamais une copie.
// ─────────────────────────────────────────────────────────────────────────
let ts;
try {
  ts = require(path.join(repoRootGuess(), "frontend/node_modules/typescript"));
} catch {
  try {
    ts = require("typescript");
  } catch {
    console.error(
      "⛔ typescript introuvable. `npm ci` dans `frontend/` le pose " +
        "(frontend/node_modules/typescript). Aucun réseau n'est utilisé ensuite.",
    );
    process.exit(2);
  }
}

function repoRootGuess() {
  // Le script vit dans `scripts/`, mais le pilote peut le lancer sur un ARBRE
  // TIERS (`git archive HEAD`). La racine du DÉPÔT — celle qui porte
  // `frontend/node_modules` — est passée par `--repo=`, et à défaut on remonte
  // depuis ce fichier.
  const arg = process.argv.find((a) => a.startsWith("--repo="));
  if (arg) return arg.slice("--repo=".length);
  // ⚠️ `fileURLToPath` ET PAS `new URL(...).pathname`: la racine de ce dépôt
  // porte une ESPACE (`Sophia 2`), et `pathname` la rend `%20` — le `require`
  // échoue alors avec « typescript introuvable » sur un dépôt qui l'a.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

// ─────────────────────────────────────────────────────────────────────────
// LE PÉRIMÈTRE
// ─────────────────────────────────────────────────────────────────────────

/** Un fichier de test n'écrit rien en base et ne parle à aucun modèle. */
function isTestFile(p) {
  const b = path.basename(p);
  return /(_test|\.test|_int_test|\.int\.test)\.tsx?$/.test(b) ||
    p.includes("/__tests__/") || p.includes("/tests/");
}

function walkDir(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      walkDir(full, out);
    } else if (/\.tsx?$/.test(e.name) && !isTestFile(full)) {
      out.push(full);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// L'INDEX DE TYPES — syntaxique, `extends` résolu, limites imprimées
// ─────────────────────────────────────────────────────────────────────────

/** name -> { members: [{name, optional}], extends: [names], file, line } */
function buildTypeIndex(files, sources) {
  const index = new Map();
  for (const f of files) {
    const sf = sources.get(f);
    if (!sf) continue;
    const visit = (node) => {
      if (ts.isInterfaceDeclaration(node)) {
        const members = [];
        for (const m of node.members) {
          const n = memberName(m);
          if (n) members.push({ name: n, optional: !!m.questionToken });
        }
        const bases = [];
        for (const h of node.heritageClauses ?? []) {
          for (const t of h.types) {
            if (ts.isIdentifier(t.expression)) bases.push(t.expression.text);
          }
        }
        index.set(node.name.text, {
          members,
          extends: bases,
          file: f,
          line: lineOf(sf, node),
        });
      } else if (
        ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)
      ) {
        const members = [];
        for (const m of node.type.members) {
          const n = memberName(m);
          if (n) members.push({ name: n, optional: !!m.questionToken });
        }
        index.set(node.name.text, {
          members,
          extends: [],
          file: f,
          line: lineOf(sf, node),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return index;
}

function memberName(m) {
  if (!m.name) return null;
  if (ts.isIdentifier(m.name)) return m.name.text;
  if (ts.isStringLiteral(m.name)) return m.name.text;
  return null;
}

/** Membres d'un type, `extends` résolu à la transitive. `null` = non résolu. */
function membersOf(index, name, seen = new Set()) {
  if (!name || seen.has(name)) return [];
  const decl = index.get(name);
  if (!decl) return null;
  seen.add(name);
  const out = new Map();
  for (const b of decl.extends) {
    const inherited = membersOf(index, b, seen);
    if (inherited === null) return null; // une base inconnue ⇒ compte faux
    for (const m of inherited) out.set(m.name, m);
  }
  for (const m of decl.members) out.set(m.name, m);
  return [...out.values()];
}

// ─────────────────────────────────────────────────────────────────────────
// LA DÉTECTION
// ─────────────────────────────────────────────────────────────────────────

/** Racines qu'on ne prend jamais pour une source de données. */
const ROOT_DENYLIST = new Set([
  "Math", "JSON", "Object", "Number", "String", "Array", "Date", "console",
  "crypto", "globalThis", "Deno", "process", "Boolean", "Promise", "Map",
  "Set", "Intl", "Symbol", "Error", "RegExp", "BigInt", "Reflect", "this",
]);

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * ⛔ LES ALIAS LOCAUX — LE TROU QUI AURAIT FAIT RATER L'INSTANCE ② DE LA FICHE.
 *
 * `readIngredient` (`meal-energy-v1/index.ts`) ne lit `i` qu'UNE fois dans son
 * littéral: les trois autres champs passent par des `const` posées au-dessus
 * (`const amount = Number(i.amount);`). Un détecteur qui ne regarde que le
 * littéral y voit **une** propriété et le classe hors population — c'est-à-dire
 * qu'il rate exactement la fonction que la fiche cite.
 *
 * On construit donc, par fonction, la table `nom local → (racine, clé)` des
 * `const`/`let` dont l'initialiseur ne lit QU'UNE paire. Une déclaration qui en
 * lit plusieurs n'est pas un alias, c'est un calcul: elle n'entre pas.
 */
function localAliasesOf(sf, fn) {
  const aliases = new Map();
  if (!fn) return aliases;
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer
    ) {
      const reads = readsIn(n.initializer, []);
      const uniq = new Map();
      for (const r of reads) if (r.key) uniq.set(`${r.root}.${r.key}`, r);
      if (uniq.size === 1) {
        const [only] = uniq.values();
        aliases.set(n.name.text, only);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  // Une chaîne d'alias (`const a = i.x; const b = a;`) se replie sur sa racine.
  for (const [name, r] of aliases) {
    let cur = r, depth = 0;
    while (aliases.has(cur.root) && depth++ < 8) cur = aliases.get(cur.root);
    aliases.set(name, cur);
  }
  return aliases;
}

/** Les identifiants nus d'un sous-arbre (pour les résoudre en alias). */
function bareIdentifiersIn(node, acc) {
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      // `x.y` — `y` n'est pas un identifiant nu; `x` l'est et sera vu par `readsIn`.
      if (p && ts.isPropertyAccessExpression(p) && p.name === n) return;
      if (p && ts.isPropertyAssignment(p) && p.name === n) return;
      acc.push(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return acc;
}

/** Toutes les lectures `<racine>.<clé>` (et `<racine>["clé"]`) d'un sous-arbre. */
function readsIn(node, acc) {
  const visit = (n) => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const root = n.expression.text;
      if (!ROOT_DENYLIST.has(root) && !/^[A-Z]/.test(root)) {
        acc.push({ root, key: ts.isIdentifier(n.name) ? n.name.text : null });
      }
    } else if (
      ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) &&
      n.argumentExpression && ts.isStringLiteral(n.argumentExpression)
    ) {
      const root = n.expression.text;
      if (!ROOT_DENYLIST.has(root) && !/^[A-Z]/.test(root)) {
        acc.push({ root, key: n.argumentExpression.text });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return acc;
}

function enclosingFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) || ts.isMethodDeclaration(cur)
    ) return cur;
    cur = cur.parent;
  }
  return null;
}

function functionName(fn) {
  if (!fn) return "<hors fonction>";
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  let p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
    return p.name.text;
  }
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
    return p.name.text;
  }
  return "<anonyme>";
}

function typeText(sf, typeNode) {
  if (!typeNode) return null;
  return typeNode.getText(sf).replace(/\s+/g, " ").trim();
}

/** Le nom de type « utile » d'une annotation: `Foo | null` → `Foo`. */
function namedTypeOf(text) {
  if (!text) return null;
  const stripped = text
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s !== "null" && s !== "undefined");
  if (stripped.length !== 1) return null;
  const m = /^([A-Za-z_$][\w$]*)$/.exec(stripped[0]);
  return m ? m[1] : null;
}

const UNCONSTRAINED = /^(Record<\s*string\s*,\s*(unknown|any)\s*>|unknown|any|object|Record<string, unknown>|\{\s*\[key: string\]: (unknown|any);? \})$/;

function isUnconstrained(text) {
  if (!text) return true; // aucune annotation = rien à réclamer
  return UNCONSTRAINED.test(text.replace(/\s+/g, " ").trim());
}

/** Le contexte du littéral: ce qu'il « prétend produire ». */
function targetOf(sf, lit) {
  const p = lit.parent;
  // `return { … }` — le type de retour de la fonction porteuse
  if (p && ts.isReturnStatement(p)) {
    const fn = enclosingFunction(lit);
    return { kind: "return", type: typeText(sf, fn?.type) };
  }
  // `const x: T = { … }`
  if (p && ts.isVariableDeclaration(p)) {
    return { kind: "variable", type: typeText(sf, p.type) };
  }
  // corps direct d'une flèche: `(x): T => ({ … })`
  if (p && ts.isParenthesizedExpression(p) && p.parent &&
      ts.isArrowFunction(p.parent)) {
    return { kind: "arrow-body", type: typeText(sf, p.parent.type) };
  }
  if (p && ts.isArrowFunction(p)) {
    return { kind: "arrow-body", type: typeText(sf, p.type) };
  }
  if (p && ts.isCallExpression(p)) return { kind: "argument", type: null };
  if (p && ts.isPropertyAssignment(p)) return { kind: "propriété", type: null };
  if (p && ts.isArrayLiteralExpression(p)) return { kind: "élément", type: null };
  return { kind: "autre", type: null };
}

/** La déclaration de la racine DANS la fonction porteuse: type + initialiseur. */
function sourceDeclOf(sf, fn, root) {
  if (!fn) return { type: null, init: null };
  let found = { type: null, init: null };
  for (const prm of fn.parameters ?? []) {
    if (ts.isIdentifier(prm.name) && prm.name.text === root) {
      return { type: typeText(sf, prm.type), init: null };
    }
  }
  const visit = (n) => {
    if (found.type || found.init) return;
    if (
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) &&
      n.name.text === root
    ) {
      found = {
        type: typeText(sf, n.type),
        init: n.initializer
          ? n.initializer.getText(sf).replace(/\s+/g, " ").slice(0, 160)
          : null,
      };
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return found;
}

const PARSE_MARK =
  /as\s+Record<\s*string\s*,\s*(unknown|any)\s*>|JSON\.parse|as unknown as/;

const WRITE_CALL = /\.\s*(insert|upsert|update|rpc)\s*\(/;

function analyzeFile(file, sf, minKeys) {
  const text = sf.getFullText();
  const fileWrites = WRITE_CALL.test(text);
  const fileParsesJson = /JSON\.parse\s*\(/.test(text);
  const hits = [];

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const enumerated = [];
      const spreads = [];
      const byRoot = new Map(); // root -> Map(propName -> Set(clés lues))
      const aliases = localAliasesOf(sf, enclosingFunction(node));
      for (const p of node.properties) {
        if (ts.isSpreadAssignment(p)) {
          spreads.push(p.expression.getText(sf).replace(/\s+/g, " "));
          continue;
        }
        const isShorthand = ts.isShorthandPropertyAssignment(p);
        if (!isShorthand && !ts.isPropertyAssignment(p)) continue;
        const nm = isShorthand ? p.name.text : memberName(p);
        if (!nm) continue;
        enumerated.push(nm);
        const expr = isShorthand ? p.name : p.initializer;
        const reads = readsIn(expr, []);
        // ⛔ Les alias comptent comme des lectures de leur racine. Sans ça,
        // `readIngredient` sort de la population qu'il définit.
        for (const id of bareIdentifiersIn(expr, [])) {
          const al = aliases.get(id);
          if (al) reads.push(al);
        }
        const rootsHere = new Set(reads.map((r) => r.root));
        for (const r of rootsHere) {
          if (!byRoot.has(r)) byRoot.set(r, new Map());
          const keys = new Set(
            reads.filter((x) => x.root === r && x.key).map((x) => x.key),
          );
          byRoot.get(r).set(nm, keys);
        }
      }
      let best = null;
      for (const [root, props] of byRoot) {
        if (!best || props.size > best.props.size) best = { root, props };
      }
      if (best && best.props.size >= minKeys) {
        const spreadsRoot = spreads.some((s) => s === best.root);
        if (!spreadsRoot) {
          const fn = enclosingFunction(node);
          const keysRead = new Set();
          for (const set of best.props.values()) {
            for (const k of set) keysRead.add(k);
          }
          const target = targetOf(sf, node);
          const src = sourceDeclOf(sf, fn, best.root);
          hits.push({
            file,
            line: lineOf(sf, node),
            fn: functionName(fn),
            root: best.root,
            enumerated,
            keysRead: [...keysRead].sort(),
            propsFromRoot: best.props.size,
            spreads,
            targetKind: target.kind,
            targetType: target.type,
            sourceType: src.type,
            sourceInit: src.init,
            parseMark: PARSE_MARK.test(
              (src.init ?? "") + " " + (src.type ?? ""),
            ) || (src.type === "unknown"),
            fileWrites,
            fileParsesJson,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

// ─────────────────────────────────────────────────────────────────────────
// LE VOCABULAIRE QUE LE MODÈLE DÉCLARE — extrait des SCHÉMAS des prompts
//
// ⛔ EXTRAIT DES LITTÉRAUX, JAMAIS DU TEXTE DU FICHIER. On ne lit que les
// nœuds `StringLiteral` / `TemplateLiteral` de l'AST: un schéma cité dans un
// COMMENTAIRE — et ce dépôt en cite — ne peut pas entrer.
// ─────────────────────────────────────────────────────────────────────────

const KEY_DECL = /"([A-Za-z_][\w-]*)"\s*:/y;

/** Les clés d'un pseudo-JSON de schéma, rangées par CHEMIN d'imbrication. */
function shapesInSchemaText(text, shapes) {
  const stack = [];
  let pending = null;
  let i = 0;
  while (i < text.length) {
    KEY_DECL.lastIndex = i;
    const m = KEY_DECL.exec(text);
    if (m && m.index === i) {
      const p = stack.filter(Boolean).join(".");
      if (!shapes.has(p)) shapes.set(p, new Set());
      shapes.get(p).add(m[1]);
      let j = i + m[0].length;
      while (j < text.length && /\s/.test(text[j])) j++;
      pending = (text[j] === "[" || text[j] === "{") ? m[1] : null;
      i += m[0].length;
      continue;
    }
    const c = text[i];
    if (c === "{" || c === "[") {
      stack.push(pending ?? "");
      pending = null;
    } else if (c === "}" || c === "]") {
      stack.pop();
    }
    i++;
  }
  return shapes;
}

/** Tous les littéraux d'un fichier qui ressemblent à un schéma servi au modèle. */
function modelShapesOf(sf) {
  const shapes = new Map();
  const visit = (n) => {
    let text = null;
    if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) {
      text = n.text;
    } else if (ts.isTemplateExpression(n)) {
      text = n.head.text +
        n.templateSpans.map((s) => " " + s.literal.text).join("");
    }
    if (text && (text.match(/"[A-Za-z_][\w-]*"\s*:/g)?.length ?? 0) >= 3) {
      shapesInSchemaText(text, shapes);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return shapes;
}

/** `gramsRaw` et `grams_raw` sont le MÊME champ vu de deux côtés d'une frontière. */
function snake(k) {
  return k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

// ⛔ CE QUE L'EXTRACTEUR NE PEUT PAS VOIR, ÉCRIT À LA MAIN AVEC SA CITATION.
// `"group"` n'est PAS dans le schéma JSON: il est demandé en PROSE, dans
// `FOOD_GROUP_DECLARATION_BLOCK` (`dietary_regime.ts:757`), collé à la ligne de
// régime — *« Add a "group" key to EVERY ingredient object you write, in dishes
// AND in preparations »*. Un scanner de pseudo-JSON ne peut pas le trouver: il
// n'y a pas de `:` après. Et `food_group_write.ts:55` le dit en toutes lettres:
// *« Le bloc de prompt demande une clé "group", le parseur lit `group`, le type
// porte `group`, la ligne écrite porte `group`. »*
//
// ⚠️ IL EST CONDITIONNEL AUJOURD'HUI. Le bloc voyage avec
// `dietaryRegimePromptLine`: seule la population à RÉGIME DÉCLARÉ le reçoit.
// La décision §⑨ n° 3 (porte G2) le rend inconditionnel — elle n'est PAS
// encore appliquée dans le code (`dietary_regime.ts:730` reste le seul site).
const EXTRA_MODEL_KEYS = new Map(Object.entries({
  ingredients: ["group"],
}));

// ─────────────────────────────────────────────────────────────────────────
// ⛔ LES VERDICTS ③ — ÉCRITS À LA MAIN, RELUS DANS LE PROMPT, DATÉS
//
// Une clé « déclarée par le modèle » ne se lit dans aucun AST: elle est dans
// le SCHÉMA envoyé au modèle, en prose anglaise, dans un littéral de gabarit.
// Ces verdicts sont donc une LECTURE HUMAINE, faite le 2026-08-22, et la seule
// chose que le script garantit est qu'aucun candidat n'y échappe en silence.
//
// clé = "<chemin relatif>:<fonction>"
// verdict = "perd" | "complet" | "hors-chemin"
// ─────────────────────────────────────────────────────────────────────────
/**
 * LA CLÉ D'UN CANDIDAT — `<chemin>::<fonction>::<clés écrites>`.
 *
 * ⛔ PAS LE NUMÉRO DE LIGNE. Ce recensement se lance sur DEUX arbres (celui de
 * travail et `HEAD`), où les mêmes fonctions ne sont pas aux mêmes lignes; et
 * six fonctions du périmètre portent DEUX recopies frères (`<anonyme>` × 6 dans
 * `generate-meal-v1`). Le nom seul ne les sépare pas, la ligne ne survit pas à
 * un rebase: la liste des clés écrites fait les deux.
 */
function verdictKey(h) {
  return `${h.rel}::${h.fn}::${h.enumerated.join(",")}`;
}

const V = {
  // Le champ n'est porté par RIEN d'autre après ce point.
  PERD: "perd",
  // Le champ arrive par un autre chemin (étalement, renommage, appel frère),
  // ou son absence est une décision produit écrite.
  COMPLET: "complet",
  // La recopie est une PROJECTION vers un calculateur ou une vue: l'objet
  // complet survit chez l'appelant, rien ne se perd pour le produit.
  PROJECTION: "hors-chemin",
};

const VERDICTS = new Map(Object.entries({
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ CE QUI PERD, AUJOURD'HUI, EN PRODUCTION
  // ══════════════════════════════════════════════════════════════════════
  "supabase/functions/meal-energy-v1/index.ts::readIngredient::term,amount,unit,state,quantity":
    [V.PERD, "⛔ PERD `group`. Le modèle le déclare (`FOOD_GROUP_DECLARATION_BLOCK`), `ingredientPayload` le PERSISTE depuis `L17-0`, et ce lecteur ne le lit pas ⇒ la borne de `L17` retombe sur 902 kcal/100 g au lieu de la bande du groupe. COÛT MESURÉ le 2026-08-22: 769 lignes sur 10 plans foyer portent `group is not null` en base. Fiche `L17-a`, §⑨ n° 59."],
  "frontend/src/keel/api/mealGeneration.ts::<anonyme>::title,slot,day,method,why,uses,ingredients,boxes,same_day,member_id":
    [V.PERD, "⛔ PERD `dishes[].name`, LE NOM D'USAGE — TROUVÉ PAR CE RECENSEMENT, fiche neuve `X3-a`. Le modèle le déclare (« Write BOTH, on every single dish. Count them before you answer »), `mealDishesPayload` l'écrit MÊME À `null` (lot L7 ③), et ce lecteur — documenté « le SEUL chemin vers `GeneratedDish[]` » — ne le recopie pas. `GeneratedDish` côté front N'A PAS DE MEMBRE `name`: 0 occurrence dans tout `frontend/src`. COÛT MESURÉ le 2026-08-22: 734 plats sur 2 129, 65 plans, portent un nom non nul que AUCUN écran ne peut afficher. `honours_belief_keys`, lui, est exclu EXPRÈS (en-tête du module: « pour qu'aucun écran ne puisse l'afficher par accident »)."],
  "supabase/functions/generate-meal-v1/index.ts::<anonyme>::term,amount,unit,state":
    [V.PERD, "⛔ PERD `group` SUR LA LANE SOLO — `verdictDishesOf`, les DEUX sites (l. 2342 plats, l. 2353 préparations). Sa sortie alimente `planEnergyVerdict`, la couverture, `resolveIngredients` et `energyInputs` du remplissage; `plan_energy.boundOf` lit `ing.group` pour choisir la bande. ⛔ ET DIX LIGNES PLUS BAS, `inputs:` (l. 2446) LE PASSE, avec le commentaire « avec le groupe que le modèle a pu déclarer ». Deux projections frères dans la même fonction, une le garde, l'autre le jette. ⚠️ `EnergyIngredient.group` est FACULTATIF (`group?`) ⇒ le `tsc` est muet (cicatrice `optional-gate-params-are-disarmed-gates`). COÛT MESURÉ AUJOURD'HUI: 0 ligne — la lane `personal` porte 0 groupe non nul sur 3 722 lignes. C'est une garde désarmée qui mordra à la PREMIÈRE génération solo d'un élève à régime déclaré."],

  // ── LES MÊMES DEUX FONCTIONS, TELLES QUE `HEAD` LES PORTE ─────────────
  //
  // ⛔ DEUX CLÉS POUR UNE FONCTION, ET C'EST LE MUR DU §⑨ n° 15 RENDU VISIBLE.
  // Sur `HEAD`, `readIngredient` n'écrit que quatre clés: `quantity` — l'ajout
  // « à la main » du lot `L-1-b`, c'est-à-dire l'INSTANCE ③ de cette fiche —
  // ne vit que dans l'arbre de travail. Même chose pour `boxes` côté front.
  // Les garder toutes les deux est ce qui rend le recensement vert sur les
  // DEUX arbres, et l'écart lisible d'un coup d'œil.
  "supabase/functions/meal-energy-v1/index.ts::readIngredient::term,amount,unit,state":
    [V.PERD, "⛔ VERSION `HEAD` du même lecteur: perd `group` ET `quantity`. `quantity` a été ajouté à la main par `L-1-b` dans l'arbre de travail — sans lui, 3 833 lignes dont la masse est écrite en clair restaient comptées « sans quantité »."],
  "frontend/src/keel/api/mealGeneration.ts::<anonyme>::title,slot,day,method,why,uses,ingredients,same_day,member_id":
    [V.PERD, "⛔ VERSION `HEAD` du même lecteur: perd `name` (fiche `X3-a`) et n'a pas encore `boxes` (lot `L6′`, arbre de travail)."],

  // ══════════════════════════════════════════════════════════════════════
  // COMPLET — la clé arrive autrement, ou son absence est écrite
  // ══════════════════════════════════════════════════════════════════════
  "supabase/functions/_shared/keel/meal_generation.ts::ingredientPayload::term,quantity,in_pantry,amount,unit,state,grams_raw":
    [V.COMPLET, "⟳ RÉPARÉE le 2026-08-22 par `L17-0`: `group` était jeté (242 déclarés, 0 en base). Il arrive maintenant par `...ingredientGroupPayload(i.group)`. Reste `Record<string, unknown>` en cible ⇒ compte quand même en ②c."],
  "supabase/functions/_shared/keel/meal_generation.ts::parseGeneratedMeal::term,quantity,in_pantry,group":
    [V.COMPLET, "`amount`/`unit`/`state` arrivent par `...readStructuredQuantity(ing, …)`. Les deux sites (plats et préparations) sont identiques."],
  "supabase/functions/_shared/keel/meal_verdict.ts::<anonyme>::amount,unit,quantity,quantitySource":
    [V.COMPLET, "Étale `...i` avant de surcharger quatre clés: rien ne se perd, et `quantity: null` est VOULU (la prose est retirée de la copie pliée pour qu'aucun lecteur aval ne la relise après le prorata)."],
  "supabase/functions/_shared/keel/plan_energy.ts::boundGramsOf::amount,unit,state,yieldClass,unitGrams":
    [V.COMPLET, "N'a pas à lire `group`, et c'est ÉCRIT dans son en-tête: « POURQUOI LE MAXIMUM, ET PAS LA CLASSE DU GROUPE DÉCLARÉ — la deviner ferait passer une CONVENTION pour une mesure ». Le groupe est lu par `boundOf`, dix lignes plus bas."],
  "supabase/functions/_shared/keel/food_composition.ts::resolveIngredients::amount,unit,state,yieldClass,unitGrams":
    [V.COMPLET, "Argument de `gramsRawOf`, qui ne pèse qu'une masse: `term` et `group` sont lus ailleurs dans la même fonction, sur le même objet."],
  "supabase/functions/_shared/keel/doctrine.ts::parseCoachDoctrine::key,claim,rationale,goalScope,source":
    [V.COMPLET, "`quote` N'APPARTIENT PAS à la doctrine: `stripQuotes` (`doctrine_document.ts`) le retire du brouillon et le range en `citations`, une table à part — « le brouillon rendu est exactement celui d'avant ce lot, `quote` compris — c'est-à-dire sans ». `DoctrineBelief` n'a pas de membre `quote`."],
  "supabase/functions/_shared/keel/doctrine_from_forks.ts::buildDraftFromForkGeneration::key,claim,rationale,goal_scope,source":
    [V.COMPLET, "Même raison: `quote` vit dans les citations, jamais dans la doctrine."],
  "supabase/functions/_shared/keel/doctrine_starter.ts::applyStarterChoices::key,claim,rationale,goal_scope,source":
    [V.COMPLET, "Idem — et la position de départ n'a pas de document d'où citer."],
  "supabase/functions/_shared/keel/doctrine_from_forks.ts::<anonyme>::token,surfaceForms,instead":
    [V.COMPLET, "`reason` est la justification LUE PAR LE COACH à l'écran d'édition; un interdit issu d'un débat de départ n'en porte pas. `DoctrineForbidden.reason` est facultatif et `parseCoachDoctrine` le lit quand il existe."],
  "supabase/functions/plan-import-v1/import_rules.ts::toDraftCommitment::template_commitment_key,title,student_instruction,content_locale,polarity,activity_class,anchor_kind,slot_key,clock_local,tolerance_minutes,window_start_local,window_end_local,measure,unit,target_op,target_min,target_max,substance_ref,food_group_ref,evidence_kind,evidence_required,auto_source,counts_toward_adherence,evaluation_grain,slot_kind,scheduled_days,required_days_per_week,expected_occasions_per_day,priority,autonomy,flex_eligible,provenance,requires_clinician_signoff,auto_generated,source_span":
    [V.COMPLET, "`confidence` est lu par `validateImportCommitment` (l. 768) et devient `needs_review`; `content` est assemblé par `plan-publish`. L'en-tête le dit: « Fields the extractor never produces take the SQL default of their column »."],
  "supabase/functions/plan-publish-v1/commitments.ts::buildCommitmentRow::plan_version_id,user_id,coach_id,template_commitment_key,polarity,activity_class,anchor_kind,slot_key,clock_local,tolerance_minutes,window_start_local,window_end_local,measure,unit,target_op,target_min,target_max,tolerance_pct,substance_ref,food_group_ref,evidence_kind,evidence_required,auto_source,counts_toward_adherence,evaluation_grain,slot_kind,scheduled_days,required_days_per_week,expected_occasions_per_day,priority,autonomy,flex_eligible,provenance,requires_clinician_signoff,title,student_instruction,content,content_locale,source_span,phase_id,auto_generated,status":
    [V.COMPLET, "La confiance d'EXTRACTION est un signal de brouillon (`extraction_confidence` sur la ligne de gabarit, plus `needs_review`); une consigne PUBLIÉE a été relue par le coach. 0 occurrence de `confidence` dans le fichier, et c'est cohérent."],
  "supabase/functions/plan-import-v1/import_rules.ts::validateImportRelation::kind,subject_key,object_key,object_note,cofactor_ref,param_minutes,student_note,persistable,review_questions,diagnostics":
    [V.COMPLET, "Étale `(r as unknown as PlanImportRelation)`: `confidence` et `source_span` traversent."],
  "supabase/functions/_shared/keel/protocol_compiler.ts::compileTimingRule::polarity,anchor_kind,slot_key,window_start_local,window_end_local,measure,unit,target_op,target_min,target_max,evaluation_grain,slot_kind,required_days_per_week,expected_occasions_per_day,autonomy,flex_eligible,preview":
    [V.COMPLET, "Étale `...base`: titre, clé de gabarit, langue et priorité viennent de là. Le compilateur PRODUIT une consigne depuis une règle de coach; il ne recopie pas une déclaration de modèle."],
  "supabase/functions/sophia-brain/agents/watcher.ts::runWatcher::user_id,origin,event_context,draft_message,message_mode,message_payload,scheduled_for,status":
    [V.COMPLET, "`confidence_score` est LU (l. 690, renommé `score`) et CONSOMMÉ comme porte: `filter(c.score >= 8)` puis `candidateScore` dans le prompt d'envoi. Un score de tri n'a pas à être persisté sur la ligne planifiée."],
  "supabase/functions/sophia-brain/agents/watcher.ts::runWatcher::scheduled_for,event_context,origin,status,draft_message,message_payload":
    [V.COMPLET, "Miroir en mémoire de la ligne qu'on vient d'empiler, pour la détection de doublon du même tour. Même raison."],
  "supabase/functions/sophia-brain/agents/watcher.ts::runWatcher::event_context,event_grounding,scheduled_for,now_iso":
    [V.COMPLET, "Argument de `watcherCandidateCoveredByExistingFollowUp`: une comparaison de recouvrement, pas une écriture."],
  "supabase/functions/sophia-brain/momentum_outreach.ts::scheduleMomentumOutreach::user_id,origin,event_context,draft_message,message_mode,message_payload,scheduled_for,status":
    [V.COMPLET, "Même forme que `watcher`: le score de confiance est une porte, pas une donnée de la ligne."],
  "supabase/functions/process-checkins/index.ts::processDueRendezVous::admin,userId,eventContext,scheduledFor,instruction,eventGrounding,source,requestId":
    [V.COMPLET, "Idem — et `admin`/`requestId` montrent que c'est un argument d'appel, pas une ligne."],
  "supabase/functions/process-checkins/index.ts::<anonyme>::admin,userId,eventContext,scheduledFor,instruction,eventGrounding,source,requestId":
    [V.COMPLET, "Idem."],
  "supabase/functions/sophia-brain/router/one_shot_local_direct_effect.ts::oneShotDirectEffectFromLocalRequest::effect_type,explicitness,target_status,confidence_band,payload_hint":
    [V.COMPLET, "⛔ `content_risk` et `requested` sont CONSOMMÉS COMME PORTES juste au-dessus, dans `shouldAcceptLocalOneShotDirectEffect` (`request.content_risk !== \"flagged\"`, `request.requested === true`). Les recopier dans l'effet serait porter deux fois une décision déjà prise. `reason` n'existe pas sur ce type."],

  // ══════════════════════════════════════════════════════════════════════
  // HORS-CHEMIN — projections vers un calculateur ou une vue
  // ══════════════════════════════════════════════════════════════════════
  "frontend/src/keel/api/household.ts::<anonyme>::title,day,slot,uses,memberId":
    [V.PROJECTION, "`readHouseholdDishes` — « Les plats d'un plan, réduits à ce qui se dit à table. Voir `HouseholdDishView` pour ce qui est délibérément laissé de côté, et pourquoi. » ⚠️ Il ne porte pas `name` non plus: il est CONCERNÉ par la fiche `X3-a`, comme second écran aveugle."],
  "frontend/src/keel/lib/dishSession.ts::sessionForDish::day,runThrough,preparations,viaPreparationId":
    [V.PROJECTION, "Vue d'une session pour UN plat: `total_minutes` est la durée de la session entière, rendue par l'écran des sessions, pas par la carte du plat."],
  "frontend/src/keel/components/CommitmentEditor.tsx::<anonyme>::title,substance_ref,measure,unit,target_op,target_min,target_max":
    [V.PROJECTION, "Champs d'un formulaire d'édition, pas une ligne écrite."],
  "frontend/src/keel/pages/PlanImportPage.tsx::fromImport::template_commitment_key,title,content_locale,polarity,activity_class,anchor_kind,slot_key,clock_local,window_start_local,window_end_local,measure,unit,target_op,target_min,target_max,substance_ref,food_group_ref,evidence_kind,evaluation_grain,priority,scheduled_days,required_days_per_week,expected_occasions_per_day,source_span,needs_review,extraction_confidence,extraction_issues":
    [V.PROJECTION, "`content` est assemblé côté publication; `slot_kind` est dérivé. Et la confiance d'extraction, elle, EST recopiée (`extraction_confidence`) — le renommage est ce qui la faisait paraître perdue."],
  "frontend/src/keel/pages/PlanImportPage.tsx::fromGap::template_commitment_key,title,content_locale,auto_generated,priority":
    [V.PROJECTION, "Une ligne fabriquée pour un TROU d'extraction: elle n'a par construction aucun champ du modèle."],
  "supabase/functions/_shared/keel/accident.ts::<anonyme>::dishIndex,day,slot,title,preparationIds":
    [V.PROJECTION, "Vue « accident »: ce qu'il faut pour dire quel plat tombe quel jour. Les ingrédients et la méthode ne servent à rien ici."],
  "supabase/functions/_shared/keel/accident.ts::<anonyme>::id,title,cookOn,ingredientTerms":
    [V.PROJECTION, "Idem, côté préparation: seuls les TERMES comptent pour l'accident."],
  "supabase/functions/_shared/keel/grocery_waves.ts::<anonyme>::id,cookOn,ingredientTerms":
    [V.PROJECTION, "Les vagues de courses n'ont besoin que du jour de cuisson et des termes."],
  "supabase/functions/_shared/keel/household_merge_notice_io.ts::storedDishes::day,slot,title":
    [V.PROJECTION, "Avis de fusion: on nomme les plats, on ne les recompose pas."],
  "supabase/functions/_shared/keel/household_turn_context.ts::<anonyme>::title,slot,day":
    [V.PROJECTION, "Contexte de tour: ce que la conversation peut CITER d'un plan."],
  "supabase/functions/_shared/keel/meal_generation.ts::scanMealForRegime::prepId,prose,items":
    [V.PROJECTION, "La ceinture de régime lit de la PROSE et des termes; les minutes et les portions ne disent rien d'un régime."],
  "supabase/functions/_shared/keel/meal_generation.ts::parseGeneratedMeal::title,method,ingredients":
    [V.PROJECTION, "Argument d'une vérification interne au parseur; l'objet complet est construit dix lignes plus bas."],
  "supabase/functions/_shared/keel/meal_verdict.ts::<anonyme>::amount,unit,quantity":
    [V.PROJECTION, "Argument de `weighableQuantityOf`: une masse et sa prose, rien d'autre n'entre dans une pesée."],
  "supabase/functions/_shared/keel/meal_verdict.ts::<anonyme>::slot,method,ingredients":
    [V.PROJECTION, "Sortie du pliage: le verdict juge une assiette, pas un plat nommé."],
  "supabase/functions/_shared/keel/mouth_energy.ts::<anonyme>::slot,method,ingredients,uses":
    [V.PROJECTION, "Entrée de `mouthDayEnergy`: `ingredients` passe l'objet ENTIER, donc `group` traverse."],
  "supabase/functions/_shared/keel/plan_energy.ts::<anonyme>::slot,method,ingredients,uses":
    [V.PROJECTION, "Idem — `ingredients` passe l'objet entier."],
  "supabase/functions/_shared/keel/plan_energy.ts::<anonyme>::id,servingsMade,ingredients":
    [V.PROJECTION, "Idem, côté préparation."],
  "supabase/functions/_shared/keel/fixed_intakes.ts::fixedIntakeInputsFor::term,amount,unit,state":
    [V.PROJECTION, "Un apport DÉCLARÉ PAR L'ÉLÈVE, pas une ligne de modèle: il n'a ni prose ni groupe à perdre."],
  "supabase/functions/_shared/keel/evaluator.ts::buildEvaluation::measure,unit,target_op,target_min,target_max,tolerance_pct,substance_ref,food_group_ref,polarity,slot_kind,auto_source,required_days_per_week":
    [V.PROJECTION, "Ce qu'il faut pour JUGER une consigne. Le titre et la fenêtre horaire ne changent aucun verdict."],
  "supabase/functions/_shared/keel/meal_analysis.ts::compactCommitment::commitment_id,title,polarity,slot_key,measure,target,evaluation_grain,priority,autonomy":
    [V.PROJECTION, "Compactage EXPRÈS: le prompt de la photo reçoit le minimum qui décide, pas la ligne entière. `target` fond `target_op`/`min`/`max`."],
  "supabase/functions/_shared/keel/slot_reminders.ts::<anonyme>::title,scheduledDays,requiredDaysPerWeek,slotKey,priority":
    [V.PROJECTION, "Un rappel de créneau: la cible chiffrée n'y paraît pas."],
  "supabase/functions/analyze-meal-photo-v1/index.ts::toCommitmentContext::id,title,student_instruction,polarity,activity_class,slot_key,measure,unit,target_op,target_min,target_max,food_group_ref,substance_ref,evaluation_grain,autonomy,priority,content":
    [V.PROJECTION, "Contexte servi au modèle de photo: les fenêtres horaires et la provenance d'extraction n'aident pas à lire une assiette."],
  "supabase/functions/evaluate-adherence-v1/index.ts::evaluateStudentDay::priority,countsTowardAdherence,expectedEvaluationsPerDay":
    [V.PROJECTION, "Trois champs de tri pour une boucle de journée."],
  "supabase/functions/evaluate-adherence-v1/snapshot.ts::toCommitment::id,planVersionId,userId,polarity,anchorKind,slotKey,clockLocal,toleranceMinutes,windowStartLocal,windowEndLocal,measure,unit,targetOp,targetMin,targetMax,tolerancePct,substanceRef,foodGroupRef,evidenceKind,evidenceRequired,autoSource,countsTowardAdherence,evaluationGrain,slotKind,scheduledDays,requiredDaysPerWeek,expectedOccasionsPerDay,priority,autonomy,flexEligible,status,swapPolicy":
    [V.PROJECTION, "Instantané d'ÉVALUATION: le titre, la langue et la provenance d'extraction ne pèsent sur aucune adhérence. La source est une ligne de base, pas une réponse de modèle."],
  "supabase/functions/provision-day-v1/provisioning.ts::parseProvisionCommitment::id,planVersionId,userId,status,slotKind,evaluationGrain,slotKey,scheduledDays,phaseId,polarity,measure,unit,targetOp,targetMin,targetMax,tolerancePct,substanceRef,foodGroupRef,autoSource":
    [V.PROJECTION, "Ce qu'il faut pour POSER la journée. Source: une ligne de base."],
  "supabase/functions/provision-day-v1/provisioning.ts::buildExpectedSnapshot::measure,unit,target_op,target_min,target_max,tolerance_pct,substance_ref,food_group_ref,polarity,slot_kind,auto_source":
    [V.PROJECTION, "Instantané ATTENDU: la cible et rien d'autre."],
  "supabase/functions/plan-import-v1/import_rules.ts::validateImportCommitment::title,polarity,targetOp,targetMin,targetMax,measure,anchorKind,slotKey,slotKind,grain":
    [V.PROJECTION, "Argument d'une validation, pas une ligne. `confidence` est lu SÉPARÉMENT dans la même fonction (l. 768) et ressort en `needs_review`."],
  "supabase/functions/plan-template-v1/index.ts::<anonyme>::title,substance_ref,measure,unit,target_op,target_min,target_max":
    [V.PROJECTION, "Aperçu de gabarit rendu à l'écran du coach."],
  "supabase/functions/sophia-brain/tools/always_on/log_protocol_event/intake.ts::readComponent::unit,substance_ref,food_group_ref,quantity,commitment_id":
    [V.PROJECTION, "⚠️ LIAISON FAIBLE — ce n'est pas une consigne, c'est un COMPOSANT d'événement journalisé; il partage cinq mots de vocabulaire avec le schéma `commitments` et rien de plus. La forme liée est fausse, et la liaison est imprimée pour qu'on puisse la contester."],
  "supabase/functions/generate-meal-v1/index.ts::<anonyme>::slot,method,ingredients,uses":
    [V.PROJECTION, "Entrée du pliage: `ingredients` porte l'objet entier."],
  "supabase/functions/generate-meal-v1/index.ts::<anonyme>::id,servingsMade,ingredients":
    [V.PROJECTION, "Idem, côté préparation."],
  "supabase/functions/generate-meal-v1/index.ts::<anonyme>::term,amount,unit,state,group":
    [V.PROJECTION, "⛔ LA WORKLIST DE REMPLISSAGE, et elle PASSE `group` — c'est le témoin qui rend le verdict `perd` de `verdictDishesOf` inattaquable: deux projections de la même fonction, une le garde, l'autre le jette. `quantity` (la prose) n'entre pas: le remplissage résout un TERME."],
  "supabase/functions/generate-meal-v1/index.ts::<anonyme>::id,title,method,day,ingredients":
    [V.PROJECTION, "Rapport à la demande: `id` est un index de plan, jamais rendu à l'élève ni écrit."],
  "supabase/functions/generate-household-meal-v1/index.ts::<anonyme>::term,amount,unit,state,group":
    [V.PROJECTION, "Worklist foyer: `group` passe. `quantity` n'a rien à y faire."],
  "supabase/functions/generate-household-meal-v1/index.ts::<anonyme>::slot,method,ingredients,uses":
    [V.PROJECTION, "Entrée du pliage: `ingredients` porte l'objet ENTIER — la lane foyer ne perd pas `group` là où la lane solo le perd."],
  "supabase/functions/generate-household-meal-v1/index.ts::<anonyme>::id,servingsMade,ingredients":
    [V.PROJECTION, "Idem, côté préparation. Deux sites identiques."],
  "supabase/functions/generate-household-meal-v1/index.ts::<anonyme>::day,method,slot,ingredients,uses,boxes":
    [V.PROJECTION, "Entrée de `mouthDayEnergy`: `ingredients` et `boxes` passent entiers."],
  "supabase/functions/generate-household-meal-v1/index.ts::<anonyme>::id,servingsMade,readyGrams":
    [V.PROJECTION, "Une préparation vue par sa masse prête: rien du modèle n'y entre."],
  "supabase/functions/meal-energy-v1/index.ts::<anonyme>::day,method,ingredients,uses":
    [V.PROJECTION, "`readDishes` de la lane de lecture: `ingredients` passe par `readIngredients`, et c'est LÀ que `group` tombe — le verdict est porté par `readIngredient`, pas ici."],
  "supabase/functions/meal-energy-v1/index.ts::<anonyme>::id,servingsMade,ingredients":
    [V.PROJECTION, "Idem, côté préparation."],
  "supabase/functions/sophia-brain/router/run.ts::processMessage::when_hint,UTC_time,local_label":
    [V.PROJECTION, "Écho des créneaux en attente vers le tour suivant; `raw_text` et `instruction_hint` sont déjà consommés par le compilateur."],
  "supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/router.ts::runOneShotReminderDirectEffectInner::UTC_time,local_label,instruction_hint,replace_target_label":
    [V.PROJECTION, "Payload COMPILÉ (ce que le compilateur déterministe a produit), pas la déclaration du modèle: `raw_text` et `when_hint` sont ses ENTRÉES. Trois sites identiques."],
  "supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/router.ts::runOneShotReminderDirectEffectInner::instruction_hint,UTC_time,local_label,raw_text":
    [V.PROJECTION, "Même chose, avec `raw_text` en plus."],
}));

// ─────────────────────────────────────────────────────────────────────────
// LA SORTIE
// ─────────────────────────────────────────────────────────────────────────

function rel(root, f) {
  return path.relative(root, f);
}

function main() {
  const args = process.argv.slice(2);
  const rootArg = args.find((a) => a.startsWith("--tree="));
  const minArg = args.find((a) => a.startsWith("--min="));
  const labelArg = args.find((a) => a.startsWith("--label="));
  const tree = rootArg ? path.resolve(rootArg.slice("--tree=".length))
                       : repoRootGuess();
  const minKeys = minArg ? Number(minArg.slice("--min=".length)) : 3;
  const label = labelArg ? labelArg.slice("--label=".length) : "arbre de travail";

  const perimeters = [
    ["A · supabase/functions/_shared/keel", path.join(tree, "supabase/functions/_shared/keel")],
    ["B · supabase/functions/_shared (hors keel)", path.join(tree, "supabase/functions/_shared")],
    ["C · points d'entrée edge", path.join(tree, "supabase/functions")],
    ["D · frontend/src/keel", path.join(tree, "frontend/src/keel")],
  ];

  const keelShared = new Set(walkDir(perimeters[0][1]));
  const allShared = walkDir(perimeters[1][1]).filter((f) => !keelShared.has(f));
  const allEdge = walkDir(perimeters[2][1])
    .filter((f) => !keelShared.has(f) && !allShared.includes(f));
  const front = walkDir(perimeters[3][1]);

  const buckets = [
    ["A · _shared/keel", [...keelShared]],
    ["B · _shared hors keel", allShared],
    ["C · fonctions edge", allEdge],
    ["D · frontend/src/keel", front],
  ];

  const files = buckets.flatMap(([, fs_]) => fs_);
  const sources = new Map();
  for (const f of files) {
    try {
      sources.set(
        f,
        ts.createSourceFile(
          f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true,
          f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        ),
      );
    } catch { /* fichier illisible: compté comme non balayé */ }
  }

  const typeIndex = buildTypeIndex(files, sources);

  const all = [];
  for (const [bucket, list] of buckets) {
    for (const f of list) {
      const sf = sources.get(f);
      if (!sf) continue;
      for (const h of analyzeFile(f, sf, minKeys)) {
        h.bucket = bucket;
        h.rel = rel(tree, f);
        all.push(h);
      }
    }
  }

  // ── LE VOCABULAIRE DÉCLARÉ PAR LE MODÈLE ──────────────────────────────
  // Fusionné par NOM DE FORME (dernier segment du chemin): `dishes.ingredients`
  // et `preparations.ingredients` sont le MÊME objet, et c'est exactement ce
  // que la consigne de groupe dit — « in dishes AND in preparations ».
  const modelVocab = new Map(); // forme -> { keys:Set, from:Set(fichiers) }
  for (const f of files) {
    const sf = sources.get(f);
    if (!sf) continue;
    for (const [pathKey, keys] of modelShapesOf(sf)) {
      // ⛔ LA RACINE D'UN SCHÉMA N'EST PAS UNE FORME. Les clés de premier
      // niveau de vingt schémas différents (`dishes`, `tone`, `signals`,
      // `exit_request`…) se retrouveraient dans UN seul sac de ~100 clés, et
      // toute recopie de 3 clés s'y lierait. C'est un faux dénominateur, et il
      // gonflait ③ de 20 candidats fantômes à la première passe.
      const shape = pathKey.split(".").filter(Boolean).pop();
      if (!shape) continue;
      if (!modelVocab.has(shape)) {
        modelVocab.set(shape, { keys: new Set(), from: new Set() });
      }
      const slot = modelVocab.get(shape);
      for (const k of keys) slot.keys.add(snake(k));
      slot.from.add(rel(tree, f));
    }
  }
  for (const [shape, extra] of EXTRA_MODEL_KEYS) {
    if (!modelVocab.has(shape)) {
      modelVocab.set(shape, { keys: new Set(), from: new Set() });
    }
    for (const k of extra) modelVocab.get(shape).keys.add(snake(k));
    modelVocab.get(shape).from.add("(déclaré à la main — voir EXTRA_MODEL_KEYS)");
  }

  // `--shapes` imprime le vocabulaire et D'OÙ il vient. Un dénominateur qu'on
  // ne peut pas relire n'est pas un dénominateur.
  if (args.includes("--shapes")) {
    for (const [shape, slot] of [...modelVocab].sort()) {
      console.log(`${shape} (${slot.keys.size}) : ${[...slot.keys].sort().join(", ")}`);
      console.log(`    ← ${[...slot.from].join(" · ")}`);
    }
    return;
  }

  // ── LIER CHAQUE RECOPIE À LA FORME DU MODÈLE QU'ELLE MANIPULE ─────────
  // ⛔ Une forme n'est retenue que si elle a AU MOINS `minKeys` clés et que la
  // recopie en couvre au moins la moitié: sans ce plancher, `{id, name, type}`
  // se lierait à n'importe quel schéma du dépôt et le chiffre ne dirait rien.
  for (const h of all) {
    const vocabulary = new Set(
      [...h.keysRead, ...h.enumerated].map(snake),
    );
    let bound = null;
    for (const [shape, slot] of modelVocab) {
      if (slot.keys.size < minKeys) continue;
      const inter = [...slot.keys].filter((k) => vocabulary.has(k));
      if (inter.length < minKeys) continue;
      const cover = inter.length / slot.keys.size;
      // ⛔ DEUX SENS, ET IL EN FAUT DEUX. `readDishes` (`meal-energy-v1`) ne
      // lit que 4 des 10 clés d'un plat — la lane d'énergie n'a pas besoin du
      // reste — mais ces 4 clés SONT toutes des clés de plat: la forme est
      // certaine. Ne garder que la couverture du SCHÉMA l'aurait jeté hors
      // population, et avec lui le lecteur qui perd `group`.
      const coverSelf = vocabulary.size
        ? inter.length / vocabulary.size
        : 0;
      if (cover < 0.5 && coverSelf < 0.6) continue;
      const score = inter.length + Math.max(cover, coverSelf);
      if (!bound || score > bound.score) {
        bound = {
          shape,
          score,
          covered: inter.length,
          total: slot.keys.size,
          missing: [...slot.keys].filter((k) => !vocabulary.has(k)).sort(),
          from: [...slot.from],
        };
      }
    }
    h.model = bound;
  }

  // ⛔ ① AU SENS DE LA FICHE: les recopies posées sur une forme que le MODÈLE
  //    déclare. C'est ça, « entre un parseur de réponse de modèle et une
  //    écriture » — et c'est la population qui peut perdre quelque chose.
  const onPath = all.filter((h) => h.model);

  // ── ② les trois compteurs, SUR ① ──────────────────────────────────────
  let a = 0, aOptionalOnly = 0, b = 0, c = 0, unresolvedTarget = 0,
      unresolvedSource = 0;
  for (const h of all) {
    const tName = namedTypeOf(h.targetType);
    const tMembers = tName ? membersOf(typeIndex, tName) : null;
    h.targetMembers = tMembers;
    if (tMembers && tMembers.length > h.enumerated.length) {
      const missing = tMembers.filter((m) => !h.enumerated.includes(m.name));
      h.targetMissing = missing;
    }
    const sName = namedTypeOf(h.sourceType);
    const sMembers = sName ? membersOf(typeIndex, sName) : null;
    h.sourceMembers = sMembers;
    if (sMembers && sMembers.length > h.keysRead.length) {
      h.sourceMissing = sMembers.filter((m) => !h.keysRead.includes(m.name));
    }
    if (!h.model) continue;
    if (tName && tMembers === null) unresolvedTarget++;
    if (sName && sMembers === null) unresolvedSource++;
    if (h.targetMissing?.length) {
      a++;
      if (h.targetMissing.every((m) => m.optional)) aOptionalOnly++;
    }
    if (h.sourceMissing?.length) b++;
    if (isUnconstrained(h.targetType)) c++;
  }

  const out = [];
  const P = (s = "") => out.push(s);

  P("══════════════════════════════════════════════════════════════════════");
  P("X3′ — RECENSEMENT DES RECOPIES DE CLÉS « À LA MAIN »");
  P("══════════════════════════════════════════════════════════════════════");
  P(`arbre           : ${label}`);
  P(`racine          : ${tree}`);
  P(`horodatage      : ${new Date().toISOString()}`);
  P(`seuil de recopie: ≥ ${minKeys} propriétés lisant la MÊME racine`);
  P(`parseur         : typescript ${ts.version} (AST — commentaires exclus par construction)`);
  P("");
  P("── LE PÉRIMÈTRE BALAYÉ (fichiers non-test) ───────────────────────────");
  for (const [bucket, list] of buckets) {
    P(`  ${bucket.padEnd(28)} ${String(list.length).padStart(4)} fichiers`);
  }
  P(`  ${"TOTAL".padEnd(28)} ${String(files.length).padStart(4)} fichiers`);
  P(`  index de types : ${typeIndex.size} interfaces/alias résolus`);
  P(`  formes déclarées par un modèle : ${modelVocab.size} (extraites des littéraux)`);
  P("");
  P("── ⓪ L'UNIVERS : toute recopie énumérée du périmètre ─────────────────");
  const byBucket = new Map();
  for (const h of all) byBucket.set(h.bucket, (byBucket.get(h.bucket) ?? 0) + 1);
  for (const [bucket] of buckets) {
    P(`  ${bucket.padEnd(28)} ${String(byBucket.get(bucket) ?? 0).padStart(4)}`);
  }
  P(`  ${"TOTAL ⓪".padEnd(28)} ${String(all.length).padStart(4)}`);
  P("");
  P("── ① ENTRE UN PARSEUR DE RÉPONSE DE MODÈLE ET UNE ÉCRITURE ───────────");
  P("   critère mécanique: la recopie manipule une FORME que le modèle déclare");
  P("   — son vocabulaire de clés couvre ≥ 50 % d'un schéma de prompt, avec au");
  P(`   moins ${minKeys} clés en commun. C'est la population qui peut perdre`);
  P("   quelque chose; le reste ne recopie rien qu'un modèle ait écrit.");
  const byBucket1 = new Map();
  for (const h of onPath) byBucket1.set(h.bucket, (byBucket1.get(h.bucket) ?? 0) + 1);
  for (const [bucket] of buckets) {
    P(`  ${bucket.padEnd(28)} ${String(byBucket1.get(bucket) ?? 0).padStart(4)}`);
  }
  P(`  ${"TOTAL ①".padEnd(28)} ${String(onPath.length).padStart(4)}`);
  P("");
  P("── ② COMBIEN SONT PLUS COURTES QUE LEUR TYPE (sur ①) ─────────────────");
  P(`  ②a cible nommée, clés écrites < membres du type : ${a}`);
  P(`     …dont TOUS les membres manquants sont facultatifs : ${aOptionalOnly}   ⛔ le tsc est muet sur celles-là`);
  P(`  ②b source nommée, champs lus < membres          : ${b}   ⛔ le tsc est muet sur TOUTES`);
  P(`  ②c cible non contrainte (Record/unknown/rien)   : ${c}   ⛔ le tsc est désarmé par construction`);
  P(`  au moins l'un des trois                         : ${
    onPath.filter((h) => h.targetMissing?.length || h.sourceMissing?.length ||
      isUnconstrained(h.targetType)).length
  }`);
  P(`  non résolus par l'index syntaxique — cible ${unresolvedTarget}, source ${unresolvedSource}`);
  P("");
  P("── ③ LESQUELLES PERDENT UN CHAMP QUE LE MODÈLE DÉCLARE ───────────────");
  const losers = onPath.filter((h) => h.model.missing.length > 0);
  P(`  recopies de ① dont le vocabulaire NE COUVRE PAS toute la forme : ${losers.length}`);
  P("  ⚠️ « ne couvre pas » est un CANDIDAT, pas un verdict: une clé de schéma");
  P("     peut légitimement ne pas concerner cette recopie-là. Le verdict est");
  P("     une LECTURE, écrite dans `VERDICTS`, et le script rougit sans elle.");
  P("");
  let missingVerdict = 0;
  const perdues = [];
  for (const h of losers.sort((x, y) => x.rel.localeCompare(y.rel) || x.line - y.line)) {
    const key = verdictKey(h);
    const v = VERDICTS.get(key);
    P(`  ${h.rel}:${h.line}  ${h.fn}()`);
    P(`      racine « ${h.root} » · ${h.propsFromRoot} propriétés · ${h.enumerated.length} clés écrites`);
    P(`      forme du modèle : « ${h.model.shape} » ${h.model.covered}/${h.model.total} clés couvertes`);
    P(`      NON COUVERT     : ${h.model.missing.join(", ")}`);
    P(`      lit   : ${h.keysRead.join(", ") || "(aucune clé nommée)"}`);
    P(`      écrit : ${h.enumerated.join(", ")}`);
    P(`      cible : ${h.targetType ?? "(aucune annotation)"} [${h.targetKind}]  · source : ${h.sourceType ?? "(déduite)"}`);
    // ⚠️ UN ÉTALEMENT QUI N'EST PAS CELUI DE LA RACINE. `{term, ...readStructuredQuantity(ing), group}`
    // porte `amount`/`unit`/`state` sans les nommer: le candidat paraît perdre
    // trois clés et n'en perd aucune. C'est la classe de faux positifs n° 1.
    if (h.spreads.length) P(`      ÉTALE : ${h.spreads.join(" · ")}`);
    if (v) {
      P(`      ⇒ ③ ${v[0].toUpperCase()} — ${v[1]}`);
      if (v[0] === "perd") perdues.push(`${h.rel}:${h.line} ${h.fn}()`);
    } else {
      P("      ⇒ ③ ⛔ AUCUN VERDICT — candidat NON CLASSÉ.");
      P(`      clé à ajouter dans VERDICTS : ${JSON.stringify(key)}`);
      missingVerdict++;
    }
    P("");
  }
  P("── ③ VERDICT ─────────────────────────────────────────────────────────");
  P(`  perd un champ déclaré par le modèle, AUJOURD'HUI, EN PRODUCTION : ${perdues.length}`);
  for (const p of perdues) P(`      ⛔ ${p}`);
  P(`  non classés (le script sort en rc=1) : ${missingVerdict}`);
  P("");
  P("── LA LISTE ① COMPLÈTE ───────────────────────────────────────────────");
  for (const h of onPath.sort((x, y) => x.rel.localeCompare(y.rel) || x.line - y.line)) {
    const flags = [
      h.parseMark ? "sac" : "typé",
      h.fileWrites ? "écrit" : "-",
      isUnconstrained(h.targetType) ? "②c" : "",
      h.targetMissing?.length ? `②a-${h.targetMissing.length}` : "",
      h.sourceMissing?.length ? `②b-${h.sourceMissing.length}` : "",
      h.model.missing.length ? `③?-${h.model.missing.length}` : "",
    ].filter(Boolean).join(" ");
    P(`  ${h.rel}:${h.line}  ${h.fn}()  [${flags}]  ${h.propsFromRoot}←${h.root}  ~${h.model.shape}`);
  }
  P("");
  P("══════════════════════════════════════════════════════════════════════");
  P(`FIN — ⓪ ${all.length} · ① ${onPath.length} · ②a ${a} (${aOptionalOnly} muettes au tsc) · ②b ${b} · ②c ${c} · ③ candidats ${losers.length}, perdent ${perdues.length}`);
  P("══════════════════════════════════════════════════════════════════════");

  console.log(out.join("\n"));
  if (missingVerdict > 0) {
    console.error(
      `\n⛔ ${missingVerdict} candidat(s) de ③ sans verdict. ` +
        "Lire le prompt à côté, écrire le verdict dans `VERDICTS`, relancer.",
    );
    process.exit(1);
  }
}

main();
