## Synapix AI studio — Production Deployment

### Railway (Backend)
1. Connect GitHub repo at [railway.app](https://railway.app)
2. Set **Root Directory** → `backend`
3. Railway auto-detects `Dockerfile` and builds
4. Add environment variables in Railway → Variables tab
5. Your backend URL: `https://yourapp.railway.app`

### Vercel (Frontend)
1. Import repo at [vercel.com](https://vercel.com)
2. Set **Root Directory** → `frontend`
3. Framework: Next.js (auto-detected)
4. Add env var: `NEXT_PUBLIC_API_URL=https://yourapp.railway.app`
5. Deploy!

### Environment Variables Required

**Backend (Railway):**
```
APP_ENV=production
AUTH_SECRET=
GOOGLE_CLIENT_ID=
CORS_ORIGINS=https://synapix.ai,https://www.synapix.ai
AUTH_COOKIE_SAMESITE=none
AUTH_COOKIE_SECURE=true
RESEND_API_KEY=
SMTP_FROM=Synapix <noreply@synapix.ai>
MAIL_REPLY_TO=Synapix <hello@synapix.ai>
MAIL_LOGO_URL=https://synapix.ai/logo.png
GOOGLE_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
PEXELS_API_KEY=
```

**Frontend (Vercel):**
```
NEXT_PUBLIC_API_URL=https://yourapp.railway.app
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

### Production email (Resend + synapix.ai)

Gmail SMTP is local-only. On Railway the API refuses to boot unless mail is Resend and From is `@synapix.ai`.

1. Create an account at [resend.com](https://resend.com) and add domain `synapix.ai`
2. In DNS (Cloudflare / registrar) paste the **exact** DKIM, SPF and MX records from Resend → Domains → Records
3. Add DMARC yourself as TXT on `_dmarc.synapix.ai`:
   `v=DMARC1; p=none; rua=mailto:hello@synapix.ai;`
4. Wait until Resend shows the domain **Verified**
5. Put `RESEND_API_KEY` and `SMTP_FROM=Synapix <noreply@synapix.ai>` on Railway
6. Confirm `https://synapix.ai/logo.png` is publicly reachable (frontend `public/logo.png`)

### Dodo Payments

1. Dashboard → Developer → API Keys → copy test key
2. Products → copy `pdt_...` id of the Synapix plan
3. Developer → Webhooks → `https://YOUR_BACKEND/api/billing/webhook`
4. Railway / `.env`: `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, `DODO_PRODUCT_ID`

See [deployment_guide.md](./brain/5943869e-d90e-41fe-af32-382a0a1d2432/deployment_guide.md) for full details.
