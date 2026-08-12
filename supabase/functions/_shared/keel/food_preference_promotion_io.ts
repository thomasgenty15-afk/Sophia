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
 * L'ÉCRITURE, ET LES DEUX DÉFAUTS QUE L6 AVAIT FAIT CHANGER D'ÉCHELLE
 * ═══════════════════════════════════════════════════════════════════════════
 * Aucun des deux n'est né avec L6 (D4). Ce que L6 a changé, c'est le NOMBRE de
 * lignes concernées: cette fonction était appelée pour UNE personne — celle qui
 * compose, sur sa propre ligne — et `household_voices_io.ts` l'appelle
 * maintenant pour CHAQUE titulaire à table. On est passé de « le maître écrit
 * sur sa propre ligne » à « le maître écrit sur celle de tout le monde ».
 *
 *   1. ✅ CORRIGÉ PAR C3 (migration `20260812210000`). L'écriture passe par
 *      `keel_write_food_preferences`: `jsonb_set` sur les DEUX seules clés que
 *      ce module possède, et la copie lue (`p_expected`) comparée à la valeur
 *      live DANS LE PRÉDICAT de l'`update`. Le rythme de repas ou la capacité
 *      de cuisine qu'un titulaire enregistre pendant qu'un autre compose
 *      survivent désormais PAR CONSTRUCTION — la colonne entière n'est plus
 *      jamais réécrite à partir d'une copie. Une course sur la MÊME clé rend
 *      `stale_snapshot`, et on ne réessaie pas: réessayer serait décider que
 *      notre copie gagne.
 *
 *   2. ⚖️ TRANCHÉ, NON « CORRIGÉ », ET C'EST DÉLIBÉRÉ.
 *      `student_goals.updated_at` du titulaire bouge toujours quand quelqu'un
 *      d'autre compose. Le trigger `student_goals_set_updated_at` est
 *      inconditionnel et sa fonction (`tg_set_updated_at`) est PARTAGÉE par
 *      plusieurs tables: la contourner demanderait soit de la rendre
 *      conditionnelle pour tout le monde, soit un `session_replication_role`
 *      qui désarmerait en silence tout trigger futur sur cette table.
 *
 *      Et ce n'est pas seulement le coût qui décide. La réconciliation n'écrit
 *      QUE si le contenu change vraiment (`result.changed`), donc `updated_at`
 *      dit une vérité sur LA LIGNE — « ce qui est déclaré ici a changé ». Ce
 *      qu'il ne dit pas, c'est « cette personne a agi »: ce sont deux questions
 *      différentes, et son nom pose la première.
 *
 *      VÉRIFIÉ LE 2026-08-12, ET LA NUANCE COMPTE: aucun lecteur ne
 *      l'INTERPRÈTE — ni fonction edge, ni écran, ni SQL, ni `order by`. Le
 *      seul consommateur est l'export RGPD, qui la DUMPE telle quelle
 *      (allowlist `studentGoals` de `account-export-v1`), et un dump ne se
 *      trompe pas de personne: il rend l'octet de la ligne. Le jour où un
 *      lecteur l'INTERPRÈTE, la réponse est de lui faire lire le GESTE, pas de
 *      faire mentir l'horodatage d'une ligne.
 *
 * Consigné aussi dans `docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md`,
 * §C3 ②.
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
  /**
   * C3 ② — L'ÉCRITURE PASSE PAR UNE RPC, et plus par `.update()`. Déclarée ici
   * plutôt que dans le corps: le compilateur a listé les appelants, et un
   * client qui ne saurait pas l'appeler ne compile plus.
   */
  rpc: (name: string, params: Record<string, unknown>) => Promise<
    { data: unknown; error: { message: string } | null }
  >;
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

    // ── C3 ② · L'ÉCRITURE CIBLÉE, SOUS CONCURRENCE OPTIMISTE ───────────────
    //
    // CE QUE ÇA REMPLACE, MOT POUR MOT:
    //
    //     .update({ practical_constraints: result.constraints })
    //     .eq("user_id", args.userId)
    //
    // c'est-à-dire la colonne ENTIÈRE, reconstruite à partir d'une copie lue
    // ~10 ms plus tôt dans la requête de QUELQU'UN D'AUTRE. Depuis L6, le
    // maître déclenche ce chemin pour chaque titulaire à sa table: le rythme de
    // repas qu'un secondaire venait d'enregistrer disparaissait sans un mot.
    //
    // LES DEUX MOITIÉS VIVENT EN BASE (`20260812210000`), et pas ici:
    //   ① `jsonb_set` sur les DEUX seules clés que ce module possède — tout le
    //      reste de la colonne est celui de la ligne VIVANTE;
    //   ② la comparaison de `p_expected` à la valeur live est dans le PRÉDICAT
    //      de l'`update`. « Une lecture-puis-écriture n'est pas une garde »:
    //      ce dépôt l'a payé sur `keel_validate_meal_plan` puis sur le plafond
    //      de fusions, et la rustine « relire juste avant d'écrire » ne ferme
    //      pas la fenêtre, elle la rétrécit.
    //
    // ⚠️ `p_expected` EST LA VALEUR TELLE QU'ON L'A LUE, pas celle qu'on écrit.
    // Passer `result.constraints[...]` ferait un prédicat toujours faux, donc
    // une fonction qui n'écrit plus jamais — et rien ne tomberait.
    const { data: writeData, error: writeError } = await args.admin.rpc(
      "keel_write_food_preferences",
      {
        p_user: args.userId,
        p_expected: constraints[FOOD_PREFERENCES_KEY] ?? null,
        p_preferences: result.constraints[FOOD_PREFERENCES_KEY] ?? [],
        p_origins: result.constraints[FOOD_PREFERENCES_ORIGIN_KEY] ?? {},
      },
    );
    if (writeError) throw new Error(writeError.message);
    const written = (writeData ?? {}) as { ok?: boolean; reason?: string };
    if (written.ok !== true) {
      // QUELQU'UN A ÉCRIT ENTRE-TEMPS SUR LA MÊME CLÉ. On ne réessaie pas —
      // réessayer, c'est décider que notre copie gagne, et c'est précisément la
      // décision qu'on refuse de prendre à la place du titulaire. La correction
      // est PERSISTANTE par nature (le memorizer a démenti, il démentira encore
      // à la prochaine composition), donc la perdre une fois ne perd rien.
      console.warn(JSON.stringify({
        tag: "keel/food_preferences",
        event: "reconcile_not_written",
        source: args.source,
        user_id: args.userId,
        reason: written.reason ?? "unknown",
        dropped: result.dropped,
      }));
      // On rend quand même la version corrigée: elle sert LE PROMPT DE CE
      // RUN-CI, et une préférence rétractée n'a pas à être servie au modèle
      // sous prétexte qu'une course a empêché de l'effacer en base.
      return result.constraints;
    }

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
