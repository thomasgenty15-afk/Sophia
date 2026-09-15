# QA Run Report - normal-conversation-25t-20260613-r7-reminder-trace-fix

## 1. Contexte Du Test

- Date: 2026-06-13.
- Run: `normal-conversation-25t-20260613-r7-reminder-trace-fix`.
- Persona: utilisateur QA temporaire local `qa-normal-normal-conversation-25t-20260613-r7-reminder-trace-fix-1781366782796@example.com`, supprimé en fin de run.
- Objectif: vérifier après fix que les durées/heures conversationnelles ne déclenchent pas `create_one_shot_reminder`, et que les traces ne marquent plus `flow_opportunity_verification` quand `normal_reply_fit_dominates`.
- Trajectoire: conversation simple -> durées conversationnelles sans rappel -> rappel explicite -> status -> sortie status -> demande explicite carte puis abandon -> conversation simple -> status final.
- Surfaces visées: dispatcher global, normal_reply, one_shot_reminder, status_recap, prepare_attack_card, active-flow exit, direct_effects.
- Cadre IA réel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, exécution hors sandbox, aucun renderer déterministe, aucun fallback direct.
- Artefacts bruts: `tmp/qa-normal-conversation/normal-conversation-25t-20260613-r7-reminder-trace-fix/state.json`.
- Cleanup: ciblé par user QA. `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users` nettoyés. `user_memories` renvoie toujours `404`.
- Validité QA: valide.

## 2. Tours De Conversation

### Tours 1-5

**Verdict des tours:** green

**User / Sophia**
- T1: demande de discussion simple sans plan ni outil. Sophia répond en `normal_reply`.
- T2: "parler deux minutes, pas programmer quoi que ce soit". Sophia reste en conversation, aucun rappel.
- T3: brouillard + jugement. Sophia reste en `normal_reply`.
- T4: demande directe "est-ce que je dramatise". Sophia reste en `normal_reply`; pas de `flow_opportunity_verification`.
- T5: "reste avec moi cinq minutes [...] sans rappel et sans outil". Sophia reste en `normal_reply`.

**Trace courte**
- T2: `response_owner=normal_reply`, `direct_effects=[]`, `direct_effects_to_run=[]`, `executed_tools=[]`.
- T4: `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`.
- T5: `response_owner=normal_reply`, `direct_effects=[]`, `direct_effects_to_run=[]`.

**Analyse**
- Le fix T6 précédent est vérifié sur deux paraphrases: "parler deux minutes" et "reste avec moi cinq minutes".
- Le warning trace T5 précédent ne réapparaît pas.

### Tour 6

**Verdict du tour:** green

**User**
> Ok, là c'est différent: programme-moi un rappel demain à 9h pour ouvrir le dossier administratif.

**Sophia**
> C'est programmé pour dimanche 14 juin à 09:00: je te rappellerai de ouvrir le dossier administratif.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- durable_effect: `scheduled_checkins.id=be1419c8-1fd0-4979-a29a-179cd3e67838`, `scheduled_for=2026-06-14T07:00:00+00:00`

**Analyse**
- Le durcissement anti-faux-positif n'a pas cassé le positif: demande explicite de rappel => rappel créé.
- Warning visible mineur: "de ouvrir" au lieu de "d'ouvrir".

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATUS-01 — projection/restition trop large

**User**
> Qu'est-ce qui a été créé exactement jusque-là ? Réponds factuellement.

**Sophia**
> Voici ce qui est enregistré pour le moment :
> - Un rappel : « ouvrir le dossier administratif », prévu pour le 14 juin à 09:00.
> - Tes préférences coach : [...]
> Il n'y a pas encore de cartes ni de rappels récurrents créés.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`

**Analyse si yellow/red**
- Symptôme: Sophia ajoute les préférences coach alors que la question porte sur ce qui a été créé.
- Source amont probable: status_recap read_scope/restitution inclut trop de catégories pour un status "créé exactement".
- Owner runtime: `status_recap`.
- Correction recommandée: quand le user demande "ce qui a été créé", restituer les effets créés/committés, pas les préférences existantes non modifiées.

