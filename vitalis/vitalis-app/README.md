# Vitalis

Emergency triage and hospital finder for Telangana. One Express service serves
both the API and the web app, so there is no separate frontend deploy, no
`config.js` API URL to keep in sync, and no CORS setup.

## Run locally

```bash
npm install
cp .env.example .env      # optional locally; JWT_SECRET is only required in production
npm start                 # http://localhost:3000
```

## Project layout

```
server.js            API routes, auth, security headers, static hosting
lib/triage.js        symptom catalog, scoring, urgency levels
lib/firstaid.js      first-aid cards
lib/hospitals.js     dataset loader and nearest-first search (Haversine)
lib/store.js         JSON user store
lib/mailer.js        optional SMTP for reset emails
data/hospitals.json  hospital dataset (sample of 12: replace with yours)
public/              index.html, styles.css, app.js
```

## Use your 5,000+ hospital dataset

Replace `data/hospitals.json` with your file. It can be an array, or an object
with a `hospitals` array. Column names are matched loosely, so these all work:

| Field    | Accepted names                                              |
| -------- | ----------------------------------------------------------- |
| name     | name, hospital_name, hospital, facility_name                |
| lat/lng  | lat, latitude / lng, lon, long, longitude                   |
| district | district, district_name                                     |
| address  | address, location                                           |
| phone    | phone, contact, mobile, telephone                           |
| type     | type, category, hospital_type, ownership                    |

Rows without a name are skipped. Rows without valid coordinates are still
searchable but have no distance or directions link. The server logs how many
hospitals it loaded at startup.

## Deploy on Render (new service)

1. New > Web Service > connect `rmanikanta1608-bit/vitalis--backend`.
2. **Root Directory:** the folder that contains this `package.json`
   (`vitalis-app` if you copy this folder in as it is).
3. **Build command:** `npm install`  **Start command:** `npm start`
4. Environment variables:

| Variable           | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| `JWT_SECRET`       | long random string. The server refuses to start without it.  |
| `NODE_ENV`         | `production`                                                 |
| `GOOGLE_CLIENT_ID` | optional, enables the Google button                          |
| `PUBLIC_URL`       | optional, your final URL, used in reset links                |
| `SMTP_*`, `MAIL_FROM` | optional, sends reset emails                              |

Generate a secret with:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

You no longer need the Netlify site. Delete it once the Render URL works.

## Custom domain (for example a .co.in)

Add it on Render only: service > Settings > Custom Domains. Create the CNAME
Render shows you at your registrar. Then set `PUBLIC_URL` to the new address
and add it under **Authorised JavaScript origins** for your Google OAuth client.

## Things to check before real users

- **Users are lost on redeploy.** `data/users.json` lives on Render's free-tier
  disk, which is wiped on every deploy. Move to a database before real use.
- **Password-reset links.** Without SMTP, the link is printed to the Render
  logs. `DEMO_RESET=true` returns it in the API response instead; never turn
  that on for a public site, because anyone could reset anyone's password.
- **Clinical content.** Have a doctor review the triage weights in
  `lib/triage.js` and the cards in `lib/firstaid.js`.
- **Helpline numbers.** 108, 112 and Tele-MANAS 14416 appear in the app.
  Confirm them against official sources before launch.
- **Sample hospitals.** The 12 bundled entries use approximate coordinates and
  are only there so the app works out of the box.
- Do not commit `.env` or `data/users.json`. The `.gitignore` already skips both.
