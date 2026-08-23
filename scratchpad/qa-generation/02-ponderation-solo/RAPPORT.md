# ÉTAPE ② — LA PONDÉRATION, LANE SOLO `generate-meal-v1`

**Agent 2A · 2026-08-19 · branche `ff-001-quotidien-du-coach`.**
Périmètre : `supabase/functions/generate-meal-v1/` et le tronc
`supabase/functions/_shared/keel/meal_generation.ts`.
`generate-week-plan-v1` est hors chantier (décision du 2026-08-19).

**Question :** une allergie n'a pas le même poids qu'un dégoût, un dégoût pas
le même qu'une envie du soir, une contrainte de temps pas le même qu'un goût.
**Le prompt établit-il cette hiérarchie, et la formule-t-il de façon que le
modèle l'exécute ?**

---

## RÉPONSE EN UNE PAGE

**La hiérarchie existe. Elle n'est écrite nulle part.** Elle est portée
uniquement par la POSITION des blocs, et la position dit le contraire de ce
qu'on veut : la sécurité occupe le rang le moins contraignant (la tête),
l'envie du soir occupe presque le plus contraignant (trois lignes avant la
fin), et **la seule phrase du message qui affirme un rang donne le sommet au
coach**, pas à l'allergie.

Trois preuves en octets, avant tout run :

