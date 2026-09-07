import copy
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


readback = runpy.run_path(str(Path(__file__).with_name("linear-readback.py")))["readback"]


class LinearReadbackChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        proposal = self.root / "openspec/changes/deploy-omnigent-magnetite/proposal.md"
        proposal.parent.mkdir(parents=True)
        proposal.write_text('---\nlinear_story_identifier: CAM-99\nlinear_story_id: issue-id\n---\n')
        (self.root / "openspec/linear.yaml").write_text(
            'workspace:\n  slug: "stored-workspace"\nprojects:\n  "omnigent-magnetite":\n    name: "omnigent-magnetite"\n    id: "test-slug"\n'
        )
        self.issue = {
            "id": "issue-id", "identifier": "CAM-99",
            "team": {"id": "team-id", "key": "CAM"},
            "project": {"id": "project-id", "name": "omnigent-magnetite", "slugId": "test-slug"},
            "state": {"id": "state-id", "name": "Todo", "type": "unstarted"},
        }
        self.environment = patch.dict(os.environ, {key: value for key, value in os.environ.items() if key != "LINEAR_API_KEY"}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def response(self, issue):
        return subprocess.CompletedProcess([], 0, json.dumps({"data": {"issue": issue}}), "")

    def test_identifier_comes_from_proposal_and_receipt_is_sanitized(self):
        issue = {**self.issue, "description": "must not be retained"}
        with patch("subprocess.run", return_value=self.response(issue)) as cli:
            self.assertEqual(readback(self.root), self.issue)
        args, options = cli.call_args
        self.assertEqual(args[0], ["linear", "api", "--workspace", "stored-workspace", "--variable", "issueId=CAM-99"])
        self.assertIn("query($issueId: String!)", options["input"])
        self.assertNotIn("mutation", options["input"])
        self.assertEqual(options["timeout"], 60)
        self.assertTrue(options["capture_output"])
        self.assertEqual(options["cwd"], self.root)
        self.assertEqual(options["env"]["LINEAR_IGNORE_ENV_FILE"], "1")
        self.assertEqual(options["env"]["LINEAR_DEBUG"], "0")
        self.assertNotIn("LINEAR_API_KEY", options["env"])

    def test_stored_workspace_does_not_conflict_with_inherited_api_key(self):
        with patch.dict(os.environ, {"LINEAR_API_KEY": "mock-key"}), patch("subprocess.run", return_value=self.response(self.issue)) as cli:
            self.assertEqual(readback(self.root), self.issue)
        self.assertNotIn("LINEAR_API_KEY", cli.call_args.kwargs["env"])

    def test_wrong_binding_is_rejected(self):
        for path in [("id",), ("identifier",), ("team", "key"), ("project", "name"), ("project", "slugId")]:
            with self.subTest(path=path):
                issue = copy.deepcopy(self.issue)
                target = issue if len(path) == 1 else issue[path[0]]
                target[path[-1]] = "wrong"
                with patch("subprocess.run", return_value=self.response(issue)):
                    with self.assertRaisesRegex(ValueError, "binding differs"):
                        readback(self.root)

    def test_unauthenticated_cli_exits_nonzero_without_exposing_response(self):
        cli = self.root / "linear"
        for diagnostic in ["No API key configured", 'Workspace "stored-workspace" not found in credentials.']:
            with self.subTest(diagnostic=diagnostic):
                cli.write_text(f"#!/usr/bin/env python3\nimport sys\nsys.exit({diagnostic + ' private details'!r})\n")
                cli.chmod(0o700)
                result = subprocess.run(
                    [sys.executable, str(Path(__file__).with_name("linear-readback.py").resolve()), str(self.root)],
                    cwd=self.root.parent, capture_output=True, text=True, timeout=60,
                    env={**os.environ, "PATH": f"{self.root}{os.pathsep}{os.environ['PATH']}"},
                )
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stdout, "")
                self.assertIn("Linear readback CLI unauthenticated", result.stderr)
                self.assertIn("linear auth login", result.stderr)
                self.assertNotIn("private details", result.stderr)

    def test_failed_cli_and_graphql_errors_do_not_expose_response(self):
        for response in [subprocess.CompletedProcess([], 1, "private stdout", "private stderr"),
                         subprocess.CompletedProcess([], 0, '{"errors":[{"message":"private"}]}', "")]:
            with patch("subprocess.run", return_value=response):
                with self.assertRaisesRegex(ValueError, "response omitted") as error:
                    readback(self.root)
                self.assertNotIn("private", str(error.exception))

    def test_incomplete_observation_is_not_accepted(self):
        for issue in [None, {}, {**self.issue, "state": None}, {**self.issue, "id": ""}]:
            with patch("subprocess.run", return_value=self.response(issue)):
                with self.assertRaises((KeyError, TypeError, ValueError)):
                    readback(self.root)

    def test_timeout_is_bounded(self):
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("linear", 60)):
            with self.assertRaises(subprocess.TimeoutExpired):
                readback(self.root)


if __name__ == "__main__":
    unittest.main()
