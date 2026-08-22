// ══════════════════════════════════════════════════════════════════════════
// `D3′` — LA POSITION DU BLOC D'ARBITRAGE, MESURÉE SUR LE PROMPT ASSEMBLÉ.
// ══════════════════════════════════════════════════════════════════════════
//
// Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `D3′`.
//
//   deno run --quiet --allow-read scripts/keel_d3_position_du_bloc_20260822.ts
//
// ⛔ CE PILOTE N'APPELLE AUCUN MODÈLE ET NE LIT AUCUNE BASE. Il ASSEMBLE le
// message utilisateur exactement comme `generate-household-meal-v1/index.ts`
// le compose (l. 4436-4441) et compte ce qui suit le bloc d'arbitrage. Le
// budget de la vague 5 est à ZÉRO génération et la base locale est éteinte.
//
// ⚠️ IL NE PEUT PAS SATISFAIRE LA RÈGLE §⑨ n° 92 — il importe
// `buildHouseholdPromptBlocks`, qui vit dans un fichier `M`. C'est le cas
// prévu par le §⑨ n° 96: une garde doit être clonable, un PILOTE qui mesure
// l'assemblage réel doit appeler l'assembleur réel, sinon il mesure une
// recopie. La GARDE de ce lot (`precedence_tail_test.ts`) est clonable, elle.
//
// ── CE QU'UN « BLOC » EST ICI, ET C'EST MÉCANIQUE ─────────────────────────
// Un morceau séparé par `\n\n` dont la PREMIÈRE ligne est un en-tête, c'est-
// à-dire `== … ==`, `-- … --`, ou `CONTENT_LANGUAGE:`. Aucune heuristique,
// aucun matcher: on lit des délimiteurs que le dépôt écrit lui-même.

import type { PortionMember } from "../supabase/functions/_shared/keel/household_portions.ts";
import { householdDietBlock } from "../supabase/functions/_shared/keel/household_diet.ts";
import { buildHouseholdPromptBlocks } from "../supabase/functions/_shared/keel/household_meal_generation.ts";
import {
  parseMemberAway,
  resolveWindowPresence,
  type WindowPresence,
} from "../supabase/functions/_shared/keel/household_presence.ts";
import {
  appendContentLanguageBlock,
} from "../supabase/functions/_shared/keel/locale.ts";
// ── `D3′` · LE MODULE DU LOT, POUR LA MOITIÉ « APRÈS » DE CE PILOTE ────────
import {
  buildPrecedenceBlock,
  countPrecedenceRanks,
  movePrecedenceToTail,
  precedenceTailVerdict,
} from "../supabase/functions/_shared/keel/precedence_tail.ts";
// ⛔ LES DEUX LISTES SONT DES LITTÉRAUX, PAS UN IMPORT. Importer
// `meal_generation.ts` ici crée un cycle avec `household_portions.ts` et fait
// tomber `cookingShapeLines` en TDZ (mesuré, pas supposé). Leur CONTENU
// n'entre pas dans la mesure: seul l'en-tête `CONTENT_LANGUAGE:` compte, et
// il est le même quelle que soit la liste.
const MEAL_TRANSLATABLE_FIELDS: readonly string[] = ["title"];
const MEAL_TOKEN_FIELDS: readonly string[] = ["day"];

// ⛔ RECOPIÉ EN LITTÉRAL, ET C'EST VOULU. `PRECEDENCE_BLOCK` n'est pas exporté
// de `meal_generation.ts`; l'exporter élargirait un fichier non commitable. Ce
// littéral est l'EN-TÊTE, pas le bloc: s'il diverge, le pilote rend
// `precedence: absent` et se dénonce lui-même au lieu de mentir.
const PRECEDENCE_HEADER = "-- WHEN TWO OF THE LINES ABOVE WANT DIFFERENT THINGS --";
const DIET_HEADER = "== WHAT THE SHARED DISH MUST RESPECT ==";

// ⛔ DEUX EN-TÊTES DU DÉPÔT NE SONT PAS DÉLIMITÉS PAR `==`, et les rater
// SOUS-COMPTERAIT le bloc le plus important de tous — les règles de maison.
// Ils sont recopiés en LITTÉRAL depuis `household_meal_generation.ts:934` et
// `household_portions.ts:1264`, jamais devinés par une heuristique.
const PROSE_HEADERS: readonly string[] = [
  "HOUSE RULES — foods this household does not serve to certain people.",
  "HOUSEHOLD SERVING PLAN — one cooking session, portions that differ.",
];

const HEADER_RE = /^(==\s.+\s==|--\s.+\s--|CONTENT_LANGUAGE:)$/;

