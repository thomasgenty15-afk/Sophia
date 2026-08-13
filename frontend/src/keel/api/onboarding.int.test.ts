import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  branchForMouths,
  birthDateAnswer,
  BUDGET_MAX,
  canGenerate,
  COOKING_SESSION_MINUTES,
  cookingTimeParts,
  emptyFunnelPerson,
  emptyFunnelState,
  type FunnelBranch,
  type FunnelPerson,
  FUNNEL_QUESTIONS,
  type FunnelState,
  funnelSteps,
  HOUSEHOLD_MAX_MOUTHS,
  missesForStep,
  nextIncomplete,
} from "./onboarding";
import { SETUP_MISS_KEYS } from "../copy/setupMisses";
import { en } from "../i18n/en";

/**
 * ── CE QUE CE FICHIER GARDE, ET POURQUOI CHAQUE BLOC EXISTE ────────────────
 *
 * 1. LE CONSOMMATEUR EST RÉSOLU SUR LE DISQUE. La règle mère du dépôt — on ne
 *    collecte que ce qu'un aval consomme — n'a jamais eu de gardien. Ici elle
 *    en a un: une question dont le lecteur a été supprimé ou renommé fait
 *    rougir la suite LE JOUR DE LA SUPPRESSION, pas six mois plus tard quand
 *    quelqu'un se demande à quoi sert ce champ.
 *
 * 2. LA TABLE DE VÉRITÉ DE `canGenerate`, MOTIFS NOMMÉS INCLUS. C'est la seule
 *    source qui active le bouton de fin: si elle se trompe, l'utilisateur voit
 *    un bouton actif qui rend une erreur, ou un bouton gris sans explication.
 *
 * 3. LE DÉFAUT D1, ET IL EST TESTÉ PAR SON MOTIF, PAS PAR `ok`. Voir le bloc
 *    « D1 » plus bas: un test qui n'assert que `ok: false` reste VERT quand on
 *    supprime la garde, parce qu'une date manquante est de toute façon
 *    refusée. La mutation qui le prouve est décrite dans ce fichier.
 */

const ROOT = resolve(__dirname, "../../../..");

// ───────────────────────────────────────────────────────────────────────────
// Décor
// ───────────────────────────────────────────────────────────────────────────

function adult(overrides: Partial<FunnelPerson> = {}): FunnelPerson {
  return {
    ...emptyFunnelPerson(),
    firstName: "Zoe",
    kind: "adult",
    birthDate: "1990-05-04",
    goal: "muscle_gain",
    allergiesReviewed: true,
    diet: "omnivore",
    heightCm: 171,
    weightKg: 64,
    gender: "female",
    ...overrides,
  };
}

function child(overrides: Partial<FunnelPerson> = {}): FunnelPerson {
  return {
    ...emptyFunnelPerson(),
    firstName: "Tom",
    kind: "child",
    birthDate: "2016-02-11",
    goal: null,
    allergiesReviewed: true,
    diet: "omnivore",
    // Un ENFANT, et ses mesures sont hors des bornes adultes: c'est
    // exactement ce que les bornes plus larges de la RPC de foyer existent
    // pour accepter.
    heightCm: 128,
    weightKg: 26,
    gender: "male",
    ...overrides,
  };
}

/** Un état COMPLET pour la branche demandée. Le point de départ de chaque cas. */
function complete(branch: FunnelBranch): FunnelState {
  const others = branch === "solo"
    ? []
    : branch === "pair"
      ? [adult({ firstName: "Alex", goal: "fat_loss" })]
      : [adult({ firstName: "Alex", goal: "fat_loss" }), child()];
  return {
    mouths: branch === "solo" ? 1 : branch === "pair" ? 2 : 3,
    self: {
      firstName: "Sam",
      kind: "adult",
      birthDate: "1988-09-12",
      goal: "health",
      allergiesReviewed: true,
      diet: "vegetarian",
      heightCm: 178,
      weightKg: 71,
      gender: "female",
    },
    others,
    plan: {
      eatingRhythm: ["breakfast", "lunch", "dinner"],
      cookDays: ["sun", "wed"],
      cookingTimeMin: 45,
      budgetAmount: 90,
    },
  };
}

