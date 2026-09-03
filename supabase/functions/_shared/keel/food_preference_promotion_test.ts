// DE LA MÉMOIRE À LA COMPOSITION — ce que ces tests protègent.
//
// LE FILTRE QUI COMPTE LE PLUS: `sensitive` et `safety` ne montent jamais dans
// une carte souple et éditable. Le dur a sa table (`student_safety_constraints`,
// synchrone, sans cache, sans ranking), et une allergie qui arriverait ici
// serait exactement la confusion des deux couches que le pivot a tranchée.
//
// LE SECOND: `kind='event'` est exclu. « J'ai mangé une pizza mardi » est un
// fait daté, pas un goût. Le promouvoir mettrait une pizza dans toutes les
// semaines à venir.
//
// LE TROISIÈME, moins visible et tout aussi coûteux: UN générateur sérialise
// `practical_constraints` EN ENTIER dans son prompt. Tout ce qu'on range dedans
// lui est servi, y compris une liste d'UUID de comptabilité — c'est ce que la
// garde de prompt (`constraintsForPrompt`) retire.
//
// ⚠️ UN SEUL, ET PAS « LES DEUX GÉNÉRATEURS »: cet en-tête l'a dit pendant des
// mois, et c'était FAUX. Mesuré le 2026-08-18, le seul point du dépôt qui
// sérialise le jsonb entier est `week_plan_generation.ts:560`
// (`JSON.stringify(args.situation.practicalConstraints ?? {})`), alimenté par
// `generate-week-plan-v1/index.ts:714`, qui passe par `constraintsForPrompt`.
// `generate-meal-v1` et `generate-household-meal-v1` ne reçoivent que des CLÉS
// NOMMÉES — `meal_generation.ts:2220` le dit déjà, au même sujet: « ce
// générateur-ci lit des clés NOMMÉES […] une clé de plus y est invisible tant
// que personne ne la passe » — et le chemin foyer (`household_voices_io.ts:194`)
// n'extrait de la colonne que `food_preferences`.
//
// CE QUE ÇA CHANGE POUR LE LOT SUIVANT: une clé neuve posée dans
// `practical_constraints` n'atteint QUE le plan de semaine. Pour les deux
// autres, il faut la PASSER. Croire cet en-tête, c'était poser sa clé et
// repartir en pensant être servi — le défaut exact de `coach_food_rules`: un
// écran, des gardes, trente tests, et aucun lecteur au runtime.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyFoodPreferenceDecision,
  capDismissed,
  constraintsForPrompt,
  FOOD_PREFERENCES_DISMISSED_KEY,
  FOOD_PREFERENCES_KEY,
  FOOD_PREFERENCES_ORIGIN_KEY,
  foodPreferencesByOrigin,
  foodPreferencesForPrompt,
  ignorableTokens,
  MAX_DISMISSED,
  type MemoryItemForPromotion,
  originIdsOf,
  preferencesWorthRechecking,
  proposeFoodPreferences,
  reconcileFoodPreferences,
} from "./food_preference_promotion.ts";

function item(over: Partial<MemoryItemForPromotion> = {}): MemoryItemForPromotion {
  return {
    id: "m-1",
    kind: "fact",
    status: "active",
    content_text: "The student dislikes broccoli.",
    normalized_summary: "Dislikes broccoli",
    domain_keys: ["sante.alimentation"],
    confidence: 0.9,
    sensitivity_level: "normal",
    ...over,
  };
}

Deno.test("un goût alimentaire actif est proposé", () => {
  const out = proposeFoodPreferences({ items: [item()] });
  assertEquals(out, [{ memoryItemId: "m-1", text: "Dislikes broccoli" }]);
});

Deno.test("LA LIGNE MÉDICALE: sensitive et safety ne montent jamais", () => {
  const out = proposeFoodPreferences({
    items: [
      item({ id: "a", sensitivity_level: "sensitive" }),
      item({ id: "b", sensitivity_level: "safety" }),
      item({ id: "c" }),
    ],
  });
  assertEquals(out.map((p) => p.memoryItemId), ["c"]);
});

Deno.test("un ÉVÉNEMENT daté n'est pas un goût", () => {
  // « J'ai mangé une pizza mardi » ne doit pas devenir une contrainte de
  // composition pour toutes les semaines suivantes.
  const out = proposeFoodPreferences({
    items: [
      item({ id: "a", kind: "event" }),
      item({ id: "b", kind: "action_observation" }),
      item({ id: "c", kind: "statement" }),
    ],
  });
  assertEquals(out.map((p) => p.memoryItemId), ["c"]);
});

Deno.test("un souvenir PÉRIMÉ ou REMPLACÉ ne monte pas", () => {
  for (const status of ["superseded", "invalidated", "archived"]) {
    assertEquals(proposeFoodPreferences({ items: [item({ status })] }), []);
  }
});

Deno.test("LE PREMIER JOUR: un `candidate` de haute confiance est proposé", () => {
  // MESURÉ sur un run réel de 3 semaines. Le premier lot d'un élève sort
  // `candidate` non pas parce qu'on doute du contenu (confiance 0,95) mais
  // parce que le SUJET vient d'être créé dans le même lot (lien 0,62). Les
  // mêmes phrases, trois jours plus tard, sortent `active`. Refuser
  // `candidate` rendait donc invisible tout ce qu'un élève neuf dit sur sa
  // bouffe — et le cron d'entretien l'archivait à J+14, sans qu'il ait jamais
  // été proposable.
  const out = proposeFoodPreferences({ items: [item({ status: "candidate" })] });
  assertEquals(out.map((p) => p.memoryItemId), ["m-1"]);
});

Deno.test("un `candidate` sous le seuil de confiance ne monte toujours pas", () => {
  // Le plancher de confiance est ce qui reste pour tenir la ligne: c'est la
  // confiance PROPRE de l'item, pas son statut, qui dit si on ose le proposer.
  assertEquals(
    proposeFoodPreferences({ items: [item({ status: "candidate", confidence: 0.6 })] }),
    [],
  );
});

Deno.test("ce que l'élève a DÉJÀ refusé ne remonte jamais", () => {
  // `hidden_by_user` / `deleted_by_user`: il a dit non une fois. Reproposer,
  // c'est insister.
  for (const status of ["hidden_by_user", "deleted_by_user"]) {
    assertEquals(proposeFoodPreferences({ items: [item({ status })] }), []);
  }
  // Et l'écart explicite tient aussi, sur un item resté actif.
  assertEquals(
    proposeFoodPreferences({ items: [item()], dismissed: ["m-1"] }),
    [],
  );
});

Deno.test("hors des domaines promouvables, rien ne monte", () => {
  const out = proposeFoodPreferences({
    items: [
      item({ id: "a", domain_keys: ["sante.sommeil"] }),
      item({ id: "b", domain_keys: [] }),
      item({ id: "c", domain_keys: ["habitudes.execution", "sante.alimentation"] }),
    ],
  });
  assertEquals(out.map((p) => p.memoryItemId), ["c"]);
});

Deno.test("une contrainte de VIE monte, même sans clé alimentaire", () => {
  // Le trou mesuré le 2026-08-06 : ces deux phrases-là existaient en base, ne
  // portaient pas `sante.alimentation`, et décidaient pourtant de ce qu'on peut
  // proposer à manger. Elles n'atteignaient jamais le prompt des générateurs.
  const out = proposeFoodPreferences({
    items: [
      item({
        id: "night",
        content_text: "Travaille de nuit trois fois par semaine.",
        normalized_summary: null,
        domain_keys: ["travail.charge", "sante.sommeil"],
      }),
      item({
        id: "kitchen",
        content_text: "Shares kitchen with 4 flatmates; batch cooks on Sundays.",
        normalized_summary: null,
        domain_keys: ["habitudes.environnement", "habitudes.planification"],
      }),
      item({
        id: "training",
        content_text: "Trains Tuesday and Thursday evenings.",
        normalized_summary: null,
        domain_keys: ["sante.activite_physique"],
      }),
    ],
  });
  assertEquals(out.map((p) => p.memoryItemId), ["night", "kitchen", "training"]);
});

Deno.test("le clinique et l'intime restent DEHORS de la carte souple", () => {
  // `sante.medical` a sa table — `student_safety_constraints`, synchrone, sans
  // ranking. `psychologie.*` et `relations.*` feraient de cette carte un journal
  // intime, et « ma sœur est allergique » un piège à confondre les deux couches.
  const out = proposeFoodPreferences({
    items: [
      item({ id: "med", domain_keys: ["sante.medical"] }),
      item({ id: "mood", domain_keys: ["psychologie.emotions"] }),
      item({ id: "family", domain_keys: ["relations.famille"] }),
      item({ id: "energy", domain_keys: ["sante.energie"] }),
    ],
  });
  assertEquals(out, []);
});

Deno.test("élargir la porte ne desserre AUCUNE autre garde", () => {
  // Une contrainte de vie reste soumise au plancher de confiance, à la ligne
  // médicale, aux `kind` promouvables et aux statuts — exactement comme une
  // préférence alimentaire. C'est ce qui rend l'élargissement sûr.
  const life = { domain_keys: ["travail.charge"] };
  assertEquals(
    proposeFoodPreferences({ items: [item({ ...life, confidence: 0.6 })] }),
    [],
  );
  assertEquals(
    proposeFoodPreferences({ items: [item({ ...life, sensitivity_level: "sensitive" })] }),
    [],
  );
  assertEquals(
    proposeFoodPreferences({ items: [item({ ...life, kind: "event" })] }),
    [],
  );
  assertEquals(
    proposeFoodPreferences({ items: [item({ ...life, status: "superseded" })] }),
    [],
  );
});

Deno.test("sous le seuil de confiance, on ne propose pas", () => {
  assertEquals(proposeFoodPreferences({ items: [item({ confidence: 0.6 })] }), []);
  assertEquals(proposeFoodPreferences({ items: [item({ confidence: null })] }), []);
});

Deno.test("ce qui est déjà gardé n'est pas reproposé, à la casse près", () => {
  const out = proposeFoodPreferences({
    items: [item()],
    kept: ["dislikes BROCCOLI"],
  });
  assertEquals(out, []);
});

Deno.test("deux souvenirs du même texte ne font qu'une proposition", () => {
  const out = proposeFoodPreferences({
    items: [item({ id: "a" }), item({ id: "b" })],
  });
  assertEquals(out.length, 1);
});

