"""Real FastAPI routes and filesystem integration in disposable directories.

No storage methods are asserted directly; requests exercise validation,
resource responses and persistence across app recreation.
"""
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent.plugin_composition import DashboardContext
from core.common.file_io import run_file_io
from plugins.shell_ui.appearance import APPEARANCE, ASSET_BASE, BASE, Store, register


def client_for(root):
    store = Store(root)

    async def operate(operation, argument):
        return await run_file_io(lambda: store.operate(operation, argument))

    app = FastAPI()
    services = {APPEARANCE: operate}
    register(app, DashboardContext(
        plugin_id="shell-ui", plugin_dir=Path("plugins/shell_ui"),
        data_root=root, validation=False, _resolve=services.__getitem__,
    ))
    return TestClient(app)


def settings(config):
    return {"brand": {key: config["brand"][key] for key in ("name", "icon_mode", "icon_preset")},
            "fonts": {key: config["fonts"][key] for key in ("reading", "ui", "technical")}}


def test_font_persistence_role_isolation_and_delete_fallback(tmp_path):
    client = client_for(tmp_path)
    font = Path("packages/akashic-theme/assets/fonts/JetBrainsMono.woff2").read_bytes()
    response = client.post(BASE + "/fonts?filename=example.woff2&label=Example", content=font)
    assert response.status_code == 200
    config = response.json()
    uploaded = config["fonts"]["uploaded"][0]
    config["fonts"]["reading"] = {"mode": "uploaded", "value": uploaded["id"]}
    config["fonts"]["technical"] = {"mode": "preset", "value": "system-mono"}
    config["brand"]["name"] = "我的书房"
    assert client.put(BASE, json=settings(config)).status_code == 200
    persisted = {path.relative_to(tmp_path): path.read_bytes()
                 for path in tmp_path.rglob("*") if path.is_file()}
    restarted = client_for(tmp_path)
    loaded = restarted.get(BASE).json()
    assert loaded["brand"]["name"] == "我的书房"
    assert loaded["fonts"]["reading"]["value"] == uploaded["id"]
    asset = restarted.get(ASSET_BASE + f'/font?font_id={uploaded["id"]}&v={uploaded["sha"]}')
    assert asset.content == font
    assert "immutable" in asset.headers["cache-control"]
    assert restarted.get(ASSET_BASE + f'/font?font_id={uploaded["id"]}&v=old').status_code == 404
    assert {path.relative_to(tmp_path): path.read_bytes()
            for path in tmp_path.rglob("*") if path.is_file()} == persisted
    deleted = restarted.delete(BASE + f'/fonts/{uploaded["id"]}').json()
    assert deleted["fonts"]["reading"] == {"mode": "preset", "value": "default"}
    assert deleted["fonts"]["ui"]["value"] == "default"
    assert deleted["fonts"]["technical"]["value"] == "system-mono"
    assert not list((tmp_path / "appearance/fonts").iterdir())


def test_icon_cache_replacement_reset_and_input_whitelist(tmp_path):
    client = client_for(tmp_path)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>'
    config = client.post(BASE + "/brand-icon?filename=logo.svg", content=svg).json()
    assert config["brand"]["icon_mode"] == "custom"
    asset = client.get(ASSET_BASE + "/brand?v=" + config["brand"]["custom_icon_sha"])
    assert asset.content == svg
    assert "sandbox" in asset.headers["content-security-policy"]
    assert client.post(BASE + "/brand-icon?filename=bad.png", content=svg).status_code == 422
    assert client.post(BASE + "/brand-icon?filename=logo.svg", content=b"x" * (512 * 1024 + 1)).status_code == 413
    invalid = settings(config)
    invalid["brand"]["custom_icon_file"] = "../../secret"
    assert client.put(BASE, json=invalid).status_code == 422
    invalid = settings(client.get(BASE).json())
    invalid["fonts"]["ui"] = {"mode": "uploaded", "value": "missing"}
    assert client.put(BASE, json=invalid).status_code == 422
    reset = client.delete(BASE + "/brand-icon").json()
    assert reset["brand"]["icon_mode"] == "preset"
    assert reset["brand"]["custom_icon_file"] is None
    assert client.get(ASSET_BASE + "/brand").status_code == 404



def test_retired_icon_presets_fall_back_on_read(tmp_path):
    client = client_for(tmp_path)
    # Existing persisted input is seeded as a file, then observed only via HTTP.
    config = client.get(BASE).json()
    config.pop("presets")
    config.pop("icon_presets")
    directory = tmp_path / "appearance"
    directory.mkdir()
    for preset in ("orbit", "diamond", "book"):
        config["brand"]["icon_preset"] = preset
        original = json.dumps(config, ensure_ascii=False).encode("utf-8")
        (directory / "config.json").write_bytes(original)
        loaded = client.get(BASE).json()
        assert loaded["brand"]["icon_preset"] == "default"
        assert loaded["icon_presets"] == ["default"]
        invalid = settings(loaded)
        invalid["brand"]["icon_preset"] = preset
        assert client.put(BASE, json=invalid).status_code == 422
        assert (directory / "config.json").read_bytes() == original


def test_font_upload_accepts_50_mb_and_rejects_larger(tmp_path):
    client = client_for(tmp_path)
    font = b"wOF2" + bytes(50 * 1024 * 1024 - 4)
    assert client.post(BASE + "/fonts?filename=large.woff2", content=font).status_code == 200
    assert client.post(BASE + "/fonts?filename=large.woff2", content=font + b"x").status_code == 413
