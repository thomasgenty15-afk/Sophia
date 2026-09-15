# Prompt — évaluation de la qualité des plans en conditions réelles

> À passer à un agent. **Il ne modifie rien. Il produit un rapport.**

---

Dépôt `/Users/ahmedamara/Dev/Sophia 2`, branche `ff-001-quotidien-du-coach`. Base locale **up**.

Tu évalues **la qualité des plans que ce produit génère, en conditions réelles**. ⛔ **Tu ne corriges RIEN, tu ne commites AUCUN fichier de production. Tu rends un RAPPORT.**

## ⛔ Le budget — lis-le avant tout

**Dix générations de modèle, pas une de plus** : **7 en solo**, **3 en foyer**. Chacune coûte. ⛔ **Si un run échoue pour une raison d'infrastructure** *(Kong, runtime éteint, JWT)*, **répare et relance — ça ne compte pas.** ⛔ **Si un run aboutit et que le plan est mauvais, tu le GARDES et tu le rapportes.** Tu ne relances jamais pour obtenir un plan plus flatteur. **Compte tes générations dans `llm_usage_events` et donne le delta final.**

## Avant de commencer — trois vérifications

1. ⛔ **Redémarre le runtime edge** *(`docker restart supabase_edge_runtime_Sophia_2`)*. Cicatrice mesurée : un fichier `_shared` **modifié n'est pas rechargé**, et tu mesurerais l'ancien code.
2. ⛔ **Étends le timeout Kong** : `scripts/local_extend_kong_functions_timeout.sh`. Sans ça, les 502 ressemblent à des tours perdus.
3. ⛔ **Vérifie le JWT** : `./scripts/check-local-jwt-alg.sh`. Si tu vois **401 « Invalid JWT »**, **NE TOUCHE À RIEN** — lis `docs/keel/JWT-HS256.md`. Ne passe **jamais** une fonction en `verify_jwt = false`, n'écris **jamais** dans `supabase/signing_keys.local.json`.

⛔ **Ne vise JAMAIS un compte dont tu n'as pas le mot de passe.** Fixtures connues : `fixture.v0c.master@keeltest.dev`, et les personas `qa0805.*@keeltest.dev` *(mot de passe usuel `1234567` — vérifie, ne suppose pas)*. **Connecte-toi par `grant_type=password` et prouve-le.** ⚠️ Un agent a déjà forgé des JWT et écrit dans `auth.sessions` faute de fixture nommée : c'est interdit.

---

# PARTIE 1 — SOLO, 7 plans de 3 jours

**Un profil qui se complique à chaque run.** Tu modifies les informations de l'élève **entre** les runs, tu régénères, tu observes.

| # | ce que tu ajoutes au profil précédent |
|---|---|
| **S1** | **Socle** : adulte, corps renseigné, objectif `maintenance`, aucune contrainte |
| **S2** | **+ un objectif directionnel** : `fat_loss` |
| **S3** | **+ un régime** : `vegan` |
| **S4** | **+ une allergie médicale** *(arachide, ou un allergène du catalogue)* |
| **S5** | **+ des contraintes de cuisine** : peu de jours de cuisson, temps court par session |
| **S6** | **+ un budget** serré, **+ de l'activité** déclarée |
| **S7** | **Le cumul dur** : tout ce qui précède, **+ un second interdit** *(un aliment détesté, ou une règle de maison)* |

⚠️ **Écris quel champ tu changes, et où tu l'écris** *(table et colonne)*, avant chaque run. ⛔ **Change UNE chose à la fois** — sinon tu ne sauras pas ce qui a produit l'effet.

# PARTIE 2 — FOYER, 3 plans avec 3 bouches

**Trois personnes à table.** Tu fais bouger leurs informations personnelles entre les runs.

