#!/usr/bin/env python3
"""Regenerate frontend and SQL seed data from the workbook.

The script uses only the Python standard library because the workbook has a
single normalized data sheet. It reads `AI Tools`, converts Excel serial dates
to ISO dates, and keeps deterministic UUIDs by slug.
"""

from __future__ import annotations

import json
import posixpath
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "AI_Tools_Updated_with_Open_Science.xlsx"
SEED_TS = ROOT / "src" / "data" / "seedTools.ts"
SEED_SQL = ROOT / "supabase" / "seed.sql"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

CATEGORY_MAP = {
    "Academic & Science": "Science",
    "Coding & Development": "Coding",
    "General AI Assistants": "General",
    "Notes & Knowledge": "Notes",
    "Presentations & Content": "Presentations",
    "Research & Search": "Research",
    "Study & Writing": "Writing",
    "Visual & Creative": "Visual",
}


def col_to_index(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha())
    number = 0
    for char in letters:
        number = number * 26 + ord(char.upper()) - 64
    return number - 1


def resolve_xlsx_path(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), target))


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def load_rows() -> list[dict[str, str]]:
    with ZipFile(WORKBOOK) as archive:
        shared_strings = []
        shared_xml = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        for item in shared_xml.findall("main:si", NS):
            shared_strings.append(
                "".join(
                    text.text or ""
                    for text in item.iter(f"{{{NS['main']}}}t")
                )
            )

        workbook_path = "xl/workbook.xml"
        workbook_xml = ET.fromstring(archive.read(workbook_path))
        rels_xml = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rels = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_xml}
        sheet = workbook_xml.find("main:sheets/main:sheet[@name='AI Tools']", NS)
        if sheet is None:
            raise SystemExit("Expected sheet named 'AI Tools' was not found.")

        sheet_path = resolve_xlsx_path(
            workbook_path,
            rels[sheet.attrib[f"{{{NS['rel']}}}id"]],
        )
        worksheet_xml = ET.fromstring(archive.read(sheet_path))

        raw_rows: list[list[str]] = []
        for row in worksheet_xml.findall("main:sheetData/main:row", NS):
            values: list[str] = []
            for cell in row.findall("main:c", NS):
                index = col_to_index(cell.attrib.get("r", "A"))
                while len(values) <= index:
                    values.append("")

                cell_type = cell.attrib.get("t")
                value_node = cell.find("main:v", NS)
                inline_node = cell.find("main:is", NS)
                value = ""
                if cell_type == "s" and value_node is not None:
                    value = shared_strings[int(value_node.text or "0")]
                elif cell_type == "inlineStr" and inline_node is not None:
                    value = "".join(
                        text.text or ""
                        for text in inline_node.iter(f"{{{NS['main']}}}t")
                    )
                elif value_node is not None:
                    value = value_node.text or ""
                values[index] = value
            raw_rows.append(values)

    headers = raw_rows[0]
    return [
        dict(zip(headers, row + [""] * (len(headers) - len(row))))
        for row in raw_rows[1:]
        if any(str(value).strip() for value in row)
    ]


def normalize_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    records = []
    for row in rows:
        name = row["Tool / Service"].strip()
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        last_checked = (
            datetime(1899, 12, 30)
            + timedelta(days=float(row["Last checked"]))
        ).date().isoformat()
        records.append(
            {
                "id": str(
                    uuid.uuid5(uuid.NAMESPACE_URL, f"ai-tools-directory:{slug}")
                ),
                "slug": slug,
                "category": CATEGORY_MAP.get(
                    row["Category"].strip(),
                    row["Category"].strip(),
                ),
                "name": name,
                "bestFor": row["Best for"].strip(),
                "pricing": row["Access / Pricing"].strip(),
                "strengths": row["Key strengths"].strip(),
                "caveats": row["Caveats / Notes"].strip(),
                "status": row["Status"].strip(),
                "websiteUrl": row["Official Link"].strip(),
                "sourceUrl": row["Source / verified"].strip(),
                "lastChecked": last_checked,
            }
        )
    return records


def write_seed_ts(records: list[dict[str, str]]) -> None:
    output = (
        'import type { DirectoryTool } from "../types";\n\n'
        "export const seedTools: DirectoryTool[] = "
        + json.dumps(records, indent=2, ensure_ascii=False)
        + ";\n"
    )
    SEED_TS.write_text(output, encoding="utf-8")


def write_seed_sql(records: list[dict[str, str]]) -> None:
    columns = [
        "id",
        "slug",
        "category",
        "name",
        "best_for",
        "pricing",
        "strengths",
        "caveats",
        "status",
        "website_url",
        "source_url",
        "last_checked",
        "source_type",
        "moderation_status",
    ]
    lines = [
        "-- Generated from AI_Tools_Updated_with_Open_Science.xlsx, sheet: AI Tools",
        "-- Ratings, comments, and use counts are intentionally not seeded.",
        "",
        "insert into public.tools (",
        "  " + ", ".join(columns),
        ") values",
    ]

    values = []
    for record in records:
        row = [
            record["id"],
            record["slug"],
            record["category"],
            record["name"],
            record["bestFor"],
            record["pricing"],
            record["strengths"],
            record["caveats"],
            record["status"],
            record["websiteUrl"],
            record["sourceUrl"],
            record["lastChecked"],
            "spreadsheet",
            "approved",
        ]
        values.append("  (" + ", ".join(sql_quote(value) for value in row) + ")")

    lines.append(",\n".join(values))
    lines.extend(
        [
            "on conflict (slug) do update set",
            "  category = excluded.category,",
            "  name = excluded.name,",
            "  best_for = excluded.best_for,",
            "  pricing = excluded.pricing,",
            "  strengths = excluded.strengths,",
            "  caveats = excluded.caveats,",
            "  status = excluded.status,",
            "  website_url = excluded.website_url,",
            "  source_url = excluded.source_url,",
            "  last_checked = excluded.last_checked,",
            "  source_type = 'spreadsheet',",
            "  moderation_status = 'approved';",
        ]
    )
    SEED_SQL.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    records = normalize_rows(load_rows())
    write_seed_ts(records)
    write_seed_sql(records)
    print(f"Imported {len(records)} tools from {WORKBOOK.name}.")


if __name__ == "__main__":
    main()
