/**
 * LE VERROU DES RÈGLES DE MAISON — déterministe, sur le texte sortant. PUR.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §8.5 règle 4.
 *
 * ── LE DÉFAUT QUI A FAIT ÉCRIRE CE MODULE, MESURÉ EN RUN RÉEL ────────────
 * Le prompt dit au modèle, en toutes lettres: ces règles ne sont pas un
 * conseil nutritionnel, ne les explique pas, ne les commente pas. Sur le
 * premier run réel avec une restriction « nutella » posée sur un enfant, le
 * modèle a produit un plat parfaitement conforme — aucun nutella nulle part —
 * et l'a justifié ainsi:
 *
 *     « Honore la demande de pâtes de Lea avec une sauce protéinée,
 *       SANS NUTELLA. »
 *
 * La substance était juste. Le texte, lui, annonce à Léa que sa demande a été
 * refusée, et l'attribue au PLAN plutôt qu'à son parent. C'est très exactement
 * le mensonge que §8.5 règle 4 interdit: Sophia portant une décision
 * domestique comme si c'était la sienne. Le jour où l'enfant s'en aperçoit,
 * plus rien de ce que dit l'agent n'a de poids.
 *
 * Et c'est la leçon déjà écrite de ce dépôt: **une consigne de prompt régresse
 * en réel**. Le verrou de doctrine existe pour cette raison; celui-ci en est
 * le jumeau, pointé sur une autre liste.
 *
 * ── DEUX LECTURES, PARCE QU'IL Y A DEUX FAUTES DIFFÉRENTES ───────────────
 *
 *   LA SUBSTANCE — l'aliment est-il vraiment servi ? Cherché dans les
 *   ingrédients et la méthode, avec la tolérance à la négation ACTIVE: une
 *   méthode qui dit « sans nutella » ne sert pas de nutella, et la rejeter
 *   ferait perdre un dîner correct. C'est une VIOLATION: le plat part.
 *
 *   LE COMMENTAIRE — la règle est-elle évoquée ? Cherché dans le titre et le
 *   « pourquoi », avec la tolérance à la négation DÉSACTIVÉE: c'est justement
 *   la formulation niée qui pose problème. Ce n'est PAS une violation, c'est
 *   une fuite: le plat reste, son « pourquoi » tombe.
 *
 * Les fondre ferait perdre l'un des deux — soit on jette des dîners corrects,
 * soit on laisse passer la phrase qui trahit le parent.
 *
 * ⟳ 2026-09-23 — UNE TROISIÈME LECTURE : LES À-CÔTÉS (`side_courses[].term`).
 * Un à-côté (entrée, fromage, dessert, pain) est rangé HORS des ingrédients du
 * plat, dans `dishes[i].side_courses` (`DishSideCoursePayload`). Sans cette
 * lecture, un dessert au nutella passait sous le verrou.
 *
 *   L'À-CÔTÉ — l'aliment nommé une fois (« pomme », « yaourt nature »).
 *   Négation tolérée, comme la substance. ⛔ CE N'EST PAS UNE VIOLATION DU
 *   PLAT : l'à-côté TOMBE, le plat reste et le plan s'écrit. Refuser toute la
 *   composition (422) pour un dessert choisi à côté du plat ferait payer une
 *   semaine entière pour un garnissage. Chaque retrait est tracé
 *   (`sideCoursesDropped`), jamais silencieux.
 */

import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";

/** Un plat, réduit à ce que ce module regarde. */
export interface LockableDish {
  title?: unknown;
  why?: unknown;
  method?: unknown;
  ingredients?: unknown;
  [key: string]: unknown;
}

export interface RestrictionLockResult {
  /** Les plats, `why` nettoyé quand il commentait une règle. */
  dishes: LockableDish[];
  /**
   * Les plats qui SERVENT vraiment un aliment interdit. Non vide ⇒ l'appelant
   * doit refuser la composition: on ne sert pas ce que le foyer a exclu.
   */
  violations: string[];
  /** Les commentaires effacés. Tracés, jamais silencieux. */
  scrubbed: string[];
  /**
   * ⟳ 2026-09-23 — les à-côtés retirés parce qu'ils servent un aliment exclu
   * par la maison, `titre:type:jeton`. Le plat reste (voir l'en-tête).
   */
  sideCoursesDropped: string[];
}

