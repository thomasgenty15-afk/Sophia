/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES COMPOSANTS CULINAIRES — ce qui tient une sauce, et ce qui n'a pas le
 * droit de servir de variable libre. Lot D, 2026-09-11.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT MESURÉ QUE CE MODULE FERME ─────────────────────────────────
 * `docs/keel/REVUE-CAMPAGNE-ET-SAVEUR-2026-09-11.md` §5. L'ajusteur de
 * proportions a réellement réécrit quatre recettes de la campagne du
 * 2026-09-11, AVANT leur mise à l'échelle :
 *
 *   · PERTE vendredi dîner : tahini **45 → 40 g**, tomate **20 → 25 g** ;
 *   · PERTE samedi dîner   : huile **15 → 11,3 g**, tomate **30 → 33,7 g** ;
 *   · PERTE dimanche dîner : huile **25 → 20 g**, tomate **40 → 45 g** ;
 *   · GAIN samedi dîner    : tahini **60 → 45 g**, huile **15 → 11,3 ml**,
 *     laitue **50 → 68,7 g**.
 *
 * Ses bornes sont des CONVENTIONS DE QUANTITÉ par groupe alimentaire :
 * légumes ≥ 70 %, autres ≥ 50 %, protéines ≤ 150 %, graisses ajoutées
 * 75–125 %, plafond générique 200 %. Aucune ne sait **ce qui tient une sauce,
 * une farce ou une pâte**. Rien, dans les contraintes de consommateurs, ne
 * porte un rapport sauce/base, matière grasse/acide ou liquide/féculent :
 * elles décrivent des DENSITÉS.
 *
 * ⛔ ET LES DEUX COMPTEURS RASSURANTS NE DISENT PAS CE QU'ON LEUR FAIT DIRE.
 * `consumers_degraded = 0` veut dire « aucune portion déjà conforme EN DENSITÉ
 * rendue non conforme », pas « aucune recette dégradée gustativement ».
 * `reverted_after_measure = 0` valide la prédiction numérique locale, pas une
 * préparation culinaire réelle. Sur les quatre recettes ci-dessus l'ajusteur
 * ALLÈGE, et rien ne démontre qu'il les rend moins bonnes — mais il **peut**
 * changer leur goût et leur texture, et ce risque ne disparaît pas parce que
 * les calories deviennent conformes.
 *
 * ── LA POLITIQUE, TELLE QUE LE PLAN L'ÉCRIT ──────────────────────────────
 * (`docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`, lot D)
 *
 *   · **Mise à l'échelle globale** : autorisée, rapports conservés. Elle ne
 *     passe pas par ici — c'est `sizeDishForMouth`.
 *   · **Accompagnement explicitement séparable** : quantité ajustable dans les
 *     bornes existantes. Le riz nature à côté d'un poulet en sauce.
 *   · **Sauce, assaisonnement, farce, appareil/pâte, liant, préparation à
 *     hydratation liée** : rapports internes conservés, ET proportion conservée
 *     vis-à-vis du composant qu'ils accompagnent. Une sauce n'est pas le levier
 *     qui double les calories.
 *   · **Huile, tahini, fromage, fruits à coque en garniture** : liés au
 *     composant assaisonné, jamais promus en accompagnement libre pour
 *     exploiter leur densité. L'aliment reste autorisé dans la recette.
 *   · **Rôle ou lien absent/ambigu** : composant NON AJUSTABLE en proportions.
 *
 * ⛔ CETTE POLITIQUE EST PLUS RESTRICTIVE QUE LE PLAFOND GÉNÉRIQUE DE 200 %,
 * exprès. Le plan l'écrit : « Elle peut augmenter les cas nécessitant une
 * recomposition ; mesurer ce coût. **Ne pas assouplir les protections
 * uniquement pour conserver le nombre de fermetures de l'ancien banc.** »
 *
 * ── ⛔ CE MODULE NE DÉCOUPE AUCUNE PHRASE DE RECETTE ─────────────────────
 * Le plan l'interdit nommément, et le dépôt a déjà payé ce geste : « laitue »
 * contient « lait », et un rapprochement maison a rendu **12 faux positifs sur
 * 12 mesurés** (`never-hand-roll-a-matcher-here`). La structure de cuisson est
 * DÉCLARÉE par le modèle, sur la ligne et sur le bloc, comme `for_member_id`,
 * `preparation_id` et `same_day` avant elle : inventée par le modèle, vérifiée
 * contre une liste fermée, JETÉE et COMPTÉE quand elle n'y est pas.
 *
 * ── ⛔ ET UNE ÉTIQUETTE DU MODÈLE N'ÉLARGIT JAMAIS UNE PROTECTION ────────
 * `demoteDenseSeasoning` : un composant dont **toutes** les lignes pesées
 * tombent dans les groupes denses d'assaisonnement (huiles, fruits à coque et
 * graines — donc le tahini —, fromages) ne peut pas être un accompagnement
 * libre, quel que soit le rôle écrit. C'est le référentiel qui décide, pas le
 * mot. Le sens de l'erreur est choisi : on ajuste moins, on ne ment jamais.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */
