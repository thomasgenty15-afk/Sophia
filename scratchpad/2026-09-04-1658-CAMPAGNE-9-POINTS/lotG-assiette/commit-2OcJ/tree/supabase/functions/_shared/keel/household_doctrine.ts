/**
 * O7 — LA DOCTRINE D'UN MEMBRE DE FOYER SE RÉSOUT PAR LE FOYER.
 *
 * ── LE TROU, MESURÉ EN HTTP RÉEL LE 2026-08-12 ──────────────────────────────
 *
 *     POST /functions/v1/generate-meal-v1   (jeton du secondaire)
 *       → 409 no_coach   en 373 ms
 *     select count(*) from coach_clients where student_user_id = <secondaire> → 0
 *     select count(*) from coach_clients where student_user_id = <maître>     → 1
 *
 * `keel_household_join` n'attache personne à un coach, et `generate-meal-v1`
 * exige un coach à doctrine publiée. Conséquence: un compte secondaire ne peut
 * PAS prendre la main (D2), donc rien n'est jamais proposé au maître, donc ni
 * fusion, ni défusion, ni avertissement. Sept lots serveur justes et prouvés,
 * qu'aucun utilisateur ne peut déclencher.
 *
 * ── L'ARBITRAGE, ET LES DEUX AUTRES SORTIES ─────────────────────────────────
 *
 * **AUCUNE LIGNE `coach_clients` N'EST CRÉÉE. LA DOCTRINE SE RÉSOUT PAR LE
 * FOYER.** Quand l'appelant est membre d'un foyer et n'a PAS de coach à lui, il
 * compose sous la doctrine du **maître de son foyer**.
 *
 *   · *Rattacher au coach maison* (`coach_kind = 'house'`) donnerait un siège
 *     non facturable (`keel_coach_seat_ledger` rend `is_active_seat = false`),
 *     mais **deux doctrines dans une même cuisine**: le plan du foyer suivrait
 *     le coach du maître, le plan personnel du secondaire suivrait la maison,
 *     et la fusion mélangerait deux méthodes dans une seule casserole. Le foyer
 *     mange ensemble.
 *   · *Rattacher au coach du maître* serait cohérent, et **crée un siège
 *     facturable** sur un coach humain — plus `trial_seat_limit`. Une décision
 *     qui crée des sièges ne se prend pas en passant, et les lignes créées
 *     existeraient (retour arrière destructif).
 *   · *La résolution par le foyer* — celle-ci — ne crée **aucune ligne**, garde
 *     **une seule doctrine par cuisine**, et se défait en retirant une branche
 *     de lecture.
 *
 * ── CE QUE CE MODULE N'EST PAS ──────────────────────────────────────────────
 *
 * ⚠️ **IL N'ÉCRIT RIEN.** Ni `coach_clients`, ni `profiles.keel_role`, ni quoi
 * que ce soit d'autre. Deux `select` et un chargeur de doctrine. Si une
 * écriture apparaît ici un jour, c'est que quelqu'un a repris la sortie qu'on
 * a écartée sans rouvrir l'arbitrage — un test de source l'interdit
 * nommément.
 *
 * ⚠️ **CE N'EST PAS UN REMPLACEMENT, C'EST UN REPLI.** Un titulaire qui a SON
 * propre coach garde le sien, et on ne lit même pas le foyer dans ce cas. Le
 * repli n'existe que sur la branche où la fonction rendait `no_coach`.
 *
 * ⚠️ **LA NOTE 1:1 NE SUIT PAS.** `loadCoachNote` reste appelée sur l'appelant:
 * une note que le coach a écrite **sur le maître** parle du maître, et
 * l'injecter dans le plan de quelqu'un d'autre serait une divulgation, pas un
 * repli. Seul ce qui est écrit pour TOUTE la cohorte se transmet.
 */

import {
  type DoctrineLoadOptions,
  type DoctrineTableMouth,
  type LoadedDoctrine,
  loadPublishedDoctrine,
} from "./doctrine_loader.ts";
import type { GoalToken } from "./tokens.ts";

