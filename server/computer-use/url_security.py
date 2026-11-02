"""Validation shared by the scoring API, browser, and Lighthouse worker."""
import asyncio
import ipaddress
import os
import re
import socket
from urllib.parse import urljoin, urlparse, urlunparse

import httpx


def allow_private_targets() -> bool:
    return os.getenv("ALLOW_PRIVATE_TARGETS", "").lower() == "true"


def normalize_github_url(value: str) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("A GitHub repository URL is required")
    parsed = urlparse(value.strip())
    match = re.fullmatch(r"/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/?", parsed.path)
    if (
        parsed.scheme not in ("http", "https") or parsed.hostname != "github.com"
        or parsed.username or parsed.password or parsed.port
        or parsed.query or parsed.fragment or not match
    ):
        raise ValueError("Expected https://github.com/owner/repository")
    repository = match[2].removesuffix(".git")
    if match[1] in (".", "..") or repository in ("", ".", ".."):
        raise ValueError("Invalid GitHub repository path")
    return f"https://github.com/{match[1]}/{repository}"


def validate_url_syntax(value: str) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("Website URL must be at most 2048 characters")
    parsed = urlparse(value.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Website URL must use HTTP or HTTPS")
    if parsed.username or parsed.password:
        raise ValueError("Website URLs must not include credentials")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Website URL has an invalid port") from exc
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("Website URL has an invalid port")
    host = parsed.hostname.rstrip(".").lower()
    if not allow_private_targets():
        if host in ("localhost", "metadata.google.internal") or host.endswith(
            (".localhost", ".local", ".internal", ".home.arpa")
        ):
            raise ValueError("Website must be on the public internet")
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError("Website must not use a private or special-use IP address")
    return urlunparse(parsed._replace(fragment=""))


async def assert_public_host(value: str) -> str:
    value = validate_url_syntax(value)
    if allow_private_targets():
        return value
    parsed = urlparse(value)
    loop = asyncio.get_running_loop()
    try:
        addresses = await asyncio.wait_for(loop.getaddrinfo(
            parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        ), timeout=10)
    except (OSError, asyncio.TimeoutError) as exc:
        raise ValueError("Website hostname could not be resolved") from exc
    if not addresses:
        raise ValueError("Website hostname has no public addresses")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0].split("%")[0])
        if not ip.is_global or (ip.version == 6 and ip.ipv4_mapped and not ip.ipv4_mapped.is_global):
            raise ValueError("Website hostname resolves to a private or special-use address")
    return value


async def ensure_public_url(value: str) -> str:
    """Resolve and validate each redirect before opening the page in Chromium."""
    current = value
    async with httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False) as client:
        for _ in range(6):
            current = await assert_public_host(current)
            async with client.stream("GET", current, headers={
                "User-Agent": "HackX-Evaluator/2", "Range": "bytes=0-1023",
            }) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    location = response.headers.get("location")
                    if not location:
                        raise ValueError("Website returned a redirect without a destination")
                    current = urljoin(current, location)
                    continue
                if response.status_code >= 400:
                    raise ValueError(f"Website returned HTTP {response.status_code}")
                return current
    raise ValueError("Website has too many redirects")
