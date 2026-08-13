# RAPPORT FINAL — la plateforme est passée à la charte

> 2026-08-13, branche `ff-001-quotidien-du-coach`. Six commits, 59 fichiers,
> dix agents. Chaque nombre de ce document est mesuré et reproductible ; les
> commandes sont en §8.

---

## 1. L'avant / après, mesuré

Sur les **59 fichiers que les seize écrans montent réellement** (et non les 18
fichiers de pages que le master listait — voir §3.1), **commentaires retirés**,
parce que ce chantier exige d'écrire pourquoi une classe est partie et qu'un
comptage naïf additionne les explications :

| | avant (`f31e5274`) | après | |
|---|---:|---:|---|
| classes grises (`gray`·`slate`·`zinc`·`neutral`·`stone`, **tous** préfixes dont `accent-` `caret-` `divide-` `shadow-`) | **1 295** | **0** | −100 % |
| rayons **hors** du vocabulaire arrêté | **254** | **0** | −100 % |
| reliquats du produit grand public supprimé | **56** | **0** | −100 % |
| couleurs saturées hors `Badge` | 578 | **216** | −63 % |

**Les 216 saturées qui restent appartiennent aux quatre familles d'état, et à
elles seules** : 97 ambre (attention), 81 rouge (échec), 44 émeraude (ok),
3 bleu (info). **Zéro** `sky`, `rose`, `lime`, `orange`, `teal`, `cyan`,
`indigo`, `violet`, `purple`, `fuchsia`, `pink`, `yellow` — ni au rendu, ni dans
le code vivant.

**La garde tient aux deux bouts.** `ui/Badge.tsx` ne nomme `fig-` que dans les
commentaires qui l'interdisent ; **zéro** site d'appel `<Badge>` ne passe une
figue. Les nœuds figue en `rounded-full` rendus sont des onglets de navigation,
des boutons, des chips de choix, un interrupteur et un avatar — jamais une
pastille d'état.

---

## 2. Les trois verdicts des revues

Trois agents frais, aucun n'avait construit ce qu'il jugeait.

### La règle de couleur — **tenue**
> « Aucune saturée rendue qui ne porte pas un fait » — 18 surfaces × 2 largeurs,
> chaque valeur calculée rattachée à un échec de requête, un refus serveur, un
> enregistrement confirmé, une valeur manquante ou un verdict dérivé.

La revue a trouvé **5 récidives** dans le code vivant, toutes sur la seule
famille que le brief avait oubliée : `Badge tone="info"` posé sur une
**provenance** (×3), sur un **titre de carte** et sur un **chiffre**. Marque,
catégorie, chiffre : les trois exclus nommément. **Corrigées** (commit
`bccb7323`).

### L'accessibilité — **aucun échec de contraste sur un composant actif**
> Sur 30+ relevés d'écran aux deux largeurs, 15 couples tombent sous leur seuil
> et **les 15 sont sur des boutons `[disabled]`**, vérifié élément par élément —
> donc exemptés par 1.4.3/1.4.11. Le couple **actif** le plus serré est
> **4,72:1** (`ink-soft` sur `line`, la pastille neutre), au-dessus de 4,5.

Et les deux pièges de la palette sont tenus : **zéro bordure `line` sur un
contrôle** (les 44 champs mesurent `line-strong`, 3,84:1) et **`fig-300`
n'apparaît que sur `fig-950`** (8,06:1).

### La cohérence — **le châssis est un produit**
> Quatorze des seize écrans sont incontestablement la même maison.

Zéro rayon hors vocabulaire sur les 16 écrans, `paper` partout, zéro débordement
horizontal à 320 px, `text-label` à un seul cran. **Et la couture est prouvée au
pixel** : la barre de `/app/today` et celle de `/` sont identiques sur les dix
propriétés mesurées — 57 px, `paper/0.95`, `1px line`, sticky, `blur(8px)`,
conteneur 1 152 px, `px-4`, mot-symbole Young Serif 18 px à x=80. **Le
mot-symbole ne bouge pas d'un pixel entre la vitrine et l'app.**

