#!/bin/bash
# Update GitHub Project V2 fields for Planning project

PLANNING_ID="PVT_kwHOBDcj0M4BLdE3"

# Get Status field ID
STATUS_FIELD_ID=$(gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name } } } } } }' --jq '.data.node.fields.nodes[] | select(.name == "Status") | .id')

echo "Adding options to Status field..."
cat > /tmp/status_mutation.json << EOF
{
  "query": "mutation { updateProjectV2SingleSelectField(input: { projectId: \\\"$PLANNING_ID\\\", fieldId: \\\"$STATUS_FIELD_ID\\\", optionsToAdd: [{name: \\\"Backlog\\\", description: \\\"Work identified but not prioritized\\\", color: GRAY}, {name: \\\"Ready\\\", description: \\\"Scoped and ready to start\\\", color: BLUE}, {name: \\\"In Review\\\", description: \\\"PR open, awaiting review\\\", color: PURPLE}, {name: \\\"Blocked\\\", description: \\\"Waiting on dependencies\\\", color: RED}] }) { projectV2Field { ... on ProjectV2SingleSelectField { name } } } }"
}
EOF

gh api graphql --input /tmp/status_mutation.json --jq .data.updateProjectV2SingleSelectField.projectV2Field

# Get Priority field ID
PRIORITY_FIELD_ID=$(gh api graphql -f query='query { node(id: "'$PLANNING_ID'") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name } } } } } }' --jq '.data.node.fields.nodes[] | select(.name == "Priority") | .id')

echo "Adding P3 to Priority field..."
cat > /tmp/priority_mutation.json << EOF
{
  "query": "mutation { updateProjectV2SingleSelectField(input: { projectId: \\\"$PLANNING_ID\\\", fieldId: \\\"$PRIORITY_FIELD_ID\\\", optionsToAdd: [{name: \\\"P3\\\", description: \\\"Low - when time permits\\\", color: GRAY}] }) { projectV2Field { ... on ProjectV2SingleSelectField { name } } } }"
}
EOF

gh api graphql --input /tmp/priority_mutation.json --jq .data.updateProjectV2SingleSelectField.projectV2Field

echo "Done! Fields updated."
