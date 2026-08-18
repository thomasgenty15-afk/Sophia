import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  memberMealCells,
  parseMemberAway,
  parseWorkLunch,
  type PresenceMember,
  presenceStateFor,
  resolveWindowPresence,
  workLunchPrefillCells,
} from "./household_presence.ts";
import { type EatingOccasionSlot } from "./meal_generation.ts";

// D14 — LA PRÉSENCE DU FOYER.
//
// CE QUE CES TESTS GARDENT, et pourquoi ça ne se relit pas dans le code:
//
//   1. L'UNION des deux sources, dans les deux sens (arbitrage B). Si l'une
//      écrasait l'autre, soit le maître ne pourrait pas corriger un oubli, soit
//      la déclaration de la personne ne servirait à rien.
//   2. LA SESSION DE CUISSON SURVIT à l'absence d'un seul (FF-002 §9). C'est
//      le contrat qui existait AVANT ce lot et que ce lot pouvait casser.
//   3. LE REPAS NE DISPARAÎT QUE SI PERSONNE N'EST LÀ.
//   4. LA TOLÉRANCE de FF-002 §7: un jeton inconnu tombe, les autres restent.
//
// ⚠️ AUCUN CHIFFRE N'EST PARAMÉTRÉ PAR UNE CONSTANTE DU MODULE. Les tables
// attendues sont écrites en littéral, sinon un test resterait vert quand on
// change ce qu'il garde.

const RHYTHM: EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function member(
  memberId: string,
  displayName: string,
  raw: unknown,
): PresenceMember {
  return { memberId, displayName, away: parseMemberAway(raw) };
}

Deno.test("la colonne du roster se lit en trois vues, et l'union est la concaténation", () => {
  const away = parseMemberAway([
    { day: "sun", source: "self" },
    { day: "thu", slots: ["lunch"], source: "household" },
  ]);
  // L'EFFECTIF PORTE LES DEUX. C'est l'arbitrage B: ni la personne ni le maître
  // ne gagne, les deux comptent.
  assertEquals(away.effective, [
    { day: "thu", slots: ["lunch"] },
    { day: "sun", slots: [] },
  ]);
  assertEquals(away.self, [{ day: "sun", slots: [] }]);
  assertEquals(away.household, [{ day: "thu", slots: ["lunch"] }]);
});

Deno.test("les deux sources sur le MÊME jour se fusionnent, journée entière gagnante", () => {
  // Le maître dit « toute la journée », la personne « seulement le déjeuner ».
  // Le résultat est la journée entière — l'union de deux faits, pas un
  // arbitrage entre deux opinions.
  const away = parseMemberAway([
    { day: "sat", slots: ["lunch"], source: "self" },
    { day: "sat", source: "household" },
  ]);
  assertEquals(away.effective, [{ day: "sat", slots: [] }]);

  // ET DANS L'AUTRE SENS: l'ordre des deux tableaux ne doit rien changer,
  // sinon la concaténation en base deviendrait un arbitrage silencieux.
  const flipped = parseMemberAway([
    { day: "sat", source: "household" },
    { day: "sat", slots: ["lunch"], source: "self" },
  ]);
  assertEquals(flipped.effective, [{ day: "sat", slots: [] }]);
});

Deno.test("un jeton de jour inconnu tombe, et n'emporte pas les autres (FF-002 §7)", () => {
  const away = parseMemberAway([
    { day: "caturday", source: "household" },
    { day: "wed", slots: ["dinner"], source: "household" },
  ]);
  assertEquals(away.effective, [{ day: "wed", slots: ["dinner"] }]);
  assertEquals(away.household, [{ day: "wed", slots: ["dinner"] }]);
});

Deno.test("une entrée sans source n'est comptée dans aucune des deux vues", () => {
  // Elle reste dans l'effectif: ce qu'on ne sait pas attribuer ne doit pas
  // cesser de compter. C'est la trace qui est incomplète, pas l'assiette.
  const away = parseMemberAway([{ day: "fri" }]);
  assertEquals(away.effective, [{ day: "fri", slots: [] }]);
  assertEquals(away.self, []);
  assertEquals(away.household, []);
});

