import { assertEquals } from "jsr:@std/assert@1";

import {
  cancelSegmentFor,
  renderCancelEmail,
  type SubscriptionState,
} from "./lifecycle_cancel.ts";
import { assertNoForbiddenClaim } from "./lifecycle_copy_guard.ts";

// FF-063 LOT 7 — LE DÉSABONNEMENT.

function st(over: Partial<SubscriptionState> = {}): SubscriptionState {
  return { status: "active", cancelAtPeriodEnd: false, ...over };
}

Deno.test("annulation — l'INTENTION est une bascule, pas un état", () => {
  // C'est le passage `false -> true` qui compte. Stripe réémet le même état
  // plusieurs fois pour un seul changement; sans la comparaison, chaque
  // réémission serait une nouvelle annulation.
  assertEquals(
    cancelSegmentFor(st(), st({ cancelAtPeriodEnd: true })),
    "cancel_intent",
  );
  assertEquals(
    cancelSegmentFor(st({ cancelAtPeriodEnd: true }), st({ cancelAtPeriodEnd: true })),
    null,
  );
  // Et une reprise (`true -> false`) n'est pas une annulation.
  assertEquals(
    cancelSegmentFor(st({ cancelAtPeriodEnd: true }), st()),
    null,
  );
});

Deno.test("annulation — l'EFFET est le passage à `canceled`", () => {
  assertEquals(
    cancelSegmentFor(st(), st({ status: "canceled" })),
    "cancel_effective",
  );
  assertEquals(
    cancelSegmentFor(st({ status: "canceled" }), st({ status: "canceled" })),
    null,
  );
  // Stripe majuscule parfois; la comparaison est insensible à la casse.
  assertEquals(
    cancelSegmentFor(st(), st({ status: "CANCELED" })),
    "cancel_effective",
  );
});

Deno.test("annulation — l'EFFET passe devant l'INTENTION", () => {
  // Les deux basculent sur le même événement quand quelqu'un annule
  // immédiatement. On n'annonce pas « tu as décidé d'arrêter » à quelqu'un dont
  // l'accès vient de se couper.
  assertEquals(
    cancelSegmentFor(st(), st({ status: "canceled", cancelAtPeriodEnd: true })),
    "cancel_effective",
  );
});

Deno.test("annulation — un abonnement qui NAÎT annulé n'avertit personne", () => {
  // `prev = null` veut dire qu'aucune ligne n'existait. Ce n'est pas une
  // annulation, c'est un état initial bizarre.
  assertEquals(cancelSegmentFor(null, st({ status: "canceled" })), null);
  assertEquals(cancelSegmentFor(null, st({ cancelAtPeriodEnd: true })), null);
});

Deno.test("annulation — le drapeau qui bouge sur un abonnement MORT ne dit rien", () => {
  assertEquals(
    cancelSegmentFor(
      st({ status: "canceled" }),
      st({ status: "canceled", cancelAtPeriodEnd: true }),
    ),
    null,
  );
});

const ARGS = {
  firstName: "Marc",
  unsubscribeUrl: "https://sophia-coach.ai/unsubscribe?token=abc&lang=fr",
  locale: "fr-FR",
};

const SEGMENTS = ["cancel_intent", "cancel_effective"] as const;

Deno.test("copie — les quatre packs respectent LEGAL.md §6", () => {
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      const r = renderCancelEmail(segment, { ...ARGS, locale });
      assertNoForbiddenClaim(r.subject, `sujet ${segment} ${locale}`);
      assertNoForbiddenClaim(r.html, `corps ${segment} ${locale}`);
    }
  }
});

Deno.test("copie — ⛔ ON NE RETIENT PAS, ET ON NE SE PLAINT PAS", () => {
  // L'arbitrage central du module. Un e-mail de rétention envoyé dans la
  // minute où quelqu'un clique « annuler » transforme une décision en
  // négociation; et « on est triste de te voir partir » déplace le sujet sur
  // nous au moment où on lui demande un service.
  const forbidden = [
    "reste avec", "reviens", "offre", "réduction", "remise",
    "triste", "tu vas nous manquer", "on est déçu",
    "stay with", "come back", "discount", "special offer",
    "sad to see you go", "we'll miss you", "sorry to see",
  ];
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      const { html, subject } = renderCancelEmail(segment, { ...ARGS, locale });
      const text = `${subject} ${html}`.toLowerCase();
      for (const phrase of forbidden) {
        assertEquals(text.includes(phrase), false, `« ${phrase} » — ${segment}/${locale}`);
      }
      assertEquals(text.includes("keel"), false, `« keel » — ${segment}/${locale}`);
      // AUCUN bouton dans les deux: le seul `<a>` est la désinscription.
      assertEquals(
        (html.match(/<a\s/g) ?? []).length,
        1,
        `${segment} porte un bouton (${locale})`,
      );
    }
  }
});

Deno.test("copie — l'EFFET dit ce qui RESTE, et où le récupérer", () => {
  const fr = renderCancelEmail("cancel_effective", ARGS);
  assertEquals(fr.html.includes("reste à toi"), true);
  assertEquals(fr.html.includes("exporter"), true);
  const en = renderCancelEmail("cancel_effective", { ...ARGS, locale: "en-US" });
  assertEquals(en.html.includes("stays yours"), true);
  assertEquals(en.html.includes("export"), true);
});

Deno.test("copie — le pack anglais ne laisse fuir aucun français", () => {
  const markers = ["Qu'est-ce", "abonnement", "Réponds", "Ne plus recevoir"];
  for (const segment of SEGMENTS) {
    const en = renderCancelEmail(segment, { ...ARGS, locale: "en-US" });
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

Deno.test("copie — les quatre sujets sont distincts", () => {
  const subjects = new Set<string>();
  for (const segment of SEGMENTS) {
    for (const locale of ["fr-FR", "en-US"]) {
      subjects.add(renderCancelEmail(segment, { ...ARGS, locale }).subject);
    }
  }
  assertEquals(subjects.size, 4);
});
