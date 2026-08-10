// KEEL — les langues d'INTERFACE, et l'étendue exacte de chacune.
//
// ── CE QUI EST TRADUIT, ET CE QUI NE L'EST PAS ─────────────────────────────
// La VITRINE parle deux langues. L'app authentifiée est en anglais.
//
// Ce n'est pas un compromis honteux, c'est une frontière qu'on déclare au lieu
// de la subir. L'alternative tentante — un `fr` partiel avec repli anglais —
// produit un écran français avec une phrase anglaise au milieu, découvert par
// un client et non par un test. R7 est explicite là-dessus: un mapping de jeton
// échoue bruyamment, il ne dégrade pas en silence.
//
// D'où la forme ci-dessous: le sous-ensemble public est dérivé DU TYPE, et le
// pack français est COMPLET sur ce sous-ensemble. TypeScript refuse une clé
// publique manquante; il ne peut donc pas exister d'écran vitrine à moitié
// traduit. Quand une page quitte la vitrine ou y entre, on déplace son
// namespace ici et le compilateur dit exactement ce qui manque.

import { en } from "./en";
import type { MessageKey } from "./t";

/** Les langues d'interface livrées. Ajouter une langue = ajouter son pack. */
export type UiLocale = "en" | "fr";

export const DEFAULT_UI_LOCALE: UiLocale = "en";

/**
 * Les namespaces de la VITRINE — les surfaces qu'un visiteur non connecté voit.
 *
 * `legal` n'y est PAS: `Legal.tsx` ne passe par aucun `t()` aujourd'hui (zéro
 * clé dans le seed), c'est une extraction à part. Sa version française
 * d'origine est récupérable dans git (commit `0328448a`), donc ce sera de la
 * récupération et non de la traduction — mais pas ici.
 */
export const PUBLIC_NAMESPACES = [
  "landing",
  "public",
  "brand",
  "auth",
] as const;

/**
 * Les namespaces publics PAS ENCORE traduits, et donc pas encore dans la liste.
 *
 * `gyms` (135 clés), `communities` (143), `join` (65), `start` (50),
 * `invite` (21). Ils sont entièrement passés par `t()` — c'est de la traduction
 * pure, zéro refacto — mais tant qu'ils ne sont pas écrits, les inscrire
 * ci-dessus casserait la compilation, ce qui est exactement le comportement
 * voulu: la liste ne grandit qu'avec le pack.
 *
 * Conséquence assumée: `/gyms` et `/communities` restent en anglais quand la
 * vitrine est en français. C'est une frontière VISIBLE et déclarée, pas un
 * repli silencieux au milieu d'une page.
 */
export const PUBLIC_NAMESPACES_PENDING_TRANSLATION = [
  "gyms",
  "communities",
  "start",
  "join",
  "invite",
  // `/join-household` (chantier foyer, lot 6). PUBLIQUE comme `/join`: la
  // personne qui ouvre le lien de réclamation n'a le plus souvent aucun compte.
  //
  // ⚠️ NAMESPACE À PART, ET PAS `household.*`. Les clés de `/app/household`
  // vivent dans le produit connecté, qui est ANGLAIS PAR CHOIX et n'attend
  // aucune traduction. Ranger cette page sous `household` déclarerait une dette
  // de traduction pour tout l'écran du foyer — c'est-à-dire une dette qu'on
  // croirait avoir, ce que la liste ci-dessus existe précisément pour éviter.
  "household_claim",
] as const;

export type PublicNamespace = typeof PUBLIC_NAMESPACES[number];

/**
 * Les clés de la vitrine, DÉRIVÉES du seed anglais.
 *
 * Un type littéral de gabarit plutôt qu'une liste tenue à la main: une clé
 * ajoutée à `en.ts` sous un namespace public entre ici toute seule, et le pack
 * français cesse de compiler tant qu'elle n'est pas traduite. Une liste
 * manuelle aurait exactement le défaut inverse — elle vieillit en silence.
 */
export type PublicMessageKey = Extract<
  MessageKey,
  `${PublicNamespace}.${string}`
>;

/** Un pack de vitrine est COMPLET sur son périmètre, ou il ne compile pas. */
export type PublicMessages = Record<PublicMessageKey, string>;

/**
 * Les clés publiques présentes dans le seed, à l'exécution.
 *
 * Le type ci-dessus est effacé à la compilation; `t()` a besoin de savoir, à
 * l'exécution, si une clé donnée relève de la vitrine. Dérivé du seed par le
 * même préfixe, donc les deux ne peuvent pas diverger.
 */
export const PUBLIC_MESSAGE_KEYS: ReadonlySet<string> = new Set(
  Object.keys(en).filter((key) =>
    PUBLIC_NAMESPACES.some((ns) => key.startsWith(`${ns}.`))
  ),
);

export function isPublicMessageKey(key: string): key is PublicMessageKey {
  return PUBLIC_MESSAGE_KEYS.has(key);
}

/**
 * Normalise une valeur de langue quelconque vers une locale d'interface livrée.
 *
 * Tolérant par nature — l'entrée vient d'une URL, d'un `localStorage` ou d'un
 * `navigator.languages`, trois sources qu'on ne contrôle pas. Ce n'est PAS une
 * violation de R7: R7 porte sur les mappings de JETONS, où une valeur inconnue
 * est un bug; ici une valeur inconnue est un visiteur avec un navigateur
 * espagnol, et le défaut anglais est la bonne réponse.
 */
export function parseUiLocale(raw: string | null | undefined): UiLocale {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value.startsWith("fr")) return "fr";
  return DEFAULT_UI_LOCALE;
}

/**
 * Compose la valeur à écrire dans `profiles.locale` — en ne changeant QUE le
 * sous-tag de langue, jamais la région.
 *
 * ⚠️ CETTE FONCTION TOUCHE UN CHEMIN DE SÉCURITÉ. Côté serveur,
 * `crisis_resources.ts` dérive le PAYS du sous-tag région de la locale quand
 * `profiles.country` est NULL. Écrire « fr-FR » pour un coach britannique
 * changerait le numéro d'urgence servi à ses élèves — c'est l'incident mesuré
 * qui a motivé la migration `20260804180000` (un élève britannique s'est vu
 * servir le 3114 avec `fallbackUsed: false`).
 *
 * En ne bougeant que la langue, `fr-GB` reste britannique: le résolveur de
 * crise répond exactement la même chose qu'avant le clic.
 */
export function composeProfileLocale(
  next: UiLocale,
  currentProfileLocale: string | null | undefined,
): string {
  const current = String(currentProfileLocale ?? "").trim();
  const region = /^[a-z]{2}-([A-Z]{2})$/.exec(current)?.[1];
  const base = next === "fr" ? "fr" : "en";
  if (region) return `${base}-${region}`;
  // Sans région connue, on ne l'invente pas: le défaut de chaque langue.
  return next === "fr" ? "fr-FR" : "en-US";
}
