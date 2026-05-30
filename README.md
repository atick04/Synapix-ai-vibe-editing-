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
GOOGLE_API_KEY=
GROQ_API_KEY=
PEXELS_API_KEY=
ELEVENLABS_API_KEY=
```

**Frontend (Vercel):**
```
NEXT_PUBLIC_API_URL=https://yourapp.railway.app
```

See [deployment_guide.md](./brain/5943869e-d90e-41fe-af32-382a0a1d2432/deployment_guide.md) for full details.
