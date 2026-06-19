mod config;
mod connectors;
mod buffer;
mod shipper;
mod ocsf;
mod control;
mod plugins;

use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use tracing::{info, error};

#[derive(Parser)]
#[command(name = "0xdsi-edge", version, about = "High-performance edge security collector")]
struct Cli {
    #[arg(short, long, default_value = "/etc/0xdsi-edge/config.toml")]
    config: PathBuf,

    #[arg(short, long, default_value = "info")]
    log_level: String,

    #[arg(long)]
    validate_config: bool,

    #[arg(long)]
    list_connectors: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    tracing_subscriber::fmt()
        .with_env_filter(&cli.log_level)
        .json()
        .init();

    info!(version = env!("CARGO_PKG_VERSION"), "0xDSI Edge Collector starting");

    if cli.list_connectors {
        connectors::print_available();
        return Ok(());
    }

    let cfg = config::load(&cli.config)?;

    if cli.validate_config {
        info!("Configuration valid");
        return Ok(());
    }

    let buffer = buffer::RocksBuffer::new(&cfg.buffer)?;
    let shipper = shipper::Shipper::new(&cfg.shipper).await?;
    let (event_tx, event_rx) = crossbeam_channel::bounded(cfg.pipeline.channel_capacity);

    let connector_handles = connectors::spawn_all(&cfg.connectors, event_tx.clone()).await?;
    info!(count = connector_handles.len(), "Connectors started");

    let shipper_handle = tokio::spawn(async move {
        shipper::run(shipper, buffer, event_rx).await
    });

    let control_handle = if cfg.control.enabled {
        Some(tokio::spawn(control::serve(cfg.control.clone())))
    } else {
        None
    };

    tokio::signal::ctrl_c().await?;
    info!("Shutdown signal received");

    for handle in connector_handles {
        handle.abort();
    }
    shipper_handle.abort();
    if let Some(h) = control_handle {
        h.abort();
    }

    info!("0xDSI Edge Collector stopped");
    Ok(())
}
