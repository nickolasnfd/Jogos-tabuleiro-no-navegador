-- Remove TUDO que o OMERTÀ criou no projeto (nada mais é afetado).
drop function if exists public.omerta_purge_rooms();
drop table if exists public.omerta_rooms;
