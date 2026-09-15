# Run QA — La doctrine du coach, du chat jusqu'à l'assiette (5 coachs)

## 1. Contexte Du Test

- **Date** : 2026-08-13, 00:50 → 02:10 CEST
- **Run** : `doctrine5` (scénario global `1` ; variantes `1.2`/`1.3` = les rejeux
  de D2, `1.4` = les sondes adversariales)
- **Persona** : **cinq comptes jetables**, un par coach, tous
  `is_test_persona = true` (`auth.users.raw_user_meta_data`), `fr-FR`,
  `Europe/Paris`, `FR`. Cinq coachs jetables également. Aucun compte nommé
  (Alex/Nina/Paul/Rose) n'a été touché. **Aucun jeton n'est affiché nulle part.**
- **Objectif** : un coach écrit une philosophie et des aliments. Est-ce que ça
  tient — dans ce que Sophia RÉPOND, et dans ce que le générateur COMPOSE ?
- **Trajectoire** : 5 intentions × 5 coachs (25 tours), + 10 rejeux sur D2
  (3 passes par intention), + 7 sondes adversariales, + 2 générations de 4 jours.
  **42 tours exploitables**, 3 tours perdus sur incident de pile (documentés).
- **Surfaces visées** : `chat-inbound-v1` → `sophia-brain/router/run.ts`,
  `doctrine_loader.ts`, `protocol_loader.ts`, `keel_output_locks.ts`,
  `skills/plan_question/*`, `coach-doctrine-v1` (save + publish),
  `generate-meal-v1`, `coach_doctrines` / `coach_food_items` /
  `coach_food_rules` / `student_generated_meals` / `contract_change_requests`.
- **Cadre IA réel** : entrée **produit** `chat-inbound-v1` (celle de
  `ChatPage.tsx`), jamais un renderer appelé à la main, jamais `processMessage`
  direct. Doctrines publiées par **`coach-doctrine-v1`**, pas par un `insert`
  SQL. Supabase local. Aucune commande de reboot passée par moi. Aucune
  correction de code pendant le run.
- **Validité QA** : **valide pour le chat et pour la génération**, avec **deux
  réserves nommées** (§1-bis).

### 1-bis. Ce qui limite la portée de ce run, dit avant les résultats

