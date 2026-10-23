# KAT CAFE RESTAURANT — final integration kit

This is a GitHub Pages-compatible front end plus Supabase Edge Functions for Razorpay checkout.
**It is a setup-ready code package, not a live deployed app.** Razorpay account, Supabase project,
verified restaurant details, menu data, and testing are still required.

## What is included
- Responsive menu/cart/checkout page (`index.html`)
- Supabase schema (`supabase-schema.sql`)
- Server-side order creation with server-calculated prices
- Checkout signature validation plus Razorpay API payment-status/amount check
- Webhook handler for payment captured/failed events
- Deployment and test steps

## A. Create Supabase project
1. Create a project at https://supabase.com/dashboard
2. Open SQL Editor and run `supabase-schema.sql`.
3. In Project Settings / API, copy the Project URL and publishable/anon key.
4. In `index.html`, replace:
   - `YOUR_SUPABASE_PROJECT_URL`
   - `YOUR_SUPABASE_PUBLISHABLE_KEY`
   - `REPLACE_WITH_VERIFIED_WHATSAPP_NUMBER` (digits only, international format, e.g. country code + number).
5. Add only restaurant-owner-approved items/prices to `public.menu_items`. Set `is_available=true` only for items actually sold.
6. Add verified food images and approved branding if available.

## B. Create Razorpay account
1. Sign up at https://dashboard.razorpay.com/signup
2. Use **Test Mode** first.
3. In Test Mode, open Account & Settings / API Keys and generate a Test Key ID and Test Key Secret.
4. Do not paste the Key Secret into HTML, GitHub, screenshots, or chats. Store it only as a Supabase secret.
5. Live payments require Razorpay account verification/activation and Live API keys.

## C. Deploy Edge Functions
Install Supabase CLI, open a terminal in this folder, then run:

```bash
supabase login
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
supabase secrets set RAZORPAY_KEY_ID=YOUR_TEST_KEY_ID RAZORPAY_KEY_SECRET=YOUR_TEST_KEY_SECRET SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
supabase functions deploy create-razorpay-order --no-verify-jwt
supabase functions deploy verify-razorpay-payment --no-verify-jwt
```

`SUPABASE_URL` is supplied automatically to Edge Functions. Get the service-role key from Supabase Project Settings / API and keep it server-side only. Never put it in `index.html` or GitHub.

## D. Configure Razorpay webhook (recommended before public launch)
1. Deploy the webhook function:
   `supabase secrets set RAZORPAY_WEBHOOK_SECRET=YOUR_LONG_RANDOM_WEBHOOK_SECRET`
   `supabase functions deploy razorpay-webhook --no-verify-jwt`
2. In Razorpay Dashboard, add a webhook URL:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/razorpay-webhook`
3. Use the exact same webhook secret in Razorpay and Supabase.
4. Subscribe at least to `payment.captured` and `payment.failed`.
5. Do not share the webhook secret. Test webhook delivery from the Razorpay dashboard.

## E. Publish to GitHub Pages
1. Back up the current repository before replacing or merging files.
2. Copy `index.html` into the repository's published root (or merge its UI into your existing page).
3. Keep `supabase/` source files in the repository for version control; they are deployed separately with the CLI.
4. Commit and push; wait for GitHub Pages deployment.
5. Test the public URL on mobile and desktop.

## F. Test checklist before launch
- Menu loads from Supabase and unavailable items do not show.
- Test order total is recalculated on the server using database prices.
- Test payment succeeds; only captured/verified payment is marked `paid`.
- Failed/cancelled payment is not shown as paid.
- Webhook test events arrive and update the matching order.
- WhatsApp opens the correct verified restaurant number.
- Test duplicate taps, unavailable items, wrong amount, and closing the checkout window.
- Check order status in Supabase Dashboard.

## Important security / launch notes
- These Edge Functions are public guest-checkout endpoints (`verify_jwt=false`). CORS is not authentication.
  Before promoting publicly, add rate limiting/bot protection (for example, a CAPTCHA verified server-side),
  monitoring, and abuse controls. Do not treat this starter as a fully audited payment system.
- Keep Supabase service-role key, Razorpay Key Secret, and webhook secret only in Supabase secrets.
- Do not accept client-supplied prices as authoritative; server reads current prices from `menu_items`.
- Never mark an order paid just because the browser callback says payment succeeded. The server verifies
  the signature and fetches the payment from Razorpay; the webhook also reconciles captured/failed payments.
- The menu is intentionally empty. Do not invent prices, contact numbers, operating hours, or delivery area.
- No real payment can run until the owner creates/activates Razorpay and supplies test/live keys.
