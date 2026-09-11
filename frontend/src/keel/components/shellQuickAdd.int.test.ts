import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NAV, splitAroundQuickAdd } from "./KeelAppShell";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE « + » DE LA BARRE DU BAS — SA PLACE, SON PLAFOND, ET SA JOINTURE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le geste le plus courant du produit — déclarer un repas non prévu — n'avait
 * qu'un seul chemin: le « + » DU COMPOSEUR de `/app/chat`. Il en a un second,
 * au milieu de la barre d'onglets, et ce second chemin n'exécute rien: il ARME
 * une intention et va sur `/app/chat`, qui porte les trois gestes en entier.
 *
 * ── CE QUE CE FICHIER TIENT, ET POURQUOI TROIS MOITIÉS ────────────────────
 * ① la PLACE: le bouton est au centre, et il y reste quand le nombre d'onglets
 *   change;
 * ② le PLAFOND: la cinquième colonne est la sienne, donc `bottom` ne peut plus
 *   porter que quatre entrées. Une cinquième ne casserait rien de VISIBLE —
 *   elle rétrécirait les six colonnes ensemble, et c'est le « + », au milieu,
 *   qui perdrait sa cible en premier;
 * ③ la JOINTURE: chaque intention que la coquille sait armer, `/app/chat` sait
 *   la consommer. Sans ③, ajouter un quatrième geste au tiroir donnerait un
 *   bouton qui navigue et n'ouvre rien — et ① comme ② resteraient verts.
 */

const HERE = __dirname;
const SHELL = resolve(HERE, "./KeelAppShell.tsx");
const CHAT = resolve(HERE, "../pages/ChatPage.tsx");
const QUICK_ADD = resolve(HERE, "../lib/quickAdd.ts");

/** Même blanchiment que les autres tests de source: une note n'est pas du code. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

function read(path: string): string {
  return stripComments(readFileSync(path, "utf8"));
}

describe("① la place du « + »", () => {
  it("quatre onglets se partagent deux à gauche, deux à droite", () => {
    expect(splitAroundQuickAdd(["a", "b", "c", "d"])).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("sur un nombre impair, la gauche prend la plus grosse moitié", () => {
    expect(splitAroundQuickAdd(["a", "b", "c"])).toEqual([["a", "b"], ["c"]]);
  });

  it("aucun onglet: le « + » reste seul, sans planter", () => {
    expect(splitAroundQuickAdd([])).toEqual([[], []]);
  });

  it("la barre de l'élève met le « + » au centre exact", () => {
    const bottom = NAV.student.filter((i) => i.bottom);
    const [left, right] = splitAroundQuickAdd(bottom);
    // Cinq colonnes, le bouton au milieu: c'est la seule que le pouce atteint
    // sans déplacer la main.
    expect(left.length).toBe(right.length);
  });
});

describe("② le plafond de la barre", () => {
  it("au plus QUATRE entrées `bottom`, la cinquième colonne étant le « + »", () => {
    const bottom = NAV.student.filter((i) => i.bottom);
    expect(bottom.length).toBeLessThanOrEqual(4);
  });

  it("le coach n'a aucune entrée `bottom` — sa barre n'existe pas", () => {
    // La barre du bas ne se rend que pour `variant === "student"`; des entrées
    // `bottom` chez le coach seraient une promesse sans écran.
    expect(NAV.coach.filter((i) => i.bottom)).toEqual([]);
  });
});

describe("③ la jointure coquille → conversation", () => {
  /** Les `kind` du type `QuickAddIntent`, lus dans le module lui-même. */
  const kinds = [
    ...new Set(
      [...read(QUICK_ADD).matchAll(/kind:\s*"([a-z_]+)"/g)].map((m) => m[1]),
    ),
  ];

  it("le passe-plat porte bien les trois gestes du tiroir", () => {
    expect(kinds.sort()).toEqual(["describe", "photo", "weight"]);
  });

  it.each(kinds)("la coquille sait armer « %s »", (kind) => {
    expect(read(SHELL)).toContain(`kind: "${kind}"`);
  });

  it.each(kinds)("`/app/chat` sait consommer « %s »", (kind) => {
    expect(read(CHAT)).toContain(`"${kind}"`);
  });

  it("la coquille consomme l'intention par `armQuickAdd`, et rien d'autre", () => {
    const shell = read(SHELL);
    expect(shell).toContain("armQuickAdd");
    expect(shell).toContain('navigate("/app/chat")');
  });

  it("`/app/chat` consomme AU MONTAGE ET À L'ARMEMENT", () => {
    const chat = read(CHAT);
    // Les deux, et pas l'un ou l'autre: au montage quand on arrive d'un autre
    // écran, à l'armement quand on y était déjà — `navigate("/app/chat")`
    // depuis `/app/chat` ne remonte rien, et le tap n'aurait alors aucun effet.
    expect(chat).toContain("takeQuickAdd");
    expect(chat).toContain("subscribeQuickAdd");
  });
});

describe("⛔ la coquille ne réécrit AUCUN des trois gestes", () => {
  /**
   * C'est la décision entière du lot, et c'est la seule qu'un changement futur
   * peut défaire sans que rien ne rougisse: recopier dans la barre l'envoi de
   * photo, le dialogue de description ou le jeton de pesée ferait une seconde
   * implémentation de chacun — sur un écran que personne ne relit, donc celle
   * qui garderait l'ancienne règle au premier correctif.
   */
  it.each([
    "uploadMealPhoto",
    "TrackingDescribeDialog",
    "WeighInDialog",
    "describeMissedMeal",
    "sendChatMessage",
  ])("`KeelAppShell` n'importe pas `%s`", (symbol) => {
    expect(read(SHELL)).not.toContain(symbol);
  });
});