// ---------------------------------------------------------------------------
// L'écriture dans practical_constraints
// ---------------------------------------------------------------------------

Deno.test("garder n'écrase AUCUNE autre clé", () => {
  // Le motif des deux cartes qui existent: chacune possède UNE clé et fusionne
  // le reste. Deux cartes ouvertes côte à côte ne doivent pas se désécrire.
  const before = {
    eating_rhythm: [{ slot: "breakfast" }],
    cook_days: ["mon", "wed"],
  };
  const after = applyFoodPreferenceDecision(before, {
    kind: "keep",
    text: "No broccoli",
    memoryItemId: "m-1",
  });
  assertEquals(after.eating_rhythm, before.eating_rhythm);
  assertEquals(after.cook_days, before.cook_days);
  assertEquals(after[FOOD_PREFERENCES_KEY], ["No broccoli"]);
  // Gardé ET marqué traité: sinon la proposition revient à chaque ouverture,
  // puisqu'elle n'est pas persistée.
  assertEquals(after[FOOD_PREFERENCES_DISMISSED_KEY], ["m-1"]);
});

Deno.test("garder deux fois le même texte ne le double pas", () => {
  let c: Record<string, unknown> = {};
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "No broccoli" });
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "no BROCCOLI" });
  assertEquals(c[FOOD_PREFERENCES_KEY], ["No broccoli"]);
});

Deno.test("l'élève peut éditer et retirer ce qu'il a gardé", () => {
  let c: Record<string, unknown> = {};
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "No broccoli" });
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "Lunch at the canteen" });
  c = applyFoodPreferenceDecision(c, {
    kind: "edit",
    from: "No broccoli",
    to: "No broccoli, no cauliflower",
  });
  assertEquals(c[FOOD_PREFERENCES_KEY], [
    "No broccoli, no cauliflower",
    "Lunch at the canteen",
  ]);
  c = applyFoodPreferenceDecision(c, {
    kind: "remove",
    text: "Lunch at the canteen",
  });
  assertEquals(c[FOOD_PREFERENCES_KEY], ["No broccoli, no cauliflower"]);
});

Deno.test("éditer vers du vide RETIRE, plutôt que de garder une ligne blanche", () => {
  let c: Record<string, unknown> = {};
  c = applyFoodPreferenceDecision(c, { kind: "keep", text: "No broccoli" });
  c = applyFoodPreferenceDecision(c, { kind: "edit", from: "No broccoli", to: "  " });
  assertEquals(c[FOOD_PREFERENCES_KEY], []);
});

Deno.test("LA GARDE DE PROMPT: la comptabilité interne ne part pas au modèle", () => {
  // Les deux générateurs sérialisent le jsonb EN ENTIER. Une liste d'UUID
  // « dismissed » servie au modèle occupe du budget pour du bruit — et un
  // modèle qui la voit à côté de préférences peut les appliquer à l'envers.
  const c = applyFoodPreferenceDecision(
    { cook_days: ["mon"] },
    { kind: "keep", text: "No broccoli", memoryItemId: "m-1" },
  );
  const forPrompt = constraintsForPrompt(c);
  assertEquals(forPrompt[FOOD_PREFERENCES_KEY], ["No broccoli"]);
  assertEquals(forPrompt[FOOD_PREFERENCES_DISMISSED_KEY], undefined);
  assertEquals(forPrompt.cook_days, ["mon"]);
  assert(!JSON.stringify(forPrompt).includes("m-1"));
});

Deno.test("le filtre de prompt ne casse pas sur un jsonb vide ou absent", () => {
  assertEquals(constraintsForPrompt(null), {});
  assertEquals(constraintsForPrompt(undefined), {});
  assertEquals(constraintsForPrompt({}), {});
});

Deno.test("LA GARDE DE PROMPT couvre aussi la table d'origines", () => {
  // Une correspondance texte→UUID est illisible pour un modèle et coûteuse en
  // budget. Elle sert la réconciliation, jamais la composition.
  const c = applyFoodPreferenceDecision({}, {
    kind: "keep",
    text: "No broccoli",
    memoryItemId: "9f2c-source",
  });
  assertEquals(c[FOOD_PREFERENCES_ORIGIN_KEY], {
    "no broccoli": { item: "9f2c-source", at: null, source: "memory" },
  });
  assert(!JSON.stringify(constraintsForPrompt(c)).includes("9f2c-source"));
});

// ---------------------------------------------------------------------------
// LE CYCLE DE VIE — ce qu'une préférence devient quand l'élève revient dessus
// ---------------------------------------------------------------------------
//
// Ces tests portent le défaut mesuré le 2026-08-06 sur trois semaines de
// conversation réelle: le memorizer enregistrait proprement le revirement
// (`superseded` + `superseded_by_item_id`) et `practical_constraints` n'en
// savait rien, parce que le texte gardé était détaché de son souvenir. Le
// prompt de la 3e semaine portait « aime le brocoli rôti » ET « n'aime pas le
// brocoli ».

/** Une ligne gardée, avec son origine datée, comme la carte l'écrit. */
function keptWithOrigin(text: string, sourceId: string, seenAt?: string) {
  return applyFoodPreferenceDecision({}, {
    kind: "keep",
    text,
    memoryItemId: sourceId,
    seenAt: seenAt ?? null,
  });
}

Deno.test("un souvenir REMPLACÉ retire la préférence qu'il portait", () => {
  const before = keptWithOrigin("Likes roasted broccoli", "m-old");
  const result = reconcileFoodPreferences({
    constraints: before,
    items: [
      item({
        id: "m-old",
        status: "superseded",
        superseded_by_item_id: "m-new",
        normalized_summary: "Likes roasted broccoli",
      }),
      // Le remplaçant DOIT être fourni: sans lui le contrôle de plausibilité
      // ne peut pas juger, et ne retire pas.
      item({ id: "m-new", normalized_summary: "Does not like broccoli at all" }),
    ],
  });
  assert(result.changed);
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], []);
  assertEquals(result.dropped, [{
    text: "Likes roasted broccoli",
    memoryItemId: "m-old",
    status: "superseded",
  }]);
  // L'origine part avec la ligne: rien ne doit pointer vers du vide.
  assertEquals(result.constraints[FOOD_PREFERENCES_ORIGIN_KEY], {});
});

Deno.test("LA SUPERSESSION IMPLAUSIBLE ne retire rien, et laisse une trace", () => {
  // MESURÉ au 4e run réel. Le memorizer a rattaché « Theo déteste le
  // brocoli. » à TROIS items, dont « Theo n'aime pas du tout le porridge au
  // petit-déjeuner. » — sans rapport. La réconciliation d'avant, qui ne
  // regardait que le statut, a supprimé une préférence vraie, en silence.
  const before = keptWithOrigin("Theo n'aime pas le porridge", "m-porridge");
  const result = reconcileFoodPreferences({
    // Le prénom, sinon TOUTES les paires sont « liées »: le memorizer préfixe
    // chaque résumé du prénom de l'élève.
    ignoreTokens: ignorableTokens("Theo"),
    constraints: before,
    items: [
      item({
        id: "m-porridge",
        status: "superseded",
        superseded_by_item_id: "m-broccoli",
        normalized_summary: "Theo n'aime pas du tout le porridge au petit-déjeuner",
      }),
      item({ id: "m-broccoli", normalized_summary: "Theo déteste le brocoli" }),
    ],
  });
  assertEquals(result.changed, false);
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], ["Theo n'aime pas le porridge"]);
  assertEquals(result.keptDespiteSupersession, [{
    text: "Theo n'aime pas le porridge",
    memoryItemId: "m-porridge",
    replacementId: "m-broccoli",
  }]);
});

Deno.test("la supersession PLAUSIBLE retire toujours", () => {
  // Le contrôle ne doit pas désarmer le cas nominal: le remplaçant parle bien
  // de la même chose (« brocoli »), donc la ligne part.
  const result = reconcileFoodPreferences({
    ignoreTokens: ignorableTokens("Theo"),
    constraints: keptWithOrigin("Theo aime le brocoli rôti", "m-old"),
    items: [
      item({
        id: "m-old",
        status: "superseded",
        superseded_by_item_id: "m-new",
        normalized_summary: "Theo aime le brocoli s'il est rôti",
      }),
      item({ id: "m-new", normalized_summary: "Theo déteste le brocoli" }),
    ],
  });
  assertEquals(result.changed, true);
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], []);
  assertEquals(result.keptDespiteSupersession, []);
});

Deno.test("un remplaçant NON CHARGÉ ne retire pas non plus", () => {
  // Le contrôle serait désarmé si l'appelant oubliait de charger les cibles de
  // `superseded_by_item_id`: il retomberait sur « pas de remplaçant à
  // comparer », et un `superseded` non vérifiable ne doit pas emporter une
  // ligne. On garde, et on le dit.
  const result = reconcileFoodPreferences({
    constraints: keptWithOrigin("Theo aime le brocoli rôti", "m-old"),
    items: [
      item({ id: "m-old", status: "superseded", superseded_by_item_id: "m-absent" }),
    ],
  });
  assertEquals(result.changed, false);
  assertEquals(result.keptDespiteSupersession.length, 1);
});

Deno.test("une RÉTRACTATION retire aussi, et les autres statuts morts avec", () => {
  for (const status of ["invalidated", "archived", "hidden_by_user", "deleted_by_user"]) {
    const result = reconcileFoodPreferences({
      constraints: keptWithOrigin("Likes roasted broccoli", "m-old"),
      items: [item({ id: "m-old", status })],
    });
    assertEquals(result.constraints[FOOD_PREFERENCES_KEY], [], `statut ${status}`);
  }
});

Deno.test("un souvenir TOUJOURS VIVANT ne retire rien", () => {
  const before = keptWithOrigin("Likes roasted broccoli", "m-old");
  const result = reconcileFoodPreferences({
    constraints: before,
    items: [item({ id: "m-old", status: "active" })],
  });
  assertEquals(result.changed, false);
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], ["Likes roasted broccoli"]);
});

Deno.test("une ligne SANS ORIGINE appartient à l'élève et n'est jamais retirée", () => {
  // Tapée à la main, ou écrite avant que cette clé existe. Aucun souvenir ne
  // la contredit; la retirer serait effacer une décision de l'élève.
  const before = {
    [FOOD_PREFERENCES_KEY]: ["Lunch at the canteen"],
    [FOOD_PREFERENCES_ORIGIN_KEY]: {},
  };
  const result = reconcileFoodPreferences({ constraints: before, items: [] });
  assertEquals(result.changed, false);
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], ["Lunch at the canteen"]);
});

