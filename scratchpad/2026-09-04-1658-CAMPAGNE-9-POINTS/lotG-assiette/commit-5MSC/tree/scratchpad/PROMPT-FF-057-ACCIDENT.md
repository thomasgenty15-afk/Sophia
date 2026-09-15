# Prompt — Construire FF-057 · La procédure accident

> À donner à l'agent responsable de la composition des repas. Le prompt complet
> = **LE SOCLE COMMUN** de `scratchpad/PROMPTS-REALIGNEMENT-CHAT.md` (l. 16-143,
> à coller en premier) **+ ce bloc**.
>
> **Ordre** : passe après FF-058 (la bande du soir) si elle est faite — mais
> **cette fiche ne dépend d'aucune de ses trois entrées** et peut être livrée
> seule.

---

# BLOC · FF-057 — La procédure accident

**Fiche** : `docs/fonctionnalites/composition-des-repas/FF-057-la-procedure-accident.md`
— lis-la **en entier** d'abord, puis le README de son domaine et
`conversation/README.md` (T1–T9).

## Le contexte produit

Quand la vraie vie percute le plan, le produit **encaisse le fait et s'arrête
là**. La décoche existe, le repas hors plan est capté (FF-009) — et personne ne
répond à *« qu'est-ce que ça change pour la suite ? »*. FF-002 couvre l'absence
annoncée **avant** la composition ; **rien ne couvre l'accident après**.

Et il y a pire que le plat sauté : **la session de cuisine sautée est une bombe
silencieuse**. Trois ou quatre repas n'existent pas, et le plan continue de les
afficher. La personne ouvre l'app mardi, on lui annonce un plat qui n'a jamais
été cuisiné.

C'est le mode d'échec **structurel** de toutes les apps de meal planning : le
plan meurt au premier contact avec la vraie vie, et l'utilisateur conclut que
« ça ne marche pas ». Il ne le supprime pas — il cesse de l'ouvrir.

**Trois entrées, aucune indispensable.** Un `✗` dans la bande du soir
(FF-058) · une déclaration en conversation captée par FF-009 · une décoche sur
l'écran Today. C'est ce qui fait de cette fiche une fonctionnalité à part
entière : elle survit au retrait de n'importe laquelle.

## L'état du dépôt — vérifie, puis réutilise

- **La décoche** : `_shared/keel/meal_tick.ts`,
  `MEAL_UNTICK_REASON = 'food_not_eaten'`. Table append-only : la ligne
  décochée **survit** et tout lecteur qui compte filtre déjà sur
  `disqualified_reason is null`.
- **Le hors-plan** : `plan_relation = 'off_plan'` (FF-009, livré) — et sa
  règle : **aucun aliment inventé** quand rien n'est nommé.
- **L'invitation photo** : FF-025 (livrée), avec son propre gate et son propre
  budget. Tu l'appelles, tu ne la réimplémentes pas.
