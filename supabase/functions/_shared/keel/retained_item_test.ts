import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  canProduce,
  defaultScopeFor,
  HOUSEHOLD_SUBJECT,
  LOGISTICS_FIELDS,
  memberSubject,
  parseRetainedDay,
  parseRetainedItem,
  parseRetainedItems,
  parseRetainedKind,
  parseRetainedScope,
  parseRetainedSource,
  parseRetainedSubject,
  PORTION_DIRECTIONS,
  PORTION_MAGNITUDES,
  type PortionAdjustItem,
  type PortionAdjustMember,
  RETAINED_KINDS,
  RETAINED_SCOPES,
  RETAINED_SOURCES,
  retainedItemToJson,
  RHYTHM_OCCASIONS,
  subjectMemberId,
  subjectsForPortionAdjust,
} from "./retained_item.ts";
// Les deux listes que ce module RECOPIE. Un test n'est dans aucun cycle
// d'imports: il peut lire les sources d'origine, et c'est là toute l'astuce.
import { EATING_OCCASIONS } from "./meal_generation.ts";
import { MEMBER_AGE_STATES } from "./household.ts";
import { DAY_TOKENS } from "./tokens.ts";

// ===========================================================================
// CE QUE CE FICHIER GARDE
//
// Pas « la fonction rend un objet ». Ce qui est testé, ce sont les façons dont
// la mémoire structurée se trahirait en production:
//
//   1. une famille de SÉCURITÉ qui apparaît dans la liste des `kind` — une
//      allergie rangée dans un magasin probabiliste;
//   2. un `subject` difforme replié sur `household` — une mesure destinée à
//      une bouche appliquée à toute la table;
//   3. un `portion.adjust` à la baisse qui atteint un enfant, en silence;
//   4. un gramme dans un `portion.adjust` — une précision fabriquée;
//   5. un producteur qui écrit une famille que la matrice lui interdit;
//   6. un `craving` promu durable, une portion rendue éphémère.
//
// CHAQUE invariant a DEUX tests: un cas qui PASSE et un cas qui REFUSE. Une
// garde sans cas passant est une garde cassée qui ressemble à une garde qui
// marche.
// ===========================================================================

const UUID_A = "11111111-2222-4333-8444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MEM_ID = "99999999-8888-4777-8666-555555555555";

/** Une ligne écrite à la main, valide. Le socle de tous les cas passants. */
function written(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "food.exclude",
    scope: "durable",
    subject: HOUSEHOLD_SUBJECT,
    text: "les rochers coco",
    value: null,
    source: "written",
    at: "2026-08-18",
    item: "",
    ...over,
  };
}

/** Un `portion.adjust` du questionnaire — le seul producteur qui en a le droit. */
function portion(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "portion.adjust",
    scope: "durable",
    subject: HOUSEHOLD_SUBJECT,
    text: "les parts étaient un peu trop grosses",
    value: { direction: "down", magnitude: "slight" },
    source: "questionnaire",
    at: "2026-08-18",
    item: "",
    ...over,
  };
}

function member(
  memberId: string,
  ageState: PortionAdjustMember["ageState"],
): PortionAdjustMember {
  return { memberId, ageState };
}

// ===========================================================================
// 1. LES LISTES FERMÉES — et l'absence de sécurité, PROUVÉE
// ===========================================================================

Deno.test("les huit `kind`, exactement — ni un de plus, ni un de moins", () => {
  // Épinglage LITTÉRAL. Ajouter une famille sans lecteur fait rougir ici, et
  // c'est le but: `plan_feedback.ts` a payé le point du dimanche, six axes
  // collectés pour un lecteur qui n'existait pas.
  assertEquals([...RETAINED_KINDS], [
    "food.exclude",
    "food.prefer",
    "method.avoid",
    "method.prefer",
    "portion.adjust",
    "rhythm.set",
    "logistics.set",
    "craving",
  ]);
  assertEquals(RETAINED_KINDS.length, 8);
});

