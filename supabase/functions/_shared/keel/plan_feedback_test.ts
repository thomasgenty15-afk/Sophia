import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  effectOf,
  FEEDBACK_QUESTIONS,
  type FeedbackQuestion,
  feedbackIsDue,
  // LOT D — les envies apparues en cours de plan, et leur seul lecteur.
  newEnvyIsAsked,
  OPTION_LABELS,
  QUESTION_LABELS,
  QUESTION_OPTIONS,
  QUESTION_READERS,
  questionsFor,
} from "./plan_feedback.ts";

// ===========================================================================
// LE RETOUR DE FIN DE PLAN — ce que ce fichier garde
//
// Trois choses, et la première est celle qui a tué le point du dimanche:
//
//   1. CHAQUE QUESTION A UN LECTEUR. Le point du dimanche collectait six axes
//      pour un lecteur qui n'a jamais existé. Ici, un test parcourt la liste
//      des questions et exige l'entrée.
//   2. LE PLANCHER TCA REND LA SORTIE INDISCERNABLE. Sinon le questionnaire
//      devient lui-même un oracle: « on ne m'a pas demandé les portions ».
//   3. LE REGISTRE. On évalue LE PLAN, jamais la personne — testé lexicalement
//      sur toute la table de libellés, dans les deux langues.
// ===========================================================================

Deno.test("CHAQUE question nomme son lecteur — la garde anti-point-du-dimanche", () => {
  for (const q of FEEDBACK_QUESTIONS) {
    const reader = QUESTION_READERS[q];
    assert(
      typeof reader === "string" && reader.trim().length > 20,
      `${q} n'a pas de lecteur écrit — c'est exactement ce qui a tué le point du dimanche`,
    );
  }
  // Et chaque question a ses options fermées: pas de champ libre, qui inviterait
  // à raconter ce qu'on a mangé.
  for (const q of FEEDBACK_QUESTIONS) {
    assert(QUESTION_OPTIONS[q].length > 0, `${q} n'a pas d'options`);
  }
});

Deno.test("chaque question et chaque option se lisent dans les DEUX langues", () => {
  // `profiles.locale` vaut fr-FR par défaut: un questionnaire anglais seul est
  // un questionnaire que la majorité des élèves ne comprend pas.
  for (const q of FEEDBACK_QUESTIONS) {
    const label = QUESTION_LABELS[q];
    assert(label?.en?.trim(), `${q} sans libellé anglais`);
    assert(label?.fr?.trim(), `${q} sans libellé français`);
    assert(label.en !== label.fr, `${q}: le français n'est pas traduit`);
    for (const opt of QUESTION_OPTIONS[q]) {
      const o = OPTION_LABELS[opt];
      assert(o?.en?.trim() && o?.fr?.trim(), `option ${opt} non traduite`);
    }
  }
});

Deno.test("le REGISTRE: on évalue le plan, jamais la personne", () => {
  // Aucun libellé ne doit demander ce qui a été MANGÉ, ni si quelque chose a
  // été TENU / RESPECTÉ / SUIVI — ce serait une question de conformité dans un
  // produit qui a supprimé les scores exprès.
  const forbidden = [
    "did you eat", "what did you eat", "as-tu mangé", "qu'as-tu mangé",
    "stick to", "stuck to", "as-tu tenu", "tu as tenu", "respecté", "suivi le plan",
    "compliance", "adhérence", "on track", "objectif atteint",
  ];
  for (const q of FEEDBACK_QUESTIONS) {
    const both = `${QUESTION_LABELS[q].en} ${QUESTION_LABELS[q].fr}`.toLowerCase();
    for (const bad of forbidden) {
      assertEquals(
        both.includes(bad),
        false,
        `${q} porte un registre de conformité: « ${bad} » dans « ${both} »`,
      );
    }
  }
});