function isHeader(line: string): boolean {
  return HEADER_RE.test(line) || PROSE_HEADERS.includes(line);
}

function headersAfter(message: string): { after: string[]; found: boolean } {
  const chunks = message.split("\n\n");
  const headers: { header: string; index: number }[] = [];
  chunks.forEach((c, i) => {
    const first = c.split("\n")[0]?.trim() ?? "";
    if (isHeader(first)) headers.push({ header: first, index: i });
  });
  const at = headers.findIndex((h) => h.header === PRECEDENCE_HEADER);
  if (at < 0) return { after: [], found: false };
  return { after: headers.slice(at + 1).map((h) => h.header), found: true };
}

// ── LA FIXTURE, ET SES TROIS BOUCHES PROTÉGÉES ────────────────────────────
// Anouk est MINEURE, Malo est VÉGANE, Yanis est VÉGÉTARIEN. Aucune ne doit
// perdre son rang: c'est l'interdit écrit de ce lot, et la fixture est là pour
// qu'il se mesure au lieu de se promettre.
const CAMILLE: PortionMember = {
  memberId: "m-camille", displayName: "Camille", goal: "fat_loss",
  ageState: "adult", body: null, eatingSlots: null, habits: [], habitNote: null,
};
const MALO: PortionMember = {
  memberId: "m-malo", displayName: "Malo", goal: "muscle_gain",
  ageState: "adult", body: null, eatingSlots: null, habits: [], habitNote: null,
};
const YANIS: PortionMember = {
  memberId: "m-yanis", displayName: "Yanis", goal: null,
  ageState: "adult", body: null, eatingSlots: null, habits: [], habitNote: null,
};
const ANOUK: PortionMember = {
  memberId: "m-anouk", displayName: "Anouk", goal: null,
  ageState: "minor", body: null, eatingSlots: null, habits: [], habitNote: null,
};

const NOBODY_AWAY: WindowPresence = resolveWindowPresence({
  members: [{ memberId: "m-camille", displayName: "Camille", away: parseMemberAway([]) }],
  rhythm: [
    { slot: "breakfast", size: null },
    { slot: "lunch", size: null },
    { slot: "dinner", size: null },
  ],
  windowDays: ["mon", "tue", "wed", "thu", "fri"],
});

const DIET_BLOCK = householdDietBlock({
  strictest: "vegan",
  heldBy: ["Malo"],
  divergingNames: [],
});

type Case = { name: string; suffix: string };

function household(name: string, over: Record<string, unknown>): Case {
  const base = {
    members: [CAMILLE, MALO, YANIS, ANOUK],
    ruleHolders: [],
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri"],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
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
    voices: [],
  };
  // deno-lint-ignore no-explicit-any
  const { userSuffix } = buildHouseholdPromptBlocks({ ...base, ...over } as any);
  return { name, suffix: userSuffix };
}

// ⛔ LE TRONC EST CELUI DE `buildMealPrompt`, RÉDUIT À SA QUEUE. On ne rejoue
// pas les 900 lignes du prompt: seule la QUEUE décide de la position, et c'est
// elle qu'on assemble — `== WHAT TO COOK ==`, puis le bloc d'arbitrage, puis
// le bloc de langue, exactement comme aux l. 3767-3833 de `meal_generation.ts`.
// ⛔ LE TEXTE D'AVANT, RECOPIÉ EN LITTÉRAL. C'est l'état du 2026-08-22 avant
// `D3′`: la `mesure AVANT` doit rester rejouable après le lot, sinon on ne
// pourra plus jamais comparer les deux.
const PRECEDENCE_BODY = [
  PRECEDENCE_HEADER,
  "They will. This order decides, and nothing in this message outranks it.",
  "1. The hard constraints and the diet at the VERY TOP of this message.",
].join("\n");

function troncUserMessage(): string {
  return appendContentLanguageBlock(
    ["== WHAT TO COOK ==", "mode: cook", "", PRECEDENCE_BODY].join("\n"),
    "fr-FR",
    MEAL_TRANSLATABLE_FIELDS,
    MEAL_TOKEN_FIELDS,
  );
}

function assemble(suffix: string, extras: string[]): string {
  // La composition littérale de `householdUserMessage`
  // (`generate-household-meal-v1/index.ts:4436`).
  return appendContentLanguageBlock(
    `${troncUserMessage()}${suffix}${extras.map((e) => `\n\n${e}`).join("")}`,
    "fr-FR",
    MEAL_TRANSLATABLE_FIELDS,
    MEAL_TOKEN_FIELDS,
  );
}

