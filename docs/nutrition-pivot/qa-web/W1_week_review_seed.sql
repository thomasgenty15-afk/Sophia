insert into protocol_events (user_id, occurred_at, local_date, source, food_group_ref, portion_band, content_locale, source_message_id)
values
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-20T12:00:00Z','2026-07-20','chat','lean_protein','moderate','en-GB','wrtest:1'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-20T12:01:00Z','2026-07-20','chat','leafy_greens','moderate','en-GB','wrtest:2'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-21T12:00:00Z','2026-07-21','chat','lean_protein','large','en-GB','wrtest:3'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-21T12:01:00Z','2026-07-21','chat','refined_grain','moderate','en-GB','wrtest:4'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-22T12:00:00Z','2026-07-22','chat','lean_protein','moderate','en-GB','wrtest:5'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-22T12:01:00Z','2026-07-22','chat','fried_food','large','en-GB','wrtest:6'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-23T12:00:00Z','2026-07-23','chat','lean_protein','small','en-GB','wrtest:7'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-23T12:01:00Z','2026-07-23','chat','refined_grain','moderate','en-GB','wrtest:8'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-24T12:00:00Z','2026-07-24','chat','lean_protein','moderate','en-GB','wrtest:9'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-24T12:01:00Z','2026-07-24','chat',null,'moderate','en-GB','wrtest:10')
on conflict do nothing;

insert into student_daily_checkins (user_id, local_date, overall, axis, source)
values
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-20','good',null,'chat'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-21','mixed','hunger','chat'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-22','hard','hunger','chat'),
 ('160d3206-9deb-484f-9b5e-6311fa681be4','2026-07-23','good',null,'chat')
on conflict (user_id, local_date) do nothing;
