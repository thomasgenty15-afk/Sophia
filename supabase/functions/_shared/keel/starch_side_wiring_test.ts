/**
 * LE FÉCULENT À CÔTÉ EST BRANCHÉ AU BON ENDROIT — 2026-09-22, lot C.
 *
 * ⛔ `starch_side.ts` est pur et testé; ça ne dit RIEN de l'endroit où il
 * tourne. Ce fichier épingle les cinq jonctions du lot dans le générateur et
 * dans la consigne:
 *
 *   ① le partage se calcule APRÈS le complément (qui réécrit deux lignes) et
 *      AVANT la boucle qui pose les lignes d'application;
 *   ② chaque ligne d'application porte `starchSide`, lu dans la table du
 *      partage — jamais un `null` en dur sur le chemin de la table;
 *   ③ les compteurs du lot (`two_pot_cells`, `starch_carried_kcal`,
 *      `starch_side`) sortent par l'objet que `generated_from.portion_sizing`
 *      recopie;
 *   ④ la passe du plafond (lot B) pèse chaque partie à son facteur — et le
 *      brief protéique ne reçoit PLUS les cases à féculent à côté (⟳ le
 *      plafond est une mesure depuis le 2026-09-22);
 *   ⑤ la consigne nomme les clés du schéma (`separable_side`, `uses`) dans la
 *      phrase qui demande la casserole à part.
 *
 * ⟳ 2026-09-23 (chantier « assiettes normales », vague 2) — la forme suit
 * l'objectif (`goal`, `tableGoal`), les protéines des à-côtés entrent dans le
 * reste de la journée, les lignes au-dessus du milieu quittent l'ajusteur, et
 * le partage atteint une personne seule (⑧).
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE
 * (`caller-audit-must-strip-comments`).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { STANDARD_RECIPE_BLOCK } from "./household_meal_generation.ts";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const SRC = stripComments(
  await sourceFamily(new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR)),
);

const COMPLEMENT_WRITE = "Object.assign(cRow, { factor: split.complementFactor";
const SPLIT_CALL = "const split = splitStarchSide({";
const APPLY_LOOP = "for (const { i, dish, slot, day, standard, atDish, rows } of pre) {";
const ROW_FIELD = "starchSide: starchSideByRow.get(`${i}|${r.memberId}`) ?? null,";

Deno.test("CÂBLAGE ① le partage se calcule après le complément, avant les lignes d'application", () => {
  const c = SRC.indexOf(COMPLEMENT_WRITE);
  const s = SRC.indexOf(SPLIT_CALL);
  const a = SRC.indexOf(APPLY_LOOP);
  assert(c > 0 && s > 0 && a > 0, "les trois ancres existent");
  assert(c < s, "le complément réécrit ses lignes AVANT que le partage ne les lise");
  assert(s < a, "le partage existe AVANT que les lignes d'application ne soient posées");
  // ⟳ 2026-09-23 — DEUX écritures, et deux seulement: la table (ici, la
  // première) et la personne seule (⑧). Une troisième serait un second avis
  // sur la même assiette.
  assertEquals(SRC.split(SPLIT_CALL).length - 1, 2, "la table et la bouche seule, rien d'autre");
});

Deno.test("CÂBLAGE ② chaque ligne d'application de la table porte son partage", () => {
  const a = SRC.indexOf(APPLY_LOOP);
  const push = SRC.indexOf("applyRows.push({", a);
  const end = SRC.indexOf("});", push);
  assert(a > 0 && push > a && end > push, "la boucle et son `applyRows.push` existent");
  assert(
    SRC.slice(push, end).includes(ROW_FIELD),
    "la ligne d'application lit la table du partage",
  );
});

Deno.test("CÂBLAGE ③ les compteurs atteignent `household.portion_sizing`, les lignes restent au journal", () => {
  // La mesure les rend…
  for (const key of [
    "two_pot_cells: starchSide.two_pot_cells,",
    "starch_carried_kcal: Math.round(starchSide.starch_carried_kcal),",
    "starch_side: {",
    "starch_side_rows: starchSideRows,",
  ]) {
    assert(SRC.includes(key), `absent de la mesure: ${key}`);
  }
  // …et le bloc de la table, composé CLÉ PAR CLÉ, les recopie. ⛔ C'est la
  // jonction qui manquait au premier run réel du lot (`58ce432d`): rendus par
  // la mesure, jamais écrits dans `generated_from`.
  for (const key of [
    "two_pot_cells: measured.two_pot_cells,",
    "starch_carried_kcal: measured.starch_carried_kcal,",
    "starch_side: measured.starch_side,",
  ]) {
    assert(SRC.includes(key), `absent du bloc de la table: ${key}`);
  }
  // Les lignes par plat portent un seau et des grammes: journal, pas `generated_from`.
  assert(SRC.includes('Object.entries(sansLignes).filter(([k]) => k !== "starch_side_rows")'));
});

Deno.test("CÂBLAGE ④ le lot B pèse chaque partie; le brief ne poursuit plus le plafond", () => {
  // ⟳ 2026-09-22 — le plafond est une mesure: la carte d'une bouche ne garde
  // plus son propre plafond sur les cases à féculent à côté.
  assert(!SRC.includes("starchAsideCells:"), "le brief ne doit plus recevoir les cases à féculent à côté");
  assert(SRC.includes("share: partFactorOf(r, null),"), "le frais du plat à son facteur");
  assert(
    SRC.includes("share: partFactorOf(r, id) / Math.max(1, drawsNow.get(id) ?? 1),"),
    "chaque casserole à son facteur",
  );
  assert(SRC.includes("starchSide: r.starchSide,"), "la table transmet le partage au lot B");
});

Deno.test("CÂBLAGE ⑤ la consigne nomme la clé du schéma à côté de la promesse", () => {
  const text = STANDARD_RECIPE_BLOCK.join("\n");
  // ⟳ 2026-09-23 — v38: la promesse est la règle UNIQUE, seul ou partagé.
  const promise = text.indexOf("Every lunch and dinner, eaten alone or shared, is ONE main preparation");
  const role = text.indexOf('role "separable_side"');
  const uses = text.indexOf('"uses" BOTH preparations');
  assert(promise >= 0 && role > promise && uses > role, text);
  // ⛔ À MOINS DE 400 CARACTÈRES: « une promesse loin de sa clé est suivie à 0 % ».
  // Mesuré le 2026-09-23 (v38): 349.
  assert(uses - promise < 400, `promesse et clés trop loin: ${uses - promise}`);
  // ⟳ 2026-09-23 — v38: la règle « ONE dish » ne vaut plus pour personne, ni
  // seul ni à table; aucune branche « partagé » ne reste.
  assert(!text.includes("is a complete plate in ONE dish"), "la branche « seul » est revenue");
  assert(!text.includes("SHARED by two people or more"), "la branche « partagé » est revenue");
  assert(!text.includes("Every lunch and dinner is a complete plate in ONE dish"));
});

Deno.test("⟳ 2026-09-23 CÂBLAGE ⑨ — v38: une case mangée seule dans un FOYER reste à UN facteur", () => {
  // La consigne demande maintenant deux casseroles aussi pour une case qu'une
  // seule bouche d'un foyer mange. À table, le partage ne la lit pas: elle
  // sort du filtre avant que `twoPot` ne soit rempli, donc aucune ligne
  // `starchSideByRow`, donc `starchSide: null` et `partFactorOf` rend le
  // facteur uniforme aux deux casseroles.
  const filter = SRC.indexOf("const asideCells = starchAsideCellsOf(householdGrid.cells);");
  const skipCell = SRC.indexOf("if (!asideCells.has(`${c.day}|${c.slot}`)) continue;", filter);
  const skipOne = SRC.indexOf("if (c.eaters.size < 2 || fed.complementByDish[c.i]) continue;", skipCell);
  const fill = SRC.indexOf("twoPot.set(c.i, { sidePrepId: found.sidePrepId, main, side });", skipOne);
  assert(filter > 0 && skipCell > filter && skipOne > skipCell && fill > skipOne, "le filtre à deux mangeurs a bougé");
  // `starchSideByRow` n'est écrit que pour un plat présent dans `twoPot`.
  const splitLoop = SRC.indexOf("const t = twoPot.get(c.i);\n          if (t === undefined) continue;");
  const write = SRC.indexOf("starchSideByRow.set(`${c.i}|${r.memberId}`, {");
  assert(splitLoop > fill && write > splitLoop, "le partage s'écrit hors du filtre");
  assertEquals(SRC.split("starchSideByRow.set(").length - 1, 1, "une seule écriture du partage à table");
});

Deno.test("CÂBLAGE ⑥ le plancher de JOURNÉE passe avant le plancher par case, et se compte", () => {
  const rest = SRC.indexOf("restOf.set(k, p === null ? null : prev + p * r.factor);");
  const floors = SRC.indexOf("const floors = dayProteinFloors({");
  const split = SRC.indexOf(SPLIT_CALL);
  assert(rest > 0 && floors > rest && split > floors, "reste, puis planchers, puis partage");
  assert(SRC.includes("const floorG = dayFloor ?? proteinFloorAt({"));
  assert(SRC.includes("starchSide.day_lanes[floors.reason]++;"));
  // Le plancher du jour: celui du contrôle final, COUVERT; le plafond n'y entre pas.
  const call = SRC.slice(floors, SRC.indexOf("rows,", floors));
  for (const key of ["coveredBudgetGrossKcal: d.coveredBudgetGrossKcal", "fixedProteinG: d.fixedProteinG", "dayCeilingG: null,"]) {
    assert(call.includes(key), `absent de l'allocation du jour: ${key}`);
  }
  // ⟳ 2026-09-23 — LES PROTÉINES DES À-CÔTÉS SERVIS entrent dans le RESTE de
  // la journée, une fois — jamais dans `fixedProteinG`.
  assert(call.includes("restProteinG: withSides(memberId, day,"), call);
  assert(SRC.includes("const sideNutrition = sideNutritionByMouthDay(sideLedger);"));
  // …et le reste les AJOUTE, par la clé du registre (personne, jour).
  assert(
    SRC.includes("rest + (sideNutrition.get(sideCourseDayKey(memberId, day))?.proteinG ?? 0)"),
    "le reste de la journée ne compte pas les protéines des à-côtés",
  );
  assert(!call.includes("fixedProteinG: d.fixedProteinG +"), "les à-côtés dans les apports fixes");
});

Deno.test("CÂBLAGE ⑦ le partage suit l'énergie: la part du milieu de la table, par plat", () => {
  // ⟳ 2026-09-23 — la part du milieu ET son objectif (`tableReferenceOf`).
  const ref = SRC.indexOf("const tableRef = tableReferenceOf(");
  const split = SRC.indexOf(SPLIT_CALL);
  assert(ref > 0 && ref < split, "la part de référence est calculée avant le partage");
  assert(SRC.includes("const tableFactor = tableRef?.factor ?? null;"));
  assert(
    SRC.slice(ref, split).includes("goal: starchGoalOfMember(r.memberId),"),
    "la part du milieu ne porte pas l'objectif de chaque mangeur",
  );
  const call = SRC.slice(split, SRC.indexOf("});", split));
  assert(call.includes("tableFactor,") && call.includes("floorG,"), call);
  assert(!call.includes("ceiling"), "aucun plafond ne décide du partage");
  // ⟳ 2026-09-23 — LA FORME SUIT L'OBJECTIF (lot 2): celui de la bouche et
  // celui du milieu, tous deux requis par `splitStarchSide`.
  assert(call.includes("tableGoal: tableRef?.goal ?? null,"), call);
  assert(call.includes("goal: starchGoalOfMember(r.memberId),"), call);
  // Et la part du féculent, avant et après, au journal.
  assert(SRC.includes("starch_share_before: split.starchShareBefore === null"));
  assert(SRC.includes("starch_share_after: split.starchShareAfter === null"));
});

Deno.test("⟳ 2026-09-23 CÂBLAGE ⑦ bis — l'objectif du féculent se tait sous plancher TCA", () => {
  const at = SRC.indexOf("const starchGoalOfMember = (memberId: string): StarchGoal | null => {");
  assert(at > 0, "la lecture de l'objectif par bouche a disparu");
  const body = SRC.slice(at, SRC.indexOf("};", at));
  assert(body.includes('if (r === "raised" || r === "unreadable") return null;'), body);
  assert(body.includes("ageYears: bodyOfMouth(memberId)?.ageYears ?? null,"), body);
});

Deno.test("⟳ 2026-09-23 CÂBLAGE ⑦ ter — les lignes au-dessus du milieu quittent l'ajusteur, et seulement lui", () => {
  const rows = SRC.indexOf("const adjustRows = rowsForProportionAdjust(");
  const adjust = SRC.indexOf("for (const r of adjustRows.rows) {");
  assert(rows > 0 && adjust > rows, "l'ajusteur de la table ne lit plus les lignes filtrées");
  assert(SRC.includes("skippedSplitRows: adjustRows.skipped_split_rows,"));
  assert(SRC.includes("skipped_split_rows: after.skippedSplitRows,"));
  // La ligne porte ce que le filtre lit.
  assert(SRC.includes("twoPot: twoPot.get(i)?.main != null && twoPot.get(i)?.side != null,"));
});

Deno.test("⟳ 2026-09-23 CÂBLAGE ⑧ — le partage atteint une personne seule (arbitrage 5)", () => {
  const second = SRC.indexOf(SPLIT_CALL, SRC.indexOf(SPLIT_CALL) + 1);
  assert(second > 0, "la bouche seule ne partage plus rien");
  const call = SRC.slice(second, SRC.indexOf("});", second));
  // Pas de part du milieu à une bouche; l'objectif de la bouche, lui, compte.
  assert(call.includes("tableFactor: null,") && call.includes("tableGoal: null,"), call);
  assert(call.includes("goal: soloStarchGoal,"), call);
  // Les deux moitiés viennent du bloc extrait, pas d'une troisième mesure.
  assert(SRC.slice(SRC.lastIndexOf("const parts = twoPotPartsOf({", second), second).length > 0);
  // Et le partage part dans les lignes appliquées ET dans la passe du plafond.
  assert(SRC.includes("starchSide: soloStarchSideOf(m, i, true),"), "la ligne appliquée ignore le partage");
  assert(SRC.includes("starchSide: soloStarchSideOf(m, i, false),"), "le plafond pèse un autre plat");
  assert(SRC.includes("starch_side: soloStarch,"), "les compteurs de la bouche seule ne sortent pas");
});
