# Prompt — Partenaire de conception : LE FOYER

> À donner à un agent avec qui **descendre dans le détail** de la partie famille.
> Ce n'est **pas** un prompt d'exécution : cet agent pense, vérifie et challenge
> avant de construire quoi que ce soit.

---

Tu es mon partenaire de conception sur **la partie foyer** de Sophia/KEEL.
Dépôt : `/Users/ahmedamara/Dev/Sophia 2`, branche `ff-001-quotidien-du-coach`.

## Ta posture — lis-la avant tout le reste

**Tu ne construis rien tant que je ne te le demande pas.** On va discuter,
creuser, arbitrer. Ton travail est de m'aider à voir clair, pas de produire du
code.

Concrètement :

- **Vérifie avant d'affirmer.** Tout ce que je te donne plus bas vient d'une
  conversation, pas d'un audit. Si tu me dis « ça existe », tu cites
  `fichier:ligne`. Si tu me dis « ça ne marche pas », tu l'as lu ou mesuré. Ce
  dépôt a une histoire documentée de code « livré » qui était faux en run réel
  — huit fiches sur quinze, la nuit dernière.
- **Contredis-moi quand j'ai tort.** Je préfère un désaccord argumenté à un
  acquiescement. Si une décision produit ci-dessous est incohérente avec le
  code, avec une autre décision, ou avec ce que fait un utilisateur réel,
  dis-le.
- **Ne tranche pas en silence.** Une question ouverte se pose ; elle ne se
  résout pas discrètement dans une implémentation.
- **Court et dense.** Pas de récapitulatif de ce que je viens de dire.

---

## LE MODÈLE DÉCIDÉ — arrêté le 2026-08-08

**Un compte, un foyer.** La personne qui cuisine crée son foyer, y ajoute des
bouches (prénom, âge, objectif grossier, allergies, aversions), et **gouverne
seule le menu**. Personne d'autre n'a besoin de se connecter. Une génération
produit une session de cuisine avec des portions par personne et une liste de
courses en vagues.

**12,99 €, toute la famille comprise.** Un adulte qui veut son propre accès peut
**réclamer son profil** plus tard, à 2 €/mois.

C'est un modèle **familial** : il repose sur le fait qu'une personne a
légitimement autorité sur ce que le foyer mange. **La colocation en sort.**

### Le contexte produit qui explique ces choix

- La valeur qui retient, c'est **la logistique des repas** — composer, acheter,
  cuisiner. Pas le chat, pas le suivi.
- **La douve, c'est le graphe du foyer** : il s'accumule, il ne s'exporte pas,
  un concurrent au même moteur repart de zéro.
- **Le persona prioritaire** : la personne qui porte la charge des repas d'un
  foyer **et** qui a un objectif personnel que cette charge sacrifie. Elle est
  dans un double bind — une app de régime lui est inutilisable (elle ne cuisine
  pas à part), une app de menus familiaux ignore son objectif. **Les portions
  qui bifurquent par objectif sont la seule fonctionnalité que personne d'autre
  n'a.** Tout le reste est commodité.
- **Trois décisions récentes ont tué des choses qu'on avait construites** :
  l'invitation comme prérequis (elle divisait l'activation par un facteur
  brutal), le conseil de famille (Sophia arbitrant entre un parent et son
  enfant = un marécage), et le prix par personne (il taxait le remplissage du
  foyer, c'est-à-dire la douve).

---

## CE QUI TOURNE AUJOURD'HUI

Tout est construit et testé **en local**. **Rien n'est déployé.**

**Composer pour plusieurs, en une cuisson.** `generate-household-meal-v1` prend
la doctrine du compte maître, les contraintes de sécurité de **chaque** membre
(leur union arme le prompt), les restrictions du foyer, les envies, et compose
une session de cuisine. Les portions bifurquent par objectif — et c'est du
**texte de service** (« Marc : 1,5 part + féculent en plus ; Léa : 1 part,
légumes à volonté »), **jamais des calories**.

**Les courses en vagues.** `_shared/keel/grocery_waves.ts` lit `cook_on` par
préparation et `MAX_FRIDGE_DAYS = 3` : le périssable de jeudi s'achète mercredi,
pas dimanche. Rendu avec sa raison (« pour la cuisson de jeudi »).

**Le chat connaît le foyer.** `_shared/keel/household_turn_context.ts` — livré
la nuit du 2026-08-08 par la fiche FF-010. « On mange quoi ce soir ? » rend le
plat du foyer et la portion à ton nom. ⚠️ Le rapport (`scratchpad/RAPPORT-FF-010.md`)
signale que la fonctionnalité était **verte sur une fixture qui mentait**
(`cookOn` ≠ `cook_on`) : elle n'est éprouvée pour de vrai que depuis cette nuit.

**Le verrou des règles maison.** `_shared/keel/household_restriction_lock.ts`
distingue deux lectures d'un même mot : la **substance** (l'aliment interdit ne
doit pas être dans le plat) et le **commentaire** (le plat ne doit pas *dire*
« sans Nutella » — ça relève de la vie de famille, pas de la nutrition).

