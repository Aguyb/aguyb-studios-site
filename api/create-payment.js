/* ==========================================================================
   AGUYB STUDIOS - Custom booking checkout (Vercel Serverless Function)
   ==========================================================================
   Replaces the old Wix-hosted checkout redirect (which broke once the
   custom domain moved off Wix) with a fully custom flow that stays on
   aguybstudios.com the whole time:

     1. Validate & re-price the request server-side. The client sends a
        proposed price, but this function never trusts it — it recomputes
        the total from a hardcoded allowlist of real service/add-on prices
        before charging anything.
     2. Create a Wix booking in CREATED status (holds the slot, doesn't
        yet appear on the Booking Calendar or block availability).
     3. Charge the card through Square's Payments API using the
        client-tokenized card (sourceId from the Web Payments SDK).
     4. On a successful charge: mark the Wix booking CONFIRMED + PAID via
        Confirm Or Decline Booking, and log a Wix eCommerce order so the
        sale still shows up in the Wix dashboard for invoicing/reporting.
     5. On a failed charge: decline the held Wix booking so it never
        blocks the slot for other customers.

   This mirrors Wix's own documented pattern for a custom checkout:
   https://dev.wix.com/docs/api-reference/business-solutions/bookings/handle-payments-with-a-custom-checkout

   Required Vercel environment variables (Project Settings -> Environment
   Variables -> add for Production, and Preview if you want to test there):

     SQUARE_ACCESS_TOKEN  Square access token (Sandbox or Production, from
                          the Square Developer Dashboard -> Credentials)
     SQUARE_LOCATION_ID   The Square location ID to charge against
     SQUARE_ENVIRONMENT   "production" or "sandbox" (defaults to production
                          if unset -- set this to "sandbox" while testing)
     WIX_API_KEY           A Wix API key generated from the Wix dashboard
                          (Settings -> API Keys) with "Manage Bookings" and
                          "Manage Orders" permissions for this site
     WIX_SITE_ID            Optional override; defaults to the real site ID
                          below if unset.

   None of these values are hardcoded here on purpose -- they're secrets
   and must be entered directly in the Vercel dashboard, never committed
   to the repo.
   ========================================================================== */

const WIX_SITE_ID = process.env.WIX_SITE_ID || "d858f430-e27a-470b-8859-45d173724c18";
const WIX_BOOKINGS_APP_ID = "13d21c63-b5ec-5912-8397-c3a5ddb27a97";
const TIMEZONE = "America/New_York";

// Server-side price allowlist mirroring what's actually advertised on
// pricing.html / index.html / sets.html. A single Wix Bookings service can
// legitimately be booked at more than one price because several "bundle"
// products on the site resell the same underlying studio-rental slot at a
// marked-up price that folds in extra work (editing, producer, etc). Any
// serviceId/price/add-on combination that isn't listed here is rejected
// instead of trusting whatever total the client sends.
const ALLOWED_SERVICES = {
  "b77a785e-e00a-4e90-9903-015f8c53197c": { name: "Studio Rental — 2 Hours", prices: [399, 499], addons: true },
  "eb75d42d-cb6e-4db8-99f8-56a71eaddae6": { name: "Studio Rental — 3 Hours", prices: [499, 929], addons: true },
  "fbf025db-90ac-4ae4-a955-96c4d5c807af": { name: "Studio Rental — 4 Hours", prices: [599, 1249], addons: true },
  "826cd5d0-0f36-4cd8-9821-4e5cbdb778a2": { name: "Studio Rental — 6 Hours", prices: [799], addons: true },
  "4668ec4f-7cdd-49c4-ae39-ec87cc04328d": { name: "Studio Rental — Full Day", prices: [999, 1499], addons: true },
  "713f9b3d-8419-454c-9730-f26bec6b8684": { name: "Event Filming — Raw Footage Delivery", prices: [450], addons: false }
};

