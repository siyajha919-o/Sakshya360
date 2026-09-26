FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# CPU-only PyTorch keeps the image small; the rest from PyPI.
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
 && pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY model ./model
RUN python download_models.py
RUN useradd -r -u 10001 ml && chown -R ml /app
USER ml
EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
