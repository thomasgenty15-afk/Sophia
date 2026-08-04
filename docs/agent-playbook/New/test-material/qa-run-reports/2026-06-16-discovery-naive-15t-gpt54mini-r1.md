# QA Run Report - Discovery Naive 15T GPT54Mini Check - 2026-06-16 - R1

## 1. Contexte Du Test

- Date: 2026-06-16 Europe/Paris
- Run: `qa-discovery-naive-15t-gpt54mini-20260616-r1`, scenario `discovery_naive_gpt`
- Persona: compte QA temporaire local `qa-phase2`
- Objectif: vérifier si les appels conversation/dispatcher passent majoritairement par GPT 5.4 mini et si la qualité visible progresse
- Trajectoire: blocage dossier -> attack card naïve -> status -> defense card naïve -> demotivation -> rappel ponctuel -> récap -> clôture
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe
- Validite QA: valide. Les traces inline sont présentes; `conversation_turn_traces` table reste vide. DB et `llm_usage_events` inspectés avant cleanup.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai un dossier important à ouvrir aujourd'hui, mais je sens déjà que je vais repousser. Je sais pas trop par où commencer.

**Sophia**
> Je te comprends : quand c’est important, ton cerveau cherche “le bon début” et ça finit en repoussage 😕. L’astuce, c’est de ne pas viser le dossier entier tout de suite, juste la première action visible.
>
> Choisis un tout premier micro-pas qui ne demande que 2 à 5 minutes [...]

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Le résultat final c'est juste comprendre ce qu'on attend de moi et envoyer une réponse. Mais dès que j'ouvre le fichier je lis deux lignes et je m'échappe.

**Sophia**
> Je vois très bien le mécanisme : tu as l’objectif clair (“envoyer une réponse”), et dès que le fichier s’ouvre ton cerveau capte “y a un truc à traiter” [...]

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Oui, fais-moi un truc très simple pour lancer sans réfléchir. Pas un truc profond, juste un déclencheur pratique.

**Sophia**
> Pour ton dossier et ta réponse, pour contrer l'envie de t'échapper après deux lignes, je te propose la technique Preparer le terrain. C'est un outil très concret [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Oui ça me va, fais-le au plus court avec ce que tu sais déjà.

**Sophia**
> Rends-toi dans la section Cartes d’attaque pour utiliser la technique Preparer le terrain. Voici les informations à utiliser :
>
> - Par rapport a quelle action tu veux te rendre la vie plus simple ? : Ouvrir le dossier et envoyer une réponse
> - Qu'est-ce que tu pourrais preparer en avance pour enlever de la friction ? : Ouvrir le fichier et repérer les deux lignes clés
> - Quand le moment arrive, qu'est-ce qui devrait deja etre pret autour de toi ? : Le document est déjà ouvert à l'écran, prêt à être lu

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- durable_effect: none

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 / BF-STATUS-02

**User**
> Ok, donc est-ce que quelque chose a été créé vraiment ou c'est juste une préparation à reprendre ?

**Sophia**
> Je n'arrive pas a repondre a cette question maintenant, mais je garde la carte d'attaque en cours.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: status/ledger explicite pendant flow actif non traité.
- Source amont probable: inline `get_info_db/status_recap` dans operation flow actif.
- Owner runtime: `prepare_attack_card` local dispatcher/runtime.
- Correction recommandee: rendre le status inline robuste ou sortir vers `status_recap`.

### Tour 6

**Verdict du tour:** green

**User**
> Laisse tomber la carte alors, je veux juste qu'on parle normalement deux secondes.

**Sophia**
> Bien sûr, je laisse tomber la carte. 😌 Tu veux qu’on parle de quoi là, maintenant [...]

**Trace courte**
- response_owner: `normal_reply`
- skill_signals.exit.prepare_attack_card: score 1
- durable_effect: none

### Tour 7

**Verdict du tour:** green

**User**
> Le soir aussi j'ai un truc : je rentre fatigué, je prends le téléphone ou des biscuits, et après c'est parti sans que je décide vraiment.

