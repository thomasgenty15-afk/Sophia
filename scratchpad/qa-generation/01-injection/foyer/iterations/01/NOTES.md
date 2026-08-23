# Itération 01 — l'état trouvé, mesuré sur un prompt réel

**Run** `35463ae7-f3d9-4464-ad3d-fcf876c4714c` · lane `generate-household-meal-v1`
· modèle **`gpt-5.4-mini`** · 2026-08-18 21:25:44 UTC
· système 16 131 car. / utilisateur 15 563 car., `*_truncated = false`,
`written_chars == chars == compteur indépendant de gemini.ts` (vérifié à la main).

**Sortie : aucune.** L'appel n'a jamais abouti (voir « le poste », plus bas). Le prompt,
lui, est intégralement relisible — c'est exactement le cas que l'instrument 0A existe
pour couvrir. Cette itération est donc une **mesure d'injection valide et une non-mesure
de sortie**.

## Le foyer monté, entièrement par les écrans

| | Sacha (maître, compte) | Livia (bouche nue) | Tino (bouche nue) |
|---|---|---|---|
| naissance | 1986-04-12 (adulte) | 1994-09-23 (adulte) | **2016-03-05 (mineur, 10 ans)** |
| corps | 178 cm · 88 kg · male · sedentary | 165 cm · 54 kg · female · trains_hard | 138 cm · 33 kg · male · on_feet |
| direction | `fat_loss` | `muscle_gain` | aucune |
| poids visé / rythme | 80 kg · 0,30 kg/sem | — | — |
| allergie | **arachide** | — | — |
| dégoût | — | **champignons** | — |
| régime | « je mange de tout » | **pescatarian** | — |
| habitude | petit-déj : `black coffee and two boiled eggs` | goûter : `a bowl of skyr with walnuts` | — |
| note libre | `eats standing up on Tuesdays` | `will not touch coriander, ever` | `only eats vegetables when they are not touching each other` |
| apport fixe | `the evening tub` 32 g / 24 g prot. / 128 kcal | — (impossible, R-8) | — (impossible, R-8) |
| déjeuner au bureau | non | **gamelle, sans micro-ondes** | (non posé : mineur) |
| absence | — | — | samedi dîner |

Foyer : four + plaques + congélateur (micro-ondes, friteuse, autocuiseur, blender
**décochés**) · lun/mer/sam · 60 min · budget 137 · mode **`one_session`** ·
envie « the house is craving something with aubergine on Saturday » ·
contexte « Livia is on a late shift on Wednesday and nobody is home before nine » ·
**« ce dont ils ont envie » : « we fancy roasted brussels sprouts and a lentil dahl this time »**.

## Ce que le prompt a réellement porté

Voir `CHECKLIST.md` pour les 46 lignes. Les quatre constats de cette itération :

1. **Le prénom du maître n'arrive pas.** « Sacha » tapé à `/app/setup` §2 ⇒ le prompt dit
   **`Student`** sur les trois blocs qui le nomment (liste d'ids, brief de portions,
   apport fixe). `grep -c Sacha` = **0**. Cause : `saveSelf` écrit `profiles.full_name`
   et jamais `household_members.first_name`, la seule colonne que le roster rend.
2. **R-1 confirmée.** `brussels sprouts` / `dahl` : **0 occurrence**. Le bloc
   `-- THIS TIME --` existe mais ne porte que le contexte ; la phrase
   `what they feel like eating THIS TIME:` n'est **jamais servie** au foyer.
3. **R-2, R-3, R-5 confirmées.** Poids visé (`80`) et rythme (`0.3`) absents ;
   `lunchbox` et le micro-ondes du bureau absents ; `day_properties` absent.
4. **Le corps d'une bouche SANS COMPTE n'entre pas dans le brief** — pas seulement
   celui du mineur. Livia (adulte, 165 cm / 54 kg / female saisis à l'écran) n'a
   **aucun crochet** sur sa ligne, exactement comme Tino. C'est documenté
   (`EDGE:1828-1838`, `HP:983-990`) et c'est le prix de l'indiscernabilité du mineur.

## Le poste — pourquoi cette itération n'a pas de sortie

Trois soumissions (`35463ae7`, `4d4a5deb`, `9ab1b0e4`) sont revenues **HTTP 502 Kong**,
toutes avec `attempt_start` seul en base. Ce n'est **ni** le produit, **ni** le timeout
Kong (patché à 600 s et revérifié dans le conteneur) :

```
docker ps --filter name=supabase_edge_runtime_Sophia_2
supabase_edge_runtime_Sophia_2   Up 1 second
supabase_edge_runtime_Sophia_2   Up 5 seconds
```

Le conteneur du runtime edge est **recréé toutes les deux à trois minutes** par le
`supabase functions serve --env-file supabase/.env` d'une session voisine, qui surveille
`supabase/functions/`. Une génération foyer en `one_session` (3 bouches, 2 divergents,
7 jours ⇒ « 56 extra dishes ») dure plus longtemps que la fenêtre entre deux recréations,
et meurt en vol. **Discriminant** : `attempt_start` sans aucun autre événement pour le
`request_id`, et 502 au navigateur.

Contournement retenu pour l'itération 02, sans rien changer au produit : demander
**`one_dish`** (le plafond retire le bloc `A DISH OF THEIR OWN` et ses 56 plats).
Le run a alors abouti en **52 s**.

⚠️ **La lane foyer n'a jamais changé de modèle.** Les cinq runs de ce lot sont partis
sur `gpt-5.4-mini` et sur lui seul — `keelGenerationModel()` n'est pas appelé par
`generate-household-meal-v1`. Aucune bascule observée, donc rien à consigner de ce côté.
