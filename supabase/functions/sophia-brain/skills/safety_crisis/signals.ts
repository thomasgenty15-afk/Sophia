import {
  emptySafetySignal,
  type SafetyCrisisSnapshot,
  type SafetySignal,
} from "./contract.ts";
import type { SafetyCrisisIntakeResult } from "./intake.ts";

type ConservativeSafetyOverrides = {
  crisis_signal: boolean;
  suicidal_ideation: boolean;
  self_harm_intent: boolean;
  immediate_danger: boolean;
  clarified_non_immediate: boolean;
  means_moved_away: boolean;
  means_still_nearby: boolean;
  means_mentioned: boolean;
  human_support_available: boolean;
  emergency_help_contacted: boolean;
  user_currently_alone: boolean | null;
  explicit_unsafety: boolean;
};

// These deterministic detectors are conservative safety overrides.
// They may escalate or keep risk high, and may recognize stabilizing evidence
// for the reducer, but they never choose a phase and never force "resolved".

function includesSafetyCrisisSignal(text: string): boolean {
  return /me faire du mal|suicid|en finir|mourir|disparaitre|disparaitre|ne pas me reveiller|pas me reveiller|ne plus exister|plus exister|prendre tous les cachets|prendre tout les cachets|avaler tous les cachets|avaler tout les cachets|foncer dans|me jeter|sauter du|sauter par|plus envie de vivre|faire une connerie|me blesser|passer a l'acte|passer a l'acte|pas en securite/
    .test(text);
}

function detectsSuicidalIdeation(text: string): boolean {
  if (detectsNonImmediateClarification(text)) return false;
  return /suicid|en finir|mourir|ne pas me reveiller|pas me reveiller|ne plus exister|plus exister|plus envie de vivre|me jeter|sauter du|sauter par|foncer dans/
    .test(text);
}

function detectsSelfHarmIntent(text: string): boolean {
  if (detectsNonImmediateClarification(text)) return false;
  return /me faire du mal|me blesser|faire une connerie|passer a l'acte|prendre tous les cachets|prendre tout les cachets|avaler tous les cachets|avaler tout les cachets/
    .test(text);
}

function detectsExplicitUnsafety(text: string): boolean {
  return /pas en securite|pas en securite|je ne suis pas en securite|je suis pas en securite|je ne me sens pas en securite|je me sens pas en securite/
    .test(text);
}

function detectsImmediateDanger(text: string): boolean {
  return /maintenant|tout de suite|ce soir|la maintenant|je vais le faire|je suis sur le point|je suis au bord|j'ai .*main|j ai .*main|couteau|lame|cachets|medicaments|fenetre|balcon|corde|foncer dans|me jeter|rails?|metro|pas en securite/
    .test(text);
}

function detectsNonImmediateClarification(text: string): boolean {
  if (detectsExplicitUnsafety(text)) return false;
  return /pas maintenant|pas en danger|je suis en securite|je me sens en securite|je n'ai pas prevu de me faire (du|de) mal|j ai pas prevu de me faire (du|de) mal|je ne veux pas me faire (du|de) mal|je veux pas me faire (du|de) mal|je ne vais pas me faire (du|de) mal|je vais pas me faire (du|de) mal|je ne vais rien faire|je vais rien faire|pas de passage a l'acte|pas de passage a l'acte|je ne vais pas passer a l'acte|je vais pas passer a l'acte/
    .test(text);
}

function detectsMeansMovedAway(text: string): boolean {
  return /j['’]?ai pose|j ai pose|j['’]?ai mis|j ai mis|eloigne|loin de moi|plus a portee|hors de portee|range|dans une autre piece|dans la salle de bain|aucun (cachet|medicament) pres de moi|pas de (cachets?|medicaments?) pres de moi|pas de couteau pres de moi|aucune lame pres de moi|rien pour me blesser pres de moi/
    .test(text);
}

function detectsMeansMention(text: string): boolean {
  return /couteau|lame|cachets?|medicaments?|fenetre|balcon|corde|rails?|metro|voiture|arme/
    .test(text);
}

function detectsMeansStillNearby(text: string): boolean {
  if (detectsMeansMovedAway(text)) return false;
  return /dans ma main|dans les mains|dans ma poche|devant moi|sur moi|a cote de moi|pres de moi|dans ma chambre|je tiens (le|la|les|un|une)|j'ai le couteau|j ai le couteau|j'ai la lame|j ai la lame|j'ai les cachets|j ai les cachets|j'ai des cachets|j ai des cachets/
    .test(text);
}

function detectsHumanSupport(text: string): boolean {
  return /pas seul|pas seule|plus seul|plus seule|avec quelqu|avec ma coloc|avec mon coloc|coloc est la|quelqu'un arrive|quelqu'un est la|elle est la|il est la|ils sont la|elles sont la|au telephone avec moi|en ligne avec moi|reste au telephone|j'appelle|je vais appeler|j ai appele|j'ai appele|je viens d appeler|ma soeur|mon frere|mon cousin|ma cousine|ami|amie|proche|secours|samu|112|15|3114/
    .test(text);
}

function detectsEmergencyHelpContacted(text: string): boolean {
  return /j'appelle le 15|j appelle le 15|j'ai appele le 15|j ai appele le 15|j'appelle le 112|j appelle le 112|j'ai appele le 112|j ai appele le 112|samu|secours|3114/
    .test(text);
}

