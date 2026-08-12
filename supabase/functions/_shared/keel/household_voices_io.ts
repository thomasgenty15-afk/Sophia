/**
 * CE QUE CHAQUE TITULAIRE A DIT — D4, la moitié I/O.
 *
 * Le module PUR (`household_voices.ts`) décide ce qui entre dans le prompt et
 * ce qui est coupé. Celui-ci ne fait qu'une chose: aller chercher, POUR CHAQUE
 * BOUCHE QUI A UN COMPTE, ce que le pont mémoire → générateurs a déjà produit
 * pour elle.
 *
 * ---------------------------------------------------------------------------
 * CE QU'IL NE FAIT PAS, ET C'EST LE PLUS IMPORTANT
 * ---------------------------------------------------------------------------
 * Il ne lit pas `memory_items`. Il ne construit pas un second pont. Il appelle
 * `reconcileFoodPreferencesFor` — la fonction qui est paramétrée PAR
 * UTILISATEUR depuis le premier jour, et que cette lane n'appelait que pour le
 * maître. Tout le reste (le « Keep » obligatoire de l'élève, les cinq clés de
 * domaine, la vue datée, la réconciliation des rétractations) est acquis et
 * n'est pas rejoué ici.
 *
 * ---------------------------------------------------------------------------
 * C4 — ON LIT LA LIGNE D'UN TIERS, ON NE L'ÉCRIT PAS
 * ---------------------------------------------------------------------------
 * Ce chargeur CORRIGE les préférences de chaque titulaire pour la composition
 * en cours, et il n'en PERSISTE aucune: `actor: "someone_else"`. La règle est
 * qu'on ne réécrit jamais ce que quelqu'un a renseigné pendant qu'il ne fait
 * rien — il ne pourrait pas se l'attribuer. La correction sera écrite à SA
 * prochaine génération, sur son geste. Détail et arbitrage:
 * `food_preference_promotion_io.ts`, bloc « C4 ».
 *
 * ---------------------------------------------------------------------------
 * CHAQUE LECTURE EST SCOPÉE EXPLICITEMENT
 * ---------------------------------------------------------------------------
 * On lit ici la ligne `student_goals` DE QUELQU'UN D'AUTRE QUE L'APPELANT, sous
 * `service_role` — donc sans RLS. « RLS ne remplace pas un `.eq(user_id)` » est
 * une cicatrice de ce dépôt: une ligne d'élève a déjà été rendue à son coach par
 * un lecteur qui comptait sur la policy. Le `.in("user_id", …)` ci-dessous porte
 * EXACTEMENT les comptes du roster de CE foyer, résolus par
 * `keel_household_roster_for`, et rien d'autre ne peut y entrer.
 *
 * ---------------------------------------------------------------------------
 * ÉCHOUER NE COÛTE JAMAIS UN DÎNER
 * ---------------------------------------------------------------------------
 * Une lecture en panne rend « pas de ligne pour ce membre », journalisée. C'est
 * la posture de `food_preference_promotion_io.ts` mot pour mot, et c'est
 * l'inverse de celle des allergies (`safety_constraints.ts`, qui THROW): on
 * parle ici de goûts. Un foyer dont la mémoire est illisible compose quand
 * même — il compose comme avant ce lot.
 */

import { foodPreferencesForPrompt } from "./food_preference_promotion.ts";
import { reconcileFoodPreferencesFor } from "./food_preference_promotion_io.ts";
import type { RawMemberVoice } from "./household_voices.ts";

/**
 * Le strict minimum de client Supabase dont ce module a besoin.
 *
 * ⚠️ `rpc` VIENT DE C3 ②: ce module ne l'appelle pas lui-même, mais il passe
 * son client à `reconcileFoodPreferencesFor`, dont l'écriture est désormais une
 * RPC ciblée (`keel_write_food_preferences`). Le compilateur a listé les
 * appelants; le déclarer ici plutôt que d'élargir en `any` garde la garde.
 */
type MinimalClient = {
  from: (table: string) => any;
  rpc: (name: string, params: Record<string, unknown>) => Promise<
    { data: unknown; error: { message: string } | null }
  >;
};

export interface VoiceMember {
  /** L'identité de la BOUCHE — c'est elle que la trace nomme. */
  memberId: string;
  /** Le compte. Une bouche sans compte n'entre jamais dans cette liste (D3). */
  userId: string;
  displayName: string;
  /**
   * Les contraintes pratiques DÉJÀ chargées ET DÉJÀ réconciliées, quand
   * l'appelant les a en main — c'est le cas du maître, dont la ligne est lue
   * bien plus haut pour le rythme de repas et la capacité de cuisine. `null` =
   * à charger et à réconcilier ici.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais `T?`. Optionnel, il aurait fait
   * silencieusement relire et re-réconcilier la ligne du maître à chaque
   * génération — un aller-retour de plus vers `memory_items` et une écriture
   * possible, pour un résultat identique. Le compilateur liste les appelants.
   */
  constraints: Record<string, unknown> | null;
}

