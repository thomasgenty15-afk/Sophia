# MISSION — le repas déclaré en texte, et la question qui vaut la peine

> Prompt d'exécution autonome. Repo `Sophia 2`, branche `dewhatsapp`. Tu
> construis un mécanisme, tu ne refais pas ce qui existe. Le §2 dit exactement
> ce qui est déjà là : le lire avant d'écrire une ligne t'évitera de réécrire la
> moitié du chemin.

---

## 1. LE PROBLÈME, TEL QU'IL SE PRÉSENTE

KEEL est un compagnon nutrition 1:N. L'élève envoie des photos de repas — ce
chemin est complet. Mais il déclare aussi ses repas **en texte**, et là deux
choses manquent.

**A. La déclaration textuelle est enregistrée telle quelle, si pauvre soit-elle.**

> Élève : « j'ai mangé du poulet »
> Système : écrit un fait `food_group:poultry`, répond « Recorded: Poultry ».

Le coach lit ensuite que son élève a mangé **du poulet**, point. Il ne sait pas
s'il y avait un féculent, un légume, une matière grasse de cuisson — c'est-à-dire
qu'il ne sait rien de ce qui l'intéresse. Le fait est **techniquement juste et
pratiquement inutilisable**, et il pèse dans la couverture comme s'il était
complet. C'est un mensonge par omission dans les données du coach.

**B. Personne ne demande jamais rien.**

Sur le chemin photo, une question de clarification existe (§2). Sur le chemin
texte, il n'y en a aucune. Une déclaration pauvre ne déclenche rien : ni
question, ni marque, ni signal au coach que ce fait est incomplet.

**Ce que tu construis** : la capacité de **repérer qu'une déclaration de repas
est trop imprécise pour servir**, de **poser UNE question ciblée**, et de
**replier la réponse sur le fait déjà écrit** — jamais d'en créer un second.

---

## 2. CE QUI EXISTE DÉJÀ — À NE PAS RECONSTRUIRE

Lis ces fichiers avant toute chose. Cinq d'entre eux datent d'hier et forment
le patron exact à réutiliser.

### 2.1 Le signal du dispatcher existe

Le dispatcher global (`sophia-brain/dispatcher/dispatcher.v2.ts`) produit un
`TurnFrame` portant `direct_effects[]` avec un `payload_hint`
(`contracts/turn_frame.v1.ts:327`). `log_protocol_event` en fait partie
(`routers.ts`, `ROUTER_RUNNABLE_DIRECT_EFFECT_TYPES`), et il est armé dans
`runKeelDirectEffectLane` (`sophia-brain/router/run.ts:1596+`).

**Tu n'as donc pas à créer un signal « c'est un repas ».** Il existe, il marche,
et il écrit. Ce qui manque n'est pas la détection : c'est le **jugement sur la
qualité** de ce qui a été détecté.

### 2.2 La décomposition en composants existe

`tools/always_on/log_protocol_event/intake.ts` décompose le message en
**composants**, chacun portant `food_group_ref` | `substance_ref` | `quantity` |
`unit` | `commitment_id`. Ils sont dédupliqués par
`protocolEventComponentKey` (`contract.ts:143`) et écrits **une ligne par
composant distinct**, avec la clé d'idempotence `<source_message_id>#<key>`
(`intake.ts:443`).

Conséquence directe pour toi : « poulet et riz » produit déjà DEUX lignes. Le
nombre de composants est donc un **signal de complétude gratuit**, déjà calculé.

### 2.3 `needs_clarify` existe — mais pas pour ça

Le routeur rend `status: "needs_clarify"` (`log_protocol_event/router.ts`), et
c'est une bonne nouvelle : la plomberie de la clarification est là. Mais elle ne
se déclenche que sur un **token irrésolvable** (`unknown_token`,
`unknown_commitment` dans `intake.ts`), pas sur un repas sous-décrit. C'est
exactement la couture où ton travail s'insère.

### 2.4 Côté PHOTO, la question existe et sa réponse est câblée depuis hier

