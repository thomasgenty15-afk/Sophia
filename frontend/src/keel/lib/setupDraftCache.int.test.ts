import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  clearSetupDraft,
  reconcileDraft,
  readSetupDraft,
  sameValue,
  SETUP_DRAFT_TTL_MS,
  SETUP_DRAFT_VERSION,
  setupDraftKey,
  takeKnownShape,
  writeSetupDraft,
} from "./setupDraftCache";

// ===========================================================================
// LE BROUILLON DE L'ENTONNOIR — CE QU'IL RESTAURE, ET SURTOUT CE QU'IL REFUSE
// ===========================================================================
//
// Ce fichier tient les DEUX moitiés de la décision, et la seconde est celle qui
// coûte cher si elle lâche:
//
//   · il rend une saisie que personne n'a enregistrée (le défaut qu'on ferme);
//   · il ne rend RIEN par-dessus une valeur que la base a changée depuis (la
//     cicatrice `mount-snapshot-forms-need-a-loading-gate`, prise à l'envers:
//     ici, c'est le cache qui pourrait écraser).
//
// ⚠️ CHAQUE TEST DE RÈGLE EST ÉCRIT POUR ÉCHOUER SI SA RÈGLE DISPARAÎT. Une
// suite qui reste verte quand on retire la règle 2 ne prouve rien du tout.

/** `environment: "node"` n'a pas de `localStorage`. On en pose un. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as unknown as Storage;
}

function installStorage(value: Storage | undefined): void {
  Object.defineProperty(globalThis, "localStorage", {
    value,
    configurable: true,
    writable: true,
  });
}

const NOW = 1_756_000_000_000;
const USER = "11111111-1111-1111-1111-111111111111";

/** La forme réduite de `SelfDraft` qui suffit à porter les trois règles. */
interface Shape {
  weightKg: string;
  goal: string;
  activityLevel: string | null;
  habits: Record<string, string>;
  allergies: string[];
}