/** Ce que la résolution a trouvé, et par quel chemin. */
export interface CallerDoctrine {
  doctrine: LoadedDoctrine;
  /**
   * LE COMPTE DONT LE COACH A SERVI — l'appelant, ou le maître de son foyer.
   *
   * `null` quand personne n'en a: c'est le `no_coach` que l'appelant rendra.
   * Rendu plutôt que déduit, parce que le SECOND consommateur en a besoin —
   * `loadPublishedProtocol` doit lire le mapping alimentaire du MÊME coach,
   * sans quoi le plan suivrait les convictions d'un coach et les aliments
   * d'aucun. C'est l'hybride que `doctrine_loader.ts` documente déjà comme
   * « une méthode que personne n'a écrite ».
   */
  subjectUserId: string | null;
  /** `true` quand c'est le MAÎTRE du foyer qui a fourni le coach. */
  viaHousehold: boolean;
  /**
   * Le maître retrouvé, s'il l'a été. Tracé **même quand il n'a pas de coach
   * non plus**: sans lui, « ce foyer n'a pas de maître » et « son maître n'a
   * pas de coach » laisseraient exactement la même trace, et les deux se
   * réparent différemment.
   */
  ownerUserId: string | null;
  /** La lecture du maître a échoué. Le repli est alors muet, jamais deviné. */
  ownerLookupFailed: boolean;
}

/**
 * LE MAÎTRE D'UN FOYER DÉJÀ RÉSOLU.
 *
 * ⚠️ PREND LE `householdId`, JAMAIS UN `userId`. L'appelant a déjà résolu son
 * foyer une fois (L1: `resolveHouseholdIdFor`, avant le modèle, pour la garde
 * de gel) et cette valeur est CONSOMMÉE ici. Re-résoudre « quel foyer est celui
 * de cette personne » avec un second prédicat est exactement la dette que ce
 * dépôt a payée deux fois le 2026-08-12 sur les lecteurs du plan du foyer.
 *
 * `role = 'owner'` est la définition du dépôt (`household_members_role_check`,
 * 20260808000000), la même que lit `stripe-reconcile-households` pour trouver
 * le payeur. `user_id is not null` parce que le détachement (20260811040000)
 * met `on delete set null`: un maître dont le compte a été supprimé laisse une
 * bouche à table sans compte, et il n'y a alors pas de coach à emprunter.
 */
