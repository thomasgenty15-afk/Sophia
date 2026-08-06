-- ============================================================================
-- DÉLÉGUER SA DOCTRINE À LA MAISON — l'axe, et une seule façon de le lire.
-- ============================================================================
--
-- POUR QUI: le gérant de salle, ou tout coach qui veut le service sans avoir
-- d'avis à défendre. Zéro question, zéro pari, un clic.
--
-- ── CE QUE CE N'EST PAS, ET C'EST TOUT LE SUJET ────────────────────────────
-- Ce n'est PAS « une doctrine générique qui devient la tienne ». C'est une
-- DÉLÉGATION ASSUMÉE: ses élèves sont suivis par la méthode de la maison, et
-- l'agent le DIT — il signe du nom de la maison, jamais de celui du coach.
--
-- La nuance est la totalité de la valeur. `doctrine_starter.ts` a identifié et
-- refusé de créer le défaut inverse: dix coachs qui adoptent le même bloc sous
-- leur propre nom obtiennent dix agents aux mêmes phrases, et le premier qui
-- reconnaît son `instead` mot pour mot chez un concurrent arrête de payer. Ici
-- il n'y a rien à reconnaître: c'est la même voix, exprès, et annoncée.
--
-- ── POURQUOI SUR `coaches` ET PAS SUR `coach_doctrines` ────────────────────
-- Parce que la délégation existe SANS doctrine. Le coach qui prend ce chemin
-- n'a, par construction, rien écrit — c'est même sa raison d'être ici. Un axe
-- porté par une ligne de doctrine n'aurait aucune ligne où vivre.
--
-- Corollaire: la doctrine que le coach avait éventuellement publiée AVANT de
-- déléguer n'est pas touchée. Elle dort. Repasser à `own` la ressert telle
-- quelle — la bascule est réversible dans les deux sens, et c'est le genre de
-- chose qu'on n'implémente que dans un sens si on ne l'écrit pas.
--
-- ── CE QUI NE BOUGE PAS: LA FACTURATION ────────────────────────────────────
-- `keel_coach_seat_ledger` et `keel_coach_is_solvent` branchent sur
-- `coach_kind`, jamais sur `doctrine_source`. Un coach humain qui EMPRUNTE la
-- doctrine de la maison reste un coach humain: ses sièges sont facturés
-- normalement. « Emprunter la doctrine de la maison » et « ÊTRE la maison »
-- sont deux choses, et cette migration n'en confond aucune — elle n'écrit pas
-- une ligne dans ces fonctions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. L'axe — liste fermée, jamais du texte libre
-- ---------------------------------------------------------------------------

alter table public.coaches
  add column if not exists doctrine_source text not null default 'own';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.coaches'::regclass
       and conname = 'coaches_doctrine_source_check'
  ) then
    alter table public.coaches
      add constraint coaches_doctrine_source_check
      check (doctrine_source in ('own', 'house'));
  end if;
end;
$$;

-- LE COACH MAISON NE DÉLÈGUE PAS À LUI-MÊME.
--
-- Sans cette contrainte, `doctrine_source = 'house'` sur le coach maison est un
-- cycle: le résolveur va chercher la doctrine de la maison… qui est lui. Le
-- code s'en protège (il ne suit la délégation que pour `coach_kind <> 'house'`),
-- mais une garde qui ne vit que dans le code est une garde qu'un `update`
-- manuel contourne. La base refuse l'état, donc le cycle n'a pas d'existence.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.coaches'::regclass
       and conname = 'coaches_house_never_delegates_check'
  ) then
    alter table public.coaches
      add constraint coaches_house_never_delegates_check
      check (coach_kind <> 'house' or doctrine_source = 'own');
  end if;
end;
$$;

comment on column public.coaches.doctrine_source is
  'own = ce coach sert SA doctrine et l''agent signe de son nom. house = il '
  'delegue: ses eleves recoivent la doctrine du coach maison et l''agent signe '
  'du nom de la maison, jamais du sien. Reversible dans les deux sens; la '
  'doctrine publiee du coach n''est pas touchee pendant la delegation. '
  'N''INFLUE PAS SUR LA FACTURATION: le registre de sieges branche sur '
  'coach_kind (keel_coach_seat_ledger), jamais sur cette colonne.';