Deno.test("la quatrième question suit l'axe de la dynamique", () => {
  assert(questionsFor("fat_loss", false).includes("hunger_between_meals"));
  assert(questionsFor("muscle_gain", false).includes("could_finish"));
  assert(questionsFor("recomposition", false).includes("could_finish"));
  assert(questionsFor("health", false).includes("enough_variety"));
  assert(questionsFor("performance", false).includes("energy_around_sessions"));

  // `maintenance` n'en a PAS: son objectif est l'écart minimal, lui ajouter une
  // question serait lui ajouter de la charge.
  assertEquals(questionsFor("maintenance", false), [
    "cooked",
    "portions",
    "never_again",
    "make_again",
  ]);

  // ══════════════════════════════════════════════════════════════════════
  // JAMAIS PLUS DE QUATRE GESTES. Au-delà c'est un formulaire, et un
  // formulaire ne se remplit pas.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ LE PLAFOND EST PASSÉ DE 4 À 5 JETONS LE 2026-08-15, ET LA RÈGLE N'A PAS
  // BOUGÉ D'UN POUCE. `never_again` et `make_again` portent sur LA MÊME LISTE —
  // les plats de ce plan — avec deux polarités. L'écran les rend en UN SEUL
  // bloc, une ligne par plat, deux marques possibles: la personne répond à
  // QUATRE choses, pas à cinq.
  //
  // Le jour où un cinquième SUJET apparaît, c'est ce commentaire qu'il faudra
  // contredire, et il n'y a pas de bonne raison de le faire.
  for (const goal of [
    "fat_loss", "muscle_gain", "recomposition", "health", "performance", "maintenance",
  ] as const) {
    assert(questionsFor(goal, false).length <= 5, goal);
    // ET LES DEUX POLARITÉS VONT ENSEMBLE. Une seule des deux posée serait un
    // questionnaire qui n'apprend qu'à éviter, ou qu'à viser.
    const asked = questionsFor(goal, false);
    assertEquals(
      asked.includes("never_again"),
      asked.includes("make_again"),
      `${goal}: une seule des deux polarités est posée`,
    );
  }
});

Deno.test("sous plancher TCA, la sortie est INDISCERNABLE d'une dynamique inconnue", () => {
  // LE DÉFAUT QUE CE TEST GARDE. Si le questionnaire d'un élève flaggé était
  // reconnaissable, il deviendrait lui-même un oracle: « on ne m'a pas demandé
  // les portions, donc je suis marqué ». Égalité de chaînes, pas de forme.
  const unknownGoal = questionsFor(null, true);
  for (const goal of [
    "fat_loss", "muscle_gain", "recomposition", "health", "performance", "maintenance",
  ] as const) {
    assertEquals(
      JSON.stringify(questionsFor(goal, true)),
      JSON.stringify(unknownGoal),
      `${goal} sous plancher est distinguable d'une dynamique inconnue`,
    );
  }

  // Et ce qui a été retiré, nommément.
  const flagged = questionsFor("fat_loss", true);
  assertEquals(flagged.includes("portions"), false, "la portion invite à la restriction");
  assertEquals(flagged.includes("hunger_between_meals"), false, "la faim devient un sujet");
  // Ce qui survit porte sur LE PLAN, pas sur le corps.
  assert(flagged.includes("cooked"));
  assert(flagged.includes("never_again"));
});

Deno.test("un retour est dû une seule fois, sur une fenêtre écoulée, pour un plan vivant", () => {
  const base = { windowState: "elapsed" as const, retired: false, answered: false };
  assert(feedbackIsDue(base));

  assertEquals(feedbackIsDue({ ...base, windowState: "in_window" }), false);
  assertEquals(feedbackIsDue({ ...base, windowState: "not_started" }), false);
  // On n'interroge pas un plan remplacé.
  assertEquals(feedbackIsDue({ ...base, retired: true }), false);
  // ET LE POINT QUI COMPTE: un refus est une réponse. Sans ça, fermer le
  // questionnaire le fait revenir à chaque ouverture — un « non merci »
  // transformé en harcèlement.
  assertEquals(feedbackIsDue({ ...base, answered: true }), false);
});

Deno.test("chaque réponse atteint un lecteur — aucune n'est décorative", () => {
  // « je n'ai pas cuisiné » doit alléger la cuisine ET simplifier.
  const notCooked = effectOf({ cooked: "no" });
  assert(notCooked.easeCookingBy > 0);
  assert(notCooked.simplifyRecipes);

  // « en partie » allège moins, et ne simplifie pas: on a été optimiste, pas
  // hors sujet.
  const partly = effectOf({ cooked: "partly" });
  assert(partly.easeCookingBy > 0 && partly.easeCookingBy < notCooked.easeCookingBy);
  assertEquals(partly.simplifyRecipes, false);

  // Les portions donnent le SENS du ré-ancrage — la vérité terrain du moteur.
  assertEquals(effectOf({ portions: "too_much" }).portionDirection, "down");
  assertEquals(effectOf({ portions: "not_enough" }).portionDirection, "up");
  assertEquals(effectOf({ portions: "right" }).portionDirection, null);

  // Les plats refusés partent aux préférences.
  assertEquals(
    effectOf({ neverAgain: ["lentil soup"] }).refusedDishes,
    ["lentil soup"],
  );
});

