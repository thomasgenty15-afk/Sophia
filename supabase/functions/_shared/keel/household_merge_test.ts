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
import type { DietaryRegime } from "./dietary_regime.ts";

// Le banc de propriété de D1 balaie des décalages de jours: `addDays` est la
// MÊME arithmétique que le module sous test, pas une seconde.
import { addDays } from "./meal_plan_window.ts";

import {
  buildMergeBlock,
  conflictAxes,
  MERGE_ANCHOR_INSTRUCTION,
  MERGE_MATERIAL_USE_INSTRUCTION,
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
// C5 ② — la MÊME fonction de recouvrement que le générateur, pas une seconde.
import { plansOverlap } from "./household_hand.ts";
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
    eatingSlots: null,
    habits: [],
    habitNote: null,
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
  // ⚠️ QUATRE LIGNES ONT DISPARU LE 2026-08-18, ET ELLES DISAIENT LA MÊME
  // CHOSE À UN MOT PRÈS. `recomposition` (full/moderate/larger), `health`
  // (balanced/balanced/larger) et `maintenance` (tout équilibré) se replient
  // ici. Seule `performance` demandait autre chose — « larger starch share
  // AROUND TRAINING », c'est-à-dire une consigne conditionnée à des jours
  // d'entraînement que le produit ne collecte pas, donc appliquée tous les
  // jours. Elle est perdue, exprès.
  assertEquals(demandsOf("maintenance"), {
    protein: "balanced",
    starch: "balanced",
    vegetables: "balanced",
  });
});

// ⚠️ CE TEST A CHANGÉ DE SUJET LE 2026-08-18. Il posait `goal: "muscle_gain"`
// sur un mineur et attendait AUCUNE demande — c'était la contre-épreuve de
// l'écrasement inconditionnel de `servingDirectionFor`, et cet écrasement
// était le défaut: la migration du 13/08 autorisait `muscle_gain` sur un ado,
// et le moteur l'ignorait. Un mineur AVEC objectif demande maintenant ce que
// son objectif demande. Ce qui reste vrai — et qui est le repli, pas la
// règle — c'est qu'un mineur SANS objectif ne demande rien.
Deno.test("un mineur SANS objectif ne demande rien: sa direction est une TAILLE", () => {
  // « child-size share of the same dish » — une taille, jamais une
  // orientation. Un enfant sans direction est donc servable de n'importe
  // quelle casserole, et le fusionner reste toujours au barreau ①.
  assertEquals(servingDemandsFor(memberOf({ ageState: "minor", goal: null })), {
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
      memberOf({ ageState: "unknown", goal: "maintenance" }),
    ]
  ) {
    const brief = buildPortionBrief([member], "one_dish", 0, 1);
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
    incoming: demandsOf("maintenance"),
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
      table: [demandsOf("fat_loss"), demandsOf("maintenance")],
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
  // `fat_loss` est la seule direction qui reste à demander « generous
  // vegetables » — le repli du 2026-08-18 a emporté `recomposition` et
  // `health`, qui le demandaient aussi.
  assertEquals(
    servingConflicts([noVegDemand], demandsOf("fat_loss")),
    // `fat_loss` demande AUSSI « full protein » là où la table n'offre que
    // l'équilibre: deux conflits, pas un. Le cas d'origine (`health`) ne
    // touchait que les légumes, et il n'existe plus.
    ["protein:full_above_table", "vegetables:larger_above_table"],
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

/**
 * C6 — LE CONFLIT EXACT DU RUN RÉEL DU 2026-08-12, tel que `mergeLadder` l'a
 * nommé. DEUX axes: c'est ce qui rendait « un seul plat dédié » absurde.
 */
const TWO_AXIS_CONFLICT = [
  "protein:larger_above_table",
  "starch:larger_above_table",
];
/** Ses NEUF repas de la fenêtre — le dénominateur du constat de forme (C3 ⑥). */
const DEDICATED_9 = 9;

Deno.test("le bloc nomme la personne, les dates, et ce qu'elle allait manger", () => {
  const block = buildMergeBlock({
    displayName: "Tom",
    window: { startsOn: WED, durationDays: 3 },
    shape: "one_session",
    dishes: MATERIAL,
    baseDishes: BASE_MATERIAL,
    gaps: [],
    // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
    dedicatedDishes: DEDICATED_9,
    conflicts: TWO_AXIS_CONFLICT,
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
    // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
    dedicatedDishes: DEDICATED_9,
    conflicts: TWO_AXIS_CONFLICT,
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
      // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
      dedicatedDishes: DEDICATED_9,
      conflicts: TWO_AXIS_CONFLICT,
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
      // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
      dedicatedDishes: DEDICATED_9,
      conflicts: TWO_AXIS_CONFLICT,
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
      // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
      dedicatedDishes: DEDICATED_9,
      conflicts: TWO_AXIS_CONFLICT,
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
    // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
    dedicatedDishes: DEDICATED_9,
    conflicts: TWO_AXIS_CONFLICT,
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
    // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
    dedicatedDishes: DEDICATED_9,
    conflicts: TWO_AXIS_CONFLICT,
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
    // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
    dedicatedDishes: DEDICATED_9,
    conflicts: TWO_AXIS_CONFLICT,
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
    // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
    dedicatedDishes: DEDICATED_9,
    conflicts: TWO_AXIS_CONFLICT,
  });
  assert(full.includes(OWN_HEADER));
  assert(full.includes(BASE_HEADER));
});

// ---------------------------------------------------------------------------
// 5.2 — C6: LE COMPTE SUIT LE CONFLIT, ET LA MATIÈRE S'OUVRE
//
// ⚠️ LES TROIS MESURES, DANS L'ORDRE:
//   ① avant C1 — 15 créneaux sur 15 au plan personnel, 0 titre du foyer;
//   ② après C1 — 9 titres du foyer sur 9, 0 du plan personnel, 1 « neuf »;
//   ③ et ce plat « neuf » était le PETIT-DÉJEUNER DU FOYER en portion simple,
//      avec ZÉRO aliment de son plan (bœuf, porc, agneau, steak) — ni dans les
//      plats, ni dans les 37 lignes de courses.
// ---------------------------------------------------------------------------

const C6_BLOCK = (
  shape: "one_dish" | "one_session" | "separate_sessions",
  dedicatedDishes = DEDICATED_9,
) =>
  buildMergeBlock({
    displayName: "Zoé",
    window: { startsOn: WED, durationDays: 3 },
    shape,
    dishes: MATERIAL,
    baseDishes: BASE_MATERIAL,
    gaps: [],
    dedicatedDishes,
    conflicts: shape === "one_dish" ? [] : TWO_AXIS_CONFLICT,
  });

Deno.test("C6 — LE NOMBRE DE PLATS DÉDIÉS EST ÉCRIT, ET CE N'EST PLUS « UN »", () => {
  // ⚠️ LE DÉFAUT MESURÉ. « ADD ONE dish for them » était lu « un pour la
  // fenêtre » — une lecture parfaitement raisonnable — et la personne reprise a
  // mangé le plat du foyer à 8 créneaux sur 9, malgré un conflit de direction
  // de service sur DEUX axes.
  for (const shape of ["one_session", "separate_sessions"] as const) {
    const block = C6_BLOCK(shape);
    assert(
      block.includes("at EVERY meal they eat here"),
      `${shape}: la consigne ne dit plus que le plat dédié est PAR REPAS.`,
    );
    assert(
      block.includes(`${DEDICATED_9} dishes for`),
      `${shape}: le NOMBRE n'est pas écrit. « at EVERY meal » sans chiffre se ` +
        `relit « une fois, quelque part » — c'est le défaut mesuré.`,
    );
    assert(
      block.includes("NOT one dish for the whole window"),
      `${shape}: rien ne démentit la lecture qui a été faite du texte de C1.`,
    );
    assert(
      block.includes("one at each of their meals"),
      `${shape}: rien ne rattache le nombre aux repas dont il vient.`,
    );
    assert(
      !block.includes("ADD ONE dish"),
      `${shape}: la formule mesurée comme ambiguë est encore là.`,
    );
  }
  // ET LE NOMBRE EST CELUI QU'ON PASSE, jamais une constante du bloc: un test
  // paramétré par sa propre constante reste vert quand on change la constante.
  assert(C6_BLOCK("one_session", 4).includes("4 dishes for"));
  assert(!C6_BLOCK("one_session", 4).includes("9 dishes for"));
});

Deno.test("C6 — LA MATIÈRE DOIT ÊTRE OUVERTE, ET LES AXES DU CONFLIT SONT NOMMÉS", () => {
  // ⚠️ CE QUE ÇA RÉPARE, MESURÉ: le seul plat « neuf » d'une fusion réelle
  // était « Greek yogurt bowls … for Zoe » — le petit-déjeuner DU FOYER servi
  // en portion simple. Aucun aliment de son plan n'apparaissait nulle part, ni
  // dans les plats, ni dans les 37 lignes de courses. Le bloc montrait une
  // liste que RIEN n'obligeait à ouvrir.
  for (const shape of ["one_session", "separate_sessions"] as const) {
    const block = C6_BLOCK(shape);
    assert(
      block.includes(MERGE_MATERIAL_USE_INSTRUCTION),
      `${shape}: rien ne dit d'aller CHERCHER dans la liste de matière.`,
    );
    assert(
      block.includes("put those foods in the shopping list"),
      `${shape}: rien ne fait entrer ses aliments dans les courses — c'est là ` +
        `que l'absence a été mesurée, 37 lignes sur 37.`,
    );
    // LES AXES DU CONFLIT, EN PROSE, ET DANS L'ORDRE DU PRODUIT.
    assert(
      block.includes("the protein and the starch"),
      `${shape}: les axes qui ont fait descendre le barreau ne sont pas dits, ` +
        `donc rien ne nomme CE QUI doit être différent dans son plat.`,
    );
    assert(
      block.includes("the same food in a smaller bowl"),
      `${shape}: le plat du foyer en portion simple reste une réponse ` +
        `acceptable à « fais-lui un plat ».`,
    );
  }
});

Deno.test("C6 — L'ANCRE SURVIT AU TROISIÈME COUP DE BALANCIER (le cas qui passe)", () => {
  // ⚠️ UN TROISIÈME COUP DE BALANCIER SERAIT PIRE QUE LES DEUX PRÉCÉDENTS,
  // parce qu'il aurait l'air d'une correction. La précision de C6 vient EN
  // DERNIER, donc à la place la plus contraignante: elle doit être strictement
  // additive et nominative, jamais une permission de reprendre la table.
  const block = C6_BLOCK("one_session");
  assert(block.includes(MERGE_ANCHOR_INSTRUCTION));
  assert(block.includes("THE HOUSEHOLD'S PLAN IS THE PLAN"));
  assert(block.includes("never serve Zoé's dishes to"));
  // Le plan du foyer reste la DERNIÈRE liste de plats du bloc.
  assert(
    block.lastIndexOf("- wed dinner: Gratin de courgettes") >
      block.lastIndexOf("- wed dinner: Curry de pois chiches"),
    "le plan du foyer n'est plus la dernière liste: C1 est défait",
  );
  // Et la précision de C6 arrive APRÈS l'ancre, jamais avant.
  assert(
    block.indexOf(MERGE_ANCHOR_INSTRUCTION) <
      block.indexOf(MERGE_MATERIAL_USE_INSTRUCTION),
    "la précision de C6 est passée AVANT l'ancre: c'est l'ancre qui devient " +
      "le mot de la fin, et le plat dédié qui disparaît — le défaut mesuré.",
  );
  // LES TROIS PHRASES QUI EMPÊCHENT LE TROISIÈME COUP.
  assert(block.includes("ADDED to"));
  assert(block.includes("they never replace one"));
  assert(block.includes("nobody else eats them"));
  assert(block.includes("Everyone else keeps the household's dishes"));
});

Deno.test("C6 — BARREAU ①: le bloc est BYTE-IDENTIQUE, quoi qu'on lui passe", () => {
  // ⚠️ LE CAS QUI PASSE, ET IL A DEUX MOITIÉS. ① ne demande AUCUN plat dédié
  // (« Never turn it into a second dish »), donc il n'a rien à défendre contre
  // l'ancre: le paragraphe de C6 doit être absent. Et il doit l'être MÊME si un
  // appelant se trompe de nombre — la règle « ce barreau réclame-t-il un plat »
  // est LUE (`asksForASecondDish`), pas recopiée.
  assertEquals(C6_BLOCK("one_dish", 0), C6_BLOCK("one_dish", 9));
  assert(!C6_BLOCK("one_dish", 9).includes(MERGE_MATERIAL_USE_INSTRUCTION));
  assert(!C6_BLOCK("one_dish", 9).includes("at EVERY meal they eat here"));
  // ET LE CAS QUI PASSE DE L'AUTRE CÔTÉ: sans lui, un bloc qui n'affiche plus
  // jamais le paragraphe serait indiscernable d'un ① correct.
  assert(C6_BLOCK("one_session", 9).includes(MERGE_MATERIAL_USE_INSTRUCTION));
});

Deno.test("C6 — `conflictAxes` déduplique, et suit l'ordre du produit", () => {
  // Deux motifs sur le même axe ne font qu'un axe; l'ordre vient de
  // `SERVING_AXES`, jamais de l'ordre d'arrivée — sinon le même prompt
  // nommerait les axes dans deux ordres différents.
  assertEquals(
    conflictAxes(["starch:larger_above_table", "protein:unreadable"]),
    ["protein", "starch"],
  );
  assertEquals(
    conflictAxes(["starch:larger_above_table", "starch:unreadable"]),
    ["starch"],
  );
  assertEquals(conflictAxes([]), []);
  // UN JETON QUI NE NOMME AUCUN AXE N'EN INVENTE PAS UN.
  assertEquals(conflictAxes(["nonsense", "bavardage:larger_above_table"]), []);
  assertEquals(
    conflictAxes(["vegetables:full_above_table"]),
    ["vegetables"],
  );
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

Deno.test("C6 — LE NOMBRE DE PLATS DÉDIÉS EST CALCULÉ UNE FOIS, LU DEUX FOIS", async () => {
  // ⚠️ LE MODULE PUR NE PROUVE QUE LA MOITIÉ, ENCORE. `buildMergeBlock` peut
  // annoncer NEUF plats dédiés pendant que `dishBudgetFor` n'en ouvre que six:
  // le prompt réclamerait alors ce que son propre plafond interdit, et le
  // parseur jetterait les DERNIERS plats de la liste — c'est-à-dire ceux du
  // foyer, pas ceux de la personne reprise. C'est le défaut de L4, remis en
  // grand par C6. Un prompt n'a pas de compilateur; ce test est le compilateur.
  const src = await generatorSource();
  // ⚠️ RÉVISÉ PAR LE LOT B (2026-08-15), ET LA GARANTIE N'A PAS BOUGÉ D'UN
  // POUCE. L'expression épinglée lisait `ladder.shape` — le barreau BRUT.
  // Depuis que le mode de cuisson se DEMANDE, la forme réellement servie est
  // `cookingShape` (le barreau, plafonné par le choix), et c'est elle que la
  // consigne porte. Calculer le budget sur le barreau brut ouvrirait de la
  // place pour des plats qu'un plafond vient d'interdire: `dishCapFor` dit ce
  // qu'un modèle fait d'un budget ouvert — il « déborde poliment » pour le
  // remplir. Ce qui est tenu ici reste le fait décisif: le nombre se déduit des
  // REPAS de la personne reprise, et il est calculé UNE fois.
  assert(
    /const mergeDedicatedDishes = ladder === null\s*\?\s*0\s*:\s*dedicatedDishesFor\(\s*cookingShape,\s*mergedEaterCells\.length,?\s*\)/
      .test(src),
    "le nombre de plats dédiés ne se déduit plus des REPAS de la personne " +
      "reprise (`mergedEaterCells`, le dénominateur du constat de forme), " +
      "ou il est calculé sur le barreau BRUT au lieu de la forme SERVIE.",
  );
  // ── LES DEUX LECTEURS, ET C'EST LA MÊME VARIABLE ────────────────────────
  assert(
    /dedicatedDishes:\s*mergeDedicatedDishes/.test(src),
    "la CONSIGNE ne reçoit plus le nombre calculé.",
  );
  assert(
    /dedicatedDishesAsked:\s*mergeDedicatedDishes/.test(src),
    "le BUDGET ne reçoit plus le nombre calculé: la consigne réclamerait des " +
      "plats que le plafond refuse.",
  );
  // ── ET LES AXES DU CONFLIT VIENNENT DE L'ÉCHELLE, JAMAIS D'UNE SECONDE
  //    LECTURE DES DIRECTIONS DE SERVICE ───────────────────────────────────
  assert(
    /conflicts:\s*ladder\.conflicts/.test(src),
    "la consigne ne reçoit plus les axes que `mergeLadder` a nommés.",
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
  MEAL_PROMPT_VERSION,
  type MergedEater,
  parseGeneratedMeal,
} from "./meal_generation.ts";
// C8 ③ — les DEUX axes de version, lus ensemble: la décision de ce lot est de
// n'en bouger aucun, et une décision qu'aucun test ne tient n'est qu'un avis.
import { HOUSEHOLD_PROMPT_VERSION } from "./household_meal_generation.ts";
import {
  asksForASecondDish,
  dedicatedDishesFor,
  mergeDishBonus,
} from "./household_portions.ts";
import {
  bestMergePair,
  MERGE_SHAPE_NOT_HONOURED,
  mergeMaterialShown,
  MERGE_MEMBER_AWAY_ALL_WINDOW,
  type ObservedDish,
  type ObservedPreparation,
  observeMergeShape,
} from "./household_merge.ts";

// ── C7 ④ · UN DÉCOR DE CONSTAT PORTE MAINTENANT DE LA NOURRITURE ─────────
//
// `observeMergeShape` ne comptait que des cases. Depuis C7 ④ il lit AUSSI ce
// qu'il y a dans l'assiette, parce que « le même aliment dans un plus petit
// bol » était compté comme un plat dédié. Les décors qui veulent dire « deux
// plats » doivent donc porter deux plats DISTINCTS: ces deux fabriques donnent
// à chaque assiette un titre et un aliment qui n'appartiennent qu'à elle, et un
// décor de CLONE se demande explicitement (`{ title, ingredients }`).
let plateSeq = 0;
const plate = (
  day: string | null,
  slot: string | null,
  over: Partial<ObservedDish> = {},
): ObservedDish => {
  plateSeq++;
  return {
    day,
    slot,
    title: `Plate ${plateSeq}`,
    ingredients: [{ term: `food ${plateSeq}` }],
    uses: [],
    ...over,
  };
};
const batch = (
  servingsMade: number,
  over: Partial<ObservedPreparation> = {},
): ObservedPreparation => {
  plateSeq++;
  return {
    id: `prep_${plateSeq}`,
    servingsMade,
    ingredients: [{ term: `batch food ${plateSeq}` }],
    ...over,
  };
};
/** Les cases d'une grille jour × moment, dans l'ordre. */
const cellsOf = (days: readonly string[], slots: readonly string[]) =>
  days.flatMap((day) => slots.map((slot) => ({ day, slot })));
/** LES CASES DE LA FUSION MESURÉE, et rien d'autre à déclarer avec elles. */
const NO_DEDICATED_CELLS: readonly { day: string; slot: string }[] = [];

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
  safetyConstraintTable: null,
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
  // LOT 4 — LE ROSTER DES BOÎTES. `[]` par défaut: ces épreuves-ci portent sur
  // le plafond, la garde de préparation et l'attribution, pas sur les grammes.
  // Un test qui veut des boîtes le remplace explicitement.
  boxMemberIds: [] as readonly string[],
  weighedMemberIds: [] as readonly string[],
  kitchenEquipment: null,
  cookOnlyDay: null,
  soloBoxes: false,
  boxMemberDiets: [] as readonly { memberId: string; regime: DietaryRegime | null }[],
  boxMemberExclusions: [],
};

const PROMPT_BASE = {
  firstDayCookable: true,
  hasFreezer: false,
  oneCookingSession: false,
  cookOnlyDay: null,
  soloBoxes: false,
  contentLocale: "en-US",
  budgetAmount: null,
  safetyConstraints: null,
  safetyConstraintTable: null,
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
  focusAxis: null,
  dietBlock: "",
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
  }, {
    ...PARSE_BASE,
    merge: {
      shape: "one_dish",
      ownDishesShown: 6,
      dedicatedDishesAsked: 0,
      // ① ne réclame aucun plat dédié: aucune case n'est protégée.
      dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"],
    },
  });
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
    }, {
      ...PARSE_BASE,
      merge: {
        shape,
        ownDishesShown: 6,
        dedicatedDishesAsked: 6,
        dedicatedCells: cellsOf(["wed", "thu"], ["breakfast", "lunch", "dinner"]), dishBearerIds: ["m-eater"],
      },
    });
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
    }, {
      ...PARSE_BASE,
      merge: {
        shape: "one_session",
        ownDishesShown: 6,
        dedicatedDishesAsked: 6,
        dedicatedCells: cellsOf(["wed", "thu"], ["breakfast", "lunch", "dinner"]), dishBearerIds: ["m-eater"],
      },
    });
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
  const merge = {
    shape: "one_dish" as const,
    ownDishesShown: 12,
    // C6 — ① ne demande AUCUN plat dédié, et le budget doit rester celui de la
    // table même si la personne apporte douze plats.
    dedicatedDishesAsked: 0,
    // C7 ② — ① ne protège AUCUNE case: le plafond garde son ordre d'avant.
    dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"],
  };
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
    // C6 — LA CONSIGNE EN RÉCLAME 3 ET LA MATIÈRE EN MONTRE 4: le budget garde
    // le plus grand des deux, donc « exactement ce qu'on montre » tient encore.
    const merge = {
      shape,
      ownDishesShown: 4,
      dedicatedDishesAsked: 3,
      // C7 ② — le BUDGET ne lit pas les cases, il lit les deux nombres. Le
      // décor le dit en ne lui en donnant aucune.
      dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"],
    };
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
  const merge = {
    shape: "one_session" as const,
    ownDishesShown: 0,
    dedicatedDishesAsked: 1,
    dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"],
  };
  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, merge });
  assert(userMessage.includes("at most 16 dishes"), userMessage.slice(0, 200));
});