function detectsCurrentlyAlone(text: string): boolean | null {
  if (
    /pas seul|pas seule|plus seul|plus seule|avec ma coloc|avec mon coloc|ma soeur est (la )?avec moi|mon frere est (la )?avec moi|mon cousin est (la )?avec moi|ma cousine est (la )?avec moi|mon cousin est la|ma cousine est la|un ami est (la )?avec moi|une amie est (la )?avec moi|elle est avec moi|il est avec moi|quelqu'un est avec moi|elle est la|il est la|quelqu'un est la|au telephone avec moi|en ligne avec moi|reste au telephone/
      .test(text)
  ) {
    return false;
  }
  if (
    /je suis seul|je suis seule|encore seul|encore seule|tout seul|toute seule/
      .test(text)
  ) {
    return true;
  }
  return null;
}

export function detectConservativeSafetyOverrides(
  text: string,
): ConservativeSafetyOverrides {
  const clarifiedNonImmediate = detectsNonImmediateClarification(text);
  const meansMovedAway = detectsMeansMovedAway(text);
  const meansStillNearby = detectsMeansStillNearby(text);
  const meansMentioned = detectsMeansMention(text);
  const explicitUnsafety = detectsExplicitUnsafety(text);
  const rawImmediateDanger = detectsImmediateDanger(text);
  const humanSupport = detectsHumanSupport(text);
  const currentlyAlone = detectsCurrentlyAlone(text);
  const stabilizingEvidence = clarifiedNonImmediate || meansMovedAway ||
    humanSupport || currentlyAlone === false;
  return {
    crisis_signal: includesSafetyCrisisSignal(text),
    suicidal_ideation: detectsSuicidalIdeation(text),
    self_harm_intent: detectsSelfHarmIntent(text),
    immediate_danger: meansStillNearby || explicitUnsafety ||
      (rawImmediateDanger && !stabilizingEvidence),
    clarified_non_immediate: clarifiedNonImmediate,
    means_moved_away: meansMovedAway,
    means_still_nearby: meansStillNearby,
    means_mentioned: meansMentioned,
    human_support_available: humanSupport,
    emergency_help_contacted: detectsEmergencyHelpContacted(text),
    user_currently_alone: currentlyAlone,
    explicit_unsafety: explicitUnsafety,
  };
}

export function inferStructuredSafetySignals(args: {
  snapshot: SafetyCrisisSnapshot;
  intakeResult: SafetyCrisisIntakeResult;
}): SafetySignal {
  const intakeSignals = args.intakeResult.ok
    ? args.intakeResult.signals
    : emptySafetySignal({ uncertainty: "high" });
  return emptySafetySignal({
    ...intakeSignals,
    uncertainty: args.intakeResult.ok
      ? intakeSignals.uncertainty ?? "medium"
      : "high",
  });
}

export function applyConservativeSafetyOverrides(args: {
  snapshot: SafetyCrisisSnapshot;
  signals: SafetySignal;
}): SafetySignal {
  const overrides = detectConservativeSafetyOverrides(
    args.snapshot.normalized_user_message,
  );
  const highSourceRisk = args.snapshot.source_risk_band === "critical" ||
    args.snapshot.source_risk_band === "high";
  const conservativeMeansNearby = overrides.means_still_nearby ||
    (overrides.means_mentioned && !overrides.means_moved_away &&
      (highSourceRisk || overrides.crisis_signal));
  const hasMeansNearby = overrides.means_moved_away
    ? false
    : conservativeMeansNearby
    ? true
    : args.signals.has_means_nearby;
  const immediateDanger = overrides.immediate_danger ||
      conservativeMeansNearby
    ? true
    : args.signals.immediate_danger;
  const userCurrentlyAlone = overrides.user_currently_alone !== null
    ? overrides.user_currently_alone
    : args.signals.user_currently_alone;
  const humanSupportAvailable = overrides.human_support_available
    ? true
    : args.signals.human_support_available;
  const emergencyHelpContacted = overrides.emergency_help_contacted
    ? true
    : args.signals.emergency_help_contacted;
  const clarifiedNonImmediate = overrides.clarified_non_immediate ||
    args.signals.clarified_non_immediate;
  const meansMovedAway = overrides.means_moved_away
    ? true
    : args.signals.means_moved_away;
  const deescalationEvidence = Boolean(
    clarifiedNonImmediate || meansMovedAway || humanSupportAvailable ||
      userCurrentlyAlone === false || args.signals.deescalation_evidence,
  );
  const overrideUncertainty =
    overrides.explicit_unsafety || overrides.crisis_signal ? "medium" : null;
  const uncertaintyRank = { low: 0, medium: 1, high: 2 } as const;
  const finalUncertainty = overrideUncertainty &&
      uncertaintyRank[overrideUncertainty] >
        uncertaintyRank[args.signals.uncertainty]
    ? overrideUncertainty
    : args.signals.uncertainty;

  return {
    ...args.signals,
    suicidal_ideation: args.signals.suicidal_ideation ||
      overrides.suicidal_ideation,
    self_harm_intent: args.signals.self_harm_intent ||
      overrides.self_harm_intent,
    immediate_danger: immediateDanger,
    has_means_nearby: hasMeansNearby,
    means_moved_away: meansMovedAway,
    user_currently_alone: userCurrentlyAlone,
    human_support_available: humanSupportAvailable,
    emergency_help_contacted: emergencyHelpContacted,
    clarified_non_immediate: clarifiedNonImmediate,
    deescalation_evidence: deescalationEvidence,
    uncertainty: finalUncertainty,
  };
}
