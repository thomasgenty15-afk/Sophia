// ===========================================================================
// LA PRISE DE MAIN (D2/D7, lot L3) — ce que ces tests gardent
//
// Une exclusion trop LARGE est indiscernable d'une exclusion qui marche: dans
// les deux cas quelqu'un disparaît de la table, et le plan sort sans erreur.
// La moitié la plus importante de ce fichier est donc le CAS QUI PASSE — un
// secondaire sans plan validé DOIT rester composé dans le plan du foyer.
//
// L'autre moitié tient l'arbitrage du lot: le recouvrement est TOTAL. Un plan
// qui mord sur la fenêtre sans la couvrir ne retire personne, parce que
// l'exclusion partielle affame — elle retirerait quelqu'un du lundi au motif
// qu'il a un plan à partir de mercredi.
// ===========================================================================

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  HAND_REASON_COVERS,
  HAND_REASON_PARTIAL,
  HAND_REASON_RECLAIMED,
  type MemberOwnPlan,
  parseOwnPlans,
  planCoversWindow,
  plansOverlap,
  resolveHandOff,
} from "./household_hand.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

/** Lundi 2026-08-10 → dimanche 2026-08-16. */
const WEEK = { startsOn: "2026-08-10", durationDays: 7 };

function plan(over: Partial<MemberOwnPlan> = {}): MemberOwnPlan {
  return {
    id: "p-1",
    startsOn: "2026-08-10",
    durationDays: 7,
    validatedAt: "2026-08-09T10:00:00Z",
    ...over,
  };
}

function member(
  memberId: string,
  opts: { isOwner?: boolean; ownPlans?: MemberOwnPlan[] } = {},
) {
  return {
    memberId,
    isOwner: opts.isOwner ?? false,
    ownPlans: opts.ownPlans ?? [],
  };
}

// ---------------------------------------------------------------------------
// 1. LA LECTURE DE LA COLONNE
// ---------------------------------------------------------------------------

Deno.test("la colonne du roster se lit telle que la base la rend", () => {
  const parsed = parseOwnPlans([
    {
      id: "p-a",
      starts_on: "2026-08-12",
      duration_days: 5,
      validated_at: "2026-08-11T08:00:00Z",
    },
  ]);
  assertEquals(parsed, [
    {
      id: "p-a",
      startsOn: "2026-08-12",
      durationDays: 5,
      validatedAt: "2026-08-11T08:00:00Z",
    },
  ]);
});

Deno.test("UN PLAN NON VALIDÉ NE COMPTE PAS (D7)", () => {
  // « Qui n'a pas de plan VALIDÉ au moment où le maître compose est
  // automatiquement pris dans le plan du foyer. » Un brouillon qu'on n'a pas
  // relu ne retire personne du dîner de toute la maison. La requête du roster
  // le filtre déjà; cette ligne-ci est la ceinture, et elle est gratuite parce
  // que la date est dans la charge utile.
  assertEquals(
    parseOwnPlans([{ id: "p-a", starts_on: "2026-08-10", duration_days: 7 }]),
    [],
  );
  assertEquals(
    parseOwnPlans([
      { id: "p-a", starts_on: "2026-08-10", duration_days: 7, validated_at: null },
    ]),
    [],
  );
});

Deno.test("une entrée illisible tombe, et n'emporte pas les autres", () => {
  // Même tolérance que `parseAwayDays` (FF-002 §7): on écarte, on ne devine
  // jamais, et une entrée cassée ne fait pas tomber la déclaration entière.
  const parsed = parseOwnPlans([
    { id: "", starts_on: "2026-08-10", duration_days: 7, validated_at: "x" },
    { id: "p-b", starts_on: "10/08/2026", duration_days: 7, validated_at: "x" },
    { id: "p-c", starts_on: "2026-08-10", duration_days: 0, validated_at: "x" },
    "pas un objet",
    { id: "p-d", starts_on: "2026-08-10", duration_days: 7, validated_at: "x" },
  ]);
  assertEquals(parsed.map((p) => p.id), ["p-d"]);
  assertEquals(parseOwnPlans(null), []);
  assertEquals(parseOwnPlans({ id: "p" }), []);
});

