/**
 * LE CONTEXTE DE GÉNÉRATION — UNE SEULE ADMISSION, POUR N = 1 COMME POUR N > 1.
 *
 * Ce module répond à UNE question, avant toute dépense: « cet appelant a-t-il
 * le droit de composer, et pour quel foyer ? ». Il ne compose rien.
 *
 * ⛔ LE DROIT DE GÉNÉRER VIENT DU RÔLE EN BASE, JAMAIS DU NOMBRE DE BOUCHES NI
 * D'UN PARAMÈTRE CLIENT. C'est le cœur du lot 2: un foyer d'une personne et un
 * foyer de cinq franchissent la MÊME porte, et une liste de membres envoyée par
 * le client n'ouvre aucun droit. Depuis le lot 1, tout compte a un foyer — donc
 * `not_owner` ne vise plus qu'une chose: un membre secondaire.
 *
 * ⚠️ LA RÉSOLUTION EST PURE, LES LECTURES SONT DEHORS. `resolveGeneration
 * Context` ne prend que des lignes déjà lues: on peut donc éprouver les quatre
 * situations de la table du plan sans base, et `loadGenerationContext` reste un
 * assemblage de lectures sans décision.
 *
 * ⛔ CE QUE CE CONTEXTE NE PORTE PAS, ET POURQUOI — à lire avant d'y ajouter un
 * champ:
 *
 *   · LE CALENDRIER. `todayDate` se dérive du fuseau du foyer, lu plus bas dans
 *     le générateur avec les habitudes. Le remonter ici ferait une seconde
 *     lecture du fuseau, donc deux vérités possibles sur « quel jour on est ».
 *
 *   · LE QUOTA DE FUSION. Il se réclame juste avant l'appel modèle, exprès:
 *     `household_merge_quota_test` épingle qu'aucune porte de sortie ne
 *     s'intercale entre la réclamation et la dépense. Le remonter ici ferait
 *     payer une unité à un foyer refusé plus loin.
 *
 *   · LES OPÉRATIONS AUTORISÉES. On pourrait les dériver (`merge` n'a pas de
 *     sens à une bouche), mais rien ne les consulterait: `resolveMergeRequest`
 *     refuse déjà un membre absent du roster, avec SON vocabulaire. Un champ
 *     que personne ne lit est une garde désarmée qui ressemble à une garde.
 */

/** Les refus de l'admission, dans l'ordre où ils mordent. */
export type GenerationRefusal =
  | "not_authenticated"
  | "no_household"
  | "not_owner"
  | "household_frozen";

export const GENERATION_REFUSAL_STATUS: Record<GenerationRefusal, number> = {
  not_authenticated: 401,
  no_household: 409,
  not_owner: 403,
  household_frozen: 402,
};

/** Une ligne de `household_members`, réduite à ce que l'admission regarde. */
export interface RosterSeat {
  memberId: string;
  userId: string | null;
  role: string;
}

export interface GenerationAdmissionReads {
  /** `auth.uid()` de l'appelant, ou `null` si le jeton n'a rien donné. */
  actorUserId: string | null;
  /** Le siège de l'appelant, ou `null` s'il n'en a aucun. */
  seat: { householdId: string; memberId: string; role: string } | null;
  /**
   * `keel_household_is_covered`. `null` = LECTURE EN PANNE, et le fail-open
   * est assumé: se tromper de sens ici coupe un client qui paie, ce qu'aucun
   * nouvel essai ne répare. C'est l'arbitrage inverse de celui des allergies.
   */
  covered: boolean | null;
}

/**
 * CE QUE L'ADMISSION SEULE ÉTABLIT — avant toute lecture de bouches.
 *
 * ⚠️ IL N'Y A PAS DE `servedMemberIds` ICI, ET C'EST VOLONTAIRE. Le roster se
 * lit plus loin, par `keel_household_roster_for` — le lecteur UNIQUE, partagé
 * avec le chat. Porter un tableau vide « en attendant » ferait un
 * `householdSize` de 0 qui a l'air d'un fait. Le type interdit donc de lire les
 * bouches avant de les avoir.
 */