Deno.test("un souvenir INTROUVABLE n'est pas un souvenir démenti", () => {
  // Purge RGPD, lecture partielle, `limit` trop court: dans tous ces cas
  // l'absence est une ignorance. Retirer sur une absence transformerait une
  // erreur de lecture en effacement silencieux d'une préférence.
  const result = reconcileFoodPreferences({
    constraints: keptWithOrigin("Likes roasted broccoli", "m-old"),
    items: [],
  });
  assertEquals(result.changed, false);
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], ["Likes roasted broccoli"]);
});

Deno.test("l'origine SURVIT à une édition de l'élève", () => {
  // Une ligne réécrite reste la même préférence. Perdre son origine ici la
  // rendrait définitivement irretirable — le défaut que cette clé corrige,
  // réintroduit par la porte de l'édition.
  let c = keptWithOrigin("Likes roasted broccoli", "m-old");
  c = applyFoodPreferenceDecision(c, {
    kind: "edit",
    from: "Likes roasted broccoli",
    to: "Likes broccoli only when roasted",
  });
  assertEquals(c[FOOD_PREFERENCES_ORIGIN_KEY], {
    "likes broccoli only when roasted": { item: "m-old", at: null, source: "memory" },
  });
  const result = reconcileFoodPreferences({
    constraints: c,
    items: [item({ id: "m-old", status: "superseded" })],
  });
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], []);
});

Deno.test("les ids à relire se lisent par UNE seule porte", () => {
  // Ce test existe à cause d'un défaut mesuré au 3e run réel: l'appelant
  // serveur fabriquait ses ids avec `Object.values(origin).map(String)`, ce qui
  // rendait `"[object Object]"` depuis que la valeur porte une date. Postgres
  // refusait (`invalid input syntax for type uuid`), la réconciliation ne
  // tournait plus, et seule la ligne de journal du filet le disait.
  let c = keptWithOrigin("A", "m-1", "2026-07-06");
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "B",
    memoryItemId: "m-2",
    seenAt: "2026-07-13",
  });
  assertEquals(originIdsOf(c).sort(), ["m-1", "m-2"]);
  // Et la forme ANCIENNE (id nu) se lit toujours: les jsonb déjà écrits la
  // portent, et une migration pour six élèves serait plus risquée qu'un
  // `typeof`.
  assertEquals(
    originIdsOf({ [FOOD_PREFERENCES_ORIGIN_KEY]: { "a": "m-legacy" } }),
    ["m-legacy"],
  );
  assertEquals(originIdsOf(null), []);
});

Deno.test("une origine ANCIENNE (id nu) réconcilie comme une neuve", () => {
  const legacy = {
    [FOOD_PREFERENCES_KEY]: ["Likes roasted broccoli"],
    [FOOD_PREFERENCES_ORIGIN_KEY]: { "likes roasted broccoli": "m-old" },
  };
  const result = reconcileFoodPreferences({
    constraints: legacy,
    items: [item({ id: "m-old", status: "superseded" })],
  });
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], []);
});

Deno.test("retirer une ligne retire son origine", () => {
  let c = keptWithOrigin("Likes roasted broccoli", "m-old");
  c = applyFoodPreferenceDecision(c, {
    kind: "remove",
    text: "Likes roasted broccoli",
  });
  assertEquals(c[FOOD_PREFERENCES_ORIGIN_KEY], {});
});

// ---------------------------------------------------------------------------
// LE REVIREMENT — remplacer, et non empiler
// ---------------------------------------------------------------------------

Deno.test("le remplaçant d'une ligne gardée est proposé COMME remplacement", () => {
  const kept = keptWithOrigin("Likes roasted broccoli", "m-old");
  const out = proposeFoodPreferences({
    items: [
      // L'ancien porte le lien; il est `superseded` donc jamais proposé.
      item({
        id: "m-old",
        status: "superseded",
        superseded_by_item_id: "m-new",
        normalized_summary: "Likes roasted broccoli",
      }),
      item({ id: "m-new", normalized_summary: "Does not like broccoli" }),
    ],
    kept: kept[FOOD_PREFERENCES_KEY] as string[],
    dismissed: [],
    origin: kept[FOOD_PREFERENCES_ORIGIN_KEY] as Record<string, string>,
  });
  assertEquals(out, [{
    memoryItemId: "m-new",
    text: "Does not like broccoli",
    replaces: "Likes roasted broccoli",
  }]);
});

Deno.test("garder un remplaçant RETIRE la ligne qu'il remplace", () => {
  // C'est ici que la contradiction est tuée à la source: sans `replaces`, le
  // « Keep » ajoutait à côté et les deux moitiés partaient ensemble au modèle.
  let c = keptWithOrigin("Likes roasted broccoli", "m-old");
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Does not like broccoli",
    memoryItemId: "m-new",
    replaces: "Likes roasted broccoli",
  });
  assertEquals(c[FOOD_PREFERENCES_KEY], ["Does not like broccoli"]);
  assertEquals(c[FOOD_PREFERENCES_ORIGIN_KEY], {
    "does not like broccoli": { item: "m-new", at: null, source: "memory" },
  });
});

// ---------------------------------------------------------------------------
// LA VUE DU MODÈLE — datée, la plus récente d'abord
// ---------------------------------------------------------------------------

Deno.test("LA CONTRADICTION NON RELIÉE: le modèle reçoit de quoi trancher", () => {
  // MESURÉ, run réel, semaine 2. Les deux lignes sont `active`, le memorizer
  // n'a posé AUCUN lien entre elles, donc la réconciliation ne peut rien:
  //   « Indisponibilité temporaire pour cuisiner le soir jusqu'au 20 juillet »
  //   « Cuisine de nouveau le soir. »
  // Servies comme un sac de chaînes sans date, elles sont indépartageables —
  // le modèle n'a aucun moyen, même en principe, de savoir laquelle vaut.
  let c = keptWithOrigin("No evening cooking until 20 July", "m-1", "2026-07-06");
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Cooking in the evening again",
    memoryItemId: "m-2",
    seenAt: "2026-07-13",
  });
  assertEquals(foodPreferencesForPrompt(c), [
    "2026-07-13 — Cooking in the evening again",
    "2026-07-06 — No evening cooking until 20 July",
  ]);
});

Deno.test("une ligne SANS date passe en dernier, et sans préfixe inventé", () => {
  const c = {
    [FOOD_PREFERENCES_KEY]: ["Typed by hand", "Dated one"],
    [FOOD_PREFERENCES_ORIGIN_KEY]: {
      "dated one": { item: "m-1", at: "2026-07-06" },
    },
  };
  assertEquals(foodPreferencesForPrompt(c), [
    "2026-07-06 — Dated one",
    "Typed by hand",
  ]);
});

Deno.test("la vue datée arrive AU MODÈLE, par le filtre de prompt", () => {
  // La garde ne vaut que si elle est sur le chemin. `constraintsForPrompt` est
  // le point de passage unique des deux générateurs.
  const c = keptWithOrigin("No broccoli", "m-1", "2026-07-06");
  assertEquals(constraintsForPrompt(c)[FOOD_PREFERENCES_KEY], [
    "2026-07-06 — No broccoli",
  ]);
});

Deno.test("LE PLAFOND coupe par le plus ANCIEN, jamais par le plus récent", () => {
  // Le budget de prompt tronque par la queue, et derrière les préférences il y
  // a la doctrine du coach. Une liste sans plafond finit par l'en pousser
  // dehors — et ce qu'on perd doit être le plus vieux, pas ce que l'élève
  // vient de dire.
  let c: Record<string, unknown> = {};
  for (let i = 0; i < 25; i += 1) {
    const day = String(i + 1).padStart(2, "0");
    c = applyFoodPreferenceDecision(c, {
      kind: "keep",
      text: `pref ${i}`,
      memoryItemId: `m-${i}`,
      seenAt: `2026-07-${day}`,
    });
  }
  const out = foodPreferencesForPrompt(c);
  assertEquals(out.length, 20);
  assertEquals(out[0], "2026-07-25 — pref 24");
  assertEquals(out[19], "2026-07-06 — pref 5");
});

Deno.test("le filtre de prompt reste inerte quand rien n'est gardé", () => {
  assertEquals(foodPreferencesForPrompt(null), []);
  assertEquals(foodPreferencesForPrompt({}), []);
  assertEquals(constraintsForPrompt({ cook_days: ["mon"] })[FOOD_PREFERENCES_KEY], undefined);
});

// ---------------------------------------------------------------------------
// CE QU'ON DEMANDE À L'ÉLÈVE — le trou que la réconciliation ne couvre pas
// ---------------------------------------------------------------------------
//
// La supersession du memorizer est NON DÉTERMINISTE: mesuré le 2026-08-06, le
// même scénario a produit un `superseded` en français et AUCUN lien en anglais.
// Quand il manque, l'écran accumule les deux lignes pour toujours.

Deno.test("REVENU SUR LE SUJET: la ligne ancienne est signalée, la récente non", () => {
  let c = keptWithOrigin("Theo likes roasted broccoli", "m-1", "2026-07-09");
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Theo hates broccoli, the roasted one was a one-off",
    memoryItemId: "m-2",
    seenAt: "2026-07-20",
  });
  const out = preferencesWorthRechecking({
    constraints: c,
    ignoreTokens: ignorableTokens("Theo"),
  });
  assertEquals(out, [{
    text: "Theo likes roasted broccoli",
    at: "2026-07-09",
    newerText: "Theo hates broccoli, the roasted one was a one-off",
    newerAt: "2026-07-20",
  }]);
});

Deno.test("DEUX SUJETS DIFFÉRENTS ne se signalent pas l'un l'autre", () => {
  // Le contrôle doit rester silencieux sur la carte ordinaire d'un élève, sinon
  // il devient du bruit qu'on apprend à ignorer — et il ne servira plus le jour
  // où il a raison.
  let c = keptWithOrigin("Theo dislikes porridge", "m-1", "2026-07-06");
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Theo hates broccoli",
    memoryItemId: "m-2",
    seenAt: "2026-07-20",
  });
  assertEquals(
    preferencesWorthRechecking({ constraints: c, ignoreTokens: ignorableTokens("Theo") }),
    [],
  );
});

