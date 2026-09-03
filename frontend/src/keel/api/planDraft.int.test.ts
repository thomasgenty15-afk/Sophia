/**
 * LE BROUILLON — CE QU'IL LIT, ET CE QU'IL REFUSE DE DÉCIDER.
 *
 * ── LES PAYLOADS VIENNENT DU SERVEUR, PAS D'UNE IDÉE DE RÉPONSE ───────────
 * Les enveloppes ci-dessous sont recopiées de `generate-meal-v1/index.ts:1971`
 * (la branche `isDraft`) et des runs réels du 2026-08-13 consignés dans
 * `scratchpad/RAPPORT-LOT-C-BACKEND-20260813.md` §3 — y compris les phrases de
 * `rationale` telles qu'elles sont sorties. Une fixture inventée n'aurait pas
 * montré que `rationale` est un OBJET `{ lines, refusal }` et pas un tableau,
 * qui est précisément ce sur quoi un lecteur naïf se casse.
 *
 * ── CE QUE CES TESTS NE TESTENT PAS, ET C'EST VOULU ───────────────────────
 * Aucune garde de note n'est éprouvée ici: elle vit côté serveur
 * (`plan_draft_note_test.ts`, 33 cas, EN et FR). La tester une seconde fois
 * ici, c'est l'écrire une seconde fois.
 */

import { describe, expect, it } from "vitest";

import {
  canRemix,
  DRAFT_MAX_TURNS,
  DRAFT_NOTE_MAX_CHARS,
  draftTurnsLeft,
  hasNote,
  noteLength,
  noteOverflows,
  readDraftEnvelope,
  readDraftPlan,
} from "./planDraft";

/**
 * L'ENVELOPPE D'UN APERÇU RÉEL — run ② du 2026-08-13, persona `qa0805.a11b.s1`,
 * fenêtre de deux jours, note « Je veux des pizzas tous les midis. »
 */
const REAL_DRAFT = {
  ok: true,
  draft: true,
  meal: null,
  window: { starts_on: "2026-08-13", duration_days: 2 },
  // ⛔ `shifted` EST UN MOTIF, PAS UN BOOLÉEN — corrigé le 2026-08-23.
  // Cette fixture écrivait `true`, une charge que le serveur n'a jamais
  // produite: il recopie `WindowShiftReason | null`, c'est-à-dire
  // `"shopping_cutoff"` ou `null` (`_shared/keel/plan_hours.ts`). Le lecteur
  // comparait donc une chaîne à `true` — toujours faux sur 10 plans réels sur
  // 10 — et ce test restait vert parce qu'il inventait son entrée.
  suggested_window: { starts_on: "2026-08-14", shifted: "shopping_cutoff" },
  rationale: {
    lines: [
      "This plan covers 2 days, starting today.",
      "You cook on Sunday and Wednesday, and that is what was kept.",
      "The shopping budget is 90.",
    ],
    refusal: null,
  },
  request_report: { lines: [], refusal: null },
  dishes: [
    {
      title: "Tuna and pepper pizza with sharp cucumber",
      slot: "lunch",
      day: "fri",
      method: "Roll, top, bake.",
      why: "Keeps the protein up on a day you asked for pizza.",
      ingredients: [{ term: "tuna", quantity: "120 g", in_pantry: false }],
    },
  ],
  preparations: [
    {
      id: "prep_dough",
      title: "Pizza dough",
      servings_made: 4,
      method: "Knead and rest.",
      active_minutes: 15,
      total_minutes: 90,
      cook_on: "sun",
      ingredients: [{ term: "flour", quantity: "500 g", in_pantry: true }],
    },
  ],
  cooking_sessions: [
    {
      day: "sun",
      preparation_ids: ["prep_dough"],
      run_through: "Start the dough, then rest it while you shop.",
      total_minutes: 25,
    },
  ],
  fixed_intakes: [],
  day_properties: [],
};

