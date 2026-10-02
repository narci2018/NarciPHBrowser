//! Error type for the core crate.

/// Everything that can go wrong in the core.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The vendored property schema is missing, malformed or self-inconsistent.
    #[error("property schema: {0}")]
    Schema(String),

    /// A property was written with a value Camoufox will not accept.
    #[error("property {property:?} expects {expected}, got {actual}")]
    PropertyType {
        property: String,
        expected: String,
        actual: String,
    },

    /// A property name that is not in the schema.
    #[error("unknown Camoufox property {0:?}")]
    UnknownProperty(String),

    /// A required piece of an identity is missing or unparseable.
    #[error("identity: {0}")]
    Identity(String),

    /// The OS a profile claims is not one the engine can run.
    #[error("unsupported target OS {0:?} (expected one of windows, macos, linux)")]
    UnsupportedOs(String),

    /// The local runtime is not set up (no engine installed, no data dir...).
    #[error("environment: {0}")]
    Environment(String),

    /// The launch environment could not be read back: a missing chunk, or a
    /// payload that is not valid JSON.
    #[error("launch config: {0}")]
    InvalidConfig(String),

    /// Serialization or deserialization.
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

impl Error {
    pub(crate) fn schema(message: impl Into<String>) -> Self {
        Error::Schema(message.into())
    }

    /// Kept for the layers above: a profile that fails to load is an identity
    /// problem, and the desktop app and sidecar both need to raise one.
    #[allow(dead_code)]
    pub fn identity(message: impl Into<String>) -> Self {
        Error::Identity(message.into())
    }

    /// Kept for the same reason as [`Error::identity`]: the launcher's "no
    /// engine installed, no data directory" failures are environment problems,
    /// not identity ones.
    #[allow(dead_code)]
    pub fn environment(message: impl Into<String>) -> Self {
        Error::Environment(message.into())
    }
}

/// Convenience alias.
pub type Result<T> = std::result::Result<T, Error>;

/// Renders a JSON value's kind for an error message.
pub(crate) fn json_kind(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "null".into(),
        serde_json::Value::Bool(_) => "bool".into(),
        serde_json::Value::Number(n) => {
            if n.is_f64() {
                "double".into()
            } else if n.is_i64() {
                // Distinguish by sign rather than by serde's internal
                // representation. `json!(1)` is stored as a positive integer, and
                // reporting it as "int" next to a property that wants "uint"
                // reads like a type mismatch where there is none.
                if n.as_i64().unwrap_or(0) < 0 {
                    "int".into()
                } else {
                    "uint".into()
                }
            } else {
                "uint".into()
            }
        }
        serde_json::Value::String(_) => "string".into(),
        serde_json::Value::Array(_) => "array".into(),
        serde_json::Value::Object(_) => "object".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn json_kind_names_shapes() {
        assert_eq!(json_kind(&json!(null)), "null");
        assert_eq!(json_kind(&json!(true)), "bool");
        assert_eq!(json_kind(&json!(1)), "uint");
        assert_eq!(json_kind(&json!(-1)), "int");
        assert_eq!(json_kind(&json!(0)), "uint");
        assert_eq!(json_kind(&json!(1.5)), "double");
        assert_eq!(json_kind(&json!("s")), "string");
        assert_eq!(json_kind(&json!([])), "array");
        assert_eq!(json_kind(&json!({})), "object");
    }

    #[test]
    fn errors_render_readably() {
        let error = Error::PropertyType {
            property: "screen.width".into(),
            expected: "uint".into(),
            actual: "string".into(),
        };
        assert_eq!(
            error.to_string(),
            "property \"screen.width\" expects uint, got string"
        );
    }
}
