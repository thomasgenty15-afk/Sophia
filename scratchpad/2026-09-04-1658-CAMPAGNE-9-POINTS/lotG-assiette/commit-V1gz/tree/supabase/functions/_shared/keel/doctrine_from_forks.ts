/**
 * LE SAS D'ENTRÉE — dix camps, sa voix, et UN appel qui RÉDIGE.
 * ===========================================================================
 *
 * Autorité: docs/keel/MODEL.md, et l'en-tête de `doctrine_starter.ts` — dont ce
 * fichier est la suite, pas la copie.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME ───────────────────────────────────────
 * `doctrine_starter.ts` dit exister pour éviter les clones: « dix coachs qui
 * adoptent le même bloc, ce sont dix agents qui sortent les mêmes phrases, et le
 * premier coach qui reconnaît son `instead` chez un concurrent arrête de payer ».
 * Le raisonnement est juste.
 *
 * Mais `applyStarterChoices` FABRIQUE ce clonage. Elle sème le texte PRÉ-RÉDIGÉ
 * du catalogue: deux coachs qui tapent les mêmes camps repartent avec des
 * convictions identiques au mot près. Taper un camp ne produit AUCUNE variance —
 * le camp est un choix parmi trois, et un choix ne s'écrit pas tout seul.
 *
 * Seule une RÉÉCRITURE en produit. C'est ce que ce fichier prépare: les camps
 * partent au modèle comme des INTENTIONS (« ce coach ferme la cuisine après le
 * dîner »), jamais comme du texte à recopier, et la seule source de vocabulaire
 * est ce que le coach vient d'écrire de sa main. Deux coachs qui tapent les mêmes
 * camps et parlent différemment repartent avec deux doctrines différentes.
 *
 * ── CE QUI RESTE CURÉ, ET POURQUOI CE N'EST PAS UNE DEMI-MESURE ──────────
 * Le modèle n'écrit QUE de la prose. Il ne choisit ni les jetons d'interdit ni
 * leurs formulations de surface, qui viennent de `STARTER_FORKS` tels quels:
 *
 *   · un `token` est un IDENTIFIANT ASCII sur lequel du code branche (rapport de
 *     violation, incident, écran « pourquoi ça a été régénéré »). Personne ne le
 *     lit jamais dans une conversation, donc deux coachs qui le partagent ne
 *     partagent rien de visible;
 *   · les `surface_forms` sont ce que le VERROU DÉTERMINISTE matche dans la
 *     prose générée. Elles sont testées (unicité des jetons, non-morsure de leur
 *     propre `instead`), et un modèle qui les réinvente à chaque coach rendrait
 *     le verrou aussi fiable que sa dernière génération.
 *
 * La variance va donc exactement là où elle se voit — la conviction, le
 * « pourquoi », le `instead` que l'élève LIT, la réponse au cas dur — et nulle
 * part où elle coûterait une garde.
 *
 * ── LE FILET ─────────────────────────────────────────────────────────────
 * Un `instead` généré qui contiendrait sa propre formulation interdite se ferait
 * attraper par le verrou de sortie: le coach verrait son agent bloquer sa propre
 * réponse, en boucle, sans comprendre. `buildDraftFromForkGeneration` passe donc
 * TOUT ce que le modèle a écrit dans `findDoctrineViolations`, contre l'ensemble
 * des interdits que ces mêmes choix sèment, et REFUSE la génération plutôt que
 * d'écrire une doctrine qui se mord la queue.
 *
 * PUR: aucune I/O, aucune horloge, aucun hasard.
 */

import { deriveBeliefKey, findDoctrineViolations } from "./doctrine.ts";
import {
  NO_RULE,
  type StarterChoices,
  STARTER_FORKS,
  type StarterPosition,
} from "./doctrine_starter.ts";

// ---------------------------------------------------------------------------
// LES QUESTIONS DE VOIX — courtes, et la première est la seule obligatoire
// ---------------------------------------------------------------------------

