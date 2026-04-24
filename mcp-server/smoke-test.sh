#!/bin/bash

# Quick Smoke Test for MCP Server
# Run from mcp-server directory

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

echo "=========================================="
echo "MCP Server Smoke Tests"
echo "=========================================="
echo ""

# Helper function to run test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_pattern="$3"

    echo -n "Testing: $test_name ... "

    if eval "$test_command" 2>/dev/null | grep -q "$expected_pattern"; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: Build check
echo -n "Checking build ... "
if [ -f "dist/server.js" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Run 'npm run build' first"
    ((TESTS_FAILED++))
    exit 1
fi

# Test 2: List tools
run_test "List tools" \
    'echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}" | node dist/server.js' \
    "analyze_repo"

run_test "List tools (check all 3)" \
    'echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}" | node dist/server.js' \
    "read_findings"

run_test "List tools (check docs tool)" \
    'echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}" | node dist/server.js' \
    "get_project_context"

# Test 3: get_project_context
run_test "get_project_context" \
    'echo "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_project_context\",\"arguments\":{}}}" | node dist/server.js' \
    "PROJECT_CONTEXT.md"

# Test 4: analyze_repo (if test repo exists)
if [ -d "../test-java-code" ]; then
    echo -n "Testing: analyze_repo (full analysis) ... "
    START_TIME=$(date +%s)

    RESULT=$(echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"../test-java-code","mode":"all"}}}' | node dist/server.js 2>/dev/null)

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    if echo "$RESULT" | grep -q "success"; then
        echo -e "${GREEN}✓ PASS${NC} (${DURATION}s)"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${YELLOW}⊘ SKIP${NC} analyze_repo - test-java-code not found"
fi

# Test 5: read_findings (if findings exist)
if [ -f "../data/findings/all.json" ]; then
    run_test "read_findings" \
        'echo "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"read_findings\",\"arguments\":{\"file\":\"all.json\"}}}" | node dist/server.js' \
        "success"
else
    echo -e "${YELLOW}⊘ SKIP${NC} read_findings - no findings file (run analyze_repo first)"
fi

# Test 6: Error handling - invalid path
echo -n "Testing: Error handling (invalid path) ... "
ERROR_RESULT=$(echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"/nonexistent/path/xyz"}}}' | node dist/server.js 2>/dev/null)

if echo "$ERROR_RESULT" | grep -q "error"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Test 7: Config restoration
echo -n "Testing: Config restoration ... "

# Save original if exists
ORIGINAL_CONFIG=""
if [ -f "../repos.json" ]; then
    ORIGINAL_CONFIG=$(cat ../repos.json)
fi

# Create test config
echo '[{"name":"test","path":"/test","language":"java","type":"backend"}]' > ../repos.json

# Run analysis (will fail but should restore)
echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"analyze_repo","arguments":{"repoRoot":"/invalid"}}}' | node dist/server.js 2>/dev/null > /dev/null

# Check if original test config is still there
CURRENT_CONFIG=$(cat ../repos.json 2>/dev/null || echo "")

if [ "$CURRENT_CONFIG" = '[{"name":"test","path":"/test","language":"java","type":"backend"}]' ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Restore original or clean up
if [ -n "$ORIGINAL_CONFIG" ]; then
    echo "$ORIGINAL_CONFIG" > ../repos.json
else
    rm -f ../repos.json
fi
rm -f ../repos.json.backup

# Summary
echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo ""
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure Claude Desktop (see VALIDATION.md)"
    echo "  2. Restart Claude Desktop"
    echo "  3. Test in a conversation"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check build: npm run build"
    echo "  2. Check parent analyzer: cd .. && npm run build"
    echo "  3. Check Java analyzer: cd java-analyzer && mvn package"
    echo "  4. Review logs in stderr"
    exit 1
fi