describe("le plafond de tours", () => {
  /**
   * LE CHIFFRE EST DIT AVANT D'ÊTRE HEURTÉ. Ce test épingle la SÉQUENCE, pas
   * une borne: c'est elle que l'écran affiche, et un plafond qu'on découvre en
   * le heurtant se lit comme une panne.
   */
  it("descend de trois à zéro, un tour à la fois", () => {
    expect(draftTurnsLeft(0)).toBe(3);
    expect(draftTurnsLeft(1)).toBe(2);
    expect(draftTurnsLeft(2)).toBe(1);
    expect(draftTurnsLeft(3)).toBe(0);
  });

  /**
   * ⚠️ CE TEST NE SE PARAMÈTRE PAS PAR SA PROPRE CONSTANTE. Écrire
   * `expect(draftTurnsLeft(0)).toBe(DRAFT_MAX_TURNS)` resterait vert si
   * quelqu'un passait le plafond à 12 — le test suivrait la constante au lieu
   * de la garder. Le chiffre est donc écrit en dur au-dessus, et ce cas-ci
   * vérifie seulement que la constante publiée dit la même chose.
   */
  it("publie le plafond que l'écran affiche", () => {
    expect(DRAFT_MAX_TURNS).toBe(3);
  });

  it("ne descend jamais sous zéro, même si l'appelant a mal compté", () => {
    expect(draftTurnsLeft(9)).toBe(0);
    expect(canRemix(9)).toBe(false);
  });

  /**
   * UN COMPTE ILLISIBLE REND LE PLAFOND PLEIN, ET C'EST LA DIRECTION SÛRE:
   * l'erreur coûte un tour de plus, jamais un geste refusé à quelqu'un qui n'a
   * encore rien composé.
   */
  it("rend le plafond plein sur un compte illisible", () => {
    expect(draftTurnsLeft(Number.NaN)).toBe(3);
    expect(draftTurnsLeft(-4)).toBe(3);
    expect(canRemix(0)).toBe(true);
  });
});

describe("le compteur de signes", () => {
  it("compte ce qui est écrit, et dit le plafond du serveur", () => {
    expect(DRAFT_NOTE_MAX_CHARS).toBe(280);
    expect(noteLength("Trop de poisson.")).toBe(16);
    expect(noteOverflows("a".repeat(280))).toBe(false);
    expect(noteOverflows("a".repeat(281))).toBe(true);
  });

  /**
   * ⚠️ LE CAS QUI PROUVE QUE CE N'EST PAS UNE GARDE. Le serveur mesure APRÈS
   * repli des blancs; ce compteur mesure le brut. Une phrase de 281 signes
   * dont deux sont des espaces doublés est donc REFUSÉE par ce compteur et
   * ACCEPTÉE par le serveur. C'est exactement pourquoi l'écran ne doit pas
   * bloquer dessus — il prévient, le serveur tranche.
   */
  it("diverge du serveur sur les blancs, et c'est pour ça qu'il n'empêche rien", () => {
    const doubled = `${"a".repeat(279)}  `;
    expect(noteLength(doubled)).toBe(281);
    expect(noteOverflows(doubled)).toBe(true);
    // Replié comme le serveur le fait, le même texte tient dans le plafond.
    expect(doubled.replace(/\s+/g, " ").length).toBeLessThanOrEqual(280);
  });

  /**
   * « AUCUN CHAMP » ET « UNE PHRASE ILLISIBLE » NE SONT PAS LA MÊME CHOSE.
   * La première ne doit rien refuser; la seconde doit partir au serveur pour
   * qu'il rende `note_unusable`. Confondre les deux ferait disparaître un
   * refus nommé au profit d'un silence.
   */
  it("distingue le champ vide de la phrase illisible", () => {
    expect(hasNote("")).toBe(false);
    expect(hasNote("   ")).toBe(false);
    expect(hasNote("...")).toBe(true);
    expect(hasNote("Trop de poisson.")).toBe(true);
  });
});

