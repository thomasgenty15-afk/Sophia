/**
 * LA PART DE LA FICHE — le banc du correctif du 2026-08-19.
 *
 * ── LE DÉFAUT QUE CE FICHIER GARDE ────────────────────────────────────────
 * Mesuré sur trois runs réels d'un foyer construit pour qu'un écart n'ait
 * qu'une cause: **neuf comparaisons, zéro écart**. Une adulte de 152 cm / 47 kg
 * recevait 220 g de poulet; un ado de 178 cm / 70 kg en recevait 140, très
 * exactement comme un enfant de 7 ans de 122 cm / 23 kg.
 *
 * La cause tenait en une expression, dans `memberTargetFactor`:
 *
 *     restrictionFlag: member.body?.restrictionFlag ?? true
 *
 * `member.body` est l'objet du COMPTE. Le corps saisi sur la FICHE arrivait,
 * lui, dans `args.body` — chargé, complet, jeté. Toute bouche sans compte
 * valait `true`, donc `restriction_floor`, donc aucun dimensionnement: la porte
 * du moteur se fermait sur exactement la population que le prompt ne voit pas.
 *
 * ⚠️ CE BANC N'A DE VALEUR QUE PARCE QUE CHAQUE GARDE A ÉTÉ VUE MORDRE. Les
 * mutations qui les ont fait tomber sont consignées dans
 * `scratchpad/qa-generation/2026-08-19-LOT-porte-moteur-portions.md`.
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  BODY_SHARE_FACTOR_MAX,
  householdAppetite,
  BODY_SHARE_FACTOR_MIN,
  BODY_SHARE_REASONS,
  type BodyShareReason,
  countPortionNoteDrift,
  bodyShareFactors,
  buildPortionBrief,
  CHILD_DIRECTION,
  MEMBER_GOALS,
  NEUTRAL_DIRECTION,
  type FactorMouth,
  householdMouthFactors,
  memberTargetFactor,
  MOUTH_RESTRICTION_STATES,
  type MouthRestrictionState,
  type PortionMember,
  restrictionFlagOf,
  SERVING_DIRECTION,
  servingDirectionFor,
  SIZE_FREE_FALLBACK_DIRECTION,
  sizeFreeDirectionFor,
  sizeWordMatches,
  type ShareMouth,
  weightGroupCount,
} from "./household_portions.ts";
import type { MouthBody } from "./meal_envelope.ts";
import type { MemberAgeState } from "./household.ts";

// ---------------------------------------------------------------------------
// LE FOYER DE LA MESURE — les quatre corps du run 1V, à l'unité près
// ---------------------------------------------------------------------------

const ODALRIC: MouthBody = {
  appetite: null,
  heightCm: 183,
  weightKg: 79,
  gender: "male",
  ageYears: 38,
  activityLevel: null,
  activityAxes: { day: null, sport: null, asked: false },
};
const PEREGRINE: MouthBody = {
  appetite: null,
  heightCm: 152,
  weightKg: 47,
  gender: "female",
  ageYears: 34,
  activityLevel: null,
  activityAxes: { day: null, sport: null, asked: false },
};
const CASIMIR: MouthBody = {
  appetite: null,
  heightCm: 178,
  weightKg: 70,
  gender: "male",
  ageYears: 16,
  activityLevel: null,
  activityAxes: { day: null, sport: null, asked: false },
};
const WILFRID: MouthBody = {
  appetite: null,
  heightCm: 122,
  weightKg: 23,
  gender: "male",
  ageYears: 7,
  activityLevel: null,
  activityAxes: { day: null, sport: null, asked: false },
};

const SHARE = (over: Partial<ShareMouth> = {}): ShareMouth => ({
  memberId: "m-1",
  ageState: "adult",
  restriction: "no_account",
  body: ODALRIC,
  ...over,
});

/** Les quatre bouches, dans l'état où la mesure les a trouvées. */
const TABLE: ShareMouth[] = [
  // Le maître: le SEUL compte de la maison, ceinture lue et non levée.
  { memberId: "odalric", ageState: "adult", restriction: "clear", body: ODALRIC },
  // L'adulte SANS compte — celle qui recevait la part d'un homme de 79 kg.
  { memberId: "peregrine", ageState: "adult", restriction: "no_account", body: PEREGRINE },
  // L'ado de 70 kg — celui qui recevait la part d'un enfant de 7 ans.
  { memberId: "casimir", ageState: "minor", restriction: "no_account", body: CASIMIR },
  // L'enfant de 7 ans, 23 kg.
  { memberId: "wilfrid", ageState: "minor", restriction: "no_account", body: WILFRID },
];

const MEMBER = (over: Partial<PortionMember> = {}): PortionMember => ({
  memberId: "m-1",
  displayName: "Zoé",
  goal: null,
  ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
  ...over,
});

// ---------------------------------------------------------------------------
// ① LE CAS QUI PASSE — quatre corps, quatre parts, dans le sens du corps
// ---------------------------------------------------------------------------

Deno.test("⛔ LE CAS QUI PASSE — quatre bouches, quatre facteurs DIFFÉRENTS", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE TEST LE PLUS CHER DE CE FICHIER. Sans lui, tout ce qui suit peut rester
  // vert sur un lot entièrement débranché: un banc qui n'énumère que des refus
  // ne distingue pas « la porte laisse passer » de « la porte a disparu ».
  // ══════════════════════════════════════════════════════════════════════════
  const out = bodyShareFactors(TABLE, "no_position");
  assertEquals(out.size, 4);
  for (const m of TABLE) {
    assertEquals(out.get(m.memberId)!.reason, "sized", m.memberId);
  }

  const f = (id: string) => out.get(id)!.factor;
  const values = TABLE.map((m) => f(m.memberId));
  assertEquals(
    new Set(values.map((v) => v.toFixed(6))).size,
    4,
    `quatre corps, quatre facteurs — obtenu ${JSON.stringify(values)}`,
  );

  // ── L'ÉCART VA DANS LE SENS DU CORPS, ET C'EST LA PHRASE DU LOT ──────────
  // L'ado de 70 kg passe DEVANT l'adulte de 79 kg: c'est l'équation de
  // Schofield + la croissance + le facteur pédiatrique (1,6 contre 1,5), pas un
  // accident. Un garçon de 16 ans mange plus qu'un homme de 38 ans sédentaire,
  // et c'est très exactement ce que la mesure du 2026-08-19 lui refusait.
  assert(f("casimir") > f("odalric"), `casimir ${f("casimir")} vs odalric ${f("odalric")}`);
  assert(f("odalric") > f("wilfrid"), `odalric ${f("odalric")} vs wilfrid ${f("wilfrid")}`);
  assert(f("odalric") > f("peregrine"), "79 kg contre 47 kg");
  // Les deux mineurs ne reçoivent PLUS la même chose — c'est la comparaison
  // que 1V a trouvée identique 9 fois sur 9.
  assert(f("casimir") > f("wilfrid") * 1.5, `${f("casimir")} vs ${f("wilfrid")}`);
  // Et le plus petit corps ADULTE ne reçoit plus la part du plus grand.
  assert(f("peregrine") < 1 && f("odalric") > 1);
});

