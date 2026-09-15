// doctrine_document.ts — lire le document d'un coach sans lui mettre de mots
// dans la bouche.
//
// Les tests qui portent la doctrine:
//   * "une proposition sans citation est jetée"
//     -- la citation est le SEUL signal qui distingue « le document le dit » de
//        « le modèle l'a déduit ». Sans elle la liste devient un avis de KEEL
//        présenté sous le nom du coach.
//   * "un slug de groupe inconnu est jeté, jamais rabattu"
//     -- un slug faux ferait comparer une photo à une méthode que le coach n'a
//        pas écrite, et la ligne s'afficherait normalement.
//   * "la fusion ne remplace jamais ce qui est déjà à l'écran"
//     -- le coach a REGARDÉ ce qui est là. Le deuxième document, non.
//   * "un instead absent se remplit"
//     -- c'est le trou qui coûte le plus cher: sans lui le verrou dégrade en
//        refus sec, et l'élève de masterclasse n'a aucun canal pour insister.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildDocumentUserMessage,
  DOCUMENT_COMPILE_SYSTEM_PROMPT,
  foldTerm,
  MAX_DOCUMENT_BASE64_CHARS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
  mergeDoctrineDrafts,
  parseDocumentExtraction,
} from "./doctrine_document.ts";
import { DOCTRINE_COMPILE_SYSTEM_PROMPT } from "./doctrine_versions.ts";

const GROUPS = ["fatty_fish", "non_starchy_veg", "other_added_fat", "lean_protein"];

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

Deno.test("le prompt document CONTIENT le prompt d'interview, il ne le recopie pas", () => {
  // Deux prompts qui disent « n'invente rien » avec deux formulations divergent
  // au premier ajout, et la divergence est invisible: les deux chemins rendent
  // du JSON valide. Ce test casse le jour où quelqu'un duplique le texte.
  assert(DOCUMENT_COMPILE_SYSTEM_PROMPT.startsWith(DOCTRINE_COMPILE_SYSTEM_PROMPT));
});

Deno.test("le prompt document nomme la citation comme condition d'existence", () => {
  assert(DOCUMENT_COMPILE_SYSTEM_PROMPT.includes("THERE IS NO ENTRY"));
  assert(DOCUMENT_COMPILE_SYSTEM_PROMPT.includes("food_proposals"));
});

Deno.test("le message utilisateur énumère le vocabulaire fermé", () => {
  const msg = buildDocumentUserMessage(GROUPS, "methode.pdf");
  for (const slug of GROUPS) assert(msg.includes(slug));
  assert(msg.includes("methode.pdf"));
  // Sans nom de fichier la phrase disparaît, elle ne devient pas « undefined ».
  assert(!buildDocumentUserMessage(GROUPS).includes("undefined"));
});

// ---------------------------------------------------------------------------
// LES PLAFONDS
// ---------------------------------------------------------------------------

Deno.test("le plafond base64 laisse passer le plafond d'octets", () => {
  // base64 gonfle de 4/3. Un plafond de chaîne plus BAS que les octets qu'il
  // est censé autoriser ferait refuser côté serveur un fichier que l'écran
  // vient d'accepter — le pire des deux mondes.
  assert(MAX_DOCUMENT_BASE64_CHARS >= Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4);
  assert(MAX_DOCUMENT_PAGES > 0);
});

// ---------------------------------------------------------------------------
// LA LECTURE
// ---------------------------------------------------------------------------

Deno.test("une proposition sans citation est jetée, et le coach le lit", () => {
  const out = parseDocumentExtraction({
    beliefs: [],
    food_proposals: [
      { term: "Salmon", stance: "encouraged", food_group_ref: "fatty_fish", quote: "" },
      {
        term: "Broccoli",
        stance: "encouraged",
        food_group_ref: "non_starchy_veg",
        quote: "Je mets des légumes verts à chaque assiette.",
      },
    ],
  }, GROUPS);

  assertEquals(out.proposals.map((p) => p.term), ["Broccoli"]);
  assert(out.issues.some((i) => i.includes("Salmon") && i.includes("no quote")));
});

Deno.test("un slug de groupe inconnu est jeté, jamais rabattu sur un voisin", () => {
  const out = parseDocumentExtraction({
    food_proposals: [
      {
        term: "Kéfir",
        stance: "encouraged",
        food_group_ref: "fermented_dairy_maison",
        quote: "Le kéfir, j'en mets partout.",
      },
    ],
  }, GROUPS);

  assertEquals(out.proposals, []);
  assert(out.issues.some((i) => i.includes("unknown food group")));
});

