// ===========================================================================
// L4 — LE MOTEUR DE FUSION (D6 · D15 · D16)
//
// Ce fichier tient les TROIS décisions du lot, et rien d'autre: sur quels
// jours, quelle forme de cuisine, et ce qu'on en archive.
//
// ⚠️ CHAQUE REFUS A UN CAS QUI PASSE. « Une garde a besoin d'un cas qui
// passe »: cassée, elle refuse tout et ressemble trait pour trait à une garde
// qui marche. Les cas passants sont donc écrits EN PREMIER dans chaque
// section, pas ajoutés à la fin.
// ===========================================================================

import { assert, assertEquals } from "jsr:@std/assert@1";

// Le banc de propriété de D1 balaie des décalages de jours: `addDays` est la
// MÊME arithmétique que le module sous test, pas une seconde.
import { addDays } from "./meal_plan_window.ts";

import {
  buildMergeBlock,
  MERGE_ANCHOR_INSTRUCTION,
  dayCountInclusive,
  LADDER_REASON_NO_COOKING_DAY,
  LADDER_REASON_ONE_DISH,
  LADDER_REASON_ONE_SESSION,
  MERGE_MATERIAL_CAP,
  MERGE_WINDOW_ALL_PAST,
  MERGE_WINDOW_UNREADABLE,
  MERGE_WINDOWS_DISJOINT,
  mergedFromEntry,
  mergeLadder,
  mergeWindowWritable,
  resolveMergeWindow,
  resolveTailWindow,
  servingConflicts,
} from "./household_merge.ts";
import {
  buildPortionBrief,
  MEMBER_GOALS,
  NEUTRAL_DIRECTION,
  type PortionMember,
  readServingDemands,
  SERVING_AXES,
  SERVING_DIRECTION,
  type ServingAxisDemands,
  servingDemandsFor,
  servingDirectionFor,
} from "./household_portions.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function memberOf(over: Partial<PortionMember> = {}): PortionMember {
  return {
    memberId: "m-x",
    displayName: "Marc",
    goal: null,
    ageState: "adult",
    body: null,
    ...over,
  };
}

function demandsOf(goal: PortionMember["goal"]): ServingAxisDemands {
  return servingDemandsFor(memberOf({ goal }));
}

// ---------------------------------------------------------------------------
// 1. LA LECTURE DES DIRECTIONS — le critère d'abandon est VÉRIFIABLE
// ---------------------------------------------------------------------------

Deno.test("les SIX directions se lisent entièrement, aucune n'est illisible", () => {
  // ⚠️ LE TEST QUI TIENT TOUT LE RESTE. Le critère de D6 est « vérifiable, pas
  // un jugement de goût », et il ne l'est que si les six chaînes se lisent. Une
  // direction reformulée hors du vocabulaire fermé rendrait `unreadable` — la
  // fusion descendrait alors d'un barreau pour tout le monde, en silence et
  // pour une raison qui n'a rien à voir avec l'assiette. Ce test tombe AVANT.
  for (const goal of MEMBER_GOALS) {
    const demands = readServingDemands(SERVING_DIRECTION[goal]);
    for (const axis of SERVING_AXES) {
      assert(
        demands[axis] !== "unreadable",
        `${goal}: l'axe « ${axis} » est nommé par « ${SERVING_DIRECTION[goal]} » ` +
          `sans qu'on sache combien. Reformule la direction dans le vocabulaire ` +
          `fermé de household_portions.ts, ou étends ce vocabulaire.`,
      );
    }
  }
  for (const axis of SERVING_AXES) {
    assertEquals(
      readServingDemands(NEUTRAL_DIRECTION)[axis],
      "balanced",
      "« balanced share of every component » gouverne les trois axes d'un coup",
    );
  }
});

Deno.test("chaque direction demande CE QU'ELLE DIT, mot pour mot", () => {
  // Le tableau ci-dessous n'est PAS une seconde source: c'est la relecture à la
  // main de la même phrase, et il ne peut pas dériver sans que la phrase
  // change. Il attrape ce que le test précédent ne voit pas — une lecture qui
  // aboutit mais sur le mauvais axe.
  assertEquals(demandsOf("fat_loss"), {
    protein: "full",
    starch: "smaller",
    vegetables: "larger", // « generous vegetables »
  });
  assertEquals(demandsOf("muscle_gain"), {
    protein: "larger",
    starch: "larger", // « larger protein AND starch share »
    vegetables: "balanced", // « same vegetables »
  });
  assertEquals(demandsOf("recomposition"), {
    protein: "full",
    starch: "moderate",
    vegetables: "larger",
  });
  assertEquals(demandsOf("performance"), {
    protein: "full",
    starch: "larger",
    // NON NOMMÉ = aucune demande. `performance` ne parle pas de légumes, donc
    // n'importe quelle part lui convient — et c'est DIFFÉRENT de « équilibré ».
    vegetables: null,
  });
  assertEquals(demandsOf("health"), {
    protein: "balanced",
    starch: "balanced",
    vegetables: "larger",
  });
  assertEquals(demandsOf("maintenance"), {
    protein: "balanced",
    starch: "balanced",
    vegetables: "balanced",
  });
});

Deno.test("un MINEUR ne demande rien: sa direction est une TAILLE", () => {
  // « child-size share of the same dish » — une taille, jamais une
  // orientation. Un enfant est donc servable de n'importe quelle casserole, et
  // le fusionner reste toujours au barreau ①.
  assertEquals(servingDemandsFor(memberOf({ ageState: "minor", goal: "muscle_gain" })), {
    protein: null,
    starch: null,
    vegetables: null,
  });
});

Deno.test("une bouche d'ÂGE INCONNU suit le neutre, pas son objectif", () => {
  // Même garde qu'ailleurs (`goalApplies`): sans date, on ne sait pas si c'est
  // un adulte. Lui prêter la demande de son objectif la ferait peser sur la
  // décision de fusion d'une table entière.
  assertEquals(
    servingDemandsFor(memberOf({ ageState: "unknown", goal: "muscle_gain" })),
    demandsOf(null),
  );
});

