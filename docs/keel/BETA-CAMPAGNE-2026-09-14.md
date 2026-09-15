# Bêta autonome — la campagne réelle, et la décision

**2026-09-14.** 25 demandes réelles, modèle facturé, par la passerelle.

> ⛔ **VERDICT : BÊTA BLOQUÉE.**
> Le **délai** et le **taux de premier jet** ne tiennent pas, et de loin.
> Aucune violation essentielle n'est signalée sur les 22 plans livrés — mais
> voir la réserve du § « ce que ce rapport ne prouve pas ».
>
> ⟳ **CORRECTION DU 2026-09-14.** La première version de ce rapport publiait
> **20/25 utilisables** en résumé et **22** dans la table par profil. Deux
> nombres pour une même question, et c'est le résumé qui avait tort : mon
> analyseur filtrait sur `deliverable_with_gaps` — le mot du TYPE TypeScript —
> alors que le champ publié rend `livrable_avec_ecarts`, en français. Deux
> tirs livrables (N=4, s4 et s5) disparaissaient du total. **Le nombre est
> 22/25**, relu ligne à ligne depuis les résultats individuels.

---

## Les seuils du plan, un par un

| Seuil | Exigé | Mesuré | |
|---|---|---|---|
| Zéro violation de B1–B6 sur un plan activé | 0 | **0 bloquante sur 22 plans** | ✅ |
| Utilisables **sans** appel de réparation | ≥ 24/30 | **13/25** | ⛔ |
| Utilisables **après** le parcours complet | ≥ 27/30 | **22/25** | ⛔ |
| Au moins 4/5 par profil | 6 profils | **5 profils sur 6** — le sixième n'a jamais tiré | ⛔ |
| p95 de bout en bout | ≤ 100 s | **248 s** | ⛔ |
| Aucune attente sans issue au-delà de 120 s | 0 | **7 tirs sur 22 dépassent la passerelle** | ⛔ |
| Zéro 546 inexpliqué | 0 | **1** | ⛔ |

**Un seuil sur sept est tenu. C'est celui du fond, et c'est le plus dur.**

---

## Le relevé

```
tirs 25 · 200 : 22 · 422 : 2 · 546 : 1
durée   min 88,7 s · médiane 119,5 s · p95 248,4 s · max 261,5 s
au-dessus de 150 s (la passerelle) : 7 / 22
```

| profil | 200 | sans réparation | livrables | médiane | > 150 s |
|---|---:|---:|---:|---:|---:|
| N=1 perte | 4/5 | 3/5 | 4/5 | 110,9 s | 0/4 |
| N=1 prise | 4/5 | 2/5 | 4/5 | 131,8 s | 2/4 |
| N=2 objectifs différents | 5/5 | 4/5 | 5/5 | 110,9 s | 1/5 |
| N=2 **végane + omnivore** | 4/5 | 2/5 | 4/5 | 125,5 s | 1/4 |
| N=4 présences variables | 5/5 | 2/5 | 5/5 | **215,0 s** | 3/5 |
| N=1 maintien | **0/5** | — | — | — | — |

---

## Les trois échecs, nommés

| tir | statut | cause |
|---|---|---|
| N=1 perte · s3 | **422** | `mouth_unfed` · `no_dish` — le modèle n'a écrit **aucun plat** pour lundi soir, et les deux réparations ne l'ont pas comblé |
| N=1 prise · s2 | **422** | idem, même case |
| N=2 végane · s5 | **546** | `WORKER_LIMIT` après **203 s** — le worker edge tué par sa limite |

⛔ **Les deux 422 sont des refus JUSTES.** Rien n'a été écrit, l'ancien plan est
intact, et la personne aurait vu une phrase du produit. Ils comptent dans le
dénominateur — c'est ce que le plan exige — mais ils ne servent aucune
assiette fausse.

⛔ **Le 546 est le cas que je disais impossible à injecter.** Il est arrivé tout
seul, à 203 s. C'est le worker tué : ni `catch`, ni `finally`, donc le verrou de
composition reste pris jusqu'à sa péremption. La parade écrite au lot 2 est la
seule qui existe, et elle vient de servir pour de vrai.

---

## ⛔ Le profil qui n'a jamais tiré, et ce qu'il révèle

