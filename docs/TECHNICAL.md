# Technical specification — GIS + Digital Twin + Agent modeling

## 1. Scope and truthfulness
This repository is a demonstrator for **gravity-fed mountainous water supply in Viet Nam**.

* **Real geographic inputs**: OpenStreetMap raster basemap and Mapzen Terrain Tiles elevation (Terrarium RGB).
* **Synthetic inputs**: source and village coordinates, network topology, 5 pipe lengths, 6 nominal junction elevations, 168 households, available source discharge, reservoir hydraulic head, hourly demand, Hazen–Williams roughness, commercial diameters, construction costs and scenarios.
* Geographic vicinity: Sơn La, Việt Nam; **not an identified or surveyed research catchment**. OSM background features are not proof of an existing pipeline.
* EPANET computation is **official only when the separate Python WNTR backend runs**. Browser JS is a separately labeled educational tree solver.
* Residual checks on synthetic data prove equations were respected numerically, **not** that field pressure/flow/elevation matches the real world.

## 2. User-facing pipeline

1. **Data**: geographically positioned synthetic nodes + OSM display + real Mapzen DEM pixels. Node elevations are independent nominal synthetic values until the DEM option is explicitly enabled.
2. **Hydraulics**: evaluate head, discharge, pressure-driven demand and pipe velocity. Backend: `wntr.sim.EpanetSimulator(...).run_sim(version=2.2)` with PDD.
3. **Optimization**: 192 discrete combinations in JS, 3 objectives: capital cost, unmet demand weighted across current + drought scenarios, and pressure-violation penalty. Optional API runs a bounded seeded NSGA-II search, re-evaluating every candidate with EPANET 2.2.
4. **Physical verification**: nodal continuity and energy residuals, numerical convergence and source capacity as constraints. EPANET reservoir **does not automatically enforce seasonal source capacity**; official backend flags overflow as infeasible. Educational JS performs uniform source rationing as an explicit pedagogical approximation.
5. **Visualization**: CesiumJS + OSM imagery + a local shaded 3D mesh triangulated from actual DEM raster pixels, then synthetic node/pipe entities and hydraulic dashboard.
6. **Export**: diagnostic JSON, CSV, GeoJSON, and EPANET INP for repeatable external analysis.

## 3. Reference model (synthetic)

| Node | Type | Nominal elevation m | Requested base L/s | Households |
|---|---|---:|---:|---:|
| SRC | Reservoir/source | 927 | 0 | 0 |
| J1 | Junction | 912 | 0 | 0 |
| H1 | Demand node | 903 | 0.38 | 42 |
| H2 | Demand node | 909 | 0.33 | 37 |
| H3 | Demand node | 895 | 0.42 | 48 |
| H4 | Demand node | 897 | 0.36 | 41 |

Pipe topology: SRC→J1, J1→H1, J1→H2, H1→H3, H2→H4; five synthetic links length 510, 490, 525, 440, 535 m respectively. Base diameters 63, 50, 50, 40, 40 mm, Hazen-Williams C=130. Available source 2.0 L/s, source head 942 m. Two land scenarios change effective reservoir head and measured capacity independently of terrain.

All numerical values were invented solely for demonstration and are not field measurements.

### Fluid mechanics
Steady-state node continuity:
`ΣQ_in - ΣQ_out - Q_delivered = 0`.

Hazen–Williams head loss, SI:
`h_f = 10.67 L |Q|^1.852 / (C^1.852 D^4.871)`, with Q in m³/s and D in m.

Head profile:
`H_upstream - H_downstream = h_f` (local losses zero in synthetic template).

Pressure head:
`p/ρg = H - z`.

Pressure-dependent demand approximation in JS:
`D_delivered = D_requested * min(1, sqrt(max(0, p/ρg) / 15m))`,
with source-cap rationing explicitly distinct from official hydraulic regulation.
Backend EPANET 2.2 uses its native PDA/PDD network solver; differences from the pedagogical JS are expected.

### Example scenarios
`dry`: nominal; `wet`: +3 m source head, 1.3× source capacity; `drought`: −8 m, 0.62× capacity, 1.07× demand; `peak`: −1 m and 1.42× demand. The daily pattern combines Gaussian peaks around morning and evening.

## 4. DEM / geospatial handling

