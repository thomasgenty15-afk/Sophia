/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONTRAT DE RÉPARATION — UN PATCH, PAS UN PLAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, ET IL A ÉTÉ REPRODUIT (revue du
 * 2026-09-12, défaut ②) : la projection proposait au modèle de donner à un
 * plat SA PROPRE préparation avec un nouvel identifiant, et `mergeRepairedUnits`
 * refusait tout changement de `uses` (`uses_changed`). Le prompt autorisait un
 * geste que la fusion jetait — deux plats partagent `p1`, un seul doit changer,
 * la candidate le relie à `p2`, **aucune case appliquée**.
 *
 * ⛔ ET LA CONSIGNE DE SORTIE SE CONTREDISAIT AVEC ELLE-MÊME. Elle disait
 * « rends tout le plan JSON » à un modèle qui ne voyait qu'une projection
 * compacte : on lui demandait de recopier des données qu'on ne lui avait pas
 * données. Le garde-fou d'en face (`parsed.dishes.length < meal.dishes.length`)
 * rejetait alors une réparation locale VALIDE parce qu'elle était courte.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE LE MODÈLE REND MAINTENANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Un objet `repair` — les CHAMPS DE RECETTE qu'il connaît déjà, sous les
 * seules unités autorisées :
 *
 * ```json
 * { "repair": { "base_version": "…",
 *               "units": [{ "unit_id": "U3", "title": "…", "ingredients": […],
 *                           "method": "…", "why": "…",
 *                           "uses": [{ "preparation_id": "p2", "servings": 1 }] }],
 *               "preparations": [{ "id": "p2", "title": "…", "ingredients": […] }] } }
 * ```
 *
 * ⛔ TROIS CHOSES QUE LE MODÈLE NE DÉCIDE PAS, ET C'EST LA MOITIÉ DE LA GARDE :
 *
 *   · LE JOUR, LE MOMENT ET LE PROPRIÉTAIRE d'une unité. Ils viennent de la
 *     table des unités, pas de sa réponse : un patch ne peut pas DÉPLACER un
 *     repas, seulement le refaire là où il est.
 *   · LA LISTE DE COURSES. Elle est reconstruite depuis les ingrédients finaux
 *     (lot 1 du 2026-09-12) ; un achat rendu par le modèle serait ignoré, donc
 *     on ne le demande pas.
 *   · CE QU'IL N'A PAS RENVOYÉ. Un tableau absent veut dire « inchangé »,
 *     JAMAIS « supprime ». C'est écrit dans le contrat envoyé.
 *
 * ⛔ L'APPLICATION EST ATOMIQUE. Une opération invalide rejette le patch
 * ENTIER et la version précédente reste : « pas de demi-patch laissé en
 * place ». Un demi-patch est la seule façon d'obtenir un plan que personne n'a
 * mesuré.
 *
 * ⚠️ PURE: no I/O, no clock, no randomness.
 */

import type {
  RepairPlanDish,
  RepairPlanPreparation,
  RepairPlanSession,
  RepairPlanShape,
  RepairScope,
} from "./plan_repair_context.ts";
import type {
  RepairSessionIndex,
  RepairUnitIndex,
} from "./plan_repair_unit.ts";

/**
 * ⛔ LA VERSION DU CONTRAT INTERNE. Elle n'a rien à voir avec le JSON public de
 * génération, qui ne change pas : c'est un contrat de RÉPARATION, entre ce
 * fichier et le modèle, et il doit pouvoir évoluer sans toucher à la réponse
 * HTTP rendue au front.
 */
export const REPAIR_PATCH_CONTRACT = "repair.v2";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA LECTURE DE L'ENVELOPPE — DU TEXTE DU MODÈLE À DES OBJETS NOMMÉS
// ═══════════════════════════════════════════════════════════════════════════

export interface RepairPatchEnvelope {
  /** La version du plan sur laquelle le modèle dit avoir travaillé. */
  readonly baseVersion: string | null;
  /** Les unités rendues, dans l'ordre de la réponse. */
  readonly units: readonly {
    readonly unitId: string;
    /** La charge utile brute — les champs de recette, non interprétés ici. */
    readonly payload: Record<string, unknown>;
  }[];
  /** Les préparations rendues, brutes. */
  readonly preparations: readonly Record<string, unknown>[];
  /**
   * ⟳ 2026-09-13 · LOT 2 — LES DÉROULÉS DE SESSION RENDUS.
   *
   * ⛔ UNE OPÉRATION BORNÉE, ET LA BORNE EST LE POINT. Le modèle remplace un
   * TEXTE sous une adresse que le serveur lui a donnée ; il ne déplace pas un
   * jour, ne change pas les casseroles d'une session, n'en crée ni n'en
   * supprime aucune, et ne touche à aucune durée par cette opération.
   */
  readonly sessions: readonly {
    readonly sessionId: string;
    readonly runThrough: string;
  }[];
  /**
   * ⛔ CE QUI N'A PAS PU ÊTRE LU — ET C'EST FATAL DEPUIS LE LOT 2.
   *
   * ⛔ LE DÉFAUT FERMÉ (revue du 2026-09-12, P2 §4, reproduit) : une bonne
   * unité accompagnée d'une opération `null` s'appliquait quand même
   * (`applied: true`, `rejections: []`). Le contrat disait « si une opération
   * est invalide, rejeter la candidate entière » ; le code ne rejetait que si
   * AUCUNE unité valide n'avait survécu.
   *
   * ⚠️ ET « OMETTRE » RESTE AUTORISÉ. Un tableau absent ou vide ne produit
   * aucune erreur : c'est `empty` qui distingue « le modèle n'a rien changé »
   * d'« il a écrit quelque chose d'illisible ». Les deux appelaient le même
   * refus, et ce sont deux faits différents.
   */
  readonly errors: readonly string[];
  /** ⛔ `true` = aucune opération déclarée, nulle part. Pas une erreur : un vide. */
  readonly empty: boolean;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? v as Record<string, unknown>
    : null;
}

