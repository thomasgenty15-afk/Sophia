# Master prompt — construire le plan de mise en œuvre

Tu es l'architecte de ce chantier. **Tu ne codes rien.** Tu produis **un seul
fichier** : un plan que quelqu'un d'autre pourra exécuter sans te reposer de
questions.

Dépôt : `/Users/ahmedamara/Dev/Sophia 2`. Produit : composition de repas pour un
foyer (batch cooking, 1 à 8 bouches). Deno/Supabase edge functions + React.
**Réponds en français.**

---

## 1. CE QUE TU PRODUIS

Un fichier `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md` qui contient :

1. **Un état des lieux** — ce qui est déjà fait, ce qui est décidé, ce qui reste ouvert.
2. **Un graphe de dépendances** — pas une liste. Quel lot bloque quel autre, et pourquoi.
3. **Des vagues d'exécution**, chacune terminée par une **vérification en conditions réelles**.
4. **Une fiche par lot**, au format imposé au §8.
5. **Les questions qui restent ouvertes**, sans en résoudre une seule en silence.

⛔ **Un plan qui ne peut pas être exécuté sans toi a échoué.** Chaque lot doit
nommer ses fichiers, ses fonctions, sa mesure avant, sa mesure après, et ce qui
prouve qu'il est armé.

---

## 2. CE QU'IL FAUT LIRE — ET DANS CET ORDRE

### ⛔ D'abord : ce qui a DÉJÀ été fait

Quatre lots ont déjà tourné. **Les lire avant de planifier**, sinon tu planifies du
travail terminé :

```
scratchpad/2026-08-21-0300-LOT18-RAPPORT-sas-des-inconnus.md
scratchpad/2026-08-21-0111-LOT19-RAPPORT-PARITE-FR-EN.md
scratchpad/2026-08-21-0111-LOT19-CIQUAL-LIGNES-ABIMEES.md
scratchpad/2026-08-21-lot30-RAPPORT.md
```

### Les trois documents de design — l'autorité

```
scratchpad/2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md   le calcul — lots 1 à 38
scratchpad/2026-08-21-DESIGN-MEMOIRE.md                      la mémoire — lots M1 à M8
scratchpad/2026-08-21-DESIGN-FOYER-REPARTITION.md            le foyer — D1 à D5 + 166 conflits
```

### Les huit cas — le déroulé concret

```
scratchpad/2026-08-21-CAS-01-SOLO-JOURNEE-3-REPAS.md
scratchpad/2026-08-21-CAS-02-SOLO-CONTRAINTES-COMPLETES.md
scratchpad/2026-08-21-CAS-03-EQUIPEMENT-ET-PLAT-TRADITION.md
scratchpad/2026-08-21-CAS-04-CINQ-JOURS-SANS-CONGELATEUR.md
scratchpad/2026-08-21-CAS-05-DATE-DUREE-ET-BUDGET.md
scratchpad/2026-08-21-CAS-06-PRESENCE-GAMELLE-ET-OBJECTIF.md
scratchpad/2026-08-21-CAS-07-MEMOIRE-DEUX-SOURCES.md
scratchpad/2026-08-21-CAS-08-FOYER-TROIS-BOUCHES.md
```

⛔ **LES CAS 01 À 07 PORTENT DEUX ERREURS, ET LE CAS 08 §0 LES NOMME.** Le moteur
n'utilise **jamais l'âge exact** (`midAge` par bande : 24 / 37 / 52 / 67), et le
**plafond protéique à l'IMC 30 n'existe pas** — c'est une proposition, et l'IMC est
banni du dépôt. **Vérifie chaque chiffre que tu reprends d'un cas.**

### Le reste

```
scratchpad/2026-08-20-2130-ETAT-DE-LART-NUTRITION.md   la littérature, 42 conclusions vérifiées
scratchpad/2026-08-21-0040-PROMPT-*.md                 deux prompts déjà écrits
scratchpad/2026-08-21-PROMPT-GRILLE-DE-PRIX-FR-US.md
docs/keel/MODEL.md  ·  docs/keel/BOITES-PAR-REPAS.md  ·  docs/keel/CONTRACT.md
CLAUDE.md  ·  AGENTS.md
```

---

## 3. COMMENT PROCÉDER

**Tu peux et tu dois lancer des sous-agents en parallèle.** Le but est un plan
complet en quelques heures, pas en deux jours.

### Phase A — lire, en parallèle *(≈ 6 agents)*

Un agent par domaine, chacun rend une liste structurée : ce qui existe et tourne ·
ce qui existe **sans appelant** · ce qui n'existe pas · les chiffres mesurés.

