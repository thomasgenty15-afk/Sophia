/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 — L'APPEL DE RÉPARATION PART AVEC LES DEUX BONS MESSAGES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ « Codé », « testé en isolation » et « branché jusqu'à l'appel » sont TROIS
 * ÉTATS DIFFÉRENTS. `plan_repair_prompt.ts` est pur et entièrement testé — et
 * ça ne dit rien de ce que `generateWithGemini` reçoit réellement. Le défaut
 * fermé EST un défaut de site d'appel : le bon constructeur existait, et
 * l'ancien prompt partait quand même.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const SRC = stripComments(
  await sourceFamily(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  ),
);

/** L'appel de réparation, du compteur à la fermeture de ses arguments. */
function appelDeReparation(): string {
  const i = SRC.indexOf("c4CallsMade += 1;");
  assert(i > 0, "le compteur d'appels de réparation a disparu");
  // ⟳ 2026-09-14 · BÊTA 2B — L'ANCRE A CHANGÉ, PAS LA POSITION. L'appel est
// enveloppé par `appelModele(…)` depuis que les pannes du fournisseur ont un
// jeton au lieu d'une chaîne anglaise. Le site est le même.
  const j = SRC.indexOf("generateWithGemini(", i);
  assert(j > i, "l'appel de réparation a disparu");
  return SRC.slice(j, j + 1200);
}

Deno.test("① le message SYSTÈME est celui de la réparation, plus celui du plan", () => {
  const appel = appelDeReparation();
  assert(
    appel.includes("c4System.text"),
    `le système de réparation n'est pas passé: ${appel.slice(0, 200)}`,
  );
  // ⛔ LE DÉFAUT EXACT DE LA REVUE (P1 §3): `built.systemPrompt` demandait un
  // plan complet pendant que le contexte exigeait un patch.
  assert(
    !appel.includes("built.systemPrompt"),
    "le prompt de composition repart dans la réparation",
  );
  assert(
    !appel.includes("household.systemSuffix"),
    "les schémas de foyer (member_portions, boxes, explanation) repartent",
  );
});

Deno.test("② le message UTILISATEUR ne rebâtit plus le brief initial", () => {
  const appel = appelDeReparation();
  assert(
    !appel.includes("householdUserMessage("),
    "le brief de composition — « couvre ces jours-là » — repart avec la réparation",
  );
  assert(appel.includes("c4Composed.text"), "le contexte de réparation ne part pas");
  // ⚠️ LA LANGUE RESTE EN QUEUE, comme sur la composition: c'est la seule garde
  // de langue du dépôt et elle tient par la récence.
  assert(
    appel.includes("appendContentLanguageBlock("),
    "le bloc de langue ne part plus",
  );
});

Deno.test("③ les limites dures sont recalculées, pas recopiées", () => {
  const i = SRC.indexOf("const c4System = repairSystemPrompt({");
  assert(i > 0, "le constructeur du système de réparation n'est pas appelé");
  const bloc = SRC.slice(i, i + 500);
  assert(bloc.includes("safetyConstraintsPromptBlock(constraints,"));
  assert(bloc.includes("restrictionBlock(restrictions)"));
  // ⛔ LES MÊMES FONCTIONS QUE LA COMPOSITION. Une seconde formulation de la
  // même règle à deux fichiers d'écart est un générateur de divergence.
  assert(!bloc.includes('"- '), "un bloc de sécurité est réécrit à la main ici");
});

Deno.test("④ la table des sessions est bâtie sur LE MÊME plan que les unités", () => {
  const unites = SRC.indexOf("const c4Units = buildRepairUnits({");
  const sessions = SRC.indexOf("const c4Sessions = buildRepairSessions({");
  assert(unites > 0 && sessions > unites, "les deux tables ne sont plus côte à côte");
  const bloc = SRC.slice(sessions, sessions + 400);
  assert(bloc.includes("meal.cooking_sessions.map("));
  // ⛔ ET ELLE PART DANS LES QUATRE ÉTAGES: périmètre, message, application,
  // texte source. Un étage oublié rendrait `S1` muet à cet endroit-là.
  for (const site of [
    "sessions: c4Sessions,\n        defects: c4RepairDefects,",
    "sessions: c4Sessions,\n          scope: c4Scope,",
    "sessions: c4Sessions,\n                  scope: c4Scope,",
    "sessions: c4Sessions,\n                    rewrittenSessionIds:",
  ]) {
    assert(SRC.includes(site), `étage non câblé: ${JSON.stringify(site)}`);
  }
});

Deno.test("⑤ un périmètre fait de SESSIONS SEULES fait partir l'appel", () => {
  const i = SRC.indexOf("const c4Composed = c4Scope.unitIds.length === 0 &&");
  assert(i > 0, "la garde de périmètre vide a changé de forme");
  const bloc = SRC.slice(i, i + 220);
  assert(
    bloc.includes("c4Scope.sessionIds.length === 0"),
    `une session seule en défaut rendrait « périmètre vide »: ${bloc}`,
  );
});

Deno.test("⑥ les charges écartées avant le parseur rejettent le patch", () => {
  const i = SRC.indexOf("c4Fusion = applyRepairPatch({");
  assert(i > 0);
  const bloc = SRC.slice(i, i + 700);
  assert(bloc.includes("dropped: pont.dropped,"), "les charges écartées sont tues");
});

Deno.test("⑦ une réparation de CASSEROLE SEULE est réellement parsée", () => {
  // ⛔ LE TROU NOMMÉ PAR LA REVUE (P2 §4). Les préparations n'étaient
  // recueillies que dans la boucle des unités : un patch qui ne corrige qu'une
  // casserole — le geste même qu'on propose pour un lot partagé — ne faisait
  // tourner aucune lecture.
  const i = SRC.indexOf("if (pont.payloads.length === 0 && envelope.preparations.length > 0)");
  assert(i > 0, "une réparation de casserole seule n'est toujours pas lue");
  const bloc = SRC.slice(i, i + 400);
  assert(bloc.includes("parseGeneratedMeal({"), "elle n'est pas lue par le moteur");
  assert(bloc.includes("parseArgs"), "elle est lue sans les ceintures du plan");
  assert(bloc.includes("biteKeys("), "ses morsures d'exclusion ne sont pas comptées");
});

Deno.test("⑧ le plafond des DEUX appels n'a pas bougé", () => {
  // ⛔ « Deux appels de réparation au maximum PAR DEMANDE DU FOYER, erreurs et
  // réponses rejetées comprises. Ce plafond ne se multiplie ni par personne, ni
  // par créneau, ni par session de cuisine. »
  assertEquals(SRC.split("c4CallsMade += 1;").length - 1, 1);
  assert(SRC.includes("maxCalls: PLAN_REPAIR_MAX_CALLS"));
  assert(
    !SRC.includes("PLAN_REPAIR_MAX_CALLS *"),
    "le plafond est multiplié quelque part",
  );
});
