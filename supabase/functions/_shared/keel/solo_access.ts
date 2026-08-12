/**
 * C3 ① — À QUEL TITRE CE COMPTE PRODUIT-IL ? PUR (+ une lecture, plus bas).
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md,
 * arbitrage D13 et « Questions encore ouvertes » n°1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE MODULE NE REFUSE RIEN, ET C'EST LA DÉCISION DU LOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE FAIT, MESURÉ ──────────────────────────────────────────────────────
 * Un compte SANS FOYER — sans abonnement, essai expiré, coach insolvable — a
 * consommé 19 805 jetons. L1 a fermé la porte du FOYER (`keel_household_is_
 * covered`, 402 `household_frozen` avant tout appel modèle, sur les cinq
 * portes). D13 dit en toutes lettres qu'un compte sans foyer n'est pas
 * concerné: « il y a des comptes individuels qui nécessiteront pas de foyer,
 * on s'en fout ».
 *
 * ── POURQUOI ON NE FERME PAS ─────────────────────────────────────────────
 * Parce qu'il n'existe AUCUNE règle de facturation décidée pour ce cas, et
 * qu'inventer un refus reviendrait à écrire un prix. Les trois candidats
 * disponibles ont chacun un mode d'échec grave, et le pire est le même:
 *
 *   ① `has_app_write_access(uid)` — la garde PRÉ-KEEL, qui sert une dizaine de
 *      policies RLS. Elle lit `profiles.trial_end` et `subscriptions` du compte
 *      LUI-MÊME. La brancher telle quelle couperait, dès le premier déploiement,
 *      DEUX populations qui paient: le membre d'un foyer (dont le droit est
 *      celui du foyer, pas le sien) et l'élève d'un coach (dont le siège est
 *      payé par le coach). Piège nommé, non pris.
 *   ② le siège de coach (`keel_coach_is_solvent`) — vrai pour l'élève d'un
 *      coach, mais un compte individuel sans coach n'en a pas, et un repli sur
 *      « pas de coach ⇒ pas le droit » redirait `no_coach` avec un autre mot.
 *   ③ une règle neuve — c'est-à-dire un prix, décidé par un agent, un soir.
 *
 * « Un refus qui coupe un client qui paie ne se répare par aucun nouvel
 * essai. » C'est l'arbitrage écrit de L1 sur le fail-open, et il vaut a
 * fortiori pour une garde qu'aucun humain n'a demandée.
 *
 * ── CE QU'ON FAIT À LA PLACE: LE TROU DEVIENT MESURABLE ──────────────────
 * On LIT les droits qui existent déjà, on ne les applique pas, et on écrit ce
 * qu'on a lu — dans le journal ET sur la ligne du plan (`generated_from.
 * access`). Le trou cesse d'être une hypothèse: il devient une requête.
 *
 *     select generated_from -> 'access' ->> 'state', count(*)
 *       from student_generated_meals group by 1;
 *
 * ⚠️ ÉCRIT MÊME QUAND TOUT VA BIEN. Une clé qui n'apparaîtrait que sur le cas
 * `none` ne se distinguerait pas d'un lot débranché — ce dépôt paie en boucle
 * la garde construite puis silencieusement débranchée (L7, `merge_quota`).
 *
 * COÛT: zéro lecture pour un membre de foyer (son droit est déjà tranché par
 * L1, et on n'interroge rien), deux lectures pour un compte sans foyer.
 *
 * RETOUR ARRIÈRE: retirer l'appel et la clé. Aucune migration, aucune colonne,
 * aucun refus à défaire.
 */

/** LE DROIT EST CELUI DU FOYER (D13/L1): rien à interroger de plus. */
export const ACCESS_HOUSEHOLD = "household";
/** Un coach solvable porte son siège (`keel_coach_is_solvent`). */
export const ACCESS_COACH_SEAT = "coach_seat";
/** Le compte porte lui-même un essai ou un abonnement (`has_app_write_access`). */
export const ACCESS_OWN = "own_subscription_or_trial";
/** AUCUN des trois. C'est le trou de la question ouverte n°1. */
export const ACCESS_NONE = "none";
/** Une lecture a échoué: on ne prétend pas savoir, et on ne refuse pas. */
export const ACCESS_UNKNOWN = "unknown";

export type AccessState =
  | typeof ACCESS_HOUSEHOLD
  | typeof ACCESS_COACH_SEAT
  | typeof ACCESS_OWN
  | typeof ACCESS_NONE
  | typeof ACCESS_UNKNOWN;

