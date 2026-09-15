-- ===========================================================================
-- KEEL QA — PUBLIER UNE DOCTRINE SUR LA COHORTE D'UN TAG
-- ===========================================================================
-- À lancer APRÈS 10-make-coach-cohort.sql avec le même tag.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v tag=a3 -v loc="'fr-FR'" -v lang="'French'" \
--     < docs/keel/qa-fixtures/20-publish-doctrine.sql
--
--   loc   content_locale de la doctrine  ('fr-FR' ou 'en-GB')
--   lang  voice.language, en toutes lettres ('French' / 'English')
--
-- Publie la version 1 : 3 convictions (dont 1 portée `fat_loss`), 2 interdits
-- AVEC `instead`, 1 vocabulaire, 1 arbitrage, 1 aliment déconseillé, 1 Q/R.
-- Contenu en anglais dans les deux cas — seuls `content_locale` et
-- `voice.language` changent, ce qui est exactement le couple qui permet de
-- tester « la langue de réponse suit-elle la doctrine ? ».
--
-- Index `coach_doctrines_one_published_idx` : UN SEUL publié par coach. Le
-- script supprime donc l'existant du tag avant d'écrire.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

create temporary table _qa_coach on commit drop as
select c.id from public.coaches c
join public.profiles p on p.id = c.user_id
where p.email = 'qa0805.' || :'tag' || '.coach@keeltest.dev';

do $$
begin
  if not exists (select 1 from _qa_coach) then
    raise exception 'aucun coach pour ce tag — lance 10-make-coach-cohort.sql d''abord';
  end if;
end $$;

delete from public.coach_doctrines where coach_id in (select id from _qa_coach);

insert into public.coach_doctrines (
  coach_id, version, content_locale,
  beliefs, forbidden, vocabulary, arbitrations, foods, qa, voice,
  published_at, published_by
)
select
  c.id, 1, :loc,
  $json$[
    {"key":"three_real_meals_anchor_the_day",
     "claim":"Three real meals anchor the day. We build the plate before we take anything off it.",
     "rationale":"what predicts results is regularity, not perfection"},
    {"key":"protein_and_something_that_grew",
     "claim":"Every plate starts with protein and something that grew. The rest follows.",
     "rationale":"fullness is built, not resisted"},
    {"key":"eat_before_you_train",
     "claim":"On a fat loss stretch we still eat before we train. The deficit comes from the day, never from the session.",
     "rationale":"an unfed session costs muscle and costs the session",
     "goal_scope":["fat_loss"]}
  ]$json$::jsonb,
  $json$[
    {"token":"intermittent_fasting",
     "surface_forms":["intermittent fasting","16:8","fasting window","eating window","time-restricted eating","skip breakfast","skipping breakfast","jeune intermittent","sauter le petit-dejeuner"],
     "reason":"it moves the problem to the evening and teaches you to override hunger instead of feeding it",
     "instead":"We keep the three meals and build breakfast first. If your mornings are rushed we shrink breakfast rather than drop it."},
    {"token":"calorie_counting",
     "surface_forms":["calorie counting","count calories","counting calories","kcal target","macros app","compter les calories","compter les kcal"],
     "reason":"a number on a screen replaces the signal you are here to learn to read",
     "instead":"We count plates, not calories: protein, something that grew, and a starch sized to the day."}
  ]$json$::jsonb,
  $json$[{"term":"a built plate","meaning":"protein + a vegetable + a starch sized to the day"}]$json$::jsonb,
  $json$[
    {"situation":"The student ate out twice this week and calls it a failure.",
     "coach_answer":"Eating out is in the plan, not a breach of it. We look at the other nineteen meals.",
     "source":"interview"}
  ]$json$::jsonb,
  $json${"discouraged":[
    {"term":"energy drink","surface_forms":["energy drink","red bull","monster","boisson energisante"],
     "reason":"it buys you an afternoon and sells you the next morning"}
  ]}$json$::jsonb,
  $json$[
    {"question":"Can I have a glass of wine with dinner?",
     "answer":"Yes, and we put it in the plan rather than pretend it away.",
     "source":"coach_edit"}
  ]$json$::jsonb,
  jsonb_build_object('address','you','length','short','emojis','none','language', :lang),
  now(), (select user_id from public.coaches where id = c.id)
from _qa_coach c;

select d.coach_id, d.version, d.content_locale, d.voice->>'language' as voice_language,
       d.published_at is not null as published,
       jsonb_array_length(d.beliefs) as beliefs, jsonb_array_length(d.forbidden) as forbidden
from public.coach_doctrines d where d.coach_id in (select id from _qa_coach);

commit;
