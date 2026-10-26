#!/bin/sh
cd "$(dirname "$0")" || exit 1
node scripts/serve.mjs --open
