# RAPPORT — FF-008 · Le poids annoncé

**Branche** : `ff-001-quotidien-du-coach` · **Date** : 2026-08-08
**Fiche** : `docs/fonctionnalites/conversation/FF-008-le-poids-annonce.md`

---

## 1. État initial constaté — avec preuves

**L'état présumé du bloc de chantier (« n'existe pas ») est FAUX.** FF-008 a été
construite et commitée avant ce run, par le commit `5391586f` (« le poids dit en
conversation atteint la base, et la ceinture le voit enfin », 2026-08-08 00:08).

| Élément | Fichier | Preuve |
|---|---|---|
| Le plancher déterministe | `supabase/functions/_shared/keel/body_measure_floor.ts` (439 l.) | `detectDeclaredBodyMeasure(userMessage, unitSystem)` — `unitSystem` **requis**, pas optionnel |
| L'écriture | `supabase/functions/_shared/keel/week_review_io.ts:317` | `writeDeclaredBodyMeasure` — SELECT puis UPDATE-par-id ou INSERT, jamais d'upsert, relecture obligatoire |
| Le branchement | `supabase/functions/sophia-brain/router/run.ts:3984-4085` | sibling de `detectDeclaredMeal`, sous `if (keelTurn.is_student)` (l. 3839) |
| La ré-évaluation de la ceinture | `run.ts:4046-4063` | `evaluateRestrictionForStudent` puis `keelTurn = { ...keelTurn, restriction: rearmed }` |
| Le correctif écrivain/lecteur | `_shared/keel/restriction_runtime.ts` (fn `weekWeightKg`) | le chargeur lit `biofeedback.weight_kg` d'abord, `outcomes.weight_7d_avg` en repli |
| Tests unitaires | `body_measure_floor_test.ts`, `body_measure_arms_restriction_guard_test.ts` | 33 tests, verts au départ |

**Le défaut de fond que ce commit avait aussi corrigé** mérite d'être redit,
parce qu'il conditionne tout le reste : `restriction_guard` lisait
`outcomes.weight_7d_avg`, que **personne n'écrit** dans le modèle pivot, pendant
que tous les écrivains alimentaient `biofeedback.weight_kg`. `rapid_weight_loss`
ne voyait donc **jamais aucun poids d'élève**, quelle qu'en soit la source — une
ceinture armée sur un coffre vide. Vérifié ici : `restriction_runtime.ts` lit
bien les deux modèles dans le bon ordre.

**Ma mission s'est donc déplacée** de « construire » vers « vérifier
adversarialement, puis corriger ce qui ne tient pas ». C'est ce qui suit.

### Points structurels vérifiés par lecture

- **La porte est atteignable à chaque tour d'élève** : le bloc FF-008 est un
  frère du plancher de repas sous `if (keelTurn.is_student)`, pas un enfant.
  Aucun `return` anticipé entre `processMessage` (l. 3169) et le bloc.
- **Aucun paramètre de garde optionnel** (cicatrice
  `optional-gate-params-are-disarmed-gates`) : `display_unit_system` est chargé
  du profil (`run.ts:1165`, défaut `metric` confirmé en base) et passé en
  positionnel requis.
- **R9 est vide par construction**, et c'est correct : aucun `effect_type` du
  dispatcher n'écrit une mesure corporelle, donc « ne rien faire si le frame
  porte déjà l'effet » n'a pas d'objet. Le plancher écrit lui-même.
- **La ré-évaluation arrive à temps** : `keelRoutingInputs()` (l. 4225) et la
  lane TCA (l. 5431) lisent `keelTurn.restriction` **après** la réassignation
  de la l. 4063.

---

## 2. Écarts fiche/code, et ce qui a été fait

| # | Écart | Sort |
|---|---|---|
| **A5** | Un poids d'un passé **daté** (« la semaine dernière je pesais 85 kg », « last Monday I was 85 kg ») s'écrivait dans la **semaine courante** | **CODE CORRIGÉ** — c'est un bug contre la règle que le module énonçait lui-même |
| **A1** | §5 promet la correction « pardon, 78 pas 87 » ; §7 interdit deux nombres. La fiche **se contredit** | **AMENDEMENT DE FICHE PROPOSÉ** (non appliqué) — le code a raison |
| **A2** | Mineur : rien n'est écrit (conforme), mais l'agent **mentionne** le chiffre — §7 exige « aucune mention » | **BLOQUÉ** — `companion.ts` appartient à l'autre agent |
| **A3** | R3/§8 : « l'agent demande le chiffre absolu une fois » — il ne le demande **jamais** | **BLOQUÉ** — même raison |
| **A4** | §10 demande de mesurer « les refus explicites, par motif » — le plancher rend `null` **sans motif**, rien n'est journalisé | **OUVERT** — trou d'observabilité, consigné |

