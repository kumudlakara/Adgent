(async () => {
  const ROOT_ID = "adgent-banner-root";
  const POSTS_INTERVAL = 12;
  const isReddit = /(^|\.)reddit\.com$/.test(window.location.hostname);

  if (!isReddit) {
    return;
  }

  const staleRoot = document.getElementById(ROOT_ID);
  if (staleRoot) {
    staleRoot.remove();
  }

  let products;
  try {
    const url = chrome.runtime.getURL("products.json");
    const res = await fetch(url);
    products = await res.json();
  } catch {
    return;
  }

  if (!products?.length) {
    return;
  }

  const cookieProfile = getCookieProfile();
  const state = {
    products,
    cookieProfile,
    currentProduct: selectProductForProfile(products, cookieProfile),
    isDockedToSide: false,
    side: null,
    observer: null,
    sessions: [],
    activeSessionId: null,
    nextSessionId: 1,
    nextFeedCardId: 1,
    nextAdIndex: 0,
    postSequence: 0,
    lastAdSequence: 0,
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
      try {
        return [
          decodeURIComponent(rawKey || ""),
          decodeURIComponent(rawValue.join("=") || ""),
        ];
      } catch {
        return [rawKey || "", rawValue.join("=") || ""];
      }
    });

  const cookieMap = Object.fromEntries(cookiePairs);
  const lowerCookieText = cookieText.toLowerCase();

  const themeFromCookie = (
    cookieMap.theme ||
    cookieMap.user_theme ||
    ""
  ).toLowerCase();
  const knownTheme = ["dark", "light", "warm", "cool"].includes(themeFromCookie)
    ? themeFromCookie
    : null;

  const inferredCategory = inferCategory(lowerCookieText);

  return {
    theme: knownTheme || inferTheme(lowerCookieText),
    category: inferredCategory,
    hasReturningUserSignal: /returning|last_order|premium|member/.test(
      lowerCookieText,
    ),
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
  return (
    products.find((product) => product.category === profile.category) ||
    products[0]
  );
}

function pickProductFromPrompt(products, prompt, fallback = null) {
  const lowerPrompt = prompt.toLowerCase();
  // Most-specific match first to avoid "5070" matching "5070 ti"
  const keywordMap = [
    ["rtx-5090", ["5090"]],
    ["rtx-5080", ["5080"]],
    ["rtx-5070-ti", ["5070 ti"]],
    ["rtx-5070", ["5070"]],
    ["rtx-5060-ti", ["5060 ti"]],
    ["rtx-5060", ["5060"]],
  ];

  for (const [id, keywords] of keywordMap) {
    if (keywords.some((kw) => lowerPrompt.includes(kw))) {
      return products.find((p) => p.id === id) || fallback || products[0];
    }
  }

  // No GPU keyword found — keep whatever product is already active
  return fallback || products[0];
}

function renderProduct(elements, product) {
  if (elements.productImage) {
    const src = resolveThumbnailUrl(product.thumbnailUrl);
    elements.productImage.src = src || "";
    elements.productImage.alt = product.name || "";
    elements.productImage.style.display = src ? "block" : "none";
  }
}

/**
 * Resolve a thumbnailUrl that may be:
 *  - an absolute https:// URL  → returned as-is
 *  - a relative path like "images/foo.png" → resolved via chrome.runtime.getURL()
 *  - empty / falsy → returns ""
 */
function resolveThumbnailUrl(url) {
  if (!url) return "";
  if (/^https?:\/\/|^data:/.test(url)) return url;
  try {
    return chrome.runtime.getURL(url);
  } catch {
    return url;
  }
}

async function askBackend(prompt, currentProduct, cookieProfile) {
  const response = await fetch("http://localhost:8787/api/ad-agent/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentProduct, cookieProfile }),
  });
  if (!response.ok) {
    throw new Error(`Backend responded with ${response.status}`);
  }
  return response.json();
}

