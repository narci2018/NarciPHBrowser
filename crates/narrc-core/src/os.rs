//! Target operating systems, and the strings that identify each one to a page.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

use crate::error::{Error, Result};

/// The OS an identity claims to be running on.
///
/// This is the root of the coherence tree. Almost every other decision — which
/// GPU strings are legal, what `devicePixelRatio` steps exist, how many cores
/// a machine can have, which font list is plausible — is a function of this and
/// nothing else. A profile that gets the OS right and a GPU wrong is worse
/// than one that is uniformly wrong, because it looks like a real machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetOs {
    Windows,
    Macos,
    Linux,
}

impl TargetOs {
    /// Every supported OS.
    pub const ALL: [TargetOs; 3] = [TargetOs::Windows, TargetOs::Macos, TargetOs::Linux];

    /// The lower-case key used in storage and in the API.
    pub fn as_str(&self) -> &'static str {
        match self {
            TargetOs::Windows => "windows",
            TargetOs::Macos => "macos",
            TargetOs::Linux => "linux",
        }
    }

    /// The OS a page sees through `navigator.platform`.
    pub fn navigator_platform(&self) -> &'static str {
        match self {
            TargetOs::Windows => "Win32",
            TargetOs::Macos => "MacIntel",
            TargetOs::Linux => "Linux x86_64",
        }
    }

    /// The token Camoufox's own launch options use, which is a *third*
    /// spelling: `win` / `mac` / `lin`.
    pub fn camoufox_token(&self) -> &'static str {
        match self {
            TargetOs::Windows => "win",
            TargetOs::Macos => "mac",
            TargetOs::Linux => "lin",
        }
    }

    /// The directory name of the fontconfig bundle shipped beside the engine.
    pub fn fontconfig_dir(&self) -> &'static str {
        match self {
            TargetOs::Windows => "windows",
            TargetOs::Macos => "macos",
            TargetOs::Linux => "linux",
        }
    }

    /// A human label for the UI.
    pub fn display_name(&self) -> &'static str {
        match self {
            TargetOs::Windows => "Windows",
            TargetOs::Macos => "macOS",
            TargetOs::Linux => "Linux",
        }
    }

    /// Infers the OS from a user agent string.
    ///
    /// Used when importing a profile whose OS was not recorded, and when a
    /// user pastes a UA into the editor by hand.
    ///
    /// The platform section — the parenthesised group right after `Mozilla/x`
    /// — is read first, because it is the authoritative part and because a UA
    /// may mention another OS elsewhere. That is not hypothetical: a
    /// `navigator.userAgent` override library that leaks, or a scraper that
    /// concatenates a comment, produces strings containing both `Windows` and
    /// `Macintosh`, and answering by first-substring-match makes the answer
    /// depend on which token the writer happened to use first.
    pub fn from_user_agent(user_agent: &str) -> Option<TargetOs> {
        let ua = user_agent.to_ascii_lowercase();

        // The platform section: the first parenthesised group.
        let platform = ua
            .split_once('(')
            .and_then(|(_, rest)| rest.split_once(')').map(|(inside, _)| inside));

        if let Some(platform) = platform {
            if let Some(os) = Self::from_platform_section(platform) {
                return Some(os);
            }
        }
        // No recognisable platform section, or a section that names no OS we
        // know: fall back to the whole string. Lowercased already.
        if ua.contains("windows nt") || ua.contains("win64") || ua.contains("wow64") {
            Some(TargetOs::Windows)
        } else if ua.contains("macintosh") || ua.contains("mac os") {
            Some(TargetOs::Macos)
        } else if ua.contains("linux") || ua.contains("x11") {
            Some(TargetOs::Linux)
        } else {
            None
        }
    }

    /// The OS named by a parenthesised platform section.
    ///
    /// Ordering matters within the section too: "Mac OS X" contains "mac",
    /// and a Windows UA has no competing token, so a single ordered pass over
    /// the three is unambiguous here.
    fn from_platform_section(section: &str) -> Option<TargetOs> {
        if section.contains("windows") || section.contains("win64") || section.contains("wow64") {
            Some(TargetOs::Windows)
        } else if section.contains("mac os") || section.contains("macintosh") {
            Some(TargetOs::Macos)
        } else if section.contains("linux") || section.contains("x11") {
            Some(TargetOs::Linux)
        } else {
            None
        }
    }
}

impl fmt::Display for TargetOs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for TargetOs {
    type Err = Error;

