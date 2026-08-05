/**
 * `/coach/doctrine` — l'aperçu par objectif.
 *
 * LE TEST QUI PORTE L'ÉCRAN: « ce que le coach lit dans l'aperçu est,
 * mot pour mot, ce que l'élève de cet objectif recevra ». Il ne peut être vrai
 * que parce que l'aperçu EST le compilateur du serveur — ces tests le
 * vérifient depuis le front, avec le bundler du front, pour que la chaîne
 * casse ici le jour où quelqu'un ajoute un import Deno runtime dans
 * `doctrine.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  ALWAYS_SHARED_SECTIONS,
  cacheFootprint,
  type DoctrineDraft,
  draftToDoctrine,
  GOAL_TOKENS,
  PREVIEW_VARIANTS,
  previewVariants,
  scopeSentence,
  toggleGoalScope,
  variantLabel,
} from "./coachDoctrine";

const DRAFT: DoctrineDraft = {
  beliefs: [
    { claim: "Protein at every meal.", rationale: null },
    { claim: "Do not panic over a plateau.", goal_scope: ["fat_loss"] },
  ],
  forbidden: [{ token: "six_small_meals", surface_forms: ["6 petits repas"], instead: "Three meals." }],
  vocabulary: [{ term: "la fenêtre", meaning: "the eating window" }],
  arbitrations: [
    { situation: "cracked", coach_answer: "One evening is data." },
    { situation: "scale stuck", coach_answer: "Show me the waist.", goal_scope: ["fat_loss"] },
  ],
  foods: { recommended: [{ term: "eggs" }], discouraged: [] },
  qa: [{ question: "Coffee?", answer: "Black." }],
  voice: { address: "tu", length: "short" },
};

describe("l'aperçu par objectif", () => {
  it("montre six variantes, la default en tête", () => {
    expect(PREVIEW_VARIANTS).toHaveLength(6);
    expect(PREVIEW_VARIANTS[0]).toBeNull();
    expect(variantLabel(null)).toBe("No goal set yet");
    expect(variantLabel("fat_loss")).toBe("Losing fat");
  });

  it("ce que le coach lit est ce que l'élève reçoit — la portée mord", () => {
    const { doctrine } = draftToDoctrine(DRAFT, "Marlow", "en");
    const variants = previewVariants(doctrine);
    const byGoal = (g: string | null) => variants.find((v) => v.goal === g)!;

    expect(byGoal("fat_loss").compiled.text).toContain("Do not panic over a plateau.");
    expect(byGoal("fat_loss").compiled.text).toContain("Show me the waist.");
    expect(byGoal("health").compiled.text).not.toContain("Do not panic");
    expect(byGoal("health").compiled.text).not.toContain("Show me the waist.");
    // La voix et les interdits, eux, sont partout.
    for (const v of variants) {
      expect(v.compiled.text).toContain("Protein at every meal.");
      expect(v.compiled.text).toContain("six_small_meals");
      expect(v.compiled.text).toContain("la fenêtre");
    }
  });

  it("dit au coach QUELS objectifs reçoivent le même bloc", () => {
    // C'est la moitié utile de l'aperçu: un coach qui restreint une croyance à
    // la perte de gras et lit « identique à Health, Maintenance » sur la
    // variante par défaut apprend ce que sa restriction a vraiment fait.
    const { doctrine } = draftToDoctrine(DRAFT, "Marlow", "en");
    const variants = previewVariants(doctrine);
    const dflt = variants.find((v) => v.goal === null)!;
    expect(dflt.sharesCacheWith.sort()).toEqual([
      "health",
      "maintenance",
      "performance",
      "recomposition",
    ]);
    expect(variants.find((v) => v.goal === "fat_loss")!.sharesCacheWith).toEqual([]);
  });

  it("une doctrine sans portée: six variantes, UN seul bloc", () => {
    const unscoped: DoctrineDraft = {
      ...DRAFT,
      beliefs: [{ claim: "Protein at every meal." }],
      arbitrations: [{ situation: "cracked", coach_answer: "One evening is data." }],
    };
    const { doctrine } = draftToDoctrine(unscoped, "Marlow", "en");
    expect(cacheFootprint(doctrine)).toEqual({ variants: 6, entries: 1 });
    const texts = new Set(previewVariants(doctrine).map((v) => v.compiled.text));
    expect(texts.size).toBe(1);
  });

  it("signale la variante qui ne reçoit RIEN de la méthode", () => {
    const allTargeted: DoctrineDraft = {
      beliefs: [{ claim: "Only for cutting.", goal_scope: ["fat_loss"] }],
      forbidden: [],
      vocabulary: [],
      arbitrations: [],
      foods: { recommended: [], discouraged: [] },
      qa: [],
      voice: {},
    };
    const { doctrine } = draftToDoctrine(allTargeted, "Marlow", "en");
    const variants = previewVariants(doctrine);
    expect(variants.find((v) => v.goal === "health")!.compiled.emptyForGoal).toBe(true);
    expect(variants.find((v) => v.goal === "fat_loss")!.compiled.emptyForGoal).toBe(false);
  });

  it("remonte les entrées lâchées, pour que le coach sache pourquoi", () => {
    const { issues } = draftToDoctrine(
      { beliefs: [{ claim: "x", goal_scope: ["cutting"] }] },
      "Marlow",
      "en",
    );
    expect(issues.join(" ")).toContain("unknown goal");
  });
});

describe("le marqueur de portée", () => {
  it("bascule un objectif sans muter le tableau d'origine", () => {
    const scope = ["fat_loss"];
    expect(toggleGoalScope(scope, "health")).toEqual(["fat_loss", "health"]);
    expect(toggleGoalScope(scope, "fat_loss")).toEqual([]);
    expect(scope).toEqual(["fat_loss"]);
    expect(toggleGoalScope(undefined, "health")).toEqual(["health"]);
  });

  it("« Everyone » est une valeur affichée, pas un champ vide", () => {
    expect(scopeSentence(undefined)).toBe("Everyone");
    expect(scopeSentence([])).toBe("Everyone");
    expect(scopeSentence(["fat_loss", "health"])).toBe("Losing fat, Health");
  });

  it("ne propose JAMAIS de restreindre ce qui est commun", () => {
    // Si `forbidden` apparaissait un jour comme portable, un coach pourrait
    // interdire une phrase à certains élèves seulement — c'est-à-dire une
    // préférence, pas un interdit.
    expect(ALWAYS_SHARED_SECTIONS).toContain("forbidden");
    expect(ALWAYS_SHARED_SECTIONS).toContain("voice");
    expect(ALWAYS_SHARED_SECTIONS).toContain("vocabulary");
    expect(ALWAYS_SHARED_SECTIONS as readonly string[]).not.toContain("beliefs");
    expect(ALWAYS_SHARED_SECTIONS as readonly string[]).not.toContain("arbitrations");
  });

  it("le vocabulaire d'objectifs du front EST celui du serveur", () => {
    // Recopier les cinq jetons ici créerait une seconde source de vérité qui
    // dériverait du CHECK de la base au premier ajout.
    expect([...GOAL_TOKENS]).toEqual([
      "fat_loss",
      "recomposition",
      "performance",
      "health",
      "maintenance",
    ]);
  });
});