import type { FoodGroupRef } from "./tokens.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LE VOCABULAIRE — fermé, déclaré par le modèle, jamais deviné
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES NEUF RÔLES, ET RIEN D'AUTRE.
 *
 * Deux familles, et la frontière est la seule chose que ce vocabulaire décide :
 * un rôle LIBRE porte son propre facteur d'échelle ; un rôle DÉPENDANT n'en a
 * pas — il suit celui du composant qu'il accompagne, ce qui conserve à la fois
 * ses rapports internes et sa proportion à ce composant.
 */
export const CULINARY_ROLES = [
  /** Le composant principal du plat : la viande, la base, le gratin. LIBRE. */
  "main",
  /** L'accompagnement explicitement séparable : le riz nature à côté. LIBRE. */
  "separable_side",
  /** Une sauce. DÉPENDANT. */
  "sauce",
  /** Un assaisonnement : vinaigrette, marinade, épices pesées. DÉPENDANT. */
  "seasoning",
  /** Une farce. DÉPENDANT. */
  "stuffing",
  /** Un appareil, une pâte. DÉPENDANT. */
  "batter",
  /** Un liant : œuf, fécule, chapelure. DÉPENDANT. */
  "binder",
  /** Une cuisson à liquide lié : risotto, semoule, pilaf. DÉPENDANT. */
  "bound_hydration",
  /** Huile, tahini, fromage, fruits à coque EN GARNITURE. DÉPENDANT. */
  "garnish_fat",
] as const;
export type CulinaryRole = (typeof CULINARY_ROLES)[number];

/**
 * LES DEUX RÔLES QUI PORTENT LEUR PROPRE FACTEUR.
 *
 * ⚠️ `main` EST LIBRE, ET C'EST UN ARBITRAGE ÉCRIT. Faire bouger un composant
 * principal **en entier** ne déforme aucune recette : ses rapports internes
 * sont conservés par construction, et sa sauce le suit. Ce que ça permet, et
 * que le plan demande explicitement (« poulet en sauce + riz : le riz peut
 * varier »), c'est de changer le rapport ENTRE le poulet en sauce et le riz —
 * c'est-à-dire la seule chose qui déplace la densité de l'assiette sans
 * toucher à une recette.
 */
export const FREE_ROLES: ReadonlySet<CulinaryRole> = new Set<CulinaryRole>([
  "main",
  "separable_side",
]);

/**
 * LES GROUPES QUI NE PEUVENT PAS ÊTRE UN ACCOMPAGNEMENT LIBRE.
 *
 * ⛔ C'EST LA GARDE NOMMÉE DU LOT, et elle répond au test de sortie « faux rôle
 * accompagnement sur un assaisonnement dense connu : pas d'ouverture des
 * bornes ». Les quatre groupes sont ceux que la revue nomme un par un : l'huile
 * (`olive_oil`, `other_added_fat`), le tahini et les fruits à coque
 * (`nuts_seeds`), le fromage (`dairy_cheese`).
 *
 * ⚠️ CE N'EST PAS UNE INTERDICTION D'ALIMENT. Le fromage reste autorisé dans la
 * recette, et un composant principal PEUT en contenir. Ce qui est refusé, c'est
 * qu'un composant fait **uniquement** de ces aliments-là soit déclaré
 * « accompagnement » et devienne le levier de densité le moins cher du plan.
 */
export const DENSE_SEASONING_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "olive_oil",
  "other_added_fat",
  "nuts_seeds",
  "dairy_cheese",
]);

