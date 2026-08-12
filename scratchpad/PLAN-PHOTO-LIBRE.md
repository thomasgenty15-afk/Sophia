# Plan — La photo naît rattachée

> **L'idée, en une phrase.** Au lieu de chercher comment rattacher des photos
> orphelines, on fait en sorte qu'elles naissent rattachées : la photo s'offre
> au moment où le flux sait déjà à quoi la relier. C'est le même geste que
> FF-058 — réduire le prix d'un geste plutôt qu'ajouter une collecte.

---

## 0. Ce qui existe déjà, et qu'il ne faut pas réimplémenter

Vérifié le 2026-08-12, fichiers:lignes à l'appui.

| Brique | Où | Ce qu'elle fait |
|---|---|---|
| L'invitation | `_shared/keel/photo_invitation.ts` (`gatePhotoInvitation`) | huit portes en séquence, texte en gabarit fermé, bilingue |
| **Le rattachement** | `_shared/keel/photo_invitation_attach.ts` | une photo qui arrive **dans les 30 min** d'une invitation, même jour local, **enrichit le fait hors-plan au lieu d'en créer un second** |
| L'appel depuis l'accident | `_shared/chat/accident_tap.ts` (branche `ordered`) | invite après le tap « j'ai commandé » |
| L'appel depuis la conversation | `sophia-brain/router/keel_photo_invitation_lane.ts` | invite après « j'ai commandé une pizza » |
| Le budget | `_shared/keel/daily_ask_budget.ts` | `DAILY_ASK_BUDGET = 1`, cinq familles, ledger `meal_precision_questions` |

**La moitié du chantier est donc déjà construite, et bien.** Le rattachement
existe et son raisonnement est écrit : *« deux lignes pour un repas fausse tous
les comptes en aval »*. Il s'exécute **après** l'analyse d'image, pour qu'une
photo de menu ne vienne pas disqualifier le repas réellement déclaré.

---

## 1. Le seul vrai blocage : le budget

`armPhotoInvitation` passe `asksMadeToday` + `budget` à la garde, puis **écrit**
la ligne d'ask (`recordDailyAsk`, kind `photo_invitation`). Conséquence mesurable :
**un soir où la question de divergence, la pratique ou la recommandation est
déjà partie, la personne qui tape « j'ai commandé » n'a aucune invitation.**

Or, dans le **même fichier**, la proposition de décalage de FF-057 est
explicitement exemptée, avec ce motif écrit :

> *« CE CHEMIN NE CONSOMME PAS LE BUDGET T4, et c'est vérifié : la réponse à un
> geste que la personne vient de faire n'est pas une DEMANDE du produit. »*

L'invitation photo répond aussi à un tap — et elle paie. **C'est une
incohérence entre deux décisions du même fichier, prises la même semaine.**

### ⚠️ Le piège de conception à ne pas rater

`recordDailyAsk` sert **deux** fonctions : compter le budget **et** dédupliquer
(`recorded.alreadyRecorded` ⇒ on ne renvoie pas l'invitation deux fois).
**Supprimer l'écriture casserait la déduplication.** La bonne forme est donc :

- **on continue d'écrire** la ligne (dédup + observabilité) ;
- **on cesse de la compter** dans le budget.

Ce qui impose une décision explicite, à documenter :

> **Décision à prendre — une invitation photo non comptée ne BLOQUE plus rien
> non plus.** Si elle sort du compteur, elle cesse de consommer *et* de bloquer
> une question ultérieure. C'est cohérent (elle n'est pas une demande), mais ça
> change la sémantique d'un compteur **partagé** par FF-028, FF-029 et FF-056.
> Recommandation : introduire la notion d'ask **« en réponse à un geste »**,
> écrit au ledger avec un marqueur, exclu du `count`. Pas un `delete`, pas un
> `skip` : un marqueur, pour que la ligne reste lisible en aval.

---

## 2. Le périmètre, en trois lots séparés

### Lot A — l'exemption de budget  ✅ *sûr, précédenté, réversible*

**Ce qu'on change**
1. `daily_ask_budget.ts` : `countDailyAsks` cesse de compter les asks marqués
   « en réponse à un geste ». Le marqueur est une colonne ou une valeur de
   `source` — **trancher au plus simple et documenter le choix en tête du
   module**, comme FF-058 l'a fait pour l'état de vague.
2. `accident_tap.ts` (`armPhotoInvitation`) : l'invitation qui répond au tap
   `ordered` est écrite avec ce marqueur, et la garde reçoit un `asksMadeToday`
   qui l'exclut.
3. `keel_photo_invitation_lane.ts` : même traitement — la personne qui **dit**
   « j'ai commandé une pizza » a fait un geste, exactement comme celle qui tape.

