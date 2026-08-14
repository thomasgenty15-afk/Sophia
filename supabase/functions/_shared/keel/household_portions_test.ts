import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildPortionBrief,
  distinctServingDirections,
  MEMBER_GOALS,
  type MemberGoal,
  memberPortionsPayload,
  type PortionMember,
  reconcilePortions,
  sanitizePortionNote,
} from "./household_portions.ts";
import type { MealBodyContext } from "./meal_body.ts";

const DAD: PortionMember = {
  memberId: "m-dad",
  displayName: "Marc",
  goal: "fat_loss",
  ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};
const SON: PortionMember = {
  memberId: "m-son",
  displayName: "Tom",
  goal: "muscle_gain",
  ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};
const KID: PortionMember = {
  memberId: "m-kid",
  displayName: "Léa",
  goal: null,
  ageState: "minor",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};

/** Un corps entièrement connu, plancher TCA baissé par une lecture réussie. */
const KNOWN_BODY: MealBodyContext = {
  heightCm: 186,
  ageBand: "30_44",
  gender: "male",
  latestWeight: { weekStart: "2026-08-03", value: 84 },
  latestWaist: { weekStart: "2026-08-03", value: 96 },
  restrictionFlag: false,
};

const lineOf = (brief: string, name: string) =>
  brief.split("\n").find((l) => l.startsWith(`- ${name}:`))!;

// ───────────────────────────────────────────────────────────────────────────
// LE BRIEF — ce qui part dans le prompt
// ───────────────────────────────────────────────────────────────────────────

Deno.test("deux objectifs opposés donnent deux directions DIFFÉRENTES sur la même cuisson", () => {
  // C'EST LE CAS QUI JUSTIFIE TOUT LE MODULE. Le père en sèche et le fils en
  // prise de masse: si les deux lignes disaient la même chose, le produit
  // n'aurait rien de plus qu'une app de batch cooking.
  const brief = buildPortionBrief([DAD, SON], "one_dish", 0);
  const dadLine = brief.split("\n").find((l) => l.startsWith("- Marc:"))!;
  const sonLine = brief.split("\n").find((l) => l.startsWith("- Tom:"))!;
  assert(dadLine !== sonLine, "les deux directions doivent différer");
  assert(dadLine.includes("smaller starch"));
  assert(sonLine.includes("larger protein and starch"));
});

Deno.test("le brief interdit explicitement les plats séparés", () => {
  // Un modèle confronté à des directions contradictoires propose volontiers
  // deux plats. Or le produit vend UNE cuisson: sans cette consigne, la
  // promesse tombe au premier foyer aux objectifs divergents.
  const brief = buildPortionBrief([DAD, SON], "one_dish", 0);
  assert(brief.includes("Do NOT propose separate dishes"));
  assert(brief.includes("one cooking session"));
});

Deno.test("un mineur reçoit une TAILLE, jamais une direction d'objectif", () => {
  const brief = buildPortionBrief([KID], "one_dish", 0);
  const line = brief.split("\n").find((l) => l.startsWith("- Léa:"))!;
  assertEquals(line, "- Léa: child-size share of the same dish");
  // Par NÉGATION: aucun vocabulaire d'objectif ne doit atteindre un enfant.
  for (const forbidden of ["starch share", "protein share", "generous vegetables"]) {
    assert(!line.includes(forbidden), `« ${forbidden} » ne doit pas viser un mineur`);
  }
});

Deno.test("le brief ordonne de ne JAMAIS écrire la raison", () => {
  // La consigne est lue à table par tout le foyer. Sans cette phrase, le
  // modèle écrit spontanément « parce que tu es en sèche » — c'est-à-dire
  // divulgue l'objectif d'un membre à ses colocataires.
  const brief = buildPortionBrief([DAD, SON, KID], "one_dish", 0);
  assert(brief.includes("NEVER state a reason"));
  assert(brief.includes("Write what to serve, never why"));
});

Deno.test("un foyer d'une personne ne produit pas de brief", () => {
  // L'entrée du produit est à 1 (PIVOT-FOYER §5): un brief de foyer pour une
  // personne seule serait du bruit dans le prompt.
  assertEquals(buildPortionBrief([], "one_dish", 0), "");
});

Deno.test("un majeur sans objectif déclaré n'est pas traité comme un enfant", () => {
  const adultNoGoal: PortionMember = {
    memberId: "m-x", displayName: "Alex", goal: null, ageState: "adult",
    body: null,
    eatingSlots: null,
    habits: [],
    habitNote: null,
  };
  const line = buildPortionBrief([adultNoGoal], "one_dish", 0).split("\n")
    .find((l) => l.startsWith("- Alex:"))!;
  assertEquals(line, "- Alex: balanced share of every component");
});

