/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-24 — LE PLAFOND PERSONNEL ET LA COMPENSATION SANS PERTE SONT
 * BRANCHÉS AU BON ENDROIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `~/.claude/plans/lexical-gliding-lamport.md`, étapes 1, 2 et 4.
 *
 * `personalPlateBoundsFor`, `fitPortionsToBounds` et `buildSideCourseLedger`
 * sont purs et testés; ça ne dit RIEN de l'endroit où ils tournent. Chaque
 * jonction ci-dessous a sa moitié qui mord: la même lecture, sur la source
 * MUTÉE, doit nommer la jonction coupée — et elle seule.
 *
 *   ① `slotContractsFor` calcule le plafond personnel sur l'ENTRETIEN
 *      (`maintenanceKcalOf`) et le passe à ses quatre bornes;
 *   ② le générateur remplit la carte des plafonds personnels dans la boucle
 *      des contrats, sur la bouche du contrat, et ses deux replis la lisent;
 *   ③ le relevé des repas rabotés est NEUF à chaque tour de réparation;
 *   ④ la coupe du dimensionnement (personne seule) y entre;
 *   ⑤ le rabotage y entre, juste après `fitPortionsToBounds`;
 *   ⑥ le registre est reconstruit avec ce relevé APRÈS le rabotage et AVANT
 *      le contrôle final, les casseroles et les courses;
 *   ⑦ le pain ajouté respecte le réglage, l'impossible et le moment léger;
 *   ⑧ les à-côtés sont rattachés de nouveau au plan écrit avant l'énergie
 *      servie, ⑨ et le verrou de maison les revoit;
 *   ⑩ le relevé (un `member_id` à côté de kcal) ne sort pas au journal;
 *   ⑪ la trace `plate_bounds` sort, en seaux.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE
 * (`caller-audit-must-strip-comments`): un commentaire ne câble rien.
 */
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const RAW_HANDLER = await Deno.readTextFile(
  new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
);
const RAW_CONTRACT = await Deno.readTextFile(
  new URL("_shared/keel/slot_nutrition_contract.ts", FUNCTIONS_DIR),
);
const HANDLER = stripComments(RAW_HANDLER);
const CONTRACT = stripComments(RAW_CONTRACT);

