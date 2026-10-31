#!/usr/bin/env python3
"""ROS 2 node that uses AnswerStack RAG pipeline to answer questions.

Subscribes to the `words` topic (Whisper STT output), retrieves relevant
chunks from a ChromaDB knowledge base, generates an answer via the
configured LLM provider, and publishes the reply on `rag_reply`.

On first launch, if the ChromaDB collection is empty, the node auto-ingests
all supported documents (.txt, .md, .pdf) found in the knowledge directory.
"""

from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

import rclpy
from rclpy.node import Node
from std_msgs.msg import String

from answerstack import (
    CompleteEvent,
    ErrorEvent,
    KnowledgeBase,
    RAGConfig,
    RAGPipeline,
    SourcesEvent,
    TokenEvent,
)

SUPPORTED_EXTENSIONS = {".txt", ".md", ".pdf"}
COLLECTION_NAME = "knowledge"

TTS_SYSTEM_PROMPT = (
    "You are a helpful voice assistant named AnswerStack, running on a robot "
    "built by students at Algonquin College for the CST8507 Natural Language "
    "Processing course. You use Retrieval-Augmented Generation to answer "
    "questions from a knowledge base.\n\n"
    "Your answers will be read aloud by a text-to-speech engine, so you MUST "
    "follow these rules:\n"
    "- Respond in plain spoken English only. No markdown, no bullet points, "
    "no numbered lists, no special characters.\n"
    "- When you encounter mathematical notation or formulas, read them out in "
    "natural spoken form. For example: f(x) becomes 'f of x', x^2 becomes "
    "'x squared', sqrt(n) becomes 'the square root of n', a/b becomes "
    "'a divided by b', sum from i=1 to n becomes 'the sum from i equals 1 to n'.\n"
    "- Keep answers very short — one or two sentences maximum, under 30 words.\n"
    "- For questions about yourself (like 'who are you' or 'what are you'), "
    "introduce yourself based on the description above.\n"
    "- For all other questions, only answer using information from the provided "
    "source documents. If the sources do not contain the answer, say 'I don't "
    "have enough information to answer that.'"
)


class RAGPublisher(Node):
    def __init__(self):
        super().__init__("rag_publisher")

        # ROS 2 parameters
        self.declare_parameter("dotenv_path", "")
        self.declare_parameter("knowledge_dir", "")

        dotenv_path = (
            self.get_parameter("dotenv_path")
            .get_parameter_value()
            .string_value
        )
        self.knowledge_dir = (
            self.get_parameter("knowledge_dir")
            .get_parameter_value()
            .string_value
        )

        # Load config from .env / environment variables
        env_file = dotenv_path or None
        if env_file and not os.path.isfile(env_file):
            env_file = None
        self._config = RAGConfig.from_env(dotenv_path=env_file)

        # Resolve data_dir to absolute (relative paths break depending on cwd)
        if not os.path.isabs(self._config.data_dir):
            if env_file:
                base = os.path.dirname(os.path.abspath(env_file))
            else:
                base = os.getcwd()
            self._config.data_dir = os.path.join(base, self._config.data_dir)

        # Override system prompt for TTS-friendly output
        self._config.system_prompt = TTS_SYSTEM_PROMPT

        # Default knowledge_dir to <same parent as .env>/knowledge
        if not self.knowledge_dir:
            if env_file:
                self.knowledge_dir = os.path.join(
                    os.path.dirname(os.path.abspath(env_file)),
                    "..", "knowledge",
                )
            else:
                self.get_logger().error(
                    "No knowledge_dir parameter and no dotenv_path to derive it from"
                )

        self.get_logger().info(f"Provider URL: {self._config.provider_url}")
        self.get_logger().info(f"Chat model: {self._config.provider_model}")
        self.get_logger().info(f"Embedding model: {self._config.embedding_model}")
        self.get_logger().info(f"Data dir: {self._config.data_dir}")
        self.get_logger().info(f"Knowledge dir: {self.knowledge_dir}")

        # Build pipeline
        self._pipeline = RAGPipeline(self._config)
        self._kb = KnowledgeBase(self._config)

        # Auto-ingest if collection is empty
        self._ensure_knowledge_ingested()

        # Publisher and subscriber
        self.pub = self.create_publisher(String, "rag_reply", 10)
        self.sub = self.create_subscription(String, "words", self.on_words, 10)
        self.busy = False

        self.get_logger().info("RAG publisher ready")

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------

    def _ensure_knowledge_ingested(self):
        """Check if collection has data; if not, ingest from knowledge_dir."""
        self._kb.create_collection(COLLECTION_NAME)

        from answerstack.vector import ChromaDBVectorRepository

        repo = ChromaDBVectorRepository(path=self._config.data_dir)
        count = repo.collection_count(COLLECTION_NAME)

        if count > 0:
            self.get_logger().info(
                f"Collection '{COLLECTION_NAME}' already has {count} chunks, skipping ingestion"
            )
            return

        knowledge_path = Path(self.knowledge_dir).resolve()
        if not knowledge_path.is_dir():
            self.get_logger().warn(
                f"Knowledge directory not found: {knowledge_path}"
            )
            return

        files = [
            f
            for f in knowledge_path.iterdir()
            if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS
        ]

        if not files:
            self.get_logger().warn(
                f"No supported documents in {knowledge_path}"
            )
            return

        self.get_logger().info(
            f"Ingesting {len(files)} document(s) from {knowledge_path}"
        )

        for filepath in files:
            try:
                content = filepath.read_bytes()
                chunks = self._kb.add_document_sync(
                    content=content,
                    filename=filepath.name,
                    collection_name=COLLECTION_NAME,
                )
                self.get_logger().info(
                    f"Ingested {filepath.name}: {chunks} chunks"
                )
            except Exception as e:
                self.get_logger().error(
                    f"Failed to ingest {filepath.name}: {e}"
                )

    # ------------------------------------------------------------------
    # Callback
    # ------------------------------------------------------------------

    def on_words(self, msg: String):
        text = msg.data.strip()
        if not text or self.busy:
            return

        self.busy = True
        self.get_logger().info(f'WORDS: "{text}"')

        try:
            reply = self._generate_answer(text)
        except Exception as e:
            self.get_logger().error(f"RAG error: {e}")
            self.busy = False
            return

        reply = (reply or "").strip()
        reply = re.sub(r"\[Source\s*\d+\]", "", reply).strip()
        if reply:
            out = String()
            out.data = reply
            self.pub.publish(out)
            self.get_logger().info(f'RAG_REPLY: "{out.data}"')

        self.busy = False

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    def _generate_answer(self, question: str) -> str:
        """Run the full RAG pipeline and collect the complete response."""

        async def _query():
            full_text = ""
            async for event in self._pipeline.query(
                query=question,
                collection_name=COLLECTION_NAME,
            ):
                if isinstance(event, TokenEvent):
                    full_text += event.text
                elif isinstance(event, CompleteEvent):
                    return event.full_text
                elif isinstance(event, ErrorEvent):
                    raise RuntimeError(event.message)
                elif isinstance(event, SourcesEvent):
                    sources = [s["document_name"] for s in event.sources]
                    if sources:
                        self.get_logger().info(f"Sources: {sources}")
            return full_text

        return asyncio.run(_query())


def main(args=None):
    rclpy.init(args=args)
    node = RAGPublisher()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == "__main__":
    main()
