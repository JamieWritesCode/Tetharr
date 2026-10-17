# Starts Tetharr as the user and group that own the rest of the media stack (PUID and PGID, Unraid's nobody:users by
# default), so the copies it makes can be renamed, upgraded and deleted by the Arrs and the media server like any other
# file. Only /config is ever re-owned, never the library.
set -e

# New files are group-writable by default, like the files the Arrs create
umask "${UMASK:-002}"

# Started as root: take ownership of Tetharr's own settings and database, then give up root for good
if [ "$(id -u)" = 0 ]; then
  chown -R "${PUID:-99}:${PGID:-100}" /config
  exec su-exec "${PUID:-99}:${PGID:-100}" "$@"
fi

# Started as some other user already (docker run --user), so run as that user
exec "$@"