const cases: Case[] = [
  household("① minimal — 4 bouches, rien de déclaré", {}),
  household("② nominal — régime végane déclaré", { dietBlock: DIET_BLOCK }),
  household("③ règles de maison + régime", {
    dietBlock: DIET_BLOCK,
    restrictions: [{ memberId: "m-anouk", memberDisplayName: "Anouk", label: "nutella" }],
  }),
  household("④ maximal — régime, règles, cuisine, plat dédié, médical", {
    dietBlock: DIET_BLOCK,
    restrictions: [{ memberId: "m-anouk", memberDisplayName: "Anouk", label: "nutella" }],
    ruleHolders: [{ memberId: "m-anouk", displayName: "Anouk" }],
    kitchenEquipment: ["oven"],
    dishBearers: [{ memberId: "m-yanis", displayName: "Yanis" }],
    dedicatedDishesAsked: 1,
    divergingCount: 1,
    cooking: "one_session",
    medicalMouths: [{ memberId: "m-anouk", displayName: "Anouk" }],
    envyLine: "on a envie de gratin",
    traditions: [{ day: "sun", label: "rôti" }],
  }),
];

console.log("══ D3′ · POSITION DU BLOC D'ARBITRAGE — mesure sur le prompt ASSEMBLÉ ══");
console.log("");
console.log("LANE FOYER (generate-household-meal-v1) — blocs APRÈS le bloc d'arbitrage");
console.log("");

let min = Infinity;
let max = -Infinity;
for (const c of cases) {
  const msg = assemble(c.suffix, []);
  const { after, found } = headersAfter(msg);
  // Le bloc de langue est déclaré « consigne de LANGUE, pas de contenu » par
  // `household_meal_generation.ts`. Il est compté À PART, jamais avec.
  const content = after.filter((h) => h !== "CONTENT_LANGUAGE:");
  min = Math.min(min, content.length);
  max = Math.max(max, content.length);
  console.log(`  ${c.name}`);
  console.log(`    trouvé: ${found} · blocs de contenu après: ${content.length}`);
  for (const h of content) console.log(`      · ${h}`);
  // ① LA PHRASE DE RANG 1 EST-ELLE VRAIE ? Le régime est-il « tout en haut » ?
  const iPrec = msg.indexOf(PRECEDENCE_HEADER);
  const iDiet = msg.indexOf(DIET_HEADER);
  if (iDiet >= 0) {
    const lines = msg.slice(Math.min(iPrec, iDiet), Math.max(iPrec, iDiet)).split("\n").length - 1;
    console.log(
      `    ⛔ rang 1 dit « at the VERY TOP » — le régime est ${
        iDiet > iPrec ? "SOUS" : "au-dessus de"
      } le bloc, à ${lines} lignes`,
    );
  } else {
    console.log("    (aucun régime déclaré dans ce cas)");
  }
  console.log("");
}
console.log(`  ⇒ étendue mesurée: ${min} à ${max} blocs de contenu après.`);
console.log("");
console.log("  ⚠️ CONTRE-ÉPREUVE — TOUS les morceaux `\\n\\n` après le bloc, cas ④,");
console.log("     en-tête reconnu ou non. C'est ce qui empêche la taxonomie de");
console.log("     sous-compter en silence.");
{
  const msg = assemble(cases[3].suffix, []);
  const chunks = msg.split("\n\n");
  const at = chunks.findIndex((c) => c.split("\n")[0]?.trim() === PRECEDENCE_HEADER);
  const tail = chunks.slice(at + 1);
  console.log(`     morceaux après: ${tail.length}`);
  for (const c of tail) {
    const first = c.split("\n")[0]?.trim() ?? "";
    console.log(`       ${isHeader(first) ? "[EN-TÊTE]" : "[  suite ]"} ${first.slice(0, 72)}`);
  }
}
console.log("");
console.log("LANE SOLO (generate-meal-v1) — la même queue, sans suffixe de foyer");
{
  const msg = appendContentLanguageBlock(
    troncUserMessage(),
    "fr-FR",
    MEAL_TRANSLATABLE_FIELDS,
    MEAL_TOKEN_FIELDS,
  );
  const { after } = headersAfter(msg);
  const content = after.filter((h) => h !== "CONTENT_LANGUAGE:");
  console.log(`  blocs de contenu après: ${content.length}`);
  console.log(
    "  ⚠️ MAIS LA STRUCTURE LE PERMET: `generate-meal-v1/index.ts:1999` colle",
  );
  console.log(
    "     `draftNoteSuffix` + `hungerSuffix` + `extra` APRÈS le bloc. Trois",
  );
  console.log("     places, vides sur le corpus mesuré, jamais interdites.");
}

