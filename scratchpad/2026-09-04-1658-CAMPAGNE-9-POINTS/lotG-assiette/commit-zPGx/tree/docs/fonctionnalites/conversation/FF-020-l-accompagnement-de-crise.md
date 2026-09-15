# FF-020 · L'accompagnement de crise

| | |
|---|---|
| **Identifiant** | `FF-020-l-accompagnement-de-crise` |
| **Statut** | 🟢 Livrée |
| **Date** | 2026-08-07 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) R1, R7 · BUILD_PLAN W3.3 |
| **Code** | `sophia-brain/skills/safety_crisis/` — `skill.ts` · `local_dispatcher.ts` · `reducer.ts` · `visible_agent.ts` · `_shared/keel/crisis_resources.ts` · migration `20260727170000_keel_crisis_resources.sql` |
| **Effort estimé** | livrée |

---

## 1. Le problème

Quelqu'un écrit quelque chose qui n'a plus rien à voir avec la nutrition. Ce
moment-là ne se rate pas, et il ne se rate **surtout pas en silence**.

Trois façons de le rater, et le produit les a toutes rencontrées : ne pas le
détecter ; le détecter et rendre un tour **vide** parce que le modèle a échoué ;
donner un numéro qui n'existe pas dans le pays de la personne.

**Ce que ça coûte.** Il n'y a pas de version dégradée acceptable. Un tour muet
au moment où quelqu'un demande de l'aide n'est pas une expérience détériorée,
c'est un abandon. Et un numéro de crise faux est pire qu'aucun numéro : il
consomme la seule tentative que la personne fera peut-être.

## 2. Job stories

> **Quand** je vais très mal et que je l'écris ici, **je veux** une réponse
> humaine et des ressources qui existent près de moi, **pour que** ça serve à
> quelque chose.

> **Quand** je vis en dehors des pays prévus, **je veux** quand même recevoir
> quelque chose, **pour que** je ne tombe pas dans un trou.

> **Quand** je dis que ce n'était pas ça, **je veux** pouvoir sortir, **pour
> que** je ne sois pas coincé dans un scénario que je n'ai pas choisi.

## 3. Périmètre

### Dans le périmètre

- La détection, le flow dédié, et son **état** de tour en tour.
- Les ressources **résolues par pays**, depuis un registre **compilé dans le
  code** et comparé à la migration qui l'ensemence.
- Un message visible **déterministe** en repli, qui garantit qu'un tour de
  sécurité n'est jamais vide.
- La sortie du flow quand la personne dit que ce n'était pas ça.

### Hors périmètre — engageant

- ❌ **Aucun diagnostic.** L'agent escalade et oriente ; il ne qualifie pas.
- ❌ **Aucun aller-retour base dans le chemin de repli.** Les trois appelants du
  registre sont les chemins **déterministes** de crise — ils existent
  précisément parce que quelque chose en amont a échoué (le LLM, le réseau, le
  runtime). Y mettre un `await` sur la base, ce serait **placer le mode de
  panne à l'intérieur du gestionnaire de panne**.
- ❌ **Jamais le numéro d'un pays voisin**, jamais une liste vide, jamais un
  silence. Pays inconnu → jeu international documenté (`ZZ`), avec un
  `console.warn` stable **et** un champ `fallbackUsed: true` sur le résultat.
- ❌ **Le chemin de crise ne throw pas sur un pays inconnu.** Une exception ici
  produirait exactement le tour silencieux que le message déterministe existe
  pour empêcher. « Bruyant » veut dire **journalisé + marqué + documenté**, pas
  « lève une exception ».

## 4. Le circuit

```
   message
      │
      ▼
   détection (déterministe, avant le modèle)
      │
      ▼
   ┌──────────────────────────────────────────────┐
   │ FLOW safety_crisis                           │
   │  local_dispatcher.ts  →  reducer.ts (pur)    │
   │  état conservé de tour en tour               │
   └──────────────────────────────────────────────┘
      │
      ├── ressources par pays ──► registre COMPILÉ
      │      pays connu    ─► le jeu du pays
      │      pays inconnu  ─► jeu 'ZZ' + warn + fallbackUsed:true
      │                        (jamais un pays voisin, jamais vide)
      │
      ▼
   visible_agent.ts
      │  le modèle a produit un texte ? ──► on le valide
      │  sinon / échec / vide          ──► MESSAGE DÉTERMINISTE
      ▼
   un tour de sécurité n'est JAMAIS vide
      │
      ▼
   la personne dit « ce n'était pas ça » ──► SORTIE du flow
```

