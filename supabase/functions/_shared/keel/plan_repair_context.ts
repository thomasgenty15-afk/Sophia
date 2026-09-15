/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONTEXTE DE RÉPARATION — LE PLAN PART AVEC LA DEMANDE, PAR UNITÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE PREMIER DÉFAUT QUE CE MODULE FERME, MESURÉ SUR LES MESSAGES ARCHIVÉS.
 * `generate-household-meal-v1/index.ts` appelait `householdUserMessage(...)` :
 * ce constructeur REBÂTIT LE BRIEF INITIAL et colle l'instruction au bout. Ni
 * le plan, ni son texte source ne partaient. Vérifié sur `campagne-tir1-c6` et
 * `campagne-tir3-c6` : **0/9 titres conservés, 2/5 identifiants de
 * préparation**. Et il n'y a aucun historique implicite à l'autre bout —
 * `_shared/gemini.ts` envoie le message comme `input`, sans
 * `previous_response_id`. Le plan doit être DANS le message.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-12 · FERMETURE — TROIS DÉFAUTS DE LA REVUE, REPRODUITS AVANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   ① UN DÉFAUT JOURNALIER N'OUVRAIT AUCUN PÉRIMÈTRE. `repairScopeOf` ne
 *      retenait que les `day/slot` déjà présents dans les plats ; un
 *      `protein_floor_short` porte une DATE et aucun créneau, donc `cells: []`
 *      et un appel modèle au périmètre vide. La résolution passe désormais par
 *      les UNITÉS (`plan_repair_unit.ts`) : une date + une bouche ouvrent les
 *      repas couverts de cette personne ce jour-là.
 *   ② DEUX PLATS DÉDIÉS AU MÊME CRÉNEAU AVAIENT LA MÊME ADRESSE.
 *      `cellAddress(day, slot)` ignore le propriétaire ; la fusion gardait le
 *      premier plat trouvé. L'unité porte le propriétaire.
 *   ③ LE PROMPT PROPOSAIT UNE NOUVELLE PRÉPARATION QUE LA FUSION REFUSAIT
 *      (`uses_changed`). L'application d'un patch (`plan_repair_patch.ts`)
 *      valide désormais le GRAPHE au lieu de refuser tout changement de `uses`.
 *
 * ⚠️ PURE: no I/O, no clock, no randomness. Ce module ne parle à personne.
 */

import type { RepairDefect } from "./plan_repair_loop.ts";
import type {
  RepairSessionIndex,
  RepairUnit,
  RepairUnitIndex,
} from "./plan_repair_unit.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA FORME DU PLAN — STRUCTURELLE, JAMAIS UN IMPORT DE `GeneratedMeal`
// ═══════════════════════════════════════════════════════════════════════════

export interface RepairPlanIngredient {
  readonly term: string;
  readonly ref?: string | null;
  readonly quantity?: string | null;
  readonly amount?: number | null;
  readonly unit?: string | null;
  readonly state?: string | null;
}

export interface RepairPlanDish {
  readonly day: string | null;
  readonly slot: string | null;
  readonly title: string;
  readonly memberId?: string | null;
  readonly ingredients: readonly RepairPlanIngredient[];
  readonly uses: readonly {
    readonly preparationId: string;
    readonly servings?: number | null;
  }[];
}

export interface RepairPlanPreparation {
  readonly id: string;
  readonly title: string;
  readonly servingsMade?: number | null;
  /**
   * ⟳ 2026-09-13 · LOT 3 — LE JOUR OÙ ELLE SE CUISINE.
   *
   * ⛔ Il est lu pour être REMIS dans un patch (`patchPreparationPayloads`) :
   * une casserole que le modèle renvoie sans jour perd sa session, et la
   * candidate entière tombe (`cook_day_unplaced`). Mesuré sur le premier
   * parcours hybride payant du 2026-09-13.
   *
   * ⚠️ LES DEUX GRAPHIES, parce que ce type lit tantôt la sortie du parseur
   * (`cookOn`) et tantôt une ligne relue en base (`cook_on`).
   */
  readonly cookOn?: string | null;
  readonly cook_on?: string | null;
  readonly ingredients: readonly RepairPlanIngredient[];
}

/**
 * ⟳ 2026-09-13 · LOT 2 — UNE SESSION DE CUISINE, TELLE QU'UN PATCH LA TOUCHE.
 *
 * ⛔ SEUL LE DÉROULÉ EST RÉÉCRIVABLE. Le jour, les casseroles et les durées
 * viennent du plan : un patch de texte ne DÉPLACE pas une cuisson, ne change
 * pas ce qu'on y fait, et n'en crée ni n'en supprime aucune.
 */
export interface RepairPlanSession {
  readonly day: string | null;
  readonly preparationIds: readonly string[];
  readonly runThrough: string;
}

export interface RepairPlanShape {
  readonly dishes: readonly RepairPlanDish[];
  readonly preparations: readonly RepairPlanPreparation[];
  /**
   * ⛔ REQUIS, `[]` POUR « AUCUNE », JAMAIS `?`. Optionnel, un appelant qui
   * l'oublie rendrait un plan dont les déroulés ne sont ni projetés ni
   * corrigibles — c'est-à-dire la garde construite et désarmée, le mode
   * d'échec n° 1 du dépôt (`optional-gate-params-are-disarmed-gates`). C'est
   * aussi la clé du plan réel (`GeneratedMeal.cooking_sessions`), pas un nom
   * à nous.
   */
  readonly cooking_sessions: readonly RepairPlanSession[];
}

/**
 * L'adresse LISIBLE d'une unité : `sat/dinner`, plus la bouche quand le plat
 * lui est dédié. ⚠️ CE N'EST PAS UNE CLÉ DE JOINTURE — `unitId` l'est. Deux
 * plats de la maison au même créneau rendent la même chaîne, et c'est
 * exactement le défaut ② ci-dessus ; elle ne sert qu'à écrire une phrase.
 */
export function unitAddress(u: RepairUnit): string {
  const jour = u.dayToken === "" ? String(u.date ?? "") : u.dayToken;
  const base = jour === "" ? u.slot : `${jour}/${u.slot}`;
  return u.ownerId === null ? base : `${base} (${u.ownerId})`;
}

