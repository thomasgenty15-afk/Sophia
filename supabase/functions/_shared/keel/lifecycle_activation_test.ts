import { assertEquals } from "jsr:@std/assert@1";

import {
  type ActivationFacts,
  activationSegmentFor,
  renderActivationEmail,
} from "./lifecycle_activation.ts";
import { assertNoForbiddenClaim } from "./lifecycle_copy_guard.ts";

// FF-063 LOT 5 — L'ACTIVATION.
//
// Deux trous, trois e-mails, et une phrase qu'on n'a pas le droit d'écrire.

const TODAY = "2026-09-12";
const NOW = new Date("2026-09-12T08:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function facts(over: Partial<ActivationFacts> = {}): ActivationFacts {
  return {
    confirmedAt: null,
    hasGoals: false,
    livePlanCount: 0,
    lastCoveredDay: null,
    hasAnyTrace: false,
    ...over,
  };
}

function agoIso(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

Deno.test("entonnoir — une adresse NON CONFIRMÉE ne reçoit rien", () => {
  // Elle n'a jamais reçu le mail de bienvenue: « tu n'as pas fini » serait le
  // premier mot qu'on lui adresse, et il parlerait d'un échec.
  assertEquals(
    activationSegmentFor(facts({ confirmedAt: null }), TODAY, NOW),
    null,
  );
});

Deno.test("entonnoir — H+24, et les deux bords de la fenêtre", () => {
  const cases: ReadonlyArray<[number, string | null]> = [
    [12 * HOUR, null], // trop tôt: la personne vient de s'inscrire
    [23 * HOUR, null],
    [25 * HOUR, "funnel_unfinished_h24"],
    [47 * HOUR, "funnel_unfinished_h24"],
    [49 * HOUR, null], // passé: le job repasse chaque jour, elle a eu son tour
    [5 * DAY, null],
  ];
  for (const [age, expected] of cases) {
    assertEquals(
      activationSegmentFor(
        facts({ confirmedAt: agoIso(age) }),
        TODAY,
        NOW,
      ),
      expected,
      `mauvais verdict à ${age / HOUR} h`,
    );
  }
});

Deno.test("entonnoir — J+7, la question, et rien après", () => {
  const cases: ReadonlyArray<[number, string | null]> = [
    [6 * DAY, null],
    [7 * DAY + HOUR, "funnel_unfinished_d7"],
    [7 * DAY + 23 * HOUR, "funnel_unfinished_d7"],
    [8 * DAY + HOUR, null],
    [30 * DAY, null], // au-delà, on s'arrête. Trois e-mails, pas quatre.
  ];
  for (const [age, expected] of cases) {
    assertEquals(
      activationSegmentFor(facts({ confirmedAt: agoIso(age) }), TODAY, NOW),
      expected,
      `mauvais verdict à ${age / DAY} jours`,
    );
  }
});

Deno.test("entonnoir — une date de confirmation illisible ne déclenche rien", () => {
  assertEquals(
    activationSegmentFor(facts({ confirmedAt: "pas une date" }), TODAY, NOW),
    null,
  );
});

Deno.test("premier plan — le silence complet, et lui seul", () => {
  const base = {
    hasGoals: true,
    livePlanCount: 1,
    lastCoveredDay: "2026-09-11",
    hasAnyTrace: false,
  };
  assertEquals(
    activationSegmentFor(facts(base), TODAY, NOW),
    "first_plan_no_trace",
  );

  // Une seule case cochée suffit à sortir: la personne a répondu, la question
  // n'a plus lieu d'être.
  assertEquals(
    activationSegmentFor(facts({ ...base, hasAnyTrace: true }), TODAY, NOW),
    null,
  );
  // Un second plan: on n'est plus dans le premier pas, mais dans la couverture.
  assertEquals(
    activationSegmentFor(facts({ ...base, livePlanCount: 2 }), TODAY, NOW),
    null,
  );
  // Le plan couvre encore: rien à demander, il n'est pas fini.
  assertEquals(
    activationSegmentFor(
      facts({ ...base, lastCoveredDay: "2026-09-12" }),
      TODAY,
      NOW,
    ),
    null,
  );
  assertEquals(
    activationSegmentFor(
      facts({ ...base, lastCoveredDay: "2026-09-20" }),
      TODAY,
      NOW,
    ),
    null,
  );
  // Objectif posé mais aucun plan: ce n'est pas ce segment.
  assertEquals(
    activationSegmentFor(
      facts({ hasGoals: true, livePlanCount: 0 }),
      TODAY,
      NOW,
    ),
    null,
  );
});

const ARGS = {
  firstName: "Marc",
  setupUrl: "https://sophia-coach.ai/app/setup",
  unsubscribeUrl: "https://sophia-coach.ai/unsubscribe?token=abc&lang=fr",
  locale: "fr-FR",
};

const SEGMENTS = [
  "funnel_unfinished_h24",
  "funnel_unfinished_d7",
  "first_plan_no_trace",
] as const;

Deno.test("copie — les six packs respectent LEGAL.md §6", () => {
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      const r = renderActivationEmail(segment, { ...ARGS, locale });
      assertNoForbiddenClaim(r.subject, `sujet ${segment} ${locale}`);
      assertNoForbiddenClaim(r.html, `corps ${segment} ${locale}`);
    }
  }
});

