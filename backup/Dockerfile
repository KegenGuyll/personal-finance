# syntax=docker/dockerfile:1
#
# Pinned backup toolchain. Every artifact is fetched from its official release
# index and verified against a hard-coded checksum: MongoDB stopped shipping the
# database tools inside its container images (SERVER-120643) and no longer
# publishes them to apt/yum, so the tools tarball is the only supported source.
# Checksums are per-architecture because TARGETARCH selects the artifact.

FROM debian:12-slim AS fetch

ARG TARGETARCH
ARG AGE_VERSION=1.3.2
ARG RCLONE_VERSION=1.75.1
ARG SUPERCRONIC_VERSION=0.2.49
ARG MONGO_TOOLS_VERSION=100.14.0
ARG MONGOSH_VERSION=2.11.1

ARG AGE_SHA256_amd64=cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10
ARG AGE_SHA256_arm64=6b8dc4333c53a5a57c9e5834e3a48f92605d7154014cd07269ff3327db5d37f4
ARG RCLONE_MD5_amd64=ea3ea18cdfc6eacad3b9224e68dbab40
ARG RCLONE_MD5_arm64=7545fdec0bc5fa2def4bdaa3ef6af7d3
ARG SUPERCRONIC_SHA256_amd64=a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1
ARG SUPERCRONIC_SHA256_arm64=02aa0cb229ba09050cba6638059dadb9eedc2276632ea43d6a57a2f8c1629dd5
ARG MONGO_TOOLS_SHA256_amd64=4104998bda784a0cb16fc2e06d9c21645516d72c4fb481c9b103f1e0a8458fc0
ARG MONGO_TOOLS_SHA256_arm64=ef2945973b7e9c0f95d25dc607d420b0b07c486a675937ac9723b32f56ce718d
ARG MONGOSH_SHA256_amd64=3cc12c23fcd1ad8da2663316966cfff6b0b6a99e764972e9e16771168a9f4c3a
ARG MONGOSH_SHA256_arm64=d7e959963d263c0230114a5c4fa6b7562d6c70dd437641c9ae156e3ae9d969d0

# Ubuntu 22.04 builds are chosen for the database tools because they resolve
# against Debian 12's OpenSSL 3 and libcurl4.
ARG MONGO_TOOLS_UBUNTU_ARCH_amd64=x86_64
ARG MONGO_TOOLS_UBUNTU_ARCH_arm64=arm64
ARG MONGOSH_ARCH_amd64=x64
ARG MONGOSH_ARCH_arm64=arm64

