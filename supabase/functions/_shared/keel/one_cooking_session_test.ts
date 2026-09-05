import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@^1.0.0";

import { buildMealPrompt, MEAL_PROMPT_VERSION } from "./meal_generation.ts";
import {
  sessionCeilingMinutes,
  singleSessionCookDay,
} from "./plan_feasibility.ts";
import { hasFreezerDeclared } from "./kitchen_equipment.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « TOUT DANS UNE SESSION DE CUISINE » — L'OPTION, ET SA PORTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lot du 2026-09-01. `MEAL_PROMPT_VERSION` : v21 → v22.
 *
 * ── CE QUE L'OPTION EST, ET CE QU'ELLE N'EST PAS ──────────────────────────
 * Elle ne choisit pas un jour de cuisine: elle n'en garde QU'UN — le premier
 * de ceux qui sont cochés et que la fenêtre contient. Trois choses changent
 * ensemble, et c'est pour ça que ce n'est pas « un jour de cuisine de moins »:
 *
 *   ① la consigne NOMME la session unique au lieu de laisser le modèle
 *      répartir (« put every cooking session on those days » en autorisait
 *      trois);
 *   ② `kept: "freezer"` devient RÉCLAMÉ, alors que la clé existait depuis v20
 *      sans que rien ne la demande — et « la prose ne garde rien »: mesuré le
 *      2026-09-01, le modèle écrivait « FREEZE the rest » trois fois en
 *      toutes lettres, huit repas sur vingt-et-un étaient quand même jetés;
 *   ③ la session a le droit de déborder, parce qu'elle porte seule la semaine
 *      PAR CONSTRUCTION — et sans ce troisième point, l'option livrait des
 *      journées vides EN SILENCE (voir le §3).
 *
 * ── LA PORTE EST LE CONGÉLATEUR, ET ELLE EST FAIL-CLOSED ──────────────────
 * Sans lui, un lot ne nourrit que trois jours: une seule session sur sept, ce
 * sont quatre journées qu'aucun lot n'atteint. L'option n'est pas « moins
 * pratique » sans congélateur, elle est FAUSSE. `false` (pas de congélateur) et
 * `null` (jamais demandé) doivent donc rendre le même refus — c'est
 * `hasFreezerDeclared` qui le garantit, et le §4 vérifie que les deux lanes
 * l'appellent plutôt que de comparer à la main.
 */

const PROMPT_BASE = {
  firstDayCookable: true,
  hasFreezer: true,
  oneCookingSession: false,
  cookOnlyDay: null,
  soloBoxes: false,
  contentLocale: "en-US",
  budgetAmount: null,
  dietBlock: "",
  doctrineBlock: "== MARC'S METHOD ==",
  coachNoteBlock: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  protocolBlock: "",
  beliefKeys: [],
  goal: "health" as const,
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "day" as const,
  slot: null,
  servings: 1,
  pantry: [],
  safetyConstraints: null,
  safetyConstraintTable: null,
  body: null,
  focusAxis: null,
  // LE DÉCOR MESURÉ DU 2026-09-01: sept jours, UNE session le dimanche, une
  // heure annoncée, et un congélateur.
  daysToFill: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
  cookDays: ["sun"],
  cookingTimeMin: 60,
  kitchenEquipment: ["oven", "stovetop", "freezer"] as const,
};

// ---------------------------------------------------------------------------
// 1. LE MODULE PUR — quel jour porte la session
// ---------------------------------------------------------------------------

Deno.test("le jour retenu est le PREMIER de la fenêtre, pas le premier jeton", () => {
  // ⚠️ L'ORDRE VIENT DE LA FENÊTRE. Un plan qui part un jeudi a `thu` au rang
  // 0; comparer dans l'ordre lundi→dimanche ferait choisir un dimanche qui,
  // dans cette fenêtre-là, arrive en DERNIER — et les cinq jours d'avant
  // seraient déclarés hors de portée d'un lot pourtant cuisiné à temps.
  assertEquals(
    singleSessionCookDay({
      window: ["thu", "fri", "sat", "sun", "mon"],
      cookDays: ["sun", "thu"],
    }),
    "thu",
  );
});

Deno.test("le PREMIER coché est gardé, pas le dernier", () => {
  // Prendre le dernier laisserait les journées d'avant sans aucun lot: la
  // sortie « on n'en garde qu'un » ne doit pas fabriquer un trou en tête de
  // semaine.
  assertEquals(
    singleSessionCookDay({
      window: ["mon", "tue", "wed", "thu"],
      cookDays: ["wed", "mon"],
    }),
    "mon",
  );
});