export interface LoadedVoices {
  voices: RawMemberVoice[];
  /** Le nombre de lignes `student_goals` réellement lues. Pour le coût. */
  reads: number;
  /** Les comptes dont la ligne n'a pas pu être lue. Tracé, jamais silencieux. */
  issues: string[];
}

/**
 * Les préférences durables de chaque titulaire, prêtes pour le module pur.
 *
 * @param source pour la trace de `reconcileFoodPreferencesFor`.
 */
export async function loadHouseholdVoices(
  admin: MinimalClient,
  args: {
    members: readonly VoiceMember[];
    source: string;
  },
): Promise<LoadedVoices> {
  const issues: string[] = [];
  const voices: RawMemberVoice[] = [];
  const members = args.members.filter((m) =>
    String(m?.userId ?? "").trim().length > 0
  );
  if (members.length === 0) return { voices, reads: 0, issues };

  // ── UNE SEULE REQUÊTE POUR TOUTES LES LIGNES À CHARGER ──────────────────
  // N lectures séparées auraient coûté N allers-retours pour une donnée dont la
  // clé est la même colonne. Le maître n'y est pas: sa ligne est déjà en main.
  const toLoad = members.filter((m) => m.constraints === null).map((m) => m.userId);
  const byUser = new Map<string, Record<string, unknown>>();
  let reads = 0;
  if (toLoad.length > 0) {
    try {
      const { data, error } = await admin
        .from("student_goals")
        .select("user_id, practical_constraints")
        .in("user_id", toLoad);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const id = String(row.user_id ?? "").trim();
        if (!id) continue;
        reads += 1;
        byUser.set(
          id,
          (row.practical_constraints ?? {}) as Record<string, unknown>,
        );
      }
    } catch (error) {
      // FAIL-OPEN NOMMÉ. Le foyer compose, avec les seules voix qu'on a — au
      // pire celle du maître, c'est-à-dire l'état d'avant ce lot.
      console.warn(JSON.stringify({
        tag: "keel/household_voices",
        event: "goals_unreadable",
        source: args.source,
        accounts: toLoad.length,
        error: error instanceof Error ? error.message : String(error),
      }));
      issues.push(`voice_goals_unreadable:${toLoad.length}`);
    }
  }

  for (const member of members) {
    // Une bouche dont le compte n'a AUCUNE ligne `student_goals` n'est pas un
    // échec: elle n'a simplement rien confirmé. Elle n'apporte pas de voix, et
    // elle ne laisse pas d'`issue` — sans quoi le cas nominal d'un secondaire
    // tout neuf ressemblerait à une panne.
    const preloaded = member.constraints;
    const loaded = preloaded ?? byUser.get(member.userId) ?? null;
    if (loaded === null) continue;

    // LA RÉCONCILIATION, PAR TITULAIRE. Une préférence que CE membre a
    // rétractée dans SA conversation ne part pas au modèle: la correction est
    // calculée ici, à chaque composition. C'est une correction, jamais un ajout
    // — rien de ce que le maître fait ici n'écrit une préférence sur le compte
    // d'un autre.
    //
    // ⚠️ C4 · `actor: "someone_else"`, ET C'EST LE SUJET DE CE LOT. La personne
    // dont on lit la ligne ICI n'a rien demandé: c'est le maître qui compose.
    // Écrire sa colonne sous prétexte qu'on l'a lue, c'est effacer sans elle un
    // état qu'elle a renseigné, et elle ne peut pas se l'attribuer — « ce truc
    // fait n'importe quoi », sans une phrase pour l'expliquer. La correction
    // vaut donc pour CE prompt, et sa persistance attend SA prochaine
    // génération. Ce qui est perdu, c'est une date, pas une assiette.
    //
    // POURQUOI LA CONSTANTE ICI PLUTÔT QU'UN PARAMÈTRE DE PLUS: le composeur
    // n'atteint JAMAIS cette ligne. Sa ligne à lui arrive `preloaded` (déjà
    // réconciliée ET écrite bien plus haut, sur SON geste), donc le `??`
    // court-circuite. Tout `userId` qui passe par ce `await` est, par
    // construction, quelqu'un d'autre que l'appelant. Un futur appelant qui
    // oublierait de précharger le composeur perdrait une écriture, jamais une
    // correction — la direction sûre.
    const constraints = preloaded ?? await reconcileFoodPreferencesFor({
      admin,
      userId: member.userId,
      constraints: loaded,
      source: args.source,
      actor: "someone_else",
    });

    const lines = foodPreferencesForPrompt(constraints);
    if (lines.length === 0) continue;
    voices.push({
      memberId: member.memberId,
      displayName: member.displayName,
      lines,
    });
  }

  return { voices, reads, issues };
}
