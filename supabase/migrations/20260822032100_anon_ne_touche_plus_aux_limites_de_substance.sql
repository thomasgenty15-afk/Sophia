-- S6 — LES GRANTS PAR DÉFAUT · 2/8 · `substance_limits`
--
-- Même geste, même raison que `20260822032000` (`substances`) : le défaut de
-- `alter default privileges` a accordé `arwdDxtm` à `anon` et `authenticated`,
-- et la seule policy de la table est `substance_limits_read`, en `SELECT`.
--
-- ⛔ UNE TABLE PAR COMMIT, ET UNE VÉRIFICATION APRÈS CHACUNE. La fiche `S6`
--    appelle ce lot « le plus gros risque de régression du plan » : ce n'est
--    pas une précaution de style, c'est que la seule chose qui distingue un
--    `revoke` juste d'un `revoke` de trop est une LECTURE DU FRONT rejouée
--    sous le rôle. Voir `scripts/keel_s6_grants_par_role_20260822.sh`.
--
-- ⚠️ CETTE TABLE N'A AUCUN LECTEUR DANS LE FRONT — elle n'est lue que par
--    `plan-template-v1` en `service_role`, qui n'est pas touché ici. Le
--    `grant select to authenticated` est donc conservé POUR LA POLICY, pas
--    pour un appelant : le retirer ferait diverger le droit et la policy, et
--    c'est précisément le genre d'écart qui se redécouvre trois lots plus tard.

revoke all privileges on table public.substance_limits from anon, authenticated;

grant select on table public.substance_limits to anon, authenticated;

do $verif$
begin
  if has_table_privilege('anon', 'public.substance_limits', 'INSERT')
     or has_table_privilege('anon', 'public.substance_limits', 'UPDATE')
     or has_table_privilege('anon', 'public.substance_limits', 'DELETE')
     or has_table_privilege('anon', 'public.substance_limits', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.substance_limits', 'INSERT')
     or has_table_privilege('authenticated', 'public.substance_limits', 'UPDATE')
     or has_table_privilege('authenticated', 'public.substance_limits', 'DELETE')
     or has_table_privilege('authenticated', 'public.substance_limits', 'TRUNCATE')
  then
    raise exception 'S6/substance_limits : un droit d''écriture subsiste';
  end if;
  if not has_table_privilege('authenticated', 'public.substance_limits', 'SELECT') then
    raise exception 'S6/substance_limits : la lecture de `authenticated` a été emportée';
  end if;
end
$verif$;