Deno.test("MÊME JOUR: dit dans le même souffle, donc pas un revirement", () => {
  let c = keptWithOrigin("Theo hates broccoli", "m-1", "2026-07-20");
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Theo hates broccoli in soup especially",
    memoryItemId: "m-2",
    seenAt: "2026-07-20",
  });
  assertEquals(
    preferencesWorthRechecking({ constraints: c, ignoreTokens: ignorableTokens("Theo") }),
    [],
  );
});

Deno.test("SANS DATE, aucune base pour dire qui est ancien", () => {
  const c = {
    [FOOD_PREFERENCES_KEY]: ["Theo hates broccoli", "Theo likes broccoli roasted"],
    [FOOD_PREFERENCES_ORIGIN_KEY]: {},
  };
  assertEquals(
    preferencesWorthRechecking({ constraints: c, ignoreTokens: ignorableTokens("Theo") }),
    [],
  );
});

Deno.test("SANS LE PRÉNOM, tout se recoupe — la garde serait du bruit", () => {
  // Même piège que `supersessionIsPlausible`: le memorizer préfixe chaque
  // résumé du prénom. Sans `ignoreTokens`, deux lignes sans rapport se
  // signalent, et l'élève apprend à fermer la carte.
  let c = keptWithOrigin("Theo dislikes porridge", "m-1", "2026-07-06");
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Theo hates broccoli",
    memoryItemId: "m-2",
    seenAt: "2026-07-20",
  });
  assertEquals(preferencesWorthRechecking({ constraints: c }).length, 1);
  assertEquals(
    preferencesWorthRechecking({ constraints: c, ignoreTokens: ignorableTokens("Theo") }),
    [],
  );
});

Deno.test("la ligne citée est la PLUS RÉCENTE de celles qui recoupent", () => {
  let c = keptWithOrigin("Theo likes broccoli", "m-1", "2026-07-01");
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Theo is unsure about broccoli",
    memoryItemId: "m-2",
    seenAt: "2026-07-10",
  });
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Theo hates broccoli",
    memoryItemId: "m-3",
    seenAt: "2026-07-20",
  });
  const out = preferencesWorthRechecking({
    constraints: c,
    ignoreTokens: ignorableTokens("Theo"),
  });
  // Les DEUX anciennes sont signalées, chacune vers la plus récente.
  assertEquals(out.map((r) => r.text), [
    "Theo likes broccoli",
    "Theo is unsure about broccoli",
  ]);
  assertEquals([...new Set(out.map((r) => r.newerText))], ["Theo hates broccoli"]);
});

// ---------------------------------------------------------------------------
// Le plafond de `dismissed`
// ---------------------------------------------------------------------------

Deno.test("LE PLAFOND de dismissed coupe par le PLUS ANCIEN", () => {
  // Cette liste n'avait que des `push`, sur une ligne relue à chaque
  // génération. On coupe le vieux: ses ids portent en majorité des souvenirs
  // déjà archivés, donc plus proposables — l'id ne servait plus à rien.
  const ids = Array.from({ length: MAX_DISMISSED + 5 }, (_, i) => `id-${i}`);
  const capped = capDismissed(ids);
  assertEquals(capped.length, MAX_DISMISSED);
  assertEquals(capped[0], "id-5");
  assertEquals(capped.at(-1), `id-${MAX_DISMISSED + 4}`);
});

Deno.test("le plafond dédoublonne et ignore le vide", () => {
  assertEquals(capDismissed(["a", "a", " ", "b", ""]), ["a", "b"]);
});

Deno.test("garder au-delà du plafond ne fait pas grossir le jsonb", () => {
  // La garde doit être SUR LE CHEMIN, pas seulement exportée: c'est
  // `applyFoodPreferenceDecision` que la carte appelle.
  let c: Record<string, unknown> = {};
  for (let i = 0; i < MAX_DISMISSED + 10; i += 1) {
    c = applyFoodPreferenceDecision(c, {
      kind: "dismiss",
      memoryItemId: `id-${i}`,
    });
  }
  assertEquals((c[FOOD_PREFERENCES_DISMISSED_KEY] as string[]).length, MAX_DISMISSED);
  // Et ce qui reste est le RÉCENT.
  assert((c[FOOD_PREFERENCES_DISMISSED_KEY] as string[]).includes(
    `id-${MAX_DISMISSED + 9}`,
  ));
});

Deno.test("sans ligne gardée correspondante, rien n'est annoncé comme remplacement", () => {
  // L'élève avait écarté l'ancienne, ou l'avait déjà retirée: le remplaçant
  // est une proposition ordinaire, pas un échange.
  const out = proposeFoodPreferences({
    items: [
      item({ id: "m-old", status: "superseded", superseded_by_item_id: "m-new" }),
      item({ id: "m-new", normalized_summary: "Does not like broccoli" }),
    ],
    kept: [],
    origin: {},
  });
  assertEquals(out, [{ memoryItemId: "m-new", text: "Does not like broccoli" }]);
});

// ---------------------------------------------------------------------------
// CE QUE L'ÉLÈVE ÉCRIT — la porte d'entrée, et son rang
// ---------------------------------------------------------------------------
//
// Avant le 2026-08-13, une phrase ne pouvait entrer dans `food_preferences` que
// par le memorizer. À l'inscription il n'a rien vu, donc la section « ce qu'ils
// m'ont dit » était VIDE pour exactement la personne qui compose son premier
// plan — celle qu'on veut convaincre.

Deno.test("une ligne écrite se DÉCLARE écrite, et ne prétend à aucun souvenir", () => {
  const c = applyFoodPreferenceDecision({}, {
    kind: "write",
    text: "Je ne mange jamais le matin",
  });
  assertEquals(c[FOOD_PREFERENCES_KEY], ["Je ne mange jamais le matin"]);
  assertEquals(c[FOOD_PREFERENCES_ORIGIN_KEY], {
    "je ne mange jamais le matin": { item: "", at: null, source: "written" },
  });
});

Deno.test("l'id vide d'une ligne écrite n'atteint JAMAIS la requête de réconciliation", () => {
  // Il part dans un `in('id', ids)` sur des UUID. Une chaîne vide y fait
  // refuser la requête entière par Postgres — et la réconciliation cesse de
  // tourner pour TOUT LE MONDE, en silence. C'est la panne déjà mesurée avec
  // `"[object Object]"`, par une autre porte.
  let c = applyFoodPreferenceDecision({}, { kind: "write", text: "Pas de poisson" });
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Dislikes broccoli",
    memoryItemId: "m-1",
  });
  assertEquals(originIdsOf(c), ["m-1"]);
});

Deno.test("le memorizer ne peut pas retirer ce que l'élève a TAPÉ", () => {
  // La ceinture est le `!sourceId` de `reconcileFoodPreferences`: une ligne
  // écrite n'a pas de souvenir, donc aucun souvenir ne peut la démentir.
  const c = applyFoodPreferenceDecision({}, {
    kind: "write",
    text: "Je ne mange jamais le matin",
  });
  const result = reconcileFoodPreferences({
    constraints: c,
    items: [item({ id: "m-1", status: "invalidated" })],
  });
  assertEquals(result.changed, false);
  assertEquals(result.constraints[FOOD_PREFERENCES_KEY], [
    "Je ne mange jamais le matin",
  ]);
});

Deno.test("ce que l'élève a ÉCRIT passe devant ce que l'IA a récolté", () => {
  let c: Record<string, unknown> = {};
  c = applyFoodPreferenceDecision(c, {
    kind: "keep",
    text: "Dislikes broccoli",
    memoryItemId: "m-1",
    seenAt: "2026-08-12",
  });
  c = applyFoodPreferenceDecision(c, {
    kind: "write",
    text: "Je ne mange jamais le matin",
  });
  const split = foodPreferencesByOrigin(c);
  assertEquals(split.written, ["Je ne mange jamais le matin"]);
  assertEquals(split.remembered, ["2026-08-12 — Dislikes broccoli"]);
  // La liste à plat suit le même rang: l'écrit d'abord, et SANS préfixe de
  // date — son rang ne vient plus de sa fraîcheur.
  assertEquals(foodPreferencesForPrompt(c), [
    "Je ne mange jamais le matin",
    "2026-08-12 — Dislikes broccoli",
  ]);
});

Deno.test("LE PLAFOND sacrifie la plus ancienne RÉCOLTE, jamais une consigne écrite", () => {
  // C'EST LE TEST QUI PORTE LE LOT. Avant le renversement, les lignes sans
  // date passaient en dernier et le plafond coupe par la QUEUE: une consigne
  // tapée par l'élève était la PREMIÈRE sacrifiée, au profit de phrases
  // glanées dans une conversation.
  let c: Record<string, unknown> = {};
  for (let i = 0; i < 25; i++) {
    c = applyFoodPreferenceDecision(c, {
      kind: "keep",
      text: `Remembered ${i}`,
      memoryItemId: `m-${i}`,
      // La plus ancienne est `i = 0`; elle doit être la première à tomber.
      seenAt: `2026-07-${String(i + 1).padStart(2, "0")}`,
    });
  }
  c = applyFoodPreferenceDecision(c, {
    kind: "write",
    text: "Je ne mange jamais le matin",
  });

  const lines = foodPreferencesForPrompt(c);
  assertEquals(lines.length, 20);
  assertEquals(lines[0], "Je ne mange jamais le matin");
  assert(!lines.some((l) => l.includes("Remembered 0")));

  // La contre-épreuve: la consigne survit même quand les récoltes sont plus
  // nombreuses que le plafond à elles seules.
  const split = foodPreferencesByOrigin(c);
  assertEquals(split.written, ["Je ne mange jamais le matin"]);
  assertEquals(split.remembered.length, 19);
});

Deno.test("une ligne SANS entrée d'origine n'est PAS promue au rang de consigne", () => {
  // L'absence d'origine est ambiguë: elle dit « tapée à la main » autant que
  // « lien au souvenir perdu ». La direction sûre est de laisser la ligne où
  // elle était — sinon un lien cassé promeut silencieusement une phrase au
  // rang d'instruction.
  const split = foodPreferencesByOrigin({
    [FOOD_PREFERENCES_KEY]: ["Une ligne orpheline"],
  });
  assertEquals(split.written, []);
  assertEquals(split.remembered, ["Une ligne orpheline"]);
});

