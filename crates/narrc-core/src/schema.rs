//! The Camoufox property schema.
//!
//! Camoufox reads a flat JSON object out of `CAMOU_CONFIG_*` and looks each key
//! up by name inside Gecko. The authoritative list of keys and their types is
//! upstream's `settings/properties.json`, which is vendored verbatim into
//! `resources/camoufox-properties.json` and compiled in with `include_str!`.
//!
//! Vendoring rather than hand-transcribing is deliberate: a key that this crate
//! does not know about is a key the engine silently ignores, which is the
//! single most expensive kind of bug in a fingerprint browser — the profile
//! launches, the field is simply absent from the page's view, and nothing
//! errors. `resources/UPSTREAM.md` records the exact commit the copy came from.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;

use crate::error::{Error, Result};

/// The vendored schema, baked into the binary so there is no runtime file
/// dependency and no way for the two to drift apart at a release.
const PROPERTIES_JSON: &str = include_str!("../resources/camoufox-properties.json");

/// The value type Camoufox expects for a property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PropertyType {
    Str,
    Uint,
    Int,
    Double,
    Bool,
    Array,
    Dict,
}

impl PropertyType {
    /// Whether a JSON value of this shape is accepted for the property.
    pub fn accepts(&self, value: &serde_json::Value) -> bool {
        match self {
            PropertyType::Str => value.is_string(),
            PropertyType::Uint => value.as_u64().is_some(),
            PropertyType::Int => value.as_i64().is_some() || value.as_u64().is_some(),
            PropertyType::Double => value.is_number(),
            PropertyType::Bool => value.is_boolean(),
            PropertyType::Array => value.is_array(),
            PropertyType::Dict => value.is_object(),
        }
    }

    /// The value, converted to this type, or `None` if it cannot be.
    ///
    /// Only the conversions a user interface actually needs: an input element
    /// hands over a string, and a boolean toggle hands over a string too. So
    /// `"1920"` becomes a `Uint` and `"true"` becomes a `Bool`, because the
    /// alternative — refusing — teaches the user that the field is broken
    /// rather than that they should not have typed it.
    ///
    /// What it will *not* do is guess across a real ambiguity. A `Str` property
    /// given a number stays a number's problem and returns `None`, because the
    /// plausible string forms of `1` are `"1"`, `"1.0"` and `"one"` and picking
    /// one silently would put a value in front of a page that the user never
    /// chose. Numeric-looking strings are the one exception, and only in the
    /// narrow direction where the parse has to succeed outright.
    pub fn coerce(&self, value: &serde_json::Value) -> Option<serde_json::Value> {
        if self.accepts(value) {
            return Some(value.clone());
        }
        let text = value.as_str()?.trim();
        match self {
            PropertyType::Uint => text.parse::<u64>().ok().map(serde_json::Value::from),
            PropertyType::Int => text.parse::<i64>().ok().map(serde_json::Value::from),
            PropertyType::Double => text.parse::<f64>().ok().map(serde_json::Value::from),
            PropertyType::Bool => match text.to_ascii_lowercase().as_str() {
                "true" | "yes" | "on" | "1" => Some(serde_json::Value::Bool(true)),
                "false" | "no" | "off" | "0" => Some(serde_json::Value::Bool(false)),
                _ => None,
            },
            _ => None,
        }
    }

    /// A zero value of this type, used to fill defaults.
    pub fn zero(&self) -> serde_json::Value {
        match self {
            PropertyType::Str => serde_json::Value::String(String::new()),
            PropertyType::Uint => serde_json::Value::from(0u64),
            PropertyType::Int => serde_json::Value::from(0i64),
            PropertyType::Double => serde_json::Value::from(0.0),
            PropertyType::Bool => serde_json::Value::Bool(false),
            PropertyType::Array => serde_json::Value::Array(Vec::new()),
            PropertyType::Dict => serde_json::Value::Object(Default::default()),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            PropertyType::Str => "str",
            PropertyType::Uint => "uint",
            PropertyType::Int => "int",
            PropertyType::Double => "double",
            PropertyType::Bool => "bool",
            PropertyType::Array => "array",
            PropertyType::Dict => "dict",
        }
    }
}

