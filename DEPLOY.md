# 🚀 ONE-CLICK DEPLOY

## 1. Vercel (Landing Page)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/armctay85/clipflow&root-directory=landing)

**Steps:**
1. Click button above
2. Import from `armctay85/clipflow`
3. Set root directory to `landing`
4. Deploy

---

## 2. Railway (API)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template?template=https://github.com/armctay85/clipflow)

**Or manual:**
1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Select `armctay85/clipflow`
4. Add environment variables (see below)

---

## 3. Environment Variables

Add these to Railway/DigitalOcean:

```env
ANTHROPIC_API_KEY=your_key_here
PORT=3000
```

(Get key from your credentials file)

---

## 4. Custom Domain (Optional)

Buy `getclipflow.com` on Cloudflare:
1. [dash.cloudflare.com](https://dash.cloudflare.com) → Registrar
2. Search "getclipflow.com" (~$9/year)
3. Point to Vercel: `cname.vercel-dns.com`
4. Point API to Railway subdomain

---

## Post-Deploy Checklist

- [ ] Landing page loads
- [ ] API health check: `curl https://YOUR_API_URL/health`
- [ ] Test transform: Post to `/api/transform` with YouTube URL
- [ ] Set up Stripe for payments
- [ ] Connect custom domain

**ETA to live:** 5 minutes after you click deploy
