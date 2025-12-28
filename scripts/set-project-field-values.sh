#!/bin/bash
# Set field values on all issues in the Planning project
# This script sets Status, Priority, Size, and Area based on issue labels and content

PLANNING_ID="PVT_kwHOBDcj0M4BLdE3"

# Get field IDs
echo "Fetching field IDs..."
STATUS_FIELD_ID=$(gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name } } } } } }' --jq '.data.node.fields.nodes[] | select(.name == "Status") | .id')
PRIORITY_FIELD_ID=$(gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name } } } } } }' --jq '.data.node.fields.nodes[] | select(.name == "Priority") | .id')
SIZE_FIELD_ID=$(gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name } } } } } }' --jq '.data.node.fields.nodes[] | select(.name == "Size") | .id')
AREA_FIELD_ID=$(gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name } } } } } }' --jq '.data.node.fields.nodes[] | select(.name == "Area") | .id')
EPIC_FIELD_ID=$(gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2Field { id name } } } } } }' --jq '.data.node.fields.nodes[] | select(.name == "Epic") | .id')

echo "Field IDs:"
echo "  Status: $STATUS_FIELD_ID"
echo "  Priority: $PRIORITY_FIELD_ID"
echo "  Size: $SIZE_FIELD_ID"
echo "  Area: $AREA_FIELD_ID"
echo "  Epic: $EPIC_FIELD_ID"
echo ""

# Function to get option ID by name
get_option_id() {
  local field_id=$1
  local option_name=$2
  gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }' --jq ".data.node.fields.nodes[] | select(.id == \"$field_id\") | .options[] | select(.name == \"$option_name\") | .id"
}

# Function to set field value on a project item
set_field_value() {
  local item_id=$1
  local field_id=$2
  local value_type=$3  # "singleSelectOptionId", "text", "number"
  local value=$4
  
  if [ "$value_type" = "singleSelectOptionId" ]; then
    gh api graphql -f query="mutation { updateProjectV2ItemFieldValue(input: { projectId: \"$PLANNING_ID\", itemId: \"$item_id\", fieldId: \"$field_id\", value: { singleSelectOptionId: \"$value\" } }) { projectV2Item { id } } }" > /dev/null 2>&1
  elif [ "$value_type" = "text" ]; then
    gh api graphql -f query="mutation { updateProjectV2ItemFieldValue(input: { projectId: \"$PLANNING_ID\", itemId: \"$item_id\", fieldId: \"$field_id\", value: { text: \"$value\" } }) { projectV2Item { id } } }" > /dev/null 2>&1
  fi
}