---

## 3. Ce que le chantier a appris, et que le master ne savait pas

### 3.1 L'inventaire comptait les pages, pas la surface rendue
Le master listait 18 fichiers. Les seize écrans en montent **59**. Vingt-deux
composants de `keel/components/` pesant 7 419 lignes portaient **302 gris et 239
saturées** que personne n'aurait touchées : `/app/today` monte `KitchenToday`,
`DishCard`, `DeviationDialog` et `CommitmentLine`. Un agent qui n'aurait réécrit
que la page aurait livré un écran **à moitié converti**, et le défaut ne se
serait pas vu dans son diff — seulement au rendu.

### 3.2 Et mon propre audit avait le même angle mort, une couche plus bas
Mon scan d'appelants ne regardait qu'**un niveau** : depuis les seize pages. Un
composant monté seulement par un autre **composant** était invisible. Trois
familles l'ont signalé depuis leurs écrans. Un balayage **transitif** a rendu six
orphelins, dont :
- `KeelBadges.tsx` — rendait le **violet du produit supprimé comme statut**, plus
  un code-couleur de rang ;
- `DataPrivacySection.tsx` — **554 lignes**, l'écran RGPD, 37 gris et 45 saturées
  dont une **peau sombre entière** (`mode === 'architecte'`, un palier B2C mort) ;
- `keel/components/plan/` — le corps visible de `/app/plan`, qui peignait **le
  jour courant en émeraude**.

**La leçon, pour le prochain audit : un graphe d'appelants doit être transitif,
et il doit partir des ROUTES, pas des pages.** Le script est en §8.

### 3.3 Le comptage lui-même était faux, et il flattait
Mon `mesure.sh` comptait les commentaires. Comme ce chantier **exige** d'écrire
pourquoi une classe est partie, les commentaires citent `text-gray-500` et
`bg-violet-600` : le fichier le mieux documenté paraissait le plus sale (6
« morts » et 8 « gris » fantômes sur le seul lot du compte). Il comptait aussi
`rounded-card` et `rounded-full` comme des rayons divergents, donc le total
« après » ne baissait jamais. Corrigé, et c'est ce qui rend les chiffres du §1
défendables.

### 3.4 « 3 équerres au pire » était faux, et j'avais mesuré à la mauvaise échelle
J'ai gardé l'équerre dans `SectionLabel` sur une mesure qui comptait les
équerres **présentes dans le viewport à scroll 0**. Par fenêtre glissante sur les
coordonnées du **document** : **8 simultanées** sur `/coach/clients/<id>`, 7 sur
`/app/progress`. Et l'argument décisif est ailleurs : le cran `text-label` est
rendu **76 fois sans équerre**. La marque ne distinguait donc pas une catégorie
d'étiquettes — elle marquait « cette étiquette passe par `SectionLabel` », un
fait d'implémentation. **Retirée.** `/app/progress` passe de 8 équerres à 1.

### 3.5 Le seuil n'était pas la cause — et j'ai monté le seuil deux fois avant de le voir
En français, des libellés de nav **s'imprimaient l'un sur l'autre** dès 1 024 px,
en silence (`scrollWidth - clientWidth = 0`). J'ai monté la coupure à `xl` : ça a
réparé 1 024 px et rien d'autre. À `2xl` : identique à 1 536 px. **Le conteneur
est `max-w-6xl`, donc 1 152 px quelle que soit la largeur de l'écran.** Aucun
seuil ne pouvait faire tenir une rangée qui réclame ~1 184 px en français. Le
groupe secondaire est sorti de la rangée pour de bon.

**C'est le piège de la garde vérifiée dans une seule langue**, et les huit
familles y sont toutes tombées : elles ont composé et vérifié en **anglais**, où
les libellés sont 10 à 25 % plus courts et où le défaut n'existe pas.

---

