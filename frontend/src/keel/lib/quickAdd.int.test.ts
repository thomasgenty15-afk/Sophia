import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  armQuickAdd,
  hasQuickAdd,
  QUICK_ADD_TTL_MS,
  type QuickAddIntent,
  subscribeQuickAdd,
  takeQuickAdd,
} from "./quickAdd";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE PASSE-PLAT DU « + » — ET LES TROIS FAÇONS DONT UN PASSE-PLAT MENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ① il livre DEUX FOIS (au montage puis à l'abonnement), et le dialogue se
 *   rouvre derrière celui qu'on vient de fermer;
 * ② il ne livre JAMAIS quand l'écran de destination est déjà monté — le tap
 *   n'a alors aucun effet visible, ce qui est indiscernable d'un bouton mort;
 * ③ il livre TROP TARD: une intention armée que rien n'a consommée attend, et
 *   ouvre un dialogue dix minutes plus tard, sans que personne ne l'ait
 *   demandé.
 *
 * Les trois sont ici. Aucun n'est visible en lisant le composant.
 */

/** Un fichier plausible, sans toucher au disque. */
function fakeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "repas.jpg", {
    type: "image/jpeg",
  });
}

beforeEach(() => {
  // Le module porte un état de module: une intention laissée par un test
  // précédent ferait passer le suivant pour de mauvaises raisons.
  takeQuickAdd();
});

describe("armer et consommer", () => {
  it("rend l'intention armée, puis plus rien", () => {
    armQuickAdd({ kind: "weight" });
    expect(takeQuickAdd()).toEqual({ kind: "weight" });
    // ① UNE SEULE FOIS. C'est ce qui permet à `/app/chat` de consommer au
    // montage ET à l'abonnement sans risquer d'ouvrir deux fois.
    expect(takeQuickAdd()).toBeNull();
  });

  it("sans armement, rend `null`", () => {
    expect(takeQuickAdd()).toBeNull();
  });

  it("porte le créneau d'une description", () => {
    armQuickAdd({ kind: "describe", slot: "dinner" });
    expect(takeQuickAdd()).toEqual({ kind: "describe", slot: "dinner" });
  });

  it("porte le fichier d'une photo, tel quel", () => {
    const file = fakeFile();
    armQuickAdd({ kind: "photo", file });
    const got = takeQuickAdd() as Extract<QuickAddIntent, { kind: "photo" }>;
    // ⚠️ LE MÊME OBJET, PAS UNE COPIE. Un `File` recopié perdrait son contenu:
    // c'est lui qui part à `meal-photo-upload-v1`.
    expect(got.file).toBe(file);
  });

  it("un second armement remplace le premier", () => {
    armQuickAdd({ kind: "weight" });
    armQuickAdd({ kind: "describe", slot: "lunch" });
    expect(takeQuickAdd()).toEqual({ kind: "describe", slot: "lunch" });
    expect(takeQuickAdd()).toBeNull();
  });
});

describe("② l'écran déjà monté est prévenu", () => {
  it("l'abonné est appelé à l'armement, et il trouve l'intention", () => {
    const seen: (QuickAddIntent | null)[] = [];
    const off = subscribeQuickAdd(() => seen.push(takeQuickAdd()));
    armQuickAdd({ kind: "weight" });
    off();
    expect(seen).toEqual([{ kind: "weight" }]);
  });

  it("l'abonné ne reçoit RIEN en argument, il prend", () => {
    // La forme du rappel est ce qui interdit deux chemins de livraison: un
    // abonné qui recevrait l'intention pourrait l'ouvrir SANS la consommer, et
    // le montage suivant la rouvrirait.
    const fn = vi.fn();
    const off = subscribeQuickAdd(fn);
    armQuickAdd({ kind: "weight" });
    expect(fn).toHaveBeenCalledWith();
    off();
  });

  it("un désabonné n'est plus appelé", () => {
    const fn = vi.fn();
    subscribeQuickAdd(fn)();
    armQuickAdd({ kind: "weight" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("un abonné qui se désabonne en réagissant ne casse pas la boucle", () => {
    const seen: string[] = [];
    const offA = subscribeQuickAdd(() => {
      seen.push("a");
      offA();
    });
    const offB = subscribeQuickAdd(() => seen.push("b"));
    armQuickAdd({ kind: "weight" });
    expect(seen).toEqual(["a", "b"]);
    offB();
  });
});

describe("③ une intention périmée n'ouvre rien", () => {
  it("passé le délai, elle ne se rend plus", () => {
    armQuickAdd({ kind: "weight" }, 1_000);
    expect(takeQuickAdd(1_000 + QUICK_ADD_TTL_MS + 1)).toBeNull();
  });

  it("juste avant le délai, elle se rend encore", () => {
    armQuickAdd({ kind: "weight" }, 1_000);
    expect(takeQuickAdd(1_000 + QUICK_ADD_TTL_MS)).toEqual({ kind: "weight" });
  });

  it("une intention périmée est CONSOMMÉE quand même", () => {
    armQuickAdd({ kind: "weight" }, 1_000);
    expect(takeQuickAdd(1_000 + QUICK_ADD_TTL_MS + 1)).toBeNull();
    // Sans ça, la même intention morte serait réessayée à chaque montage —
    // pour toujours.
    expect(takeQuickAdd(1_000)).toBeNull();
  });

  it("`hasQuickAdd` ne consomme rien et suit la même péremption", () => {
    armQuickAdd({ kind: "weight" }, 1_000);
    expect(hasQuickAdd(1_000)).toBe(true);
    expect(hasQuickAdd(1_000 + QUICK_ADD_TTL_MS + 1)).toBe(false);
    expect(takeQuickAdd(1_000)).toEqual({ kind: "weight" });
  });
});
