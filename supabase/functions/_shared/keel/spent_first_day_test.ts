import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  planTimingOf,
  withoutSpentFirstDay,
} from "./meal_plan_window.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS JOURS DEMANDÉS À 20 H FONT UN PLAN DE DEUX JOURS — 2026-09-04
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La décision, mot pour mot: « si la personne demande lundi mardi mercredi
 * alors qu'on est lundi 20h, alors il faut juste que le plan soit pour mardi et
 * mercredi. Et oui il peut y avoir un warning si besoin ».
 *
 * ⛔ ON GARDE LA FIN. La formule inverse — « trois demandés = trois nourris »,
 * qui irait chercher un jeudi — a été explicitement écartée. Le premier test de
 * ce fichier est donc celui de la DATE DE FIN, parce que c'est la propriété que
 * la décision porte et la seule qu'un futur lecteur pourrait « améliorer » à
 * l'envers sans s'en apercevoir.
 */

import { slotsUnservableToday } from "./plan_hours.ts";

const LUNDI = "2026-09-07";
const MARDI = "2026-09-08";
const MERCREDI = "2026-09-09";
const TROIS_REPAS = ["breakfast", "lunch", "dinner"] as const;

Deno.test("la FIN ne bouge pas — c'est la décision, pas un effet de bord", () => {
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: TROIS_REPAS,
    passedSlots: TROIS_REPAS,
    // ⟳ 2026-09-04 · le monde d'AVANT le délai de courses: rien n'est
    // retenu, la coupure n'est pas atteinte. Ces cas éprouvent la règle
    // des moments PASSÉS, et elle n'a pas bougé.
    heldSlots: [],
    shoppingCutoffReached: false,
  });
  assertEquals(out.startsOn, MARDI);
  assertEquals(out.durationDays, 2);
  assertEquals(out.dropped, "mon");
  assertEquals(out.refused, null);
  // ⛔ LA PROPRIÉTÉ CENTRALE, ÉCRITE COMME UNE ÉGALITÉ: début + durée est
  // invariant. Un lot qui « compenserait » en allongeant la fenêtre ferait
  // mercredi + 1 = jeudi, et ce test le dirait.
  const finAvant = new Date(LUNDI).getTime() + 3 * 86400000;
  const finApres = new Date(out.startsOn).getTime() + out.durationDays * 86400000;
  assertEquals(finApres, finAvant);
  assertEquals(new Date(finApres - 86400000).toISOString().slice(0, 10), MERCREDI);
});

Deno.test("⛔ LE PIÈGE: la veille de cuisine n'est JAMAIS mangée par le retrait", () => {
  // `withCookDayBefore` recule `startsOn`: quelqu'un qui a demandé la veille se
  // retrouve avec `startsOn === today` ET `cookOnlyDay === today`. Aujourd'hui
  // on ne mange pas, on cuisine — donc « tous les moments sont passés » est
  // trivialement vrai, et sans cette garde le lot mangerait la veille que la
  // personne vient de demander.
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 4 }, {
    today: LUNDI,
    cookOnlyDay: "mon",
    declaredSlots: TROIS_REPAS,
    passedSlots: TROIS_REPAS,
    // ⟳ 2026-09-04 · le monde d'AVANT le délai de courses: rien n'est
    // retenu, la coupure n'est pas atteinte. Ces cas éprouvent la règle
    // des moments PASSÉS, et elle n'a pas bougé.
    heldSlots: [],
    shoppingCutoffReached: false,
  });
  assertEquals(out.refused, "cook_day");
  assertEquals(out.startsOn, LUNDI);
  assertEquals(out.durationDays, 4);
  assertEquals(out.dropped, null);
});

Deno.test("un seul moment à venir suffit à tout garder", () => {
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: TROIS_REPAS,
    passedSlots: ["breakfast", "lunch"],
    // ⟳ 2026-09-04 · le monde d'AVANT le délai de courses: rien n'est
    // retenu, la coupure n'est pas atteinte. Ces cas éprouvent la règle
    // des moments PASSÉS, et elle n'a pas bougé.
    heldSlots: [],
    shoppingCutoffReached: false,
  });
  assertEquals(out.refused, "slots_remain");
  assertEquals(out.startsOn, LUNDI);
  assertEquals(out.durationDays, 3);
});

