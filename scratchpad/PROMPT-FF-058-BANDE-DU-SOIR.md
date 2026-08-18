# Prompt — Construire FF-058 · La bande du soir

> À donner à l'agent responsable du suivi quotidien. Le prompt complet =
> **LE SOCLE COMMUN** de `scratchpad/PROMPTS-REALIGNEMENT-CHAT.md` (l. 16-143,
> à coller en premier) **+ ce bloc**.
>
> **Ordre** : cette fiche passe **avant** FF-057 (la procédure accident), dont
> elle est une des trois entrées. Mais chacune peut être livrée seule.

---

# BLOC · FF-058 — La bande du soir

**Fiche** : `docs/fonctionnalites/suivi-quotidien/FF-058-la-bande-du-soir.md`
— lis-la **en entier** d'abord, puis `conversation/README.md` (les règles
T1–T9 s'appliquent : le message du soir est une surface de conversation).

## Le contexte produit

La coche existe et elle est bonne. **Elle coûte trop cher à poser** : ouvrir
l'app, trouver l'écran, retrouver les plats. Personne ne le fait tous les
jours, donc les coches sont clairsemées, donc **tout ce qui les lit décide sur
du bruit** — le fait du soir, l'adhérence, la vue coach, et FF-056 (la
divergence constatée) qui compare un poids réel à des coches absentes.

Tu ne rajoutes **pas** une collecte. Tu **réduis le prix d'un geste que la
personne voulait déjà faire**. Cette distinction est tout le chantier, et elle
tient en deux règles :

- **Le cas nominal coûte UN tap.** Trois questions oui/non par soir seraient le
  formulaire quotidien que ce produit a retiré, avec sa mesure : *« un
  formulaire quotidien se fait ignorer, puis couper ; la mesure elle-même
  finissait par se détruire »* (`daily_recap.ts`).
- **Une affordance, pas une question.** `[✓ poulet-riz]` **offre** ; « t'as
  mangé le poulet ? » **interroge**. C'est cette frontière qui rend la fiche
  compatible avec T3 (le chat n'initie jamais une collecte) — si elle tombe,
  toute la fiche tombe.

## L'état du dépôt — vérifie, puis réutilise. Ne réimplémente rien.

Ce dépôt paie en boucle la faute des deux implémentations d'une même règle
(`meal_stretch.ts` : *« la divergence se voit comme "l'écran coche mardi, la
conversation propose mercredi" sans qu'aucune des deux ne soit identifiable
comme la menteuse »*).

- **La coche** : `_shared/keel/meal_tick.ts` —
  `mealTickKey(mealId, dishIndex)` (clé `meal_tick:<id>:<index>`, bâtie sur la
  **position** dans le plan, jamais le titre : deux jours peuvent porter le
  même plat en lot), `parseMealTickKey` (rend `null` sur une clé mal formée —
  ne devine jamais), `MEAL_UNTICK_REASON = 'food_not_eaten'`.
  **L'index unique partiel `(user_id, source_message_id)` rend le double tap
  idempotent côté Postgres** — ne code aucun anti-double-clic.
  ⚠️ **Un plan COURANT et un plan SUIVANT coexistent** et leurs coches portent
  le même préfixe. Le module documente le symptôme déjà rencontré : un
  numérateur qui mélange deux plans face à un dénominateur venu d'un seul
  affiche **« 5 des 3 »** sans que rien ne le signale. Passe par
  `parseMealTickKey` et le `mealId`, **jamais** par `startsWith`.
- **Le véhicule** : `daily_recap.ts` + `daily_recap_io.ts` — le message du
  soir, ses ceintures (`VERDICT_PATTERNS`, `allowedNumbers`, `minor_quantity`)
  et `loadDayFacts` qui lit déjà `protocol_events` en filtrant
  `disqualified_reason is null`.
- **Les boutons** : le patron déterministe est celui du tap du soir
  (`daily_pulse.ts` : `pulseLevelButtons()`, `PULSE_BUTTON_PREFIX`,
  `interactive_id`) — *« les identifiants exacts sont du déterministe, jamais
  du LLM »*. Livraison : `_shared/chat/delivery.ts` (`buttons`,
  `message_type: "interactive_buttons"`). Retour :
  `chat-inbound-v1/index.ts`, sur le chemin des boutons déterministes existant
  (`button_payload`, `handled_by`).
- **Le plan du jour** : `meal_plan_window.ts` est la source de vérité de
  « quel plan possède ce jour ». `meal_stretch.ts` est **périmé** pour ça et le
  dit lui-même.
- **Le budget** : `_shared/keel/daily_ask_budget.ts` (T4).

## Ce que tu construis

**① Les plats du jour en boutons** — module pur + test.
Entrée : le plan qui possède ce jour, le jour local. Sortie : les plats nommés
+ leurs `interactive_id` construits avec `mealTickKey`. Plus **un id agrégé**
pour `[✓ Tout comme prévu]` qui porte **la liste des index**, pas un « tout »
ambigu — le tap doit rester reconstructible et idempotent.
**Zéro plat prévu ⇒ aucune bande**, et le message du soir reste ce qu'il est.

**② La bande dans le message du soir.** Elle s'ajoute au message **existant**,
jamais un second. Ordre : le fait du jour d'abord (gratuit à recevoir), la
bande ensuite.
⚠️ **R6** : la bande ne consomme **pas** le budget T4 (affordance), **mais** le
même soir ne porte une pratique-question (FF-029) ou une recommandation
(FF-028) **que si le budget est libre**. **Mesure la longueur du message et le
nombre d'éléments interactifs avant/après** — c'est le rabbit hole n°1.

**③ Le traitement des taps** dans `chat-inbound-v1`, sur le chemin
déterministe. `[✓ Tout comme prévu]` écrit **toutes** les coches du jour par le
chemin de l'écran. Un `✗` écrit la décoche (`MEAL_UNTICK_REASON`) — **et rien
de plus** : la suite appartient à FF-057, et si FF-057 n'existe pas encore, la
décoche seule est un résultat complet et valide.

**④ Le cas du foyer — R10 à R13, la partie la plus subtile.**
La règle qui répartit tout : **la cuisson est un fait du foyer, la consommation
est un fait de personne.**

- **Chaque compte a sa propre bande, sur son propre budget.** Le maître, et
  chaque profil réclamé.
- **La question de session (« la cuisson de dimanche a eu lieu ? ») ne part
  QU'AU MAÎTRE.** Lui seul le sait, et sa réponse engage tout le foyer (c'est
  elle qui déclenche la cascade de FF-057). L'envoyer à un profil réclamé est
  un **bug**, pas une option.