export interface AdmittedActor {
  /** Le compte authentifié qui a tapé « Composer ». */
  actorUserId: string;
  /** Le foyer résolu en base — jamais reçu du client. */
  householdId: string;
  /** Le compte maître. Pour une personne seule, c'est l'acteur lui-même. */
  masterUserId: string;
  /** Le siège du maître dans ce foyer. */
  masterMemberId: string;
  /** Le compte sous lequel le plan s'écrit. Toujours le maître. */
  planOwnerUserId: string;
  /** Le périmètre d'écriture. Il n'y en a qu'un: le foyer résolu. */
  writeScope: "household";
  /** `true` si la lecture de couverture a échoué et qu'on est passé quand même. */
  coverageUnreadable: boolean;
}

/** L'admission, UNE FOIS LES BOUCHES LUES. Le contrat du moteur. */
export interface GenerationContext extends AdmittedActor {
  /** Les bouches servies: TOUTES celles du foyer, présences réglées plus bas. */
  servedMemberIds: readonly string[];
  /** Combien de bouches. 1 pour une personne seule, et rien d'autre ne change. */
  householdSize: number;
}

export type GenerationAdmission =
  | { ok: true; actor: AdmittedActor }
  | { ok: false; refusal: GenerationRefusal; status: number };

function refuse(refusal: GenerationRefusal): GenerationAdmission {
  return { ok: false, refusal, status: GENERATION_REFUSAL_STATUS[refusal] };
}

/**
 * LES QUATRE SITUATIONS DE LA TABLE DU PLAN, ET RIEN D'AUTRE.
 *
 * ⚠️ L'ORDRE DES REFUS EST LE CONTRAT. Un membre secondaire d'un foyer GELÉ
 * lit `not_owner`, pas `household_frozen`: on ne raconte pas l'état de
 * facturation du foyer d'autrui à quelqu'un qui n'a pas le droit d'y toucher.
 */
export function resolveGenerationAdmission(
  reads: GenerationAdmissionReads,
): GenerationAdmission {
  const actorUserId = String(reads.actorUserId ?? "").trim();
  if (!actorUserId) return refuse("not_authenticated");

  const seat = reads.seat;
  if (!seat || !String(seat.householdId ?? "").trim()) {
    return refuse("no_household");
  }
  if (seat.role !== "owner") return refuse("not_owner");

  // ⛔ `covered === false` SEULEMENT. `null` est la panne de lecture, et elle
  // passe (fail-open, ci-dessus). Écrire `!reads.covered` gèlerait tout foyer
  // dont la lecture tombe — l'inverse exact de l'arbitrage.
  if (reads.covered === false) return refuse("household_frozen");

  return {
    ok: true,
    actor: {
      actorUserId,
      householdId: seat.householdId,
      // Le maître EST l'acteur: on vient de vérifier son rôle sur SON siège.
      // Le relire dans le roster ferait une seconde source pour un fait déjà
      // établi, et un roster incomplet le rendrait `null` sans raison.
      masterUserId: actorUserId,
      masterMemberId: seat.memberId,
      planOwnerUserId: actorUserId,
      writeScope: "household",
      coverageUnreadable: reads.covered === null,
    },
  };
}

/**
 * LES BOUCHES REJOIGNENT L'ADMISSION, UNE FOIS LE ROSTER LU.
 *
 * ⛔ C'EST LE SEUL ENDROIT OÙ LA TAILLE DU FOYER ENTRE DANS LE CONTEXTE, et
 * elle n'ouvre aucun droit: le droit a été décidé plus haut, sur le rôle en
 * base. Servir une personne ou cinq passe par le même contrat.
 */
export function contextForRoster(
  actor: AdmittedActor,
  roster: readonly RosterSeat[],
): GenerationContext {
  const servedMemberIds = roster
    .map((r) => String(r.memberId ?? "").trim())
    .filter((id) => id.length > 0);
  return {
    ...actor,
    servedMemberIds,
    // ⚠️ `servedMemberIds.length` et PAS `roster.length`: une ligne sans
    // `member_id` lisible ne nourrit personne, et la compter ferait croire à
    // une bouche de plus.
    householdSize: servedMemberIds.length,
  };
}