Deno.test("⛔ AUCUN `kind` de sécurité n'existe, et ce test le prouve", () => {
  // LA GARDE STRUCTURELLE DU CHANTIER. Une allergie, une intolérance, un
  // régime, une condition médicale ont leur table — `student_safety_constraints`
  // — chargée synchrone, sans ranking, avec consentement. Ce module-ci est
  // probabiliste par construction: il reçoit des propositions d'un modèle.
  //
  // Quelqu'un qui coche « plus jamais » sur un plat aux arachides n'a pas
  // déclaré une allergie. Si ce test rougit, la question n'est pas « comment le
  // faire passer » — c'est « pourquoi quelqu'un range une garantie médicale
  // dans un magasin qui n'en offre aucune ».
  const SECURITY = /allerg|intoler|regime|diet|safety|medical|sensitive|condition/i;
  for (const kind of RETAINED_KINDS) {
    assertEquals(
      SECURITY.test(kind),
      false,
      `\`${kind}\` ressemble à une famille de sécurité. Elle ne naît JAMAIS ` +
        `d'un retour classé: sa table est student_safety_constraints.`,
    );
  }
  // Et les jetons nommément: aucun ne se parse.
  for (
    const forbidden of [
      "allergy",
      "intolerance",
      "medical",
      "diet",
      "safety",
      "food.allergy",
      "safety.exclude",
    ]
  ) {
    assertEquals(parseRetainedKind(forbidden), null, forbidden);
  }
});

Deno.test("les deux `scope`, les quatre `source`, et rien d'autre", () => {
  assertEquals([...RETAINED_SCOPES], ["durable", "next_plan"]);
  assertEquals([...RETAINED_SOURCES], [
    "written",
    "questionnaire",
    "conversation",
    "draft_note",
  ]);
});

Deno.test("les six moments sont la RECOPIE exacte de `EATING_OCCASIONS`", () => {
  // La recopie évite un cycle d'imports (`meal_generation.ts` →
  // `household_portions.ts`), et un cycle ne se voit ni au typecheck ni à la
  // lecture — seulement à l'exécution. Ce test est la moitié qui manque au
  // patron: la copie est PROUVÉE ÉGALE, sinon elle raconterait ce que les
  // chaînes disaient le jour où on l'a écrite.
  assertEquals([...RHYTHM_OCCASIONS], [...EATING_OCCASIONS]);
});

Deno.test("les cinq champs de logistique, et les jetons de jour du dépôt", () => {
  assertEquals([...LOGISTICS_FIELDS], [
    "cook_days",
    "cooking_time_min",
    "recipe_difficulty",
    "variety",
    "budget_amount",
  ]);
  // `cook_days` n'accepte que le vocabulaire de `tokens.ts`. Une seconde
  // taxonomie de jours a déjà coûté cher à ce dépôt.
  assertEquals(DAY_TOKENS.length, 7);
});

Deno.test("`MemberAgeState` a bien trois états — le booléen ne revient pas", () => {
  // `is_minor: boolean` ne peut plus décrire le monde: « je ne sais pas » et
  // « majeur » doivent produire des résultats OPPOSÉS. Si cette liste retombe
  // à deux, la règle des mineurs ci-dessous devient fausse en silence.
  assertEquals([...MEMBER_AGE_STATES], ["minor", "adult", "unknown"]);
});

// ===========================================================================
// 2. LES PARSEURS — un refus, jamais un repli
// ===========================================================================

Deno.test("un `kind`, un `scope`, une `source` inconnus rendent null", () => {
  assertEquals(parseRetainedKind("food.exclude"), "food.exclude");
  assertEquals(parseRetainedKind("  FOOD.EXCLUDE "), "food.exclude");
  assertEquals(parseRetainedKind("food.hate"), null);
  assertEquals(parseRetainedKind(null), null);
  assertEquals(parseRetainedKind(42), null);

  assertEquals(parseRetainedScope("next_plan"), "next_plan");
  assertEquals(parseRetainedScope("forever"), null);
  assertEquals(parseRetainedScope(undefined), null);

  assertEquals(parseRetainedSource("conversation"), "conversation");
  assertEquals(parseRetainedSource("memory"), null);
  assertEquals(parseRetainedSource(""), null);
});

