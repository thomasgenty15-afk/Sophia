# Daily/Weekly V2 Audit Guide

STATUT: complet — Lot 6B

Structure standard: voir [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

## 1. Objectif

Auditer la qualite des bilans V2 sur une fenetre temporelle donnee, de bout en bout:

```
ConversationPulse + momentum_state + active_load + plan_items
→ daily bilan: choix de mode (check_light/check_supportive/check_blocker/check_progress)
→ daily bilan: selection d'items cibles, formulation de questions (1-2), ton adapte
→ daily outcome: capture d'entries, declenchement momentum update
→ weekly bilan: inputs snapshot (active_load, traction, pulse, blockers, victories)
→ weekly decision: hold / expand / consolidate / reduce (max 3 ajustements)
→ weekly materialisation: changements appliques aux plan_items
→ reaction utilisateur
```

Ce guide permet de repondre a:

### Daily

- Le mode choisi (check_light/supportive/blocker/progress) est-il coherent avec l'etat reel ?
- Les items cibles sont-ils les plus pertinents a interroger ?
- Le nombre de questions est-il proportionnel (1-2 la plupart du temps, pas 3 systematiquement) ?
- Le ton est-il adapte au momentum ?
- Le daily donne-t-il l'impression d'un mini questionnaire ou d'un micro check-in naturel ?
- Le daily a-t-il correctement capture une preuve d'execution ou un blocker ?
- Le daily a-t-il correctement declenche un update momentum ou un coaching review ?
- Le daily est-il envoye malgre un silence prolonge (il ne devrait pas) ?

### Weekly

- La decision (hold/expand/consolidate/reduce) est-elle defensable ?
- Les ajustements proposes (max 3) sont-ils pertinents ?
- Un expand est-il propose malgre needs_reduce=true (il ne devrait pas) ?
- Le weekly celebre-t-il avant de corriger ?
- Le weekly propose-t-il un changement de plan quand la charge est excessive ?
- La posture suggeree pour la semaine suivante est-elle coherente ?
- Les wins et blockers retenus sont-ils les bons (pas les plus recents mais les plus significatifs) ?

### Distinction fondamentale V2: daily micro check-in vs weekly recalibrage

Le daily et le weekly ont des roles fondamentalement differents:

| Bilan | Role | Frequence | Acteur | Impact |
|-------|------|-----------|--------|--------|
| Daily | Micro check-in: capturer 1-2 signaux frais, maintenir le lien | Quotidien | Heuristique (Tier 1) + prompt leger | Entries + momentum update |
| Weekly | Recalibrage structurel: ajuster le plan en profondeur | Hebdomadaire | LLM (Tier 2) | Mutations plan_items |

Un audit V2 doit systematiquement verifier que chaque bilan reste dans son role. Un daily qui pose 3+ questions structurantes deborde sur le territory du weekly. Un weekly qui ne materialise aucun ajustement ne remplit pas sa fonction.

## 2. Ce que le bundle V2 contient

La commande d'export bilans V2 produit deux fichiers:

- un fichier JSON principal (trace + scorecard + annotations)
- un fichier transcript texte

Le JSON est la source d'audit complete.
Le transcript permet une lecture humaine rapide de la dynamique conversationnelle.

### Comment le daily fonctionne

Le daily bilan V2 est un micro check-in (1-2 questions) qui:

1. Est declenche via `scheduled_checkins` selon la cadence configuree
2. Choisit un mode parmi `check_light`, `check_supportive`, `check_blocker`, `check_progress` en fonction de l'etat momentum et de l'active_load
3. Selectionne les items les plus pertinents a interroger (urgency_score, fragility_score)
4. Formule 1-2 questions courtes avec un ton adapte au momentum
5. Capture les reponses comme `user_plan_item_entries`
6. Declenche un update momentum si le signal est significatif

Le daily ne touche jamais au plan. Il collecte des signaux et nourrit la boucle de feedback.

### Comment le weekly fonctionne

Le weekly bilan V2 est une recalibration structurelle qui:

1. Collecte un snapshot d'inputs: active_load, traction par item, ConversationPulse summary, blockers, victories
2. Passe ces inputs a un LLM (Tier 2) pour une decision de recalibrage
3. Produit une decision parmi `hold`, `expand`, `consolidate`, `reduce`
4. Propose max 3 ajustements concrets (activate, deactivate, maintenance, replace)
5. Materialise ces ajustements directement dans `user_plan_items` (changement de status, activation_order, etc.)
6. Genere un coaching_note et une posture suggeree pour la semaine suivante

Le weekly est le seul mecanisme qui modifie structurellement le plan.

### Role de la ConversationPulse

La ConversationPulse alimente a la fois les decisions daily et weekly. Elle est stockee dans `system_runtime_snapshots` et fournit un resume structure de la dynamique conversationnelle recente: engagement, tone, blockers mentionnes, signaux emotionnels. Le daily l'utilise pour choisir son mode et son ton. Le weekly l'utilise comme un des inputs de sa decision de recalibrage.

### Tables V2 cles

| Table | Role dans les bilans |
|-------|---------------------|
| `scheduled_checkins` | Declenchement et tracking des dailys |
| `weekly_bilan_recaps` | Stockage des decisions et materializations weekly |
| `user_plan_items` | Cible des ajustements weekly, source de traction pour les dailys |
| `user_plan_item_entries` | Entries capturees par les dailys, input de traction pour le weekly |
| `system_runtime_snapshots` | Stockage de la ConversationPulse, input pour daily et weekly |

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

Verifier la fenetre avant toute conclusion. Pour un audit daily, 72h suffisent. Pour un audit weekly, 168h minimum. Pour comparer deux cycles weekly, 336h.

### `trace`

Le coeur du bundle. Contient:

#### `trace.window`

- `from`, `to`, `scope`, `hours`

C'est la verite de la fenetre analysee. Toujours la verifier. Pour un audit weekly, s'assurer que la fenetre couvre au moins un cycle complet (168h).

#### `trace.summary`

Resume les volumes globaux:

- `messages_total`: nombre total de messages dans la fenetre
- `daily_bilans_count`: nombre de daily bilans declenches
- `weekly_bilans_count`: nombre de weekly bilans declenches
- `entries_total`: nombre d'entries capturees
- `adjustments_total`: nombre d'ajustements weekly materialises

Interpretations utiles:

- `daily_bilans_count` = 0 sur 72h → les scheduled_checkins ne se declenchent pas ou l'utilisateur ne repond jamais
- `entries_total` faible par rapport a `daily_bilans_count` → les dailys ne capturent rien d'exploitable
- `weekly_bilans_count` = 0 sur 168h → le weekly ne se declenche pas
- `adjustments_total` eleve par rapport a `weekly_bilans_count` → chaque weekly fait trop de changements
- `adjustments_total` = 0 malgre `weekly_bilans_count` > 0 → le weekly decide mais ne materialise pas

#### `trace.messages`

Messages bruts avec:

- `id`, `role`, `content`, `scope`, `created_at`, `metadata`

Les messages utilisateur sont la verite source. Si le daily cible un item que l'utilisateur n'a jamais mentionne, ou si le weekly celebre un "win" non reel, les messages permettent de le verifier.

#### `trace.daily_decisions`

Chronologie de chaque daily bilan decide:

- `at`: timestamp de la decision
- `mode`: `check_light` | `check_supportive` | `check_blocker` | `check_progress`
- `items_targeted`: liste des plan_items cibles pour ce daily
- `tone`: ton choisi (adapte au momentum)
- `capture_result`: ce que le daily a reussi a capturer (`entry_created`, `blocker_detected`, `skipped`, `no_response`)

Verifier pour chaque daily:

- Le mode est-il coherent avec l'etat momentum a ce moment-la ?
- Les items cibles sont-ils les plus urgents ou fragiles (pas un item en maintenance stable) ?
- Le nombre de questions reste-t-il dans la fourchette 1-2 ?
- Le ton ne contredit-il pas le mode (ex: ton enthousiaste en check_blocker) ?

#### `trace.daily_outcomes`

Pour chaque daily, les resultats effectifs:

- `daily_id`: reference au daily_decision correspondant
- `entries_created`: nombre et detail des entries generees
- `momentum_update_triggered`: boolean — le daily a-t-il declenche un recalcul momentum ?
- `items_affected`: plan_items dont l'etat a ete impacte par les entries capturees

C'est la section qui prouve que le daily a un impact reel. Un daily qui ne genere jamais d'entries et ne trigger jamais de momentum update est un bruit inutile pour l'utilisateur.

#### `trace.weekly_decisions`

Pour chaque weekly bilan:

- `at`: timestamp de la decision
- `decision`: `hold` | `expand` | `consolidate` | `reduce`
- `load_adjustments`: liste des ajustements proposes (max 3), chacun avec: item concerne, action (activate/deactivate/maintenance/replace), justification
- `coaching_note`: message de coaching genere par le LLM
- `suggested_posture_next_week`: posture recommandee pour la semaine suivante

Verifier pour chaque weekly:

- La decision est-elle defensable au vu des inputs ?
- Les ajustements sont-ils <= 3 ?
- Un expand n'est-il pas propose alors que needs_reduce=true ?
- Le coaching_note celebre-t-il les wins avant de corriger ?

#### `trace.weekly_inputs_snapshot`

Ce que le LLM weekly a recu en entree. C'est la section la plus importante pour comprendre pourquoi le weekly a pris telle decision:

- `active_load`: score, slots, needs_reduce, needs_consolidate au moment du weekly
- `traction_by_item`: pour chaque plan_item actif, son score de traction (entries recentes, tendance)
- `conversation_pulse_summary`: resume de la ConversationPulse (engagement, tone, blockers, signaux emotionnels)
- `blockers`: blockers detectes dans la fenetre
- `victories`: wins detectes dans la fenetre

Si la decision semble incoherente, cette section permet de determiner si c'est le LLM qui a mal juge ou si les inputs eux-memes etaient biaises.

#### `trace.weekly_materializations`

Les ajustements reellement appliques aux plan_items:

- `adjustment_id`: reference a l'ajustement dans weekly_decisions
- `action`: `activate` | `deactivate` | `maintenance` | `replace`
- `item_id`: plan_item concerne
- `before_status`: statut avant materialisation
- `after_status`: statut apres materialisation
- `applied_at`: timestamp de la materialisation

Comparer systematiquement avec `trace.weekly_decisions`: un ajustement propose mais non materialise est un bug silencieux. Un ajustement materialise non propose est un bug critique.

#### `trace.correlation`

Croisements automatiques entre daily et weekly:

- `daily_mode_vs_momentum_state`: pour chaque daily, le mode choisi et l'etat momentum au meme moment. Permet de verifier la coherence (check_blocker devrait apparaitre quand l'etat est friction ou pire, pas en momentum)
- `weekly_decision_vs_active_load_score`: pour chaque weekly, la decision et le score active_load. Un expand avec score > 7 ou un hold avec score < 3 meritent investigation
- `weekly_decision_vs_needs_reduce`: pour chaque weekly, la decision et le flag needs_reduce. Un expand alors que needs_reduce=true est un bug

