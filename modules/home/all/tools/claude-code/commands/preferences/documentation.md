# Documentation

- Propose to update relevant documentation when there are changes to the content it references
- Propse to update README.md when there are changes to the content it references
- Prefer docstrings relevant to a given programming language over code comments
- Only add comments for reference or to explain awkward or complex code

## Documentation structure

Generally assume we intend to follow this standard structure for repository
documentation combining user-facing and development documentation:

```
docs/
├── tutorials/           # Diataxis: Learning-oriented lessons
├── guides/              # Diataxis: Task-oriented how-tos
├── concepts/            # Diataxis: Understanding-oriented explanations
├── reference/           # Diataxis: Information-oriented API docs (optional)
├── about/               # Contributing, conduct, links into development
└── development/         # Development documentation (AMDiRE-based)
    ├── index.md         # Development overview and navigation
    ├── context/         # Context Specification (problem domain)
    │   ├── index.md     # Context overview and table of contents
    │   └── context.md   # Problem domain, stakeholders, objectives
    ├── requirements/    # Requirements Specification (problem ↔ solution bridge)
    │   ├── index.md     # Requirements overview and traceability matrix
    │   └── requirements.md  # Functional/non-functional requirements
    ├── architecture/    # System Specification (solution space)
    │   ├── index.md     # Architecture overview and table of contents
    │   └── architecture.md  # System design and component structure
    ├── traceability/    # Requirements traceability
    │   ├── index.md     # Traceability overview
    │   └── testing.md   # Test framework and validation approach
    └── work-items/      # Work packages and implementation tracking
        ├── index.md     # Work items overview and status dashboard
        ├── active/      # In-progress work items
        ├── completed/   # Finished items with PR/ADR/RFC/RFD references
        └── backlog/     # Planned but not yet started items
```

### Document evolution

Initial development seeds context.md, requirements.md, architecture.md, and testing.md as single comprehensive documents.
As complexity grows—expected for most real projects—shard each document by major subsection into separate files with descriptive names (e.g., context.md → stakeholders.md, objectives.md, constraints.md).
Update the corresponding index.md to serve as table of contents and navigation after sharding.
This pattern maintains manageability while preserving traceability as documentation scales.

### Key principles

- Separate user documentation (diataxis framework) from development documentation (AMDiRE methodology)
- User docs focus on helping users learn, accomplish tasks, understand concepts, and find reference information
- Development docs provide traceability: context (why) → requirements (what) → architecture (how) → work items (implementation)
- Work items bridge planning to execution with workflow state tracking (backlog → active → completed)
- Maintain bidirectional traceability between requirements, architecture decisions, and implementation artifacts
- Reference GitHub issues, pull requests, ADRs, RFCs, or RFDs in completed work items for full audit trail
