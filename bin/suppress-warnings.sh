#!/bin/bash
# This script can be used to run any Node.js command with warnings suppressed
# Usage: ./bin/suppress-warnings.sh node dist/bot.js

NODE_OPTIONS="--no-warnings" "$@" 