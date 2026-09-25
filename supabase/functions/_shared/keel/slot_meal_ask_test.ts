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

/**
 * FF-062 C1 — LE REPAS D'UN CRÉNEAU DÉCLARÉ QUE LE PLAN NE COMPOSE PAS.
 *
 * ══ CE QUE CES ÉPREUVES TIENNENT ═════════════════════════════════════════
 *
 * · le déclencheur est un moment DÉCLARÉ dans le rythme que le plan ne compose
 *   pas (les absences sont retirées en amont, par le journal);
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
    localHour: 14,
    // Un déjeuner déclaré, sans heure: le repli de 14h s'applique.
    rhythmRaw: [{ slot: "lunch" }],
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
        base({ rhythmRaw: [{ slot }], localHour: hour }).ask,
        false,
        `${slot} à ${hour}h`,
      );
    }
  }
  // …sauf si la personne a DÉCLARÉ une heure pour ce moment-là.
  const v = base({
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
    localHour: 14,
    rhythmRaw: [{ slot: "breakfast", at: "13:00" }, { slot: "lunch" }],
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
    rhythmRaw: [{ slot: "lunch" }, { slot: "dinner" }],
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

Deno.test("la question porte TROIS options, et chacune nomme son créneau", () => {
  for (const locale of ["en-US", "fr-FR"]) {
    const m = renderSlotMealAsk({
      locale,
      localDate: TUESDAY,
      slot: "lunch",
      origin: "uncovered",
    });
    // ⟳ TROIS, ET PAS `SLOT_MEAL_ACTIONS.length`: le vocabulaire garde `mute`
    // et la forme composée pour relire les bulles déjà envoyées, et aucune
    // question neuve ne les offre. C'est le nombre de boutons de CETTE
    // question-ci.
    assertEquals(m.buttons.length, 3);
    const actions = m.buttons.map((b) => parseSlotMealButton(b.payload)?.action);
    assertEquals(actions, ["photo", "describe", "skip"]);
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

Deno.test("⟳ 2026-09-24 — AUCUNE question n'offre l'extinction, sous aucune forme", () => {
  // Décision du propriétaire: le bouton promettait « à chaque repas » alors que
  // la question ne part que sur un moment non prévu, il coupait aussi la
  // question du soir, et le rallumer demande d'aller dans « Notifications ».
  for (const locale of ["en-US", "fr-FR"]) {
    const forms = [
      renderSlotMealAsk({ locale, localDate: TUESDAY, slot: "lunch", origin: "uncovered" }),
      renderSlotMealAsk({
        locale,
        localDate: TUESDAY,
        slot: "lunch",
        origin: "planned",
        planned: PLANNED_LUNCH,
      }),
    ];
    for (const m of forms) {
      const actions = m.buttons.map((b) => parseSlotMealButton(b.payload)?.action);
      assertEquals(actions.includes("mute"), false, `${locale}: ${actions}`);
    }
  }
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

Deno.test("⟳ 2026-09-23 — CRÉNEAU COMPOSÉ: plus de question par repas, la question du soir le couvre", () => {
  const v = base({
    plannedToday: [PLANNED_LUNCH],
    rhythmRaw: [{ slot: "lunch", at: "13:00" }],
  });
  // ⛔ ET PAS « Rien n'était prévu »: le créneau reste marqué par le plan, il
  // n'est simplement plus demandé ici.
  assertEquals(v, { ask: false, reason: "planned_in_evening" });
});

Deno.test("une question par repas DÉJÀ ENVOYÉE garde ses boutons oui/non lisibles", () => {
  // Plus aucune n'est émise depuis le 2026-09-23, mais des bulles en portent
  // encore dans l'historique: leur tap doit toujours se lire.
  const m = renderSlotMealAsk({
    locale: "fr-FR",
    localDate: TUESDAY,
    slot: "lunch",
    origin: "planned",
    planned: PLANNED_LUNCH,
  });
  // ⛔ LE PLAT EST NOMMÉ. Un « Oui » qui coche trois lignes anonymes est une
  // signature en blanc.
  assert(m.body.includes(PLANNED_LUNCH.title), m.body);
  assertEquals(m.buttons.length, 2);
  const actions = m.buttons.map((b) => parseSlotMealButton(b.payload)?.action);
  assertEquals(actions, ["ate", "notplanned"]);

  // Les deux réponses portent DE QUOI on parle.
  const [yes, no] = m.buttons.map((b) => parseSlotMealButton(b.payload));
  assertEquals(yes?.plan, {
    mealId: PLANNED_LUNCH.mealId,
    dishIndexes: [1, 2],
  });
  assertEquals(no?.plan?.dishIndexes, [1, 2]);
});

Deno.test("⟳ CRÉNEAU DÉCLARÉ MAIS NON COMPOSÉ — « tu as mangé quoi ? »", () => {
  // C'EST LE TROU PAR LEQUEL PASSAIENT LES REPAS QU'ON NE COMPTE JAMAIS.
  // Quelqu'un qui a déclaré déjeuner tous les jours et dont le plan ne compose
  // rien à midi n'était JAMAIS interrogé: ni le plan, ni la question, ni le
  // bilan ne savaient ce qu'il avait mangé.
  const v = base({
    plannedToday: [],
    rhythmRaw: [{ slot: "lunch", at: "13:00" }],
  });
  assert(v.ask);
  if (!v.ask || v.origin !== "uncovered") return;
  assertEquals(v.slot, "lunch");

  const m = renderSlotMealAsk({
    locale: "fr-FR",
    localDate: TUESDAY,
    slot: "lunch",
    origin: "uncovered",
  });
  assert(m.body.includes("Rien n'était prévu"), m.body);
  assertEquals(m.buttons.length, 3);
});

Deno.test("un créneau composé dont tout est COCHÉ ne se demande pas", () => {
  // Le lecteur retire les index déjà cochés; un créneau qui n'en garde aucun
  // n'entre pas dans la décision. R2 — une question déjà répondue ne se repose
  // pas, et c'est la garde qui remplace l'ancienne collision avec la bande du
  // soir (désarmée depuis le 2026-09-07).
  const v = base({
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
