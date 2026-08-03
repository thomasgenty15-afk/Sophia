-- KEEL — acceptance fixture test (docs/keel/SCHEMA.md)
-- The schema is valid IFF every fixture line encodes with NO ad-hoc field.
-- Run against the local DB only.

begin;

-- Minimal scaffolding: a fake auth user + a published plan version.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','fixture@example.com','x', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into plan_versions (id, coach_id, student_id, version, status, title,
  timezone, anchor_week_start, duration_weeks, content_locale)
values ('22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        1, 'draft', 'Fixture plan', 'America/New_York', current_date, 12, 'en-US');

-- ===========================================================================
-- FIXTURE 1 — epigenetics / functional-nutrition protocol (10 lines)
-- ===========================================================================
insert into plan_commitments
(plan_version_id, user_id, coach_id, polarity, activity_class, anchor_kind, slot_key,
 window_start_local, window_end_local, measure, unit, target_op, target_min,
 substance_ref, food_group_ref, evidence_kind, evaluation_grain, slot_kind,
 scheduled_days, required_days_per_week, expected_occasions_per_day, priority,
 provenance, title, content_locale)
values
-- 1. Vitamin D3 5000 IU with breakfast (ABOVE the NIH UL -> provenance gate)
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','supplement','slot','breakfast',null,null,'dose','IU','>=',5000,
 'vitamin_d3',null,'self_report','occasion','nominal',
 '{mon,tue,wed,thu,fri,sat,sun}',7,1,'core','clinician_ordered','Vitamin D3 5000 IU','en-US'),
-- 2. Omega-3 2g EPA+DHA, ANY source -> micronutrient
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','free',null,null,null,'micronutrient','g','>=',2,
 'omega3_epa_dha',null,'self_report','day','nominal',
 '{mon,tue,wed,thu,fri,sat,sun}',7,1,'core','coach_educational','Omega-3 2 g EPA+DHA, any source','en-US'),
-- 3. Magnesium glycinate 400 mg before bed
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','supplement','slot','before_bed',null,null,'dose','mg','>=',400,
 'magnesium_glycinate',null,'self_report','occasion','nominal',
 '{mon,tue,wed,thu,fri,sat,sun}',7,1,'secondary','coach_educational','Magnesium glycinate 400 mg','en-US'),
-- 4. Cruciferous veg 2 servings/day (expected_occasions_per_day = 2)
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','slot','any_meal',null,null,'serving','serving','>=',2,
 null,'cruciferous_veg','photo','day','opportunistic',
 '{mon,tue,wed,thu,fri,sat,sun}',7,2,'core','coach_educational','Cruciferous veg 2 servings/day','en-US'),
-- 5. Fatty fish 3x/week -> grain=week, required_days_per_week=3
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','free',null,null,null,'serving','serving','>=',3,
 null,'fatty_fish','photo','week',null,
 null,3,1,'secondary','coach_educational','Fatty fish 3x per week','en-US'),
-- 6. Berries 1 serving/day
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','free',null,null,null,'serving','serving','>=',1,
 null,'berries','self_report','day','nominal',
 '{mon,tue,wed,thu,fri,sat,sun}',7,1,'optional','coach_educational','Berries 1 serving/day','en-US'),
-- 7. Protocol breakfast (composition opaque in content)
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','slot','breakfast',null,null,'presence','none','any',null,
 null,null,'photo','occasion','nominal',
 '{mon,tue,wed,thu,fri}',5,1,'secondary','coach_educational','Protocol breakfast (eggs+oats+berries)','en-US'),
-- 8. Iron bisglycinate 25 mg fasted
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','supplement','slot','on_waking',null,null,'dose','mg','>=',25,
 'iron_bisglycinate',null,'self_report','occasion','nominal',
 '{mon,tue,wed,thu,fri,sat,sun}',7,1,'core','clinician_ordered','Iron bisglycinate 25 mg fasted','en-US'),
-- 9. No alcohol on weekdays -> polarity=avoid, none_implicit
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'avoid','nutrition','free',null,null,null,'presence','none','==',0,
 'alcohol',null,'none_implicit','day','nominal',
 '{mon,tue,wed,thu,fri}',5,1,'secondary','coach_educational','No alcohol on weekdays','en-US'),
-- 10. 16:8 eating window kept -> window crossing midnight
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','window',null,'20:00','12:00','boolean','none','any',null,
 null,null,'self_report','day','nominal',
 '{mon,tue,wed,thu,fri,sat,sun}',7,1,'core','coach_educational','16:8 eating window kept','en-US');

-- ===========================================================================
-- FIXTURE 2 — biohacker protocol (non-nutrition grafts, same engine)
-- ===========================================================================
insert into plan_commitments
(plan_version_id, user_id, coach_id, polarity, activity_class, anchor_kind, slot_key,
 clock_local, window_start_local, window_end_local, measure, unit, target_op,
 target_min, target_max, evidence_kind, auto_source, counts_toward_adherence,
 evaluation_grain, slot_kind, scheduled_days, required_days_per_week, priority,
 title, content_locale)
values
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','exposure','slot','on_waking',null,null,null,'duration','min','>=',3,null,
 'self_report',null,true,'occasion','nominal','{mon,wed,fri}',3,'core','Cold exposure 3 min','en-US'),
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','exposure','window',null,null,'06:00','10:00','duration','min','>=',10,null,
 'self_report',null,true,'occasion','nominal','{mon,tue,wed,thu,fri,sat,sun}',7,'core','Morning light 10 min','en-US'),
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','sleep','clock',null,'23:00',null,null,'clock_time','hhmm','<=',null,2300,
 'device','oura',true,'day','nominal','{mon,tue,wed,thu,fri,sat,sun}',7,'core','In bed by 23:00','en-US'),
