// ===========================================================================
// C3 ① — LE TROU DE LA QUESTION OUVERTE N°1 EST MESURÉ, PAS FERMÉ
//
// CE QUE CES TESTS GARDENT, et c'est inhabituel: ils gardent une ABSENCE de
// refus autant qu'une mesure. Le piège nommé du lot est `has_app_write_access`,
// qui PRÉCÈDE KEEL et couperait des membres de foyer et des sièges de coach qui
// paient. Un test de source refuse donc que ce module — ou ses appelants — en
// tire un 402/403.
//
// L'autre moitié est le CAS QUI PASSE des lectures: `none` ne se prononce que
// quand une lecture a répondu, et répondu non. Sinon un compteur grossirait à
// chaque panne de base, et on « mesurerait » un trou qui n'existe pas.
//
// ⚠️ IL N'Y A PLUS QU'UNE PORTE SOLO DEPUIS LE 2026-08-19. Les quatre tests de
// source ci-dessous balayaient `generate-meal-v1` ET `generate-week-plan-v1`;
// la seconde lane a été retirée (aucun appelant vivant). Les boucles sont
// GARDÉES sur un seul élément, exprès: la propriété est « sur CHAQUE porte
// solo », pas « sur generate-meal-v1 », et le jour où une seconde revient elle
// s'ajoute à la liste au lieu de rouvrir un test.
// ===========================================================================

// ⟳ 2026-09-11 · LOT 7 — LES CAS QUI N'ÉPROUVAIENT QUE `generate-meal-v1`
// SONT PARTIS AVEC ELLE. Aucune assertion métier n'a été retirée pour faire
// taire un rouge: chacun avait son jumeau FOYER, qui reste. Le détail de
// l'audit est dans `scratchpad/2026-09-11-LOT7-SUPPRESSION/`.
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ACCESS_COACH_SEAT,
  ACCESS_HOUSEHOLD,
  ACCESS_LOG_TAG,
  ACCESS_NONE,
  ACCESS_OWN,
  ACCESS_UNKNOWN,
  describeAccess,
  readAccessFacts,
} from "./solo_access.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

// ---------------------------------------------------------------------------
// 1. LA DÉCISION, ET ELLE NE DÉCIDE QUE D'UN MOT
// ---------------------------------------------------------------------------

Deno.test("C3 ① — LE FOYER GAGNE: son droit est déjà tranché par D13/L1", () => {
  const seen = describeAccess({
    household: true,
    coachSolvent: null,
    appWriteAccess: null,
  });
  assertEquals(seen.state, ACCESS_HOUSEHOLD);
});

Deno.test("C3 ① — LE SIÈGE DE COACH PASSE AVANT LE DROIT DU COMPTE", () => {
  // C'est le modèle KEEL: le coach paie pour sa cohorte.
  //
  // ⚠️ LES DEUX SONT VRAIS DANS CE DÉCOR, ET C'EST OBLIGATOIRE. Une première
  // rédaction posait `appWriteAccess: false`, où les deux ordres de lecture
  // rendent le même mot: la mutation « inverser l'ordre » restait VERTE. Un
  // décor qui ne peut départager n'épingle rien.
  const seen = describeAccess({
    household: false,
    coachSolvent: true,
    appWriteAccess: true,
  });
  assertEquals(seen.state, ACCESS_COACH_SEAT);

  // Et le cas où seul le siège existe rend le même mot, évidemment.
  assertEquals(
    describeAccess({ household: false, coachSolvent: true, appWriteAccess: false })
      .state,
    ACCESS_COACH_SEAT,
  );
});

Deno.test("C3 ① — LE COMPTE PORTE SON PROPRE ESSAI OU ABONNEMENT", () => {
  const seen = describeAccess({
    household: false,
    coachSolvent: false,
    appWriteAccess: true,
  });
  assertEquals(seen.state, ACCESS_OWN);
});

Deno.test("C3 ① — LE TROU MESURÉ: aucun des trois", () => {
  // 19 805 jetons. C'est la ligne qu'on veut pouvoir compter en SQL.
  const seen = describeAccess({
    household: false,
    coachSolvent: false,
    appWriteAccess: false,
  });
  assertEquals(seen.state, ACCESS_NONE);
  assertEquals(seen.household, false);
  assertEquals(seen.coach_solvent, false);
  assertEquals(seen.app_write_access, false);
});

Deno.test("C3 ① — UNE LECTURE RATÉE N'EST PAS UN TROU", () => {
  // ⚠️ LA MOITIÉ QUI REND LA MESURE UTILISABLE. « Je n'ai pas su lire » et « il
  // n'a aucun droit » sont deux faits différents; les confondre ferait grossir
  // le compteur à chaque panne de base, et on réparerait la mauvaise chose.
  const seen = describeAccess({
    household: false,
    coachSolvent: false,
    appWriteAccess: null,
  });
  assertEquals(seen.state, ACCESS_UNKNOWN);
});

