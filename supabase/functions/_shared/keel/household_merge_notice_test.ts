/**
 * L5 — LA PROPOSITION (D10), L'AVERTISSEMENT (D8), LE RÉGLAGE (D17), ET LA
 * FUSION COLLANTE.
 *
 * ⚠️ AUCUN NOMBRE ATTENDU N'EST CALCULÉ PAR LA FONCTION TESTÉE. « Un test
 * paramétré par sa propre constante reste vert quand on change la constante »:
 * les jours attendus sont écrits en toutes lettres (5 jours couverts, 2 passés,
 * 3 restants), jamais dérivés de `bestMergePair`.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildMergeNotices,
  carryMergedFrom,
  EXIT_DISMISS,
  EXIT_MERGE,
  EXIT_UNMERGE,
  heldMemberIds,
  latestValidated,
  mergeCarriers,
  type MergeCarrierPlan,
  type MergedFromEntry,
  type MergeSettingRow,
  mergeStandings,
  SKIP_QUOTA_EXHAUSTED,
  NOTICE_MERGE_AVAILABLE,
  NOTICE_MERGED_PLAN_REVALIDATED,
  type NoticeMember,
  proposalSentence,
  readMergedFrom,
  readMergedIntoPlanId,
  SKIP_ALREADY_MERGED,
  SKIP_DISMISSED,
  SKIP_IS_OWNER,
  SKIP_MUTED,
  SKIP_NO_VALIDATED_PLAN,
  STANDING_HELD,
  STANDING_MERGED_PLAN_GONE,
  STANDING_MERGED_PLAN_REPLACED,
  STANDING_NO_LIVE_PLAN,
  STANDING_REVALIDATED,
  STANDING_UNDATED,
} from "./household_merge_notice.ts";
import {
  buildUnmergeBlock,
  resolveMergeWindow,
  resolveTailWindow,
  UNMERGE_CLOSENESS_INSTRUCTION,
} from "./household_merge.ts";
import type { MergeQuotaState } from "./household_merge_quota.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

// ===========================================================================
// 1. RELIRE `merged_from` — LA FORME QUE L4 ÉCRIT VRAIMENT
// ===========================================================================

/**
 * ⚠️ RECOPIÉE DE `generate-household-meal-v1`, PAS IMPORTÉE. Si ce décor
 * dérivait de `mergedFromEntry`, il resterait vrai le jour où la FORME change
 * des deux côtés à la fois — c'est-à-dire exactement quand il devrait tomber.
 * Le chemin (`household.merge.merged_from`) est écrit à la main pour la même
 * raison.
 */
const ARCHIVE = {
  coach_id: "c-1",
  household: {
    id: "h-1",
    hand: { taken: [], partial: [], reclaimed: [] },
    merge: {
      into_plan_id: "plan-house-1",
      merged_from: [
        {
          member_id: "m-zoe",
          user_id: "u-zoe",
          plan_id: "plan-zoe-1",
          plan_starts_on: "2026-08-10",
          plan_duration_days: 7,
          validated_at: "2026-08-12T09:00:00+00:00",
          days: ["2026-08-12", "2026-08-13"],
        },
      ],
    },
  },
};

Deno.test("LE CAS QUI PASSE: `merged_from` se relit tel que L4 l'écrit", () => {
  const entries = readMergedFrom(ARCHIVE);
  assertEquals(entries.length, 1);
  assertEquals(entries[0].member_id, "m-zoe");
  assertEquals(entries[0].plan_id, "plan-zoe-1");
  assertEquals(entries[0].validated_at, "2026-08-12T09:00:00+00:00");
  assertEquals(entries[0].plan_duration_days, 7);
  assertEquals(readMergedIntoPlanId(ARCHIVE), "plan-house-1");
});

Deno.test("un plan SANS fusion ne rend rien, et ne lève pas", () => {
  // Le cas MAJORITAIRE: toute composition ordinaire d'avant ce lot. S'il levait,
  // la relecture ferait tomber la composition la plus fréquente du produit.
  assertEquals(readMergedFrom({ household: { id: "h-1" } }).length, 0);
  assertEquals(readMergedFrom(null).length, 0);
  assertEquals(readMergedFrom("nope").length, 0);
  assertEquals(readMergedFrom({ household: { merge: { merged_from: 3 } } }).length, 0);
  assertEquals(readMergedIntoPlanId({}), null);
});

Deno.test("une entrée illisible tombe et n'emporte pas les autres", () => {
  const entries = readMergedFrom({
    household: {
      merge: {
        merged_from: [
          { plan_id: "orphan" }, // pas de member_id
          { member_id: "m-a" }, // pas de plan_id
          null,
          { member_id: "m-b", plan_id: "p-b", validated_at: "2026-08-12T09:00:00Z" },
        ],
      },
    },
  });
  assertEquals(entries.map((e) => e.member_id), ["m-b"]);
});

// ===========================================================================
// 2. D8 — LES DEUX DATES DE VALIDATION
// ===========================================================================

const MERGED: MergedFromEntry = {
  member_id: "m-zoe",
  user_id: "u-zoe",
  plan_id: "plan-zoe-1",
  plan_starts_on: "2026-08-10",
  plan_duration_days: 7,
  validated_at: "2026-08-12T09:00:00+00:00",
  days: ["2026-08-12"],
};

const plansOf = (
  ...plans: { id: string; validatedAt: string | null }[]
) =>
  new Map([[
    "m-zoe",
    plans.map((p) => ({
      id: p.id,
      startsOn: "2026-08-10",
      durationDays: 7,
      validatedAt: p.validatedAt,
    })),
  ]]);

Deno.test("LE CAS QUI PASSE: rien de neuf ⇒ la fusion TIENT, sans avertir", () => {
  // Sans lui, une garde qui avertirait TOUJOURS serait indiscernable d'une
  // garde qui marche — et la fusion cesserait d'être collante.
  const [s] = mergeStandings({
    mergedFrom: [MERGED],
    plansByMember: plansOf({ id: "plan-zoe-1", validatedAt: "2026-08-12T09:00:00+00:00" }),
  });
  assertEquals(s.state, STANDING_HELD);
  assertEquals(s.hold, true);
  assertEquals(s.warn, false);
  assertEquals(heldMemberIds([s]), ["m-zoe"]);
});

Deno.test("D8 — LE PLAN FUSIONNÉ revalidé avertit, et ne tient plus", () => {
  // Le plan fusionné est TOUJOURS là, sous le même id, et porte une validation
  // postérieure: elle a relu et revalidé CE plan-là.
  const [s] = mergeStandings({
    mergedFrom: [MERGED],
    plansByMember: plansOf({ id: "plan-zoe-1", validatedAt: "2026-08-14T08:00:00+00:00" }),
  });
  assertEquals(s.state, STANDING_REVALIDATED);
  assertEquals(s.warn, true);
  assertEquals(s.mergedPlanStillLive, true);
  assertEquals(s.mergedPlanValidatedAtNow, "2026-08-14T08:00:00+00:00");
  // ⚠️ NE PAS TENIR EST LA MOITIÉ QUI COMPTE. Re-reprendre d'office quelqu'un
  // qui vient d'écrire un plan neuf déciderait à la place du maître — l'inverse
  // exact de D10, et le cas que D8 fait justement remonter avec trois sorties.
  assertEquals(s.hold, false);
  assertEquals(heldMemberIds([s]), []);
});

Deno.test("D8 — le plan fusionné REMPLACÉ avertit, sous son propre état", () => {
  // ⚠️ C'EST LE CAS CANONIQUE DE D8, et il ne passe PAS par le même chemin que
  // celui du dessus: `write_student_meal_plan` RETIRE la ligne d'avant et en
  // écrit une neuve, donc l'id change. Comparer « le plan fusionné » à lui-même
  // ne suffirait pas — il a disparu. On regarde alors, et alors seulement, si
  // quelque chose de plus récent a été validé.
  const [s] = mergeStandings({
    mergedFrom: [MERGED],
    plansByMember: plansOf({ id: "plan-zoe-2", validatedAt: "2026-08-14T08:00:00+00:00" }),
  });
  assertEquals(s.state, STANDING_MERGED_PLAN_REPLACED);
  assertEquals(s.warn, true);
  assertEquals(s.hold, false);
  assertEquals(s.mergedPlanStillLive, false);
  assertEquals(s.mergedPlanValidatedAtNow, null);
  assertEquals(s.latestPlanId, "plan-zoe-2");
  assertEquals(heldMemberIds([s]), []);
});

