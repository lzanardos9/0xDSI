type DrilldownData = {
  type: 'violation' | 'jailbreak' | 'shadow' | 'drift' | 'insider';
  item: any;
};

type Listener = (data: DrilldownData) => void;

const listeners: Set<Listener> = new Set();

export const gatewayDrilldownBus = {
  emit(data: DrilldownData) {
    listeners.forEach((fn) => fn(data));
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

export type { DrilldownData };
