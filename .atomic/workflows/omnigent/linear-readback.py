import json
import os
from pathlib import Path
import subprocess
import sys

import yaml


QUERY = """query($issueId: String!) {
  issue(id: $issueId) {
    id identifier team { id key } project { id name slugId }
    state { id name type }
  }
}
"""


def readback(root: Path) -> dict:
    registry = yaml.safe_load((root / "openspec/linear.yaml").read_text())
    workspace = registry["workspace"]["slug"]
    proposal = (root / "openspec/changes/deploy-omnigent-magnetite/proposal.md").read_text()
    if not proposal.startswith("---\n"):
        raise ValueError("Proposal has no YAML frontmatter")
    binding = yaml.safe_load(proposal.split("---", 2)[1])
    identifier = binding["linear_story_identifier"]
    project = registry["projects"]["omnigent-magnetite"]
    if not isinstance(identifier, str) or not identifier.startswith("CAM-") or not identifier[4:].isdigit():
        raise ValueError("Proposal must name a CAM issue identifier")
    result = subprocess.run(
        ["linear", "api", "--workspace", workspace, "--variable", f"issueId={identifier}"],
        input=QUERY, text=True, capture_output=True, timeout=60,
        env={**{key: value for key, value in os.environ.items() if key != "LINEAR_API_KEY"},
             "LINEAR_IGNORE_ENV_FILE": "1", "LINEAR_DEBUG": "0"},
        cwd=root,
    )
    if result.returncode:
        if any(message in result.stderr for message in ("No API key configured", "not found in credentials")):
            raise ValueError("Linear readback CLI unauthenticated; run `linear auth login` for the registry workspace; response omitted")
        raise ValueError(f"Linear readback CLI failed (exit {result.returncode}); response omitted")
    payload = json.loads(result.stdout)
    if payload.get("errors"):
        raise ValueError("Linear readback returned GraphQL errors; response omitted")
    issue = payload["data"]["issue"]
    receipt = {
        "id": issue["id"], "identifier": issue["identifier"],
        "team": {key: issue["team"][key] for key in ("id", "key")},
        "project": {key: issue["project"][key] for key in ("id", "name", "slugId")},
        "state": {key: issue["state"][key] for key in ("id", "name", "type")},
    }
    if any(not isinstance(value, str) or not value for part in receipt.values()
           for value in (part.values() if isinstance(part, dict) else [part])):
        raise ValueError("Linear readback identifiers/state are incomplete")
    if (receipt["identifier"] != identifier or receipt["id"] != binding["linear_story_id"]
            or receipt["team"]["key"] != "CAM"
            or receipt["project"]["name"] != project["name"]
            or receipt["project"]["slugId"] != project["id"]):
        raise ValueError("Linear issue/team/project binding differs from proposal or registry")
    return receipt


if __name__ == "__main__":
    try:
        print(json.dumps(readback(Path(sys.argv[1])), sort_keys=True))
    except ValueError as error:
        message = "Linear readback returned invalid JSON" if isinstance(error, json.JSONDecodeError) else str(error)
        sys.exit(message)
    except subprocess.TimeoutExpired:
        sys.exit("Linear readback timed out after 60 seconds")
    except (OSError, KeyError, TypeError, IndexError, yaml.YAMLError):
        sys.exit("Linear readback could not read the CLI, binding files, or expected JSON fields; response omitted")
