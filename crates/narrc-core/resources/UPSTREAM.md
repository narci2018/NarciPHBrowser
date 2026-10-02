# Upstream provenance

NarciPHBrowser does not ship a browser engine. It composes one: the fingerprints
are applied by [Camoufox](https://github.com/daijro/camoufox), a Firefox
patch-set, and NarciPHBrowser's job is to decide *what* to claim and to hand
that decision to the engine correctly.

Everything in this directory is either copied from Camoufox verbatim or
derived from it. This file records where the copy came from so that a browser
bump can tell you whether it is still valid.

## `camoufox-properties.json`

| | |
| --- | --- |
| Upstream path | `settings/properties.json` |
| Upstream repo | `daijro/camoufox` |
| Taken from | Firefox **156.0.1** (`upstream.sh`: `version=156.0.1`, `release=beta.32`) |
| Upstream licence | MPL-2.0 |
| Modified | No — byte-for-byte copy |

This file is the list of property names Camoufox reads out of `CAMOU_CONFIG_*`
and their expected value types. Camoufox looks every key up by name inside
Gecko; a key it does not recognise is **silently dropped**, with no warning and
no error. That makes this file load-bearing in a way a normal config schema is
not: an out-of-date copy produces profiles that launch cleanly and quietly
present the wrong device.

`schema.rs` compiles the copy in with `include_str!` and asserts that every
name in `schema::keys` exists in it, so a stale constant fails the build rather
than failing silently in production.

## When to re-vendor

Re-copy the file when either happens:

1. Camoufox bumps its Firefox pin past 156, **and** the upstream file changed.
2. A key you need does not appear in `schema::keys`.

To check whether upstream actually changed:

```sh
curl -fsSL https://raw.githubusercontent.com/daijro/camoufox/main/settings/properties.json \
  | diff -u crates/narrc-core/resources/camoufox-properties.json - && echo "identical"
```

If it is identical, bump the version line above anyway — the pin is a claim
about which Firefox the schema was verified against, and a stale claim is worse
than no claim.

## What is *not* here

Fonts. Camoufox ships a ~2.16 GB per-OS font bundle as a release asset and
points Linux at it through `FONTCONFIG_FILE`. NarciPHBrowser references the
bundle path beside the installed engine binary but never redistributes it, for
the licensing reasons upstream documents in `scripts/font-metrics/licences.py`.
