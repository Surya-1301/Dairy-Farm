# Deployment Guide

This guide explains how to deploy the Dairy Farm application to Vercel, Render, Azure, and Firebase Hosting.

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

## Firebase Firestore Setup

Registered user profiles are shared through Firestore so the owner dashboard can see users who signed up from other devices or browsers.

1. In Firebase Console, open **Firestore Database**
2. Create a database if it does not exist
3. Use the committed Firestore rules in [firestore.rules](backend/firestore.rules). These rules enforce per-user access for:
   - `customerLists/{email}`
   - `sheetStates/{email}`
   - `sheetHistories/{email}`
   - owner override access for admin workflows
4. Deploy the rules from repository root:

```bash
firebase deploy --only firestore:rules
```

5. Redeploy Render or Vercel after adding/updating Firebase environment variables.

---

## Deploy to Firebase Hosting

Firebase Hosting serves the same `frontend/dist` build and lives in the same Firebase project (`raipur-dairy-farmm`) already used for Auth/Firestore, so it shares the project's `authDomain` — handy for password-reset links.

### Step 1: Install the CLI and log in (one-time)

```bash
npm install -g firebase-tools
firebase login
```

### Step 2: Build and deploy

Run from the repository root, where `firebase.json` and `.firebaserc` live:

```bash
cd frontend && npm run build && cd ..
firebase deploy --only hosting
```

The build reads `frontend/.env` (or whatever env is active in your shell) at build time, same as the other targets — make sure the `VITE_FIREBASE_*` and EmailJS variables are set there before building.

### Step 3: Get the URL

Deploy output prints the live URL: `https://raipur-dairy-farmm.web.app` (also reachable at `https://raipur-dairy-farmm.firebaseapp.com`).

### Routing and the auth-action redirect

- `firebase.json`'s `hosting.rewrites` sends all unmatched routes to `/index.html` so React Router's client-side routes resolve on refresh.
- `/__/auth/action` is rewritten to `frontend/public/reset-redirect.html`, which Firebase Auth calls for password-reset links (since it's served from the project's `authDomain`); it forwards the user to the configured app URL. Update the `appUrl` constant in that file if the canonical app URL changes.

### Automatic Deployments

There's no CI workflow wired up for Firebase Hosting yet — deploys are manual via `firebase deploy --only hosting`. Add a GitHub Actions step calling that command if you want it to deploy on push like the other targets.

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
2. Build Command: Should show `cd 'frontend' && npm install && npm run build`
3. Output Directory: Should show `frontend/dist`
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

- Build Command: `cd 'frontend' && npm install && npm run build`
- Publish Directory: `frontend/dist`
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

## Deploy to Azure (Storage Static Website)

> **Note:** Azure Static Web Apps was the original plan, but it's only available in `centralus`, `eastus2`, `westus2`, `westeurope`, `eastasia` — none of which this subscription's region-allowlist policy permits (Azure for Students subscriptions are often restricted to a specific set of regions, check yours with `az policy assignment list`). We used **Azure Storage static website hosting** instead, which works in any region and has no fixed monthly cost (pay-per-use, effectively pennies for a small site).

Live resources created for this project:

- Resource group: `dairy-farm-rg` (region: `centralindia`)
- Storage account: `dairyfarmstatic`
- Static website endpoint: `https://dairyfarmstatic.z29.web.core.windows.net/`

The repo ships a GitHub Actions workflow at `.github/workflows/azure-storage-deploy.yml` that builds `frontend/` and uploads `frontend/dist` to the storage account's `$web` container on every push to `main`.

### Step 1: Create the storage account (already done for this project)

```bash
az group create --name dairy-farm-rg --location centralindia

az storage account create \
  --name dairyfarmstatic \
  --resource-group dairy-farm-rg \
  --location centralindia \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access true

az storage blob service-properties update \
  --account-name dairyfarmstatic \
  --static-website \
  --index-document index.html \
  --404-document index.html
```

The 404 document is set to `index.html` too so client-side routes (React Router) resolve correctly on refresh — Storage static websites don't support full rewrite rules like Static Web Apps does.

### Step 2: Add GitHub repository secrets

In GitHub → repo **Settings → Secrets and variables → Actions**, add:

- `AZURE_STORAGE_CONNECTION_STRING` — get it with:
  ```bash
  az storage account show-connection-string --name dairyfarmstatic --resource-group dairy-farm-rg -o tsv
  ```
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

### Step 3: Deploy

Push to `main`. The workflow builds `frontend` with Vite and uploads `frontend/dist` to the `$web` container. Track progress under the repo's **Actions** tab.

The first deploy was done manually as a smoke test:

```bash
cd frontend && npm run build
AZ_KEY=$(az storage account keys list --account-name dairyfarmstatic --resource-group dairy-farm-rg --query "[0].value" -o tsv)
az storage blob upload-batch --account-name dairyfarmstatic --account-key "$AZ_KEY" --destination '$web' --source dist --overwrite
```

### Custom Domain / CDN

Storage static websites serve HTTPS only on the default `*.web.core.windows.net` endpoint. For a custom domain with HTTPS, front it with Azure CDN or Azure Front Door pointing at the static website endpoint.

---

## Local Testing Before Deployment

Test the production build locally:

```bash
cd frontend
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
- Check that `frontend/package.json` exists

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
