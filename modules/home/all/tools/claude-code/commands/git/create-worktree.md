---
argument-hint: <repository-path> <branch-name> [--target path] [--copy-files file1,file2,...] [--install-cmd "command"]
description: Create isolated git worktrees for parallel development with automatic environment setup
---

# Create Git Worktree - Parallel Development Command

Create a new git worktree for isolated feature development, enabling multiple parallel workflows without branch switching.

<command-metadata>
<name>create-worktree</name>
<version>1.0.0</version>
<category>git</category>
<purpose>Enable parallel development by creating isolated git worktrees</purpose>
</command-metadata>

## Command Usage

<usage>
/git:create-worktree <repository-path> <branch-name> [--target path] [--copy-files file1,file2,...] [--install-cmd "command"]
</usage>

<examples>
<example>
<description>Create worktree for a new feature in current directory</description>
<command>/git:create-worktree . feature/user-authentication</command>
<note>Creates: {project}-worktrees/{project}-feature-user-authentication/</note>
</example>

<example>
<description>Create worktree with CLAUDE.md copy and Node.js setup</description>
<command>/git:create-worktree . feature/api-enhancement --copy-files CLAUDE.md,.env.example --install-cmd "npm install"</command>
<note>Creates: {project}-worktrees/{project}-feature-api-enhancement/</note>
</example>

<example>
<description>Create worktree in custom location</description>
<command>/git:create-worktree . feature/new-feature --target ../parallel-workspace/my-feature</command>
<note>Creates worktree at: ../parallel-workspace/my-feature</note>
</example>

<example>
<description>Create worktree for a bug fix in a subdirectory project</description>
<command>/git:create-worktree ./backend fix/memory-leak-issue</command>
</example>

<example>
<description>Create worktree with Python environment setup</description>
<command>/git:create-worktree . fix/data-processing --copy-files CLAUDE.md,requirements.txt --install-cmd "python -m venv venv && source venv/bin/activate && pip install -r requirements.txt"</command>
</example>

<example>
<description>Create worktree for a GitHub issue in a monorepo package</description>
<command>/git:create-worktree packages/api 42-add-rate-limiting</command>
<note>Creates: api-worktrees/api-42-add-rate-limiting/</note>
</example>
</examples>

## Parameters

<parameters>
<parameter name="repository-path" position="1" required="true">
Path to the git repository (relative or absolute). Use "." for current directory.
Extracted from: $ARGUMENTS (first argument)
</parameter>

<parameter name="branch-name" position="2" required="true">
Name for the new branch and worktree. Common formats:
- feature/description
- fix/issue-description
- issue-number-description
- experiment/concept-name
Extracted from: $ARGUMENTS (second argument)
</parameter>

<parameter name="--copy-files" position="optional" required="false">
Comma-separated list of untracked files to copy from source repository to new worktree.
Common files: CLAUDE.md, .env.example, local.config.json, settings.json
Extracted from: $ARGUMENTS (--copy-files flag)
</parameter>

<parameter name="--target" position="optional" required="false">
Custom target path for the worktree. If not specified, uses default pattern: {project}-worktrees/{branch-name}
Examples: --target ../nix-workspace/nixpkgs, --target /tmp/experiment
Extracted from: $ARGUMENTS (--target flag)
</parameter>

<parameter name="--install-cmd" position="optional" required="false">
Command to execute after worktree creation for environment setup.
Common commands: "npm install", "pip install -r requirements.txt", "poetry install"
Extracted from: $ARGUMENTS (--install-cmd flag)
</parameter>
</parameters>

## Execution Instructions

<execution-steps>

<step number="1" name="Parse Arguments">
Extract the repository path, branch name, and optional parameters from $ARGUMENTS.
Split on whitespace to get:
- First argument: repository path
- Second argument: branch name
- Optional: --copy-files followed by comma-separated file list
- Optional: --install-cmd followed by quoted command string
Parse flags and store for later use.
</step>

<step number="2" name="Validate Repository">
- Check if the repository path exists
- Verify it's a valid git repository using `git rev-parse --git-dir`
- Get the absolute path of the repository
- Store the repository's root directory
</step>

<step number="3" name="Prepare Worktree Structure">
- Check if --target parameter was provided
- If --target specified:
  - Use the provided path as the worktree location
  - Create parent directories with `mkdir -p` if needed
- If no --target:
  - Determine appropriate location: `<repo-basename>-worktrees/` at workspace root or `.<repo-basename>-worktrees/` in repo root
  - Generate worktree folder name: `<repo-basename>-<branch-name>` within the worktrees directory
- Ensure target path doesn't already exist to prevent conflicts
</step>

<step number="4" name="Create Worktree">
- Check if branch already exists: `git branch -a | grep <branch-name>`
- Execute from source repository using one of:
  - If branch exists remotely: `git -C <repository-path> worktree add <target-path> <branch>`
  - If new branch: `git -C <repository-path> worktree add -b <branch-name> <target-path>`