Deno.test("une posture illisible est jetée plutôt que ramenée sur encouraged", () => {
  // Le repli « encouraged » serait le pire: il ferait CONSTRUIRE avec un
  // aliment sur lequel le document disait peut-être l'inverse.
  const out = parseDocumentExtraction({
    food_proposals: [
      { term: "Huile de tournesol", stance: "banned", food_group_ref: "other_added_fat", quote: "Jamais." },
    ],
  }, GROUPS);
  assertEquals(out.proposals, []);
  assert(out.issues.some((i) => i.includes("unreadable stance")));
});

Deno.test("le même aliment nommé deux fois ne fait qu'une décision à prendre", () => {
  const out = parseDocumentExtraction({
    food_proposals: [
      { term: "Saumon", stance: "encouraged", food_group_ref: "fatty_fish", quote: "Du saumon deux fois par semaine." },
      { term: "saumon.", stance: "encouraged", food_group_ref: "fatty_fish", quote: "Le saumon reste ma base." },
    ],
  }, GROUPS);
  assertEquals(out.proposals.length, 1);
});

Deno.test("une citation trop longue est tronquée, pas jetée", () => {
  // La base refuse au-delà de 400. Jeter ferait perdre une vraie lecture pour
  // un problème de rendu; tronquer garde de quoi décider.
  const long = "a".repeat(900);
  const out = parseDocumentExtraction({
    food_proposals: [
      { term: "Sardines", stance: "encouraged", food_group_ref: "fatty_fish", quote: long },
    ],
  }, GROUPS);
  assertEquals(out.proposals.length, 1);
  assert(out.proposals[0].quote.length <= 400);
});

Deno.test("food_proposals ne fuit PAS dans la doctrine enregistrée", () => {
  // Une seconde liste d'aliments à côté du mapping est exactement ce que
  // `foods.recommended` a coûté: deux listes qui divergent, et un coach qui ne
  // sait plus laquelle son agent lit.
  const out = parseDocumentExtraction({
    beliefs: [{ claim: "La faim est une information." }],
    food_proposals: [
      { term: "Saumon", stance: "encouraged", food_group_ref: "fatty_fish", quote: "Du saumon." },
    ],
  }, GROUPS);
  assert(!("food_proposals" in out.draft));
  assertEquals((out.draft.beliefs as unknown[]).length, 1);
});

Deno.test("une sortie vide ne casse rien", () => {
  const out = parseDocumentExtraction(null, GROUPS);
  assertEquals(out.proposals, []);
  assertEquals(out.issues, []);
});

// ---------------------------------------------------------------------------
// LA FUSION
// ---------------------------------------------------------------------------

const BASE = {
  beliefs: [{ claim: "Hunger is information, not weakness", rationale: null, goal_scope: [] }],
  forbidden: [{ token: "six_small_meals", surface_forms: ["six small meals"], reason: null, instead: null }],
  vocabulary: [{ term: "anchor", meaning: "the protein of the plate" }],
  arbitrations: [{ situation: "he cracked on a Friday", coach_answer: "One Friday is not a week.", goal_scope: [] }],
  foods: { discouraged: [{ term: "seed oil", surface_forms: ["seed oil"], reason: null }] },
  qa: [{ question: "Coffee in the morning?", answer: "Yes." }],
  voice: { address: "tu", language: "fr-FR" },
};

Deno.test("sans base, la fusion rend l'arrivant tel quel", () => {
  const incoming = { beliefs: [{ claim: "x" }] };
  assertEquals(mergeDoctrineDrafts(null, incoming), incoming);
});

Deno.test("une conviction déjà à l'écran n'est pas remplacée par sa reformulation", () => {
  const merged = mergeDoctrineDrafts(BASE, {
    beliefs: [
      // Même clé dérivée: la virgule bouge, la conviction non.
      { claim: "Hunger is information not weakness", rationale: "otherwise the meal was built wrong" },
      { claim: "Three meals you sit down for", rationale: null },
    ],
  });
  const beliefs = merged.beliefs as Record<string, unknown>[];
  assertEquals(beliefs.length, 2);
  assertEquals(beliefs[0].claim, "Hunger is information, not weakness");
  // …mais le TROU se remplit: le rationale manquant arrive.
  assertEquals(beliefs[0].rationale, "otherwise the meal was built wrong");
  assertEquals(beliefs[1].claim, "Three meals you sit down for");
});