Deno.test("LE BONUS EST BORNÉ PAR LE PLAFOND DE BASE — une bouche, pas trois", () => {
  // Une bouche de plus mange au plus ce qu'une bouche mange. 15 + 15 = 30, et
  // pas 15 + 400.
  const merge = {
    shape: "one_session" as const,
    ownDishesShown: 400,
    dedicatedDishesAsked: 9,
    dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"],
  };
  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, merge });
  assert(userMessage.includes("at most 30 dishes"), userMessage.slice(0, 200));
});

Deno.test("LE PROMPT ET LE PARSE ANNONCENT LE MÊME NOMBRE, barreau par barreau", () => {
  // ⚠️ C'EST LE DÉFAUT D'ORIGINE, ET IL SERAIT PIRE EN PLUS GRAND: annoncer un
  // budget et en appliquer un autre. Le nombre est LU dans la consigne, puis
  // COMPTÉ sur la sortie — jamais dérivé deux fois de la même fonction.
  const cases: MergedEater[] = [
    {
      shape: "one_dish",
      ownDishesShown: 5,
      dedicatedDishesAsked: 0,
      dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"],
    },
    {
      shape: "one_session",
      ownDishesShown: 3,
      dedicatedDishesAsked: 9,
      dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"],
    },
    {
      shape: "separate_sessions",
      ownDishesShown: 7,
      dedicatedDishesAsked: 2,
      dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"],
    },
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
    merge: {
      shape: "one_session",
      ownDishesShown: 6,
      dedicatedDishesAsked: 6,
      dedicatedCells: cellsOf(["wed", "thu"], ["breakfast", "lunch", "dinner"]), dishBearerIds: ["m-eater"],
    },
  }).userMessage;
  const sessionsOf = (m: string) => m.match(/cooking sessions: at most (\d+)/)?.[1];
  assert(sessionsOf(without), "le budget de sessions a disparu de la consigne");
  assertEquals(sessionsOf(with_), sessionsOf(without));
});

Deno.test("`mergeDishBonus` — ① rend zéro, ②/③ le plus grand des deux", () => {
  const bonus = (
    cooking: "one_dish" | "one_session" | "separate_sessions",
    ownDishesShown: number,
    dedicatedDishesAsked: number,
    baseCap = 15,
  ) => mergeDishBonus({ cooking, ownDishesShown, dedicatedDishesAsked, baseCap });
  assertEquals(bonus("one_dish", 6, 0), 0);
  // ① NE GAGNE RIEN, MÊME SI ON LUI DEMANDE DES PLATS DÉDIÉS. Un appelant qui
  // se tromperait de barreau ne peut pas ouvrir un budget que la consigne
  // interdit d'utiliser — « déborder poliment pour le remplir ».
  assertEquals(bonus("one_dish", 6, 9), 0);
  assertEquals(bonus("one_session", 6, 6), 6);
  assertEquals(bonus("separate_sessions", 6, 6), 6);
  assertEquals(bonus("one_session", 0, 1), 1);
  assertEquals(bonus("one_session", 99, 9), 15);
  // ── C6 · LE CAS QUI A FAIT NAÎTRE LE CHAMP ────────────────────────────
  // La consigne réclame NEUF plats dédiés et la matière n'en montre que SIX:
  // c'est la fusion dont la fenêtre recomposée déborde le plan personnel
  // (L10 ①). Avant C6, le budget n'ouvrait que six places — et le parseur
  // jette les DERNIERS plats de la liste, c'est-à-dire ceux du foyer.
  assertEquals(bonus("one_session", 6, 9), 9);
  // ET L'INVERSE NE RÉTRÉCIT RIEN: un plan personnel plus bavard que le rythme
  // du foyer garde la place qu'il avait avant ce lot.
  assertEquals(bonus("one_session", 12, 9), 12);
  assertEquals(asksForASecondDish("one_dish"), false);
  assertEquals(asksForASecondDish("one_session"), true);
  assertEquals(asksForASecondDish("separate_sessions"), true);
});

Deno.test("C6 — `dedicatedDishesFor` SUIT LES REPAS, ET ① N'EN DEMANDE AUCUN", () => {
  // ⚠️ LE NOMBRE N'EST PAS UNE CONSTANTE: c'est le DÉNOMINATEUR du constat de
  // forme (C3 ⑥), ses repas à elle sur la fenêtre écrite. Mesuré le
  // 2026-08-12: neuf repas, un seul plat dédié rendu, la casserole commune 8
  // fois sur 9 — et `observeMergeShape` exige que TOUS ses repas portent
  // quelque chose à elle. Demander moins que ce qu'on mesure rendrait
  // `honoured: false` par construction.
  assertEquals(dedicatedDishesFor("one_dish", 9), 0);
  assertEquals(dedicatedDishesFor("one_session", 9), 9);
  assertEquals(dedicatedDishesFor("separate_sessions", 9), 9);
  // LE PLANCHER EST UN, et il vaut la ligne de forme: `merge_member_away_all_
  // window` a déjà refusé le cas « aucun repas » bien avant le modèle, mais un
  // zéro ici ferait un prompt qui réclame un plat dans un budget qui n'en
  // ouvre aucun.
  assertEquals(dedicatedDishesFor("one_session", 0), 1);
  assertEquals(dedicatedDishesFor("one_session", -4), 1);
  assertEquals(dedicatedDishesFor("one_session", Number.NaN), 1);
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
    // C6 — le nombre de plats dédiés, et les axes du conflit qui le justifie.
    dedicatedDishes: DEDICATED_9,
    conflicts: TWO_AXIS_CONFLICT,
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
    dishes: [plate("wed", "dinner"), plate("wed", "dinner")],
    preparations: [batch(4), batch(1)],
    // C3 ⑥ — SON SEUL REPAS de la fenêtre, et il porte un plat à part.
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.honoured, true);
  assertEquals(seen.observed, "dedicated_dish");
  assertEquals(seen.requested, "one_session");
  assertEquals(seen.meals, { atTable: 1, dedicated: 1, fromCommonPot: 0, cloned: 0 });
  assert(seen.marks.includes("single_serving_preparation:1"));
});

Deno.test("③ HONORÉ — deux plats au MÊME jour et au MÊME moment", () => {
  const seen = observeMergeShape({
    shape: "separate_sessions",
    dishes: [
      plate("wed", "dinner"),
      plate("wed", "dinner"),
      plate("thu", "dinner"),
    ],
    preparations: [batch(4)],
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
    dishes: cellsOf(FIVE_DAYS, ["breakfast", "lunch", "dinner"]).map((c) =>
      plate(c.day, c.slot)
    ),
    preparations: [batch(5), batch(4)],
    eaterCells: cellsOf(FIVE_DAYS, ["breakfast", "lunch", "dinner"]),
  });
  assertEquals(seen.honoured, false);
  assertEquals(seen.observed, "common_pot");
  assertEquals(
    seen.meals,
    { atTable: 15, dedicated: 0, fromCommonPot: 15, cloned: 0 },
  );
  assertEquals(seen.marks, []);
});