Deno.test("le plan fusionné DISPARU sans rien de plus récent n'avertit PAS", () => {
  // ⚠️ C'EST LE CAS LIMITE, ET IL A SA PROPRE RÉPONSE. La ligne fusionnée n'est
  // plus là, mais la seule autre validation vivante est ANTÉRIEURE au geste du
  // maître: « elle a validé un nouveau plan après votre fusion » serait FAUX, et
  // une alerte D8 fausse est indiscernable d'une vraie — le maître irait
  // défusionner. On ne tient pas non plus, et c'est sans conséquence: la
  // contrainte d'exclusion interdit qu'un autre plan vivant couvre les jours du
  // plan disparu, donc plus rien ne la retire de la table.
  const [s] = mergeStandings({
    mergedFrom: [MERGED],
    plansByMember: plansOf({ id: "plan-zoe-3", validatedAt: "2026-08-11T08:00:00+00:00" }),
  });
  assertEquals(s.state, STANDING_MERGED_PLAN_GONE);
  assertEquals(s.warn, false);
  assertEquals(s.hold, false);
  assertEquals(s.mergedPlanStillLive, false);
});

Deno.test("LES DATES SE COMPARENT EN INSTANTS, PAS EN CHAÎNES", () => {
  // ⚠️ `Z` ET `+00:00` SONT LE MÊME INSTANT ET NE S'ORDONNENT PAS PAREIL EN
  // LEXICOGRAPHIQUE: "…09:00:00Z" > "…09:00:00+00:00" caractère par caractère.
  // Une comparaison de chaînes déclarerait donc « il a revalidé » sur deux
  // écritures du MÊME instant — un avertissement fabriqué, et une fusion qui
  // cesse de tenir sans que personne n'ait rien fait.
  const [s] = mergeStandings({
    mergedFrom: [{ ...MERGED, validated_at: "2026-08-12T09:00:00+00:00" }],
    plansByMember: plansOf({ id: "plan-zoe-1", validatedAt: "2026-08-12T09:00:00Z" }),
  });
  assertEquals(s.state, STANDING_HELD);
  assertEquals(s.warn, false);
});

Deno.test("plus aucun plan vivant ⇒ plus rien à tenir, et aucun avertissement", () => {
  const [s] = mergeStandings({
    mergedFrom: [MERGED],
    plansByMember: new Map([["m-zoe", []]]),
  });
  assertEquals(s.state, STANDING_NO_LIVE_PLAN);
  assertEquals(s.hold, false);
  assertEquals(s.warn, false);
});

Deno.test("une archive SANS DATE tient la fusion sans avertir — direction sûre", () => {
  // Structurellement inatteignable depuis une base valide (`own_plans` filtre
  // `validated_at is not null`). L'erreur coûte au pire une assiette de trop —
  // même arbitrage que L2 sur `servings` et L3 sur le recouvrement total —
  // alors que l'inverse défait en silence un geste du maître.
  const [s] = mergeStandings({
    mergedFrom: [{ ...MERGED, validated_at: null }],
    plansByMember: plansOf({ id: "plan-zoe-9", validatedAt: "2026-08-14T08:00:00Z" }),
  });
  assertEquals(s.state, STANDING_UNDATED);
  assertEquals(s.hold, true);
  assertEquals(s.warn, false);
});

Deno.test("le plan de référence est le PLUS RÉCEMMENT VALIDÉ, pas le premier", () => {
  const latest = latestValidated([
    { id: "a", startsOn: "2026-08-10", durationDays: 7, validatedAt: "2026-08-11T10:00:00Z" },
    { id: "b", startsOn: "2026-08-17", durationDays: 7, validatedAt: "2026-08-14T10:00:00Z" },
    { id: "c", startsOn: "2026-08-24", durationDays: 7, validatedAt: null },
  ]);
  assertEquals(latest?.id, "b");
});

// ===========================================================================
// 3. LE REPORT — LA CHAÎNE NE CASSE PAS AU DEUXIÈME GESTE
// ===========================================================================

Deno.test("les reprises TENUES sont reportées, avec les jours du NOUVEAU plan", () => {
  const carried = carryMergedFrom({
    mergedFrom: [MERGED],
    heldMemberIds: ["m-zoe"],
    window: { startsOn: "2026-08-14", durationDays: 3 },
  });
  assertEquals(carried.length, 1);
  assertEquals(carried[0].plan_id, "plan-zoe-1");
  // La date de validation ARCHIVÉE survit: c'est elle que D8 comparera, et la
  // remplacer par « aujourd'hui » effacerait la trace du geste du maître.
  assertEquals(carried[0].validated_at, "2026-08-12T09:00:00+00:00");
  // Les jours, eux, sont ceux de CE plan-ci. Écrits à la main.
  assertEquals(carried[0].days, ["2026-08-14", "2026-08-15", "2026-08-16"]);
});

Deno.test("une reprise qui ne tient plus N'EST PAS reportée", () => {
  // C'est ce qui fait qu'une défusion — ou une revalidation — sort vraiment la
  // personne: si l'entrée survivait, la composition suivante la re-reprendrait.
  assertEquals(
    carryMergedFrom({
      mergedFrom: [MERGED],
      heldMemberIds: [],
      window: { startsOn: "2026-08-14", durationDays: 3 },
    }).length,
    0,
  );
});

// ===========================================================================
// 4. D10 · D8 · D17 — CE QU'ON MONTRE AU MAÎTRE
// ===========================================================================

/** Le foyer couvre lundi 10 → dimanche 16. Le plan de Zoé aussi. */
const HOUSE_PLAN = { id: "plan-house-1", startsOn: "2026-08-10", durationDays: 7 };

/**
 * UN PLAN DU FOYER **AVEC SA PROVENANCE** — c'est par là que les reprises
 * entrent désormais, et c'est ce qui a permis au défaut de vivre.
 *
 * ⚠️ LE CHEMIN EST ÉCRIT À LA MAIN (`household.merge.merged_from`), pas dérivé
 * de l'écrivain: un décor dérivé resterait vrai le jour où la forme change des
 * deux côtés à la fois, c'est-à-dire exactement quand il devrait tomber.
 */
const carrying = (
  plan: { id: string; startsOn: string; durationDays: number },
  ...entries: MergedFromEntry[]
) => ({
  ...plan,
  generatedFrom: entries.length === 0
    ? null
    : { household: { merge: { merged_from: entries } } },
});

const ZOE = (validatedAt: string, id = "plan-zoe-1"): NoticeMember => ({
  memberId: "m-zoe",
  userId: "u-zoe",
  displayName: "Zoe",
  isOwner: false,
  ownPlans: [{ id, startsOn: "2026-08-12", durationDays: 5, validatedAt }],
});

const OWNER: NoticeMember = {
  memberId: "m-owner",
  userId: "u-owner",
  displayName: "Marc",
  isOwner: true,
  ownPlans: [{
    id: "plan-marc",
    startsOn: "2026-08-10",
    durationDays: 7,
    validatedAt: "2026-08-11T10:00:00Z",
  }],
};

/**
 * L7/D11 — LE DÉCOR DE PLAFOND PAR DÉFAUT: DE LA PLACE, ET ÇA SE VOIT.
 *
 * ⚠️ PAS `null`. Un décor qui ne sait pas dire si la semaine est pleine
 * laisserait passer une inversion du drapeau sans qu'aucun test ne tombe: les
 * deux états rendraient « on propose ». Le défaut est donc un plafond RÉEL, non
 * plein — 2 fusions sur 5 — et le cas plein est écrit à la main là où il est
 * testé.
 */
