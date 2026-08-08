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
