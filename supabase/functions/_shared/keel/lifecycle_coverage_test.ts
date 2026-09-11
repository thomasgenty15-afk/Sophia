import { assertEquals } from "jsr:@std/assert@1";

import {
  coverageSegmentFor,
  renderCoverageEmail,
} from "./lifecycle_coverage.ts";
import { formatLocalDay } from "./lifecycle_email.ts";
import { assertNoForbiddenClaim } from "./lifecycle_copy_guard.ts";

// FF-063 LOT 4 — LA FIN DE COUVERTURE.
//
// Le curseur de toute la séquence. Ce qui se joue ici n'est pas « est-ce que
// la relance part », c'est « est-ce qu'elle part au bon moment » — et la
// bonne réponse est celle qui SE TAIT pendant qu'un plan couvre.

const TODAY = "2026-09-12";

Deno.test("couverture — jamais rien à dire à qui n'a jamais composé", () => {
  // Ces gens-là relèvent de l'activation, pas d'une fin de plan. Confondre les
  // deux enverrait « ton plan se termine » à quelqu'un qui n'en a jamais eu.
  assertEquals(
    coverageSegmentFor({ lastCoveredDay: null, hasFuturePlan: false }, TODAY),
    null,
  );
});

Deno.test("couverture — LE SILENCE PENDANT QUE LE PLAN COUVRE", () => {
  // Le cœur de la conception. Quelqu'un qui a composé sept jours et qui
  // cuisine tous les soirs ne doit rien recevoir pendant ces sept jours: il
  // n'est pas absent, il est COUVERT. C'est le comportement nominal du
  // produit, et une séquence bâtie sur le silence le prendrait pour un
  // décrochage.
  for (const day of ["2026-09-19", "2026-09-15", "2026-09-13", "2026-09-12"]) {
    assertEquals(
      coverageSegmentFor({ lastCoveredDay: day, hasFuturePlan: false }, TODAY),
      day === "2026-09-13" ? "coverage_ends_tomorrow" : null,
      `mauvais verdict pour une couverture jusqu'au ${day}`,
    );
  }
});

Deno.test("couverture — J−1 et J+3, et rien entre les deux", () => {
  const cases: ReadonlyArray<[string, string | null]> = [
    ["2026-09-13", "coverage_ends_tomorrow"], // demain
    ["2026-09-12", null], // aujourd'hui: encore couvert
    ["2026-09-11", null], // fini hier: prendre un jour n'est pas décrocher
    ["2026-09-10", null], // J+2
    ["2026-09-09", "coverage_lapsed_d3"], // J+3
    ["2026-09-08", null], // J+4: au-delà, c'est `long_lapse_d14` qui parlera
    ["2026-08-12", null],
  ];
  for (const [day, expected] of cases) {
    assertEquals(
      coverageSegmentFor({ lastCoveredDay: day, hasFuturePlan: false }, TODAY),
      expected,
      `mauvais verdict pour ${day}`,
    );
  }
});

Deno.test("couverture — un plan À VENIR ferme la bouche, même à J−1", () => {
  // ⚠️ LA GARDE QUI N'EST PAS REDONDANTE. Un plan d'UN JOUR qui commence
  // demain a `ends_on` = demain: il fait donc valoir « couverture jusqu'à
  // demain », et sans ce test on écrirait « il n'y a rien de prévu après
  // demain » à quelqu'un qui vient précisément de prévoir demain.
  assertEquals(
    coverageSegmentFor(
      { lastCoveredDay: "2026-09-13", hasFuturePlan: true },
      TODAY,
    ),
    null,
  );
  assertEquals(
    coverageSegmentFor(
      { lastCoveredDay: "2026-09-09", hasFuturePlan: true },
      TODAY,
    ),
    null,
  );
});

Deno.test("jour local — la date ne se décale PAS d'un fuseau", () => {
  // Le défaut que `formatLocalDay` existe pour ne pas commettre: `ends_on` est
  // un `date`, déjà local. Le formater dans un fuseau le décalerait une
  // seconde fois — `new Date("2026-09-13")` vaut minuit UTC, rendu à New York
  // ça donne le 12, et l'e-mail annonce la veille.
  assertEquals(formatLocalDay("2026-09-13", "fr-FR"), "dimanche 13 septembre");
  assertEquals(formatLocalDay("2026-09-13", "en-US"), "Sunday 13 September");
  assertEquals(formatLocalDay("2026-09-01", "fr-FR"), "mardi 1 septembre");
  // Une date illisible se rend telle quelle plutôt que « Invalid Date ».
  assertEquals(formatLocalDay("pas-une-date", "fr-FR"), "pas-une-date");
});

