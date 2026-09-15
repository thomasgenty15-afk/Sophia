# Feuille de bugs — run `ff056-boutons-run1` (2026-08-12)

Rapport de run : `../qa-run-reports/2026-08-12-ff056-boutons-run1.md`

---

## R1-B01 — La divergence promet un effet sur la semaine suivante que rien ne produit

- **Bug id** : `R1-B01`
- **Tours** : trajectoire 1.1 tour 2 (voie bouton) · trajectoire 1.2 tour 1 (voie texte)
- **Famille** : `BF-LEDGER-01` — claim sans commit
- **Domaine owner** : FF-056 · flow de divergence de poids (les deux lanes)
- **Source amont** :
  - `_shared/keel/weight_divergence_buttons.ts:446` (FR) et `:480` (EN)
  - `sophia-brain/skills/weight_divergence/visible_agent.ts:206` (FR) et `:174` (EN)
  - le trou réel : **aucun lecteur** de `student_weight_divergence_episodes` côté
    composition (`week_plan_generation.ts`, `meal_generation.ts`,
    `generate-week-plan-v1` ne le référencent pas)
- **Symptôme visible** : après avoir nommé le créneau, la personne lit « c'est
  noté, et la prochaine semaine que tu composeras en tiendra compte » (voie
  bouton) ou « le plan a bien pris en compte ce point, et il guidera la
  prochaine semaine à construire » (voie texte). La semaine suivante ne
  s'appuiera sur rien de tout ça.
- **Preuve système** :
  - log edge : `visible_task: "acknowledge_named_spot_without_action"`,
    `episode_state: "nothing_to_change"`, `opens_observation_window: false`
  - base, persona `a5fef211…` : seule écriture durable = la ligne d'épisode
    (`category=named_spot`, `turn_count=1`). `student_daily_recommendations`=0,
    `protocol_events`=0, `memory_items`=0
  - grep exhaustif : les seuls référents de la table sont son moteur, son io, le
    routeur de boutons, `sophia-brain/router/run.ts` et un test RGPD
- **Correction attendue** (architecture, pas formulation) — deux voies, par
  ordre de préférence :
  1. **brancher le consommateur** : la catégorie de l'épisode entre dans le
     contexte de composition de la semaine suivante, ce que la copie promet et
     ce que la fiche laisse entendre. C'est la correction qui honore l'intention ;
  2. **sinon**, aligner la copie sur ce que le code fait (accuser réception, et
     rien de plus) — **dans les deux modules**, pas dans un seul, sous peine de
     laisser la promesse vivante sur une lane.
  Une rustine de phrase sur la seule lane bouton serait le pire des trois : elle
  ferait diverger les deux voies sur la même règle, faute que ce dépôt paie déjà.
- **Statut** : **`verified`** — corrigé et re-vérifié en run réel
  (`ff056-boutons-run2`, 2026-08-12) sur **six chemins de boutons** et **trois
  tours de modèle**, dans les deux langues et sur les deux lanes.
- **Fix reference** : commits `224cb106` (première passe) et la seconde passe qui
  remplace les permutations par le verbe nu. Rapport de vérification :
  `../qa-run-reports/2026-08-12-ff056-boutons-run2.md`.
  ⚠️ **Il a fallu DEUX passes.** La première garde portait « guidera **la
  prochaine** » ; le modèle a écrit « guidera **la semaine prochaine** » — deux
  mots permutés, garde muette (cicatrice
  `forbidden-matcher-explanation-word-order`). La seconde passe bloque le **verbe
  nu**. Les tests unitaires de la première passe étaient verts, mutation
  comprise : ils ne testaient que les formulations imaginées. **Seul le run réel
  a trouvé le trou.**
  Périmètre réel : **six sites**, pas quatre — `acknowledge_activity_drop`
  portait la même affirmation sous une autre forme (« contexte utile pour la
  façon dont tes semaines sont construites »), invisible au grep d'ouverture.
  Mesure notable : **le modèle a produit la promesse 3 fois sur 3** sur trois
  formulations distinctes. La garde mord à chaque tour ; elle ne fait pas un
  travail théorique.
- **Ce qui RESTE à faire, et devient un lot à part** : brancher le lecteur côté
  composition — c'est-à-dire **tenir** la promesse au lieu de la retirer. Décision
  humaine du 2026-08-12 : on rend le produit honnête d'abord, la fonctionnalité
  ensuite.
- **Tests requis** :
  - positif : après un `named_spot`, la composition de la semaine suivante porte
    bien le créneau nommé dans son contexte (si voie 1) ;
  - anti-faux-positif : une garde qui interdit toute phrase annonçant un effet
    de composition **tant qu'aucun lecteur n'existe**, avec un cas qui PASSE sur
    une formulation d'accusé de réception légitime ;
  - paraphrase FR **et** EN : les deux gabarits portent la promesse ;
  - intégration : rejouer la trajectoire 1.1 tour 2 et vérifier la cohérence
    entre le texte lu et l'effet en base.

