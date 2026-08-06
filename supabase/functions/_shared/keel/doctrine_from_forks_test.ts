// doctrine_from_forks.ts — le sas d'entrée: des camps, une voix, et UN appel.
//
// Les tests qui portent la doctrine de ce fichier:
//   * « le prompt ne contient AUCUNE phrase pré-rédigée du catalogue »
//     -- c'est le seul test structurel qui rende le clonage impossible. Tant
//        qu'aucun texte servi à un élève n'atteint le modèle, il ne peut pas le
//        recopier, et deux coachs aux voix différentes ressortent différents.
//   * « le prompt système porte la règle anti-clone »
//     -- un modèle à qui on donne des camps sans lui dire pourquoi ils doivent
//        être réécrits rend la phrase la plus attendue, c'est-à-dire la même
//        pour tout le monde.
//   * « la cardinalité vient des CHOIX, jamais du modèle »
//     -- une entrée que le modèle ajoute est une conviction qu'aucun écran n'a
//        montrée au coach.
//   * « une génération qui se mord la queue est REFUSÉE »
//     -- un `instead` qui contient sa propre formulation interdite fait bloquer
//        au coach sa propre réponse, en boucle, sans jamais lui dire pourquoi.
//   * « les trois sections survivent à l'aller-retour de l'éditeur »
//     -- toEditorShape a déjà rendu la provenance sur 2 sections sur 3, et le
//        compteur tombait de « 2 of 3 » à « 1 of 3 » au premier rechargement.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildDraftFromForkGeneration,
  buildForkCompilePrompt,
  describeChoices,
  DOCTRINE_FROM_FORKS_SYSTEM_PROMPT,
  hasVoiceSample,
  pairVoiceAnswers,
  VOICE_QUESTIONS,
} from "./doctrine_from_forks.ts";
import { NO_RULE, STARTER_FORKS } from "./doctrine_starter.ts";
import { toEditorShape } from "./doctrine_editor_shape.ts";
import { compileDoctrineBlock, parseCoachDoctrine } from "./doctrine.ts";

const VOICE = pairVoiceAnswers([
  "Bon, on ne se raconte pas d'histoires: tu manges trois fois, tu t'assois, et on regarde la semaine. Si t'as faim a 22h, c'est que le midi etait trop leger. Dis-le moi.",
  "« la semaine », c'est ce qu'on regarde, jamais un jour tout seul.",
  "Des meres de famille qui ont fait dix regimes.",
]);

/** Une génération complète et propre, pour les cas nominaux. */
function generationFor(choices: Record<string, string>): Record<string, unknown> {
  const forks: Record<string, unknown> = {};
  for (const it of describeChoices(choices)) {
    forks[it.forkKey] = {
      claim: `Ma conviction sur ${it.forkKey}`,
      rationale: "parce que c'est comme ca chez moi",
      reason: it.forbidden ? "ca ne tient pas" : null,
      instead: it.forbidden ? "On fait autrement, et je te dis comment." : null,
      answer: it.situation ? "Tu me racontes la journee et on repart demain." : null,
    };
  }
  return { forks, vocabulary: [], voice: {} };
}

// ---------------------------------------------------------------------------
// LES CAMPS, LUS COMME DES INTENTIONS
// ---------------------------------------------------------------------------

Deno.test("un camp devient une INTENTION: le sujet, le camp, et rien de rédigé", () => {
  const [it] = describeChoices({ off_plan_meals: "no_cheat_meal" });
  assertEquals(it.forkKey, "off_plan_meals");
  assertEquals(it.subject, "What you call a meal that wasn't in the plan");
  assertEquals(it.position, "There's nothing to cheat on");
  // Le jeton et les formulations restent CURÉS: du code branche sur le premier,
  // le verrou déterministe matche les secondes. Ce ne sont pas des phrases que
  // quiconque lit dans une conversation.
  assertEquals(it.forbidden?.token, "cheat_meal");
  assert((it.forbidden?.surfaceForms ?? []).includes("cheat meal"));
  assertEquals(it.situation, 'A student writes: "I cracked tonight, I ate everything."');
});

