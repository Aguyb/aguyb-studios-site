/* ==========================================================================
   AGUYB STUDIOS - Real Booking Flow (Wix Bookings + Square checkout)
   ==========================================================================
   A 3-step guided flow: 1) pick a REAL available date/time pulled live from
   Wix Bookings, 2) choose real add-ons (same ones configured on the
   service in Wix, with live-updating pricing) to see an estimated total,
   3) review a summary, enter contact info, and pay by card right here in
   the modal via the Square Web Payments SDK -- nothing ever redirects off
   aguybstudios.com. On a successful charge, a Vercel serverless function
   (api/create-payment.js) creates and confirms the booking in Wix and
   logs a Wix order, so it still shows up in the Wix dashboard for
   invoicing/reporting even though Square is the actual payment processor.
   Availability lookups go through api/available-slots.js (NOT a direct
   anonymous call to Wix's Time Slots API anymore) because this studio is
   sold as 6+1 separate Wix Bookings "services" (1/2/3/4/6/8-hour tiers
   plus off-site Event Filming) that all share the same physical room and
   the same single staff member, but each has its OWN Wix schedule. Wix's
   own availability engine only checks a slot against its own service's
   schedule, so without this proxy a confirmed 2-Hour booking would not
   stop the 4-Hour tier from showing the same hour as bookable -- verified
   live before this was added. The proxy cross-checks every sibling
   schedule and filters those slots out server-side. See README > "Real
   booking" for the full explanation.

   Payment methods: the card element (Square Card) is always available.
   Google Pay and Cash App Pay are attached alongside it on step 3 and
   quietly hide themselves if the buyer's browser/device/account doesn't
   support them -- same pattern Square's own docs use. All three methods
   produce an interchangeable Square "source id" token, so they all submit
   through the exact same /api/create-payment endpoint; no server changes
   were needed to add them. Apple Pay isn't wired up yet -- it requires a
   one-time manual domain-verification step in the Square Developer
   Console (uploading a certificate to /.well-known/) before it can be
   added the same way.
   ========================================================================== */