Deno.test("PROPRIÉTÉ — la casserole ne gonfle pas: la somme des facteurs = le nombre de bouches", () => {
  // La normalisation est la MOYENNE de la table. Ce qui est retiré à un petit
  // corps est exactement ce qui est ajouté à un grand: le moteur redistribue
  // une production, il n'en invente pas. (Vrai tant qu'aucun rabotage ne mord —
  // le cas raboté a son propre test, et il est compté.)
  const out = bodyShareFactors(TABLE, "no_position");
  let sum = 0;
  for (const s of out.values()) sum += s.factor;
  assert(Math.abs(sum - TABLE.length) < 1e-9, `somme ${sum} ≠ ${TABLE.length}`);
});

// ---------------------------------------------------------------------------
// ② LE DÉFAUT LUI-MÊME — « pas de compte » n'est plus « plancher levé »
// ---------------------------------------------------------------------------

Deno.test("⛔ LA RÉGRESSION MESURÉE — une bouche SANS COMPTE est dimensionnée, et son motif n'est pas un plancher", () => {
  // Le compteur mesuré en base sur 4 plans / 3 foyers:
  //   {"mouths":{"sized":1,"restriction_floor":3,"minor":0,"no_body":0}}
  // Trois bouches sans compte y étaient rangées sous « plancher TCA ». Un
  // lecteur du journal en concluait une restriction alimentaire là où il n'y
  // avait qu'une absence de compte.
  const out = bodyShareFactors(TABLE, "no_position");
  for (const id of ["peregrine", "casimir", "wilfrid"]) {
    const s = out.get(id)!;
    assertEquals(s.reason, "sized", id);
    assert(s.factor !== 1, `${id}: facteur ${s.factor}`);
  }

  // Et sur la chaîne d'OBJECTIF, le motif rendu ne dit plus « plancher » non
  // plus: une bouche sans compte sans objectif sort `no_direction`, ce qui est
  // la phrase vraie.
  const target = memberTargetFactor(
    MEMBER({ memberId: "peregrine", goal: null }),
    {
      coachCounting: "no_position",
      paceKgPerWeek: null,
      conditionRefs: [],
      body: PEREGRINE,
      restriction: "no_account",
    },
  );
  assertEquals(target, { factor: 1, reason: "no_direction" });
});

Deno.test("⛔ LE VRAI PLANCHER TCA MORD TOUJOURS — compte lu, ceinture levée, RIEN ne bouge", () => {
  // ⚠️ LA MOITIÉ QU'IL NE FALLAIT PAS TOUCHER. Une bouche qui A un compte et
  // dont le plancher est réellement levé ne reçoit aucun dimensionnement — ni
  // par sa cible, ni par son corps de fiche — et le motif reste `restriction_floor`.
  const raised = TABLE.map((m) =>
    m.memberId === "odalric" ? { ...m, restriction: "raised" as const } : m
  );
  const out = bodyShareFactors(raised, "no_position");
  assertEquals(out.get("odalric"), { factor: 1, reason: "restriction_floor" });

  // Et il gagne contre TOUT le reste, sur toutes les combinaisons — l'angle
  // adversarial, rejoué sur la part de fiche.
  for (const ageState of ["minor", "adult", "unknown"] as const) {
    for (const coachCounting of ["no_counting", "no_position"] as const) {
      const one = bodyShareFactors(
        [
          SHARE({ memberId: "a", ageState, restriction: "raised" }),
          SHARE({ memberId: "b", body: PEREGRINE }),
        ],
        coachCounting,
      );
      assertEquals(
        one.get("a"),
        { factor: 1, reason: "restriction_floor" },
        `${ageState}/${coachCounting}`,
      );
    }
  }

  // La même chose bout à bout, facteur APPLIQUÉ compris: le plancher ne se
  // rattrape pas par la composition des deux chaînes.
  const applied = householdMouthFactors(
    [
      {
        member: MEMBER({ memberId: "a", goal: "fat_loss" }),
        restriction: "raised",
        body: ODALRIC,
        paceKgPerWeek: 0.5,
        conditionRefs: [],
      },
      {
        member: MEMBER({ memberId: "b" }),
        restriction: "no_account",
        body: WILFRID,
        paceKgPerWeek: null,
        conditionRefs: [],
      },
    ],
    "no_position",
  );
  assertEquals(applied.get("a")!.factor, 1);
  assertEquals(applied.get("a")!.target.reason, "restriction_floor");
  assertEquals(applied.get("a")!.share.reason, "restriction_floor");
});

Deno.test("⛔ LE FAIL-CLOSED RESTE, ET IL PORTE SON PROPRE NOM: `restriction_unknown`", () => {
  // « Je n'ai pas pu lire » et « il n'y a rien à lire » sont deux phrases. La
  // première se ferme — c'est l'arbitrage d'hier, et il ne bouge pas. La
  // seconde ne se ferme plus, et c'était tout le défaut.
  const out = bodyShareFactors(
    [
      SHARE({ memberId: "unreadable", restriction: "unreadable" }),
      SHARE({ memberId: "no-account", restriction: "no_account", body: PEREGRINE }),
      SHARE({ memberId: "third", body: WILFRID, ageState: "minor" }),
    ],
    "no_position",
  );
  assertEquals(out.get("unreadable"), { factor: 1, reason: "restriction_unknown" });
  assertEquals(out.get("no-account")!.reason, "sized");

  // Et sur la chaîne d'objectif, même distinction, même nom.
  assertEquals(
    memberTargetFactor(MEMBER({ goal: "fat_loss" }), {
      coachCounting: "no_position",
      paceKgPerWeek: 0.5,
      conditionRefs: [],
      body: ODALRIC,
      restriction: "unreadable",
    }),
    { factor: 1, reason: "restriction_unknown" },
  );
  // Sans corps non plus: le motif de la première porte fermée survit, et il
  // est nommé.
  assertEquals(
    memberTargetFactor(MEMBER({ goal: "fat_loss" }), {
      coachCounting: "no_position",
      paceKgPerWeek: 0.5,
      conditionRefs: [],
      body: null,
      restriction: "unreadable",
    }),
    { factor: 1, reason: "restriction_unknown" },
  );
});

Deno.test("les quatre états se réduisent au booléen de la chaîne, et un seul endroit le fait", () => {
  assertEquals(restrictionFlagOf("raised"), true);
  assertEquals(restrictionFlagOf("unreadable"), true);
  assertEquals(restrictionFlagOf("clear"), false);
  assertEquals(restrictionFlagOf("no_account"), false);
  // La liste est FERMÉE et exhaustive: un cinquième état sans réduction serait
  // une porte qu'aucun `switch` ne couvre.
  assertEquals(MOUTH_RESTRICTION_STATES.length, 4);
  for (const s of MOUTH_RESTRICTION_STATES) {
    assertEquals(typeof restrictionFlagOf(s), "boolean", s);
  }
});

Deno.test("un état de ceinture hors vocabulaire LÈVE, il ne se lit pas « faux »", () => {
  let threw = false;
  try {
    memberTargetFactor(MEMBER(), {
      coachCounting: "no_position",
      paceKgPerWeek: 0.5,
      conditionRefs: [],
      body: ODALRIC,
      restriction: "nope" as unknown as MouthRestrictionState,
    });
  } catch {
    threw = true;
  }
  assert(threw, "un état inconnu doit LEVER — sinon il se lit comme une porte ouverte");
});

// ---------------------------------------------------------------------------
// ③ LES AUTRES PORTES — chacune ferme, avec son motif
// ---------------------------------------------------------------------------

