// FF-066 · L'aide sur l'app — le titre du bloc injecté au composeur.
//
// Lu par deux côtés qui doivent dire la même chose:
//   - la règle du prompt (`sophia-brain/agents/companion.ts`), qui dit au modèle
//     « réponds uniquement depuis ce bloc »;
//   - le constructeur du bloc (`block.ts`), qui l'écrit en tête.
// Un titre dupliqué à la main dans les deux fichiers finirait par diverger, et la
// règle désignerait un bloc que le modèle ne voit jamais.
//
// Module sans import: il est lu aussi par les tests vitest du front.

export const APP_HELP_BLOCK_TITLE = {
  fr: "AIDE SUR L'APP",
  en: "APP HELP",
} as const;
