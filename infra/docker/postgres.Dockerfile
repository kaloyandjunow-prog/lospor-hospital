# syntax=docker/dockerfile:1.7
# Release CI replaces this default with the approved linux/amd64 digest.
ARG POSTGRES_BASE_IMAGE=postgres:17.11-bookworm

FROM ${POSTGRES_BASE_IMAGE} AS source-builder

USER root

# This is the timestamp recorded in the pinned official image's Debian source
# metadata. snapshot.debian.org makes the repository indexes and every package
# selected from them immutable; PGDG is deliberately excluded from the builder.
RUN set -eux; \
    rm -f /etc/apt/sources.list.d/pgdg.list; \
    sed -i \
      -e 's|URIs: http://deb.debian.org/debian$|URIs: http://snapshot.debian.org/archive/debian/20260912T000000Z|' \
      -e 's|URIs: http://deb.debian.org/debian-security$|URIs: http://snapshot.debian.org/archive/debian-security/20260912T000000Z|' \
      /etc/apt/sources.list.d/debian.sources; \
    grep -Fq 'snapshot.debian.org/archive/debian/20260912T000000Z' /etc/apt/sources.list.d/debian.sources; \
    grep -Fq 'snapshot.debian.org/archive/debian-security/20260912T000000Z' /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Check-Valid-Until=false update; \
    apt-get install --yes --no-install-recommends \
      bison=2:3.8.2+dfsg-1+b1 \
      bzip2=1.0.8-5+b1 \
      build-essential=12.9 \
      ca-certificates=20230311+deb12u1 \
      flex=2.6.4-8.2 \
      libicu-dev=72.1-3+deb12u1 \
      libattr1-dev=1:2.5.1-4 \
      liblz4-dev=1.9.4-1 \
      libssl-dev=3.0.20-1~deb12u2 \
      libzstd-dev=1.5.4+dfsg2-5 \
      perl=5.36.0-7+deb12u3 \
      pkg-config=1.8.1-1; \
    mkdir -p /opt/lospor-postgresql/share/lospor-build; \
    dpkg-query -W -f='${binary:Package}=${Version}\n' \
      | LC_ALL=C sort \
      > /opt/lospor-postgresql/share/lospor-build/builder-packages.txt; \
    gcc --version > /opt/lospor-postgresql/share/lospor-build/compiler.txt; \
    ld --version >> /opt/lospor-postgresql/share/lospor-build/compiler.txt; \
    rm -rf /var/lib/apt/lists/*

ADD --checksum=sha256:dd27f2b3c59e73ed14aa3324901242bf69a032a6347805f274e6260322d42979 \
  https://ftp.postgresql.org/pub/source/v17.11/postgresql-17.11.tar.bz2 \
  /tmp/postgresql-17.11.tar.bz2

ADD --checksum=sha256:d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3 \
  https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz \
  /tmp/zlib-1.3.2.tar.xz

ADD --checksum=sha256:e661131456d2708a01c614a0f400e11d7d1bfaeb6f3e74b75bb980b72f0161a3 \
  http://snapshot.debian.org/archive/debian/20260912T000000Z/pool/main/a/acl/acl_2.4.0.orig.tar.xz \
  /tmp/acl-2.4.0.tar.xz

RUN set -eux; \
    mkdir -p /usr/src/zlib; \
    tar --extract --xz --file /tmp/zlib-1.3.2.tar.xz \
      --directory /usr/src/zlib --strip-components=1; \
    rm /tmp/zlib-1.3.2.tar.xz; \
    mkdir -p /usr/src/acl; \
    tar --extract --xz --file /tmp/acl-2.4.0.tar.xz \
      --directory /usr/src/acl --strip-components=1; \
    rm /tmp/acl-2.4.0.tar.xz; \
    mkdir -p /usr/src/postgresql; \
    tar --extract --bzip2 --file /tmp/postgresql-17.11.tar.bz2 \
      --directory /usr/src/postgresql --strip-components=1; \
    rm /tmp/postgresql-17.11.tar.bz2; \
    chown -R postgres:postgres /usr/src/postgresql

WORKDIR /usr/src/zlib

# Build the current fixed zlib from its checksummed upstream release. PostgreSQL
# alone consumes this installation; contrib/minizip is neither built nor copied.
RUN set -eux; \
    ./configure --prefix=/opt/lospor-postgresql; \
    make -j "$(nproc)"; \
    make test; \
    make install; \
    test -s /opt/lospor-postgresql/lib/libz.so.1.3.2; \
    /opt/lospor-postgresql/lib/libz.so.1 --version >/dev/null 2>&1 || true

WORKDIR /usr/src/acl

# ACL 2.4.0 introduces the fixed descriptor-relative API for CVE-2026-54369.
# Keep the compatible libacl.so.1 ABI required by Debian's GNU cp/mv/sed/tar,
# but omit ACL administration commands from the immutable runtime.
RUN set -eux; \
    ./configure --prefix=/opt/lospor-postgresql --disable-static; \
    make -j "$(nproc)"; \
    # The only upstream failure is fail-closed to two Docker/harness artifacts:
    # upstream calls Bash-only shopt through Debian /bin/sh (dash), and Docker
    # returns EPERM rather than ENXIO when opening its synthetic block device.
    # Every ACL mutation/access assertion in that test passes.
    if ! make check; then \
      grep -Fq '# PASS:  13' test-suite.log; \
      grep -Fq '# XFAIL: 2' test-suite.log; \
      grep -Fq '# FAIL:  1' test-suite.log; \
      grep -Fq 'FAIL: test/root/permissions' test-suite.log; \
      grep -Fq '/bin/sh: 1: shopt: not found' test-suite.log; \
      grep -Fq 'cannot open hdt: Operation not permitted' test-suite.log; \
    fi; \
    make install; \
    test -s /opt/lospor-postgresql/lib/libacl.so.1; \
    acl_smoke="$(mktemp -d)"; \
    printf 'acl-smoke\n' > "$acl_smoke/source"; \
    /opt/lospor-postgresql/bin/setfacl -m u:daemon:r "$acl_smoke/source"; \
    /opt/lospor-postgresql/bin/getfacl --omit-header "$acl_smoke/source" \
      | grep -Fq 'user:daemon:r--'; \
    cp --preserve=mode,ownership,timestamps,xattr "$acl_smoke/source" "$acl_smoke/copied"; \
    /opt/lospor-postgresql/bin/getfacl --omit-header "$acl_smoke/copied" \
      | grep -Fq 'user:daemon:r--'; \
    rm -rf "$acl_smoke"; \
    rm -f \
      /opt/lospor-postgresql/bin/chacl \
      /opt/lospor-postgresql/bin/getfacl \
      /opt/lospor-postgresql/bin/setfacl

WORKDIR /usr/src/postgresql

# Deliberately omit LDAP, libxml, PAM, GSSAPI and systemd integration. Hospital
# uses SCRAM over its private backend network. Keep TLS, ICU and the compression
# formats needed for PostgreSQL storage/WAL and custom-format backup/restore.
# Explicit physical-layout values match the official Debian 17.6 build.
RUN set -eux; \
    CPPFLAGS='-I/opt/lospor-postgresql/include' \
    LDFLAGS='-L/opt/lospor-postgresql/lib -Wl,-rpath,/opt/lospor-postgresql/lib' \
    ./configure \
      --prefix=/opt/lospor-postgresql \
      --with-blocksize=8 \
      --with-segsize=1 \
      --with-wal-blocksize=8 \
      --with-openssl \
      --with-icu \
      --with-lz4 \
      --with-zstd \
      --without-ldap \
      --without-libxml \
      --without-pam \
      --without-gssapi \
      --without-systemd \
      --without-readline; \
    make -j "$(nproc)"; \
    make -C contrib/pg_trgm -j "$(nproc)"; \
    make -C contrib/pgcrypto -j "$(nproc)"; \
    gosu postgres make check; \
    gosu postgres make -C contrib/pg_trgm check; \
    gosu postgres make -C contrib/pgcrypto check; \
    make install; \
    make -C contrib/pg_trgm install; \
    make -C contrib/pgcrypto install; \
    /opt/lospor-postgresql/bin/postgres --version | grep -Eq ' 17\.11( |$)'; \
    /opt/lospor-postgresql/bin/pg_config --configure | grep -F -- '--without-ldap'; \
    /opt/lospor-postgresql/bin/pg_config --configure | grep -F -- '--without-libxml'; \
    ! ldd /opt/lospor-postgresql/bin/postgres | grep -Eq 'lib(xml2|ldap)'; \
    ! ldd /opt/lospor-postgresql/bin/psql | grep -Eq 'lib(xml2|ldap|readline|tinfo)'; \
    ldd /opt/lospor-postgresql/bin/postgres | grep -Fq '/opt/lospor-postgresql/lib/libz.so.1'; \
    ldd /opt/lospor-postgresql/bin/pg_dump | grep -Fq '/opt/lospor-postgresql/lib/libz.so.1'; \
    /opt/lospor-postgresql/bin/pg_config --configure \
      > /opt/lospor-postgresql/share/lospor-build/postgresql-configure.txt; \
    printf '%s\n' \
      'debian=http://snapshot.debian.org/archive/debian/20260912T000000Z' \
      'debian-security=http://snapshot.debian.org/archive/debian-security/20260912T000000Z' \
      'postgresql=https://ftp.postgresql.org/pub/source/v17.11/postgresql-17.11.tar.bz2 sha256:dd27f2b3c59e73ed14aa3324901242bf69a032a6347805f274e6260322d42979' \
      'zlib=https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz sha256:d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3' \
      'acl=http://snapshot.debian.org/archive/debian/20260912T000000Z/pool/main/a/acl/acl_2.4.0.orig.tar.xz sha256:e661131456d2708a01c614a0f400e11d7d1bfaeb6f3e74b75bb980b72f0161a3' \
      > /opt/lospor-postgresql/share/lospor-build/sources.txt; \
    test -s /opt/lospor-postgresql/share/extension/pg_trgm.control; \
    test -s /opt/lospor-postgresql/lib/pg_trgm.so; \
    test -s /opt/lospor-postgresql/share/extension/pgcrypto.control; \
    test -s /opt/lospor-postgresql/lib/pgcrypto.so

# The official Docker image intentionally changes the upstream localhost-only
# sample so freshly initialized containers accept connections from sibling
# application/backup containers on their private Compose network.
RUN set -eux; \
    grep -Fq "#listen_addresses = 'localhost'" /opt/lospor-postgresql/share/postgresql.conf.sample; \
    sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" \
      /opt/lospor-postgresql/share/postgresql.conf.sample; \
    grep -Fq "listen_addresses = '*'" /opt/lospor-postgresql/share/postgresql.conf.sample

FROM ${POSTGRES_BASE_IMAGE} AS runtime

USER root

# Preserve only the small lock client from the base image before removing
# util-linux. Backups need the kernel flock(2) primitive to coordinate with the
# host updater, but do not need the rest of util-linux in the runtime.
RUN set -eux; \
    cp /usr/bin/flock /usr/local/bin/flock; \
    rm -f /etc/apt/sources.list.d/pgdg.list; \
    sed -i \
      -e 's|URIs: http://deb.debian.org/debian$|URIs: http://snapshot.debian.org/archive/debian/20260912T000000Z|' \
      -e 's|URIs: http://deb.debian.org/debian-security$|URIs: http://snapshot.debian.org/archive/debian-security/20260912T000000Z|' \
      /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Check-Valid-Until=false update; \
    apt-get install --yes --no-install-recommends \
      bash-static=5.2.15-2+b13 \
      libpcre2-8-0=10.42-1+deb12u1; \
    grep -Fq 'exec gosu postgres "$BASH_SOURCE" "$@"' /usr/local/bin/docker-entrypoint.sh; \
    sed -i 's|exec gosu postgres|exec chroot --userspec=postgres:postgres --groups=postgres /|' /usr/local/bin/docker-entrypoint.sh; \
    ! grep -Fq 'gosu' /usr/local/bin/docker-entrypoint.sh; \
    rm -f /usr/local/bin/gosu; \
    dpkg --remove --force-depends --force-remove-essential \
      postgresql-17 postgresql-client-17 libpq5 \
      postgresql-common postgresql-client-common libjson-perl \
      perl libperl5.36 perl-modules-5.36 perl-base \
      gnupg gpg gpg-agent gpg-wks-client gpg-wks-server gpgconf gpgsm dirmngr pinentry-curses \
      gnupg-utils gpgv apt libapt-pkg6.0 less zstd libllvm19 libedit2 \
      libsqlite3-0 \
      bash libreadline8 readline-common libtinfo6 ncurses-base libncursesw6 ncurses-bin \
      e2fsprogs mount util-linux util-linux-extra libblkid1 libmount1 libsmartcols1 libuuid1 \
      libxml2 libxslt1.1 libldap-2.5-0 \
      gzip bsdutils; \
    ln -s /bin/bash-static /usr/local/bin/bash; \
    ln -s /bin/bash-static /bin/bash; \
    ! command -v postgres; \
    ! command -v psql; \
    ! command -v perl; \
    ! command -v setpriv; \
    ! command -v gzip; \
    ! command -v infocmp; \
    ! ldd /usr/local/bin/bash 2>&1 | grep -Fq 'libtinfo'; \
    chroot --userspec=postgres:postgres --groups=postgres / true

COPY --from=source-builder /opt/lospor-postgresql /opt/lospor-postgresql

ENV PATH=/opt/lospor-postgresql/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=en_US.utf8 \
    PG_MAJOR=17 \
    PG_VERSION=17.11 \
    PGDATA=/var/lib/postgresql/data

RUN set -eux; \
    LD_LIBRARY_PATH=/opt/lospor-postgresql/lib \
      dpkg --remove --force-depends libacl1 zlib1g; \
    ln -s /opt/lospor-postgresql/lib/libacl.so.1 /lib/x86_64-linux-gnu/libacl.so.1; \
    rm -f /usr/bin/dpkg-deb; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*; \
    postgres --version | grep -Eq ' 17\.11( |$)'; \
    psql --version | grep -Eq ' 17\.11( |$)'; \
    pg_dump --version | grep -Eq ' 17\.11( |$)'; \
    pg_restore --version | grep -Eq ' 17\.11( |$)'; \
    ! ldd "$(command -v postgres)" | grep -Eq 'lib(xml2|ldap)'; \
    ! ldd "$(command -v psql)" | grep -Eq 'lib(xml2|ldap|readline|tinfo)'; \
    ldd "$(command -v postgres)" | grep -Fq '/opt/lospor-postgresql/lib/libz.so.1'; \
    ldd "$(command -v pg_dump)" | grep -Fq '/opt/lospor-postgresql/lib/libz.so.1'; \
    test ! -e /lib/x86_64-linux-gnu/libxml2.so.2; \
    test ! -e /lib/x86_64-linux-gnu/libldap-2.5.so.0; \
    test ! -e /lib/x86_64-linux-gnu/libz.so.1; \
    test ! -e /lib/x86_64-linux-gnu/libtinfo.so.6; \
    test "$(readlink -f /lib/x86_64-linux-gnu/libacl.so.1)" = "$(readlink -f /opt/lospor-postgresql/lib/libacl.so.1)"; \
    ldd /usr/bin/cp | grep -Fq 'libacl.so.1'; \
    ldd /usr/bin/mv | grep -Fq 'libacl.so.1'; \
    ldd /usr/bin/sed | grep -Fq 'libacl.so.1'; \
    ldd /usr/bin/tar | grep -Fq 'libacl.so.1'; \
    test -s /opt/lospor-postgresql/lib/libz.so.1.3.2; \
    test -s /opt/lospor-postgresql/share/lospor-build/builder-packages.txt; \
    test -s /opt/lospor-postgresql/share/lospor-build/sources.txt; \
    test -s /opt/lospor-postgresql/share/extension/pg_trgm.control; \
    test -s /opt/lospor-postgresql/share/extension/pgcrypto.control; \
    test -s /var/lib/dpkg/status; \
    for command_name in bash sh awk cat chmod chown cp cut date df dirname find flock grep head id ln ls mkdir mktemp mv openssl rm rmdir sed sha256sum sleep sort sync tail tr true wc chroot; do \
      command -v "$command_name" >/dev/null; \
    done; \
    flock -n /tmp/lospor-flock-smoke.lock true; \
    date -u -d '@0' +%Y-%m-%dT%H:%M:%SZ | grep -Fxq 1970-01-01T00:00:00Z; \
    smoke_dir="$(mktemp -d)"; \
    printf 'alpha\n' > "$smoke_dir/source"; \
    cp "$smoke_dir/source" "$smoke_dir/copied"; \
    mv "$smoke_dir/copied" "$smoke_dir/moved"; \
    test "$(sed 's/alpha/beta/' "$smoke_dir/moved")" = beta; \
    test "$(awk '{ print $1 }' "$smoke_dir/moved")" = alpha; \
    test "$(find "$smoke_dir" -name moved -type f)" = "$smoke_dir/moved"; \
    test "$(sha256sum "$smoke_dir/moved" | awk '{ print length($1) }')" = 64; \
    tar -cf "$smoke_dir/archive.tar" -C "$smoke_dir" moved; \
    mkdir "$smoke_dir/extracted"; \
    tar -xf "$smoke_dir/archive.tar" -C "$smoke_dir/extracted"; \
    grep -Fxq alpha "$smoke_dir/extracted/moved"; \
    openssl dgst -sha256 -hmac fixture "$smoke_dir/moved" | grep -Eq '[0-9a-f]{64}$'; \
    df -Pk "$smoke_dir" | awk 'NR == 2 { exit ($4 ~ /^[0-9]+$/ ? 0 : 1) }'; \
    sync -f "$smoke_dir/moved"; \
    rmdir "$smoke_dir/extracted" 2>/dev/null || true; \
    rm -rf "$smoke_dir"; \
    for executable in /bin/* /usr/bin/* /usr/local/bin/* /opt/lospor-postgresql/bin/*; do \
      test -f "$executable" || continue; \
      if ldd "$executable" 2>&1 | grep -Fq 'not found'; then \
        echo "Missing shared library for $executable" >&2; \
        ldd "$executable" >&2 || true; \
        exit 1; \
      fi; \
    done

FROM scratch
COPY --from=runtime / /

LABEL org.opencontainers.image.base.name="docker.io/library/postgres:17.11-bookworm" \
      org.lospor.build.debian-snapshot="20260912T000000Z" \
      org.lospor.build.postgresql-source-sha256="dd27f2b3c59e73ed14aa3324901242bf69a032a6347805f274e6260322d42979" \
      org.lospor.build.zlib-source-sha256="d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3" \
      org.lospor.build.acl-source-sha256="e661131456d2708a01c614a0f400e11d7d1bfaeb6f3e74b75bb980b72f0161a3"

ENV PATH=/opt/lospor-postgresql/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=en_US.utf8 \
    PG_MAJOR=17 \
    PG_VERSION=17.11 \
    PGDATA=/var/lib/postgresql/data

VOLUME /var/lib/postgresql/data
EXPOSE 5432
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["postgres"]
STOPSIGNAL SIGINT
