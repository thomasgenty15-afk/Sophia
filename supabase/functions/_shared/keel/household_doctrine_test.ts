// O7 — LA DOCTRINE D'UN MEMBRE DE FOYER SE RÉSOUT PAR LE FOYER.
//
// Le test qui compte le plus est celui qui PASSE: « un titulaire qui a son
// propre coach garde le sien, et le foyer n'est même pas lu ». Sans lui, un
// repli qui écraserait tout le monde ressemblerait trait pour trait à un repli
// qui marche — c'est la cicatrice « une garde a besoin d'un cas qui passe ».

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  loadDoctrineForCaller,
  resolveHouseholdOwnerUserId,
} from "./household_doctrine.ts";

// ---------------------------------------------------------------------------
// LE FAUX — il DISTINGUE LES FILTRES, et c'est tout l'intérêt
//
// Le faux de `doctrine_loader_test.ts` est indexé par TABLE. Ici il ne
// suffirait pas: le repli lit `coach_clients` DEUX fois, une fois pour
// l'appelant (qui n'a rien) et une fois pour le maître (qui a un coach). Un
// faux qui rend la même chose aux deux ne peut pas distinguer « le repli a
// servi » de « l'appelant avait déjà un coach », donc il rendrait le lot
// entier faux-vert.
// ---------------------------------------------------------------------------

type Filters = Record<string, string>;
type Outcome = { data?: unknown; error?: unknown; throws?: boolean };
type Handler = (filters: Filters) => Outcome;

function fakeDb(byTable: Record<string, Handler>) {
  const calls: Array<{ table: string; filters: Filters }> = [];
  const chain = (table: string) => {
    const filters: Filters = {};
    const settle = () => {
      calls.push({ table, filters: { ...filters } });
      const handler = byTable[table];
      const outcome = handler ? handler(filters) : { data: null };
      if (outcome.throws) throw new Error("connection reset");
      return Promise.resolve({
        data: outcome.data ?? null,
        error: outcome.error ?? null,
      });
    };
    const node: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        filters[column] = String(value);
        return node;
      },
      not: () => node,
      order: () => node,
      limit: () => node,
      maybeSingle: settle,
      // THENABLE, comme un vrai constructeur PostgREST: `coach_food_items` est
      // attendu sans `maybeSingle`.
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        try {
          return settle().then(resolve, reject);
        } catch (err) {
          return Promise.resolve().then(() => reject(err));
        }
      },
    };
    return node;
  };
  return {
    db: { from: (table: string) => ({ select: () => chain(table) }) },
    calls,
  };
}

const CALLER = "user-secondary";
const OWNER = "user-owner";
const HOUSE = "house-1";

function doctrineRow(coachId: string) {
  return {
    coach_id: coachId,
    version: 3,
    beliefs: [
      {
        key: "protein_first",
        claim: "Protein first",
        goalScope: [],
      },
      {
        key: "bulk_hard",
        claim: "Eat above maintenance",
        goalScope: ["muscle_gain"],
      },
    ],
    forbidden: [],
    vocabulary: [],
    arbitrations: [],
    voice: { address: "tu", length: "short" },
    content_locale: "fr-FR",
    published_at: "2026-08-01T10:00:00Z",
  };
}

/** Le décor complet: qui a un coach, qui est maître, et l'objectif de chacun. */
function world(opts: {
  callerCoach?: string | null;
  ownerCoach?: string | null;
  ownerUserId?: string | null;
  callerGoal?: string | null;
  ownerGoal?: string | null;
  householdThrows?: boolean;
}) {
  return fakeDb({
    student_goals: (f) => ({
      data: f.user_id === OWNER
        ? { goal: opts.ownerGoal ?? "fat_loss" }
        : { goal: opts.callerGoal ?? null },
    }),
    coach_clients: (f) => {
      const coach = f.student_user_id === OWNER
        ? opts.ownerCoach ?? null
        : opts.callerCoach ?? null;
      return { data: coach ? { coach_id: coach } : null };
    },
    household_members: () =>
      opts.householdThrows
        ? { throws: true }
        : { data: opts.ownerUserId === null ? null : { user_id: opts.ownerUserId ?? OWNER } },
    coaches: (f) => ({
      data: { display_name: `Coach ${f.id ?? "?"}`, coach_kind: "human", doctrine_source: "own" },
    }),
    coach_doctrines: (f) => ({ data: doctrineRow(f.coach_id ?? "coach-?") }),
    coach_food_items: () => ({ data: [] }),
  });
}

// ---------------------------------------------------------------------------
// 1. LE CAS QUI PASSE — un titulaire qui a SON coach garde le sien
// ---------------------------------------------------------------------------

