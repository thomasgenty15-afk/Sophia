# Nomenclature — ce que Sophia retient, et sous quelle forme

> ### ⛔ 2026-09-09 — LE CANAL SÉCURITÉ DU RETOUR DE PLAN EST SUPPRIMÉ
>
> Décision du propriétaire : **une allergie ou un régime dits dans une note sur un plan
> n'écrivent plus rien en table de sécurité.** Les préférences alimentaires les portent —
> au plus une `food.exclude`, comme n'importe quelle exclusion.
>
> Supprimés : `draft_note_safety.ts`, `draft_note_safety_io.ts` et leurs tests, la liste
> `safety` du prompt de `draft_note_classify.ts`, la question de **portée** (`scope`) qui
> n'existait que pour la porter, la déclaration en attente (`pending.safety`), la ligne de
> récap `safety` de l'accusé du classifieur et la bulle d'échec
> (`notifySafetyNotWritten` / `buildSafetyNotWrittenNotice`).
>
> **Ce qui reste, et ce n'est pas un oubli :** la table `student_safety_constraints` et
> `household_member_allergies` (elles portent l'allergie **cochée dans le formulaire**, la
> sienne comme celle d'une bouche), leurs ceintures de sortie, le récap du soir
> (`memory_recap_io.ts` lit toujours les deux tables), et l'outil de conversation
> `declare_safety_constraint`.
>
> **Périmées de ce fait** : dans §2.2 l'alinéa « LA SÉCURITÉ N'EST AUCUNE DES TROIS » (sa
> règle tient, son câblage non), le bloc `scope` de §2.5, les lignes 8/9 de §8 et SC1/SC3
> de la campagne SC, et l'encadré « arbitrage du 2026-09-01 » en A.1 — chacun porte sa
> marque ci-dessous.

> ### ⛔ MODÈLE À TROIS DESTINATIONS — 2026-09-03 — remplace « 8 familles → 6 sections »
>
> Ce document a été **réécrit le 2026-09-03** (lot 0 du chantier « la mémoire à trois
> destinations », prompt maître
> `scratchpad/2026-09-03-1331-MASTER-PROMPT-memoire-trois-destinations.md`). Le modèle
> qu'il porte a été énoncé de multiples fois par le fondateur et **n'avait jamais été écrit
> comme autorité** : chaque session repartait des huit familles de `kind` et des six sections
> de la carte, et construisait à côté du modèle voulu. Mesuré le 2026-09-03 : **sept magasins**
> pour une seule mémoire, dont **un seul** visible sur « Ce que Sophia sait de toi », et
> « Tom n'aime pas le poisson » avec **trois lits** et trois ceintures différentes.
>
> **Ce qui est autorité désormais :** §2 (deux sources, trois destinations), §5 (la matrice
> amendée), §6 (la surface), **§8 (les exemples de routage — c'est lui que les bancs
> testent)**, §9 (les collisions nommées avec les huit chantiers du même jour).
>
> Les sections remplacées sont conservées en **annexe A** (« ce que c'était ») parce que le
> code les porte encore jusqu'au lot D ; elles **ne sont plus une autorité**. Les encadrés
> datés des lots M1–M8 (2026-09-01) restent en place là où ils sont encore vrais, avec une
> note quand le 2026-09-03 les amende.
>
> Écrit le 2026-08-18. Amendé le 2026-09-01 (lot M1 : le memorizer n'est plus un producteur).
> Réécrit le 2026-09-03. **Règle fondatrice inchangée, héritée de `plan_feedback.ts` :**
> *une catégorie dont aucun générateur ne sait quoi faire ne se crée pas.* Chaque destination
> a un lecteur, nommé en face.

---

## 1. Le défaut que ce document ferme

Aujourd'hui, le durable est **une liste plate de phrases** —
`practical_constraints.food_preferences`, des chaînes de texte libre. Ça a trois
conséquences mesurées :

1. **Le générateur ne peut rien filtrer.** Il reçoit tout, dans le désordre, et
   doit deviner ce qui est une exclusion et ce qui est un goût.
2. **L'écran ne peut rien ranger.** Une liste de phrases n'a pas de sections.
3. **La réconciliation est grossière** — c'est ce qui a produit, en run réel,
   `["Aime le brocoli s'il est rôti.", "N'aime pas le brocoli."]` dans le même
   prompt.

Et le questionnaire de fin de plan (`meal_plan_feedback`) n'entre nulle part :
**zéro lecteur backend**, vérifié le 2026-08-18.

---

## 2. Deux sources, trois destinations — le modèle

### 2.1 Les DEUX sources, et pas une de plus

| source | forme | classée par |
|---|---|---|
| **① le retour sur le BROUILLON d'un plan** (`body.draft_note`) | texte libre, ≤ `DRAFT_NOTE_MAX_CHARS`, tapé sur un brouillon qu'on vient de composer | un modèle (`draft_note_classify.ts`), relu par un parseur qui **refuse** (`readDraftNoteClassification`), jamais par un matcher |
| **② le BILAN de fin de plan** (`meal_plan_feedback`) | un questionnaire à vocabulaire fermé, une question par bulle, envoyé par le chat à la fermeture de la fenêtre (FF-054 §3.2) | déterministe (`plan_feedback.ts`) — **sauf** la dernière question, libre et facultative (`anything_else`, lot B), qui repasse par le classifieur de ① |

**Le chat ordinaire n'écrit RIEN dans la mémoire du plan.** `canProduce("conversation", …)`
est faux pour tout, et le reste (lot M1) : la conversation **renvoie** vers l'écran où la
chose se pose. ⛔ Le pont « Keep » (`memory_items` → `food_preferences` par
`FoodPreferencesCard`, relu **à chaque génération** par `reconcileFoodPreferencesFor`) était
une **troisième source déguisée en bouton** : elle est **fermée au lot C** (§2.6).

> ⟳ **2026-09-06 (arbitrage 2 du 05/09)** — « Garder » est **rebranché**, pas sur
> `food_preferences` (que plus rien ne lit) mais sur les **lignes retenues** : la carte
> propose une phrase venue du chat, la PERSONNE la confirme et la classe (« j'aime » →
> `food.prefer`, « à éviter » → `food.exclude`), et la ligne s'écrit `written × food.*`,
> sujet = sa bouche, par `keel_write_retained_items` — la même porte que l'écran « Ce que
> Sophia sait ». Ce n'est pas une troisième source : le chat ne fait que proposer, l'écran
> écrit. `food_preferences` reste lisible sur la carte sous « Anciennes notes » et n'atteint
> toujours pas le prompt.

⚠️ **Une phrase de retour agit deux fois, et c'est voulu.** Elle compose d'abord le plan
qu'elle annote (`plan_draft_note.ts::draftNoteInstruction`, avec la requête), puis elle est
**classée** pour les plans suivants. Un texte que le classifieur ne range nulle part
(`nothing_to_file`) n'est donc pas perdu : il a déjà agi sur le plan qu'il visait.

### 2.2 Les TROIS destinations, sans recouvrement

Chaque chose retenue va dans **exactement une** des trois. Le test d'appartenance tient en
une phrase, et il se lit **dans l'ordre** : on essaie ①, puis ②, puis ③. Ce qui n'entre dans
aucune n'est pas retenu — et c'est une réponse fréquente et correcte.

| # | destination | test d'appartenance | par | lecteur |
|---|---|---|---|---|
| **①** | **LES PRÉFÉRENCES ALIMENTAIRES** | *« je peux la réduire à (personne, aliment ou préparation, exclure ou revoir) sans perdre de sens »* | **personne** (`member:<uuid>`) ou la table (`household`) | la consigne de composition (`compositionLinesFor`) **et** la ceinture par bouche (`food_exclusion_belt.ts`) |
| **②** | **LES INDICES** — internes, « pour nous » | *« c'est une position sur une échelle fermée que le générateur lit sans texte »* | personne (portion) · le compositeur (les trois de cuisine) | `meal_envelope.ts` (portion) · `readCookingCapacity` des deux lanes (cuisine) — §2.4 |
| **③** | **CE QUE SOPHIA SAIT** | *« ni ① ni ②, et le générateur en a besoin pour composer »* — ex. « Léa danse le mardi soir : il lui faut une grosse part ce soir-là » | **personne** ou la table ; daté ; cité ; effaçable | le **brief de la bouche** (générateur foyer, `household_voices_io.ts`) ou le bloc mémo (solo), rendu **au jour nommé** quand la note porte un `when` |

Plus **un encart**, qui n'est pas une quatrième destination mais une **durée** : « pour le
prochain plan » (§2.5).

⛔ **LA SÉCURITÉ N'EST AUCUNE DES TROIS.** Allergie, intolérance, régime, condition médicale
vont dans `student_safety_constraints` / `household_member_allergies` / `household_members.diet`,
avec le récap du soir (`memory_recap*.ts`) et la rétractation en un geste.

⟳ **2026-09-09 — mais elles n'y vont plus DEPUIS UNE NOTE.** Le canal sécurité du classifieur
(`draft_note_safety*.ts`) est supprimé : une allergie écrite sur un retour de plan est au plus
une `food.exclude`, et le prompt le dit. Les deux surfaces qui écrivent encore en sécurité sont
le **formulaire** (l'entonnoir pour la sienne, la fiche d'une bouche pour les autres) et l'outil
de **conversation** `declare_safety_constraint`. L'arbitrage du 2026-09-01 est donc renversé
pour le retour de plan ; son texte reste en annexe A.1, marqué.

### 2.3 La règle anti-doublon

> **Un fait qui passe le test de ① ne va JAMAIS en ③. Un mouvement de ② n'apparaît JAMAIS
> comme une ligne de ③. La carte ne montre une chose qu'une fois.**

Ce n'est pas une élégance. Le 2026-09-03, « Tom n'aime pas le poisson » avait **trois lits**
(`household_food_restrictions`, `food.exclude member:Tom`, `household_member_habits.note`) et
trois ceintures différentes ; « je n'aime pas le brocoli » en avait deux (`food_preferences`,
`food.exclude`), **tous deux au prompt**. Le modèle lisait deux fois la même consigne — ce qui,
dans un prompt, la **renforce** sans que personne ne l'ait demandé — et aucun écran ne pouvait
dire d'où venait une assiette.

Conséquences, une par destination :
- une **préparation** (« pas de friture », « jamais cru ») est une préférence au même titre
  qu'un aliment : `method.avoid` / `method.prefer` restent des `kind`, ils cessent d'être des
  **sections** ;
- un **degré** (« trop long », « trop compliqué », « trop gros ») ne se range nulle part depuis
  un texte libre : **un indice ne se bouge pas depuis une phrase**, il se bouge depuis une
  question fermée (§2.4). Le classifieur rend `nothing_to_file` avec la porte tentée
  (`index`), et la phrase a déjà agi sur le plan qu'elle annotait (§2.1) ;
- une note de ③ qui **nomme un aliment** est suspecte : si elle se réduit à ①, elle y va. Le
  prompt du classifieur le dit sur la ligne même de la clé `notes`.

### 2.4 Les quatre indices — échelle fermée, lecteur nommé, et QUI les bouge

Un indice est une **position**, jamais un texte. Il se bouge d'un cran par **réponse fermée
du bilan**, jamais depuis une phrase, jamais depuis le chat. Chaque mouvement écrit **une ligne
de journal** `practical_constraints.field_changes` (lot M5, plafond 20) avec `quote` = **la
question telle qu'elle a été posée** (`QUESTION_LABELS` / `OPTION_LABELS`, dans la langue du
moment) : c'est **le seul endroit où un indice se voit**, et il sert au *Défaire*.

| indice | échelle fermée | par | lecteur | qui le bouge (lot B) | plancher / plafond |
|---|---|---|---|---|---|
| **portion** | position **−2..+2**, **dérivée** des `portion.adjust` écrits (`feedback_index.ts`) ; `slight` = 1 cran, `clear` = 2 | **personne** (`portions_subject`) | `meal_envelope.ts` — `portionFactorFor`, un seul facteur depuis la position | `portions` du bilan, 5 crans, inchangé | la borne mord et `raw` le dit ; à la baisse sans sujet explicite, **mineurs et âges inconnus exclus par motif** (`subjectsForPortionAdjust`), jamais par erreur |
| **capacité à cuisiner** | `recipe_difficulty ∈ simple \| normal \| keen` | le compositeur | `readCookingCapacity` (deux lanes, **un seul test qui compare les deux**) | **`difficulty`** *(nouveau)* : `too_hard` ↓ un cran, `could_do_more` ↑ un cran, `fine` rien | `simple` / `keen` : `atFloor`, **journal quand même** |
| **rapidité à cuisiner** | `cooking_time_min` sur l'échelle `COOKING_SESSION_MINUTES = [30, 45, 60, 90, 120, 180]` — **un cran = un barreau** | le compositeur | `readCookingCapacity` | **`speed`** *(nouveau)* : `too_long` ↓ un barreau, `had_more_time` ↑ un barreau, `fine` rien | 30 / 180 : `atFloor`, journal quand même |
| **variété** | `variety ∈ repeat \| some \| varied` | le compositeur | `readCookingCapacity` → « repetition they accept » | `enough_variety` du bilan, **inchangé** : `no` / `sometimes` ↑ un cran ; pas de ↓ (asymétrie voulue, §4-bis) | `varied` : `atFloor` |

⛔ **Ce qui tombe au lot B : la DÉDUCTION.** `cooked = partly | no` ne bouge plus rien
(`easeCookingBy`, `simplifyRecipes` disparaissent d'`effectOf`) : on ne devine plus « trop
long » ou « trop dur » à partir de « pas cuisiné » — on **demande** lequel des deux c'était.
`cooked` redevient un contexte (une garde : on ne pose `difficulty` et `speed` qu'à qui a
cuisiné au moins en partie), plus un levier.

⚠️ **Le champ, pas une position cachée à côté du champ.** Pour les trois indices de cuisine,
l'échelle **EST** le champ que la personne voit dans ses réglages (`practical_constraints`).
Le §4-bis avait nommé le conflit sans le trancher (« M5 fait écrire dans le champ ; M3 dirait
qu'un degré va dans un indice ; les deux ne peuvent pas coexister sur le même champ »). **Tranché
le 2026-09-03 : M5 est confirmé.** La position que le générateur lit est celle que l'écran
montre — sinon on recrée le défaut muet (45 min lus, 30 composées). Le prix — un champ qui
« cliquette » vers le bas et ne remonte que par une réponse inverse — est accepté, et la
réponse inverse **existe** (`could_do_more`, `had_more_time`), ce que M5 n'avait pas. **La
portion reste une position dérivée** (M3) parce que ses réponses sont déjà des lignes datées,
citées et retirables : il n'y a pas de champ à faire cliqueter.

⚠️ **La lane CUISINE du 2026-09-03 (A2) veut DÉRIVER ces trois champs d'un `cooking_style`.**
C'est la collision **C1** du §9, à arbitrer **avant le lot B**. Ce paragraphe décrit le modèle
si A2 dérive **à l'écriture** (recommandé) ; si A2 dérive **à la lecture**, les trois lignes de
cuisine de ce tableau changent de lecteur et ce document doit être ré-amendé.

⛔ **`hunger_between_meals` et `could_finish` n'ont pas de lecteur** — `emphasisHint` a zéro
appelant, et `plan_feedback.ts` l'avoue en toutes lettres. Règle fondatrice : **elles sont
retirées au lot B**, sauf si le lot B nomme un lecteur vivant et le câble dans le même lot.
`hunger_between_meals` est en plus une question que le plancher TCA retire (`RESTRICTED_OUT`) ;
son retrait ne change rien sous plancher, et il ne touche pas à `questionsFor` sous plancher
(l'indiscernabilité reste tenue par les questions communes).

### 2.5 L'encart « pour le prochain plan »

- **Contenu** : ce que le retour sur brouillon a classé `next_plan` — le magasin
  `practical_constraints.retained_next_plan`, forme `[{item, anchor}]` **inchangée**. Une
  envie (« des fajitas cette semaine »), une exclusion datée par la phrase elle-même (« pas de
  poisson cette semaine »). L'encart **ne trie pas par famille** : `craving` cesse d'être une
  section.
- **Visible seulement s'il est non vide.** Un encart vide n'existe pas à l'écran.
- **Il meurt quand le plan suivant est VALIDÉ**, pas au calendrier.
  *Plan suivant* = tout plan de `student_generated_meals` du même `user_id` dont
  `validated_at` est **postérieur à l'instant d'écriture** de la ligne d'encart — l'enveloppe
  stocke cet instant (`written_at`, lot A). `isNextPlanItemAlive(entry, plansValidés)` :
  **vivant** sans plan validé, **mort** dès qu'un `validated_at > written_at`, **vivant** si
  toutes les validations sont antérieures. Une entrée d'avant le lot A n'a pas de
  `written_at` : pour elle, morte seulement si un plan a été validé un **jour strictement
  postérieur** à `item.at` (prudent : le même jour la garde). ⚠️ Pourquoi un instant et pas un
  jour : un plan composé le matin, annoté à midi et validé le soir porte trois moments du même
  jour ; comparer des jours ne dit pas si la validation est venue après la note. L'`anchor`
  reste stocké **pour l'affichage** (« pour la semaine du … ») ; il n'est plus une règle de vie.
  ⚠️ La validation n'a aujourd'hui qu'un appelant (`TakeTheHandCard`, plans `personal` d'un
  foyer) : pour une personne seule, l'encart ne meurt qu'à la main tant que ce bouton n'existe
  pas sur son plan. Nommé, pas réparé ici.
- **Si aucun plan n'est jamais validé**, l'encart reste. Il se retire à la main (« enlever »),
  et c'est voulu : *une envie qui disparaît sans prévenir se lit comme une perte de données.*
- ⚠️ **Ce que ça change par rapport au 2026-08-18** (« jusqu'à la fin de la semaine ancrée »,
  annexe A.4) : « ancre + 6 » ne tenait pas — un plan de deux jours régénéré trois fois dans la
  semaine gardait l'envie à chaque fois, et un plan validé le samedi pour la semaine suivante
  la perdait le lundi. **La validation est le fait que la personne produit** ; c'est lui qui
  ferme. Les trois raisons de 2026-08-18 restent vraies : l'ancre reste une donnée (jamais un
  état à invalider), la date reste affichable (« jusqu'à ce que ton prochain plan soit
  validé »), et régénérer deux fois **sans valider** garde l'envie. L'option écartée
  « exactement une génération » reste écartée pour les mêmes raisons.

### 2.6 Ce qu'on ferme, et quand

| fermé | lot | ce qui le remplace |
|---|---|---|
| le pont chat → `food_preferences` (⟳ 06/09 : « Garder » réécrit vers les lignes retenues, voir §2.1) : « Keep », `FoodPreferencesCard` sur `/app/plan`, `foodPreferencesForPrompt` / `reconcileFoodPreferencesFor` dans les deux générateurs et `household_voices_io.ts` | **C** | rien : le chat renvoie (M1). `food_preferences` reste **lisible** sur la carte (« Anciennes notes ») pour être rangé ou enlevé, et **n'atteint plus le prompt** ; `grep -rn memory_items supabase/functions/generate-*` rend zéro, tenu par un test |
| `rhythm.set`, `logistics.set` comme familles retenues | déjà M5 ; le lecteur (`rhythmOverlayFor`, `logisticsOverlayFor`) reste **un cycle** avec un compteur `served`, puis se retire s'il rend 0 | le bilan écrit le champ ; la carte ne les propose plus au « Ranger dans » |
| `craving` comme **section** de la carte | **D** | une ligne d'encart |
| `method.*` comme **sections** séparées | **D** | une préférence, au même rang qu'un aliment |
| « Aliments refusés » du dialogue foyer → `household_food_restrictions` | **C** | un `food.exclude` `member:<uuid>` `source=written` dans `retained_items` ; la table reste pour **l'interdit parental** seul (§2.7) |
| la déduction `cooked → cooking_time_min / recipe_difficulty` | **B** | deux questions posées (`speed`, `difficulty`) |
| `hunger_between_meals`, `could_finish` | **B** | rien — pas de lecteur |

### 2.7 Les deux autorités, et la restriction parentale (PIVOT-FOYER §8.5, inchangé)

Une restriction parentale (« pas de Nutella pour Léa ») **n'est pas une préférence** : c'est un
acte du compte maître, **domestique**, sur un mineur, en mode famille seulement (§8.5 règle 1 —
le défaut est *restriction impossible sur un majeur*). Elle garde sa table
(`household_food_restrictions`) et son verrou (`household_restriction_lock.ts`, règle 4 : Sophia
ne porte jamais une décision domestique comme la sienne). Elle change de nom et de place au
lot C : « Interdit dans ce foyer » / « Not available in this household », visible **uniquement
en mode famille et sur un mineur** ; sur la carte de la personne restreinte, elle se lit
« pas disponible dans ce foyer, décidé par <prénom> » (règle 3) — jamais comme un goût, jamais
attribuée à Sophia.

⚠️ Les 7 lignes locales de `household_food_restrictions` ne se migrent pas automatiquement :
le sens (goût ou interdit) n'est pas déductible. Le lot C les liste ; l'humain tranche.

### 2.8 Le doute ne bloque rien, et l'écriture se dit tout de suite (2026-09-04)

Dans un foyer, **l'ambiguïté est le cas normal** : « ma fille » avec deux filles, « j'ai pas
aimé la viande » avec deux viandes au plan. Jusqu'ici le produit y répondait par le **silence** —
le classifieur jetait l'entrée, sans motif, et rien ne pouvait relancer. Deux règles remplacent
ce silence.

**① Une question, dans le chat, qui ne retient rien.** Quand le classifieur ne peut pas trancher
**qui** (`about: who`), **quoi** (`about: what`) ou — ⟳ 2026-09-05 — **la portée d'une règle de
régime** (`about: scope`), il range l'entrée dans une cinquième liste, `clarify`, avec **les
candidats copiés** (des `member_id` du roster, des aliments **du plan**, ou les deux jetons
`always` / `sometimes`).
Le plan se compose quand même — il n'attend **jamais** une réponse. Une bulle part avec les
prénoms (ou les aliments) en boutons, plus un échappement (« Personne de la liste » /
« Aucun de ceux-là ») :

| | ce que ça donne |
|---|---|
| **un tap** | la ligne s'écrit, avec le producteur `draft_note` et **la phrase de la personne** en citation |
| **l'échappement** | rien n'est écrit, et la ligne passe `declined` — ce qui la **distingue du silence** |
| **le silence** | rien n'est écrit ; la ligne expire à 48 h, comptée par la balayeuse du pouls |

> ⛔ **PÉRIMÉ — 2026-09-09.** La question `scope` est supprimée avec le canal sécurité :
> il n'y a plus de destination « toujours ». Une phrase de régime est une note (avec son
> `when` si elle en porte un) ou une préférence. Le texte ci-dessous est conservé pour la
> mesure qu'il porte, pas pour la conduite qu'il décrit.

⟳ **2026-09-05 — la portée (`scope`).** « On mange végétarien le lundi soir » avait été rangé en
régime **strict** de la titulaire, qui gouverne tout le foyer : quatre omnivores ont mangé
végétarien à tous les repas (campagne du 2026-09-04, §8.1). Trois cas, trois sorties, et le
classifieur ne devine jamais entre elles :

| la phrase | ce que c'est | où ça va |
|---|---|---|
| « je suis végétarienne », « mon fils est vegan » | un régime, pour de bon | **sécurité** (`safety`), comme avant |
| « on mange végétarien **le lundi soir** », « sans viande **au dîner** » | un **rythme** — un jour, un moment, une fréquence | **③ note**, avec son `when` ; jamais une contrainte |
| « on mange végétarien », « on essaie de manger vegan », « on est plutôt végé » | une règle **sans portée dite** | **question `scope`** : « ça vaut pour tous tes repas, tout le temps ? » — *Oui, tous mes repas* ⇒ sécurité (stricte) · *Non, pas toujours* ⇒ ③ note · *Passer* ⇒ rien |

Tant que la réponse n'est pas là, **rien** n'est écrit — ni contrainte ni note : la déclaration
voyage dans `pending.safety` de la ligne `memory_clarifications`, et c'est le tap qui l'écrit par
la **même porte** que la liste `safety` (`persistSafetyDeclarations` — la ligne de la personne,
ou la RPC `_for` d'une bouche). Une réponse « toujours » n'ouvre pas la carte : la contrainte vit
dans la fiche santé, et l'accusé le dit. ⛔ Aucun matcher de texte ne décide de la portée : le
modèle juge, la relecture vérifie la **forme** (une déclaration relisable) et **impose** les deux
jetons.

⛔ **CE TAP NE FAIT PAS ÉCRIRE LE CHAT** (§2.1 tient : deux sources, le chat n'en est pas une).
Il complète le **slot manquant** d'une entrée que la personne a écrite elle-même, sur son
brouillon ou dans le champ libre de son bilan. Le contenu vient d'elle ; le tap ne fournit que
« laquelle ».

Bornes, parce qu'une question est une sollicitation : **une seule ouverte** à la fois par
personne (index unique) ; **deux par jour local** au plus (`MEMORY_CLARIFICATION_DAILY_CAP`,
le jour typique portant deux gestes — le bilan de l'ancien plan, puis le nouveau plan) ; une
seule question par passe, même si le classifieur en propose deux (la seconde est journalisée,
pas posée). Ces bulles répondent à un geste : elles portent `isReply`, donc elles passent le
mode silencieux — couper la parole à quelqu'un qui vient d'écrire serait le punir d'avoir écrit.

**② L'écriture se dit à l'instant où elle se fait.** Chaque fois qu'une ligne entre en mémoire
par l'une des deux sources, une bulle le dit tout de suite — « J'ai noté pour Tom : « pas de
poisson » » — avec **un seul bouton, « Voir »**, qui ouvre « Ce que Sophia sait » sur le bloc
concerné, ligne surlignée.

⟳ **2026-09-05 — et l'échec d'une ligne de SÉCURITÉ se dit aussi.** Du 2026-09-01 au 2026-09-05,
le régime ou l'allergie d'une **bouche** dit dans une note (« Tom est allergique aux arachides »)
n'a **jamais** été écrit : les RPC d'écran (`keel_household_set_member_diet`,
`keel_household_add_allergy`) lisent `auth.uid()`, NULL sous `service_role`, et rendaient
`not_authenticated` à chaque appel — compté `failed=1` dans un journal, et rien d'autre. Deux
réparations : les variantes serveur `…_for(p_user, …)` (migration `20260905180000`,
`service_role` seul, mêmes refus que l'écran), et une bulle « Je n'ai pas pu enregistrer
l'allergie de Tom : peanut. Ajoute-le depuis la fiche du foyer » quand la base refuse encore
(`notifySafetyNotWritten`), envoyée **avant** l'accusé et la question.

⚠️ **« VOIR », ET PAS « ANNULER ».** Un « Annuler » dans le chat serait un **second** endroit qui
écrit dans la mémoire, avec ses propres cas (annuler quoi, si la ligne a été éditée entre-temps
depuis un autre onglet ?). La carte sait déjà modifier et enlever, et elle gère la concurrence.
**Le chat dit, l'écran fait.**

Conséquence directe sur le soir : **le récap du pouls ne redit plus la mémoire** (c'était un
doublon à six heures de distance du geste, sans lien visible avec lui et sans action). Il ne
garde que la moitié **sécurité** — qui, elle, est écrite sans accord synchrone et doit donc être
annoncée quoi qu'il arrive (arbitrage du 2026-09-01).

---

## 3. La forme écrite

Chaque élément retenu, quel que soit son producteur :

```jsonc
{
  "kind": "food.exclude",         // liste fermée, §2 axe 1
  "scope": "durable",             // durable | next_plan
  "subject": "household",         // household | member:<uuid>
  "text": "les rochers coco",     // CE QUE LA PERSONNE VOIT ET PEUT ÉDITER
  "value": null,                  // structuré, quand le kind en a un (§4)
  "source": "questionnaire",      // written | questionnaire | draft_note
                                  //   + `conversation`, LU mais plus produit (§5)
  "at": "2026-08-18",             // le jour où ça a été dit
  "item": "…uuid…",               // le souvenir d'origine — "" si écrit à la main
  "confidence": 0.82,             // seulement si source = conversation (lignes anciennes)
  "quote": "…"                    // LOT M2 — la phrase de la personne qui a
                                  //   causé cette ligne. `null` pour `written`
                                  //   et pour les lignes d'avant M2.
}
```

> ### ⛔ `quote` — SANS ELLE, « DÉFAIRE » EST UN PARI (lot M2, 2026-09-01)
>
> Une ligne qui dit *« Poulet — aliments évités »* et rien d'autre pose à la
> personne une question à laquelle elle ne peut pas répondre : enlever, c'est
> peut-être défaire une erreur du produit, peut-être perdre une chose qu'elle a
> vraiment demandée trois semaines plus tôt. **Devant ce doute, on ne touche à
> rien — et le magasin ne décroît jamais.** C'est le mécanisme exact de la
> boule de neige.
>
> Avec la citation, la ligne devient *« parce que tu as dit “trop de poulet
> cette semaine” »*, et le geste est évident dans les deux sens. **C'est aussi
> ce qui donne la traçabilité gratuitement** : « pourquoi il n'y a pas de
> poulet ? » se répond en montrant un écran.
>
> **Les mots de la personne, verbatim.** Jamais une reformulation : une
> citation reformulée est une citation fausse, et elle est pire que pas de
> citation — elle lui fait croire qu'elle a dit une chose qu'elle n'a pas dite.
> · retour sur brouillon → la note telle qu'elle l'a tapée ;
> · bilan de fin de plan → *« la question qu'elle a lue » → « la réponse
> qu'elle a cliquée »*, dans sa langue, depuis `QUESTION_LABELS` /
> `OPTION_LABELS`. Le bilan répond par des JETONS (`too_much`) : citer le jeton
> ne citerait personne.
>
> ⚠️ **La citation est FIGÉE dans la langue du moment.** Elle n'est pas
> retraduite si la personne change de langue plus tard : ce sont les mots
> qu'elle a réellement lus et cliqués, et les traduire les falsifierait.
>
> ⛔ **L'obligation est à la PORTE D'ÉCRITURE, pas au parseur.**
> `parseRetainedItem` accepte `null` — sinon le lot effacerait toutes les
> lignes d'avant lui. C'est `persistRetainedItemsFor` qui refuse une écriture
> serveur non citée (`unquoted`, le 5ᵉ motif) : **rien de neuf n'entre sans sa
> cause, rien d'ancien ne disparaît.**
>
> ⛔ **Une citation sur une ligne `written` est un REFUS.** Son `text` EST sa
> phrase. Et surtout : `canProduce("written", …)` autorise TOUT, donc un
> producteur serveur qui se déclarerait `written` contournerait la matrice
> entière par un seul mot — sa citation le trahit.

**`text` est obligatoire et il est la vérité affichée.** Une entrée dont on ne
saurait pas écrire la phrase que la personne lira ne s'écrit pas — c'est ce qui
rend la promesse « rien d'opaque » vérifiable ligne à ligne.

**`item` vide protège l'entrée.** C'est déjà la règle en place : une ligne sans
`item` est réputée écrite par la personne, et le memorizer ne peut pas la retirer.
Elle lui appartient.

**`source` ne se déduit jamais d'un vide.** Le dépôt le dit déjà : l'absence
d'origine est ambiguë (« tapée à la main » autant que « lien perdu »), et s'en
servir comme signature rendrait les deux indiscernables pour toujours. On doit
pouvoir dire « ça, c'est toi qui l'as écrit » plutôt que « ça, je l'ai déduit de
ce que tu m'as dit mardi ».

### La forme d'une note de ③ — « ce que Sophia sait » (lot A)

```jsonc
{
  "text": "Léa a danse le mardi soir : une grosse part ce soir-là",
  "at": "2026-09-03",
  "source": "draft_note",              // ou "questionnaire" — JAMAIS "written" (§4-ter)
  "quote": "ma fille a danse le mardi soir, il lui faut un vrai repas",
  "subject": "member:<uuid>",          // ou "household" — REQUIS, jamais un prénom
  "when": { "weekday": "tue", "slot": "dinner" }   // optionnel ; `weekday` ∈ DAY_TOKENS,
                                                   // `slot` ∈ RHYTHM_OCCASIONS ; ou null
}
```

Plafond **cinq par sujet**. Doublon par identité de contenu (`contentIdentityOf`), refusé.
Une ligne difforme tombe seule. Le générateur ne reçoit que `text` (et `when`, rendu au jour
nommé) — ni la citation, ni la date, ni la source.

---

## 4. Le champ `value`, par famille

Seules trois familles en ont un ; les autres se contentent de leur `text`.

| `kind` | `value` |
|---|---|
| `portion.adjust` | `{ "direction": "down" \| "up", "magnitude": "slight" \| "clear" }` |
| `rhythm.set` | `{ "occasion": "breakfast"…"before_bed", "present": true \| false }` |
| `logistics.set` | `{ "field": "cook_days" \| "cooking_time_min" \| "recipe_difficulty" \| "variety" \| "budget_amount", "value": … }` |

⛔ **Aucun gramme, aucune calorie dans `portion.adjust`.** Une personne dit « trop
gros », pas « −80 g ». Traduire son adverbe en nombre à la classification serait
fabriquer une précision qu'elle n'a pas donnée — et le produit refuse d'afficher
des nombres à qui n'en a pas demandé. C'est l'enveloppe qui traduit, en aval, où
le plancher TCA s'applique.

---

## 5. Qui a le droit d'écrire quoi — la matrice des DEUX prompts

> ### ⛔ LA LIGNE ③ A ÉTÉ VIDÉE LE 2026-09-01 — lot M1
>
> **Le memorizer n'est plus un producteur.** Le chat ne classe plus rien : il
> **renvoie** vers le champ où la chose se pose. Autorité de la décision :
> `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §2.3 et §3.5 M1, qui contredit
> délibérément ce document sur ce point et le dit en toutes lettres.
>
> **Le motif, et ce n'est pas la qualité du classement.** Le modèle classait
> bien. Une phrase de chat n'a pas de **dénominateur** : « c'était trop » ne dit
> ni de quoi ni pour qui, « j'aime pas trop ça » ne nomme pas un plat. Le
> raisonnement du point ② ci-dessous — *une mesure a besoin d'un sujet* — vaut
> en réalité de **chaque** famille, pas seulement de `portion.adjust`. Et comme
> la règle du dépôt interdit de réécrire ce que quelqu'un a renseigné, le
> magasin que la conversation alimentait ne pouvait que **grandir**.
>
> **Ce que ça coûte, écrit ici pour que personne ne le redécouvre :** le chat
> cesse d'apprendre. *« Plus jamais de topinambour »* dit en passant demande
> désormais un geste. C'est un vrai coût, assumé : on perd de la captation
> passive, on gagne un système dont chaque décision s'explique en montrant un
> écran. Le cas de la personne qui ne suit jamais la redirection **reste
> ouvert** — c'est le seul endroit où ce design recule (design §2.10).
>
> ⚠️ **Le producteur est retiré, la `source` ne l'est pas.** Des lignes portent
> `source: "conversation"` en base : elles restent **lues**, visibles sur la
> carte avec leur origine, et retirables par la personne. C'est
> `canHold`/`couldProduce` (`retained_item.ts`) qui tient cette moitié.
> Supprimer la `source` les ferait disparaître sans un mot.
>
> ⛔ **Ne « rebranche » pas une famille par symétrie.** Une règle avec une
> exception n'est pas une règle : si le chat peut réécrire un aliment évité,
> pourquoi pas l'équipement — et six mois plus tard il écrit tout à nouveau,
> un bouton à la fois, sans que personne ne voie qu'on a reconstruit ce qu'on
> venait de supprimer.

C'est la partie que les prompts recopient.

> ### ⚠️ LA MATRICE A ÉTÉ AMENDÉE LE 2026-09-03 — deux sources, trois destinations
>
> Les colonnes ne sont plus les huit familles : ce sont les **trois destinations** du §2.2
> plus l'encart. Deux cellules changent de sens, et c'est écrit :
> · **le retour sur brouillon écrit du DURABLE** pour ① — « mon fils n'aime pas le poisson »
>   n'est pas pour une semaine (renverse le point ① de « Pourquoi ces trois interdits »,
>   ci-dessous, qui reste en place avec sa note) ;
> · **le retour sur brouillon écrit dans ③** — le mémo a enfin son producteur (§4-ter).
> Les familles `rhythm.set`, `logistics.set`, `craving` ne sont plus des colonnes : le
> contenu d'un « trop long » va nulle part (un indice ne se bouge pas depuis un texte,
> §2.3), celui d'une envie va dans l'encart.

| | **① `food.*` `method.*`** | **② `portion.adjust`** et les trois champs de cuisine | **③ note (`memo`)** | **encart `next_plan`** |
|---|---|---|---|---|
| **① retour sur le brouillon** | ✅ **`durable`** *(lot A — nouveau)*, sujet obligatoire quand la phrase nomme quelqu'un, **abstention** sinon | ⛔ un indice ne se bouge pas depuis un texte → `nothing_to_file{gate:index}` | ✅ *(lot A — nouveau)* : plafond **5 par personne**, `subject` requis, `when` optionnel, `quote` = la note | ✅ ce que la phrase date elle-même (« cette semaine ») et les envies |
| **② bilan de fin de plan** | ✅ `durable` — `never_again` / `make_again` deviennent des **aliments** proposés depuis les plats du plan, avec sujet *(lot B)* | ✅ **seul producteur** de `portion.adjust` ; `difficulty`, `speed`, `enough_variety` écrivent **le champ + une ligne de journal** citant la question *(lot B)* | ✅ via `anything_else` → **le classifieur de ①**, jamais un second *(lot B)* | ⛔ on ne demande pas une envie de la semaine prochaine dans un bilan de la semaine passée |
| **③ ~~conversation~~ (M1)** | ⛔ renvoie | ⛔ renvoie au bilan | ⛔ | ⛔ |
| **④ `written` — la personne, sur sa carte** | ✅ | ✅ | ⛔ `memo.ts` refuse `written` : ce qu'elle tape a une famille (①) ou un champ | ✅ |

> ### ⛔ `rhythm.set` ET `logistics.set` ONT QUITTÉ LE MAGASIN — lot M5, 2026-09-01
>
> Ils ne se RETIENNENT plus : ils **changent le champ que la personne voit** dans
> ses réglages (`_shared/keel/field_change.ts`, port
> `keel_write_field_changes_for`).
>
> **Le défaut fermé, et il était muet.** Un `logistics.set` retenu n'écrivait
> rien : les deux générateurs le posaient **en mémoire, à la lecture**, juste
> avant de composer (`logisticsOverlayFor`). La personne ouvrait ses réglages, y
> lisait **45 min**, et son plan était composé sur **30**. Aucun écran ne le
> disait, rien ne pouvait le défaire, et la seule façon de le découvrir était de
> relire deux prompts côte à côte. **Une décision du produit qu'aucun écran ne
> montrait.**
>
> **Écrire un champ que quelqu'un a rempli n'est acceptable qu'à trois
> conditions**, et les trois sont livrées :
> ① ça se **voit** — le champ, et le fil « ce qui vient de changer » ;
> ② ça se **justifie** — la citation (lot M2) ;
> ③ ça se **défait** — `previous`, la valeur d'avant, en un clic.
>
> ⚠️ **Écrire dans un champ FORCE le journal, et ce n'est pas un choix
> d'architecture.** Le fil de M2 est une VUE sur les lignes retenues : « défaire »
> y est trivial, la ligne se retire. Un scalaire n'a pas cette propriété —
> `cooking_time_min: 30` ne se retire pas, il faut savoir qu'il valait **45**.
> D'où `practical_constraints.field_changes`, **plafonné à 20** : c'est la seule
> chose de ce chantier qui grossisse sans que la personne l'ait demandé.
>
> ⛔ **Le journal ne part JAMAIS au modèle** (`constraintsForPrompt` le retire).
> Ce qu'il journalise est déjà servi — ce sont les champs eux-mêmes — et il porte
> l'ANCIENNE valeur : la donner inviterait le modèle à composer entre les deux.
>
> ⚠️ **Les lignes déjà en base restent LUES.** `canHold` porte une liste de
> **cellules retirées** (`RETIRED_CELLS`) à côté des sources retirées de M1 : un
> producteur vivant peut perdre une famille sans que son passé s'efface. Sans
> elle, fermer la cellule aurait fait tomber au parseur la ligne
> `questionnaire × logistics.set` mesurée en base au moment du lot — disparue de
> la carte entre deux chargements, sans un mot.
>
> ⛔ **Ce qui n'a PAS bougé, et pourquoi.** `food.*` / `method.*` restent dans le
> magasin structuré. Le design les voulait « proposés à un champ » ; ce champ
> **n'existe pas** sous forme structurée. `food_preferences` est une liste de
> phrases plates, sans polarité, sans sujet, sans date — y verser des items
> structurés perdrait `kind`, `subject` et `at`, et alimenterait exactement la
> contradiction que le design cite comme le défaut *(« Aime le brocoli s'il est
> rôti » et « N'aime pas le brocoli » dans le même prompt, toujours en base)*.
> L'autre destination possible, `household_food_restrictions`, est un acte
> **attribué** (« la maison ne sert pas X à Y ») qu'une extraction ne devrait pas
> décider seule. **C'est une décision produit à prendre, pas un reste de lot.**

> ⚠️ **TRANCHÉ LE 2026-09-03 (§2.6, §2.7).** Le goût d'une bouche va en `food.exclude`
> `member:<uuid>` `source=written` dans le magasin structuré (le dialogue l'écrit au lot C) ;
> `household_food_restrictions` reste **l'interdit parental seul**, en mode famille, sur un
> mineur. `food_preferences` n'est plus une destination : « Anciennes notes », hors prompt.

### Pourquoi ces trois interdits

**① Le brouillon ne produit pas de durable par défaut.** Un retour sur un
brouillon parle de CE plan (« pas de poisson cette semaine »). Le promouvoir en
permanent transformerait une humeur de mardi en règle de vie. La personne peut
toujours le rendre durable depuis la carte, explicitement.

> ⚠️ **RENVERSÉ LE 2026-09-03 (§2.2, §5 matrice).** Le brouillon **produit du durable** pour
> les préférences. Le motif d'origine (« une humeur de mardi transformée en règle de vie »)
> confondait deux choses que la phrase elle-même sépare : « pas de poisson **cette semaine** »
> est daté par ses mots et va dans l'encart ; « mon fils n'aime pas le poisson » ne l'est pas,
> et le ranger pour une semaine obligeait la personne à le redire à chaque plan — mesuré sur
> le banc du 2026-09-01. Le classifieur lit la date **dans la phrase**, et s'abstient quand il
> ne sait pas.

**② Le questionnaire est le SEUL producteur de `portion.adjust`, et c'est le point
central.** Une mesure a besoin d'un sujet, et **la conversation ne sait pas
l'attribuer** : « les portions étaient trop grosses », dans un foyer de quatre, ne
désigne personne. Le questionnaire, lui, pose la question avec la liste du foyer
sous les yeux — c'est une question fermée, pas une inférence. Fiable, et
attribuable.

**③ Quand le dispatcher détecte quoi que ce soit en conversation, il ne classe
pas : il renvoie.** Une phrase, une seule, qui dit **qu'on n'a rien rangé** et
**où ça se pose**. Cinq destinations, chacune un écran qui existe : le bilan de
fin de plan pour une part, « Ce que Sophia sait de toi » pour un aliment, les
réglages pour l'équipement, le rythme et la logistique.

⛔ **ET LA FORMULATION EST UNE GARDE, PAS UN DÉTAIL.** Sophia ne doit **jamais**
laisser croire que c'est enregistré : pas de « je le note », pas de « j'en tiens
compte », pas de « c'est bon ». C'est exactement la phrase qui a coûté cher à ce
dépôt — `student_safety_constraints` avait six lecteurs armés et zéro écrivain,
et quelqu'un qui déclarait une anaphylaxie recevait *« Noted, I'll keep it in
mind »* pendant que la base restait vide. **Un lecteur sans écrivain ressemble
trait pour trait à une fonctionnalité qui marche ; ici, le mensonge était une
phrase rassurante.** La règle est tenue par un test
(`conversation_redirect_test.ts`), dans les deux langues, sur les dix phrases.

⚠️ **CE QUI RESTE : le chemin PLAT, et il propose sans jamais ranger.**
`memory_items` alimente encore la carte des propositions
(`FoodPreferencesCard`), et **rien n'entre sans un « Keep »** : la personne tape,
sinon rien n'est écrit. C'est un magasin **probabiliste** (confiance, ranking,
statut `candidate`), et la confirmation est ce qui transforme une inférence en
fait déclaré. Le seuil de promotion reste **0,70**, là où le memorizer
s'autorise à créer dès 0,55. Ce chemin-là n'est pas visé par M1 — il ne viole pas
« le chat n'écrit pas », puisqu'il ne fait que **proposer, à l'écran**. C'est le
lot **M5** qui le fera écrire dans les CHAMPS plutôt que dans un magasin à part.

---

## 4-bis. `portion.adjust` — une POSITION qui converge (lot M3, 2026-09-01)

> ### ⛔ CE LOT NE ROUVRE PAS « LE CUMUL EST REFUSÉ » — IL Y RÉPOND
>
> `meal_envelope.ts` portait un refus explicite, et il faut le lire avant celui-ci :
> *« un facteur qui se compose, c'est une dérive vers le bas sans borne : trois
> "trop gros" donneraient ×0,729 au lieu de ×0,90 […] et le plafond qu'il
> faudrait inventer pour borner la somme serait exactement la borne fabriquée que
> cette cicatrice interdit. »*
>
> **Ce refus est juste, et il porte sur des FACTEURS QUI SE COMPOSENT.** Un
> indice n'en est pas un : on accumule des **CRANS** sur une échelle bornée, et
> le facteur sort de la position finale en **une** opération. ×0,729 reste
> inatteignable — non parce qu'on l'a plafonné, mais parce que **rien ne se
> multiplie**.
>
> ⛔ **Et la borne n'est pas fabriquée, c'est la condition de cette réponse.**
> `INDEX_MAX × PORTION_ADJUST_STEP.slight` = 2 × 0,05 = **0,10**, c'est-à-dire
> exactement `PORTION_ADJUST_STEP.clear` — le pire cas que le module servait
> déjà. L'indice n'atteint **rien de neuf** : il rend le chemin progressif et
> réversible au lieu d'un saut suivi d'un oubli. Un test épingle cette égalité.
>
> ### Le défaut fermé
>
> « Le dernier gagne » est **sans état**. La personne dit « un peu trop » (−5 %),
> le plan suivant est composé à −5 %, elle redit « un peu trop » **du plan déjà
> corrigé**, et on lui redonne le même −5 %. Elle n'avançait jamais. Mesuré :
>
> | réponses | position | enveloppe |
> |---|---|---|
> | aucune | 0 | 2442–2700 |
> | « un peu trop » | −1 | 2320–2565 |
> | deux fois | −2 | 2198–2430 |
> | quatre fois | −2 *(brut −4)* | 2198–2430 — **la borne mord** |
> | « trop » puis « pas assez » | 0 | 2442–2700 — **ça revient** |
>
> ### Ni table ni colonne
>
> Les `portion.adjust` **sont** l'historique : déjà écrits, déjà datés, déjà
> visibles sur la carte avec leur citation (M2), déjà retirables un par un. La
> position s'en dérive. Conséquence directe et bonne : **retirer une ligne
> déplace l'indice** — la personne peut défaire une réponse, pas seulement en
> ajouter une.
>
> ⚠️ **« Ce qu'il fallait » ne bouge PAS l'indice, et c'est correct.** La
> question porte sur le plan qu'elle vient d'avoir — **déjà composé avec
> l'indice**. « Ce qu'il fallait » dit donc « la visée actuelle est bonne », pas
> « reviens au milieu ». La convergence vient des réponses opposées, qui
> s'annulent.
>
> ⛔ **Et une question non posée ne bouge rien non plus.** `portions` est retirée
> sous plancher TCA (`RESTRICTED_OUT`) : « ce qu'il fallait » et « la question
> n'a pas été posée » rendent le **même** `null` dans `effectOf`. Les confondre
> ferait bouger un indice sur la population la plus vulnérable, à partir d'une
> question qu'on a délibérément décidé de ne pas lui poser. Le module ne voit
> jamais l'ambiguïté : il ne lit que des `portion.adjust` écrits, et sous
> plancher il n'en existe aucun.
>
> ### ⚠️ La copie d'écran mentait — dans l'autre sens
>
> `known.section.portions.not_wired` annonçait *« les ajustements de portion
> n'atteignent pas encore le calcul des parts »*. C'était **faux depuis le lot
> 1G** : l'enveloppe les reçoit. Son propre commentaire disait qu'elle devait
> disparaître le jour où elle cesserait d'être vraie. Elle est remplacée par la
> **position**, par bouche — ce que le générateur fait vraiment de ces réponses.
>
> ### ⛔ Les trois autres indices ne sont PAS livrés, et le motif est net
>
> Le design en nomme quatre : rapidité, compétence, variété, portions. Seules les
> **portions** sont livrées, parce que ce sont les seules dont le lot **M5 n'a
> pas déjà décidé autrement**. M5 fait écrire « c'était trop long » dans
> `cooking_time_min` ; M3 dirait qu'un **degré** va dans un indice, pas dans un
> champ (§1 règle 2). **Les deux ne peuvent pas coexister sur le même champ** —
> ce serait compter deux fois la même réponse. Trancher demande une décision
> produit : le champ **cliquette** vers le bas et ne remonte que si la personne
> le remarque ; l'indice est borné et converge. Le design dit l'indice ; ce
> n'est pas à un lot de le décider en passant.

> ⚠️ **TRANCHÉ LE 2026-09-03 (§2.4).** M5 est confirmé : les trois indices de cuisine sont le
> **champ** que la personne voit, bougé d'un cran par une question fermée du bilan
> (`difficulty`, `speed`, `enough_variety`), avec une ligne de journal citant la question. La
> position dérivée (M3) reste réservée à la portion. Livraison au lot B.

---

## 4-ter. Le mémo — cinq lignes, pour ce qu'aucune famille ne porte (lot M4)

> ### ⛔ C'est la pièce la plus dangereuse du chantier, et il faut le dire
>
> *« Un champ texte CACHÉ, SANS PLAFOND, INJECTÉ DANS CHAQUE PROMPT, c'est
> exactement le magasin qu'on supprime, avec un autre chapeau. Et c'est la chose
> la plus difficile à déboguer du produit : le jour où un plan part de travers,
> personne ne peut dire pourquoi. »*
>
> Les trois mots de cette phrase sont les trois gardes, et chacune est
> **vérifiée** plutôt que promise :
> · **caché** → il se **voit**, sur la carte, avec sa cause (M2) ;
> · **sans plafond** → **cinq** lignes, et la sixième est **refusée** ;
> · **chaque prompt** → il y va — c'est sa raison d'être — mais c'est le seul
> bloc de texte libre sans famille que le produit injecte, et c'est pour ça
> qu'il est court.
>
> ### ⛔ Le plafond REFUSE. Il ne fait pas tomber la plus ancienne.
>
> *« Un plafond force une décision. »* Faire tomber la plus ancienne serait une
> **troisième** voie, pire que les deux : la consigne disparaîtrait sans que
> personne ne l'ait décidé, et la personne découvrirait qu'une chose qu'elle
> avait demandée a cessé d'agir, sans un mot.
>
> ⚠️ **C'est la différence assumée avec le journal de M5**, qui lui jette le plus
> ancien. Le journal est une **trace** de ce qui a eu lieu ; le mémo est une
> **consigne** qui agit. Perdre une trace coûte un « défaire » ; perdre une
> consigne change l'assiette.
>
> ### Les trois conditions, et laquelle est vérifiable
>
> **factuelle** · **actionnable** · **inexprimable dans un champ ou un indice**.
>
> ⛔ **Les deux premières sont des consignes de prompt, et c'est avoué.** Le
> socle ne sait pas lire « factuel » ; les prétendre tenues en code serait la
> ceinture armée sur un coffre vide.
>
> ⚠️ **La troisième est structurelle, et c'est la seule qui se vérifie** : le
> mémo est le **résidu** d'une classification — ce à quoi le producteur n'a su
> donner aucune famille.
>
> ⚠️ **Et « 100 % sûr » n'est pas un critère** : c'est un jugement que l'IA porte
> sur elle-même. Aucune confiance n'entre donc ici — ni champ, ni seuil. Une
> ligne est dedans ou dehors.
>
> ### Ce qui n'est PAS encore livré
>
> ⛔ **Le producteur automatique.** Le mémo est lu par les deux générateurs,
> visible, plafonné, cité et retirable ; ce qui manque est le classifieur qui le
> REMPLIT — le résidu du retour sur brouillon. Sans lui, seul un écrivain direct
> peut y poser une ligne. **C'est nommé plutôt que déguisé** : un mémo sans
> producteur n'est pas un mémo cassé, c'est un mémo vide — et il ne peut rien
> casser tant qu'il l'est.

> ⚠️ **LE PRODUCTEUR ARRIVE AU LOT A (2026-09-03, §2.2 ③).** Le mémo devient la destination
> « Ce que Sophia sait » : une ligne gagne un `subject` (`member:<uuid>` ou `household`, requis),
> un `when` optionnel (`{weekday, slot}`), et le plafond passe à **cinq par personne**. Le
> producteur est le classifieur du retour sur brouillon, et `anything_else` du bilan y
> repasse. Les deux générateurs le lisent **par sujet**, au jour nommé. Les gardes de ce
> paragraphe (visible, plafonné, cité, refus au plafond, jamais `written`) ne bougent pas.

---

## 5-bis. La session de cuisine — ce que la coche constate déjà

> ### ⛔ `cooking_session_states` À ZÉRO N'ÉTAIT PAS UNE CHAÎNE CASSÉE (lot M8, 2026-09-01)
>
> Le diagnostic évident était faux, et il faut l'écrire pour que personne ne le
> refasse. **La chaîne marche** — mesurée de bout en bout sur un plan réel :
> décoche → formulaire d'accident → « pas eu le temps » → la question sort → la
> réponse s'écrit → la cascade retire 8 repas et propose un décalage.
>
> Ce qui manquait : **`writeSessionState` n'avait qu'UN SEUL appelant**, le
> formulaire d'accident. La question n'était donc atteignable qu'à **quatre taps
> de profondeur**, et seulement pour quelqu'un qui venait de signaler un accident
> sur un plat puisant dans cette session.
>
> Pendant ce temps, la personne coche « j'ai mangé le poulet » chaque soir. Ce
> plat puise dans la préparation faite dimanche. **Donc dimanche a eu lieu** — et
> personne ne l'écrivait.
>
> ⛔ **On n'ajoute AUCUNE collecte, et c'est la condition du lot.** La bande du
> soir est une **affordance, pas une question** (FF-058, R2/T3 : « le chat
> n'initie jamais une collecte »). Y poser « la session de dimanche a-t-elle eu
> lieu ? » ferait tomber cette frontière et toute la fiche avec. On lit donc le
> tap que la personne fait déjà.
>
> ⛔ **Une coche est une preuve positive. Une décoche n'est preuve de rien.**
> « J'ai mangé le plat » ⇒ la préparation existait ⇒ la session a eu lieu. « Je
> ne l'ai pas mangé » ne dit RIEN de la session : la personne a pu commander sur
> une préparation parfaitement faite. C'est pour ça que le formulaire **pose** la
> question au lieu de la déduire — et déduire l'inverse **retirerait des repas**
> sur une inférence fausse. Le module n'écrit donc **jamais** `happened: false`.
>
> **Trois gardes**, et le test les prouve une par une : jamais une session du
> futur ; jamais par-dessus une ligne existante (une inférence ne remplace pas un
> témoignage) ; le lien **écrit** (`preparationIds`), jamais la proximité des
> dates.
>
> ⚠️ **Et le zéro reste illisible sans compteur.** `keel.evening_strip.sessions_confirmed`
> part à chaque coche, pas seulement quand une session est constatée : sans
> dénominateur, « 0 session constatée » ne se distingue pas de « 0 soir observé »
> — la forme exacte sous laquelle ce lot est resté invisible, et sous laquelle sa
> table à zéro s'est lue « la chaîne ne marche pas ».

---

## 5-ter. La question vaut révocation (lot M6, 2026-09-01)

> **Une exclusion qu'on interroge est une exclusion morte.** Personne ne demande
> pourquoi il n'y a jamais de ce qu'il ne veut pas. Renvoyer la personne vers un
> écran sans rien lui dire, c'est lui faire payer deux fois une préférence
> qu'elle n'a plus.
>
> ### ⛔ « Propose de la lever LÀ » — et le chat n'écrit toujours pas
>
> Le §2.9 dit *« propose de la lever là »* ; le §2.8 dit *« le chat n'écrit
> JAMAIS, pas même en un tap »*, avec la raison qui tranche : *« s'il peut
> écrire une allergie en un tap, pourquoi pas un aliment évité ? »*. **La
> seconde règle nomme le cas de la première, donc elle gagne.**
>
> Le runtime **retrouve** la ligne, la **cite** (avec sa cause, lot M2), et dit
> **où** elle se lève. ⚠️ **Et le gain reste entier** : ce qui coûtait cher
> n'était pas le tap, c'était *« d'arriver sur un écran et de devoir chercher où
> mettre la chose »*. Ici la ligne est nommée — la personne sait ce qu'elle va
> enlever avant d'y aller.
>
> ### La lane ne lisait RIEN — mesuré
>
> `sophia-brain` ne lit **jamais** `practical_constraints` : zéro occurrence.
> Sophia, dans le chat, n'avait aucune idée des règles stockées. Deux façons de
> le changer :
> ① charger à **chaque** tour et mettre les règles dans le prompt, pour que le
> modèle en nomme une — du budget sur tous les tours, pour un cas rare ;
> ② charger **seulement** sur le tour où la question tombe, et chercher le mot
> du modèle dans les lignes stockées. **⇒ ②.**
>
> ⚠️ **② n'interdit pas de le DIRE au modèle.** Ce qu'elle refuse, c'est le coût
> sur *tous* les tours. Sur le tour où la question tombe, le chargement a déjà
> eu lieu : la règle trouvée entre donc dans le contexte de **ce** tour-là. Voir
> la réparation ci-dessous — elle est née d'un run réel, pas d'une relecture.
>
> ### ⛔ Aucun matcher maison — le moteur du dépôt, utilisé comme il est fait
>
> Retrouver « poulet » dans « plus jamais de poulet le soir » est exactement le
> travail de `findForbiddenMatches` : un **token** contre de la **prose**. Il
> échappe la regex et pose des frontières de mot, donc **« lait » ne matche pas
> dans « laitue »** — la cicatrice chiffrée, 12 faux positifs sur 12. Mode
> **audit** (`allowNegatedMentions: false`), pour la même raison qu'au lot M7 :
> une exclusion s'écrit au négatif, et le mode ceinture rendrait le chercheur
> aveugle à ce qu'il cherche.
>
> ### ⚠️ La limite, nommée et MESURABLE
>
> La règle est stockée **dans la langue où elle a été écrite**. Quelqu'un dont
> les lignes sont en anglais et qui demande « pourquoi jamais de fenouil ? »
> reçoit le **silence** — vérifié sur un compte réel. C'est le bon échec :
> traduire serait un matcher inter-langues, précisément ce que le dépôt
> interdit. Et le compteur porte le **mot demandé**, donc l'écart se lit dans
> les logs au lieu de se deviner.
>
> ⛔ **Et rien n'est inventé.** Un aliment qu'aucune règle ne nomme rend le
> silence : dire « tu as demandé ça » à quelqu'un qui ne l'a pas demandé est le
> pire mensonge possible ici — il porte sur ses propres mots.
>
> ### ⛔ La réparation que seuls les tours réels ont trouvée (2026-09-01)
>
> Le lot était câblé, armé, compté, **et la réponse se contredisait elle-même**,
> sur 2 armements sur 2 :
>
> > *« Because fennel probably hasn't been put in the meal options you're being
> > given, **not because it's blocked here**. »*
> > puis, collé dessous : *« It comes from one line you have: "L3C — no fennel,
> > from the conversation". »*
>
> Cause structurelle, pas un caprice : la lane ne lit pas
> `practical_constraints`, donc le modèle ne pouvait que **deviner** — et il
> devinait le contraire de la phrase qu'`appendRedirect` allait coller sous lui.
> **Une annotation ne se rattache pas à un texte par la proximité** : c'est la
> cicatrice `portion-note-contradicts-the-lid`, un étage plus haut.
>
> ⇒ `ruleQuestionContextBlock()` : la règle trouvée entre dans `injectedContext`
> **avant** la génération. Même liste et mêmes portes que la phrase visible — si
> l'un s'arme sans l'autre, on recrée le défaut. Compteur `told_model`, distinct
> d'`armed`, parce que depuis cette réparation un tour peut avoir sa phrase sans
> son bloc, **et c'est ça la régression**.
>
> ⚠️ **Et la réparation a créé son propre défaut, mesuré au tour suivant** :
> instruit de la ligne, le modèle la **citait**, et la phrase la citait à
> nouveau — la réponse bégayait. Le bloc interdit donc explicitement de la
> citer : **la ligne reste portée par la phrase déterministe** (c'est le
> plancher : elle sort même si le modèle dérape), et le modèle se contente d'une
> clause. Résultat mesuré :
>
> > *« It's deliberate: you've set an exclusion, so fennel gets left out of your
> > plans. »* + la phrase, qui donne la ligne et où elle se lève.
>
> ⚠️ **Coût nul sur les tours ordinaires** : `rules_found=0` ⇒ ni bloc ni
> phrase, vérifié sur un tour réel (« broccoli »).

---

## 6. « Ce que Sophia sait de toi » — la surface (lot D)

`/app/about-you` → `StudentKnownPage.tsx` → `KnownAboutYouCard.tsx`, magasin lu par
`api/retainedItems.ts`, écrit par `keel_write_retained_items` avec instantané (`stale_snapshot`).
**Trois choses, une fois chacune, groupées par personne** (Claire / Léa / Tom / « toute la
table »), plus l'encart.

1. **Préférences alimentaires** — par personne, deux listes : *à ne plus servir*
   (`food.exclude`, `method.avoid`), *à revoir* (`food.prefer`, `method.prefer`) ; aliments
   **et** préparations ensemble. Sur chaque ligne, **trois choses et pas moins** : d'où elle
   vient (`source` en clair — « tu l'as écrit », « retenu de ton retour du 3 », « coché au
   bilan »), la citation (`quote`), et de quoi l'éditer et l'enlever.
2. **Ce que je sais d'autre** — les notes (③), par personne, datées, le `when` rendu (« le mardi
   soir »), la citation. Éditer le texte, enlever.
3. **Réglages ajustés** — le journal des indices (`field_changes`) tel quel, compact, avec
   **Défaire**. C'est la seule face visible de ②, et elle existe pour le retour en arrière, pas
   comme un « savoir ». La position de portion par personne y figure (phrase actuelle
   `known.index.portions.*`), avec ses lignes `portion.adjust` retirables une par une.
4. **Pour le prochain plan** — l'encart, **seulement s'il est non vide** ; « jusqu'à ce que ton
   prochain plan soit validé » à la place de la date d'expiration ; lecture seule + enlever.
5. **Anciennes notes** — `food_preferences`, tant qu'il en reste ; l'intro dit qu'elles
   **n'atteignent plus le plan** (lot C) et propose de les ranger (en préférence, avec un sujet)
   ou de les enlever. On ne reclasse pas rétroactivement.

**Disparaissent** : « Ton rythme », « Ta cuisine », « Ce que Sophia a retenu d'autre »
(fusionné en 2), les sections `method.*` séparées, `craving`, `known.section.portions.*` comme
section à part.

**Ce que la carte garde** : la gate de chargement (elle n'est montée que sur `ready`),
`stale_snapshot` rendu sous le bouton, `store_unreadable`, `refused.body`, le refus nommé.

⚠️ Le commentaire de `StudentKnownPage.tsx` (« port d'écriture ÉCRIT ET NON LANCÉ ») est
**périmé** : `20260818240000` et `20260818250000` sont appliquées en local. À corriger au lot D.

⚠️ Le récap du soir (`memory_recap.ts`) annonce aussi une **note** neuve et une **préférence**
neuve écrites par le retour ou le bilan (« J'ai noté pour Léa : … ») — c'est la moitié « on le
dit » du modèle (annexe A.1, arbitrage du 2026-09-01), étendue aux trois destinations.

⚠️ La lane FOYER du 2026-09-03 (A5, décision D5.4) monte cette carte **aussi** dans le cadre
« Préférences alimentaires » de la bouche avec compte sur `/app/household`, et y embarque
`FoodPreferencesCard` : collision **C2** du §9.

---

## 7. Ce que ce document ne tranche pas

- **`household_member_habits.note`** — la ligne libre du dialogue « habitudes » (« Ne mange
  rien de réchauffé »), 14 lignes en local. Elle atteint le prompt (`household_habits.ts`,
  passée par `readHabitText` — la porte doctrine/plancher, **pas une ceinture d'aliment**) et
  n'entre dans aucune des trois destinations. Deux issues possibles : la classer (③, avec
  sujet) ou la fermer. Non tranché ; le lot qui la rencontre s'arrête et nomme.
- **Les traditions** (`household_traditions`) — un plat par créneau, lecteur vivant, hors
  périmètre de ce document.
- **Une note qui contredit une préférence** (« Tom mange du poisson le vendredi » face à
  `food.exclude poisson member:Tom`) — non tranché. Proposition : la préférence gagne (elle a
  une ceinture, la note n'en a pas) et la note est refusée `contradicts_preference`, compté.
  Le lot qui le rencontre en réel s'arrête et propose.
- **La déduplication entre producteurs** — si le retour et le bilan écrivent la même exclusion
  pour la même bouche : **une** ligne, par identité de contenu (`termsOfInstruction` pour
  l'aliment normalisé, `contentIdentityOf` pour une note). Tenu par un test au lot C ; la
  requête anti-doublon du prompt maître §6.5 est le contrôle en base.
- **Un indice de cuisine par personne** — le design (§2.6 de `DESIGN-MEMOIRE`) voulait « un
  indice par PERSONNE, jamais par foyer » pour la compétence. Les trois champs de cuisine sont
  ceux du **compositeur** (la ligne du maître, comme `kitchen_equipment`) ; un secondaire qui
  prend la main a les siens. Assumé, pas mesuré.
- ~~La durée de vie exacte d'un `next_plan`~~ — tranché deux fois : 2026-08-18 (l'ancre,
  annexe A.4), **2026-09-03 (la validation du plan suivant, §2.5)**.
- ~~La migration des `food_preferences` existantes~~ — tranché : « Anciennes notes », §6.5.

---

## 8. Exemples de routage — ce que les bancs testent

**C'est cette section que les lots A et B testent**, phrase par phrase et cas par cas. Le doc
dit **où ça va**, sans hésitation ; le banc vérifie en base ce que le doc dit. Fixture : Claire
(titulaire, maintien), Léa (mineure, danse le mardi), Tom (mineur, végétarien, n'aime pas le
poisson).

### 8.1 Les dix phrases du retour sur brouillon (lot A)

| # | phrase | porte | sujet | ce qu'on relit en base |
|---|---|---|---|---|
| 1 | « c'est trop long à cuisiner » | **rien** — `nothing_to_file{gate:index}` : un degré, la question `speed` du bilan le pose | — | 0 ligne `retained_items`, 0 note, `cooking_time_min` **inchangé** |
| 2 | « les recettes sont trop compliquées » | **rien** — `nothing_to_file{gate:index}` (`difficulty`) | — | idem, `recipe_difficulty` inchangé |
| 3 | « j'aime pas le poulet » | **① préférence** · exclude · food | `household` | `food.exclude` **durable**, `text` fidèle, `quote` = la note |
| 4 | « mon fils n'aime pas le poisson » | **① préférence** · exclude · food | `member:Tom` — **jamais** household | sujet = Tom ; génération suivante : `exclusion_belt` bites=0, poisson absent des boîtes de Tom |
| 5 | « les parts sont trop grosses » | **rien** — `nothing_to_file{gate:index}` : la portion se demande avec « pour qui » | — | position de portion **inchangée** |
| 6 | « ma fille a danse le mardi soir, il lui faut un vrai repas » | **③ note**, `when = {tue, dinner}` | `member:Léa` | 1 ligne mémo sujet Léa avec `when` ; génération suivante : `keel.household_meal.notes served=1`, la ligne « Tuesday dinner — Léa … » **dans le `userMessage`**, `boxes[].grams` de Léa au dîner du mardi **>** lundi |
| 7 | « l'après-midi elle mange toujours des compotes » | **③ note**, `when = {slot: snack_pm}` — **tranché** : ce n'est pas réductible à (Léa, compote, revoir) sans perdre « l'après-midi » et « toujours » ; c'est une habitude à un créneau, pas un goût | `member:Léa` | 1 note Léa avec `when.slot` ; **0** `food.prefer` |
| 8 | « je suis allergique aux arachides » | **sécurité** (canal ①, inchangé) | la titulaire | `student_safety_constraints` +1 ; **0** préférence, 0 note |
| 9 | « mon fils est devenu végétarien » | **sécurité** (régime) | `member:Tom` | `household_members.diet` de Tom ; 0 préférence |
| 10 | « j'ai envie de fajitas cette semaine » | **encart** (`next_plan`) | `household` | `retained_next_plan` +1 ; l'encart apparaît ; il **meurt** au `validated_at` du plan suivant |

Règle du sujet, relue sur 4, 6, 7, 9 : la phrase nomme quelqu'un ⇒ la ligne porte
`member:<uuid>` ou **rien**. Le repli sur « tout le monde » est **interdit** quand la phrase
nommait quelqu'un.

⟳ **2026-09-04 — « ou rien » n'est plus du silence.** L'abstention ne se compte plus seulement
(`unknownMember` / `ambiguous_relative`) : quand plusieurs bouches sont candidates, l'entrée va
dans `clarify` et la question part (§2.8). L'abstention **muette** reste le sort du cas où
personne ne colle — pas de celui où deux personnes collent.

### 8.2 Les cas du bilan (lot B)

| cas | entrée | attendu |
|---|---|---|
| A | `cooked=partly` | **rien** sur les indices (plus de déduction) ; journal vide ; `difficulty` et `speed` posées ensuite |
| B | `cooked=no` | rien sur les indices ; `difficulty` et `speed` **non posées** (on n'a pas cuisiné) |
| C | `portions=too_much`, `household` | position −1 pour Claire ; Léa et Tom **exclus par motif** `minor` |
| D | `way_too_much` + `member:Claire` | −2 crans de plus, borne à −2, `ok=true` (défaut ⑥ du 2026-09-01 refermé) |
| E | puis `not_enough` | +1 cran ; contrefactuel `unadjustedEnvelope` journalisé sur **une** génération |
| F | `too_much` + `member:Léa` (mineure, **sujet explicite**) | **appliqué** à Léa — un sujet explicite n'est jamais filtré (`subjectsForPortionAdjust`) |
| G | `never_again` = un aliment **absent** du plan | refus nommé `notInPlan`, rien écrit |
| H | `enough_variety=no` | `variety` ↑ un cran + 1 ligne de journal citant la question |
| I | second bilan sur le **même** plan | `already_answered`, aucun double effet |
| **J** | `difficulty=too_hard` | `recipe_difficulty` ↓ un cran + 1 ligne de journal, `quote` = la question posée |
| **K** | `speed=too_long` | `cooking_time_min` ↓ un barreau ; au plancher : `atFloor`, journal quand même |
| **L** | `anything_else = "Léa doit bien manger le mardi, elle a danse"` | 1 note mémo sujet Léa `when={tue,dinner}` ; **0** préférence ; **0** indice |
| **M** | `never_again=[{food:"saumon", subject:"member:Tom"}]` | `food.exclude` durable sujet Tom ; génération suivante : saumon absent des boîtes de Tom, `exclusion_belt` bites=0 |
| **N** | `anything_else = "on a mangé des pizzas mardi"` | **rien** — `nothing_to_file` : raconter ce qui a été mangé n'a aucune destination (FF-054 : on évalue le plan, jamais la personne) |

### 8.3 Les dix phrases délicates — ce que le banc des clarifications mesure (2026-09-04)

Fixture à **cinq bouches** : Claire (titulaire, F adulte), Marc (M adulte), Tom (M mineur),
Léa (F mineure), Zoé (F mineure). Sans une **seconde fille** et un **conjoint**, la moitié de
ces cas n'existe pas — « ma fille » se résoudrait tout seul.

**Source brouillon** (`draft_note` sur une génération) :

| # | phrase | attendu |
|---|---|---|
| D1 | « Ma fille n'aime pas le poisson. » | **question QUI**, options = `{Léa, Zoé}` ; tap Léa ⇒ 1 `food.exclude` `member:Léa`, `quote` = la phrase |
| D2 | « Mon fils n'aime pas le poisson. » | **aucune question** — un seul garçon mineur ; 1 ligne `member:Tom` |
| D3 | « Les petites ne mangent pas de champignons. » | **aucune question** — 2 lignes, `{Léa, Zoé}`, **jamais** Tom, **jamais** `household` ⟳ |
| D4 | « On n'aime pas trop la viande rouge. » | **aucune question** — « on » = la table ; 1 ligne `household` |
| D5 | « Elle a horreur des épinards. » | **question QUI** (« elle » ≠ celle qui tape) ; échappement ⇒ `declined`, **rien d'écrit** |

**Source bilan** (champ libre `anything_else`) :

| # | phrase | attendu |
|---|---|---|
| B1 | « J'ai pas aimé la viande. » | **question QUOI**, options ⊆ les viandes **du plan** ; tap ⇒ 1 ligne `household` portant le terme choisi |
| B2 | « Le plat de mardi soir, plus jamais. » | **question QUOI**, options = les PLATS du plan ⟳ |
| B3 | « Zoé a bien mangé cette semaine. » | **rien, et aucune question** — raconter ce qui a été mangé n'a pas de destination (§8.2 cas N) |
| B4 | « Mon mari trouve qu'il y a trop de riz. » | **rien, et aucune question** — un **degré**, que la question `portions` pose ; demander « lequel » pour une entrée qu'on va sauter est le pire des deux mondes |
| B5 | « Les enfants ont détesté le X, sauf Tom. » | **aucune question** — l'aliment est **nommé** ; 2 lignes `{Léa, Zoé}` |

Règle que ces dix cas tiennent ensemble, et que le code doit respecter : **un aliment nommé ne
déclenche jamais de question QUOI** (B5), et **un degré ne déclenche jamais de question du tout**
(B4). Seule une référence qu'on ne peut pas résoudre — et dont la résolution **écrirait** quelque
chose — vaut une sollicitation.

**Source brouillon, la portée d'un régime** (⟳ 2026-09-05, groupe `SC` du banc, sur son propre
compte — trois questions, donc deux jours locaux) :

| # | phrase | attendu |
|---|---|---|
| SC3 | « Je suis végétarienne. » | **aucune question** — dit pour de bon : `safety` direct, contrainte écrite (puis rétractée par le banc) ; 0 préférence, 0 note |
| SC4 | « On mange végétarien le lundi soir. » | **aucune question** — un rythme : 1 **③ note** avec `when = {mon, dinner}` ; `securite_bouge: false` |
| SC1 | « On mange végétarien. » | **question `scope`**, options `Oui, tous mes repas · Non, pas toujours · Passer` ; **rien d'écrit avant le tap** (la garde `held_for_scope`) ; tap « Oui » ⇒ contrainte par la porte de sécurité, `answered`, accusé sans « Voir » ; 0 item, 0 mémo |
| SC2 | « On essaie de manger vegan en ce moment. » | **question `scope`** ; tap « Non, pas toujours » ⇒ 1 **③ note** (sans `when`), « Voir » vers les notes ; `securite_bouge: false` |
| SC5 | « On est plutôt végé. » | **question `scope`** ; tap « Passer » ⇒ `declined`, **rien** d'écrit |

Règle que ces cinq tiennent ensemble : **la question ne part que sur une phrase qui nomme un régime
sans dire s'il tient toujours** ; « pour de bon » va en sécurité, « un jour / un moment / une
fréquence » va en note. Et **une question de portée retient la déclaration du même sujet** tant
qu'elle est ouverte — mesuré nécessaire au premier tir réel, où le modèle a posé la question ET
écrit la contrainte.

#### ⟳ Ce que le premier run réel a corrigé dans ce tableau (2026-09-04)

**D3 — un PLURIEL n'est pas une ambiguïté.** Le premier tir a posé la question
« champignons — c'est pour qui ? · Léa · Zoé », **à laquelle aucune réponse n'est juste** :
en taper une jette l'autre. La cause était dans `WHO_RULES`, qui donnait « the kids » en
exemple de mot à résoudre puis exigeait qu'**une seule** personne corresponde — condition
qu'un pluriel ne satisfait jamais. Tous les pluriels tombaient donc dans « deux candidats
⇒ demande ». La règle nomme désormais le pluriel **avant** celle des deux candidats, et
dit quoi en faire : **une ligne par bouche**, jamais `household`, jamais `clarify`.

**B2 — l'attendu du doc était faux, pas le produit.** On avait écrit « le classifieur a le
plan ». Il ne l'a pas : il reçoit une **liste plate** de termes, **sans jour ni moment**.
« Le plat de vendredi soir » est donc réellement irrésolvable pour lui, et demander est la
bonne réponse. Ce que le run a montré de vraiment cassé, c'est le CONTENU des options :
`filets de saumon · cuisses de poulet · lentilles · œufs` — des **ingrédients** pour une
phrase qui désigne un **plat**. `planVocabularyOf` met désormais les **titres de plats**
en tête de la liste proposée.

⚠️ **Ce qui reste ouvert** : la liste ne porte toujours ni jour ni moment. « Le plat de
vendredi soir » restera une question tant que le classifieur ne verra pas le calendrier du
plan. On a amélioré la question, pas supprimé le besoin de la poser.

---

## 9. Collisions nommées avec les huit chantiers du 2026-09-03 — à arbitrer avant le lot A

Le même jour, un second prompt maître (`scratchpad/2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md`,
journal `…-1329-ORCHESTRATION-8-CHANTIERS.md`) fait tourner cinq lanes en worktrees, fusionnées
en série sur l'arbre principal. Quatre de ses décisions touchent ce document. **Aucune n'est
tranchée ici** : elles sont nommées, avec une proposition, pour l'arrêt ⏸ qui suit le lot 0.

> ✅ **ARBITRÉ LE 2026-09-03, après relecture du lot 0 :** C1 → **α** (le style dérive à
> l'écriture, D2.5 tombe) · C2 → **séquencer** (A5 d'abord, tel quel ; C et D réécrivent en
> place) · C3 → **renversement écrit** dans FF-054 §3.2 au lot B, borné. C4 et C5 s'appliquent
> tels quels.

| # | ce qui entre en collision | lane | proposition |
|---|---|---|---|
| **C1** | **A2** dérive `cooking_time_min`, `recipe_difficulty`, `variety` d'un `cooking_style ∈ minimal \| balanced \| keen` (D2.2), et **D2.5** fait descendre le *style* d'un cran sur `cooked: no`. Le §2.4 fait bouger les trois **champs** par des questions posées, et retire la déduction sur `cooked`. | CUISINE (pas encore lancée à 13:46) | **α (recommandé) — le style dérive à l'ÉCRITURE, pas à la lecture** : choisir un style écrit les trois champs (30 / 60 / 120 min, simple / normal / keen, repeat / some / varied) par la même porte journalisée (`keel_write_field_changes_for`, `quote` = le libellé du style). Les champs restent l'unique vérité lue par `readCookingCapacity` ; le bilan les bouge d'un cran (§2.4) ; l'écran montre « style : un juste milieu, ajusté » quand ils s'écartent du préréglage. **D2.5 tombe** : on ne devine plus depuis `cooked`, on demande `speed` / `difficulty`. β — A2 dérive à la lecture et les indices deviennent des décalages cachés à côté du champ : c'est le défaut muet que M5 a fermé. γ — laisser les deux : un champ bougé au bilan écrase la dérivation en silence, ou l'inverse. |
| **C2** | **A5 / D5.4** monte `KnownAboutYouCard` dans le cadre « Préférences alimentaires » de la bouche avec compte sur `/app/household`, et y embarque `FoodPreferencesCard` (`embedded`). Le lot C démonte `FoodPreferencesCard` de `/app/plan` et ferme le pont ; le lot D réécrit `KnownAboutYouCard`. | FOYER | **Séquencer, pas trancher** : A5 fusionne d'abord et monte les composants **tels quels** ; le lot D réécrit `KnownAboutYouCard` **en place** (mêmes props, même route) et le lot C fait de `FoodPreferencesCard` la carte « Anciennes notes » (lecture, ranger, enlever — plus de « Keep ») : A5 l'embarque alors sans rien changer. Une seule clause à A5 : ne pas ajouter de nouveau lecteur de `memory_items`. |
| **C3** | **FF-054 §3.2** : « une question à la fois, boutons, **aucun champ libre** » — parce qu'un champ libre inviterait à raconter ce qui a été mangé. Le §2.1 ajoute `anything_else`, libre et facultatif. | (décision écrite du 2026-09-01) | **Renversement écrit, borné** : `anything_else` est la **dernière** bulle, facultative, formulée « quelque chose à retenir pour la suite ? » (jamais « comment ça s'est passé »), et ce qui raconte un repas n'a **aucune destination** (§8.2 cas N, `nothing_to_file`). Le test lexical de FF-054 (registre de conformité) s'applique à son libellé. À écrire dans FF-054 §3.2 au lot B, pas en passant. |
| **C4** | Numéros de migration réservés par l'orchestrateur : `20260903140000`, `…141000`, `…142000`. La base locale est unique et une migration hors ordre est sautée en silence. | toutes | Le lot B réserve **`20260903150000`**. Validation en worktree par `begin; \i …; rollback;` ; `migration up` réel seulement dans la fenêtre de run, après A8.2. À écrire dans le journal d'orchestration par l'orchestrateur, pas par ce chantier. |
| **C5** | Les fonctions edge servies par `supabase functions serve` sont celles de **l'arbre principal**. Les bancs réels des lots A–C (classifieur, générateurs) exigent donc du code sur l'arbre principal, pendant que l'orchestrateur y fusionne des lanes. | toutes | Ce chantier travaille sur l'arbre principal (prompt maître §0) et **commite à chaque ⏸**, jamais entre : un fichier non commité qui recouvre une fusion bloque la fusion. Les fichiers de lane sont horodatés. Si l'humain préfère un worktree `MEMOIRE`, les bancs réels se font dans une fenêtre de run comme les autres lanes. |

---

## Annexe A — ce que c'était (2026-08-18 → 2026-09-03)

> ⛔ **Cette annexe n'est pas une autorité.** Elle est conservée parce que le code porte encore
> ces formes jusqu'au lot D, et parce que les encadrés datés des lots M1–M8 y renvoient. Une
> session qui repart d'ici construit à côté du modèle : lire le §2.

### A.1 Les trois axes (§2 d'avant), avec l'arbitrage sécurité du 2026-09-01

#### 2. Les trois axes — toute information retenue en porte trois

##### Axe 1 · `kind` — de quoi on parle *(liste FERMÉE)*

Liste fermée, à la main, jamais inférée — même doctrine que `DIETARY_REGIMES` et
`SAFETY_CONSTRAINT_KINDS`. Une famille qui n'est pas ici ne s'écrit pas.

| `kind` | Ce que c'est | **Le lecteur** |
|---|---|---|
| `food.exclude` | un aliment ou un plat dont on ne veut plus | la consigne de composition |
| `food.prefer` | un aliment ou un plat qu'on veut revoir | la consigne de composition |
| `method.avoid` | une préparation qui ne passe pas (frit, cru, épicé) | la consigne de composition |
| `method.prefer` | une préparation qui plaît | la consigne de composition |
| `portion.adjust` | **une mesure**, pas un goût : trop / pas assez, **pour QUI** | l'enveloppe (`envelopeFor`) |
| `rhythm.set` | un moment qui existe ou n'existe pas, pour quelqu'un | le rythme alimentaire (6 moments) |
| `logistics.set` | jours de cuisine, temps, difficulté, variété, budget | `practical_constraints` |
| `craving` | une envie ponctuelle — « des fajitas la semaine prochaine » | le bloc d'envies |

⛔ **Il n'existe AUCUN `kind` de sécurité, et c'est structurel.** Une allergie, une
intolérance, un régime, une condition médicale ne peuvent **jamais** naître d'un
`RetainedItem` : elles ont leur table (`student_safety_constraints`), synchrone,
sans ranking. La carte filtre déjà `sensitive`/`safety` **dans la requête**.
Quelqu'un qui coche « plus jamais » sur un plat aux arachides n'a pas déclaré une
allergie.

> ### ⛔ RENVERSÉ POUR LE RETOUR DE PLAN — 2026-09-09
>
> L'arbitrage ci-dessous ne vaut plus que pour la **conversation**. Le canal sécurité du
> classifieur de notes est supprimé : une allergie dite sur un retour de plan est une
> préférence alimentaire, et rien d'autre.
>
> ### ⚠️ CE QUE CETTE RÈGLE NE DIT PLUS — arbitrage du 2026-09-01
>
> Elle disait aussi : « … ne peuvent jamais naître d'un retour **ou d'une
> conversation classée** ». **C'est renversé, et c'est une décision produit
> explicite**, prise après mesure.
>
> **Ce qui a été mesuré.** Sur un tour réel, « Je suis allergique aux
> arachides » écrit dans un retour de plan donnait :
> `food.exclude · scope=next_plan · sujet=household`, **zéro** ligne dans
> `student_safety_constraints`, et `keel/safety_fallback fell_back=true`. Trois
> pertes en une : aucune ceinture en sortie (ce magasin nourrit un prompt, rien
> ne vérifie le résultat), aucune attribution, **et ça expirait le dimanche
> suivant**. La même phrase dite **en conversation** écrivait correctement dans
> la table. C'était donc la SURFACE qui décidait du sort d'une allergie.
>
> **La décision.** *« Si une personne parle d'une allergie, en vérité c'est une
> allergie. »* Le classifieur du retour de plan la range désormais **dans la
> table de sécurité**, pour la personne ou pour la bouche qu'elle nomme.
>
> **Ce qui remplace le consentement synchrone, et c'est la moitié qui compte.**
> La garantie n'est plus « on ne l'écrit pas sans demander », elle est
> **« on l'écrit, on le DIT, et ça se défait en un geste »** :
> · la personne est prévenue par la notification du soir (un ÉNONCÉ, qui ne
>   consomme pas le budget de demande — voir §T4) ;
> · le retrait existe déjà et il est à elle : `StudentHealthPage` +
>   `retract_student_safety_constraint`, et la table n'accepte QUE la
>   rétractation (`student_safety_constraints_retraction_only`).
>
> ⛔ **Les deux moitiés ne se livrent pas séparément.** Écrire sans prévenir
> serait une contrainte médicale posée dans le dos de quelqu'un ; prévenir sans
> pouvoir défaire serait pire. Un lot qui ne livrerait que l'écriture doit être
> refusé.
>
> ⚠️ **Ce qui NE change pas** : aucun `RetainedItem` ne porte de sécurité. La
> liste des huit `kind` reste fermée, et le classifieur continue de refuser d'y
> ranger une allergie. C'est un SECOND canal, à côté, vers une table qui a sa
> ceinture — pas un neuvième `kind`.

##### Axe 2 · `scope` — combien de temps ça vit

| `scope` | Durée | Où ça vit | Où ça se voit |
|---|---|---|---|
| `durable` | jusqu'à ce que la personne l'enlève, ou que la mémoire la démente | `practical_constraints` | « Ce que Sophia sait de toi », section par `kind` |
| `next_plan` | **jusqu'à la fin de la semaine ancrée** (`ancre + 6`), puis expire — tranché au §7 | `practical_constraints.retained_next_plan`, forme `[{item, anchor}]` | « Pour la semaine prochaine », avec sa date d'expiration |

⚠️ **Le `next_plan` ne vit PAS sur le canal d'envies** — ce document l'a dit
jusqu'au 2026-08-18, et c'était faux. `household_envy_submissions.household_id`
est `not null` et **une personne seule n'a pas de foyer** (`SetupPage.tsx` : « le
solo ne crée pas de foyer ») : un compte solo n'aurait jamais pu porter un seul
`next_plan`, alors que l'entrée du produit est à une bouche. Le canal d'envies
reste ce qu'il a toujours été : **la phrase libre du maître, pour tout le foyer**.
Un magasin par portée, identique pour un solo et pour un foyer.

C'est la frontière que le dépôt a **déjà tranchée une fois** dans le prompt —
`situation` (stable) séparé de `context` (daté) — avec ce motif écrit : *« une
contrainte d'une semaine s'y lisait comme une propriété permanente »*. On
réutilise la frontière, on n'en invente pas une seconde.

⚠️ **`craving` est TOUJOURS `next_plan`.** Une envie qui devient durable cesse
d'être une envie et devient une habitude qu'on n'a pas demandée.
⚠️ **`portion.adjust` est TOUJOURS `durable`.** Un corps ne change pas d'une
semaine sur l'autre ; un ajustement qui expire ferait re-servir la mauvaise part
au plan suivant, et la personne devrait le redire chaque semaine.

##### Axe 3 · `subject` — de qui on parle

| `subject` | Sens |
|---|---|
| `household` | tout le monde à table — **le défaut** |
| `member:<member_id>` | une bouche précise |

**Jamais un prénom, jamais un texte.** `member_id`, comme partout ailleurs : la
cicatrice du dépôt est écrite (« laitue » ≠ « lait », 12 faux positifs sur 12) et
« Poulet pour Zoé et Marc » ne se résout pas par un prénom dans un titre.

> ### ⚠️ La règle du sujet non précisé, et son exception
>
> **Si le sujet n'est pas précisé, ça concerne tout le monde** — ta règle, et
> elle est bonne : c'est le cas le plus fréquent et le moins surprenant.
>
> **UNE exception, et elle n'est pas négociable :** un `portion.adjust` **à la
> baisse** ne s'applique pas à un mineur sans sujet explicite. Réduire l'assiette
> d'un enfant en croissance à partir d'une remarque non attribuée d'un adulte est
> exactement le geste silencieux que le reste du produit interdit (plancher TCA,
> consentement de restriction). Le mineur est simplement exclu de l'ajustement ;
> rien n'échoue, et le constat le dit.


### A.2 La matrice des deux prompts (§5 d'avant)

| | `food.*` `method.*` | `portion.adjust` | `rhythm.set` | `logistics.set` | `craving` |
|---|---|---|---|---|---|
| **① Après retour sur le brouillon** | ✅ `next_plan` par défaut | ⛔ | ⛔ | ⛔ **écrit le champ** | ✅ |
| **② Après le questionnaire de fin de plan** | ✅ `durable` | ✅ **seul producteur** | ⛔ **écrit le champ** | ⛔ **écrit le champ** | ⛔ |
| **③ ~~Memorizer (conversation, minuit)~~** | ⛔ **renvoie au champ** | ⛔ **renvoie au bilan** | ⛔ **renvoie au champ** | ⛔ **renvoie au champ** | ⛔ |


### A.3 La surface en six sections (§6 d'avant)

#### 6. « Ce que Sophia sait de toi » — la surface

⚠️ **Elle n'est montée aujourd'hui que sur `/app/plan`
(`StudentWeekPlanPage:2329`). Elle doit devenir une destination à elle**, sinon la
promesse « rien d'opaque » dépend du hasard d'un défilement.

Les sections suivent les `kind`, dans cet ordre :

1. **Ce que tu ne veux plus** — `food.exclude`, `method.avoid`
2. **Ce que tu veux revoir** — `food.prefer`, `method.prefer`
3. **Les portions** — `portion.adjust`, **groupées par personne**
4. **Ton rythme** — `rhythm.set`, par personne
5. **Ta cuisine** — `logistics.set`
6. **Pour la semaine prochaine** — tout le `next_plan`, **avec sa date
   d'expiration affichée**

Sur chaque ligne, trois choses **et pas moins** : d'où elle vient (`source` en
clair — « tu l'as écrit », « je l'ai retenu de mardi », « tu l'as coché au bilan »),
un moyen de l'éditer, un moyen de la supprimer.

**La section 6 affiche son expiration.** Une envie qui disparaît sans prévenir se
lit comme une perte de données ; une envie datée se lit comme une envie.


### A.4 L'expiration à l'ancre (§7 d'avant, tranché le 2026-08-18, remplacé par §2.5)

- ~~**La durée de vie exacte d'un `next_plan`**~~ — **TRANCHÉ le 2026-08-18
  (lot 1B) : jusqu'à la fin de la fenêtre du plan.**

  Un `next_plan` vit **jusqu'à la fin de la semaine à laquelle il est ancré** —
  le lundi ISO de son `anchor`, stocké à côté de l'item dans
  `practical_constraints.retained_next_plan` (forme `[{item, anchor}]`). Il est
  vivant tant que `jour ≤ ancre + 6` ; il n'est plus là à partir de `ancre + 7`.

  ⚠️ **L'ancre est la semaine VISÉE, jamais `item.at`.** `at` est le jour où la
  chose a été dite ; l'ancre est la semaine qu'elle vise. Quelqu'un qui écrit le
  dimanche pour la semaine suivante a `at = dimanche` et `anchor = lundi` : dater
  l'expiration sur `at` ferait mourir son envie le lendemain matin — sept jours
  annoncés, un seul rendu. C'est pour ça que l'ancre est **stockée**, et pas
  déduite.

  L'expiration est **calculée à la lecture** — `retained_next_plan.ts`,
  `isNextPlanItemAlive(item, writtenAt, today)`. **Aucune colonne `expired`,
  aucun `status`, aucun job de nettoyage, aucune suppression de ligne** : *« un
  second état à invalider est un état dont l'écrivain finit par disparaître »*
  (`accident.ts`). L'ancre n'est pas un état — c'est une donnée que personne n'a
  à venir corriger.

  **Motif, dans cet ordre.**
  ① **L'ancre est une donnée, pas un état.** « Cette ligne vise la semaine du
  24 » est un fait que personne n'a à venir corriger plus tard. C'est ce qui rend
  l'expiration calculable **sans écrivain** — et c'est la seule forme d'ancrage
  qui survit à un producteur qui tombe.
  ② **La date d'expiration est connue à l'écriture, donc affichable** — ce que le
  §6 exige mot pour mot (« avec sa date d'expiration affichée »).
  ③ **Régénérer deux fois la même semaine garde l'envie.** Le couple
  brouillon/relance est le geste le plus courant du produit. « J'ai demandé des
  fajitas cette semaine » est ce que la personne a voulu dire ; « pour exactement
  un appui de bouton » ne l'est pas.

  **Option écartée : « exactement une génération ».** Elle demande de *savoir*
  qu'une génération a eu lieu, et ça coûte l'une de ces deux choses — les deux
  refusées. Soit un drapeau `consumed` sur l'item : c'est le second état
  interdit, et son écrivain est un générateur dont ce dépôt a **mesuré** qu'il
  peut échouer *après* l'appel modèle (un run rendu `400` avait déjà touché la
  ligne) — l'item finirait consommé deux fois, ou jamais. Soit une comparaison
  avec la dernière ligne de `student_generated_meals` : celle-là est dérivée,
  donc honnête, et elle reste refusée pour une raison produit — l'envie
  disparaîtrait **entre deux clics du même bouton**, la seconde génération de la
  même minute composant sans elle, sans un mot. *« Une envie qui disparaît sans
  prévenir se lit comme une perte de données. »* Et dans les deux cas la date
  d'expiration est inconnue d'avance : le §6 tombe avec.

  **Le trou qui a fait déménager le magasin, et qui est refermé.** La première
  version de ce lot posait le `next_plan` sur le canal d'envies, comme le §2 axe
  2 le disait. Défaut mesuré pendant l'écriture : une personne **seule n'a pas de
  foyer** (`SetupPage.tsx` : « le solo ne crée pas de foyer ») et
  `household_envy_submissions.household_id` est `not null` — un compte solo
  n'aurait jamais pu porter un seul `next_plan`, alors que le lot 2B en produit
  **par défaut** et que l'entrée du produit est à une bouche. Ses retours sur
  brouillon auraient été soit refusés, soit basculés en `durable`, c'est-à-dire
  « une humeur de mardi transformée en règle de vie » — ce que le §5 interdit.
  Arbitrage humain du 2026-08-18 : le magasin déménage dans
  `practical_constraints`, sous une clé distincte du durable. Une seule clé de
  lecture — `user_id` — et le solo est servi **comme tout le monde**.