Deno.test("LA FUSION LIT EXACTEMENT LA DIRECTION QUE LE BRIEF ÉCRIT", () => {
  // ⚠️ LA DIVERGENCE QU'ON REFUSE. Si le brief écrivait une direction et que la
  // fusion en lisait une autre, le moteur renoncerait — ou ne renoncerait pas —
  // sur une phrase que personne n'a servie. Les deux passent par
  // `servingDirectionFor`, et ce test le PROUVE sur la sortie réelle du brief.
  for (
    const member of [
      memberOf({ goal: "fat_loss" }),
      memberOf({ goal: "muscle_gain" }),
      memberOf({ goal: null }),
      memberOf({ ageState: "minor", goal: "fat_loss" }),
      memberOf({ ageState: "unknown", goal: "performance" }),
    ]
  ) {
    const brief = buildPortionBrief([member], "one_dish");
    assert(
      brief.includes(`- ${member.displayName}: ${servingDirectionFor(member)}`),
      `le brief n'écrit pas la direction que la fusion lit: ${brief}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. D15 · L'INTERSECTION — et D16 · LE PIVOT
// ---------------------------------------------------------------------------

const MON = "2026-08-10"; // un lundi
const WED = "2026-08-12";
const SUN = "2026-08-16";

Deno.test("LE CAS QUI PASSE: deux fenêtres identiques fusionnent en entier", () => {
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 7 },
    personal: { startsOn: MON, durationDays: 7 },
    today: MON,
  });
  assert(out.ok);
  assertEquals(out.window, { startsOn: MON, durationDays: 7 });
  assertEquals(out.intersection, { startsOn: MON, durationDays: 7 });
  assertEquals(out.pivot, MON);
  assertEquals(out.daysAlreadyPast, 0);
});

Deno.test("D15 — la fusion s'arrête où les fenêtres se séparent", () => {
  // Le cas de la fiche, mot pour mot: le foyer couvre lundi→dimanche, le
  // secondaire mercredi→dimanche. On fusionne mercredi→dimanche, et lundi et
  // mardi restent au foyer tels quels.
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 7 },
    personal: { startsOn: WED, durationDays: 5 },
    today: MON,
  });
  assert(out.ok);
  assertEquals(out.window, { startsOn: WED, durationDays: 5 });
  assertEquals(out.intersection, { startsOn: WED, durationDays: 5 });
});

// ---------------------------------------------------------------------------
// 2 bis. D1 (QA du 2026-08-12) — UNE FUSION NE RÉTRÉCIT JAMAIS LA COUVERTURE
//        DU FOYER.
//
// Mesuré en HTTP: foyer 08-10→08-16, Zoé 08-12→08-14. La fusion écrivait
// 08-12→08-14 et recevait 409 `plan_overlaps_existing` APRÈS 16,1 s de modèle,
// 7 335 jetons et une unité du plafond de L7. La moitié jumelle du même défaut
// ne refusait pas: quand la fusion démarrait le même jour que le plan du foyer,
// `replace_current` retirait la semaine entière pour la remplacer par trois
// jours, et la fin de semaine disparaissait EN SILENCE.
//
// ⚠️ LE CAS QUI PASSE EST JUSTE AU-DESSUS, et c'est le plus banal du produit:
// foyer lundi→dimanche, secondaire mercredi→dimanche. Les deux fenêtres
// finissent ensemble, `recomposed` VAUT `window`, et rien de ce lot ne bouge.
// ---------------------------------------------------------------------------

Deno.test("D1 — la fenêtre ÉCRITE couvre la queue du plan du foyer", () => {
  // La forme mesurée en HTTP, en nombres: on reprend ses 2 jours (mer, jeu) et
  // on recompose les 7 jours du foyer, pour que vendredi→dimanche gardent un
  // plan.
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 7 },
    personal: { startsOn: WED, durationDays: 2 },
    today: MON,
  });
  assert(out.ok);
  assertEquals(out.window, { startsOn: WED, durationDays: 2 });
  assertEquals(out.recomposed, { startsOn: WED, durationDays: 5 });
});

Deno.test("D1 — le PIVOT coupe les deux fenêtres, jamais une seule", () => {
  // Deux jours déjà consommés: la reprise porte sur les 3 jours restants de SON
  // plan (mer→ven), et la recomposition sur les 5 jours restants du foyer.
  // C'est la phrase de D16, et elle reste vraie mot pour mot.
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 7 },
    personal: { startsOn: MON, durationDays: 5 },
    today: WED,
  });
  assert(out.ok);
  assertEquals(out.window, { startsOn: WED, durationDays: 3 });
  assertEquals(out.recomposed, { startsOn: WED, durationDays: 5 });
  assertEquals(out.daysAlreadyPast, 2);
});

Deno.test("D1 — LE CAS NOMINAL NE BOUGE PAS: deux plans qui finissent ensemble", () => {
  // ⚠️ LA MOITIÉ QUI PROUVE QUE LE LOT NE CHANGE PAS CE QUI MARCHAIT. Foyer
  // lundi→dimanche, secondaire mercredi→dimanche: la fenêtre écrite est
  // EXACTEMENT celle d'avant, à l'octet près.
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 7 },
    personal: { startsOn: WED, durationDays: 5 },
    today: MON,
  });
  assert(out.ok);
  assertEquals(out.window, { startsOn: WED, durationDays: 5 });
  assertEquals(out.recomposed, out.window);
});

Deno.test("D1 — un plan personnel qui DÉBORDE ne fait pas déborder la fusion", () => {
  // Le plan du foyer s'arrête avant: la recomposition s'arrête avec lui. Une
  // fusion n'a jamais le droit d'allonger la semaine du foyer — elle ne fait
  // que refuser de la raccourcir.
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 3 },
    personal: { startsOn: WED, durationDays: 7 },
    today: MON,
  });
  assert(out.ok);
  assertEquals(out.window, { startsOn: WED, durationDays: 1 });
  assertEquals(out.recomposed, { startsOn: WED, durationDays: 1 });
});

Deno.test("D1 — LA DÉFUSION NE CHANGE PAS D'UN JOUR", () => {
  // ⚠️ « La défusion a obéi 14/14 »: sa fenêtre ne bouge pas. La queue d'un plan
  // finit par définition en même temps que lui, donc les deux champs sont égaux
  // — prouvé sur la forme qui les aurait séparés (une queue coupée au pivot).
  const tail = resolveTailWindow({
    plan: { startsOn: MON, durationDays: 7 },
    today: WED,
  });
  assert(tail.ok);
  assertEquals(tail.window, { startsOn: WED, durationDays: 5 });
  assertEquals(tail.recomposed, tail.window);
});

Deno.test("D1 — TOUTE fenêtre rendue est ÉCRIVABLE. Sur 400 formes.", () => {
  // ⚠️ C'EST L'INVARIANT DU LOT, ET IL SE MESURE PLUTÔT QU'IL NE S'AFFIRME. La
  // question « la base acceptera-t-elle cette fenêtre » se tranche avant le
  // modèle: `mergeWindowWritable` rejoue la boucle de chevauchement de la RPC,
  // et aucune des fenêtres produites ne doit lui déplaire.
  //
  // Le décor DOIT prouver qu'il a vu les deux réponses: un banc où rien ne
  // serait jamais écrivable-faux resterait vert avec un prédicat qui rend
  // toujours `true`. On compte donc les fenêtres SANS extension qui, elles,
  // auraient été refusées — c'est-à-dire les cas que la QA a payés.
  let ok = 0;
  let wouldHaveFailed = 0;
  for (let hDur = 1; hDur <= 7; hDur++) {
    for (let pOffset = -3; pOffset <= 3; pOffset++) {
      for (let pDur = 1; pDur <= 7; pDur++) {
        for (const today of [MON, WED, SUN]) {
          const household = { startsOn: MON, durationDays: hDur };
          const personal = {
            startsOn: addDays(MON, pOffset),
            durationDays: pDur,
          };
          const out = resolveMergeWindow({ household, personal, today });
          if (!out.ok) continue;
          ok++;
          assert(
            mergeWindowWritable(household, out.recomposed),
            `fenêtre non écrivable: foyer ${household.startsOn}/${hDur}, perso ` +
              `${personal.startsOn}/${pDur}, today ${today} ⇒ ` +
              `${out.recomposed.startsOn}/${out.recomposed.durationDays}`,
          );
          if (!mergeWindowWritable(household, out.window)) wouldHaveFailed++;
        }
      }
    }
  }
  assert(ok > 200, `banc trop maigre: ${ok} fenêtres`);
  assert(
    wouldHaveFailed > 20,
    `le banc ne contient pas le défaut qu'il garde: seulement ` +
      `${wouldHaveFailed} fenêtres auraient été refusées sans l'extension`,
  );
});

Deno.test("D1 — LA RÈGLE COPIÉE EST BIEN CELLE DE LA MIGRATION", async () => {
  // ⚠️ UNE RÈGLE RECOPIÉE HORS DE SA SOURCE DOIT AVOIR UN FIL QUI LA RAMÈNE.
  // `mergeWindowWritable` réécrit en TypeScript ce que la boucle de
  // chevauchement de `write_student_meal_plan` décide en SQL. Le jour où la
  // migration change d'avis, ce test tombe — c'est tout ce qu'il promet, et
  // c'est ce qui manquait pour que la copie soit défendable.
  const sql = await Deno.readTextFile(
    new URL(
      "../../../migrations/20260811140000_meal_plan_window_and_mode_guards.sql",
      import.meta.url,
    ),
  );
  const loop = sql.slice(
    sql.indexOf("for v_clash in"),
    sql.indexOf("end loop;"),
  );
  assert(loop.length > 0, "boucle de chevauchement introuvable — test à réviser");
  // ① « commence le même jour ou après »
  assert(
    /if v_clash\.starts_on >= p_starts_on then\s*raise exception 'plan_overlaps_existing/
      .test(loop),
    "la RPC ne refuse plus le plan qui commence le même jour ou après",
  );
  // ② « commence avant ET finit après » — le correctif du 2026-08-11, celui que
  //    la fusion payait au prix d'une génération.
  assert(
    /v_clash\.starts_on \+ v_clash\.duration_days\s*>\s*p_starts_on \+ p_duration_days/
      .test(loop),
    "la RPC ne refuse plus la fenêtre ENGLOBÉE: `mergeWindowWritable` refuse " +
      "désormais des fusions que la base accepterait.",
  );
});

Deno.test("D1 — le prédicat compte les jours, pas les cas de figure", () => {
  const house = { startsOn: MON, durationDays: 7 } as const;
  // Le dernier jour du foyer est couvert: écrivable, à un jour près.
  assertEquals(
    mergeWindowWritable(house, { startsOn: WED, durationDays: 5 }),
    true,
  );
  // Un jour de moins, et la queue du foyer tombe dans le vide.
  assertEquals(
    mergeWindowWritable(house, { startsOn: WED, durationDays: 4 }),
    false,
  );
  // Le même jour de départ reste écrivable QUELLE QUE SOIT la durée: c'est
  // `replace_current`, et la ligne d'avant est retirée.
  assertEquals(
    mergeWindowWritable(house, { startsOn: MON, durationDays: 1 }),
    true,
  );
});

Deno.test("D15 — deux fenêtres qui ne partagent RIEN sont refusées, nommément", () => {
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 2 },
    personal: { startsOn: WED, durationDays: 3 },
    today: MON,
  });
  assert(!out.ok);
  assertEquals(out.refusal, MERGE_WINDOWS_DISJOINT);
});

Deno.test("D16 — LE PIVOT COUPE LES JOURS DÉJÀ CONSOMMÉS", () => {
  // « son plan couvre 5 jours, dont 2 déjà passés — je peux fusionner les 3
  // restants »: la phrase de D16, rendue en nombres.
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 7 },
    personal: { startsOn: MON, durationDays: 5 },
    today: WED,
  });
  assert(out.ok);
  assertEquals(out.intersection, { startsOn: MON, durationDays: 5 });
  assertEquals(out.pivot, WED);
  assertEquals(out.window, { startsOn: WED, durationDays: 3 });
  assertEquals(out.daysAlreadyPast, 2);
});

Deno.test("D16 — une fenêtre entièrement passée est refusée, nommément", () => {
  const out = resolveMergeWindow({
    household: { startsOn: MON, durationDays: 7 },
    personal: { startsOn: MON, durationDays: 3 },
    today: SUN,
  });
  assert(!out.ok);
  assertEquals(
    out.refusal,
    MERGE_WINDOW_ALL_PAST,
    "« tout est déjà passé » ne doit pas se lire « rien en commun »: les deux " +
      "fenêtres se touchent bien, c'est le pivot qui a tranché.",
  );
});

Deno.test("D16 — un plan À VENIR n'est pas repoussé au jour d'aujourd'hui", () => {
  // Le `max` est la bonne opération, pas une affectation: quand `today` est
  // AVANT l'intersection, le premier jour non consommé est le premier jour
  // tout court.
  const out = resolveMergeWindow({
    household: { startsOn: WED, durationDays: 3 },
    personal: { startsOn: WED, durationDays: 3 },
    today: MON,
  });
  assert(out.ok);
  assertEquals(out.window, { startsOn: WED, durationDays: 3 });
  assertEquals(out.pivot, WED);
});

Deno.test("LE JOUR VIENT DE L'APPELANT, PAS D'UNE HORLOGE", () => {
  // ⚠️ « Aujourd'hui » se résout en JOUR LOCAL DE L'ÉLÈVE, jamais sur l'horloge
  // du serveur — ce dépôt a payé des incidents de « demain » résolus de nuit.
  // Une fonction pure ne peut pas le vérifier par introspection; ce qu'on
  // prouve ici, c'est qu'elle n'a AUCUNE horloge à elle: deux `today`
  // différents rendent deux fenêtres différentes, et la même entrée rend
  // toujours la même sortie.
  const span = { startsOn: MON, durationDays: 7 } as const;
  const a = resolveMergeWindow({ household: span, personal: span, today: MON });
  const b = resolveMergeWindow({ household: span, personal: span, today: WED });
  assert(a.ok && b.ok);
  assertEquals(a.window.durationDays, 7);
  assertEquals(b.window.durationDays, 5);
  assertEquals(
    resolveMergeWindow({ household: span, personal: span, today: WED }),
    b,
    "deux appels identiques rendent deux résultats identiques",
  );
});

Deno.test("une fenêtre illisible est refusée, elle ne lève pas", () => {
  for (
    const bad of [
      { household: { startsOn: "10-08-2026", durationDays: 7 }, personal: { startsOn: MON, durationDays: 7 }, today: MON },
      { household: { startsOn: MON, durationDays: 0 }, personal: { startsOn: MON, durationDays: 7 }, today: MON },
      { household: { startsOn: MON, durationDays: 7 }, personal: { startsOn: "", durationDays: 7 }, today: MON },
      { household: { startsOn: MON, durationDays: 7 }, personal: { startsOn: MON, durationDays: 7 }, today: "hier" },
    ]
  ) {
    const out = resolveMergeWindow(bad);
    assert(!out.ok, JSON.stringify(bad));
    assertEquals(out.refusal, MERGE_WINDOW_UNREADABLE);
  }
});