// ---------------------------------------------------------------------------
// 2. LE RECOUVREMENT — L'ARBITRAGE DU LOT
// ---------------------------------------------------------------------------

Deno.test("LE RECOUVREMENT EST TOTAL, ET C'EST LA LIGNE QUI DÉCIDE", () => {
  // Les bornes sont inclusives des deux côtés: un plan lundi→dimanche recouvre
  // une fenêtre lundi→dimanche. Si cette égalité tombait, le cas NOMINAL — le
  // secondaire qui compose la même semaine que le maître — cesserait de prendre
  // la main, et la bascule du modèle serait inerte.
  assert(planCoversWindow(plan(), WEEK), "même fenêtre, jour pour jour");
  assert(
    planCoversWindow(plan({ startsOn: "2026-08-09", durationDays: 7 }), WEEK) ===
      false,
    "commence avant mais finit samedi: il manque le dimanche",
  );
  assert(
    planCoversWindow({ startsOn: "2026-08-03", durationDays: 7 }, {
      startsOn: "2026-08-05",
      durationDays: 3,
    }),
    "une fenêtre englobée est recouverte",
  );
  assert(
    !planCoversWindow(plan({ startsOn: "2026-08-12", durationDays: 5 }), WEEK),
    "mercredi→dimanche NE RECOUVRE PAS lundi→dimanche: son porteur n'a rien à " +
      "manger lundi et mardi, et c'est tout l'arbitrage",
  );
  assert(
    !planCoversWindow(plan({ startsOn: "2026-08-10", durationDays: 3 }), WEEK),
    "lundi→mercredi ne recouvre pas la semaine",
  );
});

Deno.test("le chevauchement est plus large que le recouvrement", () => {
  // Les deux prédicats doivent DIVERGER sur le cas partiel: s'ils rendaient la
  // même chose, l'arbitrage n'existerait pas.
  const partial = plan({ startsOn: "2026-08-12", durationDays: 5 });
  assert(plansOverlap(partial, WEEK));
  assert(!planCoversWindow(partial, WEEK));
  // Collé sans se toucher: la veille du départ, le lendemain de la fin.
  assert(!plansOverlap(plan({ startsOn: "2026-08-01", durationDays: 7 }), WEEK));
  assert(!plansOverlap(plan({ startsOn: "2026-08-17", durationDays: 7 }), WEEK));
  // Un seul jour commun suffit à chevaucher.
  assert(plansOverlap(plan({ startsOn: "2026-08-04", durationDays: 7 }), WEEK));
});

// ---------------------------------------------------------------------------
// 3. QUI LE FOYER COMPOSE
// ---------------------------------------------------------------------------

Deno.test("LE CAS QUI PASSE: sans plan validé, un secondaire reste composé", () => {
  // ⚠️ LE TEST LE PLUS IMPORTANT DU LOT. C'est la posture PAR DÉFAUT (D7): un
  // compte secondaire ne fait rien, et il est composé dans le plan du maître
  // comme une bouche ordinaire. Une exclusion trop large est indiscernable
  // d'une exclusion qui marche — sauf ici.
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true }),
      member("m-teen"),
      member("m-kid"),
    ],
    window: WEEK,
    reclaimed: [],
  });
  assertEquals(out.composed.map((m) => m.memberId), [
    "m-owner",
    "m-teen",
    "m-kid",
  ]);
  assertEquals(out.taken, []);
  assertEquals(out.partial, []);
});

Deno.test("un secondaire dont le plan recouvre la fenêtre sort de la table", () => {
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true }),
      member("m-teen", { ownPlans: [plan({ id: "p-teen" })] }),
    ],
    window: WEEK,
    reclaimed: [],
  });
  assertEquals(out.composed.map((m) => m.memberId), ["m-owner"]);
  assertEquals(out.taken, [{
    member_id: "m-teen",
    plan_id: "p-teen",
    starts_on: "2026-08-10",
    duration_days: 7,
    validated_at: "2026-08-09T10:00:00Z",
    reason: HAND_REASON_COVERS,
  }]);
});