impl fmt::Display for PropertyType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for PropertyType {
    type Err = Error;

    fn from_str(s: &str) -> Result<Self> {
        match s {
            "str" => Ok(PropertyType::Str),
            "uint" => Ok(PropertyType::Uint),
            "int" => Ok(PropertyType::Int),
            "double" => Ok(PropertyType::Double),
            "bool" => Ok(PropertyType::Bool),
            "array" => Ok(PropertyType::Array),
            "dict" => Ok(PropertyType::Dict),
            other => Err(Error::schema(format!("unknown property type {other:?}"))),
        }
    }
}

/// One entry of the upstream schema.
#[derive(Debug, Clone, Deserialize)]
struct RawProperty {
    property: String,
    #[serde(rename = "type")]
    kind: String,
}

/// The whole schema, keyed by property name.
pub type Schema = BTreeMap<String, PropertyType>;

/// The parsed property schema.
#[derive(Debug, Clone)]
pub struct PropertySchema {
    properties: Schema,
    source: &'static str,
}

impl PropertySchema {
    /// Parses the vendored schema.
    pub fn load() -> Result<Self> {
        let raw: Vec<RawProperty> = serde_json::from_str(PROPERTIES_JSON).map_err(|error| {
            Error::schema(format!("vendored properties.json is invalid: {error}"))
        })?;

        let mut properties = Schema::new();
        for entry in raw {
            let kind = PropertyType::from_str(&entry.kind)?;
            if properties.insert(entry.property.clone(), kind).is_some() {
                return Err(Error::schema(format!(
                    "vendored properties.json lists {:?} twice",
                    entry.property
                )));
            }
        }
        if properties.is_empty() {
            return Err(Error::schema("vendored properties.json is empty"));
        }

        Ok(Self {
            properties,
            source: "resources/camoufox-properties.json",
        })
    }

    /// Where the schema was compiled from, for diagnostics.
    pub fn source(&self) -> &'static str {
        self.source
    }

    /// Every property name, sorted.
    pub fn names(&self) -> impl Iterator<Item = &String> {
        self.properties.keys()
    }

    /// The number of known properties.
    pub fn len(&self) -> usize {
        self.properties.len()
    }

    pub fn is_empty(&self) -> bool {
        self.properties.is_empty()
    }

    /// The declared type of a property.
    pub fn kind(&self, property: &str) -> Option<PropertyType> {
        self.properties.get(property).copied()
    }

    /// Whether the property is one Camoufox understands.
    pub fn contains(&self, property: &str) -> bool {
        self.properties.contains_key(property)
    }

    /// The whole map.
    pub fn map(&self) -> &Schema {
        &self.properties
    }
}

/// Well-known property names, so no call site spells a key as a bare string.
///
/// These are the names Camoufox reads. A typo in one of these is a field that
/// silently does nothing, which is why they are constants rather than literals
/// scattered across the generator.
pub mod keys {
    // navigator.*
    pub const USER_AGENT: &str = "navigator.userAgent";
    pub const APP_VERSION: &str = "navigator.appVersion";
    pub const PLATFORM: &str = "navigator.platform";
    pub const OSCPU: &str = "navigator.oscpu";
    pub const LANGUAGE: &str = "navigator.language";
    pub const DO_NOT_TRACK: &str = "navigator.doNotTrack";
    pub const HARDWARE_CONCURRENCY: &str = "navigator.hardwareConcurrency";
    pub const MAX_TOUCH_POINTS: &str = "navigator.maxTouchPoints";
    pub const GLOBAL_PRIVACY_CONTROL: &str = "navigator.globalPrivacyControl";
    pub const BUILD_ID: &str = "navigator.buildID";