Deno.test("dayCountInclusive compte les deux bornes, et jamais en négatif", () => {
  assertEquals(dayCountInclusive(MON, MON), 1);
  assertEquals(dayCountInclusive(MON, SUN), 7);
  assertEquals(dayCountInclusive(SUN, MON), 0);
});

// ---------------------------------------------------------------------------
// 3. D6 · L'ÉCHELLE — ① même plat, ② même session, ③ sessions séparées
// ---------------------------------------------------------------------------

const COOKS_SUN = ["sun"];
const COOKS_WED = ["wed"];

Deno.test("LE CAS QUI PASSE ① — une demande que la table porte déjà", () => {
  // Une table en `fat_loss` porte déjà « generous vegetables ». Quelqu'un en
  // `health` demande la même chose sur les légumes, et l'équilibre ailleurs:
  // une casserole peut toujours en donner MOINS. Barreau ①.
  const out = mergeLadder({
    table: [demandsOf("fat_loss")],
    incoming: demandsOf("health"),
    householdCookingDays: COOKS_SUN,
    personalCookingDays: COOKS_SUN,
  });
  assertEquals(out.shape, "one_dish");
  assertEquals(out.reason, LADDER_REASON_ONE_DISH);
  assertEquals(out.conflicts, []);
});

Deno.test("LE CAS QUI PASSE ① — qui ne demande RIEN au-dessus de l'équilibre", () => {
  // `maintenance` et « aucun objectif » demandent l'équilibre partout: servable
  // de n'importe quelle casserole, quelle que soit la table.
  for (const incoming of [demandsOf("maintenance"), demandsOf(null)]) {
    const out = mergeLadder({
      table: [demandsOf("fat_loss"), demandsOf("performance")],
      incoming,
      householdCookingDays: COOKS_SUN,
      personalCookingDays: COOKS_SUN,
    });
    assertEquals(out.shape, "one_dish");
  }
});

Deno.test("LE CAS QUI PASSE ① — un MINEUR se fusionne toujours au premier barreau", () => {
  const out = mergeLadder({
    table: [demandsOf("fat_loss")],
    incoming: servingDemandsFor(memberOf({ ageState: "minor" })),
    householdCookingDays: [],
    personalCookingDays: [],
  });
  assertEquals(out.shape, "one_dish");
});

Deno.test("② — LE CAS PHARE: la casserole du père ne nourrit pas le fils", () => {
  // Père seul à table en `fat_loss` (féculent en moins), fils en `muscle_gain`
  // qui revient par la fusion (protéine ET féculent en plus). Une casserole
  // déjà composée peut en donner moins, jamais plus: on descend au barreau ②,
  // et on cuisine son plat à côté, dans la même session.
  //
  // ⚠️ CE N'EST PAS LE MÊME ARBITRAGE QU'UNE COMPOSITION où les deux sont là
  // dès le départ — là, le plat est dimensionné pour les deux. C'est toute la
  // différence entre composer et fusionner.
  const out = mergeLadder({
    table: [demandsOf("fat_loss")],
    incoming: demandsOf("muscle_gain"),
    householdCookingDays: COOKS_SUN,
    personalCookingDays: COOKS_SUN,
  });
  assertEquals(out.shape, "one_session");
  assertEquals(out.reason, LADDER_REASON_ONE_SESSION);
  assertEquals(out.conflicts, [
    "protein:larger_above_table",
    "starch:larger_above_table",
  ]);
  assertEquals(out.sharedCookingDays, ["sun"]);
});

Deno.test("② — la table ÉLARGIE reprend le même entrant au barreau ①", () => {
  // La preuve que le critère parle bien de la TABLE et pas de l'objectif: le
  // même `muscle_gain` passe au barreau ① dès que quelqu'un porte déjà sa
  // demande. Sans ce cas, le refus ci-dessus serait indiscernable d'un moteur
  // qui refuse toujours `muscle_gain`.
  const out = mergeLadder({
    table: [demandsOf("fat_loss"), demandsOf("muscle_gain")],
    incoming: demandsOf("muscle_gain"),
    householdCookingDays: COOKS_SUN,
    personalCookingDays: COOKS_SUN,
  });
  assertEquals(out.shape, "one_dish");
  assertEquals(out.conflicts, []);
});

Deno.test("③ — deux plans qui ne cuisinent jamais le même jour se séparent", () => {
  const out = mergeLadder({
    table: [demandsOf("fat_loss")],
    incoming: demandsOf("muscle_gain"),
    householdCookingDays: COOKS_SUN,
    personalCookingDays: COOKS_WED,
  });
  assertEquals(out.shape, "separate_sessions");
  assertEquals(out.reason, LADDER_REASON_NO_COOKING_DAY);
  assertEquals(out.sharedCookingDays, []);
});

Deno.test("③ NE SE DÉCLENCHE PAS quand un des deux plans ne cuisine PAS", () => {
  // Un plan d'assemblage, une fenêtre d'un jour: il n'y a rien à séparer.
  // Descendre à ③ dirait au modèle d'ouvrir une session qui n'existe nulle
  // part. On reste au barreau ②, où le second plat rejoint la session du foyer.
  for (
    const [household, personal] of [
      [COOKS_SUN, []],
      [[], COOKS_WED],
      [[], []],
    ] as const
  ) {
    const out = mergeLadder({
      table: [demandsOf("fat_loss")],
      incoming: demandsOf("muscle_gain"),
      householdCookingDays: household,
      personalCookingDays: personal,
    });
    assertEquals(
      out.shape,
      "one_session",
      `household=${JSON.stringify(household)} personal=${JSON.stringify(personal)}`,
    );
  }
});

Deno.test("UN AXE ILLISIBLE FAIT DESCENDRE D'UN BARREAU — jamais deviner", () => {
  // La direction d'erreur est choisie: un axe qu'on n'a pas su lire coûte un
  // plat de plus, jamais une assiette qui ment.
  const conflicts = servingConflicts(
    [demandsOf("maintenance")],
    { protein: "unreadable", starch: null, vegetables: null },
  );
  assertEquals(conflicts, ["protein:unreadable"]);
});

Deno.test("un axe que la table ne porte pas plafonne à l'équilibre", () => {
  // Personne à table ne demande quoi que ce soit sur le féculent (tout le monde
  // est en `performance`… qui, lui, en demande PLUS). On prend donc un cas net:
  // une table qui n'a AUCUNE demande sur les légumes ne peut pas en donner
  // « generous » à quelqu'un.
  const noVegDemand: ServingAxisDemands = {
    protein: "balanced",
    starch: "balanced",
    vegetables: null,
  };
  assertEquals(
    servingConflicts([noVegDemand], demandsOf("health")),
    ["vegetables:larger_above_table"],
  );
  // Et l'inverse: la même table sert sans broncher une demande à l'équilibre.
  assertEquals(servingConflicts([noVegDemand], demandsOf("maintenance")), []);
});

// ---------------------------------------------------------------------------
// 4. LA PROVENANCE — sans elle, D8 est incalculable
// ---------------------------------------------------------------------------

Deno.test("`merged_from` porte QUI, QUELLE LIGNE, VALIDÉE QUAND, SUR QUELS JOURS", () => {
  const entry = mergedFromEntry({
    memberId: "m-teen",
    userId: "u-teen",
    plan: {
      id: "p-teen",
      startsOn: MON,
      durationDays: 7,
      validatedAt: "2026-08-09T10:00:00Z",
    },
    window: { startsOn: WED, durationDays: 3 },
  });
  assertEquals(entry, {
    member_id: "m-teen",
    user_id: "u-teen",
    plan_id: "p-teen",
    plan_starts_on: MON,
    plan_duration_days: 7,
    // ⚠️ SANS CETTE DATE, D8 EST INCALCULABLE. « il vient d'en valider un
    // NOUVEAU » est une comparaison de DATES DE VALIDATION, pas d'ids: le même
    // plan revalidé porte le même id.
    validated_at: "2026-08-09T10:00:00Z",
    days: ["2026-08-12", "2026-08-13", "2026-08-14"],
  });
});

Deno.test("les jours archivés sont ceux de la FUSION, pas ceux du plan", () => {
  // Le plan couvre 7 jours; la fusion n'en a repris que 3 (D16). Archiver les 7
  // ferait croire à L5 que des jours déjà mangés ont été refusionnés.
  const entry = mergedFromEntry({
    memberId: "m",
    userId: null,
    plan: { id: "p", startsOn: MON, durationDays: 7, validatedAt: null },
    window: { startsOn: WED, durationDays: 3 },
  });
  assertEquals(entry.days.length, 3);
  assertEquals(entry.days[0], WED);
});

// ---------------------------------------------------------------------------
// 5. LE BLOC DE CONSIGNE
// ---------------------------------------------------------------------------

const MATERIAL = [
  { day: "wed", slot: "dinner", title: "Curry de pois chiches" },
  { day: "thu", slot: "lunch", title: "Wrap au poulet" },
];

/** L'ANCRE (O5): les plats du plan DU FOYER sur la fenêtre recomposée. */
const BASE_MATERIAL = [
  { day: "wed", slot: "dinner", title: "Gratin de courgettes" },
  { day: "thu", slot: "lunch", title: "Salade de lentilles" },
];

/**
 * LES LIGNES D'UNE SECTION, ET POURQUOI ON NE COMPTE PLUS LES « - » DU BLOC.
 *
 * Depuis O5 le bloc porte DEUX listes: la matière du plan personnel, puis
 * l'ancre — les plats du foyer. Compter tous les tirets confondrait les deux, et
 * le plafond de la matière (`MERGE_MATERIAL_CAP`, qui ouvre le budget de plats)
 * cesserait d'être mesuré pour ce qu'il est.
 */
function bulletsAfter(block: string, header: string): string[] {
  const at = block.indexOf(header);
  if (at < 0) return [];
  const out: string[] = [];
  for (const line of block.slice(at).split("\n").slice(1)) {
    if (!line.startsWith("- ")) break;
    out.push(line);
  }
  return out;
}

const OWN_HEADER = "was going to eat over these days, on their own:";
const BASE_HEADER = "The household's plan over these days:";

Deno.test("le bloc nomme la personne, les dates, et ce qu'elle allait manger", () => {
  const block = buildMergeBlock({
    displayName: "Tom",
    window: { startsOn: WED, durationDays: 3 },
    shape: "one_session",
    dishes: MATERIAL,
    baseDishes: BASE_MATERIAL,
    gaps: [],
  });
  assert(block.startsWith("== BRINGING SOMEONE BACK TO THIS TABLE =="));
  assert(block.includes("Tom"));
  assert(block.includes(WED));
  assert(block.includes("2026-08-14"), "la fin de la fenêtre doit être écrite");
  assert(block.includes("- wed dinner: Curry de pois chiches"));
});

