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

  const hardcodedProducts = [
    {
      id: "wireless-earbuds",
      name: "PulseBeat Wireless Earbuds",
      price: "$59",
      discount: "20% off",
      delivery: "2 days",
      availability: "In stock",
      category: "audio"
    },
    {
      id: "running-shoes",
      name: "AeroRun Running Shoes",
      price: "$89",
      discount: "15% off",
      delivery: "Tomorrow",
      availability: "Limited stock",
      category: "fitness"
    },
    {
      id: "coffee-maker",
      name: "BrewMate Smart Coffee Maker",
      price: "$129",
      discount: "10% off",
      delivery: "3-4 days",
      availability: "In stock",
      category: "home"
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
  if (lowerCookieText.includes("coffee") || lowerCookieText.includes("home")) {
    return "warm";
  }
  return "cool";
}

function inferCategory(lowerCookieText) {
  if (/audio|music|earbud|headphone/.test(lowerCookieText)) {
    return "audio";
  }
  if (/run|fitness|sports|gym/.test(lowerCookieText)) {
    return "fitness";
  }
  if (/kitchen|coffee|home/.test(lowerCookieText)) {
    return "home";
  }
  return "audio";
}

function selectProductForProfile(products, profile) {
  return products.find((product) => product.category === profile.category) || products[0];
}

function pickProductFromPrompt(products, prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const keywordMap = {
    audio: ["audio", "earbud", "music", "headphone"],
    fitness: ["run", "shoe", "fitness", "gym"],
    home: ["coffee", "kitchen", "home", "brew"]
  };

  const matchedCategory = Object.entries(keywordMap).find(([, keywords]) =>
    keywords.some((keyword) => lowerPrompt.includes(keyword))
  )?.[0];

  if (matchedCategory) {
    return products.find((product) => product.category === matchedCategory) || products[0];
  }

  const index = Math.abs(hashString(lowerPrompt)) % products.length;
  return products[index];
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
      <div id="adgent-badge"></div>
    </div>
  `;

  root.appendChild(banner);
  mountBannerToSide(root);

  const elements = {
    root,
    banner,
    productName: banner.querySelector("#adgent-product-name"),
    price: banner.querySelector("#adgent-price"),
    discount: banner.querySelector("#adgent-discount"),
    delivery: banner.querySelector("#adgent-delivery"),
    availability: banner.querySelector("#adgent-availability"),
    promptInput: banner.querySelector("#adgent-prompt-input"),
    sendButton: banner.querySelector("#adgent-send-btn"),
    response: banner.querySelector("#adgent-response"),
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

  card.innerHTML = `
    <div class="adgent-feed-header">
      <div class="adgent-feed-author">
        <span>u/AdgentOfficial</span>
        <span class="adgent-feed-promoted">Promoted</span>
      </div>
    </div>
    <div class="adgent-feed-title">${escapeHtml(product.name)}</div>
    <div class="adgent-feed-copy">Ask for delivery time, availability, and discounts.</div>
    <div class="adgent-feed-chips">
      <span class="adgent-chip">Price: ${escapeHtml(product.price)}</span>
      <span class="adgent-chip">Discount: ${escapeHtml(product.discount)}</span>
      <span class="adgent-chip">Delivery: ${escapeHtml(product.delivery)}</span>
      <span class="adgent-chip">Stock: ${escapeHtml(product.availability)}</span>
    </div>
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
      renderActiveSession(state);
      sideElements.response.textContent = message;
      if (feedContext?.responseElement) {
        feedContext.responseElement.textContent = message;
      }
    })
    .catch(() => {
      const nextProduct = pickProductFromPrompt(state.products, prompt);
      session.product = nextProduct;
      state.currentProduct = session.product;
      session.lastPrompt = prompt;
      const fallbackMessage = `Backend unavailable. Local suggestion: ${nextProduct.name}`;
      session.lastResponse = fallbackMessage;
      renderActiveSession(state);
      sideElements.response.textContent = fallbackMessage;
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
    lastResponse: ""
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

function renderActiveSession(state) {
  const session = getActiveSession(state);
  if (!session || !state.side) {
    return;
  }

  renderProduct(state.side.elements, session.product);
  renderBadge(state.side.elements, state.cookieProfile);
  state.side.elements.promptInput.value = session.lastPrompt || "";
  state.side.elements.response.textContent = session.lastResponse || "";
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
