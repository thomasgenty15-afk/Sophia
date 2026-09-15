/**
 * A8.2 — LE SORT D'UNE PART NON MANGÉE, ÉPROUVÉ.
 *
 * Ce que ces épreuves tiennent, et pourquoi chacune existe:
 *
 *   · le VOCABULAIRE ne peut pas diverger de la base — il est lu dans la
 *     migration, pas recopié dans une constante de test;
 *   · l'espace d'action du MEMBRE est fermé, borné par la fenêtre frigo et par
 *     le jour, et « jetée » y est TOUJOURS (sans elle on force à mentir);
 *   · ⛔ les cases du MAÎTRE sont les bouches SANS COMPTE, et rien d'autre;
 *   · D8.3: la ligne de la personne gagne — par AUTORITÉ, pas par date.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  boxOptionsFor,
  boxStillWaiting,
  isShareOutcome,
  resolveShareOutcomes,
  SHARE_OUTCOMES,
  type ShareOutcomeRow,
  whoDidNotEatOptions,
} from "./meal_share_outcome.ts";
import { MAX_FRIDGE_DAYS } from "./meal_generation.ts";

const MIGRATION = new URL(
  "../../../migrations/20260903172000_la_boite_du_membre_est_un_fait_par_bouche.sql",
  import.meta.url,
);

// ═══════════════════════════════════════════════════════════════════════════
// LE VOCABULAIRE — jumeau du CHECK, jamais recopié
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ le vocabulaire est CELUI DE LA BASE, lu dans la migration", async () => {
  // ⚠️ ON LIT LA MIGRATION, ON NE RECOPIE PAS. Une liste écrite ici serait un
  // test paramétré par sa propre constante: changer le module ET le test
  // laisserait la base derrière, et la divergence s'écrirait avant qu'on la
  // voie. Même discipline que `mealTicks.int.test.ts` sur les motifs de
  // décoche.
  const sql = await Deno.readTextFile(MIGRATION);
  const at = sql.indexOf("check (outcome in (");
  assert(at >= 0, "le CHECK du vocabulaire a disparu de la migration");
  const clause = sql.slice(at, sql.indexOf("))", at));
  const inBase = [...clause.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

  assertEquals(
    [...SHARE_OUTCOMES].sort(),
    inBase.sort(),
    "le front et la base ne nomment pas les mêmes sorts",
  );
  // ET LA PORTE PORTE LA MÊME LISTE. Le CHECK est la ceinture; le `if` de la
  // RPC est celui qui rend un motif nommé.
  const gate = sql.indexOf("p_outcome not in (");
  assert(gate >= 0, "le refus nommé a disparu de la porte");
  const gateClause = sql.slice(gate, sql.indexOf(")", gate + 20));
  assertEquals(
    [...gateClause.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort(),
    inBase.sort(),
    "la porte et le CHECK n'acceptent pas les mêmes sorts: l'un des deux " +
      "refuserait par une erreur SQL brute au lieu d'un motif nommé",
  );
});

Deno.test("un mot hors vocabulaire n'est pas un sort", () => {
  assert(isShareOutcome("frozen"));
  assert(isShareOutcome("discarded"));
  for (const bad of ["composted", "eaten", "", null, undefined, 3, "FROZEN"]) {
    assert(!isShareOutcome(bad), `« ${String(bad)} » est passé`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// L'ESPACE D'ACTION DU MEMBRE — sa boîte, et rien du plan
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LE CAS QUI PASSE — la boîte de mardi se garde, se congèle ou se jette", () => {
  const options = boxOptionsFor({
    dishDate: "2026-03-10",
    today: "2026-03-10",
    hasFreezer: true,
  });
  assertEquals(options, [
    { outcome: "shifted", day: "2026-03-11" },
    { outcome: "shifted", day: "2026-03-12" },
    { outcome: "shifted", day: "2026-03-13" },
    { outcome: "frozen", day: null },
    { outcome: "discarded", day: null },
  ]);
  assertEquals(
    options.filter((o) => o.outcome === "shifted").length,
    MAX_FRIDGE_DAYS,
    "la fenêtre frigo vient de `MAX_FRIDGE_DAYS`, jamais d'un nombre écrit ici",
  );
});

Deno.test("⛔ SANS CONGÉLATEUR DÉCLARÉ, ON NE PROPOSE PAS DE CONGELER", () => {
  // `hasFreezerDeclared` rend `false` pour « il n'en a pas » ET pour « on ne
  // lui a jamais demandé ». C'est la seule direction acceptable: proposer de
  // congeler à quelqu'un qui n'a pas de congélateur, c'est proposer de laisser
  // une part sur le plan de travail.
  //
  // MUTATION QUI DOIT ROUGIR: pousser `frozen` inconditionnellement.
  const options = boxOptionsFor({
    dishDate: "2026-03-10",
    today: "2026-03-10",
    hasFreezer: false,
  });
  assertEquals(options.filter((o) => o.outcome === "frozen"), []);
  assert(
    options.some((o) => o.outcome === "discarded"),
    "« jetée » doit rester: une liste sans fin malheureuse force à mentir, et " +
      "ne rien répondre n'écrit rien (D8.2) — on perdrait le fait",
  );
});

Deno.test("⛔ UN JOUR ÉCOULÉ NE SE PROPOSE PAS", () => {
  // On range la boîte d'hier ce matin: la fenêtre part du PLAT, mais proposer
  // « garde-la pour hier » serait une consigne pour le passé.
  const options = boxOptionsFor({
    dishDate: "2026-03-10",
    today: "2026-03-12",
    hasFreezer: false,
  });
  assertEquals(options, [
    { outcome: "shifted", day: "2026-03-12" },
    { outcome: "shifted", day: "2026-03-13" },
    { outcome: "discarded", day: null },
  ]);
});

Deno.test("hors fenêtre frigo, il ne reste que le congélateur et la poubelle", () => {
  const options = boxOptionsFor({
    dishDate: "2026-03-10",
    today: "2026-03-20",
    hasFreezer: true,
  });
  assertEquals(options, [
    { outcome: "frozen", day: null },
    { outcome: "discarded", day: null },
  ]);
  assert(
    options.length > 0,
    "l'espace n'est JAMAIS vide: une bande qui poserait une question sans " +
      "réponse possible est un cul-de-sac",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAPE « QUI N'A PAS MANGÉ ? » — l'interdit du lot
// ═══════════════════════════════════════════════════════════════════════════

const MOUTHS = [
  { memberId: "m-owner", firstName: "Maitre", userId: "u-owner" },
  { memberId: "m-spouse", firstName: "Conjoint", userId: "u-spouse" },
  { memberId: "m-kid", firstName: "Enfant", userId: null },
  { memberId: "m-baby", firstName: "Bebe", userId: null },
];

Deno.test("LE CAS QUI PASSE — le maître peut cocher les bouches SANS COMPTE", () => {
  const step = whoDidNotEatOptions({ isOwner: true, mouths: MOUTHS });
  assert(step.asked);
  assertEquals(step.choosable.map((m) => m.memberId), ["m-kid", "m-baby"]);
});

Deno.test("⛔ UNE BOUCHE AVEC UN COMPTE N'EST JAMAIS COCHABLE (R11)", () => {
  // ══════════════════════════════════════════════════════════════════════
  // Une bouche qui a un compte PARLE POUR ELLE-MÊME: elle reçoit sa bande du
  // soir depuis A8.0 et a ses cases depuis A8.1. La cocher serait le maître
  // déclarant à sa place — la surveillance que R11 et R12 ont retirée.
  //
  // La porte SQL le refuse déjà (`not_your_line`, prouvé dans
  // `meal_share_outcomes_rls_test.sql` cas 02). Cette liste est la garde
  // d'ÉCRAN, et les deux disent la même chose pour que le refus ne soit jamais
  // une surprise devant un utilisateur.
  //
  // MUTATION QUI DOIT ROUGIR: retirer le `m.userId === null` du filtre.
  // ══════════════════════════════════════════════════════════════════════
  const step = whoDidNotEatOptions({ isOwner: true, mouths: MOUTHS });
  for (const forbidden of ["m-owner", "m-spouse"]) {
    assert(
      !step.choosable.some((m) => m.memberId === forbidden),
      `${forbidden} a un compte et se retrouve cochable chez le maître`,
    );
  }
});

Deno.test("⛔ L'ÉTAPE NE SE POSE PAS À UN MEMBRE", () => {
  // Un profil réclamé n'a qu'une bouche à décrire — la sienne. Lui demander
  // « qui ? » lui offrirait une réponse qu'il n'a pas le droit de donner.
  const step = whoDidNotEatOptions({ isOwner: false, mouths: MOUTHS });
  assertEquals(step, { asked: false, choosable: [] });
});

Deno.test("un foyer SANS bouche sans compte pose l'étape avec zéro case", () => {
  // L'étape existe quand même: « moi » et « tout le foyer » restent deux
  // réponses différentes, et la seconde déclenche `shift_dish`. C'est
  // `[choisir…]` qui n'a rien à choisir, pas l'étape qui disparaît.
  const step = whoDidNotEatOptions({
    isOwner: true,
    mouths: MOUTHS.filter((m) => m.userId !== null),
  });
  assertEquals(step, { asked: true, choosable: [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// D8.3 — QUI A RAISON
// ═══════════════════════════════════════════════════════════════════════════

const MOUTH_OWNER = {
  "m-owner": "u-owner",
  "m-spouse": "u-spouse",
  "m-kid": null,
} as const;

/**
 * ⚠️ `generatedMealId` ET `dishIndex` SONT DANS LE SOCLE, ET ILS NE PEUVENT PAS
 * ÊTRE OPTIONNELS (défaut D6, 2026-09-03). La table porte UNE LIGNE PAR BOÎTE:
 * sans eux, la résolution regroupait sur la bouche seule et la boîte de mardi
 * effaçait celle de jeudi. Les cas qui parlent de DEUX boîtes passent un autre
 * `dishIndex` par `over`.
 */
