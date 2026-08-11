/* ==========================================================================
   AGUYB STUDIOS - Public Square config (Vercel Serverless Function)
   ==========================================================================
   Hands the booking modal the two values it needs to initialize the Square
   Web Payments SDK: the Application ID and Location ID. Both are safe to
   expose to the browser (Square's own docs embed them directly in
   client-side <script> tags) -- only the access token is a secret, and
   that never leaves create-payment.js on the server.

   Required Vercel environment variables:
     SQUARE_APP_ID        Square Application ID (Sandbox or Production)
     SQUARE_LOCATION_ID   Square location ID
     SQUARE_ENVIRONMENT   "production" or "sandbox" (defaults to production)
   ========================================================================== */

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    appId: process.env.SQUARE_APP_ID || null,
    locationId: process.env.SQUARE_LOCATION_ID || null,
    environment: process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production"
  });
};