### Tour 8

**Verdict du tour:** green

**User**
> Ok merci. Maintenant réponds juste comme une personne: tu crois que ça suffit de juste ouvrir le dossier demain ?

**Sophia**
> Oui, je pense que ça peut largement suffire. [...]

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`

**Analyse**
- Sortie de `status_recap` réussie.

### Tour 9

**Verdict du tour:** green

**User**
> Le piège, c'est que si j'ouvre le dossier et que c'est pénible, je vais sûrement partir sur mon téléphone. Mais je ne demande pas une carte, juste ton avis.

**Sophia**
> Je vois très bien le piège [...] sans te lancer dans une carte ni une décision compliquée [...]

**Trace courte**
- response_owner: `normal_reply`
- direct_effects: []
- tool_skill_intents: []

**Analyse**
- Pas de forcing de carte malgré signal action/piège.

### Tours 10-11

**Verdict des tours:** green

**User / Sophia**
- T10: demande explicite de carte d'attaque. Sophia route vers `prepare_attack_card`.
- T11: stop carte, retour discussion simple. Sophia revient en `normal_reply`.

**Trace courte**
- T10: `response_owner=tool_skill`, `selected_handler=prepare_attack_card`, `route_reason=tool_skill_intent_start`.
- T11: `response_owner=normal_reply`, `route_reason=normal_reply_default`.

**Analyse**
- Le système reste bien sensible aux demandes explicites et sait sortir quand le user abandonne.

### Tours 12-16

**Verdict des tours:** green

**User / Sophia**
- Conversation normale sur fatigue vs paresse, demande de réponse courte, et "ne pas analyser plus loin".
- T14: "pendant deux minutes [...] ne crée rien de plus" ne déclenche aucun rappel.

**Trace courte**
- Tous: `response_owner=normal_reply`.
- T14: `direct_effects=[]`, `direct_effects_to_run=[]`, `executed_tools=[]`.

**Analyse**
- Troisième validation du fix reminder: une durée conversationnelle avec consigne de non-création reste bien normal_reply.

### Tour 17

**Verdict du tour:** green

**User**
> Avant de finir, redis-moi seulement les rappels créés aujourd'hui, sans parler des préférences coach.

**Sophia**
> Je vois un rappel en attente : ouvrir le dossier administratif, prévu pour demain à 09:00. C'est le seul que j'ai pour le moment.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`

**Analyse**
- Status scoped correctement aux rappels; ne mentionne pas les préférences coach.

### Tour 18

**Verdict du tour:** green

**User**
> Merci. Maintenant on revient hors statut: je veux juste finir sur une note simple.

**Sophia**
> Avec plaisir [...] tu es dans une lourdeur de fatigue, pas dans une faute morale.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`

**Analyse**
- Sortie de status réussie ici.

### Tours 19-22

**Verdict des tours:** green

**User / Sophia**
- T19: "Demain à 9h [...] je ne demande rien" => pas de rappel.
- T20: "dix minutes" comme durée d'effort => pas de rappel.
- T21: "ne m'embarque pas dans une structure" => réponse humaine sans flow.
- T22: résumé sans mentionner d'outil => normal_reply.

**Trace courte**
- T19-T22: `response_owner=normal_reply`, `direct_effects=[]`, `executed_tools=[]`.

**Analyse**
- Le fix reminder tient aussi quand une heure ou une durée apparaissent après un rappel déjà actif.

### Tour 23

**Verdict du tour:** green

**User**
> Dernière vérification factuelle: combien de rappels sont vraiment en attente après notre échange ?

**Sophia**
> Après vérification, tu as un seul rappel en attente : celui pour ouvrir le dossier administratif, prévu à 09:00. Il n'y a aucun rappel récurrent enregistré de mon côté.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`

**Analyse**
- Confirme durablement qu'un seul rappel existe; les durées conversationnelles n'ont pas créé d'effet.