#### `trace.unassigned_events`

Events non rattaches aux categories precedentes. A surveiller: trop d'events non assignes rend l'audit moins fiable. Des events `daily_bilan_decided_v2` ou `weekly_bilan_completed_v2` qui atterrissent ici signalent un probleme de parsing dans le script d'export.

### `scorecard`

Vue agregee pour aller vite sur les signaux importants.

#### `scorecard.daily_mode_distribution`

Distribution des modes daily sur la fenetre:

- `check_light`: N
- `check_supportive`: N
- `check_blocker`: N
- `check_progress`: N

Interpretations utiles:

- 100% `check_light` → le systeme ne detecte jamais de friction, trop optimiste
- 100% `check_blocker` → le systeme est trop pessimiste, fatigue l'utilisateur
- 0% `check_progress` → le systeme ne celebre jamais, manque de renforcement positif
- Distribution equilibree sur 7j → bonne sensibilite aux variations de momentum

#### `scorecard.daily_items_targeted_avg`

Nombre moyen d'items cibles par daily.

- Attendu: 1-2. Un daily qui cible systematiquement 3+ items se transforme en questionnaire.
- 0 en moyenne → les dailys ne ciblent rien, ils sont generiques (mauvais signe).

#### `scorecard.daily_questions_avg`

Nombre moyen de questions posees par daily.

