-- LOT B — L'AVANCEMENT D'UNE COMPOSITION A UNE COLONNE.
--
-- L'écran d'entrée affichait huit phrases sur une minuterie (15 s chacune),
-- puis figeait la huitième pendant quatre minutes : rien ne lisait où en était
-- la composition, parce que rien ne l'écrivait. Une fois la composition
-- acceptée tôt (202) et finie en arrière-plan, la LIGNE est le seul endroit
-- où le navigateur peut lire l'avancement — donc c'est le worker qui l'écrit,
-- à chaque frontière : avant l'appel modèle, avant les contrôles, avant une
-- réparation, avant l'écriture.
--
-- Vocabulaire fermé, comme `status`. Pas de `claimed` : le bail est pris AVANT
-- l'ouverture de la ligne, il n'y a rien à écrire dessus.

alter table public.student_meal_drafts
  add column if not exists stage text
    check (stage in ('composing', 'checking', 'repairing', 'writing')),
  add column if not exists stage_at timestamptz;

comment on column public.student_meal_drafts.stage is
  'Lot B (2026-09-15) : ou en est la composition, ecrit par le worker a chaque '
  'frontiere (composing -> checking -> repairing? -> writing). Null tant que '
  'pending. Lu par le navigateur toutes les 2 s (waitForDraft).';
comment on column public.student_meal_drafts.stage_at is
  'Horodatage de la derniere ecriture de stage.';
