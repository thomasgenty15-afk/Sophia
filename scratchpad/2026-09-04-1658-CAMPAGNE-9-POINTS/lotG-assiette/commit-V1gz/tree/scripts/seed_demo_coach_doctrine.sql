-- ============================================================================
-- DOCTRINE DE DÉMONSTRATION POUR UN COACH LOCAL
--
-- ⚠️  CE N'EST PAS LA MÉTHODE DU COACH. C'est un jeu d'essai écrit pour voir ce
--     que produit la génération de semaine, et `change_note` le dit en clair
--     dans la base pour que personne ne le prenne un jour pour du contenu
--     rédigé par le coach. Le coach l'écrase depuis /coach/doctrine.
--
-- LOCAL UNIQUEMENT. Ce fichier n'est pas une migration: il écrit des DONNÉES sur
-- un compte précis, pas du schéma. À rejouer après un `db reset`.
--
--   docker cp scripts/seed_demo_coach_doctrine.sql supabase_db_Sophia_2:/tmp/d.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/d.sql
--
-- Pour un autre coach, changez l'adresse dans le bloc `v_email` ci-dessous.
--
-- CE QUE LA DOCTRINE DOIT CONTENIR POUR QUE LA GÉNÉRATION MARCHE
--   `beliefs` NON VIDE, et chaque conviction porte une CLÉ: `generate-week-plan-v1`
--   refuse (`coach_has_no_doctrine`) sur une liste vide, et chaque ligne de plan
--   qu'il produit cite la clé de la conviction dont elle découle
--   (`source_belief_key`). C'est la traçabilité qui rend le plan attribuable au
--   coach plutôt qu'au modèle.
--
--   `forbidden` porte des `surfaceForms` ET un `instead`. Sans surface forms, le
--   verrou de sortie ne matche rien dans de la prose réelle; sans `instead`, il
--   dégrade en refus neutre au lieu de répondre à la place du coach.
-- ============================================================================

do $$
declare
  v_email text := 'thomasgenty30@gmail.com';   -- ← le coach à équiper
  v_coach uuid;
  v_version integer;
