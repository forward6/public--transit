# 2010 curation

The base map shows Ottawa–Gatineau as of **1 December 2010**, but our source data (Overture Maps,
derived largely from OpenStreetMap) describes the city *today*. `otc_pipeline/curate2010.py`
reconstructs 2010 in two ways:

1. **Automatically.** OSM element IDs are issued in time order. A feature whose oldest OSM element
   predates the snapshot was already mapped. Clusters of *newly mapped* local streets that are far
   from any 2010 street are treated as **post-2010 development**. Their streets, buildings, small
   parks and stormwater ponds are removed, and the land is shown as undeveloped fields.
2. **By hand, with the files in this folder.** Each entry must say what changed, when, and how sure
   we are.

| File | Purpose |
|---|---|
| `changes_after_2010.json` | Named features and areas that did not exist in December 2010, plus 2010 names for things renamed since, and features that changed form. |

Rules for editing:

- Prefer **names** over coordinates. Use polygons only for redevelopment sites that have no
  distinctive names.
- Put the opening or renaming year in `since`. In `confidence`, write `high` if documented, or
  `medium` if from memory or secondary sources.
- After editing, rebuild with `uv run otc-pipeline curate && uv run otc-pipeline tiles`, then check
  `data/reports/2010/report.json`.