function row(over: Partial<ShareOutcomeRow>): ShareOutcomeRow {
  return {
    generatedMealId: "11111111-2222-3333-4444-555555555555",
    dishIndex: 0,
    memberId: "m-spouse",
    declaredBy: "u-spouse",
    outcome: "frozen",
    shiftedToDay: null,
    answeredLocalDate: "2026-03-10",
    ...over,
  };
}

Deno.test("⛔ D8.3 — LA LIGNE DE LA PERSONNE GAGNE, ET PAS LA PLUS RÉCENTE", () => {
  // ══════════════════════════════════════════════════════════════════════
  // Trancher par date ferait gagner celui qui tape en DERNIER, c'est-à-dire
  // donnerait au maître le pouvoir d'écraser la déclaration d'un adulte en
  // rouvrant l'app le soir. Ce qui départage est l'AUTORITÉ.
  //
  // L'ordre du tableau est celui du maître EN PREMIER, puis inversé plus bas:
  // un test qui ne jouerait qu'un ordre resterait vert sur un « le dernier
  // gagne » déguisé.
  //
  // MUTATION QUI DOIT ROUGIR: trancher sur `answeredLocalDate`.
  // ══════════════════════════════════════════════════════════════════════
  const master = row({
    declaredBy: "u-owner",
    outcome: "discarded",
    answeredLocalDate: "2026-03-12", // PLUS RÉCENT
  });
  const self = row({
    declaredBy: "u-spouse",
    outcome: "frozen",
    answeredLocalDate: "2026-03-10", // plus ancien
  });

  for (const rows of [[master, self], [self, master]]) {
    const resolved = resolveShareOutcomes({ rows, mouthOwner: MOUTH_OWNER });
    assertEquals(resolved.length, 1);
    assertEquals(resolved[0].outcome, "frozen");
    assertEquals(resolved[0].authority, "self");
  }
});

