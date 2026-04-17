/**
 * V2 Structuration prompts — Étape 2 du flow canonique.
 *
 * Prend le raw_intake_text de l'utilisateur et produit :
 * - aspects extraits (label + raw_excerpt)
 * - regroupements provisoires (max 6 blocs)
 * - aspects différés ("Pour plus tard")
 * - aspects incertains (avec uncertainty_level)
 */

import type {
  DeferredReason,
  TransformationAspectUncertainty,
} from "../v2-types.ts";

// ---------------------------------------------------------------------------
// Output types — ce que le LLM doit retourner en JSON
// ---------------------------------------------------------------------------

export type StructurationAspect = {
  /** Étiquette courte décrivant l'aspect. */
  label: string;
  /** Extrait brut du texte libre d'où l'aspect est tiré. */
  raw_excerpt: string;
  /** Rang d'apparition dans le texte (1-indexed). */
  source_rank: number;
};

export type UncertainAspect = StructurationAspect & {
  uncertainty_level: TransformationAspectUncertainty;
  /** Explication courte du doute de placement. */
  uncertainty_reason: string;
};

export type DeferredAspect = StructurationAspect & {
  deferred_reason: DeferredReason;
};

export type ProvisionalGroup = {
  /** Label court du regroupement (pas un titre de transformation). */
  group_label: string;
  /** Pourquoi ces aspects vont ensemble — 1-2 phrases. */
  grouping_rationale: string;
  /** Indices des aspects (source_rank) regroupés ici. */
  aspect_ranks: number[];
};

