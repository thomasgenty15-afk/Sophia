# Memory V2 Audit Guide

STATUT: complet — Lot 6B

Structure standard: voir [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

Refonte de: [memory-audit-analysis-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/memory-audit-analysis-guide.md)

## 1. Objectif

Auditer la qualite du systeme memoire V2 sur une fenetre temporelle donnee, de bout en bout:

```
messages conversationnels + signaux implicites
→ memorizer (extraction + validation + scope tagging)
→ 6 couches memoire (cycle / transformation / execution / coaching / relational / event)
→ retrieval par intention (5 intents: answer_user_now, nudge_decision, daily_bilan, weekly_bilan, rendez_vous_or_outreach)
→ budget tokens par intent + scope-filtered queries
→ injection dans le contexte du tour
→ qualite de la reponse finale
```

Ce guide permet de repondre a:

- Le memorizer identifie-t-il les bons faits a persister ?
- Le tagging par couche est-il correct (cycle vs transformation vs execution vs relational) ?
- Le retrieval par intention charge-t-il le bon sous-ensemble de couches ?
- Le budget tokens de chaque intention est-il respecte ?
- L'injection est-elle proportionnee au besoin du tour ?
- La memoire de transformation est-elle bien cloisonnee ?
- La memoire relationnelle capte-t-elle les preferences de ton et de timing ?
- Les succes sont-ils memorises (pas seulement les problemes) ?
- Le handoff entre transformations preserve-t-il la bonne memoire ?
- La memoire de l'ancienne transformation n'est-elle pas chargee par defaut dans la nouvelle ?

### Questions d'audit cles

#### Heritees du V1 (conservees)

- Le memorizer a-t-il identifie les faits importants ?
- A-t-il sur-stocke des micro-variations sans valeur ?
- Les memories persistees sont-elles reutilisees plus tard ?
- Le retrieval remonte-t-il les bons elements ?
- L'injection est-elle utile sans etre bruyante ?
- La reponse finale utilise-t-elle la bonne memoire ?

#### Nouvelles V2

- Le tagging par couche est-il correct (cycle vs transformation vs execution vs relational) ?
- Le retrieval par intention charge-t-il le bon sous-ensemble de couches ?
- Le budget tokens de chaque intention est-il respecte ?
- La memoire de transformation est-elle bien cloisonnee ?
- La memoire relationnelle capte-t-elle les preferences de ton et de timing ?
- Les succes sont-ils memorises (pas seulement les problemes) ?
- Le handoff entre transformations preserve-t-il la bonne memoire ?
- La memoire de l'ancienne transformation n'est-elle pas chargee par defaut dans la nouvelle ?

### Distinction fondamentale V2: memoire plate vs memoire structuree

La V1 utilisait une memoire plate: topics, globals, events, avec un retrieval purement semantique. Tout etait au meme niveau, sans notion de perimetre ni d'intention.

La V2 introduit 6 couches memoire avec scope tagging, un retrieval specialise par intention, et un budget tokens par intent. Cela permet de charger uniquement la memoire pertinente pour chaque contexte (un daily_bilan n'a pas besoin de la memoire relationnelle; un nudge_decision n'a pas besoin de la memoire de cycle).

Un audit V2 doit systematiquement verifier que la bonne memoire est au bon endroit (tagging) et qu'elle est chargee au bon moment (retrieval par intention).

## 2. Ce que le bundle V2 contient

La commande d'export memory V2 produit deux fichiers:

- un fichier JSON principal (trace + scorecard + annotations)
- un fichier transcript texte

Le JSON est la source d'audit complete.
Le transcript permet une lecture humaine rapide de la dynamique conversationnelle et des moments ou la memoire intervient.

### Differences avec le bundle V1

| Aspect | V1 | V2 |
|--------|----|----|
| Structure memoire | Plate (topics / globals / events) | 6 couches (cycle / transformation / execution / coaching / relational / event) |
| Retrieval | Semantique uniquement (embedding similarity) | Par intention (5 intents), scope-filtered, budget tokens |
| Scope tagging | Non (pas de notion de perimetre) | Oui (chaque fait tague cycle / transformation / relational / execution) |
| Retrieval par intention | Non | Oui (answer_user_now / nudge_decision / daily_bilan / weekly_bilan / rendez_vous_or_outreach) |
| Budget tokens | Non (tout est charge) | Oui (minimal / light / medium / full, max_tokens_hint par intent) |
| Cloisonnement transformation | Non | Oui (topic_memories filtrees par transformation_id) |
| Handoff | Non | Oui (memoire portee entre transformations via handoff_payload) |
| Memoire relationnelle | Non (preferences dans globals sans distinction) | Oui (couche dediee: preferences ton, timing, canaux) |

### Contrats de retrieval par intention (reference)

| Intent | Couches chargees | Budget tier | Max tokens hint |
|--------|------------------|-------------|-----------------|
| answer_user_now | cycle, transformation, execution, coaching, relational, event | full | 4000 |
| nudge_decision | execution, relational, event, coaching | light | 1200 |
| daily_bilan | execution, coaching, event | minimal | 600 |
| weekly_bilan | cycle, transformation, execution, coaching, event | medium | 2500 |
| rendez_vous_or_outreach | event, relational, execution | light | 1000 |

## 3. Structure du JSON exporte

Le bundle contient en haut niveau:

- `ok`
- `exported_at`
- `source`
- `request`
- `trace`
- `scorecard`
- `annotations`

### `source`

Identifie l'environnement de l'export:

- `supabase_url`: URL utilisee
- `connection_type`: `local` ou `env`

### `request`

Documente la fenetre demandee:

- `user_id`
- `scope`
- `from`, `to`
- `used_hours`

Verifier la fenetre avant toute conclusion. Une fenetre trop courte manque les patterns de reutilisation; une fenetre trop longue dilue la densite des signaux.

### `trace`

Le coeur du bundle. Contient:

#### `trace.window`

- `from`, `to`, `scope`, `hours`

C'est la verite de la fenetre analysee. Toujours la verifier.

#### `trace.summary`

Resume les volumes globaux:

- `messages_total`, `user_messages`
- `memorizer_runs_total`
- `retrieval_events_total`
- `persistence_events_total`

Interpretations utiles:

- Beaucoup de memorizer_runs avec peu de persistence_events → le memorizer extrait mais rejette beaucoup (verifier les seuils)
- Beaucoup de retrieval_events avec peu de hits → le retrieval cherche mais ne trouve pas (memoire mal tagguee ou pas encore persistee)
- Zero memorizer_runs sur une fenetre avec des messages → le memorizer ne se declenche pas du tout
- persistence_events eleves avec peu de retrieval → la memoire est stockee mais jamais reutilisee

#### `trace.messages`

Messages bruts avec:

- `id`, `role`, `content`, `scope`, `created_at`, `metadata`

Les messages utilisateur sont la verite source. Si le memorizer n'extrait rien d'un message contenant un fait important, c'est un probleme.

#### `trace.memorizer_runs`

Chronologie des executions du memorizer. Chaque run contient 3 etapes:

- **extraction**: faits candidats identifies dans le message
- **validation**: faits acceptes ou rejetes, avec raison
- **persistence**: action realisee pour chaque fait accepte (create / enrich / update / noop), avec scope tague

Chaque run est enrichi avec:

- `message_id`: message source
- `scope_tags`: distribution des scopes assignes (cycle, transformation, execution, relational)
- `facts_extracted`, `facts_accepted`, `facts_rejected`
- `persistence_actions`: detail par action (create, enrich, update, noop) et par couche

Cette section permet de verifier:

- Si le memorizer detecte les faits importants
- Si le tagging scope est correct (un fait de cycle n'est pas tague transformation)
- Si la validation n'est ni trop permissive ni trop stricte
- Si les actions de persistence sont coherentes (pas de create sur un fait deja existant)

#### `trace.retrieval_by_intent`

Chronologie des retrievals. Chaque entree contient:

- `at`: timestamp
- `intent`: l'intention (answer_user_now, nudge_decision, daily_bilan, weekly_bilan, rendez_vous_or_outreach)
- `layers_loaded`: couches effectivement chargees
- `budget_tier`: tier applique (minimal, light, medium, full)
- `tokens_used`: tokens consommes
- `hit_count`: nombre de memories remontees
- `scope_filters_applied`: filtres de scope effectivement appliques (cycle_id, transformation_id)

Cette section permet de verifier:

- Si les bonnes couches sont chargees pour chaque intention
- Si le budget est respecte (tokens_used <= max_tokens_hint du contrat)
- Si les filtres de scope sont appliques (transformation_id pour la couche execution)
- Si le hit_count est plausible (ni zero systematique ni explosion)

#### `trace.injection`

Pour chaque tour enrichi par la memoire:

- `turn_id`: tour concerne
- `total_tokens`: tokens injectes
- `blocks_by_layer`: nombre de blocks par couche (cycle, transformation, execution, coaching, relational, event)

Cette section permet de verifier:

- Si l'injection est proportionnee au besoin du tour
- Si une couche domine systematiquement (ex: event qui ecrase tout)
- Si l'injection est nulle sur des tours qui auraient du beneficier de memoire

#### `trace.handoff_events`

Si applicable (changement de transformation dans la fenetre):

- `at`: timestamp du handoff
- `from_transformation_id`, `to_transformation_id`
- `carried_memories`: memoires portees (avec layer et resume)
- `dropped_memories`: memoires laissees (avec raison)
- `summarized_memories`: memoires resumees pour compacter

Cette section permet de verifier:

- Si les techniques efficaces sont portees
- Si les techniques inefficaces sont portees (pour ne pas les re-tenter)
- Si la memoire de l'ancienne transformation n'est pas chargee par defaut dans la nouvelle
- Si le volume porte est raisonnable

#### `trace.unassigned_events`

Events non rattaches aux categories precedentes. A surveiller: trop d'events non assignes rend l'audit moins fiable.

#### Enrichissement par tour

Chaque `turn` est enrichi avec:

- `dispatcher.memory_plan`: intention memoire demandee par le dispatcher, couches demandees
- `v2_intent`: intention V2 resolue
- `retrieval`: par couche (cycle, transformation, execution, coaching, relational, event) — hits et tokens
- `injection`: tokens par couche, blocks injectes

### `scorecard`

Vue agregee pour aller vite sur les signaux importants.

#### `scorecard.coverage`

Couverture de la fenetre:

- `turns`: nombre de tours total
- `messages`: messages total (user + assistant)
- `memorizer_runs`: nombre d'executions du memorizer
- `events`: nombre total d'events memoire (retrieval + persistence)

Interpretations utiles:

- memorizer_runs << user_messages → le memorizer ne se declenche pas assez souvent
- events eleves avec peu de turns → activite batch (daily/weekly bilan) importante dans la fenetre

#### `scorecard.identification`

Qualite de l'extraction:

- `volume_extracted`: nombre de faits extraits
- `volume_accepted`: nombre de faits acceptes
- `acceptance_rate`: ratio accepted / extracted

Interpretations utiles:

- acceptance_rate < 30% → le memorizer extrait trop de bruit, la validation est trop stricte, ou les seuils d'extraction sont trop bas
- acceptance_rate > 95% → la validation est probablement trop permissive
- volume_extracted = 0 sur une fenetre riche → le memorizer est muet

#### `scorecard.tagging`

Distribution des scopes assignes:

- `distribution`: { cycle: N, transformation: N, execution: N, relational: N }

Interpretations utiles:

- cycle dominant alors que les messages parlent d'execution quotidienne → sur-classification cycle
- relational = 0 malgre des messages sur les preferences → la couche relationnelle est ignoree
- transformation = 0 alors que le user parle de sa transformation actuelle → le scope classifier ne detecte pas le bon niveau

#### `scorecard.persistence`

Actions de persistence par couche:

- `by_layer`: pour chaque couche (cycle, transformation, execution, coaching, relational, event):
  - `create`, `enrich`, `update`, `noop`
- `scope_tags_total`: distribution des scope tags

Interpretations utiles:

- Beaucoup de create sans enrich → les faits ne sont jamais enrichis, possiblement des doublons
- Beaucoup de noop → le memorizer tourne mais ne persiste rien de nouveau
- enrich sur des topics qui ne le meritent pas → sur-enrichissement de faits volatils

#### `scorecard.retrieval`

Par intention:

- Pour chaque intent (answer_user_now, nudge_decision, daily_bilan, weekly_bilan, rendez_vous_or_outreach):
  - `count`: nombre de retrievals
  - `hit_rate`: ratio de retrievals avec au moins 1 hit
  - `tokens_avg`: tokens moyens consommes
  - `layers_loaded_distribution`: { cycle: N, transformation: N, execution: N, coaching: N, relational: N, event: N }

Interpretations utiles:

- hit_rate < 50% pour answer_user_now → la memoire persistee n'est pas retrouvee quand l'utilisateur parle
- tokens_avg > max_tokens_hint du contrat → le budget est depasse
- daily_bilan qui charge systematiquement 6 couches → le contrat n'est pas respecte (devrait etre execution + coaching + event seulement)
- layers_loaded_distribution uniforme pour nudge_decision → le retrieval ne filtre pas correctement

#### `scorecard.injection`

Qualite de l'injection:

- `injection_rate`: % de tours avec injection de memoire
- `avg_tokens`: tokens moyens injectes par tour
- `distribution_by_layer`: { cycle: N, transformation: N, execution: N, coaching: N, relational: N, event: N }

Interpretations utiles:

- injection_rate < 20% → la memoire est rarement utilisee
- injection_rate = 100% → chaque tour est alourdi de memoire (possiblement inutile)
- Une couche qui domine la distribution (ex: event > 60%) → desequilibre a investiguer

#### `scorecard.reuse`

Delai entre persistence et reutilisation:

- `avg_delay_hours`: delai moyen entre le moment ou un fait est persiste et sa premiere reutilisation
- `never_reused_count`: nombre de faits persistes jamais reutilises dans la fenetre
- `reused_within_1h`: nombre de faits reutilises dans l'heure

Interpretations utiles:

- never_reused_count eleve → soit la fenetre est trop courte, soit la memoire persistee ne correspond pas a ce que le retrieval cherche
- avg_delay_hours tres bas (< 1h) → la memoire est bien reactive
- avg_delay_hours tres eleve (> 72h) → la memoire met trop longtemps a etre reutilisee, ou elle n'est pertinente que pour les bilans weekly

#### `scorecard.handoff`

Si applicable (changement de transformation dans la fenetre):

- `handoff_count`: nombre de handoffs
- `memories_carried`: nombre total de memories portees
- `memories_dropped`: nombre total de memories laissees
- `memories_summarized`: nombre total de memories resumees

Interpretations utiles:

- handoff sans memories_carried → rien n'est porte (la nouvelle transformation demarre a vide)
- memories_carried tres eleve → trop de memoire portee, risque de pollution

#### `scorecard.alerts`

Patterns detectes automatiquement:

- `tagging_mismatches`: faits dont le scope semble incorrect (cycle tague transformation, relational tague execution)
- `budget_overruns`: retrievals ou tokens_used > max_tokens_hint du contrat
- `layer_never_loaded`: couches jamais chargees alors qu'elles contiennent de la memoire
- `scope_mismatch_detected`: memoire chargee depuis une couche qui ne correspond pas a l'intention
- `memorizer_silent_turns`: tours avec messages riches mais zero extraction
- `retrieval_zero_hits_streak`: sequences de retrievals sans aucun hit
- `injection_without_retrieval`: injection sans retrieval correspondant

### `annotations`

Jugements humains optionnels. Par dimension et par label (`good`, `partial`, `miss`, `harmful`).

## 4. Methode d'audit

### Ordre recommande

1. **Lire le transcript** du debut a la fin. Reperer les faits importants mentionnes par l'utilisateur, les moments ou il se repete, les preferences exprimees, les succes et blocages.
2. **Consulter la scorecard**. Reperer les alertes, les taux anormaux (acceptance_rate, hit_rate, injection_rate), les desequilibres de tagging.
3. **Zoomer sur `trace.memorizer_runs`** autour des moments cles. Verifier extraction → validation → persistence avec scope. Le bon fait est-il extrait ? Le scope est-il correct ? L'action de persistence est-elle la bonne ?
4. **Verifier `trace.retrieval_by_intent`**. Pour chaque retrieval: l'intention est-elle la bonne ? Les couches chargees correspondent-elles au contrat ? Le budget est-il respecte ? Les filtres de scope sont-ils appliques ?
5. **Verifier `trace.injection`**. L'injection est-elle proportionnee au besoin du tour ? Les couches injectees sont-elles pertinentes ? Y a-t-il des tours avec trop ou pas assez de contexte memoire ?
6. **Verifier `trace.handoff_events`** si applicable. Les techniques efficaces sont-elles portees ? La memoire de l'ancienne transformation n'est-elle pas chargee par defaut ?
7. **Evaluer la qualite de la reponse finale**. La reponse utilise-t-elle la memoire injectee ? La memoire injectee etait-elle pertinente ? La reponse serait-elle meilleure avec une memoire differente ?
8. **Synthese**: croiser les observations du transcript avec la mecanique interne. Identifier les patterns recurrents: tagging systematiquement incorrect, couche jamais chargee, budget toujours depasse, memoire persistee mais jamais reutilisee.

### Questions de diagnostic rapide

Pour chaque moment critique, se poser:

1. Le memorizer a-t-il extrait le bon fait ?
2. Le scope assigne est-il correct (cycle vs transformation vs execution vs relational) ?
3. L'action de persistence est-elle la bonne (create vs enrich vs update) ?
4. Le retrieval a-t-il remonte ce fait quand il etait pertinent ?
5. L'intention de retrieval etait-elle la bonne ?
6. Les couches chargees correspondaient-elles au contrat ?
7. L'injection a-t-elle inclus ce fait dans le contexte ?
8. La reponse finale a-t-elle utilise ce fait correctement ?

## 5. Checklist d'audit

### Memorizer (extraction + validation)

- [ ] Le memorizer detecte-t-il les faits importants mentionnes par l'utilisateur ?
- [ ] A-t-il sur-stocke des micro-variations sans valeur ?
- [ ] L'acceptance_rate est-il dans une fourchette saine (30%–90%) ?
- [ ] Les succes sont-ils memorises, pas seulement les blockers ?

### Tagging scope

- [ ] Le tagging scope est-il correct (fait cycle vs transformation) ?
- [ ] Les faits durables sont-ils tagges cycle et non transformation ?
- [ ] Les preferences relationnelles vont-elles dans relational, pas dans execution ?
- [ ] Les topics ne proliferent pas sans enrichissement ?
- [ ] Les globals ne s'accumulent pas sans compaction ?

### Retrieval par intention

- [ ] Le retrieval charge-t-il les bonnes couches pour chaque intention ?
- [ ] Le budget tokens est-il respecte par intention ?
- [ ] Un daily_bilan ne charge pas 6 couches (devrait etre execution + coaching + event) ?
- [ ] Un answer_user_now charge-t-il bien toutes les couches pertinentes ?
- [ ] Les filtres de scope sont-ils appliques (transformation_id pour execution) ?

### Injection

- [ ] L'injection est-elle proportionnee au besoin du tour ?
- [ ] Y a-t-il des tours sans injection qui auraient du en avoir ?
- [ ] Une couche ne domine pas systematiquement l'injection ?

### Persistence et reutilisation

- [ ] Les memories persistees sont-elles reutilisees plus tard ?
- [ ] Le delai de reutilisation est-il raisonnable ?
- [ ] Les topics ne proliferent pas sans enrichissement ?
- [ ] Les globals ne s'accumulent pas sans compaction ?

### Handoff (si applicable)

- [ ] Le handoff a bien porte les techniques efficaces/inefficaces ?
- [ ] La memoire de la transformation precedente n'est pas chargee par defaut ?
- [ ] Le volume porte est raisonnable (ni trop ni trop peu) ?

### Qualite de la reponse finale

- [ ] La reponse finale utilise-t-elle la bonne memoire ?
- [ ] La reponse serait-elle meilleure avec une memoire differente ?
- [ ] La reponse ne repete pas inutilement des faits deja connus du user ?

## 6. Patterns de bugs frequents

### Herites du V1

- **sous-memorisation**: user se repete, rien n'est persiste
- **sur-memorisation**: inflation de topics faibles
- **mauvais retrieval**: bonne memoire existe mais ne remonte pas
- **mauvaise injection**: contexte trop long ou trop pauvre
- `soutien_emotionnel` memorise comme fait durable alors que c'est une emotion passagere
- memories persistees mais jamais reutilisees (never_reused_count eleve)

### Nouveaux V2

- **tagging incorrect**: fait de transformation tague en cycle (ou inversement)
- **retrieval qui charge toutes les couches pour une intention minimale**: daily_bilan qui charge 6 couches au lieu de execution + coaching + event
- **budget depasse**: nudge_decision qui consomme 1500 tokens au lieu de 1200 max
- **memoire de l'ancienne transformation qui "pollue" la nouvelle**: absence de filtre transformation_id sur la couche execution
- **handoff qui ne porte pas les techniques efficaces**: les techniques qui ont marche ne sont pas dans carried_memories
- **relational memory qui capture du bruit**: micro-variations de ton stockees comme preferences durables
- **execution memory qui duplique ce qui est deja dans plan_items**: facts redondants avec les entries
- **scope classifier qui default toujours a transformation**: le fallback "transformation" est applique a des faits qui sont clairement cycle ou relational
- **couche coaching jamais peuplee**: user_chat_states non exploite, la couche reste vide
- **layer_never_loaded**: une couche contient de la memoire mais n'est jamais chargee par aucune intention
- **injection sans retrieval**: memoire injectee sans passer par le pipeline de retrieval (contournement)
- **filtres de scope non appliques**: la couche execution charge des topics d'une autre transformation

## 7. Leviers de tuning

### Herites du V1

- Seuils d'extraction/validation (sensibilite du memorizer)
- Ranking retrieval (similarite semantique, recency, importance)
- Budgets injection par block

### Nouveaux V2

- **Regles de tagging par scope**: heuristiques de classification dans `classifyMemoryScope` (keywords cycle, keywords relational, flags explicites). Ajustables via les listes `CYCLE_KEYWORDS` et `RELATIONAL_KEYWORDS`.
- **Contrats de retrieval par intention**: couches et budgets dans `V2_MEMORY_CONTRACTS`. Chaque intent a ses couches, son budget_tier, et son max_tokens_hint.
- **Budget par tier**: mapping tier → limites par type de memoire dans `BUDGET_BY_TIER` (global_max, topic_max, event_max, identity_max).
- **Regles de handoff**: quoi porter (techniques efficaces, blockers persistants), quoi resumer (contexte trop volumineux), quoi laisser (details d'execution specifiques a l'ancienne transformation).
- **Regles d'anti-bruit par couche**: relational memory plus stricte que execution (eviter de stocker des micro-variations de ton comme preferences durables).
- **Filtres de scope dans le retrieval**: global_scope_filter et topic_filter_transformation dans `resolveV2RetrievalPlan`. Determines automatiquement depuis le contrat.
- **Seuils de compaction**: quand compacter les globals qui s'accumulent, quand fusionner les topics redondants.
- **Seuils de reuse monitoring**: delai acceptable entre persistence et premiere reutilisation.

## 8. Commande d'export

Le bundle memory V2 peut etre exporte avec:

```bash
npm run memory-v2:audit:export -- --user-id <uuid> --hours 72
```

Le script est une adaptation de `scripts/export_memory_audit_bundle.mjs` pour le systeme memoire V2.

Exemples utiles:

```bash
npm run memory-v2:audit:export -- --user-id <uuid> --hours 168

npm run memory-v2:audit:export -- --user-id <uuid> --from 2026-03-10T00:00:00Z --to 2026-03-17T00:00:00Z

npm run memory-v2:audit:export -- --user-id <uuid> --hours 168 --scope whatsapp

npm run memory-v2:audit:export -- --user-id <uuid> --hours 168 --scope-all
```

Options:

- `--user-id <uuid>` — Requis. UUID utilisateur
- `--hours <N>` — Fenetre en heures (defaut: 72)
- `--from <ISO>` — Debut de fenetre (alternative a --hours)
- `--to <ISO>` — Fin de fenetre
- `--scope <name>` — Filtrer par scope (defaut: whatsapp)
- `--scope-all` — Ne pas filtrer par scope
- `--out <path>` — Chemin du JSON de sortie (defaut: tmp/)

### Bonnes pratiques de fenetre

- **24h** pour un incident ponctuel (ex: un fait important non memorise, un retrieval rate)
- **72h** pour une verification de qualite du retrieval (assez de retrievals pour voir les patterns)
- **7 jours** pour un audit de tagging scope (suffisamment de persistence events pour evaluer la distribution)
- **14 jours** pour un audit de handoff entre transformations (couvre typiquement un changement de transformation)

## 9. Conclusion

Un bon audit memoire V2 ne juge pas seulement si les faits sont stockes. Il juge la qualite de la chaine complete: extraction (le memorizer detecte-t-il les bons faits ?), tagging (le scope assigne est-il correct ?), persistence (l'action est-elle la bonne ?), retrieval (les bonnes couches sont-elles chargees pour la bonne intention avec le bon budget ?), injection (le contexte injecte est-il proportionnel au besoin ?), et reutilisation (la memoire persistee est-elle effectivement utilisee plus tard ?).

Si le bundle permet de suivre cette chaine de bout en bout — du message utilisateur jusqu'a la reponse enrichie par la memoire — alors il devient possible de corriger le systeme de maniere precise: ajuster les seuils du memorizer, corriger les heuristiques de scope, recalibrer les contrats de retrieval par intention, et equilibrer les budgets d'injection par couche.
