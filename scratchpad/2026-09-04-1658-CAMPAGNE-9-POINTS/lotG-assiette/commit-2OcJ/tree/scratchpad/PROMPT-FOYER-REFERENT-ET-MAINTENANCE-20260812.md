# Prompt d'agent — le référent a un écran, et personne ne mange le déficit d'un autre

Tu reprends la lane **foyer** de Sophia/KEEL. Deux décisions produit viennent
d'être prises par l'humain ; ton travail est de les livrer. Elles répondent à un
scénario précis, et c'est lui qu'il faut garder en tête tout du long :

> Une mère vit avec ses deux enfants. **Elle** veut perdre du poids. **Eux non.**
> Une seule casserole. Comment on fait ?

---

## 0. Lis ça d'abord, dans cet ordre

| Fichier | Pourquoi |
|---|---|
| `CLAUDE.md` + `AGENTS.md` | les interdits absolus du dépôt |
| `docs/keel/MODEL.md` | le coach ne produit rien de personnel — aucun canal 1:1 |
| `docs/fonctionnalites/le-foyer/README.md` | **F1 à F10**, les dix règles du foyer. Tu ne peux en contredire aucune sans le dire |
| `docs/fonctionnalites/le-foyer/FF-043-la-resolution-foyer.md` | le moteur que tu vas modifier. §3 « hors périmètre » est **engageant** |
| `docs/fonctionnalites/le-foyer/FF-047-le-corps-dans-la-part-du-foyer.md` | ce qu'on refuse de dire d'un mineur, **et pourquoi** |
| `supabase/functions/_shared/keel/household_composition.ts` | `trunkSizing`, `resolveHousehold`, `referenceMemberId`, `DELTA_CATALOGUE` |
| `supabase/functions/_shared/keel/household_portions.ts` | `SERVING_DIRECTION`, `FORBIDDEN_PORTION_TERMS` |

### Les interdits qui ne se négocient pas

- ⛔ **`supabase db reset` est INTERDIT**, même en local. `supabase migration up`
  ou `psql` sur le conteneur. Toute migration doit être **rejouable** : tu
  l'appliques **deux fois** et tu montres les deux sorties.
- ⛔ Pas de `supabase secrets set/unset`, `db push`, `functions deploy`,
  `config push`, `link`. Si tu en as besoin : tu t'arrêtes et tu donnes la
  commande à copier.
- ⛔ **Aucune calorie, aucun besoin énergétique, aucun IMC, aucune cible
  chiffrée** dans quoi que ce soit qu'un humain lise. Les chiffres vont sur
  l'ALIMENT, jamais sur la PERSONNE.
- ⛔ **Aucun fait corporel sur un mineur** ne sort du moteur — ni dans le
  prompt, ni à l'écran, ni dans un log nominatif.

---

## 1. Décision 1 — le compte maître déclare le référent

`households.reference_member_id` existe, le moteur la lit
(`resolveHousehold` → `referenceMemberId()`), et **rien dans l'app ne l'écrit**.

**Décidé : le compte maître seul, dans l'écran du foyer.** Les deux alternatives
sont écartées et le restent :

- ❌ le coach — il n'a aucun canal 1:1 vers un élève (MODEL.md) ;
- ❌ un référent **dérivé** d'une métrique ou d'un ordre d'objectifs — déjà
  refusé en périmètre FF-043 §3 : combiné à la citation de la doctrine du
  référent, ça rendrait l'objectif d'un membre **inférable par tout le foyer**.

### Ce que le référent fait, et ce qu'il ne fait pas

⚠️ **Le référent NE change PAS la taille de la casserole.** Il décide seulement
**quelle doctrine gouverne le tronc** (`trunkSafety`). Le dimensionnement reste
le `Math.min` de `trunkSizing`. Si ton implémentation fait dépendre le tronc du
référent, tu as introduit exactement le défaut que FF-043 §1 existe pour éviter.

Corollaire : **le référent n'est un choix qu'à partir de deux adultes à table.**
Dans le foyer mère + enfants, elle est référente par défaut (cascade
`declaré → composeur → null`) et l'écran ne lui apprend rien. Écris-le dans la
fiche : cet écran sert les foyers à deux adultes, pas le cas nominal.

### À livrer

