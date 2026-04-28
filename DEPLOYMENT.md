# Deployment Guide

This guide explains how to deploy the Dairy Farm application to Vercel and Render.

## Prerequisites

- GitHub account with repository access
- Vercel account (vercel.com) or Render account (render.com)
- Firebase project and credentials

## Environment Variables

Before deploying, ensure you have these Firebase environment variables ready:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

Get these values from your Firebase project settings at https://console.firebase.google.com

---

## Deploy to Vercel

Vercel is optimized for React and Vite applications with automatic deployments on push.

### Step 1: Connect Repository to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Select "Import Git Repository"
4. Search for and select your GitHub repository (`Dairy-Farm`)
5. Click "Import"

### Step 2: Configure Environment Variables

1. In Vercel project settings, go to **Settings → Environment Variables**
2. Add all Firebase environment variables:
   - Name: `VITE_FIREBASE_API_KEY`
   - Value: Your Firebase API key
   - Repeat for all other Firebase variables

3. Select which environments (Development, Preview, Production):
   - Choose "All" to apply to all deployments

4. Click "Save"

### Step 3: Configure Build Settings

The `vercel.json` file is already configured, but verify:

1. Go to **Settings → Build & Development Settings**
2. Build Command: Should show `cd 'Dairy Farm' && npm install && npm run build`
3. Output Directory: Should show `Dairy Farm/dist`
4. Click "Save"

### Step 4: Deploy

1. Click "Deploy"
2. Vercel will automatically build and deploy your application
3. Your site will be available at `your-project.vercel.app`

### Optional: Set Custom Domain

1. Go to **Settings → Domains**
2. Add your custom domain
3. Follow DNS configuration instructions

### Automatic Deployments

- Every push to `main` branch → Production deployment
- Every pull request → Preview deployment
- Automatic rollbacks available in deployment history

---

## Deploy to Render

Render supports static site hosting with simple configuration.

### Step 1: Connect Repository to Render

1. Go to [render.com](https://render.com)
2. Sign up or log in
3. Click "New +" → "Static Site"
4. Select "Connect a repository"
5. Authorize GitHub and select `Dairy-Farm` repository
6. Click "Connect"

### Step 2: Configure Build Settings

The `render.yaml` file is already configured with:

- Build Command: `cd 'Dairy Farm' && npm install && npm run build`
- Publish Directory: `Dairy Farm/dist`
- Auto-deploy on push: Enabled

### Step 3: Add Environment Variables

1. In Render dashboard, go to your site's **Environment**
2. Click "Add Environment Variable"
3. Add each Firebase variable:
   - Key: `VITE_FIREBASE_API_KEY`
   - Value: Your Firebase API key
   - Repeat for all other variables

4. Click "Save Changes"

### Step 4: Deploy

1. Render will automatically build and deploy
2. Your site will be available at `your-site.onrender.com`
3. Monitor the deployment in the **Logs** tab

### Custom Domain Setup

1. Go to **Settings → Custom Domain**
2. Add your domain
3. Follow DNS configuration
4. HTTPS is automatic

---

## Local Testing Before Deployment

Test the production build locally:

```bash
cd "Dairy Farm"
npm run build
npm run preview
```

Open http://localhost:4173 to test the production build.

---

## Environment Variable Setup Examples

### For Vercel (UI Method)

In Vercel Dashboard → Project Settings → Environment Variables:

| Name | Value | Environments |
|------|-------|--------------|
| VITE_FIREBASE_API_KEY | your-api-key-here | Production, Preview, Development |
| VITE_FIREBASE_AUTH_DOMAIN | your-project.firebaseapp.com | Production, Preview, Development |
| ... | ... | ... |

### For Render (UI Method)

In Render Dashboard → Environment:

Click "Add Environment Variable" and add each one individually with the exact key name.

---

## Troubleshooting

### Build Fails with "Directory not found"

**Issue**: Build command can't find nested `Dairy Farm` folder

**Solution**: 
- Vercel/Render correctly configured in JSON files
- Ensure repository structure hasn't changed
- Check that `Dairy Farm/package.json` exists

### Environment Variables Not Loading

**Issue**: App shows blank or Firebase not working

**Solution**:
- Verify all Firebase variables are added
- Check variable names exactly match (VITE_* prefix)
- Redeploy after adding variables
- Check browser console for errors

### Routing Issues (404 on Refresh)

**Issue**: App works but page refresh shows 404

**Solution**:
- Vercel: `vercel.json` handles SPA routing
- Render: `render.yaml` includes SPA routing
- If issue persists, ensure files are updated in repository

### Hot Module Reloading Not Working

**Issue**: Changes don't reflect immediately in dev

**Solution**:
- This only applies to local development
- Production builds don't need HMR
- Check that you're running `npm run dev` locally

---

## Performance Optimization

### Caching Strategy

- Static assets in `/assets` are cached for 1 year
- HTML files are not cached (no-cache)
- Optimized for fast loads on repeat visits

### Build Optimization

- Vite automatically optimizes the build
- Tree-shaking removes unused code
- Code splitting creates smaller bundles

### Monitoring

**Vercel Analytics**: Built-in with Vercel
- View Core Web Vitals
- Monitor performance

**Render**: Basic metrics available
- View deployment logs
- Check error reports

---

## Next Steps

1. Add custom domain for production use
2. Set up email notifications for deployments
3. Configure automatic backups if needed
4. Monitor performance metrics
5. Set up CI/CD for automated testing

---

## Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **Render Docs**: https://render.com/docs
- **Vite Deployment**: https://vitejs.dev/guide/static-deploy.html
- **Firebase Console**: https://console.firebase.google.com