### A5 — le correctif livré

`body_measure_floor.ts` portait déjà, dans sa liste de désarmes, une section
« LE PASSÉ LOINTAIN » dont le commentaire disait l'intention en toutes lettres :

> « la revue de semaine ne sait pas ranger un passé (question ouverte de FF-008
> §11, **donc interdit tant qu'ouvert**) »

Mais le lexique ne nommait que le passé **lointain** (`l an dernier`,
`last year`, `used to`, `il y a N ans/mois/semaines`). Le passé **proche et
daté** — celui qu'un élève écrit vraiment — passait par le trou : « la semaine
dernière je pesais 85 » mord la porte `je pesais`, « last Monday I was 85 » mord
la porte `i was`, et les deux s'écrivaient dans la semaine courante.

**Ce n'était pas un écart de confort.** C'est le pire des trois sorts possibles :
ni un refus, ni la bonne date, mais une **fausse mesure d'aujourd'hui** dans la
case exacte que `restriction_guard` compare de semaine à semaine. Une perte
réelle s'en trouve diluée, ou une perte inexistante fabriquée.

Ajouté à `DISARM` (FR **et** EN, cicatrice
`guard-tested-in-one-language-only`) : `hier`, `la semaine dernière/passée`, `le
mois dernier/passé`, `le week-end dernier`, les **sept jours nommés** français
et anglais, `yesterday`, `last week/month/weekend/night/<jour>`, `N days/weeks
ago`, et `il y a N jours` (la liste s'arrêtait aux semaines).

Le jour nommé désarme **seul**, sans exiger « dernier » : « lundi je pesais 85 »
ne porte aucun marqueur d'antériorité, et exiger « dernier » raterait la forme
la plus courante. Coût assumé et mesuré : « je me pèse le lundi, je suis à 78 »
est refusé aussi. C'est le sens du refus qui est récupérable (R2) — l'élève
réécrit son poids sans le jour et il est enregistré.

---

## 3. Tableau des tests

Tous en conditions réelles : vrai modèle, base locale, élèves provisionnés
(`keel_role='student'`, `locale` écrite explicitement, `coach_clients` actif,
plan **publié** + `plan_commitments`, `student_week_plans` adopted). Chaque cas
nominal rejoué **3 fois** (dispatcher stochastique). Ardoise
(`weekly_reviews`) effacée avant chaque répétition pour que chaque tour prouve
sa propre écriture. Scripts : `scratchpad/ff008_real_run.ts`,
`ff008_retest.ts`, `ff008_verify.ts`. Kong étendu avant les runs.

### Run 1 — la suite des quatre niveaux (22 cas)

| Niveau | ID | Scénario | Verdict | Preuve |
|---|---|---|---|---|
| easy | E1 | FR « je suis à 78 kg » ×3 | 🟢 | `biofeedback.weight_kg = [78,78,78]`, `source=["chat","chat","chat"]` |
| medium | M1 | EN « I'm at 172 lbs this morning » ×3 | 🟢 | `[78,78,78]` — 172 lb × 0,45359237 = 78,0 kg |
| medium | M2 | FR décimale virgule « 78,4 kg » ×3 | 🟢 | `[78.4,78.4,78.4]` |
| medium | M3 | FR « mon tour de taille est de 92 cm » ×3 | 🟢 | `waist_cm=[92,92,92]`, `weight_kg` reste vide |
| medium | M4 | FR correction en deux tours | 🟢 | t1 → 87 ; t2 → **une seule ligne**, 78 (remplacé, pas ajouté) |
| medium | M5 | EN profil **impérial**, « 172 » sans unité | 🟢 | `[78,78,78]` — défaut profil = lb (R6) |
| hard | H1 / H1en | « je veux atteindre 75 kg » / « I want to get down to 75 kg » | 🟢 | 0 ligne ×3 (cible, R4) |
| hard | H2 / H2en | « j'ai perdu 2 kg » / « I lost 2 kg this week » | 🟢 | 0 ligne ×3 (variation, R3) |
| hard | H3 / H3en | « ma fille fait 32 kg » / « my daughter weighs 32 kg » | 🟢 | 0 ligne ×3 (tiers) |
| hard | H4 | FR « 165 » | 🟢 | 0 ligne ×3 (ambigu sans unité, R6) |
| hard | H5 / H5en | « je suis à 400 kg » / « I'm at 400 kg » | 🟢 | 0 ligne ×3 (hors bornes, R5) |
| hard | H6 / H6en | « entre 78 et 79 kg » / « between 78 and 79 kg » | 🟢 | 0 ligne ×3 (plage) |
| extra-hard | X3 | Élève **mineur** → aucune mesure | 🟢 | 0 ligne ×3 |
| extra-hard | X4 | Poids **+** repas déclaré, même phrase | 🟢 | `weight_kg=78` **et** `protocol_events` 0 → 2 : les deux planchers coexistent |
| extra-hard | X1 | Le poids du chat lève la ceinture | 🔴→🟢 | sonde fausse (voir ci-dessous), re-testée verte |
| extra-hard | X2 | Sous plancher levé, restitution muette | 🔴→🟢 | idem |

**Les deux 🔴 du run 1 étaient des défauts de MA sonde, pas du code** : je lisais
`chat_messages.metadata.response_owner`, **nul en in-app** ; la vérité de la
route est dans `conversation_turn_traces.response_owner`. Pour X2, mon
`hasDigit()` comptait le **numéro de hotline** comme une fuite de chiffre. Les
deux sont re-testés ci-dessous avec la bonne observabilité — je les consigne
plutôt que de les effacer.

### Run 2 — re-tests et revue adversariale (9 cas)

| ID | Hypothèse (écrite AVANT le test) | Verdict | Preuve |
|---|---|---|---|
| **X1** | Un poids du chat qui franchit le seuil lève le plancher **ce tour** (R7) | 🟢 | semaine `-14 j` = 80 kg (dimanche) ; chat « 77,8 kg » → `weight_kg(2026-08-03)=77.8` **et** `response_owner="disordered_eating_guard"`. Perte = (80−77,8)/80/2 = **1,375 %/sem > 1,2**. Réponse : « The progress figures and check-in reminders are paused on your side… » |
| **X2** | Sous plancher levé : la mesure s'écrit, la restitution se tait (R8) | 🟢 | `weight_kg=77.5` relu en base ; réponse « I hear you. The pressure around this is here… » — **aucun** poids, aucune unité, aucune progression |
| A2-écriture | Mineur → rien en base | 🟢 | aucune ligne portant `weight_kg`, 3/3 |
| **A2-mention** | Mineur → l'agent **mentionnera** le chiffre (§7 « aucune mention ») | 🔴 | **3/3** citent 78 : « Noted. 78 kg. » · « **78 kg is now your current weight.** » · « 78 kg is your current reference point. » |
| **A3** | L'agent ne demandera **jamais** le chiffre absolu (R3, §8) | 🔴 | **0/3**. Il commente la perte : « You lost 2 kg this week. That's a real drop… » |
| **A1** | « pardon, 78 pas 87 » → deux nombres, le code refuse malgré §5 | 🔴 | base **inchangée à 87** ; réponse : « **Got it — 78, not 87.** » — accusé fantôme |
| **A5-fr** | Un passé daté s'écrira dans la semaine courante | 🔴 | `weight_kg(2026-08-03)=85` pour « la semaine dernière je pesais 85 kg » |
| **A5-en** | Idem en anglais | 🔴 | `weight_kg(2026-08-03)=85` pour « last Monday I was 85 kg » |
| A8 | Sans plan publié, le plancher écrit quand même | 🟢 | `weight_kg=78` — correct : c'est une donnée de sécurité, elle ne dépend pas du plan |

### Run 3 — vérification après correctif A5 (10 cas, **10 🟢**)

Le correctif se mesure dans les **deux** sens : un désarme trop large
remplacerait un défaut de sécurité par une porte fermée.

| ID | Scénario | Verdict | Preuve |
|---|---|---|---|
| A5-fr | « la semaine dernière je pesais 85 kg » | 🟢 | **0 ligne** (était : 85 écrit) |
| A5-en | « last Monday I was 85 kg » | 🟢 | **0 ligne** |
| A5-hier-fr | « hier je pesais 85 kg » | 🟢 | 0 ligne |
| A5-hier-en | « yesterday I weighed 185 lbs » | 🟢 | 0 ligne |
| A5-jour-fr | « lundi je pesais 85 kg » | 🟢 | 0 ligne |
| NR1 | « je suis à 78 kg » ×3 | 🟢 | `[78,78,78]` |
| NR2 | « je suis à 78 kg **ce matin** » ×3 | 🟢 | `[78,78,78]` |
| NR3 | « I'm at 172 lbs **this morning** » ×3 | 🟢 | `[78,78,78]` |
| NR4 | « je me suis pesé ce matin à 78,4 kg » ×3 | 🟢 | `[78.4,78.4,78.4]` |
| **X1-bis** | R7 après correctif | 🟢 | `weight_kg=77.8` **et** `response_owner="disordered_eating_guard"` |

### Tests unitaires

- Avant : **33 passed / 0 failed**.
- Après (2 tests ajoutés — le passé proche FR+EN, et la non-régression
  « ce matin ») : **35 passed / 0 failed**.
- Suite complète `_shared/keel/` : **1486 passed / 0 failed** — aucune
  régression. `deno check` vert sur les deux fichiers touchés.

---

## 4. Hypothèses adversariales et leur sort

| # | Hypothèse | Sort |
|---|---|---|
| A1 | La correction nommée par §5 est refusée par §7 | **Confirmée** — fiche contradictoire, amendement proposé §6 |
| A2 | Le mineur voit son chiffre renvoyé | **Confirmée, 3/3** — RED ouvert (bloqué) |
| A3 | La relance de R3 n'existe pas | **Confirmée, 0/3** — RED ouvert (bloqué) |
| A4 | Les refus ne sont pas journalisés par motif | **Confirmée par lecture** — `null` nu, §10 non mesurable |
| A5 | Un passé daté est rangé à aujourd'hui | **Confirmée FR+EN** — **corrigée**, re-testée verte |
| A6 | Deux planchers dans la même phrase se volent le tour | **Réfutée** — X4 : `weight_kg=78` **et** 2 `protocol_events` |
| A7 | Le modèle tombe après le plancher → la mesure survit | **Non testable** — je n'ai pas de levier pour faire tomber le modèle après le plancher sans modifier le code de production. Vérifié par **lecture** : l'écriture (l. 4014) précède tout appel de rendu, et son `catch` (l. 4080) journalise en `console.error` sans interrompre le tour |
| A8 | Sans plan publié le plancher se tait | **Réfutée** — il écrit, et c'est correct |
| A9 | La porte est étroite des deux côtés (asymétrie inversée) | **Confirmée** — 11 cas `hard` à 0 ligne sur 3 répétitions, FR et EN |

### Le fil qui relie A1, A2, A3 et A5 — **un seul défaut**

Les quatre REDs de restitution sont **la même cause** : le plancher est
déterministe et **muet**, et la lane de réponse (`agents/companion.ts`) ne sait
**ni ce qu'il a écrit, ni ce qu'il a refusé**. Elle accuse donc réception de
mesures qui n'existent pas :

- A1 : « **Got it — 78, not 87.** » — la base porte 87.
- A2 : « **78 kg is now your current weight.** » — rien n'a été écrit (mineur).
- A5 : « Noted. 85 kg last week is a clear reference point. » — rien n'a été
  écrit (passé daté, après correctif).
- A3 : aucune demande du chiffre absolu, parce que rien ne signale au modèle
  qu'une variation a été vue et refusée.

**C'est exactement l'accusé fantôme que FF-008 existe pour tuer** — déplacé de
l'écriture (corrigée) vers la **restitution** (ouverte). La fiche le dit d'un
mot en §11 (« accusé minimal, une clause ») sans trancher, et le §8 le suppose
partout. Le correctif est un canal plancher → réponse portant trois états :
`écrit(valeur)`, `refusé(motif)`, `rien` — ce qui règle A1, A2, A3, A5 et A4
d'un seul geste.

**Il n'a pas été livré ici** : il se pose dans `agents/companion.ts`, fichier
explicitement réservé à l'autre agent par mon bloc de chantier. Consigné comme
dépendance bloquée, conformément à la consigne.

---

## 5. Ce qui reste ouvert

1. **🔴 A2 — le mineur voit son chiffre** (§7 « aucune mention »). 3/3.
   *Bloqué : `companion.ts`.*
2. **🔴 A3 — la relance de R3 n'existe pas** (§8 gherkin « l'agent demande le
   chiffre exact une seule fois »). 0/3. *Bloqué : `companion.ts`.*
3. **🔴 A1 — accusé fantôme sur une correction refusée.** Doublé d'une
   **contradiction de fiche** à trancher par l'humain (§6 ci-dessous).
4. **🟠 A4 — les refus ne sont pas mesurables.** §10 demande « les refus
   explicites (hors bornes, ambiguïté), **par motif** » ; le plancher rend
   `null` nu. Aucun compteur n'existe, donc la contre-mesure de la fiche (« si
   le taux de correction monte, le plancher mord trop large ») est
   **inobservable aujourd'hui**. Le canal ci-dessus la rendrait mesurable.
