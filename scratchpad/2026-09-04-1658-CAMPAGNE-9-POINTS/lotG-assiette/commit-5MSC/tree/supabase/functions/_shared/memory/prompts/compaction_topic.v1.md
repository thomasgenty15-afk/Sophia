---
prompt_version: memory.compaction.topic.v2_only
model_recommended: gemini-3-flash-preview
created_at: 2026-05-01
---

Tu produis le nouveau search_doc d'un topic Sophia.

Tu recois :
- le titre du topic ;
- la liste des memory items actifs lies au topic, dans l'ordre :
  - statements importants ;
  - facts ;
  - events recents ;
  - action observations.
  Chaque item porte : id, kind, content_text, observed_at, sensitivity_level, source_message_id.

Tu produis :
- search_doc : 200 a 600 mots, riche en mots-cles pour retrieval.
- supporting_item_ids : la liste des memory_item.id que tu cites ou resumes.

Regles dures :

1. Tu n'inventes RIEN. Si une info n'est pas dans les items fournis, tu ne l'inclus pas.
2. Tu ne transformes JAMAIS un statement en fact objectif.
   - "Le user dit se sentir nul" reste une parole, pas une realite.
3. Tu ne cites JAMAIS litteralement un statement marque sensitive ou safety.
   - Reformule avec tact, indique que c'est une parole du user dans un contexte difficile.
4. Tu distingues toujours :
   - ce qui est recent (< 14 jours) ;
   - ce qui est plus ancien.
5. Tu n'utilises AUCUN item dont le statut n'est pas "active".
   (Le caller t'envoie deja seulement les actifs, mais respecte cette regle si doute.)
6. Tu ne fais pas de diagnostic psychologique.
7. Tu utilises un francais clair, sobre, respectueux du user.
8. Tu produis une liste explicite de `claims`, chacun avec ses `supporting_item_ids`.
   Cela permet au systeme de valider qu'aucun claim n'est invente.
9. Le search_doc ne doit pas dramatiser ni minimiser.
10. Si un item est marque sensitive ou safety, ne pas le citer literalement
    dans le search_doc ; le reformuler avec tact.

Format sortie : JSON strict :

```json
{
  "search_doc": "...",
  "claims": [
    {
      "claim": "Le user travaille sur l'arret du cannabis.",
      "supporting_item_ids": ["mem_1"],
      "sensitivity_level": "normal"
    },
    {
      "claim": "La peur de perdre le lien social semble etre un enjeu.",
      "supporting_item_ids": ["mem_2", "mem_3"],
      "sensitivity_level": "sensitive"
    }
  ],
  "supporting_item_ids": ["mem_1", "mem_2", "mem_3"],
  "sensitivity_max": "normal|sensitive|safety",
  "warnings": []
}
```

Si tu ne peux pas produire un search_doc honnete avec les items fournis, mets warnings et search_doc vide.

Validation post-compaction (cote systeme) :

```text
Pour chaque claim :
  - supporting_item_ids non vide ;
  - tous les ids existent et ont status = 'active' ;
  - tous les ids appartiennent au user_id en cours.

Si le search_doc contient une affirmation factuelle qui n'apparait dans aucun claim ->
   considerer la compaction comme suspecte.

Strategie de detection naive (regex / segmentation phrase) :
  Si une phrase commence par "Le user X" ou "Le user a Y" et n'est pas
  couverte par un claim -> warning.

En cas d'echec :
  - ne PAS appliquer le nouveau search_doc ;
  - conserver l'ancien ;
  - log memory.compaction.failed_validation_count ;
  - alerte si le taux d'echec > 5% sur fenetre 7j.
```
