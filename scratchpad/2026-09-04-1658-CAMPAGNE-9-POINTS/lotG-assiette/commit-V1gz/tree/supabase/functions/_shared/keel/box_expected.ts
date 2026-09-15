/**
 * CE QU'UN PLAT DOIT EN CONTENANTS, ET CE QUE `0` VEUT DIRE — lots `L6′-a` et
 * `L6′-b`, 2026-08-22.
 *
 * Les deux lots partagent un sujet et un fichier: `box_counts`. Le premier
 * répare son DÉNOMINATEUR, le second lui donne un NOM quand son numérateur est
 * zéro. Séparés, ils écriraient deux fois la même partition par case.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ `L6′-a` — LE CONTENANT ATTENDU SE CALCULE SUR LES BOUCHES QUE CE PLAT-LÀ
 *              NOURRIT
 * ══════════════════════════════════════════════════════════════════════════
 * `boxesExpected += weighedMembers.size + lines.size` s'ajoutait sur TOUT plat
 * gardé qui prélève sur une préparation, **sans jamais regarder
 * `dish.memberId`**. Un plat dédié à Anouk réclamait donc les trois groupes du
 * foyer entier, et le plat de la table de la MÊME case réclamait Anouk une
 * seconde fois alors qu'elle n'en mange pas.
 *
 * ⛔ MESURÉ SUR `3c781a71` (le plan de `V0-D`), AVANT TOUT CODE:
 *
 *     24 plats boîtés = 12 DÉDIÉS + 12 de table, et les 12 de table sont dans
 *     la MÊME case qu'un plat dédié — 12 / 12.
 *
 *     formule d'avant : 24 × (weighed 2 + lines 1)        = 72
 *     partition réelle: 12 × 1  (Anouk seule)
 *                     + 12 × 2  (Malo seul, puis Camille+Yanis) = 36
 *     contenants rendus par le modèle                        = 38
 *
 * ⇒ **la lecture bascule de « le modèle n'obéit qu'à moitié » (38/72 = 52,8 %)
 * à « le modèle rend PLUS de contenants que la partition n'en demande »
 * (38/36 = 105,6 %)**. Un dénominateur faux dans le sens PESSIMISTE envoie un
 * lot chercher un défaut là où il n'y en a pas — c'est le risque écrit dans la
 * fiche, et il était sur le point de se réaliser.
 *
 * ⛔ ET LE SEUIL DE LA FICHE (`12×3 + 12×1 = 48`) EST INCOMPATIBLE AVEC SON
 * PROPRE PRINCIPE. Il retire les groupes fantômes du plat DÉDIÉ et laisse
 * Anouk comptée une seconde fois sur le plat de table de la même case. Corrigé
 * à **36** dans la fiche, AVANT ce fichier, l'ancien barré.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA RÈGLE, EN DEUX LIGNES
 * ══════════════════════════════════════════════════════════════════════════
 *   ① un plat DÉDIÉ (`memberId` posé) nourrit UNE bouche: la sienne;
 *   ② un plat de TABLE nourrit le roster MOINS les bouches qui ont un plat à
 *      elles **dans la même case** (jour × moment).
 *
 * ⚠️ LA CASE, PAS LE PLAN. Une bouche qui a son plat lundi midi mange au pot
 * commun mardi soir. Exclure sur tout le plan retirerait des groupes réels et
 * referait, à l'envers, l'erreur qu'on corrige.
 *
 * ⚠️ L'EXCLUSION COMPTE LES PLATS DÉDIÉS **BOÎTÉS OU NON**. Le brief est
 * explicite: *« The serving plan names the people who cannot be served from the
 * shared pot and orders a dish of their own. »* Un plat dédié cuisiné le jour
 * même remplace quand même le pot commun pour sa bouche. Ne compter que les
 * plats boîtés laisserait la bouche dans les deux.
 *
 * ⛔ CE MODULE NE COMPOSE RIEN ET NE RETIRE RIEN. Il ne rend que des ENSEMBLES
 * DE BOUCHES; l'appelant y intersecte ses groupes. Aucun gramme, aucun
 * couvercle, aucun nom n'est touché — donc **aucune bouche ne peut être
 * déshabillée par ce lot**, la mineure comprise.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ `L6′-b` — LES BOÎTES NE SONT PAS UN TIRAGE: DEUX ZÉROS, DEUX CAUSES
 * ══════════════════════════════════════════════════════════════════════════
 * La fiche `L6′-b` concluait au coup de dé sur DEUX plans. Sur DIX, et en
 * lisant les sorties BRUTES du modèle (`llm_raw_response_events`), les deux
 * zéros du 2026-08-22 ont **deux causes distinctes, et aucune n'est le hasard**:
 *
 *   · `09240cb5` — la sortie brute porte `"preparations": []`. **ZÉRO
 *     préparation**, douze plats, aucun `uses` non vide. Rien n'est cuisiné
 *     d'avance ⇒ **aucun contenant n'était DÛ**. `boxes: 0` ET `expected: 0`
 *     sont tous les deux JUSTES.
 *   · `5058be6a` — six préparations, vingt-six plats qui y prélèvent, et
 *     **zéro clé `boxes`** — alors que le modèle parle des boîtes en toutes
 *     lettres onze fois dans ses `method` et ses `run_through` (« close its
 *     box », « portion it into the named boxes »). Le parseur n'a **rien
 *     refusé**: `refused: 0`, `names_refused: 0`, `items_refused: 0`.
 *     ⇒ **le modèle a obéi en PROSE et sauté la clé de schéma.**
 *
 * ⛔ ET LE PROMPT L'EXPLIQUE: le bloc `== OUTPUT JSON SCHEMA ==` ne liste
 * JAMAIS `boxes`. Les quatre ajouts du foyer (`boxes`, `member_portions`,
 * `for_member_id`, `why_rule_of`) vivent dans des sections de prose APRÈS le
 * squelette. `member_portions`, qui est un ajout de PREMIER NIVEAU, sort 10/10;
 * `boxes`, qui est par plat ET conditionnel (« Every dish that takes from a
 * preparation ») avec une échappatoire écrite (« A dish that cooks from scratch
 * on the day has no "boxes" »), sort **8/10**.
 *
 * ⛔ CE MODULE NE RÉPARE PAS LE TAUX — c'est une décision de la vague D. Il rend
 * l'absence **VISIBLE ET NOMMÉE**, ce que `0` ne fait pas: un plan qui ne
 * cuisine rien d'avance et un plan à qui on devait vingt contenants et qui n'en
 * rend aucun sont **le même zéro** aujourd'hui, et ils appellent deux
 * corrections opposées.
 */

