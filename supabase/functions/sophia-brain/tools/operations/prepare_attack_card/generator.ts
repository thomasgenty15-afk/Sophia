import type { AttackCardGeneratorInput } from "../_shared/operation_payload_builder.ts";

export type AttackCardDraftV1 = {
  operation_type: "prepare_attack_card";
  output_schema: "attack_card_draft_v1";
  draft: {
    title: string;
    target_label: string;
    technique: AttackTechniqueKey;
    technique_title: string;
    instruction: string;
    generated_asset: string;
    activation_keyword?: string | null;
    supporting_points: string[];
    mode_emploi: string;
    why_it_helps: string;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

export type AttackTechniqueKey =
  | "texte_recadrage"
  | "mantra_force"
  | "ancre_visuelle"
  | "visualisation_matinale"
  | "preparer_terrain"
  | "pre_engagement";

export const ATTACK_TECHNIQUES: Record<
  AttackTechniqueKey,
  {
    title: string;
    pour_quoi: string;
    objet_genere: string;
    mode_emploi: string;
    example: string;
  }
> = {
  texte_recadrage: {
    title: "Le texte magique",
    pour_quoi:
      "Faire baisser le combat interieur quand l'utilisateur commence a negocier avec lui-meme.",
    objet_genere:
      "Un texte court a relire ou recopier quand la resistance monte.",
    mode_emploi:
      "Lis ou recopie ce texte au moment ou tu sens la resistance monter, puis fais le premier geste.",
    example:
      "Exemple: un texte de 3 lignes a relire quand tu commences a negocier.",
  },
  mantra_force: {
    title: "Mantra de force",
    pour_quoi:
      "Installer plus de force interieure face a l'action, avant le moment difficile.",
    objet_genere:
      "Une phrase courte a repeter pour renforcer le rapport a l'action.",
    mode_emploi:
      "Repete-le trois fois avant le moment vise, sans chercher a te convaincre plus que ca.",
    example: "Exemple: une phrase courte qui te remet dans ton axe.",
  },
  ancre_visuelle: {
    title: "Ancre visuelle",
    pour_quoi: "Utiliser l'environnement comme rappel concret de l'engagement.",
    objet_genere: "Un repere visuel simple, avec une phrase associee.",
    mode_emploi:
      "Place l'ancre dans ton environnement et utilise-la comme signal de depart.",
    example: "Exemple: un carnet visible avec une phrase de depart.",
  },
  visualisation_matinale: {
    title: "Meditation de 5 minutes",
    pour_quoi:
      "Rendre le comportement plus familier avant que la resistance apparaisse.",
    objet_genere:
      "Une courte visualisation guidee de l'action deja en train de se faire.",
    mode_emploi:
      "Prends 5 minutes pour te voir faire l'action de facon calme et concrete.",
    example:
      "Exemple: une visualisation rapide du moment ou tu fais l'action sans debat.",
  },
  preparer_terrain: {
    title: "Preparer le terrain",
    pour_quoi: "Retirer de la friction avant que le moment d'action arrive.",
    objet_genere: "Un micro-setup qui rend le bon geste plus facile.",
    mode_emploi:
      "Prepare le terrain avant le moment vise, puis laisse l'environnement t'aider a demarrer.",
    example: "Exemple: telephone loin, carnet pret, premier geste visible.",
  },
  pre_engagement: {
    title: "Mot de bascule",
    pour_quoi: "Avoir un mot simple a envoyer quand le moment devient fragile.",
    objet_genere: "Un mot-cle memorisable et un mini protocole de bascule.",
    mode_emploi:
      "Envoie seulement ce mot quand tu sens que tu peux craquer; Sophia reprend le contexte.",
    example: "Exemple: envoyer BASCULE quand tu sens que tu vas esquiver.",
  },
};

function chooseTechnique(
  input: AttackCardGeneratorInput,
): AttackCardDraftV1["draft"]["technique"] {
  if (input.desired_attack_angle !== "unknown") {
    return input.desired_attack_angle;
  }
  if (input.blocker.type === "friction") return "preparer_terrain";
  if (input.blocker.type === "avoidance") return "texte_recadrage";
  if (input.blocker.type === "procrastination") return "texte_recadrage";
  if (input.blocker.type === "unclear_first_step") return "preparer_terrain";
  return "preparer_terrain";
}

const DURATION_WORDS: Record<string, number> = {
  une: 1,
  un: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
};

function normalizeStepText(value: string): string {
  return value
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function extractDurationMinutes(message: string): number | null {
  const match = message.toLowerCase().match(
    /\b(\d+|une|un|deux|trois|quatre|cinq)\s*(?:min|minute|minutes)\b/,
  );
  if (!match) return null;
  const raw = match[1];
  const value = /^\d+$/.test(raw) ? Number(raw) : DURATION_WORDS[raw];
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractRequestedSteps(message: string): string[] {
  const text = message.toLowerCase();
  const steps = new Set<string>();
  const addStep = (rawStep: string) => {
    const step = normalizeStepText(rawStep);
    if (!step) return;
    const normalizedStep = step.toLowerCase();
    if (
      [...steps].some((existing) => {
        const normalizedExisting = existing.toLowerCase();
        return normalizedStep.includes(normalizedExisting) ||
          normalizedExisting.includes(normalizedStep);
      })
    ) return;
    steps.add(step);
  };
  const knownPatterns: Array<[RegExp, string]> = [
    [/\bposer\s+(?:le\s+)?t[ée]l[ée]phone\s+loin\b/, "poser le téléphone loin"],
    [/\bouvrir\s+(?:le\s+)?carnet\b/, "ouvrir le carnet"],
    [/(?:^|[\s,;:])(?:ecrire|écrire)\s+une\s+ligne\b/, "écrire une ligne"],
    [
      /(?:^|[\s,;:])(?:ecrire|écrire)\s+une\s+seule\s+ligne\b/,
      "écrire une seule ligne",
    ],
    [
      /(?:^|[\s,;:])(?:ecrire|écrire)\s+(?:seulement\s+)?une\s+phrase\b/,
      "écrire une phrase",
    ],
    [
      /(?:^|[\s,;:])(?:ecrire|écrire)\s+(?:la\s+)?premi[èe]re\s+phrase\b/,
      "écrire la première phrase",
    ],
    [/\bnoter\s+une\s+ligne\b/, "noter une ligne"],
    [
      /(?:^|[\s,;:])(?:decider|décider|choisir)\s+(?:seulement\s+)?(?:apres|après)\s+si\s+je\s+continue\b/,
      "décider après si je continue",
    ],
    [
      /(?:^|[\s,;:])(?:apres|après)\s+(?:decider|décider|choisir)\s+si\s+je\s+continue\b/,
      "décider après si je continue",
    ],
    [
      /(?:^|[\s,;:])(?:seulement\s+)?(?:apres|après)\s+(?:decider|décider|choisir)\s+si\s+je\s+continue\b/,
      "décider après si je continue",
    ],
  ];
  for (const [pattern, label] of knownPatterns) {
    if (pattern.test(text)) addStep(label);
  }

  const firstGestureMatch = message.match(
    /\bpremier\s+geste\s*:\s*([^.;!?\n]+)/i,
  );
  const afterColon = firstGestureMatch?.[1] ??
    (message.includes(":") ? message.split(":").slice(-1)[0] : "");
  for (const part of afterColon.split(/,|\bet\b/i)) {
    const step = normalizeStepText(part)
      .replace(
        /\b(?:une\s+)?carte\s+(?:tres|très)?\s*petite\b/gi,
        "",
      )
      .replace(
        /\b(?:\d+|une|un|deux|trois|quatre|cinq)\s*(?:min|minute|minutes)(?:\s+max)?\b/gi,
        "",
      )
      .trim();
    if (
      /\b(poser|ouvrir|ecrire|écrire|noter|prendre|mettre|preparer|préparer)\b/i
        .test(step)
    ) {
      addStep(
        step
          .replace(/\bsans\s+ca.*$/i, "")
          .replace(/\bsans\s+ça.*$/i, "")
          .replace(/\btelephone\b/i, "téléphone")
          .replace(/\becrire\b/i, "écrire"),
      );
    }
    if (/\b(d[ée]cider|choisir)\b/i.test(step) && /\bcontinue\b/i.test(step)) {
      addStep("décider après si je continue");
    }
  }

  return [...steps].slice(0, 4);
}

function extractConstraintPhrases(message: string): string[] {
  const text = message.toLowerCase();
  const constraints = new Set<string>();
  const add = (value: string) => {
    const phrase = normalizeStepText(value)
      .replace(/\btelephone\b/gi, "téléphone")
      .replace(/\becran\b/gi, "écran");
    if (!phrase) return;
    constraints.add(phrase);
  };
  const withoutMatches = text.matchAll(
    /\bsans\s+([^.;!?\n,]{3,60})/g,
  );
  for (const match of withoutMatches) {
    const raw = String(match[1] ?? "")
      .replace(/\b(et|mais|puis)\b.*$/i, "")
      .trim();
    if (raw) add(`sans ${raw}`);
  }
  const beforeAfterMatches = text.matchAll(
    /\b(avant|apres|après)\s+([^.;!?\n,]{2,40})/g,
  );
  for (const match of beforeAfterMatches) {
    const prefix = String(match[1] ?? "").replace("apres", "après");
    const raw = String(match[2] ?? "")
      .replace(/\b(et|mais|puis)\b.*$/i, "")
      .trim();
    if (/\b(cr[ée]er|creer|cr[ée]ation|creation)\b/i.test(raw)) continue;
    if (/^si\s+je\s+continue\b/i.test(raw)) continue;
    if (/\b(d[ée]cider|decider|choisir)\b/i.test(raw) && /\bcontinue\b/i.test(raw)) {
      continue;
    }
    if (raw) add(`${prefix} ${raw}`);
  }
  if (
    /\bpas\s+plus\s+de\s+(\d+|une|un|deux|trois|quatre|cinq)\s*(?:min|minute|minutes)\b/
      .test(text)
  ) {
    const duration = extractDurationMinutes(message);
    if (duration) add(`pas plus de ${duration} minutes`);
  }
  return [...constraints].slice(0, 3);
}

function actionIdeaLabel(target: string): string {
  const trimmed = target.trim();
  const normalizedTarget = normalizeStepText(trimmed);
  if (/^faire\s+/i.test(normalizedTarget)) {
    return normalizedTarget.replace(/^faire/i, "faire");
  }
  return `faire "${normalizedTarget}"`;
}

function buildInstruction(args: {
  input: AttackCardGeneratorInput;
  technique: AttackCardDraftV1["draft"]["technique"];
  target: string;
}): string {
  const message = args.input.blocker.evidence.join(" ");
  const requestedDuration = extractDurationMinutes(message);
  const requestedSteps = extractRequestedSteps(message);
  const constraintPhrases = extractConstraintPhrases(message);
  const constraintSuffix = constraintPhrases.length > 0
    ? ` Contraintes: ${constraintPhrases.join(", ")}.`
    : "";
  if (requestedSteps.length > 0) {
    const durationPrefix = requestedDuration
      ? `En ${requestedDuration} minutes max`
      : "Version minuscule";
    return `${durationPrefix} : ${
      requestedSteps.join(", puis ")
    }.${constraintSuffix}`;
  }
  if (args.technique === "preparer_terrain") {
    const minutes = requestedDuration ?? 2;
    return `Prepare l'environnement de "${args.target}" pendant ${minutes} minutes, sans obligation d'aller plus loin.${constraintSuffix}`;
  }
  if (args.technique === "texte_recadrage") {
    return `Relis ce texte au moment ou tu negocies avec l'idee de ${
      actionIdeaLabel(args.target)
    }, puis fais seulement le premier geste.${constraintSuffix}`;
  }
  if (args.technique === "mantra_force") {
    return `Repete le mantra trois fois avant "${args.target}", puis demarre sans refaire le debat.${constraintSuffix}`;
  }
  if (args.technique === "ancre_visuelle") {
    return `Place l'ancre visuelle la ou tu verras le signal juste avant "${args.target}".${constraintSuffix}`;
  }
  if (args.technique === "visualisation_matinale") {
    return `Visualise pendant 5 minutes le moment ou tu fais "${args.target}" calmement et simplement.${constraintSuffix}`;
  }
  return `Envoie le mot de bascule quand tu sens que tu vas eviter "${args.target}".${constraintSuffix}`;
}

function buildGeneratedAsset(args: {
  technique: AttackTechniqueKey;
  target: string;
  instruction: string;
  activationKeyword?: string | null;
}): string {
  if (args.technique === "texte_recadrage") {
    const firstStep = args.instruction.startsWith("Version minuscule") ||
        /^En \d+ minutes max/.test(args.instruction)
      ? ` Mon premier geste: ${
        args.instruction
          .replace(/^Version minuscule\s*:\s*/i, "")
          .replace(/^En \d+ minutes max\s*:\s*/i, "")
          .replace(/[.!?]+$/g, "")
      }.`
      : "";
    return `Je n'ai pas besoin de negocier avec l'idee de ${
      actionIdeaLabel(args.target)
    }, ni de me raconter des excuses a son sujet. Je fais juste le premier geste maintenant, assez petit pour passer la resistance.${firstStep}`;
  }
  if (args.technique === "mantra_force") {
    return `Je deviens quelqu'un qui demarre ${args.target} sans attendre d'etre parfaitement pret.`;
  }
  if (args.technique === "ancre_visuelle") {
    return `Ancre: un objet visible lie a ${args.target}. Phrase: "Je commence par le geste le plus simple."`;
  }
  if (args.technique === "visualisation_matinale") {
    return `Ferme les yeux, vois-toi au moment de ${args.target}, puis vois le premier geste se faire sans debat.`;
  }
  if (args.technique === "pre_engagement") {
    const keyword = String(args.activationKeyword ?? "").trim() || "BASCULE";
    return `Mot-cle: ${keyword}. Quand tu l'envoies, Sophia t'aide a revenir au premier geste de ${args.target}.`;
  }
  return args.instruction;
}

export function runAttackCardGenerator(
  input: AttackCardGeneratorInput,
): AttackCardDraftV1 {
  if (input.operation_type !== "prepare_attack_card") {
    throw new Error("attack_card_operation_type_invalid");
  }
  if (!input.target.title) throw new Error("attack_card_target_missing");
  if (
    input.target.kind !== "plan_item" && input.target.kind !== "personal_action"
  ) {
    throw new Error("attack_card_target_kind_invalid");
  }
  const technique = chooseTechnique(input);
  const target = input.target.title;
  const instruction = buildInstruction({ input, technique, target });
  const techniqueDefinition = ATTACK_TECHNIQUES[technique];
  const activationKeyword = technique === "pre_engagement"
    ? String(input.activation_keyword ?? "").trim()
    : "";
  const generatedAsset = buildGeneratedAsset({
    technique,
    target,
    instruction,
    activationKeyword,
  });
  return {
    operation_type: "prepare_attack_card",
    output_schema: "attack_card_draft_v1",
    draft: {
      title: `Carte d'attaque - ${target}`,
      target_label: target,
      technique,
      technique_title: techniqueDefinition.title,
      instruction,
      generated_asset: generatedAsset,
      activation_keyword: activationKeyword || null,
      supporting_points: [],
      mode_emploi: techniqueDefinition.mode_emploi,
      why_it_helps: techniqueDefinition.pour_quoi,
    },
    confirmation_message:
      `Je te propose cette carte d'attaque avant de la creer.\n\n${techniqueDefinition.title}\n${generatedAsset}\n\nMode d'emploi: ${techniqueDefinition.mode_emploi}\n\nTu veux que je cree cette carte ?`,
    confirmation_actions: ["yes", "no"],
  };
}