function termsFrom(labels: readonly string[]): ForbiddenTerm[] {
  return labels
    .map((l) => String(l ?? "").trim())
    .filter(Boolean)
    .map((label) => ({
      ruleId: `house.${label.toLowerCase().replace(/\s+/g, "_")}`,
      token: label,
    }));
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function ingredientTerms(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw
    .map((i) => (i && typeof i === "object" ? textOf((i as Record<string, unknown>).term) : ""))
    .filter(Boolean)
    .join(" ; ");
}

/**
 * @param labels les libellés de `household_food_restrictions`, tous membres
 *        confondus. On ne distingue PAS par personne, et c'est délibéré: un
 *        plat commun contient ou non l'aliment, il ne peut pas le contenir
 *        « pour Tom seulement ». La portion par membre est le seul endroit où
 *        la personne compte, et elle ne nomme jamais d'aliment interdit
 *        puisqu'il n'est pas dans la casserole.
 */
export function applyHouseRuleLock(
  dishes: readonly LockableDish[],
  labels: readonly string[],
): RestrictionLockResult {
  const terms = termsFrom(labels);
  if (terms.length === 0) {
    return { dishes: [...dishes], violations: [], scrubbed: [], sideCoursesDropped: [] };
  }

  const violations: string[] = [];
  const scrubbed: string[] = [];
  const sideCoursesDropped: string[] = [];

  const out = dishes.map((dish, index) => {
    const title = textOf(dish.title) || `dish[${index}]`;

    // 1. LA SUBSTANCE. Négation TOLÉRÉE: « sans nutella » ne sert rien.
    const substance = [ingredientTerms(dish.ingredients), textOf(dish.method)]
      .filter(Boolean)
      .join("\n");
    const served = findForbiddenMatches(substance, terms, {
      allowNegatedMentions: true,
    });
    for (const m of served) violations.push(`${title}:${m.token}`);

    // 1 bis. ⟳ 2026-09-23 — LES À-CÔTÉS. Négation tolérée, comme la substance. Un
    //    à-côté qui sert l'exclu TOMBE; le plat, lui, reste (voir l'en-tête).
    //    ⚠️ Le plat n'est recopié que si un à-côté tombe: sans morsure, c'est
    //    le même objet qui ressort, comme sans règle.
    let next: LockableDish = dish;
    const sides = Array.isArray(dish.side_courses) ? dish.side_courses : null;
    if (sides !== null && sides.length > 0) {
      const kept: unknown[] = [];
      for (const entry of sides) {
        const side = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
        const term = side === null ? "" : textOf(side.term);
        const hits = term === "" ? [] : findForbiddenMatches(term, terms, {
          allowNegatedMentions: true,
        });
        if (hits.length === 0) {
          kept.push(entry);
          continue;
        }
        sideCoursesDropped.push(`${title}:${textOf(side?.kind) || "side"}:${hits[0].token}`);
      }
      if (kept.length !== sides.length) next = { ...dish, side_courses: kept };
    }

    // 2. LE COMMENTAIRE. Négation REFUSÉE: c'est la tournure niée qu'on
    //    cherche, puisque c'est celle que le modèle produit spontanément.
    const commentary = [textOf(dish.title), textOf(dish.why)]
      .filter(Boolean)
      .join("\n");
    const mentioned = findForbiddenMatches(commentary, terms, {
      allowNegatedMentions: false,
    });
    if (mentioned.length === 0) return next;

    scrubbed.push(`${title}:${[...new Set(mentioned.map((m) => m.token))].join(",")}`);
    // ON EFFACE LE « POURQUOI », ON NE LE RÉÉCRIT PAS. Bricoler la phrase du
    // modèle produirait un texte dont personne ne répond, et retirer le mot
    // laisserait « Honore la demande de pâtes de Lea avec une sauce
    // protéinée, sans . » — pire que rien. Un plat sans justification reste
    // un plat; l'écran n'affiche simplement pas de ligne.
    return { ...next, why: null };
  });

  return { dishes: out, violations, scrubbed, sideCoursesDropped };
}
