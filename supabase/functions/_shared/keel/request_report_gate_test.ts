// FF-061 — LES QUATRE PORTES. Ce que ces tests protègent:
//
//   * LA PORTE 1, PROUVÉE PAR L'ABSENCE DE CHEMIN — sous plancher TCA, aucune
//     combinaison d'entrées ne doit produire une phrase sur la nourriture de
//     quelqu'un qu'on soupçonne déjà de se restreindre;
//   * LA GARDE DÉSARMÉE — un paramètre de garde qu'on peut oublier est une
//     garde qui n'existe pas. Ces tests vérifient que la fonction JETTE;
//   * LE JUGEMENT QUI S'INVITE — les gabarits sont factuels, et un mot
//     d'approbation ou de reproche qui s'y glisse doit casser un test.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  gateRequestReport,
  type ReportLocale,
} from "./request_report_gate.ts";
import { type ReportableDish, reportOnRequest } from "./request_report.ts";
import { parseGeneratedMeal } from "./meal_generation.ts";

/** Le strict nécessaire pour faire tourner le parseur sur un plat. */
const PARSE_ARGS = {
  doctrine: { forbidden: [], foods: { recommended: [], discouraged: [] } },
  safetyConstraints: [],
  mode: "to_shop",
  scope: "day",
  pantry: [],
  beliefKeys: [],
  eatingRhythm: [],
  daysToFill: ["mon"],
  awayDays: [],
  cookingTimeMin: null,
  composition: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  // ⚠️ LOT 4 — AJOUTÉ À LA MAIN, PARCE QUE `as never` A DÉSARMÉ LE COMPILATEUR.
  // Le champ `boxMemberIds` est REQUIS par `parseGeneratedMeal`, et le cast
  // ci-dessous a laissé cet objet passer la compilation puis exploser À
  // L'EXÉCUTION (`Cannot read properties of undefined`). C'est la cicatrice
  // « `as` sur un type étranger désarme le typecheck », mot pour mot, sur un
  // fichier de test. Le cast n'est pas retiré ici — il n'appartient pas à ce
  // lot — mais il est nommé, et le rapport du LOT 4 le porte.
  boxMemberIds: [],
} as never;

const DISHES: ReportableDish[] = [
  { id: "d1", title: "Burger maison", method: "Griller.", day: "thu", ingredients: [] },
  { id: "d2", title: "Poisson roti", method: "Au four.", day: "sat", ingredients: [] },
];

function reportOf(preferences: string, dishes: readonly ReportableDish[] = DISHES) {
  return reportOnRequest({
    preferences,
    dishes,
    houseRuleTerms: [],
    previouslyReportedAbsent: [],
  });
}

function gate(over: Partial<Parameters<typeof gateRequestReport>[0]> = {}) {
  return gateRequestReport({
    report: reportOf("des burgers"),
    locale: "fr",
    restrictionFlag: false,
    doctrineForbidden: [],
    ...over,
  });
}

// ---------------------------------------------------------------------------
// PORTE 1 — LE PLANCHER TCA, ET IL NE SE ROUVRE PAR RIEN
// ---------------------------------------------------------------------------

Deno.test("PORTE 1 — sous plancher TCA, RIEN, et le motif est nommé", () => {
  const r = gate({ restrictionFlag: true });
  assertEquals(r.lines, []);
  assertEquals(r.refusal, "restriction_floor");
});

Deno.test("TEST EXTRA-HARD — protégé + tout honoré + doctrine permissive ⇒ RIEN", () => {
  // ── LE CAS QUI TENTE LE PLUS DE ROUVRIR LA PORTE ────────────────────────
  // Tout va bien: la demande est entièrement servie, la doctrine n'interdit
  // rien, il n'y a que des bonnes nouvelles à annoncer. C'est exactement là
  // qu'une optimisation « il n'y a aucun risque à le dire » se glisse. Pour
  // quelqu'un sous plancher, « j'ai mis ce que tu voulais » reste une phrase
  // sur sa nourriture, et c'est non.
  for (const locale of ["fr", "en"] as ReportLocale[]) {
    const r = gateRequestReport({
      report: reportOf("des burgers et du poisson"),
      locale,
      restrictionFlag: true,
      doctrineForbidden: [],
    });
    assertEquals(r.lines, [], `rien ne sort en ${locale}`);
    assertEquals(r.refusal, "restriction_floor");
  }
});

Deno.test("PORTE 1 — la doctrine ne peut pas la rouvrir, même vide", () => {
  // La porte 1 est évaluée AVANT tout assemblage: il n'y a pas de texte à
  // filtrer, donc aucune porte suivante ne peut en produire.
  const r = gate({ restrictionFlag: true, doctrineForbidden: [] });
  assertEquals(r.refusal, "restriction_floor");
});

// ---------------------------------------------------------------------------
// LA GARDE DÉSARMÉE — la fonction JETTE
// ---------------------------------------------------------------------------