// ===========================================================================
// LE MAGASIN DURABLE — `RetainedItem` rangés à côté des phrases plates
// ===========================================================================
//
// CE QUE CES TESTS PROTÈGENT, DANS L'ORDRE D'IMPORTANCE:
//
//  1. LE FORMAT EXISTANT CONTINUE DE SE LIRE. Les phrases déjà en base n'ont
//     pas de `kind` et ne peuvent pas être reclassées sans inférence (§7 de la
//     nomenclature). Elles ressortent dans `legacyNotes`, TELLES QUELLES.
//  2. RIEN NE DISPARAÎT EN SILENCE. `canProduce` mord à la LECTURE: une ligne
//     que son producteur n'avait pas le droit d'écrire ne remonte pas, même
//     déjà en base. Elle se COMPTE — sinon un magasin à moitié refusé
//     ressemble à un magasin à moitié vide.
//  3. UN ITEM DIFFORME TOMBE SEUL. Une faute d'un producteur n'efface pas ce
//     que la personne a déclaré le même jour.
//  4. L'ALLER-RETOUR EST UNE IDENTITÉ. Écrire puis relire ne doit rien perdre,
//     sinon la carte affiche autre chose que ce que la personne a validé.

import {
  parseRetainedItem,
  type RetainedItem,
} from "./retained_item.ts";
import {
  partitionForDurableStore,
  readRetainedItems,
  RETAINED_ITEMS_KEY,
  retainedItemsFrom,
  withRetainedItems,
} from "./food_preference_promotion.ts";

const ZOE = "11111111-1111-4111-8111-111111111111";
const MEMORY_ITEM = "aaaaaaaa-0000-4000-8000-000000000009";

/**
 * Un item de test, construit par LA SEULE PORTE D'ENTRÉE du socle.
 *
 * Jamais un `as RetainedItem`: ce dépôt a la cicatrice « `as` sur un type
 * étranger désarme le typecheck », mesurée en `200` au log et `null` en
 * silence. Une fixture illisible fait tomber le test, bruyamment.
 */
function retained(over: Record<string, unknown> = {}): RetainedItem {
  const parsed = parseRetainedItem({
    kind: "food.exclude",
    scope: "durable",
    subject: "household",
    text: "les rochers coco",
    value: null,
    source: "questionnaire",
    at: "2026-08-18",
    item: "",
    confidence: null,
    ...over,
  });
  if (!parsed) throw new Error(`fixture illisible: ${JSON.stringify(over)}`);
  return parsed;
}

Deno.test("ALLER-RETOUR: écrire puis relire est une IDENTITÉ", () => {
  const items = [
    retained(),
    retained({
      kind: "portion.adjust",
      subject: `member:${ZOE}`,
      text: "un peu trop pour Zoé",
      value: { direction: "down", magnitude: "slight" },
    }),
    retained({
      kind: "logistics.set",
      text: "25 minutes en semaine",
      value: { field: "cooking_time_min", value: 25 },
      // ⛔ LOT M5 — cette famille est fermée aux producteurs SERVEUR: elle
      // change le CHAMP, elle ne se retient plus. `written` la garde, parce que
      // `written` EST la personne et que sa carte doit pouvoir tout écrire —
      // contrepartie exacte des interdits. Le magasin doit donc savoir relire
      // ce qu'elle y met.
      source: "written",
    }),
    retained({
      kind: "rhythm.set",
      subject: `member:${ZOE}`,
      text: "pas de petit-déjeuner",
      value: { occasion: "breakfast", present: false },
      source: "written",
    }),
    retained({
      kind: "method.avoid",
      source: "conversation",
      item: MEMORY_ITEM,
      confidence: 0.82,
      text: "rien de frit",
    }),
  ];
  const stored = withRetainedItems({}, items);
  assertEquals(retainedItemsFrom(stored).items, items);
  assertEquals(readRetainedItems(stored).refused.total, 0);
});

Deno.test("LE FORMAT EXISTANT: une phrase plate ressort INTACTE, sans `kind`", () => {
  // Le cas le plus important du lot. Ces phrases sont en base aujourd'hui, sans
  // `kind`, et les reclasser demanderait de lire du texte libre — « laitue » ≠
  // « lait », 12 faux positifs sur 12 mesurés dans ce dépôt.
  const legacy = {
    [FOOD_PREFERENCES_KEY]: [
      "N'aime pas le brocoli.",
      "Aime le brocoli s'il est rôti.",
    ],
    [FOOD_PREFERENCES_ORIGIN_KEY]: { "n'aime pas le brocoli.": { item: "m-1" } },
  };
  const out = retainedItemsFrom(legacy);
  assertEquals(out.legacyNotes, [
    "N'aime pas le brocoli.",
    "Aime le brocoli s'il est rôti.",
  ]);
  // ⛔ RIEN N'A ÉTÉ DEVINÉ: aucun item, et aucun refus non plus — il n'y avait
  // rien à refuser. Une migration rétroactive apparaîtrait ici.
  assertEquals(out.items, []);
  assertEquals(readRetainedItems(legacy).refused.total, 0);
});

Deno.test("les deux magasins COHABITENT, et aucun n'efface l'autre", () => {
  const legacy = applyFoodPreferenceDecision({ cook_days: ["mon"] }, {
    kind: "write",
    text: "Pas de poisson le lundi",
  });
  const both = withRetainedItems(legacy, [retained()]);

  const out = retainedItemsFrom(both);
  assertEquals(out.legacyNotes, ["Pas de poisson le lundi"]);
  assertEquals(out.items.map((i) => i.text), ["les rochers coco"]);
  // Le pont existant n'a pas bougé d'un pouce.
  assertEquals(foodPreferencesForPrompt(both), ["Pas de poisson le lundi"]);
  assertEquals(both.cook_days, ["mon"]);
});

Deno.test("`withRetainedItems` NE MUTE PAS son entrée", () => {
  // Deux cartes ouvertes côte à côte ne doivent pas se désécrire l'une l'autre:
  // le patron d'`EatingRhythmCard`. Muter l'entrée ferait fuiter l'écriture
  // dans la copie que l'appelant croit intacte.
  const before: Record<string, unknown> = { cook_days: ["mon"] };
  const after = withRetainedItems(before, [retained()]);
  assertEquals(before, { cook_days: ["mon"] });
  assertEquals(before[RETAINED_ITEMS_KEY], undefined);
  assert(after !== before);
  assertEquals((after[RETAINED_ITEMS_KEY] as unknown[]).length, 1);
});

Deno.test("GARDE — un `craving` n'entre PAS dans le magasin durable", () => {
  // « Une envie qui devient durable cesse d'être une envie et devient une
  // habitude qu'on n'a pas demandée » (§2 axe 2). Le `next_plan` a son magasin.
  const durable = retained();
  const craving = retained({
    kind: "craving",
    scope: "next_plan",
    source: "conversation",
    item: MEMORY_ITEM,
    confidence: 0.9,
    text: "des fajitas la semaine prochaine",
    value: null,
  });

  const split = partitionForDurableStore([durable, craving]);
  assertEquals(split.durable, [durable]);
  assertEquals(split.notDurable, [craving]);

  // ⚠️ ON REGARDE LE JSONB ÉCRIT, PAS SEULEMENT CE QU'ON RELIT. La lecture
  // filtre AUSSI sur le durable (ceinture et bretelles), donc un test qui ne
  // vérifierait que le retour de `retainedItemsFrom` resterait vert si le
  // filtre d'ÉCRITURE disparaissait: une bretelle testée par la ceinture est
  // une bretelle qu'on peut couper sans que rien ne tombe. Mesuré: la première
  // version de ce test survivait à la mutation.
  const stored = withRetainedItems({}, [durable, craving]);
  assertEquals((stored[RETAINED_ITEMS_KEY] as unknown[]).length, 1);
  assert(!JSON.stringify(stored).includes("fajitas"));
  assertEquals(retainedItemsFrom(stored).items, [durable]);
});

Deno.test("GARDE — LE CAS QUI PASSE: tout ce qui est `durable` entre", () => {
  // Une garde sans cas passant est une garde cassée qui ressemble à une garde
  // qui marche. Les cinq familles durables traversent.
  const items = [
    retained({ kind: "food.prefer", text: "plus de lentilles" }),
    retained({ kind: "method.prefer", text: "au four" }),
    retained({
      kind: "portion.adjust",
      text: "pas assez",
      value: { direction: "up", magnitude: "clear" },
    }),
    retained({
      kind: "rhythm.set",
      text: "un goûter",
      value: { occasion: "snack_pm", present: true },
      source: "written",
    }),
    retained({
      kind: "logistics.set",
      text: "budget 90",
      value: { field: "budget_amount", value: 90 },
      source: "written",
    }),
  ];
  const out = readRetainedItems(withRetainedItems({}, items));
  assertEquals(out.items, items);
  assertEquals(out.refused, {
    total: 0,
    forbiddenProducer: 0,
    malformed: 0,
    notDurable: 0,
  });
});

Deno.test("§2.2 — une ligne HORS DROITS ne remonte pas, et elle se COMPTE", () => {
  // `canProduce` mord À LA LECTURE. Le memorizer n'a pas le droit d'écrire un
  // `portion.adjust` (« les portions étaient trop grosses », dans un foyer de
  // quatre, ne désigne personne). Une telle ligne, même déjà en base, ne
  // remonte pas — et sans ce compteur, elle disparaîtrait en silence.
  const store = {
    [RETAINED_ITEMS_KEY]: [
      {
        kind: "portion.adjust",
        scope: "durable",
        subject: "household",
        text: "les portions étaient trop grosses",
        value: { direction: "down", magnitude: "clear" },
        source: "conversation",
        at: "2026-08-18",
        item: MEMORY_ITEM,
        confidence: 0.9,
      },
    ],
  };
  const out = readRetainedItems(store);
  assertEquals(out.items, []);
  assertEquals(out.refused, {
    total: 1,
    forbiddenProducer: 1,
    malformed: 0,
    notDurable: 0,
  });
});

Deno.test("§2.2 — LE CAS QUI PASSE: la MÊME ligne, produite par le questionnaire", () => {
  // Le questionnaire est le SEUL producteur de `portion.adjust`, et il pose la
  // question avec la liste du foyer sous les yeux. Sans ce cas, le test
  // ci-dessus passerait aussi bien si `canProduce` refusait TOUT.
  const out = readRetainedItems(
    withRetainedItems({}, [
      retained({
        kind: "portion.adjust",
        source: "questionnaire",
        text: "les portions étaient trop grosses",
        value: { direction: "down", magnitude: "clear" },
      }),
    ]),
  );
  assertEquals(out.items.length, 1);
  assertEquals(out.refused.forbiddenProducer, 0);
});

