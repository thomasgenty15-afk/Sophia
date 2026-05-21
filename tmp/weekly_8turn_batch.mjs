import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runPrefix = process.env.WEEKLY_8TURN_RUN_PREFIX || "weekly-8turn-r4";

const scenarios = [
  {
    runId: `${runPrefix}-partial_habits_mission_partial`,
    variant: "partial_habits_mission_partial",
    connectionFile:
      `tmp/weekly-real-conversation-qa/connections/${runPrefix}-partial_habits_mission_partial.json`,
    messages: [
      "Je l'ai vecue en deux parties : debut OK, puis fatigue forte jeudi/vendredi. Et tant qu'on y est, tu peux me mettre un rappel mercredi 18h pour faire la respiration ?",
      "Oui la fatigue c'est le vrai sujet. Et j'ai oublie de cocher : respiration faite mardi et jeudi, point positif fait vendredi.",
      "Tu peux aussi me creer une carte defense anti-fatigue pour le moment ou je rentre le soir et que je veux juste m'effondrer ?",
      "Non stop, je ne veux pas de nouveau rappel ou de fiche la. Reviens au bilan weekly : ne cree rien, je veux juste decider la semaine prochaine.",
      "Et reprends bien l'oubli de coche dans le bilan : respiration mardi et jeudi, point positif vendredi. C'est important pour ne pas repartir sur une fausse base.",
      "Pour la semaine prochaine je veux respiration lundi et mercredi, point positif seulement vendredi, et la mission signal de pause juste a finir sans pression.",
      "Est-ce que ca doit passer par ajuster le plan, ou le weekly peut l'appliquer directement ? Je veux pas perdre le fil.",
      "Ok si tu as bien compris, applique la version allegee et dis-moi concretement ce qui change et si la validation est dispo.",
    ],
  },
  {
    runId: `${runPrefix}-not_relevant_level_review`,
    variant: "not_relevant_level_review",
    connectionFile:
      `tmp/weekly-real-conversation-qa/connections/${runPrefix}-not_relevant_level_review.json`,
    messages: [
      "Je vais etre chiant : le plan ne me convient plus, mais je ne veux pas tout jeter. Je veux garder l'objectif et changer tres precisement les actions.",
      "Non, pas une revue vague du niveau. Je veux remplacer la respiration par une deconnexion de 7 minutes apres le diner, mardi et jeudi uniquement.",
      "Le point positif ne doit pas etre quotidien. Je veux le mettre samedi matin seulement, parce que la semaine je n'y crois pas.",
      "La mission signal de pause, je ne veux pas la supprimer. Je veux la renommer en phrase de sortie et la mettre vendredi, 10 minutes max.",
      "Avant d'appliquer quoi que ce soit, redis-moi exactement ce que tu comptes modifier, sans parler de plan global.",
      "Ce n'est toujours pas assez precis : mardi/jeudi pour deconnexion, samedi matin pour point positif, vendredi pour phrase de sortie. Rien lundi, rien mercredi.",
      "Ok applique seulement ca. Ne touche pas aux supports, ne change pas l'objectif du niveau, et ne rajoute pas de nouvelle action.",
      "Maintenant dis-moi si la validation de la semaine prochaine est dispo, et ce que je dois verifier avant de valider.",
    ],
  },
];

const outputs = [];
for (const scenario of scenarios) {
  const connection = JSON.parse(
    fs.readFileSync(path.join(root, scenario.connectionFile), "utf8"),
  );
  const statePath = path.join(
    root,
    "tmp",
    "weekly-real-conversation-qa",
    scenario.runId,
    "state.json",
  );
  const completedTurns = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8")).turns?.length ?? 0
    : 0;
  for (const [index, message] of scenario.messages.entries()) {
    if (index < completedTurns) continue;
    const args = [
      "tmp/weekly_real_conversation_turn.mjs",
      "--run-id",
      scenario.runId,
      "--variant",
      scenario.variant,
      "--connection-file",
      scenario.connectionFile,
      "--scope",
      connection.scope,
      "--text",
      message,
    ];
    const raw = execFileSync("node", args, {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(raw);
    outputs.push({
      run_id: scenario.runId,
      turn: index + 1,
      ok: parsed.ok,
      assistant: parsed.assistant,
      selected_handler: parsed.trace_short?.selected_handler ?? null,
      executed_tools: parsed.trace_short?.executed_tools ?? null,
    });
    console.log(JSON.stringify(outputs.at(-1), null, 2));
  }
}

const outPath = path.join(
  root,
  "tmp",
  "weekly-real-conversation-qa",
  `${runPrefix}-batch-summary.json`,
);
fs.writeFileSync(outPath, `${JSON.stringify(outputs, null, 2)}\n`);
console.log(JSON.stringify({ summary_file: path.relative(root, outPath) }));