const QUOTA_ROOM: MergeQuotaState = {
  weekStart: "2026-08-10",
  used: 2,
  limit: 5,
  remaining: 3,
  resetsOn: "2026-08-17",
  exhausted: false,
};

const QUOTA_FULL: MergeQuotaState = {
  weekStart: "2026-08-10",
  used: 5,
  limit: 5,
  remaining: 0,
  resetsOn: "2026-08-17",
  exhausted: true,
};

const notices = (args: {
  members: NoticeMember[];
  /** Raccourci: ces reprises sont archivées SUR le plan du foyer du décor. */
  mergedFrom?: MergedFromEntry[];
  householdPlans?: MergeCarrierPlan[];
  settings?: MergeSettingRow[];
  today?: string;
  quota?: MergeQuotaState | null;
}) =>
  buildMergeNotices({
    members: args.members,
    householdPlans: args.householdPlans ??
      [carrying(HOUSE_PLAN, ...(args.mergedFrom ?? []))],
    settings: args.settings ?? [],
    // Jeudi 14. Le plan de Zoé va du 12 au 16: 5 jours, dont 2 passés (12, 13),
    // 3 restants (14, 15, 16). Les trois nombres sont écrits ici, à la main.
    today: args.today ?? "2026-08-14",
    quota: args.quota === undefined ? QUOTA_ROOM : args.quota,
  });

/** Ce que `held` annonce pour une reprise portée par le plan du foyer du décor. */
const HELD_ON_HOUSE_PLAN = {
  memberId: "m-zoe",
  planId: "plan-house-1",
  window: { startsOn: "2026-08-10", durationDays: 7 },
};

Deno.test("D10 — LE CAS QUI PASSE: un plan validé fait une proposition chiffrée", () => {
  const out = notices({ members: [OWNER, ZOE("2026-08-13T10:00:00Z")] });
  assertEquals(out.notices.length, 1);
  const n = out.notices[0];
  assertEquals(n.kind, NOTICE_MERGE_AVAILABLE);
  assertEquals(n.memberId, "m-zoe");
  // D16 mot pour mot: « son plan couvre 5 jours, dont 2 déjà passés — je peux
  // fusionner les 3 restants ».
  assertEquals(n.mergeable?.intersection.durationDays, 5);
  assertEquals(n.mergeable?.daysAlreadyPast, 2);
  assertEquals(n.mergeable?.window.durationDays, 3);
  assertEquals(n.mergeable?.window.startsOn, "2026-08-14");
  assertEquals(n.mergeable?.intoPlanId, "plan-house-1");
  assertEquals(n.exits, [EXIT_MERGE, EXIT_DISMISS]);
  assertEquals(n.merged, null);
  // Le maître n'a jamais de proposition, et il est tracé plutôt que tu.
  assertEquals(
    out.skipped.find((s) => s.memberId === "m-owner")?.reason,
    SKIP_IS_OWNER,
  );
});

Deno.test("la phrase de D16 porte les trois nombres, dans cet ordre", () => {
  const n = notices({ members: [ZOE("2026-08-13T10:00:00Z")] }).notices[0];
  const sentence = proposalSentence(n);
  assert(sentence.includes("Zoe"), sentence);
  assert(sentence.includes("5 days"), sentence);
  assert(sentence.includes("2 of them already behind us"), sentence);
  assert(sentence.includes("3 days that are left"), sentence);
});

Deno.test("aucun jour passé ⇒ la phrase ne parle pas de jours passés", () => {
  // Le cas le plus FRÉQUENT (on compose pour la semaine à venir). Une phrase qui
  // dirait « dont 0 déjà passés » ferait douter d'un plan parfaitement normal.
  const n = notices({
    members: [ZOE("2026-08-11T10:00:00Z")],
    today: "2026-08-10",
  }).notices[0];
  const sentence = proposalSentence(n);
  assert(!sentence.includes("behind us"), sentence);
  assert(sentence.includes("all 5 of them"), sentence);
});

Deno.test("D8 — une validation POSTÉRIEURE devient un AVERTISSEMENT à trois sorties", () => {
  const out = notices({
    members: [ZOE("2026-08-15T08:00:00Z", "plan-zoe-2")],
    mergedFrom: [MERGED],
  });
  assertEquals(out.notices.length, 1);
  const n = out.notices[0];
  assertEquals(n.kind, NOTICE_MERGED_PLAN_REVALIDATED);
  assertEquals(n.merged?.planId, "plan-zoe-1");
  assertEquals(n.merged?.validatedAt, "2026-08-12T09:00:00+00:00");
  // LES TROIS SORTIES DE D8, DANS L'ORDRE DU REGISTRE: la défusion d'abord —
  // c'est elle qui préserve les courses déjà faites.
  assertEquals(n.exits, [EXIT_UNMERGE, EXIT_MERGE, EXIT_DISMISS]);
  // Et la personne n'est plus tenue: la prochaine composition ne la reprendra
  // pas d'office.
  assertEquals(out.held, []);
});

Deno.test("une reprise QUI TIENT ne se propose pas une seconde fois", () => {
  const out = notices({
    members: [ZOE("2026-08-12T09:00:00+00:00")],
    mergedFrom: [MERGED],
  });
  assertEquals(out.notices, []);
  assertEquals(out.skipped[0].reason, SKIP_ALREADY_MERGED);
  // ⚠️ `held` PORTE SA PORTÉE. Une liste d'ids nus promettait une reprise que
  // toute composition d'une AUTRE semaine n'allait pas faire — le générateur ne
  // relit `merged_from` que sur les plans qui mordent sur la fenêtre visée.
  assertEquals(out.held, [HELD_ON_HOUSE_PLAN]);
});

Deno.test("sans plan validé, rien n'est proposé — et c'est tracé", () => {
  const out = notices({
    members: [{ ...ZOE("x"), ownPlans: [] }],
  });
  assertEquals(out.notices, []);
  assertEquals(out.skipped[0].reason, SKIP_NO_VALIDATED_PLAN);
});

Deno.test("D17 — le réglage COUPE LA PROPOSITION", () => {
  const out = notices({
    members: [ZOE("2026-08-13T10:00:00Z")],
    settings: [{
      memberId: "m-zoe",
      proposalsMuted: true,
      dismissedValidatedAt: null,
    }],
  });
  assertEquals(out.notices, []);
  assertEquals(out.skipped[0].reason, SKIP_MUTED);
});

Deno.test("D17 — le réglage NE COUPE PAS L'AVERTISSEMENT DE D8", () => {
  // ⚠️ L'ÉCART EST DÉLIBÉRÉ. Une proposition parle du plan de QUELQU'UN
  // D'AUTRE — on peut ne plus vouloir l'entendre. Un avertissement parle du
  // plan du MAÎTRE: sa propre ligne vivante contient la reprise d'un plan que
  // l'intéressé a remplacé. Le taire rendrait ce plan périmé invisible ET
  // indéfaisable, puisque la défusion se déclenche depuis cet avertissement.
  const out = notices({
    members: [ZOE("2026-08-15T08:00:00Z", "plan-zoe-2")],
    mergedFrom: [MERGED],
    settings: [{
      memberId: "m-zoe",
      proposalsMuted: true,
      dismissedValidatedAt: null,
    }],
  });
  assertEquals(out.notices.length, 1);
  assertEquals(out.notices[0].kind, NOTICE_MERGED_PLAN_REVALIDATED);
});

Deno.test("D8, 3e sortie — « refuser » se tait POUR CETTE VALIDATION-LÀ", () => {
  const dismissed: MergeSettingRow[] = [{
    memberId: "m-zoe",
    proposalsMuted: false,
    dismissedValidatedAt: "2026-08-13T10:00:00Z",
  }];
  const quiet = notices({
    members: [ZOE("2026-08-13T10:00:00Z")],
    settings: dismissed,
  });
  assertEquals(quiet.notices, []);
  assertEquals(quiet.skipped[0].reason, SKIP_DISMISSED);

  // ⚠️ ET LA QUESTION SE REPOSE À LA VALIDATION SUIVANTE. Sans cette moitié,
  // « refuser » serait D17 déguisé — un silence définitif que le maître n'a pas
  // choisi.
  const again = notices({
    members: [ZOE("2026-08-13T18:00:00Z", "plan-zoe-3")],
    settings: dismissed,
  });
  assertEquals(again.notices.length, 1);
  assertEquals(again.notices[0].planId, "plan-zoe-3");
});