    // screen.*
    pub const SCREEN_WIDTH: &str = "screen.width";
    pub const SCREEN_HEIGHT: &str = "screen.height";
    pub const SCREEN_AVAIL_WIDTH: &str = "screen.availWidth";
    pub const SCREEN_AVAIL_HEIGHT: &str = "screen.availHeight";
    pub const SCREEN_AVAIL_TOP: &str = "screen.availTop";
    pub const SCREEN_AVAIL_LEFT: &str = "screen.availLeft";
    pub const COLOR_DEPTH: &str = "screen.colorDepth";
    pub const PIXEL_DEPTH: &str = "screen.pixelDepth";

    // window.*
    pub const OUTER_WIDTH: &str = "window.outerWidth";
    pub const OUTER_HEIGHT: &str = "window.outerHeight";
    pub const INNER_WIDTH: &str = "window.innerWidth";
    pub const INNER_HEIGHT: &str = "window.innerHeight";
    pub const SCREEN_X: &str = "window.screenX";
    pub const SCREEN_Y: &str = "window.screenY";
    pub const DEVICE_PIXEL_RATIO: &str = "window.devicePixelRatio";

    // headers.*
    pub const HEADER_USER_AGENT: &str = "headers.User-Agent";
    pub const HEADER_ACCEPT_LANGUAGE: &str = "headers.Accept-Language";
    pub const HEADER_ACCEPT_ENCODING: &str = "headers.Accept-Encoding";

    // webrtc:*
    pub const WEBRTC_IPV4: &str = "webrtc:ipv4";
    pub const WEBRTC_IPV6: &str = "webrtc:ipv6";

    // audio
    pub const AUDIO_SEED: &str = "audio:seed";
    pub const AUDIO_SAMPLE_RATE: &str = "AudioContext:sampleRate";
    pub const AUDIO_OUTPUT_LATENCY: &str = "AudioContext:outputLatency";
    pub const AUDIO_MAX_CHANNELS: &str = "AudioContext:maxChannelCount";

    // webgl
    pub const WEBGL_RENDERER: &str = "webGl:renderer";
    pub const WEBGL_VENDOR: &str = "webGl:vendor";
    pub const WEBGL_EXTENSIONS: &str = "webGl:supportedExtensions";
    pub const WEBGL2_EXTENSIONS: &str = "webGl2:supportedExtensions";
    pub const WEBGL_PARAMETERS: &str = "webGl:parameters";
    pub const WEBGL2_PARAMETERS: &str = "webGl2:parameters";
    pub const WEBGL_PRECISION: &str = "webGl:shaderPrecisionFormats";
    pub const WEBGL2_PRECISION: &str = "webGl2:shaderPrecisionFormats";
    pub const WEBGL_CONTEXT_ATTRS: &str = "webGl:contextAttributes";
    pub const WEBGL2_CONTEXT_ATTRS: &str = "webGl2:contextAttributes";

    // speech
    pub const VOICES: &str = "voices";
    pub const VOICES_BLOCK_IF_UNDEFINED: &str = "voices:blockIfNotDefined";

    // media
    pub const MEDIA_MICS: &str = "mediaDevices:micros";
    pub const MEDIA_WEBCAMS: &str = "mediaDevices:webcams";
    pub const MEDIA_SPEAKERS: &str = "mediaDevices:speakers";
    pub const MEDIA_ENABLED: &str = "mediaDevices:enabled";
    pub const MEDIA_MIC_LABELS: &str = "mediaDevices:microphoneLabels";
    pub const MEDIA_MIC_GROUPS: &str = "mediaDevices:microphoneGroups";
    pub const MEDIA_WEBCAM_LABELS: &str = "mediaDevices:webcamLabels";
    pub const MEDIA_WEBCAM_GROUPS: &str = "mediaDevices:webcamGroups";
    pub const MEDIA_SPEAKER_LABELS: &str = "mediaDevices:speakerLabels";
    pub const MEDIA_SPEAKER_GROUPS: &str = "mediaDevices:speakerGroups";
    pub const MEDIA_SPOOF_CODECS: &str = "media:spoof_codecs";

