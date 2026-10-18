import tempfile
import socket
import tomllib
import unittest
from pathlib import Path

from prepare_supabase_upgrade_config import prepare_config


class UpgradeConfigTest(unittest.TestCase):
    def test_changes_only_the_temporary_project_and_db_port_and_skips_busy_ports(self):
        with tempfile.TemporaryDirectory() as root, socket.socket() as busy:
            busy.bind(("0.0.0.0", 0))
            busy_port = busy.getsockname()[1]
            original = Path(root) / "original.toml"
            config = Path(root) / "config.toml"
            contents = 'project_id = "NuvioDesktop"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n'
            original.write_text(contents)
            config.write_text(contents)
            selected = prepare_config(config, "nuvio-upgrade-test", [busy_port, *range(15432, 15532)])
            parsed = tomllib.loads(config.read_text())
            self.assertNotEqual(selected, busy_port)
            self.assertLess(selected, 32768)
            self.assertEqual(parsed["project_id"], "nuvio-upgrade-test")
            self.assertEqual(parsed["db"]["port"], selected)
            self.assertEqual(parsed["api"]["port"], 54321)
            self.assertEqual(parsed["db"]["shadow_port"], 54320)
            self.assertEqual(original.read_text(), contents)

    def test_fails_instead_of_reusing_an_occupied_port(self):
        with tempfile.TemporaryDirectory() as root, socket.socket() as busy:
            busy.bind(("0.0.0.0", 0))
            config = Path(root) / "config.toml"
            contents = 'project_id = "NuvioDesktop"\n[db]\nport = 54322\n'
            config.write_text(contents)
            with self.assertRaises(RuntimeError):
                prepare_config(config, "nuvio-upgrade-test", [busy.getsockname()[1]])
            self.assertEqual(config.read_text(), contents)


if __name__ == "__main__":
    unittest.main()
