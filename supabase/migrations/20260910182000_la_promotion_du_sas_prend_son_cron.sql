-- ══════════════════════════════════════════════════════════════════════════
-- LA PROMOTION DU SAS PREND SON CRON (2026-09-10)
--
-- Prompt: docs/keel/PROMPT-AGENT-SAS-REFERENTIEL.md · lot 3
-- Amont:  20260910180000 · 20260910181000 (un aliment, un slug, deux surfaces)
--
-- ── ⛔ CE QUE CETTE MIGRATION RENVERSE, ET IL FAUT LE LIRE AVANT ─────────
-- Deux migrations ont refusé ce cron, par écrit et sur mesure:
--
--   20260824093000 « ON NE BRANCHE PAS CE CRON, ET C'EST LA DÉCISION DE CE
--     LOT. La promotion automatique ferait entrer dans le référentiel des
--     valeurs DEVINÉES PAR UN MODÈLE, définitivement, pour tout le monde. Le
--     seuil de trois apparitions compte la RÉPÉTITION du modèle, pas sa
--     justesse. »
--
--   20260909140000 « sur les 29 lignes que la promotion automatique déclarait
--     prêtes, 7 sont fausses. » — dont `fromage rape`, rangé en
--     `cruciferous_veg` à 28 kcal/100 g: une ligne qui passe la bande de son
--     groupe, le plafond absolu ET la cohérence d'Atwater. Elle est cohérente;
--     elle décrit un autre aliment.
--
-- ⚠️ CE CHIFFRE-LÀ N'A PAS ÉTÉ INVALIDÉ PAR CE LOT. Les formes de surface
-- réparent le COMPTAGE (trois formes d'un aliment font enfin trois vues), elles
-- ne rendent pas le modèle plus juste sur la valeur. Le taux d'erreur mesuré
-- s'appliquera au flux automatique tel quel: ~24 % des lignes que la promotion
-- déclarait prêtes étaient fausses à la dernière lecture humaine.
--
-- Le cron est branché parce qu'il est DEMANDÉ, et la trace de ce qu'il coûte
-- est ici pour que la prochaine session n'ait pas à le redécouvrir. Ce qui
-- l'atténue, et ce n'est pas rien:
--   · les quatre bandes mordent toujours (énergie + trois macros);
--   · `group_bounds` n'est toujours jamais promu;
--   · `rejected` retire définitivement une ligne des deux chemins;
--   · une ligne promue reste visible et corrigeable — `source = 'sas'` la
--     distingue d'une ligne CIQUAL, et la bande des groupes l'exclut du calcul
--     qui autorise les promotions suivantes (pas de boucle qui s'ouvre seule).
--
-- ⛔ CE QUI NE BOUGE PAS: LE CHEMIN CHAUD N'ÉCRIT TOUJOURS PAS
-- `food_composition_refs`. « Une génération qui écrit le référentiel qu'elle
-- vient de lire rend le résultat du plan suivant dépendant du tirage du
-- précédent. » Un cron hebdomadaire n'est pas un chemin chaud: il tourne hors
-- de toute génération, et le plan de mardi ne dépend pas de celui de lundi.
--
-- ── L'HEURE, ET POURQUOI CELLE-LÀ ────────────────────────────────────────
-- Relevé sur `cron.job` le 2026-09-10. Lundi 03:45 UTC: l'heure 3 porte :15
-- (deux jobs), :17, :20 (mensuel) et :40; :45 est libre. Hebdomadaire parce que
-- la file grossit de quelques termes par semaine — un job quotidien
-- relancerait la même boucle sur les mêmes lignes six fois pour rien, et
-- multiplierait par sept la fenêtre pendant laquelle une ligne fausse entre
-- sans qu'un humain ait relu la file.
--
-- ⚠️ IL N'APPELLE AUCUNE FONCTION EDGE. `promote_pending_food_compositions`
-- vit dans la base: pas de `pg_net`, pas de secret à résoudre, pas de 404
-- silencieux si le runtime n'a pas la fonction. `cron.job_run_details` dit donc
-- la vérité sur ce job, ce qui n'est pas le cas des jobs qui postent en HTTP.
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists "pg_cron" with schema "extensions";

-- Déprogrammé d'abord: `cron.schedule` sur un nom existant met à jour, mais un
-- `unschedule` explicite rend la migration rejouable sans dépendre de ça.
select cron.unschedule('keel-promote-pending-compositions')
where exists (
  select 1 from cron.job where jobname = 'keel-promote-pending-compositions'
);

select cron.schedule(
  'keel-promote-pending-compositions',
  '45 3 * * 1',
  -- ⛔ `(3, false)` — LE SEUIL EST CELUI DU MODULE ET DU SQL, ÉCRIT UNE
  -- TROISIÈME FOIS ICI PARCE QU'UN DÉFAUT DE PARAMÈTRE NE SE LIT PAS DANS
  -- `cron.job`. Une session qui relit ce job doit voir le nombre, pas un
  -- appel dont le seuil vit ailleurs.
  --
  -- ⛔ ET `p_terms` RESTE NUL. La liste nommée existe pour une lecture
  -- HUMAINE — elle lève la règle des trois. Un cron qui la passerait
  -- promouvrait sans seuil ET sans relecture.
  $$select public.promote_pending_food_compositions(3, false)$$
);

comment on function public.promote_pending_food_compositions(integer, boolean, text[]) is
  'Promeut les lignes du sas vues >= p_min_sightings fois ET dont les valeurs '
  'tiennent dans la bande mesuree de leur groupe. p_terms nomme une liste curee '
  'a la main: il leve la REPETITION, jamais les bandes. Ecrit dans '
  'food_composition_aliases UNIQUEMENT les formes de surface d''un aliment '
  'qu''elle vient elle-meme de creer. Hors chemin chaud. Lancee chaque lundi '
  'a 03:45 UTC par le job cron keel-promote-pending-compositions.';