Deno.test("chaque porte ferme la part de fiche, avec SON motif", () => {
  const cases: Array<[Partial<ShareMouth>, BodyShareReason, "no_counting" | "no_position"]> = [
    [{ restriction: "raised" }, "restriction_floor", "no_position"],
    [{ restriction: "unreadable" }, "restriction_unknown", "no_position"],
    // ⛔ LOT B ④ — LA PORTE ③ N'EST PLUS DANS CETTE LISTE, ET C'EST LA
    // DÉCISION. Elle a son propre test juste en dessous, où elle NE ferme PAS.
    [{ ageState: "unknown" }, "age_unknown", "no_position"],
    [{ body: null }, "no_body", "no_position"],
    [{ body: { ...ODALRIC, weightKg: null } }, "no_body", "no_position"],
  ];
  for (const [over, reason, stance] of cases) {
    const out = bodyShareFactors(
      [SHARE({ memberId: "a", ...over }), SHARE({ memberId: "b", body: PEREGRINE })],
      stance,
    );
    assertEquals(out.get("a"), { factor: 1, reason }, reason);
  }
});

Deno.test("⛔ LOT B ④ — UNE DOCTRINE « ON NE COMPTE PAS » NE REND PAS À L'ENFANT LA BOÎTE DE L'ADULTE", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // L'ARBITRAGE, ET IL EST ÉCRIT EN TÊTE DE `bodyShareFactors`: le jeton de la
  // porte ③ est `count_calories`, il porte sur un CHIFFRE mis devant
  // quelqu'un. Répartir une même casserole au prorata des corps n'énonce rien.
  // ⚠️ ET `countingStanceFrom` REND `no_counting` AUSSI QUAND LA DOCTRINE EST
  // ILLISIBLE (fail-closed): tant que ③ fermait ici, une PANNE DE LECTURE
  // rendait à l'enfant de 23 kg la boîte de l'adulte de 79 kg.
  // ══════════════════════════════════════════════════════════════════════════
  const table = [
    SHARE({ memberId: "child", ageState: "minor", body: WILFRID }),
    SHARE({ memberId: "adult", body: ODALRIC }),
  ];
  const counting = bodyShareFactors(table, "no_position");
  const notCounting = bodyShareFactors(table, "no_counting");
  // ⛔ LE MÊME RÉSULTAT, AU MILLIÈME: la position du coach ne gouverne plus la
  // part de fiche. Mutation: repasser `coachCounting` dans la seconde passe
  // rend `{factor: 1, reason: "doctrine_no_counting"}` et fait tomber ces deux
  // lignes.
  assertEquals(notCounting.get("child"), counting.get("child"));
  assertEquals(notCounting.get("adult"), counting.get("adult"));
  assertEquals(notCounting.get("child")!.reason, "sized");
  assert(
    notCounting.get("child")!.factor < notCounting.get("adult")!.factor,
    "l'enfant doit rester sous l'adulte",
  );

  // ── ⛔ ET CE QUE ÇA N'OUVRE PAS ────────────────────────────────────────
  // ① LE PLANCHER TCA GAGNE ENCORE, doctrine ou pas. C'est la garde que ce lot
  //    n'a pas le droit de desserrer, et elle est vérifiée SOUS `no_counting`.
  const floored = bodyShareFactors(
    [
      SHARE({ memberId: "child", ageState: "minor", body: WILFRID, restriction: "raised" }),
      SHARE({ memberId: "adult", body: ODALRIC }),
    ],
    "no_counting",
  );
  assertEquals(floored.get("child"), { factor: 1, reason: "restriction_floor" });
  // ② L'ÂGE INCONNU FERME ENCORE.
  const unknown = bodyShareFactors(
    [
      SHARE({ memberId: "child", ageState: "unknown", body: WILFRID }),
      SHARE({ memberId: "adult", body: ODALRIC }),
    ],
    "no_counting",
  );
  assertEquals(unknown.get("child"), { factor: 1, reason: "age_unknown" });
  // ③ ET LA CHAÎNE D'OBJECTIF, ELLE, RESTE ENTIÈREMENT FERMÉE PAR LA DOCTRINE.
  //    C'est la ligne exacte de l'arbitrage: la position du coach gouverne une
  //    CIBLE, pas le partage d'une casserole.
  assertEquals(
    memberTargetFactor(MEMBER({ goal: "fat_loss" }), {
      coachCounting: "no_counting",
      paceKgPerWeek: 0.5,
      conditionRefs: [],
      body: ODALRIC,
      restriction: "clear",
    }),
    { factor: 1, reason: "doctrine_no_counting" },
  );
});

Deno.test("⛔ L'ÂGE INCONNU FERME — « je ne sais pas » n'est pas « c'est un adulte »", () => {
  // Mifflin-St Jeor sur un corps d'enfant SOUS-ESTIME son besoin: traiter
  // `unknown` comme `adult` rétrécirait l'assiette d'un enfant dont personne
  // n'a saisi la date. La preuve, chiffrée: le même corps de 23 kg lu en
  // adulte pèse moins que lu en enfant.
  const asMinor = bodyShareFactors(
    [
      SHARE({ memberId: "child", ageState: "minor", body: WILFRID }),
      SHARE({ memberId: "adult", body: ODALRIC }),
    ],
    "no_position",
  );
  assertEquals(asMinor.get("child")!.reason, "sized");
  const asUnknown = bodyShareFactors(
    [
      SHARE({ memberId: "child", ageState: "unknown", body: WILFRID }),
      SHARE({ memberId: "adult", body: ODALRIC }),
    ],
    "no_position",
  );
  assertEquals(asUnknown.get("child"), { factor: 1, reason: "age_unknown" });
});

Deno.test("une seule bouche calculable ⇒ `no_reference`, jamais un `sized` à 1", () => {
  // Une part est un RAPPORT. Seule à table, elle vaut 1 par construction, et
  // rendre `sized` ferait lire à un compteur qu'un corps a mordu là où il n'y
  // avait rien à comparer. C'est le même arbitrage que `no_pace` sur un écart
  // exécuté nul.
  const out = bodyShareFactors(
    [SHARE({ memberId: "alone" }), SHARE({ memberId: "b", body: null })],
    "no_position",
  );
  assertEquals(out.get("alone"), { factor: 1, reason: "no_reference" });
  assertEquals(out.get("b"), { factor: 1, reason: "no_body" });
  assertEquals(bodyShareFactors([], "no_position").size, 0);
});

// ---------------------------------------------------------------------------
// ④ LES BORNES — elles rabotent, et le rabotage se compte
// ---------------------------------------------------------------------------

