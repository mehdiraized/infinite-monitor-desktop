# Widget Admin Dashboard

Static admin page for reviewing widget submissions. Deploy to **GitHub Pages**.

## Setup

### 1. Create Supabase project

Go to [supabase.com](https://supabase.com), create a free project.

### 2. Create the database table

Open **SQL Editor** in Supabase dashboard and run the contents of [`supabase-migration.sql`](supabase-migration.sql).

### 3. Configure the desktop app

Add these environment variables to the Electron app (or `.env.local` in the overlay):

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 4. Deploy admin page to GitHub Pages

```bash
# Create a new repo (e.g. mehdiraized/widget-admin)
cd widget-admin
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/mehdiraized/widget-admin.git
git push -u origin main
```

Then in GitHub → Settings → Pages → Source: **main** branch, root `/`.

### 5. Open the admin page

Visit `https://mehdiraized.github.io/widget-admin/` and enter your Supabase URL + anon key. Credentials are saved in localStorage (browser only).

## How it works

```
User shares widget (desktop app)
       │
       ▼
  POST /api/registry/submit
       │
       ├─► Saves locally (user sees it immediately)
       │
       └─► Inserts into Supabase (widget_submissions table)
              │
              ▼
  Admin opens widget-admin dashboard
       │
       ├─► Sees all pending submissions
       ├─► Expands widget → views JSON
       ├─► Clicks "Copy JSON" → pastes into data/widgets/
       └─► Marks as approved/rejected
```