// ---------------------------------------------------------------------------
// 5.1 — O5: L'ANCRE. LA FUSION MONTRE LE PLAN DU FOYER, ET DIT D'Y RESTER
// ---------------------------------------------------------------------------

Deno.test("O5 — LA FUSION ANCRE SUR LE PLAN DU FOYER, comme la défusion sur le plan de base", () => {
  // ⚠️ LE DÉFAUT MESURÉ QUE CE TEST EXISTE POUR EMPÊCHER. Deux fusions réelles
  // sur deux ont servi le plan PERSONNEL du secondaire à toute la tablée: 15
  // créneaux sur 15, aucun titre du plan du foyer survivant. La consigne ne
  // montrait qu'une seule liste — celle du plan personnel — et un modèle à qui
  // l'on ne montre qu'un menu écrit ce menu.
  const block = buildMergeBlock({
    displayName: "Zoé",
    window: { startsOn: WED, durationDays: 3 },
    shape: "one_session",
    dishes: MATERIAL,
    baseDishes: BASE_MATERIAL,
    gaps: [],
  });
  // 1. Le plan du foyer est SOUS LES YEUX du modèle, plat par plat.
  assert(block.includes("- wed dinner: Gratin de courgettes"));
  assert(block.includes("- thu lunch: Salade de lentilles"));
  // 2. Avec l'instruction d'y rester, mot pour mot la jumelle de celle de la
  //    défusion — celle qui a obtenu 14 titres identiques sur 14.
  assert(block.includes(MERGE_ANCHOR_INSTRUCTION));
  assert(block.includes("THE HOUSEHOLD'S PLAN IS THE PLAN"));
  // 3. ET L'ANCRE EST EN DERNIER. Un modèle lit la contrainte la plus proche de
  //    la fin comme la plus contraignante: la liste à ne PAS recopier ne peut
  //    pas être le mot de la fin. C'est la moitié du correctif.
  assert(
    block.indexOf(OWN_HEADER) < block.indexOf(MERGE_ANCHOR_INSTRUCTION),
    "la matière du plan personnel passe APRÈS l'ancre: c'est elle que le " +
      "modèle lira comme la consigne finale.",
  );
  assert(
    block.indexOf(MERGE_ANCHOR_INSTRUCTION) < block.indexOf(BASE_HEADER),
    "l'ancre doit précéder la liste qu'elle désigne",
  );
  assert(
    block.lastIndexOf("- wed dinner: Gratin de courgettes") >
      block.lastIndexOf("- wed dinner: Curry de pois chiches"),
    "le plan du foyer doit être la DERNIÈRE liste du bloc",
  );
});

Deno.test("O5 — L'ANCRE N'INTERDIT PAS LE PLAT DÉDIÉ (le cas qui passe)", () => {
  // ⚠️ SANS CETTE MOITIÉ, « ancrer » voudrait dire « ne rien ajouter », et L4
  // tomberait avec: aux barreaux ② et ③ le modèle DOIT produire un plat pour la
  // personne reprise, et le plafond de plats lui a ouvert la place pour ça
  // (`dishBudgetFor`). Une ancre qui tuerait le plat dédié ressemblerait à une
  // ancre qui marche.
  const of = (shape: "one_dish" | "one_session" | "separate_sessions") =>
    buildMergeBlock({
      displayName: "Zoé",
      window: { startsOn: WED, durationDays: 3 },
      shape,
      dishes: MATERIAL,
      baseDishes: BASE_MATERIAL,
      gaps: [],
    });
  for (const shape of ["one_session", "separate_sessions"] as const) {
    assert(
      of(shape).includes("ADD"),
      `${shape}: la consigne ne demande plus d'AJOUTER un plat pour la personne.`,
    );
  }
  // ① reste le seul barreau où rien ne s'ajoute.
  assert(of("one_dish").includes("Never turn it into a second dish."));
  // Et les trois portent l'ancre: elle ne dépend pas du barreau.
  for (const shape of ["one_dish", "one_session", "separate_sessions"] as const) {
    assert(of(shape).includes(MERGE_ANCHOR_INSTRUCTION), shape);
  }
});

Deno.test("O5 — la MATIÈRE est nommée comme telle, jamais comme un menu", () => {
  const of = (shape: "one_session" | "separate_sessions") =>
    buildMergeBlock({
      displayName: "Zoé",
      window: { startsOn: WED, durationDays: 3 },
      shape,
      dishes: MATERIAL,
      baseDishes: BASE_MATERIAL,
      gaps: [],
    });
  for (const shape of ["one_session", "separate_sessions"] as const) {
    assert(
      of(shape).includes("never a menu for the table"),
      `${shape}: rien ne dit que la liste du plan personnel n'est pas le menu ` +
        `de tout le monde.`,
    );
    assert(
      of(shape).includes("Everyone else keeps the household's dishes"),
      `${shape}: rien ne dit que les autres gardent leurs plats.`,
    );
  }
});

Deno.test("LA CONSIGNE CHANGE AVEC LE BARREAU, et pas seulement le brief", () => {
  const of = (shape: "one_dish" | "one_session" | "separate_sessions") =>
    buildMergeBlock({
      displayName: "Tom",
      window: { startsOn: WED, durationDays: 3 },
      shape,
      dishes: MATERIAL,
      baseDishes: BASE_MATERIAL,
      gaps: [],
    });
  // ① la matière est une PRÉFÉRENCE, jamais un second plat.
  assert(of("one_dish").includes("SAME dishes"));
  assert(of("one_dish").includes("Never turn it into a second dish."));
  // ② deux plats, UNE session.
  assert(of("one_session").includes("SAME cooking session"));
  // ③ leur propre session.
  assert(of("separate_sessions").includes("OWN cooking session"));
  // Et les trois se distinguent réellement les unes des autres.
  const all = [of("one_dish"), of("one_session"), of("separate_sessions")];
  assertEquals(new Set(all).size, 3);
});

Deno.test("la matière est PLAFONNÉE — un plan ne fait pas grossir le prompt sans fin", () => {
  const many = Array.from({ length: MERGE_MATERIAL_CAP + 20 }, (_, i) => ({
    day: "wed",
    slot: "snack",
    title: `plat ${i}`,
  }));
  const block = buildMergeBlock({
    displayName: "Tom",
    window: { startsOn: WED, durationDays: 3 },
    shape: "one_session",
    dishes: many,
    baseDishes: BASE_MATERIAL,
    gaps: [],
  });
  assertEquals(bulletsAfter(block, OWN_HEADER).length, MERGE_MATERIAL_CAP);
  // L'ANCRE EST PLAFONNÉE PAREIL, et par la même fonction: un plan du foyer
  // démesuré ne doit pas faire grossir le prompt d'un côté quand on l'a fermé
  // de l'autre.
  const wide = buildMergeBlock({
    displayName: "Tom",
    window: { startsOn: WED, durationDays: 3 },
    shape: "one_session",
    dishes: MATERIAL,
    baseDishes: many,
    gaps: [],
  });
  assertEquals(bulletsAfter(wide, BASE_HEADER).length, MERGE_MATERIAL_CAP);
});

Deno.test("sans matière, aucun en-tête de matière n'apparaît", () => {
  // Un « voici ce qu'il allait manger » suivi de rien ferait composer le modèle
  // contre une liste imaginaire. Même posture que le bloc d'envies. Vrai des
  // DEUX côtés depuis O5.
  const block = buildMergeBlock({
    displayName: "Tom",
    window: { startsOn: WED, durationDays: 3 },
    shape: "one_dish",
    dishes: [],
    baseDishes: [],
    gaps: [],
  });
  assert(!block.includes(OWN_HEADER));
  assert(!block.includes(BASE_HEADER));
  // ⚠️ MAIS L'ANCRE, ELLE, RESTE. Elle ne dit pas « regarde la liste », elle dit
  // ce qui fait autorité: une fusion sans liste lisible garde la règle.
  assert(block.includes(MERGE_ANCHOR_INSTRUCTION));
  // ET LE CAS QUI PASSE, sans quoi les deux `!includes` ci-dessus seraient
  // verts sur un bloc qui n'affiche plus jamais rien.
  const full = buildMergeBlock({
    displayName: "Tom",
    window: { startsOn: WED, durationDays: 3 },
    shape: "one_dish",
    dishes: MATERIAL,
    baseDishes: BASE_MATERIAL,
    gaps: [],
  });
  assert(full.includes(OWN_HEADER));
  assert(full.includes(BASE_HEADER));
});

// ---------------------------------------------------------------------------
// 6. LE FIL EST BRANCHÉ, ET LES REFUS NE COÛTENT PAS UN MODÈLE
// ---------------------------------------------------------------------------