Deno.test("une absence d'UN SEUL ne supprime aucun repas — elle change les parts", () => {
  const presence = resolveWindowPresence({
    members: [
      member("m1", "Marc", [{ day: "sat", source: "household" }]),
      member("m2", "Lea", []),
      member("m3", "Tom", []),
    ],
    rhythm: RHYTHM,
    windowDays: WEEK,
  });

  // LE CONTRAT DE FF-002 §9, et c'est le seul que ce lot pouvait casser: la
  // session de cuisson du samedi ne disparaît pas.
  assertEquals(presence.householdAway, []);
  assertEquals(presence.fullyAway, false);
  // Trois à table le reste de la semaine.
  assertEquals(presence.servings, 3);
  // Et le samedi, on cuisine pour deux — dit une seule fois, pas trois.
  assert(
    presence.block.includes("Saturday, every meal: Marc not eating here -- cook for 2 instead of 3."),
    presence.block,
  );
});

Deno.test("le repas ne disparaît que quand PERSONNE n'est là", () => {
  const presence = resolveWindowPresence({
    members: [
      member("m1", "Marc", [{ day: "sat", source: "household" }]),
      member("m2", "Lea", [{ day: "sat", source: "self" }]),
    ],
    rhythm: RHYTHM,
    windowDays: ["fri", "sat", "sun"],
  });

  // La journée entière, dans la forme COURTE de FF-002 §5.
  assertEquals(presence.householdAway, [{ day: "sat", slots: [] }]);
  assertEquals(presence.fullyAway, false);
  assertEquals(presence.servings, 2);
  // Aucune ligne de prose: il n'y a personne à qui servir moins.
  assertEquals(presence.block, "");
});

Deno.test("un seul créneau déserté sort, le reste du jour est composé", () => {
  const presence = resolveWindowPresence({
    members: [
      member("m1", "Marc", [{ day: "thu", slots: ["lunch"], source: "household" }]),
      member("m2", "Lea", [{ day: "thu", slots: ["lunch"], source: "self" }]),
    ],
    rhythm: RHYTHM,
    windowDays: ["thu"],
  });
  assertEquals(presence.householdAway, [{ day: "thu", slots: ["lunch"] }]);
  assertEquals(presence.servings, 2);
  assertEquals(presence.fullyAway, false);
});

Deno.test("des absences différentes selon le moment donnent une ligne par moment", () => {
  const presence = resolveWindowPresence({
    members: [
      member("m1", "Marc", [{ day: "thu", slots: ["lunch"], source: "household" }]),
      member("m2", "Lea", []),
      member("m3", "Tom", []),
    ],
    rhythm: RHYTHM,
    windowDays: ["thu"],
  });
  // PAS de regroupement « every meal »: le petit-déjeuner et le dîner ont bien
  // trois convives. Regrouper ferait cuisiner pour deux toute la journée.
  assert(!presence.block.includes("every meal"), presence.block);
  assert(
    presence.block.includes("Thursday, lunch: Marc not eating here -- cook for 2 instead of 3."),
    presence.block,
  );
  assertEquals(presence.householdAway, []);
  assertEquals(presence.servings, 3);
});

Deno.test("plusieurs absents sur le même moment sont nommés ensemble", () => {
  const presence = resolveWindowPresence({
    members: [
      member("m1", "Marc", [{ day: "thu", slots: ["dinner"], source: "household" }]),
      member("m2", "Lea", [{ day: "thu", slots: ["dinner"], source: "household" }]),
      member("m3", "Tom", []),
    ],
    rhythm: RHYTHM,
    windowDays: ["thu"],
  });
  assert(
    presence.block.includes("Marc and Lea not eating here -- cook for 1 instead of 3."),
    presence.block,
  );
});

