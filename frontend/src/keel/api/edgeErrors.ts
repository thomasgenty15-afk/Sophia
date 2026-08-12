/**
 * LE CORPS D'UNE RÉPONSE NON-2XX D'UNE FONCTION EDGE — un seul lecteur.
 *
 * ── POURQUOI CE MODULE EXISTE ─────────────────────────────────────────────
 * `supabase.functions.invoke` NE REND PAS le corps d'une réponse non-2xx:
 * `error.message` vaut « Edge Function returned a non-2xx status code », et
 * c'est tout. Un refus soigneusement nommé côté serveur arriverait donc à
 * l'écran comme une panne de bibliothèque.
 *
 * Ce dépôt en avait DEUX lecteurs — `namedEdgeRefusal` (api/household.ts) et
 * `readInvokeError` (api/mealGeneration.ts) — écrits séparément, et ils avaient
 * divergé exactement là où le commentaire de l'un promettait qu'ils ne le
 * feraient pas. Ils partagent maintenant celui-ci; ils gardent chacun leur
 * FORME de retour, parce que leurs appelants ne lisent pas la même chose.
 *
 * ── LE 401 QUI N'A PAS LA FORME DES AUTRES ────────────────────────────────
 * Mesuré en HTTP réel: sans en-tête `Authorization`, la porte rend
 * `{"error":"Unauthorized"}` — un jeton nommé, comme les refus produit. Mais
 * avec un `Authorization` porteur d'un jeton que la porte n'accepte pas — le
 * cas BANAL de la session périmée — elle rend un corps SANS clé `error`, et
 * tout ce qui suit retombait sur la phrase générique de supabase-js.
 *
 * ⚠️ ON NE LIT PAS LA PROSE DU CORPS, ON LIT LE STATUT. Deux raisons, et
 * chacune a déjà coûté à ce dépôt:
 *
 *   1. Un matcher maison sur du texte serveur est une dette (« laitue » vs
 *      « lait »): la phrase change de version en version, elle n'est pas
 *      traduite, et la garde tomberait sans bruit.
 *   2. Surtout: ce dépôt a une doctrine sur le 401 local — un « Invalid JWT »
 *      en développement vient de l'ALGORITHME DE SIGNATURE de la pile, jamais
 *      de l'écran (docs/keel/JWT-HS256.md). Recopier cette phrase à l'écran
 *      enverrait l'utilisateur ET le prochain développeur sur cette fausse
 *      piste. On rend donc le jeton `Unauthorized`, déjà traduit par
 *      `copy/planRefusals.ts` en une phrase qui parle de la SESSION.
 *
 * Le statut 401 est le seul repli. Un 500 sans jeton nommé reste `null`: c'est
 * une panne, et lui donner un nom de refus produit serait mentir.
 */

/**
 * ⚠️ LE JETON DU PORTAIL, ET IL EST DÉJÀ DANS `EDGE_REFUSAL_KEYS`. On ne crée
 * pas un mot neuf pour le 401 sans corps: la table des refus est FERMÉE, et
 * deux jetons pour un seul fait feraient deux phrases pour une seule session
 * perdue. La bijection du test l'aurait d'ailleurs refusé — aucune fonction
 * edge ne rend un jeton qui n'existerait qu'ici.
 */
export const EDGE_GATE_UNAUTHORIZED = "Unauthorized";

export interface EdgeRefusal {
  /** Le motif NOMMÉ, jamais vide. Traduit par `copy/planRefusals.ts`. */
  token: string;
  /** La précision libre du serveur, quand il en met une. */
  detail: string | null;
}

/**
 * Le refus nommé d'une réponse non-2xx, ou `null` quand il n'y a rien à lire.
 *
 * ⚠️ LE CORPS NE SE LIT QU'UNE FOIS (`Response.json()` consomme le flux). D'où
 * une seule fonction qui rend les deux champs, plutôt que deux lecteurs dont le
 * second rendrait toujours `null`.
 */
export async function readEdgeRefusal(error: unknown): Promise<EdgeRefusal | null> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (!ctx || typeof (ctx as Response).json !== "function") return null;
  const status = Number((ctx as Response).status ?? 0);
  try {
    const body = await (ctx as Response).json();
    const record = (body ?? {}) as Record<string, unknown>;
    const token = String(record.error ?? "").trim();
    if (token) {
      const detail = String(record.detail ?? "").trim();
      return { token, detail: detail || null };
    }
    // Le 401 de la session périmée: un corps qui ne porte AUCUN jeton produit.
    return status === 401 ? { token: EDGE_GATE_UNAUTHORIZED, detail: null } : null;
  } catch {
    // Un corps illisible ne dit rien de plus qu'un statut. Le 401 reste un 401.
    return status === 401 ? { token: EDGE_GATE_UNAUTHORIZED, detail: null } : null;
  }
}
