//! Where the machine is, and everything derived from that.
//!
//! Timezone, `Accept-Language`, geolocation and the WebRTC host candidates are
//! four views of one fact. A profile that claims `Asia/Tokyo` while sending
//! `en-US,en;q=0.9` and a Brooklyn coordinate is not a machine, it is three
//! unrelated random draws — and the check is trivial for a server to run
//! against the proxy's actual exit IP.
//!
//! So they are drawn together, from one table, and [`GeoProfile`] is the unit
//! that travels between the generator, the UI and the launch-time GeoIP gate.

use crate::pools::{LocaleRegion, LOCALES};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};

/// A coherent "where is this machine" answer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GeoProfile {
    /// BCP-47 language, behind `navigator.language` and `locale:language`.
    pub language: String,
    /// ISO 3166-1 alpha-2, behind `locale:region`.
    pub region: String,
    /// IANA zone, behind `timezone`.
    pub timezone: String,
    /// Minutes east of UTC, for the UI's display and the coherence check.
    pub utc_offset: i32,
    /// Coordinates, behind `geolocation:latitude` / `:longitude`.
    pub latitude: f64,
    pub longitude: f64,
    /// Country code, for the GeoIP gate against the proxy's exit IP.
    pub country: String,
}

impl GeoProfile {
    /// A profile fixed to one country, choosing among that country's rows.
    ///
    /// This is what the launch path uses when a proxy is configured: the
    /// exit IP already knows where the machine is, and re-drawing would be
    /// drawing *against* the one fact that is externally verifiable.
    ///
    /// Whitespace and case are forgiven, because the value comes from a GeoIP
    /// response or an environment variable rather than from this crate.
    pub fn for_country(seed: u64, country: &str) -> Option<GeoProfile> {
        let wanted = country.trim();
        let candidates: Vec<&LocaleRegion> = LOCALES
            .iter()
            .map(|(_, region)| region)
            .filter(|region| region.country.eq_ignore_ascii_case(wanted))
            .collect();
        if candidates.is_empty() {
            return None;
        }
        let picked = candidates[Rng::stream(seed, "geo-country").below(candidates.len())];
        Some(Self::from_region(picked))
    }

    /// A profile fixed to one IANA timezone.
    pub fn for_timezone(seed: u64, timezone: &str) -> Option<GeoProfile> {
        let candidates: Vec<&LocaleRegion> = LOCALES
            .iter()
            .map(|(_, region)| region)
            .filter(|region| region.timezone == timezone)
            .collect();
        if candidates.is_empty() {
            return None;
        }
        let picked = candidates[Rng::stream(seed, "geo-timezone").below(candidates.len())];
        Some(Self::from_region(picked))
    }

    /// Draws a profile from the table.
    ///
    /// Uniform over rows, which is *not* the real distribution of browsers:
    /// Firefox is far more common in the US and Germany than in the Faroees.
    /// Weighting it properly needs traffic data this project does not have,
    /// and a made-up weight is worse than a uniform draw because it looks
    /// measured. What the table does encode is the number of distinct
    /// timezones per country, so the US and Canada are over-represented
    /// relative to a one-timezone country — which is the correct direction
    /// even if the magnitude is not right.
    pub fn draw(seed: u64) -> Self {
        let mut rng = Rng::stream(seed, "geo");
        let index = rng.below(LOCALES.len());
        Self::from_region(&LOCALES[index].1)
    }

    /// Reads a table row into a profile.
    pub fn from_region(region: &LocaleRegion) -> Self {
        Self {
            language: region.language.to_owned(),
            region: region.region.to_owned(),
            timezone: region.timezone.to_owned(),
            utc_offset: region.utc_offset,
            latitude: region.latitude,
            longitude: region.longitude,
            country: region.country.to_owned(),
        }
    }

    /// Jitters the coordinates by a few kilometres, the accuracy a real
    /// geolocation call reports.
    ///
    /// Rounded to four decimals — about 11 m, finer than any consumer
    /// geolocation reports — and it keeps two profiles in the same city from
    /// presenting byte-identical coordinates, which is its own kind of tell.
    pub fn jitter(&mut self, seed: u64) {
        let mut rng = Rng::stream(seed, "geo-jitter");
        // 0.02 degrees of latitude is ~2.2 km, the order of magnitude a browser
        // reports without a GPS fix. The offset is in degrees and is *added* to
        // the coordinate: scaling it before adding would put the machine in the
        // sea, so the rounding happens afterwards, on the sum.
        const JITTER_DEGREES: f64 = 0.02;
        const PLACES: f64 = 10_000.0;
        self.latitude = ((self.latitude + rng.range_f64(-JITTER_DEGREES, JITTER_DEGREES)) * PLACES)
            .round()
            / PLACES;
        self.longitude =
            ((self.longitude + rng.range_f64(-JITTER_DEGREES, JITTER_DEGREES)) * PLACES).round()
                / PLACES;
    }

