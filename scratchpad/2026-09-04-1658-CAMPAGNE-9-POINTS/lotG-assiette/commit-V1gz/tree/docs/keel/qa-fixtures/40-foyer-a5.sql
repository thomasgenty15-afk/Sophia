-- ===========================================================================
-- KEEL QA — LANE FOYER, chantier du 2026-09-03 (A6 + A5)   ·   tag `qa0903f`
-- ===========================================================================
-- Idempotent. Ne touche QUE les comptes `qa0903f.%@keeltest.dev`.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/keel/qa-fixtures/40-foyer-a5.sql
--
-- Ce que ce fichier fabrique — le foyer minimal qui permet de PROUVER A6 et A5:
--
--   MAÎTRE      qa0903f.master@keeltest.dev   « Claire »  (fr-FR / FR)
--               ligne `owner`, un corps, une ligne `student_goals` — sans elle,
--               l'équipement de cuisine et le rythme n'ont RIEN à écrire, et
--               l'écran le dit au lieu de laisser un bouton mort.
--
--   BOUCHE      « Léa », ADULTE, SANS COMPTE, INVITABLE.
--               C'est elle qui porte les trois états d'accès (A5 §5.5) et la
--               carte « Le déjeuner en semaine » (A6): la question se pose aux
--               MAJEURS du roster, compte ou pas.
--
--   BOUCHE      « Tom », MINEUR, sans compte.
--               ⛔ Le contre-exemple, et il compte autant que le reste: sa
--               fiche NE DOIT PAS porter la carte du déjeuner (`not_adult`),
--               et il reste INVITABLE (rien ne l'interdit en base, et facturer
--               l'accès d'un enfant est une décision commerciale non prise).
--
--   SECONDAIRE  qa0903f.member@keeltest.dev   « Nour »  (fr-FR / FR)
--               ligne `member` DÉJÀ RÉCLAMÉE (`user_id` posé). C'est le seul
--               compte qui prouve A5 point 6: sa ligne à lui s'édite, celles
--               des autres restent des pastilles.
--
--   INVITATION  une invitation VIVANTE sur « Léa », créée il y a 2 jours,
--               expirant dans 5. Elle fait passer sa ligne de « Inviter » à
--               « Invitation envoyée le … » + « Renvoyer ».
--               ⚠️ `token_hash` porte une empreinte BIDON: le lien n'est PAS
--               réclamable avec. C'est voulu — l'écran ne lit jamais cette
--               colonne (A5 §5.5), et on ne fabrique pas un jeton utilisable
--               dans un fichier qu'on relit.
--
-- Mot de passe des deux comptes : 1234567
--
-- ⚠️ L'ENVOI DE MAIL EST NEUTRALISÉ LE TEMPS DE LA TRANSACTION — même piège et
--    même remède que `00-base.sql`: le trigger de bienvenue poste vers le
--    `send-welcome-email` LOCAL, qui tourne avec EMAIL_DELIVERY_ENABLED=1 et
--    une vraie clé Resend. Créer un compte confirmé ENVERRAIT UN VRAI MAIL.
--    On ne peut pas DISABLE le trigger (`auth.users` appartient à
--    supabase_auth_admin): on emprunte la sortie que le trigger se donne
--    lui-même, `anon_key` vide ⇒ « skipping dispatch ».
--
-- ⚠️ TROIS COMPTES MAXIMUM PAR TAG ne s'applique pas ici (`trial_seat_limit`
--    est un plafond de COACH); ce foyer n'en a que deux, et c'est assez.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

create temporary table _qa0903f_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;

update public.app_config set value = '' where key = 'edge_functions_anon_key';

-- ---------------------------------------------------------------- nettoyage
-- La cascade emporte les lignes de foyer: `households.created_by` et
-- `household_members.user_id` pointent sur `auth.users`.
delete from public.households
where id = '09030000-0000-4000-8000-0000000000f1';
delete from auth.users where email like 'qa0903f.%@keeltest.dev';

-- ---------------------------------------------------------------- comptes auth
-- ⚠️ LES COLONNES DE JETON DOIVENT ÊTRE '' ET JAMAIS NULL. GoTrue les scanne
--    dans des `string` Go non-nullables: un NULL donne « converting NULL to
--    string is unsupported », remonté au client en HTTP 500 « Database error
--    querying schema ». Le compte existe, s'affiche en base, et ne peut PAS se
--    connecter.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.name),
  now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('09030000-0000-4000-8000-0000000000a1'::uuid, 'qa0903f.master@keeltest.dev', 'Claire'),
  ('09030000-0000-4000-8000-0000000000a2'::uuid, 'qa0903f.member@keeltest.dev', 'Nour')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like 'qa0903f.%@keeltest.dev';

