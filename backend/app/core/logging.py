import logging

import structlog


def configure_logging(json_output: bool = True) -> None:
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]

    if json_output:
        shared_processors.append(structlog.processors.JSONRenderer())
    else:
        shared_processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=shared_processors,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Suppress noisy uvicorn access logs (we log requests ourselves)
    logging.getLogger("uvicorn.access").disabled = True