/** L'adresse d'une case : `sun/breakfast`. `""` quand elle n'en a pas. */
export function cellAddress(
  day: string | null,
  slot: string | null,
): string {
  const d = String(day ?? "").trim();
  const s = String(slot ?? "").trim();
  if (d === "" && s === "") return "";
  return `${d}/${s}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LE PÉRIMÈTRE MODIFIABLE — PAR UNITÉ, ET PAR NATURE DE DÉFAUT
// ═══════════════════════════════════════════════════════════════════════════

/** Pourquoi un défaut n'a pas trouvé d'unité. */
export const SCOPE_UNRESOLVED_REASONS = [
  /** L'adresse ne désigne aucune unité du plan ni de la demande. */
  "no_unit",
  /** L'adresse en désigne plusieurs et rien ne départage. */
  "ambiguous",
  /** Le défaut ne porte aucune adresse du tout. */
  "no_address",
  /** ⟳ LOT 2 — l'index de session du défaut ne désigne aucune session du plan. */
  "no_session",
] as const;
export type ScopeUnresolvedReason = (typeof SCOPE_UNRESOLVED_REASONS)[number];

export interface RepairScope {
  /** Les unités que la réparation a le droit de changer. */
  readonly unitIds: readonly string[];
  /**
   * ⛔ LES UNITÉS RÉSERVÉES À CRÉER — sous-ensemble de `unitIds`. Une portion
   * attendue et absente n'existe pas dans `dishes` : sans cette liste, aucune
   * règle partant des plats ne saurait la désigner, et « remplir une case
   * vide » n'était réparable par personne.
   */
  readonly createUnitIds: readonly string[];
  /** Les préparations que la réparation a le droit de changer. */
  readonly preparationIds: readonly string[];
  /**
   * ⟳ 2026-09-13 · LOT 2 — LES SESSIONS DONT LE DÉROULÉ EST RÉÉCRIVABLE.
   *
   * ⛔ ELLES NE TIRENT RIEN AVEC ELLES. Une consigne de cuisine dangereuse se
   * corrige sur SA phrase : ouvrir les recettes de ses casseroles ferait
   * recomposer des assiettes que personne n'a mesurées, et le plan l'interdit
   * (« recettes/quantités inchangées »).
   */
  readonly sessionIds: readonly string[];
  /**
   * ⛔ LES UNITÉS QU'UNE PRÉPARATION MODIFIABLE NOURRIT SANS ÊTRE EN DÉFAUT.
   * Elles ne sont PAS modifiables — mais elles entrent dans la VALIDATION de
   * la candidate : changer la casserole change leur assiette.
   */
  readonly dependentUnitIds: readonly string[];
  /** Les unités qui doivent revenir à l'identique. */
  readonly frozenUnitIds: readonly string[];
  /**
   * ⛔ LES PRÉPARATIONS PARTAGÉES ENTRE UNE UNITÉ EN DÉFAUT ET UNE UNITÉ SAINE.
   * La consigne doit y proposer l'ISOLEMENT plutôt que la modification en place.
   */
  readonly sharedPreparations: readonly {
    readonly id: string;
    readonly repairedUnitIds: readonly string[];
    readonly untouchedUnitIds: readonly string[];
  }[];
  /**
   * ⛔ LES DÉFAUTS QU'AUCUNE UNITÉ NE PORTE, AVEC LEUR RAISON. Les taire ferait
   * croire à un périmètre complet — et le chantier l'interdit : « ne pas
   * envoyer un appel annoncé comme réparable avec un périmètre vide ».
   */
  readonly unresolved: readonly {
    readonly cause: string | null;
    readonly kind: string;
    readonly detail: string;
    readonly why: ScopeUnresolvedReason;
  }[];
  readonly counts: {
    readonly units: number;
    readonly created: number;
    readonly preparations: number;
    readonly sessions: number;
    readonly dependents: number;
    readonly unresolved: number;
  };
}

/** Les causes qui désignent une portion ATTENDUE et ABSENTE. */
const MISSING_PORTION_CAUSES: ReadonlySet<string> = new Set([
  "cell_without_dish",
  "cell_without_portion",
  "mouth_unfed",
  "box_missing",
  "boxes_none_delivered",
]);

/**
 * ⛔ LA CAUSE DE L'ENTRÉE DE DERNIER RECOURS, ET ELLE EST À PART.
 *
 * La personne EST servie ; son assiette est BLOQUÉE (ni frais ni casserole
 * réécrivable dans la direction demandée). Le seul geste qui reste est un petit
 * plat À ELLE au même moment. Elle ne désigne donc pas une portion absente —
 * elle désigne une unité `isComplement`, et les confondre ferait réparer
 * « personne n'a rien à ce repas » par un plat de plus.
 */
const COMPLEMENT_CAUSE = "dedicated_complement_needed";

/** Une date ISO, par opposition à un jeton de jour (`sat`). */
function isDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Les unités d'une journée, pour une bouche donnée. */
function unitsOfDay(
  index: RepairUnitIndex,
  day: string,
  memberId: string | null,
): RepairUnit[] {
  const parDate = isDate(day);
  return index.units.filter((u) => {
    const meme = parDate ? u.date === day : u.dayToken === day;
    if (!meme) return false;
    if (memberId === null) return true;
    return u.ownerId === memberId || u.eaters.includes(memberId);
  });
}

/**
 * LE PÉRIMÈTRE MODIFIABLE D'UNE RÉPARATION — DÉFAUT PAR DÉFAUT.
 *
 * ⛔ IL PART DES DÉFAUTS, JAMAIS D'UNE RÈGLE GLOBALE. Une exclusion servie
 * dans le dîner de samedi désigne ce dîner et les casseroles qu'il tire — pas
 * les six repas. C'est la correction que la revue demande pour la sécurité :
 * « le verrou médical rend les six plats indisponibles pour une injection sur
 * UN plat : ce n'est pas une réparation locale ».
 *
 * ⛔ LA TABLE DE RÉSOLUTION, DANS L'ORDRE OÙ ELLE EST LUE :
 *
 *   ① une PRÉPARATION nommée → cette préparation ; ses consommateurs entrent
 *      en dépendance, et deviennent modifiables si le défaut est de SÉCURITÉ
 *      (le lot est contaminé, ses portions le sont aussi) ;
 *   ② une portion ATTENDUE ET ABSENTE → l'unité réservée correspondante ;
 *   ③ une adresse `jour/moment` → les unités de cette case, réduites à la
 *      bouche quand le défaut en nomme une, puis au titre s'il en reste
 *      plusieurs ;
 *   ④ une JOURNÉE (date ou jeton, sans moment) → les repas couverts de cette
 *      bouche ce jour-là ;
 *   ⑤ rien de tout ça → `unresolved`, avec sa raison.
 *
 * ⚠️ UN DÉFAUT NON RÉSOLU N'ÉLARGIT PAS LE PÉRIMÈTRE, IL SE COMPTE. Lui donner
 * « tout le plan » par défaut rendrait la porte inutile au premier défaut
 * global — la façon habituelle dont ces gardes meurent dans ce dépôt.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairScopeOf(args: {
  readonly plan: RepairPlanShape;
  readonly index: RepairUnitIndex;
  /**
   * ⛔ REQUIS — LA TABLE DES SESSIONS. Elle traduit l'index qu'un constat
   * porte (`sessionIndex`) en jeton adressable (`S1`). Optionnelle, un
   * appelant qui l'oublie rendrait un périmètre sans session pour un défaut de
   * session : l'appel partirait avec rien à réparer.
   */
  readonly sessions: RepairSessionIndex;
  readonly defects: readonly RepairDefect[];
}): RepairScope {
  const ouvertes = new Set<string>();
  const preparations = new Set<string>();
  const sessionsOuvertes = new Set<string>();
  const unresolved: RepairScope["unresolved"][number][] = [];
  const perdu = (d: RepairDefect, why: ScopeUnresolvedReason) =>
    unresolved.push({
      cause: d.cause,
      kind: d.kind,
      detail: d.detail,
      why,
    });

  const potsExistants = new Set(args.plan.preparations.map((p) => p.id));
  /** Qui tire quelle casserole — par unité. */
  const tireePar = new Map<string, Set<string>>();
  for (const u of args.index.present) {
    for (const id of u.preparationIds) {
      const s = tireePar.get(id) ?? new Set<string>();
      s.add(u.unitId);
      tireePar.set(id, s);
    }
  }

  for (const d of args.defects) {
    if (!d.repairable) continue;

    // ── ⓪ LA SESSION NOMMÉE ─────────────────────────────────────────────
    //
    // ⛔ EN PREMIER, ET ELLE N'OUVRE QUE SON TEXTE. Un déroulé dangereux se
    // corrige sur sa phrase ; ouvrir les recettes de ses casseroles ferait
    // recomposer des assiettes saines que personne n'a mesurées.
    if (d.sessionIndex !== null) {
      const jeton = args.sessions.byIndex.get(d.sessionIndex) ?? null;
      if (jeton === null) {
        perdu(d, "no_session");
        continue;
      }
      sessionsOuvertes.add(jeton);
      continue;
    }

    // ── ① LA PRÉPARATION NOMMÉE ─────────────────────────────────────────
    const pot = d.preparationId === null ? "" : d.preparationId.trim();
    if (pot !== "" && potsExistants.has(pot)) {
      preparations.add(pot);
      // ⛔ UN LOT CONTAMINÉ CONTAMINE SES PORTIONS. Pour une violation
      // alimentaire, les unités qui tirent ce lot sont en cause elles aussi :
      // les geler ferait servir l'allergène dans une assiette qu'on n'a pas le
      // droit de toucher.
      if (d.kind === "safety") {
        for (const uid of tireePar.get(pot) ?? []) ouvertes.add(uid);
      }
      continue;
    }

    const jour = String(d.day ?? "").trim();
    const moment = String(d.slot ?? "").trim();
    const date = String(d.date ?? "").trim();

    // ── ② LA PORTION ATTENDUE ET ABSENTE, OU LE COMPLÉMENT ──────────────
    const veutComplement = d.cause === COMPLEMENT_CAUSE;
    if (
      veutComplement || (d.cause !== null && MISSING_PORTION_CAUSES.has(d.cause))
    ) {
      const candidates = args.index.reserved.filter((u) =>
        // ⛔ LES DEUX FAMILLES NE SE MÉLANGENT PAS. Une unité de complément et
        // une unité réservée peuvent porter la MÊME adresse (même bouche, même
        // créneau) : c'est la cause qui départage.
        u.isComplement === veutComplement &&
        (moment === "" || u.slot === moment) &&
        (jour === "" || u.dayToken === jour || u.date === jour) &&
        (date === "" || u.date === date) &&
        (d.memberId === null || u.eaters.includes(d.memberId) ||
          u.ownerId === d.memberId)
      );
      if (candidates.length > 0) {
        for (const u of candidates) ouvertes.add(u.unitId);
        continue;
      }
      // ⚠️ PAS D'UNITÉ RÉSERVÉE : la grille attendue n'a pas été passée, ou la
      // case existe et c'est la PORTION qui manque dans un plat présent. On
      // retombe sur l'adressage normal ci-dessous plutôt que d'abandonner.
    }

    // ── ③ L'ADRESSE `jour/moment` ───────────────────────────────────────
    if (moment !== "" && (jour !== "" || date !== "")) {
      let cibles = args.index.units.filter((u) =>
        u.slot === moment &&
        (jour === "" ? true : (u.dayToken === jour || u.date === jour)) &&
        (date === "" ? true : u.date === date)
      );
      if (cibles.length === 0) {
        perdu(d, "no_unit");
        continue;
      }
      if (cibles.length > 1 && d.memberId !== null) {
        const parBouche = cibles.filter((u) =>
          u.ownerId === d.memberId || u.eaters.includes(d.memberId!)
        );
        if (parBouche.length > 0) cibles = parBouche;
      }
      if (cibles.length > 1 && d.dish !== null && d.dish !== "") {
        const parTitre = cibles.filter((u) => u.title === d.dish);
        if (parTitre.length > 0) cibles = parTitre;
      }
      for (const u of cibles) ouvertes.add(u.unitId);
      continue;
    }

    // ── ④ LA JOURNÉE ────────────────────────────────────────────────────
    const jourSeul = date !== "" ? date : jour;
    if (jourSeul !== "") {
      const cibles = unitsOfDay(args.index, jourSeul, d.memberId);
      if (cibles.length === 0) {
        perdu(d, "no_unit");
        continue;
      }
      for (const u of cibles) ouvertes.add(u.unitId);
      continue;
    }

    perdu(d, "no_address");
  }

  // ── LES CASSEROLES DES UNITÉS OUVERTES ──────────────────────────────────
  for (const uid of ouvertes) {
    const u = args.index.byId.get(uid);
    if (u === undefined) continue;
    for (const id of u.preparationIds) preparations.add(id);
  }

  const dependantes = new Set<string>();
  const partagees: RepairScope["sharedPreparations"][number][] = [];
  for (const id of [...preparations].sort()) {
    const mangeurs = [...(tireePar.get(id) ?? [])].sort();
    const touchees = mangeurs.filter((uid) => ouvertes.has(uid));
    const intactes = mangeurs.filter((uid) => !ouvertes.has(uid));
    for (const uid of intactes) dependantes.add(uid);
    if (touchees.length > 0 && intactes.length > 0) {
      partagees.push({
        id,
        repairedUnitIds: touchees,
        untouchedUnitIds: intactes,
      });
    }
  }

  const unitIds = [...ouvertes].sort(ordreUnite(args.index));
  const createUnitIds = unitIds.filter((uid) =>
    args.index.byId.get(uid)?.dishIndex === null
  );
  const frozen = args.index.units
    .map((u) => u.unitId)
    .filter((uid) => !ouvertes.has(uid));
  // ⛔ L'ORDRE DE LA TABLE, PAS CELUI D'ARRIVÉE. Deux listes qui décrivent le
  // même périmètre doivent se lire pareil, sinon un journal et un message se
  // contredisent sans rien changer.
  const sessionIds = args.sessions.sessions
    .map((x) => x.sessionId)
    .filter((id) => sessionsOuvertes.has(id));
  return {
    unitIds,
    createUnitIds,
    preparationIds: [...preparations].sort(),
    sessionIds,
    dependentUnitIds: [...dependantes].sort(ordreUnite(args.index)),
    frozenUnitIds: frozen,
    sharedPreparations: partagees,
    unresolved,
    counts: {
      units: unitIds.length,
      created: createUnitIds.length,
      preparations: preparations.size,
      sessions: sessionIds.length,
      dependents: dependantes.size,
      unresolved: unresolved.length,
    },
  };
}

/** L'ordre de la table des unités, pour que deux listes se lisent pareil. */
function ordreUnite(index: RepairUnitIndex) {
  const rang = new Map(index.units.map((u, i) => [u.unitId, i]));
  return (a: string, b: string) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA PROJECTION — CE QUE LE MODÈLE RELIT DE SON PROPRE PLAN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ LE PLAFOND SOUPLE. Le message de réparation archivé fait déjà ~25 000
 * caractères sur un appel qui frôle la coupure de 150 s. On vise 9 000, mais
 * ce n'est plus un couteau : ce qui se retire en premier est la LISTE
 * d'identité des unités gelées SANS dépendance — la partie la plus répétitive
 * et la moins utile. Les unités modifiables ne sont jamais amputées.
 */
export const PLAN_PROJECTION_SOFT_CHARS = 9_000;

/**
 * ⛔ LE PLAFOND DUR. Au-delà, la projection n'est plus exploitable et le
 * chantier l'exige en toutes lettres : « si un plafond dur du fournisseur est
 * atteint, déclarer `context_too_large` avant l'appel ; ne pas envoyer un
 * contexte incomplet en prétendant qu'il est exploitable ».
 */
export const PLAN_PROJECTION_HARD_CHARS = 24_000;

// ═══════════════════════════════════════════════════════════════════════════
// ② bis · ⟳ 2026-09-13 · LOT 2 — CE QUE CHAQUE BOUCHE D'UN LOT COMMUN DOIT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE TROU QUE CES TROIS TYPES FERMENT, ET C'EST UN CRITÈRE DE SORTIE (§ 1.3).
// Quand une casserole partagée est ouverte à la réparation, le message disait
// QUI en mange et COMBIEN DE PARTS chacun y tire — jamais la CIBLE ni les
// BORNES de ceux qui sont déjà dans leurs clous. Le modèle pouvait donc
// recomposer le lot pour la personne en défaut et casser les trois autres sans
// savoir qu'il les cassait.
//
// ⛔ DES TYPES STRUCTURELS, PAS UN IMPORT DE `AuditCell` NI DE
// `CellNutritionRow`. Même discipline que `RepairPlanShape` ci-dessus : ce
// module doit rester appelable là où le référentiel et la garde finale
// n'existent pas. `CellNutritionRow` et `AuditCell` (`final_plan_audit.ts`)
// satisfont ces deux formes par construction — le compilateur l'épingle au site
// d'appel.
//
// ⛔ ET ON NE RECALCULE RIEN. Ces nombres sont ceux que le moteur a déjà posés :
// la table finale pour le SERVI, le contrat de composition pour la CIBLE et les
// BORNES. Un second calcul serait un second avis, et c'est celui qu'on relit le
// moins qui finirait par décider.

/** Ce qu'une case a réellement SERVI, tel que la table finale l'a mesuré. */
export interface RepairCellServed {
  readonly memberId: string;
  /** Le jeton de jour du plan (`sat`). */
  readonly day: string;
  /** La date locale `YYYY-MM-DD`. */
  readonly date: string;
  readonly slot: string;
  readonly servedKcal: number | null;
  readonly grams: number | null;
  readonly densityPer100G: number | null;
}

/** Ce qu'une case DOIT, tel que le contrat de composition l'a posé. */
export interface RepairCellContract {
  readonly memberId: string;
  readonly day: string;
  readonly date: string;
  readonly slot: string;
  readonly targetKcal: number | null;
  readonly gramsMin: number | null;
  readonly gramsMax: number | null;
  readonly densityMin: number | null;
  readonly densityMax: number | null;
}

/**
 * LES DEUX TABLES DES CASES. `null` = IL N'Y A PAS DE TABLE DE NUTRITION.
 *
 * ⛔ `null` EST UNE RÉPONSE, PAS UN OUBLI — c'est la vérité du chemin
 * d'adoption, qui relit une ligne de base et n'a ni garde finale ni contrat
 * sous la main. Ce qui est interdit, c'est le `?` : facultatif, « je n'ai pas
 * les tables » deviendrait la réponse silencieuse de tous les appelants.
 */
export interface RepairNutritionTables {
  readonly cells: readonly RepairCellServed[];
  readonly contracts: readonly RepairCellContract[];
}

/**
 * UNE ADRESSE DE CASE NOMMÉE PAR UN DÉFAUT RÉPARABLE.
 *
 * ⛔ ELLE SERT À NE PAS ÉCRIRE UN FAIT FAUX. Dire « cette portion est déjà
 * juste » d'une case qu'une consigne demande justement de corriger serait une
 * contradiction dans le même message. `RepairDefect` satisfait cette forme par
 * construction ; on ne juge RIEN sur les nombres — on lit ce que les consignes
 * nomment.
 */
export interface RepairCellAddress {
  readonly memberId: string | null;
  /** Le jour tel que le défaut le porte : jeton (`sat`) OU date. */
  readonly day: string | null;
  readonly date: string | null;
  readonly slot: string | null;
}

/** Un nombre de champ. ⛔ `?` pour « on ne sait pas », jamais `0`. */
function champCase(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "?";
  return String(Math.round(v));
}

/** Ce qu'une bouche tire d'un lot, à un repas donné. */
interface ConsommateurDuLot {
  readonly unitId: string;
  readonly memberId: string;
  readonly date: string;
  readonly dayToken: string;
  readonly slot: string;
}

/**
 * LES BOUCHES D'UN LOT, UNE PAR REPAS — dans l'ordre de la table des unités.
 *
 * ⚠️ UNE MÊME PERSONNE APPARAÎT AUTANT DE FOIS QU'ELLE EN MANGE DE REPAS : le
 * contrat n'est pas celui de la personne, c'est celui de la CASE.
 */
function consommateursDuLot(
  potId: string,
  index: RepairUnitIndex,
): ConsommateurDuLot[] {
  const out: ConsommateurDuLot[] = [];
  const vus = new Set<string>();
  for (const u of index.units) {
    if (!u.preparationIds.includes(potId)) continue;
    for (const m of u.eaters) {
      const cle = `${u.unitId}|${m}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      out.push({
        unitId: u.unitId,
        memberId: m,
        date: u.date ?? "",
        dayToken: u.dayToken,
        slot: u.slot,
      });
    }
  }
  return out;
}

