import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type HouseholdBodyMember,
  loadHouseholdMemberBodies,
} from "./household_bodies.ts";
import { householdBodyFacts } from "./meal_body.ts";
import { buildPortionBrief, type PortionMember } from "./household_portions.ts";

/**
 * LOT 3B — LE CORPS SUR LE CHEMIN DU FOYER.
 *
 * Autorité produit: `docs/keel/CHANTIER-FOYER-PROFILS.md` §« Lot 3B ».
 *
 * Ce fichier prouve les quatre garanties qui ne se prouvent QUE sur le chargeur,
 * parce qu'elles portent sur l'appariement, sur l'arbitrage d'échec et sur le
 * coût — trois choses qu'un module pur ne voit pas.
 */

// ⚠️ LES IDENTIFIANTS DE MEMBRE DIFFÈRENT DES IDENTIFIANTS DE COMPTE, ET C'EST
// TOUT L'INTÉRÊT DU DÉCOR. Même patron que `household_turn_context_test.ts`:
// les réutiliser ferait passer un chargeur qui rend ses résultats clés sur
// `user_id`, c'est-à-dire un chargeur dont AUCUN corps n'atteindrait jamais le
// brief de portions — lequel ne connaît que `member_id`. Le repli silencieux
// serait « personne n'a de corps », soit exactement le produit d'avant ce lot.
const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MARC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ANA_MEMBER = "11111111-1111-4111-8111-111111111111";
const MARC_MEMBER = "22222222-2222-4222-8222-222222222222";
/** Léo a huit ans: pas d'adresse e-mail, donc pas de compte. Cas NOMINAL. */
const LEO_MEMBER = "33333333-3333-4333-8333-333333333333";

const TODAY = "2026-08-10";

const MIXED_HOUSEHOLD: HouseholdBodyMember[] = [
  { memberId: ANA_MEMBER, userId: ANA },
  { memberId: MARC_MEMBER, userId: MARC },
  { memberId: LEO_MEMBER, userId: null },
];

type Tables = Record<string, Array<Record<string, unknown>>>;

/**
 * Un PostgREST en mémoire qui applique VRAIMENT son `eq('user_id', …)`.
 *
 * C'est le filtre qui compte ici: un faux qui rendrait toutes les lignes
 * quel que soit le compte ferait passer un chargeur qui sert le corps d'Ana à
 * Marc, et le test dirait vert.
 */
function stubDb(tables: Tables, opts: { failOn?: string } = {}) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const rows = tables[table] ?? [];
      const selected = () =>
        rows.filter((row) =>
          filters.every(([column, value]) =>
            String(row[column] ?? "") === String(value ?? "")
          )
        );
      const fail = () =>
        Promise.resolve({ data: null, error: { message: `boom:${table}` } });
      // deno-lint-ignore no-explicit-any
      const api: any = {
        select: () => api,
        order: () => api,
        limit: () => api,
        in: () => api,
        not: () => api,
        gte: () => api,
        lte: () => api,
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return api;
        },
        maybeSingle: () =>
          opts.failOn === table
            ? fail()
            : Promise.resolve({ data: selected()[0] ?? null, error: null }),
        // deno-lint-ignore no-explicit-any
        then(resolve: (v: any) => unknown) {
          if (opts.failOn === table) return fail().then(resolve);
          return Promise.resolve({ data: selected(), error: null }).then(resolve);
        },
      };
      return api;
    },
  };
}

/**
 * Le décor de base. Ana mesure 1,86 m, Marc 1,58 m — deux valeurs ÉLOIGNÉES,
 * pour qu'un appariement croisé se voie au lieu de passer pour du bruit.
 */
