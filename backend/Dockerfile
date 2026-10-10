FROM python:3.12-slim

# tesseract is "the thing images need": the scan-a-question feature and image uploads
# call it, and it is precisely what a serverless host cannot provide. Having it here is
# the main reason to run this stack instead of deploying to Vercel.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# `app/` must be present before `pip install .` — the wheel is built from it
# (hatchling `packages = ["app"]`), so installing first fails to find the package.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

# Raw uploads land here. Compose mounts a volume over it so they survive a rebuild;
# the parsed text and its chunks live in the database either way.
RUN mkdir -p /app/uploads
ENV UPLOAD_DIR=/app/uploads
VOLUME ["/app/uploads"]

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
