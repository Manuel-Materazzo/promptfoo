#!/bin/sh
set -e

# Automatically install Python dependencies for custom assertions/prompts/providers
REQUIREMENTS_FILE="${PROMPTFOO_PYTHON_REQUIREMENTS:-/app/custom/requirements.txt}"

if [ -f "$REQUIREMENTS_FILE" ]; then
  echo "Found custom requirements file at $REQUIREMENTS_FILE. Installing Python dependencies..."
  pip install -r "$REQUIREMENTS_FILE" --break-system-packages
fi

# If no arguments provided, default to starting the Promptfoo server
if [ $# -eq 0 ]; then
  exec node dist/src/server/index.js
fi

# If first argument is an option flag (e.g. -c, --help), run promptfoo CLI
if [ "${1#-}" != "$1" ]; then
  exec promptfoo "$@"
fi

# If first argument is a known promptfoo subcommand, run promptfoo CLI
case "$1" in
  eval|view|init|share|redteam|feedback|export|generate|list|show|version)
    exec promptfoo "$@"
    ;;
esac

exec "$@"
