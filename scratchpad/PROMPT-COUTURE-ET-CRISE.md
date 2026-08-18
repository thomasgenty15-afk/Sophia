# Prompt — Refermer la couture, et deux défauts de sécurité

> À donner à un agent. Le prompt complet = **LE SOCLE COMMUN** de
> `scratchpad/PROMPTS-REALIGNEMENT-CHAT.md` (l. 16-143, à coller en premier)
> **+ ce bloc**.

---

# BLOC · La couture « déterministe / parole », et deux défauts de crise

## ⚠️ D'ABORD : CE QUI EST DÉJÀ RÉPARÉ — n'y touche pas

Les rapports de nuit (`scratchpad/CHANTIER-CHAT-ETAT.md`) décrivent des défauts
dont **plusieurs ont été corrigés depuis**. Vérifié le 2026-08-12, code en main :

| Défaut annoncé | État réel | Preuve |
|---|---|---|
| **F1** — 7 gardes armées sur `weekly_reviews.risk_band` que rien n'écrit | ✅ **RÉSOLU** — les lecteurs ont été **retirés** (le bon geste : on ne remplit pas un coffre vide, on désarme les fausses gardes) | zéro lecteur exécutable ; migration `20260808200000_weekly_reviews_risk_band_orphaned.sql` avec ses trois preuves d'absence (code, `prosrc`, vues) |
| **T-19** — l'épingle de locale inverse les deux chemins de crise | ✅ **RÉSOLU** — `PILOT_FORCED_LOCALE` retiré, et le repli déterministe est **bilingue** | `locale.ts:19` (passé), `run.ts:3785`, `safety_crisis/visible_agent.ts:222-236` (`isFrenchLocale`, `french ? "ou" : "or"`) |
| **T-22** — le bloc foyer n'a aucun plafond | ✅ **RÉSOLU** — cardinalités **et** caractères par ligne | `household_turn_context.ts:157-197` : `HOUSEHOLD_MAX_DISHES/PREPARATIONS/PORTIONS/RESTRICTIONS/SHOPPING` + `HOUSEHOLD_MAX_*_CHARS` |
| **T-16** — un mineur obtient « 56,3 g de sucre » | 🟡 **RÉTRÉCI** — `minor_quantity` est une **vraie ceinture déterministe** bilingue dans le message du soir (`daily_recap.ts:697-718`). Le RED restant est **plus étroit** : seul le `target` est interdit, **un chiffre inventé passe encore** | l'amendement « §7 mineur non implémentable » est **FAUX**, ne l'applique pas |

**Ta première tâche est de re-vérifier ces quatre lignes toi-même**, en une
demi-heure, et de le dire au rapport. Si l'une est fausse, tout le reste de ce
prompt se relit à cette lumière.

---

## LE VRAI SUJET : une seule cause, cinq symptômes

Le chantier de nuit a nommé son propre motif structurel :

> **Le déterministe décide, la couche qui parle ne le sait pas et n'est pas
> contrainte.**

Cinq à six fiches ont buté dessus **indépendamment**. Ce ne sont pas cinq bugs :
c'est **une couture inachevée** entre la couche qui calcule et la couche qui
répond. Tant qu'elle n'est pas refermée, elle produira un nouveau symptôme à
chaque fonctionnalité ajoutée.

### Les symptômes mesurés, tous encore ouverts

**T-1 — la lane de réponse ne sait ni ce que le plancher a écrit, ni ce qu'il a
refusé.** _(FF-008 ; concerne FF-009, FF-017, FF-025, FF-026, FF-027.)_ Marqué
**BLOQUÉ** à l'époque parce que le correctif touchait `companion.ts`, tenu par
un autre chantier. **Ce blocage n'existe plus.** C'est la racine des trois
suivants.

**T-6 — le composeur écrit sa propre demande de photo, hors budget (~1/25).**
_(FF-025.)_ La lane gate correctement, puis la couche qui parle ajoute sa
sollicitation **sans passer par le compteur**. Le budget « une demande par
jour » (T4) est donc contournable par le haut.

**T-12 — le générateur écarte silencieusement une proposition acceptée (3/3).**
_(FF-028.)_ Un petit-déjeuner **accepté par tap**, directive écrite et relue,
est écarté par le générateur quand une préférence le contredit — **sans le
dire**. La boucle « on te propose → tu acceptes → ça arrive » se rompt à la
dernière marche, et c'est celle qui fait la confiance.

**T-16 résiduel — un chiffre inventé passe encore chez un mineur.** La ceinture
existe et mord sur le `target` ; elle ne mord pas sur un nombre que le modèle
fabrique.

### Ce qu'il faut construire — un mécanisme, pas quatre rustines

Le geste est le même partout : **ce que le déterministe a décidé doit atteindre
la couche qui parle, et une ceinture de sortie doit le faire respecter.**

Deux moitiés, et les deux sont nécessaires :

1. **Le canal.** Ce que les planchers ont **écrit** et ce qu'ils ont **refusé**
   (avec le motif) devient une donnée du tour, lisible par la lane de réponse.
   La matière existe déjà : `conversation_turn_traces.route_decision.blocked_paths`
   porte `"direct_effects.log_protocol_event"` **avec son motif**, sur la
   branche restriction **et** sur la branche safety (mesuré 3/3).
   **Ce qui manque n'est pas la trace, c'est un lecteur.**
