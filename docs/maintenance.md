# Build and update maintenance

## GitHub Actions

Every push and pull request still runs model/data checks, browser scenarios and Android/iOS builds. A new run cancels an older run of the same workflow on the same branch. Test or compilation failures remain fatal.

Routine runs no longer upload the entire screenshot history or native packages. The previous policy accumulated about 6.62 GB of artifacts in this repository by 6 October 2026 and exceeded the account's artifact allowance. No existing artifacts or billing settings were changed.

To obtain CI-generated files, select **Actions → Native Android build / Native iOS build → Run workflow → Upload files**. Browser diagnostics can be requested the same way from **Checks**. These optional uploads require available artifact storage and expire after three days. The separate **Prepare release files** workflow remains an explicit packaging operation. Existing artifacts keep their original expiry dates; changing the workflow does not reclaim their storage. See [GitHub's artifact retention documentation](https://docs.github.com/actions/configuring-and-managing-workflows/persisting-workflow-data-using-artifacts).

Failed browser assertions and page context are printed in the job log even when artifact storage is unavailable. Trace archives remain available locally in `test-results/`; automatic checks do not depend on their upload. Local native builds and release preparation remain available through the README commands.

## Cached website updates

Production requests for city graphs, maps, pavement geometry and 3D tiles include a hash derived from their source bytes. App and route-worker builds use the same generated revision table. A newly loaded app therefore bypasses stale unversioned cache entries even while an older service worker controls the page.

During activation, the new worker copies only compatible, explicitly versioned city assets before retiring old application caches. It does not modify downloaded-area storage. Dataset/version validation and tile checksums remain in place; unknown or missing geometry never becomes sun or shade.

Run `npm run build && npm run test:pwa:upgrade` to reproduce the returning-user test against an isolated local server. It seeds a deliberately stale test response, opens the real production planner under the older worker, installs the new worker, verifies retained data, and plans on both Zurich networks after disconnecting. Browser shard 1 runs this check in CI.

## Zurich calculation performance

Candidate exploration now uses exact walking-network lower bounds for every ordered leg and the total detour budget. Disconnected paths, river detours and rounded source lengths are accounted for. Static samples and coverage checks are reused; time-dependent sunlight, arrival times and incomplete tile results are recalculated. The static sample cache is bounded and cleared when switching between the normal and pavement networks.

`npm run data:verify:startup` checks cold worker-equivalent loading for summer noon and the autumn afternoon that originally timed out. It preserves frozen pre-optimization shade totals and the detour limit. The reference trips now need six tiles instead of nine and eleven. Timings in [startup-validation.json](startup-validation.json) describe the test machine, not a universal device guarantee. Android's separate regression pins the problematic afternoon before testing its offline restart; the existing 60-second assertions are unchanged.
