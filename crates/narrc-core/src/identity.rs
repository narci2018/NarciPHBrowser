//! The identity: the flat property map handed to the engine.
//!
//! Camoufox's contract is a flat `String -> JSON` object read out of
//! `CAMOU_CONFIG_*` and looked up key-by-key inside Gecko. `Identity` is a
//! typed, validated wrapper around exactly that map — same keys, same value
//! shapes, no translation layer in between, because a translation layer is
//! where a fingerprint quietly stops being applied.
//!
//! Two properties of this type matter more than they look:
//!
//! * **Setting is checked against the vendored schema.** `set_str("screen.widt", …)`
//!   returns an error instead of writing a key the engine will discard.
//! * **Order is irrelevant.** Keys live in a `BTreeMap`, so serializing the
//!   same identity twice produces byte-identical JSON and the value can be
//!   diffed, hashed and stored directly.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{json_kind, Error, Result};
use crate::rng::fnv1a64;
use crate::schema::{keys, PropertySchema};

/// A complete set of spoofed values.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Identity {
    values: BTreeMap<String, Value>,
}

impl Identity {
    /// An empty identity. Every property reads back as `None` until set.
    pub fn new() -> Self {
        Self::default()
    }

    /// An identity with every known property set to its type's zero value.
    ///
    /// Almost never what you want to launch — a zero `screen.width` is a
    /// stronger tell than no override at all — but it is the right starting
    /// point for a UI that wants to show every field as "unset".
    pub fn zeroed(schema: &PropertySchema) -> Self {
        let mut identity = Self::new();
        for (name, kind) in schema.map() {
            identity.values.insert(name.clone(), kind.zero());
        }
        identity
    }

    /// Builds an identity from a raw map, validating every entry.
    pub fn from_map(schema: &PropertySchema, map: BTreeMap<String, Value>) -> Result<Self> {
        let mut identity = Self::new();
        for (name, value) in map {
            identity.set(schema, &name, value)?;
        }
        Ok(identity)
    }

    // ---------------------------------------------------------------- reads

    /// Whether the property is set.
    pub fn is_set(&self, property: &str) -> bool {
        self.values.contains_key(property)
    }