**Ce qu'on ne change pas** : les sept autres portes de `gatePhotoInvitation`
(safety, restriction, `hasMedia`, `no_committed_fact`, `not_off_plan`,
`future_intent`, `flow_already_open`). Elles restent toutes armées.

**Tests exigés**
- une journée dont le budget est **déjà consommé** par la divergence → le tap
  « j'ai commandé » **invite quand même** ;
- l'invitation photo, une fois émise, **ne bloque pas** la question du soir ;
- **double tap** → une seule invitation (la dédup survit à l'exemption : c'est
  le test qui prouve qu'on n'a pas cassé `alreadyRecorded` en retirant le
  comptage) ;
- FR **et** EN ;
- **mutation** : mettre `DAILY_ASK_BUDGET` à 0 et vérifier que l'invitation
  passe toujours, et que les quatre autres familles tombent. Sans ça, le test
  est paramétré par sa propre constante.

**Run réel** : trois personas, budget pré-consommé, tap `ordered`, invitation
lue en base, puis photo envoyée dans la fenêtre → **une seule ligne de fait**,
enrichie, pas deux.

### Lot B — ouvrir l'invitation sur « j'ai mangé autre chose »  ⚠️ *demande un arbitrage humain*

`ate_other` écrit bien un fait `off_plan` — la garde `not_off_plan` le
laisserait donc passer — mais la branche n'invite pas, **et la fiche FF-057 §3
dit explicitement « rien de plus »**.

C'est donc un **amendement de fiche**, pas un correctif. Le code a le droit de
le faire ; la fiche dit de ne pas le faire. À trancher par l'humain, avec cet
argument pour : c'est précisément le cas « hot-dog à 16 h » — un repas hors plan
dont on ne sait rien, où la photo apporterait tout. Et cet argument contre :
la fiche a voulu que le formulaire reste à trois boutons et ne s'allonge pas.

**Ne pas l'implémenter sans réponse écrite.**

### Lot C — ce qu'on NE fait pas, et pourquoi

- **`no_time`** : n'écrit aucun fait `off_plan`. Inviter là reviendrait à
  demander la photo de quelque chose qui n'a pas été déclaré — c'est ce que la
  porte `no_committed_fact` existe pour empêcher.
- **La fenêtre de 30 minutes** : élargir le rattachement différé est nommément
  interdit ici — FF-018 §11 et FF-025 §7 laissent la question **ouverte**, et
  §9 interdit de la résoudre en douce. Toute photo hors fenêtre reste son propre
  fait, **par décision**. Si on veut la changer, c'est une fiche à amender, pas
  une constante à bouger.

---

## 3. Le prérequis à établir AVANT d'augmenter le volume

Une note de mémoire projet affirme que **l'accusé de réception d'une photo est
codé en dur en anglais et ne passe par aucun tour de cerveau**
(`meal-photo-ack-is-not-a-brain-turn`). Si c'est encore vrai, pousser du trafic
sur ce chemin **ferait grossir un défaut de langue connu** — exactement celui
qui vient d'être corrigé sur FF-028, où une élève `fr-FR` tapait un bouton
français et lisait « Done — breakfast is part of your rhythm now ».

⚠️ **Cette affirmation vient d'une note, pas d'une lecture du jour : un grep
rapide ne l'a pas confirmée. Étape 0 du lot : l'établir ou la réfuter, avec
fichier:ligne.** Si elle est vraie, l'accusé se localise avant l'ouverture des
vannes, avec le même patron que `recommendationAck(action, language, kind)` —
deux paramètres requis, parce qu'une langue par défaut est l'anglais par défaut.

---

## 4. L'ordre

1. **Étape 0** — établir l'état réel de l'accusé photo (prérequis §3).
2. **Lot A** — l'exemption de budget, sur les deux lanes, avec ses tests et son
   run réel.
3. **Arbitrage humain** — lot B, oui ou non.
4. **Rien d'autre.** Le lot C est fermé et documenté comme tel.

## 5. Ce que ça change pour un utilisateur réel

Aujourd'hui : « j'ai commandé un burger » un soir où Sophia a déjà posé sa
question ⇒ le fait est enregistré **sans aucun détail**, et personne ne saura
jamais ce qu'il y avait dedans.

Après le lot A : la même phrase, le même soir ⇒ « si tu as une photo, envoie-la »,
et la photo qui arrive dans la demi-heure **enrichit ce fait-là** au lieu d'en
créer un second. Le stock de photos orphelines baisse sans qu'on ait ajouté la
moindre collecte — on a seulement cessé de fermer une porte au mauvais moment.