Deno.test("① N'EST JAMAIS DÉCLARÉ NON HONORÉ", () => {
  // Sa promesse est « pas de second plat », et le budget ne lui en laisse
  // aucune place. Y pousser un constat ferait dépendre le barreau le plus
  // fréquent d'une heuristique dont un faux positif salirait toutes les
  // compositions ordinaires.
  const seen = observeMergeShape({
    shape: "one_dish",
    dishes: [plate("wed", "dinner")],
    preparations: [batch(4)],
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
    dishes: [plate("wed", null), plate("wed", null)],
    preparations: [batch(4)],
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
      ...cells.map((c) => plate(c.day, c.slot)),
      // LE seul plat dédié: mercredi soir, et rien d'autre.
      plate("wed", "dinner"),
    ],
    preparations: [batch(4), batch(1)],
    eaterCells: cells,
  });
  assertEquals(seen.meals, { atTable: 9, dedicated: 1, fromCommonPot: 8, cloned: 0 });
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
    dishes: [
      ...cells.map((c) => plate(c.day, c.slot)),
      ...cells.map((c) => plate(c.day, c.slot)),
    ],
    preparations: [batch(4), batch(1), batch(1)],
    eaterCells: cells,
  });
  assertEquals(seen.meals, { atTable: 2, dedicated: 2, fromCommonPot: 0, cloned: 0 });
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
      plate("wed", "dinner"),
      plate("wed", "dinner"),
      plate("thu", "lunch"),
      plate("thu", "dinner"),
    ],
    preparations: [batch(3), batch(1)],
    // Elle n'est là QUE mercredi soir.
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.meals, { atTable: 1, dedicated: 1, fromCommonPot: 0, cloned: 0 });
  assertEquals(seen.honoured, true);
});

