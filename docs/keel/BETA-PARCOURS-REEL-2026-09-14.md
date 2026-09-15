# Bêta autonome — le parcours réel, joué au navigateur

**2026-09-14.** Compte `lotf.camp8.s1@keeltest.dev`, foyer **végane (Lea) +
omnivore (Max)**, fenêtre de 3 jours. Aucun banc, aucun harnais : l'écran, les
mêmes boutons, le même serveur.

> ⛔ **CE RAPPORT NE CONCLUT PAS LA BÊTA.** Il joue le parcours que les trois
> rapports précédents reconnaissaient n'avoir jamais joué, il en rapporte
> **quatre défauts** dont deux touchent une surface lue par une personne, et il
> laisse **une décision** qui n'est pas la mienne.

---

## Ce qui a été joué, geste par geste

| geste | résultat |
|---|---|
| **Composer** sans budget | refus **nommé, sous le bouton** : « Dis combien ce plan peut coûter. Sans chiffre, il n'y a rien à arbitrer. » |
| **Composer**, budget 180, 3 jours | **200** en **215 s** · contrôle final `ok: true` · 0 refus · 0 bloquante |
| le plan à l'écran | 4 blocs `POUR` · **zéro viande chez Lea**, dinde chez Max · 16/16 portions dans les bornes |
| la liste de courses | 32 articles, par rayon, avec les grammes |
| **rechargement** | plan, avis de validation et blocs conservés à l'identique |
| **Prévisualiser** | **200** en **147 s** · 1 appel · 0 réparation · `ok: true` · le dialogue s'ouvre |
| **Adopter ce plan** | ⛔ **échec**, voir ci-dessous |
| l'interrupteur de pause, vraiment posé | refus **en français**, sans jeton brut |

⚠️ **Une correction de ma part.** J'ai écrit hier que le bouton « Compose »
n'envoyait rien. **C'est faux** : il refusait, avec sa phrase, à l'endroit du
clic. Je lisais la mauvaise partie de la page.

---

## ⛔ Les quatre défauts, dont le plus grave

### ① Le nom de code interne, et une chaîne anglaise, sur l'écran

L'adoption a dépassé le délai du navigateur (145 s) pendant que le serveur
continuait — il a fini par tomber à 206 s sur un appel modèle en timeout. Voici
ce que la personne a lu, au pied du dialogue :

```
[keel/planDraft] Failed to send a request to the Edge Function
```

Deux interdits d'un coup : **« KEEL » sur une surface utilisateur**, et la
chaîne brute d'une bibliothèque comme seule sortie d'une panne ordinaire.

**Corrigé**, en trois endroits :

- `planDraft.ts` — les **trois** replis (`[keel/planDraft]`, `[keel/readNote]`,
  `[keel/answerNote]`) rendent maintenant un **jeton** (`composition_unavailable`),
  le détail survivant derrière le `:` pour le journal du navigateur ;
- `household.ts` — le repli de la lane du foyer ne rend plus `error.message` ;
- `PlanDraftDialog.tsx` — ses **trois** `setFailure` posaient `e.message` tel
  quel ; ils traduisent désormais, comme `MealBuilder` le faisait déjà. Boucher
  la source sans traduire ici aurait remplacé une phrase anglaise par un code
  brut, c'est-à-dire le même défaut.

⚠️ **Le préfixe `[keel/…]` existe à ~90 autres endroits du front.** C'est une
**famille**, et la traiter entière est un chantier à part. Seul le chemin mesuré
— composer, prévisualiser, adopter — est réparé et gardé.

### ② Notre propre délai se lisait comme une panne

L'option `timeout` de `supabase-js` rend un `FunctionsFetchError` dont le message
est **identique** à celui d'un réseau coupé. L'écran ne pouvait donc pas
distinguer « notre délai a expiré, le serveur continue » de « la panne » — et
les distinguer en lisant le message serait un matcher maison sur du texte que
nous n'écrivons pas.

**Corrigé** : la borne est maintenant **notre propre `AbortController`**, et le
site d'appel sait. Nouveau motif `plan_still_composing`, avec sa phrase dans les
deux langues : *« Ça prend plus longtemps que prévu. La composition continue de
son côté — ton plan actuel n'a pas bougé. […] ne relance pas, le foyer est
encore occupé par cette demande. »*

⛔ **Il est rangé à part d'`EDGE_REFUSAL_KEYS`** (`CLIENT_OUTCOME_KEYS`) : ce
fichier porte une garde qui refuse tout jeton de cette table-là que le serveur
ne rend pas. Le ranger avec les refus edge aurait désarmé la garde pour tous les
autres.

### ③ Une phrase française qui ne veut rien dire

