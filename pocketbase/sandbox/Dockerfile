# Isolated Python runtime for the server-side sandbox. Built by
# pocketbase/sandbox-exec.ts; the container is started with a read-only
# root, no capabilities, a non-root user, and a dedicated Docker network
# whose egress is filtered by pocketbase/sandbox/docker-network.sh.
# Override on hosts that need a registry mirror:
#   SANDBOX_BASE_IMAGE=docker.m.daocloud.io/library/python:3.12-slim
ARG PYTHON_IMAGE=python:3.12-slim
FROM ${PYTHON_IMAGE}

COPY runner.py /runner.py
RUN chmod 644 /runner.py

USER nobody
WORKDIR /tmp
ENTRYPOINT ["python3", "-I", "-B", "/runner.py"]