    fn from_str(value: &str) -> Result<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "windows" | "win" => Ok(TargetOs::Windows),
            "macos" | "mac" | "osx" | "darwin" => Ok(TargetOs::Macos),
            "linux" | "lin" => Ok(TargetOs::Linux),
            other => Err(Error::UnsupportedOs(other.to_owned())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_strings() {
        for os in TargetOs::ALL {
            assert_eq!(os.as_str().parse::<TargetOs>().unwrap(), os);
            assert_eq!(os.to_string().parse::<TargetOs>().unwrap(), os);
        }
    }

    #[test]
    fn accepts_the_alternative_spellings_tools_actually_emit() {
        assert_eq!("win".parse::<TargetOs>().unwrap(), TargetOs::Windows);
        assert_eq!("mac".parse::<TargetOs>().unwrap(), TargetOs::Macos);
        assert_eq!("lin".parse::<TargetOs>().unwrap(), TargetOs::Linux);
        assert_eq!("WINDOWS".parse::<TargetOs>().unwrap(), TargetOs::Windows);
    }

    #[test]
    fn rejects_an_unknown_os_by_name() {
        let error = "solaris".parse::<TargetOs>().unwrap_err();
        assert!(matches!(error, Error::UnsupportedOs(name) if name == "solaris"));
    }

    #[test]
    fn the_three_spellings_are_all_distinct_and_stable() {
        // "windows"/"win", "macos"/"mac", "linux"/"lin" -- a bug here means a
        // profile silently gets the wrong fontconfig directory.
        for os in TargetOs::ALL {
            assert_ne!(os.as_str(), os.camoufox_token());
            assert_ne!(os.camoufox_token(), os.fontconfig_dir());
        }
        assert_eq!(TargetOs::Windows.fontconfig_dir(), "windows");
        assert_eq!(TargetOs::Macos.fontconfig_dir(), "macos");
        assert_eq!(TargetOs::Linux.fontconfig_dir(), "linux");
    }

    #[test]
    fn infers_the_os_from_real_user_agents() {
        let cases = [
            (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
                TargetOs::Windows,
            ),
            (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0",
                TargetOs::Macos,
            ),
            (
                "Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0",
                TargetOs::Linux,
            ),
        ];
        for (ua, expected) in cases {
            assert_eq!(TargetOs::from_user_agent(ua), Some(expected));
        }
    }

    #[test]
    fn infers_nothing_from_an_unrecognisable_ua() {
        assert_eq!(TargetOs::from_user_agent("curl/8.4.0"), None);
        assert_eq!(TargetOs::from_user_agent(""), None);
    }

    #[test]
    fn ua_inference_covers_every_generated_platform() {
        // The three UA shapes this generator actually emits, checked against
        // the OS they claim. Using `navigator_platform` here instead would be
        // circular: "Win32" appears in no user agent in existence, so a parser
        // that recognised it would be recognising a fiction.
        for os in TargetOs::ALL {
            let generated = crate::generator::build_user_agent(4242, os);
            assert_eq!(
                TargetOs::from_user_agent(&generated),
                Some(os),
                "{generated} was not recognised as {os}"
            );
        }
    }

    #[test]
    fn the_platform_section_wins_over_a_token_elsewhere() {
        // A UA that names one OS in its platform section and another in a
        // comment. The section is authoritative; answering on whichever token
        // appeared first would make the result depend on string layout.
        let spoofed = "Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0 (built on a Macintosh)";
        assert_eq!(TargetOs::from_user_agent(spoofed), Some(TargetOs::Linux));

        let reverse = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0 (portable Windows build)";
        assert_eq!(TargetOs::from_user_agent(reverse), Some(TargetOs::Macos));
    }

    #[test]
    fn a_section_naming_no_known_os_falls_back_to_the_whole_string() {
        // "SeaMonkey"-era and embedded UAs put something unrecognisable in the
        // platform slot but name the OS later; refusing outright would make
        // importing those profiles impossible.
        let ua = "Mozilla/5.0 (compatible; SomeCrawler/2.0; +http://example.invalid) Firefox/156.0 (Windows NT 10.0)";
        assert_eq!(TargetOs::from_user_agent(ua), Some(TargetOs::Windows));
    }

    #[test]
    fn navigator_platform_values_match_what_pages_actually_see() {
        assert_eq!(TargetOs::Windows.navigator_platform(), "Win32");
        assert_eq!(TargetOs::Macos.navigator_platform(), "MacIntel");
        assert_eq!(TargetOs::Linux.navigator_platform(), "Linux x86_64");
    }
}
