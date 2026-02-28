(() => {
  const ROOT_ID = "adgent-banner-root";
  const SIDE_BANNER_ID = "adgent-banner";
  const POSTS_INTERVAL = 12;
  const isReddit = /(^|\.)reddit\.com$/.test(window.location.hostname);

  if (!isReddit) {
    return;
  }

  const staleRoot = document.getElementById(ROOT_ID);
  if (staleRoot) {
    staleRoot.remove();
  }

  // Products sourced from nvidia-catalog/catalog.json (RTX 50-series, real pricing & images)
  const hardcodedProducts = [
    {
      id: "rtx-5090",
      name: "NVIDIA GeForce RTX 5090",
      price: "$1,999.99",
      discount: "N/A",
      delivery: "1-3 business days",
      availability: "Check availability",
      category: "gpu",
      badge: "Flagship",
      thumbnailUrl: "https://assets.nvidia.partners/images/png/RTX5090FE_gallery-A_3x4.png",
      suggestions: [
        { label: "Full details", prompt: "Show me the full details and image of the NVIDIA RTX 5090." },
        { label: "Check stock", prompt: "Is the RTX 5090 in stock anywhere right now?" },
        { label: "Compare vs 5080", prompt: "Compare the RTX 5090 vs RTX 5080 side by side." },
        { label: "Active deals", prompt: "Are there any deals or bundles on the RTX 5090?" }
      ]
    },
    {
      id: "rtx-5080",
      name: "NVIDIA GeForce RTX 5080",
      price: "$999.99",
      discount: "N/A",
      delivery: "1-3 business days",
      availability: "Check availability",
      category: "gpu",
      badge: "Best Seller",
      thumbnailUrl: "https://assets.nvidia.partners/images/90YV0LV0-MVAA00-preview.webp",
      suggestions: [
        { label: "Full details", prompt: "Show me the full details and image of the RTX 5080." },
        { label: "Check retailers", prompt: "Which retailer has the RTX 5080 cheapest?" },
        { label: "Compare vs 5090", prompt: "How does the RTX 5080 compare to the RTX 5090?" },
        { label: "Add to cart", prompt: "Add the NVIDIA RTX 5080 to my cart." }
      ]
    },
    {
      id: "rtx-5070-ti",
      name: "NVIDIA GeForce RTX 5070 Ti",
      price: "$749.99",
      discount: "N/A",
      delivery: "1-3 business days",
      availability: "Check availability",
      category: "gpu",
      badge: null,
      thumbnailUrl: "https://assets.nvidia.partners/images/90YV0LX0-MVAA00.webp",
      suggestions: [
        { label: "Full details", prompt: "Show me the full details and image of the RTX 5070 Ti." },
        { label: "Best price", prompt: "Where can I buy the RTX 5070 Ti at the lowest price?" },
        { label: "Compare vs 5080", prompt: "How does the RTX 5070 Ti compare to the RTX 5080?" },
        { label: "Add to cart", prompt: "Add an ASUS RTX 5070 Ti to my cart." }
      ]
    },
    {
      id: "rtx-5070",
      name: "NVIDIA GeForce RTX 5070",
      price: "$549.99",
      discount: "N/A",
      delivery: "1-3 business days",
      availability: "Check availability",
      category: "gpu",
      badge: "New",
      thumbnailUrl: "https://assets.nvidia.partners/images/PRIME-RTX5070-12G_box with card_.webp",
      suggestions: [
        { label: "Full details", prompt: "Show me the full details and image of the RTX 5070." },
        { label: "Current deals", prompt: "Are there any bundles or offers on the RTX 5070?" },
        { label: "Compare vs 5070 Ti", prompt: "Compare the RTX 5070 vs RTX 5070 Ti." },
        { label: "Add to cart", prompt: "Add the NVIDIA RTX 5070 Founder Edition to my cart." }
      ]
    },
    {
      id: "rtx-5060-ti",
      name: "NVIDIA GeForce RTX 5060 Ti",
      price: "$379.99",
      discount: "N/A",
      delivery: "1-3 business days",
      availability: "Check availability",
      category: "gpu",
      badge: null,
      thumbnailUrl: "https://assets.nvidia.partners/images/png/90YV0M90-MVAA00.png",
      suggestions: [
        { label: "Full details", prompt: "Show me the full details and image of the RTX 5060 Ti." },
        { label: "Check stock", prompt: "Is the RTX 5060 Ti available to buy now?" },
        { label: "Best value", prompt: "Which GPU gives the best value for money under $500?" },
        { label: "Add to cart", prompt: "Add an RTX 5060 Ti to my cart." }
      ]
    }
  ];

  const cookieProfile = getCookieProfile();
  const state = {
    products: hardcodedProducts,
    cookieProfile,
    currentProduct: selectProductForProfile(hardcodedProducts, cookieProfile),
    isDockedToSide: false,
    side: null,
    observer: null,
    sessions: [],
    activeSessionId: null,
    nextSessionId: 1,
    nextFeedCardId: 1,
    postSequence: 0,
    lastAdSequence: 0
  };

  injectRecurringFeedAds(state, POSTS_INTERVAL);
  observeFeedChanges(state, POSTS_INTERVAL);
  scheduleInjectionRetries(state, POSTS_INTERVAL);
})();