Deno.test("UN PLAN PARTIEL NE RETIRE PERSONNE, ET IL EST TRACÉ", () => {
  // L'arbitrage, joué de bout en bout. Le porteur reste composé — sinon il n'a
  // rien à manger lundi et mardi — et sa trace dit que la question s'est posée:
  // sans elle, « plan partiel » et « pas de plan » laissent la même trace, et
  // L4 ne saurait pas qu'il y a une intersection à fusionner (D15).
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true }),
      member("m-teen", {
        ownPlans: [plan({ id: "p-teen", startsOn: "2026-08-12", durationDays: 5 })],
      }),
    ],
    window: WEEK,
    reclaimed: [],
  });
  assertEquals(out.composed.map((m) => m.memberId), ["m-owner", "m-teen"]);
  assertEquals(out.taken, []);
  assertEquals(out.partial.map((t) => [t.member_id, t.plan_id, t.reason]), [
    ["m-teen", "p-teen", HAND_REASON_PARTIAL],
  ]);
});

Deno.test("un plan qui ne touche pas la fenêtre ne laisse aucune trace", () => {
  // Ni exclusion, ni bruit. Une trace qui listerait tous les plans de tout le
  // monde cesserait d'être lue, et c'est là qu'on cherche pourquoi il manque
  // une assiette.
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true }),
      member("m-teen", { ownPlans: [plan({ startsOn: "2026-09-07" })] }),
    ],
    window: WEEK,
    reclaimed: [],
  });
  assertEquals(out.composed.length, 2);
  assertEquals(out.taken, []);
  assertEquals(out.partial, []);
});

Deno.test("LE MAÎTRE N'EST JAMAIS EXCLU, MÊME AVEC UN PLAN QUI RECOUVRE (D2)", () => {
  // « Le plan du maître EST le plan du foyer. » S'il porte par ailleurs un plan
  // personnel validé — un reliquat de la lane individuelle — l'exclure lui
  // ferait cuisiner un repas qu'il ne mange pas, pour une maison où il est la
  // première bouche.
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true, ownPlans: [plan({ id: "p-owner" })] }),
      member("m-teen"),
    ],
    window: WEEK,
    reclaimed: [],
  });
  assertEquals(out.composed.map((m) => m.memberId), ["m-owner", "m-teen"]);
  assertEquals(out.taken, [], "le maître ne figure dans aucune exclusion");
  assertEquals(out.partial, [], "ni dans la trace des plans partiels");
});

Deno.test("PLUS PERSONNE À COMPOSER: le module CONSTATE, il ne refuse pas", () => {
  // Le cas passant de la garde `all_members_have_own_plan` du générateur.
  // Structurellement inatteignable par l'HTTP tant que le maître est immunisé
  // et toujours dans son roster — il l'est ici parce que la garde doit être
  // JUSTE avant d'être atteignable, pas l'inverse.
  const out = resolveHandOff({
    members: [
      member("m-a", { ownPlans: [plan({ id: "p-a" })] }),
      member("m-b", { ownPlans: [plan({ id: "p-b" })] }),
    ],
    window: WEEK,
    reclaimed: [],
  });
  assertEquals(out.composed, []);
  assertEquals(out.taken.map((t) => t.member_id), ["m-a", "m-b"]);
});

Deno.test("l'ordre du roster est conservé", () => {
  // Le prompt nomme les bouches dans cet ordre, et le roster range le maître en
  // premier. Un tri qui s'inventerait ici ferait bouger la consigne sans
  // qu'aucune donnée n'ait changé.
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true }),
      member("m-b", { ownPlans: [plan({ id: "p-b" })] }),
      member("m-c"),
      member("m-d"),
    ],
    window: WEEK,
    reclaimed: [],
  });
  assertEquals(out.composed.map((m) => m.memberId), ["m-owner", "m-c", "m-d"]);
});

Deno.test("UNE FENÊTRE ILLISIBLE N'EXCLUT PERSONNE — l'échec est OUVERT", () => {
  // L'autre direction serait catastrophique: une date mal formée ferait sortir
  // tout le monde de la table, et le foyer cesserait de cuisiner sans qu'aucune
  // erreur ne remonte. Même arbitrage que `resolveWindowPresence`.
  for (
    const window of [
      { startsOn: "", durationDays: 7 },
      { startsOn: "10-08-2026", durationDays: 7 },
      { startsOn: "2026-08-10", durationDays: 0 },
      { startsOn: "2026-08-10", durationDays: Number.NaN },
    ]
  ) {
    const out = resolveHandOff({
      members: [member("m-teen", { ownPlans: [plan()] })],
      window,
      reclaimed: [],
    });
    assertEquals(
      out.composed.map((m) => m.memberId),
      ["m-teen"],
      `fenêtre ${JSON.stringify(window)}`,
    );
    assertEquals(out.taken, []);
  }
});

