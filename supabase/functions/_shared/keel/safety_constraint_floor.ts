/**
 * LE PLANCHER DÉTERMINISTE DE LA DÉCLARATION D'ALLERGIE.
 *
 * ── LE DÉFAUT MESURÉ (QA WEB L3, run réel, 2026-08-04) ──────────────────────
 * Élève : « I'm allergic to peanuts, badly »
 * Sophia : « That's important, and I'm glad you said it. I'll treat peanuts as
 *           a hard avoid going forward. »
 * Base   : `select count(*) from student_safety_constraints` → **0**
 *
 * Le dispatcher avait rendu `direct_effects: []`. Toute la chaîne d'écriture
 * (`runKeelDirectEffectLane` → intake → `createSafetyConstraintWrite`) est
 * gouvernée par `routeDecision.direct_effects_to_run`, lui-même issu du
 * `TurnFrame` du dispatcher — c'est-à-dire d'un LLM. Sur le MÊME message en
 * français, la ligne a bien été écrite. Ce n'est donc pas une panne : c'est un
 * tirage.
 *
 * Un accusé sans ligne est le pire des trois états possibles, parce qu'il a
 * l'air d'avoir marché — et ici le contenu de la ligne perdue est médical.
 * C'est le défaut AGENT-16 P0-3, retrouvé intact.
 *
 * ── POURQUOI UN PLANCHER, ET PAS UN MEILLEUR PROMPT ─────────────────────────
 * Ce dépôt a déjà mesuré que les correctifs prompt-only régressent en run réel
 * (`p8-revalidation-rose-reds`), et il s'est déjà donné la règle pour ce cas
 * exact : **ce qui OUVRE une lane ne transite pas par le LLM du dispatcher**
 * (plancher TCA, gate `plan_question`, `keel_student`). Une déclaration
 * d'allergie appartient à cette famille : elle est reconnaissable dans les mots
 * de l'élève, sa perte n'est pas bornée, et sa détection ne demande aucun
 * jugement.
 *
 * ── CE QUE CE MODULE FAIT, ET SURTOUT CE QU'IL NE FAIT PAS ─────────────────
 * Il ne diagnostique rien et ne remplace pas le dispatcher : il garantit un
 * PLANCHER. Quand l'élève déclare explicitement une allergie ou une
 * intolérance avec un allergène connu de la table fermée, l'effet est demandé,
 * que le dispatcher l'ait vu ou non. Quand le dispatcher l'a déjà vu, ce module
 * ne fait rien — il n'écrase jamais un payload plus riche.
 *
 * Il ne fire PAS sur :
 *   · une question (« am I allergic to peanuts? », « c'est quoi une allergie ? »)
 *   · une négation (« I'm not allergic to peanuts », « je ne suis plus allergique »)
 *   · une allergie qui n'est pas la sienne (« my son is allergic to peanuts »)
 *   · un allergène hors de la table fermée — R7 : on ne rapproche jamais du
 *     plus proche, on laisse le dispatcher faire son travail.
 *
 * Sur-déclencher coûte une ligne de contrainte en trop, que l'élève peut
 * rétracter (`intent: 'retract'` existe). Sous-déclencher sert l'allergène.
 * Seul le premier est récupérable — même arbitrage que `allergen_surface_forms`.
 */

import { ALLERGEN_SURFACE_FORMS } from "./allergen_surface_forms.ts";

/** Ce que le plancher demande, dans la forme exacte d'un `payload_hint`. */
export type SafetyConstraintFloorHit = {
  allergen_ref: string;
  kind: "allergy" | "intolerance";
  severity: "medical" | "strict";
  /** Les mots de l'élève, pour que la ligne porte sa formulation. */
  notes: string;
  /** Ce qui a mordu, pour que le log soit lisible. */
  matched: string;
};