/**
 * Trois questions, pas onze.
 *
 * L'interview complète est le chemin du coach qui SAIT déjà quoi écrire. Celui
 * qui arrive ici ne sait pas: onze zones de texte vides sont exactement ce qui
 * l'a fait repartir. On lui demande donc le strict nécessaire pour écrire à sa
 * place — un échantillon de sa langue, ses mots, et à qui il parle — et les
 * dix camps font le reste.
 *
 * L'ÉCHANTILLON EST EN PREMIER ET IL EST OBLIGATOIRE. Sans lui il n'y a aucune
 * source de vocabulaire, le modèle écrit du manuel de nutrition, et on a
 * reconstruit le clonage qu'on vient de retirer — en plus cher.
 */
export const VOICE_QUESTIONS: ReadonlyArray<{
  key: "sample" | "words" | "students";
  question: string;
  hint: string;
}> = [
  {
    key: "sample",
    question:
      "Write two or three lines the way you would actually send them to a student. Anything at all — a message you sent this week will do.",
    hint:
      "We copy HOW you write, never what you said here. This is the only thing that stops your agent from sounding like everybody else's.",
  },
  {
    key: "words",
    question:
      "Any word or expression your students would recognise as yours? Say what each one means.",
    hint: "Leave it blank if nothing comes to mind — we will not invent any.",
  },
  {
    key: "students",
    question: "Who do you actually coach?",
    hint:
      "A few words is enough — “women over 40 who have dieted for twenty years”, “amateur runners”.",
  },
];

/** La réponse à une question de voix, appariée à sa question. */
export interface VoiceAnswer {
  question: string;
  answer: string;
}

/**
 * Les réponses POSITIONNELLES du client, appariées aux questions.
 *
 * L'appariement est par INDICE et non par clé, et c'est tenable pour une raison
 * précise: l'écran importe `VOICE_QUESTIONS` depuis CE module — il n'en tient
 * pas une copie. Il n'existe donc pas deux listes qui pourraient se décaler.
 * Une réponse en trop est ignorée, une réponse manquante est vide.
 */
export function pairVoiceAnswers(answers: readonly string[]): VoiceAnswer[] {
  return VOICE_QUESTIONS.map((q, i) => ({
    question: q.question,
    answer: String(answers[i] ?? "").trim(),
  }));
}

/** Le sas ne part pas sans un mot de lui. Voir `VOICE_QUESTIONS`. */
export function hasVoiceSample(answers: readonly string[]): boolean {
  return String(answers[0] ?? "").trim().length > 0;
}

// ---------------------------------------------------------------------------
// LES CAMPS, LUS COMME DES INTENTIONS
// ---------------------------------------------------------------------------

/**
 * Un camp choisi, réduit à ce que le modèle a le droit de savoir.
 *
 * Ce qui est ABSENT de cette forme est le sujet du fichier: ni `belief.claim`,
 * ni `belief.rationale`, ni `forbidden.instead`, ni `arbitration.coachAnswer`.
 * Ce sont les quatre textes que l'élève finit par lire, et les livrer au modèle
 * en lui demandant de les « adapter » rend un paraphrasage — c'est-à-dire le
 * même texte, avec une virgule ailleurs.
 */
export interface ForkIntention {
  forkKey: string;
  /** LE SUJET du débat, jamais une réponse. */
  subject: string;
  /** Le camp, tel qu'il l'a lu et tapé à l'écran. */
  position: string;
  /** L'interdit que ce camp implique. Jeton et formulations CURÉS. */
  forbidden?: { token: string; surfaceForms: readonly string[] };
  /** La situation du cas dur, telle que l'écran la pose. */
  situation?: string;
}

