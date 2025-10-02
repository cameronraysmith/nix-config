---
description: "Generate or update a comprehensive workspace-level CLAUDE.md file for multi-repository development environments with worktrees and auxiliary repositories"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, LS
argument-hint: "[mode] [workspace-name] [primary-repo] [context] | mode: create|update|auto, all optional"
---

# Workspace CLAUDE.md Generator

Create or intelligently update a comprehensive workspace-level CLAUDE.md file that provides navigation, context, and development guidelines for multi-repository workspaces containing primary projects and auxiliary repositories.

**Smart Mode Detection**: This command automatically detects whether you need to create a new workspace CLAUDE.md or update an existing one, preserving your customizations while ensuring completeness and accuracy.

## Critical Context: Workspace vs Project CLAUDE.md

**IMPORTANT**: This command creates a WORKSPACE-LEVEL CLAUDE.md, which is fundamentally different from project-level CLAUDE.md files:

### Workspace CLAUDE.md (This Command Creates)
- **Location**: Workspace root directory containing multiple repositories
- **Purpose**: Navigation hub and context provider for multi-repository development
- **Scope**: Cross-repository coordination and navigation
- **Key Feature**: Working directory detection logic to guide Claude to the right context

### Project CLAUDE.md (Created by `/init`)
- **Location**: Individual repository/project root
- **Purpose**: Project-specific development guidelines
- **Scope**: Single repository/project
- **Key Feature**: Detailed project-specific instructions

## Understanding the Workspace Pattern

This command is designed for a specific development pattern where workspaces contain:

1. **Primary Development Repository**: Main project under active development
2. **Adjacent Git Worktrees**: Multiple experimental branches checked out as separate directories for parallel development (e.g., `project-686-feature`, `project-690-bugfix`)
3. **Dependency Source Code**: Full source repositories of libraries and frameworks used
4. **Reference Materials**: Documentation, papers, tutorials, and related method implementations
5. **Development Tools**: Utilities, scripts, and analysis tools

### Example Workspace Structure:
```
workspace-root/
├── CLAUDE.md                       # Workspace-level navigation (created by this command)
├── primary-project/                # Main development repository
│   ├── CLAUDE.md                  # Project-specific instructions
│   └── [project files]
├── primary-project-686-feature/    # Git worktree for issue #686
│   └── CLAUDE.md                  # Worktree-specific context
├── primary-project-690-bugfix/     # Git worktree for issue #690
│   └── CLAUDE.md                  # Worktree-specific context
├── dependency-lib-1/               # Source code of key dependency
├── dependency-lib-2/               # Another dependency source
├── reference-papers/               # Related research and documentation
└── dev-tools/                     # Development utilities
```

## Command Parameters

**Usage:** `/create-workspace-claude [mode] [workspace-name] [primary-repo] [context]`

### Parameter Definitions

| Parameter | Position | Options | Default | Description |
|-----------|----------|---------|---------|-------------|
| `mode` | 1 | `create`, `update`, `auto` | `auto` | Execution mode - create new, update existing, or auto-detect |
| `workspace-name` | 2 | Any string | Auto-detected | Workspace name used in CLAUDE.md title and descriptions |
| `primary-repo` | 3 | Repository name | Auto-detected | Primary development repository to prioritize |
| `context` | 4 | Theme/description | None | Additional context for categorization and descriptions |

### Usage Examples

```bash
# Auto-detect everything (current behavior)
/create-workspace-claude

# Auto-detect with workspace name
/create-workspace-claude auto jax-workspace

# Force create new workspace documentation
/create-workspace-claude create

# Force create with full specification
/create-workspace-claude create ai-research-workspace langchain machine-learning

# Force update existing documentation
/create-workspace-claude update

# Update with additional context
/create-workspace-claude update planning-workspace docs-framework documentation

# Specify primary repo to help detection
/create-workspace-claude auto my-workspace pytorch deep-learning-research
```

### Parameter Processing Logic

The command processes arguments in order, with later parameters providing context for workspace analysis:

1. **Mode Parameter**: Determines execution strategy
   - `create`: Creates new CLAUDE.md (fails if exists)
   - `update`: Updates existing CLAUDE.md (fails if missing)
   - `auto`: Smart detection based on file existence (default)

2. **Workspace Name**: Used for titles and descriptions instead of auto-detection
3. **Primary Repository**: Prioritized during repository identification phase
4. **Context**: Enhances repository categorization and cross-repository guidelines