    /// The number of properties set.
    pub fn len(&self) -> usize {
        self.values.len()
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    /// The raw value.
    pub fn get(&self, property: &str) -> Option<&Value> {
        self.values.get(property)
    }

    /// The string at `property`, if it is set and is a string.
    pub fn get_str(&self, property: &str) -> Option<&str> {
        self.values.get(property).and_then(Value::as_str)
    }

    /// The unsigned integer at `property`, if it is set and non-negative.
    pub fn get_u32(&self, property: &str) -> Option<u32> {
        self.values
            .get(property)
            .and_then(Value::as_u64)
            .map(|v| v as u32)
    }

    /// The signed integer at `property`, if it is set.
    pub fn get_i32(&self, property: &str) -> Option<i32> {
        self.values
            .get(property)
            .and_then(Value::as_i64)
            .map(|v| v as i32)
    }

    /// The float at `property`, widening integers.
    pub fn get_f64(&self, property: &str) -> Option<f64> {
        self.values.get(property).and_then(Value::as_f64)
    }

    /// The boolean at `property`, if it is set.
    pub fn get_bool(&self, property: &str) -> Option<bool> {
        self.values.get(property).and_then(Value::as_bool)
    }

    /// The array at `property`, if it is set.
    pub fn get_array(&self, property: &str) -> Option<&Vec<Value>> {
        self.values.get(property).and_then(Value::as_array)
    }

    /// The array at `property` as a list of owned strings.
    ///
    /// Non-string members are skipped rather than panicking: a hand-edited
    /// profile with one bad entry in `fonts` should still launch, minus the
    /// one entry.
    pub fn get_str_array(&self, property: &str) -> Option<Vec<String>> {
        self.get_array(property).map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
    }

    /// The object at `property`, if it is set.
    pub fn get_object(&self, property: &str) -> Option<&serde_json::Map<String, Value>> {
        self.values.get(property).and_then(Value::as_object)
    }

    // --------------------------------------------------------------- writes

    /// Sets a property, validating the name and the value shape.
    pub fn set(
        &mut self,
        schema: &PropertySchema,
        property: &str,
        value: Value,
    ) -> Result<&mut Self> {
        let kind = schema
            .kind(property)
            .ok_or_else(|| Error::UnknownProperty(property.to_owned()))?;
        if !kind.accepts(&value) {
            return Err(Error::PropertyType {
                property: property.to_owned(),
                expected: kind.to_string(),
                actual: json_kind(&value),
            });
        }
        self.values.insert(property.to_owned(), value);
        Ok(self)
    }

    /// Sets a string property. An empty string clears it.
    pub fn set_str(&mut self, property: &str, value: &str) -> &mut Self {
        if value.is_empty() {
            self.remove(property);
        } else {
            self.values
                .insert(property.to_owned(), Value::String(value.to_owned()));
        }
        self
    }

    /// Sets an unsigned property.
    pub fn set_u32(&mut self, property: &str, value: u32) -> &mut Self {
        self.values.insert(property.to_owned(), Value::from(value));
        self
    }

    /// Sets a signed property.
    pub fn set_i32(&mut self, property: &str, value: i32) -> &mut Self {
        self.values.insert(property.to_owned(), Value::from(value));
        self
    }

    /// Sets a float property. A non-finite value clears it, because JSON has
    /// no NaN and `serde_json` serialises it as `null` — which Gecko would
    /// read as "reset to default" mid-geometry.
    pub fn set_f64(&mut self, property: &str, value: f64) -> &mut Self {
        if value.is_finite() {
            self.values.insert(property.to_owned(), Value::from(value));
        } else {
            self.remove(property);
        }
        self
    }

    /// Sets a boolean property.
    pub fn set_bool(&mut self, property: &str, value: bool) -> &mut Self {
        self.values.insert(property.to_owned(), Value::from(value));
        self
    }

    /// Sets an array-of-strings property. An empty list clears it.
    pub fn set_str_array<I, S>(&mut self, property: &str, items: I) -> &mut Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let items: Vec<Value> = items
            .into_iter()
            .map(|item| Value::String(item.into()))
            .collect();
        if items.is_empty() {
            self.remove(property);
        } else {
            self.values.insert(property.to_owned(), Value::Array(items));
        }
        self
    }

    /// Sets an object property. An empty object clears it.
    pub fn set_object<I, K>(&mut self, property: &str, entries: I) -> &mut Self
    where
        I: IntoIterator<Item = (K, Value)>,
        K: Into<String>,
    {
        let map: serde_json::Map<String, Value> = entries
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect();
        if map.is_empty() {
            self.remove(property);
        } else {
            self.values.insert(property.to_owned(), Value::Object(map));
        }
        self
    }

    /// Removes a property, so the engine falls back to the host value.
    pub fn remove(&mut self, property: &str) -> Option<Value> {
        self.values.remove(property)
    }

    /// Removes every property whose name starts with `prefix` (e.g. `"screen."`).
    pub fn clear_prefix(&mut self, prefix: &str) {
        self.values.retain(|name, _| !name.starts_with(prefix));
    }

    /// Copies every property from `other` over this one, replacing collisions.
    pub fn merge(&mut self, other: &Identity) -> &mut Self {
        for (name, value) in &other.values {
            self.values.insert(name.clone(), value.clone());
        }
        self
    }

    /// The whole map.
    pub fn as_map(&self) -> &BTreeMap<String, Value> {
        &self.values
    }

    /// Consumes the identity into its map.
    pub fn into_map(self) -> BTreeMap<String, Value> {
        self.values
    }

    /// Every property name set, sorted.
    pub fn names(&self) -> impl Iterator<Item = &String> {
        self.values.keys()
    }

    // -------------------------------------------------------------- checks

    /// Validates every entry against the schema.
    pub fn validate(&self, schema: &PropertySchema) -> Result<()> {
        for (name, value) in &self.values {
            let kind = schema
                .kind(name)
                .ok_or_else(|| Error::UnknownProperty(name.clone()))?;
            if !kind.accepts(value) {
                return Err(Error::PropertyType {
                    property: name.clone(),
                    expected: kind.to_string(),
                    actual: json_kind(value),
                });
            }
        }
        Ok(())
    }