/** Les motifs rendus, ou `[]` quand la composition est autorisée. */
function misses(state: FunnelState, branch: FunnelBranch): string[] {
  const verdict = canGenerate(state, branch);
  return verdict.ok ? [] : verdict.missing;
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Le catalogue et ses consommateurs
// ───────────────────────────────────────────────────────────────────────────

describe("le catalogue des questions", () => {
  it("déclare un consommateur non vide pour chaque question", () => {
    const orphans = FUNNEL_QUESTIONS.filter((q) => q.consumer.trim() === "");
    expect(orphans.map((q) => q.id)).toEqual([]);
  });

  /**
   * LE TEST QUI FAIT DE LA RÈGLE MÈRE UNE GARDE.
   *
   * Le format est `chemin/relatif.ts` ou `chemin/relatif.ts#symbole`. Le
   * symbole est cherché TEL QUEL dans le fichier: c'est volontairement grossier
   * — on veut attraper « ce lecteur n'existe plus », pas typer du Deno depuis
   * Vite. Les fonctions edge sont du Deno/JSR qu'un test Vite ne charge pas,
   * donc on LIT la source, exactement comme `planRefusals.int.test.ts`.
   */
  it("résout chaque consommateur sur le disque", () => {
    const broken: string[] = [];
    for (const question of FUNNEL_QUESTIONS) {
      const [rel, symbol] = question.consumer.split("#");
      const abs = resolve(ROOT, rel);
      if (!existsSync(abs)) {
        broken.push(`${question.id}: fichier absent — ${rel}`);
        continue;
      }
      if (symbol && !readFileSync(abs, "utf8").includes(symbol)) {
        broken.push(`${question.id}: « ${symbol} » introuvable dans ${rel}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("ne déclare aucun identifiant en double", () => {
    const ids = FUNNEL_QUESTIONS.map((q) => q.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  /** Une `better` sans branche, une `wrong` avec au moins une: le contrat de §3.1. */
  it("range les better hors de toute branche et les wrong dans au moins une", () => {
    for (const q of FUNNEL_QUESTIONS) {
      if (q.weight === "better") {
        expect([q.id, q.branches.length, q.step]).toEqual([q.id, 0, null]);
      } else {
        expect([q.id, q.branches.length > 0, q.step !== null]).toEqual([q.id, true, true]);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Les étapes
// ───────────────────────────────────────────────────────────────────────────

describe("funnelSteps", () => {
  it("ne rend JAMAIS une question better, sur aucune branche", () => {
    for (const branch of ["solo", "pair", "family"] as const) {
      const rendered = funnelSteps(branch).flatMap((s) => s.questions);
      expect(rendered.filter((q) => q.weight === "better")).toEqual([]);
    }
  });

  it("rend les trois étapes dans l'ordre, sur les trois branches", () => {
    for (const branch of ["solo", "pair", "family"] as const) {
      expect(funnelSteps(branch).map((s) => s.id)).toEqual([
        "situate",
        "people",
        "plan",
      ]);
    }
  });

  /**
   * L'ÉTAPE 2b N'EXISTE PAS EN SOLO — et c'est le branchement du §3.3. Le solo
   * ne crée pas de foyer, donc aucune question `each_member` n'a de sens: il
   * n'y a pas d'autre bouche à décrire.
   */
  it("n'a aucune question par-bouche en solo, et en a en couple et en famille", () => {
    const perMember = (branch: FunnelBranch) =>
      funnelSteps(branch)
        .flatMap((s) => s.questions)
        .filter((q) => q.scope === "each_member")
        .map((q) => q.id);
    expect(perMember("solo")).toEqual([]);
    expect(perMember("pair")).toEqual([
      "member_first_name",
      "member_birth_date",
      "member_height_cm",
      "member_weight_kg",
      "member_gender",
      "member_goal",
      "member_allergies",
    ]);
    expect(perMember("family")).toEqual(perMember("pair"));
  });

  /**
   * LE PRÉNOM DU MAÎTRE N'EST PAS DEMANDÉ EN SOLO, ET C'EST DÉLIBÉRÉ.
   * `generate-meal-v1` ne nomme le mangeur nulle part (vérifié le 2026-08-12):
   * le demander serait collecter une donnée que rien ne consomme.
   */
  it("ne demande le prénom du maître que lorsqu'il y a un foyer", () => {
    const asksName = (branch: FunnelBranch) =>
      funnelSteps(branch).flatMap((s) => s.questions).some((q) => q.id === "own_first_name");
    expect(asksName("solo")).toBe(false);
    expect(asksName("pair")).toBe(true);
    expect(asksName("family")).toBe(true);
  });
});

describe("branchForMouths", () => {
  it("projette le nombre de bouches sur les trois cibles du produit", () => {
    expect(branchForMouths(null)).toBe(null);
    expect(branchForMouths(0)).toBe(null);
    expect(branchForMouths(1)).toBe("solo");
    expect(branchForMouths(2)).toBe("pair");
    expect(branchForMouths(3)).toBe("family");
    expect(branchForMouths(8)).toBe("family");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. La table de vérité de canGenerate
// ───────────────────────────────────────────────────────────────────────────

describe("canGenerate — l'état complet", () => {
  it("autorise la composition sur les trois branches", () => {
    expect(misses(complete("solo"), "solo")).toEqual([]);
    expect(misses(complete("pair"), "pair")).toEqual([]);
    expect(misses(complete("family"), "family")).toEqual([]);
  });

  it("refuse un état vierge en nommant tout ce qui manque", () => {
    expect(misses(emptyFunnelState(), "solo").sort()).toEqual(
      [
        "household_size",
        "own_birth_date",
        "own_goal",
        "own_diet",
        "own_allergies",
        "own_height_cm",
        "own_weight_kg",
        "own_gender",
        "eating_rhythm",
        "cook_days",
        "cooking_time_min",
        "budget_amount",
      ].sort(),
    );
  });
});

describe("canGenerate — étape par étape", () => {
  const cases: Array<[string, FunnelBranch, (s: FunnelState) => FunnelState, string]> = [
    ["l'étape 1 sans réponse", "solo", (s) => ({ ...s, mouths: null }), "household_size"],
    [
      "mon prénom vide, en foyer",
      "pair",
      (s) => ({ ...s, self: { ...s.self, firstName: "  " } }),
      "own_first_name",
    ],
    [
      "ma taille absente",
      "solo",
      (s) => ({ ...s, self: { ...s.self, heightCm: null } }),
      "own_height_cm",
    ],
    [
      "ma taille hors des bornes de la base",
      "solo",
      (s) => ({ ...s, self: { ...s.self, heightCm: 12 } }),
      "own_height_cm",
    ],
    [
      "mon poids absent",
      "solo",
      (s) => ({ ...s, self: { ...s.self, weightKg: null } }),
      "own_weight_kg",
    ],
    [
      "mon poids hors des bornes de la série de mesures",
      "solo",
      (s) => ({ ...s, self: { ...s.self, weightKg: 3 } }),
      "own_weight_kg",
    ],
    [
      "le corps d'une bouche incomplet — la taille manque",
      "pair",
      (s) => ({ ...s, others: [adult({ heightCm: null })] }),
      "member_height_cm",
    ],
    [
      "le corps d'une bouche incomplet — le poids manque",
      "pair",
      (s) => ({ ...s, others: [adult({ weightKg: null })] }),
      "member_weight_kg",
    ],
    [
      "le corps d'une bouche incomplet — le sexe manque",
      "pair",
      (s) => ({ ...s, others: [adult({ gender: null })] }),
      "member_gender",
    ],
    [
      "mon sexe absent",
      "solo",
      (s) => ({ ...s, self: { ...s.self, gender: null } }),
      "own_gender",
    ],
    [
      "mon objectif absent",
      "solo",
      (s) => ({ ...s, self: { ...s.self, goal: null } }),
      "own_goal",
    ],
    [
      "un objectif hors des six jetons",
      "solo",
      (s) => ({ ...s, self: { ...s.self, goal: "bulking" as never } }),
      "own_goal",
    ],
    [
      "mes allergies jamais demandées",
      "solo",
      (s) => ({ ...s, self: { ...s.self, allergiesReviewed: false } }),
      "own_allergies",
    ],
    [
      "un prénom de bouche vide",
      "pair",
      (s) => ({ ...s, others: [adult({ firstName: "" })] }),
      "member_first_name",
    ],
    [
      "les allergies d'une bouche jamais demandées",
      "pair",
      (s) => ({ ...s, others: [adult({ allergiesReviewed: false })] }),
      "member_allergies",
    ],
    [
      "l'objectif d'un adulte absent",
      "pair",
      (s) => ({ ...s, others: [adult({ goal: null })] }),
      "member_goal",
    ],
    [
      "la date d'un enfant absente",
      "family",
      (s) => ({ ...s, others: [adult(), child({ birthDate: null })] }),
      "member_birth_date",
    ],
    ["aucune bouche saisie en couple", "pair", (s) => ({ ...s, others: [] }), "missing_mouths"],
    [
      "une seule bouche saisie en famille",
      "family",
      (s) => ({ ...s, others: [adult()] }),
      "missing_mouths",
    ],
    [
      "le rythme jamais déclaré",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, eatingRhythm: [] } }),
      "eating_rhythm",
    ],
    [
      "aucun jour de cuisine",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, cookDays: [] } }),
      "cook_days",
    ],
    [
      "un temps de cuisine absent",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, cookingTimeMin: null } }),
      "cooking_time_min",
    ],
    [
      "un temps de cuisine nul",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, cookingTimeMin: 0 } }),
      "cooking_time_min",
    ],
    [
      "aucun budget",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, budgetAmount: null } }),
      "budget_amount",
    ],
    // ⚠️ LES DEUX FORMES QUI RESSEMBLENT À UNE RÉPONSE. `Number("")` vaut 0 et
    // EST fini: une garde `!== null` les laisserait partir au modèle comme des
    // consignes — « budget: 0 », puis un plan au homard pour un zéro de trop.
    [
      "un budget à zéro",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, budgetAmount: 0 } }),
      "budget_amount",
    ],
    [
      "un budget au-delà du plafond de saisie",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, budgetAmount: BUDGET_MAX + 1 } }),
      "budget_amount",
    ],
  ];

  for (const [label, branch, mutate, motif] of cases) {
    it(`refuse ${label} en nommant ${motif}`, () => {
      expect(misses(mutate(complete(branch)), branch)).toContain(motif);
    });
  }

  /**
   * LE PLAFOND EST EN BASE (`keel_household_max_mouths()` rend 8) et il compte
   * TOUTES les bouches, la mienne comprise. Sept autres passent, huit non.
   */
  it("refuse au-delà du plafond de bouches de la base, moi compris", () => {
    const seven = Array.from({ length: HOUSEHOLD_MAX_MOUTHS - 1 }, (_, i) =>
      adult({ firstName: `A${i}` }));
    const state = { ...complete("family"), others: seven, mouths: 8 };
    expect(misses(state, "family")).toEqual([]);
    expect(misses({ ...state, others: [...seven, adult({ firstName: "H" })] }, "family"))
      .toContain("too_many_mouths");
  });

  /**
   * UN ENFANT N'A JAMAIS D'OBJECTIF, et l'absence n'est donc pas un manque.
   * La ceinture d'âge est structurelle (`goalApplies`, `weekPlanAgeGate`), pas
   * un réglage: réclamer une direction pour un mineur serait la demander pour
   * quelque chose que le moteur refuse par construction d'appliquer.
   */
  it("ne réclame aucun objectif pour un enfant", () => {
    const state = { ...complete("family"), others: [adult(), child({ goal: null })] };
    expect(misses(state, "family")).toEqual([]);
  });

  /**
   * LE SOLO NE PORTE AUCUN MOTIF DE BOUCHE. Il ne crée pas de foyer, donc une
   * bouche restée dans l'état (l'utilisateur a répondu « 3+ », saisi une
   * personne, puis est revenu à « 1 ») ne doit rien bloquer.
   */
  it("ignore les bouches saisies quand la branche est redevenue solo", () => {
    const state = { ...complete("solo"), others: [adult({ firstName: "" })] };
    expect(misses(state, "solo")).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. D1 — l'objectif silencieusement ignoré
// ───────────────────────────────────────────────────────────────────────────

describe("D1 — un adulte porteur d'objectif sans date de naissance", () => {
  /**
   * ── LA MUTATION QUI PROUVE CETTE GARDE ────────────────────────────────────
   *
   * Dans `personMisses` (`onboarding.ts`), remplacer
   *
   *     missing.push(carriesGoal ? "adult_without_birth_date" : birthDateId);
   * par
   *     missing.push(birthDateId);
   *
   * — c'est-à-dire DÉSARMER D1 en gardant le refus générique. Vérifié le
   * 2026-08-12: avec cette mutation, ce test-ci ÉCHOUE (motif attendu absent) et
   * les autres restent verts. Un test qui n'aurait asserté que `ok: false`
   * serait resté VERT, puisque la date manque de toute façon: c'est exactement
   * le piège du « test paramétré par sa propre constante », et c'est pour ça
   * que l'assertion porte sur le MOTIF.
   */
  it("rend le motif NOMMÉ, pas le motif générique de date", () => {
    const state = {
      ...complete("pair"),
      others: [adult({ birthDate: null, goal: "fat_loss" })],
    };
    const found = misses(state, "pair");
    expect(found).toContain("adult_without_birth_date");
    expect(found).not.toContain("member_birth_date");
  });

  /**
   * LA GARDE A UN CAS QUI PASSE, et c'est la moitié qui manque toujours: une
   * garde cassée bloque tout et ressemble à une garde qui marche.
   */
  it("laisse passer le même adulte dès que sa date est là", () => {
    const state = {
      ...complete("pair"),
      others: [adult({ birthDate: "1991-03-03", goal: "fat_loss" })],
    };
    expect(misses(state, "pair")).toEqual([]);
  });

  /**
   * ET IL FAUT LES DEUX MOTIFS. Un adulte SANS objectif et sans date manque
   * bien d'une date, mais son objectif n'est ignoré par personne: le confondre
   * avec D1 dirait à l'écran de parler d'une direction qui n'existe pas.
   */
  it("garde le motif générique pour un adulte sans objectif ni date", () => {
    const state = {
      ...complete("pair"),
      others: [adult({ birthDate: null, goal: null })],
    };
    const found = misses(state, "pair");
    expect(found).toContain("member_birth_date");
    expect(found).toContain("member_goal");
    expect(found).not.toContain("adult_without_birth_date");
  });

  /** Le maître est une bouche comme les autres, et D1 s'applique à lui aussi. */
  it("s'applique au maître, par la même fonction", () => {
    const state = {
      ...complete("family"),
      self: { ...complete("family").self, birthDate: null },
    };
    const found = misses(state, "family");
    expect(found).toContain("adult_without_birth_date");
    expect(found).not.toContain("own_birth_date");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. La reprise
// ───────────────────────────────────────────────────────────────────────────

describe("nextIncomplete", () => {
  it("rend null quand tout est répondu", () => {
    expect(nextIncomplete(complete("family"), "family")).toBe(null);
  });

  it("renvoie à l'étape 1 tant que le nombre de bouches manque", () => {
    const state = { ...complete("solo"), mouths: null };
    expect(nextIncomplete(state, "solo")?.id).toBe("situate");
  });

  it("renvoie aux gens quand une bouche est incomplète, MÊME si l'étape 3 l'est aussi", () => {
    const state: FunnelState = {
      ...complete("pair"),
      others: [adult({ firstName: "" })],
      plan: { ...complete("pair").plan, cookDays: [] },
    };
    // La PREMIÈRE étape incomplète, pas la dernière: on ne fait pas remonter
    // quelqu'un d'une étape après lui avoir fait remplir la suivante.
    expect(nextIncomplete(state, "pair")?.id).toBe("people");
  });

  it("renvoie à l'étape 3 quand seules les contraintes pratiques manquent", () => {
    const state: FunnelState = {
      ...complete("family"),
      plan: { eatingRhythm: [], cookDays: [], cookingTimeMin: null, budgetAmount: null },
    };
    expect(nextIncomplete(state, "family")?.id).toBe("plan");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5bis. Une étape ne se laisse pas quitter incomplète
// ───────────────────────────────────────────────────────────────────────────

/**
 * ── LE DÉFAUT QUE CE BLOC TIENT FERMÉ ──────────────────────────────────────
 * Mesuré au navigateur le 2026-08-13, compte neuf, branche « à deux »: on
 * remplissait l'étape 2, son bouton principal enregistrait ET avançait, et
 * l'étape 3 refusait ensuite de composer avec « ajoute les autres personnes qui
 * mangent ici » — dont le seul champ était resté à l'étape 2. Le parcours
 * nominal se terminait sur un bouton gris.
 *
 * Ce que la fonction garantit: chaque motif est imputé à l'étape qui porte son
 * champ, et une étape connaît les siens.
 */
describe("missesForStep", () => {
  it("impute les bouches manquantes à l'étape qui porte le formulaire d'ajout", () => {
    const state: FunnelState = { ...complete("pair"), others: [] };
    expect(missesForStep(state, "pair", "people")).toContain("missing_mouths");
    // ET NULLE PART AILLEURS: un motif rendu par l'étape 3 y serait affiché
    // sans le champ qui y répond — c'est le défaut lui-même.
    expect(missesForStep(state, "pair", "plan")).toEqual([]);
    expect(missesForStep(state, "pair", "situate")).toEqual([]);
  });

  it("ne retient personne sur une étape dont toutes les questions sont répondues", () => {
    const state: FunnelState = {
      ...complete("family"),
      plan: { eatingRhythm: [], cookDays: [], cookingTimeMin: null, budgetAmount: null },
    };
    expect(missesForStep(state, "family", "people")).toEqual([]);
    expect(missesForStep(state, "family", "plan").length).toBeGreaterThan(0);
  });

  /**
   * LA SOMME DES ÉTAPES EST LE VERDICT ENTIER — donc aucun motif ne peut se
   * perdre en route. Sans cette épreuve, `stepOfMiss` pourrait ranger un motif
   * dans une étape qui n'est pas rendue par cette branche: le bouton de fin
   * resterait gris et AUCUN écran ne dirait pourquoi.
   */
  it("répartit TOUS les motifs sur des étapes que la branche rend vraiment", () => {
    const branches: FunnelBranch[] = ["solo", "pair", "family"];
    for (const branch of branches) {
      const state = emptyFunnelState();
      const rendered = funnelSteps(branch).map((s) => s.id);
      const spread = rendered.flatMap((id) => missesForStep(state, branch, id));
      expect(spread.sort()).toEqual(misses(state, branch).sort());
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. La date de naissance, lue par LA garde du produit
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// 6bis. Chaque motif a une phrase, et chaque phrase existe
// ───────────────────────────────────────────────────────────────────────────

describe("les mots de ce qui manque", () => {
  /**
   * LE TEST DE DÉRIVE, dans les DEUX sens. Un motif sans phrase afficherait un
   * slug à quelqu'un qui vient de créer son compte; une phrase pour un motif
   * qui n'existe plus est du texte écrit, relu, et inatteignable.
   */
  it("nomme une clé qui existe pour chaque motif que canGenerate peut rendre", () => {
    const motifs = new Set<string>([
      "adult_without_birth_date",
      "missing_mouths",
      "too_many_mouths",
      ...FUNNEL_QUESTIONS.map((q) => q.id),
    ]);
    const broken: string[] = [];
    for (const motif of motifs) {
      const key = SETUP_MISS_KEYS[motif as keyof typeof SETUP_MISS_KEYS];
      if (!key) broken.push(`${motif}: aucune clé`);
      else if (!(key in en)) broken.push(`${motif}: clé absente du seed — ${key}`);
    }
    expect(broken).toEqual([]);
  });

  it("n'invente aucun motif que le module ne produit pas", () => {
    const known = new Set<string>([
      "adult_without_birth_date",
      "missing_mouths",
      "too_many_mouths",
      ...FUNNEL_QUESTIONS.map((q) => q.id),
    ]);
    expect(Object.keys(SETUP_MISS_KEYS).filter((k) => !known.has(k))).toEqual([]);
  });
});

describe("la durée d'une session de cuisine", () => {
  /**
   * LE PLAFOND EST CELUI DU MOTEUR, et il rogne en silence:
   * `readCookingCapacity` fait `Math.min(240, …)`. Proposer un choix au-delà
   * afficherait un chiffre et en composerait un autre — le genre d'écart que
   * personne ne remarque parce que les deux nombres ne sont jamais côte à côte.
   */
  it("ne propose aucune durée que le moteur rognerait", () => {
    expect(COOKING_SESSION_MINUTES.filter((m) => m > 240)).toEqual([]);
    expect(COOKING_SESSION_MINUTES.filter((m) => m <= 0)).toEqual([]);
  });

  it("propose des durées croissantes et sans doublon", () => {
    const sorted = [...COOKING_SESSION_MINUTES].sort((a, b) => a - b);
    expect([...COOKING_SESSION_MINUTES]).toEqual(sorted);
    expect(COOKING_SESSION_MINUTES.length).toBe(new Set(COOKING_SESSION_MINUTES).size);
  });

  it("dit les minutes en minutes et les heures en heures", () => {
    expect(cookingTimeParts(30)).toEqual({ unit: "minutes", value: "30" });
    expect(cookingTimeParts(45)).toEqual({ unit: "minutes", value: "45" });
    expect(cookingTimeParts(60)).toEqual({ unit: "hours", value: "1" });
    expect(cookingTimeParts(120)).toEqual({ unit: "hours", value: "2" });
    expect(cookingTimeParts(180)).toEqual({ unit: "hours", value: "3" });
  });

  /** La demi-heure se DIT, elle ne se calcule pas: « 1½ », jamais « 1.5 ». */
  it("dit la demi-heure comme un humain la lit", () => {
    expect(cookingTimeParts(90)).toEqual({ unit: "hours", value: "1½" });
    expect(cookingTimeParts(150)).toEqual({ unit: "hours", value: "2½" });
  });

  /**
   * UNE VALEUR HORS LISTE GARDE SES MINUTES. La carte de `/app/plan` conserve
   * son champ libre: « 37 » existe en base, et l'écran doit pouvoir le dire
   * plutôt que faire semblant que la réponse est vide.
   */
  it("rend telle quelle une durée qui n'est dans aucun choix", () => {
    expect(cookingTimeParts(37)).toEqual({ unit: "minutes", value: "37" });
    expect(cookingTimeParts(200)).toEqual({ unit: "minutes", value: "200" });
  });

  /** Le mot n'est PAS ici: il vit dans le catalogue de langue. */
  it("ne rend aucun mot — seulement un nombre et une unité", () => {
    for (const minutes of COOKING_SESSION_MINUTES) {
      expect(cookingTimeParts(minutes).value).toMatch(/^[0-9]+½?$/);
    }
  });
});

describe("birthDateAnswer", () => {
  const TODAY = "2026-08-12";

  it("accepte un adulte et un MINEUR — savoir qu'un enfant est à table est le point", () => {
    expect(birthDateAnswer("1990-01-01", TODAY)?.verdict.status).toBe("adult");
    expect(birthDateAnswer("2016-01-01", TODAY)?.verdict.status).toBe("minor");
  });

  it("refuse le vide, l'illisible, le futur et l'aberrant", () => {
    expect(birthDateAnswer("", TODAY)).toBe(null);
    expect(birthDateAnswer("   ", TODAY)).toBe(null);
    expect(birthDateAnswer("pas une date", TODAY)).toBe(null);
    expect(birthDateAnswer("2030-01-01", TODAY)).toBe(null);
    expect(birthDateAnswer("1820-01-01", TODAY)).toBe(null);
  });
});
