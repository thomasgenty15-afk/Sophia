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
 * ── ELLE PERSISTE **QUAND C'EST LA PERSONNE QUI AGIT** ────────────────────
 * Le plus court aurait été de retirer les lignes démenties À LA VOLÉE, juste
 * avant de construire le prompt. Ça aurait donné un prompt correct et laissé
 * en base un fait faux — que la carte affiche, que l'export RGPD rend, et que
 * le prochain lecteur (`generate-meal-v1`, une synthèse coach) relit
 * naïvement. On écrit donc la correction, une fois, et tout le monde en
 * profite.
 *
 * ⚠️ DEPUIS C4, CE « ON ÉCRIT » A UNE CONDITION, ET ELLE EST DANS LA SIGNATURE
 * (`actor`). Voir le bloc ci-dessous: la correction s'applique TOUJOURS à la
 * composition en cours, et elle ne se PERSISTE que sur la ligne de la personne
 * qui a déclenché le run.
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
 *   2. ✅ FERMÉ PAR C4 — ET PAS EN FAISANT MENTIR L'HORODATAGE.
 *      C3 avait tranché de garder l'écriture sur la ligne d'un tiers, en
 *      constatant que `student_goals.updated_at` bougeait sans que la personne
 *      ait rien fait, et en jugeant le contournement du trigger plus cher que
 *      le défaut. La règle qui décide a changé de niveau: ON NE RÉÉCRIT JAMAIS
 *      CE QUE QUELQU'UN A RENSEIGNÉ. Une frustration sur un état qu'on a laissé
 *      tel quel se lit « j'ai oublié de le retirer »; la même frustration sur
 *      un état effacé tout seul se lit « ce truc fait n'importe quoi », et rien
 *      dans le produit ne peut la lui expliquer — elle n'a rien fait.
 *
 *      Donc: ON N'ÉCRIT PLUS DU TOUT SUR LA LIGNE D'UN TIERS. Le trigger reste
 *      inconditionnel et partagé, `tg_set_updated_at` n'est pas touchée, et il
 *      n'y a plus rien à préserver: la ligne d'un secondaire n'est plus écrite
 *      pendant que le maître compose, donc son `updated_at` ne bouge pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * C4 — CE QUE `actor` DÉCIDE, ET CE QU'IL NE DÉCIDE PAS
 * ═══════════════════════════════════════════════════════════════════════════
 * IL NE DÉCIDE PAS LA COMPOSITION. La réconciliation est calculée pour tout le
 * monde, à chaque fois, et c'est elle qui alimente le prompt: une préférence
 * qu'un secondaire a rétractée dans SA conversation n'est jamais servie au
 * modèle, même quand c'est le maître qui compose. Le plan reste juste TOUT DE
 * SUITE.
 *
 * IL DÉCIDE LA PERSISTANCE, et rien d'autre. La correction n'est écrite que sur
 * la ligne de la personne qui a déclenché le run. Pour les autres, le
 * rattrapage en base se fera à LEUR prochaine génération — c'est-à-dire de leur
 * fait. Le coût est borné et connu: la composition est déjà correcte, seule la
 * DATE de la persistance se décale.
 *
 * ⚠️ `actor` EST REQUIS, JAMAIS OPTIONNEL. Ce dépôt a payé plusieurs fois
 * « paramètre de garde optionnel = garde désarmée » (`safetyBand` jamais
 * passé): un défaut à `"row_owner"` aurait laissé passer, sans un mot, tout
 * futur appelant qui compose pour quelqu'un d'autre — et ce chemin-là existe
 * déjà (L6). Le compilateur liste les appelants; chacun DIT ce qu'il est.
 *
 * ⚠️ CE PARAMÈTRE NOMME UN FAIT, PAS UNE POLITIQUE. « Qui a déclenché ce run,
 * par rapport à la ligne qu'on corrige » est une chose que l'appelant SAIT;
 * « faut-il écrire » est une chose qu'il devrait deviner. Si la règle change un
 * jour (par exemple: écrire aussi pour un tiers, avec une trace visible par la
 * personne), elle change ICI, et aucun appelant ne bouge.
 *
 * Consigné aussi dans `docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md`,
 * §C3 ② et §C4.
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
 * QUI A DÉCLENCHÉ CE RUN, par rapport à la ligne qu'on réconcilie.
 *
 * · `"row_owner"` — la personne compose SON plan, sur SA ligne. La correction
 *   est appliquée ET écrite: c'est son geste qui la produit, et elle peut se
 *   l'attribuer. C'est le cas des trois générateurs, sur la ligne du compte
 *   authentifié.
 * · `"someone_else"` — quelqu'un d'autre compose (depuis L6/D4: le maître du
 *   foyer, pour chaque titulaire à table). La correction est appliquée à la
 *   composition en cours et N'EST PAS ÉCRITE. On ne réécrit pas ce qu'une
 *   personne a renseigné pendant qu'elle ne fait rien.
 */