Deno.test("un instead absent se remplit depuis le document", () => {
  const merged = mergeDoctrineDrafts(BASE, {
    forbidden: [{
      token: "six_small_meals",
      surface_forms: ["grazing all day", "six small meals"],
      instead: "Three meals you sit down for.",
      reason: "it never ends",
    }],
  });
  const f = (merged.forbidden as Record<string, unknown>[])[0];
  assertEquals(f.instead, "Three meals you sit down for.");
  assertEquals(f.reason, "it never ends");
  // Les formulations de surface sont UNIES et dédupliquées.
  assertEquals(f.surface_forms, ["six small meals", "grazing all day"]);
});

Deno.test("un instead déjà écrit n'est jamais réécrit", () => {
  const base = {
    forbidden: [{ token: "t", surface_forms: [], reason: null, instead: "Ce que je dis, moi." }],
  };
  const merged = mergeDoctrineDrafts(base, {
    forbidden: [{ token: "t", surface_forms: [], reason: null, instead: "Ce que le PDF dit." }],
  });
  assertEquals((merged.forbidden as Record<string, unknown>[])[0].instead, "Ce que je dis, moi.");
});

Deno.test("la voix déjà choisie ne bouge pas, les champs vides se remplissent", () => {
  const merged = mergeDoctrineDrafts(BASE, {
    voice: { address: "vous", language: "en-GB", length: "short", emojis: "none" },
  });
  const voice = merged.voice as Record<string, unknown>;
  assertEquals(voice.address, "tu");
  assertEquals(voice.language, "fr-FR");
  assertEquals(voice.length, "short");
  assertEquals(voice.emojis, "none");
});

Deno.test("les aliments déconseillés fusionnent sur le terme replié", () => {
  const merged = mergeDoctrineDrafts(BASE, {
    foods: {
      discouraged: [
        { term: "Seed oil", surface_forms: ["huile de tournesol"], reason: "instables" },
        { term: "Protein bars", surface_forms: ["barre protéinée"], reason: null },
      ],
    },
  });
  const d = (merged.foods as Record<string, unknown>).discouraged as Record<string, unknown>[];
  assertEquals(d.length, 2);
  assertEquals(d[0].term, "seed oil");
  assertEquals(d[0].reason, "instables");
  assertEquals(d[0].surface_forms, ["seed oil", "huile de tournesol"]);
});

Deno.test("le pluriel ne fusionne PAS, et c'est le sens de l'échec qui décide", () => {
  // « seed oils » et « seed oil » restent deux lignes. Un stemming du `s` final
  // les réunirait — et réunirait aussi deux aliments réellement distincts, en
  // en faisant disparaître un SANS que le coach le voie: la ligne survivante a
  // l'air normale. Le défaut inverse (deux lignes voisines) est visible, et il
  // se répare d'un clic.
  //
  // Ce test existe pour que le jour où quelqu'un ajoute un stemming « pour
  // faire propre », il lise d'abord pourquoi on ne l'a pas fait.
  const merged = mergeDoctrineDrafts(BASE, {
    foods: { discouraged: [{ term: "Seed oils", surface_forms: [], reason: null }] },
  });
  const d = (merged.foods as Record<string, unknown>).discouraged as Record<string, unknown>[];
  assertEquals(d.length, 2);
});

Deno.test("les sections absentes de l'arrivant ne vident pas la base", () => {
  // Le cas réel: un document qui ne parle que d'interdits ne doit pas effacer
  // les convictions écrites à l'interview.
  const merged = mergeDoctrineDrafts(BASE, { forbidden: [{ token: "autre", surface_forms: [] }] });
  assertEquals((merged.beliefs as unknown[]).length, 1);
  assertEquals((merged.vocabulary as unknown[]).length, 1);
  assertEquals((merged.qa as unknown[]).length, 1);
  assertEquals((merged.arbitrations as unknown[]).length, 1);
  assertEquals((merged.forbidden as unknown[]).length, 2);
});

Deno.test("la fusion est idempotente: redéposer le même document n'ajoute rien", () => {
  const incoming = {
    beliefs: [{ claim: "Hunger is information, not weakness", rationale: null }],
    forbidden: [{ token: "six_small_meals", surface_forms: ["six small meals"] }],
    qa: [{ question: "Coffee in the morning?", answer: "Yes." }],
  };
  const once = mergeDoctrineDrafts(BASE, incoming);
  const twice = mergeDoctrineDrafts(once, incoming);
  assertEquals(JSON.stringify(once), JSON.stringify(twice));
});

Deno.test("foldTerm plie les accents et la ponctuation, pas le sens", () => {
  assertEquals(foldTerm("Huile de tournesol."), "huile de tournesol");
  assertEquals(foldTerm("  KÉFIR  "), "kefir");
  assertEquals(foldTerm("!!!"), "");
});

// ---------------------------------------------------------------------------
// LES CITATIONS (2026-08-06) — voir `document_corpus.ts`
// ---------------------------------------------------------------------------

