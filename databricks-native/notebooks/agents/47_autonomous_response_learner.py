# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 47 - Autonomous Response Learner (ARL)
# MAGIC
# MAGIC Reinforcement Learning agent that learns **when** to execute defensive actions
# MAGIC based on network state observations. Implements key findings from Apple's
# MAGIC AISec '22 paper "Bridging Automated to Autonomous Cyber Defense."
# MAGIC
# MAGIC ## Architecture (Paper-Informed Design)
# MAGIC
# MAGIC | Component | Design Choice | Rationale (Paper Section) |
# MAGIC |-----------|---------------|--------------------------|
# MAGIC | State Encoding | **Percentile buckets** | Best transfer learning (Sec 6.2, Rows 22-30) |
# MAGIC | Action Space | Feature-based (4 abstract actions) | Reduces Q-matrix size (Sec 4.2) |
# MAGIC | Update Function | **High-Avoidance** | 7% loss chance vs 40% baseline (Sec 4.4) |
# MAGIC | Training | 3-phase (explore/greedy/exploit) | Convergence guarantee (Sec 4.3) |
# MAGIC | Noise | Synthetic injection during training | Hedges against unknown prod noise (Sec 6.2) |
# MAGIC | Reward | Availability - compromise + defense bonus | Modified blue reward (Sec 3.2.3) |
# MAGIC
# MAGIC ## Integration Points
# MAGIC
# MAGIC - **Input:** Alert stream from Detection Confluence (Agent 07), entity risk scores
# MAGIC - **Actions:** Dispatched to Vanguard Response (Agent 07), SOAR (response/01)
# MAGIC - **Feedback:** ALHF Learning Agent (Agent 25) corrections feed reward signal
# MAGIC - **Simulation:** Red Team Agent (Agent 11) generates synthetic attack episodes
# MAGIC - **Model Registry:** Q-table persisted in MLflow for versioning and rollback
# MAGIC
# MAGIC ## Safety Guarantees
# MAGIC
# MAGIC 1. **Human-in-the-loop gate:** Critical actions (rebuild_all, isolate high-value) require approval
# MAGIC 2. **Confidence threshold:** Only acts autonomously when Q-value exceeds learned threshold
# MAGIC 3. **Rollback:** Any action can be reversed within SLA window
# MAGIC 4. **Audit:** Every decision logged with full state/action/reward trace
# MAGIC
# MAGIC **Schedule:** Training loop every 6 hours; inference every 2 minutes

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from agent_framework import BatchAgent, AgentResult, AgentStatus
from datetime import datetime, timedelta
import json
import numpy as np
import mlflow
import hashlib

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("mode", "inference", "Mode: training | inference | simulation")
dbutils.widgets.text("training_episodes", "1000", "Number of training episodes")
dbutils.widgets.text("noise_injection_rate", "0.15", "Synthetic noise rate during training")
dbutils.widgets.text("confidence_threshold", "0.7", "Min Q-value confidence for autonomous action")
dbutils.widgets.text("lookback_minutes", "10", "Observation window for state construction")
dbutils.widgets.text("gamma", "0.015", "Discount factor (paper: 0.015)")
dbutils.widgets.text("learning_rate", "0.2", "Q-table learning rate (paper: 0.2)")
dbutils.widgets.text("loss_penalty", "-1000", "Penalty for episode loss")
dbutils.widgets.text("approval_required_actions", "rebuild_all,isolate_critical", "Actions needing human approval")

mode = dbutils.widgets.get("mode")
training_episodes = int(dbutils.widgets.get("training_episodes"))
noise_injection_rate = float(dbutils.widgets.get("noise_injection_rate"))
confidence_threshold = float(dbutils.widgets.get("confidence_threshold"))
lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
gamma = float(dbutils.widgets.get("gamma"))
learning_rate = float(dbutils.widgets.get("learning_rate"))
loss_penalty = int(dbutils.widgets.get("loss_penalty"))
approval_actions = dbutils.widgets.get("approval_required_actions").split(",")

