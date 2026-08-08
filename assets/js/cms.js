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
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>';
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

  // Applies a CMS-managed hero background: a video (if bgVideoUrl is set)
  // layered over the existing CSS background-image, or just a swapped-in
  // background image (bgImageUrl). Leaves the section alone if neither is set.
  function renderHeroBackground(hero) {
    const heroBg = document.querySelector(".hero-bg");
    if (!hero || !heroBg) return;

    const imageUrl = resolveWixMediaUrl(hero.bgImageUrl);
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
    const hero = byBlockKey(blocks, "home_hero");
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

    fillHead(document.querySelector("#services .section-head"), byBlockKey(blocks, "services_intro"));
    fillHead(document.querySelector("#sets .section-head"), byBlockKey(blocks, "sets_intro"));
    fillHead(document.querySelector(".why-strip .section-head"), byBlockKey(blocks, "why_intro"));
    fillHead(document.querySelector("#process .section-head"), byBlockKey(blocks, "process_intro_home"));

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

    fillHead(document.querySelector(".final-cta"), byBlockKey(blocks, "final_cta_home"), { subSelector: ".final-cta p, p" });
    const finalCtaHome = byBlockKey(blocks, "final_cta_home");
    const finalCtaHomeEl = document.querySelector(".final-cta .container");
    if (finalCtaHomeEl && finalCtaHome) fillCtas(finalCtaHomeEl, finalCtaHome);

    fillHead(document.querySelector("#reviews .section-head"), byBlockKey(blocks, "reviews_intro"));

    const contactBlock = byBlockKey(blocks, "contact_intro");
    const contactInfo = document.querySelector(".contact-info");
    if (contactBlock && contactInfo) {
      fillHead(contactInfo, contactBlock, { headingSelector: "h2", subSelector: "p" });
    }

    const footerAbout = byBlockKey(blocks, "footer_about");
    if (footerAbout) {
      document.querySelectorAll(".footer-about p").forEach((p) => {
        if (footerAbout.body) p.textContent = footerAbout.body;
      });
      const tagline = document.querySelector(".footer-bottom span:last-child");
      if (tagline && footerAbout.heading) tagline.textContent = footerAbout.heading;
    }
  }

  function renderContentBlocksBooking(blocks) {
    const hero = byBlockKey(blocks, "booking_hero");
    fillHead(document.querySelector(".booking-hero"), hero, { headingSelector: "h1", subSelector: "p" });

    const formIntro = byBlockKey(blocks, "booking_form_intro");
    const panel = document.querySelector(".booking-form-panel");
    if (panel && formIntro) {
      const h2 = panel.querySelector("h2");
      if (h2 && formIntro.heading) h2.textContent = formIntro.heading;
      const p = panel.querySelector("p");
      if (p && formIntro.body) p.textContent = formIntro.body;
    }

    const footerAbout = byBlockKey(blocks, "footer_about");
    if (footerAbout) {
      document.querySelectorAll(".footer-about p").forEach((p) => {
        if (footerAbout.body) p.textContent = footerAbout.body;
      });
      const tagline = document.querySelector(".footer-bottom span:last-child");
      if (tagline && footerAbout.heading) tagline.textContent = footerAbout.heading;
    }
  }

  function renderContentBlocksOnsite(blocks) {
    const heroInner = document.querySelector(".hero-inner");
    const hero = byBlockKey(blocks, "onsite_hero");
    if (heroInner && hero) {
      fillHead(heroInner, hero, { headingSelector: "h1", subSelector: "p" });
      fillCtas(heroInner, hero);
    }

    const heads = document.querySelectorAll(".section-head");
    fillHead(heads[0], byBlockKey(blocks, "onsite_track_record"));
    fillHead(heads[1], byBlockKey(blocks, "onsite_included_intro"));
    const packagesIntro = byBlockKey(blocks, "onsite_packages_intro");
    fillHead(heads[2], packagesIntro);
    fillHead(heads[3], byBlockKey(blocks, "onsite_featured_intro"));
    fillHead(heads[4], byBlockKey(blocks, "onsite_how_intro"));

    const whatItIs = byBlockKey(blocks, "onsite_what_it_is");
    const whatItIsCol = document.querySelector(".philosophy-inner > div:not(.philosophy-media)");
    if (whatItIs && whatItIsCol) {
      const eyebrowEl = whatItIsCol.querySelector(".eyebrow");
      if (eyebrowEl && whatItIs.eyebrow) eyebrowEl.textContent = whatItIs.eyebrow;
      const quoteEl = whatItIsCol.querySelector(".philosophy-quote");
      if (quoteEl && whatItIs.heading) quoteEl.textContent = whatItIs.heading;
      const textWrap = whatItIsCol.querySelector(".philosophy-text p");
      if (textWrap && whatItIs.body) textWrap.textContent = whatItIs.body;
    }

    const coverage = byBlockKey(blocks, "onsite_coverage");
    const coverageTextCol = document.querySelector(".coverage-panel > div:not(.coverage-visual)");
    if (coverage && coverageTextCol) {
      fillHead(coverageTextCol, coverage, { headingSelector: "h2", subSelector: "p" });
      const note = coverageTextCol.querySelector(".coverage-note");
      if (note && coverage.body) note.textContent = coverage.body;
    }

    const finalCta = byBlockKey(blocks, "onsite_final_cta");
    fillHead(document.querySelector(".final-cta"), finalCta);
    const finalCtaEl = document.querySelector(".final-cta .container");
    if (finalCtaEl && finalCta) fillCtas(finalCtaEl, finalCta);

    const footerAbout = byBlockKey(blocks, "footer_about");
    if (footerAbout) {
      document.querySelectorAll(".footer-about p").forEach((p) => {
        if (footerAbout.body) p.textContent = footerAbout.body;
      });
      const tagline = document.querySelector(".footer-bottom span:last-child");
      if (tagline && footerAbout.heading) tagline.textContent = footerAbout.heading;
    }
  }

  function renderContentBlocksFaq(blocks) {
    const hero = byBlockKey(blocks, "faq_hero");
    fillHead(document.querySelector(".hero-inner"), hero, { headingSelector: "h1", subSelector: "p" });

    const finalCta = byBlockKey(blocks, "faq_final_cta");
    fillHead(document.querySelector(".final-cta"), finalCta);
    const finalCtaEl = document.querySelector(".final-cta .container");
    if (finalCtaEl && finalCta) fillCtas(finalCtaEl, finalCta);

    const footerAbout = byBlockKey(blocks, "footer_about");
    if (footerAbout) {
      document.querySelectorAll(".footer-about p").forEach((p) => {
        if (footerAbout.body) p.textContent = footerAbout.body;
      });
      const tagline = document.querySelector(".footer-bottom span:last-child");
      if (tagline && footerAbout.heading) tagline.textContent = footerAbout.heading;
    }
  }

  function renderContentBlocksBlog(blocks) {
    const hero = byBlockKey(blocks, "blog_hero");
    fillHead(document.querySelector(".hero-inner"), hero, { headingSelector: "h1", subSelector: "p" });

    const sidebarCta = byBlockKey(blocks, "blog_sidebar_cta");
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

    const footerAbout = byBlockKey(blocks, "footer_about");
    if (footerAbout) {
      document.querySelectorAll(".footer-about p").forEach((p) => {
        if (footerAbout.body) p.textContent = footerAbout.body;
      });
      const tagline = document.querySelector(".footer-bottom span:last-child");
      if (tagline && footerAbout.heading) tagline.textContent = footerAbout.heading;
    }
  }

  function renderContentBlocksPricing(blocks) {
    const hero = byBlockKey(blocks, "pricing_hero");
    fillHead(document.querySelector(".hero-inner"), hero, { headingSelector: "h1", subSelector: "p" });

    fillHead(document.querySelector("#included .section-head"), byBlockKey(blocks, "pricing_included_intro"));
    fillHead(document.querySelector("#pricing-tiers .section-head"), byBlockKey(blocks, "pricing_tiers_intro"));

    const finalCta = byBlockKey(blocks, "pricing_final_cta");
    fillHead(document.querySelector(".final-cta"), finalCta);
    const finalCtaEl = document.querySelector(".final-cta .container");
    if (finalCtaEl && finalCta) fillCtas(finalCtaEl, finalCta);

    const footerAbout = byBlockKey(blocks, "footer_about");
    if (footerAbout) {
      document.querySelectorAll(".footer-about p").forEach((p) => {
        if (footerAbout.body) p.textContent = footerAbout.body;
      });
      const tagline = document.querySelector(".footer-bottom span:last-child");
      if (tagline && footerAbout.heading) tagline.textContent = footerAbout.heading;
    }
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

  function renderSets(sets) {
    if (!sets) return;
    const grid = document.querySelector("#sets .sets-grid");
    if (grid) {
      grid.innerHTML = sets
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((s) => `
          <div class="set-card">
            <div class="set-media">
              <img src="${esc(s.posterImage)}" alt="${esc(s.name)}">
              <div class="set-play-layer" data-video="${esc(s.videoUrl)}" data-poster="${esc(s.posterImage)}" data-caption="${esc(s.name)}">
                <div class="set-play-btn">${ICON_PLAY}</div>
              </div>
            </div>
            <div class="set-body">
              <h4>${esc(s.name)}</h4>
              <p>${esc(s.description)}</p>
              <div class="set-actions"><a href="booking.html?set=${esc(s.bookingParam)}" class="btn btn-ghost btn-sm btn-block">Book This Set</a></div>
            </div>
          </div>`)
        .join("");
    }
    const sidebarSets = document.querySelector(".sidebar-sets");
    if (sidebarSets) {
      sidebarSets.innerHTML = sets
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((s) => `
          <a class="sidebar-set-card" href="index.html#sets">
            <img src="${esc(s.posterImage)}" alt="${esc(s.name)}">
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
          ? `<button type="button" class="btn ${b.featured ? "btn-primary" : "btn-ghost"} btn-block" data-book-service-id="${esc(b.serviceId)}" data-book-service-name="${esc(b.name)} — ${esc(b.price)}">Check Availability &amp; Book</button>`
          : `<a href="booking.html?bundle=${esc(b.bookingParam)}" class="btn ${b.featured ? "btn-primary" : "btn-ghost"} btn-block">${b.bookingParam === "corporate-partner" ? "Talk to Our Team" : "Book This Bundle"}</a>`;
        return `
          <div class="bundle-card glass${b.featured ? " featured" : ""}">
            ${b.badge ? `<div class="bundle-badge">${esc(b.badge)}</div>` : ""}
            <div class="bundle-name">${esc(b.name)}</div>
            <div class="bundle-price">${priceHtml}</div>
            <div class="bundle-cadence">${esc(b.period)}</div>
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

  function renderWhy(items) {
    if (!items) return;
    const grid = document.querySelector(".why-strip .why-grid");
    if (!grid) return;
    grid.innerHTML = items
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((w) => `
        <div class="why-item reveal">
          <div class="why-num">${String(w.order || 0).padStart(2, "0")}</div>
          <h4>${esc(w.title)}</h4>
          <p>${esc(w.description)}</p>
        </div>`)
      .join("");
  }

  function renderProcessSteps(all) {
    if (!all) return;
    const forPage = (page) => all.filter((s) => s.page === page).sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));

    const home = forPage("home");
    const homeGrid = document.querySelector("#process .process-grid");
    if (homeGrid && home.length) {
      homeGrid.innerHTML = home.map((s) => `
        <div class="process-step">
          <div class="process-index">${String(s.stepIndex).padStart(2, "0")}</div>
          <h4>${esc(s.title)}</h4>
          <p>${esc(s.description)}</p>
        </div>`).join("");
    }

    const onsite = forPage("onsite");
    const onsiteGrid = document.querySelector("#how-it-works .process-grid");
    if (onsiteGrid && onsite.length) {
      onsiteGrid.innerHTML = onsite.map((s) => `
        <div class="process-step">
          <div class="process-index">${String(s.stepIndex).padStart(2, "0")}</div>
          <h4>${esc(s.title)}</h4>
          <p>${esc(s.description)}</p>
        </div>`).join("");
    }

    const booking = forPage("booking");
    const bookingGrid = document.querySelector(".booking-steps");
    if (bookingGrid && booking.length) {
      bookingGrid.innerHTML = booking.map((s) => `
        <div class="booking-step glass">
          <div class="process-index">${String(s.stepIndex).padStart(2, "0")}</div>
          <h4>${esc(s.title)}</h4>
          <p>${esc(s.description)}</p>
        </div>`).join("");
    }
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
          <div class="post-media"><img src="${esc(p.image)}" alt="Blog post cover"></div>
          <div class="post-body">
            <div class="post-meta"><span class="post-tag">${esc(p.category)}</span><span>&middot;</span><span>${esc(p.postDate)}</span></div>
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.excerpt)}</p>
            <a href="#" class="post-readmore">Read More &rarr;</a>
          </div>
        </article>`)
      .join("");
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
          <button type="button" class="btn ${t.badge ? "btn-primary" : "btn-ghost"} btn-block" data-book-service-id="${esc(t.serviceId || "")}" data-book-service-name="${esc(t.name)} — $${esc(t.price)}">Check Availability &amp; Book</button>
        </div>`)
      .join("");
    if (window.AguybBookingFlow) window.AguybBookingFlow.bindTriggers();
  }

  // ---------- rebind interactive behavior main.js already wired up ----------
  // main.js attaches accordion/lightbox/reveal listeners on DOMContentLoaded,
  // before this file has replaced any innerHTML. Re-run the same lightweight
  // bindings here for any elements this file just created.
  function rebindInteractivity() {
    document.querySelectorAll(".acc-header").forEach((header) => {
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

    const lightbox = document.getElementById("lightbox");
    const lightboxVideo = document.getElementById("lightboxVideo");
    const lightboxCaption = document.getElementById("lightboxCaption");
    if (lightbox && lightboxVideo) {
      document.querySelectorAll("[data-video]").forEach((trigger) => {
        if (trigger.dataset.cmsBound) return;
        trigger.dataset.cmsBound = "1";
        trigger.addEventListener("click", (e) => {
          e.preventDefault();
          if (trigger.dataset.video) lightboxVideo.setAttribute("src", trigger.dataset.video);
          if (trigger.dataset.poster) lightboxVideo.setAttribute("poster", trigger.dataset.poster);
          lightboxCaption.textContent = trigger.dataset.caption || "";
          lightbox.classList.add("active");
          document.body.style.overflow = "hidden";
          lightboxVideo.play().catch(() => {});
        });
      });
    }

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
      const [navLinks, contentBlocks, siteSettings] = await Promise.all([
        queryCollection("nav_links", "order"),
        queryCollection("content_blocks"),
        queryCollection("site_settings")
      ]);

      renderNav(navLinks);
      renderSiteSettings(siteSettings);

      if (PAGE === "home") {
        const [services, sets, bundles, reviews, why, processSteps] = await Promise.all([
          queryCollection("services", "order"),
          queryCollection("sets", "order"),
          queryCollection("bundles", "order"),
          queryCollection("reviews", "order"),
          queryCollection("why_aguyb", "order"),
          queryCollection("process_steps")
        ]);
        if (contentBlocks) renderContentBlocksHome(contentBlocks);
        renderServices(services);
        renderSets(sets);
        renderBundles(bundles);
        renderReviews(reviews);
        renderWhy(why);
        renderProcessSteps(processSteps);
      } else if (PAGE === "booking") {
        const processSteps = await queryCollection("process_steps");
        if (contentBlocks) renderContentBlocksBooking(contentBlocks);
        renderProcessSteps(processSteps);
      } else if (PAGE === "onsite") {
        const [processSteps, onsitePackages, coverageAreas] = await Promise.all([
          queryCollection("process_steps"),
          queryCollection("onsite_packages", "order"),
          queryCollection("coverage_areas", "order")
        ]);
        if (contentBlocks) renderContentBlocksOnsite(contentBlocks);
        renderProcessSteps(processSteps);
        renderOnsitePackages(onsitePackages);
        renderCoverageAreas(coverageAreas);
      } else if (PAGE === "faq") {
        const faqItems = await queryCollection("faq_items", "order");
        if (contentBlocks) renderContentBlocksFaq(contentBlocks);
        renderFaq(faqItems);
      } else if (PAGE === "blog") {
        const [blogPosts, sets] = await Promise.all([
          queryCollection("blog_posts", "order"),
          queryCollection("sets", "order")
        ]);
        if (contentBlocks) renderContentBlocksBlog(contentBlocks);
        renderBlogPosts(blogPosts);
        renderSets(sets);
      } else if (PAGE === "pricing") {
        const pricingTiers = await queryCollection("pricing_tiers", "order");
        if (contentBlocks) renderContentBlocksPricing(contentBlocks);
        renderPricingTiers(pricingTiers);
      }

      rebindInteractivity();
    } catch (err) {
      // Any unexpected failure: the static HTML already on the page is a
      // complete, correct fallback, so we just log and move on.
      console.warn("[AGUYB CMS] Render skipped:", err);
    }
  });
})();
