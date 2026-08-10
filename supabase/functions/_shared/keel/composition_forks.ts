/**
 * FF-041 — LE DÉBAT DE COMPOSITION : ce que le coach voit, et rien d'autre.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-041-la-methode-du-coach-executable.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §3.0 et §3.2.
 *
 * ── LA LIGNE QUE CE FICHIER EXISTE POUR TENIR ────────────────────────────
 * Le coach ne « règle » pas le moteur de Sophia et n'en voit jamais la
 * hiérarchie. Il répond à un DÉBAT — « sur quoi pilotes-tu une assiette ? » —
 * dans son langage, exactement comme les débats du point de départ
 * (`doctrine_starter.ts`). La forme compilée (`SteeringEntry`) en est DÉRIVÉE à
 * la publication.
 *
 * Le jour où un écran affiche `satiety_density`, la ligne a été franchie.
 *
 * ── CHAQUE POSITION DIT CE QU'ELLE PRODUIT ───────────────────────────────
 * En langage PLAN et ALIMENT, jamais en axe. « Tes élèves ne verront jamais ce
 * chiffre » fait partie de la phrase: la règle zéro-chiffre est un plancher
 * FACE À L'ÉLÈVE, pas une raison d'aveugler l'auteur d'une méthode.
 *
 * ── LA PUBLICATION ÉCRIT DEUX CHOSES ─────────────────────────────────────
 * Une `DoctrineBelief` ordinaire — citable, elle entre dans le bloc chat — et
 * l'entrée de pilotage qui pointe vers elle par `belief_key`. Le moteur ne lit
 * que le jeton; le chat ne lit que la conviction. AUCUN parseur de prose, nulle
 * part.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { deriveBeliefKey } from "./doctrine.ts";
import type { SteeringAxis, SteeringEntry } from "./composition_steering.ts";

/** Le jeton d'une position qui ne pilote rien. Présent dans CHAQUE débat. */
export const NO_STEERING = "no_steering";

export interface CompositionPosition {
  key: string;
  /** Ce sur quoi le coach tape: sa position, dite comme il la dirait. */
  label: string;
  /**
   * CE QUE ÇA PRODUIT, en langage plan/aliment. Jamais un nom d'axe, jamais un
   * chiffre destiné à l'élève.
   */
  effect: string;
  /** La conviction citable. Absente = le moteur exécute, le chat se tait. */
  belief?: { claim: string; rationale?: string };
  /** La forme COMPILÉE. Dérivée à la publication, jamais montrée. */
  steering?: {
    priorities?: SteeringAxis[];
    off?: SteeringAxis[];
    proteinRange?: SteeringEntry["protein_range"];
    deficitStyle?: SteeringEntry["deficit_style"];
    surplusStyle?: SteeringEntry["surplus_style"];
    recalibration?: SteeringEntry["recalibration"];
    maintenanceWeeks?: SteeringEntry["maintenance_weeks"];
  };
}

export interface CompositionFork {
  key: string;
  /** LE SUJET, jamais une position. C'est la ligne qui garde KEEL neutre. */
  subject: string;
  positions: readonly CompositionPosition[];
}

const NO_STEERING_POSITION: CompositionPosition = {
  key: NO_STEERING,
  label: "I don't make a rule about this",
  effect:
    "Sophia composes in her default order. Nothing about your plans changes.",
};

// ---------------------------------------------------------------------------
// LES DÉBATS
// ---------------------------------------------------------------------------

