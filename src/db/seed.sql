-- Catálogo inicial.
--
-- Produtos reais importados do catálogo da Printful (Catalog API,
-- 2026-07-08). pod_product_uid é o variant_id numérico
-- (GET /products/{id}, campo variants[].id); mockup_image_url é a foto
-- real do produto (GET /products/{id}, variants[].image), baixada para
-- public/mockups/*.jpg. base_price_cents = custo_producao (USD da
-- Printful, convertido a BRL na cotação do dia, 1 USD = 5.16 BRL) × 1.75
-- ÷ (1 − 0.0499) — fórmula da margem líquida após a taxa do Checkout Pro
-- do Mercado Pago (ver CLAUDE.md).
--
-- print_width_mm / print_height_mm e print_area_json continuam só para o
-- customizer.js legado (fora do fluxo principal) — o Embedded Design
-- Maker da Printful calcula a área de impressão sozinho. Reescalados
-- proporcionalmente para o tamanho real das fotos (700×1000px), mas
-- ainda são estimativas, não a área de impressão exata de cada variante.
--
-- Todos abaixo são 'customizable' (cliente personaliza no Embedded Design
-- Maker da Printful). Ainda não há nenhum produto 'ready' (arte fixa, sem
-- editor) cadastrado — default_artwork_url fica NULL até termos os
-- arquivos de arte prontos.

INSERT INTO products (id, name, description, base_price_cents, pod_product_uid, mockup_image_url, print_area_json, product_type, print_width_mm, print_height_mm, active)
VALUES
(
  'camiseta-basica-branca',
  'Camiseta básica branca personalizada',
  'Camiseta 100% algodão, estampa digital de alta qualidade.',
  11357, -- Bella+Canvas 3001 (White/M), custo USD 11.95 x 5.16 -> BRL, x1.75/(1-0.0499)
  '4012', -- Printful variant_id: Bella+Canvas 3001 Unisex Staple T-Shirt, White / M
  '/mockups/camiseta-branca.jpg',
  '{"x":175,"y":200,"width":350,"height":600}',
  'customizable',
  300, 360,
  1
),
(
  'caneca-ceramica-branca',
  'Caneca de cerâmica personalizada',
  'Caneca branca 11oz (325ml), estampa ao redor.',
  6178, -- White Glossy Mug 11oz, custo USD 6.50 x 5.16 -> BRL, x1.75/(1-0.0499)
  '1320', -- Printful variant_id: White Glossy Mug, White / 11 oz
  '/mockups/caneca-branca.jpg',
  '{"x":105,"y":150,"width":490,"height":367}',
  'customizable',
  200, 95,
  1
),
(
  'poster-a3',
  'Pôster A3 personalizado',
  'Pôster 30x40cm (próximo de A3), papel matte, acabamento fosco.',
  11168, -- Enhanced Matte Paper Poster 30x40cm, custo USD 11.75 x 5.16 -> BRL, x1.75/(1-0.0499)
  '8948', -- Printful variant_id: Enhanced Matte Paper Poster (cm), 30x40 cm
  '/mockups/poster-a3.jpg',
  '{"x":187,"y":117,"width":327,"height":767}',
  'customizable',
  300, 400,
  1
),
(
  'ecobag-branca',
  'Ecobag branca personalizada',
  'Bolsa de algodão branca (AS Colour 1001), alça reforçada, estampa frontal.',
  16632, -- Cotton Tote Bag AS Colour 1001 (Cream/White), custo USD 17.50 x 5.16 -> BRL, x1.75/(1-0.0499)
  '16289', -- Printful variant_id: Cotton Tote Bag AS Colour 1001, Cream (White) / One size
  '/mockups/ecobag-branca.jpg',
  '{"x":233,"y":383,"width":233,"height":333}',
  'customizable',
  250, 250,
  1
);

INSERT INTO products (id, name, description, base_price_cents, pod_product_uid, mockup_image_url, print_area_json, product_type, print_width_mm, print_height_mm, active)
VALUES
(
  'moletom-branco',
  'Moletom com capuz branco personalizado',
  'Moletom unissex Gildan 18500, algodão/poliéster, estampa digital frontal.',
  21147, -- Gildan 18500 Unisex Heavy Blend Hoodie (White/M), custo USD 22.25 x 5.16 -> BRL, x1.75/(1-0.0499)
  '5523', -- Printful variant_id: Gildan 18500 Unisex Heavy Blend Hooded Sweatshirt, White / M
  '/mockups/moletom-branco.jpg',
  '{"x":175,"y":233,"width":350,"height":567}',
  'customizable',
  300, 360,
  1
),
(
  'quadro-tela-30x40',
  'Quadro em tela 30x40cm personalizado',
  'Impressão em tela (canvas) 12"x16" (~30x40cm), acabamento fosco.',
  23713, -- Canvas 12"x16", custo USD 24.95 x 5.16 -> BRL, x1.75/(1-0.0499)
  '5', -- Printful variant_id: Canvas 12"x16"
  '/mockups/quadro-tela-30x40.jpg',
  '{"x":175,"y":117,"width":350,"height":667}',
  'customizable',
  300, 400,
  1
),
(
  'garrafa-termica-inox',
  'Garrafa térmica de inox personalizada',
  'Garrafa inox 17oz (500ml), parede dupla, estampa ao redor.',
  18771, -- Stainless Steel Water Bottle 17oz (White), custo USD 19.75 x 5.16 -> BRL, x1.75/(1-0.0499)
  '10798', -- Printful variant_id: Stainless Steel Water Bottle 17 oz, White
  '/mockups/garrafa-termica-inox.jpg',
  '{"x":257,"y":383,"width":187,"height":233}',
  'customizable',
  180, 90,
  1
),
(
  'bone-branco',
  'Boné aba curva branco personalizado',
  'Boné dad hat Yupoong 6245CM, estampa digital frontal (DTF).',
  14969, -- Yupoong 6245CM Dad Cap (White), custo USD 15.75 x 5.16 -> BRL, x1.75/(1-0.0499)
  '7853', -- Printful variant_id: Yupoong Unstructured Classic Dad Cap 6245CM, White / One size
  '/mockups/bone-branco.jpg',
  '{"x":268,"y":433,"width":163,"height":167}',
  'customizable',
  100, 70,
  1
);