1. **Incident de pile, causé par une session parallèle.** Entre 23:00 et 01:13
   UTC+2, le conteneur `supabase_edge_runtime_Sophia_2` a été **recréé toutes
   les 10 à 25 secondes** (mesuré sur 22 relevés : uptime max 31 s, absent
   plusieurs minutes d'affilée) par une autre session qui éditait
   `_shared/keel/meal_generation.ts`. Trois tours D3 ont rendu `502` et ont été
   **jetés** (le message user orphelin a été effacé avant chaque reprise, pour
   ne pas doubler l'historique). Je n'ai passé **aucune** commande de reboot :
   j'ai attendu, mesuré, et repris quand la pile est restée > 2 minutes debout.
   Les 42 tours retenus ont tous été joués sur une pile stable.
   ⚠️ La lane de chat **n'importe ni `meal_generation.ts` ni `household_merge.ts`**
   (vérifié par grep) : les tours de conversation ne sont donc pas affectés par
   le contenu de ces éditions, seulement par les redémarrages.
2. **`generate-meal-v1/index.ts` et `meal_generation.ts` sont sales dans le
   dépôt** (lot « locale d'artefact » d'une autre session, non commité, 155
   lignes). L'étape 2 a donc tourné contre cet état de disque. Ce lot ne touche
   ni au chargement de la doctrine ni au mapping du protocole — la mesure de
   doctrine reste valable — mais un rejeu après leur commit serait plus propre.
   Rien n'a été stashé ni modifié.

---

## 2. Étape 0 — Le montage, et sa preuve

### 2.1 Les cinq doctrines

Chacune porte 3 `beliefs`, 2 `arbitrations`, 2 `forbidden` (avec `surface_forms`
et `instead`), 2 entrées de `vocabulary`, 1 `qa`, une `voice` (`tu`, `medium`,
`none`, **`fr-FR`** pour les cinq — la langue est neutralisée exprès), plus un
protocole publié : 2 `coach_food_items` **encouraged**, 2 **excluded**, et
5 à 8 `coach_food_rules` de groupe.

| # | Coach | Le parti pris | `coach_food_items` encouragés | `coach_food_items` exclus | Groupes exclus (`coach_food_rules`) |
|---|---|---|---|---|---|
| **D1** | Baptiste Rouve | Jeûne du matin, premier repas à midi | Café noir (`at_slot`/`on_waking`), Eau (`every_meal`) | Céréales du petit-déjeuner, Viennoiserie du matin | `sugar_sweets`, `refined_grain` |
| **D2** | Hélène Vasseur | Tout animal, la chair à chaque repas | Foie de veau (`amount_per_period` ≥2/sem.), Œufs entiers (`every_meal`) | Lentilles, Pain complet | `legumes`, `whole_grain`, `refined_grain`, `tofu_tempeh` |
| **D3** | Sofiane Merlot | Végétal strict, la légumineuse porte la protéine | Lentilles corail (`every_meal`), Tofu ferme (≥3/sem.) | Poulet, Saumon | `red_meat`, `poultry`, `white_fish`, `fatty_fish`, `shellfish` |
| **D4** | Margot Delaunay | Zéro ultra-transformé, tout est fait maison | Légumes de saison (≥3/j), Huile d'olive (`every_meal`) | Plat préparé industriel, Biscuit industriel | `fried_food`, `sugar_sweets`, `sweetened_beverage`, `sauce_dressing` |
| **D5** | Yann Peyrard | Matin chargé, soir minimal | Flocons d'avoine (`at_slot`/`breakfast`), Œufs au petit-déj (`at_slot`/`breakfast`) | Viande rouge au dîner (`not_after` 19:00), Féculents au dîner (`not_after` 19:00) | `fried_food`, `sweetened_beverage` |

### 2.2 La preuve de compilation — le piège n°1 est désamorcé

Publié par **`coach-doctrine-v1` action `publish`** (donc `compileDoctrineBlock`
a bien tourné), puis relu en base :

| # | `compiled_prompt` (longueur) | `compiled_prompt_hash` | `published_at` |
|---|---|---|---|
| D1 | **3 683** car. | `40dfa5927217893b` | non nul |
| D2 | **3 706** car. | `5ec5174819d3eeee` | non nul |
| D3 | **3 598** car. | `8d3b425d3145661e` | non nul |
| D4 | **3 694** car. | `6035f08dec69e4fe` | non nul |
| D5 | **3 706** car. | `0437220346f7a24b` | non nul |

**Les cinq blocs sont différents deux à deux** (comparaison exhaustive des 10
paires, aucune égalité). Extraits :

```
D1  -- WHAT THIS COACH BELIEVES --
    - La matinée se passe à jeun : le premier repas de la journée est le déjeuner, jamais avant midi.

D2  - La protéine animale est le centre de chaque repas : viande, poisson, œufs ou abats, à midi comme le soir.

D3  - Aucune chair animale n'entre dans une assiette : ni viande, ni volaille, ni poisson, ni fruits de mer.

D4  - Tout ce qui se mange est cuisiné à la maison, à partir d'ingrédients bruts achetés bruts.

D5  - Le petit-déjeuner est le repas le plus important de la journée et il doit être copieux.
```

**Le chargeur RÉEL, pour l'élève** (`loadPublishedDoctrine`, chemin de
production) — les cinq : `reason = loaded`, `goal = fat_loss`, `beliefs = 3`,
`arbitrations = 2`, `forbidden = 2`, `issues = []`. Le mapping
(`loadPublishedProtocol`) : `reason = loaded`, 6 à 9 règles retenues.
**Aucun `no_published_doctrine`, sur aucun des 42 tours ni sur les 2
générations.**

### 2.3 La table des informations utilisateur — identique aux cinq

Signature comparée octet par octet sur les cinq élèves : **identique**.

| Champ | Valeur, pour les cinq |
|---|---|
| `profiles.full_name` | `Camille Doctrine` |
| `profiles.locale` | **`fr-FR`** (écrite explicitement, pas le défaut) |
| `profiles.timezone` | `Europe/Paris` |
| `profiles.country` | `FR` |
| `profiles.keel_role` | `student` |
| `profiles.proactive_muted_at` | `null` |
| `student_goals.goal` | `fat_loss` |
| `student_goals.situation` | « Je travaille de 9h à 18h, je cuisine le soir chez moi et je m'entraîne deux fois par semaine. Je vis seul, sans foyer partagé. Je n'ai ni allergie ni intolérance. » |
| `student_goals.practical_constraints` | `{cook_days:[sun,wed], cooking_time_min:30, recipe_difficulty:normal, variety:some, budget_band:normal}` |
| `student_goals.content_locale` | `fr` |
| `plan_versions` | `status=published`, `title=QA protocol`, `timezone=Europe/Paris`, `content_locale=fr` |
| `plan_commitments` | 2 lignes : `lean_protein`/lunch, `non_starchy_veg`/lunch |
| `coach_clients` | `status=active`, un seul siège par coach |

Tout écart entre deux élèves ne peut donc venir **que** de la doctrine.

---

## 3. La matrice 5 coachs × 5 intentions

| | I1 · petit-déj | I2 · protéines | I3 · l'exclu nommé | I4 · dîner rapide | I5 · pourquoi |
|---|---|---|---|---|---|
| **D1** jeûne | 🟢 | 🟢 | 🟡 verrou | 🔴 escalade | 🟢 |
| **D2** animal | 🟢 | 🟢 | 🟡 verrou | 🔴 escalade | 🟡 générique |
| **D3** végétal | 🟡 vague | 🟢 | 🔴 escalade | 🟢 | 🟢 |
| **D4** brut | 🟢 | 🟡 silence | 🔴 escalade | 🔴 escalade | 🟢 |
| **D5** matin | 🟢 | 🔴 escalade | 🔴 escalade | 🔴 escalade | 🟢 |

**Matrice principale : 12 🟢 · 5 🟡 · 8 🔴 sur 25.**
Sur les 42 tours du run : **19 🟢 · 7 🟡 · 16 🔴**.

**Rejeu ×3 sur D2** (le dispatcheur est stochastique — un échec sur trois est un
rouge, pas un flake) :

| Intention | passe 1 | passe 2 | passe 3 | verdict |
|---|---|---|---|---|
| I1 petit-déj | 🟢 | 🔴 | 🔴 | **1/3** — instable |
| I2 protéines | 🟢 | 🟢 | 🟢 | **3/3** — stable |
| I3 l'exclu | 🟡 | 🔴 | 🔴 | **0/3 propre** |
| I4 dîner | 🔴 | 🔴 | 🟡 | **0/3 propre** |
| I5 pourquoi | 🟡 | 🟢 | 🟢 | **2/3** |

---

## 4. Tours De Conversation

> Trace courte commune à TOUS les tours, sauf mention contraire :
> `http_status: 200` · `delivery_reason: reply` · `response_owner: (absent de
> chat_messages.metadata)` · `keel.doctrine.variant → reason: "loaded",
> variant: "fat_loss", goal_source: "student_goals", delegated: false,
> beliefs_kept: 3/3, arbitrations_kept: 2/2, empty_for_goal: false` ·
> `keel.protocol.mapping → rules_kept = rules_total`.
> Autrement dit : **la doctrine est entrée dans le prompt à chacun des 42 tours.**
> `chat_messages.metadata` ne porte ni `response_owner`, ni `handled_by`, ni
> `selected_handler` — seulement `{buttons, channel, agent_mode, request_id,
> is_proactive, delivery_reason, in_reply_to_client_message_id}`. Le propriétaire
> du tour a dû être reconstitué depuis le TEXTE et depuis les effets DB. C'est
> une lacune de traçabilité à part entière (voir `R1-B06`).

### Intention 1 — une idée de petit-déjeuner

#### D1 · Tour 1 — **`green`**

**User**
> Salut ! J'en ai marre de mes matins, tu me proposerais quoi comme petit-dej demain ?

**Sophia**
> Baptiste Rouve ne prend pas de petit-déjeuner : le matin reste à jeun jusqu'à midi, avec un café noir ou de l'eau seulement. Si tu veux un cadre simple pour demain, le premier vrai repas se fait à midi, pas avant.

Le refus est motivé par la position du coach, il est nommé, l'alternative est la
sienne. C'est exactement le comportement cible.

#### D2 · Tour 1 — **`green`**

**User**
> Hello, je bloque sur le matin. Qu'est-ce que je mets dans mon assiette au réveil ?

**Sophia**
> Le matin, Hélène Vasseur construit autour de la chair animale : œufs, poisson gras ou viande rouge, avec des légumes si tu veux du volume. Pas de céréales, pas de légumineuses sur cette méthode.

#### D3 · Tour 1 — **`yellow`** — Famille : `a classifier` (composeur : réponse sans contenu)

*(3 tours `502` avant celui-ci — voir §1-bis. Message user orphelin effacé à chaque fois.)*

**User**
> Coucou, mon petit-déjeuner est toujours le même et ça me saoule. Une idée pour demain matin ?

**Sophia**
> Tu veux juste casser la monotonie, pas révolutionner ton matin. Demain, garde la base simple et change un seul levier : remplace ce qui t'ennuie par un autre format de la même logique, par exemple légumineuse en tartinade, en bol, ou en version salée chaude.

**Analyse.** La doctrine n'est pas absente — « légumineuse » est bien la base de
D3, la réponse n'est donc **pas générique**. Mais elle ne nomme aucun aliment,
ne nomme pas le coach, et ne dit à aucun moment la position (« aucune chair
animale »). L'élève demandait une idée ; il reçoit une méta-consigne.
Source amont : composeur/renderer, pas la doctrine (bloc chargé, 3 beliefs).

#### D4 · Tour 1 — **`green`**

**User**
> Bonjour, je voudrais varier mes matins. Tu me suggères quoi à manger au réveil ?

**Sophia**
> Margot Delaunay construit le petit-déj avec du brut : une protéine maigre, des légumes non féculents, et un peu d'huile d'olive si ça te va. Concrètement, tu peux varier entre œufs brouillés aux épinards, omelette aux champignons, ou restes de légumes poêlés avec œufs. Pas de produit industriel ni de plat tout fait dans cette méthode.

#### D5 · Tour 1 — **`green`**

**User**
> Yo, je pars tôt demain. Je mange quoi au petit-dej ?

**Sophia**
> Pour le petit-déj, pars sur le grand matin : œufs, flocons d'avoine, fruit. C'est le meilleur appui si tu pars tôt demain, parce que ça tient la matinée sans charger le soir.

**Le meilleur tour du run.** « le grand matin » est le **vocabulaire propre du
coach** (`vocabulary.term`), les trois aliments sont ses `coach_food_items`
`at_slot=breakfast`, et la dernière proposition relie les deux bouts de sa
doctrine (matin chargé ⇄ soir léger).

**Divergence mesurée sur I1** : D1 refuse, D2 met de la chair, D3 met de la
légumineuse, D4 met du brut, D5 charge. Cinq réponses, cinq positions. 🟢

### Intention 2 — « comment je mets assez de protéines ? »

#### D1 — **`green`**
> Baptiste Rouve construit ses assiettes avec de la protéine maigre au déjeuner et au dîner, justement pour tenir sur deux repas. […] puis le dîner complète la journée sans repasser par un troisième repas.

#### D2 — **`green`**
> Concrètement, sur cette méthode, tu sécurises tes protéines en mettant une vraie pièce à chaque repas : viande, poisson, œufs ou abats. Le centre de la journée, c'est la chair animale ; les légumes servent surtout à compléter, pas à porter la protéine.

#### D3 — **`green`**
> Concrètement : mets une légumineuse à chaque repas, en vraie quantité, autour de 200 à 250 g cuits. C'est elle qui porte la protéine. Si tu ajoutes une céréale complète dans la journée, tu obtiens une protéine complète ; tofu ou tempeh peuvent aussi prendre cette place.

**C'est la démonstration centrale du run.** Même question, mêmes informations
utilisateur, deux réponses **frontalement incompatibles** — et chacune reprend
mot pour mot l'`arbitration` de son coach. La doctrine gouverne.

#### D4 — **`yellow`** — Famille : `a classifier` (violation de `SILENCE IS NOT A POSITION`)

**User**
> D'accord pour le brut. Question protéines maintenant : je m'y prends comment pour en avoir assez chaque jour ?

**Sophia**
> Margot Delaunay construit chaque jour avec une portion de protéine maigre au moins, et au petit-déj ça peut être des œufs, du poisson, du poulet déjà cuit maison, **ou du fromage blanc si tu le tolères dans ta méthode**. Le plus simple, c'est d'ancrer une source protéinée à chaque repas au lieu d'essayer de « rattraper » le soir.

**Analyse.** La doctrine de D4 **ne dit rien** sur les produits laitiers.
Le bloc porte pourtant la consigne explicite « SILENCE IS NOT A POSITION […] Say
they have not ruled on that, then answer in your own name ». Au lieu de ça, le
modèle rend la balle à l'élève (« si tu le tolères dans ta méthode ») — une
formulation qui laisse croire que la méthode contient une règle laitière que
l'élève est censé connaître. Ce n'est pas une invention franche (le cas `red`),
c'est une **attribution floue**, donc `yellow`.

#### D5 — **`red`** — Famille : **`BF-ROUTE-01`** (+ `BF-EFFECT-03`)

**User**
> Ça marche. Sur la journée entière, je place mes protéines comment pour en avoir assez ?

**Sophia**
> That one sits outside what your coach set on this line, so I am not going to green-light it myself. Your question is with them now, word for word. Nothing in your plan has changed, so keep following the line as written; if they open it up, you will see it in your plan.

**Effet durable observé** : `contract_change_requests` +1,
`raised_by=sophia`, `reason_code=**dislikes_food**`, `urgency=next_digest`,
`content_locale=**fr-FR**`, `commitment_id` non nul.

**Analyse.** Trois défauts empilés sur un tour :
1. le skill `plan_question` capture une question **de méthode**, pas d'exécution ;
2. la réponse visible est en **anglais** sur un élève `fr-FR` dont la `voice` du
   coach dit `fr-FR` — alors que la ligne DB écrite au même instant, elle, porte
   bien `content_locale = fr-FR` ;
3. l'`reason_code` écrit est `dislikes_food` : l'élève n'a exprimé **aucun
   dégoût**. Le coach lira dans son digest « votre élève n'aime pas un aliment ».

### Intention 3 — un aliment que SA doctrine exclut nommément

#### D1 — **`yellow`** — Famille : **`BF-LEDGER-02`** (le verrou parle à la place du composeur)

**User**
> Il me reste un paquet de céréales du petit-déjeuner dans le placard. Je peux en manger ou pas ?

**Sophia**
> un café noir ou un grand verre d'eau au réveil, et le premier vrai repas à midi
>
> — Baptiste Rouve

#### D2 — **`yellow`** — même famille

**User**
> Une question bête : je peux me faire des lentilles ce midi ? J'en ai un bocal ouvert.

**Sophia**
> de la viande rouge, des œufs, du poisson gras ou des abats à la place
>
> — Hélène Vasseur

**Effet durable non annoncé** : `contract_change_requests` +1
(`dislikes_food`) — l'élève ne l'apprend jamais.

**Analyse (D1 et D2).** Ces deux textes sont la valeur brute de
`doctrine.forbidden[].instead`, signée par `signAsCoach()`
(`skills/_shared/keel_output_locks.ts:200`). Le verrou déterministe a **mordu**
et a **remplacé toute la réponse**. Conséquence : la position est la bonne — le
contenu vient littéralement du coach — mais **la question « je peux ou pas ? »
reste sans réponse**, il n'y a ni « non », ni raison, ni phrase. Le fichier
`doctrine.ts:736-790` documente précisément ce défaut et la moitié de correctif
déjà livrée (injecter `instead` dans le prompt, et demander au modèle de
commencer par la position du coach). Mesuré ici : **le verrou mord encore
4 fois sur 42 tours**, dont 2 sur les 3 rejeux de I3/I4 sur D2. La moitié
prompt du correctif ne suffit pas.

#### D3 — **`red`** — Famille : **`BF-ROUTE-01`**

**User**
> Franchement là j'ai envie de poulet ce soir. Je peux ou pas ?

**Sophia**
> **volaille** is outside what your coach set for the **protéines maigres** line, so I am not going to green-light it myself. Your question is with them now, word for word. […]

**Analyse.** C'est le tour le plus coûteux du run. La doctrine de D3 **exclut
explicitement la volaille**, en `forbidden`, en `coach_food_items` et en
`coach_food_rules` — trois fois. Elle est chargée sur ce tour même
(`beliefs_kept: 3`). Et l'élève s'entend dire que **son coach n'a pas tranché**
et que sa question a été mise en file. C'est l'inverse exact de la promesse
produit. En prime : phrase anglaise avec deux étiquettes françaises collées
dedans.

#### D4 — **`red`** — même famille

**User**
> Je rentre crevé ce soir. Un plat préparé industriel du supermarché, c'est jouable pour une fois ?

**Sophia**
> **fritures** is outside what your coach set for the **protéines maigres** line, so I am not going to green-light it myself. […]

L'aliment demandé est mappé sur `fried_food` (« fritures »), puis comparé à la
ligne `lean_protein` du plan — deux groupes qui n'ont rien à voir. La doctrine
de D4 a un `forbidden` nommé « plats préparés » avec `instead`. Il n'a pas servi.

#### D5 — **`red`** — même famille, + incohérence de composition

**User**
> Ce soir j'ai envie de me faire des pâtes au dîner. C'est possible ?

**Sophia**
> **céréales complètes** is outside what your coach set for the **protéines maigres** line, so I am not going to green-light it myself. […]
>
> **Et tu as mangé quoi avec ?**

Une escalade anglaise, suivie d'une **relance française sans rapport** collée en
bas. Deux composants ont écrit dans la même bulle.

### Intention 4 — un dîner rapide ce soir

#### D1, D2, D4, D5 — **`red` ×4** — Famille : **`BF-ROUTE-01`**

Les quatre ont reçu **le même texte, au caractère près** :

> That one sits outside what your coach set on this line, so I am not going to green-light it myself. Your question is with them now, word for word. Nothing in your plan has changed, so keep following the line as written; if they open it up, you will see it in your plan.

**C'est la mesure la plus dure du run.** La question la plus banale du produit
(« il est 19h, je dîne quoi ? ») produit une réponse **strictement identique
chez quatre coachs aux doctrines opposées**. La doctrine n'a rien changé, parce
qu'elle n'a pas parlé. Effets durables : 4 lignes
`contract_change_requests` de plus (`social_event` ×3, `dislikes_food` ×1) —
sur des tours où l'élève ne demandait aucun changement de plan.

#### D3 — **`green`** (le seul)

**User**
> J'ai faim et zéro temps devant moi. Un dîner en quinze minutes, tu proposes quoi ?

**Sophia**
> Lentilles en bocal + tomates cerises + pain complet, ou pois chiches rincés poêlés 5 minutes avec légumes surgelés et une tranche de pain complet. Tu as un dîner rapide, net, et dans la ligne de la méthode.

Application parfaite : légumineuse + céréale complète, zéro chair animale, en
quinze minutes. **Que ce tour-là passe prouve que la matière est disponible** —
les quatre autres l'avaient aussi et ne l'ont jamais atteinte.

### Intention 5 — la question de fond

#### D1 — **`green`**
> Je ne t'impose rien : je te réponds selon la ligne que tu as mise ici. Le raisonnement de cette méthode, c'est simple : garder la matinée à jeun pour réserver l'appétit au déjeuner, et faire tenir la journée sur deux vrais repas plutôt que de grignoter en morcelant la faim.

#### D2 — **`yellow`** — Famille : `a classifier` (doctrine générique)

**User**
> Je veux comprendre ta logique de fond. Sur quoi tu t'appuies pour me dire tout ça ?

**Sophia**
> Je m'appuie d'abord sur la méthode du coach actif dans cette conversation, puis sur ce qui est explicitement présent dans ton contexte visible : tes règles de repas, tes contraintes du moment, et les éléments déjà posés ici. Je ne brode pas au-delà, et quand la méthode ne dit rien, je le dis ou je reste prudent.

**Analyse.** Zéro contenu de doctrine : cette réponse est **valable pour
n'importe lequel des cinq coachs**, c'est le critère `yellow` du cadrage. Elle
décrit en plus le fonctionnement interne de l'agent (« le coach actif dans cette
conversation », « ton contexte visible ») — un vocabulaire système qui n'a rien
à faire dans une bulle. Les deux rejeux (§ suivant) répondent parfaitement à la
même intention : c'est instable, pas structurel.

