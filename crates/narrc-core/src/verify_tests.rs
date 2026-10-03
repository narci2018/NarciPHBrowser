//! The pure half of the verifier, tested without a browser.
//!
//! Every test here builds the claim side by hand and an [`Observation`] as the
//! page would have posted it, then checks the verdict. The browser half — the
//! probe page, the loopback server, the launch — is exercised by
//! `examples/probe.rs` against a real engine, because a test that launches a
//! browser is not a unit test.

use super::*;
use serde_json::json;

/// An observation with a WebGL1 context and nothing else.
fn observation_with(context: ContextObservation) -> Observation {
    Observation {
        webgl1: Some(context),
        ..Observation::default()
    }
}

/// The one comparison for `property`, or a panic naming what was there.
fn verdict_of<'a>(report: &'a Report, property: &str) -> &'a Difference {
    report
        .differences
        .iter()
        .find(|difference| difference.property == property)
        .unwrap_or_else(|| {
            panic!(
                "no comparison for {property:?}; got {:?}",
                report
                    .differences
                    .iter()
                    .map(|difference| &difference.property)
                    .collect::<Vec<_>>()
            )
        })
}

#[test]
fn a_matching_identity_is_clean() {
    let mut identity = Identity::new();
    identity
        .set_str(keys::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; rv:128.0)")
        .set_u32(keys::SCREEN_WIDTH, 1920)
        .set_str(keys::TIMEZONE, "Europe/Berlin");

    let mut observation = Observation::default();
    observation.navigator.insert(
        "userAgent".to_owned(),
        json!("Mozilla/5.0 (Windows NT 10.0; rv:128.0)"),
    );
    observation.screen.insert("width".to_owned(), json!(1920));
    observation
        .intl
        .insert("timeZone".to_owned(), json!("Europe/Berlin"));

    let report = compare(&identity, &observation, &BTreeMap::new(), true).unwrap();
    assert!(report.is_clean(), "{:?}", report.differences);
    assert_eq!(report.checked, report.agreed);
    assert_eq!(report.checked, 3);
}

#[test]
fn a_different_value_is_a_mismatch() {
    let mut identity = Identity::new();
    identity.set_u32(keys::SCREEN_WIDTH, 1920);

    let mut observation = Observation::default();
    observation.screen.insert("width".to_owned(), json!(1280));

    let report = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    assert!(!report.is_clean());
    let difference = verdict_of(&report, keys::SCREEN_WIDTH);
    assert_eq!(difference.verdict, Verdict::Mismatch);
    assert_eq!(difference.expected, Some(json!(1920)));
    assert_eq!(difference.observed, Some(json!(1280)));
    assert_eq!(report.mismatches().count(), 1);
}

#[test]
fn an_unsigned_limit_read_back_signed_is_equivalent() {
    let mut identity = Identity::new();
    identity.set_object(keys::WEBGL_PARAMETERS, [("3379", json!(4294967295u32))]);

    let observation = observation_with(ContextObservation {
        parameters: [("3379".to_owned(), json!(-1))].into_iter().collect(),
        ..ContextObservation::default()
    });

    let report = compare(&identity, &observation, &BTreeMap::new(), true).unwrap();
    let difference = verdict_of(&report, &format!("{}[3379]", keys::WEBGL_PARAMETERS));
    assert_eq!(difference.verdict, Verdict::Equivalent);
    assert!(difference.note.is_some());
    assert!(report.is_clean());
}

#[test]
fn an_unset_do_not_track_read_back_null_is_equivalent() {
    let mut identity = Identity::new();
    identity.set_str(keys::DO_NOT_TRACK, "0");

    let mut observation = Observation::default();
    observation
        .navigator
        .insert("doNotTrack".to_owned(), Value::Null);

    let report = compare(&identity, &observation, &BTreeMap::new(), true).unwrap();
    assert_eq!(
        verdict_of(&report, keys::DO_NOT_TRACK).verdict,
        Verdict::Equivalent
    );
    assert!(report.is_clean());
}

#[test]
fn an_engine_invented_value_read_back_differently_is_a_mismatch() {
    // The real finding this test pins: the generator invents a buildID, and the
    // engine answers with its own build's value instead.
    let mut identity = Identity::new();
    identity.set_str(keys::BUILD_ID, "NARCI-GCEFQDU");

    let mut observation = Observation::default();
    observation
        .navigator
        .insert("buildID".to_owned(), json!("20181001000000"));

    let report = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    assert_eq!(
        verdict_of(&report, keys::BUILD_ID).verdict,
        Verdict::Mismatch
    );
}