Deno.test("D5 — « REFUSER » NE COUPE PAS L'AVERTISSEMENT DE D8 NON PLUS", () => {
  // ⚠️ MESURÉ EN HTTP LE 2026-08-12, ET C'EST LE MÊME DÉGÂT QUE L'ARBITRAGE
  // VOISIN INTERDIT. Le plan du foyer VIVANT porte la reprise d'un plan que Zoé
  // a remplacé depuis; le maître avait « refusé » cette validation-là. Résultat:
  // `notices: []`, `skipped: dismissed_by_owner` — sa propre ligne gardait une
  // reprise obsolète, et `unmerge` (la seule sortie qui la défait, et elle ne
  // coûte aucun quota) devenait hors d'atteinte jusqu'à ce que Zoé valide
  // ENCORE autre chose.
  //
  // Le décor est celui du mute, à un réglage près: c'est ce qui prouve que les
  // deux se lisent pareil.
  const out = notices({
    members: [ZOE("2026-08-15T08:00:00Z", "plan-zoe-2")],
    mergedFrom: [MERGED],
    settings: [{
      memberId: "m-zoe",
      proposalsMuted: false,
      // La date écartée est CELLE DU PLAN LE PLUS RÉCENT: le refus est donc
      // pleinement en vigueur, et il ne suffit toujours pas à taire la ligne du
      // maître.
      dismissedValidatedAt: "2026-08-15T08:00:00Z",
    }],
  });
  assertEquals(out.notices.length, 1);
  assertEquals(out.notices[0].kind, NOTICE_MERGED_PLAN_REVALIDATED);
  // LA SORTIE QUI COMPTE, ET C'EST TOUTE LA RAISON DU LOT: la défusion reste
  // atteignable.
  assert(
    out.notices[0].exits.includes(EXIT_UNMERGE),
    "l'avertissement survit mais n'offre plus de défaire la reprise: le maître " +
      "voit le dégât sans pouvoir le réparer.",
  );
});

Deno.test("un plan qui ne partage aucun jour ne se propose pas, et le dit", () => {
  const out = buildMergeNotices({
    members: [{
      ...ZOE("2026-08-13T10:00:00Z"),
      ownPlans: [{
        id: "plan-far",
        startsOn: "2026-09-01",
        durationDays: 5,
        validatedAt: "2026-08-13T10:00:00Z",
      }],
    }],
    householdPlans: [carrying(HOUSE_PLAN)],
    settings: [],
    today: "2026-08-14",
    quota: QUOTA_ROOM,
  });
  assertEquals(out.notices, []);
  assertEquals(out.skipped[0].reason, "merge_windows_disjoint");
});

Deno.test("SANS PLAN DU FOYER, on ne propose rien — on n'invente pas de fenêtre", () => {
  const out = buildMergeNotices({
    members: [ZOE("2026-08-13T10:00:00Z")],
    householdPlans: [],
    settings: [],
    today: "2026-08-14",
    quota: QUOTA_ROOM,
  });
  assertEquals(out.notices, []);
  assertEquals(out.skipped[0].reason, "merge_windows_disjoint");
});

Deno.test("D8 avertit MÊME quand plus rien n'est fusionnable", () => {
  // Le plan neuf de Zoé est entièrement dans le passé du foyer: il n'y a rien à
  // refusionner. Le maître doit quand même savoir que sa ligne vivante porte la
  // reprise d'un plan remplacé — sinon la défusion n'a aucun point d'entrée.
  const out = buildMergeNotices({
    members: [{
      ...ZOE("2026-08-15T08:00:00Z"),
      ownPlans: [{
        id: "plan-old",
        startsOn: "2026-08-01",
        durationDays: 3,
        validatedAt: "2026-08-15T08:00:00Z",
      }],
    }],
    householdPlans: [carrying(HOUSE_PLAN, MERGED)],
    settings: [],
    today: "2026-08-14",
    quota: QUOTA_ROOM,
  });
  assertEquals(out.notices.length, 1);
  assertEquals(out.notices[0].mergeable, null);
  assertEquals(out.notices[0].mergeableRefusal, "merge_windows_disjoint");
  // Pas de bouton « refusionner » quand il n'y a rien à fusionner: ce serait
  // offrir une sortie qui refuse.
  assertEquals(out.notices[0].exits, [EXIT_UNMERGE, EXIT_DISMISS]);
});

// ===========================================================================
// 5. D8 — LA QUEUE D'UN PLAN, ET LA CONSIGNE DE DÉFUSION
// ===========================================================================

Deno.test("LA QUEUE D'UN PLAN EST SON INTERSECTION AVEC LUI-MÊME, coupée au pivot", () => {
  // ⚠️ CE TEST EST LA PREUVE QU'IL N'Y A QU'UNE ARITHMÉTIQUE. Si `resolveTailWindow`
  // était réécrite, elle divergerait ici le jour où le pivot change de règle.
  const plan = { startsOn: "2026-08-10", durationDays: 7 };
  const tail = resolveTailWindow({ plan, today: "2026-08-14" });
  const twin = resolveMergeWindow({ household: plan, personal: plan, today: "2026-08-14" });
  assertEquals(JSON.stringify(tail), JSON.stringify(twin));
  assert(tail.ok);
  if (tail.ok) {
    assertEquals(tail.window.startsOn, "2026-08-14");
    assertEquals(tail.window.durationDays, 3);
    assertEquals(tail.daysAlreadyPast, 4);
  }
});

Deno.test("un plan entièrement passé n'a plus de queue, et le refus est nommé", () => {
  const tail = resolveTailWindow({
    plan: { startsOn: "2026-08-01", durationDays: 3 },
    today: "2026-08-14",
  });
  assertEquals(tail.ok, false);
  if (!tail.ok) assertEquals(tail.refusal, "merge_window_all_past");
});

Deno.test("LA CONSIGNE DE D8 EST DANS LE BLOC, MOT POUR MOT", () => {
  // « rester au plus près du plan de base, sans user X » — registre, D8. La
  // vérification porte sur la SORTIE de la fonction, jamais sur la source du
  // fichier: ce dépôt a déjà vu un `src.includes("…")` rester vert parce qu'un
  // commentaire citait la chaîne cherchée.
  const block = buildUnmergeBlock({
    displayName: "Zoe",
    window: { startsOn: "2026-08-14", durationDays: 3 },
    dishes: [
      { day: "thu", slot: "dinner", title: "Curry de pois chiches" },
      { day: "fri", slot: "lunch", title: "Salade de lentilles" },
    ],
    // C2 ④ — AUCUN TROU: l'identité, et c'est ce qui garde vraie l'assertion
    // d'octet de v7 juste à côté.
    gaps: [],
  });
  assert(block.includes(`${UNMERGE_CLOSENESS_INSTRUCTION}, without Zoe.`), block);
  assert(block.includes("2026-08-14"), block);
  assert(block.includes("2026-08-16"), block);
  // LA MATIÈRE DU PLAN DE BASE. Sans elle, « reste au plus près du plan de
  // base » désigne un plan que le modèle n'a jamais vu.
  assert(block.includes("- thu dinner: Curry de pois chiches"), block);
  assert(block.includes("- fri lunch: Salade de lentilles"), block);
  // ET LE POURQUOI N'Y EST PAS: « elle a validé son propre plan » est une
  // information sur ELLE, dans un texte lu à table par tout le foyer.
  assert(!/validat/i.test(block), block);
  assert(!/own plan/i.test(block), block);
});

