# Directional action atlas packaging

Run `node scripts/build-class-directional-art.cjs --config docs/class-directional-sources.json` for a dry run. Add `--write` only after inspecting its output to update runtime assets. `--out DIRECTORY` changes the report directory. Default outputs are `reports/class-directional-art/{class}-actions.webp`, `{class}-contact.png`, `source-components.json`, and `provenance.json`.

The runtime layout is 1024×4096, 256-pixel cells, four authored phases per row. Row is `group * 4 + direction`, with direction order UP, DOWN, LEFT, RIGHT. No pose mirroring, geometry drawing, or per-frame automatic scale fitting occurs.

Configuration example (repeat to provide exactly 16 rows of four mappings for each class):

```json
{
  "sources": {
    "warrior_slash": {
      "file": "/workspace/generated_images/example.png",
      "columns": 4, "rows": 4, "scale": 0.55
    },
    "warrior_up_override": {
      "file": "/workspace/generated_images/override.png",
      "columns": 4, "rows": 1, "scale": 0.50
    }
  },
  "classes": {
    "warrior": {
      "rows": [
        [
          {"source":"warrior_up_override","row":0,"col":0,"headX":170,"footY":360},
          {"source":"warrior_up_override","row":0,"col":1},
          {"source":"warrior_up_override","row":0,"col":2},
          {"source":"warrior_up_override","row":0,"col":3}
        ]
      ]
    }
  }
}
```

Measure the head/body reference height and choose one `scale` per source sheet. A source may provide cell-relative `headCenterX` and `footY`; each mapped frame can override absolute `headX` and `footY`. Output aligns these at x=128 and y=244; `offsetX` and `offsetY` are optional output-pixel adjustments. With no landmarks, the provisional defaults are grid-cell horizontal center and the largest component's bottom; these require visual confirmation, especially when weapons extend below feet or characters jump.

Extraction uses full-sheet 8-connected components, not a cell rectangle, so a connected weapon crossing a nominal grid boundary is retained. Smaller disconnected neighboring bodies are excluded by their component centers. Detached parts above 32 opaque pixels inside the target cell require explicit `keepComponents` or `dropComponents` IDs from `source-components.json`; the tool refuses to silently discard a possible weapon. `bodyComponent` explicitly picks the primary component. `discardDetached: true` is available only for a manually reviewed cell. A source can change `fragmentMaxArea`; tiny unconnected antialias debris below that threshold is removed, while antialias pixels adjoining kept components are retained.

Image-edge contact and output-margin overflow fail rather than crop. `allowBoundary: true` can acknowledge a manually verified source-edge contact; it cannot restore missing pixels. Preserve original generated sources. Component IDs, removed parts, source hashes, fixed scales, landmarks and final atlas hashes are written to provenance.

`node scripts/validate-class-action-art.cjs` checks all 192 runtime cells for alpha content, safe margins, and at least three distinct phases per row. These are pixel checks, not a substitute for direction, anatomy, weapon grip, timing, or continuous-motion review.
