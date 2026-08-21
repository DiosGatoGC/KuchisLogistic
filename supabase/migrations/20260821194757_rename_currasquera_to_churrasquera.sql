-- ============================================================================
-- KUCHI'S
-- Rename product: La Currasquera -> La Churrasquera
-- ============================================================================

update public.products
set name = 'La Churrasquera'
where name = 'La Currasquera'
  and category_id = (
    select id
    from public.categories
    where slug = 'criollasos'
  );