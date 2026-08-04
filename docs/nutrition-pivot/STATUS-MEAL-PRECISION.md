# ÉTAT — précision de repas (texte + photo)

> 2026-08-04. Branche **`main`** (et pas `dewhatsapp` : `git log main..dewhatsapp`
> est vide, `main` porte déjà toute la lignée — voir le journal).
> Journal : [PROGRESS-MEAL-PRECISION.md](PROGRESS-MEAL-PRECISION.md).
> **Rien n'est déployé.** Local uniquement.

---

## En une phrase

Une déclaration de repas trop imprécise pour servir au coach déclenche
**UNE** question ciblée, jamais sur une quantité, plafonnée à deux par jour, et
la réponse **amende le fait existant** au lieu d'en écrire un second.

---

## Ce qui marche, et comment on le sait

| Livrable | Preuve |
|---|---|
| Évaluation de complétude déterministe (4 axes fermés) | `meal_precision_test.ts` — 33/33 |
| Aucune question ne demande une quantité | test de lexique FR+EN sur les gabarits |
| Plafond 2/jour/élève, **partagé photo+texte**, en base | migration auto-vérifiée + `meal_precision_cap_test.ts` 9/9 + test d'intégration |
| Flow unifié à deux entrées | `meal_precision_flow_test.ts` — 15/15 |
| Classifieur local, liste fermée, `llmRunner` injectable | `meal_precision_amend_test.ts` — 16/16 |
| Lane d'amendement | `keel_meal_precision_lane_test.ts` — 9/9 |
| Ceinture de rendu / anti-interrogatoire | `meal_precision_render_test.ts` — 7/7 |
| **Jamais de repas en double** | `meal_precision_int_test.ts` — 3/3, `count(*)` avant/après sur une vraie base |
| Chaîne complète, vrai modèle | run réel EN **et** FR, ci-dessous |
| La garde mord (contre-factuel) | 3 essais réels, ci-dessous |

```
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
  → 2821 passed | 0 failed

deno test --allow-all supabase/functions/meal-photo-upload-v1/ supabase/functions/chat-inbound-v1/
  → 21 passed | 0 failed          (stack locale, vrai modèle de vision)

cd frontend && npx tsc -b --noEmit && npx vitest --config vitest.config.ts run
  → 200 passed | 0 failed
```

### Le run réel

```
T1 « I had chicken for lunch »
   « Noted: protein at lunch is covered.

     And what did you have with it? »
   protocol_events            : 1 ligne — poultry | slot=lunch
   meal_precision_questions   : 1 ligne — [text/accompaniment]
   flow                       : persisté, componentKeys=["food_group:poultry"]

T2 « with rice »
   recognized = {"amendments":[{"kind":"answer","student_text":"with rice"}],
                 "student_amended":true}
   protocol_events            : TOUJOURS 1 ligne
   flow                       : fermé
```