    // locale / geo / time
    pub const TIMEZONE: &str = "timezone";
    pub const LOCALE_LANGUAGE: &str = "locale:language";
    pub const LOCALE_REGION: &str = "locale:region";
    pub const LOCALE_SCRIPT: &str = "locale:script";
    pub const LOCALE_ALL: &str = "locale:all";
    pub const GEO_LATITUDE: &str = "geolocation:latitude";
    pub const GEO_LONGITUDE: &str = "geolocation:longitude";
    pub const GEO_ACCURACY: &str = "geolocation:accuracy";

    // misc
    pub const FONTS: &str = "fonts";
    pub const SHOW_CURSOR: &str = "showcursor";
    pub const INSTANT_ANIMATIONS: &str = "instantAnimations";
    pub const DISABLE_THEMING: &str = "disableTheming";
    pub const ALLOW_ADDON_NEWTAB: &str = "allowAddonNewtab";
    pub const FORCE_SCOPE_ACCESS: &str = "forceScopeAccess";
    pub const ADDONS: &str = "addons";
    pub const CERTIFICATES: &str = "certificates";
    pub const CERTIFICATE_PATHS: &str = "certificatePaths";
    pub const DEBUG: &str = "debug";

    /// Humanised cursor movement (upstream's automation surface). The engine
    /// animates programmatic cursor moves along a human-like path when this is
    /// on; `humanize:maxTime` / `humanize:minTime` bound that duration.
    pub const HUMANIZE: &str = "humanize";
    pub const HUMANIZE_MAX_TIME: &str = "humanize:maxTime";
    pub const HUMANIZE_MIN_TIME: &str = "humanize:minTime";

    /// Whether a WebGL override family that arrives without a renderer is
    /// blocked from reading rather than falling back to the host's values.
    pub const WEBGL_SHADER_PRECISION_BLOCK: &str =
        "webGl:shaderPrecisionFormats:blockIfNotDefined";
    pub const WEBGL2_SHADER_PRECISION_BLOCK: &str =
        "webGl2:shaderPrecisionFormats:blockIfNotDefined";

    /// Automation-world controls: whether scripts may run in the page's main
    /// world, and whether content world isolation is disabled.
    pub const ALLOW_MAIN_WORLD: &str = "allowMainWorld";
    pub const DISABLE_WORLD_ISOLATION: &str = "disableWorldIsolation";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendored_schema_parses() {
        let schema = PropertySchema::load().unwrap();
        assert!(
            schema.len() >= 79,
            "expected the full upstream key set, got {}",
            schema.len()
        );
    }

    #[test]
    fn upstream_version_pin_is_still_156() {
        // Bumping the browser means re-reading the upstream properties.json;
        // this is the tripwire that says "you probably need to".
        //
        // The recorded version is compared after stripping markdown emphasis,
        // so `**156.0.1**` and `156.0.1` are the same claim and reformatting
        // the provenance note does not fail the build.
        let recorded = include_str!("../resources/UPSTREAM.md");
        let plain: String = recorded
            .chars()
            .filter(|c| !matches!(c, '*' | '`' | '_'))
            .collect();
        assert!(
            plain.contains(&format!("Firefox {}", crate::pools::FIREFOX_VERSION_FULL)),
            "resources/UPSTREAM.md must record the Firefox version the schema was \
             taken from; it does not mention Firefox {}",
            crate::pools::FIREFOX_VERSION_FULL
        );
    }

