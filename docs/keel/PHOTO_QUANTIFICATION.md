# Réponse au fondateur — les photos, la quantité, et où est vraiment le trou

Tu as challengé une position que j'avais prise vite. Tu avais raison de le faire, et le résultat n'est pas celui que tu attendais ni celui que je défendais. J'ai fait tourner 85 appels réels sur **notre** modèle (`gemini-3.1-pro-preview`, payload exact de `buildVisionPayload`, vérité terrain calculée depuis USDA SR Legacy) avant d'écrire une ligne. Verdict en une phrase : **le trou existe, mais ce n'est pas les calories — c'est la quantité. Et la solution ne demande pas de toucher au contrat.**

---

## 1. Comment le tracking marche aujourd'hui

Trois chemins d'entrée écrivent tous dans la même table, `protocol_events` :

```
PHOTO WhatsApp    meal-photo-upload-v1        → source:'photo'      → analyze-meal-photo-v1 (async)
TEXTE WhatsApp    sophia-brain/tools/always_on/log_protocol_event   → source:'chat'
TAP web           frontend/src/keel/api/keelClient.ts:263           → source:'quick_tap'
```

Sur la branche photo, `_shared/keel/meal_analysis.ts` produit : `detected_foods`, `food_groups_present/absent`, **`portion_band` ∈ {small, moderate, large, unclear}**, `commitment_matches[]` (verdict `consistent|partial|inconsistent|not_visible` par ligne du protocole), `confidence_band`, `image_quality`. Un filtre regex (l. 195-210) supprime tout champ kcal/macro que le modèle émettrait quand même, et l'enregistre dans `dropped_measurement_fields` — la suppression est auditable.

Ensuite `evaluator.ts` note chaque ligne du protocole du coach en `met | partial | missed | flex_used | unknown`. Puis `adherence.ts` : `coverage` (a-t-il reporté ?) et `adherence` (a-t-il suivi ?), **jamais fusionnées**. Poids `core=3 / secondary=2 / optional=1`. Sous 4 jours loggés sur 7, `computeWeekAdherence` retourne un objet `{kind:'insufficient_data'}` qui **ne contient aucun champ pourcentage** — le coach ne peut pas voir un % faux, il n'existe pas.

Le coach lit (`CoachStudentPage.tsx:66`) : `logging_coverage`, `core_adherence_pct`, `overall_adherence_pct`, `evaluable_days`, `flex_used`, `flex_allowance`, `outcomes`.

---

## 2. Le trou, nommé précisément

**Le trou n'est pas « on ne compte pas les calories ». Le trou est que KEEL produit déjà le signal de quantité, et le jette.**

Regarde la chaîne réelle :

1. `meal_analysis.ts:706` calcule `portion_band`.
2. `buildMealAnalysisContent` (l. ~996) l'écrit dans la colonne **`content` jsonb**.
3. `content` jsonb est **NON-INPUT #2 de l'évaluateur** (R5). L'évaluateur ne le lit jamais. Un test de propriété l'interdit.

Donc : le modèle voit une assiette manifestement énorme, l'écrit `large`, et l'évaluateur note exactement la même chose que pour une portion `small`. Le coach ne le voit nulle part. **C'est le trou, et il est structurel, pas doctrinal.**

Conséquence en cascade, déjà documentée dans `docs/keel/Q6_NUTRITION_LAYER.md:37` : une ligne « fibres ≥ 30 g/jour » revient `missed` **tous les jours, à vie**, pour un élève qui mange parfaitement — parce que `matchEvent` n'a pas de branche pour la mesure et que seule une saisie manuelle de grammes pourrait la satisfaire.

Et le point que tu formules mieux que moi : si un coach écrit « assiette 1/2 légumes », KEEL sait aujourd'hui répondre *« il y a des légumes »*. Il ne sait pas répondre *« il y en a la moitié »*. C'est de la **magnitude ordinale**, pas de l'énergie. Et — point décisif — **NON-INPUT #4 l'autorise déjà, mot pour mot** :

