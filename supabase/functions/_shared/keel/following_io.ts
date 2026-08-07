/**
 * « CET ÉLÈVE SUIT-IL QUELQUE CHOSE ? » — une seule définition, deux gardes.
 *
 * ── LE DÉFAUT QUE CE MODULE RÉPARE ───────────────────────────────────────
 * `keel-daily-pulse-v1` et `keel-weekly-flow-v1` portent la même garde, écrite
 * deux fois, et elle disait: un `plan_versions` publié (chemin 1:1) OU un
 * `student_week_plans` en `'adopted'`.
 *
 * Le commit `99697610` a retiré la semaine de méthode de `/app/plan` et l'a
 * remplacée par le constructeur de repas, avec une raison écrite: « ce n'est pas
 * ce que l'élève vient chercher », et « la doctrine du coach était affichée,
 * elle doit servir à composer les repas, pas être montrée ». Décision produit
 * assumée.
 *
 * Mais les deux gardes n'ont pas suivi. Depuis, en 1:N:
 *   - aucun coach ne publie de `plan_versions` (c'est la règle du modèle);
 *   - plus rien n'écrit `student_week_plans.status = 'adopted'`.
 *
 * DONC LES DEUX CONDITIONS ÉTAIENT DEVENUES IMPOSSIBLES, et le tap du soir
 * comme le point du dimanche ne pouvaient plus partir pour personne. Pas de
 * `student_daily_checkins`, donc « comment la semaine a été vécue » vide sur la
 * page du lundi — c'est-à-dire sur l'artefact que le coach paie pour lire.
 *
 * Le silence était total: aucune erreur, aucun log, deux crons qui tournaient
 * proprement en écartant tout le monde.
 *
 * ── CE QUE LA GARDE DOIT DIRE, ET POURQUOI ELLE RESTE ─────────────────────
 * « Rien à suivre, rien à demander. » Elle ne disparaît pas: envoyer « comment
 * s'est passée ta journée ? » tous les soirs à quelqu'un qui ne suit rien est
 * exactement le harcèlement que ce produit refuse. On corrige ce qu'elle
 * REGARDE, pas son existence.
 *
 * ── LES TROIS SOURCES, ET POURQUOI TOUTES LES TROIS ───────────────────────
 *   1. `student_generated_meals` — LA surface vivante du 1:N. C'est ce que
 *      l'élève compose réellement aujourd'hui.
 *   2. `student_week_plans` en `'adopted'` — GARDÉE. Le jour où une surface
 *      d'adoption revient, cette garde marche déjà; et une ligne adoptée
 *      existante ne doit pas cesser de compter parce qu'on a élargi.
 *   3. `plan_versions` publié — le chemin 1:1, gardé exprès (voir CLAUDE.md).
 *
 * Additif, jamais substitutif: élargir une garde ne doit retirer l'accès à
 * personne.
 *
 * ── LA FENÊTRE DE FRAÎCHEUR N'EST PAS INVENTÉE ICI ────────────────────────
 * Un repas composé il y a trois mois ne veut pas dire qu'on suit quelque chose
 * aujourd'hui. Il faut donc une borne — et le produit en a DÉJÀ une:
 * `/app/today` lit la dernière composition avec `notBefore: weekStart`, c'est-
 * à-dire « créée depuis le lundi de cette semaine ». On réutilise cette
 * définition au lieu d'en écrire une seconde, parce que deux définitions de
 * « courant » divergent au premier ajustement et que personne ne sait alors
 * laquelle ment.
 *
 * ⚠️ La comparaison se fait sur `created_at >= <date locale>`, donc à quelques
 * heures près sur la frontière du lundi selon le fuseau. C'est assumé: la
 * question posée est « cette personne suit-elle quelque chose », pas « à quelle
 * seconde ». Les deux crons appelants tolèrent déjà cette imprécision — ils
 * s'exécutent sur des fenêtres de deux à trois heures.
 */

/**
 * Structural type: les tests injectent un faux, la prod un SupabaseClient.
 *
 * Il décrit EXACTEMENT les deux chaînes appelées plus bas — `.eq().gte().limit()`
 * et `.eq().eq().limit()` — et rien de plus. Un type qui rendrait `any` après
 * le premier maillon laisserait passer une faute de frappe sur `.gte` jusqu'à
 * l'exécution, c'est-à-dire jusqu'à une cohorte entière privée de son tap.
 */
type FollowingQuery = PromiseLike<{ data: unknown; error: unknown }>;

interface FollowingFiltered {
  eq(column: string, value: string): FollowingFiltered;
  gte(column: string, value: string): FollowingFiltered;
  /** `retired_at is null`: un plan explicitement remplacé ne suit plus rien. */
  is(column: string, value: null): FollowingFiltered;
  limit(n: number): FollowingQuery;
}

