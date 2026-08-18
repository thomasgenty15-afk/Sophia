// KEEL — LA LANGUE DE LA SYNTHÈSE DU COACH.
//
// ── LE DÉFAUT, EN TROIS PIÈCES QUI SE CONFIRMAIENT L'UNE L'AUTRE ───────────
//   1. `renderSynthesisText` prenait `locale` et ne s'en servait QUE pour
//      jeter si ce n'était pas `"en"`;
//   2. son unique appelant de production lui passait `locale: "en"` EN DUR,
//      donc la garde était inatteignable et le paramètre décoratif;
//   3. la ligne `coach_syntheses.content_locale` écrite juste à côté était
//      semée `'en'` par un `??` — elle disait donc VRAI sur un texte anglais
//      que rien ne pouvait rendre autrement, ce qui rendait le défaut
//      invisible à toute vérification par la base.
//
// Le corps de `/coach/weekly` — l'artefact que le coach PAIE — était donc
// anglais pour tout le monde.
//
// ── CE QUE CES ÉPREUVES REFUSENT ───────────────────────────────────────────
// Un pack incomplet (une phrase anglaise au milieu d'un texte français), une
// fuite dans l'autre sens, un JETON de pouls rendu tel quel au milieu d'une
// phrase (« c'est hunger qui lâche »), et un CHIFFRE modifié par la
// traduction — l'en-tête du module dit pourquoi: un coach qui attrape un
// chiffre faux cesse de croire tous les autres.

import { assert, assertEquals, assertNotEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildCoachSynthesis,
  describeFlag,
  renderSynthesisText,
  type StudentWeekInput,
} from "./coach_synthesis.ts";
import type { WeekAdherenceInput } from "./adherence.ts";

const NOW = new Date("2026-08-03T09:00:00.000Z");
const WEEK = [
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
  "2026-08-01",
  "2026-08-02",
];

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3600_000).toISOString();
}

function adherenceInput(
  loggedDays: number,
  status: "met" | "missed" | "partial" = "met",
): WeekAdherenceInput {
  const days = WEEK.slice(0, loggedDays);
  return {
    weekDates: WEEK,
    evaluations: days.map((localDate) => ({
      commitmentId: "c1",
      localDate,
      grain: "day" as const,
      status,
      priority: "core" as const,
      countsTowardAdherence: true,
      expectedEvaluationsPerDay: 1,
    })),
    eventCountsByDate: Object.fromEntries(days.map((d) => [d, 2])),
  };
}

function student(over: Partial<StudentWeekInput> = {}): StudentWeekInput {
  return {
    studentUserId: "s1",
    displayName: "Julie",
    lastInboundAt: hoursAgo(3),
    adherence: adherenceInput(7),
    ...over,
  };
}

/** Des fragments que SEUL le pack anglais produit. Pas un détecteur de langue. */
const ENGLISH_ONLY = [
  "students this week",
  "student this week",
  "in touch",
  "slipping",
  "silent.",
  "How the week felt",
  "Nobody checked in enough",
  "built themselves a week",
  "Average adherence",
  "No adherence figure",
  "plates seen",
  "plate seen",
  "Nobody needs catching up",
  "To catch up:",
  "days ago",
  "no message for",
  "only logged",
  "hard days out of",
  "is logging, but",
  "has gone quiet",
  "quiet for",
];