Sous les deux boutons « adopter » : **« Adopter le compose pour de vrai… »** —
traduction littérale de *« Adopting builds it for real »*. Corrigé en « Adopter
lance une vraie composition à partir de la même demande ».

### ④ L'identité de la casserole n'était mesurée nulle part

« Ce qu'une casserole **produit** = ce que les boîtes en **prélèvent** + ce qui
**reste** » était écrit dans trois rapports et dans aucun nombre. Sur ce
parcours : produit **6 146 g**, prélevé **6 181 g** — **-35 g**, trente-cinq
grammes servis que rien n'a cuits. C'est 0,57 %, **sous la tolérance de
`potShrinkPlan` (15 %)** : aucun verdict ne mordait, et rien ne le disait.

**Corrigé** : le compteur `pot_reconcile.reste` est publié à chaque plan. **Ce
n'est pas une garde** — poser un seuil serait décider seul d'un arbitrage
produit. Ce qui change, c'est qu'on ne peut plus écrire « les quantités se
tiennent » sans regarder la ligne qui dit de combien.

---

## ⛔ La décision qui reste, et elle n'est pas à moi

**Les deux lanes n'ont pas la même borne, et aucune des deux n'est bonne.**

| lane | écran | borne client |
|---|---|---|
| `planDraft.ts` (aperçu, adoption) | l'entonnoir, le dialogue | **145 s** |
| `household.ts` (« Composer ») | `MealBuilder` | **aucune** |

Le run réussi d'aujourd'hui a mis **215 s**. Une borne à 145 s l'aurait tué ;
pas de borne du tout laisse une attente sans fin. **Les deux options sont un
choix de SLO**, et « tout changement de SLO doit être décidé et documenté AVANT
une nouvelle campagne ».

Les trois sorties restent celles du lot 3, inchangées : effort `medium`,
remonter la passerelle, ou **ne plus faire attendre** (la demande rend la main,
le plan arrive quand il est prêt — le verrou de composition en est déjà la
moitié).

---

## Où on en est, B1 → B7

| ID | état |
|---|---|
| **B1** attribution et présence | ✅ **prouvé à l'écran** : zéro viande dans les trois blocs de la végane |
| **B2** cible unique, pas de couloir impossible | ✅ inchangé |
| **B3** aucun contrôle essentiel inconnu | ✅ inchangé |
| **B4** une seule quantité finale | ⚠️ **l'écart est maintenant un nombre publié** (-35 g), il n'est pas refermé |
| **B5** issue autonome et bornée | ⛔ **non** — la borne d'une lane tue les runs qui réussissent, l'autre n'en a pas |
| **B6** protections sur tous les chemins | ✅ inchangé |
| **B7** campagne réelle | ⛔ **à refaire** : le code a changé après la dernière campagne |

**Version** — empreintes SHA-256 (16 premiers caractères) des fichiers touchés :

```
015a9b791d72cac0  frontend/src/keel/api/planDraft.ts
dff3b05b279a2bea  frontend/src/keel/api/household.ts
cffbc5e7a44f63b5  frontend/src/keel/components/plan/PlanDraftDialog.tsx
10f7402581b9ef3f  frontend/src/keel/copy/planRefusals.ts
f0ea25d188e0a63d  frontend/src/keel/i18n/fr.ts
e412d4c349cea259  frontend/src/keel/i18n/en.ts
1324ad0ceb8cdb5c  supabase/functions/generate-household-meal-v1/index.ts
```

---

## Preuves

| Commande | Résultat |
|---|---|
| `scripts/agent-gate.sh` | **pass** |
| `deno test --allow-all supabase/functions/_shared/keel/` | **7 313 passés · 0 échoué · 2 ignorés** |
| `npx vitest run src/keel/api/planFailureWiring.int.test.ts` | **5 passés** |
| mutation ① — je retire `plan_still_composing` du site d'appel | **2 tests rouges**, les bons |
| mutation ② — je rends `e.message` à un `setFailure` | **1 test rouge** |
| mutation ③ — je retire le calcul de `reste` | **1 test rouge** (`BÊTA 1C ⑤`) |
| refus serveur réel (interrupteur de pause posé en base) | phrase française, aucun jeton brut |

## Dépense

**4 appels fournisseur** : 2 pour la composition (dont 1 réparation), 1 pour
l'aperçu, 1 pour l'adoption qui a expiré. Rien d'autre.

## Ce qui reste ouvert

1. **La décision de SLO ci-dessus** — tout le reste en dépend.
2. **La campagne à refaire sur une version figée**, après cette décision : la
   relancer maintenant mesurerait un code qu'on s'apprête à changer.
3. Le préfixe `[keel/…]`, ~90 sites hors du parcours de composition.
4. Le profil « maintien » (déclaration de taille de repas non relue par
   `keel_household_roster_for`) — inchangé depuis le rapport de campagne.
