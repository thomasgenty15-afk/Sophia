import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  effectOf,
  FEEDBACK_QUESTIONS,
  type FeedbackQuestion,
  feedbackIsDue,
  // LOT D — les envies apparues en cours de plan, et leur seul lecteur.
  newEnvyIsAsked,
  OPTION_LABELS,
  // LOT 4C — la relance « pour qui ? », qui doit suivre les QUATRE réponses
  // non neutres de l'échelle à cinq crans.
  portionSubjectIsAsked,
  QUESTION_LABELS,
  QUESTION_OPTIONS,
  QUESTION_READERS,
  questionsFor,
  VARIETY_AXIS_QUESTION,
} from "./plan_feedback.ts";
import { STUDENT_GOALS } from "./week_plan_generation.ts";

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

  // ── LE REPLI DU 2026-08-18 ──────────────────────────────────────────────
  // `maintenance` n'avait AUCUNE quatrième question. Elle en a une depuis
  // qu'elle absorbe `health`, `recomposition` et `performance`, et c'est
  // `enough_variety` — la seule des trois qui n'interroge ni l'appétit ni la
  // quantité, donc la seule qui survive au plancher TCA. Ce test est le
  // MESUREUR de ce choix: le remplacer par `could_finish` ou par
  // `energy_around_sessions` le fait tomber.
  assertEquals(questionsFor("maintenance", false), [
    "cooked",
    "portions",
    "never_again",
    "make_again",
    "enough_variety",
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
  for (const goal of STUDENT_GOALS) {
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
  for (const goal of STUDENT_GOALS) {
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
  assertEquals(effectOf({ portions: "too_much" }).portionAdjust?.direction, "down");
  assertEquals(effectOf({ portions: "not_enough" }).portionAdjust?.direction, "up");
  assertEquals(effectOf({ portions: "right" }).portionAdjust, null);

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
  // ⚠️ LE JETON EST PASSÉ, sinon la boucle est VIDE de sens: sans question,
  // `emphasisHint` est `null` partout et ce test resterait vert en ne mesurant
  // plus rien.
  let seen = 0;
  for (const answer of ["often", "sometimes", "no"]) {
    const hint = effectOf({
      axisQuestion: "hunger_between_meals",
      axisAnswer: answer,
    }).emphasisHint;
    if (hint === null) continue;
    seen += 1;
    assertEquals(
      /\d/.test(hint),
      false,
      `l'accent pour « ${answer} » porte un chiffre: ${hint}`,
    );
  }
  assert(seen > 0, "aucun accent produit: la boucle ne mesure plus rien");
});

Deno.test("⛔ une réponse SANS SON JETON ne produit AUCUN accent inventé", () => {
  // `no` veut dire « pas eu faim » pour hunger_between_meals et « pas fini »
  // pour could_finish. Deviner produirait l'accent inverse une fois sur deux.
  assertEquals(effectOf({ axisAnswer: "no" }).emphasisHint, null);
  assertEquals(effectOf({ axisAnswer: "often" }).emphasisHint, null);

  // ── LE DÉFAUT MESURÉ LE 2026-08-19 ────────────────────────────────────
  // `emphasisHintFor` ne recevait que la réponse: « parfois » à la question de
  // VARIÉTÉ rendait l'accent de SATIÉTÉ, c'est-à-dire une consigne de
  // `fat_loss` sur un plan de `maintenance`. Inerte (aucun appelant), et prête
  // à mordre au premier câblage.
  assertEquals(
    effectOf({ axisQuestion: VARIETY_AXIS_QUESTION, axisAnswer: "sometimes" })
      .emphasisHint,
    null,
  );
  assertEquals(
    effectOf({ axisQuestion: "could_finish", axisAnswer: "no" }).emphasisHint,
    null,
  );
});

// ---------------------------------------------------------------------------
// LOT 4C — LES DEUX CRANS DE L'ÉCHELLE DES PORTIONS
// ---------------------------------------------------------------------------

Deno.test("LOT 4C — LES DEUX CRANS, CÔTE À CÔTE, dans le même test", () => {
  // ⚠️ LE DÉFAUT FERMÉ ICI: le questionnaire est le SEUL producteur de
  // `portion.adjust`, un nouvel ajustement REMPLACE le précédent (jamais de
  // somme), donc un seul cran par sens bloquait à −5 % pour toujours — et le
  // `clear` (−10 %) du moteur était inatteignable par TOUT le produit.
  //
  // ⚠️ LITTÉRAUX EN DUR des deux côtés, jamais `PORTION_ANSWER_ADJUST` comparée
  // à elle-même: un test paramétré par sa propre constante reste vert quand on
  // change la constante.
  assertEquals(effectOf({ portions: "too_much" }).portionAdjust, {
    direction: "down",
    magnitude: "slight",
  });
  assertEquals(effectOf({ portions: "way_too_much" }).portionAdjust, {
    direction: "down",
    magnitude: "clear",
  });
  assertEquals(effectOf({ portions: "not_enough" }).portionAdjust, {
    direction: "up",
    magnitude: "slight",
  });
  assertEquals(effectOf({ portions: "way_not_enough" }).portionAdjust, {
    direction: "up",
    magnitude: "clear",
  });
  // Et la case neutre ne bouge rien: c'est elle qui rend l'échelle lisible.
  assertEquals(effectOf({ portions: "right" }).portionAdjust, null);
});

Deno.test("⛔ LOT 4C — AUCUN JETON EXISTANT N'A CHANGÉ DE SENS", () => {
  // C'EST LA GARDE LA PLUS IMPORTANTE DU LOT, et elle protège des lignes DÉJÀ
  // ÉCRITES: `meal_plan_feedback` ne réécrit jamais une réponse d'hier (même
  // doctrine que la question retirée `energy_around_sessions`). Traduire
  // `too_much` en `clear` retirerait de la nourriture, rétroactivement, à des
  // gens qui n'ont jamais dit « vraiment trop ».
  //
  // ⚠️ LE CRAN EST ÉPINGLÉ, PAS SEULEMENT LE SENS. Un test qui ne regarderait
  // que `direction` resterait vert sur exactement le remappage qu'on interdit.
  assertEquals(effectOf({ portions: "too_much" }).portionAdjust?.magnitude, "slight");
  assertEquals(effectOf({ portions: "not_enough" }).portionAdjust?.magnitude, "slight");
  assertEquals(effectOf({ portions: "too_much" }).portionAdjust?.direction, "down");
  assertEquals(effectOf({ portions: "not_enough" }).portionAdjust?.direction, "up");
  assertEquals(effectOf({ portions: "right" }).portionAdjust, null);

  // ── ET LE LIBELLÉ N'EST PAS LE JETON ────────────────────────────────────
  // Ré-libeller « Trop » en « Un peu trop » décrit la POSITION sur une échelle
  // qui porte maintenant cinq crans; le jeton stocké, lui, garde sa
  // traduction. Les deux moitiés dans le même test, sinon on ne distingue pas
  // « le libellé a bougé » de « le sens a bougé ».
  assertEquals(OPTION_LABELS.too_much, { en: "A bit too much", fr: "Un peu trop" });
  assertEquals(OPTION_LABELS.way_too_much, {
    en: "Really too much",
    fr: "Vraiment trop",
  });
  assertEquals(OPTION_LABELS.right, {
    en: "About right",
    fr: "Ce qu'il fallait",
  });
  assertEquals(OPTION_LABELS.not_enough, { en: "A bit short", fr: "Un peu juste" });
  assertEquals(OPTION_LABELS.way_not_enough, {
    en: "Really not enough",
    fr: "Vraiment pas assez",
  });
});

Deno.test("LOT 4C — l'échelle porte CINQ crans, dans l'ordre, et un seul neutre", () => {
  // L'ordre est celui de l'affichage: une échelle qui ne se lit pas de bout en
  // bout se coche au hasard. Littéral en dur — la liste voyage jusqu'au CHECK
  // de la colonne `portions` et jusqu'aux boutons de l'écran.
  assertEquals(QUESTION_OPTIONS.portions, [
    "way_too_much",
    "too_much",
    "right",
    "not_enough",
    "way_not_enough",
  ]);
  // Une seule case ne produit rien: si deux ne produisaient rien, on poserait
  // une question à cinq réponses dont deux ne changent rien.
  const inert = QUESTION_OPTIONS.portions.filter((o) =>
    effectOf({ portions: o }).portionAdjust === null
  );
  assertEquals(inert, ["right"]);
});

Deno.test("⛔ LOT 4C — « POUR QUI ? » SE POSE SUR LES **QUATRE** RÉPONSES NON NEUTRES", () => {
  // ⚠️ LE PIÈGE DU LOT. `portionSubjectIsAsked` aurait pu relire `portions`
  // elle-même (« `too_much` ou `not_enough` »): les deux jetons NEUFS
  // auraient alors produit un `portion.adjust` de FOYER sans qu'on demande
  // jamais pour qui — c'est-à-dire baisser l'assiette de toute la table sur le
  // cran FORT, en silence, dans un foyer de quatre.
  for (
    const answer of ["way_too_much", "too_much", "not_enough", "way_not_enough"]
  ) {
    assertEquals(
      portionSubjectIsAsked({ portions: answer, mouths: 4 }),
      true,
      `« ${answer} » n'appelle pas la question « pour qui ? »`,
    );
  }
  // LES DEUX MOITIÉS QUI MORDENT, sinon la garde ne mesure rien.
  assertEquals(portionSubjectIsAsked({ portions: "right", mouths: 4 }), false);
  assertEquals(portionSubjectIsAsked({ portions: null, mouths: 4 }), false);
  // Un jeton forgé n'ouvre pas la question — et « constructor » est le cas
  // qui mord: sur un objet littéral il rend une FONCTION, donc « il y a un
  // ajustement », sur une charge qui vient d'un corps de requête HTTP.
  for (const forged of ["constructor", "toString", "TOO_MUCH", " too_much "]) {
    assertEquals(
      portionSubjectIsAsked({ portions: forged, mouths: 4 }),
      false,
      `« ${forged} » a ouvert la question « pour qui ? »`,
    );
    assertEquals(effectOf({ portions: forged }).portionAdjust, null, forged);
  }
  // ⚠️ ET LE SOLO NE LA VOIT TOUJOURS PAS, y compris sur le cran fort: il n'a
  // AUCUNE ligne `household_members`, donc aucun `member:<uuid>` à nommer.
  // Lui poser la question serait lui présenter un choix à une seule issue.
  assertEquals(
    portionSubjectIsAsked({ portions: "way_too_much", mouths: 1 }),
    false,
  );
});

Deno.test("⛔ LOT 4C — le plancher TCA retire toujours la question ENTIÈRE", () => {
  // Le second cran n'ouvre aucune porte: `portions` est retirée AVANT d'être
  // graduée, et la sortie reste indiscernable de celle d'une dynamique
  // inconnue. Les cinq crans ne changent rien à ça — c'est la question qui
  // part, pas ses options.
  const unknownGoal = questionsFor(null, true);
  assertEquals(unknownGoal.includes("portions"), false);
  for (const goal of STUDENT_GOALS) {
    assertEquals(
      JSON.stringify(questionsFor(goal, true)),
      JSON.stringify(unknownGoal),
      `${goal} sous plancher est distinguable d'une dynamique inconnue`,
    );
  }
  // ET LA MOITIÉ QUI PASSE: hors plancher, la question est bien posée — sans
  // elle, ce test resterait vert sur un produit qui ne demande plus jamais les
  // portions à personne.
  for (const goal of STUDENT_GOALS) {
    assert(questionsFor(goal, false).includes("portions"), goal);
  }
});

// ---------------------------------------------------------------------------
// LA 4ᵉ QUESTION — L'AXE FERMÉ, ET LES DEUX QUI NE LE SONT PAS
// ---------------------------------------------------------------------------

Deno.test("épingle: le jeton de l'axe fermé est `enough_variety`", () => {
  // ⚠️ LITTÉRAL EN DUR, pas la constante comparée à elle-même. Le jeton voyage
  // jusqu'à la colonne `axis_question` et jusqu'à l'écran: un renommage d'un
  // seul côté rend un questionnaire qui écrit et n'est plus lu.
  assertEquals(VARIETY_AXIS_QUESTION, "enough_variety");
  assert(
    (FEEDBACK_QUESTIONS as readonly string[]).includes(VARIETY_AXIS_QUESTION),
    "le jeton de l'axe fermé n'est plus une question du vocabulaire",
  );
});

Deno.test("la pression de variété sort du JETON, jamais de la seule réponse", () => {
  // Ce que ce test garde: `no` est une option des TROIS axes. Router sur la
  // réponse seule ferait entrer une réponse à `hunger_between_meals` — celle
  // que le plancher TCA retire — dans le réglage de variété.
  assertEquals(
    effectOf({ axisQuestion: "enough_variety", axisAnswer: "no" })
      .varietyPressure,
    "more",
  );
  assertEquals(
    effectOf({ axisQuestion: "enough_variety", axisAnswer: "sometimes" })
      .varietyPressure,
    "more",
  );
  // « Oui, assez de variété » ne change rien: il n'existe AUCUN `"less"`.
  assertEquals(
    effectOf({ axisQuestion: "enough_variety", axisAnswer: "yes" })
      .varietyPressure,
    null,
  );
  // LES DEUX AUTRES AXES, ET LEURS RÉPONSES LES PLUS PROCHES.
  for (const question of ["hunger_between_meals", "could_finish"]) {
    for (const answer of ["no", "sometimes", "often", "yes", "mostly"]) {
      assertEquals(
        effectOf({ axisQuestion: question, axisAnswer: answer })
          .varietyPressure,
        null,
        `${question}/${answer} a produit une pression de variété`,
      );
    }
  }
  // Sans jeton: rien. L'oubli est FAIL-CLOSED.
  assertEquals(effectOf({ axisAnswer: "no" }).varietyPressure, null);
});

Deno.test("désarmement : aucun retour ⇒ aucun effet", () => {
  const none = effectOf({});
  assertEquals(none.easeCookingBy, 0);
  assertEquals(none.simplifyRecipes, false);
  assertEquals(none.portionAdjust, null);
  assertEquals(none.refusedDishes, []);
  assertEquals(none.emphasisHint, null);
  assertEquals(none.varietyPressure, null);
});

Deno.test("toutes les questions du vocabulaire sont atteignables", () => {
  // Une question déclarée mais qu'aucune dynamique ne pose serait décorative.
  const reached = new Set<FeedbackQuestion>();
  for (const goal of STUDENT_GOALS) {
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