Deno.test("`none` n'est jamais traité comme un plat", () => {
  // LE DÉFAUT QUE CE TEST GARDE: « aucun » versé dans les préférences
  // alimentaires y créerait un aliment refusé nommé « none », et le générateur
  // passerait sa vie à éviter un plat qui n'existe pas.
  assertEquals(effectOf({ neverAgain: ["none"] }).refusedDishes, []);
  assertEquals(
    effectOf({ neverAgain: ["none", "lentil soup", "  "] }).refusedDishes,
    ["lentil soup"],
  );
});

Deno.test("aucun accent suggéré ne porte de chiffre", () => {
  // `NUMERIC_TARGET_PATTERNS` rejette en sortie toute masse accolée à une
  // macro: un accent chiffré produirait des lignes systématiquement filtrées,
  // c'est-à-dire une génération dégradée par le retour censé l'améliorer.
  for (const answer of ["often", "sometimes", "no", "flat", "good", "mixed"]) {
    const hint = effectOf({ axisAnswer: answer }).emphasisHint;
    if (hint === null) continue;
    assertEquals(
      /\d/.test(hint),
      false,
      `l'accent pour « ${answer} » porte un chiffre: ${hint}`,
    );
  }
});

Deno.test("une réponse ambiguë ne produit AUCUN accent inventé", () => {
  // `no` veut dire « pas eu faim » pour hunger_between_meals et « pas fini »
  // pour could_finish. Deviner produirait l'accent inverse une fois sur deux.
  assertEquals(effectOf({ axisAnswer: "no" }).emphasisHint, null);
});

Deno.test("désarmement : aucun retour ⇒ aucun effet", () => {
  const none = effectOf({});
  assertEquals(none.easeCookingBy, 0);
  assertEquals(none.simplifyRecipes, false);
  assertEquals(none.portionDirection, null);
  assertEquals(none.refusedDishes, []);
  assertEquals(none.emphasisHint, null);
});

Deno.test("toutes les questions du vocabulaire sont atteignables", () => {
  // Une question déclarée mais qu'aucune dynamique ne pose serait décorative.
  const reached = new Set<FeedbackQuestion>();
  for (const goal of [
    "fat_loss", "muscle_gain", "recomposition", "health", "performance", "maintenance",
  ] as const) {
    for (const q of questionsFor(goal, false)) reached.add(q);
  }
  for (const q of FEEDBACK_QUESTIONS) {
    assert(reached.has(q), `${q} n'est posée par aucune dynamique`);
  }
});

// ---------------------------------------------------------------------------
// LOT D — LES DEUX MANQUES COMBLÉS
// ---------------------------------------------------------------------------

Deno.test("LOT D — l'inverse de `never_again` verse aux préférences, même canal", () => {
  // ⛔ LE SIGNAL LE PLUS PRÉCIEUX DU LOT. Un questionnaire qui ne demande QUE ce
  // qui a raté apprend au produit à ÉVITER, jamais à VISER — et une génération
  // qui n'a que des bornes compose au hasard à l'intérieur.
  const out = effectOf({
    neverAgain: ["Tuna bake"],
    makeAgain: ["Chicken and rice bowls", "Peach yogurt"],
  });
  assertEquals(out.refusedDishes, ["Tuna bake"]);
  assertEquals(out.keptDishes, ["Chicken and rice bowls", "Peach yogurt"]);
});

Deno.test("LOT D — `none` ne devient JAMAIS un plat voulu", () => {
  // Le symétrique exact du refus fantôme: un « aucun » versé aux préférences
  // ferait chercher à vie un plat qui n'existe pas.
  const out = effectOf({ makeAgain: ["none", "  ", "Chicken and rice bowls"] });
  assertEquals(out.keptDishes, ["Chicken and rice bowls"]);
});

Deno.test("LOT D — aucune réponse ⇒ aucun plat voulu, et c'est un désarmement propre", () => {
  assertEquals(effectOf({}).keptDishes, []);
});

Deno.test("LOT D — ⛔ l'envie apparue n'est POSÉE qu'à qui a un lecteur", () => {
  // LA RÈGLE DU FICHIER, APPLIQUÉE À LA LETTRE: une question sans lecteur ne se
  // pose pas. Le lecteur d'une envie est la ligne du foyer
  // (`household_envy_submissions`), et elle n'a qu'UN écrivain — le maître.
  // La poser à quelqu'un d'autre collecterait une phrase que rien ne lit,
  // c'est-à-dire refaire le point du dimanche avec le même mécanisme.
  assertEquals(newEnvyIsAsked({ isHouseholdOwner: true }), true);
  assertEquals(newEnvyIsAsked({ isHouseholdOwner: false }), false);
});
