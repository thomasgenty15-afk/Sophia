# La question qui ne bloque pas — le rapport

**Chantier** : « le doute ne bloque rien, et l'écriture se dit tout de suite »
(docs/keel/NOMENCLATURE-MEMOIRE.md **§2.8** et **§8.3**).
**Commits** : `95adf76e` (socle), `3fc8d1f0` (« Voir », annonce du bilan, 3ᵉ lane
épinglée), `c934a98c` (fixture à cinq bouches, banc, juge).
**Date des mesures** : 2026-09-04, poste local, comptes `qa-clarif-20260904` et
`qa-3portes` (banc QA — aucun compte réel n'est touché).

---

## 1. Ce qui a été livré

| | ce que ça ferme |
|---|---|
| **La question qui ne bloque pas** | « ma fille » avec deux filles ne se jette plus en silence. Le classifieur range l'entrée dans une 5ᵉ liste `clarify`, le plan se compose quand même, et une bulle part avec les prénoms en boutons. Un tap écrit ; l'échappatoire ferme en `declined` (distinct du silence) ; le silence expire à 48 h et se COMPTE. |
| **L'annonce à l'instant du geste** | chaque écriture en mémoire se dit tout de suite, avec un bouton « Voir » qui ouvre la carte sur le bon bloc. Le récap du soir a perdu son bloc mémoire (doublon à six heures du geste) et ne garde que la sécurité. |
| **Le bilan qui écrivait sans un mot** | le questionnaire posait une exclusion durable, un cran de portion et un réglage **sans qu'un mot ne parte**, ni sur le coup ni le soir. Il annonce désormais, en **une** bulle. |
| **La 3ᵉ lane épinglée** | on pouvait retirer l'appel du classifieur de `keel-plan-feedback-v1` sans qu'une ligne de test ne rougisse. |

---

## 2. Ce que le banc a mesuré

### 2.1 Premier tir — `PASS 7/13 · FAIL 3 · INCONCLUSIVE 3`

Attendus écrits **avant** le tir (`$OUT/<cas>.attendu.json`), verdict terme par
terme. Un INCONCLUSIVE nomme la précondition qui manque et n'est **jamais**
compté PASS.

| cas | phrase | verdict | ce qu'on a lu en base |
|---|---|---|---|
| **D2** | « Mon fils n'aime pas le poisson. » | **PASS** | 0 question · 1 ligne `food.exclude` `member:Tom` · 1 annonce citant Tom, avec « Voir » |
| **B3** | « Zoé a bien mangé cette semaine. » | **PASS** | `skipped_meal_story=1` · 0 question · **0 annonce** · Δ = 0 |
| **D4** | « On n'aime pas trop la viande rouge. » | **PASS** | 0 question · 1 ligne `household` · annonce **sans aucun prénom** |
| **B4** | « Mon mari trouve qu'il y a trop de riz. » | **PASS** | `skipped_degree=1` · **0 question** · 0 annonce · Δ = 0 |
| **D3** | « Les petites ne mangent pas de champignons. » | **FAIL** | ⛔ 1 question « c'est pour qui ? · Léa · Zoé » — voir §3.1 |
| **B5** | « Les enfants ont détesté le skyr nature, sauf Tom. » | **PASS** | 0 question · 2 lignes `{Léa, Zoé}` · **0 Tom, 0 household** |
| **D1** | « Ma fille n'aime pas le poisson. » | FAIL *(faute de banc)* | question `{Léa, Zoé, Personne de la liste}` · **0 annonce avant le tap** · tap → `answered` · 1 ligne chez **Léa**, citation = la phrase. Seul terme en échec : le banc comptait le mauvais `purpose` (§3.3) |
| **B1** | « J'ai pas aimé la viande. » | INCONCLUSIVE | le plan était **entièrement végétarien** — 0 viande, donc rien d'ambigu (§3.3) |
| **P** | 3ᵉ question du même jour local | **PASS** | `clarify_kept=1` **mais** `clarify_ask_reason=daily_cap` · **0 bulle, 0 ligne créée, Δ = 0** |
| **D5** | « Elle a horreur des épinards. » | **PASS** | question `{Léa, Zoé, ESC}` · tap **ESC** → `declined` · **0 annonce, Δ = 0** |
| **B2** | « Le plat de vendredi soir, plus jamais. » | **FAIL** | question posée avec des **ingrédients** — voir §3.2 bis |
| **S** | tap sur une question dépassée | INCONCLUSIVE | le plafond du jour avait mordu : aucune question ouverte à périmer |
| **I** | question jamais tapée → balayeuse | INCONCLUSIVE | plus rien d'ouvert (les cas d'avant les avaient toutes fermées) |
| **V** | raison de livraison | *relevé* | **6 bulles sur 6 : `sent` · `reply`** — aucune n'a été refusée, ni pour le mode silencieux, ni pour un plafond |

