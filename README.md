# AGUYB Studios: Website Frontend

Responsive marketing site for AGUYB Studios, focused entirely on the Jacksonville
video podcast and content studio business: video podcast production, corporate
storytelling, training/explainer video, short-form social content, commercial
production, and studio rental.

Plain HTML / CSS / JS, no build step and no framework, so it can be opened
directly in a browser, hosted on GitHub Pages, or imported into Wix (Studio
editor or as a headless frontend reference) without conversion.

## Structure

```
aguyb-studios-site/
├── index.html                 Home page
├── booking.html                Book Your Session page (reads ?set= and ?bundle= from links)
├── on-site-production.html     On-Site Podcast Production page
├── blog.html                   Blog index, with a Sets + Recommended Podcasts sidebar
├── faq.html                    Client FAQ (booking, sets, equipment, delivery, policies)
├── assets/
│   ├── css/style.css           Design system + layout (brand tokens at the top)
│   ├── js/main.js              Nav, accordion, video lightbox, forms, scroll reveal
│   └── video/                   Drop real video files here (see "Video placeholders" below)
└── README.md
```

Top navigation: What We Build, Sets, On-Site, Bundles, Blog, FAQ, Contact.
Process and Reviews were removed from the nav bar but the sections themselves
are still on the home page (`#process`, `#reviews`) and still linked from the
footer. Because the nav grew to 7 items, it now switches to the hamburger
menu earlier (940px instead of 760px) and tightens its spacing between
940px and 1180px, both in the "Responsive" section of `style.css`.

## What's on the page

- Hero with a "Book Your Session" and "Studio Tour" CTA
- A sliding, auto-scrolling carousel of past podcast episodes (second section, click any cover to watch)
- "What We Build": an expandable accordion list instead of static cards, click a service to read the description
- "Sets": the four studio sets, each with its own preview video and a "Book This Set" link
- "Bundles": three priced packages (Starter Session, Content Engine, Corporate Partner), each links to the booking page pre-filtered
- "Reviews": a placeholder testimonial grid, ready to swap for real client feedback
- A contact form (name, company, phone, email, project type, project details, and a subscribe checkbox) plus a dedicated booking page with its own request form
- `on-site-production.html`: a full page for the "we come to you" service, pricing, how it works, and a coverage-area panel
- `blog.html`: a post grid with a right-hand sidebar showcasing the Sets and a Recommended Podcasts list (click to watch, uses the same video lightbox as the home page)
- `faq.html`: 17 client FAQs as a click-to-expand accordion (same component as "What We Build"), covering booking, capacity, equipment, delivery, cancellation, sets and add-ons
- On-Site Production now has two fixed-price package cards (2 Hour, $2,000, and 3 Hour, $2,500) below the hourly rate, both route to the booking page

## Brand system used

- Colors: deep dark purple `#0C0321`, electric cyan `#17A7D1`, blue `#254FBA`, white `#FFFFFF`
- Typography: Poppins (headings) + Inter (body), loaded from Google Fonts
- Style: solid colors only, no gradients and no blurred ambient "glow" blobs anywhere (both were removed since even a blurred solid color reads as a soft gradient). Glassmorphism panels and cinematic dark overlays are alternated with warm-ivory "light" sections (`.section-light` in `style.css`) so the page doesn't read as all-dark.
- All CSS custom properties live in `assets/css/style.css` under `:root`, so colors/spacing can be retuned in one place. Adding `class="section-light"` to any `<section>` automatically flips its text and glass-panel colors for the light background. `--gradient-brand` and `--gradient-brand-soft` kept their variable names to minimize the diff, but both now resolve to flat colors, not `linear-gradient()`.

## Before this goes live

1. **Swap placeholder photography.** All studio/set photos are Unsplash
   placeholders so the layout could ship immediately. Replace every `<img>`
   `src` and the hero `background-image` in `.hero-bg` (in `style.css`) with
   real AGUYB Studios photo and video assets.

