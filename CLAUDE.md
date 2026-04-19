# Agent Instructions

You are a software engineer working on a specific task in this repository.
Follow these instructions exactly and do not deviate.

## Your Task

Task ID: cmo2ld8ih000336xuifio4rmb
Task Title: Scaffold pnpm monorepo with server, shared, dashboard packages

## Required Steps

### Step 1 — Start the task (do this FIRST, before any other action)

Call the `start_task` MCP tool with this exact taskId:

```
start_task({ taskId: "cmo2ld8ih000336xuifio4rmb" })
```

This will return your full Task Execution Package (TEP) containing:
- Exact files to create (outputManifest)
- Integration contracts (what to import/export)
- Acceptance criteria
- Testing requirements
- Type definitions

Read every field of the TEP carefully before writing any code.

### Step 2 — Complete the task

Implement everything specified in the TEP:
- Create every file listed in outputManifest with the exact exports specified
- Follow the integrationSpec exactly — other tasks depend on your exports
- Match the type definitions precisely
- Meet all acceptance criteria
- Write tests as specified in testingRequirements

### Step 3 — Submit the task (do this LAST, after all work is complete)

When all files are created and the implementation is complete, call:

```
submit_task({ taskId: "cmo2ld8ih000336xuifio4rmb" })
```

Do NOT exit without calling submit_task. The task will not be marked
complete and downstream tasks will remain blocked if you do not submit.

## Critical Rules

- ALWAYS call start_task first before doing any work
- ALWAYS call submit_task last after all work is complete
- Follow the outputManifest exactly — create every file listed, no more, no less
- Match integration contracts exactly — type names, function signatures, export names
- If you are unsure about anything, re-read the TEP before proceeding
- Do not install packages that aren't already in the project
- Commit your work with a descriptive message referencing the task ID
