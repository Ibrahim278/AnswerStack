"""Qwen3-Reranker adapter with FlashRank-compatible interface.

Drop-in replacement for FlashRank Ranker. Exposes the same
.rerank(RerankRequest(...)) interface so retrieval.py needs no changes.
"""

from __future__ import annotations

from typing import Any

import structlog
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

logger = structlog.get_logger()


class QwenRerankerAdapter:
    """Local Qwen3-Reranker with FlashRank-compatible .rerank() method."""

    def __init__(
        self,
        model_name: str = "Qwen/Qwen3-Reranker-0.6B",
        max_length: int = 8192,
        instruction: str | None = None,
    ) -> None:
        self._instruction = (
            instruction
            or "Given a query and a document, judge whether the document is relevant to the query."
        )
        self._max_length = max_length

        logger.info("Loading Qwen reranker model", model=model_name)
        self._tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            padding_side="left",
        )
        if self._tokenizer.pad_token is None:
            self._tokenizer.pad_token = self._tokenizer.eos_token

        self._model = AutoModelForCausalLM.from_pretrained(model_name)
        self._model.eval()

        self._true_token_id = self._tokenizer.convert_tokens_to_ids("yes")
        self._false_token_id = self._tokenizer.convert_tokens_to_ids("no")

        self._prefix = (
            "<|im_start|>system\n"
            "Judge whether the Document meets the requirements based on the Query and the Instruct provided. "
            'Note that the answer can only be "yes" or "no".'
            "<|im_end|>\n"
            "<|im_start|>user\n"
        )
        self._suffix = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"

        self._prefix_tokens = self._tokenizer.encode(self._prefix, add_special_tokens=False)
        self._suffix_tokens = self._tokenizer.encode(self._suffix, add_special_tokens=False)

        logger.info("Qwen reranker ready", model=model_name)

    def _format_pair(self, query: str, doc: str) -> str:
        return (
            f"<Instruct>: {self._instruction}\n"
            f"<Query>: {query}\n"
            f"<Document>: {doc}"
        )

    def _build_inputs(self, query: str, passages: list[dict[str, Any]]) -> dict[str, torch.Tensor]:
        texts = [self._format_pair(query, p["text"]) for p in passages]

        max_content_length = self._max_length - len(self._prefix_tokens) - len(self._suffix_tokens)
        inputs = self._tokenizer(
            texts,
            padding=False,
            truncation=True,
            return_attention_mask=False,
            max_length=max_content_length,
        )

        for i, ids in enumerate(inputs["input_ids"]):
            inputs["input_ids"][i] = self._prefix_tokens + ids + self._suffix_tokens

        padded = self._tokenizer.pad(
            inputs,
            padding=True,
            return_tensors="pt",
            max_length=self._max_length,
        )
        return padded

    @torch.no_grad()
    def rerank(self, request: Any) -> list[dict[str, Any]]:
        """Rerank passages. Returns list of dicts matching FlashRank output shape."""
        query = request.query
        passages = request.passages

        if not passages:
            return []

        inputs = self._build_inputs(query, passages)
        outputs = self._model(**inputs)
        final_logits = outputs.logits[:, -1, :]

        yes_logits = final_logits[:, self._true_token_id]
        no_logits = final_logits[:, self._false_token_id]

        pair_logits = torch.stack([no_logits, yes_logits], dim=1)
        pair_probs = torch.softmax(pair_logits, dim=1)
        yes_scores = pair_probs[:, 1].tolist()

        reranked = []
        for passage, score in zip(passages, yes_scores):
            reranked.append(
                {
                    "id": passage["id"],
                    "text": passage["text"],
                    "meta": passage.get("meta", {}),
                    "score": float(score),
                }
            )

        reranked.sort(key=lambda x: x["score"], reverse=True)
        return reranked