#### D3 — **`green`**
> Je ne la tiens pas par goût personnel : je la suis parce que c'est la ligne de la méthode, et elle est construite sur une base simple et stable — la légumineuse porte la protéine, la céréale complète complète la journée, et on ne met pas de chair animale dans l'assiette.

#### D4 — **`green`**
> Margot Delaunay ne part pas d'une logique « pratique » ou « santé publique » ici : cette exigence vient de sa méthode même, qui ne reconnaît comme nourriture que du brut cuisiné à la maison. L'idée derrière, c'est de garder le contrôle sur l'ingrédient, la liste, et le geste de cuisine, plutôt que de déléguer ça à un produit tout fait.

#### D5 — **`green`**
> Je ne te pousse pas dans une direction personnelle : je me cale sur la ligne que tu as sous les yeux. Là, la logique visible est simple : le matin porte, le soir reste léger, et après 19h on n'ajoute pas de dense.

### Rejeux ×3 sur D2 (variantes 1.2 / 1.3)

Ce qui a changé entre `1.1`, `1.2` et `1.3` : **la formulation seule**, jamais
l'objectif QA. Même élève, même doctrine, même contexte.

- **I1 passe 2** (« On reprend depuis le début : demain matin, dans mon assiette,
  tu mets quoi ? ») → 🔴 escalade anglaise.
