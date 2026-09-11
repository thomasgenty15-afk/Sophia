import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  assertNoForbiddenClaim,
  findForbiddenClaims,
} from "./lifecycle_copy_guard.ts";

// FF-063 LOT 2 — LA GARDE LÉGALE A UN CAS QUI PASSE.
//
// ⚠️ LA MOITIÉ QUI COMPTE EST `passe`, PAS `mord`. Une garde cassée refuse
// TOUT, et une garde qui refuse tout ressemble exactement à une garde qui
// marche: le test « elle mord » est vert, personne n'écrit plus une ligne de
// copie sans se battre avec elle, et on finit par la désarmer. Le corpus
// ci-dessous est donc composé de phrases que les lots 3 à 8 vont réellement
// écrire — si l'une d'elles se met à rougir, c'est la garde qui a un défaut.

const LEGITIMATE = [
  // S0 — bienvenue.
  "Bienvenue. Il te reste trois questions, et tu as ton premier plan.",
  "Welcome. Three questions to answer, and your first plan is there.",
  // S3 — la fin de couverture, le cœur de la séquence.
  "Ton plan se termine demain. On en refait un ?",
  "Your plan ends tomorrow. Shall we build the next one?",
  "Ça fait trois jours qu'il ne te reste rien de prévu.",
  "Nothing has been planned for you for three days.",
  // S1 et S2 — l'activation.
  "Tu t'es inscrit hier et tu n'as pas fini de répondre. Rien de ce que tu as déjà posé n'est à refaire.",
  "You signed up yesterday and did not finish. Nothing you already answered is lost.",
  "Est-ce que tu as cuisiné ce plan ? Une phrase me suffit.",
  "Did you cook that plan? One sentence is enough.",
  // S4 — le décrochage long.
  "Six sessions depuis mars, puis plus rien depuis deux semaines. Qu'est-ce qui a changé ?",
  "Six sessions since March, then nothing for two weeks. What changed?",
  // S5 — le désabonnement.
  "Qu'est-ce qui n'a pas marché ? Une phrase, même brutale, m'aide.",
  "What did not work? One sentence, however blunt, helps.",
  // S6 — la fin d'essai.
  "Ton essai se termine demain. Après ça, je me mets en pause sur ton compte.",
  "Your trial ends tomorrow. After that I go quiet on your account.",
  // Le pied de page de désinscription, présent sur les onze types.
  "Tu reçois cet e-mail parce que tu as un compte Sophia. Ne plus recevoir ces e-mails.",
  "You are getting this email because you have a Sophia account. Stop these emails.",
  // Ce qui parle de l'OBJECTIF sans en promettre le chiffre — c'est la ligne
  // que le positionnement B2C demande, et elle doit rester dicible.
  "Ton objectif n'a pas bougé, et le plan le suit.",
  "Your goal has not moved, and the plan follows it.",
  // Un poids REPORTÉ par la personne, sans durée ni promesse. Le contrat CAP
  // interdit un rythme annoncé, jamais de rendre à quelqu'un ce qu'il a écrit.
  "Tu as noté 78 kg lundi.",
  "You logged 78 kg on Monday.",
];

Deno.test("garde légale — le corpus légitime passe en entier", () => {
  for (const sentence of LEGITIMATE) {
    assertEquals(
      findForbiddenClaims(sentence),
      [],
      `refusée à tort: « ${sentence} »`,
    );
  }
});

Deno.test("garde légale — un rythme de perte annoncé mord, dans les deux langues", () => {
  // CAP §13: aucun taux ni montant dans une période donnée.
  for (
    const bad of [
      "Perds 5 kg en un mois avec Sophia.",
      "Lose 5 kg in a month with Sophia.",
      "Compte 1 kilo par semaine, sans y penser.",
      "Expect 1 pound a week, without thinking about it.",
      "−4 kg en 30 jours, comme la plupart de nos membres.",
    ]
  ) {
    const hits = findForbiddenClaims(bad).map((v) => v.rule);
    assertEquals(
      hits.includes("rate_over_period"),
      true,
      `laissée passer: « ${bad} »`,
    );
  }
});

Deno.test("garde légale — un montant promis mord même sans durée", () => {
  for (
    const bad of [
      "Tu vas perdre 8 kg.",
      "You will lose 8 kg.",
      "Prends 3 kilos de muscle.",
      "Gain 3 kg of muscle.",
    ]
  ) {
    const hits = findForbiddenClaims(bad).map((v) => v.rule);
    assertEquals(
      hits.includes("promised_amount"),
      true,
      `laissée passer: « ${bad} »`,
    );
  }
});

Deno.test("garde légale — garantie, avant/après, maladie, professionnel", () => {
  const cases: ReadonlyArray<[string, string]> = [
    ["Résultats garantis ou remboursé.", "guarantee"],
    ["Guaranteed results or your money back.", "guarantee"],
    ["Regarde les avant/après de nos membres.", "before_after"],
    ["Look at the before and after of our members.", "before_after"],
    ["Sophia inverse ton prédiabète.", "disease_claim"],
    ["Sophia reverses your prediabetes.", "disease_claim"],
    ["Comme un diététicien, en mieux.", "professional_comparison"],
    ["Like a dietitian, but better.", "professional_comparison"],
  ];
  for (const [bad, rule] of cases) {
    const hits = findForbiddenClaims(bad).map((v) => v.rule);
    assertEquals(hits.includes(rule as never), true, `laissée passer: « ${bad} »`);
  }
});

Deno.test("garde légale — les deux termes doivent être dans la MÊME phrase", () => {
  // Sans le découpage, « 2 kg » au début d'un e-mail et « semaine » à la fin
  // déclencheraient une règle que personne n'a enfreinte.
  const innocent =
    "Tu as noté 78 kg lundi. On se retrouve la semaine prochaine pour le point.";
  assertEquals(findForbiddenClaims(innocent), []);
});

Deno.test("garde légale — le HTML ne casse pas les bords de mot", () => {
  const html =
    "<p>Perds <strong>5&nbsp;kg</strong> en un mois.</p><p>Ton plan t'attend.</p>";
  const hits = findForbiddenClaims(html).map((v) => v.rule);
  assertEquals(hits.includes("rate_over_period"), true);
});

Deno.test("garde légale — le message nomme la règle ET la phrase", () => {
  const error = assertThrows(
    () => assertNoForbiddenClaim("Perds 5 kg en un mois.", "pack fr / S3"),
    Error,
  );
  // Un message qui ne montre pas le texte oblige à rouvrir le fichier.
  assertEquals(error.message.includes("pack fr / S3"), true);
  assertEquals(error.message.includes("rate_over_period"), true);
  assertEquals(error.message.includes("Perds 5 kg en un mois"), true);
});

Deno.test("garde légale — « laitue » n'est pas « lait », et « moisson » n'est pas « mois »", () => {
  // Le défaut de matcher par sous-chaîne que ce dépôt a déjà payé.
  assertEquals(
    findForbiddenClaims("Ta salade de laitue de 200 g attend au frigo."),
    [],
  );
  assertEquals(
    findForbiddenClaims("2 kg de pommes, c'est la moisson du dimanche."),
    [],
  );
});