Deno.test("une fenêtre d'UN jour ne se rétrécit pas — elle deviendrait vide", () => {
  // Générer zéro jour est pire que générer un plan court: on sert la fenêtre
  // demandée et le motif dit pourquoi elle est déjà entamée.
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 1 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: TROIS_REPAS,
    passedSlots: TROIS_REPAS,
    // ⟳ 2026-09-04 · le monde d'AVANT le délai de courses: rien n'est
    // retenu, la coupure n'est pas atteinte. Ces cas éprouvent la règle
    // des moments PASSÉS, et elle n'a pas bougé.
    heldSlots: [],
    shoppingCutoffReached: false,
  });
  assertEquals(out.refused, "single_day");
  assertEquals(out.durationDays, 1);
  assertEquals(out.dropped, null);
});

Deno.test("une fenêtre qui commence demain n'a rien à retirer", () => {
  const out = withoutSpentFirstDay({ startsOn: MARDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: TROIS_REPAS,
    passedSlots: TROIS_REPAS,
    // ⟳ 2026-09-04 · le monde d'AVANT le délai de courses: rien n'est
    // retenu, la coupure n'est pas atteinte. Ces cas éprouvent la règle
    // des moments PASSÉS, et elle n'a pas bougé.
    heldSlots: [],
    shoppingCutoffReached: false,
  });
  assertEquals(out.refused, "not_today");
  assertEquals(out.startsOn, MARDI);
});

Deno.test("un rythme illisible ne retire RIEN — fail-closed", () => {
  // Aucun moment déclaré ⇒ on ne sait pas dire que la journée est finie. Le
  // comportement d'avant ce lot, exactement: on ne rétrécit pas sur une
  // ignorance.
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: [],
    passedSlots: [],
    // ⟳ 2026-09-04 · le monde d'AVANT le délai de courses: rien n'est
    // retenu, la coupure n'est pas atteinte. Ces cas éprouvent la règle
    // des moments PASSÉS, et elle n'a pas bougé.
    heldSlots: [],
    shoppingCutoffReached: false,
  });
  assertEquals(out.refused, "slots_remain");
  assertEquals(out.durationDays, 3);
});

Deno.test("le module est PUR: l'entrée ressort intacte", () => {
  const window = { startsOn: LUNDI, durationDays: 3 };
  const declared = [...TROIS_REPAS];
  const passed = [...TROIS_REPAS];
  withoutSpentFirstDay(window, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: declared,
    passedSlots: passed,
    // ⟳ 2026-09-04 · le monde d'AVANT le délai de courses: rien n'est
    // retenu, la coupure n'est pas atteinte. Ces cas éprouvent la règle
    // des moments PASSÉS, et elle n'a pas bougé.
    heldSlots: [],
    shoppingCutoffReached: false,
  });
  assertEquals(window, { startsOn: LUNDI, durationDays: 3 });
  assertEquals(declared, [...TROIS_REPAS]);
  assertEquals(passed, [...TROIS_REPAS]);
});

// ---------------------------------------------------------------------------
// CE QUE LA PERSONNE LIT
// ---------------------------------------------------------------------------

Deno.test("le retrait DIT son motif, et il ne se confond avec aucun autre", () => {
  const timing = planTimingOf(
    { leadDay: null, reason: "after_cutoff" },
    { cookOnlyDay: null, startsOn: MARDI, refused: null },
    { dropped: "mon" },
  );
  assertEquals(timing, {
    kind: "starts_tomorrow",
    reason: "today_already_spent",
    lead_day: null,
  });
  // ⛔ ET SURTOUT PAS `same_morning`. « Courses et cuisson dès le matin » sur un
  // plan qui commence DEMAIN est un fait faux, et il est indémentable pour qui
  // le lit — c'est l'avertissement que le parseur du front porte déjà.
  assert(timing.kind !== "same_morning");
});

Deno.test("la veille l'emporte sur le retrait — les deux ne se croisent jamais", () => {
  // Ceinture: `withoutSpentFirstDay` refuse déjà `cook_day` quand une veille
  // existe, donc `dropped` ne peut pas être renseigné ici. Ce cas fige l'ORDRE
  // pour que personne ne l'inverse en croyant simplifier.
  const timing = planTimingOf(
    { leadDay: LUNDI, reason: "before_cutoff_today" },
    { cookOnlyDay: "mon", startsOn: LUNDI, refused: null },
    { dropped: "mon" },
  );
  assertEquals(timing.kind, "day_before");
});