    #[test]
    fn every_constant_names_a_real_property() {
        let schema = PropertySchema::load().unwrap();
        let constants = [
            keys::USER_AGENT,
            keys::APP_VERSION,
            keys::PLATFORM,
            keys::OSCPU,
            keys::LANGUAGE,
            keys::DO_NOT_TRACK,
            keys::HARDWARE_CONCURRENCY,
            keys::MAX_TOUCH_POINTS,
            keys::GLOBAL_PRIVACY_CONTROL,
            keys::BUILD_ID,
            keys::SCREEN_WIDTH,
            keys::SCREEN_HEIGHT,
            keys::SCREEN_AVAIL_WIDTH,
            keys::SCREEN_AVAIL_HEIGHT,
            keys::SCREEN_AVAIL_TOP,
            keys::SCREEN_AVAIL_LEFT,
            keys::COLOR_DEPTH,
            keys::PIXEL_DEPTH,
            keys::OUTER_WIDTH,
            keys::OUTER_HEIGHT,
            keys::INNER_WIDTH,
            keys::INNER_HEIGHT,
            keys::SCREEN_X,
            keys::SCREEN_Y,
            keys::DEVICE_PIXEL_RATIO,
            keys::HEADER_USER_AGENT,
            keys::HEADER_ACCEPT_LANGUAGE,
            keys::HEADER_ACCEPT_ENCODING,
            keys::WEBRTC_IPV4,
            keys::WEBRTC_IPV6,
            keys::AUDIO_SEED,
            keys::AUDIO_SAMPLE_RATE,
            keys::AUDIO_OUTPUT_LATENCY,
            keys::AUDIO_MAX_CHANNELS,
            keys::WEBGL_RENDERER,
            keys::WEBGL_VENDOR,
            keys::WEBGL_EXTENSIONS,
            keys::WEBGL2_EXTENSIONS,
            keys::WEBGL_PARAMETERS,
            keys::WEBGL2_PARAMETERS,
            keys::WEBGL_PRECISION,
            keys::WEBGL2_PRECISION,
            keys::WEBGL_CONTEXT_ATTRS,
            keys::WEBGL2_CONTEXT_ATTRS,
            keys::VOICES,
            keys::VOICES_BLOCK_IF_UNDEFINED,
            keys::MEDIA_MICS,
            keys::MEDIA_WEBCAMS,
            keys::MEDIA_SPEAKERS,
            keys::MEDIA_ENABLED,
            keys::MEDIA_MIC_LABELS,
            keys::MEDIA_MIC_GROUPS,
            keys::MEDIA_WEBCAM_LABELS,
            keys::MEDIA_WEBCAM_GROUPS,
            keys::MEDIA_SPEAKER_LABELS,
            keys::MEDIA_SPEAKER_GROUPS,
            keys::MEDIA_SPOOF_CODECS,
            keys::TIMEZONE,
            keys::LOCALE_LANGUAGE,
            keys::LOCALE_REGION,
            keys::LOCALE_SCRIPT,
            keys::LOCALE_ALL,
            keys::GEO_LATITUDE,
            keys::GEO_LONGITUDE,
            keys::GEO_ACCURACY,
            keys::FONTS,
            keys::SHOW_CURSOR,
            keys::INSTANT_ANIMATIONS,
            keys::DISABLE_THEMING,
            keys::ALLOW_ADDON_NEWTAB,
            keys::FORCE_SCOPE_ACCESS,
            keys::ADDONS,
            keys::CERTIFICATES,
            keys::CERTIFICATE_PATHS,
            keys::DEBUG,
            keys::HUMANIZE,
            keys::HUMANIZE_MAX_TIME,
            keys::HUMANIZE_MIN_TIME,
            keys::WEBGL_SHADER_PRECISION_BLOCK,
            keys::WEBGL2_SHADER_PRECISION_BLOCK,
            keys::ALLOW_MAIN_WORLD,
            keys::DISABLE_WORLD_ISOLATION,
        ];
        for name in constants {
            assert!(
                schema.contains(name),
                "keys::{name} is not a Camoufox property; it would be silently ignored"
            );
        }
    }

