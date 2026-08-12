# `/families` — rapport de l'agent 3

**Livrés** · `frontend/src/keel/pages/FamiliesPage.tsx` (490 lignes, namespace `families`,
97 clés) · `keys.en.ts` + `keys.fr.ts` (97 clés chacun, mêmes jeux, zéro trou
d'interpolation) · 6 figures SVG · `revue-figures.html` (planche de contrôle) ·
`preview-src/` (harnais pour VOIR la page avant que `en.ts` ait les clés — voir §6).

---

## 1. La recherche, en 5 lignes

1. **Personne, dans le voisinage, ne refuse.** Mealime (« remove allergies and dislikes »),
   Jow, Yummly, Samsung Food, Frigo Magic vendent tous une **exclusion de recettes** ; aucun
   n'écrit ce qu'il fait quand la contrainte est illisible. Le secteur s'abrite derrière
   « allergy-friendly », terme décrit comme des plus employés et des moins définis.
2. **Le profil par membre est un espace vide.** Seul PlateJoy s'en approche (quiz « 50 data
   points ») ; les autres n'ont qu'un curseur « nombre de personnes ». Et le prix est
   **toujours au foyer** (PlateJoy ~12 $/mois, Mealime 5,99 $, eMeals 5 $, Cookidoo 60 €/an) :
   « 12,99 € le foyer » n'est donc pas un avantage — **« le maître n'est pas compté, plafond
   8 »** l'est.
3. **Les mots de la douleur** : « on mange quoi ce soir », « charge mentale des repas »,
   « cuisiner deux fois » ; en anglais « what's for dinner », « short order cook », et
   « the hardest part of cooking isn't the chopping — it's the deciding ».
4. **L'objection n°1 n'est pas le prix**, c'est « je ne délègue pas la sécurité de mon enfant
   à une app » — elle ne se lève pas par un adjectif mais par un **comportement démontré**.
   Viennent ensuite le piège de l'abonnement (non adressable ici : §8 n°1 de l'audit interdit
   tout geste d'achat) et « ma famille ne mangera pas ça » (adressé par C12).
5. **Tabous** : l'AAP proscrit tout propos de **poids ou de régime** visant un enfant
   (« health not weight ») ; les associations d'allergies proscrivent « sûr / safe / sans
   risque / allergy-friendly », qui fabriquent un faux sentiment de sécurité. La page n'écrit
   aucun de ces mots — **contrôlé par grep, zéro occurrence**.

## 2. Le message, en 12 phrases

1. Vous nourrissez trois bouches ou plus, et elles n'ont pas les mêmes besoins.
2. Une seule casserole part sur la table.
3. L'allergie d'une seule bouche gouverne tout ce qui entre dedans.
4. Les contraintes de toutes les bouches sont réunies **avant** que le plan existe.
5. Si cette union ne peut pas être lue, **rien n'est composé** : Sophia s'arrête et nomme la
   raison, elle ne devine pas.
6. Un plan qui manque se redemande ; un plan qui a supposé se mange.
7. Vos enfants sont dans ce plan sans compte, sans écran, sans mot de passe.
8. On demande quatre choses par bouche : prénom, date de naissance, objectif, allergies.
9. La part suit l'âge, et un mineur n'est **jamais** une cible : la règle est structurelle.
10. Vous écrivez en une ligne ce dont la maison a envie, et le plan compose avec.
11. 12,99 € le foyer entier, la vôtre n'est jamais comptée, plafond huit bouches — le produit
    ne vous fait pas payer d'être une famille.
12. Et voici, en toutes lettres, les six choses qu'il ne fait pas.

## 3. Mes décisions