// ═══════════════════════════════════════════════════════════════════════════
// ② CE QUE LE MODÈLE DÉCLARE, ET CE QU'ON EN LIT
// ═══════════════════════════════════════════════════════════════════════════

/** Un composant tel que le modèle l'écrit sur son bloc. */
export interface DeclaredComponent {
  /** Le jeton que les lignes citent dans leur champ `part`. */
  readonly id: string;
  /** Un des neuf rôles. Hors liste ⇒ le composant est verrouillé. */
  readonly role: string | null;
  /** Le composant accompagné. Requis sur un rôle dépendant. */
  readonly partOf: string | null;
}

/** Une ligne, réduite à ce dont la validation a besoin. */
export interface StructureLine {
  readonly lineId: string;
  /** Le composant que la ligne cite. `null` = elle n'en cite aucun. */
  readonly part: string | null;
  /** Le groupe du RÉFÉRENTIEL, pas celui déclaré par le modèle. */
  readonly group: FoodGroupRef | null;
  /** Une ligne non pesée ne pèse dans aucune décision de densité. */
  readonly weighed: boolean;
}

/**
 * POURQUOI UN CORPS NE BOUGE PAS. Aucune immobilité n'est muette.
 *
 * ⛔ HUIT MOTIFS ET PAS UN SEUL. « contrat refusé » ne permet de réparer rien
 * du tout : un plan ancien appelle le repli de compatibilité, un modèle qui
 * oublie une ligne appelle une consigne plus dure, un cycle appelle une lecture
 * du contrat. Les fondre ferait d'un plan d'hier et d'un modèle désobéissant le
 * même chiffre — `model-declared-fields-need-a-counter`.
 */
export const STRUCTURE_LOCK_REASONS = [
  /** Le bloc ne déclare aucun composant : plan antérieur au contrat. */
  "contract_absent",
  /** Une ligne ne cite aucun composant. */
  "line_without_part",
  /** Une ligne cite un composant qui n'est pas déclaré. */
  "part_unknown",
  /** Deux composants portent le même identifiant. */
  "duplicate_component",
  /** Le rôle n'est pas dans la liste fermée. */
  "role_unknown",
  /** Un rôle dépendant sans lien, ou dont le lien ne désigne rien. */
  "link_missing",
  /** Les liens bouclent. */
  "link_cycle",
  /** Un composant déclaré que plus aucune ligne ne cite. */
  "component_without_line",
] as const;
export type StructureLockReason = (typeof STRUCTURE_LOCK_REASONS)[number];

/** Un corps rigide : les lignes qui ne peuvent bouger qu'ensemble. */
export interface RigidBody {
  readonly bodyId: string;
  /** Les composants soudés dans ce corps, triés. */
  readonly componentIds: readonly string[];
  readonly lineIds: readonly string[];
  /** `false` ⇒ les lignes de ce corps sont figées en proportions. */
  readonly movable: boolean;
  /** Non nul dès que `movable` est faux. */
  readonly reason: StructureLockReason | null;
}

export interface StructureCounters {
  /** Les blocs vus. */
  units: number;
  /** Les blocs dont le contrat a été accepté en entier. */
  units_contracted: number;
  /** Les blocs retombés sur le traitement conservateur, par motif. */
  units_conservative: Record<StructureLockReason, number>;
  components_free: number;
  components_dependent: number;
  bodies_movable: number;
  bodies_locked: number;
  lines_movable: number;
  lines_locked: number;
  /**
   * ⛔ LE COMPTEUR DE LA GARDE. Un composant déclaré LIBRE dont toutes les
   * lignes pesées sont des assaisonnements denses, et que le référentiel a
   * rétrogradé. Zéro pendant longtemps voudra dire « le modèle n'a pas
   * essayé » ; non nul voudra dire que la garde a servi. Un lot désarmé
   * ressemble trait pour trait à un lot qui marche.
   */
  demoted_dense_seasoning: number;
}