Deno.test("« je ne fais pas de règle » et l'absence de choix ne bloquent rien", () => {
  const out = describeChoices({ hunger: NO_RULE, breakfast: "", counting: "no_counting" });
  assertEquals(out.map((i) => i.forkKey), ["counting"]);
  // Un coach qui ne tranche que trois sujets sur dix génère quand même.
  assertEquals(describeChoices({}).length, 0);
});

Deno.test("les intentions sortent dans l'ordre des DÉBATS, pas des clés reçues", () => {
  // Deux appels aux mêmes choix doivent produire le même prompt. Sans ordre
  // stable, deux coachs identiques diffèrent pour une raison qui n'est pas eux.
  const a = describeChoices({ quick_fixes: "no_detox", breakfast: "breakfast_matters" });
  const b = describeChoices({ breakfast: "breakfast_matters", quick_fixes: "no_detox" });
  assertEquals(a.map((i) => i.forkKey), b.map((i) => i.forkKey));
  assertEquals(a.map((i) => i.forkKey), ["breakfast", "quick_fixes"]);
});

Deno.test("R7 — un jeton inconnu JETTE, il n'est jamais lu « au mieux »", () => {
  assertThrows(() => describeChoices({ hunger: "hunger_is_purple" }));
  assertThrows(() => describeChoices({ no_such_debate: "whatever" }));
  // Y compris quand un autre débat, lui, est valide: valider au fil de
  // l'émission laisserait passer la clé inconnue en silence.
  assertThrows(() => describeChoices({ counting: "no_counting", hunger: "nope" }));
});

// ---------------------------------------------------------------------------
// LE PROMPT — le test qui rend le clonage impossible
// ---------------------------------------------------------------------------

Deno.test("le prompt ne livre QUE le camp tapé — aucune prose du catalogue", () => {
  // LE CŒUR DU LOT. `applyStarterChoices` sème les textes pré-rédigés tels
  // quels, donc deux coachs qui tapent les mêmes camps repartent identiques au
  // mot près. Ici, la prose que l'élève finit par lire — le pourquoi d'une
  // conviction, le remplacement, le motif du refus, la réponse au cas dur —
  // n'atteint JAMAIS le modèle. Il ne peut pas recopier ce qu'il n'a pas.
  //
  // LE LIBELLÉ, LUI, DOIT VOYAGER: c'est littéralement ce sur quoi le coach a
  // tapé, et sans lui le modèle ne connaît pas sa position. C'est cinq mots,
  // pas une doctrine — et deux positions du catalogue (`breakfast_matters`,
  // `kitchen_closes`) ont un libellé qui coïncide avec leur `claim`, ce qui est
  // la limite basse assumée de ce chemin.
  const choices: Record<string, string> = {};
  for (const fork of STARTER_FORKS) {
    const real = fork.positions.find((p) => p.key !== NO_RULE);
    if (real) choices[fork.key] = real.key;
  }
  const prompt = buildForkCompilePrompt({
    intentions: describeChoices(choices),
    voice: VOICE,
  });

  let claimsCheckedBeyondLabel = 0;
  for (const fork of STARTER_FORKS) {
    for (const p of fork.positions) {
      for (
        const written of [
          p.belief?.rationale,
          p.forbidden?.instead,
          p.forbidden?.reason,
          p.arbitration?.coachAnswer,
        ]
      ) {
        if (!written) continue;
        assert(
          !prompt.includes(written),
          `${fork.key}/${p.key}: le prompt livre de la prose à recopier — ${written}`,
        );
      }
      // La conviction rédigée ne voyage pas non plus, sauf quand elle EST le
      // libellé du camp — auquel cas c'est le choix du coach qu'on transmet.
      const claim = p.belief?.claim;
      if (!claim || claim === p.label) continue;
      claimsCheckedBeyondLabel++;
      assert(
        !prompt.includes(claim),
        `${fork.key}/${p.key}: le prompt livre la conviction rédigée — ${claim}`,
      );
    }
  }
  // L'assertion ci-dessus doit avoir de la matière: si un jour tous les
  // libellés devenaient leur propre conviction, elle ne testerait plus rien.
  assert(claimsCheckedBeyondLabel >= 8, "trop peu de convictions distinctes de leur libellé");
});

