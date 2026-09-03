import { KNOWN_BLOCKS, type KnownBlock } from "./retainedItems";

/**
 * LE BOUTON « VOIR » — un jeton LOCAL, qui n'atteint jamais le serveur.
 *
 * ── POURQUOI UN JETON, ET PAS UN LIEN ─────────────────────────────────────
 * Une bulle de chat rend son contenu en texte brut: pas de markdown, pas de
 * `<a>`. Le seul contrôle qu'une bulle porte est un BOUTON, et un bouton part
 * au serveur. Ce jeton-ci est donc intercepté par `ChatPage` avant l'envoi —
 * il ouvre un écran, il ne demande rien.
 *
 * ⛔ ET IL EST QUAND MÊME ENREGISTRÉ CÔTÉ SERVEUR (`NAVIGATION_BUTTON_PREFIX`
 * dans `DETERMINISTIC_BUTTON_PREFIXES`), sans lecteur. Le front normal ne
 * l'enverra jamais; une charge FORGÉE, elle, arriverait — et sans cet
 * enregistrement elle retomberait au dispatcher, où un modèle répondrait à une
 * chaîne de protocole.
 *
 * ── POURQUOI « VOIR » ET PAS « ANNULER » ──────────────────────────────────
 * Un « Annuler » dans le chat serait un SECOND endroit qui écrit dans la
 * mémoire, avec ses propres cas: annuler quoi, si la ligne a été éditée
 * entre-temps depuis un autre onglet ? La carte sait déjà modifier et enlever,
 * et elle gère la concurrence par un témoin. Le chat DIT, l'écran FAIT.
 */
const PREFIX = "KEEL_VIEW_ABOUT_YOU|";

/**
 * Le bloc de la carte que ce jeton ouvre, ou `null` si ce n'en est pas un.
 *
 * ⚠️ ANCRÉ ET À VOCABULAIRE FERMÉ. `startsWith` seul accepterait
 * `KEEL_VIEW_ABOUT_YOUR_MOTHER`, et un bloc libre finirait dans une URL sans
 * que rien ne le relise. Les deux moitiés comptent: sans l'ancrage, un jeton
 * voisin est avalé; sans la liste, le paramètre d'URL devient du texte
 * arbitraire venu d'un message.
 */
export function readMemoryViewToken(
  payload: string | null | undefined,
): KnownBlock | null {
  const raw = String(payload ?? "").trim();
  if (!raw.startsWith(PREFIX)) return null;
  const block = raw.slice(PREFIX.length);
  return (KNOWN_BLOCKS as readonly string[]).includes(block)
    ? block as KnownBlock
    : null;
}

/**
 * CETTE BULLE ARME-T-ELLE UNE QUESTION ? — miroir EXACT de `armsQuestion`
 * (`supabase/functions/_shared/chat/disarmed_tap.ts`).
 *
 * ⛔ LES DEUX CÔTÉS DOIVENT DIRE LA MÊME CHOSE, et l'écart se paierait en un
 * bouton visible qu'un tap refuserait. Le serveur s'en sert pour juger la
 * fraîcheur d'un tap; le front, pour décider quels boutons afficher — et le
 * front n'en montre que sur la DERNIÈRE bulle armée.
 *
 * Sans cette règle, la bulle « J'ai noté pour Tom : … · Voir » compterait comme
 * armée: elle cacherait son propre bouton dès qu'une question suivrait, et
 * désarmerait la question qui la précède.
 */
export function armsQuestion(
  buttons: ReadonlyArray<{ readonly payload?: unknown }> | null | undefined,
): boolean {
  if (!Array.isArray(buttons) || buttons.length === 0) return false;
  return buttons.some((b) => {
    const payload = String(b?.payload ?? "").trim();
    return payload !== "" && !payload.startsWith("KEEL_VIEW_");
  });
}

/** Une bulle dont TOUS les boutons naviguent — elle montre les siens quand même. */
export function isNavigationOnly(
  buttons: ReadonlyArray<{ readonly payload?: unknown }> | null | undefined,
): boolean {
  return Array.isArray(buttons) && buttons.length > 0 && !armsQuestion(buttons);
}

/** L'adresse que « Voir » ouvre. `at` sert à surligner la ligne du jour. */
export function memoryViewHref(block: KnownBlock, at: string): string {
  const params = new URLSearchParams({ focus: block });
  if (at) params.set("at", at);
  return `/app/about-you?${params.toString()}`;
}
