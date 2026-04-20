# Orbital Insight: Satellite & Space Debris Analytics

Orbital Insight is a live satellite and space debris analytics web application built with real CelesTrak SATCAT data. It analyzes orbital congestion, satellite distribution, debris density, launch growth trends, and collision-risk indicators through an interactive Flask dashboard, REST APIs, SQL-backed data storage, Power BI-ready exports, and an animated Earth globe visualization.

## Live Demo

```text
https://orbital-insight-space-debris-analytics-1.onrender.com/
```

The app is deployed on Render. On the free tier, the first load may take a little longer if the service has been sleeping.

## Project Highlights

- 68,000+ raw CelesTrak SATCAT records collected
- 33,000+ current Earth-orbiting objects analyzed
- 18,000+ satellites identified
- Python data pipeline for cleaning, standardization, risk scoring, and export
- SQLite database layer for SQL-backed analytics
- Flask REST API for dashboard data access
- Interactive web dashboard with filters, search, charts, and live data refresh
- Animated globe using a NASA Blue Marble Earth texture and representative satellite orbit points
- Power BI-ready dataset export for business intelligence dashboarding
- Render deployment for public access

## Tech Stack

| Layer | Technology |
|---|---|
| Data source | CelesTrak SATCAT |
| Data processing | Python, pandas |
| Database | SQLite |
| Backend | Flask, Gunicorn |
| Frontend | HTML, CSS, JavaScript, Canvas |
| Visualization | Custom web charts, interactive globe, Power BI export |
| Deployment | Render |
| Container support | Docker |

## Dataset

This project uses the real CelesTrak SATCAT catalog:

```text
https://celestrak.org/pub/satcat.csv
```

CelesTrak SATCAT format documentation:

```text
https://celestrak.org/satcat/satcat-format.php
```

The downloaded data is stored locally at:

```text
data/raw/celestrak_satcat.csv
```

The dashboard filters the catalog to current Earth-orbiting objects using:

```text
ORBIT_CENTER = EA
ORBIT_TYPE = ORB
```

This keeps the analysis focused on orbital congestion rather than objects that have already decayed, landed, or impacted.

## Features

- Dashboard KPI cards for total objects, satellites, debris, and average risk
- Orbit distribution analysis for LEO, MEO, GEO, and HEO
- Object category mix for satellites, debris, rocket bodies, and unknown objects
- Country/owner insights
- Growth trends over time
- Risk-zone analysis by orbit shell and inclination band
- Searchable highest-risk object table
- Interactive filters for orbit type, object category, risk level, status, and country/owner
- Live CelesTrak refresh button
- Interactive Earth globe with drag-to-rotate, zoom, hover tooltips, and representative satellite points

## Interactive Globe Note

The globe uses real CelesTrak SATCAT satellite records, including altitude, inclination, orbit type, ownership, and operational status. SATCAT does not provide live latitude/longitude positions, so the moving satellite points are representative orbital positions rather than exact real-time satellite tracking.

Earth texture source:

```text
NASA Blue Marble / Visible Earth texture via Wikimedia Commons
https://commons.wikimedia.org/wiki/File:Land_shallow_topo_2048.jpg
```

## Data Pipeline

The pipeline in `src/pipeline.py` performs the following steps:

1. Downloads or loads the CelesTrak SATCAT CSV
2. Removes duplicate NORAD catalog IDs
3. Filters to current Earth-orbiting catalog records
4. Standardizes owner, status, category, and orbit fields
5. Converts launch dates, period, inclination, apogee, perigee, and radar cross section
6. Categorizes objects as Satellite, Debris, Rocket Body, or Unknown
7. Classifies orbit shells as LEO, MEO, GEO, HEO, or Unknown
8. Calculates risk scores from orbit type, density, object category, altitude, inclination, estimated size, and operational status
9. Writes SQLite tables and a Power BI-ready CSV export

## Database

The generated SQLite database is stored at:

```text
data/processed/orbital_insight.db
```

Main tables:

- `dataset_metadata`
- `orbital_objects`
- `satellites`
- `debris`
- `orbit_stats`
- `country_stats`
- `growth_trends`
- `risk_zones`

## API Endpoints

| Endpoint | Description |
|---|---|
| `/api/summary` | KPI summary data |
| `/api/dashboard-data` | Filtered dashboard data |
| `/api/globe-data` | Satellite records and orbit counts for the globe |
| `/api/options` | Filter dropdown options |
| `/api/refresh-live-data` | Refreshes CelesTrak data and rebuilds the database |
| `/satellites` | Satellite records |
| `/debris` | Debris and rocket body records |
| `/orbit-stats` | Orbit distribution summary |
| `/risk-analysis` | High-risk orbital zones |
| `/api/country-stats` | Country/owner statistics |
| `/api/growth-trends` | Launch growth trends |

## Run Locally

```powershell
python -m pip install -r requirements.txt
python src\download_data.py
python src\pipeline.py
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

## Render Deployment

The project is configured for Render deployment.

Recommended Render settings:

```text
Build Command: pip install -r requirements.txt
Start Command: gunicorn app:app
Environment variables:
PYTHON_VERSION=3.11.11
ORBITAL_HOST=0.0.0.0
```

The included `render.yaml` also defines these deployment settings.

## Power BI Export

The cleaned Power BI-ready dataset is generated at:

```text
data/processed/powerbi_orbital_dataset.csv
```

It can be imported into Power BI to build KPI cards, orbit distribution charts, object category visuals, country/owner analysis, launch growth trends, and high-risk object tables.

## Limitations

- SATCAT is a catalog dataset, not a real-time position feed.
- The interactive globe shows representative orbital positions, not exact live satellite coordinates.
- Risk scoring is heuristic and intended for analytics demonstration, not operational collision prediction.
- Render free tier may sleep after inactivity, causing slower first loads.

## Future Enhancements

- TLE/GP orbit propagation for real-time satellite positions
- Space-Track integration for richer object metadata
- Machine learning models for collision-risk estimation
- More detailed 3D globe rendering with Three.js
- Historical debris growth forecasting

## Acknowledgements

- CelesTrak for public SATCAT satellite catalog data
- NASA Visible Earth / Blue Marble imagery
- Wikimedia Commons for hosting the Earth texture asset
- Render for public web deployment
- Power BI for dashboarding and business intelligence visualization

## Contact

For questions, feedback, or collaboration:

```text
kalrayashpreet@gmail.com
```
