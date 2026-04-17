# Momentum V2 Audit Guide

STATUT: complet — Lot 6A

Structure standard: voir [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

Refonte de: [momentum-audit-analysis-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/momentum-audit-analysis-guide.md)

## 1. Objectif

Auditer la qualite du systeme momentum V2 sur une fenetre temporelle donnee, de bout en bout:

```
signaux conversationnels + entries plan_items + active_load
→ 6 dimensions (engagement, execution_traction, emotional_load, consent, plan_fit, load_balance)
→ classification d'etat (momentum, friction_legere, evitement, pause_consentie, soutien_emotionnel, reactivation)
→ assessment (top_blocker, top_risk, confidence)
→ posture recommandee (push_lightly, simplify, hold, support, reopen_door, reduce_load, repair)
→ decisions proactives (daily, weekly, nudge, outreach)
→ reaction utilisateur
```

Ce guide permet de repondre a:

- Le systeme percoit-il correctement les 6 dimensions a partir des signaux reels ?
- La classification d'etat decoule-t-elle logiquement des dimensions ?
- Le `plan_fit` est-il estime correctement (items stalled, zombies, traction) ?
- Le `load_balance` reflète-t-il la charge reelle (active_load score) ?
- La posture recommandee est-elle coherente avec les dimensions et l'etat ?
- Le systeme distingue-t-il "friction par manque de volonte" vs "friction par surcharge du plan" ?
- Les transitions sont-elles stables (ni trop nerveuses ni trop lentes) ?
- Les etats prioritaires (`soutien_emotionnel`, `pause_consentie`) ecrasent-ils correctement les autres ?
- Les decisions proactives respectent-elles la posture ?
- `needs_reduce` est-il vrai quand la charge est excessive ?
- `needs_consolidate` est-il vrai quand les habits sont fragiles ?

### Distinction fondamentale V2: friction user vs plan mal dose

La V1 n'avait que 4 dimensions (engagement, progression, charge_emotionnelle, consentement). Un utilisateur en difficulte etait toujours classifie comme "en friction" ou "en evitement".

La V2 ajoute `plan_fit` et `load_balance` pour distinguer deux cas fondamentalement differents:

| Cas | Symptome | plan_fit | load_balance | Bonne posture |
|-----|----------|----------|--------------|---------------|
| Friction user | L'utilisateur evite, procrastine, decroche | good/uncertain | balanced/slightly_heavy | push_lightly ou support |
| Plan mal dose | Le plan est trop charge ou mal adapte | poor | overloaded | reduce_load ou simplify |

Un audit V2 doit systematiquement verifier que cette distinction est faite correctement. Si le systeme accuse l'utilisateur (`evitement`) alors que le plan est objectivement trop charge (`load_balance=overloaded`), c'est un bug de classification.

## 2. Ce que le bundle V2 contient

La commande d'export momentum V2 produit deux fichiers:

- un fichier JSON principal (trace + scorecard + annotations)
- un fichier transcript texte

Le JSON est la source d'audit complete.
Le transcript permet une lecture humaine rapide de la dynamique conversationnelle.

### Differences avec le bundle V1

| Aspect | V1 | V2 |
|--------|----|----|
| Dimensions | 4 (engagement, progression, emotional, consent) | 6 (+plan_fit, +load_balance; progression → execution_traction) |
| Source traction | `user_actions` / `user_vital_signs` | `user_plan_items` / `user_plan_item_entries` |
| Active load | Non | Oui (score, slots, needs_reduce, needs_consolidate) |
| Posture | Non | Oui (7 postures recommandees) |
| Assessment | Partiel (blockers) | Complet (top_blocker, top_risk, confidence) |
| Plan fit | Non | Oui (items stalled/zombie detection) |
| Edge functions | `get-momentum-trace` + `get-momentum-scorecard` | Requetes REST directes + calcul local |

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

Verifier la fenetre avant toute conclusion. Une fenetre trop courte manque les transitions; une fenetre trop longue dilue les patterns.

### `trace`

Le coeur du bundle. Contient:

#### `trace.window`

- `from`, `to`, `scope`, `hours`

C'est la verite de la fenetre analysee. Toujours la verifier.

#### `trace.summary`

Resume les volumes globaux:

- `messages_total`, `user_messages`, `assistant_messages`
- `state_events_total`
- `active_load_events_total`
- `proactive_events_total`
- `plan_items_total`, `entries_total`

Interpretations utiles:

- Beaucoup de state_events avec peu de messages peut signaler des consolidations watcher trop frequentes
- Zero active_load_events est attendu tant que le watcher V2 n'est pas en production
- Beaucoup de entries sans state_events correspondants peut signaler un probleme de correlation

#### `trace.context`

Contexte runtime retenu pour la fenetre:

- `cycle_id`, `cycle_status`
- `transformation_id`, `transformation_status`
- `plan_id`, `plan_status`, `plan_version`
- `context_resolution`

Le bloc `context_resolution` explique comment le script a choisi le plan/cycle audites
(evidence par snapshots, entries dans la fenetre, puis overlap temporel des plans).
Si plusieurs plans se chevauchent dans la fenetre, verifier ce bloc avant d'interpreter
`plan_fit` ou `load_balance`.

#### `trace.messages`

Messages bruts avec:

- `id`, `role`, `content`, `scope`, `created_at`, `metadata`

Les messages utilisateur sont la verite source. Si le systeme derive un etat non soutenu par les messages, c'est un probleme.

#### `trace.state_timeline`

Chronologie des etats momentum V2, reconstruite depuis les `momentum_state_updated_v2` events.

Chaque entree contient:

- `at`
- `snapshot_type`
- `state`: etat public (`momentum`, `friction_legere`, etc.)
- `dimensions`: les 6 niveaux
- `posture`: posture recommandee
- `active_load`: score + slots + needs_reduce + needs_consolidate
- `assessment`: top_blocker, top_risk, confidence

Cette section permet de verifier:

- Si l'etat applique est coherent avec les dimensions
- Si les dimensions evoluent de maniere plausible au fil du temps
- Si plan_fit et load_balance refletent la realite des plan_items
- Si la posture suit logiquement l'etat
- Si les transitions sont stables ou oscillent

#### `trace.active_load_timeline`

Evolution du score de charge active, reconstruite depuis les `active_load_recomputed_v2` events.

Chaque entree contient:

- `at`
- `current_load_score`
- `mission_slots_used`, `habit_building_slots_used`, `support_slots_used`
- `needs_reduce`, `needs_consolidate`

#### `trace.posture_timeline`

Postures recommandees dans le temps, extraites des state events:

- `at`
- `recommended_posture`
- `confidence`
- `state` (etat associe)

#### `trace.plan_items_snapshot`

Etat des plan_items a la fin de la fenetre auditée (`trace.window.to`), pas au moment
ou la commande est lancee:

- `id`, `dimension`, `kind`, `title`, `status`
- `status_current` (etat actuel en base, utile pour repérer un drift apres la fenetre)
- `current_habit_state`, `activation_order`
- `activated_at`, `completed_at`, `last_entry_at`
- `entry_count_in_window`, `recent_entries`

`last_entry_at` est reconstruit sur `effective_at` et non sur `created_at`.
Crucial pour comprendre le contexte plan_fit et load_balance.

#### `trace.entries_timeline`

Entries dans la fenetre:

- `plan_item_id`, `item_title`, `entry_kind`, `outcome`
- `difficulty_level`, `blocker_hint`
- `effective_at`

#### `trace.proactive_events`

Decisions proactives V2 dans la fenetre:

- `daily_bilan_decided_v2`
- `daily_bilan_completed_v2`
- `weekly_bilan_decided_v2`
- `weekly_bilan_completed_v2`
- `morning_nudge_generated_v2`
- `proactive_window_decided_v2`

#### `trace.unassigned_events`

Events non rattaches aux categories precedentes. A surveiller: trop d'events non assignes rend l'audit moins fiable.

### `scorecard`

Vue agregee pour aller vite sur les signaux importants.

#### `scorecard.states`

Distribution des etats publics:

- `distribution`: { momentum: N, friction_legere: N, ... }
- `current_state`: etat de fin de fenetre
- `state_count`: nombre total d'etats observes

Interpretations utiles:

- `momentum` dominant avec peu d'entries reelles → machine trop optimiste
- `soutien_emotionnel` tres dominant → sur-classement emotionnel
- `evitement` quasi absent sur une base peu repondante → angle mort
- `reactivation` jamais observe malgre des periodes d'inactivite → detection trop lente

#### `scorecard.transitions`

- `total`: nombre de transitions
- `matrix`: matrice from→to

Reperer:

- Oscillations rapides entre deux etats (ex: momentum ↔ friction_legere en boucle)
- Transitions attendues jamais observees
- Transitions directes momentum → evitement (sans passer par friction_legere)

#### `scorecard.dimensions`

Distribution des niveaux par dimension:

- `engagement`: { high: N, medium: N, low: N }
- `execution_traction`: { up: N, flat: N, down: N, unknown: N }
- `emotional_load`: { low: N, medium: N, high: N }
- `consent`: { open: N, fragile: N, closed: N }
- `plan_fit`: { good: N, uncertain: N, poor: N }
- `load_balance`: { balanced: N, slightly_heavy: N, overloaded: N }

Les deux nouvelles dimensions (plan_fit, load_balance) meritent une attention particuliere car elles determinent la distinction "friction user vs plan mal dose".

#### `scorecard.plan_fit_analysis`

- `good_pct`, `uncertain_pct`, `poor_pct`
- `zombie_count`: items actifs sans traction > 7 jours
- `stalled_count`: items explicitement stalled

Si `poor_pct` est eleve et que le systeme reste en `momentum` ou `friction_legere`, c'est un probleme.

#### `scorecard.load_balance_analysis`

- `balanced_pct`, `slightly_heavy_pct`, `overloaded_pct`
- `active_load_min`, `active_load_max`, `active_load_avg`
- `needs_reduce_count`: nombre de fois ou `needs_reduce=true`

Si `overloaded_pct` est eleve sans `reduce_load` ou `simplify` en posture, c'est un probleme.

#### `scorecard.posture_distribution`

Distribution des postures recommandees:

- { push_lightly: N, simplify: N, hold: N, support: N, reopen_door: N, reduce_load: N, repair: N }

#### `scorecard.decisions`

Synthese des decisions proactives:

- `daily_bilans`: { decided: N, completed: N }
- `weekly_bilans`: { decided: N, completed: N }
- `morning_nudges`: { generated: N }
- `proactive_windows`: { decided: N }

#### `scorecard.alerts`

Patterns detectes automatiquement:

- `oscillating_transitions`: paires d'etats qui alternent > 3 fois dans la fenetre
- `plan_fit_poor_ignored`: plan_fit=poor mais etat reste momentum ou friction_legere
- `load_overloaded_no_reduce`: load_balance=overloaded mais posture != reduce_load et != simplify
- `accused_user_while_plan_overloaded`: etat=evitement alors que load_balance=overloaded
- `needs_reduce_false_despite_high_load`: active_load > 7 mais needs_reduce=false
- `stale_momentum`: etat=momentum > 48h sans entries positives
- `rapid_degradation`: passage de momentum a evitement en < 2 tours

### `annotations`

Jugements humains optionnels. Par dimension et par label (`good`, `partial`, `miss`, `harmful`).

## 4. Methode d'audit

### Ordre recommande

1. **Lire le transcript** du debut a la fin. Sentir la dynamique relationnelle, reperer les moments de bascule.
2. **Consulter la scorecard**. Reperer les distributions anormales, les alertes, les desequilibres.
3. **Zoomer sur `trace.state_timeline`** autour des moments de bascule identifies au step 1. Verifier que les dimensions supportent la classification.
4. **Verifier `trace.plan_items_snapshot`** et `trace.entries_timeline`. Le plan_fit et le load_balance correspondent-ils a la realite des items ?
5. **Verifier `trace.active_load_timeline`**. Le score evolue-t-il apres les ajustements weekly ?
6. **Verifier `trace.posture_timeline`**. La posture suit-elle logiquement l'etat et les dimensions ?
7. **Verifier `trace.proactive_events`**. Les decisions proactives respectent-elles la posture ?
8. **Synthese**: croiser les observations du transcript avec la mecanique interne pour identifier les patterns recurrents.

### Questions de diagnostic rapide

Pour chaque moment critique, se poser:

1. L'etat derive etait-il juste ?
2. Les 6 dimensions supportaient-elles vraiment cet etat ?
3. plan_fit et load_balance sont-ils corrects par rapport aux plan_items reels ?
4. La posture recommandee est-elle coherente ?
5. Le systeme accuse-t-il le user alors que le plan est trop charge ?
6. Le systeme allège-t-il trop vite un plan qui marche bien ?
7. La reaction utilisateur a-t-elle confirme ou infirme la posture ?

## 5. Checklist d'audit

### Classification d'etat

- [ ] L'etat derive est-il coherent avec les messages reels ?
- [ ] Les 6 dimensions supportent-elles la classification ?
- [ ] `pause_consentie` ecrase-t-elle bien tout le reste quand consent=closed ?
- [ ] `soutien_emotionnel` ecrase-t-il friction_legere et momentum quand emotional_load=high ?
- [ ] L'etat ne reste pas en `momentum` malgre absence de progression (execution_traction=down) ?
- [ ] L'etat ne degrade pas trop vite sur un seul tour faible ?

### Plan fit et load balance

- [ ] plan_fit est-il correct (le plan convient-il a la situation reelle) ?
- [ ] Les items zombies (actifs > 7 jours sans entry) font-ils baisser plan_fit ?
- [ ] Les items recemment actives (< 7 jours sans entry) ne sont pas faussement zombies ?
- [ ] load_balance est-il correct (la charge est-elle equilibree) ?
- [ ] Un plan_fit=poor ou load_balance=overloaded tire-t-il vers simplify/reduce_load ?
- [ ] L'active_load score correspond-il aux items reellement actifs ?

### Posture

- [ ] La posture recommandee decoule-t-elle logiquement des dimensions ?
- [ ] push_lightly n'est jamais propose quand load_balance=overloaded ?
- [ ] reduce_load est-il propose quand needs_reduce=true ?
- [ ] support est-il propose quand emotional_load=high ?
- [ ] reopen_door est-il propose quand consent=fragile et engagement=low ?

### Active load

- [ ] Le score active_load correspond-il aux slots utilises ?
- [ ] needs_reduce=true quand score > seuil (typiquement > 7) ?
- [ ] needs_consolidate=true quand des habits actifs sont fragiles ?
- [ ] Le score change-t-il apres un ajustement weekly ?

### Transitions

- [ ] Les transitions sont-elles ni trop rapides ni trop lentes ?
- [ ] Pas d'oscillations rapides entre deux etats ?
- [ ] Les transitions attendues se produisent-elles (ex: friction → evitement si les signaux persistent) ?

### Distinction friction user vs plan mal dose

- [ ] Un etat `evitement` n'est pas pose alors que load_balance=overloaded ?
- [ ] Un etat `friction_legere` avec plan_fit=poor mene-t-il vers simplify plutot que push_lightly ?
- [ ] Le systeme ne "punit" pas un user dont le plan est objectivement trop charge ?

### Decisions proactives

- [ ] Les decisions proactives respectent-elles la posture recommandee ?
- [ ] Un morning nudge n'est pas envoye en mode push si la posture est hold ou support ?
- [ ] Les bilans sont-ils bloques quand consent=closed ?

## 6. Patterns de bugs frequents

### Herites du V1

- `soutien_emotionnel` declenche sur un simple message de fatigue non durable
- `pause_consentie` non respectee apres un stop explicite
- `reactivation` declenchee alors que le user etait encore present sur un autre scope
- `evitement` jamais detecte alors que les reports et esquives s'accumulent
- systeme qui reste trop longtemps en `momentum` malgre absence de progression
- systeme qui degrade trop vite sur un seul tour faible
- oscillations rapides entre deux etats

### Nouveaux V2

- **plan_fit=good alors que le user echoue sur tout depuis 2 semaines**: execution_traction=down mais plan_fit n'a pas suivi
- **load_balance=balanced alors que 3 missions sont actives**: l'active_load score ne reflète pas la charge reelle
- **posture=push_lightly alors que load_balance=overloaded**: la derivation posture ne prend pas en compte la surcharge
- **active_load score ne change pas apres un ajustement weekly**: le recompute n'est pas declenche
- **needs_reduce=false malgre score > 7**: le seuil est mal calibre
- **le systeme accuse le user (evitement) alors que le plan est objectivement trop charge**: la distinction friction user vs plan mal dose n'est pas faite
- **items actifs sans entry classes zombies immediatement**: `derivePlanFitV2` ne prend pas en compte la date d'activation (bug corrige dans Lot 6A.2)
- **plan_fit calcule au temps reel au lieu du temps snapshot**: `derivePlanFitV2` utilise `Date.now()` au lieu de `nowMs` (bug corrige dans Lot 6A.2)
- **posture=reduce_load jamais propose**: le flag `needs_reduce` n'est pas propage jusqu'a `derivePostureV2`
- **blockers non pris en compte dans l'assessment**: `deriveBlockersV2` ne detecte pas les items stalled

## 7. Leviers de tuning

### Herites du V1

- Seuils de transition entre etats
- Hysteresis (stabilite des transitions)
- Priorites entre etats (consent > emotional > execution > engagement)

### Nouveaux V2

- **Formule de calcul active_load**: poids par slot type (mission=3, habit_building=2, support_recommended=1), seuils needs_reduce et needs_consolidate
- **Seuils zombie**: duree sans entry pour classifier un item comme zombie (actuellement 7 jours)
- **Regles de derivation plan_fit**: ratio stalled+zombie vs total actifs, seuils good/uncertain/poor
- **Regles de derivation load_balance**: mapping score → balanced/slightly_heavy/overloaded
- **Mapping dimensions → posture**: quelle combinaison de dimensions → quelle posture recommandee
- **Poids des signaux execution_traction**: ratio entries positives vs negatives sur les 5 dernieres entries
- **Seuils needs_reduce**: score > 7 par defaut
- **Seuils needs_consolidate**: habits en building > 2 par defaut
- **Detection et taxonomie des blockers V2**: `blocker_kind` (mission/habit/support/global) et `blocker_repeat_score`
- **Derivation assessment confidence**: mapping nombre de signaux / anciennete vers low/medium/high
- **Derivation top_risk**: priorite entre load > avoidance > emotional > consent > drift

## 8. Commande d'export

Le bundle momentum V2 peut etre exporte avec:

```bash
npm run momentum-v2:audit:export -- --user-id <uuid> --hours 72
```

Exemples utiles:

```bash
npm run momentum-v2:audit:export -- --user-id <uuid> --hours 168
npm run momentum-v2:audit:export -- --user-id <uuid> --from 2026-03-10T00:00:00Z --to 2026-03-17T00:00:00Z
npm run momentum-v2:audit:export -- --user-id <uuid> --hours 168 --scope whatsapp
npm run momentum-v2:audit:export -- --user-id <uuid> --hours 168 --scope-all
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

- 24h pour un incident ponctuel
- 72h pour une transition ou une mauvaise relance
- 7 jours pour juger la stabilite des etats et la pression proactive
- 14 jours pour voir une sequence complete `momentum → friction → evitement → reactivation`
- 21 jours pour auditer l'evolution plan_fit sur un cycle complet

## 9. Conclusion

Un bon audit momentum V2 ne juge pas seulement les messages envoyes. Il juge la qualite de la perception (6 dimensions), de la classification (6 etats), de l'assessment (blocker, risk, confidence), de la posture recommandee, et surtout la distinction entre ce qui releve du comportement utilisateur et ce qui releve d'un plan mal calibre.

Si le bundle permet de suivre cette chaine de bout en bout — des signaux conversationnels et entries jusqu'aux decisions proactives et reactions utilisateur — alors il devient possible de corriger le systeme de maniere precise, sans intuition floue ni debugging a l'aveugle.