    /// The properties whose value does not match the declared type, as
    /// `(name, expected, actual)`. Used by the UI to show a profile that was
    /// hand-edited or imported from another tool.
    /// The properties the engine has no slot for.
    ///
    /// The silent failure this catches: a hand-edited or imported value whose
    /// name is not in the schema is dropped by the browser without a word, so
    /// the profile the user is looking at is not the profile the page sees.
    /// Reported separately from [`type_mismatches`](Self::type_mismatches)
    /// because the two need different fixes — one is a typo, the other is a
    /// value of the wrong shape.
    pub fn unknown_properties(&self, schema: &PropertySchema) -> Vec<String> {
        self.values
            .keys()
            .filter(|name| !schema.contains(name))
            .cloned()
            .collect()
    }

    /// The properties the engine would silently drop.
    pub fn type_mismatches(&self, schema: &PropertySchema) -> Vec<(String, String, String)> {
        self.values
            .iter()
            .filter_map(|(name, value)| match schema.kind(name) {
                Some(kind) if !kind.accepts(value) => {
                    Some((name.clone(), kind.to_string(), json_kind(value)))
                }
                _ => None,
            })
            .collect()
    }

    // ------------------------------------------------------------- wire fmt

    /// The `CAMOU_CONFIG` payload: compact, stable key order.
    pub fn to_config_json(&self) -> String {
        // A BTreeMap serializes sorted, so this cannot fail on shape and only
        // fails on a value serde cannot represent -- which the setters prevent.
        serde_json::to_string(&self.values).unwrap_or_else(|_| "{}".to_owned())
    }

    /// Parses a `CAMOU_CONFIG` payload back into an identity.
    pub fn from_config_json(json: &str) -> Result<Self> {
        let map: BTreeMap<String, Value> = serde_json::from_str(json)?;
        Ok(Self { values: map })
    }

    /// A content hash of every value, for comparing two identities.
    ///
    /// Answers "is this the same machine?" without diffing a hundred fields by
    /// hand, which is what duplicate detection in a profile list needs and what
    /// the UI shows next to a name.
    ///
    /// Computed over [`to_config_json`](Self::to_config_json), which sorts its
    /// keys, so two identities with the same values hash the same however they
    /// were built. A 64-bit FNV-1a is plenty for the job it has here — the
    /// question is never "did these two collide in a store of ten thousand",
    /// and a hash that was hard to explain would cost more than the collision
    /// probability is worth. It is *not* a security hash and must not be used
    /// as one.
    pub fn digest(&self) -> String {
        format!("{:016x}", fnv1a64(self.to_config_json().as_bytes()))
    }

    /// Whether two identities present the same machine.
    pub fn same_machine(&self, other: &Self) -> bool {
        self.digest() == other.digest()
    }

