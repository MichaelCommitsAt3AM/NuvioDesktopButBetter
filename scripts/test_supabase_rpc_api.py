#!/usr/bin/env python3
"""Smoke-test device and library RPC contracts through local PostgREST."""

from __future__ import annotations

import json
import os
import sys
import uuid
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


API_URL = os.environ["API_URL"].rstrip("/")
ANON_KEY = os.environ["ANON_KEY"]
SERVICE_ROLE_KEY = os.environ["SERVICE_ROLE_KEY"]


def request_json(
    method: str,
    url: str,
    *,
    body: Any | None = None,
    apikey: str,
    bearer: str | None = None,
) -> Any:
    payload = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"apikey": apikey}
    if bearer is not None:
        headers["Authorization"] = f"Bearer {bearer}"
    if payload is not None:
        headers["Content-Type"] = "application/json"

    request = Request(url, data=payload, headers=headers, method=method)
    try:
        with urlopen(request, timeout=20) as response:
            response_body = response.read()
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"{method} {url} returned HTTP {error.code}: {error_body}"
        ) from error

    if not response_body:
        return None
    return json.loads(response_body)


def rpc(name: str, token: str, body: dict[str, Any]) -> Any:
    return request_json(
        "POST",
        f"{API_URL}/rest/v1/rpc/{name}",
        body=body,
        apikey=ANON_KEY,
        bearer=token,
    )


def main() -> int:
    email = f"rpc-contract-{uuid.uuid4().hex}@example.invalid"
    password = f"Nuvio-{uuid.uuid4().hex}-A1!"
    user_id: str | None = None

    try:
        created_user = request_json(
            "POST",
            f"{API_URL}/auth/v1/admin/users",
            body={
                "email": email,
                "password": password,
                "email_confirm": True,
            },
            apikey=SERVICE_ROLE_KEY,
            bearer=SERVICE_ROLE_KEY,
        )
        user_id = created_user["id"]

        session = request_json(
            "POST",
            f"{API_URL}/auth/v1/token?grant_type=password",
            body={"email": email, "password": password},
            apikey=ANON_KEY,
        )
        token = session["access_token"]

        rpc(
            "register_current_device",
            token,
            {
                "p_installation_id": "api-smoke-installation",
                "p_client_name": "Nuvio Desktop",
                "p_client_version": "api-smoke",
                "p_platform": "API test",
                "p_device_name": "Local Supabase",
            },
        )

        initial_cursor = rpc(
            "sync_get_library_delta_cursor",
            token,
            {"p_profile_id": 1},
        )
        if initial_cursor != 0:
            raise AssertionError(
                f"Expected scalar cursor 0, received {initial_cursor!r}"
            )

        rpc(
            "sync_push_library_items",
            token,
            {
                "p_profile_id": 1,
                "p_items": [
                    {
                        "content_id": "api-item",
                        "content_type": "movie",
                        "name": "API Movie",
                        "genres": ["Drama"],
                        "added_at": 1,
                    },
                    {
                        "content_id": "api-item",
                        "content_type": "series",
                        "name": "API Series",
                        "genres": ["Drama"],
                        "added_at": 2,
                    },
                ],
                "p_origin_client_id": "api-smoke",
            },
        )

        upsert_cursor = rpc(
            "sync_get_library_delta_cursor",
            token,
            {"p_profile_id": 1},
        )
        if not isinstance(upsert_cursor, int) or upsert_cursor <= 0:
            raise AssertionError(
                f"Expected a positive integer cursor, received {upsert_cursor!r}"
            )

        initial_delta = rpc(
            "sync_pull_library_delta",
            token,
            {
                "p_profile_id": 1,
                "p_since_event_id": 0,
                "p_limit": 500,
            },
        )
        if len(initial_delta) != 2:
            raise AssertionError(
                f"Expected two upsert events, received {initial_delta!r}"
            )
        if [event["operation"] for event in initial_delta] != ["upsert", "upsert"]:
            raise AssertionError(f"Unexpected upsert operations: {initial_delta!r}")
        if [event["event_id"] for event in initial_delta] != sorted(
            event["event_id"] for event in initial_delta
        ):
            raise AssertionError(f"Delta events are not cursor ordered: {initial_delta!r}")

        rpc(
            "sync_delete_library_items",
            token,
            {
                "p_profile_id": 1,
                "p_keys": [
                    {
                        "content_id": "api-item",
                        "content_type": "series",
                    }
                ],
                "p_origin_client_id": "api-smoke",
            },
        )

        delete_delta = rpc(
            "sync_pull_library_delta",
            token,
            {
                "p_profile_id": 1,
                "p_since_event_id": upsert_cursor,
                "p_limit": 500,
            },
        )
        if len(delete_delta) != 1 or delete_delta[0]["operation"] != "delete":
            raise AssertionError(
                f"Expected one deletion tombstone, received {delete_delta!r}"
            )

        print("PostgREST RPC smoke test passed.")
        return 0
    finally:
        if user_id is not None:
            try:
                request_json(
                    "DELETE",
                    f"{API_URL}/auth/v1/admin/users/{user_id}",
                    apikey=SERVICE_ROLE_KEY,
                    bearer=SERVICE_ROLE_KEY,
                )
            except Exception as error:
                print(f"Warning: failed to remove API test user: {error}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