/**
 * LIT L'ENVELOPPE D'UN PATCH. Le texte est déjà du JSON désérialisé.
 *
 * ⚠️ ELLE ACCEPTE L'OBJET NU **ET** L'OBJET SOUS `repair`. Un modèle qui rend
 * `{ "units": … }` sans la clé d'enveloppe a fait ce qu'on lui demandait ; le
 * rejeter sur la forme dépenserait un appel pour une accolade.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function parseRepairPatch(raw: unknown): RepairPatchEnvelope {
  const errors: string[] = [];
  const racine = asRecord(raw);
  if (racine === null) {
    return {
      baseVersion: null,
      units: [],
      preparations: [],
      sessions: [],
      errors: ["not_an_object"],
      empty: true,
    };
  }
  const corps = asRecord(racine.repair) ?? racine;
  const versionBrute = corps.base_version ?? corps.baseVersion ?? null;
  const baseVersion = typeof versionBrute === "string" && versionBrute.trim() !== ""
    ? versionBrute.trim()
    : null;

  const unitesBrutes = Array.isArray(corps.units) ? corps.units : [];
  const units: { unitId: string; payload: Record<string, unknown> }[] = [];
  for (const u of unitesBrutes) {
    const rec = asRecord(u);
    if (rec === null) {
      errors.push("unit_not_an_object");
      continue;
    }
    const id = String(rec.unit_id ?? rec.unitId ?? "").trim();
    if (id === "") {
      errors.push("unit_without_id");
      continue;
    }
    units.push({ unitId: id, payload: rec });
  }

  const potsBruts = Array.isArray(corps.preparations) ? corps.preparations : [];
  const preparations: Record<string, unknown>[] = [];
  for (const p of potsBruts) {
    const rec = asRecord(p);
    if (rec === null) {
      errors.push("preparation_not_an_object");
      continue;
    }
    // ⛔ UNE PRÉPARATION SANS IDENTIFIANT NE DÉSIGNE RIEN. Sautée en silence,
    // elle se relisait « le modèle n'a pas voulu la changer ».
    if (String(rec.id ?? "").trim() === "") {
      errors.push("preparation_without_id");
      continue;
    }
    preparations.push(rec);
  }

  // ── ⟳ 2026-09-13 · LOT 2 — LES DÉROULÉS DE SESSION ──────────────────────
  const sessionsBrutes = Array.isArray(corps.sessions) ? corps.sessions : [];
  const sessions: { sessionId: string; runThrough: string }[] = [];
  for (const x of sessionsBrutes) {
    const rec = asRecord(x);
    if (rec === null) {
      errors.push("session_not_an_object");
      continue;
    }
    const id = String(rec.session_id ?? rec.sessionId ?? "").trim();
    if (id === "") {
      errors.push("session_without_id");
      continue;
    }
    const texte = String(rec.run_through ?? rec.runThrough ?? "").trim();
    if (texte === "") {
      // ⛔ UN DÉROULÉ VIDE N'EST PAS « INCHANGÉ », C'EST UNE SESSION EFFACÉE.
      // L'ordre des gestes est la seule chose qui rende un dimanche
      // exécutable ; la consigne dit qu'un tableau omis vaut inchangé, donc
      // une entrée PRÉSENTE et vide est une opération invalide.
      errors.push("session_without_text");
      continue;
    }
    sessions.push({ sessionId: id, runThrough: texte });
  }

  const empty = units.length === 0 && preparations.length === 0 &&
    sessions.length === 0;
  return { baseVersion, units, preparations, sessions, errors, empty };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LA VALIDATION — TOUT, AVANT D'APPLIQUER QUOI QUE CE SOIT
// ═══════════════════════════════════════════════════════════════════════════

export const PATCH_REJECTIONS = [
  /** L'enveloppe est illisible. */
  "unreadable",
  /** Le modèle a travaillé sur une autre version du plan. */
  "base_version_stale",
  /**
   * ⟳ 2026-09-13 · LOT 2 — LE SERVEUR A ANNONCÉ UNE VERSION, LE MODÈLE NE L'A
   * PAS REPRISE. Motif DISTINCT d'une version périmée : « il a lu une autre
   * version » et « on ne sait pas ce qu'il a lu » sont deux faits différents,
   * et la revue demandait de ne plus les confondre.
   */
  "base_version_missing",
  /** Un `unit_id` qui n'existe dans aucune table. */
  "unknown_unit",
  /** Un `unit_id` réel, mais hors du périmètre autorisé. */
  "out_of_scope_unit",
  /** La même unité deux fois dans le même patch. */
  "duplicate_unit",
  /** Une préparation remplacée qui n'est pas dans le périmètre. */
  "preparation_out_of_scope",
  /** Un identifiant de préparation « neuf » déjà pris. */
  "preparation_id_collision",
  /** Une unité tire une casserole qui n'existe pas et n'est pas déclarée. */
  "uses_unknown_preparation",
  /** Une unité tire une casserole réelle mais hors périmètre, qu'elle ne tirait pas. */
  "uses_out_of_scope",
  /** Une préparation neuve que personne dans le périmètre ne tire. */
  "new_preparation_unused",
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-13 · §2.1 — UN LOT NEUF QUE PERSONNE NE CUISINE
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT QUE CE MOTIF FERME, ET IL EST STRUCTUREL. Isoler une bouche
   * se fait en DÉCLARANT une casserole neuve et en n'y rattachant qu'elle.
   * Mais une casserole ne se cuisine que dans une SESSION : `final_plan_gate`
   * refuse `preparation_without_session` dès qu'un plat tire un lot qu'aucune
   * session ne prépare — et cette cause est `repairable: false`. Un patch
   * d'isolement parfaitement formé rendait donc un plan que la garde finale
   * jetait, sans qu'aucune réparation ne puisse le rattraper.
   *
   * ⛔ LE MODÈLE NE VOIT PAS LES JOURS DE SESSION. La projection ne les écrit
   * que lorsqu'un DÉROULÉ est dans le périmètre : lui demander de deviner le
   * bon `cook_on` serait une consigne qu'il ne peut pas satisfaire. Le serveur
   * RATTACHE donc lui-même le lot neuf à la session de son jour — et refuse le
   * patch quand aucune session ne couvre ce jour, plutôt que d'en inventer une.
   */
  "new_preparation_unscheduled",
  /** Une unité à CRÉER revenue vide. */
  "unit_without_content",
  /**
   * ⟳ LOT 2 — UNE UNITÉ EXISTANTE EXPLICITEMENT RENDUE QUE LE MOTEUR N'A PAS
   * SU LIRE. Elle était SAUTÉE : « omettre une unité » et « en rendre une
   * illisible » se relisaient pareil, et le patch partait quand même.
   */
  "unit_not_parsed",
  /** La même préparation deux fois dans le même patch. */
  "duplicate_preparation",
  /** Une préparation existante remplacée que le moteur n'a pas su lire. */
  "preparation_not_parsed",
  /** Une charge utile écartée avant le parseur (adresse ambiguë, unité inconnue). */
  "payload_dropped",
  /** Un `session_id` qui n'existe dans aucune table. */
  "unknown_session",
  /** Un `session_id` réel, mais hors du périmètre autorisé. */
  "out_of_scope_session",
  /** La même session deux fois dans le même patch. */
  "duplicate_session",
  /** Rien d'applicable dans tout le patch. */
  "nothing_applied",
] as const;
export type PatchRejection = (typeof PATCH_REJECTIONS)[number];