/** Un plat gardé, réduit à ce que la partition par case demande de savoir. */
export interface ExpectedDish {
  day: string | null;
  slot: string | null;
  /** La bouche à qui CE plat est dédié, `null` sur un plat de la table. */
  memberId: string | null;
  /**
   * Ce plat prélève-t-il sur une préparation. ⚠️ C'est la population de
   * `box_counts.meals`: seul un plat qui reprend un batch s'est vu promettre un
   * contenant.
   */
  boxable: boolean;
}

export interface MouthsFedOutcome {
  /**
   * Les bouches que chaque plat nourrit, alignées index par index sur l'entrée.
   * ⚠️ `null` sur un plat NON boîté: il ne réclame aucun contenant, et rendre
   * un ensemble vide le rendrait indiscernable d'un plat de table dont tout le
   * monde est parti.
   */
  fedByDish: (ReadonlySet<string> | null)[];
  /** Combien de fois une bouche a quitté un plat de table pour son plat dédié. */
  excluded: number;
  /**
   * Les cases où le plat de la table ne nourrit plus PERSONNE. Nommées, jamais
   * silencieuses: un plat de table sans mangeur est une contradiction, et
   * inventer un groupe pour la couvrir serait exactement le fantôme qu'on
   * retire.
   */
  sharedFedNobody: string[];
  /**
   * Une bouche dédiée absente du roster des contenants. Le parseur valide déjà
   * `for_member_id` contre `dishBearerIds`, donc ce cas ne devrait pas arriver
   * — et c'est précisément pour ça qu'il se COMPTE au lieu de se taire: il
   * signifierait que deux listes qui décrivent la même table ont divergé.
   */
  dedicatedOffRoster: string[];
}