### Tour 24

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-02 — ancien flow capture une nouvelle intention

**User**
> Ok, hors statut maintenant: finis juste en me disant si la conversation est restée assez légère.

**Sophia**
> On sort du récapitulatif factuel pour revenir à l'humain. [...] même en ayant en tête ton rappel [...] et tes préférences de coach [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `active_status_recap_local_dispatcher`

**Analyse si yellow/red**
- Symptôme: le user demande explicitement "hors statut", mais `status_recap` reste owner au tour courant et réintroduit rappel/préférences coach.
- Source amont probable: prompt local `status_recap` / active local flow exit policy encore pas assez respectée sur une demande méta-humaine après status.
- Owner runtime: `status_recap`.
- Correction recommandée: renforcer l'exit local avec exemple "hors statut / sans récap / réponds humainement / est-ce que la conversation était légère" => `exit_to_global_dispatcher`, pas réponse locale.

### Tour 25

**Verdict du tour:** green

**User**
> Non, vraiment sans récap ni préférence coach. Une phrase humaine courte pour finir.

**Sophia**
> T’as été clair, et ça me suffit : merci d’avoir gardé ça simple jusqu’au bout.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`

**Analyse**
- Le système récupère au tour suivant.

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Le faux forcing de rappel est corrigé sur T2, T5, T14, T19 et T20.
- Le rappel explicite T6 fonctionne toujours.
- Le warning trace `flow_opportunity_verification` ne réapparaît pas sur T4.
- Sophia ne force pas une carte quand le user dit "je ne demande pas une carte" à T9.
- Elle entre bien en carte quand c'est explicitement demandé à T10, puis sort correctement à T11.
- La conversation reste globalement légère après T12, et respecte mieux les demandes de brièveté.

**Problèmes**
- T7: status_recap restitue trop large en ajoutant les préférences coach à une question sur ce qui a été créé.
- T24: status_recap reste owner malgré "hors statut", ce qui rend la fin un peu collante.
- T6: formulation visible "je te rappellerai de ouvrir" est maladroite.

**Fix proposé**
- Source amont principale restante: `status_recap` local dispatcher / visible scope.
- Correction recommandée: renforcer la notion de scope exact de status et d'exit quand le user demande explicitement "hors statut / sans récap / comme une personne".
- Tests d'invariant attendus:
  - "ce qui a été créé" => effets créés seulement, pas préférences existantes.
  - "hors statut maintenant" après un status => `normal_reply`.
  - rappel explicitement créé => confirmation grammaticalement naturelle.

## 4. Analyse Système

**Verdict: yellow**

**Routage**
- `normal_reply` domine correctement les tours conversationnels avec durée ou heure non impérative.
- `create_one_shot_reminder` ne s'active que sur T6, où la demande est explicite.
- Aucun `direct_effect` parasite n'apparaît sur les tours de durée conversationnelle.
- `flow_opportunity_verification` ne pollue plus la trace quand le tour reste normal_reply.
- `status_recap` fonctionne pour les status explicites, mais reste trop collant à T24.

**Skills / Operations / Tools**
- One-shot reminder: success T6, DB correcte, cleanup OK.
- Status recap: bon T17/T23, trop large T7, collant T24.
- Prepare_attack_card: entrée explicite T10, sortie T11; non évalué comme axe principal de ce run.

**Effets durables**
- Effet attendu: un seul rappel ponctuel créé à T6.
- Effets indésirables: aucun rappel supplémentaire malgré T2/T5/T14/T19/T20.
- Cleanup: rappel + user QA supprimés. `user_memories` 404 non bloquant, déjà connu.

## Verdict Global

**Yellow.**

Les deux fixes ciblés sont validés en run réel: plus de faux positif `create_one_shot_reminder` sur durées/heures conversationnelles, et plus de trace `flow_opportunity_verification` incohérente sur les tours normal_reply. Le run n'est pas green à cause de `status_recap`: il restitue encore trop large à T7 et reste owner à T24 malgré une demande explicite de sortir du statut.