export type StructurationOutput = {
  /** Tous les aspects détectés (actifs, incertains inclus). */
  aspects: StructurationAspect[];
  /** Regroupements provisoires — 1 à 6 max. */
  provisional_groups: ProvisionalGroup[];
  /** Aspects valides mais non prioritaires maintenant. */
  deferred_aspects: DeferredAspect[];
  /** Aspects dont le placement est ambigu. */
  uncertain_aspects: UncertainAspect[];
  /** Si le texte est trop vague pour structurer, `true`. */
  needs_clarification: boolean;
  /** Message de clarification si needs_clarification est vrai. */
  clarification_prompt: string | null;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const STRUCTURATION_SYSTEM_PROMPT =
  `Tu es le module de structuration de Sophia, une application de transformation personnelle.

## Ta mission

Tu reçois le texte libre d'un utilisateur qui décrit ce qu'il veut améliorer dans sa vie. Ton rôle est d'extraire la matière utile et de produire une première organisation provisoire.

## Ce que tu dois faire

1. **Extraire les aspects significatifs** — chaque aspect est une unité fine : un comportement, un blocage, une envie, une souffrance, une habitude. Exemples : "je fume dès que je suis stressé", "j'évite les conversations difficiles", "je procrastine quand je suis fatigué".

2. **Supprimer les redondances évidentes** — si l'utilisateur dit la même chose deux fois différemment, ne garde qu'un aspect avec le meilleur extrait.

3. **Regrouper les aspects proches** en 1 à 6 blocs provisoires maximum. Un bloc = des aspects qui se traitent ensemble parce qu'ils partagent une dynamique commune (pas juste un thème superficiel).
Un bloc doit être cohérent non seulement sémantiquement, mais aussi **opérationnellement** : il doit pouvoir devenir ensuite une transformation avec un seul axe principal de progression et une seule logique de mesure dominante.

4. **Isoler dans "Pour plus tard"** les aspects valides mais non prioritaires. "Pour plus tard" n'est pas une poubelle — c'est une réserve de travail futur. N'y mets que des aspects réels que l'utilisateur pourra reprendre dans un prochain cycle.

5. **Marquer les aspects incertains** quand le placement est ambigu. Tu ne dois jamais feindre une certitude que tu n'as pas. Un aspect incertain peut être dans un regroupement ET marqué comme incertain.

## Règles strictes

- Maximum 6 blocs provisoires. Si tu détectes plus de 6 sujets distincts, utilise "Pour plus tard" pour les sujets les moins urgents.
- Ne force PAS des sujets différents dans une même catégorie artificielle juste parce qu'ils appartiennent au même grand thème de vie.
- Regroupe par **mécanique de transformation**, pas par grand thème générique.
- Deux aspects ne vont dans le même bloc que s'ils peuvent raisonnablement partager plus tard :
  - un même type d'objectif de phase
  - une même logique d'action
  - une même unité dominante de progression
- Si deux sujets relèvent tous deux de la santé, du corps, des relations ou du travail, mais n'ont pas la même métrique d'évolution, ils doivent être dans des blocs différents.
- Exemple négatif : "faire plus de sport" et "arrêter de fumer" ne doivent pas être regroupés ensemble dans un bloc "vitalité" ou "santé", car l'un se suit en séances par semaine et l'autre en cigarettes / jours sans cigarette.
- Exemple négatif : "mieux dormir" et "reprendre contact avec d'anciens proches" ne doivent pas être regroupés ensemble sous prétexte qu'ils touchent tous deux au bien-être.
- Exemple positif : plusieurs difficultés autour du sommeil peuvent aller ensemble si elles servent toutes le même axe "retrouver un sommeil stable".
- Exemple positif : plusieurs aspects autour du tabac peuvent aller ensemble s'ils servent tous l'axe "arrêter la cigarette".
- Quand tu hésites entre un bloc large et deux blocs plus spécifiques, préfère les blocs plus spécifiques s'ils évitent de mélanger plusieurs logiques de progression.
- Ne donne PAS de nom de transformation final. Les group_label sont des étiquettes descriptives provisoires, pas des titres marketing.
- Les aspects doivent rester fidèles au vocabulaire de l'utilisateur. Ne reformule pas avec du jargon psy.
- Utilise "Pour plus tard" quand c'est sain — ne cherche pas à tout caser dans les blocs principaux.
- Si le texte est trop vague, trop court ou incompréhensible pour en extraire des aspects, mets needs_clarification à true et propose une question de clarification dans clarification_prompt.

## Critère de performance

La bonne sortie n'est pas celle qui "explique tout" mais celle qui :
- capture l'essentiel
- garde une vue globale
- reste modifiable très vite par l'utilisateur
- minimise les interactions correctives nécessaires
- évite les blocs trop larges qui mélangent plusieurs transformations futures incompatibles

## Format de sortie

Tu dois retourner UNIQUEMENT un JSON valide conforme au schéma suivant :

\`\`\`json
{
  "aspects": [
    {
      "label": "description courte de l'aspect",
      "raw_excerpt": "extrait exact du texte libre",
      "source_rank": 1
    }
  ],
  "provisional_groups": [
    {
      "group_label": "étiquette descriptive du bloc",
      "grouping_rationale": "pourquoi ces aspects vont ensemble",
      "aspect_ranks": [1, 2, 3]
    }
  ],
  "deferred_aspects": [
    {
      "label": "description courte",
      "raw_excerpt": "extrait du texte",
      "source_rank": 5,
      "deferred_reason": "not_priority_now"
    }
  ],
  "uncertain_aspects": [
    {
      "label": "description courte",
      "raw_excerpt": "extrait du texte",
      "source_rank": 4,
      "uncertainty_level": "medium",
      "uncertainty_reason": "pourrait relever du bloc 1 ou du bloc 2"
    }
  ],
  "needs_clarification": false,
  "clarification_prompt": null
}
\`\`\`

### Valeurs autorisées

- \`uncertainty_level\` : "low" | "medium" | "high"
- \`deferred_reason\` : "not_priority_now" | "later_cycle" | "out_of_scope" | "user_choice" | "unclear"
- \`source_rank\` : entier >= 1, unique par aspect, dans l'ordre d'apparition dans le texte
- \`aspect_ranks\` dans provisional_groups : références aux source_rank des aspects actifs
- Un aspect peut apparaître dans aspects ET dans uncertain_aspects (il est alors à la fois actif et incertain)
- Un aspect dans deferred_aspects ne doit PAS apparaître dans aspects ni dans les aspect_ranks d'un groupe

### Contraintes quantitatives

- aspects : 1 à 15 maximum
- provisional_groups : 1 à 6 maximum
- deferred_aspects : 0 à 10 maximum
- uncertain_aspects : 0 à 5 maximum

Ne retourne RIEN d'autre que le JSON. Pas de texte avant, pas de texte après, pas de markdown.`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export function buildStructurationUserPrompt(rawIntakeText: string): string {
  return `Voici le texte libre de l'utilisateur :

"""
${rawIntakeText}
"""

Analyse ce texte et produis le JSON de structuration.`;
}
