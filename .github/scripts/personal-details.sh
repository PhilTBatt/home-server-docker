#!/bin/bash

if [ -z "$PERSONAL_WORDS" ]; then
  echo "The PERSONAL_WORDS secret isn't set, so there's nothing to check against." >&2
  exit 1
fi

words=$(mktemp)
printf '%s\n' "$PERSONAL_WORDS" | tr -d '\r' | grep -v '^[[:space:]]*$' > "$words"
if [ ! -s "$words" ]; then
  echo "The PERSONAL_WORDS secret has no words in it." >&2
  rm -f "$words"
  exit 1
fi

files=$(git grep -l -I -i -F -f "$words")
status=$?
rm -f "$words"

if [ $status -gt 1 ]; then
  echo "The check itself failed, so nothing was checked." >&2
  exit 1
fi

if [ -n "$files" ]; then
  echo "Personal details found in these files. The words aren't shown, because this log is public."
  printf '%s\n' "$files" | sed 's/^/  /'
  echo "To see them on your own machine: git grep -n -i -F -f <a file with your words, one per line>"
  exit 1
fi

echo "No personal details found in the tracked files."