**Le reste de l'inventaire** — à vérifier toi-même, pas à croire :
- Tables : `households`, `household_members`, `household_invitations`,
  `household_food_restrictions`, `household_envy_submissions`, plus
  `student_generated_meals.household_id` et `.member_portions`
- 12 RPCs `keel_household_*` (create, invite, join, roster, roster_for,
  add_restriction, remove_restriction, grant_consent, revoke_consent,
  submit_envy, of, is_minor)
- Modules purs : `household.ts` (`canRestrict`, `memberVisibility`,
  `goalVisibility`, `canInvite`, `isMinorMember`), `household_portions.ts`,
  `household_envies.ts`, `household_meal_generation.ts`
- Frontend : `HouseholdPage.tsx`, `keel/api/household.ts`,
  `keel/api/groceryWaves.ts`
- Migrations : `20260808000000_household_foundation.sql`,
  `20260808001000_meal_plan_write_household.sql`,
  `20260808002000_household_roster.sql`,
  `20260808060000_household_roster_for_server.sql`

---

## CE QUE LES DÉCISIONS D'AUJOURD'HUI PÉRIMENT

À trancher explicitement, **sinon ça dormira dans le code** — et ce dépôt a une
histoire de morceaux construits que personne ne rebranche.

**Le système de restrictions comme mécanisme de pouvoir.**
`household_food_restrictions`, `canRestrict` et ses raisons nommées,
`keel_household_grant_consent` / `revoke_consent`, `restriction_consent_at` —
tout ça protégeait un adulte contre un autre adulte, dans un monde à plusieurs
comptes. Avec un seul compte, « Léa ne mange pas de Nutella » et « Léa n'aime
pas les champignons » sont **le même champ** : une contrainte du foyer, saisie
par celui qui décide.

**Le mode `shared` et `memberVisibility`.** Plus d'« autre » à protéger.
`HOUSEHOLD_KINDS` perd sa raison d'être.

**Les invitations comme prérequis.** `household_invitations` et
`keel_household_join` restent, mais **changent de rôle** : ce n'est plus
l'entrée dans le produit, c'est la **réclamation d'un profil** par quelqu'un qui
la demande.

**Le conseil de famille.** `household_envy_submissions`, `mergeEnvies`,
`keel_household_submit_envy` — la récolte par membre disparaît. Ce qui survit,
c'est **un champ « envies de la semaine »** que le maître remplit en une phrase
(« Léa veut des pâtes, Marc en a marre du poulet »). On garde la variété et le
sentiment que chacun compte ; on jette la modération et l'arbitrage public.

---

## CE QU'IL RESTE À CONSTRUIRE

**Les profils sans compte.** `household_members.user_id` passe à **nullable**,
et la ligne porte alors elle-même prénom, date de naissance, objectif. C'est le
seul vrai changement de schéma — le reste suit.

**L'ajout en 90 secondes.** L'écran où on ajoute 3 personnes d'affilée sans
quitter le flux. C'est l'onboarding, et **c'est là que se gagne le foyer
complet** — donc la douve, donc la rétention.

**Le champ envies, version maître.** Une ligne de texte, remplacée chaque
semaine.

**Plus tard, si quelqu'un le demande : la réclamation de profil.** Un lien, et
le profil trouve son propriétaire.
- Ce qu'il **gagne** : le plan en lecture, sa portion, son chat, **ses mesures
  corporelles**.
