import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";

import {
  decideSlotMealAsk,
  parseSlotMealButton,
  renderSlotMealAck,
  renderSlotMealAsk,
  SLOT_MEAL_ACTIONS,
  SLOT_MEAL_BUTTON_PREFIX,
  SLOT_MEAL_GOALS,
  SLOT_MEAL_GRACE_HOURS,
  slotMealAskSwitchFrom,
  slotMealButtonId,
} from "./slot_meal_ask.ts";
import { GOAL_TOKENS } from "./tokens.ts";
import { eatingOutCellsFrom } from "./slot_meal_io.ts";

/**
 * FF-062 C1 — LE REPAS D'UN CRÉNEAU DÉCLARÉ QUE LE PLAN NE COMPOSE PAS.
 *
 * ══ CE QUE CES ÉPREUVES TIENNENT ═════════════════════════════════════════
 *
 * · le déclencheur est `eating_out`, JAMAIS `away` — c'est la différence entre
 *   « je mange ailleurs » et « je suis en vacances », et la confondre ferait
 *   partir cinq questions par semaine de congés;
 * · `maintenance` n'ouvre RIEN (R4);
 * · le créneau voyage DANS le jeton (R6): rien en aval ne le devine;
 * · l'heure DÉCLARÉE l'emporte sur le repli;
 * · une question déjà posée aujourd'hui ne se repose pas — « sans plafond »
 *   (R3) n'est pas « sans idempotence »;
 * · « Passer » n'écrit rien, et son accusé ne prétend rien.
 */

const TUESDAY = "2026-03-10"; // mardi

function base(over: Partial<Parameters<typeof decideSlotMealAsk>[0]> = {}) {
  return decideSlotMealAsk({
    goal: "fat_loss",
    muted: false,
    // ⚠️ `null` = « personne n'a choisi », donc l'objectif décide. C'est le cas
    // NOMINAL, et c'est ce qu'il faut par défaut ici: un `true` en dur ferait
    // passer tous les cas de ce fichier par la branche explicite, et la garde
    // de l'objectif ne serait plus éprouvée par personne.
    askEnabled: null,
    // ⛔ VIDE, ET DÉCLARÉ. « Le plan ne compose rien » est le cas de base de ce
    // fichier — les cas `planned` sont plus bas et le posent explicitement.
    plannedToday: [],
    dayToken: "tue",
    localHour: 14,
    eatingOut: [{ day: "tue", slots: ["lunch"] }],
    rhythmRaw: null,
    askedSlotsToday: [],
    ...over,
  });
}

// ---------------------------------------------------------------------------
// LE JETON — R6
// ---------------------------------------------------------------------------

Deno.test("⛔ LE CRÉNEAU EST DANS LE JETON, ET IL EN RESSORT INTACT", () => {
  // R6 en une épreuve. L'inférence de FF-018 §11 range au dernier créneau
  // écoulé: sur une question qui NOMME le midi, elle tomberait juste par
  // accident, et faux dès que la personne répond le soir.
  const id = slotMealButtonId({
    action: "describe",
    localDate: TUESDAY,
    slot: "lunch",
  });
  assertEquals(id, "KEEL_SLOTMEAL_describe|2026-03-10|lunch");
  assertEquals(parseSlotMealButton(id), {
    action: "describe",
    localDate: TUESDAY,
    slot: "lunch",
    plan: null,
  });
  assert(id.startsWith(SLOT_MEAL_BUTTON_PREFIX));
});

Deno.test("le lecteur rend `null` sur tout ce qui n'est pas à lui", () => {
  // Le contrat de TOUS les lecteurs déterministes: chacun rend « rien » sur ce
  // qui ne le concerne pas, et c'est ce qui rend l'ordre de lecture sans
  // conséquence.
  for (
    const foreign of [
      "KEEL_PULSE_HARD",
      "KEEL_WEEKLY_2026-03-08",
      "KEEL_WEIGHIN_2026-03-10",
      "KEEL_SLOTMEAL_describe|2026-03-10", // sans créneau
      "KEEL_SLOTMEAL_eat|2026-03-10|lunch", // action inconnue
      "KEEL_SLOTMEAL_describe|10/03/2026|lunch",
      "KEEL_SLOTMEAL_describe|2026-03-10|brunch", // créneau hors vocabulaire
      "",
      null,
    ]
  ) {
    assertEquals(parseSlotMealButton(foreign), null, String(foreign));
  }
});

