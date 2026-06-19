pub mod netskope;
pub mod zscaler;
pub mod defender_cloud_apps;
pub mod cloudlock;

pub use netskope::NetskopeCollector;
pub use zscaler::ZscalerCollector;
pub use defender_cloud_apps::DefenderCloudAppsCollector;
pub use cloudlock::CloudlockCollector;
