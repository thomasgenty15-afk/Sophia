# Plan de lancement — de zéro utilisateur à la décision « appli native »

> Écrit le mardi 18 août 2026. Prolonge [GTM-30-JOURS.md](GTM-30-JOURS.md), qui
> reste l'autorité sur le détail des semaines. Ce document-ci porte **les portes**
> — ce qu'on doit avoir atteint pour passer à l'étape suivante, et ce qu'on ne
> fait pas avant.

---

## 0. La porte que tu as posée, et ma correction

> **Ta règle :** pas d'iPhone ni d'Android avant **20 foyers en web app** et
> **25 % de conversion**.

**Les 20 foyers : d'accord.** C'est un peu plus que les 10 du GTM, et c'est
défendable — 10 répondent à « le plan survit-il à la semaine 2 », 20 commencent
à distinguer un défaut récurrent d'une anecdote.

**Les 25 % : d'accord sur le chiffre, mais il faut dire de QUOI vers QUOI.**
« 25 % de conversion » ne veut rien dire tant que les deux bouts ne sont pas
nommés, et selon la définition c'est soit impossible, soit trop facile :

| Définition possible | Verdict |
|---|---|
| tract distribué → compte créé | **impossible** — l'ordre de grandeur d'un tract froid est 0,3 % |
| compte créé → foyer qui compose un plan | **trop bas** — en dessous de 40 % l'entonnoir est cassé, pas le produit |
| **essai de 30 jours → abonnement payé** | ✅ **c'est la bonne**, et 25 % est un objectif exigeant mais atteignable |

**On retient donc : 25 % des foyers arrivés au bout de leur essai de 30 jours
paient.** C'est la seule des trois qui dit quelque chose sur la valeur.

> ⚠️ **L'essai fait déjà 30 jours en code** (`HOUSEHOLD_TRIAL_DAYS = 30`). Rien à
> construire, aucun code promo à créer — et une conséquence de calendrier :
> **la réponse « est-ce qu'ils paient » arrive 30 jours après le premier foyer,
> pas avant.**

### ⛔ Et la correction de fond : la conversion ne décide PAS du natif

C'est le point où je ne suis pas d'accord, et il vaut mieux que le chiffre.

« Est-ce que je fais une appli native ? » n'est pas répondu par la conversion.
Une appli native achète quatre choses, et **quatre seulement** : les
notifications push, une icône sur l'écran d'accueil, l'ergonomie de l'appareil
photo, et le hors-ligne.

Donc la vraie question est : **est-ce que le web est ce qui te limite ?**

- Si les foyers abandonnent parce qu'**ils oublient de revenir** → le push
  compte, le natif se justifie.
- Si les foyers abandonnent parce que **le plan n'est pas bon** → le natif ne
  change **rien**, et tu auras dépensé des mois à ne pas répondre à la question.

**Il faut donc un quatrième critère, et c'est le seul qui justifie vraiment le
chantier :**

> **Une cause d'abandon identifiée, nommée dans les entretiens, que le web ne
> peut pas résoudre.**

### ⚠️ Et avant le natif, il y a la PWA

Installable sur l'écran d'accueil, avec **notifications push sur Android et sur
iOS ≥ 16.4**. Ça couvre l'essentiel de ce que tu irais chercher en natif, pour
**quelques jours de travail au lieu de plusieurs mois**, sans validation de
store. Si le diagnostic est « ils oublient de revenir », **c'est ça qu'on fait
d'abord** — et le natif ne se pose qu'après, si la PWA ne suffit pas.

### Les quatre portes du natif, ensemble

| # | Porte | Ce que ça prouve |
|---|---|---|
| 1 | **20 foyers** ont composé un plan en web | il y a de quoi mesurer |
| 2 | **≥ 6 sur 10** génèrent un **deuxième plan** non sollicité | le produit tient |
| 3 | **≥ 25 %** paient à la fin de l'essai de 30 jours | le modèle tient |
| 4 | **une cause d'abandon que le web ne peut pas résoudre** | le natif répond à quelque chose |

**Les quatre, pas trois.** Et la PWA se tente avant, dans tous les cas.

---

## 1. Phase 0 — Déployer *(cette semaine, avant tout contact)*

**C'est le seul vrai blocage, et il n'a pas bougé : 200 migrations, rien en
production.** Tant que ce n'est pas fait, chaque canal ouvert est un canal brûlé.

### Ce qui doit être vrai à la fin

> **Un inconnu, sur SON téléphone, crée un compte et obtient un plan — sans que
> tu touches le clavier.**

### Les portes humaines

`docs/keel/DEPLOY.md` est **une séquence, pas une liste** ; l'ordre est la moitié
du contenu. Les commandes marquées 🔒 se copient-collent, par toi :
`db push`, `functions deploy`, `secrets set`.

