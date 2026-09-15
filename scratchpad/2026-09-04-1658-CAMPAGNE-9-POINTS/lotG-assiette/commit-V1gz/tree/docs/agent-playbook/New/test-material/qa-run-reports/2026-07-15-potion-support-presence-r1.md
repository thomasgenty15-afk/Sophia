# QA Run Report — Potion Support Presence R1

## 1. Contexte Du Test

- Date: 2026-07-15
- Run: `potion_support_presence_20260715_r1`
- Persona: contexte conversationnel de type Rose ; compte technique temporaire `qa-skill`, connexion `all_skills_potion_support_presence_20260715_r1`, user `0a1a239f-9341-4b29-9092-304eb873de0e`.
- Objectif: vérifier qu'une potion d'apaisement ouvre un soutien contextualisé, que les réponses liées restent dans Présence, puis qu'un changement de sujet explicite libère le flow dans le même tour.
- Trajectoire: activation potion hors plan -> sept slots dynamiques -> `process-checkins` J1 -> ouverture proactive -> Présence liée à la potion -> deux réponses liées -> pivot produit -> dispatcher global -> `product_help`.
- Surfaces visees: `activate-potion-v1`, contexte evidence-gated, `scheduled_checkins`, `process-checkins`, `potion-support-opening-v1`, Presence, dispatcher global, `product_help`, `memory_plan`, état durable de campagne.
- Cadre IA reel: Supabase local ; activation et ouverture avec IA réelle ; tours utilisateur via `/functions/v1/test-send-message` avec `force_full_ai=true` ; aucun renderer déterministe, aucun fallback direct, messages choisis après lecture du tour précédent.
- Validite QA: valide. Auth locale vérifiée HTTP 200 ; Edge Functions locales disponibles ; aucun timeout ni retry ; connexion temporaire et données du run supprimées en fin de QA.

## 2. Tours De Conversation

### Ouverture proactive J1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Aucun message utilisateur sur ce tour : déclenchement planifié de J1 après plus de deux heures sans échange.

**Sophia**
> Le déménagement de samedi a l’air de beaucoup peser, surtout avec l’impression que tout repose sur toi. Est-ce qu’il y a un point précis qui te pèse le plus en ce moment ?

**Trace courte**
- http_status: 200
- response_owner: proactif, hors dispatcher global
- selected_handler: `process-checkins` -> `potion-support-opening-v1`
- route_reason: check-in potion J1 dû, fenêtre directe WhatsApp ouverte
- safety: aucun signal
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: sans objet sur l'ouverture proactive
- executed_tools: aucun
- durable_effect: check-in J1 `sent` ; `draft_message` généré au dernier moment ; `anchor_fact` relié à `potion_answer.pressure_source` ; Presence armée avec `awaiting_first_reply=true`.

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Oui. Le pire, c’est de devoir gérer seule la remise des clés, les changements d’adresse et les derniers cartons. J’ai la sensation que si je lâche un truc, tout va partir de travers.

**Sophia**
> Ce que tu portes là, c’est énorme: la remise des clés, les changements d’adresse, les derniers cartons, et en plus cette impression que tu n’as pas le droit à l’erreur. Pas étonnant que ton cerveau soit en mode alerte maximale.
>
> Et la sensation que “si je lâche un truc, tout va partir de travers” est très dure à vivre — même si, honnêtement, tout ne va sans doute pas s’effondrer au moindre oubli. Mais quand tout repose sur toi, ça se ressent comme si chaque détail était critique. Ce soir, le plus important, ce n’est pas de tout résoudre, c’est de ne pas porter tout ça comme un bloc unique. Un bloc “administratif”, un bloc “cartons”, un bloc “remise des clés”. Rien que les séparer un peu, ça redonne un peu d’air. 💛

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- selected_handler: `presence_conversation`
- route_reason: `active_presence_conversation`
- active_flow_arbitration: `continue_active`, `resume_active`
- safety: `none`
- direct_effects: []
- operation: aucune
- pending_confirmation: aucune
- memory_plan: `response_intent=supportive_presence`, `memory_mode=broad`, `model_tier_hint=deep`
- executed_tools: []
- durable_effect: aucun effet produit ; Presence maintenue ; premier reply consommé sémantiquement.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Ma sœur vient justement de me proposer de prendre les changements d’adresse avec moi demain. Ça m’enlève un poids, mais la remise des clés reste complètement floue parce que l’agence ne m’a toujours pas donné d’heure.