- Attendu: 1-2 (le daily est un micro check-in).
- > 2.5 en moyenne → le daily deborde sur le role du weekly.

#### `scorecard.daily_capture_rate`

Pourcentage de dailys qui ont genere au moins 1 entry.

- Bon: > 60%. Le daily capture effectivement des signaux.
- Mauvais: < 30%. Le daily est ignore ou pose des questions sans interet.

#### `scorecard.daily_skip_rate`

Pourcentage de jours ou aucun daily n'a eu lieu (pas envoye ou pas repondu).

- Attendu: < 30% sur une fenetre de 7j. Un skip rate eleve peut etre normal (weekend) ou signaler un probleme de cadence.

#### `scorecard.weekly_decision_distribution`

Distribution des decisions weekly:

- `hold`: N
- `expand`: N
- `consolidate`: N
- `reduce`: N

Interpretations utiles:

- 100% `hold` sur plusieurs semaines → le systeme est trop conservateur, le plan ne bouge jamais
- `expand` frequent avec des dailys en check_blocker → incoherence systeme
- `reduce` jamais observe malgre signals de surcharge → le seuil needs_reduce est trop haut

#### `scorecard.weekly_adjustment_count_avg`

Nombre moyen d'ajustements par weekly.

- Attendu: 1-2. Max 3 par design.
- > 3 en moyenne → bug, la contrainte de max 3 n'est pas respectee.
- 0 en moyenne → le weekly decide mais ne propose rien (hold systematique ou bug de materialisation).

