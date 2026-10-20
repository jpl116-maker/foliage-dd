#!/usr/bin/env python3
"""Build a small, realistic tax due-diligence sample data room."""

from __future__ import annotations

import zipfile
import shutil
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path("/workspace/data/Linden-Park-Test-DD")
ZIP_PATH = Path("/workspace/artifacts/Linden-Park-Test-DD.zip")
NAVY = "1B365D"
GOLD = "C4A35A"
PALE = "F4F1EA"
LINE = "D4D0C8"
INK = "1A1714"
MUTED = "5C574F"

YEARS = {
    2023: {
        "rental": 15_860_000,
        "reimb": 2_740_000,
        "other": 190_000,
        "opex": 3_780_000,
        "tax": 1_920_000,
        "ins": 420_000,
        "mgmt": 475_800,
        "ga": 1_720_000,
        "dep": 4_860_000,
        "int": 3_610_000,
    },
    2024: {
        "rental": 17_140_000,
        "reimb": 2_960_000,
        "other": 215_000,
        "opex": 4_020_000,
        "tax": 2_030_000,
        "ins": 450_000,
        "mgmt": 514_200,
        "ga": 1_805_000,
        "dep": 4_990_000,
        "int": 3_725_000,
    },
    2025: {
        "rental": 18_420_000,
        "reimb": 3_180_000,
        "other": 240_000,
        "opex": 4_260_000,
        "tax": 2_140_000,
        "ins": 480_000,
        "mgmt": 552_600,
        "ga": 1_890_000,
        "dep": 5_120_000,
        "int": 3_840_000,
    },
}

YTD = {
    "label": "Six months ended June 30",
    "rental": 9_110_000,
    "reimb": 1_560_000,
    "other": 118_000,
    "opex": 2_105_000,
    "tax": 1_070_000,
    "ins": 240_000,
    "mgmt": 273_300,
    "ga": 940_000,
    "dep": 2_560_000,
    "int": 1_920_000,
    "prior_rental": 8_640_000,
    "prior_reimb": 1_470_000,
    "prior_other": 108_000,
    "prior_opex": 2_010_000,
    "prior_tax": 1_020_000,
    "prior_ins": 228_000,
    "prior_mgmt": 259_200,
    "prior_ga": 905_000,
    "prior_dep": 2_495_000,
    "prior_int": 1_862_000,
}

PARK = {
    "rental": 7_368_000,
    "reimb": 1_272_000,
    "other": 86_000,
    "opex": 1_704_000,
    "tax": 856_000,
    "ins": 192_000,
    "mgmt": 221_040,
    "ga": 0,
    "dep": 2_048_000,
    "int": 0,
}


def money(n: int) -> str:
    if n < 0:
        return f"({abs(n):,})"
    return f"{n:,}"


def tot(d: dict, keys: tuple[str, ...]) -> int:
    return sum(d[k] for k in keys)


def ni(d: dict) -> int:
    rev = tot(d, ("rental", "reimb", "other"))
    exp = tot(d, ("opex", "tax", "ins", "mgmt", "ga", "dep", "int"))
    return rev - exp


thin = Border(
    left=Side(style="thin", color=LINE),
    right=Side(style="thin", color=LINE),
    top=Side(style="thin", color=LINE),
    bottom=Side(style="thin", color=LINE),
)
bottom_double = Border(bottom=Side(style="double", color=NAVY))
bottom_single = Border(bottom=Side(style="thin", color=NAVY))


def fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)


def font(size=10, bold=False, color=INK, name="Calibri") -> Font:
    return Font(name=name, size=size, bold=bold, color=color)


def apply_col_widths(ws, widths: dict[str, float]) -> None:
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def header_block(ws, title: str, subtitle: str, period: str, cols: int) -> None:
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=cols)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=cols)
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=cols)
    ws.merge_cells(start_row=4, start_column=1, end_row=4, end_column=cols)
    ws["A1"] = "LINDEN PARK REIT, INC."
    ws["A1"].font = font(14, True, NAVY)
    ws["A2"] = title
    ws["A2"].font = font(12, True, NAVY)
    ws["A3"] = period
    ws["A3"].font = font(10, False, MUTED)
    ws["A4"] = subtitle
    ws["A4"].font = font(9, False, MUTED)
    for r in range(1, 5):
        ws.cell(r, 1).alignment = Alignment(horizontal="left")
        for c in range(1, cols + 1):
            ws.cell(r, c).fill = fill(PALE)


def num_cell(ws, row: int, col: int, value: int | None, bold=False, underline=None) -> None:
    cell = ws.cell(row, col)
    if value is None:
        cell.value = "—"
        cell.alignment = Alignment(horizontal="right")
        cell.font = font(10, bold, MUTED)
    else:
        cell.value = value
        cell.number_format = '#,##0;(#,##0);"—"'
        cell.font = font(10, bold, INK)
        cell.alignment = Alignment(horizontal="right")
    if underline == "single":
        cell.border = bottom_single
    elif underline == "double":
        cell.border = bottom_double


def label_cell(ws, row: int, col: int, text: str, *, indent=0, bold=False, section=False) -> None:
    cell = ws.cell(row, col, text)
    cell.font = font(10, True if section or bold else False, NAVY if section else INK)
    cell.alignment = Alignment(indent=indent, vertical="center")
    if section:
        cell.fill = fill(PALE)


