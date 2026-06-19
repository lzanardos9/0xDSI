# Databricks notebook source
# MAGIC %md
# MAGIC # Memory Caching RNN Architecture
# MAGIC **Paper:** "Memory Caching: RNNs with Growing Memory" (arXiv 2602.24281)
# MAGIC
# MAGIC Core model definition for the MC-RNN security detection system.
# MAGIC Implements Linear Attention RNN + Memory Cache layer for long-range
# MAGIC threat detection on Databricks GPU clusters.
# MAGIC
# MAGIC **Key Innovation:** Caches hidden state checkpoints at segment boundaries,
# MAGIC allowing O(L) base cost with selective O(segments) recall for past events.

# COMMAND ----------

# MAGIC %pip install torch>=2.1.0 einops>=0.7.0

# COMMAND ----------

import torch
import torch.nn as nn
import torch.nn.functional as F
from einops import rearrange, repeat
import math
from typing import Optional, Tuple, List
from dataclasses import dataclass

# COMMAND ----------

@dataclass
class MCConfig:
    """Configuration for Memory Caching RNN."""
    input_dim: int = 128
    hidden_dim: int = 256
    num_heads: int = 4
    segment_size: int = 64
    max_cache_size: int = 32
    num_layers: int = 4
    dropout: float = 0.1
    cache_query_heads: int = 4
    gate_type: str = "learned"  # "learned" or "sigmoid"
    use_landmark_cache: bool = True
    landmark_slots: int = 8
    output_dim: int = 128  # anomaly scoring dimension


# COMMAND ----------

