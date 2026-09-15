import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { FLAG_REASON_KEYS, flagReasonCopy } from "./flagReasons";

/**
 * The drift test. `FLAG_REASONS` is declared in the engine and rendered here,
 * and nothing but this test connects the two files. It reads the engine's
 * source rather than importing it: the engine is Deno/JSR code that a Vite/node
 * test cannot load, and reading the declaration is enough to catch the failure
 * that actually happened (a code renamed on one side only).
 */
function engineFlagReasons(): string[] {
  const enginePath = resolve(
    __dirname,
    "../../../../supabase/functions/_shared/keel/coach_synthesis.ts",
  );
  const source = readFileSync(enginePath, "utf8");
  const block = source.match(/export const FLAG_REASONS = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error("FLAG_REASONS not found in coach_synthesis.ts");
  return [...block[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

describe("flag reason copy", () => {
  it("covers every reason code the engine can emit", () => {
    const engine = engineFlagReasons();
    expect(engine.length).toBeGreaterThan(0);
    const missing = engine.filter((code) => !(code in FLAG_REASON_KEYS));
    expect(missing).toEqual([]);
  });

  it("invents no code the engine cannot emit", () => {
    // The half that let the bug hide: `restriction_flag` had copy for years and
    // was never reachable, because the engine emits `restriction_signal`.
    const engine = new Set(engineFlagReasons());
    const orphans = Object.keys(FLAG_REASON_KEYS).filter((code) => !engine.has(code));
    expect(orphans).toEqual([]);
  });

  it("pointe chaque code sur une clé qui existe dans les DEUX packs", () => {
    // La moitié neuve du contrôle depuis que la phrase vit dans le seed: une
    // clé absente ferait LEVER `t()` en DEV — c'est-à-dire un écran blanc là où
    // ce module promet, deux tests plus bas, de montrer un code brut.
    const missing = Object.values(FLAG_REASON_KEYS).filter(
      (key) => en[key] === undefined || fr[key as keyof typeof fr] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it("keeps the safety line pointed at the coach", () => {
    // Adherence pressure stops on a restriction signal, so the copy must send
    // the coach in, not suggest a nudge. Vérifié dans les DEUX langues: la
    // ligne de sécurité est la seule du lot dont le SENS est une consigne, et
    // une traduction qui la rendrait descriptive la désarmerait en silence.
    expect(en[FLAG_REASON_KEYS.restriction_signal]).toMatch(/handle directly/i);
    expect(fr[FLAG_REASON_KEYS.restriction_signal as keyof typeof fr])
      .toMatch(/directement/i);
  });

  it("shows an unknown code raw rather than swallowing it", () => {
    expect(flagReasonCopy("some_future_code")).toBe("some_future_code");
  });
});
