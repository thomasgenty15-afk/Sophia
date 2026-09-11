import { assertEquals } from "jsr:@std/assert@1";

import {
  renderTrialEmail,
  type TrialFacts,
  trialSegmentFor,
} from "./lifecycle_trial.ts";
import { assertNoForbiddenClaim } from "./lifecycle_copy_guard.ts";

// FF-063 LOT 8 — LA FIN D'ESSAI, ET LE PIÈGE DES DEUX HORLOGES.

const TODAY = "2026-09-12";

function facts(over: Partial<TrialFacts> = {}): TrialFacts {
  return {
    householdCovered: null,
    trialLastDay: "2026-09-13",
    hasPaidSubscription: false,
    ...over,
  };
}

// ⛔ CE MODULE NE LIT PLUS LA COLONNE DE COUVERTURE DU FOYER, ET LA GARDE QUI
// LE VÉRIFIE N'EST PAS ICI.
//
// `household_freeze_test.ts:334` — « personne ne relit cette colonne hors de la
// facturation » — balaie TOUTES les sources de fonctions et refuse tout lecteur
// TypeScript hors du chemin de facturation. Elle a mordu sur ce lot au premier
// run, et c'est elle qui a fait déménager la résolution « quelle horloge, quel
// jour » vers SQL (migration 20260910160000).
//
// ⚠️ NE PAS EN ÉCRIRE UNE SECONDE ICI. Une assertion du genre
// `assert(!src.includes(<le nom de la colonne>))` doit ÉCRIRE ce nom pour le
// chercher — et devient donc elle-même le contrevenant que la garde du dépôt
// signale. Mesuré: ce fichier a été le seul offender du run suivant.

Deno.test("essai — rien à annoncer ⇒ silence, quelle qu'en soit la raison", () => {
  // `null` fond trois situations qui appellent le même silence: aucun essai
  // posé, foyer couvert sans limite (`free_until IS NULL` veut dire COUVERT,
  // jamais expiré), ou date illisible. SQL les a déjà fondues, et c'est ce qui
  // empêche une lecture naïve d'écrire « ton essai se termine demain » à tous
  // les foyers d'avant le 2026-08-11, le même jour.
  assertEquals(trialSegmentFor(facts({ trialLastDay: null }), TODAY), null);
  assertEquals(
    trialSegmentFor(
      facts({ householdCovered: true, trialLastDay: null }),
      TODAY,
    ),
    null,
  );
  // Une date illisible ne fait pas tomber le balayage.
  assertEquals(
    trialSegmentFor(facts({ trialLastDay: "pas une date" }), TODAY),
    null,
  );
});

Deno.test("essai — J−1, J+1, J+4, et rien d'autre", () => {
  const cases: ReadonlyArray<[string, string | null]> = [
    ["2026-09-14", null], // J−2
    ["2026-09-13", "trial_ends_tomorrow"],
    ["2026-09-12", null], // dernier jour: encore couvert
    ["2026-09-11", "trial_ended_d1"],
    ["2026-09-10", null], // J+2
    ["2026-09-09", null], // J+3
    ["2026-09-08", "trial_ended_d4"],
    ["2026-09-07", null], // J+5: l'ancienne quatrième étape ne revient pas
  ];
  for (const [day, expected] of cases) {
    assertEquals(
      trialSegmentFor(facts({ householdCovered: true, trialLastDay: day }), TODAY),
      expected,
      `mauvais verdict pour ${day}`,
    );
  }
});

Deno.test("essai — quelqu'un qui PAIE n'entend jamais parler de fin d'essai", () => {
  // Le pire e-mail de la séquence à envoyer par erreur. Relu à chaque
  // candidat, jamais mis en cache.
  assertEquals(
    trialSegmentFor(
      facts({ householdCovered: true, hasPaidSubscription: true }),
      TODAY,
    ),
    null,
  );
});

const ARGS = {
  firstName: "Marc",
  lastDay: "2026-09-13",
  upgradeUrl: "https://sophia-coach.ai/upgrade",
  unsubscribeUrl: "https://sophia-coach.ai/unsubscribe?token=abc&lang=fr",
  locale: "fr-FR",
};

const SEGMENTS = ["trial_ends_tomorrow", "trial_ended_d1", "trial_ended_d4"] as const;

Deno.test("copie — les six packs respectent LEGAL.md §6", () => {
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      const r = renderTrialEmail(segment, { ...ARGS, locale });
      assertNoForbiddenClaim(r.subject, `sujet ${segment} ${locale}`);
      assertNoForbiddenClaim(r.html, `corps ${segment} ${locale}`);
    }
  }
});

Deno.test("copie — les deux premiers vendent, le troisième DEMANDE", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    for (const segment of ["trial_ends_tomorrow", "trial_ended_d1"] as const) {
      const { html } = renderTrialEmail(segment, { ...ARGS, locale });
      assertEquals(html.includes(ARGS.upgradeUrl), true, `${segment} sans lien (${locale})`);
    }
    // À J+4, quelqu'un qui n'a pas repris a décidé. Un bouton de plus ne le
    // fera pas changer d'avis; une question peut apprendre quelque chose.
    const last = renderTrialEmail("trial_ended_d4", { ...ARGS, locale });
    assertEquals((last.html.match(/<a\s/g) ?? []).length, 1, `J+4 a un bouton (${locale})`);
    assertEquals(last.html.includes(ARGS.upgradeUrl), false);
  }
});

Deno.test("copie — dit ce qui RESTE, jamais ce qui est perdu", () => {
  // La fin d'un essai est un fait de facturation, pas une menace. Personne ne
  // doit croire que ses données partent avec.
  for (const segment of ["trial_ends_tomorrow", "trial_ended_d1"] as const) {
    const fr = renderTrialEmail(segment, { ...ARGS, locale: "fr-FR" });
    assertEquals(fr.html.includes("intact"), true, `${segment} ne rassure pas`);
    const en = renderTrialEmail(segment, { ...ARGS, locale: "en-US" });
    assertEquals(
      en.html.includes("stays put") || en.html.includes("untouched"),
      true,
      `${segment} ne rassure pas (en)`,
    );
  }
});

Deno.test("copie — le pack anglais ne laisse fuir aucun français", () => {
  const markers = ["Ton essai", "Reprendre", "Qu'est-ce", "manqué", "Ne plus recevoir"];
  for (const segment of SEGMENTS) {
    const en = renderTrialEmail(segment, { ...ARGS, locale: "en-US" });
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
      subjects.add(renderTrialEmail(segment, { ...ARGS, locale }).subject);
    }
  }
  assertEquals(subjects.size, 6);
});

Deno.test("copie — la date est écrite dans la langue du compte", () => {
  assertEquals(
    renderTrialEmail("trial_ends_tomorrow", ARGS).html.includes("dimanche 13 septembre"),
    true,
  );
  assertEquals(
    renderTrialEmail("trial_ends_tomorrow", { ...ARGS, locale: "en-US" }).html
      .includes("Sunday 13 September"),
    true,
  );
});
