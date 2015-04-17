#!/bin/bash
for ((i = 1; i <= $1; i++)); do
    screen -dmS wwcl node --stack-size=1000000000 --max_old_space_size=1741  wwclsandbox.js
done