**Sophia**
> Je comprends tout à fait ce sentiment de pilotage automatique quand la fatigue s'installe le soir. Pour t'aider à reprendre la main [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- durable_effect: none

### Tour 8

**Verdict du tour:** green

**User**
> Je veux surtout interrompre le moment où je passe la porte et où je cherche un truc facile pour décompresser.

**Sophia**
> Pour bien définir ce moment de fatigue, est-ce que cette formulation te convient [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- durable_effect: none

### Tour 9

**Verdict du tour:** green

**User**
> Oui c'est exactement ça. Fais simple, je veux juste quelque chose qui m'aide à ne pas partir en automatique.

**Sophia**
> Super, tout est prêt pour ta carte. Elle n'est pas créée automatiquement ici, tu dois donc la saisir toi-même dans Ressources / Défense [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- durable_effect: none

### Tour 10

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 / BF-STATUS-02

**User**
> Ok donc si je te demande ce qui existe vraiment chez moi là maintenant, tu me dirais quoi ?

**Sophia**
> Je n'arrive pas à répondre à cette question maintenant, mais je garde la carte de défense en cours.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: même échec de status inline que T5, côté defense.
- Source amont probable: pattern commun aux operation flows actifs.
- Owner runtime: active operation flow inline status / `status_recap`.
- Correction recommandee: ne pas laisser un flow actif répondre fallback quand une question status explicite arrive.

### Tour 11

**Verdict du tour:** green

**User**
> Ok laisse tomber cette carte aussi. En vrai je suis un peu découragé, j'ai l'impression que je prépare des trucs mais que je ne tiens jamais.

**Sophia**
> Je suis attentive à ce que tu ressens et je comprends ton envie de tout laisser tomber [...]

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- skill_signals.exit.prepare_defense_card: score 1
- durable_effect: none

### Tour 12

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02

**User**
> Oui c'est ça. Et pour ce soir, tu peux me prévenir vers 19h avec juste : ouvre le fichier et lis seulement la consigne ?

**Sophia**
> C'est programmé pour mardi 16 juin à 19:00: je te ferai un rappel pour ouvre le fichier et lis seulement la consigne.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- direct_effects: `create_one_shot_reminder`, explicit high
- DB: one pending `scheduled_checkins`, `scheduled_for=2026-06-16T17:00:00+00:00`, instruction `ouvre le fichier et lis seulement la consigne`

**Analyse si yellow/red**
- Symptome: effet correct, confirmation visible maladroite `pour ouvre`.
- Source amont probable: confirmation one-shot reminder.
- Owner runtime: final response add-on / visible agent.
- Correction recommandee: reformuler naturellement l'instruction.

### Tour 13

**Verdict du tour:** green

**User**
> Et là, concrètement, qu'est-ce qui est vraiment actif ou enregistré ?

**Sophia**
> Concrètement, le seul élément actif immédiat est ton rappel de 19h pour ouvrir le fichier et lire la consigne. Il n'y a aucune carte enregistrée pour le moment [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- durable_effect: none

### Tour 14

**Verdict du tour:** green

**User**
> Ok parfait. Franchement c'est plus clair. Je veux juste retenir une phrase simple pour ce soir.

**Sophia**
> Parfait 🙂 Pour ce soir, la phrase simple c’est : “19h = j’ouvre le fichier et je lis la consigne, sans me perdre dans le reste.”

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- durable_effect: none

### Tour 15

**Verdict du tour:** green

**User**
> Oui, c'est nickel. On s'arrête là pour l'instant.

**Sophia**
> Parfait, nickel 🙂 On s’arrête là pour l’instant.

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Meilleur choix de technique en T3: `Préparer le terrain` au lieu de `Mot de bascule`, cohérent avec un dossier/fichier à ouvrir.
- T4 est beaucoup plus compact: Sophia remplit les champs depuis le contexte et ne pose pas de question profonde.
- T7 route correctement le piège du soir vers `prepare_defense_card`.
- T11 sort correctement du flow defense puis entre en `demotivation_repair`.
- T12 crée le rappel au premier signal explicite, contrairement au run précédent.
- T13 récapitule correctement: rappel réel, aucune carte enregistrée.

**Problemes**
- T5/T10: les questions status pendant un operation flow actif échouent avec un fallback visible.
- T12: confirmation rappel grammaticalement maladroite.
- Latence visible encore élevée sur plusieurs tours de flow.

**Fix propose**
- Source amont: runtime inline status des operation flows actifs.
- Correction recommandee: si `get_info_db/status_recap` échoue ou produit vide, sortir proprement vers `status_recap` global au lieu de répondre fallback.
- Tests d'invariant attendus: active `prepare_attack_card` + status; active `prepare_defense_card` + status; rappel one-shot confirmation naturelle.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Global routing meilleur que le run précédent sur les décisions métier: attack vs defense vs demotivation vs reminder.
- Active flow exit explicite fonctionne.
- Status explicite pendant flow actif reste cassé dans deux operation flows.

**Modèles réellement utilisés**

Sur `llm_usage_events`, 37 appels LLM réussis ont été observés:

- `gemini/gemini-3-flash-preview`: 31 appels
- `openai/gpt-5.4-nano`: 5 appels
- `gemini/gemini-2.5-flash`: 1 appel
- `openai/gpt-5.4-mini`: 0 appel observé

Par source principale:

- `dispatcher-v2-llm`: 11 appels, tous `gemini-3-flash-preview`
- `prepare_attack_card.local_dispatcher`: 4 appels, tous `gemini-3-flash-preview`
- `prepare_defense_card.local_dispatcher`: 5 appels, tous `gemini-3-flash-preview`
- `demotivation_repair.local_dispatcher`: 2 appels, tous `gemini-3-flash-preview`
- `status_recap.local_dispatcher`: 2 appels, tous `gemini-3-flash-preview`
- `sophia-brain:companion`: 5 appels, tous `gpt-5.4-nano`

Conclusion modèle: la majorité ne passe pas par GPT 5.4 mini. Les variables locales lues dans `supabase/.env` indiquent bien `GLOBAL_AI_MODEL=gpt-5.4-mini` et `SOPHIA_DISPATCHER_LLM_MODEL=gpt-5.4-mini`, mais le worker local exécuté pendant ce run n'a pas utilisé ces valeurs pour les dispatchers. Cause probable: environnement Edge local déjà lancé avec anciennes variables ou configuration runtime non rechargée.

**Effets durables observes**
- `user_attack_cards`: 0
- `user_defense_cards`: 0
- `scheduled_checkins`: 1 pending one-shot reminder à 19:00 Europe/Paris
- `user_plan_item_entries`: 0

## Verdict Global

**yellow**

La qualité conversationnelle et les choix de routing sont meilleurs que le run 20T précédent, surtout sur le choix `Préparer le terrain` et la sortie vers `prepare_defense_card`. Mais ce run ne valide pas le passage majoritaire à GPT 5.4 mini: les traces montrent surtout `gemini-3-flash-preview`, et le problème status inline pendant flow actif reste présent.
