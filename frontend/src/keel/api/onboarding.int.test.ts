import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  branchForMouths,
  declaredHouseholdSize,
  funnelMouths,
  birthDateAnswer,
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
  peopleStepBlockers,
  nameAlreadyEating,
  nextIncomplete,
  normalizedMouthName,
  mouthsStillNeeded,
  maximumOthers,
} from "./onboarding";
// ⛔ `BUDGET_MAX` VIT DANS `planBudget`, ET IL N'A JAMAIS ÉTÉ EXPORTÉ PAR
// `onboarding` — l'import était faux depuis toujours, et personne ne le
// voyait parce que le typage des TESTS n'était lancé par aucune porte:
// `tsc -b --force` compile l'APPLICATION, pas `tsconfig.test.json`.
import { BUDGET_MAX } from "./planBudget";
import { SETUP_MISS_KEYS } from "../copy/setupMisses";
import { en } from "../i18n/en";
// ── LES TROIS MODULES DU MOTEUR QUE CE FICHIER LIT POUR DE VRAI ───────────
// Pas de copie de constante, pas de nombre recopié: ce sont les MÊMES objets
// que `generate-meal-v1` et `generate-household-meal-v1` indexent. Une table
// recopiée ici resterait verte le jour où le moteur change la sienne — et
// c'est exactement le genre de divergence que ce fichier existe pour attraper
// (cf. le lien `energy_target.ts` ↔ `weekInFood.ts`, écrit contre ça).
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  ACTIVITY_FACTOR,
  ACTIVITY_FACTORS,
  estimatedMaintenanceKcal,
} from "../../../../supabase/functions/_shared/keel/meal_envelope.ts";
import { maintenanceRange } from "../../../../supabase/functions/_shared/keel/energy_target.ts";

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
      // ⛔ ON PART DU CONSTRUCTEUR, PAS D'UN LITTÉRAL, ET C'EST LA LEÇON DU
      // 2026-09-03. Cette fixture énumérait ses champs à la main: le jour où
      // `FunnelPerson` en a gagné six requis (`dayActivity`, `sportFrequency`,
      // `appetite`…), elle a cessé de compiler — et
      // personne ne l'a vu, parce qu'aucune porte ne typait les tests.
      // `emptyFunnelPerson()` est la SEULE définition de « une personne
      // complète mais vide »; partir d'elle fait que le prochain champ requis
      // arrive ici sans rien casser, avec sa valeur neutre.
      //
      // ⚠️ LES SURCHARGES QUI SUIVENT RESTENT EXPLICITES, chacune avec son
      // motif: ce décor n'est pas « une personne quelconque », c'est une
      // personne dont chaque valeur a été choisie pour ce que le test prouve.
      ...emptyFunnelPerson(),
      firstName: "Sam",
      kind: "adult",
      birthDate: "1988-09-12",
      // ⚠️ `health` JUSQU'AU 2026-08-18, et la fixture le disait encore après
      // le repli des six objectifs vers trois. `canGenerate` valide l'objectif
      // contre `MEMBER_GOALS`: la fixture réclamait donc `own_goal` sur un état
      // qu'elle déclare COMPLET, et dix cas en dépendaient. C'est la cicatrice
      // que ce fichier nomme vingt lignes plus bas — « une fixture qui parle une
      // forme que la base ne porte pas ». `maintenance` est le repli de la
      // migration elle-même.
      goal: "maintenance",
      allergiesReviewed: true,
      diet: "vegetarian",
      heightCm: 178,
      weightKg: 71,
      gender: "female",
      // ⚠️ `null` DANS UN ÉTAT DÉCLARÉ COMPLET, ET C'EST L'ASSERTION LA PLUS
      // IMPORTANTE DE CE DÉCOR. Le cran d'activité est `wrong` au catalogue —
      // donc POSÉ dans l'entonnoir — et il ne REFUSE rien: `canGenerate` doit
      // rendre `ok` sur cet état-ci. Mettre un cran ici masquerait exactement
      // la régression qu'on veut voir, celle où quelqu'un « répare » le trou en
      // ajoutant le motif à `canGenerateMisses` et rend l'activité obligatoire
      // — ce que `tokens.ts` refuse (« personne n'est obligé de répondre »).
      activityLevel: null,
    },
    others,
    plan: {
      // LA FORME DE PRODUCTION, TAILLE COMPRISE (2026-08-14). Une fixture qui
      // parle une forme que la base ne porte pas est une fixture qui valide le
      // repli en croyant tester le cas nominal — cicatrice mesurée de ce dépôt.
      eatingRhythm: [
        { slot: "breakfast", size: "small" },
        { slot: "lunch", size: null },
        { slot: "dinner", size: "large" },
      ],
      cookDays: ["sun", "wed"],
      cookingTimeMin: 45,
      budgetAmount: 90,
      // ⟳ P2 (2026-09-03) — UN ÉTAT DÉCLARÉ COMPLET LES PORTE, puisqu'elles
      // sont `wrong` au catalogue: sans elles, `canGenerate` refuserait ce
      // décor et les dizaines de cas qui s'appuient dessus mesureraient le
      // refus au lieu du cas nominal.
      cookingStyle: "balanced",
      groceryRuns: 2,
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
        // ── ⛔ `table` A DISPARU LE 2026-08-19 ───────────────────────────
        // Elle ne portait plus que le régime et les moments, et les deux sont
        // dans la FICHE de chaque bouche (étape `people`) — le régime en tête
        // parce qu'il exclut, les moments juste au-dessus de « ce qu'elle mange
        // déjà » parce qu'ils le dimensionnent. Ses deux cartes de MOYENS
        // (équipement, déjeuner au boulot) ont rejoint `request`, avec les
        // jours de cuisine, le temps et le budget.
        "request",
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
      // Ajouté par le lot L0 (2026-08-18). Il est `wrong`, donc RENDU par
      // `funnelSteps` — et il ne bloque pourtant aucune composition: les deux
      // sens de `weight` divergent ici, exprès. Voir la note de
      // `canGenerateMisses`.
      "member_activity_level",
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

  it("autorise le solo sans aucune préférence alimentaire", () => {
    const base = complete("solo");
    const withoutPreferences: FunnelState = {
      ...base,
      self: {
        ...base.self,
        allergiesReviewed: false,
        diet: null,
      },
      plan: { ...base.plan, eatingRhythm: [] },
    };
    expect(canGenerate(withoutPreferences, "solo")).toEqual({ ok: true });
  });

  it("refuse un état vierge en nommant tout ce qui manque", () => {
    expect(misses(emptyFunnelState(), "solo").sort()).toEqual(
      [
        "household_size",
        "own_birth_date",
        "own_goal",
        // ⛔ `own_diet`, `own_allergies` ET `eating_rhythm` NE SONT PLUS LÀ.
        // Décision humaine du 2026-08-19, demandée trois fois: le seul refus
        // porte sur l'identité, le corps et la direction d'une personne.
        //
        // ⚠️ CE QUE ÇA COÛTE, ÉCRIT ICI POUR QUE PERSONNE NE LE REDÉCOUVRE
        // COMME UN BUG: un foyer peut composer son premier plan sans qu'on ait
        // jamais su si quelqu'un est allergique. L'accusé `allergy_check` vit
        // toujours, la question reste en tête de la fiche — elle n'est plus une
        // porte.
        "own_height_cm",
        "own_weight_kg",
        "own_gender",
        // ⛔ `cook_days` N'EST PLUS UNE PORTE — le champ « les jours où tu
        // cuisines » a été retiré des deux écrans le 2026-09-01. Le laisser
        // ici retiendrait l'entonnoir sur une réponse que plus aucun écran ne
        // permet de donner.
        // ⟳ P2 (2026-09-03) — `cooking_time_min` N'EST PLUS UNE PORTE, et
        // deux questions la remplacent. « Combien de temps dure une session
        // de cuisine » est une question d'ingénieur: personne ne sait y
        // répondre avant d'avoir vu le plan. La clé reste lue (cinq
        // lecteurs) et se DÉRIVE du style; ce qui part, c'est l'exigence.
        "cooking_style",
        "grocery_runs",
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
      "un prénom de bouche vide",
      "pair",
      (s) => ({ ...s, others: [adult({ firstName: "" })] }),
      "member_first_name",
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
    // ⟳ P2 (2026-09-03) — LES DEUX CAS DU TEMPS DE CUISINE SE SONT RETOURNÉS,
    // ils n'ont pas été supprimés. Ce qui retient l'étape n'est plus un nombre
    // de minutes; ce sont les deux réponses qui le dérivent, et il en faut
    // DEUX — un style sans cadence de courses ne dit pas combien de fois on
    // cuisine, une cadence sans style ne dit pas combien de temps.
    [
      "un style de cuisine absent",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, cookingStyle: null } }),
      "cooking_style",
    ],
    [
      "un nombre de courses absent",
      "solo",
      (s) => ({ ...s, plan: { ...s.plan, groceryRuns: null } }),
      "grocery_runs",
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

  it("⛔ NE RENVOIE PLUS NULLE PART sur les seuls moments de la maison", () => {
    // ⚠️ `people`, PAS `table`, DEPUIS LE 2026-08-19. La question vit dans la
    // fiche du titulaire, dont la réponse écrit AUSSI celle de la maison —
    // c'est lui la première bouche. Renvoyer à une étape supprimée aurait
    // bloqué l'entonnoir sans rien pour lever le refus.
    // ⛔ LES MOMENTS NE RETIENNENT PLUS (2026-08-19). Rien coché veut dire
    // « aux moments de la maison », qui est une réponse par défaut sûre — et
    // retenir quelqu'un dessus faisait un mur sur une question qui a un repli.
    const state: FunnelState = {
      ...complete("family"),
      plan: { ...complete("family").plan, eatingRhythm: [] },
    };
    expect(nextIncomplete(state, "family")).toBeNull();
  });

  it("renvoie à la DEMANDE quand seules les entrées de plan manquent", () => {
    // ⚠️ LE RYTHME RESTE RENSEIGNÉ ICI, ET C'EST TOUT L'OBJET DU TEST. Avant la
    // coupure du 2026-08-13, les quatre questions vivaient sur la même étape,
    // donc ce cas et le précédent étaient indiscernables — et une régression
    // qui renverrait à la table pour un budget manquant serait passée.
    const state: FunnelState = {
      ...complete("family"),
      plan: {
        ...complete("family").plan,
        cookDays: [],
        cookingTimeMin: null,
        budgetAmount: null,
      },
    };
    expect(nextIncomplete(state, "family")?.id).toBe("request");
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
    expect(missesForStep(state, "pair", "request")).toEqual([]);
    expect(missesForStep(state, "pair", "situate")).toEqual([]);
  });

  it("ne retient personne sur une étape dont toutes les questions sont répondues", () => {
    const state: FunnelState = {
      ...complete("family"),
      // ⟳ P2 — `null` = pas encore répondu, et c'est bien ce que ce décor
      // décrit: un plan dont AUCUNE question n'a de réponse.
      plan: {
        eatingRhythm: [],
        cookDays: [],
        cookingTimeMin: null,
        cookingStyle: null,
        groceryRuns: null,
        budgetAmount: null,
      },
    };
    // ⛔ ET ELLE NE RETIENT PLUS SUR LES MOMENTS NON PLUS (2026-08-19): ce
    // `plan` les laisse vides, et c'est une réponse — « aux moments de la
    // maison ». Ce que le test garde reste qu'aucun motif ne se perd: la somme
    // des étapes est le verdict entier.
    expect(missesForStep(state, "family", "people")).toEqual([]);
    expect(missesForStep(state, "family", "request").length).toBeGreaterThan(0);
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

// ───────────────────────────────────────────────────────────────────────────
// 5ter. Deux bouches ne portent pas le même prénom
// ───────────────────────────────────────────────────────────────────────────

/**
 * ── LE DÉFAUT MESURÉ SUR UN COMPTE RÉEL, LE 2026-08-13 ────────────────────
 * La même personne saisie TROIS FOIS — deux à une seconde d'intervalle, sans
 * corps ni allergie. Le plan aurait composé pour cinq bouches là où trois
 * mangent, et l'écran n'offrait aucun moyen d'en retirer une.
 *
 * Le prénom est le bon critère parce que c'est ce que le PLAN affiche: il nomme
 * la part (« Christèle: 140 g »), et deux lignes identiques rendent le plan
 * illisible pour la seule personne qui doit le lire à table.
 */
describe("nameAlreadyEating", () => {
  const table = [{ firstName: "Chirstèle" }, { firstName: "Tom" }];

  it("attrape le doublon exact", () => {
    expect(nameAlreadyEating("Chirstèle", table)).toBe(true);
  });

  it("attrape la casse et les espaces de bord", () => {
    expect(nameAlreadyEating("  chirstÈle ", table)).toBe(true);
    expect(nameAlreadyEating("TOM", table)).toBe(true);
  });

  /**
   * LE CAS RÉEL, ET LE PLUS COURANT. Une saisie au clavier d'un téléphone n'est
   * pas une clé primaire: « Chirstele » et « Chirstèle » sont deux orthographes
   * de la même personne, et c'est précisément comme ça qu'un doublon se crée.
   */
  it("attrape l'accent manquant", () => {
    expect(nameAlreadyEating("Chirstele", table)).toBe(true);
    expect(normalizedMouthName("Chirstèle")).toBe(normalizedMouthName("chirstele"));
  });

  it("laisse passer un prénom vraiment différent", () => {
    expect(nameAlreadyEating("Camille", table)).toBe(false);
    // ⚠️ ET IL DOIT EN LAISSER PASSER. Une garde qui refuse tout ressemble à
    // une garde qui marche: sans cette ligne, `nameAlreadyEating` rendant
    // toujours `true` passerait les quatre tests du dessus.
    expect(nameAlreadyEating("Christelle", table)).toBe(false);
  });

  it("ne refuse pas un prénom vide — ce n'est pas sa question", () => {
    // Le vide a son propre motif (`member_first_name`), et l'émettre ici
    // afficherait « X mange déjà ici » avec un trou à la place du prénom.
    expect(nameAlreadyEating("", table)).toBe(false);
    expect(nameAlreadyEating("   ", table)).toBe(false);
  });

  it("ne trouve rien dans une maison vide", () => {
    expect(nameAlreadyEating("Chirstèle", [])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// COMBIEN IL EN MANQUE — la moitié du refus qui manquait
//
// Mesuré sur un compte neuf le 2026-08-14: « Trois ou plus » à l'étape 1, une
// personne inscrite, et l'écran répond « Ajoute les autres personnes qui
// mangent ici ». Il en a ajouté une. Le refus est JUSTE — la branche en attend
// deux — mais il ne dit ni combien il en manque, ni d'où vient le nombre.
// ─────────────────────────────────────────────────────────────────────────

describe("mouthsStillNeeded", () => {
  it("dit le nombre, et il vient de la réponse de l'étape 1", () => {
    expect(mouthsStillNeeded("family", 0)).toBe(2);
    expect(mouthsStillNeeded("family", 1)).toBe(1);
    expect(mouthsStillNeeded("pair", 0)).toBe(1);
  });

  it("ne descend jamais sous zéro — un foyer plus grand que prévu est valide", () => {
    // « family » attend 2 et n'exige pas 3: le nombre de l'étape 1 est une
    // INTENTION donnée avant de savoir. Un compte négatif ferait dire
    // « il manque -1 personne » à quelqu'un qui en a inscrit quatre.
    expect(mouthsStillNeeded("family", 4)).toBe(0);
    expect(mouthsStillNeeded("pair", 3)).toBe(0);
    expect(mouthsStillNeeded("solo", 0)).toBe(0);
  });
});

describe("maximumOthers — le plafond propre à chaque parcours", () => {
  it("interdit l'ajout en solo et borne le couple à une autre personne", () => {
    expect(maximumOthers("solo")).toBe(0);
    expect(maximumOthers("pair")).toBe(1);
    expect(maximumOthers("family")).toBe(HOUSEHOLD_MAX_MOUTHS - 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// L'ACTIVITÉ COLLECTÉE — LA JOINTURE ENTRE CE QU'ON DEMANDE ET CE QUI CALCULE
//
// ── CE QUE CE BLOC GARDE, ET QUE PERSONNE D'AUTRE NE GARDE ─────────────────
// `meal_envelope_test.ts` et `energy_target_test.ts` prouvent déjà, côté
// MOTEUR, que chaque cran rend un facteur et une fourchette, et que `null` rend
// le comportement d'avant. Ils ne peuvent rien dire de l'ÉCRITURE: ils ne
// connaissent ni le catalogue de l'entonnoir, ni la liste de tuiles.
//
// Or c'est précisément là qu'était le défaut du matin du 2026-08-18: colonnes
// posées, CHECK posé, facteurs posés, tests moteur VERTS — et pas une seule
// occurrence de `activity_level` dans `frontend/src`. Un lecteur sans écrivain
// rend `null` à tout le monde, et `null` est le comportement d'avant: rien
// n'était rouge. Ce bloc-ci est la seule chose qui rougirait.
//
// ⚠️ ET IL Y A DEUX VOCABULAIRES DANS LE DÉPÔT. `_shared/keel/activity_floor.ts`
// porte `sedentary` / `lightly_active` / `active` / `very_active`; `tokens.ts`
// porte `sedentary` / `on_feet` / `trains_some` / `trains_hard`, et c'est LUI
// qui a la contrainte CHECK des deux colonnes avec lui (`20260818100000`).
// Collecter l'autre remplirait la base de valeurs qu'elle refuse — ou, le jour
// où la contrainte bougerait, ferait rendre `undefined` à `ACTIVITY_FACTORS`
// sur trois valeurs sur quatre, en silence. Le test le plus bas est celui qui
// attrape ça.
// ───────────────────────────────────────────────────────────────────────────

describe("le niveau d'activité, de la question au calcul", () => {
  it("pose chaque cran et lit le facteur que le moteur applique", () => {
    // La table entière, écrite en clair: un facteur changé sans intention fait
    // rougir la ligne exacte, pas une inégalité vague.
    expect(ACTIVITY_LEVELS.map((l) => ACTIVITY_FACTORS[l])).toEqual([
      1.45, 1.65, 1.80, 2.00,
    ]);
    // ── LA MESURE QUI JUSTIFIE LE `wrong` DU CATALOGUE ────────────────────
    // 1,45 → 2,00, soit 38 % d'enveloppe entre les deux extrêmes. C'est ce que
    // le produit servait à tort à tout le monde, et c'est le nombre écrit dans
    // le commentaire de `own_activity_level`: les deux ne peuvent plus diverger
    // sans que ceci rougisse.
    const spread = ACTIVITY_FACTORS.trains_hard / ACTIVITY_FACTORS.sedentary - 1;
    expect(Math.round(spread * 100)).toBe(38);
  });

  it("pose chaque cran et lit la fourchette que le moteur sert", () => {
    // 70 kg, le même corps que les tests moteur, pour que les nombres se
    // comparent d'un fichier à l'autre sans arithmétique de tête.
    const range = (activityLevel: ActivityLevel | null) =>
      maintenanceRange({ weightKg: 70, weightWeekStart: null, activityLevel }).range;
    expect(range("sedentary")).toEqual({ low: 1800, high: 2050 });
    expect(range("on_feet")).toEqual({ low: 1950, high: 2150 });
    expect(range("trains_some")).toEqual({ low: 2100, high: 2300 });
    expect(range("trains_hard")).toEqual({ low: 2250, high: 2500 });
  });

  /**
   * ⚠️ L'INVARIANT DE NON-RÉGRESSION DE TOUTE LA BASE EXISTANTE.
   *
   * Aucune ligne d'avant le 2026-08-18 ne porte de cran, et personne n'est
   * obligé d'en cocher un: `null` est le cas MAJORITAIRE, pas un cas limite. Ce
   * test dit qu'il rend le comportement d'avant au caractère près — facteur
   * 1,5, fourchette 28-33 kcal/kg. S'il rougit, le lot a déplacé l'assiette de
   * gens qui n'ont rien demandé.
   */
  it("sans réponse, rend EXACTEMENT le comportement d'avant le lot", () => {
    expect(ACTIVITY_FACTOR).toBe(1.5);
    // Le facteur de l'hypothèse n'est AUCUN des quatre crans: si l'un d'eux
    // valait 1,5, « ne pas répondre » deviendrait indiscernable d'une réponse,
    // et le jour où on voudrait mesurer combien de gens ont répondu, la donnée
    // ne le dirait plus.
    expect(Object.values(ACTIVITY_FACTORS)).not.toContain(ACTIVITY_FACTOR);

    const body = {
      weightKg: 70,
      heightCm: 175,
      ageBand: "30_44" as const,
      gender: "male" as const,
    };
    const bmr = 10 * 70 + 6.25 * 175 - 5 * 37 + 5;
    expect(
      estimatedMaintenanceKcal({
        ...body,
        activityLevel: null,
        // ⛔ AUCUN AXE RÉPONDU: le lot du 2026-08-20 ne doit RIEN déplacer
        // pour qui n'a rien dit. C'est la moitié de ce test qui compte —
        // « sans réponse, EXACTEMENT le comportement d'avant le lot » vaut
        // désormais pour deux lots empilés, pas un.
        activityAxes: { day: null, sport: null, asked: false },
        // ⑤ — aucun appétit déclaré: ×1,00, un neutre VRAI. « Sans réponse,
        // EXACTEMENT le comportement d'avant le lot » vaut désormais pour
        // trois lots empilés.
        appetite: null,
      }),
    ).toBe(
      Math.round(bmr * 1.5),
    );

    // 28-33 kcal/kg, arrondi aux 50 — les deux constantes que `weekInFood.ts`
    // sert au coach depuis toujours, et que ce lot ne touche pas.
    expect(
      maintenanceRange({ weightKg: 70, weightWeekStart: null, activityLevel: null })
        .range,
    ).toEqual({ low: 1950, high: 2300 });
  });

  it("collecte le vocabulaire de tokens.ts, et pas l'autre", () => {
    // ⛔ SI CE TEST ROUGIT, NE CORRIGE PAS LA LISTE — vérifie d'abord LAQUELLE
    // des deux la base accepte. La contrainte CHECK est l'arbitre, et elle est
    // dans `20260818100000_three_directions_and_a_collected_activity.sql`.
    expect([...ACTIVITY_LEVELS]).toEqual([
      "sedentary",
      "on_feet",
      "trains_some",
      "trains_hard",
    ]);
    // La liste que l'écran rend EST la liste que le moteur indexe: aucun cran
    // collectable ne peut sortir `undefined` d'`ACTIVITY_FACTORS`.
    for (const level of ACTIVITY_LEVELS) {
      expect(typeof ACTIVITY_FACTORS[level]).toBe("number");
    }
    // Et il n'y a PAS de cinquième jeton. Un « je ne sais pas » collectable
    // ferait de l'ignorance une réponse qui pèse dans un calcul d'énergie —
    // c'est le paragraphe que `tokens.ts` a écrit contre lui-même.
    expect(ACTIVITY_LEVELS.length).toBe(4);
  });

  it("déclare les deux questions dans l'entonnoir, sur les bonnes branches", () => {
    const q = (id: string) => FUNNEL_QUESTIONS.find((x) => x.id === id)!;
    expect([q("own_activity_level").weight, q("own_activity_level").step]).toEqual([
      "wrong",
      // ⚠️ MÊME ÉTAPE QUE TAILLE/POIDS/SEXE, et ce n'est pas de la mise en
      // page: ce sont les autres entrées de LA MÊME ÉQUATION. Une question
      // rangée ailleurs se lirait comme une préférence.
      "people",
    ]);
    expect([...q("own_activity_level").branches]).toEqual(["solo", "pair", "family"]);
    expect([...q("member_activity_level").branches]).toEqual(["pair", "family"]);
    expect(q("member_activity_level").scope).toBe("each_member");
  });

  it("ne REFUSE aucune composition, sur aucune branche", () => {
    // ⚠️ CE TEST EST LA MOITIÉ QUI SE FAIT « RÉPARER » PAR ERREUR. La règle du
    // catalogue dit `wrong` ⇒ dans l'entonnoir; elle ne dit PAS `wrong` ⇒
    // bloquant, et l'activité est le seul endroit où les deux divergent. Sans
    // ce test, quelqu'un ajoute le motif à `canGenerateMisses` en croyant
    // fermer un trou, et rend obligatoire une question dont `tokens.ts` écrit
    // que « personne n'est obligé de répondre » — donc force un devinement
    // dans un calcul d'énergie.
    for (const branch of ["solo", "pair", "family"] as const) {
      expect(misses(complete(branch), branch)).toEqual([]);
    }
    // Et sur un état VIERGE, il n'apparaît pas non plus parmi les motifs: rien
    // n'est coché, et ce n'est reproché à personne.
    const empty = misses(emptyFunnelState(), "solo");
    expect(empty).not.toContain("own_activity_level");
    expect(empty).not.toContain("member_activity_level");
  });
});

// ---------------------------------------------------------------------------
// CE QUI RETIENT L'ÉTAPE 2, ET **CHEZ QUI**
//
// Demandé le 2026-08-19: « le seul truc qui bloque continuer c'est nom, date de
// naissance, taille, poids, objectif d'une personne — et ça doit signaler
// précisément chez qui manque quoi ».
// ---------------------------------------------------------------------------

describe("peopleStepBlockers", () => {
  it("un état complet ne retient personne", () => {
    // ⚠️ LE CAS QUI PASSE. Sans lui, une fonction qui retiendrait TOUJOURS
    // laisserait tous les autres cas verts.
    expect(peopleStepBlockers(complete("family"), "family")).toEqual([]);
  });

  it("⛔ les allergies, le régime et les moments ne retiennent PLUS", () => {
    // Les trois motifs que l'écran affichait, et que l'utilisateur a demandé
    // trois fois de retirer. La contrepartie est écrite dans `personMisses`.
    const state: FunnelState = {
      ...complete("family"),
      self: { ...complete("family").self, allergiesReviewed: false, diet: null },
      plan: { ...complete("family").plan, eatingRhythm: [] },
    };
    expect(peopleStepBlockers(state, "family")).toEqual([]);
  });

  it("nomme le TITULAIRE par `null`, pas par son prénom", () => {
    // L'écran rend « Toi ». Lire son propre prénom dans une liste de reproches
    // se lit comme si l'écran parlait de quelqu'un d'autre.
    const base = complete("family");
    const state: FunnelState = {
      ...base,
      self: { ...base.self, heightCm: null },
    };
    expect(peopleStepBlockers(state, "family")).toEqual([
      { who: null, missing: ["own_height_cm"] },
    ]);
  });

  it("⛔ nomme la BOUCHE, et ne mélange pas deux personnes", () => {
    // C'est tout l'objet du lot: avec quatre personnes à table, une liste plate
    // envoyait relire quatre cartes.
    const base = complete("family");
    const [first, ...rest] = base.others;
    const state: FunnelState = {
      ...base,
      others: [{ ...first, firstName: "Christèle", weightKg: null }, ...rest],
    };
    expect(peopleStepBlockers(state, "family")).toEqual([
      { who: "Christèle", missing: ["member_weight_kg"] },
    ]);
  });

  it("le motif NOMMÉ gagne: une direction sans date le dit", () => {
    // Même règle que `personMisses`: `adult_without_birth_date` explique
    // POURQUOI la date manque, là où `member_birth_date` ne fait que constater.
    const base = complete("family");
    const [first, ...rest] = base.others;
    const state: FunnelState = {
      ...base,
      others: [
        { ...first, firstName: "Christèle", kind: "adult", goal: "fat_loss", birthDate: null },
        ...rest,
      ],
    };
    expect(peopleStepBlockers(state, "family")[0].missing)
      .toContain("adult_without_birth_date");
  });
});

// ===========================================================================
// LA BRANCHE EST UN FAIT DÉCLARÉ, PLUS UNE DÉDUCTION
//
// ── LE DÉFAUT QU'ELLE FERME (2026-09-01) ─────────────────────────────────
// La branche se lisait `Math.max(2, household.members.length)`: un foyer en
// base répondait « au moins deux », et le solo se reconnaissait à son ABSENCE
// de foyer. Conséquence, signalée à l'écran: un solo n'avait pas de ligne
// membre, donc la fiche de préférences lui CACHAIT deux sections — ses dégoûts
// et ses moments, tous deux clés sur `member_id`. Le produit n'était pas le
// même selon le chemin d'entrée.
//
// Le solo a maintenant un foyer d'UNE bouche. La déduction ne peut donc plus
// séparer « je suis seul » de « j'ai commencé un foyer et je n'ai encore saisi
// personne »: le nombre se déclare.
// ===========================================================================

describe("declaredHouseholdSize", () => {
  it("lit le nombre déclaré", () => {
    expect(declaredHouseholdSize({ household_size: 1 })).toBe(1);
    expect(declaredHouseholdSize({ household_size: 4 })).toBe(4);
  });

  it("⛔ RIEN DE DÉCLARÉ REND `null` — c'est le repli qui décide, pas ce lecteur", () => {
    // ⚠️ TOUTE LA BASE D'AVANT CE LOT EST DANS CE CAS. Rendre `1` ici ferait
    // basculer en solo chaque famille dont les bouches ne sont pas encore
    // saisies — au moment précis où elle en a le plus besoin.
    expect(declaredHouseholdSize(null)).toBe(null);
    expect(declaredHouseholdSize(undefined)).toBe(null);
    expect(declaredHouseholdSize({})).toBe(null);
    expect(declaredHouseholdSize({ eating_rhythm: [] })).toBe(null);
  });

  it("⛔ CE QUI N'EST PAS UN ENTIER UTILISABLE RETOMBE SUR LE REPLI", () => {
    // Un `Number("2")` complaisant ferait entrer dans la branche d'un vrai
    // compte une valeur écrite à la main par une session de debug.
    for (const bad of ["2", 0, -1, 1.5, true, null, {}, []]) {
      expect(
        declaredHouseholdSize({ household_size: bad }),
        `household_size: ${JSON.stringify(bad)}`,
      ).toBe(null);
    }
  });

  it("le nombre déclaré traverse `branchForMouths` sans se faire relire", () => {
    // Les deux fonctions se touchent: ce que l'une rend, l'autre classe. Un
    // `1` déclaré doit sortir « solo », et c'est le seul chemin qui le permet
    // maintenant qu'un solo a un foyer.
    expect(branchForMouths(declaredHouseholdSize({ household_size: 1 }))).toBe("solo");
    expect(branchForMouths(declaredHouseholdSize({ household_size: 2 }))).toBe("pair");
    expect(branchForMouths(declaredHouseholdSize({ household_size: 5 }))).toBe("family");
  });
});

describe("funnelMouths — la branche, et sa compatibilité", () => {
  const base = {
    hasHousehold: true,
    isOwner: true,
    memberCount: 1,
    declared: null as number | null,
    hasGoalRow: true,
  };

  it("① rien de commencé ⇒ `null`, et l'étape 1 pose la question", () => {
    expect(funnelMouths({ ...base, hasHousehold: false, hasGoalRow: false }))
      .toBe(null);
  });

  it("② un solo D'AVANT LE LOT garde sa branche", () => {
    // Pas de foyer, une ligne d'objectif: toute la population qui a répondu
    // « juste moi » avant le 2026-09-01. Elle n'a pas de ligne membre.
    expect(funnelMouths({ ...base, hasHousehold: false, memberCount: 0 })).toBe(1);
  });

  it("③ LE CAS DU LOT — un foyer d'UNE bouche, déclaré à 1, reste SOLO", () => {
    // ⛔ C'est la seule chose que l'ancienne règle ne savait pas dire. Sans
    // elle, un solo à qui on donne une ligne membre bascule en « couple ».
    expect(funnelMouths({ ...base, memberCount: 1, declared: 1 })).toBe(1);
    expect(branchForMouths(funnelMouths({ ...base, memberCount: 1, declared: 1 })))
      .toBe("solo");
  });

  it("⛔ ④ LE REPLI — un foyer SANS nombre déclaré vaut « au moins deux »", () => {
    // ⚠️ CE CAS EST LA COMPATIBILITÉ, ET IL DOIT MORDRE. Une famille dont les
    // bouches ne sont pas encore saisies porte `memberCount: 1` et aucun
    // `household_size`: la lire à son nombre de membres la ferait basculer en
    // solo, et l'écran qui demande les bouches disparaîtrait.
    expect(funnelMouths({ ...base, memberCount: 1, declared: null })).toBe(2);
    expect(funnelMouths({ ...base, memberCount: 3, declared: null })).toBe(3);
  });

  it("le nombre déclaré GAGNE sur le compte des membres, dans les deux sens", () => {
    // Déclaré 4, deux bouches saisies: l'étape « il en manque » doit rester.
    expect(funnelMouths({ ...base, memberCount: 2, declared: 4 })).toBe(4);
    // Déclaré 2, trois bouches en base: on croit l'écrit, pas le compte.
    expect(funnelMouths({ ...base, memberCount: 3, declared: 2 })).toBe(2);
  });

  it("⚠️ UN SECONDAIRE RÉPOND 1, quelle que soit la table", () => {
    expect(funnelMouths({ ...base, isOwner: false, memberCount: 5, declared: 5 }))
      .toBe(1);
  });
});