| # | Décision | Pourquoi |
|---|---|---|
| 1 | **Le refus est l'argument central**, pas la commodité | C'est le seul endroit où le produit fait ce qu'aucun concurrent ne promet. La figure B montre les **deux** sorties, et la couleur de marque est dépensée sur la branche qui **échoue** — une page de vente qui colore la réussite décore. |
| 2 | La boîte « illisibles » est **vide** quand celle du haut est pleine | Le lavis porte « ce qui a été composé » ; son absence porte le reste. Trouvé au rendu, gardé exprès. |
| 3 | Le code `safety_constraints_unreadable` est **affiché** | L'objection se lève par un comportement vérifiable. Montrer le nom réel du refus coûte trois mots et achète la crédibilité que « nous prenons les allergies au sérieux » n'achète pas. |
| 4 | Les deux assiettes de la figure D sont **le même `<use>`** | En dessiner une plus petite pour l'enfant affirmerait une mesure qui n'atteint aucun écran — et sur cette page, ça ressemblerait à un régime d'enfant. Ce qui diffère s'écrit. |
| 5 | Le trou de C9 est **nommé** dans le bloc sombre | « La réponse du chat ne relit pas l'union » — et la page dit pourquoi le mot « partout » n'y est écrit nulle part. Sur un sujet d'allergie, la limite nommée est ce qui rend le reste croyable. |
| 6 | J'ai ajouté un **non-claim** non demandé (i6) | « Sophia ne remplace ni la lecture d'une étiquette, ni l'avis d'un médecin. » Rien ne l'exigeait dans l'audit ; le sujet l'exige. |
| 7 | Le **+2 € du profil réclamé est dit** (C1) | L'omettre rendait « 12,99 € et rien d'autre » faux dès qu'un second adulte veut son accès. Un supplément annoncé coûte moins qu'un supplément découvert. |
| 8 | Titre du héros **raccourci** après mesure | Le premier jet faisait 460 px de haut (7 lignes de display). Le `<h1>` porte désormais la thèse seule (263 px), la casserole et la table sont passées au chapô. |
| 9 | La figure passe **avant** le texte dans la seule section « Le refus » | Ce mécanisme se voit plus vite qu'il ne se lit ; ailleurs, l'inversion serait un tic. |
| 10 | `text-base` retiré du CTA au profit d'une valeur arbitraire | **Mesuré** : `text-base` perd contre le `text-sm` de `buttonClass` (14 px rendu), la valeur arbitraire passe, le padding gagne sans artifice. Une classe qui ne fait rien est un mensonge dans le code. |

## 4. Mes claims, et leur identifiant d'audit

| Où | Claim | Audit | Ancre citée en JSX |
|---|---|---|---|
| Héros (`h1`) | L'allergie d'une bouche gouverne toute la casserole | **C9** | `generate-household-meal-v1:1643-1648` · `household_safety.ts:201` |
| Héros (note) | 12,99 €, une bouche de plus ne change pas le prix | **C1** | `20260810260000_household_billable_profiles.sql:235-250` |
| Le refus | Contraintes illisibles ⇒ rien n'est composé, la raison est nommée | **C9** | `generate-household-meal-v1:1674-1680` (503 `safety_constraints_unreadable`) |
| Les bouches | Les enfants sont dans le plan sans compte ni écran | **C8** | FF-044 · `20260810260000…:179-190` (`user_id = null`) |
| Les bouches / sortie | Quatre champs demandés, **aucune durée** | **C14** | `onboarding.ts:650-662` |
| Les parts | La part suit l'âge ; une génération visant un mineur est refusée | **C10** | `student_age.ts:199-202` · `generate-week-plan-v1:435-457` (409 `minor_student`) · `household.ts:115-121` |
| L'envie | Une ligne, écrite par vous, lue par le générateur | **C12** | `keel_household_submit_envy` · `generate-household-meal-v1:1579-1589` |
| Le prix | 12,99 € le foyer, jamais compté, plafond 8, +2 € par profil réclamé | **C1** | `…:235-250` · `…:101-105` |
| Sombre i1 | Le chat ne relit pas l'union du foyer | **C9 trou** | `run.ts:2211` · FF-046 §7 n°8 |
| Sombre i2 | Aucune courbe de poids | **C16** | `20260812220000:118` |
| Sombre i3 | Chiffres éteints par défaut, plusieurs verrous | **C15** | `20260812230000:60` · `energy_gate.ts:228-249` |
| Sombre i4 | Pas de conseil de famille, aucun compte rendu d'arbitrage | **C11** | FF-050 §3 |
| Sombre i5 | Pas d'application mobile | **C17** | absence confirmée |
| Sombre i6 | Ni étiquette, ni avis médical — **non-claim délibéré** | — | aucun : c'est une négation, pas une promesse |
| Sortie | `/start` | **C13** | `onboarding.ts:84` (branche `family`) |