/** Ce qu'une case nommée par un défaut couvre : le jour entier, ou le repas. */
function casesNommees(
  defects: readonly RepairCellAddress[],
): { readonly jours: ReadonlySet<string>; readonly cases: ReadonlySet<string> } {
  const jours = new Set<string>();
  const cases = new Set<string>();
  for (const d of defects) {
    const m = String(d.memberId ?? "").trim();
    if (m === "") continue;
    const graphies = [String(d.day ?? "").trim(), String(d.date ?? "").trim()]
      .filter((x) => x !== "");
    if (graphies.length === 0) continue;
    const slot = String(d.slot ?? "").trim();
    for (const j of graphies) {
      // ⛔ UN DÉFAUT SANS CRÉNEAU PORTE SUR TOUTE LA JOURNÉE DE CETTE BOUCHE.
      // `day_energy_off` et `protein_floor_short` n'en ont pas : marquer leurs
      // repas « déjà justes » ferait dire au message le contraire de ce que la
      // consigne d'à côté demande.
      if (slot === "") jours.add(`${m}|${j}`);
      else cases.add(`${m}|${j}|${slot}`);
    }
  }
  return { jours, cases };
}

/** Ce qu'une ligne d'ingrédient rend dans la projection. */
function ligneIngredient(g: RepairPlanIngredient): string {
  const quantite = g.amount !== undefined && g.amount !== null &&
      g.unit !== undefined && g.unit !== null
    ? `${g.amount} ${g.unit}`
    : String(g.quantity ?? "").trim();
  const ref = g.ref === undefined || g.ref === null || g.ref === ""
    ? ""
    : ` [${g.ref}]`;
  const etat = g.state === undefined || g.state === null || g.state === ""
    ? ""
    : ` (${g.state})`;
  return quantite === ""
    ? `${g.term}${ref}${etat}`
    : `${quantite} ${g.term}${ref}${etat}`;
}