// ---------------------------------------------------------------------------
// 3 bis. L4/D6 — LA FUSION REPREND, ELLE NE CONTOURNE PAS
// ---------------------------------------------------------------------------

Deno.test("LE CAS QUI PASSE: sans reprise, rien ne bouge d'un octet", () => {
  // ⚠️ LA MOITIÉ QUI PROUVE QUE L4 N'A RIEN CASSÉ. Une liste de reprise vide
  // doit rendre EXACTEMENT le résultat d'avant le lot — sinon toute composition
  // ordinaire du produit a changé de comportement pour un geste que personne
  // n'a fait.
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true }),
      member("m-teen", { ownPlans: [plan({ id: "p-teen" })] }),
    ],
    window: WEEK,
    reclaimed: [],
  });
  assertEquals(out.composed.map((m) => m.memberId), ["m-owner"]);
  assertEquals(out.taken.map((t) => t.member_id), ["m-teen"]);
  assertEquals(out.reclaimed, []);
});

Deno.test("une bouche REPRISE revient à table, et sa trace le dit", () => {
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true }),
      member("m-teen", { ownPlans: [plan({ id: "p-teen" })] }),
    ],
    window: WEEK,
    reclaimed: ["m-teen"],
  });
  assertEquals(out.composed.map((m) => m.memberId), ["m-owner", "m-teen"]);
  assertEquals(
    out.taken,
    [],
    "une personne reprise ne peut pas être AUSSI exclue: deux affirmations " +
      "contradictoires sur la même ligne de plan",
  );
  assertEquals(out.reclaimed, [{
    member_id: "m-teen",
    plan_id: "p-teen",
    starts_on: "2026-08-10",
    duration_days: 7,
    validated_at: "2026-08-09T10:00:00Z",
    reason: HAND_REASON_RECLAIMED,
  }]);
});

Deno.test("REPRISE ET « JAMAIS RIEN VALIDÉ » NE LAISSENT PAS LA MÊME TRACE", () => {
  // ⚠️ LA RAISON D'ÊTRE DE `reclaimed`. Dans les deux cas la personne est
  // composée et absente de `taken`. Sans cette liste, L5 ne pourrait pas dire
  // de qui la fusion a repris le plan — ni à quelle date de validation le
  // comparer (D8).
  const never = resolveHandOff({
    members: [member("m-teen")],
    window: WEEK,
    reclaimed: ["m-teen"],
  });
  assertEquals(never.composed.length, 1);
  assertEquals(
    never.reclaimed,
    [],
    "on ne fabrique pas une provenance pour quelqu'un qui n'avait pas de plan",
  );

  const merged = resolveHandOff({
    members: [member("m-teen", { ownPlans: [plan({ id: "p-teen" })] })],
    window: WEEK,
    reclaimed: ["m-teen"],
  });
  assertEquals(merged.reclaimed.map((t) => t.plan_id), ["p-teen"]);
});

Deno.test("un plan PARTIEL repris est tracé lui aussi (D15)", () => {
  // Une fusion sur une intersection est le cas nominal de D15: le plan mord sur
  // la fenêtre sans la recouvrir. Il ne retirait personne, mais c'est bien LUI
  // qu'on fusionne — et la trace doit le nommer, sans quoi `merged_from`
  // porterait un plan que rien d'autre ne cite.
  const out = resolveHandOff({
    members: [
      member("m-teen", {
        ownPlans: [plan({ id: "p-teen", startsOn: "2026-08-12", durationDays: 5 })],
      }),
    ],
    window: WEEK,
    reclaimed: ["m-teen"],
  });
  assertEquals(out.composed.map((m) => m.memberId), ["m-teen"]);
  assertEquals(out.reclaimed.map((t) => t.plan_id), ["p-teen"]);
  assertEquals(
    out.partial,
    [],
    "un plan repris ne repart pas AUSSI dans `partial`: il n'est plus une " +
      "intersection à fusionner, il vient d'être fusionné",
  );
});

