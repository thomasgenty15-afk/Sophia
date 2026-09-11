import { supabase } from "../../lib/supabase";

// FF-063 LOT 1 — LA SORTIE DES E-MAILS DE CYCLE DE VIE, CÔTÉ CLIENT.
//
// Le module d'API de `/unsubscribe`. Même forme que
// `previewHouseholdInvitation` dans `api/household.ts`: la page rend des
// écrans, ce fichier décide lequel. La décision vit ici parce qu'elle a quatre
// cas dont trois se ressemblent, et qu'un `if` dans un composant React ne se
// teste pas dans l'environnement `node` de vitest.

/**
 * Les quatre sorties. Vocabulaire FERMÉ: chaque valeur a un écran écrit, dans
 * les deux langues. Un cinquième cas qui arriverait ici sans copie produirait
 * un écran blanc sur la page où la personne est la moins patiente.
 */
export type UnsubscribeOutcome =
  /** L'URL n'a pas de `token`. Quelqu'un est arrivé là à la main. */
  | "no_token"
  /** Le jeton ne désigne personne: inconnu, mal formé, ou compte supprimé. */
  | "unknown"
  /** C'est coupé. */
  | "done"
  /** On n'a pas joint le serveur. */
  | "unreachable";

/**
 * La forme d'un uuid, vérifiée AVANT l'appel.
 *
 * `p_token` est typé `uuid` côté base: un jeton mal formé fait échouer le cast
 * et rend un 400 PostgREST — indistinguable, côté client, d'un serveur en
 * panne. On refuse donc la forme ici, où on sait ce que ça veut dire, plutôt
 * que d'aller demander à la base de nous le dire mal.
 */
const TOKEN_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ce qu'on peut décider SANS parler au serveur.
 *
 * Rend `null` quand il faut appeler — et `null` veut bien dire « je ne sais pas
 * encore », jamais « rien à faire ».
 */
export function outcomeBeforeCall(
  token: string | null | undefined,
): UnsubscribeOutcome | null {
  const raw = String(token ?? "").trim();
  if (!raw) return "no_token";
  if (!TOKEN_SHAPE.test(raw)) return "unknown";
  return null;
}

/**
 * Ce que rend la RPC, traduit en écran.
 *
 * ⚠️ LA DISTINCTION QUI COMPTE EST `unknown` CONTRE `unreachable`. Dire « ton
 * lien est invalide » à quelqu'un dont le réseau est tombé lui apprend qu'il
 * NE PEUT PAS se désinscrire — et c'est précisément le message qui produit un
 * clic sur « spam », c'est-à-dire le coût que toute cette page existe pour
 * éviter. Une erreur de transport n'est donc jamais un refus.
 *
 * `data !== true` couvre `false` (jeton inconnu) et toute forme inattendue: la
 * fonction est déclarée `returns boolean`, et une réponse qui n'en est pas un
 * ne prouve pas que la coupure a eu lieu.
 */
export function outcomeFromRpc(data: unknown, error: unknown): UnsubscribeOutcome {
  if (error) return "unreachable";
  return data === true ? "done" : "unknown";
}

/**
 * Coupe les e-mails de cycle de vie du compte que désigne ce jeton.
 *
 * Appelée SANS session: `supabase.rpc` envoie alors la clé anon, qui est
 * exactement ce que `keel_lifecycle_unsubscribe` attend. La RPC rend un
 * booléen et rien d'autre — ni prénom, ni adresse, ni motif de refus.
 */
export async function unsubscribeFromLifecycleEmails(
  token: string | null | undefined,
): Promise<UnsubscribeOutcome> {
  const early = outcomeBeforeCall(token);
  if (early) return early;
  try {
    const { data, error } = await supabase.rpc("keel_lifecycle_unsubscribe", {
      p_token: String(token).trim(),
    });
    return outcomeFromRpc(data, error);
  } catch {
    // Un `throw` ici est un transport qui tombe, jamais un refus métier: la
    // RPC ne lève pas, elle rend `false`.
    return "unreachable";
  }
}
