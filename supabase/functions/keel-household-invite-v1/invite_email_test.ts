import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildClaimUrl,
  HOUSEHOLD_INVITE_TTL_DAYS,
  renderHouseholdInviteEmail,
  resolveHouseholdInviteLocale,
} from "./invite_email.ts";

const BASE = {
  firstName: "Léa",
  inviterName: "Ada",
  householdName: "Martin",
  claimUrl: "https://app.test/join-household?token=abc",
};

Deno.test("LA MOITIÉ DE L'OFFRE — l'e-mail dit ce que ça NE donne PAS", () => {
  // FF-048 R10: « une seule personne gouverne le menu » est INVISIBLE si on ne
  // l'écrit pas. C'est le maître qui promet en envoyant ce lien; si l'e-mail se
  // tait, c'est LUI qui aura menti — et la personne le découvrira par un bouton
  // absent. Les deux langues, parce qu'une garde testée dans une seule langue
  // n'en est pas une (cicatrice `guard-tested-in-one-language-only`).
  for (const locale of ["fr-FR", "en-US"]) {
    const { html } = renderHouseholdInviteEmail({ ...BASE, locale });
    const said = /ne composes pas le menu|do not compose the menu/.test(html);
    assert(said, `[${locale}] le refus de composer n'est plus écrit`);
  }
});

Deno.test("⛔ AUCUN MONTANT, ET AUCUN NOM DE CODE INTERNE", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const { subject, html } = renderHouseholdInviteEmail({ ...BASE, locale });
    const all = `${subject}\n${html}`;
    // Le prix a changé deux fois en un mois (2 € → 1,99 €). Recopié ici, il
    // deviendrait une troisième source dans un message qu'on ne peut plus
    // corriger une fois parti.
    assertEquals(
      /\d+[.,]\d{2}\s*€|€\s*\d|\$\s*\d/.test(all),
      false,
      `[${locale}] un montant s'est glissé dans l'e-mail`,
    );
    // « KEEL » est un nom de code INTERNE. Un e-mail est une surface lue par un
    // utilisateur — c'est exactement la classe de fuite déjà payée une fois.
    assertEquals(
      /keel/i.test(all),
      false,
      `[${locale}] le nom de code interne a fuité dans un e-mail`,
    );
  }
});

Deno.test("LE LIEN, LA DURÉE, ET LA SORTIE", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const { html } = renderHouseholdInviteEmail({ ...BASE, locale });
    assertStringIncludes(html, BASE.claimUrl);
    assertStringIncludes(html, String(HOUSEHOLD_INVITE_TTL_DAYS));
    // Ignorer ne crée rien: c'est ce qui rend l'e-mail sûr à recevoir pour
    // quelqu'un qui ne l'attendait pas.
    // ⚠️ ESPACES SOUPLES: le gabarit retourne à la ligne au milieu de la
    // phrase. Une regex à espace unique passerait au vert le jour où le texte
    // disparaît ET rougirait au premier reformatage — le pire des deux.
    const flat = html.replace(/\s+/g, " ");
    assert(
      /rien n'a été créé en ton nom|nothing was created in your name/.test(flat),
      `[${locale}] la sortie « ignorer ne crée rien » n'est plus écrite`,
    );
  }
});

Deno.test("UN NOM MANQUANT NE PRODUIT NI TROU NI « null »", () => {
  // Le contexte est lu APRÈS l'écriture du jeton et une lecture en panne
  // n'annule pas l'envoi: le rendu doit donc tenir sans prénom ni foyer.
  for (const locale of ["fr-FR", "en-US"]) {
    const { subject, html } = renderHouseholdInviteEmail({
      firstName: null,
      inviterName: null,
      householdName: null,
      claimUrl: BASE.claimUrl,
      locale,
    });
    const all = `${subject}\n${html}`;
    assertEquals(/null|undefined/.test(all), false, `[${locale}] un trou rendu`);
    assertEquals(/\s,|\s\./.test(subject), false, `[${locale}] sujet mal formé`);
  }
});

Deno.test("L'ÉCHAPPEMENT HTML TIENT — un prénom n'est pas du balisage", () => {
  const { html } = renderHouseholdInviteEmail({
    ...BASE,
    inviterName: '<script>alert("x")</script>',
    locale: "fr-FR",
  });
  assertEquals(html.includes("<script>"), false);
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("LA PORTE EST `/join-household`, JAMAIS `/join`", () => {
  // `matchPath("/join", "/join-household")` rend `null` — vérifié côté écran.
  // Un lien envoyé sur la mauvaise porte rend un écran qui ne sait pas de quoi
  // il parle, et rien ne le rattrape.
  const url = buildClaimUrl("https://app.test/", "a b+c");
  assertStringIncludes(url, "https://app.test/join-household?token=");
  // Le jeton est encodé: `keel_household_invite` translitère `+/=` en `-_`,
  // mais s'appuyer sur ça ferait dépendre l'URL d'un détail de la RPC.
  assertStringIncludes(url, "a%20b%2Bc");
  assertEquals(buildClaimUrl(undefined, "t").startsWith("http://localhost:5173/"), true);
});

Deno.test("LA LANGUE — le choix explicite d'abord, celle du maître ensuite", () => {
  assertEquals(resolveHouseholdInviteLocale("fr-FR", "en-US"), "fr-FR");
  assertEquals(resolveHouseholdInviteLocale("", "fr-CA"), "fr-FR");
  assertEquals(resolveHouseholdInviteLocale(null, null), "en-US");
  // Une étiquette exotique ne JETTE pas: une invitation refusée pour cette
  // raison est quelqu'un qui n'entre jamais, et le maître ne le saurait pas.
  assertEquals(resolveHouseholdInviteLocale("zz-ZZ"), "en-US");
});