Deno.test("⛔ LES BORNES RABOTENT PLUTÔT QUE DE REFUSER — et le refus rendrait le défaut", () => {
  // ⚠️ L'ARBITRAGE INVERSE DE `BOX_FACTOR_MIN`, ET IL EST MESURÉ. Refuser rend
  // `1`, c'est-à-dire la boîte de l'adulte servie au plus petit corps de la
  // maison — le défaut exact que ce lot corrige, et il mordrait d'abord sur
  // l'enfant, dont le rapport à la moyenne est le plus extrême.
  //
  // Le foyer le plus déséquilibré constructible sans corps aberrant: un
  // tout-petit à la table de deux hommes.
  const toddler: MouthBody = {
    appetite: null,
    heightCm: 87,
    weightKg: 12,
    gender: "male",
    ageYears: 2,
    activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
  };
  const out = bodyShareFactors(
    [
      SHARE({ memberId: "dad", body: ODALRIC }),
      SHARE({ memberId: "uncle", body: ODALRIC }),
      SHARE({ memberId: "toddler", ageState: "minor", body: toddler }),
    ],
    "no_position",
  );
  const small = out.get("toddler")!;
  assertEquals(small.reason, "sized");
  // La part BRUTE sort sous la borne — c'est la prémisse du test, et sans elle
  // le rabotage ci-dessous ne mordrait sur rien.
  assert(
    small.factor < BODY_SHARE_FACTOR_MIN,
    `prémisse fausse: ${small.factor} ne sort pas de la borne`,
  );

  // Le rabotage remonte jusqu'au facteur appliqué, et il y est SIGNALÉ.
  const applied = householdMouthFactors(
    [
      { member: MEMBER({ memberId: "dad" }), restriction: "clear", body: ODALRIC, paceKgPerWeek: null, conditionRefs: [] },
      { member: MEMBER({ memberId: "uncle" }), restriction: "clear", body: ODALRIC, paceKgPerWeek: null, conditionRefs: [] },
      {
        member: MEMBER({ memberId: "toddler", ageState: "minor" }),
        restriction: "no_account",
        body: toddler,
        paceKgPerWeek: null,
        conditionRefs: [],
      },
    ],
    "no_position",
  );
  assertEquals(applied.get("toddler")!.clamped, true);
  assertEquals(applied.get("toddler")!.factor, BODY_SHARE_FACTOR_MIN);
  // ⛔ ET LA PROPRIÉTÉ QUI COMPTE: raboté, il reste STRICTEMENT en dessous de 1.
  // Un refus l'aurait remis à 1 — l'assiette de l'homme de 79 kg.
  assert(applied.get("toddler")!.factor < 1);
  assertEquals(applied.get("dad")!.clamped, false);
});

Deno.test("les bornes encadrent 1, et le foyer de la mesure passe ENTIÈREMENT à l'intérieur", () => {
  // Une borne qui mordrait sur le cas nominal serait désarmée dans la semaine.
  assert(BODY_SHARE_FACTOR_MIN < 1 && BODY_SHARE_FACTOR_MAX > 1);
  const out = bodyShareFactors(TABLE, "no_position");
  for (const [id, s] of out) {
    assert(
      s.factor > BODY_SHARE_FACTOR_MIN && s.factor < BODY_SHARE_FACTOR_MAX,
      `${id}: ${s.factor} touche une borne — le foyer de la mesure doit passer`,
    );
  }
});

// ---------------------------------------------------------------------------
// ⑤ LA COMPOSITION — deux chaînes, deux motifs, un facteur
// ---------------------------------------------------------------------------

Deno.test("⛔ DEUX MOTIFS, JAMAIS UN — le compteur ne peut pas confondre les deux chaînes", () => {
  // Un seul motif rendrait le même zéro pour « aucune cible » et « aucun
  // corps », et c'est le zéro ambigu que ce dépôt paie en boucle.
  const mouths: FactorMouth[] = [
    {
      // Objectif RÉGLÉ (perte, cran posé) ET corps de fiche: les deux chaînes
      // mordent, et elles se multiplient.
      member: MEMBER({ memberId: "both", goal: "fat_loss" }),
      restriction: "clear",
      body: ODALRIC,
      paceKgPerWeek: 0.5,
      conditionRefs: [],
    },
    {
      // Corps SEUL: la part mord, la cible non — et son motif le dit.
      member: MEMBER({ memberId: "share-only" }),
      restriction: "no_account",
      body: PEREGRINE,
      paceKgPerWeek: null,
      conditionRefs: [],
    },
  ];
  const out = householdMouthFactors(mouths, "no_position");
  const both = out.get("both")!;
  assertEquals(both.target.reason, "sized");
  assertEquals(both.share.reason, "sized");
  assert(both.target.factor < 1, "une perte rétrécit");
  assert(both.share.factor > 1, "79 kg au-dessus de la moyenne de cette table");
  assertEquals(both.factor, both.share.factor * both.target.factor);

  const shareOnly = out.get("share-only")!;
  assertEquals(shareOnly.target.reason, "no_direction");
  assertEquals(shareOnly.share.reason, "sized");
  assertEquals(shareOnly.factor, shareOnly.share.factor);
});

Deno.test("⛔ AUCUNE CIBLE ET AUCUN CORPS ⇒ FACTEUR 1 EXACT — le plan d'hier, au gramme près", () => {
  // La garantie de byte-identité pour la population qui n'a rien saisi: c'est
  // elle qui empêche ce lot de « réparer » au passage des plans que personne
  // n'a demandés.
  const out = householdMouthFactors(
    [
      { member: MEMBER({ memberId: "a" }), restriction: "no_account", body: null, paceKgPerWeek: null, conditionRefs: [] },
      { member: MEMBER({ memberId: "b" }), restriction: "no_account", body: null, paceKgPerWeek: null, conditionRefs: [] },
    ],
    "no_position",
  );
  for (const [id, s] of out) {
    assertEquals(s.factor, 1, id);
    assertEquals(s.clamped, false, id);
    assertEquals(s.share.reason, "no_body", id);
    assertEquals(s.target.reason, "no_body", id);
  }
});

// ---------------------------------------------------------------------------
// ⑥ LE VOCABULAIRE — fermé, et chaque valeur atteignable
// ---------------------------------------------------------------------------

Deno.test("le vocabulaire des motifs de part est FERMÉ et chaque valeur est atteignable", () => {
  const seen = new Set<BodyShareReason>();
  const cases: Array<[Partial<ShareMouth>, "no_counting" | "no_position"]> = [
    [{}, "no_position"],
    [{ restriction: "raised" }, "no_position"],
    [{ restriction: "unreadable" }, "no_position"],
    [{}, "no_counting"],
    [{ ageState: "unknown" }, "no_position"],
    [{ body: null }, "no_position"],
  ];
  for (const [over, stance] of cases) {
    const out = bodyShareFactors(
      [SHARE({ memberId: "a", ...over }), SHARE({ memberId: "b", body: PEREGRINE })],
      stance,
    );
    seen.add(out.get("a")!.reason);
  }
  seen.add(bodyShareFactors([SHARE()], "no_position").get("m-1")!.reason);
  assertEquals([...seen].sort(), BODY_SHARE_REASONS.slice().sort());
});

// ---------------------------------------------------------------------------
// ⑦ LE NOMBRE DIT AU MODÈLE — combien de boîtes, et rien d'autre
// ---------------------------------------------------------------------------

Deno.test("`weightGroupCount` — deux bouches comptent pour un seul groupe quand elles prennent le même poids", () => {
  assertEquals(weightGroupCount(bodyShareFactors(TABLE, "no_position")), 4);
  // ⛔ LOT B ④ — LA DOCTRINE NE RAMÈNE PLUS LA TABLE À UN SEUL POIDS, ET C'EST
  // UNE CONSÉQUENCE ASSUMÉE, PAS UN EFFET DE BORD. Un foyer dont le coach dit
  // « on ne compte pas » voit désormais la MÊME consigne de boîtes qu'un autre:
  // « cette table est servie en 4 poids, donc 4 boîtes par préparation ». Ce
  // n'est pas un comptage — aucun chiffre de corps, aucune calorie, aucun
  // rapport entre deux personnes n'entre dans le prompt; c'est de la
  // logistique de casserole. Ce que la doctrine ferme reste fermé: la chaîne
  // d'OBJECTIF (`mouthTargetFactor`), qui est la seule à produire une cible.
  assertEquals(weightGroupCount(bodyShareFactors(TABLE, "no_counting")), 4);
  // Deux corps identiques + un corps différent = DEUX groupes, pas trois.
  assertEquals(
    weightGroupCount(bodyShareFactors(
      [
        SHARE({ memberId: "a", body: ODALRIC }),
        SHARE({ memberId: "b", body: ODALRIC }),
        SHARE({ memberId: "c", body: PEREGRINE }),
      ],
      "no_position",
    )),
    2,
  );
  // Une bouche sans corps porte le facteur 1: deux d'entre elles font UN
  // groupe, pas deux — elles peuvent légitimement partager une boîte.
  assertEquals(
    weightGroupCount(bodyShareFactors(
      [
        SHARE({ memberId: "a", body: ODALRIC }),
        SHARE({ memberId: "b", body: PEREGRINE }),
        SHARE({ memberId: "c", body: null }),
        SHARE({ memberId: "d", body: null }),
      ],
      "no_position",
    )),
    3,
  );
});