Deno.test("sans retrait, le timing d'avant ce lot ne bouge pas", () => {
  const timing = planTimingOf(
    { leadDay: null, reason: "after_cutoff" },
    { cookOnlyDay: null, startsOn: LUNDI, refused: null },
    { dropped: null },
  );
  assertEquals(timing, {
    kind: "same_morning",
    reason: "after_cutoff",
    lead_day: null,
  });
});

// ---------------------------------------------------------------------------
// LE CÂBLAGE — parce qu'aucun test n'exécute la lane
// ---------------------------------------------------------------------------

/**
 * ⛔ CE FICHIER FERME LA MUTATION QUI, SANS LUI, NE ROUGIT NULLE PART.
 * `generate-meal-v1/index.ts` appelle `Deno.serve` au chargement: on ne peut
 * pas l'importer, donc rien n'exécute son câblage. Débrancher le retrait —
 * repasser `{ dropped: null }` à `planTimingOf`, ou dériver `daysToFill` AVANT
 * le retrait — laisserait `deno check` et toute la suite vertes, et la seule
 * chose qui changerait serait ce que la personne lit.
 *
 * ⚠️ ON ASSERTE DES ABSENCES ET DES ORDRES, PAS DES LIGNES. Épingler le texte
 * exact d'un appel photographie le code: ça rougit au premier argument ajouté
 * (c'est arrivé à `cook_the_day_before_test.ts` le jour même) et ça reste vert
 * si quelqu'un ajoute un cinquième lecteur mal câblé.
 */
const LANES: readonly [string, string][] = [
  // ⟳ 2026-09-04 — LA LANE FOYER EST ENTRÉE. Elle passait `{ dropped: null }`
  // en dur, ce que le commentaire d'alors appelait « un aveu ». L'aveu est levé;
  // les mêmes gardes de câblage la tiennent maintenant, et si quelqu'un la
  // débranche c'est cette liste qui le dira.
  ["foyer", "../../generate-household-meal-v1/index.ts"],
];

