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
  addEntry,
  ALWAYS_SHARED_SECTIONS,
  cacheFootprint,
  type DoctrineDraft,
  draftToDoctrine,
  entriesForScope,
  GOAL_TOKENS,
  joinForms,
  patchEntry,
  PREVIEW_VARIANTS,
  previewVariants,
  pruneDraft,
  removeEntry,
  scopeSentence,
  splitForms,
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

describe("l'édition — une partie globale, une partie par dynamique", () => {
  it("sépare le global du spécifique, et rend la POSITION avec l'entrée", () => {
    // Les deux parties de l'écran éditent le MÊME tableau. Une vue filtrée qui
    // perdrait sa position absolue écrirait dans la mauvaise entrée dès la
    // première suppression.
    const globals = entriesForScope(DRAFT.beliefs, null);
    expect(globals.map((e) => e.index)).toEqual([0]);
    expect(globals[0].entry.claim).toBe("Protein at every meal.");

    const fatLoss = entriesForScope(DRAFT.beliefs, "fat_loss");
    expect(fatLoss.map((e) => e.index)).toEqual([1]);
    expect(entriesForScope(DRAFT.beliefs, "health")).toEqual([]);
  });

  it("une portée vide ou absente est GLOBALE — les deux, pas seulement l'une", () => {
    const list = [{ claim: "a" }, { claim: "b", goal_scope: [] }, { claim: "c", goal_scope: ["health"] }];
    expect(entriesForScope(list, null).map((e) => e.entry.claim)).toEqual(["a", "b"]);
    expect(entriesForScope(list, "health").map((e) => e.entry.claim)).toEqual(["c"]);
  });

  it("écrire dans la partie d'une dynamique ne touche à rien d'autre", () => {
    const before = DRAFT.beliefs!;
    const after = patchEntry(before, 1, { claim: "Changed." });
    expect(after[1].claim).toBe("Changed.");
    expect(after[1].goal_scope).toEqual(["fat_loss"]);
    expect(after[0]).toEqual(before[0]);
    expect(before[1].claim).toBe("Do not panic over a plateau.");
  });

  it("ajouter et retirer rendent de nouveaux tableaux", () => {
    const added = addEntry(DRAFT.beliefs, { claim: "New.", goal_scope: ["health"] });
    expect(added).toHaveLength(3);
    expect(entriesForScope(added, "health")).toHaveLength(1);
    expect(DRAFT.beliefs).toHaveLength(2);

    const removed = removeEntry(added, 1);
    expect(removed.map((b) => b.claim)).toEqual(["Protein at every meal.", "New."]);
    // Et la position rendue par la vue suit le retrait, sans décalage.
    expect(entriesForScope(removed, "health").map((e) => e.index)).toEqual([1]);
  });

  it("une entrée écrite dans une dynamique n'atteint QUE cette dynamique", () => {
    // Le bout en bout de l'écran: le coach ajoute une ligne pour la recomp,
    // et l'élève en perte de gras ne doit jamais la lire.
    const edited: DoctrineDraft = {
      ...DRAFT,
      beliefs: addEntry(DRAFT.beliefs, {
        claim: "Eat more on training days.",
        goal_scope: ["recomposition"],
      }),
    };
    const { doctrine } = draftToDoctrine(edited, "Marlow", "en");
    const variants = previewVariants(doctrine);
    const text = (g: string | null) => variants.find((v) => v.goal === g)!.compiled.text;
    expect(text("recomposition")).toContain("Eat more on training days.");
    expect(text("fat_loss")).not.toContain("Eat more on training days.");
    expect(text(null)).not.toContain("Eat more on training days.");
  });

  it("une ligne ouverte et jamais remplie ne part pas en base", () => {
    // Un formulaire à « + » produit forcément des lignes vides. Enregistrées,
    // elles reviennent à chaque relecture sous forme d'avertissements sur des
    // lignes que le coach n'a jamais voulues — et chaque version recopie la
    // précédente, donc elles s'accumulent.
    const messy: DoctrineDraft = {
      beliefs: [{ claim: "Real." }, { claim: "   ", rationale: "orphan" }],
      forbidden: [{ token: "" , instead: "x" }, { token: "keto" }],
      vocabulary: [{ term: "" }],
      arbitrations: [
        { situation: "s", coach_answer: "a" },
        // Une demi-arbitration est trompeuse, pas seulement pauvre.
        { situation: "half", coach_answer: "" },
      ],
      foods: { recommended: [{ term: "" }], discouraged: [{ term: "seed oil" }] },
      qa: [{ question: "q", answer: "" }],
      voice: { address: "tu" },
    };
    const clean = pruneDraft(messy);
    expect(clean.beliefs).toHaveLength(1);
    expect(clean.forbidden?.map((f) => f.token)).toEqual(["keto"]);
    expect(clean.vocabulary).toEqual([]);
    expect(clean.arbitrations).toHaveLength(1);
    expect(clean.foods?.recommended).toEqual([]);
    expect(clean.foods?.discouraged).toHaveLength(1);
    expect(clean.qa).toEqual([]);
    // La voix n'est pas une liste: elle traverse intacte.
    expect(clean.voice).toEqual({ address: "tu" });
  });

  it("le nettoyage ne touche JAMAIS à une portée", () => {
    const clean = pruneDraft(DRAFT);
    expect(entriesForScope(clean.beliefs, "fat_loss")).toHaveLength(1);
    expect(entriesForScope(clean.arbitrations, "fat_loss")).toHaveLength(1);
  });

  it("les formulations se coupent à la virgule ET au retour à la ligne", () => {
    // Imposer l'un des deux ferait perdre la moitié des formulations au premier
    // coach qui choisit l'autre — et une formulation perdue est un verrou qui
    // ne reconnaît plus la phrase.
    expect(splitForms("6 petits repas, six small meals")).toEqual([
      "6 petits repas",
      "six small meals",
    ]);
    expect(splitForms("a\nb\n\nc")).toEqual(["a", "b", "c"]);
    expect(splitForms("   ")).toEqual([]);
    expect(joinForms(["a", "b"])).toBe("a, b");
    expect(joinForms(undefined)).toBe("");
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