Deno.test("un `subject` malformé est un REFUS, jamais un repli sur household", () => {
  // LE DÉFAUT QUE CE TEST GARDE. Replier `member:marc` sur `household`
  // appliquerait à toute la table une mesure destinée à une bouche — et pour un
  // `portion.adjust` à la baisse, ça veut dire retirer de la nourriture à
  // quelqu'un que personne n'a visé.
  assertEquals(parseRetainedSubject("household"), "household");
  assertEquals(parseRetainedSubject(`member:${UUID_A}`), `member:${UUID_A}`);
  assertEquals(parseRetainedSubject(`  MEMBER:${UUID_A.toUpperCase()}  `), `member:${UUID_A}`);

  for (
    const bad of [
      "member:marc",
      "member:",
      "member",
      "Marc",
      "zoé",
      `member:${UUID_A.slice(0, 30)}`,
      "",
      null,
      undefined,
      42,
      {},
    ]
  ) {
    assertEquals(parseRetainedSubject(bad), null, JSON.stringify(bad));
  }
});

Deno.test("`memberSubject` / `subjectMemberId` font l'aller-retour, ou rien", () => {
  assertEquals(memberSubject(UUID_A), `member:${UUID_A}`);
  assertEquals(memberSubject("marc"), null);
  assertEquals(memberSubject(null), null);
  assertEquals(subjectMemberId(`member:${UUID_A}`), UUID_A);
  assertEquals(subjectMemberId(HOUSEHOLD_SUBJECT), null);
});

Deno.test("`at` est un jour propre, et il n'est pas reprojeté en UTC", () => {
  assertEquals(parseRetainedDay("2026-08-18"), "2026-08-18");
  assertEquals(parseRetainedDay("2024-02-29"), "2024-02-29"); // bissextile
  assertEquals(parseRetainedDay("2026-02-29"), null); // pas bissextile
  assertEquals(parseRetainedDay("2026-13-01"), null);
  assertEquals(parseRetainedDay("2026-00-10"), null);
  assertEquals(parseRetainedDay("2026-08-32"), null);
  // `Date.parse` accepterait les trois suivantes, et les REPROJETTERAIT: un
  // « mardi soir » à Paris ressortirait mercredi. `at` est le jour où la
  // personne l'a dit, dans SA journée.
  assertEquals(parseRetainedDay("2026-8-1"), null);
  assertEquals(parseRetainedDay("2026-08-18T23:30:00Z"), null);
  assertEquals(parseRetainedDay("18/08/2026"), null);
  assertEquals(parseRetainedDay(""), null);
  assertEquals(parseRetainedDay(null), null);
});

// ===========================================================================
// 3. `text` — la ligne qu'on ne saurait pas afficher n'existe pas
// ===========================================================================

Deno.test("un `text` vide ou blanc fait REFUSER l'item — et un texte le fait passer", () => {
  // LE CAS QUI PASSE (sans lui, la garde pourrait tout refuser et en avoir
  // l'air correcte).
  const ok = parseRetainedItem(written({ text: "  les rochers coco  " }));
  assert(ok, "un texte lisible doit passer");
  assertEquals(ok.text, "les rochers coco"); // trimé, pas rejeté

  // LES REFUS. `text` est la vérité affichée: une entrée dont on ne saurait pas
  // écrire la phrase que la personne lira ne s'écrit pas. C'est ce qui rend la
  // promesse « rien d'opaque » vérifiable ligne à ligne.
  for (const bad of ["", "   ", "\n\t ", " ", null, undefined, 42, {}]) {
    assertEquals(
      parseRetainedItem(written({ text: bad })),
      null,
      JSON.stringify(bad),
    );
  }
});

// ===========================================================================
// 4. INVARIANT — `craving` est TOUJOURS `next_plan`
// ===========================================================================

