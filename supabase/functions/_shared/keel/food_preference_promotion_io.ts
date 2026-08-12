/**
 * LA RÉCONCILIATION, BRANCHÉE — au point où les préférences servent vraiment.
 *
 * ── POURQUOI CÔTÉ SERVEUR, ET PAS SEULEMENT DANS LA CARTE ─────────────────
 * La carte (`FoodPreferencesCard`) réconcilie aussi, et c'est nécessaire: il
 * faut que l'élève VOIE le remplacement et puisse le refuser. Mais ce n'est
 * pas suffisant, et la nuance décide de tout: un élève qui revient sur ce
 * qu'il a dit le fait DANS LA CONVERSATION, et rien ne l'oblige à rouvrir
 * `/app/plan` ensuite. Si la réconciliation ne vivait que dans l'écran, le
 * générateur continuerait de recevoir la préférence démentie aussi longtemps
 * que l'élève ne rouvre pas la carte — c'est-à-dire, pour la plupart des
 * élèves, indéfiniment.
 *
 * C'est la forme habituelle du dépôt: la règle vit au point de passage, pas
 * dans l'écran qui la montre.
 *
 * ── ELLE PERSISTE, ELLE NE FILTRE PAS ─────────────────────────────────────
 * Le plus court aurait été de retirer les lignes démenties À LA VOLÉE, juste
 * avant de construire le prompt. Ça aurait donné un prompt correct et laissé
 * en base un fait faux — que la carte affiche, que l'export RGPD rend, et que
 * le prochain lecteur (`generate-meal-v1`, une synthèse coach) relit
 * naïvement. On écrit donc la correction, une fois, et tout le monde en
 * profite.
 *
 * ── CE QU'ELLE NE FAIT JAMAIS ─────────────────────────────────────────────
 * Échouer bruyamment. Une réconciliation impossible (mémoire illisible, écriture
 * refusée) ne doit pas empêcher un élève de composer sa semaine: on garde les
 * contraintes telles quelles et on journalise. C'est l'inverse de la posture
 * des contraintes médicales (`safety_constraints.ts`, qui THROW), et c'est
 * délibéré — on parle ici de goûts, pas d'allergies.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ DEUX DÉFAUTS CONNUS, NON CORRIGÉS ICI, QUE L6 A FAIT CHANGER D'ÉCHELLE
 * ═══════════════════════════════════════════════════════════════════════════
 * Aucun des deux n'est né avec L6 (D4). Ce que L6 change, c'est le NOMBRE de
 * lignes concernées: cette fonction était appelée pour UNE personne — celle qui
 * compose, sur sa propre ligne — et `household_voices_io.ts` l'appelle
 * maintenant pour CHAQUE titulaire à table. On passe de « le maître écrit sur
 * sa propre ligne » à « le maître écrit sur celle de tout le monde ».
 *
 *   1. ÉCRASEMENT DE `practical_constraints` EN ENTIER, SANS CONCURRENCE
 *      OPTIMISTE. L'`update` ci-dessous (« LE POINT 1 » en marge) écrit la
 *      colonne COMPLÈTE, reconstruite à partir d'une copie lue ~10 ms plus tôt
 *      dans la requête de quelqu'un d'AUTRE. Si le titulaire concerné modifie
 *      son rythme de repas, sa capacité de cuisine ou ses préférences dans cet
 *      intervalle, sa modification est perdue sans un mot — il n'y a ni
 *      `updated_at` comparé, ni numéro de version, ni écriture par clé jsonb.
 *      À un titulaire, la fenêtre était celle d'une personne contre elle-même;
 *      à N, c'est celle de N personnes contre le geste d'une seule.
 *
 *   2. `student_goals.updated_at` DU SECONDAIRE BOUGE QUAND LE MAÎTRE COMPOSE.
 *      Personne n'a touché à la ligne de ce titulaire; un lecteur qui prend
 *      cette colonne pour « la dernière fois que cette personne s'est occupée
 *      de son alimentation » se trompe désormais de personne.
 *
 * ⚠️ NE PAS « RÉPARER » ÇA EN PASSANT. La correction demande une MIGRATION —
 * un jeton de version sur la ligne, ou une écriture ciblée sur la seule clé
 * `food_preferences` — et un lot à part. La rustine tentante (relire juste
 * avant d'écrire) ne ferme pas la fenêtre, elle la rétrécit, et elle ferait
 * passer une garde inexistante pour une garde qui marche.
 *
 * Consigné aussi dans `docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md`,
 * §L6 « Ce qui n'est pas prouvé, et ce qui reste ouvert ».
 */
import {
  FOOD_PREFERENCES_KEY,
  FOOD_PREFERENCES_ORIGIN_KEY,
  ignorableTokens,
  type MemoryItemForPromotion,
  originIdsOf,
  reconcileFoodPreferences,
} from "./food_preference_promotion.ts";

/** Le strict minimum de client Supabase dont ce module a besoin. */
type MinimalClient = {
  from: (table: string) => any;
};

/**
 * Réconcilie `practical_constraints` avec l'état courant de la mémoire, et
 * persiste si quelque chose a changé.
 *
 * @returns les contraintes À UTILISER — réconciliées si possible, celles
 *          reçues sinon.
 */
