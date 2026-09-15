// FF-061 — LE COMPTE-RENDU DE LA DEMANDE. Ce que ces tests protègent, dans
// l'ordre de ce qui coûte le plus cher quand ça casse:
//
//   * LE REFUS ANNONCÉ QUI N'A PAS EU LIEU — une prose mal lue qui devient
//     `absent` fait dire au produit « je n'ai pas mis ce que tu as demandé »
//     alors qu'il n'a rien décidé. C'est indémentable pour qui lit son plan;
//   * LE SERVI ANNONCÉ QUI N'EST PAS SERVI — « sans fromage » compté comme du
//     fromage, ou « laitue » comptée comme « lait ». Le second est mesuré: 12
//     faux positifs sur 12 avec un rapprochement naïf;
//   * LA RÈGLE DE MAISON COMMENTÉE — « je n'ai pas mis le nutella » fait porter
//     à Sophia une décision parentale, et c'est le run réel qui a produit
//     `household_restriction_lock.ts`;
//   * LE REPROCHE RÉPÉTÉ — un absent redit à chaque génération transforme le
//     compte-rendu en liste de griefs.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  absentTermsOf,
  extractRequestedTerms,
  MAX_REQUEST_TERMS,
  type ReportableDish,
  reportOnRequest,
} from "./request_report.ts";

function dish(over: Partial<ReportableDish> & { id: string }): ReportableDish {
  return {
    title: "Something",
    method: "Cook it.",
    day: "mon",
    ingredients: [],
    ...over,
  };
}

/** Le raccourci des cas nominaux: pas de règle de maison, rien de déjà dit. */
function report(preferences: string, dishes: readonly ReportableDish[]) {
  return reportOnRequest({
    preferences,
    dishes,
    houseRuleTerms: [],
    previouslyReportedAbsent: [],
  });
}

// ---------------------------------------------------------------------------
// 1. LE CAS NOMINAL — et il dit OUI
// ---------------------------------------------------------------------------

Deno.test("« des burgers et du poisson » servis ⇒ deux `served`, avec les jours", () => {
  const r = report("des burgers et du poisson", [
    dish({ id: "d1", title: "Burger maison", day: "thu" }),
    dish({ id: "d2", title: "Poisson roti au citron", day: "sat" }),
  ]);
  assertEquals(r.terms.length, 2);
  assertEquals(r.terms[0], {
    term: "burgers",
    status: "served",
    dishIds: ["d1"],
    days: ["thu"],
  });
  assertEquals(r.terms[1].term, "poisson");
  assertEquals(r.terms[1].status, "served");
  assertEquals(r.terms[1].days, ["sat"]);
  assertEquals(r.unreadableCount, 0);
});

Deno.test("TOUT honoré ⇒ le bloc EXISTE quand même, et ne dit aucun non", () => {
  // ── RÈGLE PRODUIT, PAS PRÉFÉRENCE DE TON ────────────────────────────────
  // Un compte-rendu qui ne parle que pour dire non devient le bruit du refus:
  // on apprend à le redouter, et le jour où il compte vraiment il est déjà
  // disqualifié. Sans ce test, l'optimisation « ne rien rendre quand tout va
  // bien » a l'air d'une économie.
  const r = report("des pizzas", [dish({ id: "d1", title: "Pizza night" })]);
  assert(r.terms.length > 0, "le compte-rendu existe même quand tout est servi");
  assertEquals(r.terms.every((t) => t.status === "served"), true);
  assertEquals(r.terms.filter((t) => t.status === "absent"), []);
});

Deno.test("le PLURIEL de la demande trouve le SINGULIER du plat", () => {
  // ⚠️ DÉFAUT MESURÉ AU PREMIER PASSAGE: « des pizzas » ne trouvait pas « Pizza
  // night ». Le matcher tolère un pluriel dans le texte analysé, pas dans le
  // terme cherché — et les gens écrivent leurs envies au pluriel pendant que
  // les plats se titrent au singulier. La dissymétrie tombait sur le cas
  // nominal.
  const en = report("some pizzas", [dish({ id: "d1", title: "Pizza night" })]);
  assertEquals(en.terms[0].status, "served");

  const fr = report("des pates", [dish({ id: "d1", title: "Pate a la tomate" })]);
  assertEquals(fr.terms[0].status, "served");

  // Le pluriel porté par le PREMIER mot: ne singulariser que la fin rendrait
  // « pommes de terr ».
  const compose = report("des pommes de terre", [
    dish({ id: "d1", title: "Pomme de terre au four" }),
  ]);
  assertEquals(compose.terms[0].status, "served");

  // ── ET LE TERME AFFICHÉ RESTE CELUI QUI A ÉTÉ ÉCRIT ────────────────────
  // « tu as demandé des pizzas » se lit; « tu as demandé pizza » se lit comme
  // une machine.
  assertEquals(en.terms[0].term, "pizzas");
});

