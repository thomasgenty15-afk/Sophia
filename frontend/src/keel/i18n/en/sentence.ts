// Seed anglais — le namespace `sentence`, et lui seul.
// Assemblé dans `../en.ts`; une clé `sentence.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enSentence = {
  // ==========================================================================
  // THE COACH'S SENTENCE (api/labels.ts::commitmentSentence)
  //
  // One plan line, rebuilt in English on a fixed skeleton:
  //     WHEN - HOW MUCH ( of ) WHAT
  // Everything below is a fragment of that skeleton. They are written to be
  // COMPOSED, so most are lowercase and capitalized at assembly time; the ones
  // that always start a sentence carry their own capital.
  // ==========================================================================

  "sentence.separator": " — ",
  // ⚠️ CE GABARIT NE PORTE PLUS LE « of », ET C'EST LA TRADUCTION QUI L'A
  // DÉPLACÉ. La préposition touche le mot qu'elle gouverne dès qu'on sort de
  // l'anglais — « de légumes » mais « d'œufs » —, donc elle vit maintenant dans
  // `food_group.of.*`, collée à chaque groupe. Ce qui reste ici est le seul
  // morceau qui soit vraiment du gabarit: l'ORDRE des deux moitiés.
  "sentence.amount_of": "{amount} {object}",
  // Said on EVERY capture line. A student who thinks they are being graded on
  // a weight or a mood score starts hiding the bad ones; the coach then reads
  // a curated week. This clause is the whole defence.
  "sentence.tracked_suffix": " · tracked, not scored",
} as const
