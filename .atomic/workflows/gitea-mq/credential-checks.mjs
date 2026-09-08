import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

/** Apply to the outer shell command AND commands captured inside Python. */
export function assertRetrySafe(commands) {
  for (const command of commands) assert(!/(?:--method\s+(?:POST|PUT|DELETE)\b|\bjj\s|\bgit\s+push\b|\bclan\s|\bterraform\b|\bssh\b[^\n]*\bsystemctl\b)/.test(command), `Retryable callback contains effect: ${command}`);
}

/** Follow callback → helper → embedded-script identifiers, not just node names.
 * Normalize quoted Python argv arrays as well as outer shell command text. */
export function assertRetryableCallbacks(ts, main, source, toolOptions) {
  const helpers = ts.createSourceFile("tools.ts", source, ts.ScriptTarget.ES2022, true);
  const definitions = new Map();
  for (const statement of helpers.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) definitions.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) definitions.set(declaration.name.text, declaration);
  }
  const entry = ts.createSourceFile("entry.ts", main, ts.ScriptTarget.ES2022, true);
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(entry) === "tool" && ts.isStringLiteral(node.arguments[0]) && toolOptions.get(node.arguments[0].text)?.retriesAllowed) {
      const seen = new Set(), scripts = [];
      const expand = (part, file) => {
        scripts.push(part.getText(file).replace(/['"`,\[\]]+/g, " ").replace(/[ \t]+/g, " "));
        const follow = (child) => {
          if (ts.isIdentifier(child) && definitions.has(child.text) && !seen.has(child.text)) {
            seen.add(child.text); expand(definitions.get(child.text), helpers);
          }
          ts.forEachChild(child, follow);
        };
        ts.forEachChild(part, follow);
      };
      expand(node.arguments[1], entry); assertRetrySafe(scripts);
    }
    ts.forEachChild(node, visit);
  };
  visit(entry);
}

// Execute the real nested Python, but subprocess.run is a closed fake: no gh,
// clan, openssl, shell, or remote command ever executes. Only local temp files.
const driver = `import contextlib,io,json,os,subprocess,sys,tempfile
payload=json.load(sys.stdin)
commands=[]; posts=0; fail_get=False
class Result:
    returncode=0; stderr=b''
    def __init__(self, value): self.stdout=value
def fake(argv, **kw):
    global posts
    commands.append(' '.join(argv))
    if argv[0]=='clan': return Result(b'fake-private-key')
    if argv[0]=='openssl': return Result(b'fake-signature')
    assert argv[:2]==['gh','api'], argv
    path=argv[-1]
    if 'POST' in argv:
        posts+=1; value={'token':'SECRET-SENTINEL','expires_at':'2099-01-01T00:00:00Z'}
    elif path.endswith('/installation'): value={'id':20,'app_id':1234,'repository_selection':'selected'}
    elif path.startswith('/installation/repositories'):
        if fail_get: raise RuntimeError('injected GET failure')
        value={'total_count':1,'repositories':[{'full_name':'cameronraysmith/vanixiets'}]}
    else: raise AssertionError(argv)
    return Result(json.dumps(value).encode())
subprocess.run=fake
with tempfile.TemporaryDirectory() as directory:
    token=os.path.join(directory,'token.json')
    def execute(script,args):
        sys.argv=['probe']+[token if a=='$TOKEN' else a for a in args]
        output=io.StringIO()
        try:
            with contextlib.redirect_stdout(output),contextlib.redirect_stderr(io.StringIO()): exec(script,{'__name__':'__main__'})
            return output.getvalue(), 0
        except SystemExit as error: return output.getvalue(), error.code
    if payload.get('mint'):
        result,code=execute(payload['mint'],['1234','$TOKEN'])
        assert code==0
        assert os.stat(token).st_mode & 0o777 == 0o600
        assert 'SECRET-SENTINEL' not in result
        # A completed mint can be resumed without issuing another POST.
        execute(payload['mint'],['1234','$TOKEN'])
        assert posts==1
    mint_commands=commands[:]; commands.clear()
    args=payload['args']
    fail_get=True
    execute(payload['read'],args)
    fail_get=False
    result,code=execute(payload['read'],args)
    assert code==0
    read_commands=commands[:]
    if payload.get('mint'):
        with open(token,'w') as file: json.dump({},file)
        _,bad=execute(payload['mint'],['1234','$TOKEN'])
        assert bad!=0 and posts==1, 'incomplete mint must not POST again'
        _,bad=execute(payload['read'],args)
        assert bad!=0 and commands==read_commands, 'incomplete credentials must not probe'
    print(json.dumps({'mint':mint_commands,'read':read_commands,'posts':posts,'result':result}))
`;

export function runCredentialChecks(tools) {
  for (const command of ["gh api --method POST /tokens", "gh api --method PUT /rules", "gh api --method DELETE /ref", "jj log", "git push origin main", "clan vars get host key", "terraform plan", "ssh root@host systemctl status queue"]) {
    assert.throws(() => assertRetrySafe([command]), /Retryable callback contains effect/);
  }
  const trace = JSON.parse(execFileSync("python3", ["-c", driver], {
    input: JSON.stringify({ mint: tools.mintAppScript, read: tools.installationScript ?? tools.appScript, args: tools.installationScript ? ["$TOKEN", "1234"] : ["1234", "installation"] }), encoding: "utf8",
  }));
  // On the old code, the nested installation callback contains clan and POST.
  assertRetrySafe(trace.read);
  assert.equal(trace.posts, 1, "GET retry must not mint another token");
  assert(trace.mint.some((command) => command.includes("--method POST /app/installations/20/access_tokens")));
  assert.equal(JSON.parse(trace.result).installation_id, 20);
  assert(!JSON.stringify(trace).includes("SECRET-SENTINEL"), "Token must not enter output/command receipts");
  console.log("PASS F1 nested commands: mint once; failed GET then retry performs GET only; effect denylist and secret-free receipts");
}