    /// The `CAMOU_PREFS` payload: the browser preferences an identity implies.
    ///
    /// Split from [`to_config_json`](Self::to_config_json) on purpose. Config
    /// is *fingerprint* — the values a page reads. Prefs are *behaviour* — the
    /// values the browser reads about itself. They travel in separate
    /// environment variables because the engine keeps them in separate
    /// namespaces, and because a user who wants to see what a profile claims
    /// should not have to read the settings that make it claim it.
    ///
    /// Only the preferences this crate actually decides are written. A profile
    /// that sets every preference Firefox has would also be claiming a user who
    /// has never changed a setting, which is a claim in itself.
    pub fn to_prefs_json(&self) -> String {
        let mut prefs: BTreeMap<&str, Value> = BTreeMap::new();

        // A profile that spoofs a machine is a private window, so history
        // retention and the session restore offer are both off.
        prefs.insert("browser.sessionstore.resume_from_crash", Value::Bool(false));
        prefs.insert(
            "browser.startup.homepage_override.mstone",
            Value::String("ignore".into()),
        );

        // Fingerprinting resistance is on by design here. Naming the prefs
        // explicitly rather than relying on defaults is what makes a profile
        // survive an engine default changing under it.
        prefs.insert("privacy.resistFingerprinting", Value::Bool(false));
        prefs.insert("privacy.fingerprintingProtection", Value::Bool(false));
        // Spoofing and strict protection cannot both be on: the second
        // overrides the first, so a profile that set both would get neither.
        prefs.insert(
            "privacy.fingerprintingProtection.pbmode",
            Value::Bool(false),
        );
        prefs.insert("privacy.partition.network_state", Value::Bool(false));
        prefs.insert("privacy.trackingprotection.enabled", Value::Bool(false));
        prefs.insert("privacy.trackingprotection.pbmode.enabled", Value::Bool(false));
        prefs.insert("privacy.trackingprotection.socialtracking.enabled", Value::Bool(false));

        // No telemetry, no prompts, no update surprise mid-session.
        prefs.insert(
            "datareporting.healthreport.uploadEnabled",
            Value::Bool(false),
        );
        prefs.insert(
            "datareporting.policy.dataSubmissionEnabled",
            Value::Bool(false),
        );
        prefs.insert("app.update.auto", Value::Bool(false));
        prefs.insert("browser.shell.checkDefaultBrowser", Value::Bool(false));
        prefs.insert("browser.aboutwelcome.enabled", Value::Bool(false));

        // Spellcheck would otherwise reach out to a dictionary service and add
        // a network request a real machine of this kind would not make.
        prefs.insert("browser.spellcheck.remote", Value::Bool(false));

        // The default proxy: none. The identity does not know whether the
        // profile has one — that is the launcher's to say — so this is what a
        // profile with none reads, and what a profile that does have one gets
        // pinned over by `EngineConfig::extra_prefs` before launch. Written as
        // a default rather than omitted, because an absent pref would follow a
        // host setting that belongs to somebody else's machine.
        prefs.insert("network.proxy.type", Value::from(0u8));

        // The browser's own UI locale, which is *not* the same thing as the
        // locale the identity claims: `Intl`, `navigator.language` and the
        // `Accept-Language` header come from the spoofed properties, while
        // `input.validationMessage`, XML parse errors and the string bundles
        // come from this pref. A profile that sets only the properties localizes
        // its number and date formatting while its validation messages stay
        // English — a mix no real localized Firefox produces, because a Mozilla
        // build localizes both. Gecko negotiates the value against the packaged
        // locales exactly as such a build does (`zh-Hant-TW` -> `zh-TW`).
        //
        // Always written: an absent pref follows the host OS locale now that
        // more than en-US is packaged, which is the leak this exists to close.
        prefs.insert(
            "intl.locale.requested",
            Value::String(self.requested_locale()),
        );

        // `navigator.doNotTrack` and `navigator.globalPrivacyControl` are
        // **pref-backed** in Firefox, not property-backed. The main-thread
        // getter, the `WorkerNavigator` getter and the `DNT` / `Sec-GPC`
        // request headers all read these two prefs, so a profile that spoofs
        // only the config key leaves the wire contradicting the API — the
        // engine's own `navigator.doNotTrack` is not patched at all, and reads
        // nothing but `privacy.donottrackheader.enabled`.
        //
        // Both are booleans, and the engine applies them with `defaultPref`
        // typed by the JSON value: a string here would not set a boolean pref.
        // Both are written even when off, because the stock value *is* off and
        // leaving the pref to an engine default is how a build change turns
        // into a silent leak.
        let dnt = self.get_str(keys::DO_NOT_TRACK) == Some("1");
        prefs.insert("privacy.donottrackheader.enabled", Value::Bool(dnt));
        let gpc = self.get_bool(keys::GLOBAL_PRIVACY_CONTROL).unwrap_or(false);
        prefs.insert("privacy.globalprivacycontrol.enabled", Value::Bool(gpc));

        serde_json::to_string(&prefs).unwrap_or_else(|_| "{}".to_owned())
    }

    /// The BCP-47 tag for `intl.locale.requested`, from the locale properties.
    ///
    /// `language-Script-REGION`, the subtags this identity actually set. The
    /// script is only present for the locales whose language defaults to a
    /// different one, so most profiles resolve to `language-REGION`.
    fn requested_locale(&self) -> String {
        let parts: Vec<&str> = [keys::LOCALE_LANGUAGE, keys::LOCALE_SCRIPT, keys::LOCALE_REGION]
            .into_iter()
            .filter_map(|key| self.get_str(key))
            .filter(|value| !value.is_empty())
            .collect();

        // An identity with no locale properties at all still has to name a
        // locale: an empty `intl.locale.requested` follows the host OS.
        if parts.is_empty() {
            return "en-US".to_owned();
        }
        parts.join("-")
    }

