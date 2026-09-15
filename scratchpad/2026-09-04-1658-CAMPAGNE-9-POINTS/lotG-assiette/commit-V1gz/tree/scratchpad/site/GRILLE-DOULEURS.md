# La grille des douleurs — les six segments et les deux halls

> **Autorité de contenu pour la refonte des pages vitrines.** Arbitrée avec le
> propriétaire du produit les 12 et 13 août 2026.
>
> Chaque ligne se lit **douleur → besoin → ce que fait Sophia**, et la troisième
> colonne porte son ancre dans le code. **Une section de page = une ligne.**
>
> Les douleurs sont classées **par force de vente**, pas par logique : la
> ligne 01 de chaque page est celle qui fait dire « c'est moi » en cinq secondes.

---

## Comment lire

| Colonne | Ce qu'elle porte |
|---|---|
| **La douleur** | Ce que la personne vit, dans ses mots. Jamais une fonctionnalité manquante. |
| **Le besoin** | Ce qu'elle cherche une fois la douleur nommée. C'est ce qui rend l'achat rationnel. |
| **Ce que fait Sophia** | Le mécanisme **réel**, avec son ancre. Pas de promesse sans preuve. |

---

# CHEZ VOUS

## Seul — `/meal-prep` · branche `solo`

*J'ai un objectif, et je porte tout : décider, acheter, cuisiner, tenir.*

**01 · Mon objectif n'a aucune traduction dans mon assiette**
- **Douleur** — Je sais ce que je vise, mais rien ne me dit ce que ça change ce soir. Je trouve des conseils partout, jamais un plat.
- **Besoin** — Un programme de plats qui serve *mon* objectif, pas des principes à traduire moi-même.
- **Réponse** — Un programme de plats composé à partir de l'objectif déclaré. **Six objectifs, six façons de servir le même plat** : perte de gras · prise de muscle · recomposition · performance · santé · maintien.
- **Ancre** — `SERVING_DIRECTION` (`_shared/keel/household_portions.ts`) : six consignes distinctes, pas un champ décoratif.

**02 · Décider coûte plus cher que cuisiner**
- **Douleur** — C'est la décision qui épuise, pas la casserole.
- **Besoin** — Ne plus décider. Recevoir une semaine déjà composée, et du temps repris sur les courses.
- **Réponse** — La semaine arrive en **sessions de cuisine**, pas en plats isolés : on cuisine moins souvent, pour plusieurs jours. Les courses tombent en **vagues** qui suivent la fraîcheur.
- **Ancre** — `interface CookingSession` (`meal_generation.ts:518`) · `MAX_FRIDGE_DAYS = 3`.
- ⚠️ Les vagues sont **masquées quand il n'y en a qu'une** : ne pas promettre la cadence sur un plan court.

**03 · Un imprévu, et toute la semaine tombe**
- **Douleur** — Un dîner dehors, une journée qui déraille. C'est là qu'on abandonne, pas au premier jour.
- **Besoin** — Que la semaine encaisse sans être refaite.
- **Réponse** — Décaler un plat, décaler une session, ou dire qu'on ne cuisine pas ce soir. Le reste se réaligne.
- **Ancre** — `REALIGNMENT_ACTIONS` (`accident.ts:995`).
- ⛔ **Échanger un plat n'existe pas.** Ne jamais l'écrire.

## À deux — `/couples` · branche `pair`

*Deux directions qui divergent, une seule cuisine.*

**01 · Deux objectifs = deux casseroles = abandon**
- **Douleur** — Deux plats, deux fois le travail. Au bout de quinze jours l'un lâche, et entraîne l'autre.
- **Besoin** — Un seul plat qui serve les deux directions, pour continuer à manger la même chose.
- **Réponse** — Une casserole, deux parts décrites. Le plat est le même ; ce qui change est l'instruction de service.
- ⚠️ **En MOTS, jamais en grammes** : les grammes sont calculés mais n'atteignent **aucun écran** (FF-043 §11 n°1).
- ⚠️ **Pas de « garanti »** : rien ne vérifie que le modèle a différencié.

**02 · « Il mange deux fois plus que moi »**
- **Douleur** — Même objectif, pas le même corps, donc pas la même faim — et une part identique en frustre toujours un.
- **Besoin** — Que la part suive *la personne*, pas seulement l'objectif affiché.
- **Réponse** — Taille, poids, âge et sexe de chacun entrent dans le calcul de la part. Deux personnes au même objectif n'ont pas la même assiette.
- **Ancre** — `household_member_bodies` → `generate-household-meal-v1`. Collecté et calculé, jamais énoncé en chiffres.

**03 · Un seul des deux planifie**
- **Douleur** — L'autre subit ce qu'on lui sert et n'a aucune prise.
- **Besoin** — Que l'autre existe dans l'outil avec son objectif à lui.
- **Réponse** — Le profil réclamé lui donne son accès, son objectif et sa ligne. La charge se partage au lieu de se déléguer.
- **Ancre** — FF-048 · +2 €/mois. Le maître n'est jamais compté.