Deno.test("aucun jour connu ⇒ `null`, jamais un jour fabriqué", () => {
  // `null` EST une réponse: on ne nomme pas de jour, et la consigne laisse le
  // modèle poser sa session au plus tôt. Fabriquer ici « le premier jour de la
  // fenêtre » remettrait la coupure de 18 h en jeu à un endroit qui n'a pas
  // l'horloge — `addedCookDays` a déjà cette charge.
  assertEquals(singleSessionCookDay({ window: ["mon", "tue"], cookDays: [] }), null);
  // Coché HORS de la fenêtre: pareil, on ne sait pas.
  assertEquals(
    singleSessionCookDay({ window: ["mon", "tue"], cookDays: ["sat"] }),
    null,
  );
  assertEquals(singleSessionCookDay({ window: [], cookDays: ["mon"] }), null);
});

// ---------------------------------------------------------------------------
// 2. LA CONSIGNE — elle NOMME, et elle REMPLACE
// ---------------------------------------------------------------------------

Deno.test("case décochée ⇒ le message est CELUI D'AVANT, au caractère près", () => {
  // La garde qui rend le lot additif plutôt que régressif. Sans elle, une
  // formulation glissée dans le tronc changerait le prompt de TOUS les comptes
  // et rendrait les deux populations de `prompt_version` incomparables.
  const off = buildMealPrompt({ ...PROMPT_BASE }).userMessage;
  assert(!off.includes("in ONE session"));
  assert(!off.includes('MUST carry "kept": "freezer"'));
  // La consigne ordinaire, elle, est bien là.
  assertStringIncludes(off, "they can only cook on: sun");
});

Deno.test("case cochée ⇒ la session unique est NOMMÉE sur son jour", () => {
  const on = buildMealPrompt({ ...PROMPT_BASE, oneCookingSession: true })
    .userMessage;
  assertStringIncludes(on, "done in ONE session, on sun");
  assertStringIncludes(on, 'ONE entry in "cooking_sessions"');
});

Deno.test("⛔ ELLE REMPLACE LA CONSIGNE DES JOURS, elle ne s'y ajoute pas", () => {
  // Deux phrases concurrentes à trois lignes d'écart, et le run réel du
  // 2026-09-01 dit ce que le modèle en fait: il suit la plus permissive, et le
  // parseur jette la différence.
  const on = buildMealPrompt({
    ...PROMPT_BASE,
    cookDays: ["sun", "wed"],
    oneCookingSession: true,
  }).userMessage;
  assert(
    !on.includes("they can only cook on"),
    "la consigne des jours multiples survit à l'option",
  );
  assertStringIncludes(on, "done in ONE session, on sun");
});

Deno.test("la clé de conservation est RÉCLAMÉE, pas suggérée", () => {
  // ⚠️ « La promesse et la clé de schéma doivent se toucher ». Le prompt
  // demandait déjà, en prose, de dire que le surplus part au congélateur; sans
  // clé nommée, le taux de captation mesuré est ZÉRO.
  const on = buildMealPrompt({ ...PROMPT_BASE, oneCookingSession: true })
    .userMessage;
  assertStringIncludes(on, 'MUST carry "kept": "freezer"');
  assertStringIncludes(on, "Saying it in the method is NOT enough");
  // Et elle dit la conséquence, parce que c'est elle qui fait obéir: une part
  // sans la clé est jetée par la fenêtre du frigo.
  assertStringIncludes(on, "it will be thrown away");
});

Deno.test("aucun jour coché ⇒ la session unique est demandée SANS jour inventé", () => {
  const on = buildMealPrompt({
    ...PROMPT_BASE,
    cookDays: [],
    oneCookingSession: true,
  }).userMessage;
  assertStringIncludes(on, "done in ONE session");
  assertStringIncludes(on, "as early in the stretch as you can");
  // ⛔ Aucun jour nommé: on n'a pas décidé, on ne l'affirme pas.
  assert(!on.includes("in ONE session, on "));
});

Deno.test("la consigne vit dans le bloc qui décide d'une session", () => {
  // Même règle de place que l'équipement de cuisine: « il ne peut cuisiner que
  // mardi » et « tout tient en une fois » sont la même question, et le modèle
  // décide de sa session en lisant ce bloc-là.
  const on = buildMealPrompt({ ...PROMPT_BASE, oneCookingSession: true })
    .userMessage;
  const canCook = on.indexOf("-- WHAT THEY CAN COOK --");
  const one = on.indexOf("done in ONE session");
  const thisTime = on.indexOf("-- THIS TIME --");
  assert(canCook >= 0 && one > canCook && one < thisTime);
});