/** L'indice de la parenthèse (accolade, crochet) qui ferme celle ouverte en `open`. */
function closingOf(src: string, open: number): number {
  const stack: string[] = [];
  let i = open;
  while (i < src.length) {
    const c = src[i];
    const top = stack[stack.length - 1];
    if (top === "`") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") stack.pop();
      else if (c === "$" && src[i + 1] === "{") {
        stack.push("${");
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') {
      i += 1;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === "`") stack.push("`");
    else if (c === "(" || c === "[" || c === "{") stack.push(c);
    else if (c === ")" || c === "]" || c === "}") {
      const popped = stack.pop();
      if (popped !== "${" && stack.length === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** Le texte de l'appel ou du littéral qui s'ouvre au premier `anchor` (fini par `(` ou `{`). */
function blockAt(src: string, anchor: string, from = 0): string {
  const at = src.indexOf(anchor, from);
  if (at < 0) return "";
  const close = closingOf(src, at + anchor.length - 1);
  return close < 0 ? "" : src.slice(at, close + 1);
}

/** Les blancs ramenés à une espace: la mise en page ne câble rien non plus. */
const squash = (s: string) => s.replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// LES ANCRES
// ---------------------------------------------------------------------------

const A = {
  // ① le contrat
  CONTRACTS_FN: "export function slotContractsFor(args: {",
  PERSONAL_CALL: "personalPlateBoundsFor({",
  PERSONAL_MAINTENANCE: "maintenanceKcal: maintenanceKcalOf(args.mouth).kcal",
  // ② la carte du générateur
  MAP_SET: "personalPlateBoundsByMember.set(",
  MAP_MAINTENANCE: "maintenanceKcal: maintenanceKcalOf(anchorMouth).kcal,",
  CONTRACTS_CALL: "const contracts = slotContractsFor({",
  CONTRACT_MOUTH: "mouth: anchorMouth,",
  FALLBACK: "contract?.bounds ?? plateBoundsFor({",
  FALLBACK_PERSONAL: "personal: personalPlateBoundsByMember.get(",
  // ③ ④ ⑤ ⑥ le relevé et le registre
  LOOP: "for (let c4Round = 0;; c4Round++) {",
  MAP_DECL: "const boundaryDeficitByKey = new Map<string, number>();",
  PORTION_SIZING: "const portionSizing = await (async () => {",
  SOLO_CLAMP: "addBoundaryDeficit( mouth.memberId, day, slot, (sized.factor - bounded.factor) * standard.kcal, );",
  FIT: "const portionBoundary = fitPortionsToBounds({",
  SHAVED_LOOP: "for (const shaved of portionBoundary.shavedByMeal) {",
  SHAVED_ADD: "addBoundaryDeficit(shaved.memberId, shaved.day, shaved.slot, shaved.kcal);",
  REBUILD: "sideLedger = buildSideLedgerFor(meal, boundaryDeficitByKey);",
  FINAL_SIZING: "const finalSizing = (() => {",
  SHOP: "const sideShopping = sideShoppingLines(sideLedger);",
  // ⑦ le pain
  BREAD_FN: "const sideBreadAllowed = (memberId: string, slot: SideCourseSlot): boolean =>",
  BREAD_SETTING: "rawHabits.get(memberId)?.sideCourses?.[slot]?.bread !== false",
  BREAD_IMPOSSIBLE: "sideImpossibleByMember.get(memberId)?.get(slot)?.has(\"bread\")",
  BREAD_LIGHT: ".lightSlots ?? []).includes(slot)",
  LEDGER: "buildSideCourseLedger({",
  // ⑧ ⑨ le plan écrit
  REATTACH: "const sideReattach = attachSideCourses(dishes, sideLedger);",
  RELOCK: "applyHouseRuleLock( sideReattach.dishes,",
  RELOCK_GLUE: "payload.side_courses = relocked.side_courses",
  FINAL: "const finalServed = finalServedByMouthDay({",
  // ⑩ ⑪ les traces
  BOUNDARY_TRACE: "const portionBoundaryTrace = (() => {",
  SHAVED_OUT: "shavedByMeal: _shavedByMeal,",
  PROMPT_TRACE: "const promptTrace = {",
  PLATE_TRACE: "plate_bounds: plateBoundsTrace,",
  PLATE_TRACE_BLOCK: "const plateBoundsTrace = (() => {",
} as const;

/** CE QUI MANQUE, jonction par jonction. `[]` = tout est branché. */
function verdict(handler: string, contract: string): string[] {
  const missing: string[] = [];
  const h = squash(handler);
  // ① le contrat: l'entretien, et les quatre bornes
  const fn = blockAt(contract, A.CONTRACTS_FN.slice(0, -1) + "{");
  const body = contract.slice(contract.indexOf(A.CONTRACTS_FN));
  const fnBody = blockAt(body, "): SlotContractSet {");
  const personalCall = blockAt(fnBody, A.PERSONAL_CALL);
  if (fn === "" || !squash(personalCall).includes(A.PERSONAL_MAINTENANCE)) {
    missing.push("contract_reads_target_not_maintenance");
  }
  const boundsCalls = fnBody.split(/(?:plateBoundsFor|hardCeilingBoundsFor)\)?\(\{/).length - 1;
  const withPersonal = (fnBody.match(/^\s*personal,\s*$/gm) ?? []).length;
  if (boundsCalls !== 4 || withPersonal !== 4) missing.push("contract_bounds_without_personal");
  // ② la carte, sur la bouche du contrat, lue par les deux replis
  const mapSet = squash(blockAt(handler, A.MAP_SET));
  const call = handler.indexOf(A.CONTRACTS_CALL);
  if (
    !mapSet.includes(A.PERSONAL_CALL) || !mapSet.includes(A.MAP_MAINTENANCE) ||
    handler.indexOf(A.MAP_SET) > call || !blockAt(handler, A.CONTRACTS_CALL).includes(A.CONTRACT_MOUTH)
  ) missing.push("personal_map_not_filled");
  const fallbacks = handler.split(A.FALLBACK).length - 1;
  let fallbacksWithPersonal = 0;
  for (let at = handler.indexOf(A.FALLBACK); at >= 0; at = handler.indexOf(A.FALLBACK, at + 1)) {
    if (blockAt(handler, A.FALLBACK, at).includes(A.FALLBACK_PERSONAL)) fallbacksWithPersonal++;
  }
  if (fallbacks !== 2 || fallbacksWithPersonal !== 2) missing.push("fallbacks_without_personal");
  // ③ le relevé, neuf à chaque tour
  const loop = handler.indexOf(A.LOOP);
  const decl = handler.indexOf(A.MAP_DECL);
  if (
    handler.split(A.MAP_DECL).length - 1 !== 1 || !(decl > loop && loop >= 0) ||
    decl > handler.indexOf(A.PORTION_SIZING)
  ) missing.push("boundary_map_not_per_round");
  // ④ la coupe d'une personne seule
  if (!h.includes(A.SOLO_CLAMP)) missing.push("solo_clamp_not_collected");
  // ⑤ le rabotage, juste après lui
  const fit = handler.indexOf(A.FIT);
  const shop = handler.indexOf(A.SHOP, Math.max(0, fit));
  const shaved = handler.indexOf(A.SHAVED_LOOP);
  const rebuild = handler.indexOf(A.REBUILD);
  if (
    shaved < 0 || !(shaved > fit && shaved < shop) ||
    !blockAt(handler, A.SHAVED_LOOP.slice(0, -1) + "{").includes(A.SHAVED_ADD) ||
    (rebuild >= 0 && shaved > rebuild)
  ) missing.push("shaved_meals_not_collected");
  // ⑥ le registre reconstruit, avant le contrôle final, les casseroles, les courses
  if (
    fit < 0 || !(rebuild > fit && rebuild < shop) ||
    rebuild > handler.indexOf(A.FINAL_SIZING)
  ) missing.push("boundary_ledger_not_rebuilt");
  // ⑦ le pain ajouté
  const bread = squash(handler.slice(handler.indexOf(A.BREAD_FN), handler.indexOf(";", handler.indexOf(A.BREAD_FN))));
  const ledger = blockAt(handler, A.LEDGER);
  if (
    !bread.includes(A.BREAD_SETTING) || !bread.includes(A.BREAD_IMPOSSIBLE) ||
    !bread.includes(A.BREAD_LIGHT) || !ledger.includes("breadAllowed: sideBreadAllowed,") ||
    !ledger.includes("extraDeficitByKey,") || !ledger.includes("mealKcalByKey: sideMealKcalByKey,")
  ) missing.push("bread_permission_missing");
  // ⑧ le plan écrit reçoit les à-côtés d'après la borne
  const reattach = handler.indexOf(A.REATTACH);
  const final = handler.indexOf(A.FINAL);
  if (!(reattach > rebuild && reattach < final)) missing.push("sides_not_reattached");
  // ⑨ et le verrou de maison les revoit
  if (!h.includes(A.RELOCK) || !handler.includes(A.RELOCK_GLUE)) missing.push("reattach_not_relocked");
  // ⑩ le relevé ne sort pas au journal
  if (!blockAt(handler, A.BOUNDARY_TRACE).includes(A.SHAVED_OUT)) missing.push("shaved_meals_logged");
  // ⑪ la trace des bornes, en seaux
  const plate = blockAt(handler, A.PLATE_TRACE_BLOCK);
  if (
    !blockAt(handler, A.PROMPT_TRACE).includes(A.PLATE_TRACE) ||
    !plate.includes("mouthBucketOf(memberId)") || !plate.includes("withheldMemberIds.has(memberId)") ||
    /member_id/.test(plate)
  ) missing.push("plate_bounds_not_traced");
  return missing;
}

/** Remplace la n-ième occurrence (0 = la première) de `from` par `to`. */
function replaceAt(s: string, from: string, to: string, nth = 0): string {
  let i = s.indexOf(from);
  for (let k = 0; k < nth && i >= 0; k++) i = s.indexOf(from, i + 1);
  return i < 0 ? s : s.slice(0, i) + to + s.slice(i + from.length);
}

Deno.test("⟳ 2026-09-24 — CÂBLAGE — le plafond personnel et la compensation sont branchés", () => {
  assertEquals(verdict(HANDLER, CONTRACT), []);
});

Deno.test("⟳ 2026-09-24 — CÂBLAGE — chaque jonction coupée fait ROUGIR, elle seule", () => {
  const cuts: Array<[string, "handler" | "contract", (s: string) => string]> = [
    [
      "contract_reads_target_not_maintenance",
      "contract",
      // La mutation du plan: lire la CIBLE au lieu de l'entretien.
      (s) => replaceAt(s, "maintenanceKcal: maintenanceKcalOf(args.mouth).kcal,", "maintenanceKcal: day.kcal,"),
    ],
    [
      "contract_bounds_without_personal",
      "contract",
      (s) => replaceAt(s, "appetite: args.mouth.body?.appetite ?? null,\n        personal,", "appetite: args.mouth.body?.appetite ?? null,\n        personal: null,"),
    ],
    ["personal_map_not_filled", "handler", (s) => replaceAt(s, A.MAP_MAINTENANCE, "maintenanceKcal: null,")],
    [
      "fallbacks_without_personal",
      "handler",
      (s) => replaceAt(s, "personal: personalPlateBoundsByMember.get(memberId) ?? null,", "personal: null,"),
    ],
    [
      "boundary_map_not_per_round",
      "handler",
      // Déclaré une fois pour toutes, hors du tour: il cumulerait les tours.
      (s) => replaceAt(replaceAt(s, A.MAP_DECL, ""), A.LOOP, A.MAP_DECL + "\n" + A.LOOP),
    ],
    [
      "solo_clamp_not_collected",
      "handler",
      (s) => replaceAt(s, "(sized.factor - bounded.factor) * standard.kcal,", "0,"),
    ],
    ["shaved_meals_not_collected", "handler", (s) => replaceAt(s, "of portionBoundary.shavedByMeal)", "of [])")],
    ["boundary_ledger_not_rebuilt", "handler", (s) => replaceAt(s, A.REBUILD, "")],
    ["bread_permission_missing", "handler", (s) => replaceAt(s, A.BREAD_SETTING + " &&", "")],
    [
      "sides_not_reattached",
      "handler",
      (s) => replaceAt(s, A.REATTACH, "const sideReattach = attachSideCourses([], sideLedger);"),
    ],
    [
      "reattach_not_relocked",
      "handler",
      (s) => replaceAt(s, "payload.side_courses = relocked.side_courses", "payload.side_courses = []"),
    ],
    ["shaved_meals_logged", "handler", (s) => replaceAt(s, A.SHAVED_OUT, "")],
    ["plate_bounds_not_traced", "handler", (s) => replaceAt(s, A.PLATE_TRACE, "")],
  ];
  for (const [name, where, cut] of cuts) {
    const handler = where === "handler" ? cut(HANDLER) : HANDLER;
    const contract = where === "contract" ? cut(CONTRACT) : CONTRACT;
    assertNotEquals(
      where === "handler" ? handler : contract,
      where === "handler" ? HANDLER : CONTRACT,
      `la coupe « ${name} » n'a rien changé`,
    );
    assertEquals(verdict(handler, contract), [name], `la coupe « ${name} » n'a pas fait rougir ce qu'elle devait`);
  }
});

Deno.test("⟳ 2026-09-24 — CÂBLAGE — un commentaire ne câble rien", () => {
  // La reconstruction d'après le rabotage passée en commentaire dans la source
  // BRUTE: le retrait des commentaires doit la faire disparaître.
  const at = RAW_HANDLER.indexOf(A.REBUILD);
  assert(at > 0);
  const lineStart = RAW_HANDLER.lastIndexOf("\n", at) + 1;
  const mutated = stripComments(RAW_HANDLER.slice(0, lineStart) + "// " + RAW_HANDLER.slice(lineStart));
  assertEquals(verdict(mutated, CONTRACT), ["boundary_ledger_not_rebuilt"]);
});