/**
 * Le code SANS ses commentaires. Cicatrice du dépôt: « un audit d'appelants au
 * grep naïf compte des faux vivants » — et les gros commentaires de ce lot
 * citent tous les noms qu'on cherche.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function generatorSource(): Promise<string> {
  return stripComments(
    await Deno.readTextFile(
      new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
    ),
  );
}

Deno.test("AUCUN REFUS DE FUSION NE SE PAIE AU PRIX D'UNE GÉNÉRATION", () => {
  // ⚠️ LA POSITION NE SE PROUVE QUE PAR LA SOURCE. En HTTP, un refus posé après
  // le modèle est indiscernable d'un refus posé avant — il est juste, et c'est
  // ce qui le rend invisible. L1 a mesuré 28,6 s et 225 s brûlées exactement
  // comme ça.
  return generatorSource().then((src) => {
    const model = src.indexOf("generateWithGemini(");
    assert(model >= 0, "appel modèle introuvable — test à réviser");
    for (
      const marker of [
        '"unknown_operation"',
        '"merge_member_required"',
        "resolveMergeRequest({",
        // C3 ④ — rendu par la CONSTANTE partagée depuis que le lecteur de
        // propositions prédit ce refus. Le littéral a quitté ce fichier.
        "error: MERGE_MEMBER_AWAY_ALL_WINDOW",
        // L7/D11 — LE PLAFOND EST DE CETTE FAMILLE. Il se tranche sur un
        // compteur et une date; le payer d'une génération de 20 à 67 s serait
        // le refus le plus cher du produit. Les deux points de contrôle sont
        // ici: le refus RAPIDE (la lecture) et la GARDE (la réclamation).
        // Leur position FINE — « aucune porte de sortie entre la réclamation
        // et la dépense » — est tenue dans `household_merge_quota_test.ts`.
        "keel_household_merge_quota_state",
        "keel_household_claim_merge_quota",
      ]
    ) {
      const at = src.indexOf(marker);
      assert(at >= 0, `${marker} introuvable — test à réviser`);
      assert(
        at < model,
        `${marker} est APRÈS le premier appel modèle: le refus reste juste, et ` +
          `c'est ce qui le rend invisible — il se paie désormais au prix d'une ` +
          `génération complète.`,
      );
    }
  });
});

Deno.test("LA FUSION N'ÉCRIT JAMAIS SUR LE COMPTE DU SECONDAIRE", async () => {
  // ⚠️ L'INVARIANT LE PLUS IMPORTANT DU LOT. « Le plan personnel du secondaire
  // n'est jamais écrasé »: c'est ce qui rend la défusion de D8 possible. La
  // garde n'est pas une condition, elle est STRUCTURELLE — la RPC ne touche que
  // les lignes de `p_user_id` ET de la même nature, et `p_user_id` est le
  // MAÎTRE. Le jour où quelqu'un y passe autre chose, ce test tombe.
  const src = await generatorSource();
  const calls = src.split('rpc(\n      "write_student_meal_plan"').length - 1 +
    (src.split('"write_student_meal_plan",').length - 1);
  assert(calls >= 1, "l'appel d'écriture est introuvable — test à réviser");
  const at = src.indexOf('"write_student_meal_plan"');
  const args = src.slice(at, at + 400);
  assert(
    /p_user_id:\s*userId/.test(args),
    "l'écriture ne se fait plus sur le compte du MAÎTRE. Une fusion qui écrit " +
      "sur le compte du secondaire écraserait le plan qu'elle est censée " +
      "préserver — et la défusion de D8 n'aurait plus rien à retrouver.",
  );
  assert(
    /plan_kind:\s*"household"/.test(src),
    "le plan écrit n'est plus de nature `household`: il entrerait en collision " +
      "avec la fenêtre du plan personnel au lieu de vivre à côté.",
  );
});

Deno.test("O5 — L'ANCRE EST BRANCHÉE SUR LE PLAN DU FOYER, PAS SUR LE PLAN PERSONNEL", async () => {
  // ⚠️ LE MODULE PUR NE PROUVE QUE LA MOITIÉ. `buildMergeBlock` peut être
  // parfait et recevoir deux fois la même liste: le prompt afficherait alors le
  // plan personnel sous les deux en-têtes, et l'ancre dirait « reste au plus
  // près » en pointant très exactement ce qu'il ne faut pas recopier. Rien
  // n'échouerait — un prompt n'a pas de compilateur, et c'est la cicatrice
  // d'origine de ce chantier.
  const src = await generatorSource();
  assert(
    /const mergeBaseMaterial = merge === null \? \[\] : mergeMaterialShown\(\s*merge\.householdPlan\.dishes/
      .test(src),
    "l'ancre ne vient plus des plats du PLAN DU FOYER (`merge.householdPlan`).",
  );
  assert(
    /baseDishes:\s*mergeBaseMaterial/.test(src),
    "la consigne de fusion ne reçoit plus l'ancre.",
  );
  // ET LES DEUX LISTES SONT DISTINCTES: la matière vient du plan PERSONNEL.
  assert(
    /const mergeMaterial = merge === null \? \[\] : mergeMaterialShown\(\s*merge\.personalPlan\.dishes/
      .test(src),
    "la matière ne vient plus du plan personnel.",
  );
  // ⚠️ ET L'ANCRE N'ENTRE PAS DANS LE BUDGET DE PLATS. `ownDishesShown` ouvre de
  // la place pour ce que la personne REPRISE apporte (L4, mesuré: le seizième
  // plat rendu était le dîner du dimanche du foyer). Le plan du foyer est déjà
  // dans le plafond de base: l'y rajouter doublerait sa propre fenêtre.
  const budgetAt = src.indexOf("ownDishesShown:");
  assert(budgetAt >= 0, "le budget de fusion est introuvable — test à réviser");
  assert(
    /ownDishesShown:\s*mergeMaterial\.length/.test(src),
    "le budget de plats ne compte plus la seule matière du plan personnel.",
  );
  assert(
    !/ownDishesShown:[^\n]*mergeBaseMaterial/.test(src),
    "l'ancre est entrée dans le budget de plats: le plan du foyer y compte deux fois.",
  );
});

Deno.test("LA FENÊTRE DE FUSION SE DÉDUIT, ELLE NE SE DEMANDE PAS", async () => {
  // Un client qui pourrait choisir la fenêtre pourrait refusionner hier — D16
  // serait une garde que l'appelant contourne en une ligne de JSON.
  const src = await generatorSource();
  assert(
    /startsOn\s*=\s*merge\.window\.recomposed\.startsOn/.test(src),
    "la fusion ne prend plus sa fenêtre de `resolveMergeWindow`: l'intersection " +
      "(D15) et le pivot (D16) ne gouvernent plus ce qui est recomposé.",
  );
  // ⚠️ D1 — ET C'EST `recomposed`, JAMAIS `window`. Écrire `window` est très
  // exactement le P0 mesuré le 2026-08-12: 409 `plan_overlaps_existing` après
  // 16,1 s de modèle quand elle est intérieure au plan du foyer, et une fin de
  // semaine effacée en silence quand la RPC l'acceptait. Les deux champs ont le
  // même type: seul ce test sépare les deux lectures.
  assert(
    !/(?:startsOn|durationDays)\s*=\s*merge\.window\.window\./.test(src),
    "la fusion écrit de nouveau `window` (les jours de SON plan) au lieu de " +
      "`recomposed` (la queue du plan du foyer): la fin de la semaine du foyer " +
      "se retrouve sans plan.",
  );
  // ⚠️ RÉVISÉ PAR L5, ET LA GARANTIE N'A PAS BOUGÉ D'UN POUCE. L'expression
  // épinglée était `merge === null ? [] : [merge.member.member_id]`; depuis que
  // la fusion est COLLANTE, une composition ordinaire re-reprend aussi les
  // bouches déjà fusionnées, donc la branche `null` n'est plus vide. Ce qui est
  // tenu ici reste le fait décisif: la personne que CETTE requête fusionne est
  // passée à `resolveHandOff`, et elle a donc une assiette dans le plan qui
  // dira « fusionné ».
  const handAt = src.indexOf("resolveHandOff({");
  assert(handAt >= 0, "`resolveHandOff` introuvable — test à réviser");
  const handCall = src.slice(handAt, handAt + 600);
  assert(
    /reclaimed:[\s\S]*?merge\.member\.member_id/.test(handCall),
    "la personne fusionnée n'est plus reprise par `resolveHandOff`: le plan " +
      "dit « fusionné » et ne lui donne pas d'assiette.",
  );
  assert(
    /excluded:[\s\S]*?unmerge\.member\.member_id/.test(handCall),
    "la personne DÉFUSIONNÉE n'est plus exclue par `resolveHandOff`: la " +
      "défusion dépenserait un appel modèle pour rendre le plan qu'elle " +
      "voulait défaire, avec la personne toujours à table.",
  );
});

// ===========================================================================
// 7. CE QUE LA DÉCISION COÛTE EN AVAL — les trois défauts du run réel
//    du 2026-08-12
//
// Le moteur DÉCIDAIT juste (l'échelle, l'intersection, le pivot, la provenance
// sont prouvés en réel). C'est la chaîne en aval qui ne savait pas exécuter sa
// décision:
//
//   ① le plat fusionné était JETÉ par le parseur (`servings_made: 1`);
//   ② le plafond de plats ignorait la fusion, et le plat perdu était le dîner
//      du dimanche du foyer;
//   ③ personne ne comparait le plan rendu à la forme demandée.
//
// ⚠️ AUCUN NOMBRE ATTENDU N'EST CALCULÉ PAR LA FONCTION TESTÉE. « Un test
// paramétré par sa propre constante reste vert quand on change la constante »:
// les plafonds attendus sont écrits en toutes lettres (3 moments × 5 jours =
// 15), jamais dérivés de `dishCapFor` ni de `dishBudgetFor`.
// ===========================================================================

import {
  buildMealPrompt,
  dishBudgetFor,
  type MergedEater,
  parseGeneratedMeal,
} from "./meal_generation.ts";
import { asksForASecondDish, mergeDishBonus } from "./household_portions.ts";
import {
  bestMergePair,
  MERGE_SHAPE_NOT_HONOURED,
  mergeMaterialShown,
  MERGE_MEMBER_AWAY_ALL_WINDOW,
  observeMergeShape,
} from "./household_merge.ts";

/** 3 moments. Le plafond de base est donc 3 × jours, à la main. */
const THREE_MEALS = [
  { slot: "breakfast" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];
/** 5 jours. Plafond de base attendu: 15. Écrit ici, pas calculé. */
const FIVE_DAYS = ["wed", "thu", "fri", "sat", "sun"];
const BASE_CAP_15 = 15;

const PARSE_BASE = {
  doctrine: null,
  safetyConstraints: [],
  mode: "to_shop" as const,
  scope: "several_days" as const,
  pantry: [],
  beliefKeys: [],
  eatingRhythm: THREE_MEALS,
  daysToFill: FIVE_DAYS,
  awayDays: [],
  cookingTimeMin: null,
  composition: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null as MergedEater | null,
};

const PROMPT_BASE = {
  safetyConstraints: null,
  body: null,
  focusAxis: null,
  doctrineBlock: "",
  coachNoteBlock: null,
  protocolBlock: "",
  beliefKeys: [],
  goal: "health",
  situation: null,
  context: null,
  preferences: null,
  mode: "to_shop" as const,
  scope: "several_days" as const,
  pantry: [],
  cookDays: [],
  todayToken: "wed",
  today: null,
  country: null,
  daysToFill: FIVE_DAYS,
  eatingRhythm: THREE_MEALS,
  awayDays: [],
  slot: null,
  servings: 4,
  fixedIntakes: [],
  dayProperties: [],
  merge: null as MergedEater | null,
};

function prepPayload(servingsMade: unknown) {
  return {
    id: "prep_solo_pasta",
    title: "Tuna pasta for one",
    servings_made: servingsMade,
    ingredients: [{ term: "pasta", quantity: "100 g" }],
    method: "Boil the pasta, fold the tuna in.",
    cook_on: "wed",
    active_minutes: 10,
    total_minutes: 15,
  };
}

/** Un plat qui PRÉLÈVE sur la préparation ci-dessus. */
function dishUsingPrep(over: Record<string, unknown> = {}) {
  return {
    title: "Tuna pasta bowl",
    day: "wed",
    slot: "dinner",
    ingredients: [{ term: "parsley", quantity: "a handful" }],
    method: "Reheat and serve.",
    why: "Because it works.",
    uses: [{ preparation_id: "prep_solo_pasta", servings: 1 }],
    ...over,
  };
}

function plainDish(over: Record<string, unknown> = {}) {
  return {
    title: "Household stew",
    day: "wed",
    slot: "dinner",
    ingredients: [{ term: "beef", quantity: "600 g" }],
    method: "Simmer.",
    why: "Because it works.",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 7.1 — LA GARDE DE PRÉPARATION: UNE PORTION, ÇA DÉPEND DE QUI MANGE
// ---------------------------------------------------------------------------

Deno.test("SANS FUSION, une préparation de PLUSIEURS portions passe", () => {
  // ⚠️ LE CAS QUI PASSE, ET IL EST ÉCRIT EN PREMIER. Une garde cassée refuse
  // tout et ressemble trait pour trait à une garde qui marche.
  const meal = parseGeneratedMeal({
    preparations: [prepPayload(4)],
    dishes: [dishUsingPrep()],
    shopping_list: [],
  }, PARSE_BASE);
  assertEquals(meal.preparations.length, 1);
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].uses.length, 1);
});

Deno.test("SANS FUSION, une préparation d'UNE portion reste jetée", () => {
  // La lane individuelle et la composition de foyer ordinaire ne bougent pas
  // d'un plat: une préparation d'une portion n'en est pas une, et afficher une
  // session de cuisine pour une assiette serait faux.
  const meal = parseGeneratedMeal({
    preparations: [prepPayload(1)],
    dishes: [dishUsingPrep()],
    shopping_list: [],
  }, PARSE_BASE);
  assertEquals(meal.preparations.length, 0);
  assert(meal.issues.some((i) => i.includes("servings_made must be > 1")));
  // ET LA CONSÉQUENCE MESURÉE EN RÉEL: le plat perd sa préparation et devient
  // un titre nu, rattaché à aucune session de cuisson.
  assert(meal.issues.some((i) => i.includes("unknown preparation")));
});

Deno.test("BARREAU ①, une préparation d'UNE portion reste jetée", () => {
  // « Do NOT propose separate dishes »: au premier barreau, la fusion ne change
  // RIEN au contrat de composition. Autoriser l'assiette solo ici ouvrirait la
  // porte que ① existe pour tenir fermée.
  const meal = parseGeneratedMeal({
    preparations: [prepPayload(1)],
    dishes: [dishUsingPrep()],
    shopping_list: [],
  }, { ...PARSE_BASE, merge: { shape: "one_dish", ownDishesShown: 6 } });
  assertEquals(meal.preparations.length, 0);
});

for (const shape of ["one_session", "separate_sessions"] as const) {
  Deno.test(`BARREAU ${shape}, la préparation d'UNE portion est GARDÉE`, () => {
    // ⚠️ C'EST LE CAS NOMINAL DE LA FUSION, ET IL ÉTAIT JETÉ. Mesuré le
    // 2026-08-12: le modèle a rendu `prep_zoe_tuna_pasta` avec
    // `servings_made: 1`, obéissant parfaitement à la consigne — et le parseur
    // l'a jeté, puis a jeté le lien du plat qui la citait.
    const meal = parseGeneratedMeal({
      preparations: [prepPayload(1)],
      dishes: [dishUsingPrep()],
      shopping_list: [],
    }, { ...PARSE_BASE, merge: { shape, ownDishesShown: 6 } });
    assertEquals(meal.preparations.length, 1);
    assertEquals(meal.preparations[0].servingsMade, 1);
    assertEquals(meal.dishes.length, 1);
    assertEquals(meal.dishes[0].uses.length, 1);
    assert(!meal.issues.some((i) => i.includes("unknown preparation")));
  });
}

Deno.test("MÊME SOUS FUSION, une préparation de ZÉRO portion tombe", () => {
  // Le plancher reste UNE portion. Une préparation qui ne nourrit personne
  // n'est pas un plat dédié, c'est une erreur de sortie — et la rendre ferait
  // afficher « fait 0 portion ».
  for (const bad of [0, -3, "beaucoup", null]) {
    const meal = parseGeneratedMeal({
      preparations: [prepPayload(bad)],
      dishes: [dishUsingPrep()],
      shopping_list: [],
    }, { ...PARSE_BASE, merge: { shape: "one_session", ownDishesShown: 6 } });
    assertEquals(meal.preparations.length, 0, `servings_made = ${bad}`);
  }
});

// ---------------------------------------------------------------------------
// 7.2 — LE PLAFOND DE PLATS CONNAÎT LA BOUCHE QU'ON LUI AJOUTE
// ---------------------------------------------------------------------------

/** N plats, tous distincts, tous valides. Le seul but est de déborder. */
function nDishes(n: number) {
  const days = FIVE_DAYS;
  const slots = ["breakfast", "lunch", "dinner"];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(plainDish({
      title: `Dish number ${i + 1}`,
      day: days[Math.floor(i / slots.length) % days.length],
      slot: slots[i % slots.length],
    }));
  }
  return out;
}