Deno.test("C3 ⑥ — AUCUN REPAS À ELLE: le constat se tait au lieu de mentir", () => {
  // `merge_member_away_all_window` intercepte ce cas bien avant le modèle. S'il
  // arrivait quand même, déclarer la consigne trahie sur quelqu'un qui ne mange
  // ici aucun repas serait un fait faux.
  const seen = observeMergeShape({
    shape: "separate_sessions",
    dishes: [plate("wed", "dinner")],
    preparations: [batch(4)],
    eaterCells: [],
  });
  assertEquals(seen.meals, { atTable: 0, dedicated: 0, fromCommonPot: 0, cloned: 0 });
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

// ===========================================================================
// C5 ② ③ — UNE SEULE CONFUSION, DEUX SITES, DANS LES DEUX SENS
//
// `window` = les jours de SON plan qui reviennent (ce que la proposition
// annonce). `recomposed` = la queue du plan du foyer (ce qu'on ÉCRIT).
// L10 ① avait réparé l'écriture; deux lecteurs continuaient de se tromper de
// fenêtre, chacun dans l'autre sens:
//
//   ② `otherOverlappingPlanIds` interrogeait `window` alors qu'on écrit
//      `recomposed` — les jours en trop n'étaient contrôlés par personne;
//   ③ `merged_from[].days` recevait `recomposed` alors qu'il dit les jours DE
//      SON PLAN — il nommait trois jours pour un plan de deux.
// ===========================================================================

Deno.test("C5 ② — LES DEUX FENÊTRES DIFFÈRENT, ET C'EST L'ÉCRITE QUI COMPTE", () => {
  // La forme mesurée le 2026-08-12: le foyer couvre 08-12 → 08-14 (3 jours), le
  // plan personnel repris 08-12 → 08-13. On ÉCRIT jusqu'au 14; `window` s'arrête
  // au 13. Un AUTRE plan personnel posé sur le 14 mord donc sur ce qu'on écrit
  // et PAS sur `window`: c'est très exactement l'angle mort de ②.
  const out = resolveMergeWindow({
    household: { startsOn: "2026-08-12", durationDays: 3 },
    personal: { startsOn: "2026-08-12", durationDays: 2 },
    today: "2026-08-12",
  });
  assert(out.ok, "fenêtre irrésolue — test à réviser");
  if (!out.ok) return;
  assertEquals(out.window.durationDays, 2);
  assertEquals(out.recomposed.durationDays, 3);

  const other = { id: "iris-2", startsOn: "2026-08-14", durationDays: 1 };
  // Contrôlé contre `window`: invisible. C'est ce que la QA a mesuré —
  // `other_overlapping_plan_ids: []`, aucune `issue`.
  assertEquals(plansOverlap(other, out.window), false);
  // Contrôlé contre ce qu'on écrit: nommé.
  assertEquals(plansOverlap(other, out.recomposed), true);
});

Deno.test("C5 ② — LE GÉNÉRATEUR CONTRÔLE LA FENÊTRE QU'IL ÉCRIT", async () => {
  // ⚠️ LA SOURCE EST LE SEUL TÉMOIN. En HTTP, un contrôle porté sur la mauvaise
  // fenêtre rend `[]` — indiscernable d'un foyer où personne n'a de second plan.
  // C'est ce qui a laissé le maître cuisiner pour quelqu'un qui avait son plan
  // ce jour-là.
  const src = await generatorSource();
  const at = src.indexOf("otherOverlappingPlanIds:");
  assert(at >= 0, "le contrôle O1 a disparu");
  const assign = /const mergedSpan: PlanSpan = best\.window\.(\w+);/.exec(src);
  assert(assign, "`mergedSpan` n'est plus dérivé de `best.window`");
  assertEquals(
    assign![1],
    "recomposed",
    "le contrôle des AUTRES plans porte sur `window` — la fenêtre qu'on " +
      "ANNONCE — alors qu'on écrit `recomposed`. Les jours en trop ne sont " +
      "contrôlés par personne, et rien ne le dit.",
  );
});

Deno.test("C5 ③ — `days` NE NOMME JAMAIS UN JOUR QUE LE PLAN NE COUVRE PAS", () => {
  // La ligne mesurée: days = [12,13,14] pour `plan_duration_days: 2`.
  const entry = mergedFromEntry({
    memberId: "m-iris",
    userId: "u-iris",
    plan: {
      id: "p-iris",
      startsOn: "2026-08-12",
      durationDays: 2,
      validatedAt: "2026-08-12T09:00:00Z",
    },
    // La fenêtre RECOMPOSÉE, celle qu'on écrit. C'est ce que l'appelant
    // passait, et le champ n'a jamais dit ça.
    window: { startsOn: "2026-08-12", durationDays: 3 },
  });
  assertEquals(entry.days, ["2026-08-12", "2026-08-13"]);
  assertEquals(entry.plan_duration_days, 2);
});

Deno.test("C5 ③ — BANC DE PROPRIÉTÉ: `days` ⊆ la fenêtre du plan, toujours", () => {
  // Le champ est documenté « les jours réellement repris ». Un banc, pas trois
  // exemples: une seule forme réparée laisserait les autres.
  const base = "2026-08-10";
  let checked = 0;
  for (let planStart = -3; planStart <= 3; planStart++) {
    for (let planLen = 1; planLen <= 8; planLen++) {
      for (let winStart = -3; winStart <= 3; winStart++) {
        for (let winLen = 1; winLen <= 8; winLen++) {
          const plan = {
            id: "p",
            startsOn: addDays(base, planStart),
            durationDays: planLen,
            validatedAt: null,
          };
          const entry = mergedFromEntry({
            memberId: "m",
            userId: null,
            plan,
            window: { startsOn: addDays(base, winStart), durationDays: winLen },
          });
          const planDays = new Set(
            Array.from({ length: planLen }, (_, i) => addDays(plan.startsOn, i)),
          );
          const winDays = new Set(
            Array.from(
              { length: winLen },
              (_, i) => addDays(addDays(base, winStart), i),
            ),
          );
          for (const d of entry.days) {
            assert(
              planDays.has(d),
              `${d} n'est pas dans le plan [${plan.startsOn} +${planLen}]`,
            );
            assert(d && winDays.has(d), `${d} n'est pas dans la fenêtre`);
          }
          // LE CAS QUI PASSE, et il est la moitié du test: quand les deux se
          // recouvrent, `days` n'est PAS vide. Sans lui, un `days: []`
          // inconditionnel passerait ce banc.
          const overlap = [...planDays].filter((d) => winDays.has(d));
          assertEquals(entry.days.length, overlap.length);
          checked++;
        }
      }
    }
  }
  assertEquals(checked, 7 * 8 * 7 * 8);
});

Deno.test("C5 ③ — LE GÉNÉRATEUR NOMME LA FENÊTRE DE SON PLAN", async () => {
  // L'invariant est tenu par `mergedFromEntry`; l'appelant le NOMME quand même.
  // Un appelant qui dit une chose et se fait corriger en silence est un
  // appelant qu'on relira de travers.
  const src = await generatorSource();
  const at = src.indexOf("mergedFromEntry({");
  assert(at >= 0, "l'entrée de provenance a disparu");
  const around = src.slice(at, at + 500);
  assert(
    around.includes("window: merge.window.window"),
    "l'entrée `merged_from` repart de la fenêtre recomposée: elle nommerait " +
      "des jours que le plan repris ne couvre pas.",
  );
});

// ---------------------------------------------------------------------------
// C7 — CE QUI SE PERD EN AVAL DU PROMPT
//
// ⚠️ LE FAIT CENTRAL, ET IL CHANGE LE DIAGNOSTIC: sur trois fusions réelles du
// 2026-08-12, LE MODÈLE OBÉIT 9/9 — les trois réponses brutes portent les neuf
// plats du foyer ET neuf plats dédiés, un par créneau, tirés des aliments de la
// personne. Ce qui perd les plats dédiés est en AVAL de la consigne. Rien de
// cette section ne touche donc un octet de prompt.
// ---------------------------------------------------------------------------

/** Le décor mesuré: 3 jours × 3 moments = 9 cases pour le foyer, 9 pour elle. */
const C7_DAYS = ["wed", "thu", "fri"];
const C7_SLOTS = ["breakfast", "lunch", "dinner"];
const C7_CELLS = cellsOf(C7_DAYS, C7_SLOTS);
/** `baseCap` 9 + bonus 9 = 18, et une bonne réponse en fait EXACTEMENT 18. */
const C7_CAP = 18;

const c7Merge: MergedEater = {
  shape: "one_session",
  ownDishesShown: 9,
  dedicatedDishesAsked: 9,
  dedicatedCells: C7_CELLS, dishBearerIds: ["m-eater"],
};

const c7ParseBase = {
  ...PARSE_BASE,
  daysToFill: C7_DAYS,
  merge: c7Merge,
};

/** Un plat de la table, situé, avec un aliment à lui. */
function c7Table(day: string, slot: string, over: Record<string, unknown> = {}) {
  return {
    title: `Household ${day} ${slot}`,
    day,
    slot,
    ingredients: [{ term: `table ${day} ${slot}`, quantity: "300 g" }],
    method: "Cook it.",
    why: "Because it works.",
    ...over,
  };
}

/** Le plat dédié de la MÊME case: un autre titre, un autre aliment. */
function c7Dedicated(day: string, slot: string, over: Record<string, unknown> = {}) {
  return {
    title: `Zoe ${day} ${slot}`,
    day,
    slot,
    ingredients: [{ term: `beef ${day} ${slot}`, quantity: "180 g" }],
    method: "Cook it alongside.",
    why: "Because it works.",
    ...over,
  };
}

Deno.test("C7 ② — LE PLAFOND N'A AUCUNE MARGE SUR CE DÉCOR, et c'est le fait", () => {
  // ⚠️ CE TEST EXISTE POUR EMPÊCHER LA MAUVAISE RÉPARATION. « Relever le
  // plafond » ne relève rien tant que `shown >= asked`: min(max(9, 9), 9) = 9.
  // Le budget vaut EXACTEMENT ce que la consigne réclame — 9 plats de foyer + 9
  // plats dédiés — et une bonne réponse en fait 18. Ce n'est donc PAS le nombre
  // qui était faux, c'est l'ORDRE du sacrifice.
  assertEquals(
    dishBudgetFor({
      scope: "several_days",
      rhythm: THREE_MEALS,
      daysToFill: C7_DAYS.length,
      merge: c7Merge,
    }),
    C7_CAP,
  );
});

Deno.test("C7 ② — LE CAS QUI PASSE: 18 plats dans un plafond de 18, rien ne bouge", () => {
  // ⚠️ UNE GARDE A BESOIN D'UN CAS QUI PASSE. Une réponse juste ne doit
  // produire NI éviction, NI `issue` de plafond — sinon l'ordre de sacrifice
  // serait une garde qui coupe tout, et une garde qui coupe tout ressemble
  // trait pour trait à une garde qui marche.
  const dishes = C7_CELLS.flatMap((c) => [c7Table(c.day, c.slot), c7Dedicated(c.day, c.slot)]);
  assertEquals(dishes.length, C7_CAP);
  const meal = parseGeneratedMeal(
    { preparations: [], dishes, shopping_list: [] },
    c7ParseBase,
  );
  assertEquals(meal.dishes.length, C7_CAP);
  assertEquals(meal.issues.filter((i) => i.includes("cap")), []);
});

Deno.test("C7 ② — QUAND ÇA DÉBORDE, C'EST LE SURPLUS QUI TOMBE, PAS LE DIMANCHE", () => {
  // ⚠️ REJOUE LE RUN 1 DU 2026-08-12: la réponse de relance portait 20 plats,
  // le plafond en a gardé 18 — LES DIX-HUIT PREMIERS — et la personne reprise a
  // perdu son déjeuner ET son dîner du dernier jour. Le compte total ne pouvait
  // pas le voir: 18 des deux côtés.
  //
  // Ici, les deux plats en trop sont écrits TÔT (un troisième et un quatrième
  // plat sur la case du mercredi matin), et les plats du dernier jour sont
  // écrits en DERNIER, comme un modèle écrit sa semaine.
  const dishes: Record<string, unknown>[] = [];
  for (const c of C7_CELLS) {
    dishes.push(c7Table(c.day, c.slot));
    dishes.push(c7Dedicated(c.day, c.slot));
    if (c.day === "wed" && c.slot === "breakfast") {
      dishes.push(c7Table(c.day, c.slot, { title: "Extra wed breakfast A" }));
      dishes.push(c7Table(c.day, c.slot, { title: "Extra wed breakfast B" }));
    }
  }
  assertEquals(dishes.length, 20);

  const meal = parseGeneratedMeal(
    { preparations: [], dishes, shopping_list: [] },
    c7ParseBase,
  );
  assertEquals(meal.dishes.length, C7_CAP);
  const titles = meal.dishes.map((d) => d.title);
  // LE SURPLUS EST PARTI…
  assertEquals(titles.includes("Extra wed breakfast A"), false);
  assertEquals(titles.includes("Extra wed breakfast B"), false);
  // …ET LES DEUX REPAS DU DERNIER JOUR SONT LÀ, les deux bouches servies.
  assert(titles.includes("Zoe fri lunch"), titles.join(" | "));
  assert(titles.includes("Zoe fri dinner"), titles.join(" | "));
  assert(titles.includes("Household fri dinner"), titles.join(" | "));
  // Le sacrifice est NOMMÉ: un plat retiré en silence est un plat qu'on
  // cherchera dans la grille sans jamais savoir pourquoi il manque.
  assert(
    meal.issues.some((i) => i.includes("Extra wed breakfast A")),
    meal.issues.join("\n"),
  );
});

Deno.test("C7 ② — SANS LES CASES D'ELLE, LE PLAT DÉDIÉ REDEVIENT DU SURPLUS", () => {
  // ⚠️ LA GARDE PORTE SUR `dedicatedCells`, ET CE TEST LE PROUVE PAR L'ABSENCE.
  // Le MÊME décor, avec la seule liste de cases vidée: le second plat d'une
  // case n'est plus protégé, donc rien n'a un rang pire que lui, donc le
  // plafond retombe sur « les derniers tombent » — et ce sont les plats du
  // dernier jour qui partent. C'est le défaut mesuré, reproduit à la demande.
  const dishes: Record<string, unknown>[] = [];
  for (const c of C7_CELLS) {
    dishes.push(c7Table(c.day, c.slot));
    dishes.push(c7Dedicated(c.day, c.slot));
    if (c.day === "wed" && c.slot === "breakfast") {
      dishes.push(c7Table(c.day, c.slot, { title: "Extra wed breakfast A" }));
      dishes.push(c7Table(c.day, c.slot, { title: "Extra wed breakfast B" }));
    }
  }
  const meal = parseGeneratedMeal({ preparations: [], dishes, shopping_list: [] }, {
    ...c7ParseBase,
    merge: { ...c7Merge, dedicatedCells: NO_DEDICATED_CELLS, dishBearerIds: ["m-eater"] },
  });
  assertEquals(meal.dishes.length, C7_CAP);
  const titles = meal.dishes.map((d) => d.title);
  assert(titles.includes("Extra wed breakfast A"), "le surplus aurait dû survivre");
  assertEquals(titles.includes("Zoe fri dinner"), false);
});

Deno.test("C7 ② — UN PLAT QUI NE SURVIVRA PAS NE COÛTE PAS UN PLAT GARDÉ", () => {
  // ⚠️ L'ÉVICTION EST DIFFÉRÉE JUSQU'AU `push`, ET IL LE FAUT. Le plat qui
  // arrive peut encore tomber plus bas — ici sur une cible chiffrée. Sacrifier
  // au moment du plafond ferait perdre un plat gardé au profit d'un plat qui ne
  // sera jamais écrit: un repas de moins, pour rien.
  const dishes: Record<string, unknown>[] = [];
  for (const c of C7_CELLS) {
    dishes.push(c7Table(c.day, c.slot));
    // Le dernier dîner N'A PAS son plat dédié: c'est la case que le plat
    // suivant vient remplir, et le plafond est déjà atteint.
    if (!(c.day === "fri" && c.slot === "dinner")) {
      dishes.push(c7Dedicated(c.day, c.slot));
    }
    if (c.day === "wed" && c.slot === "breakfast") {
      dishes.push(c7Table(c.day, c.slot, { title: "Extra wed breakfast A" }));
    }
  }
  assertEquals(dishes.length, C7_CAP);
  // Le dix-neuvième plat: LA CASE QUI ATTEND ENCORE SON PLAT DÉDIÉ (donc un
  // rang meilleur que le surplus), et une cible chiffrée qui le fera rejeter.
  dishes.push(c7Dedicated("fri", "dinner", { title: "Her plate with 40 g protein" }));
  const meal = parseGeneratedMeal(
    { preparations: [], dishes, shopping_list: [] },
    c7ParseBase,
  );
  const titles = meal.dishes.map((d) => d.title);
  assertEquals(titles.includes("Bulk plate with 40 g protein"), false);
  assert(
    titles.includes("Extra wed breakfast A"),
    "le surplus a été sacrifié pour un plat que le parseur a rejeté ensuite",
  );
});

Deno.test("C8 ③ — HORS FUSION AUSSI, UNE CASE VIDE PASSE AVANT UN SECOND PLAT", () => {
  // ⚠️ CE QUE C7 ② A CHANGÉ SUR LA LANE INDIVIDUELLE, ET QU'IL N'ANNONÇAIT
  // QUE DANS UN COMMENTAIRE. Sans fusion, `dedicatedCells` est vide — donc pas
  // de rang 1 — mais le rang 0 (« premier plat d'une case ») existe toujours.
  // Un second plat cède donc sa place au premier plat d'une case encore vide.
  //
  // ⚠️ LE DÉCOR EST CELUI DE LA MESURE, PAS UN DÉCOR COMMODE: le MÊME flot
  // brut de 18 plats (une assiette de table et une seconde assiette par case,
  // en alternance), passé au parseur avec `merge: null` — donc un plafond de 9.
  //   · avant C7 ②, « les derniers tombent »: `dishes[10,12,14,16]` étaient
  //     jetés, et le plan rendait `empty_slots: sat/dinner, sun/breakfast,
  //     sun/lunch, sun/dinner` — les PREMIÈRES assiettes des quatre dernières
  //     cases;
  //   · depuis C7 ②, ce sont quatre SECONDES assiettes de cases déjà servies
  //     qui partent, et la grille est pleine.
  //
  // Le changement est FAVORABLE — il remplit des cases au lieu de les laisser
  // vides — et il ne bumpe AUCUNE version: la consigne servie est identique à
  // l'octet près, c'est le contrat de SORTIE qui bouge, et il se relit sur
  // `generated_from` (les `issues` nomment chaque plat sacrifié).
  const days = ["fri", "sat", "sun"];
  const cells = cellsOf(days, ["breakfast", "lunch", "dinner"]);
  const CAP_WITHOUT_MERGE = 9; // 3 jours × 3 moments, écrit, jamais dérivé.
  assertEquals(cells.length, CAP_WITHOUT_MERGE);
  const dishes: Record<string, unknown>[] = [];
  for (const c of cells) {
    dishes.push(c7Table(c.day, c.slot));
    dishes.push(c7Dedicated(c.day, c.slot));
  }
  assertEquals(dishes.length, 18);

  const meal = parseGeneratedMeal(
    { preparations: [], dishes, shopping_list: [] },
    { ...PARSE_BASE, daysToFill: days, merge: null },
  );
  assertEquals(meal.dishes.length, CAP_WITHOUT_MERGE);
  // LA GRILLE EST PLEINE: aucune case n'est vide, et c'est le fait qui change.
  assertEquals(meal.empty_slots, []);
  const titles = meal.dishes.map((d) => d.title);
  for (const c of cells) {
    assert(
      titles.includes(`Household ${c.day} ${c.slot}`),
      `${c.day}/${c.slot} manque: ${titles.join(" | ")}`,
    );
  }
  // …et les quatre secondes assiettes évincées sont NOMMÉES, une par une. Un
  // plat retiré en silence est un plat qu'on cherchera sans jamais savoir
  // pourquoi il manque — c'est là que se relit l'ordre qui a écrêté ce plan.
  assertEquals(
    meal.issues.filter((i) => i.includes("surplus dish") && i.includes("Zoe")).length,
    4,
    meal.issues.join("\n"),
  );
});

// ---------------------------------------------------------------------------
// LOT B ③ — L'ÉVICTION NE TOMBE PLUS TOUJOURS SUR LA MÊME PERSONNE
// ---------------------------------------------------------------------------

/**
 * LE DÉCOR: une fenêtre d'un jour, deux repas, TROIS porteurs — et le modèle
 * qui écrit UNE ASSIETTE DE TROP pour le premier porteur de chaque case.
 *
 * ⚠️ LA PRESSION VIENT DU MODÈLE, PAS D'UN BUDGET RABOTÉ À LA MAIN, et c'est
 * délibéré: le plafond est en train d'être retouché par un autre lot (le budget
 * de plats), donc un banc qui écrirait « cap = 4 » en dur mesurerait ce lot-là
 * et pas celui-ci. Ici la seule prémisse est « le modèle a écrit plus que le
 * budget », et elle est ASSERTÉE avant chaque mesure.
 */
const LOTB_RHYTHM = [
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];
const LOTB_CELLS = cellsOf(["wed"], ["lunch", "dinner"]);
const LOTB_BEARERS = ["m-aurele", "m-marceline", "m-solveig"];
const lotbBudget: MergedEater = {
  shape: "one_session",
  ownDishesShown: 0,
  // 3 porteurs × 2 repas — le nombre que la consigne réclame, et celui de la
  // mesure du 2026-08-19 (`dish_owners.asked = 6`).
  dedicatedDishesAsked: 6,
  dedicatedCells: LOTB_CELLS,
  dishBearerIds: LOTB_BEARERS,
};
const lotbParseBase = {
  ...PARSE_BASE,
  scope: "day" as const,
  eatingRhythm: LOTB_RHYTHM,
  daysToFill: ["wed"],
  merge: lotbBudget,
};
const LOTB_CAP = dishBudgetFor({
  scope: "day",
  rhythm: LOTB_RHYTHM,
  daysToFill: 1,
  merge: lotbBudget,
});

/** Le flot du modèle: la table, puis les porteurs dans l'ordre où on les nomme. */
function lotbDishes(bearers: readonly string[], extraFor: string | null) {
  return LOTB_CELLS.flatMap((c) => [
    c7Table(c.day, c.slot),
    ...bearers.flatMap((id) => {
      const one = c7Dedicated(c.day, c.slot, {
        title: `${id} ${c.day} ${c.slot}`,
        for_member_id: id,
      });
      return id === extraFor
        ? [
          one,
          c7Dedicated(c.day, c.slot, {
            title: `${id} ${c.day} ${c.slot} bis`,
            for_member_id: id,
          }),
        ]
        : [one];
    }),
  ]);
}

/** Combien de plats chaque porteur garde, sur le plan RENDU. */
function lotbTally(meal: ReturnType<typeof parseGeneratedMeal>) {
  const tally = new Map<string, number>(LOTB_BEARERS.map((id) => [id, 0]));
  for (const d of meal.dishes) {
    if (d.memberId) tally.set(d.memberId, (tally.get(d.memberId) ?? 0) + 1);
  }
  return tally;
}

Deno.test("⛔ LOT B ③ — LE PLAFOND NE DONNE PLUS TOUT AU PREMIER NOMMÉ", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE DÉFAUT, ARCHIVÉ QUATRE FOIS DE SUITE (2026-08-19, trois runs + un plan
  // orphelin): `dish_owners {asked: 6, declared: 2, attributed: 2}` — six plats
  // promis, deux livrés, et TOUJOURS à la même personne. Par bouche: 2 · 2 · 2
  // pour la première du roster, 0 · 0 · 0 pour les deux autres. Sur sept jours,
  // 11 plats jetés.
  //
  // LA CAUSE, EN DEUX MOITIÉS: le rang `1` (le créneau protégé d'une case)
  // allait au SECOND plat ÉCRIT — et le modèle écrit les bouches dans l'ordre
  // du roster à chaque case; et un plat de rang 2 qui arrivait ne pouvait
  // JAMAIS prendre la place d'un autre plat de rang 2, donc le dernier nommé
  // tombait toujours.
  // ══════════════════════════════════════════════════════════════════════════
  const dishes = lotbDishes(LOTB_BEARERS, LOTB_BEARERS[0]);
  // PRÉMISSE — sans elle, ce banc pourrait passer sur un plafond qui ne mord
  // pas, c'est-à-dire en ne mesurant rien.
  assert(dishes.length > LOTB_CAP, `${dishes.length} plats pour un plafond de ${LOTB_CAP}`);

  const meal = parseGeneratedMeal(
    { preparations: [], dishes, shopping_list: [] },
    lotbParseBase,
  );
  assertEquals(meal.dishes.length, LOTB_CAP);
  // Les deux assiettes de la table sont toujours servies: la couverture des
  // créneaux passe avant l'équité entre les porteurs.
  assertEquals(meal.dishes.filter((d) => d.memberId === null).length, 2);
  assertEquals(meal.empty_slots, []);

  // ⛔ LE FAIT QUI CHANGE: les plats dédiés se répartissent, au lieu de
  // s'accumuler sur le nom écrit en premier.
  const tally = lotbTally(meal);
  const counts = [...tally.values()];
  assertEquals(
    Math.max(...counts) - Math.min(...counts) <= 1,
    true,
    JSON.stringify([...tally]),
  );
  // Et personne n'est à zéro sur ce décor: il y a assez de place pour les trois.
  assert(Math.min(...counts) >= 1, JSON.stringify([...tally]));
});

Deno.test("⛔ LOT B ③ — PROPRIÉTÉ: PERSONNE NE GARDE DEUX PLATS D'AVANCE SUR UNE AUTRE BOUCHE", () => {
  // ⚠️ C'EST L'INVARIANT, ET IL EST PLUS FORT QUE LE CAS PARTICULIER AU-DESSUS.
  // Il est balayé sur ce que le défaut SUIVAIT: l'ordre d'écriture du modèle,
  // et l'identité de la bouche pour qui il écrit une assiette de trop. Aucune
  // combinaison ne doit produire une table où quelqu'un a deux plats d'avance.
  for (let r = 0; r < LOTB_BEARERS.length; r++) {
    const bearers = [...LOTB_BEARERS.slice(r), ...LOTB_BEARERS.slice(0, r)];
    for (const extra of [...LOTB_BEARERS, null]) {
      const dishes = lotbDishes(bearers, extra);
      const meal = parseGeneratedMeal(
        { preparations: [], dishes, shopping_list: [] },
        lotbParseBase,
      );
      const counts = [...lotbTally(meal).values()];
      assert(
        Math.max(...counts) - Math.min(...counts) <= 1,
        `ordre ${r}, extra ${extra}: ${JSON.stringify([...lotbTally(meal)])}`,
      );
    }
  }
});

/**
 * LE DÉCOR **ARCHIVÉ**, celui des sorties de modèle du 2026-08-19: deux cases,
 * une assiette de table et UNE assiette par porteur dans chacune, et un plafond
 * de 4. C'est celui qui a produit `dish_owners {asked: 6, declared: 2,
 * attributed: 2}` avec 2 · 0 · 0 par bouche, quatre fois de suite.
 *
 * ⚠️ CE BANC EXISTE PARCE QUE LE DÉCOR SYNTHÉTIQUE CI-DESSUS NE SUFFISAIT PAS,
 * ET C'EST LA LEÇON DU LOT. La mutation qui désarme le rang par porteur
 * (`return 1` inconditionnel dans `dishRank`) ne fait tomber AUCUN des trois
 * bancs du dessus — leur décor produit un surplus par bouche, où la porte
 * d'équité de `sacrificeFor` rééquilibre seule. Sur CE décor-ci, la même
 * mutation rend exactement `2 · 0 · 0`. Une garde qu'on n'a pas vue tomber
 * n'est pas une garde; celle-ci a d'abord été supprimée pour cette raison, puis
 * remise quand le rejeu des archives l'a fait mordre.
 *
 * ⚠️ LE PLAFOND EST CHERCHÉ, PAS ÉCRIT EN DUR, et c'est délibéré: le budget de
 * plats est retouché par un autre lot en vol. Ce banc mesure QUI s'assied, pas
 * COMBIEN de places il y a — il retrouve donc le `dedicatedDishesAsked` qui
 * rend le plafond historique de 4, et échoue bruyamment s'il n'existe plus.
 */
const LOTB_ARCHIVED_CAP = 4;
const lotbArchivedAsked = (() => {
  for (let a = 0; a <= 24; a++) {
    const merge: MergedEater = {
      shape: "one_session",
      ownDishesShown: 0,
      dedicatedDishesAsked: a,
      dedicatedCells: LOTB_CELLS,
      dishBearerIds: LOTB_BEARERS,
    };
    if (
      dishBudgetFor({ scope: "day", rhythm: LOTB_RHYTHM, daysToFill: 1, merge }) ===
        LOTB_ARCHIVED_CAP
    ) return a;
  }
  return -1;
})();

Deno.test("⛔ LOT B ③ — LE DÉCOR ARCHIVÉ: DEUX PLATS LIVRÉS, DEUX PERSONNES DIFFÉRENTES", () => {
  // PRÉMISSE — sans elle, le banc pourrait tourner sur un plafond qui ne mord
  // pas, c'est-à-dire en ne mesurant rien.
  assert(
    lotbArchivedAsked >= 0,
    "le plafond historique de 4 n'est plus atteignable — ce banc ne mesure plus rien",
  );
  const merge: MergedEater = {
    shape: "one_session",
    ownDishesShown: 0,
    dedicatedDishesAsked: lotbArchivedAsked,
    dedicatedCells: LOTB_CELLS,
    dishBearerIds: LOTB_BEARERS,
  };
  // Le flot EXACT des sorties archivées: table, puis les trois porteurs, par case.
  const dishes = LOTB_CELLS.flatMap((c) => [
    c7Table(c.day, c.slot),
    ...LOTB_BEARERS.map((id) =>
      c7Dedicated(c.day, c.slot, {
        title: `${id} ${c.day} ${c.slot}`,
        for_member_id: id,
      })
    ),
  ]);
  assertEquals(dishes.length, 8);

  const meal = parseGeneratedMeal(
    { preparations: [], dishes, shopping_list: [] },
    { ...lotbParseBase, merge },
  );
  assertEquals(meal.dishes.length, LOTB_ARCHIVED_CAP);
  // Les deux assiettes de la table survivent: la couverture passe d'abord.
  assertEquals(meal.dishes.filter((d) => d.memberId === null).length, 2);
  assertEquals(meal.empty_slots, []);

  // ⛔ LE FAIT ARCHIVÉ ÉTAIT `2 · 0 · 0`. Il devient `1 · 0 · 1`: le même
  // nombre de plats livrés, deux personnes différentes servies. Trois porteurs
  // pour deux places, quelqu'un reste à zéro — mais plus personne n'en prend
  // deux pendant qu'une autre bouche n'en a aucune.
  const tally = lotbTally(meal);
  const counts = [...tally.values()];
  assertEquals(meal.dish_owner_counts.attributed, 2);
  assertEquals(Math.max(...counts), 1, JSON.stringify([...tally]));
  const owners = meal.dishes.map((d) => d.memberId).filter((id) => id !== null);
  assertEquals(new Set(owners).size, 2, `deux plats pour ${owners.join(" et ")}`);
});

Deno.test("⛔ LOT B ③ — MUTATION: SANS PORTEUR DÉCLARÉ, LE DÉFAUT MESURÉ REVIENT", () => {
  // ⚠️ LA MUTATION EST FAITE PAR LES DONNÉES, PAS PAR LE CODE, et c'est ce qui
  // la rend honnête: on retire les `for_member_id` du MÊME flot de plats. Le
  // rang et l'éviction redeviennent alors ceux d'avant ce lot — et on voit le
  // plan que le défaut produisait: les plats dédiés survivants portent tous le
  // MÊME nom de bouche, celui écrit en premier.
  const dishes = lotbDishes(LOTB_BEARERS, LOTB_BEARERS[0]);
  const anonymous = dishes.map((d) => {
    const { for_member_id: _drop, ...rest } = d as Record<string, unknown>;
    return rest;
  });
  const meal = parseGeneratedMeal(
    { preparations: [], dishes: anonymous, shopping_list: [] },
    lotbParseBase,
  );
  assertEquals(meal.dishes.length, LOTB_CAP);
  // Les TITRES disent qui aurait dû manger, et ils sont CONCENTRÉS: quatre
  // assiettes pour la bouche écrite en premier, une pour chacune des deux
  // autres. C'est très exactement la forme du plan archivé.
  const kept = meal.dishes.map((d) => d.title).filter((t) => t.startsWith("m-"));
  const byName = new Map<string, number>(LOTB_BEARERS.map((id) => [id, 0]));
  for (const t of kept) {
    const id = t.split(" ")[0];
    byName.set(id, (byName.get(id) ?? 0) + 1);
  }
  const blind = [...byName.values()];
  assert(
    Math.max(...blind) - Math.min(...blind) >= 3,
    `sans porteur, l'écart devrait rester celui du défaut: ${JSON.stringify([...byName])}`,
  );
  // ⛔ ET LE MÊME FLOT, AVEC LES PORTEURS, TIENT L'ÉCART À 1 — les deux moitiés
  // de la mutation dans le même banc, sinon « le correctif marche » et « le
  // décor n'avait pas de pression » se liraient pareil.
  const named = parseGeneratedMeal(
    { preparations: [], dishes, shopping_list: [] },
    lotbParseBase,
  );
  const namedCounts = [...lotbTally(named).values()];
  assert(
    Math.max(...namedCounts) - Math.min(...namedCounts) <= 1,
    JSON.stringify([...lotbTally(named)]),
  );
  // Et rien n'est attribué: sans `for_member_id`, la table n'a personne à qui
  // rendre son plat — c'est ce qui rendait le défaut invisible au compteur.
  assertEquals(meal.dish_owner_counts.attributed, 0);
});

Deno.test("C8 ③ — LA LANE INDIVIDUELLE GARDE SA VERSION DE PROMPT", () => {
  // ⚠️ LE PRÉCÉDENT INVOQUÉ EST CELUI DE `HOUSEHOLD_PROMPT_VERSION` v4: la
  // règle est « quelle POPULATION voit une CONSIGNE différente », et v4 a bumpé
  // parce que la ligne « at most N dishes » CHANGEAIT DE NOMBRE pour les
  // fusions. Ici aucun octet de consigne ne bouge, pour personne: le prompt
  // servi est byte-identique et seul le contrat de sortie change. Bumper
  // invaliderait le cache d'une population entière pour un prompt identique.
  //
  // ⚠️ v10 DEPUIS LE LOT 2 (2026-08-17), ET C'EST LE PREMIER BUMP DU TRONC
  // DEPUIS v9 — pour la raison exacte que le paragraphe ci-dessus donne
  // d'ordinaire pour NE PAS bumper, prise dans l'autre sens: cette fois un
  // OCTET DE CONSIGNE change, et il change POUR TOUT LE MONDE. La section
  // `WHAT TODAY ACTUALLY TAKES, ON EVERY DISH` et le champ `same_day` du schéma
  // de sortie sont servis à la lane individuelle, au foyer ordinaire, à la
  // fusion et au secondaire. Il n'y a donc aucune population qui verrait le
  // prompt de v9: laisser le numéro immobile ferait rendre par le cache un
  // prompt qui ne demande pas le champ que le parseur compte.
  //
  // Le même bump paie la clé `"uses"` déclarée DEUX FOIS dans le bloc de
  // schéma (défaut mesuré le 2026-08-17): le bloc changeait de toute façon.
  // ⚠️ v11 DEPUIS LE LOT 4 (2026-08-17), ET C'EST LE MÊME RAISONNEMENT QUE v10
  // PRIS UNE SECONDE FOIS: un octet de CONSIGNE change, et il change POUR TOUT
  // LE MONDE. La section `WHAT A DISH ADDS ON THE DAY IS WEIGHED OR COUNTED`
  // resserre la quantité d'un plat — grammes ou unités dénombrables — et elle
  // est servie à la lane individuelle, au foyer ordinaire, à la fusion et au
  // secondaire. Le même bump paie les deux jetons d'identifiant de boîte
  // ajoutés à `MEAL_TOKEN_FIELDS`, qui sont rendus dans le bloc de langue des
  // DEUX lanes.
  //
  // ⚠️ ET LE PROTOCOLE DES BOÎTES, LUI, N'EST PAS ICI: il vit dans l'enveloppe
  // foyer (`v14_weigh_once_into_boxes`), parce que les ids de bouches n'existent
  // que là. Deux moitiés d'un même lot, deux axes — la règle « quelle
  // population voit une consigne différente », appliquée deux fois.
  // ⚠️ v12 DEPUIS L7 (2026-08-18), ET C'EST LE RAISONNEMENT DE v10 ET v11 PRIS
  // UNE TROISIÈME FOIS: un octet de CONSIGNE change, et il change POUR TOUT LE
  // MONDE. La section `EVERY DISH HAS TWO LINES: A NAME, AND A TITLE` et la clé
  // `"name"` du schéma de sortie vivent dans `MEAL_SYSTEM_PROMPT`, donc la lane
  // individuelle, le foyer ordinaire, la fusion et le secondaire les voient
  // tous. Le même bump paie la ligne `dishes[].name` ajoutée à
  // `MEAL_TRANSLATABLE_FIELDS`, rendue dans le bloc de langue des deux lanes.
  // ⚠️ v13 (2026-08-18) — QA 01-injection, LANE SOLO. Le tronc bumpe une
  // troisième fois pour la même raison que v10 et v11: des OCTETS DE CONSIGNE
  // changent dans le message utilisateur. Quatre, tous mesurés sur le run réel
  // `798c5cd6-…` avant d'être écrits — moyens de cuisson, cran d'activité,
  // aspiration, et l'en-tête du garde-manger qui doublait celui des apports
  // fixes. Les trois premiers ne concernent QUE la lane solo; le quatrième
  // traverse les deux. Un compte qui n'a répondu à aucune des trois questions
  // reçoit un message byte-identique à v12 — mais le cache doit quand même
  // distinguer les deux, sinon un compte qui vient de répondre se voit rendre
  // le prompt d'avant sa réponse.
  // ⚠️ v16 (2026-08-19) — LE GROUPE ALIMENTAIRE EST DÉCLARÉ, PLUS DEVINÉ.
  // La population qui voit une consigne différente: celle qui a un RÉGIME
  // déclaré, sur les deux lanes. Le bloc voyage avec `dietaryRegimePromptLine`
  // et PAS dans `MEAL_SYSTEM_PROMPT`, donc une composition sans régime rend un
  // message byte-identique à v15 (`dietary_regime_solo_lane_test.ts :: « v16 —
  // la demande de GROUPE n QUE dans le bloc de régime »`). Le bump vaut
  // quand même — règle de v3/v5 de l foyer: c la PRÉSENCE du bloc qui
  // distingue deux populations dans la colonne.
  // ⚠️ v20 (2026-09-01) — LA PART CONGELÉE A UNE CLÉ.
  // Population qui voit une consigne différente: TOUT LE MONDE. Le schéma
  // gagne `dishes[].uses[].kept` et le bloc de conservation gagne le
  // paragraphe qui dit par quel CHAMP se déclare la troisième sortie. Les deux
  // vivent dans le tronc. Un modèle qui n'écrit jamais le champ produit
  // exactement le plan de v19 — le non-dit vaut `"fridge"`, le strict.
  // ⚠️ v21 (2026-09-01) — LES JOURS HORS DE PORTÉE D'UN LOT SONT NOMMÉS, et la
  // session seule a le droit de déborder en le disant. Population: les fenêtres
  // qui portent une journée qu'aucun lot n'atteint. Un plan sans tension rend
  // v20 au caractère près, et un test le tient.
  // ⚠️ v25 (2026-09-03) — LA VEILLE EST DÉRIVÉE, PLUS COCHÉE (P1, A1).
  // La CONSIGNE n'a pas changé d'un caractère: `cookOnlyDay` existait déjà.
  // Ce qui change est la POPULATION qui la reçoit — jusqu'ici les seuls plans
  // qui portaient un jour de cuisine sans repas étaient ceux dont quelqu'un
  // avait coché une case; ils le portent désormais par défaut, dès que le
  // calendrier et l'heure le permettent. Comparer les plans d'avant et d'après
  // sous un même millésime rendrait la mesure fausse.
  // ⚠️ v26 (2026-09-03, A2/P2) — LE STYLE DE CUISINE POSE LES SESSIONS.
  // Population qui voit une consigne différente: celle qui a répondu aux DEUX
  // questions de P2 (`cooking_style` + `grocery_runs`). Pour elle, `cook_days`
  // et le plafond de temps de session ne viennent plus de la colonne mais de
  // la dérivation; pour tous les autres, la consigne est celle de v25 au
  // caractère près, et un test de rationale le tient ligne à ligne.
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v26_the_cooking_style_sets_the_sessions");
  // ⚠️ v10 DEPUIS LE LOT G (2026-08-14), ET C'EST LA MOITIÉ DU LOT QUI COMPTE
  // ICI: le TRONC ne bouge toujours pas (la ligne au-dessus le tient), la lane
  // du FOYER si. Deux populations neuves y voient une consigne différente —
  // les foyers où une bouche porte une habitude, et ceux qui atteignent le
  // barreau ② SANS fusion. Toutes les autres, fusions comprises, rendent un
  // prompt byte-identique à v9, et `household_meal_generation_test.ts` le
  // tient par égalité de chaîne.
  // ⚠️ v11 DEPUIS LE RÉGIME À TABLE (2026-08-14), ET LE TRONC NE BOUGE
  // TOUJOURS PAS. Deux populations neuves, encore: les foyers où au moins une
  // bouche porte un régime — ils gagnent le bloc `WHAT THE SHARED DISH MUST
  // RESPECT`, qu'AUCUN foyer n'avait avant, puisque ce fichier ne portait pas
  // une seule occurrence du mot « diet » — et ceux qui atteignent le barreau ②
  // par le régime plutôt que par la direction de service. Tous les autres
  // rendent `dietBlock: ""`, et `household_meal_generation_test.ts` tient
  // l'égalité de chaîne.
  // ⚠️ v12 DEPUIS LE LOT C (2026-08-15), ET LE TRONC NE BOUGE TOUJOURS PAS. La
  // population neuve est ÉTROITE et nommée: les foyers où au moins une bouche
  // reçoit un plat à elle. Eux seuls gagnent le bloc `WHOSE DISH IS IT` et le
  // champ `for_member_id`. Un foyer au barreau ① rend `dishBearers: []`, le bloc
  // n'est pas assemblé, et le prompt est celui de v11 au caractère près —
  // `household_meal_generation_test.ts` le tient.
  // ⚠️ v13 DEPUIS LE LOT 3C (2026-08-17), ET LE TRONC NE BOUGE TOUJOURS PAS. La
  // population est EXACTEMENT celle de v12 — les foyers où au moins une bouche
  // reçoit un plat à elle — et ce qu'elle voit change: l'ordre du plat dédié
  // passe dans le message UTILISATEUR, collé au brief qui le promet, parce que
  // la permission servie dans le prompt système n'a produit aucune attribution
  // retenue sur douze générations mesurées.
  // ⚠️ v14 DEPUIS LE LOT 4 (2026-08-17), ET CETTE FOIS LE TRONC BOUGE AUSSI —
  // ce qui n'était jamais arrivé sur cette liste. Ce n'est pas un doublon: les
  // deux moitiés de P4 n'ont PAS la même portée. Le tronc porte les quantités
  // du jour, vues par les quatre populations; l'enveloppe porte le protocole
  // des boîtes, vu par les foyers d'AU MOINS DEUX BOUCHES — `boxSchemaBlock`
  // côté système, `boxingOrderLines` dans le brief de portions. Un foyer d'une
  // seule bouche rend les deux vides et un prompt de foyer byte-identique à
  // v13, ce que `household_meal_generation_test.ts` tient par égalité de chaîne.
  // ⚠️ v15 DEPUIS LE LOT 4C (2026-08-17), ET LE TRONC NE BOUGE PLUS: la ligne
  // `MEAL_PROMPT_VERSION` ci-dessus reste v11, aucun octet de
  // `MEAL_SYSTEM_PROMPT` ne change. Ce qui change vit dans le brief de portions,
  // et la POPULATION S'ÉLARGIT PAR RAPPORT À v14: le gramme demandé dans la note
  // (② — 93 notes réelles, zéro gramme) est servi à TOUT foyer, y compris à une
  // seule bouche; « exactement une boîte par bouche » (③ — 13 bouches en double,
  // 3 sans boîte) reste sous le seuil de deux. Un foyer d'une bouche n'est donc
  // PLUS byte-identique à v13, et c'est délibéré: « des quantités précises pour
  // chaque personne » ne s'arrête pas à deux habitants. La population non
  // concernée est la lane INDIVIDUELLE, qui ne monte jamais cette enveloppe.
  // ⚠️ v16 DEPUIS L7 (2026-08-18), ET LES DEUX AXES BOUGENT ENSEMBLE POUR LA
  // SECONDE FOIS. L'enveloppe gagne deux blocs qui ne concernent QUE le foyer —
  // ce que cette cuisine n'a pas, et les midis qui sortent du plan sans sortir
  // de la journée. Aucun des deux ne demande de champ au modèle, donc le
  // `systemSuffix` ne bouge pas d'un octet; et sans donnée les deux sont vides,
  // ce que deux tests tiennent par égalité de chaîne.
  // ⚠️ D1b (2026-08-18) — UN SEUL AXE BOUGE, ET C'EST L'ENVELOPPE FOYER.
  // `v17_what_each_mouth_already_has`: la lane foyer passait `fixedIntakes: []`
  // EN DUR sur ses trois sites, donc le shaker qu'une bouche déclare
  // n'atteignait jamais la consigne. Aucun bloc de l'enveloppe ne change — ce
  // qui change est un PARAMÈTRE DU TRONC que cette lane laissait vide — et le
  // tronc, lui, ne gagne pas un octet: il reste à `meal.en.v12_a_dish_has_a_name`.
  // Population concernée: les foyers où une bouche ATTABLÉE a un compte ET a
  // déclaré un apport. Ailleurs, prompt byte-identique à v16.
  // ⚠️ D3′-c (2026-08-23) — `v22_precedence_in_tail`, ET LE BUMP EST EN RETARD
  // D'UN JOUR. `D3′` (2026-08-22 18:51) a réécrit le bloc d'arbitrage de la lane
  // foyer — passé en QUEUE du message, rang 1 qui NOMME ses trois blocs de
  // verrou au lieu de dire « at the VERY TOP » — et n'a pas touché ce jeton. Les
  // quatre épinglages de cette valeur sont restés VERTS: ils tiennent le jeton,
  // aucun ne le reliait au TEXTE. C'est ce que `precedence_binding_test.ts`
  // ferme. Population concernée: tous les foyers. Le TRONC ne bouge pas — le
  // texte de la lane SOLO a survécu octet pour octet, mesuré sur 243 prompts
  // archivés.
  // ⚠️ v23 (2026-09-03, D6.2) — LA GAMELLE A UNE CONSIGNE. Population qui
  // voit une consigne différente: les foyers où au moins une bouche emporte
  // son déjeuner de semaine. Ailleurs, l'enveloppe est celle de v22 au
  // caractère près, et un test le tient.
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v23_the_lunchbox_travels");
});

Deno.test("C7 ③ — LA LIGNE DE COURSES D'UN PLAT JETÉ NE PART PLUS AU MAGASIN", () => {
  // ⚠️ MESURÉ LE 2026-08-12: run 1, CINQ lignes orphelines (`kidney beans`,
  // `pork mince`, `bok choy`, `sesame oil`, `soy sauce`) — exactement les
  // ingrédients des deux plats tombés. Run 3, TROIS. Le foyer paie et jette.
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [
      plainDish({ title: "Kept stew", ingredients: [{ term: "beef", quantity: "600 g" }] }),
      // Rejeté sur une cible chiffrée: le verrou est juste, et il reste.
      plainDish({
        title: "Protein pancakes with 30 g protein",
        day: "thu",
        slot: "breakfast",
        ingredients: [{ term: "kidney beans", quantity: "200 g" }],
      }),
    ],
    shopping_list: [
      { term: "beef", quantity: "600 g", aisle: "protein" },
      { term: "kidney beans", quantity: "200 g", aisle: "pantry" },
    ],
  }, PARSE_BASE);
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.shopping_list.map((s) => s.term), ["beef"]);
  assert(
    meal.issues.some((i) => i.includes("kidney beans")),
    meal.issues.join("\n"),
  );
});