Deno.test("un item DIFFORME tombe SEUL, et il est compté `malformed`", () => {
  // Patron `parseAwayDays`: une faute de frappe d'un producteur ne doit pas
  // effacer une déclaration lisible du même jour. ⛔ Et un `value` qui porte des
  // GRAMMES fait tomber l'item ENTIER — le socle refuse, il ne nettoie pas:
  // nettoyer garderait la ligne en effaçant la preuve qu'un producteur fabrique
  // de la précision.
  const good = retained({ text: "les rochers coco" });
  const store = {
    [RETAINED_ITEMS_KEY]: [
      { kind: "food.exclude", scope: "durable" }, // à moitié écrit
      {
        kind: "portion.adjust",
        scope: "durable",
        subject: "household",
        text: "moins 80 g",
        value: { direction: "down", magnitude: "clear", grams: 80 },
        source: "questionnaire",
        at: "2026-08-18",
        item: "",
        confidence: null,
      },
      ...(withRetainedItems({}, [good])[RETAINED_ITEMS_KEY] as unknown[]),
    ],
  };
  const out = readRetainedItems(store);
  assertEquals(out.items, [good]);
  assertEquals(out.refused, {
    total: 2,
    forbiddenProducer: 0,
    malformed: 2,
    notDurable: 0,
  });
});

Deno.test("un `next_plan` DÉJÀ en base est refusé à la lecture, et compté", () => {
  // Ceinture et bretelles: `withRetainedItems` le refuse à l'écriture, la
  // lecture le refuse aussi. Une version antérieure d'un producteur, ou une
  // écriture directe en SQL, ne doit pas faire entrer une envie dans le durable.
  const store = {
    [RETAINED_ITEMS_KEY]: [
      {
        kind: "craving",
        scope: "next_plan",
        subject: "household",
        text: "des fajitas",
        value: null,
        source: "draft_note",
        at: "2026-08-18",
        item: "",
        confidence: null,
      },
    ],
  };
  const out = readRetainedItems(store);
  assertEquals(out.items, []);
  assertEquals(out.refused, {
    total: 1,
    forbiddenProducer: 0,
    malformed: 0,
    notDurable: 1,
  });
});

Deno.test("un magasin QUI N'EST PAS UNE LISTE compte pour UN refus, pas zéro", () => {
  // À zéro, un jsonb corrompu serait indiscernable d'un jsonb vide — et « il
  // n'y a rien » est exactement la lecture qu'on ne veut pas faire d'un magasin
  // qu'on n'a pas su ouvrir.
  const broken = readRetainedItems({ [RETAINED_ITEMS_KEY]: { oops: true } });
  assertEquals(broken.items, []);
  assertEquals(broken.refused.total, 1);
  assertEquals(broken.refused.malformed, 1);

  // LE CAS QUI PASSE: une clé ABSENTE n'est pas une corruption.
  assertEquals(readRetainedItems({}).refused.total, 0);
  assertEquals(readRetainedItems(null).refused.total, 0);
  assertEquals(readRetainedItems(undefined).items, []);
});

Deno.test("LA GARDE DE PROMPT couvre aussi le magasin structuré", () => {
  // Le magasin porte des `member:<uuid>`, des id de `memory_items` et des
  // `confidence`: illisibles pour un modèle, coûteux en budget, et derrière ce
  // budget il y a la doctrine du coach. Le lot 1C construit la consigne à
  // partir des mêmes items — servir le jsonb brut EN PLUS ferait doublon.
  const c = withRetainedItems({ cook_days: ["mon"] }, [
    retained({ subject: `member:${ZOE}`, text: "pas de rochers coco" }),
  ]);
  const forPrompt = constraintsForPrompt(c);
  assertEquals(forPrompt[RETAINED_ITEMS_KEY], undefined);
  assert(!JSON.stringify(forPrompt).includes(ZOE));
  // LE CAS QUI PASSE: le reste de la colonne arrive intact au modèle.
  assertEquals(forPrompt.cook_days, ["mon"]);
});

Deno.test("écrire une liste VIDE efface le magasin, sans toucher au reste", () => {
  const c = withRetainedItems({ cook_days: ["mon"] }, [retained()]);
  const cleared = withRetainedItems(c, []);
  assertEquals(cleared[RETAINED_ITEMS_KEY], []);
  assertEquals(retainedItemsFrom(cleared).items, []);
  assertEquals(cleared.cook_days, ["mon"]);
});

// ===========================================================================
// LES BRETELLES — les gardes qu'on pouvait couper sans un seul rouge
// ===========================================================================
//
// Le vérificateur du lot 1A a joué 21 mutations sur ce module: SIX gardes se
// coupaient en laissant les 86 tests VERTS (contrat de phase 0, §7.4). Une
// garde qu'aucune mutation ne fait rougir n'est pas une garde, c'est un
// commentaire — et deux de celles-ci étaient justement documentées comme « pas
// cosmétiques » dans le module.
//
// Chaque test ci-dessous est nommé par LA MUTATION qu'il fait tomber, et porte
// son cas qui PASSE: une garde sans cas passant est une garde cassée qui
// ressemble à une garde qui marche.

Deno.test("B3 — LE NOM STOCKÉ est `retained_items`, épinglé à son littéral", () => {
  // ⚠️ CETTE CLÉ EST DÉCLARÉE DEUX FOIS, DANS DEUX LANGAGES, ET RIEN NE RELIE
  // LES DEUX. Ici `RETAINED_ITEMS_KEY`; et EN DUR dans le port d'écriture du
  // lot 1D (`20260818240000_a_write_port_for_what_sophia_knows.sql`):
  //   `jsonb_set(coalesce(sg.practical_constraints, '{}'), '{retained_items}', p_items, true)`
  // ainsi que dans le `where` de concurrence optimiste de la même RPC
  // (`sg.practical_constraints -> 'retained_items'`).
  //
  // Tous les autres tests de ce fichier IMPORTENT la constante et s'en servent
  // comme clé: ils vérifient la cohérence du module AVEC LUI-MÊME. Renommer la
  // constante les laissait donc tous verts pendant que la RPC continuait
  // d'écrire dans `retained_items` — une clé que plus personne ne lisait, et un
  // magasin qui a l'air vide. Le littéral s'épingle ici, une fois.
  assertEquals(RETAINED_ITEMS_KEY, "retained_items");
});

Deno.test("B3 — l'ALLER-RETOUR passe par le LITTÉRAL, jamais par la constante", () => {
  // L'épinglage ci-dessus dit le NOM; celui-ci dit que l'écriture et la lecture
  // atterrissent bien dessus. La clé est tapée en dur des deux côtés, dans la
  // forme exacte sous laquelle la base la connaît.
  const item = retained({ text: "pas de rochers coco" });

  const stored = withRetainedItems({ cook_days: ["mon"] }, [item]);
  assert(
    Array.isArray(stored["retained_items"]),
    "l'écriture n'a pas atterri sur `retained_items`",
  );
  assertEquals((stored["retained_items"] as unknown[]).length, 1);

  // …et la lecture, sur un jsonb dont la clé n'a JAMAIS touché la constante:
  // c'est exactement la forme que la RPC de 1D dépose dans la colonne.
  const fromSql = { "retained_items": stored["retained_items"] };
  assertEquals(readRetainedItems(fromSql).items, [item]);
  assertEquals(readRetainedItems(fromSql).refused.total, 0);
});

Deno.test("B4 — un SCALAIRE ou un `null` dans le magasin ne fait pas tomber la lecture", () => {
  // `[null, 42, "texte", {…}]` est un jsonb PARFAITEMENT LÉGAL: la colonne n'a
  // aucun schéma, et une écriture SQL directe, une migration, ou un producteur
  // d'une version antérieure peut y déposer n'importe quoi. Le socle encaisse
  // (`asRecord` rend `null`), mais la SECONDE passe de `readRetainedItems` —
  // celle qui compte les refus — déréférence `entry.kind`: sans sa garde de
  // non-objet, elle lève un TypeError sur `null`, et c'est la carte ENTIÈRE qui
  // tombe, pas la seule ligne fautive. Aucun test ne mettait autre chose qu'un
  // objet dans ce tableau.
  const good = retained({ text: "les rochers coco" });
  const store = {
    [RETAINED_ITEMS_KEY]: [
      null,
      42,
      "texte",
      ...(withRetainedItems({}, [good])[RETAINED_ITEMS_KEY] as unknown[]),
    ],
  };

  // Si la garde saute, l'appel qui suit JETTE — et le test rougit là.
  const out = readRetainedItems(store);

  // LE CAS QUI PASSE: la ligne lisible remonte, elle n'est pas emportée.
  assertEquals(out.items, [good]);
  // ⚠️ ET LES TROIS AUTRES SE COMPTENT. À zéro, un magasin à moitié illisible
  // ressemblerait à un magasin à moitié vide.
  assertEquals(out.refused, {
    total: 3,
    forbiddenProducer: 0,
    malformed: 3,
    notDurable: 0,
  });
});

Deno.test("B1 — une ligne BLANCHE gardée ne devient pas une case vide", () => {
  // `food_preferences` est un jsonb: une chaîne vide y est possible, et le
  // module l'écrit lui-même noir sur blanc — « une ligne blanche gardée
  // s'affiche comme une case vide dans la carte ». C'était une PROPRIÉTÉ
  // DOCUMENTÉE ET ARMÉE PAR RIEN: `filter(Boolean)` se coupait sans un rouge.
  //
  // ⚠️ CE TEST NE VISE QUE `filter(Boolean)`. Les entrées sont vides SANS
  // espaces: retirer `trim()` ne les rend pas visibles pour autant, donc ce
  // rouge-ci ne peut venir que de la disparition du filtre. Voir B2 pour l'autre
  // moitié — deux mutations qui tombent ensemble n'arment qu'une seule garde.
  const store = { [FOOD_PREFERENCES_KEY]: ["", null, "Pas de brocoli"] };
  // La carte (lot 1D) lit les phrases plates par ici…
  assertEquals(retainedItemsFrom(store).legacyNotes, ["Pas de brocoli"]);
  // …et le prompt du plan de semaine par là.
  assertEquals(foodPreferencesForPrompt(store), ["Pas de brocoli"]);
});

