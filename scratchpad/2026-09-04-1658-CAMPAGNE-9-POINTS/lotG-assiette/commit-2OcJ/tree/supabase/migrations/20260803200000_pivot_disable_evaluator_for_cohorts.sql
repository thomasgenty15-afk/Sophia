-- PIVOT NUTRITION — N5 : débrancher l'ÉVALUATEUR du chemin 1:N.
--
-- ── POURQUOI ─────────────────────────────────────────────────────────────
-- L'évaluateur KEEL répond à une question précise : « l'élève a-t-il suivi ce
-- que son coach lui a PRESCRIT ? » Il est juste, il est testé, et cette
-- question n'existe plus dans le modèle 1:N décidé le 2026-08-03 :
--
--     LE COACH RECOMMANDE · L'ÉLÈVE DÉCIDE · PERSONNE NE NOTE
--
-- Sans prescription individuelle (`plan_versions` / `plan_commitments`), les
-- trois crons d'évaluation tournent sur une population vide : ils coûtent des
-- invocations et ne produisent rien. Pire, le balayage de fin de journée
-- (`keel-sweep-day`) passe les évaluations `unknown` en `missed` — sur un
-- élève sans prescription, il fabriquerait des échecs à partir de rien.
--
-- ── DÉBRANCHER, PAS SUPPRIMER ────────────────────────────────────────────
-- Même doctrine que `20260727150000` et que les crons B2C : le code de
-- `evaluate-adherence-v1`, `provision-day-v1` et `keel_sweep_day_evaluations`
-- reste EN PLACE et correct. Un coach qui voudra vraiment prescrire à un élève
-- (mode 1:1) retrouve la chaîne complète en replanifiant ces trois jobs.
--
-- Ce qui part, c'est l'appel AUTOMATIQUE. Réversibilité : re-planifier depuis
-- `20260727175000` (provision), `20260728090000` (adhérence) et
-- `20260727210000` (balayage).
--
-- ── CE QUI RESTE ALLUMÉ, ET C'EST L'ESSENTIEL ────────────────────────────
--   keel-week-rollover-v1   — l'avance de semaine, utile aux deux modèles
--   keel-daily-pulse        — le tap du soir (la vivabilité)
--   keel-coach-synthesis    — la synthèse du lundi
--   keel-reengage           — la relance de décrochage
--   process-checkins, mémoire, purges, sièges — inchangés

do $$
declare
  job record;
  n int := 0;
begin
  for job in
    select jobid, jobname from cron.job
    where jobname in ('keel-provision-day', 'keel-sweep-day', 'keel-evaluate-adherence')
  loop
    perform cron.unschedule(job.jobid);
    n := n + 1;
    raise notice 'pivot N5: unscheduled %', job.jobname;
  end loop;
  raise notice 'pivot N5: % evaluator cron(s) unscheduled', n;
end $$;

-- Fail loud (R7): on assert que les 3 sont partis ET que les jobs du modèle
-- 1:N sont bien là. Un « 0 partout » passerait la première vérification pour
-- la pire des raisons.
do $$
declare gone int; alive int;
begin
  select count(*) into gone from cron.job
   where jobname in ('keel-provision-day','keel-sweep-day','keel-evaluate-adherence');
  if gone <> 0 then
    raise exception 'pivot N5: % cron(s) évaluateur encore planifié(s)', gone;
  end if;

  select count(*) into alive from cron.job
   where jobname in ('keel-daily-pulse','keel-coach-synthesis','keel-reengage',
                     'keel-week-rollover-v1','process-checkins');
  if alive <> 5 then
    raise exception 'pivot N5: le modèle 1:N a perdu des jobs (% / 5)', alive;
  end if;
  raise notice 'pivot N5: évaluateur débranché, les 5 jobs 1:N intacts';
end $$;
