# LOT 8 · défauts produit révélés par les tests des familles ① et ②

Trois trouvailles. Aucune n'est corrigée ici — c'est le propriétaire du lot qui
tranche.

---

## D1 — La garde de rôle de `generate-meal-v1` est SOUS un fail-open
### ✅ RÉPARÉ par le propriétaire du lot le 2026-09-10 à 22h50

La lecture du siège vit maintenant dans son propre bloc `{ … }`, sans condition
d'entrée, et ne lit plus `householdId` : `household_members.user_id` est unique
par compte. `if (seatRes.error) throw seatRes.error;` ferme sur panne.
Le cas ⑤ de `lot8_autorisation_test.ts` a été réécrit pour éprouver la propriété
CORRIGÉE (`garde < 0 || siege - garde > 200`), et il est vert. Ce qui suit
décrit le défaut tel qu'il a été trouvé.


**Où :** `supabase/functions/generate-meal-v1/index.ts` — lecture du foyer aux
lignes 783-799, garde de rôle aux lignes 856-878.

```ts
let householdId: string | null = null;
let householdLookupFailed = false;
try {
  householdId = await resolveHouseholdIdFor(admin, userId);
} catch (error) {
  householdLookupFailed = true;          // ← fail-open, décidé pour la FACTURATION
  …
}
…
if (householdId && !householdLookupFailed) {   // ← la garde de RÔLE est dedans
  const seatRes = await admin.from("household_members").select("role")…
  if (seatRes.error) throw seatRes.error;
  if (seatRole !== null && seatRole !== "owner") { …403 not_owner… }
}
```

`resolveHouseholdIdFor` lève dès qu'une lecture PostgREST de `household_members`
échoue (`household_turn_context.ts:367`). Le `catch` pose `householdLookupFailed`
et laisse passer — arbitrage explicite, mais écrit pour le GEL À L'IMPAYÉ. La
garde de rôle, elle, a hérité de la même condition : **une erreur transitoire sur
`household_members` et un membre secondaire compose, avec un 200 et un plan
écrit.**

Le commentaire de la fonction affirme le contraire, en toutes lettres : « ET LA
PANNE REFUSE, à l'inverse du gel juste en dessous ». Le `throw` qu'il invoque
protège la SECONDE lecture (le siège) ; il ne protège pas la PREMIÈRE (le
foyer), qui commande le bloc entier.

**La lane foyer n'a pas ce trou** : `if (meRes.error) throw meRes.error;` puis
`resolveGenerationAdmission`, sans condition d'entrée.

**Épinglé par :** `lot8_autorisation_test.ts` § ⑤ (cas nommé « ⛔ DÉFAUT
ÉPINGLÉ »). Le cas est VERT aujourd'hui parce qu'il décrit l'état actuel ; il
rougit le jour de la réparation, et son message dit alors de le supprimer.

**Réparation possible (non appliquée) :** sortir la garde de rôle de la
condition, et lire le siège directement (`household_members` par `user_id`)
plutôt que via `householdId` — la lane foyer fait déjà exactement ça.

---

## D2 — Un plan de foyer composé AVANT l'arrivée d'un membre lui devient lisible

**Où :** politique `student_generated_meals_household_read`.

```
household_id = keel_household_of(auth.uid())
AND (plan_kind = 'household' OR le lecteur est `owner` de ce foyer)
```

Rien dans le prédicat ne compare la date du plan à celle du rattachement. Dès
qu'une personne rejoint un foyer, **tout l'historique `plan_kind = 'household'`
de ce foyer lui est ouvert**, y compris ce que le maître a composé quand il
vivait seul — ce que le moteur unique écrit désormais pour une personne seule.

Le lot 7 écrit : « Conserver la lecture des anciens plans personnels sans
recomposition forcée. **Ne pas les convertir en plans collectifs accessibles à
de futurs membres.** » Les plans `plan_kind = 'personal'` sont bien protégés
(mesuré) ; les plans `plan_kind = 'household'` d'une personne seule ne le sont
pas.

**Mesuré par :** `lot8_autorisation_test.sql` § ① — le cas
« ⚠️ Alice LIT le plan de FOYER composé avant son arrivée » est vert, et il est
marqué. Les trois cas voisins montrent que la barrière fonctionne partout
ailleurs : le maître ne lit pas l'historique d'Alice, Alice ne lit pas le plan
`personal` du maître, et la lecture se referme au départ.

**Arbitrage à trancher :** soit c'est voulu (le plan appartient au foyer), soit
il faut une borne — par exemple comparer `created_at` du plan à la date de
réclamation de la bouche.

---

## D3 — Le foyer personnel d'un compte supprimé survit à ce compte

**Où :** `keel_household_purge_user` (branche « detached ») +
`household_members_user_id_fkey ON DELETE SET NULL`.

Avant le lot 1, un compte seul n'avait PAS de foyer : le supprimer ne laissait
rien. Depuis le lot 1, tout compte en a un, et **rien ne l'emporte** : la purge
met `user_id = null` sur la ligne maître au lieu de la retirer, et la ligne
`households` reste. Un foyer `personal_auto` orphelin, avec une bouche « owner »
sans compte, subsiste indéfiniment.

Sur les 1 437 comptes que le rattrapage va provisionner, chaque suppression
future en laissera un.

**Ce que ce n'est PAS :** une fuite de lecture. Plus aucun compte n'est membre
du foyer, donc aucune politique RLS ne rend ces lignes à qui que ce soit.

**Épinglé par :** `lot8_identite_test.sql` § ⑤ (cas « ⚠️ RÉSIDU »). Vert
aujourd'hui ; rouge le jour où quelqu'un nettoie, et c'est alors le signal de le
supprimer.

---

## Deux remarques mineures, sans test dédié

- **`keel_household_join` calcule `v_left_kind` et ne s'en sert pas.** La
  variable distingue `supprime` de `vide_conserve` — l'information exacte qui
  manquerait à un incident (« pourquoi ce foyer vide existe-t-il ? ») — et elle
  ne part ni dans le JSON rendu, ni dans un journal.
- **`deja_rattaches` de `keel_backfill_personal_households` ne peut être non nul
  que sous concurrence.** La requête de page filtre déjà par `not exists`. Ce
  n'est pas un compteur mort — c'est sa seule raison d'être, et elle mérite
  d'être dite dans le commentaire.