#[test]
fn an_unrecorded_gpu_reports_one_unclaimed_row_not_a_hundred() {
    // No `webGl:parameters` in the identity, but the browser answered with the
    // host's table: that is the coverage gap, and it is one finding.
    let identity = Identity::new();
    let observation = observation_with(ContextObservation {
        parameters: [
            ("3379".to_owned(), json!(16384)),
            ("34024".to_owned(), json!(16384)),
            ("34921".to_owned(), json!(16)),
        ]
        .into_iter()
        .collect(),
        ..ContextObservation::default()
    });

    let report = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    assert_eq!(report.differences.len(), 1);
    let difference = verdict_of(&report, keys::WEBGL_PARAMETERS);
    assert_eq!(difference.verdict, Verdict::Unclaimed);
    assert_eq!(difference.expected, None);
    assert!(difference.note.as_deref().unwrap().contains("host machine"));
}

#[test]
fn a_recorded_table_is_compared_value_by_value() {
    let mut identity = Identity::new();
    identity.set_object(
        keys::WEBGL_PARAMETERS,
        [("3379", json!(16384)), ("34921", json!(16))],
    );

    let observation = observation_with(ContextObservation {
        parameters: [
            ("3379".to_owned(), json!(16384)),
            ("34921".to_owned(), json!(32)),
        ]
        .into_iter()
        .collect(),
        ..ContextObservation::default()
    });

    let report = compare(&identity, &observation, &BTreeMap::new(), true).unwrap();
    assert_eq!(
        verdict_of(&report, &format!("{}[3379]", keys::WEBGL_PARAMETERS)).verdict,
        Verdict::Match
    );
    let differing = verdict_of(&report, &format!("{}[34921]", keys::WEBGL_PARAMETERS));
    assert_eq!(differing.verdict, Verdict::Mismatch);
    assert_eq!(differing.observed, Some(json!(32)));
}

#[test]
fn a_refused_precision_query_is_an_agreement() {
    // An unrecorded GPU is told to refuse the query rather than answer it with
    // the host's formats; the refusal is the requested outcome.
    let mut identity = Identity::new();
    identity.set_bool(keys::WEBGL_SHADER_PRECISION_BLOCK, true);

    let observation = observation_with(ContextObservation {
        precision: [
            ("35633,36336".to_owned(), None),
            ("35632,36338".to_owned(), None),
        ]
        .into_iter()
        .collect(),
        ..ContextObservation::default()
    });

    let report = compare(&identity, &observation, &BTreeMap::new(), true).unwrap();
    let difference = verdict_of(&report, keys::WEBGL_PRECISION);
    assert_eq!(difference.verdict, Verdict::Refused);
    assert!(difference.verdict.is_agreement());
    assert!(report.is_clean());
}

#[test]
fn a_recorded_precision_table_is_compared_pair_by_pair() {
    let mut identity = Identity::new();
    identity.set_object(
        keys::WEBGL_PRECISION,
        [(
            "35633,36336",
            json!({"rangeMin": 127, "rangeMax": 127, "precision": 23}),
        )],
    );

    let observation = observation_with(ContextObservation {
        precision: [(
            "35633,36336".to_owned(),
            Some(PrecisionFormat {
                range_min: 127,
                range_max: 127,
                precision: 23,
            }),
        )]
        .into_iter()
        .collect(),
        ..ContextObservation::default()
    });

    let report = compare(&identity, &observation, &BTreeMap::new(), true).unwrap();
    assert_eq!(
        verdict_of(&report, &format!("{}[35633,36336]", keys::WEBGL_PRECISION)).verdict,
        Verdict::Match
    );
    assert!(report.is_clean());
}

#[test]
fn context_attributes_ignore_fields_the_browser_never_returns() {
    // The corpus records `desynchronized`/`xrCompatible`, which this Firefox's
    // getContextAttributes() does not report. A field the browser cannot answer
    // is not a mismatch — but it is named.
    let mut identity = Identity::new();
    identity.set_object(
        keys::WEBGL_CONTEXT_ATTRS,
        [
            ("alpha", json!(true)),
            ("desynchronized", json!(false)),
            ("xrCompatible", json!(false)),
        ],
    );

    let observation = observation_with(ContextObservation {
        context_attributes: Some(json!({"alpha": true, "depth": true})),
        ..ContextObservation::default()
    });

    let report = compare(&identity, &observation, &BTreeMap::new(), true).unwrap();
    let difference = verdict_of(&report, keys::WEBGL_CONTEXT_ATTRS);
    assert_eq!(difference.verdict, Verdict::Match);
    let note = difference.note.as_deref().unwrap();
    assert!(note.contains("desynchronized"), "{note}");
    assert!(note.contains("xrCompatible"), "{note}");
}