Deno.test("O7 — UN TITULAIRE QUI A SON PROPRE COACH GARDE LE SIEN", async () => {
  const { db, calls } = world({ callerCoach: "coach-own", ownerCoach: "coach-house" });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: HOUSE,
    goal: "muscle_gain",
  });
  assertEquals(out.doctrine.coachId, "coach-own");
  assertEquals(out.viaHousehold, false);
  assertEquals(out.subjectUserId, CALLER);
  // ⚠️ ET LE FOYER N'EST MÊME PAS LU. Un repli qui lirait le foyer à chaque
  // appel coûterait une requête à toute la population qui n'en a pas besoin, et
  // surtout: la lecture est la seule preuve que le repli n'est PAS le chemin
  // nominal.
  assert(
    !calls.some((c) => c.table === "household_members"),
    "le foyer a été lu alors que l'appelant a son propre coach",
  );
});

// ---------------------------------------------------------------------------
// 2. LE REPLI — un secondaire sans coach compose sous celui du maître
// ---------------------------------------------------------------------------

Deno.test("O7 — SANS COACH À LUI, LA DOCTRINE VIENT DU MAÎTRE DU FOYER", async () => {
  const { db, calls } = world({ callerCoach: null, ownerCoach: "coach-of-owner" });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: HOUSE,
    goal: "muscle_gain",
  });
  assertEquals(out.doctrine.coachId, "coach-of-owner");
  assertEquals(out.viaHousehold, true);
  assertEquals(out.subjectUserId, OWNER);
  assertEquals(out.ownerUserId, OWNER);
  assertEquals(out.doctrine.reason, "loaded");
  // Le foyer a été lu PAR SON ID, celui que l'appelant avait déjà résolu — et
  // jamais par une seconde résolution « quel foyer est celui de cette
  // personne ».
  const householdCall = calls.find((c) => c.table === "household_members");
  assert(householdCall, "le foyer n'a pas été lu");
  assertEquals(householdCall?.filters.household_id, HOUSE);
  assertEquals(householdCall?.filters.role, "owner");
  assert(
    !("user_id" in (householdCall?.filters ?? {})),
    "le foyer a été re-résolu par `user_id` au lieu de consommer l'id déjà résolu",
  );
});

Deno.test("O7 — LA VARIANTE SUIT L'APPELANT, JAMAIS L'OBJECTIF DU MAÎTRE", async () => {
  // ⚠️ LE DÉFAUT QUE CE TEST EXISTE POUR EMPÊCHER. `loadPublishedDoctrine` lit
  // `student_goals` DU COMPTE QU'ON LUI PASSE. Sur le repli, ce compte est le
  // maître: sans `goalOverride`, un secondaire en `muscle_gain` recevrait la
  // variante `fat_loss` de son maître, et les croyances écrites pour la prise
  // de masse ne l'atteindraient jamais.
  const { db } = world({
    callerCoach: null,
    ownerCoach: "coach-of-owner",
    callerGoal: "muscle_gain",
    ownerGoal: "fat_loss",
  });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: HOUSE,
    goal: "muscle_gain",
  });
  assertEquals(out.doctrine.goal, "muscle_gain");
  assertEquals(out.doctrine.goalSource, "override");
  // Et ça se voit sur ce qui est SERVI, pas seulement sur un jeton: la
  // conviction portée pour `muscle_gain` est dans le bloc compilé.
  assert(
    out.doctrine.compiled?.text.includes("Eat above maintenance"),
    "la croyance de prise de masse n'a pas été servie: la variante servie est " +
      "celle du maître.",
  );
});

Deno.test("O7 — un objectif ABSENT sert la variante `default`, pas `health`", async () => {
  const { db } = world({ callerCoach: null, ownerCoach: "coach-of-owner" });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: HOUSE,
    goal: null,
  });
  assertEquals(out.doctrine.goal, null);
  assertEquals(out.doctrine.goalSource, "none");
  assert(
    !out.doctrine.compiled?.text.includes("Eat above maintenance"),
    "une croyance portée par `muscle_gain` a été servie à quelqu'un sans objectif",
  );
});

// ---------------------------------------------------------------------------
// 3. LES TROIS FAÇONS DE NE TROUVER PERSONNE — toutes rendent `no_coach`
// ---------------------------------------------------------------------------

Deno.test("O7 — SANS FOYER NI COACH, LE REFUS SURVIT", async () => {
  const { db, calls } = world({ callerCoach: null });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: null,
    goal: "maintenance",
  });
  assertEquals(out.doctrine.coachId, null);
  assertEquals(out.doctrine.reason, "no_coach");
  assertEquals(out.viaHousehold, false);
  assertEquals(out.subjectUserId, null);
  assert(!calls.some((c) => c.table === "household_members"));
});

