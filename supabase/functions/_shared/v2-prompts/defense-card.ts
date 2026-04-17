import type { DefenseCardContent, DominantImpulse, ImpulseTrigger } from "../v2-types.ts";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const DEFENSE_CARD_SYSTEM_PROMPT = `Tu es un expert en psychologie comportementale et en gestion des pulsions.
Tu dois générer une "Carte de Défense" qui aide l'utilisateur à gérer ses pulsions dominantes dans le cadre de sa transformation personnelle.

La carte doit rester SIMPLE et directement utilisable.
Par défaut, elle contient UNE seule pulsion dominante et UNE seule carte-situation principale.
Si plusieurs moments sont plausibles, choisis celui qui a le plus de chances d'arriver ou celui qui fait le plus derailler l'action.

## Structure attendue d'une carte-situation
Chaque trigger correspond à UNE carte concrète avec :
- un nom court et précis (\`label\`)
- le moment (\`situation\`)
- le piege (\`signal\`)
- mon geste (\`defense_response\`)
- le plan B (\`plan_b\`)

## Le moment
Identifie UNE situation concrète principale où cette pulsion peut survenir.
Sois SPÉCIFIQUE au contexte de l'utilisateur (son travail, sa vie, ses routines mentionnées dans le texte libre ou le questionnaire).
Une situation = un contexte externe: quand, où, avec qui, dans quel état.
Ex: "Retour du travail fatigué, 18h-19h" / "Soirée seul devant la télé" / "Pause café au bureau"

## Le piege
Pour chaque situation, identifie le signal interne OBSERVABLE qui annonce la pulsion.
Le signal n'est PAS la situation elle-même — c'est ce que la personne RESSENT, PENSE ou FAIT inconsciemment juste avant de basculer.
Le signal doit être concret et observable, pas vague.
✅ BON: "Je soupire et je regarde machinalement le placard"
✅ BON: "Je prends mon téléphone sans but depuis 5 minutes"
✅ BON: "Serrement dans le ventre, respiration courte"
✅ BON: "Je me dis 'juste un petit truc, c'est pas grave'"
❌ MAUVAIS: "Je suis stressé" (trop vague — reformuler en signal observable: "mâchoire serrée, jambes qui bougent sous le bureau")
❌ MAUVAIS: "Je suis fatigué" (c'est une situation/contexte, pas un signal interne)

## Mon geste
Pour chaque situation, propose une réponse défensive CONCRÈTE, faisable en < 30 secondes, qui ne demande pas de volonté excessive.

## Plan B
Pour chaque situation, propose un filet de sécurité concret si le premier geste ne part pas ou ne suffit pas.
Le plan B doit rester simple, réaliste, et immédiatement actionnable.

## Priorisation
- La carte doit représenter le cas le plus utile dans le quotidien.
- Évite les doublons et les variantes proches.
- Privilégie UNE carte très différenciante plutôt qu'une petite liste.
- Si plusieurs options sont possibles, garde la plus probable ou la plus coûteuse si elle rate.

## Nom de carte
Pour chaque trigger, remplis \`label\` avec un nom court, concret et mémorisable.
Exemples:
- "Dans le lit quand les series appellent"
- "Quand le téléphone sert a calculer la nuit"
- "Quand les conflits reviennent au calme"

## Règles
- Les pulsions sont DÉDUITES du contexte (free text, questionnaire, type de transformation). Ne demande JAMAIS au user quelles sont ses pulsions.
- Les réponses défensives doivent être ultra concrètes et faciles (ex: "boire un grand verre d'eau", "sortir prendre l'air 2 min", "noter la pulsion dans les notes du tel").
- Le ton est direct mais bienveillant, pas paternaliste.
- Les situations doivent être spécifiques au profil du user quand le contexte le permet.
- Tu travailles UNIQUEMENT sur la transformation active fournie. Ignore les transformations futures, les sujets annexes et tout ce qui ne sert pas directement ce focus.
- Si le texte libre du cycle contient plusieurs problèmes, retiens seulement les pulsions qui menacent la transformation courante.
- N'injecte pas les autres transformations du cycle comme sous-themes.
- Exception rare: si un autre sujet est un obstacle massif et evident pour la transformation active, tu peux le mentionner sur UNE seule carte maximum, sans contaminer les autres cartes.
- Si le contexte ne permet pas d'identifier de pulsions claires, génère une carte autour de "la résistance au changement" comme pulsion par défaut.

## Format de sortie
Réponds UNIQUEMENT en JSON valide:
{
  "impulses": [
    {
      "impulse_id": "impulse-1",
      "label": "Nom court de la pulsion",
      "triggers": [
        {
          "trigger_id": "trigger-1-1",
          "label": "Nom court de la carte",
          "situation": "Le moment: contexte externe précis (quand, où, avec qui)",
          "signal": "Le piege: pensée automatique, sensation physique ou micro-comportement AVANT la bascule",
          "defense_response": "Mon geste: réponse défensive concrète en < 30 secondes",
          "plan_b": "Plan B: filet de sécurité concret si le premier geste ne suffit pas"
        }
      ]
    }
  ]
}

Important:
- Retourne exactement 1 impulsion.
- Retourne exactement 1 trigger dans cette impulsion.`;

