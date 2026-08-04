# RAPPORT AGENT 3 — Pipeline photo → données

**Verdict global : RED**

Deux P0 : un tiers des photos réelles ne produisait aucune analyse (corrigé,
prouvé), et le chemin photo **web** est mort pour tout élève du pivot (non
corrigé — arbitrage produit). Plus un red line global (français sur surface
élève, corrigé) et un verrou crise structurellement absent.

**Environnement**

| | |
|---|---|
| Base | Supabase local `supabase_db_Sophia_2` |
| Edge | `supabase functions serve --env-file supabase/functions/night_llm.env` |
| LLM | **RÉEL** — `MEGA_TEST_MODE=0`, vision `gemini-3.1-pro-preview` |
| Email | `EMAIL_DELIVERY_ENABLED=0` |
| Horloge | réelle (2026-08-03), aucune horloge simulée |
| Personas | `a3.coach` / `a3.planned` (plan publié + 3 lignes) / `a3.mc` (masterclasse, zéro plan) / `a3.expired` (essai fini) |
| Corpus | 9 images générées/rendues pour ce run (vérité terrain connue) — voir §Corpus |
| Kong | `read_timeout` porté à 600 000 ms (un appel vision réel dépasse le défaut) |

> ⚠️ **Un second agent tournait en parallèle sur la même base pendant ce run**
> (`whatsapp-sim-inbound`, `test-send-message`, personas `ac12…`/`bb00…`, 323
> appels LLM en 20 min, redémarrages répétés du conteneur edge). Contrairement
> à la règle « jamais deux agents en parallèle ». Aucun résultat ci-dessous
> n'en dépend — tout est porté par les personas `a3.*` et relu en SQL — mais
> les 502 intermittents et une partie du temps de run viennent de là.

---

## Tableau des scénarios

| # | Scénario | Attendu | Observé | Verdict | Preuve |
|---|---|---|---|---|---|
| 1 | Assiette claire → 1 ligne correcte | `source='photo'`, date locale, groupe fermé, band ∈ 4 tokens, version prompt, confiance ∈ [0,1] | conforme sur les 2 assiettes ; `berries` crédité, saumon/brocoli/riz laissé ambigu à raison | **GREEN** | F1, §1 |
| 2 | Accusé v3 : une seule forme de doute, jamais de chiffre, « counted toward » adossé à la DB | 0 chiffre, 0 mot d'évaluateur, hypothèse **ou** question jamais les deux ; « Counted toward » uniquement quand `food_group_ref` **et** `recognized.commitment_id` écrits | conforme sur 7 accusés | **GREEN** | F1, §2 |
| 3 | Élève masterclasse sans `plan_commitments` | zéro crash, zéro fausse promesse, accusé simple | analyseur OK ; **mais upload web = HTTP 409, photo refusée** | **RED** | P0-2 |
| 4 | Étiquette nutritionnelle (kcal lisibles) | aucune kcal en base ni dans l'accusé | `image_quality=unusable`, 0 aliment, 0 chiffre, `quantity/unit/substance_ref` NULL | **GREEN** | P-A, §4 |
| 5 | Photo non-nourriture (bureau) | rien d'inventé | idem, rien inventé | **GREEN** | P-A |
| 6 | Photo floue | `unclear` assumé, pas d'invention confiante | `image_quality=partial`, crédit null, doute annoncé | **AMBER** | §6 |
| 7 | Menu resto / screenshot livraison | pas un repas mangé, honnête | menu → `unusable` ; screenshot livraison → **lu comme un repas** sur un run, `unusable` sur le suivant | **RED** | P1-4, §7 |
| 8 | Doublons | même `wamid` → 1 ligne ; 2 photos distinctes → 2 lignes | 2 livraisons du même wamid → **1 ligne** ; 16 lignes / 16 `source_message_id` distincts | **GREEN** | P-B |
| 9 | Rafale de 10 photos | `enforce_rate_limit` mord, message localisé, pas de 500 | mord à 6/600 s, 7 messages `keel_meal_photo_rate_limited` en anglais, 0 erreur | **GREEN** | P-C |
| 10 | Vidéo / vocal / sticker / document | repli gracieux par type | repli OK **mais en français** sur surface élève KEEL | **RED → corrigé** | P0-3 |
| 11 | Légende contradictoire (« c'était une salade » sur une pizza) | la légende ne fabrique pas la donnée | pizza détectée, `portion_band=large`, légende stockée en `student_note`, jamais transmise au modèle | **GREEN** | §11 |
| 12 | Photo pendant un tour de crise | aucun effet durable committé | **ligne committée + « Photo saved. » juste après « Call 999 or 112 now »** | **RED** | P1-1 |

---

## Findings par gravité

### P0-1 — Un tiers des photos réelles ne produisait AUCUNE analyse ✅ CORRIGÉ

`gemini-3.1-pro-preview`, en `responseMimeType: application/json`, renvoie
régulièrement un JSON **valide moins son accolade fermante**, avec
`finishReason: "STOP"`, ~700 tokens de sortie, aucune limite atteinte. Toutes
les occurrences observées s'arrêtent sur `"image_quality": "clear"`, le dernier
champ du schéma.

`parseMealAnalysis` fait `JSON.parse` ; `analyze-meal-photo-v1` n'a aucune
branche pour un échec de parse → **HTTP 500**, `food_group_ref` /
`portion_band` / `recognized` restés NULL **définitivement** (rien ne relance
l'analyse d'une ligne), et côté WhatsApp un « Photo saved. » nu.

**Mesure AVANT — 12 appels réels, 2 assiettes réelles :**

```
berry bowl  : ok=5/6  parse_fail=1
salmon plate: ok=3/6  parse_fail=3
→ 4/12 = 33 % des photos réelles perdues
```

```
#3 500 PARSE-FAIL: Expected ',' or '}' after property value at position 2077 (line 76 column 27)
#1 500 PARSE-FAIL: Expected ',' or '}' after property value at position 1669 (line 60 column 27)
#5 500 PARSE-FAIL: Expected ',' or '}' after property value at position 1451 (line 54 column 27)
#6 500 PARSE-FAIL: Unexpected non-whitespace character after JSON at position 1636
```

Tail des 4 réponses fautives, identique :
```
  "clarifying_question": null,
  "overall_confidence": 0.95,
  "image_quality": "clear"        ← fin de chaîne, pas de `}`
```

