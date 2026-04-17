# Conversation Pulse V2 Audit Guide

STATUT: complet — Lot 6B

Structure standard: voir [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

## 1. Objectif

Auditer la qualite du systeme Conversation Pulse V2 sur une fenetre temporelle donnee, de bout en bout:

```
messages conversationnels (7 jours, max 80) + bilans recents + event_memories
→ appel LLM Tier 2 (Gemini)
→ ConversationPulse structure (tone, trajectory, highlights, signals, evidence_refs)
→ stockage cache (system_runtime_snapshots, snapshot_type="conversation_pulse")
→ lecture downstream (daily bilan, weekly bilan, nudge engine, proactive engine)
→ decision downstream influencee par le pulse
```

Ce guide permet de repondre a:

- Le tone dominant reflète-t-il la realite de la semaine conversationnelle ?
- La trajectory (up/flat/down/mixed) est-elle defensable ?
- Les wins listes sont-ils de vrais wins ou du remplissage ?
- Les friction_points listes sont-ils les vrais points durs ?
- Le likely_need est-il coherent avec le momentum ?
- L'upcoming_event est-il le bon (celui qui compte le plus) ?
- Le proactive_risk est-il correctement evalue ?
- Le pulse est-il frais (< 12h) quand un systeme le lit ?
- Le pulse est-il regenere inutilement (frais mais regenere quand meme) ?
- Le pulse ameliore-t-il concretement la decision daily ? (comparaison avec/sans)
- Le pulse ameliore-t-il concretement la decision weekly ?
- Le cout LLM de generation est-il acceptable (Tier 2) ?

### Role du Conversation Pulse dans l'architecture V2

Le ConversationPulse est un resume structure de la dynamique conversationnelle recente entre l'utilisateur et Sophia. Il est genere par un appel LLM Tier 2 (Gemini) et sert de "capteur conversationnel" pour les systemes downstream.

Contrairement au momentum state (qui mesure la progression et la charge du plan), le pulse mesure le **climat relationnel et emotionnel** tel qu'il transparait dans les messages. Les deux sont complementaires et doivent etre coherents.

### Distinction fondamentale: pulse vs momentum

| Aspect | Momentum State | Conversation Pulse |
|--------|---------------|-------------------|
| Source | plan_items + entries + signaux | messages conversationnels |
| Genere par | Derivation deterministe | LLM Tier 2 (Gemini) |
| Frequence | A chaque consolidation watcher | On-demand avec cache 12h |
| Mesure | Progression, charge, etat comportemental | Ton, trajectoire, besoin relationnel |
| Stockage | system_runtime_snapshots (momentum_state_v2) | system_runtime_snapshots (conversation_pulse) |

Un audit Pulse V2 doit systematiquement verifier que le pulse et le momentum convergent. Si le pulse dit `likely_need=push` mais que le momentum est en `soutien_emotionnel`, c'est un desaccord a investiguer.

## 2. Ce que le bundle V2 contient

Le ConversationPulse est genere par `conversation_pulse_builder.ts` dans `sophia-brain/`. Le processus est le suivant:

1. **Verification du cache**: le builder cherche un pulse existant dans `system_runtime_snapshots` avec `snapshot_type="conversation_pulse"`, scope par `cycle_id` + `transformation_id`. Si un pulse frais (< 12h) existe, il est retourne directement.

2. **Collecte des inputs** (en parallele):
   - **Messages**: derniers 7 jours de `chat_messages` (scopes whatsapp + web, max 80 messages), tries chronologiquement
   - **Bilans recents**: jusqu'a 3 bilans depuis `scheduled_checkins` (daily_bilan_v2) et `weekly_bilan_recaps`
   - **Event memories**: jusqu'a 3 evenements proches depuis `user_event_memories` (statuts upcoming/active/recently_past)
   - **Timezone utilisateur**: depuis `profiles` pour calculer la date locale

3. **Construction de l'input LLM**: les messages sont tronques a 600 caracteres chacun, le compteur `messages_last_72h_count` est calcule pour ponderer la recence.

4. **Appel LLM**: Gemini (modele configurable via `CONVERSATION_PULSE_MODEL`, defaut `gemini-2.5-flash`), temperature 0.2.

5. **Validation et normalisation**: le JSON brut est parse, les valeurs enum sont validees, les caps quantitatifs sont appliques (wins <= 3, friction_points <= 3, message_ids entre 3 et 5). Si < 3 messages en input, le validateur force `direction=flat`, `confidence=low`, `likely_need=silence`.

6. **Stockage**: le pulse valide est insere dans `system_runtime_snapshots` avec `snapshot_type="conversation_pulse"`.

7. **Event logging**: un event `conversation_pulse_generated_v2` est emis via `logV2Event`.

### Output: structure ConversationPulse (v2-types.ts)

Le pulse genere contient:

- **version**: toujours 1
- **generated_at**: ISO timestamp de generation
- **window_days**: toujours 7
- **last_72h_weight**: ratio messages_72h / messages_total (0 a 1)
- **tone**: `dominant` (steady/hopeful/mixed/strained/closed), `emotional_load` (low/medium/high), `relational_openness` (open/fragile/closed)
- **trajectory**: `direction` (up/flat/down/mixed), `confidence` (high/medium/low), `summary` (1-2 phrases factuelles)
- **highlights**: `wins` (max 3), `friction_points` (max 3), `support_that_helped` (max 3), `unresolved_tensions` (max 3)
- **signals**: `top_blocker` (string ou null), `likely_need` (push/simplify/support/silence/repair), `upcoming_event` (string ou null), `proactive_risk` (low/medium/high)
- **evidence_refs**: `message_ids` (3 a 5), `event_ids` (0 a 3)

### Consommateurs downstream

Le pulse est lu par:

- **Daily bilan decider** (`v2-daily-bilan-decider.ts`): utilise `tone.emotional_load`, `signals.likely_need`, et `signals.proactive_risk` pour ajuster le mode du bilan (check_supportive si emotional_load=high ou likely_need=repair)
- **Weekly bilan engine** (`v2-weekly-bilan-engine.ts`): utilise le pulse pour contextualiser les decisions de recalibrage hebdomadaire
- **Nudge matinal**: utilise `signals.proactive_risk` et `signals.likely_need` pour calibrer la posture proactive
- **Proactive window decider**: utilise `tone.relational_openness` et `signals.proactive_risk` pour decider si une intervention proactive est appropriee

### Cache et freshness

Le pulse utilise un cache de 12h scope par `cycle_id` + `transformation_id`. Cela signifie:

- Un pulse genere il y a 11h59 sera reutilise (cache hit)
- Un pulse genere il y a 12h01 sera regenere (cache miss)
- Un changement de cycle ou de transformation invalide implicitement le cache (nouveau scope)
- Le flag `forceRefresh` permet de contourner le cache (utilise pour les tests et l'audit)

La commande d'export produit deux fichiers:

- un fichier JSON principal (trace + scorecard + annotations)
- un fichier transcript texte

Le JSON est la source d'audit complete.
Le transcript permet une lecture humaine rapide de la dynamique conversationnelle.

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

Verifier la fenetre avant toute conclusion. Une fenetre trop courte manque les regenerations; une fenetre trop longue dilue les patterns de freshness.

### `trace`

Le coeur du bundle. Contient:

#### `trace.window`

- `from`, `to`, `scope`, `hours`

C'est la verite de la fenetre analysee. Toujours la verifier.

#### `trace.summary`

Resume les volumes globaux:

- `pulses_generated`: nombre de pulses generes sur la fenetre
- `messages_total`: nombre total de messages dans la fenetre
- `downstream_reads_total`: nombre total de lectures du pulse par les systemes downstream
- `freshness_violations`: nombre de lectures d'un pulse stale (> 12h)
- `wasted_regenerations`: nombre de regenerations inutiles (pulse encore frais regenere)

Interpretations utiles:

- Beaucoup de `pulses_generated` avec peu de `messages_total` peut signaler des regenerations inutiles
- `downstream_reads_total` a zero signifie que le pulse est genere pour rien
- `freshness_violations` > 0 signale un probleme de timing entre generation et lecture
- `wasted_regenerations` > 0 signale un probleme de cache (forceRefresh mal utilise ou race condition)

#### `trace.messages`

Messages bruts dans la fenetre:

- `id`, `role`, `content`, `scope`, `created_at`, `metadata`

Les messages utilisateur sont la verite source. Si le pulse derive un tone non soutenu par les messages, c'est un probleme.

#### `trace.pulse_generations`

Chronologie des pulses generes dans la fenetre. Chaque entree contient:

- `generated_at`: timestamp ISO de generation
- `input_message_count`: nombre de messages en input
- `input_72h_message_count`: nombre de messages des dernieres 72h en input
- `input_bilan_count`: nombre de bilans recents en input
- `input_event_count`: nombre d'event memories en input
- `output`: le ConversationPulse complet (tone, trajectory, highlights, signals, evidence_refs)
- `tokens_used`: tokens consommes par l'appel LLM
- `latency_ms`: temps de generation en ms
- `model_used`: modele LLM utilise (ex: gemini-2.5-flash)
- `was_cache_hit`: boolean — true si le pulse a ete servi depuis le cache

Cette section permet de verifier:

- Si les inputs du pulse sont complets (suffisamment de messages, bilans inclus, events inclus)
- Si le tone et la trajectory du pulse matchent les messages reels
- Si le cout de generation est dans le budget Tier 2
- Si la latence est acceptable
- Si le cache fonctionne (ratio cache_hit vs miss)

#### `trace.source_messages`

Pour chaque pulse genere: quels messages l'ont alimente et leur poids 72h.

- `pulse_generated_at`: reference vers le pulse
- `messages`: liste des messages avec `id`, `role`, `created_at`, `is_last_72h` (boolean), `text_preview` (tronque)

Cette section permet de verifier:

- Si les bons messages sont selectionnes (pas de messages trop anciens ou hors scope)
- Si la ponderation 72h est correcte (les messages recents ont-ils plus de poids dans le resultat ?)
- Si le budget de 80 messages n'est pas depasse

#### `trace.downstream_usage`

Chaque lecture du pulse par un systeme downstream:

- `consumer`: identifiant du systeme (`daily_bilan` / `weekly_bilan` / `nudge` / `proactive`)
- `read_at`: timestamp ISO de la lecture
- `pulse_age_hours`: age du pulse au moment de la lecture (en heures, arrondi a 1 decimale)
- `decision_taken`: la decision prise par le consumer apres lecture du pulse (ex: `mode=check_supportive`, `posture=support`)

Cette section est critique pour repondre a la question: "le pulse ameliore-t-il concretement les decisions downstream ?"

Si un pulse avec `likely_need=repair` est lu par le daily bilan mais que celui-ci decide `mode=check_light`, c'est un probleme d'integration.

#### `trace.freshness_violations`

Cas ou un consumer a lu un pulse plus vieux que 12h:

- `consumer`: qui a lu le pulse stale
- `read_at`: quand
- `pulse_generated_at`: quand le pulse avait ete genere
- `pulse_age_hours`: age reel au moment de la lecture
- `expected_max_age_hours`: 12 (le seuil)

Chaque violation est un risque: la decision downstream a ete prise sur des donnees obsoletes.

#### `trace.regeneration_wasted`

Cas ou un pulse frais (< 12h) a ete regenere inutilement:

- `existing_pulse_generated_at`: timestamp du pulse existant encore frais
- `existing_pulse_age_hours`: age du pulse existant
- `new_pulse_generated_at`: timestamp du nouveau pulse
- `tokens_wasted`: tokens consommes inutilement
- `cause`: raison estimee (`force_refresh_flag`, `race_condition`, `unknown`)

Chaque regeneration gaspillee est un cout LLM inutile.

#### `trace.unassigned_events`

Events dans la fenetre non rattaches aux categories precedentes. A surveiller: trop d'events non assignes rend l'audit moins fiable.

### `scorecard`

Vue agregee pour aller vite sur les signaux importants.

#### `scorecard.generation_count`

Nombre de pulses generes sur la fenetre. Inclut les cache hits et les generations reelles.

Interpretations utiles:

- 0 generations sur 7 jours → le pulse n'est jamais declenche
- > 3 generations/jour → regeneration probablement excessive
- 1 generation/12-24h → rythme normal attendu

#### `scorecard.average_generation_cost_tokens`

Cout moyen en tokens par generation de pulse (hors cache hits). Attendu: < 2000 tokens pour Tier 2.

Si le cout moyen depasse 3000 tokens, verifier:

- Les messages en input sont-ils trop longs (truncation a 600 chars respectee ?)
- Le systeme prompt est-il trop verbeux ?
- Le modele genere-t-il du texte superflu avant/apres le JSON ?

#### `scorecard.average_freshness_at_read_hours`

Age moyen du pulse (en heures) quand un systeme downstream le lit.

- < 6h: excellent, le pulse est generalement frais
- 6-12h: acceptable, dans la fenetre de freshness
- > 12h: problematique, freshness violations probables

#### `scorecard.tone_distribution`

Distribution des tones dominants sur la fenetre:

- `steady`: stable, neutre, serein
- `hopeful`: optimisme, motivation, elan
- `mixed`: signaux contradictoires
- `strained`: tension, fatigue, frustration
- `closed`: distant, monosyllabique, desengage

Interpretations utiles:

- `steady` dominant avec des messages clairement en difficulte → pulse trop optimiste
- `strained` dominant avec des messages neutres → pulse trop pessimiste
- `closed` jamais observe sur une base peu repondante → angle mort
- `mixed` toujours → le pulse ne sait pas trancher (verifier les inputs)

#### `scorecard.trajectory_distribution`

Distribution des directions de trajectoire (champ `trajectory.direction`):

- `up`: amelioration visible
- `flat`: stable
- `down`: degradation
- `mixed`: oscillations

Reperer:

- `up` constant sur une semaine objectivement difficile → trajectoire irealiste
- `down` sur une seule journee faible dans une semaine positive → surreaction
- `flat` systematique → le pulse ne detecte pas les variations

#### `scorecard.likely_need_distribution`

Distribution des besoins identifies (champ `signals.likely_need`):

- `push`: l'utilisateur a besoin d'etre pousse
- `simplify`: surcharge, besoin de simplification
- `support`: besoin de soutien emotionnel
- `silence`: besoin d'espace
- `repair`: relation abimee, approche de reparation necessaire

Interpretations utiles:

- `push` dominant alors que l'utilisateur montre des signes de fatigue → calibration trop agressive
- `silence` jamais observe alors que l'utilisateur ne repond plus → angle mort
- `repair` observe alors que la relation semble saine → faux positif couteux

#### `scorecard.confidence_distribution`

Distribution des niveaux de confiance (champ `trajectory.confidence`):

- `high`: signaux abondants et coherents
- `medium`: signaux suffisants mais ambigus
- `low`: insuffisance de signaux

Interpretations utiles:

- `low` dominant → peu de messages, le pulse tourne souvent en mode cautious (defaut: direction=flat, likely_need=silence)
- `high` toujours → verifier que la confiance est meritee (suffisamment de messages et de diversite)

#### `scorecard.downstream_read_count`

Nombre de lectures du pulse par consumer:

- `daily_bilan`: N
- `weekly_bilan`: N
- `nudge`: N
- `proactive`: N

Si un consumer n'a jamais lu le pulse sur la fenetre, c'est soit un probleme d'integration, soit un consumer qui n'a pas ete declenche.

#### `scorecard.coherence_with_momentum`

Taux d'accord entre `pulse.signals.likely_need` et `momentum.posture.recommended_posture`.

Mapping attendu (exemples de coherence):

| pulse.likely_need | momentum.posture compatible |
|---|---|
| push | push_lightly |
| simplify | simplify, reduce_load |
| support | support, hold |
| silence | hold, reopen_door |
| repair | repair |

Un taux de coherence < 60% signale un desalignement systematique entre les deux capteurs.

#### `scorecard.low_signal_caution_applied`

Nombre de pulses ou < 3 messages en input ont declenche le mode cautious (direction=flat, confidence=low, likely_need=silence).

Si ce compteur est eleve, le pulse est rarement informatif — il faut verifier si les messages sont bien captures ou si l'utilisateur est simplement peu actif.

#### `scorecard.alerts`

Patterns detectes automatiquement:

- `pulse_never_read`: un pulse genere n'a ete lu par aucun systeme downstream
- `pulse_stale_at_decision`: un consumer a lu un pulse > 12h pour prendre une decision
- `tone_contradicts_messages`: le tone dominant contredit clairement le contenu des messages (detection heuristique)
- `wasted_regeneration`: un pulse frais a ete regenere inutilement
- `confidence_always_low`: tous les pulses de la fenetre ont confidence=low (signal insuffisant chronique)

## 4. Methode d'audit

### Ordre recommande

1. **Lire le transcript** du debut a la fin. Sentir le ton, la dynamique relationnelle, les moments de tension ou de progres. Noter les virages emotionnels et les sujets recurrents.

2. **Consulter la scorecard**. Verifier les distributions (tone, trajectory, likely_need). Reperer les alertes. Comparer avec l'impression du transcript.

3. **Zoomer sur `trace.pulse_generations`**. Pour chaque pulse genere, comparer le `output` (tone, trajectory, signals) avec les messages reels de la meme periode. Le pulse match-t-il le transcript ?

4. **Verifier `trace.source_messages`**. Pour chaque pulse, les bons messages sont-ils pris en compte ? La ponderation 72h est-elle correcte ? Des messages importants manquent-ils ?

5. **Verifier `trace.downstream_usage`**. Le pulse est-il lu par les systemes downstream ? La decision prise par le consumer est-elle coherente avec le pulse ?

6. **Verifier la freshness**. Consulter `trace.freshness_violations`. Le cache fonctionne-t-il ? Les consumers lisent-ils toujours un pulse frais ?

7. **Verifier le cout**. Le `average_generation_cost_tokens` est-il dans le budget Tier 2 ? Y a-t-il des `regeneration_wasted` ?

8. **Croiser pulse et momentum**. Verifier `scorecard.coherence_with_momentum`. Quand il y a desaccord, qui a raison — le pulse ou le momentum ? Le desaccord revele-t-il un angle mort dans l'un des deux systemes ?

### Questions de diagnostic rapide

Pour chaque pulse genere, se poser:

1. Le tone dominant est-il juste par rapport aux messages reels ?
2. La trajectory est-elle defensable (pas de "up" sur une semaine difficile, pas de "down" sur un seul message negatif) ?
3. Les wins sont-ils de vrais wins ou des reformulations positives de l'inaction ?
4. Les friction_points sont-ils les vrais points durs mentionnes par l'utilisateur ?
5. Le likely_need est-il le plus urgent des besoins detectes ?
6. Le proactive_risk est-il correctement calibre (high si l'utilisateur est ferme/irrite) ?
7. Les evidence_refs pointent-ils vers les messages les plus informatifs ?
8. Le pulse est-il coherent avec le momentum state de la meme periode ?

## 5. Checklist d'audit

### Qualite du tone

- [ ] Le tone dominant correspond-il au ton reel des messages ?
- [ ] `emotional_load` est-il correct (high quand l'utilisateur est en detresse, low quand il est serein) ?
- [ ] `relational_openness` est-il correct (closed quand l'utilisateur se ferme, open quand il est engage) ?
- [ ] Le tone ne reste pas en `steady` alors que les messages montrent une semaine difficile ?
- [ ] Le tone ne saute pas a `strained` sur un seul message de frustration isolee ?

### Qualite de la trajectory

- [ ] La trajectory correspond-elle a l'evolution reelle de la semaine ?
- [ ] `direction=up` est-il soutenu par des signaux concrets (pas un seul message positif) ?
- [ ] `direction=down` n'est-il pas declenchee par un seul message negatif dans une semaine positive ?
- [ ] La `confidence` est-elle coherente avec la quantite de messages (low si < 3 messages) ?
- [ ] Le `summary` est-il factuel et non interpretatif ?

### Qualite des highlights

- [ ] Les wins sont de vrais acquis, pas des reformulations positives de l'inaction ?
- [ ] Les friction_points sont les vrais blocages mentionnes par l'utilisateur ?
- [ ] Les support_that_helped referent des techniques reellement utilisees ?
- [ ] Les unresolved_tensions sont de vraies tensions qui persistent ?
- [ ] Le pulse ne contient pas plus de 3 wins / 3 friction_points / 3 support / 3 tensions ?

### Qualite des signals

- [ ] Le likely_need est coherent avec le momentum_state ?
- [ ] Le proactive_risk est high quand l'utilisateur est ferme ou irrite ?
- [ ] L'upcoming_event est le bon (le plus impactant pour l'utilisateur) ?
- [ ] L'upcoming_event n'est pas absent alors qu'un event_memory existe ?
- [ ] Le top_blocker est le vrai blocker principal (si pertinent) ?

### Freshness et cache

- [ ] Le pulse n'est pas regenere quand un pulse frais (< 12h) existe ?
- [ ] Le pulse est frais (< 12h) quand un systeme downstream le lit ?
- [ ] Le cache est scope par cycle_id + transformation_id ?
- [ ] Pas de freshness violations dans la fenetre d'audit ?

### Usage downstream

- [ ] Le pulse est lu par au moins 1 systeme downstream ?
- [ ] La decision downstream est coherente avec le pulse (ex: likely_need=repair → mode=check_supportive) ?
- [ ] Le pulse ameliore concretement la decision (comparaison avec le cas sans pulse) ?

### Cout et performance

- [ ] Le cout est dans le budget Tier 2 (< 2000 tokens en moyenne) ?
- [ ] La latence de generation est acceptable (< 5s) ?
- [ ] Pas de regenerations gaspillees ?

### Coherence avec le momentum

- [ ] Le taux de coherence pulse/momentum est > 60% ?
- [ ] Quand il y a desaccord, l'un des deux a clairement tort ?
- [ ] Le pulse ne dit pas "push" quand le momentum est en soutien_emotionnel ?
- [ ] Le pulse ne dit pas "silence" quand le momentum est en momentum avec bonne traction ?

## 6. Patterns de bugs a surveiller

### Qualite de la synthese LLM

- **tone "steady" alors que les messages montrent une semaine difficile**: le LLM lisse trop les signaux emotionnels, probablement parce que les messages de l'assistant equilibrent le ton
- **trajectory "up" basee sur un seul message positif dans une semaine negative**: la regle de ponderation 72h est mal appliquee ou le LLM donne trop de poids a la fin de la fenetre
- **wins qui sont des reformulations du plan plutot que de vrais acquis user**: le LLM confond "ce qui est prevu" avec "ce qui est accompli"
- **upcoming_event absent alors qu'un event_memory existe**: les event_memories ne sont pas correctement charges en input
- **likely_need en contradiction avec le momentum**: ex: pulse dit "push" mais momentum est en soutien_emotionnel — le pulse ne voit pas la detresse emotionnelle ou le momentum la surestime

### Freshness et cache

- **pulse regenere 3 fois dans la meme journee sans raison**: le flag `forceRefresh` est mal utilise, ou plusieurs callers concurrents declenchent la generation sans verifier le cache
- **pulse jamais lu par aucun systeme (genere pour rien)**: le pulse est genere proactivement mais aucun consumer n'est declenche dans la fenetre de freshness
- **pulse stale lu par un consumer**: le consumer ne verifie pas l'age du pulse ou le timing de generation ne correspond pas au timing de lecture

### Validation et normalisation

- **confidence toujours low**: tres peu de messages, le validateur force systematiquement le mode cautious (direction=flat, likely_need=silence)
- **evidence_refs qui pointent vers des messages non informatifs**: le LLM choisit les derniers messages plutot que les plus revelateurs
- **caps quantitatifs non respectes avant validation**: le LLM genere 5 wins mais le validateur tronque silencieusement a 3 — le pulse final peut perdre des informations pertinentes

### Integration downstream

- **daily bilan ignore le pulse**: le `conversationPulse` est null ou undefined dans l'input du decider, probablement un probleme de chargement
- **weekly bilan ne lit pas le pulse**: meme probleme d'integration
- **decision downstream incoherente avec le pulse**: le consumer lit le pulse mais ne l'utilise pas correctement dans sa logique de decision

## 7. Leviers de tuning

### Prompt de generation

- **Equilibre tone/trajectory/highlights**: le systeme prompt donne des instructions de ponderation (72h > debut de semaine). Ajuster les instructions pour obtenir un meilleur equilibre sensibilite/stabilite.
- **Regle d'absence de donnees**: si < 3 messages, le validateur force le mode cautious. Ce seuil est-il correct ? Trop strict = silence systematique pour les utilisateurs peu actifs. Trop lache = pulse peu fiable.
- **Formulations courtes (15 mots max)**: le prompt impose des wins/friction_points courts. Trop court = perte de nuance. Trop long = bruit.

### Ponderation 72h

- **last_72h_weight**: ratio messages_72h / messages_total. Un poids trop haut rend le pulse trop reactif aux derniers messages. Un poids trop bas lisse trop et rate les virages recents.
- **Fenetre de 7 jours**: est-elle la bonne ? Pour un utilisateur tres actif (> 30 messages/semaine), 7 jours peuvent etre trop longs. Pour un utilisateur peu actif (< 5 messages/semaine), 7 jours sont necessaires.

### Regles de freshness

- **Seuil de 12h**: est-il le bon ? Trop court = regenerations trop frequentes et cout LLM eleve. Trop long = pulse obsolete quand un consumer le lit.
- **Scope du cache** (cycle_id + transformation_id): est-il correct ? Si l'utilisateur change de transformation en cours de cycle, le cache est invalide — est-ce le bon comportement ?

### Regles d'anti-regeneration

- **Detection des regenerations inutiles**: le builder verifie le cache avant de generer. Mais en cas de callers concurrents, des race conditions peuvent entrainer des regenerations doublees.
- **forceRefresh**: ce flag devrait etre reserve aux tests et a l'audit. Verifier qu'il n'est pas utilise en production.

### Budget tokens

- **Budget Tier 2**: le pulse est un appel LLM Tier 2. Le cout doit rester < 2000 tokens en moyenne. Si le prompt grandit (plus de bilans, plus d'events), le cout augmente.
- **Truncation des messages (600 chars)**: ce seuil determine le volume envoye au LLM. Trop court = perte d'information. Trop long = cout eleve.

### Calibration des signaux downstream

- **Mapping pulse → decision daily**: le daily bilan decider utilise `emotional_load`, `likely_need`, et `proactive_risk`. Ajuster les seuils de detection dans `detectSignals()`.
- **Mapping pulse → decision weekly**: le weekly bilan utilise le pulse pour contextualiser. Verifier que le pulse informe correctement les decisions de recalibrage.

## 8. Commande d'export

Le bundle conversation pulse V2 peut etre exporte avec:

```bash
npm run pulse-v2:audit:export -- --user-id <uuid> --hours 168
```

Exemples utiles:

```bash
npm run pulse-v2:audit:export -- --user-id <uuid> --hours 72
npm run pulse-v2:audit:export -- --user-id <uuid> --hours 168
npm run pulse-v2:audit:export -- --user-id <uuid> --hours 336
npm run pulse-v2:audit:export -- --user-id <uuid> --from 2026-03-10T00:00:00Z --to 2026-03-17T00:00:00Z
npm run pulse-v2:audit:export -- --user-id <uuid> --hours 168 --scope whatsapp
npm run pulse-v2:audit:export -- --user-id <uuid> --hours 168 --scope-all
```

Options:

- `--user-id <uuid>` — Requis. UUID utilisateur
- `--hours <N>` — Fenetre en heures (defaut: 168 = 7 jours)
- `--from <ISO>` — Debut de fenetre (alternative a --hours)
- `--to <ISO>` — Fin de fenetre
- `--scope <name>` — Filtrer par scope (defaut: whatsapp)
- `--scope-all` — Ne pas filtrer par scope
- `--out <path>` — Chemin du JSON de sortie (defaut: tmp/)

### Bonnes pratiques de fenetre

- **72h** pour un audit de freshness: verifier que le cache fonctionne, que les regenerations ne sont pas gaspillees, que les consumers lisent un pulse frais. Fenetre courte = peu de pulses, focus sur la mecanique.
- **168h (7 jours)** pour un audit de qualite tone/trajectory: assez de pulses pour voir les distributions, verifier la coherence avec les messages, reperer les patterns de biais LLM.
- **336h (14 jours)** pour un audit d'usage downstream: voir si le pulse est systematiquement lu, si les decisions downstream sont coherentes, si le taux de coherence avec le momentum est stable sur la duree.

## 9. Conclusion

Un bon audit conversation pulse V2 ne juge pas seulement la qualite de la synthese LLM. Il juge la chaine complete: les bons messages sont-ils en input, le pulse genere est-il fidele a la realite conversationnelle, le cache fonctionne-t-il correctement, le pulse est-il lu par les systemes downstream, et surtout — le pulse ameliore-t-il concretement les decisions prises par ces systemes.

Le pulse est un capteur conversationnel. Comme tout capteur, il peut etre bruite (tone errone), degrade (freshness violation), inutile (jamais lu), ou contre-productif (decision downstream incoherente). L'audit doit identifier ou la chaine se brise et si le pulse vaut son cout LLM.

Si le bundle permet de suivre cette chaine de bout en bout — de la collecte des messages jusqu'a l'impact sur les decisions proactives — alors il devient possible de corriger le systeme de maniere precise, sans intuition floue ni debugging a l'aveugle.
