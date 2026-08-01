# Changelog

## [0.2.5](https://github.com/chrischall/tock-mcp/compare/v0.2.4...v0.2.5) (2026-08-01)


### Documentation

* **skills:** add the post-booking verification protocol ([#49](https://github.com/chrischall/tock-mcp/issues/49)) ([d499a48](https://github.com/chrischall/tock-mcp/commit/d499a48bcde522553ef4a49d69575fb39b9d9634))

## [0.2.4](https://github.com/chrischall/tock-mcp/compare/v0.2.3...v0.2.4) (2026-07-30)


### Bug Fixes

* **deps:** bump @fetchproxy/* to 1.7.0 and @chrischall/mcp-utils to 0.14.0 ([#45](https://github.com/chrischall/tock-mcp/issues/45)) ([af81690](https://github.com/chrischall/tock-mcp/commit/af8169050bf87a59f7ad7e9a9a039a790bbea857))

## [0.2.3](https://github.com/chrischall/tock-mcp/compare/v0.2.2...v0.2.3) (2026-07-27)


### Documentation

* stop claiming no env config, and credit vitest's default excludes ([#43](https://github.com/chrischall/tock-mcp/issues/43)) ([97d18ac](https://github.com/chrischall/tock-mcp/commit/97d18ac7aced0a79e7c3767d213f3e55e4ea53a2))

## [0.2.2](https://github.com/chrischall/tock-mcp/compare/v0.2.1...v0.2.2) (2026-07-25)


### Bug Fixes

* **deps:** bump fast-uri out of the host-confusion advisories ([#37](https://github.com/chrischall/tock-mcp/issues/37)) ([dcc81c9](https://github.com/chrischall/tock-mcp/commit/dcc81c9023078e33d31610fa8a69cac839ce0297))

## [0.2.1](https://github.com/chrischall/tock-mcp/compare/v0.2.0...v0.2.1) (2026-07-19)


### Bug Fixes

* **release:** pin skill-path so the publish job can resolve SKILL.md ([#35](https://github.com/chrischall/tock-mcp/issues/35)) ([57e1a51](https://github.com/chrischall/tock-mcp/commit/57e1a51533580b8e454efaa1dbc9152a93ff10d6))


### Documentation

* add CLAUDE.md ([#31](https://github.com/chrischall/tock-mcp/issues/31)) ([6d86e82](https://github.com/chrischall/tock-mcp/commit/6d86e82585a08ad124cf11bb297a5b39d91054a2))

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