Deno.test("⛔ LE BRIEF DIT LE NOMBRE DE BOÎTES, ET AUCUN FAIT DE CORPS", () => {
  const four = [
    MEMBER({ memberId: "odalric", displayName: "Odalric" }),
    MEMBER({ memberId: "peregrine", displayName: "Peregrine" }),
    MEMBER({ memberId: "casimir", displayName: "Casimir", ageState: "minor" }),
    MEMBER({ memberId: "wilfrid", displayName: "Wilfrid", ageState: "minor" }),
  ];
  const sized = buildPortionBrief(four, "one_dish", 0, 4);
  // ⚠️ « N POIDS DIFFÉRENTS, DONC N BOÎTES PAR PRÉPARATION » A DISPARU LE
  // 2026-08-19, ET C'EST L'UNITÉ QUI L'A EMPORTÉ: le nombre de boîtes ne se
  // déduit plus des corps, il vaut UN PAR REPAS. Ce que ce nombre achetait — que
  // le modèle ne fabrique pas un contenant par personne — est désormais porté
  // par la forme de la clé (une part par nom sur un seul couvercle).
  assertEquals(sized.includes("different weights"), false, sized);
  // ⛔ ET LE CHIFFRE CHANGE D'AUTORITÉ: quand le moteur dimensionne, la PHRASE
  // ne porte plus de poids — il vient de la boîte, où il est écrit avec le nom
  // de la personne. Deux autorités sur un même nombre est le défaut qu'on ferme.
  assertStringIncludes(sized, "names the food and the change -- never a");
  assertStringIncludes(sized, "own box already carries their exact grams");
  assertEquals(sized.includes("write the grams, even when a box already holds them"), false);
  // ⛔ ET AUCUNE COMPARAISON DE TAILLE — mesuré au run E3: « Serve a smaller
  // child-sized share … 610 g » à côté de « a larger share … 301 g ». Les mots
  // du modèle contredisaient le nombre du moteur, dans une phrase lue à table.
  assertStringIncludes(sized, "Never describe the size of anyone's share");
  // ⚠️ LE VOCABULAIRE EST NOMMÉ, pas résumé: la première rédaction disait
  // « bigger, smaller or child-sized » et le modèle a écrit « a larger share »
  // puis « the standard share » — deux tournures qu'elle ne nommait pas.
  for (const word of ["larger", "standard", "normal", "child-sized", "the same as"]) {
    assertStringIncludes(sized, word);
  }
  // ⛔ ET LA SOURCE DU MOT EST TARIE. `CHILD_DIRECTION` est la seule des trois
  // chaînes qui énonce une TAILLE, et le modèle la recopiait mot pour mot dans
  // la phrase lue à table (runs E3/F3), à côté du grammage du moteur qui disait
  // l'inverse. Quand le moteur pèse, la ligne du mineur ne dit plus la taille.
  assertEquals(sized.includes(CHILD_DIRECTION), false, sized);
  // ⚠️ ET SEULEMENT ALORS: sans moteur, la ligne d'hier, au caractère près.
  assertStringIncludes(buildPortionBrief(four, "one_dish", 0, 1), CHILD_DIRECTION);
  // ⚠️ ET ON NE REVIENT PAS À LA VAGUE D'AVANT LE LOT 4C: les deux tournures
  // mesurées (93 notes, zéro gramme) restent refusées LITTÉRALEMENT.
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LE DÉCOUPAGE PAR CLASSE N'A PLUS D'OBJET — v4, 2026-08-20
  // ══════════════════════════════════════════════════════════════════════
  //
  // Les quatre lignes « Give every share of a meal the SAME ordinary figure --
  // one plate's worth of that meal » sont PARTIES, et ce test le vérifie mot
  // pour mot. Ce qu'elles réparaient (D1/D2/D3: le modèle écrivait 280/280 aux
  // adultes et 140/140 aux mineurs, le moteur multipliait par-dessus, et l'ado
  // de 70 kg finissait à 1,02× la part de l'adulte de 47 kg) ne peut plus se
  // produire: personne d'autre qu'une bouche à OBJECTIF ne reçoit un nombre qui
  // la vise, et le bac commun porte une quantité de récipient. Il n'y a plus de
  // part par personne à uniformiser.
  //
  // ⛔ NE LES REMETS PAS « POUR L'ÉQUITÉ ». Ordonner le même chiffre à tout le
  // monde n'a de sens que dans un modèle où tout le monde reçoit un chiffre.
  assertEquals(sized.includes("SAME ordinary figure"), false, sized);
  assertEquals(sized.includes("one plate's worth"), false, sized);
  assertEquals(sized.includes("carries the same number as the adult's"), false, sized);
  // ⛔ ET CE QUI LES REMPLACE EST LA DISTINCTION DES DEUX GRAMMES: prescription
  // sur un couvercle à un nom, quantité de bac sur un couvercle à plusieurs.
  assertStringIncludes(sized, "When ONE name is on the lid, its grams are that person's portion");
  assertStringIncludes(sized, "how much goes IN the tub for");
  assertStringIncludes(sized, "never split it per person");
  // ⛔ ET AUCUN FACTEUR N'EST DIT: un nombre sans unité à côté d'un prénom est
  // un nombre que le modèle recopie dans une note lue à table (LOT E).
  assertEquals(/\b0[.,]\d+\b/.test(sized), false, "un facteur a fuité au prompt");
  // ⛔ ET AUCUN CHIFFRE DE CORPS. Le nombre dit est un nombre de BOÎTES.
  // ⚠️ ON CHERCHE DES FAITS DE CORPS, PAS DES MOTS. `kcal`, `calorie` et `BMI`
  // figurent DÉJÀ dans le brief — dans la phrase qui les INTERDIT, et elle doit
  // y rester. Ce qu'on interdit ici, ce sont les CHIFFRES des quatre corps.
  for (const forbidden of ["23 kg", "70 kg", "47 kg", "79 kg", "122", "178 cm", "152 cm"]) {
    assertEquals(sized.includes(forbidden), false, forbidden);
  }

  // ⛔ ET LE CAS BYTE-IDENTIQUE: un seul poids ⇒ le brief d'avant ce lot, au
  // caractère près. La population qui voit une consigne différente est
  // exactement celle dont les corps diffèrent.
  // ⚠️ ET IL N'Y A PLUS DE BRANCHE À COMPARER (v4, 2026-08-20). Le bloc des
  // contenants ne lit plus `weightGroups` du tout: ce qui décide n'est plus le
  // nombre de POIDS que la table sert, mais QUI a demandé une portion à soi.
  // Les deux appels rendent donc le même bloc de boîtes, et les deux phrases v2
  // ont disparu des DEUX.
  const flat = buildPortionBrief(four, "one_dish", 0, 1);
  assertEquals(
    flat.includes(`"grams" is what THAT person takes out of the box`),
    false,
    flat,
  );
  assertEquals(flat.includes("never one figure for both."), false, flat);
  assertEquals(flat.includes("SAME ordinary figure"), false);
  // Et la demande de grammes AU MODÈLE reste entière pour cette population:
  // c'est lui qui les porte quand le moteur ne dimensionne pas.
  assertStringIncludes(flat, "write the grams, even when a box already holds them.");

  // ⚠️ L'ORDRE DU BRIEF NE BOUGE PAS: les trois lignes d'interdiction restent
  // les dernières, et le bloc des boîtes reste devant elles.
  assert(sized.indexOf("WEIGH IT ONCE") < sized.indexOf("NEVER state a reason"));
  assert(
    sized.indexOf("When ONE name is on the lid") < sized.indexOf("NEVER state a reason"),
  );
  // ⛔ ET LES DEUX GRAMMES SONT DITS AUX DEUX POPULATIONS: un seul nom ⇒ une
  // PRESCRIPTION qu'on ouvre et qu'on mange; plusieurs noms ⇒ une QUANTITÉ DE
  // BAC qui ne vise personne et qu'on ne découpe jamais par tête.
  for (const brief of [sized, buildPortionBrief(four, "one_dish", 0, 1)]) {
    assertStringIncludes(brief, "When ONE name is on the lid, its grams are that person's portion");
    assertStringIncludes(brief, "how much goes IN the tub for");
    assertStringIncludes(brief, "never split it per person");
  }
});

