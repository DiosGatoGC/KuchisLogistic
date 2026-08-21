-- ============================================================================
-- KUCHI'S
-- Map product images stored in Supabase Storage
-- Bucket: product-images
-- ============================================================================

with image_mapping(category_slug, product_name, image_path) as (
  values

  -- --------------------------------------------------------------------------
  -- SALCHIPAPAS
  -- --------------------------------------------------------------------------
  ('salchipapas', 'Salchiclásica',     'salchipapas/salchipapa_salchiclasica.png'),
  ('salchipapas', 'Salchi Pollo',       'salchipapas/salchipapa_salchipollo.png'),
  ('salchipapas', 'Salchi-Filete',      'salchipapas/salchipapa_salchifilete.png'),
  ('salchipapas', 'Choripapa',          'salchipapas/salchipapa_choripapa.png'),
  ('salchipapas', 'Salchi a lo Pobre',  'salchipapas/salchipapa_salchi_a_lo_pobre.png'),
  ('salchipapas', 'Salchi Carnívoro',   'salchipapas/salchipapa_salchicarnivoro.png'),
  ('salchipapas', 'Salchi-Kuchi''s',    'salchipapas/salchipapa_salchikuchis.png'),
  ('salchipapas', 'Salchi Parrillero',  'salchipapas/salchipapa_salchiparrillero.png'),

  -- --------------------------------------------------------------------------
  -- HAMBURGUESAS
  -- --------------------------------------------------------------------------
  ('hamburguesas', 'Clásica',       'hamburguesas/hamburguesa_clasica.png'),
  ('hamburguesas', 'Mr. Tocino',    'hamburguesas/hamburguesa_mr_tocino.png'),
  ('hamburguesas', 'Agringada',     'hamburguesas/hamburguesa_agringada.png'),
  ('hamburguesas', 'Gaucha',        'hamburguesas/hamburguesa_gaucha.png'),
  ('hamburguesas', 'Royal',         'hamburguesas/hamburguesa_royal.png'),
  ('hamburguesas', 'Kuchi''s',      'hamburguesas/hamburguesa_kuchis.png'),
  ('hamburguesas', 'Carnívora',     'hamburguesas/hamburguesa_carnivora.png'),
  ('hamburguesas', 'Hawaiana',      'hamburguesas/hamburguesa_hawaiana.png'),
  ('hamburguesas', 'A lo Pobre',    'hamburguesas/hamburguesa_a_lo_pobre.png'),

  -- --------------------------------------------------------------------------
  -- BROASTER
  -- --------------------------------------------------------------------------
  ('broaster', 'Alita',          'broaster/broaster_alita.png'),
  ('broaster', 'Pierna',         'broaster/broaster_pierna.png'),
  ('broaster', 'Pecho',          'broaster/broaster_pecho.png'),
  ('broaster', 'Alita Doble',    'broaster/broaster_alita_doble.png'),
  ('broaster', 'Pierna Doble',   'broaster/broaster_pierna_doble.png'),

  -- --------------------------------------------------------------------------
  -- ALITAS
  -- --------------------------------------------------------------------------
  ('alitas', 'Alitas - 4 piezas', 'alitas/alitas_4.png'),
  ('alitas', 'Alitas - 6 piezas', 'alitas/alitas_6.png'),
  ('alitas', 'Alitas - 8 piezas', 'alitas/alitas_8.png'),

  -- --------------------------------------------------------------------------
  -- DE POLLO
  -- --------------------------------------------------------------------------
  ('de-pollo', 'Crispy',        'de-pollo/depollo_crispy.png'),
  ('de-pollo', 'A la Plancha',  'de-pollo/depollo_a_la_plancha.png'),
  ('de-pollo', 'Deshilachado',  'de-pollo/depollo_deshilachado.png'),

  -- --------------------------------------------------------------------------
  -- CRIOLLASOS
  -- --------------------------------------------------------------------------
  ('criollasos', 'La Churrasquera', 'criollasos/criollasos_la_churrasquera.png'),

  -- --------------------------------------------------------------------------
  -- PORCIONES
  -- --------------------------------------------------------------------------
  ('porciones', 'Porción de Papas', 'porciones/porcion_papas.png'),
  ('porciones', 'Onion Rings',       'porciones/porcion_onion_rings.png'),

  -- --------------------------------------------------------------------------
  -- BEBIDAS
  -- --------------------------------------------------------------------------
  ('bebidas', 'Inca Kola 600 ml',            'bebidas/bebida_inca.png'),
  ('bebidas', 'Coca-Cola 600 ml',             'bebidas/bebida_coca.png'),
  ('bebidas', 'Chicha Morada - Vaso',         'bebidas/bebida_chicha_vaso.png'),
  ('bebidas', 'Chicha Morada - 1/2 L',        'bebidas/bebida_chicha_medio_litro.png'),
  ('bebidas', 'Chicha Morada - 1 L',          'bebidas/bebida_chicha_litro.png'),
  ('bebidas', 'Jugo de Piña',                 'bebidas/bebida_jugo_pina.png'),
  ('bebidas', 'Jugo de Fresa',                'bebidas/bebida_jugo_fresa.png'),
  ('bebidas', 'Jugo de Fresa con Leche',      'bebidas/bebida_jugo_fresa_leche.png'),
  ('bebidas', 'Infusiones',                   'bebidas/bebida_infusiones.png')
)

update public.products p
set image_path = m.image_path
from image_mapping m
join public.categories c
  on c.slug = m.category_slug
where p.category_id = c.id
  and p.name = m.product_name;


-- ============================================================================
-- Verification
-- Expected result at this migration point:
--   40 products with image_path
--   10 additional products without image_path
-- ============================================================================

do $$
declare
  mapped_products integer;
begin
  select count(*)
  into mapped_products
  from public.products
  where image_path is not null;

  if mapped_products <> 40 then
    raise exception
      'Expected 40 products with image_path, but found %',
      mapped_products;
  end if;
end
$$;