// ══════════════════════════════════════════════════════════════════════════
// LA MOITIÉ « APRÈS » — le même assemblage, avec le geste du lot
// ══════════════════════════════════════════════════════════════════════════
console.log("");
console.log("══ D3′ · mesure APRÈS — le même assemblage + `movePrecedenceToTail` ══");
console.log("");

let apresMax = 0;
for (const c of cases) {
  // Le tronc porte la variante SOLO (c'est ce que `buildMealPrompt` pose);
  // le geste du lot la retire et pose la variante FOYER en queue.
  const brut = `${
    appendContentLanguageBlock(
      ["== WHAT TO COOK ==", "mode: cook", "", buildPrecedenceBlock("solo")].join("\n"),
      "fr-FR",
      MEAL_TRANSLATABLE_FIELDS,
      MEAL_TOKEN_FIELDS,
    )
  }${c.suffix}`;
  const message = appendContentLanguageBlock(
    movePrecedenceToTail(brut, "household"),
    "fr-FR",
    MEAL_TRANSLATABLE_FIELDS,
    MEAL_TOKEN_FIELDS,
  );
  const v = precedenceTailVerdict(message);
  apresMax = Math.max(apresMax, v.contentBlocksAfter);
  console.log(`  ${c.name}`);
  console.log(
    `    place: ${v.verdict} · exact: ${v.exact} · blocs de contenu après: ${v.contentBlocksAfter}`,
  );
  for (const h of v.headersAfter) console.log(`      · ${h}`);
  const dernier = v.lastContentBlock.toLowerCase();
  console.log(
    `    dernier paragraphe de contenu — allergie: ${
      dernier.includes("allerg") ? "oui" : "NON"
    } · médical: ${dernier.includes("medical") ? "oui" : "NON"}`,
  );
  // ⛔ LE RÉGIME N'EST PLUS DÉSIGNÉ PAR UNE POSITION: on vérifie que le bloc
  // le NOMME, au lieu de compter des lignes vers un « tout en haut » faux.
  const flat = message.replace(/\s+/g, " ");
  console.log(
    `    le rang 1 cite: ${
      [
        "WHAT THE SHARED DISH MUST RESPECT",
        "HOUSE RULES",
        "THE SAME KITCHEN, TWO DISHES",
      ].filter((h) => flat.includes(`"${h}"`) || flat.includes(`\u201c${h}`)).length
    }/3 en-têtes de verrou (cités entre guillemets dans le bloc)`,
  );
  console.log("");
}
console.log(`  ⇒ SEUIL « 0 bloc de contenu après, lane foyer »: max mesuré = ${apresMax} ⇒ ${
  apresMax === 0 ? "ATTEINT" : "MANQUÉ"
}`);

// ══════════════════════════════════════════════════════════════════════════
// LE COMPTEUR À DEUX POPULATIONS — sur des objets, jamais sur une déclaration
// ══════════════════════════════════════════════════════════════════════════
console.log("");
console.log("══ D3′ · compteur de rangs, DEUX populations (somme = 5) ══");
console.log("");
const situations: { nom: string; o: Parameters<typeof countPrecedenceRanks>[0] }[] = [
  {
    nom: "① foyer nu (rien de déclaré)",
    o: { locks: 0, coachLines: 0, kitchenAndWeek: 0, writtenBySelf: 0, wantedThisTime: 0 },
  },
  {
    nom: "② régime + règle de maison, rien d'autre",
    o: { locks: 2, coachLines: 0, kitchenAndWeek: 0, writtenBySelf: 0, wantedThisTime: 0 },
  },
  {
    nom: "③ foyer de la fixture (verrous, cuisine, envie)",
    o: { locks: 3, coachLines: 0, kitchenAndWeek: 3, writtenBySelf: 0, wantedThisTime: 1 },
  },
  {
    nom: "④ foyer complet",
    o: { locks: 3, coachLines: 4, kitchenAndWeek: 3, writtenBySelf: 2, wantedThisTime: 1 },
  },
];
for (const s of situations) {
  const c = countPrecedenceRanks(s.o);
  console.log(
    `  ${s.nom}\n    with_object=${c.withObject} · without_object=${c.withoutObject} · somme=${
      c.withObject + c.withoutObject
    } · ${JSON.stringify(c.byRank)}`,
  );
}
const nonNulsDesDeuxCotes = situations
  .map((s) => countPrecedenceRanks(s.o))
  .filter((c) => c.withObject > 0 && c.withoutObject > 0).length;
console.log("");
console.log(
  `  ⇒ SEUIL « les deux populations non nulles sur au moins un cas »: ${nonNulsDesDeuxCotes} cas ⇒ ${
    nonNulsDesDeuxCotes > 0 ? "ATTEINT" : "MANQUÉ"
  }`,
);
