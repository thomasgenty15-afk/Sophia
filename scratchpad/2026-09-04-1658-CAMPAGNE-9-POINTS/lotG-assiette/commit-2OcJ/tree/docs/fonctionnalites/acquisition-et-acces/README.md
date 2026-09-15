# acquisition-et-acces

Comment on entre. Pages de vente, inscription coach, inscription libre, `/join`,
essai, rôles et paywall — puis **le parcours qui mène du compte au premier
plan**.

`coach-signup-v1` · `send-welcome-email` · `trigger-retention-emails` ·
`LandingPage` · `GymsLandingPage` · `CommunitiesPage` · `StartPage` · `JoinPage` ·
`SetupPage` · `keel/api/onboarding.ts`

---

## La frontière de ce domaine

`/start` et `/auth` créent **le compte**. `/app/setup` transforme un compte en
quelqu'un dont on sait quoi cuisiner. Les deux ne se mélangent pas: l'entonnoir
commence **après** le compte, et il ne touche ni au paiement, ni au plafond de
sièges, ni à l'essai.

## Les fiches

| Fiche | Ce qu'elle tient | Statut |
|---|---|---|
| [FF-060](FF-060-le-parcours-d-entree.md) | Le parcours d'entrée — trois étapes qui finissent par un plan, la reprise dérivée des faits, et l'objectif qui ne se perd plus à la réclamation | 🟢 Livrée |

## Ce qui n'a pas encore de fiche

Le reste du domaine. On écrit une fiche **quand on retouche** une
fonctionnalité — écrire des fiches rétroactives produirait des documents que
personne n'a vérifiés.
