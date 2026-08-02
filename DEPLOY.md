# Deploy `apps/server`

## 1. Vercel

1. **Add New → Project** → import the GitHub repo `lzvxck/hesper-code`.
2. **Root Directory**: `apps/server` (required — this is a monorepo).
3. Framework: leave on auto-detect (Next.js).
4. Before deploying, set these **Environment Variables** (Settings → Environment Variables):
   | Key | Where to get it |
   |---|---|
   | `SUPABASE_URL` | Supabase dashboard → project `hesper-code` → Settings → API → "Project URL" |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same page → **service_role** key (secret — not the anon/publishable key). Copy directly Supabase → Vercel, never paste it in chat. |
   | `POLAR_WEBHOOK_SECRET` | Not available yet — comes from step 2 below. Add/update it after. |
5. Deploy. (Optional: deploy the `billing-server-webhook` branch first as a Preview to test before merging to `main`.)
6. Note the resulting URL (e.g. `https://<project>.vercel.app`).

## 2. Polar webhook

1. Polar dashboard → org → **Settings → Webhooks → Add Endpoint**.
2. URL: `https://<your-vercel-url>/api/webhooks/polar`
3. Format: **Raw**.
4. Subscribe to events: `subscription.created`, `subscription.active`, `subscription.canceled`, `subscription.uncanceled`, `subscription.revoked`, `subscription.updated`.
5. Copy the generated **signing secret**.

## 3. Finish wiring

1. Back in Vercel: set `POLAR_WEBHOOK_SECRET` to the value from step 2.
2. Redeploy (or it applies to the next deploy).

## 4. Test end-to-end

1. Run `hesper login` locally to get a real WorkOS `userId`.
2. In Polar's `sandbox.polar.sh` environment, create a checkout with `external_customer_id` set to that `userId`, complete it.
3. Confirm the webhook fires and `account_status` in Supabase gets a row keyed on that `userId` with the expected `subscription_status`.