Deno.test("le `-es` anglais ne mange pas un pluriel français", () => {
  // ⚠️ MESURÉ AU DEUXIÈME PASSAGE: « pates » devenait « pat ». Le pluriel
  // français est un simple `-s`; le `-es` n'est un pluriel qu'après une
  // sifflante, et c'est de l'anglais. Une lettre de trop retirée donne un
  // radical qui matche des mots sans rapport.
  const fr = report("des crepes", [dish({ id: "d1", title: "Crepe au sucre" })]);
  assertEquals(fr.terms[0].status, "served");

  const en = report("some dishes", [dish({ id: "d1", title: "One dish wonder" })]);
  assertEquals(en.terms[0].status, "served");

  // Et le radical trop court ne doit PAS naître: « pates » cherche « pate »,
  // donc il ne trouve rien dans un plat qui ne parle que de pâté.
  const court = report("des pates", [dish({ id: "d1", title: "Riz saute" })]);
  assertEquals(court.terms[0].status, "absent");
});

Deno.test("le rapprochement ne traverse PAS les langues, et c'est assumé", () => {
  // « du poisson » ne trouve pas « Roast fish ». Le plan est rendu dans la
  // langue de l'élève (`content_locale`), donc les envies et les titres sont
  // dans la même langue par construction. Traduire ici demanderait un lexique
  // d'aliments bilingue — c'est-à-dire un second référentiel à côté de
  // `food_composition_refs`, et le dépôt a déjà payé les moteurs en double.
  const r = report("du poisson", [dish({ id: "d1", title: "Roast fish" })]);
  assertEquals(r.terms[0].status, "absent");
});

Deno.test("les déterminants tombent — sinon on cherche « des burgers » dans un titre", () => {
  const fr = extractRequestedTerms("de la viande, un peu de riz, des oeufs");
  assertEquals(fr.terms, ["viande", "riz", "oeufs"]);
  const en = extractRequestedTerms("some chicken, a bit of rice, the fish");
  assertEquals(en.terms, ["chicken", "rice", "fish"]);
});

// ---------------------------------------------------------------------------
// 2. LE FAUX POSITIF MESURÉ — « laitue » n'est pas « lait »
// ---------------------------------------------------------------------------

Deno.test("« lait » ne matche PAS « laitue » — 12 faux positifs sur 12 mesurés", () => {
  // C'est LE test qui justifie de passer par `findForbiddenMatches` plutôt que
  // par un `includes()`. Un rapprochement naïf annonce servi ce qui ne l'est
  // pas, et personne ne peut le démentir en lisant son plan.
  const r = report("du lait", [
    dish({ id: "d1", title: "Salade verte", ingredients: [{ term: "laitue" }] }),
  ]);
  assertEquals(r.terms.length, 1);
  assertEquals(r.terms[0].status, "absent");
  assertEquals(r.terms[0].dishIds, []);
});

Deno.test("« lait » matche bien « lait entier » — la contre-épreuve", () => {
  // Sans elle, le test précédent serait aussi vert avec un matcher qui ne
  // matche jamais rien.
  const r = report("du lait", [
    dish({ id: "d1", title: "Porridge", ingredients: [{ term: "lait entier" }] }),
  ]);
  assertEquals(r.terms[0].status, "served_reduced");
  assertEquals(r.terms[0].dishIds, ["d1"]);
});

// ---------------------------------------------------------------------------
// 3. LA NÉGATION — dans les DEUX LANGUES
// ---------------------------------------------------------------------------

Deno.test("« sans fromage » ne sert PAS de fromage — FR", () => {
  const r = report("du fromage", [
    dish({ id: "d1", title: "Gratin", method: "Monter le gratin sans fromage." }),
  ]);
  assertEquals(r.terms[0].status, "absent");
});