Deno.test("le prompt porte le jeton, les formulations à ne pas répéter, et la situation", () => {
  const prompt = buildForkCompilePrompt({
    intentions: describeChoices({ counting: "no_counting", hunger: "hunger_is_information" }),
    voice: VOICE,
  });
  assertEquals(prompt.includes("count_calories"), true);
  // Les formulations partent comme une consigne NÉGATIVE: le verrou de sortie
  // les matche, donc un `instead` qui les répète se ferait attraper.
  assert(prompt.includes('Do not repeat these phrasings'));
  assert(prompt.includes('"calorie counting"'));
  assert(prompt.includes('A student writes at 22:00'));
  // Et la voix du coach, qui est la seule source de vocabulaire.
  assert(prompt.includes("« la semaine »"));
});

Deno.test("une réponse de voix vide ne laisse pas une question orpheline", () => {
  const prompt = buildForkCompilePrompt({
    intentions: describeChoices({ counting: "no_counting" }),
    voice: pairVoiceAnswers(["Mon echantillon.", "", ""]),
  });
  assert(prompt.includes("Mon echantillon."));
  assert(!prompt.includes(VOICE_QUESTIONS[1].question));
});

Deno.test("le prompt système porte la règle anti-clone, et l'exigence de vocabulaire", () => {
  // Elle est dans le SYSTÈME et pas dans le message: le message porte des
  // données (dix camps, un échantillon), la tâche porte la règle. Elle doit
  // survivre à un coach qui n'a rempli que trois débats.
  const p = DOCTRINE_FROM_FORKS_SYSTEM_PROMPT;
  assert(p.includes("must not come out with the same sentences"));
  assert(p.includes("INTENTION, not text to copy"));
  // Le vocabulaire du coach est nommé comme LA source, pas comme un bonus.
  assert(p.includes("the only source of vocabulary"));
  // Et les deux gardes de contenu que le catalogue s'impose déjà.
  assert(p.includes("NO NUMBERS ANYWHERE"));
  assert(p.includes("never what a food DOES inside a body"));
});

// ---------------------------------------------------------------------------
// L'ASSEMBLAGE
// ---------------------------------------------------------------------------

Deno.test("la cardinalité vient des CHOIX, jamais du modèle", () => {
  const choices = { counting: "no_counting" };
  const { draft, issues } = buildDraftFromForkGeneration({
    choices,
    voice: VOICE,
    generated: {
      forks: {
        counting: { claim: "Chez moi on ne compte pas.", instead: "On construit l'assiette." },
        // Le modèle invente un onzième débat, et une position que le coach n'a
        // jamais vue à l'écran.
        the_scale: { claim: "Pese-toi tous les jours." },
        made_up: { claim: "N'importe quoi." },
      },
    },
  });
  const beliefs = draft.beliefs as Record<string, unknown>[];
  assertEquals(beliefs.length, 1);
  assertEquals(beliefs[0].claim, "Chez moi on ne compte pas.");
  assertEquals(issues, []);
});