- L'analyseur produit `clarifying_question` (`_shared/keel/meal_analysis.ts`),
  avec une règle de **mise** déjà écrite : la question ne survit que si la
  lecture porte une vraie incertitude (une hypothèse déclarée, ou une image
  dégradée). Un filtre déterministe la supprime sinon.
- Elle est rendue à l'élève dans l'accusé (`renderMealPhotoAck`).
- **La réponse est désormais traitée** : `_shared/keel/meal_photo_flow.ts`
  (reducer pur) + `_shared/keel/meal_photo_intent.ts` (dispatcher local, LLM,
  liste fermée) + `_shared/keel/meal_photo_amend.ts` (amendement d'une ligne
  existante) + `_shared/keel/meal_photo_flow_state.ts` (persistance dans
  `user_chat_states.temp_memory`) + `sophia-brain/router/keel_meal_photo_lane.ts`
  (la lane, insérée avant `log_protocol_event` dans `run.ts`).

**Le sous-flow photo que tu pourrais croire à construire est donc construit.**
Ta tâche côté photo est différente et plus fine — voir §4.

### 2.5 Les ceintures qui existent et que tu ne dois pas contourner

- **Intention future** : `isTrackProgressFutureIntent` bloque l'écriture sur
  « je vais manger du poulet ». Une question de précision ne doit pas la
  réveiller : on ne demande pas des précisions sur un repas qui n'a pas eu lieu.
- **Safety** : toute bande ≠ `none` ferme les flows locaux. On ne demande pas à
  quelqu'un en détresse avec quoi il a mangé son poulet.
- **Allowlist de commitments** : `keelBindableCommitmentIds`.
- **Le contrat photo v3** et ses deux filtres (mesures, allowlist).

---

## 3. LA CONTRAINTE QUI GOUVERNE TOUT LE RESTE

> **Une question de précision ne demande JAMAIS une quantité.**

C'est la ligne rouge du produit, et elle est facile à franchir sans s'en rendre
compte. « Tu en as mangé combien ? », « c'était une grosse portion ? », « combien
de grammes ? » sont **interdites**. Le contrat (`docs/keel/CONTRACT.md`,
non-input #4) refuse toute mesure d'énergie ou de masse, et le prompt d'analyse
l'écrit noir sur blanc : *« Never ask a question whose only purpose is to sharpen
a quantity: quantity is not something this system reports. »*

Les axes de précision **autorisés**, et ils suffisent :

| Axe | Exemple de manque | Question légitime |
|---|---|---|
| **Accompagnement** | « du poulet » seul | « Et avec quoi ? » |
| **Préparation** | « du poulet » | « Grillé, ou cuit à l'huile ? » |
| **Composition** | « une salade » | « Il y avait quoi dedans ? » |
| **Créneau** | aucun moment nommé | « C'était ton déjeuner ? » |

L'axe **portion** existe déjà côté photo sous forme de **bande** ordinale
(`small|moderate|large|unclear`) et n'est **jamais** demandé à l'élève.

### La seconde contrainte : l'anti-interrogatoire

Le dépôt porte déjà la règle : *« One question maximum. Two questions is an
interrogation, and the student stops attending. »* Elle vaut ici. Et la
**condition de mise** vaut aussi : on ne pose la question que si **la réponse
changerait ce que le protocole du coach dit de ce repas**. « De quelle variété
de riz ? » ne change rien : ne la pose pas.

Cette condition n'est pas une préférence de style — c'est une garde, et elle doit
être **déterministe**, pas confiée au prompt. Le chemin photo montre comment :
le parseur supprime la question quand rien ne la justifie.

---

## 4. CE QUE TU CONSTRUIS

### La thèse d'architecture, à respecter

Les deux besoins (texte pauvre, photo douteuse) ont **la même forme** :

> un fait est écrit → quelque chose de matériel manque → on pose UNE question →
> la réponse **amende le fait existant**, jamais n'en crée un second.

**Construis donc UN mécanisme à deux entrées, pas deux sous-flows jumeaux.**
Deux flows qui font la même chose divergent en trois mois, et le second oublie
toujours une garde du premier. Concrètement : généralise l'existant
`meal_photo_flow` en un flow de **précision de repas** dont la photo et le texte
sont deux sources — ou, si tu démontres que la généralisation coûte plus qu'elle
ne rapporte, écris-le dans le journal avec le raisonnement, et partage au moins
le reducer, l'amendement et la persistance.

### P1 — L'évaluation de complétude (déterministe, pure, testée)

Un module pur, sans I/O ni horloge : à partir des composants produits par
`intake.ts` **et** du protocole du jour, il rend ce qui manque.

- Sortie : une liste fermée d'axes manquants (`accompaniment`, `preparation`,
  `composition`, `slot`), et rien d'autre. Pas de score flottant : un score
  invite à un seuil magique, une liste invite à une question.
