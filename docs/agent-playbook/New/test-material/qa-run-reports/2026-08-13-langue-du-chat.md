# Run QA — le chat répond-il dans la langue renseignée ?

## 1. Contexte Du Test

- **Date** : 2026-08-13
- **Run** : `langue-du-chat` · six tours (`L1` → `L6`)
- **Persona** : deux comptes **jetables**, `is_test_persona=true`, coach et plan
  publié. `profiles.locale` **relu en base** avant le premier tour :
  `9075f99b…` = `fr-FR` (Europe/Paris) · `93b05ef1…` = `en-GB` (Europe/London).
  Jetons jamais affichés.
- **Objectif** : vérifier que la langue de réponse suit la langue renseignée, y
  compris quand la personne écrit dans l'autre langue.
- **Cadre IA réel** : entrée produit `chat-inbound-v1`, lane modèle sur les six
  tours. Aucun renderer invoqué à la main.
- **Validité QA** : **valide**. Aucune commande de reboot, aucune correction de
  code pendant le run, personas nettoyées en fin de run.

**La règle attendue**, lue dans le code avant de juger
(`_shared/keel/locale.ts:149`) — `resolveResponseLocale` prend le **premier non
vide** de :

```
userExplicit → persisted → studentProfile (profiles.locale) → tenantDefault → detectedRecent
```

`detectedRecent` est passé **`null`** par le routeur (`run.ts:3890`) : la langue
du message **ne doit jamais** décider. C'est le profil qui commande.

---

## 2. Tours De Conversation

### L1 — élève `fr-FR`, écrit en français · **`green`**

> **User** — salut, tu peux me donner une idée de dîner rapide ce soir ?
> **Sophia** — Oui : une omelette aux légumes avec salade, ou des pâtes complètes
> avec thon, tomates et un filet d'huile d'olive. Rapide, simple, et ça cale bien 🙂

### L2 — élève `en-GB`, écrit en anglais · **`green`**

> **User** — hey, any idea for a quick dinner tonight?
> **Sophia** — A quick dinner idea: eggs and a pile of vegetables, or a protein
> plus microwave rice and a bagged salad. Fast, filling, and doesn't need much thinking

### L3 — élève `fr-FR` qui écrit **en anglais** · **`green`**

> **User** — what should I have for lunch tomorrow?
> **Sophia** — Pour demain midi, vise simple et solide : poulet ou thon, légumes,
> et un féculent comme riz complet ou quinoa. […]

**Le profil gagne.** C'est le cas le plus important du run et il tient.

### L4 — élève `en-GB` qui écrit **en français** · **`green`**

> **User** — qu'est-ce que je pourrais manger demain midi ?
> **Sophia** — For tomorrow lunch, keep it simple: protein plus vegetables.
> Think chicken, tuna, eggs, tofu, or Greek yogurt […]

Symétrique. La langue du message ne déplace rien, dans les deux sens.

### L5 — demande **explicite** de bascule · **`yellow`**

**Famille :** `BF-STATUS-01` — projection d'état mal lue (l'état de langue du fil
ne reflète pas ce qui a été demandé)

> **User** — peux-tu me répondre en anglais à partir de maintenant s'il te plaît ?
> **Sophia** — Yes — I'll answer in English from now on.
>
> *(tour suivant)* **User** — et pour le petit-déjeuner ?
> **Sophia** — For breakfast, go simple and filling: Greek yogurt with fruit and
> oats […]

**Le comportement visible est bon.** Mais l'état en base ne l'est pas :

```
temp_memory.conversation_locale            = "fr-FR"     ⟵ INCHANGÉ
temp_memory.conversation_locale_explicit   = (absent)
temp_memory.__session_style_commitments    = ["repondre en anglais a partir de maintenant",
                                              "answer in English from now on"]
```

L'anglais tient donc par une **consigne de style de session**, pas par la langue
du fil. Les deux mécanismes divergent — et le tour suivant le rend visible.

### L6 — déclaration hors plan après la bascule · **`red`**

**Famille :** `BF-STATUS-03` — rendu incohérent d'un état (ici, deux langues dans
un même message)

> **User** — I ordered a pizza tonight, wasn't planned at all
> **Sophia** — Tonight's pizza is a deviation from the plan, and I've logged it
> for dinner.
> If you want, I can also help you fit the rest of the evening around it.
> **Si tu as une photo, envoie-la : même approximative, elle m'en dit plus qu'une
> description, et sinon aucun souci.**

**Deux langues dans une seule bulle.** La prose du modèle suit la consigne de
style (anglais) ; le fragment déterministe — l'invitation photo — suit
`responseLocale`, resté `fr-FR`. Le fait écrit porte `content_locale = fr-FR`.

---

## 3. Analyse De Fluidité Humaine

Sur le cœur de la question posée, c'est **solide** : quatre tours sur quatre,
dans les deux langues et dans les deux sens de « la personne écrit dans l'autre
langue », la réponse suit la langue renseignée. Un francophone qui tape une
phrase en anglais n'est pas basculé pour autant, et c'est le bon comportement —
c'est exactement ce que `detectedRecent: null` encode.

Ce qui casse, c'est la **demande explicite**. Elle a l'air d'être honorée, et
elle l'est à moitié : la voix bascule, l'infrastructure non. Le résultat est un
message bilingue, qui est plus déroutant qu'un refus franc.

## 4. Analyse Système — la cause, nommée

**`CONVERSATION_LOCALE_EXPLICIT_KEY` n'a AUCUN écrivain.**

- Déclarée : `_shared/keel/locale.ts:187`
- Lue : `readExplicitConversationLocale` (`:214`)
- Passée comme `userExplicit` — **l'entrée la plus prioritaire** de
  `resolveResponseLocale`
- **Écrite : nulle part.** `grep -rn` sur tout `supabase/functions`, hors tests,
  ne rend que la déclaration elle-même.

Le commentaire au-dessus du lecteur dit pourtant :

> *« An EXPLICIT request from the student to be answered in a given language.
> **This is the only input allowed to move a thread already anchored on a
> locale** — everything else would re-open the oscillation R3 forbids. »*

Le seul input autorisé à déplacer un fil ancré est donc **structurellement
toujours vide**. La bascule explicite ne peut pas fonctionner par ce chemin, et
ce qu'on observe à sa place est un effet de bord du système de style.

**Conséquence au-delà du chat** : tout ce qui lit la locale — fragments
déterministes, accusés, artefacts générés (`resolveArtifactLocale` lit
`profiles.locale`) — reste en français pour cette personne. La bascule ne
concerne que la prose du modèle, et seulement tant que la consigne de style
survit à la session. Quand elle tombe, le fil repart en français : l'oscillation
que R3 est censé interdire, atteinte par une autre porte.

## 5. Verdict Global

**La réponse à la question posée est OUI** : le chat répond bien dans la langue
renseignée, et il y résiste même quand la personne écrit dans l'autre langue —
quatre tours sur quatre.

**Mais la bascule explicite est cassée**, et son échec est visible : un message
peut sortir bilingue. La correction est en amont et se lit en une phrase —
écrire `CONVERSATION_LOCALE_EXPLICIT_KEY` quand une demande explicite de langue
est reconnue, plutôt que de laisser le système de style porter seul une décision
qui appartient à l'axe langue.