## Execution Instructions

You will generate or update a comprehensive workspace CLAUDE.md file using the enhanced parameter system with explicit mode control and contextual information.

### Step 0: Argument Processing and Mode Validation

**CRITICAL FIRST STEP**: Parse command arguments and validate execution mode:

```bash
# Parse arguments from $ARGUMENTS
ARGS=($ARGUMENTS)
MODE=${ARGS[0]:-"auto"}           # Default to auto if not specified
WORKSPACE_NAME=${ARGS[1]:-""}     # Will be auto-detected if empty
PRIMARY_REPO=${ARGS[2]:-""}       # Will be auto-detected if empty  
CONTEXT=${ARGS[3]:-""}            # Optional additional context

echo "=== ARGUMENT PROCESSING ==="
echo "Mode: $MODE"
echo "Workspace Name: ${WORKSPACE_NAME:-'(auto-detect)'}"
echo "Primary Repository: ${PRIMARY_REPO:-'(auto-detect)'}"
echo "Context: ${CONTEXT:-'(none provided)'}"

# Check if CLAUDE.md exists
CLAUDE_EXISTS=false
if [ -f "CLAUDE.md" ]; then
    CLAUDE_EXISTS=true
    echo "Existing CLAUDE.md found: $(ls -la CLAUDE.md)"
else
    echo "No existing CLAUDE.md found"
fi
```

**Mode Validation Logic**:
```bash
# Validate mode against file existence
case $MODE in
    "create")
        if [ "$CLAUDE_EXISTS" = true ]; then
            echo "❌ ERROR: CREATE mode specified but CLAUDE.md already exists"
            echo "   Use 'update' mode to modify existing file, or 'auto' for smart detection"
            exit 1
        fi
        echo "✅ CREATE MODE: Will generate new CLAUDE.md"
        EXECUTION_MODE="CREATE"
        ;;
    "update") 
        if [ "$CLAUDE_EXISTS" = false ]; then
            echo "❌ ERROR: UPDATE mode specified but no CLAUDE.md found"
            echo "   Use 'create' mode to generate new file, or 'auto' for smart detection"
            exit 1
        fi
        echo "✅ UPDATE MODE: Will analyze and update existing CLAUDE.md"
        EXECUTION_MODE="UPDATE"
        ;;
    "auto")
        if [ "$CLAUDE_EXISTS" = true ]; then
            echo "✅ AUTO MODE: Detected existing CLAUDE.md - switching to UPDATE"
            EXECUTION_MODE="UPDATE"
        else
            echo "✅ AUTO MODE: No existing CLAUDE.md - switching to CREATE"
            EXECUTION_MODE="CREATE"  
        fi
        ;;
    *)
        echo "❌ ERROR: Invalid mode '$MODE'. Use 'create', 'update', or 'auto'"
        exit 1
        ;;
esac
```

---

## CREATE MODE: Generate New Workspace CLAUDE.md

If no existing CLAUDE.md is found, follow these steps to create one from scratch:

### Step 1: Analyze Workspace Structure

First, gather comprehensive information about the workspace:

```bash
# Get current location
pwd

# List all directories
ls -la

# Find all git repositories (up to 2 levels deep)
find . -maxdepth 2 -name ".git" -type d | head -30

# Check for git worktrees
git worktree list 2>/dev/null || echo "No worktrees in current directory"

# For each git repository found, check if it's a worktree
for repo in $(find . -maxdepth 2 -name ".git" -type d | head -10); do
    dir=$(dirname "$repo")
    echo "Checking $dir:"
    cd "$dir" && git worktree list 2>/dev/null | head -1 || git rev-parse --show-toplevel 2>/dev/null
    cd - > /dev/null
done
```

### Step 2: Identify Primary Repository

Determine which repository is the primary development focus:

1. Check for the largest/most active repository
2. Look for main project indicators (comprehensive README, package.json/pyproject.toml, etc.)
3. Identify worktrees by naming patterns (often include issue numbers like `-686-`, `-690-`)
4. Check git history for activity levels

### Step 3: Categorize Repositories

Classify each repository into categories, using provided parameters to enhance categorization:

```bash
# Use provided context to inform categorization
if [ -n "$CONTEXT" ]; then
    echo "Using context '$CONTEXT' to enhance repository categorization"
fi

# Use primary repository hint if provided
if [ -n "$PRIMARY_REPO" ]; then
    echo "Prioritizing '$PRIMARY_REPO' as primary development repository"
fi
```

