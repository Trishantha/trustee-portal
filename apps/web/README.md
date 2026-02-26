# Trustee Portal - Web Frontend

The frontend web application for Trustee Portal.

## Structure

```
src/
├── pages/       # Main HTML pages
│   ├── index.html      # Landing page
│   ├── apply.html      # Application form
│   ├── plans.html      # Pricing plans
│   └── clear-cache.html # Cache clearing utility
├── styles/      # CSS files
│   └── styles.css
├── scripts/     # JavaScript files
│   ├── app.js
│   ├── api.js
│   ├── api-v2.js
│   └── ...
└── components/  # Reusable HTML modules
    ├── dashboard.html
    ├── admin.html
    ├── profile.html
    └── ...
```

## Development

Since this is a static frontend, you can use any static server:

```bash
# Using npx serve
npx serve src/pages

# Or using Python
python3 -m http.server 3000 --directory src/pages

# Or using Node.js
npm install -g serve
serve src/pages
```

## API Integration

The frontend communicates with the API at `http://localhost:3001` (development).

Update the API base URL in `src/scripts/api-v2.js`:

```javascript
this.baseUrl = 'http://localhost:3001/api';
```

## Build

No build step required - this is vanilla HTML/CSS/JS.

## Notes

- Uses `localStorage` for client-side state (to be migrated to HttpOnly cookies)
- Module-based component architecture
- Responsive design with CSS Grid/Flexbox
