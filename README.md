# Vietflexmap DigitalTwin

**GIS + Digital Twin + Agent-based scenario modeling** for gravity-fed mountain water supply planning in Viet Nam.

> Research demonstration. All pipe locations, demand, flow, pressure, costs and observations are synthetic. Terrain and OpenStreetMap imagery are separately attributed open geographic datasets. The illustrative location in Sơn La is **not** a surveyed project site.

- Frontend: [index.html](index.html), a static GitHub Pages application with CesiumJS/OSM/DEM sampling, interactive scenario controls, GIS network and real recalculation in the educational JavaScript solver.
- Backend: `backend/` FastAPI + WNTR + **EPANET 2.2 EpanetSimulator**. Deploy separately and enter its URL in the frontend to enable the official engine.
- A deterministic rule-based agent recommends scenario runs and flags physical/service constraints; it does not autonomously operate infrastructure.
- Export: JSON, CSV, EPANET INP. No real-world engineering design without site survey, calibration and qualified review.

The static demo **cannot run Python/WNTR inside GitHub Pages**. If the backend is unavailable the interface prominently labels its results `JS minh họa`, never `EPANET`.

## Quick start

**One-time GitHub Pages activation:** Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**, then go to **Actions → Publish GIS Demo → Run workflow** (or re-run the last failed deployment). Until this step, the Pages URL is not live. Once enabled, browse https://vietflexmap.github.io/DigitalTwin/ .

To run the official engine:

```sh
cd backend
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Use `http://localhost:8000` as API address when the frontend is also served from localhost. On HTTPS Pages, deploy the backend under HTTPS to avoid mixed-content restrictions.

See [technical documentation](docs/TECHNICAL.md) for mathematical assumptions, sources and validation boundaries.

## Current implementation / limitations

- No project-specific numeric research task identifier is stored anywhere in this repository.
- JS calculations really execute for the synthetic 6-node / 5-link tree, including PDD approximation, mass/energy residuals, full daily curve and 192-design non-dominated shortlist.
- Official EPANET 2.2 computation and seeded NSGA-II run via the **separately hosted FastAPI/WNTR server**. Backend tests run on GitHub Actions; they do not mean the public site can call a deployed service until one is configured.
- CesiumJS + OSM imagery and Mapzen Terrarium pixel decoding / real-elevation mesh load over the internet. If DEM cannot be downloaded, the app explicitly states that real elevation is unavailable.
- Field calibration, site certification, observed time series and real installed pipe inventory are not part of the demo.
