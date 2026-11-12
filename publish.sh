#!/usr/bin/env bash
# Publish BTO Studio to GitHub Pages (public link) or take it back private.
#
#   bash publish.sh            # copy from the vault, create/enable the repo, make it public, push, verify the link
#   bash publish.sh retract    # make it private again and kill the link
#
# GitHub Pages only serves public repos on a free plan, so a shareable link and a
# private repo are mutually exclusive here. Anyone with the link can read the page
# source — true of any static host.
#
# Source of truth is ALWAYS the vault copy:
#   /c/Users/dripr/hermes/Obsidian Vault/Raw/Code/bto-calculator/
# Edit there, run this, done. Re-run it for every change.
set -uo pipefail

ACCOUNT="Lurkeyteg"
NAME="bto-studio"
REPO="/c/Users/dripr/code/bto-studio"
SRC="/c/Users/dripr/hermes/Obsidian Vault/Raw/Code/bto-calculator"
SLUG="${ACCOUNT}/${NAME}"
LIVE="https://$(echo "$ACCOUNT" | tr 'A-Z' 'a-z').github.io/${NAME}/"
API="https://api.github.com/repos/${SLUG}"

export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never

get_token(){
  # GCM direct first: `git credential fill` can BLOCK on this machine while the
  # helper-selector decides whether to prompt. Always bound it with a timeout.
  local t
  if command -v git-credential-manager >/dev/null 2>&1; then
    t=$(printf 'protocol=https\nhost=github.com\n\n' | timeout 20 git-credential-manager get 2>/dev/null | sed -n 's/^password=//p')
  fi
  if [ -z "$t" ]; then
    t=$(printf 'protocol=https\nhost=github.com\n\n' | timeout 20 git credential fill 2>/dev/null | sed -n 's/^password=//p')
  fi
  printf '%s' "$t"
}
TOK=$(get_token)
[ -n "$TOK" ] || { echo "no GitHub credential found"; exit 1; }

auth(){ curl -s -H "Authorization: Bearer ${TOK}" -H "Accept: application/vnd.github+json" "$@"; }

if [ "${1:-}" = "retract" ]; then
  auth -X PATCH "$API" -d '{"private":true}' | grep -q '"private": true' \
    && echo "Repo is private again."
  sleep 3
  echo "link now: $(curl -s -o /dev/null -w '%{http_code}' "$LIVE")   (404 = off the internet)"
  exit 0
fi

[ -f "$SRC/index.html" ] || { echo "missing source: $SRC/index.html"; exit 1; }
cd "$REPO" || exit 1

# ---- 1. copy the vault copy in ----
cp "$SRC/index.html" ./index.html
cp "$SRC/README.md" ./README.md
mkdir -p tests
cp "$SRC/tests/engine.test.mjs" tests/
[ -f .nojekyll ] || : > .nojekyll

# refuse to publish a broken engine
node tests/engine.test.mjs >/dev/null 2>&1 || { echo "ENGINE TESTS FAILED — not publishing"; node tests/engine.test.mjs; exit 1; }
echo "engine tests: pass"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  git init -q
  git checkout -q -b main 2>/dev/null || git branch -M main
fi
git add -A
if ! git diff --cached --quiet; then
  git -c user.name="Daniel Lee" -c user.email="danlee.etz@gmail.com" \
    commit -q -m "BTO Studio ($(date +%Y-%m-%d\ %H:%M))"
  echo "committed"
else
  echo "no file changes — still checking whether the push is needed"
fi

# ---- 2. create the repo if it is not there yet ----
if [ "$(auth -o /dev/null -w '%{http_code}' "$API")" = "404" ]; then
  auth -X POST "https://api.github.com/user/repos" \
    -d "{\"name\":\"${NAME}\",\"description\":\"Singapore BTO payment, loan and savings planner\",\"private\":false,\"has_issues\":false,\"has_wiki\":false}" \
    | grep -q '"full_name"' || { echo "could not create the repo"; exit 1; }
  echo "repo created"
fi

# ---- 3. public + pages ----
auth -X PATCH "$API" -d '{"private":false}' | grep -q '"private": false' \
  || { echo "could not make the repo public"; exit 1; }
echo "repo is public"

if [ "$(auth -o /dev/null -w '%{http_code}' "$API/pages")" = "404" ]; then
  auth -X POST "$API/pages" -d '{"source":{"branch":"main","path":"/"}}' >/dev/null
  echo "pages enabled"
else
  echo "pages already enabled"
fi

# ---- 4. push (never leave the token in .git/config) ----
git remote remove origin 2>/dev/null || true
git -c credential.helper= push -q "https://${ACCOUNT}:${TOK}@github.com/${SLUG}.git" HEAD:main \
  && echo "pushed" || { echo "push failed"; exit 1; }

# ---- 5. wait for the link, then prove it serves THIS copy ----
echo "waiting for Pages to build…"
TMP="$LOCALAPPDATA/Temp/bto-live.html"
for i in $(seq 1 20); do
  sleep 10
  C=$(curl -s -o /dev/null -w '%{http_code}' -H 'Cache-Control: no-cache' "$LIVE")
  if [ "$C" = "200" ]; then
    curl -s -H 'Cache-Control: no-cache' "$LIVE" -o "$TMP"
    if cmp -s <(tr -d '\r' < "$TMP") <(tr -d '\r' < "$SRC/index.html"); then
      echo "LIVE and byte-identical to the local copy: $LIVE"
      rm -f "$TMP"; exit 0
    fi
    echo "  …200, but still serving the previous copy (CDN lag); waiting"
  else
    echo "  …HTTP $C"
  fi
done
echo "built, but the CDN has not caught up yet. Check $LIVE in a minute."
exit 1