FR identique (« j'ai mangé du poulet à midi » → « avec du riz »).

### Le contre-factuel

Même message, même code, protocole du jour SANS ligne légume — donc plus rien ne
dépend de la réponse :

```
essai 1 : protocol_events 1 ligne | meal_precision_questions 0   ← la garde mord
essai 2 : protocol_events 0 ligne | meal_precision_questions 0
essai 3 : protocol_events 1 ligne | meal_precision_questions 0   ← la garde mord
```

---

## Les deux défauts que seul le réel a montrés

Les deux sont de la même famille : le companion **reconstruit** `temp_memory`
depuis l'état PRÉ-routing, donc tout état posé pendant le tour est effacé à la
persistance (classe `p1-session-style-commitments`).

1. **Le flow ouvert disparaissait.** La question partait, la place du plafond
   était consommée, et rien n'attendait la réponse — qui repartait donc écrire un
   repas complet. C'est-à-dire le doublon, malgré tout le mécanisme.
2. **Le flow fermé réapparaissait ouvert**, `turns` figé à 0 : il ne pouvait plus
   atteindre son max-tours et ne se fermait qu'au timeout de 30 minutes, pendant
   lesquelles chaque phrase de l'élève devenait un amendement.
   **Celui-là précède ce chantier** : la lane photo l'avait déjà, invisible.

Corrigés par le remède idiomatique du dépôt (mémoriser, ré-appliquer après
génération) et re-mesurés en run réel.

---

## Ce qui n'est PAS fait, et pourquoi

### 1. P5.1 — la règle de mise photo n'a pas été éprouvée sur images réelles

**Non fait.** Le dépôt ne contient aucun corpus de photographies de repas : les
tests d'intégration photo utilisent un PNG 1×1, que l'analyseur disqualifie —
il ne peut donc rien dire de « une hypothèse déclarée OU une image dégradée
est-elle une condition trop large ou trop étroite ? ».

Répondre demanderait un jeu d'images réelles annotées. Je n'en ai pas, et
fabriquer une réponse par lecture de code est exactement ce que le prompt
interdit. **Ce que ça demande :** ~30 photos réelles (plats simples, plats en
sauce, plats sous-exposés), passées à `analyze-meal-photo-v1`, et le comptage des
questions posées / manquées.

Ce qui A été fait côté photo : le plafond partagé (P5.2, vérifié par un test
d'intégration réel) et l'unification du vocabulaire (P5.3,
`ASSUMPTION_SUBJECT_TO_AXIS`, avec un test qui tombe si un sujet photo apparaît
sans axe).

### 2. Un composant AJOUTÉ par la réponse n'est pas encore écrit en run réel

Le mécanisme existe et est prouvé (`meal_precision_int_test.ts` : la réponse
écrit le riz, PAS un second poulet, avec le lien vers l'origine). Mais en run
réel, sur « with rice », **le dispatcher global n'émet aucun effet
`log_protocol_event`** — il n'y a donc rien à filtrer ni à écrire, et le riz
n'existe que comme prose dans `recognized.amendments`.

Conséquence : le coach VOIT la réponse, l'évaluateur ne la COMPTE pas.

C'est un comportement du dispatcher (une réponse brève à une question posée n'est
pas classée comme déclaration), pas du mécanisme construit ici. Le corriger
touche le prompt du dispatcher — hors périmètre annoncé, et le dépôt a déjà
mesuré que les correctifs prompt-only régressent en run réel. **À trancher.**

### 3. Le plafond a une fenêtre de course

`countMealPrecisionQuestionsToday` puis `recordMealPrecisionQuestion` sont deux
instructions : deux messages VRAIMENT simultanés du même élève peuvent lire
`count = 1` tous les deux et écrire tous les deux. Pire cas **3 questions au lieu
de 2**, sur un double envoi simultané. Le rejeu du MÊME message, lui, est
verrouillé par le schéma (unique `(user_id, asked_for_message_id)`, vérifié).

Remède si ça se voit : `insert … select … where (select count(*) …) < 2` en une
seule instruction, ou un advisory lock par `(user_id, local_date)`.

### 4. Non éprouvé

- **Minuit / changement de fuseau** : le plafond utilise `keelTurn.local_date`
  résolu dans le fuseau de l'élève, et le module n'a pas d'horloge (testé
  `missing_local_date` ⇒ fail-closed). Mais aucun test ne fait passer minuit.
- **Deux déclarations simultanées** : voir le point 3.
- **Navigateur** : le run réel a été joué en HTTP contre les edge functions
  locales (vrai dispatcher, vrai modèle, vraies écritures), pas dans l'interface.
  L'UI ne fait que poster ce message-là.

---

## Deux choses à savoir avant de reprendre

**Un autre agent travaille dans le même arbre.** Cinq commits ont atterri pendant
ce chantier, dont `2e853d10 pivot KEEL: le produit grand public sort du depot`.
Le fichier `feat/Git` contient `git add -A && git commit && git push origin main` :
tout travail en cours peut être committé et **poussé** par quelqu'un d'autre.
Aucun de mes fichiers n'a été touché, mais 7 tests frontend
(`ultimate.int.test.ts`) échouent maintenant — ils testent des triggers du
produit grand public que ce commit-là a supprimés. **Sans rapport avec ce
chantier**, et invisibles sauf si les variables d'env dé-skippent ces tests.

**La migration `20260804170000` est appliquée en LOCAL seulement.** Aucun
`db push`, aucun `functions deploy`.