    /// Whether the proxy's exit country matches this profile.
    ///
    /// The launch gate calls this before spawning the engine, so the user finds
    /// out from a dialog rather than from a ban. Whitespace is trimmed because
    /// the value arrives from a GeoIP HTTP response, an environment variable or
    /// a hand-typed field, and all three produce stray spaces.
    pub fn matches_country(&self, exit_country: &str) -> bool {
        self.country.eq_ignore_ascii_case(exit_country.trim())
    }
}

impl std::fmt::Display for GeoProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} / {} ({})",
            self.language, self.timezone, self.country
        )
    }
}

/// A host candidate's private address, for `webrtc:ipv4`.
///
/// Firefox reports mDNS-scrubbed candidates in modern configurations, but
/// Camoufox's `webrtc:ipv4` is what an identity *claims* the host candidate
/// to be, and a page that calls `getStats()` sees it alongside the SDP. The
/// value is therefore drawn from the RFC 1918 ranges, weighted towards the
/// ranges that reflect what a home router actually assigns.
pub fn draw_host_ipv4(seed: u64) -> String {
    let mut rng = Rng::stream(seed, "webrtc-ipv4");
    // 192.168.x.y dominates home networks; 10.x is more often a corporate LAN.
    match rng.weighted_index(&[0.72, 0.22, 0.06]) {
        Some(0) => format!("192.168.{}.{}", rng.below(256), rng.range_i32(2, 254)),
        Some(1) => format!(
            "10.{}.{}.{}",
            rng.below(256),
            rng.below(256),
            rng.range_i32(2, 254)
        ),
        _ => format!(
            "172.{}.{}.{}",
            rng.range_i32(16, 31),
            rng.below(256),
            rng.range_i32(2, 254)
        ),
    }
}