// ---------------------------------------------------------------------------
// Input builder
// ---------------------------------------------------------------------------

export type DefenseCardGenerationInput = {
  transformation_title: string;
  user_summary: string;
  focus_context: string;
  action_context?: {
    phase_label: string | null;
    item_title: string;
    item_description: string | null;
    item_kind: string;
    time_of_day: string | null;
    cadence_label: string | null;
    activation_hint: string | null;
  } | null;
  questionnaire_answers: Record<string, unknown> | null;
  calibration: {
    struggle_duration: string | null;
    main_blocker: string | null;
    perceived_difficulty: string | null;
    probable_drivers: string | null;
    prior_attempts: string | null;
    self_confidence: number | null;
  };
  plan_strategy: {
    identity_shift: string | null;
    core_principle: string | null;
  };
};

export function buildDefenseCardUserPrompt(input: DefenseCardGenerationInput): string {
  const sections: string[] = [];

  sections.push(`## Transformation\nTitre: ${input.transformation_title}\nRésumé: ${input.user_summary}`);
  sections.push(
    "## Cadre strict\nNe génère des pulsions que pour cette transformation précise. N'anticipe pas les transformations suivantes et n'élargis pas à tout le cycle.",
  );

  if (input.action_context?.item_title) {
    const lines = [
      `- Action cible: ${input.action_context.item_title}`,
      `- Type d'action: ${input.action_context.item_kind}`,
      `- Description: ${input.action_context.item_description ?? "Non précisée"}`,
      `- Niveau du plan: ${input.action_context.phase_label ?? "Non précisé"}`,
      `- Moment: ${input.action_context.time_of_day ?? "Non précisé"}`,
      `- Cadence: ${input.action_context.cadence_label ?? "Non précisée"}`,
      `- Ce qui doit être protégé maintenant: ${input.action_context.activation_hint ?? "L'exécution de cette action au bon moment."}`,
    ];
    sections.push(
      `## Focus action courante\n${lines.join("\n")}\n\nGénère la carte de défense pour aider l'utilisateur à faire CETTE action, maintenant. Ne génère pas une carte pour le problème final ou pour une étape future du plan.`,
    );
  }

  if (input.focus_context) {
    sections.push(`## Matiere focale deja cristallisee sur la transformation active\n${input.focus_context}`);
  }

  if (input.questionnaire_answers) {
    const entries = Object.entries(input.questionnaire_answers)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .slice(0, 12);
    if (entries.length > 0) {
      sections.push(`## Réponses au questionnaire\n${entries.join("\n")}`);
    }
  }

  const calibrationLines: string[] = [];
  if (input.calibration.struggle_duration) {
    calibrationLines.push(`- Ancienneté du problème: ${input.calibration.struggle_duration}`);
  }
  if (input.calibration.main_blocker) {
    calibrationLines.push(`- Blocage principal: ${input.calibration.main_blocker}`);
  }
  if (input.calibration.perceived_difficulty) {
    calibrationLines.push(`- Difficulté perçue: ${input.calibration.perceived_difficulty}`);
  }
  if (input.calibration.probable_drivers) {
    calibrationLines.push(`- Facteur probable dominant: ${input.calibration.probable_drivers}`);
  }
  if (input.calibration.prior_attempts) {
    calibrationLines.push(`- Tentatives passées: ${input.calibration.prior_attempts}`);
  }
  if (input.calibration.self_confidence != null) {
    calibrationLines.push(`- Confiance: ${input.calibration.self_confidence}/5`);
  }
  if (calibrationLines.length > 0) {
    sections.push(`## Calibrage\n${calibrationLines.join("\n")}`);
  }

  const strategyLines: string[] = [];
  if (input.plan_strategy.identity_shift) {
    strategyLines.push(`- Changement d'identité: ${input.plan_strategy.identity_shift}`);
  }
  if (input.plan_strategy.core_principle) {
    strategyLines.push(`- Principe directeur: ${input.plan_strategy.core_principle}`);
  }
  if (strategyLines.length > 0) {
    sections.push(`## Stratégie du plan\n${strategyLines.join("\n")}`);
  }

  sections.push(
    "Choisis un seul moment principal a proteger. La sortie doit contenir une seule impulsion et un seul trigger.",
  );
  sections.push("Génère la carte de défense en JSON.");

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateTrigger(raw: unknown, index: number, impulseIndex: number): string[] {
  const issues: string[] = [];
  if (!isPlainObject(raw)) {
    issues.push(`impulses[${impulseIndex}].triggers[${index}] is not an object`);
    return issues;
  }
  if (!isNonEmptyString(raw.trigger_id)) issues.push(`triggers[${index}].trigger_id missing`);
  if (!isNonEmptyString(raw.situation)) issues.push(`triggers[${index}].situation missing`);
  if (!isNonEmptyString(raw.signal)) issues.push(`triggers[${index}].signal missing`);
  if (!isNonEmptyString(raw.defense_response)) issues.push(`triggers[${index}].defense_response missing`);
  if (!isNonEmptyString(raw.plan_b)) issues.push(`triggers[${index}].plan_b missing`);
  if (
    raw.label !== undefined &&
    raw.label !== null &&
    !isNonEmptyString(raw.label)
  ) issues.push(`triggers[${index}].label invalid`);
  return issues;
}

function cleanDefenseCardText(value: string): string {
  return value
    .replace(/^(terrain|environnement|le moment)\s*:\s*/i, "")
    .replace(/^(d[ée]clencheur interne|d[ée]clencheur|le pi[eè]ge)\s*:\s*/i, "")
    .replace(/^(mon geste|d[ée]fense)\s*:\s*/i, "")
    .replace(/^(plan b)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveTriggerLabel(raw: Record<string, unknown>): string {
  const explicit = typeof raw.label === "string" ? cleanDefenseCardText(raw.label) : "";
  if (explicit) return explicit;

  const situation = cleanDefenseCardText(String(raw.situation ?? ""));
  const signal = cleanDefenseCardText(String(raw.signal ?? ""));

  const shortSituation = situation.split(/[.!?]/)[0]?.trim() ?? "";
  const shortSignal = signal.split(/[.!?]/)[0]?.trim() ?? "";

  if (shortSituation && shortSituation.length <= 56) return shortSituation;
  if (shortSignal && shortSignal.length <= 56) return shortSignal;
  if (shortSituation && shortSignal) {
    return `${shortSituation.slice(0, 28).trimEnd()} / ${shortSignal.slice(0, 24).trimEnd()}`;
  }
  return "Situation a surveiller";
}

function validateImpulse(raw: unknown, index: number): string[] {
  const issues: string[] = [];
  if (!isPlainObject(raw)) {
    issues.push(`impulses[${index}] is not an object`);
    return issues;
  }
  if (!isNonEmptyString(raw.impulse_id)) issues.push(`impulses[${index}].impulse_id missing`);
  if (!isNonEmptyString(raw.label)) issues.push(`impulses[${index}].label missing`);

  if (!Array.isArray(raw.triggers) || raw.triggers.length === 0) {
    issues.push(`impulses[${index}].triggers must be non-empty array`);
  } else if (raw.triggers.length > 4) {
    issues.push(`impulses[${index}].triggers must contain at most 4 items`);
  } else {
    for (let i = 0; i < raw.triggers.length; i++) {
      issues.push(...validateTrigger(raw.triggers[i], i, index));
    }
  }
  return issues;
}

export function validateDefenseCardOutput(raw: unknown): {
  valid: boolean;
  issues: string[];
  content: DefenseCardContent | null;
} {
  const issues: string[] = [];

  if (!isPlainObject(raw)) {
    return { valid: false, issues: ["output is not an object"], content: null };
  }

  if (!Array.isArray(raw.impulses) || raw.impulses.length === 0) {
    issues.push("impulses must be a non-empty array");
    return { valid: false, issues, content: null };
  }

  if (raw.impulses.length > 3) {
    issues.push("impulses should contain at most 3 items");
  }

  for (let i = 0; i < Math.min(raw.impulses.length, 3); i++) {
    issues.push(...validateImpulse(raw.impulses[i], i));
  }

  if (issues.length > 0) {
    return { valid: false, issues, content: null };
  }

  return {
    valid: true,
    issues: [],
    content: {
      impulses: (raw.impulses as unknown[]).slice(0, 3).map((imp: any) => ({
        impulse_id: String(imp.impulse_id).trim(),
        label: String(imp.label).trim(),
        generic_defense: cleanDefenseCardText(
          String(
            imp.generic_defense ??
              imp.triggers?.[0]?.plan_b ??
              "",
          ).trim(),
        ),
        triggers: (imp.triggers as unknown[]).slice(0, 4).map((t: any) => ({
          trigger_id: String(t.trigger_id).trim(),
          label: deriveTriggerLabel(t),
          situation: cleanDefenseCardText(String(t.situation).trim()),
          signal: cleanDefenseCardText(String(t.signal).trim()),
          defense_response: cleanDefenseCardText(String(t.defense_response).trim()),
          plan_b: cleanDefenseCardText(String(t.plan_b).trim()),
        })),
      })),
    },
  };
}