Deno.test("sur une bouche SANS COMPTE, la ligne du maître fait autorité (D8.5)", () => {
  const resolved = resolveShareOutcomes({
    rows: [row({ memberId: "m-kid", declaredBy: "u-owner", outcome: "discarded" })],
    mouthOwner: MOUTH_OWNER,
  });
  assertEquals(resolved, [{
    generatedMealId: "11111111-2222-3333-4444-555555555555",
    dishIndex: 0,
    memberId: "m-kid",
    outcome: "discarded",
    shiftedToDay: null,
    authority: "owner",
  }]);
});

Deno.test("⛔ RIEN N'EST CORRIGÉ: la ligne du maître reste, on CHOISIT laquelle lire", () => {
  // La résolution ne renvoie AUCUN ordre d'écriture. Corriger la ligne du
  // maître est un interdit explicite du lot: une déclaration est un fait, et
  // un fait ne se réécrit pas parce qu'un autre le contredit.
  const rows = [
    row({ declaredBy: "u-owner", outcome: "discarded" }),
    row({ declaredBy: "u-spouse", outcome: "frozen" }),
  ];
  const before = JSON.stringify(rows);
  resolveShareOutcomes({ rows, mouthOwner: MOUTH_OWNER });
  assertEquals(JSON.stringify(rows), before, "les lignes d'entrée ont été mutées");
});