## 4. Les défauts réels réparés en passant — mesurés, pas supposés

1. **Le piège du zoom Safari iOS était VIVANT sur ~40 champs.** `inputClass`
   portait `text-sm` (14 px), et ~40 champs recopiés à la main aussi. La cause
   réelle, trouvée par le lot du kit : la règle `font-size:16px` d'`index.css`
   vit dans `@layer base`, et **un utilitaire la bat** — la protection était
   contournée sans avoir été retirée. Les 44 champs de 9 écrans calculent
   maintenant **16 px** à 320 px, bordure `line-strong`.
2. **Le composeur de la conversation** — le champ le plus tapé du produit —
   avait `focus:outline-none` **sans anneau de remplacement**.
3. **Des cases à cocher sortaient en bleu système**, la teinte qu'occupe
   `Badge tone="info"` : `@tailwindcss/forms` n'est pas installé, donc `border-*`
   et `rounded-*` sont **inertes** sur une case native — seul `accent-*` agit.
   Dont, dans le lot du compte, **celle qui décide si la place d'une personne
   dans un foyer disparaît avec son compte.**
4. **`Button size="sm"` faisait 22 px**, sous les 24 px de WCAG 2.5.8 niveau AA.
   Plancher `min-h-6` posé ; mesuré à **24,0 px** exactement.
5. **Le repli de tout le produit était en noir pur.** `App.tsx` portait
   `bg-white text-black`, donc chaque texte sans couleur explicite héritait d'une
   couleur absente de la palette — et un `border-t` nu, qui prend
   `currentColor`, devenait un filet noir franc. Zéro texte et zéro filet en noir
   pur après.
6. **`DoctrineStartDialog` a gagné `role=dialog`, `aria-modal`, Échap, verrou de
   défilement et focus d'entrée** en passant à `ui/Modal` — il n'en avait aucun.
7. **`PlanImportPage` passe de zéro import du kit à vingt-quatre**, et perd
   30 lignes de code au passage.

---

## 5. Les décisions prises seul, et ce qu'elles ont écarté

| # | Décision | Pourquoi, et ce qui a été rejeté |
|---|---|---|
| 1 | **`SetupSection` perd ses 5 accents décoratifs** (type compris) | Le fichier avait raison sur le problème — quatre formulaires gris empilés se lisent comme un seul — et tort sur le moyen. La charte a une réponse dédiée à la frontière : la forme. Rejeté : garder les accents sans le violet (`sky` collide avec `info`, `rose` avec `critical`) ; cinq nuances de figue (`fig-300` est à 2,11:1 sur papier) ; garder `accent` en prop morte (elle se remplit au premier lecteur pressé). |
| 2 | **Un état peut être une SURFACE, pas seulement une pastille** | Lu au pied de la lettre, « chaque état est une pastille » condamnait `Card tone="warning"` et tout bandeau d'erreur. La garde opérante est celle de la charte : **la figue n'entre jamais dans une pastille**, et une saturée doit **porter un fait**. |
| 3 | **`primary` passe à la figue** | La marque marque la navigation et l'action. Conséquence assumée : `brand` et `primary` rendent la même chose — `brand` existait pour **confiner** la charte hors de l'app jusqu'à ce que ce chantier tranche. |
| 4 | **Le mot-symbole reste à 18 px**, sous le plancher de 20 px de la charte | C'est la valeur de la vitrine. Un logotype n'est pas du texte courant, et aligner l'app vaut mieux que gagner 2 px sur la seule couture que ce chantier existe pour effacer. Les deux écrans qui étaient à 20 px ont été **ramenés** à 18 : un inscrit voyait le mot-symbole changer de taille en passant du couloir à son espace. |
| 5 | **L'équerre sort de `SectionLabel`** | Reversement de ma propre décision, sur une meilleure mesure. Voir §3.4. |
| 6 | **Le groupe secondaire sort de la rangée de nav** | Voir §3.5. C'est sa **place** qui bouge, pas son existence : le menu le portait déjà, avec Échap et `aria-expanded`. |
| 7 | **Commits au chemin, pas au hunk** | 25 des 40 fichiers portaient du travail non committé d'autres sessions. Le chantier de traduction écrivait la ligne **juste sous** la mienne ; même à `-U0` le groupe reste contigu, et les séparer aurait committé un **revert** de son travail. |