Deno.test("« without cheese » ne sert PAS de fromage — EN", () => {
  // ⚠️ LES DEUX LANGUES, ET CE N'EST PAS DU ZÈLE. Cicatrice du dépôt: une garde
  // qui connaît `not` ne couvre pas `doesn't`, et une qui connaît `sans` ne
  // couvre pas `without`. Le produit sort en français par défaut ET le prompt
  // est en anglais: les deux surfaces existent réellement.
  const r = report("some cheese", [
    dish({ id: "d1", title: "Gratin", method: "Assemble the gratin without cheese." }),
  ]);
  assertEquals(r.terms[0].status, "absent");
});

// ---------------------------------------------------------------------------
// 4. `served` CONTRE `served_reduced` — le titre décide
// ---------------------------------------------------------------------------

Deno.test("dans le TITRE ⇒ `served`; seulement en ingrédient ⇒ `served_reduced`", () => {
  // « du poisson » dans le titre veut dire que le plat EST du poisson. Le même
  // terme dans les ingrédients d'une salade veut dire qu'il y en a, mais que
  // ce n'était pas le plat. Les deux sont vrais et ne se disent pas pareil.
  const servi = report("du poisson", [
    dish({ id: "d1", title: "Poisson grillé" }),
  ]);
  assertEquals(servi.terms[0].status, "served");

  const reduit = report("du poisson", [
    dish({ id: "d1", title: "Salade composée", ingredients: [{ term: "poisson fumé" }] }),
  ]);
  assertEquals(reduit.terms[0].status, "served_reduced");
  assertEquals(reduit.terms[0].dishIds, ["d1"]);
});

Deno.test("plusieurs plats ⇒ tous les ids, les jours DÉDUPLIQUÉS et dans l'ordre", () => {
  const r = report("des pates", [
    dish({ id: "d1", title: "Pates au pesto", day: "mon" }),
    dish({ id: "d2", title: "Pates a la tomate", day: "mon" }),
    dish({ id: "d3", title: "Riz saute", day: "tue" }),
    dish({ id: "d4", title: "Pates carbonara", day: "wed" }),
  ]);
  assertEquals(r.terms[0].dishIds, ["d1", "d2", "d4"]);
  assertEquals(r.terms[0].days, ["mon", "wed"]);
});

// ---------------------------------------------------------------------------
// 5. LA RÈGLE DE MAISON — le piège du run réel
// ---------------------------------------------------------------------------

Deno.test("un terme couvert par une règle de maison DISPARAÎT de la sortie", () => {
  // ── LE RUN RÉEL QUI A PRODUIT `household_restriction_lock.ts` ───────────
  // Le prompt disait en toutes lettres de ne pas commenter les règles de
  // maison, et le modèle a rendu « honore la demande de pâtes de Lea […] SANS
  // NUTELLA ». Si le compte-rendu disait « je n'ai pas mis le nutella », on
  // aurait reconstruit le même défaut par une autre porte: Sophia portant une
  // décision parentale comme si c'était la sienne.
  const r = reportOnRequest({
    preferences: "du nutella et des pates",
    dishes: [dish({ id: "d1", title: "Pates au pesto" })],
    houseRuleTerms: [{ ruleId: "house", token: "nutella" }],
    previouslyReportedAbsent: [],
  });
  assertEquals(r.terms.map((t) => t.term), ["pates"]);
  assertEquals(r.terms[0].status, "served");
});

Deno.test("la règle de maison efface le terme MÊME QUAND il est servi", () => {
  // La porte ne dépend pas du statut réel: elle retire le terme de la sortie
  // entière. Sinon « il y en a mardi » resterait, et la présence d'une ligne
  // pour un aliment interdit à la maison est déjà une information.
  const r = reportOnRequest({
    preferences: "du nutella",
    dishes: [dish({ id: "d1", title: "Crepes au nutella" })],
    houseRuleTerms: [{ ruleId: "house", token: "nutella" }],
    previouslyReportedAbsent: [],
  });
  assertEquals(r.terms, []);
});

