# Adgent — Demo Script
### Target: 2 minutes

---

## Setup (before presenting)

- Backend running: `uv run python -m adgent.server`
- Creative suite running: `npm run dev` in `adgent-creative-suite/`
- Chrome extension loaded and enabled
- Browser tabs open: creative suite at `localhost:5173`, Reddit in another tab
- Reddit tab: pre-loaded on `reddit.com/r/hardware` or similar, scrolled to top

---

## Script

---

**[0:00 — Creative Suite open on screen]**

"Online ads are static. You see a banner, maybe you click, probably you don't. We built Adgent to change that.

This is our campaign creation tool. I'm going to launch an ad for the NVIDIA RTX 5090 right now."

---

**[0:12 — Click 'Generate with AI', fill in fields]**

"I'll give it a campaign name — 'RTX 5090 Launch' — and a short description of the ad I want."

*Type:* `Cinematic dark background, RTX 5090 GPU centered, glowing green accents, premium feel`

"I'll hit Generate."

*Click Generate. While it loads:*

"We're calling Runware's image model here — it takes the prompt and any product reference images you upload and produces a ready-to-use ad creative."

---

**[0:35 — Image appears in preview]**

"There's the creative. If I'm not happy I can regenerate. I'll hit Continue."

---

**[0:40 — CampaignTarget page]**

"Now I pick where this runs. Product name, product URL, and I'll target Reddit."

*Fill in fields quickly. Click Launch Campaign.*

"Launching. What just happened: the backend wrote this product and image directly into the Chrome extension. No upload pipeline, no ad network approval queue."

---

**[0:55 — Switch to Reddit tab, refresh]**

"I'll switch to Reddit and refresh."

*Scroll slowly down the feed until an Addie card appears.*

"There it is — right in the feed, between real posts. This is not an iframe. Addie injects a native-looking card that matches the page."

---

**[1:10 — Point to the card]**

"The card shows the product image and pre-loaded suggestion chips. A user can ask anything — or just click a chip."

*Click 'Check stock' chip.*

"I've just asked Addie whether the RTX 5090 is in stock."

---

**[1:18 — Side panel opens, response loads]**

"What's happening under the hood: the extension is calling our local Claude Opus agent, which in turn is calling our MCP tool server — a live GPU catalog with 86 products, real retailer prices, and availability data. The agent picks the right tools, checks the data, and comes back with a structured answer."

*Response renders in side panel.*

---

**[1:35 — Point to the response and next-step chips]**

"The answer is formatted cleanly with availability and pricing. And it generates follow-up chips — 'Compare vs 5080', 'Add to cart', 'Find cheapest retailer' — so the conversation keeps going."

*Click 'Add to cart'.*

"The agent can manage a full shopping cart and hand the user off to the retailer with a direct purchase link."

---

**[1:50 — Wrap up]**

"That is Adgent. An ad that knows what it's selling, answers questions in real time, and gets out of the way when the user is ready to buy."

---

*[2:00 — Done]*

---

## Fallback if image generation is slow

Skip the generation step. Open the creative suite on the Upload tab, drag in the pre-prepared `coca-cola.jpg` or any product image from the repo, fill in the fields, and launch. The rest of the demo is identical.

## Fallback if backend is slow to respond

Keep scrolling Reddit while it loads — the feed injection is already done, so the card stays visible. The response typically arrives within 5–8 seconds on a normal connection.
