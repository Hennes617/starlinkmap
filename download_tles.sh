#!/bin/bash

# Downlaods TLEs and prepends the datetime at the first line of the file
# Cronjob: 5 * * * * /bin/bash /your/script/directory/download_tles.sh

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
curl "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle" > "$SCRIPT_DIR/tles.txt"