Deno.test("la règle de maison mord aussi par sa FORME DE SURFACE, en EN et FR", () => {
  const fr = reportOnRequest({
    preferences: "des sucreries",
    dishes: [dish({ id: "d1", title: "Salade" })],
    houseRuleTerms: [
      { ruleId: "house", token: "candy", surfaceForms: ["sucreries", "bonbons"] },
    ],
    previouslyReportedAbsent: [],
  });
  assertEquals(fr.terms, []);

  const en = reportOnRequest({
    preferences: "some candy",
    dishes: [dish({ id: "d1", title: "Salad" })],
    houseRuleTerms: [
      { ruleId: "house", token: "candy", surfaceForms: ["sucreries", "bonbons"] },
    ],
    previouslyReportedAbsent: [],
  });
  assertEquals(en.terms, []);
});

// ---------------------------------------------------------------------------
// 6. L'ILLISIBLE — le pire faux positif de ce chantier
// ---------------------------------------------------------------------------

Deno.test("une prose illisible est COMPTÉE, et ne produit AUCUN `absent`", () => {
  // ⚠️ SANS CE COMPORTEMENT, une phrase que le module ne sait pas lire devient
  // silencieusement « tu as demandé X, je ne l'ai pas mis » — un refus annoncé
  // qui n'a jamais eu lieu.
  const r = report("j'ai envie de manger quelque chose de bon cette semaine", [
    dish({ id: "d1", title: "Poulet roti" }),
  ]);
  assertEquals(r.terms.filter((t) => t.status === "absent"), []);
  assert(r.unreadableCount > 0, "l'illisible doit se compter");
});

Deno.test("un fragment TROP LONG est illisible, jamais absent — EN et FR", () => {
  const fr = extractRequestedTerms(
    "quelque chose qui plaise a tout le monde a table ce soir",
  );
  assertEquals(fr.terms, []);
  assert(fr.unreadableCount > 0);

  const en = extractRequestedTerms(
    "something that everyone at the table will actually enjoy",
  );
  assertEquals(en.terms, []);
  assert(en.unreadableCount > 0);
});

Deno.test("un fragment plus court que le plancher est illisible", () => {
  const r = extractRequestedTerms("du riz, ok, un peu de pain");
  assertEquals(r.terms, ["riz", "pain"]);
  assertEquals(r.unreadableCount, 1);
});

// ---------------------------------------------------------------------------
// 7. L'ABSENT SE DIT UNE FOIS
// ---------------------------------------------------------------------------

Deno.test("un absent déjà dit au plan précédent n'est PAS redit", () => {
  const dishes = [dish({ id: "d1", title: "Poulet roti" })];
  const premier = report("des sushis", dishes);
  assertEquals(premier.terms[0].status, "absent");
  assertEquals(absentTermsOf(premier), ["sushis"]);

  const second = reportOnRequest({
    preferences: "des sushis",
    dishes,
    houseRuleTerms: [],
    previouslyReportedAbsent: absentTermsOf(premier),
  });
  assertEquals(second.terms, [], "le reproche ne se répète pas");
});

Deno.test("un terme déjà dit absent, mais SERVI cette fois, se dit quand même", () => {
  // Le silence ne porte que sur la répétition d'un non. Un oui n'a aucune
  // raison d'être tu — et le taire ferait disparaître la bonne nouvelle
  // précisément pour qui avait été déçu la fois d'avant.
  const r = reportOnRequest({
    preferences: "des sushis",
    dishes: [dish({ id: "d1", title: "Sushis maison" })],
    houseRuleTerms: [],
    previouslyReportedAbsent: ["sushis"],
  });
  assertEquals(r.terms.length, 1);
  assertEquals(r.terms[0].status, "served");
});

// ---------------------------------------------------------------------------
// 8. LES BORNES — et la mutation qui prouve que le test mord
// ---------------------------------------------------------------------------

Deno.test("le plafond de termes vaut 8 — LA VALEUR, pas la constante", () => {
  // ⚠️ UN TEST QUI S'ÉCRIT `assertEquals(x, LA_CONSTANTE)` RESTE VERT QUAND ON
  // CHANGE LA CONSTANTE: il mesure sa propre définition. Le littéral est ici
  // pour que déplacer la borne CASSE quelque chose et oblige à écrire pourquoi.
  assertEquals(MAX_REQUEST_TERMS, 8);
});

Deno.test("au-delà du plafond, le débordement est COMPTÉ et pas jeté", () => {
  // Neuf aliments demandés, huit rendus, un compté illisible. Tronquer en
  // silence donnerait un compte-rendu qui a l'air complet.
  const r = extractRequestedTerms(
    "riz, pain, poulet, poisson, oeufs, pates, tomates, fromage, pommes",
  );
  assertEquals(r.terms.length, 8);
  assertEquals(r.unreadableCount, 1);
  assertEquals(r.terms.includes("pommes"), false);
});

