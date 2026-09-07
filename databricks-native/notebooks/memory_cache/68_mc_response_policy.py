# Databricks notebook source
# MAGIC %md
# MAGIC # MC-RNN Response Policy Network
# MAGIC
# MAGIC Upgrades the Q-table autonomous response learner (agent 47) with an
# MAGIC MC-RNN policy network. Instead of 625 discrete states, the model
# MAGIC processes the full incident trajectory and caches past decision outcomes.
# MAGIC
# MAGIC **Architecture:** MC-RNN encoder → Policy Head + Value Head (PPO)
# MAGIC **Safety:** High-avoidance constraint from Q-learning preserved

# COMMAND ----------

# MAGIC %pip install torch>=2.1.0 einops>=0.7.0

# COMMAND ----------

# MAGIC %run ./61_mc_rnn_architecture

# COMMAND ----------

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from pyspark.sql import SparkSession
import pyspark.sql.functions as SF
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import json

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Response Actions

# COMMAND ----------

@dataclass
class ResponseAction:
    """Available automated response actions."""
    action_id: int
    name: str
    severity: str
    reversible: bool
    requires_approval: bool
    description: str


RESPONSE_ACTIONS = [
    ResponseAction(0, "observe", "low", True, False, "Continue monitoring, no action"),
    ResponseAction(1, "enrich", "low", True, False, "Trigger enrichment pipeline for context"),
    ResponseAction(2, "isolate_session", "medium", True, False, "Kill suspicious session"),
    ResponseAction(3, "block_ip", "medium", True, False, "Block source IP at firewall"),
    ResponseAction(4, "disable_account", "high", False, True, "Disable user account"),
    ResponseAction(5, "quarantine_host", "high", False, True, "Network-isolate endpoint"),
    ResponseAction(6, "escalate_analyst", "medium", True, False, "Escalate to human analyst"),
    ResponseAction(7, "trigger_forensics", "medium", True, False, "Launch forensic collection"),
    ResponseAction(8, "contain_lateral", "high", False, True, "Block lateral movement paths"),
    ResponseAction(9, "full_incident", "critical", False, True, "Declare full incident response"),
]

NUM_ACTIONS = len(RESPONSE_ACTIONS)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Policy Network

# COMMAND ----------