Deno.test("sans matière, aucun en-tête de matière n'apparaît", () => {
  const block = buildUnmergeBlock({
    displayName: "Zoe",
    window: { startsOn: "2026-08-14", durationDays: 3 },
    dishes: [],
    gaps: [],
  });
  assert(!block.includes("The base plan over these days"), block);
  assert(block.includes(UNMERGE_CLOSENESS_INSTRUCTION), block);
});

// ===========================================================================
// 6. LES TESTS DE POSITION — CE QUE LA SOURCE DOIT DIRE
//
// En HTTP, un lecteur qui écrirait, ou un réglage qui bloquerait un geste, sont
// indiscernables d'un comportement correct tant qu'on ne tombe pas dessus. La
// source, elle, se lit.
// ===========================================================================

/** Le code SANS ses commentaires: les gros commentaires citent tous les noms. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function source(rel: string): Promise<string> {
  return stripComments(await Deno.readTextFile(new URL(rel, FUNCTIONS_DIR)));
}

Deno.test("D17 — LE RÉGLAGE NE PEUT PAS BLOQUER LA FUSION", async () => {
  // ⚠️ « Le réglage coupe la proposition, jamais la fusion » (D17). Un réglage
  // qui bloquerait le geste serait une punition, pas un filtre — et le maître
  // qui demande explicitement la fusion de quelqu'un qu'il a masqué a
  // évidemment le droit de l'obtenir.
  const generator = await source("generate-household-meal-v1/index.ts");
  assert(
    !generator.includes("household_merge_settings"),
    "le générateur lit la table des réglages: un réglage d'AFFICHAGE peut " +
      "désormais refuser un GESTE que le maître a explicitement demandé.",
  );
  assert(
    !generator.includes("loadMergeSettings"),
    "le générateur charge les réglages: même défaut, par une autre porte.",
  );
  // LE CAS QUI PASSE: le lecteur, lui, DOIT les lire — sans quoi le réglage
  // n'aurait aucun effet nulle part, et la garde ci-dessus serait verte sur un
  // produit où D17 n'existe pas.
  const reader = await source("household-merge-notices-v1/index.ts");
  assert(
    reader.includes("loadMergeSettings"),
    "le lecteur de propositions ne lit plus les réglages: D17 n'a plus aucun " +
      "effet, et ce test-ci garderait une porte qui ne s'ouvre sur rien.",
  );
});

Deno.test("LE LECTEUR DE PROPOSITIONS N'ÉCRIT RIEN, ET N'APPELLE AUCUN MODÈLE", async () => {
  const reader = await source("household-merge-notices-v1/index.ts");
  for (
    const forbidden of [
      "generateWithGemini",
      "write_student_meal_plan",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
    ]
  ) {
    assert(
      !reader.includes(forbidden),
      `le lecteur de propositions contient \`${forbidden}\`: ce n'est plus un ` +
        `lecteur, et rien dans son nom ne préviendra le prochain appelant.`,
    );
  }
});

Deno.test("LA PROPOSITION ET LA FUSION PARTAGENT LEUR ARITHMÉTIQUE", async () => {
  // ⚠️ LE DÉFAUT QUE CE TEST EMPÊCHE: deux calculs de fenêtre fusionnable. La
  // proposition annoncerait « je peux fusionner 3 jours » et la fusion en
  // prendrait 2 — les deux nombres étant plausibles, personne ne le verrait.
  const generator = await source("generate-household-meal-v1/index.ts");
  const pure = await Deno.readTextFile(
    new URL("_shared/keel/household_merge_notice.ts", FUNCTIONS_DIR),
  );
  assert(
    /const best = bestMergePair\(\{/.test(generator),
    "le générateur ne choisit plus sa paire par `bestMergePair`: la " +
      "proposition et la fusion peuvent de nouveau diverger.",
  );
  assert(
    stripComments(pure).includes("bestMergePair({"),
    "le lecteur de propositions ne passe plus par `bestMergePair`: même " +
      "divergence, de l'autre côté.",
  );
  // Et personne ne rouvre la boucle à la main.
  assert(
    !/resolveMergeWindow\(\{/.test(generator),
    "le générateur rappelle `resolveMergeWindow` directement: c'est la boucle " +
      "de sélection réécrite, et elle divergera de celle du lecteur.",
  );
});

Deno.test("LA DÉFUSION ET LA PROPOSITION VISENT LA MÊME LIGNE", async () => {
  // ⚠️ LA DIVERGENCE MESURÉE LE 2026-08-12, ET C'EST LA MÊME QUE CI-DESSUS, DE
  // L'AUTRE CÔTÉ. Deux plans du foyer sont vivants en même temps par contrat, et
  // les deux portent la même reprise. La défusion prenait le PREMIER de la liste
  // triée par `starts_on` croissant — donc le plus vieux — et rendait 409
  // `unmerge_window_all_past` pendant que le lecteur offrait `exits: ["unmerge",
  // …]`. Le maître n'avait alors aucun moyen de défaire la reprise sur son plan
  // courant. Les deux passent désormais par `mergeCarriers`.
  const generator = await source("generate-household-meal-v1/index.ts");
  const pure = await source("_shared/keel/household_merge_notice.ts");
  assert(
    generator.includes("mergeCarriers({"),
    "le générateur ne choisit plus son porteur par `mergeCarriers`: la " +
      "défusion et la proposition peuvent de nouveau désigner deux plans " +
      "différents, et l'une offrira un bouton que l'autre refuse.",
  );
  assert(
    pure.includes("mergeCarriers({"),
    "le lecteur de propositions ne passe plus par `mergeCarriers`: même " +
      "divergence, de l'autre côté.",
  );
  // Et personne ne rouvre le choix à la main, d'aucun des deux côtés.
  assert(
    !/resolveTailWindow\(\{/.test(generator),
    "le générateur rappelle `resolveTailWindow` directement: c'est la " +
      "sélection du porteur réécrite à côté de celle du lecteur.",
  );
  assert(
    !/readMergedFrom\(/.test(generator),
    "le générateur relit `merged_from` lui-même: c'est par cet aplatissage " +
      "que « la première entrée trouvée » — celle du plan le plus ancien — " +
      "revenait choisir à la place de `mergeCarriers`.",
  );
});

Deno.test("LA FUSION EST COLLANTE, ET C'EST BRANCHÉ", async () => {
  // ⚠️ LA CONDITION EST ÉPINGLÉE, PAS SEULEMENT LE NOM DE LA FONCTION. Une
  // mutation l'a prouvé nécessaire sur le constat de L4: laisser l'appel dans
  // la source tout en le débranchant garde vert un test qui ne cherche qu'un
  // nom.
  const src = await source("generate-household-meal-v1/index.ts");
  assert(
    /const standings = mergeStandings\(\{/.test(src),
    "le générateur ne relit plus `merged_from`: recomposer la même fenêtre " +
      "ré-exclut la personne que le maître venait de reprendre, et il perd sa " +
      "fusion sans l'avoir demandé.",
  );
  assert(
    /const stickyReclaimed = heldMemberIds\(standings\)\.filter\(/.test(src),
    "les bouches TENUES ne sont plus dérivées des standings: soit tout le " +
      "monde est re-repris, soit personne ne l'est.",
  );
  assert(
    /carryMergedFrom\(\{/.test(src),
    "les reprises antérieures ne sont plus reportées: la chaîne casse au " +
      "deuxième geste — fusionner Zoé effacerait la reprise de Tom.",
  );
  // La relecture et le report doivent précéder l'écriture, sinon ils décrivent
  // un plan qui est déjà en base.
  const readAt = src.indexOf("mergeStandings({");
  const writeAt = src.indexOf('"write_student_meal_plan"');
  assert(readAt >= 0 && writeAt >= 0, "marqueurs introuvables — test à réviser");
  assert(readAt < writeAt, "les reprises sont relues APRÈS l'écriture du plan.");
});

Deno.test("AUCUN REFUS DE DÉFUSION NE SE PAIE AU PRIX D'UNE GÉNÉRATION", async () => {
  // Même garde que pour la fusion (L4), même raison: en HTTP, un refus tardif
  // est indiscernable d'un refus précoce — il est juste, et c'est ce qui le
  // rend invisible.
  const src = await source("generate-household-meal-v1/index.ts");
  const model = src.indexOf("generateWithGemini(");
  assert(model >= 0, "appel modèle introuvable — test à réviser");
  for (
    const marker of [
      '"unmerge_member_required"',
      "resolveUnmergeRequest({",
      '"unmerge_member_not_merged"',
      '"unmerge_member_is_owner"',
    ]
  ) {
    const at = src.indexOf(marker);
    assert(at >= 0, `${marker} introuvable — test à réviser`);
    assert(
      at < model,
      `${marker} est APRÈS le premier appel modèle: le refus se paie désormais ` +
        `au prix d'une génération complète.`,
    );
  }
});

Deno.test("LA DÉFUSION N'ÉCRIT PAS PLUS QUE LA FUSION SUR LE COMPTE DU SECONDAIRE", async () => {
  // « Dans les trois cas, X garde son plan » (D8) — l'invariant du modèle. Il
  // est STRUCTUREL: la RPC ne touche que les lignes de `p_user_id`, qui est le
  // MAÎTRE. Le jour où quelqu'un y passe autre chose, ce test tombe.
  const src = await source("generate-household-meal-v1/index.ts");
  const at = src.indexOf('"write_student_meal_plan"');
  assert(at >= 0, "l'écriture est introuvable — test à réviser");
  assert(
    /p_user_id:\s*userId/.test(src.slice(at, at + 400)),
    "l'écriture ne se fait plus sur le compte du MAÎTRE: une défusion " +
      "écraserait le plan personnel qu'elle est censée laisser intact.",
  );
  assertEquals(
    (src.match(/"write_student_meal_plan"/g) ?? []).length,
    1,
    "il y a plus d'un site d'écriture de plan dans le générateur: les trois " +
      "opérations doivent passer par le même, sinon l'invariant se prouve " +
      "une fois sur deux.",
  );
});

// ===========================================================================
// 7. DEUX PLANS ADJACENTS — LE DÉFAUT TROUVÉ EN RELECTURE
//
// ⚠️ LA CONTRAINTE D'EXCLUSION N'INTERDIT QUE LE CHEVAUCHEMENT, PAS
// L'ADJACENCE: une bouche peut porter deux plans personnels vivants et validés.
// La première version de ce lecteur ne regardait que « le plus récemment
// validé » — donc, sur ce décor-ci, elle n'annonçait RIEN pendant que la fusion,
// elle, aurait parfaitement repris le plan de la semaine en cours. C'est
// exactement la divergence que ce lot existe pour fermer, écrite à l'envers.
// ===========================================================================

const TWO_PLANS: NoticeMember = {
  memberId: "m-zoe",
  userId: "u-zoe",
  displayName: "Zoe",
  isOwner: false,
  ownPlans: [
    // Celui de CETTE semaine — il croise le plan du foyer (10 → 16).
    {
      id: "plan-this-week",
      startsOn: "2026-08-12",
      durationDays: 5,
      validatedAt: "2026-08-12T09:00:00Z",
    },
    // Celui de la semaine PROCHAINE, validé PLUS TARD, et qui ne croise rien.
    {
      id: "plan-next-week",
      startsOn: "2026-08-17",
      durationDays: 7,
      validatedAt: "2026-08-14T09:00:00Z",
    },
  ],
};

Deno.test("LA PROPOSITION PORTE LE PLAN QUE LA FUSION PRENDRAIT", () => {
  const out = notices({ members: [TWO_PLANS] });
  assertEquals(out.notices.length, 1);
  const n = out.notices[0];
  assertEquals(
    n.planId,
    "plan-this-week",
    "la proposition annonce le plan le plus récemment VALIDÉ au lieu de celui " +
      "que la fusion reprendrait: elle promet une fenêtre que le geste ne " +
      "prendra pas — ou, ici, ne promet rien du tout",
  );
  // Les trois nombres, écrits à la main: le plan de cette semaine couvre 5
  // jours (12 → 16), dont 2 passés au 14, donc 3 restants.
  assertEquals(n.mergeable?.intersection.durationDays, 5);
  assertEquals(n.mergeable?.daysAlreadyPast, 2);
  assertEquals(n.mergeable?.window.durationDays, 3);
});

Deno.test("« REFUSER » PORTE SUR LA DERNIÈRE VALIDATION, PAS SUR CE PLAN-LÀ", () => {
  // ⚠️ LES DEUX DATES SONT DIFFÉRENTES ICI, et c'est le piège que L8 doit
  // éviter: renvoyer `plan.validated_at` à la RPC ferait refuser
  // `notice_moved_on` en boucle, sans que rien n'explique pourquoi.
  const n = notices({ members: [TWO_PLANS] }).notices[0];
  assertEquals(n.validatedAt, "2026-08-12T09:00:00Z");
  assertEquals(n.dismissValidatedAt, "2026-08-14T09:00:00Z");

  // Et c'est bien CETTE date qui fait taire la proposition.
  const quiet = notices({
    members: [TWO_PLANS],
    settings: [{
      memberId: "m-zoe",
      proposalsMuted: false,
      dismissedValidatedAt: "2026-08-14T09:00:00Z",
    }],
  });
  assertEquals(quiet.notices, []);
  assertEquals(quiet.skipped[0].reason, SKIP_DISMISSED);
});

// ===========================================================================
// 7bis. LE P0 — CE MÊME DÉCOR, MAIS **FUSIONNÉ**
//
// ⚠️ LE FIXTURE `TWO_PLANS` EXISTAIT DEPUIS L5 ET N'AVAIT JAMAIS ÉTÉ PASSÉ DANS
// `buildMergeNotices` AVEC UNE REPRISE. La garde de D8 n'a donc jamais été
// éprouvée sur le cas que son propre fichier documente trente lignes plus haut,
// et le défaut a vécu jusqu'à un run HTTP réel:
//
//   fusion du plan validé à 04:29:47,614 à 04:30:30. Zoé porte aussi un second
//   plan validé à 04:29:48,755 — plus récent, mais DISJOINT du plan du foyer,
//   donc jamais fusionnable. Lecture immédiate, personne n'ayant rien validé
//   entre-temps: `merged_plan_revalidated`, `held: []`. Puis un `compose` sur la
//   même fenêtre ré-excluait Zoé (`member_took_the_hand`), `servings` 3 → 2.
//   Le maître perdait la fusion qu'il venait de faire, ET recevait une alerte
//   fausse sur laquelle il allait cliquer « défusionner ».
// ===========================================================================

/** La reprise du plan de CETTE semaine — celle que la fusion a vraiment prise. */
const MERGED_THIS_WEEK: MergedFromEntry = {
  member_id: "m-zoe",
  user_id: "u-zoe",
  plan_id: "plan-this-week",
  plan_starts_on: "2026-08-12",
  plan_duration_days: 5,
  validated_at: "2026-08-12T09:00:00Z",
  days: ["2026-08-14", "2026-08-15", "2026-08-16"],
};