- **Le maître ne coche JAMAIS pour un profil réclamé.** Sinon on remet un
  adulte en position de déclarer ce qu'un autre a mangé : c'est la surveillance
  que ce produit a retirée, et ça détruit la raison d'être du profil réclamé
  (la frontière de confidentialité qui rend l'honnêteté possible).
- **Les bouches sans compte n'ont AUCUNE coche individuelle.** Personne ne les
  lit — pas d'objectif, pas de mesures, pas de ceinture : les collecter
  violerait T1. Le tap du maître dit « le plat a été fait et servi comme prévu,
  **moi compris** », rien de plus.
- **Maître `✓` + conjoint `✗` n'est PAS une contradiction** : deux faits vrais
  sur deux personnes. Aucun n'écrase l'autre, aucun ne déclenche de question de
  cohérence.
- **Le plancher de restriction est par personne** : un maître sous plancher ne
  reçoit rien, son conjoint reçoit sa bande normalement.

⚠️ **Ne construis PAS la bande du profil réclamé aujourd'hui** : la réclamation
de profil n'existe pas encore. Ces règles sont écrites pour que le code que tu
poses ne les rende pas impossibles à respecter demain — **le cas nominal
actuel est : une seule bande, celle du maître.** Vérifie l'état réel avant de
supposer.

**⑤ La ligne de courses — R14 à R17, et une donnée neuve.**

`grocery_waves.ts` calcule déjà `buyOn` (quand acheter) et `servesCookOn`
(quelle cuisson la vague sert). **Personne ne sait jamais si la vague a été
faite** : les coches de `ShoppingListPanel.tsx` sont du `React.useState`
(l. 125) — elles meurent au rechargement et **n'atteignent jamais la base**.
Vérifie-le toi-même avant de construire.

- **Le soir d'un `buyOn`, et seulement ce soir-là**, la bande porte une ligne
  de plus : **`[ ✓ Courses faites ]` / `[ Pas encore ]`**. La faire
  réapparaître « tant que ce n'est pas fait » serait du harcèlement de corvée
  (R15) — et c'est cette limitation qui rend le mécanisme acceptable.
- **Fait du foyer, donc maître seulement** (R14), comme la session de cuisine.
- **Affordance, donc pas de budget T4** — comme les coches de repas.
- **Écris l'état de la VAGUE** (plan + `buyOn` : faite ou non, et quand),
  **jamais un état par article** (R16) : personne ne lit une liste à moitié
  cochée, et ce serait T1 violé. C'est la **seule donnée neuve** de cette
  fiche — table ou colonne, tranche au plus simple et documente ton choix dans
  l'en-tête du module.
- **Aucune question sur le futur** (R17). La date est déjà dans le plan : le
  jour venu on constate, point. Ce qu'on fait d'un `Pas encore` se **propose**
  et c'est FF-057 — **tu ne le construis pas ici**.
- Deux vagues le même jour ⇒ **une seule ligne** ; aucune vague ce soir ⇒
  **aucune ligne**.
- L'état de vague est **un état**, pas un journal : si la personne se ravise,
  la dernière réponse gagne (contrairement aux coches de repas, append-only).

## Tests en conditions réelles

- **easy** : journée à 3 plats → le message les nomme ; `[✓ Tout comme prévu]`
  → **3 coches en base**, chemin de l'écran, et **aucun compliment, aucun
  score, aucune série** dans la réponse. 3/3, FR et EN.
- **medium** : `[Pas tout]` → les 3 plats en ✓/✗ ; un `✗` → décoche écrite ;
  zéro plat prévu → aucune bande ; double tap → **une seule ligne en base** ;
  tap `✓` puis décoche dans l'app → la décoche gagne.
- **hard** : personne ne répond → **rien écrit, rien inféré, aucune relance** ;
  élève sous `restriction_flag` → **aucune bande** ; message sans fait du jour
  mais avec des plats → la bande peut porter le message seule ; le plan change
  entre l'envoi et le tap → **les coches restent valides** (elles disent un
  fait passé).
