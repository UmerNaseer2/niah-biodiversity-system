#!/usr/bin/env python3
"""
move-secrets.py - used by install-edge.sh on an edge installed before secrets.toml

  python3 tools/move-secrets.py CONFIG EXAMPLE SECRETS [THING_CREDENTIALS]

Writes SECRETS (mode 0600; install-edge.sh then gives iotedge read access) from
EXAMPLE, filled in with the values found in CONFIG: edge_id, [mqtt] password and
[cloud] function_url / edge_key / anon_key, plus the node password from the old
THING_CREDENTIALS file. Then takes those lines out of CONFIG. The values
themselves don't change, so nodes, Mosquitto and Supabase carry on as before.

Exit code 3: CONFIG has no edge_key, so there is nothing to move.
"""

import json
import os
import re
import sys
import tomllib

# (section, key) in config.toml -> key in secrets.toml; None = top level
MOVED = {
    ("cloud", "function_url"): "supabase_function_url",
    ("cloud", "anon_key"): "supabase_anon_key",
    (None, "edge_id"): "edge_id",
    ("cloud", "edge_key"): "edge_key",
    ("mqtt", "password"): "mqtt_password",
}


def main():
    cfg_path, example_path, out_path = sys.argv[1:4]
    creds_path = sys.argv[4] if len(sys.argv) > 4 else ""
    with open(cfg_path, "rb") as f:
        cfg = tomllib.load(f)
    if not cfg.get("cloud", {}).get("edge_key"):
        sys.exit(3)

    values = {}
    for (section, key), name in MOVED.items():
        v = (cfg if section is None else cfg.get(section, {})).get(key)
        if v is not None:
            values[name] = str(v)
    if creds_path and os.path.exists(creds_path):
        for line in open(creds_path):
            if line.startswith("MQTT password for the ESP32:"):
                values["node_secret"] = line.split(":", 1)[1].strip()
    if "node_secret" not in values:
        print(f"    note: no node password found in {creds_path or '(none given)'}; "
              f"set node_secret in {out_path} by hand")
        values["node_secret"] = ""

    # the example with its comments, each value replaced (a JSON string is a valid TOML string)
    out = []
    for line in open(example_path):
        m = re.match(r"^(\w+)(\s*=\s*)", line)
        if m and m.group(1) in values:
            line = f"{m.group(1)}{m.group(2)}{json.dumps(values[m.group(1)])}\n"
        out.append(line)
    old_umask = os.umask(0o077)
    try:
        with open(out_path, "w") as f:
            f.write("".join(out))
    finally:
        os.umask(old_umask)

    # take the moved lines out of config.toml (its owner and mode stay as they are)
    section, kept = None, []
    for line in open(cfg_path):
        s = re.match(r"^\s*\[([^\]]+)\]", line)
        if s:
            section = s.group(1).strip()
        k = re.match(r"^\s*(\w+)\s*=", line)
        if k and (section, k.group(1)) in MOVED:
            continue
        kept.append(line)
    with open(cfg_path, "w") as f:
        f.write("".join(kept))


if __name__ == "__main__":
    main()
