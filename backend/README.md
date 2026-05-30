# Synapix AI studio — Backend

## Requirements
- Python 3.11+
- FFmpeg (installed via system package manager)

## Local Development

```bash
# Create venv
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill env variables
cp .env.example .env

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Docker (Production)

```bash
docker build -t synapix-backend .
docker run -p 8000:8000 --env-file .env synapix-backend
```

## Environment Variables

See `.env.example` for required variables.
