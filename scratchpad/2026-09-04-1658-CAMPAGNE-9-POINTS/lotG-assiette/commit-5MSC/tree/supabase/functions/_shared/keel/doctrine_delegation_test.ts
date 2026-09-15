// doctrine_delegation.ts — déléguer sa doctrine à la maison.
//
// Les tests qui portent la doctrine de ce fichier:
//   * « un coach qui délègue signe du nom de la MAISON »
//     -- c'est la totalité de la valeur du chemin. « Une doctrine générique qui
//        devient la tienne » serait un mensonge, et c'est le mensonge qui casse
//        la promesse sur laquelle repose tout le produit.
//   * « la maison introuvable ne fait PAS retomber sur la doctrine du coach »
//     -- elle dort exprès (réversibilité). La ressusciter servirait à ses élèves
//        une méthode qu'il a explicitement retirée, signée de son nom.
//   * « la bascule marche dans les DEUX sens »
//     -- c'est le genre de chose qu'on n'implémente que dans un sens quand on ne
//        l'écrit pas.
//   * « déléguer ne touche pas la facturation »
//     -- emprunter la doctrine de la maison ne fait pas de vous la maison.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  decideDoctrineOwner,
  DOCTRINE_SOURCES,
  parseDoctrineSource,
  resolveDoctrineOwner,
} from "./doctrine_delegation.ts";
import { loadPublishedDoctrine } from "./doctrine_loader.ts";

const HOUSE = { id: "house-1", displayName: "Sophia" };

// ---------------------------------------------------------------------------
// LA DÉCISION — pure
// ---------------------------------------------------------------------------

Deno.test("sans délégation, le coach sert SA doctrine et signe de son nom", () => {
  assertEquals(
    decideDoctrineOwner({
      coachId: "coach-1",
      coachKind: "human",
      doctrineSource: "own",
      coachDisplayName: "Marc",
      house: HOUSE,
    }),
    { doctrineCoachId: "coach-1", displayName: "Marc", delegated: false },
  );
});

Deno.test("un coach qui délègue lit la doctrine de la maison ET signe de son nom", () => {
  // LES DEUX ENSEMBLE, jamais l'un sans l'autre. La méthode de la maison servie
  // sous le nom du coach est exactement le mensonge que ce chemin évite.
  const out = decideDoctrineOwner({
    coachId: "coach-1",
    coachKind: "human",
    doctrineSource: "house",
    coachDisplayName: "Marc",
    house: HOUSE,
  });
  assertEquals(out, { doctrineCoachId: "house-1", displayName: "Sophia", delegated: true });
});

Deno.test("la maison introuvable ne ressuscite PAS la doctrine du coach", () => {
  // Elle dort exprès: on ne la supprime pas en déléguant, pour que la bascule
  // soit réversible. Y retomber servirait à ses élèves une méthode qu'il a
  // retirée, signée de son nom — c'est-à-dire précisément ce qu'il a demandé
  // qu'on ne fasse plus. Le repli sûr est « aucune méthode, aucune signature ».
  const out = decideDoctrineOwner({
    coachId: "coach-1",
    coachKind: "human",
    doctrineSource: "house",
    coachDisplayName: "Marc",
    house: null,
  });
  assertEquals(out, { doctrineCoachId: null, displayName: null, delegated: true });
});

Deno.test("la MAISON ne délègue jamais à elle-même", () => {
  // La base l'interdit (`coaches_house_never_delegates_check`); on le redit ici
  // parce qu'un résolveur qui ferait confiance à la contrainte boucle le jour
  // où quelqu'un la retire.
  const out = decideDoctrineOwner({
    coachId: "house-1",
    coachKind: "house",
    doctrineSource: "house",
    coachDisplayName: "Sophia",
    house: HOUSE,
  });
  assertEquals(out.delegated, false);
  assertEquals(out.doctrineCoachId, "house-1");
});

