-- ============================================================================
-- KUCHI'S
-- Initial real catalog
-- Source: physical menu + current digital menu references provided by owner
--
-- NOTE:
-- - Images are left NULL for now. They will later point to Supabase Storage.
-- - General free creams are intentionally NOT modeled as products/categories yet.
-- - Obvious spelling was normalized for the digital catalog without changing
--   ingredients or prices.
-- ============================================================================

-- ============================================================================
-- 1. CATEGORIES
-- ============================================================================

insert into public.categories (name, slug, sort_order, is_active)
values
  ('Salchipapas',   'salchipapas',   1, true),
  ('Hamburguesas',  'hamburguesas',  2, true),
  ('Broaster',      'broaster',      3, true),
  ('Alitas',        'alitas',        4, true),
  ('De Pollo',      'de-pollo',      5, true),
  ('Criollasos',    'criollasos',    6, true),
  ('Porciones',     'porciones',     7, true),
  ('Bebidas',       'bebidas',       8, true),
  ('Adicionales',   'adicionales',   9, true)
on conflict (slug) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;


-- ============================================================================
-- 2. PRODUCTS
-- ============================================================================

with menu_items(category_slug, name, description, price) as (
  values

  -- --------------------------------------------------------------------------
  -- SALCHIPAPAS
  -- --------------------------------------------------------------------------
  (
    'salchipapas',
    'Salchiclásica',
    'Salchichas vienesas + papas fritas de la casa + ensalada.',
    10.00::numeric
  ),
  (
    'salchipapas',
    'Salchi Pollo',
    'Salchichas vienesas + trozos de pechuga broaster + papas fritas + ensalada.',
    14.90::numeric
  ),
  (
    'salchipapas',
    'Salchi-Filete',
    'Salchichas vienesas + pechuga a la plancha + queso + papas fritas + ensalada.',
    15.90::numeric
  ),
  (
    'salchipapas',
    'Choripapa',
    'Salchichas vienesas + chorizo parrillero + papas fritas + ensalada.',
    15.50::numeric
  ),
  (
    'salchipapas',
    'Salchi a lo Pobre',
    'Salchichas vienesas + huevo + plátano frito + papas fritas + ensalada.',
    12.50::numeric
  ),
  (
    'salchipapas',
    'Salchi Carnívoro',
    'Salchichas vienesas + churrasco deshuesado a la parrilla + papas fritas + ensalada.',
    17.90::numeric
  ),
  (
    'salchipapas',
    'Salchi-Kuchi''s',
    'Salchichas vienesas + queso + costillas BBQ o chicharrón + papas fritas + ensalada.',
    19.90::numeric
  ),
  (
    'salchipapas',
    'Salchi Parrillero',
    'Salchichas vienesas + churrasco deshuesado a la parrilla + chorizo parrillero + papas fritas + ensalada.',
    22.90::numeric
  ),

  -- --------------------------------------------------------------------------
  -- HAMBURGUESAS
  -- --------------------------------------------------------------------------
  (
    'hamburguesas',
    'Clásica',
    'Hamburguesa artesanal 150 gr + papas fritas de la casa.',
    11.00::numeric
  ),
  (
    'hamburguesas',
    'Mr. Tocino',
    'Hamburguesa artesanal 150 gr + doble queso + tocino ahumado + papas fritas de la casa.',
    15.50::numeric
  ),
  (
    'hamburguesas',
    'Agringada',
    'Hamburguesa artesanal 150 gr + doble queso + tocino BBQ + onion rings + pickles + papas fritas.',
    16.90::numeric
  ),
  (
    'hamburguesas',
    'Gaucha',
    'Hamburguesa artesanal 150 gr + chorizo parrillero + papas fritas.',
    16.90::numeric
  ),
  (
    'hamburguesas',
    'Royal',
    'Hamburguesa artesanal 150 gr + queso + huevo + papas fritas.',
    13.50::numeric
  ),
  (
    'hamburguesas',
    'Kuchi''s',
    'Hamburguesa artesanal 150 gr + queso + costillas BBQ + papas fritas de la casa.',
    19.90::numeric
  ),
  (
    'hamburguesas',
    'Carnívora',
    'Doble hamburguesa artesanal + doble queso + tocino ahumado + pickles + papas fritas.',
    19.90::numeric
  ),
  (
    'hamburguesas',
    'Hawaiana',
    'Hamburguesa artesanal 150 gr + queso + piña en almíbar + salsa BBQ + papas fritas.',
    15.50::numeric
  ),
  (
    'hamburguesas',
    'A lo Pobre',
    'Hamburguesa artesanal 150 gr + queso + huevo + plátano + papas fritas.',
    14.50::numeric
  ),

  -- --------------------------------------------------------------------------
  -- BROASTER
  -- --------------------------------------------------------------------------
  (
    'broaster',
    'Alita',
    'Incluye papas fritas de la casa y ensalada.',
    11.00::numeric
  ),
  (
    'broaster',
    'Pierna',
    'Incluye papas fritas de la casa y ensalada.',
    12.90::numeric
  ),
  (
    'broaster',
    'Pecho',
    'Incluye papas fritas de la casa y ensalada.',
    15.90::numeric
  ),
  (
    'broaster',
    'Alita Doble',
    'Incluye papas fritas de la casa y ensalada.',
    15.00::numeric
  ),
  (
    'broaster',
    'Pierna Doble',
    'Incluye papas fritas de la casa y ensalada.',
    19.00::numeric
  ),

  -- --------------------------------------------------------------------------
  -- ALITAS
  -- --------------------------------------------------------------------------
  (
    'alitas',
    'Alitas - 4 piezas',
    '4 piezas + papas fritas de la casa. Salsa a elegir: BBQ o Búfalo.',
    15.00::numeric
  ),
  (
    'alitas',
    'Alitas - 6 piezas',
    '6 piezas + papas fritas de la casa. Salsa a elegir: BBQ o Búfalo.',
    19.50::numeric
  ),
  (
    'alitas',
    'Alitas - 8 piezas',
    '8 piezas + papas fritas de la casa. Salsa a elegir: BBQ o Búfalo.',
    24.00::numeric
  ),

  -- --------------------------------------------------------------------------
  -- DE POLLO
  -- --------------------------------------------------------------------------
  (
    'de-pollo',
    'Crispy',
    'Crocante pechuga.',
    14.50::numeric
  ),
  (
    'de-pollo',
    'A la Plancha',
    'Tierna pechuga a la plancha.',
    12.50::numeric
  ),
  (
    'de-pollo',
    'Deshilachado',
    'Clásico de la casa.',
    11.50::numeric
  ),

  -- --------------------------------------------------------------------------
  -- CRIOLLASOS
  -- --------------------------------------------------------------------------
  (
    'criollasos',
    'La Currasquera',
    'Churrasco deshuesado a la parrilla + papas fritas de la casa.',
    14.50::numeric
  ),
  (
    'criollasos',
    'Chicharrón estilo Kuchi''s',
    'Acompañado de camote + papas fritas de la casa.',
    14.50::numeric
  ),

  -- --------------------------------------------------------------------------
  -- PORCIONES
  -- --------------------------------------------------------------------------
  (
    'porciones',
    'Porción de Papas',
    'Porción de papas fritas de la casa.',
    10.00::numeric
  ),
  (
    'porciones',
    'Onion Rings',
    'Porción de 10 aros de cebolla fritos.',
    8.00::numeric
  ),

  -- --------------------------------------------------------------------------
  -- BEBIDAS
  -- --------------------------------------------------------------------------
  (
    'bebidas',
    'Inca Kola 600 ml',
    'Gaseosa Inca Kola de 600 ml.',
    4.00::numeric
  ),
  (
    'bebidas',
    'Coca-Cola 600 ml',
    'Gaseosa Coca-Cola de 600 ml.',
    4.00::numeric
  ),
  (
    'bebidas',
    'Chicha Morada - Vaso',
    'Chicha natural.',
    3.00::numeric
  ),
  (
    'bebidas',
    'Chicha Morada - 1/2 L',
    'Chicha natural.',
    5.00::numeric
  ),
  (
    'bebidas',
    'Chicha Morada - 1 L',
    'Chicha natural.',
    10.00::numeric
  ),
  (
    'bebidas',
    'Jugo de Piña',
    'Fruta natural.',
    10.00::numeric
  ),
  (
    'bebidas',
    'Jugo de Fresa',
    'Fruta natural.',
    10.00::numeric
  ),
  (
    'bebidas',
    'Jugo de Fresa con Leche',
    'Fruta natural.',
    12.00::numeric
  ),
  (
    'bebidas',
    'Infusiones',
    'Té, manzanilla o anís.',
    3.00::numeric
  ),

  -- --------------------------------------------------------------------------
  -- ADICIONALES
  -- --------------------------------------------------------------------------
  ('adicionales', 'Queso',         null, 2.00::numeric),
  ('adicionales', 'Plátano',       null, 3.00::numeric),
  ('adicionales', 'Huevo',         null, 3.00::numeric),
  ('adicionales', 'Tocino',        null, 3.00::numeric),
  ('adicionales', 'Hot Dog',       null, 3.00::numeric),
  ('adicionales', 'Chorizo',       null, 6.00::numeric),
  ('adicionales', 'Hamburguesa',   null, 6.00::numeric),
  ('adicionales', 'Filete',        null, 7.00::numeric),
  ('adicionales', 'Alita',         null, 7.00::numeric),
  ('adicionales', 'Deshilachado',  null, 6.00::numeric)
)

insert into public.products (
  category_id,
  name,
  description,
  price,
  image_path,
  is_available,
  is_active
)
select
  c.id,
  m.name,
  m.description,
  m.price,
  null,
  true,
  true
from menu_items m
join public.categories c
  on c.slug = m.category_slug
where not exists (
  select 1
  from public.products p
  where p.category_id = c.id
    and lower(p.name) = lower(m.name)
);


-- ============================================================================
-- 3. GENERAL FREE CREAMS — NOT STORED AS PRODUCTS YET
-- ============================================================================
--
-- Current informational list for the future frontend:
--
-- Mayonesa
-- Mostaza
-- Ketchup
-- Tártara
-- Vinagreta
-- BBQ
-- Crema Kuchi's
-- Rocoto
--
-- These are free and are intentionally not selectable catalog products yet.
-- ============================================================================