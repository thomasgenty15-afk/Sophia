# Master prompt — la mémoire structurée : des retours qui servent au plan suivant

> Tu es l'agent **chef d'orchestre**. Tu ne codes pas les lots toi-même : tu les
> distribues, tu fais vérifier, et tu rends compte. Lis ce document en entier
> avant de lancer quoi que ce soit.
>
> **Autorité produit :** [docs/keel/NOMENCLATURE-MEMOIRE.md](../docs/keel/NOMENCLATURE-MEMOIRE.md).
> Elle est la source de vérité sur les `kind`, `scope`, `subject`, la forme
> écrite, et la matrice des droits. **Tu ne la réinventes pas ; si elle est
> incomplète, tu la complètes et tu le signales.**

---

## 1. Le problème, en trois faits mesurés le 2026-08-18

1. **Le questionnaire de fin de plan n'a aucun lecteur.** `meal_plan_feedback` :
   la table existe, les RPC d'écriture existent, l'écran existe — et
   `grep -rn "meal_plan_feedback" supabase/functions/` ne rend **aucun lecteur**.
   On demande des retours pour faire mieux la fois d'après, et la fois d'après ne
   les lit pas.
2. **Un retour dit dans le chat vit le temps du tour.** Le dispatcher pose
   `__plan_feedback_addon` en mémoire temporaire ; il disparaît au tour suivant.
3. **Le durable est une liste plate de phrases.** `practical_constraints
   .food_preferences` — du texte libre, sans catégorie. Conséquence mesurée en
   run réel : `["Aime le brocoli s'il est rôti.", "N'aime pas le brocoli."]`
   servis dans le même prompt.

**Le but du chantier :** que ce qui est dit — au brouillon, au questionnaire, en
conversation — devienne une information **catégorisée, visible, éditable,
supprimable**, et **lue par la génération suivante**.

> ⚠️ **La promesse « rien d'opaque » est une contrainte d'architecture, pas une
> intention.** Toute information retenue doit être affichable en une phrase que la
> personne comprend, avec son origine, un bouton pour l'éditer et un pour la
> supprimer. Une donnée qu'on ne saurait pas montrer ne s'écrit pas.

---

## 2. Ce qui existe déjà — à réutiliser, jamais à reconstruire

Vérifie chacun de ces points avant de faire écrire quoi que ce soit ; ne pas les
réutiliser serait le principal gaspillage possible sur ce chantier.

| Ce qui existe | Où | Ce que ça t'évite |
|---|---|---|
| Le memorizer tourne **chaque nuit** | cron `trigger-memorizer-daily`, `0 0 * * *` | aucune cadence à construire |
| Le pont mémoire → générateurs | `reconcileFoodPreferencesFor`, appelé par **les 3** générateurs | aucun canal neuf à ouvrir |
| La carte de transparence | `FoodPreferencesCard.tsx` — propose, exige un « Keep », édite, supprime, réconcilie | le patron entier de la surface |
| Le canal provisoire | `household_envy_submissions` (500 car., une phrase du maître) | le support des `craving` |
| L'origine d'une ligne | `FoodPreferenceOrigin` : `{ item, at, source }` | la moitié de la forme écrite |
| Le seuil de promotion | `MIN_CONFIDENCE = 0.70` | pas de seuil à réinventer |

⛔ **Ce qui a été retiré exprès et ne revient pas :** la récolte d'envies **par
membre** (`mergeEnvies`, retirée le 2026-08-10). Motif écrit : elle recréait la
charge mentale que le produit promet de supprimer, et faisait arbitrer Sophia
entre un parent et son enfant. **Une seule phrase, par le maître, pour tout le
monde.**

---

## 3. La découpe, et pourquoi elle parallélise

> **Le principe qui rend le parallèle sûr : la phase 0 fige le CONTRAT COMPLET —
> les types ET les signatures que les deux côtés appelleront.** Sans ça, six
> agents écrivent contre six interprétations et la fusion coûte plus cher que le
> gain. Avec, ils écrivent contre un compilateur.