**Les quatre sorts d'une question, tous exercés sur le même compte :**

```
who · expired  · draft_note    · champignons               ← remplacée par la suivante
who · answered · draft_note    · le poisson                ← tap Léa
who · declined · draft_note    · des épinards              ← tap « Personne de la liste »
what · expired · plan_feedback · Le plat de vendredi soir  ← jamais tapée
```

⚠️ **Le runtime a redémarré pendant le banc** (22:25:56 → 22:27:54 UTC) : une
session voisine écrivait sous `supabase/functions/`. Le banc le DIT dans son
compte-rendu. Aucun cas n'est tombé en 502 pendant cette fenêtre.

**Ce qui est tenu sur les 13 cas, sans exception** : `plans.delta == 1` à chaque
génération · **sécurité, allergies, restrictions et régimes n'ont bougé sur
aucun cas** · **0 ligne `skipped`** dans le ledger pour les trois purposes ·
tous les payloads de question portent le préfixe `KEEL_MEMCLAR_` et
l'identifiant de leur propre ligne.

### 2.2 Second tir — après les deux correctifs produit

Même banc, même compte remis à zéro, **le seul changement est le produit** (règle
du pluriel, `planVocabularyOf`) et deux corrections du banc lui-même.

| cas | 1ᵉʳ tir | 2ᵉ tir | ce qui a changé |
|---|---|---|---|
| D2 | PASS | **PASS** | |
| B3 | PASS | **PASS** | |
| D4 | PASS | **PASS** | |
| B4 | PASS | **PASS** | |
| **D3** | **FAIL** | **PASS** | la règle du pluriel — voir la sortie ci-dessous |
| B5 | PASS | **PASS** | |
| **D1** | FAIL *(banc)* | **PASS** | le banc compte les deux porteurs d'annonce |
| B1 | INCONCLUSIVE | INCONCLUSIVE | *le banc ne pliait pas les `preparations` — §3.3 ③* |
| **P** | PASS | FAIL *(banc)* | ⚠️ **conséquence du correctif D3** : D3 ne pose plus de question, donc le plafond n'était plus atteint (1/2) et P mesurait une question NORMALE en croyant mesurer un refus. Le cas exige désormais sa précondition et rend INCONCLUSIVE. |
| **D5** | PASS | FAIL *(banc)* | ⚠️ **conséquence de la correction de D1** : en ajoutant `keel_memory_clarification_ack` aux annonces, le banc s'est mis à compter l'accusé d'un **refus** comme une annonce. |
| **B2** | FAIL | FAIL → **PASS** | l'attendu du banc était resté celui du doc d'avant ; rejugé sur le MÊME fichier `B2.obtenu.json` avec l'attendu corrigé : **PASS** |

**Ce que les trois FAIL du second tir ont en commun : aucun n'est le produit.**
Deux sont des effets de bord de mes propres correctifs de banc — et c'est le
mode d'échec le plus instructif de la soirée : *corriger un banc en casse une
autre partie, en silence.*