1. **Une RPC d'écriture**, `keel_household_set_reference_member(p_household uuid, p_member uuid)` :
   - **maître seul** — refus nommé sinon (suis le style des refus existants,
     ex. `keel_household_detach_member`) ;
   - le membre doit **appartenir** à ce foyer ;
   - ⛔ **un mineur est refusé** (`keel_household_member_age` → `minor`), et un
     **âge inconnu aussi** — `referenceMemberId()` filtre déjà `!== "minor"`,
     donc l'`unknown` passerait ; décide, et écris ce que tu décides. La
     recommandation : refuser `unknown`, parce que `goalApplies` le refuse déjà
     pour l'objectif et que deux gardes qui divergent finissent par se
     contredire ;
   - `p_member = null` autorisé = revenir au défaut (le composeur).
2. **RLS / privilèges** : `revoke` par défaut, `grant execute` à `authenticated`
   seulement, et la garde du maître **dans la fonction** — pas seulement dans
   l'écran. ⚠️ Rappel de cicatrice : `authenticated` reçoit TOUT sur toute
   table neuve par les privilèges par défaut Supabase ; vérifie
   `has_table_privilege('authenticated', …)` après ta migration.
   `auth.uid()` est **NULL** en `service_role` — ne gate pas une RPC dessus si
   un cron doit l'appeler (ici, non : c'est un geste humain).
3. **L'écran** : `frontend/src/keel/pages/HouseholdPage.tsx`, un sélecteur parmi
   les membres **adultes**. Le libellé dit **qui**, jamais **pourquoi**, et ne
   nomme aucun objectif. Le client d'API vit dans
   `frontend/src/keel/api/household.ts`.
4. **Tests** : la cascade complète (déclaré → composeur → `null`), le mineur
   refusé, l'`unknown` refusé, un membre d'un autre foyer refusé, le non-maître
   refusé, et le retour au défaut.

---

## 2. Décision 2 — CHAQUE bouche a un corps, et une bouche sans objectif mange NORMAL

Mot pour mot, les deux décisions humaines :

> « les deltas n'ont pas d'objectif donc ils ont juste un objectif normal de
> manger selon leur poids, âge, taille c'est tout »

> « il faut la taille le poids et l'âge et le gender **obligatoirement** (même
> quand ils ont pas de compte secondaire !) »

C'est un **renversement assumé** de FF-047 §3 (« aucun fait corporel pour un
mineur ») et de FF-043 §3 (« aucune enveloppe pour un mineur »). La décision a
été prise après que la contrainte et sa raison ont été exposées. Tu la livres.
**Tu ne la rediscutes pas** — mais tu écris dans les fiches qu'elle a été
renversée, par qui, quand, et contre quoi.

### ⚠️ Le défaut que ça répare, mesuré dans le code

Aujourd'hui, `resolveHousehold` fait :

```ts
const trunk = trunkSizing(args.members);   // MIN des enveloppes d'OBJECTIF
for (const m of args.members) {
  if (m.ageState !== "adult") continue;    // ← un mineur n'a NI enveloppe NI delta
  …
}
```

Dans le foyer **une mère en `fat_loss` + deux enfants** :

- `trunkSizing` prend le MIN sur les adultes → elle est la seule adulte → **la
  casserole EST une casserole de déficit** ;
- les enfants reçoivent `CHILD_DIRECTION` et **aucun delta**.

**Les enfants mangent le déficit de leur mère.** C'est exactement le préjudice
que FF-043 §1 nomme — « la troisième mange la restriction d'un autre sans
l'avoir demandée » — et il n'était fermé que pour les adultes. C'est ça qu'on
répare.

### 🚧 CE QUI MANQUE N'EST PAS QUE DE LA DONNÉE — lis avant de coder

Collecter taille/poids/âge/sexe est **nécessaire et pas suffisant**. Deux faits
mesurés dans le code :

1. **`ageBandOf` rend `null` sous 18 ans.** `student_age.ts:223` —
   `AgeBand = "18_29" | "30_44" | "45_59" | "60_plus"`, et la fonction sort
   `null` dès `age < KEEL_MINOR_AGE`.