function assertNoEnglishLeak(text: string, where: string): void {
  for (const fragment of ENGLISH_ONLY) {
    assert(
      !text.includes(fragment),
      `${where}: fuite EN « ${fragment} » dans un texte français —\n${text}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1. LES DEUX PACKS RENDENT, ET RENDENT DIFFÉREMMENT
// ---------------------------------------------------------------------------

Deno.test("la synthèse suit la locale — le corps de /coach/weekly n'est plus anglais d'office", () => {
  const synthesis = buildCoachSynthesis(
    [
      student({ studentUserId: "a", displayName: "Julie" }),
      student({
        studentUserId: "b",
        displayName: "Marc",
        lastInboundAt: hoursAgo(200),
        adherence: adherenceInput(1),
      }),
    ],
    NOW,
  );

  const en = renderSynthesisText(synthesis, { locale: "en-US" });
  const fr = renderSynthesisText(synthesis, { locale: "fr-FR" });
  assertNotEquals(en, fr);

  assert(en.includes("2 students this week"), en);
  assert(fr.includes("2 élèves cette semaine"), fr);
  assertNoEnglishLeak(fr, "synthèse fr-FR");

  // Le pack français DIT quelque chose: un pack vide passerait la ligne
  // au-dessus sans rien porter.
  assert(fr.split("\n").filter((l) => l.trim()).length >= 3, fr);
});

Deno.test("les CHIFFRES traversent les deux packs sans être touchés", () => {
  // L'en-tête du module: un coach qui attrape UN chiffre faux cesse de croire
  // tous les autres. Une traduction n'a aucun droit sur les nombres.
  const synthesis = buildCoachSynthesis(
    [
      student({ studentUserId: "a" }),
      student({ studentUserId: "b", displayName: "Marc" }),
      student({ studentUserId: "c", displayName: "Zoé", lastInboundAt: hoursAgo(200) }),
    ],
    NOW,
  );
  const en = renderSynthesisText(synthesis, { locale: "en-US" });
  const fr = renderSynthesisText(synthesis, { locale: "fr-FR" });
  const numbersOf = (text: string) => (text.match(/\d+/g) ?? []).join(",");
  assertEquals(numbersOf(en), numbersOf(fr));
});

Deno.test("la cohorte vide a sa phrase dans les deux langues", () => {
  const empty = buildCoachSynthesis([], NOW);
  const fr = renderSynthesisText(empty, { locale: "fr-FR" });
  const en = renderSynthesisText(empty, { locale: "en-US" });
  assert(fr.startsWith("Aucun élève"), fr);
  assert(en.startsWith("No students"), en);
  assertNoEnglishLeak(fr, "cohorte vide");
});

// ---------------------------------------------------------------------------
// 2. LE JETON DE POULS — traduit, jamais recopié au milieu d'une phrase
// ---------------------------------------------------------------------------

Deno.test("l'axe du pouls est TRADUIT dans la phrase, jamais laissé en jeton", () => {
  // `livability.dominantAxis` arrive en jeton (`hunger`) et s'insère au milieu
  // d'une phrase. Laissé tel quel, un coach français lit « c'est hunger qui
  // lâche ». C'est le seul endroit du module où un jeton R1 doit être traduit,
  // parce qu'il devient de la PROSE.
  const line = {
    studentUserId: "s1",
    displayName: "Julie",
    contact: "responsive" as const,
    hoursSinceContact: 3,
    riskBand: "at_risk" as const,
    flagReason: "week_too_hard" as const,
    adherence: {
      kind: "adherence" as const,
      corePct: 80,
      overallPct: 80,
      evaluableDays: 7,
      loggingCoverage: { loggedDays: 7, requiredDays: 4, meetsGate: true },
    },
    livability: {
      band: "hard" as const,
      hard: 4,
      taps: 5,
      dominantAxis: "hunger" as const,
    },
    weekPlan: null,
    composedMeals: 0,
    portionBands: [],
  } as never;

  const fr = describeFlag(line, "fr-FR");
  const en = describeFlag(line, "en-US");
  assert(fr.includes("la faim"), fr);
  assert(!fr.includes("hunger"), `le jeton a fui dans la prose française: ${fr}`);
  assert(en.includes("hunger"), en);
  // Les chiffres, eux, sont les mêmes des deux côtés.
  for (const text of [fr, en]) {
    assert(text.includes("4"), text);
    assert(text.includes("5"), text);
  }
});

Deno.test("un axe hors table est rendu TEL QUEL, il ne fait pas tomber la synthèse", () => {
  // Une table fermée qui jetterait sur un jeton inconnu ferait perdre la
  // synthèse ENTIÈRE d'un coach pour un axe qu'on n'a pas encore nommé.
  const line = {
    studentUserId: "s1",
    displayName: "Julie",
    contact: "responsive" as const,
    hoursSinceContact: 3,
    riskBand: "at_risk" as const,
    flagReason: "week_too_hard" as const,
    adherence: {
      kind: "adherence" as const,
      corePct: 80,
      overallPct: 80,
      evaluableDays: 7,
      loggingCoverage: { loggedDays: 7, requiredDays: 4, meetsGate: true },
    },
    livability: {
      band: "hard" as const,
      hard: 2,
      taps: 3,
      dominantAxis: "digestion",
    },
    weekPlan: null,
    composedMeals: 0,
    portionBands: [],
  } as never;
  assert(describeFlag(line, "fr-FR").includes("digestion"));
});

// ---------------------------------------------------------------------------
// 3. LES MOTIFS DE RATTRAPAGE — chacun dans les deux langues
// ---------------------------------------------------------------------------

Deno.test("chaque motif de rattrapage rend une phrase NON VIDE dans les deux langues", () => {
  const reasons = [
    "restriction_signal",
    "silent_5d",
    "coverage_below_gate",
    "week_too_hard",
    "no_evaluable_plan",
    "outcome_mismatch",
    "adherence_at_risk",
    "slipping_contact",
  ] as const;

  for (const flagReason of reasons) {
    for (const hoursSinceContact of [null, 120]) {
      const line = {
        studentUserId: "s1",
        displayName: "Julie",
        contact: "slipping" as const,
        hoursSinceContact,
        riskBand: "at_risk" as const,
        flagReason,
        adherence: {
          kind: "adherence" as const,
          corePct: 42,
          overallPct: 42,
          evaluableDays: 7,
          loggingCoverage: { loggedDays: 2, requiredDays: 4, meetsGate: false },
        },
        livability: { band: "hard" as const, hard: 3, taps: 4, dominantAxis: null },
        weekPlan: null,
        composedMeals: 0,
        portionBands: [],
      } as never;

      const fr = describeFlag(line, "fr-FR");
      const en = describeFlag(line, "en-US");
      assert(fr.trim().length > 10, `${flagReason}/fr vide`);
      assert(en.trim().length > 10, `${flagReason}/en vide`);
      assertNotEquals(fr, en, `${flagReason}: même phrase dans les deux packs`);
      assert(!fr.includes("undefined"), `${flagReason}/fr`);
      assertNoEnglishLeak(fr, `describeFlag/${flagReason}`);
    }
  }
});

Deno.test("le nom de repli d'un élève sans nom vit dans CHAQUE pack", () => {
  // Il était `"A student"`, littéral anglais dans une fonction sans locale.
  const synthesis = buildCoachSynthesis(
    [
      student({ studentUserId: "a", displayName: null, lastInboundAt: hoursAgo(300) }),
    ],
    NOW,
  );
  const fr = renderSynthesisText(synthesis, { locale: "fr-FR" });
  const en = renderSynthesisText(synthesis, { locale: "en-US" });
  assert(fr.includes("Un élève:"), fr);
  assert(en.includes("A student:"), en);
});

// ---------------------------------------------------------------------------
// 4. R7 — ce qui est protégé n'a pas changé
// ---------------------------------------------------------------------------

Deno.test("R7 — une langue NON LIVRÉE jette encore, au même endroit du flux", () => {
  const synthesis = buildCoachSynthesis([student()], NOW);
  assertThrows(() => renderSynthesisText(synthesis, { locale: "de-DE" }));
  assertThrows(() => renderSynthesisText(synthesis, { locale: "pt-BR" }));
  // Et le motif de rattrapage aussi: une phrase anglaise au milieu d'une
  // synthèse française serait la sortie « à moitié traduite » que R7 interdit.
  assertThrows(() =>
    describeFlag(
      {
        flagReason: "outcome_mismatch",
        hoursSinceContact: null,
        adherence: {
          kind: "adherence",
          loggingCoverage: { loggedDays: 0, requiredDays: 4, meetsGate: false },
        },
        livability: { band: "hard", hard: 0, taps: 0, dominantAxis: null },
      } as never,
      "de-DE",
    )
  );
});