**Repository Categories**:
- **Primary Development**: Main project repository (prioritize $PRIMARY_REPO if specified)
- **Worktrees**: Feature branches and experiments (look for patterns like `projectname-###-description`)
- **Dependencies**: Libraries and frameworks (check for package names matching imports)
- **References**: Documentation, papers, tutorials (look for `.md`, `.qmd`, `paper/`, `docs/`)
- **Tools**: Development utilities and scripts

**Enhanced Categorization with Context**:
- Use `$CONTEXT` to improve repository descriptions (e.g., "machine-learning" context emphasizes ML libraries)
- Prioritize `$PRIMARY_REPO` in identification even if not the largest repository
- Tailor category descriptions to match workspace purpose

### Step 4: Generate the Workspace CLAUDE.md

Use this concrete template, filling in the discovered information and provided parameters:

```bash
# Use provided workspace name or auto-detect
if [ -n "$WORKSPACE_NAME" ]; then
    FINAL_WORKSPACE_NAME="$WORKSPACE_NAME"
else
    # Auto-detect from directory name or primary repository
    FINAL_WORKSPACE_NAME=$(basename "$(pwd)")
fi

echo "Using workspace name: $FINAL_WORKSPACE_NAME"
```

```markdown
# $FINAL_WORKSPACE_NAME Workspace Context

## Working Directory Detection

**IMPORTANT**: This workspace contains both the main $PRIMARY_REPO repository and $WORKTREE_COUNT experimental git worktrees, along with $DEPENDENCY_COUNT dependency source repositories. Always check your working directory first:

### If Directed to Work in a Worktree (e.g., `$WORKTREE_EXAMPLE_1`, `$WORKTREE_EXAMPLE_2`)

**Reference the worktree's own CLAUDE.md file** which contains:

- Worktree-specific working directory context
- Correct path references for that worktree
- Branch-specific development instructions
- Complete project configuration (including this workspace context)

\```bash
# Check if you're in a worktree
pwd
# If you see: /Users/.../$WORKSPACE_NAME/$PRIMARY_REPO-NNN-*/
# (where NNN is an issue number like 686, 690, etc.)
# Then you're in a worktree - use that directory's CLAUDE.md file
\```

### If Working in Main Repository (`$PRIMARY_REPO/`)

- Use `$PRIMARY_REPO/CLAUDE.md` for development guidelines
- Continue with the information below for workspace context

### If Working at Workspace Root

- Use this file for workspace overview and cross-repository guidance
- Navigate to the appropriate project directory for specific development work

## Primary Repository

- **`$PRIMARY_REPO/`** - $PRIMARY_DESCRIPTION
  - 📖 **See [`$PRIMARY_REPO/CLAUDE.md`]($PRIMARY_REPO/CLAUDE.md)** for $PRIMARY_GUIDELINES

## Git Worktrees (Experimental Branches)

These are git worktrees of the primary repository for parallel development:

$WORKTREE_SECTION

## Dependency Source Repositories

These contain the full source code and documentation for key dependencies:

### Core Dependencies

$CORE_DEPENDENCIES_SECTION

### Additional Libraries

$ADDITIONAL_LIBRARIES_SECTION

## Reference Materials & Documentation

$REFERENCE_SECTION

## Development Tools & Utilities

$TOOLS_SECTION

## Development Context Guidelines

### When Working with $PRIMARY_FRAMEWORK

$PRIMARY_FRAMEWORK_GUIDELINES

### When Working with Worktrees

1. **Check Branch Context**: Each worktree has its own branch and purpose
2. **Reference Worktree CLAUDE.md**: Use the specific CLAUDE.md in that worktree
3. **Maintain Isolation**: Changes in worktrees don't affect other worktrees
4. **Sync When Needed**: Pull changes from main branch when necessary

### Cross-Repository Usage Guidelines

#### When to Reference Dependencies

$DEPENDENCY_REFERENCE_GUIDELINES

#### Key Files to Check Across Repositories

- **Implementation examples**: Check `examples/`, `notebooks/`, or `demo/` directories
- **API patterns**: Look in dependency source for usage patterns
- **Configuration**: Review `pyproject.toml`, `package.json`, build configs
- **Testing patterns**: Examine `tests/` directories for testing approaches
- **Documentation**: Check `docs/`, README files, and inline documentation

#### Search Strategy

Use targeted searches across relevant repositories when:

$SEARCH_STRATEGY_SECTION

## Workspace Organization

\```
$WORKSPACE_NAME/
├── CLAUDE.md                          # This file - workspace navigation
├── $PRIMARY_REPO/                     # Primary development repository
│   ├── CLAUDE.md                     # Project-specific instructions
│   └── [project structure]
│
├── $WORKTREE_PATTERN/                # Git worktrees for experiments
│   ├── CLAUDE.md                     # Worktree-specific context
│   └── [branch development]
│
├── [dependency-repos]/               # Source code of dependencies
│   └── [library source]
│
├── [reference-repos]/                # Documentation and references
│   └── [papers, tutorials]
│
└── [tool-repos]/                    # Development utilities
    └── [scripts, tools]
\```

### Path Reference Strategy

The workspace uses consistent path references:

1. **Absolute Paths (From Workspace Root)**:
   - Used when instructing AI agents: `$PRIMARY_REPO/src/module.py`
   - Cross-repository references: `dependency-lib/examples/usage.py`

2. **Relative Paths (Within Repositories)**:
   - Internal documentation links: `../docs/api.md`
   - Local file references: `./src/components/`

This approach ensures both clear AI agent instructions and maintainable documentation links.
```