Deno.test("P0 — un SECOND plan adjacent, plus récent, ne défait pas la fusion", () => {
  const out = notices({ members: [TWO_PLANS], mergedFrom: [MERGED_THIS_WEEK] });

  // ① LA FUSION EST COLLANTE. Sans ça, la composition suivante ré-exclut Zoé.
  assertEquals(
    out.held,
    [HELD_ON_HOUSE_PLAN],
    "la fusion ne tient plus alors que Zoé n'a rien validé depuis: la " +
      "comparaison de D8 regarde « le plus récent de ses plans » au lieu du " +
      "plan qui a été fusionné",
  );

  // ② ET IL N'Y A AUCUNE ALERTE D8. Une alerte fausse est indiscernable d'une
  // vraie: le maître irait défusionner un plan que personne n'a remplacé.
  assertEquals(
    out.notices,
    [],
    "une alerte D8 est levée alors que le plan fusionné est intact",
  );
  assertEquals(out.skipped[0].reason, SKIP_ALREADY_MERGED);

  const [standing] = out.standings;
  assertEquals(standing.state, STANDING_HELD);
  assertEquals(standing.mergedPlanId, "plan-this-week");
  assertEquals(standing.mergedPlanStillLive, true);
  // La preuve que le piège est bien celui-là: le plan le plus récemment validé
  // N'EST PAS celui qu'on a fusionné, et c'est lui que l'ancien code lisait.
  assertEquals(standing.latestPlanId, "plan-next-week");
  assertEquals(standing.latestValidatedAt, "2026-08-14T09:00:00Z");
});

