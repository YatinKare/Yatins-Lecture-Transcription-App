#!/bin/bash

# Navigate to the resources directory
cd resources || { echo "Directory 'resources' not found! Exiting."; exit 1; }

# Loop through each subdirectory in the resources directory
for dir in */; do
    # Check if the current item is a directory (to handle any non-directory files)
    if [ -d "$dir" ]; then
        # Check if the directory contains a 'temp' subdirectory
        if [ -d "$dir/temp" ]; then
            echo "Found 'temp' directory in $dir. Deleting..."
            rm -rf "$dir/temp"  # Remove the 'temp' directory and its contents
            echo "'temp' directory in $dir deleted successfully."
        else
            echo "No 'temp' directory in $dir."
        fi
    fi
done

echo "Build process finished"
echo ""