export const COMPOSITION_FORKS: readonly CompositionFork[] = [
  {
    key: "what_drives_a_plate",
    subject: "What you steer a plate by",
    positions: [
      {
        key: "calories_are_noise",
        label: "Counting calories is noise — I steer by what's on the plate",
        effect:
          "Your students' plans stop being reworked on how much they hold. " +
          "Sophia keeps measuring, and the protections that apply to everyone " +
          "stay on — she simply stops arbitrating on it for your cohort.",
        belief: {
          claim: "Counting calories is noise — what matters is what's on the plate",
          rationale:
            "nobody has ever kept a diet by arithmetic, and the arithmetic was " +
            "wrong anyway",
        },
        steering: {
          off: ["energy"],
          priorities: ["micro_coverage", "protein", "satiety_density"],
        },
      },
      {
        key: "proportions_first",
        label: "I steer by proportions — protein and vegetables first, starch as a side",
        effect:
          "Plans get built around a protein food and vegetables, with starch " +
          "as the side rather than the base. Your students never see the " +
          "shares; they see the plate.",
        belief: {
          claim: "Build the plate around protein and vegetables; starch is the side",
          rationale: "the shape of the plate decides the meal, not the total",
        },
        steering: { priorities: ["proportions", "protein"] },
      },
      {
        key: "nutrients_first",
        label: "Nutrients first — I care what the week actually covers",
        effect:
          "A group that never shows up in a week becomes a placed recipe — " +
          "« an oily fish once this week », in food, never in nutrients.",
        belief: {
          claim: "A week is judged by what it actually covers, not by what it totals",
          rationale: "you cannot supplement your way out of a week of beige food",
        },
        steering: { priorities: ["micro_coverage", "protein"] },
      },
      {
        key: "satiety_first",
        label: "Satiety first — a plate that leaves them hungry is a plate that failed",
        effect:
          "Plans lean on volume from vegetables, so a meal holds without being " +
          "heavy. Nothing is removed from anyone's plate.",
        belief: {
          claim: "A plate that leaves you hungry two hours later has failed, whatever it totalled",
          rationale: "hunger is what breaks a week, not arithmetic",
        },
        steering: { priorities: ["satiety_density", "protein"] },
      },
      NO_STEERING_POSITION,
    ],
  },
  {
    key: "how_much_protein",
    subject: "How much protein you build around",
    positions: [
      {
        key: "protein_high",
        label: "More than most — protein carries the plate",
        effect:
          "Every main meal gets a bigger protein anchor. Your students see " +
          "« 180 g of chicken thighs », never a gram of protein.",
        belief: {
          claim: "Protein carries the plate — everything else is arranged around it",
          rationale: "it is the one thing that holds somebody between two meals",
        },
        steering: { priorities: ["protein"], proteinRange: "high" },
      },
      {
        key: "protein_standard",
        label: "Enough, without making it the whole subject",
        effect: "Sophia's default anchor: one whole protein food per main meal.",
        steering: { priorities: ["protein"], proteinRange: "standard" },
      },
      NO_STEERING_POSITION,
    ],
  },
  {
    key: "how_you_run_a_cut",
    subject: "How you run a fat-loss phase",
    positions: [
      {
        key: "cut_gentle",
        label: "Gently — slow enough that they keep their training and their week",
        effect:
          "Plans stay closer to what they already eat. Portions move less, and " +
          "nothing counts down.",
        belief: {
          claim: "A fat-loss phase that costs you your training and your social life is a phase you abandon",
          rationale: "slow is the only speed that survives a month",
        },
        steering: { deficitStyle: "gentle" },
      },
      {
        key: "cut_standard",
        label: "Steadily — Sophia's default pace",
        effect: "The default: portions moderate, vegetables carrying the volume.",
        steering: { deficitStyle: "standard" },
      },
      // ⚠️ IL N'Y A PAS DE TROISIÈME POSITION, ET C'EST L'ARBITRAGE A1.
      // « Sèche agressive » n'est pas offert parce que le jeton n'existe pas
      // dans le type. Un coach qui la pratique garde sa conviction citable dans
      // le chat; le moteur ne l'exécute pas. Le coût est écrit et accepté.
      NO_STEERING_POSITION,
    ],
  },
  {
    key: "does_the_engine_recalibrate",
    subject: "Whether Sophia adjusts to what she observes",
    positions: [
      {
        key: "recalibrate",
        label: "Yes — if the trend disagrees for weeks, adjust",
        effect:
          "After three weeks going the other way, portions shift slightly. " +
          "Bounded, and never below the coverage floor. Your students are told " +
          "nothing.",
        steering: { recalibration: "observed_trend" },
      },
      {
        key: "no_recalibration",
        label: "No — I'll decide when something needs to change",
        effect:
          "Sophia never adjusts on her own. What you set is what your students " +
          "get, week after week.",
        belief: {
          claim: "The plan changes when I say it changes, not when a number moves",
          rationale: "a coach who lets a chart drive is not coaching",
        },
        steering: { recalibration: "static" },
      },
      NO_STEERING_POSITION,
    ],
  },
];

export function compositionForkByKey(key: string): CompositionFork {
  const found = COMPOSITION_FORKS.find((f) => f.key === key);
  if (!found) throw new Error(`Unknown composition fork: ${JSON.stringify(key)}`);
  return found;
}

