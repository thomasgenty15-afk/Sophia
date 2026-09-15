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
  cancelSection,
  closeSection,
  cacheFootprint,
  type DoctrineDraft,
  draftToDoctrine,
  entriesForScope,
  GOAL_TOKENS,
  isDraftEmpty,
  joinForms,
  patchEntry,
  PREVIEW_VARIANTS,
  openSection,
  previewVariants,
  pruneDraft,
  removeEntry,
  scopeSentence,
  SECTION_CLOSED,
  splitForms,
  starterFootprint,
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
  foods: { discouraged: [] },
  qa: [{ question: "Coffee?", answer: "Black." }],
  voice: { address: "tu", length: "short" },
};

describe("l'aperçu par objectif", () => {
  it("montre une variante par objectif plus la default, la default en tête", () => {
    // DÉRIVÉ DU VOCABULAIRE, jamais codé en dur: un sixième objectif est apparu
    // pendant ce lot, et un « 6 » écrit ici aurait fait échouer un test qui a
    // pourtant raison sur le fond.
    expect(PREVIEW_VARIANTS).toHaveLength(GOAL_TOKENS.length + 1);
    expect(PREVIEW_VARIANTS[0]).toBeNull();
    expect(variantLabel(null)).toBe("No goal set yet");
    expect(variantLabel("fat_loss")).toBe("Fat loss");
  });

  it("ce que le coach lit est ce que l'élève reçoit — la portée mord", () => {
    const { doctrine } = draftToDoctrine(DRAFT, "Marlow", "en");
    const variants = previewVariants(doctrine);
    const byGoal = (g: string | null) => variants.find((v) => v.goal === g)!;

    expect(byGoal("fat_loss").compiled.text).toContain("Do not panic over a plateau.");
    expect(byGoal("fat_loss").compiled.text).toContain("Show me the waist.");
    expect(byGoal("maintenance").compiled.text).not.toContain("Do not panic");
    expect(byGoal("maintenance").compiled.text).not.toContain("Show me the waist.");
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
    // Tous les objectifs qu'aucune portée ne vise retombent sur la default.
    expect(dflt.sharesCacheWith.sort()).toEqual(
      GOAL_TOKENS.filter((g) => g !== "fat_loss").slice().sort(),
    );
    expect(variants.find((v) => v.goal === "fat_loss")!.sharesCacheWith).toEqual([]);
  });

  it("une doctrine sans portée: toutes les variantes, UN seul bloc", () => {
    const unscoped: DoctrineDraft = {
      ...DRAFT,
      beliefs: [{ claim: "Protein at every meal." }],
      arbitrations: [{ situation: "cracked", coach_answer: "One evening is data." }],
    };
    const { doctrine } = draftToDoctrine(unscoped, "Marlow", "en");
    expect(cacheFootprint(doctrine)).toEqual({ variants: GOAL_TOKENS.length + 1, entries: 1 });
    const texts = new Set(previewVariants(doctrine).map((v) => v.compiled.text));
    expect(texts.size).toBe(1);
  });

  it("signale la variante qui ne reçoit RIEN de la méthode", () => {
    const allTargeted: DoctrineDraft = {
      beliefs: [{ claim: "Only for cutting.", goal_scope: ["fat_loss"] }],
      forbidden: [],
      vocabulary: [],
      arbitrations: [],
      foods: { discouraged: [] },
      qa: [],
      voice: {},
    };
    const { doctrine } = draftToDoctrine(allTargeted, "Marlow", "en");
    const variants = previewVariants(doctrine);
    expect(variants.find((v) => v.goal === "maintenance")!.compiled.emptyForGoal).toBe(true);
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
    expect(entriesForScope(DRAFT.beliefs, "maintenance")).toEqual([]);
  });

  it("une portée vide ou absente est GLOBALE — les deux, pas seulement l'une", () => {
    const list = [{ claim: "a" }, { claim: "b", goal_scope: [] }, { claim: "c", goal_scope: ["maintenance"] }];
    expect(entriesForScope(list, null).map((e) => e.entry.claim)).toEqual(["a", "b"]);
    expect(entriesForScope(list, "maintenance").map((e) => e.entry.claim)).toEqual(["c"]);
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
    const added = addEntry(DRAFT.beliefs, { claim: "New.", goal_scope: ["maintenance"] });
    expect(added).toHaveLength(3);
    expect(entriesForScope(added, "maintenance")).toHaveLength(1);
    expect(DRAFT.beliefs).toHaveLength(2);

    const removed = removeEntry(added, 1);
    expect(removed.map((b) => b.claim)).toEqual(["Protein at every meal.", "New."]);
    // Et la position rendue par la vue suit le retrait, sans décalage.
    expect(entriesForScope(removed, "maintenance").map((e) => e.index)).toEqual([1]);
  });

  it("une entrée écrite dans une dynamique n'atteint QUE cette dynamique", () => {
    // Le bout en bout de l'écran: le coach ajoute une ligne pour la recomp,
    // et l'élève en perte de gras ne doit jamais la lire.
    const edited: DoctrineDraft = {
      ...DRAFT,
      beliefs: addEntry(DRAFT.beliefs, {
        claim: "Eat more on training days.",
        goal_scope: ["maintenance"],
      }),
    };
    const { doctrine } = draftToDoctrine(edited, "Marlow", "en");
    const variants = previewVariants(doctrine);
    const text = (g: string | null) => variants.find((v) => v.goal === g)!.compiled.text;
    expect(text("maintenance")).toContain("Eat more on training days.");
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
      foods: { discouraged: [{ term: "seed oil" }, { term: "  " }] },
      qa: [{ question: "q", answer: "" }],
      voice: { address: "tu" },
    };
    const clean = pruneDraft(messy);
    expect(clean.beliefs).toHaveLength(1);
    expect(clean.forbidden?.map((f) => f.token)).toEqual(["keto"]);
    expect(clean.vocabulary).toEqual([]);
    expect(clean.arbitrations).toHaveLength(1);
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

  it("« Cancel » REND ce qu'il y avait avant, il ne ferme pas en gardant les dégâts", () => {
    // C'est le seul geste de l'écran qui puisse détruire du travail. Un
    // « annuler » qui garde les modifications est un bouton qui ment sur son
    // nom, et le coach ne s'en aperçoit qu'après avoir enregistré.
    const before: DoctrineDraft = { beliefs: [{ claim: "Original." }] };
    const opened = openSection("global:beliefs", before);
    expect(opened.open).toBe("global:beliefs");

    // Le coach tape, puis se ravise.
    const mangled: DoctrineDraft = { beliefs: [{ claim: "Oops, wrong." }] };
    const out = cancelSection(opened, mangled);
    expect(out.draft).toEqual(before);
    expect(out.section).toEqual(SECTION_CLOSED);
  });

  it("« Done » ferme en GARDANT ce qui a été tapé", () => {
    expect(closeSection()).toEqual(SECTION_CLOSED);
  });

  it("ouvrir une AUTRE section ne défait pas la première", () => {
    // L'instantané suit la section ouverte, jamais l'écran entier: sinon
    // annuler la deuxième rendrait aussi l'état d'avant la première.
    const v1: DoctrineDraft = { beliefs: [{ claim: "v1" }] };
    expect(openSection("global:beliefs", v1).snapshot).toEqual(v1);
    // Le coach modifie, puis ouvre une autre section sans annuler: v2 est acquis.
    const v2: DoctrineDraft = { beliefs: [{ claim: "v2 — édité et gardé" }] };
    const second = openSection("global:vocabulary", v2);
    expect(second.open).toBe("global:vocabulary");
    // Annuler la SECONDE rend v2, pas v1.
    expect(cancelSection(second, { beliefs: [{ claim: "v3" }] }).draft).toEqual(v2);
  });

  it("annuler sans instantané ne remplace JAMAIS l'état réel par du vide", () => {
    const current: DoctrineDraft = { beliefs: [{ claim: "bien réel" }] };
    expect(cancelSection(SECTION_CLOSED, current).draft).toEqual(current);
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
    // La jointure est une PHRASE (`common.list_pair`), pas un `join(", ")`: le
    // dernier séparateur est un mot, et il change de langue en langue.
    expect(scopeSentence(["fat_loss", "maintenance"])).toBe("Fat loss and Maintenance");
    expect(scopeSentence(["fat_loss", "maintenance", "muscle_gain"]))
      .toBe("Fat loss, Maintenance and Muscle gain");
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

  it("le cliquet de provenance survit au déménagement de l'amorçage", () => {
    // L'amorçage est parti dans une modale; l'ÉDITEUR, lui, est resté dans la
    // page. Le cliquet vit dans `patchEntry`, que seul l'éditeur appelle — donc
    // rien n'aurait dû bouger. « Rien n'aurait dû bouger » est exactement ce
    // qu'on croit avant de casser une garde, d'où ce test plutôt qu'un coup
    // d'œil: une ligne que le coach a réécrite lui appartient et ne doit jamais
    // être recomptée comme la nôtre.
    const generated: DoctrineDraft = {
      beliefs: [{ claim: "Trois repas, et la cuisine ferme.", source: "starter" }],
      forbidden: [{ token: "cheat_meal", instead: "On continue.", source: "starter" }],
      arbitrations: [{ situation: "il a craqué", coach_answer: "Demain.", source: "starter" }],
    };
    expect(starterFootprint(generated).total).toBe(3);

    // Réécrire une PHRASE rend la ligne au coach.
    const rewritten = {
      ...generated,
      forbidden: patchEntry(generated.forbidden, 0, { instead: "Mes mots à moi." }),
    };
    expect(rewritten.forbidden[0].source).toBeNull();
    expect(starterFootprint(rewritten).total).toBe(2);

    // Changer une PORTÉE ne la rend pas: la phrase est toujours la nôtre, et un
    // cliquet qui se déclencherait ici mentirait dans l'autre sens.
    const scoped = {
      ...generated,
      beliefs: patchEntry(generated.beliefs, 0, { goal_scope: ["fat_loss"] }),
    };
    expect(scoped.beliefs[0].source).toBe("starter");
    expect(starterFootprint(scoped).total).toBe(3);
  });

  it("le sas ne s'ouvre que sur un brouillon VIDE", () => {
    // Proposé au-dessus d'une doctrine écrite, « on écrit ta méthode pour toi »
    // est faux, et le bouton invite à régénérer par-dessus le travail du coach.
    expect(isDraftEmpty(null)).toBe(true);
    expect(isDraftEmpty({})).toBe(true);
    expect(isDraftEmpty(DRAFT)).toBe(false);

    // UNE LIGNE OUVERTE ET JAMAIS REMPLIE NE COMPTE PAS: elle ne partirait pas
    // en base non plus (`pruneDraft`), donc la traiter comme du contenu
    // fermerait la porte d'entrée sur un brouillon qui ne contient rien.
    expect(isDraftEmpty({ beliefs: [{ claim: "  " }], qa: [{ question: "q", answer: "" }] }))
      .toBe(true);
    expect(isDraftEmpty({ beliefs: [{ claim: "Real." }] })).toBe(false);
    expect(isDraftEmpty({ foods: { discouraged: [{ term: "seed oil" }] } })).toBe(false);
  });

  it("une voix seule laisse le brouillon VIDE — elle ne prescrit rien", () => {
    // Même arbitrage que `compileDoctrineBlock.isEmpty`, et pour la même
    // raison: une voix dit COMMENT parler, jamais QUOI prescrire. Un coach qui
    // n'a qu'un `voice.language` (ce que le formulaire écrit tout seul) a
    // encore droit au sas.
    expect(isDraftEmpty({ voice: { language: "fr-FR", address: "tu" } })).toBe(true);
  });

  it("le vocabulaire d'objectifs du front EST celui du serveur", () => {
    // Cette liste est recopiée EXPRÈS, et c'est le seul endroit où c'est vrai:
    // elle n'est pas une seconde source de vérité, elle est le fil qui casse
    // quand la première change. Un jeton ajouté au vocabulaire sans être ajouté
    // au CHECK de la base donne un objectif que le front propose et que la base
    // refuse — ce test tombe avant l'élève.
    //
    // 2026-08-05: `muscle_gain`, sixième jeton. Il a fait exactement son
    // travail (migration 20260805120000).
    // 2026-08-18: SIX REDEVIENNENT TROIS. `recomposition`, `performance` et
    // `health` se replient sur `maintenance` — l'axe qui fait bifurquer une
    // semaine est la direction de la balance, et « ni l'un ni l'autre » était
    // découpé en quatre nuances aux consignes voisines. Migration
    // 20260818100000, qui réécrit AUSSI les lignes: une valeur retirée d'une
    // énumération sans que les lignes suivent laisse des orphelines.
    expect([...GOAL_TOKENS]).toEqual([
      "fat_loss",
      "maintenance",
      "muscle_gain",
    ]);
  });
});
