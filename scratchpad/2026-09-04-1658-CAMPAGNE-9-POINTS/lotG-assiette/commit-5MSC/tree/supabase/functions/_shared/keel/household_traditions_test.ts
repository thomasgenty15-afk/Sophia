// ③ LES JOURS DE TRADITION — les tests tiennent des DÉCISIONS, pas des valeurs.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type HouseholdTradition,
  MAX_TRADITIONS,
  parseTraditions,
  TRADITION_VERDICTS,
  traditionBlock,
  traditionCounts,
  traditionHonoured,
  traditionOutcomes,
  traditionsInWindow,
} from "./household_traditions.ts";

const SUNDAY_ROAST: HouseholdTradition = {
  weekday: "sun",
  slot: "dinner",
  label: "rôti",
};
const FRIDAY_FISH: HouseholdTradition = {
  weekday: "fri",
  slot: "dinner",
  label: "poisson",
};
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ---------------------------------------------------------------------------
// LA LECTURE
// ---------------------------------------------------------------------------

Deno.test("③ une entrée illisible tombe SEULE et laisse ses voisines", () => {
  // Le patron `parseAwayDays`. Une tradition illisible qui emporterait les
  // deux autres ferait composer par-dessus deux jours que le foyer a
  // verrouillés — le défaut exact que ce lot corrige.
  const got = parseTraditions([
    { weekday: "sun", slot: "dinner", label: "rôti" },
    { weekday: "funday", slot: "dinner", label: "n'importe quoi" },
    { weekday: "fri", slot: "brunch", label: "n'importe quoi" },
    { weekday: "fri", slot: "dinner", label: "poisson" },
  ]);
  assertEquals(got, [SUNDAY_ROAST, FRIDAY_FISH]);
});

Deno.test("⛔ ③ UN LIBELLÉ VIDE N'EST PAS UNE TRADITION", () => {
  // C'est la garde la plus importante de la lecture, et elle n'est pas
  // cosmétique: un motif construit sur une chaîne vide matche TOUT, donc une
  // tradition sans mot déclarerait honoré n'importe quel plat. Même garde que
  // « un libellé vide ne devient pas un terme de verrou » pour les règles de
  // maison.
  assertEquals(parseTraditions([{ weekday: "sun", slot: "dinner", label: "" }]), []);
  assertEquals(parseTraditions([{ weekday: "sun", slot: "dinner", label: "   " }]), []);
  assertEquals(parseTraditions([{ weekday: "sun", slot: "dinner" }]), []);
});

Deno.test("③ une seule tradition par case, et le plafond est REAPPLIQUÉ à la lecture", () => {
  // Deux mots pour un même dîner demanderaient au modèle deux plats sur une
  // case qui n'en porte qu'un, et le vérificateur en déclarerait un manqué
  // quoi qu'il compose.
  const doubled = parseTraditions([
    { weekday: "sun", slot: "dinner", label: "rôti" },
    { weekday: "sun", slot: "dinner", label: "poisson" },
  ]);
  assertEquals(doubled.length, 1);
  assertEquals(doubled[0].label, "rôti");

  // ⛔ LE PLAFOND EN BASE NE SUFFIT PAS. Une ligne écrite par un chemin de
  // service ne doit pas pouvoir verrouiller la semaine entière en aval.
  const many = parseTraditions(
    WEEK.map((d) => ({ weekday: d, slot: "dinner", label: "x" })),
  );
  assertEquals(many.length, MAX_TRADITIONS);
});

Deno.test("③ une entrée qui n'est pas un objet ne fait rien tomber", () => {
  assertEquals(parseTraditions(null), []);
  assertEquals(parseTraditions("sun"), []);
  assertEquals(
    parseTraditions([null, 3, ["sun"], { weekday: "sun", slot: "dinner", label: "rôti" }]),
    [SUNDAY_ROAST],
  );
});

// ---------------------------------------------------------------------------
// LE BLOC DE PROMPT
// ---------------------------------------------------------------------------

Deno.test("⛔ ③ SANS TRADITION, LE PROMPT EST CELUI D'HIER AU CARACTÈRE PRÈS", () => {
  // La contre-épreuve du lot, tenue en propriété. Sans elle, « avec » et
  // « sans » ne sont plus comparables, et le run de contrôle ne prouve rien.
  assertEquals(traditionBlock([], WEEK), { block: "", cells: 0 });
  // …et une tradition HORS FENÊTRE rend le même vide: un plan de trois jours
  // ne doit pas porter une consigne sur un dimanche qu'il ne couvre pas.
  assertEquals(traditionBlock([SUNDAY_ROAST], ["thu", "fri", "sat"]).block, "");
});

