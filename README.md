# Vietflexmap DigitalTwin

**GIS + Digital Twin + Agent-based scenario modeling** for gravity-fed mountain water supply planning in Viet Nam.

> Research demonstration. All pipe locations, demand, flow, pressure, costs and observations are synthetic. Terrain and OpenStreetMap imagery are separately attributed open geographic datasets. The illustrative location in Sơn La is **not** a surveyed project site.

- Frontend: [index.html](index.html), a static GitHub Pages application with CesiumJS/OSM/DEM sampling, interactive scenario controls, GIS network and real recalculation in the educational JavaScript solver.
- Backend: `backend/` FastAPI + WNTR + **EPANET 2.2 EpanetSimulator**. Deploy separately and enter its URL in the frontend to enable the official engine.
- A deterministic rule-based agent recommends scenario runs and flags physical/service constraints; it does not autonomously operate infrastructure.
- Export: JSON, CSV, EPANET INP. No real-world engineering design without site survey, calibration and qualified review.

The static demo **cannot run Python/WNTR inside GitHub Pages**. If the backend is unavailable the interface prominently labels its results `JS minh họa`, never `EPANET`.

## Quick start

Open the [GitHub Pages demo](https://vietflexmap.github.io/DigitalTwin/) once Pages is configured to deploy from `main` (root).

To run the official engine:

```sh
cd backend
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Use `http://localhost:8000` as API address when the frontend is also served from localhost. On HTTPS Pages, deploy the backend under HTTPS to avoid mixed-content restrictions.

See [technical documentation](docs/TECHNICAL.md) for mathematical assumptions, sources and validation boundaries.