class MCResponsePolicy(nn.Module):
    """
    MC-RNN based policy network for autonomous response.

    The model processes an incident's event trajectory using Memory Caching,
    then outputs:
        - Policy: probability distribution over response actions
        - Value: estimated outcome quality (for PPO training)

    Cache stores past incident responses and their outcomes,
    allowing the model to recall what worked in similar situations.
    """

    def __init__(self, config: MCConfig, num_actions: int = NUM_ACTIONS):
        super().__init__()
        self.config = config
        self.num_actions = num_actions

        self.mc_encoder = MemoryCachingRNN(config)

        self.policy_head = nn.Sequential(
            nn.Linear(config.hidden_dim, config.hidden_dim // 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(config.hidden_dim // 2, num_actions),
        )

        self.value_head = nn.Sequential(
            nn.Linear(config.hidden_dim, config.hidden_dim // 2),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(config.hidden_dim // 2, 1),
        )

        self.action_embedding = nn.Embedding(num_actions, config.input_dim)
        self.outcome_embedding = nn.Linear(3, config.input_dim)

        self.avoidance_mask = nn.Parameter(
            torch.zeros(num_actions), requires_grad=False
        )

    def forward(
        self,
        incident_events: torch.Tensor,
        past_decisions_cache: Optional[torch.Tensor] = None,
        cache_mask: Optional[torch.Tensor] = None,
        avoidance_entities: Optional[List[str]] = None,
    ) -> Dict[str, torch.Tensor]:
        """
        Args:
            incident_events: (batch, seq_len, input_dim) - incident event tokens
            past_decisions_cache: (batch, num_cached, hidden_dim) - past decision outcomes
            cache_mask: (batch, num_cached) - valid cache entries

        Returns:
            action_probs: (batch, num_actions) - policy distribution
            value: (batch, 1) - state value estimate
            action_logits: (batch, num_actions) - raw logits before masking
        """
        output = self.mc_encoder(
            incident_events,
            cache_states_per_layer=[past_decisions_cache] * self.config.num_layers if past_decisions_cache is not None else None,
            cache_masks=[cache_mask] * self.config.num_layers if cache_mask is not None else None,
        )

        state_repr = output["segment_checkpoint"]

        action_logits = self.policy_head(state_repr)

        masked_logits = action_logits - self.avoidance_mask * 1e6
        action_probs = F.softmax(masked_logits, dim=-1)

        value = self.value_head(state_repr)

        return {
            "action_probs": action_probs,
            "value": value,
            "action_logits": action_logits,
            "state_repr": state_repr,
            "cache_attention": output["cache_attention_weights"],
        }

    def select_action(self, output: Dict, temperature: float = 1.0, deterministic: bool = False) -> Dict:
        """Select response action from policy distribution."""
        probs = output["action_probs"]

        if deterministic:
            action_idx = probs.argmax(dim=-1)
        else:
            scaled_probs = F.softmax(output["action_logits"] / temperature, dim=-1)
            action_idx = torch.multinomial(scaled_probs, 1).squeeze(-1)

        action = RESPONSE_ACTIONS[action_idx.item()]

        return {
            "action_idx": action_idx,
            "action": action,
            "probability": probs[0, action_idx].item(),
            "value_estimate": output["value"].item(),
            "requires_approval": action.requires_approval,
        }

    def update_avoidance(self, action_idx: int, penalty: float = 10.0):
        """Mark an action as dangerous based on negative outcome."""
        self.avoidance_mask.data[action_idx] += penalty


# COMMAND ----------

# MAGIC %md
# MAGIC ## PPO Trainer

# COMMAND ----------

class PPOTrainer:
    """
    Proximal Policy Optimization trainer for MC-Response Policy.

    Trains against a simulated reward function (_simulate_reward), NOT real
    analyst feedback or observed incident outcomes. Wire a reward derived from
    logged analyst decisions and incident results before relying on it in
    production. Incorporates high-avoidance safety constraint.
    """

    def __init__(
        self,
        policy: MCResponsePolicy,
        lr: float = 3e-4,
        gamma: float = 0.99,
        clip_ratio: float = 0.2,
        value_coef: float = 0.5,
        entropy_coef: float = 0.01,
        max_grad_norm: float = 0.5,
    ):
        self.policy = policy
        self.optimizer = torch.optim.Adam(policy.parameters(), lr=lr)
        self.gamma = gamma
        self.clip_ratio = clip_ratio
        self.value_coef = value_coef
        self.entropy_coef = entropy_coef
        self.max_grad_norm = max_grad_norm

    def compute_returns(self, rewards: List[float], values: List[float]) -> torch.Tensor:
        """Compute GAE returns."""
        returns = []
        gae = 0
        for t in reversed(range(len(rewards))):
            next_value = values[t + 1] if t + 1 < len(values) else 0
            delta = rewards[t] + self.gamma * next_value - values[t]
            gae = delta + self.gamma * 0.95 * gae
            returns.insert(0, gae + values[t])
        return torch.tensor(returns, dtype=torch.float32)

    def update(self, batch: Dict) -> Dict[str, float]:
        """PPO update step from collected experience."""
        states = batch["states"]
        actions = batch["actions"]
        old_log_probs = batch["log_probs"]
        returns = batch["returns"]
        advantages = batch["advantages"]

        output = self.policy(states)
        new_probs = output["action_probs"]
        new_log_probs = torch.log(new_probs.gather(1, actions.unsqueeze(1)) + 1e-8)
        values = output["value"].squeeze(-1)

        ratio = torch.exp(new_log_probs.squeeze(-1) - old_log_probs)
        surr1 = ratio * advantages
        surr2 = torch.clamp(ratio, 1 - self.clip_ratio, 1 + self.clip_ratio) * advantages
        policy_loss = -torch.min(surr1, surr2).mean()

        value_loss = F.mse_loss(values, returns)

        entropy = -(new_probs * torch.log(new_probs + 1e-8)).sum(dim=-1).mean()

        loss = policy_loss + self.value_coef * value_loss - self.entropy_coef * entropy

        self.optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(self.policy.parameters(), self.max_grad_norm)
        self.optimizer.step()

        return {
            "policy_loss": policy_loss.item(),
            "value_loss": value_loss.item(),
            "entropy": entropy.item(),
            "total_loss": loss.item(),
        }


# COMMAND ----------

# MAGIC %md
# MAGIC ## Training against a Simulated Reward (NOT real historical feedback)

# COMMAND ----------

def train_response_policy(
    catalog: str = "security_catalog",
    preset: str = "medium",
    num_episodes: int = 500,
    episode_length: int = 20,
):
    """
    Train MC-Response policy against a simulated reward function. This does NOT
    learn from historical incident data or analyst feedback yet — _simulate_reward
    supplies the signal. Replace it with a reward computed from logged outcomes
    before production use.

    Three training phases:
        1. Exploration (episodes 1-100): high temperature, discover action space
        2. Epsilon-greedy (101-300): mix random and policy actions
        3. Exploitation (301+): deterministic policy with safety checks
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    config = MCConfig(input_dim=128, hidden_dim=256, num_layers=3,
                      segment_size=16, max_cache_size=16)
    policy = MCResponsePolicy(config).to(device)
    trainer = PPOTrainer(policy)

    print(f"MC-Response Policy Training:")
    print(f"  Episodes: {num_episodes}")
    print(f"  Actions: {NUM_ACTIONS}")
    print(f"  Parameters: {sum(p.numel() for p in policy.parameters()):,}")

    episode_rewards = []

    for episode in range(num_episodes):
        if episode < 100:
            temperature = 2.0
            phase = "exploration"
        elif episode < 300:
            temperature = max(0.5, 1.5 - episode / 300)
            phase = "epsilon_greedy"
        else:
            temperature = 0.3
            phase = "exploitation"

        states, actions, rewards, values, log_probs = [], [], [], [], []

        incident_events = torch.randn(1, config.segment_size, config.input_dim, device=device)
        decision_cache = torch.zeros(1, 0, config.hidden_dim, device=device)

        episode_reward = 0

        for step in range(episode_length):
            cache_mask = torch.ones(1, decision_cache.size(1), dtype=torch.bool, device=device) if decision_cache.size(1) > 0 else None

            output = policy(
                incident_events,
                past_decisions_cache=decision_cache if decision_cache.size(1) > 0 else None,
                cache_mask=cache_mask,
            )

            action_result = policy.select_action(output, temperature=temperature)
            action_idx = action_result["action_idx"]
            action = action_result["action"]

            reward = _simulate_reward(action, step, episode_length)

            states.append(incident_events.clone())
            actions.append(action_idx.item())
            rewards.append(reward)
            values.append(output["value"].item())
            log_probs.append(torch.log(output["action_probs"][0, action_idx] + 1e-8).item())

            if not action.reversible and reward < -0.5:
                policy.update_avoidance(action_idx.item(), penalty=2.0)

            new_cache = output["state_repr"].detach()
            decision_cache = torch.cat([decision_cache, new_cache.unsqueeze(1)], dim=1)
            if decision_cache.size(1) > config.max_cache_size:
                decision_cache = decision_cache[:, -config.max_cache_size:]

            episode_reward += reward

        returns = trainer.compute_returns(rewards, values)
        advantages = returns - torch.tensor(values)

        batch = {
            "states": torch.cat(states),
            "actions": torch.tensor(actions, device=device),
            "log_probs": torch.tensor(log_probs, device=device),
            "returns": returns.to(device),
            "advantages": advantages.to(device),
        }
        metrics = trainer.update(batch)

        episode_rewards.append(episode_reward)

        if (episode + 1) % 50 == 0:
            avg_reward = np.mean(episode_rewards[-50:])
            print(
                f"Episode {episode+1}/{num_episodes} [{phase}] | "
                f"Avg reward: {avg_reward:.3f} | "
                f"Policy loss: {metrics['policy_loss']:.4f} | "
                f"Entropy: {metrics['entropy']:.3f}"
            )

    print(f"\nTraining complete. Final avg reward: {np.mean(episode_rewards[-50:]):.3f}")
    print(f"Avoidance mask: {policy.avoidance_mask.data.nonzero().squeeze().tolist()}")

    return policy


def _simulate_reward(action: ResponseAction, step: int, max_steps: int) -> float:
    """Simulate reward signal for training (replaced by real feedback in production)."""
    progress = step / max_steps

    if action.name == "observe" and progress > 0.5:
        return -0.3
    elif action.name == "full_incident" and progress < 0.3:
        return -1.0
    elif action.name == "escalate_analyst":
        return 0.1
    elif action.severity == "high" and progress < 0.4:
        return -0.5
    elif action.severity == "high" and progress > 0.7:
        return 0.8
    elif action.severity == "medium":
        return 0.3 + progress * 0.3
    else:
        return 0.1


# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

if "dbutils" in dir():
    policy = train_response_policy(
        catalog="security_catalog",
        preset="medium",
        num_episodes=500,
    )
