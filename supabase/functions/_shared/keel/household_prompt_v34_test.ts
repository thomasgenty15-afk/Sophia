// ⟳ LOT 11 (2026-09-07) — LE BRIEF EN QUATRE TEMPS: CARTES, CALENDRIER,
// MÉTHODE, SCHÉMA.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ LA PREMIÈRE ÉPREUVE EST CELLE QUI **PASSE** — une garde a besoin d'un cas
//    qui passe, sans quoi, cassée, elle bloque tout et ressemble à une garde
//    qui marche.
// ══════════════════════════════════════════════════════════════════════════
// `le_brief_ordinaire`: deux adultes, aucun régime, aucune case vide. Le brief
// doit porter ses quatre sections, une carte par personne, et RIEN de ce que
// v33 disait des corps et des boîtes.
//
// ══════════════════════════════════════════════════════════════════════════
// LES MUTATIONS QUE CES ÉPREUVES DOIVENT FAIRE ROUGIR
// ══════════════════════════════════════════════════════════════════════════
//   P1 — un fait de corps revient sur une carte (taille, poids, âge en
//        chiffres). ROUGE: c'est la porte que v33 a fermée.
//   P2 — le schéma des boîtes ou `member_portions` revient dans le suffixe
//        système. ROUGE: deux autorités sur les grammes.
//   P3 — le calendrier cesse de nommer les cases vides. ROUGE: le modèle
//        comble les silences.
//   P4 — un des trois en-têtes de verrou est renommé. ROUGE: `precedence_tail`
//        les cite mot pour mot, et l'empreinte d'arbitrage change.
//   P5 — les verrous quittent la queue du message. ROUGE: « la contrainte la
//        plus proche de la fin est la plus contraignante ».

import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildHouseholdPromptBlocksV34,
  HOUSEHOLD_PROMPT_V34_VERSION,
  PORTION_V34_MIN_MOUTHS,
} from "./household_prompt_v34.ts";
import {
  HOUSEHOLD_PROMPT_VERSION,
  LIGHT_DISH_MIN_KCAL_PER_100G,
  NORMAL_DISH_MIN_KCAL_PER_100G,
} from "./household_meal_generation.ts";
import type { PortionMember } from "./household_portions.ts";
import type { HouseholdCell } from "./household_cells.ts";
import { householdCells } from "./household_cells.ts";
import { resolveWindowPresence } from "./household_presence.ts";
import { parseMemberAway } from "./household_presence.ts";

// ---------------------------------------------------------------------------
// Fabriques
// ---------------------------------------------------------------------------

