/* ==========================================================================
   AGUYB STUDIOS - Custom invoice checkout (Vercel Serverless Function)
   ==========================================================================
   Charges a custom invoice through Square. Stopgap for while Wix's Invoices
   API is unavailable -- see get-custom-invoice.js for the full context.

   Security note, same pattern as api/create-payment.js: the client sends a
   sourceId (Square card token) and the invoice id, nothing else is trusted.
   The actual charge amount is always re-read from the custom_invoices Wix
   Data item server-side, right before charging -- never from the request
   body. This is what stops someone from editing the page/URL to pay less
   than the real amount.

   Confirmed against the live Wix Data API and against api/create-payment.js's
   already-working Square integration before writing this:
     GET https://www.wixapis.com/wix-data/v2/items/{itemId}?dataCollectionId=custom_invoices
     PUT https://www.wixapis.com/wix-data/v2/items/{itemId}  (body: {dataCollectionId, dataItem:{id, data}})
     POST {squareBase}/v2/payments

   Required Vercel environment variables -- all already set for
   api/create-payment.js, nothing new to add:
     WIX_API_KEY, WIX_SITE_ID, SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID,
     SQUARE_ENVIRONMENT
   ========================================================================== */

const WIX_SITE_ID = process.env.WIX_SITE_ID || "d858f430-e27a-470b-8859-45d173724c18";
const COLLECTION_ID = "custom_invoices";

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const { id, sourceId, buyerEmail } = body;
  if (!id || !sourceId) {
    res.status(400).json({ error: "Missing required payment details." });
    return;
  }

  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID || !process.env.WIX_API_KEY) {
    console.error("[pay-custom-invoice] missing required environment variables");
    res.status(500).json({ error: "Checkout isn't fully configured yet. Please email guybertho@aguybstudios.com." });
    return;
  }

  // ---- 1. re-read the real invoice server-side (never trust the client for amount) ----
  let item;
  try {
    const itemRes = await fetch(
      "https://www.wixapis.com/wix-data/v2/items/" + encodeURIComponent(id) + "?dataCollectionId=" + COLLECTION_ID + "&consistentRead=true",
      { method: "GET", headers: wixHeaders() }
    );
    if (itemRes.status === 404) {
      res.status(404).json({ error: "We couldn't find that invoice." });
      return;
    }
    if (!itemRes.ok) {
      console.error("[pay-custom-invoice] lookup failed", itemRes.status, await itemRes.text());
      res.status(502).json({ error: "Couldn't load the invoice right now. Please try again." });
      return;
    }
    const data = await itemRes.json();
    item = data.dataItem;
  } catch (e) {
    console.error("[pay-custom-invoice] lookup error", e);
    res.status(502).json({ error: "Couldn't load the invoice right now. Please try again." });
    return;
  }

  if (!item || !item.data) {
    res.status(404).json({ error: "We couldn't find that invoice." });
    return;
  }

  if (item.data.status === "paid") {
    res.status(409).json({ error: "This invoice has already been paid." });
    return;
  }

  const amount = Number(item.data.amount);
  if (!(amount > 0)) {
    res.status(400).json({ error: "This invoice doesn't have a valid amount set." });
    return;
  }
  const currency = item.data.currency || "USD";
  const description = item.data.description || "AGUYB Studios";

  // ---- 2. charge the card via Square ----
  let payment;
  try {
    const idempotencyKey = (id + "-" + Date.now()).slice(0, 45);
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
        amount_money: { amount: Math.round(amount * 100), currency: currency },
        location_id: process.env.SQUARE_LOCATION_ID,
        ...(buyerEmail ? { buyer_email_address: buyerEmail } : {}),
        reference_id: id,
        note: "AGUYB Studios — " + description
      })
    });
    const sqData = await sqRes.json();
    if (!sqRes.ok || !sqData.payment || sqData.payment.status !== "COMPLETED") {
      const message = (sqData.errors && sqData.errors[0] && sqData.errors[0].detail) || "Card was declined.";
      res.status(402).json({ error: message });
      return;
    }
    payment = sqData.payment;
  } catch (e) {
    console.error("[pay-custom-invoice] square charge error", e);
    res.status(502).json({ error: "Couldn't reach the payment processor. Please try again." });
    return;
  }

  // ---- 3. mark the invoice paid ----
  try {
    const updateRes = await fetch("https://www.wixapis.com/wix-data/v2/items/" + encodeURIComponent(id), {
      method: "PUT",
      headers: wixHeaders(),
      body: JSON.stringify({
        dataCollectionId: COLLECTION_ID,
        dataItem: {
          id,
          data: {
            ...item.data,
            status: "paid",
            squarePaymentId: payment.id,
            paidDate: { "$date": new Date().toISOString() }
          }
        }
      })
    });
    if (!updateRes.ok) {
      // Payment already succeeded -- don't fail the customer-facing request
      // over a record-keeping hiccup, but this needs a human to reconcile.
      console.error("[pay-custom-invoice] failed to mark invoice paid after successful payment", id, await updateRes.text());
    }
  } catch (e) {
    console.error("[pay-custom-invoice] error marking invoice paid after successful payment", id, e);
  }

  res.status(200).json({ success: true, paymentId: payment.id });
};