1. **Le prompt système ne contient pas une fois le mot `allerg`**
   (14 382 car., `grep -c -i allerg` → **0**). Sa seule phrase qui dit « hard
   limits » est celle-ci, et elle parle du coach :
   > `Your coach's method is given below. It is not a suggestion: their forbidden practices and the foods they do not put on a plate are hard limits, and you never contradict them.`
   Le bloc de doctrine, lui, dit `Where this block and your own knowledge
   disagree, this block wins`. Rien, dans les 24 000 caractères des deux
   moitiés, ne dit que l'allergie de l'élève passe avant la méthode de son
   coach. C'est pourtant l'arbitrage écrit **en commentaire** dans
   `meal_generation.ts` (« un coach dont la doctrine recommande les fruits à
   coque n'a pas écrit ça pour un anaphylactique ») — il vit dans le code, pas
   dans le prompt.

2. **L'envie du moment était la seule ligne de désir sans un mot de rang.**
   L'aspiration porte `never at the cost of a hard constraint`, la saison porte
   `It ranks your choices; it does not veto anything`, l'axe porte `Let it rank
   your choices among the dishes the method allows`. `what they feel like
   eating THIS TIME:` arrivait **nue**, et à la place la plus contraignante du
   message.

3. **La sévérité est imprimée et n'est lue par personne.**
   `safetyConstraintsPromptBlock` écrit `severity=medical` / `strict` /
   `preference` sur chaque ligne, sous l'en-tête « These are not preferences »,
   puis sert la MÊME interdiction aux trois : `NEVER suggest, recommend or
   include any of the above`. Un dégoût de la betterave reçoit mot pour mot
   l'interdiction d'une anaphylaxie. Côté code, l'asymétrie est inverse : la
   ceinture de sortie ne s'arme QUE sur `medical`
   (`findMedicalConstraintViolations` : `if (constraint.severity !== "medical") continue`).
   **Le prompt traite les trois pareil ; le code n'en traite qu'un comme dur.**

**Et pourtant, sur cinq scénarios réels, le modèle a exécuté la bonne
hiérarchie presque partout** — il l'a devinée. Le seul endroit où le produit a
échoué n'est pas un endroit où le modèle a désobéi : c'est un endroit où il a
obéi **et où la ceinture de sortie a détruit son plan pour ça** (§4).

---

## 1 · LA HIÉRARCHIE TELLE QUE LE PROMPT L'ÉTABLIT AUJOURD'HUI (v13)

Ordre du message utilisateur, de la tête à la queue, avec la seule chose qui
porte un rang : la formulation.

| rang lu | bloc | ce que le prompt en dit | force réelle de la phrase |
|---|---|---|---|
| 1 (tête) | `=== THIS STUDENT'S HARD CONSTRAINTS ===` | « These are not preferences » · « NEVER suggest, recommend or include » | **obligation**, mais au rang de récence le plus FAIBLE |
| 2 | régime (`This student is VEGETARIAN: …`) | « choose a different dish rather than a version that omits it » | obligation |
| 3 | doctrine du coach | **« this block wins »** | obligation, et c'est **le seul rang écrit du message** |
| 4 | mapping alimentaire du coach | — | — |
| 5 | note 1:1 du coach | — | — |
| 6 | `-- WHO THEY ARE --` / `-- WHERE THEY ARE NOW --` | « for ONE thing: the SIZE of a portion » | cadrage |
| 7 | `-- WHAT THEY ARE AFTER --` · aspiration | « never at the cost of a hard constraint » | **rang explicite** ✅ |
| 8 | `-- HOW THEIR DAY RUNS --`, absences, apports fixes | « Do not add a meal they did not name » | obligation |
| 9 | `-- WHAT THEY CAN COOK --` · jours, équipement, temps, budget | « A session that does not fit is a session they skip » · « it is a ceiling, not a target » · « NEVER cut the portions themselves » | obligation |
| 10 | `-- WHAT THEY HAVE TOLD ME --` · écrit vs confirmé | « treat these as instructions, not as suggestions » / « treat these as preferences » | **rang explicite** ✅ |
| 11 | `-- THIS TIME --` · contexte, **envie**, couverts | **rien du tout sur l'envie** | ❌ |
| 12 | garde-manger | — | — |
| 13 | saison | « This is a PREFERENCE and never a rule … It ranks your choices; it does not veto anything » | **rang explicite** ✅ |
| 14 (queue) | `== WHAT TO COOK ==` · la commande | chiffrée | obligation |
| 15 | `CONTENT_LANGUAGE:` | — | — |

**Trois blocs sur quinze portent un rang écrit.** Les douze autres ne sont
ordonnés que par leur place dans le fichier. Et ce dépôt sait — c'est écrit
dans `household_meal_generation.ts`, et la commande est en queue pour cette
raison — qu'**un modèle lit la consigne la plus proche de la fin comme la plus
contraignante**. Le classement par position est donc à peu près **l'inverse**
du classement voulu.

## 2 · LA HIÉRARCHIE TELLE QU'ELLE DEVRAIT ÊTRE

1. **Les contraintes dures et le régime.** Absolus. Aucune envie, aucune ligne
   de coach, aucun budget, aucune minute ne les touche.
2. **La méthode du coach et ses interdits.** C'est le produit.
3. **Ce que cette cuisine et cette semaine peuvent VRAIMENT faire** — jours,
   équipement absent, minutes, argent. Un plan inexécutable n'est pas un plan
   plus petit, c'est zéro plan.
4. **Ce que la personne a écrit elle-même.**
5. **L'envie du moment, ce qui a été confirmé en conversation, la saison.**
   Ceux-là **classent** parmi ce que 1 à 4 autorisent. Ils ne vetoent jamais.

L'écart entre §1 et §2, ligne à ligne :

| écart | preuve en octets |
|---|---|
| **É-1 · aucun rang global n'est écrit** | `grep -c "outranks\|takes precedence\|in this order of priority" prompt-user.txt` → 0 sur les cinq prompts v13 |
| **É-2 · le seul rang écrit donne le sommet au coach** | doctrine : `Where this block and your own knowledge disagree, this block wins` |
| **É-3 · le prompt système ignore l'existence des allergies** | `grep -c -i allerg prompt-system.txt` → **0** ; sa seule phrase « hard limits » désigne le coach |
| **É-4 · l'envie n'a aucun rang** | `what they feel like eating THIS TIME: <texte>` — fin de ligne, rien après |
| **É-5 · la sévérité est imprimée et jamais lue** | `- beetroot — dislike, severity=preference` sous « These are not preferences » et sous « NEVER suggest, recommend or include any of the above » |
| **É-6 · la faisabilité n'est jamais mise au-dessus de rien** | `time per cooking session: about 45 minutes` — « about », et aucune phrase ne dit ce qui cède quand la méthode demande un geste que la cuisine ne sait pas faire |

## 3 · LE SILENCE — ce que le prompt ne dit pas qu'il ne sait pas

Le prompt **nomme** six absences :
`their situation: not stated.` · le rythme par défaut (« They have not told us
their rhythm… ») · `today's date: not known.` · `where they shop: not known` ·
`- (they listed nothing)` · `nothing special going on this week.`

Il en **tait douze**, en supprimant la section entière :
`-- WHO THEY ARE --` (taille, bande d'âge, sexe, activité) · `-- WHERE THEY ARE
NOW --` (poids, tour de taille) · le bloc de contraintes dures · le régime ·
`-- WHAT THEY CAN COOK --` **en entier** (jours, équipement, minutes, niveau,
répétition, **budget**) · les absences · les apports fixes · les propriétés de
jour · `-- WHAT THEY HAVE TOLD ME --` · l'aspiration · l'axe · la note du coach.

Mesuré sur le **scénario 2** (compte neuf, seule la direction remplie), prompt
réel `2a000000-2100-4000-8000-000000000001`, **5 368 caractères** : le message
ne contient **ni** `WHO THEY ARE`, **ni** `WHERE THEY ARE NOW`, **ni** `WHAT
THEY CAN COOK`, **ni** une ligne de contrainte — et rien n'y dit qu'on ne sait
pas. Le modèle a composé 9 plats, 7 préparations, 2 sessions, avec un four,
sans budget, sans savoir qu'il ignorait tout ça.

### 🔴 Le silence qui coûte le plus : `null` et `[]` sont le même prompt

`generate-meal-v1:887-891` :

```ts
let constraints = null;
try {
  constraints = await loadStudentSafetyConstraints(admin as never, userId);
} catch (error) {
  console.warn(`[${FN_NAME}] safety constraints unavailable`, error);
}
```

Une lecture EN PANNE laisse `constraints = null`, la génération continue, et
`safetyConstraintsPromptBlock(null)` rend `null` — **exactement comme pour un
élève qui n'a rien déclaré**. Le prompt d'un anaphylactique dont la table est
injoignable est **byte-identique** à celui d'un élève sans aucune contrainte.

Et la seconde moitié du double verrou tombe par le même `null` :
`applyKeelOutputLocks` reçoit `safetyConstraints: null`, voit
`constraints.length === 0`, et rend `disarmed_no_constraints`. **Un seul `catch`
muet désarme les deux moitiés à la fois.** Le type
(`readonly StudentSafetyConstraint[] | null`) porte pourtant la distinction
depuis toujours ; personne ne la lit.

**C'est un arbitrage humain** (refuser la composition ? composer en le disant ?)
et je ne l'ai pas tranché seul. Ce qui est mesuré, c'est qu'aujourd'hui la
panne est indiscernable de l'absence, dans le prompt comme dans la ceinture.

## 4 · LA CONTRADICTION — le cas construit, et ce qu'il a rendu

**Scénario 3**, construit pour que quatre lignes du même message se
contredisent :

| collision | ce que la ligne basse demande | ce que la ligne haute interdit |
|---|---|---|
| ① | envie : *« a proper tahini and sesame noodle bowl »* | `sesame — allergy, severity=medical` |
| ② | même envie : *« a roast chicken traybake »* | `This student is VEGETARIAN` |
| ③ | consigne écrite : *« dinner should be a cold salad, nothing warm »* | interdit du coach `cold_salad_dinners` |
| ④ | goût confirmé : *« beetroot is what makes a salad worth eating »* | `beetroot — dislike, severity=preference` |

### Ce que le modèle a fait — v13, run `2a000000-3100-4000-8000-000000000001`

**Les quatre collisions ont été tranchées dans le bon sens**, et il l'a dit :

- ① les neuf plats ne contiennent **aucun** sésame ni tahini ; `why` du dîner de
  mercredi : *« I cannot honour the requested tahini and sesame because of your
  medical allergy »* ;
- ② **zéro** viande, zéro volaille sur neuf plats ; `why` : *« I cannot provide
  the requested roast chicken because you are vegetarian »* ;
- ③ tous les dîners sont chauds ; le refus est nommé dans le même `why` ;
- ④ `beetroot` → **0 occurrence** dans toute la sortie.

**La sécurité a gagné, visiblement, sans qu'aucune phrase du prompt ne le lui
demande.**

### 🔴 Et le produit a rendu `HTTP 422 empty_meal`, `lock: blocked_medical_constraint`

```
{"error":"empty_meal","lock":"blocked_medical_constraint","rejected_numeric":[],
 "rejected_aisles":[],"issues":["written_instruction_unanswered: dinner should be
 a cold salad, nothing warm, I cannot face a hot plate at night", …]}
```

Le verrou rejoué **sur le texte exact que `parseGeneratedMeal` construit**
(`harness/replay_lock.ts`, même fonction, mêmes octets) :

```
texte visible: 4249 car.
morsures: 2
  · token=tahini matched="tahini" @953
    …I cannot honour the requested tahini and sesame because of your medical allergy, or the co…
  · token=sesame matched="sesame" @964
    …I cannot honour the requested tahini and sesame because of your medical allergy, or the col…
```

**Deux morsures, et les deux sont dans la phrase par laquelle le modèle explique
qu'il a REFUSÉ l'allergène.** Aucun ingrédient, aucun titre, aucune ligne de
courses ne mord — vérifié : les termes défensifs
(`plain ready-cooked noodles labelled sesame-free`,
`dairy-free puff pastry labelled sesame-free` sur le scénario 1) passent tous.

**Trois phrases du même prompt poussent le modèle dans cette phrase-là :**

1. le bloc de sécurité : *« You MAY name them to warn, to exclude, or to answer
   a direct question about them — avoiding a food requires being able to say its
   name »* ;
2. `-- WHAT THEY HAVE TOLD ME --` : *« if you cannot honour one of those, say so
   in the "why" of the dish it affects, **name the thing you could not do**, and
   say what you did instead »* ;
3. le schéma : `"why": "one sentence: why THIS dish for THIS student this week"`.

**Le prompt ORDONNE de nommer ; la ceinture tue le plan pour ce nom.** Et le
défaut est monotone dans le mauvais sens : **plus le modèle obéit à la
hiérarchie, plus sûrement son plan est détruit.** L'élève reçoit un 422 sans
une phrase d'explication ; c'est le même prix que le foyer paie en §I-2 du
rapport 1V, par un autre chemin.

⚠️ **La ceinture n'est PAS de mon périmètre** et je ne l'ai pas touchée. Ce qui
est de mon périmètre, c'est la phrase du prompt qui invite au geste fatal, sur
une lane où il est fatal — voir l'itération 02.

### Contraste mesuré dans le même lot : la même sortie est inoffensive à `strict`

**Scénario 5**, `gluten — intolerance, severity=strict` : le modèle a écrit
`certified gluten-free` **13 fois** — exactement le même geste défensif que le
`sesame-free` du scénario 3. **HTTP 200**, plan écrit, verrou rejoué : **0
morsure**. La différence n'est pas dans la sortie, elle est dans un mot
(`medical` vs `strict`) que le prompt n'explique jamais et que seul le code lit.

---

## 5 · CE QUI PRIME VRAIMENT, MESURÉ SUR LES CINQ SCÉNARIOS

Les cinq scénarios partagent un coach, un pays, un fuseau, une langue. Ce qui
varie est ce qui se dispute la place. Fixture :
`harness/2026-08-19-0110-2a-fixture.sql`.

| collision réellement présente dans le message | ce qui a gagné | où c'est visible |
|---|---|---|
| **S3** · envie ↔ allergie `medical` | **l'allergie** | 0 sésame, 0 tahini sur 9 plats ; `why` : *« I cannot honour the requested tahini and sesame because of your medical allergy »* |
| **S3** · envie ↔ régime végétarien | **le régime** | 0 viande, 0 volaille ; `why` : *« I cannot provide the requested roast chicken because you are vegetarian »* |
| **S3** · consigne écrite ↔ interdit du coach | **le coach** | tous les dîners sont chauds ; le refus est dit |
| **S3** · goût confirmé ↔ dégoût déclaré | **le dégoût** | `beetroot` → 0 occurrence |
| **S4** · envie (agneau braisé, risotto safrané) ↔ 15 min + 18 de budget + pas de four | **la faisabilité** | v13 : *« without attempting costly lamb shanks or a cooking session longer than fifteen minutes »* · v14 : *« costly saffron and slow lamb shanks do not fit this week's budget or 15-minute kitchen limit »*. Sessions : **15 min et 15 min**, aux deux itérations |
| **S1** · envie (« one proper crust ») ↔ pescatarien + sans lactose + sésame `medical` | **les contraintes** | `dairy-free puff pastry labelled sesame-free`, 0 morsure au verrou rejoué |
| **S5** · 9 contraintes + végane ↔ envie « something green and crunchy » | **les 9** | `certified gluten-free` ×13, yaourt de soja, tofu ; 0 arachide, 0 crustacé, 0 moutarde, 0 coriandre, 0 olive, 0 aubergine ; HTTP 200 |
| **S1** · absence déclarée (vendredi midi) ↔ « chaque jour a ses 3 repas » | **l'absence** | 8 plats sur 3 jours (9 − 1) |

**Verdict : sur les huit collisions construites, le modèle a tranché huit fois
dans le bon sens — et le prompt ne le lui demandait dans aucune.** Il a deviné
juste. C'est le meilleur des cas et c'est aussi le pire des diagnostics : rien
dans le produit ne le garantissait, et le seul endroit où le résultat a été
catastrophique n'est pas un endroit où il s'est trompé.

### Le seul échec, et il vient de la bonne réponse

**S3 : HTTP 422, `empty_meal`.** Le plan était juste, complet, et il a été
détruit par la phrase qui expliquait pourquoi il était juste (§4).

### Ce qui n'a PAS été mesuré, et pourquoi

Le compte OpenAI local est **à court de crédit** :
`retryable_status`, `http_status = 429`,
`error_message = "You have no credits remaining. Add credits to continue using
the API at https://platform.openai.com/settings/organizatio…"`, puis
`breaker_skip` (« LLM breaker open for provider/model »). 134 `breaker_skip` et
104 `retryable_status` en trente minutes.

⚠️ **La lane repas ne peut pas replier.** Sa chaîne, lue dans `gemini.ts:855-901`
pour un primaire `gpt-5.6-sol`, est `gpt-5.6-sol → gpt-5.4-mini → gpt-5.4-nano`
— **trois modèles OpenAI, aucun Gemini**, confirmé par la répartition en base.
Le fournisseur Gemini répond pourtant normalement au même moment (15 `success`
en une heure, pour d'autres lanes). Le repli annoncé pour les lanes solo
n'existe donc pas **contre une panne de compte** : il ne change que de modèle,
jamais de fournisseur.

**Ce que ça coûte à ce lot :** j'ai les cinq sorties de référence en v13, deux
sorties en v14 (S2, S4), et **aucune sortie en v15**. Les prompts, eux, sont
complets aux trois versions — v15 compris, capturé au runtime réel
(`2a000002-3100-4000-8000-000000000001`, 12 278 car., `json` présent des deux
côtés). **Je ne peux donc pas montrer que v15 fait passer S3 de 422 à 200.**
Je ne l'affirme pas. Ce qui est montré, c'est que la phrase de remplacement
(« one of the foods on your medical list ») rend **0 morsure** là où celle du
modèle en rendait 2 — mesuré sur le vrai moteur, pas raisonné.

---

### 5.1 · CE QUE LE MODÈLE REFUSE D'EXÉCUTER MALGRÉ UN PROMPT CORRECT

Sur les quatre runs dont j'ai la réponse HTTP complète, trois consignes du
prompt système — chacune longue, chiffrée, argumentée — sont ignorées à un taux
stable. **Ce ne sont pas des consignes de hiérarchie : ce sont des consignes de
FORME, et elles régressent alors même que la pondération, elle, tient.**

| consigne | ce que le prompt dit | ce qui sort |
|---|---|---|
| **la liste de courses se rattache aux ingrédients** | consigne + garde | `shopping_list_unattributed` : **4/28**, **3/43**, **6/25**, **6/33** — soit 14 % à 24 % des lignes, sur les quatre runs |
| **les gras, noix et sucres portent TOUJOURS `amount` et `unit`** | 7 lignes du prompt système, avec l'exemple (« a drizzle of olive oil is a tablespoon ») | `structured_quantity_missing` : **5/45**, **2/27** |
| **`same_day` sur CHAQUE plat, et « none » n'est pas « reheat_only »** | 20 lignes du prompt système, les 4 jetons énumérés, la panne nommée | `dishes[0]` et `dishes[6]` : *« same_day says none but the dish draws on 1 preparation(s) »* |

**Aucune de ces trois n'est un problème de rang.** Elles occupent déjà le prompt
système entier, en majuscules, avec leur coût écrit. Le modèle les applique
« quand ça l'arrange » — c'est la phrase que ce dépôt a déjà écrite pour les
sessions de cuisine, et elle se vérifie ici. **Une règle de FORME ne se répare
pas en la disant mieux ; celles-là sont déjà toutes vérifiées
déterministiquement, et c'est la bonne réponse.**

### 5.2 · ET DEUX GARDES QUI ACCUSENT UNE SORTIE JUSTE

Deux fois dans ce lot, la garde déterministe a signalé une faute que le modèle
n'avait pas commise. C'est la même famille que le 422 du §4, en moins cher.

1. **🔴 `dietary_regime_breach` sur un yaourt de SOJA.** Scénario 5, élève
   **végane**, run `2a000000-5100-…`, HTTP 200 :
   ```
   dietary_regime_breach: Soy yoghurt, gluten-free oats, cocoa and pumpkin seeds: yoghurt
   ```
   ×5. Le terme accusé est `yoghurt`, trouvé **dans le titre « Soy yoghurt »**.
   L'ingrédient est `plain unsweetened soy yoghurt` — végane, correct. C'est la
   cicatrice « laitue ≠ lait » du dépôt, prise par l'autre bout : ici le
   sous-mot est bien un mot, mais son qualificatif le retourne. Conséquence
   aujourd'hui : `pass-with-issue`, donc aucun repas perdu — mais **le compteur
   de brèches de régime ment**, et c'est lui qu'on lira pour décider si le
   régime est respecté.

2. **`written_instruction_unanswered` sur une consigne qui A été traitée.**
   Scénario 3 : la consigne écrite est *« dinner should be a cold salad,
   nothing warm »*. Le modèle l'a refusée ET expliquée, dans le `why` du plat
   concerné (*« …or a cold-only dinner because [le coach] … »*). Le vérificateur
   la déclare quand même sans réponse. Ce qu'il cherche et ce que le modèle a
   écrit ne se recouvrent pas.

## 6 · LES ITÉRATIONS

Détail et diffs d'octets : `iterations/README.md`.

| # | version | ce qui change | population visée |
|---|---|---|---|
| 00 | `v13_what_they_can_actually_do` | référence | — |
| 01 | `v14_what_outranks_what` | ① le bloc d'ordre, dans le cran de récence · ② l'envie porte son rang · ③ la sévérité est lue | ① tous · ② envie tapée · ③ ≥ 1 contrainte |
| 02 | `v15_the_plan_never_names_it` | ④ un plan ne nomme jamais une contrainte `medical` · ⑤ le silence de la capacité est nommé | ④ ≥ 1 contrainte `medical` · ⑤ aucune capacité déclarée |

**Byte-identité des populations non visées**, prouvée par diff, pas par
relecture : un compte sans contrainte et sans envie ne gagne en v14 **que** le
bloc d'ordre (scénario 2, diff = 20 lignes, toutes le bloc) ; le scénario 4 est
**byte-identique** entre v14 et v15 (9 283 = 9 283). Le prompt système ne bouge
pas d'un octet aux trois versions (14 382).

**Tenu par des tests, pas par une intention** : `meal_precedence_test.ts`,
11 tests. Ils mordent — mutation vérifiée : remonter le bloc d'ordre avant la
commande rend **2 tests rouges**.

## 7 · CE QUI A ÉTÉ TENTÉ PUIS RENDU — et pourquoi c'est la moitié utile

Deux corrections du silence ont été écrites, mesurées **contre des arbitrages
déjà écrits**, et retirées plutôt que forcées.

### 7.1 · Nommer l'ignorance du corps — RENDU, et la raison est la sécurité

`meal_body_test.ts::"un corps entièrement inconnu SOUS plancher rend la même
chose encore"` exige qu'un corps absent et un corps vide produisent le **même
message**, sans en-tête. Sa raison est le **plancher TCA** : `restrictionFlag`
blanchit le corps. Un en-tête d'absence rendrait le plancher **observable dans
le prompt** — un élève à risque et un compte neuf cesseraient d'être
indiscernables, et « un modèle qui remarque une absence la commente ».

**Le silence n'est pas un oubli ici : c'est la garde.** Ce qui reste vrai et non
couvert : le prompt système DEMANDE de dimensionner (« one adult portion is
roughly a palm of protein ») sans jamais dire de qui, et le **repli** n'est
écrit nulle part. Il pourrait l'être dans le prompt **système**, qui est le même
pour tout le monde et ne révèle donc rien de personne. **Hors périmètre de ce
lot — c'est la suite à prendre.**

### 7.2 · Distinguer `null` de `[]` sur les contraintes — RENDU, et c'est un arbitrage humain

`meal_body_test.ts::"sans contrainte, aucun bloc de contraintes — et pas un
en-tête vide"` exige `assertEquals(none.userMessage, unreadable.userMessage)`,
avec sa raison : « la distinction est une information d'exploitation, pas
quelque chose à raconter au modèle ».

Ma version écrivait deux en-têtes distincts et rendait ce test rouge — donc
renversait un arbitrage écrit, en passant, dans un lot qui portait sur autre
chose. Elle inventait en outre une politique que personne n'a tranchée (« sur
le chemin `null`, écarte les fruits à coque, l'arachide, le sésame, les
crustacés, l'œuf cru »), qui aurait changé le plan de tous les élèves dont une
lecture échoue.

**Retiré. La question remonte, telle quelle :** faut-il REFUSER de composer
quand la lecture des contraintes est en panne ? Aujourd'hui on compose, les
deux moitiés du double verrou sont désarmées par le même `null`, et rien ne le
dit — ni au modèle, ni à l'élève, ni dans la réponse HTTP.

Les deux tentatives, leur mesure et leur raison de retrait sont conservées **en
commentaire au point exact du code**, et un test interdit de les réintroduire
par distraction.

## 8 · CE QUI RESTE, POUR L'HUMAIN

1. **🔴 Un plan juste peut être détruit par sa propre explication.** Le prompt
   ordonnait de nommer (trois endroits) et la ceinture tue pour ce nom. v15
   retire la consigne ; **la ceinture n'a pas été touchée, et elle a raison** —
   le lot voisin `06-attribution-allergies` le pose noir sur blanc : « le 422
   n'est pas le défaut qu'on répare ». Ce qui reste ouvert : **rien ne dit à
   l'élève pourquoi il n'a pas de semaine**. Un 422 `empty_meal` est un mur.
2. **🔴 Une lecture de contraintes en panne est indiscernable d'une absence de
   contraintes**, dans le prompt ET dans la ceinture, par un seul `catch` muet
   (`generate-meal-v1:887-891`). §3 et §7.2.
3. **⚠️ La lane repas ne peut pas replier de FOURNISSEUR.** Trois modèles
   OpenAI dans sa chaîne ; un compte à court de crédit l'arrête entièrement,
   pendant que Gemini répond. §5.
4. **⚠️ Le repli de dimensionnement n'est écrit nulle part** quand on ne sait
   rien du corps. Il a sa place dans le prompt système. §7.1.
5. **La sévérité `preference` reste servie sous « These are not preferences ».**
   v15 l'explique douze lignes plus bas ; l'en-tête, lui, appartient à
   `safetyConstraintsPromptBlock`, partagé avec la conversation et la lane
   semaine. Le changer est un lot à part.

## 9 · POSTE

- **Aucun navigateur.** Tout est passé par la même porte que l'écran : un POST
  HTTP sur la fonction edge avec un JWT obtenu par mot de passe (`1234567`) —
  l'appel exact que `supabase.functions.invoke` fait depuis `MealBuilder`.
  Écritures de fixture en SQL direct, sur les tables que les écrans écrivent en
  PostgREST direct.
- ⚠️ **Le tronc a été modifié SOUS moi en cours de lot.** `safety_constraints.ts`
  et `meal_generation.ts` ont gagné un paramètre `safetyConstraintTable` à
  01:01-01:03, laissant trois appelants à un seul argument pendant deux
  minutes : `buildMealPrompt` levait alors un `TypeError` sur tout élève ayant
  une contrainte. Ce n'était pas mon lot, je n'y ai pas touché, et l'auteur l'a
  refermé. **La lane solo passe `null`**, donc byte-identique pour elle.
- ⚠️ **Ne pas lancer les scénarios en PARALLÈLE.** Ma première version le
  faisait : des dizaines de `retryable_status` puis le disjoncteur ouvert. Un
  autre agent tape le même point de passage au même moment. `harness/batch.sh`
  est séquentiel et attend que le disjoncteur se referme.
- ⚠️ **Un 502 Kong ne détruit pas la mesure.** Le conteneur edge est recréé par
  la session voisine et le run meurt en vol — mais l'appel modèle, lui, a
  souvent abouti et sa sortie est en base (`status='success'`,
  `output_text`). Trois des cinq sorties de référence ont été récupérées comme
  ça. Le `request_id` est réutilisé à chaque relance : les `attempt_start`
  s'empilent, identiques.
- Le mot « json » a été vérifié **après chaque itération**, par le harnais et
  par SQL : `json_mode`, `system_prompt ~* '\mjson\M'`,
  `user_message ~* '\mjson\M'` → `t / t / t` sur tous les runs.
- Contrôles : `deno test supabase/functions/_shared/keel/` → **3 714 passés, 0
  échec** ; `deno check generate-meal-v1/index.ts` et
  `generate-household-meal-v1/index.ts` → verts.
- **Rien n'a été commité.** Aucun `git add -A`, aucun `git stash`.

## 10 · LE TRONC EST PARTAGÉ — ce que la lane FOYER reçoit aussi

`buildMealPrompt` est appelé par `generate-meal-v1` **et** par
`generate-household-meal-v1`. Les cinq changements y arrivent donc aussi. Axe
par axe :

| axe | le foyer le voit ? | voulu ? |
|---|---|---|
| ① le bloc d'ordre | **oui** | **oui.** « Qu'est-ce qui prime » ne change pas de réponse quand la table grandit. |
| ② l'envie porte son rang | non | la lane foyer ne passe jamais `preferences` : la ligne n'existe pas dans son message, l'axe y est inerte. |
| ③ la sévérité est lue | **oui** | **oui**, et il y gagne plus : l'étape ① a mesuré un foyer où l'allergène d'une bouche lui est servi. |
| ④ un plan ne nomme pas une contrainte `medical` | **oui** | **oui**, et c'est là que le 422 a été mesuré en premier (rapport 1V, §I-2 : deux runs foyer sur trois détruits). |
| ⑤ le silence de la capacité | **oui, si** son `canCookLines` est vide | additif ; aucun test foyer n'en rougit (3 714 verts). |

**Ce sont donc des changements nécessairement communs**, sauf ② qui est inerte
côté foyer. Ils sont gardés minimaux : cinq blocs de texte, aucune structure
déplacée, aucun bloc existant supprimé.