function getCookieProfile() {
  const cookieText = document.cookie || "";
  const cookiePairs = cookieText
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawKey, ...rawValue] = part.split("=");
      return [decodeURIComponent(rawKey || ""), decodeURIComponent(rawValue.join("=") || "")];
    });

  const cookieMap = Object.fromEntries(cookiePairs);
  const lowerCookieText = cookieText.toLowerCase();

  const themeFromCookie = (cookieMap.theme || cookieMap.user_theme || "").toLowerCase();
  const knownTheme = ["dark", "light", "warm", "cool"].includes(themeFromCookie)
    ? themeFromCookie
    : null;

  const inferredCategory = inferCategory(lowerCookieText);

  return {
    theme: knownTheme || inferTheme(lowerCookieText),
    category: inferredCategory,
    hasReturningUserSignal: /returning|last_order|premium|member/.test(lowerCookieText)
  };
}

function inferTheme(lowerCookieText) {
  if (lowerCookieText.includes("dark")) {
    return "dark";
  }
  if (lowerCookieText.includes("light")) {
    return "light";
  }
  return "cool";
}

function inferCategory() {
  return "gpu";
}

function selectProductForProfile(products, profile) {
  return products.find((product) => product.category === profile.category) || products[0];
}

function pickProductFromPrompt(products, prompt) {
  const lowerPrompt = prompt.toLowerCase();
  // Most-specific match first to avoid "5070" matching "5070 ti"
  const keywordMap = [
    ["rtx-5090", ["5090"]],
    ["rtx-5080", ["5080"]],
    ["rtx-5070-ti", ["5070 ti"]],
    ["rtx-5070", ["5070"]],
    ["rtx-5060-ti", ["5060 ti"]],
    ["rtx-5060", ["5060"]]
  ];

  for (const [id, keywords] of keywordMap) {
    if (keywords.some((kw) => lowerPrompt.includes(kw))) {
      return products.find((p) => p.id === id) || products[0];
    }
  }

  return products[0];
}

function renderProduct(elements, product) {
  elements.productName.textContent = product.name;
  elements.price.textContent = `Price: ${product.price}`;
  elements.discount.textContent = `Discount: ${product.discount}`;
  elements.delivery.textContent = `Delivery: ${product.delivery}`;
  elements.availability.textContent = `Stock: ${product.availability}`;
}

function renderBadge(elements, profile) {
  const returner = profile.hasReturningUserSignal ? "Returning user" : "New user";
  elements.badge.textContent = `${returner} • Theme: ${profile.theme} • Interest: ${profile.category}`;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function askBackend(prompt, currentProduct, cookieProfile) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "ADGENT_QUERY",
        prompt,
        currentProduct,
        cookieProfile
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "Unknown backend error"));
          return;
        }

        resolve(response.result);
      }
    );
  });
}