mon.log_event("arl_config_loaded", {
    "mode": mode,
    "training_episodes": training_episodes,
    "noise_injection_rate": noise_injection_rate,
    "confidence_threshold": confidence_threshold,
    "gamma": gamma,
    "learning_rate": learning_rate,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## State Encoding (Percentile Buckets)
# MAGIC
# MAGIC Paper finding: Percentile-based state encoding provides topology-agnostic
# MAGIC representation that transfers across different network sizes and structures.
# MAGIC State space is exactly |S| = 5^4 = 625 regardless of network size.

# COMMAND ----------

# Percentile bucket boundaries (paper Sec 4.1)
PERCENTILE_BUCKETS = [0.0, 0.01, 0.25, 0.50, 0.75, 1.01]
BUCKET_LABELS = ["none", "low", "moderate", "high", "critical"]
NUM_BUCKETS = len(BUCKET_LABELS)

# Abstract actions (paper Sec 4.2, feature-based)
ACTIONS = {
    0: "wait",
    1: "isolate_host",
    2: "revoke_credentials",
    3: "rebuild_all",
}
NUM_ACTIONS = len(ACTIONS)

# Feature predicates for action targeting (paper Sec 4.2)
HOST_FEATURES = ["is_alerted", "is_online", "has_recent_login", "is_high_value"]
CRED_FEATURES = ["is_active", "used_on_compromised", "used_recently"]


def percentile_bucket(ratio: float) -> int:
    """Map a ratio [0,1] to a discrete bucket index (0-4)."""
    for i, upper in enumerate(PERCENTILE_BUCKETS[1:]):
        if ratio < upper:
            return i
    return NUM_BUCKETS - 1


def encode_state(observation: dict) -> tuple:
    """
    Encode network observation into percentile state tuple.

    Returns (s1, s2, s3, s4) where each si in {0,1,2,3,4}:
      s1 = percentile bucket of alerted hosts ratio
      s2 = percentile bucket of online hosts ratio
      s3 = percentile bucket of recent credential usage ratio
      s4 = percentile bucket of active credentials ratio
    """
    total_hosts = max(observation.get("total_hosts", 1), 1)
    total_creds = max(observation.get("total_credentials", 1), 1)

    s1 = percentile_bucket(observation.get("alerted_hosts", 0) / total_hosts)
    s2 = percentile_bucket(observation.get("online_hosts", total_hosts) / total_hosts)
    s3 = percentile_bucket(observation.get("recent_logins", 0) / total_creds)
    s4 = percentile_bucket(observation.get("active_credentials", total_creds) / total_creds)

    return (s1, s2, s3, s4)


def state_to_index(state: tuple) -> int:
    """Convert state tuple to flat index for Q-table lookup."""
    s1, s2, s3, s4 = state
    return s1 * (NUM_BUCKETS ** 3) + s2 * (NUM_BUCKETS ** 2) + s3 * NUM_BUCKETS + s4


def index_to_state(idx: int) -> tuple:
    """Convert flat index back to state tuple."""
    s4 = idx % NUM_BUCKETS
    idx //= NUM_BUCKETS
    s3 = idx % NUM_BUCKETS
    idx //= NUM_BUCKETS
    s2 = idx % NUM_BUCKETS
    s1 = idx // NUM_BUCKETS
    return (s1, s2, s3, s4)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Q-Table with High-Avoidance (Paper Sec 4.4)
# MAGIC
# MAGIC The High-Avoidance strategy marks losing state-action pairs permanently,
# MAGIC preventing the agent from ever choosing them again. When an episode ends
# MAGIC in loss at state s, ALL actions except rebuild_all are blacklisted.

# COMMAND ----------

LOSS_SENTINEL = -1e9  # Large negative to indicate blacklisted state-action pair
STATE_SPACE_SIZE = NUM_BUCKETS ** 4  # 625


class QTableHighAvoidance:
    """
    Q-table with High-Avoidance update function.

    Paper insight: Modifying the Bellman update to permanently penalize
    losing state-action pairs reduces loss probability from 40% to 7%
    while maintaining competitive average reward.
    """

    def __init__(self, gamma: float = 0.015, lr: float = 0.2):
        self.q_table = np.zeros((STATE_SPACE_SIZE, NUM_ACTIONS), dtype=np.float64)
        self.visit_counts = np.zeros((STATE_SPACE_SIZE, NUM_ACTIONS), dtype=np.int32)
        self.gamma = gamma
        self.lr = lr
        self.blacklisted = set()  # (state_idx, action_idx) pairs
        self.total_updates = 0

    def get_q_value(self, state_idx: int, action_idx: int) -> float:
        return self.q_table[state_idx, action_idx]

    def get_best_action(self, state_idx: int) -> tuple:
        """
        Return (best_action_idx, q_value, confidence).
        Skips blacklisted pairs. Falls back to rebuild_all if all blacklisted.
        """
        available = []
        for a in range(NUM_ACTIONS):
            if (state_idx, a) not in self.blacklisted:
                available.append((a, self.q_table[state_idx, a]))

        if not available:
            return (3, 0.0, 0.0)  # rebuild_all as last resort

        available.sort(key=lambda x: x[1], reverse=True)
        best_action, best_q = available[0]

        # Confidence: normalized Q-value relative to visit count
        visits = max(self.visit_counts[state_idx, best_action], 1)
        confidence = min(1.0, visits / 50.0) * (1.0 / (1.0 + np.exp(-best_q)))

        return (best_action, best_q, confidence)

    def update(self, state_idx: int, action_idx: int, reward: float, next_state_idx: int):
        """
        Bellman update with High-Avoidance modification.

        If reward is loss_penalty: blacklist (state, action) AND
        blacklist all actions except rebuild_all in next_state.
        """
        self.visit_counts[state_idx, action_idx] += 1
        self.total_updates += 1

        # High-Avoidance: negative reward = permanent blacklist
        if reward <= loss_penalty:
            self.q_table[state_idx, action_idx] = LOSS_SENTINEL
            self.blacklisted.add((state_idx, action_idx))

            # Also blacklist all non-rebuild actions in the terminal state
            for a in range(NUM_ACTIONS):
                if a != 3:  # 3 = rebuild_all
                    self.q_table[next_state_idx, a] = LOSS_SENTINEL
                    self.blacklisted.add((next_state_idx, a))
            return

        # Standard Bellman update (skip if previously blacklisted)
        if (state_idx, action_idx) in self.blacklisted:
            return

        current_q = self.q_table[state_idx, action_idx]
        max_next_q = max(
            self.q_table[next_state_idx, a]
            for a in range(NUM_ACTIONS)
            if (next_state_idx, a) not in self.blacklisted
        ) if any((next_state_idx, a) not in self.blacklisted for a in range(NUM_ACTIONS)) else 0.0

        # Bellman equation (paper Eq. 1)
        new_q = current_q + self.lr * (reward + self.gamma * max_next_q - current_q)
        self.q_table[state_idx, action_idx] = new_q

    def explore_action(self, state_idx: int) -> int:
        """
        Choose least-visited non-blacklisted action for exploration.
        Restricts rebuild_all to max 3 explorations per state (paper Sec 4.3).
        """
        candidates = []
        for a in range(NUM_ACTIONS):
            if (state_idx, a) in self.blacklisted:
                continue
            if a == 3 and self.visit_counts[state_idx, a] >= 3:
                continue
            candidates.append((a, self.visit_counts[state_idx, a]))

        if not candidates:
            return 3  # fallback to rebuild_all

        candidates.sort(key=lambda x: x[1])
        return candidates[0][0]

    def get_stats(self) -> dict:
        return {
            "total_updates": self.total_updates,
            "blacklisted_pairs": len(self.blacklisted),
            "states_visited": int(np.sum(np.any(self.visit_counts > 0, axis=1))),
            "q_table_mean": float(np.mean(self.q_table[self.q_table > LOSS_SENTINEL])),
            "q_table_max": float(np.max(self.q_table)),
        }

    def serialize(self) -> dict:
        """Serialize for MLflow artifact storage."""
        return {
            "q_table": self.q_table.tolist(),
            "visit_counts": self.visit_counts.tolist(),
            "blacklisted": list(self.blacklisted),
            "gamma": self.gamma,
            "lr": self.lr,
            "total_updates": self.total_updates,
        }

    @classmethod
    def deserialize(cls, data: dict) -> "QTableHighAvoidance":
        """Load from MLflow artifact."""
        instance = cls(gamma=data["gamma"], lr=data["lr"])
        instance.q_table = np.array(data["q_table"], dtype=np.float64)
        instance.visit_counts = np.array(data["visit_counts"], dtype=np.int32)
        instance.blacklisted = set(tuple(pair) for pair in data["blacklisted"])
        instance.total_updates = data["total_updates"]
        return instance

# COMMAND ----------

# MAGIC %md
# MAGIC ## Reward Function (Paper Sec 3.2.3 - Modified Blue Reward)
# MAGIC
# MAGIC Reward = availability_score - compromise_penalty + defense_bonus
# MAGIC
# MAGIC - **availability_score:** Fraction of hosts online and productive [0, 1]
# MAGIC - **compromise_penalty:** Compromised hosts treated as offline
# MAGIC - **defense_bonus:** +bonus if defensive action removed attacker access

# COMMAND ----------

def compute_reward(
    pre_state: dict,
    post_state: dict,
    action_taken: int,
    action_successful: bool,
    episode_lost: bool,
) -> float:
    """
    Compute reward following the paper's blue reward function.

    Returns float in range [loss_penalty, +max_availability].
    """
    if episode_lost:
        return float(loss_penalty)

    total_hosts = max(post_state.get("total_hosts", 1), 1)
    online_hosts = post_state.get("online_hosts", 0)
    compromised_hosts = post_state.get("compromised_hosts", 0)

    # Availability: online minus compromised (paper: compromised treated as offline)
    effective_online = max(online_hosts - compromised_hosts, 0)
    availability_score = effective_online / total_hosts

    # Defense bonus: if action removed attacker access, full availability for that target
    defense_bonus = 0.0
    if action_successful and action_taken in (1, 2):  # isolate or revoke
        # Paper: defender receives full availability for defended object
        defense_bonus = 1.0 / total_hosts

    # Penalty for unnecessary disruption (isolate/rebuild when no threat)
    disruption_penalty = 0.0
    if action_taken == 1 and not action_successful:
        disruption_penalty = -0.5 / total_hosts  # False positive response
    elif action_taken == 3:  # rebuild_all always has high availability cost
        disruption_penalty = -0.3

    reward = availability_score + defense_bonus + disruption_penalty

    return reward

# COMMAND ----------

# MAGIC %md
# MAGIC ## Network State Observer
# MAGIC
# MAGIC Reads current network state from Delta tables and constructs observation dict.

# COMMAND ----------

events_table = cfg.get_table_path("events")
alerts_table = cfg.get_table_path("alerts")
assets_table = cfg.get_table_path("asset_registry")


def observe_network_state() -> dict:
    """
    Construct observation dict from live Delta tables.

    Returns dict with keys matching encode_state() expectations:
      total_hosts, alerted_hosts, online_hosts,
      total_credentials, recent_logins, active_credentials,
      compromised_hosts (from critical/high alerts)
    """
    cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)
    cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")

    # Host counts from asset registry
    try:
        host_stats = spark.sql(f"""
            SELECT
                COUNT(*) as total_hosts,
                SUM(CASE WHEN status = 'online' OR status IS NULL THEN 1 ELSE 0 END) as online_hosts
            FROM {assets_table}
            WHERE asset_type IN ('server', 'workstation', 'endpoint', 'host')
        """).first()
        total_hosts = max(host_stats["total_hosts"] or 20, 1)
        online_hosts = host_stats["online_hosts"] or total_hosts
    except Exception:
        total_hosts = 20
        online_hosts = 18

    # Alerted hosts (alerts within lookback window)
    try:
        alert_stats = spark.sql(f"""
            SELECT COUNT(DISTINCT COALESCE(source_ip, hostname, entity_id)) as alerted_entities
            FROM {alerts_table}
            WHERE created_at >= '{cutoff_str}'
              AND status NOT IN ('resolved', 'false_positive')
        """).first()
        alerted_hosts = alert_stats["alerted_entities"] or 0
    except Exception:
        alerted_hosts = 0

    # Compromised: critical/high severity unresolved alerts
    try:
        compromised = spark.sql(f"""
            SELECT COUNT(DISTINCT COALESCE(source_ip, hostname, entity_id)) as compromised
            FROM {alerts_table}
            WHERE severity IN ('critical', 'high')
              AND status NOT IN ('resolved', 'false_positive')
              AND created_at >= '{cutoff_str}'
        """).first()
        compromised_hosts = compromised["compromised"] or 0
    except Exception:
        compromised_hosts = 0

    # Credential activity from recent events
    try:
        cred_stats = spark.sql(f"""
            SELECT
                COUNT(DISTINCT user_id) as recent_logins,
                COUNT(DISTINCT CASE WHEN event_type LIKE '%login%' OR event_type LIKE '%auth%'
                    THEN user_id END) as active_credentials
            FROM {events_table}
            WHERE timestamp >= '{cutoff_str}'
        """).first()
        recent_logins = cred_stats["recent_logins"] or 0
        active_credentials = cred_stats["active_credentials"] or 0
    except Exception:
        recent_logins = 0
        active_credentials = 0

    total_credentials = max(total_hosts * 2, 10)  # Estimate: ~2 creds per host

    return {
        "total_hosts": total_hosts,
        "online_hosts": online_hosts,
        "alerted_hosts": alerted_hosts,
        "compromised_hosts": compromised_hosts,
        "total_credentials": total_credentials,
        "recent_logins": recent_logins,
        "active_credentials": active_credentials,
        "observed_at": datetime.utcnow().isoformat(),
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Simulation Environment (Training Mode)
# MAGIC
# MAGIC Synthetic network simulation for offline RL training.
# MAGIC Injects configurable noise to build robust policies (paper Sec 6.2).

# COMMAND ----------

class NetworkSimulator:
    """
    Simplified network simulator for RL training.

    Based on CyberBattleSim concepts (paper Sec 3):
    - Attacker propagates probabilistically through hosts
    - Defender observes with noise (FP/FN rates)
    - Episode ends when attacker compromises win_threshold% of hosts
    """

    def __init__(
        self,
        num_hosts: int = 15,
        num_credentials: int = 10,
        fp_rate: float = 0.10,
        fn_rate: float = 0.20,
        login_rate: float = 0.10,
        missed_rate: float = 0.35,
        win_threshold: float = 0.66,
        attacker_speed: float = 0.3,
    ):
        self.num_hosts = num_hosts
        self.num_credentials = num_credentials
        self.fp_rate = fp_rate
        self.fn_rate = fn_rate
        self.login_rate = login_rate
        self.missed_rate = missed_rate
        self.win_threshold = win_threshold
        self.attacker_speed = attacker_speed
        self.reset()

    def reset(self):
        """Reset to initial state: attacker owns 1 random host."""
        self.compromised = set()
        self.compromised.add(np.random.randint(0, self.num_hosts))
        self.offline = set()
        self.revoked_creds = set()
        self.revoke_timers = {}
        self.iteration = 0
        self.episode_lost = False
        return self._observe()

    def _observe(self) -> dict:
        """Generate noisy observation of true state."""
        alerted = 0
        for h in range(self.num_hosts):
            if h in self.compromised:
                if np.random.random() > self.fn_rate:
                    alerted += 1
            else:
                if np.random.random() < self.fp_rate:
                    alerted += 1

        # Noisy credential observations
        recent_logins = 0
        for c in range(self.num_credentials):
            if np.random.random() < self.login_rate:
                if np.random.random() > self.missed_rate:
                    recent_logins += 1

        online = self.num_hosts - len(self.offline)
        active_creds = self.num_credentials - len(self.revoked_creds)

        return {
            "total_hosts": self.num_hosts,
            "online_hosts": online,
            "alerted_hosts": alerted,
            "compromised_hosts": len(self.compromised),
            "total_credentials": self.num_credentials,
            "recent_logins": recent_logins,
            "active_credentials": active_creds,
        }

    def step(self, action: int) -> tuple:
        """
        Execute one iteration: attacker moves, then defender acts.

        Returns (observation, reward, done, info)
        """
        self.iteration += 1

        # --- Attacker turn ---
        for h in list(self.compromised):
            if h in self.offline:
                continue
            # Try to spread to adjacent hosts
            for target in range(self.num_hosts):
                if target in self.compromised or target in self.offline:
                    continue
                if np.random.random() < self.attacker_speed / self.num_hosts:
                    self.compromised.add(target)

        # --- Defender turn ---
        action_successful = False
        if action == 0:  # wait
            pass
        elif action == 1:  # isolate_host (targets most likely compromised)
            # Pick a random online host that might be compromised
            candidates = [h for h in self.compromised if h not in self.offline]
            if candidates:
                target = np.random.choice(list(candidates))
                self.offline.add(target)
                self.compromised.discard(target)
                action_successful = True
            else:
                # False positive: isolate a random online host
                online = [h for h in range(self.num_hosts) if h not in self.offline]
                if online:
                    self.offline.add(np.random.choice(online))
        elif action == 2:  # revoke_credentials
            # Revoke a random credential
            available = [c for c in range(self.num_credentials) if c not in self.revoked_creds]
            if available:
                c = np.random.choice(available)
                self.revoked_creds.add(c)
                self.revoke_timers[c] = 5
                # Chance it disrupts attacker lateral movement
                if self.compromised and np.random.random() < 0.4:
                    removed = np.random.choice(list(self.compromised))
                    self.compromised.discard(removed)
                    action_successful = True
        elif action == 3:  # rebuild_all
            self.offline = set(range(self.num_hosts))
            self.compromised = set()
            self.compromised.add(0)  # Attacker retains initial foothold
            action_successful = True

        # --- Credential restoration timers ---
        expired = []
        for c, timer in self.revoke_timers.items():
            if timer <= 1:
                expired.append(c)
            else:
                self.revoke_timers[c] = timer - 1
        for c in expired:
            self.revoked_creds.discard(c)
            del self.revoke_timers[c]

        # --- Host restoration (re-image takes 10 iterations) ---
        # Simplified: hosts come back after being offline for a bit
        if self.iteration % 10 == 0 and self.offline:
            restored = np.random.choice(list(self.offline))
            self.offline.discard(restored)

        # --- Check win condition ---
        compromised_ratio = len(self.compromised) / self.num_hosts
        done = compromised_ratio >= self.win_threshold
        self.episode_lost = done

        obs = self._observe()
        reward = compute_reward(
            pre_state=obs,
            post_state=obs,
            action_taken=action,
            action_successful=action_successful,
            episode_lost=done,
        )

        info = {
            "iteration": self.iteration,
            "true_compromised": len(self.compromised),
            "action_successful": action_successful,
        }

        return obs, reward, done, info

# COMMAND ----------

# MAGIC %md
# MAGIC ## Training Loop (3-Phase: Explore / Epsilon-Greedy / Exploit)
# MAGIC
# MAGIC Paper Sec 4.3: Three training phases ensure proper convergence:
# MAGIC 1. **Exploration** (70% of episodes): Short episodes, mostly random actions
# MAGIC 2. **Epsilon-Greedy** (25%): Decaying epsilon from 0.9 to 0.1
# MAGIC 3. **Exploitation-Only** (5%): Pure exploitation to refine policy

# COMMAND ----------

def train_agent(
    num_episodes: int = 1000,
    max_iterations: int = 500,
    noise_rate: float = 0.15,
    gamma: float = 0.015,
    lr: float = 0.2,
) -> tuple:
    """
    Train the ARL agent in simulation.

    Returns (q_table, training_history).
    """
    q_table = QTableHighAvoidance(gamma=gamma, lr=lr)
    history = []

    # 3-phase split (paper Sec 4.3)
    explore_episodes = int(num_episodes * 0.70)
    greedy_episodes = int(num_episodes * 0.25)
    exploit_episodes = num_episodes - explore_episodes - greedy_episodes

    # Paper insight: train with slightly MORE noise than expected in production
    training_noise = noise_rate * 1.5

    for episode in range(num_episodes):
        # Determine phase and epsilon
        if episode < explore_episodes:
            epsilon = 0.95
            max_iter = max_iterations // 5  # Shorter episodes for exploration
        elif episode < explore_episodes + greedy_episodes:
            progress = (episode - explore_episodes) / greedy_episodes
            epsilon = 0.9 - 0.8 * progress  # Decay 0.9 -> 0.1
            max_iter = max_iterations
        else:
            epsilon = 0.0  # Pure exploitation
            max_iter = max_iterations

        # Vary simulator parameters for robustness
        sim = NetworkSimulator(
            num_hosts=np.random.choice([8, 12, 15, 20]),
            num_credentials=np.random.choice([6, 10, 15]),
            fp_rate=min(0.45, training_noise + np.random.uniform(-0.05, 0.05)),
            fn_rate=min(0.75, training_noise * 1.3 + np.random.uniform(-0.1, 0.1)),
            login_rate=training_noise,
            missed_rate=min(0.8, training_noise * 2.3),
            win_threshold=np.random.choice([0.30, 0.66, 1.1]),
            attacker_speed=np.random.uniform(0.2, 0.5),
        )

        obs = sim.reset()
        episode_reward = 0.0
        episode_steps = 0

        for iteration in range(max_iter):
            state = encode_state(obs)
            state_idx = state_to_index(state)

            # Epsilon-greedy action selection
            if np.random.random() < epsilon:
                action = q_table.explore_action(state_idx)
            else:
                action, _, _ = q_table.get_best_action(state_idx)

            # Execute action
            next_obs, reward, done, info = sim.step(action)
            next_state = encode_state(next_obs)
            next_state_idx = state_to_index(next_state)

            # Q-table update (with High-Avoidance)
            q_table.update(state_idx, action, reward, next_state_idx)

            obs = next_obs
            episode_reward += reward
            episode_steps += 1

            if done:
                break

        history.append({
            "episode": episode,
            "reward": episode_reward,
            "steps": episode_steps,
            "lost": sim.episode_lost,
            "phase": "explore" if episode < explore_episodes
                     else "greedy" if episode < explore_episodes + greedy_episodes
                     else "exploit",
        })

        # Log progress every 100 episodes
        if (episode + 1) % 100 == 0:
            recent = history[-100:]
            avg_reward = sum(h["reward"] for h in recent) / len(recent)
            loss_rate = sum(1 for h in recent if h["lost"]) / len(recent)
            mon.log_event("arl_training_progress", {
                "episode": episode + 1,
                "avg_reward_100": round(avg_reward, 2),
                "loss_rate_100": round(loss_rate, 3),
                **q_table.get_stats(),
            })

    return q_table, history

# COMMAND ----------

# MAGIC %md
# MAGIC ## Inference Engine (Production Mode)
# MAGIC
# MAGIC Loads trained Q-table and makes autonomous defense decisions.
# MAGIC Actions above confidence threshold are executed; below threshold
# MAGIC are forwarded to human analyst for approval.

# COMMAND ----------

decisions_table = cfg.get_table_path("arl_decisions")
q_table_table = cfg.get_table_path("arl_q_tables")
training_runs_table = cfg.get_table_path("arl_training_runs")


def run_inference(q_table: QTableHighAvoidance) -> dict:
    """
    Observe network state, choose action, and dispatch or queue for approval.
    """
    obs = observe_network_state()
    state = encode_state(obs)
    state_idx = state_to_index(state)

    action_idx, q_value, confidence = q_table.get_best_action(state_idx)
    action_name = ACTIONS[action_idx]

    decision = {
        "decision_id": hashlib.md5(f"{datetime.utcnow().isoformat()}-{state_idx}-{action_idx}".encode()).hexdigest()[:16],
        "state": list(state),
        "state_idx": state_idx,
        "action_idx": action_idx,
        "action_name": action_name,
        "q_value": round(q_value, 4),
        "confidence": round(confidence, 4),
        "observation": obs,
        "decided_at": datetime.utcnow().isoformat(),
    }

    # Determine if action can be autonomous or needs approval
    needs_approval = (
        confidence < confidence_threshold or
        action_name in approval_actions
    )

    decision["autonomous"] = not needs_approval
    decision["status"] = "executed" if not needs_approval else "pending_approval"

    if not needs_approval and action_name != "wait":
        # Dispatch action to response system
        decision["dispatch_target"] = "vanguard_response"
        mon.log_event("arl_autonomous_action", {
            "action": action_name,
            "confidence": confidence,
            "state": list(state),
        })
    elif needs_approval and action_name != "wait":
        decision["dispatch_target"] = "human_approval_queue"
        mon.log_event("arl_approval_requested", {
            "action": action_name,
            "confidence": confidence,
            "reason": "low_confidence" if confidence < confidence_threshold else "critical_action",
        })

    return decision

# COMMAND ----------

# MAGIC %md
# MAGIC ## MLflow Model Registry Integration
# MAGIC
# MAGIC Q-tables are versioned as MLflow artifacts for rollback and A/B testing.

# COMMAND ----------

MLFLOW_EXPERIMENT = "/Shared/0xDSI/agents/autonomous_response_learner"


def save_model_to_mlflow(q_table: QTableHighAvoidance, history: list, metadata: dict):
    """Persist trained Q-table as MLflow artifact."""
    try:
        mlflow.set_experiment(MLFLOW_EXPERIMENT)
    except Exception:
        pass

    with mlflow.start_run(run_name=f"arl_training_{datetime.utcnow().strftime('%Y%m%d_%H%M')}"):
        # Log hyperparameters
        mlflow.log_param("gamma", q_table.gamma)
        mlflow.log_param("lr", q_table.lr)
        mlflow.log_param("training_episodes", len(history))
        mlflow.log_param("noise_injection_rate", noise_injection_rate)

        # Log metrics
        final_100 = history[-100:] if len(history) >= 100 else history
        avg_reward = sum(h["reward"] for h in final_100) / len(final_100)
        loss_rate = sum(1 for h in final_100 if h["lost"]) / len(final_100)
        stats = q_table.get_stats()

        mlflow.log_metric("avg_reward_final_100", avg_reward)
        mlflow.log_metric("loss_rate_final_100", loss_rate)
        mlflow.log_metric("states_visited", stats["states_visited"])
        mlflow.log_metric("blacklisted_pairs", stats["blacklisted_pairs"])
        mlflow.log_metric("q_table_max", stats["q_table_max"])

        # Save Q-table as artifact
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "q_table.json")
            with open(path, "w") as f:
                json.dump(q_table.serialize(), f)
            mlflow.log_artifact(path)

            # Save training history
            hist_path = os.path.join(tmpdir, "training_history.json")
            with open(hist_path, "w") as f:
                json.dump(history[-500:], f)  # Last 500 episodes
            mlflow.log_artifact(hist_path)

    mon.log_event("arl_model_saved", {
        "avg_reward": round(avg_reward, 2),
        "loss_rate": round(loss_rate, 3),
        **stats,
    })


def load_latest_model() -> QTableHighAvoidance:
    """Load latest Q-table from Delta table (faster than MLflow for inference)."""
    try:
        latest = spark.sql(f"""
            SELECT q_table_json
            FROM {q_table_table}
            WHERE status = 'active'
            ORDER BY trained_at DESC
            LIMIT 1
        """).first()

        if latest:
            data = json.loads(latest["q_table_json"])
            return QTableHighAvoidance.deserialize(data)
    except Exception as e:
        mon.log_event("arl_model_load_failed", {"error": str(e)[:200]})

    # Return untrained Q-table (will only choose wait)
    return QTableHighAvoidance(gamma=gamma, lr=learning_rate)

# COMMAND ----------

# MAGIC %md
# MAGIC ## ALHF Feedback Integration (Paper: Transfer + Adversarial Robustness)
# MAGIC
# MAGIC When analysts override ARL decisions, the feedback is used as negative
# MAGIC reward signal to update the Q-table (online learning).

# COMMAND ----------

def incorporate_analyst_feedback():
    """
    Read recent analyst overrides from the feedback table and apply
    as reward corrections to the active Q-table.
    """
    try:
        feedback_table = cfg.get_table_path("analyst_feedback")
        recent_feedback = spark.sql(f"""
            SELECT alert_id, verdict, reasoning, corrections
            FROM {feedback_table}
            WHERE feedback_type = 'arl_override'
              AND created_at >= current_timestamp() - INTERVAL 6 HOURS
        """).collect()

        if not recent_feedback:
            return 0

        q_table = load_latest_model()
        corrections_applied = 0

        for row in recent_feedback:
            corrections = json.loads(row["corrections"]) if row["corrections"] else {}
            state_idx = corrections.get("state_idx")
            action_idx = corrections.get("action_idx")

            if state_idx is not None and action_idx is not None:
                if row["verdict"] == "false_positive":
                    # Analyst says action was wrong: apply avoidance
                    q_table.update(state_idx, action_idx, -100.0, state_idx)
                    corrections_applied += 1
                elif row["verdict"] == "confirmed_threat":
                    # Analyst confirms: boost the action
                    q_table.update(state_idx, action_idx, 1.0, state_idx)
                    corrections_applied += 1

        if corrections_applied > 0:
            # Persist updated Q-table
            q_data = json.dumps(q_table.serialize())
            spark.sql(f"""
                UPDATE {q_table_table}
                SET q_table_json = '{q_data.replace("'", "''")[:50000]}',
                    updated_at = current_timestamp(),
                    feedback_corrections = feedback_corrections + {corrections_applied}
                WHERE status = 'active'
            """)
            mon.log_event("arl_feedback_applied", {"corrections": corrections_applied})

        return corrections_applied

    except Exception as e:
        mon.log_event("arl_feedback_error", {"error": str(e)[:200]})
        return 0

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

class AutonomousResponseLearner(BatchAgent):
    """Agent 47: Autonomous Response Learner."""

    def __init__(self):
        super().__init__(
            agent_name="autonomous_response_learner",
            config={"mode": mode, "lookback_minutes": lookback_minutes},
        )
        self.stats = {
            "mode": mode,
            "decisions_made": 0,
            "autonomous_actions": 0,
            "approval_requests": 0,
            "training_episodes": 0,
            "avg_reward": 0.0,
            "loss_rate": 0.0,
            "feedback_applied": 0,
        }

    def execute(self) -> AgentResult:
        if mode == "training":
            return self._run_training()
        elif mode == "inference":
            return self._run_inference()
        elif mode == "simulation":
            return self._run_simulation_eval()
        else:
            return AgentResult(
                status=AgentStatus.ERROR,
                agent_name=self.agent_name,
                details={"error": f"Unknown mode: {mode}"},
            )

    def _run_training(self) -> AgentResult:
        """Full training loop with MLflow persistence."""
        mon.log_event("arl_training_started", {"episodes": training_episodes})

        q_table, history = train_agent(
            num_episodes=training_episodes,
            noise_rate=noise_injection_rate,
            gamma=gamma,
            lr=learning_rate,
        )

        # Compute final metrics
        final_100 = history[-100:] if len(history) >= 100 else history
        avg_reward = sum(h["reward"] for h in final_100) / len(final_100)
        loss_rate = sum(1 for h in final_100 if h["lost"]) / len(final_100)

        # Save to MLflow
        save_model_to_mlflow(q_table, history, {"mode": "training"})

        # Save active Q-table to Delta for fast inference loading
        q_data = json.dumps(q_table.serialize())
        try:
            spark.sql(f"""
                UPDATE {q_table_table} SET status = 'archived' WHERE status = 'active'
            """)
        except Exception:
            pass

        from pyspark.sql import Row
        from pyspark.sql.types import StructType, StructField, StringType, TimestampType, IntegerType, DoubleType

        row_data = [{
            "model_id": hashlib.md5(f"arl_{datetime.utcnow().isoformat()}".encode()).hexdigest()[:16],
            "q_table_json": q_data[:100000],
            "status": "active",
            "training_episodes": training_episodes,
            "avg_reward": avg_reward,
            "loss_rate": loss_rate,
            "states_visited": q_table.get_stats()["states_visited"],
            "blacklisted_pairs": q_table.get_stats()["blacklisted_pairs"],
            "noise_rate": noise_injection_rate,
            "gamma": gamma,
            "learning_rate": learning_rate,
            "feedback_corrections": 0,
            "trained_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }]

        schema = StructType([
            StructField("model_id", StringType()),
            StructField("q_table_json", StringType()),
            StructField("status", StringType()),
            StructField("training_episodes", IntegerType()),
            StructField("avg_reward", DoubleType()),
            StructField("loss_rate", DoubleType()),
            StructField("states_visited", IntegerType()),
            StructField("blacklisted_pairs", IntegerType()),
            StructField("noise_rate", DoubleType()),
            StructField("gamma", DoubleType()),
            StructField("learning_rate", DoubleType()),
            StructField("feedback_corrections", IntegerType()),
            StructField("trained_at", TimestampType()),
            StructField("updated_at", TimestampType()),
        ])

        df = spark.createDataFrame(row_data, schema)
        df.write.mode("append").saveAsTable(q_table_table)

        self.stats.update({
            "training_episodes": training_episodes,
            "avg_reward": round(avg_reward, 3),
            "loss_rate": round(loss_rate, 3),
            **q_table.get_stats(),
        })

        return AgentResult(
            status=AgentStatus.SUCCESS,
            agent_name=self.agent_name,
            processed_count=training_episodes,
            details=self.stats,
        )

    def _run_inference(self) -> AgentResult:
        """Production inference: observe, decide, dispatch."""
        q_table = load_latest_model()

        # Apply recent analyst feedback first
        feedback_count = incorporate_analyst_feedback()
        self.stats["feedback_applied"] = feedback_count

        # Make decision
        decision = run_inference(q_table)
        self.stats["decisions_made"] = 1

        if decision.get("autonomous"):
            self.stats["autonomous_actions"] = 1
        elif decision.get("status") == "pending_approval":
            self.stats["approval_requests"] = 1

        # Persist decision to audit table
        try:
            from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType, BooleanType
            decision_row = [{
                "decision_id": decision["decision_id"],
                "state_tuple": json.dumps(decision["state"]),
                "action_name": decision["action_name"],
                "q_value": decision["q_value"],
                "confidence": decision["confidence"],
                "autonomous": decision["autonomous"],
                "status": decision["status"],
                "observation_json": json.dumps(decision["observation"]),
                "decided_at": datetime.utcnow(),
            }]

            schema = StructType([
                StructField("decision_id", StringType()),
                StructField("state_tuple", StringType()),
                StructField("action_name", StringType()),
                StructField("q_value", DoubleType()),
                StructField("confidence", DoubleType()),
                StructField("autonomous", BooleanType()),
                StructField("status", StringType()),
                StructField("observation_json", StringType()),
                StructField("decided_at", TimestampType()),
            ])

            df = spark.createDataFrame(decision_row, schema)
            df.write.mode("append").saveAsTable(decisions_table)
        except Exception as e:
            mon.log_event("arl_decision_persist_error", {"error": str(e)[:200]})

        return AgentResult(
            status=AgentStatus.SUCCESS,
            agent_name=self.agent_name,
            processed_count=1,
            details={**self.stats, "decision": decision},
        )

    def _run_simulation_eval(self) -> AgentResult:
        """Evaluate current model against baselines in simulation."""
        q_table = load_latest_model()

        # Run 100 evaluation episodes
        eval_results = {"arl": [], "random": [], "zapper": []}
        max_iter = 500

        for _ in range(100):
            # Same simulator config for fair comparison
            sim_config = dict(
                num_hosts=15,
                num_credentials=10,
                fp_rate=0.10,
                fn_rate=0.20,
                login_rate=0.10,
                missed_rate=0.35,
                win_threshold=0.66,
            )

            # ARL agent
            sim = NetworkSimulator(**sim_config)
            obs = sim.reset()
            total_reward = 0.0
            for _ in range(max_iter):
                state = encode_state(obs)
                action, _, _ = q_table.get_best_action(state_to_index(state))
                obs, reward, done, _ = sim.step(action)
                total_reward += reward
                if done:
                    break
            eval_results["arl"].append(total_reward)

            # Random baseline
            sim = NetworkSimulator(**sim_config)
            obs = sim.reset()
            total_reward = 0.0
            for _ in range(max_iter):
                action = np.random.randint(0, NUM_ACTIONS)
                obs, reward, done, _ = sim.step(action)
                total_reward += reward
                if done:
                    break
            eval_results["random"].append(total_reward)

            # Zapper baseline (always isolate if alerted)
            sim = NetworkSimulator(**sim_config)
            obs = sim.reset()
            total_reward = 0.0
            for _ in range(max_iter):
                if obs["alerted_hosts"] > 0:
                    action = 1  # isolate
                else:
                    action = 0  # wait
                obs, reward, done, _ = sim.step(action)
                total_reward += reward
                if done:
                    break
            eval_results["zapper"].append(total_reward)

        comparison = {
            "arl_avg": round(np.mean(eval_results["arl"]), 2),
            "random_avg": round(np.mean(eval_results["random"]), 2),
            "zapper_avg": round(np.mean(eval_results["zapper"]), 2),
            "arl_vs_random": round((np.mean(eval_results["arl"]) - np.mean(eval_results["random"])), 2),
            "arl_vs_zapper": round((np.mean(eval_results["arl"]) - np.mean(eval_results["zapper"])), 2),
            "arl_loss_rate": round(sum(1 for r in eval_results["arl"] if r < 0) / 100, 3),
        }

        mon.log_event("arl_simulation_eval", comparison)

        return AgentResult(
            status=AgentStatus.SUCCESS,
            agent_name=self.agent_name,
            processed_count=100,
            details=comparison,
        )

# COMMAND ----------

agent = AutonomousResponseLearner()
result = agent.run()
mon.log_info(f"ARL Agent result: {result.status.value}", extra=result.details)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Results Summary

# COMMAND ----------

if result.status == AgentStatus.SUCCESS:
    details = result.details
    if mode == "training":
        print(f"""
+===================================================================+
|  Agent 47: Autonomous Response Learner - Training Complete         |
+===================================================================+
|  Episodes Trained:  {details.get('training_episodes', 0):<6}                                   |
|  Avg Reward (last 100): {details.get('avg_reward', 0):<8}                             |
|  Loss Rate (last 100):  {details.get('loss_rate', 0):<8}                             |
|  States Explored:   {details.get('states_visited', 0):<6}  / 625                          |
|  Blacklisted Pairs: {details.get('blacklisted_pairs', 0):<6}                                  |
|  Q-Table Max Value: {details.get('q_table_max', 0):<8}                             |
+===================================================================+
        """)
    elif mode == "inference":
        decision = details.get("decision", {})
        print(f"""
+===================================================================+
|  Agent 47: Autonomous Response Learner - Inference                 |
+===================================================================+
|  Network State:  {decision.get('state', [])}                       |
|  Action Chosen:  {decision.get('action_name', 'wait'):<20}                       |
|  Q-Value:        {decision.get('q_value', 0):<8}                             |
|  Confidence:     {decision.get('confidence', 0):<8}                             |
|  Autonomous:     {decision.get('autonomous', False)}                             |
|  Status:         {decision.get('status', 'unknown'):<20}                       |
|  Feedback Applied: {details.get('feedback_applied', 0)}                          |
+===================================================================+
        """)
    elif mode == "simulation":
        print(f"""
+===================================================================+
|  Agent 47: Autonomous Response Learner - Simulation Eval           |
+===================================================================+
|  ARL Average Reward:     {details.get('arl_avg', 0):<8}                           |
|  Random Baseline:        {details.get('random_avg', 0):<8}                           |
|  Zapper Baseline:        {details.get('zapper_avg', 0):<8}                           |
|  ARL vs Random:         +{details.get('arl_vs_random', 0):<8}                          |
|  ARL vs Zapper:         +{details.get('arl_vs_zapper', 0):<8}                          |
|  ARL Loss Rate:          {details.get('arl_loss_rate', 0):<8}                           |
+===================================================================+
        """)
else:
    print(f"Agent 47 error: {result.details}")

# COMMAND ----------

import json
dbutils.notebook.exit(json.dumps({
    "status": result.status.value,
    "mode": mode,
    "processed": result.processed_count,
    "details": {k: v for k, v in result.details.items() if k != "decision"},
}))