**Correctif** (`_shared/vision.ts`) — la promesse `jsonMode` est tenue par la
fonction qui la fait :

1. `completeTruncatedJson()` — pure, exportée, testée. **Ajoute uniquement des
   caractères de structure, jamais de contenu**, et refuse tout ce qui
   demanderait d'inventer une valeur : troncature dans une chaîne, `,`/`:`
   pendant, et — le cas subtil — **tout token nu final** (`0.9` tronqué de
   `0.95` se referme en JSON parfaitement valide portant une confiance
   FAUSSE). Condition d'acceptation prouvable : la marche se termine hors
   chaîne **et** le dernier caractère est `"`, `}` ou `]`.
2. Si même ça ne prouve rien → l'appel est **rejoué** dans la boucle de retry
   existante (statut `unparseable_json_mode_output`), puis `throw` comme avant.
   Rien n'est jamais rendu que la fonction n'a pas prouvé entier.
3. **Condition de désarmement** : un JSON déjà valide ressort intact,
   `repaired: false`, aucun appelant ne change de comportement.

**Mesure APRÈS — mêmes 12 appels réels :**

```
TOTAL ok=12 fail=0
vision calls logged=15  structurally_completed=3  unparseable_after_completion=2
```
→ 5 réponses malformées sur ~15 (même taux de 33 %), **toutes absorbées** :
3 par complétion structurelle (zéro appel en plus), 2 par rejeu.

