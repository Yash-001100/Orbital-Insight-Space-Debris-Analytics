from __future__ import annotations

from pipeline import RAW_DATA, SATCAT_URL, download_celestrak_satcat


if __name__ == "__main__":
    path = download_celestrak_satcat()
    print(f"Downloaded CelesTrak SATCAT from {SATCAT_URL}")
    print(f"Saved to {path}")