// ───────────────────────────────────────────────────────────────────────────
// LOT 3B — LE CORPS ENTRE DANS LE BRIEF, ET RIEN N'EN SORT
//
// Le foyer MIXTE est le décor de toute cette section, parce que c'est le cas
// NOMINAL du produit et pas un cas limite: deux bouches avec un compte et un
// corps, trois sans. Un décor homogène (tout le monde avec corps) laisserait
// passer exactement les défauts que ce lot doit fermer.
// ───────────────────────────────────────────────────────────────────────────

/** Le foyer mixte: Marc a un corps, Tom en a un sous plancher, Léa n'a rien. */
const MIXED: PortionMember[] = [
  { ...DAD, body: KNOWN_BODY },
  { ...SON, body: { ...KNOWN_BODY, heightCm: 174, restrictionFlag: true } },
  KID,
];

Deno.test("PREUVE 1 — la consigne d'un membre AVEC corps diffère de celle SANS corps", () => {
  // C'EST LA RAISON D'ÊTRE DU LOT. Avant lui, réclamer son profil ne changeait
  // RIEN à la portion servie par le foyer: la ligne de Marc était la même avec
  // et sans corps, et le cran 2 du chantier n'existait pas.
  const withBody = lineOf(buildPortionBrief([{ ...DAD, body: KNOWN_BODY }], "one_dish", 0), "Marc");
  const without = lineOf(buildPortionBrief([DAD], "one_dish", 0), "Marc");

  assert(withBody !== without, `les deux lignes sont identiques: ${withBody}`);
  // Et la DIFFÉRENCE est bien le corps, pas un espace de plus.
  assert(withBody.includes("height 186 cm"), withBody);
  assert(withBody.includes("age band 30 to 44"), withBody);
  assert(withBody.includes("gender male"), withBody);
  assert(withBody.includes("weight 84 kg, measured week of 2026-08-03"), withBody);
  assert(withBody.includes("waist 96 cm, measured week of 2026-08-03"), withBody);
  // LA DIRECTION D'OBJECTIF SURVIT. Le corps s'AJOUTE, il ne remplace rien:
  // un lot qui écraserait la bifurcation des portions aurait cassé la douve
  // du produit pour ajouter une mesure.
  assert(withBody.includes("smaller starch share"), withBody);
});

Deno.test("PREUVE 3 — plancher TCA levé ou illisible: AUCUN fait corporel", () => {
  // Le plancher part à `true` et n'est abaissé QUE par une lecture réussie
  // (`household_bodies.ts`). Une lecture en panne arrive donc ici sous cette
  // forme exacte, et elle ne doit rien laisser passer — ni la taille, ni les
  // mesures, ni la bande d'âge, ni le sexe.
  const closed = lineOf(
    buildPortionBrief([{ ...DAD, body: { ...KNOWN_BODY, restrictionFlag: true } }], "one_dish", 0),
    "Marc",
  );
  for (const leak of ["186", "84", "96", "30 to 44", "male", "height", "weight"]) {
    assert(!closed.includes(leak), `« ${leak} » a fui sous plancher: ${closed}`);
  }
  // ÉGALITÉ DE CHAÎNES, pas inspection: un test qui vérifie « il n'y a pas de
  // taille » laisserait passer un crochet vide, un « not stated », ou une
  // marque quelconque — et le plancher deviendrait OBSERVABLE dans le brief,
  // c'est-à-dire qu'il désignerait la personne qu'il protège.
  assertEquals(closed, lineOf(buildPortionBrief([DAD], "one_dish", 0), "Marc"));
});

Deno.test("PREUVE 4 — une bouche sans compte ne casse rien et reste servie", () => {
  // `body: null` est le cas d'une bouche sans compte (ses mesures resteraient
  // clées sur `auth.users`, qu'elle n'a pas). Elle doit garder SA LIGNE et SA
  // direction — pas disparaître du brief, pas se retrouver muette.
  const brief = buildPortionBrief(MIXED, "one_dish", 0);
  assertEquals(lineOf(brief, "Léa"), "- Léa: child-size share of the same dish");
  // Et les trois bouches sont bien là, dans l'ordre du foyer.
  assertEquals(
    brief.split("\n").filter((l) => l.startsWith("- ")).length,
    3,
  );
});

Deno.test("le foyer mixte reste HOMOGÈNE: la consigne d'égalité voyage avec les faits", () => {
  // LE PIÈGE NOMMÉ DU LOT. Deux membres avec corps, trois sans: un modèle à qui
  // on donne plus de matière sur une personne écrit spontanément une consigne
  // plus longue et plus personnelle pour elle, et l'asymétrie se lit à table.
  const brief = buildPortionBrief(MIXED, "one_dish", 0);
  assert(brief.includes("every line must read the same way"), brief);
  assert(brief.includes("only an accident of"), brief);
  // Et le garde-fou anti-dérivation voyage avec, pour la même raison que sur le
  // chemin individuel: taille + poids + âge + sexe est la signature d'entrée
  // d'une formule de métabolisme de base.
  assert(brief.includes("no calorie figure"), brief);
  assert(brief.includes("no BMI"), brief);
});

