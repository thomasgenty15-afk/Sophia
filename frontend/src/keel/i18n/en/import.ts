// Seed anglais — le namespace `import`, et lui seul.
// Assemblé dans `../en.ts`; une clé `import.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enImport = {
  // Plan import
  "import.title": "Import a plan",
  "import.subtitle":
    "Paste a plan or upload the document. Every extracted line stays traceable to its source — you review, nothing publishes itself.",
  "import.document": "Your document",
  "import.extraction": "Extracted commitments",
  "import.paste_placeholder": "Paste your plan here — exactly as you wrote it for your client.",
  "import.upload_label": "Upload PDF or photo",
  "import.run": "Decompose the plan",
  "import.running": "Reading...",
  "import.loading_hint": "Reading your document. A PDF takes up to a minute.",
  "import.empty_state": "The decomposed plan will appear here, line by line.",
  "import.confidence": "Extraction confidence",
  // "to hold", not "commitments": the number under this label counts what the
  // student has to HOLD. Observations sit under `import.stat_observed`, beside
  // it and never inside it — the observations block itself says they are
  // "never a thing to hold, so never counted as one".
  "import.stat_commitments": "to hold",
  "import.stat_observed": "+ {count} observed",
  "import.stat_review": "to review",
  "import.stat_gaps": "gaps found",
  "import.gaps_title": "To complete — the document does not cover:",
  "import.unparsed_title": "Kept verbatim, not encoded",
  "import.dropzone": "Drop a PDF here or click to browse",
  "import.parsing": "Reading your document...",
  "import.parse_failed": "We could not read this document. Please try another file.",
  "import.page_count": "{count} pages detected",
  "import.start_review": "Review extracted plan",
} as const