Deno.test("les trois sections sont marquées `starter`, et jamais portées", () => {
  const choices = { off_plan_meals: "no_cheat_meal" };
  const { draft } = buildDraftFromForkGeneration({
    choices,
    voice: VOICE,
    generated: {
      forks: {
        off_plan_meals: {
          claim: "Il n'y a rien a tricher.",
          rationale: "il y a le plan, et les repas pris a cote",
          instead: "Tu me racontes le repas et on continue.",
          answer: "Une soiree n'est pas une semaine. Demain commence au petit-dejeuner.",
        },
      },
      // Le modèle tente une portée: elle ne doit atteindre aucune entrée.
      voice: {},
    },
  });
  for (
    const list of [draft.beliefs, draft.forbidden, draft.arbitrations] as Record<
      string,
      unknown
    >[][]
  ) {
    assertEquals(list.length, 1);
    assertEquals(list[0].source, "starter");
  }
  assertEquals((draft.beliefs as Record<string, unknown>[])[0].goal_scope, []);
  assertEquals((draft.arbitrations as Record<string, unknown>[])[0].goal_scope, []);
  // Le jeton et les formulations viennent du catalogue, pas du modèle.
  const forbidden = (draft.forbidden as Record<string, unknown>[])[0];
  assertEquals(forbidden.token, "cheat_meal");
  assert((forbidden.surface_forms as string[]).includes("cheat day"));
});

Deno.test("un interdit sans remplacement n'est PAS posé, et le coach l'apprend", () => {
  // Un interdit nu dégrade en refus sec, et l'élève de masterclasse n'a aucun
  // canal pour demander mieux. La règle sans la réponse est le pire des deux
  // mondes: on préfère ne pas poser la règle.
  const { draft, issues } = buildDraftFromForkGeneration({
    choices: { counting: "no_counting" },
    voice: VOICE,
    generated: { forks: { counting: { claim: "On ne compte pas.", instead: "  " } } },
  });
  assertEquals((draft.forbidden as unknown[]).length, 0);
  assertEquals((draft.beliefs as unknown[]).length, 1);
  assert(issues.join(" ").includes("no replacement was written"));
});

Deno.test("une conviction ou une réponse manquante est DITE, jamais comblée", () => {
  const { draft, issues } = buildDraftFromForkGeneration({
    choices: { hunger: "hunger_is_information" },
    voice: VOICE,
    generated: { forks: { hunger: {} } },
  });
  assertEquals((draft.beliefs as unknown[]).length, 0);
  assertEquals((draft.arbitrations as unknown[]).length, 0);
  // Deux trous, deux phrases. Combler avec le texte du catalogue rendrait
  // précisément le clone qu'on vient de retirer.
  assertEquals(issues.length, 2);
  assert(issues[0].includes("We could not write your position"));
});

Deno.test("le vocabulaire inventé est LÂCHÉ et compté; le sien passe", () => {
  const { draft, issues } = buildDraftFromForkGeneration({
    choices: { counting: "no_counting" },
    voice: VOICE,
    generated: {
      forks: { counting: { claim: "On ne compte pas.", instead: "On construit l'assiette." } },
      vocabulary: [
        { term: "la semaine", meaning: "ce qu'on regarde, jamais un jour seul" },
        { term: "la fenetre metabolique", meaning: "invente de toutes pieces" },
      ],
    },
  });
  const vocab = draft.vocabulary as Record<string, unknown>[];
  assertEquals(vocab.map((v) => v.term), ["la semaine"]);
  assert(issues.join(" ").includes("la fenetre metabolique"));
});

Deno.test("la voix est normalisée comme le parseur la lira, pas passée telle quelle", () => {
  const { draft } = buildDraftFromForkGeneration({
    choices: { counting: "no_counting" },
    voice: VOICE,
    generated: {
      forks: { counting: { claim: "On ne compte pas.", instead: "On construit l'assiette." } },
      voice: { address: "tu", length: "chatty", emojis: "none", language: "fr-FR" },
    },
  });
  assertEquals(draft.voice, {
    address: "tu",
    // Un jeton hors vocabulaire ne devient pas une consigne muette.
    length: null,
    emojis: "none",
    language: "fr-FR",
  });
});