Deno.test("sans AUCUN corps, le brief est mot pour mot celui d'avant le lot", () => {
  // LA CONDITION DE DÉSARMEMENT. C'est le cas de tous les foyers dont personne
  // n'a réclamé son profil, et c'est ce qui rend le lot additif. Par égalité de
  // chaînes: un garde-fou qui parlerait du corps dans un prompt qui n'en
  // contient aucun serait précisément l'invitation qu'on veut éviter.
  const brief = buildPortionBrief([DAD, SON, KID], "one_dish", 0);
  assert(!brief.includes("bracketed facts"), brief);
  assert(!brief.includes("["), brief);
  assert(!brief.includes("no BMI"), brief);
});

Deno.test("un corps VIDE rend la même ligne qu'un corps absent", () => {
  // Un compte réclamé qui n'a rien saisi ne doit pas se distinguer d'une bouche
  // sans compte: sinon la ligne annonce « celui-là a un compte », ce que
  // personne n'a demandé de publier.
  const empty: MealBodyContext = {
    heightCm: null,
    ageBand: null,
    gender: null,
    latestWeight: null,
    latestWaist: null,
    restrictionFlag: false,
  };
  assertEquals(
    buildPortionBrief([{ ...DAD, body: empty }], "one_dish", 0),
    buildPortionBrief([DAD], "one_dish", 0),
  );
});

Deno.test("UN MINEUR NE REÇOIT AUCUN FAIT CORPOREL, même avec un compte", () => {
  // LA PORTE DE DERRIÈRE DE `goalApplies`. Elle refuse la DIRECTION dérivée
  // d'un objectif; une taille et une pesée posées à côté du prénom d'un enfant
  // rendent cette direction DÉRIVABLE — un modèle qui lit « 41 kg » compose
  // l'assiette qu'il aurait composée pour `fat_loss`. On ne contourne pas
  // `goalApplies` en passant par le corps.
  const teen = buildPortionBrief([{
    ...KID,
    body: { ...KNOWN_BODY, heightCm: 152, latestWeight: { weekStart: "2026-08-03", value: 41 } },
  }], "one_dish", 0);
  assertEquals(lineOf(teen, "Léa"), "- Léa: child-size share of the same dish");
  // Le brief entier, pas seulement la ligne: aucun garde-fou de corps ne doit
  // apparaître non plus, sinon il annonce qu'il y avait quelque chose à cacher.
  assertEquals(teen, buildPortionBrief([KID], "one_dish", 0));
});

Deno.test("une bouche d'ÂGE INCONNU suit le mineur, pas le majeur", () => {
  // Le cas neuf depuis que le compte maître saisit des bouches à la main:
  // « je ne sais pas » et « majeur » doivent produire des résultats OPPOSÉS. Un
  // enfant dont personne n'a saisi la date ne doit pas recevoir les faits
  // corporels d'un adulte.
  const unknown: PortionMember = {
    memberId: "m-u",
    displayName: "Jo",
    goal: "fat_loss",
    ageState: "unknown",
    body: KNOWN_BODY,
    eatingSlots: null,
    habits: [],
    habitNote: null,
  };
  assertEquals(
    buildPortionBrief([unknown], "one_dish", 0),
    buildPortionBrief([{ ...unknown, body: null }], "one_dish", 0),
  );
});

Deno.test("LA MUTATION — retirer le corps du rendu doit faire ROUGIR", () => {
  // « Test paramétré par sa propre constante »: un test qui reste vert quand on
  // change la règle ne mesure rien. On ne peut pas muter le module depuis ici,
  // alors on mute l'ENTRÉE de la seule façon qui compte et on exige que la
  // sortie bouge — dans les DEUX sens.
  const base = buildPortionBrief(MIXED, "one_dish", 0);
  const taller = buildPortionBrief([
    { ...DAD, body: { ...KNOWN_BODY, heightCm: 158 } },
    MIXED[1],
    MIXED[2],
  ], "one_dish", 0);
  assert(base !== taller, "changer la taille ne change pas le brief");
  assert(taller.includes("height 158 cm"), taller);
  assert(!taller.includes("height 186 cm"), taller);
});

// ───────────────────────────────────────────────────────────────────────────
// LA CEINTURE — ce qui ne peut pas sortir dans une consigne
// ───────────────────────────────────────────────────────────────────────────

Deno.test("une consigne de service normale passe telle quelle", () => {
  // Une ceinture qui mord sur tout se fait désarmer dans la semaine. Le cas
  // NOMINAL doit passer, et il est testé en premier pour cette raison.
  const got = sanitizePortionNote("1,5 part de poulet, riz en plus");
  assertEquals(got, { note: "1,5 part de poulet, riz en plus", violations: [] });
});

Deno.test("la raison est refusée — en français", () => {
  const got = sanitizePortionNote("part réduite, tu es en sèche");
  assertEquals(got.note, null);
  assert(got.violations.length > 0);
});

