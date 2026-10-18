"""Isolate the disposable upgrade database from other local services."""

import re
import socket
import sys
import tomllib
from pathlib import Path


def prepare_config(path: Path, project_id: str, ports=range(15432, 15532)) -> int:
    config = path.read_text(encoding="utf-8")
    for port in ports:
        try:
            with socket.socket() as probe:
                probe.bind(("0.0.0.0", port))
        except OSError:
            continue
        break
    else:
        raise RuntimeError("No free database port in the upgrade test's reserved range")

    # Stay below Linux's usual ephemeral range (32768+) so image downloads
    # cannot claim Supabase's default 54322 as an outbound connection port.
    config, projects = re.subn(r'^project_id\s*=.*$', f'project_id = "{project_id}"', config, count=1, flags=re.M)
    config, databases = re.subn(r'(^\[db\][ \t]*\n.*?^port[ \t]*=[ \t]*)\d+', lambda match: f'{match[1]}{port}', config, count=1, flags=re.M | re.S)
    parsed = tomllib.loads(config)
    if projects != 1 or databases != 1 or parsed["project_id"] != project_id or parsed["db"]["port"] != port:
        raise ValueError("Could not isolate the temporary Supabase configuration")
    path.write_text(config, encoding="utf-8")
    return port


if __name__ == "__main__":
    selected_port = prepare_config(Path(sys.argv[1]), sys.argv[2])
    print(f"Upgrade test database: project={sys.argv[2]} port={selected_port}")