const ALLOWED_ADDONS = {
  "df3a4dbe-5b3c-4d5b-b97b-1bb1c24bc376": { name: "Additional camera", price: 40 },
  "4fbc73a1-ddb0-4c31-bb87-3cba5da75752": { name: "Teleprompter", price: 36 },
  "c7c2e415-5a84-4b1a-bff1-9f21d45ce299": { name: "Producer on set", price: 70 },
  "b8382aac-dfc5-4cac-8d9f-6c7e0da1e930": { name: "Subtitles", price: 120 },
  "c146e5d2-a15c-4deb-a3ab-abc9bdeaa13c": { name: "Video editing (per episode)", price: 250 },
  "7f4c8aa1-3be7-4412-bb6f-13ae612f29ef": { name: "Graphics motion (once)", price: 200 }
};

// Every addon-enabled service shares this single Wix add-on group
// ("Studio Rental Weekday") -- confirmed live via List Add On Groups By
// Service Id against all 5 addon-enabled service IDs above, which all
// resolved to this same groupId. Create Booking's bookedAddOns entries
// require a valid groupId GUID (Wix rejects the booking outright without
// one -- "groupId is not a valid GUID" -- confirmed via a live production
// error after the first version of this shipped without it).
const ADDON_GROUP_ID = "82b5c720-2264-4cc8-ae2f-10f89d15eb57";

function wixHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": process.env.WIX_API_KEY,
    "wix-site-id": WIX_SITE_ID
  };
}

// Same physical studio / same single staff member sold as 7 separate Wix
// Bookings services (6 studio-rental hour tiers + off-site Event Filming),
// each with its own independent Wix schedule -- see api/available-slots.js
// for the full explanation and the live test that proved Wix's own
// double-booking check doesn't cross-reference them. That endpoint already
// filters the client's slot picker, but a second person could still race
// past it between page load and checkout, so this re-checks right before
// actually creating the booking.
const SIBLING_SCHEDULE_IDS = [
  "0def0b72-d503-49ff-9e2f-84a4cf6e2acd", // 1 Hour (hidden)
  "a6818320-518e-499d-92a4-6cfc925545ef", // 2 Hours
  "676df7ad-9915-4b6a-ae07-c4645390081c", // 3 Hours
  "66aeed0c-c0b0-47bd-a1b2-1f37c764d7a1", // 4 Hours
  "ba80b99b-c697-46a9-8880-db1476d72820", // 6 Hours
  "b88fca8d-72a8-4844-bfe9-1fc5e8001f87", // Full Day (8 Hours)
  "1c35a29f-2639-456c-a30a-8c8e62ac425c"  // Event Filming
];

function localToUtcMillis(localDateTimeStr, timeZone) {
  const guess = new Date(localDateTimeStr + "Z");
  const asTz = new Date(guess.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = asUtc.getTime() - asTz.getTime();
  return guess.getTime() + offset;
}

function overlapsWindow(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// Human-readable "Weekday, Month Day, Year, h:mm AM – h:mm PM" for the
// confirmation email. Falls back to the raw strings if formatting fails for
// any reason -- this must never be the thing that breaks email sending.
function formatBookingWindow(startDate, endDate) {
  try {
    const startMs = localToUtcMillis(startDate, TIMEZONE);
    const endMs = localToUtcMillis(endDate, TIMEZONE);
    const dateFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE, weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
    const timeFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE, hour: "numeric", minute: "2-digit"
    });
    return dateFmt.format(startMs) + ", " + timeFmt.format(startMs) + " – " + timeFmt.format(endMs);
  } catch (e) {
    return startDate + " – " + endDate;
  }
}