Deno.test("un jeton ne se fabrique pas sur une entrée illisible", () => {
  assertThrows(() =>
    slotMealButtonId({ action: "skip", localDate: "hier", slot: "lunch" })
  );
  assertThrows(() =>
    slotMealButtonId({
      action: "skip",
      localDate: TUESDAY,
      slot: "brunch" as never,
    })
  );
});

// ---------------------------------------------------------------------------
// R4 — L'OBJECTIF
// ---------------------------------------------------------------------------

Deno.test("⛔ `maintenance` N'OUVRE RIEN, ET CE N'EST PAS UN OUBLI", () => {
  // Sur un maintien, le trou du midi ne change AUCUN chiffre qui pilote quoi
  // que ce soit. T1: on ne collecte que ce qu'un aval consomme.
  assertEquals(
    base({ goal: "maintenance" }),
    { ask: false, reason: "goal_not_covered" },
  );
  assert(base({ goal: "fat_loss" }).ask);
  assert(base({ goal: "muscle_gain" }).ask);
  // Et la liste est explicite: un quatrième objectif ne s'y invite pas.
  assertEquals(
    GOAL_TOKENS.filter((g) => SLOT_MEAL_GOALS.has(g)).sort(),
    ["fat_loss", "muscle_gain"],
  );
});

Deno.test("un objectif illisible se comporte comme PAS d'objectif", () => {
  assertEquals(base({ goal: null }), { ask: false, reason: "no_goal" });
});

Deno.test("le mute coupe ce canal comme les cinq autres", () => {
  assertEquals(base({ muted: true }), { ask: false, reason: "muted" });
});

// ---------------------------------------------------------------------------
// R5 — LE DÉCLENCHEUR
// ---------------------------------------------------------------------------

Deno.test("⛔ `away` NE DÉCLENCHE RIEN — la différence avec `eating_out`", () => {
  // LE CAS QUI SÉPARE CE CANAL D'UN PING DE VACANCES. Le lecteur ne garde que
  // les entrées marquées `eating_out`; une semaine de congés (`away`, ou une
  // entrée sans `kind`) ne produit AUCUNE case.
  assertEquals(
    eatingOutCellsFrom({
      away_days: [
        { day: "tue", slots: ["lunch"], kind: "away" },
        { day: "wed", slots: ["dinner"] }, // sans `kind` ⇒ away
      ],
    }),
    [],
  );
  assertEquals(
    eatingOutCellsFrom({
      away_days: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    }),
    [{ day: "tue", slots: ["lunch"] }],
  );
});

Deno.test("une case « dehors » SANS moments ne déclenche rien", () => {
  // `parseAwayDays` lit une entrée sans `slots` comme « toute la journée ». Ici
  // ça n'a pas de sens: on ne pose pas six questions pour une journée entière
  // passée dehors. Sans moments nommés, la case est ignorée.
  assertEquals(
    eatingOutCellsFrom({ away_days: [{ day: "tue", kind: "eating_out" }] }),
    [],
  );
  assertEquals(
    eatingOutCellsFrom({ away_days: [{ day: "tue", slots: [], kind: "eating_out" }] }),
    [],
  );
});

Deno.test("un autre jour que le jour courant ne déclenche rien", () => {
  assertEquals(
    base({ eatingOut: [{ day: "wed", slots: ["lunch"] }] }),
    { ask: false, reason: "nothing_to_ask" },
  );
});

// ---------------------------------------------------------------------------
// L'HEURE
// ---------------------------------------------------------------------------

Deno.test("avant l'heure du créneau, on n'a rien à demander", () => {
  assertEquals(base({ localHour: 13 }), { ask: false, reason: "not_elapsed" });
});

Deno.test("la fenêtre de rattrapage dure deux heures, puis la question meurt", () => {
  assert(base({ localHour: 14 }).ask, "14h: l'heure du déjeuner");
  assert(base({ localHour: 15 }).ask, "15h: rattrapage d'un tick perdu");
  assertEquals(
    base({ localHour: 14 + SLOT_MEAL_GRACE_HOURS }),
    { ask: false, reason: "too_late" },
    "16h: assez tard pour que la réponse soit une reconstitution, pas un souvenir",
  );
});

Deno.test("⛔ L'HEURE DÉCLARÉE L'EMPORTE SUR LE REPLI", () => {
  // Quelqu'un qui a dit déjeuner à 15h n'a pas « raté » son déjeuner à 14h.
  const rhythm = [{ slot: "lunch", at: "15:00" }];
  assertEquals(
    base({ localHour: 14, rhythmRaw: rhythm }),
    { ask: false, reason: "not_elapsed" },
  );
  const ok = base({ localHour: 15, rhythmRaw: rhythm });
  assert(ok.ask);
  if (!ok.ask) return;
  assertEquals(ok.elapsedAtHour, 15);
});