Deno.test("`craving` passe en `next_plan`, et est REFUSÉ en `durable`", () => {
  const ok = parseRetainedItem(written({
    kind: "craving",
    scope: "next_plan",
    text: "des fajitas la semaine prochaine",
  }));
  assert(ok, "un craving next_plan doit passer");
  assertEquals(ok.scope, "next_plan");

  // Une envie qui devient durable cesse d'être une envie et devient une
  // habitude qu'on n'a pas demandée. C'est un REFUS, pas une correction:
  // corriger masquerait le producteur qui l'a mal écrite.
  assertEquals(
    parseRetainedItem(written({
      kind: "craving",
      scope: "durable",
      text: "des fajitas",
    })),
    null,
  );
});

// ===========================================================================
// 5. INVARIANT — `portion.adjust` est TOUJOURS `durable`, et SEUL le
//    questionnaire en produit
// ===========================================================================

Deno.test("`portion.adjust` passe en `durable`, et est REFUSÉ en `next_plan`", () => {
  const ok = parseRetainedItem(portion());
  assert(ok, "un portion.adjust durable du questionnaire doit passer");
  assertEquals(ok.scope, "durable");

  // Un corps ne change pas d'une semaine sur l'autre; un ajustement qui expire
  // ferait re-servir la mauvaise part au plan suivant.
  assertEquals(parseRetainedItem(portion({ scope: "next_plan" })), null);
});

Deno.test("SEUL le questionnaire produit un `portion.adjust`", () => {
  // LE POINT CENTRAL DU CHANTIER. Une mesure a besoin d'un sujet, et la
  // conversation NE SAIT PAS l'attribuer: « les portions étaient trop grosses »
  // dans un foyer de quatre ne désigne personne. Le questionnaire pose la
  // question avec la liste du foyer sous les yeux.
  assertEquals(canProduce("questionnaire", "portion.adjust"), true);
  assertEquals(canProduce("conversation", "portion.adjust"), false);
  assertEquals(canProduce("draft_note", "portion.adjust"), false);

  assert(parseRetainedItem(portion({ source: "questionnaire" })));
  assertEquals(
    parseRetainedItem(portion({ source: "conversation", item: MEM_ID, confidence: 0.9 })),
    null,
  );
  assertEquals(parseRetainedItem(portion({ source: "draft_note" })), null);
});

Deno.test("⛔ AUCUN gramme, aucune calorie dans un `portion.adjust`", () => {
  // LE CAS QUI PASSE.
  const ok = parseRetainedItem(portion());
  assert(ok && ok.kind === "portion.adjust");
  assertEquals(ok.value, { direction: "down", magnitude: "slight" });

  // LES REFUS. Une personne dit « trop gros », pas « −80 g ». Traduire son
  // adverbe en nombre serait fabriquer une précision qu'elle n'a pas donnée.
  // L'item ENTIER tombe: nettoyer la clé effacerait la preuve qu'un producteur
  // fabrique des grammes.
  for (
    const poison of [
      { direction: "down", magnitude: "slight", grams: 80 },
      { direction: "down", magnitude: "slight", kcal: 200 },
      { direction: "down", magnitude: "clear", percent: 15 },
      { direction: "down", magnitude: "clear", delta: -80 },
      { direction: "up", magnitude: "slight", quantity: 1 },
      { direction: "down" },
      { magnitude: "slight" },
      { direction: "less", magnitude: "slight" },
      { direction: "down", magnitude: "enormous" },
      null,
      "down",
      [],
    ]
  ) {
    assertEquals(
      parseRetainedItem(portion({ value: poison })),
      null,
      JSON.stringify(poison),
    );
  }
  // Les deux vocabulaires restent à deux valeurs: une échelle plus fine que la
  // question fermée qui l'alimente serait de la précision fabriquée.
  assertEquals([...PORTION_DIRECTIONS], ["down", "up"]);
  assertEquals([...PORTION_MAGNITUDES], ["slight", "clear"]);
});

// ===========================================================================
// 6. INVARIANT — la baisse sans sujet explicite exclut les mineurs
// ===========================================================================

const ROSTER: readonly PortionAdjustMember[] = [
  member(UUID_A, "adult"),
  member(UUID_B, "minor"),
  member(MEM_ID, "unknown"),
];

