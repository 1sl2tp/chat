# PWA release audit

Read CURRENT_WORK.md, README_MAINTENANCE.md and README_NO_WAIT_WORKFLOW.md. Owners: version.json, sw.js, .github/workflows/pages.yml, tools/build_current_preview.py, index.source.html.

Check generated build_id against canonical build, Pages artifact, and live custom-domain version.json with cache-busting; HTTP 200 alone is insufficient. Check Service Worker cache epoch and update policy without deleting user storage. Inspect workflow concurrency and protected environment before retrying. Validate clean install and existing iPhone home-screen PWA upgrade. Do not bump cache epochs or create redundant deploy jobs just to guess. Record commit, CI result, deployed build_id and device verification separately.