    /// Parses a `CAMOU_PREFS` payload back into a map.
    ///
    /// Returns a map rather than an `Identity` because preferences are not
    /// fingerprint properties: they have no entry in the properties schema,
    /// and running them through it would report every one as unknown.
    pub fn prefs_from_json(json: &str) -> Result<BTreeMap<String, Value>> {
        Ok(serde_json::from_str(json)?)
    }
}

impl FromIterator<(String, Value)> for Identity {
    fn from_iter<T: IntoIterator<Item = (String, Value)>>(iter: T) -> Self {
        Self {
            values: iter.into_iter().collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::keys;
    use serde_json::json;

    fn schema() -> PropertySchema {
        PropertySchema::load().unwrap()
    }

    fn prefs(identity: &Identity) -> BTreeMap<String, Value> {
        Identity::prefs_from_json(&identity.to_prefs_json()).unwrap()
    }

    #[test]
    fn tracking_protection_reaches_the_prefs_the_headers_read() {
        // `navigator.doNotTrack` and `navigator.globalPrivacyControl` are
        // pref-backed in Firefox: the main-thread getter, the WorkerNavigator
        // getter and the DNT / Sec-GPC request headers all read these two
        // prefs. A profile that sets only the config key leaves the wire
        // contradicting the API, and the engine's own `navigator.doNotTrack`
        // reads nothing else at all.
        let mut identity = Identity::new();
        identity
            .set_str(keys::DO_NOT_TRACK, "1")
            .set_bool(keys::GLOBAL_PRIVACY_CONTROL, true);

        let prefs = prefs(&identity);
        assert_eq!(
            prefs.get("privacy.donottrackheader.enabled"),
            Some(&Value::Bool(true))
        );
        assert_eq!(
            prefs.get("privacy.globalprivacycontrol.enabled"),
            Some(&Value::Bool(true))
        );
    }

    #[test]
    fn both_tracking_prefs_are_booleans_even_when_off() {
        // The engine applies prefs with `defaultPref` typed by the JSON value,
        // so a string here would not set a boolean pref at all — and the stock
        // value is `false`, which must be written rather than inherited.
        let mut identity = Identity::new();
        identity.set_str(keys::DO_NOT_TRACK, "unspecified");

        let prefs = prefs(&identity);
        assert_eq!(
            prefs.get("privacy.donottrackheader.enabled"),
            Some(&Value::Bool(false))
        );
        assert_eq!(
            prefs.get("privacy.globalprivacycontrol.enabled"),
            Some(&Value::Bool(false))
        );
    }

    #[test]
    fn the_requested_locale_is_the_identitys_own_not_the_hosts() {
        // `input.validationMessage` and XML parse errors come from this pref
        // while `Intl` formatting comes from the spoofed properties. Leaving it
        // unset follows the host OS locale, which localizes a profile's
        // validation messages to the machine it is trying not to be.
        let mut identity = Identity::new();
        identity
            .set_str(keys::LOCALE_LANGUAGE, "zh")
            .set_str(keys::LOCALE_SCRIPT, "Hant")
            .set_str(keys::LOCALE_REGION, "TW");

        let prefs = prefs(&identity);
        assert_eq!(
            prefs.get("intl.locale.requested"),
            Some(&Value::String("zh-Hant-TW".into())),
            "subtags must be language-Script-REGION"
        );
    }

    #[test]
    fn a_locale_without_a_script_omits_the_subtag() {
        let mut identity = Identity::new();
        identity
            .set_str(keys::LOCALE_LANGUAGE, "en")
            .set_str(keys::LOCALE_REGION, "US");
        assert_eq!(
            prefs(&identity).get("intl.locale.requested"),
            Some(&Value::String("en-US".into()))
        );
    }

    #[test]
    fn an_identity_with_no_locale_still_names_one() {
        // An empty `intl.locale.requested` follows the host OS, so the fallback
        // has to be a real locale rather than an empty string.
        assert_eq!(
            prefs(&Identity::new()).get("intl.locale.requested"),
            Some(&Value::String("en-US".into()))
        );
    }

    #[test]
    fn set_validates_the_property_name() {
        let mut identity = Identity::new();
        let error = identity
            .set(&schema(), "screen.widt", json!(1920))
            .unwrap_err();
        assert!(matches!(error, Error::UnknownProperty(name) if name == "screen.widt"));
    }

    #[test]
    fn set_validates_the_value_type() {
        let mut identity = Identity::new();
        let error = identity
            .set(&schema(), keys::SCREEN_WIDTH, json!("wide"))
            .unwrap_err();
        assert!(
            matches!(error, Error::PropertyType { property, .. } if property == "screen.width")
        );
    }

    #[test]
    fn set_rejects_a_negative_uint() {
        let mut identity = Identity::new();
        assert!(identity
            .set(&schema(), keys::HARDWARE_CONCURRENCY, json!(-4))
            .is_err());
        assert!(identity
            .set(&schema(), keys::HARDWARE_CONCURRENCY, json!(4))
            .is_ok());
    }

    #[test]
    fn typed_getters_round_trip() {
        let mut identity = Identity::new();
        identity
            .set_str(keys::USER_AGENT, "Mozilla/5.0")
            .set_u32(keys::SCREEN_WIDTH, 1920)
            .set_i32(keys::SCREEN_Y, -12)
            .set_f64(keys::DEVICE_PIXEL_RATIO, 1.25)
            .set_bool(keys::INSTANT_ANIMATIONS, true)
            .set_str_array(keys::FONTS, ["Arial", "Georgia"]);

        assert_eq!(identity.get_str(keys::USER_AGENT), Some("Mozilla/5.0"));
        assert_eq!(identity.get_u32(keys::SCREEN_WIDTH), Some(1920));
        assert_eq!(identity.get_i32(keys::SCREEN_Y), Some(-12));
        assert_eq!(identity.get_f64(keys::DEVICE_PIXEL_RATIO), Some(1.25));
        assert_eq!(identity.get_bool(keys::INSTANT_ANIMATIONS), Some(true));
        assert_eq!(
            identity.get_str_array(keys::FONTS),
            Some(vec!["Arial".into(), "Georgia".into()])
        );
    }

    #[test]
    fn getters_return_none_for_the_wrong_shape() {
        let mut identity = Identity::new();
        identity.set_str(keys::USER_AGENT, "x");
        assert_eq!(identity.get_u32(keys::USER_AGENT), None);
        assert_eq!(identity.get_bool(keys::USER_AGENT), None);
        assert_eq!(identity.get_array(keys::USER_AGENT), None);
        assert_eq!(identity.get_object(keys::USER_AGENT), None);
    }

    #[test]
    fn empty_string_clears_a_property() {
        let mut identity = Identity::new();
        identity.set_str(keys::USER_AGENT, "Mozilla/5.0");
        assert!(identity.is_set(keys::USER_AGENT));
        identity.set_str(keys::USER_AGENT, "");
        assert!(!identity.is_set(keys::USER_AGENT));
    }

    #[test]
    fn empty_array_and_object_clear_a_property() {
        let mut identity = Identity::new();
        identity.set_str_array(keys::FONTS, ["Arial"]);
        identity.set_object(keys::WEBGL_PARAMETERS, [("MAX_TEXTURE_SIZE", json!(16384))]);
        assert!(identity.is_set(keys::FONTS) && identity.is_set(keys::WEBGL_PARAMETERS));

        identity.set_str_array::<_, String>(keys::FONTS, Vec::new());
        identity.set_object::<_, String>(keys::WEBGL_PARAMETERS, Vec::new());
        assert!(!identity.is_set(keys::FONTS));
        assert!(!identity.is_set(keys::WEBGL_PARAMETERS));
    }

    #[test]
    fn non_finite_floats_clear_rather_than_serialising_null() {
        let mut identity = Identity::new();
        identity.set_f64(keys::DEVICE_PIXEL_RATIO, f64::NAN);
        assert!(!identity.is_set(keys::DEVICE_PIXEL_RATIO));
        identity.set_f64(keys::DEVICE_PIXEL_RATIO, f64::INFINITY);
        assert!(!identity.is_set(keys::DEVICE_PIXEL_RATIO));
        identity.set_f64(keys::DEVICE_PIXEL_RATIO, 2.0);
        assert!(identity.is_set(keys::DEVICE_PIXEL_RATIO));
    }

    #[test]
    fn str_array_skips_non_string_members() {
        let mut identity = Identity::new();
        identity
            .values
            .insert(keys::FONTS.to_owned(), json!(["Arial", 7, null, "Georgia"]));
        assert_eq!(
            identity.get_str_array(keys::FONTS),
            Some(vec!["Arial".into(), "Georgia".into()])
        );
    }

    #[test]
    fn clear_prefix_drops_a_whole_family() {
        let mut identity = Identity::new();
        identity
            .set_u32(keys::SCREEN_WIDTH, 1920)
            .set_u32(keys::SCREEN_HEIGHT, 1080)
            .set_str(keys::USER_AGENT, "x");
        identity.clear_prefix("screen.");
        assert!(!identity.is_set(keys::SCREEN_WIDTH));
        assert!(!identity.is_set(keys::SCREEN_HEIGHT));
        assert!(identity.is_set(keys::USER_AGENT));
    }

    #[test]
    fn merge_overwrites_collisions_and_keeps_the_rest() {
        let mut base = Identity::new();
        base.set_u32(keys::SCREEN_WIDTH, 1920)
            .set_str(keys::USER_AGENT, "a");

        let mut overlay = Identity::new();
        overlay
            .set_u32(keys::SCREEN_WIDTH, 1280)
            .set_bool(keys::DEBUG, true);

        base.merge(&overlay);
        assert_eq!(base.get_u32(keys::SCREEN_WIDTH), Some(1280));
        assert_eq!(base.get_str(keys::USER_AGENT), Some("a"));
        assert_eq!(base.get_bool(keys::DEBUG), Some(true));
    }

    #[test]
    fn config_json_is_byte_stable_regardless_of_insertion_order() {
        let mut a = Identity::new();
        a.set_u32(keys::SCREEN_WIDTH, 1920)
            .set_str(keys::USER_AGENT, "x")
            .set_bool(keys::DEBUG, true);

        let mut b = Identity::new();
        b.set_bool(keys::DEBUG, true)
            .set_str(keys::USER_AGENT, "x")
            .set_u32(keys::SCREEN_WIDTH, 1920);

        assert_eq!(a.to_config_json(), b.to_config_json());
    }

    #[test]
    fn config_json_round_trips() {
        let mut original = Identity::new();
        original
            .set_str(keys::USER_AGENT, "Mozilla/5.0 (X11)")
            .set_f64(keys::DEVICE_PIXEL_RATIO, 1.5)
            .set_str_array(keys::FONTS, ["Arial"]);

        let restored = Identity::from_config_json(&original.to_config_json()).unwrap();
        assert_eq!(original, restored);
    }

    #[test]
    fn validate_accepts_a_generated_identity() {
        let mut identity = Identity::new();
        identity.set_u32(keys::SCREEN_WIDTH, 1920);
        assert!(identity.validate(&schema()).is_ok());
    }

    #[test]
    fn validate_reports_an_injected_bad_key() {
        let mut identity = Identity::new();
        identity.values.insert("made.up".into(), json!(1));
        assert!(matches!(
            identity.validate(&schema()),
            Err(Error::UnknownProperty(name)) if name == "made.up"
        ));
    }

    #[test]
    fn type_mismatches_lists_offenders_without_erroring() {
        let mut identity = Identity::new();
        identity
            .values
            .insert(keys::SCREEN_WIDTH.into(), json!("1920"));
        let mismatches = identity.type_mismatches(&schema());
        assert_eq!(mismatches.len(), 1);
        assert_eq!(mismatches[0].0, keys::SCREEN_WIDTH);
        assert_eq!(mismatches[0].1, "uint");
        assert_eq!(mismatches[0].2, "string");
    }

    #[test]
    fn zeroed_covers_every_property_and_validates() {
        let identity = Identity::zeroed(&schema());
        assert_eq!(identity.len(), schema().len());
        assert!(identity.validate(&schema()).is_ok());
    }

    #[test]
    fn from_map_validates_every_entry() {
        let mut map = BTreeMap::new();
        map.insert(keys::SCREEN_WIDTH.to_owned(), json!(1920));
        map.insert("bogus".to_owned(), json!(1));
        assert!(Identity::from_map(&schema(), map).is_err());
    }
}
