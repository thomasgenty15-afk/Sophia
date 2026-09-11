import { assertEquals } from "jsr:@std/assert@1";

import { renderWelcomeEmail } from "../../send-welcome-email/welcome_email.ts";
import { assertNoForbiddenClaim } from "./lifecycle_copy_guard.ts";

// FF-063 LOT 3 — LE PREMIER MOT, GARDÉ.
//
// ⚠️ CE FICHIER EST DANS `_shared/keel/`, PAS À CÔTÉ DU MODULE QU'IL TESTE.
// C'est délibéré et c'est la moitié de sa valeur: `scripts/agent-gate.sh:193`
// ne lance `deno test` que sur ce dossier. Son voisin
// `_shared/lifecycle_emails_locale_test.ts` — la même garde, pour les quatre
// e-mails transactionnels — n'est lancé par AUCUN automatisme, et on ne le
// découvre qu'en lisant le gate. Une garde qui ne tourne pas est un commentaire.
//
// Trois choses tenues ici, et une seule est du confort:
//   1. la copie ne dit rien que `docs/keel/LEGAL.md` §6 interdit;
//   2. les deux packs disent la même chose sans se contaminer;
//   3. le bouton va sur `/app/plan` — le SEUL lien correct dans les trois
//      états possibles du lecteur.

const PLAN_URL = "https://sophia-coach.ai/app/plan";
const UNSUB_URL = "https://sophia-coach.ai/unsubscribe?token=abc&lang=fr";

/**
 * Les marqueurs français qui ne doivent JAMAIS apparaître dans le pack
 * anglais. Même mécanique que `_shared/lifecycle_emails_locale_test.ts:33-50`,
 * et pour la même raison mesurée: ce mail a été FRANÇAIS EN DUR pendant tout
 * le pilote, sujet compris, alors que le produit se vendait en anglais.
 */
const FRENCH_MARKERS = [
  "Bienvenue",
  "ton premier plan",
  "Voir mon plan",
  "quantités",
  "À tout de suite",
  "Ne plus recevoir",
];

Deno.test("bienvenue — la copie respecte LEGAL.md §6, dans les deux langues", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const rendered = renderWelcomeEmail({
      firstName: "Marc",
      planUrl: PLAN_URL,
      unsubscribeUrl: UNSUB_URL,
      locale,
    });
    assertNoForbiddenClaim(rendered.subject, `sujet ${locale}`);
    assertNoForbiddenClaim(rendered.html, `corps ${locale}`);
  }
});

Deno.test("bienvenue — le bouton va sur /app/plan, jamais ailleurs", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const { html } = renderWelcomeEmail({
      firstName: "Marc",
      planUrl: PLAN_URL,
      unsubscribeUrl: UNSUB_URL,
      locale,
    });
    assertEquals(html.includes(PLAN_URL), true, `lien absent en ${locale}`);
    // Les deux destinations que ce mail a portées ou aurait pu porter, et que
    // l'en-tête du module explique de ne pas viser.
    assertEquals(html.includes("/app/chat"), false, `/app/chat en ${locale}`);
    assertEquals(html.includes("/app/today"), false, `/app/today en ${locale}`);
  }
});

Deno.test("bienvenue — la sortie est là, même sur le premier contact", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const { html } = renderWelcomeEmail({
      firstName: null,
      planUrl: PLAN_URL,
      unsubscribeUrl: UNSUB_URL,
      locale,
    });
    assertEquals(html.includes(UNSUB_URL), true, `sortie absente en ${locale}`);
  }
});

Deno.test("bienvenue — le pack anglais ne laisse fuir aucun français", () => {
  const en = renderWelcomeEmail({
    firstName: "Sarah",
    planUrl: PLAN_URL,
    unsubscribeUrl: UNSUB_URL,
    locale: "en-US",
  });
  for (const marker of FRENCH_MARKERS) {
    assertEquals(
      en.subject.includes(marker),
      false,
      `« ${marker} » a fuité dans le sujet anglais: ${en.subject}`,
    );
    assertEquals(
      en.html.includes(marker),
      false,
      `« ${marker} » a fuité dans le corps anglais`,
    );
  }
  // Bidirectionnel: une assertion sur la seule langue d'origine reste verte
  // devant un texte codé en dur.
  assertEquals(en.subject.includes("Welcome"), true);
  assertEquals(en.html.includes("See my plan"), true);
  assertEquals(en.html.includes("Stop these emails"), true);
});

Deno.test("bienvenue — les deux sujets diffèrent et nomment la personne", () => {
  const fr = renderWelcomeEmail({
    firstName: "Marc",
    planUrl: PLAN_URL,
    unsubscribeUrl: UNSUB_URL,
    locale: "fr-FR",
  });
  const en = renderWelcomeEmail({
    firstName: "Marc",
    planUrl: PLAN_URL,
    unsubscribeUrl: UNSUB_URL,
    locale: "en-US",
  });
  assertEquals(fr.subject.includes("Marc"), true);
  assertEquals(en.subject.includes("Marc"), true);
  assertEquals(fr.subject === en.subject, false);
});

Deno.test("bienvenue — sans prénom, chaque pack rend SA propre salutation", () => {
  // Le repli textuel choisi par l'appelant (`"là"`) donnait « Hello là, ».
  // L'absence se rend dans chaque langue, jamais en amont.
  for (const empty of [null, "", "   "]) {
    const fr = renderWelcomeEmail({
      firstName: empty,
      planUrl: PLAN_URL,
      unsubscribeUrl: UNSUB_URL,
      locale: "fr-FR",
    });
    assertEquals(fr.subject, "Bienvenue — ton premier plan t'attend");
    assertEquals(fr.html.includes("<p>Hello,</p>"), true);

    const en = renderWelcomeEmail({
      firstName: empty,
      planUrl: PLAN_URL,
      unsubscribeUrl: UNSUB_URL,
      locale: "en-US",
    });
    assertEquals(en.subject, "Welcome — your first plan is waiting");
    assertEquals(en.html.includes("<p>Hello,</p>"), true);
  }
});

Deno.test("bienvenue — ne parle plus du produit précédent", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const { html, subject } = renderWelcomeEmail({
      firstName: "Marc",
      planUrl: PLAN_URL,
      unsubscribeUrl: UNSUB_URL,
      locale,
    });
    const text = `${subject} ${html}`.toLowerCase();
    // Les promesses du coach de vie, mot pour mot.
    for (const dead of ["conversation", "photos de repas", "meal photos", "bilans"]) {
      assertEquals(
        text.includes(dead.toLowerCase()),
        false,
        `« ${dead} » survit en ${locale}`,
      );
    }
    // Et le nom de code interne, qui ne doit apparaître sur AUCUNE surface lue
    // par un utilisateur.
    assertEquals(text.includes("keel"), false, `« keel » en ${locale}`);
  }
});