export type FoodPreferenceActor = "row_owner" | "someone_else";

/**
 * C6 ② — L'ÉCRITURE, PRÊTE MAIS PAS FAITE.
 *
 * ⚠️ MESURÉ EN HTTP RÉEL LE 2026-08-12: une ligne `student_goals` a été
 * corrigée à `17:30:59` par un appel de `generate-meal-v1` qui a rendu
 * **`400 window_beyond_this_week`**. La personne a bien agi — ce n'est PAS une
 * violation de C4, c'est sa propre ligne, `actor: "row_owner"` est juste — mais
 * sa ligne bouge, et son `updated_at` avec, sur une requête qu'elle voit comme
 * ÉCHOUÉE. Rien à l'écran ne le lui dit.
 *
 * ── POURQUOI UN OBJET, ET PAS UN DÉPLACEMENT DE L'APPEL ───────────────────
 * L'ordre actuel garde DEUX propriétés qu'on ne veut pas perdre: la
 * réconciliation alimente `constraintsForPrompt` (donc elle doit précéder la
 * construction du prompt), et les gardes de fenêtre tombent volontairement
 * JUSTE AVANT LE MODÈLE (C2: « ce qui est décidable sans le modèle se refuse
 * avant le modèle », 28,6 s et 225 s brûlées pour l'avoir oublié). Déplacer
 * l'appel casserait l'une ou l'autre.
 *
 * On sépare donc CALCULER de PERSISTER — la même opération que C4 a faite pour
 * la ligne d'un tiers, prise par l'autre bout: là, l'écriture ne devait jamais
 * avoir lieu; ici, elle doit avoir lieu PLUS TARD.
 *
 * ⚠️ `null` VEUT DIRE « RIEN À ÉCRIRE », ET C'EST TROIS CHOSES: rien n'a changé,
 * la ligne n'est pas celle de l'appelant (C4), ou la lecture a échoué. Aucune
 * n'est un incident, et aucune ne demande à l'appelant de savoir laquelle.
 */
export interface PendingFoodPreferenceWrite {
  admin: MinimalClient;
  userId: string;
  source: string;
  /** La valeur telle qu'on l'a LUE — le témoin de concurrence de C3 ②. */
  expected: unknown;
  preferences: unknown;
  origins: unknown;
  dropped: Array<{ text: string; memoryItemId: string; status: string }>;
}

/** Ce que la réconciliation rend: de quoi composer, et de quoi écrire plus tard. */
export interface ReconciledFoodPreferences {
  /** Les contraintes À UTILISER — réconciliées si possible, reçues sinon. */
  constraints: Record<string, unknown>;
  /**
   * L'écriture en attente, ou `null`. À passer à
   * `persistReconciledFoodPreferences` UNE FOIS QUE LA REQUÊTE A ABOUTI.
   */
  pending: PendingFoodPreferenceWrite | null;
}

/**
 * Réconcilie `practical_constraints` avec l'état courant de la mémoire, et
 * PRÉPARE l'écriture si quelque chose a changé **et** si c'est la personne
 * elle-même qui a déclenché le run (`actor`).
 *
 * ⚠️ ELLE N'ÉCRIT PLUS RIEN (C6 ②). L'appelant doit passer `pending` à
 * `persistReconciledFoodPreferences` après avoir écrit son plan — voir le bloc
 * de `PendingFoodPreferenceWrite`.
 */
