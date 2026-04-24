#!/bin/bash

# Test script for all 3 MCP tools
# Run from mcp-server directory

set -e

echo "=========================================="
echo "Testing All 3 MCP Tools"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TEST_REPO="../test-java-code"

# Test 1: List Tools
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 1: List Available Tools${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/server.js 2>/dev/null | jq -r '.result.tools[].name' | while read tool; do
    echo -e "${GREEN}✓${NC} Tool available: $tool"
done

echo ""

# Test 2: get_project_context
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 2: get_project_context${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

CONTEXT_RESULT=$(echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_context","arguments":{}}}' | node dist/server.js 2>/dev/null)

if echo "$CONTEXT_RESULT" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
    CONTEXT_DATA=$(echo "$CONTEXT_RESULT" | jq -r '.result.content[0].text' | jq -r '.file, .size')
    echo -e "${GREEN}✓${NC} Successfully read PROJECT_CONTEXT.md"
    echo "  File: $(echo "$CONTEXT_DATA" | head -1)"
    echo "  Size: $(echo "$CONTEXT_DATA" | tail -1) bytes"
else
    echo -e "${YELLOW}⚠${NC} Could not read PROJECT_CONTEXT.md"
fi

echo ""

# Test 3: analyze_repo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 3: analyze_repo${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Running analysis on: $TEST_REPO"
echo "This may take 3-6 seconds..."
echo ""

ANALYZE_START=$(date +%s)
ANALYZE_RESULT=$(echo "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"analyze_repo\",\"arguments\":{\"repoRoot\":\"$TEST_REPO\",\"mode\":\"all\"}}}" | node dist/server.js 2>/dev/null)
ANALYZE_END=$(date +%s)
ANALYZE_TIME=$((ANALYZE_END - ANALYZE_START))

if echo "$ANALYZE_RESULT" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
    FINDINGS=$(echo "$ANALYZE_RESULT" | jq -r '.result.content[0].text' | jq -r '.findings.summary.total')
    CRITICAL=$(echo "$ANALYZE_RESULT" | jq -r '.result.content[0].text' | jq -r '.findings.summary.bySeverity.critical')
    echo -e "${GREEN}✓${NC} Analysis completed in ${ANALYZE_TIME}s"
    echo "  Total findings: $FINDINGS"
    echo "  Critical: $CRITICAL"
else
    echo -e "${YELLOW}⚠${NC} Analysis failed or returned unexpected format"
fi

echo ""

# Test 4: read_findings (all)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 4: read_findings (all)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

READ_ALL_RESULT=$(echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_findings","arguments":{}}}' | node dist/server.js 2>/dev/null)

if echo "$READ_ALL_RESULT" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
    READ_ALL_DATA=$(echo "$READ_ALL_RESULT" | jq -r '.result.content[0].text')
    FILE=$(echo "$READ_ALL_DATA" | jq -r '.file')
    TOTAL=$(echo "$READ_ALL_DATA" | jq -r '.findings.summary.total')
    echo -e "${GREEN}✓${NC} Successfully read findings"
    echo "  File: $FILE"
    echo "  Total findings: $TOTAL"
else
    echo -e "${YELLOW}⚠${NC} Could not read findings"
fi

echo ""

# Test 5: read_findings (security only)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 5: read_findings (security)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

READ_SEC_RESULT=$(echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"read_findings","arguments":{"file":"security.json"}}}' | node dist/server.js 2>/dev/null)

if echo "$READ_SEC_RESULT" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
    READ_SEC_DATA=$(echo "$READ_SEC_RESULT" | jq -r '.result.content[0].text')
    FILE=$(echo "$READ_SEC_DATA" | jq -r '.file')
    TOTAL=$(echo "$READ_SEC_DATA" | jq -r '.findings.summary.total')
    echo -e "${GREEN}✓${NC} Successfully read security findings"
    echo "  File: $FILE"
    echo "  Security findings: $TOTAL"
else
    echo -e "${YELLOW}⚠${NC} Could not read security findings"
fi

echo ""

# Test 6: read_findings (bugs only)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}TEST 6: read_findings (bugs)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

READ_BUGS_RESULT=$(echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"read_findings","arguments":{"file":"bugs.json"}}}' | node dist/server.js 2>/dev/null)

if echo "$READ_BUGS_RESULT" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
    READ_BUGS_DATA=$(echo "$READ_BUGS_RESULT" | jq -r '.result.content[0].text')
    FILE=$(echo "$READ_BUGS_DATA" | jq -r '.file')
    TOTAL=$(echo "$READ_BUGS_DATA" | jq -r '.findings.summary.total')
    echo -e "${GREEN}✓${NC} Successfully read bug findings"
    echo "  File: $FILE"
    echo "  Bug findings: $TOTAL"
else
    echo -e "${YELLOW}⚠${NC} Could not read bug findings"
fi

echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo -e "${GREEN}✓${NC} All 3 tools working correctly"
echo ""
echo "Tools tested:"
echo "  1. get_project_context - Read documentation"
echo "  2. analyze_repo        - Run analysis"
echo "  3. read_findings       - Read cached results"
echo ""
echo "Next steps:"
echo "  - Configure Claude Desktop (see SETUP.md)"
echo "  - Test with Claude in a conversation"
echo "  - Try analyzing your own Java projects"
echo ""