export interface FollowingDb {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): FollowingFiltered };
  };
}

/** D'où vient le « oui ». Tracé pour la même raison que `DOCTRINE_LOAD_REASONS`:
 *  « il compose des repas » et « il a un plan 1:1 » ne se ressemblent pas, et on
 *  veut pouvoir lire dans les logs laquelle des trois surfaces porte la cohorte. */
export type FollowingSource =
  | "generated_meals"
  /**
   * LE FOYER. Une composition écrite par le compte maître pour son foyer
   * appartient à SON `user_id`; les autres membres n'ont donc AUCUNE ligne à
   * leur nom, et sans cette source ils seraient tous écartés du tap du soir —
   * c'est-à-dire très exactement le défaut que ce module a été écrit pour
   * réparer, reproduit sur une surface neuve.
   */
  | "household_meals"
  | "adopted_week_plan"
  | "published_plan_version"
  | "none";

export interface FollowingVerdict {
  following: boolean;
  source: FollowingSource;
}

const NOT_FOLLOWING: FollowingVerdict = { following: false, source: "none" };

/**
 * @param weekStart date locale (YYYY-MM-DD) du lundi de la semaine de l'élève.
 *        Fournie par l'appelant, qui connaît déjà son fuseau — ce module ne lit
 *        aucune horloge.
 *
 * ORDRE DES LECTURES: la surface la plus probable d'abord. En 1:N la quasi-
 * totalité des élèves répondent sur la première, et les deux autres ne partent
 * alors jamais.
 *
 * NE THROW PAS sur une lecture vide, THROW sur une lecture CASSÉE: « il ne suit
 * rien » et « je n'ai pas pu lire » sont deux phrases différentes, et rendre la
 * première pour la seconde retirerait silencieusement le tap du soir à toute
 * une cohorte le jour d'une panne. Même arbitrage que `loadWeekPlan`.
 */
export async function resolveStudentFollowing(
  db: FollowingDb,
  userId: string,
  weekStart: string,
): Promise<FollowingVerdict> {
  const hit = (res: { data: unknown; error: unknown }): boolean => {
    if (res.error) throw res.error;
    return Array.isArray(res.data) && res.data.length > 0;
  };

  if (
    hit(
      // ── LA FENÊTRE, PAS LA DATE D'ÉCRITURE ────────────────────────────
      // C'était `created_at >= weekStart`: un plan composé le DIMANCHE pour la
      // semaine qui commence lundi ne comptait pas — l'élève suivait pourtant
      // bel et bien un plan, et le tap du soir lui était retenu en silence.
      // C'est très exactement le mode d'échec que l'en-tête de ce fichier
      // raconte.
      //
      // Ce qui compte est qu'un plan VIVANT couvre encore cette semaine: sa
      // fenêtre se termine à `week_start` ou après.
      await db
        .from("student_generated_meals")
        .select("id")
        .eq("user_id", userId)
        .is("retired_at", null)
        .gte("ends_on", weekStart)
        .limit(1),
    )
  ) {
    return { following: true, source: "generated_meals" };
  }

  // ── LE FOYER, EN DEUXIÈME ────────────────────────────────────────────
  // Deux lectures et pas une jointure: le foyer d'une personne se lit d'abord
  // (une ligne, index unique), et la composition ensuite. Une jointure côté
  // PostgREST obligerait à embarquer `households` dans le select, donc à
  // dépendre d'une relation nommée que la RLS filtre déjà — pour économiser un
  // aller-retour sur un chemin de repli qui ne part presque jamais.
  //
  // Elle ne part QU'APRÈS `student_generated_meals`: le compte maître a sa
  // propre ligne, il répond donc sur la première source et ne paie jamais
  // celle-ci. Seuls les autres membres l'atteignent.
  const household = await db
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1);
  if (household.error) throw household.error;
  const householdId = Array.isArray(household.data) && household.data.length > 0
    ? String((household.data[0] as { household_id?: unknown }).household_id ?? "")
    : "";
  if (householdId) {
    if (
      hit(
        await db
          .from("student_generated_meals")
          .select("id")
          .eq("household_id", householdId)
          .is("retired_at", null)
          .gte("ends_on", weekStart)
          .limit(1),
      )
    ) {
      return { following: true, source: "household_meals" };
    }
  }

  if (
    hit(
      await db
        .from("student_week_plans")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "adopted")
        .limit(1),
    )
  ) {
    return { following: true, source: "adopted_week_plan" };
  }

  if (
    hit(
      await db
        .from("plan_versions")
        .select("id")
        .eq("student_id", userId)
        .eq("status", "published")
        .limit(1),
    )
  ) {
    return { following: true, source: "published_plan_version" };
  }

  return NOT_FOLLOWING;
}
