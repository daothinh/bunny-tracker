#!/bin/sh
set -eu

load_secret() {
  var_name="$1"
  file_var_name="${var_name}_FILE"

  eval "file_path=\${$file_var_name:-}"
  eval "current_value=\${$var_name:-}"

  if [ -n "$current_value" ] && [ -n "$file_path" ]; then
    echo >&2 "Both $var_name and $file_var_name are set"
    exit 1
  fi

  if [ -n "$file_path" ]; then
    if [ ! -f "$file_path" ]; then
      echo >&2 "Secret file for $var_name was not found: $file_path"
      exit 1
    fi

    current_value="$(cat "$file_path")"
  fi

  if [ -n "${current_value:-}" ]; then
    export "$var_name=$current_value"
  fi

  unset "$file_var_name"
}

load_secret DATABASE_URL
load_secret MANAGEMENT_KEY
load_secret SESSION_SECRET
load_secret GITHUB_TOKEN

exec "$@"