// Returns true if [startDate, endDate) (naive local datetime strings)
// overlaps any CONFIRMED/PENDING booking on a sibling schedule.
async function hasConflict(startDate, endDate) {
  const reqStart = localToUtcMillis(startDate, TIMEZONE);
  const reqEnd = localToUtcMillis(endDate, TIMEZONE);
  const rangeStart = new Date(reqStart - 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(reqEnd + 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch("https://www.wixapis.com/_api/bookings-reader/v2/extended-bookings/query", {
    method: "POST",
    headers: wixHeaders(),
    body: JSON.stringify({
      query: {
        filter: {
          $and: [
            { "bookedEntity.item.slot.scheduleId": { $in: SIBLING_SCHEDULE_IDS } },
            { status: { $in: ["CONFIRMED", "PENDING"] } },
            { startDate: { $gte: rangeStart } },
            { startDate: { $lte: rangeEnd } }
          ]
        },
        cursorPaging: { limit: 100 }
      }
    })
  });
  if (!res.ok) {
    // Fail closed on infrastructure errors: better to briefly block a
    // legitimate booking than risk a silent double-booking.
    throw new Error("Could not verify availability (" + res.status + ")");
  }
  const data = await res.json();
  const bookings = (data.extendedBookings || []).map((b) => b.booking || b);
  return bookings.some((b) => {
    if (!b.startDate || !b.endDate) return false;
    return overlapsWindow(reqStart, reqEnd, new Date(b.startDate).getTime(), new Date(b.endDate).getTime());
  });
}

function squareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

// The client's `location` object is passed straight through from the Wix
// Time Slots V2 API response (booking-flow.js's listAvailability()), whose
// `locationType` values ("BUSINESS", "CUSTOM", ...) don't match the enum
// Create Booking actually accepts on booking.bookedEntity.slot.location
// (`OWNER_BUSINESS` / `OWNER_CUSTOM` / `CUSTOM` / `UNDEFINED` -- confirmed
// against Wix's Create Booking schema and code examples). Every booking
// attempt failed with a 400 "locationType enum must be in [...]" from Wix
// until this normalization was added.
const LOCATION_TYPE_MAP = {
  BUSINESS: "OWNER_BUSINESS",
  OWNER_BUSINESS: "OWNER_BUSINESS",
  CUSTOM: "CUSTOM",
  OWNER_CUSTOM: "OWNER_CUSTOM",
  CUSTOMER: "CUSTOM"
};
function normalizeLocation(loc) {
  if (!loc) return undefined;
  const mapped = LOCATION_TYPE_MAP[loc.locationType];
  return {
    id: loc.id,
    name: loc.name,
    formattedAddress: loc.formattedAddress,
    // Omit locationType entirely rather than send a value Wix will reject --
    // Create Booking can usually infer it from the location id anyway.
    ...(mapped ? { locationType: mapped } : {})
  };
}

async function declineBooking(id, revision) {
  try {
    await fetch("https://www.wixapis.com/_api/bookings-service/v2/bookings/" + id + "/decline", {
      method: "POST",
      headers: wixHeaders(),
      body: JSON.stringify({
        bookingId: id,
        revision,
        participantNotification: { notifyParticipants: false }
      })
    });
  } catch (e) {
    console.error("[create-payment] decline booking failed", id, e);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  const {
    sourceId,
    serviceId,
    scheduleId,
    startDate,
    endDate,
    location: bookingLocation,
    basePrice,
    addonIds,
    contact
  } = body;

  // ---- 1. validate & re-price ----
  if (!sourceId || !serviceId || !scheduleId || !startDate || !endDate) {
    res.status(400).json({ error: "Missing required booking details." });
    return;
  }
  if (!contact || !contact.firstName || !contact.email) {
    res.status(400).json({ error: "Name and email are required." });
    return;
  }

  const serviceDef = ALLOWED_SERVICES[serviceId];
  if (!serviceDef) {
    res.status(400).json({ error: "Unknown service." });
    return;
  }
  if (!serviceDef.prices.includes(Number(basePrice))) {
    res.status(400).json({ error: "Price doesn't match — please refresh and try again." });
    return;
  }

  const chosenAddonIds = Array.isArray(addonIds) ? addonIds.filter(Boolean) : [];
  if (chosenAddonIds.length && !serviceDef.addons) {
    res.status(400).json({ error: "This service doesn't support add-ons." });
    return;
  }
  let addonsTotal = 0;
  for (const id of chosenAddonIds) {
    const addon = ALLOWED_ADDONS[id];
    if (!addon) {
      res.status(400).json({ error: "Unknown add-on." });
      return;
    }
    addonsTotal += addon.price;
  }

  const total = Number(basePrice) + addonsTotal;
  if (!(total > 0)) {
    res.status(400).json({ error: "Invalid total." });
    return;
  }

  // Wix Bookings' own BookedAddOn shape (confirmed against the Create
  // Booking method schema): { id, groupId, quantity } -- "name" is
  // server-populated and read-only, so we don't send it. This is what
  // makes the chosen add-ons actually show up on the booking's details in
  // the Wix Booking Calendar -- previously nothing about add-ons was ever
  // written onto the Wix booking record at all. groupId is required (see
  // ADDON_GROUP_ID above) even though it isn't obviously required from the
  // method schema alone -- Wix's live validation rejects it otherwise.
  const bookedAddOns = chosenAddonIds.map((id) => ({ id, groupId: ADDON_GROUP_ID, quantity: 1 }));

  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID || !process.env.WIX_API_KEY) {
    console.error("[create-payment] missing required environment variables");
    res.status(500).json({ error: "Checkout isn't fully configured yet. Please email guybertho@aguybstudios.com to book." });
    return;
  }

  // ---- 1b. re-check for cross-tier conflicts right before booking ----
  // The client already filtered its slot picker through
  // api/available-slots.js, but a second visitor could have booked the
  // conflicting slot on a sibling tier in the meantime -- this closes
  // that race window.
  try {
    if (await hasConflict(startDate, endDate)) {
      res.status(409).json({ error: "That time just became unavailable. Please pick another slot." });
      return;
    }
  } catch (err) {
    console.error("[create-payment] conflict check failed", err);
    res.status(502).json({ error: "Couldn't verify availability. Please try again." });
    return;
  }

  // ---- 2. create the Wix booking (CREATED, holds the slot) ----
  let bookingId, bookingRevision;
  try {
    const bookingRes = await fetch("https://www.wixapis.com/bookings/v2/bookings", {
      method: "POST",
      headers: wixHeaders(),
      body: JSON.stringify({
        booking: {
          bookedEntity: {
            slot: {
              serviceId,
              scheduleId,
              startDate,
              endDate,
              timezone: TIMEZONE,
              location: normalizeLocation(bookingLocation)
            },
            title: serviceDef.name,
            tags: ["INDIVIDUAL"]
          },
          contactDetails: {
            firstName: contact.firstName,
            lastName: contact.lastName || "",
            email: contact.email,
            phone: contact.phone || ""
          },
          additionalFields: [],
          totalParticipants: 1,
          ...(bookedAddOns.length ? { bookedAddOns } : {})
        },
        sendSmsReminder: false,
        participantNotification: { notifyParticipants: true },
        // skipAddOnValidation: if an add-on's Wix-side group association is
        // ever slightly out of sync with this file's ALLOWED_ADDONS list,
        // this keeps the add-on attached instead of hard-failing the whole
        // booking (per Wix's own documented escape hatch for this).
        ...(bookedAddOns.length ? { flowControlSettings: { skipAddOnValidation: true } } : {})
      })
    });
    const bookingData = await bookingRes.json();
    if (!bookingRes.ok || !bookingData.booking) {
      console.error("[create-payment] create booking failed", bookingRes.status, JSON.stringify(bookingData));
      // Only Wix's actual 409 (slot taken / double-booking conflict) gets
      // the "unavailable, pick another slot" message. Everything else
      // (validation errors, bad request shape, etc.) gets a distinct,
      // honest error instead of silently mislabeling it as an availability
      // problem -- that mislabeling is exactly what made a real bug (an
      // add-on validation failure) look like a scheduling issue.
      if (bookingRes.status === 409) {
        res.status(409).json({ error: "That time just became unavailable. Please pick another slot." });
      } else {
        res.status(502).json({ error: "Couldn't complete your booking. Please try again or email guybertho@aguybstudios.com." });
      }
      return;
    }
    bookingId = bookingData.booking.id;
    bookingRevision = bookingData.booking.revision;
  } catch (err) {
    console.error("[create-payment] create booking error", err);
    res.status(502).json({ error: "Couldn't reach the booking system. Please try again." });
    return;
  }

  // ---- 3. charge the card via Square ----
  let payment;
  try {
    const idempotencyKey = (bookingId + "-" + Date.now()).slice(0, 45);
    const sqRes = await fetch(squareBaseUrl() + "/v2/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": "2026-07-15",
        "Authorization": "Bearer " + process.env.SQUARE_ACCESS_TOKEN
      },
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        source_id: sourceId,
        amount_money: { amount: Math.round(total * 100), currency: "USD" },
        location_id: process.env.SQUARE_LOCATION_ID,
        buyer_email_address: contact.email,
        reference_id: bookingId,
        note: "AGUYB Studios — " + serviceDef.name
      })
    });
    const sqData = await sqRes.json();
    if (!sqRes.ok || !sqData.payment || sqData.payment.status !== "COMPLETED") {
      await declineBooking(bookingId, bookingRevision);
      const message = (sqData.errors && sqData.errors[0] && sqData.errors[0].detail) || "Card was declined.";
      res.status(402).json({ error: message });
      return;
    }
    payment = sqData.payment;
  } catch (err) {
    console.error("[create-payment] square charge error", err);
    await declineBooking(bookingId, bookingRevision);
    res.status(502).json({ error: "Couldn't reach the payment processor. Please try again." });
    return;
  }

  // ---- 4. mark the Wix booking confirmed + paid ----
  try {
    const confirmRes = await fetch(
      "https://www.wixapis.com/bookings/v2/confirmation/" + bookingId + ":confirmOrDecline",
      {
        method: "POST",
        headers: wixHeaders(),
        body: JSON.stringify({ paymentStatus: "PAID" })
      }
    );
    if (!confirmRes.ok) {
      console.error("[create-payment] confirm booking failed after successful payment", bookingId, await confirmRes.text());
    }
  } catch (err) {
    // Payment already succeeded -- don't fail the customer-facing request
    // over a dashboard-sync hiccup, but this needs a human to reconcile.
    console.error("[create-payment] confirm booking error after successful payment", bookingId, err);
  }

  // ---- 5. log a Wix order so the sale shows up for invoicing/reporting ----
  try {
    const orderRes = await fetch("https://www.wixapis.com/ecom/v1/orders", {
      method: "POST",
      headers: wixHeaders(),
      body: JSON.stringify({
        order: {
          lineItems: [
            {
              productName: { original: serviceDef.name },
              catalogReference: { catalogItemId: serviceId, appId: WIX_BOOKINGS_APP_ID },
              quantity: 1,
              itemType: { preset: "SERVICE" },
              price: { amount: Number(basePrice).toFixed(2) },
              taxInfo: {
                taxRate: "0",
                taxAmount: { amount: "0.00" },
                taxableAmount: { amount: Number(basePrice).toFixed(2) }
              },
              paymentOption: "FULL_PAYMENT_ONLINE"
            },
            // Itemize each add-on separately so the sale record in the Wix
            // dashboard shows exactly what was booked, not just a lump sum.
            ...chosenAddonIds.map((id) => {
              const addon = ALLOWED_ADDONS[id];
              return {
                productName: { original: addon.name },
                quantity: 1,
                itemType: { preset: "SERVICE" },
                price: { amount: addon.price.toFixed(2) },
                taxInfo: {
                  taxRate: "0",
                  taxAmount: { amount: "0.00" },
                  taxableAmount: { amount: addon.price.toFixed(2) }
                },
                paymentOption: "FULL_PAYMENT_ONLINE"
              };
            })
          ],
          buyerInfo: { email: contact.email },
          channelInfo: { type: "OTHER_PLATFORM" },
          status: "APPROVED",
          paymentStatus: "PAID",
          priceSummary: {
            subtotal: { amount: total.toFixed(2) },
            tax: { amount: "0.00" },
            shipping: { amount: "0.00" },
            discount: { amount: "0.00" },
            total: { amount: total.toFixed(2) }
          },
          currency: "USD"
        }
      })
    });
    if (!orderRes.ok) {
      console.error("[create-payment] create order failed after successful payment", bookingId, await orderRes.text());
    }
  } catch (err) {
    console.error("[create-payment] create order error after successful payment", bookingId, err);
  }

  // ---- 6. email the customer a direct booking confirmation ----
  // Wix's built-in Automated Communications for Bookings aren't guaranteed
  // to fire for API-driven custom-checkout bookings like this one -- Wix's
  // own custom-checkout guide doesn't document any notification step at
  // all, and Confirm Or Decline Booking has no notification field. So this
  // sends an explicit transactional email via Wix's Email Transmission API
  // instead of relying on that.
  //
  // Requires a *verified* sender email: Wix Dashboard -> Marketing ->
  // Emails -> Senders -> verify guybertho@aguybstudios.com (or update
  // senderEmailAddress below to whichever address you verify). Until
  // that's done, this call fails harmlessly -- it's logged only and never
  // blocks the customer-facing checkout response.
  try {
    const addonLines = chosenAddonIds
      .map((id) => ALLOWED_ADDONS[id])
      .filter(Boolean)
      .map((a) => "<li>" + a.name + " — $" + a.price + "</li>")
      .join("");
    const emailRes = await fetch("https://www.wixapis.com/email-transmissions/v1/email-transmissions/send", {
      method: "POST",
      headers: wixHeaders(),
      body: JSON.stringify({
        emailTransmission: {
          emailSubject: "You're booked! " + serviceDef.name + " — AGUYB Studios",
          emailHtmlContent:
            '<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111">' +
            "<h2 style=\"margin-bottom:4px\">You're booked!</h2>" +
            "<p>Hi " + (contact.firstName || "there") + ",</p>" +
            "<p>Your booking with AGUYB Studios is confirmed:</p>" +
            '<p style="margin:16px 0"><strong>' + serviceDef.name + "</strong><br>" +
            formatBookingWindow(startDate, endDate) + "</p>" +
            (addonLines ? "<p><strong>Add-ons:</strong></p><ul>" + addonLines + "</ul>" : "") +
            '<p style="font-size:16px"><strong>Total paid: $' + total.toFixed(2) + "</strong></p>" +
            "<p>Questions or need to reschedule? Just reply to this email or reach us at guybertho@aguybstudios.com.</p>" +
            "<p>— AGUYB Studios</p>" +
            "</div>",
          senderName: "AGUYB Studios",
          senderEmailAddress: "guybertho@aguybstudios.com",
          replyTo: { emailAddress: "guybertho@aguybstudios.com" },
          toRecipients: [{ emailAddress: contact.email }],
          type: "TRANSACTIONAL"
        },
        idempotencyKey: bookingId
      })
    });
    if (!emailRes.ok) {
      console.error("[create-payment] confirmation email failed", bookingId, await emailRes.text());
    }
  } catch (err) {
    console.error("[create-payment] confirmation email error", bookingId, err);
  }

  res.status(200).json({
    success: true,
    bookingId,
    receiptUrl: payment.receipt_url || null,
    amount: total
  });
};