Deno.test("une fenêtre entièrement désertée est un CONSTAT, pas un refus", () => {
  const presence = resolveWindowPresence({
    members: [member("m1", "Marc", [{ day: "sat", source: "household" }])],
    rhythm: RHYTHM,
    windowDays: ["sat"],
  });
  assertEquals(presence.fullyAway, true);
  assertEquals(presence.householdAway, [{ day: "sat", slots: [] }]);
  // Le module ne refuse rien: c'est l'appelant qui rend `window_fully_away`,
  // parce que lui seul sait quoi répondre.
  assertEquals(presence.servings, 1);
});

Deno.test("sans rythme et sans fenêtre, l'échec est OUVERT: tout le monde à table", () => {
  const noRhythm = resolveWindowPresence({
    members: [member("m1", "Marc", [{ day: "sat", source: "household" }])],
    rhythm: [],
    windowDays: WEEK,
  });
  // LA DIRECTION EST LE SUJET. Un rythme vide qui ferait « personne n'est là »
  // refuserait la composition d'un foyer qui n'a rien déclaré du tout.
  assertEquals(noRhythm.fullyAway, false);
  assertEquals(noRhythm.householdAway, []);
  assertEquals(noRhythm.servings, 1);

  const noWindow = resolveWindowPresence({
    members: [member("m1", "Marc", [{ day: "sat", source: "household" }])],
    rhythm: RHYTHM,
    windowDays: [],
  });
  assertEquals(noWindow.fullyAway, false);
  assertEquals(noWindow.householdAway, []);
});

Deno.test("zéro absence déclarée: rien ne bouge, au plat près (FF-002 R4)", () => {
  const presence = resolveWindowPresence({
    members: [
      member("m1", "Marc", []),
      member("m2", "Lea", []),
      member("m3", "Tom", []),
      member("m4", "Zoe", []),
    ],
    rhythm: RHYTHM,
    windowDays: WEEK,
  });
  assertEquals(presence.householdAway, []);
  assertEquals(presence.block, "");
  assertEquals(presence.trace, []);
  assertEquals(presence.servings, 4);
  assertEquals(presence.fullyAway, false);
});

Deno.test("la trace dit qui manque ET de quelle source (arbitrage C)", () => {
  const presence = resolveWindowPresence({
    members: [
      member("m1", "Marc", [
        { day: "sun", source: "self" },
        { day: "thu", slots: ["lunch"], source: "household" },
      ]),
      member("m2", "Lea", []),
    ],
    rhythm: RHYTHM,
    windowDays: WEEK,
  });
  // Seules les bouches qui manquent y sont: une trace où tout le monde figure
  // avec des tableaux vides ne se lit plus.
  assertEquals(presence.trace.length, 1);
  assertEquals(presence.trace[0].member_id, "m1");
  assertEquals(presence.trace[0].self, [{ day: "sun", slots: [] }]);
  assertEquals(presence.trace[0].household, [{ day: "thu", slots: ["lunch"] }]);
  assertEquals(presence.trace[0].away, [
    { day: "thu", slots: ["lunch"] },
    { day: "sun", slots: [] },
  ]);
});

Deno.test("le bloc de présence interdit de commenter l'absence de quelqu'un", () => {
  const presence = resolveWindowPresence({
    members: [
      member("m1", "Marc", [{ day: "sat", source: "household" }]),
      member("m2", "Lea", []),
    ],
    rhythm: RHYTHM,
    windowDays: ["sat"],
  });
  // Où quelqu'un est passé samedi soir ne regarde pas le plan de repas — même
  // posture que l'interdiction de nommer une raison de portion.
  assert(presence.block.includes("Never mention, explain or comment"), presence.block);
  // Et la cuisson reste UNE.
  assert(presence.block.includes("ONE cooking session"), presence.block);
});