function createSideBanner(state, rootId, sideBannerId) {
  const root = document.createElement("div");
  root.id = rootId;
  root.setAttribute("data-placement", "side");
  root.setAttribute("data-visible", "false");

  const banner = document.createElement("section");
  banner.id = sideBannerId;
  banner.setAttribute("data-theme", state.cookieProfile.theme);
  banner.setAttribute("data-view", "side");

  banner.innerHTML = `
    <div id="adgent-header">
      <div id="adgent-header-title">
        <span>u/AdgentOfficial</span>
        <span id="adgent-promoted">Promoted</span>
      </div>
      <div id="adgent-header-controls">
        <button id="adgent-min-btn" class="adgent-btn-ghost" title="Minimize">_</button>
        <button id="adgent-close-btn" class="adgent-btn-ghost" title="Close">×</button>
      </div>
    </div>
    <div id="adgent-content">
      <div id="adgent-session-tabs"></div>
      <img id="adgent-product-image" src="" alt="" aria-hidden="true" />
      <div id="adgent-product-name"></div>
      <div id="adgent-feed-subtitle">Agentic ad assistant</div>
      <div id="adgent-product-meta">
        <div class="adgent-chip" id="adgent-price"></div>
        <div class="adgent-chip" id="adgent-discount"></div>
        <div class="adgent-chip" id="adgent-delivery"></div>
        <div class="adgent-chip" id="adgent-availability"></div>
      </div>
      <div id="adgent-prompt-row">
        <input id="adgent-prompt-input" type="text" placeholder="Ask for another product..." />
        <button id="adgent-send-btn">Ask</button>
      </div>
      <div id="adgent-response"></div>
      <div id="adgent-next-steps"></div>
      <div id="adgent-badge"></div>
    </div>
  `;

  root.appendChild(banner);
  mountBannerToSide(root);

  const elements = {
    root,
    banner,
    productImage: banner.querySelector("#adgent-product-image"),
    productName: banner.querySelector("#adgent-product-name"),
    price: banner.querySelector("#adgent-price"),
    discount: banner.querySelector("#adgent-discount"),
    delivery: banner.querySelector("#adgent-delivery"),
    availability: banner.querySelector("#adgent-availability"),
    promptInput: banner.querySelector("#adgent-prompt-input"),
    sendButton: banner.querySelector("#adgent-send-btn"),
    response: banner.querySelector("#adgent-response"),
    nextSteps: banner.querySelector("#adgent-next-steps"),
    badge: banner.querySelector("#adgent-badge"),
    tabs: banner.querySelector("#adgent-session-tabs"),
    minimizeButton: banner.querySelector("#adgent-min-btn"),
    closeButton: banner.querySelector("#adgent-close-btn")
  };

  elements.sendButton.addEventListener("click", () => {
    const session = getActiveSession(state);
    if (!session) {
      elements.response.textContent = "Use Ask from a feed ad first.";
      return;
    }

    const prompt = elements.promptInput.value.trim();
    if (!prompt) {
      elements.response.textContent = "Type a prompt to fetch a product suggestion.";
      return;
    }

    runAskFlow(state, prompt, { sessionId: session.id });
  });

  elements.promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const session = getActiveSession(state);
      if (!session) {
        elements.response.textContent = "Use Ask from a feed ad first.";
        return;
      }

      const prompt = elements.promptInput.value.trim();
      if (!prompt) {
        elements.response.textContent = "Type a prompt to fetch a product suggestion.";
        return;
      }
      runAskFlow(state, prompt, { sessionId: session.id });
    }
  });

  elements.minimizeButton.addEventListener("click", () => {
    banner.classList.toggle("minimized");
  });

  elements.closeButton.addEventListener("click", () => {
    root.setAttribute("data-visible", "false");
    state.isDockedToSide = false;
  });

  return { root, banner, elements };
}

