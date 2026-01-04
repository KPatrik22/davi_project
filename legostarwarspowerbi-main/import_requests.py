import requests
import time
import pandas as pd
import os

# ========= CONFIG =========
API_KEY = "feeaa022-26f3-4159-8d28-b05265d0e1cb"  # <-- replace locally, don't commit
USER_AGENT = "Barnis-Lego-Script/1.0"
BASE_URL = "https://www.brickeconomy.com/api/v1/set/"

INPUT_CSV = "sets.csv"
OUTPUT_CSV = "brickeconomy_starwars_eur.csv"

THEME_ID = 158          # Star Wars
MAX_SETS_TO_QUERY = 95  # per run (because of 100-requests/day limit)
SLEEP_SECONDS = 0.5
# =========================


def get_set_data(set_num: str):
    """
    Call BrickEconomy API for one set, in EUR.
    Return JSON 'data' node or None.
    """
    url = f"{BASE_URL}{set_num}?currency=EUR"
    headers = {
        "accept": "application/json",
        "x-apikey": API_KEY,
        "User-Agent": USER_AGENT,
    }

    resp = requests.get(url, headers=headers)

    if resp.status_code == 404:
        print(f"[{set_num}] Not found (404), skipping.")
        return None
    if resp.status_code == 400:
        print(f"[{set_num}] Bad request (400) – probably invalid set id for BrickEconomy, skipping.")
        return None
    if resp.status_code == 429:
        print(f"[{set_num}] Rate limit hit (429). Stop run and try again tomorrow.")
        raise RuntimeError("Rate limit exceeded")
    resp.raise_for_status()

    payload = resp.json()
    return payload.get("data")


def load_set_numbers_to_fetch():
    """
    Read sets.csv, filter theme_id == THEME_ID.

    Logic:
      - If OUTPUT_CSV does NOT exist or is empty: start at the beginning
      - If OUTPUT_CSV exists:
          * read the LAST set_num in that file
          * find that set_num in the Star Wars subset of sets.csv
          * remove EVERYTHING before (and including) that row
          * continue from the next row forward

    This way progress is purely sequential based on the order in sets.csv.
    """
    # Load full input
    sets_df = pd.read_csv(INPUT_CSV)

    if "set_num" not in sets_df.columns:
        raise ValueError("Expected a 'set_num' column in sets.csv")
    if "theme_id" not in sets_df.columns:
        raise ValueError("Expected a 'theme_id' column in sets.csv")

    # Filter Star Wars sets and keep their original order
    sw_df = sets_df[sets_df["theme_id"] == THEME_ID].copy()
    sw_df = sw_df.reset_index(drop=True)

    # Default: start from the beginning
    start_idx = -1
    last_set_num = None

    # If we already have an output file, use the LAST set_num in it
    if os.path.exists(OUTPUT_CSV) and os.path.getsize(OUTPUT_CSV) > 0:
        existing = pd.read_csv(OUTPUT_CSV, usecols=["set_num"])
        if not existing.empty:
            last_set_num = str(existing["set_num"].iloc[-1])
            print(f"Last set in {OUTPUT_CSV}: {last_set_num}")

            # Find this set in the Star Wars list
            sw_df["set_num_str"] = sw_df["set_num"].astype(str)
            matches = sw_df.index[sw_df["set_num_str"] == last_set_num].tolist()

            if matches:
                # use the last occurrence in case of duplicates
                start_idx = matches[-1]
                print(f"Found last set at index {start_idx} in sets.csv Star Wars slice.")
            else:
                print(
                    "Warning: last set_num from output not found in Star Wars list. "
                    "Starting from the beginning."
                )

    if last_set_num is None:
        print("No previous output or empty output file. Starting from the beginning.")

    # Take everything *after* the last processed set
    remaining_df = sw_df.iloc[start_idx + 1 :]
    remaining_list = remaining_df["set_num"].astype(str).tolist()

    print(f"{len(remaining_list)} Star Wars sets remaining to fetch (sequential from last output).")
    return remaining_list