```
A1  le calcul et l'ancrage        mouth_anchor · meal_envelope · weight_pace · energy_gate
A2  le référentiel                food_composition* · les lots 18/19/30 déjà faits
A3  la mémoire                    retained_* · plan_feedback* · draft_note_* · conversation_*
A4  le foyer                      household_composition · household_portions · household_diet
A5  la sécurité                   safety_constraints · household_safety · allergen_* · les planchers
A6  le front et les écrans        SetupPage · HouseholdPage · MouthFormDialog · les i18n
```

⚠️ **Chaque agent doit distinguer les trois états** — *tourne* / *existe sans
appelant* / *n'existe pas*. C'est le mode d'échec principal de ce dépôt : un
lecteur sans écrivain ressemble trait pour trait à une fonctionnalité qui marche.

### Phase B — construire le graphe

Croise les lots des trois documents. Cherche :

- **les blocages réels** — un lot dont un autre dépend
- **les doublons** — deux lots qui touchent la même ligne
- **les lots déjà faits** — les quatre rapports du §2
- **les lots qui s'annulent** — une décision plus récente qui en renverse une plus ancienne

⚠️ **Deux exemples connus, à vérifier et à ne pas rater** : le lot **11**
*(`composedDishShare`)* fausse toute mesure tant qu'il n'est pas livré ; le lot
**9 bis** bloque le lot 9 et a **fusionné** avec le lot 20.

### Phase C — la revue par profils *(en parallèle)*

Fais relire ton plan par **cinq profils**, chacun avec une question précise :

| profil | sa seule question |
|---|---|
| **architecte** | l'ordre est-il un vrai DAG ? quel lot casse quoi ? quelle est la surface d'impact de chacun ? |
| **nutritionniste** | un lot affaiblit-il un plancher ? les valeurs sont-elles conformes au document d'état de l'art ? un lot promet-il ce que la science ne porte pas ? |
| **sécurité alimentaire** | un lot ouvre-t-il un chemin vers une allergie, un mineur, une grossesse, un plancher TCA ? conservation et contamination croisée sont-elles couvertes ? |
| **QA / mesure** | chaque lot est-il **falsifiable** ? qu'est-ce qui prouve qu'il est armé ? la mesure avant existe-t-elle avant la mesure après ? |
| **produit** | les 31 décisions produit du registre foyer sont-elles tranchées ou déguisées en travail technique ? que voit l'utilisateur changer ? |

Puis **réécris le plan** en intégrant ce qui survit. Dis en une ligne ce que chaque
profil a fait changer.

---

## 4. CE QUI FAIT UN BON PLAN **ICI**

**① Un DAG, pas une liste.** L'ordre doit venir des dépendances, jamais du thème.

**② Une vague 0 de MESURE.** Plusieurs lots sont injugeables sans un état de départ.
Le taux de journées calculables, la répartition `crossed`/`legacy`/`assumed`, le
nombre de plans qui portent une ceinture de régime — tout ça se mesure **avant**.

**③ Chaque lot nomme ce qui prouve qu'il est armé.** Un compteur, un test qui rougit
si on le désarme, une ligne en base. ⛔ *« Un lot désarmé ressemble trait pour trait
à un lot qui marche. »*

**④ Avant/après, avec la direction attendue nommée D'AVANCE.** Un lot qui change des
grammes sans mesure préalable n'est pas exécutable.

**⑤ Des runs réels, pas des tests seuls.** Le dépôt a mesuré que des chemins entiers
semblent vivants sans avoir jamais tourné : `cooking_session_states` est à **0**, la
ceinture de régime n'a **jamais mordu** *(13 plans, tous à une seule bouche)*.
⇒ **Une fixture obligatoire** : un foyer de 4 bouches avec un végane, un mineur, une
allergie médicale, deux objectifs opposés et une absence partielle.

**⑥ Ne résous aucune question ouverte en silence.** Les trois documents en portent.
Si un lot en dépend, écris-le comme une **porte**, pas comme une hypothèse.

**⑦ Le coût réel.** Une constante à changer et un chantier de référentiel ne sont
pas le même lot. Dis lequel est lequel.

---

## 5. ⛔ LES PIÈGES DE CE DÉPÔT — ils ruineraient le plan

Chacun a déjà été payé ici. Ton plan doit les éviter **et** les faire éviter :

- **une règle qui ne vit que dans un prompt régresse en réel**, personne ne le voit ;
- **un lecteur sans écrivain** — vérifie les appelants, en retirant les commentaires
  d'un `grep` naïf ;
- ⛔ **jamais un matcher maison** — « laitue » ≠ « lait », **12 faux positifs sur 12
  mesurés** ;
- **un paramètre de garde optionnel est une garde désarmée** ;
- **deux copies d'un même nombre divergent**, et c'est celle qu'on regarde le moins
  qui garde l'ancienne ;
