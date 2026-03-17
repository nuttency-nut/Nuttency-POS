-- Add parent role reference for hierarchy
ALTER TABLE public.role_definitions
ADD COLUMN IF NOT EXISTS parent_role_id UUID REFERENCES public.role_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS role_definitions_parent_role_id_idx
ON public.role_definitions(parent_role_id);