export async function resolveHouseholdOwnerUserId(
  db: unknown,
  householdId: string,
): Promise<string | null> {
  const id = String(householdId ?? "").trim();
  if (!id) return null;
  // deno-lint-ignore no-explicit-any
  const client = db as any;
  const { data, error } = await client
    .from("household_members")
    .select("user_id")
    .eq("household_id", id)
    .eq("role", "owner")
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return String((data as Record<string, unknown> | null)?.user_id ?? "").trim() ||
    null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C ① — LA DOCTRINE D'UNE TABLE: UNE MÉTHODE, PLUSIEURS OBJECTIFS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QU'ELLE FERME, MESURÉ LE 2026-08-19. La lane du repas de foyer
 * appelait `loadPublishedDoctrine(admin, userId)` — le TITULAIRE — et recevait
 * donc la variante compilée sur `student_goals.goal` du titulaire seul. Un
 * coach qui écrit une croyance `goal_scope: ["muscle_gain"]` la voyait absente
 * des 6 prompts sur 6 d'un foyer où l'athlète est à table, parce que la
 * maîtresse de maison est en `fat_loss`. Le filtre est vivant; c'est la PORTÉE
 * qui était prise sur la mauvaise personne.
 *
 * ── CE QUE CETTE FONCTION NE FAIT PAS, ET C'EST LA MOITIÉ DU LOT ──────────
 * ⚠️ **ELLE NE CHERCHE PAS UNE SECONDE DOCTRINE.** Le coach reste celui du
 * titulaire, son bloc reste son bloc, sa voix et ses interdits ne bougent pas
 * d'un octet. UN foyer, UNE méthode: c'est la règle du fichier, écrite en tête,
 * et la mélanger produirait un plan qu'aucun coach n'a écrit, signé des deux.
 * Ce qui suit la bouche est le FILTRE PAR OBJECTIF, rien d'autre.
 *
 * ⚠️ **ELLE N'EMPRUNTE PAS LE COACH D'UNE AUTRE BOUCHE.** `loadDoctrineForCaller`
 * juste en dessous fait ça — pour un SECONDAIRE qui compose son plan
 * personnel — et c'est un autre geste, sur un autre chemin. Ici l'appelant EST
 * le titulaire du foyer: s'il n'a pas de coach, la lane rend `no_coach` comme
 * avant.
 *
 * ⚠️ `tableGoals` EST REQUIS, jamais `?`. C'est ici que la casse de compilation
 * recense les appelants, et c'est voulu: l'option est FACULTATIVE sur
 * `loadPublishedDoctrine` — pour que les onze appelants sans table gardent le
 * comportement d'avant sans y penser — donc il faut un endroit où l'oubli ne
 * soit PAS silencieux. C'est celui-ci. `[]` est une réponse valable et explicite
 * (« personne d'autre n'a d'objectif ici »), et elle rend un bloc byte-identique
 * à celui d'avant ce lot.
 */
export async function loadHouseholdDoctrine(
  db: unknown,
  args: {
    /** Le TITULAIRE du foyer — celui dont le coach gouverne la cuisine. */
    ownerUserId: string;
    /**
     * LES AUTRES BOUCHES ATTABLÉES, avec leur objectif et leur prénom.
     *
     * ⚠️ L'APPELANT PASSE LE ROSTER TEL QU'IL EST, sans filtrer le titulaire ni
     * dédupliquer: `tableScopeSection` écarte déjà tout objectif que la variante
     * du titulaire couvre, et déduplique par (objectif, prénom). Un second
     * filtrage chez l'appelant serait une seconde définition de « qui compte »,
     * et c'est elle qui divergerait le jour où la règle bouge.
     *
     * ⚠️ UNE BOUCHE SANS OBJECTIF LISIBLE N'Y ENTRE PAS — pas avec un jeton
     * inventé, pas avec celui du titulaire. C'est la même direction sûre que
     * partout ailleurs: on perd une ligne ciblée, on n'en sert jamais une qui ne
     * vise pas cette bouche.
     */
    tableGoals: readonly DoctrineTableMouth[];
  },
): Promise<LoadedDoctrine> {
  return await loadPublishedDoctrine(db, args.ownerUserId, {
    tableGoals: args.tableGoals,
  });
}

/**
 * LA DOCTRINE DE CET APPELANT — la sienne, sinon celle de son foyer.
 *
 * L'ordre est le seul qui tienne les deux cas: on charge d'abord la doctrine de
 * l'appelant, **sans rien lire du foyer**. Un titulaire qui a son propre coach
 * sort ici, avec exactement la même valeur qu'avant ce lot, et sans une requête
 * de plus. Le repli ne s'ouvre que sur `coachId === null`.
 *
 * ── POURQUOI `goalOverride` EST PASSÉ SUR LE REPLI, ET SEULEMENT LÀ ─────────
 *
 * `loadPublishedDoctrine` lit `student_goals` **du compte qu'on lui passe**.
 * Sur le repli, ce compte est le MAÎTRE — donc sans `goalOverride`, un
 * secondaire en `muscle_gain` recevrait la variante `fat_loss` de son maître.
 * La variante doit suivre la personne qu'on nourrit; le coach seul vient du
 * foyer. Sur le chemin nominal, aucune option n'est passée: le comportement est
 * byte-identique à celui d'avant ce lot, et un test le tient.
 *
 * @param goal l'objectif de l'APPELANT, déjà validé contre `GOAL_TOKENS` par
 *   son lecteur. `null` = variante `default`, ce qui est exact pour quelqu'un
 *   qui n'a pas d'objectif lisible.
 */
export async function loadDoctrineForCaller(
  db: unknown,
  args: {
    userId: string;
    /** Le foyer DÉJÀ RÉSOLU par l'appelant, ou `null`. Jamais re-résolu ici. */
    householdId: string | null;
    goal: GoalToken | null;
    options?: DoctrineLoadOptions;
  },
): Promise<CallerDoctrine> {
  const own = await loadPublishedDoctrine(db, args.userId, args.options ?? {});
  if (own.coachId) {
    return {
      doctrine: own,
      subjectUserId: args.userId,
      viaHousehold: false,
      ownerUserId: null,
      ownerLookupFailed: false,
    };
  }

  // PAS DE FOYER ⇒ PAS DE REPLI. C'est le cas nominal du produit individuel, et
  // c'est aussi le cas qui doit continuer de rendre `no_coach`: un compte solo
  // sans coach n'a personne à emprunter.
  const householdId = String(args.householdId ?? "").trim();
  if (!householdId) {
    return {
      doctrine: own,
      subjectUserId: null,
      viaHousehold: false,
      ownerUserId: null,
      ownerLookupFailed: false,
    };
  }

  let ownerUserId: string | null = null;
  try {
    ownerUserId = await resolveHouseholdOwnerUserId(db, householdId);
  } catch (error) {
    // FAIL-CLOSED, ET C'EST LE BON SENS ICI. Une lecture en panne rend le refus
    // qui existait déjà (`no_coach`), jamais une doctrine devinée. Se tromper
    // dans l'autre sens ferait composer sous la méthode de quelqu'un qu'on n'a
    // pas su lire.
    console.warn("[keel/household-doctrine] owner lookup failed", error);
    return {
      doctrine: own,
      subjectUserId: null,
      viaHousehold: false,
      ownerUserId: null,
      ownerLookupFailed: true,
    };
  }

  // LE MAÎTRE, C'EST MOI ⇒ RIEN À EMPRUNTER. Un maître sans coach reste sans
  // coach: relire sa propre ligne rendrait la même chose, pour une requête de
  // plus. C'est aussi ce qui interdit toute boucle.
  if (!ownerUserId || ownerUserId === args.userId) {
    return {
      doctrine: own,
      subjectUserId: null,
      viaHousehold: false,
      ownerUserId,
      ownerLookupFailed: false,
    };
  }

  const viaHousehold = await loadPublishedDoctrine(db, ownerUserId, {
    // La variante suit la personne qu'on nourrit, jamais le maître. Voir plus
    // haut: sans cette ligne, le repli servirait la doctrine écrite pour
    // l'objectif de quelqu'un d'autre.
    goalOverride: args.goal,
  });
  // LE MAÎTRE AUSSI PEUT N'AVOIR AUCUN COACH. On rend alors la lecture de
  // l'APPELANT — c'est la sienne qui décrit son état, et c'est elle que
  // `doctrineBlockFor` doit voir. Rendre celle du maître ferait porter à
  // l'appelant un `reason` qui parle d'un compte qui n'est pas le sien.
  if (!viaHousehold.coachId) {
    return {
      doctrine: own,
      subjectUserId: null,
      viaHousehold: false,
      ownerUserId,
      ownerLookupFailed: false,
    };
  }

  console.log(JSON.stringify({
    tag: "keel.doctrine.household_fallback",
    user_id: args.userId,
    household_id: householdId,
    owner_user_id: ownerUserId,
    coach_id: viaHousehold.coachId,
    variant: args.goal ?? "default",
    reason: viaHousehold.reason,
  }));

  return {
    doctrine: viaHousehold,
    subjectUserId: ownerUserId,
    viaHousehold: true,
    ownerUserId,
    ownerLookupFailed: false,
  };
}
