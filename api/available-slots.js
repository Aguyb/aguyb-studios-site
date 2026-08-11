/* ==========================================================================
   AGUYB STUDIOS - Cross-tier-aware availability (Vercel Serverless Function)
   ==========================================================================
   Why this exists: the site sells the SAME physical studio (and the same
   single staff member/operator) as 7 separate Wix Bookings "services" --
   1/2/3/4/6/8-hour studio rental tiers plus off-site Event Filming -- each
   with its OWN independent Wix schedule. Wix's own Time Slots V2 API only
   checks a slot against its own service's schedule, so booking a 2-Hour
   session at 10am does NOT stop the 4-Hour tier from showing 10am as
   "bookable" too, even though it's the same room and the same person.
   Verified live: created + confirmed a paid 2-Hour booking for
   10:00-12:00, then queried the 4-Hour service's time-slots for the same
   day -- its 10:00-14:00 slot still came back bookable:true.

   This endpoint fixes that by taking Wix's own candidate slots for the
   requested service and filtering out any that overlap an existing
   CONFIRMED or PENDING booking on ANY of the sibling schedules (all tied
   to the same staff member, so none of them can run at the same time).

   Required Vercel environment variables (shared with create-payment.js):
     WIX_API_KEY   Wix API key with "Manage Bookings" read permission
     WIX_SITE_ID   Optional override; defaults to the real site ID below
   ========================================================================== */

const WIX_SITE_ID = process.env.WIX_SITE_ID || "d858f430-e27a-470b-8859-45d173724c18";
const TIMEZONE = "America/New_York";

// Every Wix Bookings service that draws on the same physical studio and/or
// the same staff member (Clerger Guybertho, id 3b5608da-4a83-4e8f-8b4b-
// 65f127b1bcad) -- confirmed by inspecting each service's staffMemberIds.
// Event Filming is off-site (location.type CUSTOMER) but still uses the
// same staff member, so it competes for their time even though not the room.
const SIBLING_SCHEDULE_IDS = [
  "0def0b72-d503-49ff-9e2f-84a4cf6e2acd", // 1 Hour (hidden)
  "a6818320-518e-499d-92a4-6cfc925545ef", // 2 Hours
  "676df7ad-9915-4b6a-ae07-c4645390081c", // 3 Hours
  "66aeed0c-c0b0-47bd-a1b2-1f37c764d7a1", // 4 Hours
  "ba80b99b-c697-46a9-8880-db1476d72820", // 6 Hours
  "b88fca8d-72a8-4844-bfe9-1fc5e8001f87", // Full Day (8 Hours)
  "1c35a29f-2639-456c-a30a-8c8e62ac425c"  // Event Filming
];

function wixHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": process.env.WIX_API_KEY,
    "wix-site-id": WIX_SITE_ID
  };
}

// Fetch every CONFIRMED/PENDING booking on any sibling schedule whose
// window could possibly overlap the requested local date. Widened by a day
// on each side so an 8-hour session that crosses local midnight (in UTC)
// is never missed by the filter.
async function fetchBusyWindows(dateStr) {
  const dayStartMillis = localToUtcMillis(dateStr + "T00:00:00", TIMEZONE);
  const rangeStart = new Date(dayStartMillis - 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(dayStartMillis + 2 * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch("https://www.wixapis.com/_api/bookings-reader/v2/extended-bookings/query", {
    method: "POST",
    headers: wixHeaders(),
    body: JSON.stringify({
      query: {
        // Wix rejects a single field object combining two operators (e.g.
        // {$gte, $lte} together) with INVALID_FILTER -- each condition has
        // to be its own object, joined with $and. Verified directly against
        // the live API before shipping this.
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
    throw new Error("Could not read existing bookings (" + res.status + ")");
  }
  const data = await res.json();
  const bookings = data.extendedBookings || [];
  return bookings
    .map((b) => b.booking || b)
    .filter((b) => b.startDate && b.endDate)
    .map((b) => ({ start: new Date(b.startDate).getTime(), end: new Date(b.endDate).getTime() }));
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// Wix's time-slots API returns localStartDate/localEndDate as naive wall-clock
// strings ("2026-08-13T10:00:00") with no UTC offset -- America/New_York is
// either -04:00 (EDT) or -05:00 (EST) depending on the date, so a hardcoded
// offset would be wrong for roughly half the year. This converts a naive
// local datetime string to a real UTC epoch millis value, DST-correct, using
// only built-in Intl (no dependency needed on Vercel's Node runtime).
function localToUtcMillis(localDateTimeStr, timeZone) {
  const guess = new Date(localDateTimeStr + "Z");
  const asTz = new Date(guess.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = asUtc.getTime() - asTz.getTime();
  return guess.getTime() + offset;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { serviceId, date } = req.query || {};
  if (!serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "serviceId and date (YYYY-MM-DD) are required." });
    return;
  }

  if (!process.env.WIX_API_KEY) {
    res.status(500).json({ error: "Availability isn't fully configured yet." });
    return;
  }

  try {
    const from = date + "T00:00:00";
    const to = date + "T23:59:59";

    const [timeSlotsRes, busyWindows] = await Promise.all([
      fetch("https://www.wixapis.com/_api/service-availability/v2/time-slots", {
        method: "POST",
        headers: wixHeaders(),
        body: JSON.stringify({
          serviceId,
          fromLocalDate: from,
          toLocalDate: to,
          timeZone: TIMEZONE,
          bookable: true,
          cursorPaging: { limit: 60 }
        })
      }),
      fetchBusyWindows(date)
    ]);

    if (!timeSlotsRes.ok) {
      throw new Error("Could not load availability (" + timeSlotsRes.status + ")");
    }
    const timeSlotsData = await timeSlotsRes.json();
    const candidates = timeSlotsData.timeSlots || [];

    // Drop any Wix-reported "bookable" slot that actually overlaps a real
    // confirmed/pending booking on this or any sibling schedule -- this is
    // the cross-tier conflict check Wix's own engine doesn't do.
    const filtered = candidates.filter((slot) => {
      const slotStart = localToUtcMillis(slot.localStartDate, TIMEZONE);
      const slotEnd = localToUtcMillis(slot.localEndDate, TIMEZONE);
      return !busyWindows.some((w) => overlaps(slotStart, slotEnd, w.start, w.end));
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ timeSlots: filtered });
  } catch (err) {
    console.error("[available-slots]", err);
    res.status(502).json({ error: "Couldn't load availability right now. Please try again." });
  }
};
