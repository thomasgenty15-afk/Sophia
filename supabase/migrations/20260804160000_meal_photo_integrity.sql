-- ============================================================================
-- L'INTÉGRITÉ DU FAIT ALIMENTAIRE
--
-- Un repas mangé une fois ne doit produire qu'UN fait. Trois fuites étaient
-- ouvertes, toutes vers le même défaut : `protocol_events` compte des repas
-- qui n'ont pas eu lieu.
--
--   1. AUCUN filtre alimentaire. Un selfie, une capture d'écran d'app de
--      livraison, une photo de menu — tout créait une ligne `source='photo'`
--      permanente. La QA de la veille l'avait mesuré (AGENT-3, défaut P1-4) :
--      la MÊME capture d'écran analysée deux fois de suite a rendu
--      `image_quality=partial` avec six groupes alimentaires détectés au
--      premier run, `unusable` au second. Le premier n'a rien crédité PAR
--      ACCIDENT — une seule de ces six lignes au plan du jour aurait crédité
--      une commande peut-être jamais mangée.
--
--   2. AUCUNE déduplication de contenu. Le seul index unique porte sur
--      `(user_id, source_message_id)`, alimenté par un `client_upload_id`
--      généré à CHAQUE sélection de fichier. L'élève qui renvoie sa photo
--      parce qu'il n'a pas vu la réponse arriver double son repas.
--
--   3. AUCUNE trace de mise à jour. L'analyseur fait un UPDATE sans horodater,
--      donc rien ne distingue une ligne analysée à l'insertion d'une ligne
--      rejouée en `force` trois jours plus tard (défaut P3-1 de la même QA).
--
-- Cette migration ajoute les trois colonnes qui rendent ces trois défauts
-- corrigeables, et l'index qui rend la déduplication atomique plutôt que
-- « lue puis écrite » — un check-then-act qui court contre lui-même quand
-- l'élève tape deux fois sur envoyer.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LA DISQUALIFICATION
--
-- On NE SUPPRIME PAS la ligne. `protocol_events` est une table de faits
-- append-only, et l'upload a été conçu pour que « a saved photo with no verdict
-- beats a lost photo » : détruire une ligne sur un verdict de modèle
-- trahirait les deux. On la MARQUE, et les lecteurs qui COMPTENT l'excluent.
--
-- Trois motifs, parce que trois situations différentes appellent trois
-- réponses différentes à l'élève :
--
--   not_food       — aucune nourriture dans le cadre (selfie, paysage, document)
--   food_not_eaten — de la nourriture, mais pas une assiette servie : un menu,
--                    une publicité, un rayon, un frigo, une capture d'écran de
--                    commande. C'est le cas que la QA a trouvé, et le plus
--                    dangereux : le modèle détecte de VRAIS aliments, donc le
--                    crédit part sans que personne ait mangé.
--   unreadable     — c'est peut-être un repas, mais l'image ne permet pas de le
--                    dire (trop sombre, trop floue). Distinct de `not_food` :
--                    l'élève a fait le geste, il mérite une autre réponse, et
--                    « cet élève envoie des photos illisibles » est un signal
--                    utile au coach.
--
-- NULL = la ligne compte. C'est le défaut, et c'est ce qui rend cette migration
-- rétro-compatible : aucune ligne existante ne change de sens.
-- ----------------------------------------------------------------------------

alter table public.protocol_events
  add column if not exists disqualified_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.protocol_events'::regclass
       and conname = 'protocol_events_disqualified_reason_check'
  ) then
    alter table public.protocol_events
      add constraint protocol_events_disqualified_reason_check
      check (
        disqualified_reason is null
        or disqualified_reason in ('not_food', 'food_not_eaten', 'unreadable')
      );
  end if;
end $$;

comment on column public.protocol_events.disqualified_reason is
  'NULL = ce fait compte. Sinon: pourquoi il ne compte pas (not_food | '
  'food_not_eaten | unreadable). La ligne est CONSERVÉE — on marque, on ne '
  'supprime pas. Tout lecteur qui COMPTE des repas doit filtrer sur NULL; '
  'les lecteurs de SAFETY (restriction_runtime) ne filtrent PAS: les mots de '
  'l''élève restent à lire même sur une photo disqualifiée.';

-- L'index qui rend le filtre gratuit pour les lecteurs de comptage. Partiel:
-- l'écrasante majorité des lignes ont `disqualified_reason IS NULL`, donc
-- indexer les autres coûterait plus que ça ne rapporte.
create index if not exists protocol_events_disqualified_idx
  on public.protocol_events (user_id, local_date)
  where disqualified_reason is not null;

