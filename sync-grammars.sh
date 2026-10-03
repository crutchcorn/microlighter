#!/bin/sh

set -eu

directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
grammars_node_dir="$directory/node_modules/@shikijs/langs-precompiled/dist"
grammars_out_dir="$directory/src/grammars"

rm -rf "$grammars_out_dir"
mkdir -p "$grammars_out_dir"
cp -R "$grammars_node_dir/"*.mjs "$grammars_out_dir/"
  