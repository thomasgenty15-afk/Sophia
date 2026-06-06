import { generateWithGemini, getGlobalAiModel } from "./gemini.ts";
import type { PotionBaseContext } from "./potion-base-context.ts";
import type {
  PotionScopeSelection,
  PotionType,
  RappelScopeSelection,
} from "./v2-types.ts";

export type PotionFollowUpSeriesItem = {
  day_index: number;
  theme: string;
  draft_message: string;
};

export type PotionFollowUpSeriesInput = {
  userId: string;
  potionType: PotionType;
  durationDays: number;
  reminderInstruction: string;
  rationale?: string | null;
  timezone: string;
  sessionContent?: Record<string, unknown> | null;
  followUpStrategy?: Record<string, unknown> | null;
  questionnaireAnswers?: Record<string, unknown> | null;
  baseContext?: PotionBaseContext | null;
  potionScope?: PotionScopeSelection | null;
  rappelScope?: RappelScopeSelection | null;
  targetBinding?: Record<string, unknown> | null;
};

type PotionFollowUpSeriesOptions = {
  requestId?: string | null;
  userId?: string | null;
  llmRunner?: (systemPrompt: string, userPrompt: string) => Promise<unknown>;
};

const CLARTE_THEMES = [
  "pourquoi profond",
  "action du plan reliee au pourquoi",
  "identite visee",
  "contrainte remise en perspective",
  "ce que le plan protege",
  "retour au cap sans refaire le plan",
  "synthese de recentrage",
];

const GENERIC_THEMES = [
  "rappel du cap",
  "petit appui",
  "presence douce",
  "reconnexion",
  "continuer sans pression",
  "tenir le fil",
  "cloture de serie",
];

const RAPPEL_PLAN_LINKED_THEMES = [
  "pourquoi profond",
  "raccrochage action",
  "cap general",
  "cadence realiste",
  "contrainte principale",
  "petit retour",
  "tenir le fil",
];

const RAPPEL_OUT_OF_PLAN_THEMES = [
  "objet du decrochage",
  "petit retour",
  "anti-glissement",
  "elan simple",
  "reprise concrete",
  "presence douce",
  "cloture de serie",
];

const COURAGE_PLAN_LINKED_THEMES = [
  "nommer l'evitement sans honte",
  "passage de transformation",
  "premier seuil doux",
  "peur remise en perspective",
  "micro-action reliee au plan",
  "courage sans brutalite",
  "synthese avance douce",
];

const COURAGE_OUT_OF_PLAN_THEMES = [
  "nommer l'evitement sans honte",
  "reduire le premier pas",
  "peur remise en perspective",
  "micro-action douce",
  "tenir face a l'inconfort",
  "courage sans brutalite",
  "synthese avance douce",
];

const GUERISON_PLAN_LINKED_THEMES = [
  "deposer l'episode sans se definir par lui",
  "retombee et valeur personnelle",
  "adoucir le sentiment dominant",
  "reprendre contact avec le pourquoi",
  "reprise douce sans punition",
  "le chemin n'est pas annule",
  "synthese revenir sans s'ecraser",
];

const GUERISON_OUT_OF_PLAN_THEMES = [
  "deposer l'episode sans se definir par lui",
  "retombee et valeur personnelle",
  "adoucir le sentiment dominant",
  "reparer sans analyser lourdement",
  "reprise douce sans punition",
  "ce moment n'annule pas tout",
  "synthese revenir sans s'ecraser",
];

const AMOUR_PLAN_LINKED_THEMES = [
  "nommer le manque d'amour sans jugement",
  "plan comme soutien",
  "dialogue interieur adouci",
  "valeur non conditionnelle",
  "identity shift avec douceur",
  "partie jugee regard tendre",
  "synthese retour a soi",
];

const AMOUR_OUT_OF_PLAN_THEMES = [
  "nommer le manque d'amour sans jugement",
  "dialogue interieur adouci",
  "etat actuel non identitaire",
  "petit geste de douceur",
  "partie jugee regard tendre",
  "reconfort sobre",
  "synthese retour a soi",
];

const APAISEMENT_PLAN_LINKED_THEMES = [
  "nommer la pression sans l'amplifier",
  "desserrer l'exigence du plan",
  "pause courte autour de l'action",
  "contrainte reconnue",
  "submerge ne veut pas dire incapable",
  "relacher une partie de la charge",
  "rythme plus respirable",
];

const APAISEMENT_OUT_OF_PLAN_THEMES = [
  "nommer la pression sans l'amplifier",
  "ralentir le seuil d'exigence",
  "pause courte",
  "etat reconnu",
  "submerge ne veut pas dire incapable",
  "relacher une partie de la charge",
  "rythme plus respirable",
];

function cleanText(value: unknown, maxLength = 280): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseGeneratedSeries(
  raw: unknown,
  durationDays: number,
): PotionFollowUpSeriesItem[] {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(
        raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim(),
      );
    } catch {
      return [];
    }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.messages)) return [];
  return parsed.messages.slice(0, durationDays).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const draft = cleanText(item.draft_message ?? item.message, 420);
    if (!draft) return [];
    return [{
      day_index: Number(item.day_index) || index + 1,
      theme: cleanText(item.theme, 80) || `jour ${index + 1}`,
      draft_message: draft,
    }];
  });
}