begin
  select c.id into v_coach
    from public.coaches c
    join auth.users u on u.id = c.user_id
   where lower(u.email) = lower(v_email);

  if v_coach is null then
    raise exception 'aucun coach pour %', v_email;
  end if;

  -- Une seule doctrine publiée par coach (index unique partiel): on retire la
  -- précédente de la publication plutôt que d'échouer, et on garde l'historique.
  update public.coach_doctrines
     set published_at = null, updated_at = now()
   where coach_id = v_coach and published_at is not null;

  select coalesce(max(version), 0) + 1 into v_version
    from public.coach_doctrines where coach_id = v_coach;

  insert into public.coach_doctrines (
    coach_id, version, beliefs, forbidden, vocabulary, arbitrations,
    foods, qa, voice, content_locale, published_at, change_note
  )
  values (
    v_coach, v_version,
    jsonb_build_array(
      jsonb_build_object(
        'key', 'protein_anchors_every_meal',
        'claim', 'Every meal is built around a protein source first, then the rest.',
        'rationale', 'It is the decision that makes the other decisions easy: get it right and the meal is already most of the way there.'
      ),
      jsonb_build_object(
        'key', 'carbs_go_around_training',
        'claim', 'Put most of your carbohydrates in the meals before and after training.',
        'rationale', 'Same food, better timing. It is the cheapest performance change available to someone who trains.'
      ),
      jsonb_build_object(
        'key', 'real_food_before_supplements',
        'claim', 'Nothing in a tub earns a place until the plate is in order.',
        'rationale', 'Supplements are the last five percent, and chasing them first is how people spend money instead of changing habits.'
      ),
      jsonb_build_object(
        'key', 'consistency_beats_intensity',
        'claim', 'Eighty percent, every week, beats a perfect fortnight followed by nothing.',
        'rationale', 'Adherence is the variable that actually moves; the plan is designed to be repeatable rather than impressive.'
      ),
      jsonb_build_object(
        'key', 'sleep_is_a_nutrition_variable',
        'claim', 'If you slept badly, expect to be hungrier and plan for it instead of fighting it.',
        'rationale', 'Appetite after short sleep is physiology, not weakness, and treating it as a character flaw is how a bad night becomes a bad week.'
      ),
      jsonb_build_object(
        'key', 'change_one_thing_per_block',
        'claim', 'One change, held for two weeks, then we look.',
        'rationale', 'Several changes at once make the result unreadable — you learn nothing and keep nothing.'
      ),
      jsonb_build_object(
        'key', 'eat_before_you_are_starving',
        'claim', 'Plan the meal before you need it. Decisions made hungry are not decisions.',
        'rationale', 'Almost every meal people regret was chosen at the point where anything would have done.'
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'token', 'fasted_training_for_fat_loss',
        'surfaceForms', jsonb_build_array(
          'train fasted', 'fasted training', 'fasted cardio', 'skip breakfast before',
          'train on an empty stomach', 'workout fasted'
        ),
        'reason', 'It costs session quality for a benefit that does not show up, and it is the fastest way to lose training progress while chasing a number.',
        'instead', 'I don''t train people fasted. Put something with protein and some carbs in you before the session — even small. You''ll train better, and training better is what we''re actually paid for here.'
      ),
      jsonb_build_object(
        'token', 'cutting_carbs_before_hard_sessions',
        'surfaceForms', jsonb_build_array(
          'cut carbs', 'low carb before training', 'no carbs before', 'drop the carbs',
          'keto before a session'
        ),
        'reason', 'Removing fuel before the hardest work of the week is the one change that reliably makes the week worse.',
        'instead', 'Not before a hard session. If we''re going to move carbs at all, we take them out of the quiet parts of the day and leave the ones around training alone.'
      ),
      jsonb_build_object(
        'token', 'detox_or_cleanse',
        'surfaceForms', jsonb_build_array(
          'detox', 'cleanse', 'flush out toxins', 'reset your system', 'juice cleanse'
        ),
        'reason', 'It is a marketing category, not a physiological one, and it displaces the boring habits that work.',
        'instead', 'There''s nothing to detox. If you feel like you need a reset, what you probably need is three ordinary days in a row — regular meals, protein, sleep. That''s the reset.'
      )
    ),
    jsonb_build_array(
      jsonb_build_object('term', 'a session', 'meaning', 'a training session, not a meal'),
      jsonb_build_object('term', 'the anchor', 'meaning', 'the protein source a meal is built around')
    ),
    jsonb_build_array(
      jsonb_build_object(
        'situation', 'The student travelled for work, ate badly for five days, and asks whether to do a very low calorie week to compensate.',
        'coachAnswer', 'No compensating. Five days off plan is five days, not a debt. Go back to normal meals today — the anchor at every meal, carbs around your sessions — and we look again in two weeks. Punishing the next week is how people end up doing this twice a year instead of continuously.',
        'source', 'interview'
      ),
      jsonb_build_object(
        'situation', 'The student wants to add three supplements they saw recommended online.',
        'coachAnswer', 'Not yet. Show me a fortnight where you hit your meals and your sessions, and then we''ll talk about whether anything in a tub is worth your money. Right now it would just be an expensive way to avoid the boring part.',
        'source', 'interview'
      )
    ),
    jsonb_build_object(
      'recommended', jsonb_build_array(
        jsonb_build_object('term', 'eggs', 'surfaceForms', jsonb_build_array('eggs', 'omelette', 'scrambled eggs'), 'reason', 'Cheap anchor that survives a rushed morning.'),
        jsonb_build_object('term', 'greek yogurt', 'surfaceForms', jsonb_build_array('greek yogurt', 'greek yoghurt', 'skyr'), 'reason', 'Protein with no cooking, which is what makes it get eaten.'),
        jsonb_build_object('term', 'oats', 'surfaceForms', jsonb_build_array('oats', 'porridge', 'oatmeal'), 'reason', 'Carbs that sit well before a session.'),
        jsonb_build_object('term', 'rice', 'surfaceForms', jsonb_build_array('rice', 'white rice', 'basmati'), 'reason', 'Easy to scale up around training days.'),
        jsonb_build_object('term', 'potatoes', 'surfaceForms', jsonb_build_array('potatoes', 'potato', 'sweet potato'), 'reason', 'Filling for the amount of energy they carry.'),
        jsonb_build_object('term', 'oily fish', 'surfaceForms', jsonb_build_array('salmon', 'mackerel', 'sardines'), 'reason', 'Anchor plus fats, twice a week is plenty.')
      ),
      'discouraged', jsonb_build_array(
        jsonb_build_object('term', 'energy drinks', 'surfaceForms', jsonb_build_array('energy drink', 'red bull', 'monster'), 'reason', 'Sold as performance, mostly sugar and a sleep problem later.'),
        jsonb_build_object('term', 'sugary soft drinks', 'surfaceForms', jsonb_build_array('soda', 'fizzy drinks', 'coke', 'soft drink'), 'reason', 'Energy that never registers as a meal, so it is added on top of one.')
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'question', 'Can I drink coffee?',
        'answer', 'Yes. Before a session it even helps. Just keep it away from the four hours before bed — sleep is part of the plan.',
        'source', 'interview'
      ),
      jsonb_build_object(
        'question', 'Do I need a cheat meal?',
        'answer', 'You need meals you actually like, often enough that nothing has to be a cheat. If a week has one meal that is purely for the pleasure of it, that is normal eating, not a breach.',
        'source', 'interview'
      ),
      jsonb_build_object(
        'question', 'How much protein?',
        'answer', 'Enough that every meal has a clear anchor. We''ll get precise once the habit is there — not before.',
        'source', 'coach_edit'
      )
    ),
    jsonb_build_object('length', 'short', 'emojis', 'none', 'language', 'English'),
    'en-US',
    now(),
    'JEU D''ESSAI (seed local, scripts/seed_demo_coach_doctrine.sql) — pas rédigé par le coach. À écraser depuis /coach/doctrine.'
  );

  raise notice 'doctrine v% publiée pour % (coach %)', v_version, v_email, v_coach;
end;
$$;