Deno.test("plusieurs bouches, un ordre STABLE, chacune sa résolution", () => {
  const resolved = resolveShareOutcomes({
    rows: [
      row({ memberId: "m-kid", declaredBy: "u-owner", outcome: "discarded" }),
      row({ memberId: "m-spouse", declaredBy: "u-owner", outcome: "discarded" }),
      row({ memberId: "m-spouse", declaredBy: "u-spouse", outcome: "frozen" }),
    ],
    mouthOwner: MOUTH_OWNER,
  });
  assertEquals(resolved.map((r) => [r.memberId, r.outcome, r.authority]), [
    ["m-kid", "discarded", "owner"],
    ["m-spouse", "frozen", "self"],
  ]);
});

Deno.test("une bouche inconnue du foyer ne devient pas `self` par accident", () => {
  // `mouthOwner` ne la connaît pas ⇒ `null` ⇒ l'autorité ne peut pas être
  // `self`. Deviner par `declaredBy === memberId` serait faux: un compte et
  // une bouche sont deux espaces d'identifiants différents.
  const resolved = resolveShareOutcomes({
    rows: [row({ memberId: "m-ghost", declaredBy: "m-ghost" })],
    mouthOwner: MOUTH_OWNER,
  });
  assertEquals(resolved[0].authority, "owner");
});