// ---------------------------------------------------------------------------
// 3. LE TEMPS — le piège qui aurait livré des journées vides en silence
// ---------------------------------------------------------------------------

Deno.test("⛔ LA SESSION UNIQUE OUVRE LE PLAFOND, MÊME SANS JOURNÉE HORS DE PORTÉE", () => {
  // ══════════════════════════════════════════════════════════════════════
  // C'EST LE TEST LE PLUS IMPORTANT DU LOT, ET IL EST CONTRE-INTUITIF.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Avec un congélateur, la fenêtre couvre le plan entier: `outOfReachDays`
  // vaut ZÉRO. L'ancienne condition rendait donc `null` — et les soixante
  // minutes déclarées restaient un plafond SEC sur la seule session de la
  // semaine, alors que la consigne traite les minutes comme un plafond
  // (« cook LESS and put the rest on another cooking day »). Avec un seul
  // jour, « le rest » n'a nulle part où aller: le modèle cuisine moins, et la
  // semaine sous-nourrit — la mesure connue des plans à 65–72 % de leur
  // enveloppe.
  assertEquals(
    sessionCeilingMinutes({
      cookingTimeMin: 30,
      outOfReachDays: 0,
      cookDayCount: 1,
      singleSessionAsked: true,
    }),
    // ⚠️ UN LITTÉRAL, PAS `30 * SESSION_OVERRUN_FACTOR`. Un test paramétré par
    // sa propre constante reste vert quand on la change — cicatrice mesurée de
    // ce dépôt, et `fridge_window.ts` la réécrit dans son en-tête. Le facteur
    // lui-même est épinglé par `plan_feasibility_test.ts`.
    60,
  );
  // MUTATION — remettre `singleSessionAsked: false` fait retomber sur `null`,
  // c'est-à-dire sur le défaut qui vidait la semaine.
  assertEquals(
    sessionCeilingMinutes({
      cookingTimeMin: 30,
      outOfReachDays: 0,
      cookDayCount: 1,
      singleSessionAsked: false,
    }),
    null,
  );
});

Deno.test("le paramètre est REQUIS — un appelant qui l'oublie JETTE", () => {
  // Même posture que `hasFreezer` dans `keptWindowDays`: « paramètre de garde
  // optionnel = garde désarmée » est une cicatrice payée sept fois ici.
  assertThrows(
    () =>
      sessionCeilingMinutes(
        { cookingTimeMin: 30, outOfReachDays: 0, cookDayCount: 1 } as never,
      ),
    Error,
    "singleSessionAsked",
  );
});

Deno.test("la permission dit POURQUOI, et ce n'est pas le même motif", () => {
  // ⚠️ DEUX MOTIFS, DEUX PHRASES. Sans l'option, la tension est un CONSTAT
  // (« la semaine ne peut pas être nourrie de ce seul jour »); avec elle,
  // c'est la DEMANDE de la personne — et lui servir le constat lui dirait que
  // son propre choix est un problème.
  const asked = buildMealPrompt({ ...PROMPT_BASE, oneCookingSession: true })
    .userMessage;
  assertStringIncludes(asked, "everything for this stretch is cooked in that single session");
  assertStringIncludes(asked, "up to 120 minutes");

  const constaté = buildMealPrompt({
    ...PROMPT_BASE,
    // Pas de congélateur ⇒ mercredi à samedi sont hors de portée d'un lot du
    // dimanche, et c'est le décor d'origine de la permission.
    hasFreezer: false,
    kitchenEquipment: ["oven", "stovetop"],
  }).userMessage;
  assertStringIncludes(constaté, "they cook on ONE day and this week cannot be fed from it");
});

// ---------------------------------------------------------------------------
// 4. LA SOURCE — les deux lanes lisent le corps, ET passent par la porte
// ---------------------------------------------------------------------------
//
// Même patron que `kitchen_equipment_solo_lane_test.ts` §3: un module pur,
// complet et testé, dont personne n'appelle la fonction est indiscernable d'un
// module absent. Ce dépôt l'a mesuré trois fois.

const LANES: readonly [string, string][] = [
  ["solo", "../../generate-meal-v1/index.ts"],
  ["foyer", "../../generate-household-meal-v1/index.ts"],
];

