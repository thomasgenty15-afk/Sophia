/**
 * Le plancher de déclaration de repas, dans les DEUX directions.
 *
 * Les cas positifs sont les phrases EXACTES mesurées instables en run réel
 * (QA WEB L3-bis). Les cas négatifs sont les faux positifs qu'un plancher trop
 * large produirait — et ils comptent autant : une garde qu'on n'a pas vue
 * LÂCHER est une garde qui mordra un innocent.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  detectDeclaredMeal,
  detectOffPlanMarker,
  isMealForSomeoneElse,
  isNoMealDeclared,
} from "./meal_declaration_floor.ts";

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

Deno.test("FF-009 §7 — le repas de quelqu'un d'autre, dans les deux langues", () => {
  // 🔴 Mesuré en run réel (2026-08-08, 1 tour sur 3): « on a commandé pour les
  // enfants » écrivait une ligne `protocol_events`. Le plancher désarmait bien
  // — mais désarmer le plancher n'est pas un veto sur le dispatcher, et la
  // fiche dit RIEN. La ceinture rend ce « rien » exécutoire.
  for (
    const message of [
      "on a commandé pour les enfants",
      "j'ai commandé une pizza pour les enfants",
      "on a commandé pour mes enfants ce soir",
      "on a commandé des pâtes pour les gosses",
      "we ordered for the kids",
      "I ordered a pizza for the children last night",
      "we got takeaway for our kids",
    ]
  ) {
    assert(isMealForSomeoneElse(message), `ceinture muette sur: ${message}`);
    // Le plancher, lui, désarme déjà: les deux disent la même chose.
    assertEquals(detectDeclaredMeal(message), null, `plancher mord: ${message}`);
  }
});

Deno.test("FF-009 §7 — CONDITION DE DÉSARMEMENT: un message mixte garde le repas de l'élève", () => {
  // « J'ai mangé X ET on a commandé pour les enfants » porte DEUX repas. Perdre
  // celui de l'élève pour protéger celui des enfants coûterait plus cher que le
  // faux positif qu'on ferme.
  for (
    const message of [
      "j'ai mangé du poulet et on a commandé une pizza pour les enfants",
      "I had salmon and we ordered pizza for the kids",
      "j'ai pris une salade, et pour les enfants on a commandé",
    ]
  ) {
    assertEquals(
      isMealForSomeoneElse(message),
      false,
      `ceinture mord un innocent: ${message}`,
    );
  }
});

Deno.test("FF-009 §7 — la ceinture ne mord QUE le motif « pour les enfants »", () => {
  // Une ceinture qui déborderait attraperait des déclarations ordinaires. Ce
  // test est la contre-épreuve: aucun des cas nominaux de la fiche ne la
  // déclenche.
  for (
    const message of [
      "j'ai commandé une pizza ce soir",
      "on a mangé au resto hier",
      "I ordered takeout last night",
      "j'ai mangé chez ma mère hier soir",
      "j'ai mangé du poulet et du riz complet à midi",
      "j'ai fait des pâtes pour toute la famille et j'en ai mangé",
    ]
  ) {
    assertEquals(
      isMealForSomeoneElse(message),
      false,
      `ceinture mord un innocent: ${message}`,
    );
  }
});

Deno.test("FF-009 — une clause au FUTUR n'efface pas un acte PASSÉ explicite", () => {
  // 🔴 Mesuré en run réel (2026-08-08, 3/3): « hier j'ai commandé et demain je
  // cuisine » n'écrivait RIEN. Le désarme d'intention future était vérifié sur
  // le message entier, donc la clause de demain effaçait la soirée d'hier —
  // exactement le fait que FF-009 existe pour ne plus perdre.
  for (
    const message of [
      "hier j'ai commandé et demain je cuisine",
      "on a commandé hier soir, demain je fais des pâtes",
      "I ordered last night and tomorrow I'll cook",
      "we ate out yesterday, I'm going to cook tonight",
    ]
  ) {
    const hit = detectDeclaredMeal(message);
    assertEquals(
      hit?.planRelation ?? null,
      "off_plan",
      `acte passé perdu par la clause future: ${message}`,
    );
  }
});

Deno.test("FF-009 — CONTRE-ÉPREUVE: l'intention SEULE reste désarmée, FR et EN", () => {
  // Le retrait ne vaut QUE pour un marqueur AUTO-SUFFISANT. Un marqueur de
  // LIEU dit où, pas quand — « I'm going to order takeout tonight » porte
  // « takeout » et doit rester muet.
  for (
    const message of [
      "je vais commander ce soir",
      "je vais commander une pizza demain",
      "I'm going to order takeout tonight",
      "I'll get a takeaway later",
      "je compte aller au resto demain",
      "je vais manger du poulet ce soir",
    ]
  ) {
    assertEquals(
      detectDeclaredMeal(message),
      null,
      `l'intention future doit rester muette: ${message}`,
    );
  }
});

Deno.test("FF-009 — les AUTRES désarmes restent ABSOLUS malgré un marqueur passé", () => {
  // Le retrait est réservé à l'intention future. Une question, une négation ou
  // un tiers ne se retire JAMAIS, même quand le message contient « j'ai
  // commandé » — sinon on rouvrirait tous les faux positifs d'un coup.
  for (
    const message of [
      "on a commandé pour les enfants",
      "we ordered for the kids",
      "j'ai commandé, c'était bien ? est-ce que ça compte ?",
      "si je commande, est-ce que j'ai commandé au sens du plan ?",
      "mon fils a commandé une pizza",
    ]
  ) {
    assertEquals(
      detectDeclaredMeal(message),
      null,
      `un désarme absolu a été retiré à tort: ${message}`,
    );
  }
});

Deno.test("FF-009 — LA JOB STORY DE LA FICHE: « à un mariage » compte, FR et EN", () => {
  // 🔴 Mesuré en run réel (2026-08-08, 2 tours sur 2 dans chaque langue):
  //   « j'étais à un mariage samedi, j'ai mangé de tout »   → NULL
  //   « I was at a wedding on Saturday, I ate everything »  → off_plan
  // Le motif français ne portait que la forme CONTRACTÉE (« au mariage »), et
  // la fiche donne son exemple sous la forme naturelle. La cicatrice
  // `guard-tested-in-one-language-only`, à l'endroit exact où la fiche dit ce
  // qu'elle veut: « quand j'étais à un mariage, je veux que ça compte comme un
  // repas de ma vie ».
  for (
    const message of [
      "j'étais à un mariage samedi, j'ai mangé de tout",
      "on est allés à un anniversaire hier, j'ai mangé de tout",
      "j'étais à un baptême dimanche, j'ai mangé de tout",
      "j'ai mangé au mariage de ma cousine",
      "I was at a wedding on Saturday, I ate everything",
      // « at THE wedding » rendait NULL quand « at A wedding » mordait: la même
      // asymétrie, à l'intérieur d'une seule langue.
      "I was at the wedding on Saturday, I ate everything",
      "I ate at a birthday party yesterday",
    ]
  ) {
    assertEquals(
      detectDeclaredMeal(message)?.planRelation ?? null,
      "off_plan",
      `hors-plan perdu: ${message}`,
    );
  }
});

Deno.test("FF-009 — `chez` par EXCLUSION: la liste de proches débordait vraiment", () => {
  // L'en-tête du fichier annonçait le débordement (« une liste se serait fait
  // déborder au premier chez ma tante ») pendant que la liste des LIEUX en
  // était une. La forme collée au verbe passait par le marqueur
  // auto-suffisant; c'est la forme DÉTACHÉE qui tombait.
  for (
    const message of [
      "j'étais chez ma soeur hier soir, on a mangé une raclette",
      "j'étais chez ma belle-famille dimanche, j'ai mangé du gigot",
      "j'ai mangé chez ma tante hier soir",
    ]
  ) {
    assertEquals(
      detectDeclaredMeal(message)?.planRelation ?? null,
      "off_plan",
      `hors-plan perdu: ${message}`,
    );
  }
  // CONTRE-ÉPREUVE — les deux seules exclusions sont la cuisine de l'élève, et
  // elles tiennent par construction.
  for (
    const home of [
      "j'ai mangé chez moi hier soir",
      "on a dîné chez nous hier soir",
      // Trouvé en relisant la garde à l'envers: « chez soi » rendait
      // `off_plan` sur un repas fait à la maison — l'exact contraire.
      "on a mangé chez soi hier soir",
      "hier soir j'ai mangé chez moi, du saumon et des brocolis",
    ]
  ) {
    assertEquals(
      detectDeclaredMeal(home)?.planRelation ?? null,
      null,
      `« chez moi » lu comme un hors-plan: ${home}`,
    );
  }
});

// ===========================================================================
// FF-017 — LES TERMES AMBIGUS: un aliment ici, un mot-outil là
// ===========================================================================

Deno.test("« the » anglais n'écrit pas un thé — mesuré en run réel", () => {
  // L'ARTICLE DÉFINI. `normalize` jette l'accent, donc « thé » et « the »
  // devenaient le même jeton et une majorité de messages anglais écrivait un
  // thé que personne n'avait bu.
  assertEquals(refs("I had the chicken for lunch"), ["poultry"]);
  assertEquals(refs("I had chicken and the rice was good"), [
    "poultry",
    "refined_grain",
  ]);
  assertEquals(refs("I finished the salmon"), ["fatty_fish"]);
  // Le cas le plus cher: « the » était le SEUL composant, donc il ouvrait à lui
  // seul une ligne sur un message qui ne nomme aucun aliment.
  assertEquals(detectDeclaredMeal("I had the usual for lunch"), null);
  // CONTRE-ÉPREUVE — le thé reste un thé, accentué ou porté par un déterminant.
  assertEquals(refs("j'ai pris un thé ce matin"), ["coffee_tea"]);
  assertEquals(refs("j'ai pris un the ce matin"), ["coffee_tea"]);
  assertEquals(refs("j'ai bu du thé vert"), ["coffee_tea"]);
  assertEquals(refs("I had tea and toast"), ["coffee_tea", "refined_grain"]);
});

Deno.test("« mais » français n'écrit pas du maïs", () => {
  assertEquals(refs("hier soir j'ai mangé une salade mais bon"), ["leafy_greens"]);
  assertEquals(
    refs("j'ai mangé une pomme mais j'avais encore faim"),
    ["other_fruit"],
  );
  // CONTRE-ÉPREUVE — le maïs reste du maïs.
  assertEquals(refs("j'ai mangé du maïs"), ["starchy_veg"]);
  assertEquals(refs("j'ai mangé du mais grillé"), ["starchy_veg"]);
});

Deno.test("« pain » anglais (la douleur) n'écrit pas du pain — mesuré 3/3", () => {
  // Run réel 2026-08-08: « I had pain in my stomach after lunch » écrivait une
  // ligne `refined_grain`. L'élève signale un SYMPTÔME et repart avec un pain
  // qu'il ne peut même pas corriger — la réponse ne le mentionne pas.
  assertEquals(detectDeclaredMeal("I had pain in my stomach after lunch"), null);
  assertEquals(detectDeclaredMeal("I had chest pain after dinner"), null);
  // CONTRE-ÉPREUVE — le pain reste du pain.
  assertEquals(refs("j'ai mangé du pain"), ["refined_grain"]);
  assertEquals(refs("j'ai mangé une tranche de pain"), ["refined_grain"]);
  assertEquals(refs("j'ai mangé du pain complet"), ["whole_grain"]);
});

Deno.test("« bar » anglais (la barre) n'écrit pas du poisson", () => {
  assertEquals(detectDeclaredMeal("I had a protein bar for breakfast"), null);
  assertEquals(refs("I had a chocolate bar this morning"), ["sugar_sweets"]);
  // CONTRE-ÉPREUVE — le bar reste un poisson.
  assertEquals(refs("j'ai mangé du bar"), ["white_fish"]);
  assertEquals(refs("j'ai mangé du bar grillé"), ["white_fish"]);
});

Deno.test("« mûre » l'adjectif n'écrit pas une baie", () => {
  assertEquals(refs("j'ai mangé une banane bien mûre"), ["other_fruit"]);
  assertEquals(refs("j'ai mangé des mûres"), ["berries"]);
});

// ===========================================================================
// FF-017 §3 — LA PORTE « VERBE AU PASSÉ », dans toutes ses formes courantes
// ===========================================================================

Deno.test("les formes de passé qui manquaient à la porte", () => {
  // ⚠️ `\bi (was|we were) (eating|having)\b` collait « we were » derrière un
  // « i » obligatoire: l'alternative était INATTEIGNABLE.
  assertEquals(refs("we were eating pasta"), ["refined_grain"]);
  assertEquals(refs("I was eating chicken"), ["poultry"]);
  // L'apostrophe devient une espace: « I've had » s'écrit « i ve had ».
  assertEquals(refs("I've had chicken"), ["poultry"]);
  assertEquals(refs("I've just had some eggs"), ["eggs"]);
  // Les verbes de repas français portent leur propre passé.
  assertEquals(refs("j'ai dîné d'une salade"), ["leafy_greens"]);
  assertEquals(refs("j'ai déjeuné d'un poulet"), ["poultry"]);
  assertEquals(refs("j'ai goûté un yaourt"), ["dairy_yogurt"]);
  // Le passé immédiat, très courant à l'oral.
  assertEquals(refs("je viens de manger du poulet"), ["poultry"]);
  // Boire est une consommation: le lexique porte l'eau, le thé et l'alcool.
  assertEquals(refs("j'ai bu un café"), ["coffee_tea"]);
  // CONTRE-ÉPREUVE — la porte reste ÉTROITE (R4).
  assertEquals(detectDeclaredMeal("je vais manger du poulet"), null);
  assertEquals(detectDeclaredMeal("du poulet et du riz"), null);
});

// ===========================================================================
// FF-017 §7 — LES CEINTURES DE VETO (le plancher désarme, elles bloquent)
// ===========================================================================

Deno.test("« ma fille a mangé des pâtes » est vetoé, pas seulement désarmé", () => {
  // Mesuré 2/3 en run réel: le plancher désarmait, le DISPATCHER écrivait.
  assert(isMealForSomeoneElse("ma fille a mangé des pâtes à midi"));
  assert(isMealForSomeoneElse("my daughter had pasta for lunch"));
  assert(isMealForSomeoneElse("mes enfants ont mangé des pâtes"));
  assert(isMealForSomeoneElse("my kids had pasta"));
  // La forme de FF-009 continue de mordre.
  assert(isMealForSomeoneElse("on a commandé pour les enfants"));
  // CONDITION DE DÉSARMEMENT — un message MIXTE garde le repas de l'élève.
  assert(!isMealForSomeoneElse("ma fille a mangé des pâtes et j'ai mangé du poulet"));
  assert(!isMealForSomeoneElse("my daughter had pasta and I had chicken"));
  // MENTIONNER un proche ne suffit pas: il faut qu'il soit le SUJET du verbe.
  assert(!isMealForSomeoneElse("ma fille adore les brocolis, j'ai pris du poulet"));
  assert(!isMealForSomeoneElse("j'ai mangé chez ma mère hier soir"));
});

Deno.test("« je n'ai rien mangé » est vetoé, dans les deux langues", () => {
  // Mesuré 1/3 dans CHAQUE langue: une ligne écrite, et une question de
  // précision posée dessus.
  assert(isNoMealDeclared("je n'ai rien mangé aujourd'hui"));
  assert(isNoMealDeclared("I didn't eat anything today"));
  assert(isNoMealDeclared("I haven't eaten today"));
  assert(isNoMealDeclared("j'ai sauté le déjeuner"));
  assert(isNoMealDeclared("I skipped lunch"));
  // CONDITION DE DÉSARMEMENT — le repas gagne sur la négation qui le précède.
  assert(!isNoMealDeclared("je n'ai rien mangé ce matin mais j'ai pris du poulet à midi"));
  assert(!isNoMealDeclared("I didn't eat this morning but I had chicken at lunch"));
  // CONTRE-ÉPREUVE — une déclaration normale n'est jamais vetoée.
  assert(!isNoMealDeclared("j'ai mangé du poulet"));
  assert(!isNoMealDeclared("I had chicken"));
});