/**
 * Normalisation MINIMALE et partagée : casse, accents, ponctuation.
 * Les mêmes règles que `forbidden_matcher`, réécrites ici pour ne pas coupler
 * un plancher d'intake à une ceinture de sortie.
 *
 * ── LES LIGATURES SONT DÉPLIÉES, PAS SUPPRIMÉES (2026-08-22, lot S1) ────────
 * `œ` et `æ` ne sont PAS des accents composés : ils survivent à `NFD`, et le
 * filtre `[^a-z0-9\s]` juste en dessous les remplaçait donc par une espace au
 * lieu de les ramener à leurs deux lettres. Sur un produit dont la locale par
 * défaut est `fr-FR`, ça TUAIT le plancher sur la graphie normale du mot :
 * mesuré le 2026-08-22, « je suis allergique aux œufs » ⇒ `null`, « …oeufs »
 * ⇒ `{allergen_ref:"egg", severity:"medical"}`. Le plancher retombait alors
 * sur le tirage du dispatcher — c'est-à-dire exactement ce qu'il existe pour
 * fermer, sur une déclaration médicale.
 *
 * C'est le repli déjà posé le 2026-08-19 dans `allergen_catalog.ts`, dont ce
 * module reste DÉLIBÉRÉMENT découplé (un plancher d'intake n'est pas une
 * ceinture de sortie) : la règle est recopiée, pas importée, et les deux
 * commentaires se citent.
 *
 * ⚠️ Écrit en séquences d'échappement (`\u0153`, `\u00e6`), comme le module
 * frère : ce dépôt a déjà produit du mojibake qu'aucun `tsc` ni test de
 * parité n'attrape. Les caractères littéraux `œ` et `æ` n'apparaissent que
 * dans ce commentaire — jamais dans le chemin exécuté.
 *
 * ⚠️ Le dépliage vient APRÈS `toLowerCase()`, pour que `Œ` et `Æ` passent
 * aussi.
 */
function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * « C'est MOI qui suis allergique », en anglais et en français.
 *
 * Le sujet est capturé : c'est la seule façon d'écarter « my son is allergic to
 * peanuts », qui est une information sur quelqu'un d'autre et n'a rien à faire
 * dans les contraintes de CET élève.
 */
const DECLARATION_PATTERNS: readonly {
  pattern: RegExp;
  kind: "allergy" | "intolerance";
}[] = [
  // EN — allergie
  { pattern: /\b(?:i am|i m|im)\s+(?:very\s+|severely\s+|badly\s+|really\s+)?allergic\s+to\s+([a-z0-9 ]{2,40})/, kind: "allergy" },
  { pattern: /\bi\s+have\s+(?:a\s+|an\s+)?(?:severe\s+|bad\s+)?([a-z0-9 ]{2,30}?)\s+allergy\b/, kind: "allergy" },
  { pattern: /\bmy\s+([a-z0-9 ]{2,30}?)\s+allergy\b/, kind: "allergy" },
  // EN — intolérance
  { pattern: /\b(?:i am|i m|im)\s+([a-z0-9 ]{2,30}?)\s+intolerant\b/, kind: "intolerance" },
  { pattern: /\bi\s+(?:am|m)?\s*(?:have\s+)?(?:an?\s+)?([a-z0-9 ]{2,30}?)\s+intolerance\b/, kind: "intolerance" },
  // FR — allergie
  { pattern: /\bje\s+suis\s+(?:tres\s+|severement\s+|fortement\s+)?allergique\s+(?:a|aux|au|a la|a l)\s+([a-z0-9 ]{2,40})/, kind: "allergy" },
  { pattern: /\bj\s*ai\s+une\s+allergie\s+(?:a|aux|au|a la|a l)\s+([a-z0-9 ]{2,40})/, kind: "allergy" },
  // FR — intolérance
  { pattern: /\bje\s+suis\s+intolerante?\s+(?:a|aux|au|a la|a l)\s+([a-z0-9 ]{2,40})/, kind: "intolerance" },
  { pattern: /\bj\s*ai\s+une\s+intolerance\s+(?:a|aux|au|a la|a l)\s+([a-z0-9 ]{2,40})/, kind: "intolerance" },
];