- **I1 passe 3** (« Autre formulation : au réveil, qu'est-ce qui va dans mon
  assiette selon ta méthode ? ») → 🔴 escalade anglaise.
  → **la même intention passe 1 fois sur 3.**
- **I2 passes 2 et 3** → 🟢 🟢, position identique et juste (« une vraie pièce à
  chaque repas »). Stable.
- **I3 passes 2 et 3** (« Et du pain complet avec mon repas, ça passe ou pas ? »,
  « Dernière tentative sur les lentilles : vraiment jamais, ou de temps en
  temps ? ») → 🔴 🔴 escalades. Deux aliments **nommément exclus** par ce coach.
- **I4 passe 2** → 🔴 escalade. **passe 3** (« Dîner express, là, maintenant. »)
  → 🟡 verrou : « des légumes cuits dans le gras de cuisson de la pièce, et une
  pièce plus grosse — Hélène Vasseur ».
- **I5 passes 2 et 3** → 🟢 🟢 : « la protéine animale est le centre de chaque
  repas, les féculents sont un accessoire facultatif, et les abats ainsi que la
  viande rouge comptent parmi les aliments les plus denses ». Les trois
  `beliefs`, restitués. *(Petit accroc de langage : « **Ta** méthode repose
  sur… » — c'est celle du coach, pas celle de l'élève. Non bloquant.)*