Deno.test("UNE BOUCHE ABSENTE TOUTE LA FENÊTRE PERD SON ASSIETTE", () => {
  // ⚠️ MESURÉ EN RUN RÉEL LE 2026-08-12 — c'est la seconde moitié de FF-002 §9.
  // Un plan cuisiné pour UNE personne portait QUATRE `member_portions`, dont
  // trois pour des bouches absentes à chaque moment de la fenêtre, et l'écran
  // du foyer promettait « une portion adulte pleine » à chacune. `servings`
  // était juste; l'assiette mentait.
  const presence = resolveWindowPresence({
    members: [
      {
        memberId: "m-gone",
        displayName: "Marc",
        // Toute la fenêtre, en forme COURTE (journée entière).
        away: parseMemberAway([{ day: "mon" }, { day: "tue" }]),
      },
      {
        memberId: "m-here",
        displayName: "Tom",
        away: parseMemberAway([]),
      },
    ],
    rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
    windowDays: ["mon", "tue"],
  });
  assertEquals(presence.absentAllWindow, ["m-gone"]);
  assertEquals(presence.servings, 1);
  assertEquals(presence.fullyAway, false);
});

Deno.test("QUI MANQUE UN SEUL REPAS GARDE SON ASSIETTE", () => {
  // LE CAS QUI PASSE, et c'est la moitié du travail: une règle qui retire
  // l'assiette de tout absent refuse aussi bien qu'une règle juste, et on ne
  // s'en apercevrait qu'au moment où quelqu'un n'a rien à manger le mardi.
  // Retirer l'assiette de qui manque UN dîner serait plus faux que de la
  // laisser: il mange les autres jours.
  const presence = resolveWindowPresence({
    members: [
      {
        memberId: "m-late",
        displayName: "Marc",
        away: parseMemberAway([{ day: "mon", slots: ["dinner"] }]),
      },
      { memberId: "m-here", displayName: "Tom", away: parseMemberAway([]) },
    ],
    rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
    windowDays: ["mon", "tue"],
  });
  assertEquals(presence.absentAllWindow, []);
  assertEquals(presence.servings, 2);
});

Deno.test("le calcul suit le rythme RÉEL, pas les sept jours par défaut", () => {
  // Un foyer qui ne sert que le dîner: être absent aux DÎNERS suffit à être
  // absent de toute la fenêtre. Si `absentAllWindow` parcourait ses propres
  // créneaux plutôt que ceux du rythme, il compterait des déjeuners que
  // personne ne sert et ne trouverait jamais d'absence totale.
  const presence = resolveWindowPresence({
    members: [
      {
        memberId: "m-gone",
        displayName: "Marc",
        away: parseMemberAway([
          { day: "mon", slots: ["dinner"] },
          { day: "tue", slots: ["dinner"] },
        ]),
      },
      { memberId: "m-here", displayName: "Tom", away: parseMemberAway([]) },
    ],
    rhythm: [{ slot: "dinner", size: null }],
    windowDays: ["mon", "tue"],
  });
  assertEquals(presence.absentAllWindow, ["m-gone"]);
});

Deno.test("sans rythme lisible, PERSONNE ne perd son assiette", () => {
  // Échec OUVERT, comme le reste du module. Fermé, un rythme illisible
  // retirerait l'assiette de tout le foyer d'un coup.
  const presence = resolveWindowPresence({
    members: [
      {
        memberId: "m-gone",
        displayName: "Marc",
        away: parseMemberAway([{ day: "mon" }, { day: "tue" }]),
      },
    ],
    rhythm: [],
    windowDays: ["mon", "tue"],
  });
  assertEquals(presence.absentAllWindow, []);
});

Deno.test("absent TOUT LUNDI mais là mardi: il garde son assiette", () => {
  // LE CAS QUI SÉPARE `every` DE `some` sur les jours. Une journée entière
  // d'absence est le motif le plus courant (un déplacement, une garde
  // alternée); si le calcul se contentait d'UN jour désert, la moitié des
  // foyers verraient une assiette disparaître pour quelqu'un qui dîne là le
  // lendemain.
  const presence = resolveWindowPresence({
    members: [
      {
        memberId: "m-mon",
        displayName: "Marc",
        away: parseMemberAway([{ day: "mon" }]),
      },
      { memberId: "m-here", displayName: "Tom", away: parseMemberAway([]) },
    ],
    rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
    windowDays: ["mon", "tue"],
  });
  assertEquals(presence.absentAllWindow, []);
  assertEquals(presence.servings, 2);
});

