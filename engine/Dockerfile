FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
HEALTHCHECK --interval=5s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8200/health')"
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8200"]
