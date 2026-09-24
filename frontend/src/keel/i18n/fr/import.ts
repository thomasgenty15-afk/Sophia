// Pack français — le namespace `import`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `import.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frImport = {
  // ── /coach/import et /coach/templates — l'import et la relecture ──────────
  // ── Import d'un plan (`/coach/import`) ───────────────────────────────────
  "import.title": "Importer un plan",
  "import.subtitle":
    "Colle un plan, ou dépose le document. Chaque ligne extraite reste rattachée à sa source — tu relis, rien ne se publie tout seul.",
  "import.document": "Ton document",
  "import.extraction": "Engagements extraits",
  "import.paste_placeholder":
    "Colle ton plan ici — exactement comme tu l’as écrit pour ton client.",
  "import.upload_label": "Déposer un PDF ou une photo",
  "import.run": "Décomposer le plan",
  "import.running": "Lecture en cours…",
  "import.loading_hint": "Lecture de ton document. Un PDF prend jusqu’à une minute.",
  "import.empty_state": "Le plan décomposé s’affichera ici, ligne par ligne.",
  "import.confidence": "Confiance de l’extraction",
  // « à tenir » et pas « engagements » : le compte sous cette étiquette compte ce
  // que l'élève doit TENIR. Les observations sont à côté, jamais dedans — et le
  // mot est déjà celui de `part.hint.observations` (« jamais une consigne à
  // tenir, donc jamais comptée comme telle »).
  "import.stat_commitments": "à tenir",
  "import.stat_observed": "+ {count} en observation",
  "import.stat_review": "à vérifier",
  "import.stat_gaps": "trous détectés",
  "import.gaps_title": "À compléter — le document ne dit rien sur :",
  "import.unparsed_title": "Gardé tel quel, non encodé",
  "import.dropzone": "Dépose un PDF ici, ou clique pour parcourir",
  "import.parsing": "Lecture du document…",
  "import.parse_failed": "Ce document n’a pas pu être lu. Essaie un autre fichier.",
  "import.page_count": "{count} pages détectées",
  "import.start_review": "Relire le plan extrait",
} satisfies TranslatedMessagesOf<"import">;