function portionItem(over: Record<string, unknown> = {}): PortionAdjustItem {
  const parsed = parseRetainedItem(portion(over));
  assert(parsed && parsed.kind === "portion.adjust", "fixture invalide");
  return parsed;
}

Deno.test("baisse sans sujet: l'adulte reçoit, le mineur est retiré AVEC son motif", () => {
  const audience = subjectsForPortionAdjust(
    portionItem({ subject: HOUSEHOLD_SUBJECT, value: { direction: "down", magnitude: "clear" } }),
    ROSTER,
  );
  // LE CAS QUI PASSE: l'adulte est bien dedans. Une garde qui exclurait tout le
  // monde aurait exactement la même tête qu'une garde qui marche.
  assertEquals(audience.included, [UUID_A]);
  // LE MINEUR EST RETIRÉ, ET LE CONSTAT LE DIT. Réduire l'assiette d'un enfant
  // en croissance à partir d'une remarque non attribuée d'un adulte est le
  // geste silencieux que le reste du produit interdit.
  assertEquals(audience.excluded, [
    { memberId: UUID_B, reason: "minor" },
    { memberId: MEM_ID, reason: "age_unknown" },
  ]);
});

Deno.test("`unknown` suit le mineur — c'est là que la garde mord vraiment", () => {
  // L'âge est FACULTATIF à la saisie. Une fiche d'enfant sans date vaut
  // `unknown`, pas `minor`: une garde qui n'exclurait que `minor` ne mordrait
  // pas dans le cas le plus courant, et aurait l'air de marcher.
  const audience = subjectsForPortionAdjust(
    portionItem({ value: { direction: "down", magnitude: "slight" } }),
    [member(MEM_ID, "unknown")],
  );
  assertEquals(audience.included, []);
  assertEquals(audience.excluded, [{ memberId: MEM_ID, reason: "age_unknown" }]);
});

Deno.test("à la HAUSSE, personne n'est retiré", () => {
  // La règle protège d'un RETRAIT de nourriture. Servir davantage à un enfant
  // en croissance n'est pas le geste qu'elle vise — l'exclure ici serait une
  // garde qui mord sa propre population cible.
  const audience = subjectsForPortionAdjust(
    portionItem({ value: { direction: "up", magnitude: "clear" } }),
    ROSTER,
  );
  assertEquals(audience.included, [UUID_A, UUID_B, MEM_ID]);
  assertEquals(audience.excluded, []);
});

Deno.test("un sujet EXPLICITE n'est jamais filtré, même sur un mineur", () => {
  // `member:<uuid>` veut dire que la personne a nommé la bouche, avec la liste
  // du foyer sous les yeux: une réponse à une question fermée, pas une
  // inférence. La règle dit « SANS sujet explicite ».
  const audience = subjectsForPortionAdjust(
    portionItem({
      subject: `member:${UUID_B}`,
      value: { direction: "down", magnitude: "clear" },
    }),
    ROSTER,
  );
  assertEquals(audience.included, [UUID_B]);
  assertEquals(audience.excluded, []);
});

Deno.test("une bouche partie du foyer n'est pas repliée sur tout le monde", () => {
  const gone = "00000000-1111-4222-8333-444444444444";
  const audience = subjectsForPortionAdjust(
    portionItem({ subject: `member:${gone}` }),
    ROSTER,
  );
  assertEquals(audience.included, []);
  assertEquals(audience.excluded, [{ memberId: gone, reason: "not_in_household" }]);
});

Deno.test("un foyer vide ne rend personne, et ne jette pas", () => {
  const audience = subjectsForPortionAdjust(portionItem(), []);
  assertEquals(audience.included, []);
  assertEquals(audience.excluded, []);
});

// ===========================================================================
// 7. LA MATRICE DES DROITS (§5) — en code, pas dans un prompt
// ===========================================================================

