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

// ⚠️ CE TEST DISAIT « AUCUN CORPS, AUCUNE REQUÊTE », ET LA PREMIÈRE MOITIÉ
// ÉTAIT FAUSSE (corrigé le 2026-08-19). Une bouche sans compte n'a ni profil ni
// pesées — mais elle a une FICHE (`household_member_bodies`, trois colonnes
// `not null` saisies à l'ajout). Le test gardait le trou: sur un foyer réel,
// « 169 cm · 59 kg · femme » était en base et le brief ne portait rien.
// Ce qui reste vrai et qui est maintenant énoncé seul: elle ne coûte pas N
// requêtes. Elle en coûte UNE, partagée par tout le foyer.
Deno.test("une bouche sans compte: aucun incident, et UNE seule requête pour tous", async () => {
  const withLeo = await loadHouseholdMemberBodies(stubDb(tables()), {
    members: MIXED_HOUSEHOLD,
    todayLocalDate: TODAY,
  });
  const withoutLeo = await loadHouseholdMemberBodies(stubDb(tables()), {
    members: MIXED_HOUSEHOLD.slice(0, 2),
    todayLocalDate: TODAY,
  });

  // Sans fiche en base, toujours aucun corps — et c'est le décor de ce test.
  // Le cas AVEC fiche est prouvé plus bas, dans le bloc du 2026-08-19.
  assertEquals(withLeo.byMember.has(LEO_MEMBER), false);
  // PAS UN INCIDENT. Ne pas avoir de compte est le cas nominal du produit
  // depuis le lot 1, pas une panne: le tracer polluerait `issues` à chaque
  // génération de chaque foyer qui a des enfants.
  assertEquals(withLeo.issues, []);
  // ⚠️ UNE REQUÊTE DE PLUS, ET UNE SEULE — pas N. Interroger `profiles` par
  // bouche serait N allers-retours garantis vides; lire les fiches du foyer
  // d'un coup en coûte UN, quel que soit le nombre de bouches sans compte.
  // C'est l'objection de coût d'origine, tenue; c'est sa conclusion (« donc on
  // ne lit rien ») qui était fausse.
  assertEquals(withLeo.reads, withoutLeo.reads + 1);
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
  const brief = buildPortionBrief(members, "one_dish", 0, 1);
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
  //
  // ⚠️ ET LA FICHE AJOUTE UN, PAS N (2026-08-19). Une bouche sans compte ne
  // coûte plus zéro: ses trois colonnes de fiche sont lues. Mais la lecture est
  // GROUPÉE (`.in(member_id, …)`), donc le cliquet porte sur « +1 par
  // génération », jamais « +1 par bouche » — c'est ça qu'il faut voir rougir.
  assertEquals(one.reads, 7);
  assertEquals(two.reads, 14);
  assertEquals(twoPlusLeo.reads, 15);
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

// ═══════════════════════════════════════════════════════════════════════════
// 2026-08-19 — LA FICHE PORTE LE CORPS D'UNE BOUCHE SANS COMPTE.
//
// ── LE DÉFAUT, MESURÉ SUR UN FOYER RÉEL ───────────────────────────────────
// `household_member_bodies` portait « 169 cm · 59 kg · femme » pour une bouche
// sans compte, et le brief de portions envoyé au modèle disait
// « - Christèle: » suivi de RIEN. Le chargeur sortait par
// `if (!member.userId) return { body: null }` — vrai pour le PROFIL et les
// mesures hebdomadaires, faux pour la fiche, dont les trois colonnes sont
// `not null` et saisies à l'ajout du membre.
//
// Conséquence lisible dans la réponse du modèle: des grammages IDENTIQUES pour
// une femme de 59 kg et un homme de 73 kg qui s'entraîne dur — `140/140`,
// `180/180`, `220/220`. Il n'a rien différencié parce qu'il n'avait rien.
//
// ⚠️ CES TESTS MANQUAIENT AU CORRECTIF. Le bloc de fusion existait déjà; rien
// ne le tenait. Un chargeur qui repasserait à `return null` redeviendrait vert.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ une bouche SANS COMPTE reçoit le corps de sa fiche", async () => {
  const db = stubDb(tables({
    household_member_bodies: [
      { member_id: LEO_MEMBER, height_cm: 169, weight_kg: 59, gender: "female" },
    ],
  }));
  const out = await loadHouseholdMemberBodies(db, {
    members: MIXED_HOUSEHOLD,
    todayLocalDate: TODAY,
  });
  const leo = out.byMember.get(LEO_MEMBER);
  assert(leo, "la bouche sans compte n'a toujours aucun corps");
  assertEquals(leo.heightCm, 169);
  // ⚠️ `declaredWeightKg`, PAS `latestWeight`: une fiche n'est pas une série de
  // pesées. Les confondre ferait écrire « measured week of … » sous un chiffre
  // qui n'a pas de semaine.
  assertEquals(leo.declaredWeightKg, 59);
  assertEquals(leo.latestWeight, null);
  assertEquals(leo.gender, "female");
});