Deno.test("copie — ⛔ NE DIT JAMAIS « tu n'es pas revenu »", () => {
  // Le produit ne le sait pas: lire son plan ne laisse AUCUNE trace. Cette
  // phrase serait fausse pour quiconque a ouvert son plan tous les matins sans
  // toucher une case — c'est-à-dire pour l'usage nominal.
  const forbidden = [
    "tu n'es pas revenu",
    "tu ne reviens plus",
    "on ne te voit plus",
    "you have not been back",
    "we have not seen you",
    "you stopped using",
  ];
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      const { html, subject } = renderActivationEmail(segment, { ...ARGS, locale });
      const text = `${subject} ${html}`.toLowerCase();
      for (const phrase of forbidden) {
        assertEquals(
          text.includes(phrase),
          false,
          `« ${phrase} » — ${segment} / ${locale}`,
        );
      }
      assertEquals(text.includes("keel"), false, `« keel » — ${segment}/${locale}`);
    }
  }
});

Deno.test("copie — H+24 porte un bouton, J+7 et « as-tu cuisiné » n'en portent AUCUN", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    // La relance a un bouton: elle demande un geste.
    const h24 = renderActivationEmail("funnel_unfinished_h24", { ...ARGS, locale });
    assertEquals(h24.html.includes(ARGS.setupUrl), true, `H+24 sans lien (${locale})`);

    // Les deux QUESTIONS n'en ont pas. Un bouton transformerait la question en
    // relance, et une question avec un bouton n'obtient pas de réponse.
    for (const segment of ["funnel_unfinished_d7", "first_plan_no_trace"] as const) {
      const { html } = renderActivationEmail(segment, { ...ARGS, locale });
      // Le seul `<a>` autorisé est celui du pied de désinscription.
      const links = html.match(/<a\s/g) ?? [];
      assertEquals(links.length, 1, `${segment} porte ${links.length} liens (${locale})`);
      assertEquals(html.includes(ARGS.unsubscribeUrl), true);
      assertEquals(html.includes(ARGS.setupUrl), false, `${segment} pointe l'app`);
    }
  }
});

Deno.test("copie — la sortie est là dans les six", () => {
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      const { html } = renderActivationEmail(segment, { ...ARGS, locale });
      assertEquals(html.includes(ARGS.unsubscribeUrl), true, `${segment}/${locale}`);
    }
  }
});

Deno.test("copie — le pack anglais ne laisse fuir aucun français", () => {
  const markers = ["Il te reste", "Reprendre", "Qu'est-ce qui", "cuisiné", "Ne plus recevoir"];
  for (const segment of SEGMENTS) {
    const en = renderActivationEmail(segment, { ...ARGS, locale: "en-US" });
    for (const marker of markers) {
      assertEquals(
        `${en.subject} ${en.html}`.includes(marker),
        false,
        `« ${marker} » a fuité — ${segment}`,
      );
    }
    assertEquals(en.html.includes("Stop these emails"), true);
  }
});

Deno.test("copie — les six sujets sont distincts", () => {
  const subjects = new Set<string>();
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      subjects.add(renderActivationEmail(segment, { ...ARGS, locale }).subject);
    }
  }
  assertEquals(subjects.size, 6);
});

Deno.test("copie — sans prénom, chaque pack rend SA salutation", () => {
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      const { html } = renderActivationEmail(segment, {
        ...ARGS,
        firstName: null,
        locale,
      });
      assertEquals(html.includes("<p>Hello,</p>"), true, `${segment}/${locale}`);
      assertEquals(html.includes("null"), false);
    }
  }
});