Deno.test("C3 ① — PAS DE COACH N'EST PAS UNE PANNE", () => {
  // `coachSolvent: null` sur un compte sans coach est un FAIT, pas un doute:
  // il n'y avait rien à interroger. Le traiter comme inconnu masquerait le
  // trou derrière `unknown` exactement là où il est le plus probable.
  const seen = describeAccess({
    household: false,
    coachSolvent: null,
    appWriteAccess: false,
  });
  assertEquals(seen.state, ACCESS_NONE);
});

// ---------------------------------------------------------------------------
// 2. LES LECTURES — LEUR NOMBRE EST UN COÛT, ET IL EST TENU
// ---------------------------------------------------------------------------

function fakeAdmin(answers: Record<string, unknown>, opts: { fail?: string } = {}) {
  const calls: string[] = [];
  const admin = {
    rpc: (name: string, _params: Record<string, unknown>) => {
      calls.push(name);
      if (opts.fail === name) {
        return Promise.resolve({ data: null, error: { message: "boom" } });
      }
      return Promise.resolve({ data: answers[name] ?? null, error: null });
    },
  };
  return { admin, calls };
}

Deno.test("C3 ① — UN MEMBRE DE FOYER NE COÛTE AUCUNE LECTURE", () => {
  // Son droit est déjà tranché deux gardes plus haut. Deux lectures par
  // génération pour la population MAJORITAIRE, pour un mot qu'on connaît déjà,
  // seraient le genre de coût qu'on ajoute une fois et qu'on ne retire jamais.
  const { admin, calls } = fakeAdmin({});
  return readAccessFacts(admin, {
    userId: "u1",
    householdId: "h1",
    coachId: "c1",
  }).then((facts) => {
    assertEquals(calls, []);
    assertEquals(describeAccess(facts).state, ACCESS_HOUSEHOLD);
  });
});

Deno.test("C3 ① — SANS FOYER: les deux lectures, et rien de plus", async () => {
  const { admin, calls } = fakeAdmin({
    has_app_write_access: false,
    keel_coach_is_solvent: true,
  });
  const facts = await readAccessFacts(admin, {
    userId: "u1",
    householdId: null,
    coachId: "c1",
  });
  assertEquals(calls, ["has_app_write_access", "keel_coach_is_solvent"]);
  assertEquals(describeAccess(facts).state, ACCESS_COACH_SEAT);
});

Deno.test("C3 ① — SANS COACH, on n'interroge pas la solvabilité de personne", async () => {
  const { admin, calls } = fakeAdmin({ has_app_write_access: false });
  const facts = await readAccessFacts(admin, {
    userId: "u1",
    householdId: null,
    coachId: null,
  });
  assertEquals(calls, ["has_app_write_access"]);
  assertEquals(describeAccess(facts).state, ACCESS_NONE);
});

Deno.test("C3 ① — UNE LECTURE QUI ÉCHOUE NE LÈVE JAMAIS", async () => {
  // Une lecture d'OBSERVATION qui casserait une génération serait pire que le
  // trou qu'elle mesure.
  const { admin } = fakeAdmin({}, { fail: "has_app_write_access" });
  const facts = await readAccessFacts(admin, {
    userId: "u1",
    householdId: null,
    coachId: null,
  });
  assertEquals(facts.appWriteAccess, null);
  assertEquals(describeAccess(facts).state, ACCESS_UNKNOWN);
});

// ---------------------------------------------------------------------------
// 3. CE QUE CE LOT NE FAIT PAS — et c'est la décision
// ---------------------------------------------------------------------------

async function generatorSource(fn: string): Promise<string> {
  return await Deno.readTextFile(new URL(`${fn}/index.ts`, FUNCTIONS_DIR));
}

Deno.test("C3 ① — LE MODULE N'ÉCRIT RIEN, ET NE RÉÉCRIT AUCUNE RÈGLE", async () => {
  // Les définitions vivent en base (`has_app_write_access`,
  // `keel_coach_is_solvent`). Les recopier en TypeScript ferait deux vérités
  // qui divergeraient au premier ajustement — le motif écrit de
  // `keel_household_is_covered`.
  const src = await Deno.readTextFile(
    new URL("./solo_access.ts", import.meta.url),
  );
  for (const forbidden of [".insert(", ".update(", ".upsert(", ".delete("]) {
    assert(!src.includes(forbidden), `le module d'observation ÉCRIT (${forbidden})`);
  }
  for (const term of ["trial_end", "subscriptions", "current_period_end"]) {
    assert(
      !src.includes(`"${term}"`),
      `la règle de ${term} est recopiée ici au lieu d'être lue en base`,
    );
  }
  // Le cas qui passe: il DOIT nommer les deux définitions du dépôt.
  assert(src.includes("has_app_write_access"));
  assert(src.includes("keel_coach_is_solvent"));
});