- Use absolute paths for target location to avoid ambiguity
- Handle any errors from git worktree command
</step>

<step number="5" name="Validate and Configure">
- Change to the new worktree directory
- Run `git status` to confirm clean working tree
- Run `git branch --show-current` to verify correct branch
- Check for any git hooks or local configurations to copy
- Verify files are present with `ls -la`
</step>

<step number="5.5" name="Copy Untracked Files (if requested)">
- Check if --copy-files parameter was provided
- If yes, parse the comma-separated file list
- For each file in the list:
  - Check if file exists in the source repository
  - Copy file to the new worktree directory
  - Preserve file permissions and timestamps
- Validate all requested files were copied successfully
- Display summary of copied files
</step>

<step number="5.7" name="Execute Installation Command (if provided)">
- Check if --install-cmd parameter was provided
- If yes, execute the command in the worktree directory
- Capture both stdout and stderr output
- Display command execution progress
- Handle command failures gracefully
- Show success/failure status and any error messages
</step>

<step number="6" name="Display Results">
Show comprehensive summary including:
- Full path to the new worktree
- Current branch name
- Repository information
- List of all worktrees (`git worktree list`)
- Next steps for the user
</step>

</execution-steps>

## Output Formats

<success-output>
✅ Git worktree created successfully!

📁 Repository: {repository_name}
🌿 Branch: {branch_name}
📍 Location: {full_worktree_path}

{copied_files_section}
{installation_results_section}

Next steps:
1. Open new terminal: cd {worktree_path}
2. Start Claude Code: claude
3. Begin development in isolation

All worktrees for this repository:
{git_worktree_list_output}
</success-output>

<conditional-outputs>
<copied-files-output condition="--copy-files used">
📋 Copied files:
{list_of_copied_files}
</copied-files-output>

<installation-output condition="--install-cmd used">
⚙️ Installation completed:
Command: {install_command}
Status: {success/failed}
{command_output}
</installation-output>
</conditional-outputs>

<error-outputs>
<error condition="repository-not-found">
❌ Error: Repository '{path}' not found or not accessible
💡 Tip: Use '.' for current directory or provide valid path
</error>

<error condition="not-git-repository">
❌ Error: '{path}' is not a git repository
💡 Tip: Initialize with 'git init' or specify correct repository path
</error>

<error condition="branch-exists">
❌ Error: Branch '{branch}' already exists
💡 Tip: Use different branch name or checkout existing: git worktree add <path> {branch}
</error>

<error condition="worktree-exists">
❌ Error: Worktree for branch '{branch}' already exists
💡 Tip: Remove with: git worktree remove {path}
</error>

<error condition="file-not-found">
❌ Error: Cannot copy file '{filename}' - file not found in source repository
💡 Tip: Check file exists or remove from --copy-files list
</error>

<error condition="file-copy-failed">
❌ Error: Failed to copy file '{filename}' to worktree
💡 Tip: Check file permissions and available disk space
</error>

<error condition="install-command-failed">
❌ Error: Installation command failed with exit code {code}
Command: {command}
Output: {error_output}
💡 Tip: Check command syntax and dependencies
</error>

<error condition="invalid-install-command">
❌ Error: Invalid installation command format
💡 Tip: Ensure command is properly quoted: --install-cmd "your command here"
</error>
</error-outputs>

## Best Practices

<best-practices>
- Use descriptive branch names that indicate purpose
- Create worktrees outside the main repository directory
- Clean up unused worktrees with `git worktree prune`
- Each worktree maintains independent working directory state
- Worktrees share the same git history and remote configuration
- Ideal for parallel development, testing, and code reviews
- Copy only essential untracked files (CLAUDE.md, configs, not large assets)
- Use simple, portable installation commands that work across environments
- Test installation commands manually before using in --install-cmd
- Consider environment-specific setup (virtual environments, node_modules)
- Verify copied files contain no sensitive information or credentials
</best-practices>

## Advanced Usage

<advanced-features>
<feature name="Remote Branch Checkout">
If branch exists on remote, the command will automatically check it out
rather than creating a new branch.
</feature>

<feature name="Workspace Detection">
Command intelligently detects workspace structure and places worktrees
in project-specific directories (e.g., {project}-worktrees/) for clear organization.
</feature>

<feature name="Configuration Preservation">
Copies relevant local configurations and git hooks to new worktree
when applicable.
</feature>

<feature name="Untracked File Management">
Selectively copies untracked files based on user specification,
preserving file permissions and handling copy failures gracefully.
</feature>

<feature name="Automated Environment Setup">
Executes post-creation installation commands with full output capture
and error handling for seamless development environment initialization.
</feature>
</advanced-features>

## Notes

<notes>
- Generic command suitable for any git repository
- Supports monorepos, workspaces, and standalone projects  
- Worktrees enable true parallel development without stashing
- Each worktree can have different branch checked out simultaneously
- Perfect for handling multiple GitHub issues or features concurrently
</notes>