⚠️ **Le piège déjà payé une fois :** l'allowlist CORS de production pointée sur
des origines de développement. Variable posée = repli désarmé = **toutes les
fonctions edge en 403**. À vérifier avant de croire qu'un déploiement a marché.

### Les trois choses à finir dans la foulée

1. **La qualité des plans, évaluée** — 20 plans contre une grille écrite. C'est le
   prérequis déclaré : sans lui, un foyer qui abandonne ne t'apprend rien, parce
   que tu ne sauras pas si c'est le produit ou un mauvais plan ce jour-là.
   *(Prompt prêt : `scratchpad/2026-08-18-1640-QUALITE-DES-PLANS-20-lectures.md`.)*
2. **Le run réel du verrou de régime** — dix générations, allergène + régime
   déclarés, sorties lues. Le code est en place depuis le 18 août ; la preuve non.
3. **`/start` en français** — la page rend l'en-tête en français et **tout le
   corps en anglais**, et tout visiteur au navigateur français y atterrit. C'est
   la page qui convertit.

---

## 2. Phase 1 — Les 20 foyers *(à partir du 25 août)*

**Deux canaux, pas sept.** Le risque du moment est de s'éparpiller sur sept
fronts et de n'en travailler aucun. Ces deux-là coûtent zéro euro.

### ⚠️ Le filtre, à emporter partout — trois questions, dans cet ordre

| | La question | Ce qu'elle écarte |
|---|---|---|
| **1** | *« Le soir, c'est plutôt un moment que vous aimez, ou un truc à expédier ? »* | ceux qui commandent ou assemblent — **aucun usage du produit** |
| **2** | *« Il y a des enfants à la maison ? »* | les couples d'adultes stabilisés, les colocations |
| **3** | *« Tout le monde mange la même chose ? Combien de raisons font que non ? »* | ceux qui n'ont qu'une contrainte — le terrain du gratuit |

**Trente secondes.** Et la question 1 est formulée ainsi exprès : ce n'est pas le
passionné de cuisine qu'on cherche, c'est **l'obligé** — celui qui cuisine parce
qu'il faut bien, tous les soirs, depuis des années.

⚠️ **Ne remplace pas la question 2 par un nombre de personnes.** Un parent seul
avec un enfant fait deux personnes et c'est le foyer le plus qualifié du marché
(un enfant qui diverge, personne avec qui partager la cuisine, pression de temps
maximale). Trois adultes en colocation font trois personnes et ne sont pas la
cible. **C'est l'enfant qui qualifie, pas le nombre de têtes.**

📋 **Note les trois réponses pour CHAQUE foyer abordé, même ceux qui refusent la
conversation.** C'est l'entonnoir de dimensionnement du marché
(`POSITIONNEMENT.md` §7), il est gratuit, et aucune source publique ne le donne.

### ① Le post-question, dans le plus gros groupe de parents de la ville

**Le geste n'est pas d'annoncer, c'est de demander.**

> *« Question aux parents : chez vous, est-ce que tout le monde mange la même
> chose le soir ? Chez nous non, et j'aimerais savoir si je suis un cas à part. »*

Ce que ça fait, et qu'aucune annonce ne fait : ça ne se fait pas supprimer (ces
groupes interdisent la pub, pas les questions) · ça se filtre tout seul · ça
**donne la mesure gratuitement** · et ça crée la conversation dans laquelle tu
peux dire ce que tu construis, **en réponse** à quelqu'un qui vient de décrire sa
douleur.

⚠️ **Un seul coup par groupe.** Ne le brûle pas sur une annonce.

### ② Le marché du samedi, et trois commerçants que tu connais

Le marché bat le centre commercial et le magasin bio pour une raison précise :
**les gens y sont en train de faire exactement ce dont tu parles**, avec du temps
mort dans les files.

⚠️ Vérifier l'autorisation auprès du **service des marchés de la mairie**.

Deux niveaux, et le second est celui qui compte :

- **les passants** — tu poses la question, tu notes le compte de contraintes
  (même pour ceux qui refusent le papier), tu laisses l'A5 à ceux qui ont dit
  « non, chez nous c'est compliqué » ;
- **les commerçants** — un primeur voit 300 habitués par semaine, **et il les
  connaît par leur prénom**. C'est là qu'est le volume, et ça tourne sans toi.

> **Demande-leur d'abord de l'essayer, pas de le distribuer.** Un commerçant qui
> a une famille est lui-même un foyer qui diverge. S'il s'en sert et que ça lui
> plaît, il en parlera sans que tu demandes. S'il ne s'en sert pas, sa pile ne
> servira à rien non plus.