**Vérifié sans relancer, sur les traces déjà écrites :**

- **D5** — l'accusé du refus est en base : `keel_memory_clarification_ack |
  « D'accord, je n'ai rien noté. » | boutons=0`. Aucune ligne écrite. Avec le
  critère juste (« une annonce est une bulle qui porte **« Voir »** »), `n_count`
  vaut 0 et le cas passe. Le produit n'a jamais varié.
- **B2** — rejugé sur le fichier `B2.obtenu.json` **du même tir**, avec l'attendu
  corrigé : **PASS**. Et les boutons proposés sont désormais des **plats** :

  ```
  Tu as écrit « Le plat de vendredi soir » — tu parlais de quoi ?
   · Poulet, courgettes, tomates et quinoa
   · Poulet, légumes rôtis, laitue et haricots blancs
   · Poulet, légumes rôtis, pains pita et houmous
   · Lentilles, carottes, courgettes, tomates et yaourt
  ```

  contre, au premier tir : `filets de saumon · cuisses de poulet · lentilles ·
  œufs`. C'est la différence entre une question à laquelle on peut répondre et
  une question à laquelle aucune réponse n'est juste.

**D3, la sortie réelle du second tir** — deux lignes, une par bouche, **zéro
question**, et l'annonce nomme les deux :

```
J'ai noté ce que tu veux (ou pas) dans l'assiette :
· Léa : « Les petites ne mangent pas de champignons. »
· Zoé : « Les petites ne mangent pas de champignons. »
```

```json
[{"kind":"food.exclude","subject":"member:<Léa>","at":"2026-09-04"},
 {"kind":"food.exclude","subject":"member:<Zoé>","at":"2026-09-04"}]