export async function reconcileFoodPreferencesFor(args: {
  admin: MinimalClient;
  userId: string;
  constraints: Record<string, unknown> | null | undefined;
  /** Pour la trace: le nom de la fonction appelante. */
  source: string;
  /**
   * ⚠️ C4 — REQUIS, JAMAIS `actor?`. Voir le bloc de tête: optionnel, il aurait
   * fait écrire par défaut sur la ligne d'un tiers, c'est-à-dire exactement le
   * défaut qu'il existe pour fermer, et sans que rien ne tombe.
   */
  actor: FoodPreferenceActor;
}): Promise<ReconciledFoodPreferences> {
  const constraints = (args.constraints ?? {}) as Record<string, unknown>;
  const kept = Array.isArray(constraints[FOOD_PREFERENCES_KEY])
    ? (constraints[FOOD_PREFERENCES_KEY] as unknown[])
    : [];
  const origin = constraints[FOOD_PREFERENCES_ORIGIN_KEY];
  // Rien de gardé, ou rien qui porte une origine: il n'y a rien à réconcilier,
  // et on s'épargne une lecture de `memory_items` à chaque génération.
  if (kept.length === 0 || !origin || typeof origin !== "object") {
    return { constraints, pending: null };
  }

  // `originIdsOf` et PAS `Object.values(...).map(String)`: la valeur d'une
  // entrée est un objet `{item, at}` (et une chaîne nue dans les jsonb écrits
  // par la première version). Le raccourci rendait `"[object Object]"`, que
  // Postgres refusait — `invalid input syntax for type uuid`. Le filet de ce
  // module a tenu (la génération a continué, la ligne a été journalisée), et
  // c'est le run réel qui a montré la faute: la lecture de cette table n'a
  // qu'un seul propriétaire, et c'est le module pur.
  const ids = originIdsOf(constraints);
  if (ids.length === 0) return { constraints, pending: null };

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
    if (!result.changed) return { constraints, pending: null };

    // ── C4 · LA CORRECTION S'APPLIQUE, ELLE NE SE PERSISTE PAS ─────────────
    //
    // On sort AVANT l'écriture, et on rend quand même `result.constraints`: la
    // composition en cours est corrigée pour tout le monde — c'est tout
    // l'intérêt de L6 — et la ligne de la personne n'est pas touchée.
    //
    // ⚠️ CE N'EST PAS UN ÉCHEC, ET LE LOG NE DOIT PAS LE FAIRE CROIRE. C'est le
    // cas NOMINAL de la lane foyer: à chaque composition du maître, autant de
    // passages ici que de titulaires ayant rétracté quelque chose. En `warn`,
    // il ferait ressembler le fonctionnement normal à une panne — le contraire
    // exact de `reconcile_not_written`, qui, lui, nomme une course perdue.
    //
    // CE QUE ÇA COÛTE, ET C'EST BORNÉ: la correction sera écrite à la PROCHAINE
    // génération de cette personne, par son propre geste. Seule la DATE de la
    // persistance se décale; aucun prompt n'est faux entre-temps, puisque
    // chaque lecture rejoue la réconciliation.
    if (args.actor !== "row_owner") {
      console.info(JSON.stringify({
        tag: "keel/food_preferences",
        event: "reconciled_not_persisted",
        source: args.source,
        user_id: args.userId,
        dropped: result.dropped,
      }));
      return { constraints: result.constraints, pending: null };
    }

    // ── C3 ② · L'ÉCRITURE CIBLÉE, SOUS CONCURRENCE OPTIMISTE ───────────────
    //
    // CE QUE ÇA REMPLACE, MOT POUR MOT:
    //
    //     .update({ practical_constraints: result.constraints })
    //     .eq("user_id", args.userId)
    //
    // c'est-à-dire la colonne ENTIÈRE, reconstruite à partir d'une copie lue
    // ~10 ms plus tôt dans la requête de QUELQU'UN D'AUTRE. Depuis L6, le
    // maître déclenchait ce chemin pour chaque titulaire à sa table: le rythme
    // de repas qu'un secondaire venait d'enregistrer disparaissait sans un mot.
    //
    // ⚠️ DEPUIS C4, PLUS PERSONNE N'ARRIVE ICI POUR LA LIGNE D'UN AUTRE (le
    // `return` juste au-dessus). CE BLOC RESTE, ET IL DOIT RESTER: une même
    // ligne `student_goals` a plusieurs écrivains légitimes — la carte des
    // préférences, le rythme de repas, la capacité de cuisine — et deux d'entre
    // eux peuvent être la MÊME personne dans deux onglets. La garde de C3 ne
    // protégeait pas seulement du maître; la retirer parce que le maître est
    // parti rouvrirait l'écrasement de colonne pour tous les autres.
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
    //
    // ⚠️ C6 ② — ON PRÉPARE, ON N'ÉCRIT PAS. Le témoin de concurrence est figé
    // ICI, à la valeur LUE, et il voyage avec l'écriture: la reporter après le
    // plan ne l'affaiblit pas, elle l'ALLONGE — et c'est exactement ce que la
    // concurrence optimiste de C3 ② existe pour couvrir. Une course perdue rend
    // `stale_snapshot`, se journalise, et ne réessaie pas.
    return {
      constraints: result.constraints,
      pending: {
        admin: args.admin,
        userId: args.userId,
        source: args.source,
        expected: constraints[FOOD_PREFERENCES_KEY] ?? null,
        preferences: result.constraints[FOOD_PREFERENCES_KEY] ?? [],
        origins: result.constraints[FOOD_PREFERENCES_ORIGIN_KEY] ?? {},
        dropped: result.dropped,
      },
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel/food_preferences",
      event: "reconcile_failed",
      source: args.source,
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { constraints, pending: null };
  }
}