Deno.test("LE CAS QUI PASSE, DE L'AUTRE CÔTÉ: revalider CE plan-là avertit bien", () => {
  // ⚠️ SANS CE TEST, ON REMPLACERAIT UN FAUX POSITIF PAR UN FAUX NÉGATIF, et
  // « la fusion tient toujours » ressemblerait trait pour trait à une garde qui
  // marche. Même décor à deux plans; seule la validation du plan FUSIONNÉ bouge.
  const out = notices({
    members: [{
      ...TWO_PLANS,
      ownPlans: [
        {
          id: "plan-this-week",
          startsOn: "2026-08-12",
          durationDays: 5,
          validatedAt: "2026-08-14T18:00:00Z",
        },
        {
          id: "plan-next-week",
          startsOn: "2026-08-17",
          durationDays: 7,
          validatedAt: "2026-08-14T09:00:00Z",
        },
      ],
    }],
    mergedFrom: [MERGED_THIS_WEEK],
  });
  assertEquals(out.held, []);
  assertEquals(out.notices.length, 1);
  assertEquals(out.notices[0].kind, NOTICE_MERGED_PLAN_REVALIDATED);
  assertEquals(out.notices[0].merged?.planId, "plan-this-week");
  assertEquals(out.standings[0].state, STANDING_REVALIDATED);
});

// ===========================================================================
// 8. DEUX PLANS DU FOYER VIVANTS — LA MÊME RACINE, TROIS FOIS
//
// ⚠️ DEUX PLANS DU FOYER SONT VIVANTS EN MÊME TEMPS PAR CONTRAT: le courant et
// le suivant, ce que `prepare_next` produit, et rien ne retire un plan passé.
// Les deux portent la même reprise, parce que le report la recopie. Trois
// endroits prenaient « le premier de la liste » — donc le PLUS ANCIEN,
// `loadLiveHouseholdPlans` triant `starts_on` croissant.
// ===========================================================================

/** Le plan périmé: 08-05 → 08-08, entièrement derrière nous au 14. */
const STALE_HOUSE_PLAN = {
  id: "plan-house-stale",
  startsOn: "2026-08-05",
  durationDays: 4,
};

/** La reprise telle que le plan PÉRIMÉ la porte: une date d'un autre geste. */
const MERGED_STALE: MergedFromEntry = {
  ...MERGED_THIS_WEEK,
  plan_id: "plan-this-week",
  validated_at: "2026-08-05T10:00:00Z",
};

const TWO_HOUSE_PLANS: MergeCarrierPlan[] = [
  // ⚠️ L'ORDRE EST CELUI DE LA BASE: `starts_on` CROISSANT. Le périmé D'ABORD,
  // parce que c'est exactement ce que `.find()` et `[0]` prenaient.
  carrying(STALE_HOUSE_PLAN, MERGED_STALE),
  carrying(HOUSE_PLAN, MERGED_THIS_WEEK),
];

Deno.test("LE PORTEUR EST LE PLAN QU'ON MANGE, PAS LE PLUS ANCIEN", () => {
  const carrier = mergeCarriers({
    householdPlans: TWO_HOUSE_PLANS,
    today: "2026-08-14",
  }).get("m-zoe");
  assertEquals(
    carrier?.plan.id,
    "plan-house-1",
    "le porteur choisi est le plan du foyer PÉRIMÉ: la défusion recomposerait " +
      "une semaine déjà mangée et rendrait 409 `unmerge_window_all_past`, " +
      "pendant que la proposition offre le bouton",
  );
  assertEquals(carrier?.entry.validated_at, "2026-08-12T09:00:00Z");
  // La queue, écrite à la main: du jeudi 14 au dimanche 16, trois jours.
  assertEquals(carrier?.tail?.window.startsOn, "2026-08-14");
  assertEquals(carrier?.tail?.window.durationDays, 3);
  assertEquals(carrier?.tailRefusal, null);
});

Deno.test("un porteur ENTIÈREMENT PASSÉ n'a pas de queue, et le refus est nommé", () => {
  // Le cas qui PASSE de l'autre côté: quand il n'y a plus que le plan périmé, on
  // ne fabrique pas une queue — on nomme le refus que le geste rendrait.
  const carrier = mergeCarriers({
    householdPlans: [carrying(STALE_HOUSE_PLAN, MERGED_STALE)],
    today: "2026-08-14",
  }).get("m-zoe");
  assertEquals(carrier?.plan.id, "plan-house-stale");
  assertEquals(carrier?.tail, null);
  assertEquals(carrier?.tailRefusal, "merge_window_all_past");
});

Deno.test("entre deux plans VIVANTS, on garde celui d'aujourd'hui", () => {
  // Le courant (10 → 16) et le suivant (17 → 23), tous deux porteurs. Défusionner
  // aujourd'hui parle de la table d'aujourd'hui — pas de la semaine prochaine,
  // qui a pourtant la queue la plus LONGUE (7 jours contre 3).
  const next = { id: "plan-house-next", startsOn: "2026-08-17", durationDays: 7 };
  const carrier = mergeCarriers({
    householdPlans: [carrying(HOUSE_PLAN, MERGED_THIS_WEEK), carrying(next, MERGED_THIS_WEEK)],
    today: "2026-08-14",
  }).get("m-zoe");
  assertEquals(carrier?.plan.id, "plan-house-1");
  assertEquals(carrier?.tail?.window.durationDays, 3);
});

Deno.test("③ — LA DATE RENDUE AU MAÎTRE EST CELLE DU GESTE SUR SON PLAN COURANT", () => {
  // Mesuré: `merged.validated_at` valait 2026-08-05T10:00:00 — la date du plan
  // périmé — au lieu de celle du geste réel.
  const out = notices({
    members: [{
      ...TWO_PLANS,
      ownPlans: [{
        id: "plan-replacement",
        startsOn: "2026-08-12",
        durationDays: 5,
        validatedAt: "2026-08-14T12:00:00Z",
      }],
    }],
    householdPlans: TWO_HOUSE_PLANS,
  });
  assertEquals(out.notices.length, 1);
  const n = out.notices[0];
  assertEquals(n.kind, NOTICE_MERGED_PLAN_REVALIDATED);
  assertEquals(
    n.merged?.validatedAt,
    "2026-08-12T09:00:00Z",
    "la proposition rend la `validated_at` archivée sur le plan du foyer " +
      "PÉRIMÉ, donc une date qui ne correspond à aucun geste récent",
  );
  // ② — ET ELLE NOMME LA LIGNE QUE LE GESTE VISERA, avec ce qu'il en refera.
  assertEquals(n.merged?.householdPlanId, "plan-house-1");
  assertEquals(n.merged?.unmergeWindow, { startsOn: "2026-08-14", durationDays: 3 });
  assertEquals(n.exits, [EXIT_UNMERGE, EXIT_MERGE, EXIT_DISMISS]);
});

