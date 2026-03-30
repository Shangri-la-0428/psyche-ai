# Release Cadence

Psyche should ship on a visible, repeatable rhythm.

## Cadence

- patch releases: correctness, docs, packaging, site fixes
- minor releases: new behavioral primitives, new host-facing ABI, new evaluation coverage
- release candidate: only when a risky host integration or migration needs wider bake time

## For every release

1. update `CHANGELOG.md`
2. update README / README_EN first-screen positioning if the public story changed
3. update the site if discovery pages or claims changed
4. build and run:
   - `npm run typecheck`
   - `npm test`
   - `cd site && npm run build`
5. prepare a release note from `docs/exposure/releases/<version>.md`
6. publish the GitHub release
7. publish npm if package metadata or runtime changed
8. deploy the site
9. announce with the community post kit

## Default release structure

- What changed
- Why it matters
- Performance / cost impact
- Upgrade notes
- Links