-- ----------------------------------------------------------------------------
-- 2. LA DÉDUPLICATION PAR OCTETS
--
-- SHA-256 des octets DÉCODÉS de l'image. Deux envois du même fichier par le
-- même élève le même jour local sont le même repas — c'est une certitude, pas
-- une probabilité, et elle ne demande ni modèle ni seuil.
--
-- POURQUOI `local_date` DANS LA CLÉ, et pas une fenêtre en minutes : une
-- fenêtre glissante ne s'exprime pas dans un index unique, donc elle
-- redeviendrait un check-then-act. La journée locale est la granularité que
-- cette table porte déjà partout (`local_date` est `not null`, résolue côté
-- serveur depuis le fuseau du plan), et elle couvre le cas réel — le renvoi
-- immédiat — sans jamais fusionner deux journées.
--
-- CE QUE ÇA NE COUVRE PAS, volontairement : deux photos DIFFÉRENTES du même
-- repas (angle différent). Ce cas-là est incertain, donc il n'appartient pas à
-- une contrainte d'unicité : il se règle par une question à l'élève.
-- ----------------------------------------------------------------------------

alter table public.protocol_events
  add column if not exists media_sha256 text;

comment on column public.protocol_events.media_sha256 is
  'SHA-256 hexadécimal des octets décodés du média. Renseigné par '
  'meal-photo-upload-v1. Sert la déduplication exacte via '
  'protocol_events_media_dedup_idx.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.protocol_events'::regclass
       and conname = 'protocol_events_media_sha256_format_check'
  ) then
    alter table public.protocol_events
      add constraint protocol_events_media_sha256_format_check
      check (media_sha256 is null or media_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end $$;

-- L'unicité. Partielle sur `media_sha256 is not null` pour ne contraindre que
-- les faits qui portent un média — un tap du soir ou une phrase n'en ont pas,
-- et deux d'entre eux le même jour sont parfaitement légitimes.
create unique index if not exists protocol_events_media_dedup_idx
  on public.protocol_events (user_id, local_date, media_sha256)
  where media_sha256 is not null;

comment on index public.protocol_events_media_dedup_idx is
  'Déduplication EXACTE: même élève, même journée locale, mêmes octets = un '
  'seul fait. Atomique par construction: la course entre deux taps sur envoyer '
  'est arbitrée par Postgres, pas par un SELECT qui précède un INSERT.';

-- ----------------------------------------------------------------------------
-- 3. LA TRACE DE MISE À JOUR
--
-- `analyze-meal-photo-v1` écrit `recognized`, `recognition_confidence`,
-- `food_group_ref` et `portion_band` par UPDATE, y compris sur un rejeu
-- `force: true`. Sans horodatage, une ligne analysée à l'insertion et une ligne
-- réanalysée trois jours plus tard sont indistinguables — ce qui rend tout
-- audit d'un changement de prompt impossible après coup.
--
-- Pas de trigger: la valeur est écrite explicitement par l'analyseur, au même
-- endroit que le reste de son UPDATE. Un trigger `BEFORE UPDATE` toucherait
-- aussi les UPDATE qui n'ont rien à voir avec l'analyse.
-- ----------------------------------------------------------------------------

alter table public.protocol_events
  add column if not exists analyzed_at timestamptz;

comment on column public.protocol_events.analyzed_at is
  'Quand l''analyse vision a écrit sa lecture sur cette ligne. NULL = jamais '
  'analysée (fait non-photo, ou photo dont l''analyse a échoué). Réécrite à '
  'chaque rejeu `force`, ce qui rend un changement de prompt auditable.';

-- ----------------------------------------------------------------------------
-- 4. CONTRÔLE FINAL — on rejoue le geste, on n'inspecte pas du texte
--
-- La leçon payée par `20260804140000`: une épreuve d'absence textuelle laisse
-- passer une panne réelle. Ici on VÉRIFIE que la contrainte d'unicité mord
-- vraiment, dans une sous-transaction annulée.
-- ----------------------------------------------------------------------------

do $$
declare
  probe_user uuid;
  probe_hash text := repeat('a', 64);
  violated boolean := false;
begin
  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'meal_photo_integrity: aucun utilisateur en base, contrôle sauté';
    return;
  end if;

  begin
    insert into public.protocol_events
      (user_id, occurred_at, local_date, source, content_locale, media_sha256)
    values
      (probe_user, now(), current_date, 'photo', 'en', probe_hash),
      (probe_user, now(), current_date, 'photo', 'en', probe_hash);
    -- Si on arrive ici, l'index unique n'a pas mordu.
    raise exception
      'meal_photo_integrity: protocol_events_media_dedup_idx N''A PAS empêché '
      'un doublon exact — la déduplication serait silencieusement inopérante';
  exception
    when unique_violation then
      violated := true;
  end;

  if not violated then
    raise exception 'meal_photo_integrity: contrôle d''unicité non concluant';
  end if;

  -- Rien n'est conservé: les deux INSERT ci-dessus ont été annulés par
  -- l'exception, et ce bloc n'écrit rien d'autre.
  raise notice 'meal_photo_integrity: unicité média vérifiée par un vrai INSERT';
end $$;