Deno.test("SANS FUSION, le plafond vaut moments × jours — 15, écrit à la main", () => {
  const { userMessage } = buildMealPrompt(PROMPT_BASE);
  assert(
    userMessage.includes(`at most ${BASE_CAP_15} dishes`),
    `la consigne n'annonce pas 15 plats:\n${userMessage.slice(0, 400)}`,
  );
  const meal = parseGeneratedMeal(
    { preparations: [], dishes: nDishes(20), shopping_list: [] },
    PARSE_BASE,
  );
  assertEquals(meal.dishes.length, BASE_CAP_15);
});

Deno.test("BARREAU ①, le plafond NE BOUGE PAS — ni au prompt, ni au parse", () => {
  // ⚠️ ÉCRIT NOIR SUR BLANC DANS `dishCapFor`: un budget ouvert pour rien est un
  // budget que le modèle « déborde poliment pour remplir ». Le premier barreau
  // ne demande AUCUN plat de plus.
  const merge = { shape: "one_dish" as const, ownDishesShown: 12 };
  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, merge });
  assert(userMessage.includes(`at most ${BASE_CAP_15} dishes`));
  const meal = parseGeneratedMeal(
    { preparations: [], dishes: nDishes(20), shopping_list: [] },
    { ...PARSE_BASE, merge },
  );
  assertEquals(meal.dishes.length, BASE_CAP_15);
});

Deno.test("BARREAUX ② ET ③, le plafond gagne EXACTEMENT ce qu'on montre", () => {
  // 15 de base + 4 plats propres montrés au modèle = 19. Les deux nombres sont
  // écrits ici, aucun n'est calculé par la fonction testée.
  for (const shape of ["one_session", "separate_sessions"] as const) {
    const merge = { shape, ownDishesShown: 4 };
    const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, merge });
    assert(
      userMessage.includes("at most 19 dishes"),
      `${shape}: la consigne n'annonce pas 19 plats`,
    );
    const meal = parseGeneratedMeal(
      { preparations: [], dishes: nDishes(25), shopping_list: [] },
      { ...PARSE_BASE, merge },
    );
    assertEquals(meal.dishes.length, 19, shape);
  }
});

Deno.test("BARREAU ② SANS MATIÈRE, il reste UN plat de plus — le « SECOND dish »", () => {
  // La consigne de forme réclame « a SECOND dish » même quand le plan personnel
  // ne montre aucun plat sur la fenêtre. Un bonus nul ferait retomber
  // exactement dans le défaut mesuré.
  const merge = { shape: "one_session" as const, ownDishesShown: 0 };
  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, merge });
  assert(userMessage.includes("at most 16 dishes"), userMessage.slice(0, 200));
});

Deno.test("LE BONUS EST BORNÉ PAR LE PLAFOND DE BASE — une bouche, pas trois", () => {
  // Une bouche de plus mange au plus ce qu'une bouche mange. 15 + 15 = 30, et
  // pas 15 + 400.
  const merge = { shape: "one_session" as const, ownDishesShown: 400 };
  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, merge });
  assert(userMessage.includes("at most 30 dishes"), userMessage.slice(0, 200));
});

Deno.test("LE PROMPT ET LE PARSE ANNONCENT LE MÊME NOMBRE, barreau par barreau", () => {
  // ⚠️ C'EST LE DÉFAUT D'ORIGINE, ET IL SERAIT PIRE EN PLUS GRAND: annoncer un
  // budget et en appliquer un autre. Le nombre est LU dans la consigne, puis
  // COMPTÉ sur la sortie — jamais dérivé deux fois de la même fonction.
  const cases: MergedEater[] = [
    { shape: "one_dish", ownDishesShown: 5 },
    { shape: "one_session", ownDishesShown: 3 },
    { shape: "separate_sessions", ownDishesShown: 7 },
  ];
  for (const merge of cases) {
    const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, merge });
    const announced = userMessage.match(/at most (\d+) dishes/);
    assert(announced, `aucun plafond annoncé pour ${merge.shape}`);
    const meal = parseGeneratedMeal(
      { preparations: [], dishes: nDishes(40), shopping_list: [] },
      { ...PARSE_BASE, merge },
    );
    assertEquals(
      meal.dishes.length,
      Number(announced![1]),
      `${merge.shape}: la consigne annonce ${announced![1]} plats et le parseur ` +
        `en garde ${meal.dishes.length}`,
    );
  }
});

Deno.test("LE BUDGET DE SESSIONS NE SUIT PAS LE BONUS DE FUSION", () => {
  // Le barreau ② promet mot pour mot « one session at the stove, two dishes out
  // of it ». Dériver le budget de sessions du plafond GONFLÉ contredirait la
  // consigne servie, dans le même message.
  const without = buildMealPrompt(PROMPT_BASE).userMessage;
  const with_ = buildMealPrompt({
    ...PROMPT_BASE,
    merge: { shape: "one_session", ownDishesShown: 6 },
  }).userMessage;
  const sessionsOf = (m: string) => m.match(/cooking sessions: at most (\d+)/)?.[1];
  assert(sessionsOf(without), "le budget de sessions a disparu de la consigne");
  assertEquals(sessionsOf(with_), sessionsOf(without));
});

Deno.test("`mergeDishBonus` — ① rend zéro, ②/③ rendent ce qu'on montre", () => {
  assertEquals(mergeDishBonus("one_dish", 6, 15), 0);
  assertEquals(mergeDishBonus("one_session", 6, 15), 6);
  assertEquals(mergeDishBonus("separate_sessions", 6, 15), 6);
  assertEquals(mergeDishBonus("one_session", 0, 15), 1);
  assertEquals(mergeDishBonus("one_session", 99, 15), 15);
  assertEquals(asksForASecondDish("one_dish"), false);
  assertEquals(asksForASecondDish("one_session"), true);
  assertEquals(asksForASecondDish("separate_sessions"), true);
});