def write_is_rows(ws, start: int, col_map: list[tuple[int, dict]], prefix="") -> int:
    """Write a standard P&L body. col_map is (excel_col, dict of amounts)."""
    r = start

    def cols_of(key: str, bold=False, underline=None):
        for col, data in col_map:
            num_cell(ws, r, col, data.get(key), bold=bold, underline=underline)

    label_cell(ws, r, 1, "Revenues", section=True)
    for col, _ in col_map:
        ws.cell(r, col).fill = fill(PALE)
    r += 1
    label_cell(ws, r, 1, "Rental income", indent=1)
    cols_of("rental")
    r += 1
    label_cell(ws, r, 1, "Tenant reimbursements", indent=1)
    cols_of("reimb")
    r += 1
    label_cell(ws, r, 1, "Other income", indent=1)
    cols_of("other", underline="single")
    r += 1
    label_cell(ws, r, 1, "Total revenues", bold=True)
    for col, data in col_map:
        num_cell(ws, r, col, tot(data, ("rental", "reimb", "other")), bold=True, underline="single")
    r += 2

    label_cell(ws, r, 1, "Expenses", section=True)
    for col, _ in col_map:
        ws.cell(r, col).fill = fill(PALE)
    r += 1
    for key, name in (
        ("opex", "Property operating expenses"),
        ("tax", "Real estate taxes"),
        ("ins", "Insurance"),
        ("mgmt", "Property management fees"),
        ("ga", "General and administrative"),
        ("dep", "Depreciation and amortization"),
        ("int", "Interest expense"),
    ):
        label_cell(ws, r, 1, name, indent=1)
        last = key == "int"
        cols_of(key, underline="single" if last else None)
        r += 1
    label_cell(ws, r, 1, "Total expenses", bold=True)
    for col, data in col_map:
        num_cell(
            ws,
            r,
            col,
            tot(data, ("opex", "tax", "ins", "mgmt", "ga", "dep", "int")),
            bold=True,
            underline="single",
        )
    r += 2
    label_cell(ws, r, 1, "Net income", bold=True, section=True)
    for col, data in col_map:
        ws.cell(r, col).fill = fill(PALE)
        num_cell(ws, r, col, ni(data), bold=True, underline="double")
    r += 2
    ws.cell(r, 1, "Figures in U.S. dollars. Sample data for due-diligence testing only — not actual books.")
    ws.cell(r, 1).font = font(8, False, MUTED)
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=1 + len(col_map))
    return r


