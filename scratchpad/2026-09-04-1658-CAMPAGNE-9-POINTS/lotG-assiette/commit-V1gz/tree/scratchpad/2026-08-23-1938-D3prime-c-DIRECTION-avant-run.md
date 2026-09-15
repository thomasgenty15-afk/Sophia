# `D3′` — la `mesure APRÈS` en base : ma DIRECTION, écrite AVANT le run

**Écrite le 2026-08-23 à 19:38:00 CEST (17:38:00 UTC), avant toute génération.**
Plan : `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `D3′-c` (commit `e4617976`).
Budget autorisé par le propriétaire : **UNE génération, une seule.**

---

## Ce que je prédis, terme par terme

| terme | seuil | ma prédiction | pourquoi |
|---|---|---|---|
| ① `user_message like '%TWO MOUTHS AT THIS TABLE%'` | **≥ 1** | **ATTEINT** | le câblage est **commité et vivant** : `householdUserMessage` (`generate-household-meal-v1/index.ts:4484-4491`) enveloppe le tronc dans `movePrecedenceToTail(…, "household")` avant `appendContentLanguageBlock`, et il est le SEUL composeur des deux appels de la lane. Le rejeu de `D3′-c` sur les 243 `user_message` réels rend 243/243. **Il ne manquait qu'un run.** |
| ② `user_message like '%VERY TOP%'` | **= 0** | **ATTEINT** | `movePrecedenceToTail` retire l'occurrence des DEUX lanes (`for (const known of PRECEDENCE_LANES)`) avant de recoller la foyer. Et `grep "VERY TOP"` sur `supabase/functions/**/*.ts` ne rend **aucune autre source de texte** : les seules occurrences hors commentaires/tests sont `SOLO_LINES[2]` de `precedence_tail.ts`. Rien d'autre du prompt foyer ne peut porter la chaîne. |
| ③ `precedenceTailVerdict` ⇒ `tail` · `exact=true` · `blocs_apres=0` | les trois | **ATTEINT** | `exact=true` parce que le prompt sera écrit par le texte d'AUJOURD'HUI, donc `lastIndexOf(block)` mordra en entier (le repli par en-tête, qui erre vers `buried`, ne servira pas). `blocs_apres=0` parce que le seul bloc collé après est celui de langue, que `precedenceTailVerdict` compte comme `trailingAllowed` (`CONTENT_LANGUAGE:`). |
| ④ la ligne `student_generated_meals` porte `…+household.v22_precedence_in_tail` | oui | **ATTEINT** | `HOUSEHOLD_PROMPT_VERSION = "v22_precedence_in_tail"` (`household_meal_generation.ts:628`), lu à l'écriture de `generated_from.prompt_version` (`index.ts:6477`). `intent: prepare_next` persiste `generated_from` (`draft` ne le fait pas, §⑨ n° 17). |

**Verdict que je prédis : ATTEINT, 4/4.**

## ⛔ Les trois façons dont je peux me tromper — écrites avant, pour ne pas les inventer après

1. **Le run n'aboutit pas** (timeout du modèle sur le prompt foyer — cicatrice mesurée,
   médiane 66 s, max 210 s, `PLAN_HTTP_TIMEOUT_MS` = 300 s). Alors **aucun** des quatre
   termes n'est mesurable, et ce n'est pas un seuil manqué : c'est une mesure absente.
   ⛔ Je ne relance pas pour autant — sauf si la cause est d'INFRASTRUCTURE (Kong, runtime
   éteint, JWT), auquel cas la réparation puis la relance ne comptent pas comme génération.
2. **Le run aboutit mais n'écrit pas de ligne** (`plan_overlaps_existing`, `goal_required`,
   `window_required`). Alors ① ② ③ sont mesurables (le prompt est archivé avant l'écriture)
   et ④ ne l'est pas ⇒ **seuil MANQUÉ**, et je l'écris tel quel.
3. **Un appelant de retry rallonge le message après la queue.** Je ne le crois pas — les
   sources `.composition_fill` et `.protein_anchor_retry` sont d'AUTRES consignes, ventilées
   par `source`, et la requête filtre `source = 'generate-household-meal-v1'` **sans point**.
   Mais si ③ rend `buried`, c'est là qu'il faudra regarder, pas dans `movePrecedenceToTail`.

## Ce qui m'inquiète le plus, et que le seuil ne couvre pas

⚠️ **Le terme ② est le plus faible des quatre.** Il vaut `0` aussi bien si le bloc solo a
été correctement retiré que si **aucun prompt n'a été archivé du tout**. Il ne discrimine
que **conjointement avec ①**. C'est la même famille de défaut que le §⑨ n° 116 (quatre
zéros concordants issus d'une même requête fausse) : ② seul ne prouve rien.

## La fixture, nommée avant le run

- **compte** : `fixture.v0c.master@keeltest.dev`, mot de passe connu (`1234567`), connexion
  vérifiée AVANT le run par `POST /auth/v1/token?grant_type=password` ⇒ `access_token`
  749 car., `uid = 53fb05ba-333a-4bf5-9e19-502103581ef7`. ⛔ **Aucun JWT forgé, aucune
  écriture dans `auth.sessions`.**
- **foyer** : `b1959752-92c8-4038-8c17-992a77d68d21`, **4 bouches aux besoins divergents** —
  Camille (titulaire, 1986), **Malo `vegan` / `fat_loss`**, **Anouk mineure (2011) /
  `muscle_gain`**, **Yanis `vegetarian` / `maintenance` / 2 jours d'absence**.
  ⇒ **deux régimes déclarés distincts** et **deux objectifs opposés** : le bloc d'arbitrage
  a réellement quelque chose à arbitrer.