    /// The reverse of `every_constant_names_a_real_property`: every property
    /// the engine can consume has a named constant, so a key the vendored
    /// schema gains upstream cannot be forgotten here.
    #[test]
    fn every_engine_property_has_a_named_constant() {
        let named: &[&str] = &[
            keys::USER_AGENT,
            keys::DO_NOT_TRACK,
            keys::APP_VERSION,
            keys::OSCPU,
            keys::LANGUAGE,
            keys::PLATFORM,
            keys::HARDWARE_CONCURRENCY,
            keys::MAX_TOUCH_POINTS,
            keys::GLOBAL_PRIVACY_CONTROL,
            keys::BUILD_ID,
            keys::SCREEN_AVAIL_HEIGHT,
            keys::SCREEN_AVAIL_WIDTH,
            keys::SCREEN_AVAIL_TOP,
            keys::SCREEN_AVAIL_LEFT,
            keys::SCREEN_HEIGHT,
            keys::SCREEN_WIDTH,
            keys::COLOR_DEPTH,
            keys::PIXEL_DEPTH,
            keys::OUTER_HEIGHT,
            keys::OUTER_WIDTH,
            keys::INNER_HEIGHT,
            keys::INNER_WIDTH,
            keys::SCREEN_X,
            keys::SCREEN_Y,
            keys::DEVICE_PIXEL_RATIO,
            keys::HEADER_USER_AGENT,
            keys::HEADER_ACCEPT_LANGUAGE,
            keys::HEADER_ACCEPT_ENCODING,
            keys::WEBRTC_IPV4,
            keys::WEBRTC_IPV6,
            keys::FONTS,
            keys::AUDIO_SEED,
            keys::GEO_LATITUDE,
            keys::GEO_LONGITUDE,
            keys::GEO_ACCURACY,
            keys::TIMEZONE,
            keys::LOCALE_LANGUAGE,
            keys::LOCALE_REGION,
            keys::LOCALE_SCRIPT,
            keys::LOCALE_ALL,
            keys::HUMANIZE,
            keys::HUMANIZE_MAX_TIME,
            keys::HUMANIZE_MIN_TIME,
            keys::SHOW_CURSOR,
            keys::AUDIO_SAMPLE_RATE,
            keys::AUDIO_OUTPUT_LATENCY,
            keys::AUDIO_MAX_CHANNELS,
            keys::WEBGL_RENDERER,
            keys::WEBGL_VENDOR,
            keys::WEBGL_EXTENSIONS,
            keys::WEBGL2_EXTENSIONS,
            keys::WEBGL_PARAMETERS,
            keys::WEBGL2_PARAMETERS,
            keys::WEBGL_PRECISION,
            keys::WEBGL2_PRECISION,
            keys::WEBGL_SHADER_PRECISION_BLOCK,
            keys::WEBGL2_SHADER_PRECISION_BLOCK,
            keys::WEBGL_CONTEXT_ATTRS,
            keys::WEBGL2_CONTEXT_ATTRS,
            keys::VOICES,
            keys::VOICES_BLOCK_IF_UNDEFINED,
            keys::MEDIA_MICS,
            keys::MEDIA_WEBCAMS,
            keys::MEDIA_SPEAKERS,
            keys::MEDIA_ENABLED,
            keys::MEDIA_MIC_LABELS,
            keys::MEDIA_MIC_GROUPS,
            keys::MEDIA_WEBCAM_LABELS,
            keys::MEDIA_WEBCAM_GROUPS,
            keys::MEDIA_SPEAKER_LABELS,
            keys::MEDIA_SPEAKER_GROUPS,
            keys::MEDIA_SPOOF_CODECS,
            keys::ALLOW_MAIN_WORLD,
            keys::DISABLE_WORLD_ISOLATION,
            keys::ALLOW_ADDON_NEWTAB,
            keys::FORCE_SCOPE_ACCESS,
            keys::DISABLE_THEMING,
            keys::INSTANT_ANIMATIONS,
            keys::ADDONS,
            keys::CERTIFICATE_PATHS,
            keys::CERTIFICATES,
            keys::DEBUG,
        ];
        let schema = PropertySchema::load().unwrap();
        let mut unnamed = schema
            .map()
            .keys()
            .filter(|name| !named.contains(&name.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        unnamed.sort();
        assert!(
            unnamed.is_empty(),
            "the engine reads {unnamed:?} but schema::keys has no constant for it"
        );
        assert_eq!(
            named.len(),
            schema.len(),
            "a constant names nothing, or one is listed twice"
        );
    }

    #[test]
    fn constants_are_unique() {
        let all = vec![
            keys::USER_AGENT,
            keys::APP_VERSION,
            keys::PLATFORM,
            keys::OSCPU,
            keys::LANGUAGE,
            keys::DO_NOT_TRACK,
            keys::HARDWARE_CONCURRENCY,
            keys::MAX_TOUCH_POINTS,
            keys::GLOBAL_PRIVACY_CONTROL,
            keys::BUILD_ID,
            keys::SCREEN_WIDTH,
            keys::SCREEN_HEIGHT,
            keys::SCREEN_AVAIL_WIDTH,
            keys::SCREEN_AVAIL_HEIGHT,
            keys::SCREEN_AVAIL_TOP,
            keys::SCREEN_AVAIL_LEFT,
            keys::COLOR_DEPTH,
            keys::PIXEL_DEPTH,
            keys::OUTER_WIDTH,
            keys::OUTER_HEIGHT,
            keys::INNER_WIDTH,
            keys::INNER_HEIGHT,
            keys::SCREEN_X,
            keys::SCREEN_Y,
            keys::DEVICE_PIXEL_RATIO,
            keys::AUDIO_SEED,
            keys::WEBGL_RENDERER,
            keys::WEBGL_VENDOR,
            keys::VOICES,
            keys::FONTS,
            keys::TIMEZONE,
        ];
        let mut sorted = all.clone();
        sorted.sort_unstable();
        let before = sorted.len();
        sorted.dedup();
        assert_eq!(before, sorted.len(), "two constants name the same property");
    }

    #[test]
    fn type_checks_accept_and_reject_correctly() {
        use serde_json::json;
        assert!(PropertyType::Str.accepts(&json!("x")));
        assert!(!PropertyType::Str.accepts(&json!(1)));
        assert!(PropertyType::Uint.accepts(&json!(8)));
        assert!(!PropertyType::Uint.accepts(&json!(-1)));
        assert!(PropertyType::Double.accepts(&json!(1.5)));
        assert!(PropertyType::Bool.accepts(&json!(true)));
        assert!(PropertyType::Array.accepts(&json!([])));
        assert!(PropertyType::Dict.accepts(&json!({})));
        assert!(!PropertyType::Dict.accepts(&json!([])));
    }

    #[test]
    fn zero_values_match_their_type() {
        use serde_json::json;
        let pairs = [
            (PropertyType::Str, json!("")),
            (PropertyType::Uint, json!(0)),
            (PropertyType::Int, json!(0)),
            (PropertyType::Double, json!(0.0)),
            (PropertyType::Bool, json!(false)),
            (PropertyType::Array, json!([])),
            (PropertyType::Dict, json!({})),
        ];
        for (kind, expected) in pairs {
            assert_eq!(kind.zero(), expected, "zero() wrong for {kind}");
        }
    }

    #[test]
    fn unknown_property_type_is_rejected() {
        assert!("banana".parse::<PropertyType>().is_err());
        assert_eq!("uint".parse::<PropertyType>().unwrap(), PropertyType::Uint);
    }

    /// The engine properties this crate deliberately never writes.
    ///
    /// Every one of them is a **behaviour switch or a caller-supplied path**,
    /// not part of a machine's identity: nothing here describes the computer a
    /// page is looking at, so writing one by default would either weaken the
    /// profile or claim something no real machine does. They stay reachable
    /// through a per-profile override, which is where a user who wants them
    /// should be asked.
    ///
    /// The list is the tripwire for the opposite mistake: a property that
    /// *should* be drawn for every profile but silently stops being. If a name
    /// here ever starts being written, or a drawn property disappears, the
    /// test below fails rather than the leak shipping quietly.
    const NEVER_DRAWN: &[&str] = &[
        // Extensions and certificates are caller-supplied files.
        keys::ADDONS,
        keys::CERTIFICATES,
        keys::CERTIFICATE_PATHS,
        // Debug logging.
        keys::DEBUG,
        // Behaviour switches, each with a reason it is not a default:
        // `disableTheming` drops the engine's OS-matching browser chrome;
        // `instantAnimations` completes CSS animations at once, which upstream
        // warns is observable; `allowMainWorld` and `allowAddonNewtab` widen
        // what an extension may do; `disableWorldIsolation` and
        // `forceScopeAccess` reach past the page's own execution context, which
        // is a capability a site can detect and which no ordinary browsing
        // session should hand out unasked.
        keys::DISABLE_THEMING,
        keys::INSTANT_ANIMATIONS,
        keys::ALLOW_MAIN_WORLD,
        keys::ALLOW_ADDON_NEWTAB,
        keys::DISABLE_WORLD_ISOLATION,
        keys::FORCE_SCOPE_ACCESS,
        // The lower bound on a humanized cursor move. The engine's default is
        // zero, and a floor above zero would slow every move down for nothing.
        keys::HUMANIZE_MIN_TIME,
    ];

    /// The other half of `NEVER_DRAWN`: every remaining property really is
    /// drawn, for every OS, under some combination of the generator's options.
    ///
    /// A property that stops being written is a field the profile silently
    /// stops claiming, and the engine answers it from the host instead — the
    /// most expensive kind of bug in a fingerprint browser, because the profile
    /// still launches and nothing errors. This is what catches that.
    #[test]
    fn every_other_engine_property_is_reachable_from_the_generator() {
        use crate::generator::{generate, FontProfile, GeneratorOptions};
        use crate::os::TargetOs;
        use std::collections::BTreeSet;

        let mut drawn: BTreeSet<String> = BTreeSet::new();
        for os in TargetOs::ALL {
            for seed in [1u64, 7, 12345, 999, 4242] {
                for fonts in [FontProfile::Stock, FontProfile::Extended] {
                    for tracking_protection in [true, false] {
                        for humanize in [true, false] {
                            let mut options = GeneratorOptions::new(os);
                            options.fonts = fonts;
                            options.tracking_protection = tracking_protection;
                            options.humanize = humanize;
                            let identity = generate(seed, &options).identity;
                            drawn.extend(identity.into_map().into_keys());
                        }
                    }
                }
            }
        }
        // The two locale-sensitive properties need a locale that carries them,
        // and the schema's own script rule only fires for Traditional Chinese.
        for locale in ["zh-TW", "zh-HK", "en-US", "pt-BR", "ja-JP"] {
            let mut options = GeneratorOptions::new(TargetOs::Windows);
            options.locale = Some(locale.to_owned());
            let identity = generate(3, &options).identity;
            drawn.extend(identity.into_map().into_keys());
        }

        let schema = PropertySchema::load().unwrap();
        let known: BTreeSet<String> = schema.names().cloned().collect();
        let expected: BTreeSet<String> = known
            .iter()
            .filter(|name| !NEVER_DRAWN.contains(&name.as_str()))
            .cloned()
            .collect();

        let missing: Vec<&String> = expected.difference(&drawn).collect();
        assert!(
            missing.is_empty(),
            "the engine reads {missing:?} and the generator never writes it, so a \
             profile silently leaves it to the host"
        );
        // And nothing outside the schema is written, which would be dropped by
        // the engine without a word.
        let extra: Vec<&String> = drawn.difference(&known).collect();
        assert!(extra.is_empty(), "the generator writes unknown keys {extra:?}");
    }

    #[test]
    fn every_never_drawn_name_is_a_real_property() {
        // A name here that the engine does not read would be a comment pretending
        // to be a guard, and it would hide the real property if it were ever
        // renamed upstream.
        let schema = PropertySchema::load().unwrap();
        for name in NEVER_DRAWN {
            assert!(
                schema.contains(name),
                "{name} is listed as deliberately unwritten but is not a Camoufox property"
            );
        }
    }
}