Deno.test("les trois moments SANS heure de référence ne sont jamais demandés", () => {
  // `snack_am`, `snack_pm` et `before_bed` valent `null` dans
  // `SLOT_PASSED_HOUR`: ce dépôt n'a pas d'heure pour eux, et en inventer une
  // ferait tomber une question sur un moment que rien ne date.
  for (const slot of ["snack_am", "snack_pm", "before_bed"]) {
    for (const hour of [8, 11, 14, 17, 20, 23]) {
      assertEquals(
        base({ eatingOut: [{ day: "tue", slots: [slot] }], localHour: hour }).ask,
        false,
        `${slot} à ${hour}h`,
      );
    }
  }
  // …sauf si la personne a DÉCLARÉ une heure pour ce moment-là.
  const v = base({
    eatingOut: [{ day: "tue", slots: ["snack_pm"] }],
    localHour: 17,
    rhythmRaw: [{ slot: "snack_pm", at: "17:00" }],
  });
  assert(v.ask, "un goûter à heure déclarée SE demande");
});

Deno.test("deux créneaux éligibles: le plus RÉCENT gagne, l'autre est perdu", () => {
  // Une question sur le petit-déjeuner posée à 14h arrive après celle du
  // déjeuner et parle d'un repas déjà reconstruit. On ne pose jamais deux
  // questions dans le même tick — R2 appliqué à l'intérieur d'un canal.
  const v = base({
    eatingOut: [{ day: "tue", slots: ["breakfast", "lunch"] }],
    localHour: 14,
    rhythmRaw: [{ slot: "breakfast", at: "13:00" }],
  });
  assert(v.ask);
  if (!v.ask) return;
  assertEquals(v.slot, "lunch");
});

// ---------------------------------------------------------------------------
// R3 — SANS PLAFOND, MAIS PAS SANS IDEMPOTENCE
// ---------------------------------------------------------------------------

Deno.test("⛔ UN CRÉNEAU DÉJÀ DEMANDÉ AUJOURD'HUI NE SE REDEMANDE PAS", () => {
  // Le balayage est HORAIRE et la fenêtre de rattrapage dure deux heures: sans
  // cette garde, un déjeuner produirait deux bulles. « Sans plafond » (R3) dit
  // que cinq déjeuners font cinq questions — pas qu'un déjeuner en fait deux.
  assertEquals(
    base({ askedSlotsToday: ["lunch"] }),
    { ask: false, reason: "already_asked" },
  );
  // Un AUTRE créneau reste demandable le même jour: c'est ça, « sans plafond ».
  const v = base({
    eatingOut: [{ day: "tue", slots: ["lunch", "dinner"] }],
    localHour: 21,
    askedSlotsToday: ["lunch"],
  });
  assert(v.ask);
  if (!v.ask) return;
  assertEquals(v.slot, "dinner");
});

// ---------------------------------------------------------------------------
// LES MOTS
// ---------------------------------------------------------------------------

Deno.test("la question porte QUATRE options, et chacune nomme son créneau", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    const m = renderSlotMealAsk({
      locale,
      localDate: TUESDAY,
      slot: "lunch",
      origin: "uncovered",
      eatingOut: true,
    });
    // ⟳ QUATRE, ET PAS `SLOT_MEAL_ACTIONS.length`. Le vocabulaire porte six
    // actions depuis que la forme COMPOSÉE existe (`ate`, `notplanned`), et
    // aucune question ne les offre toutes: lier le compte à la taille du
    // vocabulaire ferait rougir ce test à chaque action ajoutée à l'AUTRE
    // forme. C'est le nombre de boutons de CETTE question-ci.
    assertEquals(m.buttons.length, 4);
    const actions = m.buttons.map((b) => parseSlotMealButton(b.payload)?.action);
    assertEquals(actions, ["photo", "describe", "skip", "mute"]);
    for (const b of m.buttons) {
      const tap = parseSlotMealButton(b.payload);
      assertEquals(tap?.slot, "lunch", `${locale}: ${b.payload}`);
      assertEquals(tap?.localDate, TUESDAY);
      assert(b.label.trim() !== "");
    }
    assert(m.body.trim() !== "");
    // ⚠️ AUCUN CHIFFRE dans la question. Le plan ne compose rien à ce moment-là:
    // il n'y a donc aucune consigne à laquelle cette assiette pourrait être
    // conforme, et aucun nombre à lui opposer.
    assertEquals(/\d/.test(m.body), false, m.body);
  }
});

