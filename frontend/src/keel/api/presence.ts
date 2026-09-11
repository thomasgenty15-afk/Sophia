import { supabase } from "../../lib/supabase";

// FF-063 LOT 1 — LE SEUL TÉMOIN DE LECTURE DU PRODUIT.
//
// ── LE TROU QUE CE MODULE BOUCHE ─────────────────────────────────────────
// Vérifié le 2026-09-09: aucune colonne du dépôt n'enregistrait qu'une
// personne avait ouvert l'app. Toutes les traces existantes sont des
// ÉCRITURES — une case de cuisson, une case de courses, un message, une pesée.
// Or le geste le plus fréquent du produit est une LECTURE: ouvrir son plan le
// matin pour savoir quoi cuisiner. Il ne laissait rien.
//
// ── CE QUE ÇA NE DOIT PAS DEVENIR ────────────────────────────────────────
// ⛔ `last_seen_at` n'est PAS le déclencheur des relances. Celui-là reste la
// fin de couverture (`student_generated_meals.ends_on`): quelqu'un qui a
// composé sept jours et ne revient qu'au septième n'est pas absent, il est
// COUVERT, et lui écrire « on ne te voit plus » au jour trois serait punir le
// comportement nominal. Ce témoin ne sert qu'à retenir un envoi, jamais à en
// déclencher un.
// ⛔ Ce n'est pas un journal. Une ligne par ouverture d'onglet ne serait lue
// par personne et coûterait une écriture par montage de l'app.

const TOUCH_KEY = "sophia.last_seen_touch";

/** Le jour local, en `YYYY-MM-DD`. Le fuseau du navigateur suffit: la garde
 * ci-dessous n'a pas besoin d'être exacte, seulement d'être stable. */
function localDay(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * `localStorage` jette dans une fenêtre privée, dans une capture de vignette,
 * et chez qui bloque les données de site. Une présence qui ferait planter le
 * démarrage de l'app serait un très mauvais échange — on lit et on écrit sous
 * `try`, et on considère l'absence de valeur comme « jamais touché ».
 */
function readTouchedDay(): string | null {
  try {
    return globalThis.localStorage?.getItem(TOUCH_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeTouchedDay(day: string): void {
  try {
    globalThis.localStorage?.setItem(TOUCH_KEY, day);
  } catch {
    // Sans mémoire locale, on écrira une fois par montage. C'est le pire cas,
    // et il reste borné: une ligne mise à jour, jamais insérée.
  }
}

/**
 * Pose `profiles.last_seen_at = now()` sur le compte de l'appelant, au plus
 * une fois par jour et par navigateur.
 *
 * Sans attente et sans erreur remontée: l'appelant est le démarrage de l'app,
 * et rien de ce qu'il affiche ne dépend du résultat. Un échec (réseau, session
 * expirée, RPC absente sur une base pas encore migrée) laisse simplement le
 * témoin à sa valeur précédente — et « jamais mesuré » est un état prévu.
 *
 * Le jour est écrit AVANT l'appel: en cas d'échec on ne réessaie pas dans la
 * même journée. Réessayer à chaque montage transformerait une base en panne en
 * une rafale d'appels, ce qui est exactement le mauvais moment pour insister.
 */
export function touchLastSeen(): void {
  const today = localDay(new Date());
  if (readTouchedDay() === today) return;
  writeTouchedDay(today);
  void supabase.rpc("keel_touch_last_seen").then(
    () => {},
    () => {},
  );
}

/** Utilisé par les tests et par la déconnexion: le prochain montage retouche. */
export function forgetLastSeenTouch(): void {
  try {
    globalThis.localStorage?.removeItem(TOUCH_KEY);
  } catch {
    // Rien à faire: l'absence de mémoire locale est déjà l'état voulu.
  }
}