function createSideBanner(state, ROOT_ID, sideBannerId) {
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("data-placement", "side");
  root.setAttribute("data-visible", "false");

  const banner = document.createElement("section");
  banner.id = sideBannerId;
  banner.setAttribute("data-theme", state.currentProduct.theme || "light");
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
      <div id="adgent-scroll-area">
        <div id="adgent-session-tabs"></div>
        <a id="adgent-product-link" href="#" target="_blank" rel="noopener noreferrer">
          <img id="adgent-product-image" src="" alt="" />
        </a>
        <div id="adgent-response"></div>
        <div id="adgent-next-steps"></div>
      </div>
      <div id="adgent-prompt-row">
        <input id="adgent-prompt-input" type="text" placeholder="Ask about this product..." />
        <button id="adgent-send-btn">Ask</button>
      </div>
    </div>
  `;

  root.appendChild(banner);
  mountBannerToSide(root);

  const elements = {
    root,
    banner,
    productLink: banner.querySelector("#adgent-product-link"),
    productImage: banner.querySelector("#adgent-product-image"),
    promptInput: banner.querySelector("#adgent-prompt-input"),
    sendButton: banner.querySelector("#adgent-send-btn"),
    response: banner.querySelector("#adgent-response"),
    nextSteps: banner.querySelector("#adgent-next-steps"),
    tabs: banner.querySelector("#adgent-session-tabs"),
    minimizeButton: banner.querySelector("#adgent-min-btn"),
    closeButton: banner.querySelector("#adgent-close-btn"),
  };

  elements.sendButton.addEventListener("click", () => {
    const session = getActiveSession(state);
    if (!session) {
      elements.response.textContent = "Use Ask from a feed ad first.";
      return;
    }

    const prompt = elements.promptInput.value.trim();
    if (!prompt) {
      elements.response.textContent =
        "Type a prompt to fetch a product suggestion.";
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
        elements.response.textContent =
          "Type a prompt to fetch a product suggestion.";
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
    document.querySelector(".side") ||
    document.querySelector("aside");

  if (sidebar) {
    root.style.cssText =
      "width: 100%; float: none; clear: none; margin: 0 0 12px 0;";
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

    const product = state.products[state.nextAdIndex % state.products.length];
    state.nextAdIndex += 1;
    const feedCard = createFeedAdCard(product, state);
    post.dataset.adgentAttached = "1";
    post.insertAdjacentElement("afterend", feedCard);
    state.lastAdSequence = sequence;
  });
}

function createFeedAdCard(product, state) {
  const card = document.createElement("article");
  card.className = "adgent-feed-card";
  card.setAttribute("data-theme", product.theme || "light");
  card.dataset.adgentCardId = `feed-${state.nextFeedCardId}`;
  state.nextFeedCardId += 1;

  const resolvedThumbnail = resolveThumbnailUrl(product.thumbnailUrl);
  const thumbnailHtml = resolvedThumbnail
    ? `<a href="${escapeHtml(product.productUrl || "#")}" target="_blank" rel="noopener noreferrer" class="adgent-feed-thumbnail-link">
        <img class="adgent-feed-thumbnail" src="${escapeHtml(resolvedThumbnail)}" alt="${escapeHtml(product.name)}" />
      </a>`
    : "";

  const suggestionsHtml = (product.suggestions || [])
    .map(
      (s) =>
        `<button class="adgent-suggestion-chip" data-prompt="${escapeHtml(s.prompt)}">${escapeHtml(s.label)}</button>`,
    )
    .join("");

  card.innerHTML = `
    <div class="adgent-feed-header">
      <div class="adgent-feed-author">
        <span>u/AdgentOfficial</span>
        <span class="adgent-feed-promoted">Promoted</span>
      </div>
    </div>
    <div class="adgent-feed-title">${escapeHtml(product.name)}</div>
    ${thumbnailHtml}
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

  [
    "click",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "keydown",
    "keyup",
  ].forEach((eventName) => {
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
      input,
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
  renderActiveSession(state); // show the clicked product immediately
  sideElements.promptInput.value = "";
  sideElements.sendButton.textContent = "...";
  sideElements.sendButton.setAttribute("disabled", "true");

  // First prompt only — show loading indicator (no previous response to keep)
  if (!session.lastResponse) {
    sideElements.response.innerHTML =
      '<p class="adgent-loading">Collecting product info\u2026</p>';
  }

  if (feedContext?.askButton) {
    feedContext.askButton.textContent = "...";
    feedContext.askButton.setAttribute("disabled", "true");
  }

  if (feedContext?.responseElement) {
    feedContext.responseElement.innerHTML = "<p>Fetching details…</p>";
  }

  const baseProduct = session.product;

  askBackend(prompt, baseProduct, state.cookieProfile)
    .then((backendResult) => {
      // Switch product only if the prompt explicitly names a different GPU
      const nextProduct = pickProductFromPrompt(
        state.products,
        prompt,
        session.product,
      );
      session.product = {
        ...nextProduct,
        delivery: backendResult?.delivery || nextProduct.delivery,
        availability: backendResult?.availability || nextProduct.availability,
        discount: backendResult?.discount || nextProduct.discount,
      };
      state.currentProduct = session.product;
      session.lastPrompt = prompt;
      const message =
        backendResult?.message || `Showing ${session.product.name}`;
      session.lastResponse = message;
      session.nextSteps = backendResult?.next_steps || [];
      session.productImage = backendResult?.product_image || null;
      renderActiveSession(state);
      if (feedContext?.responseElement) {
        feedContext.responseElement.innerHTML = renderMarkdown(message);
      }
    })
    .catch(() => {
      const nextProduct = pickProductFromPrompt(
        state.products,
        prompt,
        session.product,
      );
      session.product = nextProduct;
      state.currentProduct = session.product;
      session.lastPrompt = prompt;
      session.nextSteps = [];
      const fallbackMessage = `Backend unavailable. Try: "What are the specs of the ${nextProduct.name}?"`;
      session.lastResponse = fallbackMessage;
      renderActiveSession(state);
      if (feedContext?.responseElement) {
        feedContext.responseElement.innerHTML = renderMarkdown(fallbackMessage);
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
}

function getOrCreateSession(state, feedContext) {
  if (feedContext?.sessionId) {
    const existingById = state.sessions.find(
      (session) => session.id === feedContext.sessionId,
    );
    if (existingById) {
      return existingById;
    }
  }

  if (feedContext?.sessionKey) {
    const existing = state.sessions.find(
      (session) => session.key === feedContext.sessionKey,
    );
    if (existing) {
      return existing;
    }
  }

  if (!feedContext && state.activeSessionId) {
    const active = state.sessions.find(
      (session) => session.id === state.activeSessionId,
    );
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
    productImage: null,
  };
  state.nextSessionId += 1;
  state.sessions.push(session);
  return session;
}

function getActiveSession(state) {
  if (!state.activeSessionId) {
    return null;
  }
  return (
    state.sessions.find((session) => session.id === state.activeSessionId) ||
    null
  );
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
  const link = state.side?.elements?.productLink;
  if (!el) {
    return;
  }
  const resolvedUrl = resolveThumbnailUrl(imageUrl);
  if (resolvedUrl) {
    el.src = resolvedUrl;
    el.alt = "Product image";
    el.removeAttribute("aria-hidden");
    el.style.display = "block";
    if (link) {
      const productUrl = getActiveSession(state)?.product?.productUrl;
      link.href = productUrl || "#";
      link.style.display = "block";
    }
  } else {
    el.src = "";
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    if (link) {
      link.style.display = "none";
    }
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

  // Update banner theme to match the active session's product
  state.side.banner.setAttribute(
    "data-theme",
    session.product.theme || "light",
  );

  // Agent-provided image takes priority, otherwise fall back to product thumbnail
  renderProductImage(
    state,
    session.productImage || session.product.thumbnailUrl || null,
  );
  state.side.elements.promptInput.value = "";
  state.side.elements.response.innerHTML = renderMarkdown(
    session.lastResponse || "",
  );
  // Show product suggestion chips before first query, next-step chips after
  const chips = session.lastPrompt
    ? session.nextSteps || []
    : session.product.suggestions || [];
  renderNextSteps(state, chips);
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
  const selectorPriority = [
    '[data-testid="post-container"]',
    "shreddit-post",
    '[id^="t3_"]',
  ];

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

function renderMarkdown(raw) {
  if (!raw) return "";
  const blocks = String(raw)
    .trim()
    .split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (!lines.length) return "";
      const isList = lines.every((l) => /^\s*[-•*]\s/.test(l));
      if (isList) {
        const items = lines
          .map(
            (l) => `<li>${inlineMarkdown(l.replace(/^\s*[-•*]\s+/, ""))}</li>`,
          )
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.map(inlineMarkdown).join("<br>")}</p>`;
    })
    .join("");
}

function inlineMarkdown(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
