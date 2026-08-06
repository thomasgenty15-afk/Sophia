/**
 * LE BAND DE SÉCURITÉ DU DERNIER TOUR — lu, jamais supposé.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE MODULE EXISTE
 * ---------------------------------------------------------------------------
 * `gateMealPrecisionQuestion` refuse d'agir quand le band de sécurité vaut
 * autre chose que `none`, et `reduceMealPrecisionFlow` SORT d'un flow ouvert
 * pour la même raison. Le chemin PHOTO ne pouvait pas honorer cette règle: il
 * passait `safetyBand: "none"` EN DUR, sous un commentaire qui prétendait
 * pourtant peser « la crise, le fait, et le plafond ».
 *
 * ⚠️ CE QUE CE MODULE NE COUVRE PAS, et il faut le lire avant de s'y fier.
 * Une version antérieure de cet en-tête affirmait que `openMealPrecisionFlow`
 * refusait lui aussi d'agir en crise. C'était FAUX, et mesuré 6/6 le
 * 2026-08-06: `meal-photo-upload-v1` ouvrait le flow sans aucune condition de
 * safety. Le REDUCER sort bien au tour suivant (`reason: "safety"`), donc le
 * dégât était borné — mais une garde décrite et absente est pire qu'une garde
 * absente, parce qu'on cesse de la chercher. L'ouverture est désormais gatée
 * là-bas; ce qui reste NON gaté en crise, et qui relève d'un arbitrage produit,
 * c'est le CRÉDIT écrit sur la ligne photo et la livraison de l'accusé.
 *
 * La campagne QA du 2026-08-05 l'a mesuré 3/3 en run réel: un tour de crise
 * (`__last_turn_risk_band = critical`, `mode = sentry`), puis une photo au tour
 * suivant, et **2 faits durables + 1 coche active** écrits pendant la crise —
 * l'élève recevant une copie enjouée sur le poulet et l'huile un tour après une
 * réponse de crise suicidaire.
 *
 * C'est le motif que ce dépôt paie en boucle, et il porte déjà un nom:
 * « paramètre de garde optionnel = garde désarmée ». Ici il était pire qu'un
 * paramètre oublié — c'était une CONSTANTE, donc une garde qui ne pouvait
 * structurellement jamais mordre.
 *
 * ---------------------------------------------------------------------------
 * L'ÉTAT EXISTE, ET IL EST INTERROGEABLE
 * ---------------------------------------------------------------------------
 * `sophia-brain/router/run.ts` écrit `__last_turn_risk_band` dans
 * `user_chat_states.temp_memory` à chaque tour. Ce module ne fait que le RELIRE.
 * Il n'invente aucun état et n'en écrit aucun.
 *
 * ---------------------------------------------------------------------------
 * DE QUEL CÔTÉ ON SE TROMPE
 * ---------------------------------------------------------------------------
 * Une lecture en panne rend `"none"`, PAS un band élevé. Un repli prudent
 * bloquerait toutes les photos de tous les élèves à la première panne de la
 * table — une garde qui mord toujours est une garde qu'on débranche dans la
 * semaine. Le repli est donc permissif, et il est TRACÉ (`tag`), pour qu'une
 * panne se voie au lieu de se déguiser en calme.
 */

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

export type SafetyBand = "none" | "low" | "medium" | "high" | "critical";

const BANDS: readonly string[] = ["none", "low", "medium", "high", "critical"];

/** Les bands qui interdisent tout effet durable non sollicité. */
const BLOCKING: readonly SafetyBand[] = ["medium", "high", "critical"];

/**
 * Ce band interdit-il d'écrire un fait durable que l'élève n'a pas demandé ?
 *
 * Même seuil que la traîne post-détresse de `run.ts` (`medium`+): un tour
 * chargé ne se referme pas à l'instant où le classifieur redescend.
 */
export function blocksDurableWrite(band: SafetyBand): boolean {
  return BLOCKING.includes(band);
}

/**
 * Le band du DERNIER tour de cet élève, lu dans `user_chat_states`.
 *
 * @returns `"none"` quand rien n'est lisible — voir l'en-tête pour pourquoi le
 *   repli est permissif plutôt que prudent.
 */
export async function readLastTurnSafetyBand(
  db: Db,
  args: { userId: string; scope: string },
): Promise<SafetyBand> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return "none";
  try {
    const { data, error } = await db
      .from("user_chat_states")
      .select("temp_memory")
      .eq("user_id", userId)
      .eq("scope", args.scope)
      .maybeSingle();
    if (error) throw error;
    const temp = data?.temp_memory;
    const raw = temp && typeof temp === "object"
      ? String((temp as Record<string, unknown>).__last_turn_risk_band ?? "")
      : "";
    const band = raw.trim().toLowerCase();
    return (BANDS.includes(band) ? band : "none") as SafetyBand;
  } catch (error) {
    // Tracé, jamais silencieux: une panne de lecture qui se déguise en « pas de
    // crise » est exactement le défaut que ce module corrige.
    console.warn(JSON.stringify({
      tag: "safety_band_unreadable",
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return "none";
  }
}
