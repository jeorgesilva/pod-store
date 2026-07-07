const state = {
  products: [],
  cart: [], // { productId, name, unitPriceCents, quantity, artworkDataUrl, previewDataUrl, customization }
  currentCustomizer: null,
  currentProduct: null,
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
async function loadProducts() {
  const grid = document.getElementById("product-grid");
  try {
    const res = await fetch("/api/products");
    const { products } = await res.json();
    state.products = products;

    grid.innerHTML = "";
    for (const product of products) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "product-card";
      card.innerHTML = `
        <img src="${product.mockup_image_url ?? ""}" alt="${product.name}" />
        <div class="product-card-body">
          <h3>${product.name}</h3>
          <p class="price">${formatCents(product.base_price_cents)}</p>
          ${product.product_type === "ready" ? '<p class="muted">Pronto, sem personalização</p>' : ""}
        </div>`;
      card.addEventListener("click", () =>
        product.product_type === "ready" ? openReadyProduct(product) : openCustomizer(product)
      );
      grid.appendChild(card);
    }
  } catch (err) {
    grid.innerHTML = `<p class="hint">Não foi possível carregar os produtos. (${err.message})</p>`;
  }
}

// -------------------------------------------------------------- customize
function openCustomizer(product) {
  state.currentProduct = product;
  document.getElementById("customize-product-name").textContent = product.name;
  document.getElementById("customize-product-price").textContent = formatCents(product.base_price_cents);
  document.getElementById("quantity-input").value = 1;

  const printArea = JSON.parse(product.print_area_json);
  state.currentCustomizer = new ProductCustomizer("fabric-canvas", {
    mockupUrl: product.mockup_image_url,
    printArea,
    printPhysicalSize:
      product.print_width_mm && product.print_height_mm
        ? { widthMm: product.print_width_mm, heightMm: product.print_height_mm }
        : null,
    minDpi: 300,
    onQualityChange: updateQualityWarning,
  });

  updateQualityWarning();
  showView("customize");
}

/** Blocks "Adicionar ao carrinho" while any uploaded image is below 300 DPI. */
function updateQualityWarning() {
  const warningEl = document.getElementById("quality-warning");
  const addButton = document.getElementById("add-to-cart-button");
  const issues = state.currentCustomizer?.getImageQualityIssues() ?? [];

  if (issues.length === 0) {
    warningEl.hidden = true;
    addButton.disabled = false;
  } else {
    const worst = Math.min(...issues.map((i) => i.dpi));
    warningEl.textContent = `Imagem com resolução baixa (~${worst} DPI) — pode sair borrada na impressão. Use uma imagem maior ou diminua o tamanho dela na área tracejada.`;
    warningEl.hidden = false;
    addButton.disabled = true;
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
    artworkDataUrl: null,
    previewDataUrl: state.currentProduct.mockup_image_url,
    customization: null,
  });

  updateCartCount();
  showView("catalog");
});

document.getElementById("upload-image").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) state.currentCustomizer.addImageFromFile(file);
  e.target.value = "";
});

document.querySelector('[data-action="add-text"]').addEventListener("click", () => {
  const color = document.getElementById("text-color").value;
  state.currentCustomizer.addText("Seu texto aqui", color);
});

document.getElementById("text-color").addEventListener("input", (e) => {
  state.currentCustomizer.setSelectedTextColor(e.target.value);
});

document.querySelector('[data-action="remove-selected"]').addEventListener("click", () => {
  state.currentCustomizer.removeSelected();
});

document.getElementById("add-to-cart-button").addEventListener("click", () => {
  const { dataUrl, canvasJson } = state.currentCustomizer.exportPrintFile();
  const quantity = Math.max(1, parseInt(document.getElementById("quantity-input").value, 10) || 1);

  state.cart.push({
    productId: state.currentProduct.id,
    name: state.currentProduct.name,
    unitPriceCents: state.currentProduct.base_price_cents,
    quantity,
    artworkDataUrl: dataUrl,
    previewDataUrl: dataUrl,
    customization: canvasJson,
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
      artworkDataUrl: item.artworkDataUrl,
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
