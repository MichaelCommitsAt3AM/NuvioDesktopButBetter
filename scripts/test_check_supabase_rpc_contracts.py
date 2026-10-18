"""Regression coverage for upstream RPC call styles and deferred services."""
import unittest
import check_supabase_rpc_contracts as contracts


class RpcCallsTest(unittest.TestCase):
    def test_positional_and_named_functions_are_scanned(self):
        source = 'rpc("sync_pull_profiles", params); rpc(function = "sync_push_media_servers", parameters = body)'
        self.assertEqual(set(contracts.RPC_CALL.findall(source)), {"sync_pull_profiles", "sync_push_media_servers"})

    def test_party_wrapper_calls_are_scanned(self):
        self.assertEqual(contracts.PARTY_CALL.findall('call("watch_party_create", body)'), ["watch_party_create"])

    def test_deferred_services_do_not_exempt_existing_profile_sync(self):
        self.assertIn("watch_party_create", contracts.UPSTREAM_ONLY_RPCS)
        self.assertIn("sync_push_media_servers", contracts.UPSTREAM_ONLY_RPCS)
        self.assertNotIn("sync_push_profiles", contracts.UPSTREAM_ONLY_RPCS)


if __name__ == "__main__":
    unittest.main()
