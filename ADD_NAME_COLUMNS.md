# Add Name Columns to Subscriptions Table

Before deploying the updated code, add these columns to Supabase:

1. Go to Supabase → Table Editor → **subscriptions** table
2. Click **"+ Add Column"** (twice, once for each)

**Column 1:**
- Name: `first_name`
- Type: `text`
- Default value: (leave blank)
- Is nullable: ✓ checked

**Column 2:**
- Name: `last_name`
- Type: `text`
- Default value: (leave blank)
- Is nullable: ✓ checked

3. Click **Save**

Now the webhook can store customer names when they subscribe.