describe("l'enveloppe", () => {
  it("lit les phrases du serveur telles qu'il les rend", () => {
    const env = readDraftEnvelope(REAL_DRAFT);
    expect(env.draft).toBe(true);
    expect(env.rationale).toEqual([
      "This plan covers 2 days, starting today.",
      "You cook on Sunday and Wednesday, and that is what was kept.",
      "The shopping budget is 90.",
    ]);
    expect(env.rationaleRefusal).toBeNull();
    expect(env.suggestedStartsOn).toBe("2026-08-14");
    expect(env.suggestedShifted).toBe(true);
  });

  /**
   * ⛔ LE CAS QUI REFUSE, à côté de celui qui passe.
   *
   * Une garde n'est armée que si on a vu les deux côtés. Ici le côté « pas de
   * décalage » est celui que le serveur envoie le plus souvent (avant 18 h,
   * `plan_hours.ts :: SHOPPING_CUTOFF_HOUR`), et c'est celui qu'un lecteur trop
   * permissif — `shifted != null`, ou une simple coercition — rendrait `true`.
   */
  it("`shifted: null` ne décale rien, et une valeur vide non plus", () => {
    for (const shifted of [null, "", "   ", undefined]) {
      const env = readDraftEnvelope({
        ...REAL_DRAFT,
        suggested_window: { starts_on: "2026-08-14", shifted },
      });
      expect(env.suggestedShifted).toBe(false);
      // La date proposée survit au non-décalage: les deux champs sont
      // indépendants, et l'écran a besoin des deux.
      expect(env.suggestedStartsOn).toBe("2026-08-14");
    }
  });

  /**
   * ⚠️ LE BOOLÉEN D'HIER NE DOIT PAS « MARCHER » PAR ACCIDENT. Si un jour une
   * charge portait de nouveau `shifted: true`, ce serait un serveur qui a
   * changé de contrat sans le dire — et le lecteur doit le rendre visible en
   * refusant, pas le rattraper en silence.
   */
  it("un `shifted: true` (l'ancienne fixture) n'est PAS un motif", () => {
    const env = readDraftEnvelope({
      ...REAL_DRAFT,
      suggested_window: { starts_on: "2026-08-14", shifted: true },
    });
    expect(env.suggestedShifted).toBe(false);
  });

  /**
   * `rationale` EST UN OBJET, PAS UN TABLEAU. Un lecteur qui ferait
   * `payload.rationale.map(...)` casserait à l'ouverture de la pop-up, et
   * aucun test de type ne l'aurait vu — la réponse d'une fonction edge arrive
   * en `unknown`.
   */
  it("ne prend pas le bloc pour la liste", () => {
    expect(readDraftEnvelope({ rationale: ["une phrase"] }).rationale).toEqual([]);
  });

  /**
   * UN BLOC VIDE ET UN BLOC REFUSÉ SE RESSEMBLENT À L'ÉCRAN ET N'APPELLENT PAS
   * LA MÊME ACTION: `guilt_tripping` est un bug de nos propres gabarits et doit
   * réveiller quelqu'un, `nothing_to_explain` est le produit qui fonctionne.
   */
  it("garde le motif quand il n'y a pas de phrases", () => {
    const env = readDraftEnvelope({
      rationale: { lines: [], refusal: "guilt_tripping" },
      request_report: { lines: [], refusal: "restriction_floor" },
    });
    expect(env.rationale).toEqual([]);
    expect(env.rationaleRefusal).toBe("guilt_tripping");
    expect(env.requestReportRefusal).toBe("restriction_floor");
  });

  /** Une puce vide est une phrase que personne n'a écrite. */
  it("jette les lignes vides plutôt que d'afficher des puces vides", () => {
    const env = readDraftEnvelope({
      rationale: { lines: ["Vrai.", "   ", ""], refusal: null },
    });
    expect(env.rationale).toEqual(["Vrai."]);
  });

  /**
   * 🔴 LE CHAMP QUE LE SERVEUR NE REND PAS ENCORE. `dropped_clauses` est
   * ABSENT de la réponse réelle ci-dessus — vérifié: `generate-meal-v1`
   * journalise `dropped` et ne le rend pas. L'absence se lit « rien n'est
   * tombé », qui est la direction sûre: on ne montre pas un avertissement à
   * quelqu'un dont la phrase est passée entière.
   */
  it("lit zéro clause tombée quand le serveur n'en dit rien", () => {
    expect(readDraftEnvelope(REAL_DRAFT).droppedClauses).toBe(0);
    expect("dropped_clauses" in REAL_DRAFT).toBe(false);
  });

  /** Le lecteur est prêt pour le jour où le serveur rendra le COMPTE. */
  it("lit le compte quand il arrive, et jamais les motifs", () => {
    const env = readDraftEnvelope({ ...REAL_DRAFT, dropped_clauses: 1 });
    expect(env.droppedClauses).toBe(1);
    // Le TYPE est un nombre: aucun motif ne peut transiter par ce champ, donc
    // aucun écran ne peut dire « sous plancher » à qui que ce soit.
    expect(typeof env.droppedClauses).toBe("number");
  });

  it("ne casse pas sur une réponse vide", () => {
    const env = readDraftEnvelope({});
    expect(env.draft).toBe(false);
    expect(env.rationale).toEqual([]);
    expect(env.suggestedStartsOn).toBeNull();
    expect(env.droppedClauses).toBe(0);
  });

  /**
   * `draft` EST LU, JAMAIS SUPPOSÉ. On a demandé un aperçu, mais c'est la
   * réponse qui dit ce qui s'est passé — et si elle dit `false`, un plan a été
   * écrit, ce que l'écran doit pouvoir ne pas traiter comme un brouillon.
   */
  it("ne suppose pas que la demande a été honorée", () => {
    expect(readDraftEnvelope({ ok: true }).draft).toBe(false);
  });
});

