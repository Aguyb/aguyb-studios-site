/* ==========================================================================
   AGUYB STUDIOS - Real Booking Flow (Wix Bookings + Headless Redirects)
   ==========================================================================
   Lets a visitor pick an hour tier, see REAL available time slots pulled
   live from Wix Bookings, and hand off to Wix's own secure, hosted
   checkout page to add anything else on offer, fill in their details and
   pay. This file never touches payment details itself: the very last
   step is always a redirect to a real wixapis.com checkout URL, generated
   fresh for that exact slot. Uses the same anonymous Wix Headless visitor
   token pattern as main.js and cms.js. See README > "Book Now" for the
   full explanation.
   ========================================================================== */

(function () {
  "use strict";

  const WIX_CLIENT_ID = "b21d16f1-0865-4b6c-82c9-8fc43d39c696";
  const SITE_TIMEZONE = "America/New_York";

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

  function formatTime(localStartDate) {
    const [, timePart] = localStartDate.split("T");
    const [hStr, mStr] = timePart.split(":");
    let h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return h + ":" + mStr + " " + suffix;
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

  // ---------- modal ----------
  let modalEl, titleEl, dateInputEl, findBtnEl, slotsEl, statusEl, closeBtnEl;
  let activeServiceId = null;

  function buildModal() {
    if (modalEl) return;
    modalEl = document.createElement("div");
    modalEl.className = "booking-modal";
    modalEl.innerHTML =
      '<div class="booking-modal-inner glass">' +
      '  <button class="booking-modal-close" aria-label="Close">' +
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>' +
      "  </button>" +
      '  <div class="eyebrow">Check Real Availability</div>' +
      '  <h3 class="booking-modal-title"></h3>' +
      '  <div class="booking-modal-row">' +
      '    <input type="date" class="booking-date-input">' +
      '    <button class="btn btn-primary btn-sm booking-find-btn">Find Times</button>' +
      "  </div>" +
      '  <div class="booking-modal-status"></div>' +
      '  <div class="booking-slots-grid"></div>' +
      '  <p class="booking-modal-note">Pick a time to continue to secure checkout on Wix, where you can add extras, fill in your details and pay. Nothing is booked until that step is complete.</p>' +
      "</div>";
    document.body.appendChild(modalEl);

    titleEl = modalEl.querySelector(".booking-modal-title");
    dateInputEl = modalEl.querySelector(".booking-date-input");
    findBtnEl = modalEl.querySelector(".booking-find-btn");
    slotsEl = modalEl.querySelector(".booking-slots-grid");
    statusEl = modalEl.querySelector(".booking-modal-status");
    closeBtnEl = modalEl.querySelector(".booking-modal-close");

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
  }

  function closeModal() {
    modalEl.classList.remove("active");
    document.body.style.overflow = "";
  }

  function openModal(serviceId, name) {
    buildModal();
    activeServiceId = serviceId;
    titleEl.textContent = name;
    dateInputEl.value = todayISO();
    slotsEl.innerHTML = "";
    statusEl.textContent = "";
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
        btn.addEventListener("click", () => selectSlot(slot, btn));
        slotsEl.appendChild(btn);
      });
    } catch (err) {
      findBtnEl.disabled = false;
      statusEl.textContent = "Couldn't load availability right now. Please try again in a moment.";
      console.warn("[AGUYB Booking]", err);
    }
  }

  async function selectSlot(slot, btnEl) {
    slotsEl.querySelectorAll(".booking-slot-btn").forEach((b) => (b.disabled = true));
    btnEl.textContent = "Redirecting…";
    btnEl.classList.add("is-loading");
    try {
      const url = await createCheckoutRedirect(slot);
      window.location.href = url;
    } catch (err) {
      statusEl.textContent = "Couldn't start checkout. Please try again, or email hello@aguybstudios.com.";
      slotsEl.querySelectorAll(".booking-slot-btn").forEach((b) => (b.disabled = false));
      btnEl.textContent = formatTime(slot.localStartDate);
      btnEl.classList.remove("is-loading");
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
        openModal(el.getAttribute("data-book-service-id"), el.getAttribute("data-book-service-name") || "Book This Package");
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
