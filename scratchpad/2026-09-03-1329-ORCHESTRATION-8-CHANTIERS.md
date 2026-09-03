# Journal d'orchestration — les huit chantiers du 3 septembre

**Ouvert** 2026-09-03 13:29 · **Orchestrateur** agent (ne code pas) · **Branche de départ** `ff-001-quotidien-du-coach`
**HEAD à l'ouverture** `5d630e4d` · **Master prompt** [2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md](2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md) ·
**Analyse** [2026-09-03-1237-ANALYSE-8-POINTS-ET-PLAN-8-AGENTS.md](2026-09-03-1237-ANALYSE-8-POINTS-ET-PLAN-8-AGENTS.md)

---

## §3 — Les décisions prises PAR DÉFAUT (recopiées du master prompt, aucune question posée)

| Décision | Défaut appliqué |
|---|---|
| D1.1 | la veille **dans** la fenêtre ; migration cap 8 / exclusion sur les jours mangés / RPC |
| D1.2, D1.3, D1.4, D1.6 | oui, 8 autorisé, fuseau du compositeur, garde symétrique à l'adoption |
| D1.5 | FF-005 passe 🔴, remplacée par P2 |
| D2.1, D2.6 | durable, fait de maison sur la ligne du maître |
| D2.2 | « Le moins possible — je réchauffe » · « Un juste milieu » · « J'aime cuisiner, envoie » |
| D2.3, D2.4, D2.5 | le style plafonne les sessions ; `weeklyCookingMinutes` réveillé et **dit** ; le retour de plan descend le style |
| D3.1, D3.2, D3.3 | l'option vide est la cible ; un mineur ne voit que « Manger normalement » ; `null` en base reste valide |
| D4.1 | `/app/meals` est la cible |
| D5.1 … D5.6 | dépliable renversé par écrit ; Modal unique avec accordéon ; étape 2 unifiée ; `about-you` rejoint le cadre préférences des comptes ; `/app/health` renommée « Sécurité » ; le corps d'un membre reste `not_owner`, dit à l'écran |
| D5.7, D5.8, D5.9 | lien + copier + `mailto:` (pas d'envoi) ; **aucun montant recopié**, l'écran lit `offer.extra` — le chiffre 1,99/2,00 reste à l'humain ; renvoyer = nouveau jeton |
| D6.1, D6.2, D6.3 | oui (lane CUISINE), oui (lane CUISINE), namespace `setup.work_lunch.*` gardé |
| D7.1 … D7.12 | `/app/progress` = « Suivi », `/app/health` = « Sécurité » ; effectué = ≥ 1 coche ; `shifts[]` tracé par P8 ; **deux chiffres mesurés, aucune convention de temps** ; total à base la plus faible + « estimé » ; les 6 occasions ; `declared_quantities` si la personne écrit des quantités ; `SLOT_DAY_WEIGHT` réutilisé, en-tête réécrit ; fonction edge neuve ; FF-031 §3 renversée par écrit ; courbe aussi en maintien ; `ProgressPage.tsx` supprimée |
| D8.1 … D8.7 | chat Sophia → membre ; « pas de nouvelles » se **lit** (base `assumed`), ne s'écrit pas ; contradiction structurelle, la ligne de la personne gagne ; aucun glissement depuis un membre ; le maître marque les bouches **sans compte** ; pas de lecture des questions courses/cuisson pour le membre ; `enable_confirmations` = geste humain, nommé au rapport final |

---

## Lot 0 — le poste

- **13:29** Ouverture. `git status --short | wc -l` = 371 (attendu ~369). Pile Docker debout depuis 12–22 h ;
  `functions serve --env-file supabase/.env` déjà en cours (pid 9201, depuis 15:20 la veille).
- **13:29** `./scripts/check-local-jwt-alg.sh` → ✅ HS256, une seule clé, `signing_keys.local.json` vide.
- **13:29** Registre des migrations (docker exec, `psql` absent du PATH) : disque == registre, zéro doublon.
  Cinq derniers : `20260902100000`, `20260902090000`, `20260901233000`, `20260901220000`, `20260901200000`.
- **13:29** Comptes QA existants : `qa1v.coach@`, `qa1v.foyer@`, `qa1v.solo@keeltest.dev` (1 356 users en base). Aucun `qa0903*`.
- Exclusions du commit (c) : `scratchpad/2026-08-23-EVAL-QUALITE/*.json` (26 sorties brutes de plans/corps/rosters) — le reste du dossier (scripts, RAPPORT.md, .log) entre.