function shape(over: Partial<Shape> = {}): Shape {
  return {
    weightKg: "",
    goal: "",
    activityLevel: null,
    habits: {},
    allergies: [],
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  return {
    self: shape() as unknown as object,
    plan: { cookDays: [], cookingTimeMin: null } as unknown as object,
    mouth: {} as unknown as object,
    stepIndex: 0,
    householdSize: null,
    cookingShape: null,
    oneCookingSession: false,
    envy: "",
    envyWeek: "2026-08-31",
    ...over,
  } as Parameters<typeof writeSetupDraft>[1]["draft"];
}

beforeEach(() => {
  installStorage(memoryStorage());
});

// ---------------------------------------------------------------------------
describe("sameValue — pourquoi `===` ne pouvait pas suffire", () => {
  it("compare les objets sur leur CONTENU, pas leur instance", () => {
    // ⚠️ LE TEST QUI JUSTIFIE LA FONCTION. Deux lectures successives de la base
    // rendent deux instances de `habits`. Avec `===`, `fresh != base` serait
    // vrai à chaque montage, la règle 2 mordrait sur tous les champs objets, et
    // le brouillon ne parlerait JAMAIS pour eux.
    const a = { breakfast: "un fruit" };
    const b = { breakfast: "un fruit" };
    expect(a === b).toBe(false);
    expect(sameValue(a, b)).toBe(true);
  });

  it("voit une différence de valeur, de longueur, de genre et de nullité", () => {
    expect(sameValue({ slot: "lunch", size: "M" }, { slot: "lunch", size: "L" }))
      .toBe(false);
    expect(sameValue(["a"], ["a", "b"])).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue([], {})).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue([{ x: [1] }], [{ x: [1] }])).toBe(true);
    expect(sameValue([{ x: [1] }], [{ x: [2] }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("reconcileDraft — les trois règles, une par une", () => {
  it("règle 1 · un champ jamais touché suit le serveur", () => {
    // Le brouillon porte le poids qu'il a LU. La base a bougé depuis: c'est
    // elle qui parle, sinon le cache figerait l'écran sur une photo d'hier.
    const out = reconcileDraft({
      base: shape({ weightKg: "80" }),
      draft: shape({ weightKg: "80" }),
      fresh: shape({ weightKg: "85" }),
    });
    expect(out.weightKg).toBe("85");
  });

  it("règle 2 · un champ touché des DEUX côtés suit le serveur", () => {
    // ⚠️ LA RÈGLE QUI PROTÈGE LA BASE. `/app/household` écrit sur les mêmes
    // colonnes. Sans elle, une saisie jamais validée ici écraserait, au
    // rechargement, une valeur qu'un autre écran a réellement enregistrée.
    const out = reconcileDraft({
      base: shape({ weightKg: "80" }),
      draft: shape({ weightKg: "75" }),
      fresh: shape({ weightKg: "85" }),
    });
    expect(out.weightKg).toBe("85");
  });

  it("règle 3 · une saisie que rien ne contredit revient à l'écran", () => {
    // Le défaut qu'on ferme: tapé, jamais enregistré, rechargé.
    const out = reconcileDraft({
      base: shape({ weightKg: "80" }),
      draft: shape({ weightKg: "75" }),
      fresh: shape({ weightKg: "80" }),
    });
    expect(out.weightKg).toBe("75");
  });

  it("règle 3 vaut aussi pour les champs OBJETS — et c'est `sameValue` qui le permet", () => {
    // ⚠️ CE TEST TOMBE SI `sameValue` REDEVIENT `===`: `fresh.habits` et
    // `base.habits` sont deux instances de même contenu, la règle 2 mordrait,
    // et « une pomme le matin » disparaîtrait au rechargement.
    const out = reconcileDraft({
      base: shape({ habits: { breakfast: "" } }),
      draft: shape({ habits: { breakfast: "une pomme" } }),
      fresh: shape({ habits: { breakfast: "" } }),
    });
    expect(out.habits).toEqual({ breakfast: "une pomme" });
  });

  it("un premier remplissage (base vide, serveur muet) revient en entier", () => {
    const out = reconcileDraft({
      base: shape(),
      draft: shape({
        weightKg: "72",
        goal: "lose_fat",
        activityLevel: "moderate",
        allergies: ["arachide"],
      }),
      fresh: shape(),
    });
    expect(out).toEqual(
      shape({
        weightKg: "72",
        goal: "lose_fat",
        activityLevel: "moderate",
        allergies: ["arachide"],
      }),
    );
  });

  it("sans brouillon — ou sans arbitre — c'est la lecture serveur, telle quelle", () => {
    const fresh = shape({ weightKg: "80" });
    expect(reconcileDraft({ base: null, draft: shape(), fresh })).toBe(fresh);
    expect(reconcileDraft({ base: shape(), draft: null, fresh })).toBe(fresh);
    expect(reconcileDraft({ base: undefined, draft: undefined, fresh })).toBe(
      fresh,
    );
  });

  it("la forme de sortie est celle du SERVEUR: un champ inconnu de lui ne traverse pas", () => {
    const out = reconcileDraft({
      base: { weightKg: "80" } as Record<string, unknown>,
      draft: { weightKg: "75", retiredField: "x" } as Record<string, unknown>,
      fresh: { weightKg: "80" } as Record<string, unknown>,
    });
    expect(out).toEqual({ weightKg: "75" });
    expect(Object.hasOwn(out, "retiredField")).toBe(false);
  });

  it("un champ que le brouillon ne porte pas laisse simplement passer le serveur", () => {
    const out = reconcileDraft({
      base: shape({ weightKg: "80" }),
      draft: { weightKg: "75" } as unknown as Shape,
      fresh: shape({ weightKg: "80", goal: "maintain" }),
    });
    expect(out.weightKg).toBe("75");
    expect(out.goal).toBe("maintain");
  });
});

// ---------------------------------------------------------------------------
describe("takeKnownShape — ce qu'un sac de clés a le droit de devenir", () => {
  it("une clé absente, ou d'un autre genre, retombe sur la lecture serveur", () => {
    const out = takeKnownShape(shape({ weightKg: "80", goal: "maintain" }), {
      // `goal` absent  → la lecture serveur.
      weightKg: 75, // nombre là où l'écran attend une chaîne → refusé.
    });
    expect(out.weightKg).toBe("80");
    expect(out.goal).toBe("maintain");
  });

  it("un `null` traverse dans les deux sens — les tri-états en dépendent", () => {
    // `activityLevel` répondu: `null` côté serveur, jeton côté brouillon.
    expect(takeKnownShape(shape(), { activityLevel: "moderate" }).activityLevel)
      .toBe("moderate");
    // `activityLevel` effacé: jeton côté serveur, `null` côté brouillon.
    expect(
      takeKnownShape(shape({ activityLevel: "moderate" }), {
        activityLevel: null,
      }).activityLevel,
    ).toBe(null);
  });

  it("une clé que la forme attendue ne porte pas ne traverse pas", () => {
    const out = takeKnownShape(shape(), { weightKg: "75", intrus: "x" });
    expect(out.weightKg).toBe("75");
    expect(Object.hasOwn(out, "intrus")).toBe(false);
  });

  it("sans brouillon, la forme attendue est rendue telle quelle", () => {
    const fresh = shape({ weightKg: "80" });
    expect(takeKnownShape(fresh, null)).toBe(fresh);
    expect(takeKnownShape(fresh, undefined)).toBe(fresh);
  });

  it("les objets et tableaux gardent leur genre", () => {
    const out = takeKnownShape(shape({ habits: { lunch: "riz" } }), {
      habits: ["pas un objet"],
      allergies: { "pas": "un tableau" },
    });
    expect(out.habits).toEqual({ lunch: "riz" });
    expect(out.allergies).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("le stockage — et les quatre façons de ne rien rendre", () => {
  it("écrit puis relit ce qu'on lui a confié", () => {
    writeSetupDraft(
      USER,
      { base: { self: shape(), plan: {} }, draft: payload({ stepIndex: 2 }) },
      NOW,
    );
    const kept = readSetupDraft(USER, NOW);
    expect(kept?.draft.stepIndex).toBe(2);
    expect(kept?.at).toBe(NOW);
  });

  it("garde la taille choisie avant que l'objectif puisse créer sa ligne", () => {
    writeSetupDraft(
      USER,
      {
        base: { self: shape(), plan: {} },
        draft: payload({ householdSize: 3 }),
      },
      NOW,
    );
    expect(readSetupDraft(USER, NOW)?.draft.householdSize).toBe(3);
  });

  it("une clé par compte: deux personnes sur le même navigateur ne se croisent pas", () => {
    const other = "22222222-2222-2222-2222-222222222222";
    writeSetupDraft(
      USER,
      { base: { self: shape(), plan: {} }, draft: payload({ envy: "à moi" }) },
      NOW,
    );
    expect(setupDraftKey(USER)).not.toBe(setupDraftKey(other));
    expect(readSetupDraft(other, NOW)).toBe(null);
    expect(readSetupDraft(USER, NOW)?.draft.envy).toBe("à moi");
  });

  it("un brouillon d'une autre version est JETÉ, pas migré", () => {
    // ⚠️ ÉCRIT AVEC `SETUP_DRAFT_VERSION + 1` ET PAS UN LITTÉRAL: ce qui est
    // prouvé est « une version qui n'est pas la mienne », pas « la version 2 ».
    globalThis.localStorage.setItem(
      setupDraftKey(USER),
      JSON.stringify({
        v: SETUP_DRAFT_VERSION + 1,
        at: NOW,
        base: { self: {}, plan: {} },
        draft: payload(),
      }),
    );
    expect(readSetupDraft(USER, NOW)).toBe(null);
    // Et l'entrée part, pour ne pas rejouer la lecture à chaque montage.
    expect(globalThis.localStorage.getItem(setupDraftKey(USER))).toBe(null);
  });

  it("sept jours, et le bord exact est gardé", () => {
    // Le TTL est SEPT JOURS. Le nombre est écrit ici en clair: une constante
    // qui se relit elle-même resterait verte si quelqu'un la changeait.
    expect(SETUP_DRAFT_TTL_MS).toBe(604_800_000);

    const write = (at: number) =>
      globalThis.localStorage.setItem(
        setupDraftKey(USER),
        JSON.stringify({
          v: SETUP_DRAFT_VERSION,
          at,
          base: { self: {}, plan: {} },
          draft: payload(),
        }),
      );

    write(NOW - SETUP_DRAFT_TTL_MS);
    expect(readSetupDraft(USER, NOW)).not.toBe(null);

    write(NOW - SETUP_DRAFT_TTL_MS - 1);
    expect(readSetupDraft(USER, NOW)).toBe(null);
    expect(globalThis.localStorage.getItem(setupDraftKey(USER))).toBe(null);
  });

  it("illisible, ou de forme incomplète, ne rend rien", () => {
    globalThis.localStorage.setItem(setupDraftKey(USER), "{pas du json");
    expect(readSetupDraft(USER, NOW)).toBe(null);

    globalThis.localStorage.setItem(
      setupDraftKey(USER),
      JSON.stringify({
        v: SETUP_DRAFT_VERSION,
        at: NOW,
        base: { self: {}, plan: {} },
        // `mouth` manque: l'écran en tirerait un `setMouth(undefined)`.
        draft: { self: {}, plan: {}, stepIndex: 0 },
      }),
    );
    expect(readSetupDraft(USER, NOW)).toBe(null);

    globalThis.localStorage.setItem(
      setupDraftKey(USER),
      JSON.stringify({ v: SETUP_DRAFT_VERSION, at: NOW, draft: payload() }),
    );
    expect(readSetupDraft(USER, NOW)).toBe(null);
  });

  it("`clearSetupDraft` retire l'entrée, et lui seul", () => {
    writeSetupDraft(
      USER,
      { base: { self: shape(), plan: {} }, draft: payload() },
      NOW,
    );
    clearSetupDraft(USER);
    expect(readSetupDraft(USER, NOW)).toBe(null);
  });

  it("sans `localStorage`, rien ne jette et rien n'est rendu", () => {
    // ⚠️ LE CACHE EST UN CONFORT, PAS UNE DÉPENDANCE. Navigation privée, quota
    // plein, rendu serveur: aucun des trois ne doit empêcher quelqu'un de
    // remplir l'entonnoir.
    installStorage(undefined);
    expect(() =>
      writeSetupDraft(
        USER,
        { base: { self: shape(), plan: {} }, draft: payload() },
        NOW,
      )
    ).not.toThrow();
    expect(readSetupDraft(USER, NOW)).toBe(null);
    expect(() => clearSetupDraft(USER)).not.toThrow();
  });

  it("un compte sans identifiant n'écrit ni ne lit", () => {
    writeSetupDraft(
      "",
      { base: { self: shape(), plan: {} }, draft: payload() },
      NOW,
    );
    expect(globalThis.localStorage.length).toBe(0);
    expect(readSetupDraft("", NOW)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// LE CÂBLAGE DE `SetupPage`, LU DANS LA SOURCE
//
// ⚠️ POURQUOI LA SOURCE PLUTÔT QUE L'ÉCRAN — même raison que
// `setupDraftWiring.int.test.ts`: monter `SetupPage` demande une session et une
// base. Ce qu'il faut épingler ici est un ORDRE, et il tient dans le texte.
// ---------------------------------------------------------------------------
const ROOT = resolve(__dirname, "../../../..");

function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

describe("SetupPage — le miroir et son arbitre", () => {
  const src = code("frontend/src/keel/pages/SetupPage.tsx");

  it("le miroir n'écrit pas avant la fin de la lecture", () => {
    // ⚠️ LA GARDE QUI COÛTE TOUT SI ELLE SAUTE. Avant `ready`, `self` vaut
    // `null` et `serverBase` n'a pas d'arbitre: un miroir non gardé écrirait le
    // vide du montage PAR-DESSUS le brouillon qu'on est en train de restaurer,
    // et le cache s'effacerait lui-même à chaque chargement.
    const at = src.indexOf("writeSetupDraft(");
    expect(at).toBeGreaterThan(0);
    const before = src.slice(Math.max(0, at - 400), at);
    expect(before).toContain('state.kind !== "ready"');
  });

  it("l'arbitre est posé à CHAQUE lecture, pas seulement à la semence", () => {
    // `serverBase` doit être écrit AVANT le `if (seed)`. Posé dedans, il
    // resterait figé sur la photo du montage: corriger un champ, enregistrer,
    // le recorriger puis recharger rendrait la PREMIÈRE correction.
    const assign = src.indexOf("serverBase.current = {");
    const seedGate = src.indexOf("if (seed) {");
    expect(assign).toBeGreaterThan(0);
    expect(seedGate).toBeGreaterThan(0);
    expect(assign).toBeLessThan(seedGate);
  });

  it("le brouillon part quand le plan est écrit", () => {
    expect(src).toContain("clearSetupDraft(userId)");
    const at = src.indexOf("clearSetupDraft(userId)");
    expect(src.slice(at, at + 400)).toContain('navigate("/app/plan"');
  });

  it("une seule semence nourrit l'écran ET l'arbitre", () => {
    // Deux `seedSelfFrom` recopiés divergeraient au premier correctif, et la
    // divergence se lirait comme un champ qui s'efface tout seul.
    expect(src.split("function seedSelfFrom(").length - 1).toBe(1);
    expect(src.split("seedSelfFrom(read, habitsMap)").length - 1).toBe(1);
  });
});