def build_rows_for_set_data(data):
    """
    Take the 'data' dict for one set from the API and
    return a list of rows (dicts) to append to the CSV.
    One row per price event (new/used). If no events, one row with empty event fields.
    """
    rows = []

    # ----- Common metadata fields (one per set) -----
    set_number = data.get("set_number")
    retired = data.get("retired")
    name = data.get("name")
    theme = data.get("theme")
    subtheme = data.get("subtheme")
    year = data.get("year")
    pieces_count = data.get("pieces_count")
    minifigs_count = data.get("minifigs_count")
    minifigs_list = data.get("minifigs", []) or []
    minifigs = ",".join(minifigs_list)

    availability = data.get("availability")
    retail_price_us = data.get("retail_price_us")
    retail_price_uk = data.get("retail_price_uk")
    retail_price_ca = data.get("retail_price_ca")
    retail_price_eu = data.get("retail_price_eu")
    retail_price_au = data.get("retail_price_au")

    ean = data.get("ean")
    upc = data.get("upc")
    released_date = data.get("released_date")
    retired_date = data.get("retired_date")

    current_value_new = data.get("current_value_new")
    current_value_used = data.get("current_value_used")
    current_value_used_low = data.get("current_value_used_low")
    current_value_used_high = data.get("current_value_used_high")
    forecast_value_new_2_years = data.get("forecast_value_new_2_years")
    forecast_value_new_5_years = data.get("forecast_value_new_5_years")
    rolling_growth_lastyear = data.get("rolling_growth_lastyear")
    rolling_growth_12months = data.get("rolling_growth_12months")
    currency = data.get("currency")

    price_events_new = data.get("price_events_new", []) or []
    price_events_used = data.get("price_events_used", []) or []

    # If no events at all, still keep one row
    if not price_events_new and not price_events_used:
        rows.append(
            {
                "set_num": set_number,
                "name": name,
                "theme": theme,
                "subtheme": subtheme,
                "year": year,
                "pieces_count": pieces_count,
                "minifigs_count": minifigs_count,
                "minifigs": minifigs,
                "availability": availability,
                "retail_price_us": retail_price_us,
                "retail_price_uk": retail_price_uk,
                "retail_price_ca": retail_price_ca,
                "retail_price_eu": retail_price_eu,
                "retail_price_au": retail_price_au,
                "ean": ean,
                "upc": upc,
                "released_date": released_date,
                "retired_date": retired_date,
                "retired": retired,
                "current_value_new": current_value_new,
                "current_value_used": current_value_used,
                "current_value_used_low": current_value_used_low,
                "current_value_used_high": current_value_used_high,
                "forecast_value_new_2_years": forecast_value_new_2_years,
                "forecast_value_new_5_years": forecast_value_new_5_years,
                "rolling_growth_lastyear": rolling_growth_lastyear,
                "rolling_growth_12months": rolling_growth_12months,
                "currency": currency,
                "event_condition": None,
                "event_date": None,
                "event_value": None,
            }
        )
        return rows

    # Rows for NEW events
    for ev in price_events_new:
        rows.append(
            {
                "set_num": set_number,
                "name": name,
                "theme": theme,
                "subtheme": subtheme,
                "year": year,
                "pieces_count": pieces_count,
                "minifigs_count": minifigs_count,
                "minifigs": minifigs,
                "availability": availability,
                "retail_price_us": retail_price_us,
                "retail_price_uk": retail_price_uk,
                "retail_price_ca": retail_price_ca,
                "retail_price_eu": retail_price_eu,
                "retail_price_au": retail_price_au,
                "ean": ean,
                "upc": upc,
                "released_date": released_date,
                "retired_date": retired_date,
                "retired": retired,
                "current_value_new": current_value_new,
                "current_value_used": current_value_used,
                "current_value_used_low": current_value_used_low,
                "current_value_used_high": current_value_used_high,
                "forecast_value_new_2_years": forecast_value_new_2_years,
                "forecast_value_new_5_years": forecast_value_new_5_years,
                "rolling_growth_lastyear": rolling_growth_lastyear,
                "rolling_growth_12months": rolling_growth_12months,
                "currency": currency,
                "event_condition": "new",
                "event_date": ev.get("date"),
                "event_value": ev.get("value"),
            }
        )

    # Rows for USED events
    for ev in price_events_used:
        rows.append(
            {
                "set_num": set_number,
                "name": name,
                "theme": theme,
                "subtheme": subtheme,
                "year": year,
                "pieces_count": pieces_count,
                "minifigs_count": minifigs_count,
                "minifigs": minifigs,
                "availability": availability,
                "retail_price_us": retail_price_us,
                "retail_price_uk": retail_price_uk,
                "retail_price_ca": retail_price_ca,
                "retail_price_eu": retail_price_eu,
                "retail_price_au": retail_price_au,
                "ean": ean,
                "upc": upc,
                "released_date": released_date,
                "retired_date": retired_date,
                "retired": retired,
                "current_value_new": current_value_new,
                "current_value_used": current_value_used,
                "current_value_used_low": current_value_used_low,
                "current_value_used_high": current_value_used_high,
                "forecast_value_new_2_years": forecast_value_new_2_years,
                "forecast_value_new_5_years": forecast_value_new_5_years,
                "rolling_growth_lastyear": rolling_growth_lastyear,
                "rolling_growth_12months": rolling_growth_12months,
                "currency": currency,
                "event_condition": "used",
                "event_date": ev.get("date"),
                "event_value": ev.get("value"),
            }
        )

    return rows


def main():
    # 1) Figure out which sets to fetch in this run (sequential)
    remaining_set_nums = load_set_numbers_to_fetch()

    if not remaining_set_nums:
        print("No Star Wars sets left to fetch. 🎉")
        return

    # Only take the first N for today
    today_set_nums = remaining_set_nums[:MAX_SETS_TO_QUERY]
    print(f"Fetching {len(today_set_nums)} sets in this run.")

    all_rows = []

    for i, set_num in enumerate(today_set_nums):
        print(f"[{i+1}/{len(today_set_nums)}] Fetching {set_num} ...")

        try:
            data = get_set_data(set_num)
        except RuntimeError:
            # Rate limit reached
            break

        if not data:
            continue

        rows_for_set = build_rows_for_set_data(data)
        all_rows.extend(rows_for_set)

        time.sleep(SLEEP_SECONDS)

    if not all_rows:
        print("No new data collected in this run.")
        return

    new_df = pd.DataFrame(all_rows)
    new_df.sort_values(["set_num", "event_condition", "event_date"], inplace=True)

    # Append or create file
    if os.path.exists(OUTPUT_CSV):
        # Append without header
        new_df.to_csv(OUTPUT_CSV, mode="a", header=False, index=False, encoding="utf-8")
    else:
        # First time: write with header
        new_df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8")

    print(f"Appended {len(new_df)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