Deno.test("O7 — LE MAÎTRE NON PLUS N'A PAS DE COACH: `no_coach`, pas une exception", async () => {
  const { db } = world({ callerCoach: null, ownerCoach: null });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: HOUSE,
    goal: "maintenance",
  });
  assertEquals(out.doctrine.coachId, null);
  assertEquals(out.doctrine.reason, "no_coach");
  assertEquals(out.viaHousehold, false);
  // Le maître A été retrouvé, et c'est tracé: « ce foyer n'a pas de maître » et
  // « son maître n'a pas de coach » ne se réparent pas pareil.
  assertEquals(out.ownerUserId, OWNER);
  assertEquals(out.ownerLookupFailed, false);
});

Deno.test("O7 — un foyer dont la ligne maître n'a plus de compte ne prête rien", async () => {
  // `household_members_user_id_fkey` est `on delete set null` (20260811040000):
  // un maître supprimé laisse une bouche à table sans compte. Il n'y a alors
  // aucun coach à emprunter, et c'est un état légitime, pas une panne.
  const { db } = world({ callerCoach: null, ownerCoach: "coach-of-owner", ownerUserId: null });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: HOUSE,
    goal: "maintenance",
  });
  assertEquals(out.doctrine.coachId, null);
  assertEquals(out.viaHousehold, false);
  assertEquals(out.ownerUserId, null);
});

Deno.test("O7 — LE MAÎTRE, C'EST MOI: aucun second chargement", async () => {
  const { db, calls } = world({ callerCoach: null, ownerCoach: null, ownerUserId: CALLER });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: HOUSE,
    goal: "maintenance",
  });
  assertEquals(out.doctrine.coachId, null);
  assertEquals(out.viaHousehold, false);
  assertEquals(out.ownerUserId, CALLER);
  // Une seule lecture de `coach_clients`: relire sa propre ligne rendrait la
  // même chose pour une requête de plus, et c'est aussi ce qui interdit la
  // boucle.
  assertEquals(calls.filter((c) => c.table === "coach_clients").length, 1);
});

Deno.test("O7 — la lecture du maître en PANNE dégrade vers `no_coach`, sans lever", async () => {
  const { db } = world({ callerCoach: null, ownerCoach: "coach-of-owner", householdThrows: true });
  const out = await loadDoctrineForCaller(db, {
    userId: CALLER,
    householdId: HOUSE,
    goal: "maintenance",
  });
  assertEquals(out.doctrine.coachId, null);
  assertEquals(out.viaHousehold, false);
  assertEquals(out.ownerLookupFailed, true);
});

// ---------------------------------------------------------------------------
// 4. LE LECTEUR DE MAÎTRE, SEUL
// ---------------------------------------------------------------------------