function positionOf(forkKey: string, positionKey: string): StarterPosition {
  const fork = STARTER_FORKS.find((f) => f.key === forkKey);
  // R7 — un débat inconnu JETTE. Le laisser passer « au mieux » signifierait
  // qu'un appel malformé décide de ce qui manque dans la doctrine d'un coach.
  if (!fork) throw new Error(`Unknown starter fork: ${JSON.stringify(forkKey)}`);
  const position = fork.positions.find((p) => p.key === positionKey);
  // R7 — et un jeton de position inconnu JETTE aussi. C'est le pire défaut
  // possible ici: écrire dans la doctrine d'un coach une conviction qu'aucun
  // écran ne lui a montrée.
  if (!position) {
    throw new Error(
      `Unknown starter position ${JSON.stringify(positionKey)} for fork ${JSON.stringify(forkKey)}`,
    );
  }
  return position;
}

/**
 * Les choix du coach → les intentions à faire rédiger.
 *
 * Rendues dans l'ordre de `STARTER_FORKS` et pas dans celui des clés reçues: le
 * prompt doit être déterministe à choix égaux, sinon deux appels identiques
 * diffèrent pour une raison qui n'est pas le coach.
 *
 * `no_rule` (et l'absence de choix) ne rend rien, et NE BLOQUE RIEN. Ne pas
 * trancher est une réponse: l'agent ne dira simplement rien sur le sujet.
 */
