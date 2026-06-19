use thiserror::Error;

#[derive(Error, Debug)]
pub enum EdgeError {
    #[error("connector error [{connector}]: {message}")]
    Connector { connector: String, message: String },

    #[error("transport error: {0}")]
    Transport(String),

    #[error("configuration error: {0}")]
    Config(String),

    #[error("buffer overflow: {current_mb}MB exceeds {max_mb}MB")]
    BufferOverflow { current_mb: u64, max_mb: u64 },

    #[error("protocol parse error [{protocol}]: {message}")]
    Parse { protocol: String, message: String },

    #[error("authentication failed for {target}: {reason}")]
    Auth { target: String, reason: String },

    #[error("connection refused to {endpoint}")]
    ConnectionRefused { endpoint: String },

    #[error("timeout after {secs}s connecting to {endpoint}")]
    Timeout { endpoint: String, secs: u64 },

    #[error("TLS handshake failed: {0}")]
    Tls(String),

    #[error("OCSF normalization failed: {0}")]
    Normalization(String),

    #[error("plugin error [{plugin}]: {message}")]
    Plugin { plugin: String, message: String },
}