#### `scorecard.weekly_materialisation_rate`

Ratio ajustements proposes vs ajustements effectivement materialises.

- Bon: > 90%. Les decisions se traduisent en actions.
- Mauvais: < 70%. Le pipeline de materialisation a des trous.

#### `scorecard.weekly_coherence_rate`

Coherence entre la decision weekly et les signaux:

- `expand` quand needs_reduce=false → coherent
- `reduce` quand needs_reduce=true → coherent
- `expand` quand needs_reduce=true → incoherent (alerte)
- `hold` quand needs_reduce=true et que la charge persiste → suspect

Un taux de coherence < 80% signale un probleme dans le prompt weekly ou dans la qualite des inputs.

#### `scorecard.alerts`

Patterns detectes automatiquement:

- `expand_with_needs_reduce`: un weekly a propose expand alors que needs_reduce=true. Bug de decision.
- `daily_on_silence`: un daily a ete envoye apres > 48h de silence sans adaptation de mode. Le daily devrait etre susprime ou passer en check_supportive.
- `weekly_without_matiere`: un weekly a ete declenche avec < 3 entries dans la fenetre. Pas assez de matiere pour decider.
- `reduce_with_activate`: un weekly a decide reduce mais un de ses ajustements est une activation. Contradiction.
- `weekly_5plus_adjustments`: un weekly a propose 5+ ajustements. Violation de la contrainte max 3.

### `annotations`

Jugements humains optionnels. Par bilan type (daily/weekly) et par label (`good`, `partial`, `miss`, `harmful`).

## 4. Methode d'audit

### Ordre recommande

1. **Lire le transcript** du debut a la fin. Reperer les patterns d'engagement: jours actifs, jours de silence, moments de frustration, moments de traction. Noter quels items l'utilisateur mentionne naturellement.

2. **Consulter la scorecard**. Verifier les distributions (daily_mode, weekly_decision), les taux (capture_rate, materialisation_rate, coherence_rate), et les alertes.

3. **Zoomer sur `trace.daily_decisions`**. Pour chaque daily, le mode est-il coherent avec le momentum a ce moment-la ? Un check_light en pleine friction ou un check_blocker en plein momentum sont des anomalies.

4. **Verifier `trace.daily_outcomes`**. Les dailys capturent-ils effectivement des entries ? Un daily sans capture ni momentum update n'a pas rempli sa mission.

5. **Verifier `trace.weekly_inputs_snapshot`**. Que voyait le LLM quand il a pris sa decision ? Les inputs etaient-ils fideles a la realite du transcript ?

6. **Verifier `trace.weekly_decisions`**. La decision est-elle defensable au vu des inputs ? Un expand avec un active_load de 8 et needs_reduce=true n'est pas defensable. Un hold avec une traction forte et un score de 3 est sous-optimal.