(function () {
  "use strict";

  // Real add-ons from the "Studio Rental Weekday" add-on group in Wix,
  // shared by every Studio Rental hourly service this flow books. If you
  // add/remove/reprice an add-on in Wix, update it here too, this list is
  // shown for the visitor to plan their extras before checkout, where they
  // confirm the same choices on Wix's own add-on selector.
  const ADDONS = [
    { id: "df3a4dbe-5b3c-4d5b-b97b-1bb1c24bc376", name: "Additional camera", price: 40 },
    { id: "4fbc73a1-ddb0-4c31-bb87-3cba5da75752", name: "Teleprompter", price: 36 },
    { id: "c7c2e415-5a84-4b1a-bff1-9f21d45ce299", name: "Producer on set", price: 70 },
    { id: "b8382aac-dfc5-4cac-8d9f-6c7e0da1e930", name: "Subtitles", price: 120 },
    { id: "c146e5d2-a15c-4deb-a3ab-abc9bdeaa13c", name: "Video editing (per episode)", price: 250 },
    { id: "7f4c8aa1-3be7-4412-bb6f-13ae612f29ef", name: "Graphics motion (once)", price: 200 }
  ];

  // The add-ons above only exist on the "Studio Rental Weekday" add-on
  // group, shared by the 5 hourly Studio Rental services. Any other
  // service (e.g. Event Filming) has no add-ons configured in Wix, so it
  // gets an empty list here, step 2 is skipped automatically for those.
  const STUDIO_RENTAL_SERVICE_IDS = new Set([
    "017a2b16-10ea-4e27-bc5d-04821361e2ff", // 1 Hour (hidden)
    "b77a785e-e00a-4e90-9903-015f8c53197c", // 2 Hours
    "eb75d42d-cb6e-4db8-99f8-56a71eaddae6", // 3 Hours
    "fbf025db-90ac-4ae4-a955-96c4d5c807af", // 4 Hours
    "826cd5d0-0f36-4cd8-9821-4e5cbdb778a2", // 6 Hours
    "4668ec4f-7cdd-49c4-ae39-ec87cc04328d"  // Full Day (8 Hours)
  ]);
  function addonsForService(serviceId) {
    return STUDIO_RENTAL_SERVICE_IDS.has(serviceId) ? ADDONS : [];
  }

  // Availability is fetched through our own /api/available-slots proxy
  // rather than calling Wix's Time Slots API directly. Reason: this studio
  // is sold as 6 separate hourly "services" (1/2/3/4/6/8 hours) plus an
  // off-site Event Filming service, all run by the same single staff
  // member/room, but Wix's own Time Slots API only checks a slot against
  // its OWN service's schedule -- it doesn't know a 2-Hour booking at 10am
  // should also block the 4-Hour tier's 10am slot. The server-side proxy
  // cross-checks every sibling schedule before calling a time bookable.
  // (Confirmed live: without this, a confirmed paid 2-Hour booking left
  // the overlapping 4-Hour slot showing as available.)
  async function listAvailability(serviceId, dateStr) {
    const res = await fetch(
      "/api/available-slots?serviceId=" + encodeURIComponent(serviceId) + "&date=" + encodeURIComponent(dateStr)
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not load availability (" + res.status + ")");
    return data.timeSlots || [];
  }

  // ---------- Square Web Payments SDK (in-page checkout) ----------
  // Loaded lazily the first time a visitor opens the booking modal, not on
  // every page load, since most visitors browsing the site never book.
  let squareConfigPromise = null;
  let squarePaymentsPromise = null;
  let squareCard = null;

  function fetchSquareConfig() {
    if (!squareConfigPromise) {
      squareConfigPromise = fetch("/api/square-config")
        .then((res) => {
          if (!res.ok) throw new Error("Could not load payment configuration");
          return res.json();
        });
    }
    return squareConfigPromise;
  }

  function loadSquareSdkScript(src) {
    return new Promise((resolve, reject) => {
      if (window.Square) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[data-square-sdk]');
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Square.js failed to load")));
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.setAttribute("data-square-sdk", "1");
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Square.js failed to load"));
      document.head.appendChild(script);
    });
  }

  // Initializes the Square payments object + Card element once, and
  // attaches the card element into #square-card-container in the modal.
  // Safe to call more than once -- returns the same promise every time.
  function initSquare() {
    if (!squarePaymentsPromise) {
      squarePaymentsPromise = fetchSquareConfig().then(async (config) => {
        if (!config.appId || !config.locationId) {
          throw new Error("Card payments aren't configured yet.");
        }
        const sdkSrc =
          config.environment === "sandbox"
            ? "https://sandbox.web.squarecdn.com/v1/square.js"
            : "https://web.squarecdn.com/v1/square.js";
        await loadSquareSdkScript(sdkSrc);
        if (!window.Square) throw new Error("Square.js failed to load properly");
        const payments = window.Square.payments(config.appId, config.locationId);
        squareCard = await payments.card();
        await squareCard.attach("#square-card-container");
        return { payments, config };
      });
    }
    return squarePaymentsPromise;
  }

  // Root cause (confirmed live, in-browser, against this exact Square
  // Sandbox account, via console + network trace -- not guessed):
  // billingContact/intent/customerInitiated/sellerKeyedIn are an all-or-
  // nothing bundle. Provide any one of them and Card.tokenize() requires
  // all four, because providing them opts into Square's embedded buyer
  // verification (SCA/3DS) flow, which internally calls
  // POST /v2/analytics/verifications. That specific network call is what
  // was returning 400 in Sandbox -- confirmed via the Network tab during a
  // real attempt -- which square.js then surfaces to the page as the
  // generic, unhelpful "An unexpected error occurred while using Card."
  // Calling tokenize() with NO verification bundle at all (confirmed via
  // direct in-browser testing: tokenize() with no argument resolves
  // cleanly) skips that broken embedded-SCA call entirely and tokenizes
  // the card normally. SCA/PSD2 buyer verification is an EU/UK regulatory
  // feature this US-only studio booking doesn't need -- omitting it is the
  // standard, supported integration pattern, not a workaround.
  async function tokenizeCard() {
    const result = await squareCard.tokenize();
    if (result.status !== "OK") {
      const detail = result.errors ? JSON.stringify(result.errors) : result.status;
      throw new Error("Card details couldn't be verified (" + detail + ")");
    }
    return result.token;
  }

  // ---------- Square digital wallets (Google Pay + Cash App Pay) ----------
  // Both are optional -- if the buyer's browser/device/Square account
  // doesn't support one, its init throws and we just hide that button and
  // fall back to the always-available card element. Re-run every time step
  // 3 is (re)entered because the PaymentRequest bakes in the dollar total
  // at creation time and Square's own docs note Cash App Pay in particular
  // "doesn't support changing or updating the options" afterward -- so if
  // the visitor goes back and changes add-ons, we rebuild both wallets
  // against the new total rather than risk charging the old one.
  let squareGooglePay = null;
  let squareCashAppPay = null;
  let digitalWalletsInitPromise = Promise.resolve();

  function initDigitalWallets() {
    digitalWalletsInitPromise = digitalWalletsInitPromise
      .catch(() => {})
      .then(async () => {
        let payments;
        try {
          ({ payments } = await initSquare());
        } catch (err) {
          return; // Card init already failed; that error surfaces elsewhere.
        }

        const total = currentTotal();
        const paymentRequest = payments.paymentRequest({
          countryCode: "US",
          currencyCode: "USD",
          total: { amount: total.toFixed(2), label: "Total" }
        });

        googlePayButtonEl.innerHTML = "";
        googlePayButtonEl.hidden = true;
        squareGooglePay = null;
        try {
          squareGooglePay = await payments.googlePay(paymentRequest);
          await squareGooglePay.attach("#google-pay-button");
          googlePayButtonEl.hidden = false;
        } catch (err) {
          console.warn("[AGUYB Booking] Google Pay unavailable", err);
        }

        cashAppButtonEl.innerHTML = "";
        cashAppButtonEl.hidden = true;
        squareCashAppPay = null;
        try {
          squareCashAppPay = await payments.cashAppPay(paymentRequest, {
            redirectURL: window.location.href,
            referenceId: "aguyb-" + Date.now()
          });
          await squareCashAppPay.attach("#cash-app-pay-button");
          squareCashAppPay.addEventListener("ontokenization", handleCashAppTokenization);
          cashAppButtonEl.hidden = false;
        } catch (err) {
          console.warn("[AGUYB Booking] Cash App Pay unavailable", err);
        }

        const anyWallet = !googlePayButtonEl.hidden || !cashAppButtonEl.hidden;
        walletsRowEl.hidden = !anyWallet;
        walletsDividerEl.hidden = !anyWallet;
      });
    return digitalWalletsInitPromise;
  }

  async function submitBookingAndPayment(sourceId) {
    const res = await fetch("/api/create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        serviceId: selectedSlot.serviceId,
        scheduleId: selectedSlot.scheduleId,
        startDate: selectedSlot.localStartDate,
        endDate: selectedSlot.localEndDate,
        location: selectedSlot.location,
        basePrice: activeBasePrice,
        addonIds: Array.from(selectedAddOnIds),
        contact: {
          firstName: contactFirstNameEl.value.trim(),
          lastName: contactLastNameEl.value.trim(),
          email: contactEmailEl.value.trim(),
          phone: contactPhoneEl.value.trim()
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Payment couldn't be completed. Please try again.");
    }
    return data;
  }

  // ---------- shared checkout completion (card + Google Pay + Cash App Pay) ----------
  // All three payment methods end up here with a Square source-id token --
  // the server side (api/create-payment.js) doesn't care which method
  // produced it. One in-flight guard covers all three entry points so a
  // double-click or a stray Cash App Pay tokenization can't submit twice.
  let checkoutInFlight = false;

  function validateContact() {
    const firstName = contactFirstNameEl.value.trim();
    const email = contactEmailEl.value.trim();
    if (!firstName || !email) {
      checkoutStatusEl.textContent = "Please enter your name and email.";
      if (!firstName) contactFirstNameEl.focus();
      else contactEmailEl.focus();
      return null;
    }
    return { firstName, lastName: contactLastNameEl.value.trim(), email, phone: contactPhoneEl.value.trim() };
  }

  function setCheckoutBusy(busy, label) {
    checkoutInFlight = busy;
    checkoutBtnEl.disabled = busy;
    if (label) checkoutBtnEl.textContent = label;
    modalEl.classList.toggle("booking-checkout-busy", busy);
  }

  async function finishCheckout(sourceId, contact) {
    const total = currentTotal();
    if (typeof gtag === "function") {
      gtag("event", "begin_checkout", {
        currency: "USD",
        value: total,
        items: [{ item_name: activeServiceName || "Studio Booking", price: total }]
      });
    }

    const result = await submitBookingAndPayment(sourceId);

    if (typeof gtag === "function") {
      gtag("event", "purchase", {
        currency: "USD",
        value: result.amount || total,
        transaction_id: result.bookingId
      });
    }

    const successDetailEl = modalEl.querySelector(".booking-success-detail");
    successDetailEl.textContent =
      "A confirmation for " + (activeServiceName || "your session") + " is on its way to " + contact.email + ".";
    reviewFormEl.hidden = true;
    successPanelEl.hidden = false;
  }

  async function handleGooglePayClick() {
    if (checkoutInFlight) return;
    if (!selectedSlot) {
      goToStep(1);
      return;
    }
    if (!squareGooglePay) return;
    const contact = validateContact();
    if (!contact) return;

    setCheckoutBusy(true, "Processing…");
    checkoutStatusEl.textContent = "";
    try {
      const result = await squareGooglePay.tokenize();
      if (result.status !== "OK") {
        const detail = result.errors ? JSON.stringify(result.errors) : result.status;
        throw new Error("Google Pay couldn't complete (" + detail + ")");
      }
      await finishCheckout(result.token, contact);
    } catch (err) {
      checkoutStatusEl.textContent = err && err.message ? err.message : "Google Pay couldn't complete. Please try again.";
      console.warn("[AGUYB Booking] Google Pay", err);
    } finally {
      setCheckoutBusy(false, "Pay & Book");
    }
  }

  function handleCashAppPayClick() {
    if (checkoutInFlight) return;
    if (!selectedSlot) {
      goToStep(1);
      return;
    }
    const contact = validateContact();
    if (!contact) return;
    checkoutStatusEl.textContent = "Complete the payment in Cash App to finish booking…";
  }

  async function handleCashAppTokenization(event) {
    if (checkoutInFlight) return;
    const { tokenResult, error } = event.detail || {};
    if (error || !tokenResult || tokenResult.status !== "OK") {
      checkoutStatusEl.textContent = "Cash App Pay couldn't complete. Please try again.";
      console.warn("[AGUYB Booking] Cash App Pay", error || tokenResult);
      return;
    }
    const contact = validateContact();
    if (!contact) return;

    setCheckoutBusy(true, "Processing…");
    try {
      await finishCheckout(tokenResult.token, contact);
    } catch (err) {
      checkoutStatusEl.textContent = err && err.message ? err.message : "Something went wrong. Please try again, or email guybertho@aguybstudios.com.";
      console.warn("[AGUYB Booking] Cash App Pay", err);
    } finally {
      setCheckoutBusy(false, "Pay & Book");
    }
  }

  // ---------- formatting helpers ----------
  function formatTime(localStartDate) {
    const [, timePart] = localStartDate.split("T");
    const [hStr, mStr] = timePart.split(":");
    let h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return h + ":" + mStr + " " + suffix;
  }

  function formatDateNice(localStartDate) {
    const [datePart] = localStartDate.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function maxDateISO() {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function parsePrice(val) {
    const n = Number(String(val == null ? "" : val).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function money(n) {
    return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  // ---------- modal ----------
  let modalEl, titleEl, descEl, statusEl, closeBtnEl;
  let dateInputEl, findBtnEl, slotsEl;
  let addonsListEl, totalValueEl, totalValue2El;
  let reviewNameEl, reviewDescEl, reviewRowsEl;
  let checkoutBtnEl, checkoutStatusEl;
  let contactFirstNameEl, contactLastNameEl, contactEmailEl, contactPhoneEl;
  let walletsRowEl, walletsDividerEl, googlePayButtonEl, cashAppButtonEl;
  let reviewFormEl, successPanelEl;
  let stepDots = [];

  let activeServiceId = null;
  let activeServiceName = "";
  let activeBasePrice = 0;
  let activeServiceDesc = "";
  let selectedSlot = null;
  let selectedAddOnIds = new Set();

  function buildModal() {
    if (modalEl) return;
    modalEl = document.createElement("div");
    modalEl.className = "booking-modal";
    modalEl.innerHTML =
      '<div class="booking-modal-inner glass">' +
      '  <button class="booking-modal-close" aria-label="Close">' +
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>' +
      "  </button>" +
      '  <div class="eyebrow">Book Your Session</div>' +
      '  <h3 class="booking-modal-title"></h3>' +
      '  <p class="booking-modal-desc"></p>' +
      '  <div class="booking-stepper">' +
      '    <div class="booking-step-dot is-active" data-step="1"><span>1</span><small>Time</small></div>' +
      '    <div class="booking-step-track"></div>' +
      '    <div class="booking-step-dot" data-step="2"><span>2</span><small>Add&#8209;Ons</small></div>' +
      '    <div class="booking-step-track"></div>' +
      '    <div class="booking-step-dot" data-step="3"><span>3</span><small>Review</small></div>' +
      "  </div>" +
      '  <div class="booking-modal-status"></div>' +

      '  <div class="booking-step-panel" data-panel="1">' +
      '    <div class="booking-modal-row">' +
      '      <input type="date" class="booking-date-input">' +
      '      <button class="btn btn-primary btn-sm booking-find-btn">Find Times</button>' +
      "    </div>" +
      '    <div class="booking-slots-grid"></div>' +
      "  </div>" +

      '  <div class="booking-step-panel" data-panel="2" hidden>' +
      '    <p class="booking-step-intro">Add anything else you need for this session. You&rsquo;ll confirm the same extras on the secure checkout page next.</p>' +
      '    <div class="booking-addons-list"></div>' +
      '    <div class="booking-total-row"><span>Estimated total</span><strong class="booking-total-value"></strong></div>' +
      '    <div class="booking-step-actions">' +
      '      <button type="button" class="btn btn-ghost btn-sm" data-back-to="1">Back</button>' +
      '      <button type="button" class="btn btn-primary btn-sm" data-next-to="3">Continue to Review</button>' +
      "    </div>" +
      "  </div>" +

      '  <div class="booking-step-panel" data-panel="3" hidden>' +
      '    <div class="booking-review-form">' +
      '      <div class="booking-review-card">' +
      '        <div class="booking-review-name"></div>' +
      '        <p class="booking-review-desc"></p>' +
      '        <div class="booking-review-rows"></div>' +
      '        <div class="booking-total-row"><span>Total due today</span><strong class="booking-total-value-2"></strong></div>' +
      "      </div>" +
      '      <div class="booking-contact-fields">' +
      '        <div class="booking-field-row">' +
      '          <input type="text" class="booking-contact-first" placeholder="First name" autocomplete="given-name" required>' +
      '          <input type="text" class="booking-contact-last" placeholder="Last name" autocomplete="family-name">' +
      "        </div>" +
      '        <input type="email" class="booking-contact-email" placeholder="Email" autocomplete="email" required>' +
      '        <input type="tel" class="booking-contact-phone" placeholder="Phone" autocomplete="tel">' +
      "      </div>" +
      '      <div class="booking-wallets-row" hidden>' +
      '        <div id="google-pay-button" hidden></div>' +
      '        <div id="cash-app-pay-button" hidden></div>' +
      "      </div>" +
      '      <div class="booking-wallets-divider" hidden>Or pay with card</div>' +
      '      <label class="booking-card-label">Card details</label>' +
      '      <div id="square-card-container" class="booking-card-container"></div>' +
      '      <div class="booking-step-actions">' +
      '        <button type="button" class="btn btn-ghost btn-sm" data-back-to="2">Back</button>' +
      '        <button type="button" class="btn btn-primary btn-block booking-checkout-btn">Pay &amp; Book</button>' +
      "      </div>" +
      '      <div class="booking-checkout-status"></div>' +
      '      <p class="booking-modal-note">Payment is processed securely by Square. Your card details never touch our servers.</p>' +
      "    </div>" +
      '    <div class="booking-success-panel" hidden>' +
      '      <div class="booking-success-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg></div>' +
      '      <h4>You&rsquo;re booked!</h4>' +
      '      <p class="booking-success-detail">A confirmation is on its way to your email.</p>' +
      '      <button type="button" class="btn btn-primary btn-block booking-success-close">Done</button>' +
      "    </div>" +
      "  </div>" +
      "</div>";
    document.body.appendChild(modalEl);

    titleEl = modalEl.querySelector(".booking-modal-title");
    descEl = modalEl.querySelector(".booking-modal-desc");
    statusEl = modalEl.querySelector(".booking-modal-status");
    closeBtnEl = modalEl.querySelector(".booking-modal-close");
    stepDots = Array.from(modalEl.querySelectorAll(".booking-step-dot"));

    dateInputEl = modalEl.querySelector(".booking-date-input");
    findBtnEl = modalEl.querySelector(".booking-find-btn");
    slotsEl = modalEl.querySelector(".booking-slots-grid");

    addonsListEl = modalEl.querySelector(".booking-addons-list");
    totalValueEl = modalEl.querySelector(".booking-total-value");
    totalValue2El = modalEl.querySelector(".booking-total-value-2");

    reviewNameEl = modalEl.querySelector(".booking-review-name");
    reviewDescEl = modalEl.querySelector(".booking-review-desc");
    reviewRowsEl = modalEl.querySelector(".booking-review-rows");

    checkoutBtnEl = modalEl.querySelector(".booking-checkout-btn");
    checkoutStatusEl = modalEl.querySelector(".booking-checkout-status");

    contactFirstNameEl = modalEl.querySelector(".booking-contact-first");
    contactLastNameEl = modalEl.querySelector(".booking-contact-last");
    contactEmailEl = modalEl.querySelector(".booking-contact-email");
    contactPhoneEl = modalEl.querySelector(".booking-contact-phone");
    walletsRowEl = modalEl.querySelector(".booking-wallets-row");
    walletsDividerEl = modalEl.querySelector(".booking-wallets-divider");
    googlePayButtonEl = modalEl.querySelector("#google-pay-button");
    cashAppButtonEl = modalEl.querySelector("#cash-app-pay-button");
    reviewFormEl = modalEl.querySelector(".booking-review-form");
    successPanelEl = modalEl.querySelector(".booking-success-panel");

    dateInputEl.min = todayISO();
    dateInputEl.max = maxDateISO();

    closeBtnEl.addEventListener("click", closeModal);
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalEl.classList.contains("active")) closeModal();
    });
    findBtnEl.addEventListener("click", () => runSearch());

    modalEl.querySelectorAll("[data-back-to]").forEach((btn) => {
      btn.addEventListener("click", () => goToStep(parseInt(btn.getAttribute("data-back-to"), 10)));
    });
    modalEl.querySelectorAll("[data-next-to]").forEach((btn) => {
      btn.addEventListener("click", () => goToStep(parseInt(btn.getAttribute("data-next-to"), 10)));
    });
    checkoutBtnEl.addEventListener("click", handleCheckout);
    googlePayButtonEl.addEventListener("click", handleGooglePayClick);
    cashAppButtonEl.addEventListener("click", handleCashAppPayClick);
    modalEl.querySelector(".booking-success-close").addEventListener("click", closeModal);
  }

  function closeModal() {
    modalEl.classList.remove("active");
    document.body.style.overflow = "";
  }

  function goToStep(n) {
    modalEl.querySelectorAll(".booking-step-panel").forEach((panel) => {
      panel.hidden = panel.getAttribute("data-panel") !== String(n);
    });
    stepDots.forEach((dot) => {
      const step = parseInt(dot.getAttribute("data-step"), 10);
      dot.classList.toggle("is-active", step === n);
      dot.classList.toggle("is-done", step < n);
    });
    statusEl.textContent = "";
    if (n === 2) renderAddonsStep();
    if (n === 3) {
      renderReviewStep();
      // Kick off Square SDK init as soon as the review step is reached so
      // the card element is ready by the time the visitor finishes typing
      // their contact details. Failures surface when they hit Pay & Book.
      initSquare().catch((err) => console.warn("[AGUYB Booking] Square init failed", err));
      // Google Pay / Cash App Pay are (re)built every time step 3 is
      // reached so their baked-in total always matches the current
      // add-on selection, even if the visitor went back and changed it.
      initDigitalWallets().catch((err) => console.warn("[AGUYB Booking] Digital wallets init failed", err));
    }
  }

  function openModal(serviceId, name, price, desc) {
    buildModal();
    activeServiceId = serviceId;
    activeServiceName = name;
    activeBasePrice = parsePrice(price);
    activeServiceDesc = desc || "";
    selectedSlot = null;
    selectedAddOnIds = new Set();

    titleEl.textContent = name;
    descEl.textContent = activeServiceDesc;
    descEl.hidden = !activeServiceDesc;
    dateInputEl.value = todayISO();
    slotsEl.innerHTML = "";
    statusEl.textContent = "";
    contactFirstNameEl.value = "";
    contactLastNameEl.value = "";
    contactEmailEl.value = "";
    contactPhoneEl.value = "";
    checkoutStatusEl.textContent = "";
    reviewFormEl.hidden = false;
    successPanelEl.hidden = true;
    checkoutBtnEl.disabled = false;
    checkoutBtnEl.textContent = "Pay & Book";
    walletsRowEl.hidden = true;
    walletsDividerEl.hidden = true;
    squareGooglePay = null;
    squareCashAppPay = null;
    goToStep(1);
    modalEl.classList.add("active");
    document.body.style.overflow = "hidden";
    runSearch();
  }

  async function runSearch() {
    if (!activeServiceId || !dateInputEl.value) return;
    slotsEl.innerHTML = "";
    statusEl.textContent = "Loading real availability…";
    findBtnEl.disabled = true;
    try {
      const slots = await listAvailability(activeServiceId, dateInputEl.value);
      findBtnEl.disabled = false;
      if (!slots.length) {
        statusEl.textContent = "No open times on this date. Try another day.";
        return;
      }
      statusEl.textContent = slots.length + " time" + (slots.length === 1 ? "" : "s") + " available:";
      slotsEl.innerHTML = "";
      slots.forEach((slot) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "booking-slot-btn";
        btn.textContent = formatTime(slot.localStartDate);
        btn.addEventListener("click", () => {
          slotsEl.querySelectorAll(".booking-slot-btn").forEach((b) => b.classList.remove("is-selected"));
          btn.classList.add("is-selected");
          selectedSlot = slot;
          // Skip the add-ons step entirely for services with no add-ons
          // configured in Wix (e.g. Event Filming), nothing to choose from.
          goToStep(addonsForService(activeServiceId).length ? 2 : 3);
        });
        slotsEl.appendChild(btn);
      });
    } catch (err) {
      findBtnEl.disabled = false;
      statusEl.textContent = "Couldn't load availability right now. Please try again in a moment.";
      console.warn("[AGUYB Booking]", err);
    }
  }

  // ---------- step 2: add-ons ----------
  function currentTotal() {
    let total = activeBasePrice;
    addonsForService(activeServiceId).forEach((a) => {
      if (selectedAddOnIds.has(a.id)) total += a.price;
    });
    return total;
  }

  function renderAddonsStep() {
    const addons = addonsForService(activeServiceId);
    if (!addons.length) {
      addonsListEl.innerHTML = '<p class="booking-step-intro">No extras are configured for this service.</p>';
      totalValueEl.textContent = money(currentTotal());
      return;
    }
    addonsListEl.innerHTML = addons.map(
      (a) => `
        <label class="booking-addon-row">
          <span class="booking-addon-check">
            <input type="checkbox" data-addon-id="${a.id}"${selectedAddOnIds.has(a.id) ? " checked" : ""}>
            <span class="booking-addon-name">${a.name}</span>
          </span>
          <span class="booking-addon-price">+$${a.price}</span>
        </label>`
    ).join("");
    addonsListEl.querySelectorAll("input[data-addon-id]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-addon-id");
        if (input.checked) selectedAddOnIds.add(id);
        else selectedAddOnIds.delete(id);
        totalValueEl.textContent = money(currentTotal());
      });
    });
    totalValueEl.textContent = money(currentTotal());
  }

  // ---------- step 3: review ----------
  function renderReviewStep() {
    reviewNameEl.textContent = activeServiceName;
    reviewDescEl.textContent = activeServiceDesc;
    reviewDescEl.hidden = !activeServiceDesc;

    const rows = [];
    if (selectedSlot) {
      rows.push({ label: "Date", value: formatDateNice(selectedSlot.localStartDate) });
      rows.push({ label: "Time", value: formatTime(selectedSlot.localStartDate) });
    }
    rows.push({ label: "Base rate", value: money(activeBasePrice) });
    const chosenAddons = addonsForService(activeServiceId).filter((a) => selectedAddOnIds.has(a.id));
    if (chosenAddons.length) {
      chosenAddons.forEach((a) => rows.push({ label: a.name, value: "+" + money(a.price) }));
    } else {
      rows.push({ label: "Extras", value: "None selected" });
    }

    reviewRowsEl.innerHTML = rows
      .map((r) => `<div class="booking-review-row"><span>${r.label}</span><span>${r.value}</span></div>`)
      .join("");
    totalValue2El.textContent = money(currentTotal());
  }

  async function handleCheckout() {
    if (checkoutInFlight) return;
    if (!selectedSlot) {
      goToStep(1);
      return;
    }
    const contact = validateContact();
    if (!contact) return;

    setCheckoutBusy(true, "Processing…");
    checkoutStatusEl.textContent = "";

    try {
      await initSquare();

      const sourceId = await tokenizeCard();
      await finishCheckout(sourceId, contact);
    } catch (err) {
      checkoutStatusEl.textContent = err && err.message ? err.message : "Something went wrong. Please try again, or email guybertho@aguybstudios.com.";
      console.warn("[AGUYB Booking]", err);
    } finally {
      setCheckoutBusy(false, "Pay & Book");
    }
  }

  // ---------- wire up trigger buttons ----------
  function bindTriggers() {
    document.querySelectorAll("[data-book-service-id]").forEach((el) => {
      if (el.dataset.bookingBound) return;
      el.dataset.bookingBound = "1";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        openModal(
          el.getAttribute("data-book-service-id"),
          el.getAttribute("data-book-service-name") || "Book This Package",
          el.getAttribute("data-book-price"),
          el.getAttribute("data-book-desc")
        );
      });
    });
  }

  document.addEventListener("DOMContentLoaded", bindTriggers);
  // cms.js may render new buttons after DOMContentLoaded once CMS data
  // loads, so re-scan shortly after too.
  window.addEventListener("load", () => setTimeout(bindTriggers, 800));
  // Expose for cms.js to call directly right after it re-renders a grid.
  window.AguybBookingFlow = { bindTriggers };
})();
