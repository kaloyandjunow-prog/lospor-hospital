#!/bin/sh
# Safe default for the fixed off-host hook contract. Hospital IT may replace
# secrets/backup/offhost-copy with its own executable. Exit 75 means that the
# verified local object was deliberately not acknowledged by off-host storage.
exit 75
