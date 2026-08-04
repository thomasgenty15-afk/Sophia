# QA Run Report — Potion Support J2/J3 Intersession R2

## 1. Contexte Du Test

- Date: 2026-07-15
- Run: `potion_support_j2_j3_intersession_20260715_r2`
- Persona: compte temporaire `qa-skill`, connexion `all_skills_potion_support_j2_j3_intersession_20260715_r2`, user `2353dbf5-72b9-447b-b091-a378fd694c75`.
- Objectif: vérifier J2 et J3 d'une potion d'apaisement avec reprise cumulative, messages intersession web + WhatsApp, fermeture locale de Présence et annulation explicite de campagne.
- Trajectoire: activation -> J1 -> intersession web -> J2 -> conversation Presence -> sortie locale -> intersession web -> J3 -> opt-out explicite -> annulation J4-J7.
- Surfaces visees: contexte initial potion, curseur cross-channel, rolling evidence, cumulative ledger, `process-checkins`, gate calme 2 h, ouverture dynamique, Presence, cancellation runtime, effets durables.
- Cadre IA reel: Supabase local ; activation et ouvertures via le vrai scheduler ; tours utilisateur via `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true` ; messages choisis après chaque réponse ; aucun renderer ou fallback déterministe ; aucun code produit modifié.
- Validite QA: valide. Deux tentatives techniques de compression ont été arrêtées avant scheduler (mauvais nom de champ QA puis payload trop large). Le premier passage J2 a correctement déclenché `potion_support_quiet_window_2h`; après synchronisation des horodatages du profil temporaire, le vrai scheduler a envoyé J2. Ces incidents sont documentés et ne changent pas le verdict produit.

## 2. Tours De Conversation

### Ouverture proactive J1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Aucun message utilisateur : activation d'une potion d'apaisement autour d'un entretien de titularisation jeudi.

**Sophia**
> Ton entretien de titularisation jeudi est bien là, et tu as déjà préparé des exemples. Si tu veux, on peut juste mettre en une phrase ce que tu as apporté à l’équipe, pour que ce soit plus facile à retrouver le moment venu.

**Trace courte**
- http_status: 200
- response_owner: proactif hors dispatcher global
- selected_handler: `process-checkins` -> `potion-support-opening-v1`
- safety: none
- durable_effect: J1 `sent`, `anchor_fact` relié à `pressure_source`, Presence armée.

### Tour J1-1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Oui. J’ai surtout rendu les passages de relais plus clairs entre les équipes, et ça a évité plusieurs urgences de dernière minute. Mais quand je dois le dire à voix haute, j’ai peur que ça sonne prétentieux.

**Sophia**
> Le fond est solide: tu ne parles pas d’une qualité vague, tu parles de passages de relais plus clairs entre les équipes et d’urgences évitées. Ce n’est pas prétentieux, c’est factuel.
>
> Tu peux le dire comme ça: « J’ai contribué à clarifier les passages de relais entre les équipes, ce qui a permis de limiter plusieurs urgences de dernière minute. » C’est sobre, concret, et ça met l’accent sur l’impact sans te sur-vendre.

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- selected_handler: `presence_conversation`
- route_reason: `active_presence_conversation`
- safety: none
- direct_effects: []

### Tour J1-2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Oui, cette formulation me ressemble. Je la garde et je m’arrête là pour ce soir.

**Sophia**
> Parfait, c’est simple et juste pour toi. Repose-toi pour ce soir 🌙

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- durable_effect: Presence WhatsApp fermée ; campagne conservée.

### Intersession J1 -> J2, tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Mise à jour du lendemain : j’ai testé la formulation avec mon responsable et elle passe bien. Ce qui m’a déstabilisée, c’est le silence juste après sa question ; j’ai rempli le vide trop vite au lieu de respirer.

**Sophia**
> Déjà, c’est un vrai bon signe : ta formulation passe bien avec ton responsable. Et tu as repéré un truc très précis dans la scène — le silence après sa question, puis ton réflexe de le remplir trop vite. Ça, c’est une observation fine, pas un échec.
>
> Le point sensible n’était visiblement pas le fond de ce que tu disais, mais ce micro-moment de vide. [...] Ton prochain levier n’est probablement pas « mieux formuler », mais « tenir 2 secondes de silence de plus ».

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- selected_handler: `presence_conversation`
- scope: web
- safety: none
- direct_effects: []

### Intersession J1 -> J2, fermeture

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Oui, je vais tester ces deux secondes de silence. Ça me suffit comme repère pour aujourd’hui.

**Sophia**
> Parfait, c’est un repère simple et très concret pour demain. Et pour ce soir, ça suffit largement : tu as déjà bien avancé. 🌙

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- durable_effect: aucun opt-out de campagne ; la portée « pour aujourd'hui » est conservée.

