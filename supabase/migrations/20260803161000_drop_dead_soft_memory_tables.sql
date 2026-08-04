-- QA agent 4 (2026-08-03) — DROP des deux magasins souples du pivot, jamais
-- câblés, et désormais superflus PAR PREUVE et non par opinion.
--
-- ---------------------------------------------------------------------------
-- CE QUI A ÉTÉ VÉRIFIÉ
--
-- 1. LES DEUX TABLES SONT MORTES DES DEUX CÔTÉS. Grep exhaustif du dépôt (tous
--    types de fichiers, hors node_modules et docs/): `student_facts` et
--    `recurring_meals` n'apparaissent QUE dans la migration qui les crée
--    (20260803031000) et dans son test SQL. Zéro TypeScript, zéro frontend,
--    zéro edge function. Aucun écrivain, aucun lecteur.
--
-- 2. LE MEMORIZER FAIT DÉJÀ CE TRAVAIL, ET IL LE FAIT BIEN. C'est le point qui
--    a changé la décision. `trigger-memorizer-daily` est programmé et ACTIF
--    (cron 0 0 * * *), n'est pas gaté sur `keel_role`, et le loader
--    `memory_v2` du tour ne l'est pas davantage. Lancé sur un élève KEEL réel
--    (18 messages), il a extrait sans aide:
--      - « L'utilisateur déteste le brocoli. »            (aversion)
--      - « déjeune à la cantine les jours de semaine. »    (contexte)
--      - « s'entraîne les mardis et jeudis soir. »         (contexte)
--    et il a même résolu correctement une RÉTRACTATION en conversation
--    (« la sœur de l'utilisateur est allergique aux arachides »), ce que
--    `student_facts` n'aurait pas su faire sans code supplémentaire.
--
-- 3. DONC LES CONSERVER FABRIQUERAIT LE DÉFAUT QUE LE PIVOT S'INTERDIT.
--    L'encadré en tête de 20260803031000 refuse « deux sources de vérité qui
--    peuvent diverger sur le même état ». Câbler `student_facts` créerait
--    exactement ça pour la couche souple, en face d'un memorizer qui tourne
--    déjà. La ligne de partage juste n'est pas dur/souple entre deux tables
--    neuves, c'est:
--        DUR   -> student_safety_constraints (synchrone, sans ranking)
--        SOUPLE-> memory_items (le memorizer, probabiliste, nocturne)
--    et c'est la ligne que `safety_constraints.ts` énonçait depuis le début.
--
-- `recurring_meals` tombe pour une raison distincte et suffisante: son unique
-- consommateur prévu (§3.4.4, « ton petit-déj habituel ? » consulté AVANT
-- l'analyse photo) dépend du job de consolidation nocturne ET du flow photo,
-- que STATUS-MORNING déclare volontairement débranché — « un état persisté que
-- rien ne lit est un second composant mort ». Lui écrire un écrivain
-- maintenant fabriquerait précisément ce que cette phrase refuse.
--
-- ---------------------------------------------------------------------------
-- RÉVERSIBILITÉ
-- Les deux tables sont VIDES en local et n'ont jamais eu d'écrivain: il n'y a
-- aucune donnée à perdre, dans aucun environnement. Les recréer coûte une
-- migration — la même, à l'envers — le jour où leur consommateur existe. C'est
-- exactement le sens dans lequel on veut que la dette penche.
-- ---------------------------------------------------------------------------

-- Garde-fou: si une ligne existe quelque part, on ne droppe pas en silence.
-- Un DROP qui emporte des données qu'on croyait absentes est irréversible;
-- l'échec bruyant, lui, se relit le lendemain matin (R7).
do $$
declare
  n_facts bigint := 0;
  n_meals bigint := 0;
begin
  if to_regclass('public.student_facts') is not null then
    execute 'select count(*) from public.student_facts' into n_facts;
  end if;
  if to_regclass('public.recurring_meals') is not null then
    execute 'select count(*) from public.recurring_meals' into n_meals;
  end if;
  if n_facts > 0 or n_meals > 0 then
    raise exception
      'DROP refusé: student_facts=% ligne(s), recurring_meals=% ligne(s). '
      'Ces tables étaient réputées sans écrivain — quelqu''un en a donc câblé '
      'un depuis. Relire la décision avant de supprimer.', n_facts, n_meals;
  end if;
end $$;

drop table if exists public.student_facts;
drop table if exists public.recurring_meals;