// ---------------------------------------------------------------------------
// ⑧ LA PHRASE — ce qu'elle porte encore, et ce qu'elle ne porte plus
//
// ⛔ CE QUI A DISPARU LE 2026-08-19, ET POURQUOI CE N'EST PAS UN RECUL.
// `attachSizedQuantities` recollait « chicken traybake 492 g · rice 464 g » à la
// fin de la note, parce qu'une boîte pendait à UNE casserole et qu'une bouche y
// avait exactement une part — un nombre vrai pour toute la semaine. Depuis que
// la boîte porte un REPAS, la part d'Odalric sur le traybake du jeudi midi n'est
// plus celle du vendredi soir: le même geste écrirait un gramme faux, lu à voix
// haute à table. Le nombre vit désormais sur le couvercle du repas, avec le nom
// de la personne — c'est-à-dire là où on l'exécute.
//
// ⚠️ CE QUI RESTE EST LA MESURE DE DÉSOBÉISSANCE, et elle est désormais prise
// sur TOUS les plans: l'ancien compteur ne tournait que dans la branche « une
// cible a mordu », donc un foyer sans corps saisi pouvait écrire n'importe quoi
// dans sa phrase de table sans qu'aucun nombre ne bouge.
// ---------------------------------------------------------------------------

const PORTION = (id: string, note: string | null) => ({
  memberId: id,
  displayName: id,
  portionNote: note,
  preparationShares: [],
  // `null` = elle suit le rythme de la maison. C'est le cas nominal; le
  // compteur ne lit pas ce champ — il voyage jusqu'à l'écran, qui s'en sert
  // pour ne PAS nommer une bouche à un moment où elle ne mange pas.
  eatingSlots: null,
});

Deno.test("⛔ LE CAS QUI PASSE — quatre phrases obéissantes, et le compteur le DIT", () => {
  // ⚠️ ÉCRIT EN PREMIER: un compteur qui compterait tout ressemble trait pour
  // trait à un compteur qui marche.
  const counts = countPortionNoteDrift([
    PORTION("odalric", "Serve the traybake with the set sides."),
    PORTION("peregrine", "Serve the traybake; keep fennel off the plate."),
    PORTION("casimir", "Swap the rice for quinoa; reheat before plating."),
    PORTION("wilfrid", "Provide hot sauce on the side."),
  ]);
  assertEquals(counts, { notes: 4, model_quantity: 0, model_size_word: 0 });
});

Deno.test("`model_quantity` compte la DÉSOBÉISSANCE — un poids dans une phrase", () => {
  // ⛔ LE BRIEF DEMANDE EXPLICITEMENT DE N'ÉCRIRE AUCUN POIDS quand le moteur
  // dimensionne (« a second number written here would contradict it »). Sans ce
  // compteur, « le modèle a obéi » et « on n'a rien mesuré » rendent le même
  // silence, et un plan à deux nombres contradictoires passerait inaperçu.
  const counts = countPortionNoteDrift([
    PORTION("odalric", "Serve 150 g of the traybake and 80 g of rice."),
    PORTION("peregrine", "Serve the traybake; keep fennel off the plate."),
    PORTION("casimir", null),
  ]);
  assertEquals(counts, { notes: 2, model_quantity: 1, model_size_word: 0 });
});

Deno.test("⛔ UNE BOUCHE SANS PHRASE N'EST PAS UNE PHRASE VIDE", () => {
  // `null` DIT « le modèle n'a rien écrit pour elle », et ce n'est pas la même
  // chose qu'une consigne muette. `notes` est le seul nombre qui les sépare.
  assertEquals(
    countPortionNoteDrift([PORTION("odalric", null), PORTION("peregrine", null)]),
    { notes: 0, model_quantity: 0, model_size_word: 0 },
  );
});

Deno.test("⛔ LE MOT DE TAILLE EST TARI À LA SOURCE — aucune direction n'en porte", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // MESURÉ SUR `cfd44e89` (2026-08-19 00:35), quatre phrases lues à table:
  //   Odalric  (79 kg) « a larger share »   → 273 g  ✅
  //   Peregrine(47 kg) « a larger share »   → 134 g  ❌ la PLUS PETITE
  //   Casimir  (70 kg) « the standard share »→ 271 g ❌ presque la plus grande
  //   Wilfrid  (23 kg) « the standard share »→ 147 g ✅
  // Deux bouches sur quatre lisaient l'inverse de ce qu'elles recevaient. Le
  // premier correctif ne relayait que `CHILD_DIRECTION`; la comparaison
  // GÉNÉRIQUE, elle, venait de `SERVING_DIRECTION`.
  // ══════════════════════════════════════════════════════════════════════════
  const four = [
    MEMBER({ memberId: "a", displayName: "Odalric", goal: "muscle_gain" }),
    MEMBER({ memberId: "b", displayName: "Peregrine", goal: "fat_loss" }),
    MEMBER({ memberId: "c", displayName: "Casimir", ageState: "minor" }),
    MEMBER({ memberId: "d", displayName: "Wilfrid", ageState: "minor" }),
  ];
  const sized = buildPortionBrief(four, "one_dish", 0, 4);
  // ⛔ AUCUNE des trois directions d'objectif, ni le repli, ni la ligne du
  // mineur ne survit dans le brief dimensionné.
  for (const said of [...Object.values(SERVING_DIRECTION), NEUTRAL_DIRECTION, CHILD_DIRECTION]) {
    assertEquals(sized.includes(said), false, said);
  }
  // ⛔ ET LE BANC LE PROUVE SUR LE TEXTE LUI-MÊME, pas seulement sur les
  // chaînes connues: aucune tournure de taille de la liste fermée.
  for (const line of sized.split("\n").filter((l) => l.startsWith("- "))) {
    assertEquals(sizeWordMatches(line), [], line);
  }

  // ⚠️ ET SANS MOTEUR, LE BRIEF D'HIER AU CARACTÈRE PRÈS: c'est alors le modèle
  // qui porte le nombre, et lui retirer les mots de taille le laisserait sans
  // rien à dire — la vague de 93 notes sans un gramme du LOT 4C.
  const flat = buildPortionBrief(four, "one_dish", 0, 1);
  assertStringIncludes(flat, SERVING_DIRECTION.muscle_gain);
  assertStringIncludes(flat, CHILD_DIRECTION);
});