async function laneSource(rel: string): Promise<string> {
  // SANS SES COMMENTAIRES: ces fichiers RACONTENT le défaut qu'ils ferment en
  // nommant `dropped` et `planTimingOf` dans des pavés entiers. Un grep naïf y
  // verrait le câblage qu'il cherche et resterait vert le jour où il part.
  const src = await Deno.readTextFile(new URL(rel, import.meta.url));
  return src
    .split("\n")
    .map((l) => (l.trimStart().startsWith("//") ? "" : l))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

for (const [nom, rel] of LANES) {
  Deno.test(`câblage ${nom} — la lane passe son RETRAIT au timing, pas un zéro`, async () => {
    const code = await laneSource(rel);
    const appels = [...code.matchAll(/planTimingOf\(([^;]*?)\)/gs)];
    assertEquals(appels.length, 1, `un seul appel attendu dans la lane ${nom}`);
    const args = appels[0][1];
    assert(
      args.includes("spentFirstDay"),
      `planTimingOf ne reçoit pas le retrait: ${args.trim()}`,
    );
    assert(
      !/\{\s*dropped:\s*null\s*\}/.test(args),
      `la lane ${nom} passe un retrait en dur — c'est le débranchement`,
    );
  });

  Deno.test(`câblage ${nom} — \`daysToFill\` se dérive APRÈS le retrait`, async () => {
    const code = await laneSource(rel);
    const retrait = code.indexOf("withoutSpentFirstDay({");
    // ⚠️ LES DEUX LANES N'ÉCRIVENT PAS LA MÊME LIGNE: la solo annote
    // `: string[]`, la foyer non. Chercher une ligne littérale ferait rougir ce
    // test sur une annotation de type, ce qui n'est pas ce qu'il vérifie.
    const derivation = code.search(/daysToFill(: string\[\])? = windowDayOrder\(/);
    assert(retrait > 0, `\`withoutSpentFirstDay\` n'est plus appelé dans ${nom}`);
    assert(derivation > 0, "`daysToFill` ne se dérive plus de `windowDayOrder`");
    // ⛔ L'ORDRE EST LE CÂBLAGE. Dérivé avant, `daysToFill` porterait la fenêtre
    // DEMANDÉE pendant que le verdict compterait la fenêtre RETENUE: deux
    // vérités dans le même plan, et c'est le défaut qu'on ferme.
    assert(
      derivation > retrait,
      `${nom}: \`daysToFill\` est dérivé AVANT le retrait — la fenêtre annoncée et la servie divergent`,
    );
  });

  Deno.test(`câblage ${nom} — une seule lecture de l'heure pour deux questions`, async () => {
    const code = await laneSource(rel);
    // ⟳ 2026-09-04 · LA LECTURE EST PASSÉE PAR `slotsUnservableToday`, qui
    // APPELLE `slotsPassedToday` au lieu de le recopier. La garde change donc
    // de nom, pas de sens: c'est toujours « une seule lecture de l'heure ».
    const lectures = [...code.matchAll(/slotsUnservableToday\(\{/g)];
    assertEquals(lectures.length, 1, `l'heure doit être lue UNE fois dans ${nom}`);
    // ⛔ ET LA LANE N'APPELLE PLUS `slotsPassedToday` DIRECTEMENT. Un second
    // appel rendrait deux « moments passés » qui pourraient diverger, et c'est
    // celui qu'on regarde le moins qui garderait l'ancien état.
    assertEquals(
      [...code.matchAll(/slotsPassedToday\(\{/g)].length,
      0,
      `${nom}: la lane doit passer par slotsUnservableToday`,
    );
    // ⚠️ L'UNION VA AU PROMPT, les deux listes séparées vont à la PHRASE.
    assert(code.includes("...unservableToday.passed"), `${nom}: union manquante`);
    assert(
      code.includes("...unservableToday.heldForShopping"),
      `${nom}: la seconde cause doit entrer dans l'union servie au prompt`,
    );
    assert(
      code.includes("startsOn === todayDate\n      ? unservableToday.passed") ||
        code.includes("startsOn === todayDate ? unservableToday.passed"),
      `${nom}: la phrase doit lire la liste PASSÉE, pas l'union`,
    );
  });

  Deno.test(`câblage ${nom} — les deux refus qui comptent laissent une trace`, async () => {
    const code = await laneSource(rel);
    // ⛔ SANS TRACE, UN LOT DÉSARMÉ RESSEMBLE À UN LOT QUI MARCHE: quand le
    // retrait ne mord pas, aucune sortie ne dit quel module a été chargé.
    assert(code.includes("spent_first_day_kept:"), `${nom}: aucun refus tracé`);
    assert(code.includes('spentFirstDay.refused === "cook_day"'));
    assert(code.includes('spentFirstDay.refused === "single_day"'));
    // ⚠️ ET LES DEUX CAS ORDINAIRES RESTENT MUETS.
    assert(
      !code.includes('spentFirstDay.refused === "slots_remain"') &&
        !code.includes('spentFirstDay.refused === "not_today"'),
      `${nom}: un refus ordinaire est journalisé — du bruit sur chaque plan`,
    );
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-04 · LE DÉLAI DE COURSES — la seconde raison de ne pas servir
//
// ── CE QUI ÉTAIT MESURÉ AVANT LE LOT, en rejouant les fonctions pures ─────
//     12 h  le déjeuner est SERVI  (il ne « passe » qu'à 14 h)
//     16 h  le goûter est SERVI    (les goûters ne tombent jamais par l'horloge)
//     19 h  le dîner est SERVI     ⛔ alors que la coupure des courses est à 18 h
//
// ⛔ ET LA CONTRE-ÉPREUVE EST LA MOITIÉ QUI COMPTE: une règle qui retiendrait
// TOUT ne serait plus une règle. Chaque heure qui retient est suivie ici d'une
// heure qui sert.
// ═══════════════════════════════════════════════════════════════════════════

const RYTHME_4 = [
  { slot: "breakfast" as const },
  { slot: "lunch" as const },
  { slot: "snack_pm" as const },
  { slot: "dinner" as const },
];

Deno.test("⛔ DÉLAI · à midi, le déjeuner tombe et le dîner reste", () => {
  const o = slotsUnservableToday({ hourNow: 12, rhythm: RYTHME_4, declaredHours: [] });
  assertEquals(o.heldForShopping, ["lunch"]);
  // Le petit-déjeuner est PASSÉ, pas retenu: deux causes, deux listes.
  assertEquals(o.passed, ["breakfast"]);
  // ⛔ LA CONTRE-ÉPREUVE: le dîner de 19 h est encore devant, il reste au plan.
  assertEquals(o.heldForShopping.includes("dinner"), false);
});

Deno.test("⛔ DÉLAI · à 16 h le goûter tombe — il n'a AUCUNE heure de bascule", () => {
  // `SLOT_PASSED_HOUR.snack_pm` vaut `null`: par l'horloge, un goûter ne tombe
  // jamais. C'est la seule règle qui peut le retirer.
  const o = slotsUnservableToday({ hourNow: 16, rhythm: RYTHME_4, declaredHours: [] });
  assertEquals(o.heldForShopping, ["snack_pm"]);
  assertEquals(o.passed.includes("snack_pm"), false);
});

Deno.test("⛔ DÉLAI · à 17 h un dîner de 19 h EST SERVI — la borne est inclusive", () => {
  // 17 + 2 = 19. On ne retire pas un repas qu'on a exactement le temps de
  // préparer: une garde qui mord à la borne mord un jour de trop.
  const o = slotsUnservableToday({ hourNow: 17, rhythm: RYTHME_4, declaredHours: [] });
  assertEquals(o.heldForShopping.includes("dinner"), false);
});

Deno.test("⛔ COUPURE · passé 18 h, TOUT ce qui reste est retenu", () => {
  // Le défaut le plus grave d'avant le lot: entre 18 h et 21 h le produit
  // servait un dîner qu'aucun magasin ne pouvait fournir.
  const o = slotsUnservableToday({ hourNow: 19, rhythm: RYTHME_4, declaredHours: [] });
  assertEquals(o.heldForShopping.sort(), ["dinner", "snack_pm"]);
});

Deno.test("⛔ LA COUPURE FAIT UN TRAVAIL QUE LE DÉLAI NE FAIT PAS", () => {
  // ══════════════════════════════════════════════════════════════════════
  // MUTATION QUI N'A PAS ROUGI, ET CE QU'ELLE A APPRIS — 2026-09-04.
  // ══════════════════════════════════════════════════════════════════════
  // J'ai neutralisé la branche de coupure et la suite est restée VERTE. Motif:
  // à 19 h, le délai de deux heures retenait DÉJÀ le dîner (19 < 21), donc mon
  // cas ne pouvait pas distinguer les deux règles. Une mutation qui ne rougit
  // pas doit être suspectée AVANT le test qu'elle prétend éprouver.
  //
  // Le cas qui les sépare est un moment TARDIF: à 18 h, une collation du soir
  // à 22 h est hors de portée du délai (22 >= 20) — seule la coupure la
  // retient, et elle doit, parce qu'aucun magasin n'est ouvert.
  const tardif = [{ slot: "before_bed" as const }];
  const apres = slotsUnservableToday({
    hourNow: 18,
    rhythm: tardif,
    declaredHours: [],
  });
  assertEquals(apres.heldForShopping, ["before_bed"], "la coupure ne retient pas");
  // ⛔ LA CONTRE-ÉPREUVE, une heure plus tôt: à 17 h la coupure n'est pas
  // atteinte et le délai ne mord pas — la collation reste au plan.
  const avant = slotsUnservableToday({
    hourNow: 17,
    rhythm: tardif,
    declaredHours: [],
  });
  assertEquals(avant.heldForShopping, [], "la coupure mord une heure trop tôt");
});

Deno.test("DÉLAI · une heure DÉCLARÉE l'emporte sur la table", () => {
  // Quelqu'un qui dîne à 22 h a le temps de faire ses courses à 19 h — enfin,
  // il l'aurait si les magasins étaient ouverts. On teste donc AVANT la coupure.
  const tard = slotsUnservableToday({
    hourNow: 16,
    rhythm: [{ slot: "dinner" as const }],
    declaredHours: [{ slot: "dinner", hour: 22 }],
  });
  assertEquals(tard.heldForShopping, []);
  const tot = slotsUnservableToday({
    hourNow: 16,
    rhythm: [{ slot: "dinner" as const }],
    declaredHours: [{ slot: "dinner", hour: 17 }],
  });
  assertEquals(tot.heldForShopping, ["dinner"]);
});

Deno.test("⛔ HORLOGE ILLISIBLE · rien n'est retenu, c'est le produit d'hier", () => {
  const o = slotsUnservableToday({ hourNow: null, rhythm: RYTHME_4, declaredHours: [] });
  assertEquals(o.passed, []);
  assertEquals(o.heldForShopping, []);
});

Deno.test("⛔ LES DEUX LISTES NE SE RECOUVRENT JAMAIS", () => {
  // Une bouche ne peut pas perdre son repas deux fois — et la phrase le dirait
  // deux fois si elles se recouvraient.
  for (const h of [7, 9, 11, 12, 14, 16, 18, 19, 21, 22]) {
    const o = slotsUnservableToday({ hourNow: h, rhythm: RYTHME_4, declaredHours: [] });
    const croise = o.passed.filter((s) => o.heldForShopping.includes(s));
    assertEquals(croise, [], `à ${h} h: ${croise.join(",")}`);
  }
});

Deno.test("la fenêtre tombe sur un moment RETENU, et la CAUSE le dit", () => {
  // À 19 h, aucun moment n'est « passé » (le dîner tombe à 21 h) — la journée
  // est pourtant finie, parce que plus rien n'est achetable.
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: ["breakfast", "lunch", "dinner"],
    passedSlots: ["breakfast", "lunch"],
    heldSlots: ["dinner"],
    shoppingCutoffReached: true,
  });
  assertEquals(out.refused, null);
  assertEquals(out.durationDays, 2);
  assertEquals(out.cause, "shopping_cutoff");
});

Deno.test("⛔ LA CAUSE SE LIT SUR CE QUI RESTE — l'horloge l'emporte", () => {
  // Tous les moments sont derrière nous ET la coupure est passée. C'est
  // l'HORLOGE qu'on nomme: dire « il fallait le temps de faire les courses »
  // pour une journée finie à 22 h enverrait chercher un magasin ouvert.
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: ["breakfast", "lunch", "dinner"],
    passedSlots: ["breakfast", "lunch", "dinner"],
    heldSlots: [],
    shoppingCutoffReached: true,
  });
  assertEquals(out.cause, "slots_passed");
});

Deno.test("cause `shopping_lead` — avant la coupure, c'est le DÉLAI", () => {
  const out = withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
    today: LUNDI,
    cookOnlyDay: null,
    declaredSlots: ["breakfast", "lunch"],
    passedSlots: ["breakfast"],
    heldSlots: ["lunch"],
    shoppingCutoffReached: false,
  });
  assertEquals(out.cause, "shopping_lead");
  assertEquals(out.durationDays, 2);
});

Deno.test("⛔ LES DEUX ENTRÉES SONT REQUISES — `undefined` ne dit rien", () => {
  for (
    const partiel of [
      { heldSlots: undefined, shoppingCutoffReached: false },
      { heldSlots: [], shoppingCutoffReached: undefined },
    ]
  ) {
    let leve = false;
    try {
      withoutSpentFirstDay({ startsOn: LUNDI, durationDays: 3 }, {
        today: LUNDI,
        cookOnlyDay: null,
        declaredSlots: ["breakfast"],
        passedSlots: ["breakfast"],
        ...partiel,
      } as never);
    } catch {
      leve = true;
    }
    assertEquals(leve, true, `un champ manquant doit LEVER: ${JSON.stringify(partiel)}`);
  }
});

// ⟳ 2026-09-04 · LA GARDE QUE LE RUN RÉEL A RÉCLAMÉE
//
// ⛔ LE DÉFAUT, EN CONDITIONS RÉELLES: à 12 h, le plan a rendu « Pour
// aujourd'hui, le déjeuner n'est pas au plan : il faut le temps de faire les
// courses avant » — ET un déjeuner composé le jour même. Les deux listes
// étaient correctes, la phrase était correcte, et c'est leur JOINTURE au prompt
// qui manquait: la fusion des absences ne lisait que les moments PASSÉS.
//
// ⛔ AUCUN TEST DE VALEUR NE POUVAIT LE VOIR. C'est un fait de câblage, et il
// se tient donc sur la source des deux lanes.
for (const [nom, rel] of LANES) {
  Deno.test(`câblage ${nom} — le prompt reçoit l'UNION, la phrase reçoit les deux listes`, async () => {
    const code = await laneSource(rel);
    // La fusion des absences lit l'union…
    assert(
      code.includes("const unservableUnion = startsOn === todayDate ? passedToday : []"),
      `${nom}: la fusion doit partir de l'union`,
    );
    assert(
      code.includes("...unservableUnion]"),
      `${nom}: la fusion doit MERGER l'union, pas une des deux listes`,
    );
    // ⛔ …et surtout PAS la seule liste des moments passés: c'est le défaut
    // exact, et il ressemble trait pour trait à du code juste.
    assert(
      !code.includes("...slotsDroppedToday]"),
      `${nom}: la fusion lit encore la seule liste des moments PASSÉS`,
    );
    // …tandis que l'explication reçoit les deux séparément.
    assert(
      code.includes("slotsDroppedToday,") && code.includes("slotsHeldForShopping,"),
      `${nom}: la rationale doit recevoir les DEUX faits`,
    );
  });
}