2. **`envelopeFor` est une équation d'ADULTE.** `meal_envelope.ts:240` :
   `10 × poids + 6,25 × taille − 5 × âge` + offset de sexe — c'est
   **Mifflin-St Jeor**, établie sur des adultes. Elle rend `null` sans
   `ageBand`, donc aujourd'hui un enfant n'a pas d'enveloppe **même avec un
   corps complet**.

⛔ **N'applique JAMAIS Mifflin-St Jeor à un enfant.** Elle sous-estime
lourdement son besoin : le besoin par kilo d'un enfant est bien plus élevé que
celui d'un adulte, et il faut y ajouter la croissance. Servir cette valeur à un
enfant de huit ans reviendrait à lui prescrire une restriction en croyant lui
servir un besoin normal — le préjudice exact que ce lot existe pour fermer,
retourné.

### 2A — La donnée : un corps par bouche, obligatoire

- `household_members` gagne **`height_cm`**, **`weight_kg`**, **`gender`**
  (`birth_date` existe déjà et donne l'âge).
- **Obligatoire** : décide où mord l'obligation et écris-le. La recommandation :
  `NOT NULL` est impossible sans casser les lignes existantes, donc un
  **CHECK** + une garde applicative + un **backfill nommé**, ou une colonne
  d'état « corps renseigné ». Ne pose pas un défaut numérique — un poids par
  défaut est un nombre inventé sur une personne réelle.
- **Bornes de plausibilité en CHECK.** Un poids de 700 kg ou une taille de 20 cm
  doivent être refusés en base, pas seulement à l'écran.
- **`gender`** : le type existant est `"male" | "female" | "other" | null`. Les
  équations pédiatriques ont des coefficients **par sexe**. Décide ce que fait
  `other` et **écris-le** — un repli silencieux sur `male` serait une décision
  prise par défaut sur le corps d'un enfant.
- **RLS / privilèges** : écriture **maître seul**, dans la fonction et pas
  seulement à l'écran. Vérifie `has_table_privilege('authenticated', …)` après
  la migration (les privilèges par défaut Supabase donnent TOUT sur toute table
  neuve).
- 🔴 **RGPD, et c'est sérieux ici.** Les tables du foyer sont **déjà hors de
  l'export RGPD** — c'est le trou n°10 du README du foyer,
  `grep -ci household account-export-v1/index.ts` rend **0**. Tu vas y ajouter
  **des données corporelles de mineurs**. Ce lot doit donc :
  - réclamer ces colonnes dans l'export **et** dans la purge
    (`_shared/account_lifecycle.ts`) ;
  - ou, si tu ne le fais pas, **refermer le trou n°10 dans le même lot** est la
    recommandation, et le laisser ouvert doit être écrit noir sur blanc comme
    une dette assumée avec son nom.

### 2B — L'enveloppe pédiatrique : LA décision de ce lot

Il faut un chemin d'enveloppe pour les moins de 18 ans. Ce n'est pas de la
plomberie, c'est une décision de modélisation, et elle doit être **avouée comme
opérationnelle** — c'est déjà la posture du dépôt pour les plafonds de densité
(FF-039 R8 : « la méta-analyse prouve la direction, pas le seuil »).

- **Les bandes d'âge** : `AgeBand` doit gagner des tranches pédiatriques. La
  référence standard découpe **0-3 / 3-10 / 10-18 ans**, par sexe. N'étends pas
  `ageBandOf` en silence : `KEEL_MINOR_AGE` gate beaucoup de choses ailleurs, et
  un `ageBand` non-`null` sur un mineur va **réveiller des chemins qui le
  supposaient `null`**. Cherche tous les lecteurs de `ageBand` et de
  `ageState === "minor"` avant de toucher à la fonction.
- **L'équation** : les équations **FAO/WHO/UNU (Schofield)** donnent le
  métabolisme de base par tranche d'âge et par sexe pour l'enfant, à partir du
  poids (variantes avec la taille). C'est la référence à utiliser, avec un
  multiplicateur d'activité. **Cite ta source dans le code**, en commentaire, et
  dis explicitement que la valeur est opérationnelle.
- ⛔ **Un mineur n'a JAMAIS d'objectif.** `goal: null` par construction reste
  vrai : un corps ne donne pas un objectif. Son enveloppe est **`maintenance`**,
  toujours, quoi qu'il y ait dans `household_members.goal`. Si le maître pose
  `fat_loss` sur un enfant, le moteur l'**ignore** — et tu écris un test qui le
  prouve.
- ⛔ **Aucun plafond de densité, aucun déficit, aucune direction dérivée** pour
  un mineur. Ce qu'on calcule est un besoin, pas une cible à réduire.

### 2C — La résolution, une fois que tout le monde a un corps

- **`trunkSizing`** prend le MIN sur **toutes les bouches à table**, plus
  seulement les adultes. Avec chaque bouche porteuse d'une enveloppe, le MIN est
  naturellement celui du plus petit besoin, et **plus personne ne mange le
  déficit d'un autre**.
  - ⚠️ Le paramètre qui arme un changement de régime est **REQUIS, jamais
    optionnel**. Ce fichier a payé sept fois « paramètre de garde optionnel =
    garde désarmée ».
  - ⚠️ **Ne recalcule pas une enveloppe à la main.** `envelopeFor` est le seul
    chemin ; un second moteur d'enveloppe à côté est le défaut le plus cher de
    ce dépôt.
- **Les deltas s'ouvrent aux mineurs** : la ligne `if (m.ageState !== "adult")
  continue;` disparaît. Un enfant reçoit un add-on quand son besoin dépasse le
  tronc, dimensionné sur son enveloppe de maintenance.
- **`familyService` et `moment: "plating"` ne changent pas.** L'adulte décide
  quoi/quand/où, l'enfant décide combien. Un add-on dressé en cuisine devant un
  enfant est la divergence rendue lisible.
- **Le delta d'un adulte sans objectif** : `maintenance`. Aujourd'hui
  `goalApplies` rend `false` quand `goal` est `null`, donc cet adulte n'a aucune
  enveloppe et compte dans `trunk.adultsStandard`. Décide, et **écris pourquoi**.
- **Le verrou de lane reste intouchable.** Un membre sous `restriction_flag` ⇒
  **toute** la lane en `per_portion`, aucune enveloppe, aucun delta, résultat
  **indiscernable** d'un foyer sans enveloppe calculable. Ne l'affaiblis pas
  pour faire passer la maintenance.

### 2D — Ce que FF-047 protégeait vraiment, et qui doit SURVIVRE

La raison de l'interdit n'était pas de ne pas **savoir**, c'était de ne pas
**dire** : « poser 152 cm, 41 kg à côté du prénom d'un enfant rend la direction
`fat_loss` dérivable sans qu'on l'ait demandée » (`meal_body.ts:247`).

Cette moitié-là garde tout son sens, et elle **ne bouge pas** :

- ⛔ **aucun fait corporel d'un mineur n'entre dans le prompt.** On calcule dans
  le MOTEUR, on n'émet que des grammes d'aliment ;
- ⛔ **aucun fait corporel d'un mineur ne sort à l'écran** ni dans un log
  nominatif ;
- ✅ la suppression de `meal_body.ts:247-248` **reste en place**. Si tu la
  retires pour « faire marcher » l'enveloppe, tu as gagné la donnée et perdu la
  protection.

C'est la ligne de partage du lot, et c'est elle qui rend la décision humaine
tenable : **collecter et calculer, jamais énoncer.**

---

## 3. Les gardes que ton lot doit laisser intactes

- **F7/F8** — l'entrée gagne des faits, **la sortie n'en gagne aucun**. Les
  consignes de service sont **lues à voix haute, à table**. « une part plus
  généreuse de légumes » est une instruction ; « pour tes 84 kg » est un verdict
  prononcé devant la famille.
- **`FORBIDDEN_PORTION_TERMS`** (`household_portions.ts`) est la ceinture
  déterministe, **bilingue**. Si tu ajoutes un mot au vocabulaire de sortie, tu
  ajoutes son test **en anglais ET en français** — cicatrice
  `guard-tested-in-one-language-only` : une garde qui connaît `weight` laisse
  passer `poids`.
- **Aucun comparatif entre assiettes**, sur aucune surface. La divergence n'est
  ni affichée ni interrogeable.
- **Aucun plat séparé.** Le delta enrichit le plat commun.
- **`member_deltas` ne porte jamais** la raison d'un delta, l'objectif d'un
  membre, un différentiel lisible, une mention de corps ou de flag.

---

## 4. Comment tu prouves que ça marche

Les tests verts ne suffisent pas ; ce dépôt a mesuré plusieurs fois qu'une garde
cassée ressemble à une garde qui marche.

1. **Une garde a besoin d'un cas qui PASSE.** Pour chaque refus que tu écris,
   écris l'appel qui réussit. Sinon tu ne sauras pas si tu as gardé quelque
   chose ou tout bloqué.
2. **Mute pour prouver.** Un test qui s'écrit contre sa propre constante reste
   vert quand on change la constante. Change la valeur, montre le rouge,
   remets-la.
3. **Le run réel, sur le scénario de l'humain.** Une génération foyer avec
   **1 adulte `fat_loss` (55 kg, 162 cm, femme) + 2 mineurs (8 et 12 ans, corps
   renseignés)**, et tu montres :
   - la bande du tronc **avant** ton lot (celle du déficit) ;
   - la bande du tronc **après** (le MIN sur toutes les bouches) ;
   - **les deltas des deux enfants**, en grammes d'aliments nommés ;
   - le prompt **intégralement**, avec la preuve qu'aucun chiffre corporel
     d'enfant n'y figure — c'est la garde de 2D, et elle se prouve en lisant la
     chaîne, pas en la supposant ;
   - qu'aucune sortie ne nomme un objectif, un corps ou une raison.
4. **La contre-épreuve pédiatrique.** Compare, pour un enfant de 8 ans, ce que
   rendrait Mifflin-St Jeor et ce que rend ton chemin pédiatrique. L'écart est
   le cœur de ce lot : montre-le en chiffres. Si les deux sont proches, ton
   chemin pédiatrique est probablement faux.
5. **Le test qui prouve qu'un objectif posé sur un enfant est IGNORÉ.** Écris
   `fat_loss` dans `household_members.goal` d'un mineur, et prouve que
   l'enveloppe rendue est celle de `maintenance`.
   ⚠️ Avant tout run réel : `docker restart` du runtime edge — un fichier
   `_shared` **modifié** n'est pas rechargé, le cache sert l'ancienne version et
   tu mesureras le code d'avant. Et lance le script Kong si tu vois des 502 :
   `functions serve` recrée le conteneur à chaque sauvegarde.
6. **La suite complète**, avec typecheck :
   `deno test --allow-all supabase/functions/`.
   ⚠️ Lance-la avec `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY` —
   les exports de QA empoisonnent la suite (114 faux rouges déjà mesurés).
   Il existe des rouges et des erreurs de typecheck **qui ne sont pas de toi**
   (`stripe-reconcile-seats`, `log_protocol_event`) : nomme-les, ne les répare
   pas, ne les cache pas.
7. **Les migrations, appliquées DEUX FOIS.** Colle les deux sorties. Et
   enregistre la version dans `supabase_migrations.schema_migrations` pour ne
   pas la rejouer au prochain `migration up`.

---

## 5. Ce que tu écris à la fin

- **Les fiches**, mises à jour et pas seulement le code : FF-043 (§3 hors
  périmètre, §4 le circuit, §11 les questions — le n°1 se referme, dis par quel
  commit), et le tableau des trous de
  `docs/fonctionnalites/le-foyer/README.md`. **Les numéros de trous ne se
  réattribuent jamais.**
- **Un rapport** dans `scratchpad/`, horodaté : ce que tu as changé, ce que tu as
  mesuré, ce que tu as décidé et **contre quoi**, ce qui reste ouvert.
- Si tu touches un fichier partagé (`meal_generation.ts`, `doctrine.ts`,
  `generate-meal-v1/index.ts`), **vérifie d'abord `git status`** : une autre
  session travaille peut-être dedans. Horodate tes fichiers de lane avant
  d'écrire.
- **Ne commite rien** sans que l'humain le demande.

---

## 6. Le piège de cette lane, en une ligne

> Le tronc est dimensionné dans le **MOTEUR**, jamais dans le prompt — et jamais
> sur l'enveloppe de quelqu'un en particulier.

Si à la fin de ton lot la casserole porte l'objectif d'une personne, tu as
recréé le défaut que toute cette fiche existe pour empêcher, et il sera lisible
par toute la famille au dîner.