Deno.test("⛔ LA TRADUCTION SANS TAILLE COUVRE **TOUTE** SORTIE DE `servingDirectionFor`", () => {
  // ⚠️ SANS CE TEST, AJOUTER UN OBJECTIF LAISSERAIT SA CHAÎNE — avec son mot de
  // taille — retomber sur le repli en silence, et la phrase se remettrait à
  // contredire le nombre pour cette population-là seulement.
  const seen = new Set<string>();
  // ⚠️ `null` EST DANS LA BOUCLE, ET C'EST LE CAS QUI PRODUIT `CHILD_DIRECTION`.
  // Depuis le 2026-08-18 `goalApplies` accepte les trois objectifs d'un mineur:
  // un mineur QUI A un objectif rend la chaîne de cet objectif, pas celle de
  // l'enfant. Sans `null`, la ligne du mineur n'était jamais parcourue.
  for (const goal of [...MEMBER_GOALS, null] as const) {
    for (const ageState of ["adult", "minor", "unknown"] as const) {
      const m = MEMBER({ goal, ageState });
      seen.add(servingDirectionFor(m));
      const free = sizeFreeDirectionFor(m);
      assertEquals(sizeWordMatches(free), [], `${goal}/${ageState}: ${free}`);
      // ⛔ LE REPLI NE DOIT JAMAIS SERVIR: chaque sortie de `servingDirectionFor`
      // a sa traduction NOMMÉE. Le repli existe pour qu'un `undefined` n'entre
      // pas dans un prompt, pas pour absorber un objectif qu'on a oublié.
      const named = [
        SERVING_DIRECTION.fat_loss,
        SERVING_DIRECTION.muscle_gain,
        SERVING_DIRECTION.maintenance,
        NEUTRAL_DIRECTION,
        CHILD_DIRECTION,
      ];
      assert(
        named.includes(servingDirectionFor(m)),
        `${goal}/${ageState}: « ${servingDirectionFor(m)} » n'a pas de traduction sans taille`,
      );
      assert(free.length > 0);
    }
  }
  // Prémisse: les trois directions d'objectif ET les deux replis ont bien été
  // parcourus — un extracteur cassé rendrait un ensemble vide, et tout passerait.
  assert(seen.size >= 3, [...seen].join(" | "));
  assert(seen.has(CHILD_DIRECTION) && seen.has(SERVING_DIRECTION.muscle_gain));
});

Deno.test("⛔ LE COMPTEUR DE MOTS DE TAILLE — mordu sur les VRAIES phrases mesurées", () => {
  // Les quatre phrases de `cfd44e89`, à l'octet.
  const before = [
    "Serve a larger share of the chicken and rice with the standard broccoli portion.",
    "Serve a larger share of chicken and rice. Ensure no orange-coloured vegetables.",
    "Serve the standard share of all components. Provide hot sauce on the side.",
    "Serve the standard share of all components. Ensure all bread crusts are removed.",
  ];
  for (const note of before) assert(sizeWordMatches(note).length > 0, note);
  // Et les MOITIÉS UTILES ne déclenchent rien: c'est ce que le modèle doit
  // garder — la manière, l'ordre, les substitutions, les précautions.
  for (
    const good of [
      "Ensure all bread crusts are removed before serving.",
      "Provide hot sauce on the side for every meal.",
      "No fennel and no orange-coloured vegetables on the plate.",
      "Swap the rice for quinoa; reheat the traybake before plating.",
      "Add a spoonful of blackcurrant jam to the sourdough toast.",
    ]
  ) {
    assertEquals(sizeWordMatches(good), [], good);
  }
  // ⛔ ET UNE ÉTIQUETTE DE BOÎTE NE DÉCLENCHE RIEN NON PLUS: elle n'a aucun mot.
  assertEquals(sizeWordMatches("chicken traybake 492 g · rice 464 g"), []);
});

Deno.test("`model_size_word` compte la phrase qui contredit le nombre", () => {
  // Mesuré FAUX une fois sur deux sur `cfd44e89`: deux bouches sur quatre
  // lisaient l'inverse de ce qu'elles recevaient. Un chiffre qui contredit sa
  // propre phrase est pire qu'un chiffre absent.
  const counts = countPortionNoteDrift([
    PORTION("odalric", "Serve a larger share of the chicken and rice."),
    PORTION("peregrine", "No fennel on the plate; reheat before serving."),
    PORTION("casimir", "Serve the standard share of all components."),
    PORTION("wilfrid", null),
  ]);
  assertEquals(counts, { notes: 3, model_quantity: 0, model_size_word: 2 });
});

Deno.test("⛔ AUCUN kcal NE SORT DE LA PART — ce qui traverse est SANS UNITÉ", () => {
  // La règle du fichier: on CALCULE avec l'entretien, on ne l'ÉNONCE jamais.
  // Un entretien qui fuirait dans l'objet rendu finirait dans `generated_from`
  // — c'est-à-dire dans une colonne lisible par tout le foyer, à côté du
  // prénom d'un enfant.
  for (const s of bodyShareFactors(TABLE, "no_position").values()) {
    assertEquals(Object.keys(s).sort(), ["factor", "reason"]);
    assert(s.factor > 0 && s.factor < 2, `${s.factor} n'est pas un facteur`);
  }
  for (const s of householdMouthFactors(
    TABLE.map((m): FactorMouth => ({
      member: MEMBER({ memberId: m.memberId, ageState: m.ageState as MemberAgeState }),
      restriction: m.restriction as MouthRestrictionState,
      body: m.body,
      paceKgPerWeek: null,
      conditionRefs: [],
    })),
    "no_position",
  ).values()) {
    assertEquals(Object.keys(s).sort(), ["clamped", "factor", "share", "target"]);
  }
});

// ---------------------------------------------------------------------------
// LOT B ② — LE BRANCHEMENT, LU DANS LA SOURCE DU GÉNÉRATEUR
//
// ⛔ POURQUOI UN TEST DE SOURCE ET PAS UN RUN. Le module pur ne prouve que la
// moitié: une fonction juste, appelée avec une table de facteurs VIDE, rend
// exactement le produit d'avant — « construit, branché, désarmé », le mode
// d'échec n°1 de ce dépôt. Le run réel qui l'aurait prouvé n'a pas pu aboutir
// (le conteneur edge du poste est recréé toutes les 30 à 70 secondes par une
// session voisine, mesuré: `StartedAt` 10:13:56 → 10:15:01 → 10:15:28, deux
// appels tués en 12 s et 16 s). Ce banc-ci tient la même propriété sans
// dépendre du poste.
// ---------------------------------------------------------------------------

const GENERATOR = new URL(
  "../../generate-household-meal-v1/index.ts",
  import.meta.url,
);