// ===========================================================================
// C3 ④/⑥ — `memberMealCells`, LA PRIMITIVE PARTAGÉE
//
// Trois lecteurs, une seule définition de « quels repas cette bouche prend
// ici »: `absentAllWindow` (le refus du générateur), la PRÉDICTION du lecteur
// de propositions (C3 ④), et le DÉNOMINATEUR du constat de forme (C3 ⑥). La
// ré-écrire chez l'un d'eux ferait deux idées de la même chose, et c'est la
// dette que ce chantier a payée quatre fois.
// ===========================================================================

const TWO_SLOTS: EatingOccasionSlot[] = [
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

Deno.test("C3 — `memberMealCells` rend la grille jour × moment, sans les absences", () => {
  const cells = memberMealCells({
    away: [{ day: "tue", slots: ["lunch"] }],
    rhythm: TWO_SLOTS,
    windowDays: ["mon", "tue"],
  });
  assertEquals(cells, [
    { day: "mon", slot: "lunch" },
    { day: "mon", slot: "dinner" },
    { day: "tue", slot: "dinner" },
  ]);
});

Deno.test("C3 — UNE JOURNÉE ENTIÈRE retire tous ses moments", () => {
  // La forme COURTE de FF-002 §5 (`slots: []`) vaut « toute la journée », et
  // elle doit survivre à un changement de rythme.
  const cells = memberMealCells({
    away: [{ day: "mon", slots: [] }],
    rhythm: TWO_SLOTS,
    windowDays: ["mon", "tue"],
  });
  assertEquals(cells.map((c) => c.day), ["tue", "tue"]);
});

Deno.test("C3 — AUCUNE CASE = l'absence totale, et c'est la définition du refus", () => {
  // `merge_member_away_all_window` se décide là-dessus, dans le générateur ET
  // dans le lecteur de propositions.
  const cells = memberMealCells({
    away: [{ day: "mon", slots: [] }, { day: "tue", slots: [] }],
    rhythm: TWO_SLOTS,
    windowDays: ["mon", "tue"],
  });
  assertEquals(cells, []);
});

Deno.test("C3 — `absentAllWindow` PASSE PAR LA PRIMITIVE (le cas qui passe)", () => {
  // Le lien entre les deux est ce qui rend la prédiction du lecteur honnête. Si
  // `resolveWindowPresence` reprenait son propre parcours, les deux
  // pourraient diverger sans qu'un seul test ne tombe.
  const members: PresenceMember[] = [
    {
      memberId: "m-here",
      displayName: "Marc",
      away: { effective: [], self: [], household: [] },
    },
    {
      memberId: "m-gone",
      displayName: "Zoe",
      away: {
        effective: [{ day: "mon", slots: [] }, { day: "tue", slots: [] }],
        self: [],
        household: [],
      },
    },
  ];
  const presence = resolveWindowPresence({
    members,
    rhythm: TWO_SLOTS,
    windowDays: ["mon", "tue"],
  });
  assertEquals(presence.absentAllWindow, ["m-gone"]);
  assertEquals(presence.fullyAway, false);
});

Deno.test("C3 — SANS RYTHME, la primitive rend `[]` et l'appelant décide", () => {
  // ⚠️ ELLE NE PORTE PAS L'ÉCHEC OUVERT, et c'est écrit sur elle: « pas de
  // repas dans une fenêtre vide » est le sens littéral. `resolveWindowPresence`
  // sort AVANT d'arriver ici, et le lecteur de propositions se garde de la même
  // façon — sinon un foyer sans rythme déclaré perdrait toutes ses
  // propositions, en silence.
  assertEquals(
    memberMealCells({ away: [], rhythm: [], windowDays: ["mon"] }),
    [],
  );
  const presence = resolveWindowPresence({
    members: [{
      memberId: "m-1",
      displayName: "Marc",
      away: { effective: [], self: [], household: [] },
    }],
    rhythm: [],
    windowDays: ["mon"],
  });
  assertEquals(presence.absentAllWindow, [], "personne n'est déclaré absent");
});

// ===========================================================================
// L3 (2026-08-18) — « DEHORS » N'EST PAS « ABSENT »
//
// CE QUE CES TESTS GARDENT, et pourquoi ça ne se relit pas dans le code:
//
//   1. LE MOTEUR NE BOUGE PAS. `servings`, `householdAway` et surtout `block`
//      sont IDENTIQUES au caractère près avec ou sans jeton. C'est la garde
//      qui dit que ce lot collecte sans exploiter — s'il modifiait le prompt,
//      il entrerait en collision avec le lot qui le regroupe.
//   2. LE SILENCE GAGNE quand les deux sources se contredisent. Un conseil
//      chiffré au milieu de vacances s'écrit à l'écran; un conseil qui manque
//      ne s'y voit pas.
//   3. UNE LIGNE D'AVANT CE LOT RESTE LISIBLE, et se lit `away`.
//   4. UN JETON INCONNU NE DEVIENT PAS UN TROISIÈME ÉTAT.
//   5. LA GAMELLE NE COCHE RIEN — le point le plus facile à rater: un repas
//      emporté est un repas COMPOSÉ.
//
// ⚠️ AUCUN CHIFFRE N'EST PARAMÉTRÉ PAR UNE CONSTANTE DU MODULE, ici non plus.
// ===========================================================================

Deno.test("L3 — les trois états se lisent sur la MÊME colonne", () => {
  const away = parseMemberAway([
    { day: "tue", slots: ["lunch"], kind: "eating_out", source: "self" },
    { day: "sat", kind: "away", source: "household" },
  ]);
  // L'EFFECTIF PORTE LES DEUX: un « dehors » EST une absence de la table, et
  // c'est ce qui fait que le moteur compte exactement comme hier.
  assertEquals(away.effective, [
    { day: "tue", slots: ["lunch"] },
    { day: "sat", slots: [] },
  ]);
  assertEquals(away.eatingOut, [{ day: "tue", slots: ["lunch"] }]);
  assertEquals(presenceStateFor(away, "tue", "lunch"), "eating_out");
  assertEquals(presenceStateFor(away, "tue", "dinner"), "at_table");
  assertEquals(presenceStateFor(away, "sat", "lunch"), "away");
});

Deno.test("L3 — une ligne SANS jeton (avant ce lot) se lit `away`, pas `dehors`", () => {
  // Les lignes déjà en base ne portent rien. Les lire « dehors » ferait
  // apparaître un conseil chiffré sur des vacances déclarées il y a des jours.
  const away = parseMemberAway([{ day: "sat", slots: ["lunch"] }]);
  assertEquals(away.eatingOut, []);
  assertEquals(presenceStateFor(away, "sat", "lunch"), "away");
});

Deno.test("L3 — un jeton INCONNU ne fabrique pas un troisième état", () => {
  // `canteen` ressemble à quelque chose, et c'est précisément le danger. Le
  // repli est le silence, jamais l'invention d'un vocabulaire.
  const away = parseMemberAway([
    { day: "mon", slots: ["lunch"], kind: "canteen" },
  ]);
  assertEquals(away.eatingOut, []);
  assertEquals(presenceStateFor(away, "mon", "lunch"), "away");
});

Deno.test("L3 — LE SILENCE GAGNE quand les deux sources se contredisent", () => {
  // Elle a dit « je déjeune dehors le mardi »; le maître a marqué « toute la
  // semaine en vacances ». Les deux retirent la part et ne se contredisent que
  // sur un point: est-ce qu'on lui dit un nombre ? On ne le dit pas.
  const away = parseMemberAway([
    { day: "tue", slots: ["lunch"], kind: "eating_out", source: "self" },
    { day: "tue", kind: "away", source: "household" },
  ]);
  assertEquals(away.eatingOut, []);
  assertEquals(presenceStateFor(away, "tue", "lunch"), "away");
});

Deno.test("L3 — l'arbitrage est PAR CASE, pas par jour", () => {
  // Le maître marque le dîner de mardi (dentiste); elle mange dehors ce
  // midi-là. Faire gagner le silence sur TOUTE la journée effacerait un midi
  // qu'elle a déclaré, et c'est le geste le plus frustrant du lot.
  const away = parseMemberAway([
    { day: "tue", slots: ["lunch"], kind: "eating_out", source: "self" },
    { day: "tue", slots: ["dinner"], kind: "away", source: "household" },
  ]);
  assertEquals(away.eatingOut, [{ day: "tue", slots: ["lunch"] }]);
  assertEquals(presenceStateFor(away, "tue", "lunch"), "eating_out");
  assertEquals(presenceStateFor(away, "tue", "dinner"), "away");
});

Deno.test("L3 — une JOURNÉE ENTIÈRE dehors garde sa forme courte", () => {
  // `slots: []` survit à un changement de rythme; la déplier en six moments
  // ferait qu'ajouter un petit-déjeuner plus tard changerait le sens d'une
  // déclaration écrite avant.
  const away = parseMemberAway([{ day: "wed", kind: "eating_out" }]);
  assertEquals(away.eatingOut, [{ day: "wed", slots: [] }]);
  assertEquals(presenceStateFor(away, "wed", "breakfast"), "eating_out");
});

Deno.test("L3 — LE PROMPT NE BOUGE PAS D'UN CARACTÈRE", () => {
  // ⚠️ LA GARDE CENTRALE DE CE LOT. Il collecte une distinction, il n'en
  // exploite aucune: l'exploitation par le modèle est regroupée ailleurs, en un
  // seul bump de version. Si ce test tombe, ce lot a écrit dans le prompt.
  const plain = resolveWindowPresence({
    members: [
      member("m-1", "Marc", []),
      member("m-2", "Zoe", [{ day: "tue", slots: ["lunch"] }]),
    ],
    rhythm: RHYTHM,
    windowDays: WEEK,
  });
  const tagged = resolveWindowPresence({
    members: [
      member("m-1", "Marc", []),
      member("m-2", "Zoe", [
        { day: "tue", slots: ["lunch"], kind: "eating_out" },
      ]),
    ],
    rhythm: RHYTHM,
    windowDays: WEEK,
  });
  assertEquals(tagged.block, plain.block);
  assertEquals(tagged.servings, plain.servings);
  assertEquals(tagged.householdAway, plain.householdAway);
  assertEquals(tagged.absentAllWindow, plain.absentAllWindow);
  // Ce qui change, et c'est TOUT ce qui change:
  assertEquals(plain.eatingOut, []);
  assertEquals(tagged.eatingOut, [
    { member_id: "m-2", cells: [{ day: "tue", slot: "lunch" }] },
  ]);
});

Deno.test("L3 — la fenêtre borne les cases dehors, par la même primitive", () => {
  // Un « dehors » déclaré vendredi sur une fenêtre lundi-mardi ne produit
  // AUCUNE case: un conseil posé hors de la fenêtre serait un conseil sur un
  // jour que le plan ne couvre pas.
  const presence = resolveWindowPresence({
    members: [
      member("m-1", "Marc", [
        { day: "fri", slots: ["lunch"], kind: "eating_out" },
      ]),
    ],
    rhythm: RHYTHM,
    windowDays: ["mon", "tue"],
  });
  assertEquals(presence.eatingOut, []);
});

Deno.test("L3 — la trace archive la part « dehors » de chaque absence", () => {
  // Sans elle, « pourquoi le plan a-t-il dit un nombre à Zoe ce mardi ? » n'a
  // aucune réponse trois jours plus tard.
  const presence = resolveWindowPresence({
    members: [
      member("m-1", "Marc", []),
      member("m-2", "Zoe", [
        { day: "tue", slots: ["lunch"], kind: "eating_out", source: "self" },
        { day: "sat", source: "household" },
      ]),
    ],
    rhythm: RHYTHM,
    windowDays: WEEK,
  });
  assertEquals(presence.trace, [{
    member_id: "m-2",
    away: [{ day: "tue", slots: ["lunch"] }, { day: "sat", slots: [] }],
    self: [{ day: "tue", slots: ["lunch"] }],
    household: [{ day: "sat", slots: [] }],
    eating_out: [{ day: "tue", slots: ["lunch"] }],
  }]);
});

Deno.test("L3 — un `MemberAway` bâti à la main n'invente aucun « dehors »", () => {
  // Le champ est facultatif dans le type (des fixtures d'autres modules en
  // construisent), et son absence vaut le SILENCE. La direction inverse ferait
  // parler le produit à partir d'une donnée que personne n'a écrite.
  const hand = { effective: [{ day: "mon", slots: [] }], self: [], household: [] };
  assertEquals(presenceStateFor(hand, "mon", "lunch"), "away");
});

Deno.test("L3 — la réponse hebdo se lit, et un `at_work` illisible n'est pas « non »", () => {
  assertEquals(parseWorkLunch({ at_work: false }), {
    atWork: false,
    mode: null,
    microwave: null,
  });
  assertEquals(
    parseWorkLunch({ at_work: true, mode: "lunchbox", microwave: false }),
    { atWork: true, mode: "lunchbox", microwave: false },
  );
  // Ni « oui » ni « non »: JAMAIS DEMANDÉ. Fabriquer « elle ne mange pas au
  // bureau » ferait composer cinq déjeuners à quelqu'un qui n'en mange aucun.
  assertEquals(parseWorkLunch({ at_work: "yes" }), null);
  assertEquals(parseWorkLunch(null), null);
  assertEquals(parseWorkLunch([{ at_work: true }]), null);
  // Le formulaire se DÉPLIE: « au bureau » sans avoir dit gamelle-ou-dehors
  // est une réponse à moitié descendue, pas un mode par défaut.
  assertEquals(parseWorkLunch({ at_work: true }), {
    atWork: true,
    mode: null,
    microwave: null,
  });
  // Le micro-ondes n'existe QUE pour la gamelle: le garder sur « dehors »
  // laisserait une contrainte de réchauffage sur un repas non composé.
  assertEquals(
    parseWorkLunch({ at_work: true, mode: "outside", microwave: true }),
    { atWork: true, mode: "outside", microwave: null },
  );
});

Deno.test("L3 — LA GAMELLE NE COCHE AUCUN MIDI, et c'est le piège du lot", () => {
  // Un repas emporté est un repas COMPOSÉ. Le marquer « dehors » retirerait
  // cinq déjeuners du plan de quelqu'un qui compte précisément dessus pour
  // remplir sa boîte.
  assertEquals(
    workLunchPrefillCells({ atWork: true, mode: "lunchbox", microwave: true }),
    [],
  );
  assertEquals(workLunchPrefillCells({ atWork: false, mode: null, microwave: null }), []);
  assertEquals(workLunchPrefillCells(null), []);
  assertEquals(workLunchPrefillCells({ atWork: true, mode: null, microwave: null }), []);
  // Et « dehors » couvre les cinq midis de semaine, PAS le week-end: « la
  // semaine » veut dire lundi→vendredi, et le samedi ne se déduit pas.
  assertEquals(
    workLunchPrefillCells({ atWork: true, mode: "outside", microwave: null }),
    [
      { day: "mon", slot: "lunch" },
      { day: "tue", slot: "lunch" },
      { day: "wed", slot: "lunch" },
      { day: "thu", slot: "lunch" },
      { day: "fri", slot: "lunch" },
    ],
  );
});