Deno.test("B2 — une ligne gardée arrive TRIMÉE, des deux côtés", () => {
  // L'autre moitié de la même ligne de code. Une phrase entourée d'espaces est
  // VISIBLE (elle passe `Boolean`), donc `filter(Boolean)` ne la rattrape pas:
  // seul `trim()` la nettoie. Sans lui, la carte affiche une ligne décalée, et
  // surtout le texte ne retrouve plus son entrée d'origine — les origines sont
  // indexées par `text.toLowerCase()`, sans espaces, donc la ligne perdrait sa
  // date et son lien au souvenir en silence.
  //
  // ⚠️ CE TEST NE VISE QUE `trim()`: sans `filter(Boolean)`, il reste vert.
  const store = { [FOOD_PREFERENCES_KEY]: ["  Pas de brocoli  "] };
  assertEquals(retainedItemsFrom(store).legacyNotes, ["Pas de brocoli"]);
  assertEquals(foodPreferencesForPrompt(store), ["Pas de brocoli"]);
});

Deno.test("B5 — `constraintsForPrompt` NE MUTE PAS le jsonb qu'on lui donne", () => {
  // C'est le SEUL point de passage du dépôt entre `practical_constraints` et un
  // prompt, et il travaille par `delete`. Appliqués à l'entrée plutôt qu'à une
  // copie, ces QUATRE `delete` ne feraient pas que nettoyer une vue: chez son
  // appelant (`generate-week-plan-v1/index.ts:714`, qui tient `goalRow
  // .practical_constraints` et le persiste), ils EFFACERAIENT de la colonne de
  // la personne sa table d'origines — donc la réconciliation, définitivement,
  // puisque le lien texte→souvenir ne se reconstruit pas — et son magasin
  // structuré. Le module est correct aujourd'hui; rien ne le verrouillait.
  const before: Record<string, unknown> = {
    cook_days: ["mon"],
    [FOOD_PREFERENCES_KEY]: ["Pas de brocoli"],
    [FOOD_PREFERENCES_DISMISSED_KEY]: [MEMORY_ITEM],
    [FOOD_PREFERENCES_ORIGIN_KEY]: {
      "pas de brocoli": { item: MEMORY_ITEM, at: "2026-08-01", source: "memory" },
    },
    [RETAINED_ITEMS_KEY]: withRetainedItems({}, [retained()])[RETAINED_ITEMS_KEY],
    // PROFONDÉMENT IMBRIQUÉ, parce que c'est la forme réelle de cette colonne:
    // `eating_rhythm` et la capacité de cuisine y rangent des sous-objets, et
    // c'est ce qu'un appelant relit après coup en croyant l'avoir gardé intact.
    eating_rhythm: {
      weekday: { lunch: { present: true, notes: ["au bureau", "20 min"] } },
    },
  };
  const snapshot = JSON.parse(JSON.stringify(before));

  const forPrompt = constraintsForPrompt(before);

  // LE CAS QUI PASSE: la vue servie au modèle est bien nettoyée…
  assertEquals(forPrompt[FOOD_PREFERENCES_DISMISSED_KEY], undefined);
  assertEquals(forPrompt[FOOD_PREFERENCES_ORIGIN_KEY], undefined);
  assertEquals(forPrompt[RETAINED_ITEMS_KEY], undefined);
  // …la vue DATÉE arrive bien au modèle — et cette ligne-là mord deux fois: si
  // le `delete` de la table d'origines tapait dans l'entrée, il l'aurait retirée
  // AVANT que `foodPreferencesForPrompt` ne la lise, et la date disparaîtrait.
  assertEquals(forPrompt[FOOD_PREFERENCES_KEY], ["2026-08-01 — Pas de brocoli"]);
  // …et l'ENTRÉE est intacte, jusque dans ses sous-objets.
  assert(forPrompt !== before, "la vue de prompt EST l'entrée");
  assertEquals(before, snapshot);
});

Deno.test("B6 — `retainedItemsFrom` rend EXACTEMENT les deux clés du contrat", () => {
  // La signature est FIGÉE par le contrat de phase 0 (§6) et trois lots écrivent
  // contre elle. `readRetainedItems`, dont ceci est l'enrobage, en rend une
  // TROISIÈME (`refused`) — et `return readRetainedItems(constraints)`
  // compilerait sans un mot: le contrôle de propriétés excédentaires de
  // TypeScript ne mord que sur un littéral d'objet, jamais sur une variable
  // déjà typée. L'enrobage doit donc DÉSTRUCTURER, et c'est la seule partie du
  // §6 qu'aucun compilateur ne dit à sa place.
  const out = retainedItemsFrom(withRetainedItems({}, [retained()]));
  assertEquals(Object.keys(out).sort(), ["items", "legacyNotes"]);
  // LE CAS QUI PASSE: les deux clés portent bien ce qu'elles annoncent.
  assertEquals(out.items.length, 1);
  assertEquals(out.legacyNotes, []);
});

// ===========================================================================
// LA FUITE DU MAGASIN PROVISOIRE — mesurée, fermée, et gardée
// ===========================================================================
//
// CE QUI EST SORTI, ET COMMENT. `constraintsForPrompt` retirait trois clés et
// pas la quatrième: la chaîne `retained_next_plan` n'apparaissait pas une seule
// fois dans le module. Or le §7.2 du contrat a déménagé le magasin PROVISOIRE
// dans cette même colonne, et `week_plan_generation.ts:560` sérialise
// `args.situation.practicalConstraints` EN ENTIER. Sonde du vérificateur, sur
// la lane `generate-week-plan-v1`:
//
//     clés servies au prompt : cook_days, retained_next_plan
//     uuid du souvenir fuite : true
//     confidence fuite       : true
//
// Le commentaire au-dessus de la fonction, lui, disait que la clé n'était « pas
// câblée » et qu'« aucune ligne en base ne porte encore cette clé ». C'était
// vrai à l'écriture. Une contrainte documentée survit à sa cause: le
// commentaire tenait tout seul, la garde non.

Deno.test("B7 — LE MAGASIN PROVISOIRE NE PART PAS AU MODÈLE: cinq champs, nommés", () => {
  // ⚠️ LA CLÉ EST TAPÉE EN DUR, JAMAIS `NEXT_PLAN_ITEMS_KEY`. C'est la leçon
  // B3, dans l'autre sens: si ce test construisait sa fixture avec la
  // constante, renommer la constante changerait la clé de la fixture EN MÊME
  // TEMPS que celle du `delete`, et le test resterait vert pendant que la
  // colonne réelle — écrite par le port SQL du lot 1D et par son miroir front —
  // continuerait de porter `retained_next_plan`, servie brute au modèle.
  const MEMORY = "9f2c1b7e-0000-4000-8000-00000000fa11";
  const cravingJson: Record<string, unknown> = {
    kind: "craving",
    scope: "next_plan",
    subject: `member:${ZOE}`,
    text: "des fajitas la semaine prochaine",
    value: null,
    source: "conversation",
    at: "2026-08-18",
    item: MEMORY,
    confidence: 0.82,
  };

  // LE DÉCOR EST VÉRIFIÉ AVANT DE SERVIR. Une fixture que le socle refuse
  // n'est portée par aucune colonne réelle: ce test protégerait alors une forme
  // que personne n'écrit, et il serait vert pour rien.
  const parsedCraving = parseRetainedItem(cravingJson);
  assert(parsedCraving !== null, "la fixture n'est pas un `RetainedItem` lisible");
  assertEquals(parsedCraving.scope, "next_plan");

  const stored: Record<string, unknown> = {
    cook_days: ["mon"],
    [FOOD_PREFERENCES_KEY]: ["Pas de brocoli"],
    "retained_next_plan": [{ item: cravingJson, anchor: "2026-08-24" }],
  };

  const forPrompt = constraintsForPrompt(stored);
  const served = JSON.stringify(forPrompt);

  // ⚠️ ON N'ASSERTE PAS SEULEMENT L'ABSENCE DE LA CLÉ. Un jour où quelqu'un
  // remplacerait le `delete` par une projection partielle, la clé pourrait
  // disparaître pendant qu'un de ces cinq champs resterait ailleurs. Chacun est
  // donc cherché DANS LE TEXTE SÉRIALISÉ, celui-là même que le prompt reçoit.
  assert(!served.includes(MEMORY), "l'uuid du souvenir d'origine part au modèle");
  assert(!served.includes("0.82"), "la `confidence` part au modèle");
  assert(!served.includes("conversation"), "la `source` part au modèle");
  assert(!served.includes(ZOE), "le `subject` (une bouche) part au modèle");
  assert(!served.includes("2026-08-24"), "l'`anchor` de semaine part au modèle");
  // L'enveloppe entière part, donc le `text` aussi. Il n'est pas dans les cinq:
  // ce n'est pas de la comptabilité interne, c'est la phrase de la personne — et
  // sa route vers le modèle est la consigne que le lot 1C construit, pas ce
  // jsonb brut (« deux lectures d'une même structure divergent »).
  assert(!served.includes("fajitas"));
  assert(
    !Object.hasOwn(forPrompt, "retained_next_plan"),
    "la clé du magasin provisoire est servie au modèle",
  );

  // LE CAS QUI PASSE: le reste de la colonne arrive intact, et la vue datée des
  // préférences est toujours construite.
  assertEquals(forPrompt.cook_days, ["mon"]);
  assertEquals(forPrompt[FOOD_PREFERENCES_KEY], ["Pas de brocoli"]);
});

// ---------------------------------------------------------------------------
// L'INVENTAIRE — la garde GÉNÉRIQUE, et pourquoi elle est un test
// ---------------------------------------------------------------------------
//
// Le vrai défaut n'est pas qu'une clé a été oubliée: c'est que
// `constraintsForPrompt` travaille par LISTE NOIRE, donc que toute clé neuve
// est servie par défaut. L'arbitrage (écrit au-dessus de la fonction) est de
// GARDER la liste noire — une liste blanche vivant dans ce module devrait
// énumérer des clés qu'il ne possède pas (`cook_days`, `away_days`,
// `eating_rhythm`, `fixed_intakes`…), et en oublier une n'aurait rien fait
// fuiter: ça aurait EFFACÉ du prompt une consigne réelle, en silence.
//
// La cause se ferme donc ici, par un test qui relit le DISQUE. Toute clé de
// `practical_constraints` déclarée quelque part dans `_shared/keel/` doit être
// rangée dans l'un des trois seaux ci-dessous, et « retirée » n'est pas une
// étiquette: une clé classée `HIDDEN` n'est verte que si le filtre la retire
// pour de bon.
//
// ⚠️ LA BORNE DU SCAN, NOMMÉE: il ne lit que `_shared/keel/`, et il ne
// reconnaît une clé qu'à la forme `export const …_KEY = "…"` dans un fichier
// qui parle de `practical_constraints`. Une clé déclarée ailleurs, ou en
// littéral nu, lui échappe. C'est la convention du dépôt (les six clés
// d'aujourd'hui la respectent toutes), pas une preuve.