// ===========================================================================
// C5 ⑤ — LA REQUÊTE DU REGISTRE COUVRE CE QU'ELLE PRÉTEND COUVRIR
//
// MESURÉ LE 2026-08-12, sur la base locale:
//
//     lane      | plan_kind | state            | count
//     meal      | household | not_instrumented |    39
//     meal      | personal  | coach_seat       |     1
//     meal      | personal  | not_instrumented |   104
//     week_plan |           | household        |     1
//     week_plan |           | not_instrumented |   274
//
// La requête écrite au registre lisait `student_generated_meals` SANS filtrer
// la nature: les 39 plans de FOYER (troisième porte, non instrumentée) et les
// 104 lignes d'AVANT le lot tombaient dans un même compartiment `null`. Et la
// seconde porte instrumentée écrit dans `student_week_plans`, que la requête ne
// lisait pas du tout.
//
// DÉCISION: on corrige la REQUÊTE, on n'instrumente pas la troisième porte.
// Elle est réservée au MAÎTRE, qui a un foyer par construction: son état serait
// `household` sur chaque ligne, toujours. La mesurer coûterait une clé de plus
// sur un chemin chaud pour un compartiment à valeur unique.
// ===========================================================================

Deno.test("C5 ⑤ — la requête du registre nomme les DEUX tables et la nature", async () => {
  const src = await Deno.readTextFile(
    new URL("./solo_access.ts", import.meta.url),
  );
  assert(
    src.includes("student_generated_meals"),
    "la table de la lane repas a disparu de la requête du registre",
  );
  assert(
    src.includes("student_week_plans"),
    "la requête du registre ne lit toujours pas `student_week_plans` — la " +
      "moitié de la mesure est invisible.",
  );
  assert(
    /where plan_kind = 'personal'/.test(src),
    "la requête compte les plans de FOYER avec les plans individuels: ils " +
      "tombent dans le même compartiment `null` que les lignes d'avant le lot.",
  );
  assert(
    src.includes("not_instrumented"),
    "les lignes d'AVANT le lot ne sont plus distinguées d'un état de runtime.",
  );
});

Deno.test("C5 ⑤ — LE `where` ET LA TROISIÈME PORTE TIENNENT ENSEMBLE", async () => {
  // ⚠️ SI QUELQU'UN INSTRUMENTE LA PORTE DU FOYER, LE `where plan_kind =
  // 'personal'` DEVIENT FAUX — il jetterait la mesure neuve. Les deux moitiés
  // sont donc épinglées ensemble: la première qui bouge fait tomber ce test, et
  // c'est le seul moment où l'on peut encore réparer les deux d'un coup.
  const generator = await generatorSource("generate-household-meal-v1");
  const module = await Deno.readTextFile(
    new URL("./solo_access.ts", import.meta.url),
  );
  const instrumented = generator.includes("describeAccess(");
  const filtered = /where plan_kind = 'personal'/.test(module);
  assertEquals(
    instrumented,
    false,
    "la porte du foyer mesure désormais le droit d'accès. Ce n'est pas un " +
      "défaut — mais la requête du registre doit alors PERDRE son `where " +
      "plan_kind = 'personal'`, sinon elle jette la mesure neuve.",
  );
  assertEquals(
    filtered,
    true,
    "le `where` a disparu alors que la porte du foyer n'est toujours pas " +
      "instrumentée: les plans de foyer repartent dans le compartiment " +
      "indistinct.",
  );
});

Deno.test("C5 ⑨ — l'inatteignabilité de `none` en local est ÉCRITE", async () => {
  // `app_config.disable_write_gate = 'true'` fait retourner `true` à
  // `has_app_write_access` AVANT toute lecture de `profiles.trial_end` ou de
  // `subscriptions` (vérifié dans `prosrc` le 2026-08-12). Tout compte local est
  // donc au pire `own_subscription_or_trial`: l'état `none` — celui que ce lot
  // existe pour compter — ne peut PAS apparaître en local.
  //
  // Sans cette phrase, la prochaine session mesurerait zéro `none` et
  // conclurait que le trou n'existe pas.
  const src = await Deno.readTextFile(
    new URL("./solo_access.ts", import.meta.url),
  );
  assert(
    src.includes("disable_write_gate"),
    "le registre ne dit plus que `none` est inatteignable en local: on y " +
      "mesurera zéro, et on en conclura que le trou n'existe pas.",
  );
});
