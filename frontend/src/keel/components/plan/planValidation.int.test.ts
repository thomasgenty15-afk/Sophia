import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PlanValidationNotice } from "./PlanValidationNotice";
import {
  readPlanValidation,
  visibleControls,
  visibleDefects,
} from "../../api/planValidation";
import { readMealRow } from "../../api/mealGeneration";
import { readDraftPlan } from "../../api/planDraft";
import type { MemberPortionView } from "../../api/mealGeneration";
import { setChosenUiLocaleForTest } from "../../i18n/runtime";

// ===========================================================================
// ÉTAPE C5 — LES ÉCARTS PERSISTÉS, À L'ÉCRAN
//
// Le plan de clôture (§ C5) : « version avec écart visible à réception PUIS
// après une vraie relecture API ; version conforme sans faux avertissement ;
// plusieurs personnes ; absence de fuite de chiffres protégés. »
//
// ⚠️ CE BANC PORTE LE HTML RENDU, PAS LA FONCTION. Des tests de source sont
// restés verts sur du code mort dans ce dépôt. La seule question qui compte est
// « qu'est-ce que la personne lit ».
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX : `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
//
// ⛔ CE QUE CE FICHIER NE PRÉTEND PAS FAIRE. « Un rendu React depuis une
// fixture est utile mais ne remplace pas le parcours complet
// sauvegarde/relecture. » Le parcours complet est au transport contrôlé ; ici
// on éprouve les DEUX lecteurs réels (`readMealRow` d'une ligne de base,
// `readDraftPlan` d'une réponse) et le rendu.
// ===========================================================================

const PATH = "/app/plan";

function locate(locale: "en" | "fr" = "en") {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
}

function text(markup: string): string {
  return markup
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const PAUL = "m-paul";
const LEA = "m-lea";

const PORTIONS: MemberPortionView[] = [
  { memberId: PAUL, displayName: "Paul", portionNote: null, shares: [], eatingSlots: null },
  { memberId: LEA, displayName: "Lea", portionNote: null, shares: [], eatingSlots: null },
];

/**
 * LA FORME EXACTE que `plan_validation.ts` écrit dans `generated_from`.
 *
 * ⟳ 2026-09-12 · FERMETURE LOT 2 — LES CHAMPS SONT TYPÉS, PLUS INFÉRÉS. Les
 * deux entrées d'origine portent `slot: null`, ce qui inférait `null` tout
 * court: un cas qui déforme la fixture pour y mettre `slot: "dinner"` ne
 * compilait pas, alors qu'il décrit très exactement ce qu'on veut lire (deux
 * bouches, deux écarts, deux cases).
 */
function recordAvecEcarts() {
  return {
    version: 1,
    state: "livrable_avec_ecarts",
    defects: [
      {
        cause: "protein_floor_short",
        severity: "count",
        blocking: false,
        day: "2026-09-13" as string | null,
        slot: null as string | null,
        member_id: PAUL as string | null,
        dish: null as string | null,
        term: null as string | null,
        number_protected: true,
      },
      {
        cause: "ingredient_not_bought",
        severity: "count",
        blocking: false,
        day: null,
        slot: null,
        member_id: null,
        dish: null,
        term: "feta",
        number_protected: false,
      },
    ],
    incomplete: [{ control: "shopping_quantity", count: 2 }],
    not_applicable: [{ control: "shopping_not_purchasable", count: 1 }],
    not_run: ["title_promises_missing_preparation"],
    counts: {
      blocking: 0,
      gaps: 2,
      incomplete: 2,
      not_applicable: 1,
      not_run: 1,
    },
    repair: {
      rounds: 2,
      calls_made: 1,
      defects_at_delivery: 2,
      by_kind: { nutrition: 1, shopping: 1 },
      by_source: { gate: 2 },
    },
  };
}

function render(args: {
  validation: unknown;
  showEnergy: boolean;
  locale?: "en" | "fr";
  /** Les parts du plan rendu. Par défaut le foyer Paul/Lea ci-dessus. */
  portions?: readonly MemberPortionView[];
}): string {
  locate(args.locale ?? "en");
  return renderToStaticMarkup(
    createElement(PlanValidationNotice, {
      validation: readPlanValidation(args.validation),
      portions: args.portions ?? PORTIONS,
      showEnergy: args.showEnergy,
    }),
  );
}

// ───────────────────────────────────────────────────────────────────────────
describe("① le lecteur du statut", () => {
  it("lit la forme du serveur, listes SÉPARÉES", () => {
    const v = readPlanValidation(recordAvecEcarts());
    expect(v).not.toBeNull();
    expect(v?.state).toBe("livrable_avec_ecarts");
    expect(v?.defects.map((d) => d.cause)).toEqual([
      "protein_floor_short",
      "ingredient_not_bought",
    ]);
    // ⛔ LES TROIS LISTES NE SE FONDENT JAMAIS. Un lecteur qui les concaténerait
    // ferait lire « 4 écarts » sur un plan qui en a 2.
    expect(v?.incomplete.map((c) => c.control)).toEqual(["shopping_quantity"]);
    expect(v?.notApplicable.map((c) => c.control)).toEqual([
      "shopping_not_purchasable",
    ]);
    expect(v?.notRun).toEqual(["title_promises_missing_preparation"]);
  });

  it("S'ABSTIENT sur ce qu'il ne sait pas relire", () => {
    // ⛔ « PAS MESURÉ » N'EST PAS « CONFORME ». Trois entrées, un seul verdict:
    // le silence. Une version future inconnue comprise — s'abstenir est la
    // seule direction d'erreur sûre pour un statut.
    expect(readPlanValidation(null)).toBeNull();
    expect(readPlanValidation({ version: 2, state: "conforme" })).toBeNull();
    expect(readPlanValidation({ version: 1, state: "presque" })).toBeNull();
    // LE CAS QUI PASSE.
    expect(readPlanValidation({ version: 1, state: "conforme" })?.state).toBe(
      "conforme",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("② la relecture API — le statut vit sur la LIGNE", () => {
  it("`readMealRow` le relit depuis `generated_from.validation`", () => {
    // ⛔ C'EST LE CHEMIN « APRÈS RECHARGEMENT » DU § C5 ④, et c'est le VRAI
    // lecteur de `/app/plan`: `loadMealPlans` → `readMealRow`. Un statut qui ne
    // vivrait que dans la réponse disparaîtrait au premier rafraîchissement.
    const row = {
      id: "plan-1",
      starts_on: "2026-09-12",
      duration_days: 3,
      generated_from: { validation: recordAvecEcarts() },
    };
    const plan = readMealRow(row);
    expect(plan.validation?.state).toBe("livrable_avec_ecarts");
    expect(plan.validation?.defects.length).toBe(2);
    // LE CAS QUI PASSE — une ligne d'avant ce lot n'en porte pas, et l'écran
    // se tait exactement comme hier.
    expect(readMealRow({ ...row, generated_from: {} }).validation).toBeNull();
  });

  it("`readDraftPlan` le lit à la RACINE de la réponse d'aperçu", () => {
    const draft = readDraftPlan({
      window: { starts_on: "2026-09-12", duration_days: 3 },
      validation: recordAvecEcarts(),
    });
    expect(draft.validation?.state).toBe("livrable_avec_ecarts");
    expect(readDraftPlan({ window: {} }).validation).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("③ ce que la personne lit", () => {
  it("un plan avec écarts les NOMME, avec le repas et la personne", () => {
    const html = render({ validation: recordAvecEcarts(), showEnergy: true });
    const lu = text(html);
    expect(html).toContain('data-testid="plan-validation"');
    expect(lu).toContain("This plan is usable, and here is what it misses");
    expect(lu).toContain("A day falls short of its protein");
    expect(lu).toContain("Paul");
    expect(lu).toContain("An ingredient is on no shopping line");
    expect(lu).toContain("feta");
    // ⛔ ET IL DIT QUE LE PLAN EST BIEN LÀ: la première peur devant un
    // avertissement est d'avoir perdu la semaine.
    expect(lu).toContain("It has been saved");
  });

  it("un plan CONFORME ne rend AUCUN avertissement", () => {
    // ⛔ « VERSION CONFORME SANS FAUX AVERTISSEMENT », et pas de pastille verte
    // non plus: `conforme` n'exige pas que tous les dénominateurs aient tourné,
    // donc une pastille dirait « tout a été regardé » — ce qu'on ne sait pas.
    const html = render({
      validation: {
        version: 1,
        state: "conforme",
        defects: [],
        incomplete: [],
        not_applicable: [],
        not_run: [],
        counts: { blocking: 0, gaps: 0, incomplete: 0, not_applicable: 0, not_run: 0 },
        repair: null,
      },
      showEnergy: true,
    });
    expect(html).toBe("");
  });

  it("un plan SANS statut se tait — « pas mesuré » n'est pas « propre »", () => {
    expect(render({ validation: null, showEnergy: true })).toBe("");
  });

  it("plusieurs personnes: chaque écart garde SA bouche", () => {
    const deux = recordAvecEcarts();
    deux.defects = [
      {
        cause: "cell_without_portion",
        severity: "refuse",
        blocking: true,
        day: "sun",
        slot: "dinner",
        member_id: PAUL,
        dish: null,
        term: null,
        number_protected: false,
      },
      {
        cause: "cell_without_portion",
        severity: "refuse",
        blocking: true,
        day: "mon",
        slot: "lunch",
        member_id: LEA,
        dish: null,
        term: null,
        number_protected: false,
      },
    ];
    const lu = text(render({ validation: deux, showEnergy: true }));
    expect(lu).toContain("Sunday, Dinner");
    expect(lu).toContain("Paul");
    expect(lu).toContain("Monday, Lunch");
    expect(lu).toContain("Lea");
  });

  it("rend le français quand la page est française", () => {
    const lu = text(
      render({ validation: recordAvecEcarts(), showEnergy: true, locale: "fr" }),
    );
    expect(lu).toContain("Ce plan est utilisable");
    expect(lu).toContain("Une journée n’atteint pas sa protéine");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("④ aucune fuite de chiffre protégé", () => {
  it("porte FERMÉE: les écarts de la famille calorique disparaissent", () => {
    // ⛔ LA MORSURE. `useMealEnergy().showing` est faux notamment quand un
    // plancher TCA, l'âge ou le coach protègent la personne du sujet. Lui
    // afficher « ta journée n'atteint pas sa protéine » remettrait très
    // exactement le sujet que la protection retire.
    const lu = text(render({ validation: recordAvecEcarts(), showEnergy: false }));
    expect(lu).not.toContain("protein");
    expect(lu).not.toContain("Paul");
    // LE CAS QUI PASSE — l'écart de courses reste: il ne protège personne, et
    // le cacher priverait la personne du seul fait qui lui dit quoi faire.
    expect(lu).toContain("An ingredient is on no shopping line");
    expect(lu).toContain("feta");
  });

  it("porte FERMÉE et rien d'autre à dire: le bloc entier disparaît", () => {
    const seulement = recordAvecEcarts();
    seulement.defects = [seulement.defects[0]];
    seulement.incomplete = [];
    expect(render({ validation: seulement, showEnergy: false })).toBe("");
    // LE CAS QUI PASSE — porte ouverte, le même objet parle.
    expect(render({ validation: seulement, showEnergy: true })).not.toBe("");
  });

  it("AUCUN nombre de la garde n'atteint l'écran, porte ouverte comprise", () => {
    // ⛔ LE SERVEUR NE PERSISTE AUCUN `detail`. Ce cas le vérifie DE L'AUTRE
    // CÔTÉ: même si un `detail` chiffré se glissait dans l'objet, l'écran n'en
    // rendrait rien — il ne lit que la cause et le site.
    const avecDetail = {
      ...recordAvecEcarts(),
      defects: [{
        cause: "day_energy_off",
        severity: "count",
        blocking: false,
        day: "2026-09-13",
        slot: null,
        member_id: PAUL,
        dish: null,
        term: null,
        number_protected: true,
        detail: "2026-09-13 : 2 455 kcal servies pour 2 916 couvertes",
      }],
      incomplete: [],
    };
    const lu = text(render({ validation: avecDetail, showEnergy: true }));
    expect(lu).not.toContain("kcal");
    expect(lu).not.toContain("2 455");
    expect(lu).not.toContain("2 916");
    // Le FAIT reste, et la personne sait quoi corriger.
    expect(lu).toContain("A meal is off its target");
  });

  it("les filtres purs mordent sur les deux familles", () => {
    const v = readPlanValidation(recordAvecEcarts());
    expect(v).not.toBeNull();
    expect(visibleDefects(v!.defects, true).length).toBe(2);
    expect(visibleDefects(v!.defects, false).map((d) => d.cause)).toEqual([
      "ingredient_not_bought",
    ]);
    // Un contrôle incomplet d'énergie disparaît aussi; celui des courses reste.
    const controls = [
      { control: "cell_energy", count: 3 },
      { control: "shopping_quantity", count: 2 },
    ];
    expect(visibleControls(controls, true).length).toBe(2);
    expect(visibleControls(controls, false).map((c) => c.control)).toEqual([
      "shopping_quantity",
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ⑤ LE PARCOURS COMPLET — la colonne RÉELLE d'un plan écrit par le moteur
// ───────────────────────────────────────────────────────────────────────────
//
// ⛔ « UN RENDU REACT DEPUIS UNE FIXTURE EST UTILE MAIS NE REMPLACE PAS LE
// PARCOURS COMPLET SAUVEGARDE/RELECTURE. » Voici l'autre moitié: l'objet
// ci-dessous est RECOPIÉ TEL QUEL de la base, plan
// `1ad70c8c-5fce-49db-be6e-c909c544f1f7`, colonne `generated_from -> 'validation'`,
// écrit le 2026-09-12 par un run du transport contrôlé (0 appel modèle facturé,
// `perte --compte=c5a --retaille --horloge=2026-09-11T19:42:01+02:00`).
//
//     docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -A -t \
//       -c "select generated_from->'validation' from student_generated_meals \
//           where id='1ad70c8c-5fce-49db-be6e-c909c544f1f7'"
//
// ⚠️ L'ORDRE DES CLÉS EST CELUI DE POSTGRES (`jsonb` réordonne), et c'est une
// PREUVE de plus qu'il n'a pas été retapé à la main.
const COLONNE_REELLE = {
  state: "livrable_avec_ecarts",
  counts: { gaps: 3, not_run: 2, blocking: 0, incomplete: 3, not_applicable: 0 },
  repair: {
    rounds: 3,
    by_kind: { sizing: 2, protein: 1 },
    by_source: { gate: 3, quantities: 0, output_contract: 0 },
    calls_made: 1,
    defects_at_delivery: 3,
  },
  defects: [
    {
      day: "sat",
      dish: null,
      slot: "dinner",
      term: null,
      cause: "cell_energy_off",
      blocking: false,
      severity: "count",
      member_id: "f6e97d80-5265-42ce-9d70-f5f9d71690f7",
      number_protected: true,
    },
    {
      day: "sun",
      dish: null,
      slot: "dinner",
      term: null,
      cause: "cell_energy_off",
      blocking: false,
      severity: "count",
      member_id: "f6e97d80-5265-42ce-9d70-f5f9d71690f7",
      number_protected: true,
    },
    {
      day: "2026-09-13",
      dish: null,
      slot: null,
      term: null,
      cause: "protein_floor_short",
      blocking: false,
      severity: "count",
      member_id: "f6e97d80-5265-42ce-9d70-f5f9d71690f7",
      number_protected: true,
    },
  ],
  not_run: ["title_promises_missing_preparation", "mouth_energy_short"],
  version: 1,
  incomplete: [
    { count: 2, control: "shopping_quantity" },
    { count: 1, control: "mouth_energy" },
  ],
  not_applicable: [],
};

describe("⑤ la colonne écrite par le moteur, relue par l'écran", () => {
  it("`readMealRow` la comprend, listes séparées comprises", () => {
    const plan = readMealRow({
      id: "1ad70c8c-5fce-49db-be6e-c909c544f1f7",
      starts_on: "2026-09-12",
      duration_days: 2,
      generated_from: { validation: COLONNE_REELLE },
    });
    expect(plan.validation?.state).toBe("livrable_avec_ecarts");
    expect(plan.validation?.defects.map((d) => d.cause)).toEqual([
      "cell_energy_off",
      "cell_energy_off",
      "protein_floor_short",
    ]);
    expect(plan.validation?.incomplete.map((c) => c.control)).toEqual([
      "shopping_quantity",
      "mouth_energy",
    ]);
    expect(plan.validation?.notRun).toEqual([
      "title_promises_missing_preparation",
      "mouth_energy_short",
    ]);
  });

  it("l'écran la rend — et se tait entièrement quand la porte est fermée", () => {
    // ⛔ CE PLAN-LÀ N'A QUE DES ÉCARTS DE LA FAMILLE CALORIQUE. Porte ouverte,
    // il parle; porte fermée, il ne reste QUE le contrôle de courses incomplet.
    const ouvert = text(render({ validation: COLONNE_REELLE, showEnergy: true }));
    expect(ouvert).toContain("A meal is off its target");
    expect(ouvert).toContain("A day falls short of its protein");
    expect(ouvert).toContain("Sunday, Dinner");
    const ferme = text(render({ validation: COLONNE_REELLE, showEnergy: false }));
    expect(ferme).not.toContain("protein");
    expect(ferme).not.toContain("off its target");
    // Ce qui reste est le contrôle de courses — il ne protège personne.
    expect(ferme).toContain("Enough of an ingredient");
  });

  it("aucun chiffre du moteur n'atteint l'écran depuis cette colonne", () => {
    // ⛔ LE PLAN RÉEL PORTAIT −16 % DE PROTÉINE ET DEUX REPAS HORS CIBLE. Le
    // serveur n'a persisté AUCUN de ces nombres, et l'écran n'en invente pas.
    const lu = text(render({ validation: COLONNE_REELLE, showEnergy: true }));
    expect(lu).not.toMatch(/\bkcal\b/);
    expect(lu).not.toMatch(/\d+\s*%/);
    expect(lu).not.toMatch(/\d+\s*g\b/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ⑥ DEUX PERSONNES, UN SEUL ÉCART — § 2.3 « écart résiduel visible »
// ───────────────────────────────────────────────────────────────────────────
//
// Le plan : « Candidate sûre et complète gardant un écart autorisé pour une
// seule personne → nature, personne et créneau correctement portés dans la
// donnée ET visibles au lecteur concerné. Les personnes protégées ne reçoivent
// pas de chiffres interdits. »
//
// ⛔ CE QUE LE CAS ③ « plusieurs personnes » NE PROUVAIT PAS. Il portait DEUX
// écarts pour DEUX bouches : les deux noms étaient à l'écran, donc un rendu qui
// aurait nommé tout le monde sous chaque ligne serait passé vert. Le cas qui
// mord est l'asymétrie : UN écart, DEUX bouches — l'autre ne doit pas
// apparaître, et surtout pas être nommée à côté d'un défaut qui n'est pas le
// sien.

const MARGAUX = "m-margaux";

/** Un foyer de deux, aux prénoms sans recouvrement avec la copie de l'écran. */
const FOYER_DEUX: MemberPortionView[] = [
  { memberId: PAUL, displayName: "Paul", portionNote: null, shares: [], eatingSlots: null },
  {
    memberId: MARGAUX,
    displayName: "Margaux",
    portionNote: null,
    shares: [],
    eatingSlots: null,
  },
];

/**
 * UN SEUL ÉCART, SUR UNE SEULE BOUCHE, DANS UN FOYER DE DEUX.
 *
 * ⚠️ IL PORTE UN `detail` CHIFFRÉ, ET C'EST LA PRÉMISSE DU CONTRE-CAS. Sans
 * nombre dans la donnée brute, « aucun chiffre à l'écran » ne prouverait rien :
 * le test serait vert parce qu'il n'y avait rien à fuir.
 */
const DETAIL_CHIFFRE = "sun dinner : 1 812 kcal servies pour 2 340 couvertes";

function recordUnSeulEcart() {
  return {
    version: 1,
    state: "livrable_avec_ecarts",
    defects: [
      {
        cause: "cell_energy_off",
        severity: "count",
        blocking: false,
        day: "sun",
        slot: "dinner",
        member_id: PAUL,
        dish: null,
        term: null,
        number_protected: true,
        detail: DETAIL_CHIFFRE,
      },
    ],
    // ⚠️ UN CONTRÔLE INCOMPLET HORS FAMILLE CALORIQUE, EXPRÈS. Porte fermée, le
    // bloc doit RESTER à l'écran : on éprouve ainsi que le nom et le chiffre
    // sont absents d'un bandeau qui parle, et pas d'un bandeau disparu.
    incomplete: [{ control: "shopping_quantity", count: 1 }],
    not_applicable: [],
    not_run: [],
    counts: { blocking: 0, gaps: 1, incomplete: 1, not_applicable: 0, not_run: 0 },
    repair: null,
  };
}

describe("⑥ un seul écart dans un foyer de deux", () => {
  it("la donnée porte la nature, la personne ET le créneau", () => {
    // LA PRÉMISSE, côté donnée : si l'identité se perdait ICI, le rendu ne
    // pourrait pas la retrouver.
    const v = readPlanValidation(recordUnSeulEcart());
    expect(v?.defects.length).toBe(1);
    const d = v!.defects[0];
    expect(d.cause).toBe("cell_energy_off");
    expect(d.memberId).toBe(PAUL);
    expect(d.day).toBe("sun");
    expect(d.slot).toBe("dinner");
    expect(d.numberProtected).toBe(true);
  });

  it("le bandeau nomme la personne concernée, son créneau — et PAS l'autre", () => {
    const lu = text(
      render({
        validation: recordUnSeulEcart(),
        showEnergy: true,
        portions: FOYER_DEUX,
      }),
    );
    // La nature, le créneau, la personne.
    expect(lu).toContain("A meal is off its target");
    expect(lu).toContain("Sunday, Dinner");
    expect(lu).toContain("for Paul");
    // ⛔ LE CAS QUI MORD : l'autre bouche n'est NULLE PART. Un rendu qui
    // nommerait toutes les parts du plan sous chaque écart accuserait Margaux
    // d'un défaut qui n'est pas le sien.
    expect(lu).not.toContain("Margaux");
    // Et une seule ligne d'écart, donc un seul « for ».
    expect(lu.match(/\bfor Paul\b/g)?.length).toBe(1);
  });

  it("PORTE FERMÉE : l'écart part, le nom part, le chiffre n'a jamais existé", () => {
    // ① LA PRÉMISSE, ET ELLE EST OBLIGATOIRE. La donnée brute PORTE le nombre.
    const brut = recordUnSeulEcart();
    expect(brut.defects[0].detail).toContain("1 812");
    expect(brut.defects[0].detail).toContain("kcal");

    // ② LE LECTEUR NE LE TRANSPORTE MÊME PAS : `PlanValidationDefect` n'a aucun
    // champ où le mettre. Le nombre meurt à la lecture, pas au rendu.
    const vue = readPlanValidation(brut);
    expect(JSON.stringify(vue)).not.toContain("1 812");
    expect(JSON.stringify(vue)).not.toContain("kcal");

    // ③ ET LE RENDU, PORTE FERMÉE : le bandeau parle encore (le contrôle de
    // courses reste), mais l'écart calorique et le nom de la personne
    // protégée ont disparu ensemble.
    const html = render({
      validation: brut,
      showEnergy: false,
      portions: FOYER_DEUX,
    });
    expect(html).toContain('data-testid="plan-validation"');
    const lu = text(html);
    expect(lu).not.toContain("off its target");
    expect(lu).not.toContain("Paul");
    expect(lu).not.toContain("Sunday");
    expect(lu).not.toContain("Dinner");
    expect(lu).not.toContain("kcal");
    expect(lu).not.toContain("1 812");
    expect(lu).not.toContain("2 340");
    // LE CAS QUI PASSE — ce qui ne protège personne reste lisible.
    expect(lu).toContain("What could not be checked");
  });

  it("⚠️ LIMITE NOMMÉE : deux homonymes sont indiscernables à l'écran", () => {
    // ⛔ CE TEST NE CÉLÈBRE RIEN, IL CONSTATE. `memberId` distingue les deux
    // bouches dans la DONNÉE de bout en bout ; l'écran, lui, ne rend que
    // `display_name`. Deux « Paul » sous le même toit lisent donc la même
    // phrase, et rien à l'écran ne dit duquel il s'agit.
    //
    // ⚠️ IL EST ÉCRIT COMME UNE ÉGALITÉ, PAS COMME UN `not.toContain`. Le jour
    // où quelqu'un ajoutera un désambiguïsateur, ce test rougira et l'obligera
    // à le décider — au lieu de rester vert sur une limite qu'on aurait levée
    // sans le dire.
    const homonymes: MemberPortionView[] = [
      { memberId: PAUL, displayName: "Paul", portionNote: null, shares: [], eatingSlots: null },
      {
        memberId: MARGAUX,
        displayName: "Paul",
        portionNote: null,
        shares: [],
        eatingSlots: null,
      },
    ];
    const surLePremier = recordUnSeulEcart();
    const surLeSecond = recordUnSeulEcart();
    surLeSecond.defects[0].member_id = MARGAUX;

    // La donnée, elle, ne confond pas.
    expect(readPlanValidation(surLePremier)!.defects[0].memberId).toBe(PAUL);
    expect(readPlanValidation(surLeSecond)!.defects[0].memberId).toBe(MARGAUX);

    // L'écran, lui, rend STRICTEMENT le même HTML dans les deux cas.
    const a = render({ validation: surLePremier, showEnergy: true, portions: homonymes });
    const b = render({ validation: surLeSecond, showEnergy: true, portions: homonymes });
    expect(a).toBe(b);
    expect(text(a)).toContain("for Paul");
  });
});
