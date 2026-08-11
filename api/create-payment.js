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

function wixHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": process.env.WIX_API_KEY,
    "wix-site-id": WIX_SITE_ID
  };
}

function squareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
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

  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID || !process.env.WIX_API_KEY) {
    console.error("[create-payment] missing required environment variables");
    res.status(500).json({ error: "Checkout isn't fully configured yet. Please email guybertho@aguybstudios.com to book." });
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
              location: bookingLocation || undefined
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
          totalParticipants: 1
        },
        sendSmsReminder: false,
        participantNotification: { notifyParticipants: true }
      })
    });
    const bookingData = await bookingRes.json();
    if (!bookingRes.ok || !bookingData.booking) {
      console.error("[create-payment] create booking failed", bookingData);
      res.status(409).json({ error: "That time just became unavailable. Please pick another slot." });
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
              price: { amount: total.toFixed(2) },
              taxInfo: {
                taxRate: "0",
                taxAmount: { amount: "0.00" },
                taxableAmount: { amount: total.toFixed(2) }
              },
              paymentOption: "FULL_PAYMENT_ONLINE"
            }
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

  res.status(200).json({
    success: true,
    bookingId,
    receiptUrl: payment.receipt_url || null,
    amount: total
  });
};