* OpenStreetMap tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. © OpenStreetMap contributors: https://www.openstreetmap.org/copyright .
* Mapzen Terrarium: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, dataset registry: https://registry.opendata.aws/terrain-tiles/ .
* Elevation decoding: `meters = 256 * R + G + B/256 - 32768`.
* 25×25 pixels sampled across a local geographic rectangle using Web Mercator zoom 12. DEM raster is **real-derived**, but sampling resolution is *not* a claim of source native resolution or centimeter vertical accuracy.
* Sampling uses nearest image pixel; not a high precision geodetic survey. It can be biased by source vertical datum, raster generalization, spatial accuracy, and resampling.
* Color-tinted mesh displays real DEM elevations over a separate OSM globe imagery layer. It is not a globally served Cesium quantized-mesh dataset.
* When the public DEM source fails due to network/CORS, the UI clearly says *DEM unavailable* and does **not** fabricate measured elevations; the synthetic reference profile remains accessible with distinct status.
* The DEM toggle for **hydraulic elevations** is opt-in and updates the reservoir-head control from the sampled source elevation. Consequently, downstream nodes may fail pressure constraints. Never automatically alter DEM elevations to force a passing result.
* Terrain attribution and upstream source licenses: https://github.com/tilezen/joerd/blob/master/docs/attribution.md and https://github.com/tilezen/joerd/blob/master/docs/data-sources.md .

## 5. Engine boundary

### Static GitHub Pages mode
`index.html`, `style.css`, `physics.js`, `terrain.js`, `app.js`.
The browser solves a **single-rooted branch/tree** with pressure-dependent demand and a simple source flow allocator. It does not solve arbitrary looped networks, pump curves, PRVs, water quality or dynamic tank controls. In browser mode optimization is exact enumeration of 192 **candidate configurations**, not guaranteed globally optimal across arbitrary pipe designs.

### Official WNTR / EPANET backend
```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

Alternatively:
```bash
docker build -t vietflex-digitaltwin ./backend
docker run --rm -p 8000:8000 vietflex-digitaltwin
```

API:
* `GET /api/health`: engine health.
* `POST /api/simulate`: run native EPANET version 2.2 for the provided control state.
* `POST /api/day`: 24 hourly EPANET solves.
* `POST /api/optimize`: bounded, seeded NSGA-II with EPANET evaluations and non-dominated feasible solutions.

Example:
```bash
curl -s http://127.0.0.1:8000/api/simulate \
 -H 'Content-Type: application/json' \
 -d '{"scenario":"dry","route":"B","hour":10,"head":942,"capacity":2.0,"roughness":130,"demand":1.0,"diameters":[63,50,50,40,40]}'
```

For GitHub Pages HTTPS you must deploy the API **over HTTPS** and enter its URL in the field. The static demo is never claimed to be an official WNTR run unless the backend actually responds.

### Validation thresholds and limits
* JS mass residual under 1e−6 L/s, headloss residual under 1e−5 m; hydraulic solver reports iteration convergence.
* WNTR reporting tolerance under 1e−5 L/s and headloss approximation under 0.3 m; strict quality thresholds are illustrative and must be designed against source measurement uncertainty when field data is available.
* Service proxy: pressure minimum 15 m, maximum 60 m, pipe velocity maximum 2 m/s, demand coverage at least 95%. **Not** a formal engineering code or certification.
* Source capacity is treated as a separate seasonal feasibility inequality by the official backend; the EPANET reservoir represents a fixed-head boundary and is not capacity constrained by itself.
* Field calibration is **not implemented**. Do not present this simulation as physically validated against real-world measurements.

## 6. Basic agent
The rule-based scenario agent performs condition checks for flow shortages, insufficient/excess pressure and non-convergence. It proposes a new scenario, but no model is mutated until users click “Áp dụng”. No autonomous physical infrastructure control or chatbot/LLM connection.

## 7. Quality and verification
```bash
node --check physics.js
node --check terrain.js
node --check app.js
node tests/physics.cjs
python -m pytest -q tests/test_engine.py
```
Automated GitHub Actions run those checks after repository updates; engine tests require backend dependencies. Suggested next research milestone: independently compare the JS solver against EPANET 2.2 with shared INP inputs and explicitly disclose discrepancies.

## 8. Path to field-ready research
1. Identify and authorize survey basin and hydraulic system; collect surveyed network IDs and vertical datum.
2. Replace reference coordinates/topology with GNSS/UAV/DEM ground truth, document uncertainty and field data source IDs.
3. Collect source flow and pressure observations in multiple demand periods.
4. Calibrate roughness, demands and boundary conditions on training observations; independently validate on held-out measurements.
5. Compare least-cost, engineer baseline, and NSGA-II approaches under common constraints and uncertainty.
6. Deliver final CesiumJS WebGIS, EPANET model, full provenance, QA/QC log, technical handbook and transfer package.

**No field data are distributed in this repository.**