2. **La ceinture.** Le texte sortant est vérifié contre ce canal : pas d'accusé
   d'un fait non écrit, pas de demande hors budget, pas de silence sur une
   proposition écartée, pas de chiffre inventé chez un mineur. Le patron est
   déjà dans le dépôt — `finalVisibleText` (`run.ts:1974-2091`) et les
   ceintures de `daily_recap.ts` (`findQualifyingVerdict`, `allowedNumbers`,
   `minor_quantity`).

⚠️ **Une règle de prompt n'est pas une ceinture.** C'est la leçon littérale de
T-16, et elle vaut pour les quatre symptômes : ce qui n'est pas vérifié sur le
texte sortant n'est pas garanti.

⚠️ **Ordre imposé** : construis le canal (1) **avant** la ceinture (2). Une
ceinture sans canal ne peut rien vérifier, et elle bloquerait tout — le dépôt a
déjà la cicatrice « une garde a besoin d'un cas qui passe ».

---

## LOT 2 — T-20 · Pays absent ⇒ numéros français

**34 élèves concernés.** Le jeu international `ZZ` fonctionne pour un pays
**inconnu ou sale** (16 entrées testées, zéro fuite de voisin ✅), mais un pays
**absent** retombe sur la France.

⚠️ Le symptôme mesuré **diffère** de la cicatrice
`student-country-null-crisis-misrouting` qui décrivait autre chose (`en-US`
codé en dur ⇒ `'US'`). **Relis la cicatrice avant de corriger**, et ne suppose
pas que c'est le même bug.

Le chemin à instruire : `crisisCountryForProfile` (`crisis_resources.ts:274-297`)
rend `{country: null, source: "none"}` quand il n'a rien — trouve **qui**
transforme ce `null` en numéros français au lieu du jeu `ZZ`, et corrige là.

C'est un défaut de **sécurité** : quelqu'un en crise, sans pays renseigné,
reçoit des numéros qu'il ne peut pas composer. Il passe avant le lot 1 si tu
manques de temps.

---

## CE QUE TU NE FAIS PAS

**T-7 n'est pas un bug, c'est un arbitrage produit.** Sous `safety_band`, la
sollicitation est avalée (corrigé, mesuré 6/6 ✅) mais **l'effet durable est
perdu** — la déclaration de repas n'est pas écrite. La trace existe
(`blocked_paths`), le lecteur manque.

Faut-il écrire le fait quand même, ou l'avaler avec la demande ? **Ce n'est pas
à toi de trancher.** Instruis-le : ce que chaque option coûte, ce qu'elle
implique pour la ceinture TCA, et une recommandation. **Ne l'implémente pas.**
Ton canal du lot 1 lui donnera son lecteur — c'est tout ce qu'on te demande.

**Les autres REDs consignés** (T-18 le flow photo qui écrase un flow texte, la
sortie de faux positif au tour suivant, `findahelpline` sur `ZZ`) : tu les
**listes** dans ton rapport avec ton avis sur leur gravité. Tu n'y touches pas.

---

## Tests en conditions réelles

- **easy** : un repas déclaré sous plancher levé → la réponse n'accuse **pas**
  réception d'un fait non écrit ; une proposition acceptée puis écartée par le
  générateur → la réponse **le dit**.
- **medium** : les quatre symptômes, chacun dans les deux langues ; un mineur
  avec un chiffre **inventé** (pas un `target`) → la ceinture mord.
- **hard** : 25 tours avec une déclaration vague à chaque fois → **zéro**
  demande de photo hors budget (T-6 se mesure à ~1/25, il faut du volume) ;
  pays absent + tour de crise → jeu `ZZ`, pas la France, FR et EN.
- **extra-hard** : plancher levé + repas déclaré + proposition en attente dans
  le même tour → la réponse est cohérente sur les trois ; le canal ne fuit pas
  d'information de sécurité vers un texte visible qui n'y a pas droit.

## Revue adversariale — angles imposés

- **La ceinture qui bloque tout.** Une garde sans cas qui passe ressemble à une
  garde qui marche. Prouve qu'un tour **nominal** traverse sans être touché.
- **Le canal qui fuit.** Ce qui dit « le plancher a refusé pour motif TCA » ne
  doit pas atteindre le texte visible. Vérifie ce que le canal expose, pas ce
  qu'il contient.
- **Le repli qui devient le cas nominal.** Compte les morsures sur 25 tours
  ordinaires : si la ceinture mord souvent, c'est le prompt qu'il faut
  corriger, pas la ceinture qu'il faut desserrer.
- **Les quatre symptômes qui ne partagent pas la même cause.** Si l'un résiste
  au mécanisme commun, dis-le — ce serait une seconde couture, et il vaut mieux
  la nommer que la rustiner.

## Ton rapport

`scratchpad/RAPPORT-COUTURE.md`, structure du socle. En plus :
- la **re-vérification des quatre lignes** de l'encadré d'ouverture ;
- le **mécanisme** que tu as construit, et pourquoi cette forme-là ;
- pour chacun des quatre symptômes : **résolu par le mécanisme / résolu à
  part / non résolu**, avec sa preuve ;
- **l'instruction de T-7** : options, coûts, recommandation — sans
  implémentation ;
- les REDs restants, avec ton avis sur leur gravité.

## Les interdits

Ne retouche pas F1, T-19, T-22 (résolus — sauf si ta vérification les infirme,
et alors dis-le avant d'agir). N'applique pas l'amendement « §7 mineur non
implémentable » : il est faux. Ne tranche pas T-7. Une règle de prompt ne
compte jamais comme une ceinture. **Si un interdit te semble bloquer une bonne
idée, consigne-la et n'y touche pas — l'humain tranche.**
