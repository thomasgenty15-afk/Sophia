/**
 * Le plancher de déclaration de repas, dans les DEUX directions.
 *
 * Les cas positifs sont les phrases EXACTES mesurées instables en run réel
 * (QA WEB L3-bis). Les cas négatifs sont les faux positifs qu'un plancher trop
 * large produirait — et ils comptent autant : une garde qu'on n'a pas vue
 * LÂCHER est une garde qui mordra un innocent.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { detectDeclaredMeal, detectOffPlanMarker } from "./meal_declaration_floor.ts";

function refs(message: string, slot: string | null = null): string[] {
  const hit = detectDeclaredMeal(message, slot);
  return (hit?.components ?? []).map((c) => c.food_group_ref).sort();
}

Deno.test("les phrases EXACTES mesurées instables mordent, et complètement", () => {
  // « Grilled salmon with quinoa and green beans for dinner » → [0,0,0,0] en réel.
  assertEquals(
    refs("Grilled salmon with quinoa and green beans for dinner"),
    ["fatty_fish", "non_starchy_veg", "whole_grain"],
  );
  // « Poulet grillé, riz complet et brocolis à midi » → [0,3,3,0] en réel.
  assertEquals(
    refs("Poulet grillé, riz complet et brocolis à midi"),
    ["cruciferous_veg", "poultry", "whole_grain"],
  );
  // Le cas qui marchait déjà doit continuer.
  assertEquals(refs("j'ai mangé du poulet"), ["poultry"]);
  assertEquals(refs("I had eggs and rice for lunch"), ["eggs", "refined_grain"]);
});

Deno.test("le terme le PLUS LONG gagne — « brown rice » n'est pas « rice »", () => {
  assertEquals(refs("I had brown rice for lunch"), ["whole_grain"]);
  assertEquals(refs("I had white rice for lunch"), ["refined_grain"]);
  assertEquals(refs("j'ai mangé du riz complet"), ["whole_grain"]);
  // « green beans » est un légume, « beans » une légumineuse.
  assertEquals(refs("I had green beans for dinner"), ["non_starchy_veg"]);
  assertEquals(refs("I had beans for dinner"), ["legumes"]);
});

Deno.test("un même groupe nommé deux fois ne produit qu'UN composant", () => {
  // « chicken breast » et « chicken » sont le même groupe: une seule ligne.
  assertEquals(refs("I had chicken breast and chicken soup for lunch"), ["poultry"]);
});

Deno.test("LES DEUX PORTES, et elles se distinguent", () => {
  assertEquals(detectDeclaredMeal("j'ai mangé du poulet")?.gate, "past_tense_verb");
  assertEquals(
    detectDeclaredMeal("Poulet grillé, riz complet et brocolis à midi")?.gate,
    "noun_phrase_with_slot",
  );
  // Un groupe nominal SANS créneau et SANS verbe au passé ne passe pas: c'est
  // peut-être une liste de courses, une envie, une question tronquée.
  assertEquals(detectDeclaredMeal("chicken and rice"), null);
  // …sauf si le runtime a déjà lu un créneau ailleurs dans le message.
  assertEquals(refs("chicken and rice", "lunch"), ["poultry", "refined_grain"]);
});

Deno.test("DÉSARMEMENT — l'intention future n'écrit rien", () => {
  for (
    const message of [
      "I'm going to have chicken tonight",
      "je vais manger du poulet ce soir",
      "I'll have salmon for dinner",
      "je pense prendre du poisson demain",
      "I plan to eat more vegetables",
    ]
  ) {
    assertEquals(detectDeclaredMeal(message), null, `ne doit PAS mordre: ${message}`);
  }
});

Deno.test("DÉSARMEMENT — une question nomme des aliments sans en déclarer", () => {
  for (
    const message of [
      "what should I have for dinner, chicken or fish?",
      "can I have rice with my chicken at lunch?",
      "est-ce que je peux manger du riz à midi ?",
      "c'est quoi une bonne collation, du yaourt ?",
    ]
  ) {
    assertEquals(detectDeclaredMeal(message), null, `ne doit PAS mordre: ${message}`);
  }
});

Deno.test("DÉSARMEMENT — la négation, et l'assiette de quelqu'un d'autre", () => {
  for (
    const message of [
      "I didn't eat any chicken today",
      "je n'ai rien mangé ce midi",
      "my son had chicken and rice for lunch",
      "mon fils a mangé du poulet ce midi",
    ]
  ) {
    assertEquals(detectDeclaredMeal(message), null, `ne doit PAS mordre: ${message}`);
  }
});

Deno.test("R7 — un plat hors de la table fermée ne produit AUCUN fait", () => {
  // Un plat composé n'est PAS décomposé: on ne sait pas ce qu'il y avait
  // dedans, et un plancher qui le devinerait écrirait un fait que personne n'a
  // dit. Le tour retombe sur le dispatcher, qui a le droit de juger.
  assertEquals(detectDeclaredMeal("I had lasagne for dinner"), null);
  assertEquals(detectDeclaredMeal("j'ai mangé un tajine hier soir"), null);
});

Deno.test("un plat composé rend ce qu'il NOMME, et rien de plus", () => {
  // « couscous royal » nomme un couscous: c'est une céréale raffinée, et c'est
  // vrai quoi qu'il y ait eu d'autre dans le plat. Le fait est PARTIEL, pas
  // inventé — et ce plancher ne s'exécute QUE quand le dispatcher n'a rien
  // écrit du tout, donc « partiel » y bat « rien ».
  assertEquals(refs("j'ai mangé un couscous royal hier soir"), ["refined_grain"]);
});

Deno.test("un message ordinaire ne déclenche jamais le plancher", () => {
  for (
    const message of [
      "hey",
      "how are you?",
      "I'm allergic to peanuts, badly",
      "I feel exhausted this week",
      "",
      "   ",
    ]
  ) {
    assertEquals(
      detectDeclaredMeal(message),
      null,
      `ne doit PAS mordre: ${JSON.stringify(message)}`,
    );
  }
});

Deno.test("un copier-coller n'est pas une déclaration de repas", () => {
  const wall = `I had chicken and rice for lunch. ${"blah ".repeat(200)}`;
  assertEquals(detectDeclaredMeal(wall), null);
});

Deno.test("les mots de l'élève sont conservés tels quels", () => {
  const hit = detectDeclaredMeal("J'ai mangé du poulet grillé, très bon");
  assert(hit);
  assertEquals(hit!.studentNote, "J'ai mangé du poulet grillé, très bon");
});

// ===========================================================================
// FF-009 — LE MARQUEUR DE HORS-PLAN
//
// Chaque frontière est jouée en FRANÇAIS et en ANGLAIS. Ce dépôt a déjà payé
// une garde testée dans une seule langue: `not` ne couvrait pas `doesn't`, et
// une garde à moitié désarmée est une garde qu'on croit avoir.
// ===========================================================================

Deno.test("FF-009 — UN MARQUEUR SEUL SUFFIT, SANS AUCUN ALIMENT (le cas nominal)", () => {
  // C'est la différence de fond avec la déclaration de repas: exiger un
  // composant perdrait exactement ce qu'on cherche à capter.
  const fr = detectDeclaredMeal("j'ai commandé");
  assertEquals(fr?.planRelation, "off_plan");
  assertEquals(fr?.components.length, 0);
  assertEquals(fr?.gate, "off_plan_marker");

  const en = detectDeclaredMeal("I ordered");
  assertEquals(en?.planRelation, "off_plan");
  assertEquals(en?.components.length, 0);
  assertEquals(en?.gate, "off_plan_marker");
});

Deno.test("FF-009 — MARQUEUR + ALIMENTS: la relation ET les composants", () => {
  const fr = detectDeclaredMeal("j'ai commandé une pizza ce soir");
  assertEquals(fr?.planRelation, "off_plan");
  // « pizza » n'est pas dans le lexique fermé, donc aucun aliment n'est
  // inventé — R3. Le fait existe quand même, et c'est le point.
  assertEquals(fr?.components.length, 0);

  const en = detectDeclaredMeal("I ordered takeout last night");
  assertEquals(en?.planRelation, "off_plan");
});

Deno.test("FF-009 — les aliments RECONNUS voyagent avec le hors-plan", () => {
  assertEquals(refs("on a mangé au resto hier, du saumon et des brocolis"), [
    "cruciferous_veg",
    "fatty_fish",
  ]);
  assertEquals(
    detectDeclaredMeal("on a mangé au resto hier, du saumon et des brocolis")
      ?.planRelation,
    "off_plan",
  );
  assertEquals(
    detectDeclaredMeal("we ate out last night, salmon and green beans")
      ?.planRelation,
    "off_plan",
  );
});

Deno.test("FF-009 — SANS marqueur, la relation reste NULL et JAMAIS as_planned", () => {
  // R5: `null` ne devient jamais `as_planned`. Le déduire d'un silence
  // fabriquerait de l'adhérence, ce que FF-007 interdit globalement.
  assertEquals(detectDeclaredMeal("j'ai mangé du poulet")?.planRelation, null);
  assertEquals(detectDeclaredMeal("I had eggs and rice for lunch")?.planRelation, null);
});

Deno.test("FF-009 — L'INTENTION FUTURE N'ÉCRIT RIEN, FR et EN", () => {
  assertEquals(detectDeclaredMeal("je vais commander ce soir"), null);
  assertEquals(detectDeclaredMeal("on va commander ce soir"), null);
  assertEquals(detectDeclaredMeal("I'll order tonight"), null);
  assertEquals(detectDeclaredMeal("I'm going to order takeout tonight"), null);
});

Deno.test("FF-009 — COMMANDER POUR QUELQU'UN D'AUTRE N'EST PAS MANGER, FR et EN", () => {
  assertEquals(detectDeclaredMeal("on a commandé pour les enfants"), null);
  assertEquals(detectDeclaredMeal("j'ai commandé pour mes enfants"), null);
  assertEquals(detectDeclaredMeal("we ordered for the kids"), null);
  assertEquals(detectDeclaredMeal("I ordered for my children"), null);
});

Deno.test("FF-009 — « chez ma mère » est hors plan, « chez moi » ne l'est pas", () => {
  // La frontière la plus fine de la fiche, et elle tient par CONSTRUCTION:
  // la liste ne nomme que des lieux qui ne sont pas la cuisine de l'élève.
  assertEquals(
    detectDeclaredMeal("j'ai mangé chez ma mère hier soir")?.planRelation,
    "off_plan",
  );
  assertEquals(detectOffPlanMarker("j'ai mangé chez moi hier soir"), null);
  assertEquals(
    detectDeclaredMeal("I had dinner at my mum's last night")?.planRelation,
    "off_plan",
  );
  assertEquals(detectOffPlanMarker("I had dinner at home last night"), null);
});

Deno.test("FF-009 — « on est sortis » SEUL est ambigu et ne mord pas", () => {
  assertEquals(detectOffPlanMarker("on est sortis hier soir"), null);
  assertEquals(detectOffPlanMarker("we went out last night"), null);
  // …mais accompagné d'un mot de repas, il mord.
  assertEquals(
    detectOffPlanMarker("on est sortis manger hier soir")?.selfSufficient,
    true,
  );
  assertEquals(
    detectOffPlanMarker("we went out to eat last night")?.selfSufficient,
    true,
  );
});

Deno.test("FF-009 — UN MARQUEUR DE LIEU SEUL n'ouvre pas la porte", () => {
  // « au resto » peut être un projet. Il qualifie une porte, il n'en est pas
  // une: sans verbe au passé ni créneau, rien n'est écrit.
  assertEquals(detectDeclaredMeal("au resto"), null);
  assertEquals(detectOffPlanMarker("au resto")?.selfSufficient, false);
  assertEquals(detectDeclaredMeal("at a restaurant"), null);
  assertEquals(detectOffPlanMarker("at a restaurant")?.selfSufficient, false);
});

Deno.test("FF-009 — une QUESTION sur un hors-plan n'écrit rien, FR et EN", () => {
  assertEquals(detectDeclaredMeal("je peux commander ce soir ?"), null);
  assertEquals(detectDeclaredMeal("can I order takeout tonight?"), null);
});

Deno.test("FF-009 — le marqueur exact est journalisé, pas deviné", () => {
  assertEquals(detectDeclaredMeal("j'ai commandé une pizza")?.offPlanMatched, "j ai commande");
  assertEquals(detectDeclaredMeal("I ordered a pizza")?.offPlanMatched, "i ordered");
  assertEquals(detectDeclaredMeal("j'ai mangé du poulet")?.offPlanMatched, null);
});

Deno.test("FF-009 — le désarme « quelqu'un d'autre » mord TOUJOURS sur un SUJET", () => {
  // La contre-épreuve de la correction ci-dessus: rétrécir le désarme pour les
  // lieux ne doit pas l'ouvrir pour les personnes.
  assertEquals(detectDeclaredMeal("ma mère a mangé du poulet hier soir"), null);
  assertEquals(detectDeclaredMeal("ma fille a mangé des pâtes à midi"), null);
  assertEquals(detectDeclaredMeal("my mum had chicken for dinner"), null);
  assertEquals(detectDeclaredMeal("my daughter had pasta for lunch"), null);
});

Deno.test("FF-009 — « chez moi » et « chez nous » ne sont JAMAIS un hors-plan", () => {
  // La contre-épreuve du marqueur « chez »: il ne mord que sur un lieu qui
  // n'est pas la cuisine de l'élève.
  for (const home of [
    "j'ai mangé chez moi hier soir",
    "on a dîné chez nous hier soir",
    "j'ai mangé chez moi du poulet hier soir",
  ]) {
    assertEquals(detectOffPlanMarker(home), null, `hors-plan à tort: ${home}`);
    assertEquals(
      detectDeclaredMeal(home)?.planRelation ?? null,
      null,
      `relation posée à tort: ${home}`,
    );
  }
  for (const home of ["I had dinner at home last night", "I ate at home"]) {
    assertEquals(detectOffPlanMarker(home), null, `hors-plan à tort: ${home}`);
  }
});

Deno.test("FF-009 — LE MARQUEUR SURVIT QUAND LE MODÈLE PARLE LE PREMIER", () => {
  // 🔴 Régression mesurée en run réel (2026-08-08): sur « j'ai commandé une
  // pizza ce soir », le dispatcher avait déjà demandé le `log_protocol_event`
  // (il déduit `fried_food` de « pizza »), le plancher s'était effacé — c'est
  // sa règle — et `plan_relation` restait NULL en base.
  //
  // Le plancher garde sa règle; c'est le ROUTEUR qui attache maintenant la
  // relation à l'effet du dispatcher (`run.ts`, « LA RELATION AU PLAN NE
  // S'EFFACE PAS DEVANT LE DISPATCHER »). Ce test pinne la moitié pure: la
  // relation est disponible même quand aucun aliment du lexique ne mord, donc
  // même quand le plancher n'aurait rien eu à poser de lui-même.
  const hit = detectDeclaredMeal("j'ai commandé une pizza ce soir");
  assertEquals(hit?.planRelation, "off_plan");
  assertEquals(hit?.components.length, 0);
  // Et en anglais, la même chose.
  const en = detectDeclaredMeal("I ordered a pizza tonight");
  assertEquals(en?.planRelation, "off_plan");
});
