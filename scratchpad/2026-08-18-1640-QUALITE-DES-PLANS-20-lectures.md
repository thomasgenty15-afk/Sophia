# Évaluer la qualité des plans — une grille écrite, 20 plans lus

> Lot autonome. Écrit le 2026-08-18. Prérequis déclaré de
> [docs/keel/GTM-30-JOURS.md](../docs/keel/GTM-30-JOURS.md) §J0→J3 ②.

---

## Le but, et il n'est pas « tester le produit »

**Rien dans ce dépôt n'évalue si un plan est BON.** `verdictFor` et
`meal_composition_verdicts` mesurent la **conformité** — enveloppes, couverture,
sentinelles, verrous. Un plan peut être parfaitement conforme et immangeable :
sept dîners au tofu, une session de cuisine de trois heures un mardi soir, des
épinards achetés le dimanche pour être cuits le vendredi.

Le livrable est donc :

> ### Une grille écrite AVANT toute lecture, et 20 plans lus contre elle, un verdict écrit chacun.

**Pourquoi c'est un prérequis et pas du confort.** Dans deux semaines, dix foyers
réels vont utiliser le produit. L'un d'eux abandonnera. Sans cette base, **on ne
saura pas si c'est le produit ou un mauvais plan ce jour-là** — on aurait dix
témoignages et zéro conclusion. La grille est ce qui rend leur retour
interprétable.

⛔ **Ce lot ne corrige RIEN.** Il mesure. Un correctif décidé au fil de la lecture
change ce qu'on mesure au milieu de la mesure, et rend les 20 verdicts
incomparables entre eux. Tout défaut vu se NOTE, dans une section « à réparer,
par ordre de fréquence » — et c'est le livrable le plus utile du lot.

---

## Ordre imposé : la grille d'abord, les plans ensuite

**La grille s'écrit et se fige AVANT d'avoir lu un seul plan.** Une grille écrite
après coup n'est pas une grille, c'est une justification : on invente le critère
que les plans passent déjà. Cet ordre est la seule chose qui rend le résultat
opposable.

Idem pour **le seuil de décision** (§4) : déclaré avant, jamais ajusté après.

---

## 1. La grille — six lignes, à poser dans `docs/keel/GRILLE-QUALITE-PLAN.md`

Elle est **durable** (on la rejouera après chaque lot de génération), donc elle va
dans `docs/`, pas dans le scratchpad. Six lignes, et pas une septième : une grille
qu'on ne peut pas tenir dans la tête ne se rejoue jamais.

Chaque ligne rend **`oui` / `non` / `limite`** ET **une phrase écrite**. Jamais une
note seule : « 6/10 » ne se relit pas dans trois semaines, « le dimanche demande
2 h 40 alors qu'il a déclaré 90 min » se relit.

| # | Ligne | La question, telle qu'on se la pose en lisant |
|---|---|---|
| **1** | **Faisable** | Le temps de session tient-il dans ce que le foyer a déclaré (`cooking_time_min`, `cook_days`) ? Le matériel demandé existe-t-il chez eux (`kitchen_equipment`) ? Une cuisson au four chez quelqu'un sans four est un plan mort. |
| **2** | **Appétissant** | Est-ce qu'on a envie de le manger ? Question subjective, assumée comme telle — et c'est **la** question qui décide de la semaine 2. À juger sur le titre + les ingrédients, pas sur la conformité. |
| **3** | **Varié** | Sur 7 jours : combien de fois le même ingrédient porteur, la même méthode, le même plat à un mot près ? Le batch cooking pousse structurellement à la répétition — c'est le mode d'échec attendu, donc celui qu'on mesure. |
| **4** | **Logistique tenable** | Les périssables sont-ils achetés près de leur cuisson (`grocery_waves`, `PERISHABLE_AISLES`) ? Un plat cuisiné dimanche est-il mangé dans `MAX_FRIDGE_DAYS` ? L'ordre courses → cuisson → repas est-il exécutable dans le calendrier réel ? |
| **5** | **Sûr** | L'allergène déclaré est-il **absent** ? Le régime déclaré est-il **tenu** ? ⚠️ Ligne binaire et éliminatoire : un `non` ici rend le plan mauvais quoi que disent les cinq autres. |
| **6** | **La divergence est tenue** | *(plans de foyer uniquement)* Chaque bouche reçoit-elle ce qui la concerne ? Un enfant, un adulte à objectif, un régime différent — est-ce servi, ou tout le monde a-t-il la même assiette avec un mot en plus ? **C'est la ligne du positionnement** : elle échoue, la promesse échoue. |