Deno.test("un jeton illisible retombe sur `own`, jamais sur `house`", () => {
  // La direction compte: relire un jeton cassé comme `house` ferait signer les
  // messages d'un coach d'un AUTRE nom que le sien, sans qu'il l'ait demandé.
  for (const raw of [null, undefined, "", "  ", "HOUSE", "maison", 42, {}]) {
    assertEquals(parseDoctrineSource(raw), "own", `${JSON.stringify(raw)}`);
  }
  assertEquals(parseDoctrineSource("house"), "house");
  assertEquals([...DOCTRINE_SOURCES], ["own", "house"]);
});

Deno.test("un coach maison SANS nom ne signe pas plutôt que de signer mal", () => {
  const out = decideDoctrineOwner({
    coachId: "coach-1",
    coachKind: "human",
    doctrineSource: "house",
    coachDisplayName: "Marc",
    house: { id: "house-1", displayName: "   " },
  });
  assertEquals(out.displayName, null);
  assertEquals(out.doctrineCoachId, "house-1");
});

// ---------------------------------------------------------------------------
// LA LECTURE — un faux qui distingue les DEUX requêtes sur `coaches`
// ---------------------------------------------------------------------------

/**
 * Le résolveur lit `coaches` DEUX fois: le coach, puis la maison. Un faux
 * indexé par table seule les confondrait et rendrait le test vert sur un
 * résolveur cassé. Celui-ci filtre comme PostgREST le ferait.
 */
function fakeDb(rows: {
  coaches?: Array<Record<string, unknown>>;
  coach_clients?: Array<Record<string, unknown>>;
  coach_doctrines?: Array<Record<string, unknown>>;
  coach_food_items?: Array<Record<string, unknown>>;
  student_goals?: Array<Record<string, unknown>>;
}) {
  const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const chain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const matching = () =>
      (rows[table as keyof typeof rows] ?? []).filter((r) =>
        Object.entries(filters).every(([k, v]) => r[k] === v)
      );
    const settle = (single: boolean) => {
      reads.push({ table, filters: { ...filters } });
      const found = matching();
      return Promise.resolve({
        data: single ? (found[0] ?? null) : found,
        error: null,
      });
    };
    const node: Record<string, unknown> = {
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return node;
      },
      not: () => node,
      order: () => node,
      limit: () => node,
      maybeSingle: () => settle(true),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        settle(false).then(res, rej),
    };
    return node;
  };
  return { db: { from: (t: string) => ({ select: () => chain(t) }) }, reads };
}

const HOUSE_ROW = {
  id: "house-1",
  display_name: "Sophia",
  coach_kind: "house",
  doctrine_source: "own",
  status: "active",
};

Deno.test("resolveDoctrineOwner ne lit la maison QUE si le coach délègue", async () => {
  // Une requête de plus par tour, pour tous les coachs dont l'écrasante
  // majorité ne délègue pas, se paierait sur chaque message du produit.
  const { db, reads } = fakeDb({
    coaches: [
      { id: "coach-1", display_name: "Marc", coach_kind: "human", doctrine_source: "own" },
      HOUSE_ROW,
    ],
  });
  const out = await resolveDoctrineOwner(db, "coach-1");
  assertEquals(out, { doctrineCoachId: "coach-1", displayName: "Marc", delegated: false });
  assertEquals(reads.length, 1);
});

Deno.test("resolveDoctrineOwner va chercher la maison quand il délègue", async () => {
  const { db, reads } = fakeDb({
    coaches: [
      { id: "coach-1", display_name: "Marc", coach_kind: "human", doctrine_source: "house" },
      HOUSE_ROW,
    ],
  });
  const out = await resolveDoctrineOwner(db, "coach-1");
  assertEquals(out, { doctrineCoachId: "house-1", displayName: "Sophia", delegated: true });
  assertEquals(reads.length, 2);
  // La seconde lecture cherche bien LE coach maison ACTIF, pas n'importe qui.
  assertEquals(reads[1].filters, { coach_kind: "house", status: "active" });
});

// ---------------------------------------------------------------------------
// BOUT EN BOUT — ce que l'élève reçoit
// ---------------------------------------------------------------------------

