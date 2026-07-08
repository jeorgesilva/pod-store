# pod-store — esqueleto Cloudflare + Mercado Pago + Printful

Esqueleto funcional de uma loja de produtos personalizados: catálogo, editor
de personalização (Printful Embedded Design Maker), checkout com Mercado
Pago e criação automática do pedido de produção na Printful. Roda inteiro
como um único Cloudflare Worker (API + arquivos estáticos), com D1 (banco).

## O que já funciona

- `GET /api/products`, `GET /api/products/:id` — catálogo lido do D1
- Editor de personalização com o **Embedded Design Maker (EDM) da
  Printful**, em iframe: `POST /api/printful/edm-nonce` gera um nonce no
  backend (nunca expõe o token da Printful pro navegador) e o frontend abre
  o editor oficial da Printful — upload de imagem, texto, posicionamento,
  variantes (cor/tamanho), tudo dentro do iframe. Ao salvar, a Printful
  retorna um `templateId`, que é o que efetivamente vai pro pedido — nunca
  um arquivo exportado no navegador.
- `POST /api/checkout` — valida produtos e preço no servidor (nunca confia
  no preço vindo do navegador), valida o `templateId` do EDM contra a conta
  Printful (nunca confia numa referência de design vinda do cliente sem
  checar), grava o pedido no D1, cria a preferência de pagamento no Mercado
  Pago (Checkout Pro) e devolve a URL de pagamento.
- `POST /api/webhooks/mercadopago` — confirma o pagamento (com verificação
  de assinatura), marca o pedido como pago e dispara a criação do pedido
  na Printful.
- `POST /api/webhooks/pod` — recebe atualização de status da Printful
  (`order_created`/`order_updated`/`order_failed`/`order_canceled`/
  `package_shipped`) e atualiza o pedido no D1.
- Adaptador **Printful** completo (`src/lib/pod/printful.ts`), seguindo a
  documentação oficial da Orders API (v1) e do Embedded Design Maker.
- Interface comum (`src/lib/pod/types.ts`) — os adaptadores **Gelato** e
  **Montink** (fornecedor anterior e um rascunho nunca usado) continuam no
  repo, fora de uso, só como referência. Ver "Decisões já tomadas" no
  `CLAUDE.md` antes de reconsiderar qualquer um dos dois.

## O que está incompleto de propósito

- **Catálogo** (`src/db/seed.sql`): os 8 produtos usam `variant_id` reais
  do catálogo da Printful e `base_price_cents` calculado em cima do custo
  real (USD convertido a BRL na cotação do dia da importação, 2026-07-08)
  — reconferir/recalcular se for adicionar produto novo ou se a cotação
  do dólar tiver mudado muito.
- **Editor Fabric.js** (`public/customizer.js`) fica no repo mas fora do
  fluxo principal — não é mais chamado de `index.html`/`app.js`. O editor
  ativo agora é o Embedded Design Maker da Printful.
- **Checkout Pro do Mercado Pago** (redireciona o cliente pro ambiente do
  Mercado Pago) em vez do Checkout Transparente — é o caminho mais simples
  e seguro pra começar. Se quiser manter o cliente 100% no seu site depois,
  dá pra migrar `src/lib/mercadopago.ts` pro fluxo transparente.
- **Design visual**: layout limpo e funcional, mas genérico de propósito —
  troque as cores em `public/style.css` (`:root`) pela identidade real da
  sua marca. Os mockups em `public/mockups/` já são fotos reais dos
  produtos (baixadas do catálogo da Printful).
- Sem autenticação de admin, sem painel pra cadastrar produtos pela UI
  (cadastre direto no D1 por enquanto — veja `src/db/seed.sql`).
- Sem mapeamento de "entregue" (`delivered`): a Printful não manda um
  webhook de confirmação de entrega, só de despacho (`package_shipped`) —
  ver "Pendências" abaixo.

## Configurar

```bash
npm install

# Cria o banco D1 (uma vez só)
wrangler d1 create pod-store-db        # copie o database_id pro wrangler.toml

npm run db:migrate:local
npm run db:seed:local

cp .dev.vars.example .dev.vars   # preencha com chaves de teste/sandbox
npm run dev
```

Abra `http://localhost:8787`.

> Se você já tinha rodado `db:migrate:local` **antes** desta migração pra
> Printful, o schema local está desatualizado (`order_items` ganhou a coluna
> `pod_template_id` e `artwork_url` virou opcional). Como este projeto não
> tem um sistema de migrations — só `schema.sql` idempotente — apague o
> estado local do D1 (`rm -rf .wrangler/state` ou recrie o banco) e rode
> `db:migrate:local`/`db:seed:local` de novo.

### Tokens da Printful

