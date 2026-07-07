-- Catálogo inicial. productUid e custo de produção confirmados via API da
-- Gelato (product.gelatoapis.com) em 2026-07-07 para o Brasil (BRL).
-- Preço de venda = custo Gelato × 1.75 ÷ (1 − 0.0499), para que a margem
-- líquida (após a taxa do Checkout Pro do Mercado Pago, 4.99%) fique em
-- exatamente custo × 1.75. Não inclui frete, que é cobrado à parte.
--
-- print_width_mm / print_height_mm são estimativas do tamanho físico real
-- da área de impressão (mesmo nível de "placeholder" que os mockups em
-- SVG) — usadas só para calcular o DPI da imagem que o cliente sobe no
-- editor. Ajuste quando tiver as specs reais de cada produto.
--
-- Todos abaixo são 'customizable' (cliente personaliza no editor). Ainda
-- não há nenhum produto 'ready' (arte fixa, sem editor) cadastrado —
-- default_artwork_url fica NULL até termos os arquivos de arte prontos.

INSERT INTO products (id, name, description, base_price_cents, pod_product_uid, mockup_image_url, print_area_json, product_type, print_width_mm, print_height_mm, active)
VALUES
(
  'camiseta-basica-branca',
  'Camiseta básica branca personalizada',
  'Camiseta 100% algodão, estampa digital de alta qualidade.',
  20548, -- custo Gelato: R$111,56 -> preço: R$205,48
  'apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_m_gco_white_gpr_4-4',
  '/mockups/camiseta-branca.svg',
  '{"x":150,"y":120,"width":300,"height":360}',
  'customizable',
  300, 360,
  1
),
(
  'caneca-ceramica-branca',
  'Caneca de cerâmica personalizada',
  'Caneca branca 325ml, estampa ao redor.',
  8224, -- custo Gelato: R$44,65 -> preço: R$82,24
  'mug_product_msz_11-oz_mmat_ceramic-white_cl_4-0',
  '/mockups/caneca-branca.svg',
  '{"x":90,"y":90,"width":420,"height":220}',
  'customizable',
  200, 95,
  1
),
(
  'poster-a3',
  'Pôster A3 personalizado',
  'Pôster A3 retrato, papel couché 200g, acabamento fosco.',
  12297, -- custo Gelato: R$66,76 -> preço: R$122,97
  'flat_product_pf_a3_pt_200-gsm-coated-silk_cl_4-0_ct_none_prt_none_sft_none_set_none_ver',
  '/mockups/poster-a3.svg',
  '{"x":160,"y":70,"width":280,"height":460}',
  'customizable',
  287, 410,
  1
),
(
  'ecobag-branca',
  'Ecobag branca personalizada',
  'Bolsa de algodão branca, alça reforçada, estampa frontal.',
  15440, -- custo Gelato: R$83,82 -> preço: R$154,40
  'bag_product_bsc_tote-bag_bqa_clc_bsi_std-t_bco_white_bpr_4-0',
  '/mockups/ecobag-branca.svg',
  '{"x":200,"y":230,"width":200,"height":200}',
  'customizable',
  250, 250,
  1
);
