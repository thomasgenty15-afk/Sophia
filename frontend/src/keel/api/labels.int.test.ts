import { afterEach, describe, expect, it } from "vitest";
import {
  autonomyLabel,
  commitmentAmount,
  commitmentQuestions,
  type CommitmentShape,
  commitmentSentence,
  foodSectionLabel,
  planPartHint,
  planPartLabel,
  studentPartLabel,
} from "./labels";
import { gapQuestion } from "./gapQuestion";
// The PARTITION itself moved to `planStructure.ts` and is tested there
// (`planStructure.int.test.ts`, over the same eighteen-line document). What is
// left here is what this file is for: the WORDS. The two orders are imported to
// prove every part and every food heading has one.
import { FOOD_SECTION_ORDER, PLAN_PART_ORDER } from "./planStructure";
import { type UiLocale } from "../i18n/catalog";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// THE READ-BACK TEST
//
// This file guards ONE property, and it is the property the product is judged
// on before any other: a dietitian who has never heard of us opens the import
// screen, reads her own plan back, and understands every line without being
// taught anything.
//
// What she used to read, for "Protein at every meal":
//
//     do · nutrition · presence · occasion · @ any_meal
//     core 98%
//     lean_protein
//
// and, when a line did not fit the schema:
//
//     plan_commitments_target_check: target_op='<=' requires target_max
//
// Every fixture below is a REAL row: the output of plan-import-v1 on
// supabase/tests/keel/sample_coach_plan.txt, the first genuine coach document
// this product was pointed at. The expected strings are what the screen shows.
// If a change to the sentence builder makes one of them read worse, that is not
// a snapshot to update — it is the regression.
//
// ── POURQUOI CE FICHIER BOUCLE MAINTENANT SUR DEUX LANGUES ─────────────────
// Il ne lisait que l'anglais, et c'était le seul endroit d'où le défaut de
// composition FRANÇAIS pouvait se voir. Les atomes (`unit.*`, `when.*`,
// `food_group.*`) sont atteints DYNAMIQUEMENT — `labelIn(namespace, token)`,
// jeton venu de la base —, donc aucun scan statique ne les relie à un écran et
// aucune page n'a besoin d'exister pour qu'ils se rendent de travers. Une
// valeur restée anglaise ou une phrase mal recollée (« 2 portions de œufs »,
// « 0 portions ») n'aurait été trouvée que par un lecteur français.
//
// Le squelette de phrase est le MÊME dans les deux langues; ce qui change est
// ce que le seed y met. Les deux colonnes ci-dessous sont donc la vraie
// spécification: si l'une lit mal, le tort est dans le seed ou dans la
// composition, jamais dans le test.
// ===========================================================================

const LOCALES: readonly UiLocale[] = ["en", "fr"];

const PACKS: Record<UiLocale, Record<string, string>> = {
  en: en as Record<string, string>,
  fr: fr as Record<string, string>,
};

/** La valeur du seed pour cette langue — l'attente, sans passer par `t()`. */
function say(locale: UiLocale, key: string): string {
  const value = PACKS[locale][key];
  if (value === undefined) throw new Error(`clé absente du pack ${locale}: ${key}`);
  return value;
}

/**
 * `uiLocale()` lit `location.pathname` À L'APPEL, et rend l'anglais sur tout
 * chemin qui n'est pas une page déclarée ET entièrement traduite. En Node il
 * n'y a pas de `location`: sans ça, régler la langue sur « fr » n'aurait AUCUN
 * effet et la moitié française du fichier passerait en lisant de l'anglais.
 *
 * `/` est déclarée et entièrement traduite, donc elle suit le choix.
 */