export function emptyStructureCounters(): StructureCounters {
  return {
    units: 0,
    units_contracted: 0,
    units_conservative: Object.fromEntries(
      STRUCTURE_LOCK_REASONS.map((r) => [r, 0]),
    ) as Record<StructureLockReason, number>,
    components_free: 0,
    components_dependent: 0,
    bodies_movable: 0,
    bodies_locked: 0,
    lines_movable: 0,
    lines_locked: 0,
    demoted_dense_seasoning: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA VALIDATION — le moteur applique la politique, l'étiquette ne décide pas
// ═══════════════════════════════════════════════════════════════════════════

/** Le corps unique et immobile d'un bloc dont le contrat n'a pas tenu. */
function conservativeBody(
  unitId: string,
  lines: readonly StructureLine[],
  reason: StructureLockReason,
): RigidBody {
  return {
    bodyId: `${unitId}~all`,
    componentIds: [],
    lineIds: lines.map((l) => l.lineId),
    movable: false,
    reason,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UN BLOC → SES CORPS RIGIDES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT EST CONSERVATEUR, ET IL EST TOTAL. Une seule anomalie — une
 * ligne sans composant, un lien qui ne désigne rien, un cycle — et le bloc
 * ENTIER devient un corps immobile. Pas « la ligne fautive » : le contrat d'un
 * bloc décrit un assemblage, et un assemblage à moitié compris est un
 * assemblage inconnu. C'est très exactement ce que le plan demande pour « les
 * mélanges sans structure fiable », et **en particulier pour les réponses
 * archivées antérieures au contrat**.
 *
 * ⚠️ IMMOBILE NE VEUT PAS DIRE FIGÉ POUR TOUJOURS : la mise à l'échelle
 * GLOBALE de l'assiette (`sizeDishForMouth`) et la recomposition par le modèle
 * restent possibles, et c'est le plan qui le dit. Ce module ne décide que d'une
 * chose : est-ce que l'ajusteur déterministe a le droit de changer les
 * PROPORTIONS de ces lignes-là.
 */
export function bodiesOfUnit(args: {
  readonly unitId: string;
  readonly lines: readonly StructureLine[];
  readonly declared: readonly DeclaredComponent[];
  readonly counters: StructureCounters;
}): readonly RigidBody[] {
  const { unitId, lines, declared, counters } = args;
  counters.units++;
  const give = (bodies: readonly RigidBody[]): readonly RigidBody[] => {
    for (const b of bodies) {
      if (b.movable) {
        counters.bodies_movable++;
        counters.lines_movable += b.lineIds.length;
      } else {
        counters.bodies_locked++;
        counters.lines_locked += b.lineIds.length;
      }
    }
    return bodies;
  };
  const refuse = (reason: StructureLockReason): readonly RigidBody[] => {
    counters.units_conservative[reason]++;
    return give([conservativeBody(unitId, lines, reason)]);
  };

  if (lines.length === 0) return [];
  if (declared.length === 0) return refuse("contract_absent");

  // ── ① LES COMPOSANTS DÉCLARÉS: unicité, rôle connu ─────────────────────
  const byId = new Map<string, DeclaredComponent>();
  for (const c of declared) {
    const id = String(c.id ?? "").trim();
    if (id === "") return refuse("duplicate_component");
    if (byId.has(id)) return refuse("duplicate_component");
    byId.set(id, { id, role: c.role, partOf: c.partOf });
  }
  const roleOf = new Map<string, CulinaryRole>();
  for (const [id, c] of byId) {
    const role = CULINARY_ROLES.find((r) => r === String(c.role ?? "").trim());
    if (role === undefined) return refuse("role_unknown");
    roleOf.set(id, role);
  }

  // ── ② LES LIGNES: chacune dans EXACTEMENT un composant ──────────────────
  const linesOf = new Map<string, StructureLine[]>();
  for (const id of byId.keys()) linesOf.set(id, []);
  for (const line of lines) {
    const part = String(line.part ?? "").trim();
    if (part === "") return refuse("line_without_part");
    const bucket = linesOf.get(part);
    if (bucket === undefined) return refuse("part_unknown");
    bucket.push(line);
  }
  for (const [, bucket] of linesOf) {
    if (bucket.length === 0) return refuse("component_without_line");
  }

  // ── ③ LA GARDE DU RÉFÉRENTIEL, AVANT LES LIENS ─────────────────────────
  // ⛔ Un composant LIBRE dont toutes les lignes pesées sont des
  // assaisonnements denses est rétrogradé en `garnish_fat`. Il lui faut donc un
  // lien, comme à toute dépendance — et s'il n'en a pas, il est verrouillé.
  // Une étiquette ne peut pas élargir une protection du référentiel.
  for (const [id, role] of roleOf) {
    if (!FREE_ROLES.has(role)) continue;
    const weighed = (linesOf.get(id) ?? []).filter((l) => l.weighed);
    if (weighed.length === 0) continue;
    if (!weighed.every((l) => l.group !== null && DENSE_SEASONING_GROUPS.has(l.group))) continue;
    roleOf.set(id, "garnish_fat");
    counters.demoted_dense_seasoning++;
  }

  // ── ④ LES LIENS: présents sur les dépendants, valides, sans cycle ───────
  const linkOf = new Map<string, string>();
  for (const [id, role] of roleOf) {
    if (FREE_ROLES.has(role)) continue;
    const target = String(byId.get(id)?.partOf ?? "").trim();
    if (target === "" || target === id || !byId.has(target)) return refuse("link_missing");
    linkOf.set(id, target);
  }
  // Un cycle est cherché par marche, pas par union: souder d'abord effacerait
  // exactement ce qu'on veut refuser.
  for (const start of linkOf.keys()) {
    const seen = new Set<string>([start]);
    let cur = linkOf.get(start);
    while (cur !== undefined) {
      if (seen.has(cur)) return refuse("link_cycle");
      seen.add(cur);
      cur = linkOf.get(cur);
    }
  }

  for (const [, role] of roleOf) {
    if (FREE_ROLES.has(role)) counters.components_free++;
    else counters.components_dependent++;
  }

  // ── ⑤ LA SOUDURE: un lien fait UN corps ────────────────────────────────
  const parent = new Map<string, string>();
  for (const id of byId.keys()) parent.set(id, id);
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  for (const [from, to] of linkOf) union(from, to);

  const groups = new Map<string, string[]>();
  for (const id of [...byId.keys()].sort()) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }

  const bodies: RigidBody[] = [];
  for (const root of [...groups.keys()].sort()) {
    const ids = groups.get(root)!;
    // ⛔ UN CORPS NE BOUGE QUE S'IL PORTE AU MOINS UN RÔLE LIBRE. Une sauce
    // soudée à une farce, toutes deux dépendantes, n'a personne pour décider de
    // son facteur: c'est le cas « lien ambigu » du plan, et il est immobile.
    const movable = ids.some((id) => FREE_ROLES.has(roleOf.get(id)!));
    bodies.push({
      bodyId: `${unitId}~${root}`,
      componentIds: ids,
      lineIds: ids.flatMap((id) => (linesOf.get(id) ?? []).map((l) => l.lineId)),
      movable,
      reason: movable ? null : "link_missing",
    });
  }
  counters.units_contracted++;
  return give(bodies);
}

/**
 * ⛔ LE CORPS UNIQUE ET LIBRE — LA POLITIQUE D'AVANT LE LOT D, ET ELLE PORTE
 * SON NOM.
 *
 * Une ligne, un corps, tous mobiles : c'est très exactement le comportement de
 * l'ajusteur avant ce lot, et c'est ce que la revue du 2026-09-11 §5 a mesuré
 * en train de réécrire quatre recettes. Il n'existe que pour deux usages, et
 * ils sont nommés pour qu'on les voie :
 *
 *   ① MESURER LE COÛT de la nouvelle politique — rejouer les corrections de
 *      densité archivées sous l'ancienne règle et sous la nouvelle, dans le
 *      même run, avec le même instrument ;
 *   ② les tests du moteur de RECHERCHE, qui parlent des bornes par groupe et
 *      pas de la structure culinaire.
 *
 * ⛔ AUCUN CHEMIN DE PRODUCTION NE DOIT L'APPELER. Un paramètre de garde
 * optionnel est une garde désarmée — la cicatrice n°1 de ce dépôt — et un
 * désarmement qui n'a pas de nom est un désarmement qu'on ne retrouve pas.
 */
export function EVERY_LINE_ITS_OWN_FREE_BODY(
  unitId: string,
  lineIds: readonly string[],
): readonly RigidBody[] {
  return lineIds.map((id) => ({
    bodyId: `${unitId}~free:${id}`,
    componentIds: [],
    lineIds: [id],
    movable: true,
    reason: null,
  }));
}