### Ouverture proactive J2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Aucun nouveau message : le reducer relit neuf messages cross-channel depuis le curseur J1.

**Sophia**
> Ton entretien de titularisation jeudi est toujours le cap, et ta formulation sur ce que tu as apporté à l’équipe passe bien avec ton responsable. Le point à surveiller reste surtout le petit silence juste après une question, pour ne pas remplir le vide trop vite. Tu veux qu’on garde juste un mini-repère pour ce moment-là ?

**Trace courte**
- http_status: 200
- selected_handler: `preparePotionSupportOpening`
- decision: `send`
- integrated_message_ids: 9
- durable_effect: J2 `sent`, Presence armée, curseur avancé au dernier message intersession.
- grounding: formulation validée et silence reliés aux messages user web.

### Tour J2-1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Oui, le repère des deux secondes me va. Pendant l’essai j’ai réussi à laisser le silence une fois, mais sur la question suivante je me suis remise à parler trop vite parce que j’avais peur de perdre mon exemple.

**Sophia**
> Du coup, tu as déjà le plus important: tu as réussi une fois, donc tu sais le faire, et ce qui te fait repartir trop vite est assez clair — la peur de perdre ton exemple. Ce que tu peux garder en tête, c’est: silence de deux secondes, puis une phrase d’ancrage avant de développer, par exemple « je vais prendre un exemple concret ». Ça te laisse reprendre la main sans te précipiter 🙂

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- active_flow_arbitration: `continue_active`
- safety: none
- executed_tools: []
- durable_effect: aucun.

### Tour J2-2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Merci, cette phrase d’ancrage me donne un repère concret. Je vais la tester au prochain essai et je te raconterai comment ça se passe.

**Sophia**
> Ça me paraît très bien: tu gardes un repère simple, testable, sans te surcharger. Repose-toi là-dessus pour ce soir, et on ajustera après ton prochain essai 💛

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- route_reason: `active_presence_conversation`
- durable_effect: Presence reste active ; aucun effet produit.

### Tour J2-3, sortie locale

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Je vais te laisser pour maintenant. À plus tard.

**Sophia**
> À plus tard, prends soin de toi. On reprendra quand tu voudras.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- signal Presence: `kind=closure`
- durable_effect: état Presence WhatsApp supprimé ; reminder toujours actif.

### Intersession J2 -> J3, tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Nouvelle mise à jour après mon essai : j’ai laissé les deux secondes de silence et j’ai utilisé « je vais prendre un exemple concret ». Une question m’a surprise, mais j’ai retrouvé mon exemple sans me précipiter. J’ai encore la gorge serrée juste avant de commencer.

**Sophia**
> Là, on voit une vraie évolution : tu as gardé les deux secondes de silence, tu t’es appuyée sur ta phrase repère, et même avec une question surprise tu n’as pas foncé dans la précipitation.
>
> La gorge serrée juste avant de commencer, ce n’est pas incohérent avec le reste. Ton corps déclenche encore l’alerte, mais toi, dans l’action, tu tiens beaucoup mieux qu’avant. [...] Tu as retrouvé ton exemple au lieu de te perdre dans le vide.

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- selected_handler: `presence_conversation`
- scope: web
- safety: none
- direct_effects: []

### Intersession J2 -> J3, fermeture

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Merci, je voulais simplement déposer cette mise à jour. Je te laisse pour maintenant, à plus tard.

**Sophia**
> Merci pour la mise à jour, c’est net et solide. Tu as tenu le silence, gardé ta phrase repère, et avancé malgré la gorge serrée. À plus tard 🌙

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- durable_effect: état Presence web supprimé ; campagne conservée.

### Ouverture proactive J3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` — preuve -> décision proactive cassée

**User**
> Aucun nouveau message : le reducer relit onze messages post-J2, web et WhatsApp.

**Sophia**
> Tu as déjà un repère simple qui tient: deux secondes de silence, puis « je vais prendre un exemple concret ». Si tu veux, on peut juste garder ce mini-repère pour le moment où une question te surprend, sans en rajouter davantage.

**Trace courte**
- http_status: 200
- selected_handler: `preparePotionSupportOpening`
- decision: `send`
- integrated_message_ids: 11
- durable_effect: J3 `sent`, `opening_history` contient J1/J2/J3, curseur avancé.
- warning grounding: le texte visible reprend la phrase d'ancrage et la question surprise observées après J2, mais `anchor_fact.evidence_refs` et `question_candidate.evidence_refs` déclarent seulement deux messages plus anciens de J1->J2.

