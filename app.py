from __future__ import annotations

import os
import sqlite3

from flask import Flask, jsonify, render_template, request

from src.pipeline import DB_PATH, build_database, database_is_stale, download_celestrak_satcat


app = Flask(__name__)


def ensure_database() -> None:
    if database_is_stale():
        build_database()


def rows_from_query(query: str, params: tuple = ()) -> list[dict]:
    ensure_database()
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        return [dict(row) for row in connection.execute(query, params).fetchall()]


def one_from_query(query: str, params: tuple = ()) -> dict:
    ensure_database()
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(query, params).fetchone()
        return dict(row) if row else {}


def filtered_where_clause() -> tuple[str, list[str]]:
    filters: list[str] = []
    params: list[str] = []

    exact_filters = {
        "orbit_type": "orbit_type",
        "object_category": "object_category",
        "risk_level": "risk_level",
        "status": "status",
        "country": "country",
    }
    for query_key, column in exact_filters.items():
        value = request.args.get(query_key, "").strip()
        if value and value.lower() != "all":
            filters.append(f"{column} = ?")
            params.append(value)

    search = request.args.get("q", "").strip()
    if search:
        filters.append("(name LIKE ? OR object_id LIKE ? OR international_designator LIKE ?)")
        like_search = f"%{search}%"
        params.extend([like_search, like_search, like_search])

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    return where_clause, params


def satellite_where_clause() -> tuple[str, list[str]]:
    where_clause, params = filtered_where_clause()
    if where_clause:
        return f"{where_clause} AND object_category = ?", [*params, "Satellite"]
    return "WHERE object_category = ?", ["Satellite"]


def filtered_rows(query: str, params: list[str]) -> list[dict]:
    ensure_database()
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        return [dict(row) for row in connection.execute(query, params).fetchall()]


def filtered_one(query: str, params: list[str]) -> dict:
    ensure_database()
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(query, params).fetchone()
        return dict(row) if row else {}


@app.route("/")
def dashboard():
    return render_template("index.html")


@app.route("/api/summary")
def summary():
    totals = one_from_query(
        """
        SELECT
            COUNT(*) AS total_objects,
            SUM(CASE WHEN object_category = 'Satellite' THEN 1 ELSE 0 END) AS satellites,
            SUM(CASE WHEN object_category IN ('Debris', 'Rocket Body') THEN 1 ELSE 0 END) AS debris,
            ROUND(AVG(risk_score), 1) AS average_risk
        FROM orbital_objects
        """
    )
    metadata = one_from_query("SELECT * FROM dataset_metadata LIMIT 1")
    high_risk = one_from_query(
        """
        SELECT orbit_type, longitude_sector, average_risk, object_count
        FROM risk_zones
        ORDER BY average_risk DESC, object_count DESC
        LIMIT 1
        """
    )
    totals["highest_risk_zone"] = high_risk
    totals["dataset"] = metadata
    return jsonify(totals)


@app.route("/api/options")
def options():
    return jsonify(
        {
            "orbit_types": [row["orbit_type"] for row in rows_from_query(
                "SELECT DISTINCT orbit_type FROM orbital_objects ORDER BY orbit_type"
            )],
            "object_categories": [row["object_category"] for row in rows_from_query(
                "SELECT DISTINCT object_category FROM orbital_objects ORDER BY object_category"
            )],
            "risk_levels": [row["risk_level"] for row in rows_from_query(
                "SELECT DISTINCT risk_level FROM orbital_objects ORDER BY risk_level"
            )],
            "statuses": [row["status"] for row in rows_from_query(
                "SELECT DISTINCT status FROM orbital_objects ORDER BY status"
            )],
            "countries": [row["country"] for row in rows_from_query(
                """
                SELECT country
                FROM orbital_objects
                GROUP BY country
                ORDER BY COUNT(*) DESC, country
                LIMIT 180
                """
            )],
        }
    )


