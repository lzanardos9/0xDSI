pub mod slack;
pub mod microsoft365;
pub mod google_workspace;

pub use slack::SlackCollector;
pub use microsoft365::Microsoft365Collector;
pub use google_workspace::GoogleWorkspaceCollector;