### Step 5: Validate and Write File (CREATE MODE)

1. Ensure all detected repositories are documented
2. Verify working directory detection logic is clear
3. Confirm path references are correct
4. Write the file to workspace root as `CLAUDE.md`

### Step 6: Provide Summary (CREATE MODE)

After creating the file, provide a summary including:
- File location and size
- Number of repositories documented
- Primary repository identified
- Number of worktrees detected
- Key sections created

---

## UPDATE MODE: Analyze and Update Existing Workspace CLAUDE.md

If an existing CLAUDE.md is found, follow these steps to intelligently update it while preserving customizations:

### Step 1-U: Analyze Existing CLAUDE.md Structure

**Read and parse the current workspace CLAUDE.md:**

```bash
# Read the existing file completely
cat CLAUDE.md

# Check file size and structure
wc -l CLAUDE.md
grep -n "^#" CLAUDE.md | head -20
```

**Extract key information from existing file:**
1. **Current workspace name** (from header)
2. **Primary repository identification** (from Primary Repository section)
3. **Currently documented repositories** (scan all sections)
4. **Repository categorizations** (which repos are in which categories)
5. **Custom content and modifications** (user-added sections, descriptions)
6. **Working directory detection logic** (current navigation structure)
7. **Cross-repository guidelines** (existing workflow recommendations)

### Step 2-U: Current Workspace Structure Analysis

**Analyze actual workspace state (same as CREATE MODE):**

```bash
# Get current workspace structure
pwd && ls -la

# Find all git repositories
find . -maxdepth 2 -name ".git" -type d | head -30

# Check worktree status
git worktree list 2>/dev/null || echo "No worktrees in current directory"

# Check each repository for key indicators
for repo in $(find . -maxdepth 2 -name ".git" -type d | head -15); do
    dir=$(dirname "$repo")
    echo "Analyzing $dir:"
    cd "$dir"
    echo "  - Git status: $(git branch --show-current 2>/dev/null || echo 'not git')"
    echo "  - Worktree: $(git worktree list 2>/dev/null | wc -l || echo '0') entries"
    echo "  - README: $(ls README* 2>/dev/null || echo 'none')"
    echo "  - Config: $(ls package.json pyproject.toml Cargo.toml 2>/dev/null || echo 'none')"
    cd - > /dev/null
done
```

### Step 3-U: Gap Analysis - Compare Documented vs Actual

**Identify discrepancies between documented and actual workspace state:**

1. **New Repositories**: Find repos in workspace not documented in CLAUDE.md
2. **Missing Repositories**: Find repos documented but no longer present
3. **Changed Repositories**: Find repos with different purposes or structure
4. **New Worktrees**: Find worktrees not documented
5. **Obsolete Worktrees**: Find documented worktrees that no longer exist
6. **Structure Issues**: Find missing required sections or broken navigation