```
PHASE 0 ─ LE SOCLE ................................ 1 agent, SEUL, barrière stricte
                    ↓
PHASE 1 ─ LE MAGASIN ET SES LECTEURS .............. 4 implémenteurs EN PARALLÈLE
          chacun suivi de son vérificateur (pipeline, pas barrière)
                    ↓
PHASE 2 ─ LES TROIS PRODUCTEURS ................... 3 implémenteurs EN PARALLÈLE
                    ↓
PHASE 3 ─ BOUT EN BOUT ............................ 2 vérificateurs EN PARALLÈLE
```

⚠️ **Phase 0 est une vraie barrière.** Ne lance rien d'autre tant qu'elle n'est
pas verte. C'est la seule de tout le chantier.

⚠️ **Phases 1 et 2 : n'attends pas que tous les lots d'une phase finissent pour
lancer le vérificateur d'un lot fini.** Un lot vérifie pendant que les autres
implémentent encore.

---

## PHASE 0 — Le socle *(1 agent, seul)*

**Livrable :** `supabase/functions/_shared/keel/retained_item.ts`, **module PUR**
(ni base, ni horloge, ni aléatoire ; l'I/O ira dans un `_io.ts`).

Il porte, et **rien d'autre** :

1. **Les listes fermées** — les 8 `kind`, les 2 `scope`, la forme de `subject`.
   Fermées et écrites à la main, jamais inférées : même doctrine que
   `DIETARY_REGIMES` et `SAFETY_CONSTRAINT_KINDS`.
2. **Le type `RetainedItem`** — exactement la forme du §3 de la nomenclature.
3. **Les parseurs défensifs** — un `kind` inconnu, un `scope` inconnu, un
   `subject` malformé rendent `null`, jamais une exception, jamais un repli
   silencieux sur une valeur par défaut.
4. **La matrice des droits, EN CODE** — `canProduce(source, kind)`, qui applique
   le §5 de la nomenclature. C'est une fonction, pas une consigne de prompt :
   une règle qui ne vit que dans un prompt régresse en réel.
5. **Les invariants**, chacun avec son test :
   - `craving` ⇒ `scope` **toujours** `next_plan` ;
   - `portion.adjust` ⇒ `scope` **toujours** `durable`, et **seul** le
     questionnaire peut en produire ;
   - `portion.adjust` **à la baisse** sans `subject` explicite ⇒ **exclut les
     mineurs** ;
   - **aucun `kind` de sécurité n'existe** — et un test doit le prouver en
     échouant si quelqu'un en ajoute un ;
   - `text` non vide, sinon l'item est refusé.

**Preuve exigée :** tests Deno verts, **plus une mutation par invariant** — casse
chaque garde et montre qu'elle rougit. *Une garde qu'on ne sait pas faire échouer
n'est pas prouvée.*

**Rends dans ton rapport la signature exacte du module.** Les six agents suivants
la reçoivent verbatim.

---

## PHASE 1 — Le magasin et ses lecteurs *(4 implémenteurs en parallèle)*

### 1A · Le magasin durable *(backend)*
Étendre `food_preference_promotion.ts` / `_io.ts` pour stocker des
`RetainedItem` au lieu de chaînes plates. **Le format existant doit continuer de
se lire** : les phrases déjà en base n'ont pas de `kind` et ne peuvent pas être
reclassées sans inférence — elles restent lisibles telles quelles (voir §7 de la
nomenclature). ⛔ **Aucune migration rétroactive qui devine un `kind`.**

### 1B · Le canal provisoire et son expiration *(backend)*
Les `next_plan` sur le canal d'envies existant. **Trancher et écrire la règle
d'expiration** — une génération, ou la fin de la fenêtre du plan ? La
nomenclature laisse le choix ouvert : choisis, justifie, et **écris-le dans le
document**. L'expiration doit être **calculée à la lecture**, jamais stockée
comme un second état : *« un second état à invalider est un état dont l'écrivain
finit par disparaître »* (`accident.ts`).

### 1C · La lecture par les générateurs *(backend)*
Les trois générateurs reçoivent les items **groupés par `kind`**, et chaque
famille va où son lecteur l'attend : `food.*`/`method.*` dans la consigne de
composition, `portion.adjust` dans l'enveloppe, `rhythm.set` dans le rythme,
`logistics.set` dans `practical_constraints`, `craving` dans le bloc d'envies.
⚠️ **`portion.adjust` ne porte ni gramme ni calorie** — c'est l'enveloppe qui
traduit `{direction, magnitude}`, en aval, où le plancher TCA s'applique.

### 1D · La surface *(frontend)*
« Ce que Sophia sait de toi » devient **une destination à elle** — aujourd'hui
`FoodPreferencesCard` n'est montée que sur `/app/plan`
(`StudentWeekPlanPage:2329`), donc la transparence dépend d'un défilement. Six
sections dans l'ordre du §6 de la nomenclature. Sur **chaque ligne** : l'origine
en clair (« tu l'as écrit » / « je l'ai retenu de mardi » / « tu l'as coché au
bilan »), éditer, supprimer. La section « Pour la semaine prochaine » **affiche
sa date d'expiration**.

---

## PHASE 2 — Les trois producteurs *(3 implémenteurs en parallèle)*

Chacun applique `canProduce()` — **la matrice est dans le code, le prompt ne fait
que la répéter à un modèle qui pourrait l'oublier.**

### 2A · Le questionnaire de fin de plan
Extraire les sept réponses de `meal_plan_feedback` en `RetainedItem`.
**Et ajouter la question qui manque : « pour qui ? »**, avec la liste du foyer,
posée seulement quand la réponse de portion n'est pas neutre. C'est ce qui rend
`portion.adjust` attribuable — et c'est la raison pour laquelle le questionnaire
en est le seul producteur.

### 2B · Le retour sur le brouillon
Un appel de classification **après validation du plan**, qui transforme le texte
libre en items. Par défaut `scope: next_plan` : un retour sur un brouillon parle
de CE plan, et le promouvoir en permanent transformerait une humeur de mardi en
règle de vie. La personne peut le rendre durable depuis la carte, explicitement.
⚠️ **Modèle : `keelGenerationModel()`** — et vérifier qu'il est réellement appelé
(le générateur de foyer l'a déjà sauté en silence).

### 2C · Le memorizer et la redirection du sizing
Le chemin de promotion existant émet des items **avec leur `kind`**. Rien n'entre
sans « Keep », seuil `0.70` inchangé.
**Et le dispatcher, quand il détecte un retour de sizing en conversation, ne
classe pas : il renvoie** — une phrase, une seule, du type *« note-le au bilan de
fin de plan, j'ai besoin de savoir pour qui »*. Le produit préfère une question de
plus à une part fausse.

---

## PHASE 3 — Vérification de bout en bout *(2 agents en parallèle)*

### 3A · Backend, en run réel
⚠️ **Redémarrer `functions serve` d'abord.** Le runtime edge ne recharge pas un
`_shared` modifié — sans ce redémarrage, le run teste l'ancien code et rend un
faux vert. Vérifier ensuite : PostgREST `200`, une fonction edge `401` sans jeton
(`401` = vivante ; `500`/`503` = éteinte, et alors **aucun run n'est réel**).

Le parcours à jouer, en entier :
1. un plan est généré ; 2. le questionnaire de fin est répondu, avec « pour
qui » ; 3. les items existent en base, avec le bon `kind`, `scope`, `subject` ;
4. **le plan suivant les reçoit** — et on le prouve en lisant le prompt envoyé,
pas en supposant ; 5. un `craving` **disparaît** après sa génération ;
6. un `portion.adjust` **survit**.

### 3B · Frontend, au navigateur
⚠️ **N'entre aucun mot de passe à la main.** Obtiens un jeton via
`scripts/get-jwt.sh <persona>` (les personas sont dans `tests/real-personas/`) et
injecte la session. Si tu ne peux pas t'authentifier, **dis-le et n'affirme pas
avoir vérifié** — une vérification supposée est pire qu'une vérification absente.

À prouver : les six sections apparaissent · l'origine est lisible sur chaque
ligne · éditer fonctionne · supprimer fonctionne · l'expiration s'affiche ·
**320 px et 1280 px**, aucun débordement horizontal.
⚠️ Le panneau ne repeint qu'à **scroll 0** : décale le `body` et mesure, plutôt
que de faire défiler et regarder.

---

## 4. Règles opératoires — non négociables, à recopier dans CHAQUE prompt d'agent

1. **Branche `ff-001-quotidien-du-coach`.** Pas de push, pas de merge.
2. ⛔ **`git add -A` INTERDIT** · ⛔ **`git stash` INTERDIT** (il emporte les
   fichiers des autres sessions). Plusieurs sessions écrivent **en ce moment** :
   avant tout stage, `git diff -- <chemin>` et vérifier que le diff ne contient
   QUE ton travail.
3. **Horodate tout fichier neuf** du scratchpad (`2026-08-18-HHMM-…`).
4. **Commandes à risque, JAMAIS seul** — `db reset` (interdit même en local :
   base partagée), `db push`, `functions deploy`, `secrets set/unset`,
   `config push`, `link`. Migrations locales : `migration up` uniquement.
   Écris la commande exacte dans ton rapport pour qu'un humain la lance.
5. **Tests Deno, environnement purgé** :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
   — sinon ~114 faux rouges.
6. **Frontend** : `cd frontend && npx tsc -b` (⚠️ `tsconfig.json` a `files: []`
   et ne vérifie rien) · `npx vitest --config vitest.config.ts run`.
7. ⚠️ **`i18n/en.ts` et `fr.ts` sont tenus par une autre session** — `fr.ts`
   n'est **pas dans HEAD**. Pose les clés sur le disque pour que ça compile,
   **ne les commite pas**, dis-le au rapport.
8. **401 « Invalid JWT »** : seul geste autorisé, `./scripts/check-local-jwt-alg.sh`,
   puis lire `docs/keel/JWT-HS256.md`. ⛔ Jamais `verify_jwt = false`, jamais
   écrire dans `signing_keys.local.json` (il **doit** rester `[]`).
9. **Chaque garde neuve se prouve par mutation.** Casse-la, montre qu'elle
   rougit, restaure. Sinon elle n'est pas prouvée.
10. **Un échec ne se masque pas.** Partiel, bloqué, non vérifié : ça s'écrit.

---

## 5. Les interdits de conception — ils tiennent le chantier

- ⛔ **Aucun `kind` de sécurité.** Une allergie, une intolérance, un régime, une
  condition médicale ne naissent **jamais** d'un retour classé : elles ont
  `student_safety_constraints`, synchrone, sans ranking, avec consentement. La
  carte filtre déjà `sensitive`/`safety` **dans la requête** — cette barrière
  tient. Quelqu'un qui coche « plus jamais » sur un plat aux arachides n'a pas
  déclaré une allergie.
- ⛔ **Aucun matcher maison.** « laitue » ≠ « lait » : 12 faux positifs sur 12
  mesurés. Si une jointure ne peut pas se faire par identifiant, **arrête-toi et
  dis-le** — ne devine pas depuis un texte.
- ⛔ **Aucun prénom comme clé.** `member_id`, partout.
- ⛔ **Aucune inférence rétroactive** sur les préférences déjà en base.
- ⛔ **Rien n'entre sans « Keep »** depuis le memorizer. `memory_items` est un
  magasin probabiliste ; la confirmation est ce qui transforme une inférence en
  fait déclaré.
- ⛔ **Aucun nombre dans `portion.adjust`.** La personne dit « trop gros », pas
  « −80 g ».

---

## 6. Ce que tu rends

`scratchpad/2026-08-18-MEMOIRE-STRUCTUREE-RAPPORT.md` :

- **lot par lot** : livré / partiel / échoué, avec **la preuve** — pas « ça
  devrait marcher », le résultat lu ;
- **les deux décisions laissées ouvertes** par la nomenclature et que tu as dû
  trancher : l'expiration d'un `next_plan`, et qui gagne d'un doublon
  questionnaire/memorizer. Écris le choix **et l'option écartée** ;
- **les mutations jouées**, avec ce qui a rougi ;
- **les clés i18n laissées non commitées** ;
- **les commandes à risque** à faire exécuter par un humain ;
- **ce qui n'a pas pu être vérifié**, et pourquoi.

> **Le critère de fin du chantier, et il n'y en a qu'un :**
> une personne répond au questionnaire de fin de plan, voit sa réponse apparaître
> dans « Ce que Sophia sait de toi », peut la modifier — et **le plan suivant en
> tient compte**. Tant que ce parcours n'a pas été joué en entier, le chantier
> n'est pas fini.