Deno.test("un `restrictionFlag` manquant JETTE — il ne vaut pas `false`", () => {
  // ⚠️ CICATRICE: un paramètre de garde optionnel est une garde désarmée.
  // `false` veut dire « cette personne n'est pas protégée », et c'est une
  // AFFIRMATION. Un appelant qui n'a pas su lire le plancher doit échouer
  // bruyamment, pas affirmer à sa place.
  assertThrows(
    () =>
      gateRequestReport({
        report: reportOf("des burgers"),
        locale: "fr",
        doctrineForbidden: [],
      } as never),
    Error,
    "restrictionFlag",
  );
});

Deno.test("un `doctrineForbidden` manquant JETTE — `[]` et `undefined` diffèrent", () => {
  // `[]` dit « aucun interdit ». `undefined` dit « je n'ai pas su lire la
  // doctrine », et publier un texte non filtré dans ce cas est le défaut que
  // la porte 3 existe pour empêcher.
  assertThrows(
    () =>
      gateRequestReport({
        report: reportOf("des burgers"),
        locale: "fr",
        restrictionFlag: false,
      } as never),
    Error,
    "doctrineForbidden",
  );
});

Deno.test("une locale inconnue JETTE plutôt que de replier sur l'anglais", () => {
  // Un repli silencieux servirait de l'anglais à quelqu'un qui lit le français,
  // et le défaut ressemblerait à un choix de copie.
  assertThrows(
    () => gate({ locale: "de" as ReportLocale }),
    Error,
    "locale",
  );
});

// ---------------------------------------------------------------------------
// PORTE 3 — LA DOCTRINE, LIGNE PAR LIGNE
// ---------------------------------------------------------------------------

Deno.test("PORTE 3 — la ligne qui heurte la doctrine tombe SEULE", () => {
  // Faire tomber le bloc entier pour un terme sur deux retirerait une réponse
  // juste à quelqu'un qui a posé deux questions.
  const r = gate({
    report: reportOf("des burgers et du poisson"),
    doctrineForbidden: [{ ruleId: "doctrine", token: "burger" }],
  });
  assertEquals(r.lines.length, 1);
  assert(r.lines[0].includes("poisson"));
  assertEquals(r.refusal, null);
});

Deno.test("PORTE 3 — quand elle mange TOUT, le motif est nommé", () => {
  const r = gate({
    report: reportOf("des burgers"),
    doctrineForbidden: [{ ruleId: "doctrine", token: "burger" }],
  });
  assertEquals(r.lines, []);
  assertEquals(r.refusal, "doctrine_lock");
});

Deno.test("PORTE 3 — mord en EN comme en FR", () => {
  // ⚠️ Cicatrice: une garde testée dans une seule langue ne garde qu'une
  // langue. Le produit sort en français par défaut, le prompt est en anglais.
  for (const locale of ["fr", "en"] as ReportLocale[]) {
    const r = gateRequestReport({
      report: reportOf("des burgers"),
      locale,
      restrictionFlag: false,
      doctrineForbidden: [{ ruleId: "doctrine", token: "burger" }],
    });
    assertEquals(r.lines, [], `la doctrine mord en ${locale}`);
    assertEquals(r.refusal, "doctrine_lock");
  }
});

Deno.test("RIEN À DIRE n'est PAS un refus", () => {
  // Sans cette distinction, un compteur d'incidents monterait sur du silence
  // parfaitement normal — et un signal qui crie tout le temps ne se lit plus.
  const vide = gate({ report: reportOf("") });
  assertEquals(vide.lines, []);
  assertEquals(vide.refusal, null);

  const illisible = gate({
    report: reportOf("j'ai envie de manger quelque chose de bon cette semaine"),
  });
  assertEquals(illisible.lines, []);
  assertEquals(illisible.refusal, null, "l'illisible n'est pas un refus");
});

// ---------------------------------------------------------------------------
// LE TEXTE — factuel, et il dit les OUI
// ---------------------------------------------------------------------------

Deno.test("le OUI se dit, avec son jour, dans les deux langues", () => {
  const fr = gate({ report: reportOf("des burgers"), locale: "fr" });
  assertEquals(fr.lines, ["Tu as demandé burgers : il y en a jeudi."]);

  const en = gate({ report: reportOf("some burgers"), locale: "en" });
  assertEquals(en.lines, ["You asked for burgers: it's on Thursday."]);
});

Deno.test("plusieurs jours s'énumèrent proprement, dans les deux langues", () => {
  const dishes = [
    { id: "d1", title: "Burger maison", method: "", day: "mon", ingredients: [] },
    { id: "d2", title: "Burger au poulet", method: "", day: "wed", ingredients: [] },
    { id: "d3", title: "Burger de poisson", method: "", day: "fri", ingredients: [] },
  ];
  const fr = gate({ report: reportOf("des burgers", dishes), locale: "fr" });
  assert(fr.lines[0].includes("lundi, mercredi et vendredi"), fr.lines[0]);

  const en = gate({ report: reportOf("some burgers", dishes), locale: "en" });
  assert(en.lines[0].includes("Monday, Wednesday and Friday"), en.lines[0]);
});

