"""Logging configuration: file + stderr."""
from __future__ import annotations

import logging
import os
import sys

LOG_DIR = os.environ.get("ACE_LOG_DIR", "/var/log/ace-collector")
LOG_FILE = os.path.join(LOG_DIR, "collector.log")


def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    logger = logging.getLogger("ace-collector")
    logger.setLevel(level)
    logger.handlers.clear()

    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S")

    stream = logging.StreamHandler(sys.stderr)
    stream.setFormatter(fmt)
    logger.addHandler(stream)

    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        fileh = logging.FileHandler(LOG_FILE)
        fileh.setFormatter(fmt)
        logger.addHandler(fileh)
    except OSError as exc:  # pragma: no cover - depends on host permissions
        logger.warning("File logging disabled (%s)", exc)

    return logger
