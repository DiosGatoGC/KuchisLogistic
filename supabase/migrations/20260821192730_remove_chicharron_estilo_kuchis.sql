-- ============================================================================
-- KUCHI'S
-- Remove discontinued product: Chicharrón estilo Kuchi's
-- ============================================================================

delete from public.products
where name = 'Chicharrón estilo Kuchi''s'
  and category_id = (
    select id
    from public.categories
    where slug = 'criollasos'
  );