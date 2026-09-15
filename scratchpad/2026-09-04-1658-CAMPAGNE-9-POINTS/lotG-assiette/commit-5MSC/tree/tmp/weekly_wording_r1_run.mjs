import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const runRoot = path.join(root, "tmp", "weekly-real-conversation-qa");

const scenarios = [
  {
    runId: "weekly-wording-r3-all_habits_done_mission_missed",
    connection:
      "tmp/weekly-real-conversation-qa/connections/weekly-wording-r3-all_habits_done_mission_missed.json",
    variant: "wording_objective_stable_mission_missed",
    messages: [
      "Cette semaine l'objectif pour moi c'etait surtout de stabiliser mes soirees. Franchement les habitudes m'ont aide, je me sens plus pose. Par contre la mission du signal de pause n'a pas ete faite, mais elle reste utile. Tu me dis simplement ce que ca change pour la semaine prochaine ?",
      "Je veux eviter les mots techniques. Ca veut dire qu'on passe a la suite et qu'on reporte juste cette mission, c'est bien ca ?",
      "Et les habitudes que j'ai faites, tu ne les reproposes pas et tu ne changes pas leur rythme ?",
      "Avant de confirmer quoi que ce soit, je peux valider la semaine prochaine maintenant ou il faut finir ce point de fin de semaine ?",
      "Ok donc si je dis demain matin on reprend, tu ne gardes pas un brouillon en attente. Rien n'est confirme maintenant, c'est ca ?",
      "Resume-moi en version user: objectif, ce qui est fait, ce qu'on reporte, et quand la validation devient dispo.",
    ],
  },
  {
    runId: "weekly-wording-r3-partial_habits_mission_partial",
    connection:
      "tmp/weekly-real-conversation-qa/connections/weekly-wording-r3-partial_habits_mission_partial.json",
    variant: "wording_fatigue_partial_week",
    messages: [
      "Mon objectif c'etait de garder un minimum de rythme sans me cramer. En vrai j'ai fait une partie, mais jeudi/vendredi j'etais vide. La mission est commencee mais pas finie. Tu proposes quoi sans me parler de semaine pont ?",
      "Quand tu dis semaine allegee, je veux comprendre concretement: on garde le cap mais on met moins de choses, ou on repousse juste la mission ?",
      "Je veux bien une proposition, mais pas des regles abstraites sur la fatigue. Parle-moi de l'organisation de la semaine prochaine.",
      "Ne l'applique pas maintenant. Dis-moi juste ce qui change en 3 lignes max.",
      "Si je demande a changer l'organisation pour alleger la respiration de pause, tu peux passer par le flow d'ajustement puis revenir au bilan ?",
      "Finalement ne change rien tout de suite. Resume ce qu'on a decide en mots simples et dis si la validation est dispo ou pas.",
    ],
  },
  {
    runId: "weekly-wording-r3-not_relevant_level_review",
    connection:
      "tmp/weekly-real-conversation-qa/connections/weekly-wording-r3-not_relevant_level_review.json",
    variant: "wording_objective_mismatch_level_review",
    messages: [
      "La realisation cote user: je n'ai presque rien fait parce que l'objectif ne me parle plus comme ca. Ce n'est pas juste une action a reporter, c'est le format du niveau qui ne colle plus.",
      "Je veux que tu m'expliques ca simplement: on ne fait pas une semaine allegee, on revoit plutot la forme du niveau ?",
      "Oui, mais ne supprime rien automatiquement. Je veux comprendre ce qu'il faut revoir: l'objectif, les actions, ou la charge ?",
      "Si je demande une modification apres ce bilan, tu peux utiliser l'ajustement de plan, mais je veux revenir ensuite au point de fin de semaine.",
      "Pour l'instant je ne veux rien appliquer. Dis-moi juste quelle est la prochaine discussion utile.",
      "Fais-moi le rapport de ce point en vocabulaire simple: semaine non faite, objectif pas clair, revue du niveau, pas de validation precipitee.",
    ],
  },
];

for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.runId} ===`);
  const connection = JSON.parse(
    fs.readFileSync(path.join(root, scenario.connection), "utf8"),
  );
  for (const message of scenario.messages) {
    const output = execFileSync("node", [
      "tmp/weekly_real_conversation_turn.mjs",
      "--run-id",
      scenario.runId,
      "--connection-file",
      scenario.connection,
      "--variant",
      scenario.variant,
      "--scope",
      connection.scope,
      "--text",
      message,
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 1024 * 1024 * 20,
    });
    const parsed = JSON.parse(output);
    console.log(JSON.stringify({
      turn: parsed.turn,
      ok: parsed.ok,
      owner: parsed.trace_short?.response_owner ?? null,
      handler: parsed.trace_short?.selected_handler ?? null,
      assistant: String(parsed.assistant ?? "").slice(0, 500),
    }, null, 2));
  }
}

const summary = scenarios.map((scenario) => {
  const statePath = path.join(runRoot, scenario.runId, "state.json");
  const setupPath = path.join(runRoot, scenario.runId, "setup.json");
  return {
    run_id: scenario.runId,
    state_file: path.relative(root, statePath),
    setup_file: path.relative(root, setupPath),
    turns: JSON.parse(fs.readFileSync(statePath, "utf8")).turns.length,
  };
});

console.log(`\nSUMMARY ${JSON.stringify(summary, null, 2)}`);