**Gap Analysis Process:**
```bash
# Extract repository names from current CLAUDE.md
grep -o '\*\*`[^`]*`\*\*' CLAUDE.md | sed 's/\*\*`\([^`]*\)`\*\*/\1/' | sort > documented_repos.tmp

# Get actual repository directories
find . -maxdepth 2 -name ".git" -type d | dirname | sed 's|\./||' | sort > actual_repos.tmp

# Compare lists
echo "=== NEW REPOSITORIES (not documented) ==="
comm -13 documented_repos.tmp actual_repos.tmp

echo "=== OBSOLETE ENTRIES (documented but missing) ==="
comm -23 documented_repos.tmp actual_repos.tmp

echo "=== COMMON REPOSITORIES (need description verification) ==="
comm -12 documented_repos.tmp actual_repos.tmp

# Cleanup
rm -f documented_repos.tmp actual_repos.tmp
```

### Step 4-U: Content Preservation Analysis

**Identify user customizations to preserve:**

1. **Custom Descriptions**: User-modified repository descriptions
2. **Added Sections**: Extra sections not in standard template
3. **Workflow Modifications**: Custom development guidelines
4. **Personal Notes**: User-added explanations or warnings
5. **Custom Path References**: Modified path structures
6. **Additional Guidelines**: Extra cross-repository usage patterns

**Preservation Strategy:**
- **Keep all user-added content** that doesn't conflict with structure
- **Preserve enhanced descriptions** unless factually incorrect
- **Maintain custom sections** while ensuring required sections exist
- **Keep workflow modifications** unless they reference non-existent repos

### Step 5-U: Intelligent Update Strategy

**Update approach using targeted edits:**

1. **Update Repository Sections**: 
   - Add missing repositories to appropriate categories
   - Remove obsolete repository entries
   - Update repository descriptions based on current analysis
   - Preserve user customizations in descriptions

2. **Fix Structure Issues**:
   - Ensure Working Directory Detection is first major section
   - Verify all required sections are present
   - Fix broken path references
   - Update workspace name if needed

3. **Maintain Navigation Logic**:
   - Update worktree examples with actual current worktrees
   - Ensure primary repository is correctly identified
   - Fix any broken links or references

**Implementation using Edit tool:**
```bash
# For each identified issue, use targeted edits
# Example: Add new repository to Dependencies section
```

### Step 6-U: Validation and Final Updates

**Validate the updated content:**

1. **Structural Validation**: Ensure all required sections exist
2. **Reference Validation**: Check all repository references are valid
3. **Navigation Validation**: Verify working directory detection logic
4. **Content Validation**: Ensure repository descriptions are accurate
5. **Link Validation**: Check all path references and links work

**Apply final updates using Edit tool** for precise modifications while preserving user content.

### Step 7-U: Update Summary

**Provide comprehensive update summary:**
- What was analyzed and preserved
- New repositories added and in which categories
- Obsolete entries removed
- Structure issues fixed
- Custom content preserved
- Validation results

## Important Implementation Notes

1. **Always include working directory detection as the FIRST major section** - This is critical for navigation
2. **Emphasize checking worktree-specific CLAUDE.md files** - Each worktree should have its own context
3. **Use concrete examples** - Don't use abstract placeholders, use actual discovered repository names
4. **Maintain clear hierarchy** - Workspace → Repository → Worktree
5. **Include bash commands** - Provide actual commands for checking location
6. **Reference existing CLAUDE.md files** - Don't duplicate, reference project-specific files

## Error Handling

### CREATE MODE Errors

If you encounter issues during creation:

1. **No repositories found**: Suggest checking if in correct directory
2. **Can't identify primary repository**: Ask user to specify with argument
3. **No worktrees detected**: Note that workspace may not use worktree pattern
4. **Permission issues**: Suggest checking file permissions

### UPDATE MODE Errors

If you encounter issues during updates:

1. **Corrupted CLAUDE.md**: File exists but can't be parsed properly
   - **Recovery**: Back up original, create new file with preserved content
2. **Parse failures**: Can't extract repository information from existing file
   - **Recovery**: Manual analysis, ask user to verify repository categorizations
3. **Conflicting information**: Documented info conflicts with actual workspace
   - **Recovery**: Prioritize actual workspace state, preserve user customizations
4. **Edit conflicts**: Can't apply updates due to file structure issues
   - **Recovery**: Create updated content in new file, compare with original
5. **Permission issues on Edit**: Can't modify existing CLAUDE.md
   - **Recovery**: Check file permissions, suggest backup and recreate approach