/// A host candidate's IPv6 address, for `webrtc:ipv6`.
///
/// A ULA (`fc00::/7`) is the address range a machine assigns itself when it
/// has no routable IPv6, which is the overwhelming majority of desktop
/// networks — so a `2001:` prefix on a residential identity is a tell.
pub fn draw_host_ipv6(seed: u64) -> String {
    let mut rng = Rng::stream(seed, "webrtc-ipv6");
    let groups: Vec<String> = (0..8)
        .map(|index| {
            if index == 0 {
                // fc00::/7, fixed high bits of a ULA.
                "fd".to_owned()
            } else {
                format!("{:x}", rng.below(0x1_0000))
            }
        })
        .collect();
    format!("{}:{}", groups[0], groups[1..].join(":"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn drawing_is_reproducible() {
        assert_eq!(GeoProfile::draw(42), GeoProfile::draw(42));
        assert_eq!(draw_host_ipv4(42), draw_host_ipv4(42));
        assert_eq!(draw_host_ipv6(42), draw_host_ipv6(42));
    }

    #[test]
    fn different_seeds_diverge() {
        let draws: HashSet<String> = (0..200)
            .map(|seed| GeoProfile::draw(seed).timezone.to_string())
            .collect();
        assert!(
            draws.len() > 10,
            "200 seeds produced only {} zones",
            draws.len()
        );
    }

    #[test]
    fn for_country_stays_inside_the_country() {
        for country in ["US", "DE", "JP", "BR"] {
            for seed in 0..25 {
                let profile = GeoProfile::for_country(seed, country).unwrap();
                assert_eq!(profile.country, country);
                assert!(
                    profile.timezone.starts_with(match country {
                        "US" => "America/",
                        "DE" => "Europe/",
                        "JP" => "Asia/",
                        "BR" => "America/",
                        _ => unreachable!(),
                    }),
                    "{country} drew timezone {}",
                    profile.timezone
                );
            }
        }
    }

    #[test]
    fn for_country_returns_none_for_a_country_not_in_the_table() {
        assert!(GeoProfile::for_country(1, "AQ").is_none());
        assert!(GeoProfile::for_country(1, "").is_none());
    }

    #[test]
    fn for_timezone_stays_on_the_zone() {
        for seed in 0..20 {
            let profile = GeoProfile::for_timezone(seed, "Europe/Berlin").unwrap();
            assert_eq!(profile.timezone, "Europe/Berlin");
        }
        assert!(GeoProfile::for_timezone(1, "Mars/Olympus").is_none());
    }

    #[test]
    fn the_us_has_several_distinct_zones_to_choose_from() {
        let zones: HashSet<String> = (0..60)
            .map(|seed| GeoProfile::for_country(seed, "US").unwrap().timezone)
            .collect();
        assert!(zones.len() >= 3, "US drew only {} zones", zones.len());
    }

    #[test]
    fn jitter_stays_within_a_few_kilometres() {
        let base = GeoProfile::draw(7);
        for seed in 0..200 {
            let mut jittered = base.clone();
            jittered.jitter(seed);
            let delta_lat = (jittered.latitude - base.latitude).abs();
            let delta_lon = (jittered.longitude - base.longitude).abs();
            assert!(delta_lat < 0.03, "latitude moved {delta_lat}");
            assert!(delta_lon < 0.03, "longitude moved {delta_lon}");
        }
    }

    #[test]
    fn jitter_actually_moves_the_coordinates() {
        let base = GeoProfile::draw(7);
        let mut moved = 0;
        for seed in 0..50 {
            let mut jittered = base.clone();
            jittered.jitter(seed);
            if jittered.latitude != base.latitude || jittered.longitude != base.longitude {
                moved += 1;
            }
        }
        assert_eq!(moved, 50, "every jitter should move at least one axis");
    }

    #[test]
    fn jitter_keeps_coordinates_rounded_to_four_decimals() {
        let mut profile = GeoProfile::draw(11);
        profile.jitter(11);
        let decimals = profile
            .latitude
            .to_string()
            .split('.')
            .nth(1)
            .map(|s| s.len());
        assert!(decimals.unwrap_or(0) <= 4, "got {}", profile.latitude);
    }

    #[test]
    fn jittered_coordinates_stay_on_the_globe() {
        for seed in 0..300 {
            let mut profile = GeoProfile::draw(seed);
            profile.jitter(seed);
            assert!((-90.0..=90.0).contains(&profile.latitude));
            assert!((-180.0..=180.0).contains(&profile.longitude));
        }
    }

    #[test]
    fn host_ipv4s_are_private_and_never_the_network_or_broadcast_address() {
        for seed in 0..2000 {
            let ip = draw_host_ipv4(seed);
            let octets: Vec<u32> = ip.split('.').map(|part| part.parse().unwrap()).collect();
            assert_eq!(octets.len(), 4, "{ip}");
            assert!(octets.iter().all(|octet| *octet <= 255), "{ip}");
            assert!(
                octets[3] >= 2 && octets[3] <= 254,
                "{ip} has a .0 or .255 host"
            );

            let private = (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 10)
                || (octets[0] == 172 && (16..=31).contains(&octets[1]));
            assert!(private, "{ip} is not RFC 1918");
        }
    }

    #[test]
    fn host_ipv4s_lean_towards_the_192_168_range_home_routers_assign() {
        let in_range = (0..1000)
            .filter(|seed| draw_host_ipv4(*seed).starts_with("192.168."))
            .count();
        assert!(in_range > 600, "only {in_range}/1000 landed in 192.168/16");
    }

    #[test]
    fn host_ipv6s_are_ula_addresses() {
        for seed in 0..500 {
            let ip = draw_host_ipv6(seed);
            assert!(ip.starts_with("fd"), "{ip} is not in fc00::/7");
            let groups: Vec<&str> = ip.split(':').collect();
            assert_eq!(groups.len(), 8, "{ip} is not eight groups");
            assert!(groups.iter().all(|group| group.len() <= 4), "{ip}");
            assert!(
                groups[1..]
                    .iter()
                    .all(|g| u16::from_str_radix(g, 16).is_ok()),
                "{ip}"
            );
        }
    }

    #[test]
    fn country_matching_ignores_case_and_whitespace() {
        let profile = GeoProfile::draw(1);
        assert!(profile.matches_country(&profile.country.to_uppercase()));
        assert!(profile.matches_country(&format!(" {} ", profile.country)));
        assert!(!profile.matches_country("AQ"));
    }

    #[test]
    fn display_is_readable() {
        let profile = GeoProfile::draw(3);
        let rendered = profile.to_string();
        assert!(
            rendered.contains('/') && rendered.contains('('),
            "{rendered}"
        );
    }
}
