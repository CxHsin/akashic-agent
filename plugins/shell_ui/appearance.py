"""Shell-owned persistent appearance settings and bounded binary uploads."""
from __future__ import annotations

import hashlib
import re
import threading
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from agent.plugin_composition import Context, DashboardContext, ServiceKey
from core.common.file_io import run_file_io

PRESETS = {"reading": ["default", "system-sans", "system-serif", "kai"],
           "ui": ["default", "serif", "mono"], "technical": ["default", "system-mono"]}
ICONS = ["default"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Selection(Model):
    mode: Literal["preset", "uploaded"] = "preset"
    value: str = "default"


class Brand(Model):
    name: str = Field(default="", max_length=80)
    icon_mode: Literal["preset", "custom"] = "preset"
    icon_preset: str = "default"


class Fonts(Model):
    reading: Selection = Field(default_factory=Selection)
    ui: Selection = Field(default_factory=Selection)
    technical: Selection = Field(default_factory=Selection)


class Settings(Model):
    brand: Brand = Field(default_factory=Brand)
    fonts: Fonts = Field(default_factory=Fonts)


class UploadedFont(Model):
    id: str
    label: str
    file: str
    sha: str


class StoredBrand(Brand):
    custom_icon_file: str | None = None
    custom_icon_sha: str | None = None


class StoredFonts(Fonts):
    uploaded: list[UploadedFont] = Field(default_factory=list[UploadedFont])


class Config(Model):
    version: Literal[1] = 1
    brand: StoredBrand = Field(default_factory=StoredBrand)
    fonts: StoredFonts = Field(default_factory=StoredFonts)

@dataclass(frozen=True)
class Upload:
    filename: str
    label: str
    content: bytes


Result = dict[str, object] | tuple[bytes, str, str]
Appearance = Callable[[str, object], Awaitable[Result]]
APPEARANCE = ServiceKey[Appearance]("shell-ui.appearance")


class Store:
    def __init__(self, root: Path):
        self.root = root / "appearance"
        self.lock = threading.Lock()

    def read(self) -> Config:
        path = self.root / "config.json"
        config = Config.model_validate_json(path.read_text("utf-8")) if path.exists() else Config()
        if config.brand.icon_preset not in ICONS:
            config.brand.icon_preset = "default"
        return config

    def save(self, config: Config) -> dict[str, object]:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / "config.json"
        temporary = path.with_suffix(".tmp")
        _ = temporary.write_text(config.model_dump_json(indent=2), "utf-8")
        _ = temporary.replace(path)
        return self.payload(config)

    @staticmethod
    def payload(config: Config) -> dict[str, object]:
        return {**config.model_dump(), "presets": PRESETS, "icon_presets": ICONS}

    def operate(self, operation: str, argument: object) -> Result:
        with self.lock:
            config = self.read()
            if operation == "read":
                return self.payload(config)
            if operation == "update":
                settings = Settings.model_validate(argument)
                if settings.brand.icon_preset not in ICONS:
                    raise ValueError("未知图标预设")
                if settings.brand.icon_mode == "custom" and not config.brand.custom_icon_file:
                    raise ValueError("请先上传图标")
                for role in PRESETS:
                    selection = getattr(settings.fonts, role)
                    allowed = PRESETS[role] if selection.mode == "preset" else [font.id for font in config.fonts.uploaded]
                    if selection.value not in allowed:
                        raise ValueError("未知字体")
                config.brand = StoredBrand(**settings.brand.model_dump(), custom_icon_file=config.brand.custom_icon_file, custom_icon_sha=config.brand.custom_icon_sha)
                config.brand.name = config.brand.name.strip()
                config.fonts = StoredFonts(**settings.fonts.model_dump(), uploaded=config.fonts.uploaded)
            elif operation in {"icon", "font"}:
                if not isinstance(argument, Upload):
                    raise ValueError("无效上传")
                filename, label, content = argument.filename, argument.label, argument.content
                ext = Path(filename).suffix.lower()
                allowed_ext = {".svg", ".png", ".webp"} if operation == "icon" else {".woff2", ".ttf", ".otf"}
                if ext not in allowed_ext or not content:
                    raise ValueError("不支持的文件类型或空文件")
                signatures = {".png": b"\x89PNG\r\n\x1a\n", ".woff2": b"wOF2", ".ttf": b"\x00\x01\x00\x00", ".otf": b"OTTO"}
                if ext in signatures and not content.startswith(signatures[ext]):
                    raise ValueError("文件内容与扩展名不符")
                if ext == ".webp" and not (content.startswith(b"RIFF") and content[8:12] == b"WEBP"):
                    raise ValueError("无效 WebP")
                if ext == ".svg" and not re.search(rb"<svg[\s>]", content):
                    raise ValueError("无效 SVG")
                sha = hashlib.sha256(content).hexdigest()
                directory = self.root if operation == "icon" else self.root / "fonts"
                directory.mkdir(parents=True, exist_ok=True)
                file = f"brand-{sha}{ext}" if operation == "icon" else f"{uuid4().hex}{ext}"
                _ = (directory / file).write_bytes(content)
                if operation == "icon":
                    old = config.brand.custom_icon_file
                    config.brand.custom_icon_file, config.brand.custom_icon_sha = file, sha
                    config.brand.icon_mode = "custom"
                    result = self.save(config)
                    if old and old != file:
                        (self.root / old).unlink(missing_ok=True)
                    return result
                config.fonts.uploaded.append(UploadedFont(id=Path(file).stem, label=(label.strip() or Path(filename).stem)[:80], file=file, sha=sha))
            elif operation == "delete-icon":
                old = config.brand.custom_icon_file
                config.brand.custom_icon_file = config.brand.custom_icon_sha = None
                config.brand.icon_mode, config.brand.icon_preset = "preset", "default"
                result = self.save(config)
                if old:
                    (self.root / old).unlink(missing_ok=True)
                return result
            elif operation == "delete-font":
                font = next((font for font in config.fonts.uploaded if font.id == argument), None)
                if font is None:
                    raise FileNotFoundError("字体不存在")
                config.fonts.uploaded.remove(font)
                for role in PRESETS:
                    selection = getattr(config.fonts, role)
                    if selection.mode == "uploaded" and selection.value == font.id:
                        setattr(config.fonts, role, Selection())
                result = self.save(config)
                (self.root / "fonts" / font.file).unlink(missing_ok=True)
                return result
            elif operation == "asset":
                if argument == "brand":
                    file, sha, directory = config.brand.custom_icon_file, config.brand.custom_icon_sha, self.root
                else:
                    font = next((font for font in config.fonts.uploaded if font.id == argument), None)
                    file, sha, directory = (font.file, font.sha, self.root / "fonts") if font else (None, None, self.root)
                if not file or not sha:
                    raise FileNotFoundError("资源不存在")
                media = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf"}[Path(file).suffix]
                return (directory / file).read_bytes(), media, sha
            return self.save(config)


def bind(ctx: Context) -> Appearance:
    store = Store(ctx.data_root)

    async def operate(operation: str, argument: object = None) -> Result:
        return await run_file_io(lambda: store.operate(operation, argument))

    return ctx.entrypoint(operate)


inject = (APPEARANCE,)
BASE = "/api/dashboard/shell-ui/appearance"
ASSET_BASE = "/shell-ui/appearance/assets"


def register(app: FastAPI, context: DashboardContext) -> None:
    async def call(operation: str, argument: object = None) -> Result:
        try:
            return await context.require(APPEARANCE)(operation, argument)
        except FileNotFoundError as error:
            raise HTTPException(404, str(error)) from error
        except ValueError as error:
            raise HTTPException(422, str(error)) from error

    @app.get(BASE)
    async def read() -> Result:
        return await call("read")

    @app.put(BASE)
    async def update(settings: Settings) -> Result:
        return await call("update", settings.model_dump())

    async def upload(request: Request, operation: str, filename: str, label: str) -> Result:
        limit = 512 * 1024 if operation == "icon" else 50 * 1024 * 1024
        content = bytearray()
        async for chunk in request.stream():
            if len(content) + len(chunk) > limit:
                raise HTTPException(413, "文件超过大小限制")
            content.extend(chunk)
        return await call(operation, Upload(filename, label, bytes(content)))

    @app.post(BASE + "/brand-icon")
    async def upload_icon(request: Request, filename: str) -> Result:
        return await upload(request, "icon", filename, "")

    @app.post(BASE + "/fonts")
    async def upload_font(request: Request, filename: str, label: str = "") -> Result:
        return await upload(request, "font", filename, label)

    @app.delete(BASE + "/brand-icon")
    async def delete_icon() -> Result:
        return await call("delete-icon")

    @app.delete(BASE + "/fonts/{font_id}")
    async def delete_font(font_id: str) -> Result:
        return await call("delete-font", font_id)

    async def asset(identifier: str, version: str | None) -> Response:
        result = await call("asset", identifier)
        assert isinstance(result, tuple)
        content, media, sha = result
        if version is not None and version != sha:
            raise HTTPException(404, "资源版本已失效")
        return Response(content, media_type=media, headers={
            "Cache-Control": "public, max-age=31536000, immutable" if version else "no-cache",
            "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
        })

    @app.get(ASSET_BASE + "/brand")
    async def brand_asset(v: str | None = None) -> Response:
        return await asset("brand", v)

    @app.get(ASSET_BASE + "/font")
    async def font_asset(font_id: str, v: str | None = None) -> Response:
        return await asset(font_id, v)