Deno.test("l'ABSENT se dit sans dire POURQUOI", () => {
  // ⚠️ « il n'y en a pas cette fois » est honnête. « il n'y en a pas parce
  // que… » invite à une raison qu'on n'a pas calculée, et une raison inventée
  // sur la nourriture de quelqu'un est ce que ce chantier existe pour ne pas
  // produire.
  const fr = gate({ report: reportOf("des sushis"), locale: "fr" });
  assertEquals(fr.lines, ["Tu as demandé sushis : il n'y en a pas cette fois."]);
  assert(!fr.lines[0].includes("parce"));
  assert(!fr.lines[0].includes("objectif"));

  const en = gate({ report: reportOf("some sushi"), locale: "en" });
  assert(en.lines[0].includes("there isn't any this time"));
  assert(!en.lines[0].includes("because"));
});

Deno.test("AUCUN gabarit ne porte de jugement — EN et FR", () => {
  // Le compte-rendu RÉPOND, il n'approuve pas. « bon choix » et « ça rentre
  // dans ton objectif » sont des verdicts sur ce que quelqu'un mange.
  const JUGEMENTS = [
    "bon choix",
    "raisonnable",
    "objectif",
    "ecart",
    "plaisir",
    "good choice",
    "reasonable",
    "goal",
    "treat",
    "cheat",
  ];
  for (const locale of ["fr", "en"] as ReportLocale[]) {
    for (const prefs of ["des burgers", "des sushis"]) {
      const r = gateRequestReport({
        report: reportOf(prefs),
        locale,
        restrictionFlag: false,
        doctrineForbidden: [],
      });
      const texte = r.lines.join(" ").toLowerCase();
      for (const mot of JUGEMENTS) {
        assert(!texte.includes(mot), `« ${mot} » ne doit pas apparaître: ${texte}`);
      }
    }
  }
});

Deno.test("TOUT honoré ⇒ le bloc existe, et ne contient aucun mot de refus", () => {
  // La règle produit de §2.4: si le compte-rendu ne parle que pour dire non,
  // il devient le bruit du refus.
  const fr = gate({ report: reportOf("des burgers et du poisson"), locale: "fr" });
  assertEquals(fr.lines.length, 2);
  assertEquals(fr.refusal, null);
  const texte = fr.lines.join(" ");
  assert(!texte.includes("pas"), `aucun refus dans: ${texte}`);
});

Deno.test("un jour inconnu ne fait pas DISPARAÎTRE la ligne", () => {
  // Perdre le jour rend la phrase moins précise; perdre la phrase rend le
  // compte-rendu muet sur une demande qui a pourtant été servie.
  const dishes = [
    { id: "d1", title: "Burger maison", method: "", day: null, ingredients: [] },
  ];
  const r = gate({ report: reportOf("des burgers", dishes), locale: "fr" });
  assertEquals(r.lines, ["Tu as demandé burgers : c'est au plan."]);
});

Deno.test("le module est PUR — deux appels identiques rendent la même chose", () => {
  const args = {
    report: reportOf("des burgers et du poisson"),
    locale: "fr" as ReportLocale,
    restrictionFlag: false,
    doctrineForbidden: [],
  };
  assertEquals(gateRequestReport(args), gateRequestReport(args));
});

// ---------------------------------------------------------------------------
// LE `why` D'UN PLAT — le trou de §1.3, refermé
// ---------------------------------------------------------------------------

Deno.test("un `why` qui culpabilise est EFFACÉ, et le plat est GARDÉ", () => {
  // ── LE TROU MESURÉ ──────────────────────────────────────────────────────
  // `findGuiltTripping` existait et n'était appliqué qu'au message du soir et à
  // la relance. Le `why` d'un plat vient du MÊME modèle, s'affiche à l'élève,
  // et n'était gardé de ce côté par personne.
  //
  // On efface la phrase, jamais le plat: un générateur qui retire un dîner pour
  // une tournure est un générateur qu'on désarme dans la semaine.
  const meal = parseGeneratedMeal({
    dishes: [{
      title: "Poulet roti",
      method: "Au four.",
      why: "You missed your protein all week, no excuses.",
      ingredients: [{ term: "chicken breast", quantity: "200 g" }],
    }],
  }, PARSE_ARGS);
  assertEquals(meal.dishes.length, 1, "le plat survit");
  assertEquals(meal.dishes[0].why, "", "la phrase tombe");
  assert(meal.issues.some((i) => i.includes("guilt_tripping")));
});

Deno.test("un `why` ordinaire traverse INTACT — la condition de désarmement", () => {
  // ⚠️ SANS CE CAS QUI PASSE, la garde précédente serait indiscernable d'une
  // garde qui efface tous les `why`. Mesuré avant de brancher: 1116 `why` déjà
  // en base, 0 déclenchement.
  const why = "Du poulet le jeudi, parce que tu cuisines vite ce soir-la.";
  const meal = parseGeneratedMeal({
    dishes: [{
      title: "Poulet roti",
      method: "Au four.",
      why,
      ingredients: [{ term: "chicken breast", quantity: "200 g" }],
    }],
  }, PARSE_ARGS);
  assertEquals(meal.dishes[0].why, why);
  assertEquals(meal.issues.filter((i) => i.includes("guilt_tripping")), []);
});