### Note d'antériorité

**Ce défaut n'est pas une régression du chantier de bascule.** La phrase existait
dans `visible_agent.ts` (lane conversationnelle) avant le lot boutons, qui l'a
reportée fidèlement. Le lot a donc hérité de la dette, et l'a doublée en la
posant sur une seconde lane.

---

## R1-B02 — Le plan est un acteur qui « prend en compte » et « guide »

- **Bug id** : `R1-B02`
- **Tours** : trajectoire 1.2 tour 1
- **Famille** : `a classifier` (candidat : anthropomorphisme de surface produit ;
  aucune famille existante ne le couvre exactement)
- **Domaine owner** : FF-056 · lane conversationnelle
- **Source amont** : `sophia-brain/skills/weight_divergence/visible_agent.ts`
  (texte produit par le modèle, non contraint par une ceinture sur ce point)
- **Symptôme visible** : « Le plan a bien pris en compte ce point, et il guidera
  la prochaine semaine à construire. » Ce n'est pas Sophia qui a noté : c'est
  « le plan » qui comprend et qui guide.
- **Preuve système** : tour à 7 955 ms, `delivery_reason: "reply"`, sans
  `handled_by` — donc lane modèle. La voie bouton, sur la même intention, dit
  « merci de me le dire — c'est la partie que je ne pouvais pas voir ».
- **Correction attendue** : c'est un **RED déjà consigné** par le lot de bascule
  (RED-5), non corrigé au motif qu'il « meurt par construction au bouton ». Ce
  run prouve qu'il est bien vivant sur la voie texte, qui reste la soupape
  officielle. Deux options : soit la ceinture existante juge ce registre (avec
  son cas qui passe, R2 exigeant par ailleurs « le plan » comme sujet dans
  certains gabarits — d'où la prudence du lot), soit on acte que la voie texte
  est un chemin dégradé et on le documente comme tel.
- **Statut** : `open` — **non corrigé, et masqué par accident**. En run 2, les
  trois tours de texte ont vu leur sortie modèle refusée par la garde
  `composition_effect`, donc le repli déterministe est parti : il
  n'anthropomorphise pas, et R1-B02 ne s'est pas manifesté. **Ce n'est pas une
  correction** — un texte modèle anthropomorphe qui ne promet rien passerait la
  garde et sortirait tel quel.
- **Fix reference** : rapport du lot `scratchpad/RAPPORT-FF-056-BOUTONS.md`, RED-5
- **Tests requis** : paraphrase FR/EN sur la lane texte, 3 runs sur 3 ; cas qui
  passe obligatoire (une garde cassée bloque tout en ayant l'air de marcher).

---

## R1-B03 — L'ouverture explique la question par une causalité qui sonne comme un reproche

- **Bug id** : `R1-B03`
- **Tours** : trajectoire 1.1 tour 0
- **Famille** : `a classifier` — copie qui présuppose une cause
- **Domaine owner** : FF-056 · moteur d'ouverture d'épisode
- **Source amont** : le gabarit de la question d'ouverture
  (`_shared/keel/weight_divergence_engine.ts` / ses textes)
- **Symptôme visible** : « Si tu manges ce qui est prévu, normalement ça devrait
  descendre. Qu'est-ce qui se passe ? » — l'implicite le plus court est « donc tu
  ne manges pas ce qui est prévu », avant que quoi que ce soit ne soit su.
- **Preuve système** : message proactif, `purpose: keel_weight_divergence`,
  `delivery_reason: unsolicited_within_cap`, 5 boutons.
- **Correction attendue** : aucun interdit nommé de la fiche n'est violé (ni
  chiffre d'énergie, ni interprétation médicale, ni détection de mensonge). C'est
  une **appréciation de cadrage** : ouvrir sur le constat (« je vois que ça monte
  alors que l'objectif est de descendre ») plutôt que sur la causalité attendue.
  À trancher par l'humain — c'est un choix produit, pas un bug de contrat.
- **Statut** : `open` (candidat `wont_fix` si arbitrage inverse)
- **Fix reference** : —
- **Tests requis** : si correction, paraphrase FR/EN et vérification qu'aucun
  bouton ne devient une question.

---

## Ce qui a été vérifié VERT et ne doit pas régresser

- **L'écriture de l'épisode** depuis un tap : `category`, `turn_count=1`, prouvés
  en base sur les deux voies. C'est la faute du 2026-08-10 (avancement écrit avec
  le client porté par le JWT de l'élève, refusé en silence) — elle est fermée.
- **La charge forgée** : un tap citant l'épisode d'une autre persona est refusé
  (`handled_by: keel_weight_divergence_stale`), **aucun des deux épisodes ne
  bouge**, et le refus dit honnêtement « rien n'a été enregistré ».
- **Le budget T4** n'est pas consommé une seconde fois par les taps.
- **La latence** : 198–248 ms sur la voie bouton contre 7 955 ms sur la voie
  texte, pour la même catégorie atteinte.
