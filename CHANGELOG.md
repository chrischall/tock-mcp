# Changelog

## [0.2.0](https://github.com/chrischall/tock-mcp/compare/v0.1.0...v0.2.0) (2026-07-13)


### Features

* adopt @chrischall/mcp-utils 0.12.0 (scrape subpath) ([#17](https://github.com/chrischall/tock-mcp/issues/17)) ([0119cd4](https://github.com/chrischall/tock-mcp/commit/0119cd46e5d92c71195a4b9860971411aeaaa41c))
* **skill:** add tock fpx access skill ([#25](https://github.com/chrischall/tock-mcp/issues/25)) ([d64d45f](https://github.com/chrischall/tock-mcp/commit/d64d45f6b702b0050ab52970b54999ca50557bc8))


### Bug Fixes

* **docs:** make requests.md §5→§6 runnable in sequence ([#28](https://github.com/chrischall/tock-mcp/issues/28)) ([2ac7779](https://github.com/chrischall/tock-mcp/commit/2ac7779614a746f28345981b84c37263aac633e8)), closes [#26](https://github.com/chrischall/tock-mcp/issues/26)
* protobuf field-number overflow + doc dedupe ([#16](https://github.com/chrischall/tock-mcp/issues/16)) ([29afb76](https://github.com/chrischall/tock-mcp/commit/29afb76dacc9102d86de4d9e82d63e583df67109))
* stop release-please pinning 0.1.0 + dedupe changelog ([#23](https://github.com/chrischall/tock-mcp/issues/23)) ([f6e8a26](https://github.com/chrischall/tock-mcp/commit/f6e8a2625afc8d9b2e1692ce22f4b89a2454d489)), closes [#22](https://github.com/chrischall/tock-mcp/issues/22)


### Refactor

* adopt scrape isCloudflareChallenge + UpstreamHttpError ([#13](https://github.com/chrischall/tock-mcp/issues/13)) ([b8d5e09](https://github.com/chrischall/tock-mcp/commit/b8d5e09c46bf9c2f5e3af0af442cb330aa377c2d))
* remove unused UpstreamHttpError re-export in client.ts ([#15](https://github.com/chrischall/tock-mcp/issues/15)) ([b10ebaa](https://github.com/chrischall/tock-mcp/commit/b10ebaa33a6629c3daea7fc900d1f3a256b28115))
* **skill:** move root SKILL.md into skills/, point plugin.json at ./skills/ ([#27](https://github.com/chrischall/tock-mcp/issues/27)) ([b6ed117](https://github.com/chrischall/tock-mcp/commit/b6ed117766076be8419e62fc777cc680fe22ebd2))


### Documentation

* finalize booking-protocol spec (auth-header findings) ([#7](https://github.com/chrischall/tock-mcp/issues/7)) ([a3147bd](https://github.com/chrischall/tock-mcp/commit/a3147bd9ae86a6b7faec30fa5c3754ab4e945d8d))

## 0.1.0 (2026-07-07)


### Features

* initial tock-mcp — Tock (exploretock.com) restaurant discovery ([4815a00](https://github.com/chrischall/tock-mcp/commit/4815a000006175d1b9bc6b0369715faab69a2fa5))
* rebuild authenticated reads on Tock's GraphQL API ([#4](https://github.com/chrischall/tock-mcp/issues/4)) ([1ab7cfa](https://github.com/chrischall/tock-mcp/commit/1ab7cfa686602d50235a6bce731288addf6c91ad))
* adopt @chrischall/mcp-utils 0.12.0 (scrape subpath) ([#17](https://github.com/chrischall/tock-mcp/issues/17)) ([0119cd4](https://github.com/chrischall/tock-mcp/commit/0119cd46e5d92c71195a4b9860971411aeaaa41c))


### Bug Fixes

* protobuf field-number overflow + doc dedupe ([#16](https://github.com/chrischall/tock-mcp/issues/16)) ([29afb76](https://github.com/chrischall/tock-mcp/commit/29afb76dacc9102d86de4d9e82d63e583df67109))


### Refactor

* adopt scrape isCloudflareChallenge + UpstreamHttpError ([#13](https://github.com/chrischall/tock-mcp/issues/13)) ([b8d5e09](https://github.com/chrischall/tock-mcp/commit/b8d5e09c46bf9c2f5e3af0af442cb330aa377c2d))
* remove unused UpstreamHttpError re-export in client.ts ([#15](https://github.com/chrischall/tock-mcp/issues/15)) ([b10ebaa](https://github.com/chrischall/tock-mcp/commit/b10ebaa33a6629c3daea7fc900d1f3a256b28115))


### Documentation

* finalize booking-protocol spec (auth-header findings) ([#7](https://github.com/chrischall/tock-mcp/issues/7)) ([a3147bd](https://github.com/chrischall/tock-mcp/commit/a3147bd9ae86a6b7faec30fa5c3754ab4e945d8d))