Deno.test("C7 ③ — UN INGRÉDIENT PARTAGÉ NE PART PAS AVEC LE PLAT QUI TOMBE", () => {
  // ⚠️ « Ne retire une ligne que si PLUS AUCUN plat gardé ne la réclame. » Un
  // oignon sert cinq plats; le retirer parce qu'un sixième est tombé enverrait
  // quelqu'un au magasin sans ce qu'il lui faut — et c'est le seul dégât que
  // cette réconciliation peut causer.
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [
      plainDish({ title: "Kept stew", ingredients: [{ term: "Onions", quantity: "2" }] }),
      plainDish({
        title: "Dropped bowl with 30 g protein",
        day: "thu",
        slot: "lunch",
        ingredients: [{ term: "onions", quantity: "1" }, { term: "bok choy", quantity: "1" }],
      }),
    ],
    shopping_list: [
      { term: "onions", quantity: "3", aisle: "produce" },
      { term: "bok choy", quantity: "1", aisle: "produce" },
    ],
  }, PARSE_BASE);
  assertEquals(meal.shopping_list.map((s) => s.term), ["onions"]);
});

Deno.test("C7 ③ — UNE PRÉPARATION GARDÉE RÉCLAME AUSSI SES COURSES", () => {
  // Un plat qui puise dans un lot NE RÉPÈTE PAS sa recette — le prompt système
  // le demande. Ne regarder que `dish.ingredients` retirerait les courses de
  // toutes les cuissons par lot.
  const meal = parseGeneratedMeal({
    preparations: [prepPayload(4)],
    dishes: [
      dishUsingPrep(),
      plainDish({
        title: "Dropped bowl with 30 g protein",
        day: "thu",
        slot: "lunch",
        ingredients: [{ term: "pasta", quantity: "100 g" }],
      }),
    ],
    shopping_list: [{ term: "pasta", quantity: "500 g", aisle: "pantry" }],
  }, PARSE_BASE);
  assertEquals(meal.preparations.length, 1);
  assertEquals(meal.shopping_list.map((s) => s.term), ["pasta"]);
});

