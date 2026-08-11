/* ==========================================================================
   AGUYB STUDIOS - CMS Rendering (Wix Data)
   ==========================================================================
   Progressive enhancement: the static HTML already shown to the browser is
   the real fallback content, so if anything here fails (offline, API
   hiccup, ad blocker) the page still looks complete. On load, this file
   fetches the site's content from Wix Data collections (managed from the
   Wix dashboard: CMS / Content Manager) using the same anonymous
   Wix Headless visitor-token pattern as the forms in main.js, then
   overwrites the matching sections of the DOM in place. No build step,
   no page reload.

   Every collection is public read-only for visitors (permissions:
   read = ANYONE) and only editable from the Wix dashboard
   (insert/update/remove = ADMIN), so this file never writes anything back.
   ========================================================================== */

(function () {
  "use strict";

  const WIX_CLIENT_ID = "b21d16f1-0865-4b6c-82c9-8fc43d39c696";
  const PAGE = document.body ? document.body.getAttribute("data-page") : null;

  let tokenPromise = null;
  function getVisitorToken() {
    if (!tokenPromise) {
      tokenPromise = fetch("https://www.wixapis.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: WIX_CLIENT_ID, grantType: "anonymous" })
      })
        .then((res) => {
          if (!res.ok) throw new Error("Could not authenticate with Wix (CMS)");
          return res.json();
        })
        .then((data) => data.access_token);
    }
    return tokenPromise;
  }

  async function queryCollection(dataCollectionId, sortField) {
    try {
      const token = await getVisitorToken();
      const query = { paging: { limit: 100 } };
      if (sortField) query.sort = [{ fieldName: sortField, order: "ASC" }];

      const res = await fetch("https://www.wixapis.com/wix-data/v2/items/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ dataCollectionId, query })
      });
      if (!res.ok) throw new Error("CMS query failed for " + dataCollectionId + ": " + res.status);
      const json = await res.json();
      return (json.dataItems || []).map((item) => item.data);
    } catch (err) {
      console.warn("[AGUYB CMS] Falling back to static content for", dataCollectionId, err.message);
      return null; // signal "leave the static HTML alone"
    }
  }

  // ---------- tiny helpers ----------
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  // Strips "$", commas, "/mo" etc. down to a bare number for the booking
  // modal's data-book-price attribute (the modal computes add-on totals
  // client-side, so it needs a plain number, not a formatted price string).
  function priceNum(val) {
    const n = Number(String(val == null ? "" : val).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? "" : n;
  }
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>';
  // Sets have no video -- covers are photo-only. This is the same 2x2
  // gallery-grid icon the static markup uses as a "more photos" hint.
  const ICON_GALLERY = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>';
  const ICON_STAR = '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.2l7.1-.6z"></path></svg>';
  const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"></path></svg>';
  const ICON_SERVICE = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="12" height="12" rx="2"></rect><path d="M16 10l4-2v8l-4-2"></path></svg>';

  function byBlockKey(blocks, key) {
    return blocks.find((b) => b.blockKey === key);
  }

  // Fills a generic "section head" style block: .eyebrow / h1-h3 / .section-sub
  // Skips overwriting a heading if it contains child elements (e.g. an inline
  // <span class="gradient-text">), and skips a paragraph if it contains a
  // nested link, so we never destroy hand-placed inline styling or links.
  function fillHead(container, block, opts) {
    if (!container || !block) return;
    opts = opts || {};
    const eyebrowEl = container.querySelector(".eyebrow");
    if (eyebrowEl && block.eyebrow) eyebrowEl.textContent = block.eyebrow;

    const headingEl = opts.headingSelector
      ? container.querySelector(opts.headingSelector)
      : container.querySelector("h1, h2, h3");
    if (headingEl && block.heading && !headingEl.querySelector("span") && block.heading.indexOf("|") === -1) {
      headingEl.textContent = block.heading;
    }

    const subEl = opts.subSelector
      ? container.querySelector(opts.subSelector)
      : container.querySelector(".section-sub");
    if (subEl && block.subheading && !subEl.querySelector("a")) {
      subEl.textContent = block.subheading;
    }
  }

  // Swaps the <img> inside a ".philosophy-media" panel (used by the home
  // page's "Why It Works" section and the on-site page's "What This
  // Service Is" section) for whatever real photo the block's bgImageUrl
  // points to, resolving Wix Media Manager identifiers the same way the
  // hero background does.
  function renderMediaImage(mediaEl, block) {
    if (!mediaEl || !block) return;
    const url = resolveWixMediaUrl(block.bgImageUrl);
    if (!url) return;
    const img = mediaEl.querySelector("img");
    if (img) img.setAttribute("src", url);
  }

  function fillCtas(container, block) {
    if (!container || !block) return;
    const btns = container.querySelectorAll("a.btn");
    if (btns[0] && block.ctaLabel) {
      btns[0].textContent = block.ctaLabel;
      if (block.ctaUrl) btns[0].setAttribute("href", block.ctaUrl);
    }
    if (btns[1] && block.ctaLabel2 && !btns[1].hasAttribute("data-video")) {
      btns[1].textContent = block.ctaLabel2;
      if (block.ctaUrl2) btns[1].setAttribute("href", block.ctaUrl2);
    }
  }

  // ---------- sitewide: nav, footer, contact details ----------
  function renderNav(navLinks) {
    if (!navLinks) return;
    const byLoc = (loc) => navLinks.filter((l) => l.location === loc).sort((a, b) => (a.order || 0) - (b.order || 0));

    const header = byLoc("header");
    const navLinksEl = document.querySelector(".nav-links");
    if (navLinksEl && header.length) {
      navLinksEl.innerHTML = header.map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join("");
    }
    const mobileMenu = document.getElementById("mobileMenu");
    if (mobileMenu && header.length) {
      const cta = mobileMenu.lastElementChild; // the trailing "Book..." button, kept as-is
      mobileMenu.innerHTML = header.map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join("");
      if (cta) mobileMenu.appendChild(cta);
    }

    document.querySelectorAll(".footer-col").forEach((col) => {
      const h5 = col.querySelector("h5");
      const ul = col.querySelector("ul");
      if (!h5 || !ul) return;
      let loc = null;
      if (h5.textContent.trim() === "Studio") loc = "footer_studio";
      else if (h5.textContent.trim() === "Company") loc = "footer_company";
      else if (h5.textContent.trim() === "Contact") loc = "footer_contact";
      if (!loc) return;
      const items = byLoc(loc);
      if (!items.length) return;
      ul.innerHTML = items.map((l) => `<li><a href="${esc(l.url)}">${esc(l.label)}</a></li>`).join("");
    });
  }

  function renderSiteSettings(settings) {
    if (!settings) return;
    const s = settings[0];
    if (!s) return;

    if (s.email) {
      document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
        a.setAttribute("href", "mailto:" + s.email);
        if (!a.querySelector("*")) a.textContent = s.email;
      });
    }
    if (s.phone) {
      const telHref = "tel:+1" + s.phone.replace(/[^\d]/g, "").slice(-10);
      document.querySelectorAll('a[href^="tel:"]').forEach((a) => {
        a.setAttribute("href", telHref);
        if (!a.querySelector("*")) a.textContent = s.phone;
      });
    }
    document.querySelectorAll(".contact-detail").forEach((row) => {
      const label = row.querySelector("b");
      const value = row.querySelector("span");
      if (!label || !value) return;
      const key = label.textContent.trim().toLowerCase();
      if (key === "email" && s.email) value.textContent = s.email;
      if (key === "phone" && s.phone) value.textContent = s.phone;
      if (key === "studio" && s.city) value.textContent = s.city;
    });

    const socialMap = { Instagram: s.instagramUrl, LinkedIn: s.linkedinUrl, YouTube: s.youtubeUrl };
    document.querySelectorAll(".footer-social a, .nav-cta a[aria-label]").forEach((a) => {
      const label = a.getAttribute("aria-label");
      if (label && socialMap[label]) a.setAttribute("href", socialMap[label]);
    });

    // Footer "about" paragraph + bottom-bar tagline used to be a "footer_about"
    // row duplicated inside every page's content-blocks collection. Since it's
    // identical sitewide, it now lives once here on the shared site_settings
    // item instead of being repeated 7 times across the per-page collections.
    if (s.footerAbout) {
      document.querySelectorAll(".footer-about p").forEach((p) => { p.textContent = s.footerAbout; });
    }
    if (s.footerTagline) {
      const tagline = document.querySelector(".footer-bottom span:last-child");
      if (tagline) tagline.textContent = s.footerTagline;
    }
  }

  // ---------- content blocks (headings/paragraphs/ctas) ----------
  // The bgImageUrl/bgVideoUrl CMS fields are Wix Data IMAGE/VIDEO field
  // types, so picking a file in the Wix dashboard's Media Manager (instead
  // of pasting a URL) stores it as a Wix Media identifier, e.g.
  // "wix:image://v1/<fileId>/<filename>#..." or "wix:video://v1/<fileId>/<filename>#...",
  // not a plain web URL. This resolves either form (or a plain http(s) URL,
  // still supported) to a real, publicly loadable URL.
  function resolveWixMediaUrl(value) {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value; // already a plain web URL
    const match = /^wix:(image|video):\/\/v1\/([^/]+)\//.exec(value);
    if (!match) return value;
    const fileId = match[2];
    return match[1] === "image"
      ? "https://static.wixstatic.com/media/" + fileId
      : "https://video.wixstatic.com/video/" + fileId + "/file";
  }

  // A Wix Media Manager video identifier carries its own auto-extracted
  // poster frame in a #posterUri=... fragment, e.g.
  // "wix:video://v1/<fileId>/clip.mp4#posterUri=<fileId>f000.jpg&...". If a
  // hero block sets bgVideoUrl but leaves bgImageUrl blank (picking a video
  // straight from Media Manager doesn't require also hand-picking a poster
  // image), this pulls that built-in frame out so the background/video
  // poster still has something real to show instead of nothing.
  function getWixVideoPosterUrl(value) {
    if (!value) return "";
    const match = /posterUri=([^&]+)/.exec(value);
    if (!match) return "";
    return "https://static.wixstatic.com/media/" + decodeURIComponent(match[1]);
  }

  // Applies a CMS-managed hero background: a video (if bgVideoUrl is set)
  // layered over the existing CSS background-image, or just a swapped-in
  // background image (bgImageUrl). Leaves the section alone if neither is set.
  function renderHeroBackground(hero) {
    const heroBg = document.querySelector(".hero-bg");
    if (!hero || !heroBg) return;

    const imageUrl = resolveWixMediaUrl(hero.bgImageUrl) || getWixVideoPosterUrl(hero.bgVideoUrl);
    if (imageUrl) heroBg.style.backgroundImage = "url('" + imageUrl.replace(/'/g, "%27") + "')";

    const videoUrl = resolveWixMediaUrl(hero.bgVideoUrl);
    let video = heroBg.querySelector("video");
    if (videoUrl) {
      if (!video) {
        video = document.createElement("video");
        video.muted = true;
        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        video.setAttribute("loop", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("aria-hidden", "true");
        heroBg.insertBefore(video, heroBg.firstChild);
      }
      if (imageUrl) video.setAttribute("poster", imageUrl);
      if (video.getAttribute("src") !== videoUrl) {
        video.setAttribute("src", videoUrl);
        video.load();
      }
      video.play().catch(() => {}); // ignore autoplay-blocked errors; poster/image still shows
    } else if (video) {
      video.remove();
    }
  }

  function renderContentBlocksHome(blocks) {
    const hero = byBlockKey(blocks, "hero");
    renderHeroBackground(hero);
    const heroInner = document.querySelector(".hero-inner");
    if (hero && heroInner) {
      const spans = heroInner.querySelectorAll(".hero-title .htl");
      if (hero.heading && spans.length === 3) {
        const parts = hero.heading.split("|");
        if (parts.length === 3) {
          spans[0].textContent = parts[0];
          spans[1].textContent = parts[1];
          spans[2].textContent = parts[2];
        }
      }
      const preview = heroInner.querySelector(".hero-preview");
      if (preview && hero.body && !preview.querySelector("a")) preview.textContent = hero.body;
      fillCtas(heroInner, hero);
    }

    fillHead(document.querySelector(".reel-head"), byBlockKey(blocks, "reel_intro"));

    const movementBlock = byBlockKey(blocks, "movement");
    fillHead(document.querySelector(".movement-inner"), movementBlock, { subSelector: "p" });

    const philosophyBlock = byBlockKey(blocks, "philosophy");
    const philosophyCol = document.querySelector(".philosophy-inner > div:not(.philosophy-media)");
    if (philosophyBlock && philosophyCol) {
      const eyebrowEl = philosophyCol.querySelector(".eyebrow");
      if (eyebrowEl && philosophyBlock.eyebrow) eyebrowEl.textContent = philosophyBlock.eyebrow;
      const quoteEl = philosophyCol.querySelector(".philosophy-quote");
      if (quoteEl && philosophyBlock.heading) quoteEl.textContent = philosophyBlock.heading;
      const textWrap = philosophyCol.querySelector(".philosophy-text");
      if (textWrap && philosophyBlock.body) {
        const paras = philosophyBlock.body.split("||");
        textWrap.innerHTML = paras.map((p) => `<p>${esc(p)}</p>`).join("");
      }
      fillCtas(philosophyCol, philosophyBlock);
    }
    renderMediaImage(document.querySelector(".philosophy-media"), philosophyBlock);

    fillHead(document.querySelector("#services .section-head"), byBlockKey(blocks, "services_intro"));
    fillHead(document.querySelector("#sets .section-head"), byBlockKey(blocks, "sets_intro"));
    fillHead(document.querySelector(".why-strip .section-head"), byBlockKey(blocks, "why_intro"));
    fillHead(document.querySelector("#process .section-head"), byBlockKey(blocks, "process_intro"));

    const bundlesIntro = byBlockKey(blocks, "bundles_intro");
    fillHead(document.querySelector("#bundles .section-head"), bundlesIntro);
    const bundleNote = document.querySelector("#bundles .bundle-note");
    if (bundleNote && bundlesIntro && bundlesIntro.body) bundleNote.textContent = bundlesIntro.body;

    const corporateBlock = byBlockKey(blocks, "corporate");
    const corporatePanel = document.querySelector(".corporate-panel > div:not(.corporate-list)");
    if (corporateBlock && corporatePanel) {
      fillHead(corporatePanel, corporateBlock, { headingSelector: "h2", subSelector: "p" });
      fillCtas(corporatePanel, corporateBlock);
    }

    fillHead(document.querySelector(".final-cta"), byBlockKey(blocks, "final_cta"), { subSelector: ".final-cta p, p" });
    const finalCtaHome = byBlockKey(blocks, "final_cta");
    const finalCtaHomeEl = document.querySelector(".final-cta .container");
    if (finalCtaHomeEl && finalCtaHome) fillCtas(finalCtaHomeEl, finalCtaHome);

    fillHead(document.querySelector("#reviews .section-head"), byBlockKey(blocks, "reviews_intro"));

    const contactBlock = byBlockKey(blocks, "contact_intro");
    const contactInfo = document.querySelector(".contact-info");
    if (contactBlock && contactInfo) {
      fillHead(contactInfo, contactBlock, { headingSelector: "h2", subSelector: "p" });
    }
  }

  function renderContentBlocksBooking(blocks) {
    const hero = byBlockKey(blocks, "hero");
    fillHead(document.querySelector(".booking-hero"), hero, { headingSelector: "h1", subSelector: "p" });

    const formIntro = byBlockKey(blocks, "form_intro");
    const panel = document.querySelector(".booking-form-panel");
    if (panel && formIntro) {
      const h2 = panel.querySelector("h2");
      if (h2 && formIntro.heading) h2.textContent = formIntro.heading;
      const p = panel.querySelector("p");
      if (p && formIntro.body) p.textContent = formIntro.body;
    }
  }

  function renderContentBlocksOnsite(blocks) {
    const heroInner = document.querySelector(".hero-inner");
    const hero = byBlockKey(blocks, "hero");
    if (heroInner && hero) {
      fillHead(heroInner, hero, { headingSelector: "h1", subSelector: "p" });
      fillCtas(heroInner, hero);
    }
    renderHeroBackground(hero);

    // The "Track Record" section that used to be heads[0] here was removed
    // from the page entirely, so this list is now exactly the 4 remaining
    // .section-head elements in document order -- included, packages,
    // featured, how-it-works.
    const heads = document.querySelectorAll(".section-head");
    fillHead(heads[0], byBlockKey(blocks, "included_intro"));
    fillHead(heads[1], byBlockKey(blocks, "packages_intro"));
    fillHead(heads[2], byBlockKey(blocks, "featured_intro"));
    fillHead(heads[3], byBlockKey(blocks, "how_intro"));

    const whatItIs = byBlockKey(blocks, "what_it_is");
    const whatItIsCol = document.querySelector(".philosophy-inner > div:not(.philosophy-media)");
    if (whatItIs && whatItIsCol) {
      const eyebrowEl = whatItIsCol.querySelector(".eyebrow");
      if (eyebrowEl && whatItIs.eyebrow) eyebrowEl.textContent = whatItIs.eyebrow;
      const quoteEl = whatItIsCol.querySelector(".philosophy-quote");
      if (quoteEl && whatItIs.heading) quoteEl.textContent = whatItIs.heading;
      const textWrap = whatItIsCol.querySelector(".philosophy-text p");
      if (textWrap && whatItIs.body) textWrap.textContent = whatItIs.body;
    }
    renderMediaImage(document.querySelector(".philosophy-media"), whatItIs);

    const coverage = byBlockKey(blocks, "coverage");
    const coverageTextCol = document.querySelector(".coverage-panel > div:not(.coverage-visual)");
    if (coverage && coverageTextCol) {
      fillHead(coverageTextCol, coverage, { headingSelector: "h2", subSelector: "p" });
      const note = coverageTextCol.querySelector(".coverage-note");
      if (note && coverage.body) note.textContent = coverage.body;
    }

    const finalCta = byBlockKey(blocks, "final_cta");
    fillHead(document.querySelector(".final-cta"), finalCta);
    const finalCtaEl = document.querySelector(".final-cta .container");
    if (finalCtaEl && finalCta) fillCtas(finalCtaEl, finalCta);
  }

  function renderContentBlocksSets(blocks) {
    const hero = byBlockKey(blocks, "hero");
    fillHead(document.querySelector(".hero-inner"), hero, { headingSelector: "h1", subSelector: "p" });
    const heroInner = document.querySelector(".hero-inner");
    if (heroInner && hero) fillCtas(heroInner, hero);

    fillHead(document.querySelector("#sets .section-head"), byBlockKey(blocks, "intro"));
    fillHead(document.querySelector("#guests .section-head"), byBlockKey(blocks, "guests_intro"));

    const finalCta = byBlockKey(blocks, "final_cta");
    fillHead(document.querySelector(".final-cta"), finalCta);
    const finalCtaEl = document.querySelector(".final-cta .container");
    if (finalCtaEl && finalCta) fillCtas(finalCtaEl, finalCta);
  }

  function renderContentBlocksFaq(blocks) {
    const hero = byBlockKey(blocks, "hero");
    fillHead(document.querySelector(".hero-inner"), hero, { headingSelector: "h1", subSelector: "p" });
    renderHeroBackground(hero);

    const finalCta = byBlockKey(blocks, "final_cta");
    fillHead(document.querySelector(".final-cta"), finalCta);
    const finalCtaEl = document.querySelector(".final-cta .container");
    if (finalCtaEl && finalCta) fillCtas(finalCtaEl, finalCta);
  }

  function renderContentBlocksBlog(blocks) {
    const hero = byBlockKey(blocks, "hero");
    fillHead(document.querySelector(".hero-inner"), hero, { headingSelector: "h1", subSelector: "p" });
    renderHeroBackground(hero);

    const sidebarCta = byBlockKey(blocks, "sidebar_cta");
    const cta = document.querySelector(".sidebar-cta");
    if (sidebarCta && cta) {
      const h4 = cta.querySelector("h4");
      if (h4 && sidebarCta.heading) h4.textContent = sidebarCta.heading;
      const p = cta.querySelector("p");
      if (p && sidebarCta.body) p.textContent = sidebarCta.body;
      const btn = cta.querySelector("a.btn");
      if (btn && sidebarCta.ctaLabel) {
        btn.textContent = sidebarCta.ctaLabel;
        if (sidebarCta.ctaUrl) btn.setAttribute("href", sidebarCta.ctaUrl);
      }
    }
  }

  function renderContentBlocksPricing(blocks) {
    const hero = byBlockKey(blocks, "hero");
    fillHead(document.querySelector(".hero-inner"), hero, { headingSelector: "h1", subSelector: "p" });
    renderHeroBackground(hero);

    fillHead(document.querySelector("#included .section-head"), byBlockKey(blocks, "included_intro"));
    fillHead(document.querySelector("#pricing-tiers .section-head"), byBlockKey(blocks, "tiers_intro"));

    const finalCta = byBlockKey(blocks, "final_cta");
    fillHead(document.querySelector(".final-cta"), finalCta);
    const finalCtaEl = document.querySelector(".final-cta .container");
    if (finalCtaEl && finalCta) fillCtas(finalCtaEl, finalCta);
  }

  // ---------- collection-driven repeating sections ----------
  function renderServices(services) {
    if (!services) return;
    const list = document.querySelector("#services .acc-list");
    if (!list) return;
    list.innerHTML = services
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((s, i) => `
        <div class="acc-item${i === 0 ? " is-open" : ""}">
          <button class="acc-header" aria-expanded="${i === 0 ? "true" : "false"}">
            <div class="acc-header-left">
              <div class="acc-icon">${ICON_SERVICE}</div>
              <div class="acc-title-wrap"><span class="acc-title">${esc(s.title)}</span></div>
            </div>
            <span class="acc-chevron">${ICON_CHEVRON}</span>
          </button>
          <div class="acc-panel-wrap"><div class="acc-panel"><div class="acc-panel-inner"><p>${esc(s.description)}</p></div></div></div>
        </div>`)
      .join("");
  }

  // Only "Event Filming" currently exists as a real, separately-priced Wix
  // Bookings service. The other sets are room configurations bookable at
  // the standard hourly Studio Rental rate, not their own line item, so
  // their "Book This Set" sends visitors to pricing.html (the real booking
  // system) instead of faking a mismatched price in the live modal. If you
  // create dedicated Wix services for those sets later, add them here.
  const SET_LIVE_SERVICES = {
    "event-filming": { id: "713f9b3d-8419-454c-9730-f26bec6b8684", price: 450 }
  };

  function renderSets(sets) {
    if (!sets) return;
    const grid = document.querySelector("#sets .sets-grid");
    if (grid) {
      grid.innerHTML = sets
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((s) => {
          const live = SET_LIVE_SERVICES[s.bookingParam];
          const cta = live
            ? `<button type="button" class="btn btn-ghost btn-sm btn-block" data-book-service-id="${esc(live.id)}" data-book-service-name="${esc(s.name)}, $${live.price}" data-book-price="${live.price}" data-book-desc="${esc(s.description)}">Book This Set</button>`
            : `<a href="pricing.html" class="btn btn-ghost btn-sm btn-block">Book This Set</a>`;
          // The "click any cover to see more photos + what's included" modal
          // (main.js's window.AguybSetModal) reads its content off these
          // data-set-* attributes. This used to only render the plain <img>
          // + play layer with none of them, so the modal silently stopped
          // working the moment this CMS render replaced the static cards.
          // Sets are photo-only -- combine the cover (posterImage) with any
          // extra photos added via the galleryImages field in Wix so the
          // modal's photo strip shows everything the owner has uploaded.
          // posterImage/galleryImages come straight from the Wix Content
          // Manager, so they're wix:image://v1/... references, not plain
          // URLs -- resolveWixMediaUrl() is what turns those into real
          // static.wixstatic.com URLs a browser can actually load. This was
          // missed here (unlike every other image field on the site), so it
          // only "worked" while this collection happened to hold plain URLs;
          // the moment a real photo got uploaded through the Wix dashboard,
          // the raw wix:image:// string was landing in <img src> and
          // silently failing to load.
          const posterImage = resolveWixMediaUrl(s.posterImage);
          const galleryImages = Array.isArray(s.galleryImages)
            ? s.galleryImages.map((img) => resolveWixMediaUrl(img)).filter(Boolean)
            : [];
          const images = JSON.stringify([posterImage, ...galleryImages].filter(Boolean));
          const included = JSON.stringify(Array.isArray(s.included) ? s.included : []);
          return `
          <div class="set-card">
            <div class="set-media" data-set-gallery
              data-set-name="${esc(s.name)}"
              data-set-price="${esc((s.description || "").split(" · ")[0] || "")}"
              data-set-desc="${esc(s.description)}"
              data-set-images='${esc(images)}'
              data-set-included='${esc(included)}'>
              <img src="${esc(posterImage)}" alt="${esc(s.name)}">
              <div class="set-gallery-badge">${ICON_GALLERY}</div>
            </div>
            <div class="set-body">
              <h4>${esc(s.name)}</h4>
              <p>${esc(s.description)}</p>
              <div class="set-actions">${cta}</div>
            </div>
          </div>`;
        })
        .join("");
      if (window.AguybBookingFlow) window.AguybBookingFlow.bindTriggers();
      if (window.AguybSetModal) window.AguybSetModal.bindTriggers();
    }
    const sidebarSets = document.querySelector(".sidebar-sets");
    if (sidebarSets) {
      sidebarSets.innerHTML = sets
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((s) => `
          <a class="sidebar-set-card" href="sets.html">
            <img src="${esc(resolveWixMediaUrl(s.posterImage))}" alt="${esc(s.name)}">
            <div><b>${esc(s.name)}</b><span>${esc(s.description)}</span></div>
          </a>`)
        .join("");
    }
  }

  function renderBundles(bundles) {
    if (!bundles) return;
    const grid = document.querySelector("#bundles .bundles-grid");
    if (!grid) return;
    grid.innerHTML = bundles
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((b) => {
        const isMonthly = /month/i.test(b.period || "");
        const priceHtml = isMonthly ? `${esc(b.price)}<span>/mo</span>` : esc(b.price);
        const featureLines = (b.features || "").split("\n").filter(Boolean);
        const cta = b.serviceId
          ? `<button type="button" class="btn ${b.featured ? "btn-primary" : "btn-ghost"} btn-block" data-book-service-id="${esc(b.serviceId)}" data-book-service-name="${esc(b.name)} — ${esc(b.price)}" data-book-price="${priceNum(b.price)}" data-book-desc="${esc(b.tagline || "")}">Check Availability &amp; Book</button>`
          : `<a href="booking.html?bundle=${esc(b.bookingParam)}" class="btn ${b.featured ? "btn-primary" : "btn-ghost"} btn-block">${b.bookingParam === "corporate-partner" ? "Talk to Our Team" : "Book This Bundle"}</a>`;
        return `
          <div class="bundle-card glass${b.featured ? " featured" : ""}">
            ${b.badge ? `<div class="bundle-badge">${esc(b.badge)}</div>` : ""}
            <div class="bundle-name">${esc(b.name)}</div>
            ${b.tagline ? `<p class="bundle-desc">${esc(b.tagline)}</p>` : ""}
            <div class="bundle-price">${priceHtml}</div>
            <div class="bundle-cadence">${esc(b.period)}</div>
            ${b.savingsLabel ? `<div class="bundle-savings">${esc(b.savingsLabel)}</div>` : ""}
            <ul class="bundle-features">${featureLines.map((f) => `<li>${ICON_CHECK} ${esc(f)}</li>`).join("")}</ul>
            ${cta}
          </div>`;
      })
      .join("");
    if (window.AguybBookingFlow) window.AguybBookingFlow.bindTriggers();
  }

  function renderReviews(reviews) {
    if (!reviews) return;
    const grid = document.querySelector("#reviews .reviews-grid");
    if (!grid) return;
    grid.innerHTML = reviews
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((r) => `
        <div class="review-card glass">
          <div class="review-stars">${ICON_STAR.repeat(Math.max(1, Math.min(5, r.rating || 5)))}</div>
          <p class="review-quote">${esc(r.quote)}</p>
          <div class="review-person">
            <div class="review-avatar">${esc((r.name || "?").charAt(0))}</div>
            <div><b>${esc(r.name)}</b><span>${esc(r.role)}</span></div>
          </div>
        </div>`)
      .join("");
  }

  // Replaces the "Why AGUYB" strip: a sliding track of short-form clip
  // cards, each opens in the site's existing video lightbox on click.
  function renderShortformClips(clips) {
    if (!clips) return;
    const track = document.getElementById("shortformTrack");
    if (!track) return;
    const sorted = clips.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const cardHtml = (c) => {
      const poster = resolveWixMediaUrl(c.posterUrl);
      const video = resolveWixMediaUrl(c.videoUrl);
      const caption = `${c.title || ""}${c.subtitle ? " — " + c.subtitle : ""}`;
      return `
        <div class="shortform-card" data-video="${esc(video)}" data-poster="${esc(poster)}" data-caption="${esc(caption)}" data-vertical="true">
          <div class="card-photo">
            <img${poster ? ` src="${esc(poster)}"` : ` class="img-fallback"`} alt="Short-form clip cover">
            <div class="card-play">${ICON_PLAY}</div>
          </div>
          <div class="card-info"><b>${esc(c.title)}</b><span>${esc(c.subtitle)}</span></div>
        </div>`;
    };
    // Duplicate the set once so the CSS scroll animation loops seamlessly,
    // same trick used by the podcast reel above this section.
    track.innerHTML = sorted.map(cardHtml).join("") + sorted.map(cardHtml).join("");
    if (window.AguybLightbox) window.AguybLightbox.bindTriggers();
  }

  // "Recent Work — Podcasts We've Produced": the sliding row of past
  // sessions at the top of the home page. Each card can now also show who
  // it was filmed for, and the whole row is editable from the Wix
  // dashboard's `recent_work` collection instead of being hardcoded.
  function renderRecentWork(items) {
    if (!items) return;
    const track = document.getElementById("recentWorkTrack");
    if (!track) return;
    const sorted = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const cardHtml = (w) => {
      const poster = resolveWixMediaUrl(w.posterUrl);
      const video = resolveWixMediaUrl(w.videoUrl);
      const captionParts = [w.title, w.subtitle].filter(Boolean).join(" — ");
      const caption = w.client ? `${captionParts} · Filmed for ${w.client}` : captionParts;
      return `
        <div class="reel-card" data-video="${esc(video)}" data-poster="${esc(poster)}" data-caption="${esc(caption)}">
          <div class="card-photo">
            <img${poster ? ` src="${esc(poster)}"` : ` class="img-fallback"`} alt="Podcast episode cover">
            <div class="card-play">${ICON_PLAY}</div>
          </div>
          <div class="card-info"><b>${esc(w.title)}</b><span>${esc(w.subtitle)}</span>${w.client ? `<span class="reel-client">Filmed for ${esc(w.client)}</span>` : ""}</div>
        </div>`;
    };
    // Duplicate the set once so the CSS scroll animation loops seamlessly,
    // same trick used by the short-form clip track below this section.
    track.innerHTML = sorted.map(cardHtml).join("") + sorted.map(cardHtml).join("");
    if (window.AguybLightbox) window.AguybLightbox.bindTriggers();
  }

  // "Notable Guests Who've Stepped Into the Studio" gallery on sets.html.
  function renderNotableGuests(guests) {
    if (!guests) return;
    const grid = document.getElementById("guestsGrid");
    if (!grid) return;
    const sorted = guests.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    grid.innerHTML = sorted
      .map((g) => {
        const photo = resolveWixMediaUrl(g.photoUrl);
        return `
          <div class="guest-photo-card">
            <img${photo ? ` src="${esc(photo)}"` : ` class="img-fallback"`} alt="${esc(g.name)}">
            <div class="guest-caption"><b>${esc(g.name)}</b><span>${esc(g.role)}</span></div>
          </div>`;
      })
      .join("");
  }

  // Generic renderer for the 3 "how it works" step grids (home, onsite,
  // booking). Each page now has its own dedicated Wix Data collection
  // (home_process_steps / onsite_process_steps / booking_process_steps)
  // instead of one shared table filtered client-side by a "page" field.
  function renderProcessGrid(steps, selector, cardClass) {
    if (!steps) return;
    const grid = document.querySelector(selector);
    if (!grid) return;
    const sorted = steps.slice().sort((a, b) => (a.order || a.stepIndex || 0) - (b.order || b.stepIndex || 0));
    grid.innerHTML = sorted.map((s) => `
      <div class="${cardClass || "process-step"}">
        <div class="process-index">${String(s.stepIndex).padStart(2, "0")}</div>
        <h4>${esc(s.title)}</h4>
        <p>${esc(s.description)}</p>
      </div>`).join("");
  }

  // The photo carousel inside the home page's "Why It Works" section
  // (.philosophy-gallery, next to the .philosophy-media-main hero shot).
  // Fully owner-editable from the Wix dashboard's home_philosophy_gallery
  // collection -- add, remove, or reorder rows there and this renders
  // however many slides exist, no fixed count. Rebinds the photo lightbox
  // (click a slide to enlarge) and the carousel arrows/dots afterward.
  function renderPhilosophyGallery(items) {
    if (!items) return;
    const gallery = document.querySelector(".philosophy-gallery");
    const track = gallery ? gallery.querySelector(".gallery-track") : null;
    if (!gallery || !track) return;
    const sorted = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    track.innerHTML = sorted.map((g) => {
      const url = resolveWixMediaUrl(g.image);
      const caption = g.caption || "";
      return `
        <div class="gallery-slide">
          <div class="gallery-slide-photo"${url ? ` data-gallery-image="${esc(url)}" data-gallery-caption="${esc(caption)}"` : ""}>
            <img${url ? ` src="${esc(url)}"` : ` class="img-fallback"`} alt="${esc(caption || "AGUYB Studios")}">
          </div>
          <div class="gallery-caption"><span>${esc(caption)}</span><div class="gallery-dots"></div></div>
        </div>`;
    }).join("");
    if (window.AguybPhotoLightbox) window.AguybPhotoLightbox.bindTriggers();
    if (window.AguybGalleryCarousel) window.AguybGalleryCarousel.bindTriggers();
  }

  function renderOnsitePackages(pkgs) {
    if (!pkgs) return;
    const hourly = pkgs.find((p) => p.bookingParam === "on-site");
    if (hourly) {
      const priceEl = document.querySelector(".included-price .price");
      if (priceEl) {
        const parts = (hourly.price || "").split(" / ");
        priceEl.innerHTML = `${esc(parts[0])}${parts[1] ? `<span style="font-size:16px;font-weight:500;color:var(--text-2);"> / ${esc(parts[1])}</span>` : ""}`;
      }
    }

    const packageCards = pkgs.filter((p) => p.bookingParam !== "on-site").sort((a, b) => (a.order || 0) - (b.order || 0));
    const grid = document.querySelectorAll(".bundles-grid")[document.querySelectorAll(".bundles-grid").length - 1];
    if (grid && packageCards.length && document.getElementById("included")) {
      const featuresHtml = `
        <li>${ICON_CHECK} Full mobile camera, lighting &amp; audio setup</li>
        <li>${ICON_CHECK} On-site technician included</li>
        <li>${ICON_CHECK} Available within our Jacksonville coverage area</li>`;
      grid.innerHTML = packageCards.map((p) => `
        <div class="bundle-card glass${p.badge ? " featured" : ""}">
          ${p.imageUrl ? `<div class="bundle-media"><img src="${esc(p.imageUrl)}" alt="${esc(p.name)}"></div>` : ""}
          ${p.badge ? `<div class="bundle-badge">${esc(p.badge)}</div>` : ""}
          <div class="bundle-name">${esc(p.name)}</div>
          <p class="bundle-desc">We bring the podcast setup to you. Record from your office, event, or space with a full mobile setup including cameras, lighting, audio, and an on-site technician.</p>
          <div class="bundle-price">${esc(p.price)}</div>
          <div class="bundle-cadence">${esc(p.duration)} &middot; Requires confirmation</div>
          <ul class="bundle-features">${featuresHtml}</ul>
          <a href="booking.html?bundle=${esc(p.bookingParam)}" class="btn ${p.badge ? "btn-primary" : "btn-ghost"} btn-block">Book This Package</a>
        </div>`).join("");
    }
  }

  // "Featured Projects — Recorded Off Site" grid on on-site-production.html.
  // Fully owner-editable from the Wix dashboard's onsite_featured_projects
  // collection -- add, remove, or reorder rows there and this grid follows,
  // no fixed card count.
  function renderFeaturedProjects(items) {
    if (!items) return;
    const grid = document.querySelector(".featured-grid");
    if (!grid) return;
    const sorted = items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    grid.innerHTML = sorted.map((p) => {
      const url = resolveWixMediaUrl(p.image);
      return `
        <div class="featured-card">
          <img${url ? ` src="${esc(url)}"` : ` class="img-fallback"`} alt="${esc(p.label || "On-site recording session")}">
          <span>${esc(p.label || "")}</span>
        </div>`;
    }).join("");
  }

  function renderCoverageAreas(areas) {
    if (!areas) return;
    const list = document.querySelector(".coverage-list");
    if (!list) return;
    list.innerHTML = areas
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((a) => `<span class="glass">${esc(a.name)}</span>`)
      .join("");
  }

  function renderFaq(items) {
    if (!items) return;
    const list = document.querySelector(".acc-list");
    if (!list || !document.querySelector(".narrow .acc-list, .container.narrow .acc-list")) return;
    list.innerHTML = items
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((f, i) => `
        <div class="acc-item${i === 0 ? " is-open" : ""}">
          <button class="acc-header" aria-expanded="${i === 0 ? "true" : "false"}">
            <div class="acc-header-left"><span class="acc-title">${esc(f.question)}</span></div>
            <span class="acc-chevron">${ICON_CHEVRON}</span>
          </button>
          <div class="acc-panel-wrap"><div class="acc-panel"><div class="acc-panel-inner"><p>${esc(f.answer)}</p></div></div></div>
        </div>`)
      .join("");
  }

  function renderBlogPosts(posts) {
    if (!posts) return;
    const grid = document.querySelector(".blog-posts");
    if (!grid) return;
    grid.innerHTML = posts
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((p) => `
        <article class="post-card reveal">
          <div class="post-media"><img src="${esc(resolveWixMediaUrl(p.image))}" alt="Blog post cover"></div>
          <div class="post-body">
            <div class="post-meta"><span class="post-tag">${esc(p.category)}</span><span>&middot;</span><span>${esc(p.postDate)}</span></div>
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.excerpt)}</p>
            <a href="${p.slug ? "articles/" + esc(p.slug) + ".html" : "#"}" class="post-readmore">Read More &rarr;</a>
          </div>
        </article>`)
      .join("");
  }

  // Fetches a single item from a collection by an exact-match field, e.g.
  // looking up one blog post by its slug for the article detail page.
  async function queryCollectionOneBy(dataCollectionId, fieldName, fieldValue) {
    try {
      const token = await getVisitorToken();
      const res = await fetch("https://www.wixapis.com/wix-data/v2/items/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          dataCollectionId,
          query: { filter: { [fieldName]: fieldValue }, paging: { limit: 1 } }
        })
      });
      if (!res.ok) throw new Error("CMS query failed for " + dataCollectionId + ": " + res.status);
      const json = await res.json();
      const items = json.dataItems || [];
      return items.length ? items[0].data : null;
    } catch (err) {
      console.warn("[AGUYB CMS] Falling back to static content for", dataCollectionId, err.message);
      return null; // signal "leave the static HTML alone"
    }
  }

  // Fills in the single-article page (article.html templates under /articles)
  // from the matching blog_posts CMS item, keyed by the page's data-post-slug.
  // The static HTML already on the page is a complete, real article, this
  // only overwrites it if the CMS item was edited since these pages were built.
  function renderArticlePage(post) {
    if (!post) return;

    const imageUrl = resolveWixMediaUrl(post.image);

    const metaEl = document.querySelector(".article-meta");
    if (metaEl) {
      const spans = metaEl.querySelectorAll("span");
      if (spans[0] && post.category) spans[0].textContent = post.category;
      if (spans[2] && post.postDate) spans[2].textContent = post.postDate;
      if (spans[4] && post.author) spans[4].textContent = post.author;
    }

    const titleEl = document.querySelector(".article-title");
    if (titleEl && post.title) titleEl.textContent = post.title;

    const excerptEl = document.querySelector(".article-excerpt");
    if (excerptEl && post.excerpt) excerptEl.textContent = post.excerpt;

    const coverImg = document.querySelector(".article-cover img");
    if (coverImg && imageUrl) {
      coverImg.setAttribute("src", imageUrl);
      if (post.title) coverImg.setAttribute("alt", post.title);
    }

    const bodyEl = document.querySelector(".article-body");
    if (post.body && bodyEl) {
      bodyEl.innerHTML = post.body
        .split("\n\n")
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) =>
          block.startsWith("## ")
            ? `<h3>${esc(block.slice(3))}</h3>`
            : `<p>${esc(block)}</p>`
        )
        .join("");
    }

    const videoCard = document.querySelector(".article-video-card");
    if (videoCard) {
      const videoUrl = resolveWixMediaUrl(post.videoUrl);
      const posterUrl = imageUrl || videoCard.getAttribute("data-poster");
      if (videoUrl) videoCard.setAttribute("data-video", videoUrl); // else keep the static placeholder
      if (posterUrl) videoCard.setAttribute("data-poster", posterUrl);
      if (post.videoCaption) videoCard.setAttribute("data-caption", post.videoCaption);
      const thumbImg = videoCard.querySelector(".article-video-thumb img");
      if (thumbImg && posterUrl) thumbImg.setAttribute("src", posterUrl);
      const captionH4 = videoCard.querySelector("h4");
      if (captionH4 && post.videoCaption) captionH4.textContent = post.videoCaption;
    }
  }

  function renderPricingTiers(tiers) {
    if (!tiers) return;
    const grid = document.querySelector("#pricing-tiers .bundles-grid");
    if (!grid) return;
    grid.innerHTML = tiers
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((t) => `
        <div class="bundle-card glass${t.badge ? " featured" : ""}">
          ${t.badge ? `<div class="bundle-badge">${esc(t.badge)}</div>` : ""}
          <div class="bundle-name">${esc(t.name)}</div>
          <div class="bundle-price">$${esc(t.price)}</div>
          <div class="bundle-cadence">${esc(t.durationLabel)} studio rental</div>
          <button type="button" class="btn ${t.badge ? "btn-primary" : "btn-ghost"} btn-block" data-book-service-id="${esc(t.serviceId || "")}" data-book-service-name="${esc(t.name)} — $${esc(t.price)}" data-book-price="${priceNum(t.price)}" data-book-desc="Full access to the studio: 3 cameras, wireless mics, full lighting. ${esc(t.durationLabel || "")}.">Check Availability &amp; Book</button>
        </div>`)
      .join("");
    if (window.AguybBookingFlow) window.AguybBookingFlow.bindTriggers();
  }

  // ---------- rebind interactive behavior main.js already wired up ----------
  // main.js attaches accordion/lightbox/reveal listeners on DOMContentLoaded,
  // before this file has replaced any innerHTML. Re-run the same lightweight
  // bindings here for any elements this file just created.
  function rebindInteractivity() {
    // Same [data-acc-bound] guard main.js uses: without it, any accordion
    // header still standing from the static fallback (CMS query failed or
    // was blocked) would get a second click listener here, and the two
    // listeners firing on the same click would cancel each other out
    // (open, then immediately re-close).
    document.querySelectorAll(".acc-header:not([data-acc-bound])").forEach((header) => {
      header.dataset.accBound = "1";
      header.addEventListener("click", () => {
        const item = header.closest(".acc-item");
        const list = header.closest(".acc-list");
        const wasOpen = item.classList.contains("is-open");
        list.querySelectorAll(".acc-item").forEach((i) => {
          i.classList.remove("is-open");
          i.querySelector(".acc-header").setAttribute("aria-expanded", "false");
        });
        if (!wasOpen) {
          item.classList.add("is-open");
          header.setAttribute("aria-expanded", "true");
        }
      });
    });

    // Delegates to main.js's own lightbox binder (window.AguybLightbox),
    // which already guards against double-binding via [data-video-bound]
    // and correctly handles vertical-video framing (data-vertical="true",
    // used by the short-form clips track). This used to be a second,
    // separately-guarded copy of the same binding logic that didn't know
    // about main.js's guard flag, so every [data-video] trigger on any
    // CMS-enabled page ended up with two click listeners (one here, one in
    // main.js) and this copy silently dropped the vertical-video handling.
    if (window.AguybLightbox) window.AguybLightbox.bindTriggers();

    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));

    const navToggle = document.getElementById("navToggle");
    const mobileMenu = document.getElementById("mobileMenu");
    if (navToggle && mobileMenu) {
      mobileMenu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
          navToggle.classList.remove("active");
          mobileMenu.classList.remove("active");
          document.body.style.overflow = "";
        });
      });
    }
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    if (!PAGE) return; // page not opted into CMS rendering (missing data-page)

    try {
      const [navLinks, siteSettings] = await Promise.all([
        queryCollection("nav_links", "order"),
        queryCollection("site_settings")
      ]);

      renderNav(navLinks);
      renderSiteSettings(siteSettings);

      // Every page below now queries its own dedicated content-blocks
      // collection (e.g. home_blocks, onsite_blocks) instead of one shared
      // content_blocks table filtered client-side -- each page's CMS content
      // lives in its own clearly-labeled table in the Wix Content Manager.
      if (PAGE === "home") {
        const [services, sets, bundles, reviews, recentWork, shortformClips, processSteps, blocks, gallery] = await Promise.all([
          queryCollection("services", "order"),
          queryCollection("sets", "order"),
          queryCollection("bundles", "order"),
          queryCollection("reviews", "order"),
          queryCollection("recent_work", "order"),
          queryCollection("shortform_clips", "order"),
          queryCollection("home_process_steps"),
          queryCollection("home_blocks"),
          queryCollection("home_philosophy_gallery", "order")
        ]);
        if (blocks) renderContentBlocksHome(blocks);
        renderRecentWork(recentWork);
        renderServices(services);
        renderSets(sets);
        renderBundles(bundles);
        renderReviews(reviews);
        renderShortformClips(shortformClips);
        renderProcessGrid(processSteps, "#process .process-grid");
        renderPhilosophyGallery(gallery);
      } else if (PAGE === "booking") {
        const [processSteps, blocks] = await Promise.all([
          queryCollection("booking_process_steps"),
          queryCollection("booking_blocks")
        ]);
        if (blocks) renderContentBlocksBooking(blocks);
        renderProcessGrid(processSteps, ".booking-steps", "booking-step glass");
      } else if (PAGE === "onsite") {
        const [processSteps, onsitePackages, coverageAreas, blocks, featuredProjects] = await Promise.all([
          queryCollection("onsite_process_steps"),
          queryCollection("onsite_packages", "order"),
          queryCollection("coverage_areas", "order"),
          queryCollection("onsite_blocks"),
          queryCollection("onsite_featured_projects", "order")
        ]);
        if (blocks) renderContentBlocksOnsite(blocks);
        renderProcessGrid(processSteps, "#how-it-works .process-grid");
        renderOnsitePackages(onsitePackages);
        renderCoverageAreas(coverageAreas);
        renderFeaturedProjects(featuredProjects);
      } else if (PAGE === "faq") {
        const [faqItems, blocks] = await Promise.all([
          queryCollection("faq_items", "order"),
          queryCollection("faq_blocks")
        ]);
        if (blocks) renderContentBlocksFaq(blocks);
        renderFaq(faqItems);
      } else if (PAGE === "blog") {
        const [blogPosts, sets, blocks] = await Promise.all([
          queryCollection("blog_posts", "order"),
          queryCollection("sets", "order"),
          queryCollection("blog_blocks")
        ]);
        if (blocks) renderContentBlocksBlog(blocks);
        renderBlogPosts(blogPosts);
        renderSets(sets);
      } else if (PAGE === "sets") {
        const [sets, guests, blocks] = await Promise.all([
          queryCollection("sets", "order"),
          queryCollection("notable_guests", "order"),
          queryCollection("sets_blocks")
        ]);
        if (blocks) renderContentBlocksSets(blocks);
        renderSets(sets);
        renderNotableGuests(guests);
      } else if (PAGE === "pricing") {
        const [pricingTiers, bundles, blocks] = await Promise.all([
          queryCollection("pricing_tiers", "order"),
          queryCollection("bundles", "order"),
          queryCollection("pricing_blocks")
        ]);
        if (blocks) renderContentBlocksPricing(blocks);
        renderPricingTiers(pricingTiers);
        renderBundles(bundles);
      } else if (PAGE === "article") {
        const slug = document.body.getAttribute("data-post-slug");
        const [sets] = await Promise.all([queryCollection("sets", "order")]);
        // renderSets() only touches "#sets .sets-grid" (not present on
        // article pages) and ".sidebar-sets" -- this is what keeps the
        // "Explore Our Sets" sidebar block on every article in sync with
        // the single sets Wix collection, instead of the hardcoded
        // placeholder cards each article page used to carry.
        renderSets(sets);
        if (slug) {
          const post = await queryCollectionOneBy("blog_posts", "slug", slug);
          renderArticlePage(post);
        }
      }

      rebindInteractivity();
    } catch (err) {
      // Any unexpected failure: the static HTML already on the page is a
      // complete, correct fallback, so we just log and move on.
      console.warn("[AGUYB CMS] Render skipped:", err);
    }
  });
})();
