# Deployment And Tester Setup

## Objective
Deploy the portal for friend/UAT testing without exposing your own shipment data.

## Safe testing model
For external testing, use these rules:

- every tester logs in with a separate account
- each tester uploads their own Excel file
- no demo data should be visible
- no local database or uploaded files from your machine should be deployed

## Code changes already prepared

### Frontend
- demo auto-login is now configurable using `VITE_ENABLE_DEMO_SESSION`
- for hosted testing, set it to `false`
- when disabled, the portal shows a sign-in screen instead of silently using the demo account

### Backend
- demo fallback is now configurable
- demo account bootstrap is configurable
- demo shipment adoption is configurable
- tester accounts can be pre-seeded through `SEED_TEST_USERS`

## Recommended hosted test configuration

### Backend environment
Set these values in hosted backend environment variables:

```env
APP_ENV=testing
SECRET_KEY=replace-with-a-long-random-secret
DATABASE_URL=sqlite:///./tracking_portal.db
CORS_ORIGINS=https://your-frontend-domain
ALLOW_DEMO_PORTAL_FALLBACK=false
ALLOW_DEMO_ACCOUNT_BOOTSTRAP=false
ENABLE_DEMO_SHIPMENT_ADOPTION=false
SEED_TEST_USERS=[{"email":"tester1@portal.local","password":"Portal@123"},{"email":"tester2@portal.local","password":"Portal@234"},{"email":"tester3@portal.local","password":"Portal@345"},{"email":"tester4@portal.local","password":"Portal@456"}]
```

### Frontend environment
```env
VITE_API_BASE_URL=https://your-backend-domain
VITE_ENABLE_DEMO_SESSION=false
```

## Suggested tester accounts to share

### Option A
- `tester1@portal.local` / `Portal@123`
- `tester2@portal.local` / `Portal@234`
- `tester3@portal.local` / `Portal@345`
- `tester4@portal.local` / `Portal@456`

### Option B
Ask each friend to self-register using the sign-up form.

Option A is better if you want controlled testing.

## GitHub preparation checklist

### Before pushing
- [ ] do not push local `.env` files
- [ ] do not push local `.db` files
- [ ] do not push `backend/uploads`
- [ ] do not push `backend/runtime_data`
- [ ] do not push `frontend/node_modules`

This repository now has a `.gitignore` prepared for that.

## Recommended friend-testing flow

### Step 1
Deploy backend

### Step 2
Deploy frontend

### Step 3
Set the environment variables above

### Step 4
Share one tester login with each friend

### Step 5
Ask each friend to:
- log in
- upload their own sample Excel
- test dashboard actions
- upload documents
- fill the UAT sheet

## Important caution
Use a fresh hosted database for testing.

Do not deploy the same database file that contains your local working shipment data.

## Suggested hosting path

### Frontend
- Vercel or Netlify

### Backend
- Render, Railway, or any Python host that supports FastAPI

## What to send your friends
Send them:
- frontend URL
- one tester login/password
- the UAT checklist file
- short instruction:
  "Please upload your own Excel file and do not use real confidential shipment data."
