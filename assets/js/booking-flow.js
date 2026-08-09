/* ==========================================================================
   AGUYB STUDIOS - Real Booking Flow (Wix Bookings + Headless Redirects)
   ==========================================================================
   A 3-step guided flow: 1) pick a REAL available date/time pulled live from
   Wix Bookings, 2) choose real add-ons (same ones configured on the
   service in Wix, with live-updating pricing) to see an estimated total,
   3) review a summary (service, date/time, extras, total) before handing
   off to Wix's own secure, hosted checkout page to confirm the same
   extras, fill in details and pay. This file never touches payment
   details itself: the very last step is always a redirect to a real
   wixapis.com checkout URL, generated fresh for that exact slot. Uses the
   same anonymous Wix Headless visitor token pattern as main.js and
   cms.js. See README > "Real booking" for the full explanation.
   ========================================================================== */

(function () {
  "use strict";

  const WIX_CLIENT_ID = "b21d16f1-0865-4b6c-82c9-8fc43d39c696";
  const SITE_TIMEZONE = "America/New_York";

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

  let tokenPromise = null;
  function getVisitorToken() {
    if (!tokenPromise) {
      tokenPromise = fetch("https://www.wixapis.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: WIX_CLIENT_ID, grantType: "anonymous" })
      })
        .then((res) => {
          if (!res.ok) throw new Error("Could not authenticate with Wix");
          return res.json();
        })
        .then((data) => data.access_token);
    }
    return tokenPromise;
  }

  async function listAvailability(serviceId, dateStr) {
    const token = await getVisitorToken();
    const from = dateStr + "T00:00:00";
    const to = dateStr + "T23:59:59";
    const res = await fetch("https://www.wixapis.com/_api/service-availability/v2/time-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({
        serviceId,
        fromLocalDate: from,
        toLocalDate: to,
        timeZone: SITE_TIMEZONE,
        bookable: true,
        cursorPaging: { limit: 60 }
      })
    });
    if (!res.ok) throw new Error("Could not load availability (" + res.status + ")");
    const data = await res.json();
    return data.timeSlots || [];
  }

  async function createCheckoutRedirect(timeSlot) {
    const token = await getVisitorToken();
    const slotAvailability = {
      slot: {
        serviceId: timeSlot.serviceId,
        scheduleId: timeSlot.scheduleId,
        startDate: timeSlot.localStartDate,
        endDate: timeSlot.localEndDate,
        timezone: SITE_TIMEZONE,
        location: timeSlot.location
      },
      bookable: timeSlot.bookable,
      totalSpots: timeSlot.totalCapacity,
      openSpots: timeSlot.remainingCapacity,
      bookingPolicyViolations: timeSlot.bookingPolicyViolations
    };

    const res = await fetch("https://www.wixapis.com/headless/v1/redirect-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({
        bookingsCheckout: { slotAvailability, timezone: SITE_TIMEZONE },
        callbacks: {
          postFlowUrl: window.location.origin + window.location.pathname,
          thankYouPageUrl: window.location.origin + window.location.pathname + "?booked=1"
        }
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error("Could not start checkout (" + res.status + "): " + body);
    }
    const data = await res.json();
    return data.redirectSession.fullUrl;
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
      '    <div class="booking-review-card">' +
      '      <div class="booking-review-name"></div>' +
      '      <p class="booking-review-desc"></p>' +
      '      <div class="booking-review-rows"></div>' +
      '      <div class="booking-total-row"><span>Estimated total</span><strong class="booking-total-value-2"></strong></div>' +
      "    </div>" +
      '    <div class="booking-step-actions">' +
      '      <button type="button" class="btn btn-ghost btn-sm" data-back-to="2">Back</button>' +
      '      <button type="button" class="btn btn-primary btn-block booking-checkout-btn">Continue to Secure Checkout</button>' +
      "    </div>" +
      '    <div class="booking-checkout-status"></div>' +
      '    <p class="booking-modal-note">You&rsquo;ll select these same extras, fill in your details and pay on Wix&rsquo;s secure hosted checkout. Nothing is booked until that step is complete.</p>' +
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
    if (n === 3) renderReviewStep();
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
    if (!selectedSlot) {
      goToStep(1);
      return;
    }
    checkoutBtnEl.disabled = true;
    checkoutBtnEl.textContent = "Redirecting…";
    checkoutStatusEl.textContent = "";
    try {
      const url = await createCheckoutRedirect(selectedSlot);
      if (typeof gtag === "function") {
        gtag("event", "begin_checkout", {
          currency: "USD",
          value: currentTotal(),
          items: [{ item_name: activeServiceName || "Studio Booking", price: currentTotal() }]
        });
      }
      window.location.href = url;
    } catch (err) {
      checkoutStatusEl.textContent = "Couldn't start checkout. Please try again, or email guybertho@aguybstudios.com.";
      checkoutBtnEl.disabled = false;
      checkoutBtnEl.textContent = "Continue to Secure Checkout";
      console.warn("[AGUYB Booking]", err);
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
