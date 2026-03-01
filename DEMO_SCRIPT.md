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

"Online ads are static. You see a banner, maybe you click, probably you don't. We built Addie to change that — it's a platform for businesses to rethink how they advertise entirely.

What you're looking at is the advertiser-facing creative suite. A business would sign up, set up their brand profile, and then use this to launch ads. We've already done that setup — so I'm going to go straight to launching an ad for the NVIDIA RTX 5090 right now."

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

"Launching. This ad is now live in our pool — in production, a ranking algorithm decides when and where to surface it across target pages, the same way Google Ads would. For this demo, we're using a Chrome extension to inject it directly so you can see it in action right now."

---

**[0:55 — Switch to Reddit tab, refresh]**

"I'll switch to Reddit and refresh."

*Scroll slowly down the feed until an Addie card appears.*

---

**[1:10 — Point to the card]**

"The card shows the product image and pre-loaded suggestion chips. A user can ask anything — or just click a chip."

*Click 'Check stock' chip.*

"I've just asked Addie whether the RTX 5090 is in stock."

---

**[1:18 — Side panel opens, response loads]**

"What's happening under the hood: the extension is calling the Addie agent, which talks to the business's MCP server — that's something a business would connect during profile setup, so Addie has live access to their product catalog, inventory, and pricing. For this demo, we built our own MCP servers on top of mock product catalogs. The agent picks the right tools, queries the data, and comes back with a structured answer."

*Response renders in side panel.*

---

**[1:35 — Point to the response and next-step chips]**

"The answer is formatted cleanly with availability and pricing. And it generates follow-up chips — 'Compare vs 5080', 'Find cheapest retailer' — so the conversation keeps going."

*Click 'Add to cart'.*

"For production scenarios, the agent can manage a full shopping cart and hand the user off to the retailer with a direct purchase link."

---

**[1:50 — Wrap up]**

"That is Addie. An ad that knows what it's selling, answers questions in real time, and gets out of the way when the user is ready to buy."

---

*[2:00 — Done]*

---

## Fallback if image generation is slow

Skip the generation step. Open the creative suite on the Upload tab, drag in the pre-prepared `coca-cola.jpg` or any product image from the repo, fill in the fields, and launch. The rest of the demo is identical.

## Fallback if backend is slow to respond

Keep scrolling Reddit while it loads — the feed injection is already done, so the card stays visible. The response typically arrives within 5–8 seconds on a normal connection.