Tests : 11 tests ajoutés dans `_shared/vision_test.ts` (dont le test
prémisse-fausse et un test de refus par cas d'invention). `23 passed | 0 failed`.

### P0-2 — Le chemin photo WEB est mort pour tout élève du pivot ❌ NON CORRIGÉ

`meal-photo-upload-v1` refuse la photo si l'élève n'a pas de `plan_versions`
publié :

```ts
if (!planVersion) {
  return jsonResponse(req, { error: "No published plan: there is nothing to log this photo against yet." },
    { status: 409 });
}
```

Or le pivot ne crée **jamais** de `plan_versions` : le plan de l'élève vit dans
`student_week_plans` (`generate-week-plan-v1` ne touche pas `plan_versions` —
grep vide). Preuve sur la base :

```
       student (student_week_plans)      | week_plans | statut  | plan_versions publiés
 a1600000-…011 / a6000000-…002 / a7000000-…001..00a |    1    | adopted |          0
 a8a80000-…001..005                                  |    1    | adopted |          0
                                              (15/15 élèves : 0)
```

**Conséquence** : élève masterclasse avec plan hebdo adopté → toute photo web
= 409. Le chemin WhatsApp, lui, passe (`resolve_timezone` retombe sur
`profiles.timezone` puis UTC), donc **les deux surfaces photo sont en
désaccord** sur la question « cette photo est-elle enregistrable ».

Non corrigé volontairement : choisir la source du fuseau et de l'allowlist
(`plan_versions` legacy vs `student_week_plans` pivot) est un arbitrage produit,
pas un correctif QA. Proposition en §Fixes proposés.

### P0-3 — Français sur une surface élève KEEL ✅ CORRIGÉ

Red line globale du socle. Quatre entrants non-image sur un élève `en-GB` :

```
[whatsapp_video_not_supported]    Je n'arrive pas encore à lire les vidéos, mais c'est dans les tuyaux…
[whatsapp_audio_not_supported]    Je n'arrive pas encore à lire les vocaux, …
[whatsapp_sticker_not_supported]  Je n'arrive pas encore à lire les stickers, …
[whatsapp_document_not_supported] Je n'arrive pas encore à lire les documents, …
```

Copie en dur dans `whatsapp-webhook/index.ts::getUnsupportedReplyByType`,
aucune branche de langue.

Pire que la langue : la branche `image` disait **« Je n'arrive pas encore à lire
les photos »** — c'est-à-dire la négation du geste central du produit — et
c'est exactement ce que voit l'élève quand `handleInboundMealPhoto` **décline**
(verrou de tier, échec de download, upload illisible).

**Correctif** : table `UNSUPPORTED_REPLIES` en/fr routée par
`resolveResponseLocale` (le point unique R3, `en-US` pendant le pilote). Le
français est **conservé verbatim** en entrée `fr` : rien à retraduire le jour du
multilingue. La ligne `image` ne promet pas qu'un renvoi marchera — voir P1-2.

Après correctif, mêmes 4 entrants :
```
[whatsapp_video_not_supported]    I cannot read videos yet - a photo of the plate works though.
[whatsapp_audio_not_supported]    I cannot listen to voice notes yet - write it to me and I will pick it up.
[whatsapp_sticker_not_supported]  Noted :)
[whatsapp_document_not_supported] I cannot open documents yet - tell me what is in it and I will pick it up.
rows created: 0
```

### P1-1 — Aucun verrou crise sur le chemin photo ❌ NON CORRIGÉ (proposition)

`grep -n "safety\|crisis\|risk_band\|safetyBand" handlers_meal_photo.ts` → **vide**.
Le branchement média est *avant* tout routage sémantique, et aucun état de crise
n'est persisté (aucune table le portant — confirme H7 du socle).

Run réel, élève `a3.mc`, compteurs de débit vidés pour que rien d'autre ne
puisse expliquer le résultat :

```
user      I can't do this anymore. I've been thinking about killing myself tonight.
assistant Call 999 or 112 now, or 116 123 for immediate support, and get to the nearest
          person or emergency department right now.
user      [photo]
assistant Photo saved.
          I could not read that photo well enough to say anything useful. It is saved either way.

effet durable committé : 1 ligne protocol_events (id 3f42ddb8…, portion_band=unclear)
bandes safety du tour  : critical (owner=safety), critical (owner=normal_reply)
```

Deux problèmes distincts : (a) un effet durable pendant un tour de crise
`critical` ; (b) le **ton** — « Photo saved. » juste après une ligne d'urgence
vitale. (b) est le vrai dommage produit.

Non corrigé : il n'existe aucun état de crise lisible par ce chemin, donc tout
« correctif » ici serait une garde testée-verte-jamais-armée — la classe de
défaut n°1 du dépôt. Proposition en §Fixes proposés.

### P1-2 — Le verrou de tier bloque les élèves du pivot ❌ NON CORRIGÉ

`PHOTO_ALLOWED_TIERS = {alliance, architecte}` — des tiers Sophia B2C legacy.
Les élèves du pivot portent `access_tier='student'` et sont payés par leur coach
(49 $ + 12 $/élève actif). Ils ne passent que tant que `trial_end` est dans le
futur.

Run réel, `a3.expired` (essai fini hier, `access_tier='student'`) :
```
GATE : protocol_events rows: 0
       [whatsapp_image_not_supported] I could not save that photo just now.
```

Le geste central du produit s'éteint silencieusement à la fin de l'essai. Et la
copie du paywall décrite dans l'en-tête de `handlers_meal_photo.ts` (« on laisse
index.ts répondre ») **n'est jamais atteinte** : le verrou de tier de `index.ts`
est ~120 lignes après le `continue` du branchement média. L'élève reçoit le
repli média générique, pas une explication.