/**
 * Ce qui DÉSARME le plancher, vérifié sur le message entier.
 *
 * Condition de désarmement explicite (doctrine P9) : une ceinture sans elle est
 * une ceinture qu'on ne sait pas retirer. Chacune est là pour un faux positif
 * qu'on peut nommer.
 */
const DISARM_PATTERNS: readonly RegExp[] = [
  // Négation, EN et FR. « I'm not allergic », « je ne suis pas/plus allergique ».
  /\b(?:i am|i m|im)\s+not\s+allergic\b/,
  /\bnot\s+(?:actually\s+)?allergic\b/,
  /\bje\s+ne\s+suis\s+(?:pas|plus)\s+allergique\b/,
  /\bpas\s+allergique\b/,
  // Quelqu'un d'autre. Le sujet capturé plus haut ne suffit pas: « my son is
  // allergic to peanuts, am I? » contient les deux.
  /\b(?:my|his|her|their|our)\s+(?:son|daughter|child|kid|wife|husband|partner|mother|father|mum|mom|dad|friend|colleague)\b/,
  /\b(?:mon|ma|mes)\s+(?:fils|fille|enfant|femme|mari|conjoint|mere|pere|ami|amie|collegue)\b/,
  // Une question sur l'allergie n'est pas une déclaration.
  /\b(?:am i|are you|is it|what is|what s|c est quoi|est ce que je suis)\b.*\ballerg/,
  // Une rétractation passe par le dispatcher, avec son `intent: 'retract'`.
  /\b(?:i m|i am|im)\s+no\s+longer\s+allergic\b/,
];

/** Les slugs connus, plus leurs formes de surface, en index inverse. */
function buildIndex(): Array<{ ref: string; term: string }> {
  const out: Array<{ ref: string; term: string }> = [];
  for (const [ref, forms] of Object.entries(ALLERGEN_SURFACE_FORMS)) {
    out.push({ ref, term: normalize(ref.replace(/_/g, " ")) });
    // Le pluriel anglais le plus courant: l'élève écrit « peanuts », la table
    // porte « peanut ». Un `s` final est une variante d'écriture, pas une
    // inférence — c'est le même mot.
    out.push({ ref, term: `${normalize(ref.replace(/_/g, " "))}s` });
    for (const form of forms) {
      const term = normalize(form);
      if (term) {
        out.push({ ref, term });
        out.push({ ref, term: `${term}s` });
      }
    }
  }
  // Les termes LONGS d'abord: « tree nut » doit gagner sur « nut ».
  return out.sort((a, b) => b.term.length - a.term.length);
}

const INDEX = buildIndex();

/**
 * Le plancher. Rend `null` quand rien de sûr n'est déclaré — jamais une
 * approximation.
 *
 * @param userMessage le message BRUT de l'élève.
 */
export function detectDeclaredSafetyConstraint(
  userMessage: unknown,
): SafetyConstraintFloorHit | null {
  const raw = String(userMessage ?? "").trim();
  if (!raw) return null;
  const text = normalize(raw);
  if (!text) return null;

  for (const disarm of DISARM_PATTERNS) {
    if (disarm.test(text)) return null;
  }

  for (const { pattern, kind } of DECLARATION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const object = (match[1] ?? "").trim();
    if (!object) continue;

    // L'objet capturé est un fragment de prose (« peanuts badly », « les
    // arachides et le lait »). On cherche le terme le plus long qui y apparaît.
    for (const entry of INDEX) {
      if (!entry.term) continue;
      const boundary = new RegExp(`(^|\\s)${entry.term}(\\s|$)`);
      if (!boundary.test(object)) continue;
      return {
        allergen_ref: entry.ref,
        kind,
        // `medical` pour une allergie: c'est la seule sévérité que la ceinture
        // de sortie fait mordre. Une intolérance est `strict` — vraie, tenue,
        // mais pas une urgence clinique.
        severity: kind === "allergy" ? "medical" : "strict",
        notes: raw.slice(0, 500),
        matched: entry.term,
      };
    }
    // Déclaration reconnue mais allergène hors table: R7, on n'invente pas de
    // slug. Le dispatcher reste seul juge de ce cas.
    return null;
  }
  return null;
}