Deno.test("⛔ « PASSER » N'ANNONCE AUCUN FAIT", () => {
  // Le circuit de la fiche est explicite: seule « Décrire » mène à
  // `protocol_events`. Un accusé qui dirait « c'est noté » sur « Passer »
  // rendrait indémentable un repas que personne n'a écrit.
  for (const locale of ["en-US", "fr-FR"]) {
    const skipped = renderSlotMealAck({ locale, action: "skip", written: false });
    const alsoSkipped = renderSlotMealAck({ locale, action: "skip", written: true });
    assertEquals(
      skipped,
      alsoSkipped,
      "`written` n'a rien à dire sur « Passer »: rien n'est jamais écrit",
    );
    assert(skipped.trim() !== "");
  }
});

Deno.test("« Décrire » dit « c'est noté » SEULEMENT quand ça l'est", () => {
  // Un accusé qui prétend est la faute que ce dépôt nomme `phantom_commit`, et
  // elle est indétectable par la personne.
  for (const locale of ["en-US", "fr-FR"]) {
    const written = renderSlotMealAck({ locale, action: "describe", written: true });
    const not = renderSlotMealAck({ locale, action: "describe", written: false });
    assert(
      written !== not,
      `${locale}: les deux phrases sont identiques — l'échec d'écriture est muet`,
    );
    assert(written.length > not.length, "l'affirmation est ce qui s'ajoute");
  }
});

// ---------------------------------------------------------------------------
// L'INTERRUPTEUR — TRI-ÉTAT, ET `null` N'EST PAS UNE EXTINCTION
// ---------------------------------------------------------------------------

Deno.test("l'interrupteur: `null` laisse décider l'objectif, jamais éteint", () => {
  // ⛔ C'EST LA MOITIÉ QUI SE CASSE EN SILENCE. Un appelant qui écrirait
  // `col === true` refermerait la question pour TOUS ceux que leur objectif
  // devait ouvrir — sans qu'aucun type ne bronche, et sans qu'un seul test
  // rougisse si celui-ci n'existait pas. C'est mot pour mot la cicatrice de
  // `energySwitchFrom`, transposée.
  assertEquals(
    slotMealAskSwitchFrom({ stored: null, goal: "fat_loss" }),
    { on: true, source: "goal" },
  );
  assertEquals(
    slotMealAskSwitchFrom({ stored: null, goal: "muscle_gain" }),
    { on: true, source: "goal" },
  );
  // R4 — le maintien ne reçoit PAS la boucle par repas, et le motif le dit.
  assertEquals(
    slotMealAskSwitchFrom({ stored: null, goal: "maintenance" }),
    { on: false, source: "goal" },
  );
  assertEquals(
    slotMealAskSwitchFrom({ stored: null, goal: null }),
    { on: false, source: "no_goal" },
  );
});

Deno.test("⛔ UNE EXTINCTION EXPLICITE GAGNE POUR TOUJOURS", () => {
  // Quelqu'un qui éteint puis change d'objectif ne se fait pas rallumer: une
  // extinction est un CHOIX, un objectif est une CIRCONSTANCE, et une
  // circonstance ne révoque pas un choix. Sans cette règle, passer de maintien
  // à perte rallumerait une question que la personne avait coupée — et elle
  // n'aurait aucune raison de faire le lien.
  for (const goal of GOAL_TOKENS) {
    assertEquals(
      slotMealAskSwitchFrom({ stored: false, goal }),
      { on: false, source: "explicit_off" },
      goal,
    );
  }
  // Et l'allumage explicite ouvre même là où l'objectif fermerait.
  assertEquals(
    slotMealAskSwitchFrom({ stored: true, goal: "maintenance" }),
    { on: true, source: "explicit_on" },
  );
});

Deno.test("les deux clés sont REQUISES — une garde optionnelle est désarmée", () => {
  assertThrows(
    () =>
      slotMealAskSwitchFrom(
        { goal: "fat_loss" } as unknown as Parameters<
          typeof slotMealAskSwitchFrom
        >[0],
      ),
    Error,
    "REQUIS",
  );
});

