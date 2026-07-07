# CLAUDE.md

Contexto do projeto para o Claude Code. Ver `README.md` para setup passo a passo.

## O que é este projeto

Loja de produtos personalizados: catálogo, editor de personalização (Fabric.js),
checkout com Mercado Pago e criação automática do pedido de produção na Gelato.
Roda como um único Cloudflare Worker (Hono) servindo API + arquivos estáticos,
com D1 (banco) e R2 (arquivo de arte final).

## Decisões já tomadas — não reabrir sem eu pedir

- **Fornecedor de POD: Gelato.** `POD_PROVIDER` em `wrangler.toml` é `"gelato"`.
  `src/lib/pod/montink.ts` existe como rascunho de um fornecedor alternativo,
  mas está fora de uso — não gastar tempo terminando os `TODO` de lá a menos
  que eu peça explicitamente para reconsiderar a Montink.
- **Pagamento: Mercado Pago, Checkout Pro** (redireciona pro ambiente do
  Mercado Pago), não Checkout Transparente. Ver `src/lib/mercadopago.ts`.

## Stack

- Cloudflare Workers + Hono (roteamento) — `src/index.ts` monta tudo
- D1 (SQL) para produtos/pedidos — schema em `src/db/schema.sql`
- R2 para a arte final gerada pelo cliente — `src/lib/artwork.ts`
- Frontend estático em `public/` (vanilla JS + Fabric.js), sem build step
- Sem framework de frontend — não introduzir React/Vue sem perguntar antes

## Comandos

- `npm run dev` — sobe local com Miniflare em `localhost:8787`
- `npm run typecheck` — `tsc --noEmit`; rodar antes de qualquer commit
- `npm run db:migrate:local` / `:remote` — aplica `src/db/schema.sql`
- `npm run db:seed:local` — popula com os produtos de exemplo de `src/db/seed.sql`
- `npm run deploy` — publica no Cloudflare

## Estrutura

- `src/routes/` — um arquivo por grupo de rotas (products, checkout, orders, webhooks)
- `src/lib/pod/` — adaptadores de fornecedor atrás da interface `PodProvider`
  (`types.ts`); `src/lib/pod/index.ts` escolhe o adaptador certo via `POD_PROVIDER`
- `src/lib/mercadopago.ts` — criação de preferência + verificação de assinatura do webhook
- `src/lib/artwork.ts` — decodifica o PNG exportado do canvas e sobe pro R2
- `public/customizer.js` — classe `ProductCustomizer` (Fabric.js); ao finalizar,
  exporta só a área de impressão, com o mockup escondido, não o canvas inteiro

## Convenções

- **Nunca confiar em preço vindo do cliente.** `checkout.ts` sempre recalcula o
  total a partir do `base_price_cents` gravado no D1.
- Segredos (chaves de API, tokens) só via `wrangler secret put` / `.dev.vars`
  local — nunca em `wrangler.toml` nem hardcoded no código. `.dev.vars` já
  está no `.gitignore`.
- `orders.id` é usado como `orderReferenceId` na Gelato e como
  `external_reference` no Mercado Pago — é assim que os webhooks reencontram
  o pedido no D1. Não trocar por um id diferente em só um dos dois lados.
- Produto novo: `print_area_json` é em pixels da imagem do mockup (não da
  tela), no mesmo padrão usado em `src/db/seed.sql`.
- 2 espaços de indentação, sempre `async/await` (nunca `.then()`), sem
  bibliotecas de data (usar `Date`/`datetime('now')` do SQLite mesmo).

## Testando localmente

Validado até aqui com `npm run typecheck` e `wrangler dev` local (D1/R2
simulados pelo Miniflare): catálogo, rotas de produto e arquivos estáticos
funcionam. As chamadas reais à API da Gelato e do Mercado Pago **ainda não
foram testadas** (exigem credenciais reais) — confira o comportamento contra
a documentação oficial linkada nos comentários de `gelato.ts` e
`mercadopago.ts` se algo não bater.

Ao rodar `wrangler dev`, um aviso `Unable to fetch the Request.cf object` no
console é esperado e inofensivo.

## Próximos passos conhecidos

- Configurar o webhook da Gelato (Dashboard → Developers → Webhooks) apontando
  para `https://SEU-DOMINIO/api/webhooks/pod` depois do deploy.
- Trocar os mockups placeholder (`public/mockups/*.svg`) por fotos reais e
  ajustar o `print_area_json` de cada produto.
- Resolver CNPJ/MEI e emissão de nota fiscal antes de abrir para clientes reais.