const MARC_DOCTRINE = {
  coach_id: "coach-1",
  version: 2,
  beliefs: [{ claim: "Le jeûne est la colonne vertébrale" }],
  forbidden: [],
  vocabulary: [],
  arbitrations: [],
  qa: [],
  voice: {},
  content_locale: "fr-FR",
  published_at: "2026-08-01T10:00:00Z",
};

const HOUSE_DOCTRINE = {
  coach_id: "house-1",
  version: 1,
  beliefs: [{ claim: "De la vraie nourriture, la plupart du temps" }],
  forbidden: [],
  vocabulary: [],
  arbitrations: [],
  qa: [],
  voice: {},
  content_locale: "en",
  published_at: "2026-08-01T10:00:00Z",
};

function worldWhere(doctrineSource: string) {
  return fakeDb({
    student_goals: [],
    coach_clients: [{ student_user_id: "student-1", coach_id: "coach-1", status: "active" }],
    coaches: [
      { id: "coach-1", display_name: "Marc", coach_kind: "human", doctrine_source: doctrineSource },
      HOUSE_ROW,
    ],
    coach_doctrines: [MARC_DOCTRINE, HOUSE_DOCTRINE],
    coach_food_items: [
      { coach_id: "coach-1", label: "huile de tournesol", stance: "excluded" },
    ],
  });
}

Deno.test("l'élève d'un coach qui délègue reçoit la méthode de la MAISON, signée Sophia", async () => {
  const { db } = worldWhere("house");
  const loaded = await loadPublishedDoctrine(db, "student-1");

  assertEquals(loaded.reason, "loaded");
  // Le coach de l'élève reste Marc — c'est lui qui le suit, et c'est sur lui
  // que branchent les incidents et la facturation.
  assertEquals(loaded.coachId, "coach-1");
  // Mais la méthode et la signature sont celles de la maison.
  assertEquals(loaded.coachDisplayName, "Sophia");
  assert(loaded.compiled?.text.includes("De la vraie nourriture"));
  assert(!loaded.compiled?.text.includes("colonne vertébrale"));
  // L'en-tête du bloc — ce que le modèle lit en premier — porte le bon nom.
  assert(loaded.compiled?.text.startsWith("== SOPHIA'S METHOD"));

  // ET SES ALIMENTS ÉCARTÉS PARTENT AVEC LE RESTE. Les garder produirait un
  // hybride que personne n'a écrit: la méthode de la maison, plus les
  // exclusions d'un coach dont l'agent ne prononce même plus le nom.
  assertEquals(loaded.doctrine?.foods.discouraged, []);
});

Deno.test("la bascule marche dans les DEUX sens", async () => {
  // Le coach qui décide plus tard d'écrire sa méthode reprend la main, et
  // l'agent resigne de son nom. Sa doctrine n'a pas été touchée pendant la
  // délégation: elle dormait.
  const delegated = await loadPublishedDoctrine(worldWhere("house").db, "student-1");
  assertEquals(delegated.coachDisplayName, "Sophia");

  const back = await loadPublishedDoctrine(worldWhere("own").db, "student-1");
  assertEquals(back.coachDisplayName, "Marc");
  assert(back.compiled?.text.includes("colonne vertébrale"));
  assert(back.compiled?.text.startsWith("== MARC'S METHOD"));
  // Et ses aliments écartés lui reviennent avec elle.
  assertEquals(back.doctrine?.foods.discouraged.map((f) => f.term), ["huile de tournesol"]);
});

Deno.test("déléguer sans maison joignable ne sert AUCUNE méthode", async () => {
  const { db } = fakeDb({
    student_goals: [],
    coach_clients: [{ student_user_id: "student-1", coach_id: "coach-1", status: "active" }],
    // Pas de ligne `house`: la maison est introuvable.
    coaches: [
      { id: "coach-1", display_name: "Marc", coach_kind: "human", doctrine_source: "house" },
    ],
    coach_doctrines: [MARC_DOCTRINE],
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.reason, "no_published_doctrine");
  assertEquals(loaded.doctrine, null);
  // ⚠️ LE POINT: la doctrine de Marc existe et est publiée, et on ne la sert
  // PAS. Personne ne parle au nom de personne.
  assertEquals(loaded.coachDisplayName, null);
});