function mountBannerToSide(root) {
  const parent = document.body || document.documentElement;

  if (!parent) {
    return;
  }

  const sidebar =
    document.querySelector('[data-testid="right-sidebar"]') ||
    document.querySelector('.side') ||
    document.querySelector('aside');

  if (sidebar) {
    root.style.cssText = "width: 100%; float: none; clear: none; margin: 0 0 12px 0;";
    sidebar.insertBefore(root, sidebar.firstChild);
    return;
  }

  root.style.cssText =
    "position: fixed; top: 88px; right: 16px; width: 300px; max-width: calc(100vw - 24px); z-index: 2147483640;";

  if (document.body) {
    document.body.appendChild(root);
  } else {
    parent.appendChild(root);
  }
}

function injectRecurringFeedAds(state, interval) {
  const posts = getRedditPosts();
  if (!posts.length) {
    return;
  }

  posts.forEach((post) => {
    if (!post.dataset.adgentSeq) {
      state.postSequence += 1;
      post.dataset.adgentSeq = String(state.postSequence);
    }

    const sequence = Number(post.dataset.adgentSeq || "0");
    if (!sequence) {
      return;
    }

    if (post.dataset.adgentAttached === "1") {
      return;
    }

    const farEnoughFromLastAd = sequence - state.lastAdSequence >= interval;
    const isSlot = sequence % interval === 0;
    if (!isSlot || !farEnoughFromLastAd) {
      return;
    }

    const product = state.products[sequence % state.products.length];
    const feedCard = createFeedAdCard(product, state);
    post.dataset.adgentAttached = "1";
    post.insertAdjacentElement("afterend", feedCard);
    state.lastAdSequence = sequence;
  });
}

function createFeedAdCard(product, state) {
  const card = document.createElement("article");
  card.className = "adgent-feed-card";
  card.setAttribute("data-theme", state.cookieProfile.theme);
  card.dataset.adgentCardId = `feed-${state.nextFeedCardId}`;
  state.nextFeedCardId += 1;

  const badgeHtml = product.badge
    ? `<span class="adgent-feed-badge">${escapeHtml(product.badge)}</span>`
    : "";

  const suggestionsHtml = (product.suggestions || [])
    .map((s) => `<button class="adgent-suggestion-chip" data-prompt="${escapeHtml(s.prompt)}">${escapeHtml(s.label)}</button>`)
    .join("");

  card.innerHTML = `
    <div class="adgent-feed-header">
      <div class="adgent-feed-author">
        <span>u/AdgentOfficial</span>
        <span class="adgent-feed-promoted">Promoted</span>
      </div>
      ${badgeHtml}
    </div>
    <div class="adgent-feed-title">${escapeHtml(product.name)}</div>
    <div class="adgent-feed-copy">Ask Adgent anything — specs, availability, comparisons, or add to cart.</div>
    <div class="adgent-feed-chips">
      <span class="adgent-chip">Price: ${escapeHtml(product.price)}</span>
      <span class="adgent-chip">Delivery: ${escapeHtml(product.delivery)}</span>
      <span class="adgent-chip">Stock: ${escapeHtml(product.availability)}</span>
    </div>
    <div class="adgent-feed-suggestions">${suggestionsHtml}</div>
    <div class="adgent-feed-ask-row">
      <input class="adgent-feed-input" type="text" placeholder="Ask Adgent about this product" />
      <button class="adgent-feed-ask-btn">Ask</button>
    </div>
    <div class="adgent-feed-response"></div>
  `;

  const input = card.querySelector(".adgent-feed-input");
  const askButton = card.querySelector(".adgent-feed-ask-btn");
  const response = card.querySelector(".adgent-feed-response");

  ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "keydown", "keyup"].forEach((eventName) => {
    card.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
  });

  const submitFromCard = () => {
    const prompt = input.value.trim();
    if (!prompt) {
      response.textContent = "Type a prompt first.";
      return;
    }

    runAskFlow(state, prompt, {
      sourceCard: card,
      sessionKey: card.dataset.adgentCardId,
      sourceProduct: product,
      responseElement: response,
      askButton,
      input
    });
  };

  askButton.addEventListener("click", submitFromCard);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submitFromCard();
    }
  });

  // Suggestion chip clicks — fill the input and immediately submit
  card.querySelectorAll(".adgent-suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      const prompt = chip.dataset.prompt;
      if (!prompt) return;
      input.value = prompt;
      submitFromCard();
    });
  });

  return card;
}