## En famille — `/families` · branche `family`

*Trois bouches ou plus, des besoins qui ne se ressemblent pas.*

**01 · « On mange quoi ? », tous les soirs**
- **Douleur** — Pour des gens qui ne veulent pas la même chose. La question revient même quand la réponse d'hier était bonne.
- **Besoin** — Une seule décision pour toute la table, une seule casserole à surveiller.
- **Réponse** — Un plat pour tout le monde, et pour chaque bouche la part qui lui va.

**02 · La charge est toujours sur la même personne**
- **Douleur** — Penser, acheter, arbitrer — et se souvenir de ce que chacun ne mange pas.
- **Besoin** — Que ce qu'on sait de chacun soit écrit **une fois**, pas re-mémorisé chaque semaine.
- **Réponse** — Chaque bouche est décrite une fois (âge, objectif, ce qu'elle ne mange pas) et le plan compose avec. Les enfants existent dans le plan **sans compte ni écran**. Et ce qu'une personne ne peut pas manger gouverne alors toute la casserole.
- **Ancre** — FF-044 · l'union des contraintes est **fail-closed** : illisible ⇒ rien n'est composé (503).
- ⚠️ **L'allergie est ICI, en conséquence — jamais en ouverture.** C'est une ceinture de sécurité, pas un moteur d'achat : la plupart des familles n'en ont pas, et ouvrir dessus vend par la peur à une minorité.
- ⚠️ Ni « partout » ni « dans chaque réponse » : `plan_question` ne relit pas l'union du foyer.

**03 · Je ne vais pas mettre mes enfants au régime**
- **Douleur** — Je veux perdre du poids ; les outils qui suivent un objectif ne savent pas s'arrêter aux adultes.
- **Besoin** — Que mon objectif ne descende jamais dans l'assiette des enfants.
- **Réponse** — La part suit l'âge, et un mineur n'est **jamais** une cible nutritionnelle. Ceinture structurelle, pas un réglage.
- **Ancre** — `weekPlanAgeGate` · `goalApplies` — refus à la génération, pas filtrage à l'affichage.

---

# POUR LES PROS

> **Vocabulaire.** Le générique est **les pros**. « Coach » ne vaut que pour les
> deux qui en sont : une formation à distance *est* du coaching, un créateur de
> communauté joue ce rôle. **Une salle, non.**
>
> Les gens qu'ils accompagnent : **des clients** sur `/pro` et `/gyms`,
> **des élèves** sur `/coaches` seulement — là, ils ont choisi quelqu'un pour
> apprendre de lui. Règle amendée dans `CoachesPage.tsx` (S2).
> ⛔ « Suivi personnalisé » reste interdit **partout**.

## Formations — `/coaches` · un coach

**01 · Ma formation se termine, l'accompagnement meurt avec elle** → *que ma méthode continue de travailler après la dernière vidéo* → enregistrée une fois, elle répond tous les jours ; ce qui se vendait une fois devient ce qu'on paie chaque mois.

**02 · Mes élèves ont une question le mardi soir** → *une réponse quand ils en ont besoin, pas quand j'ai le temps* → la méthode entre dans leur conversation, dans chaque semaine et dans chaque repas rédigé (**quatre** points d'injection).

**03 · Une IA dira le contraire de ce que j'enseigne** → *une garantie, pas une consigne* → le double verrou, et chaque ligne rouge porte ce qu'on fait à la place, dans mes mots, signé de mon nom.

## Salles — `/gyms` · PAS un coach

*Une salle indépendante. Elle vend une salle, pas une méthode — et ses clients n'ont, pour la plupart, aucun coach.*

**01 · Mes clients s'entraînent sérieusement et mangent au hasard** → *que la moitié qui décide du résultat soit couverte, sans embaucher un nutritionniste* → un palier nutrition tenu chaque jour, que la salle vend et facture ce qu'elle veut.

**02 · Je les perds sans les voir partir** → *savoir qui décroche pendant qu'il est encore joignable* → le lundi, une page nomme qui vaut un message. Silencieux après 48 h, muet après 120 h. Une salle ne voit que ses propres clients.

**03 · Je n'ai pas de méthode à prêter, et pas la légitimité d'en écrire une** → *que ça marche sans que je rédige quoi que ce soit* → la salle **délègue à la doctrine de la maison** ; l'agent signe alors du nom de la maison, jamais de celui de la salle.
- **Ancre** — `coaches.doctrine_source = house` (migration `20260806230000`), câblé aux **deux** endroits qui signent, pour qu'un client ne voie jamais deux identités.
- ⏳ Le chemin existe ; **le contenu de cette doctrine est en cours d'établissement**.

