// ÉTAPE ② (agent 2A) — CE QUI PRIME, ET LE FAIT QUE LE PROMPT LE DISE.
//
// Ce que ces tests protègent, dans l'ordre de ce qui coûte le plus cher quand
// ça casse:
//
//   * LA HIÉRARCHIE REDEVENUE IMPLICITE. Avant v14, ce prompt portait six
//     familles de désirs qui peuvent se contredire et n'écrivait nulle part
//     laquelle gagne: la hiérarchie n'existait que par la POSITION des blocs.
//     Or la position dit l'inverse de ce qu'on veut — la sécurité est en tête,
//     c'est-à-dire au rang que ce dépôt a mesuré comme le MOINS contraignant.
//     Un test qui n'exige que la PRÉSENCE du bloc laisserait quelqu'un le
//     remonter au milieu du message et croire l'avoir gardé; celui d'en bas
//     exige donc aussi sa PLACE.
//
//   * L'ENVIE REDEVENUE NUE. `what they feel like eating THIS TIME` était la
//     seule ligne de désir du message sans un mot de rang, servie à trois
//     lignes de la fin. Mesuré sur le run réel `2a000000-3100-…`: une envie
//     qui nomme l'allergène MÉDICAL de l'élève ressort 21 fois en sortie.
//
//   * LA SÉVÉRITÉ REDEVENUE MUETTE. Le bloc de contraintes imprime
//     `severity=medical|strict|preference` et servait la même interdiction aux
//     trois. Côté code l'asymétrie est inverse: seule `medical` arme la
//     ceinture de sortie. Le prompt doit dire ce que le code fait.
//
//   * UNE POPULATION DÉPLACÉE SANS L'AVOIR DEMANDÉ. C'est le défaut classique
//     de ce fichier: un lot qui vise une population et en bouge une autre. Un
//     compte SANS contrainte et SANS envie ne doit voir QUE le bloc d'ordre,
//     et rien d'autre — le test le vérifie à l'octet, par différence.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { buildMealPrompt, MEAL_PROMPT_VERSION } from "./meal_generation.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

const PRECEDENCE_HEADER = "-- WHEN TWO OF THE LINES ABOVE WANT DIFFERENT THINGS --";
const SEVERITY_HEADER = "Each of those lines carries a `severity`, and it is not decoration:";

function constraint(
  id: string,
  kind: StudentSafetyConstraint["kind"],
  severity: StudentSafetyConstraint["severity"],
  allergenRef: string,
): StudentSafetyConstraint {
  return {
    id,
    userId: "u",
    kind,
    allergenRef,
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity,
    declaredBy: "student",
    notes: null,
    contentLocale: "en-GB",
  };
}

// deno-lint-ignore no-explicit-any
function build(over: Record<string, unknown> = {}): any {
  return buildMealPrompt({
    safetyConstraints: [],
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "== A COACH'S METHOD ==",
    protocolBlock: "",
    beliefKeys: [],
    goal: "maintenance",
    situation: null,
    aspiration: null,
    context: null,
    preferences: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "wed",
    today: "2026-08-19",
    country: "GB",
    budgetAmount: null,
    coachNoteBlock: null,
    daysToFill: ["thu", "fri"],
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    firstDayCookable: true,
    hasFreezer: false,
    oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    contentLocale: "en-GB",
    // deno-lint-ignore no-explicit-any
    ...(over as any),
    // deno-lint-ignore no-explicit-any
  } as any);
}