function inLocale(locale: UiLocale): void {
  Object.defineProperty(globalThis, "location", {
  // ⚠️ `/start` ET PLUS `/`. Il faut ici un chemin DÉCLARÉ et entièrement
  // TRADUIT — sinon `uiLocale()` rend l'anglais quoi qu'on choisisse — et
  // qui ne soit PAS routé par langue. Depuis que l'URL porte la langue des
  // quatre pages de vente (`LOCALE_ROUTED_PATHS` dans `i18n/catalog.ts`),
  // `/` est FRANÇAIS par son adresse: le choix passé à ce helper n'y avait
  // plus aucun effet, et ces tests mesuraient la locale de la page d'accueil
  // au lieu de celle du visiteur. `/start` est une porte fonctionnelle, elle
  // suit le visiteur — c'est exactement ce que ce helper veut simuler.
    value: { pathname: "/start", search: "", href: "https://x.test/start" },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

/** A row as the extractor produces it; every field defaulted to "not set". */
function line(overrides: Partial<CommitmentShape>): CommitmentShape {
  return {
    polarity: "do",
    anchor_kind: "free",
    slot_key: null,
    clock_local: null,
    window_start_local: null,
    window_end_local: null,
    measure: "presence",
    unit: null,
    target_op: "any",
    target_min: null,
    target_max: null,
    substance_ref: null,
    food_group_ref: null,
    evaluation_grain: "day",
    scheduled_days: null,
    required_days_per_week: 7,
    expected_occasions_per_day: 1,
    ...overrides,
  };
}

// The document, line by line, exactly as plan-import-v1 returned it.
const PLAN: Array<
  { title: string; row: CommitmentShape; reads: Record<UiLocale, string> }
> = [
  {
    title: "Protein at every meal",
    row: line({
      anchor_kind: "slot",
      slot_key: "any_meal",
      food_group_ref: "lean_protein",
      evaluation_grain: "occasion",
      expected_occasions_per_day: 3,
    }),
    reads: {
      en: "At every meal — protein",
      fr: "À chaque repas — protéines",
    },
  },
  {
    title: "Two servings of non-starchy vegetables every day",
    row: line({
      measure: "serving",
      unit: "serving",
      target_op: ">=",
      target_min: 2,
      food_group_ref: "non_starchy_veg",
    }),
    reads: {
      en: "Every day — 2 servings of vegetables",
      // LA LIGNE QUI A FAIT DÉPLACER LA PRÉPOSITION. « de légumes » vient de
      // `food_group.of.*`, pas d'un « of » recollé par le gabarit: sur `eggs`
      // le même chemin rend « d'œufs », et aucune règle de code ne le sait.
      fr: "Tous les jours — 2 portions de légumes",
    },
  },
  {
    // The line that used to block the whole import on a constraint name, and
    // then — once it parsed — read back as the bare tautology "With breakfast".
    title: "Breakfast within 90 minutes of waking",
    row: line({
      anchor_kind: "slot",
      slot_key: "breakfast",
      evaluation_grain: "occasion",
    }),
    reads: {
      en: "Every day, with breakfast",
      fr: "Tous les jours, au petit-déjeuner",
    },
  },
  {
    title: "Vitamin D3 5000 IU with breakfast",
    row: line({
      anchor_kind: "slot",
      slot_key: "breakfast",
      measure: "dose",
      unit: "IU",
      target_op: ">=",
      target_min: 5000,
      substance_ref: "vitamin_d3",
      evaluation_grain: "occasion",
    }),
    reads: {
      en: "With breakfast — 5000 IU",
      // « UI » et pas « IU »: l'abréviation d'Unités Internationales s'écrit
      // dans l'ordre des mots de la langue.
      fr: "Au petit-déjeuner — 5000 UI",
    },
  },
  {
    title: "No alcohol Monday through Friday",
    row: line({
      polarity: "avoid",
      target_op: "==",
      target_min: 0,
      substance_ref: "alcohol",
      scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
      required_days_per_week: null,
    }),
    reads: {
      en: "Weekdays — none",
      fr: "En semaine — aucun",
    },
  },
  {
    title: "Rate your energy 0-10 each evening",
    row: line({
      polarity: "capture",
      anchor_kind: "slot",
      slot_key: "dinner",
      measure: "scale",
      unit: "point",
      target_op: "between",
      target_min: 0,
      target_max: 10,
    }),
    reads: {
      en: "Each evening — rate 0 to 10 · tracked, not scored",
      fr: "Chaque soir — noter de 0 à 10 · suivi, pas noté",
    },
  },
  {
    title: "Weigh once a week, Saturday morning",
    row: line({
      polarity: "capture",
      anchor_kind: "slot",
      slot_key: "breakfast",
      measure: "scale",
      unit: "point",
      evaluation_grain: "week",
      scheduled_days: ["sat"],
      required_days_per_week: 1,
    }),
    reads: {
      en: "Every Saturday, at breakfast · tracked, not scored",
      // « samedi » en minuscules, et « Chaque » qui ouvre la phrase: un nom de
      // jour ne prend pas la majuscule en français.
      fr: "Chaque samedi, au petit-déjeuner · suivi, pas noté",
    },
  },
  {
    title: "Legumes 3 times a week",
    row: line({
      measure: "serving",
      unit: "serving",
      target_op: ">=",
      target_min: 3,
      food_group_ref: "legumes",
      evaluation_grain: "week",
      required_days_per_week: 3,
    }),
    // "and I mean three different days, not three portions on Sunday" — the
    // one thing the coach bothered to spell out, said back to her.
    reads: {
      en: "3 different days a week — legumes",
      fr: "3 jours différents par semaine — légumineuses",
    },
  },
  {
    title: "Lights out by 23:00 on weeknights",
    row: line({
      anchor_kind: "clock",
      clock_local: "23:00",
      measure: "clock_time",
      unit: "hhmm",
      target_op: "<=",
      target_max: 2300,
      scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
      required_days_per_week: null,
    }),
    reads: {
      en: "Weekdays, at 23:00",
      fr: "En semaine, à 23:00",
    },
  },
  {
    title: "10 minutes of daylight within an hour of waking",
    row: line({
      anchor_kind: "slot",
      slot_key: "on_waking",
      measure: "duration",
      unit: "min",
      target_op: ">=",
      target_min: 10,
      evaluation_grain: "occasion",
    }),
    reads: {
      en: "On waking — at least 10 minutes",
      fr: "Au réveil — au moins 10 minutes",
    },
  },
  {
    title: "Photograph your breakfast every day for the first two weeks",
    row: line({
      polarity: "capture",
      anchor_kind: "slot",
      slot_key: "breakfast",
    }),
    reads: {
      en: "Every day, at breakfast · tracked, not scored",
      fr: "Tous les jours, au petit-déjeuner · suivi, pas noté",
    },
  },
  {
    title: "No added sugar after dinner",
    row: line({
      polarity: "avoid",
      anchor_kind: "slot",
      slot_key: "dinner",
      target_op: "==",
      target_min: 0,
      food_group_ref: "sugar_sweets",
    }),
    reads: {
      en: "With dinner — none",
      fr: "Au dîner — aucun",
    },
  },
];

for (const locale of LOCALES) {
  describe(`[${locale}] commitmentSentence — the coach reads her own plan back`, () => {
    for (const { title, row, reads } of PLAN) {
      it(`"${title}" reads "${reads[locale]}"`, () => {
        inLocale(locale);
        expect(commitmentSentence(row)).toBe(reads[locale]);
      });
    }
  });

  describe(`[${locale}] the sentence never leaks storage vocabulary`, () => {
    // Not "these words are ugly": each one is a token whose MEANING on screen is
    // different from its meaning in the schema. "presence" is a measure, not an
    // instruction; "serving" is a unit, not a portion size; "occasion" is a
    // grain, not a moment. Printed raw they read like a partially translated
    // page, which is exactly what the first coach reported.
    const TOKENS = [
      "presence",
      "occasion",
      "capture",
      "polarity",
      "grain",
      "any_meal",
      "lean_protein",
      "non_starchy_veg",
      "sugar_sweets",
      "vitamin_d3",
      "clock_time",
      "target_op",
      "plan_commitments",
    ];

    for (const { title, row } of PLAN) {
      it(`"${title}" carries none of them`, () => {
        inLocale(locale);
        const sentence = commitmentSentence(row);
        for (const token of TOKENS) {
          expect(sentence.includes(token)).toBe(false);
        }
        // No bare snake_case slug of any kind, known or not.
        expect(sentence).not.toMatch(/[a-z0-9]_[a-z0-9]/);
      });
    }
  });

  describe(`[${locale}] the two clauses that carry a whole prescription`, () => {
    it("says 'different days', not just a count, when the coach asked for it", () => {
      // required_days_per_week IS the difference between three portions on Sunday
      // and three separate days. Dropping the word drops the prescription.
      inLocale(locale);
      const weekly = line({
        measure: "serving",
        unit: "serving",
        target_op: ">=",
        target_min: 3,
        food_group_ref: "fatty_fish",
        evaluation_grain: "week",
        required_days_per_week: 3,
      });
      expect(commitmentSentence(weekly)).toContain(
        say(locale, "when.different_days_per_week").replace("{count}", "3"),
      );
    });

    it("says 'none', never 'presence == 0'", () => {
      inLocale(locale);
      const avoid = line({
        polarity: "avoid",
        target_op: "==",
        target_min: 0,
        substance_ref: "alcohol",
      });
      expect(commitmentSentence(avoid)).toBe(
        `${say(locale, "when.every_day")}${say(locale, "sentence.separator")}${
          say(locale, "amount.none")
        }`,
      );
    });

    it("marks every capture line as tracked, not scored", () => {
      inLocale(locale);
      for (const { row } of PLAN) {
        const sentence = commitmentSentence(row);
        expect(sentence.endsWith(say(locale, "sentence.tracked_suffix"))).toBe(
          row.polarity === "capture",
        );
      }
    });

    it("never quantifies the same recurrence twice", () => {
      // "Every Saturday, each morning at breakfast" is not a style problem: the
      // two halves contradict each other, and the reader cannot tell which one is
      // the prescription.
      //
      // Le compteur est PAR LANGUE parce que le quantificateur l'est: « each »
      // et « every » d'un côté, « chaque » et « tous » de l'autre. Un seul motif
      // anglais aurait rendu zéro sur toute phrase française — c'est-à-dire un
      // test vert qui ne mesure rien.
      const QUANTIFIERS: Record<UiLocale, RegExp> = {
        en: /\b(each|every)\b/gi,
        fr: /\b(chaque|tous|toutes)\b/gi,
      };
      inLocale(locale);
      for (const { row } of PLAN) {
        const sentence = commitmentSentence(row);
        const quantifiers = sentence.match(QUANTIFIERS[locale]) ?? [];
        expect(quantifiers.length, sentence).toBeLessThanOrEqual(1);
      }
    });

    it("keeps the cadence when nothing else follows the moment", () => {
      // A line whose whole sentence is its anchor would otherwise print "With
      // breakfast" — a fragment that restates the weakest half of the title and
      // hides that the line runs every day.
      inLocale(locale);
      const bare = line({
        anchor_kind: "slot",
        slot_key: "breakfast",
        evaluation_grain: "occasion",
      });
      expect(commitmentSentence(bare)).toBe(
        `${say(locale, "when.every_day")}, ${say(locale, "when.at.breakfast")}`,
      );

      // ...and drops it again as soon as there is a real prescription to read.
      const dosed = {
        ...bare,
        measure: "dose",
        unit: "IU",
        target_op: ">=",
        target_min: 5000,
        substance_ref: "vitamin_d3",
      };
      expect(commitmentSentence(dosed)).toContain(
        `5000 ${say(locale, "unit.many.IU")}`,
      );
      expect(commitmentSentence(dosed)).not.toContain(
        say(locale, "when.every_day"),
      );
    });

    it("prints no ceiling it was not given, rather than the wrong bound", () => {
      // The extractor's classic mistake: a '<=' line whose bound landed in
      // target_min. Reading the other column would print a confident limit the
      // coach never wrote; the line asks "How much, exactly?" instead.
      inLocale(locale);
      const broken = line({
        measure: "count",
        unit: "session",
        target_op: "<=",
        target_min: 2,
        target_max: null,
        food_group_ref: "coffee_tea",
      });
      expect(commitmentSentence(broken)).toBe(
        `${say(locale, "when.every_day")}${say(locale, "sentence.separator")}${
          say(locale, "food_group.coffee_tea")
        }`,
      );
    });
  });

  describe(`[${locale}] an unreadable line says so instead of blanking the screen`, () => {
    it("renders the honest fallback on an unknown slug", () => {
      inLocale(locale);
      const rogue = line({ food_group_ref: "quinoa_and_friends" });
      expect(commitmentSentence(rogue)).toBe(say(locale, "question.unreadable"));
    });
  });

  describe(`[${locale}] commitmentQuestions — constraint names never reach the coach`, () => {
    it("turns each blocking issue into a decision she can make", () => {
      inLocale(locale);
      const questions = commitmentQuestions([
        "plan_commitments_target_check: target_op='<=' requires target_max",
        "plan_commitments_occasion_anchor_check: grain='occasion' needs an anchor that resolves to an occasion",
      ]);
      expect(questions.map((q) => q.question)).toEqual([
        say(locale, "question.how_much"),
        say(locale, "question.when"),
      ]);
      for (const q of questions) {
        expect(q.question).not.toMatch(/plan_commitments|target_op|grain=/);
      }
    });

    it("hides OUR bugs rather than dressing them as her decision", () => {
      // A missing template key is something the import should never have
      // produced. It still blocks the save (validateDraft is untouched) — it just
      // is not a question anyone can answer.
      inLocale(locale);
      expect(
        commitmentQuestions([
          "template_commitment_key: ASCII snake_case, starting with a letter (R1)",
        ]),
      ).toEqual([]);
    });

    it("falls back to an honest sentence on an issue family it does not know", () => {
      inLocale(locale);
      const questions = commitmentQuestions(["some_new_check: whatever it says"]);
      expect(questions).toHaveLength(1);
      expect(questions[0].question).toBe(say(locale, "question.unreadable"));
      expect(questions[0].question).not.toContain("some_new_check");
    });

    it("asks each question once, however many lines raise it", () => {
      inLocale(locale);
      const questions = commitmentQuestions([
        "plan_commitments_anchor_check: anchor_kind='slot' requires slot_key",
        "plan_commitments_occasion_anchor_check: grain='occasion' needs an anchor",
        "plan_commitments_nominal_slot_check: nominal slot required",
      ]);
      expect(questions).toHaveLength(1);
      expect(questions[0].fix).toBe("slot");
    });
  });

  describe(`[${locale}] every part and section has a label a coach can read`, () => {
    it("names them without a token or a column", () => {
      inLocale(locale);
      for (const part of PLAN_PART_ORDER) {
        for (
          const text of [planPartLabel(part), planPartHint(part), studentPartLabel(part)]
        ) {
          expect(text.length).toBeGreaterThan(0);
          expect(text).not.toMatch(/_/);
        }
      }
      for (const section of FOOD_SECTION_ORDER) {
        expect(foodSectionLabel(section)).not.toMatch(/_/);
      }
    });

    it("says 'tracked, not scored' where the observations live", () => {
      // La même phrase que l'incise des lignes d'observation, et c'est le point:
      // le titre de la section et le suffixe de chaque ligne doivent dire la
      // MÊME chose, sinon l'un des deux rassure et l'autre pas. Le suffixe
      // porte son espace et son point médian, d'où le nettoyage.
      inLocale(locale);
      const clause = say(locale, "sentence.tracked_suffix")
        .replace(/^[\s·]+/, "")
        .toLowerCase();
      expect(planPartHint("observations").toLowerCase()).toContain(clause);
    });
  });

  // The template editor printed this column's values RAW — a coach opening their
  // own library read `swap_within_policy` in a monospaced select, the last
  // storage slug visible on the three plan screens.
  describe(`[${locale}] autonomyLabel — the latitude of a line, in words`, () => {
    it("never hands back the slug it was given", () => {
      inLocale(locale);
      for (const token of ["strict", "swap_within_policy", "flexible"]) {
        const text = autonomyLabel(token);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/_/);
        expect(text).not.toBe(token);
      }
    });

    // R7: the next value added to the enum fails at the first render rather than
    // leaking as a slug — which is exactly how this one survived.
    it("throws on a value the seed has no word for", () => {
      inLocale(locale);
      expect(() => autonomyLabel("negotiated")).toThrow(/no message key/);
    });
  });
}

// ---------------------------------------------------------------------------
// gapQuestion — ANGLAIS SEULEMENT, ET C'EST UNE PROPRIÉTÉ DU CODE
//
// ⚠️ NE PAS AJOUTER CE BLOC À LA BOUCLE DES LANGUES SANS LIRE CECI. Deux
// raisons, et aucune n'est un oubli de traduction:
//
//   1. `gapQuestion` DÉCOUPE une phrase anglaise. `GAP_PREAMBLE` et
//      `GAP_NEGATIVE_PREAMBLE` sont des expressions régulières sur « The
//      document says / asks for / sets no … », c'est-à-dire sur la sortie de
//      l'extracteur — qui écrit en anglais. Sur une description française elles
//      ne mordent pas, et la fonction retombe sur la question générique.
//   2. Elle rend `review.gap_question*`, et `review` N'EST PAS dans le
//      périmètre traduit. Appelée avec la locale française sur une page
//      DÉCLARÉE, `t()` lève en DEV — c'est le détecteur de couture qui fait son
//      travail, pas un bug de ce test.
//
// C'est la dette du lot 5 (les écrans coach): tant que l'extracteur écrit en
// anglais, traduire `review.*` ne suffirait pas.
//
// ⚠️ ELLE A DÉMÉNAGÉ AU LOT 4 (`api/gapQuestion.ts`), et le déménagement EST le
// correctif. Elle vivait dans `labels.ts`, que `/app/today` importe pour rendre
// les phrases d'engagement: l'écran du jour ATTEIGNAIT donc `review.*` par un
// chemin d'import qu'il n'emprunte jamais à l'exécution, et le déclarer
// français aurait exigé de traduire les 44 clés de l'écran d'import du coach.
// ---------------------------------------------------------------------------

describe("gapQuestion — a hole in the document is a decision, not a finding", () => {
  it("reads the positive form as its subject", () => {
    expect(
      gapQuestion(
        "The document asks for retesting vitamin D in 8 weeks, but no standalone retest commitment is prescribed.",
      ),
    ).toBe("Retesting vitamin D in 8 weeks — do you want that tracked?");
  });

  it("reads the negative form as its subject", () => {
    expect(gapQuestion("The document sets no explicit hydration target.")).toBe(
      "Explicit hydration target — do you want that tracked?",
    );
  });

  it("keeps a negation rather than inverting the coach's meaning", () => {
    const q = gapQuestion("The document says not to stack all three sessions at the weekend.");
    expect(q).toBe("Not to stack all three sessions at the weekend — do you want that tracked?");
  });

  it("falls back to the generic question rather than inventing a subject", () => {
    expect(gapQuestion("   ")).toBe(en["review.gap_question_generic"]);
  });
});

// ---------------------------------------------------------------------------
// commitmentAmount — the STUDENT reads the same phrase as the coach
//
// Before this function existed the student's day and the coach's import screen
// rendered the same four rows two different ways, because the student's chip
// was still built from `targetLabel` (the storage triple: `target_op` + bound +
// `unit` badge). Measured on the real published plan:
//
//     coach                        student
//     "Weekdays, at 23:00"         "<= 2300 time"
//     "Weekdays — none"            "0"
//     "Every day — 2 servings"     ">= 2 serving"
//
// `time` is the display string of the `hhmm` unit token and 2300 is a clock
// stored as an integer. Every case below is one of those rows.
// ---------------------------------------------------------------------------

for (const locale of LOCALES) {
  describe(`[${locale}] commitmentAmount — one renderer for both screens`, () => {
    it("a clock ceiling never prints the stored integer or the unit token", () => {
      inLocale(locale);
      const bedtime = line({
        anchor_kind: "clock",
        clock_local: "23:00",
        measure: "clock_time",
        unit: "hhmm",
        target_op: "<=",
        target_max: 2300,
        scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
      });
      const amount = commitmentAmount(bedtime);
      expect(amount).not.toContain("2300");
      // Le mot d'affichage de l'unité `hhmm` — « time » en anglais, « heure » en
      // français. C'est le jeton de STOCKAGE rendu tel quel qui est interdit,
      // pas le mot anglais.
      expect(amount).not.toContain(say(locale, "unit.hhmm"));
      expect(amount).not.toContain("<=");
    });

    it("an avoid line says none, never the comparator's zero", () => {
      inLocale(locale);
      const noSugar = line({
        polarity: "avoid",
        anchor_kind: "slot",
        slot_key: "dinner",
        target_op: "==",
        target_min: 0,
        food_group_ref: "sugar_sweets",
      });
      expect(commitmentAmount(noSugar)).toBe(say(locale, "amount.none"));
      expect(commitmentAmount(noSugar)).not.toBe("0");
    });

    it("a counted target agrees with its number", () => {
      inLocale(locale);
      const veg = line({
        measure: "serving",
        unit: "serving",
        target_op: ">=",
        target_min: 2,
        food_group_ref: "non_starchy_veg",
      });
      expect(commitmentAmount(veg)).toContain(say(locale, "unit.many.serving"));
      expect(commitmentAmount(veg)).not.toContain(">=");
    });

    it("a dose travels verbatim — the coach's number is the coach's number", () => {
      inLocale(locale);
      const d3 = line({
        anchor_kind: "slot",
        slot_key: "breakfast",
        measure: "dose",
        unit: "IU",
        target_op: ">=",
        target_min: 5000,
        substance_ref: "vitamin_d3",
      });
      expect(commitmentAmount(d3)).toContain(`5000 ${say(locale, "unit.many.IU")}`);
    });

    it("no chip ever carries an operator or a raw unit slug", () => {
      inLocale(locale);
      for (const { row } of PLAN) {
        const amount = commitmentAmount(row);
        for (const forbidden of [">=", "<=", "==", "hhmm", "presence"]) {
          expect(amount).not.toContain(forbidden);
        }
      }
    });

    it("an unreadable line renders no chip rather than throwing at the student", () => {
      inLocale(locale);
      const rogue = line({
        unit: "not_a_unit",
        target_op: ">=",
        target_min: 1,
        measure: "dose",
      });
      expect(commitmentAmount(rogue)).toBe("");
    });
  });
}
