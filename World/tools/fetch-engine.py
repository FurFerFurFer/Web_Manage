#!/usr/bin/env python3
"""Fetch the specifically approved engine. No package manager or install scripts.

Run only with user approval. Verifies the published npm SHA-512 before extracting
the named browser bundle and attribution files; never unpacks arbitrary paths.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

VERSION = "9.25.0"
SOURCE = "https://registry.npmjs.org/babylonjs/-/babylonjs-9.25.0.tgz"
INTEGRITY = "1hqtHr21ahlOYePM/DeWqhO4kUh9LPrbSjefTjdnSkmKnNqt8eYAxkFDYwk88hLUzY2FhPx7WJBG6ZRshCIxMQ=="
TARGET = Path(__file__).resolve().parents[1] / "vendor" / ("babylonjs-" + VERSION)


def main():
    if TARGET.exists():
        raise SystemExit(f"Refusing to replace existing dependency: {TARGET}")
    with urllib.request.urlopen(SOURCE, timeout=60) as response:
        payload = response.read(50 * 1024 * 1024 + 1)
    if len(payload) > 50 * 1024 * 1024:
        raise SystemExit("Archive exceeds the 50 MiB download ceiling")
    if base64.b64encode(hashlib.sha512(payload).digest()).decode() != INTEGRITY:
        raise SystemExit("Archive integrity mismatch; no dependency written")
    files = {}
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            if member.name == "package/babylon.js":
                files["babylon.js"] = archive.extractfile(member).read()
            elif member.name.lower() in ("package/license.md", "package/license", "package/license.txt",
                                          "package/notice.md", "package/notice", "package/notice.txt"):
                files[Path(member.name).name] = archive.extractfile(member).read()
    if "babylon.js" not in files or not any(name.lower().startswith("license") for name in files):
        raise SystemExit("Expected browser bundle and license missing; no dependency written")
    # NOTICE accompanies the source distribution even when npm omits it.
    if not any(name.lower().startswith("notice") for name in files):
        notice_url = f"https://raw.githubusercontent.com/BabylonJS/Babylon.js/{VERSION}/NOTICE.md"
        with urllib.request.urlopen(notice_url, timeout=30) as response:
            files["NOTICE.md"] = response.read(1024 * 1024)
    receipt = {
        "name": "babylonjs", "version": VERSION, "license": "Apache-2.0",
        "source": SOURCE, "archiveIntegrity": "sha512-" + INTEGRITY,
        "archiveBytes": len(payload),
        "files": {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                  for name, data in files.items()},
    }
    TARGET.mkdir(parents=True)
    for name, data in files.items():
        (TARGET / name).write_bytes(data)
    (TARGET / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
