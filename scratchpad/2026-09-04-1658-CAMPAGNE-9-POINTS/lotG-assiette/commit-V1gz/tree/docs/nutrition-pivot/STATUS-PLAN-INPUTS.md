# STATUS — PLAN-INPUTS

État au 2026-08-04. Chantier « la direction du plan, et le corps auquel il
s'adresse ». Prompt : `PROMPT-PLAN-INPUTS.md`. Journal : `PROGRESS-PLAN-INPUTS.md`.

> ⚠️ **Chantier INTERROMPU, pas terminé.** P1 et la moitié « générateur » du P3
> sont écrites et vertes. P2, P4, P5 et la moitié « affichage » du P3 ne sont pas
> commencées. Le §« Ce qui bloque » dit pourquoi.

---

## 1. LA DÉCISION « MINEUR », EN CLAIR

**Ce que le produit fait quand un élève a moins de 18 ans : il BLOQUE la
génération de plan et PRÉVIENT LE COACH.**

Concrètement :

- `generate-week-plan-v1` rend `409 minor_student` et n'écrit aucun plan ;
- une ligne `contract_change_requests(reason_code='minor_student',
  urgency='immediate', raised_by='system')` part vers le coach, idempotente par
  ligne ouverte — l'élève peut réessayer dix fois, le coach reçoit une alerte ;
- l'élève lit : « Plan generation is held for students under 18. Your coach has
  been told. »

**Pourquoi.** Un accompagnement nutritionnel de mineur relève du cadre
professionnel du coach — et, selon les pays, d'une autorisation parentale et
d'un cadre de santé. Pas du nôtre.

**Pourquoi bloquer la GÉNÉRATION et pas l'INSCRIPTION.** Expulser l'élève le
renverrait sans rien et détruirait au passage le lien coach-élève, qui est
précisément l'endroit où la décision doit se prendre. Le coach tranche en
connaissance de cause.

**L'ALTERNATIVE, pour qu'elle soit rejouable si on change d'avis :** restreindre
`fat_loss` aux mineurs et laisser passer le reste. Écartée parce qu'elle
prétend que le problème est l'objectif alors qu'il est le cadre — un plan
`performance` généré pour un enfant de 12 ans pose exactement le même problème
de responsabilité, sans même déclencher l'alerte qui l'aurait fait voir.

**La condition de désarmement, et elle est testée.** La ceinture ne mord que sur
un mineur AVÉRÉ. Une date de naissance **absente** — le cas de 100 % des élèves
existants, à qui personne ne l'a jamais demandée — ne bloque rien. Une date
illisible, future ou aberrante non plus : elle vaut « on ne sait pas », et elle
est refusée à l'écriture plutôt que interprétée à la lecture.

---

## 2. CE QUI EST FAIT ET VERT

| Livrable | État | Preuve |
|---|---|---|
| `student_age.ts` — verdicts nommés, ceinture mineur, bandes d'âge | ✅ | 16 tests |
| `student_body.ts` — tendances, ce que chaque entrée altère | ✅ | 21 tests |
| `student_body_io.ts` — lecture profil + mesures, escalade coach | ✅ | typecheck ; pas encore de test d'intégration |
| Générateur : âge + mesures réellement lus et branchés | ✅ | `generate-week-plan-v1/index.ts` |
| Plafond de lignes calculé UNE fois (défaut trouvé en route) | ✅ | voir §4 |
| Migration : `minor_student`, RLS coach, âge dérivé | ✅ | appliquée en local |

```
deno test --allow-all supabase/functions/_shared/   (hors 2 fichiers d'une
                                                     autre session, cf. §5)
ok | 1354 passed | 0 failed | 17 ignored (19s)
```

## 3. CE QUI N'EST PAS FAIT

- **P2** en-tête permanent de la direction sur `/app/plan` et `/app/meals`.
  La section « Your goal » de `StudentWeekPlanPage` est donc toujours en place,
  et `practical_constraints` toujours jamais rempli.
- **P3, moitié affichage** : la carte des mesures datées côté élève, et son
  retrait quand la garde restrictive est armée.
- **P4** le premier passage.
- **P5** la lecture coach (le socle SQL est posé — RLS et `age_years` — mais
  aucune UI ne les lit).
- **Le gantelet** : épreuve de réel au navigateur, contre-factuel sur deux
  semaines réellement générées, relectures à froid.

## 4. CE QUE LE CHANTIER A TROUVÉ EN PASSANT

**Le prompt se trompait sur deux prémisses**, vérifié contre la base locale :

1. **`profiles.birth_date` existe déjà** (depuis le squash de mai), et le
   lifecycle RGPD la sert déjà — export *et* purge. Le P1 demandait une
   migration pour une colonne présente. Ce qui manquait n'était pas la colonne :
   c'est que personne ne la demandait jamais à un élève KEEL, et que rien ne
   décidait le cas du mineur. **Aucune colonne n'a été ajoutée.**
2. **Le point du dimanche n'est plus un Flow Meta.** Les en-têtes le disent
   encore, le code non : la garde `flow_not_configured` a été retirée au
   chantier de-whatsapp et le formulaire vit dans l'app. Vérifié exprès — si la
   collecte avait été morte, « les dernières mesures » aurait été une carte vide
   par construction et tout le P3 aurait porté sur du vide.

**Un défaut trouvé en écrivant, qui n'était pas dans le périmètre.**
`generate-week-plan-v1` calculait `focusFor(goal).maxNutrition` **une seconde
fois** pour le validateur de sortie. Tant que le plafond ne dépendait que de
l'objectif, les deux calculs tombaient d'accord par chance. Dès que le corps
peut le baisser, ils divergent : le prompt demande 3 lignes, le parseur en
accepte 4 — la baisse devient une suggestion polie au modèle. Le plafond est
maintenant calculé une fois et **rendu** au parseur.

**Un élargissement refusé.** Le P5 demande « l'âge » au coach.
`coach_student_directory` est une allowlist de colonnes qui exclut *exprès* la
date de naissance. La vue expose donc `age_years` **dérivé**, jamais la date :
une date de naissance est une donnée d'identité, un âge est ce dont le coach a
besoin.

## 5. CE QUI BLOQUE

**Une autre session travaille dans le même répertoire de travail, en même
temps.** Constaté pendant le chantier :

- des fichiers renommés et **stagés** dans l'index git partagé
  (`meal_photo_*` → `meal_precision_*`), avec des imports qui pointent encore
  sur les anciens noms — `sophia-brain/router/run.ts:227` entre autres ;
- un commit de cette session est **arrivé sur `main` pendant** le chantier
  (`6a784741`), déplaçant HEAD sous mes pieds ;
- conséquence directe : **le hook de pré-commit (`deno check`) échoue sur leur
  état intermédiaire**, donc aucun commit ne peut aboutir — y compris un commit
  qui ne toucherait que mes fichiers.

Mon travail est donc **stagé mais non commité**. Il est aussi exposé : un
`git commit -a` de l'autre session l'emporterait dans son commit.

Deux étapes du gantelet sont en plus incompatibles avec une session concurrente
tant qu'elle tourne : le `db reset` local et l'épreuve de réel au navigateur
(leur serveur de dev tourne déjà sur ce dossier).
