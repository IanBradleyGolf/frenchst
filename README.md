# French St Planner

A small web app for laying out lighting, power, data and control components on the
architectural plans for 48–48A French St, Maroubra, and producing quantity schedules
and marked-up drawings from them.

- Upload the architectural PDF and add each page as a floor.
- Set the scale from a known dimension, trace rooms, and assign each room to a dwelling.
- Pick components from the library and click to place them. Move, rotate, copy, mirror.
- Draw the party wall once per floor, then mirror-copy items (or a whole room) to the other dwelling.
- Live schedule by component, dwelling and room, with supply and install cost.
- Export an Excel workbook (totals, by dwelling, by room, every item, library) and a PDF
  of every floor with the symbols drawn on the original plan, plus schedule pages.
- Save named revisions (Rev A, Rev B…) and compare quantities against the current layout.

The component library starts with the LA Lounge fitting types (supply prices from their
Rev A schedule) plus power, data, AV and control items. Everything in it is editable.

## Stack

| Part | Choice |
| --- | --- |
| Client | React 18, TypeScript, Vite, react-konva (canvas), pdf.js (plan rendering), Zustand (state + undo), SheetJS (Excel), pdf-lib (PDF export) |
| Server | Node 22, Express, `mssql` |
| Data | Azure SQL: one JSON document per project, PDFs as VARBINARY, revisions as snapshots |
| Hosting | Azure App Service (Linux, Node 22), deployed by GitHub Actions |
| Sign-in | App Service Authentication (Easy Auth); the API records `x-ms-client-principal-name` on saves |

## Run locally

```bash
npm install
npm run dev          # API on :8080 (file storage in ./data), client on http://localhost:5173
```

To use Azure SQL locally, set `SQL_SERVER` / `SQL_DATABASE` (see `.env.example`) and `az login`.

## Deploy to Azure

1. **Database.** Create a database on `metricus.database.windows.net` (default name `frenchst`,
   or set `SQL_DATABASE`). Make sure the server has an Entra admin.
2. **Web App.** Create an App Service: Linux, Node 22 LTS (or 24 LTS). Under *Identity*, turn on the
   system-assigned managed identity.
3. **Grant access.** Run `sql/setup.sql` against the database, replacing `<web-app-name>`.
   Also allow Azure services through the SQL server firewall (or use a private endpoint).
4. **App settings** (Configuration → Application settings):
   - `SQL_SERVER` = `metricus.database.windows.net`
   - `SQL_DATABASE` = `frenchst`
   - `SQL_AUTH` = `managed-identity`
   - `NODE_ENV` = `production`
   - Startup command: `npm start`
5. **Sign-in.** Authentication → Add identity provider → Microsoft. Require authentication.
6. **GitHub.** In the repo settings add:
   - Variable `AZURE_WEBAPP_NAME` = your App Service name
   - Secret `AZURE_WEBAPP_PUBLISH_PROFILE` = the publish profile downloaded from the Web App
     (enable *SCM Basic Auth Publishing Credentials* in the Web App's configuration first)
7. Push to `main`. The workflow typechecks, builds and deploys. `GET /api/health` reports the storage in use.

The app creates its tables on first start (`dbo.fs_projects`, `dbo.fs_plans`, `dbo.fs_revisions`).

## Using it

| Action | How |
| --- | --- |
| Add a floor | Floors → **+ Add**, upload the PDF, pick the page |
| Set scale | Properties → **Set scale from a known dimension**, click two points, enter mm |
| Draw a room | **N**, click corners, click the first point / double-click / Enter to finish |
| Edit a room | Click its label; drag the corner handles; rename and set dwelling in the Rooms tab |
| Place components | Click a component in the library, click on the plan; **Esc** to stop |
| Select | Click, Shift-click, or drag a box on empty space; **Ctrl+A** for the whole floor |
| Move / nudge | Drag, or arrow keys (Shift for bigger steps) |
| Rotate | **R** / **Shift+R** (45°) |
| Copy | **Ctrl+C / Ctrl+V**, or **Ctrl+D** to duplicate |
| Mirror to the other dwelling | Draw the party wall (Properties), select items, press **M**; or Rooms → **Mirror room + items** |
| Circuits | Select lights and type a circuit or keypad group in Properties; it shows on the plan and in the Excel export |
| Pan / zoom | Mouse wheel zooms; hold **Space**, middle- or right-drag, or **H** to pan; **F** fits |
| Undo / redo | **Ctrl+Z / Ctrl+Y** |

Changes save automatically a second after you stop editing. If the same project is saved from
another window in the meantime, the editor stops and asks whether to reload or overwrite.

## Notes and limits

- Coordinates are stored in PDF points of the chosen page, so symbols line up exactly in the PDF export.
  Rotated PDF pages (`/Rotate` ≠ 0) are not yet handled.
- Rates are ex GST. Supply rates for light fittings come from the LA Lounge schedule; install rates are indicative.
- An item is counted against the smallest room that contains it; items outside every room show as "(no room)".
