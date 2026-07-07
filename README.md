# pod-store — esqueleto Cloudflare + Mercado Pago + Gelato/Montink

Esqueleto funcional de uma loja de produtos personalizados: catálogo, editor
de personalização (Fabric.js), checkout com Mercado Pago e criação automática
do pedido de produção no Gelato ou na Montink. Roda inteiro como um único
Cloudflare Worker (API + arquivos estáticos), com D1 (banco) e R2 (arte final).

## O que já funciona

- `GET /api/products`, `GET /api/products/:id` — catálogo lido do D1
- Editor de personalização com Fabric.js: enviar foto, adicionar texto,
  mover/redimensionar/girar, com uma área de impressão marcada no mockup.
  Ao finalizar, exporta **só** a área de impressão (sem o mockup) como PNG.
- `POST /api/checkout` — valida produtos e preço no servidor (nunca confia
  no preço vindo do navegador), grava o pedido no D1, sobe a arte pro R2,
  cria a preferência de pagamento no Mercado Pago (Checkout Pro) e devolve
  a URL de pagamento.
- `POST /api/webhooks/mercadopago` — confirma o pagamento (com verificação
  de assinatura), marca o pedido como pago e dispara a criação do pedido
  no fornecedor de POD configurado.
- `POST /api/webhooks/pod` — recebe atualização de status da Gelato e
  atualiza o pedido no D1.
- Adaptador **Gelato** completo, seguindo a documentação oficial da API v4.
- Interface comum (`src/lib/pod/types.ts`) que deixa Gelato e Montink
  intercambiáveis — troque `POD_PROVIDER` no `wrangler.toml` e pronto.

## O que está incompleto de propósito

- **Adaptador Montink** (`src/lib/pod/montink.ts`) é um rascunho. A Montink
  não publica a documentação completa da API antes de você criar conta —
  o arquivo tem comentários `TODO` marcando exatamente o que confirmar
  (URL base, nome do header de autenticação, nomes dos campos) assim que
  você tiver acesso real à documentação deles.
- **Checkout Pro do Mercado Pago** (redireciona o cliente pro ambiente do
  Mercado Pago) em vez do Checkout Transparente — é o caminho mais simples
  e seguro pra começar. Se quiser manter o cliente 100% no seu site depois,
  dá pra migrar `src/lib/mercadopago.ts` pro fluxo transparente.
- **Design visual**: layout limpo e funcional, mas genérico de propósito —
  troque as cores em `public/style.css` (`:root`) e os mockups em
  `public/mockups/` (hoje são placeholders em SVG) pela identidade real
  da sua marca.
- Sem autenticação de admin, sem painel pra cadastrar produtos pela UI
  (cadastre direto no D1 por enquanto — veja `src/db/seed.sql`).
- Sem clamping rígido dos objetos na área de impressão (o usuário pode
  arrastar pra fora; a área tracejada é um guia visual, e só o que está
  dentro dela é exportado — mas nada impede o usuário de deixar a foto
  cortada nas bordas).

## Configurar

```bash
npm install

# Cria o banco D1 e o bucket R2 (uma vez só)
wrangler d1 create pod-store-db        # copie o database_id pro wrangler.toml
wrangler r2 bucket create pod-store-artwork
# Habilite acesso público ao bucket (ou um domínio custom) e cole a URL
# pública em PUBLIC_ARTWORK_BASE_URL no wrangler.toml:
# https://developers.cloudflare.com/r2/buckets/public-buckets/

npm run db:migrate:local
npm run db:seed:local

cp .dev.vars.example .dev.vars   # preencha com chaves de teste/sandbox
npm run dev
```

Abra `http://localhost:8787`.

### Variáveis e segredos

| Nome | Onde | O que é |
|---|---|---|
| `POD_PROVIDER` | `wrangler.toml` [vars] | `"gelato"` ou `"montink"` |
| `PUBLIC_ARTWORK_BASE_URL` | `wrangler.toml` [vars] | URL pública do bucket R2 |
| `GELATO_API_KEY` | secret | Dashboard da Gelato → API (use a chave sandbox pra testar — pedidos de sandbox são cancelados automaticamente, não são impressos) |
| `MONTINK_API_KEY` | secret | Painel da Montink, depois de habilitar o plano Integra |
| `MERCADOPAGO_ACCESS_TOKEN` | secret | Painel do Mercado Pago → credenciais (use as `TEST-...` primeiro) |
| `MERCADOPAGO_WEBHOOK_SECRET` | secret | Painel do Mercado Pago → Webhooks → chave secreta |

Em produção, segredos vão com `wrangler secret put NOME` — nunca no
`wrangler.toml` nem no `.dev.vars` (que já está no `.gitignore`).

## Publicar

```bash
npm run db:migrate:remote
npm run deploy
```

Depois, configure no painel de cada fornecedor:
- **Mercado Pago**: nada a configurar manualmente — a `notification_url`
  já vai junto de cada preferência criada em `checkout.ts`.
- **Gelato**: Dashboard → Developers → Webhooks → aponte para
  `https://SEU-DOMINIO/api/webhooks/pod`.

## Próximos passos sugeridos

1. Preencher os `TODO` do adaptador Montink assim que tiver a documentação
   real (ou seguir só com Gelato pra validar o fluxo inteiro primeiro).
2. Trocar os mockups placeholder por fotos reais dos produtos e ajustar
   `print_area_json` de cada um (coordenadas em pixels da imagem do mockup).
3. Decidir CNPJ/MEI e emissão de nota fiscal (ex: integrar Bling, se for
   de Montink) — isso fica fora do código, é configuração de conta.
4. Testar o fluxo completo de ponta a ponta com valores baixos antes de
   abrir pra clientes de verdade.