Deno.test("la raison est refusée — en anglais aussi", () => {
  // « garde testée dans une seule langue » est une leçon déjà payée par ce
  // dépôt. Le produit sort en fr-FR par défaut ET en en-US: les deux mordent.
  const got = sanitizePortionNote("smaller portion, you are cutting");
  assertEquals(got.note, null);
  assert(got.violations.length > 0);
});

Deno.test("le corps est refusé, dans les deux langues", () => {
  for (const note of [
    "portion adaptée à ton poids",
    "smaller share for your weight",
    "une part pour maigrir",
    "a share to lose weight",
  ]) {
    assertEquals(sanitizePortionNote(note).note, null, `« ${note} » doit être refusée`);
  }
});

Deno.test("les calories sont refusées — le produit ne les affiche pas", () => {
  assertEquals(sanitizePortionNote("environ 600 kcal").note, null);
  assertEquals(sanitizePortionNote("about 600 calories").note, null);
});

Deno.test("LA NÉGATION NE RACHÈTE RIEN ICI", () => {
  // Le moteur blanchit par défaut les mentions niées, et c'est juste pour le
  // verrou de doctrine (« pain sans gluten »). Ici c'est l'inverse: ce qu'on
  // interdit n'est pas d'ENCOURAGER le sujet, c'est de l'ÉVOQUER devant toute
  // la table. Ce test pinne le réglage `allowNegatedMentions: false`, sans
  // lequel toute la ceinture est contournable d'un « sans ».
  assertEquals(sanitizePortionNote("une part sans perte de poids").note, null);
  assertEquals(sanitizePortionNote("a share with no weight loss").note, null);
});

Deno.test("PREUVE 2 — la ceinture est verte sur les DEUX sorties, FR et EN", () => {
  // LA RÈGLE QUI TIENT LE LOT: l'entrée gagne des faits, la sortie n'en gagne
  // aucun. Le membre AVEC corps et le membre SANS corps passent par la MÊME
  // ceinture, et elle mord pareil sur les deux — c'est le sens de « verte sur
  // les deux sorties ».
  const withBody = { ...DAD, body: KNOWN_BODY };
  const without = SON;

  // (a) LE CAS NOMINAL PASSE, des deux côtés et dans les deux langues. Une
  //     ceinture qui mord sur tout se fait désarmer dans la semaine.
  const clean = reconcilePortions([withBody, without], [
    { member_id: "m-dad", portion_note: "1,5 part de poulet, riz en plus" },
    { member_id: "m-son", portion_note: "a palm-sized share, extra greens" },
  ]);
  assertEquals(clean.portions[0].portionNote, "1,5 part de poulet, riz en plus");
  assertEquals(clean.portions[1].portionNote, "a palm-sized share, extra greens");
  assertEquals(clean.issues, []);

  // (b) LA FUITE MORD, des deux côtés et dans les deux langues. Le membre AVEC
  //     corps n'a AUCUN passe-droit: c'est justement lui dont le modèle a de
  //     quoi parler.
  const leaked = reconcilePortions([withBody, without], [
    { member_id: "m-dad", portion_note: "une part calée sur ton poids" },
    { member_id: "m-son", portion_note: "a share sized for your weight" },
  ]);
  assertEquals(leaked.portions[0].portionNote, null);
  assertEquals(leaked.portions[1].portionNote, null);
  assert(leaked.issues.some((i) => i.startsWith("portion_note_rejected:m-dad:")));
  assert(leaked.issues.some((i) => i.startsWith("portion_note_rejected:m-son:")));
});

