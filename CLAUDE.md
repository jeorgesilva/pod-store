# CLAUDE.md

Contexto do projeto para o Claude Code. Ver `README.md` para setup passo a passo.

## O que é este projeto

Loja de produtos personalizados: catálogo, editor de personalização (Printful
Embedded Design Maker), checkout com Mercado Pago e criação automática do
pedido de produção na Printful. Roda como um único Cloudflare Worker (Hono)
servindo API + arquivos estáticos, com D1 (banco) e R2 (bucket ainda
declarado, hoje sem uso pelo fluxo principal — ver `Estrutura`).

## Decisões já tomadas — não reabrir sem eu pedir

- **Fornecedor de POD: Printful.** `POD_PROVIDER` em `wrangler.toml` é
  `"printful"`. `src/lib/pod/gelato.ts` (fornecedor anterior) e
  `src/lib/pod/montink.ts` (rascunho nunca usado) ficam no repo como
  histórico/referência — não em uso, não gastar tempo neles a menos que eu
  peça explicitamente para reconsiderar um dos dois.
- **Editor de personalização: Printful Embedded Design Maker (EDM)**, em
  iframe (`public/app.js` + `https://files.cdn.printful.com/embed/embed.js`).
  `public/customizer.js` (editor Fabric.js anterior) fica no repo mas fora
  do fluxo principal (não referenciado em `index.html`) — não reativar sem
  eu pedir.
- **Pagamento: Mercado Pago, Checkout Pro** (redireciona pro ambiente do
  Mercado Pago), não Checkout Transparente. Ver `src/lib/mercadopago.ts`.

## Stack

- Cloudflare Workers + Hono (roteamento) — `src/index.ts` monta tudo
- D1 (SQL) para produtos/pedidos — schema em `src/db/schema.sql`
- Frontend estático em `public/` (vanilla JS), sem build step
- Sem framework de frontend — não introduzir React/Vue sem perguntar antes

## Comandos

- `npm run dev` — sobe local com Miniflare em `localhost:8787`
- `npm run typecheck` — `tsc --noEmit`; rodar antes de qualquer commit
- `npm run db:migrate:local` / `:remote` — aplica `src/db/schema.sql`
- `npm run db:seed:local` — popula com os produtos de exemplo de `src/db/seed.sql`
- `npm run deploy` — publica no Cloudflare

## Estrutura

- `src/routes/` — um arquivo por grupo de rotas (products, checkout, orders,
  webhooks, printful)
- `src/lib/pod/` — adaptadores de fornecedor atrás da interface `PodProvider`
  (`types.ts`); `src/lib/pod/index.ts` escolhe o adaptador certo via
  `POD_PROVIDER`. `printful.ts` também exporta `verifyPrintfulTemplate`
  (valida um `product_template_id` do EDM contra a API da Printful) e o tipo
  `PrintfulWebhookPayload`.
- `src/routes/printful.ts` — `POST /api/printful/edm-nonce`: gera o nonce do
  Embedded Design Maker no backend (nunca expõe `PRINTFUL_EDM_TOKEN` pro
  cliente) e resolve o `variant_id` salvo em `products.pod_product_uid` pro
  `product_id` de catálogo que o EDM precisa (`initProduct.productId`).
- `src/lib/mercadopago.ts` — criação de preferência + verificação de assinatura do webhook
- `src/lib/artwork.ts` — helper de upload pro R2 (`saveArtworkToR2`); sem uso
  no momento (nem 'ready' nem 'customizable' fazem upload de arte hoje —
  'ready' usa `default_artwork_url` fixo, 'customizable' usa o
  `product_template_id` do EDM), mantido no repo caso volte a ser necessário.
- `public/customizer.js` — classe `ProductCustomizer` (Fabric.js), fora do
  fluxo principal, ver "Decisões já tomadas".