Deno.test("C7 ③ — CE QUE JE N'AI PAS SU RATTACHER RESTE, ET SE COMPTE", () => {
  // ⚠️ JAMAIS DE MATCHER MAISON SUR DU TEXTE ALIMENTAIRE. « chicken breasts »
  // et « chicken breast » ne sont pas la même chaîne, et deviner là-dessus
  // coûterait un dîner. La ligne reste, et le doute est COMPTÉ — c'est la
  // mesure qui dira un jour si le rattachement mérite mieux qu'une égalité.
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [
      plainDish({ title: "Kept stew", ingredients: [{ term: "chicken breast" }] }),
      plainDish({
        title: "Dropped bowl with 30 g protein",
        day: "thu",
        slot: "lunch",
        ingredients: [{ term: "kidney beans" }],
      }),
    ],
    shopping_list: [
      { term: "chicken breasts", quantity: "1 kg", aisle: "protein" },
      { term: "kidney beans", quantity: "200 g", aisle: "pantry" },
    ],
  }, PARSE_BASE);
  assertEquals(meal.shopping_list.map((s) => s.term), ["chicken breasts"]);
  assert(
    meal.issues.some((i) => i.startsWith("shopping_list_unattributed: 1/2")),
    meal.issues.join("\n"),
  );
});

Deno.test("C7 ③ — TOUT EST RATTACHÉ, RIEN NE BOUGE: le cas qui PASSE", () => {
  // Un plan sain ne change pas d'un octet, et ne porte AUCUNE `issue` de
  // courses. Sans ce cas, une réconciliation qui retirerait tout ressemblerait
  // à une réconciliation qui marche.
  //
  // ⚠️ C8 ② A RESSERRÉ CE CAS, ET C'EST LE BON SENS: il disait « aucun plat
  // tombé », il dit maintenant « chaque ligne est réclamée ». La version d'avant
  // portait `bay leaves` — une ligne que RIEN ne réclamait — et affirmait donc
  // qu'un plan qui achète pour personne est un plan sain.
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [plainDish({ ingredients: [{ term: "beef" }, { term: "bay leaves" }] })],
    shopping_list: [
      { term: "beef", quantity: "600 g", aisle: "protein" },
      { term: "bay leaves", quantity: "2", aisle: "pantry" },
    ],
  }, PARSE_BASE);
  assertEquals(meal.shopping_list.map((s) => s.term), ["beef", "bay leaves"]);
  assertEquals(meal.issues.filter((i) => i.startsWith("shopping_list")), []);
});

Deno.test("C8 ② — LA LIGNE QUE PERSONNE NE RÉCLAME SE COMPTE, PLAN SAIN OU PAS", () => {
  // ⚠️ MESURÉ LE 2026-08-12: deux fusions sur quatre portaient une ligne
  // réclamée par AUCUN plat gardé (`spring greens`, `protein pancakes`), sans
  // qu'aucun plat ne soit tombé par ailleurs — donc sans compteur et sans
  // `issue`. Le foyer achetait pour rien, en silence.
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [plainDish({ ingredients: [{ term: "beef" }] })],
    shopping_list: [
      { term: "beef", quantity: "600 g", aisle: "protein" },
      { term: "spring greens", quantity: "1 bunch", aisle: "produce" },
    ],
  }, PARSE_BASE);
  // ⚠️ LA LIGNE RESTE. C7 ③ a tranché que le doute ne retire rien, et C8 ne
  // change que le COMPTE: une correspondance fausse retirerait une ligne dont
  // un plat a besoin.
  assertEquals(meal.shopping_list.map((s) => s.term), ["beef", "spring greens"]);
  assert(
    meal.issues.some((i) => i.startsWith("shopping_list_unattributed: 1/2")),
    meal.issues.join("\n"),
  );
  // Aucun plat n'est tombé: il n'y a donc RIEN à retirer, et aucune `issue` de
  // retrait ne doit apparaître.
  assertEquals(meal.issues.filter((i) => i.includes("not in the plan")), []);
});

Deno.test("C7 ④ — LE MÊME ALIMENT DANS UN PLUS PETIT BOL N'EST PAS UN PLAT DÉDIÉ", () => {
  // ⚠️ MESURÉ LE 2026-08-12, run 1, `fri/breakfast`: le petit-déjeuner du foyer
  // récrit en portion simple, `why: "A fresh single portion for Zoe"`. La
  // consigne de C6 l'interdit EN TOUTES LETTRES, et le constat le comptait
  // comme une réussite — un constat qui compte un clone comme une réussite est
  // un constat qui ment.
  const twin = { title: "Greek yogurt bowls", ingredients: [{ term: "greek yogurt" }] };
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [plate("fri", "breakfast", twin), plate("fri", "breakfast", twin)],
    preparations: [batch(4)],
    eaterCells: [{ day: "fri", slot: "breakfast" }],
  });
  assertEquals(seen.meals, { atTable: 1, dedicated: 0, fromCommonPot: 1, cloned: 1 });
  assertEquals(seen.observed, "common_pot");
  assertEquals(seen.honoured, false);
  assert(seen.marks.includes("cloned_dish:fri/breakfast"), seen.marks.join(" | "));
  // La marque structurelle RESTE: la case porte bien deux plats, et le constat
  // dit les deux choses.
  assert(seen.marks.includes("parallel_dishes:fri/breakfast"), seen.marks.join(" | "));
});

Deno.test("C7 ④ — MÊME NOURRITURE, AUTRE TITRE: toujours un clone", () => {
  // « Le même aliment dans un plus petit bol »: la portion change, la
  // nourriture non. Un titre retouché ne fabrique pas un plat.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("fri", "breakfast", {
        title: "Greek yogurt bowls",
        ingredients: [{ term: "Greek yogurt" }, { term: "berries" }],
      }),
      plate("fri", "breakfast", {
        title: "A fresh single portion for Zoe",
        ingredients: [{ term: "berries" }, { term: "greek yogurt" }],
      }),
    ],
    preparations: [batch(4)],
    eaterCells: [{ day: "fri", slot: "breakfast" }],
  });
  assertEquals(seen.meals.dedicated, 0);
  assertEquals(seen.meals.cloned, 1);
});

Deno.test("C7 ④ — LE CAS QUI PASSE: un aliment à elle, et c'est un vrai plat", () => {
  // ⚠️ SANS CE CAS, LE CONSTAT SERAIT UNE GARDE QUI COUPE TOUT. La consigne dit
  // « the protein and the starch [...] has to come from what they eat »: dès
  // qu'un aliment n'est pas dans l'assiette de la table, ce n'est plus le même
  // plat.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("fri", "breakfast", {
        title: "Greek yogurt bowls",
        ingredients: [{ term: "greek yogurt" }],
      }),
      plate("fri", "breakfast", {
        title: "Greek yogurt bowl with beef",
        ingredients: [{ term: "greek yogurt" }, { term: "beef" }],
      }),
    ],
    preparations: [batch(4)],
    eaterCells: [{ day: "fri", slot: "breakfast" }],
  });
  assertEquals(seen.meals, { atTable: 1, dedicated: 1, fromCommonPot: 0, cloned: 0 });
  assertEquals(seen.honoured, true);
  assertEquals(seen.marks.some((m) => m.startsWith("cloned_dish")), false);
});