#[test]
fn a_context_attribute_the_browser_does_return_is_compared() {
    let mut identity = Identity::new();
    identity.set_object(
        keys::WEBGL_CONTEXT_ATTRS,
        [("antialias", json!(true)), ("depth", json!(true))],
    );

    let observation = observation_with(ContextObservation {
        context_attributes: Some(json!({"antialias": true, "depth": false})),
        ..ContextObservation::default()
    });

    let report = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    let difference = verdict_of(&report, keys::WEBGL_CONTEXT_ATTRS);
    assert_eq!(difference.verdict, Verdict::Mismatch);
    assert!(difference.note.as_deref().unwrap().contains("depth"));
}

#[test]
fn a_context_that_could_not_be_created_makes_its_claims_unread() {
    let mut identity = Identity::new();
    identity.set_object(keys::WEBGL2_PARAMETERS, [("3379", json!(16384))]);

    let observation = Observation {
        webgl2: Some(ContextObservation {
            absent: true,
            ..ContextObservation::default()
        }),
        ..Observation::default()
    };

    let report = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    let difference = verdict_of(&report, keys::WEBGL2_PARAMETERS);
    assert_eq!(difference.verdict, Verdict::Unread);
    assert!(difference
        .note
        .as_deref()
        .unwrap()
        .contains("could not create"));
}

#[test]
fn the_extension_list_is_one_row_with_both_directions_named() {
    let mut identity = Identity::new();
    identity.set_str_array(
        keys::WEBGL_EXTENSIONS,
        ["WEBGL_debug_renderer_info", "EXT_texture_filter_anisotropic"],
    );

    let observation = observation_with(ContextObservation {
        extensions: vec![
            "WEBGL_debug_renderer_info".to_owned(),
            "OES_element_index_uint".to_owned(),
        ],
        ..ContextObservation::default()
    });

    let report = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    let difference = verdict_of(&report, keys::WEBGL_EXTENSIONS);
    assert_eq!(difference.verdict, Verdict::Mismatch);
    let note = difference.note.as_deref().unwrap();
    assert!(note.contains("EXT_texture_filter_anisotropic"), "{note}");
    assert!(note.contains("OES_element_index_uint"), "{note}");
}

#[test]
fn headers_are_compared_from_the_wire() {
    let mut identity = Identity::new();
    identity.set_str(keys::HEADER_ACCEPT_LANGUAGE, "de-DE,de;q=0.9");

    let headers: BTreeMap<String, String> =
        [("accept-language".to_owned(), "en-US,en;q=0.5".to_owned())]
            .into_iter()
            .collect();

    let report = compare(&identity, &Observation::default(), &headers, false).unwrap();
    let difference = verdict_of(&report, keys::HEADER_ACCEPT_LANGUAGE);
    assert_eq!(difference.verdict, Verdict::Mismatch);
    assert_eq!(difference.observed, Some(json!("en-US,en;q=0.5")));
}

#[test]
fn an_unset_property_the_host_answers_is_unclaimed() {
    // Nothing claimed, the browser exposed a value: the identity is not
    // overriding this, so the host's value is what leaks.
    let identity = Identity::new();
    let mut observation = Observation::default();
    observation
        .navigator
        .insert("hardwareConcurrency".to_owned(), json!(24));

    let report = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    let difference = verdict_of(&report, keys::HARDWARE_CONCURRENCY);
    assert_eq!(difference.verdict, Verdict::Unclaimed);
}

#[test]
fn an_unset_property_read_back_as_null_is_not_a_finding() {
    let identity = Identity::new();
    let mut observation = Observation::default();
    observation.navigator.insert("oscpu".to_owned(), Value::Null);

    let report = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    assert!(report.differences.is_empty());
    assert_eq!(report.checked, 0);
}

#[test]
fn keeping_agreements_lists_them_without_changing_the_counts() {
    let mut identity = Identity::new();
    identity.set_u32(keys::SCREEN_WIDTH, 1920);
    let mut observation = Observation::default();
    observation.screen.insert("width".to_owned(), json!(1920));

    let quiet = compare(&identity, &observation, &BTreeMap::new(), false).unwrap();
    let loud = compare(&identity, &observation, &BTreeMap::new(), true).unwrap();
    assert_eq!(quiet.checked, loud.checked);
    assert_eq!(quiet.agreed, loud.agreed);
    assert!(quiet.differences.is_empty());
    assert_eq!(loud.differences.len(), 1);
}