/** Retire les commentaires: ce dépôt est très commenté, et un `grep` naïf compte des commentaires comme des lecteurs vivants. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

Deno.test("⛔ LE GÉNÉRATEUR DIMENSIONNE LES REPAS, ET MESURE LA PHRASE SANS CONDITION", async () => {
  const src = withoutComments(await Deno.readTextFile(GENERATOR));

  // ── PRÉMISSE: la source a bien été lue ────────────────────────────────
  // Un extracteur cassé rend `""` et tous les `assert` ci-dessous passeraient
  // en ne regardant RIEN. C'est la cicatrice de `energy_gate_mouth_test.ts`.
  assert(src.includes("sizeBoxesFromTarget("), "la source du générateur n'a pas été lue");
  assert(src.includes("countPortionNoteDrift("), "la source du générateur n'a pas été lue");

  // ① LE DIMENSIONNEMENT LIT LES REPAS, PAS LES CASSEROLES. C'est le lot du
  //    2026-08-19: une boîte pend au plat. Un générateur resté sur
  //    `meal.preparations` rendrait une table de parts VIDE, et le lot serait
  //    construit-branché-désarmé — le mode d'échec n°1 de ce dépôt.
  const sizing = src.slice(src.indexOf("sizeBoxesFromTarget("));
  const call = sizing.slice(0, sizing.indexOf("\n    );") + 8);
  assert(call.includes("meal.dishes"), `le dimensionnement ne lit pas les repas:\n${call}`);
  assert(
    call.includes("dish.boxes"),
    `le dimensionnement ne lit pas les contenants du repas:\n${call}`,
  );
  assert(
    call.includes("sizingFactors"),
    `le dimensionnement tourne sans les facteurs:\n${call}`,
  );

  // ② LA PART REDIMENSIONNÉE EST RECOPIÉE SUR LA BOÎTE. Sans ce report, la
  //    fonction serait juste et son résultat jeté — « construit, branché,
  //    désarmé » une fois de plus.
  assert(
    /boxSizing\.items\.get\(/.test(src),
    "les grammes redimensionnés ne sont jamais reportés sur les contenants",
  );

  // ③ LA MESURE DE LA PHRASE N'EST PLUS SOUS CONDITION. L'ancien compteur ne
  //    tournait que dans la branche « une cible a mordu »: un foyer sans corps
  //    saisi pouvait écrire n'importe quoi dans sa phrase de table sans qu'aucun
  //    nombre ne bouge. Une mesure qui ne se prend que quand tout va bien ne
  //    mesure rien.
  assert(
    /const portionQuantityTrace = countPortionNoteDrift\(portions\);/.test(src),
    "le compteur de dérive de la phrase est resté conditionnel",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// L'APPÉTIT DE LA TABLE — ce qui dimensionne la CASSEROLE (2026-08-19)
//
// « Les portions, même si elles ne sont pas pesées pour les autres membres,
// elles sont quand même déterminées par le poids, l'âge et la taille ? Parce
// que c'est important de ne pas faire de gaspillage non plus. »
//
// Aujourd'hui `presence.servings` est un COMPTE DE TÊTES: un homme de 73 kg
// qui s'entraîne dur et une femme de 59 kg comptent tous deux pour 1.
// ═══════════════════════════════════════════════════════════════════════════

const BIG_ADULT: MouthBody = {
  appetite: null,
  heightCm: 187,
  weightKg: 73,
  gender: "male",
  ageYears: 28,
  activityLevel: "trains_hard",
  activityAxes: { day: null, sport: null, asked: false },
};
const SMALL_ADULT: MouthBody = {
  appetite: null,
  heightCm: 169,
  weightKg: 59,
  gender: "female",
  ageYears: 55,
  activityLevel: "trains_some",
  activityAxes: { day: null, sport: null, asked: false },
};
const YOUNG_CHILD: MouthBody = {
  appetite: null,
  heightCm: 128,
  weightKg: 26,
  gender: "female",
  ageYears: 8,
  activityLevel: null,
  activityAxes: { day: null, sport: null, asked: false },
};

Deno.test("⛔ deux corps différents ne comptent PAS tous les deux pour 1", () => {
  const pair = householdAppetite([
    { ageState: "adult", body: BIG_ADULT },
    { ageState: "adult", body: SMALL_ADULT },
  ]);
  // Le compte de têtes dirait 2. L'appétit dit autre chose — c'est tout
  // l'objet de la fonction.
  assert(
    pair.equivalent !== null && pair.equivalent !== 2,
    `l'appétit est retombé sur le compte de têtes: ${JSON.stringify(pair)}`,
  );
  assertEquals(pair.known, 2);
  assertEquals(pair.mouths, 2);
});

Deno.test("⛔ deux jeunes enfants pèsent MOINS que deux adultes — le vrai gaspillage", () => {
  const withChildren = householdAppetite([
    { ageState: "adult", body: SMALL_ADULT },
    { ageState: "minor", body: YOUNG_CHILD },
    { ageState: "minor", body: YOUNG_CHILD },
  ]);
  const threeAdults = householdAppetite([
    { ageState: "adult", body: SMALL_ADULT },
    { ageState: "adult", body: SMALL_ADULT },
    { ageState: "adult", body: SMALL_ADULT },
  ]);
  assert(withChildren.equivalent !== null && threeAdults.equivalent !== null);
  assert(
    withChildren.equivalent < threeAdults.equivalent,
    `trois assiettes d'adulte pour un adulte et deux enfants: ` +
      `${withChildren.equivalent} contre ${threeAdults.equivalent}`,
  );
  // ⚠️ ET L'ÉQUATION PÉDIATRIQUE EST BIEN CHOISIE PAR `ageState`, pas par
  // l'âge du corps: un enfant dont la date manque est `unknown`, pas mineur.
  const asAdults = householdAppetite([
    { ageState: "adult", body: SMALL_ADULT },
    { ageState: "adult", body: YOUNG_CHILD },
    { ageState: "adult", body: YOUNG_CHILD },
  ]);
  assert(
    asAdults.equivalent !== withChildren.equivalent,
    "l'équation pédiatrique n'est pas choisie par `ageState`",
  );
});

Deno.test("⛔ TOUT OU RIEN — un seul corps manquant fait retomber sur le compte", () => {
  // Sommer les corps CONNUS sous-dimensionne systématiquement, et se tromper
  // dans ce sens veut dire que quelqu'un ne mange pas.
  const partial = householdAppetite([
    { ageState: "adult", body: BIG_ADULT },
    { ageState: "adult", body: null },
  ]);
  assertEquals(partial.equivalent, null);
  // ⚠️ LE CONSTAT SORT AVEC SA POPULATION: « 1 connu » ne veut rien dire sans
  // « sur 2 ». Un compteur sans dénominateur est un compteur qui ment.
  assertEquals(partial.known, 1);
  assertEquals(partial.mouths, 2);
  assertEquals(householdAppetite([]).equivalent, null);
});

Deno.test("⚠️ LE CAS QUI PASSE — un corps connu partout rend bien un nombre", () => {
  // Sans lui, une fonction qui rendrait TOUJOURS `null` passerait les trois
  // tests du dessus et ne dimensionnerait jamais rien.
  const one = householdAppetite([{ ageState: "adult", body: SMALL_ADULT }]);
  assert(one.equivalent !== null && one.equivalent >= 1);
  // Plancher à 1: une table sert au moins une assiette.
  const tiny = householdAppetite([{ ageState: "minor", body: YOUNG_CHILD }]);
  assertEquals(tiny.equivalent, 1);
  // Arrondi au demi — une précision au centième laisse deviner un corps.
  for (const v of [one.equivalent, tiny.equivalent]) {
    assertEquals((v as number) * 2 % 1, 0, `${v} n'est pas arrondi au demi`);
  }
});
