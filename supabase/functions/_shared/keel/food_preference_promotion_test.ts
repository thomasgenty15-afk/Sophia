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
// LE TROISIÈME, moins visible et tout aussi coûteux: les deux générateurs
// sérialisent `practical_constraints` EN ENTIER dans leur prompt. Tout ce qu'on
// range dedans est servi au modèle, y compris une liste d'UUID de comptabilité.

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