Deno.test("les sections qu'aucun camp ne touche existent, vides", () => {
  const { draft } = buildDraftFromForkGeneration({
    choices: { counting: "no_counting" },
    voice: VOICE,
    generated: generationFor({ counting: "no_counting" }),
  });
  assertEquals(draft.foods, { discouraged: [] });
  assertEquals(draft.qa, []);
});

// ---------------------------------------------------------------------------
// LE FILET — la doctrine qui se mord la queue
// ---------------------------------------------------------------------------

Deno.test("un `instead` qui déclenche son propre verrou REFUSE la génération", () => {
  // LE PIÈGE EXACT. `instead` est le texte SERVI À L'ÉLÈVE quand le verrou
  // attrape une réponse. S'il porte lui-même une formulation interdite sans
  // négation devant, le remplacement se fait re-attraper: le coach voit son
  // agent bloquer sa propre réponse, en boucle, sans jamais savoir pourquoi.
  const { selfBiting } = buildDraftFromForkGeneration({
    choices: { counting: "no_counting" },
    voice: VOICE,
    generated: {
      forks: {
        counting: {
          claim: "On ne compte pas.",
          instead: "Tu peux count calories une semaine pour apprendre, puis tu arretes.",
        },
      },
    },
  });
  assertEquals(selfBiting.length, 1);
  assert(selfBiting[0].includes("count_calories"));
});

Deno.test("le filet couvre AUSSI les convictions et les réponses aux cas durs", () => {
  // Une réponse de cas dur est injectée dans le bloc comme « He answers: … »:
  // l'agent la recopie. Une réponse qui recommande ce que la doctrine interdit
  // est la même doctrine qui se mord la queue, un cran plus loin.
  const { selfBiting } = buildDraftFromForkGeneration({
    choices: { off_plan_meals: "no_cheat_meal" },
    voice: VOICE,
    generated: {
      forks: {
        off_plan_meals: {
          claim: "Il n'y a rien a tricher.",
          instead: "Tu me racontes et on continue.",
          answer: "Prends un cheat meal la semaine prochaine, ca ira mieux.",
        },
      },
    },
  });
  assertEquals(selfBiting.length, 1);
  assert(selfBiting[0].includes("cheat_meal"));
});

Deno.test("l'agent garde le droit d'EXPLIQUER l'interdit — la négation ne mord pas", () => {
  // Le filet ne doit pas être plus strict que le verrou de production: « on ne
  // compte pas ici » est la doctrine EN TRAIN DE FONCTIONNER.
  const { selfBiting } = buildDraftFromForkGeneration({
    choices: { counting: "no_counting" },
    voice: VOICE,
    generated: {
      forks: {
        counting: {
          claim: "Here we don't count calories.",
          instead: "We don't count calories here. Build the plate and tell me how the day felt.",
        },
      },
    },
  });
  assertEquals(selfBiting, []);
});

Deno.test("une génération nominale sur les dix débats ne mord jamais", () => {
  const choices: Record<string, string> = {};
  for (const fork of STARTER_FORKS) {
    const real = fork.positions.find((p) => p.key !== NO_RULE);
    if (real) choices[fork.key] = real.key;
  }
  const { selfBiting, issues } = buildDraftFromForkGeneration({
    choices,
    voice: VOICE,
    generated: generationFor(choices),
  });
  assertEquals(selfBiting, []);
  assertEquals(issues, []);
});

// ---------------------------------------------------------------------------
// L'ALLER-RETOUR — ce qui est généré doit survivre au premier « enregistrer »
// ---------------------------------------------------------------------------

