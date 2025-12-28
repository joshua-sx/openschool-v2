#!/bin/bash
# Setup GitHub Project V2 fields for Planning project

PLANNING_ID="PVT_kwHOBDcj0M4BLdE3"

echo "Creating Status field..."
gh api graphql -f query="mutation {
  createProjectV2Field(input: {
    projectId: \"$PLANNING_ID\"
    dataType: SINGLE_SELECT
    name: \"Status\"
    singleSelectOptions: [
      {name: \"Backlog\", description: \"Work identified but not prioritized\", color: GRAY}
      {name: \"Ready\", description: \"Scoped and ready to start\", color: BLUE}
      {name: \"In Progress\", description: \"Actively being worked on\", color: YELLOW}
      {name: \"In Review\", description: \"PR open, awaiting review\", color: PURPLE}
      {name: \"Done\", description: \"Merged and deployed\", color: GREEN}
      {name: \"Blocked\", description: \"Waiting on dependencies\", color: RED}
    ]
  }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
      }
    }
  }
}" --jq .data.createProjectV2Field.projectV2Field

echo "Creating Priority field..."
gh api graphql -f query="mutation {
  createProjectV2Field(input: {
    projectId: \"$PLANNING_ID\"
    dataType: SINGLE_SELECT
    name: \"Priority\"
    singleSelectOptions: [
      {name: \"P0\", description: \"Critical - fix immediately\", color: RED}
      {name: \"P1\", description: \"High - fix soon\", color: ORANGE}
      {name: \"P2\", description: \"Medium - normal priority\", color: YELLOW}
      {name: \"P3\", description: \"Low - when time permits\", color: GRAY}
    ]
  }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
      }
    }
  }
}" --jq .data.createProjectV2Field.projectV2Field

echo "Creating Size field..."
gh api graphql -f query="mutation {
  createProjectV2Field(input: {
    projectId: \"$PLANNING_ID\"
    dataType: SINGLE_SELECT
    name: \"Size\"
    singleSelectOptions: [
      {name: \"S\", description: \"Small - 1-2 days\", color: GREEN}
      {name: \"M\", description: \"Medium - 3-5 days\", color: YELLOW}
      {name: \"L\", description: \"Large - 1+ weeks\", color: RED}
    ]
  }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
      }
    }
  }
}" --jq .data.createProjectV2Field.projectV2Field

echo "Creating Area field..."
gh api graphql -f query="mutation {
  createProjectV2Field(input: {
    projectId: \"$PLANNING_ID\"
    dataType: SINGLE_SELECT
    name: \"Area\"
    singleSelectOptions: [
      {name: \"Frontend\", description: \"UI, components, client-side\", color: BLUE}
      {name: \"Backend\", description: \"API, services, server-side\", color: PURPLE}
      {name: \"Database\", description: \"Schema, migrations, queries\", color: PINK}
      {name: \"Infrastructure\", description: \"CI/CD, deployment, monitoring\", color: ORANGE}
      {name: \"Documentation\", description: \"README, guides, API docs\", color: GRAY}
      {name: \"Auth\", description: \"Authentication, authorization\", color: RED}
      {name: \"Audit\", description: \"Audit logging, compliance\", color: YELLOW}
    ]
  }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
      }
    }
  }
}" --jq .data.createProjectV2Field.projectV2Field

echo "Epic field already created (text field)"
echo "Done!"

