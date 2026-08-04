# JOURNAL — précision de repas (texte + photo)

> Append-only. Chaque entrée porte sa preuve ou dit qu'elle n'en a pas.

---

## 2026-08-04 — P0. Orientation, et un écart de branche à dire tout de suite

### La branche demandée n'est plus la branche de travail

Le prompt dit « branche `dewhatsapp` ». Vérifié :

```
dewhatsapp: 03d3551d579b6bc7bdbecc4a58011a328c8782e7
main:       9b4b34690fc57213057717fc29056bcd6f272269
git log main..dewhatsapp  →  vide
```

`dewhatsapp` est entièrement contenue dans `main` : le commit de tête de `main`
s'appelle littéralement « main reprend la lignee KEEL: le contenu de dewhatsapp
devient l'etat courant ». Travailler sur `dewhatsapp` produirait une branche en
retard d'un commit sur l'état courant, qu'il faudrait re-merger.

**Décision : le travail se fait sur `main`.** C'est la branche qui porte la
lignée que le prompt désigne. Noté ici parce qu'une consigne écrite qu'on
n'applique pas à la lettre doit être visible, pas silencieuse.

### Ce que la lecture du §2 a confirmé, et ce qu'elle a corrigé

Confirmé (rien à reconstruire) :

| Brique | Fichier | État |
|---|---|---|
| Signal « c'est un repas » | `dispatcher.v2.ts` → `direct_effects[]` | existe, écrit |
| Décomposition en composants | `log_protocol_event/intake.ts` | existe, dédupe par identité |
| `needs_clarify` | `log_protocol_event/router.ts` | existe, mais token-only |
| Question photo + filtre de mise | `meal_analysis.ts:996-1028` | existe, déterministe |
| Réponse photo câblée | `meal_photo_{flow,intent,amend,flow_state}.ts` + `keel_meal_photo_lane.ts` | existe |

Corrigé par la lecture (le prompt ne pouvait pas le savoir) — **le chemin de
rendu n'est pas celui qu'on croit** :

`mergeDirectEffectRuntimeIntoVisibleRuntime` (`operation_runtime_pipeline.ts:399`)
pose `content: visibleContent` : **la reply du renderer `log_protocol_event` est
JETÉE dès qu'un runtime visible existe**. C'est le composeur qui écrit au repas
déclaré. Conséquence directe sur la conception : une question rendue par le
renderer du tool ne sortirait pas de façon fiable, et une question laissée au
composeur peut demander une quantité — exactement la ligne rouge du §3.

Le dépôt a déjà le patron de la réponse : `stripKeelAckWithoutCommittedEffect` et
`ensureClarifyQuestionVisible` sont des **ceintures de rendu** appliquées dans
`finalVisibleText`, et `keel: KeelTurnContext` y est un paramètre **obligatoire**
précisément pour qu'aucun chemin de sortie ne puisse l'oublier (commentaire
`run.ts:2076-2085`). La question de précision voyagera donc sur `keelTurn` et
sera posée par une ceinture déterministe. Texte en gabarit fermé : le seul moyen
structurel de garantir qu'aucune question de quantité ne sort jamais.

### Snapshot

Commit snapshot posé avant toute modification de code.