5. **🟠 Langue de réponse.** Élèves `locale='fr-FR'`, plan `content_locale`
   `fr-FR` → **réponses en anglais** sur tous mes runs. C'est la cicatrice
   connue `reply-language-ignores-voice-language`, **antérieure et hors
   périmètre FF-008** ; je ne l'ai pas touchée, je la signale parce qu'elle
   traverse toutes les preuves de ce rapport.
6. **⚪ §11 reste ouverte, mais son défaut est fermé.** « Lundi j'étais à 79 » est
   désormais **refusé** (le comportement que le module documentait), pas rangé à
   la mauvaise date. Ranger un passé à sa date reste une décision produit.
7. **⚪ Hygiène base partagée** : 460 comptes `qa-student-*` / `qa-coach-*`
   subsistent dans `auth.users` — accumulation historique de tous les harnais,
   `cleanup()` ne descend pas jusqu'à `auth.users`. **Mes fixtures `ff008_` sont
   nettoyées** (0 profil, 0 coach). Je n'y touche pas : base partagée, sessions
   concurrentes.

### Amendement de fiche **proposé** (non appliqué — l'humain tranche)

> **FF-008 §5**, retirer la parenthèse « — un élève qui se corrige (« pardon, 78
> pas 87 ») doit pouvoir le faire en parlant », qui **contredit §7** (« Deux
> poids dans le même message → rien n'est écrit »).
>
> **Le code a raison de refuser** : trancher lequel des deux nombres est le poids
> serait deviner, et un poids deviné est un poids faux dans une ceinture de
> sécurité (R2). La correction reste possible et **est prouvée** (M4 🟢) sous la
> forme à un nombre : « pardon, je suis à 78 kg » **remplace** 87.
>
> Rédaction proposée : « La dernière déclaration gagne, quelle que soit sa
> source : un élève qui se corrige en **redonnant son poids** (« pardon, je suis
> à 78 kg ») remplace la mesure de la semaine. Une correction qui cite les
> **deux** nombres (« 78 pas 87 ») est refusée comme toute phrase à deux
> nombres — §7. »

---

## 6. Commandes pour l'humain

Rien de risqué n'a été exécuté ; aucune commande bloquée n'a été requise.

```bash
# Les tests unitaires du lot (environnement PURGÉ — sinon 114 faux rouges)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/body_measure_floor_test.ts \
  supabase/functions/_shared/keel/body_measure_arms_restriction_guard_test.ts

# La suite KEEL complète (non-régression) — attendu 1486 passed / 0 failed
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check supabase/functions/_shared/keel/

# Rejouer les runs réels (Kong étendu d'abord, runtime edge rechargé)
./scripts/local_extend_kong_functions_timeout.sh
docker restart supabase_edge_runtime_Sophia_2
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=$(grep -E "^SUPABASE_ANON_KEY=" supabase/.env | cut -d= -f2-) \
SUPABASE_SERVICE_ROLE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" supabase/.env | cut -d= -f2-) \
  deno run -A scratchpad/ff008_verify.ts
```

**Déploiement** — à lancer par l'humain, jamais par l'agent :

```bash
supabase functions deploy sophia-brain
```

(`body_measure_floor.ts` est un module `_shared` : il part avec la fonction qui
l'importe, `sophia-brain`. Aucune migration, aucun secret, aucune table neuve.)