---

## 6. ⛔ CE QUI N'EST PAS LIVRÉ, et ce qu'il faut pour le livrer

**Trois fichiers restent sur le disque, hors de tout commit** —
`WeekView.tsx` (+224/−79), `TemplatesPage.tsx` (+243/−212),
`CommitmentEditor.tsx` (+50/−18). Ils portent deux résultats importants :
l'arbitrage des statuts violets de `WeekView` et l'échelle de priorité.

**Ils ne sont pas committés parce que le gate lint les fichiers MODIFIÉS et
qu'ils portent une dette eslint antérieure au chantier** : 7
`react-refresh/only-export-components`, 5 `no-unused-vars` sur des liaisons
`_`-préfixées d'un destructuring-rest, et 1 `Cannot access refs during render`.

**La preuve que la dette est antérieure**, reproductible en §8 : les versions
d'avant le chantier rendent les **13 mêmes erreurs**, plus une quatorzième que ce
lot a **corrigée** en passant. Ce chantier a donc **réduit** la dette de ces
fichiers d'une erreur et n'en a ajouté aucune ; le gate ne les regardait pas
avant, faute de commit les touchant.

**Je ne les répare pas** parce que c'est du refactor et de la logique — déplacer
des exports dans un autre fichier, et faire passer un `ref.current` dans un
`useEffect`, ce qui **change le moment où la valeur est à jour**. Le master
l'interdit deux fois.

**Il faut donc une décision humaine, au choix :**
1. traiter la dette eslint de ces trois fichiers comme **un lot à part** (le
   geste propre), puis committer ;
2. autoriser `git commit --no-verify` pour ces trois chemins en connaissance de
   cause — `tsc` est vert, les tests sont au niveau de la baseline, seul le lint
   hérité bloque.

⚠️ **Tant que ce n'est pas tranché, ces trois fichiers sont du travail vivant que
rien ne protège** : un `git checkout` ou un `git stash` d'une autre session les
emporterait.

---

## 7. Signalé, pas réparé — les défauts que ce chantier a trouvés sans y toucher

Le registre complet est dans **`SIGNALE.md`** et dans les neuf rapports de lot.
Les six qui comptent le plus :

1. ⛔ **`/coach/billing` est cassé pour tous les coachs, et pas visuellement.**
   `keel_my_seat_ledger()` lève `42804` — 7 colonnes rendues contre 6 déclarées.
   Vérifié en appelant la RPC. La page rend **toujours** son bandeau d'erreur :
   son état nominal est inatteignable aujourd'hui. C'est du SQL.
2. ⛔ **Une réponse d'allergie s'affiche FAUSSE à la reprise.** `SetupPage` seed
   le brouillon `allergies: []` en dur avec `allergiesNone = allergiesReviewed`,
   donc quelqu'un qui a déclaré une allergie voit « Nothing to declare »
   **cochée**. Aucune perte de données, mais **un fait de sécurité affiché
   faux**.
3. ⛔ **8 contrôles de saisie sans nom accessible sur `/app/household`**
   (WCAG 1.3.1 + 4.1.2, **niveau A**). Cause de fond : `<Field>` a `htmlFor?`
   **optionnel**, et **35 des 102 appels du dépôt l'omettent**. C'est le motif
   « paramètre de garde optionnel = garde désarmée ». Le rendre obligatoire est
   un refactor de 102 sites d'appel.
4. ⛔ **Sept clés `household.error.*` sont écrites dans `en.ts` sans être
   atteignables** : ces sept refus s'affichent **en jeton brut** à l'utilisateur.
   Antériorité prouvée par `git show HEAD:`.
