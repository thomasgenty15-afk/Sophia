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
// ===========================================================================

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

Deno.test("C3 ① — AUCUNE DES DEUX PORTES NE REFUSE SUR CE DROIT", async () => {
  // ⚠️ LE PIÈGE NOMMÉ. `has_app_write_access` précède KEEL: la brancher comme
  // garde couperait, dès le déploiement, les membres de foyer (dont le droit
  // est celui du foyer) et les élèves dont le siège est payé par leur coach.
  // « Un refus qui coupe un client qui paie ne se répare par aucun nouvel
  // essai. » Ce test tient l'ABSENCE de ce refus.
  for (const fn of ["generate-meal-v1", "generate-week-plan-v1"]) {
    const src = await generatorSource(fn);
    const at = src.indexOf("describeAccess(");
    assert(at >= 0, `${fn}: la mesure a disparu`);
    // Les 1 200 caractères qui suivent la mesure: c'est là qu'un refus se
    // glisserait, et nulle part ailleurs.
    const around = src.slice(at, at + 1200);
    assert(
      !/status:\s*40[23]/.test(around),
      `${fn}: un refus a été branché sur le droit d'accès. C'est une règle de ` +
        `FACTURATION que personne n'a décidée, et elle coupe des clients qui ` +
        `paient.`,
    );
    assert(
      !/access\.state\s*===\s*ACCESS_NONE\s*\)\s*\{\s*\n\s*return jsonResponse/
        .test(src),
      `${fn}: le trou est devenu un refus.`,
    );
  }
});

Deno.test("C3 ① — LA MESURE EST ÉCRITE SUR LA LIGNE, pas seulement journalisée", async () => {
  // Un journal de runtime s'efface; le plan reste. C'est ce qui rend la
  // question ouverte n°1 comptable en SQL:
  //   select generated_from -> 'access' ->> 'state', count(*) …
  //
  // ⚠️ ÉCRITE MÊME QUAND TOUT VA BIEN: une clé qui n'apparaîtrait que sur le
  // cas `none` ne se distinguerait pas d'un lot débranché — ce dépôt paie en
  // boucle la garde construite puis silencieusement débranchée.
  for (const fn of ["generate-meal-v1", "generate-week-plan-v1"]) {
    const src = await generatorSource(fn);
    assert(
      /\n\s+access,\n/.test(src),
      `${fn}: \`access\` n'entre plus dans \`generated_from\`.`,
    );
    assert(
      !/\.\.\.\(access\.state/.test(src),
      `${fn}: \`access\` est devenu conditionnel — absent, il ne se distingue ` +
        `plus d'un lot débranché.`,
    );
  }
});

Deno.test("C3 ① — LA MESURE EST FAITE AVANT TOUT APPEL MODÈLE", async () => {
  // Sinon elle ne dirait rien du cas qu'elle existe pour compter: un compte
  // sans droit qui a déjà dépensé.
  for (const fn of ["generate-meal-v1", "generate-week-plan-v1"]) {
    const src = await generatorSource(fn);
    const measured = src.indexOf("describeAccess(");
    const model = src.indexOf("generateWithGemini(");
    assert(measured >= 0 && model >= 0, `${fn}: marqueurs introuvables`);
    assert(measured < model, `${fn}: la mesure est APRÈS l'appel modèle`);
  }
});

Deno.test("C3 ① — LES DEUX PORTES COMPTENT SOUS LE MÊME TAG", async () => {
  // La question porte sur un COMPTE, pas sur une porte: deux tags ne se
  // totalisent pas, et personne ne s'en aperçoit.
  assertEquals(ACCESS_LOG_TAG, "keel.access.observed");
  for (const fn of ["generate-meal-v1", "generate-week-plan-v1"]) {
    const src = await generatorSource(fn);
    assert(
      src.includes("tag: ACCESS_LOG_TAG"),
      `${fn}: le tag est recopié à la main ou a disparu.`,
    );
  }
});

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