/** `jour/moment`, la clé de la case — la MÊME que celle du compteur et de `L26-0`. */
function cellOf(dish: ExpectedDish): string {
  return `${dish.day ?? "any"}/${dish.slot ?? "any"}`;
}

/**
 * QUI CE PLAT-LÀ NOURRIT.
 *
 * ⚠️ DEUX PASSES, ET L'ORDRE COMPTE: la première apprend quelles bouches ont un
 * plat à elles dans chaque case, la seconde s'en sert. Une passe unique ferait
 * dépendre le résultat de l'ORDRE des plats dans le document — un plat de table
 * écrit AVANT le plat dédié de la même case n'aurait rien à retirer.
 */
export function mouthsFedByDish(
  dishes: readonly ExpectedDish[],
  roster: ReadonlySet<string>,
): MouthsFedOutcome {
  const dedicatedByCell = new Map<string, Set<string>>();
  const dedicatedOffRoster: string[] = [];
  for (const dish of dishes) {
    const owner = dish.memberId;
    if (!owner) continue;
    if (!roster.has(owner)) {
      dedicatedOffRoster.push(owner);
      continue;
    }
    const cell = cellOf(dish);
    const owners = dedicatedByCell.get(cell) ?? new Set<string>();
    owners.add(owner);
    dedicatedByCell.set(cell, owners);
  }

  const fedByDish: (ReadonlySet<string> | null)[] = [];
  const sharedFedNobody: string[] = [];
  let excluded = 0;
  for (const dish of dishes) {
    if (!dish.boxable) {
      fedByDish.push(null);
      continue;
    }
    const owner = dish.memberId;
    if (owner && roster.has(owner)) {
      // ① LE PLAT DÉDIÉ NOURRIT SA BOUCHE, ET ELLE SEULE.
      fedByDish.push(new Set([owner]));
      continue;
    }
    // ② LE PLAT DE LA TABLE NOURRIT LE ROSTER MOINS LES BOUCHES SERVIES À PART
    //    DANS CETTE CASE.
    const away = dedicatedByCell.get(cellOf(dish)) ?? new Set<string>();
    const fed = new Set<string>();
    for (const memberId of roster) {
      if (away.has(memberId)) {
        excluded++;
        continue;
      }
      fed.add(memberId);
    }
    if (fed.size === 0) sharedFedNobody.push(cellOf(dish));
    fedByDish.push(fed);
  }

  return { fedByDish, excluded, sharedFedNobody, dedicatedOffRoster };
}

/**
 * CE QUE `boxes: 0` VEUT DIRE — le nom que le chiffre n'a pas.
 *
 * ⛔ `plan_emptied` N'EST PAS `no_batch_cooking`. Quand le verrou de sortie a
 * vidé le plan, `meals` vaut zéro parce qu'il n'y a plus de plat du tout —
 * lire « ce foyer ne cuisine rien d'avance » sur cette ligne serait un chiffre
 * faux sur une ligne réelle, exactement ce que la garde `clean` existe pour
 * éviter.
 *
 * ⛔ ET `not_asked` N'EST PAS `none_delivered` — MESURÉ, PAS SUPPOSÉ. La lane
 * SOLO passe `boxMemberIds: []` **exprès** (le protocole des contenants n'existe
 * que pour départager deux bouches) et son plan en base porte
 * `{meals: 10, with_box: 0, expected: 0}`. Sans cette porte, l'alarme de
 * `L6′-b` sonnerait sur **CHAQUE plan solo**, pour une consigne qui n'a jamais
 * été servie — une garde qui alarme là où rien n'a été demandé se fait
 * désarmer, et emporte avec elle les deux cas où elle avait raison.
 */
export type BoxDeliveryState =
  | "plan_emptied"
  | "not_asked"
  | "no_batch_cooking"
  | "none_delivered"
  | "partial"
  | "served";

export function boxDeliveryState(
  input: { clean: boolean; roster: number; meals: number; withBox: number },
): BoxDeliveryState {
  if (!input.clean) return "plan_emptied";
  if (input.roster <= 0) return "not_asked";
  if (input.meals <= 0) return "no_batch_cooking";
  if (input.withBox <= 0) return "none_delivered";
  if (input.withBox < input.meals) return "partial";
  return "served";
}