Deno.test("la matrice du §5, cellule par cellule", () => {
  // Une règle qui ne vit que dans un prompt régresse en réel. Ce tableau est
  // celui que les trois prompts RECOPIENT; c'est `canProduce` qui le TIENT.
  const EXPECTED: Record<string, Record<string, boolean>> = {
    // ① le brouillon: pas de mesure, pas de rythme — il parle de CE plan.
    draft_note: {
      "food.exclude": true,
      "food.prefer": true,
      "method.avoid": true,
      "method.prefer": true,
      "portion.adjust": false,
      "rhythm.set": false,
      "logistics.set": true,
      "craving": true,
    },
    // ② le questionnaire: SEUL producteur de mesure, aucune envie.
    questionnaire: {
      "food.exclude": true,
      "food.prefer": true,
      "method.avoid": true,
      "method.prefer": true,
      "portion.adjust": true,
      "rhythm.set": true,
      "logistics.set": true,
      "craving": false,
    },
    // ③ le memorizer: propose tout sauf la mesure — il ne sait pas l'attribuer.
    conversation: {
      "food.exclude": true,
      "food.prefer": true,
      "method.avoid": true,
      "method.prefer": true,
      "portion.adjust": false,
      "rhythm.set": true,
      "logistics.set": true,
      "craving": true,
    },
    // ④ la personne, dans sa propre carte: tout ce qui existe comme `kind`.
    // Contrepartie exacte des trois interdits — « elle peut toujours le rendre
    // durable depuis la carte, EXPLICITEMENT ». La brider ferait de la carte un
    // écran en lecture seule.
    written: {
      "food.exclude": true,
      "food.prefer": true,
      "method.avoid": true,
      "method.prefer": true,
      "portion.adjust": true,
      "rhythm.set": true,
      "logistics.set": true,
      "craving": true,
    },
  };
  for (const source of RETAINED_SOURCES) {
    for (const kind of RETAINED_KINDS) {
      assertEquals(
        canProduce(source, kind),
        EXPECTED[source][kind],
        `${source} × ${kind}`,
      );
    }
  }
});

Deno.test("le `scope` par défaut suit la matrice, et `null` est un refus", () => {
  // Le brouillon parle de CE plan: `next_plan` par défaut.
  assertEquals(defaultScopeFor("draft_note", "food.exclude"), "next_plan");
  // Le questionnaire regarde la semaine écoulée pour orienter les suivantes.
  assertEquals(defaultScopeFor("questionnaire", "food.exclude"), "durable");
  assertEquals(defaultScopeFor("conversation", "food.exclude"), "durable");
  assertEquals(defaultScopeFor("written", "food.exclude"), "durable");
  // Les deux invariants ne sont pas des « défauts »: ils sont FORCÉS.
  for (const source of RETAINED_SOURCES) {
    if (canProduce(source, "craving")) {
      assertEquals(defaultScopeFor(source, "craving"), "next_plan", source);
    }
    if (canProduce(source, "portion.adjust")) {
      assertEquals(defaultScopeFor(source, "portion.adjust"), "durable", source);
    }
  }
  // `null` = ce producteur n'a pas le droit. Un appelant qui replierait ça sur
  // une valeur réarmerait l'interdit qu'on vient de poser.
  assertEquals(defaultScopeFor("conversation", "portion.adjust"), null);
  assertEquals(defaultScopeFor("draft_note", "rhythm.set"), null);
  assertEquals(defaultScopeFor("questionnaire", "craving"), null);
});

Deno.test("la matrice mord À LA LECTURE, pas seulement à l'écriture", () => {
  // Une ligne déjà en base que son producteur n'avait pas le droit d'écrire ne
  // remonte pas. C'est ce qui fait que la règle ne régresse pas: elle mord à
  // CHAQUE lecture, pas seulement le jour où le prompt s'en souvient.
  assertEquals(
    parseRetainedItem(written({
      kind: "craving",
      scope: "next_plan",
      source: "questionnaire",
      text: "des fajitas",
    })),
    null,
  );
  // Et la même ligne, écrite par quelqu'un qui en a le droit, passe.
  assert(parseRetainedItem(written({
    kind: "craving",
    scope: "next_plan",
    source: "draft_note",
    text: "des fajitas",
  })));
});