function tables(over: Partial<Tables> = {}): Tables {
  return {
    profiles: [
      { id: ANA, birth_date: "1990-03-01", timezone: "Europe/Paris", height_cm: 186, gender: "female" },
      { id: MARC, birth_date: "1978-06-15", timezone: "Europe/Paris", height_cm: 158, gender: "male" },
    ],
    weekly_reviews: [
      {
        user_id: ANA,
        week_start_date: "2026-08-03",
        biofeedback: { weight_kg: 84, waist_cm: 96 },
        outcomes: {},
        self_rated_adherence: null,
        logging_coverage: null,
        created_at: "2026-08-03T00:00:00Z",
      },
      {
        user_id: MARC,
        week_start_date: "2026-08-03",
        biofeedback: { weight_kg: 61 },
        outcomes: {},
        self_rated_adherence: null,
        logging_coverage: null,
        created_at: "2026-08-03T00:00:00Z",
      },
    ],
    student_body_measures: [],
    plan_commitments: [],
    commitment_evaluations: [],
    protocol_events: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// PREUVE — l'appariement se fait sur member_id, jamais sur user_id
// ---------------------------------------------------------------------------

Deno.test("chaque corps rejoint SA bouche, par member_id", async () => {
  const got = await loadHouseholdMemberBodies(stubDb(tables()), {
    members: MIXED_HOUSEHOLD,
    todayLocalDate: TODAY,
  });

  // Clés de MEMBRE. Un chargeur resté sur `user_id` rendrait `undefined` ici,
  // et le brief composerait sans aucun corps sans que rien ne rougisse.
  assertEquals(got.byMember.get(ANA_MEMBER)?.heightCm, 186);
  assertEquals(got.byMember.get(MARC_MEMBER)?.heightCm, 158);
  // ET PAS CROISÉS. Deux tailles éloignées: 186 chez Marc se verrait.
  assertEquals(got.byMember.get(ANA_MEMBER)?.latestWeight?.value, 84);
  assertEquals(got.byMember.get(MARC_MEMBER)?.latestWeight?.value, 61);
  // Les identifiants de COMPTE ne sont PAS des clés de sortie.
  assertEquals(got.byMember.has(ANA), false);
  assertEquals(got.byMember.has(MARC), false);
  assertEquals(got.issues, []);
});

// ---------------------------------------------------------------------------
// PREUVE 4 — une bouche sans compte ne casse rien, et ne coûte rien
// ---------------------------------------------------------------------------

Deno.test("une bouche sans compte n'a pas de corps, aucun incident, aucune requête", async () => {
  const withLeo = await loadHouseholdMemberBodies(stubDb(tables()), {
    members: MIXED_HOUSEHOLD,
    todayLocalDate: TODAY,
  });
  const withoutLeo = await loadHouseholdMemberBodies(stubDb(tables()), {
    members: MIXED_HOUSEHOLD.slice(0, 2),
    todayLocalDate: TODAY,
  });

  assertEquals(withLeo.byMember.has(LEO_MEMBER), false);
  // PAS UN INCIDENT. Ne pas avoir de compte est le cas nominal du produit
  // depuis le lot 1, pas une panne: le tracer polluerait `issues` à chaque
  // génération de chaque foyer qui a des enfants.
  assertEquals(withLeo.issues, []);
  // ET PAS UNE REQUÊTE. Interroger `profiles` pour un `user_id` nul serait N
  // allers-retours garantis vides par génération.
  assertEquals(withLeo.reads, withoutLeo.reads);
});

// ---------------------------------------------------------------------------
// PREUVE 3 — le plancher TCA est FAIL-CLOSED, et son échec ne bloque rien
// ---------------------------------------------------------------------------

Deno.test("plancher illisible: la génération continue, mais AUCUN fait corporel", async () => {
  // `protocol_events` est l'une des trois lectures du plancher. Sa panne doit
  // laisser le drapeau à `true` — la valeur avec laquelle il PART — et surtout
  // ne pas empêcher le reste.
  const got = await loadHouseholdMemberBodies(
    stubDb(tables(), { failOn: "protocol_events" }),
    { members: MIXED_HOUSEHOLD, todayLocalDate: TODAY },
  );

  // Le corps est bien chargé (best-effort tenu)…
  const ana = got.byMember.get(ANA_MEMBER);
  assert(ana, "le corps doit rester chargé malgré le plancher illisible");
  assertEquals(ana.restrictionFlag, true);
  // …mais il ne produit AUCUN fait. La garde vit dans la fonction pure, donc
  // aucun appelant ne peut l'oublier.
  assertEquals(householdBodyFacts(ana, "adult"), []);

  // Tracé nommément, pour les deux comptes: un plancher qui échoue en boucle
  // doit être discernable d'un foyer qui n'a jamais rien saisi.
  assertEquals(got.issues, [
    `body_floor_unreadable:${ANA_MEMBER}`,
    `body_floor_unreadable:${MARC_MEMBER}`,
  ]);
});

Deno.test("corps illisible: best-effort, la bouche reste servie", async () => {
  // `profiles` en panne. L'arbitrage est écrit sur le chemin individuel:
  // « refuser le dîner de quelqu'un parce qu'on n'a pas su lire sa balance
  // serait la mauvaise moitié de l'arbitrage ».
  const got = await loadHouseholdMemberBodies(
    stubDb(tables(), { failOn: "profiles" }),
    { members: MIXED_HOUSEHOLD, todayLocalDate: TODAY },
  );

  assertEquals(got.byMember.size, 0);
  assertEquals(got.issues, [
    `body_unreadable:${ANA_MEMBER}`,
    `body_unreadable:${MARC_MEMBER}`,
  ]);

  // ET LA BOUCHE RESTE SERVIE. Bout en bout: un corps illisible produit la
  // ligne d'avant le lot, pas une ligne manquante.
  const members: PortionMember[] = MIXED_HOUSEHOLD.map((m) => ({
    memberId: m.memberId,
    displayName: m.memberId === ANA_MEMBER ? "Ana" : m.memberId === MARC_MEMBER ? "Marc" : "Léo",
    goal: "fat_loss" as const,
    ageState: "adult" as const,
    body: got.byMember.get(m.memberId) ?? null,
    eatingSlots: null,
    habits: [],
    habitNote: null,
  }));
  const brief = buildPortionBrief(members, "one_dish", 0);
  assertEquals(brief.split("\n").filter((l) => l.startsWith("- ")).length, 3);
  assert(!brief.includes("["), brief);
});

Deno.test("l'ordre des incidents suit le FOYER, pas l'ordre d'arrivée des promesses", async () => {
  // Deux générations du même foyer doivent écrire la même ligne `issues`.
  // Sinon relire « pourquoi Marc a-t-il eu une part standard ? » trois jours
  // plus tard dépend de qui a répondu le premier ce soir-là.
  const reversed: HouseholdBodyMember[] = [
    { memberId: MARC_MEMBER, userId: MARC },
    { memberId: ANA_MEMBER, userId: ANA },
  ];
  const got = await loadHouseholdMemberBodies(
    stubDb(tables(), { failOn: "profiles" }),
    { members: reversed, todayLocalDate: TODAY },
  );
  assertEquals(got.issues, [
    `body_unreadable:${MARC_MEMBER}`,
    `body_unreadable:${ANA_MEMBER}`,
  ]);
});

// ---------------------------------------------------------------------------
// LE COÛT — mesuré, pas supposé
// ---------------------------------------------------------------------------

Deno.test("le coût est LINÉAIRE en comptes, et nul pour une bouche sans compte", async () => {
  // « N lectures de corps par génération, là où il y en avait une. À mesurer,
  // pas à supposer — c'est la ligne que le persona prioritaire paie. »
  //
  // Ce test est un CLIQUET: le jour où un chargeur appelé plus bas gagne une
  // requête, il rougit ici plutôt que de doubler la facture en silence.
  const one = await loadHouseholdMemberBodies(stubDb(tables()), {
    members: [MIXED_HOUSEHOLD[0]],
    todayLocalDate: TODAY,
  });
  const two = await loadHouseholdMemberBodies(stubDb(tables()), {
    members: MIXED_HOUSEHOLD.slice(0, 2),
    todayLocalDate: TODAY,
  });
  const twoPlusLeo = await loadHouseholdMemberBodies(stubDb(tables()), {
    members: MIXED_HOUSEHOLD,
    todayLocalDate: TODAY,
  });

  // 7 allers-retours par compte, SANS engagement d'énergie:
  //
  //   LE PLANCHER (4) — `weekly_reviews`, PUIS `student_body_measures` (la
  //     dérivation FF-031 dans `loadWeeklyOutcomeSamples`, qu'on ne voit pas en
  //     lisant `evaluateRestrictionForStudent`), `plan_commitments`, et
  //     `protocol_events`.
  //   LE CORPS (3)    — `profiles`, `weekly_reviews`, `student_body_measures`.
  //
  // ⚠️ CE CHIFFRE A ÉTÉ MESURÉ, ET IL DÉMENTAIT L'ESTIMATION. Compté à la
  // lecture du code, le plancher paraissait valoir 3: la lecture des mesures
  // datées est cachée deux niveaux plus bas. C'est exactement pourquoi la
  // fiche dit « à mesurer, pas à supposer ».
  assertEquals(one.reads, 7);
  assertEquals(two.reads, 14);
  assertEquals(twoPlusLeo.reads, 14);
});

Deno.test("un engagement d'énergie ajoute UNE requête, et une seule", async () => {
  // La cinquième lecture du plancher est conditionnelle (`commitment_evaluations`
  // ne part que s'il existe un engagement `measure='energy'`). La pinner évite
  // qu'un coût mesuré sur un décor vide soit pris pour le coût réel.
  const got = await loadHouseholdMemberBodies(
    stubDb(tables({
      plan_commitments: [{ id: "c1", user_id: ANA, measure: "energy" }],
    })),
    { members: [MIXED_HOUSEHOLD[0]], todayLocalDate: TODAY },
  );
  assertEquals(got.reads, 8);
});