export interface PatchRejectionNote {
  readonly why: PatchRejection;
  /** L'objet en cause : `U3`, `p2`, ou `""` quand c'est le patch entier. */
  readonly at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ L'APPLICATION — SUR UNE COPIE DU MEILLEUR PLAN, ET TOUT OU RIEN
// ═══════════════════════════════════════════════════════════════════════════

export interface PatchApplication<T> {
  /** `true` = le patch a été appliqué en entier. */
  readonly applied: boolean;
  /** Le plan résultant. ⛔ Sur un rejet, c'est une COPIE INTACTE du meilleur. */
  readonly plan: T;
  /** Les unités réellement remplacées ou créées. */
  readonly units: readonly string[];
  /** Les unités créées — sous-ensemble de `units`. */
  readonly created: readonly string[];
  /** Les préparations remplacées. */
  readonly preparationsReplaced: readonly string[];
  /** Les préparations créées par ce patch. */
  readonly preparationsCreated: readonly string[];
  /** Les préparations retirées parce que plus personne n'y puise. */
  readonly preparationsDropped: readonly string[];
  /** ⟳ LOT 2 — les sessions dont le déroulé a été réécrit. */
  readonly sessionsRewritten: readonly string[];
  /**
   * ⟳ 2026-09-13 · §2.1 — LES LOTS NEUFS RATTACHÉS À UNE SESSION, ET LAQUELLE.
   *
   * ⛔ REQUIS, `[]` POUR « AUCUN ». C'est la mise à jour DÉRIVÉE que la
   * création d'un lot exige : sans elle le plan porterait une casserole que
   * personne ne cuisine. Sans ce compte, un rattachement qui ne s'est pas fait
   * se relirait comme un patch sans création.
   */
  readonly preparationsScheduled: readonly {
    readonly preparationId: string;
    readonly sessionId: string;
  }[];
  /**
   * ⟳ 2026-09-13 · §2.1 — LES SESSIONS DONT LA LISTE DE CASSEROLES A CHANGÉ.
   *
   * ⚠️ DISTINCT DE `sessionsRewritten`, qui ne porte que du TEXTE. Une session
   * peut voir sa liste changer sans que son déroulé bouge — et l'inverse.
   */
  readonly sessionsRetooled: readonly string[];
  /** Pourquoi le patch a été rejeté. Vide = il a été appliqué. */
  readonly rejections: readonly PatchRejectionNote[];
  /**
   * ⚠️ LES UNITÉS DU PÉRIMÈTRE QUE LE MODÈLE N'A PAS RENDUES. Ce n'est PAS un
   * rejet — une réponse partielle est le contrat. Mais sans ce compte, « le
   * modèle a réparé une unité sur cinq » et « le modèle a tout réparé » se
   * relisent pareil.
   */
  readonly untouched: readonly string[];
}

/** Les identifiants de casserole qu'une unité tire, sans doublon, triés. */
function usesOf(dish: RepairPlanDish): string[] {
  return [
    ...new Set(
      (dish.uses ?? [])
        .map((u) => String(u?.preparationId ?? "").trim())
        .filter((x) => x !== ""),
    ),
  ].sort();
}

/**
 * APPLIQUE UN PATCH VALIDÉ SUR UNE COPIE DU MEILLEUR PLAN.
 *
 * ⛔ LES UNITÉS ET LES PRÉPARATIONS ARRIVENT **DÉJÀ PARSÉES**. Ce module ne
 * sait pas lire une recette — `parseGeneratedMeal` le fait, avec ses ceintures
 * de sécurité et sa normalisation des ingrédients. Refaire ici une seconde
 * lecture serait une seconde doctrine, et ce dépôt a déjà payé ce mode
 * d'échec. L'appelant parse, puis passe.
 *
 * ⛔ LE JOUR, LE MOMENT ET LE PROPRIÉTAIRE NE SONT PAS REPRIS DE LA CANDIDATE.
 * L'unité les porte, et c'est la copie du meilleur plan qui les garde : un
 * patch ne déplace pas un repas.
 *
 * ⚠️ LES QUANTITÉS À CUISINER NE SONT PAS RECALCULÉES ICI. La boucle du
 * générateur refait TOUTE la finalisation sur le plan fusionné — dimensionnement,
 * arrondi, tirage des casseroles, achats — et c'est là que le lot laissé aux
 * autres convives est redimensionné. Le faire ici ferait deux calculs de
 * portions dans deux fichiers.
 *
 * PURE: no I/O, no clock, no randomness. `clone` est injecté.
 */
export function applyRepairPatch<T extends RepairPlanShape>(args: {
  readonly best: T;
  readonly index: RepairUnitIndex;
  readonly scope: RepairScope;
  /** La version que l'appelant a annoncée au modèle. `null` = pas de contrôle. */
  readonly baseVersion: string | null;
  readonly envelope: RepairPatchEnvelope;
  /** ⟳ LOT 2 — la table des sessions du MÊME plan que `index`. */
  readonly sessions: RepairSessionIndex;
  /** Les plats parsés, indexés par `unit_id`. */
  readonly dishes: ReadonlyMap<string, RepairPlanDish>;
  /** Les préparations parsées, indexées par identifiant. */
  readonly preparations: ReadonlyMap<string, RepairPlanPreparation>;
  /**
   * ⟳ 2026-09-13 · LOT 2 — LES CHARGES ÉCARTÉES AVANT LE PARSEUR.
   *
   * ⛔ REQUIS. `patchDishPayloads` jette une unité inconnue ou une adresse
   * ambiguë, et personne ne relayait ce fait : le patch s'appliquait amputé, en
   * silence. Passer `[]` doit être un geste, pas un oubli.
   */
  readonly dropped: readonly { readonly unitId: string; readonly why: string }[];
  readonly clone: (plan: T) => T;
}): PatchApplication<T> {
  const rejections: PatchRejectionNote[] = [];
  const rejet = (why: PatchRejection, at = ""): void => {
    rejections.push({ why, at });
  };
  const intact = (): PatchApplication<T> => ({
    applied: false,
    plan: args.clone(args.best),
    units: [],
    created: [],
    preparationsReplaced: [],
    preparationsCreated: [],
    preparationsDropped: [],
    sessionsRewritten: [],
    preparationsScheduled: [],
    sessionsRetooled: [],
    rejections,
    untouched: args.scope.unitIds,
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 2 — UNE OPÉRATION INVALIDE REJETTE TOUT LE PATCH
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT FERMÉ, ET IL A ÉTÉ REPRODUIT (revue du 2026-09-12, P2 §4).
  // La condition était `errors.length > 0 && units.length === 0` : une bonne
  // unité accompagnée d'une opération `null` passait, avec
  // `parseErrors: ["unit_not_an_object"]`, `applied: true`, `rejections: []`.
  // Le contrat du plan dit l'inverse depuis le début.
  //
  // ⛔ ET « OMETTRE » RESTE AUTORISÉ. `parseRepairPatch` ne met plus rien dans
  // `errors` pour un tableau absent ou vide : c'est `empty` qui le dit. Les
  // deux cas ont donc des motifs distincts, et c'est la distinction que la
  // revue demandait.
  if (args.envelope.errors.length > 0) {
    rejet("unreadable", args.envelope.errors.join(","));
    return intact();
  }
  if (args.dropped.length > 0) {
    rejet("payload_dropped", args.dropped[0].why);
    return intact();
  }
  // ⛔ L'ÉCHO DE VERSION EST EXIGÉ QUAND LE SERVEUR EN ANNONCE UNE. La revue le
  // nomme : « un `base_version` absent est accepté même si le serveur en attend
  // un » était un contrôle CONDITIONNEL présenté comme une vérification. Les
  // deux manques ont désormais deux motifs.
  if (args.baseVersion !== null) {
    if (args.envelope.baseVersion === null) {
      rejet("base_version_missing");
      return intact();
    }
    if (args.envelope.baseVersion !== args.baseVersion) {
      rejet("base_version_stale", args.envelope.baseVersion);
      return intact();
    }
  }

  const autorisees = new Set(args.scope.unitIds);
  const aCreer = new Set(args.scope.createUnitIds);
  const potsAutorises = new Set(args.scope.preparationIds);
  const potsExistants = new Set(args.best.preparations.map((p) => p.id));

  // ── LES PRÉPARATIONS DU PATCH : REMPLACEMENTS ET CRÉATIONS ──────────────
  const remplacees: string[] = [];
  const creees: string[] = [];
  const potsVus = new Set<string>();
  for (const brut of args.envelope.preparations) {
    const id = String(brut.id ?? "").trim();
    // ⛔ PLUS DE SAUT SILENCIEUX: `parseRepairPatch` refuse déjà une préparation
    // sans identifiant, donc arriver ici avec `""` est impossible — et si ça le
    // devenait, ce serait un rejet, pas un haussement d'épaules.
    if (id === "") {
      rejet("unreadable", "preparation_without_id");
      return intact();
    }
    if (potsVus.has(id)) {
      rejet("duplicate_preparation", id);
      return intact();
    }
    potsVus.add(id);
    if (potsExistants.has(id)) {
      if (!potsAutorises.has(id)) {
        rejet("preparation_out_of_scope", id);
        return intact();
      }
      // ⛔ UN REMPLACEMENT ANNONCÉ ET NON PARSÉ ÉTAIT SAUTÉ À L'APPLICATION
      // (revue P2 §4). Le patch se disait appliqué et l'ancienne recette
      // restait : « le modèle a réparé » et « rien n'a changé » rendaient la
      // même trace.
      if (!args.preparations.has(id)) {
        rejet("preparation_not_parsed", id);
        return intact();
      }
      remplacees.push(id);
      continue;
    }
    // ⛔ UNE CRÉATION DOIT ÊTRE PARSÉE. Une préparation que le moteur du plan a
    // refusée (identifiant illisible, ingrédients sans poids) n'existe pas :
    // l'accepter ici ferait pointer une unité sur du vide.
    if (!args.preparations.has(id)) {
      rejet("uses_unknown_preparation", id);
      return intact();
    }
    creees.push(id);
  }
  for (const id of creees) {
    if (potsExistants.has(id)) {
      rejet("preparation_id_collision", id);
      return intact();
    }
  }

  const potsApresPatch = new Set([...potsExistants, ...creees]);

  // ── LES UNITÉS ──────────────────────────────────────────────────────────
  const vues = new Set<string>();
  const aAppliquer: {
    unitId: string;
    dish: RepairPlanDish;
    dishIndex: number | null;
  }[] = [];
  for (const u of args.envelope.units) {
    if (vues.has(u.unitId)) {
      rejet("duplicate_unit", u.unitId);
      return intact();
    }
    vues.add(u.unitId);
    const unite = args.index.byId.get(u.unitId) ?? null;
    if (unite === null) {
      rejet("unknown_unit", u.unitId);
      return intact();
    }
    if (!autorisees.has(u.unitId)) {
      rejet("out_of_scope_unit", u.unitId);
      return intact();
    }
    const plat = args.dishes.get(u.unitId) ?? null;
    if (plat === null) {
      // ⛔ UNE UNITÉ RENDUE QUE LE MOTEUR N'A PAS SU LIRE REJETTE LE PATCH.
      //
      // ⚠️ ET C'EST UN CHANGEMENT DU LOT 2. Sur une unité existante, on
      // CONTINUAIT : « le modèle a omis cette unité » et « il l'a rendue
      // illisible » se relisaient pareil. Le plan tranche : « Ne pas
      // interpréter une opération rejetée par le parseur comme une omission
      // volontaire du modèle. » Omettre reste gratuit ; rendre du vide, non.
      rejet(
        aCreer.has(u.unitId) ? "unit_without_content" : "unit_not_parsed",
        u.unitId,
      );
      return intact();
    }
    // ── LE GRAPHE DES `uses` — VALIDÉ, PLUS REFUSÉ EN BLOC ────────────────
    const avant = unite.dishIndex === null
      ? []
      : usesOf(args.best.dishes[unite.dishIndex]);
    for (const id of usesOf(plat)) {
      if (!potsApresPatch.has(id)) {
        rejet("uses_unknown_preparation", id);
        return intact();
      }
      // ⛔ UNE UNITÉ PEUT POINTER : sur une casserole qu'elle tirait déjà, sur
      // une casserole du périmètre, ou sur une casserole DÉCLARÉE DANS CE
      // PATCH. Tout le reste recollerait sa recette sur la casserole de
      // quelqu'un d'autre — `uses_mismatch`, la cicatrice du lot B.
      if (
        !avant.includes(id) && !potsAutorises.has(id) && !creees.includes(id)
      ) {
        rejet("uses_out_of_scope", id);
        return intact();
      }
    }
    aAppliquer.push({
      unitId: u.unitId,
      dish: plat,
      dishIndex: unite.dishIndex,
    });
  }

  // ⛔ UNE CASSEROLE NEUVE QUE PERSONNE NE TIRE EST UN LOT ORPHELIN. La laisser
  // ferait cuisiner pour rien, et le contrôle de session la refuserait plus
  // bas sous un autre nom.
  const tirees = new Set<string>();
  for (const a of aAppliquer) for (const id of usesOf(a.dish)) tirees.add(id);
  for (const id of creees) {
    if (!tirees.has(id)) {
      rejet("new_preparation_unused", id);
      return intact();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · §2.1 — LE LOT NEUF ENTRE DANS LA SESSION DE SON JOUR
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ ON RÉSOUT AVANT D'APPLIQUER, comme tout le reste de ce module. Un
  // rattachement décidé pendant l'écriture laisserait un demi-patch quand le
  // jour ne correspond à aucune session — et un demi-patch est la seule façon
  // d'obtenir un plan que personne n'a mesuré.
  //
  // ⚠️ LA SESSION N'A PAS BESOIN D'ÊTRE DANS LE PÉRIMÈTRE. Le périmètre des
  // sessions ouvre un TEXTE à réécrire ; ici on ne touche ni au texte, ni au
  // jour, ni aux durées : on ajoute la casserole que le patch vient de créer à
  // la liste de celle qui la cuisine déjà de fait. Exiger le périmètre
  // rendrait l'isolement impossible dès qu'aucun déroulé n'est en défaut,
  // c'est-à-dire dans le cas nominal.
  const sessionDuLotNeuf = new Map<string, number>();
  for (const id of creees) {
    const venue = args.preparations.get(id) ?? null;
    const brut = (venue ?? {}) as {
      cookOn?: string | null;
      cook_on?: string | null;
    };
    const jour = String(brut.cookOn ?? brut.cook_on ?? "").trim();
    if (jour === "") {
      rejet("new_preparation_unscheduled", id);
      return intact();
    }
    const i = (args.best.cooking_sessions ?? []).findIndex((s) =>
      String(s?.day ?? "").trim() === jour
    );
    if (i === -1) {
      rejet("new_preparation_unscheduled", id);
      return intact();
    }
    sessionDuLotNeuf.set(id, i);
  }

  // ── ⟳ LOT 2 — LES DÉROULÉS DE SESSION ───────────────────────────────────
  const sessionsAutorisees = new Set(args.scope.sessionIds);
  const sessionsVues = new Set<string>();
  const deroules: { sessionIndex: number; sessionId: string; runThrough: string }[] =
    [];
  for (const x of args.envelope.sessions) {
    if (sessionsVues.has(x.sessionId)) {
      rejet("duplicate_session", x.sessionId);
      return intact();
    }
    sessionsVues.add(x.sessionId);
    const connue = args.sessions.byId.get(x.sessionId) ?? null;
    if (connue === null) {
      rejet("unknown_session", x.sessionId);
      return intact();
    }
    if (!sessionsAutorisees.has(x.sessionId)) {
      rejet("out_of_scope_session", x.sessionId);
      return intact();
    }
    deroules.push({
      sessionIndex: connue.sessionIndex,
      sessionId: x.sessionId,
      runThrough: x.runThrough,
    });
  }

  if (
    aAppliquer.length === 0 && remplacees.length === 0 && deroules.length === 0
  ) {
    rejet("nothing_applied");
    return intact();
  }

  // ── L'APPLICATION ───────────────────────────────────────────────────────
  const plan = args.clone(args.best);
  const dishes = plan.dishes as RepairPlanDish[];
  const preps = plan.preparations as RepairPlanPreparation[];
  const posees: string[] = [];
  const crees: string[] = [];

  for (const p of [...remplacees, ...creees]) {
    const venue = args.preparations.get(p);
    if (venue === undefined) continue;
    const i = preps.findIndex((x) => x.id === p);
    if (i === -1) preps.push(venue);
    else preps[i] = venue;
  }

  for (const a of aAppliquer) {
    if (a.dishIndex === null) {
      dishes.push(a.dish);
      crees.push(a.unitId);
    } else {
      dishes[a.dishIndex] = a.dish;
    }
    posees.push(a.unitId);
  }

  // ── ⟳ LOT 2 — LE DÉROULÉ, ET RIEN D'AUTRE ───────────────────────────────
  //
  // ⛔ ON ÉCRIT UNE SEULE CLÉ. Le jour, les casseroles et les durées de la
  // session restent celles du plan : c'est ce qui rend « un patch de texte ne
  // déplace pas une cuisson » vrai par construction plutôt que par consigne.
  const sessionsReecrites: string[] = [];
  const sessionsPlan = plan.cooking_sessions as RepairPlanSession[];
  for (const d of deroules) {
    const avant = sessionsPlan[d.sessionIndex] ?? null;
    if (avant === null) continue;
    sessionsPlan[d.sessionIndex] = { ...avant, runThrough: d.runThrough };
    sessionsReecrites.push(d.sessionId);
  }

  // ── LE NETTOYAGE DES DÉPENDANCES ────────────────────────────────────────
  //
  // ⛔ ON NE RETIRE QU'UN LOT DEVENU SANS CONSOMMATEUR, ET SEULEMENT SI CE
  // PATCH EN EST LA CAUSE. Retirer un lot encore référencé casserait une
  // assiette qu'on n'a pas mesurée ; retirer un orphelin d'avant le patch
  // ferait faire à la réparation le ménage de quelqu'un d'autre.
  const tireesApres = new Set<string>();
  for (const d of dishes) for (const id of usesOf(d)) tireesApres.add(id);
  const tireesAvant = new Set<string>();
  for (const d of args.best.dishes) for (const id of usesOf(d)) tireesAvant.add(id);
  const retirees: string[] = [];
  for (let i = preps.length - 1; i >= 0; i--) {
    const id = preps[i].id;
    if (tireesApres.has(id) || !tireesAvant.has(id)) continue;
    preps.splice(i, 1);
    retirees.push(id);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · §2.1 — LES RÉFÉRENCES DE SESSION SUIVENT LES CASSEROLES
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ DEUX MOUVEMENTS, ET LES DEUX SONT DÉRIVÉS — jamais lus dans la réponse
  // du modèle :
  //   · le lot NEUF entre dans la session de son jour (sinon
  //     `preparation_without_session`, une cause que rien ne répare) ;
  //   · le lot RETIRÉ sort de toutes les sessions qui le citaient (sinon
  //     `session_cites_unknown`, une cause que rien ne répare non plus).
  //
  // ⚠️ NI LE JOUR NI LE DÉROULÉ NE BOUGENT ICI. Un patch ne déplace pas une
  // cuisson : on ne touche qu'à la LISTE.
  const rattaches: { preparationId: string; sessionId: string }[] = [];
  const sessionsRemaniees: string[] = [];
  {
    const partis = new Set(retirees);
    const ajoutParSession = new Map<number, string[]>();
    for (const [id, i] of sessionDuLotNeuf) {
      ajoutParSession.set(i, [...(ajoutParSession.get(i) ?? []), id]);
    }
    for (let i = 0; i < sessionsPlan.length; i++) {
      const ligne = sessionsPlan[i];
      if (ligne === undefined || ligne === null) continue;
      const avant = (ligne.preparationIds ?? []).map((x) => String(x ?? ""));
      const gardees = partis.size === 0
        ? avant
        : avant.filter((id) => !partis.has(id));
      const ajouts = (ajoutParSession.get(i) ?? []).filter((id) =>
        !gardees.includes(id)
      );
      if (gardees.length === avant.length && ajouts.length === 0) continue;
      sessionsPlan[i] = { ...ligne, preparationIds: [...gardees, ...ajouts] };
      const jeton = args.sessions.byIndex.get(i) ?? "";
      for (const id of ajouts) {
        rattaches.push({ preparationId: id, sessionId: jeton });
      }
      sessionsRemaniees.push(jeton);
    }
  }

  return {
    applied: true,
    plan,
    units: posees,
    created: crees,
    preparationsReplaced: remplacees,
    preparationsCreated: creees,
    preparationsDropped: retirees.sort(),
    sessionsRewritten: sessionsReecrites,
    preparationsScheduled: rattaches,
    sessionsRetooled: sessionsRemaniees,
    rejections,
    untouched: args.scope.unitIds.filter((id) => !posees.includes(id)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE CONTRAT ÉCRIT — CE QU'ON DEMANDE, EN TOUTES LETTRES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA CONSIGNE DE SORTIE D'UN PATCH.
 *
 * ⛔ ELLE REMPLACE « RENDS TOUT LE PLAN JSON ». Les deux ne peuvent pas
 * coexister : une consigne qui demande le plan entier fait réécrire le plan
 * entier, ce qui est très exactement le comportement qu'on corrige.
 *
 * ⛔ ET ELLE NOMME L'ÉCHAPPATOIRE. Ce dépôt a mesuré qu'une consigne dont
 * l'échappatoire n'est pas nommée se fait satisfaire par elle : « un tableau
 * absent veut dire inchangé » est donc écrit, sinon un modèle prudent rendrait
 * des tableaux vides pour « ne rien changer », et vider est le contraire.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export const REPAIR_PATCH_SCHEMA_LINES: readonly string[] = [
  "== WHAT YOU MUST ANSWER ==",
  "Answer with JSON, and with THIS shape only — not a whole plan:",
  "",
  '{"repair":{"base_version":"<the version the app gave you>",',
  '  "units":[{"unit_id":"…","title":"…","name":"…","ingredients":[<see below>],',
  '            "method":"…","why":"…","same_day":{"kind":"…","minutes":0},',
  '            "uses":[{"preparation_id":"…","servings":1}]}],',
  '  "preparations":[{"id":"…","title":"…","servings_made":2,',
  '                   "ingredients":[<see below>],',
  '                   "method":"…","active_minutes":10,"total_minutes":40,',
  '                   "cook_on":"sun"}],',
  '  "sessions":[{"session_id":"…","run_through":"…"}]}}',
  "",
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 3 — LA FORME D'UN INGRÉDIENT, ÉCRITE ICI
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT, MESURÉ SUR UN APPEL RÉELLEMENT PAYÉ (2026-09-13). Ce schéma
  // écrivait `"ingredients":[…]` et s'arrêtait là. Sa seule règle sur une ligne
  // d'ingrédient était « tout ingrédient qui porte un poids porte son ref » —
  // elle dit quoi faire SI il y a un poids, elle n'a jamais dit qu'il en
  // fallait un.
  //
  // Le second patch réel d'un foyer de quatre est revenu avec **8 recettes sur
  // 12 sans quantité** : `missing_quantity: 8`, `unmeasurable: 16` sur 24
  // portions, candidate rejetée, deux appels payés pour rien. Le modèle n'a pas
  // désobéi — on ne lui avait pas demandé.
  //
  // ⛔ LES MÊMES MOTS QUE LE BRIEF INITIAL, PAS UN SECOND VOCABULAIRE. C'est la
  // cicatrice `promise-and-schema-key-must-be-adjacent` de ce dépôt : une
  // promesse et la clé de schéma qui la porte doivent se toucher, et un
  // « comme plus haut » ne traverse pas la frontière système↔utilisateur.
  '  Every "ingredients" entry, in a unit as in a preparation:',
  '  { "term":"one food, never a choice between two",',
  '    "quantity":"the phrase a person reads", "amount":<number>|null,',
  '    "unit":"g"|"ml"|"unit"|"tbsp"|"tsp"|null,',
  '    "state":"raw"|"cooked"|null, "ref":"<id from the food list>",',
  '    "part":"<id from this recipe\'s components>" }',
  '⛔ EVERY INGREDIENT ALWAYS CARRIES "amount" AND "unit". Salt, black pepper',
  "   and herbs may stay a pinch; nothing else may. A recipe that comes back",
  "   without its numbers cannot be weighed for anybody, and the whole answer",
  "   is thrown away.",
  '⛔ "state" is REQUIRED for anything that takes on or loses water in the pan —',
  "   rice, pasta, couscous, lentils, beans, meat, poultry, fish, and every",
  '   cooked vegetable. Say "raw" for everything eaten as it is.',
  "",
  "⛔ This is the ONLY shape you may answer with. There is no other schema in",
  "   this task: do not return dishes[], preparations[] or cooking_sessions[]",
  "   at the top level, and do not return a plan.",
  "⛔ A unit you leave out stays exactly as it is. An array you leave out means",
  "   UNCHANGED — it never means empty.",
  "⛔ But an entry you DO write must be complete and readable. One broken entry",
  "   throws the whole answer away, and the plan stays as it was.",
  "⛔ Do NOT write day, slot or member in a unit: the app already knows where",
  "   each unit_id sits, and a repair does not move a meal.",
  '⛔ "sessions" replaces a cooking run-through TEXT and nothing else: not its',
  "   day, not which preparations it cooks, not its minutes. Never create or",
  "   remove a session there.",
  '⛔ A preparation you send back keeps its "cook_on": the day it is cooked',
  "   does not move, and the app puts the plan's day back anyway. A NEW",
  '   preparation carries a "cook_on" that an existing cooking session covers.',
  "⛔ Do not send a shopping list: the app builds it from your ingredients.",
  '⛔ Every ingredient that carries a weight carries its "ref" from the food',
  "   list, spelled exactly as listed.",
];

/**
 * LES IDENTIFIANTS AUTORISÉS — LA MOITIÉ QUI CHANGE À CHAQUE APPEL.
 *
 * ⛔ SÉPARÉE DU SCHÉMA, ET C'EST LE LOT 2. Le schéma est une règle de FORME :
 * il vit dans le message SYSTÈME de réparation, avec les autres règles de
 * forme, et il y est le SEUL schéma. Les identifiants, eux, dépendent de la
 * demande : ils vivent dans le message utilisateur, à côté du plan projeté.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairPatchScopeLines(args: {
  readonly baseVersion: string;
  readonly scope: RepairScope;
}): readonly string[] {
  const aCreer = args.scope.createUnitIds;
  const aChanger = args.scope.unitIds.filter((id) => !aCreer.includes(id));
  const sessions = args.scope.sessionIds;
  return [
    "== WHAT THIS ANSWER MAY TOUCH ==",
    `⛔ Write "base_version":"${args.baseVersion}" exactly. An answer without it`,
    "   is thrown away.",
    aChanger.length > 0
      ? `⛔ "units" carries ONLY these unit_ids, the ones to change: ${
        aChanger.join(", ")
      }.`
      : '⛔ There is no meal to change in this answer: leave "units" out.',
    ...(aCreer.length > 0
      ? [
        `⛔ And these unit_ids, which do not exist yet and must be written from`,
        `   nothing: ${aCreer.join(", ")}.`,
      ]
      : []),
    ...(sessions.length > 0
      ? [
        `⛔ "sessions" carries ONLY these session_ids: ${sessions.join(", ")}.`,
      ]
      : ['⛔ There is no cooking run-through to rewrite: leave "sessions" out.']),
    "⛔ Any other unit_id or session_id is refused and the whole answer is",
    "   thrown away.",
  ];
}

/**
 * LA CONSIGNE DE SORTIE D'UN PATCH — SCHÉMA PUIS PÉRIMÈTRE.
 *
 * ⛔ ELLE REMPLACE « RENDS TOUT LE PLAN JSON ». Les deux ne peuvent pas
 * coexister : une consigne qui demande le plan entier fait réécrire le plan
 * entier, ce qui est très exactement le comportement qu'on corrige.
 *
 * ⛔ ET ELLE NOMME L'ÉCHAPPATOIRE. Ce dépôt a mesuré qu'une consigne dont
 * l'échappatoire n'est pas nommée se fait satisfaire par elle : « un tableau
 * absent veut dire inchangé » est donc écrit, sinon un modèle prudent rendrait
 * des tableaux vides pour « ne rien changer », et vider est le contraire.
 *
 * ⚠️ GARDÉE POUR LES APPELANTS QUI N'ONT QU'UN MESSAGE. Le handler, lui, pose
 * le schéma dans le SYSTÈME et le périmètre dans l'UTILISATEUR.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairPatchContractLines(args: {
  readonly baseVersion: string;
  readonly scope: RepairScope;
}): readonly string[] {
  return [...REPAIR_PATCH_SCHEMA_LINES, "", ...repairPatchScopeLines(args)];
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE PONT VERS LE MOTEUR DU PLAN — ON NE RELIT PAS UNE RECETTE ICI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES CHARGES UTILES D'UN PATCH, PRÊTES POUR `parseGeneratedMeal`.
 *
 * ⛔ L'IDENTITÉ EST INJECTÉE, PAS LUE. `day`, `slot` et `for_member_id`
 * viennent de la TABLE DES UNITÉS ; ce que le modèle en aurait écrit est
 * écrasé. C'est ce qui rend « un patch ne déplace pas un repas » vrai par
 * construction plutôt que par consigne — et ce dépôt a écrit ce que vaut une
 * consigne : « une consigne de prompt régresse. Le verrou, lui, se vérifie. »
 *
 * ⛔ ET L'ADRESSE DE RETOUR DOIT ÊTRE UNIQUE. Le plat parsé revient identifié
 * par `jour|moment|propriétaire` : deux unités du même patch qui rendraient la
 * même clé seraient indiscernables, et c'est exactement le défaut ② de la
 * revue (deux plats dédiés au même créneau fusionnés en un). On refuse, on ne
 * devine pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function patchDishPayloads(args: {
  readonly envelope: RepairPatchEnvelope;
  readonly index: RepairUnitIndex;
}): {
  /**
   * ⛔ CHAQUE CHARGE PORTE SON `unit_id`, ET C'EST NÉCESSAIRE. L'appelant parse
   * les unités UNE PAR UNE — le parseur du plan applique un PLAFOND DE PLATS
   * dérivé du rythme de la semaine, et un patch de huit unités s'y faisait
   * amputer de deux en silence. Sans cette paire, il faudrait retrouver l'unité
   * par son adresse APRÈS coup, ce qui rouvrirait l'ambiguïté qu'on vient de
   * fermer.
   */
  readonly payloads: readonly {
    readonly unitId: string;
    readonly payload: Record<string, unknown>;
  }[];
  /** `jour|moment|propriétaire` → `unit_id`. La clé de retour du parseur. */
  readonly addressToUnit: ReadonlyMap<string, string>;
  /** Les unités écartées avant même le parseur, avec leur raison. */
  readonly dropped: readonly { readonly unitId: string; readonly why: string }[];
} {
  const payloads: { unitId: string; payload: Record<string, unknown> }[] = [];
  const addressToUnit = new Map<string, string>();
  const dropped: { unitId: string; why: string }[] = [];
  for (const u of args.envelope.units) {
    const unite = args.index.byId.get(u.unitId) ?? null;
    if (unite === null) {
      dropped.push({ unitId: u.unitId, why: "unknown_unit" });
      continue;
    }
    const cle = `${unite.dayToken}|${unite.slot}|${unite.ownerId ?? ""}`;
    if (addressToUnit.has(cle)) {
      dropped.push({ unitId: u.unitId, why: "ambiguous_address" });
      continue;
    }
    addressToUnit.set(cle, u.unitId);
    const charge: Record<string, unknown> = { ...u.payload };
    delete charge.unit_id;
    delete charge.unitId;
    charge.day = unite.dayToken === "" ? null : unite.dayToken;
    charge.slot = unite.slot;
    // ⚠️ UN PLAT DE LA MAISON N'A PAS DE PROPRIÉTAIRE, et lui en donner un le
    // transformerait en plat dédié — donc retirerait sa part à tous les autres.
    if (unite.ownerId !== null) charge.for_member_id = unite.ownerId;
    else delete charge.for_member_id;
    payloads.push({ unitId: u.unitId, payload: charge });
  }
  return { payloads, addressToUnit, dropped };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-13 · LOT 3 §3.3 — LE JOUR DE CUISSON EST RÉINJECTÉ, PAS DEMANDÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT, MESURÉ SUR LE PREMIER PARCOURS HYBRIDE PAYANT (2026-09-13). Le
 * modèle a rendu un patch PARFAITEMENT conforme : racine `{"repair":…}`,
 * `base_version` échoé, sept unités complètes, une préparation avec `id`,
 * `title`, `servings_made`, `ingredients`, `method`, `active_minutes`,
 * `total_minutes`, `components` — et **sans `cook_on`**, parce que le schéma de
 * patch ne le nommait pas. La casserole a donc perdu son jour de cuisson :
 * `cook_day_unplaced: 6`, `session_day_mismatch: 3`, `cell_without_portion: 6`,
 * candidate rejetée. Le modèle avait obéi ; c'est la consigne qui avait tort.
 *
 * ⛔ ET LA CONSIGNE NE SUFFIT PAS. Ce dépôt a écrit ce que vaut une consigne de
 * prompt : « elle régresse. Le verrou, lui, se vérifie. » Le schéma nomme
 * désormais `cook_on` — ET le jour d'une casserole DÉJÀ AU PLAN est remis par
 * le serveur, exactement comme le jour, le moment et le propriétaire d'une
 * unité. Un patch ne déplace pas une cuisson, par construction.
 *
 * ⚠️ UNE CASSEROLE NEUVE GARDE LE SIEN : elle n'existe dans aucun plan, donc
 * il n'y a rien à remettre. C'est au graphe (`new_preparation_unused`) et à la
 * garde finale de dire si elle tient dans une session.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function patchPreparationPayloads(args: {
  readonly envelope: RepairPatchEnvelope;
  /** Les casseroles du plan sur lequel le patch s'applique. */
  readonly preparations: readonly RepairPlanPreparation[];
}): {
  readonly payloads: readonly Record<string, unknown>[];
  readonly counts: {
    readonly declared: number;
    /** Les casseroles dont le jour a été REMIS par le serveur. */
    readonly cook_on_restored: number;
    /** Celles que le modèle a rendues sans jour ET qui en avaient un. */
    readonly cook_on_missing: number;
    /** Les casseroles neuves : rien à remettre. */
    readonly created: number;
  };
} {
  const jourDe = new Map<string, string | null>();
  for (const p of args.preparations) {
    const brut = (p as { cookOn?: string | null; cook_on?: string | null });
    const jour = brut.cookOn ?? brut.cook_on ?? null;
    jourDe.set(p.id, jour === null || String(jour).trim() === "" ? null : String(jour));
  }
  let restored = 0;
  let missing = 0;
  let created = 0;
  const payloads = args.envelope.preparations.map((brut) => {
    const id = String(brut.id ?? "").trim();
    if (!jourDe.has(id)) {
      created++;
      return { ...brut };
    }
    const jour = jourDe.get(id) ?? null;
    const rendu = brut.cook_on ?? brut.cookOn ?? null;
    if (rendu === null || String(rendu).trim() === "") missing++;
    if (jour === null) return { ...brut };
    restored++;
    return { ...brut, cook_on: jour };
  });
  return {
    payloads,
    counts: {
      declared: args.envelope.preparations.length,
      cook_on_restored: restored,
      cook_on_missing: missing,
      created,
    },
  };
}

/**
 * DES PRÉPARATIONS EXISTANTES, EN FORME BRUTE, POUR QUE LES `uses` RÉSOLVENT.
 *
 * ⛔ POURQUOI ELLES SONT NÉCESSAIRES. `parseGeneratedMeal` jette un `uses` qui
 * pointe une préparation absente de la charge (`unknown preparation, dropped`).
 * Un patch qui répare un plat SANS toucher à sa casserole ne redéclare pas
 * cette casserole — elle serait donc perdue, et le plat réparé arriverait
 * détaché de son lot.
 *
 * ⚠️ CE SONT DES TALONS, ET ILS NE SONT JAMAIS APPLIQUÉS. `applyRepairPatch`
 * ne pose que les préparations DÉCLARÉES dans l'enveloppe ; celles-ci ne
 * servent qu'à garder l'identifiant vivant pendant la lecture. Leur perte de
 * fidélité (méthode, minutes, composants) est donc sans effet — et elle est
 * dite ici pour que personne ne les prenne un jour pour la vraie recette.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function preparationStubsFor(args: {
  readonly preparations: readonly RepairPlanPreparation[];
  /** Les identifiants que l'enveloppe redéclare : eux passent en vrai. */
  readonly declaredIds: readonly string[];
}): Record<string, unknown>[] {
  const declares = new Set(args.declaredIds);
  return args.preparations
    .filter((p) => !declares.has(p.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      // ⛔ AU MOINS UNE PART. Le moteur jette une casserole dont
      // `servings_made` est illisible ou nul — et le talon disparaîtrait avec.
      servings_made: p.servingsMade === undefined || p.servingsMade === null ||
          !Number.isFinite(p.servingsMade)
        ? 1
        : Math.max(1, Math.round(p.servingsMade)),
      ingredients: (p.ingredients ?? []).map((g) => ({
        term: g.term,
        ref: g.ref ?? null,
        amount: g.amount ?? null,
        unit: g.unit ?? null,
        state: g.state ?? null,
      })),
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LE TEXTE SOURCE FUSIONNÉ — UNE SEULE VERSION, POUR TOUS SES LECTEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE TEXTE SOURCE DU PLAN **FUSIONNÉ**, PAS CELUI DU PATCH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CETTE FONCTION FERME, ET LA REVUE LE NOMME. Après la
 * fusion, `mealSourceText` devenait la réponse BRUTE de la candidate.
 * `extractMemberPortions`, `extractExplanation` et `countWhyRuleAttributions`
 * relisaient donc un texte qui décrit des objets que la fusion venait de
 * REJETER : le plan structuré disait une chose, les parts et la prose une
 * autre. Le plan de fermeture l'exige : « plan, portions et explications
 * issus d'une même version ».
 *
 * ⛔ ET LE TEXTE DU PATCH NE PEUT PAS SERVIR NON PLUS : il ne contient que
 * deux plats. Le donner aux lecteurs ferait disparaître les sept autres.
 *
 * CE QU'ON FAIT: on part du texte du MEILLEUR plan, et on y remplace
 * chirurgicalement les objets que le patch a réellement posés.
 *
 * ⚠️ CE QU'ON NE FAIT PAS, ET C'EST UNE DÉCISION. On ne redemande PAS
 * l'`explanation` du plan. Le `why` de chaque plat voyage avec le patch — donc
 * la prose qui décrit une assiette réparée est à jour. L'`explanation` décrit
 * la LOGIQUE de la semaine ; la faire réécrire pour une correction locale
 * ferait réécrire le plan entier, c'est-à-dire très exactement ce que le lot
 * ferme.
 *
 * ⚠️ LES PARTS DES BOUCHES TOUCHÉES SONT RETIRÉES, PAS RÉÉCRITES. Une
 * `portion_note` est une phrase lue à table (« 230 g de poulet quinoa ») :
 * gardée au-dessus d'un plat remplacé, elle contredit le couvercle — la
 * cicatrice `portion-note-contradicts-the-lid`. `reconcilePortions` sait
 * réattribuer une part standard à une bouche sans note, et il le DIT.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function fusedSourceText(args: {
  /** Le texte JSON du meilleur plan. */
  readonly bestText: string;
  readonly envelope: RepairPatchEnvelope;
  readonly index: RepairUnitIndex;
  /** Les unités réellement posées par `applyRepairPatch`. */
  readonly appliedUnitIds: readonly string[];
  /** Les préparations réellement posées. */
  readonly appliedPreparationIds: readonly string[];
  readonly droppedPreparationIds: readonly string[];
  /** ⟳ LOT 2 — la table des sessions, pour retrouver l'index d'un `S1`. */
  readonly sessions: RepairSessionIndex;
  /** ⟳ LOT 2 — les sessions réellement réécrites par `applyRepairPatch`. */
  readonly rewrittenSessionIds: readonly string[];
  /**
   * ⟳ 2026-09-13 · §2.1 — LES LOTS NEUFS ET LEUR SESSION, TELS QUE
   * `applyRepairPatch` LES A RATTACHÉS.
   *
   * ⛔ REQUIS, `[]` POUR « AUCUN ». Le plan structuré et son texte source
   * doivent porter la MÊME liste de casseroles par session : sans ce champ, la
   * garde finale voit le lot neuf cuisiné et l'aperçu servi au front ne le voit
   * pas. Optionnel, un appelant qui l'oublie rendrait deux vérités.
   */
  readonly scheduledPreparations: readonly {
    readonly preparationId: string;
    readonly sessionId: string;
  }[];
}): {
  readonly text: string;
  readonly counts: {
    readonly dishes_replaced: number;
    readonly dishes_added: number;
    readonly preparations_written: number;
    readonly preparations_removed: number;
    readonly portions_dropped: number;
    /** ⟳ LOT 2 — les déroulés réécrits DANS LE TEXTE SOURCE. */
    readonly sessions_rewritten: number;
    /** ⟳ §2.1 — les sessions dont la LISTE de casseroles a changé dans le texte. */
    readonly sessions_retooled: number;
    /** ⛔ `true` = le texte de départ n'était pas du JSON : on l'a laissé tel quel. */
    readonly unreadable: boolean;
  };
} {
  const vide = (unreadable: boolean) => ({
    text: args.bestText,
    counts: {
      dishes_replaced: 0,
      dishes_added: 0,
      preparations_written: 0,
      preparations_removed: 0,
      portions_dropped: 0,
      sessions_rewritten: 0,
      sessions_retooled: 0,
      unreadable,
    },
  });
  let racine: Record<string, unknown>;
  try {
    const debut = args.bestText.indexOf("{");
    const fin = args.bestText.lastIndexOf("}");
    if (debut < 0 || fin <= debut) return vide(true);
    const lu = JSON.parse(args.bestText.slice(debut, fin + 1));
    if (lu === null || typeof lu !== "object" || Array.isArray(lu)) {
      return vide(true);
    }
    racine = lu as Record<string, unknown>;
  } catch {
    return vide(true);
  }

  const poses = new Set(args.appliedUnitIds);
  const chargeParUnite = new Map(
    args.envelope.units.map((u) => [u.unitId, u.payload]),
  );
  const dishes = Array.isArray(racine.dishes) ? [...racine.dishes] : [];
  const adresse = (d: unknown): string => {
    const r = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    return `${String(r.day ?? "")}|${String(r.slot ?? "")}|${
      String(r.for_member_id ?? r.forMemberId ?? "")
    }`;
  };
  let remplaces = 0;
  let ajoutes = 0;
  const bouchesTouchees = new Set<string>();
  for (const unitId of poses) {
    const unite = args.index.byId.get(unitId) ?? null;
    const charge = chargeParUnite.get(unitId) ?? null;
    if (unite === null || charge === null) continue;
    for (const m of unite.eaters) bouchesTouchees.add(m);
    const entree: Record<string, unknown> = { ...charge };
    delete entree.unit_id;
    delete entree.unitId;
    entree.day = unite.dayToken === "" ? null : unite.dayToken;
    entree.slot = unite.slot;
    if (unite.ownerId !== null) entree.for_member_id = unite.ownerId;
    else delete entree.for_member_id;
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-13 · §2.2 — UNE UNITÉ **CRÉÉE** S'AJOUTE, ELLE NE REMPLACE
    //                JAMAIS
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT FERMÉ, ET IL A ÉTÉ REPRODUIT DE BOUT EN BOUT (tir `iso7`,
    // 2026-09-13). Un COMPLÉMENT porte, par définition, la MÊME adresse que
    // l'assiette qu'il complète : même bouche, même jour, même moment. La
    // recherche par adresse trouvait donc toujours l'assiette existante, et
    // `dishes[i] = entree` la REMPLAÇAIT par le petit plat.
    //
    // ⛔ ET LES DEUX MOITIÉS DE LA FUSION SE CONTREDISAIENT. `applyRepairPatch`
    // POUSSE une unité créée (`a.dishIndex === null ⇒ dishes.push`) : le plan
    // structuré portait 14 plats, la source canonique 12 — et c'est elle que
    // relisent les parts, la prose et l'aperçu. Mesuré : `dishes_added: 0,
    // dishes_replaced: 2`, la bouche perdait son déjeuner, et la candidate
    // tombait sur `mouth_unfed`, `cell_energy_off`, `day_energy_off` et
    // `protein_floor_short` — 38 défauts pour 6.
    //
    // ⚠️ LA CONDITION EST CELLE DE L'AUTRE MOITIÉ, PAS UNE SECONDE IDÉE :
    // `dishIndex === null` est très exactement ce que `applyRepairPatch`
    // regarde pour pousser plutôt que remplacer. Les deux ne peuvent plus
    // diverger sans que le compilateur ou un test le dise.
    const cle = `${unite.dayToken}|${unite.slot}|${unite.ownerId ?? ""}`;
    const i = unite.dishIndex === null
      ? -1
      : dishes.findIndex((d) => adresse(d) === cle);
    if (i === -1) {
      dishes.push(entree);
      ajoutes++;
    } else {
      dishes[i] = entree;
      remplaces++;
    }
  }
  racine.dishes = dishes;

  // ── LES PRÉPARATIONS ────────────────────────────────────────────────────
  const poseesPots = new Set(args.appliedPreparationIds);
  const retirees = new Set(args.droppedPreparationIds);
  const pots = Array.isArray(racine.preparations) ? [...racine.preparations] : [];
  let ecrites = 0;
  for (const brut of args.envelope.preparations) {
    const id = String(brut.id ?? "").trim();
    if (id === "" || !poseesPots.has(id)) continue;
    const i = pots.findIndex((p) =>
      String((p as Record<string, unknown>)?.id ?? "") === id
    );
    if (i === -1) pots.push(brut);
    else pots[i] = brut;
    ecrites++;
  }
  const restantes = pots.filter((p) =>
    !retirees.has(String((p as Record<string, unknown>)?.id ?? ""))
  );
  const supprimees = pots.length - restantes.length;
  racine.preparations = restantes;

  // ── ⟳ LOT 2 — LES DÉROULÉS RÉÉCRITS ─────────────────────────────────────
  //
  // ⛔ SANS CE BLOC, LA CORRECTION DE TEXTE NE SURVIVAIT PAS À LA FUSION. Le
  // plan structuré portait le nouveau déroulé ; `mealSourceText` — que
  // `extractMemberPortions`, `extractExplanation` et la ceinture finale
  // relisent — portait encore l'ancien. Le plan l'exige : « le déroulé corrigé
  // doit se retrouver dans le plan fusionné, sa source canonique, l'aperçu et
  // les lecteurs API/UI ».
  let deroulesEcrits = 0;
  const reecrites = new Set(args.rewrittenSessionIds);
  if (reecrites.size > 0 && Array.isArray(racine.cooking_sessions)) {
    const sessionsTexte = [...racine.cooking_sessions];
    for (const x of args.sessions.sessions) {
      if (!reecrites.has(x.sessionId)) continue;
      const ligne = sessionsTexte[x.sessionIndex];
      if (ligne === undefined || ligne === null || typeof ligne !== "object") {
        continue;
      }
      const neuf = args.envelope.sessions.find((e) =>
        e.sessionId === x.sessionId
      ) ?? null;
      if (neuf === null) continue;
      sessionsTexte[x.sessionIndex] = {
        ...(ligne as Record<string, unknown>),
        run_through: neuf.runThrough,
      };
      deroulesEcrits++;
    }
    racine.cooking_sessions = sessionsTexte;
  }

  // ── ⟳ 2026-09-13 · §2.1 — LES LISTES DE CASSEROLES PAR SESSION ──────────
  //
  // ⛔ LE MÊME MOUVEMENT QUE DANS LE PLAN STRUCTURÉ, ET IL DOIT ÊTRE LE MÊME.
  // `applyRepairPatch` a rattaché le lot neuf à la session de son jour et a
  // retiré des sessions les lots devenus sans consommateur : si le TEXTE ne
  // suit pas, la garde finale (qui lit le plan structuré) et l'aperçu servi au
  // front (qui lit ce texte) décrivent deux dimanches différents.
  //
  // ⚠️ LA CLÉ EST `preparation_ids`, la graphie du plan public — jamais
  // `preparationIds`, qui est celle du parseur.
  let sessionsRemaniees = 0;
  const partis = new Set(
    args.droppedPreparationIds.map((x) => String(x ?? "")).filter((x) => x !== ""),
  );
  const ajoutParIndex = new Map<number, string[]>();
  for (const x of args.scheduledPreparations) {
    const s = args.sessions.byId.get(x.sessionId) ?? null;
    if (s === null) continue;
    ajoutParIndex.set(s.sessionIndex, [
      ...(ajoutParIndex.get(s.sessionIndex) ?? []),
      x.preparationId,
    ]);
  }
  if (
    (partis.size > 0 || ajoutParIndex.size > 0) &&
    Array.isArray(racine.cooking_sessions)
  ) {
    const sessionsTexte = [...racine.cooking_sessions];
    for (let i = 0; i < sessionsTexte.length; i++) {
      const ligne = sessionsTexte[i];
      if (ligne === undefined || ligne === null || typeof ligne !== "object") {
        continue;
      }
      const r = ligne as Record<string, unknown>;
      const avant = Array.isArray(r.preparation_ids)
        ? r.preparation_ids.map((x) => String(x ?? ""))
        : [];
      const gardees = partis.size === 0
        ? avant
        : avant.filter((id) => !partis.has(id));
      const ajouts = (ajoutParIndex.get(i) ?? []).filter((id) =>
        !gardees.includes(id)
      );
      if (gardees.length === avant.length && ajouts.length === 0) continue;
      sessionsTexte[i] = { ...r, preparation_ids: [...gardees, ...ajouts] };
      sessionsRemaniees++;
    }
    racine.cooking_sessions = sessionsTexte;
  }

  // ── LES PARTS DES BOUCHES TOUCHÉES ──────────────────────────────────────
  let partsRetirees = 0;
  if (Array.isArray(racine.member_portions)) {
    const gardees = racine.member_portions.filter((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<
        string,
        unknown
      >;
      const id = String(r.member_id ?? r.memberId ?? "").trim();
      if (id === "" || !bouchesTouchees.has(id)) return true;
      partsRetirees++;
      return false;
    });
    racine.member_portions = gardees;
  }

  return {
    text: JSON.stringify(racine),
    counts: {
      dishes_replaced: remplaces,
      dishes_added: ajoutes,
      preparations_written: ecrites,
      preparations_removed: supprimees,
      portions_dropped: partsRetirees,
      sessions_rewritten: deroulesEcrits,
      sessions_retooled: sessionsRemaniees,
      unreadable: false,
    },
  };
}