⛔ **Trois claims retirés de cette page, à ne pas réintroduire :** « 6 € quand votre membre a payé son année » (l'intervalle annuel est celui du **coach**) · « quelles convictions vos membres tiennent ou lâchent » (rien ne le calcule) · « c'est votre nom sur les messages » (aucune personnalisation de marque n'existe).
⛔ **Jamais « votre équipe »** : une salle à trois coachs est **un** compte.

## Communautés — `/communities` · un coach

**01 · Un fil n'a pas de destinataire** → *une réponse individuelle sans repasser au un-à-un* → chaque membre du palier a son espace, sa semaine et ses réponses.

**02 · Si un agent répond, plus personne ne se répond entre membres** → *une couche qui s'ajoute sans remplacer* → les membres ne se voient **jamais** entre eux ici : pas de fil, pas de salon, pas de commentaire.
- ⚠️ Ne pas élargir en « personne ne partage jamais d'espace » — le foyer en est un.

**03 · Un modèle lisse ma voix** → *que mes formulations tiennent, pas seulement mes principes* → ce qui part porte mes mots, signé de mon nom.

⛔ **Le bloc « no calories » a été supprimé de cette page** — faux depuis FF-059. Ne pas le réintroduire.

---

# LES DEUX HALLS

> Un hall ne répète pas les douleurs d'un segment : il montre les
> **fonctionnalités principales**, chacune accrochée à la douleur **commune**
> qu'elle retire. Il ne dépasse pas la moitié d'une page segment.

## Chez vous — `/`

| # | Douleur commune | Fonctionnalité montrée |
|---|---|---|
| 01 | Je sais ce que je vise, rien ne me dit ce que ça change dans l'assiette | **Un programme de plats servi par l'objectif** — six objectifs, six façons de servir |
| 02 | Décider, tous les jours, coûte plus que cuisiner | **La semaine arrive en sessions de cuisine** |
| 03 | On achète au hasard, on jette la moitié, il manque toujours quelque chose | **Les courses tombent en vagues** (fenêtres de fraîcheur) |
| 04 | Nous ne mangeons pas tous pareil, il faudrait cuisiner deux ou trois fois | **Un plat, la part de chacun** |
| 05 | Je ne vais pas créer un compte et un mot de passe à chacun | **Tout le monde compte, personne n'a besoin d'un compte** — 12,99 €/mois le foyer, une bouche de plus ne change pas la facture |
| 06 | Quelqu'un a un objectif qui lui appartient et veut le suivre lui-même | **Un compte à soi** (+2 €/mois) : objectif géré par la personne, et **suivi en série datée** au lieu d'une valeur mise à jour par un autre |
| 07 | La question arrive devant le rayon ou la poêle chaude | **Une conversation, tous les jours** — elle tient compte de ce qui précède, de la semaine en cours et de ce qui a été déclaré |

⚠️ Le prix se dit ; **la durée d'essai et le bouton d'achat, non** — le tunnel n'encaisse pas aujourd'hui.
⚠️ La conversation garde **une fenêtre de vingt échanges** (réparé le 2026-08-10). L'accusé d'une photo passe encore hors du moteur, en anglais figé : ne pas le montrer.

## Pour les pros — `/pro`

| # | Douleur commune | Fonctionnalité montrée |
|---|---|---|
| 01 | Ce qui doit être dit chaque jour ne peut pas dépendre de ma présence | **Une méthode posée une fois, puis elle répond** — **la vôtre**, ou **la nôtre** si vous n'en avez pas (`doctrine_source`) |
| 02 | Mes clients ont des questions entre deux séances | **Le support quotidien, tenu par la méthode** — quatre points d'injection |
| 03 | Une IA qui parle en mon nom me contredira | **Le double verrou** |
| 04 | Je découvre qu'un client a décroché quand il est parti | **Le lundi en une page** — calculée, jamais rédigée par un modèle |
| 05 | Comment savoir que c'est ma méthode qui est appliquée ? | **Chaque ligne cite la conviction qu'elle applique** — la base refuse une ligne qui n'en cite aucune |
| 06 | Les plateformes facturent par palier | **Le siège est le seul poste** — 7 €/client/mois, on arrête de payer le mois où l'on éteint un siège |

⚠️ **Formulation obligatoire du double verrou.** « Chaque message sortant est vérifié » est **FAUX** : quatre surfaces sont scannées, quatre ne le sont pas. Écrire : *« votre méthode entre dans le chat, dans chaque semaine et dans chaque repas ; et ce qu'elle écrit dans le chat est relu contre vos lignes rouges avant l'envoi — sans modèle dans cette boucle. »*
⚠️ **Deux fonctionnalités écartées du hall :** la note privée sur un client (« utilisée jamais citée » est une promesse de *prompt*, sans vérificateur) et le tap du soir (posé sur un hall, il ressemble à du suivi).

---

## La navigation

**Pour moi seul** · **À deux** · **En famille** — on nomme la **situation**, pas
le segment : personne ne se dit « je suis un solo ». Le mot reste dans nos
documents et dans le code (`FunnelBranch = solo | pair | family`).

## Ce qui a été retiré du plan initial, et pourquoi

Quatre mécanismes cités au départ **n'existent pas** : l'échange d'un plat en
cours de semaine · le conseil de famille qui arbitre et l'explique · l'affichage
des portions en grammes · l'accompagnement d'un client de salle « après ses trois
heures », qui supposait un coach que la plupart n'ont jamais eu.
