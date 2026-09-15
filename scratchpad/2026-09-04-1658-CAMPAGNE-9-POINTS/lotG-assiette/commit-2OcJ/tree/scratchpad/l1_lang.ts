/**
 * L1 — détecteur de langue de SONDE, ISOLÉ de tout accès réseau.
 *
 * Module à part pour que le run « modèle coupé » (qui n'a ni base ni clés)
 * puisse l'importer sans tirer le harnais QA et son exigence de secrets.
 */
/**
 * Détecteur de langue de SONDE — mots-outils à frontière de mot, comptés.
 *
 * ⚠️ T-15: c'est un instrument, pas une vérité. Il rend les DEUX compteurs et
 * le texte, pour qu'un verdict se relise à la main. Une sonde qui rendrait
 * seulement « fr » ou « en » cacherait exactement le cas qui compte ici: le
 * texte MIXTE.
 */
const FR_MARKERS = [
  "je", "tu", "ton", "ta", "tes", "est-ce", "c'est", "pas", "une", "des",
  "les", "avec", "pour", "dans", "aujourd'hui", "maintenant", "danger",
  "sécurité", "immédiat", "quelque", "rien", "bien", "peux", "veux", "sur",
  "que", "qui", "et", "moi", "toi", "on", "ça", "alors", "donc", "aussi",
];
const EN_MARKERS = [
  "the", "you", "your", "is", "are", "and", "if", "with", "for", "that",
  "this", "was", "were", "what", "when", "here", "there", "right", "now",
  "safe", "danger", "call", "can", "want", "have", "not", "about", "just",
  "today", "one", "thing", "keep", "let's", "okay",
];

function countMarkers(text: string, markers: readonly string[]): number {
  const lowered = text.toLowerCase();
  let hits = 0;
  for (const marker of markers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}'])${escaped}([^\\p{L}]|$)`, "giu");
    hits += (lowered.match(re) ?? []).length;
  }
  return hits;
}

export type LangVerdict = {
  fr_hits: number;
  en_hits: number;
  accents: number;
  verdict: "fr" | "en" | "mixed" | "unknown";
};

export function languageOf(text: string | null | undefined): LangVerdict {
  const value = String(text ?? "");
  const fr = countMarkers(value, FR_MARKERS);
  const en = countMarkers(value, EN_MARKERS);
  const accents = (value.match(/[àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g) ?? []).length;
  const frScore = fr + accents;
  let verdict: LangVerdict["verdict"] = "unknown";
  if (frScore === 0 && en === 0) verdict = "unknown";
  else if (frScore >= 3 && en >= 3) verdict = "mixed";
  else if (frScore > en) verdict = "fr";
  else if (en > frScore) verdict = "en";
  else verdict = "mixed";
  return { fr_hits: fr, en_hits: en, accents, verdict };
}

