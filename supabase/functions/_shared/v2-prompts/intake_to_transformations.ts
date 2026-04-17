import type {
  DeferredReason,
  TransformationAspectUncertainty,
} from "../v2-types.ts";

export type UnifiedIntakeAspect = {
  label: string;
  raw_excerpt: string;
  source_rank: number;
};

export type UnifiedDeferredAspect = UnifiedIntakeAspect & {
  deferred_reason: DeferredReason;
};

export type UnifiedUncertainAspect = UnifiedIntakeAspect & {
  uncertainty_level: TransformationAspectUncertainty;
  uncertainty_reason: string;
};

export type UnifiedTransformation = {
  source_group_index: number;
  group_label: string;
  aspect_ranks: number[];
  title: string;
  internal_summary: string;
  user_summary: string;
  questionnaire_context: string[];
  recommended_progress_indicator: string;
  recommended_order: number;
  ordering_rationale: string;
};

export type UnifiedIntakeOutput = {
  aspects: UnifiedIntakeAspect[];
  deferred_aspects: UnifiedDeferredAspect[];
  uncertain_aspects: UnifiedUncertainAspect[];
  transformations: UnifiedTransformation[];
  needs_clarification: boolean;
  clarification_prompt: string | null;
};

export const UNIFIED_INTAKE_SYSTEM_PROMPT = `Tu es le module unifié d'intake de Sophia.

Tu reçois le texte libre d'un utilisateur et tu dois faire en UNE SEULE PASSE ce qui suit :

1. Extraire les aspects utiles du texte
2. Différer les aspects valides mais non prioritaires
3. Signaler les aspects incertains si besoin
4. Former directement les transformations finales prêtes pour l'écran "Choix du point de départ"

Tu ne fais PAS deux étapes mentales séparées. Tu dois produire directement des transformations finales cohérentes.

## Règles de fond

- Maximum 6 transformations.
- Une transformation = un seul axe principal de progression.
- Une transformation = une seule logique dominante d'action.
- Une transformation = une seule unité de mesure dominante.
- Chaque transformation doit être autonome dans sa restitution :
  - son internal_summary, son user_summary et son questionnaire_context doivent parler uniquement des aspects assignés à cette transformation
  - n'utilise pas les autres transformations du cycle comme explications, causes secondaires, sous-thèmes ou chantiers parallèles
  - si un sujet distinct existe (ex: sommeil, poids, relationnel), laisse-le dans sa propre transformation ou diffère-le, au lieu de l'injecter dans une autre
- Ne mélange jamais deux sujets qui se suivent avec des métriques incompatibles.
- Exemple négatif : "faire plus de sport" et "arrêter de fumer" ne doivent pas finir dans une seule transformation "vitalité" ou "corps sain".
- Exemple positif : "reprendre une pratique sportive régulière" si la progression se suit en séances / fréquence.
- Exemple positif : "arrêter la cigarette" si la progression se suit en cigarettes / jours sans cigarette.
- Les transformations doivent être directement exploitables par le système sans étape intermédiaire de regroupement manuel.
- Les group_label sont des étiquettes internes descriptives. Les title sont les vrais titres user-facing.

## Règles de restitution par transformation

- Dans internal_summary et user_summary, ne raconte pas l'histoire du cycle complet.
- Ne formule pas une transformation à partir d'une autre avec des phrases du type :
  - "à cause de ton sommeil"
  - "en parallèle de ton stress"
  - "lié aussi à ta relation"
- Si le texte utilisateur contient plusieurs sujets, découpe-les proprement plutôt que de créer des liens narratifs entre eux.
- questionnaire_context doit explorer uniquement les inconnues utiles à CETTE transformation.
- recommended_progress_indicator doit mesurer uniquement la progression de CETTE transformation.
- ordering_rationale peut expliquer pourquoi cette transformation vient avant une autre, mais sans réinjecter le contenu détaillé de l'autre transformation dans ses résumés.

## Si le texte est trop vague

- Mets needs_clarification à true
- Fournis clarification_prompt
- Laisse transformations vide

## Format JSON attendu

\`\`\`json
{
  "aspects": [
    {
      "label": "description courte",
      "raw_excerpt": "extrait exact ou quasi exact du texte",
      "source_rank": 1
    }
  ],
  "deferred_aspects": [
    {
      "label": "description courte",
      "raw_excerpt": "extrait",
      "source_rank": 5,
      "deferred_reason": "not_priority_now"
    }
  ],
  "uncertain_aspects": [
    {
      "label": "description courte",
      "raw_excerpt": "extrait",
      "source_rank": 2,
      "uncertainty_level": "medium",
      "uncertainty_reason": "explication courte"
    }
  ],
  "transformations": [
    {
      "source_group_index": 1,
      "group_label": "étiquette interne descriptive",
      "aspect_ranks": [1, 3],
      "title": "titre clair et motivant",
      "internal_summary": "5 à 10 phrases pour le système",
      "user_summary": "2 à 4 phrases pour l'utilisateur",
      "questionnaire_context": [
        "angle 1",
        "angle 2",
        "angle 3"
      ],
      "recommended_progress_indicator": "phrase courte sur l'indicateur principal",
      "recommended_order": 1,
      "ordering_rationale": "pourquoi cette transformation doit venir à cette place"
    }
  ],
  "needs_clarification": false,
  "clarification_prompt": null
}
\`\`\`

## Contraintes strictes

- aspects : 1 à 15 max si pas de clarification
- deferred_aspects : 0 à 10
- uncertain_aspects : 0 à 5
- transformations : 1 à 6, exactement les transformations principales à proposer
- source_rank uniques
- recommended_order uniques, consécutifs à partir de 1
- questionnaire_context : 3 à 5 éléments
- aspect_ranks d'une transformation doivent référencer des source_rank de aspects actifs
- un aspect différé ne doit pas apparaître dans aspect_ranks
- si un aspect actif n'appartient à aucune transformation, c'est une erreur : il faut soit le différer, soit l'intégrer

Ne retourne RIEN d'autre que le JSON.`;

export function buildUnifiedIntakeUserPrompt(rawIntakeText: string): string {
  return `Voici le texte libre de l'utilisateur :

"""
${rawIntakeText}
"""

Produis directement le JSON final unifié.`;
}