# Process each issue (1-57)
echo "Processing issues..."
for issue_num in {1..57}; do
  echo -n "Issue #$issue_num: "
  
  # Get issue details
  ISSUE_ID=$(gh api graphql -f query='query { repository(owner: "joshua-sx", name: "openschool-v2") { issue(number: '$issue_num') { id labels(first: 20) { nodes { name } } title } } }' --jq .data.repository.issue.id 2>/dev/null)
  
  if [ -z "$ISSUE_ID" ] || [ "$ISSUE_ID" = "null" ]; then
    echo "Not found, skipping"
    continue
  fi
  
  # Get project item ID
  ITEM_ID=$(gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { items(first: 100) { nodes { id content { ... on Issue { id number } } } } } } }' --jq ".data.node.items.nodes[] | select(.content.id == \"$ISSUE_ID\") | .id" 2>/dev/null)
  
  if [ -z "$ITEM_ID" ]; then
    echo "Not in project, skipping"
    continue
  fi
  
  # Get issue labels
  LABELS=$(gh api graphql -f query='query { repository(owner: "joshua-sx", name: "openschool-v2") { issue(number: '$issue_num') { labels(first: 20) { nodes { name } } title } } }' --jq '.data.repository.issue.labels.nodes[].name' 2>/dev/null)
  TITLE=$(gh api graphql -f query='query { repository(owner: "joshua-sx", name: "openschool-v2") { issue(number: '$issue_num') { title } } }' --jq '.data.repository.issue.title' 2>/dev/null)
  
  # Determine Status (default: Backlog)
  STATUS_OPTION_ID=$(get_option_id "$STATUS_FIELD_ID" "Backlog")
  set_field_value "$ITEM_ID" "$STATUS_FIELD_ID" "singleSelectOptionId" "$STATUS_OPTION_ID"
  echo -n "Status=Backlog "
  
  # Determine Priority from labels
  if echo "$LABELS" | grep -q "P0"; then
    PRIORITY_OPTION_ID=$(get_option_id "$PRIORITY_FIELD_ID" "P0")
    set_field_value "$ITEM_ID" "$PRIORITY_FIELD_ID" "singleSelectOptionId" "$PRIORITY_OPTION_ID"
    echo -n "Priority=P0 "
  elif echo "$LABELS" | grep -q "P1"; then
    PRIORITY_OPTION_ID=$(get_option_id "$PRIORITY_FIELD_ID" "P1")
    set_field_value "$ITEM_ID" "$PRIORITY_FIELD_ID" "singleSelectOptionId" "$PRIORITY_OPTION_ID"
    echo -n "Priority=P1 "
  elif echo "$LABELS" | grep -q "P2"; then
    PRIORITY_OPTION_ID=$(get_option_id "$PRIORITY_FIELD_ID" "P2")
    set_field_value "$ITEM_ID" "$PRIORITY_FIELD_ID" "singleSelectOptionId" "$PRIORITY_OPTION_ID"
    echo -n "Priority=P2 "
  else
    PRIORITY_OPTION_ID=$(get_option_id "$PRIORITY_FIELD_ID" "P1")
    set_field_value "$ITEM_ID" "$PRIORITY_FIELD_ID" "singleSelectOptionId" "$PRIORITY_OPTION_ID"
    echo -n "Priority=P1 (default) "
  fi
  
  # Determine Size
  # Epics are Large, most stories are Small or Medium
  if echo "$TITLE" | grep -q "\[Epic\]"; then
    SIZE_OPTION_ID=$(get_option_id "$SIZE_FIELD_ID" "L")
    set_field_value "$ITEM_ID" "$SIZE_FIELD_ID" "singleSelectOptionId" "$SIZE_OPTION_ID"
    echo -n "Size=L "
  else
    # Default stories to Medium, can be adjusted manually
    SIZE_OPTION_ID=$(get_option_id "$SIZE_FIELD_ID" "M")
    set_field_value "$ITEM_ID" "$SIZE_FIELD_ID" "singleSelectOptionId" "$SIZE_OPTION_ID"
    echo -n "Size=M "
  fi
  
  # Determine Area from labels (can have multiple, but we'll set the first one)
  if echo "$LABELS" | grep -q "area:frontend"; then
    AREA_OPTION_ID=$(get_option_id "$AREA_FIELD_ID" "Frontend")
    set_field_value "$ITEM_ID" "$AREA_FIELD_ID" "singleSelectOptionId" "$AREA_OPTION_ID"
    echo -n "Area=Frontend "
  elif echo "$LABELS" | grep -q "area:backend"; then
    AREA_OPTION_ID=$(get_option_id "$AREA_FIELD_ID" "Backend")
    set_field_value "$ITEM_ID" "$AREA_FIELD_ID" "singleSelectOptionId" "$AREA_OPTION_ID"
    echo -n "Area=Backend "
  elif echo "$LABELS" | grep -q "area:db"; then
    AREA_OPTION_ID=$(get_option_id "$AREA_FIELD_ID" "Database")
    set_field_value "$ITEM_ID" "$AREA_FIELD_ID" "singleSelectOptionId" "$AREA_OPTION_ID"
    echo -n "Area=Database "
  elif echo "$LABELS" | grep -q "area:infra"; then
    AREA_OPTION_ID=$(get_option_id "$AREA_FIELD_ID" "Infrastructure")
    set_field_value "$ITEM_ID" "$AREA_FIELD_ID" "singleSelectOptionId" "$AREA_OPTION_ID"
    echo -n "Area=Infrastructure "
  elif echo "$LABELS" | grep -q "area:docs"; then
    AREA_OPTION_ID=$(get_option_id "$AREA_FIELD_ID" "Documentation")
    set_field_value "$ITEM_ID" "$AREA_FIELD_ID" "singleSelectOptionId" "$AREA_OPTION_ID"
    echo -n "Area=Documentation "
  elif echo "$LABELS" | grep -q "area:auth"; then
    AREA_OPTION_ID=$(get_option_id "$AREA_FIELD_ID" "Auth")
    set_field_value "$ITEM_ID" "$AREA_FIELD_ID" "singleSelectOptionId" "$AREA_OPTION_ID"
    echo -n "Area=Auth "
  elif echo "$LABELS" | grep -q "area:audit"; then
    AREA_OPTION_ID=$(get_option_id "$AREA_FIELD_ID" "Audit")
    set_field_value "$ITEM_ID" "$AREA_FIELD_ID" "singleSelectOptionId" "$AREA_OPTION_ID"
    echo -n "Area=Audit "
  fi
  
  # Set Epic field for stories (link to parent epic)
  if echo "$TITLE" | grep -q "\[Story\]"; then
    # Determine parent epic based on issue number ranges
    if [ $issue_num -ge 7 ] && [ $issue_num -le 15 ]; then
      set_field_value "$ITEM_ID" "$EPIC_FIELD_ID" "text" "#1"
      echo -n "Epic=#1 "
    elif [ $issue_num -ge 16 ] && [ $issue_num -le 24 ]; then
      set_field_value "$ITEM_ID" "$EPIC_FIELD_ID" "text" "#2"
      echo -n "Epic=#2 "
    elif [ $issue_num -ge 25 ] && [ $issue_num -le 32 ]; then
      set_field_value "$ITEM_ID" "$EPIC_FIELD_ID" "text" "#3"
      echo -n "Epic=#3 "
    elif [ $issue_num -ge 33 ] && [ $issue_num -le 41 ]; then
      set_field_value "$ITEM_ID" "$EPIC_FIELD_ID" "text" "#4"
      echo -n "Epic=#4 "
    elif [ $issue_num -ge 42 ] && [ $issue_num -le 49 ]; then
      set_field_value "$ITEM_ID" "$EPIC_FIELD_ID" "text" "#5"
      echo -n "Epic=#5 "
    elif [ $issue_num -ge 50 ] && [ $issue_num -le 57 ]; then
      set_field_value "$ITEM_ID" "$EPIC_FIELD_ID" "text" "#6"
      echo -n "Epic=#6 "
    fi
  fi
  
  echo "✓"
done

echo ""
echo "Done! All issues have been configured with field values."
echo ""
echo "Note: Board views need to be created manually in GitHub UI:"
echo "1. Go to your Planning project"
echo "2. Click 'New view' → 'Board'"
echo "3. Group by: Status"
echo "4. Save as 'By Status'"