# Resolve every architecture-dependent value once, into a file later layers source.
RUN set -eux; \
    eval "AGE_SHA=\${AGE_SHA256_${TARGETARCH}}"; \
    eval "RCLONE_SUM=\${RCLONE_MD5_${TARGETARCH}}"; \
    eval "SC_SHA=\${SUPERCRONIC_SHA256_${TARGETARCH}}"; \
    eval "TOOLS_SHA=\${MONGO_TOOLS_SHA256_${TARGETARCH}}"; \
    eval "TOOLS_ARCH=\${MONGO_TOOLS_UBUNTU_ARCH_${TARGETARCH}}"; \
    eval "MONGOSH_SHA=\${MONGOSH_SHA256_${TARGETARCH}}"; \
    eval "MONGOSH_ARCH=\${MONGOSH_ARCH_${TARGETARCH}}"; \
    for v in "$AGE_SHA" "$RCLONE_SUM" "$SC_SHA" "$TOOLS_SHA" "$MONGOSH_SHA"; do \
      case "$v" in ""|CHANGEME*) echo "TARGETARCH=$TARGETARCH is not supported yet (no verified checksum)" >&2; exit 1 ;; esac; \
    done; \
    { echo "AGE_SHA=$AGE_SHA"; echo "RCLONE_SUM=$RCLONE_SUM"; echo "SC_SHA=$SC_SHA"; \
      echo "TOOLS_SHA=$TOOLS_SHA"; echo "TOOLS_ARCH=$TOOLS_ARCH"; \
      echo "MONGOSH_SHA=$MONGOSH_SHA"; echo "MONGOSH_ARCH=$MONGOSH_ARCH"; } > /tmp/arch.env; \
    cat /tmp/arch.env

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl unzip; \
    rm -rf /var/lib/apt/lists/*; \
    mkdir -p /out/bin

RUN set -eux; . /tmp/arch.env; \
    curl -fsSL -o /tmp/age.tar.gz "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-${TARGETARCH}.tar.gz"; \
    echo "$AGE_SHA  /tmp/age.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/age.tar.gz -C /tmp; \
    install -m 0755 /tmp/age/age /out/bin/age; \
    rm -rf /tmp/age /tmp/age.tar.gz

RUN set -eux; . /tmp/arch.env; \
    curl -fsSL -o /tmp/rclone.zip "https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-${TARGETARCH}.zip"; \
    echo "$RCLONE_SUM  /tmp/rclone.zip" | md5sum -c -; \
    unzip -q -o /tmp/rclone.zip -d /tmp/rclone; \
    install -m 0755 "/tmp/rclone/rclone-v${RCLONE_VERSION}-linux-${TARGETARCH}/rclone" /out/bin/rclone; \
    rm -rf /tmp/rclone /tmp/rclone.zip

RUN set -eux; . /tmp/arch.env; \
    curl -fsSL -o /out/bin/supercronic "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}"; \
    echo "$SC_SHA  /out/bin/supercronic" | sha256sum -c -; \
    chmod 0755 /out/bin/supercronic

RUN set -eux; . /tmp/arch.env; \
    curl -fsSL -o /tmp/tools.tgz "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-${TOOLS_ARCH}-${MONGO_TOOLS_VERSION}.tgz"; \
    echo "$TOOLS_SHA  /tmp/tools.tgz" | sha256sum -c -; \
    tar -xzf /tmp/tools.tgz -C /tmp; \
    install -m 0755 /tmp/mongodb-database-tools-*/bin/mongodump /out/bin/mongodump; \
    install -m 0755 /tmp/mongodb-database-tools-*/bin/mongorestore /out/bin/mongorestore; \
    rm -rf /tmp/mongodb-database-tools-* /tmp/tools.tgz

RUN set -eux; . /tmp/arch.env; \
    curl -fsSL -o /tmp/mongosh.tgz "https://github.com/mongodb-js/mongosh/releases/download/v${MONGOSH_VERSION}/mongosh-${MONGOSH_VERSION}-linux-${MONGOSH_ARCH}.tgz"; \
    echo "$MONGOSH_SHA  /tmp/mongosh.tgz" | sha256sum -c -; \
    tar -xzf /tmp/mongosh.tgz -C /tmp; \
    install -m 0755 /tmp/mongosh-*/bin/mongosh /out/bin/mongosh; \
    install -m 0644 /tmp/mongosh-*/bin/mongosh_crypt_v1.so /out/bin/mongosh_crypt_v1.so; \
    rm -rf /tmp/mongosh-* /tmp/mongosh.tgz

FROM debian:12-slim AS runtime

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates tzdata libcurl4; \
    rm -rf /var/lib/apt/lists/*; \
    groupadd -g 10001 backup; \
    useradd -u 10001 -g 10001 -M -d /state -s /usr/sbin/nologin backup; \
    mkdir -p /backups /state /work /etc/backup; \
    chown -R 10001:10001 /backups /state /work

COPY --from=fetch /out/bin/ /usr/local/bin/
COPY --from=fetch /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY scripts/ /usr/local/lib/backup/
RUN chmod 0755 /usr/local/lib/backup/*.sh

# The private key is never mounted here; only the public recipient. TMPDIR is a
# writable scratch area for the manifest and the dump, which is deleted in the
# same run and never holds plaintext (tar and age are piped together).
ENV TZ=UTC \
    HOME=/state \
    TMPDIR=/work \
    MONGOSH_DISABLE_TELEMETRY=1 \
    RCLONE_CONFIG=/etc/backup/rclone.conf

USER backup
# Default to the supervised schedule; the compose file overrides this for
# one-shot runs (a drill or a deliberate restore).
ENTRYPOINT ["/usr/local/bin/supercronic", "-passthrough-logs", "/usr/local/lib/backup/crontab"]