Deno.test("la citation d'une entrée SORT du brouillon et devient une citation", () => {
  // LE test du lot. Une `quote` laissée dans le brouillon serait jetée en
  // silence par `parseCoachDoctrine` (qui ignore les champs inconnus): on
  // aurait payé la citation au modèle sans jamais la garder. Et si un jour le
  // parseur la gardait, elle finirait recopiée dans le bloc compilé —
  // c'est-à-dire des pages d'ebook injectées à chaque tour de chaque élève.
  const out = parseDocumentExtraction({
    beliefs: [{
      claim: "Hunger is information, not weakness",
      rationale: null,
      quote: "I tell them hunger is information and never weakness.",
    }],
    forbidden: [{ token: "six_small_meals", surface_forms: ["six small meals"], quote: "Six small meals is a myth." }],
    qa: [{ question: "Coffee?", answer: "Yes.", quote: "Coffee in the morning is fine by me." }],
  }, GROUPS);

  const draftJson = JSON.stringify(out.draft);
  assert(!draftJson.includes("quote"), `le brouillon porte encore une citation: ${draftJson}`);
  assert(!draftJson.includes("hunger is information and never weakness"));

  assertEquals(out.citations.length, 3);
  assertEquals(out.citations.map((c) => c.kind).sort(), ["belief", "forbidden", "qa"]);
  const belief = out.citations.find((c) => c.kind === "belief")!;
  assertEquals(belief.entryKey, "hunger is information not weakness");
  assertEquals(belief.quote, "I tell them hunger is information and never weakness.");
});

Deno.test("une entrée SANS citation est gardée — l'inverse de la règle des aliments", () => {
  // Le coach lit une conviction et la juge directement; il accepte une règle
  // d'aliment sans la juger, d'où la citation obligatoire là et pas ici.
  // Confondre les deux amputerait la doctrine de tout ce qu'un ebook dit sur
  // trois pages sans jamais le résumer en une phrase.
  const out = parseDocumentExtraction({
    beliefs: [{ claim: "Protein at every meal", rationale: null }],
    food_proposals: [{ term: "saumon", stance: "encouraged", food_group_ref: "fatty_fish" }],
  }, GROUPS);

  assertEquals((out.draft.beliefs as unknown[]).length, 1);
  assertEquals(out.proposals.length, 0, "l'aliment sans citation est jete");
  assertEquals(out.citations.length, 0);
  assert(out.issues.some((i) => i.includes("no quote")));
});

Deno.test("le même aliment cité en doctrine ET en proposition ne fait qu'une citation", () => {
  // `foods.discouraged` et `food_proposals` répondent à deux questions sur le
  // MÊME aliment (un filtre de texte / un groupe pour l'écran). Deux citations
  // sur la même clé feraient deux lignes identiques à l'écran, et la base les
  // refuse (unique (document_id, entry_kind, entry_key)).
  const out = parseDocumentExtraction({
    foods: {
      discouraged: [{ term: "huile de tournesol", surface_forms: ["seed oil"], quote: "Je n'utilise pas d'huile de tournesol." }],
    },
    food_proposals: [{
      term: "Huile de tournesol",
      stance: "excluded",
      food_group_ref: "other_added_fat",
      quote: "Elle ne va jamais dans mes assiettes.",
    }],
  }, GROUPS);

  const foodCitations = out.citations.filter((c) => c.kind === "food");
  assertEquals(foodCitations.length, 1);
  // La doctrine passe en premier dans l'ordre de lecture, donc c'est sa
  // citation qui gagne. Le comportement importe moins que le fait qu'il soit
  // DÉTERMINISTE: deux exécutions ne doivent pas donner deux citations.
  assertEquals(foodCitations[0].quote, "Je n'utilise pas d'huile de tournesol.");
  assertEquals(foodCitations[0].entryKey, "huile de tournesol");
});

Deno.test("une citation d'entrée trop longue est tronquée, pas jetée", () => {
  const out = parseDocumentExtraction({
    beliefs: [{ claim: "Protein at every meal", quote: "x".repeat(900) }],
  }, GROUPS);
  assertEquals(out.citations.length, 1);
  assertEquals(out.citations[0].quote.length, 400);
});

Deno.test("une citation sans clé naturelle ne produit pas d'orpheline", () => {
  // `parseCoachDoctrine` jettera l'entrée (claim vide). Une citation qui lui
  // survivrait s'afficherait en face de rien.
  const out = parseDocumentExtraction({
    beliefs: [{ claim: "   ", quote: "Une phrase du document." }],
  }, GROUPS);
  assertEquals(out.citations.length, 0);
});