**Ce que je n'ai PAS écrit**, et qui aurait été facile : « partout » / « dans chaque
réponse » (trou C9) · une durée d'ajout (C14/S8) · « sûr », « safe », « sans risque »
(objection n°1, mais elle se lève autrement) · « jamais de calories » (§8 n°2) · une durée
d'essai ou un bouton d'achat (§8 n°1) · le conseil de famille (§5.2) · un suivi de poids
(C16) · le moindre chiffre de charge mentale trouvé en recherche (S8 : aucune source dans
le dépôt).

## 5. Vérifications passées

- **490 lignes** de TSX (barre : ≤ 490). Un seul `<h1>`. 15 commentaires `fact:` ancrés.
- **`tsc --noEmit`** : 101 erreurs sur ma page, **toutes** « clé i18n absente » (97 clés
  × leurs répétitions), **zéro** autre. C'est l'attendu tant que l'orchestrateur n'a pas
  fusionné les packs.
- **Parité i18n** : mêmes 97 clés des deux côtés, zéro clé définie non utilisée, zéro clé
  utilisée non définie, zéro trou d'interpolation divergent.
- **Typographie française** : 45 espaces insécables **U+00A0**, **zéro U+202F** (mesuré),
  zéro apostrophe droite dans une valeur, zéro « → ».
- **Figures F1-F14** : les six passent la liste de contrôle — `--ill-fig` exactement **2×**,
  zéro décimale, zéro Bézier, zéro `opacity/filter/gradient/shadow`, zéro couleur d'état,
  épaisseurs `1` et `2` uniquement, `<title>` + `<desc>` référencés.
- **Rendu réel** (harnais §6) : les 8 sections relues en 1280 px, et **320 px sans aucun
  débordement de page** (`scrollWidth == clientWidth == 320`) — les six figures tombent sur
  leur plancher de 380 px et défilent **dans leur conteneur**, comme `tokens.css` §4 le
  prévoit.

## 6. Comment revoir la page (et pourquoi c'est un détour)

`t()` **lève** en dev sur une clé inconnue : tant que `families.*` n'est pas dans `en.ts`,
la page ne peut pas s'afficher, route ou pas. `preview-src/` contient donc un harnais qui
copie la page hors dépôt, remplace `t()` par un stub lisant `keys.fr.ts`, et **construit**
un HTML statique (aucun second serveur de dev) :

```bash
bash scratchpad/site/families/preview-src/rebuild.sh   # écrit un apercu-page.html à ouvrir
```

Il neutralise `SEO`, `PublicHeader` et `PublicFooter` (hors de mon périmètre). Les artefacts
de build ne sont pas laissés dans le dépôt — `scratchpad/` **n'est pas** ignoré par git.

## 7. Deux points pour l'orchestrateur

1. **`Button.tsx` est encore en `bg-gray-900`.** Mon CTA passe par le primitif `ButtonLink`
   sans forcer sa couleur : il rendra `fig-700` le jour où le primitif est re-stylé, sans
   toucher à ma page. Tant que ce n'est pas fait, le seul bouton de la page est gris-noir
   au milieu d'une page figue. Je n'y touche pas — le primitif ne m'appartient pas.
2. **`families` va dans `PUBLIC_NAMESPACES`**, pas dans
   `PUBLIC_NAMESPACES_PENDING_TRANSLATION` : le pack français est livré en même temps que
   l'anglais.