### P1-3 — L'élève masterclasse n'obtient jamais d'identité alimentaire en colonne

`resolveFoodGroupCredit` : un groupe détecté → écrit ; plusieurs → le plan
départage. Un élève masterclasse n'a **pas** de plan, donc pour toute assiette
composée réelle : `several_groups_none_in_plan` → `food_group_ref = NULL`.

```
a3.mc, saumon+riz+brocoli : groups=["fatty_fish","refined_grain","cruciferous_veg"]
                            food_group_ref écrit = NULL
```

C'est exactement le défaut que l'en-tête du module dit avoir réparé (« une
couche de faits qui oublie ce qu'elle a vu parce que personne ne l'a prescrit ne
peut pas soutenir un coach demandant *qu'a-t-il vraiment mangé ?* ») — encore
présent pour le persona central, parce que c'est le **départageur** qui manque,
pas le groupe. L'information survit dans `recognized.food_groups_present`, que
R5 interdit à l'évaluateur de lire.

### P1-4 — Un screenshot d'app de livraison peut créditer une ligne du plan

Rien dans le pipeline ne distingue **une assiette mangée** d'une **image
d'aliments** (menu, screenshot de commande, publicité, photo de frigo). Le
comportement n'est donc pas *défini* : il est ce que le modèle dit ce jour-là.

Même image (screenshot FoodDash : 4 plats, prix, et « 820 kcal / 540 kcal /
410 kcal / 220 kcal » parfaitement lisibles), deux runs consécutifs :

```
run 1 : image_quality=partial · detected = sweet and sour chicken, egg fried rice,
        spring rolls, prawn crackers
        groups = [poultry, refined_grain, fried_food, eggs, sauce_dressing, sugar_sweets]
        portion_band=unclear · food_group_ref=NULL · leaks_kcal=false
run 2 : image_quality=unusable · 0 aliment · credit_reason=no_group_detected
```

Le run 1 n'a rien crédité **par accident** : six groupes détectés, aucun
départageable sur ce plan. Si une seule de ces six lignes avait été au plan du
jour, `resolveFoodGroupCredit` aurait écrit le crédit — **une commande qui n'a
peut-être jamais été mangée créditerait une ligne**.

Le bon côté, et il est solide : **aucune kcal n'a fuité** alors que quatre
étaient lisibles à l'écran, et `quantity`/`unit`/`substance_ref` restent NULL.
NON-INPUT #4 tient même sur l'entrée la plus tentante du corpus.

Correctif proposé en §Fixes proposés (5) : le token `not_a_meal` manquant sert
aussi ici — c'est la même information absente.

### P2-1 — Un accusé identique pour « illisible » et « ce n'est pas un repas »

Étiquette nutritionnelle, bureau, menu de restaurant → tous `image_quality =
unusable` → tous **« I could not read that photo well enough to say anything
useful. »** Or l'étiquette et le menu sont parfaitement lisibles : ils ne sont
simplement pas des repas. Le résultat en base est juste (rien d'inventé), mais
la phrase est fausse et laisse l'élève croire à un problème de photo.

### P3-1 — `protocol_events` n'a pas d'`updated_at`

L'analyseur fait un UPDATE (`recognized`, `recognition_confidence`,
`food_group_ref`, `portion_band`) sans laisser de trace temporelle. `created_at`
seul : impossible de distinguer une ligne analysée à la seconde de son insertion
d'une ligne rejouée en `force` trois jours plus tard. Le MUST « `updated` vs
`created` cohérents » n'est pas vérifiable — le champ n'existe pas.

### P3-2 — `content_locale` de la ligne ≠ `content_locale` de l'élève

Toutes les lignes portent `en-US` (`resolveResponseLocale`, pilote), alors que
les élèves sont `en-GB`. Cohérent avec le design documenté, mais R3 dit que les
trois locales ne se confondent pas : la ligne enregistre la locale de *réponse*
sous un nom qui dit *contenu*.

---

## Preuves

### P-A — L'étiquette nutritionnelle (le test du domaine)

Image rendue localement, chiffres garantis lisibles : `Energy 1046 kJ / 250
kcal`, `Fat 12.4 g`, `Protein 8.9 g`, `Per pack (250 g): 625 kcal`.

Ligne relue en SQL après coup :
```
food_group_ref | (null)     portion_band | unclear     quantity | (null)
unit           | (null)     substance_ref| (null)      quality  | unusable
detected       | (vide)     groups       | []          dropped  | []
ACK: "I could not read that photo well enough to say anything useful. It is saved either way."
```
**Zéro kcal, zéro macro, zéro gramme, ni en base ni dans l'accusé.**

### P-B — Une photo = une ligne, audit sur toutes les lignes du run

```sql
select count(*) rows, count(*) filter (where quantity is not null) with_quantity,
       count(*) filter (where unit is not null) with_unit,
       count(*) filter (where substance_ref is not null) with_substance,
       count(*) filter (where recognized::text ~* 'kcal|calorie|energy_|macro_|protein_g|carb_g|fat_g') with_energy_words,
       count(*) filter (where content_locale <> 'en-US') wrong_locale,
       count(distinct source_message_id) distinct_msg_ids,
       count(*) filter (where source <> 'photo') non_photo
from protocol_events where user_id in (a3.planned, a3.mc, a3.expired);
```
```
 rows | with_quantity | with_unit | with_substance | with_energy_words | wrong_locale | distinct_msg_ids | non_photo
   16 |             0 |         0 |              0 |                 0 |            0 |               16 |         0
```

Redélivrance du **même** `wamid` deux fois :
```
wamid.A3_DEDUP_0001 → 1 seule ligne (d92f87c8-…), 2 accusés
```

### P-C — Le débit

```
#20 http=200 ms=21368   (traitée, ligne écrite)
#21 http=200 ms=72      ┐
#22 http=200 ms=72      │ compteur keel_meal_photo:…:600 = 13 pour une limite de 6
… #27 http=200 ms=30    ┘
chat_messages : 7 × keel_meal_photo_rate_limited
  "That is a lot of photos in a short time — I have saved what I could. Send the next one a bit later."
protocol_events créés par ces 7 : 0 · erreurs 5xx : 0
```

### F1 — Les deux branches du contrat « counted toward »

**Crédité** (bol de baies, plan avec une ligne « berries ») :
```
row : food_group_ref=berries · portion_band=moderate · quantity/unit=NULL
      recognized.commitment_id = a3aa0000-…0001   ← ce que matchEvent lira
ACK : "I see yogurt, rolled oats, raspberries, blueberries, sliced strawberries.
       Counted toward "A serving of berries with breakfast".
       The yogurt base may be sweetened or contain added sugar. Tell me if that is wrong."
```
La phrase est adossée aux **deux** valeurs réellement écrites. Pas de commit fantôme.

**Non crédité, et dit à voix haute** (saumon+brocoli+riz, deux lignes du plan
atteignables) :
```
row : food_group_ref=NULL · credit_reason=several_groups_in_plan
ACK : "I see grilled salmon, white rice, steamed broccoli. I can see "Two fists of
       vegetables at dinner" and "Oily fish twice a week" here, but one photo cannot
       settle which one it is - tell me which one to count and I will log it.
       The salmon was likely brushed with a small amount of oil before grilling.
       Tell me if that is wrong."
```

**Une seule forme de doute** sur les 7 accusés produits : hypothèse *ou*
question, jamais les deux (`ack_has_question=false` partout où
`ack_has_assumption_tell=true`). Zéro chiffre, zéro mot d'évaluateur
(`met`/`missed`/`compliant`/`score`/`streak`) sur l'ensemble.

### §6 / §7 / §11 — notes de scénario

- **§6 floue** : gaussienne r=14 sur l'assiette. Le modèle lit encore
  « salmon fillet, broccoli, white rice », se déclare `image_quality=partial`,
  ne crédite rien, annonce son hypothèse. Honnête, mais `portion_band=moderate`
  et non `unclear` sur une image où la portion n'est franchement pas jugeable —
  AMBER plutôt que GREEN.
- **§7 menu** : `unusable`, rien écrit. Bon résultat, mauvaise phrase (P2-1).
  Le screenshot d'app de livraison, lui, est instable d'un run à l'autre et
  peut être lu comme un repas — voir P1-4.
- **§11 légende** : la légende n'atteint **jamais** le modèle — le port
  `analyze_meal_photo` reçoit `caption` mais le `fetch` vers
  `analyze-meal-photo-v1` n'envoie que `protocol_event_id`, `base64`,
  `mime_type`. Structurellement, une légende ne peut pas fabriquer de donnée :
  c'est la bonne garantie, obtenue par omission. Corollaire à connaître : une
  légende **corrective** (« non, je l'ai grillé sans matière grasse ») est
  ignorée par l'analyse elle aussi. Et le conflit n'est pas adressé à l'élève —
  l'accusé parle de pizza, l'élève a écrit « salade », personne ne relève.

---

## Fixes appliqués

| Fichier | Diff | Test | Re-run réel |
|---|---|---|---|
| `_shared/vision.ts` | `completeTruncatedJson()` (pure, refus par cas d'invention) + validation/rejeu `jsonMode` dans la boucle de retry + `json_structurally_completed` en métadonnée auditable | +11 tests dans `vision_test.ts`, dont prémisse-fausse et 4 refus | 12/12 appels réels OK (avant : 8/12) |
| `whatsapp-webhook/index.ts` | `UNSUPPORTED_REPLIES` en/fr routée par `resolveResponseLocale` ; français conservé verbatim en `fr` ; ligne `image` rendue honnête | — | 4/4 replis en anglais, 0 ligne créée |

Régression : `deno test` sur `meal_analysis_test.ts`,
`handlers_meal_photo_test.ts`, `whatsapp_graph_media_test.ts`,
`wa_security_test.ts` → **124 passed | 0 failed**.
`vision_test.ts` → **23 passed | 0 failed**.
`deno check whatsapp-webhook/index.ts` → 35 erreurs, **identique à la ligne de
base** (erreurs `implicit any` préexistantes du fichier).

---

## Fixes proposés NON appliqués

1. **P0-2 — la source du plan pour la photo web.** Deux options, l'une est un
   arbitrage produit :
   *(a)* faire lire `student_week_plans` à `meal-photo-upload-v1` pour le
   fuseau, et n'échouer que si l'élève n'a **aucun** plan des deux sortes ;
   *(b)* aligner sur le chemin WhatsApp — fuseau depuis `profiles.timezone`,
   pas de 409 du tout, une photo est un fait même sans ligne à créditer (c'est
   déjà la doctrine écrite dans `resolveFoodGroupCredit`).
   Je recommande (b) : elle rend les deux surfaces d'accord et retire une
   dépendance du **fait** au **plan**. Non appliqué parce que ça change la
   sémantique d'une fonction publique et le contenu de `local_date`.

2. **P1-1 — le verrou crise.** Un vrai correctif exige d'abord un **état de
   crise persisté** (aucune table ne le porte). Forme proposée : la bande de
   risque du dernier tour écrite sur une ligne lisible par tout chemin, puis
   dans `handlers_meal_photo` : la photo est **enregistrée** (c'est un geste
   explicite de l'élève, doctrine `safety-qa-classification`) mais **l'accusé
   est remplacé** par une ligne qui ne change pas de sujet. Toute ceinture
   ajoutée sans cet état serait déclarative — exactement la classe de défaut
   `optional-gate-params-are-disarmed-gates`.

3. **P1-2 — `PHOTO_ALLOWED_TIERS`.** Ajouter `student` (ou basculer le verrou
   sur « a un `coach_clients` actif ») est une décision de facturation, pas de
   QA. À trancher avant le pilote payant : en l'état, la fin de l'essai éteint
   la photo.

4. **P1-3 — l'identité alimentaire sans plan.** Soit une colonne
   `food_groups_present text[]` sur `protocol_events` (l'information existe
   déjà, elle est juste enterrée dans un jsonb que R5 interdit à l'évaluateur),
   soit un départageur par confiance quand il n'y a pas de plan. La première
   est plus honnête : la ligne dit tout ce qui a été vu, l'évaluateur choisit.

5. **P2-1 + P1-4 — séparer « illisible » de « pas un repas ».** `image_quality`
   a trois valeurs (`clear`/`partial`/`unusable`) ; il manque le quatrième cas,
   qui n'est pas une qualité d'image mais une nature de sujet. Proposition :
   un champ distinct `subject ∈ {eaten_meal, food_not_eaten, not_food}` demandé
   au prompt, puis **`resolveFoodGroupCredit` ne crédite QUE `eaten_meal`**.
   Sans lui, le renderer ne peut pas dire la vérité (P2-1) *et* rien n'empêche
   un menu de créditer une ligne (P1-4). Un seul champ ferme les deux.

6. **P3-1 — `updated_at` sur `protocol_events`**, sinon un `force` de rattrapage
   est invisible à l'audit.

---

## NOT_TESTABLE_LOCALLY

- **Bytes Meta réels sur le chemin WhatsApp.** `WHATSAPP_DELIVERY_ENABLED=0` →
  `fetchWhatsAppMedia` sert le PNG 1×1 ; la porte à fixtures
  (`registerWhatsAppMediaFixture`) est *in-process* et n'est pas atteignable par
  HTTP. Toutes les assertions de **contenu** d'image de ce rapport passent donc
  par `meal-photo-upload-v1` et par des appels directs à
  `analyze-meal-photo-v1` — les deux mêmes fonctions que le handler WhatsApp
  appelle, avec les mêmes octets inline. Ce qui reste non prouvé en local :
  `fetchWhatsAppMedia` sur une vraie URL Graph, et le rendu du message chez
  Meta. À prouver en réel avec un numéro de test et une photo envoyée à la main.
- Aucun template ni Flow Meta n'intervient sur ce chemin — rien d'autre à
  marquer ici. Les 12 scénarios du mandat ont tous été exécutés.

---

## Corpus

Neuf images créées pour ce run, vérité terrain connue par construction :

| Fichier | Origine | Vérité terrain |
|---|---|---|
| `plate_salmon_broccoli_rice.jpg` (+ `_angle2`) | Gemini image | fatty_fish + cruciferous_veg + refined_grain |
| `plate_berry_yogurt_bowl.jpg` | Gemini image | berries + dairy_yogurt + whole_grain |
| `plate_pizza_large.jpg` | Gemini image | refined_grain + dairy_cheese + red_meat, grosse portion |
| `not_food_desk.jpg`, `restaurant_menu.jpg` | Gemini image | aucun repas |
| `nutrition_label.jpg`, `delivery_app_screenshot.jpg` | rendu PIL local | chiffres kcal/macros **garantis lisibles** |
| `blurry_plate.jpg` | gaussienne r=14 sur l'assiette | portion non jugeable |

Rendus localement plutôt que générés pour l'étiquette et le screenshot : le test
de NON-INPUT #4 n'a de valeur que si les chiffres sont indiscutablement lisibles.