Le profil « N=1 maintien, appétit petit et **dîner léger** déclaré » a été refusé
**par le harnais**, cinq fois, avant tout appel :

```
rythme          [{"slot":"dinner","size":"light"}]   (student_goals.practical_constraints)
relecture       [{"slot":"dinner","size":null}]      (keel_household_roster_for)

⛔ LA DÉCLARATION N'EST PAS ARRIVÉE DANS LA SOURCE QUE LE MOTEUR LIT.
```

Une taille de repas écrite dans `practical_constraints` **n'est pas relue** par
la source du générateur. Le harnais a refusé de tirer parce que le tir aurait
mesuré autre chose que ce qu'il annonce — et il a eu raison.

⚠️ **Je n'ai pas établi si c'est un défaut du produit ou de mon profil.** Le banc
pose la même déclaration par une autre porte (`--leger=`, les habitudes), qui
marche. Deux canaux pour une même déclaration, dont un muet : à instruire.

---

## Ce que la campagne dit du temps

⛔ **Les réparations sont le coût.** Les tirs sans réparation tiennent ; ceux qui
en demandent franchissent la passerelle.

| appels de réparation | tirs | médiane |
|---:|---:|---:|
| 0 | 13 | ~103 s |
| 1 | 3 | ~150 s |
| 2 | 6 | ~190 s |

Et c'est **N=4** qui en demande le plus : médiane 215 s, trois tirs sur cinq
au-dessus de la coupure.

⚠️ **Mes six tirs d'avant la campagne disaient 90 à 125 s, zéro dépassement.**
Ils tournaient sur des comptes DÉJÀ remplis par les campagnes précédentes ; la
campagne, elle, part de comptes neufs. Je ne sais pas si c'est la cause, et je ne
le devinerai pas — mais la leçon est la même que ce matin : **six tirs choisis ne
sont pas une distribution.**

---

## ⛔ Ce que ce rapport NE prouve pas

**« Le moteur est bon, seul le délai pose problème » est une conclusion que ces
chiffres ne portent pas**, et la première version de ce rapport l'écrivait quand
même.

Ce qui est établi : sur 22 plans livrés, **aucun contrôle armé n'a signalé de
violation essentielle** — zéro ingrédient interdit, zéro bouche sans repas, zéro
allergène servi, zéro plan non mesuré publié.

Ce qui ne l'est pas :

- ⛔ **Un écart de quantités subsiste, et il est écrit dans le lot 1.** La masse
  d'une casserole ne suit pas son rétrécissement : 170 g décidés, **7 g**
  réellement partis. Les courses baissent, la masse non. Tant que « produit =
  prélèvements + reste » n'est pas vérifié, **B4 n'est pas démontré** — et B4
  est un critère de fond, pas de délai.
- ⛔ **Un profil sur six n'a aucune mesure.**
- ⛔ **Le parcours utilisateur n'a jamais été joué.** « Aucune violation
  signalée par les contrôles » ne dit rien de ce qu'un écran montre.

« Zéro violation **signalée** » et « zéro violation » ne sont pas la même
phrase. La différence, c'est exactement ce qui reste à faire.

## Ce qui bloque, en plus du fond

1. **13/25 au premier jet** contre 24/30 exigés. Presque un plan sur deux a
   besoin du modèle une seconde fois.
2. **Une réparation coûte ~90 s**, et la passerelle coupe à 150. Deux
   réparations sortent du tuyau.
3. Le 546 confirme que le mur du worker est atteint pour de vrai.

Ces trois-là pointent vers la même sortie, la troisième du rapport du lot 2 :
**ne plus faire attendre**. Le verrou de composition écrit au lot 2 en est la
moitié — il sait déjà dire « une demande tourne, voici son identifiant ».

---

## Dépense

**≈ 36 appels fournisseur** sur la campagne (25 compositions + 11 réparations),
plus 11 avant elle. Le plafond théorique du plan (30 + 60) n'a pas été atteint.

## Ce qui reste ouvert, sans détour

- Le profil « maintien » n'a pas de mesure.
- Le parcours utilisateur au navigateur n'a pas été joué.
- La masse de casserole ne suit toujours pas son rétrécissement.
- Le relevé par demande relié aux versions n'existe pas.