Deno.test("un doublon ne consomme pas une place et ne compte pas comme illisible", () => {
  const r = extractRequestedTerms("du riz, du riz, du pain");
  assertEquals(r.terms, ["riz", "pain"]);
  assertEquals(r.unreadableCount, 0);
});

// ---------------------------------------------------------------------------
// 9. CONDITIONS DE DÉSARMEMENT
// ---------------------------------------------------------------------------

Deno.test("aucune envie ⇒ aucun terme, aucun illisible, aucun bloc", () => {
  const vide = report("", [dish({ id: "d1" })]);
  assertEquals(vide.terms, []);
  assertEquals(vide.unreadableCount, 0);

  const blanc = report("   ", [dish({ id: "d1" })]);
  assertEquals(blanc.terms, []);
  assertEquals(blanc.unreadableCount, 0);
});

Deno.test("un plan VIDE ne fait pas mentir le compte-rendu", () => {
  // Zéro plat ⇒ rien n'est servi. La sortie doit le dire, pas s'abstenir.
  const r = report("des burgers", []);
  assertEquals(r.terms[0].status, "absent");
});

Deno.test("le module est PUR — deux appels identiques rendent la même chose", () => {
  const args = {
    preferences: "des burgers et du poisson",
    dishes: [dish({ id: "d1", title: "Burgers" })],
    houseRuleTerms: [],
    previouslyReportedAbsent: [],
  } as const;
  assertEquals(reportOnRequest(args), reportOnRequest(args));
});

// ---------------------------------------------------------------------------
// 10. CE QUE LE RÉEL A APPRIS — mesuré le 2026-08-12
// ---------------------------------------------------------------------------

Deno.test("RUN RÉEL — une DESCRIPTION D'OBJECTIF ne produit aucun refus", () => {
  // ⚠️ LE DÉFAUT MESURÉ SUR LES `preferences` DÉJÀ EN BASE. Le champ ne
  // contient pas que des envies. Cette ligne existe vraiment, et le module en
  // tirait deux refus annoncés qui n'ont jamais eu lieu:
  //
  //     « You asked for full meat portion: there isn't any this time. »
  //     « You asked for generous starch: there isn't any this time. »
  //
  // Les gardes de longueur et de mots vides ne l'attrapaient pas: « full meat
  // portion » fait trois mots et n'en contient aucun de vide.
  const r = report(
    "Building muscle. Eats a heavy evening plate with a full meat portion and a generous starch.",
    [dish({ id: "d1", title: "Poulet roti" })],
  );
  assertEquals(r.terms.filter((t) => t.status === "absent"), []);
  assert(r.unreadableCount > 0, "les phrases sont comptées, pas dites");
});

Deno.test("une PHRASE trouvée se dit quand même — l'asymétrie est le point", () => {
  // Une CORRESPONDANCE est une preuve: le terme est là, on peut le dire quel
  // que soit le nombre de mots. C'est la NON-correspondance sur une phrase qui
  // est une ignorance. Sans ce test, la règle précédente serait indiscernable
  // d'un « on ignore tout ce qui fait plus d'un mot ».
  const r = report("des pommes de terre", [
    dish({ id: "d1", title: "Pomme de terre au four" }),
  ]);
  assertEquals(r.terms[0].status, "served");
});

Deno.test("RUN RÉEL — une demande NIÉE ne devient pas une envie", () => {
  // « des trucs rapides, mais pas de poisson » répondait « tu as demandé mais
  // pas de poisson : il n'y en a pas » — le contraire de ce qui a été écrit.
  const fr = report("des trucs rapides, mais pas de poisson", [
    dish({ id: "d1", title: "Poulet roti" }),
  ]);
  assertEquals(fr.terms, []);

  const en = report("something quick, but no fish", [
    dish({ id: "d1", title: "Roast chicken" }),
  ]);
  assertEquals(en.terms, []);
});

Deno.test("la négation ne mange pas une envie ORDINAIRE — le cas qui passe", () => {
  // Sans lui, la garde précédente serait indiscernable d'une garde qui jette
  // tout fragment un peu long.
  const r = report("du poisson", [dish({ id: "d1", title: "Poisson roti" })]);
  assertEquals(r.terms[0].status, "served");
});