### Ce que la grille NE contient pas, et pourquoi

- ❌ **Aucune ligne sur les calories ou les macros.** C'est ce que `verdictFor`
  mesure déjà, et le produit refuse d'afficher des nombres à un élève en
  `no_counting`. Recopier la conformité ici ne mesurerait rien de neuf.
- ❌ **Aucun jugement sur la personne.** On évalue le plan, jamais qui le reçoit —
  la règle est celle de `plan_feedback.ts`, en toutes lettres.

---

## 2. Générer les 20 plans

### ⚠️ AVANT TOUT : redémarrer le runtime edge

`_shared/keel/meal_generation.ts` a été modifié le 2026-08-18 (câblage du régime,
FF-042). **Le runtime edge ne recharge pas un fichier `_shared` modifié** — générer
sans redémarrer testerait l'ancien code et rendrait un faux résultat, sur
précisément la ligne 5 de la grille.

Relancer `functions serve` d'abord. Vérifier ensuite que la pile répond :
PostgREST `200`, une fonction edge `401` sans jeton (`401` = vivante ; `500`/`503`
= éteinte, et alors aucun run n'est réel).

### La composition des 20, déclarée à l'avance

Vingt fois le même foyer ne mesure rien. Le tirage doit couvrir ce que le produit
promet :

| Combien | Quoi | Ce que ça teste |
|---|---|---|
| 6 | **Solo**, objectifs variés (perte, prise de masse, santé) | la lane individuelle, celle qui vient d'être câblée sur le régime |
| 8 | **Foyer 2–3 personnes**, dont au moins 3 à besoins divergents | la ligne 6, c'est-à-dire la promesse |
| 3 | **Foyer avec enfant** (`age_state` mineur) | les plafonds et les gardes propres au mineur |
| 3 | **Contraintes dures** : 1 allergène, 1 régime, 1 les deux | la ligne 5, éliminatoire |

Faire varier aussi, sans en faire des cellules séparées : budget serré vs
confortable, 1 jour de cuisine vs 3, un `away_days` non vide, `content_locale`
`fr-FR` **et** `en-US` (`profiles.locale` vaut `fr-FR` par défaut — une fixture qui
ne l'écrit pas n'est pas un test de langue).

### Les comptes

`tests/real-personas/` porte des personas réels (`alex`, `eva`, `nina`, `paul`,
`rose`) et `scripts/get-jwt.sh <persona>` rend un jeton depuis leur
`connection.json`.

⛔ **Ne jamais viser un compte dont on n'a pas le mot de passe.** Forger un JWT et
écrire dans `auth.sessions` pour atteindre un compte est interdit : nommer une
fixture, ou en créer une, jamais contourner l'authentification.

⚠️ **Le harnais QA plafonne à 3 sièges d'essai** : le 4ᵉ élève fait planter le run
en cours. Si le tirage demande plus de comptes, les créer hors harnais.

⚠️ **401 « Invalid JWT »** : le seul geste autorisé est
`./scripts/check-local-jwt-alg.sh`, puis lire `docs/keel/JWT-HS256.md`. Ne jamais
poser `verify_jwt = false`, ne jamais écrire dans `signing_keys.local.json` (il
**doit** rester `[]`).

### Ce qu'on garde de chaque génération

Le plan complet (JSON brut), plus : l'identité de la fixture et ses contraintes,
le `generated_from`, le verdict de conformité, le contenu de `issues` (dont
`dietary_regime_breach` et `written_instruction_unanswered`), et la durée.

**On garde aussi les échecs.** Une génération en 500, en timeout, ou qui rend un
plan vide **compte dans les 20** et se note `non` partout. Rejouer jusqu'à obtenir
20 succès mesurerait le meilleur cas, ce qu'aucun foyer ne vivra.

> **Coût :** ~20 générations sur `gpt-5.6-sol` (5 $/30 $ par 1M). Quelques euros.
> Ce n'est pas une contrainte, c'est une information.

---

## 3. Lire, et écrire un verdict par plan

Un plan = un bloc dans le rapport = six lignes + une phrase de conclusion.

**Lire vraiment, pas parcourir.** La question de la ligne 2 (« est-ce que j'ai
envie de manger ça ? ») ne se répond pas en survolant une liste de titres. Se
projeter dans le mardi soir concerné.

**Quand une ligne est `limite`, écrire pourquoi.** C'est là que sont les vrais
défauts : un `non` franc se voit tout de suite, un `limite` répété vingt fois est
ce qui fait abandonner un foyer sans qu'il sache dire pourquoi.

---

## 4. Le seuil — déclaré maintenant, avant d'avoir lu

Proposition à figer dans la grille (à discuter avec le propriétaire **avant** de
générer, pas après avoir vu les résultats) :

| Résultat | Ce qu'on en fait |
|---|---|
| **≥ 16 / 20 bons** (les 6 lignes à `oui`, ou `limite` sur au plus une ligne non éliminatoire) | Le produit est prêt pour les 10 foyers |
| **10 à 15** | On répare d'abord ce que la liste de fréquence met en tête, puis on rejoue les 20 |
| **≤ 9** | On ne parle à personne. Le problème n'est pas l'acquisition |

⚠️ **Un `non` en ligne 5 (sûr) est éliminatoire quel que soit le reste**, et **un
seul suffit** à bloquer tout foyer à contrainte médicale : sur ce segment, un
allergène servi coûte le foyer, la communauté et la réputation.

---

## 5. Les livrables

1. **`docs/keel/GRILLE-QUALITE-PLAN.md`** — la grille, durable, rejouable. Écrite
   et figée **avant** la première génération.
2. **`scratchpad/2026-08-18-QUALITE-PLANS-RAPPORT.md`** — les 20 verdicts, un bloc
   par plan, plus :
   - **La liste des défauts par FRÉQUENCE**, du plus fréquent au plus rare. C'est
     le vrai livrable : elle dit quoi réparer, dans quel ordre, avec un nombre.
   - Le tirage réellement obtenu vs le tirage prévu (§2), et pourquoi il diffère.
   - Les générations en échec, comptées.
   - Ce qui a été tranché seul, avec les options écartées.
3. **Les 20 plans bruts**, dans un dossier daté du scratchpad, pour qu'on puisse
   relire sans régénérer.

---

## Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`.** Pas de push, pas de merge.
2. **`git add -A` INTERDIT.** Plusieurs sessions écrivent en parallèle. Avant tout
   stage : `git diff -- <chemin>` et vérifier que le diff ne contient QUE ton
   travail. Détruire du travail non commité est irréversible. Ne jamais
   `git stash` : ça emporte les fichiers des autres sessions.
3. **Horodater tout fichier neuf** (`scratchpad/2026-08-18-HHMM-...`) — collision
   de sessions.
4. **Commandes à risque, JAMAIS seul** : `supabase db reset` (interdit même en
   local — base partagée), `db push`, `functions deploy`, `secrets set/unset`,
   `config push`, `link`. Les écrire dans le rapport pour qu'un humain les lance.
5. **Tests Deno, environnement purgé** :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
   — laisser les `SUPABASE_*` en place produit ~114 faux rouges.
6. **Fixtures nettoyées à la fin**, cascade vérifiée et non supposée.
7. **Un échec ne se masque pas.** Si le lot ne peut pas aller au bout (runtime
   mort, comptes indisponibles), le dire, avec ce qui a été fait et ce qui reste.

---

## Ce qu'il ne faut PAS faire

- ❌ **Ne pas coder un « évaluateur automatique de qualité ».** Un modèle qui note
  des plans générés par un modèle mesure l'accord entre deux modèles, pas la
  qualité. Ce lot demande des lectures humaines, écrites.
- ❌ **Ne pas ajouter de colonne, de table, ni de verdict.** Rien de ce lot ne
  touche au schéma.
- ❌ **Ne pas réparer en passant.** Voir en tête : ça invalide la mesure.
- ❌ **Ne pas moyenner.** Vingt verdicts écrits, pas une note sur 10. Une moyenne
  cache exactement l'information qu'on cherche — quel défaut revient, et combien
  de fois.
