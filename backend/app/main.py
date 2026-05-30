import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import video, chat, templates
from app.services.mcp_client import mcp_client

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the MCP Client bridge connection
    asyncio.create_task(mcp_client.start())
    yield
    # Shut down the MCP Client subprocess
    await mcp_client.stop()

app = FastAPI(
    title="Montage AI API",
    description="API for automated video editing",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local dev
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles

app.include_router(video.router)
app.include_router(chat.router)
app.include_router(templates.router)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

@app.get("/")
async def root():
    return {"message": "Welcome to Montage AI API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