- La règle de **mise** est ici, et elle est déterministe : un axe ne compte comme
  manquant que si **une ligne du protocole du jour en dépend**. Si le coach ne
  prescrit rien sur la matière grasse de cuisson, ne demande pas la préparation.
  C'est ce qui évite d'interroger un élève sur des choses dont personne ne fera
  rien.
- Cas où l'on ne demande RIEN, et ils sont majoritaires : un composant unique
  qui se suffit (« une pomme »), un repas déjà complet, une intention future, une
  bande de safety non nulle, un élève qui a déjà été questionné aujourd'hui
  (voir le plafond ci-dessous).

### P2 — Le plafond, et il est structurel

Une question par repas. **Deux questions maximum par jour et par élève**, quel
que soit le nombre de repas déclarés. Le compteur est persistant (pas en
mémoire de tour) et vérifiable en base. Sans plafond, un élève bavard reçoit
huit questions par jour et cesse de déclarer ses repas — ce qui coûte plus cher
que l'imprécision qu'on voulait corriger.

### P3 — Le dispatcher local

Sur le patron de `meal_photo_intent.ts` : classifieur LLM, liste fermée
d'intentions, `llmRunner` injectable pour les tests, seuil de confiance, et
**dégradation vers le comportement d'avant** en cas de doute ou d'échec. Les
intentions au minimum : `answers_question`, `corrects_declaration`, `unrelated`,
`new_declaration`, `unknown`.

Le déterminisme reste réservé à ce qui est déterministe (présence d'un média,
identifiants, boutons). **Aucune regex de sens** : c'est une règle de ce dépôt,
et elle a déjà été payée.

### P4 — L'amendement

La réponse de l'élève **complète les lignes déjà écrites**. Réutilise
`meal_photo_amend.ts` : il empile les amendements dans `recognized.amendments[]`,
pose `student_amended`, et sait effacer un crédit machine contredit.

Deux cas à trancher explicitement, et à documenter :
- la réponse **ajoute** un composant (« avec du riz ») → faut-il écrire une
  NOUVELLE ligne `protocol_events` pour le riz, ou l'inscrire dans l'amendement ?
  *Recommandation : une nouvelle ligne, avec la clé d'idempotence dérivée du
  message de RÉPONSE, plus un lien vers le fait d'origine dans `recognized`.*
  Un composant réellement mangé est un fait, et le coach doit pouvoir le
  compter ; l'enfouir dans un jsonb le rendrait invisible à l'évaluateur.