Deno.test("la décision NOMME l'extinction, et pas `muted`", () => {
  // ⚠️ DEUX MOTIFS DISTINCTS, ET C'EST LA SEULE MESURE QUI DIRA SI CETTE
  // BOUCLE COÛTE PLUS QU'ELLE NE RAPPORTE. `muted` = « il a coupé TOUT le
  // proactif »; `ask_muted` = « il n'a coupé QUE la question du repas ». Les
  // fondre rendrait les deux illisibles dans le compte-rendu du cron.
  assertEquals(
    base({ askEnabled: false }),
    { ask: false, reason: "ask_muted" },
  );
  assertEquals(
    base({ muted: true, askEnabled: false }),
    { ask: false, reason: "muted" },
  );
  // ⛔ ET `ask_muted` NE SORT JAMAIS POUR QUELQU'UN QUE L'OBJECTIF EXCLUT: il
  // dirait « il a éteint » d'une personne à qui on n'a jamais rien proposé.
  assertEquals(
    base({ goal: "maintenance", askEnabled: false }),
    { ask: false, reason: "goal_not_covered" },
  );
});

Deno.test("le bouton d'extinction est SOUS la question, et il est le dernier", () => {
  const m = renderSlotMealAsk({
    locale: "fr-FR",
    localDate: TUESDAY,
    slot: "lunch",
    origin: "uncovered",
    eatingOut: true,
  });
  const last = m.buttons[m.buttons.length - 1];
  assertEquals(parseSlotMealButton(last.payload)?.action, "mute");
  // ⛔ LE LIBELLÉ NE PROMET QUE CE QU'IL FAIT. « Arrêter le suivi » ferait
  // couper la mesure à quelqu'un qui voulait le silence, et il ne le saurait
  // pas. Il éteint une QUESTION.
  assertEquals(last.label, "Ne plus me demander à chaque repas");
  assertEquals(/suivi|tracking/i.test(last.label), false, last.label);
});

Deno.test("l'accusé d'extinction ne prétend pas quand rien n'est écrit", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    const ok = renderSlotMealAck({ locale, action: "mute", written: true });
    const ko = renderSlotMealAck({ locale, action: "mute", written: false });
    assert(ok !== ko, `${locale}: les deux accusés sont identiques`);
    // L'accusé qui a marché dit que les repas restent cochables — c'est la
    // moitié qui empêche de croire qu'on a coupé le suivi.
    assert(
      locale.startsWith("fr")
        ? ok.includes("cochables")
        : ok.includes("tickable"),
      ok,
    );
  }
});

// ---------------------------------------------------------------------------
// UN SEUL AXE — LE PLAN COUVRE-T-IL CE CRÉNEAU ?
// ---------------------------------------------------------------------------

const PLANNED_LUNCH = {
  slot: "lunch" as const,
  mealId: "11111111-2222-4333-8444-555555555555",
  dishIndexes: [1, 2],
  title: "Poulet, riz complet, brocolis",
};

Deno.test("CRÉNEAU COMPOSÉ — la question nomme le plat, et porte oui/non", () => {
  const v = base({
    eatingOut: [],
    plannedToday: [PLANNED_LUNCH],
    rhythmRaw: [{ slot: "lunch", at: "13:00" }],
  });
  assert(v.ask);
  if (!v.ask || v.origin !== "planned") return;
  assertEquals(v.origin, "planned");
  assertEquals(v.planned.title, PLANNED_LUNCH.title);

  const m = renderSlotMealAsk({
    locale: "fr-FR",
    localDate: TUESDAY,
    slot: "lunch",
    origin: "planned",
    planned: v.planned,
  });
  // ⛔ LE PLAT EST NOMMÉ. Un « Oui » qui coche trois lignes anonymes est une
  // signature en blanc.
  assert(m.body.includes(PLANNED_LUNCH.title), m.body);
  assertEquals(m.buttons.length, 3);
  const actions = m.buttons.map((b) => parseSlotMealButton(b.payload)?.action);
  assertEquals(actions, ["ate", "notplanned", "mute"]);

  // Les deux réponses portent DE QUOI on parle; l'extinction non — elle ne
  // coche rien.
  const [yes, no, mute] = m.buttons.map((b) => parseSlotMealButton(b.payload));
  assertEquals(yes?.plan, {
    mealId: PLANNED_LUNCH.mealId,
    dishIndexes: [1, 2],
  });
  assertEquals(no?.plan?.dishIndexes, [1, 2]);
  assertEquals(mute?.plan, null);
});