function runAskFlow(state, prompt, feedContext) {
  ensureSideBanner(state);
  if (!state.side) {
    return;
  }

  const session = getOrCreateSession(state, feedContext);
  state.activeSessionId = session.id;

  dockToSide(state, feedContext?.sourceCard || null);
  const sideElements = state.side.elements;
  renderSessionTabs(state);
  sideElements.promptInput.value = prompt;
  sideElements.sendButton.textContent = "...";
  sideElements.sendButton.setAttribute("disabled", "true");
  sideElements.response.textContent = "Checking product, delivery, and discounts...";

  if (feedContext?.askButton) {
    feedContext.askButton.textContent = "...";
    feedContext.askButton.setAttribute("disabled", "true");
  }

  if (feedContext?.responseElement) {
    feedContext.responseElement.textContent = "Moving to side assistant and fetching details...";
  }

  const baseProduct = session.product;

  askBackend(prompt, baseProduct, state.cookieProfile)
    .then((backendResult) => {
      // Update session product if the agent discussed a different GPU
      const nextProduct = pickProductFromPrompt(state.products, prompt);
      session.product = {
        ...nextProduct,
        delivery: backendResult?.delivery || nextProduct.delivery,
        availability: backendResult?.availability || nextProduct.availability,
        discount: backendResult?.discount || nextProduct.discount
      };
      state.currentProduct = session.product;
      session.lastPrompt = prompt;
      const message = backendResult?.message || `Showing ${session.product.name}`;
      session.lastResponse = message;
      session.nextSteps = backendResult?.next_steps || [];
      session.productImage = backendResult?.product_image || null;
      renderActiveSession(state);
      if (feedContext?.responseElement) {
        feedContext.responseElement.textContent = message;
      }
    })
    .catch(() => {
      const nextProduct = pickProductFromPrompt(state.products, prompt);
      session.product = nextProduct;
      state.currentProduct = session.product;
      session.lastPrompt = prompt;
      session.nextSteps = [];
      const fallbackMessage = `Backend unavailable. Try: "What are the specs of the ${nextProduct.name}?"`;
      session.lastResponse = fallbackMessage;
      renderActiveSession(state);
      if (feedContext?.responseElement) {
        feedContext.responseElement.textContent = fallbackMessage;
      }
    })
    .finally(() => {
      sideElements.sendButton.textContent = "Ask";
      sideElements.sendButton.removeAttribute("disabled");
      if (feedContext?.askButton) {
        feedContext.askButton.textContent = "Ask";
        feedContext.askButton.removeAttribute("disabled");
      }
    });
}

function ensureSideBanner(state) {
  if (state.side) {
    return;
  }

  state.side = createSideBanner(state, "adgent-banner-root", "adgent-banner");
  renderProduct(state.side.elements, state.currentProduct);
  renderBadge(state.side.elements, state.cookieProfile);
}

function getOrCreateSession(state, feedContext) {
  if (feedContext?.sessionId) {
    const existingById = state.sessions.find((session) => session.id === feedContext.sessionId);
    if (existingById) {
      return existingById;
    }
  }

  if (feedContext?.sessionKey) {
    const existing = state.sessions.find((session) => session.key === feedContext.sessionKey);
    if (existing) {
      return existing;
    }
  }

  if (!feedContext && state.activeSessionId) {
    const active = state.sessions.find((session) => session.id === state.activeSessionId);
    if (active) {
      return active;
    }
  }

  const sourceProduct = feedContext?.sourceProduct || state.currentProduct;
  const session = {
    id: `s-${state.nextSessionId}`,
    key: feedContext?.sessionKey || `manual-${state.nextSessionId}`,
    label: sourceProduct.name,
    product: { ...sourceProduct },
    lastPrompt: "",
    lastResponse: "",
    nextSteps: [],
    productImage: null
  };
  state.nextSessionId += 1;
  state.sessions.push(session);
  return session;
}