7. **Verifier `trace.weekly_materializations`**. Les ajustements proposes ont-ils ete reellement appliques ? Comparer before/after status. Un ajustement "deactivate" qui laisse l'item en "active" est un bug de materialisation.

8. **Verifier `trace.correlation`**. Les daily modes sont-ils correles avec les momentum states ? Les weekly decisions sont-elles correlees avec l'active_load ? Les incoherences systematiques signalent un defaut structurel, pas un cas isole.

### Questions de diagnostic rapide

Pour chaque moment critique, se poser:

1. Le daily etait-il envoye au bon moment et avec le bon mode ?
2. La question posee etait-elle naturelle ou formulaire ?
3. L'entry capturee reflète-t-elle un vrai signal d'execution ?
4. Le weekly avait-il assez de matiere pour decider ?
5. La decision weekly est-elle defensable au vu des inputs ?
6. Les ajustements weekly sont-ils materialises ?
7. La reaction utilisateur a-t-elle confirme ou infirme la decision ?

## 5. Checklist d'audit

### Daily

- [ ] Le mode est-il coherent avec le momentum et l'active_load ?
- [ ] Les items cibles sont-ils les plus urgents ou fragiles ?
- [ ] Le daily ne cible pas un item en in_maintenance trop souvent ?
- [ ] Le daily ne ressemble pas a un formulaire (trop de questions, ton plat) ?
- [ ] Le daily n'est pas envoye apres plusieurs jours de silence sans adaptation ?
- [ ] La capture (entries) est-elle exploitable pour le momentum ?
- [ ] Le daily ne declenche pas un momentum update non justifie par le signal ?
- [ ] Le mode check_progress est-il utilise quand il y a de vraies wins a celebrer ?

### Weekly

- [ ] La decision est-elle supportee par les inputs (load, traction, pulse) ?
- [ ] Pas d'expand si needs_reduce=true ?
- [ ] Max 3 ajustements ?
- [ ] Les wins sont cites avant les corrections ?
- [ ] La posture suggeree est coherente avec la decision ?
- [ ] Les ajustements sont materialises (pas juste recommandes) ?
- [ ] Le coaching_note est personnalise (pas generique) ?
- [ ] Le weekly n'a pas ete declenche sans matiere suffisante (< 3 entries) ?

### Correlation daily-weekly

- [ ] Les modes daily de la semaine sont coherents avec la decision weekly de fin de semaine ?
- [ ] Un weekly reduce est precede de dailys en check_blocker ou check_supportive ?
- [ ] Un weekly expand est precede de dailys en check_progress ou check_light ?
- [ ] Les items cibles par les dailys apparaissent dans les inputs weekly (traction_by_item) ?

## 6. Patterns de bugs a surveiller

### Daily