| # | la table |
|---|---|
| **F1** | Trois adultes, **un seul régime divergent** *(un végane, deux omnivores)* |
| **F2** | **+ un mineur avec un objectif** *(remplace un adulte, ou s'ajoute)*, **+ une absence déclarée** sur quelques créneaux |
| **F3** | **+ une allergie médicale sur une bouche SANS COMPTE**, **+ une capacité de cuisine réduite** |

⚠️ **Note qui porte quoi**, et **qui est titulaire** — seul le maître de maison peut générer.

---

# Les deux angles de relecture — pour CHAQUE plan

## ① L'angle NUTRITIONNISTE — *« est-ce que ça a du sens pour cette personne ? »*

Pour chaque plan, réponds **avec les chiffres du plan**, pas d'impression :

- **L'énergie va-t-elle dans le bon sens ?** Déficit pour une perte, surplus pour une prise, et **de combien**. Compare à l'objectif déclaré.
- **La protéine est-elle cohérente** avec le corps et l'objectif ?
- ⛔ **Le régime est-il RESPECTÉ ?** Cite **chaque plat** et **chaque ingrédient** qui le viole, s'il y en a. ⚠️ Attention aux **analogues végétaux** — « lait d'avoine » chez un végane **n'est pas** une violation.
- ⛔ **L'allergène est-il ABSENT ?** Vérifie **les ingrédients, pas seulement les titres**.
- **La variété** : combien de plats distincts sur 3 jours, combien de répétitions.
- ⛔ **Sur le foyer** : le mineur est-il **jamais en déficit** ? Chaque bouche reçoit-elle une part **cohérente avec son corps**, ou tout le monde a-t-il la même ?
- **La cohérence sur les 3 jours** : est-ce un plan, ou trois journées sans lien ?

## ② L'angle RÉALISTE — *« est-ce que quelqu'un peut vraiment le faire ? »*

- ⛔ **La liste de courses existe-t-elle, et arrive-t-elle AVANT le premier repas qui en a besoin ?** C'est la question explicite du propriétaire. Si les courses sont au jour 2 pour un repas du jour 1, **le plan est infaisable**.
- ⛔ **Chaque ingrédient d'un plat est-il DANS la liste de courses ?** Cite les manquants.
- ⛔ **La conservation tient-elle ?** Décision produit signée : **jour de cuisson + 2**. Cuit vendredi ⇒ mangé vendredi, samedi, dimanche. **Lundi est trop tard.** Cite chaque violation.
- **Les sessions de cuisine** tiennent-elles dans les jours et le temps déclarés ?
- ⛔ **Les quantités sont-elles plausibles ?** Cherche l'absurde : 900 g d'huile, 12 œufs pour une personne, un plat sans quantité du tout.
- **Les restes sont-ils réellement consommés**, ou disparaissent-ils ?
- **Le budget** : le plan cite-t-il un plafond, et le panier tient-il dedans ? ⚠️ **Sache que le produit ne peut PAS le prouver** — le plafond porte sur les courses, le calcul sur le panier du plan, qui en est un sous-ensemble. **Dis ce que tu vois, sans conclure au-delà.**
- ⛔ **Sur le foyer** : une **absence déclarée** produit-elle quand même un contenant pour cette bouche ? *(Défaut connu, fiche `D3′-d` — vérifie s'il se reproduit.)*

---

# Comment tu rapportes

⛔ **Commence par un VERDICT de cinq lignes maximum, en français simple**, lisible par quelqu'un qui ne lit pas de code : **les plans sont-ils bons, oui ou non, et quel est le défaut le plus grave ?**

Puis, **un tableau par plan** : le cas *(S1…S7, F1…F3)*, ce que tu as changé, le verdict nutritionniste, le verdict réaliste, et **le défaut le plus grave de ce plan**.

Puis, **ce qui se dégrade avec la complexité** : ⛔ **c'est le cœur de l'exercice.** À partir de quel cas le plan commence-t-il à casser ? **Le cumul dur (`S7`, `F3`) tient-il, ou s'effondre-t-il ?**

Enfin :
- **Ce qui marche bien** — sois précis, ne fais pas de politesse.
- **Les défauts, classés par gravité**, chacun avec **le plan et le plat qui le montrent**.
- ⛔ **Ce que tu n'as PAS pu vérifier, et pourquoi.**
- **Le compte exact de tes générations.**

## Les interdits

- ⛔ **Tu ne modifies AUCUN fichier de production. Tu ne répares RIEN.** Un défaut trouvé se **décrit**, il ne se corrige pas.
- ⛔ **JAMAIS `git stash`, `git reset`, `git add -A`, `git add .`, `git checkout .`**.
- ⛔ **JAMAIS `supabase db reset`, `db push`, `functions deploy`, `secrets set`/`unset`, `config push`, `link`.** ⚠️ Écrire dans les tables de **fixture** pour faire varier les profils est **autorisé et attendu** — c'est le sujet. **Note chaque écriture.**
- ⛔ **JAMAIS `AGENT_GATE_SKIP_TESTS`.**
- ⚠️ **Le plan `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md` est PARTAGÉ** : si tu y écris, une seule passe à la fin, relis juste avant, **déclare**.
- ⛔ **Distingue toujours ce que tu as MESURÉ de ce que tu déduis.** Une hypothèse nommée vaut mieux qu'une affirmation.
