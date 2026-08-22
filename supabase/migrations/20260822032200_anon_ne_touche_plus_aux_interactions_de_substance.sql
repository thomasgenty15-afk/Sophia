-- S6 — LES GRANTS PAR DÉFAUT · 3/8 · `substance_interactions`
--
-- Troisième et dernier référentiel de la famille `substances*`. Même geste,
-- même raison, même vérification que les deux précédentes.
--
-- ⚠️ CE QUE CETTE TABLE PORTE, ET QUI EXPLIQUE POURQUOI ELLE EST DANS LA
--    LISTE : `substance_ref × medication_class × severity`. Ce n'est pas une
--    donnée personnelle, mais c'est une donnée de SÉCURITÉ — la table qui dit
--    quelle substance mord sur quelle classe de médicament. Une écriture par
--    `anon` n'exfiltre rien : elle FAUSSE un avertissement. C'est le mode
--    d'échec le plus difficile à voir, parce que le produit continue de
--    répondre.

revoke all privileges on table public.substance_interactions from anon, authenticated;

grant select on table public.substance_interactions to anon, authenticated;

do $verif$
begin
  if has_table_privilege('anon', 'public.substance_interactions', 'INSERT')
     or has_table_privilege('anon', 'public.substance_interactions', 'UPDATE')
     or has_table_privilege('anon', 'public.substance_interactions', 'DELETE')
     or has_table_privilege('anon', 'public.substance_interactions', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.substance_interactions', 'INSERT')
     or has_table_privilege('authenticated', 'public.substance_interactions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.substance_interactions', 'DELETE')
     or has_table_privilege('authenticated', 'public.substance_interactions', 'TRUNCATE')
  then
    raise exception 'S6/substance_interactions : un droit d''écriture subsiste';
  end if;
  if not has_table_privilege('authenticated', 'public.substance_interactions', 'SELECT') then
    raise exception 'S6/substance_interactions : la lecture de `authenticated` a été emportée';
  end if;
end
$verif$;