-- ---------------------------------------------------------------- profils
-- ⛔ PAS DE `is_test_persona`, ET CE N'EST PAS UN OUBLI. La consigne du
--    chantier la demande; la colonne N'EXISTE PAS dans ce schéma — vérifié le
--    2026-09-03 sur `information_schema.columns` (aucune table du schéma
--    `public` ne la porte), et aucune migration ni fixture du dépôt ne la
--    nomme. L'écrire ferait échouer tout le fichier sur une seule ligne. Ce
--    qui marque un compte de test ici est son ADRESSE (`%@keeltest.dev`), et
--    c'est ce que le nettoyage du haut utilise.
-- ⚠️ `locale` ET `country` SONT ÉCRITS EXPLICITEMENT. `profiles.locale` vaut
--    `fr-FR` par défaut, mais une fixture qui ne l'écrit PAS laisse croire à un
--    défaut de langue quand l'écran sort en français. Et `country` NULL fait
--    router la crise vers la mauvaise hotline (jeu `ZZ`).
update public.profiles set
  keel_role = 'student', full_name = 'Claire', locale = 'fr-FR',
  timezone = 'Europe/Paris', country = 'FR',
  onboarding_completed = true, account_status = 'active'
where id = '09030000-0000-4000-8000-0000000000a1';

update public.profiles set
  keel_role = 'student', full_name = 'Nour', locale = 'fr-FR',
  timezone = 'Europe/Paris', country = 'FR',
  onboarding_completed = true, account_status = 'active'
where id = '09030000-0000-4000-8000-0000000000a2';

-- ---------------------------------------------------------------- le foyer
-- `free_until` dans le futur: rien ne gèle (le gel 402 est hors périmètre de
-- ce chantier, et un foyer gelé masquerait tout ce qu'on vient prouver).
insert into public.households (id, name, created_by, free_until)
values (
  '09030000-0000-4000-8000-0000000000f1', 'Foyer QA 0903',
  '09030000-0000-4000-8000-0000000000a1', now() + interval '90 days'
);

-- ---------------------------------------------------------------- les bouches
-- ⚠️ LES DATES DE NAISSANCE SONT RELATIVES À `now()`, jamais figées: une date
--    en dur ferait passer Tom majeur le jour de ses 18 ans, et la fixture
--    cesserait de prouver son contre-exemple sans que rien ne le dise.
insert into public.household_members (
  household_id, member_id, user_id, role, first_name, birth_date, goal,
  away_days, fixed_intakes
) values
  -- LE MAÎTRE. `goal` posé: la ligne `student_goals` en dépend plus bas.
  ('09030000-0000-4000-8000-0000000000f1', '09030000-0000-4000-8000-0000000000b1',
   '09030000-0000-4000-8000-0000000000a1', 'owner', 'Claire',
   (current_date - interval '34 years')::date, 'maintenance', '[]'::jsonb, '[]'::jsonb),
  -- LÉA — ADULTE, SANS COMPTE: la carte du déjeuner se pose à elle, et les
  -- trois états d'accès aussi.
  ('09030000-0000-4000-8000-0000000000f1', '09030000-0000-4000-8000-0000000000b2',
   null, 'member', 'Léa',
   (current_date - interval '29 years')::date, 'fat_loss', '[]'::jsonb, '[]'::jsonb),
  -- TOM — MINEUR: ⛔ AUCUNE carte de déjeuner sur sa fiche (`not_adult`), et
  -- il reste invitable.
  ('09030000-0000-4000-8000-0000000000f1', '09030000-0000-4000-8000-0000000000b3',
   null, 'member', 'Tom',
   (current_date - interval '9 years')::date, 'maintenance', '[]'::jsonb, '[]'::jsonb),
  -- NOUR — SECONDAIRE DÉJÀ RÉCLAMÉ: sa ligne s'édite, les autres non.
  ('09030000-0000-4000-8000-0000000000f1', '09030000-0000-4000-8000-0000000000b4',
   '09030000-0000-4000-8000-0000000000a2', 'member', 'Nour',
   (current_date - interval '31 years')::date, null, '[]'::jsonb, '[]'::jsonb);

update public.households
set reference_member_id = '09030000-0000-4000-8000-0000000000b1'
where id = '09030000-0000-4000-8000-0000000000f1';

-- ---------------------------------------------------------------- les corps
-- ⚠️ SEULEMENT DEUX SUR QUATRE, ET C'EST VOULU: Léa n'a PAS de corps, donc le
--    cadre « Informations personnelles » de sa fiche montre ses champs VIDES
--    sur une lecture FAITE — c'est le cas qui distingue « pas lu » (le cadre ne
--    rend rien) de « lu, rien pour elle » (le cadre rend des champs vides).
insert into public.household_member_bodies (
  member_id, household_id, height_cm, weight_kg, gender, day_activity,
  sport_frequency, appetite
-- ⚠️ `appetite` PARLE LE VOCABULAIRE DU CHECK: small · average · large
--    (`household_member_bodies_appetite_check`). « normal » n'en fait pas
--    partie, et la ligne entière serait refusée.
) values
  ('09030000-0000-4000-8000-0000000000b1', '09030000-0000-4000-8000-0000000000f1',
   168, 62, 'female', 'seated', '1_2', 'average'),
  ('09030000-0000-4000-8000-0000000000b4', '09030000-0000-4000-8000-0000000000f1',
   175, 70, 'other', 'on_feet', 'none', 'average');