### ARGUMENT-SPECIFIC Errors

If you encounter issues with provided arguments:

1. **Invalid mode parameter**: Mode is not `create`, `update`, or `auto`
   - **Recovery**: Display valid options and ask user to retry
2. **Mode-file conflict**: 
   - CREATE mode but CLAUDE.md exists
   - UPDATE mode but no CLAUDE.md found
   - **Recovery**: Suggest correct mode or use `auto` for smart detection
3. **Primary repository not found**: Specified primary-repo doesn't exist in workspace
   - **Recovery**: List available repositories, ask user to verify name
4. **Conflicting parameters**: Arguments don't make sense together
   - **Recovery**: Explain parameter logic and suggest valid combinations
5. **Argument parsing failures**: Can't parse provided arguments properly
   - **Recovery**: Show expected format and provide usage examples

## Success Criteria

### CREATE MODE Success Criteria

The newly generated CLAUDE.md should:
1. Provide clear navigation logic for Claude Code agents
2. Document all repositories with their purposes  
3. Include working directory detection as first section
4. Reference (not duplicate) project-specific CLAUDE.md files
5. Support efficient cross-repository development
6. Follow the established workspace pattern from examples

### UPDATE MODE Success Criteria  

The updated CLAUDE.md should:
1. **Preserve all user customizations** while fixing structural issues
2. **Add missing repositories** discovered in workspace analysis
3. **Remove obsolete entries** for repositories no longer present
4. **Update descriptions** to reflect current repository states
5. **Maintain working directory detection** as first section
6. **Fix broken references** while preserving user-added links
7. **Validate all navigation logic** for current workspace structure

## Success Output Templates

### CREATE MODE Success Output

```
✅ **Workspace CLAUDE.md Created Successfully**

**Mode**: CREATE - Generated new workspace documentation
**File**: `/[workspace-path]/CLAUDE.md`
**Size**: [file-size] lines

**Workspace Analysis:**
- **Name**: [workspace-name]  
- **Primary Repository**: [primary-repo]
- **Total Repositories**: [count]
- **Worktrees Detected**: [worktree-count]

**Repository Categories:**
- **Primary Development**: [primary-repos]
- **Dependencies**: [dependency-count] repositories
- **Reference/Documentation**: [reference-count] repositories  
- **Tools/Utilities**: [tools-count] repositories

**Key Features Added:**
✓ Working directory detection logic
✓ Repository categorization and descriptions
✓ Cross-repository usage guidelines
✓ Development workflow recommendations
✓ Path reference strategy
✓ Search and navigation instructions

**Next Steps:**
1. Review the generated CLAUDE.md for accuracy
2. Customize repository descriptions if needed
3. Add project-specific development patterns
4. Update individual repository CLAUDE.md files to reference workspace context
5. Consider creating specialized commands for common workflows
```

### UPDATE MODE Success Output  

```
✅ **Workspace CLAUDE.md Updated Successfully**

**Mode**: UPDATE - Analyzed and improved existing documentation
**File**: `/[workspace-path]/CLAUDE.md` 
**Size**: [old-size] → [new-size] lines

**Analysis Results:**
- **Repositories Analyzed**: [total-analyzed]
- **New Repositories Found**: [new-count]
- **Obsolete Entries Removed**: [removed-count]  
- **Structure Issues Fixed**: [structure-fixes]

**Changes Made:**
✓ **Added [new-count] new repositories**:
  - [list-of-new-repos]
✓ **Removed [removed-count] obsolete entries**:
  - [list-of-removed-repos]  
✓ **Updated descriptions** for [updated-count] repositories
✓ **Fixed structure issues**: [list-of-fixes]
✓ **Preserved customizations**: [custom-content-count] user sections maintained

**Content Preserved:**
- Custom repository descriptions: [preserved-count]
- User-added sections: [user-section-count] 
- Workflow modifications: [workflow-mods]
- Personal notes and guidelines: [notes-count]

**Validation Results:**
✓ Working directory detection logic verified
✓ All repository references validated
✓ Navigation paths confirmed working
✓ Cross-repository guidelines updated
✓ Template structure compliance verified

**Next Steps:**
1. Review the updated content for accuracy
2. Test navigation logic with current workspace
3. Verify preserved customizations still apply  
4. Update any remaining project-specific references
5. Consider documenting new repositories in more detail
```