-- ---------------------------------------------------------------------------
-- 2. Le nom qui signe
-- ---------------------------------------------------------------------------
--
-- ⚠️ CHANGEMENT DE NOM ASSUMÉ, ET LA RAISON D'ORIGINE EST PRÉSERVÉE.
--
-- Le coach maison s'appelait « KEEL Discovery ». La décision qui l'a nommé
-- (20260805090000, et docs/nutrition-pivot/STATUS-FREE-SIGNUP.md §1) refusait
-- d'inventer un coach fictif — « un prénom, un titre, une biographie » — pour
-- porter des conseils nutritionnels, au motif qu'on fabriquerait une autorité
-- humaine qui n'existe pas. Cette raison-là ne change pas et n'est pas
-- contournée ici: `credential_type = 'none'` reste, et personne n'est inventé.
--
-- Ce qui change est le nom lui-même, et pour deux raisons:
--
--   1. « Sophia » n'est pas une personne, c'est l'AGENT — celui à qui l'élève
--      parle déjà, sur toutes les surfaces du produit. Une signature « — Sophia »
--      dit exactement la vérité de la situation: aucun coach ne parle ici, c'est
--      le produit qui répond. « KEEL Discovery » nomme une ligne commerciale, ce
--      qu'un élève n'a aucune raison de reconnaître comme l'auteur d'un message.
--
--   2. DEUX NOMS POUR UNE MÊME DOCTRINE serait la seconde définition que ce
--      dépôt refuse partout. Les élèves de l'inscription libre et les élèves
--      d'un coach qui délègue reçoivent LA MÊME doctrine, par le même chemin,
--      avec la même signature. Les faire signer différemment demanderait au
--      résolveur de savoir POURQUOI il sert la maison — une distinction qui
--      n'existe pas côté élève.
update public.coaches
   set display_name = 'Sophia'
 where coach_kind = 'house'
   and display_name is distinct from 'Sophia';

update auth.users u
   set raw_user_meta_data =
         coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', 'Sophia')
  from public.coaches c
 where c.user_id = u.id
   and c.coach_kind = 'house'
   and coalesce(u.raw_user_meta_data ->> 'full_name', '') is distinct from 'Sophia';

-- ---------------------------------------------------------------------------
-- 3. Le nom DANS la doctrine, pas seulement sur l'étiquette
-- ---------------------------------------------------------------------------
--
-- ⚠️ MESURÉ EN TOUR RÉEL, PAS SUPPOSÉ. Renommer `display_name` sans toucher à
-- la prose a produit une doctrine qui se contredit à voix haute. L'élève d'un
-- coach qui délègue demandait « quelle méthode tu suis avec moi ? » et recevait:
--
--   « Your coach is not someone I can name from what's here; what I can say is
--     that the method is the general KEEL discovery approach »
--
-- alors que l'en-tête du bloc, trois lignes plus haut dans le même prompt,
-- annonçait « == SOPHIA'S METHOD ==». Le modèle a fait la seule chose
-- raisonnable: il a recopié le nom qu'il trouvait dans le TEXTE, pas celui de
-- l'en-tête. Une étiquette renommée sans son contenu ne renomme rien — elle
-- ajoute un troisième nom.
--
-- CE QUI CHANGE EST LE NOM DU LOCUTEUR, PAS SA POSITION. La conviction dit
-- toujours exactement ce qu'elle disait — « ce n'est pas un coach qui te
-- connaît » — et sa `key` est inchangée, donc les plans déjà tracés dessus
-- résolvent encore.
--
-- CE QUI NE CHANGE PAS: le `instead` de `promised_result_or_timeline`, qui
-- renvoie vers « a real coach on KEEL ». Celui-là nomme la PLATEFORME, ce qui
-- reste vrai et reste l'endroit où est le produit.
update public.coach_doctrines d
   set beliefs = (
     select jsonb_agg(
       case
         when b ->> 'key' = 'this_is_a_discovery_program'
         then jsonb_set(
           b,
           '{claim}',
           to_jsonb('This is Sophia''s general method, not a coach who knows you.'::text)
         )
         else b
       end
       order by ord
     )
     from jsonb_array_elements(d.beliefs) with ordinality as t(b, ord)
   )
  from public.coaches c
 where c.id = d.coach_id
   and c.coach_kind = 'house'
   and d.beliefs::text like '%KEEL''s general discovery program%';
