#!/bin/bash

# Launch each ROS 2 node in its own terminal window.
# Requires gnome-terminal (fallback: konsole, xterm).

# Pick an available terminal emulator
if command -v gnome-terminal >/dev/null 2>&1; then
    launch() {
        gnome-terminal --title="$1" -- bash -c \
            "source ~/.bashrc; source ~/create3_ws/install/setup.bash; $2; exec bash"
    }
elif command -v konsole >/dev/null 2>&1; then
    launch() {
        konsole --new-tab -p "tabtitle=$1" -e bash -c \
            "source ~/.bashrc; source ~/create3_ws/install/setup.bash; $2; exec bash"
    }
elif command -v xterm >/dev/null 2>&1; then
    launch() {
        xterm -T "$1" -e bash -c \
            "source ~/.bashrc; source ~/create3_ws/install/setup.bash; $2; exec bash" &
    }
else
    echo "No supported terminal emulator found (gnome-terminal, konsole, xterm)." >&2
    exit 1
fi

# SSL certificate paths for web camera
#CERT_DIR="$HOME/create3_ws/src/aisd_web_camera/certs"

# AnswerStack paths for rag_publisher
ANSWERSTACK_ENV="$HOME/create3_ws/src/aisd-vision-rwadud/AnswerStack/.env"
KNOWLEDGE_DIR="$HOME/create3_ws/src/aisd-vision-rwadud/knowledge"

# don't run turtlesim if you want to control the robot
#launch "turtlesim"     "ros2 run turtlesim turtlesim_node --ros-args --remap /turtle1/cmd_vel:=cmd_vel"
#launch "image_pub"     "ros2 run aisd_vision image_publisher"
#launch "web_camera"    "ros2 run aisd_web_camera web_camera --ros-args -p cert_file:=$CERT_DIR/cert.pem -p key_file:=$CERT_DIR/key.pem"
#launch "move"          "ros2 run aisd_motion move"
#launch "hands"         "ros2 run aisd_vision hands"

launch "recording_publisher" "ros2 run aisd_hearing recording_publisher"
launch "speak"               "ros2 run aisd_speaking speak"
launch "words_publisher"     "ros2 run aisd_hearing words_publisher"
launch "rag_publisher"       "ros2 run aisd_hearing rag_publisher --ros-args -p dotenv_path:=$ANSWERSTACK_ENV -p knowledge_dir:=$KNOWLEDGE_DIR"
launch "speak_client"        "ros2 run aisd_hearing speak_client"

# run script with: bash ./run.sh