describe("le plan du brouillon", () => {
  it("monte le même plan qu'un plan écrit", () => {
    const plan = readDraftPlan(REAL_DRAFT);
    expect(plan.startsOn).toBe("2026-08-13");
    expect(plan.durationDays).toBe(2);
    expect(plan.dishes).toHaveLength(1);
    expect(plan.dishes[0].title).toBe("Tuna and pepper pizza with sharp cucumber");
    expect(plan.preparations).toHaveLength(1);
    expect(plan.preparations[0].total_minutes).toBe(90);
    expect(plan.cookingSessions).toHaveLength(1);
    expect(plan.cookingSessions[0].run_through).toContain("dough");
  });

  /**
   * ⚠️ `uses` EST DONNÉ, PAS SUPPOSÉ. Le plat réel ci-dessus n'en porte pas —
   * le champ est arrivé après des compositions déjà en base. Un `as
   * GeneratedDish[]` compilerait et jurerait qu'il existe; `dish.uses.map(...)`
   * casserait à l'ouverture, sans qu'aucun test de type ne l'ait vu.
   */
  it("donne les champs manquants au lieu de les supposer", () => {
    expect(readDraftPlan(REAL_DRAFT).dishes[0].uses).toEqual([]);
  });

  /**
   * ⚠️ AUCUN IDENTIFIANT FABRIQUÉ. Le serveur rend `meal: null` sur un aperçu
   * exprès: « un id inventé serait la première chose qu'un lecteur prendrait
   * pour une ligne réelle ». Un `mealId` non nul ici enverrait l'écran valider,
   * cocher ou remplacer une ligne qui n'existe pas.
   */
  it("n'a pas d'identifiant, et n'en fabrique aucun", () => {
    expect(readDraftPlan(REAL_DRAFT).mealId).toBeNull();
    expect(readDraftPlan({ ...REAL_DRAFT, meal: { id: "abc" } }).mealId).toBeNull();
  });

  /** Un aperçu n'est jamais validé: il n'existe pas encore. */
  it("n'est jamais validé", () => {
    expect(readDraftPlan(REAL_DRAFT).validatedAt).toBeNull();
  });

  it("ne casse pas sur une réponse vide", () => {
    const plan = readDraftPlan({});
    expect(plan.dishes).toEqual([]);
    expect(plan.preparations).toEqual([]);
    expect(plan.durationDays).toBe(7);
  });
});