function uniqueByMessage(
  series: PotionFollowUpSeriesItem[],
): PotionFollowUpSeriesItem[] {
  const seen = new Set<string>();
  const output: PotionFollowUpSeriesItem[] = [];
  for (const item of series) {
    const key = item.draft_message.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function completeDistinctSeries(args: {
  input: PotionFollowUpSeriesInput;
  preferred: PotionFollowUpSeriesItem[];
  fallback: PotionFollowUpSeriesItem[];
}): PotionFollowUpSeriesItem[] {
  const output: PotionFollowUpSeriesItem[] = [];
  const seen = new Set<string>();
  const add = (item: PotionFollowUpSeriesItem) => {
    const draft = cleanText(item.draft_message, 420);
    if (!draft) return;
    const key = draft.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push({
      day_index: output.length + 1,
      theme: cleanText(item.theme, 80) || `jour ${output.length + 1}`,
      draft_message: draft,
    });
  };
  for (const item of args.preferred) add(item);
  for (const item of args.fallback) add(item);
  while (output.length < args.input.durationDays) {
    const day = output.length + 1;
    const source = cleanText(args.input.reminderInstruction, 180) ||
      "reviens doucement a ton intention";
    add({
      day_index: day,
      theme: `jour ${day}`,
      draft_message: `Jour ${day}: ${source}`,
    });
  }
  return output.slice(0, args.input.durationDays);
}

function firstPlanItemTitle(context: PotionBaseContext | null | undefined) {
  return context?.plan_items.find((item) => cleanText(item.title))?.title ??
    null;
}

function planMeaningLossReason(
  answers: Record<string, unknown> | null | undefined,
): string | null {
  return cleanText(answers?.plan_meaning_loss_reason, 320) ||
    cleanText(answers?.clarity_problem, 320) ||
    cleanText(answers?.clarity_need, 320) ||
    null;
}

function firstDeepWhy(context: PotionBaseContext | null | undefined) {
  return context?.transformation.deep_why_answers
    .map((answer) => cleanText(answer.answer, 240))
    .find(Boolean) ?? null;
}

function driftTarget(answers: Record<string, unknown> | null | undefined) {
  return cleanText(answers?.drift_target, 260) || null;
}

function driftStyleLabel(answers: Record<string, unknown> | null | undefined) {
  const style = cleanText(answers?.drift_style, 80);
  switch (style) {
    case "oubli":
      return "tu oublies";
    case "repousse":
      return "tu repousses";
    case "laisse_filer":
      return "tu laisses filer";
    case "baisse_elan":
      return "l'elan baisse";
    default:
      return null;
  }
}

function avoidanceTarget(answers: Record<string, unknown> | null | undefined) {
  return cleanText(answers?.avoidance_target, 260) || null;
}

function blockerKindLabel(
  answers: Record<string, unknown> | null | undefined,
) {
  const blocker = cleanText(answers?.blocker_kind, 80);
  switch (blocker) {
    case "resultat":
      return "la peur du resultat";
    case "regard":
      return "la peur du regard des autres";
    case "inconfort":
      return "la peur de l'inconfort";
    case "conflit":
      return "la peur du conflit";
    default:
      return null;
  }
}

function recentHurt(answers: Record<string, unknown> | null | undefined) {
  return cleanText(answers?.recent_hurt, 280) || null;
}

function dominantFeelingLabel(
  answers: Record<string, unknown> | null | undefined,
) {
  const feeling = cleanText(answers?.dominant_feeling, 80);
  switch (feeling) {
    case "culpabilite":
      return "la culpabilite";
    case "honte":
      return "la honte";
    case "decouragement":
      return "le decouragement";
    case "fatigue":
      return "la fatigue";
    default:
      return null;
  }
}

function loveLackContext(
  answers: Record<string, unknown> | null | undefined,
) {
  return cleanText(
    answers?.love_lack_context ?? answers?.self_talk,
    280,
  ) || null;
}

function loveStateLabel(
  answers: Record<string, unknown> | null | undefined,
) {
  const state = cleanText(answers?.love_state, 80);
  switch (state) {
    case "dur":
      return "dur avec toi";
    case "seul":
      return "seul";
    case "vide":
      return "vide";
    default:
      return null;
  }
}

function pressureSource(answers: Record<string, unknown> | null | undefined) {
  return cleanText(answers?.pressure_source, 260) || null;
}

function pressureStateLabel(
  answers: Record<string, unknown> | null | undefined,
) {
  const state = cleanText(answers?.pressure_state, 80);
  switch (state) {
    case "stresse":
      return "tres stresse";
    case "a_cran":
      return "a cran";
    case "submerge":
      return "submerge";
    default:
      return state || null;
  }
}

function potionScopeSelection(args: PotionFollowUpSeriesInput) {
  return args.potionScope ?? args.rappelScope ?? null;
}

function targetBindingLabel(
  binding: Record<string, unknown> | null | undefined,
) {
  return cleanText(binding?.label, 220) || null;
}

function fallbackRappelMessage(args: {
  theme: string;
  reminderInstruction: string;
  rationale: string | null;
  baseContext?: PotionBaseContext | null;
  potionAnswers?: Record<string, unknown> | null;
  rappelScope?: RappelScopeSelection | null;
  targetBinding?: Record<string, unknown> | null;
}): string {
  const source = cleanText(args.reminderInstruction, 220);
  const target = driftTarget(args.potionAnswers) || source ||
    "ce que tu sens glisser";
  const driftStyle = driftStyleLabel(args.potionAnswers);
  const why = firstDeepWhy(args.baseContext);
  const action = targetBindingLabel(args.targetBinding) ||
    firstPlanItemTitle(args.baseContext);
  const constraint = cleanText(
    args.baseContext?.plan_strategy.main_constraint ??
      args.baseContext?.transformation.main_constraint,
    220,
  );
  const isPlanLinked = args.rappelScope?.scope_kind === "plan_linked";
  if (!isPlanLinked) {
    switch (args.theme) {
      case "objet du decrochage":
        return `Petit retour a ${target}: pas besoin de tout reprendre, juste de refaire un lien concret maintenant.`;
      case "petit retour":
        return driftStyle
          ? `Si ${driftStyle}, baisse le seuil autour de ${target}: un petit contact suffit pour relancer le fil.`
          : `Pour ${target}, cherche seulement un petit retour faisable maintenant.`;
      case "anti-glissement":
        return `Si tu sens ${target} filer, raccroche-toi a un geste minuscule avant de negocier avec toi-meme.`;
      case "elan simple":
        return `Pour ${target}, cherche seulement l'elan le plus simple: une minute, un geste, un debut.`;
      case "reprise concrete":
        return `Reviens a ${target} sans te juger. Le bon mouvement, c'est le prochain petit contact.`;
      default:
        return fallbackGenericMessage({
          theme: args.theme,
          reminderInstruction: source || `Reviens doucement a ${target}.`,
          rationale: args.rationale,
        });
    }
  }
  switch (args.theme) {
    case "pourquoi profond":
      return why
        ? `Reviens au sens: ${why}. ${target} n'est pas une case a cocher, c'est un fil a reprendre doucement.`
        : `Reviens au cap que ton plan sert vraiment. ${target} peut redevenir un petit point d'appui aujourd'hui.`;
    case "raccrochage action":
      return action
        ? `Regarde juste ${action}: l'objectif n'est pas d'etre parfait, seulement de reprendre contact avec ce que cette action protege.`
        : `Raccroche ${target} a ton plan sans inventer une action precise: un petit retour au cap suffit aujourd'hui.`;
    case "cap general":
      return why
        ? `Ton plan a un dessous plus grand: ${why}. Reviens a ${target} par ce sens-la, pas par la pression.`
        : `Tout ton plan tient mieux quand tu reviens au cap avant de forcer. ${target}: un pas, pas une injonction.`;
    case "cadence realiste":
      return action
        ? `${action} peut rester vivant avec un geste plus petit que prevu. Raccroche-toi a la cadence, pas a la performance.`
        : `Pour ${target}, vise un raccrochage realiste: assez petit pour etre fait, assez clair pour relancer le fil.`;
    case "contrainte principale":
      return constraint
        ? `La contrainte est reelle: ${constraint}. Elle demande un raccrochage plus doux, pas un abandon de ${target}.`
        : `Si ${target} glisse, baisse la marche. Le plan sert ton cap; il n'a pas besoin de devenir une pression.`;
    default:
      return source ||
        `Reviens doucement a ${target}, en gardant le cap de ton plan en arriere-plan.`;
  }
}

function fallbackCourageMessage(args: {
  theme: string;
  reminderInstruction: string;
  rationale: string | null;
  baseContext?: PotionBaseContext | null;
  potionAnswers?: Record<string, unknown> | null;
  potionScope?: PotionScopeSelection | null;
  targetBinding?: Record<string, unknown> | null;
}): string {
  const source = cleanText(args.reminderInstruction, 220);
  const target = avoidanceTarget(args.potionAnswers) || source ||
    "ce passage que tu evites";
  const blocker = blockerKindLabel(args.potionAnswers);
  const why = firstDeepWhy(args.baseContext);
  const action = targetBindingLabel(args.targetBinding) ||
    firstPlanItemTitle(args.baseContext);
  const identity = cleanText(
    args.baseContext?.plan_strategy.identity_shift,
    220,
  );
  const principle = cleanText(
    args.baseContext?.plan_strategy.core_principle,
    220,
  );
  const constraint = cleanText(
    args.baseContext?.plan_strategy.main_constraint ??
      args.baseContext?.transformation.main_constraint,
    220,
  );
  const isPlanLinked = args.potionScope?.scope_kind === "plan_linked";

  if (!isPlanLinked) {
    switch (args.theme) {
      case "nommer l'evitement sans honte":
        return `Tu peux nommer ${target} sans te juger. L'evitement dit qu'il y a de la peur, pas que tu es incapable.`;
      case "reduire le premier pas":
        return `Pour ${target}, cherche seulement le premier seuil: une phrase, une minute, un brouillon. Pas toute l'action.`;
      case "peur remise en perspective":
        return blocker
          ? `Si ${blocker} monte autour de ${target}, tu peux avancer par une version plus petite, pas par la force.`
          : `Si la peur monte autour de ${target}, baisse la marche plutot que d'attendre d'etre parfaitement pret.`;
      case "micro-action douce":
        return `Aujourd'hui, le courage peut etre minuscule: ouvrir ${target}, preparer un mot, ou toucher le debut sans te pousser violemment.`;
      case "tenir face a l'inconfort":
        return `Tu n'as pas besoin que ${target} devienne confortable pour commencer. Juste assez simple pour rester present.`;
      case "courage sans brutalite":
        return `Le courage n'est pas de te brutaliser. C'est de rester doux avec toi tout en ne laissant pas ${target} disparaitre.`;
      default:
        return `Dernier appui: ${target} peut avancer par un geste tres petit. Tu peux y aller sans te forcer violemment.`;
    }
  }

  switch (args.theme) {
    case "nommer l'evitement sans honte":
      return `Tu peux nommer ${target} sans honte. Ce n'est pas juste une action evitee: c'est un passage dans ton plan.`;
    case "passage de transformation":
      return why
        ? `Ce n'est pas juste ${target}: c'est un passage qui te rapproche de ${why}. Garde le lien au sens, pas la pression.`
        : `Ce n'est pas juste ${target}: c'est un passage qui te rapproche de ce que ton plan veut soutenir.`;
    case "premier seuil doux":
      return action
        ? `Pour ${action}, reduis le seuil: une preparation, une phrase, un debut. Le courage commence plus petit que la pression.`
        : `Reduis le seuil autour de ${target}. Le plan n'a pas besoin d'un grand geste pour rester vivant.`;
    case "peur remise en perspective":
      return blocker
        ? `Quand ${blocker} apparait, reviens au cap: ${target} peut etre traverse doucement, sans chercher a tout controler.`
        : `La peur peut etre la, et le cap aussi. Avance dans ${target} par un geste qui respecte ton rythme.`;
    case "micro-action reliee au plan":
      return principle
        ? `Rappelle-toi le principe du plan: ${principle}. Applique-le a ${target} par une micro-action seulement.`
        : action
        ? `Reste sur ${action}: une micro-action suffit pour garder le lien avec ton plan aujourd'hui.`
        : `Relie ${target} a ton plan par un geste minuscule, sans inventer une nouvelle exigence.`;
    case "courage sans brutalite":
      return constraint
        ? `La contrainte est reelle: ${constraint}. Le courage ici, c'est d'avancer plus finement, pas plus durement.`
        : `Le courage ne veut pas dire te brusquer. Il veut dire ne pas laisser ${target} etre decide par la peur seule.`;
    default:
      return identity
        ? `Dernier appui: ${target} sert aussi la personne que tu deviens: ${identity}. Avance sans violence.`
        : `Dernier appui: garde ${target} relie a ton cap, puis choisis le plus petit pas honnete.`;
  }
}

function fallbackGuerisonMessage(args: {
  theme: string;
  reminderInstruction: string;
  rationale: string | null;
  baseContext?: PotionBaseContext | null;
  potionAnswers?: Record<string, unknown> | null;
  potionScope?: PotionScopeSelection | null;
  targetBinding?: Record<string, unknown> | null;
}): string {
  const source = cleanText(args.reminderInstruction, 220);
  const hurt = recentHurt(args.potionAnswers) || source ||
    "ce qui t'a fait retomber";
  const feeling = dominantFeelingLabel(args.potionAnswers) ||
    "ce que tu ressens";
  const why = firstDeepWhy(args.baseContext);
  const action = targetBindingLabel(args.targetBinding) ||
    firstPlanItemTitle(args.baseContext);
  const identity = cleanText(
    args.baseContext?.plan_strategy.identity_shift,
    220,
  );
  const principle = cleanText(
    args.baseContext?.plan_strategy.core_principle,
    220,
  );
  const constraint = cleanText(
    args.baseContext?.plan_strategy.main_constraint ??
      args.baseContext?.transformation.main_constraint,
    220,
  );
  const isPlanLinked = args.potionScope?.scope_kind === "plan_linked";

  if (!isPlanLinked) {
    switch (args.theme) {
      case "deposer l'episode sans se definir par lui":
        return `Tu peux regarder ${hurt} sans te reduire a ca. On repare le lien avec toi, pas ton jugement sur toi.`;
      case "retombee et valeur personnelle":
        return `${hurt} parle d'un moment difficile, pas de ta valeur. Laisse cette difference respirer aujourd'hui.`;
      case "adoucir le sentiment dominant":
        return `Si ${feeling} pese, reviens a une phrase plus juste: j'ai traverse un moment dur, et je peux reparer doucement.`;
      case "reparer sans analyser lourdement":
        return `Pas besoin de tout expliquer autour de ${hurt}. Pose seulement un geste qui dit: je reviens sans me punir.`;
      case "reprise douce sans punition":
        return `Aujourd'hui, la reprise n'a pas besoin d'etre forte. Elle peut etre douce, simple, et sans dette a payer.`;
      case "ce moment n'annule pas tout":
        return `${hurt} n'annule pas tout ce que tu essayais de construire. C'est un endroit a reparer, pas une condamnation.`;
      default:
        return `Dernier rappel: reviens sans t'ecraser. Tu peux apprendre de ${hurt} sans te parler violemment.`;
    }
  }

  switch (args.theme) {
    case "deposer l'episode sans se definir par lui":
      return `Tu peux deposer ${hurt} dans ton chemin sans en faire ton identite. Le plan n'est pas perdu; le lien se repare.`;
    case "retombee et valeur personnelle":
      return `${hurt} ne dit pas que tu as echoue comme personne. Ca dit qu'un point du chemin demande plus de douceur.`;
    case "adoucir le sentiment dominant":
      return `Si ${feeling} serre fort, ramene le plan a sa fonction: soutenir ton retour, pas ajouter une pression.`;
    case "reprendre contact avec le pourquoi":
      return why
        ? `Reviens au pourquoi sans te forcer: ${why}. Une retombee n'efface pas cette raison; elle demande de la reparer doucement.`
        : `Reviens au sens du plan sans te juger. Une retombee n'annule pas le cap, elle demande un retour plus doux.`;
    case "reprise douce sans punition":
      return action
        ? `Pour ${action}, vise seulement un contact doux. Pas de rattrapage brutal, juste un retour qui respecte ce qui s'est passe.`
        : `Le plan peut reprendre par une marche plus basse. Pas pour compenser, seulement pour rouvrir le lien.`;
    case "le chemin n'est pas annule":
      return constraint
        ? `La contrainte est reelle: ${constraint}. Elle n'annule pas ton chemin; elle indique comment reprendre sans t'ecraser.`
        : `Ce n'est pas parce que tu as retombe que le chemin est perdu. On repare le lien sans te demander de performer.`;
    default:
      return principle || identity
        ? `Dernier rappel: reviens au fil du plan avec douceur: ${
          principle || identity
        }. Le retour compte plus que la punition.`
        : `Dernier rappel: ton plan peut rester un appui de reparation, pas une preuve a fournir. Reviens sans t'ecraser.`;
  }
}

function fallbackAmourMessage(args: {
  theme: string;
  reminderInstruction: string;
  rationale: string | null;
  baseContext?: PotionBaseContext | null;
  potionAnswers?: Record<string, unknown> | null;
  potionScope?: PotionScopeSelection | null;
  targetBinding?: Record<string, unknown> | null;
}): string {
  const source = cleanText(args.reminderInstruction, 220);
  const context = loveLackContext(args.potionAnswers) || source ||
    "cet endroit ou tu manques de douceur";
  const state = loveStateLabel(args.potionAnswers) ||
    "en manque de douceur";
  const why = firstDeepWhy(args.baseContext);
  const action = targetBindingLabel(args.targetBinding) ||
    firstPlanItemTitle(args.baseContext);
  const identity = cleanText(
    args.baseContext?.plan_strategy.identity_shift,
    220,
  );
  const principle = cleanText(
    args.baseContext?.plan_strategy.core_principle,
    220,
  );
  const isPlanLinked = args.potionScope?.scope_kind === "plan_linked";

  if (!isPlanLinked) {
    switch (args.theme) {
      case "nommer le manque d'amour sans jugement":
        return `Tu peux regarder ${context} sans ajouter un jugement de plus. Le manque d'amour demande de la douceur, pas un verdict.`;
      case "dialogue interieur adouci":
        return `Quand tu te sens ${state}, parle-toi une marche plus doucement: pas pour tout excuser, pour rester avec toi.`;
      case "etat actuel non identitaire":
        return `${context} ne definit pas ta valeur. C'est un endroit sensible aujourd'hui, pas une preuve contre toi.`;
      case "petit geste de douceur":
        return `Pour ${context}, choisis un geste minuscule de douceur: ralentir, poser une main, ou te dire une phrase moins dure.`;
      case "partie jugee regard tendre":
        return `La partie de toi liee a ${context} n'a pas besoin d'etre corrigee tout de suite. Elle a d'abord besoin d'un regard moins dur.`;
      case "reconfort sobre":
        return `Si le vide ou la solitude monte autour de ${context}, reste simple: tu peux etre la pour toi sans te demander de bien ressentir.`;
      default:
        return `Dernier rappel: reviens a toi sans te durcir. ${context} peut recevoir un peu plus de tendresse que d'habitude.`;
    }
  }

  switch (args.theme) {
    case "nommer le manque d'amour sans jugement":
      return `Tu peux nommer ${context} sans en faire une preuve contre toi. Le plan peut soutenir ton retour, pas juger ta valeur.`;
    case "plan comme soutien":
      return action
        ? `${action} n'a pas besoin d'etre une preuve contre toi. Cette action peut redevenir un soutien pour la personne que tu essaies de devenir.`
        : `Ce plan n'a pas besoin d'etre une preuve contre toi. Il peut redevenir un soutien pour la personne que tu essaies de devenir.`;
    case "dialogue interieur adouci":
      return `Quand tu te sens ${state}, garde le plan en appui doux: une phrase moins dure avec toi vaut deja un vrai retour.`;
    case "valeur non conditionnelle":
      return why
        ? `Ton pourquoi reste plus grand qu'une journee imparfaite: ${why}. Tu n'as pas a meriter ta douceur par la performance.`
        : `Le plan peut compter sans conditionner ta valeur. Tu peux avancer sans transformer chaque action en jugement.`;
    case "identity shift avec douceur":
      return identity
        ? `La personne que tu deviens peut etre soutenue avec douceur: ${identity}. Pas besoin de te parler plus durement pour y aller.`
        : principle
        ? `Reviens au principe du plan avec douceur: ${principle}. Il sert mieux quand il ne devient pas une pression affective.`
        : `La transformation n'a pas besoin de passer par plus de durete. Le prochain pas peut rester humain.`;
    case "partie jugee regard tendre":
      return `La partie de toi qui se juge autour de ${context} peut entrer dans le plan sans etre punie. Regarde-la comme un endroit a soutenir.`;
    default:
      return `Dernier rappel: reviens au plan comme a un appui, pas comme a un tribunal. Tu peux continuer sans te retirer ton amour.`;
  }
}

function fallbackApaisementMessage(args: {
  theme: string;
  reminderInstruction: string;
  rationale: string | null;
  baseContext?: PotionBaseContext | null;
  potionAnswers?: Record<string, unknown> | null;
  potionScope?: PotionScopeSelection | null;
  targetBinding?: Record<string, unknown> | null;
}): string {
  const source = pressureSource(args.potionAnswers) ||
    cleanText(args.reminderInstruction, 220) ||
    "ce qui te met sous pression";
  const state = pressureStateLabel(args.potionAnswers);
  const why = firstDeepWhy(args.baseContext);
  const action = targetBindingLabel(args.targetBinding) ||
    firstPlanItemTitle(args.baseContext);
  const constraint = cleanText(
    args.baseContext?.plan_strategy.main_constraint ??
      args.baseContext?.transformation.main_constraint,
    220,
  );
  const isPlanLinked = args.potionScope?.scope_kind === "plan_linked";

  if (!isPlanLinked) {
    switch (args.theme) {
      case "nommer la pression sans l'amplifier":
        return `Tu peux nommer la pression autour de ${source} sans l'agrandir. Juste voir ce qui serre, puis respirer plus bas.`;
      case "ralentir le seuil d'exigence":
        return `Pour ${source}, baisse le seuil d'un cran. La priorite est de redescendre, pas de regler tout maintenant.`;
      case "pause courte":
        return `Pause courte: relache les epaules, pose ${source} quelques secondes, et reprends seulement quand l'interieur a un peu d'espace.`;
      case "etat reconnu":
        return state
          ? `Si tu te sens ${state}, ce n'est pas le moment d'ajouter une exigence. Reviens a un geste simple qui calme la montee.`
          : `Quand la pression monte, tu n'as pas a prouver quoi que ce soit. Tu peux commencer par ralentir le rythme.`;
      case "submerge ne veut pas dire incapable":
        return `Etre submerge par ${source} ne veut pas dire etre incapable. Ca veut dire que la charge demande a etre desserree.`;
      case "relacher une partie de la charge":
        return `Aujourd'hui, ne porte pas tout ${source} d'un bloc. Relache une partie de la charge, meme petite.`;
      default:
        return `Dernier appui: reviens a un rythme plus respirable autour de ${source}. Pas plus vite, plus doux.`;
    }
  }

  switch (args.theme) {
    case "nommer la pression sans l'amplifier":
      return action
        ? `Regarde la pression autour de ${action} sans l'agrandir. Le plan peut attendre que ton systeme redescende un peu.`
        : `Tu peux nommer la pression du plan sans la transformer en urgence. D'abord redescendre, ensuite revenir proprement.`;
    case "desserrer l'exigence du plan":
      return why
        ? `Ton plan sert ${why}. Il n'a pas besoin de devenir une pression de plus autour de ${source}.`
        : `Le plan n'a pas besoin de devenir une pression de plus. Autour de ${source}, baisse la marche avant de reprendre.`;
    case "pause courte autour de l'action":
      return action
        ? `Avant ${action}, fais une pause courte. Une action se reprend mieux quand la pression a baisse d'un cran.`
        : `Avant de revenir au plan, fais une pause courte. L'objectif est de desserrer, pas de te pousser.`;
    case "contrainte reconnue":
      return constraint
        ? `La contrainte est reelle: ${constraint}. Elle appelle un rythme plus respirable, pas une preuve de performance.`
        : `Si le plan serre trop, ralentis le seuil. Revenir doucement vaut mieux que forcer sous pression.`;
    case "submerge ne veut pas dire incapable":
      return `Etre submerge autour du plan ne veut pas dire etre incapable. Ca signale surtout qu'il faut reduire la charge visible.`;
    case "relacher une partie de la charge":
      return action
        ? `Pour ${action}, relache une partie de la charge: moins de controle, moins d'urgence, juste le prochain retour possible.`
        : `Relache une partie de la charge du plan aujourd'hui. Tu pourras revenir plus proprement quand l'interieur respire.`;
    default:
      return `Dernier appui: le plan reste la, mais ton rythme compte aussi. Reviens a quelque chose de plus respirable.`;
  }
}

function fallbackClarteMessage(args: {
  theme: string;
  reminderInstruction: string;
  rationale: string | null;
  baseContext?: PotionBaseContext | null;
  potionAnswers?: Record<string, unknown> | null;
}): string {
  const why = firstDeepWhy(args.baseContext);
  const item = firstPlanItemTitle(args.baseContext);
  const reason = planMeaningLossReason(args.potionAnswers);
  const identity = cleanText(
    args.baseContext?.plan_strategy.identity_shift,
    220,
  );
  const principle = cleanText(
    args.baseContext?.plan_strategy.core_principle,
    220,
  );
  const success = cleanText(
    args.baseContext?.plan_strategy.success_definition ??
      args.baseContext?.transformation.success_definition,
    220,
  );
  const constraint = cleanText(
    args.baseContext?.plan_strategy.main_constraint ??
      args.baseContext?.transformation.main_constraint,
    220,
  );
  const summary = cleanText(args.baseContext?.transformation.user_summary, 220);
  const source = cleanText(args.reminderInstruction, 220);
  const rationale = cleanText(args.rationale, 220);

  switch (args.theme) {
    case "pourquoi profond":
      return why && reason
        ? `Si le plan parait loin parce que ${reason}, reviens au pourquoi: ${why}. Le sens passe avant la liste.`
        : why
        ? `Aujourd'hui, reviens au pourquoi: ${why}. Ton plan sert d'abord a garder ce lien vivant, pas a cocher des cases.`
        : `Aujourd'hui, reviens a la raison qui rend ce plan important pour toi. ${
          reason ?? source
        }`;
    case "action du plan reliee au pourquoi":
      return item
        ? `Regarde juste ${item}: ce n'est pas une tache isolee, c'est une facon de rester relie a ce que tu veux construire.`
        : `Choisis une action du plan et demande-toi: quel morceau de mon pourquoi elle protege aujourd'hui ?`;
    case "identite visee":
      return identity
        ? `Ce plan parle aussi de la personne que tu deviens: ${identity}. Reviens a ce shift avant de juger tes actions.`
        : `Ne refais pas tout le plan aujourd'hui. Reviens seulement a la personne que tu voulais soutenir en le choisissant.`;
    case "contrainte remise en perspective":
      return constraint
        ? `La contrainte est reelle: ${constraint}. Elle n'annule pas le sens du plan; elle indique juste ou avancer plus doucement.`
        : `Si le plan parait lourd, ce n'est pas forcement qu'il n'a plus de sens. Reviens au lien plan -> pourquoi, sans tout refaire.`;
    case "ce que le plan protege":
      return success || summary
        ? `Ton plan protege quelque chose de precis: ${
          success || summary
        }. Garde ce repere devant toi aujourd'hui.`
        : `Aujourd'hui, demande-toi ce que ton plan essaie de proteger pour toi. C'est ce lien-la qu'on ravive.`;
    case "retour au cap sans refaire le plan":
      if (reason) {
        return `Quand le plan perd son sens parce que ${reason}, ne le transforme pas en todo. Reviens au cap dessous.`;
      }
      return principle
        ? `Reviens au principe simple: ${principle}. Pas besoin de refaire le plan; juste de retrouver le cap dessous.`
        : `Tu n'as pas besoin de reconstruire tout le plan aujourd'hui. Reviens au cap, puis laisse une action redevenir signifiante.`;
    case "synthese de recentrage":
      return why || rationale
        ? `Dernier rappel de recentrage: ton plan compte parce qu'il reste relie a ${
          why ?? rationale
        }. Garde ce fil, meme imparfaitement.`
        : `Dernier rappel: ton plan n'est pas seulement une liste. Il existe pour soutenir une raison profonde que tu peux retrouver pas a pas.`;
    default:
      return source ||
        "Reviens doucement au lien entre ton plan et ce qui compte vraiment pour toi.";
  }
}

function fallbackGenericMessage(args: {
  theme: string;
  reminderInstruction: string;
  rationale: string | null;
}): string {
  const source = cleanText(args.reminderInstruction, 220);
  const rationale = cleanText(args.rationale, 180);
  switch (args.theme) {
    case "rappel du cap":
      return source || "Reviens doucement au cap que tu voulais soutenir.";
    case "petit appui":
      return `Petit appui aujourd'hui: ${
        source || "garde le fil sans te mettre de pression."
      }`;
    case "presence douce":
      return rationale
        ? `Rappel doux: ${rationale}`
        : "Tu peux reprendre le fil doucement, sans te juger.";
    case "reconnexion":
      return `Reviens une minute a ce qui compte: ${
        source || "la direction reste plus importante que la perfection."
      }`;
    case "continuer sans pression":
      return "Aujourd'hui, l'objectif n'est pas d'en faire beaucoup. C'est de rester en lien avec ton intention.";
    case "tenir le fil":
      return source
        ? `Garde ce fil en tete: ${source}`
        : "Garde juste un fil vivant aujourd'hui.";
    case "cloture de serie":
      return "Dernier rappel de cette serie: garde ce qui t'a aide, et laisse le reste redevenir simple.";
    default:
      return source || "Un petit rappel pour revenir a toi.";
  }
}

export function buildPotionFollowUpFallbackSeries(
  args: PotionFollowUpSeriesInput,
): PotionFollowUpSeriesItem[] {
  const scope = potionScopeSelection(args);
  const themes = args.potionType === "clarte"
    ? CLARTE_THEMES
    : args.potionType === "rappel" &&
        scope?.scope_kind === "plan_linked"
    ? RAPPEL_PLAN_LINKED_THEMES
    : args.potionType === "rappel"
    ? RAPPEL_OUT_OF_PLAN_THEMES
    : args.potionType === "courage" && scope?.scope_kind === "plan_linked"
    ? COURAGE_PLAN_LINKED_THEMES
    : args.potionType === "courage"
    ? COURAGE_OUT_OF_PLAN_THEMES
    : args.potionType === "guerison" && scope?.scope_kind === "plan_linked"
    ? GUERISON_PLAN_LINKED_THEMES
    : args.potionType === "guerison"
    ? GUERISON_OUT_OF_PLAN_THEMES
    : args.potionType === "amour" && scope?.scope_kind === "plan_linked"
    ? AMOUR_PLAN_LINKED_THEMES
    : args.potionType === "amour"
    ? AMOUR_OUT_OF_PLAN_THEMES
    : args.potionType === "apaisement" && scope?.scope_kind === "plan_linked"
    ? APAISEMENT_PLAN_LINKED_THEMES
    : args.potionType === "apaisement"
    ? APAISEMENT_OUT_OF_PLAN_THEMES
    : GENERIC_THEMES;
  const series = Array.from({ length: args.durationDays }).map((_, index) => {
    const theme = themes[index % themes.length];
    const draft = args.potionType === "clarte"
      ? fallbackClarteMessage({
        theme,
        reminderInstruction: args.reminderInstruction,
        rationale: args.rationale ?? null,
        baseContext: args.baseContext,
        potionAnswers: args.questionnaireAnswers,
      })
      : args.potionType === "rappel"
      ? fallbackRappelMessage({
        theme,
        reminderInstruction: args.reminderInstruction,
        rationale: args.rationale ?? null,
        baseContext: args.baseContext,
        potionAnswers: args.questionnaireAnswers,
        rappelScope: scope,
        targetBinding: args.targetBinding,
      })
      : args.potionType === "courage"
      ? fallbackCourageMessage({
        theme,
        reminderInstruction: args.reminderInstruction,
        rationale: args.rationale ?? null,
        baseContext: args.baseContext,
        potionAnswers: args.questionnaireAnswers,
        potionScope: scope,
        targetBinding: args.targetBinding,
      })
      : args.potionType === "guerison"
      ? fallbackGuerisonMessage({
        theme,
        reminderInstruction: args.reminderInstruction,
        rationale: args.rationale ?? null,
        baseContext: args.baseContext,
        potionAnswers: args.questionnaireAnswers,
        potionScope: scope,
        targetBinding: args.targetBinding,
      })
      : args.potionType === "amour"
      ? fallbackAmourMessage({
        theme,
        reminderInstruction: args.reminderInstruction,
        rationale: args.rationale ?? null,
        baseContext: args.baseContext,
        potionAnswers: args.questionnaireAnswers,
        potionScope: scope,
        targetBinding: args.targetBinding,
      })
      : args.potionType === "apaisement"
      ? fallbackApaisementMessage({
        theme,
        reminderInstruction: args.reminderInstruction,
        rationale: args.rationale ?? null,
        baseContext: args.baseContext,
        potionAnswers: args.questionnaireAnswers,
        potionScope: scope,
        targetBinding: args.targetBinding,
      })
      : fallbackGenericMessage({
        theme,
        reminderInstruction: args.reminderInstruction,
        rationale: args.rationale ?? null,
      });
    return {
      day_index: index + 1,
      theme,
      draft_message: cleanText(draft, 420),
    };
  });
  return completeDistinctSeries({
    input: args,
    preferred: series,
    fallback: [],
  });
}

function buildSeriesPrompt(args: PotionFollowUpSeriesInput): string {
  const scope = potionScopeSelection(args);
  const themes = args.potionType === "clarte"
    ? CLARTE_THEMES
    : args.potionType === "rappel" &&
        scope?.scope_kind === "plan_linked"
    ? RAPPEL_PLAN_LINKED_THEMES
    : args.potionType === "rappel"
    ? RAPPEL_OUT_OF_PLAN_THEMES
    : args.potionType === "courage" && scope?.scope_kind === "plan_linked"
    ? COURAGE_PLAN_LINKED_THEMES
    : args.potionType === "courage"
    ? COURAGE_OUT_OF_PLAN_THEMES
    : args.potionType === "guerison" && scope?.scope_kind === "plan_linked"
    ? GUERISON_PLAN_LINKED_THEMES
    : args.potionType === "guerison"
    ? GUERISON_OUT_OF_PLAN_THEMES
    : args.potionType === "amour" && scope?.scope_kind === "plan_linked"
    ? AMOUR_PLAN_LINKED_THEMES
    : args.potionType === "amour"
    ? AMOUR_OUT_OF_PLAN_THEMES
    : args.potionType === "apaisement" && scope?.scope_kind === "plan_linked"
    ? APAISEMENT_PLAN_LINKED_THEMES
    : args.potionType === "apaisement"
    ? APAISEMENT_OUT_OF_PLAN_THEMES
    : GENERIC_THEMES;
  const rappelGuidance = args.potionType === "rappel" &&
      scope?.scope_kind === "plan_linked"
    ? "Pour rappel plan-linked: priorite haute au pourquoi profond, plan actif, actions actives, cadence et contrainte principale. Relie le decrochage a ce que le plan sert vraiment. Si target_plan_item_id est fourni, utilise cette action prioritairement. Si target_scope=whole_plan, relie au cap global/pourquoi profond. Si target_scope=unknown, reste prudent et n'invente pas d'action precise. Ne transforme pas le message en injonction."
    : args.potionType === "rappel"
    ? "Pour rappel hors-plan: n'utilise pas le plan. Reste centre sur drift_target et drift_style. Messages motivants, courts, concrets, sans inventer de transformation."
    : null;
  const courageGuidance = args.potionType === "courage" &&
      scope?.scope_kind === "plan_linked"
    ? "Pour courage plan-linked: utilise le pourquoi profond, le plan actif, l'action ciblee si target_binding ou target_plan_item_id la fournit, la contrainte principale, identity_shift et core_principle. Relie avoidance_target au passage de transformation. N'invente jamais une action absente. Ton doux, non brutal."
    : args.potionType === "courage"
    ? "Pour courage hors-plan: n'utilise pas le plan et ne force pas une transformation. Reste centre sur avoidance_target et blocker_kind. Messages courts de courage doux, sans pression ni brutalite."
    : null;
  const guerisonGuidance = args.potionType === "guerison" &&
      scope?.scope_kind === "plan_linked"
    ? "Pour guerison plan-linked: utilise recent_hurt et dominant_feeling, puis relie doucement au pourquoi profond, a la transformation, a identity_shift, core_principle, main_constraint et a l'action ciblee si connue. Intention: ce n'est pas parce que la personne a retombe que le plan est perdu. Repare le lien sans pousser a performer."
    : args.potionType === "guerison"
    ? "Pour guerison hors-plan: n'utilise pas le plan, ne force pas le pourquoi profond, et reste centre sur recent_hurt et dominant_feeling. Messages courts de reparation emotionnelle, non medicaux, sans analyse lourde."
    : null;
  const amourGuidance = args.potionType === "amour" &&
      scope?.scope_kind === "plan_linked"
    ? "Pour amour plan-linked: utilise love_lack_context et love_state, puis relie avec douceur au pourquoi profond, au plan actif, a l'action ciblee si target_binding ou target_plan_item_id la fournit, identity_shift et core_principle. Intention: le plan n'est pas une preuve de valeur; il peut redevenir un soutien pour la personne que le user essaie de devenir. Ne pousse jamais a performer."
    : args.potionType === "amour"
    ? "Pour amour hors-plan: n'utilise pas le plan, ne force pas le pourquoi profond, et reste centre sur love_lack_context et love_state. Messages courts de douceur, reconfort et regard tendre, non medicaux, sans infantiliser et sans transformer l'amour en performance emotionnelle."
    : null;
  const apaisementGuidance = args.potionType === "apaisement" &&
      scope?.scope_kind === "plan_linked"
    ? "Pour apaisement plan-linked: utilise pressure_source, pressure_state, le plan, la charge visible, la contrainte principale, le pourquoi profond si utile et l'action ciblee si target_binding ou target_plan_item_id la fournit. Le plan ne doit pas devenir une pression de plus: les messages desserrent la pression autour du plan pour pouvoir revenir proprement. N'ajoute aucune tache, aucune injonction de performance, aucune analyse lourde."
    : args.potionType === "apaisement"
    ? "Pour apaisement hors-plan: n'utilise pas le plan, ne force pas le pourquoi profond, et reste centre sur pressure_source et pressure_state. Messages courts d'apaisement: nommer sans amplifier, ralentir l'exigence, creer une pause, relacher une partie de la charge. Ne dis jamais 'calme-toi'."
    : null;
  return [
    "Tu es Sophia. Tu rediges les messages de suivi d'une potion activee depuis la plateforme.",
    'Retourne uniquement un JSON valide: {"messages":[{"day_index":1,"theme":"...","draft_message":"..."}]}',
    `Il faut exactement ${args.durationDays} messages, dans l'ordre.`,
    "Chaque message est court, naturel, en tutoiement, non medical, non culpabilisant, et different des autres.",
    "Ne dis pas Bonjour/Salut/Coucou. Ne demande pas de refaire tout le plan.",
    args.potionType === "clarte"
      ? "Pour clarte, chaque message doit reconnecter le plan au pourquoi profond. Ce n'est pas une aide pour prioriser, decouper ou trouver quoi faire."
      : "Respecte l'intention source sans la recopier mot pour mot.",
    rappelGuidance ?? "",
    courageGuidance ?? "",
    guerisonGuidance ?? "",
    amourGuidance ?? "",
    apaisementGuidance ?? "",
    `Themes a couvrir: ${themes.slice(0, args.durationDays).join(" | ")}`,
  ].filter(Boolean).join("\n");
}

function buildSeriesUserPrompt(args: PotionFollowUpSeriesInput): string {
  return JSON.stringify({
    user_id: args.userId,
    timezone: args.timezone,
    potion_type: args.potionType,
    potion_title: cleanText(args.sessionContent?.potion_name, 120) ||
      args.potionType,
    reminder_instruction: args.reminderInstruction,
    rationale: args.rationale,
    duration_days: args.durationDays,
    potion_answers: args.questionnaireAnswers ?? {},
    follow_up_strategy: args.followUpStrategy ?? {},
    potion_scope: potionScopeSelection(args),
    session_content: args.sessionContent ?? {},
    rappel_scope: args.rappelScope ?? null,
    target_binding: args.targetBinding ?? null,
    base_context: args.baseContext
      ? {
        transformation: args.baseContext.transformation,
        plan_strategy: args.baseContext.plan_strategy,
        plan_items: args.baseContext.plan_items.slice(0, 8),
      }
      : null,
  });
}

export async function generatePotionFollowUpSeries(
  args: PotionFollowUpSeriesInput,
  options: PotionFollowUpSeriesOptions = {},
): Promise<PotionFollowUpSeriesItem[]> {
  const fallback = buildPotionFollowUpFallbackSeries(args);
  try {
    const systemPrompt = buildSeriesPrompt(args);
    const userPrompt = buildSeriesUserPrompt(args);
    const raw = options.llmRunner
      ? await options.llmRunner(systemPrompt, userPrompt)
      : await generateWithGemini(
        systemPrompt,
        userPrompt,
        0.55,
        true,
        [],
        "auto",
        {
          requestId: options.requestId ?? undefined,
          userId: options.userId ?? undefined,
          source: "potion-follow-up-series",
          model: getGlobalAiModel("gemini-2.5-flash"),
          maxRetries: 1,
          httpTimeoutMs: 25_000,
        },
      );
    const parsed = parseGeneratedSeries(raw, args.durationDays);
    const unique = uniqueByMessage(parsed);
    return completeDistinctSeries({
      input: args,
      preferred: unique,
      fallback,
    });
  } catch {
    return fallback;
  }
}