Deno.test("v15 — la version de prompt suit l'octet: elle a bougé avec ce lot", () => {
  // ⚠️ v16 (2026-08-19) — LE GROUPE ALIMENTAIRE EST DÉCLARÉ, PLUS DEVINÉ.
  // La population qui voit une consigne différente: celle qui a un RÉGIME
  // déclaré, sur les deux lanes. Le bloc voyage avec `dietaryRegimePromptLine`
  // et PAS dans `MEAL_SYSTEM_PROMPT`, donc une composition sans régime rend un
  // message byte-identique à v15 (`dietary_regime_solo_lane_test.ts :: « v16 —
  // la demande de GROUPE n QUE dans le bloc de régime »`). Le bump vaut
  // quand même — règle de v3/v5 de l foyer: c la PRÉSENCE du bloc qui
  // distingue deux populations dans la colonne.
  // ⚠️ v20 (2026-09-01) — LA PART CONGELÉE A UNE CLÉ.
  // Population qui voit une consigne différente: TOUT LE MONDE. Le schéma
  // gagne `dishes[].uses[].kept` et le bloc de conservation gagne le
  // paragraphe qui dit par quel CHAMP se déclare la troisième sortie. Les deux
  // vivent dans le tronc. Un modèle qui n'écrit jamais le champ produit
  // exactement le plan de v19 — le non-dit vaut `"fridge"`, le strict.
  // ⚠️ v21 (2026-09-01) — LES JOURS HORS DE PORTÉE D'UN LOT SONT NOMMÉS, et la
  // session seule a le droit de déborder en le disant. Population: les fenêtres
  // qui portent une journée qu'aucun lot n'atteint. Un plan sans tension rend
  // v20 au caractère près, et un test le tient.
  // ⚠️ v25 (2026-09-03) — LA VEILLE EST DÉRIVÉE, PLUS COCHÉE (P1, A1).
  // La CONSIGNE n'a pas changé d'un caractère: `cookOnlyDay` existait déjà.
  // Ce qui change est la POPULATION qui la reçoit — jusqu'ici les seuls plans
  // qui portaient un jour de cuisine sans repas étaient ceux dont quelqu'un
  // avait coché une case; ils le portent désormais par défaut, dès que le
  // calendrier et l'heure le permettent. Comparer les plans d'avant et d'après
  // sous un même millésime rendrait la mesure fausse.
  // ⚠️ v26 (2026-09-03, A2/P2) — LE STYLE DE CUISINE POSE LES SESSIONS.
  // Population qui voit une consigne différente: celle qui a répondu aux DEUX
  // questions de P2 (`cooking_style` + `grocery_runs`). Pour elle, `cook_days`
  // et le plafond de temps de session ne viennent plus de la colonne mais de
  // la dérivation; pour tous les autres, la consigne est celle de v25 au
  // caractère près, et un test de rationale le tient ligne à ligne.
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v26_the_cooking_style_sets_the_sessions");
});

Deno.test("① l'ordre est ÉCRIT, et il est écrit pour TOUT LE MONDE", () => {
  // Y compris un compte tout neuf: un ordre de priorité conditionnel n'est pas
  // un ordre de priorité.
  const bare = build().userMessage as string;
  assert(bare.includes(PRECEDENCE_HEADER), "le bloc d'ordre manque au compte nu");

  const full = build({
    safetyConstraints: [constraint("c1", "allergy", "medical", "sesame")],
    dietBlock: "This student is VEGETARIAN: no meat.",
    preferences: "a proper tahini bowl",
  }).userMessage as string;
  assert(full.includes(PRECEDENCE_HEADER));
});

Deno.test("① le bloc d'ordre occupe le CRAN DE RÉCENCE, pas un rang du milieu", () => {
  // Ce dépôt a mesuré qu'un modèle lit la consigne la plus proche de la fin
  // comme la plus contraignante — c'est la raison pour laquelle la commande y
  // est déjà. Une règle d'arbitrage posée ailleurs arbitre depuis le rang
  // qu'elle est censée corriger.
  //
  // ⚠️ Le bloc de LANGUE est collé après par `appendContentLanguageBlock`: le
  // dernier bloc de CONSIGNE est donc l'avant-dernier du message.
  const msg = build().userMessage as string;
  const at = msg.indexOf(PRECEDENCE_HEADER);
  assert(at > 0);
  const after = msg.slice(at);
  // Rien entre l'ordre et la langue.
  const languageAt = after.indexOf("CONTENT_LANGUAGE:");
  assert(languageAt > 0, "le bloc de langue devrait suivre");
  const tail = "quietly by halves.";
  const between = after.slice(after.indexOf(tail) + tail.length, languageAt);
  assertEquals(between.trim(), "", `du texte s'est glissé après l'ordre: ${between}`);
  // Et il est bien APRÈS la commande.
  assert(msg.indexOf("== WHAT TO COOK ==") < at);
});