const KEEL_DIR = new URL(".", import.meta.url);

interface ConstraintKeyOnDisk {
  file: string;
  name: string;
  literal: string;
}

async function constraintKeysOnDisk(): Promise<ConstraintKeyOnDisk[]> {
  const out: ConstraintKeyOnDisk[] = [];
  const declaration = /^export const ([A-Z0-9_]+_KEY)\s*=\s*"([a-z0-9_]+)"/;
  for await (const entry of Deno.readDir(KEEL_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith("_test.ts")) continue;
    const src = await Deno.readTextFile(new URL(entry.name, KEEL_DIR));
    if (!src.includes("practical_constraints")) continue;
    for (const line of src.split("\n")) {
      const m = declaration.exec(line);
      if (m) out.push({ file: entry.name, name: m[1], literal: m[2] });
    }
  }
  return out;
}

Deno.test("B8 — TOUTE CLÉ DE `practical_constraints` EST CLASSÉE, servie ou retirée", async () => {
  // ⚠️ LES DEUX LISTES SONT DES LITTÉRAUX. Les écrire avec les constantes du
  // module ferait un test paramétré par ce qu'il mesure: renommer une valeur le
  // laisserait vert.
  //
  // SERVIE = le modèle la voit, et c'est voulu.
  // ⟳ LOT M4 — `memo` est SERVI, et c'est sa raison d'être. Cinq lignes au
  // plus, pour ce qu'aucune famille ne porte et qu'aucun indice ne mesure. Un
  // mémo qui ne serait PAS servi serait un magasin sans lecteur — et celui-ci
  // est précisément celui dont le design dit qu'il serait « le magasin qu'on
  // supprime, avec un autre chapeau ». Il est servi, il est plafonné, et il se
  // voit sur la carte avec sa cause: les trois ensemble, ou aucun.
  const SERVED = ["food_preferences", "kitchen_equipment", "memo"];
  // RETIRÉE = comptabilité interne ou magasin structuré. Le lot 1C construit
  // les consignes à partir de ces items; servir le jsonb brut EN PLUS ferait
  // doublon, dans deux formes différentes, à l'intérieur d'un prompt qui a un
  // budget — et derrière ce budget il y a la doctrine du coach.
  const HIDDEN = [
    "food_preferences_dismissed",
    "food_preferences_origin",
    "retained_items",
    "retained_next_plan",
    // ⟳ LOT M5 — `field_changes` est le JOURNAL des champs que l'IA a changés:
    // ce qui a bougé, sa valeur d'AVANT, et la phrase qui l'a causé. Il est
    // RETIRÉ du prompt, et pour deux raisons qui vont dans le même sens:
    //   ① les valeurs qu'il journalise sont DÉJÀ servies — ce sont les champs
    //      eux-mêmes (`cooking_time_min`, `variety`…), que le prompt lit à leur
    //      place. Le servir en plus dirait deux fois la même chose, dans deux
    //      formes différentes, dans un prompt qui a un budget;
    //   ② il porte l'ANCIENNE valeur. La donner au modèle l'inviterait à
    //      composer entre les deux, alors que la seule qui vaille est celle
    //      qui est écrite dans le champ.
    // Il est fait pour un ÉCRAN — le fil « ce qui vient de changer » — pas pour
    // un prompt.
    "field_changes",
  ];
  // ⚠️ LA SOUPAPE. Un `…_KEY` capté par le scan qui ne désigne PAS une clé de
  // `practical_constraints` se range ici, AVEC SON MOTIF. La remplir pour faire
  // taire une vraie clé de la colonne serait exactement le geste que ce test
  // existe pour rendre visible.
  const NOT_A_CONSTRAINT_KEY: string[] = [
    // ⟳ `L4`, 2026-08-22 — PREMIÈRE ENTRÉE DE CETTE SOUPAPE, et elle mérite
    // d'être lue avant la prochaine.
    //
    // `food_group` (`declared_food_group.ts`, `DECLARED_INTAKE_GROUP_KEY`)
    // n'est PAS une clé de `practical_constraints`: c'est une clé d'une ENTRÉE
    // de `practical_constraints.fixed_intakes[]`, à côté de `food_ref`,
    // `serving_grams` et `protein_g_per_serving`. Elle est capturée parce que
    // le scan est textuel — il retient tout `export const …_KEY = "…"` d'un
    // fichier qui nomme `practical_constraints`, et l'en-tête de
    // `declared_food_group.ts` le nomme pour dire OÙ vit la déclaration.
    //
    // ⛔ ET LA QUESTION QUE POSE CE TEST A QUAND MÊME UNE RÉPONSE, parce qu'elle
    // est la bonne question. VÉRIFIÉ, PAS SUPPOSÉ, le 2026-08-22:
    //
    //   ① `fixedIntakePromptLines` (`fixed_intakes.ts:658`) est le SEUL chemin
    //      par lequel un apport fixe atteint une consigne, et il n'imprime que
    //      `label`, `amount`, `unit`, le moment et les jours. Le jsonb brut n'y
    //      passe pas, donc `food_group` non plus.
    //   ② `constraintsForPrompt` **n'a plus aucun appelant vivant** — deux
    //      mentions en commentaire, sa propre définition, et des tests. Le seul
    //      appelant qui sérialisait `practical_constraints` EN ENTIER était
    //      `generate-week-plan-v1` (dit par `meal_generation.ts:3106`), retiré
    //      le 2026-08-19.
    //
    // Le groupe déclaré n'existe donc que pour le CALCUL (`augmentedIndexFor`
    // → bande de groupe, porteurs de sentinelle). Et il ne DOIT pas être servi:
    // nommer au modèle le groupe d'un aliment déjà mangé l'inviterait à
    // composer autour, alors que la consigne lui dit l'inverse.
    //
    // ⚠️ Le jour où une clé d'une entrée de `fixed_intakes` DOIT partir au
    // modèle, elle passe par `fixedIntakePromptLines`, pas par cette soupape.
    "food_group",

    // ⟳ FF-018 §11, 2026-09-01 — `slot_inferred`.
    //
    // Elle n'est PAS une clé de `practical_constraints`: c'est une clé de
    // `protocol_events.recognized`, à côté de `student_commitment_id`. Elle
    // marque qu'un créneau de photo a été DÉDUIT de l'heure locale plutôt que
    // déclaré par l'élève (`photo_slot_inference.ts :: SLOT_INFERRED_KEY`).
    //
    // Le scan la capte parce qu'il est textuel — il retient tout
    // `export const …_KEY` d'un fichier qui NOMME `practical_constraints` — et
    // `photo_slot_inference.ts` le nomme une fois, pour dire d'où vient
    // l'heure déclarée qu'il préfère au repli (`eating_rhythm[].at`).
    //
    // ⛔ ET LA QUESTION QUE POSE CE TEST A QUAND MÊME SA RÉPONSE. Rien de ce
    // marqueur ne part au modèle: il est lu par `slotWasInferred`, dont les
    // deux seuls appelants sont `analyze-meal-photo-v1` (pour le recopier à
    // travers la ré-analyse) et l'accusé de photo (pour DIRE le créneau
    // déduit). Aucun prompt ne le sérialise.
    "slot_inferred",
  ];

  const found = await constraintKeysOnDisk();
  const literals = [...new Set(found.map((f) => f.literal))].sort();

  // ① LE SCAN LUI-MÊME EST ÉPINGLÉ. Sans cette boucle, une reformulation de
  // commentaire ou un renommage de constante ferait TOMBER une clé hors du scan
  // — et le test resterait vert en ne mesurant plus rien. Une garde qui se coupe
  // sans un rouge n'est pas une garde.
  for (const known of [...SERVED, ...HIDDEN].sort()) {
    assert(
      literals.includes(known),
      `le scan ne trouve plus \`${known}\` sur le disque: il a cessé de ` +
        `mesurer quelque chose. Trouvées: ${literals.join(", ")}`,
    );
  }

  // ② TOUTE CLÉ TROUVÉE EST CLASSÉE. C'est CE rouge-ci que le prochain lot qui
  // pose une clé dans `practical_constraints` doit rencontrer.
  const unclassified = literals.filter((l) =>
    !SERVED.includes(l) && !HIDDEN.includes(l) &&
    !NOT_A_CONSTRAINT_KEY.includes(l)
  );
  assertEquals(
    unclassified,
    [],
    "une clé de `practical_constraints` n'est ni servie ni retirée: dis " +
      "laquelle des deux elle est, dans `constraintsForPrompt` et ici. Tout " +
      "ce que ce jsonb porte part au modèle sur la lane du plan de semaine.",
  );

  // ③ « RETIRÉE » N'EST PAS UNE ÉTIQUETTE. Classer une clé sans ajouter son
  // `delete` laisserait ce fichier cohérent avec lui-même et la clé dans le
  // prompt: le filtre est donc interrogé, clé par clé.
  for (const key of HIDDEN) {
    const out = constraintsForPrompt({ cook_days: ["mon"], [key]: [`sentinelle-${key}`] });
    assert(!Object.hasOwn(out, key), `\`${key}\` est classée retirée et reste servie`);
    assert(
      !JSON.stringify(out).includes(`sentinelle-${key}`),
      `le contenu de \`${key}\` ressort ailleurs dans la vue de prompt`,
    );
    // LE CAS QUI PASSE, à chaque tour: le filtre n'emporte pas le voisinage.
    assertEquals(out.cook_days, ["mon"]);
  }

  // ④ LE CAS QUI PASSE, EN FACE: une clé « servie » arrive bien au modèle. Sans
  // lui, un `constraintsForPrompt` qui rendrait `{}` passerait ③ à la
  // perfection — une garde qui coupe tout est indiscernable d'une garde qui
  // marche.
  for (const key of SERVED) {
    const out = constraintsForPrompt({ [key]: [`sentinelle-${key}`] });
    assert(
      JSON.stringify(out).includes(`sentinelle-${key}`),
      `\`${key}\` est classée servie et n'atteint pas le modèle`,
    );
  }
});
