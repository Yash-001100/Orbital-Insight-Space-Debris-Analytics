# Orbital Insight Satellite & Space Debris Analytics System

Orbital Insight is a compact data analytics and web application project for exploring satellite and space debris congestion. It follows the assignment flow from the PDF: real data collection, data cleaning, SQL storage, analysis, REST APIs, and an interactive dashboard.

## Real Dataset Source

This project uses the real CelesTrak SATCAT catalog:

```text
https://celestrak.org/pub/satcat.csv
```

CelesTrak documents the SATCAT CSV fields here:

```text
https://celestrak.org/satcat/satcat-format.php
```

The downloaded file is stored locally at:

```text
data/raw/celestrak_satcat.csv
```

The copy downloaded for this project contains more than 68,000 catalog records. The dashboard filters this to current Earth-orbiting objects using `ORBIT_CENTER = EA` and `ORBIT_TYPE = ORB`, which keeps the analysis focused on orbital congestion rather than objects that have already decayed or impacted.

## What is included

- Python preprocessing with `pandas`
- SQLite database storage for the SQL layer
- Flask REST API endpoints
- Interactive browser dashboard with filters, chart selector, search, and live CelesTrak refresh
- Interactive animated globe showing representative satellite orbits from real SATCAT records
- Local NASA Blue Marble Earth texture for realistic continents on the globe
- Power BI-ready export at `data/processed/powerbi_orbital_dataset.csv`

## Run the project

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

## Run with HTTPS locally

For a local demo, enable Flask's self-signed HTTPS certificate:

```powershell
$env:ORBITAL_HTTPS="1"
python app.py
```

## Deploy As A Public Web App

This project is a Flask web application, so the easiest public hosting path is a Docker-based Hugging Face Space, Render, Railway, or similar Python web host.

For Hugging Face Spaces, choose:

```text
SDK: Docker
Port: 7860
```

The included `Dockerfile` runs the Flask dashboard on `0.0.0.0:7860`, which is the default port used by many Space examples. A native Gradio rebuild is possible, but it is not recommended because this app already uses custom Flask routes, JavaScript charts, and an interactive globe.

Open:

```text
https://127.0.0.1:5000
```

Your browser will show a privacy warning because the certificate is self-signed. For a college demo, choose the advanced option and continue to localhost. For a public deployment, use a trusted HTTPS certificate through a hosting platform, Nginx/Caddy, Cloudflare Tunnel, or ngrok.

Optional host and port settings:

```powershell
$env:ORBITAL_HOST="127.0.0.1"
$env:ORBITAL_PORT="5443"
$env:ORBITAL_HTTPS="1"
python app.py
```

## API endpoints

- `/satellites` - satellite records
- `/debris` - debris and rocket body records
- `/orbit-stats` - orbit distribution summary
- `/risk-analysis` - high-risk orbital zones
- `/api/dashboard-data` - filtered dashboard data for interactive charts
- `/api/globe-data` - filtered satellite records and orbit counts for the interactive globe
- `/api/options` - filter options for orbit, object type, risk, status, and country
- `/api/refresh-live-data` - downloads the latest CelesTrak SATCAT CSV and rebuilds the database
- `/api/country-stats` - satellite count by country
- `/api/growth-trends` - object growth over time
- `/api/summary` - dashboard KPI summary

## Interactive dashboard features

- Refresh live CelesTrak SATCAT data from the dashboard
- Filter by orbit type, object category, risk level, operational status, and country/owner
- Search by object name, NORAD catalog ID, or international designator
- Switch the main visualization between orbit distribution, category mix, country/owner ranking, risk zones, launch growth, altitude bands, and operational status
- Drag and zoom the animated globe to explore representative satellites around Earth
- View filtered highest-risk orbital zones and object records

Note: the globe uses real CelesTrak SATCAT satellite counts, altitude, inclination, orbit type, ownership, and status. SATCAT does not provide live latitude/longitude positions, so the moving points are representative orbital positions rather than exact real-time tracking.

Earth texture source:

```text
NASA Blue Marble / Visible Earth texture via Wikimedia Commons
https://commons.wikimedia.org/wiki/File:Land_shallow_topo_2048.jpg
```

## Data preprocessing

The pipeline performs these steps:

1. Downloads or loads `data/raw/celestrak_satcat.csv`
2. Removes duplicate NORAD catalog IDs
3. Filters to current Earth-orbiting catalog records
4. Standardizes owner, status, category, and orbit fields
5. Converts launch dates, period, inclination, apogee, perigee, and radar cross section
6. Categorizes objects as Satellite, Debris, Rocket Body, or Unknown
7. Classifies orbit shells as LEO, MEO, GEO, HEO, or Unknown
8. Calculates risk scores from orbit type, density, object category, altitude, inclination, estimated object size, and operational status
9. Writes SQL tables and Power BI export files

## Database design

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

## Suggested presentation structure

1. Problem: Earth orbit is increasingly congested by active satellites, inactive spacecraft, rocket bodies, and debris fragments.
2. Objective: identify crowded orbit regions, debris patterns, country-level satellite distribution, and high-risk zones.
3. Dataset: real CelesTrak SATCAT CSV with cataloged satellites, debris, rocket bodies, ownership, launch date, orbital period, inclination, apogee, perigee, and radar cross section.
4. Method: clean CelesTrak data with Python, store it in SQL, analyze grouped summaries, expose results through REST APIs, and visualize in a web dashboard.
5. Key output: identify high-density LEO/MEO/GEO/HEO zones and compare satellite ownership and debris risk.
6. Future work: add live GP/TLE orbit propagation, Space-Track login integration, and ML-based collision probability scoring.

## Refreshing the real data

Run:

```powershell
python src\download_data.py
python src\pipeline.py
```

The database, API responses, dashboard, and Power BI export will refresh automatically.