Deno.test("③ le bloc nomme le jour, le moment et les mots DU FOYER", () => {
  const got = traditionBlock([SUNDAY_ROAST], WEEK);
  assertEquals(got.cells, 1);
  assert(got.block.includes("Sunday"), "le jour doit être en toutes lettres");
  assert(got.block.includes("dinner"));
  assert(got.block.includes("rôti"), "les mots du foyer partent TELS QUELS");
  // ⛔ LA CONSIGNE DE SILENCE — le produit ne commente pas une décision
  // domestique comme si c'était la sienne.
  assert(/Do NOT mention/.test(got.block));
  // ⛔ ET IL INTERDIT LES TROIS FAUTES, pas seulement la première.
  assert(/move it to another day/.test(got.block));
  assert(/leave that slot empty/.test(got.block));
});

Deno.test("③ seules les traditions DE LA FENÊTRE entrent", () => {
  const got = traditionBlock([SUNDAY_ROAST, FRIDAY_FISH], ["fri", "sat"]);
  assertEquals(got.cells, 1);
  assert(got.block.includes("poisson"));
  assert(!got.block.includes("rôti"));
  assertEquals(traditionsInWindow([SUNDAY_ROAST, FRIDAY_FISH], ["fri", "sat"]), [
    FRIDAY_FISH,
  ]);
});

// ---------------------------------------------------------------------------
// LE VERROU — CE QU'IL VÉRIFIE
// ---------------------------------------------------------------------------

Deno.test("③ le titre OU les ingrédients suffisent, et il faut les deux chemins", () => {
  // « Rôti de porc » n'a pas besoin d'un ingrédient nommé « rôti »; « poisson »
  // peut n'apparaître que sous « cabillaud »… ou dans le titre. Ne lire qu'un
  // des deux déclarerait manqué un plat parfaitement conforme.
  assert(traditionHonoured(SUNDAY_ROAST, {
    title: "Rôti de porc et pommes de terre",
    ingredients: [{ term: "porc" }],
  }));
  assert(traditionHonoured(FRIDAY_FISH, {
    title: "Gratin du vendredi",
    ingredients: [{ term: "poisson blanc" }, { term: "crème" }],
  }));
});

Deno.test("⛔ ③ « SANS POISSON » N'HONORE PAS « VENDREDI POISSON »", () => {
  // ⚠️ C'EST LE RÉGLAGE INVERSE DE CELUI DU VERROU DES RÈGLES DE MAISON, et
  // c'est le seul cas qui teste vraiment la garde. Là-bas on cherche si un
  // aliment est MENTIONNÉ (« sans nutella » compte); ici on cherche s'il est
  // SERVI. Compter une négation comme un honneur rendrait la garde muette
  // exactement là où elle sert.
  assert(!traditionHonoured(FRIDAY_FISH, {
    title: "Gratin de légumes",
    method: "Un gratin sans poisson, pour changer",
    ingredients: [{ term: "courgette" }],
  }));
});

Deno.test("⛔ ③ LE MATCHER N'EST PAS ÉCRIT ICI — « laitue » n'est pas « lait »", () => {
  // La cicatrice « jamais de matcher maison », 12 faux positifs sur 12. On
  // appelle `findForbiddenMatches`; ce test existe pour que le jour où
  // quelqu'un le remplace par un `includes()`, il rougisse.
  const milk: HouseholdTradition = { weekday: "sun", slot: "dinner", label: "lait" };
  assert(!traditionHonoured(milk, {
    title: "Salade de laitue",
    ingredients: [{ term: "laitue" }, { term: "tomate" }],
  }));
});

// ---------------------------------------------------------------------------
// LES VERDICTS
// ---------------------------------------------------------------------------

