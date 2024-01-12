#!/bin/bash

input_pdf="notbad.pdf"
output_directory="output_txt"

# Create output directory if it doesn't exist
mkdir -p "$output_directory"

# Convert PDF to text
pdftotext "$input_pdf" "$output_directory/full_text.txt"

# Split text file into parts based on pages and rename
cd "$output_directory"
csplit -s -z full_text.txt '/^$/' {*}
counter=1

for file in xx*; do
  mv "$file" "$(printf "part_%04d.txt" "$counter")"
  ((counter++))
done

echo "Conversion completed. Text files saved in $output_directory."