@app.route("/api/dashboard-data")
def dashboard_data():
    where_clause, params = filtered_where_clause()
    metadata = one_from_query("SELECT * FROM dataset_metadata LIMIT 1")

    summary_query = f"""
        SELECT
            COUNT(*) AS total_objects,
            SUM(CASE WHEN object_category = 'Satellite' THEN 1 ELSE 0 END) AS satellites,
            SUM(CASE WHEN object_category IN ('Debris', 'Rocket Body') THEN 1 ELSE 0 END) AS debris,
            ROUND(AVG(risk_score), 1) AS average_risk
        FROM orbital_objects
        {where_clause}
    """
    totals = filtered_one(summary_query, params)

    orbit_stats = filtered_rows(
        f"""
        SELECT orbit_type,
               COUNT(*) AS total_objects,
               ROUND(AVG(risk_score), 1) AS average_risk,
               SUM(CASE WHEN object_category IN ('Debris', 'Rocket Body') THEN 1 ELSE 0 END) AS debris_count
        FROM orbital_objects
        {where_clause}
        GROUP BY orbit_type
        ORDER BY total_objects DESC
        """,
        params,
    )

    category_stats = filtered_rows(
        f"""
        SELECT object_category, COUNT(*) AS total_objects, ROUND(AVG(risk_score), 1) AS average_risk
        FROM orbital_objects
        {where_clause}
        GROUP BY object_category
        ORDER BY total_objects DESC
        """,
        params,
    )

    country_stats = filtered_rows(
        f"""
        SELECT country,
               COUNT(*) AS objects,
               SUM(CASE WHEN object_category = 'Satellite' THEN 1 ELSE 0 END) AS satellites,
               SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_objects,
               ROUND(AVG(risk_score), 1) AS average_risk
        FROM orbital_objects
        {where_clause}
        GROUP BY country
        ORDER BY objects DESC, country
        LIMIT 12
        """,
        params,
    )

    growth_rows = filtered_rows(
        f"""
        SELECT launch_year, object_category, COUNT(*) AS objects_added
        FROM orbital_objects
        {where_clause}
        {"AND" if where_clause else "WHERE"} launch_year > 0
        GROUP BY launch_year, object_category
        ORDER BY launch_year
        """,
        params,
    )
    cumulative_by_year: dict[int, int] = {}
    for row in growth_rows:
        year = int(row["launch_year"])
        cumulative_by_year[year] = cumulative_by_year.get(year, 0) + int(row["objects_added"])
    running_total = 0
    cumulative_lookup: dict[int, int] = {}
    for year in sorted(cumulative_by_year):
        running_total += cumulative_by_year[year]
        cumulative_lookup[year] = running_total
    for row in growth_rows:
        row["cumulative_objects"] = cumulative_lookup[int(row["launch_year"])]

    risk_zones = filtered_rows(
        f"""
        SELECT orbit_type,
               longitude_sector,
               COUNT(*) AS object_count,
               ROUND(AVG(risk_score), 1) AS average_risk,
               SUM(CASE WHEN risk_level = 'High' THEN 1 ELSE 0 END) AS high_risk_objects,
               ROUND(AVG(altitude_km), 0) AS average_altitude_km
        FROM orbital_objects
        {where_clause}
        GROUP BY orbit_type, longitude_sector
        ORDER BY average_risk DESC, object_count DESC
        LIMIT 12
        """,
        params,
    )

    altitude_bins = filtered_rows(
        f"""
        SELECT
            CASE
                WHEN altitude_km < 500 THEN 'Below 500 km'
                WHEN altitude_km < 1000 THEN '500-999 km'
                WHEN altitude_km < 2000 THEN '1,000-1,999 km'
                WHEN altitude_km < 10000 THEN '2,000-9,999 km'
                WHEN altitude_km < 30000 THEN '10,000-29,999 km'
                ELSE '30,000+ km'
            END AS altitude_band,
            COUNT(*) AS total_objects,
            ROUND(AVG(risk_score), 1) AS average_risk
        FROM orbital_objects
        {where_clause}
        GROUP BY altitude_band
        ORDER BY MIN(altitude_km)
        """,
        params,
    )

    status_stats = filtered_rows(
        f"""
        SELECT status, COUNT(*) AS total_objects
        FROM orbital_objects
        {where_clause}
        GROUP BY status
        ORDER BY total_objects DESC
        """,
        params,
    )

    objects = filtered_rows(
        f"""
        SELECT object_id, name, object_category, country, orbit_type, launch_date,
               status, altitude_km, inclination_deg, longitude_sector,
               risk_score, risk_level
        FROM orbital_objects
        {where_clause}
        ORDER BY risk_score DESC, altitude_km DESC
        LIMIT 200
        """,
        params,
    )

    totals["average_risk"] = totals["average_risk"] or 0
    totals["highest_risk_zone"] = risk_zones[0] if risk_zones else {}
    totals["dataset"] = metadata

    return jsonify(
        {
            "summary": totals,
            "orbit_stats": orbit_stats,
            "category_stats": category_stats,
            "country_stats": country_stats,
            "growth_trends": growth_rows,
            "risk_zones": risk_zones,
            "altitude_bins": altitude_bins,
            "status_stats": status_stats,
            "objects": objects,
        }
    )


