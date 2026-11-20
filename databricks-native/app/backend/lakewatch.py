"""Lakewatch data-source configuration.

Lakewatch (Databricks agentic SIEM) table names are workspace-specific and are
not shipped with this app. They must be supplied through configuration; until
they are, Lakewatch routes return an explicit setup error instead of guessing.
"""

import os
import re
from dataclasses import dataclass

_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,254}$")

SETUP_MESSAGE = (
    "Lakewatch is not configured. Set LAKEWATCH_CATALOG, LAKEWATCH_SCHEMA and "
    "LAKEWATCH_TABLES (comma-separated table names) in the app environment, and "
    "grant the app users SELECT on those tables in Unity Catalog."
)


@dataclass(frozen=True)
class LakewatchConfig:
    catalog: str
    schema: str
    tables: tuple

    @classmethod
    def load(cls) -> "LakewatchConfig":
        tables = tuple(
            t.strip() for t in os.environ.get("LAKEWATCH_TABLES", "").split(",") if t.strip()
        )
        return cls(
            catalog=os.environ.get("LAKEWATCH_CATALOG", "").strip(),
            schema=os.environ.get("LAKEWATCH_SCHEMA", "").strip(),
            tables=tables,
        )

    def problems(self) -> list:
        issues = []
        for name, value in (("LAKEWATCH_CATALOG", self.catalog), ("LAKEWATCH_SCHEMA", self.schema)):
            if not value:
                issues.append(f"{name} is not set")
            elif not _NAME_RE.match(value):
                issues.append(f"{name} is not a valid identifier")
        if not self.tables:
            issues.append("LAKEWATCH_TABLES is not set")
        bad = [t for t in self.tables if not _NAME_RE.match(t)]
        if bad:
            issues.append(f"LAKEWATCH_TABLES has invalid names: {', '.join(bad)}")
        return issues

    @property
    def configured(self) -> bool:
        return not self.problems()

    def fqn(self, table: str) -> str:
        if table not in self.tables:
            raise KeyError(table)
        return f"`{self.catalog}`.`{self.schema}`.`{table}`"

    def status(self) -> dict:
        problems = self.problems()
        return {
            "configured": not problems,
            "catalog": self.catalog or None,
            "schema": self.schema or None,
            "tables": list(self.tables),
            "problems": problems,
            "setup": None if not problems else SETUP_MESSAGE,
        }