A Printful recomenda **dois tokens separados** para o Embedded Design Maker
— um marcado **"development purposes only"** pra uso local, outro só pra
produção — além de um terceiro token comum pra Orders API. É o setup mais
seguro (o token de dev nunca chega perto de pedidos reais).

Neste projeto, `.dev.vars` está configurado hoje com **um único token com
todas as extensões habilitadas** (inclusive Embedded Designer) reaproveitado
tanto em `PRINTFUL_API_KEY` quanto em `PRINTFUL_EDM_TOKEN`, por escolha do
usuário. Funciona, mas com uma ressalva: como esse token não tem a flag
"development purposes only", não existe uma rede de segurança de sandbox —
designs e pedidos de teste feitos localmente batem na conta Printful de
verdade. Ao publicar em produção, considere trocar `PRINTFUL_EDM_TOKEN` (via
`wrangler secret put`) por um token de produção dedicado, sem a flag de dev,
seguindo a recomendação oficial acima.

> **Pendência manual (painel da Printful, não dá pra automatizar por
> código):** em qualquer token com a extensão Embedded Design Maker, preencha
> a seção **"Domains"** com os domínios autorizados a abrir o iframe — pro
> uso local, algo como `localhost:8787`; pro de produção, o domínio real do
> site. Sem isso a Printful ignora as mensagens do iframe.

### Registrar o webhook da Printful

Ao contrário da Gelato, a Printful (pra uma loja "manual order"/API, sem
sincronização com uma plataforma de e-commerce) não tem uma tela de
webhooks no painel — o registro é feito com uma chamada à API, uma vez,
depois do deploy:

```bash
curl -X POST https://api.printful.com/webhooks \
  -H "Authorization: Bearer $PRINTFUL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://SEU-DOMINIO/api/webhooks/pod",
    "types": ["order_created", "order_updated", "order_failed", "order_canceled", "package_shipped"]
  }'
```

(Só uma URL de webhook fica ativa por vez — chamar de novo substitui a
anterior.)

### Variáveis e segredos

| Nome | Onde | O que é |
|---|---|---|
| `POD_PROVIDER` | `wrangler.toml` [vars] | `"printful"` (`"gelato"`/`"montink"` só por compatibilidade histórica) |
| `PRINTFUL_API_KEY` | secret | Orders API — ver "Criar os tokens da Printful" acima |
| `PRINTFUL_EDM_TOKEN` | secret | Embedded Design Maker — token **diferente** por ambiente (dev vs produção), ver acima |
| `MERCADOPAGO_ACCESS_TOKEN` | secret | Painel do Mercado Pago → credenciais (use as `TEST-...` primeiro) |
| `MERCADOPAGO_WEBHOOK_SECRET` | secret | Painel do Mercado Pago → Webhooks → chave secreta |

Em produção, segredos vão com `wrangler secret put NOME` — nunca no
`wrangler.toml` nem no `.dev.vars` (que já está no `.gitignore`), e evite
colar tokens direto no chat/terminal quando der pra evitar (fica no
histórico da conversa/shell).

## Publicar

```bash
npm run db:migrate:remote
npm run deploy
```

Depois, configure no painel de cada fornecedor:
- **Mercado Pago**: nada a configurar manualmente — a `notification_url`
  já vai junto de cada preferência criada em `checkout.ts`.
- **Printful**: registre o webhook (ver "Registrar o webhook da Printful"
  acima) e confirme o domínio de produção na allowlist do token de
  Embedded Design Maker.

## Pendências da migração Gelato → Printful

- **Catálogo real**: já importado (2026-07-08) — `pod_product_uid` de
  cada produto em `src/db/seed.sql` é um `variant_id` real da Printful
  Catalog API, `base_price_cents` usa o custo real de cada variant, e os
  mockups em `public/mockups/*.jpg` são fotos reais. Revisitar só se
  adicionar produto novo ou se a cotação USD/BRL tiver mudado muito desde
  então.
- **Tokens do Embedded Design Maker**: criar os dois tokens (dev e
  produção) e preencher a allowlist de domínios — ver acima.
- **Registrar o webhook** depois do primeiro deploy — ver acima.
- **"Entregue" nunca é alcançado automaticamente**: a Printful não expõe um
  webhook de confirmação de entrega (só `package_shipped`, com tracking).
  `orders.status` fica em `'shipped'` até alguém atualizar manualmente, ou
  seguir a `tracking_url` do pedido.
- Decidir CNPJ/MEI e emissão de nota fiscal — isso fica fora do código, é
  configuração de conta.
- Testar o fluxo completo de ponta a ponta com valores baixos antes de
  abrir pra clientes de verdade — as chamadas reais à Orders API e ao EDM
  da Printful ainda não foram exercitadas (exigem os tokens reais acima).
