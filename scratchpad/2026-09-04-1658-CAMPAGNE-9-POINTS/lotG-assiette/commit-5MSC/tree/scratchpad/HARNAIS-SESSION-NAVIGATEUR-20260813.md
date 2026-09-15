# Harnais — piloter un écran AUTHENTIFIÉ dans le navigateur

> Écrit le 2026-08-13 parce que **Lot D et Lot E ont tous les deux buté dessus** et
> ont rendu « les états de données restent non vérifiés ». Ce n'était pas un mur :
> le dépôt possède déjà le geste, dans un test commité.

## Pourquoi ce n'est pas « saisir un mot de passe »

Le patron vit dans `frontend/e2e/eating-rhythm.e2e.spec.ts:22-72`, commité. Il
**ne tape rien dans un formulaire** : il ouvre une session par l'API Supabase
depuis Node, puis **injecte le jeton dans `localStorage`** avant le premier
rendu. Comptes de fixture locaux, mot de passe documenté `1234567`, base locale.

## Les trois comptes vérifiés le 2026-08-13

Foyer **« Bramble »** `80e9af4c-50f0-4f86-b55d-f6812e19aabc` — la population
exacte dont ce chantier a besoin : un maître, **deux secondaires réclamés**, une
bouche sans compte, et **deux directions de service divergentes** (`health` vs
`muscle_gain`), donc la garde de vacuité de `ReferenceMemberCard` y dit **oui**.

| Rôle | E-mail | uid | objectif |
|---|---|---|---|
| maître | `laneb-owner-17865234810164f22eb@test.dev` | `eb4e70de-b3ee-4cb4-ace8-4c15e653ec7e` | `health` |
| réclamée | `laneb-nina-17865234811746af8ca@test.dev` | `3ade4e7d-d50d-4522-ac20-9bdd4cdfb1ce` | `health` |
| réclamée | `laneb-zoe-17865234813005ac50a@test.dev` | `038cf80d-e859-402c-979d-9ac5a1e14e51` | `muscle_gain` |

Les trois répondent `OK` à `signInWithPassword` avec `1234567`, mesuré.

Pour le **cas qui REFUSE** la garde de vacuité (un seul adulte porteur), aucun
foyer connu ne le porte aujourd'hui — le dire, ou le construire, mais ne pas
prétendre l'avoir vu. Une garde qu'on n'a vue que dire oui n'est pas vérifiée.

## Quel compte voit une part, et sur quel plan — mesuré le 2026-08-14

Bramble porte **deux** plans de foyer vivants, et ils ne servent pas les mêmes
gens. `loadHouseholdMeal` filtre `.gte("ends_on", today)`.

| Plan | Fenêtre | `member_portions` |
|---|---|---|
| `ddfd02b4` | 2026-08-12 + 5 j (finit le 16) | **Paul, Zoe, Lea** — pas Nina |
| `38f60307` | 2026-08-19 + 5 j | **Nina seule** |

⚠️ **`38f60307` n'a qu'une part sur quatre bouches, et ce n'est PAS un défaut** :
sa trace `generated_from.household.presence` montre les trois autres marquées
**absentes sur toute la fenêtre** — un décor de la campagne QA de la présence
(lot L2). Les `away_days` ont été **remis à zéro depuis** (les quatre membres
sont à `0` aujourd'hui), donc la base ne montre plus la cause : elle ne vit que
dans la trace du plan. Ne pas le lire comme « les portions se perdent ».

➡️ **Pour voir « Ma part » rendue, se connecter en ZOE** : elle a une part sur le
plan courant. Nina ne verra rien tant que le plan du 19 n'est pas devenu le
courant. Le maître (Paul) ne doit **rien** voir — `selectMyShare` rend `null`
sur `isOwner`, et c'est la règle, pas une précaution.

## Le geste

```js
// depuis frontend/ (c'est là que vit @supabase/supabase-js)
import { createClient } from "@supabase/supabase-js";
const URL = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const c = createClient(URL, ANON, { auth: { persistSession: false } });
const { data } = await c.auth.signInWithPassword({ email, password: "1234567" });
const s = data.session;
// La clé est `sb-<hostname-avant-le-premier-point>-auth-token` → ici `sb-127-auth-token`
console.log(JSON.stringify({
  key: `sb-${new URL(URL).hostname.split(".")[0]}-auth-token`,
  value: JSON.stringify({
    access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: s.expires_at, expires_in: s.expires_in,
    token_type: "bearer", user: s.user,
  }),
}));
```

Puis, dans l'onglet du navigateur, **avant** de naviguer vers `/app/…` :
`localStorage.setItem(key, value)` et recharger.

## ⚠️ Deux pièges qui coûtent une session entière

1. **UN PORT PAR AGENT.** `.claude/launch.json` porte une douzaine d'entrées
   (`frontend`, `frontend-alt`…`frontend-a21`) **exprès** : le navigateur partage
   son profil, donc **deux agents sur la même origine partagent la session**. Le
   second écrase l'authentification du premier et les deux lisent des écrans qui
   ne sont pas les leurs. Prends une entrée que personne n'utilise.
2. **401 « Invalid JWT »** : le seul geste autorisé est
   `./scripts/check-local-jwt-alg.sh`, puis lire `docs/keel/JWT-HS256.md`. Ne
   jamais poser `verify_jwt = false`, ne jamais écrire dans
   `supabase/signing_keys.local.json` (**il doit rester `[]`**). Si la pile est
   plus vieille que le correctif : `supabase stop && supabase start`, puis se
   **déconnecter/reconnecter** — un rechargement ne renouvelle pas le jeton déjà
   en `localStorage`.
