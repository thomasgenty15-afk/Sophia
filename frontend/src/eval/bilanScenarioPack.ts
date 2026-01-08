type Scenario = {
  dataset_key: string;
  id: string;
  scenario_target?: string;
  description?: string;
  tags?: string[];
  steps?: { user: string }[];
  persona?: any;
  objectives?: any[];
  assertions?: any;
};

type DemeanorKey = "cooperative" | "rushed" | "unavailable" | "hostile";
type OutcomeKey = "all_done" | "none_done" | "mixed" | "uncertain";
type ConstraintKey = "normal" | "digress" | "stop_midway";

const DEMEANORS: Array<{
  key: DemeanorKey;
  label: string;
  style: string;
  background: string;
}> = [
  {
    key: "cooperative",
    label: "Utilisateur coopératif",
    style: "réponses claires, bonne foi, ton neutre",
    background: "veut bien faire, prêt à répondre point par point",
  },
  {
    key: "rushed",
    label: "Utilisateur pressé",
    style: "direct, très court, veut finir vite",
    background: "fatigué, veut boucler en 1-2 minutes",
  },
  {
    key: "unavailable",
    label: "Utilisateur indisponible",
    style: "réponses laconiques, distrait, peu engagé",
    background: "en déplacement / occupé, répond par à-coups, veut reporter",
  },
  {
    key: "hostile",
    label: "Utilisateur agacé",
    style: "sec, défensif, impatient",
    background: "sceptique, trouve le bilan pénible, répond à contrecœur",
  },
];

const OUTCOMES: Array<{ key: OutcomeKey; label: string; hint: string }> = [
  {
    key: "all_done",
    label: "a tout fait",
    hint: "Pour chaque action, dit clairement que c'est fait (completed).",
  },
  {
    key: "none_done",
    label: "n'a rien fait",
    hint: "Pour chaque action, dit clairement que ce n'est pas fait (missed) + une raison brève.",
  },
  {
    key: "mixed",
    label: "mixte / partiel",
    hint: "Mélange completed / partial / missed. Donne des réponses réalistes et variées.",
  },
  {
    key: "uncertain",
    label: "ne sait plus / vague",
    hint: "Réponses floues ('je sais plus', 'un peu'). Peut se corriger. Doit rester plausible.",
  },
];

const CONSTRAINTS: Array<{ key: ConstraintKey; label: string; hint: string }> = [
  {
    key: "normal",
    label: "normal",
    hint: "Reste dans le bilan, répond item par item jusqu'à la fin.",
  },
  {
    key: "digress",
    label: "digression",
    hint: "Fait une digression au milieu (problème du moment) puis revient au bilan si on le recadre.",
  },
  {
    key: "stop_midway",
    label: "stop au milieu",
    hint: "Demande à arrêter/pause le bilan après 1-2 items ('stop', 'on arrête').",
  },
];

function buildObjectives(demeanor: DemeanorKey, outcome: OutcomeKey, constraint: ConstraintKey): any[] {
  return [
    // Keep this first so MEGA_TEST_MODE stub at least triggers a checkup-ish flow.
    { kind: "trigger_checkup" },
    {
      kind: "bilan_user_behavior",
      demeanor,
      outcome,
      constraint,
      instructions: [
        "Contexte: l'assistant fait un BILAN (check-up) de plusieurs actions/frameworks actifs.",
        "Réponds comme un humain, en français, messages courts.",
        "L'assistant va te demander l'état de chaque action: répond en cohérence avec ton profil.",
        OUTCOMES.find((o) => o.key === outcome)?.hint,
        CONSTRAINTS.find((c) => c.key === constraint)?.hint,
        demeanor === "rushed" ? "Si on s'éternise, répète que tu veux finir vite." : null,
        demeanor === "unavailable" ? "Tu es occupé: tu peux dire que tu n'as pas le temps et proposer de reporter, mais si on insiste gentiment tu réponds vite fait." : null,
        demeanor === "hostile" ? "Si l'assistant insiste, montre de l'agacement sans insulter." : null,
      ].filter(Boolean),
    },
  ];
}

export function buildBilanScenarioPack(): Scenario[] {
  const baseTags = ["sophia.dispatcher", "sophia.investigator", "sophia.companion"];
  const out: Scenario[] = [];

  for (const d of DEMEANORS) {
    for (const o of OUTCOMES) {
      for (const c of CONSTRAINTS) {
        const id = `bilan_${d.key}__${o.key}__${c.key}`;
        out.push({
          dataset_key: "core",
          id,
          scenario_target: "bilan",
          tags: baseTags,
          description: `Bilan: ${d.label} · ${o.label} · ${c.label}`,
          persona: {
            label: d.label,
            age_range: "25-50",
            style: d.style,
            background: `${d.background}. Profil bilan: ${o.label}. Contrainte: ${c.label}.`,
          },
          objectives: buildObjectives(d.key, o.key, c.key),
          assertions: {
            must_include_agent: ["investigator"],
            must_keep_investigator_until_stop: true,
            stop_regex: "\\b(stop|arr[êe]te|on arr[êe]te|pause)\\b",
            assistant_must_not_match: ["\\*\\*"],
          },
        });
      }
    }
  }

  return out;
}