Deno.test("le brouillon généré passe le parseur de production sans une seule issue", () => {
  const choices: Record<string, string> = {};
  for (const fork of STARTER_FORKS) {
    const real = fork.positions.find((p) => p.key !== NO_RULE);
    if (real) choices[fork.key] = real.key;
  }
  const { draft } = buildDraftFromForkGeneration({
    choices,
    voice: VOICE,
    generated: generationFor(choices),
  });
  const { doctrine, issues } = parseCoachDoctrine({
    ...draft,
    coach_id: "c",
    version: 0,
    content_locale: "fr",
  });
  assertEquals(issues, []);
  assert(doctrine.beliefs.length > 0);
  // Et le bloc compilé porte bien la prose du coach, jamais sa provenance.
  const compiled = compileDoctrineBlock({ ...doctrine, coachDisplayName: "Marlow" }, null);
  assert(!compiled.text.includes("starter"));
  assert(compiled.text.includes("Ma conviction sur counting"));
});

Deno.test("LES TROIS sections gardent leur provenance à travers l'éditeur", () => {
  // LE DÉFAUT MESURÉ, en test, sur LE VRAI TRAJET: `toEditorShape` rendait la
  // provenance sur 2 sections sur 3, et le compteur du bouton publier tombait
  // de « 2 of 3 » à « 1 of 3 » au premier rechargement — il annonçait une
  // appropriation que le coach n'avait pas faite. Un test qui ne couvre qu'une
  // section laisse passer exactement ça.
  const choices = { off_plan_meals: "no_cheat_meal" };
  const { draft } = buildDraftFromForkGeneration({
    choices,
    voice: VOICE,
    generated: {
      forks: {
        off_plan_meals: {
          claim: "Il n'y a rien a tricher.",
          instead: "Tu me racontes le repas et on continue.",
          answer: "Une soiree n'est pas une semaine.",
        },
      },
    },
  });

  // save -> la base -> parseCoachDoctrine -> toEditorShape -> l'écran.
  const { doctrine } = parseCoachDoctrine({
    ...draft,
    coach_id: "c",
    version: 1,
    content_locale: "fr",
  });
  const stored = {
    beliefs: doctrine.beliefs.map((b) => ({ claim: b.claim, source: b.source })),
    forbidden: doctrine.forbidden.map((f) => ({ token: f.token, source: f.source })),
    arbitrations: doctrine.arbitrations.map((a) => ({
      situation: a.situation,
      coach_answer: a.coachAnswer,
      source: a.source,
    })),
  };
  const editor = toEditorShape(stored);

  for (const field of ["beliefs", "forbidden", "arbitrations"] as const) {
    const list = editor[field] as Record<string, unknown>[];
    assertEquals(list.length, 1, `${field}: entry lost on the round trip`);
    assertEquals(list[0].source, "starter", `${field}: provenance lost on the round trip`);
  }
});

// ---------------------------------------------------------------------------
// LES QUESTIONS DE VOIX
// ---------------------------------------------------------------------------

Deno.test("les questions de voix sont trois, courtes, et l'échantillon est en tête", () => {
  assertEquals(VOICE_QUESTIONS.length, 3);
  assertEquals(VOICE_QUESTIONS[0].key, "sample");
  for (const q of VOICE_QUESTIONS) {
    assert(q.question.length < 220, `question trop longue: ${q.question}`);
    assert(q.hint.trim().length > 0, `${q.key}: pas d'aide`);
  }
});

Deno.test("sans échantillon, le sas ne part pas", () => {
  // C'est la seule source de variance. Générer sans elle rend de la prose de
  // manuel, c'est-à-dire la même doctrine pour deux coachs.
  assertEquals(hasVoiceSample([]), false);
  assertEquals(hasVoiceSample(["   "]), false);
  assertEquals(hasVoiceSample(["", "des mots a moi"]), false);
  assertEquals(hasVoiceSample(["voila comment je parle"]), true);
});

Deno.test("les réponses sont appariées par indice, sans trou ni débordement", () => {
  const paired = pairVoiceAnswers(["a", "b"]);
  assertEquals(paired.length, 3);
  assertEquals(paired.map((p) => p.answer), ["a", "b", ""]);
  assertEquals(paired[0].question, VOICE_QUESTIONS[0].question);
  assertEquals(pairVoiceAnswers(["a", "b", "c", "d"]).length, 3);
});