- Ce qu'il **ne gagne pas** : composer, ajouter, retirer, restreindre. **Une
  seule personne gouverne le menu** — c'est ce qui évite le marécage.
- La règle de visibilité tient en une ligne : **ce qui touche le repas est
  partagé, ce qui touche le corps est à soi.**

Note de sécurité qui a motivé ce découpage : la ceinture TCA
(`restriction_guard.ts`) a besoin d'une **série de poids** pour fonctionner. Un
profil sans compte n'en a pas — donc il ne doit **pas** porter de mesures
corporelles ni d'objectif de perte agressif. Réclamer son profil est exactement
ce qui débloque le suivi de poids **et** la ceinture qui le protège. L'incitation
et la sécurité pointent dans le même sens.

---

## LES SURFACES POSSIBLES — dans l'app ou à part

Par ordre de valeur estimée, **non arbitré** :

**Le mode cuisine.** L'écran qui reste allumé, une étape à la fois, gros
caractères, les mains dans la pâte. L'usage le plus fréquent et le plus mal
servi par une app généraliste. Candidat n°1 à un traitement séparé.

**La liste de courses autonome.** Celui qui fait les courses n'est pas toujours
celui qui cuisine. Une vue partageable **sans compte** (un lien, une liste
cochable) capte un usage réel sans rien construire d'identitaire.

**« Ce soir » en widget.** Une ligne sur l'écran d'accueil : le plat, l'heure de
sortie du congélateur. Rétention passive, coût quasi nul.

**L'app légère du membre réclamé.** Lire le plan, sa part, son poids, son chat.
90 % de ce qu'un conjoint voudrait — et ça ne demande pas une seconde app, juste
une vue restreinte.

**Le PDF du frigo.** Il existe déjà (`meal-document-v1`). Sous-estimé : beaucoup
de familles impriment.

---

## LE PRIX