- la réponse **corrige** un composant (« non, c'était de la dinde ») → amendement
  du fait existant, sans seconde ligne. C'est le chemin déjà construit.

### P5 — Côté photo : affiner, pas reconstruire

Le mécanisme existe. Ta tâche :
1. **Vérifier la règle de mise en conditions réelles.** Elle est aujourd'hui
   « une hypothèse déclarée OU une image dégradée ». Est-ce trop large (on
   questionne pour rien) ou trop étroite (un élément significatif douteux passe
   sans question) ? Réponds avec des images réelles, pas par lecture de code.
2. **Aligner la photo sur le plafond du P2** : les deux chemins doivent partager
   le même compteur, sinon un élève reçoit deux questions photo + deux questions
   texte le même jour.
3. **Unifier les axes** : `ASSUMPTION_SUBJECTS` (photo) et les axes de manque
   (texte) décrivent la même chose avec deux vocabulaires. Un seul vocabulaire.

---

## 5. LA MÉTHODE — le gantelet

Chaque livrable franchit cinq épreuves, toutes obligatoires :

1. **Tests exécutés** (`deno test`), sortie collée dans le journal. Un test écrit
   et non lancé n'existe pas.
2. **Passe adversariale**, au minimum : prémisse fausse (pas de protocole du
   jour, pas de composant résolu) ; concurrence (deux déclarations simultanées) ;
   rejeu (le même message deux fois) ; **langue FR et EN** ; temps (minuit,
   fuseau, repas d'hier déclaré ce matin) ; état vide (élève sans plan, sans
   doctrine) ; désalignement config↔code.
3. **Épreuve de réel** : conversation jouée au navigateur contre la stack locale
   et un vrai modèle. Déclare « j'ai mangé du poulet », reçois la question,
   réponds, et **vérifie en SQL** ce que la base porte.
4. **Contre-factuel** : montre le cas où la question NE doit PAS être posée, et
   vérifie qu'elle ne l'est pas. Une garde qu'on n'a pas vue mordre est une
   garde qu'on croit sur parole.
5. **Deux relectures à froid** en fin de mission.

**Le test qui porte la doctrine, et il doit exister nommément :**
*« une réponse à une question de précision n'écrit jamais un repas en double »* —
`select count(*) from protocol_events` avant/après, sur le même repas.

**Les tests qui doivent rester verts :**

```bash
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
deno test --allow-all supabase/functions/meal-photo-upload-v1/ supabase/functions/chat-inbound-v1/
cd frontend && npx tsc -b --noEmit && npx vitest --config vitest.config.ts run
```

---

## 6. RÈGLES D'ENGAGEMENT

1. Branche `dewhatsapp`. Commit snapshot d'abord, puis un commit par phase verte.
2. **INTERDIT** : `functions deploy`, `db push`, secrets, tout écrit distant. Le
   local est autorisé, `db reset` compris. Toute transformation de schéma est une
   **nouvelle** migration, jamais la réécriture d'une ancienne.
3. Tu ne touches ni au billing, ni au contrat photo v3 (tu l'étends au besoin,
   tu ne le réécris pas), ni à l'ordre des gardes du tour.
4. Journal : `docs/nutrition-pivot/PROGRESS-MEAL-PRECISION.md`, append-only.
   Livrable : `docs/nutrition-pivot/STATUS-MEAL-PRECISION.md`.
5. Règle des 30 minutes : jamais bloqué plus longtemps sur le même mur.
   Documente, contourne une fois, passe, reviens.
6. **Honnêteté** : aucun « fait » sans le test qui le prouve. Un doute est un
   flag, jamais un vert optimiste.
7. Pièges de la stack locale, vérifiés : Kong rend des 502 sans corps sur les
   tours longs ; `EMAIL_DELIVERY_ENABLED=1` traîne en local ;
   `functions.invoke` n'envoie pas `x-internal-secret` ; `auth.admin.createUser`
   échoue par intermittence (repli : `signUp` anon + `update profiles`) ; les
   crons acceptent une horloge simulée dans le corps, qui doit rester ≥ l'heure
   réelle.

## 7. LA QUESTION QUE TU DOIS TE POSER À CHAQUE ARBITRAGE

> *Est-ce que la réponse à cette question changerait ce que le coach dit de ce
> repas ?*

Si non, la question ne doit pas être posée — et le fait imprécis vaut mieux
qu'un élève qu'on a lassé. C'est le seul arbitrage qui compte dans ce lot :
**la précision n'a de valeur que jusqu'au point où elle coûte l'adhésion.**
