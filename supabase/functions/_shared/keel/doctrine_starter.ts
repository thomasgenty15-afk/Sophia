/**
 * LE POINT DE DÉPART — LES DÉBATS DU MÉTIER, ET LEURS CAMPS.
 * ===========================================================================
 *
 * Autorité: docs/keel/MODEL.md, docs/keel/CONTRACT.md, et l'en-tête de
 * `coach-protocol-v1/index.ts` (« le modèle n'écrit jamais de nutrition »).
 *
 * ── CE QUE CE FICHIER N'EST PAS, ET C'EST TOUT LE SUJET ──────────────────
 * Ce n'est PAS une doctrine par défaut. KEEL ne livre aucune position
 * nutritionnelle sous le nom d'un coach.
 *
 * Ce qui est livré ici est la LISTE DES DÉSACCORDS que le métier a vraiment,
 * et pour chacun les positions qui existent réellement, écrites comme les dirait
 * un coach qui les tient. Le coach tape son camp. Ce qui atterrit dans sa
 * doctrine est SON choix.
 *
 * C'est le même geste que `/coach/protocol` a déjà posé et qui est écrit à
 * l'écran: « Methods like yours usually have something to say about: … What do
 * you think? » — on livre le SUJET, jamais la réponse.
 *
 * ── POURQUOI PAS UNE DOCTRINE PRÊTE À ADOPTER ────────────────────────────
 * Deux raisons, et la première n'est pas juridique.
 *
 * 1. LES CLONES. Ce produit se vend sur « c'est MON agent, dans MA voix ». Dix
 *    coachs qui adoptent le même bloc sans le retoucher, ce sont dix agents qui
 *    sortent les mêmes phrases — et le premier coach qui reconnaît son
 *    `instead` mot pour mot chez un concurrent arrête de payer. Ici, deux
 *    coachs qui ne sont pas d'accord repartent avec deux doctrines
 *    différentes: les débats sont le GÉNÉRATEUR DE VARIANCE, pas un habillage.
 *
 * 2. UNE DOCTRINE EST CONTRARIANTE PAR CONSTRUCTION. L'interview demande
 *    littéralement « qu'est-ce que tu crois que la plupart des coachs de ton
 *    domaine contesteraient ? ». Une doctrine que tout le monde peut adopter
 *    est une doctrine que personne ne conteste — donc pas une doctrine.
 *
 * ── CE QUI SE TROUVE DANS CHAQUE POSITION, ET POURQUOI ───────────────────
 * Une position sème une CROYANCE, et souvent l'INTERDIT qui va avec, avec son
 * `instead` rédigé. C'est délibéré: `instead` est le champ le plus souvent vide
 * d'une doctrine réelle, et c'est LITTÉRALEMENT ce qu'un élève lit quand le
 * verrou remplace une réponse. Un tap qui remplit les deux fait plus pour la
 * qualité de l'agent que dix minutes d'interview.
 *
 * Trois positions sèment aussi une ARBITRATION, et ce sont exactement les trois
 * cas durs que l'interview pose mot pour mot (« j'ai craqué », « j'ai faim à
 * 22h », « ton plan c'est trop de nourriture »). Ce sont les trois cases que
 * les coachs laissent le plus souvent blanches.
 *
 * ── LES RÈGLES D'ÉCRITURE DU CONTENU, QUI NE SE NÉGOCIENT PAS ────────────
 *   · aucune allégation de santé. Une position dit ce qu'un coach FAIT, jamais
 *     ce qu'un aliment PROVOQUE dans un corps;
 *   · aucune cible chiffrée. Le produit les refuse par construction
 *     (`meal_generation.ts`, garantie 1), et une position qui en porterait une
 *     réintroduirait par la porte du préréglage ce que le générateur retire;
 *   · chaque `no_rule` existe. « Je ne fais pas de règle là-dessus » est une
 *     réponse, et sans elle un coach coche une position qu'il ne tient pas
 *     juste pour avancer. Même raisonnement que « NEUTRE = ABSENCE DE LIGNE »
 *     sur `coach_food_items`.
 *
 * PUR: aucune I/O, aucune horloge, aucun hasard.
 */

import { deriveBeliefKey } from "./doctrine.ts";

// ---------------------------------------------------------------------------
// LES FORMES
// ---------------------------------------------------------------------------

export interface StarterBeliefSeed {
  claim: string;
  rationale?: string;
}

