"""Stream raw PCM audio through ffmpeg, yielding MP3 chunks incrementally.

Shared by Kokoro and Piper streaming modes. Runs the PCM-generation
callable in a thread so it can block on CPU-bound synthesis while the
async generator yields MP3 output to the HTTP response as fast as
ffmpeg produces it.
"""

import asyncio
import subprocess
from collections.abc import AsyncIterator, Callable
from typing import BinaryIO


async def pcm_to_mp3_stream(
    feed_pcm: Callable[[BinaryIO], None],
    sample_rate: int,
    channels: int = 1,
    chunk_size: int = 4096,
) -> AsyncIterator[bytes]:
    """Convert a synchronous PCM producer into a streaming async MP3 generator.

    Args:
        feed_pcm: Callable that receives ffmpeg's stdin (a writable binary
            stream) and writes raw signed-16-bit-LE PCM samples to it.
            Must NOT close stdin — the wrapper handles that.
        sample_rate: PCM sample rate in Hz.
        channels: Number of audio channels (default mono).
        chunk_size: Bytes to read from ffmpeg stdout per iteration.

    Yields:
        MP3 audio chunks as they become available.
    """
    proc = subprocess.Popen(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "s16le",
            "-ar",
            str(sample_rate),
            "-ac",
            str(channels),
            "-i",
            "pipe:0",
            "-f",
            "mp3",
            "-flush_packets",
            "1",
            "pipe:1",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    feed_error: BaseException | None = None

    def _feed_and_close() -> None:
        nonlocal feed_error
        try:
            feed_pcm(proc.stdin)
        except Exception as exc:
            feed_error = exc
        finally:
            try:
                proc.stdin.close()
            except OSError:
                pass

    loop = asyncio.get_running_loop()
    feed_future = loop.run_in_executor(None, _feed_and_close)

    try:
        while True:
            chunk = await loop.run_in_executor(None, proc.stdout.read, chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait()

    # Normal completion — wait for feed thread and propagate errors
    await feed_future
    if feed_error is not None:
        raise feed_error