for (const [name, rel] of LANES) {
  Deno.test(`la lane ${name} LIT \`one_cooking_session\` dans le corps`, async () => {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    // ⚠️ `=== true`, ET LA COMPARAISON EST LA GARDE. Le corps vient du réseau:
    // `"false"`, `0` et `{}` sont truthy ou falsy pour de mauvaises raisons.
    assertStringIncludes(
      src,
      "const askedOneCookingSession = body.one_cooking_session === true;",
    );
  });

  Deno.test(`la lane ${name} passe la demande par la PORTE du congélateur`, async () => {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    // ⛔ `hasFreezerDeclared`, jamais `!== false`: « pas de congélateur » et
    // « jamais demandé » doivent rendre le même refus.
    // ⟳ LOT C (2026-09-04) — LA DEMANDE N'A PLUS QU'UNE ORIGINE, ET C'EST UN
    // RENVERSEMENT ASSUMÉ DE A2 (2026-09-03).
    //
    // A2 avait ajouté « une seule course » (`grocery_runs = 1`) comme seconde
    // origine: acheter une fois, c'est tout cuire d'un coup. Le raisonnement ne
    // tient que SANS congélateur — et ce cas-là est déjà couvert par la poussée
    // « une course en exige deux » de `deriveCookingPlan`. Avec un congélateur,
    // on achète le dimanche, on congèle ce dont mercredi aura besoin, et on
    // cuisine deux fois: la configuration que le produit doit servir, et que
    // cette union rendait impossible.
    //
    // ⛔ CE QUE CE TEST TIENT TOUJOURS: la PORTE est unique, et la demande
    // explicite y entre seule. Une quatrième implémentation du congélateur ne
    // peut toujours pas s'installer à côté.
    assertStringIncludes(
      src,
      "const askedOneSession = askedOneCookingSession;",
    );
    // ⛔ ET LA SECONDE ORIGINE NE DOIT PAS REVENIR. Sans cette absence, un lot
    // futur la remettrait « par symétrie » et refermerait la configuration
    // « une course, deux sessions » sans que rien ne rougisse.
    assert(
      !src.includes("askedOneCookingSession || groceryRuns === 1"),
      "la dérivation « une course ⇒ une session » a été retirée le 2026-09-04 (lot C)",
    );
    assertStringIncludes(
      src,
      "const oneCookingSession = askedOneSession &&\n      hasFreezerDeclared(kitchenEquipment);",
    );
    // ⛔ ET LE REFUS SE COMPTE SUR L'UNION, pas sur la seule case: une course
    // unique refusée faute de congélateur doit être aussi visible qu'une case
    // cochée refusée.
    assertStringIncludes(src, "if (askedOneSession && !oneCookingSession) {");
    // Et le booléen TRANCHÉ est celui qui atteint le tronc — pas la demande.
    assertStringIncludes(src, "      oneCookingSession,");
  });

  Deno.test(`la lane ${name} COMPTE ce que l'option a donné`, async () => {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    // Sans dénominateur, un lot désarmé ressemble à un lot qui marche. Les
    // deux compteurs du congélateur ont déjà payé cette leçon.
    assertStringIncludes(src, "one_cooking_session: ${meal.cooking_sessions.length}/1");
    assertStringIncludes(src, "one_cooking_session_refused: no freezer declared");
  });
}

// ---------------------------------------------------------------------------
// 5. LA PORTE ELLE-MÊME — les trois états, et un seul ouvre
// ---------------------------------------------------------------------------

Deno.test("seule une déclaration POSITIVE ouvre l'option", () => {
  assertEquals(hasFreezerDeclared(["oven", "freezer"]), true);
  // Déclaré sans congélateur ⇒ fermé.
  assertEquals(hasFreezerDeclared(["oven", "stovetop"]), false);
  // ⛔ JAMAIS DEMANDÉ ⇒ FERMÉ AUSSI, et c'est la moitié qui compte. Ouvrir sur
  // une ignorance servirait un plan de sept jours dont le parseur jetterait la
  // moitié.
  assertEquals(hasFreezerDeclared(null), false);
});

Deno.test("le millésime du TRONC est celui d'aujourd'hui — épinglé ici aussi", () => {
  // ⟳ RENOMMÉ LE 2026-09-03, ET LE NOM D'AVANT ÉTAIT DEVENU FAUX.
  // Il disait « la version de prompt a bougé avec ce lot » — vrai quand ce
  // fichier-ci a fait bouger la version, faux dès qu'un AUTRE lot la fait
  // bouger. Un test dont le nom affirme le contraire de ce qu'il vérifie est
  // pire qu'un test absent.
  //
  // CE QU'IL TIENT VRAIMENT: le millésime du tronc est épinglé ICI AUSSI,
  // parce que ce fichier compare des populations dans
  // `generated_from->>'prompt_version'` et qu'un millésime qui bouge sans
  // que ce fichier le sache mélangerait deux populations dans un même
  // dénominateur. Le journal ci-dessous dit QUI l'a fait bouger, et pour
  // quelle population.
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
});