Deno.test("reprendre quelqu'un qui n'est pas là ne change rien", () => {
  // Un id inconnu du roster, ou celui du maître (qui n'est jamais exclu): les
  // deux doivent être des non-événements. Une reprise qui ferait apparaître une
  // bouche serait bien pire qu'une reprise qui ne fait rien.
  const out = resolveHandOff({
    members: [
      member("m-owner", { isOwner: true, ownPlans: [plan({ id: "p-owner" })] }),
      member("m-teen", { ownPlans: [plan({ id: "p-teen" })] }),
    ],
    window: WEEK,
    reclaimed: ["m-ghost", "m-owner"],
  });
  assertEquals(out.composed.map((m) => m.memberId), ["m-owner"]);
  assertEquals(out.taken.map((t) => t.member_id), ["m-teen"]);
  assertEquals(out.reclaimed, []);
});

// ---------------------------------------------------------------------------
// 4. LE FIL EST BRANCHÉ — sinon la règle est écrite et personne ne l'applique
// ---------------------------------------------------------------------------

/**
 * Le code SANS ses commentaires. Cicatrice du dépôt: « un audit d'appelants au
 * grep naïf compte des faux vivants » — et le gros commentaire qui explique la
 * prise de main cite tous les noms qu'on cherche.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function householdGeneratorSource(): Promise<string> {
  return stripComments(
    await Deno.readTextFile(
      new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
    ),
  );
}

Deno.test("le générateur du foyer applique la prise de main", async () => {
  const src = await householdGeneratorSource();
  assert(
    /resolveHandOff\(\{/.test(src),
    "generate-household-meal-v1 n'appelle plus resolveHandOff: un secondaire " +
      "qui a pris la main est recomposé dans le plan du foyer, il y reçoit une " +
      "assiette qu'il ne mangera pas, et rien ne le dit.",
  );
  assert(
    /own_plans/.test(src),
    "le générateur ne lit plus `own_plans` du roster: la prise de main n'a " +
      "plus de donnée, donc plus d'effet.",
  );
  assert(
    /["']all_members_have_own_plan["']/.test(src),
    "le refus nommé a disparu. Sans lui, un foyer où plus personne n'est à " +
      "composer part quand même chez le modèle, pour zéro bouche.",
  );
});

Deno.test("L'EXCLUSION EST EN AMONT DU PROMPT, PAS SEULEMENT DES PORTIONS", async () => {
  // ⚠️ LA POSITION NE SE PROUVE QUE PAR LA SOURCE. Un filtre posé à la
  // réconciliation refuse tout aussi correctement les portions — en HTTP c'est
  // indiscernable — mais le prompt continue de nommer l'id, le modèle continue
  // de rendre sa portion, et la casserole reste dimensionnée pour lui. C'est le
  // défaut mesuré par L2 le 2026-08-12, transposé.
  const src = await householdGeneratorSource();
  const hand = src.indexOf("resolveHandOff({");
  const presence = src.indexOf("resolveWindowPresence({");
  const prompt = src.indexOf("buildMealPrompt({");
  const model = src.indexOf("generateWithGemini(");
  assert(hand >= 0 && presence >= 0 && prompt >= 0 && model >= 0, "test à réviser");
  assert(
    hand < presence,
    "la prise de main est résolue APRÈS la présence: `servings` compterait " +
      "encore les bouches qui mangent leur propre plan.",
  );
  assert(hand < prompt, "la prise de main est résolue après la consigne");
  assert(
    hand < model,
    "la prise de main est résolue après le premier appel modèle: le refus " +
      "`all_members_have_own_plan` se paierait au prix d'une génération.",
  );
});

Deno.test("LA PRÉSENCE ET LES PARTS SUIVENT LA LISTE EXCLUE", async () => {
  // Deux filtres qui s'ignorent finissent par diverger. Celui-ci vérifie qu'ils
  // sont EN CASCADE: la présence est calculée sur les bouches composées, et les
  // assiettes se retirent de cette même liste. Passer `members` à l'un des deux
  // rendrait une casserole dimensionnée pour quelqu'un qui mange ailleurs.
  const src = await householdGeneratorSource();
  assert(
    /resolveWindowPresence\(\{\s*members:\s*composedMembers\.map/.test(src),
    "resolveWindowPresence ne reçoit plus `composedMembers`: `servings` et le " +
      "bloc de présence compteraient les bouches qui mangent leur propre plan. " +
      "(Si la forme de l'appel a changé, ce test est à réviser — pas à " +
      "supprimer.)",
  );
  assert(
    /const platedMembers = [\s\S]{0,200}composedMembers\.filter/.test(src),
    "`platedMembers` ne dérive plus de `composedMembers`: le filtre d'absence " +
      "totale et celui de la prise de main se croiseraient au lieu de se " +
      "composer, et l'un des deux gagnerait en silence.",
  );
  assert(
    /resolveHousehold\(\{\s*members:\s*composedMembers\.map/.test(src),
    "la résolution FF-043 ne reçoit plus `composedMembers`: la direction de " +
      "service du tronc commun serait tirée par quelqu'un qui n'est pas à cette " +
      "table.",
  );
});

Deno.test("la trace du plan nomme qui a été retiré, et par quelle règle", async () => {
  const src = await householdGeneratorSource();
  // ⚠️ LES TROIS CLÉS SONT EXIGÉES SÉPARÉMENT, et la troisième est arrivée avec
  // L4. La forme d'origine était UNE expression régulière sur le bloc entier;
  // elle est tombée au premier commentaire glissé entre deux clés — un test qui
  // casse quand rien de vrai n'a changé finit neutralisé. Ce qui compte est que
  // les trois faits soient ÉCRITS, pas leur mise en page.
  const hand = src.indexOf("hand: {");
  assert(hand >= 0, "`generated_from.household.hand` n'est plus écrit du tout.");
  const block = src.slice(hand, hand + 1600);
  for (
    const [key, why] of [
      ["taken: handOff.taken", "qui a été retiré de la table"],
      ["partial: handOff.partial", "qui porte un plan qui mord sans recouvrir"],
      [
        "reclaimed: handOff.reclaimed",
        "qui a été REPRIS par une fusion — sans cette clé, une personne " +
        "fusionnée et une personne qui n'a jamais rien validé laissent la même " +
        "trace (L4/D6)",
      ],
    ] as const
  ) {
    assert(
      block.includes(key),
      `\`generated_from.household.hand\` n'écrit plus \`${key}\`: ${why}.`,
    );
  }
});

Deno.test("PERSONNE D'AUTRE NE REDÉFINIT « a pris la main »", async () => {
  // Le piège de ce lot. La règle a DEUX moitiés — le périmètre (SQL, dans
  // `keel_household_roster_for`) et le recouvrement (ici) — et chacune vit à un
  // seul endroit. Un second lecteur qui refiltrerait `plan_kind = 'personal'`
  // pour décider qui compose serait la divergence de demain.
  const offenders: string[] = [];
  async function walk(dir: URL, prefix: string): Promise<void> {
    for await (const e of Deno.readDir(dir)) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const child = new URL(`${e.name}${e.isDirectory ? "/" : ""}`, dir);
      if (e.isDirectory) {
        await walk(child, `${prefix}${e.name}/`);
        continue;
      }
      if (!e.name.endsWith(".ts")) continue;
      const name = `${prefix}${e.name}`;
      if (name === "_shared/keel/household_hand.ts") continue;
      if (name === "_shared/keel/household_hand_test.ts") continue;
      const src = stripComments(await Deno.readTextFile(child));
      if (/personal_plan_covers_window|planCoversWindow\s*\(/.test(src)) {
        offenders.push(name);
      }
    }
  }
  await walk(FUNCTIONS_DIR, "");
  assertEquals(
    offenders,
    [],
    "ces fichiers rejouent le recouvrement de fenêtre à la main. « A pris la " +
      "main » a UNE définition (household_hand.ts); la réécrire ailleurs est " +
      "la divergence qu'on ne verra qu'une fois quelqu'un affamé.",
  );
});