2. **Add real video files.** Every "watch" interaction (the reel carousel,
   each Set's play button, the Studio Tour buttons) opens a lightbox that
   expects a file at these paths. Right now those files don't exist yet, so
   the poster image still displays but playback won't start until you add
   the files with these exact names:

   | Trigger | Expected file |
   |---|---|
   | Reel carousel, 6 episodes | `assets/video/reel-01.mp4` through `reel-06.mp4` |
   | The Podcast Set | `assets/video/set-podcast.mp4` |
   | The Interview Set | `assets/video/set-interview.mp4` |
   | The Corporate Set | `assets/video/set-corporate.mp4` |
   | The Product Set | `assets/video/set-product.mp4` |
   | Studio Tour (hero + footer) | `assets/video/studio-tour.mp4` |

   To point at YouTube/Vimeo instead of local files, swap the `<video>` tag
   in the lightbox (`index.html` and `booking.html`) for an `<iframe>` and
   update `openLightbox()` in `main.js` accordingly.

3. **Confirm bundle pricing.** The three bundle prices ($597 one-time, $1,950/mo,
   and $3,800/mo starting) are a starting-point recommendation based on typical
   market rates for this kind of studio, not your real numbers. Review and
   adjust them in the "Bundles" section of `index.html` and in the "Preferred
   Bundle" dropdown in `booking.html` before publishing.

4. **Replace the review placeholders.** The three cards in "Reviews" are
   written as realistic examples, not real client quotes. Swap them for real
   testimonials (or pull them dynamically from Google/Facebook reviews) once
   you have them.

5. **Forms are wired to your real Wix site, already.** Both `index.html`
   (contact form) and `booking.html` (session request form) submit straight
   into the "Aguyb Studios Leads" form that's already live in your Wix
   dashboard, no Formspree, no separate backend. See "Wix Headless" below
   for exactly how, and the one thing to clean up before launch.

6. **Replace contact placeholders.** `hello@aguybstudios.com` and
   `(904) 555-1234` are placeholders, swap for the real studio contact details.

7. **Blog posts are placeholders without article pages yet.** `blog.html` is
   the index/listing layout with six placeholder posts; their "Read More"
   links are inert (`href="#"`) since no individual article template exists
   yet. Building an `article.html` template (or a per-post file) is the next
   step once you have real posts to publish.

8. **On-Site page content is adapted from reference copy.** The "Shows We
   Recorded On Site" badges and "Featured Projects" thumbnails on
   `on-site-production.html` are placeholders. The booking buttons on that
   page, including the two new offsite packages, point to AGUYB's own
   `booking.html`. The external booking links from the reference copy you
   provided (`cal.com/theorist`, `theorist-studio.podyx.com`) belonged to a
   different studio's account, so they were swapped out rather than linked
   to directly, and "within 1 hour of Midtown Manhattan" was changed to
   AGUYB's Jacksonville coverage area.

9. **Confirm the FAQ answers against your real policies and gear.**
   `faq.html` is written to be internally consistent with the rest of the
   site (72-hour delivery, $100 per additional guest, the 4 sets, the
   placeholder phone/email), but several specifics were generalized rather
   than invented: parking/building access, exact camera and mic brands,
   and which add-ons (teleprompter, live editing, livestreaming, Riverside
   4K support) you actually offer. Review and tighten those answers before
   publishing. The FAQ content you sent referenced a different Miami studio
   (address, phone, network credits, 14+ named sets), none of that was
   carried over.

## Local preview

No build tools required. Open `index.html` directly in a browser, or serve it locally:

```bash
cd aguyb-studios-site
python3 -m http.server 8080
# visit http://localhost:8080
```

## Publish to GitHub

```bash
cd aguyb-studios-site
git init
git add .
git commit -m "Initial AGUYB Studios site"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

To host it live for free straight from the repo, enable **GitHub Pages** in
the repo settings (Settings, Pages, Deploy from branch, `main` / root).

## Wix Headless: live connection test (already set up)

A headless OAuth client is already registered on your real, published Wix
site (`AGUYB STUDIOS`, live at `https://www.aguybstudios.com/`). Registering
this client is additive only, it does not touch, republish, or affect
anything visitors currently see on the live Wix site.

- **Client ID:** `b21d16f1-0865-4b6c-82c9-8fc43d39c696`
- **App name in your Wix dashboard:** "AGUYB Studios Static Frontend (Test)"
  &mdash; find it under **Settings &rarr; Development & Integrations &rarr;
  Headless Settings** if you want to view, rename, or delete it.
- This Client ID is safe to keep in client-side code. On its own it can only
  request an anonymous **visitor** token, the same read access any visitor to
  your site already has. It cannot log in as the site owner, publish
  changes, or delete anything.
- A **client secret** was also generated when the app was created. That
  secret is for server-side/admin use only (the kind of calls where you'd
  otherwise use a Wix API key). It is not used anywhere in this frontend and
  should never be pasted into any file that ships to the browser.

### Run the test

1. Serve the site locally (see "Local preview" above) or open it on GitHub Pages.
2. Visit `/wix-headless-test.html`. It isn't linked from the nav or footer on
   purpose, it's a diagnostic page, not part of the public site.
3. The page will, entirely in the browser: request a visitor access token
   from `https://www.wixapis.com/oauth2/token`, then call Wix Bookings'
   Query Services endpoint to list your site's visible services. A green
   "Connected" status and a list of services (or an honest "no services yet"
   message) confirms the static frontend can talk to your real Wix data with
   zero risk to the published site, since every call here is read-only.

### The contact and booking forms are already wired to your real Wix data

Both `index.html`'s contact form and `booking.html`'s session request form
now submit directly into **"Aguyb Studios Leads"**, a form that was already
live in your Wix dashboard (Settings &rarr; Forms & Submissions) before this
integration, its fields (name, email, phone, company, project overview, and
a services dropdown) already matched what this site needed, so nothing new
was created. The logic lives in `assets/js/main.js` (`submitToWixLeadsForm`):
on submit, the browser requests a fresh anonymous visitor token, then posts
the form fields straight to Wix Forms. No server, no third-party form
service, no API key in the code.

- **One test lead was created to confirm this works**, with your approval:
  first name "TEST", last name "Submission - please delete", email
  `test+headless-integration@aguybstudios.com`. Open your Wix dashboard
  (CRM &rarr; Contacts, or the Forms app) and delete it whenever you like,
  it only exists to prove the connection is real.
- Since our contact form only asks for one "Full Name" field but the Wix
  form has separate First/Last Name fields, the JS splits on the first
  space (`"Jane Doe"` &rarr; Jane / Doe). A single-word name gets a `-`
  placeholder for last name so the required field is never left empty.
- The project type / preferred set / bundle / date / time details are folded
  into the "Project Overview" text field as labeled lines, since the Wix
  form's own dropdown has a fixed set of values that don't map 1:1 to this
  site's options.
- Submissions land in your Wix dashboard exactly like any other Wix Forms
  lead, with whatever notification emails or CRM automations you already
  have set up for that form.

### Go live gradually

Test everything on a subdomain or a private GitHub Pages URL first. Only
point your real domain (`www.aguybstudios.com`) at this static build once
you've sent a real test submission through the published version and
confirmed it lands correctly, your current Wix Studio site keeps serving
that domain until you intentionally switch DNS/publishing over. If you'd
rather build this out in a proper framework (Astro, Next.js, etc.) instead
of hand-written `fetch()` calls, this same Client ID carries over, no need
to re-register.

## CMS: edit the whole site from your Wix dashboard

Almost everything on the site, nav links, every headline and paragraph,
services, sets, bundles, reviews, the "Why AGUYB" strip, the 4-step
process on each page, FAQ questions and answers, blog post cards, the
on-site pricing packages, the coverage-area tags, and your contact
email/phone/city/social links, now lives in **Wix Data** (Settings &rarr;
Content Manager / CMS in your Wix dashboard) instead of being hardcoded in
the HTML. Edit any of it there and the live site picks it up automatically
on next page load, no code change, no redeploy.

### How it works

`assets/js/cms.js` runs after the page's static HTML has already loaded
(so the page is never blank or broken, even offline or if this fails). It
requests the same anonymous visitor token used by the forms, queries the
relevant Wix Data collections for that page, and overwrites the matching
text, links and repeated cards in place. If a query fails for any reason,
that section just keeps showing its original static content, nothing
breaks.

### The 13 collections

| Collection | Powers |
|---|---|
| `nav_links` | Header nav, mobile menu, and the three footer link columns |
| `content_blocks` | Every eyebrow / headline / paragraph / button pair, keyed by a `blockKey` per section (e.g. `home_hero`, `onsite_coverage`, `faq_final_cta`). The `home_hero` row also has **Background Image** and **Background Video** media-picker fields, see below. |
| `services` | The "What We Build" accordion on the home page |
| `sets` | The 4 studio sets (home page grid + blog sidebar) |
| `bundles` | The 3 pricing bundles |
| `reviews` | The 3 testimonial cards |
| `why_aguyb` | The 4 "Why AGUYB" items |
| `process_steps` | The 4-step process on the home page, the 3-step "How Booking Works," and the 4-step "How On-Site Production Works" (filtered by a `page` field) |
| `onsite_packages` | The hourly rate plus the 2-hour and 3-hour offsite packages |
| `coverage_areas` | The 6 coverage-area tags |
| `faq_items` | All 17 FAQ questions and answers |
| `blog_posts` | The 6 blog post cards, and the full article page each one links to (see below) |
| `site_settings` | Email, phone, city, and social links (Instagram/LinkedIn/YouTube), used sitewide |

Every collection is set to public read (`ANYONE`) so visitors can load it,
and admin-only write (`ADMIN`) so only you, from the Wix dashboard, can
change it.

### Known gaps (still hardcoded, by design for now)

- The **podcast reel carousel** (6 episodes on the home page) and the
  **"Shows We Recorded On Site" badges** on `on-site-production.html`
  aren't in a collection yet, there wasn't an existing episodes collection
  to hook into. Ask if you'd like a `podcast_episodes` collection added,
  it's a small follow-up.
- Each service in "What We Build" now uses one shared icon instead of a
  unique icon per service (the collection stores title + description
  only).
- The 3 FAQ answers that used to contain inline links (to the On-Site page,
  the Sets section, and the booking form) now show as plain text, the CMS
  field is plain text rather than rich text.
- `wix-headless-test.html` (the internal connectivity diagnostic page) is
  not part of this CMS integration, it's a developer tool, not a public
  page.

### Try it

Open **Content Manager** in your Wix dashboard, open the `why_aguyb`
collection, change the `title` of the first row, save, then reload the
live site, the "Why AGUYB" section updates with no code change needed.

### Hero background: swap the photo, or add a video

The very first section of the home page (the hero, "Jacksonville Top
Podcast & Media Production Studio") now has its background image and an
optional background video wired to the CMS too.

1. Open **Content Manager** &rarr; `content_blocks` &rarr; the row where
   `Block Key` = `home_hero`.
2. **Background Image**: click the field and use **Choose Media** to pick
   or upload a photo straight from your Wix Media Manager (this is a real
   media field, not a text box). This is what visitors see, and what
   shows before a video loads.
3. **Background Video**: optional, same **Choose Media** picker, upload
   or pick an existing video from your Media Manager. If a video is set,
   it plays automatically, muted, looping, on top of the background image
   as soon as the page loads, no code change needed. Leave it empty to
   keep just the still image.

Both fields also still accept a plain pasted web URL if you'd rather link
to an image or video hosted elsewhere, `assets/js/cms.js` resolves
whichever, a Wix Media Manager pick or a plain URL, automatically.

The video always plays muted (autoplay policies in every browser require
this) and silently falls back to the still image if the video fails to
load or the browser blocks autoplay.

## Blog: full article pages, not just cards

Every blog post card on `blog.html` now links to a real, complete article
page under `/articles/`, each one built with the same visual style as the
rest of the site, not a stub. Each article page has:

- The full article text (several real, on-topic paragraphs, not a
  placeholder excerpt).
- A **Recommended Video** card inside the article that opens in the site's
  existing video lightbox when clicked.
- A sticky sidebar with a **Book Your Session** button, links to 3 other
  articles, and the same "Explore Our Sets" block as the blog list page.

All 6 are editable from the same `blog_posts` collection you already use
for the cards, it now also has:

| Field | Powers |
|---|---|
| `slug` | The article's URL, e.g. `slug: my-post` &rarr; `articles/my-post.html` |
| `body` | The full article text. Separate paragraphs with a blank line between them in the Content Manager, each becomes its own paragraph on the page. |
| `author` | Byline shown under the title |
| `videoCaption` | Title shown on the Recommended Video card |
| `videoUrl` | The Recommended Video itself, a real Media Manager picker field just like the hero background video, upload or pick a clip from Wix, or leave empty to keep the placeholder |

Editing an existing post's `body`, `title`, `excerpt`, `category`, cover
`image`, or video fields updates its article page automatically on next
load, the same progressive-enhancement pattern as the rest of the site,
the static article text is a complete real fallback, the CMS only
overwrites it if you've since changed something in the dashboard.

**Adding a brand-new 7th post** isn't fully automatic yet, adding a row to
`blog_posts` will make it appear as a card on `blog.html`, but its
`articles/<slug>.html` page needs to be built once (it's a small, fast
follow-up, ask any time you add a new post and want its page live).

## Real booking: pick an hour, see real availability, pay on Wix

`pricing.html`'s 5 Studio Rental tiers (2/3/4/6/8 hours), and the home
page's **Bundles** section (now the 2/4/8‑hour Studio Rental tiers, replacing
the old Content Engine / Corporate Partner lead-gen cards) are wired to your
**real** Wix Bookings services, prices and calendar, not a lead form. The
flow, all handled by `assets/js/booking-flow.js`:

1. Visitor clicks **Check Availability & Book** on a tier.
2. A panel opens with a date picker. Selecting a date calls Wix Bookings'
   real-time Availability API for that exact service and shows the real
   open time slots for that day, straight from your calendar.
3. Clicking a time slot calls Wix's **Redirects API**, which generates a
   one-time, secure checkout URL for that exact slot, and sends the
   visitor there.
4. On Wix's own hosted checkout page (not this site), the visitor can add
   any configured add-ons, review their cart, fill in their details, and
   pay, all handled natively by Wix, PCI-compliant, nothing custom-built
   for payment. Wix then redirects them back to `pricing.html`.

This site never sees or touches card details at any point, the last step
before payment is always a redirect to a real `wixapis.com`/Wix-hosted
URL.

- The GitHub Pages domain (`aguyb.github.io`) is registered as an allowed
  redirect domain on the same headless OAuth client used everywhere else
  in this project, that's what lets Wix redirect visitors back here safely.
- If a tier has [add-ons](https://support.wix.com/en/article/wix-bookings-managing-add-ons)
  configured in your Wix Bookings dashboard, they'll appear automatically
  on the Wix checkout page, no code change needed here.
- Real-time availability was tested directly against your live calendar
  (confirmed real open slots and your real studio address, 7825 Baymeadows
  Way). The final checkout redirect uses the same visitor-token pattern as
  the rest of the site and should be smoke-tested once live by actually
  clicking through to Wix's checkout page.
- The other CTAs on the site (Bundles, On-Site packages, the general
  Booking form) are unaffected, they're not schedulable Wix Bookings
  services, so they still use the lead-gen form described above.
