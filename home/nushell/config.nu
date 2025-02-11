$env.config = {
  edit_mode: vi
}

# see https://youtu.be/KF5dtxVsn1E?t=996
def gj [] {
  git log | jc --git-log | from json
}

def gjt [lines: int = 1] {
  git log | jc --git-log | from json | take $lines | transpose
}