- **un test paramétré par sa propre constante reste vert quand on change la
  constante** — il faut le muter pour le prouver ;
- **une garde a besoin d'un cas qui PASSE** : cassée, elle bloque tout et ressemble
  à une garde qui marche ;
- **`create or replace view` perd `security_invoker`** ;
- **une migration hors ordre est sautée en silence** — comparer le disque au registre ;
- **`agent-gate` ne lance pas vitest** : un rouge front passe le commit ;
- **le runtime edge sert un cache périmé des modules `_shared`** — redémarrer
  `functions serve` avant tout run réel ;
- ⛔ **jamais `unicode_escape`** pour insérer du texte accentué : mojibake que ni
  `tsc` ni la parité n'attrapent.

---

## 6. LES CONTRAINTES DURES

- **Migrations** : `docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f <fichier>`,
  puis enregistrées à la main dans `supabase_migrations.schema_migrations`.
  ⛔ **`supabase db reset` et `db push` sont INTERDITS, même en local** — la base
  locale est partagée entre sessions.
- **Toute table neuve** : `revoke all ... from anon, authenticated` **dans la même
  migration** *(les privilèges par défaut donnent TOUT à `authenticated`)*, et
  **réclamée par le lifecycle RGPD**.
- ⛔ Pas de `functions deploy`, `secrets set`, `config push`, `link`. Si un lot en a
  besoin : **le plan donne la commande, il ne la lance pas**.
- **Ne jamais commiter** `en.ts` / `fr.ts` / `catalog.ts` / `planRefusals.ts`.
- ⛔ **Pas de `git stash`** — dépôt partagé, ça emporte les fichiers d'autres sessions.
- ⚠️ **N'exporte pas de variables `SUPABASE_*`** avant la suite de tests : 114 faux rouges.
- ⚠️ **401 « Invalid JWT » en local** : le seul geste autorisé est
  `./scripts/check-local-jwt-alg.sh`, puis lire `docs/keel/JWT-HS256.md`.

---

## 7. LES INVARIANTS PRODUIT — un lot qui les casse est refusé

- **aucun chiffre à l'élève**, sauf la seule exception écrite au lot 24 *(une
  recommandation en kcal, uniquement pour une bouche à objectif, et elle passe le
  plancher TCA)* ;
- **le plancher TCA est fail-closed** ;
- **un mineur ne reçoit jamais un nombre qui le vise** ;
- **`member_portions` est lisible par tout le foyer** ⇒ aucun fait de corps n'y transite ;
- **jamais un prénom comme clé** — `member_id`, toujours ;
- **allergie, régime, condition médicale ne naissent jamais d'un classement** — elles
  ont leur table, synchrone, avec consentement.

---

## 8. LE FORMAT DE CHAQUE LOT

```
### L<id> — <titre en une ligne>

quoi          une phrase, ce que ça change pour un utilisateur
pourquoi      le défaut mesuré qu'il ferme, avec son chiffre
dépend de     les lots qui doivent être livrés avant, et POURQUOI
bloque        les lots qui l'attendent
fichiers      les chemins exacts, avec les fonctions ou constantes
migration     oui/non — si oui, la table, le revoke, la réclamation RGPD
mesure AVANT  la requête ou le compteur, et sa valeur d'aujourd'hui si connue
direction     ce qu'on ATTEND que la mesure fasse — écrit avant de coder
mesure APRÈS  la même requête, et le seuil qui dit que c'est réussi
armé par      le compteur, le test, ou la ligne qui prouve que ça tourne
coût          une constante · un petit lot · un lot · un chantier
risque        ce qui casse si c'est mal fait
```

⚠️ **`direction` avant `mesure APRÈS`, et pas l'inverse.** Écrire la direction
attendue **après** avoir vu le résultat n'est pas une mesure, c'est une
justification.

---

## 9. CE QUE JE NE VEUX PAS

- ⛔ un plan **thématique** — « d'abord la nutrition, puis le foyer » ignore les
  dépendances ;
- ⛔ des lots **sans mesure** ;
- ⛔ une **estimation en jours** — donne des **dépendances** et un **coût relatif** ;
- ⛔ des questions ouvertes **tranchées en passant** ;
- ⛔ un plan qui **suppose** que les cas 01 à 07 sont justes *(voir §2)*.

---

## 10. À LA FIN

Écris, en tête du plan :

1. **ce qui est déjà fait** et n'a plus à être planifié ;
2. **les trois lots qui débloquent le plus** de choses en aval ;
3. **le lot le plus dangereux** et pourquoi ;
4. **ce que chaque profil de revue a fait changer** ;
5. **ce que tu n'as pas pu vérifier**, et ce qu'il faudrait pour le faire.
