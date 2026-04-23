#!/usr/bin/env bash
# Export all Supabase tables to CSV under exports/<timestamp>/
#
# Usage:
#   bash scripts/export-csv.sh                    # uses .env.local
#   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bash scripts/export-csv.sh
#
# Requires: curl, standard POSIX tools (runs on Git Bash / WSL / macOS / Linux)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load .env.local if env vars not already set
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  if [ -f ".env.local" ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env.local
    set +a
  fi
fi

: "${SUPABASE_URL:?SUPABASE_URL is not set (define in .env.local or env)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is not set}"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUTDIR="exports/$STAMP"
mkdir -p "$OUTDIR"

TABLES="word_stats srs_state answers candidates overrides override_audit"

echo "Exporting to $OUTDIR ..."
for t in $TABLES; do
  f="$OUTDIR/${t}.csv"
  curl -sS --fail \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Accept: text/csv" \
    "$SUPABASE_URL/rest/v1/$t?select=*" \
    -o "$f"
  rows=$(($(wc -l < "$f") - 1))
  [ "$rows" -lt 0 ] && rows=0
  printf "  %-20s %6d rows\n" "$t" "$rows"
done

# Bonus view: frequent wrong-answer patterns (candidates with proposed_role=negative)
wrong_csv="$OUTDIR/wrong_patterns.csv"
curl -sS --fail \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Accept: text/csv" \
  "$SUPABASE_URL/rest/v1/candidates?select=qid,answer_norm,freq,avg_score,sample_any,last_seen&proposed_role=eq.negative&order=freq.desc" \
  -o "$wrong_csv"
wrows=$(($(wc -l < "$wrong_csv") - 1))
[ "$wrows" -lt 0 ] && wrows=0
printf "  %-20s %6d rows\n" "wrong_patterns (view)" "$wrows"

echo
echo "Done. Files under $ROOT/$OUTDIR/"