5. ⚠️ **La copie de `/coach` contredit le modèle du dépôt** : « You write the
   plan, you publish it » est la langue de la prescription 1:1, que `CLAUDE.md`
   nomme comme la chose « la plus souvent violée ».
6. ⚠️ **`/account` n'a aucun `h1`** et aucun Young Serif — le seul des seize.
   C'est un tiroir (`fixed inset-0`), donc il n'a jamais reçu `PageHeader`.
   Et `/upgrade` est **entièrement en français en dur** alors que son voisin
   `/app/plan` est traduit.

**Deux besoins de kit** remontés par les lots, non faits : `ui/Modal` doit
devenir refusable (`dismissible`) — sans ça la fenêtre de suppression de compte
ne peut pas l'utiliser et Échap laisserait un compte supprimé connecté ; et
`Button` n'a pas d'état « retenu », ce qui force les chips de choix à recopier
des classes.

---

## 8. Reproduire chaque nombre

```bash
# l'avant / après des 59 fichiers, commentaires retirés
bash scratchpad/plateforme/mesure.sh f31e5274   # avant
bash scratchpad/plateforme/mesure.sh            # après

# la dette eslint des trois fichiers non livrés est ANTÉRIEURE
mkdir -p frontend/src/__lintcheck__
for f in keel/components/WeekView.tsx keel/pages/TemplatesPage.tsx \
         keel/components/CommitmentEditor.tsx; do
  git show "ba55de31:frontend/src/$f" > "frontend/src/__lintcheck__/$(basename $f)"
done
(cd frontend && npx eslint src/__lintcheck__)   # 13 erreurs + 1 que le lot a corrigée
rm -rf frontend/src/__lintcheck__

# vérifier au rendu, sans taper de mot de passe dans un formulaire
bash scratchpad/plateforme/qa-session.sh house   # élève: objectif + foyer
bash scratchpad/plateforme/qa-session.sh coach   # coach AVEC élèves
bash scratchpad/plateforme/qa-session.sh gate    # élève sans objectif → /app/setup

# le harnais et les contrastes
cd frontend && npx tsc -b                        # vert
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
    -u SUPABASE_DB_URL npx vitest --config vitest.config.ts run
```

⚠️ **`vitest` doit tourner avec l'environnement nettoyé** : avec `SUPABASE_*`
exporté, la suite rend une centaine de faux rouges.

⚠️ **Le CORS des fonctions edge refuse `[::1]:5191`** (`cors.ts` n'accepte que
`localhost` et `127.0.0.1`) : quatre écrans rendent des états d'erreur dégradés
depuis cette origine. Vérifier depuis `http://localhost:<port>`.

⚠️ **Lire `outlineColor` dans le même tick que `.focus()` donne `currentColor`**
à cause de `transition-colors` — sur un bouton `primary` ça mesure 1,00:1, un
faux bloqueur tout prêt. Attendre ~200 ms.

---

## 9. L'état du harnais

**`tsc -b` : vert.**
**`vitest` : 3 échecs sur 839** — `edge/coverage-guard` ×2 (triggers et fonctions
edge non acquittés, backend) et `keel/copy/planRefusals` ×1 (§7.4). **La baseline
en comptait 5** ; les deux échecs de parité i18n sont tombés pendant le chantier,
grâce au lot de traduction. **Zéro rouge ajouté par ce chantier.**

Le critère tenu, faute de pouvoir tenir « vert » — le dépôt ne l'était pas au
départ, et le master interdit de réparer le travail en vol d'autrui :
> **zéro erreur `tsc` et zéro échec de test dans un fichier que ce chantier a
> touché.** Vérifié.

**Six commits**, un par phase :
`7666859c` l'audit · `61f2439a` le kit · `ba55de31` le shell et la purge ·
`c507de3c` les seize écrans et les orphelins · `bccb7323` les corrections de
revue · `7aa51e2f` la nav française.
