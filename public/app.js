const state = {
  products: [],
  cart: [], // { productId, name, unitPriceCents, quantity, printfulTemplateId, previewDataUrl, customization }
  currentDesigner: null,
  currentProduct: null,
  printfulTemplateId: null,
};

const views = {
  catalog: document.getElementById("view-catalog"),
  customize: document.getElementById("view-customize"),
  ready: document.getElementById("view-ready"),
  cart: document.getElementById("view-cart"),
};

function showView(name) {
  for (const key of Object.keys(views)) {
    views[key].hidden = key !== name;
  }
}

function formatCents(cents) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------- catalog
const FEATURED_COUNT = 6; // no admin "featured" flag yet — take the N most recent

async function loadProducts() {
  const grid = document.getElementById("product-grid");
  const carousel = document.getElementById("featured-carousel");
  try {
    const res = await fetch("/api/products");
    const { products } = await res.json();
    state.products = products;

    grid.innerHTML = "";
    for (const product of products) {
      grid.appendChild(buildProductCard(product, { lazy: true }));
    }

    carousel.innerHTML = "";
    for (const product of products.slice(0, FEATURED_COUNT)) {
      carousel.appendChild(buildProductCard(product, { lazy: false, variant: "carousel" }));
    }

    injectProductListStructuredData(products);
  } catch (err) {
    grid.innerHTML = `<p class="hint">Não foi possível carregar os produtos. (${err.message})</p>`;
  }
}

function buildProductCard(product, { lazy, variant } = {}) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = variant === "carousel" ? "product-card carousel-card" : "product-card";
  card.innerHTML = `
    <img src="${product.mockup_image_url ?? ""}" alt="${product.name}" width="440" height="440"
      loading="${lazy ? "lazy" : "eager"}" decoding="async" />
    <div class="product-card-body">
      <h3>${product.name}</h3>
      <p class="price">${formatCents(product.base_price_cents)}</p>
      ${product.product_type === "ready" ? '<p class="muted">Pronto, sem personalização</p>' : ""}
    </div>`;
  card.addEventListener("click", () =>
    product.product_type === "ready" ? openReadyProduct(product) : openCustomizer(product)
  );
  return card;
}

/** Product/ItemList structured data (SEO rich results) — built from the
 *  same product list rendered on screen, never duplicated/hand-maintained. */
function injectProductListStructuredData(products) {
  const existing = document.getElementById("product-list-ld");
  if (existing) existing.remove();

  const script = document.createElement("script");
  script.id = "product-list-ld";
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: product.name,
        description: product.description ?? undefined,
        image: product.mockup_image_url
          ? new URL(product.mockup_image_url, window.location.origin).href
          : undefined,
        offers: {
          "@type": "Offer",
          priceCurrency: "BRL",
          price: (product.base_price_cents / 100).toFixed(2),
          availability: "https://schema.org/InStock",
        },
      },
    })),
  });
  document.head.appendChild(script);
}

// -------------------------------------------------------------- carousel
const featuredCarousel = document.getElementById("featured-carousel");
document.querySelector("[data-carousel-prev]").addEventListener("click", () => {
  featuredCarousel.scrollBy({ left: -featuredCarousel.clientWidth * 0.8, behavior: "smooth" });
});
document.querySelector("[data-carousel-next]").addEventListener("click", () => {
  featuredCarousel.scrollBy({ left: featuredCarousel.clientWidth * 0.8, behavior: "smooth" });
});

// -------------------------------------------------------------- customize
function openCustomizer(product) {
  state.currentProduct = product;
  state.printfulTemplateId = null;
  document.getElementById("customize-product-name").textContent = product.name;
  document.getElementById("customize-product-price").textContent = formatCents(product.base_price_cents);
  document.getElementById("quantity-input").value = 1;
  document.getElementById("add-to-cart-button").disabled = true;

  showView("customize");
  openPrintfulDesigner(product);
}

/** Loads the Printful EDM SDK on first use only — most visits never open
 *  the customizer, no reason to ship this on every page load. Cached so
 *  reopening the editor doesn't re-insert the script tag. */
let embedScriptPromise = null;
function loadPrintfulEmbedScript() {
  if (!embedScriptPromise) {
    embedScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://files.cdn.printful.com/embed/embed.js";
      script.onload = resolve;
      script.onerror = () => {
        embedScriptPromise = null; // allow retrying on a later attempt
        reject(new Error("printful_embed_script_failed"));
      };
      document.body.appendChild(script);
    });
  }
  return embedScriptPromise;
}

/**
 * Mints a nonce from our own backend (never exposes PRINTFUL_EDM_TOKEN to
 * the browser) and opens the Printful Embedded Design Maker iframe for
 * this product. The design reference (templateId) returned by
 * onTemplateSaved is what actually gets sent to /api/checkout — never a
 * client-exported file.
 */