function getActiveSession(state) {
  if (!state.activeSessionId) {
    return null;
  }
  return state.sessions.find((session) => session.id === state.activeSessionId) || null;
}

function renderSessionTabs(state) {
  if (!state.side?.elements.tabs) {
    return;
  }

  const tabs = state.side.elements.tabs;
  tabs.innerHTML = "";

  state.sessions.forEach((session) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "adgent-session-tab";
    if (session.id === state.activeSessionId) {
      tab.classList.add("active");
    }
    tab.textContent = shortenLabel(session.label, 20);
    tab.addEventListener("click", () => {
      state.activeSessionId = session.id;
      renderSessionTabs(state);
      renderActiveSession(state);
    });
    tabs.appendChild(tab);
  });
}

function renderProductImage(state, imageUrl) {
  const el = state.side?.elements?.productImage;
  if (!el) {
    return;
  }
  if (imageUrl) {
    el.src = imageUrl;
    el.alt = "Product image";
    el.removeAttribute("aria-hidden");
    el.style.display = "block";
  } else {
    el.src = "";
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }
}

function renderNextSteps(state, nextSteps) {
  const el = state.side?.elements?.nextSteps;
  if (!el) {
    return;
  }
  el.innerHTML = "";
  (nextSteps || []).forEach(({ label, prompt }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "adgent-next-step-chip";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      runAskFlow(state, prompt, { sessionId: state.activeSessionId });
    });
    el.appendChild(chip);
  });
}

function renderActiveSession(state) {
  const session = getActiveSession(state);
  if (!session || !state.side) {
    return;
  }

  renderProduct(state.side.elements, session.product);
  renderBadge(state.side.elements, state.cookieProfile);
  state.side.elements.promptInput.value = session.lastPrompt || "";
  state.side.elements.response.textContent = session.lastResponse || "";
  renderProductImage(state, session.productImage || null);
  renderNextSteps(state, session.nextSteps || []);
}

function shortenLabel(value, limit) {
  if (!value || value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function dockToSide(state, sourceCard) {
  if (!state.isDockedToSide) {
    state.isDockedToSide = true;
    state.side.root.setAttribute("data-visible", "true");
    state.side.banner.classList.add("adgent-docking");
    mountBannerToSide(state.side.root);

    window.requestAnimationFrame(() => {
      state.side.banner.classList.add("adgent-side-visible");
    });

    window.setTimeout(() => {
      state.side.banner.classList.remove("adgent-docking");
    }, 360);
  }

  if (sourceCard) {
    sourceCard.classList.add("adgent-feed-card-engaged");
    const input = sourceCard.querySelector(".adgent-feed-input");
    if (input) {
      input.setAttribute("disabled", "true");
    }
  }
}

function observeFeedChanges(state, interval) {
  const target = document.querySelector("main") || document.body;
  if (!target) {
    return;
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      injectRecurringFeedAds(state, interval);
    });
  });

  observer.observe(target, { childList: true, subtree: true });
  state.observer = observer;
}

function getRedditPosts() {
  const selectorPriority = ['[data-testid="post-container"]', "shreddit-post", '[id^="t3_"]'];

  for (const selector of selectorPriority) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length) {
      return nodes;
    }
  }

  return [];
}

function scheduleInjectionRetries(state, interval) {
  const retryDelays = [800, 1800, 3200, 5000];
  retryDelays.forEach((delay) => {
    window.setTimeout(() => {
      injectRecurringFeedAds(state, interval);
    }, delay);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
