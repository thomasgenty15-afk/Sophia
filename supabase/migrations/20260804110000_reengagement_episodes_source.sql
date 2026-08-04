-- PIVOT NUTRITION — d'où vient un épisode de décrochage.
--
-- `reengagement_episodes` sert désormais DEUX producteurs:
--   * le winback legacy du bilan quotidien (`process-checkins`, webhook bilan,
--     flow `winback_reengagement_v1`), multi-touches, qui referme ses épisodes
--     lui-même en lisant le CONTENU de la réponse;
--   * `keel-reengage-v1`, une touche unique, dont aucun flow ne lit la réponse.
--
-- Sans marqueur d'origine, le closer KEEL (« l'élève a répondu, l'épisode est
-- clos ») fermerait aussi les épisodes du winback legacy, et couperait ce
-- flow-là en plein milieu de son escalade. L'inverse est vrai aussi. La colonne
-- existe pour que chaque producteur ne referme QUE ses propres épisodes.
--
-- Le défaut il corrige: un épisode KEEL n'avait aucun closer. Il restait ouvert
-- jusqu'au cap de 30 jours du sweep (`REENGAGEMENT_STALE_OPEN_CLOSE_DAYS`), qui
-- le classait `no_reply` — sur un élève qui avait répondu. Pendant ces 30 jours
-- `already_nudged_this_episode` écartait l'élève à chaque tick.
--
-- Additif, service-role uniquement (la table n'a aucune policy RLS).

alter table public.reengagement_episodes
  add column if not exists source text not null default 'winback_daily_bilan';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reengagement_episodes'::regclass
      and conname = 'reengagement_episodes_source_check'
  ) then
    alter table public.reengagement_episodes
      add constraint reengagement_episodes_source_check
      check (source in ('winback_daily_bilan', 'keel_reengage'));
  end if;
end $$;

comment on column public.reengagement_episodes.source is
  'Producteur de l''épisode. Chaque producteur ne referme que ses propres épisodes: ''winback_daily_bilan'' (escalade 3 touches, closers content-aware) vs ''keel_reengage'' (touche unique, clos par le premier inbound de l''élève).';

-- Le closer KEEL cherche « l'épisode KEEL ouvert de cet élève » à chaque inbound
-- WhatsApp. Sans index, c'est un scan par message reçu.
create index if not exists reengagement_episodes_open_by_source_idx
  on public.reengagement_episodes (user_id, source)
  where closed_at is null;