> « a photo may evidence `presence`/`composition`/**`portion`/`serving`**; it never produces a `micronutrient` or `energy`/`macro_*` fact. »

Le contrat n'a jamais interdit la quantité. Il interdit l'énergie. On s'est auto-censurés sur une ligne qui nous autorisait.

---

## 3. Les photos sont-elles fiables ? Le verdict, couche par couche

### Reconnaissance des aliments — OUI, fiable
~87-97 % d'identification correcte (l'asymétrie déjà écrite en tête de `meal_analysis.ts`). Sur mon banc, condition FULL (grammages fournis) : **MAPE 2,3 %, biais +1,9 % non significatif**. Cas F1 : vérité 661,8 kcal → estimé **662**. Le modèle connaît les tables USDA par cœur. **Le problème n'est pas la connaissance nutritionnelle.**

### Estimation des portions — MOYENNE, mais exploitable en bandes
Condition VAGUE (portions en langage naturel) : MAPE 26,7 %, **biais +13,5 % non significatif**. Traduit en 3 bandes ordinales, une erreur de 27 % en magnitude ne déplace le classement que sur les cas frontière. C'est de la **classification**, pas de la régression.

### Calories sur UN repas — NON, et le mode de défaillance est le pire possible
Condition photo réelle (portion non chiffrée **et** invisible absent de la description) :

```
MAPE par repas   : 26,6 %
BIAIS moyen      : −26,6 %   ← significatif
Signe            : 5/5 repas, 18/20 appels sous-estimés
Bland-Altman     : −108 kcal, IC95 [−154, −62]  ***
Régression       : estimé = 12,5 + 0,788 × vérité   (pente d'atténuation)
Répétabilité     : CV intra-cas 1,87 % → 662/662/662
```

Deux mécanismes séparés par le banc : **omission structurelle** (l'invisible, ~−170 kcal/repas) et **atténuation d'échelle** (pente 0,788 : +100 kcal de vrai = +79 kcal d'estimé). Le second est le *flattened slope* de la littérature d'auto-déclaration, reproduit par le modèle.

Test de l'invisible, décisif : sur O1/O2/O4/O5, l'erreur **vs la partie visible est +2,0 %** ; l'erreur **vs la réalité est −28,0 %**. Le modèle restitue exactement ce qu'on lui montre et n'ajoute **aucune** provision. Son propre champ `assumptions` le dit — *« Aucune matière grasse ajoutée n'a été comptée »* — avec `confidence: "high"`.

Biais lipides : **+3,7 % quand la graisse est déclarée, −47,0 % quand elle est invisible.** Ça réconcilie la contradiction entre les études (angle 1 dit sous-estimation, angles 2/4 disent surestimation) : **le modèle surestime la graisse qu'il voit et rate intégralement celle qu'il ne voit pas.**

Et il ne sait pas qu'il ne sait pas : intervalle demandé à 90 %, **couverture réelle 58 %** (25/43). Sur les 5 cas OMIT : couverture **1/5**, `confidence: high` sur les 5. On ne peut pas déléguer l'humilité au modèle.

### Agrégation sur une semaine — LA question décisive, et la réponse est NON
C'est le cœur de ta nuance, et elle est mathématiquement juste : une erreur aléatoire à ±40 % décroît en 1/√n. **Mais notre erreur n'est pas aléatoire.**

```
MAPE par repas : 26,6 %   →   erreur de la SOMME : 25,5 %   (2 670 vs 3 584 kcal)
```

L'agrégation a divisé l'erreur par **1,04**. Bootstrap sur 21 repas/semaine : total hebdo à **−13,2 %** médian, **−19 %** sur la condition photo pure. Et `CV intra-cas 1,87 %` ⇒ **ré-interroger le modèle N fois ne réduit rien** ; l'erreur est dans le modèle, pas dans le tirage.

### Le contre-résultat qui ferme la porte de sortie
Les quatre angles de recherche recommandent tous « n'affichez que des deltas, un biais stable s'annule dans une différence ». **Mesuré chez nous, c'est faux.**

| cas | delta vrai | delta estimé | erreur |
|---|---|---|---|
| P1 | −38,2 % | −26,6 % | +46,4 % |
| P3 | −40,1 % | −26,1 % | +50,3 % |
| P5 | −46,8 % | −28,6 % | +68,3 % |

**Erreur sur le niveau : 19,6 %. Erreur sur le delta : 49,0 %. Le delta est 2,5× pire.** Raison : le biais n'est ni additif ni multiplicatif, il dépend de la taille du repas (pente 0,788). Petit repas = moins d'invisible omis ⇒ quand la portion baisse, la sous-estimation baisse aussi et **le modèle sous-déclare l'ampleur du changement**. Ce qui survit : **direction correcte 5/5**. Donc *« tu as réduit »* est fiable ; *« tu as réduit de 27 % »* ne l'est pas — la vérité était 38 %.

### Le bon comparateur
Il faut être honnête dans l'autre sens aussi : sur **la même photo**, l'IA bat déjà le diététicien diplômé (36 % vs 44-48 % d'erreur de portion, Lo et al. : MAE 46,3 g vs 48,5 g). Et l'auto-déclaration humaine sous-déclare de 27,4 % en moyenne, avec un biais **différentiel** — 20-30 % chez les IMC élevés, précisément la cible d'un coach. Refuser de quantifier ne nous ramène pas à un meilleur instrument.

### Donc : la position « on refuse de quantifier » est-elle indéfendable ?
**Elle est juste sur les calories, et indéfendable sur la quantité.** Le raisonnement écrit dans le copy (« des nombres faux et confiants » = argument de bruit) est faux — c'est un argument de biais. Et le chiffre `42-110 %` de `Q6_NUTRITION_LAYER.md:139` est du cherry-picking : c'est Gemini 1.5 Pro, pas l'état de l'art (frontier = 35-36 %), et **chez nous c'est 2,3 % quand on donne les grammes**. À corriger en interne : si on défend le refus par l'inexactitude, on perd le débat le jour où un modèle passe à 15 %.

---

## 4. La recommandation — une seule

> **On ne quantifie pas l'énergie. On câble la quantité qu'on jette déjà. Le contrat ne bouge pas.**

**Faut-il estimer les calories ?** Non. Ni affiché à l'élève, ni affiché au coach, ni **en interne pour la tendance**. Cette troisième porte est celle que je pensais ouvrir, et mon propre banc la ferme : le delta est 2,5× pire que le niveau, et l'agrégation hebdo ne divise l'erreur que par 1,04. Un chiffre interne qui n'existe que pour produire une tendance produit une tendance fausse — et un élève en surplus verrait un bilan rassurant, parce que **le système ment le plus fort sur les gros repas et sur les graisses ajoutées**, exactement ce qu'un coach cherche à voir.

**Ce qu'on câble à la place :** `portion_band` promu du `content` jsonb vers une **colonne token** sur `protocol_events`, lisible par l'évaluateur. Trois bandes ordinales + `unclear`. Ça satisfait `measure IN ('portion','serving')` (déjà dans `tokens.ts:178-179`), c'est déjà autorisé par NON-INPUT #4, c'est de la classification, et sur la classification le modèle est excellent.

**Comment présenter l'incertitude sans mentir ni être inutilisable :** on ne présente pas une incertitude, on présente une **granularité honnête**. « Portion large » n'a pas besoin de barre d'erreur — le token *est* la fourchette. C'est structurellement supérieur à « 620 kcal ±200 », parce qu'un intervalle affiché invite à lire le point central, et que notre IC90 couvre 58 %.

**La copy.** À garder, justification à réécrire. Elle est vraie et faible ; elle doit devenir vraie et forte :

> *« KEEL ne compte pas les calories. Pas par prudence : par mesure. Sur nos propres tests, une estimation depuis photo ne se trompe pas au hasard — elle sous-estime de 27 %, dans le même sens à chaque fois, et elle sous-estime le plus quand vous mangez le plus. Une moyenne hebdomadaire ne répare pas ça : elle divise l'erreur par 1,04. KEEL lit votre assiette contre le protocole que votre coach a écrit, et vous dit si la portion est petite, normale ou grande. Ça, on sait le faire. »*

**Le risque TCA change-t-il selon à qui on montre le chiffre ?** Oui, mais pas dans le sens attendu. Vers l'élève, le risque est **comportemental** : 73 % des patients TCA disent que MyFitnessPal a contribué à leur trouble (Levinson 2017 — attention, la revue 2025 PMC12547374 cite « 83 % », c'est une erreur de citation, ne pas la propager). Vers le coach, le risque est **juridique** : un chiffre calorique entre les mains d'un coach non-diététicien le pousse vers la prescription individualisée, réservée aux RD dans les États US à *exclusive scope*, où les coachs santé ne sont licenciés nulle part. **Le chiffre coach-only ne supprime pas le risque, il le déplace de l'élève vers KEEL.** Contrepoids honnête à ne pas cacher : en cadre supervisé, la prise en charge comportementale *réduit* les symptômes TCA (méta-analyse 2024 PMC10909435, g=−0,27 global, g=−0,66 hyperphagie, aucun essai en hausse) — KEEL étant supervisé par un coach humain, c'est un argument *pour* nous. Les bandes ordinales n'ont, elles, aucun des deux risques.

### Le delta technique

| # | Fichier | Travail | Jours |
|---|---|---|---|
| 1 | `_shared/keel/meal_analysis.ts` | Prompt anti-omission (l. 376) : dire au modèle que la description vient d'une photo et que huile/sauce/sucre/boisson y sont invisibles. Mesuré : −26,6 % → **−11,6 %** de biais, **coût zéro token**. Sert ici à la *composition* (« il y a de l'huile ajoutée »), pas à l'énergie. | 0,5 |
| 2 | Migration + `analyze-meal-photo-v1` | `protocol_events.portion_band` en colonne token (CHECK sur les 4 valeurs), écrite aux deux sites d'insert. `content` jsonb reste NON-INPUT #2. | 1 |
| 3 | `_shared/keel/evaluator.ts` | Branche `matchEvent` pour `measure IN ('portion','serving')` : la bande gradée en ordinal contre la cible du coach. **`quantity`/`unit` restent null** — on ne fabrique pas un nombre. | 1,5 |
| 4 | `_shared/keel/adherence.ts` + `CoachStudentPage.tsx` | Remonter la distribution des bandes au coach (« 4 assiettes `large` cette semaine sur 11 »). | 1 |
| 5 | Relance WhatsApp ciblée | Une question après la photo sur l'invisible. Mesuré : biais → **−7,8 %** (3,4×). Ici, elle sert la conformité (« cuisson sans huile ajoutée »), pas le comptage. C'est le vrai différenciateur : une app muette ne peut pas poser la question. | 2 |
| 6 | Fix `Q6_NUTRITION_LAYER.md:37` | Une ligne « fibres » ouverte revient `missed` à vie. Doit retourner `unknown`, pas `missed`. | 0,5 |
| 7 | `_shared/vision.ts` | **3/85 réponses (3,5 %) sont du JSON malformé** malgré `responseMimeType: "application/json"`. Aucune réparation JSON. Vérifier que `parseMealAnalysis` échoue proprement plutôt que de perdre la photo. | 0,5 |

**Total ≈ 7 jours.** Et **le CONTRACT NON-INPUT #4 n'est pas modifié** — il autorisait déjà `portion`/`serving`. Ce qui change, c'est qu'on arrête de contredire notre propre contrat par excès de zèle.

---

## 5. Comment on dit au coach que ça avance

Ordre imposé par la recherche, pas par l'esthétique. **Peterson 2014** (Obesity, n=220 femmes obèses) a testé exactement notre question : un score de « comprehensiveness » composé de *heure + nom de l'aliment + quantité + calories*. Résultat : **aucun effet sur le changement de poids (p>0,05)**, alors que la **fréquence** de log est fortement prédictive (β=−0,03, t=−6,74, **p<0,0001**, R²=0,210), modérée par la consistance (interaction p=0,004, seuil utile >3 jours/semaine). Réserve honnête : c'est observationnel, personne n'a jamais randomisé la *précision* du log — mais c'est symétrique, il n'existe non plus aucune preuve que le chiffre aide. La charge de la preuve est sur celui qui veut l'ajouter.

**Ce que le coach voit le lundi matin, dans cet ordre :**

1. **Couverture — la métrique la plus prédictive.** « 5 jours sur 7 loggés. » C'est la variable qui prédit le résultat clinique, elle passe en premier et en gros. Sous 4/7 : `insufficient_data`, **aucun pourcentage** (`adherence.ts`, déjà en place — c'est un type de retour, pas un flag).
2. **Adhérence core.** « 82 % sur les lignes `core`. » Pondérée 3/2/1, `unknown` hors dénominateur.
3. **Distribution de portions — le nouveau.** « 11 assiettes vues : 2 `small`, 5 `moderate`, 4 `large`. » C'est la réponse à *« il mange beaucoup ou peu ? »*, sans un seul kcal.
4. **Les 2-3 lignes qui décrochent**, avec la photo en pièce jointe. Le coach ne veut pas un nombre, il veut voir l'assiette (Precision Nutrition, grille des « 5 W », où le *What* est explicitement le facteur **le moins** important).
5. **Outcomes** — poids en moyenne glissante, faim/énergie/sommeil. Signal externe, non dérivé de la photo.
6. **Trend, jamais avant la semaine 3** : « couverture ↑, portions `large` ↓ ». Direction et signe uniquement — **jamais l'ampleur** (direction 5/5 correcte ; ampleur fausse de 12,5 points).

---

## Deux avertissements pour l'équipe

**(a) Ce sujet est activement pollué par de l'astroturfing.** Les quatre angles de recherche ont indépendamment buté sur le même réseau : un faux institut `dietaryassessmentinitiative.org`, une fausse étude `DAI-VAL-2026-01` avec DOI Zenodo fabriqué, promouvant une app « PlateLens » à **1,1 % de MAPE** — soit ~30× mieux que toute étude évaluée par les pairs, et meilleur que la tolérance légale de 20 % des étiquettes. Relayé par au moins 9 domaines-coquilles (`calorie-trackers.com`, `nutrition-apps-ranked.com`, `rdrecommended.com`, `clinicalnutritionreport.com`, `bitebench.com`…). Si quelqu'un refait cette recherche et tombe dessus, il conclura à tort que le problème est résolu. Idem pour « 68 % d'adhérence photo vs 41 % manuel » (source : content-marketing, aucune étude) et « chute de 50 % après 7 jours attribuée au NIH » (introuvable). **À noter dans `docs/keel/`.**

**(b) Limites de ma propre mesure, assumées.** Entrée **texte**, pas image — donc mes chiffres sont un **plancher d'erreur** ; la vraie photo ajoute l'erreur de reconnaissance par-dessus. n=15 repas, cuisine occidentale. La relance testée était de qualité oracle (elle nommait l'élément caché) — un vrai élève répondra plus flou, donc **−7,8 % est une borne haute**. Et la calibration par coefficient unique (k=1,235 → biais +0,3 %) laisse **SD 18,1 points par repas**, avec un biais qui varie de −14,5 % à −48,1 % **selon le type de repas** : un coefficient par personne ne tiendrait que si son mix de repas est stable. C'est l'hypothèse qu'il faudrait tester en pilote — 10-15 élèves, 2 semaines, photo + pesée — **avant** d'envisager quoi que ce soit de quantitatif. Elle n'est pas démontrée, et rien dans la littérature ne la démontre non plus.

**Fichiers de mesure** (scratchpad, hors repo) : `/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/70d250d9-1637-4bd3-a8f6-5f657bfa1fc0/scratchpad/` → `truth.js`, `run.js`, `run2.js`, `analyze.js`, `analyze2.js`, `analyze3.js`, `results.json`, `results2.json`.