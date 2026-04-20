from __future__ import annotations

import sqlite3
import urllib.request
from math import log1p
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SATCAT_URL = "https://celestrak.org/pub/satcat.csv"
RAW_DATA = ROOT / "data" / "raw" / "celestrak_satcat.csv"
PROCESSED_DIR = ROOT / "data" / "processed"
DB_PATH = PROCESSED_DIR / "orbital_insight.db"
POWERBI_EXPORT = PROCESSED_DIR / "powerbi_orbital_dataset.csv"


COUNTRY_MAP = {
    "AB": "Arab Satellite Communications Organization",
    "ABS": "Asia Broadcast Satellite",
    "AC": "Asia Satellite Telecommunications Company",
    "AUS": "Australia",
    "CA": "Canada",
    "CIS": "Commonwealth of Independent States",
    "ESA": "European Space Agency",
    "EUTE": "Eutelsat",
    "FR": "France",
    "GER": "Germany",
    "GLOB": "Globalstar",
    "IND": "India",
    "ISRO": "Indian Space Research Organisation",
    "ITSO": "International Telecommunications Satellite Organization",
    "JPN": "Japan",
    "NATO": "North Atlantic Treaty Organization",
    "O3B": "O3b Networks",
    "ORB": "ORBCOMM",
    "PRC": "China",
    "RUS": "Russia",
    "SES": "SES",
    "TBD": "To Be Determined",
    "UK": "United Kingdom",
    "US": "United States",
    "UNK": "Unknown",
    "usa": "USA",
    "united states": "USA",
    "china": "China",
    "india": "India",
    "russia": "Russia",
    "european union": "European Union",
    "united kingdom": "United Kingdom",
}

ACTIVE_STATUS_CODES = {"+", "P", "B", "S", "X"}


def download_celestrak_satcat(path: Path = RAW_DATA) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(SATCAT_URL, path)
    return path