- daily toujours en check_light (trop optimiste, ignore les frictions)
- daily toujours en check_blocker (trop pessimiste, fatigue l'utilisateur)
- daily qui cible un item que l'utilisateur n'a jamais mentionne
- daily envoye malgre un silence prolonge (> 48h) sans adaptation de mode
- daily qui pose 3+ questions systematiquement (deborde sur le weekly)
- daily qui ne capture aucune entry sur 3+ jours consecutifs
- daily dont le ton contredit le mode (enthousiaste en check_blocker, alarmiste en check_light)
- correlation inverse: daily envoye les jours de faible engagement mais jamais les jours de bonne traction

### Weekly

- weekly qui propose expand + reduce dans le meme batch
- weekly qui celebre des "wins" qui ne sont pas de vraies avancees
- weekly qui ne materialise pas ses propres ajustements
- weekly qui change 5+ items d'un coup (trop destabilisant)
- weekly qui propose expand alors que needs_reduce=true
- weekly qui decide hold indefiniment sans jamais ajuster
- weekly dont le coaching_note est generique et non personnalise
- weekly declenche avec < 3 entries dans la fenetre (pas assez de matiere)
- weekly qui active un item dans un ajustement reduce (contradiction)

### Pipeline

- **ConversationPulse stale**: le weekly recoit un pulse vieux de 48h+ qui ne reflète pas la dynamique recente
- **Entries orphelines**: entries creees par un daily mais non rattachees au bon plan_item
- **Materialisation silencieuse**: le weekly_bilan_recap marque l'ajustement comme "applied" mais le plan_item n'a pas change de status
- **Active load non recalcule**: un ajustement weekly materialise mais le score active_load reste identique
- **Scheduled checkin fantome**: un daily est decide (event cree) mais jamais envoye a l'utilisateur

## 7. Leviers de tuning

### Daily

- heuristiques de choix de mode daily (seuils par dimension momentum: quel score d'engagement, d'execution_traction, d'emotional_load pour chaque mode)
- logique de selection des items cibles (urgency_score, fragility_score, derniere date d'entry, proximite d'un blocker)
- prompt de formulation des questions daily (ton, longueur, angle d'attaque)
- nombre max de questions par daily (actuellement 2, potentiellement 1 en check_light)
- regles de suppression du daily en cas de silence (seuil en heures, fallback vers check_supportive vs pas de daily)
- cadence des scheduled_checkins (frequence, horaire, jours actifs)

### Weekly

- regles weekly d'eligibilite a expand (quels signaux de traction sont necessaires, seuil minimal d'entries positives)
- seuils de reduce (quand la charge est "trop haute": score active_load, needs_reduce, nombre d'items en difficulte)
- nombre max d'ajustements weekly (actuellement 3)
- regles de celebration (quand reconnaitre un win: completion, streak, depassement d'un blocker)
- matiere minimale pour declencher un weekly (nombre d'entries, jours actifs)
- prompt weekly Tier 2 (instructions au LLM: comment peser les inputs, priorite celebration vs correction)

### Pipeline

- fraicheur maximale de la ConversationPulse pour le weekly (seuil d'obsolescence)
- delai de materialisation post-decision weekly
- declenchement du recompute active_load apres materialisation
- gestion des conflits si un daily et un weekly tombent le meme jour

## 8. Commande d'export

Le bundle bilans V2 peut etre exporte avec:

```bash
npm run bilans-v2:audit:export -- --user-id <uuid> --hours 168
```

Exemples utiles:

```bash
npm run bilans-v2:audit:export -- --user-id <uuid> --hours 72
npm run bilans-v2:audit:export -- --user-id <uuid> --hours 336
npm run bilans-v2:audit:export -- --user-id <uuid> --from 2026-03-17T00:00:00Z --to 2026-03-24T00:00:00Z
npm run bilans-v2:audit:export -- --user-id <uuid> --hours 168 --scope whatsapp
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

- **72h** pour un audit daily: voir 2-3 dailys et verifier mode, questions, capture
- **168h** (7 jours) pour un cycle weekly complet: voir un weekly avec ses dailys en amont et la materialisation
- **336h** (14 jours) pour comparer deux cycles weekly: le premier weekly a-t-il eu un impact mesurable sur le deuxieme ?
- `--from/--to` pour cibler un incident specifique (ex: un weekly qui a fait 5 ajustements d'un coup)
- `--scope whatsapp` recommande sauf si l'utilisateur est multi-scope

## 9. Conclusion

Un bon audit bilans V2 ne juge pas seulement si un daily a ete envoye ou si un weekly a pris une decision. Il juge la qualite de la chaine complete: le daily pose-t-il la bonne question au bon moment, capture-t-il un signal exploitable, le weekly recoit-il des inputs fideles, sa decision est-elle defensable, ses ajustements sont-ils materialises, et l'utilisateur reagit-il positivement au fil des cycles.

Le daily et le weekly sont les deux mecanismes qui rendent le plan vivant. Le daily collecte des micro-signaux quotidiens. Le weekly recalibre le plan en profondeur. Si l'un des deux dysfonctionne — un daily trop intrusif qui lasse l'utilisateur, ou un weekly trop conservateur qui ne touche jamais au plan — toute la boucle d'adaptation V2 est compromise.

Le bundle d'audit permet de suivre cette chaine de bout en bout: des ConversationPulse et momentum states en entree, jusqu'aux entries capturees, decisions prises, ajustements materialises, et reactions utilisateur. Avec ces traces, il devient possible de corriger le systeme de maniere precise, qu'il s'agisse d'un seuil de mode daily mal calibre, d'un prompt weekly trop generique, ou d'un pipeline de materialisation qui perd des ajustements en route.