@app.route("/api/globe-data")
def globe_data():
    where_clause, params = satellite_where_clause()
    max_points = request.args.get("max_points", "9000")
    try:
        max_points_int = int(max_points)
    except ValueError:
        max_points_int = 9000
    max_points_int = max(500, min(max_points_int, 12000))
    summary = filtered_one(
        f"""
        SELECT
            COUNT(*) AS satellite_count,
            SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_satellites,
            ROUND(AVG(altitude_km), 0) AS average_altitude_km,
            ROUND(AVG(inclination_deg), 1) AS average_inclination_deg
        FROM orbital_objects
        {where_clause}
        """,
        params,
    )
    orbit_counts = filtered_rows(
        f"""
        SELECT orbit_type,
               COUNT(*) AS satellite_count,
               SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_satellites,
               ROUND(AVG(altitude_km), 0) AS average_altitude_km
        FROM orbital_objects
        {where_clause}
        GROUP BY orbit_type
        ORDER BY satellite_count DESC
        """,
        params,
    )
    satellites = filtered_rows(
        f"""
        SELECT object_id, name, country, orbit_type, status,
               altitude_km, inclination_deg, risk_score, risk_level
        FROM orbital_objects
        {where_clause}
        ORDER BY
            CASE WHEN status = 'Active' THEN 0 ELSE 1 END,
            risk_score DESC,
            object_id
        LIMIT ?
        """,
        [*params, max_points_int],
    )
    return jsonify(
        {
            "summary": summary,
            "orbit_counts": orbit_counts,
            "satellites": satellites,
            "rendered_points": len(satellites),
            "note": "SATCAT provides catalog orbit attributes, not live latitude/longitude positions. Points are representative animated positions derived from altitude, inclination, orbit type, and object ID.",
        }
    )


@app.route("/api/refresh-live-data", methods=["POST"])
def refresh_live_data():
    try:
        download_celestrak_satcat()
        build_database()
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502

    metadata = one_from_query("SELECT * FROM dataset_metadata LIMIT 1")
    return jsonify({"ok": True, "dataset": metadata})


@app.route("/api/satellites")
@app.route("/satellites")
def satellites():
    return jsonify(
        rows_from_query(
            """
            SELECT object_id, name, country, orbit_type, launch_date, status,
                   altitude_km, inclination_deg, risk_score, risk_level
            FROM satellites
            ORDER BY launch_date DESC
            """
        )
    )


@app.route("/api/debris")
@app.route("/debris")
def debris():
    return jsonify(
        rows_from_query(
            """
            SELECT object_id, name, object_category, country, orbit_type, size_m,
                   altitude_km, inclination_deg, risk_score, risk_level
            FROM debris
            ORDER BY risk_score DESC
            """
        )
    )


@app.route("/api/orbit-stats")
@app.route("/orbit-stats")
def orbit_stats():
    return jsonify(rows_from_query("SELECT * FROM orbit_stats"))


@app.route("/api/country-stats")
def country_stats():
    return jsonify(rows_from_query("SELECT * FROM country_stats"))


@app.route("/api/growth-trends")
def growth_trends():
    return jsonify(rows_from_query("SELECT * FROM growth_trends ORDER BY launch_year"))


@app.route("/api/risk-analysis")
@app.route("/risk-analysis")
def risk_analysis():
    return jsonify(rows_from_query("SELECT * FROM risk_zones"))


@app.route("/api/objects")
def objects():
    return jsonify(
        rows_from_query(
            """
            SELECT object_id, name, object_category, country, orbit_type, launch_date,
                   status, size_m, altitude_km, inclination_deg, longitude_sector,
                   risk_score, risk_level
            FROM orbital_objects
            ORDER BY risk_score DESC
            """
        )
    )


if __name__ == "__main__":
    ensure_database()
    host = os.getenv("ORBITAL_HOST", "127.0.0.1")
    port = int(os.getenv("ORBITAL_PORT", os.getenv("PORT", "5000")))
    use_https = os.getenv("ORBITAL_HTTPS", "").lower() in {"1", "true", "yes", "on"}
    ssl_context = "adhoc" if use_https else None
    app.run(debug=True, host=host, port=port, ssl_context=ssl_context)