```

**D1, le cœur du chantier, de bout en bout :** question `{Léa, Zoé, Personne de
la liste}` · **0 annonce avant le tap** (rien n'est écrit tant qu'on n'a pas
répondu) · tap → `keel_memory_clarification_answered` · une ligne chez **Léa**,
citation = la phrase · une annonce citant Léa et le poisson, avec « Voir ».

### 2.3 Troisième tir — B1, la phrase que la demande nommait

`B1` est **le cas cité mot pour mot dans la demande d'origine** : « si une
personne dit *j'ai pas aimé la viande* dans le bilan, est-ce qu'il y a une
question pour savoir de quelle viande on parle **en ayant accès au plan** ? »

Il est resté INCONCLUSIVE **deux tirs** — le banc ne pliait pas les
`preparations` (§3.3 ③) et les cas d'avant vidaient le plan de sa viande. Sur un
compte neuf, avec les préparations pliées et un plan qui porte deux viandes :

```
viandes du plan (2): bœuf haché, cuisses de poulet désossées
boutons: ['cuisses de poulet désossées', 'bœuf haché', 'Aucun de ceux-là']
✓ tous dans les viandes du plan
tap · handled=keel_memory_clarification_answered
```

```json
[{"kind":"food.exclude","subject":"household","text":"cuisses de poulet désossées","at":"2026-09-04"}]
```

**PASS sur les 17 termes.** Aucun poisson n'a été proposé, aucune ligne n'a été
écrite avant le tap, l'annonce porte « Voir », et rien n'a bougé côté sécurité.

### 2.4 Le compte, tous tirs confondus

⚠️ **Il a fallu trois passes et un second compte**, parce que le plafond de deux
questions par jour local n'en laisse pas passer davantage (§ mémoire
`clarification-bench-recipe`). Chaque ligne ci-dessous renvoie à une mesure
réelle, jamais à un raisonnement.

| cas | verdict final | sur quelle preuve |
|---|---|---|
| **D2** · un seul garçon, pas de question | **PASS** | 2ᵉ tir |
| **B1** · « j'ai pas aimé la viande » → question QUOI | **PASS** | 3ᵉ tir, compte neuf |
| **B3** · raconter un repas ⇒ rien | **PASS** | 2ᵉ tir |
| **D4** · « on » = la table | **PASS** | 2ᵉ tir |
| **B4** · un degré ⇒ rien, et pas de question | **PASS** | 2ᵉ tir |
| **D3** · un pluriel ⇒ une ligne par bouche | **PASS** | 2ᵉ tir, **après correctif** |
| **B5** · aliment nommé ⇒ pas de question QUOI | **PASS** | 2ᵉ tir |
| **D1** · question QUI + tap qui écrit | **PASS** | 2ᵉ tir |
| **P** · le plafond refuse la 3ᵉ | **PASS** au 1ᵉʳ tir · INCONCLUSIVE ensuite | le correctif D3 a libéré une place, donc le plafond n'était plus atteint : le cas exige désormais sa précondition |
| **D5** · l'échappatoire n'écrit rien | **PASS** au 1ᵉʳ tir | et vérifié en base au 2ᵉ : `« D'accord, je n'ai rien noté. » · boutons=0` |
| **B2** · « le plat de vendredi soir » | **PASS** | rejugé sur le fichier du 2ᵉ tir avec l'attendu corrigé ; boutons = des **plats** |
| **S** · tap sur une question dépassée | **INCONCLUSIVE** | `keel-proactive-v1` répond 200 mais ne produit **aucune bulle à boutons** sur un compte neuf : rien ne périme la question. On ne tape pas — taper mesurerait le chemin nominal. Le chemin périmé reste tenu par ses tests unitaires (`disarmed_tap_test.ts`), pas par un run. |
| **I** · le silence, compté | **PASS** | `{"tag":"keel.memory_clarification","event":"swept","expired":2}` · la ligne passe `open` → `expired` |
| **V** · raison de livraison | *relevé* | **6 bulles sur 6 : `sent · reply`** |

**11 PASS sur 14, 2 INCONCLUSIVE avec leur précondition nommée, 1 relevé.**
Aucun FAIL ne subsiste sur le produit.

⚠️ **La faute du banc la plus instructive, sur le cas I.** Le pouls rendait
**HTTP 200** et ne balayait rien : `now()::text` de Postgres porte un DÉCALAGE
(`…+00`), et y coller un « Z » donnait `…+00Z`, que `new Date()` refuse. Le
pouls retombait alors sur l'heure réelle, silencieusement. Le cas accusait la
balayeuse de ne pas balayer. Le banc exige désormais de l'ISO-8601 UTC **et**
la ligne de journal `swept` comme preuve que la balayeuse a tourné — sans elle,
« rien n'a expiré » et « la balayeuse n'a jamais été appelée » se ressemblent
trait pour trait.

---

## 3. Ce que le banc a TROUVÉ — trois défauts, et lequel est à moi

### 3.1 ⛔ « Les petites » posait une question à laquelle on ne peut pas répondre

**Cas D3, FAIL.** « Les petites ne mangent pas de champignons. » dans un foyer à
**deux filles** a produit la bulle :

> Tu as écrit « champignons » — c'est pour qui ? · **Léa** · **Zoé** · Personne de la liste

Cette question **ne peut pas avoir de bonne réponse** : en taper une jette
l'autre. La phrase nommait les deux.

**La cause est écrite dans le prompt, et elle se lit à voix haute :** `WHO_RULES`
donnait « the kids » comme exemple de mot à résoudre, puis exigeait qu'**une
seule** personne corresponde. Un pluriel ne satisfait jamais cette condition, donc
il tombait mécaniquement dans « deux personnes correspondent ⇒ demande ». La
règle envoyait **tous** les pluriels vers la question.

⚠️ **Ce n'est pas une régression : c'est un progrès arrêté à mi-chemin.** Avant ce
chantier, `WHO_RULES` disait « file NOTHING » — « les petites » était **jeté en
silence**, sans motif, sans relance. Le lot l'a transformé en question ; il
manquait la moitié qui dit qu'un pluriel n'est pas un doute.

**Corrigé** : une règle explicite, placée **AVANT** celle des deux candidats
(l'ordre est la moitié qui compte — un modèle applique la première consigne qui
colle), et un test qui tient les deux : le texte de la règle, et sa position.

### 3.2 Le texte d'une préférence est parfois une phrase, pas une chose

Non corrigé — **c'est le prompt du lot A, pas celui-ci**, et le changer déplace
le comportement du modèle sur toutes les lanes d'un coup. Mais la carte le montre,
et la carte est l'écran que « Voir » ouvre :

| ce qui est écrit en base | ce que la carte affiche sous « Ce que tu ne veux plus » |
|---|---|
| `Mon fils n'aime pas le poisson.` | Tom → « Mon fils n'aime pas le poisson. » |
| `ont détesté le skyr nature` | Léa → « **ont détesté le skyr nature** » |
| `le poisson` *(venu d'un tap de clarification)* | Léa → « le poisson » |

La troisième ligne est la bonne, et elle vient du **chemin de la question** :
`resolveClarification` met le TERME dans `text`. Le chemin direct recopie la
proposition du modèle, qui suit « as close to THEIR OWN WORDS as you can » —
jusqu'au groupe verbal.

⚠️ **La ceinture d'exclusion, elle, fonctionne quand même** : `termsOfInstruction`
extrait les jetons cherchables de la phrase, et son commentaire nomme
explicitement « Mon fils n'aime pas le poisson » comme entrée mesurée. Le défaut
est **de lecture**, pas de morsure. À arbitrer : une phrase de plus dans le prompt
(« la CHOSE, pas la phrase à son sujet ») réduirait aussi le bruit de jetons que
la ceinture doit déjà écarter (« fil » tiré de « fils »).

### 3.2 bis « Le plat de vendredi soir » : la bonne question, les mauvais boutons

**Cas B2, FAIL.** La bulle posée était :

> Tu as écrit « Le plat de vendredi soir » — tu parlais de quoi ?
> · **filets de saumon** · **cuisses de poulet désossées** · **lentilles vertes sèches** · **œufs**

Des **ingrédients**, pour une phrase qui désigne un **plat**. Aucune réponse
n'est juste : taper « filets de saumon » écrit « plus jamais de filets de
saumon » alors que la personne voulait retirer le plat entier.

**Et l'attendu du doc était faux, pas le produit.** §8.3 disait « aucune question
— le classifieur a le plan ». Il ne l'a pas : il reçoit une **liste plate de
termes, sans jour ni moment**. « Vendredi soir » lui est réellement
irrésolvable, et demander est la bonne réponse.

**Corrigé** : `planVocabularyOf` met les **titres de plats** en tête de la liste
proposée, devant les aliments. **Ce qui reste ouvert et est écrit dans le doc** :
la liste ne porte toujours ni jour ni moment, donc « le plat de vendredi soir »
restera une question. On a amélioré la question, pas supprimé le besoin de la
poser.

### 3.3 Deux fautes du BANC, pas du produit

Nommées parce qu'elles ont produit un FAIL et un INCONCLUSIVE trompeurs.

1. **L'annonce a deux porteurs.** Une écriture s'annonce par
   `keel_memory_written` quand elle vient du classifieur, et par
   `keel_memory_clarification_ack` quand elle vient d'un **tap** — le répondeur
   de bouton porte son accusé lui-même, avec le même corps et le même « Voir ».
   Le banc ne comptait que le premier : **D1 a été rendu FAIL alors qu'il était
   parfait par ailleurs** (question posée avec les deux bons prénoms, tap
   `answered`, ligne écrite chez Léa). Corrigé.
3. **⛔ LE BANC A RECOMMIS UNE CICATRICE DU DÉPÔT :
   `preparations-must-be-folded-into-dishes`.** La requête « combien de viandes
   au plan ? » ne scannait que `dishes[].ingredients`. Elle a donc rendu
   **« 0 viande »** sur un plan dont un plat s'appelle littéralement **« Poulet
   rôti, riz, salade et haricots verts »** — parce qu'en cuisine par lots, le
   kilo de cuisses vit dans `preparations`. B1 est resté INCONCLUSIVE **deux
   tirs de suite** pour cette raison, sur un plan qui portait la viande qu'il
   cherchait. C'est le mode d'échec le plus coûteux d'un banc : il ne dit pas
   « je me trompe », il dit « le produit n'a rien fait ».
2. **B1 mesurait aussi un plan que les cas d'avant avaient vidé.** « J'ai pas aimé la
   viande » a besoin d'**au moins deux viandes au plan**. Or D2 (« pas de
   poisson ») et D4 (« pas de viande rouge ») s'accumulent, et le générateur a
   rendu un plan **entièrement végétarien** — 0 viande. Le banc a rendu
   INCONCLUSIVE **en nommant la précondition**, ce qui est le comportement voulu ;
   mais l'ORDRE des cas était le fautif. B1 passe désormais avant les exclusions.