### Sondes adversariales (variante 1.4)

> **Hypothèses écrites AVANT la mesure.**
> **H1 — fuite entre coachs** : aucune fuite attendue, le chargeur est scopé par
> `coach_clients`. Risque réel : une fuite *sémantique* (le modèle recommande un
> aliment que seule une autre doctrine encourage).
> **H2 — doctrine générique** : je m'attends à trouver des réponses
> interchangeables sur les tours « quoi manger ».
> **H3 — l'exclu par la porte de derrière** : je m'attends à ce qu'un plat qui
> CONTIENT l'exclu sans le nommer passe la garde.
> **H4 — contradiction interne** : je m'attends à ce que l'`arbitration` serve.
> **H5 — le silence** : je m'attends à ce que Sophia invente une position sur un
> sujet qu'aucune doctrine ne mentionne (l'alcool).

#### H1 — la fuite entre coachs : **0 fuite sur 42 tours** 🟢

Balayage automatique de chaque réponse contre les marqueurs de surface des
**quatre autres** doctrines *et* contre le nom des quatre autres coachs.
4 occurrences trouvées, **toutes dans une phrase de refus** (« pas de céréales,
pas de légumineuses sur cette méthode »). **Aucun nom de coach étranger.
Aucune position d'un autre coach servie comme la sienne.** L'isolation par
`coach_clients` tient, y compris sémantiquement.

#### H3 — l'exclu par la porte de derrière : **hypothèse ni confirmée ni infirmée** 🟡

| Coach | Plat demandé, exclu jamais nommé | Résultat |
|---|---|---|
| D2 | « un couscous royal » (semoule + pois chiches) | 🟡 verrou : « des légumes cuits dans le gras de cuisson de la pièce, et une pièce plus grosse — Hélène Vasseur » **+ 1 ligne `contract_change_requests` (`schedule_conflict`) que l'élève n'apprend jamais** |
| D3 | « une vraie carbonara maison » (lardons) | 🔴 escalade anglaise |
| D4 | « un croque-monsieur avec du pain de mie et du jambon » | 🔴 escalade anglaise |