Deno.test("① la sécurité est nommée PREMIÈRE, et le coach SECOND", () => {
  // C'est l'inversion que ce lot corrige: avant v14 la seule phrase de rang du
  // message était celle de la doctrine (« this block wins »).
  const msg = build().userMessage as string;
  const block = msg.slice(msg.indexOf(PRECEDENCE_HEADER));
  const safety = block.indexOf("The hard constraints and the diet at the VERY TOP");
  const coach = block.indexOf("This coach's method and red lines.");
  const kitchen = block.indexOf("What this kitchen and this week can ACTUALLY do");
  const craving = block.indexOf("What they feel like eating this time");
  assert(safety > 0 && coach > 0 && kitchen > 0 && craving > 0);
  assert(safety < coach, "la sécurité doit précéder le coach");
  assert(coach < kitchen, "le coach doit précéder la faisabilité");
  assert(kitchen < craving, "la faisabilité doit précéder l'envie");
});

Deno.test("② l'envie porte son rang, et SEULEMENT quand il y en a une", () => {
  const withCraving = build({ preferences: "smoky harissa" }).userMessage as string;
  assert(withCraving.includes("what they feel like eating THIS TIME: smoky harissa."));
  assert(
    withCraving.includes(
      "Let it rank your choices among the dishes everything above already allows",
    ),
    "l'envie est de nouveau servie nue",
  );
  assert(withCraving.includes("never at the cost of a hard constraint"));

  const without = build().userMessage as string;
  assert(!without.includes("what they feel like eating THIS TIME"));
});

Deno.test("③ la sévérité est LUE, et seulement quand une contrainte existe", () => {
  const none = build().userMessage as string;
  assert(!none.includes(SEVERITY_HEADER));

  const some = build({
    safetyConstraints: [
      constraint("c1", "allergy", "medical", "sesame"),
      constraint("c2", "dislike", "preference", "beetroot"),
    ],
  }).userMessage as string;
  assert(some.includes(SEVERITY_HEADER));
  // Les trois sévérités sont nommées, et le dégoût est le seul à pouvoir céder.
  assert(some.includes("- severity=medical — a health event, not a taste."));
  assert(some.includes("- severity=strict — off the plate too"));
  assert(some.includes("it is NOT a safety matter"));
  // ⚠️ ET IL RESTE INTERDIT D'ASSIETTE. Ce bloc explique un rang, il n'ouvre
  // pas une porte: la phrase d'exclusion du bloc au-dessus est intacte.
  assert(some.includes("NEVER suggest, recommend or include any of the above"));
  // Il est posé SOUS la liste qu'il commente, jamais au-dessus.
  assert(
    some.indexOf("- beetroot — dislike, severity=preference") <
      some.indexOf(SEVERITY_HEADER),
  );
});

Deno.test("⚠️ LA POPULATION NON VISÉE NE BOUGE QUE DU BLOC D'ORDRE", () => {
  // Le défaut classique de ce fichier: un lot qui vise une population et en
  // déplace une autre. Un compte SANS contrainte et SANS envie ne doit gagner
  // QUE le bloc d'ordre — on le prouve par SOUSTRACTION, pas par lecture.
  const msg = build().userMessage as string;
  const at = msg.indexOf(PRECEDENCE_HEADER);
  // Ce qui reste une fois le bloc d'ordre (et le saut de ligne qui le précède)
  // retiré doit être le message d'avant v14, à l'octet près sur ces deux axes.
  const withoutPrecedence = msg.slice(0, at).replace(/\n+$/, "");
  assert(!withoutPrecedence.includes(SEVERITY_HEADER));
  assert(!withoutPrecedence.includes("Let it rank your choices among the dishes"));
  assert(withoutPrecedence.endsWith("Do not use any other day token. Do not start earlier than today."));
});

