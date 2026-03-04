#!/usr/bin/env python3
"""
Generate public/data/2026.json and public/data/landings_5y.json from xlsx source.

Rules:
- Build fish/species from almost all brand codes in source data.
- percentile is defined as 5-year average annual share (%), quantized to 2 decimals and sum must be 100.00.
- featured fish are selected by separate score (low share + high growth + seasonality).
- negative monthly values are clamped to 0.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
import xml.etree.ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"a": MAIN_NS}

# Aggregate buckets to exclude from fish list.
EXCLUDED_BRAND_CODES = {
    "49000",  # fish total bucket
    "50000",  # whale total bucket
    "60000",  # squid total bucket
    "64000",  # octopus total bucket
    "74000",  # shell total bucket
    "75000",  # shrimp/crab total bucket
    "99000",  # seaweed total bucket
    "99800",  # other bucket
}


def col_to_num(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def parse_float(value: str) -> float:
    text = str(value).strip() if value is not None else ""
    if text == "":
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def non_negative(value: float) -> float:
    return value if value > 0 else 0.0


def normalize_name(name: str) -> str:
    return unicodedata.normalize("NFKC", name).strip()


def normalize_number(value: float) -> int | float:
    value = non_negative(value)
    if abs(value - round(value)) < 1e-9:
        return int(round(value))
    return round(value, 3)


def read_shared_strings(zf: zipfile.ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings: List[str] = []
    for si in root.findall("a:si", NS):
        strings.append("".join((t.text or "") for t in si.findall(".//a:t", NS)))
    return strings


def find_target_sheet_path(zf: zipfile.ZipFile, preferred_name: str = "水揚げデータ") -> str:
    wb_root = ET.fromstring(zf.read("xl/workbook.xml"))
    rel_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rel_root}

    sheet_items: List[Tuple[str, str]] = []
    for sheet in wb_root.findall("a:sheets/a:sheet", {"a": MAIN_NS}):
        name = sheet.attrib.get("name", "")
        rid = sheet.attrib.get(f"{{{REL_NS}}}id", "")
        target = rel_map.get(rid, "")
        if target.startswith("worksheets/"):
            sheet_items.append((name, f"xl/{target}"))

    if not sheet_items:
        raise RuntimeError("No worksheet found in workbook")

    for name, path in sheet_items:
        if name == preferred_name:
            return path
    return sheet_items[0][1]


def cell_value(cell: ET.Element, shared_strings: List[str]) -> str:
    ctype = cell.attrib.get("t")
    if ctype == "inlineStr":
        node = cell.find("a:is/a:t", NS)
        return node.text if node is not None and node.text is not None else ""

    vnode = cell.find("a:v", NS)
    if vnode is None or vnode.text is None:
        return ""

    value = vnode.text
    if ctype == "s":
        try:
            return shared_strings[int(value)]
        except (ValueError, IndexError):
            return ""
    return value


def iter_sheet_rows(
    zf: zipfile.ZipFile, sheet_path: str, shared_strings: List[str]
) -> Iterable[Dict[int, str]]:
    ref_re = re.compile(r"([A-Z]+)(\d+)")
    with zf.open(sheet_path) as fp:
        events = ET.iterparse(fp, events=("end",))
        for event, elem in events:
            if event != "end" or elem.tag != f"{{{MAIN_NS}}}row":
                continue
            row_data: Dict[int, str] = {}
            for cell in elem.findall(f"{{{MAIN_NS}}}c"):
                ref = cell.attrib.get("r", "")
                m = ref_re.match(ref)
                if not m:
                    continue
                row_data[col_to_num(m.group(1))] = cell_value(cell, shared_strings)
            yield row_data
            elem.clear()


def make_fish_id(brand_code: str) -> str:
    return f"brand_{brand_code}"


@dataclass
class FishMetric:
    fish_id: str
    name: str
    avg_yearly_total: float
    latest_total: float
    prev_total: float
    growth: float
    seasonality: float
    peak_month: int


def aggregate_by_brand(xlsx_path: Path) -> Tuple[Dict[str, str], Dict[str, Dict[int, Dict[int, float]]], List[int]]:
    monthly_sum: Dict[str, Dict[int, Dict[int, float]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(float))
    )
    brand_name_by_code: Dict[str, str] = {}
    years: set[int] = set()

    with zipfile.ZipFile(xlsx_path) as zf:
        shared_strings = read_shared_strings(zf)
        sheet_path = find_target_sheet_path(zf)
        rows = iter_sheet_rows(zf, sheet_path, shared_strings)

        _header = next(rows, None)
        for row in rows:
            # A=1 year, F=6 brand code, G=7 brand name, H-S=8..19 monthly quantity
            code = row.get(6, "").strip()
            name = row.get(7, "").strip()
            if not code or code in EXCLUDED_BRAND_CODES:
                continue

            ytxt = row.get(1, "")
            try:
                year = int(float(ytxt))
            except ValueError:
                continue

            years.add(year)
            brand_name_by_code[code] = name

            for month in range(1, 13):
                col = 7 + month
                value = parse_float(row.get(col, "0"))
                if value == 0:
                    continue
                monthly_sum[code][year][month] += value

    if not years:
        raise RuntimeError("No usable records found in source xlsx")

    return brand_name_by_code, monthly_sum, sorted(years)


def allocate_percentile_to_100(raw_percent: Dict[str, float]) -> Dict[str, float]:
    scale = 100  # keep 2 decimal places
    target = 100 * scale
    floors: Dict[str, int] = {}
    fracs: List[Tuple[str, float]] = []
    for fid, p in raw_percent.items():
        scaled = p * scale
        f = math.floor(scaled)
        floors[fid] = f
        fracs.append((fid, scaled - f))

    remain = target - sum(floors.values())
    if remain > 0:
        fracs.sort(key=lambda x: x[1], reverse=True)
        for i in range(remain):
            floors[fracs[i][0]] += 1
    elif remain < 0:
        fracs.sort(key=lambda x: x[1])
        for i in range(-remain):
            floors[fracs[i][0]] -= 1
    return {fid: round(value / scale, 2) for fid, value in floors.items()}


def build_landings_json(
    fish_ids: List[str],
    fish_name_by_id: Dict[str, str],
    monthly_sum_by_fish: Dict[str, Dict[int, Dict[int, float]]],
    range_years: List[int],
) -> Dict[str, Any]:
    species: List[Dict[str, Any]] = []
    for fish_id in fish_ids:
        records: List[Dict[str, Any]] = []
        for year in range_years:
            for month in range(1, 13):
                value = non_negative(monthly_sum_by_fish[fish_id][year][month])
                records.append({"year": year, "m": month, "value": normalize_number(value)})
        species.append({"id": fish_id, "name_ja": fish_name_by_id[fish_id], "monthly": records})

    return {
        "meta": {
            "range_years": range_years,
            "unit": "kg",
            "updated_at": f"{range_years[-1]}-12-31",
        },
        "species": species,
    }


def build_metrics(
    fish_ids: List[str],
    fish_name_by_id: Dict[str, str],
    monthly_sum_by_fish: Dict[str, Dict[int, Dict[int, float]]],
    range_years: List[int],
) -> List[FishMetric]:
    latest = range_years[-1]
    prev = range_years[-2] if len(range_years) >= 2 else latest
    metrics: List[FishMetric] = []

    for fish_id in fish_ids:
        yearly_totals: List[float] = []
        for year in range_years:
            total = sum(monthly_sum_by_fish[fish_id][year][m] for m in range(1, 13))
            yearly_totals.append(non_negative(total))

        avg_yearly_total = non_negative(sum(yearly_totals) / max(1, len(yearly_totals)))
        latest_total = non_negative(sum(monthly_sum_by_fish[fish_id][latest][m] for m in range(1, 13)))
        prev_total = non_negative(sum(monthly_sum_by_fish[fish_id][prev][m] for m in range(1, 13)))

        growth = (latest_total - prev_total) / prev_total if prev_total > 0 else (1.0 if latest_total > 0 else 0.0)

        avg_month = [
            non_negative(sum(monthly_sum_by_fish[fish_id][year][m] for year in range_years) / max(1, len(range_years)))
            for m in range(1, 13)
        ]
        mean_month = sum(avg_month) / 12 if avg_month else 0.0
        seasonality = max(avg_month) / mean_month if mean_month > 0 else 0.0
        peak_month = 1 + max(range(12), key=lambda i: avg_month[i]) if avg_month else 1

        metrics.append(
            FishMetric(
                fish_id=fish_id,
                name=fish_name_by_id[fish_id],
                avg_yearly_total=avg_yearly_total,
                latest_total=latest_total,
                prev_total=prev_total,
                growth=growth,
                seasonality=seasonality,
                peak_month=peak_month,
            )
        )

    return metrics


def build_2026_json(metrics: List[FishMetric], range_years: List[int], template: Dict[str, Any] | None) -> Dict[str, Any]:
    total_avg = sum(m.avg_yearly_total for m in metrics)
    if total_avg <= 0:
        raise RuntimeError("Total average landing is zero")

    raw_percent = {m.fish_id: (m.avg_yearly_total / total_avg) * 100 for m in metrics}
    percentile_int = allocate_percentile_to_100(raw_percent)

    featured_pool: List[Tuple[FishMetric, float, str]] = []
    for m in metrics:
        share = raw_percent[m.fish_id]
        rarity = max(0.0, 1.0 - share / 3.0)
        growth_score = max(0.0, min(2.0, m.growth + 0.2)) / 2.0
        seasonality_score = max(0.0, min(2.5, m.seasonality - 1.0)) / 2.5
        score = 0.45 * rarity + 0.35 * growth_score + 0.20 * seasonality_score
        reason = f"low_share={share:.2f} growth={m.growth*100:.1f}% seasonality={m.seasonality:.2f}"
        featured_pool.append((m, score, reason))

    featured_pool.sort(key=lambda x: x[1], reverse=True)
    featured_top = featured_pool[: max(10, min(30, len(featured_pool) // 5))]
    featured_ids = {m.fish_id for m, _, _ in featured_top}

    categories = [
        {"id": "trend", "label": "旬", "description": "近年の伸びが見える魚"},
        {"id": "discovery", "label": "発見", "description": "通向けに深掘りしたい魚"},
        {"id": "classic", "label": "王道", "description": "安定した代表的な魚"},
    ]

    fish_records: List[Dict[str, Any]] = []
    for m in metrics:
        if m.growth >= 0.08:
            trend = "up"
        elif m.growth <= -0.08:
            trend = "down"
        else:
            trend = "flat"

        if m.fish_id in featured_ids:
            category = "discovery"
        elif m.growth >= 0.08:
            category = "trend"
        else:
            category = "classic"

        fish_records.append(
            {
                "id": m.fish_id,
                "name": m.name,
                "category": category,
                "trend": trend,
                "percentile": percentile_int[m.fish_id],
                "microcopy": f"直近5年平均の構成比は {raw_percent[m.fish_id]:.2f}%。旬のピークは {m.peak_month}月。",
                "share": {
                    "badgeLabel": f"2026 {m.name}通",
                    "text": f"2026年の日本海の魚『{m.name}』に注目。#日本海通2026 #石川の旬",
                },
            }
        )

    fish_records.sort(key=lambda f: raw_percent[f["id"]], reverse=True)

    theme = {
        "headline": "旬を知り、深く味わう。",
        "subline": "直近5年の水揚げデータから選んだ2026年の魚一覧",
    }
    if template and isinstance(template.get("theme"), dict):
        theme["headline"] = template["theme"].get("headline", theme["headline"])
        theme["subline"] = template["theme"].get("subline", theme["subline"])

    return {
        "year": 2026,
        "theme": theme,
        "categories": categories,
        "fish": fish_records,
        "featured": [
            {"id": m.fish_id, "name": m.name, "score": round(score, 4), "reason": reason}
            for m, score, reason in featured_top
        ],
        "meta": {
            "percentile_definition": "5y_avg_annual_share_percent_2dp_sum_100_00",
            "source_years": range_years,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate public/data json files from source xlsx")
    parser.add_argument("--xlsx", default="data/2025.12.18.xlsx")
    parser.add_argument("--template-2026", default="public/data/2026.json")
    parser.add_argument("--out-landings", default="public/data/landings_5y.json")
    parser.add_argument("--out-2026", default="public/data/2026.json")
    parser.add_argument("--years", type=int, default=5)
    args = parser.parse_args()

    xlsx_path = Path(args.xlsx)
    template_path = Path(args.template_2026)
    out_landings = Path(args.out_landings)
    out_2026 = Path(args.out_2026)

    if not xlsx_path.exists():
        raise SystemExit(f"Source xlsx not found: {xlsx_path}")
    if args.years <= 0:
        raise SystemExit("--years must be greater than 0")

    template = None
    if template_path.exists():
        try:
            template = json.loads(template_path.read_text(encoding="utf-8"))
        except Exception:
            template = None

    brand_name_by_code, monthly_sum_by_code, all_years = aggregate_by_brand(xlsx_path)
    max_year = all_years[-1]
    range_years = list(range(max_year - args.years + 1, max_year + 1))

    fish_ids: List[str] = []
    fish_name_by_id: Dict[str, str] = {}
    monthly_sum_by_fish: Dict[str, Dict[int, Dict[int, float]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(float))
    )

    for code, raw_name in sorted(brand_name_by_code.items(), key=lambda kv: int(kv[0])):
        fish_id = make_fish_id(code)
        fish_ids.append(fish_id)
        fish_name_by_id[fish_id] = normalize_name(raw_name)
        for y in range_years:
            for m in range(1, 13):
                monthly_sum_by_fish[fish_id][y][m] = monthly_sum_by_code[code][y][m]

    landings = build_landings_json(fish_ids, fish_name_by_id, monthly_sum_by_fish, range_years)
    metrics = build_metrics(fish_ids, fish_name_by_id, monthly_sum_by_fish, range_years)
    data2026 = build_2026_json(metrics, range_years, template)

    out_landings.parent.mkdir(parents=True, exist_ok=True)
    out_2026.parent.mkdir(parents=True, exist_ok=True)

    out_landings.write_text(json.dumps(landings, ensure_ascii=False, indent=2), encoding="utf-8")
    out_2026.write_text(json.dumps(data2026, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Generated: {out_landings}")
    print(f"Generated: {out_2026}")
    print(f"Range years: {range_years}")
    print(f"Fish count: {len(fish_ids)}")
    print(f"Percentile sum: {sum(item['percentile'] for item in data2026['fish'])}")


if __name__ == "__main__":
    main()
