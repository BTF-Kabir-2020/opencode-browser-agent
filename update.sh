#!/usr/bin/env bash
# Easy UPDATE: git pull -> rebuild -> redeploy, then restart opencode.
# Same as: bash install.sh --update
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install.sh" --update