export interface PlanProjection {
  /** Le bloc à coller dans le message. Vide = rien à projeter. */
  readonly text: string;
  /**
   * ⛔ `true` = LE CONTEXTE NE TIENT PAS, MÊME RÉDUIT À L'ESSENTIEL. L'appelant
   * ne doit PAS partir : il déclare `context_too_large` et garde sa version.
   */
  readonly tooLarge: boolean;
  readonly counters: {
    readonly units_listed: number;
    readonly units_detailed: number;
    readonly units_to_create: number;
    readonly preparations_detailed: number;
    /** ⟳ LOT 2 — les déroulés réellement projetés. */
    readonly sessions_projected: number;
    /**
     * ⟳ 2026-09-13 · LOT 2 — LES LOTS COMMUNS DONT LES CONTRATS SONT PARTIS.
     *
     * ⛔ LES TROIS COMPTEURS SONT OBLIGATOIRES, ET C'EST LE MODE D'ÉCHEC N° 1 DU
     * DÉPÔT : sans eux, une lane qui ne passe PAS les tables rend exactement la
     * même projection qu'une lane complète — le bloc disparaît, et un lot
     * désarmé ressemble à un lot qui marche.
     *
     * `pots_with_consumers` = les lots qui ont déclenché le bloc ;
     * `pot_consumers_listed` = les lignes (une bouche × un repas) écrites ;
     * `pot_consumers_unnumbered` = celles dont NI le servi NI la cible n'ont été
     * trouvés dans les tables.
     */
    readonly pots_with_consumers: number;
    readonly pot_consumers_listed: number;
    readonly pot_consumers_unnumbered: number;
    readonly chars: number;
    /** ⛔ CE QUI A ÉTÉ RETIRÉ — des identités d'unités gelées, jamais un contenu. */
    readonly identity_lines_dropped: number;
  };
}