// ═══════════════════════════════════════════════════════════════════════════
// LA BOÎTE EST-ELLE ENCORE LÀ ?
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ « ENCORE AU FRIGO » A UNE FIN", () => {
  const base = {
    generatedMealId: "11111111-2222-3333-4444-555555555555",
    dishIndex: 0,
    memberId: "m-spouse",
    authority: "self" as const,
  };
  // Reportée à demain: elle attend.
  assert(boxStillWaiting(
    { ...base, outcome: "shifted", shiftedToDay: "2026-03-12" },
    "2026-03-11",
  ));
  // Reportée à aujourd'hui: elle attend encore, c'est aujourd'hui qu'on la mange.
  assert(boxStillWaiting(
    { ...base, outcome: "shifted", shiftedToDay: "2026-03-11" },
    "2026-03-11",
  ));
  // Reportée à un jour DÉPASSÉ: ce n'est plus une boîte, c'est une part perdue.
  // L'annoncer « encore au frigo » serait le mensonge exact que FF-057 existe
  // pour corriger — le plan qui annonce un plat que personne n'a.
  assert(!boxStillWaiting(
    { ...base, outcome: "shifted", shiftedToDay: "2026-03-10" },
    "2026-03-11",
  ));
  // Congelée: elle attend, sans date.
  assert(boxStillWaiting({ ...base, outcome: "frozen", shiftedToDay: null }, "2026-03-11"));
  // Jetée: non.
  assert(!boxStillWaiting({ ...base, outcome: "discarded", shiftedToDay: null }, "2026-03-11"));
  // `not_eaten` sans suite: on ne sait pas ce qu'elle est devenue, et « on ne
  // sait pas » n'est pas « elle t'attend ».
  assert(!boxStillWaiting({ ...base, outcome: "not_eaten", shiftedToDay: null }, "2026-03-11"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ D6 (2026-09-03) — DEUX BOÎTES D'UNE MÊME PERSONNE NE S'EFFONDRENT PAS
//
// LE DÉFAUT MESURÉ, ET IL ÉTAIT DE CONCEPTION. `ShareOutcomeRow` ne portait ni
// `generatedMealId` ni `dishIndex`, et `resolveShareOutcomes` regroupait sur
// `memberId` SEUL. La table, elle, porte UNE LIGNE PAR BOÎTE. Deux boîtes de la
// même personne — celle de mardi et celle de jeudi — se rencontraient donc sur
// la même clé, et la seconde lue effaçait la première EN SILENCE. La vue de la
// part ne pouvait structurellement pas les rendre côte à côte.
//
// MUTATION QUI DOIT ROUGIR: ramener la clé de regroupement à `row.memberId`.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ D6 — LE CAS QUI PASSE: deux boîtes de la MÊME personne restent DEUX", () => {
  const tuesday = row({ dishIndex: 3, outcome: "shifted", shiftedToDay: "2026-03-12" });
  const thursday = row({ dishIndex: 9, outcome: "frozen" });
  const resolved = resolveShareOutcomes({
    rows: [tuesday, thursday],
    mouthOwner: MOUTH_OWNER,
  });
  assertEquals(resolved.length, 2);
  assertEquals(resolved.map((r) => [r.dishIndex, r.outcome]), [
    [3, "shifted"],
    [9, "frozen"],
  ]);
});

Deno.test("⛔ D6 — deux PLANS différents ne se confondent pas non plus", () => {
  // Le plan courant et le plan suivant coexistent, et leurs plats portent les
  // mêmes positions. Sans `generatedMealId` dans la clé, la boîte du plat n° 0
  // du plan de la semaine prochaine effacerait celle de cette semaine — le
  // « 5 des 3 » que `meal_tick.ts` documente, sur une autre table.
  const thisWeek = row({ dishIndex: 0, outcome: "frozen" });
  const nextWeek = row({
    generatedMealId: "99999999-8888-7777-6666-555555555555",
    dishIndex: 0,
    outcome: "discarded",
  });
  const resolved = resolveShareOutcomes({
    rows: [thisWeek, nextWeek],
    mouthOwner: MOUTH_OWNER,
  });
  assertEquals(resolved.length, 2);
  assertEquals(resolved.map((r) => r.outcome), ["frozen", "discarded"]);
});

Deno.test("⛔ D6 — et l'arbitrage D8.3 continue de mordre BOÎTE PAR BOÎTE", () => {
  // La quatrième colonne de la clé (`declared_by`) est celle sur laquelle on
  // arbitre: elle sort du regroupement, les trois autres y restent. Ici la même
  // bouche a DEUX boîtes, et sur CHACUNE le maître a parlé aussi. Chaque boîte
  // doit rendre la ligne de la personne — pas une seule pour les deux.
  const rows = [
    row({ dishIndex: 3, declaredBy: "u-owner", outcome: "discarded" }),
    row({ dishIndex: 3, declaredBy: "u-spouse", outcome: "frozen" }),
    row({ dishIndex: 9, declaredBy: "u-owner", outcome: "discarded" }),
    row({
      dishIndex: 9,
      declaredBy: "u-spouse",
      outcome: "shifted",
      shiftedToDay: "2026-03-14",
    }),
  ];
  const resolved = resolveShareOutcomes({ rows, mouthOwner: MOUTH_OWNER });
  assertEquals(resolved.length, 2);
  assertEquals(resolved.map((r) => [r.dishIndex, r.outcome, r.authority]), [
    [3, "frozen", "self"],
    [9, "shifted", "self"],
  ]);
});
