// LE MOT DE LA FIN D'ACCÈS — les deux moitiés, testées SÉPARÉMENT.
//
// Ce fichier existe parce que les deux moitiés du module cassent différemment:
//   · les MESSAGES: un pack manquant ⇒ quelqu'un lit une langue qu'il ne parle
//     pas. Épreuve BIDIRECTIONNELLE — une assertion sur le seul français reste
//     verte devant un français codé en dur, qui est le défaut d'origine.
//   · la GARDE: un lexique monolingue ⇒ un refus n'est pas entendu. Épreuve sur
//     les DEUX langues, et sur l'absence de tout paramètre de langue.

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildAccessEndedInitialMessage,
  buildAccessEndedNegativeReply,
  buildAccessEndedPositiveReply,
  classifyAccessEndedIntent,
} from "./access_ended_notice.ts";

const REASONS = ["trial_ended", "subscription_ended"] as const;

/** Ce que seul le pack français produit. Pas un détecteur de langue. */
const FRENCH_MARKERS = [
  "Coucou",
  "ton essai",
  "abonnement",
  "Avec plaisir",
  "Pas de souci",
  "La porte reste",
  "quand tu veux",
];

function assertNoFrenchLeak(text: string, where: string): void {
  for (const marker of FRENCH_MARKERS) {
    assert(
      !text.includes(marker),
      `${where}: « ${marker} » a fuité dans un message anglais — ${text}`,
    );
  }
}

// ---------------------------------------------------------------------------
// LES MESSAGES — bidirectionnels
// ---------------------------------------------------------------------------

Deno.test("le message d'ouverture suit la locale, dans les DEUX sens", () => {
  for (const reason of REASONS) {
    const fr = buildAccessEndedInitialMessage({
      reason,
      firstName: "Julie Martin",
      locale: "fr-FR",
    });
    // Le pack français est GELÉ: le prénom seul, et la salutation d'origine.
    assert(fr.startsWith("Coucou Julie,"), fr);

    const en = buildAccessEndedInitialMessage({
      reason,
      firstName: "Julie Martin",
      locale: "en-US",
    });
    assert(en.startsWith("Hi Julie,"), en);
    // LA MOITIÉ QUI MANQUAIT: sans elle, ce test resterait vert devant le
    // français codé en dur qu'on vient de retirer.
    assertNoFrenchLeak(en, `initial/${reason}`);
    // …et il dit toujours quelque chose. Un pack vide passerait la ligne
    // au-dessus sans rien porter.
    assert(en.length > 60, en);
    assert(en.includes(reason === "trial_ended" ? "trial" : "subscription"), en);
  }
});

Deno.test("sans prénom, chaque pack rend SA salutation courte", () => {
  const fr = buildAccessEndedInitialMessage({
    reason: "trial_ended",
    firstName: null,
    locale: "fr-FR",
  });
  assert(fr.startsWith("Coucou,"), fr);
  const en = buildAccessEndedInitialMessage({
    reason: "trial_ended",
    firstName: "   ",
    locale: "en-US",
  });
  assert(en.startsWith("Hi,"), en);
  // Le repli textuel est rendu PAR CHAQUE PACK, jamais choisi en amont: un
  // « là » décidé par l'appelant imposerait sa langue aux deux.
  assertNoFrenchLeak(en, "initial sans prénom");
});

Deno.test("la réponse positive porte le lien, dans les deux langues", () => {
  for (const reason of REASONS) {
    const url = "https://sophia-coach.ai/upgrade";
    const fr = buildAccessEndedPositiveReply({ reason, upgradeUrl: url, locale: "fr-FR" });
    const en = buildAccessEndedPositiveReply({ reason, upgradeUrl: url, locale: "en-US" });
    // L'URL est un jeton machine: elle ne se traduit pas, et elle doit être là
    // dans les deux — un message d'acceptation sans lien est une promesse vide.
    assert(fr.includes(url), fr);
    assert(en.includes(url), en);
    assert(fr.startsWith("Avec plaisir"), fr);
    assertNoFrenchLeak(en, `positive/${reason}`);
  }
});

Deno.test("la réponse négative existe dans les deux langues et ne relance pas", () => {
  const fr = buildAccessEndedNegativeReply("fr-FR");
  const en = buildAccessEndedNegativeReply("en-US");
  assert(fr.startsWith("Pas de souci"), fr);
  assert(en.trim().length > 40, en);
  assertNoFrenchLeak(en, "negative");
  // Un refus ne se répond pas par une relance déguisée: aucun lien nulle part.
  for (const text of [fr, en]) assert(!text.includes("http"), text);
});

