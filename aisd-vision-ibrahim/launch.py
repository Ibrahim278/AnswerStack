import os

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_DOTENV = os.path.join(_THIS_DIR, "AnswerStack", ".env")
_DEFAULT_KNOWLEDGE = os.path.join(_THIS_DIR, "knowledge")


def generate_launch_description():
    dotenv_arg = DeclareLaunchArgument(
        "dotenv_path",
        default_value=_DEFAULT_DOTENV,
        description="Path to the AnswerStack .env file",
    )
    knowledge_arg = DeclareLaunchArgument(
        "knowledge_dir",
        default_value=_DEFAULT_KNOWLEDGE,
        description="Path to the knowledge documents directory",
    )

    return LaunchDescription([
        dotenv_arg,
        knowledge_arg,

        Node(
            package="aisd_speaking",
            executable="speak",
            name="speak_service",
        ),
        Node(
            package="aisd_hearing",
            executable="recording_publisher",
            name="recording_publisher",
        ),
        Node(
            package="aisd_hearing",
            executable="words_publisher",
            name="words_publisher",
        ),
        Node(
            package="aisd_hearing",
            executable="rag_publisher",
            name="rag_publisher",
            parameters=[{
                "dotenv_path": LaunchConfiguration("dotenv_path"),
                "knowledge_dir": LaunchConfiguration("knowledge_dir"),
            }],
        ),
        Node(
            package="aisd_hearing",
            executable="speak_client",
            name="speak_client",
        ),
    ])