- **Fluxo do Embedded Design Maker**: `app.js` chama
  `POST /api/printful/edm-nonce` → instancia `PFDesignMaker` no
  `#printful-designer` → `onTemplateSaved(templateId)` guarda o id no
  carrinho → `POST /api/checkout` valida esse `templateId` com
  `verifyPrintfulTemplate` antes de gravar o pedido → `pod_template_id`
  (não `artwork_url`) vai pro adaptador Printful na criação do pedido real.

## Convenções

- **Nunca confiar em preço vindo do cliente.** `checkout.ts` sempre recalcula o
  total a partir do `base_price_cents` gravado no D1.
- **Nunca confiar numa referência de design vinda do cliente sem validar no
  servidor** — mesmo princípio do preço, aplicado ao `product_template_id`
  que volta do EDM: `checkout.ts` sempre chama `verifyPrintfulTemplate`
  antes de usar o id (confirma que o template pertence à nossa conta
  Printful) e produtos `'ready'` sempre usam `default_artwork_url` do D1,
  nunca uma URL vinda do cliente.
- Segredos (chaves de API, tokens) só via `wrangler secret put` / `.dev.vars`
  local — nunca em `wrangler.toml` nem hardcoded no código, e nunca colados
  direto no chat/terminal se der pra evitar (fica no histórico). `.dev.vars`
  já está no `.gitignore`.
- `orders.id` é usado como `external_id` na Printful e como
  `external_reference` no Mercado Pago — é assim que os webhooks reencontram
  o pedido no D1. Não trocar por um id diferente em só um dos dois lados.
- `order_items` tem `artwork_url` e `pod_template_id`, mutuamente exclusivos:
  `artwork_url` pra produtos `'ready'`, `pod_template_id` pra `'customizable'`
  (EDM). Nunca os dois preenchidos na mesma linha.
- Produto novo: `products.pod_product_uid` guarda o `variant_id` numérico do
  catálogo da Printful (não mais o `productUid` da Gelato). `print_area_json`
  / `print_width_mm` / `print_height_mm` só são usados pelo `customizer.js`
  legado (fora do fluxo principal) — o EDM calcula área de impressão sozinho.
- 2 espaços de indentação, sempre `async/await` (nunca `.then()`), sem
  bibliotecas de data (usar `Date`/`datetime('now')` do SQLite mesmo).

## Testando localmente

Validado até aqui com `npm run typecheck` (catálogo, rotas de produto e
arquivos estáticos já tinham sido exercitados com `wrangler dev` local antes
da migração pra Printful). As chamadas reais à API da Printful (Orders API,
Embedded Design Maker) e do Mercado Pago **ainda não foram testadas**
(exigem credenciais reais e configuração manual no painel da Printful — ver
`README.md`) — confira o comportamento contra a documentação oficial linkada
nos comentários de `printful.ts` e `mercadopago.ts` se algo não bater.

O schema local (`order_items.pod_template_id`, `artwork_url` agora nullable)
mudou nesta migração; se você já tinha rodado `db:migrate:local` antes,
recrie o D1 local (não há sistema de migrations neste projeto, só
`schema.sql` idempotente) — ver `README.md`.

Ao rodar `wrangler dev`, um aviso `Unable to fetch the Request.cf object` no
console é esperado e inofensivo.

## Próximos passos conhecidos

- Ver "Pendências da migração Gelato → Printful" no `README.md` — token de
  produção do EDM, allowlist de domínio, registro do webhook.
- `pod_product_uid`, `base_price_cents` e os mockups em `public/mockups/*.jpg`
  do `seed.sql` já foram substituídos por produtos reais da Printful Catalog
  API (2026-07-08): variant_id real, foto real do produto, custo convertido
  de USD pra BRL na cotação do dia aplicando a fórmula de
  `base_price_cents` (ver `CLAUDE.md` acima). Cotação USD/BRL usada foi
  ~5.16 — reconferir se for recalcular preços depois, a taxa muda.
  `print_area_json` foi reescalado pro tamanho real das fotos (700x1000px)
  mas continua sendo estimativa (só usada pelo `customizer.js` legado).
- Resolver CNPJ/MEI e emissão de nota fiscal antes de abrir para clientes reais.