Deno.test("LE BUDGET COMPTE CE QUE LE MODÈLE VOIT, pas ce qu'on avait sous la main", () => {
  // `MERGE_MATERIAL_CAP` coupe la matière; `mergeMaterialShown` est le seul
  // endroit qui le décide, et le budget lit SA sortie. Compter avant le `slice`
  // ouvrirait un budget pour des plats absents de la consigne.
  const many = Array.from({ length: MERGE_MATERIAL_CAP + 30 }, (_, i) => ({
    day: "wed",
    slot: "dinner",
    title: `Own dish ${i}`,
  }));
  const shown = mergeMaterialShown(many);
  assertEquals(shown.length, MERGE_MATERIAL_CAP);
  const block = buildMergeBlock({
    displayName: "Zoé",
    window: { startsOn: "2026-08-12", durationDays: 5 },
    shape: "one_session",
    dishes: many,
    // L'ANCRE NE COMPTE PAS DANS LE BUDGET, et le décor le prouve: le plan du
    // foyer porte des plats, et le nombre attendu ne bouge pas. `ownDishesShown`
    // ouvre de la place pour ce que la personne REPRISE apporte; le plan du
    // foyer est déjà dans le plafond de base.
    baseDishes: [{ day: "wed", slot: "dinner", title: "Gratin de courgettes" }],
    gaps: [],
  });
  assertEquals(
    bulletsAfter(block, "was going to eat over these days, on their own:").length,
    shown.length,
  );
});

Deno.test("`dishBudgetFor` sans fusion rend EXACTEMENT le plafond d'avant", () => {
  // La preuve que la lane individuelle n'a pas bougé se lit ici aussi: sans
  // bouche reprise, la couche ajoutée est l'identité.
  assertEquals(
    dishBudgetFor({
      scope: "several_days",
      rhythm: THREE_MEALS,
      daysToFill: 5,
      merge: null,
    }),
    BASE_CAP_15,
  );
  assertEquals(
    dishBudgetFor({ scope: "day", rhythm: THREE_MEALS, daysToFill: 5, merge: null }),
    3,
  );
});

// ---------------------------------------------------------------------------
// 7.3 — LE BARREAU EST UNE CONSIGNE, ET QUELQU'UN LA VÉRIFIE
// ---------------------------------------------------------------------------

Deno.test("② HONORÉ — une préparation d'UNE portion est la marque du plat dédié", () => {
  // ⚠️ LE CAS QUI PASSE, EN PREMIER.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [{ day: "wed", slot: "dinner" }, { day: "wed", slot: "dinner" }],
    preparations: [{ servingsMade: 4 }, { servingsMade: 1 }],
    // C3 ⑥ — SON SEUL REPAS de la fenêtre, et il porte un plat à part.
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.honoured, true);
  assertEquals(seen.observed, "dedicated_dish");
  assertEquals(seen.requested, "one_session");
  assertEquals(seen.meals, { atTable: 1, dedicated: 1, fromCommonPot: 0 });
  assert(seen.marks.includes("single_serving_preparation:1"));
});

Deno.test("③ HONORÉ — deux plats au MÊME jour et au MÊME moment", () => {
  const seen = observeMergeShape({
    shape: "separate_sessions",
    dishes: [
      { day: "wed", slot: "dinner" },
      { day: "wed", slot: "dinner" },
      { day: "thu", slot: "dinner" },
    ],
    preparations: [{ servingsMade: 4 }],
    // Elle ne mange ici que mercredi soir: jeudi n'est pas un de ses repas, et
    // le compter la ferait déclarer servie à la casserole commune un soir où
    // elle n'est pas là.
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.honoured, true);
  assertEquals(seen.observed, "dedicated_dish");
  assert(seen.marks.includes("parallel_dishes:wed/dinner"));
});

Deno.test("LE MENSONGE MESURÉ — ③ demandé, casserole commune servie", () => {
  // ⚠️ REJOUE EXACTEMENT LE RUN DU 2026-08-12: barreau ③ demandé, quinze plats
  // rendus, un par case, aucune préparation d'une portion. L'archive disait
  // `separate_sessions`, le plan disait le contraire.
  const seen = observeMergeShape({
    shape: "separate_sessions",
    dishes: FIVE_DAYS.flatMap((day) =>
      ["breakfast", "lunch", "dinner"].map((slot) => ({ day, slot }))
    ),
    preparations: [{ servingsMade: 5 }, { servingsMade: 4 }],
    eaterCells: FIVE_DAYS.flatMap((day) =>
      ["breakfast", "lunch", "dinner"].map((slot) => ({ day, slot }))
    ),
  });
  assertEquals(seen.honoured, false);
  assertEquals(seen.observed, "common_pot");
  assertEquals(seen.meals, { atTable: 15, dedicated: 0, fromCommonPot: 15 });
  assertEquals(seen.marks, []);
});

Deno.test("① N'EST JAMAIS DÉCLARÉ NON HONORÉ", () => {
  // Sa promesse est « pas de second plat », et le budget ne lui en laisse
  // aucune place. Y pousser un constat ferait dépendre le barreau le plus
  // fréquent d'une heuristique dont un faux positif salirait toutes les
  // compositions ordinaires.
  const seen = observeMergeShape({
    shape: "one_dish",
    dishes: [{ day: "wed", slot: "dinner" }],
    preparations: [{ servingsMade: 4 }],
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.honoured, true);
  assertEquals(seen.observed, "common_pot");
});

Deno.test("UN MOMENT NON DÉCLARÉ NE FABRIQUE PAS DE MARQUE", () => {
  // Deux plats sans créneau peuvent être le déjeuner et le dîner du même jour.
  // Une marque inventée ferait déclarer honoré un plan qui ne l'est pas — un
  // faux négatif est le seul dégât que ce constat peut causer.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [{ day: "wed", slot: null }, { day: "wed", slot: null }],
    preparations: [{ servingsMade: 4 }],
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.honoured, false);
  assertEquals(seen.marks, []);
});

// ---------------------------------------------------------------------------
// C3 ⑥ — LE CONSTAT DIT CE QUI EST, REPAS PAR REPAS
//
// MESURÉ: `observed = marks.length > 0 ? "dedicated_dish" : "common_pot"` — UNE
// marque suffisait. Un plat parallèle sur neuf créneaux rendait `ok: true`,
// c'est-à-dire qu'un plan où la personne reprise mange la casserole commune
// HUIT fois sur neuf, malgré le conflit de direction de service qui avait fait
// descendre le barreau, passait pour un succès.
// ---------------------------------------------------------------------------

Deno.test("C3 ⑥ — UN PLAT À ELLE SUR NEUF REPAS N'EST PLUS UN SUCCÈS", () => {
  const cells = ["wed", "thu", "fri"].flatMap((day) =>
    ["breakfast", "lunch", "dinner"].map((slot) => ({ day, slot }))
  );
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      ...cells,
      // LE seul plat dédié: mercredi soir, et rien d'autre.
      { day: "wed", slot: "dinner" },
    ],
    preparations: [{ servingsMade: 4 }, { servingsMade: 1 }],
    eaterCells: cells,
  });
  assertEquals(seen.meals, { atTable: 9, dedicated: 1, fromCommonPot: 8 });
  assertEquals(seen.observed, "some_meals_dedicated");
  assertEquals(
    seen.honoured,
    false,
    "un plat à elle sur neuf repas passe encore pour un barreau honoré",
  );
  // Les marques restent: le constat dit AUSSI ce qu'il a trouvé.
  assert(seen.marks.includes("parallel_dishes:wed/dinner"));
  assert(seen.marks.includes("single_serving_preparation:1"));
});

Deno.test("C3 ⑥ — TOUS SES REPAS SERVIS À PART: le cas qui PASSE", () => {
  // ⚠️ SANS CE CAS, LE CONSTAT SERAIT UNE GARDE QUI COUPE TOUT — et une garde
  // qui refuse tout ressemble trait pour trait à une garde qui marche.
  const cells = [
    { day: "wed", slot: "dinner" },
    { day: "thu", slot: "dinner" },
  ];
  const seen = observeMergeShape({
    shape: "separate_sessions",
    dishes: [...cells, ...cells],
    preparations: [{ servingsMade: 4 }, { servingsMade: 1 }, { servingsMade: 1 }],
    eaterCells: cells,
  });
  assertEquals(seen.meals, { atTable: 2, dedicated: 2, fromCommonPot: 0 });
  assertEquals(seen.observed, "dedicated_dish");
  assertEquals(seen.honoured, true);
});

Deno.test("C3 ⑥ — SES ABSENCES NE COMPTENT PAS COMME DES REPAS DE CASSEROLE", () => {
  // Une bouche absente jeudi midi ne « mange pas la casserole commune » ce
  // midi-là: elle ne mange pas. Compter la case ferait un faux négatif sur
  // chaque absence partielle — et le plan serait déclaré trahi sans raison.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      { day: "wed", slot: "dinner" },
      { day: "wed", slot: "dinner" },
      { day: "thu", slot: "lunch" },
      { day: "thu", slot: "dinner" },
    ],
    preparations: [{ servingsMade: 3 }, { servingsMade: 1 }],
    // Elle n'est là QUE mercredi soir.
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.meals, { atTable: 1, dedicated: 1, fromCommonPot: 0 });
  assertEquals(seen.honoured, true);
});

Deno.test("C3 ⑥ — AUCUN REPAS À ELLE: le constat se tait au lieu de mentir", () => {
  // `merge_member_away_all_window` intercepte ce cas bien avant le modèle. S'il
  // arrivait quand même, déclarer la consigne trahie sur quelqu'un qui ne mange
  // ici aucun repas serait un fait faux.
  const seen = observeMergeShape({
    shape: "separate_sessions",
    dishes: [{ day: "wed", slot: "dinner" }],
    preparations: [{ servingsMade: 4 }],
    eaterCells: [],
  });
  assertEquals(seen.meals, { atTable: 0, dedicated: 0, fromCommonPot: 0 });
  assertEquals(seen.honoured, true);
  assertEquals(seen.observed, "common_pot");
});

