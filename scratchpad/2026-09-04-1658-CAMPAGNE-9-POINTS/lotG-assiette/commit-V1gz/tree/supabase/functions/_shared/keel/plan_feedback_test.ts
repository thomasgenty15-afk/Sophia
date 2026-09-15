import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  cookingQuestionsAreAsked,
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
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ UN SEUL CHAMP LIBRE, NOMMÉ — le renversement de FF-054 §3.2, borné
  // ══════════════════════════════════════════════════════════════════════
  //
  // La règle d'origine était « pas de champ libre, qui inviterait à raconter ce
  // qu'on a mangé », et elle est JUSTE. Le lot B en fait UNE exception, et
  // c'est cette liste-ci qui la borne — pas un `if` dans un composant.
  //
  // Ce qui rend l'exception tenable, et les trois tiennent ensemble:
  //  ① son LIBELLÉ demande une consigne pour la suite, jamais un récit
  //    (« quelque chose à retenir pour les prochains ? »), et le test de
  //    registre plus bas le vérifie sur les deux langues;
  //  ② elle est FACULTATIVE et DERNIÈRE: la laisser vide ferme le
  //    questionnaire;
  //  ③ ce qui raconte un repas n'a AUCUNE destination côté serveur — le
  //    classifieur du lot A le range en `skipped.meal_story`.
  //
  // ⚠️ ET LA GARDE RESTE ENTIÈRE POUR TOUTES LES AUTRES. Un second jeton
  // ajouté ici fait tomber ce test, ce qui est le point: la prochaine
  // exception devra s'écrire, pas se glisser.
  const FREE_TEXT: readonly string[] = ["anything_else"];
  assertEquals(
    FEEDBACK_QUESTIONS.filter((q) => QUESTION_OPTIONS[q].length === 0),
    FREE_TEXT,
  );
  for (const q of FEEDBACK_QUESTIONS) {
    if (FREE_TEXT.includes(q)) continue;
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

Deno.test("LOT B — TOUTES LES QUESTIONS SONT COMMUNES, et l'axe a disparu", () => {
  // ── CE QUE CE TEST GARDE ────────────────────────────────────────────────
  // La quatrième question suivait la dynamique (`fat_loss` → la faim,
  // `muscle_gain` → « as-tu fini », `maintenance` → la variété). DEUX DES
  // TROIS n'avaient AUCUN lecteur — `emphasisHint` n'a jamais eu d'appelant, et
  // le module l'écrivait en toutes lettres. La règle fondatrice du fichier
  // (« chaque question nomme son lecteur avant d'être posée ») les condamnait
  // depuis le premier jour; le lot B les retire.
  const asked = questionsFor(false);
  assertEquals(asked.includes("hunger_between_meals" as never), false);
  assertEquals(asked.includes("could_finish" as never), false);

  // ⚠️ `enough_variety` DEVIENT COMMUNE, et c'est le point: son champ
  // (`variety`) est lu par les DEUX lanes pour TOUT LE MONDE. Ne la demander
  // qu'à `maintenance` rendait le cran inatteignable aux deux autres
  // dynamiques — exactement le défaut que les deux crans neufs de `portions`
  // ont fermé le 2026-08-19.
  assertEquals(asked, [
    "cooked",
    "portions",
    "difficulty",
    "speed",
    "enough_variety",
    "never_again",
    "make_again",
    "anything_else",
  ]);

  // ⚠️ LA SORTIE NE DÉPEND PLUS DE LA DYNAMIQUE — et c'est ce qui rend
  // l'indiscernabilité sous plancher STRUCTURELLE (voir le test suivant).
  // `questionsFor` ne prend plus d'objectif: un appelant qui en passait un ne
  // compile plus, ce qui est la seule façon de garantir qu'aucun écran ne pose
  // encore une question d'axe.
  assertEquals(questionsFor.length, 1);

  // ET LES DEUX POLARITÉS VONT ENSEMBLE. Une seule des deux posée serait un
  // questionnaire qui n'apprend qu'à éviter, ou qu'à viser.
  assertEquals(asked.includes("never_again"), asked.includes("make_again"));
});

Deno.test("⛔ LOT B — LA CHARGE AUGMENTE, ET ELLE EST BORNÉE ET MESURÉE", () => {
  // ══════════════════════════════════════════════════════════════════════
  // « JAMAIS PLUS DE QUATRE GESTES. Au-delà c'est un formulaire, et un
  // formulaire ne se remplit pas. » — la règle de FF-054, et le lot B la met
  // sous tension. Ce test est le MESUREUR, pas un plafond arbitraire.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Ce qui compte est le nombre de GESTES, pas de jetons:
  //   · `never_again` et `make_again` portent sur LA MÊME LISTE d'aliments,
  //     rendue en UN bloc avec deux marques — un geste, pas deux;
  //   · `anything_else` est FACULTATIF: le laisser vide ferme le questionnaire;
  //   · `difficulty` et `speed` ne sont posées qu'à qui a cuisiné.
  //
  // Reste, pour quelqu'un qui a cuisiné: cooked, portions (+ « pour qui »),
  // difficulty, speed, variety, le bloc d'aliments = SIX gestes obligatoires.
  // C'est DEUX de plus qu'avant, et c'est le prix de ne plus deviner lequel
  // des deux réglages de cuisine la personne voulait bouger.
  //
  // ⏸ NOMMÉ AU RAPPORT DU LOT B: soit on accepte, soit on scinde le
  // questionnaire (les indices un soir, les plats un autre) — un lot à part.
  const asked = questionsFor(false);
  const dishBlock = asked.filter((q) => q === "never_again" || q === "make_again");
  const optional = asked.filter((q) => q === "anything_else");
  const gestures = asked.length - (dishBlock.length - 1) - optional.length;
  assertEquals(gestures, 6, "le nombre de gestes obligatoires a bougé sans qu'on le dise");
});

Deno.test("sous plancher TCA, la sortie est INDISCERNABLE d'une dynamique inconnue", () => {
  // LE DÉFAUT QUE CE TEST GARDE. Si le questionnaire d'un élève flaggé était
  // reconnaissable, il deviendrait lui-même un oracle: « on ne m'a pas demandé
  // les portions, donc je suis marqué ».
  //
  // ⚠️ LA PROPRIÉTÉ EST DEVENUE STRUCTURELLE AU LOT B, et ce test le dit:
  // `questionsFor` ne prend plus d'objectif, donc il n'existe PLUS AUCUN
  // couple (dynamique, plancher) qui puisse diverger. Avant, la garde tenait à
  // un ordre d'opérations — retirer les questions AVANT d'ajouter celle de
  // l'axe, et n'en ajouter aucune sous plancher.
  assertEquals(questionsFor.length, 1, "un objectif est revenu dans la signature");

  // Et ce qui a été retiré, nommément.
  const flagged = questionsFor(true);
  assertEquals(flagged.includes("portions"), false, "la portion invite à la restriction");
  // ⚠️ `hunger_between_meals` N'EST PLUS DANS LE VOCABULAIRE DU TOUT depuis le
  // lot B: elle faisait de la faim un sujet, et elle n'avait aucun lecteur.
  // Elle n'est donc plus retirée par le plancher — elle n'existe plus.
  assertEquals(FEEDBACK_QUESTIONS.includes("hunger_between_meals" as never), false);
  // Ce qui survit porte sur LE PLAN, pas sur le corps: « as-tu pu cuisiner »,
  // « était-ce trop dur », « trop long », « assez varié », « un aliment à ne
  // plus servir ». Aucune n'interroge l'appétit ni la quantité.
  assert(flagged.includes("cooked"));
  assert(flagged.includes("difficulty"));
  assert(flagged.includes("speed"));
  assert(flagged.includes("enough_variety"));
  assert(flagged.includes("never_again"));
  // ⚠️ ET LE PLANCHER NE RETIRE QU'UNE SEULE QUESTION: la liste complète moins
  // `portions`. Un plancher qui retirerait plus rendrait le questionnaire d'un
  // élève flaggé reconnaissable à sa longueur.
  assertEquals(flagged.length, questionsFor(false).length - 1);
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
  // ── LOT B · `cooked` NE DÉPLACE PLUS RIEN TOUT SEUL ────────────────────
  // Il retirait 15 minutes de session ET simplifiait les recettes d'un cran
  // sur « non » — une réponse unique, deux déductions, et le produit décidait
  // lequel des deux problèmes la personne avait eu. Il est redevenu une GARDE:
  // il décide si les deux questions de cuisine sont posées.
  const notCooked = effectOf({ cooked: "no" });
  assertEquals(notCooked.difficultyStep, null);
  assertEquals(notCooked.speedStep, null);
  assertEquals(cookingQuestionsAreAsked("no"), false);
  // Et « en partie » compte comme cuisiné: la personne a assez cuisiné pour
  // savoir si c'était long ou dur. C'est même le cas le plus informatif.
  assertEquals(cookingQuestionsAreAsked("partly"), true);
  assertEquals(cookingQuestionsAreAsked("yes"), true);
  assertEquals(cookingQuestionsAreAsked(null), false);

  // ── LOT B · LES DEUX CRANS DE CUISINE, DANS LES DEUX SENS ──────────────
  assertEquals(
    effectOf({ cooked: "yes", difficulty: "too_hard" }).difficultyStep,
    "down",
  );
  assertEquals(
    effectOf({ cooked: "yes", difficulty: "could_do_more" }).difficultyStep,
    "up",
  );
  assertEquals(effectOf({ cooked: "yes", difficulty: "fine" }).difficultyStep, null);
  assertEquals(effectOf({ cooked: "partly", speed: "too_long" }).speedStep, "down");
  assertEquals(
    effectOf({ cooked: "partly", speed: "had_more_time" }).speedStep,
    "up",
  );
  assertEquals(effectOf({ cooked: "partly", speed: "fine" }).speedStep, null);

  // ⛔ ET LA GARDE MORD DANS `effectOf` AUSSI, pas seulement à l'écran: une
  // réponse arrivée sans que `cooked` l'autorise vient d'un client cassé ou
  // d'une charge forgée, et elle déplacerait un réglage RÉEL.
  assertEquals(
    effectOf({ cooked: "no", difficulty: "too_hard", speed: "too_long" })
      .difficultyStep,
    null,
  );
  assertEquals(
    effectOf({ cooked: null, difficulty: "too_hard" }).difficultyStep,
    null,
  );

  // Les portions donnent le SENS du ré-ancrage — la vérité terrain du moteur.
  assertEquals(effectOf({ portions: "too_much" }).portionAdjust?.direction, "down");
  assertEquals(effectOf({ portions: "not_enough" }).portionAdjust?.direction, "up");
  assertEquals(effectOf({ portions: "right" }).portionAdjust, null);

  // ── LOT B · LES ALIMENTS PARTENT AUX PRÉFÉRENCES, AVEC LEUR PERSONNE ───
  assertEquals(
    effectOf({ neverAgain: [{ food: "saumon", subject: "member:x" }] })
      .refusedFoods,
    [{ food: "saumon", subject: "member:x" }],
  );
  assertEquals(
    effectOf({ makeAgain: [{ food: "lentilles", subject: null }] }).keptFoods,
    [{ food: "lentilles", subject: null }],
  );
  // ⚠️ ET LA FORME HÉRITÉE EST LUE: une ligne d'avant le lot B porte des
  // TITRES de plats. Elle devient `{food: <le titre>, subject: null}` — ce que
  // la personne a répondu, sans reclassement. Le reclasser serait deviner si
  // c'est le poulet, le citron ou le rôtissage qu'elle ne veut plus.
  assertEquals(
    effectOf({ neverAgain: ["lentil soup"] }).refusedFoods,
    [{ food: "lentil soup", subject: null }],
  );
});

Deno.test("⛔ LOT B — LA VARIÉTÉ EST LUE DU CHAMP NEUF, PUIS DE L'HÉRITÉ, JAMAIS DES DEUX", () => {
  // Le champ neuf d'abord.
  assertEquals(effectOf({ variety: "no" }).varietyPressure, "more");
  assertEquals(effectOf({ variety: "sometimes" }).varietyPressure, "more");
  assertEquals(effectOf({ variety: "yes" }).varietyPressure, null);

  // ⚠️ L'HÉRITÉ ENSUITE — une ligne écrite avant le lot B porte sa réponse
  // dans `axis_answer`, sous son jeton. Sans cette lecture, elle cesserait
  // d'agir entre deux chargements.
  assertEquals(
    effectOf({ axisQuestion: "enough_variety", axisAnswer: "no" })
      .varietyPressure,
    "more",
  );

  // ⛔ ET LE JETON HÉRITÉ EST VÉRIFIÉ, PAS SUPPOSÉ. `no` était une option des
  // TROIS anciens axes: lire `axis_answer` sans son jeton ferait entrer une
  // réponse à « sur ta faim » — que le plancher TCA retirait — dans le réglage
  // de variété.
  assertEquals(
    effectOf({ axisQuestion: "hunger_between_meals", axisAnswer: "often" })
      .varietyPressure,
    null,
  );
  assertEquals(
    effectOf({ axisQuestion: "could_finish", axisAnswer: "no" }).varietyPressure,
    null,
  );
  // Sans jeton: rien. L'oubli est FAIL-CLOSED.
  assertEquals(effectOf({ axisAnswer: "no" }).varietyPressure, null);

  // ⛔ JAMAIS LES DEUX: une ligne en cours de migration porte les deux, et les
  // additionner compterait deux fois la même réponse. Le neuf gagne.
  assertEquals(
    effectOf({
      variety: "yes",
      axisQuestion: "enough_variety",
      axisAnswer: "no",
    }).varietyPressure,
    null,
  );
});

Deno.test("`none` n'est jamais traité comme un plat", () => {
  // LE DÉFAUT QUE CE TEST GARDE: « aucun » versé dans les préférences
  // alimentaires y créerait un aliment refusé nommé « none », et le générateur
  // passerait sa vie à éviter un plat qui n'existe pas.
  assertEquals(effectOf({ neverAgain: ["none"] }).refusedFoods, []);
  assertEquals(
    effectOf({ neverAgain: ["none", "lentil soup", "  "] }).refusedFoods,
    [{ food: "lentil soup", subject: null }],
  );
  // ⚠️ ET SOUS LA FORME NEUVE AUSSI: un `{food: "none"}` forgé ne doit pas
  // passer par la porte que la forme héritée ferme.
  assertEquals(
    effectOf({ neverAgain: [{ food: "none", subject: "household" }] })
      .refusedFoods,
    [],
  );
});

Deno.test("⛔ LOT B — L'ACCENT SUGGÉRÉ A ÉTÉ RETIRÉ, ET SES DEUX QUESTIONS AVEC", () => {
  // ── CE QUE CES DEUX TESTS GARDAIENT, ET POURQUOI ILS DISPARAISSENT ──────
  // Ils tenaient `emphasisHint`: qu'il ne porte aucun chiffre (une consigne
  // chiffrée est filtrée en sortie par `NUMERIC_TARGET_PATTERNS`), et qu'il ne
  // s'invente pas sans son jeton (`no` était une réponse des TROIS axes).
  //
  // ⛔ LE CHAMP N'A JAMAIS EU D'APPELANT. Le module l'écrivait en toutes
  // lettres — « TROU NOMMÉ » — et la règle fondatrice du fichier interdit une
  // question dont on ne peut pas écrire le lecteur. Le lot B retire donc les
  // deux questions qui n'atterrissaient que là (`hunger_between_meals`,
  // `could_finish`) ET le champ. Les trois rabattements examinés le 2026-08-19
  // restent refusés, et leur motif est écrit dans le vocabulaire de
  // `plan_feedback.ts`, à l'endroit où quelqu'un déciderait de les reposer.
  //
  // ⚠️ CE TEST N'EST PAS UN VIDE: il empêche le retour silencieux du champ.
  const effect = effectOf({ cooked: "yes", portions: "too_much" });
  assertEquals(
    Object.prototype.hasOwnProperty.call(effect, "emphasisHint"),
    false,
    "`emphasisHint` est revenu: un champ sans appelant, pour la seconde fois",
  );
  for (const gone of ["hunger_between_meals", "could_finish"]) {
    assertEquals(
      (FEEDBACK_QUESTIONS as readonly string[]).includes(gone),
      false,
      `${gone} est revenue dans le vocabulaire sans que son lecteur soit nommé`,
    );
    assertEquals(
      Object.prototype.hasOwnProperty.call(QUESTION_OPTIONS, gone),
      false,
      `${gone} a encore des options: elle serait posable`,
    );
  }
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
  assertEquals(questionsFor(true).includes("portions"), false);
  // ET LA MOITIÉ QUI PASSE: hors plancher, la question est bien posée — sans
  // elle, ce test resterait vert sur un produit qui ne demande plus jamais les
  // portions à personne.
  assert(questionsFor(false).includes("portions"));
  // ⚠️ ET LES CINQ CRANS SONT TOUJOURS LÀ: c'est la QUESTION qui part, pas ses
  // options.
  assertEquals(QUESTION_OPTIONS.portions.length, 5);
});

// ---------------------------------------------------------------------------
// LA 4ᵉ QUESTION — L'AXE FERMÉ, ET LES DEUX QUI NE LE SONT PAS
// ---------------------------------------------------------------------------

Deno.test("épingle: le jeton de la variété est `enough_variety`, hier comme aujourd'hui", () => {
  // ⚠️ LITTÉRAL EN DUR. Le jeton voyage jusqu'à la colonne `variety`, jusqu'à
  // la colonne HÉRITÉE `axis_question`, et jusqu'à l'écran: un renommage d'un
  // seul côté rend un questionnaire qui écrit et n'est plus lu.
  //
  // ⚠️ IL N'EST PLUS EXPORTÉ COMME « LE JETON DE L'AXE » — le lot B a retiré
  // l'axe, et la question est commune. Le jeton, lui, ne bouge pas: des lignes
  // en base le portent, et `legacyVarietyAnswer` le compare à ce littéral.
  assert(
    (FEEDBACK_QUESTIONS as readonly string[]).includes("enough_variety"),
    "le jeton de la variété n'est plus une question du vocabulaire",
  );
  assertEquals(QUESTION_OPTIONS.enough_variety, ["yes", "sometimes", "no"]);
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
  assertEquals(none.difficultyStep, null);
  assertEquals(none.speedStep, null);
  assertEquals(none.portionAdjust, null);
  assertEquals(none.refusedFoods, []);
  assertEquals(none.keptFoods, []);
  assertEquals(none.varietyPressure, null);
});

Deno.test("toutes les questions du vocabulaire sont atteignables", () => {
  // Une question déclarée que personne ne pose serait décorative — et une
  // valeur décorative finit par être pilotée (R6).
  //
  // ⚠️ DEPUIS LE LOT B, LA GARDE EST PLUS FORTE: toutes les questions sont
  // communes, donc `questionsFor(false)` DOIT rendre le vocabulaire ENTIER. Un
  // jeton déclaré et non posé fait tomber ce test immédiatement, au lieu de se
  // cacher derrière une dynamique qu'aucun compte n'a.
  const reached = new Set<FeedbackQuestion>(questionsFor(false));
  for (const q of FEEDBACK_QUESTIONS) {
    assert(reached.has(q), `${q} n'est posée à personne`);
  }
  assertEquals(reached.size, FEEDBACK_QUESTIONS.length);
});

// ---------------------------------------------------------------------------
// LOT D — LES DEUX MANQUES COMBLÉS
// ---------------------------------------------------------------------------

Deno.test("LOT D — l'inverse de `never_again` verse aux préférences, même canal", () => {
  // ⛔ LE SIGNAL LE PLUS PRÉCIEUX DU LOT. Un questionnaire qui ne demande QUE ce
  // qui a raté apprend au produit à ÉVITER, jamais à VISER — et une génération
  // qui n'a que des bornes compose au hasard à l'intérieur.
  const out = effectOf({
    neverAgain: [{ food: "thon", subject: "member:tom" }],
    makeAgain: [
      { food: "poulet", subject: "household" },
      { food: "yaourt", subject: null },
    ],
  });
  assertEquals(out.refusedFoods, [{ food: "thon", subject: "member:tom" }]);
  assertEquals(out.keptFoods, [
    { food: "poulet", subject: "household" },
    { food: "yaourt", subject: null },
  ]);
});

Deno.test("LOT D — `none` ne devient JAMAIS un plat voulu", () => {
  // Le symétrique exact du refus fantôme: un « aucun » versé aux préférences
  // ferait chercher à vie un plat qui n'existe pas.
  const out = effectOf({ makeAgain: ["none", "  ", "Chicken and rice bowls"] });
  assertEquals(out.keptFoods, [
    { food: "Chicken and rice bowls", subject: null },
  ]);
});

Deno.test("LOT D — aucune réponse ⇒ aucun plat voulu, et c'est un désarmement propre", () => {
  assertEquals(effectOf({}).keptFoods, []);
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