Deno.test("⛔ ③ QUATRE VERDICTS, PAS DEUX", () => {
  // `not_composed` (le modèle n'a rien mis là) et `missed` (il a mis autre
  // chose) ne se réparent pas de la même façon; `out_of_window` n'est pas un
  // échec du tout. Deux nombres pour quatre états est le zéro ambigu que ce
  // chantier paie en boucle.
  const dishes = [
    { day: "sun", slot: "dinner", title: "Rôti de bœuf", ingredients: [{ term: "boeuf" }] },
    { day: "fri", slot: "dinner", title: "Pâtes au pesto", ingredients: [{ term: "pates" }] },
  ];
  const got = traditionOutcomes(
    [
      SUNDAY_ROAST,
      FRIDAY_FISH,
      { weekday: "mon", slot: "dinner", label: "soupe" },
    ],
    ["fri", "sat", "sun"],
    dishes,
  );
  assertEquals(got.map((o) => o.verdict), [
    "honoured",
    "composed_without_label",
    "out_of_window",
  ]);

  const empty = traditionOutcomes([SUNDAY_ROAST], ["sun"], []);
  assertEquals(empty[0].verdict, "not_composed");
});

Deno.test("③ une case à DEUX plats est honorée dès que l'un porte la tradition", () => {
  // Une case peut porter un plat dédié à une bouche en plus du plat commun.
  // Exiger que TOUS portent la tradition déclarerait manqué un dimanche où le
  // rôti est là ET où l'enfant a son assiette à part.
  const got = traditionOutcomes([SUNDAY_ROAST], ["sun"], [
    { day: "sun", slot: "dinner", title: "Purée pour Léa", ingredients: [{ term: "pomme de terre" }] },
    { day: "sun", slot: "dinner", title: "Rôti", ingredients: [{ term: "porc" }] },
  ]);
  assertEquals(got[0].verdict, "honoured");
});

Deno.test("③ le compteur porte les QUATRE verdicts, même à zéro", () => {
  const counts = traditionCounts([]);
  assertEquals(Object.keys(counts).sort(), [...TRADITION_VERDICTS].sort());
  for (const v of TRADITION_VERDICTS) assertEquals(counts[v], 0);
});

Deno.test("⛔ ③ LE VERROU NE RETIRE RIEN — c'est un arbitrage, et il est testé", () => {
  // Un verrou POSITIF ne peut pas fabriquer le plat qui manque, et retirer
  // celui qui est là sur la foi d'un matcher est la faute payée douze fois sur
  // douze. La preuve tient en une ligne: le module n'a AUCUNE fonction qui
  // rende des plats — seulement des verdicts.
  const SOURCE = Deno.readTextFileSync(
    new URL("./household_traditions.ts", import.meta.url),
  );
  assert(
    !/dishes:\s*(LockableDish|TraditionCheckableDish)\[\]/.test(SOURCE),
    "le module rend des plats: il est devenu destructif sans que la décision " +
      "soit reprise. Voir l'en-tête — un verrou positif VÉRIFIE et COMPTE.",
  );
  // …et la mesure qui permettra de trancher est bien rendue.
  assert(SOURCE.includes("export function traditionOutcomes"));
});

Deno.test("⛔ ③ LE VERDICT MESURÉ FAUX — un cabillaud EST un poisson", () => {
  // ══════════════════════════════════════════════════════════════════════
  // LE RUN RÉEL DU 2026-08-20, REJOUÉ ICI POUR QU'IL NE SE REPERDE PAS.
  // ══════════════════════════════════════════════════════════════════════
  //
  // « Vendredi poisson » posé sur le foyer `5600347f`. Le modèle a composé
  // « Cabillaud, pommes de terre et haricots verts » — la tradition honorée —
  // et le verrou a rendu `missed`, qui partait dans les `issues`. On annonçait
  // au foyer que son vendredi était cassé pendant que son poisson cuisait.
  //
  // Ce test épingle DEUX choses, et la seconde est la vraie:
  //   1. le verrou ne voit toujours pas le cabillaud — c'est une limite
  //      assumée, pas un bug à cacher;
  //   2. il ne PRÉTEND plus que la tradition a été cassée.
  const got = traditionOutcomes([FRIDAY_FISH], ["fri"], [{
    day: "fri",
    slot: "dinner",
    title: "Cabillaud, pommes de terre et haricots verts",
    ingredients: [{ term: "cabillaud" }, { term: "pomme de terre" }],
  }]);
  assertEquals(got[0].verdict, "composed_without_label");
  // ⛔ LE MOT `missed` NE DOIT PAS REVENIR DANS LE VOCABULAIRE. Il affirmait un
  // fait que ce module ne peut pas observer, et il l'affichait.
  assert(
    !(TRADITION_VERDICTS as readonly string[]).includes("missed"),
    "`missed` est de retour: il affirme que la tradition a été cassée, ce que " +
      "ce module ne sait pas — mesuré le 2026-08-20 sur un cabillaud.",
  );
});