export function describeChoices(choices: StarterChoices): ForkIntention[] {
  // Validation D'ABORD, sur toutes les clés reçues — y compris celles d'un débat
  // qui n'existe pas. Valider au fil de l'émission laisserait passer une clé
  // inconnue en silence pour la seule raison qu'aucun débat ne la porte.
  for (const [forkKey, positionKey] of Object.entries(choices)) {
    const chosen = String(positionKey ?? "").trim();
    if (!chosen || chosen === NO_RULE) continue;
    positionOf(forkKey, chosen);
  }

  const out: ForkIntention[] = [];
  for (const fork of STARTER_FORKS) {
    const chosen = String(choices[fork.key] ?? "").trim();
    if (!chosen || chosen === NO_RULE) continue;
    const position = positionOf(fork.key, chosen);
    out.push({
      forkKey: fork.key,
      subject: fork.subject,
      position: position.label,
      forbidden: position.forbidden
        ? {
          token: position.forbidden.token,
          surfaceForms: [...position.forbidden.surfaceForms],
        }
        : undefined,
      situation: position.arbitration?.situation,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

/**
 * Le prompt qui RÉDIGE. Classe A.
 *
 * ── POURQUOI LA RÈGLE ANTI-CLONE EST ÉCRITE ICI ET PAS DANS LE MESSAGE ───
 * Le message utilisateur porte des DONNÉES: dix camps et un échantillon
 * d'écriture. La règle « deux coachs qui tapent les mêmes camps ne doivent pas
 * ressortir avec les mêmes phrases » n'est pas une donnée, c'est la tâche. Elle
 * appartient au système, où elle survit à un message vide, à une réponse courte,
 * et à un coach qui n'a rempli que trois débats sur dix.
 */
export const DOCTRINE_FROM_FORKS_SYSTEM_PROMPT =
  `You write a nutrition coach's doctrine FOR HIM, in HIS words.

He wrote no prose. He tapped a side on a list of debates his field genuinely disagrees about, and he gave you a short sample of the way he talks to his students. Your job is to turn the first into sentences and the second into the voice those sentences are written in.

THE RULE THAT MAKES THIS WORTH DOING, AND THE ONLY ONE THAT CANNOT BE TRADED AWAY: two coaches who tap the SAME sides must not come out with the same sentences. A side is an INTENTION, not text to copy — "this coach closes the kitchen after dinner" is the position, and the words are yours to fit to THIS man. Neutral textbook prose gives ten coaches one agent with one voice, their students read the identical sentence from all of them, and the thing they are paying for stops existing. His sample is the only source of vocabulary, rhythm and register you have. Use it: his verbs, his sentence length, his level of formality, his punctuation, the LANGUAGE he writes in, and the way he addresses a student. Copy the WAY he writes; never reuse the content of his sample.

WHAT YOU MAY NEVER DO: take a position he did not take. The side he tapped is the whole of his position on that subject. You write it in his voice, you do not extend it, soften it, qualify it, or add a second rule that "goes with it". If a side gives you nothing to say beyond restating it, restate it in his words and stop.

Output a single JSON object, nothing else.

{
  "forks": {
    "<the fork key, exactly as given>": {
      "claim":     "...",
      "rationale": "..."|null,
      "reason":    "..."|null,
      "instead":   "..."|null,
      "answer":    "..."|null
    }
  },
  "vocabulary": [{ "term": "...", "meaning": "..."|null }],
  "voice": { "address": "tu"|"vous"|null, "length": "short"|"medium"|null, "emojis": "none"|"light"|null, "language": "BCP-47"|null }
}

ONE ENTRY PER FORK KEY YOU WERE GIVEN, and no others. A key you invent is a conviction no screen ever showed him — he will read it back, not recognise it, and stop trusting the whole thing.

RULES PER FIELD:

- claim: ONE conviction — his side, said the way he would say it to a student. Not a summary of the debate, not "some coaches think X": he is not describing a landscape, he is stating what he does. No hedging, no "it depends".
- rationale: why HE holds it, in one short clause, or null. It is what lets his agent explain instead of assert. Never a health claim: say what this coach DOES, never what a food DOES inside a body.
- NO NUMBERS ANYWHERE. No grams, no calories, no macros, no "eight hours", no "2 litres". This product refuses numeric targets by construction, and a doctrine that carries one puts it back through the side door.
- reason (only when a replacement is asked for): one short clause on why he refuses it, or null.
- instead (only when asked for): what a student LITERALLY READS when the agent has to hold this line in his absence. Three things it must be, all of them at once: in his voice, a complete answer that stands on its own without the question, and about what he DOES rather than what he refuses. His students have no other channel to him — this text is his answer, not a refusal notice.
  A deterministic filter scans this text for the very phrasings listed as "do not repeat". Prefer not naming the practice at all. If you do name it, the negation must sit immediately before it, in the same breath — "we don't count here", "there's no cut-off here" — because anything further away trips the filter and his own replacement gets blocked by his own rule.
- answer (only when a situation is given): what he replies to that exact student, word for word, as a message he would send. This is a few-shot: its whole value is that it sounds like him. Same voice, same length as his sample.
- vocabulary: ONLY the expressions he actually gave you, with the meaning he gave. If he named none, return an empty list. Inventing a word here is the worst thing you can do in this file: it puts a term in his agent's mouth that his students have never heard him use.
- voice: fill a field only when his sample SHOWS it. The sample is evidence, not a guess — if he addresses a student as "tu" in it, address is "tu"; the language he wrote it in is his language; if there is no emoji in a message he chose as typical, that is "none". If he gave no sample, leave every field null.

WHO HE COACHES IS CONTEXT, NOT A RESTRICTION. If he tells you he coaches women over forty, write for them — his examples, his register. Never turn it into a rule that applies to only some students: everything you write here reaches every student he has.`;

/** Le message utilisateur: ses camps, et sa voix. Rien d'autre. */
export function buildForkCompilePrompt(args: {
  intentions: readonly ForkIntention[];
  voice: readonly VoiceAnswer[];
}): string {
  const lines: string[] = [
    "THE SIDES HE TAPPED. Each one is a POSITION HE TOOK, to be written in his words.",
    "The labels below are the screen's wording, not his — never copy them back.",
    "",
  ];
  for (const it of args.intentions) {
    lines.push(`[${it.forkKey}] SUBJECT: ${it.subject}`);
    lines.push(`  HIS SIDE: ${it.position}`);
    if (it.forbidden) {
      lines.push(
        `  ALSO WRITE "instead": the replacement a student reads when his agent has to hold this ` +
          `line (rule id: ${it.forbidden.token}).`,
      );
      const forms = it.forbidden.surfaceForms.filter(Boolean);
      if (forms.length > 0) {
        lines.push(
          `    Do not repeat these phrasings in it: ${forms.map((f) => `"${f}"`).join("; ")}.`,
        );
      }
    }
    if (it.situation) {
      lines.push(`  ALSO WRITE "answer": what he replies to this — ${it.situation}`);
    }
    lines.push("");
  }

  lines.push("HOW HE TALKS. This is the only voice you have; write everything above in it.");
  lines.push("");
  for (const v of args.voice) {
    if (!v.answer) continue;
    lines.push(`Q: ${v.question}`);
    lines.push(`A: ${v.answer}`);
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// L'ASSEMBLAGE — la prose du modèle, la structure de nous
// ---------------------------------------------------------------------------

export interface ForkGenerationResult {
  /** Le brouillon dans la forme de l'éditeur, prêt pour `save`. */
  draft: Record<string, unknown>;
  /** Ce qu'on n'a pas pu écrire, dit au coach. */
  issues: string[];
  /**
   * Les textes générés que le VERROU DU COACH rejetterait. Non vide ⇒ l'appelant
   * refuse la génération: une doctrine dont le remplacement se fait attraper par
   * sa propre règle bloque le coach en boucle sans jamais lui dire pourquoi.
   */
  selfBiting: string[];
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/** Le texte replié, pour vérifier qu'un mot vient bien du coach. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Le brouillon, assemblé DÉTERMINISTIQUEMENT à partir des choix.
 *
 * ── LA CARDINALITÉ VIENT DES CHOIX, JAMAIS DU MODÈLE ─────────────────────
 * On itère les CAMPS et on va chercher la prose correspondante, pas l'inverse.
 * Un modèle qui rendrait une onzième entrée écrirait une conviction qu'aucun
 * écran n'a montrée au coach; ici elle n'a nulle part où atterrir.
 *
 * ── LA PROVENANCE RESTE `starter`, ET C'EST LE BON JETON ─────────────────
 * Le coach a choisi les positions, il n'a pas écrit les mots. C'est exactement
 * le statut d'une ligne semée, donc exactement ce que `claimOnEdit` doit
 * pouvoir lui rendre dès qu'il la réécrit. Une troisième provenance forcerait
 * une troisième branche partout où la deuxième est déjà lue — et le compteur du
 * bouton publier compte des PHRASES QUI NE SONT PAS DE LUI, ce qu'une phrase
 * générée depuis ses camps est aussi.
 */
export function buildDraftFromForkGeneration(args: {
  choices: StarterChoices;
  /** Le JSON rendu par le modèle, tel quel. */
  generated: Record<string, unknown>;
  /** Ce que le COACH a écrit de sa main. Sert à vérifier son vocabulaire. */
  voice: readonly VoiceAnswer[];
}): ForkGenerationResult {
  const { generated } = args;
  const intentions = describeChoices(args.choices);
  const issues: string[] = [];
  const forks = (generated.forks ?? {}) as Record<string, unknown>;

  const beliefs: Record<string, unknown>[] = [];
  const forbidden: Record<string, unknown>[] = [];
  const arbitrations: Record<string, unknown>[] = [];

  for (const it of intentions) {
    const written = (forks[it.forkKey] ?? {}) as Record<string, unknown>;

    const claim = str(written.claim);
    if (claim) {
      beliefs.push({
        key: deriveBeliefKey(claim),
        claim,
        rationale: str(written.rationale) || null,
        // JAMAIS de portée ici. Le sas ne demande pas « pour qui »; déduire une
        // portée de « je coache des femmes de plus de quarante ans » retirerait
        // silencieusement la conviction à tous ses autres élèves.
        goal_scope: [],
        source: "starter",
      });
    } else {
      issues.push(
        `We could not write your position on “${it.subject}” — pick it again, or write it yourself.`,
      );
    }

    if (it.forbidden) {
      const instead = str(written.instead);
      // Un interdit SANS `instead` dégrade en refus sec, et l'élève de
      // masterclasse n'a aucun canal pour demander mieux. On préfère ne pas
      // poser la règle du tout plutôt que de livrer la règle sans la réponse.
      if (instead) {
        forbidden.push({
          token: it.forbidden.token,
          surface_forms: [...it.forbidden.surfaceForms],
          reason: str(written.reason) || null,
          instead,
          source: "starter",
        });
      } else {
        issues.push(
          `“${it.subject}”: no replacement was written, so the red line was left out — ` +
            `a red line without your answer gives your students a flat refusal.`,
        );
      }
    }

    if (it.situation) {
      const answer = str(written.answer);
      if (answer) {
        arbitrations.push({
          situation: it.situation,
          coach_answer: answer,
          goal_scope: [],
          source: "starter",
        });
      } else {
        issues.push(`No answer was written for: ${it.situation}`);
      }
    }
  }

  // ── LE VOCABULAIRE — le sien, ou rien ─────────────────────────────────
  // Un terme que le coach n'a pas écrit est un mot que ses élèves ne lui ont
  // jamais entendu dire. Le prompt l'interdit; on le VÉRIFIE, parce qu'un
  // prompt est une consigne et pas une garantie.
  const saidByCoach = fold(args.voice.map((v) => v.answer).join("\n"));
  const vocabulary: Record<string, unknown>[] = [];
  for (const raw of Array.isArray(generated.vocabulary) ? generated.vocabulary : []) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const term = str(entry.term);
    if (!term) continue;
    if (saidByCoach && !saidByCoach.includes(fold(term))) {
      issues.push(`We left out the word “${term}” — we could not find it in what you wrote.`);
      continue;
    }
    vocabulary.push({ term, meaning: str(entry.meaning) || null });
  }

  const voiceRaw = (generated.voice ?? {}) as Record<string, unknown>;
  const length = str(voiceRaw.length);
  const emojis = str(voiceRaw.emojis);
  const voice: Record<string, unknown> = {
    address: str(voiceRaw.address) || null,
    length: length === "short" || length === "medium" ? length : null,
    emojis: emojis === "none" || emojis === "light" ? emojis : null,
    language: str(voiceRaw.language) || null,
  };

  const draft: Record<string, unknown> = {
    beliefs,
    forbidden,
    vocabulary,
    arbitrations,
    // Les sections qu'aucun camp ne touche existent quand même, vides: un
    // brouillon partiel fait planter l'éditeur sur `draft.foods.discouraged`.
    foods: { discouraged: [] },
    qa: [],
    voice,
  };

  // ── LE FILET ──────────────────────────────────────────────────────────
  // TOUT ce que le modèle a écrit passe devant le verrou du coach, contre
  // l'ensemble des interdits que ces mêmes choix sèment. Pas seulement les
  // `instead`: un cas dur dont la réponse recommande ce que la doctrine
  // interdit est servi à l'agent comme un exemple à suivre, et c'est la même
  // doctrine qui se mord la queue.
  const lock = {
    forbidden: forbidden.map((f) => ({
      token: String(f.token),
      surfaceForms: (f.surface_forms as string[]) ?? [],
      instead: String(f.instead ?? ""),
    })),
    foods: { discouraged: [] },
  };
  const selfBiting: string[] = [];
  const check = (where: string, text: string) => {
    if (!text) return;
    for (const v of findDoctrineViolations(text, lock)) {
      selfBiting.push(`${where} endorses ${v.token} (“${v.matchedText}”)`);
    }
  };
  for (const b of beliefs) {
    check(`belief “${String(b.claim)}”`, String(b.claim));
    check(`the reason behind “${String(b.claim)}”`, String(b.rationale ?? ""));
  }
  for (const f of forbidden) {
    check(`the replacement for ${String(f.token)}`, String(f.instead ?? ""));
  }
  for (const a of arbitrations) {
    check(`the answer to “${String(a.situation)}”`, String(a.coach_answer));
  }

  return { draft, issues, selfBiting };
}