## 5. Modèle de données

Le registre des ressources est **compilé dans le code**, et
`crisisResourceRegistryRows()` est comparé à la graine de la migration par
`crisis_resources_test.ts` : **une divergence casse la suite de tests, pas le
tour d'un élève.** `fetchCrisisResources()` est la variante asynchrone, pour les
surfaces qui peuvent se payer une I/O (écrans coach, couche de rendu) ; elle
dégrade sur le même registre, bruyamment.

L'état du flow vit dans le working state de la skill, tour après tour.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Le chemin de repli ne fait **aucune** I/O | sinon le mode de panne est dans le gestionnaire de panne |
| **R2** | Pays inconnu → jeu international, **jamais** vide, **jamais** un voisin | un numéro faux consomme la seule tentative que la personne fera peut-être |
| **R3** | Échouer **bruyamment**, sans throw | log + `fallbackUsed: true` + documentation. Un throw ici produit le tour muet |
| **R4** | Un `kind` inconnu **throw** | c'est un jeton de code, pas une donnée utilisateur |
| **R5** | Un tour de sécurité n'est **jamais** vide | le message déterministe est le plancher absolu |
| **R6** | La sortie existe et fonctionne | ce dépôt a mesuré un faux positif qui piégeait quelqu'un **trois tours** ; une sortie collante est un défaut de sécurité, pas d'ergonomie |
| **R7** | Le registre compilé et la base **ne divergent pas** | un test, pas une convention |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le modèle tombe | message déterministe, avec les ressources |
| Le modèle rend un texte vide | idem — le vide est traité comme un échec |
| Pays absent du profil | jeu `ZZ`, warn, `fallbackUsed: true` |
| Pays inconnu du registre | idem. **Jamais** un pays voisin |
| Faux positif | la personne peut sortir dès qu'elle le dit |
| Le registre a dérivé de la migration | la **suite de tests** casse, en amont de tout élève |

## 8. Critères d'acceptation

```gherkin
Étant donné un tour de crise et un modèle indisponible
Quand le tour se termine
Alors la réponse visible existe
Et elle contient des ressources

Étant donné un élève sans pays connu
Quand le flow résout les ressources
Alors il rend le jeu international
Et il journalise un avertissement stable
Et le résultat porte fallbackUsed: true

Étant donné un pays inconnu du registre
Quand le flow résout les ressources
Alors il ne rend JAMAIS le numéro d'un pays voisin

Étant donné un faux positif de détection
Quand la personne dit que ce n'était pas ça
Alors le flow rend la main

Étant donné le registre compilé et la graine de la migration
Quand la suite de tests s'exécute
Alors toute divergence la fait échouer

Étant donné un `kind` de ressource inconnu
Quand on le résout
Alors le code throw — c'est un jeton, pas une saisie
```

## 9. Rabbit holes

- **La sortie collante.** Mesurée, coûteuse, et contre-intuitive à corriger : on
  a envie de garder quelqu'un « au cas où ». C'est un défaut de sécurité.
- **Optimiser le repli.** Toute idée qui rend le chemin de repli plus riche le
  rend plus fragile. Il doit rester bête.
- **Traduire les jetons.** `CRISIS_RESOURCE_KINDS` sont des jetons ASCII ; les
  traduire casse la résolution.

## 10. Ce qu'on mesure

- Tours de crise **vides** : **zéro**
- Part des résolutions en repli `ZZ` — un pic signale une population dont le
  pays n'est pas renseigné
- Sorties de flow demandées et obtenues au **premier** tour

**Contre-mesure.** Le taux de faux positifs. Un flow qui se déclenche trop
souvent apprend aux gens à ne plus écrire ce qu'ils ressentent — l'inverse exact
de ce qu'il protège.

## 11. Questions ouvertes

- Le pays vient de `profiles.country`, **et de rien d'autre** (T-20, 2026-08-12).
  Le repli sur la locale a été retiré : `profiles.locale` est
  `not null default 'fr-FR'`, donc il servait la France à 204 des 208 lignes
  locales sans `country` — §7 dit « jeu `ZZ` », et c'est §7 qui a raison.
  **La question ouverte est déplacée, pas fermée** : personne ne CAPTE
  `profiles.country` à l'inscription élève (`handle_new_user()` ne l'insère
  jamais). Tant que c'est le cas, une part croissante de la flotte lit une
  réponse de crise dégradée — la part est mesurable par
  `keel.crisis_resources.fallback_used` (§10).