Deno.test("LOT 3B — les fuites que le corps rend POSSIBLES sont mordues, FR et EN", () => {
  // VÉRIFIÉ, PAS SUPPOSÉ: avant ce lot, les six phrases ci-dessous PASSAIENT
  // toutes. La liste était armée sur le POIDS et l'OBJECTIF, c'est-à-dire sur
  // ce que le modèle avait de quoi dire — et le brief lui donne maintenant la
  // taille, la bande d'âge et le tour de taille.
  for (const note of [
    "1,5 part vu ta taille",
    "a bigger share for your height",
    "portion calculée selon tes mesures",
    "based on your measurements, one and a half servings",
    "à ton âge, une part plus légère",
    "at your age, a lighter share",
    "part calée sur ton tour de taille",
    "sized on your waist",
    // Le brief dit maintenant « no BMI » en toutes lettres, et ce qui entre
    // dans un prompt finit par en sortir.
    "un IMC correct",
    "keeps your BMI in range",
  ]) {
    assertEquals(sanitizePortionNote(note).note, null, `« ${note} » doit être refusée`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// D2 (QA du 2026-08-12) — LES SIX OBJECTIFS MORDENT, DANS LES DEUX LANGUES
//
// ⚠️ LA LISTE DE SORTIE EST CELLE DU TEXTE LU À VOIX HAUTE À TABLE, et c'est
// elle qui avait gardé l'asymétrie que L6 avait réparée sur l'entrée. Mesuré
// avant ce lot: 2 des 17 lignes ci-dessous mordaient.
// ───────────────────────────────────────────────────────────────────────────

/**
 * LE BANC ADVERSE, ÉCRIT À LA MAIN, UNE ENTRÉE PAR OBJECTIF ET PAR LANGUE.
 *
 * ⚠️ IL N'EST PAS DÉRIVÉ DE LA LISTE D'INTERDITS — un banc qui se paramètre sur
 * la chose qu'il teste reste vert quand on la change. Ce sont des PHRASES, du
 * genre que le modèle écrit vraiment dans une consigne de portion.
 */
const GOAL_LEAKS: Record<MemberGoal, readonly string[]> = {
  fat_loss: [
    "a smaller starch share for fat loss",
    "she is losing fat right now",
    "part de féculent réduite, perte de graisse",
    "perte de gras en cours",
  ],
  muscle_gain: [
    "extra rice for muscle gain",
    "he is building muscle",
    "du riz en plus pour la prise de muscle",
    "une part en plus, prise de masse",
  ],
  recomposition: [
    "recomposition",
    "body recomposition, same plate",
    "recomposition corporelle",
  ],
  performance: [
    "a bigger starch share for performance",
    "féculent en plus pour la performance",
  ],
  health: [
    "a lighter share, for health",
    "une part plus légère, pour sa santé",
  ],
  maintenance: [
    "same share as always, maintenance",
    "même part que d'habitude, maintien du poids",
  ],
};

Deno.test("D2 — LES SIX OBJECTIFS DE `MEMBER_GOALS` MORDENT, EN ET FR", () => {
  // ⚠️ LA BOUCLE PORTE SUR LA CONSTANTE DU PRODUIT, pas sur les clés du banc:
  // un septième objectif ajouté à `MEMBER_GOALS` fait tomber ce test tant que
  // personne n'a écrit comment il se dit dans les deux langues.
  for (const goal of MEMBER_GOALS) {
    const lines = GOAL_LEAKS[goal];
    assert(lines && lines.length >= 2, `aucun rendu écrit pour « ${goal} »`);
    for (const note of lines) {
      const out = sanitizePortionNote(note);
      assertEquals(
        out.note,
        null,
        `[${goal}] « ${note} » doit être refusée — c'est la colonne que D4 ` +
          `interdit d'énoncer, lue à table par tout le foyer`,
      );
    }
  }
});

Deno.test("D2 — CE QUI A MORDU EST NOMMÉ PAR LE JETON DE L'OBJECTIF", () => {
  // La trace doit se relire avec le vocabulaire du produit. Trois objectifs
  // dont le nom EST le jeton, et un dont la forme de surface diffère du sien.
  assertEquals(sanitizePortionNote("for fat loss").violations, ["fat_loss"]);
  assertEquals(sanitizePortionNote("for muscle gain").violations, ["muscle_gain"]);
  assertEquals(sanitizePortionNote("recomposition").violations, ["recomposition"]);
  assertEquals(sanitizePortionNote("pour sa santé").violations, ["sante"]);
});

Deno.test("D2 — LA MOITIÉ QUI COÛTE: `fat` NU NE MORD PAS", () => {
  // ⚠️ « Une garde a besoin d'un cas qui passe. » Le faux positif est réel ici:
  // le mot `fat` est du vocabulaire de cuisine ordinaire, et une ceinture qui
  // mettrait en part standard quiconque reçoit un yaourt allégé se ferait
  // désarmer dans la semaine. Ce qui mord est la SÉQUENCE `fat loss`, jamais le
  // mot seul — et le même arbitrage vaut pour `graisse`, `muscle`, `maintien`
  // et `healthy`.
  for (const note of [
    "low-fat yogurt on the side",
    "trim the fat off the ham",
    "a healthy plate for everyone",
    "un yaourt allégé en matière grasse",
    "graisse de canard pour les pommes de terre",
    "retire le gras du jambon",
    "le muscle du gîte, coupé fin",
    "maintien au chaud pendant 10 minutes",
    "recompose l'assiette avec plus de légumes",
    "sers-lui la même part que d'habitude",
  ]) {
    assertEquals(sanitizePortionNote(note).note, note, `« ${note} » doit passer`);
  }
});

Deno.test("LA FRONTIÈRE — la ceinture ne mord PAS une vraie consigne de service", () => {
  // L'AUTRE MOITIÉ DE L'ARBITRAGE, et elle compte autant. Une ceinture élargie
  // qui mettrait en part standard quelqu'un dont la consigne dit « coupe en
  // morceaux de 3 cm » ferait un dégât silencieux et quotidien.
  //
  // Chacune de ces phrases contient un mot VOISIN d'un interdit: `taille` sans
  // possessif, `mesures` de cuisine, une unité nue, un fromage `affiné`.
  for (const note of [
    "une part de la taille d'une paume",
    "a palm-sized share of the chicken",
    "prends deux mesures de riz",
    "measure the rice with a cup",
    "coupe les carottes en morceaux de 3 cm",
    "sers 150 g de riz et une grosse louche de ragoût",
    "un morceau de fromage affiné",
    "aged cheddar on the side",
    "mets-en dans son assiette sans sauce",
    "put it in the bowl without sauce",
  ]) {
    assertEquals(sanitizePortionNote(note).note, note, `« ${note} » doit passer`);
  }
});

Deno.test("une consigne vide ou absente vaut part standard, sans violation", () => {
  assertEquals(sanitizePortionNote(null), { note: null, violations: [] });
  assertEquals(sanitizePortionNote("   "), { note: null, violations: [] });
  assertEquals(sanitizePortionNote(42), { note: null, violations: [] });
});

// ───────────────────────────────────────────────────────────────────────────
// LA RÉCONCILIATION — trois écarts, trois traitements
// ───────────────────────────────────────────────────────────────────────────

Deno.test("un membre oublié par le modèle est complété, PAS jeté", () => {
  // Perdre la cuisson du samedi soir parce qu'une consigne sur quatre manque
  // serait la vraie perte. On complète et on trace.
  const { portions, issues } = reconcilePortions([DAD, SON, KID], [
    { member_id: "m-dad", portion_note: "1 part" },
    { member_id: "m-son", portion_note: "1,5 part" },
  ]);
  assertEquals(portions.length, 3);
  assertEquals(portions[2].memberId, "m-kid");
  assertEquals(portions[2].portionNote, null);
  assert(issues.includes("portion_missing:m-kid"));
});

Deno.test("une consigne pour un inconnu est JETÉE", () => {
  // Une consigne pour quelqu'un qui n'habite pas là est du texte inventé, et
  // la rendre ferait apparaître un inconnu à table.
  const { portions, issues } = reconcilePortions([DAD], [
    { member_id: "m-dad", portion_note: "1 part" },
    { member_id: "m-ghost", portion_note: "2 parts" },
  ]);
  assertEquals(portions.length, 1);
  assertEquals(portions[0].memberId, "m-dad");
  assert(issues.includes("portion_for_unknown_member:m-ghost"));
});

Deno.test("l'ordre de sortie suit le FOYER, pas le modèle", () => {
  // L'écran doit lister le foyer dans le même ordre d'un repas à l'autre.
  const { portions } = reconcilePortions([DAD, SON, KID], [
    { member_id: "m-kid", portion_note: "petite part" },
    { member_id: "m-son", portion_note: "grande part" },
    { member_id: "m-dad", portion_note: "part normale" },
  ]);
  assertEquals(portions.map((p) => p.memberId), ["m-dad", "m-son", "m-kid"]);
});

Deno.test("une consigne fautive est mise à null ET tracée, le reste survit", () => {
  const { portions, issues } = reconcilePortions([DAD, SON], [
    { member_id: "m-dad", portion_note: "part réduite, déficit calorique" },
    { member_id: "m-son", portion_note: "double portion de riz" },
  ]);
  assertEquals(portions[0].portionNote, null);
  assertEquals(portions[1].portionNote, "double portion de riz");
  assert(issues.some((i) => i.startsWith("portion_note_rejected:m-dad:")));
});

Deno.test("la ceinture mord aussi sur les parts PAR PRÉPARATION", () => {
  // Le piège: nettoyer la consigne principale et laisser passer la même phrase
  // dans une sous-consigne. Le modèle écrit volontiers la raison là où la
  // place manque en haut.
  const { portions, issues } = reconcilePortions([DAD], [{
    member_id: "m-dad",
    portion_note: "1 part",
    preparation_shares: [
      { preparation_id: "p1", note: "moitié moins de riz, tu es en sèche" },
      { preparation_id: "p2", note: "double légumes" },
    ],
  }]);
  assertEquals(portions[0].preparationShares, [{ preparationId: "p2", note: "double légumes" }]);
  assert(issues.some((i) => i.startsWith("share_note_rejected:m-dad:p1:")));
});

Deno.test("une entrée non-tableau ne casse rien: tout le monde en part standard", () => {
  const { portions, issues } = reconcilePortions([DAD, SON], null);
  assertEquals(portions.map((p) => p.portionNote), [null, null]);
  assertEquals(issues, ["portion_missing:m-dad", "portion_missing:m-son"]);
});

Deno.test("le payload stocké est en snake_case, comme la colonne", () => {
  const { portions } = reconcilePortions([DAD], [{
    member_id: "m-dad",
    portion_note: "1 part",
    preparation_shares: [{ preparation_id: "p1", note: "sans riz" }],
  }]);
  assertEquals(memberPortionsPayload(portions), [{
    member_id: "m-dad",
    display_name: "Marc",
    portion_note: "1 part",
    preparation_shares: [{ preparation_id: "p1", note: "sans riz" }],
  }]);
});

// ───────────────────────────────────────────────────────────────────────────
// LES SIX OBJECTIFS DISENT SIX CHOSES (2026-08-11)
//
// Jusqu'à ce lot, `health` et `maintenance` rendaient la MÊME chaîne — qui
// était en plus le repli « aucun objectif ». Un titulaire qui choisissait
// « santé » voyait donc exactement l'assiette de qui n'a rien déclaré: un
// champ qui promet un effet et n'en a aucun. Rien ne l'attrapait, parce
// qu'aucun test n'interrogeait les six ENSEMBLE.
//
// Ce test échoue si deux objectifs re-fusionnent, quel que soit le couple.
// ───────────────────────────────────────────────────────────────────────────
const GOALS_UNDER_TEST = [
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "performance",
  "health",
  "maintenance",
] as const;

function directionFor(goal: PortionMember["goal"]): string {
  const line = buildPortionBrief([{
    memberId: "m-solo",
    displayName: "Solo",
    goal,
    ageState: "adult",
    body: null,
    eatingSlots: null,
    habits: [],
    habitNote: null,
  }], "one_dish", 0).split("\n").find((l) => l.startsWith("- Solo:"))!;
  return line.slice("- Solo: ".length);
}

Deno.test("chacun des six objectifs rend une direction DISTINCTE", () => {
  const seen = new Map<string, string>();
  for (const goal of GOALS_UNDER_TEST) {
    const direction = directionFor(goal);
    const clash = seen.get(direction);
    assert(
      clash === undefined,
      `« ${goal} » rend la même direction que « ${clash} »: "${direction}"`,
    );
    seen.set(direction, goal);
  }
  assertEquals(seen.size, GOALS_UNDER_TEST.length);
});

Deno.test("« santé » ne rend pas l'assiette de qui n'a rien déclaré", () => {
  // LE CAS QUI MANQUAIT. Le repli et `maintenance` peuvent légitimement dire la
  // même chose — ne rien déclarer, c'est demander l'équilibre. `health`, non:
  // c'est un choix, et un choix doit se voir dans l'assiette.
  assert(
    directionFor("health") !== directionFor(null),
    "« santé » rend le repli « aucun objectif »",
  );
});

// ---------------------------------------------------------------------------
// QUAND CHAQUE BOUCHE MANGE — le fait, sur sa propre ligne
// ---------------------------------------------------------------------------

/**
 * ── LE DÉFAUT QUE CE BLOC FERME ───────────────────────────────────────────
 * Le rythme était UNE valeur pour toute la maison, et l'écran le disait: « ça
 * appartient à qui cuisine ». Un ado qui saute le petit-déjeuner et un petit
 * qui goûte à 16 h recevaient donc la même journée — le foyer composait un
 * repas pour quelqu'un qui n'en prend pas.
 *
 * Ce qui est éprouvé ici est la MOITIÉ VISIBLE PAR LE MODÈLE: le fait arrive
 * sur la ligne de la personne, il dit ce qu'il interdit, et il ne dit rien
 * quand personne n'a répondu.
 */
Deno.test("les moments d'une bouche arrivent sur SA ligne", () => {
  const tom: PortionMember = { ...SON, eatingSlots: ["lunch", "dinner"] };
  const brief = buildPortionBrief([DAD, tom], "one_dish", 0);
  const line = brief.split("\n").find((l) => l.startsWith("- Tom:"))!;
  assertStringIncludes(line, "eats at lunch, dinner only");
  // ET PAS SUR CELLE DES AUTRES. Un fait par personne, sinon il ne distingue
  // plus personne.
  const dad = brief.split("\n").find((l) => l.startsWith("- Marc:"))!;
  assert(!dad.includes("eats at"), dad);
});

Deno.test("la consigne dit ce que le fait INTERDIT", () => {
  // Un fait énoncé sans sa conséquence est un fait décoratif: le modèle lit
  // « eats at lunch, dinner » et sert quand même un petit-déjeuner, ou pire,
  // le déplace ailleurs pour « compenser ».
  const brief = buildPortionBrief(
    [{ ...SON, eatingSlots: ["dinner"] }],
    "one_dish",
    0,
  );
  assertStringIncludes(brief, "NO serving at any");
  assertStringIncludes(brief, "do not compensate elsewhere");
});

Deno.test("`null` ne dit RIEN — et surtout pas les moments de la maison", () => {
  // ⚠️ LA LIGNE QUI GARDE LA CICATRICE « coche automatique = faits faux
  // indémentables ». On pourrait recopier ici les moments du foyer pour que
  // chaque ligne soit « complète ». Ce serait écrire, à côté du prénom de
  // quelqu'un, un fait que personne n'a énoncé — et le modèle le lirait comme
  // une déclaration.
  const brief = buildPortionBrief([DAD, SON, KID], "one_dish", 0);
  assert(!brief.includes("eats at"), brief);
  // Et la consigne d'interdiction ne s'invite pas non plus: elle n'a pas de
  // sens sans un « eats at ... only » à qui l'appliquer... sauf qu'elle est
  // écrite une fois pour tout le brief. On vérifie donc l'inverse utile: aucune
  // personne n'est marquée.
  assertEquals(brief.split("eats at").length - 1, 0);
});

Deno.test("un tableau VIDE se comporte comme `null`, jamais comme « jamais »", () => {
  // La base refuse le tableau vide (`empty_rhythm`), mais une ligne écrite
  // avant cette garde, ou un jsonb bricolé à la main, peut en porter un. Il ne
  // doit surtout pas produire « eats at  only » — une consigne vide qui se lit
  // comme « ne le sers jamais ».
  const brief = buildPortionBrief([{ ...SON, eatingSlots: [] }], "one_dish", 0);
  assert(!brief.includes("eats at"), brief);
});

// ---------------------------------------------------------------------------
// LA GARDE DE VACUITÉ DE « QUELLE FAÇON DE MANGER LE PLAT COMMUN SUIT »
//
// L'arbitrage n'a de sujet que si DEUX directions de service s'opposent. Ces
// cas épinglent la seule chose qu'une re-implémentation puisse rater: on
// compare des CHAÎNES, pas des jetons d'objectif.
// ---------------------------------------------------------------------------

Deno.test("deux objectifs OPPOSÉS comptent pour deux directions", () => {
  // LE CAS QUI PASSE — celui du foyer qui a vraiment un arbitrage à trancher.
  // Sans lui, la garde bloquerait tout en ressemblant à une garde qui marche.
  const directions = distinctServingDirections([
    { ageState: "adult", goal: "muscle_gain" },
    { ageState: "adult", goal: "maintenance" },
  ]);
  assertEquals(directions.length, 2);
});

Deno.test("`maintenance` et AUCUN objectif ne font qu'UNE direction", () => {
  // ⚠️ LE PIÈGE, ÉPINGLÉ. `NEUTRAL_DIRECTION` est mot pour mot
  // `SERVING_DIRECTION.maintenance`. Compter les JETONS rendrait 2 ici — et la
  // carte s'afficherait devant un foyer qui n'a rien à trancher, ce qui est
  // exactement le défaut qu'on referme.
  const directions = distinctServingDirections([
    { ageState: "adult", goal: "maintenance" },
    { ageState: "adult", goal: null },
  ]);
  assertEquals(directions.length, 1);
});

Deno.test("deux adultes qui n'ont RIEN déclaré ne font qu'une direction", () => {
  const directions = distinctServingDirections([
    { ageState: "adult", goal: null },
    { ageState: "adult", goal: null },
  ]);
  assertEquals(directions.length, 1);
});

Deno.test("le même objectif deux fois ne fait qu'une direction", () => {
  const directions = distinctServingDirections([
    { ageState: "adult", goal: "fat_loss" },
    { ageState: "adult", goal: "fat_loss" },
  ]);
  assertEquals(directions.length, 1);
});

Deno.test("un âge INCONNU ne porte pas de position", () => {
  // `goalApplies` rend `false` pour `unknown`: la bouche retombe sur la
  // direction neutre. Faire d'une ignorance une position afficherait un
  // arbitrage entre quelqu'un et un point d'interrogation.
  const directions = distinctServingDirections([
    { ageState: "adult", goal: "maintenance" },
    { ageState: "unknown", goal: "muscle_gain" },
  ]);
  assertEquals(directions.length, 1);
});

Deno.test("un jeton d'objectif INCONNU retombe sur la direction neutre", () => {
  // Une colonne élargie, ou une ligne écrite par une version plus récente, ne
  // doit pas produire une septième direction fantôme — ni `undefined`.
  const directions = distinctServingDirections([
    { ageState: "adult", goal: "maintenance" },
    { ageState: "adult", goal: "bulking_but_not_really" },
  ]);
  assertEquals(directions, ["balanced share of every component"]);
});

Deno.test("un foyer VIDE ne porte aucune direction", () => {
  assertEquals(distinctServingDirections([]), []);
});

Deno.test("les six objectifs produisent SIX directions distinctes", () => {
  // ⚠️ SIX AUJOURD'HUI, ET C'EST LA CEINTURE DU PIÈGE. Les six chaînes sont
  // deux à deux différentes; ce que `maintenance` partage, c'est la direction
  // NEUTRE, pas un autre objectif (cas épinglé plus haut). Le jour où deux
  // objectifs se remettent à rendre la même chaîne — ce que `health` a fait
  // pendant des semaines sans que rien n'échoue — ce compte tombe à cinq et le
  // dit. C'est le seul test du dépôt qui ferait rougir cette régression-là.
  const directions = distinctServingDirections(
    MEMBER_GOALS.map((goal: MemberGoal) => ({
      ageState: "adult" as const,
      goal,
    })),
  );
  assertEquals(directions.length, 6);
});

Deno.test("la lecture est idempotente", () => {
  const members = [
    { ageState: "adult" as const, goal: "fat_loss" },
    { ageState: "adult" as const, goal: "performance" },
  ];
  assertEquals(
    distinctServingDirections(members),
    distinctServingDirections(members),
  );
});