Deno.test("⛔ et ce corps ATTEINT le brief de portions", async () => {
  // Le test du dessus prouve le chargeur; celui-ci prouve que le chiffre
  // traverse jusqu'à la phrase que le modèle lit. C'est très exactement
  // l'écart qui a laissé passer le défaut: le brief était testé avec un corps
  // qu'on lui donnait à la main.
  const db = stubDb(tables({
    household_member_bodies: [
      { member_id: LEO_MEMBER, height_cm: 169, weight_kg: 59, gender: "female" },
    ],
  }));
  const out = await loadHouseholdMemberBodies(db, {
    members: MIXED_HOUSEHOLD,
    todayLocalDate: TODAY,
  });
  const members: PortionMember[] = [
    {
      memberId: LEO_MEMBER,
      displayName: "Christèle",
      goal: "maintenance",
      ageState: "adult",
      body: out.byMember.get(LEO_MEMBER) ?? null,
      eatingSlots: null,
      habits: [],
      habitNote: null,
    },
    {
      memberId: ANA_MEMBER,
      displayName: "Ana",
      goal: "maintenance",
      ageState: "adult",
      body: null,
      eatingSlots: null,
      habits: [],
      habitNote: null,
    },
  ];
  const brief = buildPortionBrief(members, "one_dish", 0, 1);
  assert(brief.includes("169 cm"), `la taille n'atteint pas le brief:\n${brief}`);
  assert(brief.includes("59 kg"), `le poids n'atteint pas le brief:\n${brief}`);
});

Deno.test("⚠️ LE CAS QUI PASSE — sans fiche, aucun corps inventé", async () => {
  // Sans ce cas, une règle qui fabriquerait un corps vide pour toute bouche
  // sans compte ressemblerait trait pour trait à la règle juste.
  const db = stubDb(tables({ household_member_bodies: [] }));
  const out = await loadHouseholdMemberBodies(db, {
    members: MIXED_HOUSEHOLD,
    todayLocalDate: TODAY,
  });
  assertEquals(out.byMember.get(LEO_MEMBER), undefined);
});

// ── ⟳ 2026-09-04 — LE TITULAIRE DONT LA SÉRIE EST VIDE ───────────────────────
// Mesuré en base: 15 titulaires sur 38 qui portent une fiche n'ont aucune ligne
// de série. `if (entry.member.userId) continue;` les laissait sans corps: écrit,
// stocké, rendu par la RPC — et servi « comme la table ».
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OWNER_MEMBER = "44444444-4444-4444-8444-444444444444";

Deno.test("⛔ un TITULAIRE sans pesée reçoit le poids de sa fiche", async () => {
  const db = stubDb(tables({
    profiles: [{ id: OWNER, birth_date: "1988-04-12", timezone: "Europe/Paris", height_cm: 167, gender: "female" }],
    weekly_reviews: [],
    household_member_bodies: [
      { member_id: OWNER_MEMBER, height_cm: 167, weight_kg: 62, gender: "female" },
    ],
  }));
  const out = await loadHouseholdMemberBodies(db, {
    members: [{ memberId: OWNER_MEMBER, userId: OWNER }],
    todayLocalDate: TODAY,
  });
  const owner = out.byMember.get(OWNER_MEMBER);
  assert(owner, "le titulaire n'a aucun corps");
  // ⚠️ `declaredWeightKg`, PAS `latestWeight`: une fiche n'est pas une série.
  assertEquals(owner.declaredWeightKg, 62);
  assertEquals(owner.latestWeight, null);
  assertEquals(owner.heightCm, 167);
  assert(out.issues.includes(`body_from_sheet:${OWNER_MEMBER}`), "le relais n'est pas dit");
});

Deno.test("⛔ mais une SÉRIE présente garde la main sur la fiche", async () => {
  // Le compte d'Ana pèse 84 kg dans ses bilans; sa fiche dirait 70. La série
  // est la vérité datée, la fiche ne la contredit pas.
  const db = stubDb(tables({
    household_member_bodies: [
      { member_id: ANA_MEMBER, height_cm: 186, weight_kg: 70, gender: "female" },
    ],
  }));
  const out = await loadHouseholdMemberBodies(db, {
    members: MIXED_HOUSEHOLD,
    todayLocalDate: TODAY,
  });
  const ana = out.byMember.get(ANA_MEMBER);
  assert(ana);
  assert(ana.latestWeight !== null, "la série d'Ana a disparu");
  assertEquals(ana.declaredWeightKg, null, "la fiche a écrasé une série présente");
});

Deno.test("⛔ et une lecture RATÉE reste fail-closed: la fiche ne répare pas une panne", async () => {
  const db = stubDb(
    tables({
      household_member_bodies: [
        { member_id: OWNER_MEMBER, height_cm: 167, weight_kg: 62, gender: "female" },
      ],
    }),
    { failOn: "profiles" },
  );
  const out = await loadHouseholdMemberBodies(db, {
    members: [{ memberId: OWNER_MEMBER, userId: OWNER }],
    todayLocalDate: TODAY,
  });
  assertEquals(out.byMember.get(OWNER_MEMBER), undefined, "une panne de lecture a été comblée par la fiche");
  assert(out.issues.some((i) => i.startsWith("body_unreadable:")), "la panne n'est plus dite");
});