-- capture + device + counts_toward_adherence=false (the Whoop bug guard)
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'capture','sleep','free',null,null,null,null,'duration','h','between',7,9,
 'device','oura',false,'day','nominal','{mon,tue,wed,thu,fri,sat,sun}',7,'core','Sleep 7-9 h','en-US'),
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','movement','free',null,null,null,null,'count','session','>=',3,null,
 'self_report',null,true,'week',null,null,3,'secondary','Zone-2 cardio 3x/week','en-US'),
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'capture','measurement','free',null,null,null,null,'count','none','>=',1,null,
 'device','whoop',false,'day','nominal','{mon,tue,wed,thu,fri,sat,sun}',7,'secondary','Daily HRV reading','en-US');

-- ===========================================================================
-- FIXTURE 3 — prescriptive dietitian plan (coeliac): slot + window together
-- ===========================================================================
insert into plan_commitments
(plan_version_id, user_id, coach_id, polarity, activity_class, anchor_kind, slot_key,
 window_start_local, window_end_local, measure, unit, target_op, target_min, target_max,
 substance_ref, evidence_kind, evaluation_grain, slot_kind, scheduled_days,
 required_days_per_week, priority, autonomy, title, content_locale, content)
values
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','slot','breakfast','07:00','09:30','composition','none','any',null,null,
 null,'photo','occasion','nominal','{mon,wed,fri}',3,'core','swap_within_policy',
 'Breakfast: 60g oats + 150g yogurt + 100g berries','en-US',
 '{"prescribed":[{"food":"rolled oats","qty":60,"unit":"g"}],"swap_policy":{"mode":"class_equivalent","classes":["FRUIT"],"hard_deny":["gluten"]}}'),
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'avoid','nutrition','free',null,null,null,'presence','none','==',0,null,
 'gluten','none_implicit','day','nominal','{mon,tue,wed,thu,fri,sat,sun}',7,'core','strict',
 'Zero gluten (medical)','en-US','{"severity":"medical"}'),
('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'capture','measurement','free',null,null,null,'scale','point','between',0,10,
 null,'self_report','day','nominal','{mon,tue,wed,thu,fri,sat,sun}',7,'secondary','flexible',
 'Bloating 0-10 daily','en-US','{}');

-- Scoped to THIS test's plan version. An unscoped `count(*)` here counts every
-- commitment the local database happens to hold, so the moment anyone runs a
-- real end-to-end student against the same DB the acceptance test goes red for
-- a reason that has nothing to do with the schema. A reference test must fail
-- on the model, never on the neighbours.
select count(*) as fixture_rows_encoded
from plan_commitments
where plan_version_id = '22222222-2222-2222-2222-222222222222';

-- ===========================================================================
-- NEGATIVE TESTS — the CHECKs must REFUSE these (R7 / coherence)
-- ===========================================================================
\set ON_ERROR_STOP off
savepoint neg1;
\echo '--- NEG 1: dose without substance_ref (must fail R7) ---'
insert into plan_commitments (plan_version_id,user_id,coach_id,polarity,activity_class,
 anchor_kind,measure,unit,target_op,target_min,evidence_kind,evaluation_grain,title,content_locale)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','supplement','free','dose','mg','>=',400,'self_report','day','Dose with no substance','en-US');
rollback to savepoint neg1;

savepoint neg2;
\echo '--- NEG 2: unknown polarity token (must fail) ---'
insert into plan_commitments (plan_version_id,user_id,coach_id,polarity,activity_class,
 anchor_kind,measure,unit,target_op,evidence_kind,evaluation_grain,title,content_locale)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'faire','nutrition','free','presence','none','any','self_report','day','Bad polarity','en-US');
rollback to savepoint neg2;

savepoint neg3;
\echo '--- NEG 3: French day token in scheduled_days (must fail) ---'
insert into plan_commitments (plan_version_id,user_id,coach_id,polarity,activity_class,
 anchor_kind,measure,unit,target_op,evidence_kind,evaluation_grain,scheduled_days,title,content_locale)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','free','presence','none','any','self_report','day','{lundi,mardi}','French days','en-US');
rollback to savepoint neg3;

savepoint neg4;
\echo '--- NEG 4: unknown substance_ref (FK/CHECK must fail) ---'
insert into plan_commitments (plan_version_id,user_id,coach_id,polarity,activity_class,
 anchor_kind,measure,unit,target_op,target_min,substance_ref,evidence_kind,evaluation_grain,title,content_locale)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','supplement','free','dose','mg','>=',400,'unobtainium','self_report','day','Fake substance','en-US');
rollback to savepoint neg4;

savepoint neg5;
\echo '--- NEG 5: unknown food_group_ref (FK must fail) ---'
insert into plan_commitments (plan_version_id,user_id,coach_id,polarity,activity_class,
 anchor_kind,measure,unit,target_op,target_min,food_group_ref,evidence_kind,evaluation_grain,title,content_locale)
values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
 'do','nutrition','free','serving','serving','>=',2,'space_broccoli','self_report','day','Fake food group','en-US');
rollback to savepoint neg5;

rollback;