class LinearAttentionCore(nn.Module):
    """
    Linear Attention recurrent layer (Katharopoulos et al., 2020).
    Processes a segment of events with O(L) complexity using kernel trick.
    The recurrent state S accumulates key-value outer products.
    """

    def __init__(self, hidden_dim: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.num_heads = num_heads
        self.head_dim = hidden_dim // num_heads

        self.q_proj = nn.Linear(hidden_dim, hidden_dim)
        self.k_proj = nn.Linear(hidden_dim, hidden_dim)
        self.v_proj = nn.Linear(hidden_dim, hidden_dim)
        self.out_proj = nn.Linear(hidden_dim, hidden_dim)

        self.feature_map = nn.ELU()
        self.dropout = nn.Dropout(dropout)
        self.layer_norm = nn.LayerNorm(hidden_dim)

    def _phi(self, x: torch.Tensor) -> torch.Tensor:
        """Feature map for linear attention: elu(x) + 1."""
        return self.feature_map(x) + 1.0

    def forward(
        self,
        x: torch.Tensor,
        recurrent_state: Optional[Tuple[torch.Tensor, torch.Tensor]] = None,
    ) -> Tuple[torch.Tensor, Tuple[torch.Tensor, torch.Tensor]]:
        """
        Args:
            x: (batch, seq_len, hidden_dim) - segment of events
            recurrent_state: (S, z) where S is (batch, heads, head_dim, head_dim)
                            and z is (batch, heads, head_dim)
        Returns:
            output: (batch, seq_len, hidden_dim)
            new_state: (S, z) updated recurrent state
        """
        B, L, D = x.shape
        residual = x
        x = self.layer_norm(x)

        Q = self._phi(self.q_proj(x))
        K = self._phi(self.k_proj(x))
        V = self.v_proj(x)

        Q = rearrange(Q, "b l (h d) -> b h l d", h=self.num_heads)
        K = rearrange(K, "b l (h d) -> b h l d", h=self.num_heads)
        V = rearrange(V, "b l (h d) -> b h l d", h=self.num_heads)

        if recurrent_state is None:
            S = torch.zeros(B, self.num_heads, self.head_dim, self.head_dim, device=x.device)
            z = torch.zeros(B, self.num_heads, self.head_dim, device=x.device)
        else:
            S, z = recurrent_state

        outputs = []
        for t in range(L):
            k_t = K[:, :, t]  # (B, H, d)
            v_t = V[:, :, t]  # (B, H, d)
            q_t = Q[:, :, t]  # (B, H, d)

            S = S + torch.einsum("bhd,bhe->bhde", k_t, v_t)
            z = z + k_t

            num = torch.einsum("bhd,bhde->bhe", q_t, S)
            den = torch.einsum("bhd,bhd->bh", q_t, z).unsqueeze(-1).clamp(min=1e-6)
            o_t = num / den
            outputs.append(o_t)

        output = torch.stack(outputs, dim=2)  # (B, H, L, d)
        output = rearrange(output, "b h l d -> b l (h d)")
        output = self.out_proj(self.dropout(output))

        return output + residual, (S, z)


# COMMAND ----------

class MemoryCache(nn.Module):
    """
    Memory Cache module: stores and retrieves hidden state checkpoints.
    Implements the core MC mechanism from the paper.

    At segment boundaries, the RNN's hidden state is cached.
    Future tokens can query these cached states via multi-head attention,
    effectively giving the RNN growing memory capacity.
    """

    def __init__(self, hidden_dim: int, max_cache_size: int, num_heads: int = 4, landmark_slots: int = 8):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.max_cache_size = max_cache_size
        self.num_heads = num_heads
        self.landmark_slots = landmark_slots

        self.cache_query = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=num_heads,
            dropout=0.1,
            batch_first=True,
        )

        self.gate_proj = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.Sigmoid(),
        )

        self.cache_key_proj = nn.Linear(hidden_dim, hidden_dim)
        self.cache_value_proj = nn.Linear(hidden_dim, hidden_dim)
        self.importance_scorer = nn.Linear(hidden_dim, 1)

    def query_cache(
        self,
        current_state: torch.Tensor,
        cache_states: torch.Tensor,
        cache_mask: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Query cached memory states with current hidden state.

        Args:
            current_state: (batch, hidden_dim) - current RNN hidden state
            cache_states: (batch, num_cached, hidden_dim) - cached checkpoints
            cache_mask: (batch, num_cached) - True for valid cache entries

        Returns:
            fused_state: (batch, hidden_dim) - current state enhanced with cache context
            attention_weights: (batch, num_cached) - which caches were queried
        """
        if cache_states.size(1) == 0:
            return current_state, torch.empty(current_state.size(0), 0, device=current_state.device)

        query = current_state.unsqueeze(1)  # (B, 1, D)

        keys = self.cache_key_proj(cache_states)
        values = self.cache_value_proj(cache_states)

        key_padding_mask = ~cache_mask if cache_mask is not None else None

        context, attn_weights = self.cache_query(
            query, keys, values,
            key_padding_mask=key_padding_mask,
        )
        context = context.squeeze(1)  # (B, D)
        attn_weights = attn_weights.squeeze(1)  # (B, num_cached)

        gate = self.gate_proj(torch.cat([current_state, context], dim=-1))
        fused = gate * current_state + (1 - gate) * context

        return fused, attn_weights

    def compute_importance(self, hidden_state: torch.Tensor) -> torch.Tensor:
        """Score a hidden state for cache retention priority."""
        return self.importance_scorer(hidden_state).squeeze(-1)

    def evict(
        self,
        cache_states: torch.Tensor,
        cache_metadata: dict,
        new_state: torch.Tensor,
    ) -> Tuple[torch.Tensor, dict]:
        """
        Evict least important cache entry to make room for new checkpoint.
        Landmark caches are protected from eviction.

        Args:
            cache_states: (batch, max_cache, hidden_dim)
            cache_metadata: dict with 'importance', 'is_landmark', 'timestamps'
            new_state: (batch, hidden_dim) - new state to cache

        Returns:
            updated_cache: (batch, max_cache, hidden_dim)
            updated_metadata: dict
        """
        B = cache_states.size(0)
        importance = cache_metadata["importance"]  # (B, max_cache)
        is_landmark = cache_metadata["is_landmark"]  # (B, max_cache)

        eviction_score = importance.clone()
        eviction_score[is_landmark] = float("inf")

        evict_idx = eviction_score.argmin(dim=-1)  # (B,)

        batch_idx = torch.arange(B, device=cache_states.device)
        cache_states[batch_idx, evict_idx] = new_state

        new_importance = self.compute_importance(new_state)
        importance[batch_idx, evict_idx] = new_importance

        cache_metadata["importance"] = importance
        return cache_states, cache_metadata


# COMMAND ----------

class MCRNNLayer(nn.Module):
    """Single MC-RNN layer: Linear Attention + Memory Cache fusion."""

    def __init__(self, config: MCConfig):
        super().__init__()
        self.config = config
        self.linear_attention = LinearAttentionCore(
            config.hidden_dim, config.num_heads, config.dropout
        )
        self.memory_cache = MemoryCache(
            config.hidden_dim, config.max_cache_size,
            config.cache_query_heads, config.landmark_slots,
        )
        self.ffn = nn.Sequential(
            nn.Linear(config.hidden_dim, config.hidden_dim * 4),
            nn.GELU(),
            nn.Dropout(config.dropout),
            nn.Linear(config.hidden_dim * 4, config.hidden_dim),
            nn.Dropout(config.dropout),
        )
        self.norm1 = nn.LayerNorm(config.hidden_dim)
        self.norm2 = nn.LayerNorm(config.hidden_dim)

    def forward(
        self,
        x: torch.Tensor,
        recurrent_state: Optional[Tuple] = None,
        cache_states: Optional[torch.Tensor] = None,
        cache_mask: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, Tuple, torch.Tensor]:
        """
        Process one segment through the MC-RNN layer.

        Args:
            x: (batch, segment_len, hidden_dim)
            recurrent_state: linear attention recurrent state
            cache_states: (batch, num_cached, hidden_dim)
            cache_mask: (batch, num_cached)

        Returns:
            output: (batch, segment_len, hidden_dim)
            new_recurrent_state: updated linear attention state
            cache_attention_weights: (batch, num_cached) for explainability
        """
        attn_out, new_state = self.linear_attention(x, recurrent_state)

        segment_summary = attn_out[:, -1, :]  # last token as segment representation

        cache_attn_weights = None
        if cache_states is not None and cache_states.size(1) > 0:
            fused_summary, cache_attn_weights = self.memory_cache.query_cache(
                segment_summary, cache_states, cache_mask
            )
            attn_out[:, -1, :] = fused_summary

        normed = self.norm1(attn_out)
        ffn_out = self.ffn(normed)
        output = self.norm2(ffn_out + normed)

        return output, new_state, cache_attn_weights


# COMMAND ----------

class MemoryCachingRNN(nn.Module):
    """
    Full Memory Caching RNN for security event sequence modeling.

    Architecture:
        Input Projection → [MCRNNLayer x num_layers] → Output Head

    The model processes event sequences in segments. At each segment boundary,
    the hidden state is checkpointed into the memory cache. Future segments
    can attend to these cached states, giving the model growing memory
    that scales with sequence length.

    For security detection:
        - Input: tokenized security events (128-dim per event)
        - Output: anomaly scores + next-event prediction logits
        - Cache: stores per-entity behavioral checkpoints
    """

    def __init__(self, config: MCConfig):
        super().__init__()
        self.config = config

        self.input_proj = nn.Sequential(
            nn.Linear(config.input_dim, config.hidden_dim),
            nn.LayerNorm(config.hidden_dim),
            nn.GELU(),
            nn.Dropout(config.dropout),
        )

        self.layers = nn.ModuleList([
            MCRNNLayer(config) for _ in range(config.num_layers)
        ])

        self.anomaly_head = nn.Sequential(
            nn.Linear(config.hidden_dim, config.hidden_dim // 2),
            nn.GELU(),
            nn.Linear(config.hidden_dim // 2, 1),
        )

        self.reconstruction_head = nn.Sequential(
            nn.Linear(config.hidden_dim, config.hidden_dim),
            nn.GELU(),
            nn.Linear(config.hidden_dim, config.output_dim),
        )

        self.next_event_head = nn.Linear(config.hidden_dim, config.input_dim)

        self.segment_position_enc = nn.Embedding(config.max_cache_size + 1, config.hidden_dim)

    def forward(
        self,
        x: torch.Tensor,
        recurrent_states: Optional[List[Tuple]] = None,
        cache_states_per_layer: Optional[List[torch.Tensor]] = None,
        cache_masks: Optional[List[torch.Tensor]] = None,
        segment_index: int = 0,
    ) -> dict:
        """
        Forward pass for one segment.

        Args:
            x: (batch, segment_len, input_dim) - tokenized events
            recurrent_states: per-layer recurrent states from previous segment
            cache_states_per_layer: per-layer cache tensors
            cache_masks: per-layer cache validity masks
            segment_index: current segment position (for positional encoding)

        Returns:
            dict with:
                - anomaly_scores: (batch, segment_len) per-event anomaly score
                - next_event_pred: (batch, segment_len, input_dim)
                - hidden_states: (batch, segment_len, hidden_dim)
                - new_recurrent_states: list of updated states per layer
                - segment_checkpoint: (batch, hidden_dim) for caching
                - cache_attention_weights: list of attention maps per layer
        """
        B, L, _ = x.shape

        h = self.input_proj(x)

        seg_pos = self.segment_position_enc(
            torch.tensor([segment_index], device=x.device)
        ).unsqueeze(1)
        h = h + seg_pos

        if recurrent_states is None:
            recurrent_states = [None] * self.config.num_layers

        new_recurrent_states = []
        all_cache_attn = []

        for i, layer in enumerate(self.layers):
            cache_s = cache_states_per_layer[i] if cache_states_per_layer else None
            cache_m = cache_masks[i] if cache_masks else None

            h, new_state, cache_attn = layer(h, recurrent_states[i], cache_s, cache_m)
            new_recurrent_states.append(new_state)
            all_cache_attn.append(cache_attn)

        anomaly_scores = self.anomaly_head(h).squeeze(-1)
        next_event_pred = self.next_event_head(h)
        reconstruction = self.reconstruction_head(h)

        segment_checkpoint = h[:, -1, :]

        return {
            "anomaly_scores": anomaly_scores,
            "next_event_pred": next_event_pred,
            "reconstruction": reconstruction,
            "hidden_states": h,
            "new_recurrent_states": new_recurrent_states,
            "segment_checkpoint": segment_checkpoint,
            "cache_attention_weights": all_cache_attn,
        }

    def get_checkpoint_for_cache(self, output: dict) -> torch.Tensor:
        """Extract the hidden state checkpoint to store in memory cache."""
        return output["segment_checkpoint"].detach()


# COMMAND ----------

class MCLoss(nn.Module):
    """
    Multi-objective loss for MC-RNN training.

    Components:
        1. Next-event prediction (autoregressive)
        2. Reconstruction loss (denoising)
        3. Contrastive anomaly loss (normal vs. attack)
        4. Cache utilization regularization
    """

    def __init__(self, alpha_next: float = 0.4, alpha_recon: float = 0.3,
                 alpha_contrastive: float = 0.2, alpha_cache_reg: float = 0.1):
        super().__init__()
        self.alpha_next = alpha_next
        self.alpha_recon = alpha_recon
        self.alpha_contrastive = alpha_contrastive
        self.alpha_cache_reg = alpha_cache_reg
        self.cosine_sim = nn.CosineSimilarity(dim=-1)

    def forward(
        self,
        output: dict,
        targets: torch.Tensor,
        labels: Optional[torch.Tensor] = None,
    ) -> dict:
        """
        Args:
            output: dict from MemoryCachingRNN.forward()
            targets: (batch, segment_len, input_dim) - shifted input for next-event
            labels: (batch, segment_len) - 1 for anomaly, 0 for normal (optional)
        """
        next_loss = F.mse_loss(output["next_event_pred"][:, :-1], targets[:, 1:])

        recon_loss = F.mse_loss(output["reconstruction"], targets)

        contrastive_loss = torch.tensor(0.0, device=targets.device)
        if labels is not None:
            scores = output["anomaly_scores"]
            pos_mask = labels == 1
            neg_mask = labels == 0
            if pos_mask.any() and neg_mask.any():
                pos_scores = scores[pos_mask].mean()
                neg_scores = scores[neg_mask].mean()
                contrastive_loss = F.relu(1.0 - pos_scores + neg_scores)

        cache_reg = torch.tensor(0.0, device=targets.device)
        for attn in output["cache_attention_weights"]:
            if attn is not None:
                entropy = -(attn * (attn + 1e-8).log()).sum(-1).mean()
                cache_reg += entropy

        total = (
            self.alpha_next * next_loss
            + self.alpha_recon * recon_loss
            + self.alpha_contrastive * contrastive_loss
            - self.alpha_cache_reg * cache_reg
        )

        return {
            "total_loss": total,
            "next_event_loss": next_loss,
            "reconstruction_loss": recon_loss,
            "contrastive_loss": contrastive_loss,
            "cache_entropy": cache_reg,
        }


# COMMAND ----------

# MAGIC %md
# MAGIC ## Model Factory

# COMMAND ----------

def create_mc_rnn(
    input_dim: int = 128,
    preset: str = "production",
) -> MemoryCachingRNN:
    """
    Create MC-RNN model with preset configurations.

    Presets:
        - "small": 2 layers, 128 hidden (dev/testing)
        - "medium": 4 layers, 256 hidden (standard deployment)
        - "production": 6 layers, 512 hidden (enterprise ABI-scale)
        - "lite": 2 layers, 128 hidden, 16 cache (edge/OT devices)
    """
    presets = {
        "small": MCConfig(input_dim=input_dim, hidden_dim=128, num_layers=2,
                         segment_size=32, max_cache_size=16, num_heads=4),
        "medium": MCConfig(input_dim=input_dim, hidden_dim=256, num_layers=4,
                          segment_size=64, max_cache_size=32, num_heads=4),
        "production": MCConfig(input_dim=input_dim, hidden_dim=512, num_layers=6,
                              segment_size=64, max_cache_size=64, num_heads=8,
                              cache_query_heads=8),
        "lite": MCConfig(input_dim=input_dim, hidden_dim=128, num_layers=2,
                        segment_size=16, max_cache_size=16, num_heads=2,
                        cache_query_heads=2),
    }

    config = presets.get(preset, presets["medium"])
    model = MemoryCachingRNN(config)

    param_count = sum(p.numel() for p in model.parameters())
    print(f"MC-RNN [{preset}]: {param_count / 1e6:.1f}M parameters")
    print(f"  Hidden: {config.hidden_dim}, Layers: {config.num_layers}")
    print(f"  Segment: {config.segment_size}, Cache: {config.max_cache_size}")

    return model


# COMMAND ----------

# MAGIC %md
# MAGIC ## Validation

# COMMAND ----------

if __name__ == "__main__" or "dbutils" not in dir():
    config = MCConfig(input_dim=128, hidden_dim=256, num_layers=4,
                      segment_size=64, max_cache_size=32)
    model = MemoryCachingRNN(config)

    B, SEG_LEN = 4, 64
    x = torch.randn(B, SEG_LEN, 128)

    cache = torch.randn(B, 10, 256)
    cache_mask = torch.ones(B, 10, dtype=torch.bool)

    output = model(
        x,
        cache_states_per_layer=[cache] * 4,
        cache_masks=[cache_mask] * 4,
        segment_index=3,
    )

    print(f"Anomaly scores: {output['anomaly_scores'].shape}")
    print(f"Next event pred: {output['next_event_pred'].shape}")
    print(f"Segment checkpoint: {output['segment_checkpoint'].shape}")
    print(f"Cache attention (layer 0): {output['cache_attention_weights'][0].shape}")

    loss_fn = MCLoss()
    labels = torch.randint(0, 2, (B, SEG_LEN)).float()
    losses = loss_fn(output, x, labels)
    print(f"Total loss: {losses['total_loss']:.4f}")
    print("Architecture validation PASSED")
