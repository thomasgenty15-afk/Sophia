import { assertEquals } from "jsr:@std/assert@1";

import {
  LAPSE_DAYS,
  LAPSE_MIN_PLANS,
  type LapseFacts,
  lapseEpisodeKey,
  renderLapseEmail,
} from "./lifecycle_lapse.ts";
import { assertNoForbiddenClaim } from "./lifecycle_copy_guard.ts";

// FF-063 LOT 6 — LE DÉCROCHAGE LONG.

const TODAY = "2026-09-12";
const NOW = new Date("2026-09-12T08:00:00Z");
const DAY = 24 * 3_600_000;

function facts(over: Partial<LapseFacts> = {}): LapseFacts {
  return {
    livePlanCount: 4,
    lastCoveredDay: "2026-08-20", // 23 jours avant TODAY
    lastSeenAt: null,
    ...over,
  };
}

Deno.test("décrochage — il faut une HABITUDE, pas un essai", () => {
  assertEquals(lapseEpisodeKey(facts(), TODAY, NOW), "2026-08-20");
  for (const count of [0, 1, 2]) {
    assertEquals(
      lapseEpisodeKey(facts({ livePlanCount: count }), TODAY, NOW),
      null,
      `${count} plan(s) ne fait pas une habitude`,
    );
  }
  assertEquals(lapseEpisodeKey(facts({ livePlanCount: LAPSE_MIN_PLANS }), TODAY, NOW), "2026-08-20");
});

Deno.test("décrochage — quatorze jours, et pas treize", () => {
  // 13 jours: c'est encore la fin de couverture qui parle.
  assertEquals(
    lapseEpisodeKey(facts({ lastCoveredDay: "2026-08-30" }), TODAY, NOW),
    null,
  );
  // 14 jours pile.
  assertEquals(
    lapseEpisodeKey(facts({ lastCoveredDay: "2026-08-29" }), TODAY, NOW),
    "2026-08-29",
  );
  assertEquals(LAPSE_DAYS, 14);
});

Deno.test("décrochage — quelqu'un qui PASSE encore n'a pas décroché", () => {
  // Il n'a pas recomposé; ce n'est pas la même chose, et une seule des deux
  // mérite « qu'est-ce qui a changé ? ».
  assertEquals(
    lapseEpisodeKey(
      facts({ lastSeenAt: new Date(NOW.getTime() - 2 * DAY).toISOString() }),
      TODAY,
      NOW,
    ),
    null,
  );
  // Vu il y a plus de quatorze jours: le silence est complet.
  assertEquals(
    lapseEpisodeKey(
      facts({ lastSeenAt: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
      TODAY,
      NOW,
    ),
    "2026-08-20",
  );
});

Deno.test("décrochage — `last_seen_at` NULL ne veut PAS dire « jamais venu »", () => {
  // ⚠️ La colonne n'existe que depuis le 2026-09-09: tout compte antérieur la
  // porte vide. La lire comme une absence enverrait ce message à toute la base
  // d'un coup. `null` = jamais mesuré, et un fait jamais mesuré ne retient
  // rien — c'est la couverture qui décide alors, seule.
  assertEquals(lapseEpisodeKey(facts({ lastSeenAt: null }), TODAY, NOW), "2026-08-20");
  // Une valeur illisible se comporte comme `null`, pour la même raison.
  assertEquals(
    lapseEpisodeKey(facts({ lastSeenAt: "pas une date" }), TODAY, NOW),
    "2026-08-20",
  );
});

Deno.test("décrochage — LA CLÉ D'ÉPISODE se réarme quand un plan naît", () => {
  // C'est tout le mécanisme anti-verrou: la dédup porte sur cette clé, et un
  // nouveau plan donne un nouveau `ends_on`. Aucune table d'épisodes, donc
  // aucun épisode qui reste ouvert pour toujours — le défaut mesuré de
  // `reengagement_episodes`.
  const first = lapseEpisodeKey(facts({ lastCoveredDay: "2026-08-20" }), TODAY, NOW);
  const second = lapseEpisodeKey(facts({ lastCoveredDay: "2026-08-25" }), TODAY, NOW);
  assertEquals(first, "2026-08-20");
  assertEquals(second, "2026-08-25");
  assertEquals(first === second, false);
});

const ARGS = {
  firstName: "Marc",
  planCount: 6,
  unsubscribeUrl: "https://sophia-coach.ai/unsubscribe?token=abc&lang=fr",
  locale: "fr-FR",
};

Deno.test("copie — les deux packs respectent LEGAL.md §6", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const r = renderLapseEmail({ ...ARGS, locale });
    assertNoForbiddenClaim(r.subject, `sujet ${locale}`);
    assertNoForbiddenClaim(r.html, `corps ${locale}`);
  }
});

Deno.test("copie — ⛔ AUCUN BOUTON, et le passé est NOMMÉ", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const { html } = renderLapseEmail({ ...ARGS, locale });
    // Le seul `<a>` est celui du pied de désinscription. Quelqu'un qui a
    // composé six plans sait où est le bouton; le lui remontrer, c'est
    // répondre à « qu'est-ce qui s'est passé ? » par « reviens ».
    assertEquals((html.match(/<a\s/g) ?? []).length, 1, `liens en trop (${locale})`);
    // Le chiffre est là: on nomme le passé, on ne l'évoque pas.
    assertEquals(html.includes("6"), true, `le nombre de plans manque (${locale})`);
  }
});

Deno.test("copie — le pack anglais ne laisse fuir aucun français", () => {
  const en = renderLapseEmail({ ...ARGS, locale: "en-US" });
  for (const marker of ["Qu'est-ce qui", "composé", "Réponds", "Ne plus recevoir"]) {
    assertEquals(
      `${en.subject} ${en.html}`.includes(marker),
      false,
      `« ${marker} » a fuité`,
    );
  }
  assertEquals(en.subject, "What changed?");
  assertEquals(en.html.includes("Stop these emails"), true);
});

Deno.test("copie — sans prénom, chaque pack rend SA salutation", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const { html } = renderLapseEmail({ ...ARGS, firstName: null, locale });
    assertEquals(html.includes("<p>Hello,</p>"), true);
    assertEquals(html.includes("null"), false);
  }
});