Deno.test("C3 ⑥ — LES COMPTES PARTENT DANS `generated_from`, pas seulement l'étiquette", async () => {
  // `observed` est un mot, et un mot se réécrit. Les trois nombres sont ce qui
  // reste lisible sur un plan écrit avant la prochaine rédaction du constat.
  const src = await generatorSource();
  assert(
    /meals:\s*\{\s*\n\s*at_table: mergeShape\.meals\.atTable/.test(src),
    "les comptes bruts ne sont plus archivés: `common_pot` et « un plat à elle " +
      "sur neuf repas » redeviennent le même fait.",
  );
  assert(
    src.includes("eaterCells: mergedEaterCells"),
    "le dénominateur n'est plus passé au constat: `atTable` retombe à 0 et " +
      "TOUTE fusion redevient honorée — la garde désarmée en silence.",
  );
  assert(
    /const mergedEaterCells = merge === null \? \[\] : memberMealCells\(\{/.test(src),
    "les repas de la personne reprise ne sont plus résolus par la fonction de " +
      "présence: un second parcours finirait par compter des repas que la " +
      "casserole ne compte pas.",
  );
});

Deno.test("LE CONSTAT EST BRANCHÉ, ET IL S'ÉCRIT DANS `generated_from`", async () => {
  // Un constat calculé et jamais poussé serait exactement la garde construite
  // puis silencieusement débranchée que ce dépôt paie en boucle.
  const src = await generatorSource();
  // ⚠️ LA CONDITION EST ÉPINGLÉE, PAS SEULEMENT LE NOM DE LA FONCTION. Une
  // mutation l'a prouvé nécessaire: `ladder === null || true ? null : …` laisse
  // l'appel dans la source, débranche le constat, et un test qui ne cherche que
  // « `observeMergeShape(` apparaît » reste vert. C'est la garde construite puis
  // silencieusement débranchée, écrite en une mutation.
  assert(
    /const mergeShape = ladder === null \? null : observeMergeShape\(\{/.test(src),
    "le générateur n'observe plus la forme rendue — ou ne l'observe plus que " +
      "sous une condition qui n'est pas « il y a eu fusion ». L'archive peut de " +
      "nouveau dire `separate_sessions` sur un plan servi depuis la casserole " +
      "commune.",
  );
  assert(
    /if \(mergeShape !== null && !mergeShape\.honoured\) \{/.test(src),
    "l'`issue` n'est plus poussée sur le seul cas qui la mérite: soit le " +
      "mensonge redevient invisible, soit toute fusion honorée en porte une.",
  );
  assert(
    src.includes(`\${${"MERGE_SHAPE_NOT_HONOURED"}}:`),
    `l'issue poussée ne porte plus le motif partagé \`${MERGE_SHAPE_NOT_HONOURED}\`: ` +
      "un motif recopié à la main diverge du jour où on le renomme.",
  );
  assert(
    /honoured:\s*\{/.test(src),
    "la forme OBTENUE n'est plus archivée à côté de la forme DEMANDÉE.",
  );
  const observedAt = src.indexOf("observeMergeShape({");
  const writeAt = src.indexOf('"write_student_meal_plan"');
  assert(observedAt >= 0 && writeAt >= 0, "marqueurs introuvables — test à réviser");
  assert(
    observedAt < writeAt,
    "le constat est fait APRÈS l'écriture: il ne peut plus entrer dans la ligne " +
      "qu'il décrit.",
  );
});

// ---------------------------------------------------------------------------
// 7.4 — LES DEUX DÉFAUTS MÉCANIQUES
// ---------------------------------------------------------------------------

Deno.test("LES ONZE REFUS DE FUSION SE COMPTENT TOUS", async () => {
  // ⚠️ `merge_member_away_all_window` était le SEUL refus muet. Vérifié dans
  // les logs du runtime le 2026-08-12: trois lignes `merge_refused` pour les
  // autres motifs, aucune pour celui-là — et c'est le refus qui tombe sur une
  // personne QUE LE MAÎTRE VENAIT DE DÉSIGNER.
  const src = await generatorSource();
  // ⚠️ C3 ④ — LE REFUS EST RENDU PAR UNE CONSTANTE PARTAGÉE depuis que le
  // LECTEUR de propositions le prédit: le littéral n'est plus dans ce fichier,
  // et un test qui le chercherait encore serait rouge sur un produit sain.
  assertEquals(MERGE_MEMBER_AWAY_ALL_WINDOW, "merge_member_away_all_window");
  const at = src.indexOf("error: MERGE_MEMBER_AWAY_ALL_WINDOW");
  assert(at >= 0, "le refus a disparu — test à réviser");
  // Le log doit être DANS la branche, donc juste avant la réponse: on regarde
  // les 900 caractères qui précèdent la réponse HTTP de ce refus.
  const around = src.slice(Math.max(0, at - 900), at + 400);
  assert(
    around.includes("keel.household_meal.merge_refused"),
    "ce refus ne se journalise plus sous le MÊME tag que les dix autres: un " +
      "décompte de refus redevient faux, et personne ne le verra.",
  );
});

Deno.test("AUCUN COMMENTAIRE DU GÉNÉRATEUR NE NOMME UN TEST QUI N'EXISTE PAS", async () => {
  // ⚠️ MESURÉ: un commentaire renvoyait à `household_merge_position_test.ts`,
  // fichier qui n'a jamais existé. Un commentaire qui ment sur l'existence de
  // sa propre garde est pire qu'une absence de commentaire — il fait croire la
  // garde posée à qui vient vérifier, et c'est le seul lecteur qui compte.
  //
  // LA SOURCE EST LUE AVEC SES COMMENTAIRES, exprès: c'est EUX qu'on audite.
  const raw = await Deno.readTextFile(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  );
  const named = new Set(raw.match(/[A-Za-z0-9_]+_test\.ts/g) ?? []);
  assert(named.size > 0, "aucun test nommé — l'audit ne prouverait rien");
  for (const name of named) {
    let found = false;
    for (const dir of ["_shared/keel/", "generate-household-meal-v1/"]) {
      try {
        await Deno.stat(new URL(`${dir}${name}`, FUNCTIONS_DIR));
        found = true;
        break;
      } catch { /* ailleurs, ou nulle part */ }
    }
    assert(found, `le générateur nomme \`${name}\`, qui n'existe pas.`);
  }
});

Deno.test("LA LANE INDIVIDUELLE NE PEUT PAS HÉRITER D'UN BUDGET DE FUSION", async () => {
  // ⚠️ LE PARAMÈTRE EST REQUIS PRÉCISÉMENT POUR ÇA: `generate-meal-v1` doit DIRE
  // qu'il n'a personne à reprendre. Un champ facultatif l'aurait laissé muet, et
  // un jour quelqu'un aurait branché un `merge` sur la mauvaise lane sans que
  // rien n'échoue — un élève seul avec un budget de deux bouches.
  //
  // LES DEUX BOUTS SONT VÉRIFIÉS: la consigne ET le parseur. Un seul des deux
  // suffirait à rouvrir la divergence que ce lot ferme.
  const src = stripComments(
    await Deno.readTextFile(new URL("generate-meal-v1/index.ts", FUNCTIONS_DIR)),
  );
  assertEquals(
    (src.match(/merge:\s*null/g) ?? []).length,
    2,
    "la lane individuelle ne passe plus `merge: null` aux DEUX appels " +
      "(`buildMealPrompt` et `parseGeneratedMeal`) — ou en passe autre chose. " +
      "Son plafond et sa garde de préparation ne doivent pas bouger d'un plat.",
  );
  // ⚠️ LA NÉGATION PORTE SUR TOUT L'ESPACE, PAS APRÈS LUI. Écrit
  // `/merge:\s*(?!null)/`, le moteur fait reculer `\s*` jusqu'à zéro caractère
  // et la sentinelle regarde « ␣null », qui ne commence pas par `null`: la
  // garde passait sur sa propre valeur nominale. Mesuré ici même.
  assert(
    !/merge:(?!\s*null)/.test(src),
    "la lane individuelle passe désormais une bouche reprise: elle n'a pas de " +
      "table qui a dimensionné une casserole, et son plan EST celui de la " +
      "personne. Il n'y a rien à y fusionner.",
  );
});

// ===========================================================================
// 8. L5 — LE CHOIX DE LA PAIRE, EXTRAIT ET PARTAGÉ
//
// ⚠️ CE TEST MANQUAIT, ET UNE MUTATION L'A PROUVÉ. La règle « on garde la paire
// dont la fenêtre FUSIONNABLE est la plus longue » vivait dans une boucle du
// générateur, sans décor à plus d'une paire: inverser la comparaison ne faisait
// tomber aucun test. Depuis L5 elle est partagée avec la PROPOSITION (D10), ce
// qui rend l'erreur cohérente des deux côtés — donc invisible, et pas moins
// fausse: le maître se verrait proposer un jour au lieu de cinq.
// ===========================================================================

Deno.test("LA PAIRE RETENUE EST LA PLUS LONGUE À FUSIONNER, pas la première", () => {
  const best = bestMergePair({
    // Deux plans du foyer vivants: le COURANT et le SUIVANT — c'est ce que la
    // contrainte d'exclusion autorise, et c'est le cas réel.
    householdPlans: [
      { id: "house-now", startsOn: "2026-08-10", durationDays: 7 },
      { id: "house-next", startsOn: "2026-08-17", durationDays: 7 },
    ],
    // Deux plans personnels adjacents. Le premier ne partage plus qu'UN jour
    // avec le plan courant (le pivot tombe le 16); le second en partage SEPT
    // avec le plan suivant. Les deux nombres sont écrits ici, à la main.
    personalPlans: [
      { id: "own-a", startsOn: "2026-08-10", durationDays: 7 },
      { id: "own-b", startsOn: "2026-08-17", durationDays: 7 },
    ],
    today: "2026-08-16",
  });
  assert(best.ok, "aucune paire trouvée — test à réviser");
  if (!best.ok) return;
  assertEquals(best.personal.id, "own-b");
  assertEquals(best.household.id, "house-next");
  assertEquals(best.window.window.durationDays, 7);
});

Deno.test("LE REFUS RENDU EST LE PLUS INFORMATIF DES DEUX", () => {
  // « Tout est déjà passé » en dit plus que « rien en commun »: les deux plans
  // se touchent bien, et c'est le pivot qui a tranché. Rendre `disjoint` ici
  // enverrait le maître vérifier des dates qui sont justes.
  const out = bestMergePair({
    householdPlans: [
      { id: "house-old", startsOn: "2026-08-01", durationDays: 5 },
      { id: "house-far", startsOn: "2026-09-01", durationDays: 5 },
    ],
    personalPlans: [{ id: "own", startsOn: "2026-08-01", durationDays: 5 }],
    today: "2026-08-16",
  });
  assertEquals(out.ok, false);
  if (!out.ok) assertEquals(out.refusal, MERGE_WINDOW_ALL_PAST);
});

Deno.test("SANS AUCUNE PAIRE POSSIBLE, le refus reste `disjoint`", () => {
  // Le cas dégénéré — aucun plan du foyer — ne doit pas rendre un motif qui
  // parle du passé: il n'y a rien à comparer, pas un calendrier à vérifier.
  const out = bestMergePair({
    householdPlans: [],
    personalPlans: [{ id: "own", startsOn: "2026-08-10", durationDays: 7 }],
    today: "2026-08-10",
  });
  assertEquals(out.ok, false);
  if (!out.ok) assertEquals(out.refusal, MERGE_WINDOWS_DISJOINT);
});