**Analyse si yellow/red**
- Symptome: le message est factuellement correct, mais sa provenance déclarée ne justifie pas les éléments précis surfacés.
- Source amont probable: le reducer LLM sélectionne un anchor ancien tandis que `opening_text` puise librement dans d'autres preuves ; la validation vérifie seulement qu'un anchor connu existe.
- Owner runtime: `preparePotionSupportOpening`, parse/validation evidence-gated.
- Meilleure correction selon les guidelines: chaque proposition visible de `opening_text` doit être couverte par les evidence ids sélectionnés, ou l'ouverture doit être reconstruite uniquement depuis `anchor_fact` et `question_candidate` validés.
- Pourquoi ce n'est pas un patch local: le texte est bon ; c'est le contrat de provenance général qui doit être rendu vérifiable.

### Tour J3-1, annulation explicite

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Oui, je garde ce repère. Je me sens assez stable maintenant. Ne me relance plus pour cette potion, je préfère continuer seule.

**Sophia**
> C’est noté, je ne te relancerai plus pour cette potion. Tu gardes ton repère, et tu continues à ton rythme.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- Presence signal: `kind=closure`
- direct_effects: []
- durable_effect: reminder `archived`, `terminal_reason=cancelled_user_boundary`, J4-J7 `cancelled`, aucun pending WhatsApp, aucun active flow résiduel.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La progression est naturelle : formulation de fond en J1, gestion du silence en J2, maintien du repère face à une question surprise en J3.
- Sophia réutilise les messages intersession sans demander à l'utilisateur de répéter son contexte.
- « Ça me suffit pour aujourd'hui » ne coupe pas la campagne ; « je te laisse pour maintenant » ferme seulement la session ; « ne me relance plus pour cette potion » annule réellement la campagne.
- Les réponses Presence restent proportionnées et aucun artefact ou tool n'est poussé.

**Problemes**
- Ouverture J3: warning invisible pour l'utilisateur mais important pour la confiance : les références déclarées ne couvrent pas tout le texte. Famille: `BF-PROACTIVE-01`. Sévérité humaine: faible tant que le contenu reste exact, élevée si une future génération dérive.

**Fix propose**
- Source amont: compilation de l'ouverture depuis les preuves sélectionnées.
- Correction recommandee: lier chaque claim visible aux preuves effectivement déclarées, avec fallback `skip_no_grounding` si la couverture manque.
- Tests d'invariant attendus: nouveau fait J2 uniquement, ancien fait J1 uniquement, mélange J1+J2, absence de preuve et phrase contradictoire.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Les réponses aux ouvertures J2/J3 entrent bien dans Presence.
- Les deux sorties locales repassent à `normal_reply` sans toucher à la campagne.
- L'opt-out explicite est priorisé et ferme la campagne dans le même tour.

**Skills / Operations / Tools**
- Aucun nouveau flow potion conversationnel n'est créé ; le door-opener réutilise Presence.
- Aucun tool ni effet métier parasite n'est exécuté.
- La gate 2 h est active et a été observée réellement (`potion_support_quiet_window_2h`) avant l'envoi J2.

**Memory / Effets durables**
- J2 intègre neuf messages cross-channel ; J3 en intègre onze autres, sans relire deux fois la même frontière.
- `rolling_evidence` contient les messages web et WhatsApp ; le ledger cumule faits, fils ouverts et gêne corporelle résiduelle.
- `opening_history` contient trois ouvertures `sent` ; J1-J3 sont `sent`, J4-J7 `cancelled_user_boundary`.
- Reminder final `archived`, aucun pending, aucun état Presence résiduel.
- Nettoyage final: Auth `404`, profils `[]`, check-ins `[]`.
- Tests ciblés: `13 passed | 0 failed` sur runtime, cancellation et follow-up.

**Problemes**
- J3: l'opening visible utilise des éléments récents que les champs structurés `anchor_fact`/`question_candidate` n'attribuent pas aux bonnes preuves. Famille: `BF-PROACTIVE-01`. Impact système: l'evidence gate est partielle et ne garantit pas réellement chaque claim visible.

**Fix propose**
- Source amont: schéma de sortie du reducer et validation post-LLM.
- Correction recommandee: produire l'ouverture à partir d'unités `{text,evidence_ids}` validées ou vérifier une couverture claim-par-claim avant envoi.
- Tests d'invariant attendus: unitaires de couverture, paraphrases, contradiction, message assistant non probant, puis rerun réel J2/J3.

## Verdict Global

- Verdict: yellow
- Raison principale: les mécanismes de reprise, continuité cross-channel, fermeture locale et annulation terminale fonctionnent, mais la provenance déclarée de l'ouverture J3 ne couvre pas tous les éléments visibles.
- Follow-up prioritaire: renforcer le contrat de couverture evidence -> opening, puis rejouer J3 avec un fait nouveau présent uniquement dans l'intersession J2->J3.
