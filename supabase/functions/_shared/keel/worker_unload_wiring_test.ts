/**
 * UN PLAN QUI MEURT NE DOIT PAS FAIRE ATTENDRE — 2026-09-25 (lot 9 du banc des
 * trois foyers).
 *
 * Plan C du banc : la mère, puis sa relance, tuées par la limite CPU du
 * runtime. Un worker tué n'exécute ni `catch` ni `finally` : la ligne restait
 * `running`, et l'écran attendait jusqu'à 970 s un échec certain.
 *
 * Ce fichier ne teste QUE la jointure dans la lane du foyer : l'écouteur
 * `beforeunload` marque les brouillons en vol, l'ensemble des brouillons en
 * vol est tenu par le chemin 202, une relance n'a qu'une réparation, et chaque
 * tour laisse une marque journalisée. Mesure du runtime local : voir le
 * commentaire au-dessus de `draftsInFlight` dans l'index.
 */
import { assert } from "jsr:@std/assert@1";
import { sourceFamilySync } from "./source_family.ts";

const SRC = sourceFamilySync(
  new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
);

Deno.test("ARRÊT ① — l'écouteur marque failed/timed_out, et seulement une ligne encore en vol", () => {
  const i = SRC.indexOf('addEventListener("beforeunload", (event) => {');
  assert(i > 0, "l'écouteur existe");
  const corps = SRC.slice(i, i + 1600);
  assert(corps.includes('status: "failed"'), "il marque la ligne en échec");
  // ⛔ `timed_out` et rien d'autre : c'est le jeton que la réclamation SQL
  // relance (`keel_claim_meal_drafts_for_relaunch`) et que l'écran lit comme
  // `plan_expired` (il suit alors la fille au lieu d'attendre le bail).
  assert(corps.includes('error_code: "timed_out"'), "avec le jeton que la relance reconnaît");
  // ⛔ Un brouillon écrit (`done`, `adopted`) n'est JAMAIS défait par un arrêt
  // qui arrive après l'écriture.
  assert(corps.includes('.in("status", ["pending", "running"])'), "seulement sur une ligne encore en vol");
});

Deno.test("ARRÊT ② — le chemin 202 tient l'ensemble des brouillons en vol", () => {
  const ajout = SRC.indexOf("draftsInFlight.add(winner.draftId);");
  const retrait = SRC.indexOf("draftsInFlight.delete(winner.draftId);");
  const garde = SRC.indexOf("const kept = keepWorking(work.then(");
  assert(ajout > 0 && retrait > 0 && garde > 0, "ajout, retrait et travail d'arrière-plan existent");
  assert(ajout < garde, "le brouillon entre dans l'ensemble avant que le travail ne soit confié au runtime");
  // Le retrait est dans le `finally` du travail d'arrière-plan : un plan
  // terminé (écrit OU refusé) ne peut plus être marqué par un arrêt tardif.
  assert(SRC.slice(garde, retrait).includes("}).finally(() => {"), "le retrait est dans le finally");
});

Deno.test("ARRÊT ③ — une relance n'a qu'une réparation", () => {
  const i = SRC.indexOf("const planBudget = createPlanBudget({");
  assert(i > 0, "le budget existe");
  const corps = SRC.slice(i, i + 900);
  assert(
    corps.includes('repairs: (req.headers.get("x-relaunch-of") ?? "").trim() !== "" ? 1 : undefined,'),
    "l'en-tête de relance réduit les réparations à une",
  );
});

Deno.test("ARRÊT ④ — chaque tour et l'écriture laissent une marque journalisée", () => {
  const tour = SRC.indexOf("markWorkPhase(requestId, `round_${c4Round}`);");
  assert(tour > 0, "une marque par tour");
  assert(
    SRC.slice(tour, tour + 400).includes('tag: "keel.household_meal.work_mark"'),
    "journalisée tout de suite (un worker tué laisse son dernier chiffre)",
  );
  const ecriture = SRC.indexOf('markWorkPhase(requestId, "writing");');
  assert(ecriture > 0, "une marque à l'écriture");
  assert(
    SRC.slice(ecriture, ecriture + 400).includes('tag: "keel.household_meal.work_mark"'),
    "journalisée aussi",
  );
});

Deno.test("ARRÊT ⑤ — l'écouteur libère aussi les verrous de génération tenus (sinon la relance prend un 409)", () => {
  // Tir réel C-2 du banc: brouillon fermé à la seconde, relance à la minute,
  // 409 `generation_in_flight` sur le verrou encore frais, relance perdue.
  const i = SRC.indexOf('addEventListener("beforeunload", (event) => {');
  const corps = SRC.slice(i, i + 2400);
  assert(corps.includes('.rpc("keel_household_release_generation", {'), "le verrou est rendu");
  assert(corps.includes("p_lease: lock.leaseToken,"), "avec son jeton de bail");
  assert(SRC.includes("locksInFlight.set(requestId, generationLockHeld);"), "le verrou pris entre dans l'ensemble");
  assert(SRC.includes("locksInFlight.delete(held.requestId);"), "et en sort à sa libération normale");
});

