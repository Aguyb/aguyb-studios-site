/* ==========================================================================
   AGUYB STUDIOS - Custom invoice lookup (Vercel Serverless Function)
   ==========================================================================
   Backs pay-custom.html. This is a stopgap that bypasses Wix's Invoices API
   entirely (it's been returning INVOICES_API_UNAVAILABLE) -- custom
   invoices live in a plain Wix Data collection ("custom_invoices") instead,
   and get paid straight through Square, the same processor the booking
   checkout already uses.

   Read-only: returns the invoice summary for display. The actual charge
   happens in api/pay-custom-invoice.js, which re-reads the amount from this
   same collection server-side rather than trusting anything the client
   sends -- this endpoint is never the source of truth for what gets charged.

   Wix Data collection "custom_invoices" fields (created via the Data
   Collections API):
     description (TEXT), amount (NUMBER), currency (TEXT), clientName
     (TEXT), clientEmail (TEXT), status (TEXT: "unpaid" | "paid"),
     squarePaymentId (TEXT), paidDate (DATETIME)

   Confirmed against the live Wix Data API before writing this:
     GET https://www.wixapis.com/wix-data/v2/items/{itemId}?dataCollectionId=custom_invoices

   Required Vercel environment variables -- both already set for the other
   Wix-calling functions on this site, nothing new to add:
     WIX_API_KEY, WIX_SITE_ID
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = req.query && req.query.id;
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Missing invoice id." });
    return;
  }

  try {
    const itemRes = await fetch(
      "https://www.wixapis.com/wix-data/v2/items/" + encodeURIComponent(id) + "?dataCollectionId=" + COLLECTION_ID,
      { method: "GET", headers: wixHeaders() }
    );
    if (itemRes.status === 404) {
      res.status(404).json({ error: "We couldn't find that invoice. Double-check the link and try again." });
      return;
    }
    if (!itemRes.ok) {
      const text = await itemRes.text().catch(() => "");
      console.error("[get-custom-invoice] failed", itemRes.status, text);
      res.status(502).json({ error: "Couldn't load the invoice right now. Please try again in a moment." });
      return;
    }
    const data = await itemRes.json();
    const item = data.dataItem;
    if (!item || !item.data) {
      res.status(404).json({ error: "We couldn't find that invoice. Double-check the link and try again." });
      return;
    }
    const d = item.data;
    res.status(200).json({
      invoice: {
        id: item.id,
        description: d.description || "AGUYB Studios",
        amount: Number(d.amount) || 0,
        currency: d.currency || "USD",
        clientName: d.clientName || "",
        status: d.status === "paid" ? "paid" : "unpaid"
      }
    });
  } catch (e) {
    console.error("[get-custom-invoice] error", e);
    res.status(500).json({ error: "Couldn't load the invoice right now. Please try again in a moment." });
  }
};