- **foyer** : un foyer avec deux enfants sans compte → le tap du maître n'écrit
  **aucune** coche individuelle pour eux ; la question de session **ne part
  qu'au maître** ; un maître sous plancher et un conjoint qui ne l'est pas →
  seul le conjoint reçoit sa bande. (Si la réclamation de profil n'existe pas
  encore, prouve au moins que **rien dans ton code ne rend R11–R13
  impossibles** demain, et dis-le au rapport.)
- **courses** : soir d'un `buyOn` → la ligne apparaît ; le lendemain, sans
  `buyOn` → **elle n'apparaît pas**, même si la vague est toujours « pas
  encore » ; deux vagues le même jour → **une seule ligne** ; tap sur
  « Courses faites » → **l'état de la vague** est en base avec sa date, et
  **aucun état par article** ; la personne se ravise et re-tape → la dernière
  réponse gagne ; profil réclamé → **il ne reçoit jamais la ligne de courses**.
- **extra-hard** : **plan courant + plan suivant coexistants** → chaque coche
  rattachée au bon plan, et **aucun ratio > 100 %** dans le message du soir ;
  bande + pratique + recommandation le même soir → **R6 tient** et le message
  reste lisible (mesure-le, ne le suppose pas) ; trois soirs ignorés d'affilée
  → le quatrième message ne mentionne **rien** des précédents ; un plat coché
  par la conversation et décoché par l'écran dans le même quart d'heure →
  prouve en base qu'il n'y a **qu'une histoire**.

## Revue adversariale — angles imposés

- **L'affordance qui redevient une question.** Cherche toute formulation
  interrogative dans le texte produit, FR et EN. C'est la garde qui légitime la
  fiche.
- **Le sapin de Noël.** Compose délibérément le pire soir possible (fait +
  bande + pratique + recommandation + invitation photo) et regarde ce que ça
  donne réellement à l'écran.
- **Le verdict qui revient.** `[✓ Tout comme prévu]` ne doit produire ni
  « bravo », ni « 3/3 », ni série. **Vérifie que les ceintures du soir
  s'appliquent vraiment à ce chemin** — ne le suppose pas.
- **La coche qui devient un score.** Le volume va exploser ; cherche tout
  endroit en aval qui pourrait en tirer un pourcentage. `adherence_score` est
  une surface supprimée.
- **La double vérité.** Coche par la conversation, décoche par l'écran : une
  seule histoire en base, prouvée.
- **La coche par procuration.** Cherche tout chemin — même indirect, même via
  une agrégation de foyer — par lequel le tap d'un compte pourrait écrire une
  coche attribuée à **quelqu'un d'autre**. C'est l'interdit R11, et il se
  prouve par l'absence de chemin, pas par l'absence d'intention.
- **La ligne de courses qui s'installe.** Le réflexe naturel est de la laisser
  tant que la vague n'est pas faite. Vérifie qu'elle **disparaît le lendemain**
  d'un `buyOn`, même sur une vague non faite : c'est R15, et c'est ce qui
  sépare un service d'un rappel de corvée.
- **L'état par article qui revient.** « Tant qu'on y est, on persiste les
  coches de la liste » — c'est une autre fonctionnalité, elle n'a aucun
  consommateur en aval aujourd'hui, et elle violerait T1. Si tu la trouves
  utile, écris-la au rapport et ne la construis pas.

## Ton rapport

`scratchpad/RAPPORT-FF-058.md`, structure du socle. En plus :
- la **mesure du message du soir avant/après** (longueur, nombre d'éléments
  interactifs) — le chiffre qui dit si R6 tient ;
- la **densité de coches** mesurée sur ton run — le bénéfice principal ;
- le **choix fait pour l'état de vague** (table ou colonne) et son raisonnement ;
- ce que tu as observé du taux de réponse global au message du soir (la
  contre-mesure de la fiche).

## Les interdits absolus

Jamais un second message. Jamais une formulation interrogative. Jamais une
question sur le futur. Jamais de relance ni de mention d'un silence passé.
Jamais de verdict, même positif. Jamais de score, de série, de compte fondu.
Jamais de coche automatique — le silence n'écrit rien. Jamais d'état par
article de course. Muet sous `restriction_flag`. Et **tu ne construis ni la
suite du `✗`, ni la suite du `Pas encore`** : les deux sont FF-057. **Si un de
ces interdits te semble bloquer une bonne idée, consigne l'idée et n'y touche
pas — l'humain tranche.**
