-- Ajout de la date de naissance et du genre au profil utilisateur
-- Ces informations sont nécessaires pour la personnalisation physiologique du plan

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other'));