const ARGS = {
  firstName: "Marc",
  lastCoveredDay: "2026-09-13",
  planUrl: "https://sophia-coach.ai/app/plan",
  unsubscribeUrl: "https://sophia-coach.ai/unsubscribe?token=abc&lang=fr",
  locale: "fr-FR",
};

Deno.test("copie — les quatre packs respectent LEGAL.md §6", () => {
  for (const segment of ["coverage_ends_tomorrow", "coverage_lapsed_d3"] as const) {
    for (const locale of ["fr-FR", "en-US"]) {
      const r = renderCoverageEmail(segment, { ...ARGS, locale });
      assertNoForbiddenClaim(r.subject, `sujet ${segment} ${locale}`);
      assertNoForbiddenClaim(r.html, `corps ${segment} ${locale}`);
    }
  }
});

Deno.test("copie — AUCUNE ne fait attendre", () => {
  // La conséquence la plus souvent violée du modèle: « ton plan est en cours
  // de préparation » est faux. C'est la personne qui compose; l'e-mail rouvre
  // une porte, il n'annonce jamais un travail en train de se faire.
  const waiting = [
    "prépare",
    "préparation",
    "en cours",
    "bientôt",
    "is preparing",
    "coming soon",
    "we are building",
  ];
  for (const segment of ["coverage_ends_tomorrow", "coverage_lapsed_d3"] as const) {
    for (const locale of ["fr-FR", "en-US"]) {
      const { html, subject } = renderCoverageEmail(segment, { ...ARGS, locale });
      const text = `${subject} ${html}`.toLowerCase();
      for (const word of waiting) {
        assertEquals(
          text.includes(word),
          false,
          `« ${word} » fait attendre — ${segment} / ${locale}`,
        );
      }
      // Et le nom de code interne ne sort sur aucune surface lue.
      assertEquals(text.includes("keel"), false, `« keel » — ${segment} / ${locale}`);
    }
  }
});

Deno.test("copie — le lien du plan et la sortie sont là, partout", () => {
  for (const segment of ["coverage_ends_tomorrow", "coverage_lapsed_d3"] as const) {
    for (const locale of ["fr-FR", "en-US"]) {
      const { html } = renderCoverageEmail(segment, { ...ARGS, locale });
      assertEquals(html.includes(ARGS.planUrl), true, `plan ${segment}/${locale}`);
      assertEquals(
        html.includes(ARGS.unsubscribeUrl),
        true,
        `sortie ${segment}/${locale}`,
      );
    }
  }
});

Deno.test("copie — la date est écrite dans la langue du compte", () => {
  const fr = renderCoverageEmail("coverage_ends_tomorrow", ARGS);
  assertEquals(fr.html.includes("dimanche 13 septembre"), true);

  const en = renderCoverageEmail("coverage_ends_tomorrow", {
    ...ARGS,
    locale: "en-US",
  });
  assertEquals(en.html.includes("Sunday 13 September"), true);
  assertEquals(en.html.includes("dimanche"), false);
});

Deno.test("copie — le pack anglais ne laisse fuir aucun français", () => {
  const markers = [
    "Ton plan",
    "Composer",
    "Trois jours",
    "réponds",
    "Ne plus recevoir",
  ];
  for (const segment of ["coverage_ends_tomorrow", "coverage_lapsed_d3"] as const) {
    const en = renderCoverageEmail(segment, { ...ARGS, locale: "en-US" });
    for (const marker of markers) {
      assertEquals(
        `${en.subject} ${en.html}`.includes(marker),
        false,
        `« ${marker} » a fuité — ${segment}`,
      );
    }
    // Bidirectionnel: une consigne d'action PROPRE à l'anglais doit être là.
    assertEquals(en.html.includes("Stop these emails"), true);
  }
});

Deno.test("copie — les quatre sujets sont distincts", () => {
  const subjects = new Set<string>();
  for (const segment of ["coverage_ends_tomorrow", "coverage_lapsed_d3"] as const) {
    for (const locale of ["fr-FR", "en-US"]) {
      subjects.add(renderCoverageEmail(segment, { ...ARGS, locale }).subject);
    }
  }
  // Deux sujets identiques dans une boîte de réception se lisent comme un
  // doublon, et c'est le premier signalement de spam.
  assertEquals(subjects.size, 4);
});

Deno.test("copie — sans prénom, chaque pack rend SA salutation", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const { html } = renderCoverageEmail("coverage_lapsed_d3", {
      ...ARGS,
      firstName: null,
      locale,
    });
    assertEquals(html.includes("<p>Hello,</p>"), true);
    assertEquals(html.includes("null"), false);
  }
});
