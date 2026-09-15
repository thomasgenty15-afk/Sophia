# QA Run - Feature Opportunity Local Real R3

## 1. Contexte Du Test

- Date: 2026-06-23, Supabase local.
- Run: `feature-opportunity-local-real-20260623-r3`.
- Persona: `qa-skill`, connexion temporaire `feature_opportunity_feature-opportunity-local-real-20260623-r3`.
- Objectif: verifier apres correction les signaux d'entree `feature_opportunity`: soutien recurrent explicite -> `initiatives`, frustration sur style Sophia -> `coach_preferences`.
- Trajectoire: initiative recurrente -> suivi reglages initiative -> sortie globale -> frustration ton/directivite -> suivi reglages preferences coach.
- Surfaces visees: global dispatcher, `feature_opportunity`, visible agent, active flow exit, absence de tools/side effects.
- Cadre IA reel: `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe, pas de renderer direct, pas de code fix pendant ce run.
- Validite QA: valide. API/Auth/Functions/DB locales joignables; services auxiliaires Supabase signales arretes sans impact observe. Connexion temporaire nettoyee en fin de run.
- Artefacts: `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-local-real-20260623-r3.raw.json`, `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-local-real-20260623-r3.summary.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Tous les soirs, après avoir fermé mon ordi, je perds le fil de la préparation du lendemain. Je me dis qu’un message récurrent de Sophia pourrait m’aider, mais je ne sais pas trop comment le poser.

**Sophia**
> Oui, ça colle bien à des initiatives : c’est un rituel du soir, juste après avoir fermé ton ordi.
>
> Tu peux le formuler comme un message récurrent de fin de journée avec 3 points simples : quoi préparer pour demain, pourquoi c’est important ce soir, et à quelle heure l’envoyer. Si tu veux, je peux t’aider à le formuler en une phrase.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: active state `feature_opportunity`, feature `initiatives`, `opportunity_kind=recurring_context`

### Tour 2

**Verdict du tour:** green

**User**
> Oui, et concrètement quels réglages je dois prévoir pour cette initiative ? Je veux juste savoir quoi mettre dans la plateforme.

**Sophia**
> Pour cette initiative, mets simplement :
> - quoi dire : un message court pour préparer le lendemain
> - pourquoi / quand : juste après avoir fermé ton ordi, le soir
> - horaire : une heure fixe le soir, proche de ce moment
> - jours actifs : tous les soirs, ou seulement les jours où tu travailles
> - destination : Base de vie si c’est un rituel perso, Plan actuel si c’est lié à ta journée du moment
> - statut : actif si tu veux qu’elle parte, inactif si tu veux la garder en pause
>
> Si tu veux, je peux aussi te proposer une formulation très courte du message.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `active_feature_opportunity`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: active state `feature_opportunity` conserve, aucun tool appele

### Tour 3

**Verdict du tour:** green

**User**
> Ok merci. Autre sujet : rappelle-moi juste la différence entre une carte d’attaque et une carte de défense.

**Sophia**
> Une carte d’attaque sert à aller vers un objectif concret, avec une action à pousser.  
> Une carte de défense sert à protéger ton énergie, éviter de déraper ou tenir un cadre. 🙂
>
> Si tu veux, je peux te donner un exemple de chaque en une ligne.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `feature_opportunity_exit_to_global`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: active state nettoye

### Tour 4

**Verdict du tour:** green

**User**
> Quand je bloque, ça me frustre que Sophia soit trop douce. J’aimerais qu’elle soit plus directe au lieu de tourner autour.

**Sophia**
> Le bon réglage ici, c’est les préférences de coaching, surtout le ton : passe Sophia sur “direct” pour qu’elle soit plus franche quand tu bloques. Si tu veux, je peux aussi t’indiquer le niveau de challenge le plus adapté.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: active state `feature_opportunity`, feature `coach_preferences`, `opportunity_kind=coach_style_feedback`

### Tour 5

**Verdict du tour:** green

**User**
> Et dans ces préférences, je peux régler quoi exactement ? Je veux juste savoir les options, pas que tu changes quelque chose.

**Sophia**
> Dans les préférences coach, tu peux régler 3 choses :
> - le ton global : plus doux, chaleureux/direct, ou direct
> - le niveau de challenge : faible, équilibré, ou élevé
> - la tendance à poser des questions : peu, normal, ou très questionnant
>
> Si tu veux, je peux aussi te dire lequel colle le mieux à ton besoin d’être plus direct.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `active_feature_opportunity`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: active state `feature_opportunity` conserve, aucun tool appele

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le message recurrent explicite est compris comme une opportunite `initiatives`, pas comme un coaching de blocage.
- Le visible donne les reglages utiles: quoi dire, contexte, horaire, jours actifs, destination et statut.
- Le changement de sujet sort proprement du flow sans handoff local.
- La frustration de style est aiguillee vers les preferences de coaching et le follow-up nomme les trois axes utiles.

**Problemes**
- Aucun probleme bloquant observe. Petite reserve UX: les tours 3 et 4 finissent par une proposition optionnelle; ce n'est pas faux, mais peut etre raccourci si on veut un style plus sobre.

**Fix propose**
- Aucun fix necessaire pour ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: `feature_opportunity_signal` pour `initiatives`.
- T2: `active_feature_opportunity`, suivi produit lie conserve dans le visible du skill.
- T3: `feature_opportunity_exit_to_global`, owner final `normal_reply`, state nettoye.
- T4: `feature_opportunity_signal` pour `coach_preferences`.
- T5: `active_feature_opportunity`, suivi produit lie conserve dans le visible du skill.

**Skills / Operations / Tools**
- Aucun tool execute sur les cinq tours.
- Aucun effet durable demande, autorise ou commis.
- Aucun nom interne `recurring_reminder` rendu visible.
- Aucune promesse de creation, sauvegarde ou modification depuis le chat.

**Memoire / DB**
- Etats actifs conformes aux owners observes.
- Connexion temporaire et donnees du run nettoyees apres capture des artefacts.

## 5. Verdict Global

**Verdict global: green**

Le rerun valide les deux signaux d'entree clarifies: soutien recurrent explicite -> `initiatives`, frustration de style -> `coach_preferences`. Le visible agent donne les reglages utiles et le flow reste non-mutant.
