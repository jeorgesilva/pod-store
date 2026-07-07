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

-- Produtos abaixo: productUid e custo de produção confirmados via API da
-- Gelato (product.gelatoapis.com) em 2026-07-08 para o Brasil (BRL), mesma
-- fórmula de preço e mesmo caráter "placeholder" dos mockups/print_area_json
-- acima (ajustar quando tiver fotos reais e specs de impressão confirmadas).

INSERT INTO products (id, name, description, base_price_cents, pod_product_uid, mockup_image_url, print_area_json, product_type, print_width_mm, print_height_mm, active)
VALUES
(
  'moletom-branco',
  'Moletom com capuz branco personalizado',
  'Moletom unissex, algodão/poliéster, estampa digital frontal.',
  35234, -- custo Gelato: R$191,29 -> preço: R$352,34
  'apparel_product_gca_hoodie_gsc_pullover_gcu_unisex_gqa_classic_gsi_m_gco_white_gpr_4-4',
  '/mockups/moletom-branco.svg',
  '{"x":150,"y":140,"width":300,"height":340}',
  'customizable',
  300, 360,
  1
),
(
  'quadro-tela-30x40',
  'Quadro em tela 30x40cm personalizado',
  'Impressão em tela, moldura de madeira FSC 2cm, acabamento fosco.',
  19958, -- custo Gelato: R$108,35 -> preço: R$199,58
  'canvas_product_cf_300x400-mm_cm_canvas_cfrm_wood-fsc-2-cm_cl_4-0_ver',
  '/mockups/quadro-tela-30x40.svg',
  '{"x":150,"y":70,"width":300,"height":400}',
  'customizable',
  300, 400,
  1
),
(
  'garrafa-termica-inox',
  'Garrafa térmica de inox personalizada',
  'Garrafa inox 500ml, parede dupla, estampa ao redor.',
  22447, -- custo Gelato: R$121,87 -> preço: R$224,47
  'bottle_product_bsz_17-oz_bmat_stainless-steel-white_cl_4-0',
  '/mockups/garrafa-termica-inox.svg',
  '{"x":220,"y":230,"width":160,"height":140}',
  'customizable',
  180, 90,
  1
),
(
  'bone-branco',
  'Boné aba curva branco personalizado',
  'Boné dad hat, estampa digital frontal (DTF).',
  18954, -- custo Gelato: R$102,91 -> preço: R$189,54
  'apparel_product_gca_hat_gsc_dad-hat_gcu_unisex_gqa_classic_gsi_onesize_gco_white_gpr_4-0-dtf_as-colour_1114',
  '/mockups/bone-branco.svg',
  '{"x":230,"y":260,"width":140,"height":100}',
  'customizable',
  100, 70,
  1
);
