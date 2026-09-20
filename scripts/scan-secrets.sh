#!/usr/bin/env bash
#
# Refuse to publish a secret.
#
#   scripts/scan-secrets.sh            # every tracked file (what CI runs)
#   scripts/scan-secrets.sh --staged   # what is about to be committed (what the hook runs)
#
# This repository is public, so a leak is public the moment it is pushed. Until now the check
# was a grep ritual written down in a handoff document, which meant it ran only when whoever
# was working remembered it — the most fragile possible place to keep a rule whose whole job
# is to catch the thing you did not notice.
#
# ## Why the interesting patterns are NOT in this file
#
# The strings most worth catching are the household's own: a real hostname, a wifi SSID, the
# child's name. Writing them into a public repository to grep for them would publish exactly
# what the grep exists to protect. So this file carries only *generic* patterns — token shapes,
# private address ranges, key headers — and reads site-specific ones from:
#
#     .secret-patterns.local      (gitignored, one extended-regex per line, # for comments)
#
# That file is per-machine and never committed. Its absence is not an error: CI has no such
# file and still catches every generic shape.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

MODE="${1:---tree}"

# ── what NOT to scan ──────────────────────────────────────────────────────
# package-lock.json is thousands of base64 `integrity` hashes and matches token shapes on
# almost every line; the fonts are binary. Both were checked by hand and neither can carry a
# credential that this scan would be the right place to find.
EXCLUDE='^(package-lock\.json|.*\.woff2|.*\.png|.*\.ico|brand/favicon\.ico)$'

# ── generic patterns ──────────────────────────────────────────────────────
# Each is a shape, not a value. Extended regex, case-insensitive where it helps.
PATTERNS=(
  'RINCON_[A-Z0-9]{8,}'                                  # Sonos player id
  'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}'         # JWT — Music Assistant tokens are these
  '(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}'               # GitHub token
  'github_pat_[A-Za-z0-9_]{20,}'                         # GitHub fine-grained PAT
  'AKIA[0-9A-Z]{16}'                                     # AWS access key id
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'                   # any private key
  # The (^|[^0-9.]) prefix is not decoration. A DOI in the research documents ends in four
  # dot-separated numbers, the middle of which reads as an RFC1918 address unless the match is
  # required to start at a non-digit — so without the boundary every citation trips this rule.
  # A scanner that cries wolf gets ignored, and this one is only worth having on the day it is
  # right about something nobody expected.
  #
  # (The example that found this is deliberately not written out here: quoting it would make
  # this very line a hit, which is how it was discovered — the hook refused the commit that
  # added it.)
  '(^|[^0-9.])192\.168\.[0-9]{1,3}\.[0-9]{1,3}([^0-9.]|$)'
  '(^|[^0-9.])172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3}([^0-9.]|$)'
  '(^|[^0-9.])10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}([^0-9.]|$)'
  '[a-z0-9-]+\.lan\b'                                    # LAN hostname
  '(psk|passphrase|wifi_password)[[:space:]]*[:=]'       # wifi credentials
)

# ── documented placeholders ───────────────────────────────────────────────
# Values the repository uses ON PURPOSE as examples, in .env.example, the ansible examples and
# the research documents. They are not addresses of anything; excluding them is what keeps this
# scan quiet enough to be believed when it does fire.
ALLOW='10\.0\.0\.0|10\.0\.0\.5|example\.lan|kiosk\.lan|musicassistant\.lan|127\.0\.0\.1|0\.0\.0\.0'

LOCAL=".secret-patterns.local"
if [[ -f "$LOCAL" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    PATTERNS+=("$line")
  done < "$LOCAL"
fi

# ── gather ────────────────────────────────────────────────────────────────
case "$MODE" in
  --staged) FILES=$(git diff --cached --name-only --diff-filter=ACMR) ;;
  --tree)   FILES=$(git ls-files) ;;
  *) echo "usage: $0 [--tree|--staged]" >&2; exit 2 ;;
esac

FILES=$(echo "$FILES" | grep -vE "$EXCLUDE" || true)
[[ -z "$FILES" ]] && exit 0

# ── scan ──────────────────────────────────────────────────────────────────
hits=0
for pat in "${PATTERNS[@]}"; do
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # Drop the documented placeholders, then see if anything is left on that line.
    stripped=$(echo "$line" | sed -E "s/($ALLOW)//g")
    if echo "$stripped" | grep -qiE "$pat"; then
      if [[ $hits -eq 0 ]]; then
        echo "REFUSING: possible secret or personal data" >&2
        echo >&2
      fi
      echo "  $line" >&2
      hits=$((hits + 1))
    fi
  done < <(echo "$FILES" | tr '\n' '\0' | xargs -0 grep -inE "$pat" 2>/dev/null || true)
done

# Commit messages travel with the repository exactly like files do, and have leaked before.
if [[ "$MODE" == "--staged" && -f .git/COMMIT_EDITMSG ]]; then
  for pat in "${PATTERNS[@]}"; do
    if grep -qiE "$pat" .git/COMMIT_EDITMSG 2>/dev/null; then
      echo "  (commit message matches: $pat)" >&2
      hits=$((hits + 1))
    fi
  done
fi

if [[ $hits -gt 0 ]]; then
  echo >&2
  echo "  $hits line(s) above. This repository is PUBLIC." >&2
  echo "  If one is a false positive, add it to the ALLOW list in $0 with a reason." >&2
  exit 1
fi

echo "scan-secrets: clean (${MODE#--}, $(echo "$FILES" | wc -l | tr -d ' ') files)"