// ---------------------------------------------------------------------------
// LA DÉRIVATION — positions choisies → conviction citable + jeton exécutable
// ---------------------------------------------------------------------------

export interface DerivedSteering {
  /** Les convictions à ajouter à la doctrine. Citables dans le chat. */
  beliefs: Array<{ key: string; claim: string; rationale: string | null }>;
  /** L'entrée de pilotage. `null` quand le coach n'a rien piloté. */
  entry: SteeringEntry | null;
  /** Positions inconnues, comptées et NOMMÉES. Jamais un repli silencieux. */
  issues: string[];
}

/**
 * Ce que la publication écrit, à partir des positions choisies.
 *
 * ── UNE SEULE ENTRÉE, PAS UNE PAR DÉBAT ──────────────────────────────────
 * Les quatre débats décrivent UNE méthode. Les fondre en une entrée est ce qui
 * rend « une seule grandeur primaire par objectif » vérifiable: avec quatre
 * entrées, chacune aurait sa primaire et le moteur trancherait à la place du
 * coach.
 *
 * ── `belief_key` POINTE, IL NE RECOPIE PAS ───────────────────────────────
 * Le moteur ne lit que le jeton; le chat ne lit que la conviction. Aucun
 * parseur de prose, nulle part — c'est la greffe que les quatre revues du
 * design ont saluée à l'unanimité.
 */
export function deriveSteeringFromPositions(
  chosen: Readonly<Record<string, string>>,
): DerivedSteering {
  const issues: string[] = [];
  const beliefs: DerivedSteering["beliefs"] = [];
  const priorities: SteeringAxis[] = [];
  const off: SteeringAxis[] = [];
  let proteinRange: SteeringEntry["protein_range"] = "standard";
  let deficitStyle: SteeringEntry["deficit_style"] = "standard";
  let surplusStyle: SteeringEntry["surplus_style"] = "standard";
  let recalibration: SteeringEntry["recalibration"] = "observed_trend";
  let maintenanceWeeks: SteeringEntry["maintenance_weeks"] = "auto";
  let anySteering = false;
  let firstBeliefKey: string | null = null;

  for (const fork of COMPOSITION_FORKS) {
    const positionKey = chosen[fork.key];
    if (!positionKey || positionKey === NO_STEERING) continue;
    const position = fork.positions.find((p) => p.key === positionKey);
    if (!position) {
      // NOMMÉ. Un coach dont une position n'a pas pris doit le lire à l'écran,
      // pas le deviner six semaines plus tard sur une assiette.
      issues.push(
        `${fork.key}: unknown position ${JSON.stringify(positionKey)}, ignored`,
      );
      continue;
    }
    if (position.belief) {
      const key = deriveBeliefKey(position.belief.claim);
      beliefs.push({
        key,
        claim: position.belief.claim,
        rationale: position.belief.rationale ?? null,
      });
      firstBeliefKey ??= key;
    }
    const s = position.steering;
    if (!s) continue;
    anySteering = true;
    for (const axis of s.priorities ?? []) {
      if (!priorities.includes(axis)) priorities.push(axis);
    }
    for (const axis of s.off ?? []) {
      if (!off.includes(axis)) off.push(axis);
    }
    if (s.proteinRange) proteinRange = s.proteinRange;
    if (s.deficitStyle) deficitStyle = s.deficitStyle;
    if (s.surplusStyle) surplusStyle = s.surplusStyle;
    if (s.recalibration) recalibration = s.recalibration;
    if (s.maintenanceWeeks) maintenanceWeeks = s.maintenanceWeeks;
  }

  if (!anySteering) return { beliefs, entry: null, issues };

  return {
    beliefs,
    entry: {
      goal_scope: null,
      // ── UN AXE ÉTEINT NE PEUT PAS ÊTRE PRIORITAIRE ────────────────────
      // Deux débats peuvent se contredire (« les calories c'est du bruit » +
      // « je pilote à l'énergie »). L'extinction gagne, parce que c'est la
      // position la plus explicite des deux.
      priorities: priorities.filter((a) => !off.includes(a)),
      off,
      belief_key: firstBeliefKey,
      proportions: null,
      protein_range: proteinRange,
      surplus_style: surplusStyle,
      deficit_style: deficitStyle,
      maintenance_weeks: maintenanceWeeks,
      recalibration,
      carb_timing: "off",
    },
    issues,
  };
}
