/* ==========================================================================
   AGUYB STUDIOS - Invoice payment page data (Vercel Serverless Function)
   ==========================================================================
   Backs pay-invoice.html. When a client clicks the invoice-payment link
   Wix generates for us, we point them at
   https://www.aguybstudios.com/pay-invoice?invoiceId=<id> instead of
   sending them straight to Wix's own hosted invoice page. This endpoint
   fetches the real invoice from Wix and hands back a clean summary,
   plus (when the invoice can still be paid) a real Wix-hosted checkout
   URL from Invoices' own Initiate Payment endpoint.

   This is a read + handoff only. No card data ever touches this function
   and no payment is processed here -- the "Pay Invoice" button on the
   page sends the client to Wix's own secure checkout to actually pay.

   Confirmed against the live Wix Invoices v4 API schema (Get Invoice +
   Initiate Payment) before writing this:
     GET  https://www.wixapis.com/invoices/v4/invoices/{invoiceId}
     POST https://www.wixapis.com/invoices/v4/invoices/{invoiceId}/initiate-payment
          body: { "invoiceId": "<id>" } -> { "url": "...", "paymentRequestId": "..." }

   Required Vercel environment variables -- both already set for
   api/create-payment.js, nothing new to add:
     WIX_API_KEY   Wix API key with "Manage Invoices" permission
                   (INVOICES.INVOICE_READ + INVOICES.INVOICE_PAY scopes,
                   i.e. SCOPE.INVOICES.MANAGE). If this key was generated
                   before invoices were needed, add the Invoices permission
                   to it in the Wix dashboard (Settings -> API Keys).
     WIX_SITE_ID   Optional override; defaults to the real site ID below.
   ========================================================================== */

const WIX_SITE_ID = process.env.WIX_SITE_ID || "d858f430-e27a-470b-8859-45d173724c18";

function wixHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": process.env.WIX_API_KEY,
    "wix-site-id": WIX_SITE_ID
  };
}

// Statuses where the client can still be sent to pay.
const PAYABLE_STATUSES = ["PUBLISHED", "PARTIALLY_PAID"];

function money(v) {
  // Wix returns DECIMAL_VALUE totals as strings (e.g. "399.00"). Keep them
  // as strings straight through to the client, which formats with
  // Intl.NumberFormat -- avoids any float rounding on money server-side.
  return typeof v === "string" ? v : (v == null ? "0" : String(v));
}

function customerName(customerInfo) {
  const cd = (customerInfo && customerInfo.contactDetails) || {};
  const full = [cd.firstName, cd.lastName].filter(Boolean).join(" ").trim();
  return full || cd.company || "";
}

function summarizeLineItems(lineItems) {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((li) => {
    const custom = li.customItem;
    const cat = li.catalogItem;
    const src = custom || cat || {};
    const totals = src.totals || {};
    return {
      name: src.name || "Item",
      description: src.description || "",
      quantity: money(src.quantity || "1"),
      price: money(src.price),
      lineTotal: money(totals.priceAfterTax || totals.subtotal || src.price)
    };
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const invoiceId = req.query && req.query.invoiceId;
  if (!invoiceId || typeof invoiceId !== "string") {
    res.status(400).json({ error: "Missing invoiceId." });
    return;
  }

  let invoice;
  try {
    const invRes = await fetch("https://www.wixapis.com/invoices/v4/invoices/" + encodeURIComponent(invoiceId), {
      method: "GET",
      headers: wixHeaders()
    });
    if (invRes.status === 404) {
      res.status(404).json({ error: "We couldn't find that invoice. Double-check the link and try again." });
      return;
    }
    if (!invRes.ok) {
      const text = await invRes.text().catch(() => "");
      console.error("[get-invoice] GetInvoice failed", invRes.status, text);
      res.status(502).json({ error: "Couldn't load the invoice right now. Please try again in a moment." });
      return;
    }
    const data = await invRes.json();
    invoice = data.invoice;
  } catch (e) {
    console.error("[get-invoice] GetInvoice error", e);
    res.status(500).json({ error: "Couldn't load the invoice right now. Please try again in a moment." });
    return;
  }

  if (!invoice) {
    res.status(404).json({ error: "We couldn't find that invoice. Double-check the link and try again." });
    return;
  }

  // DRAFT / PUBLISHING invoices haven't actually been sent to the client
  // yet -- nothing valid to show, and we shouldn't leak draft content.
  if (invoice.status === "DRAFT" || invoice.status === "PUBLISHING") {
    res.status(404).json({ error: "This invoice isn't ready to view yet." });
    return;
  }

  let checkoutUrl = null;
  if (PAYABLE_STATUSES.includes(invoice.status)) {
    try {
      const payRes = await fetch(
        "https://www.wixapis.com/invoices/v4/invoices/" + encodeURIComponent(invoiceId) + "/initiate-payment",
        {
          method: "POST",
          headers: wixHeaders(),
          body: JSON.stringify({ invoiceId })
        }
      );
      if (payRes.ok) {
        const payData = await payRes.json();
        checkoutUrl = payData.url || null;
      } else {
        const text = await payRes.text().catch(() => "");
        console.error("[get-invoice] InitiatePayment failed", payRes.status, text);
        // Don't fail the whole page load over this -- still show the
        // invoice summary, just without a working Pay button.
      }
    } catch (e) {
      console.error("[get-invoice] InitiatePayment error", e);
    }
  }

  const totals = invoice.totals || {};

  res.status(200).json({
    invoice: {
      id: invoice.id,
      status: invoice.status,
      displayNumber: (invoice.numbering && invoice.numbering.displayNumber) || null,
      title: invoice.title || "Invoice",
      issueDate: invoice.issueDate || null,
      dueDate: invoice.dueDate || null,
      currency: invoice.currency || "USD",
      customerName: customerName(invoice.customerInfo),
      businessName: (invoice.businessDetails && invoice.businessDetails.companyName) || "AGUYB Studios",
      lineItems: summarizeLineItems(invoice.lineItems),
      totals: {
        subtotal: money(totals.subtotal),
        discount: money(totals.discount),
        tax: money(totals.tax),
        total: money(totals.total),
        paidAmount: money(totals.paidAmount),
        balance: money(totals.balance)
      },
      checkoutUrl
    }
  });
};