Deno.test("`resolveHouseholdOwnerUserId` filtre sur le foyer ET sur le rôle", async () => {
  const { db, calls } = fakeDb({
    household_members: () => ({ data: { user_id: OWNER } }),
  });
  assertEquals(await resolveHouseholdOwnerUserId(db, HOUSE), OWNER);
  assertEquals(calls[0].filters, { household_id: HOUSE, role: "owner" });
  // Un foyer vide ne lève pas et ne lit rien.
  const empty = fakeDb({ household_members: () => ({ data: null }) });
  assertEquals(await resolveHouseholdOwnerUserId(empty.db, "   "), null);
  assertEquals(empty.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 5. LA GARDE DE FACTURATION — ce module N'ÉCRIT RIEN
// ---------------------------------------------------------------------------

/**
 * Le code SANS ses commentaires. Cicatrice du dépôt: « un audit d'appelants au
 * grep naïf compte des faux vivants » — et l'en-tête de ce module cite tous les
 * noms qu'on cherche (`coach_clients`, `keel_role`, `siège`).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

Deno.test("O7 — LE REPLI N'ÉCRIT AUCUNE LIGNE, ET LA FACTURATION NE BOUGE PAS", async () => {
  // ⚠️ C'EST LA GARDE DE L'ARBITRAGE, PAS UN DÉTAIL DE STYLE. Les deux sorties
  // écartées (rattacher au coach maison, rattacher au coach du maître) créent
  // toutes les deux une ligne `coach_clients` — donc un siège, donc un effet
  // sur `trial_seat_limit` et le paywall J+15. Celle qu'on a prise ne crée
  // RIEN. Le jour où quelqu'un rouvre la sortie écartée sans rouvrir
  // l'arbitrage, ce test tombe.
  const src = stripComments(
    await Deno.readTextFile(new URL("./household_doctrine.ts", import.meta.url)),
  );
  for (const forbidden of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
    assert(
      !src.includes(forbidden),
      `le repli par le foyer écrit (${forbidden}). Il ne doit RIEN écrire: ` +
        `une ligne créée est un siège, et un siège est une décision de ` +
        `facturation que ce lot n'a pas prise.`,
    );
  }
  assert(
    !src.includes("coach_clients"),
    "le repli nomme `coach_clients`: c'est la table des sièges, et ce module " +
      "ne doit ni la lire ni l'écrire — le chargeur de doctrine s'en charge.",
  );
  assert(
    !src.includes("keel_role"),
    "le repli touche `profiles.keel_role`.",
  );
  // ET LE CAS QUI PASSE: le module DOIT nommer ce sur quoi il travaille, sans
  // quoi la garde ci-dessus serait verte sur un fichier vide.
  assert(src.includes("household_members"), "le module ne lit plus le foyer");
  assert(src.includes("loadPublishedDoctrine"), "le module ne charge plus de doctrine");
});

Deno.test("O7 — LE GÉNÉRATEUR PASSE PAR LA PORTE, et ne rouvre pas le chemin direct", async () => {
  // Si `generate-meal-v1` réimportait `loadPublishedDoctrine`, le repli
  // deviendrait un appel qu'un futur relecteur peut retirer sans que rien
  // n'échoue — et le secondaire retomberait sur `no_coach` en silence.
  const src = stripComments(
    await Deno.readTextFile(
      new URL("../../generate-meal-v1/index.ts", import.meta.url),
    ),
  );
  assert(
    src.includes("loadDoctrineForCaller"),
    "le générateur n'appelle plus la résolution par le foyer",
  );
  assert(
    !src.includes("loadPublishedDoctrine"),
    "le générateur a rouvert le chemin direct vers le chargeur de doctrine: " +
      "le repli par le foyer est alors contournable.",
  );
  assert(
    !src.includes("coach_clients") && !src.includes("keel_role"),
    "le générateur écrit dans la table des sièges ou dans le rôle.",
  );
  // ⚠️ LE MAPPING ALIMENTAIRE SUIT LE MÊME COMPTE QUE LA DOCTRINE. Lire celui
  // de l'appelant sur un repli rendrait un HYBRIDE que personne n'a écrit — les
  // convictions d'un coach et les aliments d'aucun. Le défaut serait
  // parfaitement silencieux: pas de mapping = pas de bloc.
  assert(
    !/loadPublishedProtocol\(\s*admin,\s*userId/.test(src),
    "le mapping alimentaire est lu sur l'APPELANT: sur un repli par le foyer, " +
      "le plan suivrait la méthode d'un coach et les aliments d'aucun.",
  );
  assert(
    src.includes("resolvedDoctrine.subjectUserId"),
    "le mapping alimentaire ne suit plus le compte dont la doctrine a servi.",
  );
  // LE FOYER N'EST RÉSOLU QU'UNE FOIS: `resolveHouseholdIdFor` apparaît une
  // seule fois hors import.
  assertEquals(
    src.split("resolveHouseholdIdFor").length - 1,
    2,
    "`resolveHouseholdIdFor` n'est plus appelée exactement une fois (import " +
      "compris): une seconde résolution du foyer a été ajoutée.",
  );
});

// ---------------------------------------------------------------------------
// O7 — LE PLAN DE LA SEMAINE : TEST RETIRÉ AVEC SA LANE, LE 2026-08-19
// ---------------------------------------------------------------------------
//
// Il y avait ici « O7 — LE PLAN DE LA SEMAINE PASSE PAR LA MÊME PORTE (C2 ①) ».
// Il lisait `generate-week-plan-v1/index.ts` de bout en bout et gardait, sur
// CETTE lane, quatre propriétés: le repli de doctrine par le foyer, l'absence
// de lecture directe de `coach_clients`, la résolution unique du foyer, et le
// gel 402 avant le premier appel modèle.
//
// La lane a été retirée (aucun appelant vivant, décision du 2026-08-19). Le
// test ne pouvait plus ouvrir son fichier.
//
// ⚠️ AUCUNE de ces propriétés n'a été abandonnée — VÉRIFIÉ, pas supposé, et
// chacune est nommée avec son gardien restant:
//   · repli par le foyer, `loadPublishedDoctrine` fermé, `coach_clients` et
//     `keel_role` absents, foyer résolu UNE fois → « O7 — LE GÉNÉRATEUR PASSE
//     PAR LA PORTE », juste au-dessus, sur `generate-meal-v1`;
//   · gel 402 AVANT le premier appel modèle, motif nommé, `skipErrorLog` →
//     `household_freeze_test.ts`, sur `generate-meal-v1` ET
//     `generate-household-meal-v1`.
// Ce qui disparaît est la TROISIÈME copie, pas la garde.