def write_income_comparative(path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Consolidated"
    header_block(
        ws,
        "Consolidated Statements of Operations",
        "Unaudited sample · Prepared for Project Linden due diligence",
        "Years ended December 31, 2023, 2024 and 2025",
        4,
    )
    ws["A6"] = ""
    ws["B6"] = "2023"
    ws["C6"] = "2024"
    ws["D6"] = "2025"
    for col in range(2, 5):
        ws.cell(6, col).font = font(10, True, "FFFFFF")
        ws.cell(6, col).fill = fill(NAVY)
        ws.cell(6, col).alignment = Alignment(horizontal="right")
    ws["A6"].fill = fill(NAVY)
    write_is_rows(
        ws,
        7,
        [(2, YEARS[2023]), (3, YEARS[2024]), (4, YEARS[2025])],
    )
    apply_col_widths(ws, {"A": 38, "B": 16, "C": 16, "D": 16})
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.oddFooter.left.text = "Linden Park REIT, Inc.  |  Confidential — sample DD set"
    ws.oddFooter.right.text = "Page &P"
    wb.save(path)


def write_income_ytd(path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "YTD"
    header_block(
        ws,
        "Consolidated Statements of Operations",
        "Unaudited sample · Cutoff for diligence review as of June 30, 2026",
        "Six months ended June 30, 2026 and 2025",
        3,
    )
    ws["B6"] = "Six months ended\nJune 30, 2025"
    ws["C6"] = "Six months ended\nJune 30, 2026"
    for col in range(2, 4):
        ws.cell(6, col).font = font(10, True, "FFFFFF")
        ws.cell(6, col).fill = fill(NAVY)
        ws.cell(6, col).alignment = Alignment(horizontal="right", wrap_text=True)
        ws.row_dimensions[6].height = 32
    ws["A6"].fill = fill(NAVY)
    prior = {
        "rental": YTD["prior_rental"],
        "reimb": YTD["prior_reimb"],
        "other": YTD["prior_other"],
        "opex": YTD["prior_opex"],
        "tax": YTD["prior_tax"],
        "ins": YTD["prior_ins"],
        "mgmt": YTD["prior_mgmt"],
        "ga": YTD["prior_ga"],
        "dep": YTD["prior_dep"],
        "int": YTD["prior_int"],
    }
    current = {k: YTD[k] for k in ("rental", "reimb", "other", "opex", "tax", "ins", "mgmt", "ga", "dep", "int")}
    write_is_rows(ws, 7, [(2, prior), (3, current)])
    apply_col_widths(ws, {"A": 38, "B": 22, "C": 22})
    wb.save(path)


def write_income_property(path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Park Place"
    header_block(
        ws,
        "Property-Level Statement of Operations — Park Place",
        "100–140 Linden Avenue, Richmond, Virginia  ·  Wholly owned  ·  Sample data",
        "Year ended December 31, 2025",
        2,
    )
    ws["B6"] = "2025"
    ws["B6"].font = font(10, True, "FFFFFF")
    ws["B6"].fill = fill(NAVY)
    ws["B6"].alignment = Alignment(horizontal="right")
    ws["A6"].fill = fill(NAVY)
    write_is_rows(ws, 7, [(2, PARK)])
    apply_col_widths(ws, {"A": 42, "B": 18})
    r = 28
    ws.cell(r, 1, "Notes")
    ws.cell(r, 1).font = font(10, True, NAVY)
    ws.cell(r + 1, 1, "1. Park Place is a 212,400 sf suburban office campus. Occupancy at year-end 2025 was 91.4%.")
    ws.cell(r + 2, 1, "2. Management fee is 3% of rental income payable to Apex Realty Services, LLC under the 2022 PMA.")
    ws.cell(r + 3, 1, "3. Corporate G&A and interest are recorded at the REIT parent and are not pushed to the property.")
    for i in range(1, 4):
        ws.cell(r + i, 1).font = font(8, False, MUTED)
        ws.merge_cells(start_row=r + i, start_column=1, end_row=r + i, end_column=2)
    wb.save(path)


ACCOUNTS = [
    ("1100", "Cash — operating"),
    ("1200", "Tenant receivables"),
    ("1500", "Buildings and improvements"),
    ("1510", "Accumulated depreciation"),
    ("2100", "Accounts payable"),
    ("2200", "Accrued real estate taxes"),
    ("2500", "Mortgage notes payable"),
    ("3100", "Common stock"),
    ("3200", "Additional paid-in capital"),
    ("3900", "Retained earnings"),
    ("4100", "Rental income"),
    ("4200", "Tenant reimbursements"),
    ("4300", "Other income"),
    ("5100", "Property operating expenses"),
    ("5200", "Real estate taxes"),
    ("5300", "Insurance"),
    ("5400", "Property management fees"),
    ("6100", "General and administrative"),
    ("7100", "Depreciation expense"),
    ("8100", "Interest expense"),
]


def gl_rows_for_year(year: int, months: int, scale: dict) -> list[tuple]:
    """Build a short monthly GL that roughly supports the income statement."""
    rows = []
    je = 1000 + year
    month_rental = scale["rental"] // months
    month_reimb = scale["reimb"] // months
    month_opex = scale["opex"] // months
    month_tax = scale["tax"] // months
    month_ins = scale["ins"] // months
    month_mgmt = scale["mgmt"] // months
    month_ga = scale["ga"] // months
    month_dep = scale["dep"] // months
    month_int = scale["int"] // months
    vendors = [
        ("Dominion Energy", "5100", "Utilities — electric"),
        ("City of Richmond Water", "5100", "Utilities — water"),
        ("Allied Security", "5100", "Contract security"),
        ("Greenway Landscape", "5100", "Grounds maintenance"),
        ("Northline Mechanical", "5100", "HVAC service"),
    ]
    entities = ["Linden Park REIT, Inc.", "Linden Park Operating LP"]
    properties = ["Park Place", "River Court", "Holt Street"]

    for m in range(1, months + 1):
        d_rent = date(year, m, 1)
        d_mid = date(year, m, 15)
        d_end = date(year, m, 28)
        prop = properties[(m - 1) % 3]
        ent = entities[0 if m % 2 else 1]
        je += 1
        rows.append((d_rent, f"JE-{je}", "1200", "Tenant receivables", f"{prop} — monthly rent roll", month_rental, 0, ent, prop))
        rows.append((d_rent, f"JE-{je}", "4100", "Rental income", f"{prop} — monthly rent roll", 0, month_rental, ent, prop))
        je += 1
        rows.append((d_rent, f"JE-{je}", "1200", "Tenant receivables", f"{prop} — CAM / tax recovery", month_reimb, 0, ent, prop))
        rows.append((d_rent, f"JE-{je}", "4200", "Tenant reimbursements", f"{prop} — CAM / tax recovery", 0, month_reimb, ent, prop))
        vendor_name, acct, desc = vendors[(m - 1) % len(vendors)]
        share = month_opex
        je += 1
        rows.append((d_mid, f"AP-{je}", acct, "Property operating expenses", f"{vendor_name} — {desc}", share, 0, ent, prop))
        rows.append((d_mid, f"AP-{je}", "2100", "Accounts payable", f"{vendor_name} invoice {year}-{m:02d}", 0, share, ent, prop))
        if m in (1, 4, 7, 10) or months < 12:
            je += 1
            tax_amt = month_tax if months < 12 else month_tax * 3
            rows.append((d_mid, f"JE-{je}", "5200", "Real estate taxes", f"{prop} — quarterly accrual", tax_amt, 0, ent, prop))
            rows.append((d_mid, f"JE-{je}", "2200", "Accrued real estate taxes", f"{prop} — quarterly accrual", 0, tax_amt, ent, prop))
        if m == 1 or months < 12:
            je += 1
            ins_amt = month_ins if months < 12 else month_ins * 12
            if months < 12:
                ins_amt = month_ins
            rows.append((d_end, f"JE-{je}", "5300", "Insurance", "Prepaid insurance amortization", ins_amt, 0, entities[0], "Corporate"))
            rows.append((d_end, f"JE-{je}", "1100", "Cash — operating", "Prepaid insurance amortization", 0, ins_amt, entities[0], "Corporate"))
        je += 1
        rows.append((d_end, f"AP-{je}", "5400", "Property management fees", "Apex Realty Services monthly fee", month_mgmt, 0, ent, prop))
        rows.append((d_end, f"AP-{je}", "2100", "Accounts payable", "Apex Realty Services monthly fee", 0, month_mgmt, ent, prop))
        je += 1
        rows.append((d_end, f"JE-{je}", "6100", "General and administrative", "Payroll, legal, audit allocation", month_ga, 0, entities[0], "Corporate"))
        rows.append((d_end, f"JE-{je}", "1100", "Cash — operating", "Payroll, legal, audit allocation", 0, month_ga, entities[0], "Corporate"))
        je += 1
        rows.append((d_end, f"JE-{je}", "7100", "Depreciation expense", f"{prop} — straight-line depreciation", month_dep, 0, ent, prop))
        rows.append((d_end, f"JE-{je}", "1510", "Accumulated depreciation", f"{prop} — straight-line depreciation", 0, month_dep, ent, prop))
        je += 1
        rows.append((d_end, f"JE-{je}", "8100", "Interest expense", "Note 1 — Park Place mortgage (4.85%)", month_int, 0, entities[0], "Park Place"))
        rows.append((d_end, f"JE-{je}", "1100", "Cash — operating", "Note 1 — Park Place mortgage (4.85%)", 0, month_int, entities[0], "Park Place"))
        if m == 6:
            other_amt = scale["other"] // max(months // 6, 1)
            je += 1
            rows.append((d_mid, f"JE-{je}", "1100", "Cash — operating", "Other — rooftop license (Verizon)", other_amt, 0, entities[0], "Park Place"))
            rows.append((d_mid, f"JE-{je}", "4300", "Other income", "Other — rooftop license (Verizon)", 0, other_amt, entities[0], "Park Place"))
    return rows


def style_table_header(ws, row: int, cols: int) -> None:
    for c in range(1, cols + 1):
        cell = ws.cell(row, c)
        cell.font = font(9, True, "FFFFFF")
        cell.fill = fill(NAVY)
        cell.alignment = Alignment(horizontal="center", wrap_text=True, vertical="center")
        cell.border = thin
    ws.row_dimensions[row].height = 22


def write_gl(path: Path, year: int, months: int, scale: dict, title_period: str) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "GL Extract"
    header_block(
        ws,
        "General Ledger Extract",
        "Sample books · Linden Park Operating LP and Linden Park REIT, Inc.  ·  Source: Yardi",
        title_period,
        9,
    )
    headers = ["Date", "Journal", "Account", "Account name", "Description", "Debit", "Credit", "Entity", "Property"]
    for i, h in enumerate(headers, 1):
        ws.cell(6, i, h)
    style_table_header(ws, 6, 9)
    rows = gl_rows_for_year(year, months, scale)
    r = 7
    debit_total = credit_total = 0
    for date_, je, acct, name, desc, dr, cr, ent, prop in rows:
        ws.cell(r, 1, date_).number_format = "YYYY-MM-DD"
        ws.cell(r, 2, je)
        ws.cell(r, 3, acct)
        ws.cell(r, 4, name)
        ws.cell(r, 5, desc)
        ws.cell(r, 6, dr).number_format = '#,##0;(#,##0);"—"'
        ws.cell(r, 7, cr).number_format = '#,##0;(#,##0);"—"'
        ws.cell(r, 8, ent)
        ws.cell(r, 9, prop)
        for c in range(1, 10):
            ws.cell(r, c).font = font(9)
            ws.cell(r, c).border = thin
            if r % 2 == 0:
                ws.cell(r, c).fill = fill("FAF7F2")
        debit_total += dr
        credit_total += cr
        r += 1
    ws.cell(r, 5, "Totals")
    ws.cell(r, 5).font = font(9, True, NAVY)
    ws.cell(r, 6, debit_total).number_format = '#,##0;(#,##0)'
    ws.cell(r, 7, credit_total).number_format = '#,##0;(#,##0)'
    ws.cell(r, 6).font = font(9, True, NAVY)
    ws.cell(r, 7).font = font(9, True, NAVY)
    ws.cell(r, 6).border = bottom_double
    ws.cell(r, 7).border = bottom_double
    apply_col_widths(ws, {"A": 13, "B": 12, "C": 10, "D": 28, "E": 42, "F": 14, "G": 14, "H": 26, "I": 14})
    ws.auto_filter.ref = f"A6:I{r-1}"
    ws.freeze_panes = "A7"
    ws.oddFooter.left.text = "Linden Park REIT, Inc.  |  Sample GL extract — not actual books"
    wb.save(path)


def write_trial_balance(path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Trial Balance"
    header_block(
        ws,
        "Trial Balance",
        "Sample books · Selected balance-sheet accounts plus 2025 P&L; debits equal credits",
        "As of December 31, 2025",
        5,
    )
    for i, h in enumerate(["Account", "Account name", "Debit", "Credit", "Type"], 1):
        ws.cell(6, i, h)
    style_table_header(ws, 6, 5)
    y = YEARS[2025]
    items = [
        ["1100", "Cash — operating", 5_192_600, 0, "Asset"],
        ("1200", "Tenant receivables", 612_000, 0, "Asset"),
        ("1500", "Buildings and improvements", 148_500_000, 0, "Asset"),
        ("1510", "Accumulated depreciation", 0, 41_860_000, "Asset"),
        ("2100", "Accounts payable", 0, 980_000, "Liability"),
        ("2200", "Accrued real estate taxes", 0, 535_000, "Liability"),
        ("2500", "Mortgage notes payable", 0, 72_400_000, "Liability"),
        ("3100", "Common stock", 0, 50_000, "Equity"),
        ("3200", "Additional paid-in capital", 0, 34_112_200, "Equity"),
        ("3900", "Retained earnings (opening)", 0, 810_000, "Equity"),
        ("4100", "Rental income", 0, y["rental"], "Income"),
        ("4200", "Tenant reimbursements", 0, y["reimb"], "Income"),
        ("4300", "Other income", 0, y["other"], "Income"),
        ("5100", "Property operating expenses", y["opex"], 0, "Expense"),
        ("5200", "Real estate taxes", y["tax"], 0, "Expense"),
        ("5300", "Insurance", y["ins"], 0, "Expense"),
        ("5400", "Property management fees", y["mgmt"], 0, "Expense"),
        ("6100", "General and administrative", y["ga"], 0, "Expense"),
        ("7100", "Depreciation expense", y["dep"], 0, "Expense"),
        ("8100", "Interest expense", y["int"], 0, "Expense"),
    ]
    r = 7
    dr_t = cr_t = 0
    for acct, name, dr, cr, typ in items:
        ws.cell(r, 1, acct)
        ws.cell(r, 2, name)
        ws.cell(r, 3, dr if dr else None)
        ws.cell(r, 4, cr if cr else None)
        ws.cell(r, 3).number_format = '#,##0;(#,##0);"—"'
        ws.cell(r, 4).number_format = '#,##0;(#,##0);"—"'
        ws.cell(r, 5, typ)
        for c in range(1, 6):
            ws.cell(r, c).font = font(9)
            ws.cell(r, c).border = thin
            if typ in ("Income", "Expense"):
                ws.cell(r, c).fill = fill("FAF7F2")
        dr_t += dr
        cr_t += cr
        r += 1
    ws.cell(r, 2, "Totals")
    ws.cell(r, 2).font = font(9, True, NAVY)
    ws.cell(r, 3, dr_t).number_format = '#,##0'
    ws.cell(r, 4, cr_t).number_format = '#,##0'
    ws.cell(r, 3).font = font(9, True, NAVY)
    ws.cell(r, 4).font = font(9, True, NAVY)
    ws.cell(r, 3).border = bottom_double
    ws.cell(r, 4).border = bottom_double
    r += 2
    ws.cell(r, 1, "Note: Debits equal credits. 2025 net income remains in the P&L accounts (not closed to retained earnings) for review.")
    ws.cell(r, 1).font = font(8, False, MUTED)
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
    apply_col_widths(ws, {"A": 12, "B": 36, "C": 18, "D": 18, "E": 12})
    wb.save(path)


NAVY_C = HexColor("#1B365D")
GOLD_C = HexColor("#C4A35A")
INK_C = HexColor("#1A1714")
MUTED_C = HexColor("#5C574F")


def contract_styles():
    base = getSampleStyleSheet()
    styles = {
        "entity": ParagraphStyle(
            "entity", parent=base["Normal"], fontName="Times-Bold", fontSize=11,
            textColor=NAVY_C, alignment=TA_CENTER, leading=14, spaceAfter=1,
        ),
        "kicker": ParagraphStyle(
            "kicker", parent=base["Normal"], fontName="Times-Italic", fontSize=9,
            textColor=MUTED_C, alignment=TA_CENTER, spaceAfter=8,
        ),
        "title": ParagraphStyle(
            "title", parent=base["Normal"], fontName="Times-Bold", fontSize=14,
            textColor=NAVY_C, alignment=TA_CENTER, leading=18, spaceBefore=6, spaceAfter=10,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Times-Roman", fontSize=10,
            textColor=INK_C, alignment=TA_JUSTIFY, leading=14, spaceAfter=8,
        ),
        "article": ParagraphStyle(
            "article", parent=base["Normal"], fontName="Times-Bold", fontSize=10.5,
            textColor=NAVY_C, spaceBefore=10, spaceAfter=6, leading=14,
        ),
        "sig": ParagraphStyle(
            "sig", parent=base["Normal"], fontName="Times-Roman", fontSize=10,
            textColor=INK_C, leading=13, spaceAfter=3,
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["Normal"], fontName="Times-Italic", fontSize=8,
            textColor=MUTED_C, alignment=TA_CENTER,
        ),
        "center": ParagraphStyle(
            "center", parent=base["Normal"], fontName="Times-Roman", fontSize=10,
            textColor=INK_C, alignment=TA_CENTER, leading=14, spaceAfter=8,
        ),
        "right": ParagraphStyle(
            "right", parent=base["Normal"], fontName="Times-Roman", fontSize=9,
            textColor=MUTED_C, alignment=TA_RIGHT, spaceAfter=8,
        ),
    }
    return styles


def add_contract_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GOLD_C)
    canvas.setLineWidth(1.5)
    canvas.line(0.85 * inch, 0.62 * inch, letter[0] - 0.85 * inch, 0.62 * inch)
    canvas.setFont("Times-Italic", 8)
    canvas.setFillColor(MUTED_C)
    canvas.drawString(0.85 * inch, 0.42 * inch, "Linden Park REIT — Sample due-diligence file — not an executed original")
    canvas.drawRightString(letter[0] - 0.85 * inch, 0.42 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build_contract(path: Path, title: str, intro: str, articles: list[tuple[str, str]], signatures: list[tuple[str, str, str]]) -> None:
    styles = contract_styles()
    doc = SimpleDocTemplate(
        str(path),
        pagesize=letter,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.85 * inch,
        title=title,
        author="Linden Park REIT, Inc. (sample)",
    )
    story = []
    story.append(Paragraph("LINDEN PARK REIT, INC.", styles["entity"]))
    story.append(Paragraph("Linden Park Operating LP", styles["kicker"]))
    story.append(HRFlowable(width="100%", thickness=1.6, color=NAVY_C, spaceAfter=2))
    story.append(HRFlowable(width="100%", thickness=0.4, color=GOLD_C, spaceBefore=0, spaceAfter=8))
    story.append(Paragraph(title.upper(), styles["title"]))
    story.append(Paragraph("SAMPLE INSTRUMENT — FOR DUE DILIGENCE TESTING", styles["kicker"]))
    story.append(Paragraph(intro, styles["body"]))
    for heading, body in articles:
        story.append(Paragraph(heading, styles["article"]))
        story.append(Paragraph(body, styles["body"]))
    story.append(Paragraph("IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.", styles["body"]))
    story.append(Spacer(1, 14))
    sig_cells = []
    for party, name, office in signatures:
        block = [
            Paragraph(party, styles["sig"]),
            Spacer(1, 16),
            Paragraph("________________________________", styles["sig"]),
            Paragraph(f"By: {name}", styles["sig"]),
            Paragraph(office, styles["sig"]),
        ]
        sig_cells.append(block)
    # two-column signature table
    if len(sig_cells) == 2:
        table = Table([[sig_cells[0], sig_cells[1]]], colWidths=[3.3 * inch, 3.3 * inch])
        table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        story.append(table)
    else:
        for block in sig_cells:
            for item in block:
                story.append(item)
            story.append(Spacer(1, 10))
    story.append(Spacer(1, 16))
    story.append(Paragraph("Exhibits omitted from this sample (insurance certificates, legal description, fee schedule detail).", styles["footer"]))
    doc.build(story, onFirstPage=add_contract_footer, onLaterPages=add_contract_footer)


def write_readme(path: Path) -> None:
    path.write_text(
        """Linden Park REIT — Test Due Diligence Data Set
================================================

Fictional sample files for loading into a tax due-diligence data room.
Not real books, not executed contracts, not client data.

Entity
------
Linden Park REIT, Inc. (Maryland corporation that has elected REIT status)
Linden Park Operating LP (Virginia limited partnership — operating partnership)
Portfolio: Park Place (Richmond, VA), River Court, Holt Street

What's in this pack
-------------------
01-Financials/
  Linden-Park-Income-Statement-2023-2025.xlsx
      Comparative consolidated P&L for 2023, 2024 and 2025.
  Linden-Park-Income-Statement-YTD-Jun-2026.xlsx
      Six months ended June 30, 2026 vs. 2025.
  Park-Place-Property-NOI-2025.xlsx
      Property-level statement for Park Place. Corporate G&A and interest
      are not pushed to the asset.

02-General-Ledger/
  GL-Extract-2024.xlsx
  GL-Extract-2025.xlsx
  GL-Extract-YTD-2026.xlsx
      Short Yardi-style extracts (monthly rent, recoveries, vendors,
      management fee, G&A, depreciation, interest). Debits equal credits
      on each journal.
  Trial-Balance-2025-12-31.xlsx
      Selected balance-sheet accounts plus the 2025 P&L. Debits = credits.

03-Service-Contracts/
  Property-Management-Agreement-Apex-Realty.pdf
      3% of rental income; Apex Realty Services, LLC.
  HVAC-Maintenance-Agreement-Northline.pdf
      Northline Mechanical — Park Place only.
  Parking-Operations-Agreement-MetroPark.pdf
      Third-party parking operator (useful for related-party rent tests).
  Landscaping-Services-Agreement-Greenway.pdf
      Greenway Landscape Co. — grounds at all three properties.

Suggested request-list mapping
------------------------------
  Financials / P&Ls          -> Federal income tax or Property-level info
  General ledger / TB        -> Federal income tax workpapers
  Property management PMA    -> Related-party / 856(d) review
  Parking agreement          -> TRS / related-party rent
  HVAC / landscaping         -> Ordinary course service contracts

Figures are internally consistent at a high level (2025 net income is about
$3.45 million) but are rounded and incomplete. Do not treat them as auditable.
""",
        encoding="utf-8",
    )


def main() -> None:
    if ROOT.exists():
        shutil.rmtree(ROOT)
    (ROOT / "01-Financials").mkdir(parents=True, exist_ok=True)
    (ROOT / "02-General-Ledger").mkdir(parents=True, exist_ok=True)
    (ROOT / "03-Service-Contracts").mkdir(parents=True, exist_ok=True)

    write_readme(ROOT / "README.txt")
    write_income_comparative(ROOT / "01-Financials" / "Linden-Park-Income-Statement-2023-2025.xlsx")
    write_income_ytd(ROOT / "01-Financials" / "Linden-Park-Income-Statement-YTD-Jun-2026.xlsx")
    write_income_property(ROOT / "01-Financials" / "Park-Place-Property-NOI-2025.xlsx")

    write_gl(
        ROOT / "02-General-Ledger" / "GL-Extract-2024.xlsx",
        2024,
        12,
        YEARS[2024],
        "January 1, 2024 through December 31, 2024",
    )
    write_gl(
        ROOT / "02-General-Ledger" / "GL-Extract-2025.xlsx",
        2025,
        12,
        YEARS[2025],
        "January 1, 2025 through December 31, 2025",
    )
    write_gl(
        ROOT / "02-General-Ledger" / "GL-Extract-YTD-2026.xlsx",
        2026,
        6,
        YTD,
        "January 1, 2026 through June 30, 2026",
    )
    write_trial_balance(ROOT / "02-General-Ledger" / "Trial-Balance-2025-12-31.xlsx")

    build_contract(
        ROOT / "03-Service-Contracts" / "Property-Management-Agreement-Apex-Realty.pdf",
        "Property Management Agreement",
        "This Property Management Agreement (the “Agreement”) is entered into as of January 1, 2022 (the “Effective Date”), by and between Linden Park Operating LP, a Virginia limited partnership (“Owner”), and Apex Realty Services, LLC, a Virginia limited liability company (“Manager”). Owner is the operating partnership of Linden Park REIT, Inc. Manager is an unaffiliated third-party manager. This is a short-form sample for due-diligence testing.",
        [
            ("Article 1. Appointment and Term.",
             "Owner hereby appoints Manager as the exclusive manager of the properties commonly known as Park Place, River Court, and Holt Street (together, the “Properties”), and Manager accepts such appointment. The initial term is three (3) years beginning on the Effective Date and renews for successive one-year periods unless either party gives ninety (90) days’ written notice of non-renewal."),
            ("Article 2. Services.",
             "Manager shall operate, lease, and maintain the Properties in a manner consistent with institutional office assets in the Richmond MSA, including rent collection, CAM reconciliation, vendor contracting under $25,000, and monthly reporting to Owner in Yardi. Leases above 10,000 square feet and capital projects above $50,000 require Owner’s prior written consent."),
            ("Article 3. Fee.",
             "Owner shall pay Manager a management fee equal to three percent (3%) of gross rental income actually collected (excluding tenant reimbursements, lease-termination fees, and casualty proceeds), payable monthly in arrears. No construction-management or leasing commission is due under this Agreement; those services, if any, will be contracted separately."),
            ("Article 4. Related-Party; REIT Covenants.",
             "Manager represents that it is not a taxable REIT subsidiary of Owner and that no person who owns 10% or more of Linden Park REIT, Inc. owns 10% or more of Manager. The parties intend that the fee be an arm’s-length charge for services and not rent for purposes of section 856(d) of the Internal Revenue Code. Owner may recast any payment that would jeopardize REIT qualification."),
            ("Article 5. Insurance and Indemnity.",
             "Manager shall maintain commercial general liability insurance of not less than $2,000,000 per occurrence and name Owner and Linden Park REIT, Inc. as additional insureds. Each party indemnifies the other against third-party claims arising from its own negligence or willful misconduct, except to the extent caused by the indemnified party."),
            ("Article 6. Termination.",
             "Owner may terminate this Agreement for convenience on sixty (60) days’ notice, or immediately for cause, including Manager’s bankruptcy, material breach uncured for fifteen (15) days, or any event that Owner’s counsel determines would adversely affect REIT qualification. Upon termination Manager shall deliver books, keys, vendor files, and an accounting within ten (10) business days."),
            ("Article 7. Miscellaneous.",
             "Virginia law governs. Notices shall be in writing to the addresses on the signature page. This Agreement is the entire agreement on the subject and may be signed in counterparts, including electronic signature. Assignments by Manager require Owner’s consent, except to an affiliate under common control."),
        ],
        [
            ("LINDEN PARK OPERATING LP", "Caroline H. Ward, Vice President", "c/o Linden Park REIT, Inc."),
            ("APEX REALTY SERVICES, LLC", "David J. Nguyen, Managing Member", "Richmond, Virginia"),
        ],
    )

    build_contract(
        ROOT / "03-Service-Contracts" / "HVAC-Maintenance-Agreement-Northline.pdf",
        "Preventive Maintenance Agreement — HVAC",
        "This Preventive Maintenance Agreement is dated March 15, 2024, between Linden Park Operating LP (“Owner”) and Northline Mechanical, Inc., a Virginia corporation (“Contractor”), covering the rooftop units, chillers, and building automation system at Park Place, 100–140 Linden Avenue, Richmond, Virginia.",
        [
            ("Article 1. Scope.",
             "Contractor shall perform quarterly preventive maintenance on twenty-eight (28) rooftop units, two (2) air-cooled chillers, and associated controls, including filter changes, belt inspection, refrigerant-charge check, coil cleaning once per year, and a written service report after each visit. Emergency callback is included during business hours; after-hours labor is extra at the rates in Article 3."),
            ("Article 2. Term.",
             "The term is twenty-four (24) months beginning April 1, 2024, and continues year to year unless either party gives thirty (30) days’ notice. Either party may terminate for material breach uncured for ten (10) days."),
            ("Article 3. Price.",
             "Owner shall pay Twelve Thousand Four Hundred and 00/100 Dollars ($12,400) per year, billed quarterly in advance. Extra work (parts over $250, compressor replacement, after-hours labor) is billed at $145/hour plus materials at cost plus 15%. No work over $5,000 may proceed without Owner’s written approval."),
            ("Article 4. Compliance and Safety.",
             "Contractor shall hold a Virginia Class A mechanical license, carry workers’ compensation and $1,000,000 liability coverage, and follow Owner’s contractor rules, including no roof penetrations without prior approval. Refrigerant handling shall comply with EPA Section 608."),
            ("Article 5. Warranty.",
             "Workmanship is warranted for ninety (90) days. Manufacturer warranties on parts pass through to Owner. Contractor is not liable for consequential damages or loss of rent."),
            ("Article 6. Miscellaneous.",
             "Virginia law governs. This is an independent-contractor relationship. The contract is assignable by Owner to a purchaser of Park Place without Contractor’s consent."),
        ],
        [
            ("LINDEN PARK OPERATING LP", "Marcus T. Bell, Asset Manager", "Park Place / River Court"),
            ("NORTHLINE MECHANICAL, INC.", "Elena P. Ruiz, President", "Henrico, Virginia"),
        ],
    )

    build_contract(
        ROOT / "03-Service-Contracts" / "Parking-Operations-Agreement-MetroPark.pdf",
        "Parking Operations and Management Agreement",
        "This Parking Operations and Management Agreement is entered into as of July 1, 2023, by Linden Park Operating LP (“Owner”) and MetroPark Operators, LLC (“Operator”). Operator will run the 418-space structured garage and surface lots at Park Place. Operator is not a tenant; this Agreement is a service contract. Sample only.",
        [
            ("Article 1. Appointment.",
             "Owner retains Operator to staff the garage, operate the gate and PARCS equipment, collect transient and monthly parking charges as Owner’s agent, and keep the decks reasonably clean and safe. Operator has no leasehold or other real-property interest in the garage."),
            ("Article 2. Collections and Remittance.",
             "All parking revenue belongs to Owner. Operator shall deposit receipts daily to Owner’s account ending 4419 and remit a weekly collection report. Operator’s compensation is a flat monthly operating fee of Eight Thousand Five Hundred Dollars ($8,500), plus reimbursement of agreed wages for two attendants, not a share of revenue. No amount payable under this Agreement is rent."),
            ("Article 3. REIT and Related-Party.",
             "Operator represents that it is not related to Owner within the meaning of section 856(d)(2)(B) of the Code and that it does not hold more than 10% of the stock of Linden Park REIT, Inc. Owner may terminate immediately if counsel advises that the arrangement could be treated as related-party rent or as a non-customary service that jeopardizes rents-from-real-property treatment."),
            ("Article 4. Term and Insurance.",
             "The term is two (2) years and renews annually. Operator shall maintain garagekeeper’s liability and CGL of $2,000,000 and name Owner as additional insured. Either party may terminate on sixty (60) days’ notice."),
            ("Article 5. Standard of Care.",
             "Operator shall staff the garage from 6:00 a.m. to 8:00 p.m. weekdays and shall follow Owner’s rules on validation, reserved spaces, and after-hours access. Damage to vehicles is Operator’s risk except to the extent caused by Owner’s structural failure."),
            ("Article 6. Miscellaneous.",
             "Virginia law. Independent contractor. Owner may audit Operator’s collections on five days’ notice. This sample omits the exhibit list of equipment and the form of monthly report."),
        ],
        [
            ("LINDEN PARK OPERATING LP", "Caroline H. Ward, Vice President", "Linden Park REIT, Inc."),
            ("METROPARK OPERATORS, LLC", "James R. Cole, Manager", "Norfolk, Virginia"),
        ],
    )

    build_contract(
        ROOT / "03-Service-Contracts" / "Landscaping-Services-Agreement-Greenway.pdf",
        "Landscaping and Grounds Maintenance Agreement",
        "This Landscaping and Grounds Maintenance Agreement is dated February 1, 2025, between Linden Park Operating LP (“Owner”) and Greenway Landscape Co. (“Contractor”) for Park Place, River Court, and Holt Street (the “Properties”).",
        [
            ("Article 1. Services.",
             "Contractor shall mow, edge, and blow turf weekly in season (March–November), mulch planting beds twice per year, prune shrubs in spring, apply a basic fertilizer program, and keep sidewalks and parking-lot islands free of litter. Snow and ice are not included and will be quoted per event."),
            ("Article 2. Term and Fee.",
             "One-year term beginning March 1, 2025, cancellable on thirty (30) days’ notice. Annual fee is Forty-One Thousand Seven Hundred Dollars ($41,700), billed monthly at $3,475. Extra work (tree removal, irrigation repairs, storm cleanup) is time-and-materials at $68/hour plus materials."),
            ("Article 3. Independent Contractor; Insurance.",
             "Contractor is an independent contractor, shall provide its own equipment, and shall carry liability insurance of $1,000,000 and workers’ compensation. Employees of Contractor are not employees of Owner or of Linden Park REIT, Inc."),
            ("Article 4. Chemicals and Law.",
             "Any pesticide or herbicide application shall be by a licensed applicator and shall comply with Virginia Department of Agriculture rules. Contractor shall not plant invasive species listed by the Commonwealth."),
            ("Article 5. Miscellaneous.",
             "Virginia law. This Agreement may be assigned by Owner to a successor owner of any Property. Entire agreement. Sample instrument for diligence testing only."),
        ],
        [
            ("LINDEN PARK OPERATING LP", "Marcus T. Bell, Asset Manager", "Richmond, Virginia"),
            ("GREENWAY LANDSCAPE CO.", "Patricia L. Gomez, Owner", "Chesterfield, Virginia"),
        ],
    )

    zip_path = ZIP_PATH
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(ROOT.rglob("*")):
            if file.is_file():
                zf.write(file, file.relative_to(ROOT.parent))
    print(f"Wrote {zip_path} ({zip_path.stat().st_size} bytes)")
    for p in sorted(ROOT.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(ROOT)}  {p.stat().st_size}")


if __name__ == "__main__":
    main()