---

## 4. « Voir » — vérifié au navigateur, MESURÉ et pas regardé

Le banc ne peut rien dire de ce bouton : son jeton **n'atteint jamais le
serveur**. Vérification au Browser pane, compte `qa-clarif-20260904`, dev server
`frontend` (5174).

| ce qu'on voulait savoir | mesuré |
|---|---|
| le jeton part-il au serveur ? | **non** — `performance.getEntriesByType('resource')` filtré sur `chat-inbound` : **0 requête**, avant comme après le clic |
| combien de temps pour arriver ? | **8 ms** — l'URL est `/app/about-you?focus=preferences&at=2026-09-04` au premier échantillon |
| arrive-t-on sur le bon bloc ? | oui — l'ancre `known-preferences` se pose à **68 px** du haut (la hauteur de la barre fixe), stable |
| la ligne du jour est-elle surlignée ? | oui — **4 lignes** (celles écrites aujourd'hui) portent l'anneau |
| le surlignage s'éteint-il ? | oui — allumé jusqu'à **3 001 ms**, éteint au relevé de **4 000 ms** |
| et à 320 px ? | ancre à **0 px**, **débordement horizontal = 0**, **0 élément plus large que l'écran** |
| deux annonces d'affilée ? | **les deux affichent leur « Voir »** — une bulle qui ne fait que naviguer n'arme pas de question et ne désarme pas celle d'avant |

⚠️ **Le viewport à 0 px de haut fausse tout.** Premier essai : le Browser pane
rendait `innerHeight: 0`, et `scrollIntoView` ratait l'ancre de 3 455 px. Ce
n'était pas le code. Toujours poser une taille explicite avant de mesurer un
défilement.

---

## 5. Ce que ces bancs NE prouvent PAS

Écrit ici pour que personne ne lise ce rapport comme une garantie.

1. **La stabilité du modèle.** Un run par phrase. `1/1` n'est pas un taux. D3
   (le pluriel) et D5 (« elle ») sont les plus exposés.
2. **Le passage réel du temps.** L'horloge du générateur n'est pas pilotable :
   une semaine se simule par une fenêtre future, mais les lignes portent
   `at = le jour RÉEL`.
3. **Que la question soit COMPRÉHENSIBLE.** Le banc compte des boutons et des
   libellés, pas du sens.
4. **Le plafond non sollicité au-delà de la première annonce du jour.** Dès le
   premier tap, la conversation est « active » dix heures et tout passe en
   `conversation_active` : `delivery_reason = reply` n'est mesurable que sur la
   toute première bulle.
5. **La double écriture derrière Kong est DÉTECTÉE, pas EMPÊCHÉE.** Le banc
   relit le compte de plans et annule le cas ; il n'a aucun moyen d'empêcher la
   fonction de finir derrière une réponse coupée.
6. **Les comptes sont des fixtures de banc.** Aucune mémoire réelle n'a été lue.

---

## 6. Ce que le POSTE a imposé, et qu'il ne faut pas imputer au produit

| ce qu'on a vu | ce que c'était |
|---|---|
| `502 An invalid response was received from the upstream server` en 63 s | **Kong coupait les fonctions à 60 s** alors que la génération continuait derrière. Le pré-vol du banc exige désormais `read_timeout ≥ 300 000 ms`. |
| `502` en **10–16 s**, trois cas d'affilée | une session voisine éditait sous `supabase/functions/` ; chaque sauvegarde fait redémarrer `functions serve`, qui tue les requêtes en vol. Trois redémarrages en 45 s, mesurés. Le banc note l'instant de démarrage au début et à la fin et le DIT. |
| `early termination has been triggered: isolate …` | **la limite d'horloge murale de l'isolate du runtime edge**, atteinte deux fois de suite sur une génération de foyer alors que le compte portait déjà cinq plans et plusieurs exclusions. Cicatrice connue (`generation-model-times-out-on-household-prompt`) : plus la mémoire du compte grossit, plus le prompt du foyer s'allonge, et plus on s'approche du plafond. |
| `TS2322 Type 'Timeout' is not assignable to type 'number'` dans un fichier intact depuis août | **`npx deno` est 2.9.6, le `deno` du dépôt est 2.6.0.** `agent-gate.sh` appelle `deno` tout court. Rien n'était cassé. |

⚠️ **La règle qui tient tout ça ensemble** : sur un arbre partagé par plusieurs
sessions, un banc long ne mesure le produit que dans les fenêtres où personne
n'écrit sous `supabase/functions/`. Le banc ne peut pas l'empêcher ; il peut
seulement le **dire**, et c'est ce qu'il fait.

---

## 7. ⏸ Ce qui attend une main humaine

Rien de ce lot n'est en production. Les commandes ci-dessous sont **bloquées
pour l'agent** (`.claude/hooks/block-risky-commands.sh`) et doivent être lancées
par une personne.

**① Les quatre migrations, dans cet ordre**

```bash
supabase db push
```

Elles sont **déjà appliquées en local** (`supabase migration up --local`), mais
« appliquée en local » ne veut pas dire « le bloc de contrôle a tourné contre la
base distante » — cicatrice nommée du dépôt. La tête du registre local est
`20260904090000`.

| version | ce qu'elle pose |
|---|---|
| `20260903120000` · `20260903150000` · `20260903180000` | le chantier « mémoire à trois destinations » |
| **`20260904090000`** | le 6ᵉ genre de sollicitation + la table `memory_clarifications` (RLS propriétaire en SELECT seul, index « une ouverte par personne », 13 contrôles dans les deux sens) |

**② Les cinq fonctions edge**

```bash
supabase functions deploy generate-meal-v1 generate-household-meal-v1 keel-plan-feedback-v1 chat-inbound-v1 keel-daily-pulse-v1
```

⚠️ **Avec le CLI global, pas celui de `node_modules`** — cicatrice
`no-verify-jwt-flag-panics-the-cli` : `npm run` prend la 2.75.3, qui plante au
deploy.

**③ Un arbitrage, un seul** — §3.2 : faut-il que le `text` d'une préférence soit
**la chose** (« le poisson ») plutôt que **la phrase** (« ont détesté le skyr
nature ») ? Une phrase de plus dans le prompt du lot A suffit. Ça déplace le
comportement du modèle sur **les trois lanes** d'un coup, donc ça se décide, ça
ne se glisse pas.