const RYTHME3 = [
  { slot: "breakfast" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

const PRESENCE = resolveWindowPresence({
  members: [{ memberId: "m-a", displayName: "Julie", away: parseMemberAway([]) }],
  rhythm: RYTHME3,
  windowDays: ["mon"],
});

function member(over: Partial<PortionMember> & { memberId: string; displayName: string }): PortionMember {
  return {
    goal: null,
    ageState: "adult",
    body: null,
    lightSlots: [],
    eatingSlots: null,
    habits: [],
    habitNote: null,
    requiredDensity: null,
    ...over,
  } as PortionMember;
}

const JULIE = member({ memberId: "m-a", displayName: "Julie" });
const MARC = member({ memberId: "m-b", displayName: "Marc", goal: "fat_loss" });

function gridFor(
  mouths: { memberId: string; diet?: "vegan" | "vegetarian" | null; lightSlots?: string[] }[],
  gridSlots = ["breakfast", "lunch", "dinner"],
): HouseholdCell[] {
  return householdCells({
    mouths: mouths.map((m) => ({
      memberId: m.memberId,
      eatingSlots: null,
      away: [],
      lightSlots: m.lightSlots ?? [],
      diet: m.diet ?? null,
      ownMealSlots: [],
    })),
    houseRhythm: RYTHME3,
    windowDays: ["mon"],
    gridSlots,
    spentSlots: { day: null, slots: [] },
    cookOnlyDay: null,
  }).cells;
}

function build(over: Record<string, unknown> = {}) {
  const members = (over.members as PortionMember[]) ?? [JULIE, MARC];
  return buildHouseholdPromptBlocksV34({
    sizingPath: "portion_v1" as const,
    members,
    cells: gridFor(members.map((m) => ({ memberId: m.memberId }))),
    cardFacts: {},
    ruleHolders: [],
    traditions: [],
    daysInWindow: ["mon"],
    envyLine: null,
    restrictions: [],
    presence: PRESENCE,
    merge: null,
    unmerge: null,
    cooking: "one_dish",
    divergingCount: 0,
    weightGroups: 1,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    medicalMouths: [],
    crossContactUnnamedMedical: 0,
    kitchenEquipment: null,
    dietBlock: "",
    notes: [],
    voices: [],
    // deno-lint-ignore no-explicit-any
    ...(over as any),
  });
}

// ---------------------------------------------------------------------------
// ① LE CAS QUI PASSE
// ---------------------------------------------------------------------------

Deno.test("le_brief_ordinaire — les quatre temps sont là, dans l'ordre", () => {
  const { userSuffix, systemSuffix, promptVersion } = build();
  const a = userSuffix.indexOf("== THE HOUSEHOLD — ONE CARD PER PERSON ==");
  const b = userSuffix.indexOf("== THE CALENDAR — WHO EATS, CELL BY CELL ==");
  const c = userSuffix.indexOf("== THE METHOD, IN ORDER ==");
  const d = userSuffix.indexOf("== WRITE ONE STANDARD RECIPE PER DISH ==");
  assert(a >= 0 && b > a && c > b && d > c, "l'ordre A→B→C→D n'est pas tenu");
  assertEquals(promptVersion, HOUSEHOLD_PROMPT_V34_VERSION);
  assert(promptVersion !== HOUSEHOLD_PROMPT_VERSION, "les deux structures partagent un jeton");
  assert(systemSuffix.length > 0);
});

Deno.test("une carte par personne, exactement, avec son id", () => {
  const { userSuffix } = build();
  for (const m of [JULIE, MARC]) {
    const head = `== ${m.displayName} (${m.memberId}) ==`;
    assertEquals(
      userSuffix.split(head).length - 1,
      1,
      `${m.displayName} doit avoir exactement une carte`,
    );
  }
});

// ---------------------------------------------------------------------------
// ② CE QUI NE DOIT PLUS JAMAIS Y ÊTRE
// ---------------------------------------------------------------------------

Deno.test("⛔ AUCUN FAIT DE CORPS, AUCUN CHIFFRE DE PERSONNE", () => {
  const { userSuffix, systemSuffix } = build({
    members: [
      member({
        memberId: "m-a",
        displayName: "Julie",
        // ⚠️ UN CORPS COMPLET, EXPRÈS: la garde doit être éprouvée sur une
        // bouche dont v33 AURAIT écrit les faits, pas sur une fiche vide.
        body: {
          heightCm: 168,
          ageBand: "adult",
          gender: "female",
          latestWeight: { valueKg: 58, weekOf: "2026-08-31" },
          declaredWeightKg: 58,
          latestWaist: null,
          restrictionFlag: false,
        } as unknown as PortionMember["body"],
      }),
      MARC,
    ],
  });
  const all = `${userSuffix}\n${systemSuffix}`;
  for (const forbidden of ["[height", "weight ", "age band", " cm", " kg"]) {
    assert(!all.includes(forbidden), `le brief porte « ${forbidden} »`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 — LA GARDE CHANGE DE FORME, ET ELLE GARDE PLUS, PAS MOINS
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ ELLE LISTAIT DEUX NOMBRES AUTORISÉS (100 et 60). C'était une liste
// nominative, et une liste nominative ne garde que ce qu'elle nomme: elle est
// devenue fausse le jour même où deux choses légitimes sont entrées dans le
// brief —
//   · la MÉTHODE de calcul de la densité, qui donne un exemple chiffré
//     (« Dry rice is 350 kcal per 100 g; cooked it is about 130 »);
//   · le COULOIR de densité, dont la borne haute est un nombre par moment.
// Les deux sont des DENSITÉS. Aucun n'est le nombre qu'on protège.
//
// ⛔ CE QU'ON PROTÈGE, C'EST UN KCAL QUI DÉCRIT QUELQU'UN. « genty needs 2 400
// kcal » rendrait le corps que v33 a retiré à tout le monde exprès. La règle
// juste est donc de FORME, pas de valeur: tout `kcal` du brief doit être suivi
// de `per 100 g`. C'est la règle que `METHODE-GENERATION-DE-PLAN-SOLO.md` § 6
// bis énonce, et elle mord sur une population que la liste laissait passer —
// un « 2 400 kcal » nu aurait été refusé par les deux, mais un « 1 800 kcal
// par jour » ne figurait dans aucune liste.
Deno.test("⛔ AUCUN KCAL NU — tout chiffre du brief est une DENSITÉ", () => {
  const { userSuffix, systemSuffix } = build();
  const all = `${userSuffix}\n${systemSuffix}`;
  const nus = all.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/g);
  assertEquals(nus, null, `un kcal NU est dans le brief: ${nus?.join(", ")}`);
  // ⚠️ ET LA GARDE TROUVE QUELQUE CHOSE: une garde qui ne voit jamais rien ne
  // prouve rien. Les deux planchers y sont, et ils y sont en densité.
  const found = [...all.matchAll(/(\d+)\s*kcal\s*per\s*100\s*g/g)].map((m) => Number(m[1]));
  assert(found.includes(NORMAL_DISH_MIN_KCAL_PER_100G), "le plancher normal a disparu");
  assert(found.includes(LIGHT_DISH_MIN_KCAL_PER_100G), "le plancher léger a disparu");
  // ⛔ ET LA CONTRE-ÉPREUVE: la garde REFUSE un kcal nu qu'on lui glisse.
  assert(
    `${all} genty needs 2400 kcal`.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/g) !== null,
    "la garde ne mord plus sur un kcal nu",
  );
});

Deno.test("⛔ NI BOÎTE, NI PORTION NOMMÉE — le moteur autore les couvercles", () => {
  const { userSuffix, systemSuffix } = build();
  const all = `${userSuffix}\n${systemSuffix}`;
  for (const forbidden of [
    "ONE BOX PER GROUP",
    "WEIGH IT ONCE",
    "member_portions",
    '"boxes"',
    "box lids",
  ]) {
    assert(!all.includes(forbidden), `le brief demande encore « ${forbidden} »`);
  }
});

// ---------------------------------------------------------------------------
// ③ LE CALENDRIER
// ---------------------------------------------------------------------------

Deno.test("le calendrier NOMME les cases vides", () => {
  const { userSuffix } = build({
    cells: gridFor(
      [{ memberId: "m-a" }, { memberId: "m-b" }],
      ["breakfast", "lunch", "dinner", "before_bed"],
    ),
  });
  assert(
    userSuffix.includes("mon before_bed: nobody eats — write NO dish."),
    "une case vide n'est pas nommée: le modèle comblera le silence",
  );
  assert(userSuffix.includes("mon lunch: 2 eat — Julie, Marc."));
});

Deno.test("le calendrier dit le nombre de mangeurs ET que ça ne change pas la recette", () => {
  const { userSuffix } = build();
  assert(
    userSuffix.includes(
      "The number of eaters NEVER changes a recipe: every dish is written for ONE.",
    ),
    "sans cette phrase, « 4 mangent » se lit « écris une recette pour quatre »",
  );
});

Deno.test("une case LÉGÈRE est marquée, et seulement si tous l'ont demandé", () => {
  const tous = build({
    cells: gridFor([
      { memberId: "m-a", lightSlots: ["dinner"] },
      { memberId: "m-b", lightSlots: ["dinner"] },
    ]),
  });
  assert(tous.userSuffix.includes("mon dinner (light):"));
  const unSeul = build({
    cells: gridFor([
      { memberId: "m-a", lightSlots: ["dinner"] },
      { memberId: "m-b" },
    ]),
  });
  assert(
    !unSeul.userSuffix.includes("mon dinner (light):"),
    "une seule demande suffit à alléger le dîner de l'autre",
  );
});

Deno.test("le calendrier COMMANDE le plat à part, et nomme sa bouche", () => {
  const { userSuffix } = build({
    cells: gridFor([
      { memberId: "m-a" },
      { memberId: "m-b" },
      { memberId: "m-c", diet: "vegan" },
    ]),
    members: [JULIE, MARC, member({ memberId: "m-c", displayName: "Nora" })],
  });
  assert(
    userSuffix.includes("A dish of their own is ordered for Nora (m-c)."),
    "le plat à part n'est pas commandé nommément",
  );
});

// ---------------------------------------------------------------------------
// ④ LES VERROUS: EN QUEUE, ET LEURS EN-TÊTES INTACTS
// ---------------------------------------------------------------------------

Deno.test("les trois en-têtes de verrou sont VERBATIM — l'arbitrage les cite", () => {
  const { userSuffix } = build({
    dietBlock: "== WHAT THE SHARED BASE MUST RESPECT ==\nvegan",
    restrictions: [{ memberId: "m-a", displayName: "Julie", label: "Nutella" }],
    medicalMouths: [{ memberId: "m-a", displayName: "Julie" }],
    dishBearers: [{ memberId: "m-b", displayName: "Marc" }],
    dedicatedDishesAsked: 1,
  });
  for (const header of [
    "WHAT THE SHARED BASE MUST RESPECT",
    "HOUSE RULES",
    "THE SAME KITCHEN, TWO DISHES",
  ]) {
    assert(userSuffix.includes(header), `l'en-tête « ${header} » a bougé`);
  }
});

Deno.test("les verrous restent EN QUEUE, après la méthode et le calendrier", () => {
  const { userSuffix } = build({
    dietBlock: "== WHAT THE SHARED BASE MUST RESPECT ==\nvegan",
    restrictions: [{ memberId: "m-a", displayName: "Julie", label: "Nutella" }],
  });
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ `lastIndexOf`, ET C'EST TOUT LE TEST — mesuré le 2026-09-08.
  // ══════════════════════════════════════════════════════════════════════
  // Première écriture: `indexOf`. Elle trouvait les en-têtes dans la MÉTHODE
  // (l'étape 1 les nomme en toutes lettres pour y renvoyer), jamais dans les
  // blocs. Intervertir les deux verrous laissait donc le test VERT — une garde
  // morte, qui a l'air d'une garde qui marche. Les deux positions doivent être
  // celles des BLOCS, c'est-à-dire les DERNIÈRES occurrences.
  const method = userSuffix.indexOf("== THE METHOD, IN ORDER ==");
  const calendar = userSuffix.indexOf("== THE CALENDAR");
  const diet = userSuffix.lastIndexOf("WHAT THE SHARED BASE MUST RESPECT");
  const house = userSuffix.lastIndexOf("HOUSE RULES");
  assert(diet > method && diet > calendar, "le régime a quitté la queue");
  assert(
    house > diet,
    "les règles de maison passent AVANT le régime: la contrainte la plus " +
      "proche de la fin est lue comme la plus contraignante",
  );
  // ⚠️ ET LES DEUX SONT BIEN DEUX ENDROITS DIFFÉRENTS. Sans cette ligne, un
  // brief qui aurait perdu ses blocs de verrou passerait encore: les mentions
  // de la méthode suffiraient à ordonner les index.
  assert(
    diet > userSuffix.indexOf("WHAT THE SHARED BASE MUST RESPECT"),
    "le bloc de régime a disparu: seule sa mention dans la méthode subsiste",
  );
  assert(
    house > userSuffix.indexOf("HOUSE RULES"),
    "le bloc des règles de maison a disparu: seule sa mention subsiste",
  );
});

Deno.test("la méthode NOMME les verrous au lieu de les déplacer", () => {
  const { userSuffix } = build();
  assert(
    userSuffix.includes(
      "WHAT THE SHARED BASE MUST RESPECT, HOUSE RULES and THE SAME KITCHEN,",
    ),
    "l'étape 1 ne renvoie plus aux verrous",
  );
});

// ---------------------------------------------------------------------------
// ⑤ LA MÉTHODE
// ---------------------------------------------------------------------------

Deno.test("les six étapes sont là, numérotées, dans l'ordre", () => {
  const { userSuffix } = build();
  let last = -1;
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const at = userSuffix.indexOf(`\n${n}. `);
    assert(at > last, `l'étape ${n} manque ou est dans le désordre`);
    last = at;
  }
});

Deno.test("la méthode ne RÉPÈTE pas la règle du plat: elle y renvoie", () => {
  const { userSuffix } = build();
  const method = userSuffix.slice(
    userSuffix.indexOf("== THE METHOD, IN ORDER =="),
    userSuffix.indexOf("== WRITE ONE STANDARD RECIPE PER DISH =="),
  );
  // ⛔ DEUX ÉCRITURES D'UNE MÊME RÈGLE FINISSENT PAR DIVERGER. La méthode dit
  // « voir le bloc suivant »; le bloc porte la règle et ses deux planchers.
  assert(
    !/kcal per 100 g/.test(method),
    "la méthode recopie les planchers au lieu d'y renvoyer",
  );
  assert(
    method.includes("see WRITE ONE STANDARD RECIPE PER DISH"),
    "la méthode ne renvoie pas au bloc qui porte la règle",
  );
});

Deno.test("l'auto-contrôle est la DERNIÈRE étape, et il nomme les cases vides", () => {
  const { userSuffix } = build();
  const check = userSuffix.slice(userSuffix.indexOf("\n6. "));
  assert(check.includes("no cell it leaves"), "l'auto-contrôle ignore les cases vides");
  assert(check.includes("forbidden to one of ITS eaters"));
  assert(check.includes("a number, a unit and a state"));
});

// ---------------------------------------------------------------------------
// ⑥ LA BORNE
// ---------------------------------------------------------------------------

Deno.test("la borne de bouches est une CONSTANTE épinglée", () => {
  assertEquals(PORTION_V34_MIN_MOUTHS, 2);
});

// ---------------------------------------------------------------------------
// ⑦ LE CÂBLAGE — un brief servi à personne est un document
// ---------------------------------------------------------------------------

Deno.test("CÂBLAGE — v34 est servi sur le chemin armé, et les porteurs viennent de la GRILLE", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const verdictAt = src.indexOf("const useV34 = sizing.path === \"portion_v1\" &&");
  const bearersAt = src.indexOf("const v34DishBearers = platedMembers");
  const inputAt = src.indexOf("const householdPromptInput = {");
  const buildAt = src.indexOf("const household = useV34");

  assert(verdictAt > 0, "le verdict v34 n'est pas calculé");
  assert(bearersAt > verdictAt, "les porteurs sont décidés avant le verdict");
  assert(inputAt > bearersAt, "les porteurs sont décidés APRÈS l'objet d'entrée");
  assert(buildAt > inputAt, "le constructeur est choisi avant son entrée");

  // ⛔ UN SEUL VERDICT. Deux critères feraient un prompt et un parseur qui ne
  // parlent pas du même plan.
  assertEquals(
    src.split("const useV34 =").length - 1,
    1,
    "`useV34` est déclaré deux fois: deux idées du chemin servi",
  );

  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ AU PREMIER TIR v34 (2026-09-08, foyer `quatre`)
  // ══════════════════════════════════════════════════════════════════════
  // Le calendrier disait « A dish of their own is ordered for Nora » et le
  // modèle n'a écrit AUCUN plat dédié: `dishBearers` venait encore de
  // `dishBearingMembers` (règle R4/R5), qui ne nomme personne sur ce foyer,
  // donc ni la consigne `A DISH OF THEIR OWN` ni la clé `for_member_id`
  // n'étaient servies. Le calendrier commandait un plat dont rien ne disait la
  // forme.
  assert(
    src.includes("        ? v34DishBearers"),
    "les porteurs de v34 ne viennent pas de la grille: le calendrier commande " +
      "un plat que rien n'explique",
  );
  // ⚠️ ET LA LANE LEGACY GARDE LA SIENNE, octet pour octet.
  assert(
    src.includes("        : dishBearingMembers.map((m) => ({"),
    "la règle d'aujourd'hui a disparu du chemin legacy",
  );
});

Deno.test("⛔ LE PLAT PARTAGÉ PREND LA PLUS HAUTE DENSITÉ DE SES MANGEURS, jamais la moyenne", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ MESURÉ AU TIR `DENSITE` DU 2026-09-08 (foyer `quatre`)
  // ══════════════════════════════════════════════════════════════════════
  //
  // Les cartes portaient enfin la densité de chaque personne, et le plan s'est
  // beaucoup amélioré. Mais deux assiettes dépassaient encore, toujours celles
  // de la personne la plus exigeante: au déjeuner les quatre cartes demandaient
  // 105, 122, 139 et 167 kcal/100 g, et le modèle a écrit 136 — la moyenne.
  // Trois personnes servies, la quatrième avec 724 g dans l'assiette.
  //
  // ⚠️ Une exigence de densité n'est pas une préférence qu'on moyenne.
  const { userSuffix } = build();
  const message = userSuffix;
  assert(
    /HIGHEST density asked by any of its\s+"?,?\s*"?\s*eaters/.test(message) ||
      message.includes("HIGHEST density asked by any of its"),
    "la consigne du maximum a disparu du brief",
  );
  assert(
    message.includes("not the average of them"),
    "rien n'interdit plus au modèle de moyenner les exigences",
  );
  // ⛔ ET ELLE VIT DANS LA MÉTHODE, à l'étape qui compose les cases — pas dans
  // le bloc de recette, qui parle d'un plat sans savoir qui le mange.
  const methode = message.indexOf("== THE METHOD, IN ORDER ==");
  const recette = message.indexOf("WRITE ONE STANDARD RECIPE PER DISH");
  const consigne = message.indexOf("HIGHEST density asked by any of its");
  assert(methode > 0 && consigne > methode, "la consigne n'est pas dans la méthode");
  assert(consigne < recette || recette < methode, "la consigne a glissé dans le bloc de recette");
});

Deno.test("⛔ CHAQUE FAIT DE CARTE EST SUIVI DE CE QU'IL INTERDIT", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ TROUVÉ LE 2026-09-08 EN COMPARANT LES DEUX LANES
  // ══════════════════════════════════════════════════════════════════════
  //
  // v34 avait repris tous les FAITS du brief v33 sur ses cartes — le rythme,
  // l'habitude, la densité — et AUCUNE des phrases qui disent ce que chacun
  // interdit. C'est le principe que `household_portions.ts` énonce trois fois
  // dans ses propres commentaires: « une contrainte qu'on énonce sans dire ce
  // qu'elle INTERDIT est une contrainte décorative. »
  //
  // Le foyer recevait « at least 167 kcal per 100 g at lunch » au bout d'une
  // carte, et n'avait jamais lu que cette grandeur porte sur le PLAT, qu'on
  // l'atteint par ce dont le plat est FAIT, et surtout qu'on ne l'atteint PAS
  // en servant une assiette plus petite. Le modèle rendait 117.
  // ⚠️ CHAQUE CONSÉQUENCE EST GARDÉE PAR SON FAIT: sur un foyer qui ne déclare
  // ni rythme, ni habitude, ni densité, AUCUNE ne doit sortir. Une conséquence
  // servie sans le fait qui l'appelle est du bruit, et le bruit dévalue les
  // consignes qui l'entourent.
  const nu = build().userSuffix;
  assert(!nu.includes("give them NO serving at any"), "le rythme sort sans fait de rythme");
  assert(!nu.includes("reach it by serving a smaller plate"), "la densité sort sans densité");

  // ⛔ ET AVEC LES FAITS, LES TROIS SORTENT.
  const garni = build({
    members: [
      { ...JULIE, eatingSlots: ["breakfast", "lunch"], habits: [{ slot: "breakfast", kind: "own_thing", usual: "un yaourt" }] },
      MARC,
    ],
    cardFacts: {
      "m-a": {
        diet: null,
        requiredDensity: {
          named: [{ slot: "lunch", kcalPer100G: 167, minPer100G: 167, maxPer100G: 167, preferredPer100G: 167, neededMinPer100G: 167, incompatible: null, light: false }],
          floorOnly: [],
          reason: "anchored",
          gapClosed: null,
          counters: { slots: 1, above_floor: 1, days_varied: 0, capped: 0, fixed_covered: 0 },
        },
      },
    },
  }).userSuffix;
  assert(
    garni.includes("give them NO serving at any"),
    "le rythme reste un fait sans conséquence",
  );
  assert(
    // ⟳ 2026-09-10 — la carte porte le COULOIR, plus « au moins N ». Voir
    // `densityFragment`: un seul bout laisse le modèle partir de l'autre côté,
    // mesuré dans les deux sens.
    garni.includes("167 kcal per 100 g at lunch"),
    "le chiffre n'atteint pas la carte",
  );
  // ⚠️ LES DEUX LIGNES QUI COMPTENT LE PLUS: la grandeur porte sur le PLAT, et
  // on ne l'atteint pas en rétrécissant l'assiette — c'est très exactement le
  // geste que le moteur reprendra ensuite, et qu'il faut interdire au modèle.
  assert(
    garni.includes("a fact about the DISH served at that moment"),
    "rien ne dit que la densité porte sur le plat et non sur la personne",
  );
  assert(
    garni.includes("reach it by serving a smaller plate: the plate stays a plate"),
    "rien n'interdit d'atteindre la densité en rétrécissant l'assiette",
  );
});