export async function reconcileFoodPreferencesFor(args: {
  admin: MinimalClient;
  userId: string;
  constraints: Record<string, unknown> | null | undefined;
  /** Pour la trace: le nom de la fonction appelante. */
  source: string;
}): Promise<Record<string, unknown>> {
  const constraints = (args.constraints ?? {}) as Record<string, unknown>;
  const kept = Array.isArray(constraints[FOOD_PREFERENCES_KEY])
    ? (constraints[FOOD_PREFERENCES_KEY] as unknown[])
    : [];
  const origin = constraints[FOOD_PREFERENCES_ORIGIN_KEY];
  // Rien de gardé, ou rien qui porte une origine: il n'y a rien à réconcilier,
  // et on s'épargne une lecture de `memory_items` à chaque génération.
  if (kept.length === 0 || !origin || typeof origin !== "object") return constraints;

  // `originIdsOf` et PAS `Object.values(...).map(String)`: la valeur d'une
  // entrée est un objet `{item, at}` (et une chaîne nue dans les jsonb écrits
  // par la première version). Le raccourci rendait `"[object Object]"`, que
  // Postgres refusait — `invalid input syntax for type uuid`. Le filet de ce
  // module a tenu (la génération a continué, la ligne a été journalisée), et
  // c'est le run réel qui a montré la faute: la lecture de cette table n'a
  // qu'un seul propriétaire, et c'est le module pur.
  const ids = originIdsOf(constraints);
  if (ids.length === 0) return constraints;

  const COLUMNS =
    "id, kind, status, content_text, normalized_summary, superseded_by_item_id";

  try {
    const { data, error } = await args.admin
      .from("memory_items")
      .select(COLUMNS)
      .eq("user_id", args.userId)
      .in("id", ids);
    if (error) throw new Error(error.message);
    const sources = (data ?? []) as MemoryItemForPromotion[];

    // LES REMPLAÇANTS AUSSI, et c'est la condition de la ceinture qui l'exige:
    // `reconcileFoodPreferences` ne retire sur `superseded` que si le texte du
    // remplaçant parle de la même chose. Ne charger que les sources
    // désarmerait ce contrôle en le laissant écrit — il retomberait sur sa
    // branche « remplaçant non chargé » et ne retirerait plus jamais rien.
    const replacementIds = [
      ...new Set(
        sources
          .map((s) => String(s.superseded_by_item_id ?? "").trim())
          .filter((id) => id && !ids.includes(id)),
      ),
    ];
    let replacements: MemoryItemForPromotion[] = [];
    if (replacementIds.length > 0) {
      const { data: repl, error: replError } = await args.admin
        .from("memory_items")
        .select(COLUMNS)
        .eq("user_id", args.userId)
        .in("id", replacementIds);
      if (replError) throw new Error(replError.message);
      replacements = (repl ?? []) as MemoryItemForPromotion[];
    }

    // LE PRÉNOM DE L'ÉLÈVE, et ce n'est pas un détail cosmétique: le memorizer
    // préfixe ses résumés du prénom (« Theo déteste le brocoli. »), donc toutes
    // ses paires partagent au moins ce mot-là. Sans lui, le test de
    // plausibilité déclarait liées deux phrases sans aucun rapport — vert, et
    // mort. Un échec de lecture n'empêche rien: on réconcilie sans, ce qui
    // rend le contrôle plus permissif, jamais plus destructeur.
    const { data: profile } = await args.admin
      .from("profiles")
      .select("full_name")
      .eq("id", args.userId)
      .maybeSingle();
    const ignoreTokens = ignorableTokens(
      (profile as { full_name?: string | null } | null)?.full_name ?? null,
    );

    const result = reconcileFoodPreferences({
      constraints,
      items: [...sources, ...replacements],
      ignoreTokens,
    });
    if (result.keptDespiteSupersession.length > 0) {
      // Une supersession que le memorizer affirme et que le texte ne soutient
      // pas. Ça ne casse rien ici, et c'est exactement pour ça qu'il faut que
      // ça laisse une trace: sans elle, un memorizer qui fusionne mal est
      // invisible.
      console.warn(JSON.stringify({
        tag: "keel/food_preferences",
        event: "supersession_not_plausible",
        source: args.source,
        user_id: args.userId,
        kept: result.keptDespiteSupersession,
      }));
    }
    if (!result.changed) return constraints;

    // ⚠️ LE POINT 1 DE L'EN-TÊTE. Cet `update` écrase `practical_constraints`
    // EN ENTIER, à partir de `constraints` — une copie lue plus haut dans la
    // requête, qui n'est pas forcément celle de l'appelant depuis L6. Aucune
    // concurrence optimiste: pas d'`updated_at` comparé, pas de version, pas
    // d'écriture par clé jsonb. Et `updated_at` de CE titulaire bouge alors que
    // c'est quelqu'un d'autre qui compose. Défauts connus, documentés en tête
    // de fichier et au registre; leur correction demande une migration.
    const { error: writeError } = await args.admin
      .from("student_goals")
      .update({ practical_constraints: result.constraints })
      .eq("user_id", args.userId);
    if (writeError) throw new Error(writeError.message);

    console.info(JSON.stringify({
      tag: "keel/food_preferences",
      event: "reconciled",
      source: args.source,
      user_id: args.userId,
      dropped: result.dropped,
    }));
    return result.constraints;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel/food_preferences",
      event: "reconcile_failed",
      source: args.source,
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return constraints;
  }
}
