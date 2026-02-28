const BACKEND_BASE_URL = "http://localhost:8787";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ADGENT_QUERY") {
    return;
  }

  const payload = {
    prompt: message.prompt,
    currentProduct: message.currentProduct,
    cookieProfile: message.cookieProfile,
    pageUrl: sender?.tab?.url || null,
    timestamp: new Date().toISOString()
  };

  queryBackend(payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "Backend request failed"
      });
    });

  return true;
});

async function queryBackend(payload) {
  const url = `${BACKEND_BASE_URL}/api/ad-agent/query`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Backend responded with ${response.status}`);
  }

  return response.json();
}