### Le papier : pas un tract, un plan

**Recto** — une vraie semaine : une session de cuisine dimanche, quatre assiettes
qui ne se ressemblent pas, avec les prénoms et les raisons. C'est l'image
qu'aucun concurrent ne peut produire, et elle se comprend sans être lue.
**Verso** — trois lignes et un QR : *« Une cuisson le dimanche, l'assiette de
chacun toute la semaine. Le premier mois est offert. »*

Cent exemplaires. Pas dix mille.

### Ce qu'on garde en réserve, et pourquoi

| Canal | Quand | Pourquoi pas maintenant |
|---|---|---|
| Presse locale | après les 10 premiers | un mail, mais un seul — l'angle « il revient monter sa boîte ici » ne se rejoue pas |
| **Réseau alumni** | ciblé sur les **10-20 ans de promo** | actif **à un coup**, et ⚠️ ils donneront des **avis** au lieu d'utiliser — du bruit confiant, le plus dur à ignorer |
| Sorties d'école | **septembre** — elles n'existent pas en août | ton ancien collège et ton ancien lycée te font arriver **invité** |
| Salles de sport | septembre | ⚠️ pleines de **solos** = l'anti-persona. L'intérêt réel, ce sont **les coachs** : un coach = 30 foyers, une conversation |
| Associations de patients | après 20 foyers | à un coup, population étroite |
| **Payant géolocalisé** | après les 20 foyers | c'est le levier le plus rapide, et c'est exactement pour ça qu'il ne faut pas l'utiliser avant de savoir ce qui convertit |

---

## 3. Phase 2 — La réponse « est-ce qu'ils paient » *(à partir du 2 octobre)*

L'essai fait 30 jours. Si le premier foyer entre le 1ᵉʳ septembre, la première
échéance tombe le **1ᵉʳ octobre**. **Tu n'auras pas de chiffre de conversion
avant octobre, quoi que tu fasses** — c'est mécanique, et ça vaut mieux que de
poser la question trop tôt et de compter des intentions.

Pendant ce mois, tu ne factures pas et tu ne demandes pas « est-ce que tu
aimes ? » — quelqu'un que tu as recruté toi-même répond oui. Tu regardes quatre
lignes, chaque jour :

| | Où le lire |
|---|---|
| combien ont généré un **deuxième plan** non sollicité | `student_generated_meals`, par compte |
| combien ont **coché** au moins un repas | `meal_tick` |
| ce que dit le **questionnaire de fin de plan** | `meal_plan_feedback` |
| combien ont **acheté sur la vague** annoncée | l'état de vague |

Et un entretien de 20 minutes par foyer, avec **une seule question ouverte** :
*« Raconte-moi le moment où tu as arrêté de suivre le plan. »* Le passé se
raconte, le futur s'invente.

**C'est dans ces entretiens que se trouve le critère n°4** — la cause d'abandon
que le web ne peut pas résoudre. Si elle n'apparaît pas, le natif n'a pas de
sujet.

---

## 4. Le calendrier

| Quand | Quoi | La porte |
|---|---|---|
| **18 → 25 août** | déployer · qualité des plans · run régime · `/start` en FR | un inconnu obtient un plan sur son téléphone |
| **25 août → 15 sept** | post-question · marché · commerçants | **20 foyers** ont composé un plan |
| **sept → oct** | on regarde, on répare ce que 3 foyers sur 5 signalent | **≥ 6/10** font un deuxième plan |
| **à partir du 2 oct** | les premiers essais arrivent à échéance | **≥ 25 %** paient |
| **oct** | entretiens de sortie | une cause d'abandon que le web ne résout pas |
| **ensuite** | **PWA d'abord** — installable + push, quelques jours | le natif seulement si la PWA ne suffit pas |

---

## 5. Ce qu'on ne fait pas, et c'est la moitié du plan

- ❌ **Aucun contact avant que le produit soit en ligne.** Un canal brûlé sur un
  produit qui ne répond pas ne revient jamais.
- ❌ **Pas d'appli native avant les quatre portes.** Et pas avant d'avoir essayé
  la PWA.
- ❌ **Pas de payant avant 20 foyers.** On achèterait du trafic pour apprendre ce
  qu'une matinée de marché apprend gratuitement.
- ❌ **On ne compte pas les inscriptions.** Un compte qui ne génère pas de
  deuxième plan est un échec déguisé en traction.
- ❌ **On ne brûle pas les canaux à un coup** — alumni, presse, associations —
  avant qu'un inconnu ait réussi seul.
- ❌ **On ne corrige que ce que 3 foyers sur 5 signalent.** Un défaut vu une fois
  est une anecdote.
