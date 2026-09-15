/**
 * LE CORPS D'UN MESSAGE DE COHORTE — décision pure.
 *
 * Tout ce que ce module décide tient en une question: **à quoi ressemble, dans
 * le fil de l'élève, une phrase que son coach a écrite ?**
 *
 * ── L'ATTRIBUTION EST LA FONCTIONNALITÉ ──────────────────────────────────
 * Un message non signé ne vaut rien ici. Le produit entier existe pour que
 * l'élève entende SON coach; un texte anonyme dans le fil se lit comme une
 * notification de plus, et c'est exactement le contraire de l'effet cherché.
 *
 * Même règle que la substitution du verrou (`keel_output_locks.ts`), et même
 * garde: **pas de nom, pas de signature**. Un coach sans `display_name` ne se
 * signe pas — « — the coach » attirerait l'œil sur une absence.
 *
 * ── POURQUOI LA SIGNATURE EST EN SUFFIXE ─────────────────────────────────
 * Le coach écrit à ses élèves à la deuxième personne. Préfixer « Marlow dit : »
 * en ferait une citation rapportée et mettrait un narrateur entre les deux.
 * En suffixe, l'élève lit le message, puis découvre de qui il est.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ─────────────────────────────────────────
 * Il ne vérifie RIEN contre la doctrine ni contre les contraintes médicales, et
 * ce n'est pas un oubli: le texte est écrit par le coach lui-même, à la main.
 * Les verrous existent pour ce qu'un MODÈLE produit en son nom. Les lui
 * appliquer reviendrait à lui interdire de contredire sa propre méthode dans un
 * message qu'il signe — c'est sa cohorte, c'est sa parole.
 *
 * PUR: pas d'I/O, pas d'horloge, pas de hasard.
 */

/** Le plafond, en caractères. ⚠️ COPIE DE CONFORT: l'autorité est la CHECK
 *  `coach_broadcasts_body_length` (migration 20260806180500). Sert à tronquer
 *  défensivement à la LECTURE — une ligne écrite avant un futur abaissement du
 *  plafond ne doit pas gonfler un message — et à rien d'autre. */
export const COACH_BROADCAST_MAX_CHARS = 1000;

/**
 * Nettoie un corps brut. Trois choses, et aucune n'est de la censure: le coach
 * écrit ce qu'il veut à sa cohorte.
 *
 *   1. `trim`, pour qu'un corps de blancs compte comme vide;
 *   2. plafond dur;
 *   3. les lignes qui ressemblent à une signature (`— …` en dernière ligne) sont
 *      laissées TELLES QUELLES. On ne les retire pas: un coach qui signe déjà à
 *      sa façon a raison, et `renderCoachBroadcast` n'ajoute la sienne que si
 *      elle manque — sinon l'élève lirait deux signatures.
 */
export function sanitizeBroadcastBody(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw : "";
  const bounded = text.slice(0, COACH_BROADCAST_MAX_CHARS).trim();
  return bounded.length > 0 ? bounded : null;
}

/**
 * Le texte exact que l'élève reçoit dans son fil.
 *
 * `null` quand il n'y a pas de corps: l'appelant ne livre alors rien, plutôt que
 * de poster une signature seule.
 */
export function renderCoachBroadcast(
  body: unknown,
  coachDisplayName?: string | null,
): string | null {
  const clean = sanitizeBroadcastBody(body);
  if (!clean) return null;

  const name = String(coachDisplayName ?? "").trim();
  if (!name) return clean;

  // DÉJÀ SIGNÉ: on n'en ajoute pas une seconde. On ne regarde que la DERNIÈRE
  // ligne — un tiret cadratin au milieu d'une phrase est de la ponctuation, pas
  // une signature, et le confondre couperait le message d'un coach qui écrit
  // « trois repas — pas six ».
  const lines = clean.split("\n");
  const last = String(lines[lines.length - 1] ?? "").trim();
  if (/^[—–-]\s*\S/.test(last)) return clean;

  return `${clean}\n\n— ${name}`;
}
