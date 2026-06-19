pub mod zscaler_zpa;
pub mod cloudflare_access;
pub mod prisma_access;
pub mod tailscale;

pub use zscaler_zpa::ZscalerZpaCollector;
pub use cloudflare_access::CloudflareAccessCollector;
pub use prisma_access::PrismaAccessCollector;
pub use tailscale::TailscaleCollector;
