use tokio::sync::broadcast;

pub struct ShutdownSignal {
    tx: broadcast::Sender<()>,
}

impl ShutdownSignal {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<()> {
        self.tx.subscribe()
    }

    pub fn trigger(&self) {
        let _ = self.tx.send(());
    }
}

impl Default for ShutdownSignal {
    fn default() -> Self {
        Self::new()
    }
}