/**
 * LE PLAN ACTUEL, TEL QUE LE MODÈLE DOIT LE RELIRE.
 *
 * ⛔ QUATRE BLOCS, ET L'ORDRE EST LE CONTRAT :
 *
 *   ① les unités à REMPLIR — attendues, absentes du plan. Elles viennent en
 *      premier parce qu'un repas qui manque prime sur un repas mal dosé ;
 *   ② les unités à CHANGER, avec leurs ingrédients chiffrés ;
 *   ③ les casseroles qu'elles tirent, avec le nombre de parts, la phrase qui
 *      dit qui d'autre en mange, et — pour un lot qui nourrit plus d'une
 *      personne ou plus d'un jour — LE CONTRAT DE CHACUN DE SES CONSOMMATEURS,
 *      y compris ceux qui sont déjà dans leurs clous ;
 *   ④ ce qui ne bouge pas — la LISTE des autres unités. C'est le bloc
 *      sacrifiable : il ne porte que de l'identité.
 *
 * ⚠️ LES IDENTIFIANTS SONT DES JETONS MACHINE ET ILS SORTENT TELS QUELS
 * (`unit_id`, `preparations[].id`, `ingredients[].ref`).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function planProjection(args: {
  readonly plan: RepairPlanShape;
  readonly index: RepairUnitIndex;
  /** ⟳ LOT 2 — REQUIS: sans elle, un déroulé à réécrire n'est pas projeté. */
  readonly sessions: RepairSessionIndex;
  readonly scope: RepairScope;
  /**
   * ⟳ 2026-09-13 · LOT 2 — LES DEUX TABLES DES CASES, REQUISES ET NULLABLES.
   *
   * ⛔ JAMAIS `?`. Facultatives, « je n'ai pas les contrats » deviendrait la
   * réponse silencieuse de tous les appelants et le bloc des consommateurs
   * disparaîtrait sans que personne le voie — la garde construite et désarmée.
   * `null` veut dire « pas de table de nutrition », pas « je ne sais pas ».
   */
  readonly nutrition: RepairNutritionTables | null;
  /**
   * ⟳ 2026-09-13 · LOT 2 — LES CASES QUE LES CONSIGNES NOMMENT. `[]` = aucune.
   *
   * ⛔ ELLES NE SERVENT QU'À NE PAS ÉCRIRE UN FAIT FAUX : une portion que la
   * consigne d'à côté demande de corriger ne doit pas être annoncée « déjà
   * juste » dix lignes plus bas.
   */
  readonly defects: readonly RepairCellAddress[];
  readonly softMaxChars?: number;
  readonly hardMaxChars?: number;
}): PlanProjection {
  const souple = args.softMaxChars ?? PLAN_PROJECTION_SOFT_CHARS;
  const dur = args.hardMaxChars ?? PLAN_PROJECTION_HARD_CHARS;
  const aChanger = new Set(args.scope.unitIds);
  const aCreer = new Set(args.scope.createUnitIds);
  const dependantes = new Set(args.scope.dependentUnitIds);

  const platDe = (u: RepairUnit): RepairPlanDish | null =>
    u.dishIndex === null ? null : args.plan.dishes[u.dishIndex] ?? null;

  const identite = (u: RepairUnit): string => {
    const plat = platDe(u);
    const pots = u.preparationIds;
    const qui = u.eaters.length === 0 ? "" : ` — for ${u.eaters.join(", ")}`;
    return `  · ${u.unitId} ${unitAddress(u)} "${plat?.title ?? "—"}"${qui}` +
      (pots.length > 0 ? ` — draws on ${pots.join(", ")}` : "");
  };

  // ── LES TABLES DES CASES, INDEXÉES UNE FOIS ─────────────────────────────
  //
  // ⚠️ DEUX GRAPHIES DE JOUR, ET C'EST LE DÉPÔT QUI LES IMPOSE : un plat porte
  // un JETON (`sat`), une case attendue porte une DATE. On indexe les deux et
  // on interroge les deux — un appariement sur une seule graphie perdrait la
  // moitié des lignes sans un mot.
  const servi = new Map<string, RepairCellServed>();
  const du = new Map<string, RepairCellContract>();
  for (const c of args.nutrition?.cells ?? []) {
    servi.set(`${c.memberId}|${c.day}|${c.slot}`, c);
    servi.set(`${c.memberId}|${c.date}|${c.slot}`, c);
  }
  for (const c of args.nutrition?.contracts ?? []) {
    du.set(`${c.memberId}|${c.day}|${c.slot}`, c);
    du.set(`${c.memberId}|${c.date}|${c.slot}`, c);
  }
  const nomme = casesNommees(args.defects);
  const lu = <T>(m: ReadonlyMap<string, T>, c: ConsommateurDuLot): T | null =>
    m.get(`${c.memberId}|${c.dayToken}|${c.slot}`) ??
      m.get(`${c.memberId}|${c.date}|${c.slot}`) ?? null;

  /** Les blocs, du plus obligatoire au plus sacrifiable. */
  const obligatoires: string[] = [];
  const sacrifiables: string[] = [];
  let detaillees = 0;
  let listees = 0;
  let potsAvecConsommateurs = 0;
  let consommateursListes = 0;
  let consommateursSansChiffre = 0;

  // ── ① LES UNITÉS À REMPLIR ──────────────────────────────────────────────
  const aRemplir = args.index.units.filter((u) =>
    aCreer.has(u.unitId) && !u.isComplement
  );
  if (aRemplir.length > 0) {
    const sessionDays = [
      ...new Set(
        args.sessions.sessions
          .map((s) => String(s.day ?? "").trim())
          .filter((day) => day !== ""),
      ),
    ];
    obligatoires.push(
      "THESE MEALS ARE MISSING — the plan owes them and does not hold them.",
      "Write each one under its unit_id, on the day and slot given here:",
      "Prefer a self-contained fresh dish or an existing preparation id.",
      sessionDays.length === 0
        ? "⛔ Do not declare a new preparation: this plan has no cooking session for it."
        : `If you declare a NEW preparation, its cook_on MUST be one of: ${sessionDays.join(", ")}.`,
    );
    for (const u of aRemplir) {
      obligatoires.push(
        `  · ${u.unitId} ${unitAddress(u)} — nobody is served here yet` +
          (u.eaters.length === 0 ? "" : `; it must feed ${u.eaters.join(", ")}`),
      );
      listees++;
    }
  }

  // ── ① bis LES COMPLÉMENTS — L'ENTRÉE DE DERNIER RECOURS ─────────────────
  //
  // ⛔ ELLE NE REMPLACE RIEN. Le plat partagé reste tel quel: il ne peut PAS
  // être retravaillé (ni frais, ni casserole réécrivable dans la direction
  // voulue), et c'est pour ça que cette personne est bloquée. On ajoute un
  // PETIT plat à son nom, à côté.
  const complements = args.index.units.filter((u) =>
    aCreer.has(u.unitId) && u.isComplement
  );
  if (complements.length > 0) {
    obligatoires.push(
      "",
      "THESE PEOPLE ARE STUCK — the dish they share cannot be reworked for them,",
      "so write them ONE SMALL EXTRA dish of their own, at the same meal, under",
      "its unit_id. Do NOT change the shared dish: it feeds the others, and it is",
      "already right for them.",
    );
    for (const u of complements) {
      obligatoires.push(
        `  · ${u.unitId} ${unitAddress(u)} — an extra dish for ${
          u.eaters.join(", ")
        }, on top of what is already served there`,
      );
      listees++;
    }
  }

  // ── ② LES UNITÉS À CHANGER ──────────────────────────────────────────────
  const cibles = args.index.units.filter((u) =>
    aChanger.has(u.unitId) && !aCreer.has(u.unitId)
  );
  if (cibles.length > 0) {
    obligatoires.push(
      "",
      "THE MEALS TO CHANGE — and only these. Each comes back under its unit_id.",
      "This is what they hold today:",
    );
    for (const u of cibles) {
      obligatoires.push(identite(u));
      const plat = platDe(u);
      const g = (plat?.ingredients ?? []).map(ligneIngredient);
      if (g.length > 0) obligatoires.push(`      holds: ${g.join(" · ")}`);
      detaillees++;
      listees++;
    }
  }

  // ── ③ LES CASSEROLES ────────────────────────────────────────────────────
  const partageesPar = new Map(
    args.scope.sharedPreparations.map((p) => [p.id, p]),
  );
  const pots = args.plan.preparations.filter((p) =>
    args.scope.preparationIds.includes(p.id)
  );
  let potsDetailles = 0;
  if (pots.length > 0) {
    obligatoires.push(
      "",
      "THE PREPARATIONS THOSE MEALS DRAW ON — this is what they hold today:",
      // ⛔ L'ÉCHELLE EST DITE, ET ELLE N'EST PAS LA MÊME DES DEUX CÔTÉS. Sous
      // une casserole, les quantités sont celles du LOT ENTIER (elle fait N
      // parts) ; sous un repas, ce sont celles que le repas ajoute le jour même.
      // Sans cette phrase, « 1 900 g de poulet » se lit comme une assiette, et
      // la recomposition part d'un facteur faux.
      "SCALE: the amounts under a preparation are the WHOLE BATCH — it makes the",
      "number of servings written next to it. The amounts under a meal are what",
      "that meal adds on the day, for one standard portion.",
    );
    for (const p of pots) {
      const parts = p.servingsMade === undefined || p.servingsMade === null
        ? ""
        : ` — makes ${p.servingsMade} serving(s)`;
      obligatoires.push(`  · ${p.id} "${p.title}"${parts}`);
      const g = (p.ingredients ?? []).map(ligneIngredient);
      if (g.length > 0) obligatoires.push(`      holds: ${g.join(" · ")}`);
      const partagee = partageesPar.get(p.id) ?? null;
      if (partagee !== null) {
        // ⛔ LA PHRASE QUI ÉVITE DE CASSER UNE ASSIETTE SAINE — et qui est
        // désormais TENUE par l'application du patch : une nouvelle
        // préparation déclarée dans le même patch est acceptée.
        obligatoires.push(
          `      ⛔ SHARED: ${partagee.repairedUnitIds.join(", ")} needs it ` +
            `changed, but ${
              partagee.untouchedUnitIds.join(", ")
            } draws on it too and is fine.`,
          `      Change it only if the change suits BOTH. Otherwise leave it as`,
          `      it is, declare a NEW preparation with a new id in this answer,`,
          `      and point only the unit that needs it at the new id.`,
          // ══════════════════════════════════════════════════════════════
          // ⟳ 2026-09-13 · §2.1 — LES JOURS OÙ L'ON CUISINE, DITS ICI
          // ══════════════════════════════════════════════════════════════
          //
          // ⛔ LA CONSIGNE DEMANDAIT L'IMPOSSIBLE. Le schéma de patch écrit
          // « A NEW preparation carries a "cook_on" that an existing cooking
          // session covers » — et RIEN dans le message ne dit quels jours ces
          // sessions couvrent : la liste des déroulés n'est projetée que
          // lorsqu'un déroulé est lui-même en défaut. Le modèle devait donc
          // deviner, et une casserole neuve posée le mauvais jour fait tomber
          // la candidate entière sur `preparation_without_session`, une cause
          // que rien ne répare.
          //
          // ⚠️ ON DIT LES JOURS, ON NE DEMANDE PAS DE CHOISIR UNE SESSION. Le
          // rattachement lui-même est fait par le SERVEUR
          // (`applyRepairPatch`) : une adresse de session dans la réponse
          // serait une adresse de plus à valider pour rien.
          ...(() => {
            const jours = [
              ...new Set(
                args.sessions.sessions
                  .map((s) => String(s.day ?? "").trim())
                  .filter((d) => d !== ""),
              ),
            ];
            return jours.length === 0
              // ⛔ AUCUNE SESSION ⇒ ON LE DIT, ET ON RETIRE L'ISSUE. Proposer
              // d'isoler dans un plan qui ne cuisine rien d'avance ferait
              // dépenser un appel pour une candidate refusée d'avance.
              ? [
                `      ⛔ This plan has no cooking session, so a NEW preparation`,
                `         has nowhere to be cooked: do not declare one here.`,
              ]
              : [
                `      A NEW preparation is cooked in one of this plan's cooking`,
                `      sessions: its "cook_on" must be one of ${jours.join(", ")}.`,
              ];
          })(),
        );
        // ⛔ LE CONTRAT DE CHAQUE CONSOMMATEUR SAIN, AVEC SA QUANTITÉ MESURÉE.
        // « Les autres en mangent aussi » ne dit pas COMBIEN : sans le nombre de
        // parts que chacun tire, la seule façon de juger un changement de lot
        // est de recopier la quantité de celui qui est en défaut — et c'est
        // exactement ce qu'on ne veut pas.
        for (const uid of partagee.untouchedUnitIds) {
          const u = args.index.byId.get(uid);
          if (u === undefined) continue;
          const plat = platDe(u);
          const part = (plat?.uses ?? [])
            .filter((x) => x.preparationId === p.id)
            .map((x) =>
              x.servings === undefined || x.servings === null
                ? "an unstated number of servings"
                : `${x.servings} serving(s)`
            )
            .join(", ");
          obligatoires.push(
            `      · ${uid} ${unitAddress(u)} takes ${
              part === "" ? "a share" : part
            } of ${p.id}` +
              (u.eaters.length === 0 ? "" : ` — for ${u.eaters.join(", ")}`) +
              ` and is already right. Do not break what it takes out.`,
          );
        }
      }

      // ── LE CONTRAT DE CHAQUE BOUCHE DE CE LOT ────────────────────────────
      //
      // ⛔ CE QU'IL FERME, ET C'EST UN CRITÈRE DE SORTIE DU PLAN (§ 1.3) :
      // « lorsque la préparation modifiée nourrit plusieurs personnes ou
      // plusieurs jours, inclure les contrats nécessaires de TOUS ses
      // consommateurs, y compris ceux déjà conformes ». Les lignes ci-dessus
      // disent QUI en mange et COMBIEN DE PARTS ; elles ne disent NI la cible
      // NI les bornes des portions déjà justes. Le modèle pouvait donc
      // recomposer le lot pour la personne en défaut et casser les autres sans
      // savoir qu'il les cassait.
      //
      // ⚠️ LE DÉCLENCHEUR EST LE LOT COMMUN, PAS LE DÉFAUT. Un lot qu'une seule
      // bouche mange un seul jour n'a pas de second contrat à respecter : lui
      // écrire ce bloc serait du bruit, et le bruit est ce qui fait sauter le
      // plafond.
      //
      // ⛔ ET SANS TABLE DE NUTRITION, ON N'ÉCRIT PAS CE BLOC. Une liste de
      // `?` ne serait pas un contrat : elle occuperait la place d'un contrat.
      // Le témoin de l'absence est le compteur à zéro, pas une phrase vide.
      const bouches = args.nutrition === null
        ? []
        : consommateursDuLot(p.id, args.index);
      const personnes = new Set(bouches.map((c) => c.memberId));
      const jours = new Set(
        bouches.map((c) => c.date === "" ? c.dayToken : c.date),
      );
      if (bouches.length > 0 && (personnes.size > 1 || jours.size > 1)) {
        potsAvecConsommateurs++;
        obligatoires.push(
          `      WHAT EACH PORTION OUT OF ${p.id} OWES — one line per person, per`,
          `      meal. Every figure below is that person's own, measured on this`,
          `      plan and on their own contract; none of them is copied from`,
          `      anybody else, and none of them is an average:`,
        );
        for (const c of bouches) {
          const s = lu(servi, c);
          const k = lu(du, c);
          const champs = [
            `date=${c.date === "" ? c.dayToken : c.date}`,
            `slot=${c.slot}`,
            `member_id=${c.memberId}`,
            `energy_served_kcal=${champCase(s?.servedKcal)}`,
            `target_kcal=${champCase(k?.targetKcal)}`,
          ];
          // ⚠️ LES BORNES NE SORTENT QUE QUAND ELLES S'APPLIQUENT. Un couloir
          // absent écrit `min_g=?` ferait lire « une borne existe et je l'ai
          // perdue » là où le contrat s'est simplement abstenu.
          if (
            (k?.gramsMin ?? null) !== null || (k?.gramsMax ?? null) !== null
          ) {
            champs.push(
              `mass_served_g=${champCase(s?.grams)}`,
              `min_g=${champCase(k?.gramsMin)}`,
              `max_g=${champCase(k?.gramsMax)}`,
            );
          }
          if (
            (k?.densityMin ?? null) !== null || (k?.densityMax ?? null) !== null
          ) {
            champs.push(
              `density_served_per_100g=${champCase(s?.densityPer100G)}`,
              `min_per_100g=${champCase(k?.densityMin)}`,
              `max_per_100g=${champCase(k?.densityMax)}`,
            );
          }
          // ⛔ « DÉJÀ JUSTE » EST UN FAIT, PAS UNE DEVINETTE. On ne le dit que
          // d'une case qu'AUCUNE consigne de ce message ne demande de changer :
          // l'écrire d'une portion corrigée dix lignes plus haut serait une
          // contradiction dans le même message, et ce dépôt a déjà payé les
          // faits faux indémentables.
          const enCause = nomme.cases.has(
              `${c.memberId}|${c.dayToken}|${c.slot}`,
            ) || nomme.cases.has(`${c.memberId}|${c.date}|${c.slot}`) ||
            nomme.jours.has(`${c.memberId}|${c.dayToken}`) ||
            nomme.jours.has(`${c.memberId}|${c.date}`);
          const queue = enCause
            ? " — one of the portions asked for above."
            : " — ALREADY RIGHT: recomposing this pot must leave THIS portion" +
              " inside the figures on this line.";
          obligatoires.push(`      · ${c.unitId} ${champs.join(" | ")}${queue}`);
          consommateursListes++;
          if ((s?.servedKcal ?? null) === null && (k?.targetKcal ?? null) === null) {
            consommateursSansChiffre++;
          }
        }
        // ⛔ LES DEUX ÉCHAPPATOIRES DE PLUSIEURS CONTRATS SUR UNE RECETTE
        // UNIQUE, LITTÉRALEMENT NOMMÉES. Ce dépôt a mesuré qu'une consigne dont
        // l'échappatoire n'est pas nommée se fait satisfaire par elle : on
        // moyenne les cibles, ou on élargit la tolérance jusqu'à ce que tout
        // passe.
        //
        // ⚠️ ET ON NE DEMANDE JAMAIS DEUX ÉNERGIES À UNE MÊME PORTION STANDARD.
        // Le modèle écrit la recette et sa densité ; c'est le moteur qui décide
        // combien chacun en reçoit. Sans cette phrase, quatre cibles sous une
        // seule casserole se lisent comme une demande impossible.
        obligatoires.push(
          `      ⛔ These figures are PER PERSON, and one standard portion does`,
          `         not carry two different energies. You write the recipe and`,
          `         how dense it is; the app works out how much of it each`,
          `         person gets. Do not average these targets, and do not widen`,
          `         any band to make them meet.`,
        );
      }
      potsDetailles++;
    }
  }

  // ── ③ bis LES DÉROULÉS À RÉÉCRIRE ──────────────────────────────────────
  //
  // ⛔ LE TEXTE ET RIEN D'AUTRE. Le plan l'écrit en toutes lettres : « Le
  // modèle peut remplacer le déroulé des seules sessions autorisées. Il ne
  // peut pas déplacer leur jour, changer leurs références de préparations,
  // créer/supprimer une session ou modifier les durées par cette opération. »
  //
  // ⚠️ ET LA CONSIGNE DIT CE QU'IL FAUT GARDER. Un déroulé réécrit qui ne
  // décrit plus les recettes conservées serait une correction qui casse
  // l'exécution du dimanche soir.
  const deroules = args.sessions.sessions.filter((x) =>
    args.scope.sessionIds.includes(x.sessionId)
  );
  let deroulesProjetes = 0;
  if (deroules.length > 0) {
    obligatoires.push(
      "",
      "THE COOKING RUN-THROUGH TO REWRITE — the TEXT only, under its session_id.",
      "Keep describing the very same preparations, in a workable order. Do not",
      "move the day, do not change which preparations are cooked, do not add or",
      "remove a session, and do not write any weight or portion count in it:",
    );
    for (const x of deroules) {
      const pots = x.preparationIds.length === 0
        ? ""
        : ` — cooks ${x.preparationIds.join(", ")}`;
      obligatoires.push(
        `  · ${x.sessionId}${x.day === null || x.day === "" ? "" : ` (${x.day})`}${pots}`,
        `      says today: ${JSON.stringify(x.runThrough)}`,
      );
      deroulesProjetes++;
    }
  }

  // ── ④ CE QUI NE BOUGE PAS — le bloc sacrifiable ─────────────────────────
  //
  // ⚠️ LES DÉPENDANTES D'ABORD : une unité qui tire une casserole modifiable
  // doit rester visible, sinon le modèle change le lot sans savoir qui d'autre
  // y puise. Les autres gelées passent après, et ce sont elles qu'on retire.
  const gelees = args.index.units.filter((u) => !aChanger.has(u.unitId));
  const geleesDependantes = gelees.filter((u) => dependantes.has(u.unitId));
  const geleesLibres = gelees.filter((u) => !dependantes.has(u.unitId));
  if (geleesDependantes.length > 0) {
    obligatoires.push(
      "",
      "THESE MEALS ALSO DRAW ON THOSE PREPARATIONS AND ARE FINE — do not",
      "change them, and do not break what they take out of the pot:",
    );
    for (const u of geleesDependantes) {
      const plat = platDe(u);
      const parts = (plat?.uses ?? [])
        .map((x) =>
          x.servings === undefined || x.servings === null
            ? x.preparationId
            : `${x.servings} serving(s) of ${x.preparationId}`
        )
        .join(", ");
      obligatoires.push(
        `  · ${u.unitId} ${unitAddress(u)} "${plat?.title ?? "—"}"` +
          (parts === "" ? "" : ` — takes ${parts}`),
      );
      listees++;
    }
  }
  if (geleesLibres.length > 0) {
    sacrifiables.push(
      "",
      "THE REST OF THE PLAN — untouched, and not yours to rewrite:",
    );
    for (const u of geleesLibres) sacrifiables.push(identite(u));
  }

  // ── LE PLAFOND SOUPLE : ON RETIRE DE L'IDENTITÉ, JAMAIS DU CONTENU ──────
  const tailleObligatoire = obligatoires.join("\n").length;
  let lignes = [...obligatoires, ...sacrifiables];
  let retirees = 0;
  if (lignes.join("\n").length > souple && sacrifiables.length > 0) {
    retirees = geleesLibres.length;
    lignes = [
      ...obligatoires,
      "",
      `… ${retirees} other meal(s) of this plan are not listed here. They do`,
      `not change, and you do not return them.`,
    ];
  } else {
    listees += geleesLibres.length;
  }
  const texte = lignes.join("\n");
  return {
    text: texte,
    // ⛔ LE PLAFOND DUR SE JUGE SUR L'OBLIGATOIRE SEUL : si même lui déborde,
    // aucune coupe ne sauve l'appel.
    tooLarge: tailleObligatoire > dur,
    counters: {
      units_listed: listees,
      units_detailed: detaillees,
      units_to_create: aRemplir.length,
      preparations_detailed: potsDetailles,
      sessions_projected: deroulesProjetes,
      pots_with_consumers: potsAvecConsommateurs,
      pot_consumers_listed: consommateursListes,
      pot_consumers_unnumbered: consommateursSansChiffre,
      chars: texte.length,
      identity_lines_dropped: retirees,
    },
  };
}
