"""Dashboard composition for Shell-owned services."""
from fastapi import FastAPI
from agent.plugin_composition import DashboardContext
from . import appearance, inventory

inject = (*inventory.inject, *appearance.inject)


def register(app: FastAPI, context: DashboardContext) -> None:
    inventory.register(app, context)
    appearance.register(app, context)