// ═══════════════════════════════════════════════════════════════════════════
// v15 — LE SILENCE EST NOMMÉ, ET UN PLAN NE NOMME PLUS L'ALLERGÈNE.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("v15 ⛔ un PLAN ne nomme jamais une contrainte medical", () => {
  // Mesuré: run `2a000000-3100-…`, le modèle refuse correctement l'allergène,
  // l'explique dans le `why` — et le verrou binaire vide la semaine entière
  // sur les deux mots de cette phrase. Le prompt ORDONNAIT ce geste depuis
  // trois endroits; il porte maintenant son exception.
  const msg = build({
    safetyConstraints: [constraint("c1", "allergy", "medical", "sesame")],
  }).userMessage as string;
  assert(msg.includes("NAMING ONE OF THEM IN A PLAN IS NOT A WARNING"));
  assert(msg.includes('write "one of the foods on your medical list"'));

  // ⚠️ ET L'ORDRE CONTRAIRE, QUARANTE LIGNES PLUS BAS, PORTE LA MÊME
  // EXCEPTION. Sans ça, deux consignes du même message se contredisent et
  // c'est la plus proche de la fin qui gagne — c'est-à-dire la fatale.
  const written = build({
    safetyConstraints: [constraint("c1", "allergy", "medical", "sesame")],
    writtenInstructions: ["never put aubergine in my plan"],
  }).userMessage as string;
  assert(written.includes("name the thing you could not do"));
  assert(
    written.includes(
      'the exceptions are a severity=medical food: for those, write "one of ' +
        'the foods on your medical list" and never the food itself.',
    ),
    "l'ordre de nommer a reperdu son exception",
  );
  // ⛔ S2 (2026-08-22) — LA SECONDE EXCEPTION, ET ELLE N'EST PAS DÉCORATIVE.
  // La ceinture couvre `strict` depuis ce jour: un nom `severity=strict` écrit
  // dans un plat vide la semaine exactement comme un nom `severity=medical`.
  // Le prompt disait « the ONE exception » et n'en nommait qu'une — donc il
  // AUTORISAIT la phrase qui détruit le plan, pour six contraintes actives.
  assert(
    written.includes(
      'and a severity=strict food: for those, write "one of the foods you ' +
        'keep off your plate" and never the food itself.',
    ),
    "l'exception `strict` manque: le prompt autorise la phrase qui vide la semaine",
  );
  assert(
    msg.includes("A severity=medical") && msg.includes("or severity=strict"),
    "l'avertissement de ceinture ne nomme plus les DEUX crans qu'elle vérifie",
  );
});

Deno.test("v15 · le silence de la CAPACITÉ est nommé — et lui seul", () => {
  const bare = build().userMessage as string;
  // Six entrées disparaissaient ensemble et en silence: jours de cuisine,
  // équipement, minutes, niveau, répétition et BUDGET. Le modèle composait
  // avec un four et une somme illimitée sans savoir qu'il supposait.
  assert(bare.includes("they have told us NOTHING about their kitchen"));

  // ⛔ ET LES DEUX AUTRES SILENCES RESTENT DES SILENCES, EXPRÈS.
  //
  // · LE CORPS. `meal_body_test.ts` exige qu'un corps absent et un corps vide
  //   rendent le MÊME message, sans en-tête. La raison est le PLANCHER TCA:
  //   `restrictionFlag` blanchit le corps, et un en-tête d'absence rendrait le
  //   plancher observable dans le prompt. Le silence EST la garde.
  // · LES CONTRAINTES. `meal_body_test.ts` exige que `[]` et `null` rendent la
  //   MÊME consigne. Le trou est réel (un `catch` muet désarme les deux
  //   moitiés du double verrou) mais l'arbitrage est ÉCRIT, et le renverser
  //   appartient à un humain, pas à un lot sur la pondération.
  //
  // Ce test est donc aussi la mémoire des deux tentatives rendues.
  assert(!bare.includes("WHO THEY ARE"), "le plancher TCA redeviendrait observable");
  assert(!bare.includes("HARD CONSTRAINTS"), "l'arbitrage `[]` == `null` a été renversé");
});

Deno.test("⛔ le mot « json » survit aux deux moitiés, sur les deux populations", () => {
  // `ensureOpenAIJsonModeInstruction` (`_shared/gemini.ts`) RÉÉCRIT le prompt
  // APRÈS la capture quand ce mot manque: l'instrument se mettrait à mentir en
  // silence, et personne ne le verrait. Mesuré une fois à 25 caractères d'écart.
  for (
    const built of [
      build(),
      build({
        safetyConstraints: [constraint("c1", "allergy", "medical", "sesame")],
        preferences: "a proper tahini bowl",
      }),
    ]
  ) {
    assert(/\bjson\b/i.test(built.systemPrompt as string));
    assert(/\bjson\b/i.test(built.userMessage as string));
  }
});