**Sophia**
> Déjà, le fait que ta sœur prenne les changements d’adresse avec toi demain, c’est loin d’être rien. Ça enlève un vrai morceau du poids que tu portais seule.
>
> Le flou sur la remise des clés, par contre, c’est typiquement le genre de truc qui use parce que tu ne peux rien verrouiller tant qu’ils ne t’ont pas répondu. Là, le problème, ce n’est pas que tu gères mal: c’est qu’on te laisse dans l’attente. Si tu veux, demain matin, le plus simple sera sans doute de les relancer très directement pour obtenir un créneau.

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- selected_handler: `presence_conversation`
- route_reason: `active_presence_conversation`
- active_flow_arbitration: `continue_active`, `resume_active`
- safety: `none`
- direct_effects: []
- operation: aucune
- pending_confirmation: aucune
- memory_plan: `response_intent=supportive_presence`, `memory_mode=broad`, `model_tier_hint=deep`
- executed_tools: []
- durable_effect: aucun ; Presence maintenue ; l'évolution apportée par l'utilisateur est intégrée sans répéter l'ouverture.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Merci, ça me suffit pour le déménagement. Autre sujet : où est-ce que je peux changer mon mot de passe dans Sophia ?

**Sophia**
> Je n’ai pas la destination exacte sourcée pour changer le mot de passe. Dans ce que j’ai sous la main, je vois seulement Compte > Gérer mon abonnement et la section de suppression de compte.
>
> Si tu veux, je peux t’aider à trier où regarder dans Compte sans te faire perdre de temps.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: []
- operation: aucune
- pending_confirmation: aucune
- memory_plan: `response_intent=product_help_question`, `memory_mode=none`, `model_tier_hint=lite`
- executed_tools: []
- durable_effect: état actif Presence supprimé dans le même tour ; campagne potion toujours `active` avec J2-J7 `pending`, attendu car l'utilisateur a clos le sujet sans demander l'arrêt des futurs rendez-vous.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- L'ouverture cite le vrai motif de pression et pose une question spécifique au lieu d'envoyer une phrase générique.
- Le premier reply reçoit un soutien plus développé, proportionné au niveau `submerge`, sans pousser vers une feature ou une opération.
- Le second reply distingue correctement ce qui s'est allégé de ce qui reste incertain ; Sophia ne rejoue pas le même message de soutien.
- Le pivot vers une question produit est naturel et immédiat. L'utilisateur n'a pas besoin de parler comme un test pour sortir de Présence.
- La réponse produit reste honnête sur l'absence de source exacte au lieu d'inventer un chemin.

**Problemes**
- Aucun problème bloquant. Warning mineur au tour 1 : `énorme` et `mode alerte maximale` accentuent fortement l'état, mais le niveau déclaré était `submerge` et la suite redonne une structure concrète ; cela ne justifie pas un verdict yellow sur ce run.

**Fix propose**
- Source amont: sans objet.
- Correction recommandee: aucune correction issue de ce run ; surveiller la calibration d'intensité sur des variantes où le signal initial est plus faible.
- Tests d'invariant attendus: variante signal faible, variante réponse très courte, variante refus de parler, avant toute conclusion plus large.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- L'ouverture proactive ne passe pas par le dispatcher global et arme le moteur Présence existant avec une provenance potion.
- Les deux réponses liées gardent `presence_conversation` comme owner avec `continue_active`.
- Le changement de sujet explicite libère Présence et redonne le tour au dispatcher global, qui choisit `product_help` immédiatement.

**Skills / Operations / Tools**
- Aucun nouveau flow conversationnel potion n'est créé : le door-opener réutilise bien Présence.
- Aucun tool, aucune opération et aucun direct effect ne sont exécutés pendant le soutien.
- Le tour produit n'hérite pas du contexte émotionnel comme owner actif.

**Memory / Effets durables**
- L'activation crée sept slots dynamiques sans message pré-généré.
- J1 est généré à l'envoi depuis deux preuves structurées de potion ; l'anchor visible est relié à `pressure_source`.
- Après J1 : un check-in `sent`, six `pending`, une entrée `opening_history` avec `outcome=sent`.
- Après le pivot : `__active_conversation_skill_v1` est absent ; la campagne reste active, ce qui correspond à l'absence d'opt-out explicite.
- Nettoyage final : user Auth supprimé (`404`), profil et check-ins restants `0`.

**Problemes**
- Aucun problème système observé dans la trajectoire testée.
- Hors scope de ce run : consentement template hors fenêtre 24 h, agrégation J2 des messages intersession, préemption daily/weekly, safety et annulation explicite de campagne.

**Fix propose**
- Source amont: sans objet.
- Correction recommandee: aucune.
- Tests d'invariant attendus: créer des variantes dédiées aux surfaces hors scope ci-dessus.

## Verdict Global

- Verdict: green
- Raison principale: le soutien est groundé, Présence conserve uniquement les réponses liées et cède correctement au dispatcher global lors du pivot produit, sans effet durable parasite.
- Follow-up prioritaire: exécuter un run complémentaire J2 intersession puis un run de préemption daily/weekly ; ne pas généraliser ce résultat aux branches hors scope.