// ===========================================================================
// 8. `source`, `item`, `confidence` — la traçabilité de chaque ligne
// ===========================================================================

Deno.test("`item` vide protège une ligne écrite; une conversation doit citer son souvenir", () => {
  // `written` ⇒ `item` vide OBLIGATOIRE: c'est ce vide qui la protège —
  // `reconcileFoodPreferences` garde toute ligne sans id, donc le memorizer ne
  // peut pas retirer ce que la personne a tapé.
  assert(parseRetainedItem(written({ source: "written", item: "" })));
  assertEquals(parseRetainedItem(written({ source: "written", item: MEM_ID })), null);

  // `conversation` ⇒ un uuid de `memory_items` OBLIGATOIRE. Sans lui, la ligne
  // ne peut être ni tracée (« je l'ai retenu de mardi ») ni rétractée.
  assert(parseRetainedItem(written({
    source: "conversation",
    item: MEM_ID,
    confidence: 0.82,
  })));
  assertEquals(
    parseRetainedItem(written({ source: "conversation", item: "", confidence: 0.82 })),
    null,
  );
  assertEquals(
    parseRetainedItem(written({ source: "conversation", item: "nope", confidence: 0.82 })),
    null,
  );

  // Les deux autres: vide (le cas normal) ou un uuid si le producteur cite une
  // ligne source.
  assert(parseRetainedItem(written({ source: "questionnaire", item: "" })));
  assert(parseRetainedItem(written({ source: "questionnaire", item: MEM_ID })));
  assertEquals(parseRetainedItem(written({ source: "questionnaire", item: "x" })), null);
});

Deno.test("`confidence` si et seulement si la source est la conversation", () => {
  const ok = parseRetainedItem(written({
    source: "conversation",
    item: MEM_ID,
    confidence: 0.82,
  }));
  assert(ok);
  assertEquals(ok.confidence, 0.82);

  // Une conversation SANS confiance ne peut pas être passée au seuil de
  // promotion (0,70, chez `food_preference_promotion.ts`): l'accepter la ferait
  // entrer par une porte qui ne mesure rien.
  assertEquals(parseRetainedItem(written({ source: "conversation", item: MEM_ID })), null);
  assertEquals(
    parseRetainedItem(written({ source: "conversation", item: MEM_ID, confidence: 1.4 })),
    null,
  );
  assertEquals(
    parseRetainedItem(written({ source: "conversation", item: MEM_ID, confidence: "0.8" })),
    null,
  );

  // Une confiance sur un fait DÉCLARÉ est une erreur de catégorie: une réponse
  // cochée au questionnaire n'est pas vraie à 82 %.
  assertEquals(parseRetainedItem(written({ confidence: 0.9 })), null);
  assertEquals(parseRetainedItem(written({ source: "questionnaire", confidence: 0.9 })), null);
  // Absente ou `null`: les deux passent, et rendent `null`.
  const plain = parseRetainedItem(written({ confidence: null }));
  assert(plain);
  assertEquals(plain.confidence, null);
});

// ===========================================================================
// 9. LES `value` par famille
// ===========================================================================

Deno.test("`rhythm.set` veut un moment connu et un booléen STRICT", () => {
  const ok = parseRetainedItem(written({
    kind: "rhythm.set",
    text: "pas de petit-déjeuner",
    value: { occasion: "breakfast", present: false },
  }));
  assert(ok && ok.kind === "rhythm.set");
  assertEquals(ok.value, { occasion: "breakfast", present: false });

  for (
    const bad of [
      { occasion: "brunch", present: true },
      { occasion: "breakfast", present: "true" },
      { occasion: "breakfast", present: 1 },
      { occasion: "breakfast" },
      { present: true },
      null,
    ]
  ) {
    assertEquals(
      parseRetainedItem(written({ kind: "rhythm.set", value: bad })),
      null,
      JSON.stringify(bad),
    );
  }
});

