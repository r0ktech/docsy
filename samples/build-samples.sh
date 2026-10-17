#!/bin/sh
# Rebuilds the binary sample documents from their text sources (macOS: uses cupsfilter and textutil).
set -e
cd "$(dirname "$0")"
fold -s -w 76 source/apartment-lease.txt > /tmp/docsy-lease.txt
cupsfilter -o cpi=12 -o lpi=7 /tmp/docsy-lease.txt > sample-apartment-lease.pdf 2>/dev/null
textutil -convert docx source/product-launch-brief.txt -output sample-product-launch-brief.docx
echo "Built sample-apartment-lease.pdf and sample-product-launch-brief.docx"
