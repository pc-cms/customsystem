## Goal
Replace the current black Premier elephant favicon with the uploaded Amaell stripe icon across all domains (casinosystem.app, *.lovable.app, and branded subdomains).

## Steps

1. **Copy uploaded image to public directory**
   - Source: `user-uploads://amaell-stripe-icon-512 (1).png`
   - Target: `public/favicon.png`

2. **Update Apple touch icon**
   - Copy same image to `public/apple-touch-icon.png`

3. **Remove legacy .ico file**
   - Delete `public/favicon.ico` if present (browsers auto-request it, overriding PNG)

4. **Verify index.html references**
   - Ensure `<link rel="icon" href="/favicon.png" type="image/png">` exists
   - Ensure `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` exists

## Notes
- No changes to `branding.js` — branded subdomains (arusha., club., premier., etc.) keep their own favicon mappings, while default/casinosystem.app now shows Amaell.
- No database changes or version bump needed — purely static asset update.
- The Amaell icon will appear on the Lovable preview, casinosystem.app, and any subdomain using the default branding.