Deno.test("`logistics.set` type sa valeur par champ, jamais en `unknown`", () => {
  const days = parseRetainedItem(written({
    kind: "logistics.set",
    text: "je cuisine le dimanche et le mercredi",
    value: { field: "cook_days", value: ["sun", "wed"] },
  }));
  assert(days && days.kind === "logistics.set");
  assertEquals(days.value, { field: "cook_days", value: ["sun", "wed"] });

  const time = parseRetainedItem(written({
    kind: "logistics.set",
    text: "45 minutes par session",
    value: { field: "cooking_time_min", value: 45 },
  }));
  assert(time);

  assert(parseRetainedItem(written({
    kind: "logistics.set",
    text: "simple",
    value: { field: "recipe_difficulty", value: "simple" },
  })));
  assert(parseRetainedItem(written({
    kind: "logistics.set",
    text: "varié",
    value: { field: "variety", value: "varied" },
  })));

  for (
    const bad of [
      { field: "cook_days", value: ["dimanche"] }, // pas un DAY_TOKEN
      { field: "cook_days", value: [] },
      { field: "cook_days", value: "sun" },
      { field: "cooking_time_min", value: "45" }, // le jsonb ne dit rien du type
      { field: "cooking_time_min", value: 0 },
      { field: "cooking_time_min", value: 45.5 },
      { field: "budget_amount", value: -3 },
      { field: "recipe_difficulty", value: "hard" },
      { field: "variety", value: "lots" },
      { field: "portion_size", value: 1 },
      null,
    ]
  ) {
    assertEquals(
      parseRetainedItem(written({ kind: "logistics.set", value: bad })),
      null,
      JSON.stringify(bad),
    );
  }
});

Deno.test("les cinq familles sans `value` refusent une structure inventée", () => {
  for (const kind of ["food.exclude", "food.prefer", "method.avoid", "method.prefer"]) {
    assert(parseRetainedItem(written({ kind, value: null })), kind);
    assert(parseRetainedItem(written({ kind, value: undefined })), kind);
    assertEquals(
      parseRetainedItem(written({ kind, value: { direction: "down" } })),
      null,
      kind,
    );
  }
  assert(parseRetainedItem(written({ kind: "craving", scope: "next_plan", value: null })));
  assertEquals(
    parseRetainedItem(written({ kind: "craving", scope: "next_plan", value: { a: 1 } })),
    null,
  );
});

// ===========================================================================
// 10. LA FORME DE STOCKAGE, et la lecture d'une liste
// ===========================================================================

Deno.test("l'aller-retour jsonb est une identité", () => {
  for (
    const row of [
      written(),
      portion(),
      written({ kind: "craving", scope: "next_plan", text: "des fajitas", source: "draft_note" }),
      written({
        kind: "rhythm.set",
        text: "pas de petit-déj",
        value: { occasion: "breakfast", present: false },
      }),
      written({
        kind: "logistics.set",
        text: "dimanche et mercredi",
        value: { field: "cook_days", value: ["sun", "wed"] },
      }),
      written({ source: "conversation", item: MEM_ID, confidence: 0.82 }),
    ]
  ) {
    const first = parseRetainedItem(row);
    assert(first, JSON.stringify(row));
    const again = parseRetainedItem(retainedItemToJson(first));
    assert(again, JSON.stringify(row));
    assertEquals(retainedItemToJson(again), retainedItemToJson(first));
  }
});

Deno.test("un item difforme TOMBE SEUL et laisse ses voisins", () => {
  // Patron `parseAwayDays` / `day_properties.ts`: une faute de frappe d'un
  // producteur ne doit pas effacer une déclaration lisible du même jour.
  const items = parseRetainedItems([
    written({ text: "les rochers coco" }),
    { kind: "food.hate", text: "n'importe quoi" },
    portion(),
    "pas un objet",
    null,
    written({ text: "les endives" }),
  ]);
  assertEquals(items.length, 3);
  assertEquals(items.map((i) => i.text), [
    "les rochers coco",
    "les parts étaient un peu trop grosses",
    "les endives",
  ]);
  assertEquals(parseRetainedItems(null), []);
  assertEquals(parseRetainedItems({}), []);
});