- **Le canal des directives durables** : `daily_recommendation_engine.ts` /
  `daily_recommendation_io.ts` (FF-028) — **espace d'actions pré-calculé**, tap
  déterministe, **écriture relue** (vérité d'exécution), **empreinte du plan**
  qui périme la proposition. Ton réalignement passe par **LÀ**, pas par un
  canal à toi.
- **La fenêtre du plan** : `meal_plan_window.ts` (source de vérité de « quel
  plan possède ce jour » — `meal_stretch.ts` est **périmé** pour ça et le dit),
  et `MAX_FRIDGE_DAYS` dans `meal_generation.ts` pour la péremption.
- **Le verrou de doctrine** : `off_plan_meals` interdit déjà « cheat meal » et
  ses cinq voisins. Ta copie passe dessous comme le reste.
- **Le budget** : `daily_ask_budget.ts` (T4) — l'invitation photo le consomme.

## Ce que tu construis

**① Le formulaire accident** — trois boutons fermés, **jamais** un champ libre
obligatoire, sur le patron déterministe (`interactive_id`) :
- *J'ai commandé / mangé dehors* → décoche + fait `off_plan` → invitation
  photo (FF-025) **si et seulement si** le budget du jour est libre ;
- *Pas eu le temps* → décoche seule → ③ (la nourriture existe peut-être) ;
- *J'ai mangé autre chose* → décoche + `off_plan` **sans aliment inventé**.

**② La session de cuisine** — la **seule donnée neuve**. Question posée **une
fois par session**, jamais par plat : « la session de dimanche a eu lieu ? ».
Si non : un marqueur (sur la session dans le payload du plan, ou une table à
part — tranche **au plus simple** et **documente ton choix dans l'en-tête du
module**), puis ③ en mode cascade.
⚠️ **La cascade est le calcul le plus délicat de la fiche.** Elle doit
invalider **exactement** les repas qui dépendaient de cette session : trop
large, on efface une semaine correcte ; trop étroit, le plan continue de
mentir. Et un repas de cette session **déjà coché survit** — on croit le fait,
pas la déclaration.

**③ Les courses et le décalage temporel** — l'entrée n°4, celle qui menace le
plan **entier** et pas un seul repas.

Le déclencheur est un **`Pas encore`** sur une vague, le soir de son `buyOn`
(écrit par FF-058). Il n'y a **rien à demander sur le futur** : la date des
courses est déjà dans le plan.

⚠️ **Ne demande JAMAIS « tu peux y aller quand ? ».** C'est une question
ouverte sur une intention : elle rend du texte libre à classer, elle demande
une information que le produit ne sait pas vérifier, et elle remplace un tap
par une phrase. Le produit a un meilleur outil, le même que partout ailleurs :
**il calcule le décalage viable et le propose.**

> « Les courses ne sont pas faites. On décale la cuisson à mardi ? »
> `[ Oui ]` `[ Non, je gère ]`

C'est une **proposition en réponse à un tap**, donc elle ne consomme pas le
budget T4 — mais **une seule chose à la fois** : jamais la proposition de
décalage ET l'invitation photo dans le même échange.

Le glissement déplace la cuisson, les repas qu'elle nourrit, et **recalcule les
vagues** (`buyOn = cookOn − MAX_FRIDGE_DAYS`). Il **se refuse avec un motif
nommé** dans trois cas, tous calculables depuis l'existant :

| Motif | Condition |
|---|---|
| `perishables_at_risk` | une vague antérieure **déjà faite** dont le périssable (`PERISHABLE_AISLES`) dépasserait `MAX_FRIDGE_DAYS` après décalage — calculé depuis sa **date d'achat réelle**, jamais depuis le `buyOn` théorique |
| `outside_plan_window` | le décalage pousse un repas au-delà d'`ends_on` (`meal_plan_window.ts`) |
| `already_cooked` | une préparation de cette session existe déjà |

Refusé ⇒ **on ne reste pas muet** : on dit le motif et on propose ce qui reste
(sans cuisson, ou « rien à changer »).

**Le système est auto-limitant et tu ne dois rien ajouter pour ça** : accepté,
le nouveau `buyOn` fait réapparaître la ligne à sa nouvelle date (cadence
normale) ; refusé, le `buyOn` est passé et la ligne ne revient pas (FF-058
R15). N'invente **aucun** rappel de relance.

⚠️ **Décaler un plan non commencé n'est PAS V3.** V3 recompose sous contrainte
de ce qui est cuit ; ici c'est un **glissement de dates** — aucun plat
rechoisi, aucune quantité retouchée, **aucun appel au modèle**. C'est ce qui le
rend sûr, donc c'est ce qu'il faut **vérifier** (les trois gardes), pas
supposer.

**④ Le réalignement V2** — module pur qui calcule l'**espace d'actions**
disponible, puis propose via le canal FF-028. **Cinq actions, pas une de
plus** :
1. **Décaler** un plat non cuisiné — proposé **uniquement** si la fenêtre
   frigo (`MAX_FRIDGE_DAYS`) le permet ;
2. **Signaler un reste** disponible pour demain ;
3. **Proposer du sans-cuisson** quand la session est tombée ;
4. **Ne rien faire, et le dire** — c'est une **bonne fin**. Un plat sauté un
   mardi ne justifie souvent aucune action, et un flow qui trouve toujours
   quelque chose à réparer transforme chaque écart en incident.
5. **Décaler la session et ce qui en dépend** — le glissement de ③, avec ses
   trois motifs de refus nommés.

**V3 est FERMÉ** (replanifier les jours restants sous contraintes de ce qui est
déjà cuit et déjà acheté). N'y touche pas : la cascade plan-courses-cuissons
casse un état **sans lever d'erreur** — les courses sont faites, une
préparation nourrit trois repas futurs. Si tu vois comment le faire, **écris-le
au rapport et n'écris pas le code**.

## Tests en conditions réelles

- **easy** : décoche sur le dîner → « J'ai commandé » → décoche + fait
  `off_plan` en base, et l'invitation photo part si le budget est libre. 3/3,
  FR et EN.
- **medium** : chaque bouton avec sa bonne écriture ; « mangé autre chose » →
  **aucun `food_group_ref` inventé** ; l'entrée par **conversation** (« j'ai
  commandé une pizza ») ouvre la procédure **sans passer par la bande du
  soir** ; l'entrée par **décoche écran** aussi.
- **hard** : chaque mode de défaillance de la fiche (§7) — dont : fenêtre frigo
  dépassée → « décaler » **absent de l'espace** ; plan changé entre la
  proposition et le tap → l'empreinte invalide, la personne le sait en une
  phrase ; réalignement refusé → **aucune reproposition** ; formulaire ouvert
  sans plan courant → il se referme sans rien écrire ; élève sous
  `restriction_flag` → **rien ne se déclenche**.
