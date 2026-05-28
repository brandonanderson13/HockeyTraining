# Final Deployment - Leaderboard + Names System

## Files Ready to Upload

You have 5 files to upload to complete the system:

### 1. Add Name Columns to Supabase FIRST
Follow `ADD_NAME_COLUMNS.md`:
- Add `first_name` column (text, nullable)
- Add `last_name` column (text, nullable)

### 2. Upload to GitHub:

**Root level:**
- `subscribe.html` - Now collects first/last name
- `leaderboard.html` - NEW public leaderboard page
- `index.html` - Fixed statsByUser error

**In api folder:**
- `api/create-checkout.js` - Passes names to Stripe
- `api/stripe-webhook.js` - Saves names to Supabase

## What You'll Get

### Public Leaderboard
**URL:** `https://hockey-training.vercel.app/leaderboard.html`

- Three tabs: Most Shots | Most Stickhandling | Most Workouts
- Shows player first/last names (not emails)
- Top 3 highlighted (gold/silver/bronze)
- Auto-refreshes every 30 seconds
- No login required — embeddable on association website

### Subscribe Page
- Collects First Name, Last Name, Email
- Names stored in Supabase and shown in leaderboards

### Admin Panel
- Player table will show first/last names (once you update it)
- Can see which specific players are performing

## Still TODO (if you want):

### Add Reset Leaderboard Feature
Requires adding:
- A `leaderboard_resets` table to track reset dates
- Reset button in admin panel
- Query logic to only show data after last reset date

### Add Leaderboard Tab to Training Program
Add an iframe or direct embed of leaderboard.html inside the training program as a tab.

## Testing the System

1. Upload all 5 files
2. Wait for Vercel to deploy
3. Sign out
4. Go to subscribe page — you'll see first/last name fields
5. (Don't actually subscribe unless you want to test with real payment)
6. Go to `https://hockey-training.vercel.app/leaderboard.html`
7. Should show "No data yet" (since no sessions logged under names yet)
8. Sign in as admin, log a shooting/stickhandling session
9. Refresh leaderboard — your name should appear!

## Current State

- ✅ Login/payment system working
- ✅ Admin dashboard showing workout stats  
- ✅ All logging syncs to Supabase
- ✅ First/last names captured at signup
- ✅ Public leaderboard created
- ⏸️ Leaderboard reset feature (can add later if wanted)
- ⏸️ Leaderboard tab in training program (can add later)

You're at a fully launchable state. The leaderboard reset and embedded tab are nice-to-haves but not blockers.