def load_raw_data(path: Path = RAW_DATA) -> pd.DataFrame:
    if not path.exists():
        download_celestrak_satcat(path)
    return pd.read_csv(path)


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    if {"OBJECT_NAME", "NORAD_CAT_ID", "OBJECT_TYPE"}.issubset(df.columns):
        return clean_celestrak_satcat(df)

    df = df.copy()
    df.columns = [column.strip().lower() for column in df.columns]
    df = df.drop_duplicates(subset=["object_id"])

    text_columns = [
        "name",
        "object_category",
        "country",
        "orbit_type",
        "status",
        "longitude_sector",
    ]
    for column in text_columns:
        df[column] = df[column].fillna("Unknown").astype(str).str.strip()

    df["country"] = (
        df["country"]
        .str.lower()
        .map(COUNTRY_MAP)
        .fillna(df["country"].str.title())
    )
    df["orbit_type"] = df["orbit_type"].str.upper()
    df["object_category"] = df["object_category"].str.title()
    df["status"] = df["status"].str.title()
    df["launch_date"] = pd.to_datetime(df["launch_date"], errors="coerce")

    for column in ["size_m", "altitude_km", "inclination_deg"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")
        df[column] = df[column].fillna(df[column].median())

    df["launch_year"] = df["launch_date"].dt.year.fillna(0).astype(int)
    return df


def clean_celestrak_satcat(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [column.strip().upper() for column in df.columns]
    df = df.drop_duplicates(subset=["NORAD_CAT_ID"])

    # Congestion analysis should focus on cataloged objects still orbiting Earth.
    df = df[df["ORBIT_CENTER"].eq("EA") & df["ORBIT_TYPE"].eq("ORB")].copy()

    for column in ["PERIOD", "INCLINATION", "APOGEE", "PERIGEE", "RCS"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df["average_altitude_km"] = df[["APOGEE", "PERIGEE"]].mean(axis=1)
    df["average_altitude_km"] = df["average_altitude_km"].fillna(df["average_altitude_km"].median())
    df["INCLINATION"] = df["INCLINATION"].fillna(df["INCLINATION"].median())
    df["RCS"] = df["RCS"].fillna(df.groupby("OBJECT_TYPE")["RCS"].transform("median"))
    df["RCS"] = df["RCS"].fillna(df["RCS"].median()).clip(lower=0)

    cleaned = pd.DataFrame(
        {
            "object_id": df["NORAD_CAT_ID"].astype(str),
            "name": df["OBJECT_NAME"].fillna("Unknown Object").astype(str).str.strip(),
            "object_category": df["OBJECT_TYPE"].map(
                {
                    "PAY": "Satellite",
                    "DEB": "Debris",
                    "R/B": "Rocket Body",
                    "UNK": "Unknown",
                }
            ).fillna("Unknown"),
            "country": df["OWNER"].fillna("UNK").astype(str).str.strip().map(COUNTRY_MAP).fillna(df["OWNER"]),
            "orbit_type": df.apply(classify_orbit_type, axis=1),
            "launch_date": pd.to_datetime(df["LAUNCH_DATE"], errors="coerce"),
            "status": df["OPS_STATUS_CODE"].fillna("?").astype(str).str.strip().apply(status_label),
            "size_m": df["RCS"].pow(0.5).round(3),
            "altitude_km": df["average_altitude_km"].round(1),
            "inclination_deg": df["INCLINATION"].round(2),
            "longitude_sector": df["INCLINATION"].apply(classify_inclination_band),
            "apogee_km": df["APOGEE"],
            "perigee_km": df["PERIGEE"],
            "period_min": df["PERIOD"],
            "radar_cross_section_m2": df["RCS"],
            "source_owner_code": df["OWNER"].fillna("UNK"),
            "ops_status_code": df["OPS_STATUS_CODE"].fillna("?"),
            "international_designator": df["OBJECT_ID"],
        }
    )
    cleaned["launch_year"] = cleaned["launch_date"].dt.year.fillna(0).astype(int)
    return cleaned


def classify_orbit_type(row: pd.Series) -> str:
    altitude = row.get("average_altitude_km")
    apogee = row.get("APOGEE")
    perigee = row.get("PERIGEE")
    period = row.get("PERIOD")

    if pd.notna(apogee) and pd.notna(perigee) and abs(apogee - perigee) > 10000:
        return "HEO"
    if pd.notna(altitude):
        if altitude < 2000:
            return "LEO"
        if altitude < 30000:
            return "MEO"
        if 30000 <= altitude <= 40000:
            return "GEO"
        return "HEO"
    if pd.notna(period):
        if period < 128:
            return "LEO"
        if period < 1000:
            return "MEO"
        if period < 1600:
            return "GEO"
    return "Unknown"


def classify_inclination_band(inclination: float) -> str:
    if pd.isna(inclination):
        return "Unknown Inclination"
    if inclination <= 15:
        return "Equatorial"
    if inclination <= 65:
        return "Mid-Inclination"
    if inclination <= 105:
        return "Polar/SSO"
    return "Retrograde"


def status_label(code: str) -> str:
    if code in ACTIVE_STATUS_CODES:
        return "Active"
    if code == "D":
        return "Decayed"
    if code == "?":
        return "Unknown"
    return "Inactive"


def score_risk(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    orbit_base = {"LEO": 20, "MEO": 12, "GEO": 15, "HEO": 16}
    category_factor = {"Satellite": 3, "Debris": 15, "Rocket Body": 10, "Unknown": 8}

    density = df.groupby(["orbit_type", "longitude_sector"])["object_id"].transform("count")
    density_factor = density.clip(upper=5000).apply(lambda value: log1p(value) * 3.2)
    df["risk_score"] = (
        df["orbit_type"].map(orbit_base).fillna(15)
        + df["object_category"].map(category_factor).fillna(8)
        + density_factor
        + df["size_m"].clip(upper=8) * 1.4
    )

    crowded_leo = (
        df["orbit_type"].eq("LEO")
        & df["altitude_km"].between(700, 1000)
        & df["inclination_deg"].between(80, 105)
    )
    operational_shell = (
        df["orbit_type"].eq("LEO")
        & df["altitude_km"].between(500, 600)
        & df["inclination_deg"].between(45, 60)
    )
    graveyard_sensitive_geo = df["orbit_type"].eq("GEO") & df["altitude_km"].between(35000, 36050)

    df.loc[crowded_leo, "risk_score"] += 8
    df.loc[operational_shell, "risk_score"] += 6
    df.loc[graveyard_sensitive_geo, "risk_score"] += 4
    df.loc[df["status"].isin(["Inactive", "Unknown"]), "risk_score"] += 3

    df["risk_score"] = df["risk_score"].clip(lower=0, upper=100).round(1)
    df["risk_level"] = pd.cut(
        df["risk_score"],
        bins=[-1, 44.9, 69.9, 100],
        labels=["Low", "Medium", "High"],
    ).astype(str)
    return df


def build_summary_tables(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    orbit_stats = (
        df.groupby("orbit_type")
        .agg(
            total_objects=("object_id", "count"),
            average_risk=("risk_score", "mean"),
            debris_count=("object_category", lambda values: values.isin(["Debris", "Rocket Body"]).sum()),
        )
        .reset_index()
        .round({"average_risk": 1})
        .sort_values("total_objects", ascending=False)
    )

    country_stats = (
        df[df["object_category"].eq("Satellite")]
        .groupby("country")
        .agg(
            satellites=("object_id", "count"),
            active_satellites=("status", lambda values: values.eq("Active").sum()),
            average_risk=("risk_score", "mean"),
        )
        .reset_index()
        .round({"average_risk": 1})
        .sort_values(["satellites", "active_satellites"], ascending=False)
    )

    growth_trends = (
        df[df["launch_year"].gt(0)]
        .groupby(["launch_year", "object_category"])
        .size()
        .reset_index(name="objects_added")
        .sort_values("launch_year")
    )
    total_by_year = (
        df[df["launch_year"].gt(0)]
        .groupby("launch_year")
        .size()
        .cumsum()
        .reset_index(name="cumulative_objects")
    )
    growth_trends = growth_trends.merge(total_by_year, on="launch_year", how="left")

    risk_zones = (
        df.groupby(["orbit_type", "longitude_sector"])
        .agg(
            object_count=("object_id", "count"),
            average_risk=("risk_score", "mean"),
            high_risk_objects=("risk_level", lambda values: values.eq("High").sum()),
            average_altitude_km=("altitude_km", "mean"),
        )
        .reset_index()
        .round({"average_risk": 1, "average_altitude_km": 0})
        .sort_values(["average_risk", "object_count"], ascending=False)
    )

    return {
        "orbit_stats": orbit_stats,
        "country_stats": country_stats,
        "growth_trends": growth_trends,
        "risk_zones": risk_zones,
    }


def build_database() -> Path:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    raw = load_raw_data()
    cleaned = score_risk(clean_data(raw))
    summaries = build_summary_tables(cleaned)

    export = cleaned.copy()
    export["launch_date"] = export["launch_date"].dt.strftime("%Y-%m-%d")
    export.to_csv(POWERBI_EXPORT, index=False)

    with sqlite3.connect(DB_PATH) as connection:
        pd.DataFrame(
            [
                {
                    "source_name": "CelesTrak SATCAT",
                    "source_url": SATCAT_URL,
                    "raw_records": len(raw),
                    "dashboard_records": len(export),
                    "generated_at": pd.Timestamp.utcnow().isoformat(),
                }
            ]
        ).to_sql("dataset_metadata", connection, if_exists="replace", index=False)
        export.to_sql("orbital_objects", connection, if_exists="replace", index=False)
        export[export["object_category"].eq("Satellite")].to_sql(
            "satellites", connection, if_exists="replace", index=False
        )
        export[export["object_category"].isin(["Debris", "Rocket Body"])].to_sql(
            "debris", connection, if_exists="replace", index=False
        )
        for table_name, table in summaries.items():
            table.to_sql(table_name, connection, if_exists="replace", index=False)

    return DB_PATH


def database_is_stale() -> bool:
    if not DB_PATH.exists():
        return True
    if not RAW_DATA.exists():
        return True
    return RAW_DATA.stat().st_mtime > DB_PATH.stat().st_mtime


if __name__ == "__main__":
    path = build_database()
    print(f"Built database at {path}")