/**
 * C6 ② — L'ÉCRITURE, UNE FOIS QUE LA REQUÊTE A ABOUTI.
 *
 * ⚠️ À APPELER APRÈS L'ÉCRITURE DU PLAN, ET NULLE PART AILLEURS. C'est tout
 * l'objet du lot: une ligne `student_goals` corrigée à `17:30:59` par un appel
 * qui a rendu `400 window_beyond_this_week` est une ligne qui bouge sur une
 * requête que l'utilisateur voit comme échouée, sans qu'aucun écran ne le lui
 * dise.
 *
 * ⚠️ `null` NE FAIT RIEN, ET NE JOURNALISE RIEN. Trois cas y arrivent — rien
 * n'a changé, la ligne est celle d'un tiers (C4), la lecture a échoué — et
 * chacun a déjà laissé la trace qui lui revient, ou aucune parce qu'il n'y a
 * rien à dire. Une ligne de journal ici ferait parler le cas nominal.
 *
 * ⚠️ ELLE N'ÉCHOUE JAMAIS VERS L'APPELANT. Le plan est déjà écrit et servi;
 * personne ne perd son dîner parce qu'une correction de goût n'a pas pu
 * atterrir. Même posture que le reste de ce module — « on parle ici de goûts,
 * pas d'allergies ».
 */
export async function persistReconciledFoodPreferences(
  pending: PendingFoodPreferenceWrite | null,
): Promise<void> {
  if (pending === null) return;
  try {
    const { data: writeData, error: writeError } = await pending.admin.rpc(
      "keel_write_food_preferences",
      {
        p_user: pending.userId,
        p_expected: pending.expected,
        p_preferences: pending.preferences,
        p_origins: pending.origins,
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
        source: pending.source,
        user_id: pending.userId,
        reason: written.reason ?? "unknown",
        dropped: pending.dropped,
      }));
      return;
    }

    console.info(JSON.stringify({
      tag: "keel/food_preferences",
      event: "reconciled",
      source: pending.source,
      user_id: pending.userId,
      dropped: pending.dropped,
    }));
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel/food_preferences",
      event: "reconcile_failed",
      source: pending.source,
      user_id: pending.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