Deno.test("C7 ④ — LA MATIÈRE D'UN LOT COMPTE: deux plats de batch ne sont pas jumeaux", () => {
  // ⚠️ LE PIÈGE QUE `uses` FERME. Le prompt système demande qu'un plat qui
  // puise dans un lot NE RÉPÈTE PAS sa recette: `ingredients` y est court, ou
  // vide. Comparer les seuls ingrédients propres ferait passer deux plats de
  // lot pour le même plat — c'est l'erreur que le constat d'ancre protéique a
  // déjà payée une fois.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("wed", "dinner", {
        title: "Bowl A",
        ingredients: [{ term: "parsley" }],
        uses: [{ preparationId: "prep_table" }],
      }),
      plate("wed", "dinner", {
        title: "Bowl B",
        ingredients: [{ term: "parsley" }],
        uses: [{ preparationId: "prep_zoe" }],
      }),
    ],
    preparations: [
      batch(4, { id: "prep_table", ingredients: [{ term: "chickpeas" }] }),
      batch(1, { id: "prep_zoe", ingredients: [{ term: "beef" }] }),
    ],
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.meals.dedicated, 1);
  assertEquals(seen.meals.cloned, 0);
});

Deno.test("C7 ④ — LE DOUTE NE FABRIQUE PAS DE CLONE", () => {
  // Quand un plat n'écrit AUCUN aliment — ni le sien, ni celui d'un lot — le
  // second signal se tait. Un faux clone transformerait un plan honoré en plan
  // trahi, et c'est le seul dégât que ce constat peut causer.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("wed", "dinner", { title: "Table plate", ingredients: [{ term: "beef" }] }),
      plate("wed", "dinner", { title: "Her plate", ingredients: [] }),
    ],
    preparations: [batch(4)],
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.meals.dedicated, 1);
  assertEquals(seen.meals.cloned, 0);
});

Deno.test("C7 ④ — SEPT CASES DOUBLÉES DONT UNE CLONÉE PAR LE TITRE: 6 + 1", () => {
  // ⚠️ CE DÉCOR N'EST PAS LE RUN 1, et le dire l'était à tort jusqu'à C8. Il
  // clone par le TITRE; le run 1 clonait par la NOURRITURE, à un pluriel près
  // (`peaches` / `peach`) — voir le test C8 ① qui rejoue sa matière exacte.
  // Ce que ce cas-ci tient reste vrai et vaut d'être tenu: une case clonée sort
  // du compte des dédiés, et le reste de la grille n'en souffre pas.
  const dishes: ObservedDish[] = [];
  const doubled = C7_CELLS.slice(0, 7);
  for (const c of C7_CELLS) {
    dishes.push(plate(c.day, c.slot, { title: `Household ${c.day} ${c.slot}` }));
    if (!doubled.some((d) => d.day === c.day && d.slot === c.slot)) continue;
    const clone = c.day === "fri" && c.slot === "breakfast";
    dishes.push(
      clone
        ? plate(c.day, c.slot, { title: `Household ${c.day} ${c.slot}` })
        : plate(c.day, c.slot, { title: `Zoe ${c.day} ${c.slot}` }),
    );
  }
  const seen = observeMergeShape({
    shape: "one_session",
    dishes,
    preparations: [batch(4)],
    eaterCells: C7_CELLS,
  });
  assertEquals(seen.meals, { atTable: 9, dedicated: 6, fromCommonPot: 3, cloned: 1 });
  assertEquals(seen.observed, "some_meals_dedicated");
});

Deno.test("C7 ① — LA RELANCE D'ANCRE NE PEUT PLUS PERDRE UN PLAT DÉDIÉ", async () => {
  // ⚠️ MESURÉ LE 2026-08-12, run 1: réponse 1 à 18 plats et 9 dédiés sur 9;
  // relance à 20 plats écrêtés à 18, 7 dédiés. `retried.dishes.length >=
  // meal.dishes.length` est VRAI des deux côtés — le plafond écrête les deux —
  // donc la relance a été acceptée, et Zoé a perdu son déjeuner et son dîner du
  // dimanche.
  const src = await generatorSource();
  assert(
    /const dedicatedBefore = dedicatedMealsIn\(meal\);/.test(src),
    "le plan d'avant la relance n'est plus mesuré: le critère redevient aveugle.",
  );
  assert(
    /const dedicatedAfter = dedicatedMealsIn\(retried\);/.test(src),
    "le plan de la relance n'est plus mesuré.",
  );
  assert(
    /dedicatedAfter >= dedicatedBefore/.test(src),
    "la relance n'est plus comparée sur les plats DÉDIÉS: un plan qui perd " +
      "deux repas de la personne reprise repasse, parce que le total est le même.",
  );
  // ⚠️ L'ANCIENNE MOITIÉ RESTE UNE MOITIÉ. La remplacer ferait l'erreur qu'on
  // répare, dans l'autre sens: une relance plus courte serait acceptée pour peu
  // qu'elle serve la personne reprise.
  assert(
    /retried\.dishes\.length >= meal\.dishes\.length/.test(src),
    "le critère de LONGUEUR a disparu: une relance plus courte redevient " +
      "acceptable dès qu'elle sert la personne reprise.",
  );
  // Le compte n'est pas recalculé à la main: c'est le MÊME constat, avec le
  // MÊME dénominateur, que celui qui sera archivé.
  assert(
    /dedicatedMealsIn = \([\s\S]{0,400}?observeMergeShape\(\{[\s\S]{0,300}?eaterCells: mergedEaterCells/
      .test(src),
    "le compte de plats dédiés de la relance ne passe plus par " +
      "`observeMergeShape` avec les cases de la personne reprise.",
  );
});

Deno.test("C7 ② — LE GÉNÉRATEUR DONNE AU PLAFOND LES CASES D'ELLE", async () => {
  // Le nombre dit COMBIEN de place ouvrir; les cases disent OÙ un plat de plus
  // a le droit de vivre. Sans elles, le plat dédié redevient la première chose
  // que le plafond sacrifie.
  const src = await generatorSource();
  assert(
    /dedicatedCells: mergedEaterCells/.test(src),
    "le plafond ne reçoit plus les cases de la personne reprise: l'ordre de " +
      "sacrifice retombe sur « les derniers tombent ».",
  );
});

Deno.test("C7 ④ — LE COMPTE DE CLONES PART DANS L'ARCHIVE ET DANS LE JOURNAL", async () => {
  // « 7 sur 9 » et « 6 vrais + 1 clone » sont deux faits différents, et le
  // second est le vrai. Un constat qu'on ne peut pas compter ne se corrige pas.
  const src = await generatorSource();
  // ⚠️ LA LIMITE DU MOTIF, TROUVÉE PAR LA MUTATION: `cloned: mergeShape.meals
  // .cloned` est un SOUS-MOT de la ligne du journal (`meals_cloned: …`), donc
  // retirer la ligne de l'archive laissait ce test VERT. Le motif exige
  // désormais que rien ne précède `cloned` — c'est la clé de l'archive, pas
  // celle du log.
  assert(
    /(?<![a-z_])cloned: mergeShape\.meals\.cloned/.test(src),
    "le compte de clones n'entre plus dans `generated_from`.",
  );
  assert(
    /meals_cloned: mergeShape\.meals\.cloned/.test(src),
    "le compte de clones n'entre plus dans le journal.",
  );
});

Deno.test("C7 ④ — MÊME TITRE, AUTRE LISTE: toujours un clone", () => {
  // Le second signal (la nourriture) ne couvre pas ce cas: le modèle récrit le
  // plat du foyer sous le MÊME titre en abrégeant sa liste. Deux plats qui
  // portent le même nom sont le même plat, et le titre est ce que la personne
  // lit dans sa grille.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("fri", "breakfast", {
        title: "Greek yogurt bowls",
        ingredients: [{ term: "greek yogurt" }, { term: "berries" }, { term: "honey" }],
      }),
      plate("fri", "breakfast", {
        title: "Greek yogurt bowls",
        ingredients: [{ term: "greek yogurt" }],
      }),
    ],
    preparations: [batch(4)],
    eaterCells: [{ day: "fri", slot: "breakfast" }],
  });
  assertEquals(seen.meals.dedicated, 0);
  assertEquals(seen.meals.cloned, 1);
});

// ── C8 ① · LE DÉTECTEUR DE CLONE RATAIT LE CLONE QUI L'AVAIT MOTIVÉ ──────
//
// La matière de ces trois tests n'est pas inventée: elle est copiée du plan
// `7ab2e069-1f60-44e7-9f78-3d7396421332` (run 1 de la campagne du 2026-08-12),
// titres et ingrédients au mot près.
const RUN1_TABLE_BREAKFAST = {
  title: "Greek yogurt bowls with peaches, granola and seeds",
  ingredients: [
    { term: "Greek yogurt" },
    { term: "peaches" },
    { term: "granola" },
    { term: "mixed seeds" },
  ],
};
/** Le clone: `why: "A fresh single portion for Zoe"`, et UN pluriel d'écart. */
const RUN1_ZOE_BREAKFAST = {
  title: "Greek yogurt bowl with peaches and seeds",
  ingredients: [
    { term: "Greek yogurt" },
    { term: "peach" },
    { term: "granola" },
    { term: "mixed seeds" },
  ],
};

Deno.test("C8 ① — LA PAIRE QUI A MOTIVÉ LA RÈGLE EST ENFIN VUE", () => {
  // ⚠️ AVANT C8, CE CAS RENDAIT `dedies=1 clones=0`. Les titres diffèrent (le
  // premier signal se tait), et les jeux d'aliments étaient inégaux pour un
  // seul `s`: `peaches` contre `peach`. Le clone que C7 ④ a été écrit pour
  // attraper passait donc à travers C7 ④.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("fri", "breakfast", RUN1_TABLE_BREAKFAST),
      plate("fri", "breakfast", RUN1_ZOE_BREAKFAST),
    ],
    preparations: [batch(4)],
    eaterCells: [{ day: "fri", slot: "breakfast" }],
  });
  assertEquals(seen.meals, { atTable: 1, dedicated: 0, fromCommonPot: 1, cloned: 1 });
  assertEquals(seen.observed, "common_pot");
  assert(seen.marks.includes("cloned_dish:fri/breakfast"), seen.marks.join(" | "));
});

Deno.test("C8 ① — LE CAS QUI PASSE: un vrai plat dédié n'est PAS accusé", () => {
  // ⚠️ SANS CE CAS, UN REPLI DE PLURIEL TROP LARGE RESSEMBLERAIT À UN
  // DÉTECTEUR QUI MARCHE. Un faux positif ici accuse un vrai plat dédié d'être
  // un clone, et c'est PIRE que de rater le clone: le constat sert à dire au
  // maître ce qu'il a obtenu. La paire est celle de `fri/dinner` du même run —
  // le foyer mange du poulet, Zoé du porc, et les deux listes portent des
  // pluriels des deux côtés.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("fri", "dinner", {
        title: "Chicken, courgette and pepper rice bowls",
        ingredients: [
          { term: "roast chicken thighs" },
          { term: "courgettes" },
          { term: "red peppers" },
          { term: "cooked rice" },
          { term: "olive oil" },
          { term: "lemon" },
        ],
      }),
      plate("fri", "dinner", {
        title: "Pork chops with mashed potatoes and applesauce",
        ingredients: [
          { term: "pork chop" },
          { term: "potatoes" },
          { term: "milk" },
          { term: "butter" },
          { term: "applesauce" },
        ],
      }),
    ],
    preparations: [batch(4)],
    eaterCells: [{ day: "fri", slot: "dinner" }],
  });
  assertEquals(seen.meals, { atTable: 1, dedicated: 1, fromCommonPot: 0, cloned: 0 });
  assertEquals(seen.honoured, true);
  assertEquals(seen.marks.some((m) => m.startsWith("cloned_dish")), false);
});

Deno.test("C8 ① — UN ALIMENT DE DIFFÉRENCE RESTE UN PLAT, MÊME À TAILLE ÉGALE", () => {
  // Le repli de pluriel ne doit RIEN faire de plus que replier un pluriel. Les
  // deux jeux ont la même taille et trois aliments sur quatre en commun: le
  // quatrième les sépare, et il les sépare toujours après C8.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("fri", "breakfast", RUN1_TABLE_BREAKFAST),
      plate("fri", "breakfast", {
        title: "Greek yogurt bowl with peaches and walnuts",
        ingredients: [
          { term: "Greek yogurt" },
          { term: "peach" },
          { term: "granola" },
          { term: "walnuts" },
        ],
      }),
    ],
    preparations: [batch(4)],
    eaterCells: [{ day: "fri", slot: "breakfast" }],
  });
  assertEquals(seen.meals, { atTable: 1, dedicated: 1, fromCommonPot: 0, cloned: 0 });
});

Deno.test("C8 ① — LE TITRE RESTE STRICT, ET C'EST DÉLIBÉRÉ", () => {
  // ⚠️ LE SIGNAL DU TITRE DÉCIDE SEUL, SANS CORROBORATION: élargir le moins
  // étayé des deux est le mauvais bout. Ici deux titres à un pluriel près
  // couvrent DEUX NOURRITURES DIFFÉRENTES — du bœuf pour la table, du poulet
  // pour elle. Replier le pluriel du titre en ferait un clone, c'est-à-dire un
  // vrai plat dédié accusé sur la seule foi d'un `s`.
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("wed", "dinner", {
        title: "Beef and rice bowls",
        ingredients: [{ term: "beef mince" }, { term: "rice" }],
      }),
      plate("wed", "dinner", {
        title: "Beef and rice bowl",
        ingredients: [{ term: "chicken thighs" }, { term: "rice" }],
      }),
    ],
    preparations: [batch(4)],
    eaterCells: [{ day: "wed", slot: "dinner" }],
  });
  assertEquals(seen.meals, { atTable: 1, dedicated: 1, fromCommonPot: 0, cloned: 0 });
});

