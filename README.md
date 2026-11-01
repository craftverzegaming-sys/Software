# CRAFTVERZE PAY

A responsive UPI payment portal with a React checkout, server-backed merchant dashboard, sample transactions, and a provider-verification integration point.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. On the first development run, a private `.env` is created with a random admin password and session secret. Read the password from `.env` to sign in at **Merchant login**. `.env` and local payment data are ignored by Git.

Set the merchant name and UPI ID in the dashboard. The optional merchant QR upload accepts PNG, JPEG, and WebP files up to 5 MB. A payment-specific QR is generated from the recipient and exact amount after the customer prepares a payment.

## Payment and verification

Creating a checkout records a **pending** attempt and creates a UPI intent. Opening the UPI app, scanning a QR, or entering a customer reference never marks a payment successful. The dashboard's verified totals only include records in the `verified` state; included sample records are visibly marked as development data.

No live payment provider, webhook verification, bank settlement, wallet, or automatic reconciliation is configured. To connect an eligible merchant provider, implement `verifyPaymentNotification` in `server/payment-provider.mjs` using that provider's signature and event-verification requirements. Only its verified event can update a real pending transaction. Keep provider credentials in server environment variables, never in the React app.

## Deploy to Render

The root `render.yaml` configures the Node web service, generated admin/session secrets, and a 1 GB persistent disk for payment data and QR uploads. In Render, create a new Blueprint from this repository and review the service and disk charges before confirming. After deployment, find the generated `ADMIN_PASSWORD` in the service's environment settings and use the service's `onrender.com` URL to sign in.

To use a Cloudflare-registered domain, add it under the Render service's **Settings → Custom Domains**, then copy the DNS records Render provides into Cloudflare's DNS settings. Keep the Render-provided target and proxy configuration as directed by Render; wait for domain verification and HTTPS before sharing the URL. The Cloudflare domain alone does not host the app backend.

Keep provider credentials in server environment variables, never in the React app. Payment-provider verification is not configured in this prototype, so UPI payments remain unverified and must not be presented as automatically confirmed.