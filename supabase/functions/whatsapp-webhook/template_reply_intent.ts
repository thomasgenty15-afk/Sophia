function cleanInboundText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

// Keep this intentionally anchored: it recognizes a short, self-contained
// agreement, not every sentence that happens to contain "oui" or "ok".
export function isNaturalOptInAgreementText(value: unknown): boolean {
  const text = cleanInboundText(value);
  return /^(?:(?:oui|ouais|yes)(?:\s+(?:carr[ée]ment|absolument|c[’']?est\s+(?:bien\s+)?moi|c[’']?est\s+parti))?|(?:ok|okay)(?:\s*,?\s*)(?:oui|carr[ée]ment|absolument|c[’']?est\s+parti)|carr[ée]ment|absolument|c[’']?est\s+(?:bien\s+)?moi)\s*[!.…]*$/i
    .test(text);
}

export function isCheckinYesFallbackText(value: unknown): boolean {
  return /^(oui\b|go+\b|let'?s\s*go\b|c[’']?est\s+parti\b|avec\s+plaisir\b|carr[ée]ment\b)/i
    .test(cleanInboundText(value));
}

export function isCheckinLaterFallbackText(value: unknown): boolean {
  return /plus\s*tard|une\s+prochaine\s+fois|une\s+autre\s+fois|on\s+le\s+fait\s+demain|not\s+this\s+time|pas\s+maintenant|pas\s+pour\s+le\s+moment|pas\s+cette\s+semaine|(?:à\s+)?la\s+semaine\s+prochaine|pas\s+ce\s+soir|pas\s+aujourd[’']?hui/i
    .test(cleanInboundText(value));
}