-- ---------------------------------------------------------------- la ligne d'objectif du maître
-- ⚠️ SANS ELLE, « Paramètres du foyer » ANNONCE qu'il n'a rien où écrire, et
--    les deux cartes du compte (rythme, ce que Sophia a retenu) ne peuvent
--    rien enregistrer. `practical_constraints` part VIDE exprès: la carte de
--    l'équipement doit s'ouvrir sur « rien de coché », pas sur un état préparé.
insert into public.student_goals (user_id, goal, content_locale, practical_constraints)
values (
  '09030000-0000-4000-8000-0000000000a1', 'maintenance', 'fr-FR', '{}'::jsonb
)
on conflict (user_id) do update
  set goal = excluded.goal,
      content_locale = excluded.content_locale,
      practical_constraints = excluded.practical_constraints;

-- ---------------------------------------------------------------- l'invitation vivante
-- ⛔ `token_hash` EST UNE EMPREINTE BIDON, ET C'EST DÉLIBÉRÉ. L'écran ne lit
--    JAMAIS cette colonne (A5 §5.5: la projection est `member_id, email,
--    created_at, expires_at, consumed_at`), et fabriquer ici un jeton
--    réellement réclamable mettrait un secret utilisable dans un fichier
--    versionné. Ce qu'on prouve avec cette ligne est la LIGNE — « Invitation
--    envoyée le … à … » et le bouton « Renvoyer » —, pas le parcours de
--    réclamation, qui demande un vrai jeton créé par la RPC.
insert into public.household_invitations (
  id, household_id, member_id, email, token_hash, invited_by,
  created_at, expires_at, consumed_at
) values (
  '09030000-0000-4000-8000-0000000000e1',
  '09030000-0000-4000-8000-0000000000f1',
  '09030000-0000-4000-8000-0000000000b2',
  'lea.qa0903f@keeltest.dev',
  encode(extensions.digest('qa0903f-not-a-real-token', 'sha256'), 'hex'),
  '09030000-0000-4000-8000-0000000000a1',
  now() - interval '2 days',
  now() + interval '5 days',
  null
);

-- ---------------------------------------------------------------- restauration
update public.app_config
set value = (select value from _qa0903f_anon_key)
where key = 'edge_functions_anon_key';

commit;

-- ===========================================================================
-- CE QUE LA FIXTURE PERMET DE PROUVER, ET DANS QUEL ORDRE
-- ===========================================================================
-- Connecté en `qa0903f.master@keeltest.dev` (1234567), sur /app/household :
--
--   A6   la fiche de Léa porte « Le déjeuner en semaine » SOUS ses habitudes et
--        AU-DESSUS de « Quand cette bouche n'est pas là ». Répondre Oui puis
--        « Mange dehors » ⇒ « 5 midis de semaine sont cochés "dehors" … ».
--        Ouvrir « Sa semaine » ⇒ cinq midis `eating_out`.
--        Décocher mardi à la main, enregistrer, rouvrir la carte, NE RIEN
--        CHANGER ⇒ mardi RESTE décoché. Contrôle sans navigateur:
--          select away_days from household_members
--          where member_id = '09030000-0000-4000-8000-0000000000b2';
--   A6   la fiche de Tom (mineur) ne porte AUCUNE carte de déjeuner.
--   A5.2 chaque ligne ouvre DEUX cadres nommés, ouverts; replier
--        « Préférences alimentaires » laisse « Déjà renseigné : … ».
--   A5.3 « Ajouter une personne » ouvre UNE fenêtre; les préférences y sont un
--        accordéon REPLIÉ. Ajouter jusqu'à 8 bouches ⇒ la 9e est refusée.
--   A5.4 « Paramètres du foyer » porte l'équipement PUIS les repas traditions.
--   A5.5 Léa: « Invitation envoyée le … » + « Renvoyer ». Tom: « Inviter »
--        (une bouche mineure reste invitable). Nour: « A son accès » +
--        « Retirer l'accès ».
--   A5.7 la ligne de Claire (isMe) porte le rythme et « ce que Sophia a retenu ».
--
-- Puis, connecté en `qa0903f.member@keeltest.dev` (1234567) :
--   A5.6 SA ligne s'ouvre et s'édite (prénom, date, habitudes, absences,
--        déjeuner); Claire, Léa et Tom restent des pastilles. AUCUN cadre
--        « personne n'a de corps », et aucun bouton d'invitation.
-- ===========================================================================