export interface StarterForbiddenSeed {
  /** ASCII snake_case (R1) — du code branche dessus. Unique sur tout le jeu. */
  token: string;
  surfaceForms: readonly string[];
  reason?: string;
  /** Jamais vide: un interdit sans `instead` dégrade en refus sec. */
  instead: string;
}

export interface StarterArbitrationSeed {
  situation: string;
  coachAnswer: string;
}

export interface StarterPosition {
  key: string;
  /** Ce sur quoi le coach tape: sa position, dite comme il la dirait. */
  label: string;
  belief?: StarterBeliefSeed;
  forbidden?: StarterForbiddenSeed;
  arbitration?: StarterArbitrationSeed;
}

export interface StarterFork {
  key: string;
  /** LE SUJET, jamais une position. C'est la ligne qui garde KEEL neutre. */
  subject: string;
  positions: readonly StarterPosition[];
}

/** Le jeton d'une position qui ne sème rien. Présent dans CHAQUE débat. */
export const NO_RULE = "no_rule";

const NO_RULE_POSITION: StarterPosition = {
  key: NO_RULE,
  label: "I don't make a rule about this",
};

// ---------------------------------------------------------------------------
// LES DÉBATS
// ---------------------------------------------------------------------------

export const STARTER_FORKS: readonly StarterFork[] = [
  {
    key: "meal_frequency",
    subject: "How often your students eat",
    positions: [
      {
        key: "three_meals",
        label: "Three meals, and the kitchen closes in between",
        belief: {
          claim: "Three meals a day, sat down, and the kitchen closes in between",
          rationale:
            "grazing from morning to night teaches nobody to recognise their own hunger",
        },
        forbidden: {
          token: "six_small_meals",
          surfaceForms: [
            "six small meals",
            "small frequent meals",
            "eat every three hours",
            "graze through the day",
            "grazing all day",
          ],
          reason: "It never ends, and it never teaches anything.",
          instead:
            "Three meals you sit down for. If you're hungry between them, the last one was built wrong — tell me and we'll fix the meal, not add another one.",
        },
        arbitration: {
          situation: "A student says your plan is too much food.",
          coachAnswer:
            "Then eat what you can and tell me which meal you left. Three meals that actually happen beat four that look right on paper.",
        },
      },
      {
        key: "meals_plus_planned_snack",
        label: "Three meals and one snack, decided in advance",
        belief: {
          claim: "Three meals and one snack you decided on in advance",
          rationale:
            "a snack that is planned is part of the plan; one that isn't is usually a symptom of a meal that was too small",
        },
      },
      {
        key: "frequency_is_theirs",
        label: "However suits their day — I don't set the rhythm",
        belief: {
          claim: "The rhythm of the day belongs to the student, not to me",
          rationale:
            "a schedule that fits somebody else's life is a schedule that gets abandoned in week three",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "breakfast",
    subject: "Whether the day has to start with a meal",
    positions: [
      {
        key: "breakfast_matters",
        label: "Eat something in the morning",
        belief: {
          claim: "Eat something in the morning",
          rationale: "the day you skip it is usually the day the evening runs the show",
        },
        forbidden: {
          token: "skip_breakfast",
          surfaceForms: [
            "skip breakfast",
            "skipping breakfast",
            "no breakfast",
            "just have a coffee for breakfast",
          ],
          instead:
            "Have something in the morning, even small. That is what makes the evening manageable.",
        },
      },
      {
        key: "breakfast_optional",
        label: "Only if they're hungry",
        belief: {
          claim: "Breakfast is a habit, not a requirement",
          rationale: "if you're not hungry in the morning, forcing it is not a discipline",
        },
        forbidden: {
          token: "must_eat_breakfast",
          surfaceForms: [
            "you must eat breakfast",
            "breakfast is the most important meal",
            "never skip breakfast",
            "always eat breakfast",
          ],
          instead:
            "If you're not hungry in the morning, don't force it. Eat when the hunger is real.",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "hunger",
    subject: "What it means when a student says they're hungry",
    positions: [
      {
        key: "hunger_is_information",
        label: "It's information — the meal before it was built wrong",
        belief: {
          claim: "Hunger is information, not weakness",
          rationale:
            "if you're hungry ninety minutes after a meal, the meal was built wrong, and that's my mistake",
        },
        arbitration: {
          situation: 'A student writes at 22:00: "I\'m starving, what do I do?"',
          coachAnswer:
            "Eat something with protein in it, then go to bed. And tell me what today's meals looked like — if you're starving at ten, something earlier was too small, and that one is on me to fix.",
        },
      },
      {
        key: "hunger_is_normal",
        label: "A bit of hunger before a meal is normal",
        belief: {
          claim: "A bit of hunger before a meal is normal, and it is not an emergency",
          rationale: "not every hunger needs answering with food; some of it just means the next meal is close",
        },
        arbitration: {
          situation: 'A student writes at 22:00: "I\'m starving, what do I do?"',
          coachAnswer:
            "Have a glass of water and go to bed. Being a bit hungry at night isn't a problem to solve — see how you feel at breakfast, and tell me then.",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "portions",
    subject: "How a student knows how much to put on the plate",
    positions: [
      {
        key: "hand_portions",
        label: "Their hand is the measure",
        belief: {
          claim: "Your hand is the measure",
          rationale: "it travels, and it still works in a restaurant",
        },
        forbidden: {
          token: "weigh_every_meal",
          surfaceForms: [
            "weigh your food",
            "use a food scale",
            "weigh out your portions",
            "weigh everything you eat",
          ],
          instead:
            "Use your hand: a palm of protein, a fist of vegetables, a cupped hand of the starch. It works everywhere, including out.",
        },
      },
      {
        key: "weigh_to_learn",
        label: "Weigh for a short while, to learn — then stop",
        belief: {
          claim: "Weigh your food for a short while, then stop",
          rationale: "not to control it, but to find out once what a portion actually looks like",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "counting",
    subject: "Whether numbers are part of your method",
    positions: [
      {
        key: "no_counting",
        label: "We don't count anything",
        belief: {
          claim: "We don't count here",
          rationale: "counting turns eating into admin, and admin is the first thing people drop",
        },
        forbidden: {
          token: "count_calories",
          surfaceForms: [
            "count calories",
            "calorie counting",
            "track your macros",
            "hit your macros",
            "log your food",
            "count your macros",
          ],
          instead:
            "We don't count here. Build the plate — protein, vegetables, enough of it — and tell me how the day felt.",
        },
      },
      {
        key: "count_briefly",
        label: "Count for a couple of weeks, as a lesson",
        belief: {
          claim: "Count for a couple of weeks if you want to — it's a lesson, not a lifestyle",
          rationale: "you learn what a portion is, and then you put the app down",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "the_scale",
    subject: "What the scale is for",
    positions: [
      {
        key: "scale_is_noise",
        label: "It doesn't set the mood — we look at the week",
        belief: {
          claim: "I don't let the scale set the mood",
          rationale: "it moves for a dozen reasons that have nothing to do with the week you had",
        },
        arbitration: {
          situation: "A student says the scale hasn't moved in two weeks.",
          coachAnswer:
            "Then we look at the two weeks, not at the number. Tell me how you slept, how training went, and how the meals actually happened. The scale is the last thing I'd trust to tell me whether a fortnight worked.",
        },
      },
      {
        key: "scale_daily_as_line",
        label: "Every day, and never read a single day",
        belief: {
          claim: "Step on it every day, and never read a single day",
          rationale: "one number is noise; the line across a month is the only thing worth looking at",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "evening",
    subject: "Whether the clock closes the kitchen",
    positions: [
      {
        key: "no_cutoff",
        label: "There's no clock on the kitchen",
        belief: {
          claim: "There is no clock on the kitchen",
          rationale: "what you ate today matters; what time you ate it mostly doesn't",
        },
        forbidden: {
          token: "no_eating_after_hour",
          surfaceForms: [
            "don't eat after 8pm",
            "stop eating after 7",
            "no food after",
            "nothing after 8",
            "don't eat late at night",
          ],
          instead:
            "There's no cut-off here. If you're genuinely hungry in the evening, eat — and tell me what the rest of the day looked like.",
        },
      },
      {
        key: "kitchen_closes",
        label: "The kitchen closes after dinner",
        belief: {
          claim: "The kitchen closes after dinner",
          rationale: "not because of the hour, but because that is where most people's day comes undone",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "off_plan_meals",
    subject: "What you call a meal that wasn't in the plan",
    positions: [
      {
        key: "no_cheat_meal",
        label: "There's nothing to cheat on",
        belief: {
          claim: "There is no cheat meal, because there is nothing to cheat on",
          rationale: "there's the plan, and there are meals you chose to have off it",
        },
        forbidden: {
          token: "cheat_meal",
          surfaceForms: [
            "cheat meal",
            "cheat day",
            "treat meal",
            "earn your treat",
            "make up for it",
            "burn it off",
          ],
          instead:
            "There's no cheating here. You had a meal off plan — tell me about it and we carry on. It doesn't need paying for.",
        },
        arbitration: {
          situation: 'A student writes: "I cracked tonight, I ate everything."',
          coachAnswer:
            "One evening is not a week. Tell me what the hours before it looked like — that's usually where the answer is. Tomorrow starts at breakfast, not at penance.",
        },
      },
      {
        key: "planned_off_meal",
        label: "One meal off plan a week, decided in advance",
        belief: {
          claim: "One meal a week off the plan, decided in advance",
          rationale: "named, not stolen — that is the whole difference",
        },
        arbitration: {
          situation: 'A student writes: "I cracked tonight, I ate everything."',
          coachAnswer:
            "Right — so next week we put that meal in the diary instead of letting it ambush you. Tell me what the hours before it looked like.",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "eating_out",
    subject: "What happens in a restaurant",
    positions: [
      {
        key: "restaurant_no_rules",
        label: "Nothing special happens — order and enjoy it",
        belief: {
          claim: "Restaurants are not a problem to solve",
          rationale: "order what you'd order, eat it slowly, come back tomorrow",
        },
      },
      {
        key: "restaurant_anchor",
        label: "Find the protein and the vegetables first",
        belief: {
          claim: "In a restaurant, find the protein and the vegetables on the menu first",
          rationale: "the rest of the plate sorts itself out once those two are there",
        },
      },
      NO_RULE_POSITION,
    ],
  },
  {
    key: "quick_fixes",
    subject: "What you tell someone asking about detoxes and cleanses",
    positions: [
      {
        key: "no_detox",
        label: "There's nothing to detox from",
        belief: {
          claim: "There is nothing to detox from and nothing to cleanse",
          rationale: "the work is boring, and boring is the only thing that holds",
        },
        forbidden: {
          token: "detox_cleanse",
          surfaceForms: ["detox", "cleanse", "juice cleanse", "flush out the toxins", "reset your system"],
          instead:
            "There's no detox here. If you've had a heavy week, the fix is three ordinary meals tomorrow, not a juice.",
        },
      },
      NO_RULE_POSITION,
    ],
  },
] as const;

/** Le débat, par clé. R7: une clé inconnue jette, elle ne rend pas `undefined`. */
export function forkByKey(key: string): StarterFork {
  const found = STARTER_FORKS.find((f) => f.key === key);
  if (!found) throw new Error(`Unknown starter fork: ${JSON.stringify(key)}`);
  return found;
}

// ---------------------------------------------------------------------------
// APPLIQUER LES CHOIX
// ---------------------------------------------------------------------------

/** Le brouillon dans la forme de l'éditeur (snake_case), comme `save` l'écrit. */
export type DoctrineDraft = Record<string, unknown>;

/** `{ forkKey: positionKey }`. Une valeur `no_rule` (ou absente) ne sème rien. */
export type StarterChoices = Readonly<Record<string, string>>;

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map((x) => (x ?? {}) as Record<string, unknown>) : [];
}

function isStarter(e: Record<string, unknown>): boolean {
  return str(e.source) === "starter";
}

export interface ApplyStarterResult {
  draft: DoctrineDraft;
  /**
   * Les entrées d'une position ABANDONNÉE que le coach avait déjà retouchées,
   * et qu'on a donc gardées. L'écran les nomme.
   */
  keptBecauseEdited: string[];
}

/**
 * Applique les choix du coach au brouillon.
 *
 * ── LA RÈGLE QUI PORTE TOUT LE RESTE ────────────────────────────────────
 * On ne retire JAMAIS une ligne que le coach a écrite ou retouchée. Changer
 * d'avis sur un débat retire les lignes du camp précédent **qui portent encore
 * la marque `starter`** — celles qu'il n'a pas touchées, donc celles qui ne sont
 * pas de lui. Une ligne qu'il a réécrite reste, et l'écran la lui signale:
 * elle contredit peut-être son nouveau camp, et c'est à lui d'en décider.
 *
 * L'alternative — tout effacer — détruirait sans prévenir le seul travail
 * d'écriture qu'il ait fait. C'est le cliquet de `why_source`, transposé.
 *
 * IDEMPOTENT: rejouer les mêmes choix rend le même brouillon. La marque
 * `starter` sert d'identité, donc un second passage remplace la même ligne au
 * lieu d'en empiler une seconde.
 */
export function applyStarterChoices(
  base: DoctrineDraft | null,
  choices: StarterChoices,
): ApplyStarterResult {
  const draft: DoctrineDraft = { ...(base ?? {}) };
  const keptBecauseEdited: string[] = [];

  // Ce que les choix demandent de semer, débat par débat.
  const seededBeliefKeys = new Set<string>();
  const seededTokens = new Set<string>();
  const seededSituations = new Set<string>();
  const beliefs: Record<string, unknown>[] = [];
  const forbidden: Record<string, unknown>[] = [];
  const arbitrations: Record<string, unknown>[] = [];

  for (const fork of STARTER_FORKS) {
    const chosen = str(choices[fork.key]);
    if (!chosen || chosen === NO_RULE) continue;
    const position = fork.positions.find((p) => p.key === chosen);
    // R7 — un jeton de position inconnu jette. Le semer « au mieux » écrirait
    // dans la doctrine d'un coach une conviction qu'aucun écran ne lui a
    // montrée.
    if (!position) {
      throw new Error(
        `Unknown starter position ${JSON.stringify(chosen)} for fork ${JSON.stringify(fork.key)}`,
      );
    }
    if (position.belief) {
      const key = deriveBeliefKey(position.belief.claim);
      seededBeliefKeys.add(key);
      beliefs.push({
        key,
        claim: position.belief.claim,
        rationale: position.belief.rationale ?? null,
        goal_scope: [],
        source: "starter",
      });
    }
    if (position.forbidden) {
      seededTokens.add(position.forbidden.token);
      forbidden.push({
        token: position.forbidden.token,
        surface_forms: [...position.forbidden.surfaceForms],
        reason: position.forbidden.reason ?? null,
        instead: position.forbidden.instead,
        source: "starter",
      });
    }
    if (position.arbitration) {
      seededSituations.add(position.arbitration.situation);
      arbitrations.push({
        situation: position.arbitration.situation,
        coach_answer: position.arbitration.coachAnswer,
        goal_scope: [],
        source: "starter",
      });
    }
  }

  /**
   * Fusionne une section: on garde ce qui est au coach, on remplace ce qui est
   * à nous, on signale ce qu'on aurait retiré s'il n'y avait pas touché.
   */
  const merge = (
    field: string,
    incoming: Record<string, unknown>[],
    idOf: (e: Record<string, unknown>) => string,
    stillWanted: Set<string>,
    labelOf: (e: Record<string, unknown>) => string,
  ) => {
    const out: Record<string, unknown>[] = [];
    const placed = new Set<string>();
    for (const entry of list(draft[field])) {
      const id = idOf(entry);
      if (!isStarter(entry)) {
        // Du coach. Intouchable, quoi qu'il choisisse maintenant.
        out.push(entry);
        continue;
      }
      if (stillWanted.has(id)) {
        // Toujours voulue et jamais retouchée: on remet la version fraîche.
        const fresh = incoming.find((e) => idOf(e) === id);
        if (fresh) {
          out.push(fresh);
          placed.add(id);
        }
        continue;
      }
      // Position abandonnée, ligne jamais retouchée ⇒ elle disparaît en
      // silence, et c'est correct: le coach ne l'a jamais faite sienne.
    }
    for (const entry of incoming) {
      const id = idOf(entry);
      if (placed.has(id)) continue;
      // Une entrée du coach porte déjà cette identité: la sienne gagne, et on
      // ne sème pas un doublon par-dessus.
      if (out.some((e) => idOf(e) === id)) {
        keptBecauseEdited.push(labelOf(entry));
        continue;
      }
      out.push(entry);
    }
    draft[field] = out;
  };

  merge(
    "beliefs",
    beliefs,
    (e) => str(e.key) || deriveBeliefKey(str(e.claim)),
    seededBeliefKeys,
    (e) => str(e.claim),
  );
  merge("forbidden", forbidden, (e) => str(e.token), seededTokens, (e) => str(e.token));
  merge(
    "arbitrations",
    arbitrations,
    (e) => str(e.situation),
    seededSituations,
    (e) => str(e.situation),
  );

  // Les sections qu'aucun débat ne touche existent quand même, vides: un
  // brouillon partiel ferait planter l'éditeur sur `draft.foods.discouraged`.
  draft.vocabulary ??= [];
  draft.foods ??= { discouraged: [] };
  draft.qa ??= [];
  draft.voice ??= {};

  return { draft, keptBecauseEdited };
}

// ---------------------------------------------------------------------------
// LE COMPTEUR — la branche nommée qui lit `source` (R6)
// ---------------------------------------------------------------------------

export interface StarterFootprint {
  beliefs: number;
  forbidden: number;
  arbitrations: number;
  total: number;
  /** Le total toutes provenances confondues, pour dire « 9 sur 11 ». */
  entries: number;
}

/**
 * Combien de lignes sont encore MOT POUR MOT les nôtres.
 *
 * C'est ce nombre que l'écran affiche au bouton publier. Il ne bloque rien —
 * un coach a le droit de publier un préréglage intact, c'est son produit. Mais
 * il ne doit pas pouvoir le faire sans le savoir: la promesse qu'il vend à ses
 * élèves est que l'agent parle comme lui.
 */
export function countUntouchedStarter(draft: DoctrineDraft | null): StarterFootprint {
  const d = draft ?? {};
  const count = (field: string) => list(d[field]).filter(isStarter).length;
  const total = (field: string) => list(d[field]).length;
  const out = {
    beliefs: count("beliefs"),
    forbidden: count("forbidden"),
    arbitrations: count("arbitrations"),
    total: 0,
    entries: total("beliefs") + total("forbidden") + total("arbitrations") +
      total("vocabulary") + total("qa") +
      list((d.foods as Record<string, unknown> | undefined)?.discouraged).length,
  };
  out.total = out.beliefs + out.forbidden + out.arbitrations;
  return out;
}

/**
 * Les choix relus DEPUIS le brouillon, pour que l'écran rouvre coché.
 *
 * Sans ça, un coach qui revient voit dix débats vierges au-dessus d'une
 * doctrine qui en sort — donc il retape, et le second passage lui rendrait des
 * lignes qu'il croyait avoir corrigées. Une entrée retouchée n'est plus
 * reconnue comme une position: elle est devenue la sienne, et c'est exactement
 * ce que le débat doit cesser de revendiquer.
 */
export function readStarterChoices(draft: DoctrineDraft | null): StarterChoices {
  const d = draft ?? {};
  const beliefKeys = new Set(
    list(d.beliefs).filter(isStarter).map((e) => str(e.key) || deriveBeliefKey(str(e.claim))),
  );
  const tokens = new Set(list(d.forbidden).filter(isStarter).map((e) => str(e.token)));
  const out: Record<string, string> = {};
  for (const fork of STARTER_FORKS) {
    for (const position of fork.positions) {
      const beliefKey = position.belief ? deriveBeliefKey(position.belief.claim) : null;
      const hit = (beliefKey !== null && beliefKeys.has(beliefKey)) ||
        (position.forbidden !== undefined && tokens.has(position.forbidden.token));
      if (hit) {
        out[fork.key] = position.key;
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LE CLIQUET — éditer une ligne la rend au coach
// ---------------------------------------------------------------------------

/**
 * Les champs dont une modification veut dire « ces mots sont maintenant les
 * miens ».
 *
 * `goal_scope` n'y est PAS, et c'est le seul choix subtil de cette fonction:
 * restreindre une croyance à la perte de gras est une décision, mais la PHRASE
 * reste la nôtre — et la promesse du compteur porte sur les phrases. L'inclure
 * ferait tomber le compteur à zéro sur un geste qui n'a rien réécrit, ce qui
 * est précisément le mensonge à éviter.
 */
const CLAIMING_FIELDS = [
  "claim",
  "rationale",
  "token",
  "surface_forms",
  "reason",
  "instead",
  "situation",
  "coach_answer",
] as const;

/**
 * Le patch à appliquer, plus la perte de la marque si le coach a réécrit.
 *
 * Passe par ici TOUTE édition d'entrée de l'éditeur: c'est le seul endroit qui
 * décide qu'une ligne a changé de propriétaire, et deux endroits qui en
 * décideraient divergeraient au premier champ ajouté.
 */
export function claimOnEdit<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>,
): Partial<T> {
  if (str(before.source) !== "starter") return patch;
  for (const field of CLAIMING_FIELDS) {
    if (!(field in patch)) continue;
    const next = (patch as Record<string, unknown>)[field];
    const prev = before[field];
    if (JSON.stringify(next ?? null) !== JSON.stringify(prev ?? null)) {
      return { ...patch, source: null } as Partial<T>;
    }
  }
  return patch;
}
