// KEEL — LE « + » DE LA BARRE DU BAS, ET CE QU'IL PASSE À LA CONVERSATION.
//
// ══════════════════════════════════════════════════════════════════════════
// POURQUOI UN PASSE-PLAT, ET PAS TROIS ACTIONS DANS LA COQUILLE
// ══════════════════════════════════════════════════════════════════════════
//
// Les trois gestes du « + » — photographier, décrire, se peser — EXISTENT
// DÉJÀ, entiers, dans `/app/chat`: l'aperçu avant envoi et sa légende, le
// créneau choisi avant le champ, le jeton de pesée et sa garde de montage. Les
// réécrire dans `KeelAppShell` ferait une deuxième implémentation de chacun,
// sur un écran que personne ne relit — et c'est celle-là qui garderait
// l'ancienne règle au premier correctif.
//
// La coquille ne fait donc qu'UNE chose: elle ARME l'intention et va sur
// `/app/chat`, qui la consomme. Un seul chemin d'upload, un seul dialogue de
// description, un seul jeton de pesée.
//
// ⚠️ ET C'EST UNE VARIABLE DE MODULE, PAS UN `state` DE ROUTEUR. Le geste
// « photo » porte un `File`: il ne se sérialise ni dans une URL, ni dans
// `history.state`, ni dans `sessionStorage`. Un état de navigation aurait donc
// marché pour deux gestes sur trois — et le troisième aurait eu son propre
// mécanisme, c'est-à-dire deux mécanismes pour un seul geste d'écran.
//
// ⛔ ELLE MEURT AVEC L'ONGLET, ET C'EST VOULU. Une intention qui survivrait à
// un rechargement rouvrirait un dialogue que personne ne vient de demander.

/** Ce que le « + » demande à la conversation d'ouvrir. */
export type QuickAddIntent =
  /** Un fichier déjà choisi. Il n'est PAS validé ici — voir `armQuickAdd`. */
  | { kind: "photo"; file: File }
  /** Un des six moments de la journée, déjà nommé par la personne. */
  | { kind: "describe"; slot: string }
  | { kind: "weight" };

/**
 * COMBIEN DE TEMPS UNE INTENTION RESTE VALABLE, en millisecondes.
 *
 * ⚠️ ELLE EXISTE PARCE QU'UNE INTENTION ARMÉE PEUT NE JAMAIS ÊTRE CONSOMMÉE:
 * la navigation qui suit peut échouer, ou la personne peut revenir en arrière
 * pendant que `/app/chat` charge. Sans péremption, elle attendrait — et le
 * dialogue s'ouvrirait tout seul la prochaine fois qu'on ouvre la
 * conversation, dix minutes plus tard, sans que rien ne l'ait demandé.
 *
 * Le chemin normal se compte en millisecondes (armer, puis naviguer, dans le
 * même gestionnaire de clic): une minute est large, et elle borne la panne.
 */
export const QUICK_ADD_TTL_MS = 60_000;

type Armed = { intent: QuickAddIntent; at: number };

let armed: Armed | null = null;
const listeners = new Set<() => void>();

/**
 * Arme l'intention et prévient qui écoute.
 *
 * ⚠️ LES ÉCOUTEURS NE REÇOIVENT RIEN. Ils sont prévenus, ils appellent
 * `takeQuickAdd()`, et c'est LUI qui décide. Passer l'intention en argument
 * ferait deux chemins de livraison — celui de l'abonnement et celui du
 * montage — donc un geste consommé deux fois le jour où les deux se croisent.
 */
export function armQuickAdd(intent: QuickAddIntent, now: number = Date.now()): void {
  armed = { intent, at: now };
  // Copie: un écouteur qui se désabonne en réagissant modifierait l'ensemble
  // pendant qu'on le parcourt.
  for (const fn of [...listeners]) fn();
}

/**
 * Rend l'intention armée, UNE FOIS, et seulement si elle est encore fraîche.
 *
 * `now` est un paramètre pour que la péremption ait une épreuve à sa taille:
 * la suite front tourne en `node` et ne monte aucun composant.
 */
export function takeQuickAdd(now: number = Date.now()): QuickAddIntent | null {
  const current = armed;
  // Consommée dans tous les cas, y compris périmée: la laisser en place
  // ferait réessayer la même intention morte à chaque montage.
  armed = null;
  if (!current) return null;
  if (now - current.at > QUICK_ADD_TTL_MS) return null;
  return current.intent;
}

/** `true` s'il y a une intention fraîche à prendre. Ne consomme rien. */
export function hasQuickAdd(now: number = Date.now()): boolean {
  return armed !== null && now - armed.at <= QUICK_ADD_TTL_MS;
}

/** S'abonne aux armements. Rend la fonction de désabonnement. */
export function subscribeQuickAdd(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
