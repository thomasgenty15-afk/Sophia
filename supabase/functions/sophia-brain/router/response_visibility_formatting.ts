const INTERNAL_COMMENT_MARKERS = [
  "fil_rouge_whatsapp",
  "fil_rouge",
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeCommentBlock(text: string, pattern: RegExp): string {
  return text.replace(
    pattern,
    (match) => match.includes("\n") ? "\n" : "",
  );
}

export function stripHiddenHtmlComments(text: unknown): string {
  let visibleText = String(text ?? "");
  for (const marker of INTERNAL_COMMENT_MARKERS) {
    const escapedMarker = escapeRegex(marker);
    visibleText = removeCommentBlock(
      visibleText,
      new RegExp(
        `[ \\t]*\\n?[ \\t]*<!--\\s*${escapedMarker}\\s*:[\\s\\S]*?-->[ \\t]*\\n?[ \\t]*`,
        "gi",
      ),
    );
    visibleText = visibleText.replace(
      new RegExp(
        `[ \\t]*\\n?[ \\t]*${escapedMarker}\\s*:\\s*[^\\n<]+`,
        "gi",
      ),
      (match) => match.includes("\n") ? "\n" : "",
    );
  }
  visibleText = removeCommentBlock(
    visibleText,
    /[ \t]*\n?[ \t]*<!--[\s\S]*?-->[ \t]*\n?[ \t]*/g,
  );
  return visibleText.replace(/\n{3,}/g, "\n\n").trim();
}

// P3-E (nina-global18 T15): des identifiants internes fuyaient en texte
// visible (« defense_card ») quand le composeur confabulait une liste de
// techniques. Garde de rendu déterministe: tout slug/enum interne connu se
// traduit en libellé français — aucun token technique n'atteint le user.
const INTERNAL_SLUG_LABELS: Array<[RegExp, string]> = [
  [/\bprepare_defense_card\b/g, "carte de défense"],
  [/\bprepare_attack_card\b/g, "carte d'attaque"],
  [/\bdefense_card\b/g, "carte de défense"],
  [/\battack_card\b/g, "carte d'attaque"],
  [/\bstate_potion\b/g, "potion d'état"],
  [/\bcoach_preferences\b/g, "préférences coach"],
  [/\bcreate_one_shot_reminder\b/g, "rappel ponctuel"],
  [/\bone_shot_reminder\b/g, "rappel ponctuel"],
  [/\btrack_progress_plan_item\b/g, "suivi d'action"],
  [/\bplan_realignment\b/g, "ajustement du plan"],
  [/\bfeature_opportunity\b/g, "initiative"],
  [/\bproduct_help\b/g, "aide produit"],
];

export function stripDeprecatedProductVocabulary(text: string): string {
  let out = text;
  for (const [pattern, label] of INTERNAL_SLUG_LABELS) {
    out = out.replace(pattern, label);
  }
  return out;
}

export function ensureVisibleSophiaEmoji(text: unknown): string {
  return String(text ?? "").trim();
}