async function openPrintfulDesigner(product) {
  const container = document.getElementById("printful-designer");
  const statusEl = document.getElementById("design-status");
  container.innerHTML = "";
  statusEl.textContent = "Carregando editor…";

  try {
    const [nonceRes] = await Promise.all([
      fetch("/api/printful/edm-nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      }),
      loadPrintfulEmbedScript(),
    ]);
    const data = await nonceRes.json();
    if (!nonceRes.ok) throw new Error(data.error ?? "edm_nonce_failed");

    statusEl.textContent = "";
    state.currentDesigner = new PFDesignMaker({
      elemId: "printful-designer",
      nonce: data.nonce,
      externalProductId: data.externalProductId,
      initProduct: { productId: data.printfulCatalogProductId },
      onTemplateSaved: (templateId) => {
        state.printfulTemplateId = templateId;
        document.getElementById("add-to-cart-button").disabled = false;
        statusEl.textContent = "Design salvo — pronto para adicionar ao carrinho.";
      },
      onError: (err) => {
        statusEl.textContent = `Erro no editor. (${err?.message ?? "desconhecido"})`;
      },
    });
  } catch (err) {
    statusEl.textContent = `Não foi possível carregar o editor. (${err.message})`;
  }
}

// ---------------------------------------------------------- ready product
function openReadyProduct(product) {
  state.currentProduct = product;
  document.getElementById("ready-product-name").textContent = product.name;
  document.getElementById("ready-product-price").textContent = formatCents(product.base_price_cents);
  document.getElementById("ready-product-image").src = product.mockup_image_url ?? "";
  document.getElementById("ready-quantity-input").value = 1;
  showView("ready");
}

document.getElementById("ready-add-to-cart-button").addEventListener("click", () => {
  const quantity = Math.max(1, parseInt(document.getElementById("ready-quantity-input").value, 10) || 1);

  state.cart.push({
    productId: state.currentProduct.id,
    name: state.currentProduct.name,
    unitPriceCents: state.currentProduct.base_price_cents,
    quantity,
    previewDataUrl: state.currentProduct.mockup_image_url,
    customization: null,
  });

  updateCartCount();
  showView("catalog");
});

document.getElementById("add-to-cart-button").addEventListener("click", () => {
  if (!state.printfulTemplateId) return; // guarded by disabled state too
  const quantity = Math.max(1, parseInt(document.getElementById("quantity-input").value, 10) || 1);

  state.cart.push({
    productId: state.currentProduct.id,
    name: state.currentProduct.name,
    unitPriceCents: state.currentProduct.base_price_cents,
    quantity,
    printfulTemplateId: state.printfulTemplateId,
    previewDataUrl: state.currentProduct.mockup_image_url,
    customization: null,
  });

  updateCartCount();
  showView("catalog");
});

// -------------------------------------------------------------------- cart
function updateCartCount() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById("cart-count").textContent = String(count);
}

function renderCart() {
  const container = document.getElementById("cart-items");
  const emptyMsg = document.getElementById("cart-empty");
  container.innerHTML = "";

  if (state.cart.length === 0) {
    emptyMsg.hidden = false;
  } else {
    emptyMsg.hidden = true;
    state.cart.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <img src="${item.previewDataUrl}" alt="${item.name} personalizado" />
        <div class="cart-item-info">
          <p>${item.name}</p>
          <p class="muted">Qtd: ${item.quantity} &middot; ${formatCents(item.unitPriceCents)} cada</p>
        </div>
        <button type="button" class="tool-button" data-remove-index="${index}">Remover</button>`;
      container.appendChild(row);
    });
    container.querySelectorAll("[data-remove-index]").forEach((button) => {
      button.addEventListener("click", () => {
        state.cart.splice(Number(button.dataset.removeIndex), 1);
        updateCartCount();
        renderCart();
      });
    });
  }

  const total = state.cart.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  document.getElementById("cart-total").textContent = formatCents(total);
}

document.getElementById("cart-button").addEventListener("click", () => {
  renderCart();
  showView("cart");
});

document.querySelectorAll('[data-action="back-to-catalog"]').forEach((button) => {
  button.addEventListener("click", () => showView("catalog"));
});

// --------------------------------------------------------------- checkout
document.getElementById("checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("checkout-error");
  errorEl.hidden = true;

  if (state.cart.length === 0) {
    errorEl.textContent = "Seu carrinho está vazio.";
    errorEl.hidden = false;
    return;
  }

  const form = new FormData(event.target);
  const payload = {
    customer: {
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone") || undefined,
    },
    shippingAddress: {
      addressLine1: form.get("addressLine1"),
      addressLine2: form.get("addressLine2") || undefined,
      city: form.get("city"),
      state: form.get("state"),
      postCode: form.get("postCode"),
      country: "BR",
    },
    items: state.cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      printfulTemplateId: item.printfulTemplateId,
      customization: item.customization,
    })),
  };

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "checkout_failed");

    window.location.href = data.checkoutUrl; // off to Mercado Pago
  } catch (err) {
    errorEl.textContent = `Não foi possível iniciar o pagamento. (${err.message})`;
    errorEl.hidden = false;
  }
});

loadProducts();