export interface AccessFacts {
  /** Cette personne appartient-elle à un foyer (résolu une seule fois, L1) ? */
  household: boolean;
  /**
   * `keel_coach_is_solvent(coachId)`. `null` = pas de coach, ou lecture ratée —
   * les deux se distinguent dans `AccessObservation.reads`.
   */
  coachSolvent: boolean | null;
  /** `has_app_write_access(userId)`. `null` = lecture ratée. */
  appWriteAccess: boolean | null;
}

export interface AccessObservation {
  state: AccessState;
  household: boolean;
  coach_solvent: boolean | null;
  app_write_access: boolean | null;
}

/**
 * CE QU'ON A LU, RANGÉ EN UN MOT — et ce mot ne décide de rien.
 *
 * L'ORDRE DE LECTURE EST CELUI DE LA CERTITUDE, du plus tranché au moins:
 * le foyer (D13 a une définition unique en base), puis le siège de coach (le
 * modèle KEEL: le coach paie pour sa cohorte), puis le droit du compte
 * lui-même (l'héritage pré-KEEL). `none` n'est prononcé que quand les DEUX
 * lectures ont répondu, et répondu non: une lecture ratée rend `unknown`, parce
 * que « je n'ai pas su lire » et « il n'a aucun droit » sont deux faits
 * différents, et que les confondre ferait un compteur qui grossit à chaque
 * panne de base.
 */
export function describeAccess(facts: AccessFacts): AccessObservation {
  const base = {
    household: facts.household,
    coach_solvent: facts.coachSolvent,
    app_write_access: facts.appWriteAccess,
  };
  if (facts.household) return { state: ACCESS_HOUSEHOLD, ...base };
  if (facts.coachSolvent === true) return { state: ACCESS_COACH_SEAT, ...base };
  if (facts.appWriteAccess === true) return { state: ACCESS_OWN, ...base };
  // ⚠️ `coachSolvent === null` NE VAUT PAS « INCONNU » À LUI SEUL: un compte
  // sans coach n'en a aucun à interroger, et c'est un fait, pas une panne. Le
  // seul doute qui compte ici vient de `has_app_write_access`, qui est la
  // lecture qu'on fait TOUJOURS.
  if (facts.appWriteAccess === null) return { state: ACCESS_UNKNOWN, ...base };
  return { state: ACCESS_NONE, ...base };
}

/** Le strict minimum de client Supabase dont la lecture a besoin. */
type MinimalClient = {
  rpc: (name: string, params: Record<string, unknown>) => Promise<
    { data: unknown; error: { message: string } | null }
  >;
};

/**
 * LES DEUX LECTURES, ET RIEN D'AUTRE.
 *
 * ⚠️ AUCUNE RÈGLE N'EST ÉCRITE ICI. `has_app_write_access` et
 * `keel_coach_is_solvent` sont les définitions du dépôt; les réécrire en
 * TypeScript ferait deux vérités qui divergeraient au premier ajustement —
 * c'est le motif écrit de `keel_household_is_covered` (L1), et il vaut ici
 * autant qu'ailleurs.
 *
 * ⚠️ NE LÈVE JAMAIS. Une lecture d'observation qui casserait une génération
 * serait pire que le trou qu'elle mesure.
 */
export async function readAccessFacts(
  admin: MinimalClient,
  args: { userId: string; householdId: string | null; coachId: string | null },
): Promise<AccessFacts> {
  // LE FOYER COURT-CIRCUITE TOUT: son droit est déjà tranché par L1, deux
  // gardes plus haut, et l'interroger une seconde fois coûterait deux lectures
  // par génération à la population majoritaire pour un mot qu'on connaît.
  if (args.householdId) {
    return { household: true, coachSolvent: null, appWriteAccess: null };
  }

  let appWriteAccess: boolean | null = null;
  try {
    const res = await admin.rpc("has_app_write_access", { uid: args.userId });
    if (!res.error && typeof res.data === "boolean") appWriteAccess = res.data;
  } catch (_error) {
    appWriteAccess = null;
  }

  let coachSolvent: boolean | null = null;
  if (args.coachId) {
    try {
      const res = await admin.rpc("keel_coach_is_solvent", {
        p_coach_id: args.coachId,
      });
      if (!res.error && typeof res.data === "boolean") coachSolvent = res.data;
    } catch (_error) {
      coachSolvent = null;
    }
  }

  return { household: false, coachSolvent, appWriteAccess };
}

/** Le `tag` du journal, écrit une seule fois pour que les deux portes comptent pareil. */
export const ACCESS_LOG_TAG = "keel.access.observed";