Deno.test("② — PAS DE BOUTON « DÉFUSIONNER » QUAND LE GESTE REFUSERAIT", () => {
  // Le seul plan porteur est entièrement derrière nous: `resolveTailWindow` rend
  // `merge_window_all_past`, donc le geste rendrait 409. Offrir la sortie quand
  // même, c'est offrir un bouton qui refuse — la divergence exacte que ce lot
  // ferme.
  const out = notices({
    members: [{
      ...TWO_PLANS,
      ownPlans: [{
        id: "plan-replacement",
        startsOn: "2026-08-12",
        durationDays: 5,
        validatedAt: "2026-08-14T12:00:00Z",
      }],
    }],
    // Le plan COURANT est là et reste fusionnable — il ne porte simplement pas
    // la reprise. C'est ce qui ISOLE la sortie testée: si `unmerge` tombait pour
    // une autre raison que sa queue vide, `merge` tomberait avec.
    householdPlans: [carrying(STALE_HOUSE_PLAN, MERGED_STALE), carrying(HOUSE_PLAN)],
  });
  assertEquals(out.notices.length, 1);
  assertEquals(out.notices[0].kind, NOTICE_MERGED_PLAN_REVALIDATED);
  assertEquals(out.notices[0].merged?.householdPlanId, "plan-house-stale");
  assertEquals(out.notices[0].merged?.unmergeWindow, null);
  assertEquals(out.notices[0].exits, [EXIT_MERGE, EXIT_DISMISS]);
});

Deno.test("④ — `held` ANNONCE LA FENÊTRE SUR LAQUELLE LA REPRISE COLLE", () => {
  // ⚠️ LE LECTEUR ET LE GÉNÉRATEUR NE PARLAIENT PAS DU MÊME ENSEMBLE. Le
  // générateur ne relit `merged_from` que sur les plans qui MORDENT sur la
  // fenêtre qu'il recompose; `held` était calculé sur TOUS les plans vivants et
  // annoncé comme « ce que la prochaine composition re-reprendra d'office ».
  // C'était faux pour toute composition qui ne recouvre pas le plan porteur.
  const out = notices({
    members: [TWO_PLANS],
    mergedFrom: [MERGED_THIS_WEEK],
    householdPlans: [carrying(STALE_HOUSE_PLAN), carrying(HOUSE_PLAN, MERGED_THIS_WEEK)],
  });
  assertEquals(out.held.length, 1);
  assertEquals(out.held[0].memberId, "m-zoe");
  assertEquals(out.held[0].planId, "plan-house-1");
  // Écrite à la main: lundi 10, sept jours. Hors d'elle, rien n'est re-repris.
  assertEquals(out.held[0].window, { startsOn: "2026-08-10", durationDays: 7 });
});

// ===========================================================================
// 7. L7/D11 — LE PLAFOND, VU DU LECTEUR DE PROPOSITIONS
//
// « Proposer un bouton qui rendra `merge_quota_exhausted` est une promesse
// qu'on ne tient pas » — le point d'accroche que L5 avait laissé, en toutes
// lettres, dans « ce qui reste ouvert » n° 5.
//
// ⚠️ AUCUN NOMBRE N'EST CALCULÉ ICI. `QUOTA_FULL` et `QUOTA_ROOM` sont écrits à
// la main; le lecteur ne connaît ni `N` ni le `+ 3`, il ne relit qu'un verdict.
// ===========================================================================

Deno.test("D11 — la semaine PLEINE ne propose plus, et le DIT", () => {
  const out = notices({
    members: [OWNER, ZOE("2026-08-13T10:00:00Z")],
    quota: QUOTA_FULL,
  });
  // Le décor est EXACTEMENT celui de « D10 — LE CAS QUI PASSE », qui rend une
  // proposition chiffrée. Seul le plafond change.
  assertEquals(out.notices, []);
  assertEquals(
    out.skipped.find((s) => s.memberId === "m-zoe")?.reason,
    SKIP_QUOTA_EXHAUSTED,
  );
  // JAMAIS UN SILENCE: sans cette ligne, « pourquoi Zoé n'apparaît-elle
  // plus ? » n'a de réponse que dans une base de production.
  assertEquals(out.skipped.find((s) => s.memberId === "m-zoe")?.displayName, "Zoe");
});

Deno.test("D11 — L'AVERTISSEMENT DE D8 SURVIT AU PLAFOND, sans son bouton", () => {
  // ⚠️ MÊME PARTAGE QUE D17, ET POUR LA MÊME RAISON. Un avertissement parle du
  // plan du MAÎTRE: sa ligne vivante porte la reprise d'un plan que
  // l'intéressée a remplacé. Le taire rendrait ce plan périmé invisible ET
  // indéfaisable — alors que la défusion, elle, ne coûte aucun quota.
  const out = notices({
    members: [ZOE("2026-08-15T08:00:00Z", "plan-zoe-2")],
    mergedFrom: [MERGED],
    quota: QUOTA_FULL,
  });
  assertEquals(out.notices.length, 1);
  assertEquals(out.notices[0].kind, NOTICE_MERGED_PLAN_REVALIDATED);
  // Les trois sorties de D8 étaient [unmerge, merge, dismiss]. Le plafond ne
  // retire QUE `merge`.
  assertEquals(out.notices[0].exits, [EXIT_UNMERGE, EXIT_DISMISS]);
  // Et la fenêtre fusionnable reste ANNONCÉE: elle décrit ce qu'une fusion
  // ferait, lundi prochain. La retirer effacerait la phrase de D16 en même
  // temps que le bouton.
  assertEquals(out.notices[0].mergeable?.window.durationDays, 3);
});

Deno.test("D11 — de la place ⇒ le bouton revient, à l'identique", () => {
  // LE CAS QUI PASSE, et il est décisif: sans lui, un plafond cassé qui
  // refuserait TOUT ressemblerait trait pour trait à un plafond qui marche.
  const out = notices({
    members: [ZOE("2026-08-15T08:00:00Z", "plan-zoe-2")],
    mergedFrom: [MERGED],
    quota: QUOTA_ROOM,
  });
  assertEquals(out.notices[0].exits, [EXIT_UNMERGE, EXIT_MERGE, EXIT_DISMISS]);
  const fresh = notices({ members: [ZOE("2026-08-13T10:00:00Z")], quota: QUOTA_ROOM });
  assertEquals(fresh.notices.length, 1);
  assertEquals(fresh.notices[0].exits, [EXIT_MERGE, EXIT_DISMISS]);
});

Deno.test("D11 — un plafond ILLISIBLE propose quand même", () => {
  // FAIL-OPEN, comme le réglage de D17: se tromper dans l'autre sens masquerait
  // en silence des propositions valides, et rien ne le dirait au maître. Le
  // serveur, lui, refusera de toute façon si la semaine est vraiment pleine —
  // la garde est dans le prédicat de la réclamation, pas ici.
  const out = notices({ members: [ZOE("2026-08-13T10:00:00Z")], quota: null });
  assertEquals(out.notices.length, 1);
  assertEquals(out.notices[0].exits, [EXIT_MERGE, EXIT_DISMISS]);
});

Deno.test("D11 — le motif le PLUS PRÉCIS gagne sur le plafond", () => {
  // Rien à fusionner ET semaine pleine: dire « plafond » ferait attendre lundi
  // pour un plan qui ne fusionnera jamais, et le maître réparerait la mauvaise
  // chose.
  const out = buildMergeNotices({
    members: [{
      ...ZOE("2026-08-13T10:00:00Z"),
      ownPlans: [{
        id: "plan-far",
        startsOn: "2026-09-01",
        durationDays: 5,
        validatedAt: "2026-08-13T10:00:00Z",
      }],
    }],
    householdPlans: [carrying(HOUSE_PLAN)],
    settings: [],
    today: "2026-08-14",
    quota: QUOTA_FULL,
  });
  assertEquals(out.skipped[0].reason, "merge_windows_disjoint");
});

Deno.test("D11 — la reprise qui TIENT reste `already_merged`, pas le plafond", () => {
  // Elle est déjà à table: le plafond n'a rien à voir avec elle, et le lui
  // attribuer ferait croire qu'une fusion manque.
  const out = notices({
    members: [ZOE("2026-08-12T09:00:00+00:00")],
    mergedFrom: [MERGED],
    quota: QUOTA_FULL,
  });
  assertEquals(out.skipped[0].reason, SKIP_ALREADY_MERGED);
  assertEquals(out.held, [HELD_ON_HOUSE_PLAN]);
});