Deno.test("C8 ① — LE RUN 1 REJOUÉ SUR SA MATIÈRE: 7 dédiés valaient 6 + 1 clone", () => {
  // ⚠️ CE QUE C7 A AFFIRMÉ SANS L'AVOIR MESURÉ. Le message de C7 disait « le
  // 7/9 du run 1 rendrait désormais 6 dédiés et 1 clone »: c'était FAUX au
  // moment où ça a été écrit — rejoué sur la matière brute, C7 rendait 7 dédiés
  // et 0 clone, parce que le seul clone du run se cachait derrière un pluriel.
  // La phrase devient vraie ICI, et pas avant.
  //
  // Les neuf cases de Zoé, les sept qui portaient deux plats, et le clone à
  // `fri/breakfast` — titres et ingrédients du plan archivé.
  const cells = cellsOf(["fri", "sat", "sun"], ["breakfast", "lunch", "dinner"]);
  const seen = observeMergeShape({
    shape: "one_session",
    dishes: [
      plate("fri", "breakfast", RUN1_TABLE_BREAKFAST),
      plate("fri", "breakfast", RUN1_ZOE_BREAKFAST),
      plate("fri", "lunch", {
        title: "Tuna, white bean and tomato salad with bread",
        ingredients: [{ term: "tuna" }, { term: "white beans" }, { term: "bread" }],
      }),
      plate("fri", "lunch", {
        title: "Beef and rice burrito bowl",
        ingredients: [{ term: "beef mince" }, { term: "cooked rice" }, { term: "avocado" }],
      }),
      plate("fri", "dinner", {
        title: "Chicken, courgette and pepper rice bowls",
        ingredients: [{ term: "roast chicken thighs" }, { term: "courgettes" }],
      }),
      plate("fri", "dinner", {
        title: "Pork chops with mashed potatoes and applesauce",
        ingredients: [{ term: "pork chop" }, { term: "potatoes" }],
      }),
      plate("sat", "breakfast", {
        title: "Peach yogurt and almonds",
        ingredients: [{ term: "Greek yogurt" }, { term: "peaches" }, { term: "almonds" }],
      }),
      plate("sat", "breakfast", {
        title: "Oats with peanut butter and banana",
        ingredients: [{ term: "rolled oats" }, { term: "peanut butter" }, { term: "bananas" }],
      }),
      plate("sat", "lunch", {
        title: "Chicken and hummus wraps with salad",
        ingredients: [{ term: "roast chicken thighs" }, { term: "hummus" }, { term: "wraps" }],
      }),
      plate("sat", "lunch", {
        title: "Lamb kofta wrap with bulgur salad",
        ingredients: [{ term: "lamb mince" }, { term: "wrap" }, { term: "bulgur" }],
      }),
      plate("sat", "dinner", {
        title: "Salmon, new potato and green bean plates",
        ingredients: [{ term: "salmon fillets" }, { term: "new potatoes" }],
      }),
      plate("sat", "dinner", {
        title: "Steak with couscous and grilled peppers",
        ingredients: [{ term: "steak" }, { term: "couscous" }],
      }),
      plate("sun", "breakfast", {
        title: "Egg and tomato breakfast tacos",
        ingredients: [{ term: "eggs" }, { term: "tomatoes" }, { term: "tortillas" }],
      }),
      plate("sun", "breakfast", {
        title: "Eggs, ham and buttered toast",
        ingredients: [{ term: "eggs" }, { term: "ham" }, { term: "bread" }],
      }),
      // Les deux plats que le plafond de C7 ② a fait tomber n'existent pas dans
      // le plan archivé: `sun/lunch` et `sun/dinner` n'y portent que l'assiette
      // de la table.
      plate("sun", "lunch", {
        title: "Chickpea and roasted vegetable couscous bowls",
        ingredients: [{ term: "chickpeas" }, { term: "couscous" }],
      }),
      plate("sun", "dinner", {
        title: "Herby turkey meatballs with tomato sauce and polenta",
        ingredients: [{ term: "turkey mince" }, { term: "polenta" }],
      }),
    ],
    preparations: [batch(4)],
    eaterCells: cells,
  });
  assertEquals(seen.meals, { atTable: 9, dedicated: 6, fromCommonPot: 3, cloned: 1 });
  assertEquals(seen.observed, "some_meals_dedicated");
  assert(seen.marks.includes("cloned_dish:fri/breakfast"), seen.marks.join(" | "));
  // ⚠️ ET LES SIX AUTRES CASES DOUBLÉES RESTENT DES PLATS DÉDIÉS. Un repli de
  // pluriel trop large les emporterait toutes, et le constat dirait « clone »
  // là où Zoé a bien mangé autre chose.
  assertEquals(seen.marks.filter((m) => m.startsWith("cloned_dish")).length, 1);
});

Deno.test("C7 ⑤ — LE REPAS QUI TOMBE SUR UNE CIBLE CHIFFRÉE EST NOMMÉ", () => {
  // ⚠️ LE VERROU EST JUSTE ET IL NE BOUGE PAS. Ce qui change est qu'on peut
  // enfin COMPTER quel repas il coûte: mesuré sur quatre fusions, c'est presque
  // toujours le petit-déjeuner — `whey protein 90 g`, puis `protein pancake
  // mix`. Une `issue` qui ne dit pas le créneau rend ce fait incomptable.
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [
      plainDish({
        title: "Morning stack",
        day: "thu",
        slot: "breakfast",
        ingredients: [{ term: "protein pancake mix", quantity: "60 g protein" }],
      }),
    ],
    shopping_list: [],
  }, PARSE_BASE);
  assertEquals(meal.dishes.length, 0);
  assert(
    meal.issues.some((i) => i.includes("dish rejected (thu/breakfast)")),
    meal.issues.join("\n"),
  );
});

// ---------------------------------------------------------------------------
// LOT B — LE CHOIX PLAFONNE LE CALCUL, ET IL ATTEINT LES TROIS BOUTS
//
// ⛔ LE MODULE PUR NE PROUVE QUE LA MOITIÉ, ENCORE. `capCookingShape` peut être
// parfait et n'être appelé nulle part; ou être appelé et ne pas atteindre le
// BUDGET, le BLOC DE RÉGIME et le BLOC DE FUSION. Chacun de ces trois bouts
// promet un plat: un seul qui lit encore le barreau BRUT, et le prompt porte
// deux ordres contradictoires — « ne propose pas de plats séparés » ET « X
// reçoit son propre plat ». Un prompt n'a pas de compilateur; ce test est le
// compilateur.
// ---------------------------------------------------------------------------

Deno.test("LOT B — le mode demandé est LU, et le plafond est appliqué à UN endroit", async () => {
  const src = await generatorSource();
  assert(
    /const askedCookingShape = readCookingShape\(body\.cooking_shape\)/.test(src),
    "le mode de cuisson n'est plus lu de la demande.",
  );
  // ⟳ A2 (2026-09-03) — LE CHOIX ENTRE PAR UN PLAFOND DE STYLE, ET LA PORTE
  // RESTE LA MÊME. « Le moins possible — je réchauffe » et « chacun le sien »
  // se contredisent: deux plats par repas ne se réchauffent pas en trente
  // minutes. Le style plafonne donc le CHOIX avant que `capCookingShape` le
  // compare au calcul — plutôt qu'une seconde comparaison à côté, qui serait
  // le second avis que ce test existe pour interdire.
  assert(
    /const styleCappedShape: CookingShape \| null =\n\s+declaredCapacity\.cookingStyle === "minimal"\n\s+\? "one_dish"\n\s+: askedCookingShape;/
      .test(src),
    "le style ne plafonne plus le choix, ou il le fait ailleurs.",
  );
  assert(
    /const shapeCap = capCookingShape\(computedShape, styleCappedShape\)/.test(src),
    "le plafond n'est plus appliqué, ou il l'est ailleurs qu'à un seul endroit.",
  );
  // ⛔ ET IL PLAFONNE, IL NE FORCE PAS: un style `balanced` ou `keen` — et
  // l'absence de style — laissent le choix traverser intact.
  assert(
    !/capCookingShape\(computedShape, askedCookingShape\)/.test(src),
    "le choix brut atteint encore le plafond: le style ne mord pas.",
  );
  assert(
    /const cookingShape: CookingShape = shapeCap\.shape/.test(src),
    "la forme servie ne vient plus du plafond.",
  );
  // ⛔ ET LE CALCUL N'A PAS ÉTÉ REMPLACÉ. `mergeLadder` et la divergence en
  // composition font leur travail à l'identique: le plafond s'applique APRÈS,
  // sur leur résultat. Un `askedCookingShape` lu à l'intérieur du calcul serait
  // le lot construit à l'envers.
  assert(
    /const computedShape: CookingShape = ladder\?\.shape \?\? compositionShape/.test(src),
    "le calcul ne rend plus la forme trouvée: le choix a remplacé le calcul.",
  );
});

Deno.test("LOT B — les TROIS bouts qui promettent un plat lisent la forme SERVIE", async () => {
  const src = await generatorSource();
  // ① LE BUDGET DE PLATS — celui dont L4 a mesuré le prix (le dîner du dimanche
  //    du foyer, jeté par le parseur).
  assert(
    /shape: cookingShape,\s*ownDishesShown: mergeMaterial\.length/.test(src),
    "le budget de FUSION lit encore le barreau brut.",
  );
  // ② LE BLOC DE RÉGIME — celui qui écrit « their OWN dish is not bound by the
  //    sentence above ». Le servir sous un plafond `one_dish` promettrait un
  //    plat que la ligne de forme interdit, dans le même prompt.
  assert(
    /divergingNames: dishBearingMembers\.map/.test(src),
    "le bloc de régime nomme encore les divergents du CALCUL, pas ceux à qui la " +
      "consigne promet vraiment un plat.",
  );
  // ③ LE BLOC DE FUSION — `buildMergeBlock` écrit la consigne de reprise à
  //    partir de la forme qu'on lui donne.
  const mergeBlockAt = src.indexOf("displayName: mergedMember.displayName");
  assert(mergeBlockAt >= 0, "le bloc de fusion est introuvable — test à réviser");
  assert(
    /displayName: mergedMember\.displayName,[\s\S]{0,400}?shape: cookingShape,/.test(src),
    "le bloc de fusion lit encore le barreau brut.",
  );
});

Deno.test("LOT B — ⛔ le choix est ARCHIVÉ et n'a AUCUN lecteur", async () => {
  const src = await generatorSource();
  // L'ARCHIVE: les trois formes côte à côte. `served` seul se lirait comme la
  // décision du moteur alors que c'est parfois celle de la personne.
  assert(
    /cooking:\s*\{\s*asked: askedCookingShape,\s*computed: computedShape,\s*served: cookingShape,/
      .test(src),
    "`generated_from.household.cooking` ne porte plus les trois formes: " +
      "« pourquoi n'ai-je eu qu'un seul plat ? » redevient sans réponse.",
  );
  // ⛔ ET PERSONNE NE LA RELIT. Le choix se refait à CHAQUE composition; le
  // relire d'un plan précédent le transformerait en réglage de profil —
  // exactement ce que ce lot a refusé d'écrire, et pour le motif du budget
  // déplacé le 2026-08-13.
  assert(
    !/generated_from[\s\S]{0,200}?\.cooking\b|\bcooking\?\.(asked|served|computed)\b/.test(src),
    "un lecteur du choix archivé est apparu: la semaine prochaine appliquerait " +
      "le choix de celle-ci, en silence.",
  );
  assert(
    !/generated_from["']?\s*\)?\s*[\.\[]\s*["']?household["']?[\s\S]{0,80}cooking/.test(src),
    "le choix archivé est relu depuis un plan précédent.",
  );
});

// ---------------------------------------------------------------------------
// LOT C — L'ATTRIBUTION ATTEINT LES TROIS BOUTS, ET ELLE EST COMPTÉE
//
// ⛔ LE MODULE PUR NE PROUVE QUE LA MOITIÉ, ENCORE. Le parseur peut valider
// parfaitement un `for_member_id` que le prompt ne demande à personne, ou que
// le budget ne connaît pas. Trois bouts doivent porter la MÊME liste:
//
//   ① LE PROMPT (`dishBearers`) — sans lui, le modèle n'a rien à quoi attribuer;
//   ② LE PARSEUR (`dishBearerIds`) — sans lui, tout `for_member_id` est refusé;
//   ③ L'ARCHIVE (`dish_owners`) — sans elle, un modèle qui ignorerait la
//      consigne rendrait `member_id: null` partout et le lot ressemblerait trait
//      pour trait à un lot qui marche.
// ---------------------------------------------------------------------------

Deno.test("LOT C — la liste des porteurs atteint le PARSEUR, sur les deux chemins", async () => {
  const src = await generatorSource();
  // Le chemin de FUSION: une seule personne, et seulement au-dessus du barreau ①.
  assert(
    /dishBearerIds: asksForASecondDish\(cookingShape\) && mergedMember !== null\s*\?\s*\[mergedMember\.memberId\]\s*:\s*\[\]/
      .test(src),
    "le budget de FUSION ne porte plus la bouche à qui le plat est dédié.",
  );
  // Le chemin de COMPOSITION: les bouches PLAFONNÉES, jamais le calcul brut.
  assert(
    /dishBearerIds: dishBearingMembers\.map\(\(m\) => m\.memberId\)/.test(src),
    "le budget de COMPOSITION porte les divergents du CALCUL au lieu des bouches " +
      "à qui la consigne promet vraiment un plat: un plat serait attribué à " +
      "quelqu'un que le prompt ne nomme pas, et retiré à toute la table.",
  );
});

Deno.test("LOT C — la liste des porteurs atteint le PROMPT, et c'est la même", async () => {
  const src = await generatorSource();
  assert(/dishBearers: ladder !== null && mergedMember !== null/.test(src),
    "le bloc d'attribution ne reçoit plus la personne reprise sur une fusion.");
  assert(
    /: dishBearingMembers\.map\(\(m\) => \(\{\s*memberId: m\.memberId,\s*displayName: m\.displayName,\s*\}\)\)/
      .test(src),
    "le bloc d'attribution ne reçoit plus les bouches de la composition.",
  );
});

Deno.test("LOT C — ⛔ l'écart demandé/attribué est ARCHIVÉ", async () => {
  // C'est la seule chose qui rende le lot MESURABLE. `for_member_id` est
  // déclaré par le modèle: on ne peut pas savoir d'avance à quelle fréquence il
  // le remplit, seulement le compter. Sans ces nombres, un lot désarmé est
  // indiscernable d'un lot qui marche.
  //
  // ⛔ LOT 3C — ET DEUX NOMBRES DE PLUS, PARCE QUE DEUX SUFFISAIENT À TROMPER.
  // Le 2026-08-17, `attributed: 0` a été rapporté comme « le modèle n'écrit
  // jamais la clé »; l'archive des réponses brutes en montrait deux sur douze
  // qui la portaient, dont une sur une bouche hors liste, refusée par le
  // parseur. « Jamais déclaré » et « déclaré puis refusé » rendaient le même
  // zéro et appellent des corrections opposées.
  const src = await generatorSource();
  assert(
    /const dishOwnersTrace = \{\s*asked: eaterBudget\?\.dedicatedDishesAsked \?\? 0,\s*declared: meal\.dish_owner_counts\.declared,\s*attributed: meal\.dish_owner_counts\.attributed,\s*refused: meal\.dish_owner_counts\.refused,\s*\};/
      .test(src),
    "l'écart entre les plats dédiés RÉCLAMÉS, DÉCLARÉS, ATTRIBUÉS et REFUSÉS " +
      "n'est plus archivé: un modèle qui ignore la consigne redevient " +
      "indiscernable d'un modèle dont on refuse l'attribution.",
  );
  // ⚠️ ET IL EST LISIBLE SUR UN APERÇU. `generated_from` n'existe que sur une
  // ligne ÉCRITE; toute vérification par `intent: "draft"` était donc aveugle,
  // et c'est comme ça que la mesure a été manquée.
  assert(
    /household: \{\s*id: householdId,\s*member_count: members\.length,\s*dish_owners: dishOwnersTrace,/
      .test(src),
    "l'aperçu ne rend plus le compteur: une vérification par brouillon " +
      "redevient aveugle.",
  );
});