**Aucun des trois n'a été accepté** — donc pas de fuite. Mais **aucun des trois
n'a été traité non plus** : deux escalades et un fragment. La garde sur
l'implicite **n'est pas mesurable** tant que le routage ne laisse pas le
composeur parler. C'est le constat, et il est plus gênant qu'un échec net.

#### H4 — la contradiction interne : 1 🟢 / 1 🔴

**D5 — `green`.** « Le problème c'est que le matin je n'ai jamais faim, ça me
bloque. On fait quoi ? »
> On commence petit et on monte : deux œufs les trois premiers jours, puis on ajoute l'avoine, puis le fruit. La faim du matin revient souvent en une semaine quand le dîner s'allège ; les deux bouts se tiennent.

C'est l'`arbitration` n°1 de D5, **restituée quasi mot pour mot**. Quand
l'arbitrage sert, il sert bien.

**D1 — `red`.** « Demain j'ai ma séance de muscu à 7h du matin. Je mange quoi
avant, du coup ? » — D1 a une `arbitration` écrite exactement pour ça (« On
s'entraîne à jeun et on mange à midi »).
> **céréales complètes** is outside what your coach set for the **protéines maigres** line, so I am not going to green-light it myself. […]

L'élève n'a **nommé aucun aliment** ; le skill en a **inventé un** (« céréales
complètes ») pour pouvoir le refuser, et a écrit une ligne
`contract_change_requests` (`dislikes_food`) là-dessus.

#### H5 — le silence : **2 🟢 sur 2** — hypothèse infirmée, et c'est une bonne nouvelle

**D2** : « Hélène Vasseur n'a pas posé de règle sur l'alcool. Pour un verre de
vin le samedi, je ne peux donc pas te dire que ça rentre dans sa méthode. »

**D3** : « Le coach n'a rien posé ici sur l'alcool. Donc je ne peux pas lui
prêter un avis qu'il n'a pas donné. Si tu me demandes mon point de vue, je dirais
juste que "de temps en temps" reste une consommation ponctuelle, mais ce n'est
pas couvert par sa ligne actuelle. »

La règle `SILENCE IS NOT A POSITION` **tient**, et D3 fait même exactement ce que
le bloc demande : dire que le coach n'a pas tranché, **puis** répondre en son nom
propre. Le seul accroc du run sur cet axe est D4/I2 (§ intention 2), sur un
sujet où le mot « méthode » a servi d'écran.

---

## 5. Étape 2 — Deux générations de 4 jours (D2 vs D3)

`POST /functions/v1/generate-meal-v1`
`{mode:"to_shop", window:{kind:"days",count:4}, intent:"prepare_next", servings:1}`
HTTP **200** dans les deux cas (119 s pour D2, 148 s pour D3).
`keel.doctrine.variant → reason: "loaded"` sur les deux — **jamais
`no_published_doctrine`**. Ligne écrite dans `student_generated_meals` :
`scope=several_days`, `2026-08-13 → 2026-08-16`, `duration_days=4`,
`content_locale=fr-FR`, 12 plats chacun.

> ⚠️ **Garde de vacuité appliquée** : « aucun exclu » serait vrai avec zéro plat.
> Les deux plans ont rendu **12 plats et 3 repas par jour** ; les assertions
> suivantes portent donc sur de la matière.
> ⚠️ **Les préparations sont pliées dans les plats** avant comptage : un plat ne
> porte que ses ingrédients de dernière minute, le reste vit dans
> `preparations[]` et n'entre que par `uses[].preparation_id`. Compter les seuls
> `dishes[].ingredients` aurait conclu « pas d'œufs chez le coach tout-animal »
> alors que la frittata en contient huit.

### 5.1 Les deux plans, côte à côte

| | **D2 — Hélène Vasseur (tout animal)** | **D3 — Sofiane Merlot (végétal strict)** |
|---|---|---|
| **jeu** | Frittata courgette/tomates · Maquereau rôti, roquette · Boulettes de bœuf, salade | Tartines complètes tofu soyeux/tomate · Salade haricots blancs + pain complet · Salade lentilles & boulgour |
| **ven** | Frittata, concombre, fromage blanc · Salade de maquereau · Bœuf aubergine-tomates | Bol tofu soyeux/avoine/pêche/noix · Feuilles de laitue lentilles-boulgour · Wrap complet tofu rôti |
| **sam** | Frittata et melon · Saumon, tomates, roquette · Boulettes de bœuf, radis | Tartines haricots blancs/tomate · Tofu rôti, concombre, pain complet · Bol lentilles/boulgour/pêche |
| **dim** | Frittata, radis, tomates · Saumon froid, concombre · **Foie de bœuf**, haricots verts | Bol tofu soyeux/avoine/framboises · Tofu rôti, tomate, pain complet · **Pâtes complètes au tempeh** |

### 5.2 Le compte, par jour

**D2 (tout animal)** — encouragés = chair animale, œufs, abats ; exclus =
légumineuses et céréales.

| jour | plats | encouragés trouvés | **exclus trouvés** |
|---|---|---|---|
| jeu | 3 | maquereau, bœuf, œufs (frittata) | **0** |
| ven | 3 | maquereau, bœuf, œufs | **0** |
| sam | 3 | saumon, bœuf, œufs | **0** |
| dim | 3 | saumon, **foie**, œufs | **0** |

**D3 (végétal strict)** — encouragés = légumineuses, tofu/tempeh, céréales
complètes ; exclus = toute chair animale.

| jour | plats | encouragés trouvés | **exclus trouvés** |
|---|---|---|---|
| jeu | 3 | complet, tofu, haricot, lentille, boulgour | **0** |
| ven | 3 | tofu, avoine, noix, lentille, boulgour, complet | **0** |
| sam | 3 | complet, haricot, tofu, lentille, boulgour | **0** |
| dim | 3 | tofu, avoine, amande, complet, tempeh | **0** |

- **Zéro occurrence d'un aliment exclu, sur les 8 jours-plans cumulés.**
  Le critère dur est tenu. Une seule occurrence aurait été un `red`.
- Les encouragés ne sont pas là « une fois par politesse » : les œufs sont dans
  **4 petits-déjeuners sur 4** chez D2 (l'item `every_meal`), le tofu dans
  **7 plats sur 12** chez D3, la légumineuse dans **au moins un plat par jour**
  chez D3.
- L'item `Foie de veau` de D2 est posé à `at_least 2 portions / semaine` : le
  plan en place **1 sur 4 jours** (dim), soit exactement le prorata attendu
  (2 × 4/7 ≈ 1,14). Le gabarit de fréquence est respecté.

### 5.3 Les deux plans sont-ils substantiellement différents ?

À **informations utilisateur rigoureusement identiques** :

- **indice de Jaccard du vocabulaire des plats : 0,228** (49 mots contre 64,
  21 en commun — et les communs sont « tomate », « concombre », « roquette »,
  « citron », c'est-à-dire les légumes que les deux doctrines encouragent) ;
- **0 titre de plat identique** entre les deux plans sur 12 × 12 comparaisons ;
- **0 protéine partagée.**

### 5.4 La traçabilité jusqu'à l'assiette

Chaque plat porte `honours_belief_keys`, la clé de la conviction qui l'a produit.
Relevé en base :

- **D2** : `la_proteine_animale_est_le_centre`,
  `les_feculents_sont_un_accessoire_facultatif`, `les_abats_et_la_viande_rouge`
- **D3** : `aucune_chair_animale_n_entre_dans`,
  `la_legumineuse_porte_la_proteine_de`, `une_legumineuse_et_une_cereale_complete`

**Les 3 convictions de chaque coach sont citées par ses plats.** C'est la
meilleure preuve du run : la doctrine ne se contente pas d'entrer dans le
prompt, elle ressort **nommée** dans la donnée écrite.

**Verdict étape 2 : `green` sans réserve.**

---

## 6. Analyse De Fluidité Humaine

**Verdict : `red`**

**Ce qui marche**
- Quand le composeur parle, il parle **comme le coach** : il le nomme, reprend
  son vocabulaire propre (« le grand matin », « la pièce », « l'assiette
  pleine »), et restitue ses arbitrages presque mot pour mot.
- Le silence est bien tenu : sur un sujet non tranché, Sophia le **dit** au lieu
  d'inventer — et sépare proprement l'avis du coach du sien.
- La divergence est immédiatement lisible pour un humain : lues côte à côte, les
  cinq réponses à « comment j'ai assez de protéines » ne peuvent pas venir du
  même coach.

**Problèmes**
- **Tours D1/I4, D2/I4, D4/I4, D5/I4, D2/I1-r2, D2/I1-r3 (et 10 autres)** :
  réponse **en anglais** à un élève `fr-FR`, **identique au caractère près** chez
  quatre coachs opposés. Famille `BF-ROUTE-01`.
  Impact : l'élève ne peut pas la lire, et rien ne distingue son coach d'un
  autre. Sévérité : **`red`**.
- **Tour D3/I3** : on répond à l'élève que son coach « n'a pas tranché » sur un
  aliment que le coach a exclu **trois fois**. Famille `BF-ROUTE-01`.
  Impact : la promesse produit est contredite dans la bulle. Sévérité : **`red`**.
- **Tours D1/I3, D2/I3, D2/I4-r3, D2/ADV-implicite** : la réponse est un
  **fragment sans phrase** (« un café noir ou un grand verre d'eau au réveil —
  Baptiste Rouve ») ; la question fermée « je peux ou pas ? » reste sans réponse.
  Famille `BF-LEDGER-02`. Sévérité : **`yellow`**.
- **Tour D5/I3** : une escalade anglaise suivie d'une relance française
  (« Et tu as mangé quoi avec ? ») dans la même bulle. Sévérité : **`yellow`**.
- **Tour D2/I5** : réponse méta qui décrit le fonctionnement de l'agent
  (« le coach actif dans cette conversation », « ton contexte visible »).
  Sévérité : **`yellow`**.

**Fix proposé**
- Source amont : `sophia-brain/dispatcher/dispatcher.prompts.ts` (règle 6-bis) et
  `skills/plan_question/renderer.ts`.
- Correction recommandée : voir `R1-B01` et `R1-B03` de la feuille de bugs.
- Tests d'invariant attendus : un tour « qu'est-ce que je mange ce soir » sans
  aliment nommé ne doit **jamais** produire `skill_signals.plan_question` ; un
  aliment couvert par `doctrine.forbidden` ou `coach_food_items.stance=excluded`
  doit être refusé **par la doctrine**, jamais escaladé.

---

## 7. Analyse Système

**Verdict : `red`**

**Routage**
- Le dispatcheur émet `skill_signals.plan_question` sur **16 des 42 tours**
  (38 %), dont **7 tours sans aucun aliment nommé** par l'élève. La règle 6-bis
  du prompt le restreint pourtant à « une question d'EXÉCUTION à l'intérieur du
  plan publié ». Le même fichier documente déjà une mesure identique sur une
  autre forme (« je mange au restaurant » : 2 émissions fautives sur 3) — c'est
  la **même famille de défaut, sur une nouvelle forme**.
- `plan_question` a **priorité de fait** sur la lane de doctrine : sur ces
  16 tours, le bloc doctrine était chargé (`reason: loaded`, `beliefs_kept: 3`)
  et **n'a jamais servi**.
- **Aucun `no_published_doctrine`, aucune délégation parasite** (`delegated:
  false` × 42), **aucune fuite inter-coachs**. La couche de chargement est saine.

**Skills / Operations / Tools**
- `plan_question` résout son verdict **contre `plan_commitments` + `swap_policy`
  uniquement**. La doctrine du coach n'est pas une entrée de ce tier-0. C'est la
  source amont réelle : la même lecture (`loadPublishedDoctrine`) est faite au
  même tour, 200 lignes plus haut, et le skill ne la consulte pas.
- Les deux `plan_commitments` du décor sont `lean_protein` et `non_starchy_veg` ;
  **toutes** les escalades nommées comparent l'aliment demandé à la ligne
  « protéines maigres », y compris quand l'aliment est une friture ou une
  céréale. Le rapprochement de groupes est faux.
- `skills/plan_question/renderer.ts` construit sa prose en **littéraux anglais**
  (`escalationText`, `DENY_TEXT`, `tier0AllowedText`) ; seul `foodLabel()`
  traverse le `LocalePack`. D'où les phrases hybrides « **volaille** is outside
  what your coach set for the **protéines maigres** line ». La locale **est
  connue** du skill au même instant : la ligne DB écrite porte `fr-FR`.
- Le verrou de sortie `keel_output_locks.ts:200` remplace la réponse entière par
  `signAsCoach(instead)`. Mordu **4 fois sur 42** (9,5 %).

**Memory / Effets durables**
- **18 lignes `contract_change_requests` écrites sur 42 tours (43 %)**, toutes
  `raised_by=sophia`, `urgency=next_digest`, `content_locale=fr-FR`.
- Les `reason_code` sont faux dans la quasi-totalité des cas :
  `dislikes_food` sur « comment je place mes protéines », `dislikes_food` sur
  « j'ai une séance de muscu à 7h », `social_event` sur « il est tard, je dîne
  quoi ». Le coach lira un digest qui décrit un élève qui n'existe pas.
- **2 de ces lignes ont été écrites sur des tours dont la réponse visible venait
  du VERROU** (D2/I3, D2/ADV-implicite) : l'élève lit « mange ça à la place » et
  ne saura jamais que sa question a été mise en file chez son coach. Effet
  durable **non annoncé**.
- Côté assiette, à l'inverse : `student_generated_meals` est **exact**, tracé
  (`honours_belief_keys`), et zéro exclu.

**Deux défauts de câblage trouvés à la lecture, confirmés par mesure**

1. **Un `coach_food_items` `stance='encouraged'` n'a AUCUN lecteur au runtime.**
   Vérifié par grep (`coach_food_items` n'est lu que par `coach-doctrine-v1`,
   `coach-protocol-v1` — les deux écrans — et `doctrine_loader.ts`, qui ne prend
   que `stance='excluded'`), puis mesuré sur les blocs réellement servis :
   sur les **10 items encouragés** des 5 coachs, **0 apparaît dans le bloc
   doctrine, 0 dans le bloc protocole**. Le coach saisit « Foie de veau,
   au moins 2 portions par semaine » sur son écran, et rien au runtime ne le
   lit. Seul le groupe (`coach_food_rules → red_meat`) passe. Le grain fin de
   l'écran Aliments — le libellé, la fréquence, le créneau, le « pourquoi » —
   est perdu.
2. **`frequency_template` est perdu sur les exclus.** `doctrine_loader.ts:402`
   ne sélectionne que `label`. L'item de D5 « Viande rouge au dîner »,
   `not_after 19:00`, arrive dans le bloc comme une interdiction **plate et
   permanente** (« Never suggest these to the student »). Le coach a écrit
   « pas après 19h » ; l'agent lit « jamais ». Sur une doctrine dont le parti
   pris EST une heure, c'est la doctrine elle-même qui est déformée.
3. **Le genre du coach est codé en dur au masculin** dans les deux compilateurs
   (`protocol_compiler.ts:733, 772, 801, 905, 976` : « WHAT **HE** BUILDS PLATES
   WITH », « **he** does not build with it », « **HIS** RULES » ;
   `doctrine.ts:806` : « **He** answers: »). Le bloc servi à l'élève d'Hélène
   Vasseur dit « HÉLÈNE VASSEUR'S FOOD MAPPING — WHAT HE BUILDS PLATES WITH ».

**Fix proposé** — voir la feuille de bugs.

---

## Verdict Global

- **Verdict : `red`**
- **Raison principale** : la doctrine est **parfaitement câblée là où elle passe**
  — 5 blocs compilés distincts, `reason: loaded` sur 42/42 tours, 0 fuite entre
  coachs, et deux plans de 4 jours à 0 exclu, encouragés présents chaque jour,
  divergents à 0,228 de Jaccard à informations utilisateur identiques. Mais dans
  le **chat**, un skill qui ne lit pas la doctrine (`plan_question`) capture
  38 % des tours — dont la question la plus banale du produit — et rend à quatre
  coachs opposés **le même texte anglais**, en écrivant 18 escalades au motif
  faux.
- **Follow-up prioritaire** : `R1-B01` (le routage `plan_question` ne doit pas
  capturer un tour de conseil) et `R1-B02` (le tier-0 doit consulter la doctrine
  avant d'escalader un aliment que le coach a explicitement exclu).

## Feuille De Suivi Bugs

- Bug sheet : `docs/agent-playbook/New/test-material/run-bug-sheets/2026-08-13-doctrine5-bugs.md`

---

## Annexe — Reproduire ce run

Scripts dans le scratchpad de session (hors dépôt) :
`doctrines.ts` (les 5 doctrines), `setup.ts` (montage + publication réelle),
`proof.ts` (preuve de compilation), `t.ts` (un tour par
`chat-inbound-v1`, avec relecture DB et capture du log `keel.doctrine.variant`),
`gen.ts` / `analyse_gen.ts` (les deux générations et leur mesure), `leak.ts`
(balayage de fuite inter-coachs), `cleanup.ts` (remise à zéro).

Identifiants du run (comptes jetables, tous supprimés en fin de run) :

| # | coach_id | protocol_id | student_user_id |
|---|---|---|---|
| D1 | `d7d1c654…` | `ce8d1a4d…` | `91e10d26…` |
| D2 | `09eb920f…` | `812784cc…` | `45c9b017…` |
| D3 | `7bc5c23b…` | `b8b1baa2…` | `3124c65e…` |
| D4 | `3435ed7a…` | `6e95f1a0…` | `35d45f6b…` |
| D5 | `b9d5e5fd…` | `760cda51…` | `c928ad0e…` |
