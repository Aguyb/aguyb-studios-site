/* ==========================================================================
   AGUYB STUDIOS - Frontend Interactions
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ---------- Sticky nav background on scroll ----------
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 40) {
        nav.classList.add('is-scrolled');
      } else {
        nav.classList.remove('is-scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------- Mobile menu toggle ----------
  const navToggle = document.getElementById('navToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  if (navToggle && mobileMenu) {
    const closeMenu = () => {
      navToggle.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    };

    navToggle.addEventListener('click', () => {
      const isActive = navToggle.classList.toggle('active');
      mobileMenu.classList.toggle('active');
      document.body.style.overflow = isActive ? 'hidden' : '';
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMenu);
    });
  }

  // ---------- Scroll reveal ----------
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }

  // ---------- Footer year ----------
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- Graceful image fallback ----------
  // If a placeholder photo fails to load (e.g. swapped for real brand photography
  // later, or offline), fall back to a branded gradient so layout never breaks.
  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', function handler() {
      this.removeEventListener('error', handler);
      this.classList.add('img-fallback');
      this.removeAttribute('src');
    });
  });

  // ---------- Smooth anchor scroll offset for fixed nav ----------
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId.length > 1) {
        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          const offset = 90;
          const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    });
  });

  // ---------- Services accordion ("What We Build") ----------
  // Guarded with a bound-flag: cms.js re-runs this same binding after it
  // replaces (or, on a failed/blocked CMS fetch, leaves untouched) the
  // accordion markup, so without the guard a header that's still the
  // original static one would get two click listeners and the toggle
  // would silently cancel itself out (open then immediately re-close).
  document.querySelectorAll('.acc-header:not([data-acc-bound])').forEach(header => {
    header.dataset.accBound = '1';
    header.addEventListener('click', () => {
      const item = header.closest('.acc-item');
      const list = header.closest('.acc-list');
      const wasOpen = item.classList.contains('is-open');

      list.querySelectorAll('.acc-item').forEach(i => {
        i.classList.remove('is-open');
        i.querySelector('.acc-header').setAttribute('aria-expanded', 'false');
      });

      if (!wasOpen) {
        item.classList.add('is-open');
        header.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ---------- Video lightbox (reel cards, set cards, studio tour buttons) ----------
  const lightbox = document.getElementById('lightbox');
  const lightboxInner = lightbox ? lightbox.querySelector('.lightbox-inner') : null;
  const lightboxVideo = document.getElementById('lightboxVideo');
  const lightboxIframe = document.getElementById('lightboxIframe');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');

  // A CMS video field (recent_work, shortform_clips, sets, blog_posts, the
  // hero "Studio Tour" button, etc.) accepts either a Wix Media Manager
  // pick or a plain pasted YouTube link. If the URL matches a YouTube
  // pattern, we embed it via iframe (YouTube doesn't expose a raw file
  // URL); otherwise it plays through the normal <video> element.
  const getYouTubeEmbedUrl = (url) => {
    if (!url) return null;
    const match = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
    return match ? 'https://www.youtube-nocookie.com/embed/' + match[1] + '?autoplay=1&rel=0' : null;
  };

  if (lightbox && lightboxVideo) {
    // Once the real video file's metadata loads, size the frame to its
    // exact native width/height instead of guessing 9:16 or 16:9, so the
    // clip always plays at the precise ratio it was uploaded in, cropped
    // by nothing (object-fit: contain in the CSS handles the rest). This
    // only fires for direct video files; YouTube embeds keep the
    // data-vertical best-guess box since the iframe's real dimensions
    // aren't readable across origins.
    const matchVideoAspectRatio = () => {
      if (lightboxInner && lightboxVideo.videoWidth && lightboxVideo.videoHeight) {
        lightboxInner.style.aspectRatio = lightboxVideo.videoWidth + ' / ' + lightboxVideo.videoHeight;
      }
    };
    lightboxVideo.addEventListener('loadedmetadata', matchVideoAspectRatio);

    const openLightbox = (src, poster, caption, vertical) => {
      if (lightboxInner) lightboxInner.style.aspectRatio = '';
      lightboxCaption.textContent = caption || '';
      if (lightboxInner) lightboxInner.classList.toggle('is-vertical', !!vertical);

      const ytEmbed = getYouTubeEmbedUrl(src);
      if (ytEmbed) {
        if (lightbox) lightbox.classList.add('is-youtube');
        if (lightboxIframe) lightboxIframe.setAttribute('src', ytEmbed);
      } else {
        if (lightbox) lightbox.classList.remove('is-youtube');
        if (src) lightboxVideo.setAttribute('src', src);
        if (poster) lightboxVideo.setAttribute('poster', poster);
        lightboxVideo.play().catch(() => {
          /* Autoplay may be blocked or the placeholder video file may not exist
             yet, the poster image still displays so the layout never breaks. */
        });
      }

      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    };

    const closeLightbox = () => {
      lightbox.classList.remove('active', 'is-youtube');
      lightboxVideo.pause();
      lightboxVideo.removeAttribute('src');
      lightboxVideo.load();
      if (lightboxIframe) lightboxIframe.setAttribute('src', ''); // stops YouTube playback
      if (lightboxInner) lightboxInner.style.aspectRatio = '';
      document.body.style.overflow = '';
    };

    // Named + idempotent so cms.js can call it again after it re-renders a
    // grid of [data-video] cards (e.g. the short-form clip slideshow) from
    // Wix Data, without double-binding the cards that were already static.
    // Cards marked data-vertical="true" (the short-form 9:16 clips) play in
    // a tall, phone-shaped frame instead of the default 16:9 one.
    const bindVideoTriggers = () => {
      document.querySelectorAll('[data-video]:not([data-video-bound])').forEach(trigger => {
        trigger.setAttribute('data-video-bound', '');
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          openLightbox(trigger.dataset.video, trigger.dataset.poster, trigger.dataset.caption, trigger.dataset.vertical === 'true');
        });
      });
    };
    bindVideoTriggers();
    window.AguybLightbox = { bindTriggers: bindVideoTriggers };

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox();
    });
  }

  // ---------- Set gallery modal (sets.html "Choose Your Set" cards) ----------
  // The set covers never had real walkthrough video to play, so clicking one
  // opens this modal instead: a small photo gallery of the set plus a
  // plain-language "What's Included" list, read straight off each card's
  // data-set-* attributes (JSON-encoded arrays for images/included items).
  const setModal = document.getElementById('setModal');
  if (setModal) {
    const setModalClose = document.getElementById('setModalClose');
    const setModalMainImage = document.getElementById('setModalMainImage');
    const setModalThumbs = document.getElementById('setModalThumbs');
    const setModalName = document.getElementById('setModalName');
    const setModalPrice = document.getElementById('setModalPrice');
    const setModalDesc = document.getElementById('setModalDesc');
    const setModalIncluded = document.getElementById('setModalIncluded');
    const setModalBookBtn = document.getElementById('setModalBookBtn');

    const closeSetModal = () => {
      setModal.classList.remove('active');
      document.body.style.overflow = '';
    };

    const openSetModal = (trigger) => {
      let images = [];
      let included = [];
      try { images = JSON.parse(trigger.dataset.setImages || '[]'); } catch (e) { /* malformed data, fall back to empty */ }
      try { included = JSON.parse(trigger.dataset.setIncluded || '[]'); } catch (e) { /* malformed data, fall back to empty */ }

      setModalName.textContent = trigger.dataset.setName || '';
      setModalPrice.textContent = trigger.dataset.setPrice || '';
      setModalDesc.textContent = trigger.dataset.setDesc || '';
      setModalIncluded.innerHTML = included.map(item => `<li>${item}</li>`).join('');

      const setMainImage = (src) => {
        setModalMainImage.setAttribute('src', src);
        setModalThumbs.querySelectorAll('img').forEach(t => t.classList.toggle('active', t.getAttribute('src') === src));
      };

      setModalThumbs.innerHTML = images.map((src, i) =>
        `<img src="${src}" alt="${(trigger.dataset.setName || 'Set photo').replace(/"/g, '&quot;')} ${i + 1}">`
      ).join('');
      setModalThumbs.querySelectorAll('img').forEach(t => {
        t.addEventListener('click', () => setMainImage(t.getAttribute('src')));
      });
      if (images[0]) setMainImage(images[0]);

      // Route the modal's "Book This Set" button through the card's real
      // booking trigger when one exists (data-book-service-id, wired to the
      // live Wix service), so the same 3-step booking flow opens instead of
      // just linking to the generic pricing page. Sets that aren't wired to
      // a real Wix service yet fall back to a plain link to pricing.html.
      const cardBookTrigger = trigger.closest('.set-card')?.querySelector('[data-book-service-id]');
      setModalBookBtn.onclick = null;
      if (cardBookTrigger) {
        setModalBookBtn.setAttribute('href', 'javascript:void(0)');
        setModalBookBtn.onclick = (e) => {
          e.preventDefault();
          closeSetModal();
          cardBookTrigger.click();
        };
      } else {
        setModalBookBtn.setAttribute('href', 'pricing.html');
      }

      setModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    };

    document.querySelectorAll('[data-set-gallery]:not([data-set-modal-bound])').forEach(trigger => {
      trigger.setAttribute('data-set-modal-bound', '');
      trigger.addEventListener('click', () => openSetModal(trigger));
    });

    setModalClose.addEventListener('click', closeSetModal);
    setModal.addEventListener('click', (e) => {
      if (e.target === setModal) closeSetModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && setModal.classList.contains('active')) closeSetModal();
    });
  }

  // ---------- Form submission (contact + booking) ----------
  // Both forms submit straight into the real "Aguyb Studios Leads" form that
  // already lives on the live Wix site (Settings > Forms & Submissions in
  // the Wix dashboard), via the headless OAuth client set up for this
  // project. No backend of our own, no Formspree, no build step: the
  // browser requests a short-lived anonymous visitor token from Wix, then
  // posts the submission straight to Wix Forms. See README > "Wix Headless"
  // for the full explanation and the Client ID in use.
  const WIX_SITE_HEADLESS_CLIENT_ID = "b21d16f1-0865-4b6c-82c9-8fc43d39c696";
  const WIX_LEADS_FORM_ID = "da04b51e-e4f0-4e4b-9c0f-d89b88c7e9c7";

  const splitName = (fullName) => {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: 'Website Visitor', last: '-' };
    if (parts.length === 1) return { first: parts[0], last: '-' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  };

  // Wix's phone field validates strict E.164 (a leading "+" and country
  // code), not a bare 10-digit US number. Assume US/+1 for a 10-digit
  // number (this studio's whole audience is Jacksonville-area), pass
  // anything that already looks international straight through, and fall
  // back to a clearly-fake placeholder rather than let the whole
  // submission get rejected over an unrecognized format.
  const formatPhoneE164 = (raw) => {
    const digits = (raw || '').replace(/[^\d+]/g, '');
    if (!digits) return '+10000000000';
    if (digits.startsWith('+')) return digits;
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
    return '+1' + digits.slice(-10).padStart(10, '0');
  };

  async function getWixVisitorToken() {
    const res = await fetch('https://www.wixapis.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: WIX_SITE_HEADLESS_CLIENT_ID, grantType: 'anonymous' })
    });
    if (!res.ok) throw new Error('Could not authenticate with Wix');
    const data = await res.json();
    return data.access_token;
  }

  async function submitToWixLeadsForm(overview, { name, company, phone, email }) {
    const token = await getWixVisitorToken();
    const { first, last } = splitName(name);

    const res = await fetch('https://www.wixapis.com/forms/v4/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({
        submission: {
          formId: WIX_LEADS_FORM_ID,
          namespace: 'wix.form_app.form',
          submissions: {
            first_name_c434: first,
            last_name_26dc: last,
            email_2657: email || '',
            phone_9a7f: formatPhoneE164(phone),
            company_name_d455: company || '',
            project_overview_what_you_are_looking_for: overview
          }
        }
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('Wix Forms rejected the submission: ' + res.status + ' ' + body);
    }
    return res.json();
  }

  const handleFormSubmit = (form, buildOverview) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = form.querySelector('.form-status');
      const btn = form.querySelector('button[type="submit"]');
      const originalLabel = btn.textContent;

      // Honeypot: a hidden field real visitors never see or fill. If it has
      // a value, a bot filled it. Pretend success (no error, no clue for
      // the bot) but skip the actual Wix Forms submission entirely.
      const honeypot = form.querySelector('input[name="website"]');
      if (honeypot && honeypot.value.trim()) {
        status.textContent = "Thanks, we've received your request and will follow up within one business day.";
        status.classList.add('show', 'success');
        form.reset();
        return;
      }

      btn.textContent = 'Sending...';
      btn.disabled = true;
      status.className = 'form-status';

      try {
        const data = new FormData(form);
        const contact = {
          name: data.get('name'),
          company: data.get('company'),
          phone: data.get('phone'),
          email: data.get('email')
        };
        const overview = buildOverview(data);

        await submitToWixLeadsForm(overview, contact);

        status.textContent = "Thanks, we've received your request and will follow up within one business day.";
        status.classList.add('show', 'success');
        form.reset();
        if (typeof gtag === 'function') {
          gtag('event', 'generate_lead', {
            form_id: form.id || 'unknown_form',
            page_path: window.location.pathname
          });
        }
      } catch (err) {
        status.textContent = "We couldn't submit this automatically yet. Please email guybertho@aguybstudios.com directly and we'll take it from there.";
        status.classList.add('show', 'error');
      } finally {
        btn.textContent = originalLabel;
        btn.disabled = false;
      }
    });
  };

  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    handleFormSubmit(contactForm, (data) => {
      const lines = [
        'Project type: ' + (data.get('project_type') || 'Not specified'),
        'Newsletter opt-in: ' + (data.get('subscribe') ? 'Yes' : 'No'),
        '',
        data.get('message') || ''
      ];
      return lines.join('\n');
    });
  }

  const bookingForm = document.getElementById('bookingFormEl');
  if (bookingForm) {
    handleFormSubmit(bookingForm, (data) => {
      const lines = [
        'BOOKING REQUEST',
        'Preferred set: ' + (data.get('preferred_set') || 'Not sure yet'),
        'Preferred bundle: ' + (data.get('preferred_bundle') || 'Not sure yet'),
        'Preferred date: ' + (data.get('preferred_date') || 'Flexible'),
        'Preferred time: ' + (data.get('preferred_time') || 'Flexible'),
        '',
        data.get('project_details') || ''
      ];
      return lines.join('\n');
    });
  }

  // ---------- Booking page: pre-select set / bundle from query string ----------
  // Links like booking.html?set=podcast or booking.html?bundle=content-engine
  // (used throughout the Sets and Bundles sections) land here pre-filled.
  const setSelect = document.getElementById('bk-set');
  const bundleSelect = document.getElementById('bk-bundle');
  if (setSelect || bundleSelect) {
    const params = new URLSearchParams(window.location.search);
    const setParam = params.get('set');
    const bundleParam = params.get('bundle');

    if (setSelect && setParam) {
      const option = setSelect.querySelector(`option[value="${setParam}"]`);
      if (option) setSelect.value = setParam;
    }
    if (bundleSelect && bundleParam) {
      const option = bundleSelect.querySelector(`option[value="${bundleParam}"]`);
      if (option) bundleSelect.value = bundleParam;
    }
  }

});
