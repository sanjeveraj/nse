# NSE Stock Screener — Vercel Deployment Guide

## 📁 File Structure
```
nse-project/
├── api/
│   └── yahoo.js        ← Serverless proxy (fixes CORS!)
├── public/
│   ├── index.html      ← Main HTML
│   ├── style.css       ← All CSS styles
│   └── app.js          ← All JavaScript logic
├── vercel.json         ← Vercel routing config
├── package.json        ← Node.js config
└── README.md           ← This file
```

## 🚀 Deploy to Vercel (Free) — Step by Step

### Method 1: Drag & Drop (Easiest)
1. Go to https://vercel.com → Sign up free with GitHub/Google
2. Click "Add New Project"
3. Drag the entire `nse-project` folder to Vercel
4. Click Deploy → Done! ✅

### Method 2: GitHub (Recommended)
1. Create a GitHub account at https://github.com
2. Create new repository named `nse-screener`
3. Upload all files from this folder
4. Go to https://vercel.com → "Add New Project"
5. Connect GitHub → Select `nse-screener` repo
6. Click Deploy → Done! ✅

### Method 3: Vercel CLI
```bash
npm install -g vercel
cd nse-project
vercel --prod
```

## ✅ Why This Fixes the CORS Issue
- **Before**: Browser → Yahoo Finance API ❌ (CORS blocked)
- **After**: Browser → /api/yahoo (your server) → Yahoo Finance ✅

The `api/yahoo.js` file runs as a serverless function ON THE SERVER,
so it can call Yahoo Finance without any CORS restrictions.

## 🌐 How It Works
1. Browser loads `index.html` + `style.css` + `app.js`
2. `app.js` calls `/api/yahoo?type=equitylist` to get NSE stock list
3. `app.js` calls `/api/yahoo?type=quote&symbol=RELIANCE` for fundamentals
4. `api/yahoo?type=chart&symbol=RELIANCE&range=1mo` for candlestick data
5. All data flows through YOUR Vercel server — no CORS problems!
