# QA Run Report - Rose - Adjust Plan Action/Niveau R26/R27

## 1. Contexte Du Test

- Date: 2026-05-18
- Runs: `horizon-r26-action-final-green`, `horizon-r27-level-final-green`
- Persona: Rose
- Objectif: valider les derniers fixes 20/80 sur ajustement d'une action et ajustement du niveau actuel avant de passer au plan complet.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback déterministe comme résultat QA.
- Note technique: Edge Runtime local redémarré après les patches pour recharger le code.
- Validite QA: valide. Runs conduits tour par tour, effets DB vérifiés, cleanup Rose confirmé.

## 2. Tours De Conversation

### R26 - Action ciblée avec révision du brouillon

**Tour 1**

User: demande de préparer un brouillon pour `Partager un point positif`, limité à l'action, 2 fois/semaine, sans créneau fixe, phrase simple, sans appliquer.

Sophia: prépare directement une proposition sans redemander la permission de préparer. Elle précise que rien n'est appliqué.

Trace: `response_owner=tool_skill`, `tool_execution=blocked`, `executed_tools=[]`.

**Tour 2**

User: demande de modifier le brouillon avant validation: phrase neutre plutôt que phrase simple, toujours 2 fois, sans créneau fixe.

Sophia: confirme que le brouillon est corrigé et qu'elle n'applique rien sans confirmation claire.

Trace: `tool_execution=blocked`, `executed_tools=[]`.

**Tour 3**

User: valide explicitement le brouillon corrigé.

Sophia: applique l'ajustement.

Trace: `tool_execution=success`, `executed_tools=["adjust_plan_item"]`.

Effet durable avant cleanup:
- `Partager un point positif`: `target_reps=2`, `cadence_label=2 jours / semaine`, `description=une phrase neutre`, `time_of_day=anytime`.
- Autres items inchangés.

Cleanup: Rose restaurée, `chat_messages=0`, `user_chat_states=0`.

### R27 - Niveau actuel avec deux items et limites explicites

**Tour 1**

User: demande d'ajuster le niveau actuel, pas le plan complet; modifier `Partager un point positif` et `Convenir d'un signal de pause`; préserver `Cartographier les déclencheurs` et le plan global.

Sophia: demande le motif du changement avant de préparer.

Trace: `tool_execution=blocked`, `executed_tools=[]`.

**Tour 2**

User: donne le motif: niveau trop chargé, garder le cap, moins de pression, préparer sans appliquer.

Sophia: prépare le brouillon niveau avec deux changements et rappelle les limites.

Trace: `tool_execution=blocked`, `executed_tools=[]`.

**Tour 3**

User: demande confirmation des limites avant application, avec formulation mixte “puis applique”.

Sophia: n'applique pas encore; elle détaille le brouillon et demande une confirmation claire.

Trace: `tool_execution=none`, `executed_tools=[]`.

**Tour 4**

User: valide explicitement.

Sophia: applique l'ajustement du niveau.

Trace: `tool_execution=success`, `executed_tools=["adjust_plan_item"]`.

Effet durable avant cleanup:
- `Convenir d'un signal de pause`: description passée à une mission de 5 minutes pour choisir un mot ou geste simple.
- `Partager un point positif`: `target_reps=2`, `cadence_label=2 jours / semaine`, `description=une phrase neutre`, `time_of_day=anytime`.
- `Cartographier les déclencheurs`: inchangé.
- Plan global: non modifié.

Cleanup: Rose restaurée, `chat_messages=0`, `user_chat_states=0`.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

Ce qui marche:
- Le flow action ne redemande plus inutilement la permission de préparer quand le user demande déjà un brouillon sans application.
- La révision du brouillon est maintenant visible et cohérente dans la réponse.
- Le flow niveau gère bien une demande complexe avec deux items modifiés et des limites explicites.
- Sophia bloque correctement une formulation pré-validation ambiguë avant d'appliquer.

Warning mineur:
- R27 Tour 1 demande encore le motif malgré un contexte assez riche. C'est acceptable côté coaching: demander le “pourquoi” évite un ajustement mécanique.

## 4. Analyse Systeme

**Verdict: green**

Routage:
- Action ciblée: `adjust_plan_item`, pas de passage au niveau complet.
- Niveau actuel: `adjust_plan_item` avec scope niveau, pas de whole plan.

Side effects:
- Aucun effet durable avant validation explicite.
- Action R26: DB conforme après exécution.
- Niveau R27: DB conforme après exécution.
- Cleanup confirmé sur les deux runs.

Fixes validés:
- Génération de brouillon review-only sans double confirmation inutile.
- Annulation/révision de brouillon mieux gérée.
- Révision simple du pending draft réellement persistée avant validation.
- Matérialisation action/niveau conforme sur fréquence, instruction et timing libre.

## Verdict Global

**Verdict: green**

Les flows ajustement d'action et ajustement de niveau sont cohérents et fiables sur ces scénarios complexes. On peut passer au périmètre plan complet pour le prochain round.