Deno.test("⟳ CRÉNEAU DÉCLARÉ MAIS NON COMPOSÉ — « tu as mangé quoi ? »", () => {
  // C'EST LE TROU PAR LEQUEL PASSAIENT LES REPAS QU'ON NE COMPTE JAMAIS.
  // Quelqu'un qui a déclaré déjeuner tous les jours et dont le plan ne compose
  // rien à midi n'était JAMAIS interrogé: ni le plan, ni la question, ni le
  // bilan ne savaient ce qu'il avait mangé.
  const v = base({
    eatingOut: [],
    plannedToday: [],
    rhythmRaw: [{ slot: "lunch", at: "13:00" }],
  });
  assert(v.ask);
  if (!v.ask || v.origin !== "uncovered") return;
  assertEquals(v.slot, "lunch");
  assertEquals(v.eatingOut, false);

  const m = renderSlotMealAsk({
    locale: "fr-FR",
    localDate: TUESDAY,
    slot: "lunch",
    origin: "uncovered",
    eatingOut: false,
  });
  assert(m.body.includes("Rien n'était prévu"), m.body);
  assertEquals(m.buttons.length, 4);
});

Deno.test("⛔ « DEHORS » L'EMPORTE SUR « COMPOSÉ »", () => {
  // La personne a DIT qu'elle mangeait dehors: le plat composé pour ce
  // moment-là est un reste de composition, pas une prévision. Lui demander
  // « tu as mangé ton poulet prévu ? » serait lui opposer une consigne qu'elle
  // a déjà annulée.
  const v = base({
    eatingOut: [{ day: "tue", slots: ["lunch"] }],
    plannedToday: [PLANNED_LUNCH],
    rhythmRaw: [{ slot: "lunch", at: "13:00" }],
  });
  assert(v.ask);
  if (!v.ask || v.origin !== "uncovered") return;
  assertEquals(v.eatingOut, true);
});

Deno.test("un créneau composé dont tout est COCHÉ ne se demande pas", () => {
  // Le lecteur retire les index déjà cochés; un créneau qui n'en garde aucun
  // n'entre pas dans la décision. R2 — une question déjà répondue ne se repose
  // pas, et c'est la garde qui remplace l'ancienne collision avec la bande du
  // soir (désarmée depuis le 2026-09-07).
  const v = base({
    eatingOut: [],
    plannedToday: [{ ...PLANNED_LUNCH, dishIndexes: [] }],
    rhythmRaw: null,
  });
  assertEquals(v, { ask: false, reason: "nothing_to_ask" });
});

Deno.test("le jeton de plan est OBLIGATOIRE par action, dans les deux sens", () => {
  const plan = { mealId: PLANNED_LUNCH.mealId, dishIndexes: [1, 2] };
  // ⛔ `ate`/`notplanned` SANS segment de plan: refusé à la lecture ET à
  // l'écriture. Une charge qui ne dit pas de quels plats elle parle ne peut
  // rien cocher.
  assertEquals(
    parseSlotMealButton(`KEEL_SLOTMEAL_ate|${TUESDAY}|lunch`),
    null,
  );
  assertThrows(() =>
    slotMealButtonId({ action: "ate", localDate: TUESDAY, slot: "lunch" })
  );
  // ⛔ Et les quatre autres AVEC un segment: refusé aussi. Une charge qui le
  // porte là où ça n'a pas de sens est une charge forgée.
  assertEquals(
    parseSlotMealButton(
      `KEEL_SLOTMEAL_skip|${TUESDAY}|lunch|${plan.mealId}@1,2`,
    ),
    null,
  );
  assertThrows(() =>
    slotMealButtonId({ action: "skip", localDate: TUESDAY, slot: "lunch", plan })
  );
  // Un index dupliqué cocherait deux fois la même ligne; un tableau vide ne
  // désignerait rien.
  assertEquals(
    parseSlotMealButton(`KEEL_SLOTMEAL_ate|${TUESDAY}|lunch|${plan.mealId}@1,1`),
    null,
  );
});

Deno.test("⛔ « NON » N'A PAS D'ACCUSÉ — il enchaîne, et la fonction le dit", () => {
  // Rendre une phrase close arrêterait la conversation juste avant ce qu'on
  // cherche à savoir. Et cette fonction ne reçoit pas le créneau: le premier
  // jet de ce lot a effectivement codé « lunch » en dur.
  assertThrows(
    () => renderSlotMealAck({ locale: "fr-FR", action: "notplanned", written: true }),
    Error,
    "enchaîne",
  );
});
