#!/bin/sh
set -e

SANDBOX_ID="${SANDBOX_ID:-test-sandbox}"
BASE_URL="http://host.docker.internal:1900/${SANDBOX_ID}"
PASS=0
FAIL=0

pass() {
  PASS=$((PASS + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo "  FAIL: $1"
}

run_test() {
  echo ""
  echo "--- Test $1: $2 ---"
}

# ---------------------------------------------------------------------------
run_test 1 "OPTIONS — check DAV:1 header present"
RESP=$(curl -s -D - -o /dev/null -X OPTIONS "$BASE_URL/")
if echo "$RESP" | grep -qi "DAV:.*1"; then
  pass "DAV header present"
else
  fail "DAV header missing"
fi

# ---------------------------------------------------------------------------
run_test 2 "PROPFIND / depth 1 — check 207 status"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PROPFIND -H "Depth: 1" "$BASE_URL/")
if [ "$STATUS" = "207" ]; then
  pass "PROPFIND returned 207"
else
  fail "PROPFIND returned $STATUS (expected 207)"
fi

# ---------------------------------------------------------------------------
run_test 3 "PUT /test-file.txt — check 201"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "Content-Type: text/plain" \
  -d "hello webdav" "$BASE_URL/test-file.txt")
if [ "$STATUS" = "201" ]; then
  pass "PUT returned 201"
else
  fail "PUT returned $STATUS (expected 201)"
fi

# ---------------------------------------------------------------------------
run_test 4 "GET /test-file.txt — check body matches"
BODY=$(curl -s "$BASE_URL/test-file.txt")
if [ "$BODY" = "hello webdav" ]; then
  pass "GET body matches"
else
  fail "GET body was '$BODY' (expected 'hello webdav')"
fi

# ---------------------------------------------------------------------------
run_test 5 "HEAD /test-file.txt — check Content-Length"
CL=$(curl -s -I "$BASE_URL/test-file.txt" | grep -i "Content-Length" | tr -d '\r' | awk '{print $2}')
if [ "$CL" = "12" ]; then
  pass "Content-Length is 12"
else
  fail "Content-Length was '$CL' (expected 12)"
fi

# ---------------------------------------------------------------------------
run_test 6 "Range GET — check 206 + partial body"
RESP=$(curl -s -D - -H "Range: bytes=0-4" "$BASE_URL/test-file.txt")
STATUS=$(echo "$RESP" | head -1 | grep -o "[0-9][0-9][0-9]")
BODY=$(echo "$RESP" | tail -1)
if [ "$STATUS" = "206" ] && [ "$BODY" = "hello" ]; then
  pass "Range GET returned 206 with correct partial body"
elif [ "$STATUS" != "206" ]; then
  fail "Range GET returned $STATUS (expected 206)"
else
  fail "Range GET body was '$BODY' (expected 'hello')"
fi

# ---------------------------------------------------------------------------
run_test 7 "MKCOL /test-dir — check 201"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X MKCOL "$BASE_URL/test-dir")
if [ "$STATUS" = "201" ]; then
  pass "MKCOL returned 201"
else
  fail "MKCOL returned $STATUS (expected 201)"
fi

# ---------------------------------------------------------------------------
run_test 8 "PROPFIND / depth 1 — verify test-file.txt and test-dir appear"
PROPFIND_BODY=$(curl -s -X PROPFIND -H "Depth: 1" "$BASE_URL/")
HAS_FILE=$(echo "$PROPFIND_BODY" | grep -c "test-file.txt" || true)
HAS_DIR=$(echo "$PROPFIND_BODY" | grep -c "test-dir" || true)
if [ "$HAS_FILE" -gt 0 ] && [ "$HAS_DIR" -gt 0 ]; then
  pass "PROPFIND lists test-file.txt and test-dir"
else
  fail "PROPFIND missing entries (file=$HAS_FILE, dir=$HAS_DIR)"
fi

# ---------------------------------------------------------------------------
run_test 9 "MOVE /test-file.txt → /test-dir/moved.txt — check 201"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X MOVE \
  -H "Destination: $BASE_URL/test-dir/moved.txt" "$BASE_URL/test-file.txt")
if [ "$STATUS" = "201" ]; then
  pass "MOVE returned 201"
else
  fail "MOVE returned $STATUS (expected 201)"
fi

# ---------------------------------------------------------------------------
run_test 10 "GET /test-dir/moved.txt — verify content"
BODY=$(curl -s "$BASE_URL/test-dir/moved.txt")
if [ "$BODY" = "hello webdav" ]; then
  pass "Moved file content matches"
else
  fail "Moved file body was '$BODY' (expected 'hello webdav')"
fi

# ---------------------------------------------------------------------------
run_test 11 "DELETE /test-dir/moved.txt — check 204"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/test-dir/moved.txt")
if [ "$STATUS" = "204" ]; then
  pass "DELETE file returned 204"
else
  fail "DELETE file returned $STATUS (expected 204)"
fi

# ---------------------------------------------------------------------------
run_test 12 "DELETE /test-dir — check 204"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/test-dir")
if [ "$STATUS" = "204" ]; then
  pass "DELETE dir returned 204"
else
  fail "DELETE dir returned $STATUS (expected 204)"
fi

# ---------------------------------------------------------------------------
run_test 13 "PROPFIND / depth 1 — verify clean"
PROPFIND_BODY=$(curl -s -X PROPFIND -H "Depth: 1" "$BASE_URL/")
HAS_FILE=$(echo "$PROPFIND_BODY" | grep -c "test-file" || true)
HAS_DIR=$(echo "$PROPFIND_BODY" | grep -c "test-dir" || true)
if [ "$HAS_FILE" -eq 0 ] && [ "$HAS_DIR" -eq 0 ]; then
  pass "PROPFIND is clean"
else
  fail "PROPFIND still shows test artifacts (file=$HAS_FILE, dir=$HAS_DIR)"
fi

# ---------------------------------------------------------------------------
echo ""
echo "==============================="
echo "Results: $PASS passed, $FAIL failed"
echo "==============================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