Deno.test("une langue non livrée retombe sur l'anglais, pas sur le français", () => {
  // La dégradation a lieu UNE fois, en amont (`clampToDeliveredLocale`). Ici on
  // vérifie seulement que « pas français » veut bien dire « anglais » — et pas
  // « la langue par défaut historique du fichier », qui était le français.
  const de = buildAccessEndedInitialMessage({
    reason: "trial_ended",
    firstName: "Klaus",
    locale: "de-DE",
  });
  assert(de.startsWith("Hi Klaus,"), de);
  assertNoFrenchLeak(de, "initial/de-DE");
});

// ---------------------------------------------------------------------------
// LA GARDE — union EN+FR, et AUCUNE locale
// ---------------------------------------------------------------------------

Deno.test("le classifieur entend l'acceptation en FRANÇAIS", () => {
  for (
    const t of [
      "oui",
      "Oui !",
      "ouais",
      "ok",
      "d'accord",
      "d’accord", // apostrophe typographique du clavier iOS
      "c'est parti",
      "vas-y",
      "vas y",
      "avec plaisir",
      "je veux bien",
      "volontiers",
      "envoie-moi le lien",
    ]
  ) {
    assertEquals(classifyAccessEndedIntent(t), "accept", t);
  }
});

Deno.test("le classifieur entend l'acceptation en ANGLAIS", () => {
  for (
    const t of [
      "yes",
      "Yes please",
      "yeah",
      "yep",
      "sure",
      "ok",
      "okay",
      "go",
      "let's go",
      "i'm in",
      "sounds good",
      "go ahead",
      "send me the link",
    ]
  ) {
    assertEquals(classifyAccessEndedIntent(t), "accept", t);
  }
});

Deno.test("le classifieur entend le refus en FRANÇAIS", () => {
  for (
    const t of [
      "non",
      "Non merci",
      "pas pour le moment",
      "pas maintenant",
      "pas pour l'instant",
      "plus tard",
      "une autre fois",
      "pas tout de suite",
      "ça ira",
    ]
  ) {
    assertEquals(classifyAccessEndedIntent(t), "decline", t);
  }
});

Deno.test("LE DÉFAUT MESURÉ: le refus en ANGLAIS tombait en `unknown`", () => {
  // Le lexique de décision était français avec UN seul jeton anglais (`yes`).
  // Ces neuf réponses partaient donc toutes en `unknown`: l'anglophone qui
  // refusait n'était pas entendu, et rien ne se fermait.
  for (
    const t of [
      "no",
      "No",
      "nope",
      "nah",
      "not now",
      "not right now",
      "not yet",
      "maybe later",
      "later",
      "another time",
      "no thanks",
      "no thank you",
      "not interested",
      "i'll pass",
    ]
  ) {
    assertEquals(classifyAccessEndedIntent(t), "decline", t);
  }
});

Deno.test("une phrase qui dit les DEUX ne décide rien — et c'est l'arbitrage", () => {
  // L'ancienne version testait « accepte » d'abord et rendait tout de suite:
  // « ok mais plus tard » matchait `^ok\b` et repartait en `accept`, c'est-à-
  // dire qu'on envoyait un lien de paiement à quelqu'un qui venait de refuser.
  // Sur cette surface les deux erreurs ne coûtent pas la même chose.
  for (const t of ["ok mais plus tard", "yes but not now", "ok, another time"]) {
    assertEquals(classifyAccessEndedIntent(t), "unknown", t);
  }
});

Deno.test("le vide, le bruit et la prose ne décident rien", () => {
  for (const t of ["", "   ", null, undefined, 42, "comment ça marche ?", "?"]) {
    assertEquals(classifyAccessEndedIntent(t), "unknown", String(t));
  }
});

Deno.test("les mots courts et ambigus ne comptent QU'EN TÊTE de message", () => {
  // « ok » au milieu d'une phrase ne veut rien dire de décidable. La règle
  // existait déjà côté français; elle vaut à l'identique côté anglais.
  assertEquals(classifyAccessEndedIntent("ok"), "accept");
  assertEquals(
    classifyAccessEndedIntent("je me demandais si tout etait ok chez toi"),
    "unknown",
  );
  // Contre-épreuve du piège de frontière de mot: « know » ne contient pas
  // « no », et « nothing » ne contient pas « not » comme mot.
  assertEquals(classifyAccessEndedIntent("i know what you mean"), "unknown");
});

Deno.test("le classifieur n'a AUCUN paramètre de langue — et c'est le contrat", () => {
  // Un utilisateur répond dans la langue qu'il veut, y compris une autre que
  // celle de son profil. Une garde paramétrée par la langue supposée est une
  // garde qui cesse d'entendre. La forme du type est ce qui l'interdit.
  assertEquals(classifyAccessEndedIntent.length, 1);
  // Preuve d'usage: les deux langues traversent le MÊME appel, sans contexte.
  assertEquals(classifyAccessEndedIntent("no thanks"), "decline");
  assertEquals(classifyAccessEndedIntent("non merci"), "decline");
  assertEquals(classifyAccessEndedIntent("yes"), "accept");
  assertEquals(classifyAccessEndedIntent("oui"), "accept");
});
