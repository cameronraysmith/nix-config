Generate an optimal handoff prompt for Claude Code agent transitions.

Look for handoff context in:
- Current conversation thread and progress
- Project documentation and specifications
- Work completed and next steps
- Relevant code and reference materials

Create a prompt that:
1. Summarizes current thread progress and decisions
2. Incorporates agent mode context if applicable
3. Provides paths to current worktree, virtualenv, files, directories, or any other relevant paths to optimally prime the new agent's context
4. Establishes clear continuation objectives
5. Includes all necessary context for seamless transition
6. Accounts for the details of this particular scenario (if provided): 

$ARGUMENTS

The generated prompt should enable effective agent handoffs with full context preservation.
