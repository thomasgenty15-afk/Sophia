// LE CONSENTEMENT PUBLICITAIRE — LES CAS QUI DÉCIDENT SI ON DÉPOSE UN COOKIE.
//
// Chaque test ici correspond à une exigence de la CNIL (délibération 2020-091),
// pas à un détail d'implémentation. Le coût d'un défaut n'est pas un écran
// cassé: c'est un cookie publicitaire posé sans droit.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CONSENT_STORAGE_KEY, consentState, recordConsent } from "./consent";

// ⚠️ `vitest.config.ts` TOURNE EN ENVIRONNEMENT `node`: il n'y a PAS de
// `localStorage`. On en pose un en mémoire, comme `i18n/plural.int.test.ts`
// pose `location`. Le module sous test enveloppe déjà chaque accès dans un
// `try` — un stub absent le ferait donc rendre `null` partout, et ces tests
// passeraient en ne mesurant rien.
function installStorage(): Storage {
  const map = new Map<string, string>();
  const storage = {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
  } as Storage;
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

function store(value: unknown): void {
  globalThis.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
}

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe("l'absence de réponse n'est jamais une acceptation", () => {
  it("sans rien en mémoire, l'état est `null` — ni oui ni non", () => {
    // ⚠️ LA GARDE LA PLUS IMPORTANTE DU FICHIER. Un défaut à `"granted"` — ou
    // n'importe quel repli qui se lit comme un oui — déposerait le cookie de
    // tout visiteur qui n'a pas encore vu le bandeau.
    expect(consentState()).toBeNull();
  });

  it("une valeur illisible se lit comme une absence de réponse, pas comme un oui", () => {
    globalThis.localStorage.setItem(CONSENT_STORAGE_KEY, "{ pas du json");
    expect(consentState()).toBeNull();
  });

  it("un choix inconnu (ni granted ni denied) ne devient pas un oui", () => {
    store({ choice: "maybe", at: new Date().toISOString() });
    expect(consentState()).toBeNull();
  });

  it("un enregistrement sans date est refusé: on ne saurait pas quand il expire", () => {
    store({ choice: "granted" });
    expect(consentState()).toBeNull();
  });
});

describe("un choix vaut, et il ne vaut pas éternellement", () => {
  it("une acceptation fraîche est rendue telle quelle", () => {
    recordConsent("granted");
    expect(consentState()).toBe("granted");
  });

  it("un refus frais est rendu tel quel", () => {
    recordConsent("denied");
    expect(consentState()).toBe("denied");
  });

  it("passé six mois, la question se REPOSE — l'état redevient `null`", () => {
    // ⚠️ `null` ET PAS `"denied"`, ET LA DIFFÉRENCE EST TOUT L'OBJET DU TEST.
    // Les deux font taire le tag, donc un `"denied"` passerait pour correct.
    // Mais `null` fait RÉAPPARAÎTRE le bandeau, et `"denied"` le laisserait
    // caché pour toujours après un refus vieux de deux ans — c'est-à-dire un
    // consentement jamais renouvelé, ce que la CNIL demande d'éviter.
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    store({ choice: "granted", at: old });
    expect(consentState()).toBeNull();
  });

  it("un refus ancien se repose aussi: la règle ne dépend pas de la réponse", () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    store({ choice: "denied", at: old });
    expect(consentState()).toBeNull();
  });

  it("juste avant l'échéance, le choix tient encore", () => {
    // La ceinture du test précédent: sans elle, une expiration cassée qui
    // rendrait TOUJOURS `null` passerait pour une expiration qui marche.
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    store({ choice: "granted", at: recent });
    expect(consentState()).toBe("granted");
  });

  it("une date illisible se lit comme une absence de réponse", () => {
    store({ choice: "granted", at: "pas une date" });
    expect(consentState()).toBeNull();
  });
});

describe("ce qui est écrit est relisible", () => {
  it("recordConsent écrit une date ISO, seule preuve du QUAND", () => {
    // La CNIL demande de pouvoir prouver quand le consentement a été recueilli.
    // Un booléen nu ne le permettrait pas — d'où la forme stockée.
    recordConsent("granted");
    const raw = globalThis.localStorage.getItem(CONSENT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { choice: string; at: string };
    expect(parsed.choice).toBe("granted");
    expect(Number.isFinite(Date.parse(parsed.at))).toBe(true);
  });

  it("une seconde réponse remplace la première", () => {
    recordConsent("granted");
    recordConsent("denied");
    expect(consentState()).toBe("denied");
  });
});
