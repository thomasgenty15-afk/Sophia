import type { RetrievalHint, RetrievalMode } from "../types.v1.ts";

export interface SignalMatch {
  detected: boolean;
  confidence: number;
  terms: string[];
}

export interface DetectedSignals {
  trivial: SignalMatch;
  correction: SignalMatch;
  forget: SignalMatch;
  safety: SignalMatch;
  explicit_topic_switch: SignalMatch;
  dated_reference: SignalMatch;
  action_related: SignalMatch;
  sensitive: SignalMatch;
  cross_topic_profile_query: SignalMatch;
  high_emotion: SignalMatch;
  retrieval_mode: RetrievalMode;
  retrieval_hints: RetrievalHint[];
}

type Pattern = {
  term: string;
  re: RegExp;
  confidence: number;
};

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function p(term: string, source: string, confidence = 0.8): Pattern {
  return { term, re: new RegExp(source, "i"), confidence };
}

const PATTERNS: Record<
  keyof Omit<DetectedSignals, "retrieval_mode" | "retrieval_hints">,
  Pattern[]
> = {
  trivial: [
    p(
      "ack",
      "^(ok|okay|d'?accord|merci|yes|oui|grave|je vois|noted)[.!? ]*$",
      0.75,
    ),
    p("short_ack", "^(ca marche|parfait|super|top|cool)[.!? ]*$", 0.72),
  ],
  correction: [
    p(
      "correction",
      "\\b(en fait|enfaite|non mais|non c'est pas ca|ce n'est pas ca|c'est pas ca|tu as mal compris|t'as mal compris|je me suis trompe|c'etait pas|ce n'etait pas|ce n'est plus vrai|c'est plus vrai|plutot|corrige|correction)\\b",
      0.86,
    ),
    p(
      "not_x_but_y",
      "\\b(pas|plus)\\s+[^.?!]{1,40}\\s+(mais|c'etait|c'est)\\b",
      0.72,
    ),
  ],
  forget: [
    p(
      "forget",
      "\\b(oublie|oublies|efface|supprime|retire|ne garde pas|garde pas|ne retiens pas|retiens pas|delete|forget)\\b",
      0.9,
    ),
    p(
      "privacy_delete",
      "\\b(je veux que tu oublies|ne memorise pas|ne retiens pas|n'enregistre pas)\\b",
      0.95,
    ),
  ],
  safety: [
    p(
      "self_harm",
      "\\b(suicide|suicider|me tuer|me faire du mal|scarifier|j'en peux plus|plus envie de vivre)\\b",
      0.96,
    ),
    p(
      "danger",
      "\\b(en danger|urgence|violence|menace|agresse|agression)\\b",
      0.88,
    ),
  ],
  explicit_topic_switch: [
    p(
      "switch",
      "\\b(changement de sujet|changeons de sujet|autre sujet|rien a voir|a part ca|nouveau sujet)\\b",
      0.95,
    ),
    p("back_to", "\\b(revenons a|je veux parler de|parlons de)\\b", 0.78),
  ],
  dated_reference: [
    p(
      "relative_day",
      "\\b(hier|avant-hier|ce matin|ce soir|hier soir|demain|apres-demain|lendemain)\\b",
      0.86,
    ),
    p(
      "weekday",
      "\\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)( dernier| soir| matin)?\\b",
      0.8,
    ),
    p(
      "relative_week",
      "\\b(la semaine derniere|il y a deux semaines|dans deux jours|il y a \\d+ jours?)\\b",
      0.86,
    ),
  ],
  action_related: [
    p(
      "routine",
      "\\b(routine|habitude|marche|sport|meditation|check.?in|objectif|plan|tache|todo)\\b",
      0.78,
    ),
    p(
      "missed_action",
      "\\b(j'ai rate|j'ai manque|pas fait|j'ai fait|j'ai reussi|streak|serie)\\b",
      0.82,
    ),
  ],
  sensitive: [
    p(
      "addiction",
      "\\b(cannabis|alcool|drogue|porno|rechute|addiction|craving)\\b",
      0.88,
    ),
    p(
      "mental_health",
      "\\b(anxiete|depression|honte|trauma|panique|therapie|psy|humilie|rupture)\\b",
      0.78,
    ),
    p(
      "family_health",
      "\\b(maladie|hopital|famille|pere|mere|sexualite|argent|dette)\\b",
      0.72,
    ),
  ],
  cross_topic_profile_query: [
    p(
      "profile_query",
      "\\b(tu te souviens|qu'est-ce que tu sais|qu'est ce que tu sais|dans tous mes sujets|globalement|en general|ma psychologie|mes sujets)\\b",
      0.86,
    ),
    p(
      "patterns",
      "\\b(mes patterns|mes schemas|mes tendances|a travers mes|pourquoi je bloque|comprendre pourquoi)\\b",
      0.8,
    ),
  ],
  high_emotion: [
    p(
      "strong_emotion",
      "\\b(je suis nul|je suis nulle|incapable|honte de moi|detruit|effondre|humilie|angoisse)\\b",
      0.84,
    ),
    p(
      "intensity",
      "\\b(tellement|vraiment|toujours|jamais)\\b.*\\b(mal|peur|honte|colere|triste)\\b",
      0.7,
    ),
  ],
};

function detectOne(text: string, patterns: Pattern[]): SignalMatch {
  const terms: string[] = [];
  let confidence = 0;
  for (const pattern of patterns) {
    if (!pattern.re.test(text)) continue;
    terms.push(pattern.term);
    confidence = Math.max(confidence, pattern.confidence);
  }
  return { detected: terms.length > 0, confidence, terms };
}

export function detectMemorySignals(input: string): DetectedSignals {
  const text = normalize(input);
  const out = Object.fromEntries(
    Object.entries(PATTERNS).map(([key, patterns]) => [
      key,
      detectOne(text, patterns),
    ]),
  ) as Omit<DetectedSignals, "retrieval_mode" | "retrieval_hints">;

  const retrieval_mode: RetrievalMode = out.safety.detected
    ? "safety_first"
    : out.cross_topic_profile_query.detected
    ? "cross_topic_lookup"
    : "topic_continuation";

  const hints: RetrievalHint[] = [];
  if (out.dated_reference.detected) hints.push("dated_reference");
  if (out.correction.detected || out.forget.detected) hints.push("correction");
  if (out.action_related.detected) hints.push("action_related");

  return { ...out, retrieval_mode, retrieval_hints: hints };
}