- **courses** : `Pas encore` sur une vague → un décalage **calculé** est
  proposé en deux boutons, et **aucune question ouverte** n'apparaît dans le
  texte (cherche-la, FR et EN) ; `Oui` → la session et ses repas glissent, les
  vagues sont recalculées, et la ligne réapparaît au **nouveau** `buyOn` ;
  `Non, je gère` → rien ne change et **la ligne ne revient pas** ; vague 1
  déjà faite + décalage de 3 jours → `perishables_at_risk` **calculé depuis la
  date d'achat réelle** ; décalage au-delà d'`ends_on` → `outside_plan_window` ;
  préparation déjà cuisinée → `already_cooked` ; aucun décalage viable → le
  motif est **dit** et un repli est proposé.
- **extra-hard** : **session sautée dont les repas s'étalent sur 4 jours** → la
  cascade invalide exactement ceux-là et **pas un de plus** ; **session sautée
  dont un repas a déjà été coché** → le repas coché **survit** ; deux accidents
  le même jour → une seule invitation photo (budget T4) ; **`Pas encore` de
  courses ET `✗` de repas le même soir** → une seule chose est proposée, pas
  deux ; accident + FF-056 (la divergence) actifs la même semaine → les deux ne
  produisent pas deux propositions contradictoires ; un plat en lot présent
  deux jours → décaler l'un ne touche pas l'autre (la clé est positionnelle).

## Revue adversariale — angles imposés

- **La cascade trop large.** Fabrique une session dont un seul repas a déjà été
  mangé, déclare-la non faite, et **prouve que le repas mangé survit**.
- **V3 par la petite porte.** « Tant qu'on y est, on recompose les trois jours
  restants » — vérifie qu'aucun chemin de ton code ne peut le faire, y compris
  le glissement : il **déplace des dates**, il ne rappelle jamais le modèle.
- **Le glissement sur un frigo plein.** Le piège le plus coûteux : rien
  n'échoue, rien ne lève, et la personne trouve du poulet gâté trois jours plus
  tard. Fabrique le cas — vague 1 faite lundi, décalage de la cuisson de mardi
  à vendredi — et prouve que `perishables_at_risk` mord, **depuis la date
  d'achat réelle**.
- **La question ouverte qui revient.** « Tu peux y aller quand ? », « c'est
  prévu pour quand ? » — cherche toute formulation prospective dans le texte
  produit. Le décalage se **calcule**, il ne se demande pas.
- **Le champ libre qui s'invite.** Si tu as ajouté un « autre » ouvert, prouve
  qu'il n'est **jamais requis** pour clore le formulaire.
- **Le jugement qui fuit.** Cherche « écart », « craquage », « rattrapage »,
  « cheat » dans tout ce qui sort, FR et EN. Le verrou doit mordre.
- **Le formulaire qui devient un questionnaire.** Trois boutons, pas cinq. Un
  quatrième cas se traite par « autre chose », pas par une branche neuve.
- **La contre-mesure de la fiche** : si ouvrir un formulaire après chaque `✗`
  faisait **baisser** le nombre de décoches, les gens auraient appris que
  signaler déclenche une procédure — et cesseraient de signaler. Tu ne peux pas
  le mesurer en local, mais vérifie que **rien dans les textes ne lie le
  signalement à une obligation** (« maintenant il faut choisir » est interdit ;
  ignorer le formulaire doit rester gratuit et sans trace).

## Ton rapport

`scratchpad/RAPPORT-FF-057.md`, structure du socle. En plus :
- le **choix fait pour le marqueur de session** (payload vs table) et son
  raisonnement ;
- la **règle exacte de la cascade** que tu as implémentée, et le test qui la
  borne ;
- la **règle du plus petit décalage viable** que tu as retenue, et la
  répartition des trois motifs de refus sur tes cas de test ;
- ce que tu as vu de **V3** et que tu n'as **pas** construit.

## Les interdits absolus

Aucune capture (la bande du soir, les coches et l'état de vague sont FF-058).
**Aucune question ouverte sur le futur** — le décalage se calcule et se
propose. Aucun champ libre obligatoire. Aucun aliment inventé. Aucun jugement
de vocabulaire. Aucune relance ni reproposition, et **aucun rappel de courses
inventé** : l'auto-limitation vient du `buyOn`, pas d'un mécanisme à toi. Muet
sous `restriction_flag`. **V3 fermé** — un glissement déplace des dates et
n'appelle jamais le modèle. Si un de ces interdits te semble bloquer une bonne
idée, consigne l'idée et n'y touche pas — l'humain tranche.
