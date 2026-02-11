"""
SHH Reader - Main Entry Point

Usage:
    python -m shh_reader [--host HOST] [--port PORT]
"""

import argparse
import asyncio
import logging
import signal
import sys
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('shh_reader')


def main():
    parser = argparse.ArgumentParser(description='SHH Reader - Sensor Gateway')
    parser.add_argument('--host', default='0.0.0.0', help='Web UI host (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=8080, help='Web UI port (default: 8080)')
    parser.add_argument('--data-dir', default=None, help='Data directory for SQLite DB')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Set data directory
    import os
    data_dir = args.data_dir or os.environ.get('SHH_READER_DATA_DIR', './data')
    os.environ['SHH_READER_DATA_DIR'] = data_dir
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    
    logger.info(f"SHH Reader starting on {args.host}:{args.port}")
    logger.info(f"Data directory: {data_dir}")
    
    # Import and run the UI app (which starts everything)
    from shh_reader.ui.app import run_app
    run_app(host=args.host, port=args.port)


if __name__ == '__main__':
    main()