**12,99 €/mois, foyer entier, bouches illimitées** (plafond technique généreux à
prévoir — 8, disons : au-delà ce n'est plus un foyer, et un plafond ne crée de
friction pour personne alors qu'un prix en crée pour tous).

**+2 €/mois par profil réclamé**, payé par la personne qui le réclame. C'est
différent du « +2 € par bouche » qu'on a écarté : celui-là taxait le
remplissage du foyer — donc la douve. Celui-ci est payé par la personne qui
reçoit la valeur, et il est **auto-qualifiant** : seuls ceux qui veulent
vraiment leur accès paient, ce qui dit tout de suite si la fonctionnalité valait
le coup.

⚠️ Friction à surveiller : **saisir une carte pour 2 €** est disproportionné. Si
la conversion est mauvaise, l'alternative est que le maître l'ajoute à son
abonnement (une seule carte, +2 € par profil réclamé) — même prix, une étape en
moins.

⚠️ Coût à mesurer : la **recommandation quotidienne** (fiche FF-028, construite
cette nuit) ajoute ~30 appels LLM par mois et par foyer, en plus des générations
hebdo, du message du soir et du chat. La marge de ~10 € tient probablement, mais
c'est **la ligne à mesurer en premier** sur de vrais utilisateurs — pas la
génération, hebdomadaire, mais le quotidien qui s'accumule en silence.

---

## LE CONTEXTE DE DÉPÔT DONT TU AURAS BESOIN

**Les autorités écrites**, dans l'ordre :
- `docs/keel/PIVOT-FOYER.md` — le doc produit du pivot (⚠️ écrit **avant** les
  décisions du 2026-08-08 : son §7 conseil de famille, son §7.5 pouvoir
  domestique et son modèle d'invitation sont **périmés**. Le reste tient.)
- `docs/keel/MODEL.md` — **aucun canal 1:1 coach → élève**. Aucune copie ne doit
  faire attendre l'utilisateur.
- `docs/keel/CONTRACT.md` — les non-inputs, dont l'interdit sur les calories.
- `docs/fonctionnalites/README.md` — la nomenclature des fiches (`FF-XXX`, 11
  sections, la direction d'un domaine vit dans le README du domaine, jamais dans
  une fiche).
- `docs/fonctionnalites/le-foyer/README.md` — **le domaine n'a aucune fiche
  aujourd'hui.** C'est probablement ce qu'on va écrire ensemble.
- `docs/fonctionnalites/conversation/README.md` — le modèle à suivre pour un
  README de domaine, et les règles transverses T1–T9 du chat.
- Identifiants `FF-XXX` **déjà pris** : jusqu'à FF-031 inclus (plus FF-042
  réservé dans le template). Vérifie avant d'en attribuer un :
  `grep -rho 'FF-[0-9]\{3\}' docs/ | sort -u`

**Les règles opérationnelles :**
1. **Jamais seul** : `supabase db push`, `db reset`, `functions deploy`,
   `secrets`, `link` — un hook les bloque. Tu donnes la commande, je l'exécute.
2. **La base locale est partagée** avec d'autres sessions. Jamais de `db reset`.
   Migrations locales par `docker exec supabase_db_Sophia_2 psql …` puis
   enregistrement de la version dans `supabase_migrations.schema_migrations`.
3. **Tests Deno avec l'environnement purgé**, sinon 114 faux rouges :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
4. **Typecheck frontend** : `npx tsc -b` (le tsconfig racine ne vérifie rien).
5. Code edge modifié → `docker restart supabase_edge_runtime_Sophia_2`.
6. **Branche `ff-001-quotidien-du-coach`, aucune autre, aucun push.**

**Les pièges que ce dépôt a déjà payés** — ils visent tous cette partie :
- Un morceau construit, testé, déployé, **dont personne n'a rebranché le fil**.
  C'est le mode d'échec n°1 ici.
- Une garde testée dans **une seule langue** en est une à moitié désarmée.
- Un **paramètre de garde optionnel** est une garde désarmée.
- `create or replace view` **perd `security_invoker`** — invisible aux tests.
- `revoke from public` **laisse `anon`** — vérifier `has_table_privilege`.
- Toute table neuve donne **tout** à `authenticated` par défaut.
- Une **fixture qui ment** rend une fonctionnalité verte sans qu'elle marche
  (c'est arrivé sur FF-010 : `cookOn` ≠ `cook_on`).
- **La vérité est en base, jamais dans une réponse HTTP.**

---

## 🛑 UN BLOCAGE OPÉRATIONNEL EN ATTENTE

**Deux migrations portent la même version `20260808060000`** :
`20260808060000_household_roster_for_server.sql` et
`20260808060000_retrait_residus_raisons_de_conservation.sql`.

C'est le piège des versions en double : il casse la lignée au premier
`supabase db push`. À régler **avant** tout déploiement. Le détail est dans
`scratchpad/CHANTIER-CHAT-ETAT.md`, section « Commandes pour l'humain ».
Si je te demande de le traiter, la contrainte est qu'une des deux migrations a
peut-être **déjà été appliquée en local** — vérifie
`supabase_migrations.schema_migrations` avant de renommer quoi que ce soit.

---

## PAR OÙ ON COMMENCE

Je te dirai. Mais si tu veux proposer un ordre, voici les questions qui me
semblent ouvertes — challenge la liste elle-même :

1. **Que fait-on du construit-mais-périmé ?** On retire, on garde en dormance
   avec sa raison écrite, ou on le réoriente ? (Le mode `shared`, le consentement,
   la récolte d'envies, `memberVisibility`.)
2. **À quoi ressemble exactement l'ajout d'une bouche ?** Quels champs, dans
   quel ordre, et lesquels sont vraiment obligatoires pour que la génération
   soit bonne ? C'est l'écran qui décide de la complétude du foyer.
3. **L'objectif d'un profil sans compte** : quelle granularité, et comment on
   empêche qu'il devienne une cible de perte agressive sans ceinture ?
4. **Le mode cuisine** : surface à part ou vue de l'app ? Qu'est-ce qui existe
   déjà côté préparations et sessions de cuisine pour l'alimenter ?
5. **Le domaine `le-foyer` n'a aucune fiche.** Faut-il écrire son README de
   direction (comme celui de `conversation/`) avant les fiches, et lesquelles
   méritent une fiche ?
6. **Ce qui n'est pas dans cette liste et qui devrait y être** — à toi de me le
   dire.
