-- 1. Nettoyage des doublons existants dans user_goals
-- On garde uniquement le goal le plus récent pour chaque couple (user_id, axis_id)
DELETE FROM public.user_goals
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, axis_id
             ORDER BY created_at DESC
           ) as row_num
    FROM public.user_goals
  ) t
  WHERE t.row_num > 1
);

-- 2. Ajout de la contrainte d'unicité sur user_goals
-- Un utilisateur ne peut avoir qu'une seule entrée par axe
ALTER TABLE public.user_goals
ADD CONSTRAINT unique_user_axis UNIQUE (user_id, axis_id);

-- 3. Nettoyage des doublons existants dans user_plans
-- On garde uniquement le plan le plus récent pour chaque goal
DELETE FROM public.user_plans
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY goal_id
             ORDER BY created_at DESC
           ) as row_num
    FROM public.user_plans
  ) t
  WHERE t.row_num > 1
);

-- 4. Ajout de la contrainte d'unicité sur user_plans
-- Un goal ne peut avoir qu'un seul plan associé
ALTER TABLE public.user_plans
ADD CONSTRAINT unique_goal_plan UNIQUE (goal_id);

